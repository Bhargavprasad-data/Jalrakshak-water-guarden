import React, { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem('district_user')
    const storedToken = localStorage.getItem('district_token')
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser))
    }
    setLoading(false)
  }, [])

  const login = async (username, password) => {
    try {
      // Try backend API first
      const axios = (await import('axios')).default
      const response = await axios.post('/api/auth/login', {
        username,
        password,
        role: 'districtadmin'
      })

      if (response.data.token && response.data.user) {
        const userData = {
          ...response.data.user,
          dashboard: 'district'
        }
        localStorage.setItem('district_token', response.data.token)
        localStorage.setItem('district_user', JSON.stringify(userData))
        setUser(userData)
        return { success: true }
      }
      return { success: false, error: 'Invalid response from server' }
    } catch (error) {
      // Fallback to hardcoded credentials for backward compatibility
    if (username === 'vizianagaram' && password === 'vizianagaram') {
      const userData = {
        username: 'vizianagaram',
        role: 'districtadmin',
        dashboard: 'district',
        district: 'Vizianagaram'
      }
      localStorage.setItem('district_user', JSON.stringify(userData))
      setUser(userData)
      return { success: true }
    }
      return { success: false, error: error.response?.data?.error || 'Invalid username or password' }
    }
  }

  const logout = () => {
    localStorage.removeItem('district_user')
    localStorage.removeItem('district_token')
    setUser(null)
  }

  const value = {
    user,
    login,
    logout,
    loading
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
