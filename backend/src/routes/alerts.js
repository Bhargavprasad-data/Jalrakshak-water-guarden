const express = require('express');
const alertService = require('../services/alertService');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get alerts (public access)
router.get('/', async (req, res) => {
  try {
    const filters = {
      village_id: req.query.village_id,
      severity: req.query.severity,
      acknowledged: req.query.acknowledged === 'true' ? true : req.query.acknowledged === 'false' ? false : undefined,
      limit: parseInt(req.query.limit) || 100
    };

    logger.info('Fetching alerts with filters:', filters);
    const alerts = await alertService.getAlerts(filters);
    logger.info(`Returning ${alerts.length} alerts`);
    res.json(alerts);
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to get alerts', message: error.message });
  }
});

// Acknowledge alert (public access - no user ID required)
router.post('/:alert_id/acknowledge', async (req, res) => {
  try {
    const alert = await alertService.acknowledgeAlert(req.params.alert_id, null);
    res.json({ message: 'Alert acknowledged', alert });
  } catch (error) {
    logger.error('Acknowledge alert error:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

module.exports = router;

