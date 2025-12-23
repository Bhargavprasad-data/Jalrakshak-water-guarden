import { useState, useEffect } from 'react'
import axios from 'axios'

/**
 * Hook to get admin context and filter settings
 * Returns filter context based on admin role
 */
export default function useAdminContext(userId) {
  const [adminContext, setAdminContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    const fetchAdminContext = async () => {
      try {
        const response = await axios.get(`/api/admin/context?user_id=${userId}`)
        setAdminContext(response.data)
        setError(null)
      } catch (err) {
        console.error('Error fetching admin context:', err)
        setError(err.message)
        setAdminContext(null)
      } finally {
        setLoading(false)
      }
    }

    fetchAdminContext()
  }, [userId])

  return { adminContext, loading, error }
}



