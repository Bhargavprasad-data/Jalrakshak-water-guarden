// Script to run database migration for adding sensor columns
// Load environment variables FIRST before requiring connection
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Now require connection after env is loaded
const db = require('./connection');

async function runMigration() {
  try {
    // Validate database connection configuration
    if (!process.env.DB_PASSWORD || typeof process.env.DB_PASSWORD !== 'string') {
      logger.error('❌ Database password is missing or invalid!');
      logger.error('Please set DB_PASSWORD in your .env file');
      logger.error('');
      logger.error('Example .env file:');
      logger.error('  DB_HOST=localhost');
      logger.error('  DB_PORT=5432');
      logger.error('  DB_NAME=jalrakshak');
      logger.error('  DB_USER=postgres');
      logger.error('  DB_PASSWORD=your_password_here');
      process.exit(1);
    }

    logger.info('Starting database migration: Adding sensor parameter columns...');
    logger.info(`Connecting to database: ${process.env.DB_NAME || 'jalrakshak'} on ${process.env.DB_HOST || 'localhost'}`);
    
    // Test connection first
    await db.connect();
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'add_sensor_columns.sql');
    if (!fs.existsSync(migrationPath)) {
      logger.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    logger.info('Executing migration SQL...');
    await db.query(migrationSQL);
    
    logger.info('✅ Migration completed successfully!');
    logger.info('Added columns: ph, conductivity, tds, do_mg_l, residual_chlorine, orp, ammonium, nitrate, chloride, tss, cod, bod, toc');
    
    await db.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error.message);
    if (error.message.includes('password')) {
      logger.error('');
      logger.error('Database connection error. Please check:');
      logger.error('1. PostgreSQL is running');
      logger.error('2. .env file exists in backend/ directory');
      logger.error('3. DB_PASSWORD is set correctly in .env');
      logger.error('4. Database user has proper permissions');
    }
    process.exit(1);
  }
}

// Run migration
runMigration();

