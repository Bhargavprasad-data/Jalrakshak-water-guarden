const mqtt = require('mqtt');
const logger = require('../utils/logger');

const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
const MQTT_PORT = process.env.MQTT_PORT || 1883;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

let client;

try {
  client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
  });

  client.on('connect', () => {
    logger.info('MQTT client connected');
    // Subscribe to all device telemetry topics
    client.subscribe('jalrakshak/+/telemetry', (err) => {
      if (err) {
        logger.error('MQTT subscription error:', err);
      } else {
        logger.info('Subscribed to jalrakshak/+/telemetry');
      }
    });
  });

  client.on('error', (error) => {
    logger.warn('MQTT client error (continuing without MQTT):', error.message);
  });

  client.on('close', () => {
    logger.warn('MQTT client disconnected');
  });

  client.on('reconnect', () => {
    logger.info('MQTT client reconnecting...');
  });
} catch (error) {
  logger.warn('MQTT not available (continuing without MQTT):', error.message);
  // Create a dummy client that won't crash
  client = {
    on: () => {},
    subscribe: () => {},
    publish: () => {},
    end: () => {}
  };
}

module.exports = client;

