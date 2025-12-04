const express = require('express');
const dataProcessorService = require('../services/dataProcessorService');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Process existing telemetry data through AI (Public access for automatic processing)
router.post('/process', async (req, res) => {
  try {
    const { limit = 100, process_all = false } = req.body;
    
    let result;
    if (process_all) {
      logger.info('Processing all unprocessed telemetry data...');
      result = await dataProcessorService.processAllTelemetryData(limit);
    } else {
      logger.info(`Processing ${limit} telemetry records...`);
      result = await dataProcessorService.processTelemetryData(null, limit);
    }
    
    res.json({
      success: true,
      message: 'Telemetry data processed successfully',
      ...result
    });
  } catch (error) {
    logger.error('Data processing error:', error);
    res.status(500).json({ 
      error: 'Failed to process telemetry data',
      message: error.message 
    });
  }
});

// Process specific telemetry record
router.post('/process/:telemetryId', authenticateToken, async (req, res) => {
  try {
    const { telemetryId } = req.params;
    const result = await dataProcessorService.processTelemetryData(telemetryId, 1);
    
    res.json({
      success: true,
      message: 'Telemetry record processed successfully',
      ...result
    });
  } catch (error) {
    logger.error('Data processing error:', error);
    res.status(500).json({ 
      error: 'Failed to process telemetry record',
      message: error.message 
    });
  }
});

module.exports = router;



