require('dotenv').config();
const db = require('../db/connection');
const logger = require('../utils/logger');

async function updateTelemetryFromMetadata() {
  try {
    logger.info('Starting update of telemetry records from metadata...');
    
    // Process in batches to handle large datasets
    let totalUpdated = 0;
    let totalErrors = 0;
    const batchSize = 10000;
    let hasMore = true;
    let offset = 0;
    
    while (hasMore) {
      const result = await db.query(`
        SELECT id, metadata 
        FROM telemetry 
        WHERE metadata IS NOT NULL 
        AND (ph IS NULL OR conductivity IS NULL OR tds IS NULL)
        ORDER BY timestamp DESC
        LIMIT $1 OFFSET $2
      `, [batchSize, offset]);
      
      if (result.rows.length === 0) {
        hasMore = false;
        break;
      }
      
      logger.info(`Processing batch: ${offset + 1} to ${offset + result.rows.length} records`);
    
      let updated = 0;
      let errors = 0;
      
      for (const row of result.rows) {
      try {
        let metadata = {};
        if (typeof row.metadata === 'string') {
          metadata = JSON.parse(row.metadata);
        } else {
          metadata = row.metadata || {};
        }
        
        // Only update if metadata has values and columns are null
        if (Object.keys(metadata).length > 0) {
          await db.query(`
            UPDATE telemetry SET
              ph = COALESCE(ph, $1::decimal),
              conductivity = COALESCE(conductivity, $2::decimal),
              tds = COALESCE(tds, $3::decimal),
              do_mg_l = COALESCE(do_mg_l, $4::decimal),
              residual_chlorine = COALESCE(residual_chlorine, $5::decimal),
              orp = COALESCE(orp, $6::decimal),
              ammonium = COALESCE(ammonium, $7::decimal),
              nitrate = COALESCE(nitrate, $8::decimal),
              chloride = COALESCE(chloride, $9::decimal),
              tss = COALESCE(tss, $10::decimal),
              cod = COALESCE(cod, $11::decimal),
              bod = COALESCE(bod, $12::decimal),
              toc = COALESCE(toc, $13::decimal)
            WHERE id = $14
          `, [
            metadata.ph || null,
            metadata.conductivity || null,
            metadata.tds || null,
            metadata.do_mg_l || null,
            metadata.residual_chlorine || null,
            metadata.orp || null,
            metadata.ammonium || null,
            metadata.nitrate || null,
            metadata.chloride || null,
            metadata.tss || null,
            metadata.cod || null,
            metadata.bod || null,
            metadata.toc || null,
            row.id
          ]);
          
          updated++;
          totalUpdated++;
          
          if (totalUpdated % 1000 === 0) {
            logger.info(`Total updated: ${totalUpdated} records...`);
          }
        }
      } catch (error) {
        logger.error(`Error updating record ${row.id}:`, error.message);
        errors++;
        totalErrors++;
      }
      }
      
      offset += batchSize;
      hasMore = result.rows.length === batchSize;
    }
    
    logger.info(`\n=== Update Summary ===`);
    logger.info(`Total updated: ${totalUpdated}`);
    logger.info(`Total errors: ${totalErrors}`);
    
  } catch (error) {
    logger.error('Error updating telemetry:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  db.connect()
    .then(() => {
      logger.info('Database connected');
      return updateTelemetryFromMetadata();
    })
    .then(() => {
      logger.info('Update completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Update failed:', error);
      process.exit(1);
    })
    .finally(() => {
      db.disconnect();
    });
}

module.exports = { updateTelemetryFromMetadata };

