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

  const resolveNearestVillage = useCallback(async (coords) => {
    if (!coords) return
    try {
      setVillageLoading(true)
      setVillageError(null)
      const response = await axios.get('/api/gis/villages')
      const villages = response.data || []
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

      setNearestVillage(closest)
    } catch (error) {
      console.error('Failed to resolve nearest village:', error)
      setVillageError('Failed to fetch villages. Please try again.')
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

  // Resolve nearest village when location is available
  useEffect(() => {
    if (locationStatus !== 'granted' || !userLocation) return
    resolveNearestVillage(userLocation)
  }, [locationStatus, userLocation, resolveNearestVillage])

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

