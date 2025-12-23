const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();
const DEFAULT_PASSWORD = 'Worker@123';

// Get all workers (admin/supervisor only)
router.get('/', authenticateToken, authorizeRole('admin', 'supervisor'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        u.id,
        u.username,
        u.phone,
        u.role,
        u.assigned_villages,
        u.created_at,
        u.updated_at,
        jsonb_build_object(
          'name', u.metadata->>'name',
          'district', u.metadata->>'district',
          'mandal', u.metadata->>'mandal'
        ) as metadata
      FROM users u
      WHERE u.role = 'worker'
      ORDER BY u.created_at DESC
    `);
    
    // Get village names for each worker
    const workers = await Promise.all(result.rows.map(async (worker) => {
      if (worker.assigned_villages && worker.assigned_villages.length > 0) {
        const villageResult = await db.query(
          `SELECT id, name, district FROM villages WHERE id = ANY($1::uuid[])`,
          [worker.assigned_villages]
        );
        return {
          ...worker,
          villages: villageResult.rows
        };
      }
      return {
        ...worker,
        villages: []
      };
    }));
    
    res.json(workers);
  } catch (error) {
    logger.error('Get workers error:', error);
    res.status(500).json({ error: 'Failed to get workers' });
  }
});

// Create worker (admin/supervisor only)
router.post('/', authenticateToken, authorizeRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { name, phone, district, mandal, village_id, password } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }
    
    if (!village_id) {
      return res.status(400).json({ error: 'Village selection is required' });
    }
    
    // Generate username from phone (remove + and spaces)
    const username = phone.replace(/[\s\+]/g, '');
    
    // Use provided password or default password
    const workerPassword = password && password.trim() !== '' ? password.trim() : DEFAULT_PASSWORD;
    
    // Hash password
    const password_hash = await bcrypt.hash(workerPassword, 10);
    
    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE phone = $1 OR username = $2',
      [phone, username]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Worker with this phone number already exists' });
    }
    
    // Get village details
    const villageResult = await db.query(
      'SELECT id, name, district FROM villages WHERE id = $1',
      [village_id]
    );
    
    if (villageResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid village selected' });
    }
    
    const village = villageResult.rows[0];
    
    // Create worker user
    const result = await db.query(
      `INSERT INTO users (
        username, phone, password_hash, role, assigned_villages, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, phone, role, assigned_villages, created_at`,
      [
        username,
        phone,
        password_hash,
        'worker',
        [village_id], // Store as array
        JSON.stringify({
          name: name,
          district: district || village.district,
          mandal: mandal || null
        })
      ]
    );
    
    const worker = result.rows[0];
    
    res.status(201).json({
      message: 'Worker created successfully',
      worker: {
        ...worker,
        metadata: {
          name: name,
          district: district || village.district,
          mandal: mandal || null
        },
        villages: [village],
        defaultPassword: workerPassword === DEFAULT_PASSWORD
      }
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Phone number or username already exists' });
    } else {
      logger.error('Create worker error:', error);
      res.status(500).json({ error: 'Failed to create worker', message: error.message });
    }
  }
});

// Update worker (admin/supervisor only)
router.put('/:id', authenticateToken, authorizeRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, district, mandal, village_id } = req.body;
    
    // Get existing worker
    const existingResult = await db.query('SELECT * FROM users WHERE id = $1 AND role = $2', [id, 'worker']);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    const existing = existingResult.rows[0];
    const updates = [];
    const params = [];
    let paramCount = 1;
    
    if (phone && phone !== existing.phone) {
      updates.push(`phone = $${paramCount++}`);
      params.push(phone);
      updates.push(`username = $${paramCount++}`);
      params.push(phone.replace(/[\s\+]/g, ''));
    }
    
    if (village_id) {
      updates.push(`assigned_villages = $${paramCount++}`);
      params.push([village_id]);
    }
    
    if (name || district || mandal) {
      const existingMetadata = existing.metadata || {};
      const newMetadata = {
        ...existingMetadata,
        ...(name && { name }),
        ...(district && { district }),
        ...(mandal && { mandal })
      };
      updates.push(`metadata = $${paramCount++}`);
      params.push(JSON.stringify(newMetadata));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);
    
    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );
    
    res.json({ message: 'Worker updated successfully', worker: result.rows[0] });
  } catch (error) {
    logger.error('Update worker error:', error);
    res.status(500).json({ error: 'Failed to update worker' });
  }
});

// Delete worker (admin/supervisor only)
router.delete('/:id', authenticateToken, authorizeRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query('DELETE FROM users WHERE id = $1 AND role = $2 RETURNING *', [id, 'worker']);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    res.json({ message: 'Worker deleted successfully' });
  } catch (error) {
    logger.error('Delete worker error:', error);
    res.status(500).json({ error: 'Failed to delete worker' });
  }
});

module.exports = router;




