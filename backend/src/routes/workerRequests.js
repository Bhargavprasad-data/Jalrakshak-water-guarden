const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();
const DEFAULT_PASSWORD = 'Worker@123';

// Get all worker registration requests (public access - no authentication required)
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    
    logger.info(`Fetching worker requests - Status filter: ${status || 'all'}`);
    
    // Check if table exists, if not return empty array
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'worker_registration_requests'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      logger.warn('worker_registration_requests table does not exist yet');
      return res.json([]);
    }
    
    let query = `
      SELECT 
        wr.*,
        u.username as reviewed_by_username,
        v.name as village_name
      FROM worker_registration_requests wr
      LEFT JOIN users u ON wr.reviewed_by = u.id
      LEFT JOIN villages v ON wr.village_id = v.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND wr.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY wr.created_at DESC`;

    logger.info(`Executing query: ${query.substring(0, 100)}... with params:`, params);
    const result = await db.query(query, params);
    logger.info(`Found ${result.rows.length} worker requests`);
    
    if (result.rows.length > 0) {
      logger.info(`Sample request:`, {
        id: result.rows[0].id,
        username: result.rows[0].username,
        name: result.rows[0].name,
        status: result.rows[0].status
      });
    }
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Get worker requests error:', error);
    logger.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to get worker requests', message: error.message });
  }
});

// Approve worker registration request (public access - no authentication required)
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const reviewerId = null; // No authentication, so no reviewer ID

    // Get the request
    const requestResult = await db.query(
      'SELECT * FROM worker_registration_requests WHERE id = $1',
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE phone = $1 OR username = $2',
      [request.phone, request.username]
    );

    if (existingUser.rows.length > 0) {
      // Update request status to rejected
      await db.query(
        `UPDATE worker_registration_requests 
         SET status = 'rejected', 
             reviewed_by = $1, 
             reviewed_at = CURRENT_TIMESTAMP,
             rejection_reason = 'User already exists',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [reviewerId, id]
      );
      return res.status(400).json({ error: 'User with this phone or username already exists' });
    }

    // Create worker user account
    const userResult = await db.query(
      `INSERT INTO users (
        username, email, phone, password_hash, role, assigned_villages, metadata
      ) VALUES ($1, $2, $3, $4, 'worker', $5, $6)
      RETURNING id, username, phone, role, assigned_villages, created_at`,
      [
        request.username,
        request.email,
        request.phone,
        request.password_hash,
        request.village_id ? [request.village_id] : [], // Store village_id in assigned_villages array
        JSON.stringify({
          name: request.name,
          district: request.district,
          mandal: request.mandal || null
        })
      ]
    );

    const worker = userResult.rows[0];

    // Update request status to approved
    await db.query(
      `UPDATE worker_registration_requests 
       SET status = 'approved', 
           reviewed_by = $1, 
           reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [reviewerId, id]
    );

    res.json({
      message: 'Worker registration approved and account created',
      worker: {
        ...worker,
        metadata: {
          name: request.name,
          district: request.district,
          mandal: request.mandal
        },
        defaultPassword: DEFAULT_PASSWORD
      }
    });
  } catch (error) {
    logger.error('Approve worker request error:', error);
    res.status(500).json({ error: 'Failed to approve worker request' });
  }
});

// Reject worker registration request (public access - no authentication required)
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const reviewerId = null; // No authentication, so no reviewer ID

    // Get the request
    const requestResult = await db.query(
      'SELECT * FROM worker_registration_requests WHERE id = $1',
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    // Update request status to rejected
    await db.query(
      `UPDATE worker_registration_requests 
       SET status = 'rejected', 
           reviewed_by = $1, 
           reviewed_at = CURRENT_TIMESTAMP,
           rejection_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [reviewerId, reason || 'Rejected by administrator', id]
    );

    res.json({ message: 'Worker registration request rejected' });
  } catch (error) {
    logger.error('Reject worker request error:', error);
    res.status(500).json({ error: 'Failed to reject worker request' });
  }
});

// Check request status (for mobile app)
router.get('/status/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    // Check if table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'worker_registration_requests'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      return res.json({ status: 'not_found' });
    }

    const result = await db.query(
      `SELECT id, status, rejection_reason, reviewed_at, created_at, name, username, district, mandal
       FROM worker_registration_requests 
       WHERE phone = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [phone]
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'not_found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Check request status error:', error);
    res.status(500).json({ error: 'Failed to check request status' });
  }
});

module.exports = router;

