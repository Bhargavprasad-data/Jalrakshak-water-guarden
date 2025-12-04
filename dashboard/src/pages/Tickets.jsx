import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Tickets.css'
import useNearestVillage from '../hooks/useNearestVillage'
import { LocationGate } from '../components/LocationGate'

export default function Tickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('open')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const [dynamicStats, setDynamicStats] = useState({ activeAlerts: 0, openTickets: 0 })
  const [selectedVillage, setSelectedVillage] = useState('all')

  const {
    locationStatus,
    locationError,
    requestLocation,
    nearestVillage,
    villageLoading,
    villageError,
    retryVillageLookup,
  } = useNearestVillage()

useEffect(() => {
  if (locationStatus !== 'granted' || !nearestVillage) return
  fetchTickets()
  const fetchInterval = setInterval(() => {
    fetchTickets()
  }, 5000)

  const timerInterval = setInterval(() => {
    setLastSyncSeconds((prev) => prev + 1)
  }, 1000)

  return () => {
    clearInterval(fetchInterval)
    clearInterval(timerInterval)
  }
}, [activeTab, locationStatus, nearestVillage])

  useEffect(() => {
    if (selectedTicket) {
      setPanelOpen(true)
    }
  }, [selectedTicket])

useEffect(() => {
  if (nearestVillage && selectedVillage === 'all') {
    setSelectedVillage(nearestVillage.name || 'all')
  }
}, [nearestVillage, selectedVillage])

const fetchTickets = async () => {
  if (locationStatus !== 'granted' || !nearestVillage) return
    try {
      const params = activeTab !== 'all' ? { status: activeTab } : {}
      // Add limit to get all tickets
      params.limit = 1000
    params.village_id = nearestVillage.id
      
      // Fetch tickets and dynamic stats in parallel like Dashboard and Alerts
      const [ticketsRes, dynamicStatsRes] = await Promise.allSettled([
        axios.get('/api/tickets', { params }).catch(err => ({ data: [] })),
        axios.get('/api/dynamic-stats/alerts-tickets').catch(err => ({ data: { activeAlerts: 0, openTickets: 0 } }))
      ])

      const ticketsData = ticketsRes.status === 'fulfilled' ? ticketsRes.value.data : []
      const stats = dynamicStatsRes.status === 'fulfilled' ? dynamicStatsRes.value.data : { activeAlerts: 0, openTickets: 0 }

      console.log('Tickets response:', ticketsData)
      console.log('Dynamic stats:', stats)
      
      // Sort by severity (critical/high first) and then by created_at (newest first)
      const sortedTickets = (Array.isArray(ticketsData) ? ticketsData : []).sort((a, b) => {
        // First sort by severity (critical > high > medium > low)
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
        const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0)
        if (severityDiff !== 0) return severityDiff
        
        // Then sort by created_at (newest first)
        const dateA = new Date(a.created_at || 0).getTime()
        const dateB = new Date(b.created_at || 0).getTime()
        return dateB - dateA
      })
      
      setTickets(sortedTickets)
      setDynamicStats(stats)
      setLastSyncSeconds(0)
    } catch (error) {
      console.error('Failed to load tickets:', error)
      toast.error('Failed to load tickets: ' + (error.response?.data?.message || error.message))
      setTickets([])
    } finally {
      // Only hide the loading state after the first load so that
      // periodic refreshes don't show the full-page spinner again.
      if (loading) {
        setLoading(false)
      }
    }
  }

  const deleteTicket = async (ticket) => {
    if (!window.confirm('Are you sure you want to delete this ticket?')) return
    try {
      await axios.delete(`/api/tickets/${ticket.id}`)
      toast.success('Ticket deleted')
      fetchTickets()
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket(null)
        setPanelOpen(false)
      }
    } catch (error) {
      toast.error('Failed to delete ticket')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'warning'
      case 'accepted': return 'info'
      case 'in_progress': return 'info'
      case 'completed': return 'success'
      case 'closed': return 'muted'
      default: return 'info'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'open': return '📋'
      case 'accepted': return '✅'
      case 'in_progress': return '🔧'
      case 'completed': return '✔️'
      case 'closed': return '🔒'
      default: return '📄'
    }
  }

  const tabs = [
    { 
      id: 'open', 
      label: 'Open', 
      count: tickets.filter(t => t.status === 'open').length,
    },
    { id: 'accepted', label: 'Assigned', count: tickets.filter(t => t.status === 'accepted').length },
    { id: 'in_progress', label: 'In Progress', count: tickets.filter(t => t.status === 'in_progress').length },
    { id: 'completed', label: 'Resolved', count: tickets.filter(t => t.status === 'completed').length }
  ]

  const villageOptions = useMemo(() => {
    const names = new Set()
    tickets.forEach((t) => {
      if (t.village_name) {
        names.add(t.village_name)
      }
    })
    return Array.from(names).sort()
  }, [tickets])

  let filteredTickets = activeTab === 'all'
    ? tickets
    : tickets.filter(t => t.status === activeTab)

  if (selectedVillage !== 'all') {
    filteredTickets = filteredTickets.filter(t => t.village_name === selectedVillage)
  }

  if (locationStatus !== 'granted' || !nearestVillage) {
    return (
      <div className="tickets-page">
        <LocationGate
          locationStatus={locationStatus}
          locationError={locationError}
          requestLocation={requestLocation}
          villageLoading={villageLoading}
          villageError={villageError}
          retryVillageLookup={retryVillageLookup}
        />
      </div>
    )
  }

  if (loading) {
    return <div className="loading">Loading tickets...</div>
  }

  return (
    <div className="tickets-page">
      {/* Live Status Bar */}
      <div className="status-bar">
        <div className="status-indicator-wrapper">
          <div className="led-indicator led-green"></div>
          <span className="status-text">Last Sync: {lastSyncSeconds} sec ago</span>
        </div>
      </div>

      <div className="page-header">
        <div>
          <h1>Issues </h1>
          <p className="page-subtitle">Track and manage maintenance tickets</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <div className="tabs-toolbar">
          <div className="tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-label">{tab.label}</span>
                <span className="tab-count">{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="village-filter">
            <span className="village-filter-label">Village</span>
            <select
              className="village-select"
              value={selectedVillage}
              onChange={(e) => setSelectedVillage(e.target.value)}
            >
              <option value="all">All Villages</option>
              {villageOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Grid */}
      <div className="tickets-grid">
        {filteredTickets.map((ticket) => (
          <div
            key={ticket.id}
            className="ticket-card"
            onClick={() => setSelectedTicket(ticket)}
          >
            <div className="ticket-header">
              <div className="ticket-id">
                <span className="ticket-id-label">Ticket #{ticket.ticket_id}</span>
              </div>
              <span className={`badge badge-${getStatusColor(ticket.status)}`}>
                {getStatusIcon(ticket.status)} {ticket.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            
            <div className="ticket-content">
              <h3 className="ticket-title">{ticket.issue_type}</h3>
              <p className="ticket-description">{ticket.description || 'No description provided'}</p>
              
              <div className="ticket-meta">
                <div className="meta-item">
                  <span className="meta-label">Device</span>
                  <span className="meta-value">{ticket.device_id}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Village</span>
                  <span className="meta-value">{ticket.village_name || 'N/A'}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Severity</span>
                  <span className={`meta-value badge badge-${ticket.severity === 'high' ? 'danger' : ticket.severity === 'medium' ? 'warning' : 'info'}`}>
                    {ticket.severity}
                  </span>
                </div>
                {ticket.assigned_to_name && (
                  <div className="meta-item">
                    <span className="meta-label">Assigned To</span>
                    <span className="meta-value">{ticket.assigned_to_name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="ticket-footer">
              <span className="ticket-date">
                Created: {new Date(ticket.created_at).toLocaleDateString()}
              </span>
              <div className="ticket-actions">
                <button
                  className="btn btn-sm btn-danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteTicket(ticket)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTickets.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>No Tickets</h3>
          <p>No tickets found for the selected status.</p>
        </div>
      )}

      {/* Slide-over Detail Panel */}
      {panelOpen && selectedTicket && (
        <>
          <div className="panel-overlay" onClick={() => setPanelOpen(false)}></div>
          <div className="ticket-panel">
            <div className="panel-header">
              <h2>Ticket #{selectedTicket.ticket_id}</h2>
              <button className="panel-close" onClick={() => setPanelOpen(false)}>×</button>
            </div>
            
            <div className="panel-content">
              <div className="panel-section">
                <h3>Details</h3>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Issue Type</span>
                    <span className="detail-value">{selectedTicket.issue_type}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Severity</span>
                    <span className={`detail-value badge badge-${selectedTicket.severity === 'high' ? 'danger' : selectedTicket.severity === 'medium' ? 'warning' : 'info'}`}>
                      {selectedTicket.severity}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status</span>
                    <span className={`detail-value badge badge-${getStatusColor(selectedTicket.status)}`}>
                      {selectedTicket.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Device ID</span>
                    <span className="detail-value">{selectedTicket.device_id}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Village</span>
                    <span className="detail-value">{selectedTicket.village_name || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Assigned To</span>
                    <span className="detail-value">{selectedTicket.assigned_to_name || 'Unassigned'}</span>
                  </div>
                </div>
              </div>

              <div className="panel-section">
                <h3>Description</h3>
                <p className="ticket-full-description">{selectedTicket.description || 'No description provided.'}</p>
              </div>

              <div className="panel-section">
                <h3>Timeline</h3>
                <div className="timeline">
                  <div className="timeline-item">
                    <div className="timeline-marker"></div>
                    <div className="timeline-content">
                      <span className="timeline-title">Ticket Created</span>
                      <span className="timeline-date">{new Date(selectedTicket.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  {selectedTicket.updated_at && selectedTicket.updated_at !== selectedTicket.created_at && (
                    <div className="timeline-item">
                      <div className="timeline-marker"></div>
                      <div className="timeline-content">
                        <span className="timeline-title">Last Updated</span>
                        <span className="timeline-date">{new Date(selectedTicket.updated_at).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="panel-actions">
                <button
                  className="btn btn-danger"
                  onClick={() => deleteTicket(selectedTicket)}
                >
                  Delete Ticket
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
