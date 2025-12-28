import React, { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import * as XLSX from 'xlsx'
import { useAuth } from '../context/AuthContext'
import './Dashboard.css'

export default function Dashboard() {
  const { user } = useAuth()
  const [liveData, setLiveData] = useState([])
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const [stats, setStats] = useState({
    totalVillages: 0,
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

  // Get mandal from logged-in user (check both mandal and assigned_mandal)
  const userMandal = user?.mandal || user?.assigned_mandal || ''
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const [villages, setVillages] = useState([])
  const [selectedVillage, setSelectedVillage] = useState('all')

  // Debug: Log user object
  useEffect(() => {
    console.log('[Mandal Dashboard] Current user object:', user)
    console.log('[Mandal Dashboard] Extracted userMandal:', userMandal)
  }, [user, userMandal])

  // Find district for the mandal
  useEffect(() => {
    async function findDistrict() {
      if (!userMandal) {
        console.warn('[Mandal Dashboard] No mandal found in user object:', user)
        // If no mandal, try to use a default or show error
        setSelectedDistrict('Srikakulam')
        setLoading(false)
        return
      }

      try {
        console.log(`[Mandal Dashboard] Finding district for mandal: ${userMandal}`)
        
        // Method 1: Try fetching all villages and find one with matching mandal
        try {
          const villagesRes = await axios.get('/api/admin/villages')
          const allVillages = villagesRes.data || []
          
          const userMandalLower = String(userMandal).trim().toLowerCase()
          
          // Find first village with matching mandal
          const matchingVillage = allVillages.find(v => {
            const vMandal = String(v.mandal || (v.metadata && v.metadata.mandal) || '').trim().toLowerCase()
            return vMandal === userMandalLower ||
                   vMandal.includes(userMandalLower) ||
                   userMandalLower.includes(vMandal)
          })
          
          if (matchingVillage && matchingVillage.district) {
            setSelectedDistrict(matchingVillage.district)
            console.log(`[Mandal Dashboard] Found district: ${matchingVillage.district} for mandal: ${userMandal}`)
            return
          }
        } catch (err) {
          console.error('[Mandal Dashboard] Error fetching villages:', err)
        }

        // Method 2: Try each district's mandals API
        try {
        const districtsRes = await axios.get('/api/admin/districts')
        const districtsList = (districtsRes.data || []).map(d => d.district || d)
        
        for (const district of districtsList) {
          try {
            const mandalsRes = await axios.get(`/api/admin/mandals?district=${encodeURIComponent(district)}`)
              const mandalsList = (mandalsRes.data || []).map(m => String(m.mandal || m).trim().toLowerCase())
              
              const userMandalLower = String(userMandal).trim().toLowerCase()
              const found = mandalsList.some(m => 
                m === userMandalLower || 
                m.includes(userMandalLower) || 
                userMandalLower.includes(m)
            )
            
              if (found) {
              setSelectedDistrict(district)
                console.log(`[Mandal Dashboard] Found district: ${district} for mandal: ${userMandal}`)
                return
            }
          } catch (err) {
              // Continue to next district
            }
          }
        } catch (err) {
          console.error('[Mandal Dashboard] Error checking districts:', err)
        }
        
        // If still not found, default to Srikakulam (most common district)
        console.warn(`[Mandal Dashboard] Could not find district for mandal: ${userMandal}, defaulting to Srikakulam`)
        setSelectedDistrict('Srikakulam')
      } catch (error) {
        console.error('[Mandal Dashboard] Failed to find district:', error)
        // Default to Srikakulam if all methods fail
        setSelectedDistrict('Srikakulam')
      } finally {
        setLoading(false)
      }
    }
    
    findDistrict()
  }, [userMandal])

  const fetchData = useCallback(async () => {
    // Use Srikakulam as default if district not found
    const districtToUse = selectedDistrict || 'Srikakulam'
    if (!userMandal) {
      console.warn('[Mandal Dashboard] No mandal found in user object, user:', user)
      console.warn('[Mandal Dashboard] Attempting to fetch data without mandal filter')
      // Continue anyway - we'll fetch all data and let the user see it
      // This handles cases where mandal wasn't set during signup
    }

    console.log(`[Mandal Dashboard] Fetching data for mandal: ${userMandal}, district: ${districtToUse}`)

    try {
      // Fetch all villages in the district first (like District dashboard does)
      const villagesRes = await axios.get(
        `/api/admin/villages?district=${encodeURIComponent(districtToUse)}`
      ).catch(err => {
        console.error('[Mandal Dashboard] Failed to fetch villages:', err)
        return { data: [] }
      })
      
      let allVillages = villagesRes.data || []
      console.log(`[Mandal Dashboard] Received ${allVillages.length} villages from district API`)
      
      // Log unique mandals in the data for debugging
      const uniqueMandals = [...new Set(allVillages.map(v => String(v.mandal || v.metadata?.mandal || '').trim().toLowerCase()).filter(m => m))]
      console.log(`[Mandal Dashboard] Unique mandals in district data:`, uniqueMandals.slice(0, 10))
      
      // Filter villages by mandal name (case-insensitive, flexible matching)
      // Only filter by mandal field, NOT by village name
      let villagesToUse = allVillages
      
      if (userMandal) {
        const userMandalLower = String(userMandal).trim().toLowerCase()
        villagesToUse = allVillages.filter(v => {
          const vMandal = String(v.mandal || (v.metadata && v.metadata.mandal) || '').trim().toLowerCase()
          // Match by mandal field only - exact match or contains
          const matches = vMandal === userMandalLower ||
                 vMandal.includes(userMandalLower) ||
                 userMandalLower.includes(vMandal)
          return matches
        })
        console.log(`[Mandal Dashboard] Filtered to ${villagesToUse.length} villages for mandal: ${userMandal} (searching for: "${userMandalLower}")`)
      } else {
        console.warn('[Mandal Dashboard] No mandal specified in user object, showing all villages in district')
        // If no mandal, show all villages (or could show a message to contact admin)
      }
      
      // If no villages found and we have a userMandal, check if it might be a village name instead of mandal name
      if (villagesToUse.length === 0 && userMandal) {
        const userMandalLower = String(userMandal).trim().toLowerCase()
        console.warn(`[Mandal Dashboard] No villages found for mandal: ${userMandal}, district: ${districtToUse}`)
        console.warn(`[Mandal Dashboard] Searching for mandal: "${userMandalLower}"`)
        console.warn(`[Mandal Dashboard] Available mandals:`, uniqueMandals)
        
        // Check if the mandal name is actually a village name - if so, find its mandal
        const matchingVillage = allVillages.find(v => {
          const vName = String(v.name || '').trim().toLowerCase()
          return vName === userMandalLower || vName.includes(userMandalLower)
        })
        
        if (matchingVillage) {
          const actualMandal = matchingVillage.mandal || matchingVillage.metadata?.mandal
          console.log(`[Mandal Dashboard] Found "${userMandal}" as a village. Its mandal is: "${actualMandal}"`)
          if (actualMandal) {
            // Filter by the actual mandal
            const actualMandalLower = String(actualMandal).trim().toLowerCase()
            villagesToUse = allVillages.filter(v => {
              const vMandal = String(v.mandal || v.metadata?.mandal || '').trim().toLowerCase()
              return vMandal === actualMandalLower
            })
            console.log(`[Mandal Dashboard] Filtered to ${villagesToUse.length} villages for mandal: ${actualMandal}`)
          }
        }
      }
      
      // If still no villages found, proceed anyway - backend API might still return data
      // We'll use all villages in district but still pass the mandal parameter to backend
      if (villagesToUse.length === 0) {
        if (userMandal) {
          console.warn(`[Mandal Dashboard] Mandal "${userMandal}" not found in database.`)
        } else {
          console.warn(`[Mandal Dashboard] No mandal specified in user object.`)
        }
        console.warn(`[Mandal Dashboard] Will proceed with API calls - using all ${allVillages.length} villages in district for display.`)
        villagesToUse = allVillages
      }
      
      if (villagesToUse.length > 0) {
        console.log(`[Mandal Dashboard] Using ${villagesToUse.length} villages`)
        console.log(`[Mandal Dashboard] Sample villages:`, villagesToUse.slice(0, 5).map(v => ({ 
          name: v.name, 
          mandal: v.mandal || v.metadata?.mandal, 
          district: v.district,
          id: v.id 
        })))
      }
      
      setVillages(villagesToUse)

      // Build API parameters - use district and village IDs instead of mandal (since mandal doesn't exist in DB)
      // Fetch data for all villages in the district, then filter client-side by villagesToUse
      const districtParam = `district=${encodeURIComponent(districtToUse)}`
      const villageParam = selectedVillage && selectedVillage !== 'all' 
        ? `&village_id=${encodeURIComponent(selectedVillage)}` 
        : ''
      
      // If we have specific villages, fetch by district only and filter client-side
      // This ensures we get data even if mandal name doesn't match
      const filterParams = villageParam ? `${districtParam}${villageParam}` : districtParam
      
      console.log(`[Mandal Dashboard] Fetching data with params: ${filterParams}`)
      console.log(`[Mandal Dashboard] Will filter by ${villagesToUse.length} villages client-side`)

      // Fetch all data in parallel - fetch by district, then filter by villages client-side
      console.log(`[Mandal Dashboard] Making API calls with params: ${filterParams}`)
      const [telemetryRes, alertsRes, ticketsRes, statsRes] = await Promise.allSettled([
        axios.get(`/api/telemetry/live?${filterParams}`).catch(err => {
          console.error('[Mandal Dashboard] Telemetry API error:', err.response?.status, err.response?.data || err.message)
          console.error('[Mandal Dashboard] Telemetry API URL:', `/api/telemetry/live?${filterParams}`)
          return { data: [] }
        }),
        axios.get(`/api/alerts?acknowledged=false&${filterParams}`).catch(err => {
          console.error('[Mandal Dashboard] Alerts API error:', err.response?.status, err.response?.data || err.message)
          console.error('[Mandal Dashboard] Alerts API URL:', `/api/alerts?acknowledged=false&${filterParams}`)
          return { data: [] }
        }),
        axios.get(`/api/tickets?status=open&${filterParams}`).catch(err => {
          console.error('[Mandal Dashboard] Tickets API error:', err.response?.status, err.response?.data || err.message)
          console.error('[Mandal Dashboard] Tickets API URL:', `/api/tickets?status=open&${filterParams}`)
          return { data: [] }
        }),
        axios.get(`/api/telemetry/stats/summary?${filterParams}`).catch(err => {
          console.error('[Mandal Dashboard] Stats API error:', err.response?.status, err.response?.data || err.message)
          console.error('[Mandal Dashboard] Stats API URL:', `/api/telemetry/stats/summary?${filterParams}`)
          return { data: null }
        })
      ])

      console.log('[Mandal Dashboard] API responses status:', {
        telemetry: telemetryRes.status,
        alerts: alertsRes.status,
        tickets: ticketsRes.status,
        stats: statsRes.status
      })

      // Get raw data
      const allTelemetry = telemetryRes.status === 'fulfilled' ? telemetryRes.value.data : []
      const allAlerts = alertsRes.status === 'fulfilled' ? alertsRes.value.data : []
      const allTickets = ticketsRes.status === 'fulfilled' ? ticketsRes.value.data : []
      const statsData = statsRes.status === 'fulfilled' ? statsRes.value.data : null

      // Filter data by villagesToUse (client-side filtering)
      const villageIds = new Set(villagesToUse.map(v => v.id || v.name))
      const villageNames = new Set(villagesToUse.map(v => String(v.name || '').toLowerCase()))
      
      const telemetry = allTelemetry.filter(t => {
        if (selectedVillage && selectedVillage !== 'all') {
          return t.village_id === selectedVillage || t.village_name === selectedVillage
        }
        // Filter by village ID or name
        return villageIds.has(t.village_id) || 
               (t.village_name && villageNames.has(String(t.village_name).toLowerCase()))
      })
      
      const alerts = allAlerts.filter(a => {
        if (selectedVillage && selectedVillage !== 'all') {
          return a.village_id === selectedVillage
        }
        return villageIds.has(a.village_id)
      })
      
      const tickets = allTickets.filter(t => {
        if (selectedVillage && selectedVillage !== 'all') {
          return t.village_id === selectedVillage
        }
        return villageIds.has(t.village_id)
      })

      console.log(`[Mandal Dashboard] Data fetched - Raw Telemetry: ${allTelemetry.length}, Filtered Telemetry: ${telemetry.length}`)
      console.log(`[Mandal Dashboard] Data fetched - Raw Alerts: ${allAlerts.length}, Filtered Alerts: ${alerts.length}`)
      console.log(`[Mandal Dashboard] Data fetched - Raw Tickets: ${allTickets.length}, Filtered Tickets: ${tickets.length}`)
      console.log(`[Mandal Dashboard] Villages to filter by: ${villagesToUse.length}`)
      console.log(`[Mandal Dashboard] Final filtered data - Telemetry: ${telemetry.length}, Alerts: ${alerts.length}, Tickets: ${tickets.length}`)

      // Calculate aggregated stats
      let avgPressure, avgFlow, avgPH
      if (statsData && (statsData.avg_pressure !== null && statsData.avg_pressure !== undefined)) {
        avgPressure = typeof statsData.avg_pressure === 'number' 
          ? statsData.avg_pressure.toFixed(2) 
          : (parseFloat(statsData.avg_pressure) || 0).toFixed(2)
        avgFlow = typeof statsData.avg_flow === 'number' 
          ? statsData.avg_flow.toFixed(2) 
          : (parseFloat(statsData.avg_flow) || 0).toFixed(2)
        avgPH = statsData.avg_ph !== null && statsData.avg_ph !== undefined
          ? (typeof statsData.avg_ph === 'number' ? statsData.avg_ph.toFixed(2) : parseFloat(statsData.avg_ph).toFixed(2))
          : null
      } else {
        // Calculate from telemetry
        const pressures = telemetry
          .filter(t => t.pressure != null && t.pressure !== '')
          .map(t => {
          const val = typeof t.pressure === 'string' ? parseFloat(t.pressure) : t.pressure
          return isNaN(val) ? 0 : val
          })
          .filter(v => v > 0)
        const flows = telemetry
          .filter(t => t.flow_rate != null && t.flow_rate !== '')
          .map(t => {
          const val = typeof t.flow_rate === 'string' ? parseFloat(t.flow_rate) : t.flow_rate
          return isNaN(val) ? 0 : val
          })
          .filter(v => v > 0)
        const phValues = telemetry
          .filter(t => (t.ph != null && t.ph !== '') || (t.metadata?.ph != null && t.metadata?.ph !== ''))
          .map(t => {
          const val = parseFloat(t.ph || t.metadata?.ph || 0)
          return isNaN(val) ? null : val
          })
          .filter(v => v != null)

        avgPressure = pressures.length > 0 
          ? (pressures.reduce((a, b) => a + b, 0) / pressures.length).toFixed(2) 
          : '0'
        avgFlow = flows.length > 0 
          ? (flows.reduce((a, b) => a + b, 0) / flows.length).toFixed(2) 
          : '0'
        avgPH = phValues.length > 0 
          ? (phValues.reduce((a, b) => a + b, 0) / phValues.length).toFixed(2) 
          : null
      }

      // Calculate water quality
      let waterQuality = null
      if (statsData && statsData.water_quality) {
        waterQuality = statsData.water_quality
      } else if (telemetry.length > 0) {
        const latestWithQuality = telemetry.find((reading) => reading.metadata?.water_quality)
        if (latestWithQuality) {
          waterQuality = latestWithQuality.metadata.water_quality
        } else if (avgPH !== null) {
          // Calculate from average values
          const avgTurbidity = telemetry
            .filter(t => t.turbidity != null && t.turbidity !== '')
            .map(t => typeof t.turbidity === 'string' ? parseFloat(t.turbidity) : t.turbidity)
            .filter(v => !isNaN(v) && v > 0)
          const avgTemp = telemetry
            .filter(t => t.temperature != null && t.temperature !== '')
            .map(t => typeof t.temperature === 'string' ? parseFloat(t.temperature) : t.temperature)
            .filter(v => !isNaN(v))

          const turbidityAvg = avgTurbidity.length > 0 
            ? avgTurbidity.reduce((a, b) => a + b, 0) / avgTurbidity.length 
            : null
          const tempAvg = avgTemp.length > 0 
            ? avgTemp.reduce((a, b) => a + b, 0) / avgTemp.length 
            : null
          
          if (turbidityAvg !== null && avgPH !== null && tempAvg !== null) {
            const wqi = Math.round(
              (100 - (Math.min(turbidityAvg / 50, 1) * 100)) * 0.3 +
              (100 - (Math.abs(parseFloat(avgPH) - 7.4) / 3 * 100)) * 0.3 +
              (100 - (Math.min(Math.abs(tempAvg - 25) / 25, 1) * 100)) * 0.2 +
              20
            )
            const status = wqi >= 80 ? 'good' : wqi >= 60 ? 'average' : 'poor'
            const indicator = status === 'good' ? '✅' : status === 'average' ? '⚠️' : '❌'
            waterQuality = {
              wqi,
              status,
              indicator,
              message: status === 'good' 
                ? 'Water quality is good and safe for supply.' 
                : status === 'average' 
                ? 'Water quality is acceptable' 
                : 'Water quality needs attention'
            }
          }
        }
      }

      // Filter telemetry by selected village if needed
      let filteredTelemetry = telemetry
      if (selectedVillage !== 'all') {
        filteredTelemetry = telemetry.filter(t => {
          if (t.village_id === selectedVillage) return true
          const villageName = villagesToUse.find(v => (v.id || v.name) === selectedVillage)?.name?.toLowerCase()
          if (villageName && t.village_name) {
            return t.village_name.toLowerCase().includes(villageName) || 
                   villageName.includes(t.village_name.toLowerCase())
          }
          return false
        })
      }

      // Prepare chart data
      const recentReadings = filteredTelemetry
        .slice(0, 20)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .reverse()
        .map(reading => {
          const timestamp = new Date(reading.timestamp)
          return {
            ...reading,
            timestamp: timestamp.toISOString(),
            timestampFormatted: timestamp.toLocaleString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              hour: '2-digit', 
              minute: '2-digit'
            }),
            pressure: reading.pressure != null 
              ? (typeof reading.pressure === 'string' ? parseFloat(reading.pressure) : reading.pressure) 
              : null,
            flow_rate: reading.flow_rate != null 
              ? (typeof reading.flow_rate === 'string' ? parseFloat(reading.flow_rate) : reading.flow_rate) 
              : null,
          }
        })
      
      setLiveData(recentReadings)

      // Calculate village count (filtered if village selected)
      const villageCount = selectedVillage !== 'all' ? 1 : villagesToUse.length

      // Calculate total devices from telemetry if stats API doesn't provide it
      let totalDevices = statsData?.total_devices || 0
      if (totalDevices === 0 && telemetry.length > 0) {
        // Count unique device IDs in telemetry
        const uniqueDeviceIds = new Set(
          telemetry
            .map(t => t.device_id || t.sensor_id)
            .filter(id => id != null && id !== '')
        )
        totalDevices = uniqueDeviceIds.size
        console.log(`[Mandal Dashboard] Calculated totalDevices from telemetry: ${totalDevices} unique devices`)
      }

      console.log(`[Mandal Dashboard] Final stats - Villages: ${villageCount}, Devices: ${totalDevices}, Alerts: ${alerts.length}, Tickets: ${tickets.length}`)
      console.log(`[Mandal Dashboard] Averages - Pressure: ${avgPressure}, Flow: ${avgFlow}, pH: ${avgPH}`)

      // Update stats
      setStats({
        totalVillages: villageCount,
        totalDevices: totalDevices,
        activeAlerts: alerts.length,
        openTickets: tickets.length,
        avgPressure,
        avgFlow,
        avgPH,
        waterQuality
      })

      // Reset "Last Sync" timer
      setLastSyncSeconds(0)
    } catch (error) {
      console.error('[Mandal Dashboard] Failed to fetch data:', error)
      console.error('[Mandal Dashboard] Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      })
      toast.error('Failed to load dashboard data. Please check console for details.')
    } finally {
      setLoading(false)
      }
  }, [selectedDistrict, userMandal, selectedVillage])
  
  // Auto-set district to Srikakulam if not found after a delay
  useEffect(() => {
    if (!selectedDistrict && userMandal) {
      const timer = setTimeout(() => {
        if (!selectedDistrict) {
          console.log('[Mandal Dashboard] Auto-setting district to Srikakulam')
          setSelectedDistrict('Srikakulam')
        }
      }, 2000) // Wait 2 seconds for district finding to complete
      return () => clearTimeout(timer)
    }
  }, [selectedDistrict, userMandal])

  // Set up data fetching interval
  const fetchDataRef = useRef(fetchData)
  useEffect(() => {
    fetchDataRef.current = fetchData
  }, [fetchData])

  useEffect(() => {
    // Set selectedDistrict to Srikakulam if empty (so it persists)
    if (!selectedDistrict) {
      setSelectedDistrict('Srikakulam')
      return // Wait for district to be set, then this effect will run again
    }

    // Initial fetch (will use default district 'Srikakulam' if selectedDistrict is empty)
    fetchDataRef.current()
    
    // Set up polling interval (every 10 seconds)
    const fetchInterval = setInterval(() => {
      fetchDataRef.current()
    }, 10000)

    // Set up timer interval (every 1 second for last sync display)
    const timerInterval = setInterval(() => {
      setLastSyncSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      clearInterval(fetchInterval)
      clearInterval(timerInterval)
    }
  }, [selectedDistrict])
  
  // Also trigger fetch when userMandal is first available
  useEffect(() => {
    // Always set district if empty, regardless of userMandal
    if (!selectedDistrict) {
      setSelectedDistrict('Srikakulam')
    }
  }, [])

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

  const formatVillageName = (name) => {
    if (!name) return ''
    try {
      return String(name)
        .trim()
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(word => {
          if (!word || word.length === 0) return ''
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        })
        .filter(word => word.length > 0)
        .join(' ') || name
    } catch (error) {
      console.error('Error formatting village name:', error)
      return name
    }
  }

  // Generate sparkline data
  const sparklineData = liveData.slice(-10).map(d => ({
    value: d.pressure || 0
  }))

  // Default to Srikakulam if district not found yet
  const displayDistrict = selectedDistrict || 'Srikakulam'

  if (loading && !selectedDistrict) {
    return (
      <div className="dashboard">
        <div className="page-header">
          <h1>Mandal Dashboard</h1>
          <p className="page-subtitle">Loading data for {userMandal}...</p>
        </div>
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Please wait while we load your mandal data...</p>
        </div>
      </div>
    )
  }

  // Show loading only if we're still finding district and don't have mandal
  if (loading && !selectedDistrict && !userMandal) {
    return (
      <div className="dashboard">
        <div className="page-header">
          <h1>Mandal Dashboard</h1>
          <p className="page-subtitle">Loading data...</p>
        </div>
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Please wait while we load your mandal data...</p>
        </div>
      </div>
    )
  }

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
        <div>
        <h1>Mandal Dashboard</h1>
        {villages.length > 0 && (
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#666', marginBottom: '0.25rem' }}>Filter by Village</label>
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
              {selectedVillage !== 'all' && (
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    onClick={() => setSelectedVillage('all')}
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
                    Clear Filter
                  </button>
          </div>
        )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
          <h3>Total Villages</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)' }}>
              🏘️
            </div>
          </div>
          <div className="kpi-value">{stats.totalVillages || 0}</div>
          <div className="kpi-sparkline">
            <ResponsiveContainer width="100%" height={30}>
              <LineChart data={sparklineData}>
                <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <h3>Total Devices</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
              📱
            </div>
          </div>
          <div className="kpi-value">{stats.totalDevices || 0}</div>
          <div className="kpi-trend">Active sensors</div>
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
          <h3>Open Issues</h3>
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

      {/* Village Summary Section */}
      {villages.length > 0 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header">
            <h3>Villages in {selectedDistrict || 'Srikakulam'}</h3>
            <span className="card-badge">{villages.length} {villages.length === 1 ? 'village' : 'villages'}</span>
          </div>
          <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {villages.map((village, idx) => (
              <div key={village.id || idx} style={{ 
                padding: '0.75rem', 
                background: '#f8f9fa', 
                borderRadius: '8px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ fontWeight: '600', color: '#1e293b' }}>
                  {formatVillageName(village.name)}
                    </div>
                    </div>
            ))}
          </div>
        </div>
      )}

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
                const deviceVillage = reading.village_name 
                  ? formatVillageName(reading.village_name) 
                  : (reading.village_id ? `Village ${reading.village_id}` : 'N/A')
                  
                  return (
                    <tr key={reading.id}>
                      <td>{new Date(reading.timestamp).toLocaleString()}</td>
                      <td>{reading.device_id}</td>
                      <td>{deviceVillage}</td>
                    <td>{formatNumber(reading.pressure, 3)} bar</td>
                    <td>{formatNumber(reading.flow_rate, 2)} L/min</td>
                    <td>{formatNumber(reading.ph || reading.metadata?.ph, 3)}</td>
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
