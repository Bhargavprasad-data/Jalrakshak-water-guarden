const express = require('express');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// Get all mobile-app users (villagers) - public access, no authentication required
router.get('/', async (req, res) => {
  try {
    const { role } = req.query;
    
    let query = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.phone
      FROM users u
      WHERE u.role NOT IN ('admin', 'supervisor', 'worker')
      ORDER BY u.created_at DESC
    `;
    
    logger.info('Fetching mobile-app users (excluding admin, supervisor, worker roles)');
    const result = await db.query(query);
    logger.info(`Found ${result.rows.length} mobile-app users`);
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get current user (for profile display)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.phone,
        u.role,
        u.whatsapp_opt_in,
        u.verified,
        u.assigned_villages,
        u.created_at,
        u.updated_at,
        u.metadata
      FROM users u
      WHERE u.id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Get village names if assigned
    if (user.assigned_villages && user.assigned_villages.length > 0) {
      const villageResult = await db.query(
        `SELECT id, name, district FROM villages WHERE id = ANY($1::uuid[])`,
        [user.assigned_villages]
      );
      user.villages = villageResult.rows;
    } else {
      user.villages = [];
    }
    
    res.json(user);
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

module.exports = router;


