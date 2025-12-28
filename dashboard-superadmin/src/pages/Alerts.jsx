import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Alerts.css'
import useSuperAdminData from '../hooks/useSuperAdminData'

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const [expandedAlert, setExpandedAlert] = useState(null)
  const [villages, setVillages] = useState([])
  const [dynamicStats, setDynamicStats] = useState({ activeAlerts: 0, openTickets: 0 })
  const [filters, setFilters] = useState({
    severity: '',
    timeRange: '24h'
  })
  const [selectedDistrict, setSelectedDistrict] = useState('all')
  const [selectedMandal, setSelectedMandal] = useState('all')
  const [selectedVillage, setSelectedVillage] = useState('all')
  const [mandals, setMandals] = useState([])

  const {
    districts,
    districtData,
    loading: selectorLoading
  } = useSuperAdminData()

  useEffect(() => {
    if (selectedDistrict && selectedDistrict !== 'all') {
      const data = districtData[selectedDistrict]
      if (data) {
        setMandals(data.mandals || [])
      } else {
        setMandals([])
      }
    } else {
      setMandals([])
    }
    setSelectedMandal('all')
    setSelectedVillage('all')
  }, [selectedDistrict, districtData])

  useEffect(() => {
    if (selectedMandal && selectedMandal !== 'all' && selectedDistrict && selectedDistrict !== 'all') {
      const data = districtData[selectedDistrict]
      if (data && data.villagesByMandal) {
        setVillages(data.villagesByMandal[selectedMandal] || [])
      } else {
        setVillages([])
      }
    } else if (selectedDistrict && selectedDistrict !== 'all') {
      const data = districtData[selectedDistrict]
      setVillages(data?.villages || [])
    } else {
      setVillages([])
    }
    setSelectedVillage('all')
  }, [selectedMandal, selectedDistrict, districtData])

  useEffect(() => {
    if (selectedDistrict === 'all') {
      // Fetch all alerts if no district selected
      fetchAlerts()
      const fetchInterval = setInterval(() => {
        fetchAlerts()
      }, 5000)
      const timerInterval = setInterval(() => {
        setLastSyncSeconds((prev) => prev + 1)
      }, 1000)
      return () => {
        clearInterval(fetchInterval)
        clearInterval(timerInterval)
      }
    } else if (selectedDistrict) {
      fetchVillages()
      fetchAlerts()
      const fetchInterval = setInterval(() => {
        fetchVillages()
        fetchAlerts()
      }, 5000)
      const timerInterval = setInterval(() => {
        setLastSyncSeconds((prev) => prev + 1)
      }, 1000)
      return () => {
        clearInterval(fetchInterval)
        clearInterval(timerInterval)
      }
    }
  }, [filters, selectedDistrict, selectedMandal, selectedVillage])

  const fetchVillages = async () => {
    if (!selectedDistrict || selectedDistrict === 'all') return
    
    try {
      // Fetch mandals if not already loaded
      if (mandals.length === 0 && selectedDistrict !== 'all') {
        try {
          const mandalsRes = await axios.get(`/api/admin/mandals?district=${encodeURIComponent(selectedDistrict)}`)
          const mandalsList = (mandalsRes.data || []).map(m => m.mandal || m)
          setMandals(mandalsList)
        } catch (err) {
          console.error('Failed to fetch mandals:', err)
        }
      }
      
      const params = { district: selectedDistrict }
      if (selectedMandal && selectedMandal !== 'all') {
        params.mandal = selectedMandal
      }
      const response = await axios.get('/api/admin/villages', { params })
      setVillages(response.data || [])
    } catch (error) {
      console.error('Failed to load villages:', error)
    }
  }

  const fetchAlerts = async () => {
    try {
      const params = {}
      if (selectedDistrict && selectedDistrict !== 'all') {
        params.district = selectedDistrict
      }
      if (selectedMandal && selectedMandal !== 'all') {
        params.mandal = selectedMandal
      }
      if (selectedVillage && selectedVillage !== 'all') {
        params.village_id = selectedVillage
      }
      if (filters.severity) params.severity = filters.severity
      
      // Fetch alerts and dynamic stats in parallel
      const [alertsRes, dynamicStatsRes] = await Promise.allSettled([
        axios.get('/api/alerts', { params }).catch(err => ({ data: [] })),
        axios.get('/api/dynamic-stats/alerts-tickets', { params }).catch(err => ({ data: { activeAlerts: 0, openTickets: 0 } }))
      ])

      const alertsData = alertsRes.status === 'fulfilled' ? alertsRes.value.data : []
      const stats = dynamicStatsRes.status === 'fulfilled' ? dynamicStatsRes.value.data : { activeAlerts: 0, openTickets: 0 }

      console.log('Alerts response:', alertsData)
      console.log('Dynamic stats:', stats)
      
      // Sort alerts by severity (critical first) and then by timestamp (newest first)
      const sortedAlerts = (Array.isArray(alertsData) ? alertsData : []).sort((a, b) => {
        // First sort by severity (critical > high > medium > low)
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
        const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0)
        if (severityDiff !== 0) return severityDiff
        
        // Then sort by timestamp (newest first)
        const timeA = new Date(a.detected_at || a.sent_at || 0).getTime()
        const timeB = new Date(b.detected_at || b.sent_at || 0).getTime()
        return timeB - timeA
      })
      
      setAlerts(sortedAlerts)
      setDynamicStats(stats)
      setLastSyncSeconds(0)
    } catch (error) {
      console.error('Failed to load alerts:', error)
      toast.error('Failed to load alerts: ' + (error.response?.data?.message || error.message))
      setAlerts([])
    } finally {
      if (loading) {
        setLoading(false)
      }
    }
  }

  const acknowledgeAlert = async (alertId) => {
    try {
      await axios.post(`/api/alerts/${alertId}/acknowledge`)
      toast.success('Alert acknowledged')
      fetchAlerts()
    } catch (error) {
      toast.error('Failed to acknowledge alert')
    }
  }

  const assignAlert = async (alertId) => {
    try {
      toast.success('Alert assigned')
      fetchAlerts()
    } catch (error) {
      toast.error('Failed to assign alert')
    }
  }

  const resolveAlert = async (alertId) => {
    try {
      await axios.post(`/api/alerts/${alertId}/acknowledge`)
      toast.success('Alert resolved')
      fetchAlerts()
    } catch (error) {
      toast.error('Failed to resolve alert')
    }
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'danger'
      case 'high': return 'danger'
      case 'medium': return 'warning'
      default: return 'info'
    }
  }

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical': return '🔴'
      case 'high': return '🟠'
      case 'medium': return '🟡'
      default: return '🔵'
    }
  }

  const criticalAlerts = alerts.filter(a => a.severity === 'critical')
  const otherAlerts = alerts.filter(a => a.severity !== 'critical')
  const activeCount = alerts.filter(a => !a.acknowledged).length

  if (selectorLoading || loading) {
    return <div className="loading">Loading alerts...</div>
  }

  return (
    <div className="alerts-page">
      {/* Live Status Bar */}
      <div className="status-bar">
        <div className="status-indicator-wrapper">
          <div className="led-indicator led-green"></div>
          <span className="status-text">Last Sync: {lastSyncSeconds} sec ago</span>
        </div>
      </div>

      <div className="page-header">
        <div>
          <h1>Alerts {selectedDistrict !== 'all' ? `• ${selectedDistrict}` : '• All Districts'}</h1>
          <p className="page-subtitle">
            Monitor and manage system alerts across all districts
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#666' }}>Filter by District</label>
              <select 
                value={selectedDistrict} 
                onChange={(e) => {
                  setSelectedDistrict(e.target.value)
                  setSelectedMandal('all')
                  setSelectedVillage('all')
                }}
                style={{ 
                  padding: '0.5rem', 
                  borderRadius: '8px', 
                  border: '1px solid #ccc', 
                  minWidth: '200px',
                  fontWeight: selectedDistrict !== 'all' ? '600' : '400',
                  backgroundColor: selectedDistrict !== 'all' ? '#f0f9ff' : 'white'
                }}
              >
                <option value="all">All Districts</option>
                {districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            {mandals.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#666' }}>Filter by Mandal</label>
                <select 
                  value={selectedMandal} 
                  onChange={(e) => {
                    setSelectedMandal(e.target.value)
                    setSelectedVillage('all')
                  }}
                  style={{ 
                    padding: '0.5rem', 
                    borderRadius: '8px', 
                    border: '1px solid #ccc', 
                    minWidth: '200px',
                    fontWeight: selectedMandal !== 'all' ? '600' : '400',
                    backgroundColor: selectedMandal !== 'all' ? '#f0f9ff' : 'white'
                  }}
                >
                  <option value="all">All Mandals</option>
                  {mandals.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            {villages.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#666' }}>Filter by Village</label>
                <select 
                  value={selectedVillage} 
                  onChange={(e) => setSelectedVillage(e.target.value)}
                  style={{ 
                    padding: '0.5rem', 
                    borderRadius: '8px', 
                    border: '1px solid #ccc', 
                    minWidth: '200px',
                    fontWeight: selectedVillage !== 'all' ? '600' : '400',
                    backgroundColor: selectedVillage !== 'all' ? '#f0f9ff' : 'white'
                  }}
                >
                  <option value="all">All Villages</option>
                  {villages.map(v => (
                    <option key={v.id || v.name} value={v.id || v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="alert-stats">
          <div className="stat-badge stat-critical">
            <span className="stat-number">{activeCount}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat-badge stat-total">
            <span className="stat-number">{alerts.length}</span>
            <span className="stat-label">Total</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-card card">
        <div className="filters-grid">
          <div className="filter-group">
            <label>Alert Severity</label>
            <select
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Time Range</label>
            <select
              value={filters.timeRange}
              onChange={(e) => setFilters({ ...filters, timeRange: e.target.value })}
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Critical Alerts First */}
      {criticalAlerts.length > 0 && (
        <div className="alerts-section">
          <h2 className="section-title">Critical Alerts</h2>
          <div className="alerts-list">
            {criticalAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`alert-card alert-card-critical ${expandedAlert === alert.id ? 'expanded' : ''} ${!alert.acknowledged ? 'pulse' : ''}`}
                onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
              >
                <div className="alert-card-header">
                  <div className="alert-main">
                    <div className="alert-icon">
                      {getSeverityIcon(alert.severity)}
                    </div>
                    <div className="alert-content">
                      <div className="alert-title-row">
                        <span className={`badge badge-${getSeverityColor(alert.severity)}`}>
                          {alert.severity.toUpperCase()}
                        </span>
                        <span className="alert-type">{alert.alert_type}</span>
                      </div>
                      <p className="alert-message">{alert.message}</p>
                      <div className="alert-meta">
                        <span className="alert-device">Device: {alert.device_id}</span>
                        <span className="alert-time">{new Date(alert.sent_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="alert-actions">
                    {!alert.acknowledged && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          acknowledgeAlert(alert.id)
                        }}
                        className="btn btn-sm btn-primary"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
                {expandedAlert === alert.id && (
                  <div className="alert-details">
                    <div className="detail-row">
                      <span className="detail-label">Detected At:</span>
                      <span className="detail-value">{new Date(alert.detected_at || alert.sent_at).toLocaleString()}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Location:</span>
                      <span className="detail-value">{alert.location || 'N/A'}</span>
                    </div>
                    {alert.confidence && (
                      <div className="detail-row">
                        <span className="detail-label">Confidence:</span>
                        <span className="detail-value">{(alert.confidence * 100).toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Alerts */}
      {otherAlerts.length > 0 && (
        <div className="alerts-section">
          <h2 className="section-title">All Alerts</h2>
          <div className="alerts-list">
            {otherAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`alert-card alert-card-${getSeverityColor(alert.severity)} ${expandedAlert === alert.id ? 'expanded' : ''}`}
                onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
              >
                <div className="alert-card-header">
                  <div className="alert-main">
                    <div className="alert-icon">
                      {getSeverityIcon(alert.severity)}
                    </div>
                    <div className="alert-content">
                      <div className="alert-title-row">
                        <span className={`badge badge-${getSeverityColor(alert.severity)}`}>
                          {alert.severity.toUpperCase()}
                        </span>
                        <span className="alert-type">{alert.alert_type}</span>
                      </div>
                      <p className="alert-message">{alert.message}</p>
                      <div className="alert-meta">
                        <span className="alert-device">Device: {alert.device_id}</span>
                        <span className="alert-time">{new Date(alert.sent_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="alert-actions">
                    {!alert.acknowledged && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          acknowledgeAlert(alert.id)
                        }}
                        className="btn btn-sm btn-primary"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
                {expandedAlert === alert.id && (
                  <div className="alert-details">
                    <div className="detail-row">
                      <span className="detail-label">Detected At:</span>
                      <span className="detail-value">{new Date(alert.detected_at || alert.sent_at).toLocaleString()}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Location:</span>
                      <span className="detail-value">{alert.location || 'N/A'}</span>
                    </div>
                    {alert.confidence && (
                      <div className="detail-row">
                        <span className="detail-label">Confidence:</span>
                        <span className="detail-value">{(alert.confidence * 100).toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {alerts.length === 0 && !loading && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p>No alerts found for the selected filters.</p>
        </div>
      )}
    </div>
  )
}
