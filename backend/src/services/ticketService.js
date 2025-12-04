const db = require('../db/connection');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const whatsappService = require('./whatsappService');

async function createTicket(ticketData) {
  const {
    anomaly_id,
    device_id,
    issue_type,
    description,
    severity,
    gps_lat,
    gps_lon
  } = ticketData;

  try {
    const ticket_id = `TKT-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;

    const result = await db.query(
      `INSERT INTO tickets (
        ticket_id, anomaly_id, device_id, issue_type, 
        description, severity, gps_lat, gps_lon, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
      RETURNING *`,
      [ticket_id, anomaly_id, device_id, issue_type, description, severity, gps_lat, gps_lon]
    );

    const ticket = result.rows[0];
    logger.info(`Ticket created: ${ticket_id}`);
    
    // Send WhatsApp notification when ticket is created
    await sendTicketWhatsAppNotification(ticket);
    
    return ticket;
  } catch (error) {
    logger.error('Error creating ticket:', error);
    throw error;
  }
}

async function assignTicket(ticketId, userId) {
  try {
    const result = await db.query(
      `UPDATE tickets 
       SET assigned_to = $1, status = 'assigned', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [userId, ticketId]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error assigning ticket:', error);
    throw error;
  }
}

async function updateTicketStatus(ticketId, status, userId, notes = null) {
  try {
    // Check if this is a dynamic ticket (format: dynamic-DEV_XXX-issue_type-index)
    let actualTicketId = ticketId;
    let isDynamic = false;
    
    if (ticketId && ticketId.startsWith('dynamic-')) {
      isDynamic = true;
      // Parse dynamic ticket ID: dynamic-DEV_019-low_pressure-1
      const parts = ticketId.replace('dynamic-', '').split('-');
      if (parts.length >= 2) {
        const deviceId = parts[0];
        const issueType = parts.slice(1, -1).join('-'); // Handle issue types with multiple parts
        const index = parts[parts.length - 1];
        
        // Find or create the actual ticket from telemetry data
        // First, try to find an existing ticket for this device and issue type
        const existingTicket = await db.query(
          `SELECT id FROM tickets 
           WHERE device_id = $1 
           AND issue_type = $2 
           AND status = 'open'
           ORDER BY created_at DESC 
           LIMIT 1`,
          [deviceId, issueType]
        );
        
        if (existingTicket.rows.length > 0) {
          actualTicketId = existingTicket.rows[0].id;
        } else {
          // Create a new ticket from the latest telemetry data
          const telemetryResult = await db.query(
            `SELECT t.*, d.village_id, v.name as village_name
             FROM telemetry t
             LEFT JOIN devices d ON t.device_id = d.device_id
             LEFT JOIN villages v ON d.village_id = v.id
             WHERE t.device_id = $1
             AND (
               ($2 = 'leak' AND (t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True')) OR
               ($2 = 'contamination' AND (t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True')) OR
               ($2 = 'high_pressure' AND t.pressure > 800) OR
               ($2 = 'low_pressure' AND t.pressure < 200) OR
               ($2 = 'low_flow' AND (t.flow_rate < 5 OR t.flow_rate < 0)) OR
               ($2 = 'high_turbidity' AND t.turbidity > 10)
             )
             ORDER BY t.timestamp DESC
             LIMIT 1`,
            [deviceId, issueType]
          );
          
          if (telemetryResult.rows.length > 0) {
            const telemetry = telemetryResult.rows[0];
            
            // Determine severity
            let severity = 'medium';
            let description = `Issue detected: ${issueType}`;
            
            if (issueType === 'leak' || issueType === 'high_pressure') {
              severity = 'critical';
            } else if (issueType === 'contamination' || issueType === 'low_pressure' || issueType === 'low_flow' || issueType === 'high_turbidity') {
              severity = 'high';
            }
            
            // Create description based on issue type
            if (issueType === 'leak') {
              description = 'Critical: Water leak detected - immediate action required';
            } else if (issueType === 'contamination') {
              description = 'High: Water contamination detected - turbidity/quality issues';
            } else if (issueType === 'high_pressure') {
              description = 'Critical: Pressure exceeds safe limit (>800 bar)';
            } else if (issueType === 'low_pressure') {
              description = 'High: Low pressure detected - water supply may be affected';
            } else if (issueType === 'low_flow') {
              description = 'High: Flow rate critically low or negative';
            } else if (issueType === 'high_turbidity') {
              description = 'High: Turbidity exceeds acceptable levels (>10 NTU)';
            }
            
            // Create the ticket
            const newTicket = await createTicket({
              device_id: deviceId,
              issue_type: issueType,
              description: description,
              severity: severity,
              gps_lat: telemetry.gps_lat,
              gps_lon: telemetry.gps_lon
            });
            
            actualTicketId = newTicket.id;
            logger.info(`Created ticket ${newTicket.ticket_id} from dynamic ticket ${ticketId}`);
          } else {
            throw new Error(`Could not find telemetry data for dynamic ticket ${ticketId}`);
          }
        }
      }
    }
    
    // Now update the actual ticket
    let query = `UPDATE tickets SET status = $1, updated_at = CURRENT_TIMESTAMP`;
    const params = [status, actualTicketId];
    let paramCount = 2;

    // If a worker/user ID is provided, attach the ticket to them when they
    // first accept or work on it. This keeps dashboard Tickets in sync with
    // mobile worker actions.
    if (userId) {
      query += `, assigned_to = COALESCE(assigned_to, $${paramCount + 1})`;
    }

    if (status === 'accepted') {
      query += `, accepted = true, accepted_at = CURRENT_TIMESTAMP`;
    }

    if (status === 'completed') {
      query += `, completed = true, completed_at = CURRENT_TIMESTAMP`;
    }

    if (notes) {
      query += `, worker_notes = $${paramCount + 1}`;
      params.push(notes);
      paramCount++;
    }

    if (userId) {
      params.push(userId);
    }

    query += ` WHERE id = $2 RETURNING *`;

    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }

    // Update anomaly if ticket is completed
    if (status === 'completed' && result.rows[0].anomaly_id) {
      await db.query(
        `UPDATE anomalies SET resolved_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [result.rows[0].anomaly_id]
      );
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error updating ticket status:', error);
    throw error;
  }
}

async function sendTicketWhatsAppNotification(ticket) {
  try {
    // Get village ID from device
    const deviceResult = await db.query(
      'SELECT village_id, device_type FROM devices WHERE device_id = $1',
      [ticket.device_id]
    );
    
    let villageId = null;
    if (deviceResult.rows.length > 0) {
      villageId = deviceResult.rows[0].village_id;
    }
    
    // Get all contacts with opt-in - village-specific + global contacts
    let contactsQuery;
    let contactsParams = [];
    
    if (villageId) {
      // Get contacts for this specific village OR contacts with no village assigned (global contacts)
      contactsQuery = `SELECT id, phone, name, role, villages FROM whatsapp_contacts 
                       WHERE whatsapp_opt_in = true 
                       AND (villages = '{}' OR $1 = ANY(villages))
                       ORDER BY role DESC, name ASC`;
      contactsParams = [villageId];
    } else {
      // If no village, send to all global contacts (empty villages array)
      contactsQuery = `SELECT id, phone, name, role, villages FROM whatsapp_contacts 
                       WHERE whatsapp_opt_in = true 
                       AND villages = '{}'
                       ORDER BY role DESC, name ASC`;
    }
    
    const contactsResult = await db.query(contactsQuery, contactsParams);
    
    if (contactsResult.rows.length === 0) {
      logger.warn(`No contacts found with opt-in for ticket ${ticket.ticket_id}`);
      return { sent: 0, total: 0 };
    }
    
    // Format ticket message with better details
    const gpsLink = ticket.gps_lat && ticket.gps_lon
      ? `https://maps.google.com/?q=${ticket.gps_lat},${ticket.gps_lon}`
      : 'N/A';
    
    const severityEmoji = {
      'critical': '🔴',
      'high': '🟠',
      'medium': '🟡',
      'low': '🟢'
    }[ticket.severity?.toLowerCase()] || '⚪';
    
    const ticketMessage = `${severityEmoji} *🎫 NEW TICKET CREATED*\n\n` +
      `*Ticket ID:* ${ticket.ticket_id}\n` +
      `*Issue Type:* ${ticket.issue_type?.toUpperCase() || 'N/A'}\n` +
      `*Severity:* ${ticket.severity?.toUpperCase() || 'N/A'}\n` +
      `*Device:* ${ticket.device_id}\n` +
      `*Location:* ${gpsLink}\n` +
      `*Description:* ${ticket.description || 'N/A'}\n\n` +
      `⚠️ *Action Required*\n` +
      `Please check the dashboard and take necessary action.\n\n` +
      `_JalRakshak Water Monitoring System_`;
    
    // Send to all relevant contacts
    let successCount = 0;
    for (const contact of contactsResult.rows) {
      try {
        await whatsappService.sendMessage(contact.phone, ticketMessage);
        // Log message with contact ID and ticket ID
        await whatsappService.logWhatsAppMessage(
          contact.id,
          contact.phone,
          'ticket',
          'outgoing',
          ticketMessage,
          { ticket_id: ticket.ticket_id, status: 'sent' },
          ticket.id
        );
        logger.info(`Ticket notification sent to ${contact.phone} (${contact.name}) for ticket ${ticket.ticket_id}`);
        successCount++;
      } catch (error) {
        logger.error(`Failed to send ticket notification to ${contact.phone} for ticket ${ticket.ticket_id}:`, error);
      }
    }
    
    logger.info(`Ticket ${ticket.ticket_id} notification sent to ${successCount} out of ${contactsResult.rows.length} contacts`);
    return { sent: successCount, total: contactsResult.rows.length };
  } catch (error) {
    logger.error(`Error sending WhatsApp for ticket ${ticket.ticket_id}:`, error);
    return { sent: 0, total: 0, error: error.message };
  }
}

async function sendWhatsAppForAllOpenTickets() {
  try {
    // Get all open tickets that haven't been sent yet
    // We'll check whatsapp_messages to see which tickets have been sent
    const openTickets = await db.query(
      `SELECT t.*, d.village_id, d.device_type, v.name as village_name
       FROM tickets t
       LEFT JOIN devices d ON t.device_id = d.device_id
       LEFT JOIN villages v ON d.village_id = v.id
       WHERE t.status IN ('open', 'assigned')
       AND t.id NOT IN (
         SELECT DISTINCT ticket_id 
         FROM whatsapp_messages 
         WHERE ticket_id IS NOT NULL 
         AND message_type = 'ticket'
         AND direction = 'outgoing'
       )
       ORDER BY t.created_at DESC
       LIMIT 100`
    );
    
    if (openTickets.rows.length === 0) {
      logger.info('No open tickets found that need WhatsApp notifications');
      return { processed: 0, sent: 0 };
    }
    
    logger.info(`Found ${openTickets.rows.length} open tickets to send WhatsApp notifications`);
    
    let totalSent = 0;
    let totalContacts = 0;
    
    for (const ticket of openTickets.rows) {
      const result = await sendTicketWhatsAppNotification(ticket);
      totalSent += result.sent || 0;
      totalContacts += result.total || 0;
    }
    
    logger.info(`WhatsApp notifications sent for ${openTickets.rows.length} tickets: ${totalSent} messages sent to ${totalContacts} contacts`);
    return { 
      processed: openTickets.rows.length, 
      sent: totalSent, 
      totalContacts: totalContacts 
    };
  } catch (error) {
    logger.error('Error sending WhatsApp for all open tickets:', error);
    throw error;
  }
}

async function getTickets(filters = {}) {
  try {
    // First get tickets from database
    let query = `
      SELECT 
        t.*, 
        an.anomaly_type, 
        d.village_id, 
        d.device_type,
        v.name as village_name,
        u.username as assigned_to_name, 
        u.phone as assigned_to_phone
      FROM tickets t
      LEFT JOIN anomalies an ON t.anomaly_id = an.id
      LEFT JOIN devices d ON t.device_id = d.device_id
      LEFT JOIN villages v ON d.village_id = v.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (filters.village_id) {
      query += ` AND d.village_id = $${paramCount}`;
      params.push(filters.village_id);
      paramCount++;
    }

    if (filters.status) {
      query += ` AND t.status = $${paramCount}`;
      params.push(filters.status);
      paramCount++;
    }

    if (filters.assigned_to) {
      query += ` AND t.assigned_to = $${paramCount}`;
      params.push(filters.assigned_to);
      paramCount++;
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${paramCount}`;
    params.push(filters.limit || 1000);

    const dbTickets = await db.query(query, params);
    
    // Also get dynamic tickets from telemetry data (for high/critical severity issues)
    // This ensures we show tickets even if they haven't been processed into the tickets table yet
    let dynamicTicketsQuery = `
      SELECT DISTINCT ON (t.device_id, 
        CASE 
          WHEN t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' THEN 'leak'
          WHEN t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' THEN 'contamination'
          WHEN t.pressure > 800 THEN 'high_pressure'
          WHEN t.pressure < 200 THEN 'low_pressure'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'low_flow'
          WHEN t.turbidity > 10 THEN 'high_turbidity'
          ELSE NULL
        END
      )
        t.device_id,
        t.timestamp,
        t.gps_lat,
        t.gps_lon,
        d.village_id,
        d.device_type,
        v.name as village_name,
        CASE 
          WHEN t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' THEN 'leak'
          WHEN t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' THEN 'contamination'
          WHEN t.pressure > 800 THEN 'high_pressure'
          WHEN t.pressure < 200 THEN 'low_pressure'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'low_flow'
          WHEN t.turbidity > 10 THEN 'high_turbidity'
          ELSE NULL
        END as issue_type,
        CASE 
          WHEN t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' THEN 'critical'
          WHEN t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' THEN 'high'
          WHEN t.pressure > 800 THEN 'critical'
          WHEN t.pressure < 200 THEN 'high'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'high'
          WHEN t.turbidity > 10 THEN 'high'
          ELSE NULL
        END as severity,
        CASE 
          WHEN t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' THEN 'Critical: Water leak detected - immediate action required'
          WHEN t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' THEN 'High: Water contamination detected - turbidity/quality issues'
          WHEN t.pressure > 800 THEN 'Critical: Pressure exceeds safe limit (>800 bar)'
          WHEN t.pressure < 200 THEN 'High: Low pressure detected - water supply may be affected'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'High: Flow rate critically low or negative'
          WHEN t.turbidity > 10 THEN 'High: Turbidity exceeds acceptable levels (>10 NTU)'
          ELSE NULL
        END as description
      FROM telemetry t
      LEFT JOIN devices d ON t.device_id = d.device_id
      LEFT JOIN villages v ON d.village_id = v.id
      WHERE (
        (t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True') OR
        (t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True') OR
        t.pressure > 800 OR
        t.pressure < 200 OR
        t.flow_rate < 5 OR t.flow_rate < 0 OR
        t.turbidity > 10
      )
      AND (
        CASE 
          WHEN t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' THEN 'critical'
          WHEN t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' THEN 'high'
          WHEN t.pressure > 800 THEN 'critical'
          WHEN t.pressure < 200 THEN 'high'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'high'
          WHEN t.turbidity > 10 THEN 'high'
          ELSE NULL
        END IN ('high', 'critical')
      )
    `;
    
    const dynamicParams = [];
    let dynamicParamCount = 1;
    
    if (filters.village_id) {
      dynamicTicketsQuery += ` AND d.village_id = $${dynamicParamCount}`;
      dynamicParams.push(filters.village_id);
      dynamicParamCount++;
    }
    
    if (filters.status) {
      // For dynamic tickets, we only show 'open' status ones
      if (filters.status !== 'open') {
        // If filtering for non-open status, only return DB tickets
    const result = await db.query(query, params);
    return result.rows;
      }
    }
    
    dynamicTicketsQuery += `
      AND NOT EXISTS (
        SELECT 1 FROM tickets t2
        WHERE t2.device_id = t.device_id
        AND t2.issue_type = (
          CASE 
            WHEN t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' THEN 'leak'
            WHEN t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' THEN 'contamination'
            WHEN t.pressure > 800 THEN 'high_pressure'
            WHEN t.pressure < 200 THEN 'low_pressure'
            WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'low_flow'
            WHEN t.turbidity > 10 THEN 'high_turbidity'
            ELSE NULL
          END
        )
        AND DATE(t2.created_at) = DATE(t.timestamp)
        AND t2.status = 'open'
      )
      ORDER BY t.device_id, 
        CASE 
          WHEN t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' THEN 'leak'
          WHEN t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' THEN 'contamination'
          WHEN t.pressure > 800 THEN 'high_pressure'
          WHEN t.pressure < 200 THEN 'low_pressure'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'low_flow'
          WHEN t.turbidity > 10 THEN 'high_turbidity'
          ELSE NULL
        END,
        t.timestamp DESC
      LIMIT 500
    `;
    
    const dynamicResult = await db.query(dynamicTicketsQuery, dynamicParams);
    
    // Convert dynamic tickets to ticket format
    const dynamicTickets = dynamicResult.rows
      .filter(row => row.issue_type && row.severity)
      .map((row, index) => ({
        id: `dynamic-${row.device_id}-${row.issue_type}-${index}`,
        ticket_id: `TKT-DYN-${Date.now()}-${index}`,
        device_id: row.device_id,
        issue_type: row.issue_type,
        severity: row.severity,
        description: row.description,
        gps_lat: row.gps_lat,
        gps_lon: row.gps_lon,
        status: 'open',
        created_at: row.timestamp,
        updated_at: row.timestamp,
        village_id: row.village_id,
        device_type: row.device_type,
        village_name: row.village_name,
        anomaly_type: row.issue_type,
        is_dynamic: true
      }));
    
    // Combine database tickets and dynamic tickets, removing duplicates
    const ticketMap = new Map();
    
    // Add database tickets first
    dbTickets.rows.forEach(ticket => {
      const key = `${ticket.device_id}-${ticket.issue_type}-${new Date(ticket.created_at).toISOString().split('T')[0]}`;
      ticketMap.set(key, ticket);
    });
    
    // Add dynamic tickets if they don't already exist
    dynamicTickets.forEach(ticket => {
      const key = `${ticket.device_id}-${ticket.issue_type}-${new Date(ticket.created_at).toISOString().split('T')[0]}`;
      if (!ticketMap.has(key)) {
        ticketMap.set(key, ticket);
      }
    });
    
    // Filter by status if specified
    let combinedTickets = Array.from(ticketMap.values());
    if (filters.status) {
      combinedTickets = combinedTickets.filter(t => t.status === filters.status);
    }
    
    // Sort by created_at (newest first) and limit
    combinedTickets.sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateB - dateA;
    });
    
    return combinedTickets.slice(0, filters.limit || 1000);
  } catch (error) {
    logger.error('Error getting tickets:', error);
    throw error;
  }
}

module.exports = {
  createTicket,
  assignTicket,
  updateTicketStatus,
  getTickets,
  sendTicketWhatsAppNotification,
  sendWhatsAppForAllOpenTickets,
};






