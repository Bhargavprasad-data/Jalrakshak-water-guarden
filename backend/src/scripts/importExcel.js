require('dotenv').config();
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const db = require('../db/connection');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Mapping of Excel column names to database column names for each table
const columnMappings = {
  villages: {
    'name': 'name',
    'village_name': 'name',
    'district': 'district',
    'state': 'state',
    'lat': 'gps_lat',
    'latitude': 'gps_lat',
    'gps_lat': 'gps_lat',
    'lon': 'gps_lon',
    'longitude': 'gps_lon',
    'gps_lon': 'gps_lon',
    'population': 'population'
  },
  devices: {
    'device_id': 'device_id',
    'device': 'device_id',
    'village_id': 'village_id',
    'village_name': 'village_name', // Will be resolved to village_id
    'device_type': 'device_type',
    'type': 'device_type',
    'lat': 'gps_lat',
    'latitude': 'gps_lat',
    'gps_lat': 'gps_lat',
    'lon': 'gps_lon',
    'longitude': 'gps_lon',
    'gps_lon': 'gps_lon',
    'status': 'status',
    'battery_level': 'battery_level',
    'battery': 'battery_level'
  },
  users: {
    'username': 'username',
    'user': 'username',
    'email': 'email',
    'phone': 'phone',
    'mobile': 'phone',
    'password': 'password', // Will be hashed
    'role': 'role',
    'whatsapp_opt_in': 'whatsapp_opt_in',
    'assigned_villages': 'assigned_villages' // Comma-separated village names
  },
  telemetry: {
    'device_id': 'device_id',
    'device': 'device_id',
    'timestamp': 'timestamp',
    'date': 'timestamp',
    'time': 'timestamp',
    'datetime': 'timestamp',
    'flow_rate': 'flow_rate',
    'flow': 'flow_rate',
    'flow_l_min': 'flow_rate',
    'pressure': 'pressure',
    'pressure_mmhg': 'pressure', // Will convert mmHg to bar
    'turbidity': 'turbidity',
    'turbidity_ntu': 'turbidity',
    'temperature': 'temperature',
    'temp': 'temperature',
    'temperature_c': 'temperature',
    'lat': 'gps_lat',
    'latitude': 'gps_lat',
    'gps_lat': 'gps_lat',
    'lon': 'gps_lon',
    'longitude': 'gps_lon',
    'gps_lon': 'gps_lon',
    'battery_level': 'battery_level',
    'battery': 'battery_level',
    'battery_pct': 'battery_level',
    'pump_status': 'pump_status',
    'pump': 'pump_status',
    // Additional CSV columns that go to metadata
    'ph': 'ph',
    'conductivity_us_cm': 'conductivity',
    'tds_mg_l': 'tds',
    'do_mg_l': 'do_mg_l',
    'residual_chlorine_mg_l': 'residual_chlorine',
    'orp_mv': 'orp',
    'ammonium_mg_l': 'ammonium',
    'nitrate_mg_l': 'nitrate',
    'chloride_mg_l': 'chloride',
    'tss_mg_l': 'tss',
    'cod_mg_l': 'cod',
    'bod_mg_l': 'bod',
    'toc_mg_l': 'toc',
    'village': 'village', // Will be used to create/update villages
    'leak_flag': 'leak_flag',
    'contamination_flag': 'contamination_flag',
    'anomaly_flag': 'anomaly_flag'
  },
  whatsapp_contacts: {
    'name': 'name',
    'phone': 'phone',
    'mobile': 'phone',
    'role': 'role',
    'villages': 'villages', // Comma-separated village names
    'whatsapp_opt_in': 'whatsapp_opt_in',
    'notes': 'notes'
  }
};

// Normalize column names (case-insensitive, trim whitespace)
function normalizeColumnName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
}

// Map Excel column to database column
function mapColumn(excelCol, tableName) {
  const mapping = columnMappings[tableName];
  if (!mapping) return null;
  
  const normalized = normalizeColumnName(excelCol);
  
  // Direct match
  if (mapping[normalized]) {
    return mapping[normalized];
  }
  
  // Check for partial matches
  for (const [excelKey, dbKey] of Object.entries(mapping)) {
    if (normalized.includes(excelKey) || excelKey.includes(normalized)) {
      return dbKey;
    }
  }
  
  return null;
}

// Convert Excel row to database object
async function convertRowToDbObject(row, tableName, headers) {
  const dbObj = {};
  const metadata = {}; // For telemetry metadata
  const mapping = columnMappings[tableName];
  
  // List of columns that should go to metadata for telemetry
  const metadataColumns = ['ph', 'conductivity', 'tds', 'do_mg_l', 'residual_chlorine', 
    'orp', 'ammonium', 'nitrate', 'chloride', 'tss', 'cod', 'bod', 'toc',
    'leak_flag', 'contamination_flag', 'anomaly_flag'];
  
  for (let i = 0; i < headers.length; i++) {
    const excelCol = headers[i];
    const dbCol = mapColumn(excelCol, tableName);
    const value = row[i];
    
    if (value !== undefined && value !== null && value !== '') {
      // Handle special conversions
      if (dbCol === 'password' && tableName === 'users') {
        // Password will be hashed later
        dbObj[dbCol] = String(value);
      } else if (dbCol === 'gps_lat' || dbCol === 'gps_lon') {
        const num = parseFloat(value);
        if (!isNaN(num)) dbObj[dbCol] = num;
      } else if (dbCol === 'population' || dbCol === 'battery_level') {
        const num = parseInt(value);
        if (!isNaN(num)) dbObj[dbCol] = num;
      } else if (dbCol === 'flow_rate' || dbCol === 'turbidity' || dbCol === 'temperature') {
        const num = parseFloat(value);
        if (!isNaN(num)) dbObj[dbCol] = num;
      } else if (dbCol === 'pressure') {
        // Check if it's pressure_mmhg and convert to bar (1 mmHg = 0.00133322 bar)
        const normalized = normalizeColumnName(excelCol);
        let num = parseFloat(value);
        if (!isNaN(num)) {
          if (normalized.includes('mmhg') || normalized.includes('mm_hg')) {
            // Convert mmHg to bar
            num = num * 0.00133322;
          }
          dbObj[dbCol] = num;
        }
      } else if (dbCol === 'whatsapp_opt_in') {
        dbObj[dbCol] = String(value).toLowerCase() === 'true' || String(value) === '1' || String(value).toLowerCase() === 'yes';
      } else if (dbCol === 'timestamp' && tableName === 'telemetry') {
        // Try to parse date
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          dbObj[dbCol] = date;
        }
      } else if (tableName === 'telemetry' && metadataColumns.includes(dbCol)) {
        // Store in metadata for telemetry
        const normalized = normalizeColumnName(excelCol);
        if (dbCol === 'leak_flag' || dbCol === 'contamination_flag' || dbCol === 'anomaly_flag') {
          // Handle boolean flags
          metadata[dbCol] = String(value).toLowerCase() === 'true' || String(value) === '1' || String(value).toLowerCase() === 'yes';
        } else {
          // Handle numeric values
          const num = parseFloat(value);
          if (!isNaN(num)) {
            metadata[dbCol] = num;
          } else {
            metadata[dbCol] = String(value).trim();
          }
        }
      } else if (dbCol) {
        dbObj[dbCol] = String(value).trim();
      }
    }
  }
  
  // Add metadata to dbObj for telemetry
  if (tableName === 'telemetry' && Object.keys(metadata).length > 0) {
    dbObj.metadata = metadata;
  }
  
  return dbObj;
}

// Resolve village name to village_id
async function resolveVillageId(villageName) {
  if (!villageName) return null;
  
  const result = await db.query(
    'SELECT id FROM villages WHERE LOWER(name) = LOWER($1)',
    [String(villageName).trim()]
  );
  
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// Resolve village names array to village_ids
async function resolveVillageIds(villageNames) {
  if (!villageNames) return [];
  
  const names = String(villageNames).split(',').map(n => n.trim()).filter(n => n);
  const ids = [];
  
  for (const name of names) {
    const id = await resolveVillageId(name);
    if (id) ids.push(id);
  }
  
  return ids;
}

// Import villages
async function importVillages(rows, headers) {
  let imported = 0;
  let errors = 0;
  
  for (const row of rows) {
    try {
      const data = await convertRowToDbObject(row, 'villages', headers);
      
      if (!data.name) {
        logger.warn('Skipping village row - missing name');
        errors++;
        continue;
      }
      
      // Check if village already exists
      const existing = await db.query(
        'SELECT id FROM villages WHERE LOWER(name) = LOWER($1)',
        [data.name]
      );
      
      if (existing.rows.length > 0) {
        // Update existing
        await db.query(
          `UPDATE villages SET 
            district = COALESCE($1, district),
            state = COALESCE($2, state),
            gps_lat = COALESCE($3, gps_lat),
            gps_lon = COALESCE($4, gps_lon),
            population = COALESCE($5, population)
          WHERE LOWER(name) = LOWER($6)`,
          [data.district, data.state, data.gps_lat, data.gps_lon, data.population, data.name]
        );
        logger.info(`Updated village: ${data.name}`);
      } else {
        // Insert new
        await db.query(
          `INSERT INTO villages (name, district, state, gps_lat, gps_lon, population)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [data.name, data.district || null, data.state || null, data.gps_lat || null, data.gps_lon || null, data.population || null]
        );
        logger.info(`Imported village: ${data.name}`);
      }
      
      imported++;
    } catch (error) {
      logger.error(`Error importing village row:`, error.message);
      errors++;
    }
  }
  
  return { imported, errors };
}

// Import devices
async function importDevices(rows, headers) {
  let imported = 0;
  let errors = 0;
  
  for (const row of rows) {
    try {
      const data = await convertRowToDbObject(row, 'devices', headers);
      
      if (!data.device_id) {
        logger.warn('Skipping device row - missing device_id');
        errors++;
        continue;
      }
      
      // Resolve village_id if village_name provided
      if (data.village_name && !data.village_id) {
        data.village_id = await resolveVillageId(data.village_name);
      }
      
      // Check if device already exists
      const existing = await db.query(
        'SELECT id FROM devices WHERE device_id = $1',
        [data.device_id]
      );
      
      if (existing.rows.length > 0) {
        // Update existing
        await db.query(
          `UPDATE devices SET 
            village_id = COALESCE($1, village_id),
            device_type = COALESCE($2, device_type),
            gps_lat = COALESCE($3, gps_lat),
            gps_lon = COALESCE($4, gps_lon),
            status = COALESCE($5, status),
            battery_level = COALESCE($6, battery_level),
            updated_at = CURRENT_TIMESTAMP
          WHERE device_id = $7`,
          [data.village_id, data.device_type, data.gps_lat, data.gps_lon, data.status, data.battery_level, data.device_id]
        );
        logger.info(`Updated device: ${data.device_id}`);
      } else {
        // Insert new
        await db.query(
          `INSERT INTO devices (device_id, village_id, device_type, gps_lat, gps_lon, status, battery_level)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [data.device_id, data.village_id || null, data.device_type || 'flow_sensor', data.gps_lat || null, data.gps_lon || null, data.status || 'active', data.battery_level || null]
        );
        logger.info(`Imported device: ${data.device_id}`);
      }
      
      imported++;
    } catch (error) {
      logger.error(`Error importing device row:`, error.message);
      errors++;
    }
  }
  
  return { imported, errors };
}

// Import users
async function importUsers(rows, headers) {
  let imported = 0;
  let errors = 0;
  
  for (const row of rows) {
    try {
      const data = await convertRowToDbObject(row, 'users', headers);
      
      if (!data.username || !data.phone) {
        logger.warn('Skipping user row - missing username or phone');
        errors++;
        continue;
      }
      
      // Hash password if provided
      let passwordHash = null;
      if (data.password) {
        passwordHash = await bcrypt.hash(data.password, 10);
      } else {
        // Generate default password
        passwordHash = await bcrypt.hash('password123', 10);
      }
      
      // Resolve assigned_villages
      let villageIds = [];
      if (data.assigned_villages) {
        villageIds = await resolveVillageIds(data.assigned_villages);
      }
      
      // Check if user already exists
      const existing = await db.query(
        'SELECT id FROM users WHERE username = $1 OR phone = $2',
        [data.username, data.phone]
      );
      
      if (existing.rows.length > 0) {
        // Update existing
        await db.query(
          `UPDATE users SET 
            email = COALESCE($1, email),
            password_hash = COALESCE($2, password_hash),
            role = COALESCE($3, role),
            whatsapp_opt_in = COALESCE($4, whatsapp_opt_in),
            assigned_villages = COALESCE($5, assigned_villages),
            updated_at = CURRENT_TIMESTAMP
          WHERE username = $6 OR phone = $7`,
          [data.email, passwordHash, data.role || 'operator', data.whatsapp_opt_in || false, villageIds, data.username, data.phone]
        );
        logger.info(`Updated user: ${data.username}`);
      } else {
        // Insert new
        await db.query(
          `INSERT INTO users (username, email, phone, password_hash, role, whatsapp_opt_in, assigned_villages)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [data.username, data.email || null, data.phone, passwordHash, data.role || 'operator', data.whatsapp_opt_in || false, villageIds]
        );
        logger.info(`Imported user: ${data.username}`);
      }
      
      imported++;
    } catch (error) {
      logger.error(`Error importing user row:`, error.message);
      errors++;
    }
  }
  
  return { imported, errors };
}

// Import telemetry
async function importTelemetry(rows, headers) {
  let imported = 0;
  let errors = 0;
  const villagesProcessed = new Set(); // Track processed villages
  const devicesProcessed = new Set(); // Track processed devices
  
  for (const row of rows) {
    try {
      const data = await convertRowToDbObject(row, 'telemetry', headers);
      
      if (!data.device_id) {
        logger.warn('Skipping telemetry row - missing device_id');
        errors++;
        continue;
      }
      
      // Create/update village if village name is provided
      if (data.village && !villagesProcessed.has(data.village.toLowerCase())) {
        try {
          const existing = await db.query(
            'SELECT id FROM villages WHERE LOWER(name) = LOWER($1)',
            [data.village]
          );
          
          if (existing.rows.length === 0) {
            // Create village with GPS coordinates if available
            await db.query(
              `INSERT INTO villages (name, gps_lat, gps_lon)
               VALUES ($1, $2, $3)
               ON CONFLICT DO NOTHING`,
              [data.village, data.gps_lat || null, data.gps_lon || null]
            );
            logger.info(`Created village: ${data.village}`);
          }
          villagesProcessed.add(data.village.toLowerCase());
        } catch (err) {
          logger.warn(`Error creating village ${data.village}:`, err.message);
        }
      }
      
      // Create/update device if not already processed
      if (!devicesProcessed.has(data.device_id)) {
        try {
          const villageId = data.village ? await resolveVillageId(data.village) : null;
          
          const existing = await db.query(
            'SELECT id FROM devices WHERE device_id = $1',
            [data.device_id]
          );
          
          if (existing.rows.length === 0) {
            // Create device
            await db.query(
              `INSERT INTO devices (device_id, village_id, device_type, gps_lat, gps_lon, status, battery_level, last_seen)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (device_id) DO UPDATE SET
                 battery_level = EXCLUDED.battery_level,
                 last_seen = EXCLUDED.last_seen,
                 updated_at = CURRENT_TIMESTAMP`,
              [
                data.device_id,
                villageId,
                'flow_sensor', // Default device type
                data.gps_lat || null,
                data.gps_lon || null,
                'active',
                data.battery_level || null,
                data.timestamp || new Date()
              ]
            );
            logger.info(`Created device: ${data.device_id}`);
          } else {
            // Update device last_seen and battery
            await db.query(
              `UPDATE devices SET 
                battery_level = COALESCE($1, battery_level),
                last_seen = COALESCE($2, last_seen),
                updated_at = CURRENT_TIMESTAMP
              WHERE device_id = $3`,
              [data.battery_level, data.timestamp || new Date(), data.device_id]
            );
          }
          devicesProcessed.add(data.device_id);
        } catch (err) {
          logger.warn(`Error creating/updating device ${data.device_id}:`, err.message);
        }
      } else {
        // Still update device last_seen and battery for existing devices
        try {
          await db.query(
            `UPDATE devices SET 
              battery_level = COALESCE($1, battery_level),
              last_seen = COALESCE($2, last_seen),
              updated_at = CURRENT_TIMESTAMP
            WHERE device_id = $3`,
            [data.battery_level, data.timestamp || new Date(), data.device_id]
          );
        } catch (err) {
          // Ignore update errors
        }
      }
      
      // Insert telemetry with metadata and water quality parameters
      await db.query(
        `INSERT INTO telemetry (
          device_id, timestamp, flow_rate, pressure, turbidity, temperature, 
          gps_lat, gps_lon, battery_level, pump_status, 
          ph, conductivity, tds, do_mg_l, residual_chlorine, orp,
          ammonium, nitrate, chloride, tss, cod, bod, toc,
          metadata
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
        [
          data.device_id,
          data.timestamp || new Date(),
          data.flow_rate || null,
          data.pressure || null,
          data.turbidity || null,
          data.temperature || null,
          data.gps_lat || null,
          data.gps_lon || null,
          data.battery_level || null,
          data.pump_status || null,
          data.metadata?.ph || null,
          data.metadata?.conductivity || null,
          data.metadata?.tds || null,
          data.metadata?.do_mg_l || null,
          data.metadata?.residual_chlorine || null,
          data.metadata?.orp || null,
          data.metadata?.ammonium || null,
          data.metadata?.nitrate || null,
          data.metadata?.chloride || null,
          data.metadata?.tss || null,
          data.metadata?.cod || null,
          data.metadata?.bod || null,
          data.metadata?.toc || null,
          data.metadata && Object.keys(data.metadata).length > 0 ? JSON.stringify(data.metadata) : null
        ]
      );
      
      imported++;
      
      // Log progress every 1000 records
      if (imported % 1000 === 0) {
        logger.info(`Imported ${imported} telemetry records...`);
      }
    } catch (error) {
      logger.error(`Error importing telemetry row:`, error.message);
      errors++;
    }
  }
  
  return { imported, errors };
}

// Import WhatsApp contacts
async function importWhatsAppContacts(rows, headers) {
  let imported = 0;
  let errors = 0;
  
  for (const row of rows) {
    try {
      const data = await convertRowToDbObject(row, 'whatsapp_contacts', headers);
      
      if (!data.name || !data.phone) {
        logger.warn('Skipping contact row - missing name or phone');
        errors++;
        continue;
      }
      
      // Resolve villages
      let villageIds = [];
      if (data.villages) {
        villageIds = await resolveVillageIds(data.villages);
      }
      
      // Check if contact already exists
      const existing = await db.query(
        'SELECT id FROM whatsapp_contacts WHERE phone = $1',
        [data.phone]
      );
      
      if (existing.rows.length > 0) {
        // Update existing
        await db.query(
          `UPDATE whatsapp_contacts SET 
            name = $1,
            role = COALESCE($2, role),
            villages = COALESCE($3, villages),
            whatsapp_opt_in = COALESCE($4, whatsapp_opt_in),
            notes = COALESCE($5, notes),
            updated_at = CURRENT_TIMESTAMP
          WHERE phone = $6`,
          [data.name, data.role || 'villager', villageIds, data.whatsapp_opt_in !== undefined ? data.whatsapp_opt_in : true, data.notes || null, data.phone]
        );
        logger.info(`Updated contact: ${data.name}`);
      } else {
        // Insert new
        await db.query(
          `INSERT INTO whatsapp_contacts (name, phone, role, villages, whatsapp_opt_in, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [data.name, data.phone, data.role || 'villager', villageIds, data.whatsapp_opt_in !== undefined ? data.whatsapp_opt_in : true, data.notes || null]
        );
        logger.info(`Imported contact: ${data.name}`);
      }
      
      imported++;
    } catch (error) {
      logger.error(`Error importing contact row:`, error.message);
      errors++;
    }
  }
  
  return { imported, errors };
}

// Main import function
async function importExcelFile(filePath, tableName = null) {
  try {
    const fileExt = path.extname(filePath).toLowerCase();
    const isCSV = fileExt === '.csv';
    
    logger.info(`Reading ${isCSV ? 'CSV' : 'Excel'} file: ${filePath}`);
    
    let workbook;
    let sheetNames;
    
    if (isCSV) {
      // Read CSV file
      workbook = XLSX.readFile(filePath, { type: 'file' });
      sheetNames = workbook.SheetNames;
    } else {
      // Read Excel file
      workbook = XLSX.readFile(filePath);
      sheetNames = workbook.SheetNames;
    }
    
    logger.info(`Found ${sheetNames.length} sheet(s): ${sheetNames.join(', ')}`);
    
    let totalImported = 0;
    let totalErrors = 0;
    
    for (const sheetName of sheetNames) {
      // Determine table name from sheet name if not provided
      let targetTable = tableName;
      
      if (!targetTable) {
        // For CSV files, default to telemetry if it looks like telemetry data
        if (isCSV) {
          // Check if CSV has telemetry-like columns
          const worksheet = workbook.Sheets[sheetName];
          const sampleData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
          if (sampleData.length > 0) {
            const headers = sampleData[0].map(h => String(h || '').trim().toLowerCase());
            const hasTelemetryColumns = headers.some(h => 
              h.includes('device_id') || h.includes('timestamp') || h.includes('flow') || 
              h.includes('turbidity') || h.includes('temperature')
            );
            if (hasTelemetryColumns) {
              targetTable = 'telemetry';
            } else {
              targetTable = sheetName.toLowerCase().replace(/\s+/g, '_');
            }
          } else {
            targetTable = sheetName.toLowerCase().replace(/\s+/g, '_');
          }
        } else {
          targetTable = sheetName.toLowerCase().replace(/\s+/g, '_');
        }
      }
      
      // Map common sheet names to table names
      const sheetNameMap = {
        'villages': 'villages',
        'village': 'villages',
        'devices': 'devices',
        'device': 'devices',
        'users': 'users',
        'user': 'users',
        'telemetry': 'telemetry',
        'telemetry_data': 'telemetry',
        'contacts': 'whatsapp_contacts',
        'contact': 'whatsapp_contacts',
        'whatsapp': 'whatsapp_contacts',
        'whatsapp_contacts': 'whatsapp_contacts'
      };
      
      if (sheetNameMap[targetTable]) {
        targetTable = sheetNameMap[targetTable];
      }
      
      if (!columnMappings[targetTable]) {
        logger.warn(`Unknown table type: ${targetTable}. Skipping sheet: ${sheetName}`);
        continue;
      }
      
      logger.info(`Processing sheet "${sheetName}" for table "${targetTable}"`);
      
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
      
      if (data.length < 2) {
        logger.warn(`Sheet "${sheetName}" has insufficient data (need at least header + 1 row)`);
        continue;
      }
      
      const headers = data[0].map(h => String(h || '').trim());
      const rows = data.slice(1).filter(row => row.some(cell => cell !== null && cell !== ''));
      
      logger.info(`Found ${rows.length} data rows in sheet "${sheetName}"`);
      
      let result;
      switch (targetTable) {
        case 'villages':
          result = await importVillages(rows, headers);
          break;
        case 'devices':
          result = await importDevices(rows, headers);
          break;
        case 'users':
          result = await importUsers(rows, headers);
          break;
        case 'telemetry':
          result = await importTelemetry(rows, headers);
          break;
        case 'whatsapp_contacts':
          result = await importWhatsAppContacts(rows, headers);
          break;
        default:
          logger.warn(`No importer for table: ${targetTable}`);
          continue;
      }
      
      totalImported += result.imported;
      totalErrors += result.errors;
      
      logger.info(`Sheet "${sheetName}": ${result.imported} imported, ${result.errors} errors`);
    }
    
    logger.info(`\n=== Import Summary ===`);
    logger.info(`Total imported: ${totalImported}`);
    logger.info(`Total errors: ${totalErrors}`);
    
    return { imported: totalImported, errors: totalErrors };
  } catch (error) {
    logger.error('Error importing file:', error);
    throw error;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node importExcel.js <file-path> [table-name]

Examples:
  node importExcel.js data.xlsx
  node importExcel.js data.csv telemetry
  node importExcel.js villages.xlsx villages
  node importExcel.js jalrakshak_dataset_50k.csv telemetry

Supported file formats:
  - Excel files (.xlsx, .xls)
  - CSV files (.csv)

Supported tables:
  - villages
  - devices
  - users
  - telemetry
  - whatsapp_contacts

The script will automatically detect the table type from the sheet name or file content if not specified.
    `);
    process.exit(1);
  }
  
  const filePath = args[0];
  const tableName = args[1] || null;
  
  if (!fs.existsSync(filePath)) {
    logger.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  
  db.connect()
    .then(() => {
      logger.info('Database connected');
      return importExcelFile(filePath, tableName);
    })
    .then(() => {
      logger.info('Import completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Import failed:', error);
      process.exit(1);
    })
    .finally(() => {
      db.disconnect();
    });
}

module.exports = { importExcelFile };

