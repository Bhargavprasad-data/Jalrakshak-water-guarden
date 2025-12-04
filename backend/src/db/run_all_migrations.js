// Script to run all database migrations
// Load environment variables FIRST before requiring connection
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Now require connection after env is loaded
const db = require('./connection');

// Migration tracking table creation
const createMigrationTableSQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

async function getAppliedMigrations() {
  try {
    const result = await db.query('SELECT migration_name FROM schema_migrations ORDER BY applied_at');
    return result.rows.map(row => row.migration_name);
  } catch (error) {
    // If table doesn't exist, return empty array
    if (error.message.includes('does not exist') || error.code === '42P01') {
      return [];
    }
    throw error;
  }
}

async function markMigrationApplied(migrationName) {
  await db.query(
    'INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING',
    [migrationName]
  );
}

async function checkTableExists(tableName) {
  try {
    const result = await db.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )`,
      [tableName]
    );
    return result.rows[0].exists;
  } catch (error) {
    return false;
  }
}

async function runAllMigrations() {
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

    logger.info('🚀 Starting database migrations...');
    logger.info(`📊 Connecting to database: ${process.env.DB_NAME || 'jalrakshak'} on ${process.env.DB_HOST || 'localhost'}`);
    
    // Test connection first
    await db.connect();
    logger.info('✅ Database connection established');
    
    // Check if base tables exist (from init.sql)
    logger.info('🔍 Checking if base tables exist...');
    const telemetryExists = await checkTableExists('telemetry');
    const usersExists = await checkTableExists('users');
    const villagesExists = await checkTableExists('villages');
    
    if (!telemetryExists || !usersExists || !villagesExists) {
      logger.error('❌ Base tables not found!');
      logger.error('');
      logger.error('You must run init.sql first to create the base database schema.');
      logger.error('');
      logger.error('Steps to fix:');
      logger.error('1. Connect to PostgreSQL:');
      logger.error('   "C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe" -U postgres');
      logger.error('');
      logger.error('2. Connect to jalrakshak database:');
      logger.error('   \\c jalrakshak');
      logger.error('');
      logger.error('3. Run the init script:');
      logger.error('   \\i C:/Users/Bharg/OneDrive/Desktop/SIH/backend/src/db/init.sql');
      logger.error('');
      logger.error('4. Then run migrations again:');
      logger.error('   npm run migrate:all');
      logger.error('');
      await db.disconnect();
      process.exit(1);
    }
    
    logger.info('✅ Base tables found');
    
    // Create migration tracking table
    logger.info('📋 Creating migration tracking table...');
    await db.query(createMigrationTableSQL);
    logger.info('✅ Migration tracking table ready');
    
    // Get list of applied migrations
    const appliedMigrations = await getAppliedMigrations();
    logger.info(`📝 Found ${appliedMigrations.length} previously applied migration(s)`);
    
    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      logger.error(`❌ Migrations directory not found: ${migrationsDir}`);
      process.exit(1);
    }
    
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure consistent order
    
    if (migrationFiles.length === 0) {
      logger.warn('⚠️  No migration files found in migrations directory');
      await db.disconnect();
      process.exit(0);
    }
    
    logger.info(`📦 Found ${migrationFiles.length} migration file(s) to process`);
    logger.info('');
    
    let appliedCount = 0;
    let skippedCount = 0;
    
    // Run each migration
    for (const migrationFile of migrationFiles) {
      const migrationName = migrationFile.replace('.sql', '');
      const migrationPath = path.join(migrationsDir, migrationFile);
      
      // Check if already applied
      if (appliedMigrations.includes(migrationName)) {
        logger.info(`⏭️  Skipping ${migrationName} (already applied)`);
        skippedCount++;
        continue;
      }
      
      try {
        logger.info(`🔄 Running migration: ${migrationName}...`);
        
        // Read migration file
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        if (!migrationSQL.trim()) {
          logger.warn(`⚠️  Migration file ${migrationFile} is empty, skipping`);
          continue;
        }
        
        // Execute migration
        await db.query(migrationSQL);
        
        // Mark as applied
        await markMigrationApplied(migrationName);
        
        logger.info(`✅ Migration ${migrationName} completed successfully`);
        appliedCount++;
        logger.info('');
      } catch (error) {
        logger.error(`❌ Migration ${migrationName} failed:`, error.message);
        logger.error('Stack:', error.stack);
        throw error; // Stop on first error
      }
    }
    
    logger.info('========================================');
    logger.info('📊 Migration Summary:');
    logger.info(`   ✅ Applied: ${appliedCount}`);
    logger.info(`   ⏭️  Skipped: ${skippedCount}`);
    logger.info(`   📦 Total: ${migrationFiles.length}`);
    logger.info('========================================');
    
    if (appliedCount > 0) {
      logger.info('✅ All migrations completed successfully!');
    } else {
      logger.info('ℹ️  All migrations were already applied');
    }
    
    await db.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration process failed:', error.message);
    if (error.message.includes('password') || error.code === '28P01') {
      logger.error('');
      logger.error('Database connection error. Please check:');
      logger.error('1. PostgreSQL is running');
      logger.error('2. .env file exists in backend/ directory');
      logger.error('3. DB_PASSWORD is set correctly in .env');
      logger.error('4. Database user has proper permissions');
    } else if (error.code === '3D000') {
      logger.error('');
      logger.error('Database does not exist. Please create it first:');
      logger.error('  CREATE DATABASE jalrakshak;');
    }
    await db.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run migrations
runAllMigrations();

