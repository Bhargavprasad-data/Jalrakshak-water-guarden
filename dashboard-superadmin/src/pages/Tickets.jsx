import React, { useState, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Tickets.css'
import useSuperAdminData from '../hooks/useSuperAdminData'

export default function Tickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('open')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const [dynamicStats, setDynamicStats] = useState({ activeAlerts: 0, openTickets: 0 })
  const [selectedDistrict, setSelectedDistrict] = useState('all')
  const [selectedMandal, setSelectedMandal] = useState('all')
  const [selectedVillage, setSelectedVillage] = useState('all')
  const [villages, setVillages] = useState([])
  const [mandals, setMandals] = useState([])

  const {
    districts,
    districtData,
    loading: selectorLoading
  } = useSuperAdminData()

  useEffect(() => {
    if (selectedDistrict && selectedDistrict !== 'all') {
      const data = districtData[selectedDistrict]
      if (data) {
        setMandals(data.mandals || [])
      } else {
        setMandals([])
      }
    } else {
      setMandals([])
    }
    setSelectedMandal('all')
    setSelectedVillage('all')
  }, [selectedDistrict, districtData])

  useEffect(() => {
    if (selectedMandal && selectedMandal !== 'all' && selectedDistrict && selectedDistrict !== 'all') {
      const data = districtData[selectedDistrict]
      if (data && data.villagesByMandal) {
        setVillages(data.villagesByMandal[selectedMandal] || [])
      } else {
        setVillages([])
      }
    } else if (selectedDistrict && selectedDistrict !== 'all') {
      const data = districtData[selectedDistrict]
      setVillages(data?.villages || [])
    } else {
      setVillages([])
    }
    setSelectedVillage('all')
  }, [selectedMandal, selectedDistrict, districtData])

  const fetchTickets = useCallback(async () => {
    try {
      console.log('Fetching tickets for district:', selectedDistrict)
      // Fetch ALL tickets (not filtered by status) to show accurate counts for all tabs
      const params = {
        limit: 1000 // Get all tickets to calculate accurate counts
      }
      
      if (selectedDistrict && selectedDistrict !== 'all') {
        params.district = selectedDistrict
      }
      if (selectedMandal && selectedMandal !== 'all') {
        params.mandal = selectedMandal
      }
      if (selectedVillage && selectedVillage !== 'all') {
        params.village_id = selectedVillage
      }
      
      // Fetch tickets and dynamic stats in parallel like Dashboard and Alerts
      const [ticketsRes, dynamicStatsRes] = await Promise.allSettled([
        axios.get('/api/tickets', { params }).catch(err => {
          console.error('Tickets API error:', err)
          return { data: [] }
        }),
        axios.get('/api/dynamic-stats/alerts-tickets', { params }).catch(err => ({ data: { activeAlerts: 0, openTickets: 0 } }))
      ])

      const ticketsData = ticketsRes.status === 'fulfilled' ? ticketsRes.value.data : []
      const stats = dynamicStatsRes.status === 'fulfilled' ? dynamicStatsRes.value.data : { activeAlerts: 0, openTickets: 0 }

      console.log('Tickets response:', ticketsData)
      console.log('Tickets count:', ticketsData.length)
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
      
      console.log('Sorted tickets count:', sortedTickets.length)
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
  }, [selectedDistrict, selectedMandal, selectedVillage, loading])

  useEffect(() => {
    if (selectedDistrict === 'all') {
      // Fetch all tickets if no district selected
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
    } else if (selectedDistrict) {
      const fetchVillages = async () => {
        try {
          // Fetch mandals if not already loaded
          if (mandals.length === 0 && selectedDistrict !== 'all') {
            try {
              const mandalsRes = await axios.get(`/api/admin/mandals?district=${encodeURIComponent(selectedDistrict)}`)
              const mandalsList = (mandalsRes.data || []).map(m => m.mandal || m)
              setMandals(mandalsList)
            } catch (err) {
              console.error('Failed to fetch mandals:', err)
            }
          }
          
          const params = { district: selectedDistrict }
          if (selectedMandal && selectedMandal !== 'all') {
            params.mandal = selectedMandal
          }
          const response = await axios.get('/api/admin/villages', { params })
          setVillages(response.data || [])
        } catch (error) {
          console.error('Failed to load villages:', error)
        }
      }
      
      fetchVillages()
      fetchTickets()
      const fetchInterval = setInterval(() => {
        fetchVillages()
        fetchTickets()
      }, 5000)
      const timerInterval = setInterval(() => {
        setLastSyncSeconds((prev) => prev + 1)
      }, 1000)
      return () => {
        clearInterval(fetchInterval)
        clearInterval(timerInterval)
      }
    }
  }, [activeTab, selectedDistrict, selectedMandal, selectedVillage, fetchTickets])

  useEffect(() => {
    if (selectedTicket) {
      setPanelOpen(true)
    }
  }, [selectedTicket])


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

  // Calculate accurate counts for all tabs from all tickets (filtered by selected village if not 'all')
  const tabs = useMemo(() => {
    // Filter tickets by selected village if not 'all'
    let ticketsToCount = tickets;
    if (selectedVillage !== 'all') {
      ticketsToCount = tickets.filter(t => {
        if (t.village_id === selectedVillage) return true
        if (!t.village_name) return false
        const selectedVillageName = villages.find(v => (v.id || v.name) === selectedVillage)?.name || ''
        return t.village_name === selectedVillageName || 
               t.village_name.toLowerCase().includes(selectedVillageName.toLowerCase()) ||
               selectedVillageName.toLowerCase().includes(t.village_name.toLowerCase())
      })
    }
    
    return [
      { 
        id: 'open', 
        label: 'Open', 
        count: ticketsToCount.filter(t => t.status === 'open').length,
      },
      { 
        id: 'accepted', 
        label: 'Assigned', 
        count: ticketsToCount.filter(t => t.status === 'accepted').length 
      },
      { 
        id: 'in_progress', 
        label: 'In Progress', 
        count: ticketsToCount.filter(t => t.status === 'in_progress').length 
      },
      { 
        id: 'completed', 
        label: 'Resolved', 
        count: ticketsToCount.filter(t => t.status === 'completed').length 
      }
    ];
  }, [tickets, selectedVillage])

  const villageOptions = useMemo(() => {
    const names = new Set()
    tickets.forEach((t) => {
      if (t.village_name) {
        names.add(t.village_name)
      }
    })
    return Array.from(names).sort()
  }, [tickets])

  // Filter tickets by status tab
  let filteredTickets = activeTab === 'all'
    ? tickets
    : tickets.filter(t => t.status === activeTab)

  // Filter by selected village if not 'all'
  // Note: Backend already filters by village_id when selectedVillage is set, but we also filter client-side for consistency
  if (selectedVillage !== 'all') {
    filteredTickets = filteredTickets.filter(t => {
      if (t.village_id === selectedVillage) return true
      if (!t.village_name) return false
      const ticketVillageName = t.village_name.toLowerCase().trim()
      const selectedVillageName = villages.find(v => (v.id || v.name) === selectedVillage)?.name?.toLowerCase() || ''
      return ticketVillageName === selectedVillageName || 
             ticketVillageName.includes(selectedVillageName) ||
             selectedVillageName.includes(ticketVillageName)
    })
  }

  if (selectorLoading || loading) {
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
          <h1>Issues (Tickets) {selectedDistrict !== 'all' ? `• ${selectedDistrict}` : '• All Districts'}</h1>
          <p className="page-subtitle">Track and manage maintenance tickets across all districts</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#666' }}>Filter by District</label>
              <select 
                value={selectedDistrict} 
                onChange={(e) => {
                  setSelectedDistrict(e.target.value)
                  setSelectedMandal('all')
                  setSelectedVillage('all')
                }}
                style={{ 
                  padding: '0.5rem', 
                  borderRadius: '8px', 
                  border: '1px solid #ccc', 
                  minWidth: '200px',
                  fontWeight: selectedDistrict !== 'all' ? '600' : '400',
                  backgroundColor: selectedDistrict !== 'all' ? '#f0f9ff' : 'white'
                }}
              >
                <option value="all">All Districts</option>
                {districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            {mandals.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#666' }}>Filter by Mandal</label>
                <select 
                  value={selectedMandal} 
                  onChange={(e) => {
                    setSelectedMandal(e.target.value)
                    setSelectedVillage('all')
                  }}
                  style={{ 
                    padding: '0.5rem', 
                    borderRadius: '8px', 
                    border: '1px solid #ccc', 
                    minWidth: '200px',
                    fontWeight: selectedMandal !== 'all' ? '600' : '400',
                    backgroundColor: selectedMandal !== 'all' ? '#f0f9ff' : 'white'
                  }}
                >
                  <option value="all">All Mandals</option>
                  {mandals.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            {villages.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#666' }}>Filter by Village</label>
                <select 
                  value={selectedVillage} 
                  onChange={(e) => setSelectedVillage(e.target.value)}
                  style={{ 
                    padding: '0.5rem', 
                    borderRadius: '8px', 
                    border: '1px solid #ccc', 
                    minWidth: '200px',
                    fontWeight: selectedVillage !== 'all' ? '600' : '400',
                    backgroundColor: selectedVillage !== 'all' ? '#f0f9ff' : 'white'
                  }}
                >
                  <option value="all">All Villages</option>
                  {villages.map(v => (
                    <option key={v.id || v.name} value={v.id || v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
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
