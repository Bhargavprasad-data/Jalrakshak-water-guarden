const express = require('express');
const dynamicAlertService = require('../services/dynamicAlertService');
const logger = require('../utils/logger');

const router = express.Router();

// Get dynamic alert and ticket counts based on current telemetry data
router.get('/alerts-tickets', async (req, res) => {
  try {
    const { village_id } = req.query;
    const counts = await dynamicAlertService.getDynamicAlertTicketCounts(village_id);
    res.json(counts);
  } catch (error) {
    logger.error('Get dynamic stats error:', error);
    res.status(500).json({ error: 'Failed to get dynamic stats', message: error.message });
  }
});

module.exports = router;

