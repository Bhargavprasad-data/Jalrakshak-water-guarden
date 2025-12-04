const db = require('../db/connection');
const logger = require('../utils/logger');
const ticketService = require('./ticketService');

async function createAlert(alertData) {
  const {
    device_id,
    type,
    severity,
    confidence,
    gps_lat,
    gps_lon,
    description
  } = alertData;

  try {
    // First create anomaly record
    const anomalyResult = await db.query(
      `INSERT INTO anomalies (
        device_id, anomaly_type, severity, confidence, 
        gps_lat, gps_lon, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [device_id, type, severity, confidence, gps_lat, gps_lon, description]
    );

    const anomaly = anomalyResult.rows[0];

    // Create alert
    const alertResult = await db.query(
      `INSERT INTO alerts (
        anomaly_id, device_id, alert_type, severity, 
        message, gps_lat, gps_lon
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        anomaly.id,
        device_id,
        type,
        severity,
        description || `Alert: ${type} detected with ${severity} severity`,
        gps_lat,
        gps_lon
      ]
    );

    const alert = alertResult.rows[0];

    // Create ticket for high/critical severity alerts
    if (severity === 'high' || severity === 'critical') {
      const ticket = await ticketService.createTicket({
        anomaly_id: anomaly.id,
        device_id,
        issue_type: type,
        description,
        severity,
        gps_lat,
        gps_lon
      });
      alert.ticket_id = ticket.id;
    }

    logger.info(`Alert created: ${alert.id} for device ${device_id}`);
    return alert;
  } catch (error) {
    logger.error('Error creating alert:', error);
    throw error;
  }
}

async function getAlerts(filters = {}) {
  try {
    // First get alerts from database
    let query = `
      SELECT 
        a.*, 
        an.anomaly_type, 
        an.confidence,
        an.detected_at,
        d.village_id, 
        d.device_type,
        v.name as village_name,
        CASE 
          WHEN a.gps_lat IS NOT NULL AND a.gps_lon IS NOT NULL 
          THEN CONCAT(a.gps_lat, ', ', a.gps_lon)
          ELSE 'N/A'
        END as location
      FROM alerts a
      LEFT JOIN anomalies an ON a.anomaly_id = an.id
      LEFT JOIN devices d ON a.device_id = d.device_id
      LEFT JOIN villages v ON d.village_id = v.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (filters.village_id) {
      query += ` AND d.village_id = $${paramCount}`;
      params.push(filters.village_id);
      paramCount++;
    }

    if (filters.severity) {
      query += ` AND a.severity = $${paramCount}`;
      params.push(filters.severity);
      paramCount++;
    }

    if (filters.acknowledged !== undefined) {
      query += ` AND a.acknowledged = $${paramCount}`;
      params.push(filters.acknowledged);
      paramCount++;
    }

    query += ` ORDER BY a.sent_at DESC LIMIT $${paramCount}`;
    params.push(filters.limit || 1000);

    const dbAlerts = await db.query(query, params);
    
    // Also get dynamic alerts from telemetry data (leak_flag, contamination_flag, etc.)
    // This ensures we show alerts even if they haven't been processed into the alerts table yet
    let dynamicAlertsQuery = `
      SELECT 
        t.device_id,
        t.timestamp,
        t.pressure,
        t.flow_rate,
        t.turbidity,
        t.ph,
        t.temperature,
        t.gps_lat,
        t.gps_lon,
        t.metadata,
        d.village_id,
        d.device_type,
        v.name as village_name,
        CASE 
          WHEN t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' THEN 'leak'
          WHEN t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' THEN 'contamination'
          WHEN t.metadata->>'anomaly_flag' = 'true' OR t.metadata->>'anomaly_flag' = 'True' THEN 'pressure_anomaly'
          WHEN t.pressure > 800 THEN 'high_pressure'
          WHEN t.pressure < 200 THEN 'low_pressure'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'low_flow'
          WHEN t.turbidity > 10 THEN 'high_turbidity'
          WHEN t.ph < 6.5 THEN 'low_ph'
          WHEN t.ph > 8.5 THEN 'high_ph'
          ELSE NULL
        END as alert_type,
        CASE 
          WHEN t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' THEN 'critical'
          WHEN t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' THEN 'high'
          WHEN t.pressure > 800 THEN 'critical'
          WHEN t.pressure < 200 THEN 'high'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'high'
          WHEN t.turbidity > 10 THEN 'high'
          WHEN t.ph < 6.5 OR t.ph > 8.5 THEN 'medium'
          ELSE 'medium'
        END as severity,
        CASE 
          WHEN t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' THEN 'Critical: Water leak detected - immediate action required'
          WHEN t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' THEN 'High: Water contamination detected - turbidity/quality issues'
          WHEN t.pressure > 800 THEN 'Critical: Pressure exceeds safe limit (>800 bar)'
          WHEN t.pressure < 200 THEN 'High: Low pressure detected - water supply may be affected'
          WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'High: Flow rate critically low or negative'
          WHEN t.turbidity > 10 THEN 'High: Turbidity exceeds acceptable levels (>10 NTU)'
          WHEN t.ph < 6.5 THEN 'Medium: pH below optimal range (<6.5)'
          WHEN t.ph > 8.5 THEN 'Medium: pH above optimal range (>8.5)'
          ELSE 'Anomaly detected in sensor readings'
        END as message
      FROM telemetry t
      LEFT JOIN devices d ON t.device_id = d.device_id
      LEFT JOIN villages v ON d.village_id = v.id
      WHERE (
        (t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True') OR
        (t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True') OR
        (t.metadata->>'anomaly_flag' = 'true' OR t.metadata->>'anomaly_flag' = 'True') OR
        t.pressure > 800 OR
        t.pressure < 200 OR
        t.flow_rate < 5 OR t.flow_rate < 0 OR
        t.turbidity > 10 OR
        (t.ph < 6.5 OR t.ph > 8.5)
      )
    `;
    
    const dynamicParams = [];
    let dynamicParamCount = 1;
    
    if (filters.village_id) {
      dynamicAlertsQuery += ` AND d.village_id = $${dynamicParamCount}`;
      dynamicParams.push(filters.village_id);
      dynamicParamCount++;
    }
    
    // Filter by severity if specified
    if (filters.severity) {
      if (filters.severity === 'critical') {
        dynamicAlertsQuery += ` AND (t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' OR t.pressure > 800)`;
      } else if (filters.severity === 'high') {
        dynamicAlertsQuery += ` AND (t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' OR t.pressure < 200 OR t.flow_rate < 5 OR t.turbidity > 10)`;
      } else if (filters.severity === 'medium') {
        dynamicAlertsQuery += ` AND (t.ph < 6.5 OR t.ph > 8.5)`;
      }
    }
    
    // Dynamic alerts are always unacknowledged, so if filtering for acknowledged=true, skip them
    if (filters.acknowledged === true) {
      // Skip dynamic alerts, only return DB alerts
      const result = await db.query(query, params);
      return result.rows;
    }
    
    dynamicAlertsQuery += `
      AND NOT EXISTS (
        SELECT 1 FROM alerts a2
        WHERE a2.device_id = t.device_id
        AND a2.alert_type = (
          CASE 
            WHEN t.metadata->>'leak_flag' = 'true' OR t.metadata->>'leak_flag' = 'True' THEN 'leak'
            WHEN t.metadata->>'contamination_flag' = 'true' OR t.metadata->>'contamination_flag' = 'True' THEN 'contamination'
            WHEN t.metadata->>'anomaly_flag' = 'true' OR t.metadata->>'anomaly_flag' = 'True' THEN 'pressure_anomaly'
            WHEN t.pressure > 800 THEN 'high_pressure'
            WHEN t.pressure < 200 THEN 'low_pressure'
            WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'low_flow'
            WHEN t.turbidity > 10 THEN 'high_turbidity'
            WHEN t.ph < 6.5 THEN 'low_ph'
            WHEN t.ph > 8.5 THEN 'high_ph'
            ELSE NULL
          END
        )
        AND DATE(a2.sent_at) = DATE(t.timestamp)
      )
      ORDER BY t.timestamp DESC
      LIMIT 500
    `;
    
    const dynamicResult = await db.query(dynamicAlertsQuery, dynamicParams);
    
    // Convert dynamic alerts to alert format
    const dynamicAlerts = dynamicResult.rows
      .filter(row => row.alert_type)
      .map((row, index) => ({
        id: `dynamic-${row.device_id}-${row.alert_type}-${index}`,
        device_id: row.device_id,
        alert_type: row.alert_type,
        severity: row.severity,
        message: row.message,
        gps_lat: row.gps_lat,
        gps_lon: row.gps_lon,
        sent_at: row.timestamp,
        acknowledged: false,
        anomaly_type: row.alert_type,
        confidence: 0.90,
        detected_at: row.timestamp,
        village_id: row.village_id,
        device_type: row.device_type,
        village_name: row.village_name,
        location: row.gps_lat && row.gps_lon ? `${row.gps_lat}, ${row.gps_lon}` : 'N/A',
        is_dynamic: true
      }));
    
    // Combine database alerts and dynamic alerts, removing duplicates
    const alertMap = new Map();
    
    // Add database alerts first
    dbAlerts.rows.forEach(alert => {
      const key = `${alert.device_id}-${alert.alert_type}-${new Date(alert.sent_at).toISOString().split('T')[0]}`;
      alertMap.set(key, alert);
    });
    
    // Add dynamic alerts if they don't already exist
    dynamicAlerts.forEach(alert => {
      const key = `${alert.device_id}-${alert.alert_type}-${new Date(alert.sent_at).toISOString().split('T')[0]}`;
      if (!alertMap.has(key)) {
        alertMap.set(key, alert);
      }
    });
    
    // Filter by severity if specified
    let combinedAlerts = Array.from(alertMap.values());
    if (filters.severity) {
      combinedAlerts = combinedAlerts.filter(a => a.severity === filters.severity);
    }
    
    // Filter by acknowledged if specified
    if (filters.acknowledged !== undefined) {
      combinedAlerts = combinedAlerts.filter(a => a.acknowledged === filters.acknowledged);
    }
    
    // Sort by sent_at (newest first) and limit
    combinedAlerts.sort((a, b) => {
      const dateA = new Date(a.sent_at || a.detected_at || 0);
      const dateB = new Date(b.sent_at || b.detected_at || 0);
      return dateB - dateA;
    });
    
    return combinedAlerts.slice(0, filters.limit || 1000);
  } catch (error) {
    logger.error('Error getting alerts:', error);
    throw error;
  }
}

async function acknowledgeAlert(alertId, userId) {
  try {
    const result = await db.query(
      `UPDATE alerts 
       SET acknowledged = true, acknowledged_by = $1, acknowledged_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [userId || null, alertId]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error acknowledging alert:', error);
    throw error;
  }
}

module.exports = {
  createAlert,
  getAlerts,
  acknowledgeAlert,
};

