import { useState, useEffect } from 'react'
import axios from 'axios'

export default function useDistrictSelector() {
  const [districts, setDistricts] = useState([])
  const [mandals, setMandals] = useState([])
  const [villages, setVillages] = useState([])
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch districts on mount
  useEffect(() => {
    fetchDistricts()
  }, [])

  // Fetch mandals and villages when district changes
  useEffect(() => {
    if (selectedDistrict) {
      fetchMandals(selectedDistrict)
      fetchVillages(selectedDistrict)
    } else {
      setMandals([])
      setVillages([])
    }
  }, [selectedDistrict])

  const fetchDistricts = async () => {
    try {
      setLoading(true)
      const response = await axios.get('/api/admin/districts')
      const districtsList = (response.data || []).map(d => d.district || d)
      setDistricts(districtsList)
      // Auto-select first district if available
      if (districtsList.length > 0) {
        // Use functional update to ensure we get the latest state
        setSelectedDistrict(prev => prev || districtsList[0])
      }
    } catch (error) {
      console.error('Failed to fetch districts:', error)
      setError('Failed to load districts')
    } finally {
      setLoading(false)
    }
  }

  const fetchMandals = async (district) => {
    try {
      const response = await axios.get(`/api/admin/mandals?district=${encodeURIComponent(district)}`)
      const mandalsList = (response.data || []).map(m => m.mandal || m)
      setMandals(mandalsList)
    } catch (error) {
      console.error('Failed to fetch mandals:', error)
      setError('Failed to load mandals')
    }
  }

  const fetchVillages = async (district) => {
    try {
      const response = await axios.get(`/api/admin/villages?district=${encodeURIComponent(district)}`)
      setVillages(response.data || [])
    } catch (error) {
      console.error('Failed to fetch villages:', error)
      setError('Failed to load villages')
    }
  }

  return {
    districts,
    mandals,
    villages,
    selectedDistrict,
    setSelectedDistrict,
    loading,
    error
  }
}

