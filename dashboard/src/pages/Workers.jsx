import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Workers.css'

export default function Workers() {
  const [workers, setWorkers] = useState([])
  const [villages, setVillages] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    district: '',
    mandal: '',
    village_id: '',
    password: ''
  })
  const [districts, setDistricts] = useState([])
  const [mandals, setMandals] = useState([])
  const [filteredVillages, setFilteredVillages] = useState([])

  useEffect(() => {
    fetchWorkers()
    fetchVillages()
  }, [])

  useEffect(() => {
    // Extract unique districts from villages
    const uniqueDistricts = [...new Set(villages.map(v => v.district).filter(Boolean))].sort()
    setDistricts(uniqueDistricts)
  }, [villages])

  useEffect(() => {
    // Filter mandals based on selected district
    if (formData.district) {
      const districtVillages = villages.filter(v => v.district === formData.district)
      const uniqueMandals = [...new Set(districtVillages.map(v => v.mandal || v.name).filter(Boolean))].sort()
      setMandals(uniqueMandals)
    } else {
      setMandals([])
    }
  }, [formData.district, villages])

  useEffect(() => {
    // Filter villages based on selected district and mandal
    let filtered = villages
    if (formData.district) {
      filtered = filtered.filter(v => v.district === formData.district)
    }
    if (formData.mandal) {
      filtered = filtered.filter(v => (v.mandal || v.name) === formData.mandal)
    }
    setFilteredVillages(filtered)
    
    // Auto-select village if only one matches
    if (filtered.length === 1 && !formData.village_id) {
      setFormData(prev => ({ ...prev, village_id: filtered[0].id }))
    }
  }, [formData.district, formData.mandal, villages])

  const fetchWorkers = async () => {
    try {
      // Check if token exists
      const token = localStorage.getItem('token')
      if (!token) {
        toast.error('Please login to view workers')
        setLoading(false)
        return
      }
      
      // Set authorization header for this request
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
      
      const response = await axios.get('/api/workers', config)
      setWorkers(response.data)
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Authentication required. Please login again.')
        // Clear invalid token
        localStorage.removeItem('token')
        delete axios.defaults.headers.common['Authorization']
      } else {
        toast.error('Failed to load workers')
      }
      console.error('Error fetching workers:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchVillages = async () => {
    try {
      const response = await axios.get('/api/gis/villages')
      setVillages(response.data)
    } catch (error) {
      console.error('Failed to load villages:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      // Ensure token is set in headers
      const token = localStorage.getItem('token')
      if (!token) {
        toast.error('Authentication required. Please login again.')
        return
      }
      
      // Set authorization header for this request
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
      
      const response = await axios.post('/api/workers', {
        name: formData.name,
        phone: formData.phone,
        district: formData.district,
        mandal: formData.mandal,
        village_id: formData.village_id,
        password: formData.password || undefined // Only send if provided
      }, config)
      toast.success('Worker created successfully! Default password: Worker@123')
      setShowAddForm(false)
      setFormData({ name: '', phone: '', district: '', mandal: '', village_id: '', password: '' })
      fetchWorkers()
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Authentication required. Please login again.')
        localStorage.removeItem('token')
        delete axios.defaults.headers.common['Authorization']
      } else {
        toast.error(error.response?.data?.error || 'Failed to create worker')
      }
      console.error('Error creating worker:', error)
    }
  }

  const deleteWorker = async (workerId) => {
    if (!window.confirm('Are you sure you want to delete this worker?')) return
    
    try {
      // Ensure token is set in headers
      const token = localStorage.getItem('token')
      if (!token) {
        toast.error('Authentication required. Please login again.')
        return
      }
      
      // Set authorization header for this request
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
      
      await axios.delete(`/api/workers/${workerId}`, config)
      toast.success('Worker deleted')
      fetchWorkers()
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Authentication required. Please login again.')
        localStorage.removeItem('token')
        delete axios.defaults.headers.common['Authorization']
      } else {
        toast.error('Failed to delete worker')
      }
      console.error('Error deleting worker:', error)
    }
  }

  if (loading) {
    return <div className="loading">Loading workers...</div>
  }

  return (
    <div className="workers-page">
      <div className="page-header">
        <div>
          <h2>Field Workers</h2>
          <p className="page-subtitle">Manage field workers and their village assignments</p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn btn-primary">
          {showAddForm ? 'Cancel' : '+ Add Worker'}
        </button>
      </div>

      {showAddForm && (
        <div className="card form-card">
          <h2>Add New Worker</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Worker full name"
                />
              </div>
              <div className="form-group">
                <label>Phone Number *</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  placeholder="+919999999999"
                />
              </div>
              <div className="form-group">
                <label>District *</label>
                <select
                  value={formData.district}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value, mandal: '', village_id: '' })}
                  required
                >
                  <option value="">Select District</option>
                  {districts.map(district => (
                    <option key={district} value={district}>{district}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Mandal</label>
                <select
                  value={formData.mandal}
                  onChange={(e) => setFormData({ ...formData, mandal: e.target.value, village_id: '' })}
                  disabled={!formData.district}
                >
                  <option value="">Select Mandal (Optional)</option>
                  {mandals.map(mandal => (
                    <option key={mandal} value={mandal}>{mandal}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Village *</label>
                <select
                  value={formData.village_id}
                  onChange={(e) => setFormData({ ...formData, village_id: e.target.value })}
                  required
                  disabled={!formData.district}
                >
                  <option value="">Select Village</option>
                  {filteredVillages.map(village => (
                    <option key={village.id} value={village.id}>{village.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Custom Password (Optional)</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Leave empty for default: Worker@123"
                />
                <small className="form-hint">If left empty, default password "Worker@123" will be assigned</small>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">Create Worker</button>
              <button type="button" className="btn btn-secondary" onClick={() => {
                setShowAddForm(false)
                setFormData({ name: '', phone: '', district: '', mandal: '', village_id: '', password: '' })
              }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>District</th>
              <th>Mandal</th>
              <th>Assigned Village</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-state-cell">
                  <div className="empty-state">
                    <p>No workers found</p>
                    <button onClick={() => setShowAddForm(true)} className="btn btn-primary btn-sm">
                      Add First Worker
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              workers.map((worker) => (
                <tr key={worker.id}>
                  <td>{worker.metadata?.name || worker.username}</td>
                  <td>{worker.phone}</td>
                  <td>{worker.metadata?.district || '—'}</td>
                  <td>{worker.metadata?.mandal || '—'}</td>
                  <td>
                    {worker.villages && worker.villages.length > 0
                      ? worker.villages.map(v => v.name).join(', ')
                      : '—'}
                  </td>
                  <td>{new Date(worker.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      onClick={() => deleteWorker(worker.id)}
                      className="btn btn-sm btn-danger"
                    >
                      Delete
                    </button>
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

