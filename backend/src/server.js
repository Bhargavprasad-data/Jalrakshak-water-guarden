require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mqtt = require('mqtt');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const db = require('./db/connection');
const logger = require('./utils/logger');
const mqttClient = require('./services/mqttService');
const telemetryService = require('./services/telemetryService');
const aiService = require('./services/aiService');

// Routes
const deviceRoutes = require('./routes/device');
const telemetryRoutes = require('./routes/telemetry');
const alertRoutes = require('./routes/alerts');
const ticketRoutes = require('./routes/tickets');
const gisRoutes = require('./routes/gis');
const complaintRoutes = require('./routes/complaints');
const analyticsRoutes = require('./routes/analytics');
const aiRoutes = require('./routes/ai');
const whatsappRoutes = require('./routes/whatsapp');
const contactRoutes = require('./routes/contacts');
const reportRoutes = require('./routes/reports');
const authRoutes = require('./routes/auth');
const importRoutes = require('./routes/import');
const dataProcessorRoutes = require('./routes/dataProcessor');
const dynamicStatsRoutes = require('./routes/dynamicStats');
const mobileRoutes = require('./routes/mobile');

const app = express();
const server = createServer(app);

// WebSocket Server for real-time updates
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploads (complaint photos, etc.)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Rate limiting - only for write operations, no limit for read operations
// This allows dashboard auto-refresh to work without hitting rate limits

// Stricter limiter for write operations (login, POST requests)
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: 'Too many write requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply strict limiter to write operations only
app.use('/api/auth/login', writeLimiter);
app.use('/api/auth/register', writeLimiter);
app.use('/api/import', writeLimiter); // Excel/CSV import is a write operation

// No rate limiting for GET requests (read operations)
// This allows dashboard, analytics, and other read endpoints to refresh freely
app.use('/api/telemetry', (req, res, next) => {
  if (req.method === 'POST') {
    writeLimiter(req, res, next);
  } else {
    next(); // No rate limit for GET requests
  }
});

// Apply rate limiting only to other write endpoints
app.use('/api/', (req, res, next) => {
  // Skip rate limiting for all GET requests (read operations)
  if (req.method === 'GET') {
    return next();
  }
  // Apply limiter only for POST/PUT/DELETE requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    writeLimiter(req, res, next);
  } else {
    next();
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/gis', gisRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/import', importRoutes);
app.use('/api/process', dataProcessorRoutes);
app.use('/api/dynamic-stats', dynamicStatsRoutes);
app.use('/api/mobile', mobileRoutes);

// WebSocket connection handling
const clients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = req.url.split('?')[1]?.split('=')[1] || `client_${Date.now()}`;
  clients.set(clientId, ws);
  logger.info(`WebSocket client connected: ${clientId}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'subscribe') {
        ws.villages = data.villages || [];
        ws.send(JSON.stringify({ type: 'subscribed', villages: ws.villages }));
      }
    } catch (error) {
      logger.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    logger.info(`WebSocket client disconnected: ${clientId}`);
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
});

// Broadcast function for real-time updates
function broadcastUpdate(data) {
  const message = JSON.stringify(data);
  clients.forEach((client, clientId) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      // Filter by village if client has subscribed to specific villages
      if (!client.villages || client.villages.length === 0 || 
          client.villages.includes(data.village)) {
        client.send(message);
      }
    }
  });
}

// Store broadcast function globally
global.broadcastUpdate = broadcastUpdate;

// MQTT message handler
mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    logger.info(`MQTT message received from ${topic}:`, data);

    // Store telemetry
    const telemetry = await telemetryService.storeTelemetry(data);
    
    // Send to AI service for analysis with all parameters
    const aiResult = await aiService.analyzeTelemetry({
      ...telemetry,
      ph: data.ph || telemetry.ph,
      conductivity: data.conductivity || telemetry.conductivity,
      tds: data.tds || telemetry.tds,
      do_mg_l: data.do_mg_l || telemetry.do_mg_l,
      temperature: data.temperature || telemetry.temperature,
      turbidity: data.turbidity || telemetry.turbidity
    });
    
    // Broadcast real-time update
    broadcastUpdate({
      type: 'telemetry',
      data: telemetry,
      ai: aiResult,
      timestamp: new Date().toISOString()
    });

    // Attach water quality info if available
    if (aiResult.water_quality) {
      await telemetryService.attachWaterQuality(telemetry.id, aiResult.water_quality);
      telemetry.metadata = {
        ...(telemetry.metadata || {}),
        water_quality: aiResult.water_quality
      };
    }

    // If anomaly detected, create alert and ticket
    if (aiResult.anomaly_detected) {
      const gpsEstimate = aiResult.gps_estimate || {};
      const alert = await require('./services/alertService').createAlert({
        device_id: data.device_id,
        type: aiResult.anomaly_type,
        severity: aiResult.severity,
        confidence: aiResult.confidence,
        gps_lat: gpsEstimate.lat || data.gps_lat,
        gps_lon: gpsEstimate.lon || data.gps_lon,
        description: aiResult.description
      });

      // Send WhatsApp alert
      await require('./services/whatsappService').sendAlert(alert);
    }
  } catch (error) {
    logger.error('Error processing MQTT message:', error);
  }
});

// Initialize database connection
db.connect()
  .then(() => {
    logger.info('Database connected successfully');
    
    // Start server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`WebSocket server running on ws://localhost:${PORT}/ws`);
      logger.info(`API available at http://localhost:${PORT}/api`);
    });
  })
  .catch((error) => {
    logger.error('Database connection failed:', error);
    logger.error('Error details:', error.message);
    logger.error('Make sure PostgreSQL is running and credentials are correct in .env file');
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    db.disconnect();
    mqttClient.end();
    process.exit(0);
  });
});

module.exports = app;

