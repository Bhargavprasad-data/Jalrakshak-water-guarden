require('dotenv').config();
const db = require('../db/connection');
const logger = require('../utils/logger');
const alertService = require('../services/alertService');
const ticketService = require('../services/ticketService');

async function createAlertsFromTelemetry() {
  try {
    await db.connect();
    logger.info('Creating alerts and tickets from telemetry data...');

    // Find telemetry records with potential issues
    // 1. High pressure (> 800 bar)
    // 2. Low/negative flow rate (< 5 L/min)
    // 3. High turbidity (> 10 NTU)
    // 4. Low pH (< 6.5) or High pH (> 8.5)

    const issues = await db.query(`
      SELECT DISTINCT ON (device_id, issue_type)
        t.device_id,
        t.timestamp,
        t.pressure,
        t.flow_rate,
        t.turbidity,
        t.ph,
        t.temperature,
        t.gps_lat,
        t.gps_lon,
        CASE
          WHEN t.pressure > 800 THEN 'high_pressure'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'low_flow'
          WHEN t.turbidity > 10 THEN 'high_turbidity'
          WHEN t.ph < 6.5 THEN 'low_ph'
          WHEN t.ph > 8.5 THEN 'high_ph'
          ELSE NULL
        END as issue_type,
        CASE
          WHEN t.pressure > 800 THEN 'critical'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'high'
          WHEN t.turbidity > 10 THEN 'high'
          WHEN t.ph < 6.5 OR t.ph > 8.5 THEN 'medium'
          ELSE NULL
        END as severity,
        CASE
          WHEN t.pressure > 800 THEN 'Critical: Pressure exceeds safe limit (>800 bar)'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'High: Flow rate critically low or negative'
          WHEN t.turbidity > 10 THEN 'High: Turbidity exceeds acceptable levels (>10 NTU)'
          WHEN t.ph < 6.5 THEN 'Medium: pH below optimal range (<6.5)'
          WHEN t.ph > 8.5 THEN 'Medium: pH above optimal range (>8.5)'
          ELSE NULL
        END as description
      FROM telemetry t
      WHERE (
        t.pressure > 800 OR
        t.flow_rate < 5 OR t.flow_rate < 0 OR
        t.turbidity > 10 OR
        (t.ph < 6.5 OR t.ph > 8.5)
      )
      AND t.timestamp > NOW() - INTERVAL '30 days'
      ORDER BY device_id, issue_type, t.timestamp DESC
      LIMIT 50
    `);

    logger.info(`Found ${issues.rows.length} potential issues`);

    let alertsCreated = 0;
    let ticketsCreated = 0;

    for (const issue of issues.rows) {
      if (!issue.issue_type) continue;

      try {
        // Check if alert already exists for this device and issue type
        const existingAlert = await db.query(`
          SELECT id FROM alerts a
          JOIN anomalies an ON a.anomaly_id = an.id
          WHERE a.device_id = $1
          AND an.anomaly_type = $2
          AND a.acknowledged = false
          AND a.sent_at > NOW() - INTERVAL '1 day'
        `, [issue.device_id, issue.issue_type]);

        if (existingAlert.rows.length > 0) {
          continue; // Skip if alert already exists
        }

        // Create alert
        const alert = await alertService.createAlert({
          device_id: issue.device_id,
          type: issue.issue_type,
          severity: issue.severity,
          confidence: 0.85,
          gps_lat: issue.gps_lat,
          gps_lon: issue.gps_lon,
          description: issue.description
        });

        alertsCreated++;

        // Create ticket for high/critical severity
        if (issue.severity === 'high' || issue.severity === 'critical') {
          // Check if ticket already exists
          const existingTicket = await db.query(`
            SELECT id FROM tickets
            WHERE device_id = $1
            AND issue_type = $2
            AND status IN ('open', 'accepted', 'in_progress')
            AND created_at > NOW() - INTERVAL '7 days'
          `, [issue.device_id, issue.issue_type]);

          if (existingTicket.rows.length === 0) {
            await ticketService.createTicket({
              anomaly_id: null, // Will be set by alertService
              device_id: issue.device_id,
              issue_type: issue.issue_type,
              description: issue.description,
              severity: issue.severity,
              gps_lat: issue.gps_lat,
              gps_lon: issue.gps_lon
            });
            ticketsCreated++;
          }
        }
      } catch (error) {
        logger.error(`Error creating alert for ${issue.device_id}:`, error.message);
      }
    }

    // Get final counts
    const alertsResult = await db.query('SELECT COUNT(*) as count FROM alerts WHERE acknowledged = false');
    const ticketsResult = await db.query('SELECT COUNT(*) as count FROM tickets WHERE status = \'open\'');

    logger.info(`\n=== Summary ===`);
    logger.info(`Created ${alertsCreated} new alerts`);
    logger.info(`Created ${ticketsCreated} new tickets`);
    logger.info(`Total unacknowledged alerts: ${alertsResult.rows[0].count}`);
    logger.info(`Total open tickets: ${ticketsResult.rows[0].count}`);

    await db.disconnect();
    return { alertsCreated, ticketsCreated };
  } catch (error) {
    logger.error('Error creating alerts:', error);
    await db.disconnect();
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createAlertsFromTelemetry()
    .then(() => {
      logger.info('Process completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Process failed:', error);
      process.exit(1);
    });
}

module.exports = { createAlertsFromTelemetry };

