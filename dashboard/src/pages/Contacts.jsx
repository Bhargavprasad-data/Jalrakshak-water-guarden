import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Contacts.css'

export default function Contacts() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    contact_code: '',
    name: '',
    phone: '',
    role: 'worker',
    villages: [],
    whatsapp_opt_in: true
  })

  useEffect(() => {
    fetchContacts()
  }, [])

  const fetchContacts = async () => {
    try {
      const response = await axios.get('/api/contacts')
      setContacts(response.data)
    } catch (error) {
      toast.error('Failed to load contacts')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const response = await axios.post('/api/contacts', formData)
      toast.success('Contact added and welcome message sent!')
      setShowAddForm(false)
      setFormData({ contact_code: '', name: '', phone: '', role: 'worker', villages: [], whatsapp_opt_in: true })
      fetchContacts()
    } catch (error) {
      toast.error('Failed to add contact')
    }
  }

  const deleteContact = async (contactId) => {
    if (!window.confirm('Are you sure you want to delete this contact?')) return
    
    try {
      await axios.delete(`/api/contacts/${contactId}`)
      toast.success('Contact deleted')
      fetchContacts()
    } catch (error) {
      toast.error('Failed to delete contact')
    }
  }

  if (loading) {
    return <div className="loading">Loading contacts...</div>
  }

  return (
    <div className="contacts-page">
      <div className="page-header">
        <h1>Contacts</h1>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn btn-primary">
          {showAddForm ? 'Cancel' : '+ Add Contact'}
        </button>
      </div>

      {showAddForm && (
        <div className="card">
          <h3>Add New Contact</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Contact ID</label>
                <input
                  type="text"
                  value={formData.contact_code}
                  onChange={(e) => setFormData({ ...formData, contact_code: e.target.value })}
                  placeholder="Enter unique ID (e.g., C-001)"
                />
              </div>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Phone (+91...)</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  placeholder="+919999999999"
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="worker">Worker</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                  <option value="villager">Villager</option>
                  <option value="health_officer">Health Officer</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>WhatsApp Opt-in</label>
                <input
                  type="checkbox"
                  checked={formData.whatsapp_opt_in}
                  onChange={(e) => setFormData({ ...formData, whatsapp_opt_in: e.target.checked })}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Add Contact</button>
          </form>
        </div>
      )}

      <div className="card">
        <table className="table">
          <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Role</th>
            <th>Village</th>
            <th>Opt-in</th>
            <th>Verified</th>
            <th>Actions</th>
          </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td>{contact.contact_code || '—'}</td>
                <td>{contact.name}</td>
                <td>{contact.phone}</td>
                <td>{contact.role}</td>
                <td>{contact.village_name || contact.notes || '—'}</td>
                <td>{contact.whatsapp_opt_in ? '✅' : '❌'}</td>
                <td>{contact.verified ? '✅' : '❌'}</td>
                <td>
                  <button
                    onClick={() => deleteContact(contact.id)}
                    className="btn btn-sm btn-danger"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

