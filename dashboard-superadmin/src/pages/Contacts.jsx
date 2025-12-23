import React, { useState } from 'react'
import Users from './Users'
import WorkerRequests from './WorkerRequests'
import './Contacts.css'

export default function Contacts() {
  const [activeTab, setActiveTab] = useState('requests') // 'requests', 'users'

  return (
    <div className="contacts-page">
      <div className="page-header">
        <h1>Contacts</h1>
      </div>

      {/* Tab Navigation */}
      <div className="tabs-container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            📋 Requests
          </button>
          <button
            className={`tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            👥 Users
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'requests' && <WorkerRequests />}
        {activeTab === 'users' && <Users />}
      </div>
    </div>
  )
}
