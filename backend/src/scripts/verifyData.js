require('dotenv').config();
const db = require('../db/connection');

async function verifyData() {
  try {
    await db.connect();
    console.log('Database connected\n');

    // Check telemetry count
    const telemetryResult = await db.query('SELECT COUNT(*) as count FROM telemetry');
    console.log(`Total telemetry records: ${telemetryResult.rows[0].count}`);

    // Check devices count
    const devicesResult = await db.query('SELECT COUNT(*) as count FROM devices');
    console.log(`Total devices: ${devicesResult.rows[0].count}`);

    // Check villages count
    const villagesResult = await db.query('SELECT COUNT(*) as count FROM villages');
    console.log(`Total villages: ${villagesResult.rows[0].count}`);

    // Check sample data
    const sampleResult = await db.query(`
      SELECT device_id, COUNT(*) as count 
      FROM telemetry 
      GROUP BY device_id 
      ORDER BY count DESC 
      LIMIT 5
    `);
    console.log('\nTop 5 devices by record count:');
    sampleResult.rows.forEach(row => {
      console.log(`  ${row.device_id}: ${row.count} records`);
    });

    // Check recent data
    const recentResult = await db.query(`
      SELECT device_id, timestamp, flow_rate, pressure, turbidity, temperature
      FROM telemetry
      ORDER BY timestamp DESC
      LIMIT 3
    `);
    console.log('\nMost recent 3 records:');
    recentResult.rows.forEach(row => {
      console.log(`  Device: ${row.device_id}, Time: ${row.timestamp}`);
      console.log(`    Flow: ${row.flow_rate}, Pressure: ${row.pressure}, Turbidity: ${row.turbidity}, Temp: ${row.temperature}`);
    });

    await db.disconnect();
    console.log('\nVerification complete!');
  } catch (error) {
    console.error('Error:', error.message);
    await db.disconnect();
    process.exit(1);
  }
}

verifyData();

