import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import * as XLSX from 'xlsx'
import './Dashboard.css'
import useNearestVillage from '../hooks/useNearestVillage'
import { LocationGate } from '../components/LocationGate'

export default function Dashboard() {
  const [liveData, setLiveData] = useState([])
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const [stats, setStats] = useState({
    totalDevices: 0,
    activeAlerts: 0,
    openTickets: 0,
    avgPressure: 0,
    avgFlow: 0,
    avgPH: null,
    waterQuality: null
  })
  const [loading, setLoading] = useState(true)
  const [reportPeriod, setReportPeriod] = useState('daily')
  const [reportData, setReportData] = useState([])
  const [reportGeneratedAt, setReportGeneratedAt] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)

  const {
    locationStatus,
    locationError,
    requestLocation,
    nearestVillage,
    villageLoading,
    villageError,
    retryVillageLookup,
  } = useNearestVillage()

  useEffect(() => {
    if (locationStatus !== 'granted' || !nearestVillage) return

    fetchData()
    const fetchInterval = setInterval(() => {
      fetchData()
    }, 5000)

    const timerInterval = setInterval(() => {
      setLastSyncSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      clearInterval(fetchInterval)
      clearInterval(timerInterval)
    }
  }, [locationStatus, nearestVillage])

  const fetchData = async () => {
    if (!nearestVillage) return
    try {
      const villageIdParam = `village_id=${encodeURIComponent(nearestVillage.id)}`
      const [telemetryRes, dynamicStatsRes, alertsRes, ticketsRes, devicesRes, statsRes] = await Promise.allSettled([
        axios.get(`/api/telemetry/live?${villageIdParam}`).catch(err => ({ data: [] })),
        axios.get('/api/dynamic-stats/alerts-tickets').catch(err => ({ data: { activeAlerts: 0, openTickets: 0 } })),
        axios.get(`/api/alerts?acknowledged=false&${villageIdParam}`).catch(err => ({ data: [] })),
        axios.get(`/api/tickets?status=open&${villageIdParam}`).catch(err => ({ data: [] })),
        axios.get('/api/device').catch(err => ({ data: [] })),
        axios.get('/api/telemetry/stats/summary').catch(() => ({ data: null }))
      ])

      const telemetry = telemetryRes.status === 'fulfilled' ? telemetryRes.value.data : []
      const dynamicStats = dynamicStatsRes.status === 'fulfilled' ? dynamicStatsRes.value.data : { activeAlerts: 0, openTickets: 0 }
      const alerts = alertsRes.status === 'fulfilled' ? alertsRes.value.data : []
      const tickets = ticketsRes.status === 'fulfilled' ? ticketsRes.value.data : []
      const devices = devicesRes.status === 'fulfilled' ? devicesRes.value.data : []
      const stats = statsRes.status === 'fulfilled' ? statsRes.value.data : null

      // Get the most recent 20 readings, sorted by timestamp (newest first, then reverse for chart)
      const recentReadings = telemetry
        .slice(0, 20)
        .sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime()
          const timeB = new Date(b.timestamp).getTime()
          return timeB - timeA // Newest first
        })
        .reverse() // Reverse to show oldest to newest on chart
        .map(reading => {
          const timestamp = new Date(reading.timestamp)
          return {
            ...reading,
            timestamp: timestamp.toISOString(),
            timestampFormatted: timestamp.toLocaleString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              hour: '2-digit', 
              minute: '2-digit',
              second: '2-digit'
            }),
            pressure: reading.pressure != null ? (typeof reading.pressure === 'string' ? parseFloat(reading.pressure) : reading.pressure) : null,
            flow_rate: reading.flow_rate != null ? (typeof reading.flow_rate === 'string' ? parseFloat(reading.flow_rate) : reading.flow_rate) : null,
            temperature: reading.temperature != null ? (typeof reading.temperature === 'string' ? parseFloat(reading.temperature) : reading.temperature) : null,
            turbidity: reading.turbidity != null ? (typeof reading.turbidity === 'string' ? parseFloat(reading.turbidity) : reading.turbidity) : null,
          }
        })
      setLiveData(recentReadings)

      let avgPressure, avgFlow, avgPH
      if (stats && stats.avg_pressure !== null && stats.avg_pressure !== undefined) {
        avgPressure = typeof stats.avg_pressure === 'number' 
          ? stats.avg_pressure.toFixed(2) 
          : (parseFloat(stats.avg_pressure) || 0).toFixed(2)
        avgFlow = typeof stats.avg_flow === 'number' 
          ? stats.avg_flow.toFixed(2) 
          : (parseFloat(stats.avg_flow) || 0).toFixed(2)
        avgPH = stats.avg_ph !== null && stats.avg_ph !== undefined
          ? (typeof stats.avg_ph === 'number' ? stats.avg_ph.toFixed(2) : parseFloat(stats.avg_ph).toFixed(2))
          : null
      } else {
        const pressures = telemetry.filter(t => t.pressure != null && t.pressure !== '').map(t => {
          const val = typeof t.pressure === 'string' ? parseFloat(t.pressure) : t.pressure
          return isNaN(val) ? 0 : val
        }).filter(v => v > 0)
        const flows = telemetry.filter(t => t.flow_rate != null && t.flow_rate !== '').map(t => {
          const val = typeof t.flow_rate === 'string' ? parseFloat(t.flow_rate) : t.flow_rate
          return isNaN(val) ? 0 : val
        }).filter(v => v > 0)
        const phValues = telemetry.filter(t => (t.ph != null && t.ph !== '') || (t.metadata?.ph != null && t.metadata?.ph !== '')).map(t => {
          const val = parseFloat(t.ph || t.metadata?.ph || 0)
          return isNaN(val) ? null : val
        }).filter(v => v != null)

        avgPressure = pressures.length > 0 ? (pressures.reduce((a, b) => a + b, 0) / pressures.length).toFixed(2) : '0'
        avgFlow = flows.length > 0 ? (flows.reduce((a, b) => a + b, 0) / flows.length).toFixed(2) : '0'
        avgPH = phValues.length > 0 ? (phValues.reduce((a, b) => a + b, 0) / phValues.length).toFixed(2) : null
      }

      let waterQuality = null
      if (stats && stats.water_quality) {
        waterQuality = stats.water_quality
      } else {
        const latestWithQuality = telemetry.find((reading) => reading.metadata?.water_quality)
        if (latestWithQuality) {
          waterQuality = latestWithQuality.metadata.water_quality
        }
      }

      // Use dynamic counts from telemetry data instead of static database records
      // This ensures the counts reflect current conditions in the dataset
      setStats({
        totalDevices: devices.filter((device) => device.village_id === nearestVillage.id).length,
        // Use only the per-village data we just fetched, to match what the user sees
        activeAlerts: alerts.length,
        openTickets: tickets.length,
        avgPressure: avgPressure,
        avgFlow: avgFlow,
        avgPH: avgPH,
        waterQuality: waterQuality
      })
      // Reset "Last Sync" timer on successful refresh
      setLastSyncSeconds(0)
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const resolveNearestVillage = async (lat, lng) => {
    try {
      setVillageLoading(true)
      setVillageError(null)
      const response = await axios.get('/api/gis/villages')
      const villages = response.data || []
      if (!villages.length) {
        setVillageError('No villages available to match location.')
        return
      }
      let closest = null
      let bestDistance = Infinity
      villages.forEach((village) => {
        if (village.gps_lat == null || village.gps_lon == null) return
        const distance = getDistanceMeters(
          lat,
          lng,
          parseFloat(village.gps_lat),
          parseFloat(village.gps_lon)
        )
        if (distance < bestDistance) {
          bestDistance = distance
          closest = village
        }
      })
      if (!closest) {
        setVillageError('Unable to determine the nearest village for your location.')
        return
      }
      setNearestVillage(closest)
    } catch (error) {
      console.error('Failed to resolve nearest village:', error)
      setVillageError('Failed to fetch villages. Please try again.')
    } finally {
      setVillageLoading(false)
    }
  }

  const handleGenerateReport = async () => {
    try {
      setReportLoading(true)
      const response = await axios.get(`/api/reports/telemetry?period=${reportPeriod}`)
      const rows = response.data.rows || []
      setReportData(rows)
      setReportGeneratedAt(response.data.generated_at)
      
      if (rows.length === 0) {
        toast.warn('No data found for the selected period.')
      } else {
        toast.success(`Report generated successfully with ${rows.length} rows`)
      }
    } catch (error) {
      console.error('Failed to generate report:', error)
      toast.error(`Failed to generate report: ${error.response?.data?.message || error.message}`)
    } finally {
      setReportLoading(false)
    }
  }

  const handleDownloadReport = () => {
    if (!reportData.length) {
      toast.warn('Please generate a report first')
      return
    }

    try {
    const worksheetData = reportData.map((row) => ({
        'Period Start': row.period_start ? new Date(row.period_start).toLocaleString() : 'N/A',
        'Device ID': row.device_id || 'N/A',
        'Avg Flow (L/min)': row.avg_flow || '0.00',
        'Avg Pressure (bar)': row.avg_pressure || '0.00',
        'Avg Turbidity (NTU)': row.avg_turbidity || '0.00',
        'Avg Temperature (°C)': row.avg_temperature || '0.00',
        'Max Battery (%)': row.max_battery != null ? row.max_battery : 'N/A',
        'Min Battery (%)': row.min_battery != null ? row.min_battery : 'N/A',
        'Samples': row.samples || 0
    }))

    const worksheet = XLSX.utils.json_to_sheet(worksheetData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Telemetry Report')
      
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
      const filename = `jalrakshak-${reportPeriod}-report-${timestamp}.xlsx`
      
    XLSX.writeFile(workbook, filename)
      toast.success(`Report downloaded as ${filename}`)
    } catch (error) {
      console.error('Failed to download report:', error)
      toast.error('Failed to download report. Please try again.')
    }
  }

  const formatNumber = (value, decimals = 2) => {
    if (value === null || value === undefined || value === '') return 'N/A'
    const num = typeof value === 'string' ? parseFloat(value) : value
    return isNaN(num) ? 'N/A' : num.toFixed(decimals)
  }

  if (locationStatus !== 'granted' || !nearestVillage) {
    return (
      <div className="dashboard">
        <LocationGate
          locationStatus={locationStatus}
          locationError={locationError}
          requestLocation={requestLocation}
          villageLoading={villageLoading}
          villageError={villageError}
          retryVillageLookup={retryVillageLookup}
        />
      </div>
    )
  }

  if (loading) {
    return <div className="loading">Loading dashboard...</div>
  }

  // Generate sparkline data (last 10 points)
  const sparklineData = liveData.slice(-10).map(d => ({
    value: d.pressure || 0
  }))

  return (
    <div className="dashboard">
      {/* Live Status Bar */}
      <div className="status-bar">
        <div className="status-indicator-wrapper">
          <div className="led-indicator led-green"></div>
          <span className="status-text">Last Sync: {lastSyncSeconds} sec ago</span>
        </div>
      </div>

      {/* Page Header */}
      <div className="page-header">
        <h1>Dashboard {nearestVillage ? `• ${nearestVillage.name}` : ''}</h1>
        <p className="page-subtitle">
          {nearestVillage
            ? `Real-time monitoring for ${nearestVillage.name}`
            : 'Real-time water monitoring and analytics'}
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
          <h3>Total Devices</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)' }}>
              📡
            </div>
          </div>
          <div className="kpi-value">{stats.totalDevices}</div>
          <div className="kpi-sparkline">
            <ResponsiveContainer width="100%" height={30}>
              <LineChart data={sparklineData}>
                <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="kpi-card kpi-alert">
          <div className="kpi-header">
          <h3>Active Alerts</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)' }}>
              🚨
            </div>
          </div>
          <div className="kpi-value">{stats.activeAlerts}</div>
          <div className="kpi-trend">Requires attention</div>
        </div>

        <div className="kpi-card kpi-warning">
          <div className="kpi-header">
          <h3>Open Tickets</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #facc15 0%, #fbbf24 100%)' }}>
              🎫
            </div>
          </div>
          <div className="kpi-value">{stats.openTickets}</div>
          <div className="kpi-trend">In progress</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
          <h3>Avg Pressure</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)' }}>
              💧
            </div>
          </div>
          <div className="kpi-value">{stats.avgPressure} <span className="kpi-unit">bar</span></div>
          <div className="kpi-sparkline">
            <ResponsiveContainer width="100%" height={30}>
              <LineChart data={liveData.slice(-10).map(d => ({ value: parseFloat(d.pressure) || 0 }))}>
                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
          <h3>Avg Flow Rate</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)' }}>
              🌊
            </div>
          </div>
          <div className="kpi-value">{stats.avgFlow} <span className="kpi-unit">L/min</span></div>
          <div className="kpi-sparkline">
            <ResponsiveContainer width="100%" height={30}>
              <LineChart data={liveData.slice(-10).map(d => ({ value: parseFloat(d.flow_rate) || 0 }))}>
                <Line type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
          <h3>Avg pH</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)' }}>
              🧪
            </div>
          </div>
          <div className="kpi-value">{stats.avgPH || 'N/A'}</div>
          <div className="kpi-trend">Optimal range: 6.5-8.5</div>
        </div>

        <div className={`kpi-card kpi-water-quality ${stats.waterQuality ? `kpi-${stats.waterQuality.status}` : ''}`}>
          <div className="kpi-header">
          <h3>Water Quality</h3>
            <div className="kpi-icon" style={{ 
              background: stats.waterQuality?.status === 'good' 
                ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
                : stats.waterQuality?.status === 'average'
                ? 'linear-gradient(135deg, #facc15 0%, #fbbf24 100%)'
                : 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)'
            }}>
              {stats.waterQuality?.indicator || '❓'}
            </div>
          </div>
          {stats.waterQuality ? (
            <>
              <div className="kpi-value">
                {stats.waterQuality.indicator} {stats.waterQuality.status.toUpperCase()}
              </div>
              <div className="kpi-subtitle">
                WQI: {stats.waterQuality.wqi} • {stats.waterQuality.message}
              </div>
            </>
          ) : (
            <div className="kpi-value">No data</div>
          )}
        </div>
      </div>

      {/* Real-time Chart */}
      <div className="chart-section">
        <div className="card chart-card">
          <div className="card-header">
            <h3>Real-time Sensor Data</h3>
            <span className="card-badge">Last 20 readings</span>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={liveData} margin={{ top: 8, right: 8, left: 8, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="timestampFormatted" 
                tick={{ fontSize: 11, fill: '#64748b', angle: -45, textAnchor: 'end' }}
                stroke="#cbd5e1"
                height={60}
                label={{
                  value: 'Timestamp (latest readings to the right)',
                  position: 'insideBottomRight',
                  offset: -12,
                  fill: '#94a3b8',
                  fontSize: 12
                }}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: '#64748b' }}
                stroke="#cbd5e1"
                label={{
                  value: 'Pressure (bar) / Flow (L/min)',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#94a3b8',
                  fontSize: 12
                }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value, name) => {
                  if (name === 'Pressure (bar)') {
                    return [typeof value === 'number' ? value.toFixed(2) : value, name]
                  } else if (name === 'Flow (L/min)') {
                    return [typeof value === 'number' ? value.toFixed(2) : value, name]
                  }
                  return [value, name]
                }}
                labelFormatter={(label) => {
                  try {
                    const date = new Date(label)
                    return date.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })
                  } catch {
                    return label
                  }
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="pressure" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="Pressure (bar)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="flow_rate" 
                stroke="#06b6d4" 
                strokeWidth={2}
                name="Flow (L/min)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="axis-units">
            X-axis: Timestamp of each telemetry sample • Y-axis: Sensor values (Pressure in bar, Flow in L/min)
          </p>
        </div>
      </div>

      {/* Reports Section */}
      <div className="card report-section">
        <div className="card-header">
          <div>
            <h3>Generate Reports</h3>
            <p className="card-description">Download summarized telemetry data for analysis</p>
          </div>
          <div className="report-actions">
            <select value={reportPeriod} onChange={(e) => setReportPeriod(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <button className="btn btn-primary" onClick={handleGenerateReport} disabled={reportLoading}>
              {reportLoading ? 'Generating...' : 'Generate Report'}
            </button>
            <button className="btn btn-success" onClick={handleDownloadReport} disabled={!reportData.length}>
              Download Excel
            </button>
          </div>
        </div>
        {reportGeneratedAt && (
          <p className="report-meta">
            Generated at: {new Date(reportGeneratedAt).toLocaleString()} • Rows: {reportData.length}
          </p>
        )}
        {reportData.length > 0 && (
          <div className="report-table-wrapper">
            <table className="table report-table">
              <thead>
                <tr>
                  <th>Period Start</th>
                  <th>Device ID</th>
                  <th>Avg Flow</th>
                  <th>Avg Pressure</th>
                  <th>Avg Turbidity</th>
                  <th>Avg Temperature</th>
                  <th>Max Battery</th>
                  <th>Min Battery</th>
                  <th>Samples</th>
                </tr>
              </thead>
              <tbody>
                {reportData.slice(0, 50).map((row, idx) => (
                  <tr key={`${row.device_id}-${row.period_start}-${idx}`}>
                    <td>{new Date(row.period_start).toLocaleString()}</td>
                    <td>{row.device_id}</td>
                    <td>{row.avg_flow}</td>
                    <td>{row.avg_pressure}</td>
                    <td>{row.avg_turbidity}</td>
                    <td>{row.avg_temperature}</td>
                    <td>{row.max_battery ?? 'N/A'}</td>
                    <td>{row.min_battery ?? 'N/A'}</td>
                    <td>{row.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reportData.length > 50 && (
              <p className="report-meta">Showing first 50 rows. Download Excel for full data.</p>
            )}
          </div>
        )}
      </div>

      {/* Sensor Readings Table */}
      <div className="card table-card">
        <div className="card-header">
          <h3>Complete Sensor Readings</h3>
          <span className="card-badge">{liveData.length} records</span>
        </div>
          <div className="table-wrapper">
            <table className="table comprehensive-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Device ID</th>
                  <th>Village</th>
                <th>Pressure</th>
                <th>Flow</th>
                  <th>pH</th>
                <th>Turbidity</th>
                <th>Temperature</th>
                <th>Battery</th>
                </tr>
              </thead>
              <tbody>
                {liveData.slice(0, 20).map((reading) => {
                const meta = reading.metadata || {}
                const deviceVillage = reading.village_name || (reading.village_id ? `Village ${reading.village_id}` : 'N/A')
                  
                  return (
                    <tr key={reading.id}>
                      <td>{new Date(reading.timestamp).toLocaleString()}</td>
                      <td>{reading.device_id}</td>
                      <td>{deviceVillage}</td>
                    <td>{formatNumber(reading.pressure, 3)} bar</td>
                    <td>{formatNumber(reading.flow_rate, 2)} L/min</td>
                    <td>{formatNumber(reading.ph || meta.ph, 3)}</td>
                    <td>{formatNumber(reading.turbidity, 2)} NTU</td>
                    <td>{formatNumber(reading.temperature, 2)}°C</td>
                    <td>{formatNumber(reading.battery_level, 0)}%</td>
                    </tr>
                )
                })}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  )
}
