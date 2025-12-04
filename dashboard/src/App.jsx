import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import Dashboard from './pages/Dashboard'
import GISMap from './pages/GISMap'
import Alerts from './pages/Alerts'
import Tickets from './pages/Tickets'
import Analytics from './pages/Analytics'
import Contacts from './pages/Contacts'
import Complaints from './pages/Complaints'
import AiInsightsDashboard from './pages/AiInsightsDashboard'
import Layout from './components/Layout'
import './App.css'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="map" element={<GISMap />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="ai-insights" element={<AiInsightsDashboard />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="complaints" element={<Complaints />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <Router>
      <AppRoutes />
      <ToastContainer position="top-right" autoClose={3000} />
    </Router>
  )
}

export default App

