const db = require('../db/connection');
const logger = require('../utils/logger');
const aiService = require('./aiService');
const alertService = require('./alertService');
const ticketService = require('./ticketService');
const whatsappService = require('./whatsappService');
const telemetryService = require('./telemetryService');

/**
 * Process telemetry data through AI and create alerts/tickets if issues detected
 */
async function processTelemetryData(telemetryId = null, limit = 100) {
  try {
    let query = `
      SELECT t.*, d.village_id, d.device_type
      FROM telemetry t
      LEFT JOIN devices d ON t.device_id = d.device_id
      WHERE (
        -- Include records with leak_flag or contamination_flag in metadata
        (t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True') OR
        (t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True') OR
        -- Or check if anomaly doesn't exist yet
        NOT EXISTS (
          SELECT 1 FROM anomalies an 
          WHERE an.device_id = t.device_id 
          AND an.detected_at::date = t.timestamp::date
          AND an.anomaly_type IN ('leak', 'contamination', 'pressure_anomaly', 'turbidity_anomaly')
        )
      )
    `;
    const params = [];
    
    if (telemetryId) {
      query += ` AND t.id = $1`;
      params.push(telemetryId);
    } else {
      // Get recent unprocessed telemetry
      query += ` ORDER BY t.timestamp DESC LIMIT $1`;
      params.push(limit);
    }
    
    const result = await db.query(query, params);
    const telemetryRecords = result.rows;
    
    logger.info(`Processing ${telemetryRecords.length} telemetry records through AI...`);
    
    let alertsCreated = 0;
    let ticketsCreated = 0;
    let whatsappSent = 0;
    
    for (const telemetry of telemetryRecords) {
      try {
        // Parse metadata to check for leak_flag, contamination_flag, etc.
        let metadata = {};
        if (telemetry.metadata) {
          if (typeof telemetry.metadata === 'string') {
            try {
              metadata = JSON.parse(telemetry.metadata);
            } catch (e) {
              metadata = {};
            }
          } else {
            metadata = telemetry.metadata;
          }
        }
        
        // Check for leak_flag, contamination_flag, anomaly_flag in metadata
        const leakFlag = metadata.leak_flag === true || metadata.leak_flag === 'true' || metadata.leak_flag === 'True';
        const contaminationFlag = metadata.contamination_flag === true || metadata.contamination_flag === 'true' || metadata.contamination_flag === 'True';
        const anomalyFlag = metadata.anomaly_flag === true || metadata.anomaly_flag === 'true' || metadata.anomaly_flag === 'True';
        
        // If leak_flag is true, create alert and ticket immediately
        if (leakFlag) {
          logger.info(`Leakage detected from dataset for device ${telemetry.device_id}`);
          
          const alert = await alertService.createAlert({
            device_id: telemetry.device_id,
            type: 'leak',
            severity: 'critical',
            confidence: 0.95, // High confidence since it's from dataset
            gps_lat: telemetry.gps_lat ? parseFloat(telemetry.gps_lat) : null,
            gps_lon: telemetry.gps_lon ? parseFloat(telemetry.gps_lon) : null,
            description: 'Critical: Water leak detected - immediate action required'
          });
          
          alertsCreated++;
          
          // Send WhatsApp alert
          try {
            await whatsappService.sendAlert(alert);
            whatsappSent++;
          } catch (error) {
            logger.error(`Failed to send WhatsApp for leak alert ${alert.id}:`, error);
          }
          
          // Ticket is automatically created by alertService for critical severity
          if (alert.ticket_id) {
            ticketsCreated++;
            // WhatsApp for ticket is sent by ticketService.createTicket
          }
          
          // Skip AI analysis for this record since we already handled it
          continue;
        }
        
        // If contamination_flag is true, create alert
        if (contaminationFlag) {
          logger.info(`Contamination detected from dataset for device ${telemetry.device_id}`);
          
          const alert = await alertService.createAlert({
            device_id: telemetry.device_id,
            type: 'contamination',
            severity: 'high',
            confidence: 0.90,
            gps_lat: telemetry.gps_lat ? parseFloat(telemetry.gps_lat) : null,
            gps_lon: telemetry.gps_lon ? parseFloat(telemetry.gps_lon) : null,
            description: 'High: Water contamination detected - turbidity/quality issues'
          });
          
          alertsCreated++;
          
          // Send WhatsApp alert
          try {
            await whatsappService.sendAlert(alert);
            whatsappSent++;
          } catch (error) {
            logger.error(`Failed to send WhatsApp for contamination alert ${alert.id}:`, error);
          }
          
          // Ticket is automatically created by alertService for high severity
          if (alert.ticket_id) {
            ticketsCreated++;
          }
          
          // Skip AI analysis for this record since we already handled it
          continue;
        }
        
        // Prepare telemetry data for AI analysis
        const telemetryData = {
          device_id: telemetry.device_id,
          flow_rate: parseFloat(telemetry.flow_rate) || 0,
          pressure: parseFloat(telemetry.pressure) || 0,
          turbidity: parseFloat(telemetry.turbidity) || 0,
          temperature: parseFloat(telemetry.temperature) || 0,
          ph: telemetry.ph ? parseFloat(telemetry.ph) : null,
          conductivity: telemetry.conductivity ? parseFloat(telemetry.conductivity) : null,
          timestamp: telemetry.timestamp,
          gps_lat: telemetry.gps_lat ? parseFloat(telemetry.gps_lat) : null,
          gps_lon: telemetry.gps_lon ? parseFloat(telemetry.gps_lon) : null
        };
        
        // Send to AI service for analysis
        const aiResult = await aiService.analyzeTelemetry(telemetryData);
        
        // Attach water quality if available
        if (aiResult.water_quality) {
          await telemetryService.attachWaterQuality(telemetry.id, aiResult.water_quality);
        }
        
        // If anomaly detected, create alert and ticket
        if (aiResult.anomaly_detected) {
          const gpsEstimate = aiResult.gps_estimate || {};
          const alert = await alertService.createAlert({
            device_id: telemetry.device_id,
            type: aiResult.anomaly_type,
            severity: aiResult.severity,
            confidence: aiResult.confidence,
            gps_lat: gpsEstimate.lat || telemetry.gps_lat,
            gps_lon: gpsEstimate.lon || telemetry.gps_lon,
            description: aiResult.description || `${aiResult.anomaly_type} detected with ${aiResult.severity} severity`
          });
          
          alertsCreated++;
          
          // Send WhatsApp alert
          try {
            await whatsappService.sendAlert(alert);
            whatsappSent++;
          } catch (error) {
            logger.error(`Failed to send WhatsApp for alert ${alert.id}:`, error);
          }
          
          // If ticket was created (high/critical severity), send WhatsApp for ticket too
          if (alert.ticket_id) {
            try {
              // Get the ticket details
              const ticketResult = await db.query(
                'SELECT * FROM tickets WHERE id = $1',
                [alert.ticket_id]
              );
              
              if (ticketResult.rows.length > 0) {
                const ticket = ticketResult.rows[0];
                ticketsCreated++;
                
                // Get village contacts to send ticket notification
                const villageResult = await db.query(
                  'SELECT village_id FROM devices WHERE device_id = $1',
                  [telemetry.device_id]
                );
                
                if (villageResult.rows.length > 0) {
                  const villageId = villageResult.rows[0].village_id;
                  
                  // Get contacts for this village
                  const contactsResult = await db.query(
                    `SELECT phone, name FROM whatsapp_contacts 
                     WHERE whatsapp_opt_in = true 
                     AND (villages = '{}' OR $1 = ANY(villages))`,
                    [villageId]
                  );
                  
                  // Send ticket notification to all relevant contacts
                  for (const contact of contactsResult.rows) {
                    try {
                      const ticketMessage = `🎫 *New Ticket Created*\n\n` +
                        `Ticket ID: ${ticket.ticket_id}\n` +
                        `Issue: ${ticket.issue_type}\n` +
                        `Severity: ${ticket.severity.toUpperCase()}\n` +
                        `Device: ${ticket.device_id}\n` +
                        `Description: ${ticket.description || 'N/A'}\n\n` +
                        `Please check the dashboard for more details.`;
                      
                      await whatsappService.sendMessage(contact.phone, ticketMessage);
                      logger.info(`Ticket notification sent to ${contact.phone} (${contact.name})`);
                    } catch (error) {
                      logger.error(`Failed to send ticket notification to ${contact.phone}:`, error);
                    }
                  }
                }
              }
            } catch (error) {
              logger.error(`Failed to send WhatsApp for ticket ${alert.ticket_id}:`, error);
            }
          }
        }
      } catch (error) {
        logger.error(`Error processing telemetry ${telemetry.id}:`, error);
        // Continue with next record
      }
    }
    
    logger.info(`Processing complete: ${alertsCreated} alerts, ${ticketsCreated} tickets, ${whatsappSent} WhatsApp messages sent`);
    
    return {
      processed: telemetryRecords.length,
      alertsCreated,
      ticketsCreated,
      whatsappSent
    };
  } catch (error) {
    logger.error('Error processing telemetry data:', error);
    throw error;
  }
}

/**
 * Process all unprocessed telemetry data in batches
 */
async function processAllTelemetryData(batchSize = 100) {
  try {
    let totalProcessed = 0;
    let totalAlerts = 0;
    let totalTickets = 0;
    let totalWhatsApp = 0;
    
    while (true) {
      const result = await processTelemetryData(null, batchSize);
      
      totalProcessed += result.processed;
      totalAlerts += result.alertsCreated;
      totalTickets += result.ticketsCreated;
      totalWhatsApp += result.whatsappSent;
      
      // If no more records to process, break
      if (result.processed === 0) {
        break;
      }
      
      // Small delay between batches to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return {
      totalProcessed,
      totalAlerts,
      totalTickets,
      totalWhatsApp
    };
  } catch (error) {
    logger.error('Error processing all telemetry data:', error);
    throw error;
  }
}

module.exports = {
  processTelemetryData,
  processAllTelemetryData
};

