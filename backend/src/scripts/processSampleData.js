require('dotenv').config();
const dataProcessorService = require('../services/dataProcessorService');
const db = require('../db/connection');
const logger = require('../utils/logger');

async function main() {
  try {
    logger.info('Connecting to database...');
    await db.connect();
    
    // Process a sample of 1000 records to create alerts and tickets
    // This will detect anomalies and create alerts/tickets for high/critical severity issues
    logger.info('Processing sample telemetry data through AI to detect issues...');
    const result = await dataProcessorService.processTelemetryData(null, 1000);
    
    logger.info('Processing complete:', result);
    logger.info(`Created ${result.alertsCreated} alerts and ${result.ticketsCreated} tickets`);
    
    // Check final counts
    const alertsResult = await db.query('SELECT COUNT(*) as count FROM alerts WHERE acknowledged = false');
    const ticketsResult = await db.query('SELECT COUNT(*) as count FROM tickets WHERE status = \'open\'');
    
    logger.info(`\nCurrent status:`);
    logger.info(`- Unacknowledged Alerts: ${alertsResult.rows[0].count}`);
    logger.info(`- Open Tickets: ${ticketsResult.rows[0].count}`);
    
    await db.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Error processing data:', error);
    await db.disconnect();
    process.exit(1);
  }
}

main();

