# BubbaFlix Media Center - Backend API Documentation

This document provides complete reference instructions and full endpoint specifications for all backend REST API endpoints exposed by the BubbaFlix Media Center server (`server.ts`).

---

## All Endpoints Quick Reference Index

| # | HTTP Method | Endpoint Path | Auth Required | Description |
|---|-------------|---------------|---------------|-------------|
| 1 | `GET` | `/api/system/encoder` | Public | Check available server GPU hardware video encoders |
| 2 | `GET` | `/api/auth/setup-status` | Public | Check if first-time administrator setup is completed |
| 3 | `POST` | `/api/auth/setup-init` | Public (First run) | Initialize first admin user account during setup wizard |
| 4 | `GET` | `/api/auth/config` | Public | Get public authentication configuration and status |
| 5 | `POST` | `/api/auth/register` | Public | Register new user account |
| 6 | `POST` | `/api/auth/login` | Public | Authenticate user and receive session token |
| 7 | `GET` | `/api/auth/me` | Session Token | Fetch current logged-in user session |
| 8 | `GET` | `/api/user/settings` | `requireAuth` | Retrieve user preferences |
| 9 | `PUT` | `/api/user/settings` | `requireAuth` | Update user preferences |
| 10 | `GET` | `/api/admin/users` | `requireAdmin` | List all registered users and approval status |
| 11 | `GET` | `/api/admin/settings` | `requireAdmin` | Fetch server-wide system configuration settings |
| 12 | `PUT` | `/api/admin/settings` | `requireAdmin` | Update server-wide system configuration settings |
| 13 | `GET` | `/api/admin/logs` | `requireAdmin` | Retrieve server application console logs |
| 14 | `POST` | `/api/admin/test-email` | `requireAdmin` | Test SMTP email configuration |
| 15 | `POST` | `/api/admin/iptv/ai-dedupe` | `requireAdmin` | AI (Gemini) channel deduplication for IPTV |
| 16 | `PUT` | `/api/admin/users/:uid/approve` | `requireAdmin` | Approve pending user registration |
| 17 | `PUT` | `/api/admin/users/:uid/deny` | `requireAdmin` | Deny pending user registration |
| 18 | `PUT` | `/api/admin/users/:uid/lock` | `requireAdmin` | Lock/suspend user account |
| 19 | `PUT` | `/api/admin/users/:uid/unlock` | `requireAdmin` | Unlock user account |
| 20 | `PUT` | `/api/admin/users/:uid/reset-password` | `requireAdmin` | Reset user password |
| 21 | `POST` | `/api/admin/users` | `requireAdmin` | Create new user account directly |
| 22 | `PUT` | `/api/admin/users/:uid/role` | `requireAdmin` | Change user role (admin/user) |
| 23 | `DELETE` | `/api/admin/users/:uid` | `requireAdmin` | Delete user account |
| 24 | `GET` | `/api/db/get/:collection` | `requireAuth` | Query items from local JSON database cache |
| 25 | `POST` | `/api/db/post/:collection` | `requireAuth` | Save/update items in local JSON database cache |
| 26 | `GET` | `/api/media-info` | Public | Analyze video/audio streams with `ffprobe` |
| 27 | `GET` | `/api/duration` | Public | Get media duration in seconds |
| 28 | `GET` | `/api/transcode/stream.mp4` | Public | Real-time FFmpeg MP4 transcoding stream |
| 29 | `GET` | `/api/transcode/subtitle.vtt` | Public | Transcode embedded subtitle track to WebVTT |
| 30 | `GET` | `/api/music/stream` | Public | Proxy audio stream for music playback |
| 31 | `POST` | `/api/play` | Public | Trigger external IPC player launch |
| 32 | `POST` | `/api/log` | Public | Client error logging endpoint |
| 33 | `GET` | `/api/opensubtitles/search` | Public | Search OpenSubtitles.com by TMDB ID or title |
| 34 | `GET` | `/api/opensubtitles/download` | Public | Download & convert OpenSubtitles file to WebVTT |
| 35 | `GET` | `/api/subtitles` | Public | Proxy raw subtitle files |
| 36 | `GET` | `/api/youtube/search` | Public | Search YouTube videos & trailers using `yt-dlp` |
| 37 | `GET` | `/api/youtube/stream-url` | Public | Extract direct HLS/MP4 stream URL from YouTube |
| 38 | `GET` | `/api/torrents/search` | Public | Multi-provider torrent search scraper |
| 39 | `POST` | `/api/premiumize/cache/check` | Public | Check instant torrent hash caching on Premiumize |
| 40 | `POST` | `/api/premiumize/transfer/directdl` | Public | Generate direct download link for magnet link |
| 41 | `POST` | `/api/premiumize/transfer/create` | Public | Create cloud download task on Premiumize |
| 42 | `POST` | `/api/premiumize/transfer/delete` | Public | Delete cloud transfer on Premiumize |
| 43 | `POST` | `/api/premiumize/transfer/clear-history` | Public | Clear completed transfer history on Premiumize |
| 44 | `GET` | `/api/premiumize/retention/list` | Public | Get account storage retention list |
| 45 | `POST` | `/api/premiumize/cloud/search` | Public | Search files in personal Premiumize cloud storage |
| 46 | `GET` | `/api/premiumize/file/stream` | Public | Stream file from Premiumize cloud storage |
| 47 | `GET` | `/api/image-proxy` | Public | Local persistent disk image proxy & cache |
| 48 | `GET` | `/api/tvdb/season` | Public | Fetch TVDB v4 season episode list |
| 49 | `GET` | `/api/iptv/vod/search` | Public | Search IPTV provider (Xtream/M3U) for VOD media |
| 50 | `POST` | `/api/m3u` | Public | Parse and aggregate multi-provider M3U playlists |
| 51 | `POST` | `/api/epg` | Public | Parse XMLTV EPG guide program data |
| 52 | `GET` | `/api/local-media/stream` | Public | Stream local/network media file with Range support |
| 53 | `GET` | `/api/local-media/search` | Public | Search local & SMB network folders for media |
| 54 | `GET` | `/api/local-media/library` | Public | Retrieve persistent scanned local media library |
| 55 | `GET` | `/api/local-media/episodes` | Public | Scan TV series folder for seasons & episode files |
| 56 | `POST` | `/api/local-media/fix-match` | Public | Manually fix/override metadata for local library item |
| 57 | `POST` | `/api/local-media/scan` | Public | Trigger manual full scan of local & network shares |
| 58 | `GET` | `/api/news/newsapi` | Public | Fetch headlines from NewsAPI |
| 59 | `GET` | `/api/news/gnews` | Public | Fetch headlines from GNews API |
| 60 | `GET` | `/api/sports/scores` | Public | Fetch live sports scores & match schedules |
| 61 | `POST` | `/api/sports/match-channel` | Public | Match sports event to active IPTV stream channel |

---

## Detailed Endpoint Specifications & Usage Instructions

### Overview & Authentication

- **Default Base URL:** `http://localhost:5150` (or `http://<SERVER_IP>:5150`)
- **Content-Type:** `application/json` (unless streaming video/images/binary)

#### Authentication Headers
For endpoints requiring authentication (`requireAuth` or `requireAdmin`), include headers:

```http
Authorization: Bearer <sessionToken>
x-user-uid: <user_uid>
```

---

## System & Setup APIs

### 1. `GET /api/system/encoder`
Detects available GPU hardware video encoders (NVENC, QSV, VAAPI, AMF, VideoToolbox, or Software libx264).
- **Auth:** Public
- **Response:**
  ```json
  { "encoder": "h264_nvenc", "description": "NVIDIA NVENC (GPU)" }
  ```

### 2. `GET /api/auth/setup-status`
Checks if setup wizard is required.
- **Auth:** Public
- **Response:** `{ "isFirstUser": true }`

### 3. `POST /api/auth/setup-init`
Initializes initial admin account.
- **Auth:** Public (First time only)
- **Body:** `{ "username": "admin", "password": "SecretPassword123", "email": "admin@example.com" }`

---

## Authentication & User Management APIs

### 4. `GET /api/auth/config`
Returns public server auth configuration flags.

### 5. `POST /api/auth/register`
User registration endpoint.
- **Body:** `{ "username": "user1", "password": "Pass123!", "email": "user@example.com" }`

### 6. `POST /api/auth/login`
Authenticates credentials and returns user token.
- **Body:** `{ "username": "user1", "password": "Pass123!" }`
- **Response:** `{ "success": true, "token": "tok_123", "user": { ... } }`

### 7. `GET /api/auth/me`
Fetch currently logged in user profile.

### 8. `GET /api/user/settings`
Retrieve user preferences (`audioLanguage`, `ccLanguage`, `autoCC`, `playerPath`).

### 9. `PUT /api/user/settings`
Update user preferences.

---

## Admin Management & Settings APIs

*(Requires `requireAdmin`)*

### 10. `GET /api/admin/users` - List all users and pending approvals
### 11. `GET /api/admin/settings` - Fetch server settings (providers, API keys, shares)
### 12. `PUT /api/admin/settings` - Update server configuration
### 13. `GET /api/admin/logs` - Retrieve server console logs
### 14. `POST /api/admin/test-email` - Send test email (`{ "to": "..." }`)
### 15. `POST /api/admin/iptv/ai-dedupe` - Gemini AI deduplication for IPTV channels
### 16-23. User Account Actions:
- `PUT /api/admin/users/:uid/approve` - Approve registration
- `PUT /api/admin/users/:uid/deny` - Deny registration
- `PUT /api/admin/users/:uid/lock` - Lock user account
- `PUT /api/admin/users/:uid/unlock` - Unlock user account
- `PUT /api/admin/users/:uid/reset-password` - Reset password (`{ "newPassword": "..." }`)
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:uid/role` - Update role (`{ "role": "admin" }`)
- `DELETE /api/admin/users/:uid` - Delete user account

---

## Local Database Cache APIs

### 24. `GET /api/db/get/:collection`
Query items from local JSON database collections (`user_progress`, `favorites`, `history`).

### 25. `POST /api/db/post/:collection`
Save/update items in local JSON database collections.

---

## Media Transcoding, Streaming & Player APIs

### 26. `GET /api/media-info?url=<URL>`
Analyze video/audio container, resolution, bitrate, audio tracks, and subtitle streams using `ffprobe`.

### 27. `GET /api/duration?url=<URL>`
Fetch media duration in seconds.

### 28. `GET /api/transcode/stream.mp4`
Real-time FFmpeg MP4 video transcode stream supporting `-ss` start offset, HEVC conversion, hardware acceleration, audio track selection, and volume normalization.
- **Params:** `url`, `start` (seek seconds), `hevc` (true/false), `audio` (track index/lang), `sub` (lang), `intel` (VAAPI/QSV), `leveling` (true/false).

### 29. `GET /api/transcode/subtitle.vtt`
Extract and transcode embedded container subtitle track to WebVTT format.
- **Params:** `url`, `track` (stream index), `start` (seconds), `delay` (offset).

### 30. `GET /api/music/stream?url=<URL>`
Proxy audio stream for music playback.

### 31. `POST /api/play`
Trigger external IPC player launch.

### 32. `POST /api/log`
Client error logging endpoint.

---

## Subtitles & OpenSubtitles APIs

### 33. `GET /api/opensubtitles/search`
Search OpenSubtitles.com by TMDB ID, title, season, and episode.
- **Params:** `tmdb_id`, `type` (`movie` or `tv`), `title`, `season`, `episode`.

### 34. `GET /api/opensubtitles/download`
Download and convert OpenSubtitles file to WebVTT format with optional timing offset delay.

### 35. `GET /api/subtitles`
Proxy subtitle file directly.

---

## YouTube & Trailer Streaming APIs

### 36. `GET /api/youtube/search?q=<QUERY>`
Search YouTube videos and trailers via `yt-dlp`.

### 37. `GET /api/youtube/stream-url?url=<YOUTUBE_URL>`
Extract direct playable HLS/MP4 stream URL from YouTube video.

---

## Torrent & Debrid (Premiumize) APIs

### 38. `GET /api/torrents/search?title=<TITLE>&type=<movie|series>&season=<S>&episode=<E>`
Scrape multi-provider torrent sources (PirateBay, YTS, EZTV, 1337x, LimeTorrents) with AI filtering.

### 39. `POST /api/premiumize/cache/check`
Check instant torrent hash caching on Premiumize (`{ "hashes": [...] }`).

### 40. `POST /api/premiumize/transfer/directdl`
Generate direct download link for magnet link (`{ "src": "magnet:?..." }`).

### 41. `POST /api/premiumize/transfer/create`
Create cloud transfer task on Premiumize.

### 42. `POST /api/premiumize/transfer/delete`
Delete cloud transfer on Premiumize (`{ "id": "transfer_id" }`).

### 43. `POST /api/premiumize/transfer/clear-history`
Clear completed transfer history on Premiumize.

### 44. `GET /api/premiumize/retention/list`
Get account retention list.

### 45. `POST /api/premiumize/cloud/search`
Search files in personal Premiumize cloud storage.

### 46. `GET /api/premiumize/file/stream?id=<FILE_ID>`
Stream file directly from Premiumize cloud storage.

---

## Image Proxy & Caching API

### 47. `GET /api/image-proxy?url=<IMAGE_URL>`
Proxies and caches remote images (posters, backdrops, cast photos) locally on server disk to eliminate CORS issues and network latency. Returned with 1-year browser cache headers.

---

## IPTV (M3U, EPG & VOD) APIs

### 48. `GET /api/tvdb/season?seriesId=<ID>&season=<N>`
Fetch TVDB v4 season episode list.

### 49. `GET /api/iptv/vod/search?title=<TITLE>&type=<movie|series>&season=<S>&episode=<E>`
Search IPTV provider (Xtream Codes API / M3U playlist) for VOD movie and show streams.

### 50. `POST /api/m3u`
Parse and aggregate multi-provider M3U playlists with custom channel renames, logos, and backup stream URLs.

### 51. `POST /api/epg`
Parse XMLTV EPG program guide data across configured IPTV providers.

---

## Local & Network Media Library APIs

### 52. `GET /api/local-media/stream?path=<ENCODED_FILE_PATH>`
Stream local video file or SMB/UNC network share file with HTTP Range (`bytes=N-`) support.

### 53. `GET /api/local-media/search?title=<TITLE>&type=<movie|series>&year=<YEAR>`
Search local folders and SMB network shares for matching movie or episode files.

### 54. `GET /api/local-media/library?rescan=<true|false>`
Retrieve persistent scanned local media library catalog with TMDB posters and metadata.

### 55. `GET /api/local-media/episodes?folderPath=<DIR_PATH>`
Scan TV show directory for seasons and episode files.

### 56. `POST /api/local-media/fix-match`
Manually override title, TMDB ID, poster, or metadata for a local library item.

### 57. `POST /api/local-media/scan`
Trigger manual full background scan of configured local folders and network shares.

---

## News & Sports APIs

### 58. `GET /api/news/newsapi`
Query news headlines from NewsAPI.

### 59. `GET /api/news/gnews`
Query news headlines from GNews API.

### 60. `GET /api/sports/scores`
Fetch live sports scores & match schedules (ESPN / Sports API).

### 61. `POST /api/sports/match-channel`
Match live sports fixture with active IPTV stream channel (`{ "homeTeam": "Lakers", "awayTeam": "Celtics", "sport": "basketball" }`).
