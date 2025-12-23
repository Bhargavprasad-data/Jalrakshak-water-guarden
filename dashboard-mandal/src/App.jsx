import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import GISMap from './pages/GISMap'
import Alerts from './pages/Alerts'
import Tickets from './pages/Tickets'
import Analytics from './pages/Analytics'
import Contacts from './pages/Contacts'
import Complaints from './pages/Complaints'
import AiInsightsDashboard from './pages/AiInsightsDashboard'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import './App.css'

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="map" element={<GISMap />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="ai-insights" element={<AiInsightsDashboard />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="complaints" element={<Complaints />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <ToastContainer position="top-right" autoClose={3000} />
      </Router>
    </AuthProvider>
  )
}

export default App

