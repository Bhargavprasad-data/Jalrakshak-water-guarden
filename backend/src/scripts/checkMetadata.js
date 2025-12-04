require('dotenv').config();
const db = require('../db/connection');

async function checkMetadata() {
  try {
    await db.connect();
    
    // Check how flags are stored
    const result = await db.query(`
      SELECT 
        device_id,
        metadata->>'leak_flag' as leak_flag,
        metadata->>'contamination_flag' as contamination_flag,
        metadata->>'anomaly_flag' as anomaly_flag,
        metadata
      FROM telemetry 
      WHERE metadata IS NOT NULL 
      AND (
        metadata->>'leak_flag' IS NOT NULL OR 
        metadata->>'contamination_flag' IS NOT NULL OR 
        metadata->>'anomaly_flag' IS NOT NULL
      )
      LIMIT 10
    `);
    
    console.log('Sample metadata with flags:');
    result.rows.forEach(row => {
      console.log(`Device: ${row.device_id}`);
      console.log(`  leak_flag: ${row.leak_flag} (type: ${typeof row.leak_flag})`);
      console.log(`  contamination_flag: ${row.contamination_flag} (type: ${typeof row.contamination_flag})`);
      console.log(`  anomaly_flag: ${row.anomaly_flag} (type: ${typeof row.anomaly_flag})`);
      console.log(`  Full metadata: ${JSON.stringify(row.metadata)}`);
      console.log('');
    });
    
    // Count records with True flags
    const countResult = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE metadata->>'leak_flag' = 'true' OR metadata->>'leak_flag' = 'True') as leak_true,
        COUNT(*) FILTER (WHERE metadata->>'contamination_flag' = 'true' OR metadata->>'contamination_flag' = 'True') as contamination_true,
        COUNT(*) FILTER (WHERE metadata->>'anomaly_flag' = 'true' OR metadata->>'anomaly_flag' = 'True') as anomaly_true,
        COUNT(*) FILTER (WHERE metadata->>'leak_flag' = 'false' OR metadata->>'leak_flag' = 'False') as leak_false,
        COUNT(*) FILTER (WHERE metadata->>'contamination_flag' = 'false' OR metadata->>'contamination_flag' = 'False') as contamination_false,
        COUNT(*) FILTER (WHERE metadata->>'anomaly_flag' = 'false' OR metadata->>'anomaly_flag' = 'False') as anomaly_false
      FROM telemetry
      WHERE metadata IS NOT NULL
    `);
    
    console.log('Flag counts:');
    console.log(JSON.stringify(countResult.rows[0], null, 2));
    
    await db.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    await db.disconnect();
  }
}

checkMetadata();

