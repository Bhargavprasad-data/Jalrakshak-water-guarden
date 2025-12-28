import React, { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Dashboard.css'
import useSuperAdminData from '../hooks/useSuperAdminData'

export default function Dashboard() {
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const [loading, setLoading] = useState(true)
  const fetchIntervalRef = useRef(null)
  const fetchOverallStatsRef = useRef(null)
  const [overallStats, setOverallStats] = useState({
    totalDistricts: 0,
    totalMandals: 0,
    totalVillages: 0,
    totalDevices: 0,
    activeAlerts: 0,
    openTickets: 0,
    avgPressure: 0,
    avgFlow: 0,
    avgPH: null,
    waterQuality: null
  })

  // Filter states
  const [selectedDistrict, setSelectedDistrict] = useState('all')
  const [selectedMandal, setSelectedMandal] = useState('all')
  const [selectedVillage, setSelectedVillage] = useState('all')
  const [filteredMandals, setFilteredMandals] = useState([])
  const [filteredVillages, setFilteredVillages] = useState([])

  const {
    districts,
    districtData,
    expandedDistrict,
    expandedMandal,
    toggleDistrict,
    toggleMandal,
    loading: dataLoading,
    error,
    refreshData
  } = useSuperAdminData()

  const fetchOverallStats = useCallback(async () => {
    try {
      // Apply filters - determine which districts/mandals/villages to use
      let districtsToUse = districts
      let districtDataToUse = { ...districtData }
      
      // Filter by selected district
      if (selectedDistrict && selectedDistrict !== 'all') {
        districtsToUse = [selectedDistrict]
      }
      
      // Fetch districts if not available
      if (districts.length === 0) {
        try {
          const districtsRes = await axios.get('/api/admin/districts')
          districtsToUse = (districtsRes.data || []).map(d => d.district || d)
          // Apply district filter if set
          if (selectedDistrict && selectedDistrict !== 'all') {
            districtsToUse = districtsToUse.filter(d => d === selectedDistrict)
          }
        } catch (err) {
          console.error('Failed to fetch districts:', err)
        }
      }
      
      // Fetch villages based on filters
      let allVillages = []
      let allMandalsSet = new Set()
      
      try {
        console.log('[Super-Admin Dashboard] Fetching villages with filters...', { selectedDistrict, selectedMandal, selectedVillage })
        
        // Build API params based on filters
        const villageParams = {}
        if (selectedDistrict && selectedDistrict !== 'all') {
          villageParams.district = selectedDistrict
        }
        if (selectedMandal && selectedMandal !== 'all') {
          villageParams.mandal = selectedMandal
        }
        if (selectedVillage && selectedVillage !== 'all') {
          villageParams.village_id = selectedVillage
        }
        
        const allVillagesRes = await axios.get('/api/admin/villages', { params: villageParams })
        allVillages = allVillagesRes.data || []
        console.log('[Super-Admin Dashboard] Fetched', allVillages.length, 'villages with filters')
      } catch (err) {
        console.error('[Super-Admin Dashboard] Failed to fetch villages:', err)
        console.error('[Super-Admin Dashboard] Error details:', err.response?.data || err.message)
      }
      
      // PRIMARY METHOD: Fetch mandals based on filters
      try {
        console.log('[Super-Admin Dashboard] Fetching mandals with filters...')
        
        // Build API params based on district filter
        const mandalParams = {}
        if (selectedDistrict && selectedDistrict !== 'all') {
          mandalParams.district = selectedDistrict
        }
        
        const allMandalsRes = await axios.get('/api/admin/mandals', { params: mandalParams })
        const allMandalsRaw = allMandalsRes.data || []
        console.log('[Super-Admin Dashboard] Raw mandals API response:', allMandalsRaw)
        
        if (Array.isArray(allMandalsRaw) && allMandalsRaw.length > 0) {
        allMandalsRaw.forEach(m => {
            // Backend returns: {mandal: "name", village_count: number}
            const mandalName = m.mandal || m.name || m
            
            // Apply mandal filter if set
            if (selectedMandal && selectedMandal !== 'all') {
              if (String(mandalName).trim().toLowerCase() !== selectedMandal.toLowerCase()) {
                return // Skip this mandal if it doesn't match filter
              }
            }
            
            if (mandalName && String(mandalName).trim() !== '') {
              allMandalsSet.add(String(mandalName).trim())
          }
        })
          console.log('[Super-Admin Dashboard] Added', allMandalsSet.size, 'mandals from filtered API call')
        } else {
          console.warn('[Super-Admin Dashboard] Mandals API call returned empty or invalid data')
        }
      } catch (err) {
        console.error('[Super-Admin Dashboard] Error fetching mandals from API:', err)
        console.error('[Super-Admin Dashboard] Error details:', err.response?.data || err.message)
      }
      
      // SECONDARY METHOD: Extract mandals from villages data (already filtered)
      if (allVillages.length > 0) {
        let mandalsFromVillages = 0
        allVillages.forEach(village => {
          const mandalName = village.mandal || (village.metadata && village.metadata.mandal) || ''
          
          // Apply mandal filter if set
          if (selectedMandal && selectedMandal !== 'all') {
            if (String(mandalName).trim().toLowerCase() !== selectedMandal.toLowerCase()) {
              return // Skip this village if mandal doesn't match filter
            }
          }
          
          if (mandalName && String(mandalName).trim() !== '') {
            const beforeSize = allMandalsSet.size
            allMandalsSet.add(String(mandalName).trim())
            if (allMandalsSet.size > beforeSize) {
              mandalsFromVillages++
            }
          }
        })
        console.log('[Super-Admin Dashboard] Added', mandalsFromVillages, 'new mandals from filtered villages data. Total:', allMandalsSet.size)
      }
      
      // TERTIARY METHOD: Fetch mandals per district (only if no mandal filter is set)
      if (districtsToUse.length > 0 && (!selectedMandal || selectedMandal === 'all')) {
        console.log('[Super-Admin Dashboard] Fetching mandals per district to ensure completeness...')
        const mandalPromises = districtsToUse.map(async (district) => {
          try {
            const mandalsRes = await axios.get(`/api/admin/mandals?district=${encodeURIComponent(district)}`)
            const mandalsRaw = mandalsRes.data || []
            return mandalsRaw.map(m => {
              // Backend returns: {mandal: "name", village_count: number}
              return m.mandal || m.name || m
            }).filter(m => m && String(m).trim() !== '')
          } catch (err) {
            console.error(`[Super-Admin Dashboard] Failed to fetch mandals for ${district}:`, err)
            return []
          }
        })
        
        const mandalResults = await Promise.allSettled(mandalPromises)
        let mandalsFromDistricts = 0
        mandalResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            const mandals = result.value || []
            mandals.forEach(mandal => {
              if (mandal && String(mandal).trim() !== '') {
                const beforeSize = allMandalsSet.size
                allMandalsSet.add(String(mandal).trim())
                if (allMandalsSet.size > beforeSize) {
                  mandalsFromDistricts++
                }
              }
            })
          }
        })
        console.log('[Super-Admin Dashboard] Added', mandalsFromDistricts, 'new mandals from per-district fetch. Total:', allMandalsSet.size)
      }
      
      // Fetch mandals and villages for filtered districts
      if (districtsToUse.length > 0) {
        const districtPromises = districtsToUse.map(async (district) => {
          // Check if we already have data from hook
          const existingData = districtData[district]
          if (existingData && existingData.mandals && existingData.mandals.length > 0 && 
              existingData.villages && existingData.villages.length > 0) {
            // Use existing data if available, but also add mandals to Set
            existingData.mandals.forEach(mandal => {
              const mandalName = typeof mandal === 'string' ? mandal : (mandal.mandal || mandal.name || mandal)
              if (mandalName && String(mandalName).trim() !== '') {
                allMandalsSet.add(String(mandalName).trim())
              }
            })
            return { district, mandals: existingData.mandals, villages: existingData.villages }
          }
          
          // Otherwise fetch fresh data
          try {
            const [mandalsRes, villagesRes] = await Promise.allSettled([
              axios.get(`/api/admin/mandals?district=${encodeURIComponent(district)}`).catch((err) => {
                console.error(`[Super-Admin Dashboard] Failed to fetch mandals for ${district}:`, err.response?.data || err.message)
                return { data: [] }
              }),
              axios.get(`/api/admin/villages?district=${encodeURIComponent(district)}`).catch((err) => {
                console.error(`[Super-Admin Dashboard] Failed to fetch villages for ${district}:`, err.response?.data || err.message)
                return { data: [] }
              })
            ])
            
            const mandalsRaw = mandalsRes.status === 'fulfilled' ? mandalsRes.value.data : []
            const mandals = mandalsRaw.map(m => {
              // Backend returns: {mandal: "name", village_count: number}
              return typeof m === 'string' ? m : (m.mandal || m.name || m)
            }).filter(m => m && String(m).trim() !== '')
            const villages = villagesRes.status === 'fulfilled' ? villagesRes.value.data : []
            
            // Also add these mandals to our Set for counting
            mandals.forEach(mandal => {
              if (mandal && String(mandal).trim() !== '') {
                allMandalsSet.add(String(mandal).trim())
              }
            })
            
            console.log(`[Super-Admin Dashboard] District ${district}:`, mandals.length, 'mandals,', villages.length, 'villages')
            
            return { district, mandals, villages }
          } catch (err) {
            console.error(`[Super-Admin Dashboard] Failed to fetch data for district ${district}:`, err)
            console.error(`[Super-Admin Dashboard] Error details:`, err.response?.data || err.message)
            // Fallback to existing data if available
            const fallbackMandals = existingData?.mandals || []
            // Add fallback mandals to Set
            fallbackMandals.forEach(mandal => {
              const mandalName = typeof mandal === 'string' ? mandal : (mandal.mandal || mandal.name || mandal)
              if (mandalName && String(mandalName).trim() !== '') {
                allMandalsSet.add(String(mandalName).trim())
              }
            })
            return { 
              district, 
              mandals: fallbackMandals, 
              villages: existingData?.villages || [] 
            }
          }
        })
        
        const districtDataResults = await Promise.allSettled(districtPromises)
        districtDataResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            const { district, mandals, villages } = result.value
            districtDataToUse[district] = {
              ...districtDataToUse[district],
              mandals: mandals.length > 0 ? mandals : (districtDataToUse[district]?.mandals || []),
              villages: villages.length > 0 ? villages : (districtDataToUse[district]?.villages || [])
            }
          } else {
            console.error('[Super-Admin Dashboard] District promise failed:', result.reason)
          }
        })
      }

      // Build filter params for alerts, tickets, and telemetry
      const filterParams = {}
      if (selectedDistrict && selectedDistrict !== 'all') {
        filterParams.district = selectedDistrict
      }
      if (selectedMandal && selectedMandal !== 'all') {
        filterParams.mandal = selectedMandal
      }
      if (selectedVillage && selectedVillage !== 'all') {
        filterParams.village_id = selectedVillage
      }

      const [alertsRes, ticketsRes, telemetryRes] = await Promise.allSettled([
        axios.get('/api/alerts', { params: { ...filterParams, acknowledged: false } }).catch(err => ({ data: [] })),
        axios.get('/api/tickets', { params: { ...filterParams, status: 'open' } }).catch(err => ({ data: [] })),
        axios.get('/api/telemetry/live', { params: filterParams }).catch(err => ({ data: [] }))
      ])

      const alerts = alertsRes.status === 'fulfilled' ? alertsRes.value.data : []
      const tickets = ticketsRes.status === 'fulfilled' ? ticketsRes.value.data : []
      const telemetry = telemetryRes.status === 'fulfilled' ? telemetryRes.value.data : []

      let totalMandals = 0
      let totalVillages = 0
      let totalDevices = 0
      let avgPressure = 0
      let avgFlow = 0
      let avgPH = null
      let waterQuality = null

      // Aggregate stats from all districts
      const allStats = []
      
      // Set total villages count
      if (allVillages.length > 0) {
        totalVillages = allVillages.length
      } else {
        // Fallback: count from district data
        districtsToUse.forEach(district => {
          const data = districtDataToUse[district]
          if (data && data.villages && Array.isArray(data.villages)) {
            totalVillages += data.villages.length
          }
        })
      }
      
      // CRITICAL: Final mandals count AFTER all async operations complete
      // Count from all sources to ensure accuracy
      
      // 1. From filtered villages (already filtered by API)
      if (allVillages.length > 0) {
        allVillages.forEach(village => {
          const mandalName = village.mandal || (village.metadata && village.metadata.mandal) || ''
          if (mandalName && String(mandalName).trim() !== '') {
            allMandalsSet.add(String(mandalName).trim())
          }
        })
        console.log('[Super-Admin Dashboard] After counting from filtered villages:', allMandalsSet.size, 'mandals')
      }
      
      // 2. From districtDataToUse (after all district fetches complete) - apply filters
        districtsToUse.forEach(district => {
          const data = districtDataToUse[district]
        if (data) {
          // From mandals array - apply mandal filter if set
          if (data.mandals && Array.isArray(data.mandals)) {
            data.mandals.forEach(mandal => {
              const mandalName = typeof mandal === 'string' ? mandal : (mandal.mandal || mandal.name || mandal)
              
              // Apply mandal filter if set
              if (selectedMandal && selectedMandal !== 'all') {
                if (String(mandalName).trim().toLowerCase() !== selectedMandal.toLowerCase()) {
                  return // Skip if doesn't match filter
                }
              }
              
              if (mandalName && String(mandalName).trim() !== '') {
                allMandalsSet.add(String(mandalName).trim())
              }
            })
          }
          // From villages array in district data - already filtered by API
          if (data.villages && Array.isArray(data.villages)) {
            data.villages.forEach(village => {
              const mandalName = village.mandal || (village.metadata && village.metadata.mandal) || ''
              if (mandalName && String(mandalName).trim() !== '') {
                allMandalsSet.add(String(mandalName).trim())
              }
            })
          }
        }
      })
      console.log('[Super-Admin Dashboard] After counting from filtered districtDataToUse:', allMandalsSet.size, 'mandals')
      
      // 3. Final fallback: from districtData (from hook) if still 0
      if (allMandalsSet.size === 0 && districtData) {
        Object.keys(districtData).forEach(district => {
          const data = districtData[district]
          if (data && data.mandals && Array.isArray(data.mandals)) {
            data.mandals.forEach(mandal => {
              const mandalName = typeof mandal === 'string' ? mandal : (mandal.mandal || mandal.name || mandal)
              if (mandalName && String(mandalName).trim() !== '') {
                allMandalsSet.add(String(mandalName).trim())
              }
            })
          }
        })
        console.log('[Super-Admin Dashboard] After counting from districtData hook:', allMandalsSet.size, 'mandals')
      }
      
      // Set total mandals count from the Set (source of truth)
      totalMandals = allMandalsSet.size
      
      console.log('[Super-Admin Dashboard] ===== FINAL MANDALS COUNT =====')
      console.log('[Super-Admin Dashboard] Total unique mandals:', totalMandals)
      console.log('[Super-Admin Dashboard] Mandals Set size:', allMandalsSet.size)
      console.log('[Super-Admin Dashboard] Mandals list:', Array.from(allMandalsSet).sort())
      console.log('[Super-Admin Dashboard] =================================')
      
      console.log('[Super-Admin Dashboard] Final counts - Districts:', districtsToUse.length, 'Mandals:', totalMandals, 'Villages:', totalVillages)
      
      // Get device stats from districtData
      districtsToUse.forEach(district => {
        const data = districtDataToUse[district]
        if (data && districtData[district]?.stats) {
          totalDevices += districtData[district].stats?.total_devices || 0
          allStats.push(districtData[district].stats)
        }
      })
      
      console.log('[Super-Admin Dashboard] Stats calculated:', {
        districts: districtsToUse.length,
        totalMandals,
        totalVillages,
        totalDevices,
        districtDataToUse
      })

      // Calculate averages from all district stats
      const validPressures = allStats.filter(s => s.avg_pressure != null && s.avg_pressure !== undefined).map(s => parseFloat(s.avg_pressure))
      const validFlows = allStats.filter(s => s.avg_flow != null && s.avg_flow !== undefined).map(s => parseFloat(s.avg_flow))
      const validPHs = allStats.filter(s => s.avg_ph != null && s.avg_ph !== undefined).map(s => parseFloat(s.avg_ph))

      if (validPressures.length > 0) {
        avgPressure = (validPressures.reduce((a, b) => a + b, 0) / validPressures.length).toFixed(2)
      }
      if (validFlows.length > 0) {
        avgFlow = (validFlows.reduce((a, b) => a + b, 0) / validFlows.length).toFixed(2)
      }
      if (validPHs.length > 0) {
        avgPH = (validPHs.reduce((a, b) => a + b, 0) / validPHs.length).toFixed(2)
      }

      // Get water quality from stats or calculate from telemetry
      const statsWithQuality = allStats.find(s => s.water_quality)
      if (statsWithQuality && statsWithQuality.water_quality) {
        waterQuality = statsWithQuality.water_quality
      } else if (telemetry.length > 0) {
        const latestWithQuality = telemetry.find((reading) => reading.metadata?.water_quality)
        if (latestWithQuality) {
          waterQuality = latestWithQuality.metadata.water_quality
        } else {
          // Calculate from telemetry averages
          const avgTurbidity = telemetry
            .filter(t => t.turbidity != null && t.turbidity !== '')
            .map(t => typeof t.turbidity === 'string' ? parseFloat(t.turbidity) : t.turbidity)
            .filter(v => !isNaN(v) && v > 0)
          const avgTemp = telemetry
            .filter(t => t.temperature != null && t.temperature !== '')
            .map(t => typeof t.temperature === 'string' ? parseFloat(t.temperature) : t.temperature)
            .filter(v => !isNaN(v))
          const avgCond = telemetry
            .filter(t => t.conductivity != null && t.conductivity !== '')
            .map(t => typeof t.conductivity === 'string' ? parseFloat(t.conductivity) : t.conductivity)
            .filter(v => !isNaN(v))
          
          const turbidityAvg = avgTurbidity.length > 0 ? avgTurbidity.reduce((a, b) => a + b, 0) / avgTurbidity.length : null
          const tempAvg = avgTemp.length > 0 ? avgTemp.reduce((a, b) => a + b, 0) / avgTemp.length : null
          const condAvg = avgCond.length > 0 ? avgCond.reduce((a, b) => a + b, 0) / avgCond.length : null
          
          if (turbidityAvg !== null && avgPH !== null && tempAvg !== null) {
            const wqi = Math.round(
              (100 - (Math.min(turbidityAvg / 50, 1) * 100)) * 0.3 +
              (100 - (Math.abs(parseFloat(avgPH) - 7.4) / 3 * 100)) * 0.3 +
              (100 - (Math.min(Math.abs(tempAvg - 25) / 25, 1) * 100)) * 0.2 +
              (condAvg !== null ? 20 : 0)
            )
            const status = wqi >= 80 ? 'good' : wqi >= 60 ? 'average' : 'poor'
            const indicator = status === 'good' ? '✅' : status === 'average' ? '⚠️' : '❌'
            waterQuality = {
              wqi,
              status,
              indicator,
              message: status === 'good' ? 'Water quality is good' : status === 'average' ? 'Water quality is acceptable' : 'Water quality needs attention'
            }
          }
        }
      }

      // Final verification before setting state - ensure totalMandals is correct
      // Use allMandalsSet.size as the source of truth
      const finalMandalsCount = allMandalsSet.size > 0 ? allMandalsSet.size : totalMandals
      
      console.log('[Super-Admin Dashboard] ===== SETTING STATE =====')
      console.log('[Super-Admin Dashboard] totalMandals variable:', totalMandals)
      console.log('[Super-Admin Dashboard] allMandalsSet.size:', allMandalsSet.size)
      console.log('[Super-Admin Dashboard] finalMandalsCount (will be used):', finalMandalsCount)
      console.log('[Super-Admin Dashboard] totalDevices:', totalDevices)
      console.log('[Super-Admin Dashboard] ============================')

      setOverallStats({
        totalDistricts: districtsToUse.length,
        totalMandals: finalMandalsCount, // Use Set size as source of truth to prevent mix-ups
        totalVillages,
        totalDevices,
        activeAlerts: alerts.length,
        openTickets: tickets.length,
        avgPressure,
        avgFlow,
        avgPH,
        waterQuality
      })
      
      // Reset Last Sync timer on successful fetch
      setLastSyncSeconds(0)
    } catch (error) {
      console.error('Failed to fetch overall stats:', error)
    } finally {
      setLoading(false)
    }
  }, [districts, districtData, refreshData, selectedDistrict, selectedMandal, selectedVillage])

  // Keep ref updated with latest fetchOverallStats function
  useEffect(() => {
    fetchOverallStatsRef.current = fetchOverallStats
  }, [fetchOverallStats])

  // Set up timer interval separately - ONLY for UI display, does NOT fetch data
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setLastSyncSeconds((prev) => prev + 1)
    }, 1000) // 1 second - ONLY for timer display, NOT for data fetching

    return () => {
      clearInterval(timerInterval)
    }
  }, []) // Empty dependency array - timer runs independently

  // Data fetching interval - ONLY fetches data every 10 seconds
  // Set up interval ONCE on mount, use ref to call latest function
  useEffect(() => {
    // Initial fetch
    fetchOverallStats()
    
    // Set up polling interval (every 10 seconds) - NO data fetching before this
    // Use ref to call latest function, so interval doesn't need to be recreated
    fetchIntervalRef.current = setInterval(() => {
      if (fetchOverallStatsRef.current) {
        fetchOverallStatsRef.current()
      }
    }, 10000) // 10 seconds - this is the ONLY place data is fetched automatically

    return () => {
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current)
        fetchIntervalRef.current = null
      }
    }
  }, []) // Empty dependency array - interval set up once and never reset

  // Refresh district data periodically
  useEffect(() => {
    if (!dataLoading && districts.length > 0 && refreshData) {
      const refreshInterval = setInterval(() => {
        // Refresh all district data
        refreshData()
      }, 30000) // Refresh every 30 seconds

      return () => clearInterval(refreshInterval)
    }
  }, [dataLoading, districts, refreshData])

  // Fetch mandals when district is selected
  useEffect(() => {
    if (selectedDistrict && selectedDistrict !== 'all') {
      const fetchMandals = async () => {
        try {
          const mandalsRes = await axios.get(`/api/admin/mandals?district=${encodeURIComponent(selectedDistrict)}`)
          const mandalsList = (mandalsRes.data || []).map(m => m.mandal || m).filter(m => m)
          setFilteredMandals(mandalsList)
        } catch (err) {
          console.error('Failed to fetch mandals:', err)
          setFilteredMandals([])
        }
      }
      fetchMandals()
      setSelectedMandal('all') // Reset mandal when district changes
      setSelectedVillage('all') // Reset village when district changes
    } else {
      setFilteredMandals([])
      setSelectedMandal('all')
      setSelectedVillage('all')
    }
  }, [selectedDistrict])

  // Fetch villages when mandal is selected
  useEffect(() => {
    if (selectedMandal && selectedMandal !== 'all' && selectedDistrict && selectedDistrict !== 'all') {
      const fetchVillages = async () => {
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
      fetchVillages()
      setSelectedVillage('all') // Reset village when mandal changes
    } else if (selectedDistrict && selectedDistrict !== 'all') {
      // If only district is selected, get all villages in that district
      const fetchVillages = async () => {
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
      fetchVillages()
      setSelectedVillage('all')
    } else {
      setFilteredVillages([])
      setSelectedVillage('all')
    }
  }, [selectedMandal, selectedDistrict])

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
      return name
    }
  }

  if (dataLoading || loading) {
    return <div className="loading">Loading SuperAdmin dashboard...</div>
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'red' }}>Error: {error}</p>
          <button onClick={refreshData} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
            Retry
          </button>
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
        <h1>SuperAdmin Dashboard</h1>
        <p className="page-subtitle">Complete overview of all districts, mandals, and villages</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
            <label style={{ marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem', color: '#374151' }}>
              District
            </label>
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem',
                backgroundColor: '#fff',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              <option value="all">All Districts</option>
              {districts.map(district => (
                <option key={district} value={district}>{district}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
            <label style={{ marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem', color: '#374151' }}>
              Mandal
            </label>
            <select
              value={selectedMandal}
              onChange={(e) => setSelectedMandal(e.target.value)}
              disabled={selectedDistrict === 'all'}
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem',
                backgroundColor: selectedDistrict === 'all' ? '#f3f4f6' : '#fff',
                cursor: selectedDistrict === 'all' ? 'not-allowed' : 'pointer',
                width: '100%',
                opacity: selectedDistrict === 'all' ? 0.6 : 1
              }}
            >
              <option value="all">All Mandals</option>
              {filteredMandals.map(mandal => (
                <option key={mandal} value={mandal}>{mandal}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
            <label style={{ marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem', color: '#374151' }}>
              Village
            </label>
            <select
              value={selectedVillage}
              onChange={(e) => setSelectedVillage(e.target.value)}
              disabled={selectedDistrict === 'all'}
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem',
                backgroundColor: selectedDistrict === 'all' ? '#f3f4f6' : '#fff',
                cursor: selectedDistrict === 'all' ? 'not-allowed' : 'pointer',
                width: '100%',
                opacity: selectedDistrict === 'all' ? 0.6 : 1
              }}
            >
              <option value="all">All Villages</option>
              {filteredVillages.map(village => (
                <option key={village.id || village.name} value={village.id || village.name}>
                  {village.name}
                </option>
              ))}
            </select>
          </div>

          {(selectedDistrict !== 'all' || selectedMandal !== 'all' || selectedVillage !== 'all') && (
            <div style={{ display: 'flex', alignItems: 'flex-end', marginLeft: 'auto' }}>
              <button
                onClick={() => {
                  setSelectedDistrict('all')
                  setSelectedMandal('all')
                  setSelectedVillage('all')
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#fff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '500'
                }}
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Overall KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <h3>Total Districts</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)' }}>
              🗺️
            </div>
          </div>
          <div className="kpi-value">{overallStats.totalDistricts}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <h3>Total Mandals</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)' }}>
              📡
            </div>
          </div>
          <div className="kpi-value">{overallStats.totalMandals}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <h3>Total Villages</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)' }}>
              🏘️
            </div>
          </div>
          <div className="kpi-value">{overallStats.totalVillages}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <h3>Total Devices</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)' }}>
              📱
            </div>
          </div>
          <div className="kpi-value">{overallStats.totalDevices}</div>
        </div>

        <div className="kpi-card kpi-alert">
          <div className="kpi-header">
            <h3>Active Alerts</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)' }}>
              🚨
            </div>
          </div>
          <div className="kpi-value">{overallStats.activeAlerts}</div>
        </div>

        <div className="kpi-card kpi-warning">
          <div className="kpi-header">
            <h3>Open Tickets</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #facc15 0%, #fbbf24 100%)' }}>
              🎫
            </div>
          </div>
          <div className="kpi-value">{overallStats.openTickets}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <h3>Avg Pressure</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)' }}>
              💧
            </div>
          </div>
          <div className="kpi-value">{overallStats.avgPressure || '0'} <span className="kpi-unit">bar</span></div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <h3>Avg Flow Rate</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)' }}>
              🌊
            </div>
          </div>
          <div className="kpi-value">{overallStats.avgFlow || '0'} <span className="kpi-unit">L/min</span></div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <h3>Avg pH</h3>
            <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)' }}>
              🧪
            </div>
          </div>
          <div className="kpi-value">{overallStats.avgPH || 'N/A'}</div>
          <div className="kpi-trend">Optimal range: 6.5-8.5</div>
        </div>

        <div className={`kpi-card kpi-water-quality ${overallStats.waterQuality ? `kpi-${overallStats.waterQuality.status}` : ''}`}>
          <div className="kpi-header">
            <h3>Water Quality</h3>
            <div className="kpi-icon" style={{ 
              background: overallStats.waterQuality?.status === 'good' 
                ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
                : overallStats.waterQuality?.status === 'average'
                ? 'linear-gradient(135deg, #facc15 0%, #fbbf24 100%)'
                : 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)'
            }}>
              {overallStats.waterQuality?.indicator || '❓'}
            </div>
          </div>
          {overallStats.waterQuality ? (
            <>
              <div className="kpi-value">
                {overallStats.waterQuality.indicator} {overallStats.waterQuality.status.toUpperCase()}
              </div>
              <div className="kpi-subtitle">
                WQI: {overallStats.waterQuality.wqi} • {overallStats.waterQuality.message}
              </div>
            </>
          ) : (
            <div className="kpi-value">No data</div>
          )}
        </div>
      </div>

      {/* Districts with Drill-down */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-header">
          <h3>
            {selectedDistrict === 'all' 
              ? 'All Districts' 
              : selectedMandal === 'all'
              ? `Mandals in ${selectedDistrict}`
              : selectedVillage === 'all'
              ? `Villages in ${selectedMandal}, ${selectedDistrict}`
              : 'Filtered View'}
          </h3>
          <span className="card-badge">
            {selectedDistrict === 'all' 
              ? `${districts.length} districts` 
              : selectedMandal === 'all'
              ? `${filteredMandals.length} mandals`
              : `${filteredVillages.length} villages`}
          </span>
        </div>
        <div style={{ marginTop: '1rem' }}>
          {(selectedDistrict === 'all' ? districts : [selectedDistrict])
            .filter(district => {
              // Filter districts based on selections
              if (selectedDistrict !== 'all' && district !== selectedDistrict) return false
              return true
            })
            .map(district => {
            const data = districtData[district] || {}
            const isExpanded = expandedDistrict === district
            
            // Filter mandals based on selection - use filteredMandals if available
            let mandalsToShow = data.mandals || []
            if (selectedMandal !== 'all' && selectedDistrict === district) {
              mandalsToShow = mandalsToShow.filter(m => {
                const mName = typeof m === 'string' ? m : (m.mandal || m.name || m)
                return String(mName).trim().toLowerCase() === selectedMandal.toLowerCase()
              })
            }
            
            // Filter villages based on selection - use filteredVillages if available (already filtered by API)
            let villagesToShow = data.villages || []
            
            // If we have filteredVillages from API, use those (they're already filtered)
            if (selectedDistrict === district && filteredVillages.length > 0 && (selectedMandal !== 'all' || selectedVillage !== 'all')) {
              villagesToShow = filteredVillages
            } else if (selectedVillage !== 'all' && selectedDistrict === district) {
              // Filter by specific village
              villagesToShow = villagesToShow.filter(v => {
                const vId = v.id || v.name
                return String(vId) === String(selectedVillage)
              })
            } else if (selectedMandal !== 'all' && selectedDistrict === district) {
              // Filter by mandal
              villagesToShow = villagesToShow.filter(v => {
                const vMandal = v.mandal || (v.metadata && v.metadata.mandal) || ''
                return String(vMandal).trim().toLowerCase() === selectedMandal.toLowerCase()
              })
            }
            
            return (
              <div key={district} style={{ marginBottom: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div 
                  onClick={() => toggleDistrict(district)}
                  style={{ 
                    padding: '1rem', 
                    background: isExpanded ? '#f8fafc' : '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none'
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.2rem' }}>{district}</h4>
                    <p style={{ margin: '0.5rem 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                      {selectedMandal === 'all' ? (data.mandals?.length || 0) : mandalsToShow.length} mandals • {villagesToShow.length} villages • {data.stats?.total_devices || 0} devices
                    </p>
                  </div>
                  <span style={{ fontSize: '1.5rem' }}>{isExpanded ? '▼' : '▶'}</span>
                </div>
                {isExpanded && mandalsToShow.length > 0 && (
                  <div style={{ padding: '1rem', background: '#f8fafc' }}>
                    {mandalsToShow.map(mandal => {
                      const isMandalExpanded = expandedMandal === `${district}-${mandal}`
                      let mandalVillages = data.villagesByMandal?.[mandal] || []
                      
                      // Filter villages for this mandal based on village selection
                      if (selectedVillage !== 'all') {
                        mandalVillages = mandalVillages.filter(v => (v.id || v.name) === selectedVillage)
                      }
                      
                      return (
                        <div key={mandal} style={{ marginBottom: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                          <div
                            onClick={() => toggleMandal(`${district}-${mandal}`)}
                            style={{
                              padding: '0.75rem',
                              background: isMandalExpanded ? '#fff' : '#f8fafc',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <strong>{mandal}</strong>
                              <span style={{ marginLeft: '1rem', color: '#64748b', fontSize: '0.9rem' }}>
                                {mandalVillages.length} villages
                              </span>
                            </div>
                            <span>{isMandalExpanded ? '▼' : '▶'}</span>
                          </div>
                          {isMandalExpanded && mandalVillages.length > 0 && (
                            <div style={{ padding: '0.75rem', background: '#fff' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                                {mandalVillages.map(village => (
                                  <div key={village.id} style={{ padding: '0.5rem', background: '#f8fafc', borderRadius: '4px', fontSize: '0.9rem' }}>
                                    {formatVillageName(village.name)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {selectedDistrict !== 'all' && selectedMandal !== 'all' && selectedVillage !== 'all' && filteredVillages.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              No villages found matching the selected filters.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

