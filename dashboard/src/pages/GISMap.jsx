import React, { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'
import { toast } from 'react-toastify'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import './GISMap.css'
import useNearestVillage from '../hooks/useNearestVillage'
import { LocationGate } from '../components/LocationGate'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function AutoRefresh({ interval = 10000, onRefresh }) {
  const map = useMap()
  useEffect(() => {
    const timer = setInterval(() => onRefresh(), interval)
    return () => clearInterval(timer)
  }, [interval, onRefresh])
  return null
}

export default function GISMap() {
  const [sensors, setSensors] = useState([])
  const [pipelines, setPipelines] = useState([])
  const [villages, setVillages] = useState([])
  const [selectedSensor, setSelectedSensor] = useState(null)
  const [selectedVillage, setSelectedVillage] = useState(null)
  const [sensorAlerts, setSensorAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const mapRef = useRef(null)

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
    if (nearestVillage && !selectedVillage) {
      setSelectedVillage(nearestVillage.id)
    }
  }, [nearestVillage, selectedVillage])

  useEffect(() => {
    if (locationStatus !== 'granted' || !nearestVillage) return
    fetchVillages()
    fetchData()
    const fetchInterval = setInterval(() => {
      fetchVillages()
      fetchData()
    }, 5000)

    const timerInterval = setInterval(() => {
      setLastSyncSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      clearInterval(fetchInterval)
      clearInterval(timerInterval)
    }
  }, [selectedVillage, locationStatus, nearestVillage])

  useEffect(() => {
    if (selectedSensor) {
      fetchSensorAlerts()
      setPanelOpen(true)
    }
  }, [selectedSensor])

  const fetchVillages = async () => {
    try {
      const response = await axios.get('/api/gis/villages')
      setVillages(response.data)
    } catch (error) {
      toast.error('Failed to load villages')
    }
  }

  const fetchData = async () => {
    if (locationStatus !== 'granted' || !nearestVillage) return
    try {
      setLoading(true)
      const params = {}
      if (selectedVillage) {
        params.village_id = selectedVillage
      } else {
        params.village_id = nearestVillage.id
      }
      const [sensorsRes, pipelinesRes] = await Promise.all([
        axios.get('/api/gis/sensors', { params }),
        axios.get('/api/gis/pipelines', { params })
      ])
      setSensors(sensorsRes.data)
      setPipelines(pipelinesRes.data)
      // Reset "Last Sync" timer on successful refresh
      setLastSyncSeconds(0)
    } catch (error) {
      toast.error('Failed to load map data')
    } finally {
      setLoading(false)
    }
  }

  const fetchSensorAlerts = async () => {
    if (!selectedSensor) return
    try {
      const response = await axios.get(`/api/alerts?device_id=${selectedSensor.device_id}&limit=10`)
      setSensorAlerts(response.data || [])
    } catch (error) {
      console.error('Failed to load alerts:', error)
    }
  }

  const parseNumber = (value) => {
    if (value === null || value === undefined || value === '') return null
    const num = typeof value === 'string' ? parseFloat(value) : value
    return isNaN(num) ? null : num
  }

  const getStatusColor = (sensor) => {
    if (sensor.connection_status === 'offline') return '#94a3b8'
    const turbidity = parseNumber(sensor.turbidity)
    const pressure = parseNumber(sensor.pressure)
    const flowRate = parseNumber(sensor.flow_rate)
    
    if (turbidity !== null && turbidity > 7) return '#ef4444'
    if (pressure !== null && pressure < 2) return '#ef4444'
    if ((pressure !== null && pressure < 3) || (flowRate !== null && flowRate < 5)) return '#facc15'
    return '#10b981'
  }

  const getStatusText = (sensor) => {
    if (sensor.connection_status === 'offline') return 'Offline'
    const turbidity = parseNumber(sensor.turbidity)
    const pressure = parseNumber(sensor.pressure)
    const flowRate = parseNumber(sensor.flow_rate)
    
    if (turbidity !== null && turbidity > 7) return 'Poor Quality'
    if (pressure !== null && pressure < 2) return 'Leak Detected'
    if ((pressure !== null && pressure < 3) || (flowRate !== null && flowRate < 5)) return 'Warning'
    return 'Normal'
  }

  const formatNumber = (value, decimals = 2) => {
    const num = parseNumber(value)
    return num !== null ? num.toFixed(decimals) : 'N/A'
  }

  const acknowledgeAlert = async (alertId) => {
    try {
      await axios.post(`/api/alerts/${alertId}/acknowledge`)
      toast.success('Alert acknowledged')
      fetchSensorAlerts()
    } catch (error) {
      toast.error('Failed to acknowledge alert')
    }
  }

  const createTicket = async () => {
    if (!selectedSensor) return
    try {
      // Determine issue type and severity based on sensor status
      let issueType = 'leak'
      let severity = 'high'
      let description = `Issue detected at device ${selectedSensor.device_id}`
      
      const turbidity = parseNumber(selectedSensor.turbidity)
      const pressure = parseNumber(selectedSensor.pressure)
      const flowRate = parseNumber(selectedSensor.flow_rate)
      
      if (turbidity !== null && turbidity > 7) {
        issueType = 'contamination'
        severity = 'high'
        description = `Water contamination detected at device ${selectedSensor.device_id} - Turbidity: ${turbidity.toFixed(2)} NTU`
      } else if (pressure !== null && pressure < 2) {
        issueType = 'leak'
        severity = 'critical'
        description = `Critical leak detected at device ${selectedSensor.device_id} - Pressure: ${pressure.toFixed(2)} bar`
      } else if (pressure !== null && pressure < 3) {
        issueType = 'leak'
        severity = 'high'
        description = `Low pressure detected at device ${selectedSensor.device_id} - Pressure: ${pressure.toFixed(2)} bar`
      } else if (flowRate !== null && flowRate < 5) {
        issueType = 'low_flow'
        severity = 'high'
        description = `Low flow rate detected at device ${selectedSensor.device_id} - Flow: ${flowRate.toFixed(2)} L/min`
      }
      
      const response = await axios.post('/api/tickets', {
        device_id: selectedSensor.device_id,
        village_id: selectedSensor.village_id,
        issue_type: issueType,
        severity: severity,
        description: description
      })
      toast.success('Ticket created successfully')
      // Refresh sensor alerts to show updated data
      if (selectedSensor) {
        fetchSensorAlerts()
      }
    } catch (error) {
      console.error('Failed to create ticket:', error)
      toast.error('Failed to create ticket: ' + (error.response?.data?.message || error.message))
    }
  }

  // Prepare chart data
  const chartData = selectedSensor ? [
    { name: 'pH', value: parseNumber(selectedSensor.ph) || 0 },
    { name: 'Turbidity', value: parseNumber(selectedSensor.turbidity) || 0 },
    { name: 'Flow', value: parseNumber(selectedSensor.flow_rate) || 0 },
    { name: 'Pressure', value: parseNumber(selectedSensor.pressure) || 0 }
  ] : []

  if (locationStatus !== 'granted' || !nearestVillage) {
    return (
      <div className="gis-map-page">
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

  const mapCenter =
    nearestVillage && nearestVillage.gps_lat && nearestVillage.gps_lon
      ? [parseFloat(nearestVillage.gps_lat), parseFloat(nearestVillage.gps_lon)]
      : [20.5937, 78.9629]

  return (
    <div className="gis-map-page">
      {/* Live Status Bar */}
      <div className="status-bar">
        <div className="status-indicator-wrapper">
          <div className="led-indicator led-green"></div>
          <span className="status-text">Last Sync: {lastSyncSeconds} sec ago</span>
        </div>
      </div>

      <div className="map-header">
        <div>
          <h1>GIS Map {nearestVillage ? `• ${nearestVillage.name}` : ''}</h1>
          <p className="page-subtitle">
            {nearestVillage
              ? `Monitoring network around ${nearestVillage.name}`
              : 'Real-time sensor monitoring and pipeline visualization'}
          </p>
        </div>
        <div className="map-controls">
          <select
            value={selectedVillage || ''}
            onChange={(e) => setSelectedVillage(e.target.value || null)}
            className="village-select"
          >
            <option value={nearestVillage?.id || ''}>
              {nearestVillage?.name || 'Nearest Village'}
            </option>
            {villages
              .filter((v) => v.id !== nearestVillage?.id)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
          <button onClick={() => {
            fetchVillages()
            fetchData()
          }} className="btn btn-primary">
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="map-container">
        <MapContainer
          center={mapCenter}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          
          <AutoRefresh interval={5000} onRefresh={fetchData} />

          {pipelines.map((pipeline) => {
            let coordinates = []
            if (pipeline.geometry) {
              // GeoJSON parsing would go here
            }
            
            const color = pipeline.status === 'leak_detected' ? '#ef4444' : 
                         pipeline.status === 'maintenance' ? '#facc15' : '#06b6d4'
            
            return coordinates.length > 0 ? (
              <Polyline
                key={pipeline.id}
                positions={coordinates}
                color={color}
                weight={pipeline.pipeline_type === 'main_supply' ? 5 : 3}
                dashArray={pipeline.status === 'leak_detected' ? '10, 5' : undefined}
                opacity={0.7}
              />
            ) : null
          })}

          {sensors
            .filter((s) => {
              const lat = parseNumber(s.gps_lat)
              const lon = parseNumber(s.gps_lon)
              return lat !== null && lon !== null
            })
            .map((sensor) => {
              const statusColor = getStatusColor(sensor)
              const lat = parseNumber(sensor.gps_lat)
              const lon = parseNumber(sensor.gps_lon)
              const isCritical = statusColor === '#ef4444'
              
              return (
                <Marker
                  key={sensor.device_id}
                  position={[lat, lon]}
                  icon={L.divIcon({
                    className: `sensor-marker ${isCritical ? 'pulse' : ''}`,
                    html: `
                      <div class="sensor-marker-inner" style="background-color: ${statusColor};">
                        <div class="sensor-marker-glow" style="background-color: ${statusColor};"></div>
                      </div>
                    `,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],
                  })}
                  eventHandlers={{
                    click: () => setSelectedSensor(sensor)
                  }}
                >
                  <Popup>
                    <div className="sensor-popup">
                      <h3>{sensor.device_type?.replace('_', ' ').toUpperCase() || 'SENSOR'}</h3>
                      <p><strong>Device ID:</strong> {sensor.device_id}</p>
                      {sensor.village_name && <p><strong>Village:</strong> {sensor.village_name}</p>}
                      <p><strong>Status:</strong> <span style={{ color: statusColor }}>{getStatusText(sensor)}</span></p>
                      {sensor.flow_rate !== null && <p><strong>Flow:</strong> {formatNumber(sensor.flow_rate, 2)} L/min</p>}
                      {sensor.pressure !== null && <p><strong>Pressure:</strong> {formatNumber(sensor.pressure, 2)} bar</p>}
                      {sensor.turbidity !== null && <p><strong>Turbidity:</strong> {formatNumber(sensor.turbidity, 2)} NTU</p>}
                      {sensor.temperature !== null && <p><strong>Temperature:</strong> {formatNumber(sensor.temperature, 2)}°C</p>}
                      {sensor.battery_level !== null && <p><strong>Battery:</strong> {formatNumber(sensor.battery_level, 0)}%</p>}
                    </div>
                  </Popup>
                </Marker>
              )
            })}
        </MapContainer>

        {/* Slide-out Panel */}
        {panelOpen && selectedSensor && (
          <div className="map-panel">
            <div className="panel-header">
              <h2>Sensor Details</h2>
              <button className="panel-close" onClick={() => setPanelOpen(false)}>×</button>
            </div>
            
            <div className="panel-content">
              <div className="panel-section">
                <h3>Device Information</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Device ID</span>
                    <span className="info-value">{selectedSensor.device_id}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Village</span>
                    <span className="info-value">{selectedSensor.village_name || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Status</span>
                    <span className="info-value" style={{ color: getStatusColor(selectedSensor) }}>
                      {getStatusText(selectedSensor)}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Battery</span>
                    <span className="info-value">{formatNumber(selectedSensor.battery_level, 0)}%</span>
                  </div>
                </div>
              </div>

              <div className="panel-section">
                <h3>Live Sensor Readings</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="name"
                      label={{ value: 'Parameter', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis
                      label={{
                        value: 'Value (pH / NTU / L/min / bar)',
                        angle: -90,
                        position: 'insideLeft',
                      }}
                    />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="axis-units">
                  X-axis: Parameter (pH, Turbidity, Flow, Pressure) • Y-axis: Value in respective units
                  (pH, NTU, L/min, bar)
                </p>
                <div className="sensor-readings">
                  <div className="reading-item">
                    <span>pH</span>
                    <strong>{formatNumber(selectedSensor.ph, 2)}</strong>
                  </div>
                  <div className="reading-item">
                    <span>Turbidity</span>
                    <strong>{formatNumber(selectedSensor.turbidity, 2)} NTU</strong>
                  </div>
                  <div className="reading-item">
                    <span>Flow</span>
                    <strong>{formatNumber(selectedSensor.flow_rate, 2)} L/min</strong>
                  </div>
                  <div className="reading-item">
                    <span>Pressure</span>
                    <strong>{formatNumber(selectedSensor.pressure, 2)} bar</strong>
                  </div>
                </div>
              </div>

              <div className="panel-section">
                <h3>Recent Alerts ({sensorAlerts.length})</h3>
                <div className="alerts-list">
                  {sensorAlerts.length > 0 ? (
                    sensorAlerts.map((alert) => (
                      <div key={alert.id} className="alert-item">
                        <div className="alert-header">
                          <span className={`badge badge-${alert.severity}`}>{alert.severity}</span>
                          <span className="alert-time">{new Date(alert.sent_at).toLocaleString()}</span>
                        </div>
                        <p className="alert-message">{alert.message}</p>
                        {!alert.acknowledged && (
                          <button 
                            className="btn btn-sm btn-primary"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            Acknowledge
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="no-alerts">No recent alerts</p>
                  )}
                </div>
              </div>

              <div className="panel-actions">
                <button className="btn btn-primary" onClick={createTicket}>
                  Create Ticket
                </button>
                <button className="btn btn-success" onClick={() => acknowledgeAlert(sensorAlerts[0]?.id)}>
                  Acknowledge Alert
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
