# <p align="center"><img src="https://raw.githubusercontent.com/jsanderstechnologies/BubbaFlix-Media-Center/main/public/logo.svg?raw=true" width="320" alt="BubbaFlix Logo" /></p>

**BubbaFlix Media Server** is a private, high-performance web-based streaming application and media organizer. It provides user management, content filters, real-time transcoding streams, live TV (M3U/XMLTV), and administrative tools built on a premium, responsive dark-mode layout.

---

## 🚀 Key Features

### 🎬 Media Aggregation & Streaming
- **TMDB Integration**: Browse rich metadata for movies and TV shows, complete with cast, crew, trailers, and recommendations.
- **TorBox Streaming**: Search for Torrents and Usenet files directly through TorBox and stream them instantly without downloading.
- **AI-Powered Filtering**: Integrated with Google Gemini (3.5-flash) to intelligently filter out non-English results and irrelevant file names, guaranteeing high-quality search results.
- **Hardware-Accelerated Transcoding**: Support for Intel Quick Sync Video (QSV) to transcode media on the fly via FFmpeg with minimal CPU usage.
- **Live TV (IPTV)**: Fully integrated M3U and Xtream Codes support with EPG (Electronic Program Guide) parsing and offset customization.
- **Customizable Players**: Native browser playback or automatic spawning of external desktop players like VLC, mpv, or IINA.

### 👥 User Administration & Approvals
- **Pending Registration Workflow**: New registrations are created without passwords and flagged as `pending` until approved by an administrator.
- **Gmail Welcome Notification**: Upon admin approval, the system auto-generates a secure 12-character password, hashes it using `scrypt`, updates the database, and automatically sends a beautifully formatted email with access credentials to the user.
- **Account Locking**: Administrators can lock or unlock user accounts at any time, instantly revoking access.
- **Auto Admin / Dev Mode**: A handy toggle to completely disable login and boot straight into the administrator dashboard for local development or Android Studio layout inspection.

### ⚙️ Comprehensive Settings Panel
- **Sleek Admin Controls**: All system settings are organized into a clean, collapsible UI for managing API keys, Scrapers, IPTV URLs, Developer logs, and more.
- **Email Configuration**: Exposes a dedicated UI to manage and save credentials (Gmail address, App Password, App Name, App URL) to `data/settings.json`, complete with a "Test Email" button.
- **Developer Debugging**: View real-time frontend and backend console logs directly within the browser Settings UI.

### 🎵 Playback Preferences
- **User Profiles**: Customized settings on a per-user basis stored in local storage (`resolutions`, `audioLanguage`, `ccLanguage`, `autoCC`).
- **Dynamic Audio Leveling**: Keeps loud parts in movies and TV shows from overwhelming the user by enabling FFmpeg's Dynamic Audio Normalizer (`dynaudnorm`) filter on target transcode streams.

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

- **Frontend**: React, Tailwind CSS, Vite, Lucide Icons, React Query.
- **Backend**: Node.js, Express, FFmpeg, FFprobe.
- **Database**: Local JSON-based flat-file database structures (`users.json`, `db.json`, `settings.json`).
- **Email Infrastructure**: `nodemailer` with Google App Passwords support.
