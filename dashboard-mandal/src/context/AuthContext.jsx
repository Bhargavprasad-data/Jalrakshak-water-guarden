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
    const storedUser = localStorage.getItem('mandal_user')
    const storedToken = localStorage.getItem('mandal_token')
    if (storedUser && storedToken) {
      const parsedUser = JSON.parse(storedUser)
      // Normalize mandal field
      if (!parsedUser.mandal && parsedUser.assigned_mandal) {
        parsedUser.mandal = parsedUser.assigned_mandal
      }
      console.log('[Mandal AuthContext] Loaded user from localStorage:', parsedUser)
      setUser(parsedUser)
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
        role: 'mandaladmin'
      })

      if (response.data.token && response.data.user) {
        const userData = {
          ...response.data.user,
          dashboard: 'mandal',
          // Ensure mandal field is available (check both mandal and assigned_mandal)
          mandal: response.data.user.mandal || response.data.user.assigned_mandal || null
        }
        console.log('[Mandal AuthContext] User data after login:', userData)
        localStorage.setItem('mandal_token', response.data.token)
        localStorage.setItem('mandal_user', JSON.stringify(userData))
        setUser(userData)
        return { success: true }
      }
      return { success: false, error: 'Invalid response from server' }
    } catch (error) {
      // Fallback to hardcoded credentials for backward compatibility
    if (username === 'gurla' && password === 'gurla') {
      const userData = {
        username: 'gurla',
        role: 'mandaladmin',
        dashboard: 'mandal',
        mandal: 'Gurla'
      }
      localStorage.setItem('mandal_user', JSON.stringify(userData))
      setUser(userData)
      return { success: true }
    }
      return { success: false, error: error.response?.data?.error || 'Invalid username or password' }
    }
  }

  const logout = () => {
    localStorage.removeItem('mandal_user')
    localStorage.removeItem('mandal_token')
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
