const axios = require('axios');
const db = require('../db/connection');
const logger = require('../utils/logger');

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

async function sendMessage(phone, message, buttons = null) {
  if (!WHATSAPP_API_URL || !WHATSAPP_ACCESS_TOKEN) {
    logger.warn('WhatsApp API not configured, skipping message');
    return null;
  }

  try {
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message }
    };

    // Add interactive buttons if provided
    if (buttons && buttons.length > 0) {
      payload.type = 'interactive';
      payload.interactive = {
        type: 'button',
        body: { text: message },
        action: {
          buttons: buttons.map((btn, idx) => ({
            type: 'reply',
            reply: {
              id: btn.id,
              title: btn.title
            }
          }))
        }
      };
    }

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Log message (contactId will be found by phone if not provided)
    await logWhatsAppMessage(null, phone, 'alert', 'outgoing', message, response.data);

    return response.data;
  } catch (error) {
    logger.error('WhatsApp send error:', error.response?.data || error.message);
    throw error;
  }
}

async function sendAlert(alert) {
  try {
    let villageId = null;
    
    // Get village ID from device if available
    const deviceResult = await db.query(
      'SELECT village_id FROM devices WHERE device_id = $1',
      [alert.device_id]
    );

    if (deviceResult.rows.length > 0) {
      villageId = deviceResult.rows[0].village_id;
    }

    // Get ALL contacts with opt-in (village-specific + global contacts)
    // Contacts with empty villages array or matching village will receive alerts
    let contactsQuery;
    let contactsParams = [];
    
    if (villageId) {
      // Get contacts for this specific village OR contacts with no village assigned (global contacts)
      contactsQuery = `SELECT id, phone, name, role, villages FROM whatsapp_contacts 
                       WHERE whatsapp_opt_in = true 
                       AND (villages = '{}' OR $1 = ANY(villages))`;
      contactsParams = [villageId];
    } else {
      // If no village, send to all global contacts (empty villages array)
      contactsQuery = `SELECT id, phone, name, role, villages FROM whatsapp_contacts 
                       WHERE whatsapp_opt_in = true 
                       AND villages = '{}'`;
    }

    const contactsResult = await db.query(contactsQuery, contactsParams);

    if (contactsResult.rows.length === 0) {
      logger.warn('No contacts found with opt-in for alert');
      return;
    }

    const message = formatAlertMessage(alert);
    const buttons = [
      { id: 'accept', title: 'Accept' },
      { id: 'reject', title: 'Reject' }
    ];

    // Send to all relevant contacts
    let successCount = 0;
    for (const contact of contactsResult.rows) {
      try {
        await sendMessage(contact.phone, message, buttons);
        // Log message with contact ID
        await logWhatsAppMessage(contact.id, contact.phone, 'alert', 'outgoing', message, { status: 'sent' });
        logger.info(`Alert sent to ${contact.phone} (${contact.name})`);
        successCount++;
      } catch (error) {
        logger.error(`Failed to send alert to ${contact.phone}:`, error);
      }
    }

    // Update alert as sent
    await db.query(
      'UPDATE alerts SET whatsapp_sent = true WHERE id = $1',
      [alert.id]
    );

    logger.info(`Alert sent to ${successCount} out of ${contactsResult.rows.length} contacts`);
  } catch (error) {
    logger.error('Error sending alert:', error);
    throw error;
  }
}

async function sendTicketAssignment(ticket, workerPhone) {
  try {
    const message = formatTicketMessage(ticket);
    const buttons = [
      { id: `accept_${ticket.id}`, title: 'Accept' },
      { id: `reject_${ticket.id}`, title: 'Reject' }
    ];

    await sendMessage(workerPhone, message, buttons);
    logger.info(`Ticket assignment sent to ${workerPhone}`);
  } catch (error) {
    logger.error('Error sending ticket assignment:', error);
    throw error;
  }
}

async function sendFollowUp(ticket, workerPhone) {
  try {
    const message = `Is leakage fixed? (Ticket: ${ticket.ticket_id})\n\nReply:\n• YES - if fixed\n• NO - if still working`;
    const buttons = [
      { id: `yes_${ticket.id}`, title: 'YES' },
      { id: `no_${ticket.id}`, title: 'NO' }
    ];

    await sendMessage(workerPhone, message, buttons);
    logger.info(`Follow-up sent to ${workerPhone}`);
  } catch (error) {
    logger.error('Error sending follow-up:', error);
    throw error;
  }
}

function formatAlertMessage(alert) {
  const gpsLink = alert.gps_lat && alert.gps_lon
    ? `https://maps.google.com/?q=${alert.gps_lat},${alert.gps_lon}`
    : 'N/A';

  return `🚨 *Alert: ${alert.alert_type}*\n\n` +
    `Severity: ${alert.severity.toUpperCase()}\n` +
    `Device: ${alert.device_id}\n` +
    `Location: ${gpsLink}\n` +
    `Message: ${alert.message}\n\n` +
    `Please respond with Accept or Reject.`;
}

function formatTicketMessage(ticket) {
  const gpsLink = ticket.gps_lat && ticket.gps_lon
    ? `https://maps.google.com/?q=${ticket.gps_lat},${ticket.gps_lon}`
    : 'N/A';

  return `🎫 *New Ticket: ${ticket.ticket_id}*\n\n` +
    `Issue: ${ticket.issue_type}\n` +
    `Severity: ${ticket.severity.toUpperCase()}\n` +
    `Location: ${gpsLink}\n` +
    `Description: ${ticket.description || 'N/A'}\n\n` +
    `Please accept or reject this assignment.`;
}

async function logWhatsAppMessage(contactId, phone, messageType, direction, messageText, responseData, ticketId = null) {
  try {
    // If contactId is null, try to find it by phone
    let finalContactId = contactId;
    if (!finalContactId && phone) {
      const contactResult = await db.query(
        'SELECT id FROM whatsapp_contacts WHERE phone = $1 LIMIT 1',
        [phone]
      );
      if (contactResult.rows.length > 0) {
        finalContactId = contactResult.rows[0].id;
      }
    }

    await db.query(
      `INSERT INTO whatsapp_messages (
        contact_id, ticket_id, message_type, direction, message_text, response_data, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        finalContactId,
        ticketId,
        messageType,
        direction,
        messageText,
        JSON.stringify(responseData),
        responseData?.messages?.[0]?.status || responseData?.status || 'sent'
      ]
    );
  } catch (error) {
    logger.error('Error logging WhatsApp message:', error);
  }
}

module.exports = {
  sendMessage,
  sendAlert,
  sendTicketAssignment,
  sendFollowUp,
  logWhatsAppMessage,
};

