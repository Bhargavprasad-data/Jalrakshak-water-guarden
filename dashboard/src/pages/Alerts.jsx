import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Alerts.css'
import useNearestVillage from '../hooks/useNearestVillage'
import { LocationGate } from '../components/LocationGate'

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const [expandedAlert, setExpandedAlert] = useState(null)
  const [villages, setVillages] = useState([])
  const [dynamicStats, setDynamicStats] = useState({ activeAlerts: 0, openTickets: 0 })
  const [filters, setFilters] = useState({
    severity: '',
    village: '',
    timeRange: '24h'
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
  }, [filters, locationStatus, nearestVillage])

  const fetchVillages = async () => {
    try {
      const response = await axios.get('/api/gis/villages')
      setVillages(response.data)
    } catch (error) {
      console.error('Failed to load villages:', error)
    }
  }

  const fetchAlerts = async () => {
    if (locationStatus !== 'granted' || !nearestVillage) return
    try {
      const params = {}
      if (filters.severity) params.severity = filters.severity
      params.village_id = filters.village || nearestVillage.id
      
      // Fetch alerts and dynamic stats in parallel like Dashboard
      const [alertsRes, dynamicStatsRes] = await Promise.allSettled([
        axios.get('/api/alerts', { params }).catch(err => ({ data: [] })),
        axios.get('/api/dynamic-stats/alerts-tickets').catch(err => ({ data: { activeAlerts: 0, openTickets: 0 } }))
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
      // Only hide the loading state after the first load; don't show
      // the full-page loader again on background refreshes.
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
      // Implementation for assigning alert
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

  if (locationStatus !== 'granted' || !nearestVillage) {
    return (
      <div className="alerts-page">
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
          <h1>Alerts {nearestVillage ? `• ${nearestVillage.name}` : ''}</h1>
          <p className="page-subtitle">
            {nearestVillage
              ? `Live alerts near ${nearestVillage.name}`
              : 'Monitor and manage system alerts in real-time'}
          </p>
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
            <label>Village</label>
            <select
              value={filters.village}
              onChange={(e) => setFilters({ ...filters, village: e.target.value })}
            >
              <option value="">All Villages</option>
              {villages.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
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
          <div className="filter-actions">
            <button onClick={() => {
              fetchVillages()
              fetchAlerts()
            }} className="btn btn-primary">
              🔄 Refresh
            </button>
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
                  <div className="alert-status">
                    {alert.acknowledged ? (
                      <span className="badge badge-success">Acknowledged</span>
                    ) : (
                      <span className="badge badge-warning">Unacknowledged</span>
                    )}
                  </div>
      </div>

                {expandedAlert === alert.id && (
                  <div className="alert-card-details">
                    <div className="details-grid">
                      <div className="detail-item">
                        <span className="detail-label">Alert ID</span>
                        <span className="detail-value">{alert.id}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Confidence</span>
                        <span className="detail-value">{alert.confidence ? `${(alert.confidence * 100).toFixed(1)}%` : 'N/A'}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Detected At</span>
                        <span className="detail-value">{new Date(alert.detected_at || alert.sent_at).toLocaleString()}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Location</span>
                        <span className="detail-value">{alert.location || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="alert-actions">
                      {!alert.acknowledged && (
                        <>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              acknowledgeAlert(alert.id)
                            }}
                          >
                            Acknowledge
                          </button>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              assignAlert(alert.id)
                            }}
                          >
                            Assign
                          </button>
                        </>
                      )}
                      <button
                        className="btn btn-success btn-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          resolveAlert(alert.id)
                        }}
                      >
                        Resolve
                      </button>
                    </div>
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
                  <div className="alert-status">
                  {alert.acknowledged ? (
                      <span className="badge badge-success">Acknowledged</span>
                    ) : (
                      <span className="badge badge-warning">Unacknowledged</span>
                    )}
                  </div>
                </div>
                
                {expandedAlert === alert.id && (
                  <div className="alert-card-details">
                    <div className="details-grid">
                      <div className="detail-item">
                        <span className="detail-label">Alert ID</span>
                        <span className="detail-value">{alert.id}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Confidence</span>
                        <span className="detail-value">{alert.confidence ? `${(alert.confidence * 100).toFixed(1)}%` : 'N/A'}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Detected At</span>
                        <span className="detail-value">{new Date(alert.detected_at || alert.sent_at).toLocaleString()}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Location</span>
                        <span className="detail-value">{alert.location || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="alert-actions">
                  {!alert.acknowledged && (
                        <>
                    <button
                            className="btn btn-primary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              acknowledgeAlert(alert.id)
                            }}
                    >
                      Acknowledge
                    </button>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              assignAlert(alert.id)
                            }}
                          >
                            Assign
                          </button>
                        </>
                      )}
                      <button
                        className="btn btn-success btn-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          resolveAlert(alert.id)
                        }}
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
      </div>
        </div>
      )}

      {alerts.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>No Alerts</h3>
          <p>All systems are operating normally.</p>
        </div>
      )}
    </div>
  )
}
