# AI-Based Issue Detection & WhatsApp Notifications Guide

## Overview

The JalRakshak system now automatically:
1. **Analyzes telemetry data** using AI to detect issues (leaks, contamination, pressure anomalies, etc.)
2. **Creates alerts** when issues are detected
3. **Creates tickets** automatically for high/critical severity issues
4. **Sends WhatsApp notifications** to relevant contacts when alerts and tickets are created

## How It Works

### Automatic Processing (Real-time)
- When new telemetry data arrives via MQTT, it's automatically:
  1. Stored in the database
  2. Sent to AI service for analysis
  3. If anomalies detected → Alert created → Ticket created (if high/critical) → WhatsApp sent

### Manual Processing (Existing Data)
- For existing CSV/imported data, you can process it through AI using:

#### Option 1: API Endpoint (Requires Authentication)
```bash
POST /api/process/process
Content-Type: application/json
Authorization: Bearer <your-token>

{
  "limit": 100,        // Process 100 records at a time
  "process_all": false // Set to true to process all unprocessed data
}
```

#### Option 2: Command Line Script
```bash
# Process 100 records (default)
npm run process-data

# Process all unprocessed data
npm run process-all

# Process specific number of records
node src/scripts/processTelemetryData.js --limit=500
```

## Flow Diagram

```
Telemetry Data
    ↓
AI Analysis (anomaly_detected?)
    ↓ YES
Create Alert
    ↓
Severity = high/critical?
    ↓ YES
Create Ticket
    ↓
Send WhatsApp to Contacts
    ↓
Display on Dashboard (Alerts & Tickets pages)
```

## WhatsApp Notifications

### Alert Notifications
- Sent to all contacts with `whatsapp_opt_in = true`
- Village-specific: Contacts assigned to the device's village
- Global: Contacts with no village assignment (receive all alerts)

### Ticket Notifications
- Sent when tickets are created (high/critical severity)
- Includes:
  - Ticket ID
  - Issue Type
  - Severity
  - Device ID
  - Location (GPS link)
  - Description

## Configuration

### WhatsApp Setup
Ensure these environment variables are set:
```env
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
```

### AI Service
Ensure AI service is running:
```env
AI_SERVICE_URL=http://localhost:5000
```

### Contacts Setup
1. Add contacts via `/api/contacts` endpoint
2. Set `whatsapp_opt_in = true`
3. Assign villages (empty array = global, receives all alerts)

## Testing

1. **Process existing data:**
   ```bash
   npm run process-data
   ```

2. **Check alerts:**
   - Visit `/api/alerts` or Dashboard → Alerts page

3. **Check tickets:**
   - Visit `/api/tickets` or Dashboard → Tickets page

4. **Verify WhatsApp:**
   - Check WhatsApp messages sent to contacts
   - Check logs: `backend/logs/combined.log`

## Troubleshooting

### No alerts/tickets created
- Check AI service is running: `curl http://localhost:5000/health`
- Check telemetry data exists: `SELECT COUNT(*) FROM telemetry`
- Check logs for errors: `tail -f backend/logs/error.log`

### WhatsApp not sending
- Verify environment variables are set
- Check contact has `whatsapp_opt_in = true`
- Check WhatsApp API credentials are valid
- Review logs for WhatsApp errors

### Processing too slow
- Reduce batch size: `--limit=50`
- Process in smaller batches
- Check AI service response time

## API Endpoints

- `POST /api/process/process` - Process telemetry data
- `POST /api/process/process/:telemetryId` - Process specific record
- `GET /api/alerts` - Get all alerts
- `GET /api/tickets` - Get all tickets

## Notes

- Processing is idempotent (won't create duplicate alerts for same data)
- Only unprocessed telemetry is analyzed
- High/critical severity automatically creates tickets
- WhatsApp notifications are sent asynchronously (won't block processing)



