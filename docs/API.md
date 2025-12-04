# API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication

All endpoints (except `/auth/login` and `/auth/register`) require JWT authentication.

Include token in header:
```
Authorization: Bearer <token>
```

## Endpoints

### Authentication

#### POST /auth/register
Register new user

**Request:**
```json
{
  "username": "user123",
  "email": "user@example.com",
  "phone": "+919999999999",
  "password": "password123",
  "role": "operator"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "user": { ... }
}
```

#### POST /auth/login
Login user

**Request:**
```json
{
  "username": "user123",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": { ... }
}
```

### Devices

#### POST /device/register
Register new device (Admin/Supervisor only)

#### GET /device
Get all devices

**Query params:**
- `village_id` (optional)

#### GET /device/:device_id
Get device by ID

### Telemetry

#### POST /telemetry
Submit telemetry data (for HTTP fallback)

**Request:**
```json
{
  "device_id": "ESP32_001",
  "flow_rate": 25.5,
  "pressure": 5.2,
  "turbidity": 3.1,
  "temperature": 28.5,
  "gps_lat": 20.5937,
  "gps_lon": 78.9629,
  "battery_level": 85,
  "pump_status": "on"
}
```

#### GET /telemetry/live
Get live telemetry (last 1 minute)

**Query params:**
- `village_id` (optional)

#### GET /telemetry/:device_id/latest
Get latest telemetry for device

#### GET /telemetry/:device_id/history
Get telemetry history

**Query params:**
- `start_time` (ISO string)
- `end_time` (ISO string)
- `limit` (default: 1000)

### Alerts

#### GET /alerts
Get alerts

**Query params:**
- `village_id` (optional)
- `severity` (optional)
- `acknowledged` (optional: true/false)
- `limit` (default: 100)

#### POST /alerts/:alert_id/acknowledge
Acknowledge alert

### Tickets

#### GET /tickets
Get tickets

**Query params:**
- `village_id` (optional)
- `status` (optional)
- `assigned_to` (optional)
- `limit` (default: 100)

#### POST /tickets/create
Create ticket (Admin/Supervisor/Operator)

#### POST /tickets/:ticket_id/assign
Assign ticket (Admin/Supervisor)

**Request:**
```json
{
  "user_id": "uuid"
}
```

#### POST /tickets/:ticket_id/update-status
Update ticket status

**Request:**
```json
{
  "status": "accepted|in_progress|completed",
  "notes": "Optional notes"
}
```

### GIS

#### GET /gis/pipelines
Get pipeline data

**Query params:**
- `village_id` (optional)

#### GET /gis/sensors
Get sensor locations with latest data

**Query params:**
- `village_id` (optional)

#### GET /gis/villages
Get all villages

### WhatsApp

#### POST /whatsapp/webhook
WhatsApp webhook endpoint

#### GET /whatsapp/webhook
WhatsApp webhook verification

### Contacts

#### GET /contacts
Get all contacts (Admin/Supervisor only)

#### POST /contacts
Add contact (Admin/Supervisor only)

#### POST /contacts/bulk-import
Bulk import contacts (Admin/Supervisor only)

#### PATCH /contacts/:contact_id
Update contact (Admin/Supervisor only)

#### DELETE /contacts/:contact_id
Delete contact (Admin/Supervisor only)

#### POST /contacts/:contact_id/test
Send test message (Admin/Supervisor only)

### Analytics

#### GET /analytics
Get analytics data

**Query params:**
- `metric`: `leakage_trends|water_quality|pressure_flow|pump_performance`
- `village_id` (optional)
- `start_date` (ISO string)
- `end_date` (ISO string)

## WebSocket

### Connection
```
ws://localhost:3000/ws?client_id=<id>
```

### Subscribe to village updates
```json
{
  "type": "subscribe",
  "villages": ["village_id_1", "village_id_2"]
}
```

### Receive updates
```json
{
  "type": "telemetry",
  "data": { ... },
  "ai": { ... },
  "timestamp": "2024-01-01T00:00:00Z"
}
```






