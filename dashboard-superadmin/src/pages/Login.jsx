import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useAuth } from '../context/AuthContext'
import './Login.css'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await axios.post('/api/auth/login', {
        username,
        password,
        role: 'superadmin'
      })

      if (response.data.token && response.data.user) {
        // Store token and user data
        localStorage.setItem('superadmin_token', response.data.token)
        localStorage.setItem('superadmin_user', JSON.stringify({
          ...response.data.user,
          dashboard: 'superadmin'
        }))

        // Update auth context
        await login(username, password)

      toast.success('Login successful!')
      navigate('/')
    } else {
        toast.error('Invalid response from server')
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Login failed. Please check your credentials.'
      toast.error(errorMessage)
    } finally {
    setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>💧 JalRakshak</h1>
        <h2>SuperAdmin Dashboard</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Phone / Email</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Enter phone number or email"
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
          <div className="form-footer">
            <p>Don't have an account? <Link to="/signup">Sign Up</Link></p>
          </div>
        </form>
      </div>
    </div>
  )
}
