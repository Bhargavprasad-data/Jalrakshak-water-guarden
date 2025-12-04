const { Pool } = require('pg');
const logger = require('../utils/logger');

// Ensure password is a string (handle undefined/null)
const dbPassword = process.env.DB_PASSWORD;
if (dbPassword !== undefined && dbPassword !== null && typeof dbPassword !== 'string') {
  logger.warn('DB_PASSWORD is not a string, converting...');
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'jalrakshak',
  user: process.env.DB_USER || 'postgres',
  password: dbPassword ? String(dbPassword) : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

async function connect() {
  try {
    const client = await pool.connect();
    logger.info('Database connection pool created');
    client.release();
    return pool;
  } catch (error) {
    logger.error('Database connection error:', error.message);
    logger.error('Please check:');
    logger.error('1. PostgreSQL is running');
    logger.error('2. Database credentials in .env file are correct');
    logger.error('3. Database "jalrakshak" exists (or create it: CREATE DATABASE jalrakshak;)');
    throw error;
  }
}

async function disconnect() {
  await pool.end();
  logger.info('Database connection pool closed');
}

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('Query error:', { text, error: error.message });
    throw error;
  }
}

module.exports = {
  pool,
  connect,
  disconnect,
  query,
};

