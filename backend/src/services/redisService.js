const redis = require('redis');
const logger = require('../utils/logger');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

let client = null;

// Try to create Redis client, but don't fail if Redis is not available
async function initRedis() {
  try {
    // For redis v4+ (which uses async/await)
    client = redis.createClient({
      socket: {
        host: REDIS_HOST,
        port: REDIS_PORT,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.warn('Redis: Max reconnection attempts reached');
            return false; // Stop reconnecting
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    client.on('error', (err) => {
      logger.warn('Redis client error (continuing without Redis):', err.message);
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    // Try to connect, but don't fail if it doesn't work
    await client.connect().catch((err) => {
      logger.warn('Redis connection failed (continuing without Redis):', err.message);
      client = null;
    });
  } catch (error) {
    logger.warn('Redis not available (continuing without Redis):', error.message);
    client = null;
  }
}

// Initialize Redis (non-blocking)
initRedis();

// Redis methods with fallback if Redis is not available
const get = async (key) => {
  if (!client) return null;
  try {
    return await client.get(key);
  } catch (error) {
    logger.warn('Redis get error:', error.message);
    return null;
  }
};

const set = async (key, value) => {
  if (!client) return null;
  try {
    return await client.set(key, value);
  } catch (error) {
    logger.warn('Redis set error:', error.message);
    return null;
  }
};

const setex = async (key, seconds, value) => {
  if (!client) return null;
  try {
    return await client.setEx(key, seconds, value);
  } catch (error) {
    logger.warn('Redis setex error:', error.message);
    return null;
  }
};

const del = async (key) => {
  if (!client) return null;
  try {
    return await client.del(key);
  } catch (error) {
    logger.warn('Redis del error:', error.message);
    return null;
  }
};

module.exports = {
  client,
  get,
  set,
  setex,
  del,
};

