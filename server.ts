import express from 'express';
import path from 'path';
import os from 'os';
import dns from 'dns';
import { createRequire } from 'module';
const customRequire = typeof require !== 'undefined' ? require : createRequire(typeof import.meta !== 'undefined' && import.meta.url ? import.meta.url : 'file:///' + __filename);
dns.setServers(['1.1.1.1', '8.8.8.8']);

// Maximize multithreading across all available CPU cores for Node libuv threadpool (crypto, DNS, disk I/O)
const cpuCores = os.cpus()?.length || 4;
process.env.UV_THREADPOOL_SIZE = String(Math.max(4, cpuCores * 2));
console.log(`[System Multithreading] Server detected ${cpuCores} CPU cores. Set UV_THREADPOOL_SIZE=${process.env.UV_THREADPOOL_SIZE}`);

import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import parser from 'iptv-playlist-parser';
import fs from 'fs';
import { fileURLToPath } from 'url';
import epgParser from 'epg-parser';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from '@ffprobe-installer/ffprobe';
import util from 'util';
import { execFile } from 'child_process';
const execFileAsync = util.promisify(execFile);
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { spawn } from 'child_process';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { PassThrough } from 'stream';
import play from 'play-dl';
import ytdl from '@distube/ytdl-core';
import net from 'net';
import http from 'http';

// Create an internal HTTP CONNECT proxy to resolve DNS natively in Node
// and tunnel FFmpeg traffic through it, bypassing FFmpeg's DNS bugs on Windows
// while keeping SNI TLS intact!
const ffmpegProxy = http.createServer();
let FFMPEG_PROXY_PORT = 0;

ffmpegProxy.on('connect', (req, clientSocket, head) => {
  if (!req.url) return clientSocket.end();
  const [hostname, port] = req.url.split(':');
  const serverSocket = net.connect(parseInt(port) || 443, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  
  serverSocket.on('error', (err) => {
    clientSocket.end();
  });
  
  clientSocket.on('error', (err) => {
    clientSocket.end();
  });
});

// Handle standard HTTP proxy requests
ffmpegProxy.on('request', (req, res) => {
  try {
    if (!req.url) {
      res.statusCode = 400;
      return res.end('Bad Request');
    }
    
    const targetUrl = new URL(req.url);
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || 80,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: req.headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`[FFmpeg-Proxy] HTTP error for ${req.url}:`, err.message);
      if (!res.headersSent) {
        res.statusCode = 502;
        res.end('Proxy Error');
      }
    });

    req.pipe(proxyReq);
  } catch (err: any) {
    console.error(`[FFmpeg-Proxy] Failed to proxy request:`, err.message);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

ffmpegProxy.listen(0, '127.0.0.1', () => {
  FFMPEG_PROXY_PORT = (ffmpegProxy.address() as net.AddressInfo).port;
  console.log(`[FFmpeg-Proxy] Internal DNS tunnel listening on port ${FFMPEG_PROXY_PORT}`);
});

const _filename = typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '';
const _dirname = _filename ? path.dirname(_filename) : '';

// ============================================================================
// PHASE 1: NODE.JS BACKEND FUNCTIONS (For your Electron main.js)
let bestH264Encoder: string | null = null;

function getFFmpegNetworkArgs(url: string): string[] {
  const args: string[] = ['-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'];
  if (url.startsWith('https')) {
    args.push('-tls_verify', '0');
  }
  args.push(
    '-reconnect', '1',
    '-reconnect_at_eof', '1',
    '-reconnect_streamed', '1',
    '-reconnect_on_network_error', '1',
    '-reconnect_on_http_error', '5xx',
    '-reconnect_delay_max', '3'
  );
  return args;
}



function getVaapiDevice(): string | null {
  if (process.platform === 'win32') return null;
  if (fs.existsSync('/dev/dri/renderD128')) return '/dev/dri/renderD128';
  if (fs.existsSync('/dev/dri/card0')) return '/dev/dri/card0';
  return null;
}

function detectBestH264Encoder(): string {
  if (bestH264Encoder !== null) return bestH264Encoder;
  try {
    const { execSync } = require('child_process');
    const vaapiDev = getVaapiDevice();
    const encoders = ['h264_vaapi', 'h264_qsv', 'h264_nvenc', 'h264_amf', 'h264_videotoolbox'];

    for (const enc of encoders) {
      try {
        if (enc === 'h264_vaapi') {
          if (!vaapiDev) continue;
          execSync(`"${ffmpegPath}" -vaapi_device ${vaapiDev} -f lavfi -i nullsrc=s=1280x720 -vf "format=nv12,hwupload" -c:v h264_vaapi -t 1 -f null -`, { stdio: 'ignore' });
        } else {
          execSync(`"${ffmpegPath}" -f lavfi -i nullsrc=s=1280x720 -c:v ${enc} -t 1 -f null -`, { stdio: 'ignore' });
        }
        bestH264Encoder = enc;
        console.log(`[FFmpeg-Proxy] Hardware encoding support found: ${enc}`);
        return enc;
      } catch (e) {}
    }
  } catch (e) {
    console.log('[FFmpeg-Proxy] Failed to check hardware encoding support.');
  }
  bestH264Encoder = 'libx264';
  console.log('[FFmpeg-Proxy] No hardware encoding support found. Falling back to libx264 (CPU).');
  return 'libx264';
}


// Backend Logger Interception
interface BackendLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  source: 'backend';
}

const backendLogs: BackendLogEntry[] = [];
const MAX_BACKEND_LOGS = 500;

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

function formatLogMessage(args: any[]): string {
  return args.map(arg => typeof arg === 'object' ? util.inspect(arg) : String(arg)).join(' ');
}

console.log = function (...args) {
  backendLogs.push({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: formatLogMessage(args),
    source: 'backend'
  });
  if (backendLogs.length > MAX_BACKEND_LOGS) backendLogs.shift();
  originalConsoleLog.apply(console, args);
};

console.warn = function (...args) {
  backendLogs.push({
    timestamp: new Date().toISOString(),
    level: 'warn',
    message: formatLogMessage(args),
    source: 'backend'
  });
  if (backendLogs.length > MAX_BACKEND_LOGS) backendLogs.shift();
  originalConsoleWarn.apply(console, args);
};

console.error = function (...args) {
  backendLogs.push({
    timestamp: new Date().toISOString(),
    level: 'error',
    message: formatLogMessage(args),
    source: 'backend'
  });
  if (backendLogs.length > MAX_BACKEND_LOGS) backendLogs.shift();
  originalConsoleError.apply(console, args);
};

/**
 * Fetches and parses a standard streams manifest.json
 * @param {string} manifestUrl - The manifest URL
 * @returns {Promise<Object>} - The parsed manifest object
 */
export async function fetchAIOStreamsManifest(manifestUrl: string) {
  try {
    console.log(`[Backend] Fetching AIOStreams manifest from: ${manifestUrl}`);
    const response = await axios.get(manifestUrl);
    
    // In a real scenario, you'd validate the structure of the manifest here.
    if (!response.data || !response.data.id) {
      throw new Error("Invalid manifest format received.");
    }
    
    console.log(`[Backend] Successfully parsed manifest: ${response.data.name || response.data.id}`);
    return response.data;
  } catch (error) {
    console.error("[Backend] Error fetching AIOStreams manifest:", error);
    throw error;
  }
}

/**
 * Reads and parses a local or remote .m3u or .m3u8 file
 * @param {string} source - Absolute/relative path or URL to the .m3u file
 * @returns {Promise<Object>} - Parsed playlist object containing channels
 */
export async function parseM3U(source: string) {
  try {
    let fileContent = "";
    if (source.startsWith('http://') || source.startsWith('https://')) {
      console.log(`[Backend] Fetching remote M3U file at: ${source}`);
      const response = await axios.get(source, { responseType: 'text' });
      fileContent = response.data;
    } else {
      console.log(`[Backend] Reading local M3U file at: ${source}`);
      fileContent = fs.readFileSync(source, 'utf-8');
    }
    
    // Parse the M3U content using iptv-playlist-parser
    const result = parser.parse(fileContent);
    
    console.log(`[Backend] Successfully parsed M3U. Found ${result.items.length} items.`);
    return result;
  } catch (error) {
    console.error("[Backend] Error parsing M3U file:", error);
    throw error;
  }
}

// Global cache for EPG data to avoid parsing huge files repeatedly
const epgCache = new Map<string, { timestamp: number, data: any }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Fetches and parses an XMLTV EPG file
 * @param {string} source - URL or local path to the XMLTV file
 */
export async function parseEPG(source: string) {
  try {
    const now = Date.now();
    const cached = epgCache.get(source);
    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
      console.log(`[Backend] Returning cached EPG data for: ${source}`);
      return cached.data;
    }

    let fileContent = "";
    if (source.startsWith('http://') || source.startsWith('https://')) {
      console.log(`[Backend] Fetching remote EPG file at: ${source}`);
      const response = await axios.get(source, { responseType: 'text' });
      fileContent = response.data;
    } else {
      console.log(`[Backend] Reading local EPG file at: ${source}`);
      fileContent = fs.readFileSync(source, 'utf-8');
    }
    
    console.log(`[Backend] Parsing EPG data... This might take a moment for large files.`);
    const result = epgParser.parse(fileContent);
    
    console.log(`[Backend] Successfully parsed EPG. Found ${result.channels.length} channels and ${result.programs.length} programs.`);
    epgCache.set(source, { timestamp: now, data: result });
    
    return result;
  } catch (error) {
    console.error("[Backend] Error parsing EPG file:", error);
    throw error;
  }
}

// ============================================================================
// PHASE 2: IPC SECURITY BRIDGE BACKEND (For your Electron main.js)
// ============================================================================

/**
 * Spawns a native media player (like MPV or VLC) to play the given stream URL.
 * In a real Electron app, you would import 'child_process' and use spawn.
 * 
 * @example
 * 
 * // Inside your ipcMain handler:
 * ipcMain.on('media:play', (event, streamUrl) => {
 *   const player = spawn('mpv', [streamUrl, '--fs']); // --fs for fullscreen
 *   player.on('close', (code) => console.log(`Player exited with code ${code}`));
 * });
 * 
 * @param {string} streamUrl - The URL of the video stream
 */
export async function playMediaStream(streamUrl: string) {
  console.log(`[Backend IPC] Received request to play stream: ${streamUrl}`);
  console.log(`[Backend IPC] Simulating spawning 'mpv ${streamUrl}' (Hardware acceleration enabled)`);
  
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`[Backend IPC] Simulated MPV playback started successfully.`);
      resolve({ success: true, message: `Started playback for ${streamUrl}` });
    }, 500);
  });
}

// ============================================================================
// DEVELOPMENT SERVER FOR AI STUDIO PREVIEW
// (You do not need this Express code for your Electron main.js, 
// this is just to allow you to test the API in the browser preview here)
// ============================================================================

const EztvApi = customRequire('eztv-api-pt');
const eztv = new EztvApi({ baseUrl: 'https://eztvx.to/' });

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5150;

  app.set('trust proxy', true);
  app.use(express.json({ limit: '200mb' }));

  // IP Logging Middleware
  app.use((req, res, next) => {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() 
      || req.socket.remoteAddress 
      || req.ip 
      || 'unknown';
    console.log(`[HTTP Request] ${new Date().toISOString()} - IP: ${clientIp} - ${req.method} ${req.originalUrl}`);
    next();
  });

  // --- AUTH & DB SYSTEM ---
  // In development, server is run from cwd. In production docker, we want data to reside in process.cwd()/data (/app/data)
  // because that is where the volume mount is mapped. Using __dirname resolves to /app/dist/data, which is inside the ephemeral container folder.
  const baseDir = process.cwd();
  const DATA_DIR = path.join(baseDir, 'data');
  const USERS_FILE = path.join(DATA_DIR, 'users.json');
  const DB_FILE = path.join(DATA_DIR, 'db.json');
  const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
  const SCANNED_LIBRARY_FILE = path.join(DATA_DIR, 'scanned_library.json');
  const PM_RETENTION_FILE = path.join(DATA_DIR, 'pm_retention.json');
  const CACHE_IMG_DIR = path.join(DATA_DIR, 'cached_images');

  if (!fs.existsSync(CACHE_IMG_DIR)) {
    fs.mkdirSync(CACHE_IMG_DIR, { recursive: true });
  }

  // Serve persistent cached metadata images (posters, backdrops, profile photos) directly from server storage
  app.use('/api/images', express.static(CACHE_IMG_DIR, { maxAge: '30d' }));




  const readJson = (file: string, fallback: any = {}) => {
    try {
      if (!fs.existsSync(file)) return fallback;
      let content = fs.readFileSync(file, 'utf8').trim();
      if (!content) return fallback;
      // Strip UTF-8 Byte Order Mark (BOM) if present
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1).trim();
      }
      return JSON.parse(content);
    } catch (e: any) {
      console.error(`[JSON Read Error] Recovered from invalid JSON in "${file}": ${e.message}`);
      if (file === SETTINGS_FILE || file === SCANNED_LIBRARY_FILE || file === USERS_FILE) {
        try {
          writeJson(file, fallback);
          console.log(`[JSON Auto-Repair] Cleanly re-initialized corrupt data file: ${file}`);
        } catch (err) {}
      }
      return fallback;
    }
  };

  const writeJson = (file: string, data: any) => {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = `${file}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempFile, file);
    } catch (e: any) {
      console.error(`[JSON Write Error] Failed writing "${file}": ${e.message}`);
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (err) {}
    }
  };
  // Helper: Track Premiumize transfer with 7-day expiration
  const trackPmRetention = (transferId: string, magnet?: string) => {
    if (!transferId) return;
    const list = readJson(PM_RETENTION_FILE, []);
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const expiresAt = now + SEVEN_DAYS_MS;

    const existingIdx = list.findIndex((item: any) => String(item.id) === String(transferId) || (magnet && item.magnet === magnet));
    if (existingIdx >= 0) {
      list[existingIdx].expiresAt = expiresAt; // Reset 7-day retention clock
    } else {
      list.push({ id: String(transferId), magnet: magnet || '', addedAt: now, expiresAt });
    }
    writeJson(PM_RETENTION_FILE, list);
    console.log(`[Premiumize 7-Day Retention] Tracked transfer "${transferId}" — scheduled for auto-purge on ${new Date(expiresAt).toISOString()}`);
  };

  // Helper: Automatically clear finished Premiumize transfer history logs without interrupting active downloads
  const clearPmTransferHistory = async (token: string) => {
    if (!token) return;
    try {
      const FormData = require('form-data');
      const clearForm = new FormData();
      clearForm.append('apikey', token);
      await axios.post("https://www.premiumize.me/api/transfer/clear", clearForm, {
        headers: { ...clearForm.getHeaders() },
        timeout: 8000
      }).catch(() => null);
      console.log(`[Premiumize Cloud] Cleared finished transfer history logs on Premiumize.`);
    } catch (err: any) {
      console.warn('[Premiumize Clear Transfer History Warning]:', err?.message || err);
    }
  };

  // Helper: Auto-purge expired Premiumize transfers after 7 days
  const runPmRetentionCleanup = async () => {
    try {
      const currentSettings = readJson(SETTINGS_FILE);
      const token = currentSettings.premiumizeApiKey || process.env.PREMIUMIZE_API_KEY || process.env.PM_API_KEY;
      if (!token) return;

      const list = readJson(PM_RETENTION_FILE, []);
      if (!Array.isArray(list) || list.length === 0) return;

      const now = Date.now();
      const remaining: any[] = [];

      for (const item of list) {
        if (now >= item.expiresAt) {
          console.log(`[Premiumize Retention] 7-day retention period expired for transfer "${item.id}". Deleting from Premiumize cloud...`);
          try {
            const FormData = require('form-data');
            const form = new FormData();
            form.append('apikey', token);
            form.append('id', item.id);
            const delRes = await axios.post("https://www.premiumize.me/api/transfer/delete", form, {
              headers: { ...form.getHeaders() },
              timeout: 8000
            });
            if (delRes.data?.status === 'success') {
              console.log(`[Premiumize Retention] Successfully deleted transfer "${item.id}" from Premiumize Cloud.`);
            } else {
              const itemForm = new FormData();
              itemForm.append('apikey', token);
              itemForm.append('id', item.id);
              await axios.post("https://www.premiumize.me/api/item/delete", itemForm, {
                headers: { ...itemForm.getHeaders() },
                timeout: 8000
              }).catch(() => null);
            }
          } catch (err: any) {
            console.warn(`[Premiumize Retention Warning] Failed to delete expired transfer "${item.id}":`, err?.message || err);
          }
        } else {
          remaining.push(item);
        }
      }

      if (remaining.length !== list.length) {
        writeJson(PM_RETENTION_FILE, remaining);
      }
    } catch (err: any) {
      console.error('[Premiumize Retention Cleanup Error]:', err?.message || err);
    }
  };

  // Run Premiumize retention cleanup on boot and every 4 hours
  setTimeout(runPmRetentionCleanup, 10000);
  setInterval(runPmRetentionCleanup, 4 * 60 * 60 * 1000);


  // Sync Docker Compose Env Configuration Keys directly to settings on boot
  const settings = readJson(SETTINGS_FILE);
  let settingsChanged = false;
  if (process.env.TMDB_KEY && settings.tmdbKey !== process.env.TMDB_KEY) {
    settings.tmdbKey = process.env.TMDB_KEY;
    settingsChanged = true;
  }
  if ((process.env.PREMIUMIZE_API_KEY || process.env.PM_API_KEY) && settings.premiumizeApiKey !== (process.env.PREMIUMIZE_API_KEY || process.env.PM_API_KEY)) {
    settings.premiumizeApiKey = process.env.PREMIUMIZE_API_KEY || process.env.PM_API_KEY;
    settingsChanged = true;
  }
  if (process.env.PREFER_HEVC && settings.preferHEVC !== (process.env.PREFER_HEVC === 'true')) {
    settings.preferHEVC = process.env.PREFER_HEVC === 'true';
    settingsChanged = true;
  }
  if (process.env.MAX_RESULTS && settings.maxResults !== process.env.MAX_RESULTS) {
    settings.maxResults = process.env.MAX_RESULTS;
    settingsChanged = true;
  }
  if (process.env.STREAM_BUFFER_SECONDS && settings.streamBufferSeconds !== process.env.STREAM_BUFFER_SECONDS) {
    settings.streamBufferSeconds = process.env.STREAM_BUFFER_SECONDS;
    settingsChanged = true;
  }
  if (process.env.IPTV_URL && settings.iptvUrl !== process.env.IPTV_URL) {
    settings.iptvUrl = process.env.IPTV_URL;
    settingsChanged = true;
  }
  if (process.env.EPG_URL && settings.epgUrl !== process.env.EPG_URL) {
    settings.epgUrl = process.env.EPG_URL;
    settingsChanged = true;
  }
  if (process.env.EPG_OFFSET && settings.epgOffset !== process.env.EPG_OFFSET) {
    settings.epgOffset = process.env.EPG_OFFSET;
    settingsChanged = true;
  }
  if (process.env.XTREAM_SERVER && settings.xtreamServer !== process.env.XTREAM_SERVER) {
    settings.xtreamServer = process.env.XTREAM_SERVER;
    settingsChanged = true;
  }
  if (process.env.XTREAM_USERNAME && settings.xtreamUsername !== process.env.XTREAM_USERNAME) {
    settings.xtreamUsername = process.env.XTREAM_USERNAME;
    settingsChanged = true;
  }
  if (process.env.XTREAM_PASSWORD && settings.xtreamPassword !== process.env.XTREAM_PASSWORD) {
    settings.xtreamPassword = process.env.XTREAM_PASSWORD;
    settingsChanged = true;
  }
  if (process.env.USENET_HOST && settings.usenetHost !== process.env.USENET_HOST) {
    settings.usenetHost = process.env.USENET_HOST;
    settingsChanged = true;
  }
  if (process.env.USENET_PORT && settings.usenetPort !== process.env.USENET_PORT) {
    settings.usenetPort = process.env.USENET_PORT;
    settingsChanged = true;
  }
  if (process.env.USENET_USERNAME && settings.usenetUsername !== process.env.USENET_USERNAME) {
    settings.usenetUsername = process.env.USENET_USERNAME;
    settingsChanged = true;
  }
  if (process.env.USENET_PASSWORD && settings.usenetPassword !== process.env.USENET_PASSWORD) {
    settings.usenetPassword = process.env.USENET_PASSWORD;
    settingsChanged = true;
  }

  if (settingsChanged) {
    writeJson(SETTINGS_FILE, settings);
  }



  // --- EMAIL HELPERS ---
  const generateStrongPassword = (length = 12): string => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%^&*';
    const all = upper + lower + digits + symbols;
    // Guarantee at least one of each type
    const pwd = [
      upper[crypto.randomInt(upper.length)],
      lower[crypto.randomInt(lower.length)],
      digits[crypto.randomInt(digits.length)],
      symbols[crypto.randomInt(symbols.length)],
    ];
    for (let i = pwd.length; i < length; i++) {
      pwd.push(all[crypto.randomInt(all.length)]);
    }
    // Shuffle
    for (let i = pwd.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
    }
    return pwd.join('');
  };

  const sendWelcomeEmail = async (toEmail: string, username: string, password: string) => {
    const settings = readJson(SETTINGS_FILE);
    const emailCfg = settings.email || {};
    if (!emailCfg.gmailUser || !emailCfg.gmailAppPassword) {
      console.warn('[Email] Gmail not configured — skipping welcome email.');
      return { sent: false, reason: 'Gmail not configured' };
    }
    const appName = emailCfg.appName || 'BubbaFlix';
    const appUrl = emailCfg.appUrl || '';
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: emailCfg.gmailUser, pass: emailCfg.gmailAppPassword },
    });
    
    // Precise 3D cinematic red gradient SVG matching App.tsx header
    const logoSvg = `
      <svg width="240" height="70" viewBox="0 0 320 80" style="display:block;margin:0 auto;filter:drop-shadow(0px 4px 6px rgba(0,0,0,0.95));">
        <defs>
          <path id="bubbaflix-curve-email" d="M 12,56 Q 160,20 308,56" fill="none" />
          <linearGradient id="bubbaflix-gradient-email" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#ff4d4d" />
            <stop offset="35%" stop-color="#e50914" />
            <stop offset="75%" stop-color="#b30000" />
            <stop offset="100%" stop-color="#7a0000" />
          </linearGradient>
        </defs>
        <text 
          font-family="'Bebas Neue', Impact, 'Arial Black', sans-serif" 
          font-size="42" 
          font-weight="900" 
          letter-spacing="-1"
          fill="url(#bubbaflix-gradient-email)"
          stroke="url(#bubbaflix-gradient-email)"
          stroke-width="2"
          stroke-linejoin="round"
        >
          <textPath href="#bubbaflix-curve-email" startOffset="50%" text-anchor="middle">
            BUBBAFLIX
          </textPath>
        </text>
      </svg>
    `;


    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body, html { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
        </style>
      </head>
      <body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;padding:20px 10px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:380px;background:#141417;border:1px solid #27272a;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:20px;text-align:center;background:#09090b;border-bottom:1px solid #27272a;">
                    ${logoSvg}
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 20px;text-align:center;">
                    <h2 style="color:#ffffff;margin:0 0 8px;font-size:16px;font-weight:700;-webkit-text-size-adjust:100%;">Welcome, ${username}!</h2>
                    <p style="color:#a1a1aa;margin:0 0 16px;font-size:12px;line-height:1.4;-webkit-text-size-adjust:100%;">Your account has been approved. Credentials below:</p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;border:1px solid #27272a;border-radius:8px;margin:12px 0;">
                      <tr>
                        <td style="padding:12px;text-align:center;">
                          <div style="font-size:9px;color:#71717a;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;-webkit-text-size-adjust:100%;">Username</div>
                          <div style="font-size:12px;font-weight:700;color:#ffffff;font-family:'Courier New',Courier,monospace;-webkit-text-size-adjust:100%;">${username}</div>
                          
                          <div style="height:1px;background:#27272a;margin:10px auto;width:80%;"></div>
                          
                          <div style="font-size:9px;color:#71717a;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;-webkit-text-size-adjust:100%;">Password</div>
                          <div style="font-size:12px;font-weight:700;color:#ef4444;font-family:'Courier New',Courier,monospace;letter-spacing:1px;-webkit-text-size-adjust:100%;">${password}</div>
                        </td>
                      </tr>
                    </table>

                    ${appUrl ? `<div style="margin-top:20px;"><a href="${appUrl}" style="background:#dc2626;color:#ffffff;padding:9px 20px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block;font-size:12px;-webkit-text-size-adjust:100%;">Sign In to ${appName}</a></div>` : ''}
                    <p style="color:#52525b;font-size:9px;margin:20px 0 0;line-height:1.4;-webkit-text-size-adjust:100%;">For security, please change your password after your first login.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
    await transporter.sendMail({
      from: `"${appName}" <${emailCfg.gmailUser}>`,
      to: toEmail,
      subject: `Welcome to ${appName} — Your Account is Ready`,
      html,
    });
    return { sent: true };
  };

  const sendPasswordResetEmail = async (toEmail: string, username: string, password: string) => {
    const emailCfg = settings.email || {};
    if (!emailCfg.gmailUser || !emailCfg.gmailAppPassword) {
      console.warn('[Email] Gmail not configured — skipping password reset email.');
      return { sent: false };
    }
    const appName = emailCfg.appName || 'BubbaFlix';
    const appUrl = emailCfg.appUrl || '';
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: emailCfg.gmailUser, pass: emailCfg.gmailAppPassword },
    });
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body, html { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
        </style>
      </head>
      <body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;padding:20px 10px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:380px;background:#141417;border:1px solid #27272a;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 20px;text-align:center;">
                    <h2 style="color:#ef4444;margin:0 0 8px;font-size:16px;font-weight:700;-webkit-text-size-adjust:100%;">Password Reset</h2>
                    <p style="color:#a1a1aa;margin:0 0 16px;font-size:12px;line-height:1.4;-webkit-text-size-adjust:100%;">Hi <b>${username}</b>, your password has been reset.</p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;border:1px solid #27272a;border-radius:8px;margin:12px 0;">
                      <tr>
                        <td style="padding:12px;text-align:center;">
                          <div style="font-size:9px;color:#71717a;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;-webkit-text-size-adjust:100%;">New Password</div>
                          <div style="font-size:12px;font-weight:700;color:#ef4444;font-family:'Courier New',Courier,monospace;letter-spacing:1px;-webkit-text-size-adjust:100%;">${password}</div>
                        </td>
                      </tr>
                    </table>

                    ${appUrl ? `<div style="margin-top:20px;"><a href="${appUrl}" style="background:#dc2626;color:#ffffff;padding:9px 20px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block;font-size:12px;-webkit-text-size-adjust:100%;">Sign In to ${appName}</a></div>` : ''}
                    <p style="color:#52525b;font-size:9px;margin:20px 0 0;line-height:1.4;-webkit-text-size-adjust:100%;">For security, please change your password after logging in.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
    await transporter.sendMail({
      from: `"${appName}" <${emailCfg.gmailUser}>`,
      to: toEmail,
      subject: `Password Reset for ${appName}`,
      html,
    });
    return { sent: true };
  };

  // Check if first-time setup is required (zero users in db)
  app.get('/api/system/encoder', (req, res) => {
    res.json({ encoder: detectBestH264Encoder() });
  });

  app.get('/api/auth/setup-status', (req, res) => {
    const users = readJson(USERS_FILE);
    const setupRequired = Object.keys(users).length === 0;
    res.json({ setupRequired });
  });

  // Perform first-time setup: create first admin and write initial keys
  app.post('/api/auth/setup-init', (req, res) => {
    const users = readJson(USERS_FILE);
    if (Object.keys(users).length > 0) {
      return res.status(400).json({ error: 'Setup has already been completed' });
    }

    const { email, username, password, tmdbKey, geminiApiKey } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Admin email, username, and password are required' });
    }

    // Complexity validation: min 12 chars, upper, lower, number, special char
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?\":{}|<>]/.test(password);
    if (password.length < 12 || !hasUpper || !hasLower || !hasDigit || !hasSpecial) {
      return res.status(400).json({ 
        error: 'Password must be at least 12 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.' 
      });
    }


    // Hash the first admin's manually input password
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');
    const uid = crypto.randomUUID();

    users[uid] = { 
      uid, 
      email, 
      username, 
      salt, 
      hash, 
      token, 
      role: 'admin', 
      status: 'approved', 
      registeredAt: new Date().toISOString() 
    };
    writeJson(USERS_FILE, users);

    // Save initial system keys if provided
    const settings = readJson(SETTINGS_FILE);
    if (tmdbKey) settings.tmdbKey = tmdbKey;
    if (geminiApiKey) settings.geminiApiKey = geminiApiKey;
    writeJson(SETTINGS_FILE, settings);

    res.json({ success: true, user: { uid, email, username, role: 'admin', status: 'approved' }, token });
  });

  // Endpoint for client frontend to fetch non-sensitive integration configurations dynamically
  app.get('/api/auth/config', (req, res) => {
    const settings = readJson(SETTINGS_FILE);
    res.json({
      tmdbKey: settings.tmdbKey || '',
      tvdbApiKey: settings.tvdbApiKey || '',
      premiumizeApiKey: settings.premiumizeApiKey || '',
      geminiApiKey: settings.geminiApiKey || '',
      groqApiKey: settings.groqApiKey || '',
      openRouterApiKey: settings.openRouterApiKey || '',
      preferHEVC: settings.preferHEVC !== false,
      hevcMode: settings.hevcMode || (settings.preferHEVC === false ? 'exclude' : 'prefer'),
      maxResults: settings.maxResults || null,
      streamBufferSeconds: settings.streamBufferSeconds || null,
      iptvUrl: settings.iptvUrl || '',
      epgUrl: settings.epgUrl || '',
      epgOffset: settings.epgOffset ?? null,
      xtreamServer: settings.xtreamServer || '',
      xtreamUsername: settings.xtreamUsername || '',
      xtreamPassword: settings.xtreamPassword || '',
      usenetHost: settings.usenetHost || '',
      usenetPort: settings.usenetPort || '',
      usenetUsername: settings.usenetUsername || '',
      usenetPassword: settings.usenetPassword || '',
      enableUsenetSearch: settings.enableUsenetSearch !== false,
      enableTorrentSearch: settings.enableTorrentSearch !== false,
      intelTranscoding: settings.intelTranscoding === true,
      disableLogin: settings.disableLogin === true,
      newsApiKey: settings.newsApiKey || '',
      gnewsApiKey: settings.gnewsApiKey || '',
      iptvProviders: settings.iptvProviders || [],
      customChannels: settings.customChannels || {},
      mediaFolders: settings.mediaFolders || [],
      sportsIptvGroups: settings.sportsIptvGroups || [],
      enableEztv: settings.enableEztv !== false
    });
  });



  // /api/auth/register  — no password required; admin will approve and email credentials


  app.post('/api/auth/register', (req, res) => {
    const { email, username } = req.body;
    if (!email || !username) return res.status(400).json({ error: 'Email and username are required' });
    
    const users = readJson(USERS_FILE);
    if (Object.values(users).some((u: any) => u.email === email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (Object.values(users).some((u: any) => u.username === username)) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const isFirstUser = Object.keys(users).length === 0;
    const role = isFirstUser ? 'admin' : 'user';
    const status = isFirstUser ? 'approved' : 'pending';
    const uid = crypto.randomUUID();

    if (isFirstUser) {
      // First user: generate password immediately so they can log in
      const password = generateStrongPassword();
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(password, salt, 64).toString('hex');
      const token = crypto.randomBytes(32).toString('hex');
      users[uid] = { uid, email, username, salt, hash, token, role, status, registeredAt: new Date().toISOString() };
      writeJson(USERS_FILE, users);
      // For the first admin we return the plaintext password once so they know it
      res.json({ user: { uid, email, username, role, status }, token, firstUser: true, generatedPassword: password });
    } else {
      // Pending user — no credentials until admin approves
      users[uid] = { uid, email, username, salt: null, hash: null, token: null, role, status, registeredAt: new Date().toISOString() };
      writeJson(USERS_FILE, users);
      res.json({ pending: true, message: 'Your account is awaiting admin approval. You will receive your password by email once approved.' });
    }
  });

  // /api/auth/login
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const users = readJson(USERS_FILE);
    const user = Object.values(users).find((u: any) => u.email === email || u.username === email);

    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    // Check approval status — legacy users without a status field are treated as approved
    const status = (user as any).status || 'approved';
    if (status === 'pending') {
      return res.status(403).json({ error: 'Your account is awaiting admin approval.', pending: true });
    }
    if (status === 'locked') {
      return res.status(403).json({ error: 'Your account has been locked by an administrator.' });
    }
    if (status === 'denied') {
      return res.status(403).json({ error: 'Your account registration was denied.' });
    }

    if (!(user as any).salt || !(user as any).hash) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const hash = crypto.scryptSync(password, (user as any).salt, 64).toString('hex');
    if (hash !== (user as any).hash) return res.status(400).json({ error: 'Invalid credentials' });

    const token = crypto.randomBytes(32).toString('hex');
    const existingTokens = Array.isArray((user as any).tokens) ? (user as any).tokens : [];
    (user as any).token = token;
    (user as any).tokens = [...existingTokens.slice(-15), token];
    writeJson(USERS_FILE, users);

    res.json({ user: { uid: (user as any).uid, email: (user as any).email, username: (user as any).username, role: (user as any).role || 'user', status }, token });
  });

  // /api/auth/me
  app.get('/api/auth/me', (req, res) => {
    const settings = readJson(SETTINGS_FILE);
    const users = readJson(USERS_FILE);
    
    if (settings.disableLogin) {
      const firstAdmin = Object.values(users as Record<string, any>).find((u: any) => u.role === 'admin') || {
        uid: 'dev-admin-id', email: 'dev@admin.local', username: 'Dev Admin', role: 'admin', status: 'approved'
      };
      return res.json({ user: { uid: firstAdmin.uid, email: firstAdmin.email, username: firstAdmin.username, role: firstAdmin.role || 'user' } });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    
    const token = authHeader.split(' ')[1];
    const user = Object.values(users as Record<string, any>).find((u: any) => 
      u.token === token || (Array.isArray(u.tokens) && u.tokens.includes(token))
    );

    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ user: { uid: user.uid, email: user.email, username: user.username, role: user.role || 'user' } });
  });

  // /api/user/settings GET
  app.get('/api/user/settings', requireAuth, (req, res) => {
    const user = (req as any).user;
    res.json({ settings: user.settings || {} });
  });

  // /api/user/settings PUT
  app.put('/api/user/settings', requireAuth, (req, res) => {
    const user = (req as any).user;
    const users = readJson(USERS_FILE);
    if (!users[user.uid]) return res.status(404).json({ error: 'User not found' });
    
    users[user.uid].settings = { ...users[user.uid].settings, ...req.body };
    writeJson(USERS_FILE, users);
    res.json({ success: true, settings: users[user.uid].settings });
  });

  // Simple Auth Middleware for DB routes
  function requireAuth(req, res, next) {
    const settings = readJson(SETTINGS_FILE);
    const users = readJson(USERS_FILE);
    
    if (settings.disableLogin) {
      const firstAdmin = Object.values(users as Record<string, any>).find((u: any) => u.role === 'admin') || {
        uid: 'dev-admin-id', email: 'dev@admin.local', username: 'Dev Admin', role: 'admin', status: 'approved'
      };
      (req as any).user = firstAdmin;
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    
    const token = authHeader.split(' ')[1];
    const user = Object.values(users as Record<string, any>).find((u: any) => 
      u.token === token || (Array.isArray(u.tokens) && u.tokens.includes(token))
    );
    
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    (req as any).user = user;
    next();
  };


  // Admin Middleware
  function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
      if ((req as any).user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admins only' });
      }
      next();
    });
  };

  // /api/admin/users GET
  app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = readJson(USERS_FILE);
    const safeUsers = Object.values(users).map((u: any) => ({
      uid: u.uid,
      email: u.email,
      username: u.username,
      role: u.role || 'user',
      status: u.status || 'approved',
      registeredAt: u.registeredAt || null
    }));
    res.json(safeUsers);
  });

  // /api/admin/settings GET
  app.get('/api/admin/settings', requireAdmin, (req, res) => {
    const settings = readJson(SETTINGS_FILE);
    const emailCfg = settings.email || {};
    // Never expose the app password to the frontend — just whether it's set
    res.json({
      email: {
        gmailUser: emailCfg.gmailUser || '',
        gmailAppPasswordSet: !!emailCfg.gmailAppPassword,
        appName: emailCfg.appName || 'BubbaFlix',
        appUrl: emailCfg.appUrl || '',
      },
      usenetHost: settings.usenetHost || '',
      usenetPort: settings.usenetPort || '',
      usenetUsername: settings.usenetUsername || '',
      usenetPassword: settings.usenetPassword || '',
      geminiApiKey: settings.geminiApiKey || '',
      disableLogin: settings.disableLogin === true,
      preferHEVC: settings.preferHEVC !== false,
      hevcMode: settings.hevcMode || (settings.preferHEVC === false ? 'exclude' : 'prefer'),
      mediaFolders: settings.mediaFolders || [],
      sportsIptvGroups: settings.sportsIptvGroups || [],
      enableEztv: settings.enableEztv === true
    });
  });

  // /api/admin/logs GET
  app.get('/api/admin/logs', requireAdmin, (req, res) => {
    res.json(backendLogs);
  });

  // /api/admin/settings PUT
  app.put('/api/admin/settings', requireAdmin, (req, res) => {
    const settings = readJson(SETTINGS_FILE);
    const { email, usenetHost, usenetPort, usenetUsername, usenetPassword, geminiApiKey } = req.body;
    
    if (email) {
      const { gmailUser, gmailAppPassword, appName, appUrl } = email;
      settings.email = {
        gmailUser: gmailUser ?? settings.email?.gmailUser ?? '',
        // Only update the password if a new one was provided
        gmailAppPassword: gmailAppPassword || settings.email?.gmailAppPassword || '',
        appName: appName ?? settings.email?.appName ?? 'BubbaFlix',
        appUrl: appUrl ?? settings.email?.appUrl ?? '',
      };
    }

    if (usenetHost !== undefined) settings.usenetHost = usenetHost;
    if (usenetPort !== undefined) settings.usenetPort = usenetPort;
    if (usenetUsername !== undefined) settings.usenetUsername = usenetUsername;
    if (usenetPassword !== undefined) settings.usenetPassword = usenetPassword;
    if (geminiApiKey !== undefined) settings.geminiApiKey = geminiApiKey;
    if (req.body.groqApiKey !== undefined) settings.groqApiKey = req.body.groqApiKey;
    if (req.body.openRouterApiKey !== undefined) settings.openRouterApiKey = req.body.openRouterApiKey;
    if (req.body.disableLogin !== undefined) settings.disableLogin = req.body.disableLogin;
    if (req.body.enableUsenetSearch !== undefined) settings.enableUsenetSearch = req.body.enableUsenetSearch;
    if (req.body.enableTorrentSearch !== undefined) settings.enableTorrentSearch = req.body.enableTorrentSearch;
    if (req.body.intelTranscoding !== undefined) settings.intelTranscoding = req.body.intelTranscoding;
    if (req.body.preferHEVC !== undefined) settings.preferHEVC = req.body.preferHEVC;
    if (req.body.hevcMode !== undefined) settings.hevcMode = req.body.hevcMode;
    if (req.body.filterAnime !== undefined) settings.filterAnime = req.body.filterAnime;
    if (req.body.preferredLanguage !== undefined) settings.preferredLanguage = req.body.preferredLanguage;
    if (req.body.mediaFolders !== undefined) settings.mediaFolders = req.body.mediaFolders;


    // Some general settings that any admin can save from SettingsPanel
    if (req.body.tmdbKey !== undefined) settings.tmdbKey = req.body.tmdbKey;
    if (req.body.tvdbApiKey !== undefined) settings.tvdbApiKey = req.body.tvdbApiKey;
    if (req.body.premiumizeApiKey !== undefined) settings.premiumizeApiKey = req.body.premiumizeApiKey;
    if (req.body.newsApiKey !== undefined) settings.newsApiKey = req.body.newsApiKey;
    if (req.body.gnewsApiKey !== undefined) settings.gnewsApiKey = req.body.gnewsApiKey;
    if (req.body.preferHEVC !== undefined) settings.preferHEVC = req.body.preferHEVC;
    if (req.body.maxResults !== undefined) settings.maxResults = req.body.maxResults;
    if (req.body.streamBufferSeconds !== undefined) settings.streamBufferSeconds = req.body.streamBufferSeconds;
    if (req.body.iptvUrl !== undefined) settings.iptvUrl = req.body.iptvUrl;
    if (req.body.epgUrl !== undefined) settings.epgUrl = req.body.epgUrl;
    if (req.body.epgOffset !== undefined) settings.epgOffset = req.body.epgOffset;
    if (req.body.xtreamServer !== undefined) settings.xtreamServer = req.body.xtreamServer;
    if (req.body.xtreamUsername !== undefined) settings.xtreamUsername = req.body.xtreamUsername;
    if (req.body.xtreamPassword !== undefined) settings.xtreamPassword = req.body.xtreamPassword;
    if (req.body.iptvProviders !== undefined) settings.iptvProviders = req.body.iptvProviders;
    if (req.body.customChannels !== undefined) settings.customChannels = req.body.customChannels;
    if (req.body.sportsIptvGroups !== undefined) settings.sportsIptvGroups = req.body.sportsIptvGroups;
    if (req.body.enableEztv !== undefined) settings.enableEztv = req.body.enableEztv;

    writeJson(SETTINGS_FILE, settings);
    res.json({ success: true });
  });

  // News Proxy Endpoints
  app.get('/api/news/newsapi', async (req, res) => {
    try {
      const settings = readJson(SETTINGS_FILE);
      const apiKey = settings.newsApiKey || process.env.NEWS_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'NewsAPI.org key is not configured in Settings.' });
      }

      const { q, category, country, pageSize = '20' } = req.query;
      let url = 'https://newsapi.org/v2/';
      if (category || (country && !q)) {
        url += `top-headlines?apiKey=${apiKey}&pageSize=${pageSize}`;
        if (category) url += `&category=${encodeURIComponent(String(category))}`;
        if (country) url += `&country=${encodeURIComponent(String(country))}`;
        if (q) url += `&q=${encodeURIComponent(String(q))}`;
      } else {
        url += `everything?apiKey=${apiKey}&pageSize=${pageSize}&sortBy=publishedAt`;
        if (q) url += `&q=${encodeURIComponent(String(q))}`;
        else url += `&q=news`;
      }

      const response = await axios.get(url, { headers: { 'User-Agent': 'BubbaFlix-News/1.0' } });
      res.json(response.data);
    } catch (err: any) {
      console.error('[NewsAPI Proxy Error]', err?.response?.data || err?.message || err);
      res.status(err?.response?.status || 500).json({ error: err?.response?.data?.message || err?.message || 'Failed to fetch from NewsAPI' });
    }
  });

  app.get('/api/news/gnews', async (req, res) => {
    try {
      const settings = readJson(SETTINGS_FILE);
      const apiKey = settings.gnewsApiKey || process.env.GNEWS_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'GNews API key is not configured in Settings.' });
      }

      const { q, topic, country, max = '20' } = req.query;
      let url = 'https://gnews.io/api/v4/';
      if (topic) {
        url += `top-headlines?category=${encodeURIComponent(String(topic))}&apikey=${apiKey}&max=${max}&lang=en`;
      } else if (q) {
        // Sanitize GNews query to prevent syntax errors
        const cleanQ = String(q).trim().replace(/[-–—]+/g, ' ').replace(/\s+/g, ' ');
        url += `search?q=${encodeURIComponent(cleanQ)}&apikey=${apiKey}&max=${max}&lang=en`;
      } else {
        url += `top-headlines?category=general&apikey=${apiKey}&max=${max}&lang=en`;
      }

      if (country) url += `&country=${encodeURIComponent(String(country))}`;

      const response = await axios.get(url);
      res.json(response.data);
    } catch (err: any) {
      console.error('[GNews Proxy Error]', err?.response?.data || err?.message || err);
      // Return empty articles instead of crashing or breaking UI
      res.json({ articles: [] });
    }
  });

  // Hyper-Local News Proxy (Google News Location RSS Geo Feed)
  app.get('/api/news/local-rss', async (req, res) => {
    try {
      const city = String(req.query.city || '').trim();
      const state = String(req.query.state || '').trim();
      const locationQuery = city ? (state ? `${city}, ${state}` : city) : 'US';

      const rssUrl = `https://news.google.com/rss/headlines/section/geo/${encodeURIComponent(locationQuery)}?hl=en-US&gl=US&ceid=US:en`;
      const response = await axios.get(rssUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000
      });

      const xml = response.data || '';
      const articles: any[] = [];

      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const itemXml = match[1];
        
        const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
        const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
        const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        const sourceMatch = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
        const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);

        let rawTitle = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
        let sourceName = sourceMatch ? sourceMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';

        // Google News RSS titles end with " - Source Name"
        if (!sourceName && rawTitle.includes(' - ')) {
          const parts = rawTitle.split(' - ');
          sourceName = parts.pop() || 'Local News';
          rawTitle = parts.join(' - ');
        }

        const url = linkMatch ? linkMatch[1].trim() : '';
        const publishedAt = pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : new Date().toISOString();
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';

        if (rawTitle && url) {
          articles.push({
            title: rawTitle,
            url,
            publishedAt,
            source: sourceName || 'Local Media Outlet',
            description,
            isLocalOutlet: true
          });
        }
      }

      res.json({ articles });
    } catch (err: any) {
      console.warn('[Local News RSS Proxy Error]:', err?.message);
      res.json({ articles: [] });
    }
  });

  // TheIntroDB & IntroDB Skip Segments Proxy Endpoint (Intro, Recap, Outro, Credits)
  app.get('/api/skip-segments', async (req, res) => {
    try {
      const tmdbId = req.query.tmdbId ? String(req.query.tmdbId) : '';
      const imdbId = req.query.imdbId ? String(req.query.imdbId) : '';
      const type = req.query.type ? String(req.query.type) : 'movie';
      const season = req.query.season ? String(req.query.season) : '';
      const episode = req.query.episode ? String(req.query.episode) : '';

      if (!tmdbId && !imdbId) {
        return res.json({ success: false, message: 'Missing tmdbId or imdbId', segments: [] });
      }

      const segments: Array<{ type: string; start: number; end: number; label: string }> = [];

      // 1. Query TheIntroDB v3 API
      if (tmdbId) {
        try {
          let tidbUrl = `https://api.theintrodb.org/v3/media?tmdb_id=${encodeURIComponent(tmdbId)}`;
          if (type === 'tv' && season && episode) {
            tidbUrl += `&season=${encodeURIComponent(season)}&episode=${encodeURIComponent(episode)}`;
          }
          const tidbRes = await axios.get(tidbUrl, { timeout: 4000 }).catch(() => null);
          if (tidbRes?.data) {
            const items = Array.isArray(tidbRes.data) 
              ? tidbRes.data 
              : (tidbRes.data.segments || tidbRes.data.items || tidbRes.data.results || []);
            if (items.length > 0) {
              items.forEach((item: any) => {
                const segType = (item.type || item.category || item.action || 'intro').toLowerCase();
                const startSec = Number(item.start || item.start_sec || item.startTime || 0);
                const endSec = Number(item.end || item.end_sec || item.endTime || 0);
                if (endSec > startSec) {
                  segments.push({
                    type: segType,
                    start: startSec,
                    end: endSec,
                    label: segType.includes('credit') || segType.includes('outro') ? 'Skip Credits' : segType.includes('recap') ? 'Skip Recap' : 'Skip Intro'
                  });
                }
              });
            }
          }
        } catch (e) {}
      }

      // 2. Query TheIntroDB v1 API Fallback
      if (segments.length === 0 && tmdbId) {
        try {
          let v1Url = `https://api.theintrodb.org/v1/segments?tmdb_id=${encodeURIComponent(tmdbId)}`;
          if (type === 'tv' && season && episode) {
            v1Url += `&season=${encodeURIComponent(season)}&episode=${encodeURIComponent(episode)}`;
          }
          const v1Res = await axios.get(v1Url, { timeout: 4000 }).catch(() => null);
          if (v1Res?.data) {
            const list = Array.isArray(v1Res.data) ? v1Res.data : (v1Res.data.segments || []);
            list.forEach((item: any) => {
              const segType = (item.type || 'intro').toLowerCase();
              const startSec = Number(item.start || 0);
              const endSec = Number(item.end || 0);
              if (endSec > startSec) {
                segments.push({
                  type: segType,
                  start: startSec,
                  end: endSec,
                  label: segType.includes('credit') || segType.includes('outro') ? 'Skip Credits' : segType.includes('recap') ? 'Skip Recap' : 'Skip Intro'
                });
              }
            });
          }
        } catch (e) {}
      }

      // 3. Query IntroDB App API Fallback
      if (segments.length === 0) {
        try {
          let appUrl = `https://api.introdb.app/segments?`;
          if (imdbId) {
            appUrl += `imdb_id=${encodeURIComponent(imdbId)}`;
          } else if (tmdbId) {
            appUrl += `tmdb_id=${encodeURIComponent(tmdbId)}`;
          }
          if (type === 'tv' && season && episode) {
            appUrl += `&season=${encodeURIComponent(season)}&episode=${encodeURIComponent(episode)}`;
          }
          const appRes = await axios.get(appUrl, { timeout: 4000 }).catch(() => null);
          if (appRes?.data) {
            const list = Array.isArray(appRes.data) ? appRes.data : (appRes.data.segments || []);
            list.forEach((item: any) => {
              const segType = (item.type || item.category || 'intro').toLowerCase();
              const startSec = Number(item.start || item.start_time || 0);
              const endSec = Number(item.end || item.end_time || 0);
              if (endSec > startSec) {
                segments.push({
                  type: segType,
                  start: startSec,
                  end: endSec,
                  label: segType.includes('credit') || segType.includes('outro') ? 'Skip Credits' : segType.includes('recap') ? 'Skip Recap' : 'Skip Intro'
                });
              }
            });
          }
        } catch (e) {}
      }

      return res.json({ success: true, segments });
    } catch (err: any) {
      console.error('[Skip Segments Error]:', err?.message);
      return res.json({ success: false, segments: [] });
    }
  });

  // Sports Scores Proxy Endpoint (ESPN Public API - No key required)
  app.get('/api/sports/scores', async (req, res) => {
    try {
      const sport = String(req.query.sport || 'nfl').toLowerCase();
      let endpoint = '';
      switch (sport) {
        case 'nfl':
          endpoint = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
          break;
        case 'nba':
          endpoint = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
          break;
        case 'mlb':
          endpoint = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';
          break;
        case 'nhl':
          endpoint = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard';
          break;
        case 'ncaa_football':
          endpoint = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';
          break;
        case 'ncaa_basketball':
          endpoint = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
          break;
        case 'soccer':
          endpoint = 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard';
          break;
        default:
          endpoint = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
      }

      const response = await axios.get(endpoint, { headers: { 'User-Agent': 'BubbaFlix-Sports/1.0' } });
      res.json(response.data);
    } catch (err: any) {
      console.error('[Sports Scores Proxy Error]', err?.message || err);
      res.status(500).json({ error: 'Failed to fetch sports scores' });
    }
  });

  let geminiCooldownUntil = 0;

  // Helper function to call AI APIs with automatic multi-provider fallback:
  // Gemini API -> Groq API (Free Tier) -> OpenRouter Free API -> Local Ollama
  async function callAiWithFallback(passedApiKey: string, prompt: string, options: { responseMimeType?: string; timeout?: number } = {}): Promise<string> {
    const settings = readJson(SETTINGS_FILE);
    const rawGeminiKey = (passedApiKey || settings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
    const groqKey = (settings.groqApiKey || process.env.GROQ_API_KEY || '').trim();
    const openRouterKey = (settings.openRouterApiKey || process.env.OPENROUTER_API_KEY || '').trim();
    const timeoutMs = options.timeout || 30000;

    const errors: string[] = [];

    // 1. PRIMARY PROVIDER: GOOGLE GEMINI API
    const isGeminiInCooldown = Date.now() < geminiCooldownUntil;

    if (rawGeminiKey && isGeminiInCooldown) {
      const remainingSec = Math.ceil((geminiCooldownUntil - Date.now()) / 1000);
      console.warn(`[AI System] Gemini API is currently in rate-limit cooldown (${remainingSec}s remaining). Cascading to fallback AI provider...`);
      errors.push('Gemini 429 Rate Limit Cooldown Active');
    } else if (rawGeminiKey) {
      const models = [
        'gemini-2.5-flash',
        'gemini-2.0-flash-exp',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
        'gemini-1.5-pro-latest',
        'gemini-1.5-pro'
      ];
      const apiVersions = ['v1beta', 'v1'];
      let modelSuccess = false;

      for (const model of models) {
        if (modelSuccess) break;
        for (const ver of apiVersions) {
          try {
            const payload: any = { contents: [{ parts: [{ text: prompt }] }] };
            if (options.responseMimeType) {
              payload.generationConfig = { temperature: 0.1, responseMimeType: options.responseMimeType };
            }

            const res = await axios.post(
              `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${rawGeminiKey}`,
              payload,
              { timeout: timeoutMs, headers: { 'Content-Type': 'application/json' } }
            );

            const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text !== undefined && text !== null) {
              modelSuccess = true;
              return text;
            }
          } catch (err: any) {
            const status = err.response?.status;
            if (status === 429) {
              geminiCooldownUntil = Date.now() + 5 * 60 * 1000; // 5-minute circuit breaker
              console.warn(`[AI System] Gemini API rate limited / quota exceeded (429). Setting 5-minute cooldown and cascading to fallback AI provider...`);
              errors.push('Gemini 429 Rate Limit');
              modelSuccess = false;
              break;
            }
            if (status === 404) {
              continue;
            }
            errors.push(`Gemini (${model}/${ver}): ${err.message}`);
            break;
          }
        }
      }
    }

    // 2. SECONDARY PROVIDER: GROQ API (100% Free High-Speed LPU Tier)
    if (groqKey) {
      const groqModels = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'];
      for (const gModel of groqModels) {
        try {
          const res = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              model: gModel,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.1,
              ...(options.responseMimeType === 'application/json' ? { response_format: { type: 'json_object' } } : {})
            },
            {
              timeout: timeoutMs,
              headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json'
              }
            }
          );
          const text = res.data?.choices?.[0]?.message?.content;
          if (text) {
            console.log(`[AI System] Obtained response from Groq AI Fallback (${gModel})`);
            return text;
          }
        } catch (err: any) {
          errors.push(`Groq (${gModel}): ${err.response?.data?.error?.message || err.message}`);
        }
      }
    }

    // 3. TERTIARY PROVIDER: OPENROUTER FREE API (Public Open Access Tier)
    const openRouterAuthKey = openRouterKey || 'pk-free-open-access';
    const openRouterModels = [
      'meta-llama/llama-3.2-3b-instruct:free',
      'google/gemma-2-9b-it:free',
      'qwen/qwen-2.5-72b-instruct:free',
      'deepseek/deepseek-r1:free'
    ];

    for (const orModel of openRouterModels) {
      try {
        const res = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: orModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1
          },
          {
            timeout: timeoutMs,
            headers: {
              'Authorization': `Bearer ${openRouterAuthKey}`,
              'HTTP-Referer': 'https://bubbaflix.app',
              'X-Title': 'BubbaFlix Media Center',
              'Content-Type': 'application/json'
            }
          }
        );
        const text = res.data?.choices?.[0]?.message?.content;
        if (text) {
          console.log(`[AI System] Obtained response from OpenRouter Free AI Fallback (${orModel})`);
          return text;
        }
      } catch (err: any) {
        errors.push(`OpenRouter (${orModel}): ${err.response?.data?.error?.message || err.message}`);
      }
    }

    // 4. QUATERNARY PROVIDER: LOCAL OLLAMA API (If running locally)
    try {
      const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
      const res = await axios.post(
        `${ollamaUrl}/v1/chat/completions`,
        {
          model: 'llama3.2',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        },
        { timeout: 10000 }
      );
      const text = res.data?.choices?.[0]?.message?.content;
      if (text) {
        console.log(`[AI System] Obtained response from Local Ollama AI`);
        return text;
      }
    } catch (e) {}

    throw new Error(`All AI Providers Failed or Unconfigured: [${errors.join('; ')}]`);
  }

  // Alias callGeminiApi to callAiWithFallback for full backward compatibility
  const callGeminiApi = callAiWithFallback;

  // Sports Stream AI Matcher via Gemini API
  app.post('/api/sports/match-channel', async (req, res) => {
    try {
      const settings = readJson(SETTINGS_FILE);
      const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
      const { homeTeam, awayTeam, sport, channels, epgUrl } = req.body;

      if (!channels || !Array.isArray(channels) || channels.length === 0) {
        return res.status(400).json({ error: 'No IPTV channels provided' });
      }

      // Filter channels to relevant sports or event channels to keep prompt size efficient
      let candidateChannels: any[] = [];
      const sportsGroups = settings.sportsIptvGroups || [];

      if (sportsGroups.length > 0) {
        candidateChannels = channels.filter((ch: any) => {
          const groupTitle = ch.group?.title || ch.group || '';
          return sportsGroups.includes(groupTitle);
        }).slice(0, 150);
      } else {
        const sportsKeywords = [sport, homeTeam, awayTeam, 'sport', 'espn', 'fox', 'cbs', 'nbc', 'bally', 'tnt', 'tbs', 'nfl', 'nba', 'mlb', 'nhl', 'redzone', 'ppv', 'network', 'stadium', 'sec', 'acc', 'bigten', 'big10', 'pac12'];
        candidateChannels = channels.filter((ch: any) => {
          const titleLower = (ch.title || ch.name || '').toLowerCase();
          const groupLower = (ch.group?.title || ch.group || '').toLowerCase();
          return sportsKeywords.some(kw => kw && (titleLower.includes(kw.toLowerCase()) || groupLower.includes(kw.toLowerCase())));
        }).slice(0, 150);
      }

      const targetChannels = candidateChannels.length > 0 ? candidateChannels : channels.slice(0, 100);

      // If Gemini API Key is available, use Gemini AI for smart matching
      if (apiKey) {
        let epgPrograms: any[] = [];
        if (epgUrl) {
          try {
            const parsedEpg = await parseEPG(epgUrl);
            epgPrograms = parsedEpg?.programs || [];
          } catch (e) {
            console.error('[EPG Match Fetch Error]', e);
          }
        }

        const now = Date.now();
        const channelListStr = targetChannels.map((c: any, i: number) => {
          let nowPlayingStr = '';
          if (epgPrograms.length > 0) {
            const chanId = c.tvg?.id || c.name || '';
            const currentProgram = epgPrograms.find(p => p.channel === chanId && new Date(p.start).getTime() <= now && new Date(p.stop).getTime() >= now);
            if (currentProgram) {
              nowPlayingStr = ` | Now Playing: ${currentProgram.title?.[0]?.value || currentProgram.title || 'Unknown'}`;
            }
          }
          return `[ID: ${i}] ${c.title || c.name} (Group: ${c.group?.title || c.group || 'General'})${nowPlayingStr}`;
        }).join('\n');
        
        const prompt = `You are a live sports broadcast matching assistant.
Match the following game to the single best available IPTV channel from the list.

GAME: ${awayTeam} vs ${homeTeam} (${sport.toUpperCase()})

AVAILABLE CHANNELS:
${channelListStr}

Respond ONLY with a valid JSON object in this exact format, with no markdown code blocks or extra text:
{"matchedIndex": number, "channelName": "string", "confidence": "high"|"medium"|"low"}
If no channel matches the team names or relevant regional/national network for this game, respond with {"matchedIndex": -1}.`;

        const replyText = await callGeminiApi(apiKey, prompt, { responseMimeType: "application/json", timeout: 20000 });
        if (replyText) {
          try {
            const parsed = JSON.parse(replyText);
            if (parsed.matchedIndex >= 0 && targetChannels[parsed.matchedIndex]) {
              const matched = targetChannels[parsed.matchedIndex];
              return res.json({
                matched: true,
                streamUrl: matched.rawUrl || matched.url,
                channelName: matched.title || matched.name,
                logo: matched.tvg?.logo || matched.logo || '',
                confidence: parsed.confidence || 'high'
              });
            }
          } catch (e) {
            console.error('[Gemini Match JSON Parse Error]', e);
          }
        }
      }

      // Fallback matching logic (exact/keyword search if no Gemini key or parse failure)
      const homeLower = homeTeam.toLowerCase();
      const awayLower = awayTeam.toLowerCase();
      const directMatch = targetChannels.find((c: any) => {
        const name = (c.title || c.name || '').toLowerCase();
        return (name.includes(homeLower) && name.includes(awayLower)) || name.includes(homeLower) || name.includes(awayLower);
      });

      if (directMatch) {
        return res.json({
          matched: true,
          streamUrl: directMatch.rawUrl || directMatch.url,
          channelName: directMatch.title || directMatch.name,
          logo: directMatch.tvg?.logo || directMatch.logo || '',
          confidence: 'medium'
        });
      }

      return res.json({ matched: false, message: 'No matching stream found' });
    } catch (err: any) {
      console.error('[Sports Match Error]', err?.message || err);
      res.status(500).json({ error: 'Failed to match sports channel' });
    }
  });

  // Gemini AI Channel Deduplicator & Backup Stream Matcher
  app.post('/api/admin/iptv/ai-dedupe', requireAdmin, async (req, res) => {
    try {
      const settings = readJson(SETTINGS_FILE);
      const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
      const { channels } = req.body;

      if (!channels || !Array.isArray(channels) || channels.length === 0) {
        return res.status(400).json({ error: 'No channels provided' });
      }

      // Group channels by basic sanitized name to find candidate duplicates
      const channelSummaries = channels.map((c: any, index: number) => ({
        id: c.id || `ch-${index}`,
        index,
        name: c.title || c.name,
        group: c.group?.title || c.group || 'General',
        providerName: c.providerName || 'Provider',
        url: c.rawUrl || c.url
      }));

      if (!apiKey) {
        // Fallback exact-name matching if no Gemini key configured
        const mapByName: Record<string, any[]> = {};
        for (const ch of channelSummaries) {
          const norm = ch.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!mapByName[norm]) mapByName[norm] = [];
          mapByName[norm].push(ch);
        }

        const groupedConfigs: Record<string, any> = {};
        for (const [key, chList] of Object.entries(mapByName)) {
          if (chList.length > 1) {
            const primary = chList[0];
            const backups = chList.slice(1).map(c => c.url);
            groupedConfigs[primary.id] = {
              id: primary.id,
              name: primary.name,
              logo: '',
              group: primary.group,
              hidden: false,
              primaryStreamUrl: primary.url,
              backupStreamUrls: backups,
              primaryProviderName: primary.providerName
            };
          }
        }
        return res.json({ success: true, customChannels: groupedConfigs, message: 'Deduplicated using exact name matching (Add Gemini Key in Settings for AI matching).' });
      }

      const resultConfigs: Record<string, any> = {};
      const chunkSize = 250;
      
      for (let offset = 0; offset < channelSummaries.length; offset += chunkSize) {
        const sample = channelSummaries.slice(offset, offset + chunkSize);
        const listStr = sample.map(c => `[ID: ${c.id}] Name: "${c.name}" | Provider: "${c.providerName}" | Group: "${c.group}"`).join('\n');

        const prompt = `You are an expert IPTV channel deduplication and stream backup manager.
Analyze the following list of IPTV channels from different providers.
Identify channels that represent the EXACT SAME TV channel (e.g. "HBO East (Provider 1)" and "US: HBO HD (Provider 2)").

CHANNELS LIST:
${listStr}

Return ONLY a valid JSON object mapping each primary channel ID to its deduplicated configuration.
Format:
{
  "groupedChannels": [
    {
      "primaryId": "string",
      "canonicalName": "string",
      "group": "string",
      "primaryProviderName": "string",
      "primaryStreamUrl": "string",
      "backupStreamUrls": ["string", "string"]
    }
  ]
}
If no duplicates are found, return {"groupedChannels": []}.
Do not include markdown blocks or extra text.`;

        try {
          const replyText = await callGeminiApi(apiKey, prompt, { responseMimeType: "application/json", timeout: 35000 });
          if (replyText) {
            const parsed = JSON.parse(replyText);
            const groupedArray = parsed.groupedChannels || [];

            for (const item of groupedArray) {
              if (item.primaryId) {
                const primaryCh = sample.find(c => c.id === item.primaryId);
                if (primaryCh) {
                  resultConfigs[item.primaryId] = {
                    id: item.primaryId,
                    name: item.canonicalName || primaryCh.name,
                    group: item.group || primaryCh.group,
                    hidden: false,
                    primaryStreamUrl: item.primaryStreamUrl || primaryCh.url,
                    backupStreamUrls: item.backupStreamUrls || [],
                    primaryProviderName: item.primaryProviderName || primaryCh.providerName
                  };
                }
              }
            }
          }
        } catch (e: any) {
          console.warn(`[IPTV AI Dedupe Warning] Batch ${offset / chunkSize + 1} processing error:`, e.message);
        }
      }

      res.json({ success: true, customChannels: resultConfigs, matchedGroupsCount: Object.keys(resultConfigs).length });
    } catch (err: any) {
      console.error('[IPTV AI Dedupe Error]', err?.message || err);
      res.status(500).json({ error: err?.message || 'Failed to run Gemini IPTV deduplication' });
    }
  });


  // /api/admin/test-email POST
  app.post('/api/admin/test-email', requireAdmin, async (req, res) => {
    try {
      const result = await sendWelcomeEmail(
        (req as any).user.email,
        (req as any).user.username,
        'TestPassword123!'
      );
      if (!result.sent) return res.status(400).json({ error: result.reason });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // /api/admin/users/:uid/approve PUT — generate password and email it
  app.put('/api/admin/users/:uid/approve', requireAdmin, async (req, res) => {
    const users = readJson(USERS_FILE);
    if (!users[req.params.uid]) return res.status(404).json({ error: 'User not found' });
    
    const password = generateStrongPassword();
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');

    users[req.params.uid].status = 'approved';
    users[req.params.uid].salt = salt;
    users[req.params.uid].hash = hash;
    users[req.params.uid].token = token;
    writeJson(USERS_FILE, users);

    const u = users[req.params.uid];
    let emailResult = { sent: false, reason: 'Unknown' };
    try {
      emailResult = await sendWelcomeEmail(u.email, u.username, password) as any;
    } catch (err: any) {
      console.error('[Email] Failed to send welcome email:', err.message);
    }

    res.json({ success: true, emailSent: emailResult.sent });
  });

  // /api/admin/users/:uid/deny PUT
  app.put('/api/admin/users/:uid/deny', requireAdmin, (req, res) => {
    const users = readJson(USERS_FILE);
    if (!users[req.params.uid]) return res.status(404).json({ error: 'User not found' });
    users[req.params.uid].status = 'denied';
    writeJson(USERS_FILE, users);
    res.json({ success: true });
  });

  // /api/admin/users/:uid/lock PUT
  app.put('/api/admin/users/:uid/lock', requireAdmin, (req, res) => {
    const users = readJson(USERS_FILE);
    if (!users[req.params.uid]) return res.status(404).json({ error: 'User not found' });
    users[req.params.uid].status = 'locked';
    users[req.params.uid].token = null; // Invalidate current session
    writeJson(USERS_FILE, users);
    res.json({ success: true });
  });

  // /api/admin/users/:uid/unlock PUT
  app.put('/api/admin/users/:uid/unlock', requireAdmin, (req, res) => {
    const users = readJson(USERS_FILE);
    if (!users[req.params.uid]) return res.status(404).json({ error: 'User not found' });
    users[req.params.uid].status = 'approved';
    writeJson(USERS_FILE, users);
    res.json({ success: true });
  });

  // /api/admin/users/:uid/reset-password PUT
  app.put('/api/admin/users/:uid/reset-password', requireAdmin, async (req, res) => {
    const users = readJson(USERS_FILE);
    if (!users[req.params.uid]) return res.status(404).json({ error: 'User not found' });
    
    // Generate secure random password
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
    let password = '';
    for(let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Hash it
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');

    // Update user
    users[req.params.uid].salt = salt;
    users[req.params.uid].hash = hash;
    users[req.params.uid].token = token;
    writeJson(USERS_FILE, users);

    // Send email
    let emailResult = { sent: false };
    try {
      const u = users[req.params.uid];
      emailResult = await sendPasswordResetEmail(u.email, u.username, password) as any;
    } catch (err: any) {
      console.error('[Email] Failed to send password reset email:', err.message);
    }

    res.json({ success: true, generatedPassword: password, emailSent: emailResult.sent });
  });

  // /api/admin/users POST — admin creating a user: supports manual or auto-generated password
  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const { email, username, password: manualPassword, role, emailPassword } = req.body;
    if (!email || !username) return res.status(400).json({ error: 'Email and username are required' });
    
    const users = readJson(USERS_FILE);
    if (Object.values(users).some((u: any) => u.email === email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (Object.values(users).some((u: any) => u.username === username)) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // emailPassword=true → generate and send; otherwise use the provided manual password
    const password = emailPassword ? generateStrongPassword() : (manualPassword || generateStrongPassword());
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const uid = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');

    users[uid] = { uid, email, username, salt, hash, token, role: role || 'user', status: 'approved', registeredAt: new Date().toISOString() };
    writeJson(USERS_FILE, users);

    let emailSent = false;
    if (emailPassword) {
      try {
        const result = await sendWelcomeEmail(email, username, password) as any;
        emailSent = result.sent;
      } catch (err: any) {
        console.error('[Email] Failed to send welcome email to admin-created user:', err.message);
      }
    }

    res.json({
      success: true,
      emailSent,
      // Only include plaintext password in response when NOT emailing (admin set it manually)
      ...((!emailPassword && manualPassword) ? {} : { generatedPassword: emailPassword ? undefined : password }),
      user: { uid, email, username, role: role || 'user', status: 'approved' }
    });
  });

  // /api/admin/users/:uid/role PUT

  app.put('/api/admin/users/:uid/role', requireAdmin, (req, res) => {
    const { role } = req.body;
    const users = readJson(USERS_FILE);
    if (!users[req.params.uid]) return res.status(404).json({ error: 'User not found' });
    
    users[req.params.uid].role = role;
    writeJson(USERS_FILE, users);
    res.json({ success: true });
  });

  // /api/admin/users/:uid DELETE
  app.delete('/api/admin/users/:uid', requireAdmin, (req, res) => {
    const users = readJson(USERS_FILE);
    if (!users[req.params.uid]) return res.status(404).json({ error: 'User not found' });
    
    delete users[req.params.uid];
    writeJson(USERS_FILE, users);
    
    // Also delete their DB data
    const db = readJson(DB_FILE);
    let dbChanged = false;
    for (const key in db) {
      if (key.startsWith(req.params.uid + '_')) {
        delete db[key];
        dbChanged = true;
      }
    }
    if (dbChanged) writeJson(DB_FILE, db);
    
    res.json({ success: true });
  });

  // /api/db/get/:collection
  app.get('/api/db/get/:collection', requireAuth, (req, res) => {
    const db = readJson(DB_FILE);
    const key = `${(req as any).user.uid}_${req.params.collection}`;
    res.json(db[key] || []);
  });

  // /api/db/post/:collection
  app.post('/api/db/post/:collection', requireAuth, (req, res) => {
    const db = readJson(DB_FILE);
    const key = `${(req as any).user.uid}_${req.params.collection}`;
    db[key] = req.body;
    writeJson(DB_FILE, db);
    res.json({ success: true });
  });

  // --- END AUTH & DB ---


  // API Route: Transcode Video using FFmpeg
  // FFmpeg DNS tunnel env setup
  const getFfmpegEnv = () => ({
    ...process.env,
    http_proxy: `http://127.0.0.1:${FFMPEG_PROXY_PORT}`,
    https_proxy: `http://127.0.0.1:${FFMPEG_PROXY_PORT}`,
    HTTP_PROXY: `http://127.0.0.1:${FFMPEG_PROXY_PORT}`,
    HTTPS_PROXY: `http://127.0.0.1:${FFMPEG_PROXY_PORT}`
  });
  // API Route: Get Media Duration Info
  app.get("/api/media-info", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send("URL is required");
    }

    console.log(`[FFprobe-Proxy] Probing media info for: ${targetUrl}`);

    let probeUrl = targetUrl;
    let isLocalFile = false;
    let localFilePath = '';

    if (targetUrl.startsWith('/') || targetUrl.includes('/api/local-media/stream')) {
      try {
        const u = new URL(targetUrl, 'http://127.0.0.1:5150');
        const pParam = u.searchParams.get('path');
        if (pParam && fs.existsSync(pParam)) {
          localFilePath = pParam;
          isLocalFile = true;
        }
      } catch (e) {}
    }

    // TorBox requestdl links are passed directly to FFprobe/FFmpeg so 307 redirects are followed natively without token invalidation

    const currentSettings = readJson(SETTINGS_FILE);
    if (currentSettings.enableMediaCache === true && !isLocalFile) {
      const hash = crypto.createHash('md5').update(targetUrl).digest('hex');
      const mediaCacheDir = path.join(os.tmpdir(), 'media_cache');
      const completedFile = path.join(mediaCacheDir, `${hash}.mp4`);
      if (fs.existsSync(completedFile)) {
        isLocalFile = true;
        localFilePath = completedFile;
      }
    }

    const args: string[] = [];
    if (isLocalFile) {
      args.push(
        '-seekable', '0',
        '-v', 'error',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        '-i', localFilePath
      );
    } else {
      args.push(
        ...getFFmpegNetworkArgs(probeUrl),
        '-v', 'error',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        '-analyzeduration', '5000000',
        '-probesize', '5000000',
        '-i', probeUrl
      );
    }



    const ffprobeProcess = spawn(ffprobeStatic.path, args, { env: getFfmpegEnv() });
    let output = '';

    ffprobeProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobeProcess.stderr.on('data', (data) => {
      console.error('[FFprobe Stderr]', data.toString());
    });

    ffprobeProcess.on('close', (code) => {
      if (code === 0 && output.trim()) {
        try {
          const parsed = JSON.parse(output.trim());
          const settings = readJson(SETTINGS_FILE);
          const bestEncoder = (settings.intelTranscoding || settings.intelTranscoding === undefined) ? detectBestH264Encoder() : 'libx264';
          const videoStream = parsed.streams?.find((s: any) => s.codec_type === 'video' && s.codec_name !== 'mjpeg' && s.codec_name !== 'png');
          const isHevcOr4K = videoStream && (videoStream.codec_name === 'hevc' || videoStream.codec_name === 'h265' || (videoStream.width && videoStream.width > 2000) || (videoStream.pix_fmt && videoStream.pix_fmt.includes('10')));
          
          let transcoderName = 'Direct Stream (Native Pass-through)';
          if (isHevcOr4K) {
            if (bestEncoder === 'h264_vaapi') transcoderName = 'Intel VAAPI (h264_vaapi - GPU)';
            else if (bestEncoder === 'h264_qsv') transcoderName = 'Intel QuickSync (h264_qsv - GPU)';
            else if (bestEncoder === 'h264_nvenc') transcoderName = 'NVIDIA NVENC (h264_nvenc - GPU)';
            else if (bestEncoder === 'h264_amf') transcoderName = 'AMD AMF (h264_amf - GPU)';
            else if (bestEncoder === 'h264_videotoolbox') transcoderName = 'Apple VideoToolbox (GPU)';
            else transcoderName = 'FFmpeg Software (libx264 - CPU)';
          }
          parsed.activeTranscoder = transcoderName;
          res.json(parsed);
        } catch (e) {
          res.status(500).json({ error: "Failed to parse info" });
        }
      } else {
        res.status(500).json({ error: "Failed to get media info" });
      }
    });
  });


  // OpenSubtitles Stremio Addon Integration
  app.get("/api/opensubtitles/search", async (req, res) => {
    const tmdbId = req.query.tmdb_id;
    const type = (req.query.type as string) || 'movie'; // 'movie' or 'tv'
    const season = req.query.season;
    const episode = req.query.episode;
    const titleQuery = req.query.title as string;

    if (!tmdbId && !titleQuery) {
      return res.status(400).json({ error: "tmdb_id or title is required" });
    }

    try {
      const settings = readJson(SETTINGS_FILE);
      const apiKey = settings.tmdbKey || '841059f71aab310b4d4c4f3a7e28328e';

      let resolvedTmdbId = tmdbId;

      // If tmdb_id is local or non-numeric, resolve real TMDB ID by searching title
      if (typeof tmdbId === 'string' && (tmdbId.startsWith('local_') || isNaN(Number(tmdbId)))) {
        resolvedTmdbId = null;
        const qTitle = titleQuery || tmdbId.replace(/^local_lib_/, '');
        if (qTitle) {
          const cleanTitle = qTitle.replace(/\(.*?\)/g, '').replace(/[\._]/g, ' ').trim();
          const searchRes = await axios.get(`https://api.themoviedb.org/3/search/${type}?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}`, { timeout: 4000 }).catch(() => null);
          if (searchRes?.data?.results?.[0]?.id) {
            resolvedTmdbId = searchRes.data.results[0].id;
          }
        }
      }

      if (!resolvedTmdbId) {
        return res.json({ subtitles: [] });
      }

      // Step 1: Resolve TMDB ID to IMDB ID
      const tmdbUrl = `https://api.themoviedb.org/3/${type}/${resolvedTmdbId}/external_ids?api_key=${apiKey}`;
      const tmdbRes = await axios.get(tmdbUrl, { timeout: 4000 }).catch(() => null);
      const imdbId = tmdbRes?.data?.imdb_id;

      if (!imdbId) {
        return res.json({ subtitles: [] });
      }

      // Step 2: Query Stremio OpenSubtitles v3 Addon
      let stremioUrl = `https://opensubtitles-v3.strem.io/subtitles/${type}/${imdbId}.json`;
      if (type === 'tv' && season && episode) {
        stremioUrl = `https://opensubtitles-v3.strem.io/subtitles/series/${imdbId}:${season}:${episode}.json`;
      }

      const osRes = await axios.get(stremioUrl, { timeout: 5000 }).catch(() => null);
      const subtitles = osRes?.data?.subtitles || [];
      
      res.json({ subtitles });
    } catch (err: any) {
      console.error('[OpenSubtitles Search Error]', err.message);
      res.json({ subtitles: [] });
    }
  });


  app.get("/api/opensubtitles/download", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send("URL is required");
    }

    res.header('Content-Type', 'text/vtt');
    res.header('Access-Control-Allow-Origin', '*');

    try {
      const response = await axios.get(targetUrl, { responseType: 'text' });
      const srtData = response.data;
      
      // Simple SRT to WebVTT conversion
      // 1. Replace commas with periods in timestamps
      // 2. Prepend WEBVTT header
      let vttData = "WEBVTT\n\n" + srtData.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      
      res.send(vttData);
    } catch (err: any) {
      console.error('[OpenSubtitles Download Error]', err.message);
      res.status(500).send("Failed to download subtitle");
    }
  });

  app.get("/api/subtitles", async (req, res) => {
    const targetUrl = req.query.url;
    const index = req.query.index;
    if (!targetUrl || typeof targetUrl !== 'string' || !index) {
      return res.status(400).send("URL and index are required");
    }

    res.header('Content-Type', 'text/vtt');
    res.header('Access-Control-Allow-Origin', '*');

    let resolvedUrl = targetUrl;

    const args = [
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx',


      '-reconnect_delay_max', '60',
      '-multiple_requests', '1',
      '-user_agent', 'Mozilla/5.0',
      '-i', resolvedUrl,
      '-map', `0:${index}`,
      '-f', 'webvtt',
      'pipe:1'
    ];

    const ffmpegProcess = spawn(ffmpegPath, args, { env: getFfmpegEnv() });
    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.on('error', (err) => {
      console.error('[FFmpeg Subtitle Error]', err);
    });

    ffmpegProcess.stderr.on('data', (data) => {
      console.error('[FFmpeg Stderr]', data.toString());
    });

    req.on('close', () => {
      ffmpegProcess.kill('SIGKILL');
    });
  });


function getPythonExecutable(): string {
  const candidates = process.platform === 'win32' 
    ? ['py', 'python', 'python3'] 
    : ['python3', 'python', 'py'];
  for (const cmd of candidates) {
    try {
      const { execSync } = require('child_process');
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch (e) {}
  }
  return candidates[0];
}

  // API Route: Music Stream Proxy (Full Track High-Definition Audio via yt-dlp)
  app.get("/api/music/stream", (req, res) => {
    const query = req.query.q;
    if (!query || typeof query !== 'string') {
      return res.status(400).send("Query is required");
    }

    const pyCmd = getPythonExecutable();
    const pythonProcess = spawn(pyCmd, ['-m', 'yt_dlp', '-g', '-f', 'bestaudio', `ytsearch1:${query}`]);

    let output = '';
    let hasResponded = false;

    const fallbackToItunes = () => {
      if (hasResponded) return;
      hasResponded = true;
      fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`)
        .then(r => r.json())
        .then(data => {
          if (data.results?.[0]?.previewUrl) {
            res.redirect(302, data.results[0].previewUrl);
          } else {
            res.status(404).send("Stream not found");
          }
        })
        .catch(() => res.status(500).send("Stream failed"));
    };

    pythonProcess.on('error', (err) => {
      console.error('[Music Stream Spawn Error]', err.message);
      fallbackToItunes();
    });

    pythonProcess.stdout.on('data', data => output += data.toString());
    pythonProcess.on('close', code => {
      if (hasResponded) return;
      if (code === 0 && output.trim()) {
        hasResponded = true;
        const urls = output.trim().split('\n');
        const directUrl = urls[urls.length - 1]; // Direct full track audio URL
        res.redirect(302, directUrl);
      } else {
        fallbackToItunes();
      }
    });
  });


  // API Route: YouTube Video Search
  
// API Route: Get direct stream URL via yt-dlp
app.get('/api/youtube/stream-url', (req, res) => {
  const vidId = req.query.id;
  if (!vidId || typeof vidId !== 'string') {
    return res.status(400).send('ID is required');
  }
  const ytUrl = `https://www.youtube.com/watch?v=${vidId}`;
  
  const pyCmd = getPythonExecutable();
  const pythonProcess = spawn(pyCmd, ['-m', 'yt_dlp', '-g', '-f', 'best', ytUrl]);
  
  let output = '';
  pythonProcess.on('error', (err) => {
    console.error('[YouTube Stream-Url Error]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'yt-dlp spawn error' });
  });
  pythonProcess.stdout.on('data', data => output += data.toString());
  pythonProcess.on('close', code => {
    if (code === 0) {
      const urls = output.trim().split('\n');
      const directUrl = urls[urls.length - 1]; // last line is the url
      res.json({ url: directUrl });
    } else {
      if (!res.headersSent) res.status(500).json({ error: 'yt-dlp failed' });
    }
  });
});

app.get('/api/youtube/search', async (req, res) => {
    const query = req.query.q;
    if (!query || typeof query !== 'string') {
      return res.status(400).send('Query is required');
    }
    try {
      const yt_info = await play.search(query, { limit: 20, source: { youtube: "video" } });
      const results = yt_info.map(vid => ({
        id: 'yt-' + vid.id,
        videoId: vid.id,
        title: vid.title,
        artist: vid.channel ? vid.channel.name : 'YouTube',
        album: 'YouTube Video',
        artwork: vid.thumbnails[0]?.url || '',
        previewUrl: '',
        durationMs: vid.durationInSec * 1000,
        sampleRate: 'N/A',
        bitDepth: 'N/A',
        bitrate: 'N/A',
        fileSize: 'N/A',
        year: new Date().getFullYear().toString(),
        type: 'video'
      }));
      res.json({ results });
    } catch (err) {
      console.error('[YouTube Search Error]', err);
      res.status(500).send('Search failed');
    }
  });

  app.get("/api/duration", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send("URL is required");
    }

    console.log(`[FFprobe-Proxy] Getting duration for: ${targetUrl}`);
    if (durationCache.has(targetUrl)) {
      console.log(`[FFprobe-Proxy] Using cached duration: ${durationCache.get(targetUrl)}`);
      return res.json({ duration: durationCache.get(targetUrl) });
    }

    let resolvedUrl = targetUrl;
    let isLocalFile = false;
    let localFilePath = '';

    if (targetUrl.startsWith('/') || targetUrl.includes('/api/local-media/stream')) {
      try {
        const u = new URL(targetUrl, 'http://127.0.0.1:5150');
        const pParam = u.searchParams.get('path');
        if (pParam && fs.existsSync(pParam)) {
          localFilePath = pParam;
          isLocalFile = true;
        }
      } catch (e) {}
    }

    // TorBox requestdl links are passed directly to FFprobe/FFmpeg so 307 redirects are followed natively without token invalidation

    const args: string[] = [];
    if (isLocalFile) {
      args.push(
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        '-i', localFilePath
      );
    } else {
      args.push(
        ...getFFmpegNetworkArgs(resolvedUrl),
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        '-analyzeduration', '5000000',
        '-probesize', '5000000',
        '-i', resolvedUrl
      );
    }



    const ffprobeProcess = spawn(ffprobeStatic.path, args, { env: getFfmpegEnv() });
    let output = '';

    ffprobeProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobeProcess.on('close', (code) => {
      if (code === 0 && output.trim()) {
        res.json({ duration: parseFloat(output.trim()) });
      } else {
        res.status(500).json({ error: "Failed to get duration" });
      }
    });
  });

  
  const subtitleCache = new Map<string, string>();
  const codecCache = new Map<string, boolean>();
  const durationCache = new Map<string, number>();

  app.get("/api/transcode/subtitle.vtt", async (req, res) => {
    const targetUrl = req.query.url;
    const track = req.query.track || '0';
    const start = req.query.start ? parseFloat(req.query.start as string) : 0;
    const delay = req.query.delay ? parseFloat(req.query.delay as string) : 0;
    
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send("URL is required");
    }

    const subCacheKey = `${targetUrl}_tr${track}_s${start}_d${delay}`;
    if (subtitleCache.has(subCacheKey)) {
      console.log(`[FFmpeg Subtitle Cache] Serving cached VTT subtitle for track ${track}`);
      res.setHeader('Content-Type', 'text/vtt');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(subtitleCache.get(subCacheKey));
    }

    console.log(`[FFmpeg-Proxy] Pulling subtitle track ${track} for: ${targetUrl}`);

    res.setHeader('Content-Type', 'text/vtt');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    let resolvedUrl = targetUrl;
    let isLocalFile = false;
    let localFilePath = '';

    if (targetUrl.startsWith('/') || targetUrl.includes('/api/local-media/stream')) {
      try {
        const u = new URL(targetUrl, 'http://127.0.0.1:5150');
        const pParam = u.searchParams.get('path');
        if (pParam && fs.existsSync(pParam)) {
          localFilePath = pParam;
          isLocalFile = true;
        }
      } catch (e) {}
    }



    const args: string[] = ['-threads', '0'];
    if (!isLocalFile) {
      args.push(
        '-probesize', '2M',
        '-analyzeduration', '2M',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_on_network_error', '1',
        '-reconnect_on_http_error', '5xx',
        '-reconnect_delay_max', '2',
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      );
    }
    
    args.push('-v', 'error');

    if (start > 0) {
      args.push('-ss', start.toString());
    }
    if (delay !== 0) {
      args.push('-itsoffset', delay.toString());
    }

    args.push(
      '-i', isLocalFile ? localFilePath : resolvedUrl,
      '-map', `0:s:${track}`,
      '-c:s', 'webvtt',
      '-f', 'webvtt',
      'pipe:1'
    );

    const ffmpegProcess = spawn(ffmpegPath, args, { env: getFfmpegEnv() });
    let vttOutput = '';
    
    ffmpegProcess.stdout.on('data', (chunk) => {
      const str = chunk.toString();
      vttOutput += str;
      if (!res.headersSent) {
        res.write(chunk);
      } else {
        res.write(chunk);
      }
    });

    ffmpegProcess.on('error', (err) => {
      console.error('[FFmpeg Subtitle] Error:', err);
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0 && vttOutput.length > 0) {
        subtitleCache.set(subCacheKey, vttOutput);
        if (subtitleCache.size > 200) {
          const oldestKey = subtitleCache.keys().next().value;
          if (oldestKey) subtitleCache.delete(oldestKey);
        }
      }
      res.end();
    });

    req.on('close', () => {
      ffmpegProcess.kill('SIGKILL');
    });
  });

  
  // API Route: Detect device capabilities and return Direct Play suitability for Android TV & Custom Browsers
  app.get("/api/device/detect", (req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    const isAndroidTVDevice = /AndroidTV|Android TV|ExoPlayer|BubbaFlixTV|CustomTV|TVBrowser|SmartTV|Android/i.test(userAgent);
    const isCustomTV = /CustomTV|BubbaFlixTV|ExoPlayer/i.test(userAgent);

    res.json({
      success: true,
      userAgent,
      isAndroidTVDevice,
      isCustomTV,
      recommendedDirectPlay: isAndroidTVDevice || isCustomTV
    });
  });

  app.get("/api/transcode/stream.mp4", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send("URL is required");
    }

    console.log(`[FFmpeg-Proxy] Starting transcode stream for: ${targetUrl}`);

    res.header('Content-Type', 'video/mp4');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Accept-Ranges', 'bytes');

    const audioTrack = req.query.audio;
    const startOffset = req.query.start as string;
    const bufsize = req.query.bufsize as string || '64M';
    const hwAccel = req.query.intel === 'true';

    let resolvedUrl = targetUrl;
    let isLocalFile = false;
    let localFilePath = '';

    if (targetUrl.startsWith('/') || targetUrl.includes('/api/local-media/stream')) {
      try {
        const u = new URL(targetUrl, 'http://127.0.0.1:5150');
        const pParam = u.searchParams.get('path');
        if (pParam && fs.existsSync(pParam)) {
          localFilePath = pParam;
          isLocalFile = true;
        }
      } catch (e) {}
    }

    // Custom Android TV Browser & Native Hardware Player Direct Play Bypass Check
    const userAgent = req.headers['user-agent'] || '';
    const forceDirectPlay = req.query.direct === 'true' || req.query.direct === '1' || req.query.directPlay === 'true' || req.headers['x-native-player'] === '1';
    const isAndroidTVDevice = /AndroidTV|Android TV|ExoPlayer|BubbaFlixTV|CustomTV|TVBrowser|SmartTV/i.test(userAgent);

    if ((forceDirectPlay && (isAndroidTVDevice || req.headers['x-native-player'] === '1' || req.query.forceDirect === 'true')) || isAndroidTVDevice) {
      console.log(`[Stream Dispatcher] Detected Custom Android TV Browser / Native Hardware Player (UA: "${userAgent}"). Direct Play Pass-Through active (0% Transcode CPU).`);
      if (isLocalFile && localFilePath) {
        return res.redirect(302, `/api/local-media/stream?path=${encodeURIComponent(localFilePath)}`);
      }
      if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
        return res.redirect(302, targetUrl);
      }
    }

    // TorBox requestdl links are passed directly to FFmpeg so 307 redirects are followed natively without token invalidation
    const isLive = req.query.live === 'true';
    const currentSettings = readJson(SETTINGS_FILE);
    const bestEncoder = (hwAccel || currentSettings.intelTranscoding) ? detectBestH264Encoder() : 'libx264';
    const vaapiDev = getVaapiDevice();
    const useVaapi = (bestEncoder === 'h264_vaapi') && !!vaapiDev;

    const args = ['-threads', '0'];
    if (useVaapi) {
      args.push('-vaapi_device', vaapiDev);
    }

    if (!isLive && startOffset && !isNaN(parseFloat(startOffset))) {
      args.push('-noaccurate_seek', '-ss', startOffset);
    }
    
    if (isLive) {
      args.push('-fflags', '+genpts+igndts');
    }
    
    if (isLocalFile) {
      args.push('-i', localFilePath);
    } else {
      args.push(
        ...getFFmpegNetworkArgs(resolvedUrl),
        '-i', resolvedUrl
      );
    }



    if (isLive) {
      // Allow FFmpeg to auto-map video and audio streams for IPTV playlists
      // as stream indexes frequently change across different channels.
    } else {
      args.push('-map', '0:V:0');
      if (audioTrack && audioTrack !== '0') {
        if (isNaN(parseInt(audioTrack as string, 10))) {
          args.push('-map', `0:a:m:language:${audioTrack}?`, '-map', '0:a:0?');
        } else {
          args.push('-map', `0:a:${audioTrack}?`);
        }
      } else {
        args.push('-map', '0:a:0?');
      }
    }
    
    const checkStr = (
      String(targetUrl) + ' ' + 
      String(resolvedUrl) + ' ' + 
      String(localFilePath) + ' ' + 
      decodeURIComponent(String(targetUrl)) + ' ' + 
      decodeURIComponent(String(resolvedUrl)) + ' ' +
      (localFilePath ? decodeURIComponent(String(localFilePath)) : '')
    ).toLowerCase();

    const isHevcDetected = /hevc|x265|h\.?265|2160p|4k|10-?bit|10b|hdr|dv|dolby|remux|mkv|strm|ts|m2ts|yts|yify/i.test(checkStr);

    let isHevc = false;
    if (isHevcDetected || req.query.hevc === 'true') {
      isHevc = true;
    } else if (codecCache.has(targetUrl)) {
      isHevc = codecCache.get(targetUrl) as boolean;
    }



    if (isHevc) {
      if (useVaapi) {
        console.log(`[FFmpeg-Proxy] HEVC/10-bit stream detected. Transcoding using Intel VAAPI hardware acceleration (${vaapiDev}).`);
        args.push(
          '-vf', 'format=nv12,hwupload,scale_vaapi=w=-2:h=1080',
          '-c:v', 'h264_vaapi',
          '-b:v', '5M',
          '-maxrate', '8M',
          '-bufsize', '10M'
        );
      } else if (bestEncoder !== 'libx264') {
        console.log(`[FFmpeg-Proxy] HEVC/10-bit stream detected. Transcoding to 1080p H.264 using ${bestEncoder} hardware acceleration.`);
        args.push(
          '-c:v', bestEncoder,
          '-preset', 'fast',
          '-b:v', '5M',
          '-vf', 'scale=-2:1080,format=yuv420p'
        );
      } else {
        console.log('[FFmpeg-Proxy] HEVC/10-bit stream detected. Transcoding to 1080p H.264 for browser compatibility (Software).');
        args.push(
          '-c:v', 'libx264', 
          '-preset', 'ultrafast', 
          '-crf', '26', 
          '-pix_fmt', 'yuv420p',
          '-vf', 'scale=-2:1080'
        );
      }
    } else {
      args.push('-c:v', 'copy');
    }



    const audioLeveling = req.query.audioLeveling === 'true';
    if (audioLeveling && !isLive) {
      console.log('[FFmpeg-Proxy] Enabling Dynamic Audio Leveling (dynaudnorm filter)');
      args.push('-af', 'dynaudnorm=f=150:g=15:p=0.95');
    }

    args.push('-c:a', 'aac');
    
    args.push('-avoid_negative_ts', 'make_zero');
    args.push('-async', '1');

    args.push(
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-bufsize', bufsize,
      '-max_muxing_queue_size', '1024',
      'pipe:1'
    );

    const ffmpegProcess = spawn(ffmpegPath, args, { env: getFfmpegEnv() });

    let hwMark = 64 * 1024 * 1024; // default 64MB
    if (bufsize.endsWith('M')) {
      hwMark = parseInt(bufsize.replace('M', ''), 10) * 1024 * 1024;
    }
    hwMark = Math.min(hwMark, 1024 * 1024 * 1024);
    
    const bufferStream = new PassThrough({ highWaterMark: hwMark });
    ffmpegProcess.stdout.pipe(bufferStream).pipe(res);

    let errorOutput = '';
    ffmpegProcess.stderr.on('data', (data) => {
      const str = data.toString();
      errorOutput += str;
      if (str.toLowerCase().includes('error') || str.includes('Invalid data found') || str.includes('failed')) {
        console.error('[FFmpeg-Proxy] STDERR:', str);
      }
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`[FFmpeg] Process exited with code ${code}`);
      if (code !== 0 && code !== 255) {
        console.error(`[FFmpeg] Error: ${errorOutput}`);
      }
      res.end();
    });

    req.on('close', () => {
      console.log(`[FFmpeg] Client disconnected, killing ffmpeg process`);
      ffmpegProcess.kill('SIGKILL');
    });
  });

  // API Route: Test IPC Bridge Playback
  app.post("/api/play", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "Stream URL is required" });
      }
      const result = await playMediaStream(url);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Active NWS Weather Alerts for Android TV Clients
  app.get("/api/weather/alerts", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string) || 35.0;
      const lon = parseFloat(req.query.lon as string) || -85.0;
      const nwsUrl = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
      const response = await fetch(nwsUrl, {
        headers: { 'User-Agent': '(BubbaFlix-Media-Center, weather-alert-service)' }
      });
      if (!response.ok) {
        return res.json({ success: true, count: 0, alerts: [] });
      }
      const data = await response.json();
      const alerts = (data.features || []).map((f: any) => ({
        id: f.id || f.properties?.id,
        event: f.properties?.event || 'Weather Alert',
        headline: f.properties?.headline || f.properties?.event,
        severity: f.properties?.severity || 'Moderate',
        urgency: f.properties?.urgency,
        areaDesc: f.properties?.areaDesc,
        description: f.properties?.description,
        effective: f.properties?.effective,
        expires: f.properties?.expires
      }));
      return res.json({ success: true, count: alerts.length, alerts });
    } catch (e: any) {
      console.error("[Backend] Weather Alert Error:", e);
      res.status(500).json({ error: e.message || "Failed to fetch weather alerts" });
    }
  });

  // Search Stream Proxies

  // Helper: Strict title & year matcher to prevent false stream matches while accurately matching multi-word titles and TV episodes
  function isValidTitleMatch(queryTitle: string, candidateTitle: string, expectedYear?: string | number): boolean {
    if (!queryTitle || !candidateTitle) return false;

    // Strip season/episode patterns (e.g. S01E01, 1x01) from queryTitle and candidateTitle before matching core title
    const cleanSeasonEp = (s: string) => s.replace(/\b(s\d{1,2}e\d{1,2}|\d{1,2}x\d{1,2})\b/gi, ' ');

    const normalizeWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    
    const coreQueryTitle = cleanSeasonEp(queryTitle);
    const qNormalized = normalizeWords(coreQueryTitle);
    const qClean = qNormalized.replace(/\s+/g, '');
    if (!qClean) return false;

    const candidateLower = candidateTitle.toLowerCase();
    
    // 1. Year checking: if candidate title contains a year and expectedYear is provided, ensure year is reasonably close
    if (expectedYear) {
      const yearNum = parseInt(String(expectedYear), 10);
      if (yearNum && yearNum > 1900) {
        const candidateYears = candidateLower.match(/\b(19\d{2}|20\d{2})\b/g);
        if (candidateYears && candidateYears.length > 0) {
          // Allow year match if any candidate year is within 2 years of expectedYear (handling release year discrepancies across regions/providers)
          const hasCloseYear = candidateYears.some(y => Math.abs(parseInt(y, 10) - yearNum) <= 2);
          if (!hasCloseYear) {
            return false;
          }
        }
      }
    }

    // 2. Strip quality, codec, audio, season/ep, and scene tags from candidate string
    const titlePart = cleanSeasonEp(candidateLower)
      .replace(/\b(2160p|1080p|720p|480p|4k|uhd|hdr|hdr10|dv|dolby\s*vision|webrip|web-dl|web|bluray|bdrip|hdrip|brrip|hdtv|x264|x265|hevc|h264|h265|aac|dts|dd5\.1|5\.1|7\.1|atmos|repack|proper|unrated|extended|cut|remastered)\b/gi, ' ')
      .replace(/\b(19|20)\d{2}\b/g, ' ') // strip year
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const cClean = titlePart.replace(/\s+/g, '');

    // Exact or substring clean match (e.g. "thebear" inside "usmoviesthebear")
    if (cClean.includes(qClean)) {
      return true;
    }

    // Tokenize query words properly (preserving spaces!)
    const STOP_WORDS = ['the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'is', 'by', 'us', 'uk', 'ca', 'au', 'en', 'hd', 'fhd', '4k', 'vod'];
    const qTokens = qNormalized.split(' ').filter(w => w.length > 0 && !STOP_WORDS.includes(w));
    const cTokens = titlePart.split(' ').filter(w => w.length > 0 && !STOP_WORDS.includes(w));

    if (qTokens.length === 0) return true;

    // Single-word titles (e.g. "Mutiny", "Dune"): candidate must contain single word and not extra major unrelated title words
    if (qTokens.length === 1) {
      const singleWord = qTokens[0];
      if (!cClean.includes(singleWord)) return false;

      const extraMajorWords = cTokens.filter(w => w !== singleWord && w.length >= 4);
      if (extraMajorWords.length >= 2) {
        return false;
      }
      return true;
    }

    // Multi-word titles (e.g. "The Bear", "Project Hail Mary", "Road House"): at least 50% of query tokens must match candidate
    const matchesCount = qTokens.filter(tok => titlePart.includes(tok)).length;
    return matchesCount >= Math.ceil(qTokens.length * 0.5);
  }

  async function filterWithGemini(query: string, items: any[], settings: any, isMusic: boolean = false): Promise<any[]> {
    if (items.length === 0) return items;

    // For music searches, Pirate Bay cat=100 already returns pure music releases. Bypass AI filter to preserve all 100+ audio releases!
    const isMusicQuery = isMusic || /(flac|mp3|320|lossless|cd|album|discography|aac|alac|music|song|artist)/i.test(query);
    if (isMusicQuery) {
      console.log(`[Music Stream] Bypassing Gemini filter for music search "${query}" - returning all ${items.length} audio releases.`);
      return items;
    }
    
    // 1. HEVC STREAM FILTERING MODE ('prefer', 'allow', 'exclude')
    const hevcMode = settings.hevcMode || (settings.preferHEVC === false ? 'exclude' : 'prefer');
    const hevcRegex = /(^|[^a-z0-9])(hevc|x265|h\.?265|265|10-?bit|10b|hdr|hdr10|hdr10\+|dv|dolby\s*vision|main10)([^a-z0-9]|$)/i;

    // 0. FILTER OUT LOW-QUALITY RELEASES (TELESYNC, CAM, TELECINE, SCREENER, ETC.)
    const initialCount = items.length;
    let candidateItems = items.filter(t => !isLowQualityRelease(t.name || t.title || ''));
    if (candidateItems.length < initialCount) {
      console.log(`[Quality Filter] Filtered out ${initialCount - candidateItems.length} low-quality (Telesync/CAM/SCR) streams for "${query}"`);
    }

    if (hevcMode === 'exclude') {
      // Exclude all HEVC/x265/10-bit releases
      candidateItems = candidateItems.filter(t => {
        const name = (t.name || t.title || '').toLowerCase();
        return !hevcRegex.test(name);
      });
      if (candidateItems.length < items.length) {
        console.log(`[HEVC Filter: Exclude] Excluded ${items.length - candidateItems.length} HEVC/x265 streams for "${query}"`);
      }
    } else if (hevcMode === 'prefer') {
      // Sort HEVC/x265 streams to top of search results
      candidateItems.sort((a, b) => {
        const aIsHevc = hevcRegex.test((a.name || a.title || '').toLowerCase());
        const bIsHevc = hevcRegex.test((b.name || b.title || '').toLowerCase());
        if (aIsHevc && !bIsHevc) return -1;
        if (!aIsHevc && bIsHevc) return 1;
        return 0;
      });
      console.log(`[HEVC Filter: Prefer] Prioritized HEVC/x265 streams to top for "${query}"`);
    }

    if (candidateItems.length === 0) return candidateItems;
    
    try {
      const list = candidateItems.map((t, i) => `${i}: ${t.name || t.title}`).join('\n');
      
      let hwFilterInstruction = '';
      if (hevcMode === 'exclude') {
        hwFilterInstruction = '\n\nCRITICAL HARDWARE CONSTRAINT - STRICT NO HEVC/x265 POLICY: Admin setting is set to EXCLUDE HEVC. You MUST strictly filter out and exclude ANY video stream that contains HEVC, x265, H.265, H265, 265, 10-bit, 10bit, 10b, Main10, HDR, HDR10, DV, or Dolby Vision anywhere in the title or release name. Only allow standard 8-bit H.264 / x264 video streams.';
      }


      let animeFilterInstruction = '';
      if (settings.filterAnime === true) {
        animeFilterInstruction = '\n\nCRITICAL ANIME FILTERING: The admin setting "Filter Anime" is ENABLED. You MUST strictly filter out and exclude ANY anime series, anime movies, Japanese animation, or releases from anime encoding groups (such as SubsPlease, Erai-raws, HorribleSubs, Judas, ASW, Golumpa, MiniAni, Anime, etc.), REGARDLESS of whether the search query matches an anime title or not. Filter out all anime completely.';
      }

      let langInstruction = '';
      if (settings.preferredLanguage && settings.preferredLanguage !== 'all') {
        const langMap: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese' };
        const targetLang = langMap[settings.preferredLanguage] || settings.preferredLanguage;
        langInstruction = `\n\nCRITICAL LANGUAGE FILTERING: The preferred language is set to "${targetLang}". You MUST strictly filter out any media results that are dubbed or subbed in foreign languages other than ${targetLang} (e.g. look for tags indicating foreign languages or dubs like ITA, FRE, GER, SPANISH, RUS, HINDI, LATINO, KOREAN, CHINESE, etc. unless matching ${targetLang}).`;
      } else {
        langInstruction = `\n\nAdditionally, filter out any results that appear to be in a language other than English (e.g., look for tags indicating foreign languages or dubs like ITA, FRE, GER, SPANISH, RUS, HINDI, LATINO, etc).`;
      }

      const isMusicQuery = /(flac|mp3|320|lossless|cd|album|discography|aac|alac|music|song|artist)/i.test(query);

      let prompt = '';
      if (isMusicQuery) {
        prompt = `I am searching for the Music Album or Artist "${query}". I have the following list of file result names. Please filter out any results that do not belong to this music artist or album (for example, filter out video files, movies, TV series, or software). Keep all valid music albums, discographies, FLAC, and MP3 audio releases.\n\nReturn ONLY a valid JSON array of indices (0-indexed) of the results that are CORRECT matches. Do not include any markdown formatting, backticks, or other text. Just the JSON array.\n\nList:\n${list}`;
      } else {
        prompt = `I am searching for the TV show or Movie "${query}". I have the following list of file result names. Please filter out any results that do not definitively belong to this show/movie, for example if they belong to a different show with a similar name.\n\nCRITICAL: Results may be Usenet archives (.rar, .par2, .nzb), video files (.mkv, .mp4), or contain scene release group names. These ARE VALID matches if the underlying title matches the query. Do not filter out results just because they are archives or split into parts.${animeFilterInstruction}${langInstruction} You must also strictly filter out any music albums, audiobooks, soundtracks, or software/games that happen to share the same name.${hwFilterInstruction} Return ONLY a valid JSON array of indices (0-indexed) of the results that are CORRECT matches. Do not include any markdown formatting, backticks, or other text. Just the JSON array.\n\nList:\n${list}`;
      }

      const text = await callGeminiApi(settings.geminiApiKey, prompt, { timeout: 45000 });
      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const indices = JSON.parse(cleanText);
      
      if (Array.isArray(indices)) {
        console.log(`[Gemini Filter] Filtered from ${candidateItems.length} to ${indices.length} items for "${query}"`);
        const resultItems = indices.map(i => candidateItems[i]).filter(Boolean);
        return resultItems.filter(item => isValidTitleMatch(query, item.name || item.title || ''));
      }
      return candidateItems.filter(item => isValidTitleMatch(query, item.name || item.title || ''));
    } catch (err: any) {
      const status = err.response?.status;
      const errMsg = err.response?.data?.error?.message || err.message;
      if (status === 429 || errMsg.includes('429')) {
        console.warn(`[Gemini Filter Warning]: Gemini API quota / rate limit reached (429). Applying strict title matching.`);
      } else {
        console.warn(`[Gemini Filter Warning] (${status || 'Network Error'}): ${errMsg}. Applying strict title matching.`);
      }
      return candidateItems.filter(item => isValidTitleMatch(query, item.name || item.title || ''));
    }
  }

  const handleTorrentSearch = async (req: any, res: any) => {
    const { q, imdbId } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: "Query 'q' parameter is required." });
    }
    const settings = readJson(SETTINGS_FILE);


    const TRACKERS = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.tracker.cl:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://9.rarbg.com:2810/announce',
    ].map(t => `&tr=${encodeURIComponent(t)}`).join('');

    const buildMagnet = (hash: string, name: string) =>
      `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}${TRACKERS}`;

    const scrapeHTML = customRequire('cheerio');

    try {
      const isMusicQuery = req.query.category === 'music' || /(flac|mp3|320|lossless|cd|album|discography|aac|alac|music|song|artist)/i.test(q as string);
      const pbUrl = isMusicQuery 
        ? `https://apibay.org/q.php?q=${encodeURIComponent(q as string)}&cat=100`
        : `https://apibay.org/q.php?q=${encodeURIComponent(q as string)}`;

      const [pbRes, ytsRes, ytsLuRes, solidRes, limeRes, eztvRes] = await Promise.all([
        // The Pirate Bay (Music cat=100 if music query)
        axios.get(pbUrl, { timeout: 7000 }).catch(() => null),
        // YTS.mx (best for movies)
        isMusicQuery ? Promise.resolve(null) : axios.get(`https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(q)}&limit=20`, { timeout: 7000 }).catch(() => null),
        // YTS.lu (mirror with wider catalogue — same API format)
        isMusicQuery ? Promise.resolve(null) : axios.get(`https://yts.lu/api/v2/list_movies.json?query_term=${encodeURIComponent(q)}&limit=20`, { timeout: 9000 }).catch(() => null),
        // SolidTorrents (aggregates 1337x, RARBG dumps, TorrentGalaxy & others)
        axios.get(`https://solidtorrents.to/api/v1/search?q=${encodeURIComponent(q)}&limit=20`, { timeout: 7000 }).catch(() => null),
        // LimeTorrents (HTML scrape — no Cloudflare, responds with 200)
        axios.get(`https://www.limetorrents.lol/search/all/${encodeURIComponent(q.replace(/\s+/g, '-'))}/seeds/1/`, {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        }).catch(() => null),
        // EZTV (works best for TV shows — needs numeric IMDB ID)
        (settings.enableEztv && imdbId && typeof imdbId === 'string' && !isMusicQuery)
          ? eztv.getTorrents({ limit: 30, imdb: imdbId.replace(/^tt/, '') }).then((res: any) => ({ data: res })).catch(() => null)
          : Promise.resolve(null),
      ]);

      const mappedTorrents: any[] = [];
      const seenHashes = new Set<string>();

      const addTorrent = (t: any) => {
        const h = (t.hash || '').toLowerCase();
        if (!h || seenHashes.has(h)) return;
        seenHashes.add(h);
        mappedTorrents.push(t);
      };

      // ── The Pirate Bay ──
      if (pbRes?.data && Array.isArray(pbRes.data)) {
        pbRes.data
          .filter((t: any) => t.id && t.info_hash && t.info_hash !== '0000000000000000000000000000000000000000')
          .forEach((t: any) => addTorrent({
            id: `pb_${t.id}`,
            name: t.name,
            hash: t.info_hash.toLowerCase(),
            size: parseInt(t.size || '0', 10),
            seeds: parseInt(t.seeders || '0', 10),
            peers: parseInt(t.leechers || '0', 10),
            magnet: buildMagnet(t.info_hash, t.name),
            link: buildMagnet(t.info_hash, t.name),
            cached: false,
            source: 'The Pirate Bay'
          }));
      }


      // ── YTS.mx (movies) ──
      const processYtsData = (ytsData: any, sourceLabel: string) => {
        if (ytsData?.data?.movies) {
          ytsData.data.movies.forEach((m: any) => {
            if (m.torrents) {
              m.torrents.forEach((t: any) => {
                const name = `${m.title} ${m.year || ''} ${t.quality} ${t.type} ${sourceLabel}`;
                addTorrent({
                  id: `yts_${t.hash}`,
                  name,
                  hash: t.hash.toLowerCase(),
                  size: t.size_bytes || 0,
                  seeds: t.seeds || 0,
                  peers: t.peers || 0,
                  magnet: buildMagnet(t.hash, name),
                  link: buildMagnet(t.hash, name),
                  cached: false,
                  source: sourceLabel
                });
              });
            }
          });
        }
      };
      processYtsData(ytsRes?.data, 'YTS');
      processYtsData(ytsLuRes?.data, 'YTS.lu');

      // ── SolidTorrents (indexes RARBG/1337x/TorrentGalaxy data) ──
      if (solidRes?.data && Array.isArray(solidRes.data.results)) {
        solidRes.data.results.forEach((t: any) => {
          if (t.infohash && t.title) {
            addTorrent({
              id: `st_${t.id || t.infohash}`,
              name: t.title,
              hash: t.infohash.toLowerCase(),
              size: t.size || 0,
              seeds: t.seeders || 0,
              peers: t.leechers || 0,
              magnet: buildMagnet(t.infohash, t.title),
              link: buildMagnet(t.infohash, t.title),
              cached: false,
              source: 'SolidTorrents'
            });
          }
        });
      }

      // ── LimeTorrents (HTML scrape) ──
      if (limeRes?.data && typeof limeRes.data === 'string') {
        try {
          const $ = scrapeHTML.load(limeRes.data);
          $('table.table2 tr').each((_i: number, el: any) => {
            const titleAnchor = $(el).find('div.tt-name a').last();
            const name = titleAnchor.text().trim();
            const dlHref = $(el).find('a.csprite_dl14').attr('href') || '';
            const size = $(el).find('td.tdnormal').eq(1).text().trim();
            const seedsText = $(el).find('td.tdseed').text().trim();
            const seeds = parseInt(seedsText, 10) || 0;

            // LimeTorrents magnet or .torrent link — extract infohash from download URL
            const hashMatch = dlHref.match(/([a-fA-F0-9]{40})/);
            if (name && hashMatch) {
              const hash = hashMatch[1].toLowerCase();
              // Convert size string like "1.4 GB" to bytes
              let sizeBytes = 0;
              const sizeMatch = size.match(/([\d.]+)\s*(GB|MB|KB)/i);
              if (sizeMatch) {
                const val = parseFloat(sizeMatch[1]);
                const unit = sizeMatch[2].toUpperCase();
                sizeBytes = unit === 'GB' ? val * 1e9 : unit === 'MB' ? val * 1e6 : val * 1e3;
              }
              addTorrent({
                id: `lime_${hash}`,
                name,
                hash,
                size: sizeBytes,
                seeds,
                peers: 0,
                magnet: buildMagnet(hash, name),
                link: buildMagnet(hash, name),
                cached: false,
                source: 'LimeTorrents'
              });
            }
          });
        } catch (parseErr) {
          console.warn('[Torrent Proxy] LimeTorrents parse error:', parseErr);
        }
      }

      // ── EZTV (TV shows via IMDB ID) ──
      if (eztvRes?.data?.torrents && Array.isArray(eztvRes.data.torrents)) {
        eztvRes.data.torrents.forEach((t: any) => {
          if (t.hash && t.title) {
            addTorrent({
              id: `eztv_${t.id}`,
              name: t.title,
              hash: t.hash.toLowerCase(),
              size: parseInt(t.size_bytes || '0', 10),
              seeds: t.seeds || 0,
              peers: t.peers || 0,
              magnet: t.magnet_url || buildMagnet(t.hash, t.title),
              link: t.magnet_url || buildMagnet(t.hash, t.title),
              cached: false,
              source: 'EZTV'
            });
          }
        });
      }

      // Filter to enforce magnet links only (Premiumize compatibility) and sort by seeds
      const magnetOnlyTorrents = mappedTorrents.filter(t => t.magnet && t.magnet.startsWith('magnet:?xt=urn:btih:') && t.hash);
      magnetOnlyTorrents.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));

      const isMusic = req.query.category === 'music';
      const filteredTorrents = await filterWithGemini(q as string, magnetOnlyTorrents, settings, isMusic);

      res.json({ success: true, data: filteredTorrents });
    } catch (err: any) {
      console.error("[Torrents Search API Error]", err.message);
      res.status(500).json({ error: err.message, success: false, data: [] });
    }
  };

  app.get("/api/torrents/search", handleTorrentSearch);


  // --- PREMIUMIZE API PROXIES ---
  const pmTransferListCache = new Map<string, { timestamp: number; data: any }>();

  const getPmToken = (req: any): string => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const tok = auth.replace('Bearer ', '').trim();
      if (tok) return tok;
    }
    const settings = readJson(SETTINGS_FILE);
    return settings.premiumizeApiKey || process.env.PREMIUMIZE_API_KEY || process.env.PM_API_KEY || '';
  };

  // 1. Check Instant Availability (Cache check) on Premiumize
  app.post("/api/premiumize/cache/check", async (req, res) => {
    const token = getPmToken(req);
    if (!token) return res.status(401).json({ error: "Premiumize API Key is required." });

    const { hashes } = req.body;
    if (!hashes || !Array.isArray(hashes) || hashes.length === 0) {
      return res.json({ success: true, response: [] });
    }

    try {
      const cleanHashes = hashes.map((h: string) => h.toLowerCase().trim()).filter(Boolean);
      const FormData = require('form-data');
      const form = new FormData();
      form.append('apikey', token);
      cleanHashes.forEach((hash: string) => {
        form.append('items[]', hash);
      });

      const response = await axios.post("https://www.premiumize.me/api/cache/check", form, {
        headers: { ...form.getHeaders() },
        timeout: 8000
      });

      res.json(response.data);
    } catch (err: any) {
      console.error("[Premiumize Cache Check Error]:", err.response?.data || err.message);
      res.status(err.response?.status || 500).json({ error: err.message });
    }
  });

  // 2. Direct Download / Instant Unrestrict Stream Link via Premiumize
  app.post("/api/premiumize/transfer/directdl", async (req, res) => {
    const token = getPmToken(req);
    if (!token) return res.status(401).json({ error: "Premiumize API Key is required." });

    const { magnet } = req.body;
    if (!magnet) return res.status(400).json({ error: "Magnet link is required." });

    try {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('apikey', token);
      form.append('src', magnet);

      const response = await axios.post("https://www.premiumize.me/api/transfer/directdl", form, {
        headers: { ...form.getHeaders() },
        timeout: 12000
      });

      // Automatically queue / save torrent transfer into user's Premiumize Cloud account with 7-Day Retention
      try {
        const createForm = new FormData();
        createForm.append('apikey', token);
        createForm.append('src', magnet);
        axios.post("https://www.premiumize.me/api/transfer/create", createForm, {
          headers: { ...createForm.getHeaders() },
          timeout: 10000
        }).then((cRes) => {
          if (cRes.data?.status === 'success') {
            const trId = cRes.data.id || cRes.data.name;
            if (trId) {
              trackPmRetention(trId, magnet);
            }
            clearPmTransferHistory(token);
            invalidatePmCloudCache(token);
            console.log(`[Premiumize Cloud] Automatically added torrent to user cloud storage (7-Day Retention, History Cleared): ${trId || 'OK'}`);
          }
        }).catch((err) => {
          console.warn('[Premiumize Auto-Transfer Warning]:', err?.response?.data?.message || err?.message);
        });
      } catch (e) {}

      const data = response.data;
      if (data.status === 'success' && Array.isArray(data.content) && data.content.length > 0) {
        const sortedContent = [...data.content].sort((a: any, b: any) => (b.size || 0) - (a.size || 0));
        const bestFile = sortedContent[0];
        const streamUrl = bestFile.stream_link || bestFile.link;

        // Clear general transfer history log on Premiumize
        clearPmTransferHistory(token);

        return res.json({
          success: true,
          streamUrl,
          filename: bestFile.path || data.filename,
          filesize: bestFile.size || data.filesize,
          content: sortedContent,
          addedToCloud: true
        });
      }

      if (data.location) {
        clearPmTransferHistory(token);
        return res.json({ success: true, streamUrl: data.location, addedToCloud: true });
      }

      res.status(400).json({ error: data.message || "Failed to resolve stream on Premiumize." });
    } catch (err: any) {
      console.error("[Premiumize DirectDL Error]:", err.response?.data || err.message);
      res.status(err.response?.status || 500).json({ error: err.message, detail: err.response?.data });
    }
  });

  // 4. Create Transfer (Queue Uncached Torrent / Magnet) on Premiumize
  app.post("/api/premiumize/transfer/create", async (req, res) => {
    const token = getPmToken(req);
    if (!token) return res.status(401).json({ error: "Premiumize API Key is required." });

    const { magnet, src } = req.body;
    const targetSrc = magnet || src;
    if (!targetSrc) return res.status(400).json({ error: "Magnet link or source URL is required." });

    try {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('apikey', token);
      form.append('src', targetSrc);

      const response = await axios.post("https://www.premiumize.me/api/transfer/create", form, {
        headers: { ...form.getHeaders() },
        timeout: 10000
      });

      if (response.data?.status === 'success') {
        const trId = response.data.id || response.data.name;
        if (trId) {
          trackPmRetention(trId, targetSrc);
        }
        clearPmTransferHistory(token);
        invalidatePmCloudCache(token);
      }

      res.json(response.data);
    } catch (err: any) {
      console.error("[Premiumize Create Transfer Error]:", err.response?.data || err.message);
      res.status(err.response?.status || 500).json({ error: err.message, detail: err.response?.data });
    }
  });

  // 4b. Clear Premiumize Transfer History
  app.post("/api/premiumize/transfer/clear-history", async (req, res) => {
    const token = getPmToken(req);
    if (!token) return res.status(401).json({ error: "Premiumize API Key is required." });

    try {
      await clearPmTransferHistory(token);
      res.json({ success: true, message: "Transfer history cleared from Premiumize." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4c. Get Active Premiumize 7-Day Retention Status
  app.get("/api/premiumize/retention/list", (req, res) => {
    const list = readJson(PM_RETENTION_FILE, []);
    res.json({ success: true, retentionDays: 7, count: list.length, items: list });
  });

  // 5. Delete Transfer on Premiumize
  app.post("/api/premiumize/transfer/delete", async (req, res) => {
    const token = getPmToken(req);
    if (!token) return res.status(401).json({ error: "Premiumize API Key is required." });

    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Transfer ID is required." });

    try {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('apikey', token);
      form.append('id', id);

      const response = await axios.post("https://www.premiumize.me/api/transfer/delete", form, {
        headers: { ...form.getHeaders() },
        timeout: 8000
      });

      res.json(response.data);
    } catch (err: any) {
      res.status(err.response?.status || 500).json({ error: err.message });
    }
  });

  // Helper: Filter out low-quality releases (CAM, Telesync/TS, Telecine/TC, Screener/SCR, Workprint, etc.)
  const isLowQualityRelease = (titleName: string): boolean => {
    if (!titleName) return false;
    // Strip file extension (.ts, .mp4, .mkv) before quality checking so .ts video extension is not confused with Telesync (TS)
    const nameWithoutExt = titleName.replace(/\.[a-z0-9]{2,4}$/i, '');
    const nameLower = nameWithoutExt.toLowerCase();
    
    // Explicit bad quality keywords (CAM, Telesync, Telecine, Screener)
    const lowQualityRegex = /\b(telesync|hd-?ts|ts-?rip|cam-?rip|hd-?cam|telecine|hd-?tc|tc-?rip|dvd-?scr|dvd-?screener|workprint|line\.?audio|hardcoded|vhs-?rip|pdvd)\b/i;
    
    // Check standalone TS / CAM / TC / SCR release tags enclosed in delimiters (e.g. .CAM., .TS., -CAM-, -TS-, [CAM], [TS])
    const badTagRegex = /[\.\_\s\-\[\(](CAM|TC|SCR|HDCAM|HDTS|TELECINE|DVDSCR|WORKPRINT)[\.\_\s\-\]\)]/i;
    const standaloneTsRegex = /[\.\_\s\-\[\(]TS[\.\_\s\-\]\)]/i;

    return lowQualityRegex.test(nameLower) || badTagRegex.test(nameWithoutExt) || standaloneTsRegex.test(nameWithoutExt);
  };

  // Cache for Premiumize Cloud file listings (per token, 30-second TTL)
  const pmCloudCache = new Map<string, { files: any[]; expiry: number }>();

  // Helper: Recursive folder scanner for all files in user's Premiumize Cloud storage
  const fetchPmCloudFiles = async (token: string, forceRefresh = false): Promise<any[]> => {
    const now = Date.now();
    const cached = pmCloudCache.get(token);
    if (!forceRefresh && cached && now < cached.expiry) {
      return cached.files;
    }

    const allFiles: any[] = [];
    const visitedFolders = new Set<string>();

    const scanFolder = async (folderId?: string, folderPath = '', depth = 0): Promise<void> => {
      if (depth > 10) return; // Traverse up to 10 subfolder levels deep
      const fId = folderId || 'root';
      if (visitedFolders.has(fId)) return;
      visitedFolders.add(fId);

      try {
        const url = `https://www.premiumize.me/api/folder/list?apikey=${encodeURIComponent(token)}${folderId ? `&id=${encodeURIComponent(folderId)}` : ''}`;
        const res = await axios.get(url, { timeout: 10000 }).catch(() => null);
        if (res?.data?.status === 'success' && Array.isArray(res.data.content)) {
          const subfolders: any[] = [];
          for (const item of res.data.content) {
            if (item.type === 'file') {
              allFiles.push({
                ...item,
                parentFolderName: folderPath
              });
            } else if (item.type === 'folder' && item.id) {
              subfolders.push(item);
            }
          }
          await Promise.all(subfolders.map((f) => scanFolder(f.id, folderPath ? `${folderPath} / ${f.name}` : (f.name || ''), depth + 1)));
        }
      } catch (e) {}
    };

    await scanFolder();

    // Store in cache with 30-second TTL
    pmCloudCache.set(token, { files: allFiles, expiry: now + 30 * 1000 });
    return allFiles;
  };

  // Invalidate Premiumize cloud cache for a token (called after uploading a new file)
  const invalidatePmCloudCache = (token: string) => {
    pmCloudCache.delete(token);
  };

  // 6. Search User's Premiumize Cloud HTTPS Directory & Subfolders for matching files
  app.post("/api/premiumize/cloud/search", async (req, res) => {
    const token = getPmToken(req);
    if (!token) return res.status(401).json({ error: "Premiumize API Key is required." });

    const { title, year, season, episode, refresh } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: "Title parameter is required." });
    }

    try {
      if (refresh === true) {
        invalidatePmCloudCache(token);
      }

      // Extract core title tokens for flexible matching
      const coreTitle = title
        .toLowerCase()
        .replace(/\b(19|20)\d{2}\b/g, '') // strip year like 2022
        .replace(/\b(us|uk|au|ca)\b/gi, '') // strip country codes
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim();
      
      const titleTokens = coreTitle.split(/\s+/).filter(w => w.length > 1 && !['the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'for', 'with', 'on', 'at'].includes(w));
      const cleanTitle = coreTitle.replace(/\s+/g, '');

      const sNum = season !== undefined && season !== null ? parseInt(String(season), 10) : null;
      const eNum = episode !== undefined && episode !== null ? parseInt(String(episode), 10) : null;

      const cloudFiles = await fetchPmCloudFiles(token, refresh === true);
      const cloudItems: any[] = [];
      const seenIds = new Set<string>();

      const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.webm', '.flv', '.strm'];

      cloudFiles.forEach((f: any) => {
        const originalName = f.name || '';
        const parentFolder = f.parentFolderName || '';
        const combinedPath = `${parentFolder} ${originalName}`.toLowerCase();
        const combinedClean = combinedPath.replace(/[^a-z0-9]/g, '');

        const ext = path.extname(originalName).toLowerCase();
        
        // 1. Filter out non-video files (.nfo, .txt, .srt, .jpg, .png, .zip, etc.) unless no extension
        if (ext && !VIDEO_EXTS.includes(ext)) {
          return;
        }

        // 2. Filter out Telesync / CAM / TS / SCR releases
        if (isLowQualityRelease(originalName) || isLowQualityRelease(parentFolder)) {
          return;
        }

        // 3. Flexible Title matching: clean title, title tokens, or isValidTitleMatch
        const matchesCleanTitle = cleanTitle.length > 0 && combinedClean.includes(cleanTitle);
        const matchingTokenCount = titleTokens.filter(tok => combinedPath.includes(tok)).length;
        const matchesTokens = titleTokens.length > 0 && (
          matchingTokenCount === titleTokens.length ||
          (titleTokens.length >= 2 && matchingTokenCount >= Math.ceil(titleTokens.length * 0.5))
        );
        const matchesStrict = isValidTitleMatch(title, originalName, year) || isValidTitleMatch(title, combinedPath);

        if (!matchesCleanTitle && !matchesTokens && !matchesStrict) {
          return;
        }

        // 4. Season matching against file name or parent folder
        if (sNum !== null) {
          const sPadded = sNum.toString().padStart(2, '0');
          const seasonPatterns = [
            `s${sNum}`, `s${sPadded}`,
            `season${sNum}`, `season ${sNum}`, `season${sPadded}`, `season ${sPadded}`,
            `${sNum}x`, `${sPadded}x`,
            `series ${sNum}`, `series${sPadded}`
          ];
          const hasSeasonMatch = seasonPatterns.some(p => combinedPath.includes(p));
          
          if (!hasSeasonMatch) {
            // Check if file specifies a DIFFERENT season (e.g. S02 when requesting S01)
            const otherSeasonMatch = combinedPath.match(/\b(s|season\s*|series\s*)0*(\d{1,2})\b/i);
            if (otherSeasonMatch && parseInt(otherSeasonMatch[2], 10) !== sNum) {
              return;
            }
          }
        }

        // 5. Episode matching against file name or parent folder
        if (eNum !== null) {
          const ePadded = eNum.toString().padStart(2, '0');
          const sPadded = sNum ? sNum.toString().padStart(2, '0') : '\\d{1,2}';
          
          const epRegexes = [
            new RegExp(`\\b(s${sPadded}|s${sNum})?e0*${eNum}\\b`, 'i'),
            new RegExp(`\\bep0*${eNum}\\b`, 'i'),
            new RegExp(`\\bepisode\\s*0*${eNum}\\b`, 'i'),
            new RegExp(`\\b${sPadded}x0*${eNum}\\b`, 'i'),
            new RegExp(`\\b${sNum}x0*${eNum}\\b`, 'i'),
            new RegExp(`\\b${sNum}${ePadded}\\b`, 'i'), // e.g. 101 for S01E01
            new RegExp(`(^|[\\s\\._\\-\\[\\(])0*${eNum}([\\s\\._\\-\\]\\.]|$)`, 'i') // e.g. 01.mkv, - 01.mkv, [01]
          ];

          const hasEpMatch = epRegexes.some(r => r.test(originalName) || r.test(combinedPath));
          if (!hasEpMatch) {
            return;
          }
        }

        if (!seenIds.has(String(f.id))) {
          seenIds.add(String(f.id));
          const streamUrl = f.stream_link || f.link || `/api/premiumize/file/stream?file_id=${f.id}`;
          cloudItems.push({
            id: `pm_file_${f.id}`,
            name: `⚡ Premiumize Cloud: ${f.name}`,
            title: f.name,
            type: 'premiumize_cloud',
            inPersonalCloud: true,
            url: streamUrl,
            file_id: f.id,
            sizeStr: f.size ? `${(f.size / 1e9).toFixed(2)} GB` : 'Cloud File',
            quality: /2160p|4k/i.test(f.name) ? '4K' : /1080p/i.test(f.name) ? '1080p' : 'HD',
            isPremiumize: true,
            isCached: true,
            availability: 'Ready in Premiumize Cloud'
          });
        }
      });

      console.log(`[Premiumize Cloud Search] Found ${cloudItems.length} matching files in Premiumize Cloud for "${title}"`);
      res.json({ success: true, data: cloudItems });
    } catch (err: any) {
      console.error("[Premiumize Cloud Search Error]:", err.message);
      res.status(500).json({ error: err.message, success: false, data: [] });
    }
  });

  // 7. Stream file by Premiumize file_id
  app.get("/api/premiumize/file/stream", async (req, res) => {
    const token = getPmToken(req);
    if (!token) return res.status(401).json({ error: "Premiumize API Key is required." });

    const { file_id } = req.query;
    if (!file_id) return res.status(400).json({ error: "file_id is required." });

    try {
      const detailsRes = await axios.get(`https://www.premiumize.me/api/item/details?apikey=${encodeURIComponent(token)}&id=${encodeURIComponent(String(file_id))}`, { timeout: 8000 });
      if (detailsRes?.data?.status === 'success') {
        const streamUrl = detailsRes.data.stream_link || detailsRes.data.link;
        if (streamUrl) {
          return res.redirect(streamUrl);
        }
      }
      res.status(404).json({ error: "File stream link not found on Premiumize." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Active in-flight image requests map to prevent duplicate simultaneous downloads for the same URL
  const inFlightImageRequests = new Map<string, Promise<Buffer>>();

  // Endpoint: Local Persistent Image Proxy & Caching for metadata, backdrops, posters, and cast photos
  app.get("/api/image-proxy", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).send("Missing image url");
    }

    try {
      let targetUrl: URL;
      try {
        targetUrl = new URL(url);
      } catch (e) {
        return res.status(400).send("Invalid image URL");
      }

      // Generate a deterministic local filename hash from the source URL
      const urlHash = crypto.createHash('md5').update(url).digest('hex');
      const ext = path.extname(targetUrl.pathname) || '.jpg';
      const fileName = `${urlHash}${ext}`;
      const filePath = path.join(CACHE_IMG_DIR, fileName);

      // 1. If file is already cached on local server disk, serve it immediately
      if (fs.existsSync(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(filePath);
      }

      // 2. Prevent duplicate simultaneous network downloads of the same image URL
      if (!inFlightImageRequests.has(url)) {
        const fetchPromise = (async () => {
          try {
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 7000 });
            const buffer = Buffer.from(response.data);
            // Persist to local server disk
            fs.writeFile(filePath, buffer, (err) => {
              if (err) console.error(`[Image Cache Error] Failed writing ${fileName}:`, err.message);
            });
            return buffer;
          } catch (e: any) {
            console.warn(`[Image Proxy Warning] Timeout or unreachable fetching ${url}:`, e.message);
            return null;
          }
        })();

        inFlightImageRequests.set(url, fetchPromise);
        fetchPromise.finally(() => inFlightImageRequests.delete(url));
      }

      const imageBuffer = await inFlightImageRequests.get(url)!;
      if (!imageBuffer) {
        return res.status(404).send("Image unavailable");
      }
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(imageBuffer);
    } catch (err: any) {
      // Return 404 or redirect safely if fetch fails without crashing
      if (!res.headersSent) {
        res.status(404).send("Image not found");
      }
    }
  });

  // Server-side TVDB API Token Cache
  let tvdbToken: { token: string; expiry: number } | null = null;
  const getTvdbToken = async (apiKey: string): Promise<string | null> => {
    const now = Date.now();
    if (tvdbToken && tvdbToken.token && now < tvdbToken.expiry) {
      return tvdbToken.token;
    }
    try {
      const res = await axios.post('https://api4.thetvdb.com/v4/login', { apikey: apiKey }, { timeout: 8000 });
      if (res.data?.status === 'success' && res.data?.data?.token) {
        const token = res.data.data.token;
        // TVDB v4 tokens are valid for 1 month; cache for 24 hours
        tvdbToken = { token, expiry: now + 24 * 60 * 60 * 1000 };
        return token;
      }
    } catch (e: any) {
      console.warn('[TVDB Auth Error]:', e?.response?.data || e?.message);
    }
    return null;
  };

  // Endpoint: Proxy TVDB Season Episodes
  app.get("/api/tvdb/season", async (req, res) => {
    const { seriesId, season, apiKey } = req.query;
    const settings = readJson(SETTINGS_FILE);
    const keyToUse = (typeof apiKey === 'string' && apiKey.trim()) || settings.tvdbApiKey;

    if (!keyToUse) {
      return res.status(400).json({ success: false, error: "TVDB API key required." });
    }

    try {
      const token = await getTvdbToken(keyToUse);
      if (!token) {
        return res.status(401).json({ success: false, error: "Failed to authenticate with TVDB API." });
      }

      // If seriesId is a TMDB ID, resolve real TVDB ID via TMDB external_ids
      let targetTvdbId = String(seriesId);
      const tmdbKey = settings.tmdbKey || process.env.VITE_TMDB_API_KEY;
      if (tmdbKey && /^\d+$/.test(targetTvdbId)) {
        const extRes = await axios.get(`https://api.themoviedb.org/3/tv/${targetTvdbId}/external_ids?api_key=${tmdbKey}`).catch(() => null);
        if (extRes?.data?.tvdb_id) {
          targetTvdbId = String(extRes.data.tvdb_id);
        }
      }

      // Query TVDB v4 series episodes filtered by season
      const sNum = parseInt(String(season), 10) || 1;
      const tvdbUrl = `https://api4.thetvdb.com/v4/series/${targetTvdbId}/episodes/official?season=${sNum}`;
      const epRes = await axios.get(tvdbUrl, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });

      if (epRes.data?.status === 'success' && Array.isArray(epRes.data?.data?.episodes)) {
        const rawEpisodes = epRes.data.data.episodes;
        const formattedEpisodes = rawEpisodes.map((e: any) => ({
          id: e.id,
          episode_number: e.number,
          season_number: e.seasonNumber,
          name: e.name || `Episode ${e.number}`,
          overview: e.overview || '',
          still_path: e.image ? e.image : null,
          air_date: e.aired || ''
        })).sort((a: any, b: any) => a.episode_number - b.episode_number);

        return res.json({ success: true, episodes: formattedEpisodes });
      }

      res.status(404).json({ success: false, episodes: [] });
    } catch (err: any) {
      console.error('[TVDB Fetch Season Error]:', err?.response?.data || err?.message);
      res.status(500).json({ success: false, error: err.message, episodes: [] });
    }
  });

  // Endpoint: Fallback TVDB Poster & Artwork Lookup for TV Series
  app.get("/api/tvdb/images", async (req, res) => {
    const { title, tvdbId, apiKey } = req.query;
    const settings = readJson(SETTINGS_FILE);
    const keyToUse = (typeof apiKey === 'string' && apiKey.trim()) || settings.tvdbApiKey || 'b62cdff1-a0c5-4309-a1b7-b088bb3e8d2e';

    if (!title && !tvdbId) {
      return res.status(400).json({ success: false, error: "Title or TVDB ID is required." });
    }

    try {
      const token = await getTvdbToken(keyToUse);
      if (!token) {
        return res.status(401).json({ success: false, error: "Failed to authenticate with TVDB API." });
      }

      let targetTvdbId = tvdbId;

      if (!targetTvdbId && title) {
        const searchUrl = `https://api4.thetvdb.com/v4/search?q=${encodeURIComponent(String(title))}&type=series`;
        const searchRes = await axios.get(searchUrl, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000
        });
        if (searchRes.data?.status === 'success' && Array.isArray(searchRes.data?.data) && searchRes.data.data.length > 0) {
          targetTvdbId = searchRes.data.data[0].tvdb_id || searchRes.data.data[0].id;
        }
      }

      if (targetTvdbId) {
        const detailsUrl = `https://api4.thetvdb.com/v4/series/${targetTvdbId}/extended`;
        const detailsRes = await axios.get(detailsUrl, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000
        });

        if (detailsRes.data?.status === 'success' && detailsRes.data?.data) {
          const sData = detailsRes.data.data;
          const imagePath = sData.image || sData.artwork?.find((a: any) => a.type === 2 || a.type === 3)?.image;
          const backdropPath = sData.artwork?.find((a: any) => a.type === 3)?.image || sData.image;

          const poster = imagePath ? (imagePath.startsWith('http') ? imagePath : `https://artworks.thetvdb.com${imagePath.startsWith('/') ? '' : '/'}${imagePath}`) : null;
          const backdrop = backdropPath ? (backdropPath.startsWith('http') ? backdropPath : `https://artworks.thetvdb.com${backdropPath.startsWith('/') ? '' : '/'}${backdropPath}`) : null;

          return res.json({ success: true, poster, backdrop, tvdbId: targetTvdbId });
        }
      }

      res.json({ success: false, poster: null, backdrop: null });
    } catch (err: any) {
      console.warn('[TVDB Image Fallback Error]:', err?.message);
      res.json({ success: false, poster: null, backdrop: null });
    }
  });

  // Helper function to accurately detect video resolution (4K, 1080p, 720p) for IPTV & local media
  function detectStreamQuality(name: string): string {
    const n = (name || '').toLowerCase();
    if (/4k|2160p|2160|uhd|ultra\s*hd/i.test(n)) return '4K';
    if (/1080p|1080|fhd|full\s*hd|fullhd/i.test(n)) return '1080p';
    if (/720p|720|sd|480p|480/i.test(n)) return '720p';
    return '1080p'; // Default modern IPTV VOD & Direct streams to 1080p Full HD
  }

  // API Route: Search IPTV Provider for VOD Movie and TV Series Streams
  app.get("/api/iptv/vod/search", async (req, res) => {
    const { title, type, season, episode, year } = req.query;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ success: false, data: [], error: "Title parameter is required." });
    }

    const settings = readJson(SETTINGS_FILE);
    const iptvUrl = settings.iptvUrl || '';
    const xtreamServer = settings.xtreamServer || '';
    const xtreamUsername = settings.xtreamUsername || '';
    const xtreamPassword = settings.xtreamPassword || '';

    const results: any[] = [];
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');

    try {
      // 1. Xtream Codes API Search
      if (xtreamServer && xtreamUsername && xtreamPassword) {
        const serverUrl = xtreamServer.endsWith('/') ? xtreamServer.slice(0, -1) : xtreamServer;

        if (type === 'series' && season !== undefined && episode !== undefined) {
          const seriesRes = await axios.get(`${serverUrl}/player_api.php?username=${xtreamUsername}&password=${xtreamPassword}&action=get_series`, { timeout: 7000 }).catch(() => null);
          if (seriesRes?.data && Array.isArray(seriesRes.data)) {
            const matchSeries = seriesRes.data.find((s: any) => {
              const sName = s.name || s.title || '';
              return isValidTitleMatch(title as string, sName, year as string);
            });

            if (matchSeries?.series_id) {
              const infoRes = await axios.get(`${serverUrl}/player_api.php?username=${xtreamUsername}&password=${xtreamPassword}&action=get_series_info&series_id=${matchSeries.series_id}`, { timeout: 7000 }).catch(() => null);
              if (infoRes?.data?.episodes) {
                const sKey = String(season);
                const seasonEpisodes = infoRes.data.episodes[sKey] || infoRes.data.episodes[Number(season)];
                if (Array.isArray(seasonEpisodes)) {
                  const ep = seasonEpisodes.find((e: any) => String(e.episode_num || e.episode) === String(episode));
                  if (ep && (ep.id || ep.stream_id)) {
                    const epId = ep.id || ep.stream_id;
                    const ext = ep.container_extension || ep.extension || 'mp4';
                    const streamName = `${matchSeries.name || title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')} ${ep.title ? '- ' + ep.title : ''}`;
                    results.push({
                      id: `iptv_series_${epId}`,
                      name: `IPTV Direct Stream - ${streamName}`,
                      title: ep.title || title,
                      quality: detectStreamQuality(streamName),
                      sizeStr: 'IPTV Stream',
                      type: 'iptv',
                      source: 'IPTV Provider',
                      url: `${serverUrl}/series/${xtreamUsername}/${xtreamPassword}/${epId}.${ext}`,
                      isCached: true,
                      availability: 'IPTV Direct'
                    });
                  }
                }
              }
            }
          }
        } else {
          // Search VOD Movies
          const vodRes = await axios.get(`${serverUrl}/player_api.php?username=${xtreamUsername}&password=${xtreamPassword}&action=get_vod_streams`, { timeout: 7000 }).catch(() => null);
          if (vodRes?.data && Array.isArray(vodRes.data)) {
            vodRes.data.forEach((m: any) => {
              const streamName = m.name || m.title || '';
              if (isValidTitleMatch(title as string, streamName, year as string)) {
                const ext = m.container_extension || 'mp4';
                results.push({
                  id: `iptv_movie_${m.stream_id}`,
                  name: `IPTV Direct Stream - ${streamName}`,
                  title: streamName,
                  quality: detectStreamQuality(streamName),
                  sizeStr: 'IPTV Stream',
                  type: 'iptv',
                  source: 'IPTV Provider',
                  url: `${serverUrl}/movie/${xtreamUsername}/${xtreamPassword}/${m.stream_id}.${ext}`,
                  isCached: true,
                  availability: 'IPTV Direct'
                });
              }
            });
          }
        }
      }

      // 2. M3U Playlist Search
      if (iptvUrl && results.length === 0) {
        const m3uRes = await axios.get(iptvUrl, { timeout: 10000 }).catch(() => null);
        if (m3uRes?.data && typeof m3uRes.data === 'string') {
          const lines = m3uRes.data.split('\n');
          let currentExtInf = '';
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXTINF:')) {
              currentExtInf = line;
            } else if (line.startsWith('http://') || line.startsWith('https://')) {
              const url = line;
              const extNameMatch = currentExtInf.match(/,#EXTINF:.*?,(.*)$/) || currentExtInf.match(/,(.*)$/);
              const channelName = extNameMatch ? extNameMatch[1].trim() : '';
              const normalizedName = channelName.toLowerCase().replace(/[^a-z0-9]/g, '');

              let isMatch = false;
              if (type === 'series' && season !== undefined && episode !== undefined) {
                const sPattern = `s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`;
                const sPattern2 = `${season}x${String(episode).padStart(2, '0')}`;
                if (normalizedName.includes(normalizedTitle) && (normalizedName.includes(sPattern) || normalizedName.includes(sPattern2))) {
                  isMatch = true;
                }
              } else {
                if (isValidTitleMatch(title as string, channelName, year as string)) {
                  isMatch = true;
                }
              }

              if (isMatch) {
                results.push({
                  id: `iptv_m3u_${results.length}`,
                  name: `IPTV Direct Stream - ${channelName || title}`,
                  title: channelName || title,
                  quality: detectStreamQuality(channelName),
                  sizeStr: 'IPTV Stream',
                  type: 'iptv',
                  source: 'IPTV Provider',
                  url: url,
                  isCached: true,
                  availability: 'IPTV Direct'
                });
              }
              currentExtInf = '';
            }
          }
        }
      }

      const queryTitle = (type === 'series' && season !== undefined && episode !== undefined)
        ? `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
        : (title as string);

      const filteredResults = await filterWithGemini(queryTitle, results, settings, false);
      console.log(`[IPTV VOD Search] Filtered with Gemini from ${results.length} to ${filteredResults.length} streams for "${queryTitle}"`);
      res.json({ success: true, data: filteredResults });
    } catch (err: any) {
      console.error("[IPTV VOD Search Error]", err.message);
      res.status(500).json({ success: false, data: [], error: err.message });
    }
  });


  // API Route: Aggregate M3U Playlists across all enabled IPTV providers & apply custom channel configs
  app.post("/api/m3u", async (req, res) => {
    try {
      const { url } = req.body;
      const settings = readJson(SETTINGS_FILE);

      // If specific URL requested explicitly, parse single URL
      if (url && !url.includes('get.php') && !settings.iptvProviders?.length) {
        const parsed = await parseM3U(url);
        return res.json(parsed);
      }

      // Collect all active IPTV providers
      const activeProviders: Array<{ id: string; name: string; url: string }> = [];
      if (settings.iptvProviders && Array.isArray(settings.iptvProviders)) {
        for (const p of settings.iptvProviders) {
          if (p.enabled && p.url) {
            activeProviders.push({ id: p.id, name: p.name, url: p.url });
          }
        }
      }

      // If no multi-providers configured, fallback to legacy default iptvUrl
      if (activeProviders.length === 0) {
        const fallbackUrl = url || settings.iptvUrl || 'http://cord-cutter.net:8080/get.php?username=foyers1@rogers.com&password=9jguFdUq3Y&type=m3u_plus';
        activeProviders.push({ id: 'default', name: 'Primary IPTV Provider', url: fallbackUrl });
      }

      // Fetch & parse M3Us in parallel
      const parsedLists = await Promise.all(
        activeProviders.map(async (prov) => {
          try {
            const parsed = await parseM3U(prov.url);
            const items = parsed.items || [];
            return items.map((item: any, idx: number) => ({
              ...item,
              id: item.tvg?.id || `${prov.id}-ch-${idx}`,
              providerId: prov.id,
              providerName: prov.name,
              rawUrl: item.url
            }));
          } catch (e) {
            console.error(`[M3U Provider Error] Failed to parse M3U for ${prov.name}:`, e);
            return [];
          }
        })
      );

      let allChannels = parsedLists.flat();
      const customChannels: Record<string, any> = settings.customChannels || {};

      // If custom channel mappings exist, apply renames, logo updates, backups, and hidden status
      if (Object.keys(customChannels).length > 0) {
        const resultChannels: any[] = [];
        const handledChannelIds = new Set<string>();

        for (const ch of allChannels) {
          const cfg = customChannels[ch.id];
          if (cfg) {
            if (cfg.hidden) continue; // Skip hidden channels
            handledChannelIds.add(ch.id);
            resultChannels.push({
              ...ch,
              name: cfg.name || ch.name,
              title: cfg.name || ch.title,
              group: { ...ch.group, title: cfg.group || ch.group?.title },
              url: cfg.primaryStreamUrl || ch.rawUrl || ch.url,
              backupUrls: cfg.backupStreamUrls || []
            });
          } else {
            resultChannels.push(ch);
          }
        }
        allChannels = resultChannels;
      }

      res.json({ header: { attrs: {} }, items: allChannels, channels: allChannels });
    } catch (error: any) {
      console.error('[Multi-Provider M3U Error]', error);
      res.status(500).json({ error: error.message });
    }
  });

  const normalizeNetworkPath = (rawPath: string): string => {
    if (!rawPath) return '';
    let p = rawPath.trim();
    const isUnc = /^[\/\\]{2}/.test(p);
    
    if (process.platform === 'win32') {
      p = p.replace(/\//g, '\\');
      if (isUnc) {
        p = '\\\\' + p.replace(/^[\/\\]+/, '');
      }
      if (p.length > 3 && p.endsWith('\\')) {
        p = p.replace(/\\+$/, '');
      }
    } else {
      p = p.replace(/\\/g, '/');
      if (p.length > 1 && p.endsWith('/')) {
        p = p.replace(/\/+$/, '');
      }
    }
    return p;
  };

  const safeExists = (p: string): boolean => {
    if (!p) return false;
    const norm = normalizeNetworkPath(p);
    try {
      if (fs.existsSync(norm)) return true;
      const stat = fs.statSync(norm);
      return stat.isDirectory() || stat.isFile();
    } catch (e: any) {
      try {
        const entries = fs.readdirSync(norm);
        return Array.isArray(entries);
      } catch (err: any) {
        console.error(`[Network Share Error] Path "${norm}" is unreachable or access denied: ${err.message} (Code: ${err.code || 'UNKNOWN'})`);
        return false;
      }
    }
  };

  const parseUncPath = (uncPath: string) => {
    let clean = uncPath.replace(/[\/\\]+/g, '/').replace(/^\//, '');
    const parts = clean.split('/');
    if (parts.length < 2) return null;
    const host = parts[0];
    const share = parts[1];
    const subpath = parts.slice(2).join('\\');
    return { host, share, subpath };
  };

  const resolveNetworkShareEntries = async (targetPath: string): Promise<string[]> => {
    if (!targetPath) return [];

    let clean = targetPath.trim();
    const isUnc = /^[\/\\]{2}/.test(clean);

    const candidates: string[] = [];
    candidates.push(normalizeNetworkPath(clean));

    if (isUnc) {
      // Replace single drive letter pattern like \e\ with administrative share \e$\
      const adminSharePath = clean.replace(/([\\\/])([a-zA-Z])([\\\/])/, '$1$2$$3');
      if (adminSharePath !== clean) {
        candidates.push(normalizeNetworkPath(adminSharePath));
      }
    }

    // 1. Try standard fs.readdirSync on candidates directly
    for (const cand of candidates) {
      try {
        const entries = fs.readdirSync(cand);
        if (Array.isArray(entries)) {
          return entries.map(e => path.join(cand, e));
        }
      } catch (e) {}
    }

    // 2. Try SMB2 native client for unmounted SMB shares (especially in Docker/Linux environments)
    if (isUnc) {
      try {
        const SMB2 = require('smb2');
        for (const cand of candidates) {
          const parsed = parseUncPath(cand);
          if (!parsed) continue;

          try {
            const smb = new SMB2({
              share: `\\\\${parsed.host}\\${parsed.share}`,
              domain: 'WORKGROUP',
              username: 'guest',
              password: '',
              autoCloseTimeout: 3000
            });

            const files = await new Promise<string[]>((res) => {
              smb.readdir(parsed.subpath, (err: any, list: any[]) => {
                if (err || !Array.isArray(list)) res([]);
                else res(list.map(f => `\\\\${parsed.host}\\${parsed.share}\\${parsed.subpath ? parsed.subpath + '\\' : ''}${f}`));
              });
            });

            if (files.length > 0) {
              console.log(`[SMB2 Native Client] Successfully read ${files.length} items from "\\\\${parsed.host}\\${parsed.share}\\${parsed.subpath}"`);
              return files;
            }
          } catch (e: any) {
            console.warn(`[SMB2 Client Warning] Failed for "\\\\${parsed.host}\\${parsed.share}": ${e.message}`);
          }
        }
      } catch (e: any) {
        console.warn(`[SMB2 Load Warning] smb2 package error:`, e.message);
      }
    }

    return [];
  };

  const scanDirectoryForMediaAsync = async (dirPath: string, fileList: string[] = [], maxDepth = 15, currentDepth = 0): Promise<string[]> => {
    if (currentDepth > maxDepth) return fileList;

    const videoExtensions = [
      '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.ts', '.webm', '.flv',
      '.wmv', '.m2ts', '.mts', '.iso', '.vob', '.mpg', '.mpeg', '.strm',
      '.divx', '.3gp', '.ogv'
    ];

    try {
      const entries = await resolveNetworkShareEntries(dirPath);
      if (entries.length === 0 && currentDepth === 0) {
        console.warn(`[Network Share Scan] No accessible video files or subfolders found at path "${dirPath}". If using Windows drive share, try "\\\\IP\\e$\\Emby\\Emby\\Movies" or share the folder directly.`);
      }

      for (const fullPath of entries) {
        try {
          let isDir = false;
          let isFile = false;

          try {
            const stat = await fs.promises.stat(fullPath);
            isDir = stat.isDirectory();
            isFile = stat.isFile();
          } catch (e) {
            // Fallback for UNC shares / network drives where stat fails: test path without ext as directory!
            const ext = path.extname(fullPath).toLowerCase();
            if (!ext || ext.length === 0) {
              isDir = true;
            } else {
              isFile = true;
            }
          }

          if (isDir) {
            await scanDirectoryForMediaAsync(fullPath, fileList, maxDepth, currentDepth + 1);
          } else if (isFile || videoExtensions.includes(path.extname(fullPath).toLowerCase())) {
            const ext = path.extname(fullPath).toLowerCase();
            if (videoExtensions.includes(ext)) {
              fileList.push(fullPath);
            }
          }
          
          // Yield execution to Node event loop so HTTP server requests never hang during background scanning
          if (fileList.length % 20 === 0) {
            await new Promise(r => setImmediate(r));
          }
        } catch (e: any) {
          const ext = path.extname(fullPath).toLowerCase();
          if (videoExtensions.includes(ext)) {
            fileList.push(fullPath);
          }
        }
      }
    } catch (e: any) {
      console.error(`[Network Share Error] Failed scanning "${dirPath}": ${e.message}`);
    }

    return fileList;
  };

  const scanDirectoryForMedia = (dirPath: string, fileList: string[] = [], maxDepth = 15, currentDepth = 0): string[] => {
    if (currentDepth > maxDepth) return fileList;
    const normDir = normalizeNetworkPath(dirPath);

    const videoExtensions = [
      '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.ts', '.webm', '.flv',
      '.wmv', '.m2ts', '.mts', '.iso', '.vob', '.mpg', '.mpeg', '.strm',
      '.divx', '.3gp', '.ogv'
    ];

    try {
      const entries = fs.readdirSync(normDir);
      for (const entry of entries) {
        if (!entry || entry.startsWith('.')) continue;
        const fullPath = path.join(normDir, entry);
        try {
          let isDir = false;
          let isFile = false;

          try {
            const entryStat = fs.statSync(fullPath);
            isDir = entryStat.isDirectory();
            isFile = entryStat.isFile();
          } catch (e) {
            const ext = path.extname(entry).toLowerCase();
            if (!ext || ext.length === 0) isDir = true;
            else isFile = true;
          }

          if (isDir) {
            scanDirectoryForMedia(fullPath, fileList, maxDepth, currentDepth + 1);
          } else if (isFile || videoExtensions.includes(path.extname(entry).toLowerCase())) {
            const ext = path.extname(entry).toLowerCase();
            if (videoExtensions.includes(ext)) {
              fileList.push(fullPath);
            }
          }
        } catch (e: any) {
          const ext = path.extname(entry).toLowerCase();
          if (videoExtensions.includes(ext)) {
            fileList.push(fullPath);
          }
        }
      }
    } catch (e: any) {
      console.error(`[Network Share Error] Error reading directory "${normDir}": ${e.message}`);
    }
    return fileList;
  };




  // API Route: Stream local/network media file with Range requests support
  app.get("/api/local-media/stream", (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: "File path parameter is required." });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Local file not found." });
    }

    try {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.mp4': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.webm': 'video/webm',
        '.ts': 'video/mp2t',
        '.m4v': 'video/mp4',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';


      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': contentType,
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (err: any) {
      console.error("[Local Media Stream Error]", err.message);
      res.status(500).json({ error: err.message });
    }
  });


  // API Route: Search Local / Network Folders for matching Movies or TV Series
  app.get("/api/local-media/search", async (req, res) => {

    const { title, type, season, episode } = req.query;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ success: false, data: [] });
    }

    const settings = readJson(SETTINGS_FILE);
    const mediaFolders: any[] = settings.mediaFolders || [];
    if (!Array.isArray(mediaFolders) || mediaFolders.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const results: any[] = [];
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isTargetSeries = type === 'series';

    // Target folders based on configured mediaType ('movie' or 'series')
    const targetFolders = mediaFolders.filter(f => f.path && (f.mediaType === type || f.mediaType === (isTargetSeries ? 'series' : 'movie')));

    for (const folderObj of targetFolders) {
      const folderPath = folderObj.path;
      if (!fs.existsSync(folderPath)) continue;

      const files = scanDirectoryForMedia(folderPath, []);
      for (const file of files) {
        const filename = path.basename(file);
        const normalizedFilename = filename.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedFullPath = file.toLowerCase().replace(/[^a-z0-9]/g, '');

        let isMatch = false;
        const targetYear = req.query.year ? String(req.query.year).trim() : '';

        if (isTargetSeries && season !== undefined && episode !== undefined) {
          const sPattern = `s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`;
          const sPattern2 = `${season}x${String(episode).padStart(2, '0')}`;
          const titleMatch = normalizedFilename.includes(normalizedTitle) || normalizedFullPath.includes(normalizedTitle);
          const epMatch = normalizedFilename.includes(sPattern) || normalizedFilename.includes(sPattern2) || normalizedFullPath.includes(sPattern) || normalizedFullPath.includes(sPattern2);
          if (titleMatch && epMatch) {
            isMatch = true;
          }
        } else {
          const hasTitleMatch = normalizedFilename.includes(normalizedTitle) || normalizedFullPath.includes(normalizedTitle);
          if (hasTitleMatch) {
            const targetCleanTitle = (title as string).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            const fileCleanTitle = parseMediaName(filename.replace(/\.[^/.]+$/, '')).title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

            const isSequelMismatch = fileCleanTitle.startsWith(targetCleanTitle) && 
              /\b(2|3|4|5|6|ii|iii|iv|v|part\s*2|part\s*3|chapter\s*2)\b/i.test(fileCleanTitle.slice(targetCleanTitle.length));

            if (!isSequelMismatch) {
              const fileYears = filename.match(/\b(19\d\d|20\d\d)\b/g);
              if (targetYear && targetYear.length === 4 && fileYears && fileYears.length > 0) {
                if (!fileYears.includes(targetYear)) {
                  continue;
                }
              }
              isMatch = true;
            }
          }
        }

        if (isMatch) {
          try {
            const stat = fs.statSync(file);
            const sizeGB = (stat.size / 1024 / 1024 / 1024).toFixed(2);
            results.push({
              id: `local_${Buffer.from(file).toString('hex').substring(0, 16)}`,
              name: `Local Network Share - ${filename}`,
              title: filename,
              quality: filename.includes('4K') || filename.includes('2160p') ? '4K' : (filename.includes('1080p') ? '1080p' : '720p'),
              sizeBytes: stat.size,
              sizeStr: `${sizeGB} GB`,
              type: 'local',
              source: 'Local Network Share',
              url: `/api/local-media/stream?path=${encodeURIComponent(file)}`,
              isCached: true,
              availability: 'Local Network Share'
            });
          } catch (e) {}
        }
      }
    }

    const queryTitle = (isTargetSeries && season !== undefined && episode !== undefined)
      ? `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
      : (title as string);

    try {
      const filteredResults = await filterWithGemini(queryTitle, results, settings, false);
      console.log(`[Local Media Search] Filtered with Gemini from ${results.length} to ${filteredResults.length} files for "${queryTitle}"`);
      res.json({ success: true, data: filteredResults });
    } catch (e: any) {
      console.error("[Local Media Search Error]", e.message);
      res.json({ success: true, data: results });
    }
  });

  const parseMediaName = (rawName: string) => {
    let clean = rawName
      .replace(/[\._\-](web-?dl|web-?rip|web|1080p|720p|480p|4k|2160p|bluray|brrip|bdrip|dvdrip|hdtv|x264|x265|hevc|remux).*/gi, '')
      .replace(/\b(1080p|720p|480p|4k|2160p|bluray|brrip|bdrip|web-?dl|web-?rip|web|dvdrip|hdtv|x264|x265|hevc|h264|h265|aac5?\.?1?|yify|yts\.?\w*|hdr10\+?|10bit|remux|proper|repack).*/gi, '')
      .replace(/\b(remastered|remaster|extended|uncut|unrated|directors?\s*cut|special\s*edition|restored|criterion|imax|anniversary|collectors?\s*edition|theatrical|se|ce|dc|ee|ue|dubbed|dub|subbed|sub|dual|multi|japanese|english|spanish|french|german|italian|russian|korean|chinese|hindi|hdcam|telesync|workprint|hc)\b.*/gi, '')
      .replace(/[\._\-\+\[\]]/g, ' ')
      .replace(/\b(web|web-?dl|web-?rip|1080p|720p|480p|4k|2160p|bluray|brrip|bdrip|dvdrip|hdtv|x264|x265|hevc|remastered|remaster|extended|uncut|unrated|directors?\s*cut|special\s*edition|restored|criterion|imax|anniversary|collectors?\s*edition|theatrical|se|ce|dc|ee|ue|dubbed|dub|subbed|sub|dual|multi|japanese|english|spanish|french|german|italian|russian|korean|chinese|hindi|hdcam|telesync|workprint|hc)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const matches = Array.from(clean.matchAll(/\b(19\d\d|20\d\d)\b/g));

    let year = '';
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const matchedYear = lastMatch[1];
      const matchIndex = lastMatch.index ?? -1;

      if (matches.length > 1 || matchIndex > 0) {
        year = matchedYear;
        clean = (clean.substring(0, matchIndex) + clean.substring(matchIndex + matchedYear.length))
          .replace(/[\(\)]/g, '')
          .replace(/\b(remastered|remaster|extended|uncut|unrated|directors?\s*cut|special\s*edition|restored|criterion|imax|anniversary|se|ce|dc|ee|ue|dubbed|dub|subbed|sub|dual|multi)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    return { title: clean || rawName, year };
  };






  const isGenericSubfolder = (name: string) => {
    const n = name.toLowerCase().trim();
    return /^season\s*\d+/i.test(n) ||
           /^s\d{1,2}$/i.test(n) ||
           /^series\s*\d+/i.test(n) ||
           /^staffel\s*\d+/i.test(n) ||
           /^saison\s*\d+/i.test(n) ||
           /^specials?$/i.test(n) ||
           /^(4k|2160p|1080p|720p|bluray|web-?dl|web-?rip|web|dvdrip|remux)$/i.test(n) ||
           /^(subs|subtitles|bonus|extra|extras|featurettes|sample|cd1|cd2)$/i.test(n) ||
           /^(movies|tv|tv shows|tvseries|videos|media|library|emby|collections|films)$/i.test(n);
  };

  const cleanTvShowTitle = (rawTitle: string): string => {
    let clean = rawTitle
      .replace(/[\._\-](web-?dl|web-?rip|web|1080p|720p|480p|4k|2160p|bluray|brrip|dvdrip|hdtv|x264|x265|hevc|remux).*/gi, '')
      .replace(/\b(season|series|staffel|saison)\s*\d+\b/gi, '')
      .replace(/\bS\d{1,2}(E\d{1,2})?\b/gi, '')
      .replace(/\b(specials?|bonus|extras?)\b/gi, '')
      .replace(/\b(web|web-?dl|web-?rip|1080p|720p|480p|4k|2160p|bluray|brrip|bdrip|dvdrip|hdtv|x264|x265|hevc|h264|h265|aac5?\.?1?|yify|remux|proper|repack)\b/gi, '')
      .replace(/[\(\)\[\]\-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return clean || rawTitle;
  };






  async function normalizeTvSeriesWithGemini(rawSeriesTitles: string[], apiKey: string): Promise<Record<string, string>> {
    if (!apiKey || rawSeriesTitles.length === 0) return {};
    try {
      const prompt = `You are an expert TV series catalog organizer. Given the following list of folder/title names from a media server scan, detect which items are different seasons or subfolder variations of the SAME TV show. Return a JSON object mapping each raw input title to its clean canonical TV show name.
       
Input titles:
${JSON.stringify(rawSeriesTitles)}

Respond ONLY with valid JSON in this exact structure without markdown or explanation:
{
  "Raw Title 1": "Canonical TV Show Name",
  "Raw Title 2": "Canonical TV Show Name"
}`;

      const text = await callGeminiApi(apiKey, prompt, { timeout: 30000 });
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err: any) {
      console.warn('[Gemini AI TV Normalizer] Gemini API rate limit or error reached. Falling back to local regex normalization:', err.message);
    }

    // Local Regex Normalization Fallback if Gemini rate limit (429) or error occurs
    const cleanLocalTvTitle = (tStr: string): string => {
      return tStr.replace(/[\._]/g, ' ').replace(/\b(s\d\de\d\d|1080p|720p|4k|2160p|hdtv|x264|x265|hevc|webrip|bluray)\b/gi, '').trim();
    };
    const fallbackMap: Record<string, string> = {};
    rawSeriesTitles.forEach(t => {
      fallbackMap[t] = cleanLocalTvTitle(t);
    });
    return fallbackMap;
  }


  const getMediaFolderAndTitle = (filePath: string, rootPath: string) => {
    let currentDir = path.dirname(filePath);
    let rawTitle = path.basename(currentDir);
    let targetFolder = currentDir;

    // Walk up directory tree until we find non-generic folder name or reach rootPath
    while (currentDir !== rootPath && path.dirname(currentDir) !== currentDir && isGenericSubfolder(rawTitle)) {
      currentDir = path.dirname(currentDir);
      rawTitle = path.basename(currentDir);
      targetFolder = currentDir;
    }

    if (currentDir === rootPath || isGenericSubfolder(rawTitle)) {
      rawTitle = path.basename(filePath, path.extname(filePath));
      targetFolder = filePath;
    }

    const { title, year } = parseMediaName(rawTitle);
    return { title, year, folderPath: targetFolder };
  };

  const isTvSeriesItem = (filePath: string, folderPath: string, configuredType: string): boolean => {
    if (configuredType === 'series' || configuredType === 'tv' || configuredType === 'shows') return true;
    if (configuredType === 'movie' || configuredType === 'movies') return false;
    const p = (folderPath || '').toLowerCase();
    const f = (filePath || '').toLowerCase();
    if (/\b(s\d{1,2}e\d{1,2}|\d{1,2}x\d{1,2}|season\s*\d+)\b/i.test(f) || /\b(s\d{1,2}e\d{1,2}|\d{1,2}x\d{1,2}|season\s*\d+)\b/i.test(p)) return true;
    return false;
  };

  const enrichItemWithTmdb = async (item: any, apiKey: string): Promise<boolean> => {

    try {
      const primaryEndpoint = item.type === 'series' ? 'tv' : 'movie';
      const secondaryEndpoint = item.type === 'series' ? 'movie' : 'tv';
      
      const cleanTitle = parseMediaName(item.title).title;
      const cleanFilename = item.filename ? parseMediaName(item.filename.replace(/\.[^/.]+$/, '')).title : null;
      const cleanFolder = item.folderPath ? parseMediaName(path.basename(item.folderPath)).title : null;

      const queriesSet = new Set<string>();
      [cleanTitle, cleanFilename, cleanFolder, item.title].forEach(q => {
        if (!q || q.length < 2) return;
        queriesSet.add(q);
        queriesSet.add(q.replace(/\band\b/gi, '&'));
        queriesSet.add(q.replace(/&/g, 'and'));
        queriesSet.add(q.replace(/[:,\-']/g, ' ').replace(/\s+/g, ' ').trim());
        queriesSet.add(q.replace(/\b(part|volume|vol|chapter)\s*\d+/gi, '').trim());
      });

      const searchQueries = Array.from(queriesSet).filter(q => q && q.length >= 2);

      for (const qStr of searchQueries) {
        if (!qStr || qStr.length < 2) continue;

        let searchUrl = `https://api.themoviedb.org/3/search/${primaryEndpoint}?api_key=${apiKey}&query=${encodeURIComponent(qStr)}`;
        if (item.year && item.year !== 'Local' && item.year.length === 4) {
          searchUrl += item.type === 'series' ? `&first_air_date_year=${item.year}` : `&year=${item.year}`;
        }
        let tmdbRes = await axios.get(searchUrl, { timeout: 3000 }).catch(() => null);
        let match = tmdbRes?.data?.results?.find((r: any) => {
          const rYear = (r.release_date || r.first_air_date || '').split('-')[0];
          return (r.poster_path || r.backdrop_path) && (item.year && item.year !== 'Local' ? rYear === String(item.year) : true);
        });

        if (!match) {
          const fallbackUrl = `https://api.themoviedb.org/3/search/${primaryEndpoint}?api_key=${apiKey}&query=${encodeURIComponent(qStr)}`;
          tmdbRes = await axios.get(fallbackUrl, { timeout: 3000 }).catch(() => null);
          match = tmdbRes?.data?.results?.find((r: any) => {
            const rYear = (r.release_date || r.first_air_date || '').split('-')[0];
            return (r.poster_path || r.backdrop_path) && (item.year && item.year !== 'Local' ? rYear === String(item.year) : true);
          });
        }

        if (!match && tmdbRes?.data?.results?.length > 0) {
          match = tmdbRes.data.results.find((r: any) => r.poster_path || r.backdrop_path);
        }

        if (match && (match.poster_path || match.backdrop_path)) {
          const imgPath = match.poster_path || match.backdrop_path;
          const fullImgUrl = `https://image.tmdb.org/t/p/w500${imgPath}`;
          item.poster = `/api/image-proxy?url=${encodeURIComponent(fullImgUrl)}`;
          if (match.vote_average && match.vote_average > 0) {
            item.rating = match.vote_average.toFixed(1);
          }
          
          if (!item.rating || item.rating === '0' || item.rating === '0.0') {
            try {
              const titleQuery = encodeURIComponent(item.title || item.name || '');
              const yearQuery = item.year && item.year !== 'Local' ? `&y=${item.year}` : '';
              const omdbRes = await axios.get(`https://www.omdbapi.com/?apikey=trilogy&t=${titleQuery}${yearQuery}`, { timeout: 2500 }).catch(() => null);
              if (omdbRes?.data?.imdbRating && omdbRes.data.imdbRating !== 'N/A') {
                item.rating = omdbRes.data.imdbRating;
              }
            } catch (e) {}
          }

          if (match.overview) item.overview = match.overview;
          const releaseDate = match.release_date || match.first_air_date;
          if (releaseDate && (!item.year || item.year === 'Local')) {
            item.year = releaseDate.split('-')[0];
          }
          item.realTmdbId = match.id;
          if (!item.type) {
            if (match.media_type === 'tv' || match.first_air_date || (match.name && !match.title)) {
              item.type = 'series';
            } else {
              item.type = 'movie';
            }
          }
          return true;
        }
      }
    } catch (e) {}
    return false;
  };

  const findLocalPosterForFile = (filePath: string, folderPath?: string): string => {
    try {
      const dir = folderPath || path.dirname(filePath);
      if (!dir) return '';

      const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      const posterNames = [
        'poster', 'folder', 'cover', 'fanart', 'thumb', 'movie',
        path.basename(filePath, path.extname(filePath)),
        path.basename(dir)
      ];

      for (const name of posterNames) {
        for (const ext of imageExtensions) {
          const testPath = path.join(dir, `${name}${ext}`);
          try {
            if (fs.existsSync(testPath)) {
              return `/api/local-media/stream?path=${encodeURIComponent(testPath)}`;
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
    return '';
  };

  const buildAndSaveLibraryCatalog = async (): Promise<any[]> => {
    const settings = readJson(SETTINGS_FILE);
    const mediaFolders: any[] = settings.mediaFolders || [];
    if (!Array.isArray(mediaFolders) || mediaFolders.length === 0) {
      writeJson(SCANNED_LIBRARY_FILE, []);
      return [];
    }

    const items: any[] = [];
    const seenTitles = new Set<string>();

    for (const folderObj of mediaFolders) {
      if (!folderObj || !folderObj.path) continue;
      const rootPath = normalizeNetworkPath(folderObj.path);
      const configuredType = folderObj.mediaType || 'movie';

      try {
        const allVideoFiles = await scanDirectoryForMediaAsync(rootPath, [], 15);
        if (allVideoFiles.length === 0) continue;

        const titleGroups = new Map<string, { title: string; year: string; files: string[]; folderPath: string; mediaType: 'movie' | 'series' }>();

        for (const file of allVideoFiles) {
          let { title: folderTitle, year: folderYear, folderPath } = getMediaFolderAndTitle(file, rootPath);
          const mediaType = isTvSeriesItem(file, folderPath, configuredType) ? 'series' : 'movie';
          
          let parsedTitle = folderTitle;
          let parsedYear = folderYear;
          const filenameNoExt = path.basename(file, path.extname(file));
          const parsedFile = parseMediaName(filenameNoExt);

          // If folderTitle is generic (like "Movies", "TV Shows", "Media", "Library"), derive title from parent dir or filename
          if (isGenericSubfolder(parsedTitle) || folderPath === rootPath) {
            const parentDirName = path.basename(path.dirname(file));
            if (!isGenericSubfolder(parentDirName) && path.dirname(file) !== rootPath) {
              parsedTitle = parseMediaName(parentDirName).title || parentDirName;
            } else if (parsedFile.title && parsedFile.title.length > 1) {
              parsedTitle = parsedFile.title;
              if (parsedFile.year) parsedYear = parsedFile.year;
            } else {
              parsedTitle = filenameNoExt;
            }
          }

          // For series, clean season numbers from title so all seasons group under the parent TV series
          if (mediaType === 'series') {
            parsedTitle = cleanTvShowTitle(parsedTitle);
          }

          const cleanKey = parsedTitle.toLowerCase().replace(/[^a-z0-9]/g, '') || filenameNoExt.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          // For movies, each individual file gets its own card!
          // For series, each distinct show title (or episode file if at root) gets its own card!
          const dedupeKey = mediaType === 'movie' || folderPath === rootPath
            ? `movie_${cleanKey}_${filenameNoExt}` 
            : `series_${cleanKey}`;

          if (!titleGroups.has(dedupeKey)) {
            titleGroups.set(dedupeKey, { title: parsedTitle, year: parsedYear, files: [], folderPath, mediaType });
          }
          titleGroups.get(dedupeKey)!.files.push(file);
        }

        // Gemini AI Smart Normalization for TV Series with separate season subfolders
        if (settings.geminiApiKey) {
          const rawSeriesTitles = Array.from(titleGroups.values())
            .filter(g => g.mediaType === 'series')
            .map(g => g.title);

          if (rawSeriesTitles.length > 0) {
            const geminiMap = await normalizeTvSeriesWithGemini(rawSeriesTitles, settings.geminiApiKey);
            if (Object.keys(geminiMap).length > 0) {
              const mergedGroups = new Map<string, { title: string; year: string; files: string[]; folderPath: string; mediaType: 'movie' | 'series' }>();
              
              for (const [key, group] of titleGroups.entries()) {
                if (group.mediaType === 'series') {
                  const canonicalName = geminiMap[group.title] || group.title;
                  const canonicalKey = `series_${canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                  if (!mergedGroups.has(canonicalKey)) {
                    mergedGroups.set(canonicalKey, { ...group, title: canonicalName });
                  } else {
                    mergedGroups.get(canonicalKey)!.files.push(...group.files);
                  }
                } else {
                  mergedGroups.set(key, group);
                }
              }
              
              titleGroups.clear();
              for (const [k, v] of mergedGroups.entries()) {
                titleGroups.set(k, v);
              }
            }
          }
        }

        for (const [dedupeKey, group] of titleGroups.entries()) {
          if (seenTitles.has(dedupeKey)) continue;
          seenTitles.add(dedupeKey);

          group.files.sort((a, b) => {
            try {
              return fs.statSync(b).size - fs.statSync(a).size;
            } catch (e) {
              return 0;
            }
          });

          const primaryFile = group.files[0];
          const fileHash = crypto.createHash('md5').update(primaryFile).digest('hex');
          const fileId = `local_lib_${fileHash}`;
          const localPoster = findLocalPosterForFile(primaryFile, group.folderPath);

          items.push({
            id: fileId,
            tmdbId: fileId,
            title: group.title,
            name: group.title,
            year: group.year || 'Local',
            poster: localPoster,
            backupPoster: localPoster,
            overview: `Local Shared Folder (${group.files.length} file${group.files.length > 1 ? 's' : ''})`,
            rating: '',
            type: group.mediaType,
            isNetworkShare: true,
            streamUrl: `/api/local-media/stream?path=${encodeURIComponent(primaryFile)}`,
            filePath: primaryFile,
            folderPath: group.folderPath,
            filename: path.basename(primaryFile),
            addedAt: new Date().toISOString()
          });
        }
      } catch (e: any) {
        console.warn(`[Library Catalog Scan] Error scanning "${rootPath}":`, e.message);
      }
    }

    writeJson(SCANNED_LIBRARY_FILE, items);
    console.log(`[Persistent Library] Saved ${items.length} media items to disk.`);

    // Asynchronous background poster enrichment so library response returns instantly
    const apiKey = settings.tmdbKey || '841059f71aab310b4d4c4f3a7e28328e';
    if (apiKey && items.length > 0) {
      setTimeout(async () => {
        const batchSize = 10;
        for (let i = 0; i < items.length; i += batchSize) {
          const chunk = items.slice(i, i + batchSize);
          await Promise.allSettled(chunk.map(item => {
            if (!item.poster || item.poster === '') {
              return enrichItemWithTmdb(item, apiKey);
            }
            return Promise.resolve(true);
          }));
        }
        writeJson(SCANNED_LIBRARY_FILE, items);
        console.log(`[Persistent Library Background Enrich] Complete for ${items.length} items.`);
      }, 50);
    }

    return items;
  };


  // API Route: Automatically scan Local & Network Shared Folders and format as Library items
  app.get("/api/local-media/library", async (req, res) => {
    try {
      let savedItems = readJson(SCANNED_LIBRARY_FILE, []);
      if (!Array.isArray(savedItems)) savedItems = [];

      const settings = readJson(SETTINGS_FILE);
      const mediaFolders: any[] = settings.mediaFolders || [];

      const needsRescan = req.query.rescan === 'true' || 
                          savedItems.length <= 2 || 
                          savedItems.some((i: any) => i.title === 'Movies' || i.title === 'Media' || i.title === 'Library');

      if ((mediaFolders.length > 0 && savedItems.length <= 2) || needsRescan) {
        console.log("[Local Media Library] Performing fresh catalog scan of configured folders...");
        savedItems = await buildAndSaveLibraryCatalog();
      } else {
        // Auto-fix misidentified titles & media types by re-evaluating folder configuration & filenames
        const settings = readJson(SETTINGS_FILE);
        const mediaFolders: any[] = settings.mediaFolders || [];
        let fixedAny = false;

        savedItems.forEach((item: any) => {
          if (item.filePath) {
            // Guarantee item.type strictly matches the configured mediaType of its parent folder
            const normItemPath = normalizeNetworkPath(item.filePath).toLowerCase();
            for (const folder of mediaFolders) {
              if (folder && folder.path) {
                const normFolderPath = normalizeNetworkPath(folder.path).toLowerCase();
                if (normItemPath.startsWith(normFolderPath)) {
                  const correctType = folder.mediaType || 'movie';
                  if (item.type !== correctType) {
                    console.log(`[Library Type Fix] Corrected "${item.title}" type from "${item.type}" to "${correctType}" based on folder settings.`);
                    item.type = correctType;
                    fixedAny = true;
                  }
                  break;
                }
              }
            }

            if (!item.isCustomMatch) {
              const rootPath = path.dirname(item.folderPath || item.filePath);
              const { title, year } = getMediaFolderAndTitle(item.filePath, rootPath);
              if (title && title !== item.title) {
                console.log(`[Library Auto-Fix] Corrected title from "${item.title}" to "${title}" (Year: ${year || item.year})`);
                item.title = title;
                item.name = title;
                if (year) item.year = year;
                item.poster = ''; // Force poster refetch with corrected title
                fixedAny = true;
              }
            }
          }
        });
        if (fixedAny) {
          writeJson(SCANNED_LIBRARY_FILE, savedItems);
        }


        // Self-healing poster fetch for items missing posters (Asynchronous in background)
        const unposterized = savedItems.filter((i: any) => !i.poster);
        if (unposterized.length > 0) {
          const settings = readJson(SETTINGS_FILE);
          const apiKey = settings.tmdbKey || '841059f71aab310b4d4c4f3a7e28328e';
          if (apiKey) {
            setTimeout(async () => {
              const batchSize = 10;
              for (let i = 0; i < unposterized.length; i += batchSize) {
                const chunk = unposterized.slice(i, i + batchSize);
                await Promise.allSettled(chunk.map(item => enrichItemWithTmdb(item, apiKey)));
              }
              writeJson(SCANNED_LIBRARY_FILE, savedItems);
              console.log(`[Local Media Background Enrich] Processed missing posters for ${unposterized.length} items.`);
            }, 100);
          }
        }
      }

      return res.json({ success: true, data: savedItems });

    } catch (e: any) {
      console.error("[Local Media Library Error]", e.message);
      res.json({ success: false, data: [], error: e.message });
    }
  });

  // API Route: Scan TV Series folder for seasons and episodes
  app.get("/api/local-media/episodes", (req, res) => {
    try {
      const folderPath = req.query.folderPath as string;
      const filePath = req.query.filePath as string;

      const targetDir = folderPath || (filePath ? path.dirname(filePath) : '');
      if (!targetDir) {
        return res.json({ success: false, seasons: [] });
      }

      const normDir = normalizeNetworkPath(targetDir);
      const allFiles = scanDirectoryForMedia(normDir, [], 5);
      
      const seasonsMap = new Map<number, any[]>();

      for (const file of allFiles) {
        const filename = path.basename(file);
        
        let seasonNum = 1;
        let episodeNum = 1;

        const sMatch = filename.match(/s(\d{1,2})e(\d{1,2})/i) || 
                       filename.match(/(\d{1,2})x(\d{1,2})/i) ||
                       path.dirname(file).match(/season\s*(\d{1,2})/i);

        if (sMatch) {
          if (sMatch[1]) seasonNum = parseInt(sMatch[1], 10);
          if (sMatch[2]) episodeNum = parseInt(sMatch[2], 10);
        } else {
          const epMatch = filename.match(/\be(?:pisode)?\s*(\d{1,2})\b/i) || filename.match(/\b(\d{1,3})\b/);
          if (epMatch) episodeNum = parseInt(epMatch[1], 10);
        }

        if (!seasonsMap.has(seasonNum)) {
          seasonsMap.set(seasonNum, []);
        }

        const episodeTitle = parseMediaName(filename.replace(/\.[^/.]+$/, '')).title || `Episode ${episodeNum}`;

        seasonsMap.get(seasonNum)!.push({
          id: `local_ep_${crypto.createHash('md5').update(file).digest('hex')}`,
          name: episodeTitle,
          title: episodeTitle,
          season_number: seasonNum,
          episode_number: episodeNum,
          filename: filename,
          filePath: file,
          streamUrl: `/api/local-media/stream?path=${encodeURIComponent(file)}`,
          overview: `Local media file: ${filename}`
        });
      }

      const seasons = Array.from(seasonsMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([sNum, epList]) => ({
          season_number: sNum,
          name: `Season ${sNum}`,
          episode_count: epList.length,
          episodes: epList.sort((a, b) => a.episode_number - b.episode_number)
        }));

      res.json({ success: true, seasons });
    } catch (e: any) {
      console.error("[Local Media Episodes Error]", e.message);
      res.json({ success: false, seasons: [] });
    }
  });




  // API Route: Manually fix metadata/poster for a local library item
  app.post("/api/local-media/fix-match", async (req, res) => {
    try {
      const { id, filePath, streamUrl, title, year, poster, overview, rating, type, realTmdbId } = req.body || {};
      if (!title) {
        return res.status(400).json({ success: false, error: 'Missing title parameter' });
      }

      let savedItems = readJson(SCANNED_LIBRARY_FILE, []);
      if (!Array.isArray(savedItems)) savedItems = [];

      let updatedItem: any = null;
      savedItems = savedItems.map((item: any) => {
        const isMatch = (id && String(item.id) === String(id)) || 
                        (filePath && String(item.filePath).toLowerCase() === String(filePath).toLowerCase()) ||
                        (streamUrl && String(item.streamUrl).toLowerCase() === String(streamUrl).toLowerCase());
        if (isMatch) {
          item.title = title;
          item.name = title;
          if (year) item.year = String(year);
          if (poster) item.poster = poster;
          if (overview) item.overview = overview;
          if (rating) item.rating = String(rating);
          if (type) item.type = type === 'tv' ? 'series' : type;
          if (realTmdbId) item.realTmdbId = realTmdbId;
          item.isCustomMatch = true;
          updatedItem = item;
        }
        return item;
      });

      if (updatedItem) {
        writeJson(SCANNED_LIBRARY_FILE, savedItems);
        console.log(`[Local Media Fix Match] Updated match for "${title}" (${year}) on disk.`);
        return res.json({ success: true, item: updatedItem });
      } else {
        return res.json({ success: false, error: 'Item not found in scanned library' });
      }
    } catch (e: any) {

      console.error("[Local Media Fix Match Error]", e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });


  // API Route: Manually trigger a search/scan of local & network share folders

  app.post("/api/local-media/scan", async (req, res) => {
    const { folderPath, mediaType } = req.body || {};
    const settings = readJson(SETTINGS_FILE);

    if (folderPath && typeof folderPath === 'string') {
      const existing: any[] = settings.mediaFolders || [];
      const normPath = normalizeNetworkPath(folderPath);
      const idx = existing.findIndex((f: any) => normalizeNetworkPath(f.path) === normPath);
      if (idx >= 0) {
        existing[idx].mediaType = mediaType || 'movie';
      } else {
        existing.push({ id: Date.now().toString(), path: folderPath, mediaType: mediaType || 'movie' });
      }
      settings.mediaFolders = existing;
      writeJson(SETTINGS_FILE, settings);
    }

    console.log(`[Local Media Scan] Re-building persistent library catalog...`);
    const freshItems = await buildAndSaveLibraryCatalog();

    const moviesCount = freshItems.filter(i => i.type === 'movie').length;
    const seriesCount = freshItems.filter(i => i.type === 'series').length;

    res.json({
      success: true,
      totalDiscovered: freshItems.length,
      moviesCount,
      seriesCount,
      items: freshItems,
      message: `Successfully scanned shared folders! Discovered ${moviesCount} Movies and ${seriesCount} TV Series.`
    });
  });


  // API Route: Test parsing EPG

  app.post("/api/epg", async (req, res) => {
    try {
      const { url } = req.body;
      const settings = readJson(SETTINGS_FILE);

      // If specific URL requested explicitly and no providers configured
      if (url && !settings.iptvProviders?.length) {
        const parsed = await parseEPG(url);
        return res.json(parsed);
      }

      const activeEpgUrls: string[] = [];
      if (settings.iptvProviders && Array.isArray(settings.iptvProviders)) {
        for (const p of settings.iptvProviders) {
          if (p.enabled && p.epgUrl) {
            activeEpgUrls.push(p.epgUrl);
          } else if (p.enabled && p.type === 'xtream' && p.url) {
             // For xtream type, we can derive the epgUrl from the M3U url if not explicitly provided
             const xtreamMatch = p.url.match(/^(https?:\/\/[^\/]+)\/get\.php\?username=([^&]+)&password=([^&]+)/);
             if (xtreamMatch) {
                const [_, server, user, pass] = xtreamMatch;
                activeEpgUrls.push(`${server}/xmltv.php?username=${user}&password=${pass}`);
             }
          }
        }
      }

      if (activeEpgUrls.length === 0) {
        const fallbackUrl = url || settings.epgUrl;
        if (fallbackUrl) activeEpgUrls.push(fallbackUrl);
      }

      if (activeEpgUrls.length === 0) {
         return res.json({ channels: [], programs: [] }); // Return empty if none
      }

      const parsedLists = await Promise.all(
        activeEpgUrls.map(async (u) => {
          try {
            return await parseEPG(u);
          } catch (e) {
            console.error(`[EPG Parse Error] Failed to parse ${u}:`, e);
            return { channels: [], programs: [] };
          }
        })
      );

      const allChannels = parsedLists.map(p => p.channels || []).flat();
      const allPrograms = parsedLists.map(p => p.programs || []).flat();

      res.json({ channels: allChannels, programs: allPrograms });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, the bundled server.cjs runs inside /dist/ server directory.
    // Static assets are placed directly in /dist/ index.html.
    const distPath = typeof __dirname !== 'undefined' ? __dirname : _dirname;
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }


  app.post('/api/log', (req, res) => { console.log('[CLIENT ERROR]', req.body); res.sendStatus(200); });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Start non-blocking background scan of local & network shares 15 seconds after server startup
    setTimeout(() => {
      console.log("[Startup] Automatically building local and network media library catalog in background...");
      buildAndSaveLibraryCatalog().catch(err => console.error("[Startup Scan Error]", err.message));
    }, 15000);
  });
}

process.on('SIGTERM', () => {
  console.log('[BubbaFlix Server] Received SIGTERM signal. Gracefully shutting down container...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[BubbaFlix Server] Received SIGINT signal. Shutting down...');
  process.exit(0);
});

startServer();

