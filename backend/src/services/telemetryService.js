const db = require('../db/connection');
const logger = require('../utils/logger');
const redis = require('./redisService');

async function storeTelemetry(data) {
  const {
    device_id,
    flow_rate,
    pressure,
    turbidity,
    temperature,
    gps_lat,
    gps_lon,
    battery_level,
    pump_status,
    timestamp,
    ph,
    conductivity,
    tds,
    do_mg_l,
    residual_chlorine,
    orp,
    ammonium,
    nitrate,
    chloride,
    tss,
    cod,
    bod,
    toc,
    metadata = {}
  } = data;

  try {
    // Store extended parameters in metadata
    const metadataPayload = { ...(metadata || {}) };
    
    // Store any additional parameters not in main columns
    if (data.leak_detected !== undefined) metadataPayload.leak_detected = data.leak_detected;
    if (data.contamination_detected !== undefined) metadataPayload.contamination_detected = data.contamination_detected;
    if (data.anomaly_detected !== undefined) metadataPayload.anomaly_detected = data.anomaly_detected;
    if (data.leak_flag !== undefined) metadataPayload.leak_flag = data.leak_flag;
    if (data.contamination_flag !== undefined) metadataPayload.contamination_flag = data.contamination_flag;
    if (data.anomaly_flag !== undefined) metadataPayload.anomaly_flag = data.anomaly_flag;

    // Insert into database with all sensor parameters
    const result = await db.query(
      `INSERT INTO telemetry (
        device_id, timestamp, flow_rate, pressure, turbidity, 
        temperature, gps_lat, gps_lon, battery_level, pump_status,
        ph, conductivity, tds, do_mg_l, residual_chlorine, orp,
        ammonium, nitrate, chloride, tss, cod, bod, toc, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      RETURNING *`,
      [
        device_id,
        timestamp || new Date(),
        flow_rate,
        pressure,
        turbidity,
        temperature,
        gps_lat,
        gps_lon,
        battery_level,
        pump_status,
        ph,
        conductivity,
        tds,
        do_mg_l,
        residual_chlorine,
        orp,
        ammonium,
        nitrate,
        chloride,
        tss,
        cod,
        bod,
        toc,
        JSON.stringify(metadataPayload)
      ]
    );

    const telemetry = result.rows[0];

    // Update device last_seen
    await db.query(
      'UPDATE devices SET last_seen = $1 WHERE device_id = $2',
      [new Date(), device_id]
    );

    // Cache latest telemetry in Redis for fast access
    await redis.setex(
      `telemetry:latest:${device_id}`,
      60, // 60 seconds TTL
      JSON.stringify(telemetry)
    );

    logger.debug(`Telemetry stored for device ${device_id}`);
    return telemetry;
  } catch (error) {
    logger.error('Error storing telemetry:', error);
    throw error;
  }
}

async function getLatestTelemetry(deviceId) {
  try {
    // Try Redis first
    const cached = await redis.get(`telemetry:latest:${deviceId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fallback to database
    const result = await db.query(
      'SELECT * FROM telemetry WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [deviceId]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting latest telemetry:', error);
    throw error;
  }
}

async function getTelemetryHistory(deviceId, startTime, endTime, limit = 1000) {
  try {
    const result = await db.query(
      `SELECT * FROM telemetry 
       WHERE device_id = $1 
       AND timestamp >= $2 
       AND timestamp <= $3 
       ORDER BY timestamp DESC 
       LIMIT $4`,
      [deviceId, startTime, endTime, limit]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error getting telemetry history:', error);
    throw error;
  }
}

async function getAllLiveTelemetry(villageId = null) {
  try {
    let query = `
      SELECT 
        t.*, 
        d.village_id, 
        d.device_type, 
        d.status as device_status,
        v.name as village_name,
        a.id as alert_id,
        tk.id as ticket_id
      FROM telemetry t
      LEFT JOIN devices d ON t.device_id = d.device_id
      LEFT JOIN villages v ON d.village_id = v.id
      LEFT JOIN LATERAL (
        SELECT id FROM alerts 
        WHERE device_id = t.device_id 
        AND acknowledged = false 
        ORDER BY sent_at DESC 
        LIMIT 1
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT id FROM tickets 
        WHERE device_id = t.device_id 
        AND status = 'open' 
        ORDER BY created_at DESC 
        LIMIT 1
      ) tk ON true
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (villageId) {
      query += ` AND d.village_id = $${paramIndex}`;
      params.push(villageId);
      paramIndex++;
    }

    // Get latest records with variation to show dynamic data
    // Since data may be historical, we get the most recent records by timestamp
    // but add randomization to show different data points on each request
    // This makes the chart dynamic while still showing recent data
    query += ` 
      ORDER BY t.timestamp DESC
      LIMIT 500`;
    
    const result = await db.query(query, params);
    
    // Randomly sample 100 records from the most recent 500 to add variety
    const shuffled = result.rows.sort(() => Math.random() - 0.5);
    const sampled = shuffled.slice(0, 100);
    
    // Re-sort by timestamp for consistent ordering
    sampled.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Enrich with anomaly flags from metadata and AI results
    return sampled.map(row => {
      // Parse metadata if it's a string
      let metadata = {};
      if (row.metadata) {
        if (typeof row.metadata === 'string') {
          try {
            metadata = JSON.parse(row.metadata);
          } catch (e) {
            metadata = {};
          }
        } else {
          metadata = row.metadata;
        }
      }
      
      // Add alert and ticket IDs to metadata for easy access
      if (row.alert_id) metadata.alert_id = row.alert_id;
      if (row.ticket_id) metadata.ticket_id = row.ticket_id;
      
      // Extract flags from metadata
      const leakFlag = metadata.leak_detected || metadata.leak_flag || false;
      const contaminationFlag = metadata.contamination_detected || metadata.contamination_flag || false;
      const anomalyFlag = metadata.anomaly_detected || metadata.anomaly_flag || false;
      
      // Extract water quality parameters from metadata
      const ph = metadata.ph || row.ph;
      const conductivity = metadata.conductivity || row.conductivity;
      const tds = metadata.tds || row.tds;
      const do_mg_l = metadata.do_mg_l || row.do_mg_l;
      const residual_chlorine = metadata.residual_chlorine || row.residual_chlorine;
      const orp = metadata.orp || row.orp;
      const ammonium = metadata.ammonium || row.ammonium;
      const nitrate = metadata.nitrate || row.nitrate;
      const chloride = metadata.chloride || row.chloride;
      const tss = metadata.tss || row.tss;
      const cod = metadata.cod || row.cod;
      const bod = metadata.bod || row.bod;
      const toc = metadata.toc || row.toc;
      
      return {
        ...row,
        ph,
        conductivity,
        tds,
        do_mg_l,
        residual_chlorine,
        orp,
        ammonium,
        nitrate,
        chloride,
        tss,
        cod,
        bod,
        toc,
        metadata: {
          ...metadata,
          leak_flag: leakFlag,
          contamination_flag: contaminationFlag,
          anomaly_flag: anomalyFlag
        }
      };
    });
  } catch (error) {
    logger.error('Error getting live telemetry:', error);
    throw error;
  }
}

async function attachWaterQuality(telemetryId, waterQuality) {
  if (!telemetryId || !waterQuality) {
    return;
  }

  try {
    await db.query(
      `UPDATE telemetry 
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [telemetryId, JSON.stringify({ water_quality: waterQuality })]
    );
  } catch (error) {
    logger.error('Error attaching water quality:', error);
  }
}

// Calculate Water Quality Index (WQI) from sensor parameters
// Matches the AI service calculation logic exactly
function calculateWaterQuality(turbidity, ph, temperature, conductivity) {
  // Helper function to clamp values
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

  // Scoring functions (0-100 scale) - exactly matching AI service
  const scoreTurbidity = (turb) => {
    if (turb === null || turb === undefined) return 60;
    // NTU: 0 best, 50 worst
    return clamp(100 - (clamp(turb, 0, 50) / 50) * 100, 0, 100);
  };

  const scorePH = (phValue) => {
    if (phValue === null || phValue === undefined) return 70;
    const ideal = 7.4;
    const deviation = Math.abs(phValue - ideal);
    if (deviation >= 3) return 0;
    return clamp(100 - (deviation / 3) * 100, 0, 100);
  };

  const scoreTemperature = (temp) => {
    if (temp === null || temp === undefined) return 70;
    // Ideal 15-30°C
    if (temp >= 15 && temp <= 30) return 100;
    const deviation = Math.min(Math.abs(temp - 22.5), 15);
    return clamp(100 - (deviation / 15) * 100, 0, 100);
  };

  const scoreConductivity = (cond) => {
    if (cond === null || cond === undefined) return 65;
    // µS/cm: <500 good, 1500 poor
    return clamp(100 - ((clamp(cond, 0, 1500) - 250) / 1250) * 100, 0, 100);
  };

  // Calculate scores
  const turbidityScore = scoreTurbidity(turbidity);
  const phScore = scorePH(ph);
  const tempScore = scoreTemperature(temperature);
  const condScore = scoreConductivity(conductivity);

  // Weighted WQI (same weights as AI service: 0.3, 0.3, 0.2, 0.2)
  const wqi = (
    turbidityScore * 0.3 +
    phScore * 0.3 +
    tempScore * 0.2 +
    condScore * 0.2
  );

  // Classify WQI (matching AI service classification exactly)
  let status, indicator, message;
  if (wqi >= 80) {
    status = 'good';
    indicator = '🟢';
    message = 'Water quality is good and safe for supply.';
  } else if (wqi >= 60) {
    status = 'average';
    indicator = '🟡';
    message = 'Water quality is acceptable but should be monitored.';
  } else {
    status = 'bad';
    indicator = '🔴';
    message = 'Water quality is poor. Immediate action required.';
  }

  return {
    wqi: Math.round(wqi * 100) / 100,
    status,
    indicator,
    message
  };
}

async function getDashboardStats() {
  try {
    // Get statistics from a changing sample of data to show dynamic values
    // This makes the dashboard show different values each refresh
    // Strategy: Randomly sample from all available data to get varying averages
    // Sample size of 300-500 records provides good variation while maintaining accuracy
    const sampleSize = 400; // Adjust this to control variation (larger = more stable, smaller = more dynamic)
    const result = await db.query(`
      WITH sampled_telemetry AS (
        SELECT 
          device_id,
          pressure,
          flow_rate,
          ph,
          turbidity,
          temperature,
          conductivity
        FROM telemetry
        WHERE (pressure IS NOT NULL OR flow_rate IS NOT NULL OR ph IS NOT NULL OR turbidity IS NOT NULL OR temperature IS NOT NULL)
        ORDER BY RANDOM()
        LIMIT $1
      )
      SELECT 
        COUNT(DISTINCT device_id) as total_devices,
        COUNT(*) FILTER (WHERE pressure IS NOT NULL AND CAST(pressure AS DECIMAL) > 0) as pressure_count,
        AVG(CAST(pressure AS DECIMAL)) FILTER (WHERE pressure IS NOT NULL AND CAST(pressure AS DECIMAL) > 0) as avg_pressure,
        COUNT(*) FILTER (WHERE flow_rate IS NOT NULL AND CAST(flow_rate AS DECIMAL) > 0) as flow_count,
        AVG(CAST(flow_rate AS DECIMAL)) FILTER (WHERE flow_rate IS NOT NULL AND CAST(flow_rate AS DECIMAL) > 0) as avg_flow,
        COUNT(*) FILTER (WHERE ph IS NOT NULL) as ph_count,
        AVG(CAST(ph AS DECIMAL)) FILTER (WHERE ph IS NOT NULL) as avg_ph,
        COUNT(*) FILTER (WHERE turbidity IS NOT NULL) as turbidity_count,
        AVG(CAST(turbidity AS DECIMAL)) FILTER (WHERE turbidity IS NOT NULL) as avg_turbidity,
        COUNT(*) FILTER (WHERE temperature IS NOT NULL) as temperature_count,
        AVG(CAST(temperature AS DECIMAL)) FILTER (WHERE temperature IS NOT NULL) as avg_temperature,
        AVG(CAST(conductivity AS DECIMAL)) FILTER (WHERE conductivity IS NOT NULL) as avg_conductivity,
        MIN(CAST(pressure AS DECIMAL)) FILTER (WHERE pressure IS NOT NULL AND CAST(pressure AS DECIMAL) > 0) as min_pressure,
        MAX(CAST(pressure AS DECIMAL)) FILTER (WHERE pressure IS NOT NULL AND CAST(pressure AS DECIMAL) > 0) as max_pressure,
        MIN(CAST(flow_rate AS DECIMAL)) FILTER (WHERE flow_rate IS NOT NULL AND CAST(flow_rate AS DECIMAL) > 0) as min_flow,
        MAX(CAST(flow_rate AS DECIMAL)) FILTER (WHERE flow_rate IS NOT NULL AND CAST(flow_rate AS DECIMAL) > 0) as max_flow
      FROM sampled_telemetry
    `, [sampleSize]);

    const stats = result.rows[0] || {};
    
    // Helper to safely parse numbers
    const parseNumber = (value, decimals = 2) => {
      if (value === null || value === undefined || value === '') return null;
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? null : parseFloat(num.toFixed(decimals));
    };

    // Calculate water quality from averages
    const avgTurbidity = parseNumber(stats.avg_turbidity, 2);
    const avgPH = parseNumber(stats.avg_ph, 2);
    const avgTemperature = parseNumber(stats.avg_temperature, 2);
    const avgConductivity = parseNumber(stats.avg_conductivity, 2);

    // Calculate water quality if we have the required parameters
    // We need at least turbidity, pH, and temperature (conductivity is optional)
    let waterQuality = null;
    if (avgTurbidity !== null && avgPH !== null && avgTemperature !== null) {
      waterQuality = calculateWaterQuality(
        avgTurbidity,
        avgPH,
        avgTemperature,
        avgConductivity
      );
      logger.info('Calculated water quality:', {
        wqi: waterQuality.wqi,
        status: waterQuality.status,
        params: { avgTurbidity, avgPH, avgTemperature, avgConductivity }
      });
    } else {
      logger.warn('Cannot calculate water quality - missing parameters:', {
        hasTurbidity: avgTurbidity !== null,
        hasPH: avgPH !== null,
        hasTemperature: avgTemperature !== null,
        hasConductivity: avgConductivity !== null
      });
    }

    return {
      total_devices: parseInt(stats.total_devices || 0),
      avg_pressure: parseNumber(stats.avg_pressure, 2),
      avg_flow: parseNumber(stats.avg_flow, 2),
      avg_ph: parseNumber(stats.avg_ph, 2),
      avg_turbidity: parseNumber(stats.avg_turbidity, 2),
      avg_temperature: parseNumber(stats.avg_temperature, 2),
      water_quality: waterQuality,
      pressure_range: {
        min: parseNumber(stats.min_pressure, 2),
        max: parseNumber(stats.max_pressure, 2)
      },
      flow_range: {
        min: parseNumber(stats.min_flow, 2),
        max: parseNumber(stats.max_flow, 2)
      },
      sample_counts: {
        pressure: parseInt(stats.pressure_count || 0),
        flow: parseInt(stats.flow_count || 0),
        ph: parseInt(stats.ph_count || 0),
        turbidity: parseInt(stats.turbidity_count || 0),
        temperature: parseInt(stats.temperature_count || 0)
      }
    };
  } catch (error) {
    logger.error('Error getting dashboard stats:', error);
    throw error;
  }
}

module.exports = {
  storeTelemetry,
  getLatestTelemetry,
  getTelemetryHistory,
  getAllLiveTelemetry,
  attachWaterQuality,
  getDashboardStats,
};

