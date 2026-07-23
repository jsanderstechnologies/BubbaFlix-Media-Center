import express from 'express';
import path from 'path';
import dns from 'dns';
dns.setServers(['1.1.1.1', '8.8.8.8']);

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
// ============================================================================

let bestH264Encoder: string | null = null;

function detectBestH264Encoder(): string {
  if (bestH264Encoder !== null) return bestH264Encoder;
  try {
    const { execSync } = require('child_process');
    const encoders = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox'];
    for (const enc of encoders) {
      try {
        execSync(`"${ffmpegPath}" -f lavfi -i nullsrc=s=1280x720 -c:v ${enc} -t 1 -f null -`, {stdio: 'ignore'});
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
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

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

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5150;

  app.set('trust proxy', true);
  app.use(express.json());

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
  const USERS_FILE = path.join(baseDir, 'data', 'users.json');
  const DB_FILE = path.join(baseDir, 'data', 'db.json');
  const SETTINGS_FILE = path.join(baseDir, 'data', 'settings.json');


  const readJson = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return {}; }
  };
  const writeJson = (file, data) => {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  };

  // Sync Docker Compose Env Configuration Keys directly to settings on boot
  const settings = readJson(SETTINGS_FILE);
  let settingsChanged = false;
  if (process.env.TMDB_KEY && settings.tmdbKey !== process.env.TMDB_KEY) {
    settings.tmdbKey = process.env.TMDB_KEY;
    settingsChanged = true;
  }
  if (process.env.TORBOX_API_KEY && settings.torboxApiKey !== process.env.TORBOX_API_KEY) {
    settings.torboxApiKey = process.env.TORBOX_API_KEY;
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
          font-size="56" 
          font-weight="900" 
          letter-spacing="-1.2"
          fill="url(#bubbaflix-gradient-email)"
          stroke="url(#bubbaflix-gradient-email)"
          stroke-width="2.8"
          stroke-linejoin="round"
        >
          <textPath href="#bubbaflix-curve-email" startOffset="50%" text-anchor="middle">
            BUBBAFLIX
          </textPath>
        </text>
      </svg>
    `;


    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;border:1px solid #222;">
        <div style="background:linear-gradient(135deg,#000000,#111111);padding:32px 40px;text-align:center;border-bottom:1px solid #222;">
          ${logoSvg}
        </div>
        <div style="padding:32px 40px;">
          <h2 style="color:#fff;margin-top:0;font-size:22px;font-weight:bold;text-align:center;">Welcome, ${username}!</h2>
          <p style="color:#aaa;line-height:1.6;font-size:14px;text-align:center;">Your account has been approved. Here are your login credentials:</p>
          <div style="background:#141414;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin:24px 0;text-align:center;">
            <p style="margin:0 0 4px;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Username</p>
            <p style="margin:0 0 20px;font-size:18px;font-weight:bold;color:#fff;font-family:monospace;">${username}</p>
            <p style="margin:0 0 4px;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Password</p>
            <p style="margin:0;font-size:15px;font-weight:900;color:#ef4444;letter-spacing:1.5px;font-family:monospace;background:#222;padding:8px 16px;border-radius:6px;display:inline-block;">${password}</p>

          </div>
          ${appUrl ? `<p style="text-align:center;margin-top:28px;"><a href="${appUrl}" style="background:#dc2626;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;font-size:14px;">Sign In to ${appName}</a></p>` : ''}
          <p style="color:#444;font-size:11px;margin-top:32px;text-align:center;line-height:1.4;">For your security, we recommend changing your password after your first login.</p>
        </div>
      </div>
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
      <div style="font-family:sans-serif;background-color:#111;color:#eee;padding:40px 20px;">
        <div style="max-width:500px;margin:0 auto;background:#222;border:1px solid #333;border-radius:12px;padding:32px;">
          <h1 style="color:#ef4444;margin-top:0;font-size:24px;text-align:center;">Password Reset</h1>
          <p style="font-size:16px;line-height:1.5;">Hi <b>${username}</b>,</p>
          <p style="font-size:15px;line-height:1.5;color:#bbb;">An administrator has reset your password for ${appName}. Your new password is below.</p>
          <div style="background:#000;padding:16px;border-radius:8px;margin:24px 0;text-align:center;">
            <p style="margin:0;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">New Password</p>
            <p style="margin:0;font-size:24px;font-family:monospace;color:#fff;letter-spacing:2px;">${password}</p>
          </div>
          ${appUrl ? `<p style="text-align:center;margin-top:28px;"><a href="${appUrl}" style="background:#dc2626;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;font-size:14px;">Sign In to ${appName}</a></p>` : ''}
          <p style="color:#444;font-size:11px;margin-top:32px;text-align:center;line-height:1.4;">For your security, we recommend changing your password after your next login.</p>
        </div>
      </div>
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

    const { email, username, password, tmdbKey, torboxApiKey, geminiApiKey } = req.body;
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
    if (torboxApiKey) settings.torboxApiKey = torboxApiKey;
    if (geminiApiKey) settings.geminiApiKey = geminiApiKey;
    writeJson(SETTINGS_FILE, settings);

    res.json({ success: true, user: { uid, email, username, role: 'admin', status: 'approved' }, token });
  });

  // Endpoint for client frontend to fetch non-sensitive integration configurations dynamically
  app.get('/api/auth/config', (req, res) => {
    const settings = readJson(SETTINGS_FILE);
    res.json({
      tmdbKey: settings.tmdbKey || '',
      torboxApiKey: settings.torboxApiKey || '',
      geminiApiKey: settings.geminiApiKey || '',
      preferHEVC: settings.preferHEVC ?? null,
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
      disableLogin: settings.disableLogin === true
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

    const hash = crypto.scryptSync(password, (user as any).salt, 64).toString('hex');
    if (hash !== (user as any).hash) return res.status(400).json({ error: 'Invalid credentials' });

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

    const token = crypto.randomBytes(32).toString('hex');
    (user as any).token = token;
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
    const user = Object.values(users as Record<string, any>).find((u: any) => u.token === token);

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
    const user = Object.values(users as Record<string, any>).find((u: any) => u.token === token);
    
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
      disableLogin: settings.disableLogin === true
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
    if (req.body.disableLogin !== undefined) settings.disableLogin = req.body.disableLogin;
    if (req.body.enableUsenetSearch !== undefined) settings.enableUsenetSearch = req.body.enableUsenetSearch;
    if (req.body.enableTorrentSearch !== undefined) settings.enableTorrentSearch = req.body.enableTorrentSearch;
    if (req.body.intelTranscoding !== undefined) settings.intelTranscoding = req.body.intelTranscoding;
    if (req.body.filterAnime !== undefined) settings.filterAnime = req.body.filterAnime;
    if (req.body.preferredLanguage !== undefined) settings.preferredLanguage = req.body.preferredLanguage;
    
    // Some general settings that any admin can save from SettingsPanel
    if (req.body.tmdbKey !== undefined) settings.tmdbKey = req.body.tmdbKey;
    if (req.body.torboxApiKey !== undefined) settings.torboxApiKey = req.body.torboxApiKey;
    if (req.body.preferHEVC !== undefined) settings.preferHEVC = req.body.preferHEVC;
    if (req.body.maxResults !== undefined) settings.maxResults = req.body.maxResults;
    if (req.body.streamBufferSeconds !== undefined) settings.streamBufferSeconds = req.body.streamBufferSeconds;
    if (req.body.iptvUrl !== undefined) settings.iptvUrl = req.body.iptvUrl;
    if (req.body.epgUrl !== undefined) settings.epgUrl = req.body.epgUrl;
    if (req.body.epgOffset !== undefined) settings.epgOffset = req.body.epgOffset;
    if (req.body.xtreamServer !== undefined) settings.xtreamServer = req.body.xtreamServer;
    if (req.body.xtreamUsername !== undefined) settings.xtreamUsername = req.body.xtreamUsername;
    if (req.body.xtreamPassword !== undefined) settings.xtreamPassword = req.body.xtreamPassword;

    writeJson(SETTINGS_FILE, settings);
    res.json({ success: true });
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

    // Resolve TorBox requestdl redirects before probing
    let probeUrl = targetUrl;
    if (targetUrl.includes('torbox.app') && targetUrl.includes('requestdl')) {
      try {
        const redirectRes = await axios({
          method: 'get', url: targetUrl, maxRedirects: 0,
          validateStatus: (s) => s >= 200 && s < 400,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (redirectRes.status === 307 && redirectRes.headers['location']) {
          probeUrl = redirectRes.headers['location'] as string;
        } else if (redirectRes.data && typeof redirectRes.data === 'object' && redirectRes.data.data) {
          probeUrl = redirectRes.data.data;
        }
      } catch (resolveErr: any) {
        if (resolveErr.response?.status === 307 && resolveErr.response?.headers?.location) {
          probeUrl = resolveErr.response.headers.location;
        }
      }
    }

    const originalHost = new URL(probeUrl).hostname;
    const ipUrl = probeUrl;

    const args = [
      '-http_proxy', `http://127.0.0.1:${FFMPEG_PROXY_PORT}`,
      '-user_agent', 'Mozilla/5.0'
    ];
    
    if (ipUrl.startsWith('https')) {
      args.push('-tls_verify', '0');
    }
    
    args.push(
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx',


      '-reconnect_delay_max', '60',
      '-multiple_requests', '1',
      '-headers', `Host: ${originalHost}\r\n`,
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      '-analyzeduration', '5000000',
      '-probesize', '5000000',
      '-i', ipUrl
    );

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
          res.json(JSON.parse(output.trim()));
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
    const type = req.query.type; // 'movie' or 'tv'
    const season = req.query.season;
    const episode = req.query.episode;

    if (!tmdbId || !type) {
      return res.status(400).json({ error: "tmdb_id and type are required" });
    }

    try {
      const settings = readJson(SETTINGS_FILE);
      if (!settings.tmdbKey) {
        return res.status(400).json({ error: "TMDB API key not configured" });
      }

      // Step 1: Resolve TMDB ID to IMDB ID
      const tmdbUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${settings.tmdbKey}`;
      const tmdbRes = await axios.get(tmdbUrl);
      const imdbId = tmdbRes.data?.imdb_id;

      if (!imdbId) {
        return res.json({ subtitles: [] });
      }

      // Step 2: Query Stremio OpenSubtitles v3 Addon
      let stremioUrl = `https://opensubtitles-v3.strem.io/subtitles/${type}/${imdbId}.json`;
      if (type === 'tv' && season && episode) {
        stremioUrl = `https://opensubtitles-v3.strem.io/subtitles/series/${imdbId}:${season}:${episode}.json`;
      }

      const osRes = await axios.get(stremioUrl);
      const subtitles = osRes.data?.subtitles || [];
      
      res.json({ subtitles });
    } catch (err: any) {
      console.error('[OpenSubtitles Search Error]', err.message);
      res.status(500).json({ error: "Failed to search subtitles" });
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
    if (targetUrl.includes('torbox.app') && targetUrl.includes('requestdl')) {
      try {
        const redirectRes = await axios({
          method: 'get', url: targetUrl, maxRedirects: 0,
          validateStatus: (s) => s >= 200 && s < 400,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (redirectRes.status === 307 && redirectRes.headers['location']) {
          resolvedUrl = redirectRes.headers['location'] as string;
        } else if (redirectRes.data && typeof redirectRes.data === 'object' && redirectRes.data.data) {
          resolvedUrl = redirectRes.data.data;
        }
      } catch (resolveErr: any) {
        if (resolveErr.response?.status === 307 && resolveErr.response?.headers?.location) {
          resolvedUrl = resolveErr.response.headers.location;
        }
      }
    }

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
    if (targetUrl.includes('torbox.app') && targetUrl.includes('requestdl')) {
      try {
        const redirectRes = await axios({
          method: 'get', url: targetUrl, maxRedirects: 0,
          validateStatus: (s) => s >= 200 && s < 400,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (redirectRes.status === 307 && redirectRes.headers['location']) {
          resolvedUrl = redirectRes.headers['location'] as string;
        } else if (redirectRes.data && typeof redirectRes.data === 'object' && redirectRes.data.data) {
          resolvedUrl = redirectRes.data.data;
        }
      } catch (resolveErr: any) {
        if (resolveErr.response?.status === 307 && resolveErr.response?.headers?.location) {
          resolvedUrl = resolveErr.response.headers.location;
        }
      }
    }

    const originalHost = new URL(resolvedUrl).hostname;
    const ipUrl = resolvedUrl;

    const args = [
      '-http_proxy', `http://127.0.0.1:${FFMPEG_PROXY_PORT}`,
      '-user_agent', 'Mozilla/5.0'
    ];
    
    if (ipUrl.startsWith('https')) {
      args.push('-tls_verify', '0');
    }
    
    args.push(
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx',


      '-reconnect_delay_max', '60',
      '-multiple_requests', '1',
      '-headers', `Host: ${originalHost}\r\n`,
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      '-analyzeduration', '5000000',
      '-probesize', '5000000',
      '-i', ipUrl
    );

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

  
  app.get("/api/transcode/subtitle.vtt", async (req, res) => {
    const targetUrl = req.query.url;
    const track = req.query.track || '0';
    
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send("URL is required");
    }

    console.log(`[FFmpeg-Proxy] Pulling subtitle track ${track} for: ${targetUrl}`);

    res.setHeader('Content-Type', 'text/vtt');
    
    let resolvedUrl = targetUrl;
    if (targetUrl.includes('torbox.app') && targetUrl.includes('requestdl')) {
      try {
        const redirectRes = await axios({
          method: 'get', url: targetUrl, maxRedirects: 0,
          validateStatus: (s) => s >= 200 && s < 400,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (redirectRes.status === 307 && redirectRes.headers['location']) {
          resolvedUrl = redirectRes.headers['location'] as string;
        } else if (redirectRes.data && typeof redirectRes.data === 'object' && redirectRes.data.data) {
          resolvedUrl = redirectRes.data.data;
        }
      } catch (resolveErr: any) {
        if (resolveErr.response?.status === 307 && resolveErr.response?.headers?.location) {
          resolvedUrl = resolveErr.response.headers.location;
        }
      }
    }

    const args = [
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx',


      '-reconnect_delay_max', '60',
      '-multiple_requests', '1',
      '-v', 'error',
      '-user_agent', 'Mozilla/5.0',
      '-i', resolvedUrl,
      '-map', `0:s:${track}`,
      '-c:s', 'webvtt',
      '-f', 'webvtt',
      'pipe:1'
    ];
    
    const ffmpegProcess = spawn(ffmpegPath, args, { env: getFfmpegEnv() });
    ffmpegProcess.stdout.pipe(res);
    
    ffmpegProcess.on('error', (err) => {
      console.error('[FFmpeg Subtitle] Error:', err);
    });
    
    req.on('close', () => {
      ffmpegProcess.kill('SIGKILL');
    });
  });
    
  const codecCache = new Map<string, boolean>();
const durationCache = new Map<string, number>();
  
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

    // Resolve TorBox redirects FIRST so we can pass the direct HTTP URL to FFmpeg
    let resolvedUrl = targetUrl;
    if (targetUrl.includes('torbox.app') && targetUrl.includes('requestdl')) {
      try {
        console.log('[FFmpeg-Proxy] TorBox requestdl URL detected - resolving redirect...');
        const redirectRes = await axios({
          method: 'get',
          url: targetUrl,
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (redirectRes.status === 307 && redirectRes.headers['location']) {
          resolvedUrl = redirectRes.headers['location'] as string;
          console.log('[FFmpeg-Proxy] Resolved CDN URL:', resolvedUrl);
        } else if (redirectRes.data && typeof redirectRes.data === 'object' && redirectRes.data.data) {
          resolvedUrl = redirectRes.data.data;
          console.log('[FFmpeg-Proxy] Resolved JSON CDN URL:', resolvedUrl);
        }
      } catch (resolveErr: any) {
        if (resolveErr.response?.status === 307 && resolveErr.response?.headers?.location) {
          resolvedUrl = resolveErr.response.headers.location;
          console.log('[FFmpeg-Proxy] Resolved CDN URL from error response:', resolvedUrl);
        } else {
          console.error('[FFmpeg-Proxy] Failed to resolve TorBox redirect:', resolveErr.message);
        }
      }
    }

    const originalHost = new URL(resolvedUrl).hostname;
    const ipUrl = resolvedUrl;

    const isLive = req.query.live === 'true';

    const args = [];
    if (!isLive && startOffset && !isNaN(parseFloat(startOffset))) {
      args.push('-noaccurate_seek', '-ss', startOffset);
    }
    
    if (isLive) {
      args.push('-fflags', '+genpts+igndts');
    }
    
    args.push('-user_agent', 'Mozilla/5.0');
    args.push('-http_proxy', `http://127.0.0.1:${FFMPEG_PROXY_PORT}`);
    if (ipUrl.startsWith('https')) {
      args.push('-tls_verify', '0');
    }
    args.push(
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx',


      '-reconnect_delay_max', '60',
      '-multiple_requests', '1',
      '-headers', `Host: ${originalHost}\r\n`,
      '-i', ipUrl
    );

    if (isLive) {
      // Allow FFmpeg to auto-map video and audio streams for IPTV playlists
      // as stream indexes frequently change across different channels.
    } else {
      args.push('-map', '0:V:0');
      if (audioTrack && audioTrack !== '0') {
        if (isNaN(parseInt(audioTrack as string, 10))) {
          // It is a language code like 'eng'
          // We restrict the map to audio streams (0:a:m:language) to avoid accidentally mapping subtitle tracks which would crash the mp4 muxer
          args.push('-map', `0:a:m:language:${audioTrack}?`, '-map', '0:a:0?');
        } else {
          // It is a specific numeric index like '1' (meaning 0:a:1)
          args.push('-map', `0:a:${audioTrack}?`);
        }
      } else {
        args.push('-map', '0:a:0?');
      }
    }
    
    const hevcQuery = req.query.hevc;
    let isHevc = hevcQuery === 'true' ? true : (hevcQuery === 'false' ? false : null);

    if (isHevc === null) {
      if (codecCache.has(targetUrl)) {
        isHevc = codecCache.get(targetUrl) as boolean;
      } else if (!isLive) {
        try {
          const infoUrl = `http://localhost:${process.env.PORT || 5150}/api/media-info?url=${encodeURIComponent(resolvedUrl)}`;
          const infoRes = await axios.get(infoUrl, { timeout: 15000 });
          const mediaInfo = infoRes.data;
          const videoStream = mediaInfo.streams?.find((s: any) => s.codec_type === 'video' && s.codec_name !== 'mjpeg' && s.codec_name !== 'png' && s.codec_name !== 'bmp');
          if (videoStream && (videoStream.codec_name !== 'h264' || (videoStream.pix_fmt && videoStream.pix_fmt.includes('10')) || (videoStream.width && videoStream.width > 2000))) {
            isHevc = true;
          }
          codecCache.set(targetUrl, isHevc);
        } catch (err: any) {
          console.warn('[FFmpeg-Proxy] Codec auto-detection failed:', err.message);
        }
      }
    }

    if (isHevc) {
      if (hwAccel) {
        const bestEncoder = detectBestH264Encoder();
        if (bestEncoder !== 'libx264') {
          console.log(`[FFmpeg-Proxy] Detected HEVC/Dolby Vision. Transcoding to 1080p H.264 using ${bestEncoder} hardware acceleration.`);
          args.push(
            '-c:v', bestEncoder,
            '-preset', 'fast',
            '-b:v', '5M',
            '-vf', 'scale=-2:1080'
          );
        } else {
          console.warn('[FFmpeg-Proxy] Hardware acceleration requested but no hardware encoder found. Falling back to software encoding (libx264).');
          args.push(
            '-c:v', 'libx264', 
            '-preset', 'ultrafast', 
            '-crf', '28', 
            '-vf', 'scale=-2:1080'
          );
        }
      } else {
        console.log('[FFmpeg-Proxy] Detected HEVC/Dolby Vision. Transcoding to 1080p H.264 for browser compatibility (Software).');
        args.push(
          '-c:v', 'libx264', 
          '-preset', 'ultrafast', 
          '-crf', '28', 
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

  // TorBox API Proxies
  const usenetSearchCache = new Map<string, { timestamp: number, data: any[] }>();
  const USENET_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

  app.get("/api/torbox/search", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: "Query 'q' parameter is required." });
    }
    console.log(`[Usenet Proxy] Received search request for: "${q}"`);

    try {
      const cacheKey = q;
      const now = Date.now();
      if (usenetSearchCache.has(cacheKey)) {
        const cached = usenetSearchCache.get(cacheKey)!;
        if (now - cached.timestamp < USENET_CACHE_TTL) {
          return res.json({ success: true, detail: "Usenet search returned from cache.", data: cached.data });
        }
      }

      const fallbackUrl = `https://www.nzbindex.nl/rss/?q=${encodeURIComponent(q)}&nzblink=1`;
      console.log(`[Usenet Search Direct] Fetching from NZBIndex: ${fallbackUrl}`);
      const rssRes = await axios.get(fallbackUrl, {
        timeout: 7000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      const xml = rssRes.data;
      
      // Simple regex-based parsing of RSS items
      const items: any[] = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const content = match[1];
        const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = content.match(/<link>([\s\S]*?)<\/link>/);
        const sizeMatch = content.match(/<description>[\s\S]*?Size: ([\s\S]*?)<br \/>/i) || content.match(/length="(\d+)"/);
        
        let title = titleMatch ? titleMatch[1].trim() : "Unknown NZB Release";
        let link = linkMatch ? linkMatch[1].trim() : "";

        // Clean CDATA wrappers if present
        if (title.includes("![CDATA[")) {
          title = title.replace("<![CDATA[", "").replace("]]>", "").trim();
        }
        if (link.includes("![CDATA[")) {
          link = link.replace("<![CDATA[", "").replace("]]>", "").trim();
        }

        // 1. FILTER: Only accept video formats. Ignore subtitle/metadata/archive files.
        const titleLower = title.toLowerCase();
        const nonVideoPatterns = [
          /\.srt\b/i, /\.sub\b/i, /\.nfo\b/i, /\.txt\b/i, /\.jpg\b/i, /\.png\b/i, 
          /\.sfv\b/i, /\.par2\b/i, /\.nzb\b/i, /\.rar\b/i, /\.zip\b/i, /\.r\d{2}\b/i
        ];
        const isNonVideo = nonVideoPatterns.some(pat => pat.test(titleLower));
        if (isNonVideo) {
          continue;
        }

        // 2. CLEAN TITLE: Try to extract actual clean release filename (e.g. remove Usenet release prefixes like [01/10] - or quotes)
        let cleanTitle = title;
        
        // Remove quotes around titles if present
        if (cleanTitle.startsWith('"') && cleanTitle.endsWith('"')) {
          cleanTitle = cleanTitle.substring(1, cleanTitle.length - 1);
        }
        
        // Strip common Usenet prefix patterns like "[01/25] - " or "yEnc (" or "Part 1 of 5"
        cleanTitle = cleanTitle.replace(/^\[\d+\/\d+\]\s*(-\s*)?/, ''); // Removes "[01/12] - "
        cleanTitle = cleanTitle.replace(/^\(\d+\/\d+\)\s*(-\s*)?/, ''); // Removes "(01/12) - "
        
        // Strip trailing yEnc suffixes e.g. "yEnc (1/120)" or just "yEnc"
        cleanTitle = cleanTitle.replace(/\s*yenc\s*(\(\d+\/\d+\))?.*$/i, '');
        cleanTitle = cleanTitle.replace(/\s*yenc\s*.*$/i, '');
        
        cleanTitle = cleanTitle.replace(/^[^"]*"\s*/, ''); // If it has quotes embedded, grab content inside/after quotes
        cleanTitle = cleanTitle.replace(/"\s*$/, '');
        cleanTitle = cleanTitle.trim();

        let size = 0;
        if (sizeMatch) {
          if (sizeMatch[1].match(/^\d+$/)) {
            size = parseInt(sizeMatch[1]);
          } else {
            // Parse string representation e.g. "1.2 GB"
            const sizeStr = sizeMatch[1].toUpperCase();
            const num = parseFloat(sizeStr);
            if (sizeStr.includes("GB")) size = num * 1024 * 1024 * 1024;
            else if (sizeStr.includes("MB")) size = num * 1024 * 1024;
            else if (sizeStr.includes("KB")) size = num * 1024;
            else size = num;
          }
        }

        if (link) {
          items.push({
            name: cleanTitle,
            title: cleanTitle,
            link: link,
            cached: false,
            seeds: 0,
            peers: 0,
            source: 'NZBIndex'
          });
        }
      }
      
      // Cleanup old cache entries
      if (usenetSearchCache.size > 100) {
        const oldest = [...usenetSearchCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
        usenetSearchCache.delete(oldest);
      }

      const settings = readJson(SETTINGS_FILE);
      const filteredItems = await filterWithGemini(q as string, items, settings);

      usenetSearchCache.set(cacheKey, { timestamp: now, data: filteredItems });
      res.json({ success: true, detail: "Usenet search completed successfully.", data: filteredItems });
    } catch (err: any) {
      if (err.response && err.response.status === 429) {
        console.warn(`[Usenet Search Direct] Rate limited by NZBIndex for query '${q}'. Returning empty array.`);
        return res.json({ success: true, detail: "Rate limited by NZBIndex. Returning empty result.", data: [] });
      }
      console.error("[Usenet Search Direct] NZBIndex query failed:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  async function filterWithGemini(query: string, items: any[], settings: any): Promise<any[]> {
    if (items.length === 0) return items;
    
    // 1. PRE-FILTER HEVC/x265/10-bit/HDR when hardware transcoding is disabled or unsupported
    const isHwDisabled = settings.intelTranscoding !== true || detectBestH264Encoder() === 'libx264';
    let candidateItems = items;
    if (isHwDisabled) {
      const hevcRegex = /(^|[^a-z0-9])(hevc|x265|h\.?265|265|10-?bit|10b|hdr|hdr10|hdr10\+|dv|dolby\s*vision|main10)([^a-z0-9]|$)/i;
      candidateItems = items.filter(t => {
        const name = (t.name || t.title || '').toLowerCase();
        return !hevcRegex.test(name);
      });
      if (candidateItems.length < items.length) {
        console.log(`[HEVC Pre-Filter] Excluded ${items.length - candidateItems.length} HEVC/x265/10-bit/HDR streams for "${query}"`);
      }
    }

    if (!settings.geminiApiKey || candidateItems.length === 0) return candidateItems;
    
    try {
      const list = candidateItems.map((t, i) => `${i}: ${t.name || t.title}`).join('\n');
      
      let hwFilterInstruction = '';
      if (isHwDisabled) {
        hwFilterInstruction = '\n\nCRITICAL HARDWARE CONSTRAINT - STRICT NO HEVC/x265 POLICY: Hardware transcoding is NOT enabled or supported. You MUST strictly filter out and exclude ANY video stream that contains HEVC, x265, H.265, H265, 265, 10-bit, 10bit, 10b, Main10, HDR, HDR10, DV, or Dolby Vision anywhere in the title or release name. Inspect every character of each title carefully. Only allow standard 8-bit H.264 / x264 video streams.';
      }

      let animeFilterInstruction = '';
      if (settings.filterAnime === true) {
        animeFilterInstruction = '\n\nCRITICAL ANIME FILTERING: The admin setting "Filter Anime" is ENABLED. You MUST strictly filter out and exclude ANY anime series, anime movies, Japanese animation, or releases from anime encoding groups (such as SubsPlease, Erai-raws, HorribleSubs, Judas, ASW, Golumpa, MiniAni, Anime, etc.), REGARDLESS of whether the search query matches an anime title or not. Filter out all anime completely.';
      }

      let langInstruction = '';
      if (settings.preferredLanguage && settings.preferredLanguage !== 'all') {
        const langMap: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese' };
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

      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${settings.geminiApiKey}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { timeout: 60000, headers: { 'Content-Type': 'application/json' } }
      );
      
      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const indices = JSON.parse(cleanText);
      
      if (Array.isArray(indices)) {
        console.log(`[Gemini Filter] Filtered from ${candidateItems.length} to ${indices.length} items for "${query}"`);
        return indices.map(i => candidateItems[i]).filter(Boolean);
      }
      return candidateItems;
    } catch (err: any) {
      console.error("[Gemini Filter Error]", err.message);
      return candidateItems; // Fallback to HEVC-stripped candidate items if Gemini fails
    }
  }

  app.get("/api/torbox/torrents/search", async (req, res) => {
    const { q, imdbId } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: "Query 'q' parameter is required." });
    }
    console.log(`[Torrent Proxy] Received search request for: "${q}" (IMDB: ${imdbId || 'N/A'})`);
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization key is required." });
    }

    const TRACKERS = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.tracker.cl:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://9.rarbg.com:2810/announce',
    ].map(t => `&tr=${encodeURIComponent(t)}`).join('');

    const buildMagnet = (hash: string, name: string) =>
      `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}${TRACKERS}`;

    const scrapeHTML = require('cheerio');

    try {
      const [pbRes, ytsRes, ytsLuRes, solidRes, limeRes, eztvRes] = await Promise.all([
        // The Pirate Bay
        axios.get(`https://apibay.org/q.php?q=${encodeURIComponent(q)}`, { timeout: 7000 }).catch(() => null),
        // YTS.mx (best for movies)
        axios.get(`https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(q)}&limit=20`, { timeout: 7000 }).catch(() => null),
        // YTS.lu (mirror with wider catalogue — same API format)
        axios.get(`https://yts.lu/api/v2/list_movies.json?query_term=${encodeURIComponent(q)}&limit=20`, { timeout: 9000 }).catch(() => null),
        // SolidTorrents (aggregates 1337x, RARBG dumps, TorrentGalaxy & others)
        axios.get(`https://solidtorrents.to/api/v1/search?q=${encodeURIComponent(q)}&limit=20`, { timeout: 7000 }).catch(() => null),
        // LimeTorrents (HTML scrape — no Cloudflare, responds with 200)
        axios.get(`https://www.limetorrents.lol/search/all/${encodeURIComponent(q.replace(/\s+/g, '-'))}/seeds/1/`, {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        }).catch(() => null),
        // EZTV (works best for TV shows — needs numeric IMDB ID)
        (imdbId && typeof imdbId === 'string')
          ? axios.get(`https://eztvx.to/api/get-torrents?limit=30&imdb_id=${imdbId.replace(/^tt/, '')}`, { timeout: 7000 }).catch(() => null)
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

      // Sort by seeds descending before filtering
      mappedTorrents.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));

      const settings = readJson(SETTINGS_FILE);
      const filteredTorrents = await filterWithGemini(q as string, mappedTorrents, settings);

      res.json({ success: true, data: filteredTorrents });
    } catch (err: any) {
      console.error("[Torrents Search API Error]", err.message);
      res.status(500).json({ error: err.message, success: false, data: [] });
    }
  });

  const torboxTorrentListCache = new Map<string, { timestamp: number; data: any }>();
  const torboxUsenetListCache = new Map<string, { timestamp: number; data: any }>();

  app.get("/api/torbox/torrents", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization key is required." });
    }
    const cached = torboxTorrentListCache.get(authHeader);
    const now = Date.now();
    if (cached && (now - cached.timestamp < 2000)) {
      return res.json(cached.data);
    }
    try {
      const response = await axios.get("https://api.torbox.app/v1/api/torrents/mylist?bypass_cache=true", {
        timeout: 7000,
        headers: { Authorization: authHeader }
      });
      torboxTorrentListCache.set(authHeader, { timestamp: now, data: response.data });
      res.json(response.data);
    } catch (err: any) {
      if (cached && cached.data) {
        console.warn("[TorBox Torrents Proxy] Serving cached list due to upstream error:", err.message);
        return res.json(cached.data);
      }
      res.status(err.response?.status || 500).json({ error: err.message });
    }
  });

  app.get("/api/torbox/usenet/list", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization key is required." });
    }
    const cached = torboxUsenetListCache.get(authHeader);
    const now = Date.now();
    if (cached && (now - cached.timestamp < 2000)) {
      return res.json(cached.data);
    }
    try {
      const response = await axios.get("https://api.torbox.app/v1/api/usenet/mylist?bypass_cache=true", {
        timeout: 7000,
        headers: { Authorization: authHeader }
      });
      torboxUsenetListCache.set(authHeader, { timestamp: now, data: response.data });
      res.json(response.data);
    } catch (err: any) {
      if (cached && cached.data) {
        console.warn("[TorBox Usenet Proxy] Serving cached list due to upstream error:", err.message);
        return res.json(cached.data);
      }
      res.status(err.response?.status || 500).json({ error: err.message });
    }
  });

  app.post("/api/torbox/usenet/create", express.json(), async (req, res) => {
    const authHeader = req.headers.authorization;
    const { link } = req.body;
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization key is required." });
    }
    if (!link) {
      return res.status(400).json({ error: "Usenet NZB link is required." });
    }
    let attempt = 0;
    while (attempt < 3) {
      try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('link', link);
        form.append('post_processing', '-1');

        const response = await axios.post("https://api.torbox.app/v1/api/usenet/createusenetdownload", form, {
          headers: { 
            Authorization: authHeader,
            ...form.getHeaders()
          }
        });
        return res.json(response.data);
      } catch (err: any) {
        if (err.response?.status === 429 && attempt < 2) {
          attempt++;
          console.warn("[TorBox Usenet Create Proxy] Rate limited (429). Retrying in 2.5s...");
          await new Promise(r => setTimeout(r, 2500));
          continue;
        }
        console.error("[TorBox Usenet Create Proxy] Failed:", err.response?.data || err.message);
        return res.status(err.response?.status || 500).json({ error: err.message, detail: err.response?.data });
      }
    }
  });

  app.post("/api/torbox/torrents/create", express.json(), async (req, res) => {
    const authHeader = req.headers.authorization;
    const { magnet } = req.body;
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization key is required." });
    }
    if (!magnet) {
      return res.status(400).json({ error: "Torrent magnet link is required." });
    }
    let attempt = 0;
    while (attempt < 3) {
      try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('magnet', magnet);
        form.append('seed', '1');
        form.append('allow_zip', 'false');

        const response = await axios.post("https://api.torbox.app/v1/api/torrents/createtorrent", form, {
          headers: { 
            Authorization: authHeader,
            ...form.getHeaders()
          }
        });
        return res.json(response.data);
      } catch (err: any) {
        if (err.response?.status === 429 && attempt < 2) {
          attempt++;
          console.warn("[TorBox Torrent Create Proxy] Rate limited (429). Retrying in 2.5s...");
          await new Promise(r => setTimeout(r, 2500));
          continue;
        }
        console.error("[TorBox Torrent Create Proxy] Failed:", err.response?.data || err.message);
        return res.status(err.response?.status || 500).json({ error: err.message, detail: err.response?.data });
      }
    }
  });


  // API Route: Test parsing M3U (we'll create a dummy file to test)
  app.post("/api/m3u", async (req, res) => {
    try {
      const { url } = req.body;
      if (url) {
        const parsed = await parseM3U(url);
        return res.json(parsed);
      }
      
      const dummyFilePath = path.join(__dirname, 'sample.m3u');
      // Create a dummy M3U file if it doesn't exist just for testing
      if (!fs.existsSync(dummyFilePath)) {
        const dummyM3U = `#EXTM3U
#EXTINF:-1 tvg-id="test" tvg-logo="https://example.com/logo.png",Test Channel 1
http://example.com/stream1.m3u8
#EXTINF:-1 tvg-id="test2",Test Channel 2
http://example.com/stream2.m3u8`;
        fs.writeFileSync(dummyFilePath, dummyM3U);
      }
      
      const parsed = await parseM3U(dummyFilePath);
      res.json(parsed);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Test parsing EPG
  app.post("/api/epg", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
         return res.status(400).json({ error: "EPG URL is required" });
      }
      const parsed = await parseEPG(url);
      res.json(parsed);
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


  app.post('/api/log', express.json(), (req, res) => { console.log('[CLIENT ERROR]', req.body); res.sendStatus(200); });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
