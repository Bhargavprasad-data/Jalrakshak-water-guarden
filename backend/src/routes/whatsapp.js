const express = require('express');
const db = require('../db/connection');
const ticketService = require('../services/ticketService');
const whatsappService = require('../services/whatsappService');
const logger = require('../utils/logger');

const router = express.Router();

// WhatsApp webhook (for receiving messages)
router.post('/webhook', async (req, res) => {
  try {
    const { entry } = req.body;

    if (!entry || entry.length === 0) {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    for (const webhookEntry of entry) {
      const { changes } = webhookEntry;
      if (changes && changes[0] && changes[0].value) {
        const value = changes[0].value;

        // Handle incoming messages
        if (value.messages) {
          for (const message of value.messages) {
            await handleIncomingMessage(message);
          }
        }

        // Handle status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            await handleStatusUpdate(status);
          }
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// WhatsApp webhook verification
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

async function handleIncomingMessage(message) {
  try {
    const phone = message.from;
    const messageText = message.text?.body || '';
    const buttonResponse = message.button?.payload;

    // Find contact
    const contactResult = await db.query(
      'SELECT * FROM whatsapp_contacts WHERE phone = $1',
      [phone]
    );

    if (contactResult.rows.length === 0) {
      logger.warn(`Message from unknown number: ${phone}`);
      return;
    }

    const contact = contactResult.rows[0];

    // Log incoming message
    await whatsappService.logWhatsAppMessage(
      contact.id,
      phone,
      'response',
      'incoming',
      messageText || buttonResponse,
      message
    );

    // Handle button responses
    if (buttonResponse) {
      await handleButtonResponse(contact, buttonResponse, phone);
    } else if (messageText) {
      // Handle text responses (YES/NO for follow-ups)
      const upperText = messageText.toUpperCase().trim();
      if (upperText === 'YES' || upperText === 'NO') {
        await handleTextResponse(contact, upperText, phone);
      }
    }
  } catch (error) {
    logger.error('Error handling incoming message:', error);
  }
}

async function handleButtonResponse(contact, payload, phone) {
  try {
    // Parse payload: accept_TKT-123, reject_TKT-123, yes_TKT-123, no_TKT-123
    const [action, ticketId] = payload.split('_');

    if (!ticketId) {
      return;
    }

    // Find ticket
    const ticketResult = await db.query(
      'SELECT * FROM tickets WHERE ticket_id = $1',
      [ticketId]
    );

    if (ticketResult.rows.length === 0) {
      await whatsappService.sendMessage(phone, 'Ticket not found.');
      return;
    }

    const ticket = ticketResult.rows[0];

    switch (action) {
      case 'accept':
        await ticketService.updateTicketStatus(ticket.id, 'accepted', contact.id);
        await whatsappService.sendMessage(phone, `✅ Ticket ${ticket.ticket_id} accepted. Please proceed to the location.`);
        break;

      case 'reject':
        await ticketService.updateTicketStatus(ticket.id, 'open', contact.id, 'Rejected by worker');
        await whatsappService.sendMessage(phone, `❌ Ticket ${ticket.ticket_id} rejected.`);
        break;

      case 'yes':
        await ticketService.updateTicketStatus(ticket.id, 'completed', contact.id, 'Fixed - confirmed via WhatsApp');
        await whatsappService.sendMessage(phone, `✅ Thank you! Ticket ${ticket.ticket_id} marked as completed.`);
        break;

      case 'no':
        await ticketService.updateTicketStatus(ticket.id, 'in_progress', contact.id, 'Still working - confirmed via WhatsApp');
        await whatsappService.sendMessage(phone, `⏳ Ticket ${ticket.ticket_id} status updated. Please update when fixed.`);
        break;
    }
  } catch (error) {
    logger.error('Error handling button response:', error);
  }
}

async function handleTextResponse(contact, response, phone) {
  try {
    // Find open tickets assigned to this contact
    const ticketResult = await db.query(
      `SELECT * FROM tickets 
       WHERE assigned_to = (SELECT id FROM users WHERE phone = $1)
       AND status IN ('in_progress', 'accepted')
       ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );

    if (ticketResult.rows.length === 0) {
      await whatsappService.sendMessage(phone, 'No active tickets found.');
      return;
    }

    const ticket = ticketResult.rows[0];

    if (response === 'YES') {
      await ticketService.updateTicketStatus(ticket.id, 'completed', contact.id, 'Fixed - confirmed via WhatsApp');
      await whatsappService.sendMessage(phone, `✅ Thank you! Ticket ${ticket.ticket_id} marked as completed.`);
    } else if (response === 'NO') {
      await ticketService.updateTicketStatus(ticket.id, 'in_progress', contact.id, 'Still working - confirmed via WhatsApp');
      await whatsappService.sendMessage(phone, `⏳ Ticket ${ticket.ticket_id} status updated. Please update when fixed.`);
    }
  } catch (error) {
    logger.error('Error handling text response:', error);
  }
}

async function handleStatusUpdate(status) {
  try {
    // Update message status in database
    await db.query(
      `UPDATE whatsapp_messages 
       SET status = $1, 
           delivered_at = CASE WHEN $1 = 'delivered' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
           read_at = CASE WHEN $1 = 'read' THEN CURRENT_TIMESTAMP ELSE read_at END
       WHERE response_data->>'id' = $2`,
      [status.status, status.id]
    );
  } catch (error) {
    logger.error('Error handling status update:', error);
  }
}

module.exports = router;






