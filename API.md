# BubbaFlix Media Center - Backend API Documentation

This document provides complete reference instructions for all backend REST API endpoints exposed by the BubbaFlix Media Center server (`server.ts`).

---

## Table of Contents

- [Overview & Authentication](#overview--authentication)
- [System & Setup APIs](#system--setup-apis)
- [Authentication & User Management APIs](#authentication--user-management-apis)
- [Admin Management & Settings APIs](#admin-management--settings-apis)
- [Local Database Cache APIs](#local-database-cache-apis)
- [Media Transcoding, Streaming & Player APIs](#media-transcoding-streaming--player-apis)
- [Subtitles & OpenSubtitles APIs](#subtitles--opensubtitles-apis)
- [YouTube & Trailer Streaming APIs](#youtube--trailer-streaming-apis)
- [Torrent & Debrid (Premiumize) APIs](#torrent--debrid-premiumize-apis)
- [Image Proxy & Caching API](#image-proxy--caching-api)
- [IPTV (M3U, EPG & VOD) APIs](#iptv-m3u-epg--vod-apis)
- [Local & Network Media Library APIs](#local--network-media-library-apis)
- [News & Sports APIs](#news--sports-apis)

---

## Overview & Authentication

- **Default Base URL:** `http://localhost:5150` (or `http://<SERVER_IP>:5150`)
- **Content-Type:** `application/json` (unless streaming binary data/video/images)

### Authentication Headers
For endpoints requiring authentication (`requireAuth` or `requireAdmin`), pass the session token or User UID in HTTP headers:

```http
Authorization: Bearer <sessionToken>
x-user-uid: <user_uid>
```

---

## System & Setup APIs

### 1. Get Hardware Video Encoder Info
Detects available server GPU hardware encoders (Intel VAAPI/QSV, NVIDIA NVENC, AMD AMF, Apple VideoToolbox, or Software libx264).

- **HTTP Method:** `GET`
- **Endpoint:** `/api/system/encoder`
- **Auth:** Public
- **Response:**
  ```json
  {
    "encoder": "h264_nvenc",
    "description": "NVIDIA NVENC (GPU)"
  }
  ```

---

### 2. Get Initial Setup Status
Checks whether the system has completed initial administrator setup.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/auth/setup-status`
- **Auth:** Public
- **Response:**
  ```json
  {
    "isFirstUser": true
  }
  ```

---

### 3. Initialize Admin Account
Creates the initial administrator user during setup wizard.

- **HTTP Method:** `POST`
- **Endpoint:** `/api/auth/setup-init`
- **Auth:** Public (First time only)
- **Request Body:**
  ```json
  {
    "username": "admin",
    "password": "SecretPassword123",
    "email": "admin@example.com"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "user": {
      "uid": "usr_admin_12345",
      "username": "admin",
      "email": "admin@example.com",
      "role": "admin",
      "approved": true
    }
  }
  ```

---

## Authentication & User Management APIs

### 1. Get Server Auth Configuration
Fetches auth modes and server configuration flags.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/auth/config`
- **Auth:** Public
- **Response:**
  ```json
  {
    "firebaseEnabled": false,
    "setupCompleted": true
  }
  ```

---

### 2. User Registration
Registers a new user account.

- **HTTP Method:** `POST`
- **Endpoint:** `/api/auth/register`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "username": "john_doe",
    "password": "MyPassword123",
    "email": "john@example.com"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "message": "Registration submitted. Pending admin approval.",
    "user": {
      "uid": "usr_987654321",
      "username": "john_doe",
      "email": "john@example.com",
      "approved": false
    }
  }
  ```

---

### 3. User Login
Authenticates user credentials and returns user details and session token.

- **HTTP Method:** `POST`
- **Endpoint:** `/api/auth/login`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "username": "john_doe",
    "password": "MyPassword123"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "token": "tok_abcdef1234567890",
    "user": {
      "uid": "usr_987654321",
      "username": "john_doe",
      "role": "user",
      "approved": true
    }
  }
  ```

---

### 4. Get Current User Session
Returns current session details for the logged-in user.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/auth/me`
- **Auth:** User Session Token
- **Response:**
  ```json
  {
    "uid": "usr_987654321",
    "username": "john_doe",
    "role": "user",
    "approved": true
  }
  ```

---

### 5. Get User Settings
Retrieves preferences for the authenticated user.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/user/settings`
- **Auth:** `requireAuth`
- **Response:**
  ```json
  {
    "audioLanguage": "eng",
    "ccLanguage": "eng",
    "autoCC": true,
    "playerPath": "builtin"
  }
  ```

---

### 6. Update User Settings
Updates user preferences.

- **HTTP Method:** `PUT`
- **Endpoint:** `/api/user/settings`
- **Auth:** `requireAuth`
- **Request Body:**
  ```json
  {
    "audioLanguage": "eng",
    "ccLanguage": "spa",
    "autoCC": false
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "settings": { ... }
  }
  ```

---

## Admin Management & Settings APIs

*(All endpoints in this section require Admin role (`requireAdmin`))*

### 1. List Users
- **HTTP Method:** `GET`
- **Endpoint:** `/api/admin/users`
- **Response:** Array of user records including pending approval status.

### 2. Get Admin Server Settings
- **HTTP Method:** `GET`
- **Endpoint:** `/api/admin/settings`
- **Response:** Global system settings (IPTV providers, Debrid API keys, Gemini keys, network folders).

### 3. Update Admin Server Settings
- **HTTP Method:** `PUT`
- **Endpoint:** `/api/admin/settings`
- **Request Body:** System configuration object.

### 4. Fetch Server Logs
- **HTTP Method:** `GET`
- **Endpoint:** `/api/admin/logs`
- **Response:** Server application console logs.

### 5. Test SMTP Email Settings
- **HTTP Method:** `POST`
- **Endpoint:** `/api/admin/test-email`
- **Request Body:** `{ "to": "admin@example.com" }`

### 6. User Account Administration
- `PUT /api/admin/users/:uid/approve` - Approve pending account registration.
- `PUT /api/admin/users/:uid/deny` - Deny registration.
- `PUT /api/admin/users/:uid/lock` - Lock user account.
- `PUT /api/admin/users/:uid/unlock` - Unlock user account.
- `PUT /api/admin/users/:uid/reset-password` - Set new password for user (`{ "newPassword": "..." }`).
- `PUT /api/admin/users/:uid/role` - Update role (`{ "role": "admin" }`).
- `DELETE /api/admin/users/:uid` - Delete user account.
- `POST /api/admin/users` - Create user account directly.

---

## Local Database Cache APIs

Local persistent JSON database storage (handles offline database collections such as `user_progress`, `favorites`, `history`).

### 1. Get Collection Items
- **HTTP Method:** `GET`
- **Endpoint:** `/api/db/get/:collection`
- **Auth:** `requireAuth`
- **Example:** `/api/db/get/user_progress`

### 2. Save Collection Items
- **HTTP Method:** `POST`
- **Endpoint:** `/api/db/post/:collection`
- **Auth:** `requireAuth`
- **Request Body:** Array of collection documents or object updates.

---

## Media Transcoding, Streaming & Player APIs

### 1. Get Media Info (ffprobe)
Extracts container information, video codec, audio tracks, and embedded subtitle streams using `ffprobe`.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/media-info?url=<ENCODED_URL>`
- **Auth:** Public
- **Query Params:**
  - `url` (required): Target media URL or local path.
- **Response Example:**
  ```json
  {
    "format": { "duration": "7200.50", "bit_rate": "8500000" },
    "streams": [
      { "codec_type": "video", "codec_name": "hevc", "width": 3840, "height": 2160 },
      { "codec_type": "audio", "codec_name": "aac", "language": "eng", "index": 1 },
      { "codec_type": "subtitle", "codec_name": "subrip", "language": "eng", "index": 2 }
    ]
  }
  ```

---

### 2. Real-time Transcode Stream (MP4)
Pipes real-time FFmpeg MP4 video transcode output supporting start offsets, audio track selection, and GPU hardware acceleration.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/transcode/stream.mp4`
- **Auth:** Public
- **Query Params:**
  - `url` (required): Target stream or local file path.
  - `start` (optional): Seek offset in seconds (e.g. `start=600`).
  - `hevc` (optional): `true` to force HEVC -> H.264 transcoding.
  - `audio` (optional): Audio track index or ISO language code (`audio=eng` or `audio=1`).
  - `sub` (optional): Subtitle language code (`sub=eng`).
  - `leveling` (optional): `true` to enable dynamic audio volume leveling (`dynaudnorm`).
  - `intel` (optional): `true` to enable Intel GPU hardware acceleration (VAAPI/QSV).
  - `live` (optional): `true` for IPTV live streams.

---

### 3. Get Media Duration
- **HTTP Method:** `GET`
- **Endpoint:** `/api/duration?url=<ENCODED_URL>`
- **Response:** `{ "duration": 7200.5 }`

---

### 4. Transcode Embedded Subtitle to WebVTT
- **HTTP Method:** `GET`
- **Endpoint:** `/api/transcode/subtitle.vtt?url=<URL>&track=<INDEX>&start=<SECONDS>&delay=<OFFSET>`
- **Response:** `text/vtt` WebVTT subtitle file stream.

---

## Subtitles & OpenSubtitles APIs

### 1. Search OpenSubtitles
Search OpenSubtitles.com for subtitles by TMDB ID, title, season, and episode.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/opensubtitles/search`
- **Query Params:**
  - `tmdb_id`: TMDB ID of movie or show.
  - `type`: `movie` or `tv`.
  - `title`: Title string.
  - `season`: Season number.
  - `episode`: Episode number.
- **Response:**
  ```json
  {
    "subtitles": [
      {
        "id": "123456",
        "language": "en",
        "release": "1080p.WEB-DL",
        "url": "https://..."
      }
    ]
  }
  ```

---

### 2. Download OpenSubtitles WebVTT
Downloads and converts an OpenSubtitles subtitle file into WebVTT format with optional timing offset delay.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/opensubtitles/download?url=<ENCODED_SUB_URL>&start=<SECS>&delay=<DELAY_SECS>`
- **Response:** `text/vtt` WebVTT stream.

---

## YouTube & Trailer Streaming APIs

### 1. Extract YouTube Direct Stream URL
Extracts direct playable HLS/MP4 URL from YouTube video or trailer links using `yt-dlp`.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/youtube/stream-url?url=<YOUTUBE_URL>`
- **Response:** `{ "streamUrl": "https://..." }`

---

### 2. Search YouTube
- **HTTP Method:** `GET`
- **Endpoint:** `/api/youtube/search?q=<QUERY>`
- **Response:** `{ "results": [...] }`

---

## Torrent & Debrid (Premiumize) APIs

### 1. Multi-Provider Torrent Search
Scrapes multiple torrent providers (PirateBay, YTS, EZTV, 1337x, LimeTorrents, etc.) with AI filtering.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/torrents/search?title=<TITLE>&type=<movie|series>&season=<S>&episode=<E>`
- **Response:**
  ```json
  {
    "success": true,
    "results": [
      {
        "title": "Movie.Title.2024.1080p.WEB-DL.x264",
        "seeds": 150,
        "peers": 12,
        "size": "2.4 GB",
        "magnet": "magnet:?xt=urn:btih:...",
        "hash": "abcdef1234567890..."
      }
    ]
  }
  ```

---

### 2. Premiumize Instant Cache Check
- **HTTP Method:** `POST`
- **Endpoint:** `/api/premiumize/cache/check`
- **Request Body:** `{ "hashes": ["hash1", "hash2"] }`
- **Response:** `{ "response": [true, false] }`

---

### 3. Premiumize Direct Download Link Generator
- **HTTP Method:** `POST`
- **Endpoint:** `/api/premiumize/transfer/directdl`
- **Request Body:** `{ "src": "magnet:?xt=urn:btih:..." }`
- **Response:** `{ "status": "success", "location": "https://..." }`

---

### 4. Premiumize Cloud Management
- `POST /api/premiumize/transfer/create` - Start cloud download task.
- `POST /api/premiumize/transfer/delete` - Delete transfer (`{ "id": "transfer_id" }`).
- `POST /api/premiumize/transfer/clear-history` - Clear completed transfers.
- `POST /api/premiumize/cloud/search` - Search personal Premiumize cloud files.
- `GET /api/premiumize/file/stream?id=<FILE_ID>` - Stream cloud file.

---

## Image Proxy & Caching API

### Local Persistent Disk Image Proxy
Proxies and caches remote images (posters, backdrops, cast photos) locally on server disk to eliminate CORS issues and network latency.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/image-proxy?url=<IMAGE_URL>`
- **Auth:** Public
- **Headers Returned:** `Cache-Control: public, max-age=31536000, immutable`

---

## IPTV (M3U, EPG & VOD) APIs

### 1. Multi-Provider M3U Playlist Aggregator
Parses and merges M3U playlists across all configured IPTV providers, applying custom channel renames, logos, and backup stream URLs.

- **HTTP Method:** `POST`
- **Endpoint:** `/api/m3u`
- **Request Body (Optional):** `{ "url": "http://provider.com/playlist.m3u" }`
- **Response:**
  ```json
  {
    "items": [
      {
        "id": "ch-101",
        "name": "HBO HD",
        "url": "http://live.stream/101.ts",
        "backupUrls": ["http://backup.stream/101.ts"],
        "group": { "title": "USA Entertainment" }
      }
    ]
  }
  ```

---

### 2. Search IPTV VOD Streams
- **HTTP Method:** `GET`
- **Endpoint:** `/api/iptv/vod/search?title=<TITLE>&type=<movie|series>&season=<S>&episode=<E>`
- **Response:** Array of available VOD streams from Xtream Codes or M3U playlists.

---

### 3. XMLTV EPG Parser
- **HTTP Method:** `POST`
- **Endpoint:** `/api/epg`
- **Request Body (Optional):** `{ "url": "http://provider.com/epg.xml" }`
- **Response:** `{ "channels": [...], "programs": [...] }`

---

## Local & Network Media Library APIs

### 1. Stream Local / Network Share File
Streams local video or SMB/UNC network share file with HTTP Range support (`bytes=N-`).

- **HTTP Method:** `GET`
- **Endpoint:** `/api/local-media/stream?path=<ENCODED_FILE_PATH>`
- **Auth:** Public
- **Headers Supported:** `Range: bytes=start-end`

---

### 2. Search Local Media Folders
- **HTTP Method:** `GET`
- **Endpoint:** `/api/local-media/search?title=<TITLE>&type=<movie|series>&year=<YEAR>`
- **Response:** `{ "success": true, "data": [...] }`

---

### 3. Get Scanned Persistent Library
Retrieves the persistent catalog of local and network shared movies and TV shows.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/local-media/library?rescan=<true|false>`
- **Response:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "local_lib_a1b2c3d4",
        "title": "Inception",
        "year": "2010",
        "type": "movie",
        "poster": "/api/image-proxy?url=...",
        "filePath": "\\\\NAS\\Movies\\Inception (2010)\\Inception.mkv"
      }
    ]
  }
  ```

---

### 4. Get TV Show Seasons & Episodes
Scans TV series directory for seasons and episode files.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/local-media/episodes?folderPath=<DIR_PATH>`
- **Response:** Array of seasons and structured episode list.

---

### 5. Trigger Full Library Folder Scan
- **HTTP Method:** `POST`
- **Endpoint:** `/api/local-media/scan`
- **Request Body:** `{ "folderPath": "\\\\NAS\\Movies", "mediaType": "movie" }`
- **Response:** Summary of discovered movies and TV series counts.

---

### 6. Fix Metadata Match for Local Media Item
- **HTTP Method:** `POST`
- **Endpoint:** `/api/local-media/fix-match`
- **Request Body:**
  ```json
  {
    "id": "local_lib_a1b2c3d4",
    "title": "Interstellar",
    "year": "2014",
    "realTmdbId": 157336,
    "poster": "https://..."
  }
  ```
- **Response:** `{ "success": true, "item": { ... } }`

---

## News & Sports APIs

### 1. Fetch News Headlines
- `GET /api/news/newsapi` - Query headlines from NewsAPI.
- `GET /api/news/gnews` - Query headlines from GNews API.

### 2. Fetch Live Sports Scores
- **HTTP Method:** `GET`
- **Endpoint:** `/api/sports/scores`
- **Response:** Live scores and upcoming game schedules.

### 3. Match Live Sports Event to IPTV Channel
Matches live sports fixture with active IPTV stream channel.

- **HTTP Method:** `POST`
- **Endpoint:** `/api/sports/match-channel`
- **Request Body:** `{ "homeTeam": "Lakers", "awayTeam": "Celtics", "sport": "basketball" }`
- **Response:** `{ "matched": true, "channelUrl": "http://..." }`
