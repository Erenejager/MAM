# MAM Deployment Guide — Hetzner Server

## Prerequisites

- Node.js 20+ installed
- nginx installed and running
- OpenSearch installed and running on localhost:9200
- ffmpeg installed (`apt-get install ffmpeg`)
- Dedicated `mam` user created

## Directory Structure

```
/opt/mam/
  frontend/dist/    # Vite build output (static files)
  backend/
    dist/           # TypeScript compiled output
    drizzle/        # Migration files
    .env            # Environment variables (not in git)
    node_modules/

/mnt/mam/           # STORAGE_ROOT — video files, thumbnails, transcripts
  videos/
  thumbnails/
  transcripts/

/home/mam/.mam/     # SQLite database
  mam.db
```

## Setup Steps

### 1. Create service user
```bash
sudo useradd -r -m -s /bin/bash mam
sudo mkdir -p /mnt/mam/{videos,thumbnails,transcripts}
sudo chown -R mam:mam /mnt/mam
```

### 2. Deploy application
```bash
sudo mkdir -p /opt/mam
# Copy or clone your built application to /opt/mam
sudo chown -R mam:mam /opt/mam
```

### 3. Configure environment
```bash
sudo -u mam cp /opt/mam/backend/.env.example /opt/mam/backend/.env
sudo -u mam nano /opt/mam/backend/.env
# Set: STORAGE_ROOT=/mnt/mam
# Set: GROQ_API_KEY=your_key
# Set: NODE_ENV=production
# Set: DATABASE_PATH=/home/mam/.mam/mam.db
```

### 4. Run migrations
```bash
cd /opt/mam/backend
sudo -u mam node -e "require('./dist/db/migrate.js')"
```

### 5. Install nginx config
```bash
sudo cp .planning/deploy/nginx.conf.example /etc/nginx/sites-available/mam
sudo ln -s /etc/nginx/sites-available/mam /etc/nginx/sites-enabled/mam
sudo nginx -t && sudo systemctl reload nginx
```

### 6. Install systemd service
```bash
sudo cp .planning/deploy/systemd/mam.service.example /etc/systemd/system/mam.service
sudo systemctl daemon-reload
sudo systemctl enable mam
sudo systemctl start mam
```

### 7. Verify
```bash
sudo systemctl status mam
curl http://localhost:3001/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

## Logs
```bash
journalctl -u mam -f          # Follow backend logs
journalctl -u mam --since today  # Today's logs
```

## Updates
```bash
cd /opt/mam
# Pull/copy new code
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build
sudo systemctl restart mam
```
