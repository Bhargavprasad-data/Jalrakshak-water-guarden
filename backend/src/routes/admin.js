const express = require('express');
const db = require('../db/connection');
const logger = require('../utils/logger');

const router = express.Router();

// Get admin context (district, mandal, village assignments)
router.get('/context', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await db.query(
      `SELECT 
        id, username, role, admin_role, 
        assigned_district, assigned_mandal, assigned_villages
      FROM users 
      WHERE id = $1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      logger.warn(`Admin context: User not found for user_id: ${user_id}`);
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    
    logger.info(`Admin context for user ${user.username}: admin_role=${user.admin_role}, district=${user.assigned_district}, mandal=${user.assigned_mandal}`);
    
    // Build filter context based on admin role
    let filterContext = {
      admin_role: user.admin_role || null,
      district: null,
      mandal: null,
      village_ids: []
    };

    if (user.admin_role === 'super_admin') {
      // Super admin sees everything - no filters
      filterContext.district = null;
      filterContext.mandal = null;
      filterContext.village_ids = [];
    } else if (user.admin_role === 'district_admin') {
      // District admin sees only their district
      filterContext.district = user.assigned_district;
      filterContext.mandal = null;
      filterContext.village_ids = [];
    } else if (user.admin_role === 'mandal_admin') {
      // Mandal admin sees only their mandal
      filterContext.district = user.assigned_district;
      filterContext.mandal = user.assigned_mandal;
      filterContext.village_ids = [];
    } else if (user.admin_role === 'village_admin') {
      // Village admin sees only their assigned villages
      filterContext.district = user.assigned_district;
      filterContext.mandal = user.assigned_mandal;
      filterContext.village_ids = user.assigned_villages || [];
    } else {
      // No admin role assigned - return empty context
      logger.warn(`User ${user.username} has no admin_role assigned`);
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        admin_role: user.admin_role
      },
      filter_context: filterContext
    });
  } catch (error) {
    logger.error('Get admin context error:', error);
    res.status(500).json({ error: 'Failed to get admin context', message: error.message });
  }
});

// Get all districts (for super admin)
router.get('/districts', async (req, res) => {
  try {
    logger.info('Fetching all districts');
    
    // Check if villages table exists
    const checkTable = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'villages'
      )
    `);
    
    if (!checkTable.rows[0].exists) {
      logger.error('Villages table does not exist');
      return res.status(500).json({ error: 'Villages table does not exist' });
    }

    const result = await db.query(
      `SELECT DISTINCT district, COUNT(*)::INTEGER as village_count
       FROM villages 
       WHERE district IS NOT NULL AND district != ''
       GROUP BY district
       ORDER BY district`
    );
    
    logger.info(`Found ${result.rows.length} districts`);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get districts error:', error);
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to get districts',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get mandals in a district (or all mandals if district not provided)
router.get('/mandals', async (req, res) => {
  try {
    const { district } = req.query;
    
    logger.info(`Fetching mandals${district ? ` for district: ${district}` : ' (all districts)'}`);

    // Check if villages table exists
    const checkTable = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'villages'
      )
    `);
    
    if (!checkTable.rows[0].exists) {
      logger.error('Villages table does not exist');
      return res.status(500).json({ error: 'Villages table does not exist' });
    }

    // Check if mandal column exists
    const checkColumn = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'villages' 
        AND column_name = 'mandal'
      )
    `);
    
    const hasMandalColumn = checkColumn.rows[0].exists;
    
    if (!hasMandalColumn) {
      logger.warn('Mandal column does not exist in villages table. Returning empty array.');
      return res.json([]);
    }

    // Simplified and more robust query to get mandals
    // Try multiple approaches to find mandals data
    
    let result = { rows: [] };
    const params = district ? [district] : [];
    
    // Approach 1: Simple query - get distinct mandals from mandal column
    let query1 = `
      SELECT DISTINCT 
        TRIM(mandal) as mandal,
        COUNT(*)::INTEGER as village_count
      FROM villages 
      WHERE mandal IS NOT NULL AND TRIM(mandal) != ''
    `;
    if (district) {
      query1 += ` AND LOWER(TRIM(district)) = LOWER(TRIM($1))`;
    }
    query1 += ` GROUP BY TRIM(mandal) ORDER BY TRIM(mandal)`;
    
    result = await db.query(query1, params);
    logger.info(`[Mandals API] Query 1 (mandal column): Found ${result.rows.length} mandals`);
    
    // Approach 2: If no results, try metadata
    if (result.rows.length === 0) {
      let query2 = `
        SELECT DISTINCT 
          TRIM(metadata->>'mandal') as mandal,
          COUNT(*)::INTEGER as village_count
        FROM villages
        WHERE metadata IS NOT NULL 
          AND metadata->>'mandal' IS NOT NULL 
          AND TRIM(metadata->>'mandal') != ''
      `;
      if (district) {
        query2 += ` AND LOWER(TRIM(district)) = LOWER(TRIM($1))`;
    }
      query2 += ` GROUP BY TRIM(metadata->>'mandal') ORDER BY TRIM(metadata->>'mandal')`;

      result = await db.query(query2, params);
      logger.info(`[Mandals API] Query 2 (metadata): Found ${result.rows.length} mandals`);
    }
    
    // Approach 3: Combined approach - check both mandal column and metadata
    if (result.rows.length === 0) {
      let query3 = `
        SELECT DISTINCT 
          COALESCE(
            NULLIF(TRIM(mandal), ''),
            NULLIF(TRIM(metadata->>'mandal'), ''),
            NULLIF(TRIM(metadata->>'Mandal'), '')
          ) as mandal,
          COUNT(*)::INTEGER as village_count
        FROM villages
        WHERE (
          (mandal IS NOT NULL AND TRIM(mandal) != '') 
          OR (metadata IS NOT NULL AND metadata->>'mandal' IS NOT NULL AND TRIM(metadata->>'mandal') != '')
          OR (metadata IS NOT NULL AND metadata->>'Mandal' IS NOT NULL AND TRIM(metadata->>'Mandal') != '')
        )
      `;
      if (district) {
        query3 += ` AND LOWER(TRIM(district)) = LOWER(TRIM($1))`;
      }
      query3 += `
        GROUP BY COALESCE(
          NULLIF(TRIM(mandal), ''),
          NULLIF(TRIM(metadata->>'mandal'), ''),
          NULLIF(TRIM(metadata->>'Mandal'), '')
        )
        HAVING COALESCE(
          NULLIF(TRIM(mandal), ''),
          NULLIF(TRIM(metadata->>'mandal'), ''),
          NULLIF(TRIM(metadata->>'Mandal'), '')
        ) IS NOT NULL
        ORDER BY COALESCE(
          NULLIF(TRIM(mandal), ''),
          NULLIF(TRIM(metadata->>'mandal'), ''),
          NULLIF(TRIM(metadata->>'Mandal'), '')
        )
      `;
      
      result = await db.query(query3, params);
      logger.info(`[Mandals API] Query 3 (combined): Found ${result.rows.length} mandals`);
    }
    
    // Debug: Show what data actually exists
    if (result.rows.length === 0) {
      let debugQuery = district
        ? `SELECT district, mandal, metadata->>'mandal' as metadata_mandal, COUNT(*) as count 
           FROM villages 
           WHERE LOWER(TRIM(district)) = LOWER(TRIM($1))
           GROUP BY district, mandal, metadata->>'mandal'
           LIMIT 10`
        : `SELECT district, mandal, metadata->>'mandal' as metadata_mandal, COUNT(*) as count 
           FROM villages 
           GROUP BY district, mandal, metadata->>'mandal'
           LIMIT 20`;
      const debugResult = await db.query(debugQuery, params);
      logger.warn(`[Mandals API] Debug - Sample village data:`, debugResult.rows);
      
      // Also check total counts
      const countQuery = district
        ? `SELECT COUNT(*) as total_villages, 
                  COUNT(DISTINCT district) as districts,
                  COUNT(DISTINCT mandal) as mandals_from_column,
                  COUNT(DISTINCT metadata->>'mandal') as mandals_from_metadata
           FROM villages 
           WHERE LOWER(TRIM(district)) = LOWER(TRIM($1))`
        : `SELECT COUNT(*) as total_villages, 
                  COUNT(DISTINCT district) as districts,
                  COUNT(DISTINCT mandal) as mandals_from_column,
                  COUNT(DISTINCT metadata->>'mandal') as mandals_from_metadata
           FROM villages`;
      const countResult = await db.query(countQuery, params);
      logger.warn(`[Mandals API] Debug - Counts:`, countResult.rows[0]);
    } else {
      logger.info(`[Mandals API] Successfully found ${result.rows.length} mandals${district ? ` for district: ${district}` : ''}`);
      logger.info(`[Mandals API] Sample mandals:`, result.rows.slice(0, 5).map(r => ({ mandal: r.mandal, count: r.village_count })));
    }
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Get mandals error:', error);
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      district: req.query.district
    });
    res.status(500).json({ 
      error: 'Failed to get mandals',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get villages with filters
router.get('/villages', async (req, res) => {
  try {
    const { district, mandal, village_id } = req.query;
    
    logger.info(`Fetching villages with filters:`, { district, mandal, village_id });
    
    // Check if mandal column exists
    const checkColumn = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'villages' 
        AND column_name = 'mandal'
      )
    `);
    
    const hasMandalColumn = checkColumn.rows[0].exists;
    
    let query = `
      SELECT 
        id, name, district, ${hasMandalColumn ? 'mandal' : 'NULL as mandal'}, gps_lat, gps_lon, population
      FROM villages
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (district) {
      query += ` AND district = $${paramCount}`;
      params.push(district);
      paramCount++;
    }

    if (mandal && hasMandalColumn) {
      query += ` AND mandal = $${paramCount}`;
      params.push(mandal);
      paramCount++;
    }

    if (village_id) {
      query += ` AND id = $${paramCount}`;
      params.push(village_id);
      paramCount++;
    }

    query += ` ORDER BY district${hasMandalColumn ? ', mandal' : ''}, name`;

    const result = await db.query(query, params);
    logger.info(`Found ${result.rows.length} villages`);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get villages error:', error);
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      filters: { district: req.query.district, mandal: req.query.mandal, village_id: req.query.village_id }
    });
    res.status(500).json({ 
      error: 'Failed to get villages',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get filtered dashboard stats based on admin level
router.get('/stats', async (req, res) => {
  try {
    const { district, mandal, village_ids } = req.query;
    
    // Build village filter
    let villageFilter = '';
    const params = [];
    let paramCount = 1;

    if (village_ids) {
      const villageIdArray = Array.isArray(village_ids) ? village_ids : village_ids.split(',');
      villageFilter = ` AND d.village_id = ANY($${paramCount}::uuid[])`;
      params.push(villageIdArray);
      paramCount++;
    } else if (district || mandal) {
      // Filter by district/mandal through villages
      let villageSubquery = `
        SELECT id FROM villages WHERE 1=1
      `;
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

      villageFilter = ` AND d.village_id IN (${villageSubquery})`;
      params.push(...villageParams);
      paramCount += villageParams.length;
    }

    // Get device count
    const deviceQuery = `
      SELECT COUNT(*) as count
      FROM devices d
      WHERE 1=1 ${villageFilter}
    `;
    const deviceResult = await db.query(deviceQuery, params);
    const deviceCount = parseInt(deviceResult.rows[0]?.count || 0);

    // Get alert count
    const alertQuery = `
      SELECT COUNT(*) as count
      FROM alerts a
      INNER JOIN devices d ON a.device_id = d.device_id
      WHERE a.acknowledged = false ${villageFilter}
    `;
    const alertResult = await db.query(alertQuery, params);
    const alertCount = parseInt(alertResult.rows[0]?.count || 0);

    // Get ticket count
    const ticketQuery = `
      SELECT COUNT(*) as count
      FROM tickets t
      INNER JOIN devices d ON t.device_id = d.device_id
      WHERE t.status = 'open' ${villageFilter}
    `;
    const ticketResult = await db.query(ticketQuery, params);
    const ticketCount = parseInt(ticketResult.rows[0]?.count || 0);

    res.json({
      total_devices: deviceCount,
      active_alerts: alertCount,
      open_tickets: ticketCount
    });
  } catch (error) {
    logger.error('Get admin stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;

