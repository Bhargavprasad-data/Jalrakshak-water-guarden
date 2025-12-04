const express = require('express');
const ticketService = require('../services/ticketService');
const whatsappService = require('../services/whatsappService');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// Get tickets (public access)
router.get('/', async (req, res) => {
  try {
    const filters = {
      village_id: req.query.village_id,
      status: req.query.status,
      assigned_to: req.query.assigned_to,
      limit: parseInt(req.query.limit) || 100
    };

    logger.info('Fetching tickets with filters:', filters);
    const tickets = await ticketService.getTickets(filters);
    logger.info(`Returning ${tickets.length} tickets`);
    res.json(tickets);
  } catch (error) {
    logger.error('Get tickets error:', error);
    res.status(500).json({ error: 'Failed to get tickets', message: error.message });
  }
});

// Create ticket (public access - for GIS Map and other public interfaces)
router.post('/', async (req, res) => {
  try {
    logger.info('Creating ticket (public):', req.body);
    const ticket = await ticketService.createTicket(req.body);
    res.status(201).json({ message: 'Ticket created', ticket });
  } catch (error) {
    logger.error('Create ticket error:', error);
    res.status(500).json({ error: 'Failed to create ticket', message: error.message });
  }
});

// Create ticket (authenticated - for admin/supervisor/operator)
router.post('/create', authenticateToken, authorizeRole('admin', 'supervisor', 'operator'), async (req, res) => {
  try {
    const ticket = await ticketService.createTicket(req.body);
    res.status(201).json({ message: 'Ticket created', ticket });
  } catch (error) {
    logger.error('Create ticket error:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// Assign ticket
router.post('/:ticket_id/assign', authenticateToken, authorizeRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { user_id } = req.body;
    const ticket = await ticketService.assignTicket(req.params.ticket_id, user_id);

    // Get worker phone
    const userResult = await db.query('SELECT phone FROM users WHERE id = $1', [user_id]);
    if (userResult.rows.length > 0) {
      await whatsappService.sendTicketAssignment(ticket, userResult.rows[0].phone);
    }

    res.json({ message: 'Ticket assigned', ticket });
  } catch (error) {
    logger.error('Assign ticket error:', error);
    res.status(500).json({ error: 'Failed to assign ticket' });
  }
});

// Update ticket status (public access - no user ID required)
router.post('/:ticket_id/update-status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const ticket = await ticketService.updateTicketStatus(req.params.ticket_id, status, null, notes);

    // Send follow-up if status is in_progress
    if (status === 'in_progress') {
      const userResult = await db.query('SELECT phone FROM users WHERE id = $1', [ticket.assigned_to]);
      if (userResult.rows.length > 0) {
        // Schedule follow-up after 2 hours
        setTimeout(async () => {
          await whatsappService.sendFollowUp(ticket, userResult.rows[0].phone);
        }, 2 * 60 * 60 * 1000);
      }
    }

    res.json({ message: 'Ticket status updated', ticket });
  } catch (error) {
    logger.error('Update ticket status error:', error);
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

// Delete ticket (public access for dashboard cleanup)
router.delete('/:ticket_id', async (req, res) => {
  try {
    const { ticket_id } = req.params;

    const result = await db.query(
      'DELETE FROM tickets WHERE id = $1 RETURNING *',
      [ticket_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({ message: 'Ticket deleted', ticket: result.rows[0] });
  } catch (error) {
    logger.error('Delete ticket error:', error);
    res.status(500).json({ error: 'Failed to delete ticket', message: error.message });
  }
});

// Send WhatsApp notifications for all open tickets (public access for batch processing)
router.post('/send-whatsapp-all', async (req, res) => {
  try {
    logger.info('Starting batch WhatsApp notification for all open tickets');
    const result = await ticketService.sendWhatsAppForAllOpenTickets();
    res.json({ 
      message: 'WhatsApp notifications sent for open tickets', 
      result 
    });
  } catch (error) {
    logger.error('Error sending WhatsApp for all tickets:', error);
    res.status(500).json({ error: 'Failed to send WhatsApp notifications', message: error.message });
  }
});

module.exports = router;

