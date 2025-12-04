require('dotenv').config();
const db = require('../db/connection');
const logger = require('../utils/logger');
const alertService = require('../services/alertService');
const ticketService = require('../services/ticketService');

async function createTestAlerts() {
  try {
    await db.connect();
    logger.info('Creating test alerts and tickets...');

    // Get some devices
    const devicesResult = await db.query('SELECT device_id FROM devices LIMIT 5');
    const devices = devicesResult.rows;

    if (devices.length === 0) {
      logger.warn('No devices found');
      await db.disconnect();
      return;
    }

    let alertsCreated = 0;
    let ticketsCreated = 0;

    // Create test alerts for different issue types
    const testIssues = [
      {
        type: 'leak',
        severity: 'critical',
        description: 'Potential water leak detected - pressure drop observed'
      },
      {
        type: 'contamination',
        severity: 'high',
        description: 'Water contamination detected - turbidity levels elevated'
      },
      {
        type: 'pressure_anomaly',
        severity: 'high',
        description: 'Pressure anomaly detected - unusual pressure readings'
      },
      {
        type: 'low_pressure',
        severity: 'medium',
        description: 'Low pressure detected - water supply may be affected'
      },
      {
        type: 'high_turbidity',
        severity: 'medium',
        description: 'High turbidity detected - water quality concern'
      }
    ];

    for (let i = 0; i < Math.min(5, devices.length); i++) {
      const device = devices[i];
      const issue = testIssues[i];

      try {
        // Get device GPS coordinates
        const deviceInfo = await db.query(
          'SELECT gps_lat, gps_lon FROM devices WHERE device_id = $1',
          [device.device_id]
        );

        const gps_lat = deviceInfo.rows[0]?.gps_lat || null;
        const gps_lon = deviceInfo.rows[0]?.gps_lon || null;

        // Create alert
        const alert = await alertService.createAlert({
          device_id: device.device_id,
          type: issue.type,
          severity: issue.severity,
          confidence: 0.85,
          gps_lat: gps_lat,
          gps_lon: gps_lon,
          description: issue.description
        });

        alertsCreated++;
        logger.info(`Created alert for ${device.device_id}: ${issue.type}`);

        // Create ticket for high/critical severity
        if (issue.severity === 'high' || issue.severity === 'critical') {
          // The alertService should have already created a ticket, but let's verify
          const ticketCheck = await db.query(
            'SELECT id FROM tickets WHERE device_id = $1 AND issue_type = $2 AND status = $3 ORDER BY created_at DESC LIMIT 1',
            [device.device_id, issue.type, 'open']
          );

          if (ticketCheck.rows.length === 0) {
            // Create ticket manually if not created by alertService
            await ticketService.createTicket({
              anomaly_id: null,
              device_id: device.device_id,
              issue_type: issue.type,
              description: issue.description,
              severity: issue.severity,
              gps_lat: gps_lat,
              gps_lon: gps_lon
            });
            ticketsCreated++;
            logger.info(`Created ticket for ${device.device_id}: ${issue.type}`);
          } else {
            ticketsCreated++;
            logger.info(`Ticket already exists for ${device.device_id}: ${issue.type}`);
          }
        }
      } catch (error) {
        logger.error(`Error creating alert for ${device.device_id}:`, error.message);
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
    logger.error('Error creating test alerts:', error);
    await db.disconnect();
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createTestAlerts()
    .then(() => {
      logger.info('Process completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Process failed:', error);
      process.exit(1);
    });
}

module.exports = { createTestAlerts };

