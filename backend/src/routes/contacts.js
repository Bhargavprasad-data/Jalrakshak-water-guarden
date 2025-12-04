const express = require('express');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Get all contacts (public access for viewing)
router.get('/', async (req, res) => {
  try {
    const { village_id, role, opt_in } = req.query;
    let query = `
      SELECT 
        c.*,
        v.name AS village_name
      FROM whatsapp_contacts c
      LEFT JOIN villages v ON v.id = c.villages[1]
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (village_id) {
      query += ` AND $${paramCount} = ANY(c.villages)`;
      params.push(village_id);
      paramCount++;
    }

    if (role) {
      query += ` AND c.role = $${paramCount}`;
      params.push(role);
      paramCount++;
    }

    if (opt_in !== undefined) {
      query += ` AND c.whatsapp_opt_in = $${paramCount}`;
      params.push(opt_in === 'true');
      paramCount++;
    }

    query += ' ORDER BY c.created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get contacts error:', error);
    res.status(500).json({ error: 'Failed to get contacts' });
  }
});

// Add contact (public access for dashboard)
router.post('/', async (req, res) => {
  try {
    const { contact_code, name, phone, role, villages, whatsapp_opt_in, notes } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    // Format phone number
    const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;
    const contactCode = contact_code && contact_code.trim() !== '' ? contact_code.trim() : null;

    const result = await db.query(
      `INSERT INTO whatsapp_contacts (
        contact_code, name, phone, role, villages, whatsapp_opt_in, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (phone) 
      DO UPDATE SET contact_code = COALESCE($1, whatsapp_contacts.contact_code), name = $2, role = $4, villages = $5, whatsapp_opt_in = $6, notes = $7, updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [contactCode, name, formattedPhone, role, villages || [], whatsapp_opt_in !== false, notes, null]
    );

    const contact = result.rows[0];

    // Automatically send welcome message if opt-in is true
    if (contact.whatsapp_opt_in) {
      try {
        const whatsappService = require('../services/whatsappService');
        const welcomeMessage = `👋 *Welcome to JalRakshak!*\n\n` +
          `Hello ${name},\n\n` +
          `You have been added to the JalRakshak Water Monitoring System.\n\n` +
          `Role: ${role}\n` +
          `You will receive alerts and notifications about water supply issues in your area.\n\n` +
          `Thank you for being part of our water monitoring network! 💧`;
        
        await whatsappService.sendMessage(contact.phone, welcomeMessage);
        logger.info(`Welcome message sent to ${contact.phone}`);
      } catch (error) {
        logger.error(`Failed to send welcome message to ${contact.phone}:`, error);
        // Don't fail the contact creation if message fails
      }
    }

    res.status(201).json({ message: 'Contact added and welcome message sent', contact });
  } catch (error) {
    logger.error('Add contact error:', error);
    res.status(500).json({ error: 'Failed to add contact' });
  }
});

// Bulk import contacts (public access)
router.post('/bulk-import', async (req, res) => {
  try {
    const { contacts } = req.body; // Array of {phone, name, village, role, opt_in}
    const whatsappService = require('../services/whatsappService');

    const results = [];
    for (const contact of contacts) {
      try {
        const formattedPhone = contact.phone.startsWith('+') ? contact.phone : `+91${contact.phone}`;
        const result = await db.query(
          `INSERT INTO whatsapp_contacts (name, phone, role, villages, whatsapp_opt_in, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (phone) DO UPDATE SET name = $1, role = $3, villages = $4, updated_at = CURRENT_TIMESTAMP
           RETURNING *`,
          [
            contact.name,
            formattedPhone,
            contact.role || 'worker',
            contact.village ? [contact.village] : [],
            contact.opt_in !== false,
            null
          ]
        );

        const savedContact = result.rows[0];

        // Send welcome message if opt-in is true
        if (savedContact.whatsapp_opt_in) {
          try {
            const welcomeMessage = `👋 *Welcome to JalRakshak!*\n\n` +
              `Hello ${savedContact.name},\n\n` +
              `You have been added to the JalRakshak Water Monitoring System.\n\n` +
              `Role: ${savedContact.role}\n` +
              `You will receive alerts and notifications about water supply issues in your area.\n\n` +
              `Thank you for being part of our water monitoring network! 💧`;
            
            await whatsappService.sendMessage(savedContact.phone, welcomeMessage);
            logger.info(`Welcome message sent to ${savedContact.phone}`);
          } catch (error) {
            logger.error(`Failed to send welcome message to ${savedContact.phone}:`, error);
            // Don't fail the contact creation if message fails
          }
        }

        results.push({ success: true, contact: savedContact });
      } catch (error) {
        results.push({ success: false, error: error.message, contact });
      }
    }

    res.json({ message: 'Bulk import completed', results });
  } catch (error) {
    logger.error('Bulk import error:', error);
    res.status(500).json({ error: 'Failed to bulk import contacts' });
  }
});

// Update contact (public access)
router.patch('/:contact_id', async (req, res) => {
  try {
    const { contact_code, name, role, villages, whatsapp_opt_in, notes } = req.body;
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (contact_code !== undefined) {
      updates.push(`contact_code = $${paramCount++}`);
      params.push(contact_code);
    }
    if (name) {
      updates.push(`name = $${paramCount++}`);
      params.push(name);
    }
    if (role) {
      updates.push(`role = $${paramCount++}`);
      params.push(role);
    }
    if (villages) {
      updates.push(`villages = $${paramCount++}`);
      params.push(villages);
    }
    if (whatsapp_opt_in !== undefined) {
      updates.push(`whatsapp_opt_in = $${paramCount++}`);
      params.push(whatsapp_opt_in);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      params.push(notes);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(req.params.contact_id);

    const result = await db.query(
      `UPDATE whatsapp_contacts SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ message: 'Contact updated', contact: result.rows[0] });
  } catch (error) {
    logger.error('Update contact error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete contact (public access)
router.delete('/:contact_id', async (req, res) => {
  try {
    const result = await db.query('DELETE FROM whatsapp_contacts WHERE id = $1 RETURNING *', [req.params.contact_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ message: 'Contact deleted', contact: result.rows[0] });
  } catch (error) {
    logger.error('Delete contact error:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Send test message (public access)
router.post('/:contact_id/test', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM whatsapp_contacts WHERE id = $1', [req.params.contact_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = result.rows[0];
    const message = `🧪 Test message from JalRakshak system.\n\nThis is a test to verify WhatsApp integration.`;

    await require('../services/whatsappService').sendMessage(contact.phone, message);

    res.json({ message: 'Test message sent' });
  } catch (error) {
    logger.error('Send test message error:', error);
    res.status(500).json({ error: 'Failed to send test message' });
  }
});

// Get message logs
router.get('/:contact_id/messages', authenticateToken, authorizeRole('admin', 'supervisor'), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM whatsapp_messages WHERE contact_id = $1 ORDER BY sent_at DESC LIMIT 100',
      [req.params.contact_id]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Get message logs error:', error);
    res.status(500).json({ error: 'Failed to get message logs' });
  }
});

module.exports = router;

