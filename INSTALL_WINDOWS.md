# Installing BubbaFlix on Windows

Follow these steps to run the BubbaFlix Media Center on Windows.

---

## 1. Install Docker Desktop

To run Docker containers on Windows, you will need **Docker Desktop**:

1. Download the installer from the official website: [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).
2. Run the installer. Ensure that **Use WSL 2 instead of Hyper-V** is selected (recommended for better performance).
3. If prompted, install/update the WSL 2 Linux kernel package by following the link shown on screen.
4. Restart your computer if required by the installer.
5. Launch Docker Desktop and accept the subscription agreement.

---

## 2. Setup and Run BubbaFlix

1. Create a folder on your computer where you want to keep the application data (for example, `C:\Users\Jessie\BubbaFlix`).
2. Inside that folder, create a new file named `docker-compose.yml`.
3. Open `docker-compose.yml` in a text editor (like Notepad or VS Code) and paste the following content:

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

4. Open **PowerShell** or **Command Prompt** and navigate to your folder:
   ```powershell
   cd C:\Users\Jessie\BubbaFlix
   ```
5. Start the application:
   ```powershell
   docker compose up -d
   ```

---

## 3. Usage & Access

- Access the media center web interface by opening your browser and going to:
  [http://localhost:5150](http://localhost:5150)
- The `./data` folder will automatically be created inside your directory. This keeps your user accounts, database media paths, and SMTP configurations persistent.

To stop the container:
```powershell
docker compose down
```
