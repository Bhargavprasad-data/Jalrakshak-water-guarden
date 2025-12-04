const express = require('express');
const db = require('../db/connection');
const logger = require('../utils/logger');

const router = express.Router();

const PERIOD_MAP = {
  daily: { label: 'Daily', interval: "interval '1 day'", bucket: 'hour' },
  weekly: { label: 'Weekly', interval: "interval '7 day'", bucket: 'day' },
  monthly: { label: 'Monthly', interval: "interval '90 day'", bucket: 'day' } // Extended to 90 days for monthly
};

function buildQuery(periodConfig) {
  const bucket = periodConfig.bucket;
  // For all periods, get all available data (not just recent)
  // The period just determines the grouping/bucketing, not the time range
  // This ensures reports work with historical data from CSV imports
  
  return `
    SELECT 
      date_trunc('${bucket}', t.timestamp) AS bucket,
      t.device_id,
      AVG(CAST(t.flow_rate AS DECIMAL)) AS avg_flow,
      AVG(CAST(t.pressure AS DECIMAL)) AS avg_pressure,
      AVG(CAST(t.turbidity AS DECIMAL)) AS avg_turbidity,
      AVG(CAST(t.temperature AS DECIMAL)) AS avg_temperature,
      MAX(t.battery_level) AS max_battery,
      MIN(t.battery_level) AS min_battery,
      COUNT(*) AS samples
    FROM telemetry t
    WHERE t.flow_rate IS NOT NULL OR t.pressure IS NOT NULL OR t.turbidity IS NOT NULL
    GROUP BY bucket, t.device_id
    ORDER BY bucket DESC, t.device_id ASC
    LIMIT 1000
  `;
}

router.get('/telemetry', async (req, res) => {
  try {
    const periodKey = (req.query.period || 'daily').toLowerCase();
    const periodConfig = PERIOD_MAP[periodKey] || PERIOD_MAP.daily;

    const query = buildQuery(periodConfig);
    logger.info(`Generating ${periodKey} report with query: ${query}`);
    const result = await db.query(query);

    logger.info(`Report query returned ${result.rows.length} rows`);

    // Helper to safely parse numbers
    const parseNumber = (value, decimals = 2) => {
      if (value === null || value === undefined || value === '') return '0.00';
      const num = typeof value === 'string' ? parseFloat(value) : Number(value);
      return isNaN(num) ? '0.00' : num.toFixed(decimals);
    };

    const response = {
      period: periodKey,
      generated_at: new Date().toISOString(),
      rows: result.rows.map((row) => ({
        period_start: row.bucket,
        device_id: row.device_id,
        avg_flow: parseNumber(row.avg_flow, 2),
        avg_pressure: parseNumber(row.avg_pressure, 2),
        avg_turbidity: parseNumber(row.avg_turbidity, 2),
        avg_temperature: parseNumber(row.avg_temperature, 2),
        max_battery: row.max_battery != null ? parseInt(row.max_battery) : null,
        min_battery: row.min_battery != null ? parseInt(row.min_battery) : null,
        samples: parseInt(row.samples || 0)
      }))
    };

    res.json(response);
  } catch (error) {
    logger.error('Report generation error:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to generate report', message: error.message });
  }
});

module.exports = router;






