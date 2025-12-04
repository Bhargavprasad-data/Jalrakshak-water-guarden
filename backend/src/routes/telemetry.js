const express = require('express');
const telemetryService = require('../services/telemetryService');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Submit telemetry (for HTTP fallback)
router.post('/', async (req, res) => {
  try {
    const telemetry = await telemetryService.storeTelemetry(req.body);
    res.status(201).json({ message: 'Telemetry stored', telemetry });
  } catch (error) {
    logger.error('Telemetry storage error:', error);
    res.status(500).json({ error: 'Failed to store telemetry' });
  }
});

// Get live telemetry (public access)
router.get('/live', async (req, res) => {
  try {
    const { village_id } = req.query;
    const telemetry = await telemetryService.getAllLiveTelemetry(village_id);
    res.json(telemetry);
  } catch (error) {
    logger.error('Get live telemetry error:', error);
    res.status(500).json({ error: 'Failed to get live telemetry' });
  }
});

// Get dashboard statistics (public access) - must be before /:device_id routes
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await telemetryService.getDashboardStats();
    res.json(stats);
  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard statistics' });
  }
});

// Get latest telemetry for device (public access)
router.get('/:device_id/latest', async (req, res) => {
  try {
    const telemetry = await telemetryService.getLatestTelemetry(req.params.device_id);
    if (!telemetry) {
      return res.status(404).json({ error: 'No telemetry found' });
    }
    res.json(telemetry);
  } catch (error) {
    logger.error('Get latest telemetry error:', error);
    res.status(500).json({ error: 'Failed to get latest telemetry' });
  }
});

// Get telemetry history (public access)
router.get('/:device_id/history', async (req, res) => {
  try {
    const { start_time, end_time, limit } = req.query;
    const startTime = start_time || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const endTime = end_time || new Date().toISOString();
    const limitNum = parseInt(limit) || 1000;

    const telemetry = await telemetryService.getTelemetryHistory(
      req.params.device_id,
      startTime,
      endTime,
      limitNum
    );

    res.json(telemetry);
  } catch (error) {
    logger.error('Get telemetry history error:', error);
    res.status(500).json({ error: 'Failed to get telemetry history' });
  }
});

module.exports = router;

