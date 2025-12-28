import React, { useEffect, useMemo, useState, useCallback } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Complaints.css'

const statusLabels = {
  all: 'All',
  open: 'Open',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed'
}

const statusClass = {
  open: 'badge badge-open',
  accepted: 'badge badge-accepted',
  in_progress: 'badge badge-progress',
  resolved: 'badge badge-resolved',
  closed: 'badge badge-closed'
}

const typeIcons = {
  leak: '💧',
  'low-pressure': '⚠️',
  'muddy-water': '🚱',
  'no-supply': '❌',
  'tank-cleaning': '🧼',
  other: '📣'
}

const actionMap = {
  open: { label: 'Accept', next: 'accepted' },
  accepted: { label: 'Start', next: 'in_progress' },
  in_progress: { label: 'Resolve', next: 'resolved' },
  resolved: { label: 'Close', next: 'closed' }
}

export default function Complaints() {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  const fetchComplaints = useCallback(async () => {
    try {
      const params = activeTab === 'all' ? {} : { status: activeTab }
      const response = await axios.get('/api/complaints', { params })
      setComplaints(response.data || [])
    } catch (error) {
      console.error(error)
      toast.error('Unable to load complaints')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    fetchComplaints()
  }, [fetchComplaints])

  useEffect(() => {
    const interval = setInterval(fetchComplaints, 15000)
    return () => clearInterval(interval)
  }, [fetchComplaints])

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '—'
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  }

  const updateStatus = async (complaint, status) => {
    try {
      await axios.post(`/api/complaints/${complaint.complaint_id}/update-status`, { status })
      toast.success('Complaint status updated')
      fetchComplaints()
    } catch (error) {
      toast.error('Failed to update complaint')
    }
  }

  const statusCounts = useMemo(() => {
    const counts = {}
    Object.keys(statusLabels).forEach((status) => {
      if (status === 'all') return
      counts[status] = complaints.filter((c) => c.status === status).length
    })
    return counts
  }, [complaints])

  const deleteComplaint = async (complaint) => {
    if (!window.confirm('Are you sure you want to delete this complaint?')) return
    try {
      await axios.delete(`/api/complaints/${complaint.complaint_id}`)
      toast.success('Complaint deleted')
      fetchComplaints()
    } catch (error) {
      console.error(error)
      if (error?.response?.status === 404) {
        toast.info('Complaint was already deleted')
        setComplaints((prev) =>
          prev.filter((c) => c.complaint_id !== complaint.complaint_id),
        )
      } else {
        toast.error('Failed to delete complaint')
      }
    }
  }

  const filteredComplaints =
    activeTab === 'all' ? complaints : complaints.filter((c) => c.status === activeTab)

  return (
    <div className="complaints-page">
      <div className="page-header">
        <div>
          <h1>💧 Community Complaints</h1>
          <p className="subtitle">Live feed of issues submitted from the JalRakshak mobile app</p>
        </div>
      </div>

      <div className="complaints-toolbar">
        <div className="tabs">
          {Object.keys(statusLabels).map((status) => (
            <button
              key={status}
              className={`tab ${activeTab === status ? 'active' : ''}`}
              onClick={() => setActiveTab(status)}
            >
              {statusLabels[status]}
              {status !== 'all' && ` ${statusCounts[status] || 0}`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading complaints...</div>
      ) : filteredComplaints.length === 0 ? (
        <div className="empty-state">
          <p>No complaints found for the selected filter.</p>
          <p className="muted">New submissions from the mobile app will appear here instantly.</p>
        </div>
      ) : (
        <div className="complaints-grid">
          {filteredComplaints.map((complaint) => {
            const icon =
              typeIcons[complaint.complaint_type] ||
              typeIcons[complaint.complaint_type?.toLowerCase?.()] ||
              typeIcons.other
            const badge = statusClass[complaint.status] || 'badge'
            const action = actionMap[complaint.status]
            const photos = Array.isArray(complaint.photo_urls) ? complaint.photo_urls : []

            return (
              <div key={complaint.id || complaint.complaint_id} className="complaint-card">
                <div className="card-header">
                  <div className="title">
                    <span className="icon">{icon}</span>
                    <h3>{(complaint.complaint_type || 'other').toLowerCase()}</h3>
                  </div>
                  <span className={badge}>{statusLabels[complaint.status] || complaint.status}</span>
                </div>

                <div className="card-meta">
                  <p className="meta">
                    {complaint.village_name || 'Unknown village'} • {formatTimestamp(complaint.created_at)}
                  </p>
                  {(complaint.reported_by_name || complaint.reported_by_email) && (
                    <p className="meta reporter">
                      {complaint.reported_by_name || 'Anonymous'}
                      {complaint.reported_by_email ? ` • ${complaint.reported_by_email}` : ''}
                    </p>
                  )}
                </div>

                <p className="description">{complaint.description || 'No description provided.'}</p>

                {photos.length > 0 && (
                  <div className="evidence-section">
                    <a
                      href={photos[0]}
                      target="_blank"
                      rel="noreferrer"
                      className="evidence-link"
                    >
                      <span className="evidence-icon">📄</span>
                      Complaint evidence
                    </a>
                    <button
                      type="button"
                      className="btn-view"
                      onClick={() => window.open(photos[0], '_blank', 'noopener,noreferrer')}
                    >
                      View
                    </button>
                  </div>
                )}

                <div className="details-row">
                  <div>
                    <span className="label">Complaint ID</span>
                    <strong>{complaint.complaint_id}</strong>
                  </div>
                  <div className="location-bottom">
                    <span className="label">Location</span>
                    <strong>
                      {complaint.village_name || 'N/A'}
                    </strong>
                  </div>
                </div>

                <div className="actions-row">
                  <button
                    className="btn-delete"
                    onClick={() => deleteComplaint(complaint)}
                  >
                    Delete
                  </button>
                  {action && (
                    <button
                      className={`btn-accept ${action.next === 'accepted' ? 'btn-accept-green' : ''}`}
                      onClick={() => updateStatus(complaint, action.next)}
                    >
                      {action.label}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
