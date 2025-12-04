const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, phone, password, role, villageName, village_name } = req.body;

    const effectiveRole = role || 'operator';
    const workerVillageName = villageName || village_name || null;

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (username, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, phone, role`,
      [username, email, phone, password_hash, effectiveRole]
    );

    const user = result.rows[0];

    // If this is a worker signup, also register them as a WhatsApp contact
    // so they appear automatically on the dashboard Contacts page.
    if (effectiveRole === 'worker') {
      try {
        // Resolve village_id from name, if provided
        let villages = [];
        if (workerVillageName) {
          const villageResult = await db.query(
            `SELECT id FROM villages WHERE LOWER(name) = LOWER($1) LIMIT 1`,
            [workerVillageName.trim()]
          );
          if (villageResult.rows.length > 0) {
            villages = [villageResult.rows[0].id];
          }
        }

        // Format phone with +91 prefix if not already international format
        const formattedPhone = phone && phone.startsWith('+') ? phone : `+91${phone}`;

        // Generate a simple auto-incrementing worker contact code: A1, A2, A3, ...
        let contactCode = null;
        try {
          const codeResult = await db.query(
            `SELECT COUNT(*)::int AS count FROM whatsapp_contacts WHERE role = 'worker'`
          );
          const next = (codeResult.rows[0]?.count || 0) + 1;
          contactCode = `A${next}`;
        } catch (e) {
          logger.error('Failed to compute worker contact_code, using null:', e);
        }

        await db.query(
          `INSERT INTO whatsapp_contacts (
             contact_code, name, phone, role, villages, whatsapp_opt_in, notes, created_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (phone) 
           DO UPDATE SET 
             name = $2,
             role = $4,
             villages = $5,
             whatsapp_opt_in = $6,
             updated_at = CURRENT_TIMESTAMP`,
          [
            contactCode,           // contact_code (A1, A2, ...)
            username,              // name
            formattedPhone,        // phone
            'worker',              // role
            villages,              // villages (UUID[])
            true,                  // whatsapp_opt_in
            workerVillageName || null, // notes (store raw village name if mapping failed)
            user.id,               // created_by
          ]
        );
      } catch (contactError) {
        logger.error('Failed to create worker WhatsApp contact during registration:', contactError);
        // Do not fail registration if contact creation fails
      }
    }

    res.status(201).json({ message: 'User registered successfully', user });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Username, email, or phone already exists' });
    } else {
      logger.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await db.query(
      'SELECT * FROM users WHERE username = $1 OR phone = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, phone, role, assigned_villages FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

module.exports = router;






