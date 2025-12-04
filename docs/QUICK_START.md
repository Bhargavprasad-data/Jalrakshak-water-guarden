# Quick Start Guide

## 1. Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for development)
- Python 3.9+ (for AI service)
- Git

## 2. Clone and Setup

```bash
# Clone repository
git clone <repository-url>
cd jalrakshak

# Create environment files
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env

# Edit environment files with your credentials
nano backend/.env
nano ai-service/.env
```

## 3. Start Services

```bash
# Start all services with Docker Compose
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f backend
```

## 4. Initialize Database

```bash
# Database is auto-initialized on first start
# Or manually run migrations
docker-compose exec backend npm run migrate
```

## 5. Access Services

- **Dashboard**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **AI Service**: http://localhost:5000

## 6. Default Login

- Username: `admin`
- Password: `admin123` (change in production!)

## 7. Configure ESP32

1. Open `hardware/esp32/firmware/jalrakshak_firmware.ino` in Arduino IDE
2. Update WiFi credentials:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```
3. Update MQTT server:
   ```cpp
   const char* mqtt_server = "YOUR_SERVER_IP";
   ```
4. Update device ID:
   ```cpp
   const char* device_id = "ESP32_001";
   ```
5. Flash to ESP32

## 8. Register Device

1. Login to dashboard
2. Go to Devices section (or use API)
3. Register new device with GPS coordinates

## 9. Test System

1. ESP32 should start sending data every 10 seconds
2. Check dashboard for live data
3. View GIS map for sensor locations
4. Test alert generation

## 10. Configure WhatsApp (Optional)

1. Get WhatsApp Business API credentials
2. Update `WHATSAPP_API_KEY` and `WHATSAPP_API_URL` in backend `.env`
3. Add contacts via dashboard
4. Test message sending

## Troubleshooting

- **Services not starting**: Check Docker logs, verify ports not in use
- **Database connection failed**: Verify DB credentials in `.env`
- **ESP32 not connecting**: Check WiFi credentials, MQTT server address
- **No data in dashboard**: Verify device registration, check MQTT connection

## Next Steps

- Read [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup
- Read [HARDWARE.md](./HARDWARE.md) for hardware details
- Read [API.md](./API.md) for API documentation






