import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Users.css'

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUsers()
  }, [])

  // Auto-refresh users every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUsers()
    }, 10000) // Refresh every 10 seconds

    return () => clearInterval(interval)
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      
      // No authentication required - public endpoint
      const response = await axios.get('/api/users')
      console.log('[Users] Received users:', response.data?.length || 0, 'users')
      setUsers(response.data || [])
    } catch (error) {
      console.error('[Users] Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      })
      toast.error(error.response?.data?.error || 'Failed to load mobile-app users')
      setUsers([]) // Set empty array on error
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading">Loading users...</div>
  }

  return (
    <div className="users-page">
      <div className="page-header">
        <div>
          <h2>Mobile App Users</h2>
          <p className="page-subtitle">View all villagers registered in the mobile application</p>
        </div>
        <button
          onClick={fetchUsers}
          className="btn btn-primary"
          style={{ height: 'fit-content', padding: '0.5rem 1rem' }}
          disabled={loading}
        >
          {loading ? 'Loading...' : '🔄 Refresh'}
        </button>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="3" className="empty-state-cell">
                  <div className="empty-state">
                    <p>No mobile-app users found</p>
                  </div>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.email || '—'}</td>
                  <td>{user.phone}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

