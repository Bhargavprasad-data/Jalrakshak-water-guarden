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

  // Function to set default village (Bobbili Kothapeta)
  const setDefaultVillage = useCallback(async () => {
    try {
      setVillageLoading(true)
      setVillageError(null)
      const response = await axios.get('/api/admin/villages')
      const villages = response.data || []
      
      // Find Bobbili Kothapeta village (case-insensitive, handles variations)
      const defaultVillage = villages.find(v => {
        if (!v.name) return false
        const nameLower = v.name.toLowerCase()
        return nameLower.includes('bobbili') && nameLower.includes('kothapeta')
      })
      
      if (defaultVillage) {
        setNearestVillage(defaultVillage)
        setLocationStatus('granted') // Set as granted so dashboard can load
        console.log('Default village set to:', defaultVillage.name)
      } else {
        // If exact match not found, try to get first village from database
        if (villages.length > 0) {
          setNearestVillage(villages[0])
          setLocationStatus('granted')
          console.log('Using first available village:', villages[0].name)
        } else {
          setVillageError('No villages available.')
        }
      }
    } catch (error) {
      console.error('Failed to set default village:', error)
      setVillageError('Failed to load default location.')
    } finally {
      setVillageLoading(false)
    }
  }, [])

  const resolveNearestVillage = useCallback(async (coords) => {
    if (!coords) return
    try {
      setVillageLoading(true)
      setVillageError(null)
      const response = await axios.get('/api/admin/villages')
      const villages = response.data || []
      if (!villages.length) {
        setVillageError('No villages available to match location.')
        // Keep default village if GPS lookup fails
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
        // Keep default village if GPS lookup fails
        return
      }

      // Only update if GPS finds "Bobbili Kothapeta" - otherwise keep default
      const villageNameLower = closest.name ? closest.name.toLowerCase() : ''
      if (villageNameLower.includes('bobbili') && villageNameLower.includes('kothapeta')) {
        setNearestVillage(closest)
        console.log('GPS confirmed Bobbili Kothapeta:', closest.name)
      } else {
        console.log('GPS found different village, keeping default Bobbili Kothapeta. GPS village:', closest.name)
        // Don't override default village - keep "Bobbili Kothapeta"
      }
    } catch (error) {
      console.error('Failed to resolve nearest village:', error)
      setVillageError('Failed to fetch villages. Please try again.')
      // Keep default village on error
    } finally {
      setVillageLoading(false)
    }
  }, [])

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('denied')
      setLocationError('Geolocation is not supported in this browser.')
      return
    }

    setLocationStatus('pending')
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        setLocationStatus('granted')
      },
      (err) => {
        setLocationStatus('denied')
        setLocationError(err.message || 'Location permission denied.')
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    )
  }, [])

  useEffect(() => {
    // Set default village immediately on mount
    setDefaultVillage()
    // Also request location for GPS-based detection
    requestLocation()
  }, [requestLocation, setDefaultVillage])

  useEffect(() => {
    // Only use GPS location if it finds "Bobbili Kothapeta" or if no default village is set
    // This ensures "Bobbili Kothapeta" remains the default
    if (locationStatus !== 'granted' || !userLocation) return
    
    // If we already have a default village set, only override if GPS finds Bobbili Kothapeta
    if (nearestVillage && nearestVillage.name && nearestVillage.name.toLowerCase().includes('bobbili kothapeta')) {
      // Already have the correct village, don't override
      return
    }
    
    resolveNearestVillage(userLocation)
  }, [locationStatus, userLocation, resolveNearestVillage, nearestVillage])

  // If location is denied or fails, ensure default village is set
  useEffect(() => {
    if ((locationStatus === 'denied' || locationStatus === 'pending') && !nearestVillage) {
      setDefaultVillage()
    }
  }, [locationStatus, nearestVillage, setDefaultVillage])

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
  }
}

