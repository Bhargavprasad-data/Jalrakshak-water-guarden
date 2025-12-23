require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../db/connection');
const logger = require('../utils/logger');

/**
 * Script to populate mandal column in villages table from FINAL.csv
 * This script:
 * 1. Ensures mandal column exists
 * 2. Reads FINAL.csv
 * 3. Updates villages with mandal data based on village name matching
 */

async function ensureMandalColumn() {
  try {
    // Check if mandal column exists
    const checkColumn = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'villages' 
        AND column_name = 'mandal'
      )
    `);
    
    if (!checkColumn.rows[0].exists) {
      logger.info('Creating mandal column in villages table...');
      await db.query(`
        ALTER TABLE villages 
        ADD COLUMN mandal VARCHAR(255)
      `);
      
      // Create index
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_villages_mandal ON villages(mandal)
      `);
      
      // Create composite index
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_villages_district_mandal ON villages(district, mandal)
      `);
      
      logger.info('Mandal column created successfully');
    } else {
      logger.info('Mandal column already exists');
    }
  } catch (error) {
    logger.error('Error ensuring mandal column:', error);
    throw error;
  }
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function populateMandalsFromCSV(csvFilePath) {
  const villageMandalMap = new Map(); // village_name -> { district, mandal }
  let rowCount = 0;
  let processed = 0;
  let updated = 0;
  let errors = 0;
  let headers = [];

  logger.info(`Reading CSV file: ${csvFilePath}`);

  const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
  const lines = fileContent.split('\n').filter(line => line.trim());
  
  // Parse header row
  if (lines.length > 0) {
    headers = parseCSVLine(lines[0]);
    logger.info(`CSV Headers: ${headers.join(', ')}`);
  }
  
  // Find column indices
  const districtIdx = headers.findIndex(h => h.toLowerCase() === 'district');
  const mandalIdx = headers.findIndex(h => h.toLowerCase() === 'mandal');
  const villageIdx = headers.findIndex(h => h.toLowerCase() === 'village');
  
  if (districtIdx === -1 || mandalIdx === -1 || villageIdx === -1) {
    throw new Error('Required columns not found. Expected: District, Mandal, village');
  }
  
  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    rowCount++;
    
    try {
      const values = parseCSVLine(lines[i]);
      
      if (values.length < headers.length) {
        continue; // Skip incomplete rows
      }
      
      const villageName = (values[villageIdx] || '').trim().replace(/^"|"$/g, '');
      const district = (values[districtIdx] || '').trim().replace(/^"|"$/g, '');
      const mandal = (values[mandalIdx] || '').trim().replace(/^"|"$/g, '');

      if (!villageName || !mandal) {
        continue; // Skip rows without village or mandal
      }

      // Use lowercase village name as key for case-insensitive matching
      const key = villageName.toLowerCase();
      
      // Store the mapping (keep first occurrence or update if district matches better)
      if (!villageMandalMap.has(key)) {
        villageMandalMap.set(key, { villageName, district, mandal });
      } else {
        // Update if we have district info and it matches better
        const existing = villageMandalMap.get(key);
        if (district && district.toLowerCase() === existing.district.toLowerCase()) {
          villageMandalMap.set(key, { villageName, district, mandal });
        }
      }
    } catch (error) {
      logger.warn(`Error processing row ${rowCount}:`, error.message);
    }
  }
  
  logger.info(`Finished reading CSV. Found ${villageMandalMap.size} unique village-mandal mappings from ${rowCount} rows`);
  
  // Now update the database
  logger.info('Starting database updates...');
  
  for (const [key, data] of villageMandalMap.entries()) {
    try {
      const { villageName, district, mandal } = data;
      
      // Update villages table - match by village name (case-insensitive)
      // Also update district if provided and doesn't match
      const updateQuery = `
        UPDATE villages 
        SET 
          mandal = $1,
          district = COALESCE(NULLIF($2, ''), district)
        WHERE LOWER(TRIM(name)) = LOWER(TRIM($3))
          AND (mandal IS NULL OR mandal = '' OR mandal != $1)
        RETURNING id, name
      `;
      
      const result = await db.query(updateQuery, [mandal, district, villageName]);
      
      if (result.rows.length > 0) {
        updated++;
        if (updated % 100 === 0) {
          logger.info(`Updated ${updated} villages...`);
        }
      }
      
      processed++;
    } catch (error) {
      errors++;
      logger.warn(`Error updating village ${data.villageName}:`, error.message);
    }
  }
  
  logger.info(`\n=== Summary ===`);
  logger.info(`Total rows in CSV: ${rowCount}`);
  logger.info(`Unique village-mandal mappings: ${villageMandalMap.size}`);
  logger.info(`Villages processed: ${processed}`);
  logger.info(`Villages updated: ${updated}`);
  logger.info(`Errors: ${errors}`);
  
  return { processed, updated, errors, totalMappings: villageMandalMap.size };
}

async function verifyMandals() {
  try {
    // Check how many villages now have mandal data
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_villages,
        COUNT(DISTINCT district) as total_districts,
        COUNT(DISTINCT mandal) as total_mandals,
        COUNT(CASE WHEN mandal IS NOT NULL AND mandal != '' THEN 1 END) as villages_with_mandal
      FROM villages
    `);
    
    logger.info('\n=== Database Statistics ===');
    logger.info(`Total villages: ${stats.rows[0].total_villages}`);
    logger.info(`Total districts: ${stats.rows[0].total_districts}`);
    logger.info(`Total unique mandals: ${stats.rows[0].total_mandals}`);
    logger.info(`Villages with mandal data: ${stats.rows[0].villages_with_mandal}`);
    
    // Show sample mandals
    const sampleMandals = await db.query(`
      SELECT DISTINCT mandal, COUNT(*) as village_count
      FROM villages
      WHERE mandal IS NOT NULL AND mandal != ''
      GROUP BY mandal
      ORDER BY village_count DESC
      LIMIT 10
    `);
    
    logger.info('\n=== Top 10 Mandals by Village Count ===');
    sampleMandals.rows.forEach((row, index) => {
      logger.info(`${index + 1}. ${row.mandal}: ${row.village_count} villages`);
    });
    
    return stats.rows[0];
  } catch (error) {
    logger.error('Error verifying mandals:', error);
    throw error;
  }
}

async function main() {
  try {
    logger.info('=== Starting Mandal Population Script ===\n');
    
    // Step 1: Ensure mandal column exists
    await ensureMandalColumn();
    
    // Step 2: Find CSV file
    const csvFilePath = path.join(__dirname, '../../FINAL.csv');
    
    if (!fs.existsSync(csvFilePath)) {
      logger.error(`CSV file not found at: ${csvFilePath}`);
      process.exit(1);
    }
    
    // Step 3: Populate mandals from CSV
    const result = await populateMandalsFromCSV(csvFilePath);
    
    // Step 4: Verify the results
    await verifyMandals();
    
    logger.info('\n=== Script Completed Successfully ===');
    process.exit(0);
  } catch (error) {
    logger.error('Script failed:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { populateMandalsFromCSV, ensureMandalColumn, verifyMandals };

