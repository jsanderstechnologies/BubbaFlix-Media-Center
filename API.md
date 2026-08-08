# BubbaFlix Media Center - Backend API Documentation

This document provides exact reference instructions, request body keys, content types, headers, and parameter definitions for all 61 backend REST API endpoints exposed by the BubbaFlix Media Center server (`server.ts`).

---

## Global Request Specifications

### Content-Type
- **JSON Endpoints (`POST`, `PUT`):** `application/json`
- **Streaming Endpoints (`GET`):** `video/mp4`, `text/vtt`, `image/jpeg`, or `application/octet-stream`

### Headers
| Header Name | Type | Required | Description |
|-------------|------|----------|-------------|
| `Content-Type` | `string` | For `POST`/`PUT` | `application/json` |
| `Authorization` | `string` | Required for `requireAuth` & `requireAdmin` | `Bearer <user_token>` (or `Bearer <premiumize_api_key>` for Premiumize proxies) |
| `x-user-uid` | `string` | Optional | User Unique ID |
| `Range` | `string` | Optional for Media Streams | HTTP Range byte request (e.g. `bytes=0-`) |

---

## All Endpoints Quick Reference Index

| # | HTTP Method | Endpoint Path | Auth Level | Expected Content-Type |
|---|-------------|---------------|------------|-----------------------|
| 1 | `GET` | `/api/system/encoder` | Public | `application/json` |
| 2 | `GET` | `/api/auth/setup-status` | Public | `application/json` |
| 3 | `POST` | `/api/auth/setup-init` | Public (First run) | `application/json` |
| 4 | `GET` | `/api/auth/config` | Public | `application/json` |
| 5 | `POST` | `/api/auth/register` | Public | `application/json` |
| 6 | `POST` | `/api/auth/login` | Public | `application/json` |
| 7 | `GET` | `/api/auth/me` | Session Token | `application/json` |
| 8 | `GET` | `/api/user/settings` | `requireAuth` | `application/json` |
| 9 | `PUT` | `/api/user/settings` | `requireAuth` | `application/json` |
| 10 | `GET` | `/api/admin/users` | `requireAdmin` | `application/json` |
| 11 | `GET` | `/api/admin/settings` | `requireAdmin` | `application/json` |
| 12 | `PUT` | `/api/admin/settings` | `requireAdmin` | `application/json` |
| 13 | `GET` | `/api/admin/logs` | `requireAdmin` | `application/json` |
| 14 | `POST` | `/api/admin/test-email` | `requireAdmin` | `application/json` |
| 15 | `POST` | `/api/admin/iptv/ai-dedupe` | `requireAdmin` | `application/json` |
| 16 | `PUT` | `/api/admin/users/:uid/approve` | `requireAdmin` | `application/json` |
| 17 | `PUT` | `/api/admin/users/:uid/deny` | `requireAdmin` | `application/json` |
| 18 | `PUT` | `/api/admin/users/:uid/lock` | `requireAdmin` | `application/json` |
| 19 | `PUT` | `/api/admin/users/:uid/unlock` | `requireAdmin` | `application/json` |
| 20 | `PUT` | `/api/admin/users/:uid/reset-password` | `requireAdmin` | `application/json` |
| 21 | `POST` | `/api/admin/users` | `requireAdmin` | `application/json` |
| 22 | `PUT` | `/api/admin/users/:uid/role` | `requireAdmin` | `application/json` |
| 23 | `DELETE` | `/api/admin/users/:uid` | `requireAdmin` | `application/json` |
| 24 | `GET` | `/api/db/get/:collection` | `requireAuth` | `application/json` |
| 25 | `POST` | `/api/db/post/:collection` | `requireAuth` | `application/json` |
| 26 | `GET` | `/api/media-info` | Public | `application/json` |
| 27 | `GET` | `/api/duration` | Public | `application/json` |
| 28 | `GET` | `/api/transcode/stream.mp4` | Public | `video/mp4` |
| 29 | `GET` | `/api/transcode/subtitle.vtt` | Public | `text/vtt` |
| 30 | `GET` | `/api/music/stream` | Public | `audio/*` / stream |
| 31 | `POST` | `/api/play` | Public | `application/json` |
| 32 | `POST` | `/api/log` | Public | `application/json` |
| 33 | `GET` | `/api/opensubtitles/search` | Public | `application/json` |
| 34 | `GET` | `/api/opensubtitles/download` | Public | `text/vtt` |
| 35 | `GET` | `/api/subtitles` | Public | `text/vtt` / `text/plain` |
| 36 | `GET` | `/api/youtube/search` | Public | `application/json` |
| 37 | `GET` | `/api/youtube/stream-url` | Public | `application/json` |
| 38 | `GET` | `/api/torrents/search` | Public | `application/json` |
| 39 | `POST` | `/api/premiumize/cache/check` | Public | `application/json` |
| 40 | `POST` | `/api/premiumize/transfer/directdl` | Public | `application/json` |
| 41 | `POST` | `/api/premiumize/transfer/create` | Public | `application/json` |
| 42 | `POST` | `/api/premiumize/transfer/delete` | Public | `application/json` |
| 43 | `POST` | `/api/premiumize/transfer/clear-history` | Public | `application/json` |
| 44 | `GET` | `/api/premiumize/retention/list` | Public | `application/json` |
| 45 | `POST` | `/api/premiumize/cloud/search` | Public | `application/json` |
| 46 | `GET` | `/api/premiumize/file/stream` | Public | Video redirect / stream |
| 47 | `GET` | `/api/image-proxy` | Public | `image/jpeg` / `image/*` |
| 48 | `GET` | `/api/tvdb/season` | Public | `application/json` |
| 49 | `GET` | `/api/iptv/vod/search` | Public | `application/json` |
| 50 | `POST` | `/api/m3u` | Public | `application/json` |
| 51 | `POST` | `/api/epg` | Public | `application/json` |
| 52 | `GET` | `/api/local-media/stream` | Public | Video / Range Stream |
| 53 | `GET` | `/api/local-media/search` | Public | `application/json` |
| 54 | `GET` | `/api/local-media/library` | Public | `application/json` |
| 55 | `GET` | `/api/local-media/episodes` | Public | `application/json` |
| 56 | `POST` | `/api/local-media/fix-match` | Public | `application/json` |
| 57 | `POST` | `/api/local-media/scan` | Public | `application/json` |
| 58 | `GET` | `/api/news/newsapi` | Public | `application/json` |
| 59 | `GET` | `/api/news/gnews` | Public | `application/json` |
| 60 | `GET` | `/api/sports/scores` | Public | `application/json` |
| 61 | `POST` | `/api/sports/match-channel` | Public | `application/json` |

---

## Detailed Request Specifications (Body Keys, Headers & Query Parameters)

### 1. `POST /api/auth/setup-init`
- **Content-Type:** `application/json`
- **Headers:** None
- **JSON Request Body Keys:**
  - `email` (string, **required**): Admin email address.
  - `username` (string, **required**): Admin username.
  - `password` (string, **required**): Admin password (min 12 chars, upper, lower, number, special char).
  - `tmdbKey` (string, optional): TMDB API key.
  - `geminiApiKey` (string, optional): Google Gemini AI API key.

---

### 2. `POST /api/auth/register`
- **Content-Type:** `application/json`
- **Headers:** None
- **JSON Request Body Keys:**
  - `email` (string, **required**): User email address.
  - `username` (string, **required**): Desired username.

---

### 3. `POST /api/auth/login`
- **Content-Type:** `application/json`
- **Headers:** None
- **JSON Request Body Keys:**
  - `email` (string, **required**): User email or username.
  - `password` (string, **required**): User password.

---

### 4. `GET /api/auth/me`
- **Headers:** `Authorization: Bearer <token>` (**required**)

---

### 5. `GET /api/user/settings`
- **Headers:** `Authorization: Bearer <token>` (**required**)

---

### 6. `PUT /api/user/settings`
- **Content-Type:** `application/json`
- **Headers:** `Authorization: Bearer <token>` (**required**)
- **JSON Request Body Keys:**
  - `audioLanguage` (string, optional): Preferred audio language (e.g. `"eng"`).
  - `ccLanguage` (string, optional): Preferred subtitle language (e.g. `"eng"`).
  - `autoCC` (boolean, optional): Enable automatic closed captioning.
  - `playerPath` (string, optional): Player engine (`"builtin"`, `"exoplayer"`, etc.).

---

### 7. `PUT /api/admin/settings`
- **Content-Type:** `application/json`
- **Headers:** `Authorization: Bearer <token>` (**required**, Admin role)
- **JSON Request Body Keys:**
  - `email` (object, optional): `{ "gmailUser": "...", "gmailAppPassword": "...", "appName": "...", "appUrl": "..." }`
  - `usenetHost` (string, optional): Usenet server hostname.
  - `usenetPort` (string/number, optional): Usenet port.
  - `usenetUsername` (string, optional): Usenet username.
  - `usenetPassword` (string, optional): Usenet password.
  - `geminiApiKey` (string, optional): Gemini AI API key.
  - `groqApiKey` (string, optional): Groq API key.
  - `openRouterApiKey` (string, optional): OpenRouter API key.
  - `disableLogin` (boolean, optional): Disable authentication enforcement.
  - `enableUsenetSearch` (boolean, optional): Enable/disable Usenet search.
  - `enableTorrentSearch` (boolean, optional): Enable/disable Torrent search.
  - `intelTranscoding` (boolean, optional): Enable Intel QSV hardware transcode.
  - `preferHEVC` (boolean, optional): Enable HEVC stream preference.
  - `hevcMode` (string, optional): `"prefer"`, `"allow"`, or `"exclude"`.
  - `filterAnime` (boolean, optional): Filter out anime content.

---

### 8. `POST /api/admin/test-email`
- **Content-Type:** `application/json`
- **Headers:** `Authorization: Bearer <token>` (**required**, Admin role)
- **Body Keys:** None required (sends test email to logged-in admin).

---

### 9. `PUT /api/admin/users/:uid/reset-password`
- **Headers:** `Authorization: Bearer <token>` (**required**, Admin role)
- **URL Parameter:** `:uid` (User Unique Identifier)

---

### 10. `POST /api/admin/users`
- **Content-Type:** `application/json`
- **Headers:** `Authorization: Bearer <token>` (**required**, Admin role)
- **JSON Request Body Keys:**
  - `email` (string, **required**): New user's email.
  - `username` (string, **required**): New user's username.
  - `password` (string, optional): Manual password (if `emailPassword` is false).
  - `role` (string, optional): `"user"` or `"admin"`.
  - `emailPassword` (boolean, optional): `true` to auto-generate and email password.

---

### 11. `PUT /api/admin/users/:uid/role`
- **Content-Type:** `application/json`
- **Headers:** `Authorization: Bearer <token>` (**required**, Admin role)
- **JSON Request Body Keys:**
  - `role` (string, **required**): `"admin"` or `"user"`.

---

### 12. `POST /api/db/post/:collection`
- **Content-Type:** `application/json`
- **Headers:** `Authorization: Bearer <token>` (**required**)
- **URL Parameter:** `:collection` (e.g. `user_progress`, `favorites`)
- **JSON Request Body:** Object or Array of collection items.

---

### 13. `GET /api/media-info`
- **Query Parameters:**
  - `url` (string, **required**): Encoded stream URL or local file path.

---

### 14. `GET /api/transcode/stream.mp4`
- **Headers:** `Range: bytes=start-end` (optional)
- **Query Parameters:**
  - `url` (string, **required**): Stream or file path to transcode.
  - `start` (number, optional): Start seek offset in seconds (e.g. `start=600`).
  - `hevc` (boolean, optional): `true` to force HEVC -> H.264 transcode.
  - `audio` (string/number, optional): Audio track index or ISO language code (`"eng"` or `1`).
  - `sub` (string, optional): Subtitle language code (`"eng"`).
  - `intel` (boolean, optional): `true` to enable Intel GPU acceleration.
  - `leveling` (boolean, optional): `true` for audio volume normalization.
  - `live` (boolean, optional): `true` for IPTV live streams.

---

### 15. `GET /api/transcode/subtitle.vtt`
- **Query Parameters:**
  - `url` (string, **required**): Stream URL or file path.
  - `track` (number, **required**): Subtitle stream index.
  - `start` (number, optional): Start offset in seconds.
  - `delay` (number, optional): Subtitle timing offset delay in seconds.

---

### 16. `GET /api/opensubtitles/search`
- **Query Parameters:**
  - `tmdb_id` (string/number, optional): TMDB ID.
  - `title` (string, optional): Movie or show title.
  - `type` (string, optional): `"movie"` or `"tv"`.
  - `season` (number, optional): Season number.
  - `episode` (number, optional): Episode number.

---

### 17. `GET /api/opensubtitles/download`
- **Query Parameters:**
  - `url` (string, **required**): OpenSubtitles file download URL.
  - `start` (number, optional): Start offset.
  - `delay` (number, optional): Delay timing in seconds.

---

### 18. `GET /api/youtube/stream-url`
- **Query Parameters:**
  - `url` (string, **required**): Full YouTube video URL.

---

### 19. `GET /api/youtube/search`
- **Query Parameters:**
  - `q` (string, **required**): Search query term.

---

### 20. `GET /api/torrents/search`
- **Query Parameters:**
  - `q` (string, **required**): Torrent search title query.
  - `imdbId` (string, optional): IMDB ID (e.g. `"tt1234567"`).
  - `category` (string, optional): Set to `"music"` for audio releases.

---

### 21. `POST /api/premiumize/cache/check`
- **Content-Type:** `application/json`
- **Headers:** `Authorization: Bearer <pm_api_key>` (optional if saved in settings)
- **JSON Request Body Keys:**
  - `hashes` (array of strings, **required**): List of torrent infohashes (`["hash1", "hash2"]`).

---

### 22. `POST /api/premiumize/transfer/directdl`
- **Content-Type:** `application/json`
- **Headers:** `Authorization: Bearer <pm_api_key>` (optional if saved in settings)
- **JSON Request Body Keys:**
  - `magnet` (string, **required**): Torrent magnet link (`"magnet:?xt=urn:btih:..."`).

---

### 23. `POST /api/premiumize/transfer/create`
- **Content-Type:** `application/json`
- **Headers:** `Authorization: Bearer <pm_api_key>` (optional if saved in settings)
- **JSON Request Body Keys:**
  - `magnet` or `src` (string, **required**): Magnet link or source URL.

---

### 24. `POST /api/premiumize/transfer/delete`
- **Content-Type:** `application/json`
- **Headers:** `Authorization: Bearer <pm_api_key>` (optional if saved in settings)
- **JSON Request Body Keys:**
  - `id` (string, **required**): Premiumize transfer task ID.

---

### 25. `POST /api/premiumize/cloud/search`
- **Content-Type:** `application/json`
- **Headers:** `Authorization: Bearer <pm_api_key>` (optional if saved in settings)
- **JSON Request Body Keys:**
  - `title` (string, **required**): Media title to match in cloud storage.
  - `year` (string/number, optional): Release year.
  - `season` (number, optional): Season number.
  - `episode` (number, optional): Episode number.

---

### 26. `GET /api/premiumize/file/stream`
- **Headers:** `Authorization: Bearer <pm_api_key>` (optional if saved in settings)
- **Query Parameters:**
  - `file_id` (string, **required**): Premiumize cloud file ID.

---

### 27. `GET /api/image-proxy`
- **Query Parameters:**
  - `url` (string, **required**): Source image URL to cache and proxy.

---

### 28. `GET /api/tvdb/season`
- **Query Parameters:**
  - `seriesId` (string/number, **required**): TVDB Series ID.
  - `season` (number, optional): Season number (defaults to `1`).
  - `apiKey` (string, optional): TVDB v4 API key (defaults to server setting).

---

### 29. `GET /api/iptv/vod/search`
- **Query Parameters:**
  - `title` (string, **required**): Movie or show title.
  - `type` (string, optional): `"series"` or `"movie"`.
  - `season` (number, optional): Season number.
  - `episode` (number, optional): Episode number.

---

### 30. `POST /api/m3u`
- **Content-Type:** `application/json`
- **JSON Request Body Keys:**
  - `url` (string, optional): Specific M3U playlist URL (if not using server settings).

---

### 31. `POST /api/epg`
- **Content-Type:** `application/json`
- **JSON Request Body Keys:**
  - `url` (string, optional): Specific XMLTV EPG URL (if not using server settings).

---

### 32. `GET /api/local-media/stream`
- **Headers:** `Range: bytes=start-end` (optional)
- **Query Parameters:**
  - `path` (string, **required**): Local file path or UNC share path (`"\\\\NAS\\Movies\\movie.mkv"`).

---

### 33. `GET /api/local-media/search`
- **Query Parameters:**
  - `title` (string, **required**): Target media title.
  - `type` (string, optional): `"movie"` or `"series"`.
  - `year` (string/number, optional): Target release year.
  - `season` (number, optional): Season number.
  - `episode` (number, optional): Episode number.

---

### 34. `GET /api/local-media/library`
- **Query Parameters:**
  - `rescan` (boolean, optional): Set to `true` to force a catalog rescan.

---

### 35. `GET /api/local-media/episodes`
- **Query Parameters:**
  - `folderPath` (string, optional): TV show directory path.
  - `filePath` (string, optional): Sample episode file path.

---

### 36. `POST /api/local-media/fix-match`
- **Content-Type:** `application/json`
- **JSON Request Body Keys:**
  - `title` (string, **required**): Corrected media title.
  - `id` (string, optional): Local library item ID.
  - `filePath` (string, optional): Local file path.
  - `streamUrl` (string, optional): Stream URL.
  - `year` (string/number, optional): Corrected year.
  - `poster` (string, optional): Corrected poster URL.
  - `overview` (string, optional): Corrected overview text.
  - `rating` (string/number, optional): Corrected rating.
  - `type` (string, optional): `"movie"` or `"series"`.
  - `realTmdbId` (number, optional): Corrected TMDB ID.

---

### 37. `POST /api/local-media/scan`
- **Content-Type:** `application/json`
- **JSON Request Body Keys:**
  - `folderPath` (string, optional): Local folder or UNC network share path.
  - `mediaType` (string, optional): `"movie"` or `"series"`.

---

### 38. `POST /api/play`
- **Content-Type:** `application/json`
- **JSON Request Body Keys:**
  - `url` (string, **required**): Media stream URL to send to player IPC bridge.

---

### 39. `POST /api/sports/match-channel`
- **Content-Type:** `application/json`
- **JSON Request Body Keys:**
  - `homeTeam` (string, **required**): Home team name.
  - `awayTeam` (string, **required**): Away team name.
  - `sport` (string, optional): Sport category (e.g. `"basketball"`, `"football"`).

---

### 40. `POST /api/log`
- **Content-Type:** `application/json`
- **JSON Request Body:** Error payload or console log message.
