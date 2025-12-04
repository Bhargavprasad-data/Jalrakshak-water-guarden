const axios = require('axios');
const logger = require('../utils/logger');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5000';

async function analyzeTelemetry(telemetry) {
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/analyze`, {
      device_id: telemetry.device_id,
      flow_rate: telemetry.flow_rate,
      pressure: telemetry.pressure,
      turbidity: telemetry.turbidity,
      temperature: telemetry.temperature,
      timestamp: telemetry.timestamp,
      gps_lat: telemetry.gps_lat,
      gps_lon: telemetry.gps_lon
    }, {
      timeout: 10000
    });

    return response.data;
  } catch (error) {
    logger.error('AI service error:', error.message);
    // Return default response if AI service is unavailable
    return {
      anomaly_detected: false,
      anomaly_type: null,
      severity: 'low',
      confidence: 0,
      description: 'AI service unavailable'
    };
  }
}

async function detectLeak(deviceId, pressureData, flowData) {
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/detect-leak`, {
      device_id: deviceId,
      pressure_data: pressureData,
      flow_data: flowData
    }, {
      timeout: 15000
    });

    return response.data;
  } catch (error) {
    logger.error('Leak detection error:', error.message);
    throw error;
  }
}

async function predictMaintenance(deviceId, historicalData) {
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/predict-maintenance`, {
      device_id: deviceId,
      historical_data: historicalData
    }, {
      timeout: 20000
    });

    return response.data;
  } catch (error) {
    logger.error('Maintenance prediction error:', error.message);
    throw error;
  }
}

module.exports = {
  analyzeTelemetry,
  detectLeak,
  predictMaintenance,
};






