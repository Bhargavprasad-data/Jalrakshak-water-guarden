require('dotenv').config();
const dataProcessorService = require('../services/dataProcessorService');
const db = require('../db/connection');
const logger = require('../utils/logger');

async function main() {
  try {
    logger.info('Connecting to database...');
    await db.connect();
    
    const args = process.argv.slice(2);
    const processAll = args.includes('--all');
    const limit = parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1]) || 100;
    
    if (processAll) {
      logger.info('Processing ALL unprocessed telemetry data...');
      const result = await dataProcessorService.processAllTelemetryData(limit);
      logger.info('Processing complete:', result);
    } else {
      logger.info(`Processing ${limit} telemetry records...`);
      const result = await dataProcessorService.processTelemetryData(null, limit);
      logger.info('Processing complete:', result);
    }
    
    await db.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Error processing telemetry data:', error);
    await db.disconnect();
    process.exit(1);
  }
}

main();



