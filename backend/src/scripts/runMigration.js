const db = require('../db/connection');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('Running migration: create_admin_roles.sql');
    
    const migrationPath = path.join(__dirname, '../../db/migrations/create_admin_roles.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    await db.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('Added mandal column to villages table');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

