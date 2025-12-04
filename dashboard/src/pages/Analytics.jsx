import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart } from 'recharts'
import './Analytics.css'
import useNearestVillage from '../hooks/useNearestVillage'
import { LocationGate } from '../components/LocationGate'

export default function Analytics() {
  const [metric, setMetric] = useState('pressure_flow')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [villages, setVillages] = useState([])
  const [kpis, setKpis] = useState({
    highestTurbidity: 0,
    lowestPressure: 0,
    avgFlow24h: 0
  })
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    village: ''
  })

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
    if (nearestVillage && !filters.village) {
      setFilters((prev) => ({ ...prev, village: nearestVillage.id }))
    }
  }, [nearestVillage])

  useEffect(() => {
    if (locationStatus !== 'granted' || !nearestVillage) return
    fetchVillages()
    // Clear data when filters change to show loading state
    setData([])
    fetchAnalytics()
    fetchKPIs()
    const interval = setInterval(() => {
      fetchVillages()
      fetchAnalytics()
      fetchKPIs()
    }, 10000)
    return () => clearInterval(interval)
  }, [metric, filters, locationStatus, nearestVillage])

  const fetchVillages = async () => {
    try {
      const response = await axios.get('/api/gis/villages')
      setVillages(response.data)
    } catch (error) {
      console.error('Failed to load villages:', error)
    }
  }

  const parseNumber = (value) => {
    if (value === null || value === undefined || value === '') return null
    const num = typeof value === 'string' ? parseFloat(value) : value
    return isNaN(num) ? null : num
  }

  const fetchKPIs = async () => {
    if (locationStatus !== 'granted' || !nearestVillage) return
    try {
      const response = await axios.get('/api/telemetry/stats/summary', {
        params: { village_id: nearestVillage.id },
      })
      if (response.data) {
        setKpis({
          highestTurbidity: parseNumber(response.data.avg_turbidity) || 0,
          lowestPressure: parseNumber(response.data.avg_pressure) || 0,
          avgFlow24h: parseNumber(response.data.avg_flow) || 0
        })
      }
    } catch (error) {
      console.error('Failed to load KPIs:', error)
    }
  }

  const fetchAnalytics = async () => {
    if (locationStatus !== 'granted' || !nearestVillage) return
    try {
      setLoading(true)
      
      // For pressure/flow and water quality, use the same live telemetry data
      // pipeline as the main dashboard so values match exactly.
      let sourceData = []
      if (metric === 'pressure_flow' || metric === 'water_quality') {
        const liveRes = await axios.get('/api/telemetry/live', {
          params: {
            village_id: filters.village || nearestVillage.id
          }
        })
        const live = Array.isArray(liveRes.data) ? liveRes.data : []
        // Sort newest → oldest then reverse to oldest → newest
        const sorted = [...live]
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
          .slice(-100) // last 100 points max for readability

        sourceData = sorted.map((row) => {
          const ts = new Date(row.timestamp)
          const base = {
            date: ts.toLocaleString('en-US', {
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }),
            dateSort: ts.getTime(),
          }
          if (metric === 'pressure_flow') {
            return {
              ...base,
              avg_pressure: parseNumber(row.pressure) || 0,
              avg_flow_rate: parseNumber(row.flow_rate) || 0,
            }
          }
          // water_quality
          return {
            ...base,
            avg_turbidity: parseNumber(row.turbidity) || 0,
            avg_temperature: parseNumber(row.temperature) || 0,
          }
        })
      } else {
        // Historical analytics for leakage_trends and pump_performance
        const startDate = filters.startDate ? new Date(filters.startDate).toISOString() : undefined
        const endDate = filters.endDate ? new Date(filters.endDate).toISOString() : undefined
        
        console.log('Fetching analytics with params:', { metric, startDate, endDate, village: filters.village })
        
        const response = await axios.get('/api/analytics', {
          params: { 
            metric, 
            start_date: startDate,
            end_date: endDate,
            village_id: filters.village || nearestVillage.id
          }
        })
        
        console.log('Analytics response:', response.data)
        console.log('Data points received:', response.data?.length || 0)
        
        // For leakage_trends, log the data structure
        if (metric === 'leakage_trends') {
          console.log('Leakage trends data:', response.data)
          response.data?.forEach((item, idx) => {
            console.log(`  Point ${idx + 1}:`, { date: item.date, leak_count: item.leak_count, avg_confidence: item.avg_confidence })
          })
        }

        sourceData = response.data || []
      }
      
      let formattedData = sourceData.map(item => {
        const formatted = { ...item }
        if (formatted.leak_count !== undefined) formatted.leak_count = parseNumber(formatted.leak_count) || 0
        if (formatted.avg_confidence !== undefined) formatted.avg_confidence = parseNumber(formatted.avg_confidence) || 0
        if (formatted.avg_turbidity !== undefined) formatted.avg_turbidity = parseNumber(formatted.avg_turbidity) || 0
        if (formatted.avg_temperature !== undefined) formatted.avg_temperature = parseNumber(formatted.avg_temperature) || 0
        if (formatted.avg_pressure !== undefined) formatted.avg_pressure = parseNumber(formatted.avg_pressure) || 0
        if (formatted.avg_flow_rate !== undefined) formatted.avg_flow_rate = parseNumber(formatted.avg_flow_rate) || 0
        if (formatted.on_count !== undefined) formatted.on_count = parseNumber(formatted.on_count) || 0
        if (formatted.off_count !== undefined) formatted.off_count = parseNumber(formatted.off_count) || 0
        if (formatted.fault_count !== undefined) formatted.fault_count = parseNumber(formatted.fault_count) || 0
        
        // Keep date in a format that's both sortable and displayable
        if (formatted.date) {
          // Handle different date formats
          let dateObj;
          if (formatted.date instanceof Date) {
            dateObj = formatted.date;
          } else if (typeof formatted.date === 'string') {
            // Try parsing the date string
            dateObj = new Date(formatted.date);
            // If invalid, try parsing as date string without time
            if (isNaN(dateObj.getTime())) {
              // Try YYYY-MM-DD format
              const parts = formatted.date.split('-');
              if (parts.length === 3) {
                dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
              } else {
                // Try MM/DD/YYYY format
                const parts2 = formatted.date.split('/');
                if (parts2.length === 3) {
                  dateObj = new Date(parseInt(parts2[2]), parseInt(parts2[0]) - 1, parseInt(parts2[1]));
                }
              }
            }
          } else {
            dateObj = new Date(formatted.date);
          }
          
          if (!isNaN(dateObj.getTime())) {
            // Format as MM/DD/YYYY for display
            formatted.date = dateObj.toLocaleDateString('en-US', { 
              month: '2-digit', 
              day: '2-digit', 
              year: 'numeric' 
            });
            formatted.dateSort = dateObj.getTime(); // For sorting
          } else {
            // Keep original if can't parse
            formatted.dateSort = new Date().getTime();
          }
        }
        return formatted
      })
      
      // Sort data in ascending order (oldest to newest) for proper chart display
      formattedData.sort((a, b) => {
        if (a.dateSort && b.dateSort) {
          return a.dateSort - b.dateSort
        }
        if (a.date && b.date) {
          return new Date(a.date) - new Date(b.date)
        }
        return 0
      })
      
      // Remove the temporary sort key
      formattedData = formattedData.map(item => {
        const { dateSort, ...rest } = item
        return rest
      })
      
      console.log('Final formatted data for chart:', formattedData)
      console.log('Data length:', formattedData.length)
      
      // For leakage_trends, ensure we have valid data points
      if (metric === 'leakage_trends' && formattedData.length > 0) {
        console.log('Leakage trends final data:', formattedData.map(d => ({
          date: d.date,
          leak_count: d.leak_count,
          avg_confidence: d.avg_confidence
        })))
      }
      
      setData(formattedData)
    } catch (error) {
      console.error('Failed to load analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const getMetricTitle = () => {
    switch (metric) {
      case 'pressure_flow': return 'Pressure-Flow Correlation'
      case 'water_quality': return 'Water Quality Trends'
      case 'leakage_trends': return 'Leakage Detection Trends'
      case 'pump_performance': return 'Pump Performance'
      default: return 'Analytics'
    }
  }

  if (locationStatus !== 'granted' || !nearestVillage) {
    return (
      <div className="analytics-page">
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

  if (loading && data.length === 0) {
    return <div className="loading">Loading analytics...</div>
  }

  return (
    <div className="analytics-page">
      <div className="page-header">
        <div>
          <h1>Analytics {nearestVillage ? `• ${nearestVillage.name}` : ''}</h1>
          <p className="page-subtitle">
            {nearestVillage
              ? `Insights for ${nearestVillage.name}`
              : 'Comprehensive insights and data visualization'}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <h3>Highest Turbidity Today</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)' }}>
              🌊
            </div>
          </div>
          <div className="kpi-value">{kpis.highestTurbidity.toFixed(2)} <span className="kpi-unit">NTU</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <h3>Lowest Pressure Today</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)' }}>
              💧
            </div>
          </div>
          <div className="kpi-value">{kpis.lowestPressure.toFixed(2)} <span className="kpi-unit">bar</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header">
            <h3>Avg Flow (24h)</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)' }}>
              📊
            </div>
          </div>
          <div className="kpi-value">{kpis.avgFlow24h.toFixed(2)} <span className="kpi-unit">L/min</span></div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-card card">
        <div className="filters-grid">
          <div className="filter-group">
            <label>Metric</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="pressure_flow">Pressure-Flow Correlation</option>
              <option value="water_quality">Water Quality</option>
              <option value="leakage_trends">Leakage Trends</option>
              <option value="pump_performance">Pump Performance</option>
            </select>
          </div>
          {/* <div className="filter-group">
            <label>Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
          </div>
          <div className="filter-group">
            <label>End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </div> */}
          <div className="filter-group">
            <label>Village</label>
            <select
              value={filters.village}
              onChange={(e) => setFilters({ ...filters, village: e.target.value })}
            >
              <option value="">All Villages</option>
              {villages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="chart-card card">
        <div className="card-header">
          <h3>{getMetricTitle()}</h3>
          <span className="card-badge">{data.length} data points</span>
        </div>
        {data.length === 0 ? (
          <div className="empty-chart">
            <div className="empty-icon">📈</div>
            <p>No data available for the selected metric and time range.</p>
            <p className="empty-hint">Try selecting a different time range or check if data exists.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={450} key={`${metric}-${filters.village}-${filters.startDate}-${filters.endDate}`}>
            {metric === 'pump_performance' ? (
              <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="device_id" 
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  stroke="#cbd5e1"
                />
                <YAxis 
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  stroke="#cbd5e1"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Legend />
                <Bar dataKey="on_count" fill="#10b981" name="ON" radius={[8, 8, 0, 0]} />
                <Bar dataKey="off_count" fill="#94a3b8" name="OFF" radius={[8, 8, 0, 0]} />
                <Bar dataKey="fault_count" fill="#ef4444" name="FAULT" radius={[8, 8, 0, 0]} />
              </BarChart>
            ) : metric === 'leakage_trends' ? (
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="leakageGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="date" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  stroke="#cbd5e1"
                />
                <YAxis 
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  stroke="#cbd5e1"
                  label={{ value: 'Leak Count', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b' } }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12, fill: '#facc15' }}
                  stroke="#facc15"
                  label={{ value: 'Confidence (%)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#facc15' } }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value, name) => {
                    if (name === 'Avg Confidence (%)') {
                      return [typeof value === 'number' ? `${value.toFixed(1)}%` : value, name]
                    }
                    return [value, name]
                  }}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="leak_count" 
                  stroke="#ef4444" 
                  fill="url(#leakageGradient)"
                  name="Leak Count" 
                  strokeWidth={3}
                  dot={{ r: 6, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 8, fill: '#ef4444' }}
                  connectNulls={true}
                  isAnimationActive={true}
                  baseLine={0}
                />
                <Line 
                  type="monotone" 
                  dataKey="avg_confidence" 
                  stroke="#facc15" 
                  name="Avg Confidence (%)" 
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#facc15', strokeWidth: 1, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#facc15' }}
                  yAxisId="right"
                  connectNulls={true}
                  isAnimationActive={true}
                />
              </ComposedChart>
            ) : (
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="pressureGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="flowGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="turbidityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="leakageGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="date" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  stroke="#cbd5e1"
                />
                <YAxis 
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  stroke="#cbd5e1"
                  label={{ value: 'Leak Count', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b' } }}
                />
                {metric === 'leakage_trends' && (
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 12, fill: '#facc15' }}
                    stroke="#facc15"
                    label={{ value: 'Confidence (%)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#facc15' } }}
                  />
                )}
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value, name) => {
                    if (name === 'Avg Confidence (%)') {
                      return [typeof value === 'number' ? `${value.toFixed(1)}%` : value, name]
                    }
                    return [value, name]
                  }}
                />
                <Legend />
                {metric === 'leakage_trends' && (
                  <>
                    <Area 
                      type="monotone" 
                      dataKey="leak_count" 
                      stroke="#ef4444" 
                      fill="url(#leakageGradient)"
                      name="Leak Count" 
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 8, fill: '#ef4444' }}
                      connectNulls={true}
                      isAnimationActive={true}
                      baseLine={0}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="leak_count" 
                      stroke="#ef4444" 
                      strokeWidth={3}
                      dot={{ r: 6, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 8, fill: '#ef4444' }}
                      connectNulls={true}
                      isAnimationActive={false}
                      legendType="none"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="avg_confidence" 
                      stroke="#facc15" 
                      name="Avg Confidence (%)" 
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#facc15', strokeWidth: 1, stroke: '#fff' }}
                      activeDot={{ r: 6, fill: '#facc15' }}
                      yAxisId="right"
                      connectNulls={true}
                      isAnimationActive={true}
                    />
                  </>
                )}
                {metric === 'water_quality' && (
                  <>
                    <Area 
                      type="monotone" 
                      dataKey="avg_turbidity" 
                      stroke="#8b5cf6" 
                      fill="url(#turbidityGradient)"
                      name="Avg Turbidity (NTU)" 
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="avg_temperature" 
                      stroke="#06b6d4" 
                      name="Avg Temperature (°C)" 
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </>
                )}
                {metric === 'pressure_flow' && (
                  <>
                    <Area 
                      type="monotone" 
                      dataKey="avg_pressure" 
                      stroke="#3b82f6" 
                      fill="url(#pressureGradient)"
                      name="Avg Pressure (bar)" 
                      strokeWidth={2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="avg_flow_rate" 
                      stroke="#06b6d4" 
                      fill="url(#flowGradient)"
                      name="Avg Flow (L/min)" 
                      strokeWidth={2}
                    />
                  </>
                )}
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Additional Charts Grid */}
      {data.length > 0 && (
        <div className="charts-grid">
          {metric === 'pressure_flow' && (
            <>
              <div className="chart-mini card">
                <h4>Pressure Trend</h4>
                <ResponsiveContainer width="100%" height={200} key={`pressure-${filters.village}-${filters.startDate}-${filters.endDate}`}>
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="avg_pressure" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-mini card">
                <h4>Flow Trend</h4>
                <ResponsiveContainer width="100%" height={200} key={`flow-${filters.village}-${filters.startDate}-${filters.endDate}`}>
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="avg_flow_rate" stroke="#06b6d4" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
