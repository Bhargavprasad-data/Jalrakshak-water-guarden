const express = require('express');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get pipelines (public access)
router.get('/pipelines', async (req, res) => {
  try {
    const { village_id } = req.query;
    let query = 'SELECT * FROM pipelines WHERE 1=1';
    const params = [];

    if (village_id) {
      query += ' AND village_id = $1';
      params.push(village_id);
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get pipelines error:', error);
    res.status(500).json({ error: 'Failed to get pipelines' });
  }
});

// Get sensors with latest telemetry (public access)
router.get('/sensors', async (req, res) => {
  try {
    const { village_id } = req.query;
    let query = `
      SELECT 
        d.*,
        v.name as village_name,
        t.ph, t.flow_rate, t.pressure, t.turbidity, t.temperature, t.battery_level, t.pump_status,
        t.timestamp as last_update,
        CASE 
          WHEN t.timestamp > NOW() - INTERVAL '1 minute' THEN 'online'
          WHEN t.timestamp > NOW() - INTERVAL '10 minutes' THEN 'warning'
          ELSE 'offline'
        END as connection_status
      FROM devices d
      LEFT JOIN villages v ON d.village_id = v.id
      LEFT JOIN LATERAL (
        SELECT * FROM telemetry 
        WHERE device_id = d.device_id 
        ORDER BY timestamp DESC 
        LIMIT 1
      ) t ON true
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (village_id) {
      query += ` AND d.village_id = $${paramCount}`;
      params.push(village_id);
      paramCount++;
    }

    query += ' ORDER BY d.device_type, d.device_id';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get sensors error:', error);
    res.status(500).json({ error: 'Failed to get sensors' });
  }
});

// Get villages (public access)
router.get('/villages', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM villages ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    logger.error('Get villages error:', error);
    res.status(500).json({ error: 'Failed to get villages' });
  }
});

// Create/Update pipeline
router.post('/pipelines', authenticateToken, async (req, res) => {
  try {
    const { village_id, pipeline_name, pipeline_type, geometry, diameter_mm, material } = req.body;

    const result = await db.query(
      `INSERT INTO pipelines (village_id, pipeline_name, pipeline_type, geometry, diameter_mm, material)
       VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4), $5, $6)
       RETURNING *`,
      [village_id, pipeline_name, pipeline_type, JSON.stringify(geometry), diameter_mm, material]
    );

    res.status(201).json({ message: 'Pipeline created', pipeline: result.rows[0] });
  } catch (error) {
    logger.error('Create pipeline error:', error);
    res.status(500).json({ error: 'Failed to create pipeline' });
  }
});

module.exports = router;

