const express = require('express');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get pipelines (public access)
router.get('/pipelines', async (req, res) => {
  try {
    const { village_id, district, mandal } = req.query;
    
    logger.info('Get pipelines request:', { village_id, district, mandal });
    
    // Check if pipelines table exists
    const checkTable = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'pipelines'
      )
    `);
    
    if (!checkTable.rows[0].exists) {
      logger.warn('Pipelines table does not exist');
      return res.json([]); // Return empty array instead of error
    }
    
    let query = 'SELECT p.*, v.district FROM pipelines p LEFT JOIN villages v ON p.village_id = v.id WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (village_id) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(village_id)) {
        logger.warn('Invalid village_id format:', village_id);
        return res.status(400).json({ error: 'Invalid village_id format' });
      }
      query += ` AND p.village_id = $${paramCount}::uuid`;
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
      
      // Note: mandal column may not exist - check if column exists before using it
      // For now, skip mandal filtering in pipelines query to avoid errors
      // TODO: Add proper column existence check or ensure migration is run
      
      query += ` AND p.village_id IN (${villageSubquery})`;
      params.push(...villageParams);
      paramCount += villageParams.length;
    }

    logger.info('Executing pipelines query with params:', { paramCount: params.length, village_id: village_id || 'none' });
    const result = await db.query(query, params);
    
    // Remove district from pipeline objects (they're from join)
    const pipelines = result.rows.map(row => {
      const { district, ...pipeline } = row;
      return pipeline;
    });
    
    logger.info(`Returning ${pipelines.length} pipelines`);
    res.json(pipelines);
  } catch (error) {
    logger.error('Get pipelines error:', error);
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      query: req.query
    });
    res.status(500).json({ 
      error: 'Failed to get pipelines',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get sensors with latest telemetry (public access)
router.get('/sensors', async (req, res) => {
  try {
    const { village_id, district, mandal } = req.query;
    
    logger.info('Get sensors request:', { village_id, district, mandal });
    
    // Check if required tables exist
    const checkTables = await db.query(`
      SELECT 
        EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telemetry') as telemetry_exists,
        EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'devices') as devices_exists,
        EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'villages') as villages_exists
    `);
    
    const { telemetry_exists, devices_exists, villages_exists } = checkTables.rows[0];
    
    if (!telemetry_exists || !devices_exists || !villages_exists) {
      logger.warn('Required tables missing:', { telemetry_exists, devices_exists, villages_exists });
      return res.json([]); // Return empty array instead of error
    }
    
    let query = `
      SELECT DISTINCT ON (t.device_id)
        d.*,
        v.name as village_name,
        v.id as village_id,
        v.district,
        v.gps_lat as village_gps_lat,
        v.gps_lon as village_gps_lon,
        t.ph, t.flow_rate, t.pressure, t.turbidity, t.temperature, t.battery_level, t.pump_status,
        t.timestamp as last_update,
        -- Prioritize device coordinates over telemetry coordinates (more reliable)
        COALESCE(d.gps_lat, t.gps_lat, v.gps_lat) as gps_lat,
        COALESCE(d.gps_lon, t.gps_lon, v.gps_lon) as gps_lon,
        CASE 
          WHEN t.timestamp > NOW() - INTERVAL '1 minute' THEN 'online'
          WHEN t.timestamp > NOW() - INTERVAL '10 minutes' THEN 'warning'
          ELSE 'offline'
        END as connection_status
      FROM telemetry t
      LEFT JOIN devices d ON t.device_id = d.device_id
      LEFT JOIN villages v ON d.village_id = v.id
      WHERE t.device_id IS NOT NULL
    `;
    const params = [];
    let paramCount = 1;

    if (village_id) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(village_id)) {
        logger.warn('Invalid village_id format:', village_id);
        return res.status(400).json({ error: 'Invalid village_id format' });
      }
      // Strict filtering: only include devices that belong to the specified village
      // Also ensure device exists and has village_id set
      query += ` AND d.village_id = $${paramCount}::uuid AND d.village_id IS NOT NULL`;
      params.push(village_id);
      paramCount++;
    } else if (district || mandal) {
      // Filter by district/mandal through villages
      query += ` AND d.village_id IS NOT NULL`;
      if (district) {
        query += ` AND v.district = $${paramCount}`;
        params.push(district);
        paramCount++;
      }
      // Note: mandal column may not exist in villages table
      // If mandal filtering is needed, check if column exists first
      // For now, we'll skip mandal filtering to avoid errors
    } else {
      // If no filters, still exclude devices without village assignment
      query += ` AND d.village_id IS NOT NULL`;
    }

    // Get latest telemetry for each device, ordered by device_id and timestamp DESC
    query += ` ORDER BY t.device_id, t.timestamp DESC`;

    logger.info('Executing sensors query:', { query: query.substring(0, 200) + '...', params });
    const result = await db.query(query, params);
    
    // Ensure village_name is populated for all sensors and convert coordinates to numbers
    const sensorsWithVillage = result.rows.map(sensor => {
      // GPS coordinates are already handled by COALESCE in query
      // Convert DECIMAL coordinates to numbers (PostgreSQL returns them as strings)
      if (sensor.gps_lat !== null && sensor.gps_lat !== undefined) {
        sensor.gps_lat = parseFloat(sensor.gps_lat);
      }
      if (sensor.gps_lon !== null && sensor.gps_lon !== undefined) {
        sensor.gps_lon = parseFloat(sensor.gps_lon);
      }
      
      // Convert village coordinates to numbers
      if (sensor.village_gps_lat !== null && sensor.village_gps_lat !== undefined) {
        sensor.village_gps_lat = parseFloat(sensor.village_gps_lat);
      }
      if (sensor.village_gps_lon !== null && sensor.village_gps_lon !== undefined) {
        sensor.village_gps_lon = parseFloat(sensor.village_gps_lon);
      }
      
      // Ensure village_name is set
      if (!sensor.village_name && sensor.village_id) {
        // Will be populated by JOIN, but ensure it's there
        sensor.village_name = sensor.village_name || 'Unknown';
      }
      return sensor;
    });
    
    logger.info(`Returning ${sensorsWithVillage.length} sensors`);
    res.json(sensorsWithVillage);
  } catch (error) {
    logger.error('Get sensors error:', error);
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      query: req.query
    });
    res.status(500).json({ 
      error: 'Failed to get sensors',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get villages (public access) - only villages that have telemetry data
router.get('/villages', async (req, res) => {
  try {
    // Only return villages that have actual telemetry data (from CSV dataset)
    const result = await db.query(`
      SELECT DISTINCT v.*
      FROM villages v
      INNER JOIN devices d ON d.village_id = v.id
      INNER JOIN telemetry t ON t.device_id = d.device_id
      ORDER BY v.name
    `);
    
    // Convert DECIMAL coordinates to numbers
    const villages = result.rows.map(village => {
      if (village.gps_lat !== null && village.gps_lat !== undefined) {
        village.gps_lat = parseFloat(village.gps_lat);
      }
      if (village.gps_lon !== null && village.gps_lon !== undefined) {
        village.gps_lon = parseFloat(village.gps_lon);
      }
      return village;
    });
    
    res.json(villages);
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

