# BubbaFlix Media Center - Complete Backend API Reference

This document contains complete documentation, exact request body schemas, content types, headers, query parameters, and example JSON responses for all 63 REST API endpoints exposed by the BubbaFlix Media Center server (`server.ts`).

---

## Global Request Specifications

### Content-Type
- **JSON APIs (`POST`, `PUT`):** `application/json`
- **Media Streaming APIs (`GET`):** `video/mp4`, `text/vtt`, `image/jpeg`, `audio/*`, or `application/octet-stream`

### Authentication Headers
For endpoints requiring authentication (`requireAuth` or `requireAdmin`), pass the user token or admin credentials in HTTP headers:

```http
Authorization: Bearer <session_token>
x-user-uid: <user_uid>
```

For Premiumize Debrid endpoints, you can optionally pass your API key directly:
```http
Authorization: Bearer <premiumize_api_key>
```

---

## All 63 Endpoints Quick Reference Index

| # | HTTP Method | Endpoint Path | Auth Required | Expected Content-Type | Summary Description |
|---|-------------|---------------|---------------|-----------------------|---------------------|
| 1 | `GET` | `/api/system/encoder` | Public | `application/json` | Detect available GPU hardware video encoders |
| 2 | `GET` | `/api/auth/setup-status` | Public | `application/json` | Check if first-time setup is completed |
| 3 | `POST` | `/api/auth/setup-init` | Public (First run) | `application/json` | Create initial administrator user account |
| 4 | `GET` | `/api/auth/config` | Public | `application/json` | Get public auth and server integration status |
| 5 | `POST` | `/api/auth/register` | Public | `application/json` | Register new user account |
| 6 | `POST` | `/api/auth/login` | Public | `application/json` | Authenticate user credentials and receive token |
| 7 | `GET` | `/api/auth/me` | Session Token | `application/json` | Retrieve current authenticated user profile |
| 8 | `GET` | `/api/user/settings` | `requireAuth` | `application/json` | Retrieve user preferences |
| 9 | `PUT` | `/api/user/settings` | `requireAuth` | `application/json` | Update user preferences |
| 10 | `GET` | `/api/admin/users` | `requireAdmin` | `application/json` | List all registered users and approval status |
| 11 | `GET` | `/api/admin/settings` | `requireAdmin` | `application/json` | Fetch server system configuration |
| 12 | `PUT` | `/api/admin/settings` | `requireAdmin` | `application/json` | Update server system configuration |
| 13 | `GET` | `/api/admin/logs` | `requireAdmin` | `application/json` | Fetch server console logs |
| 14 | `POST` | `/api/admin/test-email` | `requireAdmin` | `application/json` | Send test email using configured SMTP settings |
| 15 | `POST` | `/api/admin/iptv/ai-dedupe` | `requireAdmin` | `application/json` | Deduplicate IPTV channels using Gemini AI |
| 16 | `PUT` | `/api/admin/users/:uid/approve` | `requireAdmin` | `application/json` | Approve pending user registration |
| 17 | `PUT` | `/api/admin/users/:uid/deny` | `requireAdmin` | `application/json` | Deny pending user registration |
| 18 | `PUT` | `/api/admin/users/:uid/lock` | `requireAdmin` | `application/json` | Lock user account |
| 19 | `PUT` | `/api/admin/users/:uid/unlock` | `requireAdmin` | `application/json` | Unlock user account |
| 20 | `PUT` | `/api/admin/users/:uid/reset-password` | `requireAdmin` | `application/json` | Reset user password |
| 21 | `POST` | `/api/admin/users` | `requireAdmin` | `application/json` | Create user account directly |
| 22 | `PUT` | `/api/admin/users/:uid/role` | `requireAdmin` | `application/json` | Change user role (`"admin"` or `"user"`) |
| 23 | `PUT` | `/api/admin/users/:uid/permissions` | `requireAdmin` | `application/json` | Grant or restrict navbar section access permissions |
| 24 | `DELETE` | `/api/admin/users/:uid` | `requireAdmin` | `application/json` | Delete user account |
| 25 | `GET` | `/api/skip-segments` | Public | `application/json` | Fetch intro & credit timestamp segments from TheIntroDB |
| 24 | `GET` | `/api/db/get/:collection` | `requireAuth` | `application/json` | Query items from local JSON database cache |
| 25 | `POST` | `/api/db/post/:collection` | `requireAuth` | `application/json` | Insert/update items in local JSON database cache |
| 26 | `GET` | `/api/media-info` | Public | `application/json` | Inspect media container and tracks with `ffprobe` |
| 27 | `GET` | `/api/duration` | Public | `application/json` | Get media duration in seconds |
| 28 | `GET` | `/api/transcode/stream.mp4` | Public | `video/mp4` | Real-time FFmpeg MP4 transcode stream |
| 29 | `GET` | `/api/transcode/subtitle.vtt` | Public | `text/vtt` | Transcode embedded subtitle track to WebVTT |
| 30 | `GET` | `/api/music/stream` | Public | `audio/*` / Stream | Proxy audio stream for music playback |
| 31 | `POST` | `/api/play` | Public | `application/json` | Trigger external IPC player launch |
| 32 | `POST` | `/api/log` | Public | `application/json` | Client error logging endpoint |
| 33 | `GET` | `/api/opensubtitles/search` | Public | `application/json` | Search OpenSubtitles.com by TMDB ID / title |
| 34 | `GET` | `/api/opensubtitles/download` | Public | `text/vtt` | Download & convert OpenSubtitles file to WebVTT |
| 35 | `GET` | `/api/subtitles` | Public | `text/vtt` / `text/plain` | Proxy subtitle files directly |
| 36 | `GET` | `/api/youtube/search` | Public | `application/json` | Search YouTube videos & trailers using `yt-dlp` |
| 37 | `GET` | `/api/youtube/stream-url` | Public | `application/json` | Extract direct HLS/MP4 stream URL from YouTube |
| 38 | `GET` | `/api/torrents/search` | Public | `application/json` | Multi-provider torrent search scraper |
| 39 | `POST` | `/api/premiumize/cache/check` | Public | `application/json` | Check instant torrent hash caching on Premiumize |
| 40 | `POST` | `/api/premiumize/transfer/directdl` | Public | `application/json` | Generate direct download link for magnet link |
| 41 | `POST` | `/api/premiumize/transfer/create` | Public | `application/json` | Create cloud download task on Premiumize |
| 42 | `POST` | `/api/premiumize/transfer/delete` | Public | `application/json` | Delete cloud transfer task on Premiumize |
| 43 | `POST` | `/api/premiumize/transfer/clear-history` | Public | `application/json` | Clear completed transfer history on Premiumize |
| 44 | `GET` | `/api/premiumize/retention/list` | Public | `application/json` | Get 7-day storage retention list |
| 45 | `POST` | `/api/premiumize/cloud/search` | Public | `application/json` | Search files in personal Premiumize cloud storage |
| 46 | `GET` | `/api/premiumize/file/stream` | Public | Stream / Redirect | Stream file directly from Premiumize cloud |
| 47 | `GET` | `/api/image-proxy` | Public | `image/jpeg` | Local persistent disk image proxy & cache |
| 48 | `GET` | `/api/tvdb/season` | Public | `application/json` | Fetch TVDB v4 season episode list |
| 49 | `GET` | `/api/iptv/vod/search` | Public | `application/json` | Search IPTV provider (Xtream/M3U) for VOD media |
| 50 | `POST` | `/api/m3u` | Public | `application/json` | Parse and aggregate multi-provider M3U playlists |
| 51 | `POST` | `/api/epg` | Public | `application/json` | Parse XMLTV EPG program guide data |
| 52 | `GET` | `/api/local-media/stream` | Public | Stream / Range | Stream local/network media file with Range support |
| 53 | `GET` | `/api/local-media/search` | Public | `application/json` | Search local & SMB network shares for media |
| 54 | `GET` | `/api/local-media/library` | Public | `application/json` | Retrieve persistent scanned local media library |
| 55 | `GET` | `/api/local-media/episodes` | Public | `application/json` | Scan TV series folder for seasons & episode files |
| 56 | `POST` | `/api/local-media/fix-match` | Public | `application/json` | Manually fix metadata for local library item |
| 57 | `POST` | `/api/local-media/scan` | Public | `application/json` | Trigger manual full scan of local & network shares |
| 58 | `GET` | `/api/news/newsapi` | Public | `application/json` | Fetch headlines from NewsAPI |
| 59 | `GET` | `/api/news/gnews` | Public | `application/json` | Fetch headlines from GNews API |
| 60 | `GET` | `/api/sports/scores` | Public | `application/json` | Fetch live sports scores & match schedules |
| 61 | `POST` | `/api/sports/match-channel` | Public | `application/json` | Match sports event to active IPTV stream channel |
| 62 | `POST` | `/api/media/save-streams` | Public | `application/json` | Persist discovered stream list per movie/episode to cache |
| 63 | `POST` | `/api/media/cached-streams` | Public | `application/json` | Retrieve saved streams for instant detail screen display |
| 64 | `GET` | `/api/media/cached-metadata` | Public | `application/json` | Retrieve 0ms instant cached metadata, ratings, logos & skip segments |
| 65 | `POST` | `/api/media/prefetch-metadata` | Public | `application/json` | Low-priority background prefetching endpoint |
| 66 | `GET` | `/api/media/chapters` | Public | `application/json` | Extract embedded video chapters via ffprobe / Plex ChapterDB archive |
| 67 | `POST` | `/api/logs/client` | Public | `application/json` | Client-side React & ErrorBoundary diagnostic log reporter |

---

## Detailed Endpoint Specifications & Example Payloads

### 1. System & Authentication Endpoints

#### `GET /api/system/encoder`
- **Description:** Checks server GPU for available hardware video encoders (NVIDIA NVENC, Intel QSV/VAAPI, AMD AMF, Apple VideoToolbox, or Software libx264).
- **Auth:** Public
- **Example Response:**
  ```json
  {
    "encoder": "h264_nvenc"
  }
  ```

#### `GET /api/auth/setup-status`
- **Description:** Returns whether initial admin account creation is required.
- **Auth:** Public
- **Example Response:**
  ```json
  {
    "setupRequired": false
  }
  ```

#### `POST /api/auth/setup-init`
- **Description:** Initializes the primary administrator user during first run.
- **Auth:** Public (First run only)
- **Content-Type:** `application/json`
- **Request Body Keys:**
  ```json
  {
    "email": "admin@example.com",
    "username": "admin",
    "password": "SecretPassword123!",
    "tmdbKey": "optional_tmdb_api_key",
    "geminiApiKey": "optional_gemini_api_key"
  }
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "user": {
      "uid": "6f0a8cc7-c707-485e-af0b-13f7755bb594",
      "email": "admin@example.com",
      "username": "admin",
      "role": "admin",
      "status": "approved"
    },
    "token": "6c4e7f59797ccf520267a8658e0b578886314455546225a70802c6fb07db452a"
  }
  ```

#### `GET /api/auth/config`
- **Description:** Fetches public client integration state (IPTV status, Usenet, HEVC preferences).
- **Auth:** Public
- **Example Response:**
  ```json
  {
    "tmdbKey": "841059f71aab310b4d4c4f3a7e28328e",
    "preferHEVC": true,
    "hevcMode": "prefer",
    "disableLogin": false
  }
  ```

#### `POST /api/auth/register`
- **Description:** Registers a new user account (pending admin approval).
- **Auth:** Public
- **Content-Type:** `application/json`
- **Request Body Keys:**
  ```json
  {
    "email": "user@example.com",
    "username": "johndoe"
  }
  ```
- **Example Response:**
  ```json
  {
    "pending": true,
    "message": "Your account is awaiting admin approval. You will receive your password by email once approved."
  }
  ```

#### `POST /api/auth/login`
- **Description:** Authenticates user and returns session token.
- **Auth:** Public
- **Content-Type:** `application/json`
- **Request Body Keys:**
  ```json
  {
    "email": "johndoe",
    "password": "UserPassword123!"
  }
  ```
- **Example Response:**
  ```json
  {
    "user": {
      "uid": "096f4e53-c2da-4941-b0e2-9e900246a080",
      "email": "user@example.com",
      "username": "johndoe",
      "role": "user",
      "status": "approved"
    },
    "token": "0eba1595050fc60792b0fdd19e33fee99312c91e71170e1469efd96d2a67fa79"
  }
  ```

#### `GET /api/auth/me`
- **Description:** Verifies token and returns current user profile.
- **Auth:** `Authorization: Bearer <token>`
- **Example Response:**
  ```json
  {
    "user": {
      "uid": "096f4e53-c2da-4941-b0e2-9e900246a080",
      "email": "user@example.com",
      "username": "johndoe",
      "role": "user"
    }
  }
  ```

#### `GET /api/user/settings` & `PUT /api/user/settings`
- **Description:** Reads or updates user preferences.
- **Auth:** `requireAuth` (`Authorization: Bearer <token>`)
- **PUT Request Body Keys:**
  ```json
  {
    "audioLanguage": "eng",
    "ccLanguage": "eng",
    "autoCC": true,
    "playerPath": "builtin"
  }
  ```

---

### 2. Admin & System Management Endpoints

#### `GET /api/admin/users`
- **Description:** Lists all registered users and pending registration approvals.
- **Auth:** `requireAdmin` (`Authorization: Bearer <token>`)

#### `GET /api/admin/settings` & `PUT /api/admin/settings`
- **Description:** Manage server-wide integrations (IPTV providers, Debrid, Gemini AI, media folders).
- **Auth:** `requireAdmin`
- **PUT Request Body Keys:**
  ```json
  {
    "geminiApiKey": "AIzaSy...",
    "preferHEVC": true,
    "hevcMode": "prefer",
    "disableLogin": false,
    "email": {
      "gmailUser": "admin@example.com",
      "gmailAppPassword": "app-password-here",
      "appName": "BubbaFlix",
      "appUrl": "https://media.example.com"
    }
  }
  ```

#### `PUT /api/admin/users/:uid/approve`
- **Description:** Approves a pending user account registration, generates a password, and emails credentials to the user.
- **Auth:** `requireAdmin`

#### `PUT /api/admin/users/:uid/deny`, `/lock`, `/unlock`
- **Description:** Update user account status (`status = "denied" | "locked" | "approved"`).

#### `PUT /api/admin/users/:uid/reset-password`
- **Description:** Generates a new random password for user and emails it.

#### `POST /api/admin/users`
- **Description:** Directly creates a user account.
- **Auth:** `requireAdmin`
- **Request Body Keys:**
  ```json
  {
    "email": "newuser@example.com",
    "username": "newuser",
    "password": "OptionalManualPassword",
    "role": "user",
    "emailPassword": true
  }
  ```

#### `PUT /api/admin/users/:uid/permissions`
- **Description:** Updates navbar section access permissions (`tv`, `music`, `weather`, `news`) for a specific user account.
- **Auth:** `requireAdmin` (`Authorization: Bearer <token>`)
- **Content-Type:** `application/json`
- **Request Body Keys:**
  ```json
  {
    "allowedSections": ["tv", "music", "weather", "news"]
  }
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "allowedSections": ["tv", "music", "weather", "news"]
  }
  ```

#### `GET /api/skip-segments`
- **Description:** Queries TheIntroDB (`https://theintrodb.org`) proxy endpoint for intro and end credits timestamp segment markers. If the requested media is not found in TheIntroDB database, automatically triggers the **AI Media Analysis Fallback Engine** (Gemini / Groq / OpenRouter) to evaluate metadata and generate predicted segment timestamps. If `submitTidbSegments` is enabled in Admin Settings, automatically submits the AI-generated timestamp segments back to TheIntroDB repository.
- **Auth:** Public / Optional `x-api-key` or `Authorization: Bearer <tidb_key>`
- **Query Params:**
  - `tmdbId` (number, required): TMDB Media Identifier.
  - `type` (string, optional): `"movie"` or `"tv"`.
  - `season` (number, optional): TV Season number.
  - `episode` (number, optional): TV Episode number.
- **Example Response:**
  ```json
  {
    "success": true,
    "segments": [
      { "type": "intro", "start": 35.5, "end": 110.0, "label": "Skip Intro" },
      { "type": "credits", "start": 2840.0, "end": 3020.0, "label": "Skip Credits" }
    ],
    "isAiGenerated": false
  }
  ```

#### `GET /api/media/cached-metadata`
- **Description:** Returns cached metadata, logos, posters, MPAA ratings, cast, and skip segment data directly from local database (`data/media_cache.json`) with 0ms latency for Stale-While-Revalidate detail screen rendering.
- **Query Parameters:** `tmdbId` (number), `type` (`movie` | `tv`)

#### `POST /api/media/prefetch-metadata`
- **Description:** Bulk prefetch and persistent database caching engine for movie and TV series metadata, posters, backdrops, logos, MPAA ratings, cast/crew, and all-season TheIntroDB v3 skip segments. Stores data in `data/media_cache.json`. Supports `revalidate: true` for online background revalidation.
- **Auth:** Public / Optional `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "tmdbId": 1399,
    "type": "tv",
    "title": "Game of Thrones",
    "revalidate": true
  }
  ```

#### `POST /api/admin/iptv/ai-dedupe`
- **Description:** Uses Gemini AI to deduplicate M3U channel lists.

---

### 3. Local Data Persistence Endpoints

#### `GET /api/db/get/:collection`
- **Description:** Fetches offline collection items for authenticated user.
- **Auth:** `requireAuth`
- **Example collections:** `user_progress`, `favorites`, `history`.

#### `POST /api/db/post/:collection`
- **Description:** Persists offline collection items for authenticated user.
- **Auth:** `requireAuth`
- **Content-Type:** `application/json`
- **Request Body:** Array or Object of collection data documents.

---

### 4. Transcoding, Streaming & Media Inspection

#### `GET /api/media-info`
- **Description:** Runs `ffprobe` on stream URL or file path.
- **Query Params:** `url` (required).
- **Example Response:**
  ```json
  {
    "format": { "duration": "7200.50", "bit_rate": "8500000" },
    "streams": [
      { "codec_type": "video", "codec_name": "hevc", "width": 3840, "height": 2160 },
      { "codec_type": "audio", "codec_name": "aac", "language": "eng", "index": 1 }
    ]
  }
  ```

#### `GET /api/transcode/stream.mp4`
- **Description:** Real-time FFmpeg MP4 video transcoding stream endpoint.
- **Headers:** `Range: bytes=start-end` (optional)
- **Query Params:**
  - `url` (required): Media stream URL or file path.
  - `start` (number, optional): Seek start offset in seconds.
  - `hevc` (boolean, optional): `true` to convert HEVC to H.264.
  - `audio` (string/number, optional): Audio track index or ISO language code (`"eng"`).
  - `sub` (string, optional): Subtitle track language code.
  - `intel` (boolean, optional): `true` to enable Intel GPU acceleration.
  - `leveling` (boolean, optional): `true` to enable dynamic audio volume normalization.

#### `GET /api/transcode/subtitle.vtt`
- **Description:** Transcodes container embedded subtitles to WebVTT.
- **Query Params:** `url` (required), `track` (number, required), `start` (number), `delay` (number).

---

### 5. OpenSubtitles & YouTube Streaming

#### `GET /api/opensubtitles/search`
- **Query Params:** `tmdb_id`, `title`, `type` (`"movie"` or `"tv"`), `season`, `episode`.

#### `GET /api/youtube/stream-url`
- **Query Params:** `url` (YouTube video URL).
- **Example Response:** `{ "streamUrl": "https://rr2---sn-..." }`

---

### 6. Torrent & Debrid (Premiumize) Endpoints

#### `GET /api/torrents/search`
- **Query Params:** `q` (title search term, required), `imdbId` (optional e.g. `"tt1234567"`), `category` (`"music"` for audio releases).

#### `POST /api/premiumize/cache/check`
- **Content-Type:** `application/json`
- **Request Body Keys:**
  ```json
  {
    "hashes": ["infohash_1", "infohash_2"]
  }
  ```
- **Example Response:** `{ "response": [true, false] }`

#### `POST /api/premiumize/transfer/directdl`
- **Content-Type:** `application/json`
- **Request Body Keys:**
  ```json
  {
    "magnet": "magnet:?xt=urn:btih:..."
  }
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "streamUrl": "https://www.premiumize.me/stream/...",
    "filename": "Movie.2024.1080p.mkv",
    "addedToCloud": true
  }
  ```

#### `POST /api/premiumize/cloud/search`
- **Content-Type:** `application/json`
- **Request Body Keys:**
  ```json
  {
    "title": "Inception",
    "year": "2010",
    "season": 1,
    "episode": 1
  }
  ```

---

### 7. Local & Network Media Library Endpoints

#### `GET /api/local-media/stream`
- **Headers:** `Range: bytes=start-end` (optional)
- **Query Params:** `path` (required local path or UNC share `\\\\NAS\\Movies\\film.mkv`).

#### `GET /api/local-media/library`
- **Description:** Fetches scanned local and network share media items.
- **Query Params:** `rescan` (`true` to force full folder rescan).
- **Example Response:**
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

#### `POST /api/local-media/fix-match`
- **Content-Type:** `application/json`
- **Request Body Keys:**
  ```json
  {
    "id": "local_lib_a1b2c3d4",
    "title": "Interstellar",
    "year": "2014",
    "poster": "https://image.tmdb.org/t/p/w500/...",
    "type": "movie",
    "realTmdbId": 157336
  }
  ```

#### `POST /api/local-media/scan`
- **Content-Type:** `application/json`
- **Request Body Keys:**
  ```json
  {
    "folderPath": "\\\\NAS\\Movies",
    "mediaType": "movie"
  }
  ```

#### `POST /api/media/save-streams`
- **Content-Type:** `application/json`
- **Description:** Persists discovered stream sources (torrents, local network shares, IPTV streams) per movie or per TV series season/episode to disk cache (`data/media_cache.json`).
- **Request Body Keys:**
  ```json
  {
    "tmdbId": 157336,
    "type": "movie",
    "season": null,
    "episode": null,
    "streams": [
      {
        "name": "Interstellar 2014 2160p UHD BluRay x265",
        "url": "magnet:?xt=urn:btih:...",
        "quality": "4K",
        "sizeStr": "18.4 GB",
        "seeds": 142,
        "isCached": true,
        "isPremiumize": true
      }
    ]
  }
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "count": 1
  }
  ```

#### `POST /api/media/cached-streams`
- **Content-Type:** `application/json`
- **Description:** Instantly retrieves saved streams (<5ms) for display on media detail screens prior to live indexer completion.
- **Request Body Keys:**
  ```json
  {
    "tmdbId": 157336,
    "type": "movie",
    "season": null,
    "episode": null
  }
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "streams": [
      {
        "name": "Interstellar 2014 2160p UHD BluRay x265",
        "url": "magnet:?xt=urn:btih:...",
        "quality": "4K",
        "sizeStr": "18.4 GB",
        "seeds": 142,
        "isCached": true,
        "isPremiumize": true
      }
    ]
  }
  ```

#### `GET /api/media/cached-metadata`
- **Query Parameters:** `tmdbId` (number/string), `type` (`"movie"` or `"tv"`)
- **Description:** Retrieves cached metadata, logos, MPAA ratings, cast/crew, and skip segments instantly from disk.

#### `POST /api/media/prefetch-metadata`
- **Content-Type:** `application/json`
- **Description:** Executes low-priority background prefetching for media items across grids.
- **Request Body Keys:**
  ```json
  {
    "tmdbId": 157336,
    "type": "movie",
    "title": "Interstellar"
  }
  ```

#### `GET /api/media/chapters`
- **Query Parameters:** `tmdbId` (number/string), `filePath` (string), `title` (string), `year` (string)
- **Description:** Extracts chapters from embedded video container metadata via `ffprobe`, with fallback to the Plex ChapterDB legacy archive.

#### `POST /api/logs/client`
- **Content-Type:** `application/json`
- **Description:** Client-side React diagnostic logger for reporting uncaught exceptions and ErrorBoundary stack traces to server logs (`logs/app.log`).
- **Request Body Keys:**
  ```json
  {
    "level": "error",
    "message": "[ErrorBoundary] ReferenceError: ...",
    "stack": "Error: ...\n  at MediaModal ...",
    "url": "http://localhost:5150"
  }
  ```
