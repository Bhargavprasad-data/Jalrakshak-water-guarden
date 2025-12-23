import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './WaterSupplyTimings.css'
import useNearestVillage from '../hooks/useNearestVillage'
import { LocationGate } from '../components/LocationGate'

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
]

export default function WaterSupplyTimings() {
  const [timings, setTimings] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    day_of_week: 1,
    start_time: '',
    end_time: '',
    notes: ''
  })

  const {
    locationStatus,
    locationError,
    requestLocation,
    nearestVillage,
    villageLoading,
    villageError,
    retryVillageLookup,
  } = useNearestVillage()

  const fetchTimings = useCallback(async () => {
    if (!nearestVillage) return
    try {
      const response = await axios.get(`/api/water-supply-timings/village/${nearestVillage.id}`)
      setTimings(response.data || [])
      setLastSyncSeconds(0)
    } catch (error) {
      console.error('Failed to load water supply timings:', error)
      toast.error('Failed to load water supply timings: ' + (error.response?.data?.message || error.message))
      setTimings([])
    } finally {
      if (loading) {
        setLoading(false)
      }
    }
  }, [nearestVillage, loading])

  useEffect(() => {
    if (locationStatus !== 'granted' || !nearestVillage) return

    fetchTimings()
    
    // Refresh every 30 seconds
    const fetchInterval = setInterval(() => {
      fetchTimings()
    }, 30000)

    const timerInterval = setInterval(() => {
      setLastSyncSeconds((prev) => prev + 1)
    }, 1000)

    return () => {
      clearInterval(fetchInterval)
      clearInterval(timerInterval)
    }
  }, [locationStatus, nearestVillage, fetchTimings])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        // Update existing timing
        await axios.put(`/api/water-supply-timings/${editingId}`, {
          ...formData,
          village_id: nearestVillage.id
        })
        toast.success('Water supply timing updated successfully')
      } else {
        // Create new timing
        await axios.post('/api/water-supply-timings', {
          ...formData,
          village_id: nearestVillage.id
        })
        toast.success('Water supply timing added successfully')
      }
      setShowAddForm(false)
      setEditingId(null)
      setFormData({
        day_of_week: 1,
        start_time: '',
        end_time: '',
        notes: ''
      })
      fetchTimings()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save water supply timing')
    }
  }

  const handleEdit = (timing) => {
    setEditingId(timing.id)
    setFormData({
      day_of_week: timing.day_of_week,
      start_time: timing.start_time,
      end_time: timing.end_time,
      notes: timing.notes || ''
    })
    setShowAddForm(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this timing?')) return
    try {
      await axios.delete(`/api/water-supply-timings/${id}`)
      toast.success('Water supply timing deleted successfully')
      fetchTimings()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete water supply timing')
    }
  }

  const handleCancel = () => {
    setShowAddForm(false)
    setEditingId(null)
    setFormData({
      day_of_week: 1,
      start_time: '',
      end_time: '',
      notes: ''
    })
  }

  // Group timings by day of week
  const timingsByDay = DAYS_OF_WEEK.map(day => ({
    ...day,
    timings: timings.filter(t => t.day_of_week === day.value)
  }))

  const formatTime = (time) => {
    if (!time) return ''
    // Handle both HH:MM:SS and HH:MM formats
    const parts = time.split(':')
    return `${parts[0]}:${parts[1]}`
  }

  const formatDuration = (minutes) => {
    if (!minutes) return 'N/A'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  if (locationStatus !== 'granted' || !nearestVillage) {
    return (
      <div className="water-supply-timings-page">
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
    return <div className="loading">Loading water supply timings...</div>
  }

  return (
    <div className="water-supply-timings-page">
      {/* Live Status Bar */}
      <div className="status-bar">
        <div className="status-indicator-wrapper">
          <div className="led-indicator led-green"></div>
          <span className="status-text">Last Sync: {lastSyncSeconds} sec ago</span>
        </div>
      </div>

      <div className="page-header">
        <div>
          <h1>Water Supply Timings {nearestVillage ? `• ${nearestVillage.name}` : ''}</h1>
          <p className="page-subtitle">
            {nearestVillage
              ? `Manage water supply schedules for ${nearestVillage.name}`
              : 'Manage water supply schedules'}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowAddForm(true)
              setEditingId(null)
              setFormData({
                day_of_week: 1,
                start_time: '',
                end_time: '',
                notes: ''
              })
            }}
          >
            ➕ Add Timing
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="form-card card">
          <h2>{editingId ? 'Edit Timing' : 'Add New Timing'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Day of Week *</label>
                <select
                  value={formData.day_of_week}
                  onChange={(e) => setFormData({ ...formData, day_of_week: parseInt(e.target.value) })}
                  required
                >
                  {DAYS_OF_WEEK.map(day => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Start Time *</label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>End Time *</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                />
              </div>
              <div className="form-group form-group-full">
                <label>Notes (Optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="3"
                  placeholder="Additional notes about this timing..."
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Update' : 'Add'} Timing
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Timings Table Grouped by Day */}
      <div className="timings-section">
        {timingsByDay.map(day => (
          day.timings.length > 0 && (
            <div key={day.value} className="day-group card">
              <h2 className="day-title">{day.label}</h2>
              <div className="timings-table-wrapper">
                <table className="timings-table">
                  <thead>
                    <tr>
                      <th>Start Time</th>
                      <th>End Time</th>
                      <th>Duration</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.timings.map(timing => (
                      <tr key={timing.id}>
                        <td>{formatTime(timing.start_time)}</td>
                        <td>{formatTime(timing.end_time)}</td>
                        <td>{formatDuration(timing.duration_minutes)}</td>
                        <td>{timing.notes || '-'}</td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleEdit(timing)}
                              title="Edit"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDelete(timing.id)}
                              title="Delete"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ))}
      </div>

      {timings.length === 0 && !showAddForm && (
        <div className="empty-state">
          <div className="empty-icon">💧</div>
          <h3>No Water Supply Timings</h3>
          <p>Add timings to schedule water supply for this village.</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowAddForm(true)
              setEditingId(null)
              setFormData({
                day_of_week: 1,
                start_time: '',
                end_time: '',
                notes: ''
              })
            }}
          >
            ➕ Add First Timing
          </button>
        </div>
      )}
    </div>
  )
}




