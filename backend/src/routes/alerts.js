const express = require('express');
const alertService = require('../services/alertService');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get alerts (public access)
router.get('/', async (req, res) => {
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
        return res.json([]);
      }
      // For multiple villages, we'll need to filter alerts by village_id
      // For now, get all and filter client-side
      targetVillageId = null;
    }
    
    const filters = {
      village_id: targetVillageId,
      severity: req.query.severity,
      acknowledged: req.query.acknowledged === 'true' ? true : req.query.acknowledged === 'false' ? false : undefined,
      limit: parseInt(req.query.limit) || 100
    };

    logger.info('Fetching alerts with filters:', filters);
    let alerts = await alertService.getAlerts(filters);
    
    // Client-side filtering by district/mandal if needed
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
      
      alerts = alerts.filter(a => {
        const aVillageId = a.village_id || a.villageId;
        return villageIds.some(vid => String(aVillageId) === String(vid));
      });
    }
    
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

