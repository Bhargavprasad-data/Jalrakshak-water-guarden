# Deployment Guide

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)
- Python 3.9+ (for AI service development)
- PostgreSQL 15+ (or use Docker)
- MQTT Broker (or use Docker)

## Quick Start

1. **Clone the repository:**
```bash
git clone <repository-url>
cd jalrakshak
```

2. **Configure environment variables:**
   - Copy `.env.example` files in each service directory
   - Update with your credentials:
     - Database passwords
     - JWT secret
     - WhatsApp API credentials
     - MQTT server details

3. **Start all services:**
```bash
docker-compose up -d
```

4. **Initialize database:**
```bash
docker-compose exec backend npm run migrate
```

5. **Access services:**
   - Dashboard: http://localhost:3001
   - Backend API: http://localhost:3000
   - AI Service: http://localhost:5000

## Production Deployment

### 1. Database Setup

```bash
# Create production database
docker run -d \
  --name jalrakshak-db \
  -e POSTGRES_DB=jalrakshak \
  -e POSTGRES_USER=jalrakshak \
  -e POSTGRES_PASSWORD=<strong_password> \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15-alpine
```

### 2. MQTT Broker

```bash
# Use Eclipse Mosquitto
docker run -d \
  --name jalrakshak-mqtt \
  -p 1883:1883 \
  -v mqtt_data:/mosquitto/data \
  eclipse-mosquitto:2.0
```

### 3. Backend Service

```bash
cd backend
npm install --production
npm run process-all #for what's app messages in backend it must have to run for what's app messages
NODE_ENV=production npm start
```

### 4. AI Service

```bash
   cd ai-service
   python -m venv venv
   venv\Scripts\activate  # on Windows
   pip install -r requirements.txt
   python src/app.py
```

### 5. Dashboard

```bash
cd dashboard
npm install
npm run build
npm run dev
# Serve with nginx or similar
```

## Environment Variables

### Backend (.env)
```
NODE_ENV=production
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jalrakshak
DB_USER=jalrakshak
DB_PASSWORD=<password>
JWT_SECRET=<strong_secret>
WHATSAPP_API_KEY=<key>
WHATSAPP_API_URL=<url>
```

### AI Service (.env)
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jalrakshak
DB_USER=jalrakshak
DB_PASSWORD=<password>
```

## SSL/HTTPS Setup

Use nginx as reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3001;
    }

    location /api {
        proxy_pass http://localhost:3000;
    }
}
```

## Monitoring

- Use PM2 for process management
- Set up log rotation
- Monitor disk space for telemetry data
- Set up alerts for service failures

## Backup

```bash
# Database backup
docker exec jalrakshak-db pg_dump -U jalrakshak jalrakshak > backup.sql

# Restore
docker exec -i jalrakshak-db psql -U jalrakshak jalrakshak < backup.sql
```






