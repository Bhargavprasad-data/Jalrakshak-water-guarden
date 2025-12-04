require('dotenv').config();
const db = require('../db/connection');
const logger = require('../utils/logger');
const alertService = require('../services/alertService');
const ticketService = require('../services/ticketService');

async function createAlertsFromDataset() {
  try {
    await db.connect();
    logger.info('Creating alerts and tickets from dataset flags...');

    // First, clear existing unacknowledged alerts and open tickets to avoid duplicates
    // Delete in order: tickets -> alerts -> anomalies (to respect foreign key constraints)
    await db.query('DELETE FROM tickets WHERE status = \'open\'');
    await db.query('DELETE FROM alerts WHERE acknowledged = false');
    // Only delete anomalies that are not referenced by any tickets
    await db.query(`
      DELETE FROM anomalies 
      WHERE resolved_at IS NULL 
      AND id NOT IN (SELECT anomaly_id FROM tickets WHERE anomaly_id IS NOT NULL)
    `);

    logger.info('Cleared existing unacknowledged alerts and open tickets');

    // Find telemetry records with flags set to true (handle both string and boolean)
    const issues = await db.query(`
      WITH flagged_issues AS (
        SELECT 
          t.device_id,
          t.timestamp,
          t.pressure,
          t.flow_rate,
          t.turbidity,
          t.ph,
          t.temperature,
          t.gps_lat,
          t.gps_lon,
          t.metadata,
          CASE 
            WHEN t.metadata->>'leak_flag' = 'true' THEN 'leak'
            WHEN t.metadata->>'contamination_flag' = 'true' THEN 'contamination'
            WHEN t.metadata->>'anomaly_flag' = 'true' THEN 'pressure_anomaly'
            WHEN t.pressure > 800 THEN 'high_pressure'
            WHEN t.pressure < 200 THEN 'low_pressure'
            WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'low_flow'
            WHEN t.turbidity > 10 THEN 'high_turbidity'
            WHEN t.ph < 6.5 THEN 'low_ph'
            WHEN t.ph > 8.5 THEN 'high_ph'
            ELSE NULL
          END as issue_type,
          CASE 
            WHEN t.metadata->>'leak_flag' = 'true' THEN 'critical'
            WHEN t.metadata->>'contamination_flag' = 'true' THEN 'high'
            WHEN t.pressure > 800 THEN 'critical'
            WHEN t.pressure < 200 THEN 'high'
            WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'high'
            WHEN t.turbidity > 10 THEN 'high'
            WHEN t.ph < 6.5 OR t.ph > 8.5 THEN 'medium'
            ELSE 'medium'
          END as severity,
          CASE 
            WHEN t.metadata->>'leak_flag' = 'true' THEN 'Critical: Water leak detected - immediate action required'
            WHEN t.metadata->>'contamination_flag' = 'true' THEN 'High: Water contamination detected - turbidity/quality issues'
            WHEN t.pressure > 800 THEN 'Critical: Pressure exceeds safe limit (>800 bar)'
            WHEN t.pressure < 200 THEN 'High: Low pressure detected - water supply may be affected'
            WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'High: Flow rate critically low or negative'
            WHEN t.turbidity > 10 THEN 'High: Turbidity exceeds acceptable levels (>10 NTU)'
            WHEN t.ph < 6.5 THEN 'Medium: pH below optimal range (<6.5)'
            WHEN t.ph > 8.5 THEN 'Medium: pH above optimal range (>8.5)'
            ELSE 'Anomaly detected in sensor readings'
          END as description
        FROM telemetry t
        WHERE (
          (t.metadata->>'leak_flag' = 'true') OR
          (t.metadata->>'contamination_flag' = 'true') OR
          (t.metadata->>'anomaly_flag' = 'true') OR
          t.pressure > 800 OR
          t.pressure < 200 OR
          t.flow_rate < 5 OR t.flow_rate < 0 OR
          t.turbidity > 10 OR
          (t.ph < 6.5 OR t.ph > 8.5)
        )
      )
      SELECT DISTINCT ON (device_id, issue_type)
        *
      FROM flagged_issues
      WHERE issue_type IS NOT NULL
      ORDER BY device_id, issue_type, timestamp DESC
      LIMIT 500
    `);

    logger.info(`Found ${issues.rows.length} issues from dataset`);

    let alertsCreated = 0;
    let ticketsCreated = 0;

    for (const issue of issues.rows) {
      if (!issue.issue_type) continue;

      try {
        // Create alert
        const alert = await alertService.createAlert({
          device_id: issue.device_id,
          type: issue.issue_type,
          severity: issue.severity,
          confidence: 0.90, // High confidence since it's from dataset flags
          gps_lat: issue.gps_lat,
          gps_lon: issue.gps_lon,
          description: issue.description
        });

        alertsCreated++;
        logger.info(`Created alert for ${issue.device_id}: ${issue.issue_type} (${issue.severity})`);

        // Ticket is automatically created by alertService for high/critical severity
        if (issue.severity === 'high' || issue.severity === 'critical') {
          ticketsCreated++;
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
    logger.error('Error creating alerts from dataset:', error);
    await db.disconnect();
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createAlertsFromDataset()
    .then(() => {
      logger.info('Process completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Process failed:', error);
      process.exit(1);
    });
}

module.exports = { createAlertsFromDataset };
