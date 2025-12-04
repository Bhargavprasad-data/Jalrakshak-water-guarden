require('dotenv').config();
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const db = require('../db/connection');
const logger = require('../utils/logger');

// Column mapping from CSV to database
const mapCSVToDB = {
  'timestamp': 'timestamp',
  'device_id': 'device_id',
  'village': 'village',
  'latitude': 'gps_lat',
  'longitude': 'gps_lon',
  'pH': 'ph',
  'turbidity_NTU': 'turbidity',
  'conductivity_uS_cm': 'conductivity',
  'TDS_mg_L': 'tds',
  'temperature_C': 'temperature',
  'DO_mg_L': 'do_mg_l',
  'residual_chlorine_mg_L': 'residual_chlorine',
  'ORP_mV': 'orp',
  'ammonium_mg_L': 'ammonium',
  'nitrate_mg_L': 'nitrate',
  'chloride_mg_L': 'chloride',
  'TSS_mg_L': 'tss',
  'COD_mg_L': 'cod',
  'BOD_mg_L': 'bod',
  'TOC_mg_L': 'toc',
  'pressure_mmhg': 'pressure',
  'flow_L_min': 'flow_rate',
  'battery_pct': 'battery_level',
  'leak_flag': 'leak_flag',
  'contamination_flag': 'contamination_flag',
  'anomaly_flag': 'anomaly_flag'
};

// Convert mmHg to bar (1 mmHg = 0.00133322 bar)
function convertPressureToBar(mmhg) {
  if (mmhg === null || mmhg === undefined || mmhg === '') return null;
  const num = parseFloat(mmhg);
  if (isNaN(num)) return null;
  return num * 0.00133322;
}

// Parse value to number or return null
function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

// Parse value to integer or return null
function parseIntValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  return Math.round(num); // Round to nearest integer
}

// Parse boolean from string
function parseBoolean(value) {
  if (value === null || value === undefined || value === '') return false;
  const str = String(value).toLowerCase().trim();
  return str === 'true' || str === '1' || str === 'yes';
}

// Resolve village name to village_id
async function getOrCreateVillage(villageName, lat, lon) {
  if (!villageName) return null;
  
  // Check if village exists
  const existing = await db.query(
    'SELECT id FROM villages WHERE LOWER(name) = LOWER($1)',
    [String(villageName).trim()]
  );
  
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  
  // Create new village
  try {
    const result = await db.query(
      `INSERT INTO villages (name, gps_lat, gps_lon)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [String(villageName).trim(), parseNumber(lat), parseNumber(lon)]
    );
    logger.info(`Created village: ${villageName}`);
    return result.rows[0].id;
  } catch (error) {
    logger.warn(`Error creating village ${villageName}:`, error.message);
    return null;
  }
}

// Get or create device
async function getOrCreateDevice(deviceId, villageId, lat, lon, batteryLevel, timestamp) {
  if (!deviceId) return null;
  
  // Check if device exists
  const existing = await db.query(
    'SELECT id FROM devices WHERE device_id = $1',
    [deviceId]
  );
  
  if (existing.rows.length > 0) {
        // Update device
        await db.query(
          `UPDATE devices SET 
            village_id = COALESCE($1, village_id),
            gps_lat = COALESCE($2, gps_lat),
            gps_lon = COALESCE($3, gps_lon),
            battery_level = COALESCE($4, battery_level),
            last_seen = COALESCE($5, last_seen),
            updated_at = CURRENT_TIMESTAMP
          WHERE device_id = $6`,
          [villageId, parseNumber(lat), parseNumber(lon), parseIntValue(batteryLevel), timestamp, deviceId]
        );
    return existing.rows[0].id;
  }
  
  // Create new device
  try {
    const result = await db.query(
      `INSERT INTO devices (device_id, village_id, device_type, gps_lat, gps_lon, status, battery_level, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        deviceId,
        villageId,
        'flow_sensor',
        parseNumber(lat),
        parseNumber(lon),
        'active',
        parseIntValue(batteryLevel), // Use parseIntValue for integer column
        timestamp
      ]
    );
    logger.info(`Created device: ${deviceId}`);
    return result.rows[0].id;
  } catch (error) {
    logger.warn(`Error creating device ${deviceId}:`, error.message);
    return null;
  }
}

// Import telemetry data
async function importTelemetryData(filePath, limit = 10000) {
  try {
    logger.info(`Reading CSV file: ${filePath}`);
    logger.info(`Limit: ${limit} rows`);
    
    // Read CSV file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    
    logger.info(`Total rows in CSV: ${data.length}`);
    
    // Limit to specified number of rows
    const rowsToImport = data.slice(0, limit);
    logger.info(`Importing ${rowsToImport.length} rows...`);
    
    let imported = 0;
    let errors = 0;
    const villagesCache = new Map(); // Cache village lookups
    const devicesCache = new Map(); // Cache device lookups
    
    for (let i = 0; i < rowsToImport.length; i++) {
      const row = rowsToImport[i];
      
      try {
        // Extract data
        const deviceId = row.device_id || row['device_id'];
        const villageName = row.village || row['village'];
        const timestamp = row.timestamp || row['timestamp'];
        const lat = row.latitude || row['latitude'];
        const lon = row.longitude || row['longitude'];
        const batteryLevel = row.battery_pct || row['battery_pct'];
        
        if (!deviceId) {
          logger.warn(`Row ${i + 1}: Missing device_id, skipping`);
          errors++;
          continue;
        }
        
        // Parse timestamp
        let parsedTimestamp = new Date();
        if (timestamp) {
          parsedTimestamp = new Date(timestamp);
          if (isNaN(parsedTimestamp.getTime())) {
            parsedTimestamp = new Date();
          }
        }
        
        // Get or create village
        let villageId = null;
        if (villageName) {
          const cacheKey = villageName.toLowerCase().trim();
          if (villagesCache.has(cacheKey)) {
            villageId = villagesCache.get(cacheKey);
          } else {
            villageId = await getOrCreateVillage(villageName, lat, lon);
            if (villageId) {
              villagesCache.set(cacheKey, villageId);
            }
          }
        }
        
        // Get or create device
        if (!devicesCache.has(deviceId)) {
          await getOrCreateDevice(deviceId, villageId, lat, lon, batteryLevel, parsedTimestamp);
          devicesCache.set(deviceId, true);
        } else {
          // Update device last_seen
          await db.query(
            `UPDATE devices SET 
              battery_level = COALESCE($1, battery_level),
              last_seen = COALESCE($2, last_seen),
              updated_at = CURRENT_TIMESTAMP
            WHERE device_id = $3`,
            [parseIntValue(batteryLevel), parsedTimestamp, deviceId]
          );
        }
        
        // Prepare telemetry data
        const pressure = convertPressureToBar(row.pressure_mmhg || row['pressure_mmhg']);
        
        // Build metadata for additional fields
        const metadata = {};
        if (row.leak_flag !== undefined) metadata.leak_flag = parseBoolean(row.leak_flag);
        if (row.contamination_flag !== undefined) metadata.contamination_flag = parseBoolean(row.contamination_flag);
        if (row.anomaly_flag !== undefined) metadata.anomaly_flag = parseBoolean(row.anomaly_flag);
        
        // Insert telemetry record
        await db.query(
          `INSERT INTO telemetry (
            device_id, timestamp, flow_rate, pressure, turbidity, temperature,
            gps_lat, gps_lon, battery_level,
            ph, conductivity, tds, do_mg_l, residual_chlorine, orp,
            ammonium, nitrate, chloride, tss, cod, bod, toc,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
          [
            deviceId,
            parsedTimestamp,
            parseNumber(row.flow_L_min || row['flow_L_min']),
            pressure,
            parseNumber(row.turbidity_NTU || row['turbidity_NTU']),
            parseNumber(row.temperature_C || row['temperature_C']),
            parseNumber(lat),
            parseNumber(lon),
            parseIntValue(batteryLevel), // battery_level is INTEGER in database
            parseNumber(row.pH || row['pH']),
            parseNumber(row.conductivity_uS_cm || row['conductivity_uS_cm']),
            parseNumber(row.TDS_mg_L || row['TDS_mg_L']),
            parseNumber(row.DO_mg_L || row['DO_mg_L']),
            parseNumber(row.residual_chlorine_mg_L || row['residual_chlorine_mg_L']),
            parseNumber(row.ORP_mV || row['ORP_mV']),
            parseNumber(row.ammonium_mg_L || row['ammonium_mg_L']),
            parseNumber(row.nitrate_mg_L || row['nitrate_mg_L']),
            parseNumber(row.chloride_mg_L || row['chloride_mg_L']),
            parseNumber(row.TSS_mg_L || row['TSS_mg_L']),
            parseNumber(row.COD_mg_L || row['COD_mg_L']),
            parseNumber(row.BOD_mg_L || row['BOD_mg_L']),
            parseNumber(row.TOC_mg_L || row['TOC_mg_L']),
            Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null
          ]
        );
        
        imported++;
        
        // Log progress every 1000 records
        if (imported % 1000 === 0) {
          logger.info(`Progress: ${imported}/${rowsToImport.length} records imported...`);
        }
      } catch (error) {
        logger.error(`Error importing row ${i + 1}:`, error.message);
        errors++;
      }
    }
    
    logger.info('');
    logger.info('========================================');
    logger.info('📊 Import Summary:');
    logger.info(`   ✅ Imported: ${imported}`);
    logger.info(`   ❌ Errors: ${errors}`);
    logger.info(`   📦 Total processed: ${rowsToImport.length}`);
    logger.info('========================================');
    
    return { imported, errors };
  } catch (error) {
    logger.error('Import failed:', error);
    throw error;
  }
}

// Main function
async function main() {
  try {
    const args = process.argv.slice(2);
    const filePath = args[0] || path.join(__dirname, '../../Final_Dataset.csv');
    const limit = parseInt(args[1]) || 10000;
    
    if (!fs.existsSync(filePath)) {
      logger.error(`File not found: ${filePath}`);
      logger.error('Usage: node importCSVData.js [file-path] [limit]');
      logger.error('Example: node importCSVData.js Final_Dataset.csv 10000');
      process.exit(1);
    }
    
    logger.info('🚀 Starting CSV data import...');
    logger.info(`📁 File: ${filePath}`);
    logger.info(`🔢 Limit: ${limit} rows`);
    logger.info('');
    
    // Connect to database
    await db.connect();
    logger.info('✅ Database connected');
    logger.info('');
    
    // Import data
    const result = await importTelemetryData(filePath, limit);
    
    logger.info('');
    logger.info('✅ Import completed successfully!');
    
    await db.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Import failed:', error);
    await db.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { importTelemetryData };

