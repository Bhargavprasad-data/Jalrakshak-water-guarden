# JalRakshak (Water Guardian) 💧

A comprehensive IoT-based water supply monitoring and management system for rural areas, featuring real-time sensor data collection, AI-powered anomaly detection, automated alerting, and multi-platform dashboards.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-production--ready-success.svg)

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Dashboard Features](#dashboard-features)
- [Mobile App](#mobile-app)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Overview

JalRakshak is an end-to-end IoT water monitoring solution designed to help rural communities manage their water supply infrastructure efficiently. The system monitors water quality, pressure, flow rates, and detects leaks and contamination in real-time using ESP32 sensors, AI-powered analysis, and automated alerting via WhatsApp.

### Problem Statement

Rural water supply systems often face challenges:
- Lack of real-time monitoring
- Delayed leak detection leading to water wastage
- Manual inspection requirements
- Limited communication infrastructure
- No predictive maintenance

### Solution

JalRakshak provides:
- ✅ Real-time sensor monitoring (10-second updates)
- ✅ AI-powered leak and contamination detection
- ✅ Automated WhatsApp alerts to field workers
- ✅ GIS-based visualization
- ✅ Multi-platform access (Web, Mobile)
- ✅ Predictive maintenance insights

## ✨ Key Features

### 🔄 Real-Time Monitoring
- **10-second data updates** from ESP32 sensors
- Live dashboard with real-time statistics
- WebSocket support for instant updates
- Auto-refresh on all pages (5-10 seconds)
- Live sync indicators with status bars

### 🤖 AI-Powered Detection
- **Anomaly Detection**: Isolation Forest algorithm for pattern recognition
- **Leak Detection**: Pressure-flow correlation analysis with GPS localization
- **Contamination Detection**: Turbidity pattern analysis
- **Predictive Maintenance**: Random Forest model for equipment failure prediction
- Real-time analysis API endpoint

### 📊 Dynamic Data Visualization
- **Dashboard Page**: 
  - Real-time KPI cards (Devices, Alerts, Tickets, Pressure, Flow, pH)
  - Live sensor data charts
  - Dynamic statistics from telemetry
  - Excel report generation
  - 5-second auto-refresh

- **Analytics Page**:
  - Pressure-Flow correlation charts
  - Water quality trends (Turbidity, Temperature)
  - Leakage detection trends with confidence scores
  - Pump performance metrics
  - Date range and village filtering
  - Dynamic village dropdown updates
  - Continuous line graphs for all dates

- **GIS Map Page**:
  - Interactive Leaflet map with sensor markers
  - Color-coded status indicators (Normal, Warning, Critical)
  - Real-time sensor details panel
  - Village-based filtering
  - Pipeline visualization
  - Auto-refresh every 5 seconds
  - Dynamic village name display

### 🚨 Alert Management
- **Dynamic Alert Generation**:
  - Real-time alerts from telemetry data
  - Leak flag detection from dataset
  - Contamination flag detection
  - Anomaly flag detection
  - Sensor threshold-based alerts (pressure, flow, turbidity, pH)
  
- **Alert Features**:
  - Severity-based categorization (Critical, High, Medium, Low)
  - Village-based filtering
  - Acknowledgment system
  - Assignment to workers
  - Real-time updates (5-second refresh)
  - Dynamic alert counts

### 🎫 Ticket Management
- **Automated Ticket Creation**:
  - Auto-creation from alerts
  - Leakage-based tickets
  - High/critical severity tickets
  
- **Ticket Workflow**:
  - Status tracking (Open, Accepted, In Progress, Completed, Closed)
  - Assignment to workers
  - Village-based filtering
  - Real-time updates (5-second refresh)
  - Dynamic ticket counts
  - Detailed ticket panels

### 📱 WhatsApp Integration
- **Automated Notifications**:
  - Alert notifications with severity emojis
  - Ticket assignment messages
  - Google Maps location links
  - Follow-up messages
  - Response handling (YES/NO buttons)
  
- **Contact Management**:
  - Village-specific contacts
  - Global contacts with opt-in
  - Bulk import from Excel
  - Message logging
  - Delivery status tracking

### 🗺️ GIS Visualization
- **Interactive Map**:
  - Real-time sensor locations
  - Color-coded status markers
  - Pulsing animation for critical alerts
  - Sensor popups with live data
  - Village name display
  - Pipeline overlay visualization
  
- **Sensor Details Panel**:
  - Device information
  - Village name (dynamically fetched)
  - Battery level
  - Connection status
  - Live sensor readings chart
  - Recent alerts list
  - Quick actions (Create Ticket, Acknowledge)

### 📈 Data Processing
- **Excel Import**:
  - Bulk telemetry data import
  - Metadata flag processing (leak_flag, contamination_flag, anomaly_flag)
  - Automatic alert and ticket generation
  - Data validation and error handling

- **Real-Time Processing**:
  - Continuous telemetry processing
  - Flag-based detection priority
  - Deduplication logic
  - Dynamic alert/ticket generation

### 🔐 Security & Authentication
- JWT-based authentication
- Role-based access control (Admin, Operator, Viewer)
- Secure API endpoints
- Password hashing with bcrypt
- Session management

## 🏗️ System Architecture

```
┌─────────────────┐
│   ESP32 Sensors │
│  (Flow, Pressure│
│  Turbidity, GPS)│
└────────┬────────┘
         │
         │ MQTT/HTTP
         ▼
┌─────────────────┐
│  Backend API    │
│  (Node.js)      │
│  - MQTT Broker  │
│  - REST API     │
│  - WebSocket    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────┐
│PostgreSQL│ │ AI Service│
│Database │ │ (Python)  │
│+ PostGIS│ │ - ML Models│
└────────┘ └──────────┘
    │
    │
    ▼
┌─────────────────┐
│   Dashboard     │
│   (React)      │
│   - GIS Map     │
│   - Analytics   │
│   - Alerts      │
│   - Tickets     │
└─────────────────┘
         │
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────┐
│ Mobile │ │WhatsApp  │
│  App   │ │  API     │
│(React  │ │          │
│Native) │ │          │
└────────┘ └──────────┘
```

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL with PostGIS extension
- **Cache**: Redis
- **Message Queue**: MQTT (Mosquitto)
- **Authentication**: JWT (jsonwebtoken)
- **Real-time**: WebSocket (ws)

### AI/ML Service
- **Language**: Python 3.9+
- **ML Libraries**: scikit-learn, pandas, numpy
- **Models**: Isolation Forest, Random Forest
- **API**: Flask

### Frontend (Dashboard)
- **Framework**: React 18+
- **Build Tool**: Vite
- **Maps**: Leaflet, react-leaflet
- **Charts**: Recharts
- **HTTP Client**: Axios
- **Notifications**: react-toastify

### Mobile App
- **Framework**: React Native (Expo)
- **Navigation**: React Navigation
- **Maps**: React Native Maps

### Infrastructure
- **Containerization**: Docker, Docker Compose
- **Web Server**: Nginx (for dashboard)
- **Process Manager**: PM2 (optional)

## 📦 Installation

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for development)
- Python 3.9+ (for AI service development)
- Git

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd SIH

# Create environment files
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env

# Edit environment files with your credentials
nano backend/.env
nano ai-service/.env

# Start all services with Docker Compose
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f backend
```

### Manual Installation

#### Backend Setup

```bash
cd backend
npm install
npm run migrate
npm start
```

#### AI Service Setup

```bash
cd ai-service
pip install -r requirements.txt
python src/app.py
```

#### Dashboard Setup

```bash
cd dashboard
npm install
npm run dev
```

#### Mobile App Setup

```bash
cd mobile-app
npm install
npm start
```

## ⚙️ Configuration

### Backend Environment Variables

Create `backend/.env`:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jalrakshak
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=24h

# MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_TOPIC_PREFIX=jalrakshak

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# WhatsApp API
WHATSAPP_API_URL=https://api.whatsapp.com
WHATSAPP_API_KEY=your_api_key

# Server
PORT=3000
NODE_ENV=production
```

### AI Service Environment Variables

Create `ai-service/.env`:

```env
# Database (same as backend)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jalrakshak
DB_USER=postgres
DB_PASSWORD=your_password

# Service
PORT=5000
FLASK_ENV=production
```

### ESP32 Firmware Configuration

Edit `hardware/esp32/firmware/jalrakshak_firmware.ino`:

```cpp
// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT Configuration
const char* mqtt_server = "YOUR_SERVER_IP";
const int mqtt_port = 1883;

// Device Configuration
const char* device_id = "ESP32_001";
```

## 🚀 Usage

### Access Points

- **Dashboard**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **AI Service**: http://localhost:5000
- **MQTT Broker**: mqtt://localhost:1883

### Default Login

- **Username**: `admin`
- **Password**: `admin123` (⚠️ Change in production!)

### Dashboard Pages

#### 1. Dashboard
- Real-time KPI overview
- Live sensor data charts
- Device statistics
- Report generation

#### 2. GIS Map
- Interactive sensor map
- Village filtering
- Sensor details panel
- Pipeline visualization
- Auto-refresh every 5 seconds

#### 3. Alerts
- Real-time alert list
- Severity filtering
- Village filtering
- Acknowledgment system
- Auto-refresh every 5 seconds

#### 4. Tickets
- Ticket management
- Status tracking
- Assignment workflow
- Village filtering
- Auto-refresh every 5 seconds

#### 5. Analytics
- Pressure-Flow correlation
- Water quality trends
- Leakage detection trends
- Pump performance
- Date range filtering
- Village filtering
- Auto-refresh every 10 seconds

#### 6. Contacts
- WhatsApp contact management
- Village assignment
- Bulk import
- Message history

### API Endpoints

See [API Documentation](./docs/API.md) for complete API reference.

Key endpoints:
- `GET /api/telemetry/live` - Live sensor data
- `GET /api/alerts` - Get alerts
- `GET /api/tickets` - Get tickets
- `GET /api/analytics` - Analytics data
- `GET /api/gis/sensors` - GIS sensor data
- `POST /api/whatsapp/send` - Send WhatsApp message

## 📱 Mobile App

The mobile app provides:
- Dashboard with real-time stats
- Alerts list with filtering
- Ticket management
- GIS map view
- Analytics charts
- Settings and profile

See [Mobile App README](./mobile-app/README.md) for details.

## 🚢 Deployment

### Production Deployment

1. **Update Environment Variables**
   - Set production database credentials
   - Configure strong JWT secret
   - Set up WhatsApp API credentials
   - Configure domain names

2. **Database Setup**
   ```bash
   docker-compose exec backend npm run migrate
   ```

3. **SSL/HTTPS Setup**
   - Configure reverse proxy (Nginx)
   - Set up SSL certificates
   - Update API URLs

4. **Monitoring**
   - Set up log aggregation
   - Configure health checks
   - Set up backups

See [Deployment Guide](./docs/DEPLOYMENT.md) for detailed instructions.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📚 Documentation

- [Quick Start Guide](./docs/QUICK_START.md)
- [Hardware Setup](./docs/HARDWARE.md)
- [API Documentation](./docs/API.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Project Summary](./PROJECT_SUMMARY.md)

## 🎯 Roadmap

- [ ] Advanced ML models for better prediction
- [ ] Multi-language support
- [ ] SMS fallback for WhatsApp
- [ ] Advanced reporting and analytics
- [ ] Mobile app push notifications
- [ ] Offline mode for mobile app
- [ ] Integration with government water supply systems

## 📞 Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Contact the development team
- Check the documentation

## 🙏 Acknowledgments

- ESP32 community for hardware support
- React and Node.js communities
- Open source contributors

---

**Made with 💧 for rural water supply management**

