import { useState, useEffect } from 'react'
import axios from 'axios'

export default function useSuperAdminData() {
  const [districts, setDistricts] = useState([])
  const [districtData, setDistrictData] = useState({}) // { district: { mandals: [], villages: [], stats: {} } }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedDistrict, setExpandedDistrict] = useState(null)
  const [expandedMandal, setExpandedMandal] = useState(null)

  useEffect(() => {
    fetchAllDistricts()
  }, [])

  const fetchAllDistricts = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await axios.get('/api/admin/districts')
      const districtsList = (response.data || []).map(d => d.district || d)
      setDistricts(districtsList)
      
      // Fetch data for each district in parallel for better performance
      const districtPromises = districtsList.map(district => fetchDistrictData(district))
      await Promise.allSettled(districtPromises)
    } catch (error) {
      console.error('Failed to fetch districts:', error)
      setError('Failed to load districts')
    } finally {
      setLoading(false)
    }
  }

  const fetchDistrictData = async (district) => {
    try {
      // Normalize district name (Vizag -> Visakhapatnam)
      const normalizedDistrict = district === 'Vizag' ? 'Visakhapatnam' : district
      
      // Fetch mandals and villages for this district
      const [mandalsRes, villagesRes, statsRes] = await Promise.allSettled([
        axios.get(`/api/admin/mandals?district=${encodeURIComponent(district)}`),
        axios.get(`/api/admin/villages?district=${encodeURIComponent(district)}`),
        axios.get(`/api/telemetry/stats/summary?district=${encodeURIComponent(district)}`)
      ])

      const mandalsRaw = mandalsRes.status === 'fulfilled' ? mandalsRes.value.data : []
      const mandals = mandalsRaw.map(m => m.mandal || m)
      const villages = villagesRes.status === 'fulfilled' ? villagesRes.value.data : []
      const stats = statsRes.status === 'fulfilled' ? statsRes.value.data : null

      // Group villages by mandal
      const villagesByMandal = {}
      mandals.forEach(mandal => {
        villagesByMandal[mandal] = villages.filter(v => {
          const vMandal = v.mandal || (v.metadata && v.metadata.mandal) || ''
          return vMandal.toLowerCase() === mandal.toLowerCase()
        })
      })

      setDistrictData(prev => ({
        ...prev,
        [district]: {
          mandals,
          villages,
          villagesByMandal,
          stats
        }
      }))
    } catch (error) {
      console.error(`Failed to fetch data for district ${district}:`, error)
    }
  }

  const toggleDistrict = (district) => {
    setExpandedDistrict(expandedDistrict === district ? null : district)
    setExpandedMandal(null) // Reset mandal expansion
  }

  const toggleMandal = (mandal) => {
    setExpandedMandal(expandedMandal === mandal ? null : mandal)
  }

  return {
    districts,
    districtData,
    expandedDistrict,
    expandedMandal,
    toggleDistrict,
    toggleMandal,
    loading,
    error,
    refreshData: fetchAllDistricts
  }
}

