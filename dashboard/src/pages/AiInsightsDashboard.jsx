import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceArea,
} from 'recharts';
import axios from 'axios';
import './Analytics.css';

function SummaryCards({ insights }) {
  const cards = [
    {
      id: 'leak',
      title: 'Leak Risk',
      icon: '⚠️',
      primary: `${insights.leakRisk?.percent ?? 0}%`,
      subtitle: `Today • ${insights.leakRisk?.level || 'LOW'}`,
      details: [`Flow difference: ${insights.leakRisk?.flowDiff ?? 0} L/min`, 'Model: SVM + Anomaly Detection'],
    },
    {
      id: 'pump',
      title: 'Pump Health',
      icon: '🔧',
      primary: `${insights.pumpHealth?.efficiency ?? 0}%`,
      subtitle: `Maintenance in ${Math.round(
        insights.pumpHealth?.daysUntilMaintenance ?? 0,
      )} days`,
      details: ['Model: Random Forest'],
    },
    {
      id: 'quality',
      title: 'Water Quality',
      icon: '💧',
      primary: insights.waterQuality?.forecast || 'Stable',
      subtitle: `Risk: ${(insights.waterQuality?.risk || 'LOW').toUpperCase()}`,
      details: ['Model: Prophet Forecasting'],
    },
    {
      id: 'pressure',
      title: 'Pressure Condition',
      icon: '📈',
      primary: `${insights.pressure?.current?.toFixed
        ? insights.pressure.current.toFixed(2)
        : insights.pressure?.current ?? 0} bar`,
      subtitle: `Low-pressure incidents: ${insights.pressure?.lowIncidents ?? 0}`,
      details: ['Model: SVM'],
    },
  ];

  return (
    <div className="kpi-grid">
      {cards.map((card) => (
        <div key={card.id} className="kpi-card">
          <div className="kpi-header">
            <h3>{card.title}</h3>
            <div className="kpi-icon">{card.icon}</div>
          </div>
          <div className="kpi-value">{card.primary}</div>
          <div className="kpi-subtitle">{card.subtitle}</div>
          <div className="kpi-trend">
            {card.details.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GraphsSection({ aiStatus, insights }) {
  // Show zero data when AI service is offline
  const isOnline = aiStatus === 'online';
  
  // Use dynamic data from API, fallback to zeros if offline
  const pumpData = isOnline && insights?.graphs?.pumpEfficiency?.length > 0
    ? insights.graphs.pumpEfficiency
    : [
        { day: 'Day -6', actual: 0 },
        { day: 'Day -5', actual: 0 },
        { day: 'Day -4', actual: 0 },
        { day: 'Day -3', actual: 0 },
        { day: 'Day -2', actual: 0 },
        { day: 'Day -1', actual: 0 },
        { day: 'Today', actual: 0, predicted: 0 },
        { day: 'Day +1', predicted: 0 },
        { day: 'Day +2', predicted: 0 },
        { day: 'Day +3', predicted: 0 },
        { day: 'Day +4', predicted: 0 },
        { day: 'Day +5', predicted: 0 },
        { day: 'Day +6', predicted: 0 },
        { day: 'Day +7', predicted: 0 },
      ];

  const leakProbData = isOnline && insights?.graphs?.leakProbability?.length > 0
    ? insights.graphs.leakProbability
    : [
        { time: '6 AM', prob: 0 },
        { time: '9 AM', prob: 0 },
        { time: '12 PM', prob: 0 },
        { time: '3 PM', prob: 0 },
        { time: '6 PM', prob: 0 },
        { time: '9 PM', prob: 0 },
      ];

  const turbidityData = isOnline && insights?.graphs?.turbidityForecast?.length > 0
    ? insights.graphs.turbidityForecast
    : [
        { date: 'Day -3', actual: 0 },
        { date: 'Day -2', actual: 0 },
        { date: 'Day -1', actual: 0 },
        { date: 'Today', actual: 0, forecast: 0 },
        { date: 'Day +1', forecast: 0 },
        { date: 'Day +2', forecast: 0 },
        { date: 'Day +3', forecast: 0 },
        { date: 'Day +4', forecast: 0 },
      ];

  return (
    <div className="chart-section">
      <div className="chart-card card">
        <div className="card-header">
          <div>
            <h3>Pump Efficiency (Past 7 days &amp; Next 7 days)</h3>
            <p className="card-description">
              Model: Linear Regression / Random Forest
            </p>
          </div>
        </div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pumpData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                stroke="#475569"
                label={{ value: 'Days', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: '#94a3b8', fontSize: 12 } }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                stroke="#475569"
                domain={[60, 90]}
                tickFormatter={(v) => `${v}%`}
                label={{ value: 'Efficiency (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#94a3b8', fontSize: 12 } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15,23,42,0.95)',
                  border: '1px solid #334155',
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual Efficiency"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="predicted"
                name="Predicted Efficiency"
                stroke="#38bdf8"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card card">
        <div className="card-header">
          <div>
            <h3>Leak Probability Over Time</h3>
            <p className="card-description">Model: SVM / Logistic Regression</p>
          </div>
        </div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={leakProbData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                stroke="#475569"
                label={{ value: 'Time of Day', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: '#94a3b8', fontSize: 12 } }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                stroke="#475569"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                label={{ value: 'Probability (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#94a3b8', fontSize: 12 } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15,23,42,0.95)',
                  border: '1px solid #334155',
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="prob"
                name="Leak Probability"
                stroke="#f97316"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card card">
        <div className="card-header">
          <div>
            <h3>Turbidity Forecast (NTU)</h3>
            <p className="card-description">Model: Prophet Forecasting</p>
          </div>
        </div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={turbidityData}>
              <defs>
                <linearGradient id="turbidityArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="forecastArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                stroke="#475569"
                label={{ value: 'Days', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: '#94a3b8', fontSize: 12 } }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                stroke="#475569"
                domain={[0, 8]}
                label={{ value: 'Turbidity (NTU)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#94a3b8', fontSize: 12 } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15,23,42,0.95)',
                  border: '1px solid #334155',
                  borderRadius: 8,
                }}
              />
              <Legend />
              {/* Danger zone above 5 NTU */}
              <ReferenceArea
                y1={5}
                y2={8}
                strokeOpacity={0}
                fill="#ef4444"
                fillOpacity={0.08}
                label={{
                  value: 'Danger Zone (> 5 NTU)',
                  position: 'insideTopRight',
                  fill: '#f97316',
                  fontSize: 11,
                }}
              />
              <Area
                type="monotone"
                dataKey="actual"
                name="Actual Turbidity"
                stroke="#6366f1"
                fill="url(#turbidityArea)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
              />
              <Area
                type="monotone"
                dataKey="forecast"
                name="Forecast Turbidity"
                stroke="#22c55e"
                fill="url(#forecastArea)"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function AlertsSection({ aiStatus, insights }) {
  const isOnline = aiStatus === 'online';
  
  // Use dynamic alerts from API, empty array if offline
  const alerts = isOnline && insights?.alerts?.length > 0
    ? insights.alerts
    : [];

  const severityStyles = {
    high: 'alert-card-critical',
    medium: 'alert-card-warning',
    low: 'alert-card-info',
  };

  return (
    <div className="alerts-section">
      <h2 className="section-title">AI Alerts (Auto-detected Patterns)</h2>
      {alerts.length > 0 ? (
        <div className="alerts-list">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`alert-card ${severityStyles[alert.severity]}`}
            >
              <div className="alert-card-header">
                <div className="alert-main">
                  <div className="alert-icon">{alert.icon}</div>
                  <div className="alert-content">
                    <div className="alert-title-row">
                      <span className="badge badge-warning">
                        {alert.severity === 'high' ? 'HIGH' : 'MEDIUM'}
                      </span>
                      <span className="alert-type">AI Pattern</span>
                    </div>
                    <p className="alert-message">{alert.title}</p>
                    <div className="alert-meta">
                      <span className="alert-device">{alert.description}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">🤖</div>
          <h3>No AI Alerts Available</h3>
          <p>
            {aiStatus === 'offline'
              ? 'AI service is offline. Alerts will appear when the service is online.'
              : 'No alerts detected at this time.'}
          </p>
        </div>
      )}
    </div>
  );
}

function RecommendationsSection({ aiStatus, insights }) {
  const isOnline = aiStatus === 'online';
  
  // Use dynamic recommendations from API, empty array if offline
  const recommendations = isOnline && insights?.recommendations?.length > 0
    ? insights.recommendations
    : [];

  const priorityColor = {
    High: 'badge-danger',
    Medium: 'badge-warning',
    Low: 'badge-success',
  };

  return (
    <div className="card">
      <h2 className="section-title">AI Recommendations for Today</h2>
      {recommendations.length > 0 ? (
        <div className="filters-grid">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className="filter-group"
            >
              <span
                className={`badge ${priorityColor[rec.priority]}`}
              >
                {rec.priority} Priority
              </span>
              <span className="text-sm">{rec.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">💡</div>
          <h3>No Recommendations Available</h3>
          <p>
            {aiStatus === 'offline'
              ? 'AI service is offline. Recommendations will appear when the service is online.'
              : 'No recommendations at this time.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AiInsightsDashboard() {
  const [insights, setInsights] = useState({
    leakRisk: { percent: 0, level: 'LOW', flowDiff: 0 },
    pumpHealth: { efficiency: 0, daysUntilMaintenance: 0 },
    waterQuality: { forecast: 'Stable', risk: 'LOW' },
    pressure: { current: 0, lowIncidents: 0 },
    graphs: {
      pumpEfficiency: [],
      leakProbability: [],
      turbidityForecast: [],
    },
    alerts: [],
    recommendations: [],
  });
  // Simple string state for JS (no TS-style union)
  const [aiStatus, setAiStatus] = useState('unknown');
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0);

  // Reset insights when AI service goes offline
  useEffect(() => {
    if (aiStatus === 'offline') {
      setInsights({
        leakRisk: { percent: 0, level: 'LOW', flowDiff: 0 },
        pumpHealth: { efficiency: 0, daysUntilMaintenance: 0 },
        waterQuality: { forecast: 'Stable', risk: 'LOW' },
        pressure: { current: 0, lowIncidents: 0 },
        graphs: {
          pumpEfficiency: [],
          leakProbability: [],
          turbidityForecast: [],
        },
        alerts: [],
        recommendations: [],
      });
    }
  }, [aiStatus]);

  useEffect(() => {
    let isMounted = true;

    const resetInsights = () => {
      if (!isMounted) return;
      setInsights({
        leakRisk: { percent: 0, level: 'LOW', flowDiff: 0 },
        pumpHealth: { efficiency: 0, daysUntilMaintenance: 0 },
        waterQuality: { forecast: 'Stable', risk: 'LOW' },
        pressure: { current: 0, lowIncidents: 0 },
        graphs: {
          pumpEfficiency: [],
          leakProbability: [],
          turbidityForecast: [],
        },
        alerts: [],
        recommendations: [],
      });
    };

    const fetchInsights = async () => {
      try {
        const res = await axios.get('/api/ai/insights');
        if (!isMounted) return;
        setInsights(res.data || {
          leakRisk: { percent: 0, level: 'LOW', flowDiff: 0 },
          pumpHealth: { efficiency: 0, daysUntilMaintenance: 0 },
          waterQuality: { forecast: 'Stable', risk: 'LOW' },
          pressure: { current: 0, lowIncidents: 0 },
          graphs: {
            pumpEfficiency: [],
            leakProbability: [],
            turbidityForecast: [],
          },
          alerts: [],
          recommendations: [],
        });
        // Reset last sync timer on successful fetch
        if (isMounted) {
          setLastSyncSeconds(0);
        }
      } catch {
        // Reset to zeros on error
        if (!isMounted) return;
        resetInsights();
      }
    };

    const checkAiService = async () => {
      try {
        const base =
          import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:5000';
        const res = await fetch(`${base}/health`);
        if (!isMounted) return;
        const newStatus = res.ok ? 'online' : 'offline';
        setAiStatus(newStatus);
        return newStatus;
      } catch {
        if (!isMounted) return 'offline';
        setAiStatus('offline');
        return 'offline';
      }
    };

    // Check AI service first, then fetch insights only if online
    const initialize = async () => {
      const status = await checkAiService();
      if (status === 'online' && isMounted) {
        await fetchInsights();
      }
    };

    initialize();

    // Poll every 30 seconds for automatic updates
    const fetchInterval = setInterval(async () => {
      const status = await checkAiService();
      if (status === 'online' && isMounted) {
        await fetchInsights();
      }
    }, 30000); // 30 seconds

    // Update last sync timer every second
    const timerInterval = setInterval(() => {
      if (isMounted) {
        setLastSyncSeconds((prev) => prev + 1);
      }
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(fetchInterval);
      clearInterval(timerInterval);
    };
  }, []);

  return (
    <div className="analytics-page">
      <div className="page-header">
        <div>
          <h1>AI Insights &amp; Predictive Maintenance</h1>
          <p className="page-subtitle">
            Live AI-powered insights for leaks, pumps, water quality and pressure
          </p>
        </div>
        <div className="status-bar" style={{marginLeft:'720px'}}>
          <div className="status-indicator-wrapper">
            <div 
              className={`led-indicator ${
                aiStatus === 'online' ? 'led-green' : ''
              }`}
            ></div>
            <span className="status-text">
              AI Service:{' '}
              {aiStatus === 'online'
                ? 'Online'
                : aiStatus === 'offline'
                ? 'Offline'
                : 'Checking...'}
            </span>
            <span className="status-text" style={{ marginLeft: '20px' }}>
              Last sync: {lastSyncSeconds} sec ago
            </span>
          </div>
        </div>
      </div>

      <SummaryCards insights={insights} />
      <GraphsSection aiStatus={aiStatus} insights={insights} />
      <AlertsSection aiStatus={aiStatus} insights={insights} />
      <RecommendationsSection aiStatus={aiStatus} insights={insights} />
    </div>
  );
}


