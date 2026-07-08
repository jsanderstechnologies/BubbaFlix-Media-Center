# Installing BubbaFlix on Debian/Ubuntu

Follow these steps on your Debian-based machine to install Docker, download the container, and run the BubbaFlix Media Center.

---

## 1. Install Docker & Docker Compose

Run the following commands to install Docker:

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

Verify that Docker is installed:
```bash
sudo docker --version
sudo docker compose version
```

---

## 2. Setup and Run BubbaFlix

Create a directory for the app and save your `docker-compose.yml` there:

```bash
mkdir -p ~/bubbaflix
cd ~/bubbaflix
```

Create the `docker-compose.yml` file:
```bash
nano docker-compose.yml
```

Paste the following configurations (adjust the registry path as needed):
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

Start the container in the background:
```bash
sudo docker compose up -d
```

---

## 3. Persistent Data
The volume map `./data:/app/data` will automatically create a `./data` folder in your `~/bubbaflix` directory on Debian. This persists your users, database records, and settings across updates.

To check logs:
```bash
sudo docker compose logs -f
```

To stop:
```bash
sudo docker compose down
```
