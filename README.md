# <p align="center"><img src="https://raw.githubusercontent.com/jsanderstechnologies/BubbaFlix-Media-Center/main/public/logo.svg?raw=true" width="320" alt="BubbaFlix Logo" /></p>

**BubbaFlix Media Server** is a private, high-performance web-based streaming application and media organizer. It provides user management, content filters, real-time transcoding streams, live TV (M3U/Xtream), sports scoreboards with AI stream matching, local/regional/world news, smart TV D-Pad spatial navigation, and administrative tools built on a premium, responsive dark-mode layout.

---

## 🚀 Key Features

### 🎬 Media Aggregation & Streaming
- **TMDB Integration**: Browse rich metadata for movies and TV shows, complete with cast, crew, trailers, and recommendations.
- **Premiumize & Debrid Streaming**: Search for Torrents, Usenet, and Debrid streams directly through Premiumize and stream them instantly without local downloading.
- **Persistent Stream Caching & Instant Detail Load**: Discovered streams (torrents, network shares, IPTV) are persisted per item to disk cache. Opening any media detail screen loads saved streams **instantly** (<5ms) prior to background indexer completion.
- **Low-Priority Background Prefetching**: Background metadata prefetching runs via `requestIdleCallback` with `priority: 'low'` headers and automatically pauses whenever a detail screen is active to give 100% network bandwidth to user requests.
- **Stream Selection Dropdowns & Air Dates**: Styled `<select>` dropdown controls for Active Downloads & Played Streams and Available High Quality Streams matching Seasons & Episodes dropdown styling.
- **TheIntroDB (TIDB) Intro & Credit Skipping**: Integrated with TheIntroDB (`https://theintrodb.org`) API to retrieve exact timestamp segment data for automatically or manually skipping intros and end credits during playback of movies and TV episodes. Displays active TIDB status badges and branding logos in headers and hero spotlight cards when configured.
- **Self-Healing ErrorBoundary Diagnostics**: Prevents infinite loading screen loops by capping automatic retries and rendering an interactive diagnostic panel with **Retry Loading** and **Reset Cache & Reload** buttons, while reporting stack traces to `/api/logs/client`.
- **Auto-Select Next Unwatched Episode**: Automatically queries per-user watch history and opens show detail screens on the first unwatched season and episode.
- **Per-User Watch History**: Independent per-user watch tracking for movies and TV episodes with manual "Watched / Mark Watched" toggle buttons and automatic 90%+ progress completion marking.
- **HEVC (H.265) Codec & Stream Filtering**: User-configurable HEVC stream handling with 3 distinct modes: `Prioritize HEVC` (sorts 4K/HEVC streams to top), `Allow All Codecs` (mixes H.264 & HEVC), and `Exclude HEVC` (forces H.264 only for older/legacy hardware).
- **TMDB Backdrop Player Background**: Displays the item's TMDB backdrop image as a blurred, atmospheric background overlay with a glowing loader until video frames render.
- **AI-Powered Filtering & Fallback Engine**: Integrated with Google Gemini API, Groq, and OpenRouter for smart filtering with 5-minute 429 rate limit circuit breaking.
- **Hardware-Accelerated Transcoding**: Support for Intel Quick Sync Video (QSV), NVENC, and AMF to transcode media on the fly via FFmpeg with minimal CPU usage.
- **Server Stream Pre-Caching**: Optional background media caching for remote streams (Premiumize, Usenet, Debrid). Pre-downloads video files progressively to local server storage as they are watched, eliminating CDN rate-limiting, network jitter, and providing instant seeking.
- **Premiumize VPN & Debrid Gateway**: Dedicated Premiumize integration panel in Settings for managing credentials, checking account status, and configuring VPN server gateways.
- **Customizable Players**: Native browser playback or automatic spawning of external desktop players like VLC, mpv, or IINA.

### 📺 Live TV (IPTV) & Multi-Provider Architecture
- **Multi-Provider Management**: Add, edit, toggle, and remove multiple IPTV providers (M3U URLs or Xtream Codes servers) in Admin Settings.
- **Interactive EPG Grid**: Scrollable timeline program guide with arrow key support, category filtering, channel row selection, and quick playback.
- **Channel Editor & Visibility Controls**: Comprehensive admin table to edit channel display names, update logos, change categories, and toggle channel visibility (hide/show channels in the IPTV grid).
- **Gemini AI Channel Deduplication**: Runs background/on-demand AI matching across all active providers to group identical channels and automatically designate Primary vs. Backup streams.
- **Automatic Silent Stream Failover**: If a live stream drops or fails during playback, the built-in video player automatically switches to the next backup stream seamlessly without any user intervention.

### 📰 News & Sports Hub
- **Multi-Tab News Engine**: Dedicated News & Sports page with distinct tabs for **Local**, **Regional**, **National**, **World**, **Sports News**, and **Sports Scores**.
- **ZIP Code Geocoding**: Automatically resolves 5-digit US ZIP codes (via Zippopotam.us & Open-Meteo) to exact city/state names for accurate local and regional news feeds.
- **Sports Scoreboards**: Real-time scoreboards powered by ESPN API across **NFL**, **NBA**, **MLB**, **NHL**, **NCAAF**, **NCAAB**, and **Soccer (MLS)**.
- **Gemini AI IPTV Sports Stream Matcher**: Automatically scans all IPTV channels using Gemini AI to match live games to active IPTV broadcast streams and displays a direct **`▶ Watch Live (Channel Name)`** play button on game cards.

### 📺 Smart TV & Android TV Experience
- **D-Pad Spatial Navigation**: Built-in 2D spatial navigation allowing 100% remote control operation across all cards, menus, sidebar tabs, video player controls, modal dialogs, and user avatar settings.
- **Focus Ring Accessibility**: Clear, high-visibility focus indicators designed specifically for 10-foot viewing experiences without poster clipping.

### 👥 User Administration & Section Access Permissions
- **Navbar Section Access Control**: Administrators can grant or restrict user access to individual navbar sections (**Live TV**, **Music**, **Weather**, **News**) directly from the Admin Panel with interactive toggle buttons.
- **Dynamic Navigation Guard**: Restricted sections are automatically hidden from non-admin navbars, and direct navigation attempts automatically redirect to `Home`.
- **Admin Privilege Bypass**: Admin accounts (`role === 'admin'`) automatically retain full unrestricted access across all sections.
- **Multi-Device Token Sessions**: Support for simultaneous device logins without revoking credentials or admin access.
- **Pending Registration Workflow**: New registrations are created without passwords and flagged as `pending` until approved by an administrator.
- **Gmail Welcome Notification**: Upon admin approval, the system auto-generates a secure 12-character password, hashes it using `scrypt`, updates the database, and automatically sends a beautifully formatted email with access credentials to the user.
- **Account Locking**: Administrators can lock or unlock user accounts at any time, instantly revoking access.
- **Auto Admin / Dev Mode**: A handy toggle to completely disable login and boot straight into the administrator dashboard for local development or Android Studio layout inspection.

### ⚙️ Comprehensive Settings Panel
- **Dedicated Alphabetical API Keys Tab**: All 9 API keys (Gemini AI, GNews, Groq AI, NewsAPI, OpenRouter AI, Premiumize, TheIntroDB / TIDB, TMDb, TVDb) are managed in a dedicated top-level **API Keys** tab ordered strictly alphabetically by provider name.
- **Master Intro & Credit Skip Toggle**: Administrators can enable or disable the application-wide Intro & Credit Skip feature directly in Admin Settings, as well as toggle automated AI segment contribution back to TheIntroDB repository.
- **Live API Status Overview**: Displays an interactive API Integrations Status Overview card showing real-time `ACTIVE` / `NO KEY` status indicators across all 9 integrations.
- **User Preferences Access for All Users**: All logged-in users have access to the Settings button in the navbar, presenting non-admin users with strictly their personal **User Preferences** (resolutions, HEVC filtering, audio/CC languages, auto-skipping, and display zoom).
- **Responsive Top-Bar Layout**: Expanded container width (`max-w-7xl`) with responsive flex-wrapping tabs for seamless navigation on TV screens, 4K monitors, tablets, and mobile devices.
- **Email Configuration**: Exposes a dedicated UI to manage and save credentials (Gmail address, App Password, App Name, App URL) to `data/settings.json`, complete with a "Test Email" button.
- **Developer Debugging**: View real-time frontend and backend console logs directly within the browser Settings UI.

---

## 📺 HDMI Kiosk & Standalone TV Server Mode (Plan B)

If your server running Docker/Portainer has an HDMI port connected to a TV, you can transform your server into a dedicated Standalone Media Box controlled with any Bluetooth remote (Google TV, Fire TV, Roku)!

### 1. Pair a Bluetooth Remote to the Server
Bluetooth remotes output standard HID keyboard events (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`), which work out of the box with BubbaFlix's D-Pad navigation.

1. Put your remote into pairing mode:
   - **Fire TV Remote**: Press and hold **Home** for 10 seconds until the LED blinks.
   - **Google TV Remote**: Press and hold **Home + Back** until the LED blinks.
2. Pair via `bluetoothctl` on the host server:
   ```bash
   sudo bluetoothctl
   agent on
   default-agent
   scan on
   # Locate your remote MAC address (XX:XX:XX:XX:XX:XX)
   pair XX:XX:XX:XX:XX:XX
   trust XX:XX:XX:XX:XX:XX
   connect XX:XX:XX:XX:XX:XX
   ```

### 2. Plan B: Host-Level Kiosk Output Service (Recommended)
Running a lightweight display kiosk on the host OS gives the smoothest 4K playback and full GPU hardware acceleration directly to your server's HDMI port.

1. **Install minimal X11 & Chromium on the server:**
   ```bash
   sudo apt update
   sudo apt install -y xorg chromium-browser nodm
   ```

2. **Enable auto-login in `/etc/default/nodm`:**
   ```env
   NODM_ENABLED=true
   NODM_USER=root
   ```

3. **Create the Kiosk Startup Script (`~/.xsession`):**
   ```bash
   #!/bin/bash
   # Disable screen sleep / blanking
   xset s off
   xset -dpms
   xset s noblank

   # Start Chromium targeting local BubbaFlix container
   chromium-browser \
     --kiosk \
     --noerrdialogs \
     --disable-infobars \
     --autoplay-policy=no-user-gesture-required \
     --app=http://localhost:5150
   ```

4. **Make executable and start the kiosk:**
   ```bash
   chmod +x ~/.xsession
   sudo systemctl restart nodm
   ```

---

## 🐳 Docker Deployment

A prebuilt Docker image is built and released automatically to GitHub Container Registry (`ghcr.io`).

### `docker-compose.yml`
Save the configuration below to run BubbaFlix:
```yaml
services:
  bubbaflix:
    image: ghcr.io/jsanderstechnologies/bubbaflix-media-center:latest
    container_name: bubbaflix
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=5150
      - TMDB_KEY=your_tmdb_key_here
      - GEMINI_API_KEY=your_gemini_key_here
      - PREMIUMIZE_API_KEY=your_premiumize_key_here
    labels:
      io.casaos.app.icon: "https://raw.githubusercontent.com/jsanderstechnologies/BubbaFlix-Media-Center/main/public/icon.svg"
      io.casaos.app.title: "BubbaFlix"
      io.casaos.app.desc: "Premium personal media center and TV coordinator"
```

Start the service with:
```bash
docker compose up -d
```

---

## 🛠️ Installation Guides

### 🐧 Debian / Ubuntu (Native System Service — No Docker)

BubbaFlix can run natively as a Node.js background service using `systemd`:

1. **Install Node.js 20 LTS & FFmpeg**:
   ```bash
   sudo apt update && sudo apt install -y curl git ffmpeg
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
   sudo apt install -y nodejs
   ```

2. **Clone & Build**:
   ```bash
   git clone https://github.com/jsanderstechnologies/BubbaFlix-Media-Center.git /opt/bubbaflix
   cd /opt/bubbaflix
   npm install
   npm run build
   ```

3. **Create Systemd Service (`/etc/systemd/system/bubbaflix.service`)**:
   ```ini
   [Unit]
   Description=BubbaFlix Media Center Server
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/opt/bubbaflix
   ExecStart=/usr/bin/npm start
   Restart=always
   RestartSec=5
   Environment=NODE_ENV=production
   Environment=PORT=5150

   [Install]
   WantedBy=multi-user.target
   ```

4. **Enable & Start**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now bubbaflix
   ```

---

### 🐳 Debian / Ubuntu (Docker Container)
1. Install Docker:
   ```bash
   sudo apt update && sudo apt install -y curl
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   ```
2. Navigate to your app directory, create `docker-compose.yml`, and launch:
   ```bash
   mkdir -p ~/bubbaflix && cd ~/bubbaflix
   # Paste compose contents into docker-compose.yml
   sudo docker compose up -d
   ```
   *Detailed instructions are available in [INSTALL_DEBIAN.md](INSTALL_DEBIAN.md).*

### 🏁 Windows
1. Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).
2. Create a folder (e.g., `C:\Users\Jessie\BubbaFlix`).
3. Add `docker-compose.yml` to the folder and run in PowerShell:
   ```powershell
   cd C:\Users\Jessie\BubbaFlix
   docker compose up -d
   ```
   *Detailed instructions are available in [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md).*

---

## 🛠️ Tech Stack & Dependencies

- **Frontend**: React, Tailwind CSS, Vite, Lucide Icons, Spatial Navigation (`spatial-navigation-js`).
- **Backend**: Node.js, Express, FFmpeg, FFprobe.
- **Database**: Local JSON-based flat-file database structures (`users.json`, `db.json`, `settings.json`).
- **External APIs**: TMDB, Premiumize, NewsAPI.org, GNews, ESPN Scoreboards, Zippopotam.us, Open-Meteo, Gemini AI.
- **Email Infrastructure**: `nodemailer` with Google App Passwords support.
