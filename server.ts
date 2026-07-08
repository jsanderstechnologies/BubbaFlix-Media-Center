import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import parser from 'iptv-playlist-parser';
import fs from 'fs';
import { fileURLToPath } from 'url';
import epgParser from 'epg-parser';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { PassThrough } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// PHASE 1: NODE.JS BACKEND FUNCTIONS (For your Electron main.js)
// ============================================================================

/**
 * Fetches and parses a standard AIOStreams manifest.json
 * @param {string} manifestUrl - The AIOStreams manifest URL
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
 * const { spawn } = require('child_process');
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
  const PORT = 5150;
  
  app.use(express.json());

  // --- AUTH & DB SYSTEM ---
  const USERS_FILE = path.join(__dirname, 'data', 'users.json');
  const DB_FILE = path.join(__dirname, 'data', 'db.json');

  const readJson = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return {}; }
  };
  const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

  // /api/auth/register
  app.post('/api/auth/register', (req, res) => {
    const { email, username, password } = req.body;
    if (!email || !username || !password) return res.status(400).json({ error: 'Missing fields' });
    
    const users = readJson(USERS_FILE);
    if (Object.values(users).some(u => u.email === email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const uid = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');

    users[uid] = { uid, email, username, salt, hash, token };
    writeJson(USERS_FILE, users);

    res.json({ user: { uid, email, username }, token });
  });

  // /api/auth/login
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const users = readJson(USERS_FILE);
    const user = Object.values(users).find(u => u.email === email);

    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
    if (hash !== user.hash) return res.status(400).json({ error: 'Invalid credentials' });

    const token = crypto.randomBytes(32).toString('hex');
    user.token = token;
    writeJson(USERS_FILE, users);

    res.json({ user: { uid: user.uid, email: user.email, username: user.username }, token });
  });

  // /api/auth/me
  app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    
    const token = authHeader.split(' ')[1];
    const users = readJson(USERS_FILE);
    const user = Object.values(users).find(u => u.token === token);

    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ user: { uid: user.uid, email: user.email, username: user.username } });
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
  
  // API Route: Get Media Duration
  app.get("/api/media-info", (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send("URL is required");
    }

    const args = [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      targetUrl
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

  app.get("/api/subtitles", (req, res) => {
    const targetUrl = req.query.url;
    const index = req.query.index;
    if (!targetUrl || typeof targetUrl !== 'string' || !index) {
      return res.status(400).send("URL and index are required");
    }

    res.header('Content-Type', 'text/vtt');
    res.header('Access-Control-Allow-Origin', '*');

    const args = [
      '-i', targetUrl,
      '-map', `0:${index}`,
      '-f', 'webvtt',
      'pipe:1'
    ];

    const ffmpegProcess = spawn(ffmpegPath, args);
    ffmpegProcess.stdout.pipe(res);
    ffmpegProcess.on('error', (err) => {
      console.error('[FFmpeg Subtitle Error]', err);
    });
  });

  app.get("/api/duration", (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send("URL is required");
    }

    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      targetUrl
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

  
  app.get("/api/transcode/subtitle.vtt", (req, res) => {
    const targetUrl = req.query.url;
    const track = req.query.track || '0';
    
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send("URL is required");
    }

    res.setHeader('Content-Type', 'text/vtt');
    
    const args = [
      '-v', 'error',
      '-i', targetUrl,
      '-map', `0:s:${track}`,
      '-c:s', 'webvtt',
      '-f', 'webvtt',
      'pipe:1'
    ];
    
    const ffmpegProcess = spawn(ffmpegPath, args);
    ffmpegProcess.stdout.pipe(res);
    
    ffmpegProcess.on('error', (err) => {
      console.error('[FFmpeg Subtitle] Error:', err);
    });
    
    req.on('close', () => {
      ffmpegProcess.kill('SIGKILL');
    });
  });

  app.get("/api/transcode/stream.mp4", (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send("URL is required");
    }

    console.log(`[FFmpeg] Starting transcode for: ${targetUrl}`);

    res.header('Content-Type', 'video/mp4');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Accept-Ranges', 'bytes');

    const audioTrack = req.query.audio;
    const startOffset = req.query.start as string;
    
    const args = [];
    if (startOffset && !isNaN(parseFloat(startOffset))) {
      args.push('-ss', startOffset);
    }
    
    args.push(
      '-i', targetUrl,
      '-map', '0:v:0',
    );
    if (audioTrack && audioTrack !== '0') {
      args.push('-map', `0:${audioTrack}`);
    } else {
      args.push('-map', '0:a:0');
    }
    
    const bufsize = req.query.bufsize as string || '64M';
    
    // Subtitles are now handled via a separate WebVTT endpoint!
    args.push('-c:v', 'copy');
    args.push(
      '-c:a', 'aac',        
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-bufsize', bufsize,
      '-max_muxing_queue_size', '1024',
      'pipe:1'
    );

    const ffmpegProcess = spawn(ffmpegPath, args);

    // Create an aggressive Node.js memory buffer (PassThrough)
    // We convert the 'M' suffix back to bytes for highWaterMark.
    let hwMark = 64 * 1024 * 1024; // default 64MB
    if (bufsize.endsWith('M')) {
      hwMark = parseInt(bufsize.replace('M', ''), 10) * 1024 * 1024;
    }
    
    // Ensure we don't go over ~1GB to prevent V8 memory crashes, but allow huge buffers if requested
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

  // API Route: Test fetching AIOStreams manifest
  app.post("/api/manifest", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      const manifest = await fetchAIOStreamsManifest(url);
      res.json(manifest);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
