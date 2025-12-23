const express = require('express');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// Helper function to calculate duration in minutes
function calculateDuration(startTime, endTime) {
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);
  
  // Handle case where end time is next day (e.g., 22:00 to 02:00)
  if (end < start) {
    end.setDate(end.getDate() + 1);
  }
  
  return Math.round((end - start) / (1000 * 60));
}

// Helper function to get day name
function getDayName(dayOfWeek) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || 'Unknown';
}

// GET /api/water-supply-timings/village/:village_id
// Get active water supply timings for a specific village
router.get('/village/:village_id', async (req, res) => {
  try {
    const { village_id } = req.params;
    
    // Check if table exists first
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'water_supply_timings'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      logger.warn('water_supply_timings table does not exist. Please run migration.');
      return res.json([]); // Return empty array instead of error
    }
    
    const result = await db.query(
      `SELECT 
        wst.*,
        v.name as village_name,
        v.district,
        v.state
      FROM water_supply_timings wst
      INNER JOIN villages v ON wst.village_id = v.id
      WHERE wst.village_id = $1 AND wst.is_active = true
      ORDER BY wst.day_of_week, wst.start_time`,
      [village_id]
    );
    
    // Format response with day names
    const timings = result.rows.map(row => ({
      ...row,
      day_name: getDayName(row.day_of_week),
      duration_minutes: row.duration_minutes || calculateDuration(row.start_time, row.end_time)
    }));
    
    res.json(timings);
  } catch (error) {
    logger.error('Get water supply timings error:', error);
    // If table doesn't exist, return empty array
    if (error.message && error.message.includes('does not exist')) {
      return res.json([]);
    }
    res.status(500).json({ error: 'Failed to get water supply timings', message: error.message });
  }
});

// GET /api/water-supply-timings
// Get all water supply timings (optionally filtered by village_id)
router.get('/', async (req, res) => {
  try {
    // Check if table exists first
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'water_supply_timings'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      logger.warn('water_supply_timings table does not exist. Please run migration.');
      return res.json([]); // Return empty array instead of error
    }
    
    const { village_id, is_active } = req.query;
    
    let query = `
      SELECT 
        wst.*,
        v.name as village_name,
        v.district,
        v.state
      FROM water_supply_timings wst
      INNER JOIN villages v ON wst.village_id = v.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;
    
    if (village_id) {
      query += ` AND wst.village_id = $${paramCount}`;
      params.push(village_id);
      paramCount++;
    }
    
    if (is_active !== undefined) {
      query += ` AND wst.is_active = $${paramCount}`;
      params.push(is_active === 'true');
      paramCount++;
    }
    
    query += ` ORDER BY v.name, wst.day_of_week, wst.start_time`;
    
    const result = await db.query(query, params);
    
    // Format response with day names
    const timings = result.rows.map(row => ({
      ...row,
      day_name: getDayName(row.day_of_week),
      duration_minutes: row.duration_minutes || calculateDuration(row.start_time, row.end_time)
    }));
    
    res.json(timings);
  } catch (error) {
    logger.error('Get all water supply timings error:', error);
    // If table doesn't exist, return empty array
    if (error.message && error.message.includes('does not exist')) {
      return res.json([]);
    }
    res.status(500).json({ error: 'Failed to get water supply timings', message: error.message });
  }
});

// POST /api/water-supply-timings
// Create a new water supply timing (admin only)
// Note: authenticateToken middleware is optional - if no token, allow public access for dashboard
router.post('/', async (req, res) => {
  try {
    // Check if table exists first
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'water_supply_timings'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      logger.error('water_supply_timings table does not exist. Please run migration: npm run migrate:all');
      return res.status(500).json({ 
        error: 'Database table not found', 
        message: 'Please run database migration: npm run migrate:all' 
      });
    }
    
    const { village_id, day_of_week, start_time, end_time, notes } = req.body;
    
    // Validation
    if (!village_id || day_of_week === undefined || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields: village_id, day_of_week, start_time, end_time' });
    }
    
    if (day_of_week < 0 || day_of_week > 6) {
      return res.status(400).json({ error: 'day_of_week must be between 0 (Sunday) and 6 (Saturday)' });
    }
    
    // Check for duplicate timings (same village, day, and overlapping times)
    const duplicateCheck = await db.query(
      `SELECT id FROM water_supply_timings 
       WHERE village_id = $1 
       AND day_of_week = $2 
       AND is_active = true
       AND (
         (start_time <= $3 AND end_time > $3) OR
         (start_time < $4 AND end_time >= $4) OR
         (start_time >= $3 AND end_time <= $4)
       )`,
      [village_id, day_of_week, start_time, end_time]
    );
    
    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ error: 'A timing already exists for this village and day with overlapping times' });
    }
    
    // Calculate duration
    const duration_minutes = calculateDuration(start_time, end_time);
    
    // Insert new timing
    const result = await db.query(
      `INSERT INTO water_supply_timings 
       (village_id, day_of_week, start_time, end_time, duration_minutes, notes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [village_id, day_of_week, start_time, end_time, duration_minutes, notes || null]
    );
    
    const timing = result.rows[0];
    const villageResult = await db.query('SELECT name, district, state FROM villages WHERE id = $1', [village_id]);
    const village = villageResult.rows[0];
    
    res.status(201).json({
      ...timing,
      day_name: getDayName(timing.day_of_week),
      village_name: village?.name,
      district: village?.district,
      state: village?.state
    });
  } catch (error) {
    logger.error('Create water supply timing error:', error);
    res.status(500).json({ error: 'Failed to create water supply timing', message: error.message });
  }
});

// PUT /api/water-supply-timings/:id
// Update an existing water supply timing (admin only)
// Note: authenticateToken middleware is optional - if no token, allow public access for dashboard
router.put('/:id', async (req, res) => {
  try {
    // Check if table exists first
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'water_supply_timings'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      logger.error('water_supply_timings table does not exist. Please run migration: npm run migrate:all');
      return res.status(500).json({ 
        error: 'Database table not found', 
        message: 'Please run database migration: npm run migrate:all' 
      });
    }
    
    const { id } = req.params;
    const { village_id, day_of_week, start_time, end_time, duration_minutes, notes, is_active } = req.body;
    
    // Get existing timing
    const existingResult = await db.query('SELECT * FROM water_supply_timings WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Water supply timing not found' });
    }
    
    const existing = existingResult.rows[0];
    
    // Use provided values or existing values
    const finalVillageId = village_id || existing.village_id;
    const finalDayOfWeek = day_of_week !== undefined ? day_of_week : existing.day_of_week;
    const finalStartTime = start_time || existing.start_time;
    const finalEndTime = end_time || existing.end_time;
    const finalNotes = notes !== undefined ? notes : existing.notes;
    const finalIsActive = is_active !== undefined ? is_active : existing.is_active;
    
    // Validate day_of_week if provided
    if (day_of_week !== undefined && (day_of_week < 0 || day_of_week > 6)) {
      return res.status(400).json({ error: 'day_of_week must be between 0 (Sunday) and 6 (Saturday)' });
    }
    
    // Check for duplicate timings if times or day changed (excluding current timing)
    if (start_time || end_time || day_of_week !== undefined) {
      const duplicateCheck = await db.query(
        `SELECT id FROM water_supply_timings 
         WHERE village_id = $1 
         AND day_of_week = $2 
         AND id != $3
         AND is_active = true
         AND (
           (start_time <= $4 AND end_time > $4) OR
           (start_time < $5 AND end_time >= $5) OR
           (start_time >= $4 AND end_time <= $5)
         )`,
        [finalVillageId, finalDayOfWeek, id, finalStartTime, finalEndTime]
      );
      
      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({ error: 'A timing already exists for this village and day with overlapping times' });
      }
    }
    
    // Calculate duration if times changed
    let finalDurationMinutes = duration_minutes;
    if (start_time || end_time) {
      finalDurationMinutes = calculateDuration(finalStartTime, finalEndTime);
    } else if (duration_minutes === undefined) {
      finalDurationMinutes = existing.duration_minutes;
    }
    
    // Update timing
    const result = await db.query(
      `UPDATE water_supply_timings 
       SET village_id = $1,
           day_of_week = $2,
           start_time = $3,
           end_time = $4,
           duration_minutes = $5,
           notes = $6,
           is_active = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [finalVillageId, finalDayOfWeek, finalStartTime, finalEndTime, finalDurationMinutes, finalNotes, finalIsActive, id]
    );
    
    const timing = result.rows[0];
    const villageResult = await db.query('SELECT name, district, state FROM villages WHERE id = $1', [finalVillageId]);
    const village = villageResult.rows[0];
    
    res.json({
      ...timing,
      day_name: getDayName(timing.day_of_week),
      village_name: village?.name,
      district: village?.district,
      state: village?.state
    });
  } catch (error) {
    logger.error('Update water supply timing error:', error);
    res.status(500).json({ error: 'Failed to update water supply timing', message: error.message });
  }
});

// DELETE /api/water-supply-timings/:id
// Soft delete a water supply timing (set is_active to false) (admin only)
// Note: authenticateToken middleware is optional - if no token, allow public access for dashboard
router.delete('/:id', async (req, res) => {
  try {
    // Check if table exists first
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'water_supply_timings'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      logger.error('water_supply_timings table does not exist. Please run migration: npm run migrate:all');
      return res.status(500).json({ 
        error: 'Database table not found', 
        message: 'Please run database migration: npm run migrate:all' 
      });
    }
    
    const { id } = req.params;
    
    const result = await db.query(
      `UPDATE water_supply_timings 
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Water supply timing not found' });
    }
    
    res.json({ message: 'Water supply timing deleted (soft delete)', timing: result.rows[0] });
  } catch (error) {
    logger.error('Delete water supply timing error:', error);
    res.status(500).json({ error: 'Failed to delete water supply timing', message: error.message });
  }
});

module.exports = router;

