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
import ffprobePath from 'ffprobe-static';
import util from 'util';
import { execFile } from 'child_process';
const execFileAsync = util.promisify(execFile);
import ffprobeStatic from 'ffprobe-static';
import { spawn } from 'child_process';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { PassThrough } from 'stream';
import play from 'play-dl';
import ytdl from '@distube/ytdl-core';

const _filename = typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '';
const _dirname = _filename ? path.dirname(_filename) : '';

// ============================================================================
// PHASE 1: NODE.JS BACKEND FUNCTIONS (For your Electron main.js)
// ============================================================================

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
  
  app.use(express.json());

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

  // Check if first-time setup is required (zero users in db)
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

    const { email, username, password, tmdbKey, torboxApiKey } = req.body;
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
    writeJson(SETTINGS_FILE, settings);

    res.json({ success: true, user: { uid, email, username, role: 'admin', status: 'approved' }, token });
  });

  // Endpoint for client frontend to fetch non-sensitive integration configurations dynamically
  app.get('/api/auth/config', (req, res) => {
    const settings = readJson(SETTINGS_FILE);
    res.json({
      tmdbKey: settings.tmdbKey || '',
      torboxApiKey: settings.torboxApiKey || '',
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
      usenetPassword: settings.usenetPassword || ''
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
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    
    const token = authHeader.split(' ')[1];
    const users = readJson(USERS_FILE);
    const user = Object.values(users).find(u => u.token === token);

    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ user: { uid: user.uid, email: user.email, username: user.username, role: user.role || 'user' } });
  });

  // Simple Auth Middleware for DB routes
  const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    
    const token = authHeader.split(' ')[1];
    const users = readJson(USERS_FILE);
    const user = Object.values(users).find(u => u.token === token);
    
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  };


  // Admin Middleware
  const requireAdmin = (req, res, next) => {
    requireAuth(req, res, () => {
      if (req.user.role !== 'admin') {
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
      }
    });
  });

  // /api/admin/settings PUT
  app.put('/api/admin/settings', requireAdmin, (req, res) => {
    const settings = readJson(SETTINGS_FILE);
    const { gmailUser, gmailAppPassword, appName, appUrl } = req.body.email || {};
    settings.email = {
      gmailUser: gmailUser ?? settings.email?.gmailUser ?? '',
      // Only update the password if a new one was provided
      gmailAppPassword: gmailAppPassword || settings.email?.gmailAppPassword || '',
      appName: appName ?? settings.email?.appName ?? 'BubbaFlix',
      appUrl: appUrl ?? settings.email?.appUrl ?? '',
    };
    writeJson(SETTINGS_FILE, settings);
    res.json({ success: true });
  });

  // /api/admin/test-email POST
  app.post('/api/admin/test-email', requireAdmin, async (req, res) => {
    try {
      const result = await sendWelcomeEmail(
        req.user.email,
        req.user.username,
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
    const key = `${req.user.uid}_${req.params.collection}`;
    res.json(db[key] || []);
  });

  // /api/db/post/:collection
  app.post('/api/db/post/:collection', requireAuth, (req, res) => {
    const db = readJson(DB_FILE);
    const key = `${req.user.uid}_${req.params.collection}`;
    db[key] = req.body;
    writeJson(DB_FILE, db);
    res.json({ success: true });
  });

  // --- END AUTH & DB ---


  // API Route: Transcode Video using FFmpeg
  
  // Resolves the hostname in a streaming URL to its IP address dynamically
  // to bypass static child process binary DNS resolution failures in bridge networks.
  const resolveUrlIp = async (urlStr: string): Promise<string> => {
    try {
      const parsedUrl = new URL(urlStr);
      if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        return urlStr;
      }
      return new Promise((resolve) => {
        dns.lookup(parsedUrl.hostname, (err, address) => {
          if (err || !address) {
            console.warn(`[DNS Resolve] Failed to resolve IP for ${parsedUrl.hostname}, using original URL.`);
            resolve(urlStr);
          } else {
            console.log(`[DNS Resolve] Resolved ${parsedUrl.hostname} to ${address}`);
            const headers = parsedUrl.searchParams.get('headers') || '';
            
            // Reconstruct URL with IP and keep original Host header parameter if needed,
            // or pass Host headers via FFmpeg arguments. Modern cloudfront/cloudflare proxies 
            // require the Host header to route traffic. We can tell FFmpeg to set the Host header.
            parsedUrl.hostname = address;
            resolve(parsedUrl.toString());
          }
        });
      });
    } catch {
      return urlStr;
    }
  };

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

    const args = [
      '-user_agent', 'Mozilla/5.0',
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      '-i', probeUrl
    ];

    const ffprobeProcess = spawn(ffprobeStatic.path, args);
    let output = '';

    ffprobeProcess.stdout.on('data', (data) => {
      output += data.toString();
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

  app.get("/api/subtitles", async (req, res) => {
    const targetUrl = req.query.url;
    const index = req.query.index;
    if (!targetUrl || typeof targetUrl !== 'string' || !index) {
      return res.status(400).send("URL and index are required");
    }

    res.header('Content-Type', 'text/vtt');
    res.header('Access-Control-Allow-Origin', '*');

    const args = [
      '-i', 'pipe:0',
      '-map', `0:${index}`,
      '-f', 'webvtt',
      'pipe:1'
    ];

    const ffmpegProcess = spawn(ffmpegPath, args);
    ffmpegProcess.stdout.pipe(res);

    try {
      const response = await axios({
        method: 'get',
        url: targetUrl,
        responseType: 'stream',
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      response.data.pipe(ffmpegProcess.stdin);
    } catch (err: any) {
      console.error('[Subtitle Proxy] Connection failed:', err.message);
      ffmpegProcess.stdin.end();
    }

    ffmpegProcess.on('error', (err) => {
      console.error('[FFmpeg Subtitle Error]', err);
    });

    req.on('close', () => {
      ffmpegProcess.kill('SIGKILL');
    });
  });


  // API Route: YouTube Music Proxy
  app.get("/api/music/stream", async (req, res) => {
    const query = req.query.q;
    if (!query || typeof query !== 'string') {
      return res.status(400).send("Query is required");
    }
    try {
      // Find the first matching video
      const yt_info = await play.search(query, { limit: 1, source: { youtube: "video" } });
      if (!yt_info || yt_info.length === 0) {
        return res.status(404).send("Not found");
      }
      
      // Get readable stream
      res.setHeader('Content-Type', 'audio/webm');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      ytdl(yt_info[0].url, { filter: 'audioonly', quality: 'highestaudio' }).pipe(res);
    } catch (err) {
      console.error('[YouTube Stream Proxy Error]', err);
      res.status(500).send("Stream proxy failed");
    }
  });


  // API Route: YouTube Video Search
  
// API Route: Get direct stream URL via yt-dlp
app.get('/api/youtube/stream-url', (req, res) => {
  const vidId = req.query.id;
  if (!vidId || typeof vidId !== 'string') {
    return res.status(400).send('ID is required');
  }
  const ytUrl = `https://www.youtube.com/watch?v=${vidId}`;
  
  const pythonProcess = spawn('python', ['-m', 'yt_dlp', '-g', '-f', 'best', ytUrl]);
  
  let output = '';
  pythonProcess.stdout.on('data', data => output += data.toString());
  pythonProcess.on('close', code => {
    if (code === 0) {
      const urls = output.trim().split('\n');
      const directUrl = urls[urls.length - 1]; // last line is the url
      res.json({ url: directUrl });
    } else {
      res.status(500).json({ error: 'yt-dlp failed' });
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
      '-user_agent', 'Mozilla/5.0',
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      '-i', resolvedUrl
    ];

    const ffprobeProcess = spawn(ffprobeStatic.path, args);
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
    
    const args = [
      '-v', 'error',
      '-i', 'pipe:0',
      '-map', `0:s:${track}`,
      '-c:s', 'webvtt',
      '-f', 'webvtt',
      'pipe:1'
    ];
    
    const ffmpegProcess = spawn(ffmpegPath, args);
    ffmpegProcess.stdout.pipe(res);

    try {
      const response = await axios({
        method: 'get',
        url: targetUrl,
        responseType: 'stream',
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      response.data.pipe(ffmpegProcess.stdin);
    } catch (err: any) {
      console.error('[FFmpeg Subtitle Proxy] Connection failed:', err.message);
      ffmpegProcess.stdin.end();
    }
    
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

    const args = [];
    if (startOffset && !isNaN(parseFloat(startOffset))) {
      args.push('-ss', startOffset);
    }
    
    args.push(
      '-user_agent', 'Mozilla/5.0',
      '-i', resolvedUrl,
      '-map', '0:v:0',
    );
    if (audioTrack && audioTrack !== '0') {
      args.push('-map', `0:${audioTrack}`);
    } else {
      args.push('-map', '0:a:0');
    }
    
    // Auto-detect HEVC and transcode via inline probe
    let isHevc = false;

    try {
      // Pass resolvedUrl to save /api/media-info from doing an extra redirect
      const infoUrl = `http://localhost:${process.env.PORT || 5150}/api/media-info?url=${encodeURIComponent(resolvedUrl)}`;
      const infoRes = await axios.get(infoUrl, { timeout: 15000 });
      const mediaInfo = infoRes.data;
      const videoStream = mediaInfo.streams?.find((s: any) => s.codec_type === 'video');
      if (videoStream && (videoStream.codec_name === 'hevc' || videoStream.codec_name === 'dvvideo')) {
        isHevc = true;
      }
    } catch (err: any) {
      console.warn('[FFmpeg-Proxy] Codec auto-detection failed:', err.message);
    }

    if (isHevc) {
      console.log('[FFmpeg-Proxy] Detected HEVC/Dolby Vision. Transcoding to 1080p H.264 for browser compatibility.');
      args.push(
        '-c:v', 'libx264', 
        '-preset', 'ultrafast', 
        '-crf', '28', 
        '-vf', 'scale=-2:1080'
      );
    } else {
      args.push('-c:v', 'copy');
    }

    const audioLeveling = req.query.audioLeveling === 'true';
    if (audioLeveling) {
      console.log('[FFmpeg-Proxy] Enabling Dynamic Audio Leveling (dynaudnorm filter)');
      args.push('-af', 'dynaudnorm=f=150:g=15:p=0.95');
    }

    args.push(
      '-c:a', 'aac',        
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-bufsize', bufsize,
      '-max_muxing_queue_size', '1024',
      'pipe:1'
    );

    const ffmpegProcess = spawn(ffmpegPath, args);

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
      errorOutput = str.substring(0, 200);
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
  app.get("/api/torbox/search", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: "Query 'q' parameter is required." });
    }

    try {
      const fallbackUrl = `https://www.nzbindex.nl/rss/?q=${encodeURIComponent(q)}&nzblink=1`;
      console.log(`[Usenet Search Direct] Fetching from NZBIndex: ${fallbackUrl}`);
      const rssRes = await axios.get(fallbackUrl);
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
            size: size,
            cached: false,
            seeds: 0,
            peers: 0
          });
        }
      }
      
      res.json({ success: true, detail: "Usenet search completed successfully.", data: items });
    } catch (err: any) {
      console.error("[Usenet Search Direct] NZBIndex query failed:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/torbox/torrents/search", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: "Query 'q' parameter is required." });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization key is required." });
    }

    try {
      const response = await axios.get(`https://api.torbox.app/v1/api/torrents/search?query=${encodeURIComponent(q)}`, {
        headers: { Authorization: authHeader }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error("[Torrents Search API Error]", err.message);
      res.status(err.response?.status || 500).json({ error: err.message });
    }
  });

  app.get("/api/torbox/torrents", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization key is required." });
    }
    try {
      const response = await axios.get("https://api.torbox.app/v1/api/torrents/mylist", {
        headers: { Authorization: authHeader }
      });
      res.json(response.data);
    } catch (err: any) {
      res.status(err.response?.status || 500).json({ error: err.message });
    }
  });

  app.get("/api/torbox/usenet/list", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization key is required." });
    }
    try {
      const response = await axios.get("https://api.torbox.app/v1/api/usenet/mylist", {
        headers: { Authorization: authHeader }
      });
      res.json(response.data);
    } catch (err: any) {
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
