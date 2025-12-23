# JalRakshak Backend Architecture - Complete Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Data Flow](#data-flow)
5. [API Routes](#api-routes)
6. [Services](#services)
7. [Database Schema](#database-schema)
8. [Real-time Features](#real-time-features)
9. [Security](#security)
10. [Deployment](#deployment)

---

## 🎯 Overview

**JalRakshak Backend** is a Node.js/Express.js REST API server that powers an IoT water supply monitoring system for rural areas. It handles:

- **IoT Device Communication** (MQTT protocol)
- **Real-time Telemetry Processing** (sensor data from water monitoring devices)
- **AI-Powered Anomaly Detection** (leak detection, contamination, pump failures)
- **Alert & Ticket Management** (automated alerts, worker assignments)
- **WhatsApp Integration** (automated notifications)
- **Mobile & Web Dashboard APIs** (REST endpoints for frontend apps)

**Tech Stack:**
- **Runtime:** Node.js with Express.js
- **Database:** PostgreSQL (with connection pooling)
- **Caching:** Redis (for fast data access)
- **Real-time:** WebSocket (WS) for live updates
- **IoT Protocol:** MQTT (for device communication)
- **AI Service:** External Flask microservice (Python)
- **Authentication:** JWT (JSON Web Tokens)

---

## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────┐
│ IoT Devices │ (ESP32, Sensors)
│  (MQTT)     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│         Backend Server (Node.js)        │
│  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │  MQTT    │  │ WebSocket│  │  HTTP  │ │
│  │ Service  │  │  Server  │  │  API   │ │
│  └────┬─────┘  └────┬─────┘  └───┬────┘ │
│       │             │            │      │
│  ┌────▼─────────────▼────────────▼──┐  │
│  │      Service Layer               │  │
│  │  - TelemetryService              │  │
│  │  - AlertService                  │  │
│  │  - TicketService                 │  │
│  │  - AIService                     │  │
│  └────┬─────────────────────────────┘  │
│       │                                 │
│  ┌────▼─────────────┐  ┌─────────────┐│
│  │   PostgreSQL     │  │    Redis    ││
│  │   (Database)     │  │   (Cache)   ││
│  └──────────────────┘  └─────────────┘│
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│ AI Service  │ (Flask/Python)
│ (Port 5000)  │
└─────────────┘
```

### Directory Structure

```
backend/
├── src/
│   ├── server.js              # Main entry point
│   ├── db/
│   │   ├── connection.js      # PostgreSQL connection pool
│   │   ├── init.sql           # Database schema
│   │   └── migrations/        # Database migrations
│   ├── routes/                # API route handlers
│   │   ├── telemetry.js       # Telemetry endpoints
│   │   ├── alerts.js          # Alert endpoints
│   │   ├── tickets.js         # Ticket endpoints
│   │   ├── mobile.js          # Mobile app endpoints
│   │   ├── ai.js              # AI insights endpoints
│   │   └── ...
│   ├── services/              # Business logic layer
│   │   ├── telemetryService.js
│   │   ├── alertService.js
│   │   ├── ticketService.js
│   │   ├── aiService.js       # AI microservice client
│   │   ├── mqttService.js     # MQTT client
│   │   └── ...
│   ├── middleware/
│   │   └── auth.js            # JWT authentication
│   └── utils/
│       └── logger.js           # Winston logger
└── package.json
```

---

## 🔧 Core Components

### 1. **Server Entry Point (`server.js`)**

**Purpose:** Initializes Express app, sets up middleware, connects to database, starts MQTT/WebSocket servers.

**Key Features:**
- Express.js HTTP server
- WebSocket server for real-time updates
- MQTT client for IoT device communication
- Rate limiting (only for write operations)
- CORS enabled for frontend access
- Static file serving for uploads

**Initialization Flow:**
1. Load environment variables (`.env`)
2. Create Express app and HTTP server
3. Set up WebSocket server
4. Initialize MQTT client
5. Connect to PostgreSQL database
6. Register all API routes
7. Start listening on port 3000 (or `PORT` env var)

### 2. **Database Connection (`db/connection.js`)**

**Purpose:** Manages PostgreSQL connection pool using `pg` library.

**Features:**
- Connection pooling (max 20 connections)
- Automatic reconnection on errors
- Query logging with duration tracking
- Error handling with specific PostgreSQL error codes

**Configuration:**
```javascript
{
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'jalrakshak',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,  // Max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
}
```

### 3. **MQTT Service (`services/mqttService.js`)**

**Purpose:** Connects to MQTT broker and subscribes to device telemetry topics.

**Topics:**
- `jalrakshak/+/telemetry` - Wildcard subscription for all devices

**Message Format:**
```json
{
  "device_id": "DEV_001",
  "flow_rate": 12.5,
  "pressure": 1.4,
  "turbidity": 2.3,
  "temperature": 25.0,
  "gps_lat": 19.1234,
  "gps_lon": 72.5678,
  "battery_level": 85,
  "pump_status": "on",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Message Processing (in `server.js`):**
1. Parse MQTT message
2. Store telemetry in database
3. Send to AI service for analysis
4. Create alerts if anomalies detected
5. Broadcast real-time update via WebSocket
6. Send WhatsApp notifications if configured

### 4. **WebSocket Server**

**Purpose:** Real-time bidirectional communication with frontend clients.

**Connection:**
- Endpoint: `ws://localhost:3000/ws`
- Clients can subscribe to specific villages
- Broadcasts telemetry updates, alerts, and AI results

**Message Types:**
- `subscribe` - Client subscribes to village updates
- `telemetry` - Real-time sensor data
- `alert` - New alert notifications

---

## 📊 Data Flow

### Telemetry Data Flow

```
1. IoT Device (ESP32)
   └─> Publishes MQTT message to topic: jalrakshak/DEV_001/telemetry
   
2. MQTT Broker (Mosquitto)
   └─> Forwards message to backend MQTT client
   
3. Backend MQTT Handler (server.js)
   ├─> Parse JSON message
   ├─> Store in PostgreSQL (telemetryService.storeTelemetry)
   ├─> Cache in Redis (latest telemetry)
   ├─> Send to AI Service (aiService.analyzeTelemetry)
   └─> Broadcast via WebSocket (broadcastUpdate)
   
4. AI Service (Flask, port 5000)
   ├─> Analyze for anomalies (leak, contamination, etc.)
   ├─> Predict maintenance needs
   └─> Return results to backend
   
5. Backend Alert Handler
   ├─> If anomaly detected → Create alert (alertService.createAlert)
   ├─> If high severity → Create ticket (ticketService.createTicket)
   └─> Send WhatsApp notification (whatsappService.sendAlert)
   
6. Frontend Clients (Dashboard/Mobile)
   ├─> Receive WebSocket updates
   └─> Poll REST API for latest data
```

### Request Flow (REST API)

```
Client Request
    │
    ▼
Express Middleware
    ├─> CORS
    ├─> Helmet (security headers)
    ├─> Body Parser (JSON/URL-encoded)
    └─> Rate Limiter (for write operations)
    │
    ▼
Authentication Middleware (if required)
    ├─> JWT Token Validation
    └─> Role Authorization
    │
    ▼
Route Handler (routes/*.js)
    │
    ▼
Service Layer (services/*.js)
    ├─> Business Logic
    ├─> Database Queries (via db.query)
    └─> External API Calls (AI service, WhatsApp)
    │
    ▼
Response (JSON)
```

---

## 🛣️ API Routes

### Authentication (`/api/auth`)
- `POST /api/auth/login` - User login (returns JWT token)
- `POST /api/auth/register` - User registration
- `GET /api/auth/me` - Get current user info

### Telemetry (`/api/telemetry`)
- `POST /api/telemetry` - Submit telemetry data (HTTP fallback)
- `GET /api/telemetry/live` - Get live telemetry for all devices
- `GET /api/telemetry/stats/summary` - Dashboard statistics
- `GET /api/telemetry/:device_id/latest` - Latest reading for a device
- `GET /api/telemetry/:device_id/history` - Historical data

### Alerts (`/api/alerts`)
- `GET /api/alerts` - Get all alerts (with filters: village_id, severity, acknowledged)
- `POST /api/alerts/:alert_id/acknowledge` - Acknowledge an alert

### Tickets (`/api/tickets`)
- `GET /api/tickets` - Get all tickets (for workers)
- `POST /api/tickets` - Create ticket
- `PUT /api/tickets/:id` - Update ticket
- `POST /api/tickets/:id/accept` - Worker accepts ticket
- `POST /api/tickets/:id/complete` - Worker completes ticket

### Mobile App (`/api/mobile`)
- `GET /api/mobile/worker/tickets` - Worker's assigned tickets
- `POST /api/mobile/worker/tickets/:ticket_id/update-status` - Update ticket status
- `GET /api/mobile/water-status` - Water quality status for user's location
- `GET /api/mobile/alerts` - Alerts for user's village

### AI Insights (`/api/ai`)
- `GET /api/ai/insights` - Aggregated AI insights for dashboard
  - Returns: leak risk, pump health, water quality, pressure conditions
  - Graph data: pump efficiency, leak probability, turbidity forecast
  - AI alerts and recommendations

### GIS (`/api/gis`)
- `GET /api/gis/map-data` - Map data with device locations
- `GET /api/gis/villages` - Village locations

### Analytics (`/api/analytics`)
- `GET /api/analytics/overview` - Analytics overview
- `GET /api/analytics/trends` - Trend analysis

### Complaints (`/api/complaints`)
- `POST /api/complaints` - Submit complaint (with photo upload)
- `GET /api/complaints` - Get complaints

### Import (`/api/import`)
- `POST /api/import/excel` - Import data from Excel/CSV

---

## 🔌 Services

### 1. **TelemetryService** (`services/telemetryService.js`)

**Functions:**
- `storeTelemetry(data)` - Store sensor data in database
- `getLatestTelemetry(device_id)` - Get most recent reading
- `getTelemetryHistory(device_id, start, end, limit)` - Historical data
- `getAllLiveTelemetry(village_id)` - Live data for all devices
- `getDashboardStats()` - Summary statistics for dashboard
- `attachWaterQuality(telemetry_id, quality_data)` - Attach AI analysis

**Database Operations:**
- Inserts into `telemetry` table
- Updates `devices.last_seen`
- Caches latest telemetry in Redis (60s TTL)

### 2. **AlertService** (`services/alertService.js`)

**Functions:**
- `createAlert(alertData)` - Create alert from anomaly
- `getAlerts(filters)` - Query alerts with filters
- `acknowledgeAlert(alert_id, user_id)` - Mark alert as acknowledged

**Alert Creation Flow:**
1. Create `anomalies` record
2. Create `alerts` record
3. If severity is high/critical → Create `tickets` record
4. Send WhatsApp notification

### 3. **TicketService** (`services/ticketService.js`)

**Functions:**
- `createTicket(ticketData)` - Create maintenance ticket
- `getTickets(filters)` - Get tickets (with village_name resolution)
- `updateTicketStatus(ticket_id, status, worker_notes)` - Update ticket
- `acceptTicket(ticket_id, worker_id)` - Worker accepts ticket
- `completeTicket(ticket_id, worker_id)` - Worker completes ticket

**Special Features:**
- Handles dynamic ticket IDs (e.g., `dynamic-DEV_019-low_pressure-1`)
- Resolves village names using Haversine formula if missing
- Auto-creates tickets from telemetry if dynamic ID provided

### 4. **AIService** (`services/aiService.js`)

**Purpose:** Client for external AI microservice (Flask/Python).

**Endpoints Called:**
- `POST http://localhost:5000/analyze` - Analyze telemetry for anomalies
- `POST http://localhost:5000/detect-leak` - Leak detection
- `POST http://localhost:5000/predict-maintenance` - Maintenance prediction

**Error Handling:**
- Returns default response if AI service is unavailable
- 10-20 second timeouts
- Logs errors but doesn't crash backend

### 5. **MQTTService** (`services/mqttService.js`)

**Purpose:** MQTT client connection to broker.

**Configuration:**
- Host: `process.env.MQTT_HOST || 'localhost'`
- Port: `process.env.MQTT_PORT || 1883`
- Topics: `jalrakshak/+/telemetry` (wildcard)

**Resilience:**
- Auto-reconnect on disconnect
- Graceful degradation if MQTT unavailable (dummy client)

### 6. **WhatsAppService** (`services/whatsappService.js`)

**Purpose:** Send WhatsApp notifications for alerts.

**Features:**
- Sends alerts to registered contacts
- Tracks sent status in database
- Integrates with WhatsApp Business API

### 7. **RedisService** (`services/redisService.js`)

**Purpose:** Caching layer for fast data access.

**Usage:**
- Cache latest telemetry (60s TTL)
- Cache dashboard stats
- Session storage (if needed)

---

## 🗄️ Database Schema

### Core Tables

**1. `users`**
- User accounts (admin, supervisor, operator, worker, villager)
- JWT authentication
- WhatsApp opt-in

**2. `villages`**
- Village information (name, district, state, GPS coordinates, population)

**3. `devices`**
- IoT devices (device_id, village_id, device_type, GPS, status, battery_level, last_seen)

**4. `telemetry`**
- Time-series sensor data
- Columns: device_id, timestamp, flow_rate, pressure, turbidity, temperature, GPS, battery_level, pump_status
- Extended parameters: ph, conductivity, tds, do_mg_l, residual_chlorine, orp, ammonium, nitrate, chloride, tss, cod, bod, toc
- Metadata: JSONB for additional data

**5. `anomalies`**
- Detected anomalies (leak, contamination, pump_failure, etc.)
- Severity, confidence, GPS estimate

**6. `alerts`**
- Alert notifications
- Linked to anomalies
- WhatsApp/SMS sent status
- Acknowledgment tracking

**7. `tickets`**
- Maintenance tickets for workers
- Status: open, accepted, in_progress, completed, closed
- Assignment to workers
- Worker notes

**8. `whatsapp_contacts`**
- WhatsApp contact management
- Role-based contact lists
- Verification system

### Indexes

- `idx_telemetry_timestamp` - Fast time-series queries
- `idx_telemetry_device_id` - Device-specific queries
- `idx_telemetry_device_timestamp` - Composite index for device history

---

## ⚡ Real-time Features

### WebSocket Server

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
```

**Subscribe to villages:**
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  villages: ['village-id-1', 'village-id-2']
}));
```

**Receive updates:**
```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.type: 'telemetry', 'alert', etc.
  // data.data: telemetry object
  // data.ai: AI analysis results
};
```

**Broadcast Function:**
- `broadcastUpdate(data)` - Sends update to all connected clients
- Filters by village subscription
- Only sends to clients with `readyState === 1` (OPEN)

---

## 🔒 Security

### Authentication & Authorization

**JWT Tokens:**
- Secret: `process.env.JWT_SECRET`
- Token in `Authorization: Bearer <token>` header
- Middleware: `authenticateToken` (validates token)
- Middleware: `authorizeRole(...roles)` (checks user role)

**Rate Limiting:**
- Write operations: 50 requests per 15 minutes
- Read operations: No limit (for dashboard auto-refresh)
- Applied to: `/api/auth/login`, `/api/auth/register`, `/api/import`, POST/PUT/DELETE requests

**Security Headers:**
- Helmet.js for security headers (XSS protection, content security policy, etc.)

**CORS:**
- Enabled for frontend access
- Configured in `server.js`

---

## 🚀 Deployment

### Environment Variables (`.env`)

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jalrakshak
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret_key

# MQTT
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_USERNAME=optional
MQTT_PASSWORD=optional

# AI Service
AI_SERVICE_URL=http://localhost:5000

# Server
PORT=3000
NODE_ENV=production

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# Logging
LOG_LEVEL=info
```

### Startup Commands

**Development:**
```bash
npm run dev  # Uses nodemon for auto-reload
```

**Production:**
```bash
npm start  # Runs server.js
```

### Database Setup

1. **Create database:**
```sql
CREATE DATABASE jalrakshak;
```

2. **Run schema:**
```bash
psql -U postgres -d jalrakshak -f src/db/init.sql
```

3. **Run migrations:**
```bash
npm run migrate:all
```

4. **Import data (optional):**
```bash
npm run import:csv
```

### Docker Deployment

**Dockerfile:**
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

**docker-compose.yml:**
- Backend service
- PostgreSQL service
- Redis service (optional)
- MQTT broker (Mosquitto)

---

## 📝 Key Features Summary

✅ **IoT Integration:** MQTT protocol for device communication  
✅ **Real-time Updates:** WebSocket for live dashboard updates  
✅ **AI-Powered Analysis:** Integration with Flask AI microservice  
✅ **Automated Alerts:** Anomaly detection → Alerts → Tickets → WhatsApp  
✅ **Worker Management:** Ticket assignment and status tracking  
✅ **Mobile API:** Dedicated endpoints for mobile app  
✅ **Data Import:** Excel/CSV import functionality  
✅ **Caching:** Redis for fast data access  
✅ **Logging:** Winston logger with file and console output  
✅ **Security:** JWT authentication, rate limiting, CORS, Helmet  

---

## 🔄 Data Processing Pipeline

1. **Ingestion:** MQTT messages from IoT devices
2. **Storage:** PostgreSQL (persistent storage)
3. **Caching:** Redis (fast access)
4. **Analysis:** AI Service (anomaly detection)
5. **Alerting:** AlertService → TicketService → WhatsAppService
6. **Distribution:** WebSocket (real-time) + REST API (polling)

---

## 📚 Additional Resources

- **API Documentation:** See `docs/API.md`
- **Deployment Guide:** See `docs/DEPLOYMENT.md`
- **Database Setup:** See `SETUP_DATABASE.md`
- **AI Processing:** See `AI_PROCESSING_GUIDE.md`

---

**Last Updated:** 2024-01-15




