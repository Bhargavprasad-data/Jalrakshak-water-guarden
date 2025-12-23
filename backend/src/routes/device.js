const express = require('express');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// Register device
router.post('/register', authenticateToken, authorizeRole('admin', 'supervisor'), async (req, res) => {
  try {
    const {
      device_id,
      village_id,
      device_type,
      gps_lat,
      gps_lon,
      metadata
    } = req.body;

    const result = await db.query(
      `INSERT INTO devices (device_id, village_id, device_type, gps_lat, gps_lon, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (device_id) 
       DO UPDATE SET village_id = $2, device_type = $3, gps_lat = $4, gps_lon = $5, metadata = $6, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [device_id, village_id, device_type, gps_lat, gps_lon, JSON.stringify(metadata || {})]
    );

    res.status(201).json({ message: 'Device registered', device: result.rows[0] });
  } catch (error) {
    logger.error('Device registration error:', error);
    res.status(500).json({ error: 'Device registration failed' });
  }
});

// Get all devices (public access)
router.get('/', async (req, res) => {
  try {
    const { village_id, district, mandal } = req.query;
    
    let query = 'SELECT d.*, v.district, v.mandal FROM devices d LEFT JOIN villages v ON d.village_id = v.id WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (village_id) {
      query += ` AND d.village_id = $${paramCount}`;
      params.push(village_id);
      paramCount++;
    } else if (district || mandal) {
      // Filter by district/mandal through villages
      let villageSubquery = 'SELECT id FROM villages WHERE 1=1';
      const villageParams = [];
      let villageParamCount = 1;
      
      if (district) {
        villageSubquery += ` AND district = $${villageParamCount}`;
        villageParams.push(district);
        villageParamCount++;
      }
      
      if (mandal) {
        villageSubquery += ` AND mandal = $${villageParamCount}`;
        villageParams.push(mandal);
        villageParamCount++;
      }
      
      query += ` AND d.village_id IN (${villageSubquery})`;
      params.push(...villageParams);
      paramCount += villageParams.length;
    }

    query += ' ORDER BY d.created_at DESC';

    const result = await db.query(query, params);
    
    // Remove district/mandal from device objects (they're from join)
    const devices = result.rows.map(row => {
      const { district, mandal, ...device } = row;
      return device;
    });
    
    res.json(devices);
  } catch (error) {
    logger.error('Get devices error:', error);
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

// Get device by ID (public access)
router.get('/:device_id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM devices WHERE device_id = $1',
      [req.params.device_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get device error:', error);
    res.status(500).json({ error: 'Failed to get device' });
  }
});

// Update device status
router.patch('/:device_id/status', authenticateToken, authorizeRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { status } = req.body;

    const result = await db.query(
      'UPDATE devices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE device_id = $2 RETURNING *',
      [status, req.params.device_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ message: 'Device status updated', device: result.rows[0] });
  } catch (error) {
    logger.error('Update device status error:', error);
    res.status(500).json({ error: 'Failed to update device status' });
  }
});

module.exports = router;

