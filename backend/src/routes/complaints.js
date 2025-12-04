const express = require('express');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Create complaint
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      village_id,
      complaint_type,
      description,
      gps_lat,
      gps_lon,
      photo_urls
    } = req.body;

    const complaint_id = `CMP-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;

    const result = await db.query(
      `INSERT INTO complaints (
        complaint_id, village_id, reported_by, complaint_type, 
        description, gps_lat, gps_lon, photo_urls
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [complaint_id, village_id, req.user.id, complaint_type, description, gps_lat, gps_lon, photo_urls || []]
    );

    res.status(201).json({ message: 'Complaint created', complaint: result.rows[0] });
  } catch (error) {
    logger.error('Create complaint error:', error);
    res.status(500).json({ error: 'Failed to create complaint' });
  }
});

// Get complaints (public for dashboard/mobile monitoring)
router.get('/', async (req, res) => {
  try {
    const { village_id, status } = req.query;
    let query = `
      SELECT 
        c.*, 
        u.username as reported_by_name, 
        u.email as reported_by_email,
        v.name as village_name
      FROM complaints c
      LEFT JOIN users u ON c.reported_by = u.id
      LEFT JOIN villages v ON c.village_id = v.id
      WHERE 1=1
        AND c.status <> 'deleted'
    `;
    const params = [];
    let paramCount = 1;

    if (village_id) {
      query += ` AND c.village_id = $${paramCount}`;
      params.push(village_id);
      paramCount++;
    }

    if (status) {
      query += ` AND c.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ' ORDER BY c.created_at DESC LIMIT 300';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get complaints error:', error);
    res.status(500).json({ error: 'Failed to get complaints' });
  }
});

// Update complaint status (public for dashboard actions)
router.post('/:complaint_id/update-status', async (req, res) => {
  try {
    const { complaint_id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const result = await db.query(
      `UPDATE complaints
       SET status = $1, updated_at = NOW()
       WHERE complaint_id = $2
       RETURNING *`,
      [status, complaint_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    res.json({ message: 'Complaint status updated', complaint: result.rows[0] });
  } catch (error) {
    logger.error('Update complaint status error:', error);
    res.status(500).json({ error: 'Failed to update complaint status' });
  }
});

// Delete complaint (dashboard action) - mark as deleted so it never reappears
router.delete('/:complaint_id', async (req, res) => {
  try {
    const { complaint_id } = req.params;

    const result = await db.query(
      `UPDATE complaints
       SET status = 'deleted', updated_at = NOW()
       WHERE complaint_id = $1
       RETURNING *`,
      [complaint_id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    res.json({ message: 'Complaint deleted', complaint: result.rows[0] });
  } catch (error) {
    logger.error('Delete complaint error:', error);
    res.status(500).json({ error: 'Failed to delete complaint' });
  }
});

module.exports = router;






