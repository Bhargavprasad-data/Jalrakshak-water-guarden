import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'

const toRadians = (value) => (value * Math.PI) / 180

const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000 // Earth radius in meters
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function useNearestVillage() {
  const [locationStatus, setLocationStatus] = useState('pending')
  const [locationError, setLocationError] = useState(null)
  const [userLocation, setUserLocation] = useState(null)
  const [nearestVillage, setNearestVillage] = useState(null)
  const [villageLoading, setVillageLoading] = useState(false)
  const [villageError, setVillageError] = useState(null)
  const [allVillages, setAllVillages] = useState([])
  const [manualVillage, setManualVillage] = useState(null)

  // Fetch all villages for manual selection
  const fetchAllVillages = useCallback(async () => {
    try {
      const response = await axios.get('/api/gis/villages')
      const villages = response.data || []
      setAllVillages(villages)
      return villages
    } catch (error) {
      console.error('Failed to fetch villages:', error)
      setAllVillages([])
      return []
    }
  }, [])

  const resolveNearestVillage = useCallback(async (coords) => {
    if (!coords) return
    try {
      setVillageLoading(true)
      setVillageError(null)
      const villages = allVillages.length > 0 ? allVillages : await fetchAllVillages()
      if (!villages.length) {
        setVillageError('No villages available to match location.')
        return
      }

      let closest = null
      let bestDistance = Infinity
      villages.forEach((village) => {
        if (village.gps_lat == null || village.gps_lon == null) return
        const distance = getDistanceMeters(
          coords.lat,
          coords.lng,
          parseFloat(village.gps_lat),
          parseFloat(village.gps_lon),
        )
        if (distance < bestDistance) {
          bestDistance = distance
          closest = village
        }
      })

      if (!closest) {
        setVillageError('Unable to determine the nearest village for your location.')
        return
      }

      // Only set if no manual village is selected
      if (!manualVillage) {
      setNearestVillage(closest)
      }
    } catch (error) {
      console.error('Failed to resolve nearest village:', error)
      setVillageError('Failed to fetch villages. Please try again.')
    } finally {
      setVillageLoading(false)
    }
  }, [allVillages, fetchAllVillages, manualVillage])

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('denied')
      setLocationError('Geolocation is not supported in this browser.')
      return
    }

    setLocationStatus('pending')
    setLocationError(null)

    // Request current location with high accuracy
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }
        setUserLocation(newLocation)
        setLocationStatus('granted')
        console.log('Location updated:', newLocation)
      },
      (err) => {
        setLocationStatus('denied')
        setLocationError(err.message || 'Location permission denied.')
        console.error('Location error:', err)
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0, // Always get fresh location
      },
    )
  }, [])

  // Request location on mount
  useEffect(() => {
    requestLocation()
  }, [requestLocation])

  // Refresh location periodically (every 5 minutes) to ensure we have current location
  useEffect(() => {
    if (locationStatus !== 'granted') return
    
    const locationRefreshInterval = setInterval(() => {
      console.log('Refreshing location...')
      requestLocation()
    }, 5 * 60 * 1000) // Refresh every 5 minutes

    return () => clearInterval(locationRefreshInterval)
  }, [locationStatus, requestLocation])

  // Resolve nearest village when location is available (only if no manual selection)
  useEffect(() => {
    if (manualVillage) {
      setNearestVillage(manualVillage)
      return
    }
    if (locationStatus !== 'granted' || !userLocation) return
    resolveNearestVillage(userLocation)
  }, [locationStatus, userLocation, resolveNearestVillage, manualVillage])

  // Function to manually select a village
  const selectVillage = useCallback((village) => {
    if (village) {
      setManualVillage(village)
      setNearestVillage(village)
      setVillageError(null)
      console.log('Village manually selected:', village.name)
    } else {
      setManualVillage(null)
      // Re-resolve from GPS if available
      if (userLocation) {
        resolveNearestVillage(userLocation)
      }
    }
  }, [userLocation, resolveNearestVillage])

  // Load villages on mount and auto-select K. Kotturu if available
  useEffect(() => {
    const loadVillages = async () => {
      const villages = await fetchAllVillages()
      // Auto-select K. Kotturu if it exists in the list (only on initial load)
      if (villages.length > 0 && !manualVillage && !nearestVillage) {
        const kotturuVillage = villages.find(v => {
          const name = String(v.name || '').toLowerCase()
          return name.includes('kotturu') || name.includes('k. kotturu') || name === 'k kotturu'
        })
        if (kotturuVillage) {
          console.log('Auto-selecting K. Kotturu village:', kotturuVillage.name)
          setManualVillage(kotturuVillage)
          setNearestVillage(kotturuVillage)
          setVillageError(null)
        }
      }
    }
    loadVillages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const retryVillageLookup = () => {
    if (userLocation) {
      resolveNearestVillage(userLocation)
    }
  }

  return {
    locationStatus,
    locationError,
    requestLocation,
    userLocation,
    nearestVillage,
    villageLoading,
    villageError,
    retryVillageLookup,
    allVillages,
    selectVillage,
    manualVillage,
  }
}

