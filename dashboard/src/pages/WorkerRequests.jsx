import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './WorkerRequests.css'

export default function WorkerRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // pending, approved, rejected, all

  useEffect(() => {
    fetchRequests()
  }, [filter])

  // Refresh requests every 5 seconds to catch new registrations
  useEffect(() => {
    const interval = setInterval(() => {
      if (filter === 'pending' || filter === 'all') {
        fetchRequests()
      }
    }, 5000) // Refresh every 5 seconds

    return () => clearInterval(interval)
  }, [filter])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      const params = filter !== 'all' ? { status: filter } : {}
      console.log('[WorkerRequests] Fetching requests with filter:', filter, 'params:', params)
      
      // No authentication required - public endpoint
      const response = await axios.get('/api/worker-requests', { params })
      console.log('[WorkerRequests] Received requests:', response.data?.length || 0, 'requests')
      console.log('[WorkerRequests] Requests data:', response.data)
      setRequests(response.data || [])
    } catch (error) {
      console.error('[WorkerRequests] Full error:', error)
      console.error('[WorkerRequests] Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      })
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to load worker requests')
      setRequests([]) // Set empty array on error
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (requestId) => {
    if (!window.confirm('Are you sure you want to approve this worker registration request?')) return

    try {
      // No authentication required - public endpoint
      const response = await axios.post(`/api/worker-requests/${requestId}/approve`, {})
      toast.success('Worker registration approved and account created!')
      fetchRequests()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to approve request')
      console.error('Error approving request:', error)
    }
  }

  const handleReject = async (requestId) => {
    const reason = window.prompt('Please provide a reason for rejection (optional):')
    if (reason === null) return // User cancelled

    try {
      // No authentication required - public endpoint
      await axios.post(`/api/worker-requests/${requestId}/reject`, { reason })
      toast.success('Worker registration request rejected')
      fetchRequests()
    } catch (error) {
      toast.error('Failed to reject request')
      console.error('Error rejecting request:', error)
    }
  }

  if (loading) {
    return <div className="loading">Loading worker requests...</div>
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const approvedCount = requests.filter(r => r.status === 'approved').length
  const rejectedCount = requests.filter(r => r.status === 'rejected').length

  return (
    <div className="worker-requests-page">
      <div className="page-header">
        <div>
          <h2>Worker Registration Requests</h2>
          <p className="page-subtitle">Review and approve worker registration requests from mobile app</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="filter-group">
            <label>Filter by Status</label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="form-control">
              <option value="all">All ({requests.length})</option>
              <option value="pending">Pending ({pendingCount})</option>
              <option value="approved">Approved ({approvedCount})</option>
              <option value="rejected">Rejected ({rejectedCount})</option>
            </select>
          </div>
          <button
            onClick={fetchRequests}
            className="btn btn-primary"
            style={{ height: 'fit-content', padding: '0.5rem 1rem' }}
            disabled={loading}
          >
            {loading ? 'Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Status Summary Cards */}
      <div className="status-cards">
        <div className="status-card pending">
          <div className="status-number">{pendingCount}</div>
          <div className="status-label">Pending Requests</div>
        </div>
        <div className="status-card approved">
          <div className="status-number">{approvedCount}</div>
          <div className="status-label">Approved</div>
        </div>
        <div className="status-card rejected">
          <div className="status-number">{rejectedCount}</div>
          <div className="status-label">Rejected</div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Phone</th>
              <th>Email</th>
              <th>District</th>
              <th>Mandal</th>
              <th>Village</th>
              <th>Status</th>
              <th>Requested</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan="10" className="empty-state-cell">
                  <div className="empty-state">
                    <p>No worker requests found</p>
                  </div>
                </td>
              </tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id}>
                  <td>{request.name}</td>
                  <td>{request.username}</td>
                  <td>{request.phone}</td>
                  <td>{request.email || '—'}</td>
                  <td>{request.district}</td>
                  <td>{request.mandal || '—'}</td>
                  <td>{request.village_name || '—'}</td>
                  <td>
                    <span className={`badge badge-${request.status}`}>
                      {request.status}
                    </span>
                  </td>
                  <td>{new Date(request.created_at).toLocaleDateString()}</td>
                  <td>
                    {request.status === 'pending' ? (
                      <div className="action-buttons">
                        <button
                          onClick={() => handleApprove(request.id)}
                          className="btn btn-sm btn-success"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleReject(request.id)}
                          className="btn btn-sm btn-danger"
                        >
                          ✗ Reject
                        </button>
                      </div>
                    ) : request.status === 'rejected' && request.rejection_reason ? (
                      <small className="text-muted" title={request.rejection_reason}>
                        {request.rejection_reason}
                      </small>
                    ) : (
                      <small className="text-muted">
                        {request.reviewed_by_username ? `Reviewed by ${request.reviewed_by_username}` : '—'}
                      </small>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

