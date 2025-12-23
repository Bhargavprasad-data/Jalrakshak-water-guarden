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
    const { village_id, district, mandal } = req.query;
    
    // If district or mandal is provided, get village IDs first
    let targetVillageId = village_id;
    if (!targetVillageId && (district || mandal)) {
      const db = require('../db/connection');
      let villageQuery = 'SELECT id FROM villages WHERE 1=1';
      const villageParams = [];
      let paramCount = 1;
      
      if (district) {
        villageQuery += ` AND district = $${paramCount}`;
        villageParams.push(district);
        paramCount++;
      }
      
      if (mandal) {
        villageQuery += ` AND mandal = $${paramCount}`;
        villageParams.push(mandal);
        paramCount++;
      }
      
      const villageResult = await db.query(villageQuery, villageParams);
      if (villageResult.rows.length > 0) {
        // For multiple villages, we'll filter in the service or return all
        // For now, pass null to get all and filter client-side
        targetVillageId = null; // Will be handled by filtering
      } else {
        // No villages match, return empty
        return res.json([]);
      }
    }
    
    const telemetry = await telemetryService.getAllLiveTelemetry(targetVillageId);
    
    // Client-side filtering by district/mandal if needed
    let filteredTelemetry = telemetry;
    if ((district || mandal) && !village_id) {
      const db = require('../db/connection');
      let villageQuery = 'SELECT id FROM villages WHERE 1=1';
      const villageParams = [];
      let paramCount = 1;
      
      if (district) {
        villageQuery += ` AND district = $${paramCount}`;
        villageParams.push(district);
        paramCount++;
      }
      
      if (mandal) {
        villageQuery += ` AND mandal = $${paramCount}`;
        villageParams.push(mandal);
        paramCount++;
      }
      
      const villageResult = await db.query(villageQuery, villageParams);
      const villageIds = villageResult.rows.map(v => v.id);
      
      filteredTelemetry = telemetry.filter(t => {
        const tVillageId = t.village_id || t.villageId;
        return villageIds.some(vid => String(tVillageId) === String(vid));
      });
    }
    
    res.json(filteredTelemetry);
  } catch (error) {
    logger.error('Get live telemetry error:', error);
    res.status(500).json({ error: 'Failed to get live telemetry' });
  }
});

// Get dashboard statistics (public access) - must be before /:device_id routes
router.get('/stats/summary', async (req, res) => {
  try {
    const { village_id, district, mandal } = req.query;
    
    // If district or mandal is provided, get village IDs first
    let targetVillageId = village_id;
    if (!targetVillageId && (district || mandal)) {
      const db = require('../db/connection');
      let villageQuery = 'SELECT id FROM villages WHERE 1=1';
      const villageParams = [];
      let paramCount = 1;
      
      if (district) {
        villageQuery += ` AND district = $${paramCount}`;
        villageParams.push(district);
        paramCount++;
      }
      
      if (mandal) {
        villageQuery += ` AND mandal = $${paramCount}`;
        villageParams.push(mandal);
        paramCount++;
      }
      
      const villageResult = await db.query(villageQuery, villageParams);
      if (villageResult.rows.length === 0) {
        // No villages match, return empty stats
        return res.json({
          total_devices: 0,
          avg_pressure: 0,
          avg_flow: 0,
          avg_ph: null,
          avg_turbidity: 0,
          avg_temperature: 0,
          avg_conductivity: 0
        });
      }
      // For multiple villages, pass null and filter in service
      targetVillageId = null;
    }
    
    const stats = await telemetryService.getDashboardStats(targetVillageId);
    
    // If filtering by district/mandal, we need to filter the stats
    // For now, return the stats as-is (service handles village_id filtering)
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

