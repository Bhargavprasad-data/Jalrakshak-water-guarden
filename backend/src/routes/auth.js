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
    const { username, email, phone, password, role, name, district, mandal, village_id } = req.body;

    const effectiveRole = role || 'operator';

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // For workers, create a registration request instead of directly creating account
    if (effectiveRole === 'worker') {
      if (!name || !district) {
        return res.status(400).json({ error: 'Name and district are required for worker registration' });
      }

      try {
        // Validate village_id if provided
        let validVillageId = null;
        if (village_id) {
          const villageCheck = await db.query(
            'SELECT id FROM villages WHERE id = $1',
            [village_id]
          );
          if (villageCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid village selected' });
          }
          validVillageId = village_id;
        }

        // Check if request already exists
        const existingRequest = await db.query(
          'SELECT id, status FROM worker_registration_requests WHERE phone = $1 OR username = $2',
          [phone, username]
        );

        if (existingRequest.rows.length > 0) {
          const existing = existingRequest.rows[0];
          if (existing.status === 'pending') {
            return res.status(400).json({ 
              error: 'Registration request already pending. Please wait for admin approval.' 
            });
          } else if (existing.status === 'approved') {
            return res.status(400).json({ 
              error: 'Your request was approved. Please complete your registration by logging in.' 
            });
          }
        }

        // Create worker registration request
        const requestResult = await db.query(
          `INSERT INTO worker_registration_requests (
            username, email, phone, password_hash, name, district, mandal, village_id, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
          RETURNING id, username, phone, name, district, mandal, village_id, status, created_at`,
          [username, email || null, phone, password_hash, name, district, mandal || null, validVillageId]
        );

        logger.info(`Worker registration request created: ${requestResult.rows[0].id} for ${username} (${phone})`);

        return res.status(201).json({ 
          message: 'Registration request submitted successfully. Please wait for admin approval.',
          request: requestResult.rows[0],
          requiresApproval: true
        });
      } catch (workerError) {
        // If table doesn't exist, create it and retry
        if (workerError.code === '42P01' || workerError.message.includes('does not exist')) {
          logger.warn('worker_registration_requests table does not exist, creating it...');
          try {
            // Ensure UUID extension is available
            await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"').catch(() => {
              // Extension might already exist or not be needed
            });
            
            // Create the table if it doesn't exist
            await db.query(`
              CREATE TABLE IF NOT EXISTS worker_registration_requests (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                username VARCHAR(100) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(20) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                district VARCHAR(255) NOT NULL,
                mandal VARCHAR(255),
                village_id UUID REFERENCES villages(id),
                status VARCHAR(50) DEFAULT 'pending',
                reviewed_by UUID REFERENCES users(id),
                reviewed_at TIMESTAMP,
                rejection_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(phone),
                UNIQUE(username)
              )
            `);
            
            // Create indexes
            await db.query(`
              CREATE INDEX IF NOT EXISTS idx_worker_requests_status ON worker_registration_requests(status)
            `);
            await db.query(`
              CREATE INDEX IF NOT EXISTS idx_worker_requests_created_at ON worker_registration_requests(created_at DESC)
            `);
            
            // Validate village_id if provided
            let validVillageId = null;
            if (village_id) {
              const villageCheck = await db.query(
                'SELECT id FROM villages WHERE id = $1',
                [village_id]
              );
              if (villageCheck.rows.length === 0) {
                return res.status(400).json({ error: 'Invalid village selected' });
              }
              validVillageId = village_id;
            }
            
            // Retry the insert
            const requestResult = await db.query(
              `INSERT INTO worker_registration_requests (
                username, email, phone, password_hash, name, district, mandal, village_id, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
              RETURNING id, username, phone, name, district, mandal, village_id, status, created_at`,
              [username, email || null, phone, password_hash, name, district, mandal || null, validVillageId]
            );

            return res.status(201).json({ 
              message: 'Registration request submitted successfully. Please wait for admin approval.',
              request: requestResult.rows[0],
              requiresApproval: true
            });
          } catch (createError) {
            logger.error('Failed to create worker_registration_requests table:', createError);
            return res.status(500).json({ 
              error: 'Registration failed. Please contact administrator.',
              details: createError.message 
            });
          }
        }
        // Re-throw other errors
        throw workerError;
      }
    }

    // For non-worker roles, create account directly
    const result = await db.query(
      `INSERT INTO users (username, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, phone, role`,
      [username, email, phone, password_hash, effectiveRole]
    );

    const user = result.rows[0];

    res.status(201).json({ message: 'User registered successfully', user });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Username, email, or phone already exists' });
    } else {
      logger.error('Registration error:', error);
      logger.error('Registration error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      res.status(500).json({ 
        error: 'Registration failed',
        message: error.message || 'Unknown error occurred'
      });
    }
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const DEFAULT_PASSWORD = 'Worker@123';

    let query = 'SELECT * FROM users WHERE (username = $1 OR phone = $1 OR email = $1)';
    let params = [username];

    // If role is specified, filter by role
    if (role) {
      query += ' AND role = $2';
      params.push(role);
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if password matches default password
    const isDefaultPassword = await bcrypt.compare(DEFAULT_PASSWORD, user.password_hash);
    const requiresPasswordChange = isDefaultPassword;

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Get district and mandal from user (check both column name variations)
    const userDistrict = user.assigned_district || user.district || null;
    const userMandal = user.assigned_mandal || user.mandal || null;

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        assigned_villages: user.assigned_villages || [],
        district: userDistrict,
        mandal: userMandal,
        requiresPasswordChange: requiresPasswordChange
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Admin Signup (for superadmin, districtadmin, mandaladmin)
router.post('/admin/signup', async (req, res) => {
  try {
    const { username, email, phone, password, role, name, district: reqDistrict, mandal: reqMandal } = req.body;

    // Validate required fields
    if (!username || !password || !phone) {
      return res.status(400).json({ error: 'Username, password, and phone are required' });
    }

    // Validate role
    const validRoles = ['superadmin', 'districtadmin', 'mandaladmin'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Valid role (superadmin, districtadmin, mandaladmin) is required' });
    }

    // For admin roles, if district/mandal not provided, use defaults
    // This allows simplified signup forms
    let district = reqDistrict;
    let mandal = reqMandal;

    if (role === 'districtadmin' && !district) {
      district = 'Srikakulam'; // Default district
    }

    if (role === 'mandaladmin') {
      if (!district) {
        district = 'Srikakulam'; // Default district
      }
      if (!mandal) {
        mandal = null; // Mandal can be set later or inferred
      }
    }

    // Check if user already exists
    let existingUserQuery = 'SELECT id FROM users WHERE username = $1 OR phone = $2';
    let existingUserParams = [username, phone];
    
    if (email) {
      existingUserQuery += ' OR email = $3';
      existingUserParams.push(email);
    }
    
    const existingUser = await db.query(existingUserQuery, existingUserParams);

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username, phone, or email already exists' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Try to insert user - first attempt with district/mandal if role requires it
    let result;
    try {
      // Check which columns exist in the users table
      const columnCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('assigned_district', 'assigned_mandal', 'district', 'mandal')
      `);
      
      const existingColumns = columnCheck.rows.map(r => r.column_name);
      const hasAssignedDistrict = existingColumns.includes('assigned_district');
      const hasAssignedMandal = existingColumns.includes('assigned_mandal');
      const hasDistrict = existingColumns.includes('district');
      const hasMandal = existingColumns.includes('mandal');

      // Determine which columns to use
      const districtCol = hasAssignedDistrict ? 'assigned_district' : (hasDistrict ? 'district' : null);
      const mandalCol = hasAssignedMandal ? 'assigned_mandal' : (hasMandal ? 'mandal' : null);

      // Build INSERT query dynamically based on available columns
      let insertColumns = ['username', 'email', 'phone', 'password_hash', 'role'];
      let insertValues = [username, email || null, phone, password_hash, role];
      let placeholders = ['$1', '$2', '$3', '$4', '$5'];
      let paramIndex = 6;

      if (districtCol && (role === 'districtadmin' || role === 'mandaladmin')) {
        insertColumns.push(districtCol);
        insertValues.push(district || null);
        placeholders.push(`$${paramIndex++}`);
      }

      if (mandalCol && role === 'mandaladmin') {
        insertColumns.push(mandalCol);
        insertValues.push(mandal || null);
        placeholders.push(`$${paramIndex++}`);
      }

      // Build RETURNING clause
      let returningClause = 'id, username, email, phone, role';
      if (districtCol) {
        returningClause += `, ${districtCol} as district`;
      }
      if (mandalCol) {
        returningClause += `, ${mandalCol} as mandal`;
      }

      // Insert user
      const insertQuery = `
        INSERT INTO users (${insertColumns.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING ${returningClause}
      `;

      result = await db.query(insertQuery, insertValues);
    } catch (insertError) {
      // If column error, try without district/mandal
      if (insertError.code === '42703' || insertError.message.includes('column') || insertError.message.includes('does not exist')) {
        logger.warn('Column error detected, retrying without district/mandal columns:', insertError.message);
        result = await db.query(
          `INSERT INTO users (username, email, phone, password_hash, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, username, email, phone, role`,
          [username, email || null, phone, password_hash, role]
        );
      } else {
        throw insertError; // Re-throw if it's a different error
      }
    }

    const user = result.rows[0];

    logger.info(`Admin user created: ${user.id} - ${username} (${role})`);

    const responseUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role
    };

    // Add district/mandal if they exist in the result
    if (user.district !== undefined) {
      responseUser.district = user.district;
    }
    if (user.mandal !== undefined) {
      responseUser.mandal = user.mandal;
    }

    res.status(201).json({ 
      message: 'Admin account created successfully', 
      user: responseUser
    });
  } catch (error) {
    logger.error('Admin signup error:', error);
    logger.error('Admin signup error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack
    });
    
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Username, email, or phone already exists' });
    } else if (error.code === '42703') { // Undefined column
      // Column doesn't exist - try without district/mandal columns
      logger.warn('Column does not exist, retrying without district/mandal columns');
      try {
        // Hash password if not already hashed (shouldn't happen, but just in case)
        const password_hash_to_use = password_hash || await bcrypt.hash(password, 10);
        
        const simpleResult = await db.query(
          `INSERT INTO users (username, email, phone, password_hash, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, username, email, phone, role`,
          [username, email || null, phone, password_hash_to_use, role]
        );
        const user = simpleResult.rows[0];
        res.status(201).json({ 
          message: 'Admin account created successfully', 
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            phone: user.phone,
            role: user.role
          }
        });
      } catch (retryError) {
        logger.error('Retry signup error:', retryError);
        res.status(500).json({ 
          error: 'Registration failed',
          message: retryError.message || 'Unknown error occurred'
        });
      }
    } else {
      res.status(500).json({ 
        error: 'Registration failed',
        message: error.message || 'Unknown error occurred'
      });
    }
  }
});

// Change password
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    // Get user
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Check if new password is different
    const samePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (samePassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }
    
    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, req.user.id]
    );
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
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






