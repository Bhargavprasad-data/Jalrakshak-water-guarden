import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

export default function useMandalSelector() {
  const [districts, setDistricts] = useState([])
  const [mandals, setMandals] = useState([])
  const [villages, setVillages] = useState([])
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const [selectedMandal, setSelectedMandal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch districts on mount
  useEffect(() => {
    fetchDistricts()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch mandals when district changes
  useEffect(() => {
    if (selectedDistrict) {
      fetchMandals(selectedDistrict)
      setVillages([]) // Reset villages
    } else {
      setMandals([])
      setVillages([])
      setSelectedMandal('')
    }
  }, [selectedDistrict])

  // Fetch villages when mandal changes
  useEffect(() => {
    if (selectedDistrict && selectedMandal) {
      fetchVillages(selectedDistrict, selectedMandal)
    } else {
      setVillages([])
    }
  }, [selectedDistrict, selectedMandal])

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
      setLoading(true)
      const response = await axios.get(`/api/admin/mandals?district=${encodeURIComponent(district)}`)
      const mandalsList = (response.data || []).map(m => m.mandal || m)
      setMandals(mandalsList)
      // Auto-select first mandal if available and none selected
      if (mandalsList.length > 0) {
        // Always auto-select first mandal when district changes
        setSelectedMandal(mandalsList[0])
      } else {
        setSelectedMandal('')
      }
    } catch (error) {
      console.error('Failed to fetch mandals:', error)
      setError('Failed to load mandals')
      setMandals([])
      setSelectedMandal('')
    } finally {
      setLoading(false)
    }
  }

  const fetchVillages = async (district, mandal) => {
    try {
      setLoading(true)
      const response = await axios.get(
        `/api/admin/villages?district=${encodeURIComponent(district)}&mandal=${encodeURIComponent(mandal)}`
      )
      setVillages(response.data || [])
    } catch (error) {
      console.error('Failed to fetch villages:', error)
      setError('Failed to load villages')
    } finally {
      setLoading(false)
    }
  }

  return {
    districts,
    mandals,
    villages,
    selectedDistrict,
    selectedMandal,
    setSelectedDistrict,
    setSelectedMandal,
    loading,
    error
  }
}

