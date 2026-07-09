# <p align="center"><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='80' viewBox='0 0 320 80'><defs><path id='c' d='M 12,56 Q 160,20 308,56' fill='none' /><linearGradient id='g' x1='0%' y1='0%' x2='0%' y2='100%'><stop offset='0%' stop-color='%23ff4d4d' /><stop offset='35%' stop-color='%23e50914' /><stop offset='75%' stop-color='%23b30000' /><stop offset='100%' stop-color='%237a0000' /></linearGradient></defs><text font-family='Arial Black, Bebas Neue, Impact, sans-serif' font-size='52' font-weight='900' letter-spacing='-1.2' fill='url(%23g)' stroke='url(%23g)' stroke-width='2.8' stroke-linejoin='round'><textPath href='%23c' startOffset='50%' text-anchor='middle'>BUBBAFLIX</textPath></text></svg>" width="320" alt="BubbaFlix Logo" /></p>

**BubbaFlix Media Server** is a private, high-performance web-based streaming application and media organizer. It provides user management, content filters, real-time transcoding streams, live TV (M3U/XMLTV), and administrative tools built on a premium, responsive dark-mode layout.

---

## 🚀 Key Features Implemented

### 👥 User Administration & Approvals
- **Pending Registration Workflow**: New registrations are created without passwords and flagged as `pending` until approved by an administrator.
- **Gmail Welcome Notification**: Upon admin approval, the system auto-generates a secure 12-character password, hashes it using `scrypt`, updates the database, and automatically sends a beautifully formatted email with access credentials to the user.
- **Add User Actions**: Admins can either set passwords manually or generate and email them automatically during profile creation.

### ⚙️ User Settings & Customization
- **Playback Preferences**: Customized settings on a per-user basis stored in local storage (`resolutions`, `audioLanguage`, `ccLanguage`, `autoCC`).
- **Dynamic Audio Leveling**: Keeps loud parts in movies and TV shows from overwhelming the user by enabling FFmpeg's Dynamic Audio Normalizer (`dynaudnorm`) filter on target transcode streams.
- **Clean Access Rules**: Standard users are restricted from seeing or entering the admin panels or settings endpoints.

### 📧 Email Configuration Panel
- **Sleek Admin Controls**: Exposes a dedicated UI to manage and save credentials (Gmail address, App Password, App Name, App URL) to `data/settings.json`.
- **Integrated Test Button**: Allows testing of Gmail credentials directly by sending a test mail immediately before deploying changes live.

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
    ports:
      - "5150:5150"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=5150
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
