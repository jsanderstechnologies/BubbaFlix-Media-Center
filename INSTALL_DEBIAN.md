# Installing BubbaFlix on Debian/Ubuntu

You can install BubbaFlix on Debian/Ubuntu either **Natively (without Docker)** using Node.js & `systemd`, or inside a **Docker container**.

---

## ⚡ Option A: Native Installation (No Docker)

### 1. Install Node.js (v20 LTS), Git & FFmpeg
```bash
# Update package index and install prerequisites
sudo apt update && sudo apt install -y curl git ffmpeg

# Install Node.js 20 LTS repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

### 2. Clone & Build BubbaFlix
```bash
# Clone repository
git clone https://github.com/jsanderstechnologies/BubbaFlix-Media-Center.git /opt/bubbaflix
cd /opt/bubbaflix

# Install dependencies and build production bundles
npm install
npm run build
```

### 3. Create a Systemd Background Service
```bash
sudo nano /etc/systemd/system/bubbaflix.service
```

Paste the following:
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

### 4. Enable & Start Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bubbaflix
```

Access BubbaFlix at `http://<your-server-ip>:5150`!

---

## 🐳 Option B: Docker Container Installation

### 1. Install Docker & Docker Compose

```bash
# Update package index and install prerequisites
sudo apt update
sudo apt install -y curl gnupg lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
# Note: If on Ubuntu, replace 'debian' with 'ubuntu' in the curl URL above.

# Set up the repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker engine
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

### 2. Setup and Run BubbaFlix

```bash
mkdir -p ~/bubbaflix
cd ~/bubbaflix
nano docker-compose.yml
```

Paste configuration:
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

Start container:
```bash
sudo docker compose up -d
```
