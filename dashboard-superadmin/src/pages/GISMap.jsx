import React, { useEffect, useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'
import { toast } from 'react-toastify'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import './GISMap.css'
import useSuperAdminData from '../hooks/useSuperAdminData'

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
  const [selectedVillage, setSelectedVillage] = useState('all')
  const [selectedMandal, setSelectedMandal] = useState('all')
  const [selectedDistrict, setSelectedDistrict] = useState('Srikakulam')
  const [sensorAlerts, setSensorAlerts] = useState([])
  const [loading, setLoading] = useState(false) // Start as false to avoid showing loading indicator
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const mapRef = useRef(null)
  const fetchIntervalRef = useRef(null)
  const fetchDataRef = useRef(null)
  const fetchVillagesRef = useRef(null)
  const selectedDistrictRef = useRef(selectedDistrict)
  const selectedMandalRef = useRef(selectedMandal)
  const selectedVillageRef = useRef(selectedVillage)
  const [filteredMandals, setFilteredMandals] = useState([])
  const [filteredVillages, setFilteredVillages] = useState([])

  const {
    districts,
    districtData,
    loading: selectorLoading
  } = useSuperAdminData()

  const fetchVillages = useCallback(async () => {
    // Don't fetch all villages when 'all' is selected - too slow
    if (selectedDistrict === 'all') {
        setVillages([])
      setFilteredVillages([])
      return
    }
    if (!selectedDistrict) {
      setVillages([])
      setFilteredVillages([])
      return
    }
    
    try {
      const params = { district: selectedDistrict }
      if (selectedMandal && selectedMandal !== 'all') {
        params.mandal = selectedMandal
      }
      if (selectedVillage && selectedVillage !== 'all') {
        params.village_id = selectedVillage
      }
      const response = await axios.get('/api/admin/villages', { params })
      const villagesData = response.data || []
      setVillages(villagesData)
      setFilteredVillages(villagesData)
    } catch (error) {
      console.error('Failed to load villages:', error)
      setVillages([])
      setFilteredVillages([])
    }
  }, [selectedDistrict, selectedMandal, selectedVillage])

  const fetchData = useCallback(async () => {
    // Don't fetch if no district selected
    if (!selectedDistrict || selectedDistrict === 'all') {
      setSensors([])
      setPipelines([])
      return
    }
    
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
      
      const [sensorsRes, pipelinesRes] = await Promise.allSettled([
        axios.get('/api/gis/sensors', { params }).catch(err => {
          console.error('Failed to fetch sensors:', err)
          return { data: [] }
        }),
        axios.get('/api/gis/pipelines', { params }).catch(err => {
          console.error('Failed to fetch pipelines:', err)
          return { data: [] }
        })
      ])
      
      const sensorsData = sensorsRes.status === 'fulfilled' ? sensorsRes.value.data : []
      const pipelinesData = pipelinesRes.status === 'fulfilled' ? pipelinesRes.value.data : []
      
      setSensors(sensorsData || [])
      setPipelines(pipelinesData || [])
      // Reset Last Sync timer on successful fetch
      setLastSyncSeconds(0)
    } catch (error) {
      console.error('Failed to load map data:', error)
      setSensors([])
      setPipelines([])
    }
  }, [selectedDistrict, selectedMandal, selectedVillage])

  const fetchSensorAlerts = async () => {
    if (!selectedSensor) return
    try {
      const response = await axios.get(`/api/alerts?device_id=${selectedSensor.device_id}&limit=10`)
      setSensorAlerts(response.data || [])
    } catch (error) {
      console.error('Failed to load alerts:', error)
    }
  }

  // Track previous district to detect actual changes
  const prevDistrictRef = useRef(null)
  
  // Fetch mandals when district changes (same as Dashboard)
  useEffect(() => {
    if (selectedDistrict && selectedDistrict !== 'all') {
      const fetchMandals = async () => {
        try {
          const mandalsRes = await axios.get(`/api/admin/mandals?district=${encodeURIComponent(selectedDistrict)}`)
          const mandalsList = (mandalsRes.data || []).map(m => {
            // Extract mandal name consistently
            const mandalName = typeof m === 'string' ? m : (m.mandal || m.name || m)
            return String(mandalName).trim()
          }).filter(m => m)
          setFilteredMandals(mandalsList)
        } catch (err) {
          console.error('Failed to fetch mandals:', err)
          setFilteredMandals([])
        }
      }
      fetchMandals()
      
      // Only reset mandal/village if district actually changed (not on initial load)
      if (prevDistrictRef.current !== null && prevDistrictRef.current !== selectedDistrict) {
        setSelectedMandal('all') // Reset mandal when district changes
        setSelectedVillage('all') // Reset village when district changes
      }
      prevDistrictRef.current = selectedDistrict
    } else {
      setFilteredMandals([])
    setSelectedMandal('all')
    setSelectedVillage('all')
      prevDistrictRef.current = selectedDistrict
    }
  }, [selectedDistrict])

  // Fetch villages when mandal is selected (same as Dashboard)
  useEffect(() => {
    if (selectedMandal && selectedMandal !== 'all' && selectedDistrict && selectedDistrict !== 'all') {
      const fetchVillagesForMandal = async () => {
        try {
          const villagesRes = await axios.get(
            `/api/admin/villages?district=${encodeURIComponent(selectedDistrict)}&mandal=${encodeURIComponent(selectedMandal)}`
          )
          setFilteredVillages(villagesRes.data || [])
        } catch (err) {
          console.error('Failed to fetch villages:', err)
          setFilteredVillages([])
        }
      }
      fetchVillagesForMandal()
      setSelectedVillage('all') // Reset village when mandal changes
    } else if (selectedDistrict && selectedDistrict !== 'all') {
      // If only district is selected, get all villages in that district
      const fetchVillagesForDistrict = async () => {
        try {
          const villagesRes = await axios.get(
            `/api/admin/villages?district=${encodeURIComponent(selectedDistrict)}`
          )
          setFilteredVillages(villagesRes.data || [])
        } catch (err) {
          console.error('Failed to fetch villages:', err)
          setFilteredVillages([])
        }
      }
      fetchVillagesForDistrict()
      setSelectedVillage('all')
    } else {
      setFilteredVillages([])
      setSelectedVillage('all')
    }
  }, [selectedMandal, selectedDistrict])

  // Set default district to Srikakulam when districts are loaded (only once on mount)
  const hasSetDefaultDistrict = useRef(false)
  useEffect(() => {
    // Only set default once when districts are first loaded, before any user interaction
    if (districts.length > 0 && !hasSetDefaultDistrict.current) {
      const srikakulamExists = districts.includes('Srikakulam')
      // Only set default if current selection is the initial default or 'all'
      if (selectedDistrict === 'Srikakulam' || selectedDistrict === 'all') {
        if (srikakulamExists) {
          setSelectedDistrict('Srikakulam')
        } else if (districts.length > 0) {
          setSelectedDistrict(districts[0])
        }
        hasSetDefaultDistrict.current = true
      } else {
        // User has already selected a different district (shouldn't happen on mount, but be safe)
        hasSetDefaultDistrict.current = true
      }
    }
  }, [districts]) // Only depend on districts, not selectedDistrict, to avoid resetting user selections

  // Keep refs updated with latest values and functions
  useEffect(() => {
    fetchDataRef.current = fetchData
    fetchVillagesRef.current = fetchVillages
    selectedDistrictRef.current = selectedDistrict
    selectedMandalRef.current = selectedMandal
    selectedVillageRef.current = selectedVillage
  }, [fetchData, fetchVillages, selectedDistrict, selectedMandal, selectedVillage])

  // Set up timer interval separately - ONLY for UI display, does NOT fetch data
  // This timer runs continuously and independently
  useEffect(() => {
    // Start timer immediately
    const timerInterval = setInterval(() => {
      setLastSyncSeconds((prev) => {
        // Increment timer every second
        return prev + 1
      })
    }, 1000) // 1 second - ONLY for timer display, NOT for data fetching

    return () => {
      clearInterval(timerInterval)
    }
  }, []) // Empty dependency array - timer runs independently

  // Handle filter changes - fetch data immediately when filters change
  useEffect(() => {
    // Don't fetch if no district selected
    if (!selectedDistrict || selectedDistrict === 'all') {
      setVillages([])
      setSensors([])
      setPipelines([])
      setLoading(false)
      return
    }
    
    // Fetch data immediately when filters change
    const loadDataOnFilterChange = async () => {
      try {
        if (fetchVillagesRef.current && fetchDataRef.current) {
          await Promise.all([
            fetchVillagesRef.current(),
            fetchDataRef.current()
          ])
          setLastSyncSeconds(0)
        }
      } catch (error) {
        console.error('Failed to load data on filter change:', error)
      }
    }
    
    loadDataOnFilterChange()
  }, [selectedDistrict, selectedMandal, selectedVillage]) // Only depend on filter states

  // Set up data fetching interval - runs independently, uses refs for latest values
  useEffect(() => {
    // Don't set up interval if no district selected
    if (!selectedDistrict || selectedDistrict === 'all') {
      return
    }
    
    let isMounted = true
    let isFirstLoad = true
    
    // Initial load
    const initialLoad = async () => {
      if (fetchVillagesRef.current && fetchDataRef.current) {
        try {
          await Promise.all([
            fetchVillagesRef.current(),
            fetchDataRef.current()
          ])
          setLastSyncSeconds(0)
          isFirstLoad = false
        } catch (error) {
          console.error('Failed to load initial data:', error)
          isFirstLoad = false
        }
      }
    }
    
    // Initial load
    initialLoad()
    
    // Clear any existing interval first
    if (fetchIntervalRef.current) {
      clearInterval(fetchIntervalRef.current)
      fetchIntervalRef.current = null
    }
    
    // Set up refresh interval (every 10 seconds) - uses refs to get latest values
    fetchIntervalRef.current = setInterval(() => {
      if (isMounted && !isFirstLoad) {
        // Check if district is still valid
        const currentDistrict = selectedDistrictRef.current
        if (!currentDistrict || currentDistrict === 'all') {
          return
        }
        
        // Background refresh, no loading spinner
        if (fetchVillagesRef.current && fetchDataRef.current) {
          Promise.all([
            fetchVillagesRef.current(),
            fetchDataRef.current()
          ]).then(() => {
            // Ensure timer is reset after successful fetch
            setLastSyncSeconds(0)
          }).catch(error => {
            console.error('Failed to refresh data:', error)
          })
        }
      }
    }, 10000) // 10 seconds - this is the ONLY place data is fetched automatically
    
    return () => {
      isMounted = false
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current)
        fetchIntervalRef.current = null
      }
    }
  }, [selectedDistrict]) // Only recreate interval when district changes (not on every filter change)

  useEffect(() => {
    if (selectedSensor) {
      fetchSensorAlerts()
      setPanelOpen(true)
    }
  }, [selectedSensor])

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

  const formatVillageName = (name) => {
    if (!name) return ''
    // Replace underscores with spaces and capitalize each word
    return name
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
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

  // Removed loading indicator - data loads in background without blocking UI

  // Get center coordinates from villages or use default
  const centerLat = villages.length > 0 && villages[0].gps_lat ? parseFloat(villages[0].gps_lat) : 
                    villages.length > 0 && villages[0].latitude ? parseFloat(villages[0].latitude) : 18.3
  const centerLng = villages.length > 0 && villages[0].gps_lon ? parseFloat(villages[0].gps_lon) :
                    villages.length > 0 && villages[0].longitude ? parseFloat(villages[0].longitude) : 83.2

  return (
    <div className="gis-map-page">
      <div className="page-header">
        <div>
          <h1>GIS Map {selectedDistrict !== 'all' ? `• ${selectedDistrict}` : '• All Districts'}</h1>
          <p className="page-subtitle">Interactive map showing sensors, pipelines, and villages</p>
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
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#666' }}>Filter by Mandal</label>
                <select 
                  value={selectedMandal} 
                  onChange={(e) => {
                  const newMandal = e.target.value
                  setSelectedMandal(newMandal)
                    setSelectedVillage('all')
                  }}
                disabled={selectedDistrict === 'all' || filteredMandals.length === 0}
                  style={{ 
                    padding: '0.5rem', 
                    borderRadius: '8px', 
                    border: '1px solid #ccc', 
                    minWidth: '200px',
                    fontWeight: selectedMandal !== 'all' ? '600' : '400',
                  backgroundColor: selectedDistrict === 'all' || filteredMandals.length === 0 ? '#f3f4f6' : (selectedMandal !== 'all' ? '#f0f9ff' : 'white'),
                  cursor: (selectedDistrict === 'all' || filteredMandals.length === 0) ? 'not-allowed' : 'pointer',
                  opacity: (selectedDistrict === 'all' || filteredMandals.length === 0) ? 0.6 : 1
                  }}
                >
                  <option value="all">All Mandals</option>
                {filteredMandals.map(m => {
                  const mandalValue = String(m).trim()
                  return <option key={mandalValue} value={mandalValue}>{mandalValue}</option>
                })}
                </select>
              </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#666' }}>Filter by Village</label>
                <select 
                  value={selectedVillage} 
                onChange={(e) => {
                  const newVillage = e.target.value
                  setSelectedVillage(newVillage)
                }}
                disabled={selectedDistrict === 'all' || filteredVillages.length === 0}
                  style={{ 
                    padding: '0.5rem', 
                    borderRadius: '8px', 
                    border: '1px solid #ccc', 
                    minWidth: '200px',
                    fontWeight: selectedVillage !== 'all' ? '600' : '400',
                  backgroundColor: selectedDistrict === 'all' || filteredVillages.length === 0 ? '#f3f4f6' : (selectedVillage !== 'all' ? '#f0f9ff' : 'white'),
                  cursor: (selectedDistrict === 'all' || filteredVillages.length === 0) ? 'not-allowed' : 'pointer',
                  opacity: (selectedDistrict === 'all' || filteredVillages.length === 0) ? 0.6 : 1
                  }}
                >
                  <option value="all">All Villages</option>
                {filteredVillages.map(v => {
                  const villageId = v.id || v.name
                  const villageValue = String(villageId).trim()
                  return (
                    <option key={villageValue} value={villageValue}>
                      {v.name}
                    </option>
                  )
                })}
                </select>
            </div>
            {(selectedDistrict !== 'Srikakulam' || selectedMandal !== 'all' || selectedVillage !== 'all') && (
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  onClick={() => {
                    // Reset to default district (Srikakulam)
                    const defaultDistrict = districts.includes('Srikakulam') ? 'Srikakulam' : (districts.length > 0 ? districts[0] : 'all')
                    setSelectedDistrict(defaultDistrict)
                    setSelectedMandal('all')
                    setSelectedVillage('all')
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#fff',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#666' }}>
            Last sync: {lastSyncSeconds}s ago
          </span>
        </div>
      </div>

      <div className="map-container">
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={11}
          style={{ height: '600px', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          
          <AutoRefresh interval={10000} onRefresh={fetchData} />
          
          {villages
            .filter((village) => {
              // Filter by district
              if (selectedDistrict && selectedDistrict !== 'all') {
                const villageDistrict = village.district || ''
                if (villageDistrict.toLowerCase() !== selectedDistrict.toLowerCase()) {
                  return false
                }
              }
              
              // Filter by mandal
              if (selectedMandal && selectedMandal !== 'all') {
                const villageMandal = village.mandal || (village.metadata && village.metadata.mandal) || ''
                if (villageMandal.toLowerCase() !== selectedMandal.toLowerCase()) {
                  return false
                }
              }
              
              // Filter by village
              if (selectedVillage && selectedVillage !== 'all') {
                const villageId = village.id || village.name
                if (String(villageId) !== String(selectedVillage)) {
                  return false
                }
              }
              
              return true
            })
            .map((village) => {
            const lat = parseNumber(village.gps_lat) || parseNumber(village.latitude) || centerLat
            const lng = parseNumber(village.gps_lon) || parseNumber(village.longitude) || centerLng
            
            if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null
            
            return (
              <Marker
                key={village.id || village.name}
                position={[lat, lng]}
              >
                <Popup>
                  <div>
                    <h3>{village.name}</h3>
                    <p>District: {village.district || selectedDistrict}</p>
                    {village.mandal && <p>Mandal: {village.mandal}</p>}
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {pipelines
            .filter((pipeline) => {
              // Pipelines are already filtered by API, but add frontend filter for safety
              // Ensure pipeline belongs to one of the filtered villages
              if (filteredVillages.length > 0) {
                const pipelineVillageId = pipeline.village_id
                const villageMatch = filteredVillages.some(v => 
                  String(v.id || v.name) === String(pipelineVillageId)
                )
                if (!villageMatch) {
                  return false
                }
              }
              
              // If specific village is selected, ensure exact match
              if (selectedVillage && selectedVillage !== 'all') {
                const pipelineVillageId = pipeline.village_id
                if (pipelineVillageId && String(pipelineVillageId) !== String(selectedVillage)) {
                  return false
                }
              }
              
              return true
            })
            .map((pipeline) => {
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
              // Filter by coordinates first
              const lat = parseNumber(s.gps_lat)
              const lon = parseNumber(s.gps_lon)
              if (lat === null || lon === null) return false
              
              // Filter by district
              if (selectedDistrict && selectedDistrict !== 'all') {
                const sensorDistrict = s.district || s.village_district || ''
                if (sensorDistrict && sensorDistrict.toLowerCase() !== selectedDistrict.toLowerCase()) {
                  return false
                }
              }
              
              // Filter by mandal
              if (selectedMandal && selectedMandal !== 'all') {
                const sensorMandal = s.mandal || s.village_mandal || (s.metadata && s.metadata.mandal) || ''
                if (sensorMandal && sensorMandal.toLowerCase() !== selectedMandal.toLowerCase()) {
                  return false
                }
              }
              
              // Filter by village
              if (selectedVillage && selectedVillage !== 'all') {
                const sensorVillageId = s.village_id || s.village_name || ''
                if (sensorVillageId && String(sensorVillageId) !== String(selectedVillage)) {
                  return false
                }
              }
              
              return true
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
                      <p><strong>Village:</strong> {sensor.village_name ? formatVillageName(sensor.village_name) : (sensor.village_id ? `Village ${sensor.village_id}` : 'Unknown')}</p>
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
                    <span className="info-value">{selectedSensor.village_name ? formatVillageName(selectedSensor.village_name) : (selectedSensor.village_id ? `Village ${selectedSensor.village_id}` : 'Unknown')}</span>
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

