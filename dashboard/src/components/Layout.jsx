import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import logo from '../assets/logo.jpg'
import './Layout.css'

export default function Layout() {
  const location = useLocation()

  const isActive = (path) => location.pathname === path

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="logo-container">
            <img src={logo} alt="JalRakshak Logo" className="logo" />
            <div className="logo-text">
              <h2>JalRakshak</h2>
              <p className="user-info">WATER GUARDIAN</p>
            </div>
          </div>
        </div>
        <ul className="nav-menu">
          <li>
            <Link to="/" className={isActive('/') ? 'active' : ''}>
              📊 Dashboard
            </Link>
          </li>
          <li>
            <Link to="/map" className={isActive('/map') ? 'active' : ''}>
              🗺️ GIS Map
            </Link>
          </li>
          <li>
            <Link to="/alerts" className={isActive('/alerts') ? 'active' : ''}>
              🚨 Alerts
            </Link>
          </li>
          <li>
            <Link to="/tickets" className={isActive('/tickets') ? 'active' : ''}>
              🎫 Issues
            </Link>
          </li>
          
          <li>
            <Link to="/analytics" className={isActive('/analytics') ? 'active' : ''}>
              📈 Analytics
            </Link>
          </li>
          <li>
            <Link to="/contacts" className={isActive('/contacts') ? 'active' : ''}>
              📱 Contacts
            </Link>
          </li>
          <li>
            <Link to="/complaints" className={isActive('/complaints') ? 'active' : ''}>
              📨 Complaints
            </Link>
          </li>
          <li>
            <Link
              to="/ai-insights"
              className={isActive('/ai-insights') ? 'active' : ''}
            >
              🤖 AI Insights
            </Link>
          </li>
        </ul>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

