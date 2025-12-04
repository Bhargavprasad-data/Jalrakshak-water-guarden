const express = require('express');
const db = require('../db/connection');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get analytics (public access)
router.get('/', async (req, res) => {
  try {
    const { village_id, start_date, end_date, metric } = req.query;
    // Parse dates - ensure they're valid timestamps
    let startDate, endDate;
    
    if (start_date) {
      startDate = new Date(start_date).toISOString();
    } else {
      // Default to 90 days ago
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    }
    
    if (end_date) {
      endDate = new Date(end_date).toISOString();
      // Add one day to end date to include the full day
      const endDateObj = new Date(end_date);
      endDateObj.setHours(23, 59, 59, 999);
      endDate = endDateObj.toISOString();
    } else {
      endDate = new Date().toISOString();
    }
    
    // For leakage_trends, if date range is too small, expand it to show more data
    if (metric === 'leakage_trends') {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
      
      // If range is less than 7 days, expand to 30 days to show more trend
      if (daysDiff < 7) {
        const newStart = new Date(end);
        newStart.setDate(newStart.getDate() - 30);
        startDate = newStart.toISOString();
        logger.info(`Expanded date range for leakage_trends: ${startDate} to ${endDate}`);
      }
    }

    let query;
    // All metrics will use date filters to ensure graphs update based on selected date range
    const params = [startDate, endDate];
    let paramIndex = 3; // Start from 3 since startDate and endDate are 1 and 2
    
    if (village_id) {
      params.push(village_id);
    }

    switch (metric) {
      case 'leakage_trends':
        // Filter by date range and village if provided
        // Include leaks from anomalies table AND from telemetry metadata leak_flag
        // Include ALL dates in the range to show continuous lines (even with 0 leaks)
        query = `
          WITH leak_data AS (
            -- Leaks from anomalies table
          SELECT 
            DATE(a.detected_at) as date,
              a.confidence,
              a.device_id,
              d.village_id
          FROM anomalies a
          LEFT JOIN devices d ON a.device_id = d.device_id
          WHERE a.anomaly_type = 'leak'
              AND a.detected_at >= $1::timestamp
              AND a.detected_at <= $2::timestamp
              ${village_id ? `AND d.village_id = $${paramIndex}` : ''}
            
            UNION ALL
            
            -- Leaks from telemetry metadata leak_flag (handle both string and boolean)
            -- Count each telemetry record with leak_flag = true as a leak
            SELECT 
              DATE(t.timestamp) as date,
              0.95 as confidence,
              t.device_id,
              d.village_id
            FROM telemetry t
            LEFT JOIN devices d ON t.device_id = d.device_id
            WHERE (
              t.metadata->>'leak_flag' = 'true' OR 
              t.metadata->>'leak_flag' = 'True' OR
              t.metadata->>'leak_flag' = 'TRUE' OR
              t.metadata->>'leak_flag' = '1' OR
              (t.metadata->>'leak_flag')::boolean = true
            )
              AND t.timestamp >= $1::timestamp
              AND t.timestamp <= $2::timestamp
              ${village_id ? `AND d.village_id = $${paramIndex}` : ''}
              -- Exclude if already in anomalies table for same device and date
              AND NOT EXISTS (
                SELECT 1 FROM anomalies an
                WHERE an.device_id = t.device_id
                AND an.anomaly_type = 'leak'
                AND DATE(an.detected_at) = DATE(t.timestamp)
              )
          ),
          date_series AS (
            -- Generate date series for the entire range to show continuous lines
            SELECT generate_series(
              DATE($1::timestamp),
              DATE($2::timestamp),
              '1 day'::interval
            )::date as date
          ),
          leak_counts AS (
            -- Count leaks per date
            SELECT 
              date,
              COUNT(*)::INTEGER as leak_count,
              -- Store confidence as percentage (0-100) so charts show correct values
              AVG(CAST(confidence AS DECIMAL)) * 100 as avg_confidence
            FROM leak_data
            GROUP BY date
          )
          SELECT 
            ds.date,
            COALESCE(lc.leak_count, 0)::INTEGER as leak_count,
            COALESCE(lc.avg_confidence, 0)::DECIMAL as avg_confidence
          FROM date_series ds
          LEFT JOIN leak_counts lc ON ds.date = lc.date
          ORDER BY ds.date ASC
          LIMIT 365
        `;
        break;

      case 'water_quality':
        // Filter by date range and village if provided - include all records with turbidity or temperature
        query = `
          SELECT 
            DATE(t.timestamp) as date,
            AVG(CAST(t.turbidity AS DECIMAL)) as avg_turbidity,
            AVG(CAST(t.temperature AS DECIMAL)) as avg_temperature,
            COUNT(*) as sample_count
          FROM telemetry t
          JOIN devices d ON t.device_id = d.device_id
          WHERE (t.turbidity IS NOT NULL OR t.temperature IS NOT NULL)
            AND t.timestamp >= $1::timestamp
            AND t.timestamp <= $2::timestamp
            ${village_id ? `AND d.village_id = $${paramIndex}` : ''}
          GROUP BY DATE(t.timestamp)
          HAVING COUNT(*) > 0
          ORDER BY date ASC
          LIMIT 100
        `;
        break;

      case 'pressure_flow':
        // Filter by date range and village if provided - include all records with pressure or flow_rate
        query = `
          SELECT 
            DATE(t.timestamp) as date,
            AVG(CAST(t.pressure AS DECIMAL)) as avg_pressure,
            AVG(CAST(t.flow_rate AS DECIMAL)) as avg_flow_rate,
            COUNT(*) as sample_count
          FROM telemetry t
          LEFT JOIN devices d ON t.device_id = d.device_id
          WHERE (t.pressure IS NOT NULL OR t.flow_rate IS NOT NULL)
            AND t.timestamp >= $1::timestamp
            AND t.timestamp <= $2::timestamp
            ${village_id ? `AND d.village_id = $${paramIndex}` : ''}
          GROUP BY DATE(t.timestamp)
          HAVING COUNT(*) > 0
          ORDER BY date ASC
          LIMIT 100
        `;
        break;

      case 'pump_performance':
        query = `
          SELECT 
            device_id,
            COUNT(*) FILTER (WHERE pump_status = 'on') as on_count,
            COUNT(*) FILTER (WHERE pump_status = 'off') as off_count,
            COUNT(*) FILTER (WHERE pump_status = 'fault') as fault_count
          FROM telemetry t
          JOIN devices d ON t.device_id = d.device_id
          WHERE t.timestamp >= $1::timestamp AND t.timestamp <= $2::timestamp
          ${village_id ? `AND d.village_id = $${paramIndex}` : ''}
          AND d.device_type = 'pump'
          GROUP BY device_id
        `;
        break;

      default:
        return res.status(400).json({ error: 'Invalid metric' });
    }

    logger.info(`Analytics query for ${metric}:`, { startDate, endDate, village_id, params });
    
    let result;
    try {
      result = await db.query(query, params);
      logger.info(`Query returned ${result.rows.length} rows for metric ${metric}`);
      
      // For leakage_trends, also log how many leaks were found in each source
      if (metric === 'leakage_trends') {
        const anomaliesCount = await db.query(`
          SELECT COUNT(*) as count FROM anomalies 
          WHERE anomaly_type = 'leak' 
          AND detected_at >= $1::timestamp 
          AND detected_at <= $2::timestamp
        `, [startDate, endDate]);
        
        const telemetryCount = await db.query(`
          SELECT COUNT(*) as count FROM telemetry 
          WHERE (
            metadata->>'leak_flag' = 'true' OR 
            metadata->>'leak_flag' = 'True' OR 
            metadata->>'leak_flag' = 'TRUE' OR
            metadata->>'leak_flag' = '1' OR
            (metadata->>'leak_flag')::boolean = true
          )
          AND timestamp >= $1::timestamp 
          AND timestamp <= $2::timestamp
        `, [startDate, endDate]);
        
        logger.info(`Leakage sources - Anomalies: ${anomaliesCount.rows[0].count}, Telemetry flags: ${telemetryCount.rows[0].count}`);
        logger.info(`Query returned ${result.rows.length} date groups with leaks`);
        
        // Log sample of results to verify counts
        if (result.rows.length > 0) {
          logger.info(`Sample leak data (first 5):`, result.rows.slice(0, 5).map(r => ({
            date: r.date,
            leak_count: r.leak_count,
            avg_confidence: r.avg_confidence
          })));
        } else {
          logger.warn(`No leak data found in date range ${startDate} to ${endDate}`);
        }
      }
      
      // If no data found in the selected date range, try to get the most recent data available
      if (result.rows.length === 0 && metric !== 'pump_performance') {
        logger.info(`No data in date range, fetching most recent data for ${metric}`);
        let fallbackQuery;
        
        switch (metric) {
          case 'leakage_trends':
            // Get the most recent leaks with all dates filled in (last 30 days or all available)
            fallbackQuery = `
              WITH leak_data AS (
                -- Leaks from anomalies table
                SELECT 
                  DATE(a.detected_at) as date,
                  a.confidence,
                  a.device_id,
                  d.village_id
                FROM anomalies a
                LEFT JOIN devices d ON a.device_id = d.device_id
                WHERE a.anomaly_type = 'leak'
                  ${village_id ? `AND d.village_id = $1` : ''}
                
                UNION ALL
                
                -- Leaks from telemetry metadata leak_flag (count each record)
                SELECT 
                  DATE(t.timestamp) as date,
                  0.95 as confidence,
                  t.device_id,
                  d.village_id
                FROM telemetry t
                LEFT JOIN devices d ON t.device_id = d.device_id
                WHERE (
                  t.metadata->>'leak_flag' = 'true' OR 
                  t.metadata->>'leak_flag' = 'True' OR
                  t.metadata->>'leak_flag' = 'TRUE' OR
                  t.metadata->>'leak_flag' = '1' OR
                  (t.metadata->>'leak_flag')::boolean = true
                )
                  ${village_id ? `AND d.village_id = $1` : ''}
                  -- Exclude if already in anomalies table
                  AND NOT EXISTS (
                    SELECT 1 FROM anomalies an
                    WHERE an.device_id = t.device_id
                    AND an.anomaly_type = 'leak'
                    AND DATE(an.detected_at) = DATE(t.timestamp)
                  )
              ),
              date_range AS (
                SELECT 
                  COALESCE(MIN(date), CURRENT_DATE - INTERVAL '30 days') as start_date,
                  COALESCE(MAX(date), CURRENT_DATE) as end_date
                FROM leak_data
              ),
              date_series AS (
                -- Generate date series for the entire range
                SELECT generate_series(
                  (SELECT start_date FROM date_range),
                  (SELECT end_date FROM date_range),
                  '1 day'::interval
                )::date as date
              ),
              leak_counts AS (
                -- Count leaks per date
                SELECT 
                  date,
                  COUNT(*)::INTEGER as leak_count,
                  -- Confidence as percentage (0-100)
                  AVG(CAST(confidence AS DECIMAL)) * 100 as avg_confidence
                FROM leak_data
                GROUP BY date
              )
              SELECT 
                ds.date,
                COALESCE(lc.leak_count, 0)::INTEGER as leak_count,
                COALESCE(lc.avg_confidence, 0)::DECIMAL as avg_confidence
              FROM date_series ds
              LEFT JOIN leak_counts lc ON ds.date = lc.date
              ORDER BY ds.date ASC
              LIMIT 100
            `;
            break;
          case 'water_quality':
            fallbackQuery = `
              SELECT 
                DATE(t.timestamp) as date,
                AVG(CAST(t.turbidity AS DECIMAL)) as avg_turbidity,
                AVG(CAST(t.temperature AS DECIMAL)) as avg_temperature,
                COUNT(*) as sample_count
              FROM telemetry t
              JOIN devices d ON t.device_id = d.device_id
              WHERE (t.turbidity IS NOT NULL OR t.temperature IS NOT NULL)
                ${village_id ? `AND d.village_id = $1` : ''}
              GROUP BY DATE(t.timestamp)
              HAVING COUNT(*) > 0
              ORDER BY date DESC
              LIMIT 30
            `;
            break;
          case 'pressure_flow':
            fallbackQuery = `
              SELECT 
                DATE(t.timestamp) as date,
                AVG(CAST(t.pressure AS DECIMAL)) as avg_pressure,
                AVG(CAST(t.flow_rate AS DECIMAL)) as avg_flow_rate,
                COUNT(*) as sample_count
              FROM telemetry t
              LEFT JOIN devices d ON t.device_id = d.device_id
              WHERE (t.pressure IS NOT NULL OR t.flow_rate IS NOT NULL)
                ${village_id ? `AND d.village_id = $1` : ''}
              GROUP BY DATE(t.timestamp)
              HAVING COUNT(*) > 0
              ORDER BY date DESC
              LIMIT 30
            `;
            break;
        }
        
        if (fallbackQuery) {
          const fallbackParams = village_id ? [village_id] : [];
          const fallbackResult = await db.query(fallbackQuery, fallbackParams);
          if (fallbackResult.rows.length > 0) {
            // Reverse to show oldest to newest
            result.rows = fallbackResult.rows.reverse();
            logger.info(`Fallback query returned ${result.rows.length} rows`);
          }
        }
      }
    } catch (queryError) {
      logger.error(`Query error for ${metric}:`, queryError);
      logger.error(`Query was: ${query}`);
      logger.error(`Params were:`, params);
      throw queryError;
    }
    
    // Format the response - ensure numbers are properly formatted
    const formattedRows = result.rows.map(row => {
      const formatted = { ...row };
      
      // Convert date to ISO string if it's a Date object
      if (formatted.date instanceof Date) {
        formatted.date = formatted.date.toISOString().split('T')[0];
      } else if (formatted.date) {
        formatted.date = String(formatted.date).split('T')[0];
      }
      
      // Ensure numeric fields are numbers, not strings
      if (formatted.avg_pressure !== undefined && formatted.avg_pressure !== null) {
        formatted.avg_pressure = typeof formatted.avg_pressure === 'string' 
          ? parseFloat(formatted.avg_pressure) 
          : Number(formatted.avg_pressure);
      }
      if (formatted.avg_flow_rate !== undefined && formatted.avg_flow_rate !== null) {
        formatted.avg_flow_rate = typeof formatted.avg_flow_rate === 'string' 
          ? parseFloat(formatted.avg_flow_rate) 
          : Number(formatted.avg_flow_rate);
      }
      if (formatted.avg_turbidity !== undefined && formatted.avg_turbidity !== null) {
        formatted.avg_turbidity = typeof formatted.avg_turbidity === 'string' 
          ? parseFloat(formatted.avg_turbidity) 
          : Number(formatted.avg_turbidity);
      }
      if (formatted.avg_temperature !== undefined && formatted.avg_temperature !== null) {
        formatted.avg_temperature = typeof formatted.avg_temperature === 'string' 
          ? parseFloat(formatted.avg_temperature) 
          : Number(formatted.avg_temperature);
      }
      
      return formatted;
    });
    
    logger.info(`Analytics query returned ${formattedRows.length} rows`);
    res.json(formattedRows);
  } catch (error) {
    logger.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

module.exports = router;

