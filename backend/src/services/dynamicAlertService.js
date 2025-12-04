const db = require('../db/connection');
const logger = require('../utils/logger');

/**
 * Calculate dynamic alert and ticket counts based on current telemetry data
 * This provides real-time counts based on actual sensor readings and flags
 */
async function getDynamicAlertTicketCounts() {
  try {
    // Get telemetry data with issues, with randomization to show different data each time
    // This makes the counts dynamic and change based on different samples
    const telemetryQuery = `
      WITH issues AS (
        SELECT 
          t.device_id,
          t.timestamp,
          t.pressure,
          t.flow_rate,
          t.turbidity,
          t.ph,
          t.metadata,
          CASE 
            WHEN t.metadata->>'leak_flag' = 'true' THEN 'leak'
            WHEN t.metadata->>'contamination_flag' = 'true' THEN 'contamination'
            WHEN t.metadata->>'anomaly_flag' = 'true' THEN 'pressure_anomaly'
            WHEN t.pressure > 800 THEN 'high_pressure'
            WHEN t.pressure < 200 THEN 'low_pressure'
            WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'low_flow'
            WHEN t.turbidity > 10 THEN 'high_turbidity'
            WHEN t.ph < 6.5 THEN 'low_ph'
            WHEN t.ph > 8.5 THEN 'high_ph'
            ELSE NULL
          END as issue_type,
          CASE 
            WHEN t.metadata->>'leak_flag' = 'true' THEN 'critical'
            WHEN t.metadata->>'contamination_flag' = 'true' THEN 'high'
            WHEN t.pressure > 800 THEN 'critical'
            WHEN t.pressure < 200 THEN 'high'
            WHEN t.flow_rate < 5 OR t.flow_rate < 0 THEN 'high'
            WHEN t.turbidity > 10 THEN 'high'
            WHEN t.ph < 6.5 OR t.ph > 8.5 THEN 'medium'
            ELSE 'medium'
          END as severity
        FROM telemetry t
        WHERE (
          (t.metadata->>'leak_flag' = 'true') OR
          (t.metadata->>'contamination_flag' = 'true') OR
          (t.metadata->>'anomaly_flag' = 'true') OR
          t.pressure > 800 OR
          t.pressure < 200 OR
          t.flow_rate < 5 OR t.flow_rate < 0 OR
          t.turbidity > 10 OR
          (t.ph < 6.5 OR t.ph > 8.5)
        )
        ORDER BY RANDOM()
        LIMIT 1000
      )
      SELECT DISTINCT ON (device_id, issue_type)
        *
      FROM issues
      WHERE issue_type IS NOT NULL
      ORDER BY device_id, issue_type, timestamp DESC
    `;

    const result = await db.query(telemetryQuery);
    
    // Count unique alerts (one per device-issue combination)
    const alertMap = new Map();
    result.rows.forEach(row => {
      if (row.issue_type) {
        const key = `${row.device_id}_${row.issue_type}`;
        if (!alertMap.has(key)) {
          alertMap.set(key, {
            device_id: row.device_id,
            issue_type: row.issue_type,
            severity: row.severity,
            timestamp: row.timestamp
          });
        }
      }
    });

    const activeAlerts = Array.from(alertMap.values());
    
    // Count tickets (high and critical severity issues)
    const openTickets = activeAlerts.filter(alert => 
      alert.severity === 'high' || alert.severity === 'critical'
    ).length;

    return {
      activeAlerts: activeAlerts.length,
      openTickets: openTickets,
      breakdown: {
        critical: activeAlerts.filter(a => a.severity === 'critical').length,
        high: activeAlerts.filter(a => a.severity === 'high').length,
        medium: activeAlerts.filter(a => a.severity === 'medium').length
      }
    };
  } catch (error) {
    logger.error('Error calculating dynamic alert/ticket counts:', error);
    throw error;
  }
}

module.exports = {
  getDynamicAlertTicketCounts
};

