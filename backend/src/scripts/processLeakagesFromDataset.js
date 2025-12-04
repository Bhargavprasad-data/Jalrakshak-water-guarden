require('dotenv').config();
const dataProcessorService = require('../services/dataProcessorService');
const logger = require('../utils/logger');
const db = require('../db/connection');

async function processLeakagesFromDataset() {
  try {
    await db.connect();
    logger.info('Processing leakages from dataset...');
    
    // Process all telemetry data - this will detect leak_flag in metadata
    const result = await dataProcessorService.processAllTelemetryData(100);
    
    logger.info('\n=== Leakage Processing Summary ===');
    logger.info(`Processed: ${result.totalProcessed} telemetry records`);
    logger.info(`Alerts Created: ${result.totalAlerts}`);
    logger.info(`Tickets Created: ${result.totalTickets}`);
    logger.info(`WhatsApp Messages Sent: ${result.totalWhatsApp}`);
    
    // Get counts of leaks detected
    const leakCount = await db.query(`
      SELECT COUNT(*) as count 
      FROM anomalies 
      WHERE anomaly_type = 'leak'
    `);
    
    const openTicketsCount = await db.query(`
      SELECT COUNT(*) as count 
      FROM tickets 
      WHERE status = 'open' AND issue_type = 'leak'
    `);
    
    logger.info(`\nTotal Leaks Detected: ${leakCount.rows[0].count}`);
    logger.info(`Open Leak Tickets: ${openTicketsCount.rows[0].count}`);
    
    await db.disconnect();
    
    console.log('\n✅ Leakage processing completed successfully!');
    console.log(`   Processed: ${result.totalProcessed} records`);
    console.log(`   Alerts: ${result.totalAlerts}`);
    console.log(`   Tickets: ${result.totalTickets}`);
    console.log(`   WhatsApp: ${result.totalWhatsApp}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('Error processing leakages:', error);
    console.error('❌ Error:', error.message);
    await db.disconnect();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  processLeakagesFromDataset();
}

module.exports = processLeakagesFromDataset;



