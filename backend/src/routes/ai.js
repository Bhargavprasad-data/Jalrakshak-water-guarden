const express = require('express');
const db = require('../db/connection');
const logger = require('../utils/logger');
const telemetryService = require('../services/telemetryService');
const aiService = require('../services/aiService');
const alertService = require('../services/alertService');

const router = express.Router();

// Helper function to generate pump efficiency data (past 7 days + predictions)
async function getPumpEfficiencyData(pumpDeviceId, currentEfficiency) {
  try {
    const endTime = new Date();
    const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const history = await telemetryService.getTelemetryHistory(
      pumpDeviceId,
      startTime.toISOString(),
      endTime.toISOString(),
      100,
    );

    // Group by day and calculate average efficiency
    const dailyData = {};
    history.forEach((row) => {
      const date = new Date(row.timestamp).toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { values: [], count: 0 };
      }
      // Calculate efficiency from flow_rate and pressure
      const flow = Number(row.flow_rate) || 0;
      const pressure = Number(row.pressure) || 0;
      // Simple efficiency calculation (can be improved)
      const efficiency = flow > 0 && pressure > 0 
        ? Math.min(95, Math.max(60, 70 + (flow / 10) + (pressure * 5)))
        : currentEfficiency;
      dailyData[date].values.push(efficiency);
      dailyData[date].count++;
    });

    // Build past 7 days data
    const pumpData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayLabel = i === 0 ? 'Today' : `Day -${i}`;
      
      let actual = currentEfficiency;
      if (dailyData[dateStr] && dailyData[dateStr].count > 0) {
        const avg = dailyData[dateStr].values.reduce((a, b) => a + b, 0) / dailyData[dateStr].count;
        actual = Math.round(avg);
      }
      
      pumpData.push({ day: dayLabel, actual, predicted: null });
    }

    // Generate predictions for next 7 days (simple trend-based)
    const recentAvg = pumpData.slice(-3).reduce((sum, d) => sum + d.actual, 0) / 3;
    const trend = (pumpData[pumpData.length - 1].actual - pumpData[0].actual) / 6;
    
    for (let i = 1; i <= 7; i++) {
      const predicted = Math.max(60, Math.min(95, Math.round(recentAvg + (trend * i * 0.5))));
      pumpData.push({ day: `Day +${i}`, actual: null, predicted });
    }

    // Update "Today" to have both actual and predicted
    pumpData[6].predicted = pumpData[6].actual;

    return pumpData;
  } catch (error) {
    logger.error('Error generating pump efficiency data:', error);
    // Return default data
    const defaultData = [];
    for (let i = 6; i >= 0; i--) {
      defaultData.push({ day: i === 0 ? 'Today' : `Day -${i}`, actual: currentEfficiency, predicted: null });
    }
    for (let i = 1; i <= 7; i++) {
      defaultData.push({ day: `Day +${i}`, actual: null, predicted: currentEfficiency });
    }
    defaultData[6].predicted = currentEfficiency;
    return defaultData;
  }
}

// Helper function to generate leak probability over time
async function getLeakProbabilityData() {
  try {
    const endTime = new Date();
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
    
    const result = await db.query(
      `SELECT 
        DATE_TRUNC('hour', timestamp) as hour,
        AVG(CAST(pressure AS DECIMAL)) as avg_pressure,
        AVG(CAST(flow_rate AS DECIMAL)) as avg_flow,
        COUNT(*) as count
      FROM telemetry
      WHERE timestamp >= $1 AND timestamp <= $2
        AND (pressure IS NOT NULL OR flow_rate IS NOT NULL)
      GROUP BY DATE_TRUNC('hour', timestamp)
      ORDER BY hour`,
      [startTime.toISOString(), endTime.toISOString()]
    );

    const timeSlots = ['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'];
    const leakProbData = [];
    
    // Calculate leak probability based on pressure variations
    result.rows.forEach((row, idx) => {
      const hour = new Date(row.hour).getHours();
      let timeLabel = '';
      if (hour >= 6 && hour < 9) timeLabel = '6 AM';
      else if (hour >= 9 && hour < 12) timeLabel = '9 AM';
      else if (hour >= 12 && hour < 15) timeLabel = '12 PM';
      else if (hour >= 15 && hour < 18) timeLabel = '3 PM';
      else if (hour >= 18 && hour < 21) timeLabel = '6 PM';
      else if (hour >= 21) timeLabel = '9 PM';
      
      if (timeLabel && !leakProbData.find(d => d.time === timeLabel)) {
        const pressure = Number(row.avg_pressure) || 0;
        const flow = Number(row.avg_flow) || 0;
        // Higher probability during evening hours (6 PM, 9 PM)
        let baseProb = 15 + (hour % 12) * 3;
        if (pressure < 1.0) baseProb += 20;
        if (flow < 5) baseProb += 15;
        const prob = Math.min(100, Math.max(0, Math.round(baseProb)));
        leakProbData.push({ time: timeLabel, prob });
      }
    });

    // Fill missing time slots with default values
    timeSlots.forEach(slot => {
      if (!leakProbData.find(d => d.time === slot)) {
        const hour = slot.includes('6 PM') || slot.includes('9 PM') ? 45 : 20;
        leakProbData.push({ time: slot, prob: hour });
      }
    });

    return leakProbData.sort((a, b) => {
      const order = { '6 AM': 0, '9 AM': 1, '12 PM': 2, '3 PM': 3, '6 PM': 4, '9 PM': 5 };
      return order[a.time] - order[b.time];
    });
  } catch (error) {
    logger.error('Error generating leak probability data:', error);
    return [
      { time: '6 AM', prob: 12 },
      { time: '9 AM', prob: 18 },
      { time: '12 PM', prob: 24 },
      { time: '3 PM', prob: 31 },
      { time: '6 PM', prob: 46 },
      { time: '9 PM', prob: 52 },
    ];
  }
}

// Helper function to generate turbidity forecast
async function getTurbidityForecastData() {
  try {
    const endTime = new Date();
    const startTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // Past 3 days
    
    const result = await db.query(
      `SELECT 
        DATE(timestamp) as date,
        AVG(CAST(turbidity AS DECIMAL)) as avg_turbidity
      FROM telemetry
      WHERE timestamp >= $1 AND timestamp <= $2
        AND turbidity IS NOT NULL
      GROUP BY DATE(timestamp)
      ORDER BY date`,
      [startTime.toISOString(), endTime.toISOString()]
    );

    const turbidityData = [];
    const today = new Date();
    
    // Past 3 days
    for (let i = 3; i >= 1; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayLabel = i === 1 ? 'Today' : `Day -${i}`;
      
      const row = result.rows.find(r => r.date.toISOString().split('T')[0] === dateStr);
      const actual = row ? Number(Number(row.avg_turbidity).toFixed(1)) : 2.5 + Math.random() * 2;
      turbidityData.push({ date: dayLabel, actual, forecast: null });
    }

    // Forecast for next 4 days (simple trend-based)
    const recentValues = turbidityData.map(d => d.actual);
    const avg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    const trend = (recentValues[recentValues.length - 1] - recentValues[0]) / (recentValues.length - 1);
    
    for (let i = 1; i <= 4; i++) {
      const forecast = Math.max(0, Math.min(10, Number((avg + trend * i * 0.3).toFixed(1))));
      turbidityData.push({ date: `Day +${i}`, actual: null, forecast });
    }

    // Update "Today" to have both actual and forecast
    turbidityData[2].forecast = turbidityData[2].actual;

    return turbidityData;
  } catch (error) {
    logger.error('Error generating turbidity forecast:', error);
    return [
      { date: 'Day -3', actual: 2.1, forecast: null },
      { date: 'Day -2', actual: 2.8, forecast: null },
      { date: 'Day -1', actual: 3.4, forecast: null },
      { date: 'Today', actual: 3.9, forecast: 3.9 },
      { date: 'Day +1', actual: null, forecast: 4.6 },
      { date: 'Day +2', actual: null, forecast: 5.2 },
      { date: 'Day +3', actual: null, forecast: 5.6 },
      { date: 'Day +4', actual: null, forecast: 5.9 },
    ];
  }
}

// GET /api/ai/insights
// Aggregated AI + telemetry insights for dashboard
router.get('/insights', async (req, res) => {
  try {
    // 1) Base telemetry stats (pressure, flow, water quality, etc.)
    const stats = await telemetryService.getDashboardStats();

    // 2) Pick a recent pump device for predictive maintenance, if available
    let pumpMaintenance = null;
    let pumpDeviceId = null;
    try {
      const pumpResult = await db.query(
        `SELECT device_id
         FROM devices
         WHERE device_type = 'pump'
         ORDER BY last_seen DESC NULLS LAST
         LIMIT 1`,
      );

      if (pumpResult.rows.length > 0) {
        pumpDeviceId = pumpResult.rows[0].device_id;
        const endTime = new Date().toISOString();
        const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // last 7 days

        const history = await telemetryService.getTelemetryHistory(
          pumpDeviceId,
          startTime,
          endTime,
          200,
        );

        const historicalData = history.map((row) => ({
          timestamp: row.timestamp,
          flow_rate: Number(row.flow_rate) || 0,
          pressure: Number(row.pressure) || 0,
          turbidity: Number(row.turbidity) || 0,
          temperature: Number(row.temperature) || 0,
          pump_status: row.pump_status || 'off',
        }));

        if (historicalData.length >= 30) {
          pumpMaintenance = await aiService.predictMaintenance(
            pumpDeviceId,
            historicalData,
          );
        }
      }
    } catch (err) {
      logger.error('Error computing pump maintenance insights:', err);
    }

    // 3) Derive leak risk heuristics from stats ranges
    const pressureMin = stats.pressure_range?.min ?? null;
    const pressureMax = stats.pressure_range?.max ?? null;
    const flowMin = stats.flow_range?.min ?? null;
    const flowMax = stats.flow_range?.max ?? null;

    let leakPercent = 20;
    if (pressureMin !== null && pressureMax !== null) {
      const spread = Math.max(pressureMax - pressureMin, 0);
      if (spread > 1.5) leakPercent = 70;
      else if (spread > 0.8) leakPercent = 45;
      else leakPercent = 25;
    }

    const leakLevel =
      leakPercent >= 60 ? 'HIGH' : leakPercent >= 35 ? 'Medium' : 'LOW';

    const flowDiff =
      flowMin !== null && flowMax !== null
        ? Number(Math.max(flowMax - flowMin, 0).toFixed(2))
        : 0.8;

    // 4) Water quality risk from WQI
    const wqStatus = stats.water_quality?.status || 'good';
    const waterRisk =
      wqStatus === 'bad' ? 'HIGH' : wqStatus === 'average' ? 'MEDIUM' : 'LOW';

    const avgTurbidity = stats.avg_turbidity ?? 0;
    let turbidityForecast = 'Stable';
    if (avgTurbidity > 5) turbidityForecast = 'Elevated';
    else if (avgTurbidity > 3.5) turbidityForecast = 'Rising Tomorrow';

    // 5) Pressure condition
    const currentPressure = stats.avg_pressure ?? 1.4;
    let lowIncidents = 0;
    if (pressureMin !== null && pressureMin < 1.0) {
      lowIncidents = 2;
    }

    // 6) Pump efficiency (rough heuristic from maintenance prediction)
    let efficiency = 78;
    let daysUntilMaintenance = 12;
    if (pumpMaintenance && pumpMaintenance.days_until_maintenance != null) {
      daysUntilMaintenance = Math.round(
        pumpMaintenance.days_until_maintenance,
      );
      // Map days until maintenance to a pseudo-efficiency (more days = healthier)
      const clamped = Math.max(
        0,
        Math.min(daysUntilMaintenance, 30),
      );
      efficiency = Math.round(60 + (clamped / 30) * 35); // 60–95%
    }

    // 7) Generate graph data
    const pumpEfficiencyData = pumpDeviceId 
      ? await getPumpEfficiencyData(pumpDeviceId, efficiency)
      : [];
    const leakProbabilityData = await getLeakProbabilityData();
    const turbidityForecastData = await getTurbidityForecastData();

    // 8) Get AI alerts (recent alerts with AI-related patterns)
    let aiAlerts = [];
    try {
      const alerts = await alertService.getAlerts({ limit: 20, acknowledged: false });
      aiAlerts = alerts.slice(0, 4).map((alert, idx) => {
        let icon = '⚠️';
        let severity = 'medium';
        if (alert.alert_type === 'leak' || alert.alert_type === 'low_pressure') {
          icon = '⚠️';
          severity = 'high';
        } else if (alert.alert_type === 'contamination' || alert.alert_type === 'high_turbidity') {
          icon = '🟡';
          severity = 'medium';
        } else if (alert.alert_type === 'pump' || alert.device_type === 'pump') {
          icon = '🔧';
          severity = 'medium';
        } else if (alert.alert_type === 'pressure_anomaly') {
          icon = '🔻';
          severity = 'high';
        }

        let description = alert.message || `Alert detected for ${alert.device_id}`;
        if (alert.alert_type === 'leak') {
          description = `Flow difference increased by ${flowDiff.toFixed(1)} L/min`;
        } else if (alert.alert_type === 'pump' || alert.device_type === 'pump') {
          description = `Recommended maintenance in ${daysUntilMaintenance} days`;
        } else if (alert.alert_type === 'high_turbidity') {
          description = 'Possible upstream contamination';
        } else if (alert.alert_type === 'low_pressure' || alert.alert_type === 'pressure_anomaly') {
          description = `Probability of leak: ${leakPercent}%`;
        }

        return {
          id: alert.id || `alert-${idx}`,
          icon,
          title: alert.message || `Alert: ${alert.alert_type || 'anomaly'} detected`,
          description,
          severity: alert.severity || severity,
        };
      });
    } catch (err) {
      logger.error('Error fetching AI alerts:', err);
    }

    // 9) Generate AI recommendations
    const recommendations = [];
    if (leakPercent > 50) {
      recommendations.push({
        id: 1,
        text: `Inspect distribution lines – leak risk at ${leakPercent}%`,
        priority: 'High',
      });
    }
    if (pressureMin !== null && pressureMin < 1.0) {
      recommendations.push({
        id: 2,
        text: 'Check pressure in affected zones – low pressure detected',
        priority: 'High',
      });
    }
    if (daysUntilMaintenance > 0 && daysUntilMaintenance <= 15) {
      recommendations.push({
        id: 3,
        text: `Schedule pump service in ${daysUntilMaintenance} days`,
        priority: 'Medium',
      });
    }
    if (avgTurbidity > 3.5) {
      recommendations.push({
        id: 4,
        text: 'Check turbidity daily this week – rising trend detected',
        priority: 'Medium',
      });
    }
    if (efficiency < 75) {
      recommendations.push({
        id: 5,
        text: 'Reduce pump running time – efficiency below optimal',
        priority: 'Low',
      });
    }
    // Add default recommendations if none generated
    if (recommendations.length === 0) {
      recommendations.push({
        id: 1,
        text: 'Monitor system performance – all parameters within normal range',
        priority: 'Low',
      });
    }

    return res.json({
      leakRisk: {
        percent: leakPercent,
        level: leakLevel,
        flowDiff,
      },
      pumpHealth: {
        efficiency,
        daysUntilMaintenance,
      },
      waterQuality: {
        forecast: turbidityForecast,
        risk: waterRisk,
      },
      pressure: {
        current: Number(currentPressure.toFixed(2)),
        lowIncidents,
      },
      graphs: {
        pumpEfficiency: pumpEfficiencyData,
        leakProbability: leakProbabilityData,
        turbidityForecast: turbidityForecastData,
      },
      alerts: aiAlerts,
      recommendations: recommendations.slice(0, 5),
    });
  } catch (error) {
    logger.error('AI insights error:', error);
    res.status(500).json({ error: 'Failed to load AI insights' });
  }
});

module.exports = router;


