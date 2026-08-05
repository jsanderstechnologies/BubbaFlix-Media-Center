# <p align="center"><img src="https://raw.githubusercontent.com/jsanderstechnologies/BubbaFlix-Media-Center/main/public/logo.svg?raw=true" width="320" alt="BubbaFlix Logo" /></p>

**BubbaFlix Media Server** is a private, high-performance web-based streaming application and media organizer. It provides user management, content filters, real-time transcoding streams, live TV (M3U/Xtream), sports scoreboards with AI stream matching, local/regional/world news, smart TV D-Pad spatial navigation, and administrative tools built on a premium, responsive dark-mode layout.

---

## 🚀 Key Features

### 🎬 Media Aggregation & Streaming
- **TMDB Integration**: Browse rich metadata for movies and TV shows, complete with cast, crew, trailers, and recommendations.
- **TorBox Streaming**: Search for Torrents and Usenet files directly through TorBox and stream them instantly without downloading.
- **AI-Powered Filtering**: Integrated with Google Gemini (`gemini-2.5-flash` / `gemini-1.5-flash`) to intelligently filter out non-English results, honeypot releases, and irrelevant file names.
- **Hardware-Accelerated Transcoding**: Support for Intel Quick Sync Video (QSV), NVENC, and AMF to transcode media on the fly via FFmpeg with minimal CPU usage.
- **Server Stream Pre-Caching**: Optional background media caching for remote streams (TorBox, Usenet, Debrid). Pre-downloads video files progressively to local server storage as they are watched, eliminating CDN rate-limiting, network jitter, and providing instant seeking.
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
- **D-Pad Spatial Navigation**: Built-in `spatial-navigation-js` integration allowing seamless 100% remote control navigation across all menus, video player controls, modal dialogs, and settings.
- **Focus Ring Accessibility**: Clear, high-visibility focus indicators designed specifically for 10-foot viewing experiences.

### 👥 User Administration & Multi-Device Auth
- **Multi-Device Token Sessions**: Support for simultaneous device logins without revoking credentials or admin access.
- **Pending Registration Workflow**: New registrations are created without passwords and flagged as `pending` until approved by an administrator.
- **Gmail Welcome Notification**: Upon admin approval, the system auto-generates a secure 12-character password, hashes it using `scrypt`, updates the database, and automatically sends a beautifully formatted email with access credentials to the user.
- **Account Locking**: Administrators can lock or unlock user accounts at any time, instantly revoking access.
- **Auto Admin / Dev Mode**: A handy toggle to completely disable login and boot straight into the administrator dashboard for local development or Android Studio layout inspection.

### ⚙️ Comprehensive Settings Panel
- **Sleek Admin Controls**: All system settings are organized into a clean, collapsible UI for managing API keys (TMDB, Gemini, NewsAPI, GNews, TorBox, Premiumize), Scrapers, IPTV Providers, Developer logs, and more.
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
      - TORBOX_API_KEY=your_torbox_key_here
      - GEMINI_API_KEY=your_gemini_key_here
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

### 🐧 Debian / Ubuntu
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
- **External APIs**: TMDB, TorBox, Premiumize, NewsAPI.org, GNews, ESPN Scoreboards, Zippopotam.us, Open-Meteo, Gemini AI.
- **Email Infrastructure**: `nodemailer` with Google App Passwords support.
