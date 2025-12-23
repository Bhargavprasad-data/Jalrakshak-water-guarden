const express = require('express');
const mobileService = require('../services/mobileService');
const ticketService = require('../services/ticketService');
const alertService = require('../services/alertService');
const logger = require('../utils/logger');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    const data = await mobileService.getDashboardData({
      lat: lat !== undefined ? parseFloat(lat) : null,
      lon: lon !== undefined ? parseFloat(lon) : null,
    });
    res.json(data);
  } catch (error) {
    logger.error('Mobile dashboard error:', error);
    res.status(500).json({
      error: 'Failed to load mobile dashboard data',
      message: error.message,
    });
  }
});

// Helper: Haversine distance calculation (same as dashboard)
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: resolve nearest village for a given lat/lon (used for worker tickets)
// Uses Haversine formula to match dashboard's useNearestVillage hook
async function findNearestVillageId(lat, lon) {
  try {
    if (lat === null || lat === undefined || lon === null || lon === undefined) {
      return null;
    }

    // Fetch all villages and calculate distance using Haversine (same as dashboard)
    // This ensures mobile app and dashboard use identical location validation
    const result = await db.query(
      `
        SELECT id, gps_lat, gps_lon
        FROM villages
        WHERE gps_lat IS NOT NULL AND gps_lon IS NOT NULL
      `,
    );

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    let closest = null;
    let bestDistance = Infinity;

    result.rows.forEach((village) => {
      const villageLat = parseFloat(village.gps_lat);
      const villageLon = parseFloat(village.gps_lon);
      if (isNaN(villageLat) || isNaN(villageLon)) return;

      const distance = getDistanceMeters(lat, lon, villageLat, villageLon);
      if (distance < bestDistance) {
        bestDistance = distance;
        closest = village.id;
      }
    });

    return closest;
  } catch (error) {
    logger.error('Failed to find nearest village for worker tickets:', error);
    return null;
  }
}

// Worker: fetch tickets near their current village/location
router.get('/worker/tickets', authenticateToken, async (req, res) => {
  try {
    if (req.user.role && req.user.role !== 'worker') {
      return res.status(403).json({ error: 'Only workers can access worker tickets' });
    }

    const lat = req.query.lat !== undefined ? parseFloat(req.query.lat) : null;
    const lon = req.query.lon !== undefined ? parseFloat(req.query.lon) : null;
    const status = req.query.status || 'open';
    const limit = parseInt(req.query.limit, 10) || 200;

    const villageId = await findNearestVillageId(lat, lon);
    if (!villageId) {
      return res.status(200).json([]);
    }

    // If the worker already has an active ticket (accepted or in progress),
    // hide other open tickets until they complete it.
    if (status === 'open') {
      const active = await ticketService.getTickets({
        village_id: villageId,
        status: 'accepted',
        assigned_to: req.user.id,
        limit: 1,
      });
      const inProgress = await ticketService.getTickets({
        village_id: villageId,
        status: 'in_progress',
        assigned_to: req.user.id,
        limit: 1,
      });
      if ((active && active.length > 0) || (inProgress && inProgress.length > 0)) {
        return res.status(200).json([]);
      }
    }

    const tickets = await ticketService.getTickets({
      village_id: villageId,
      status,
      limit,
    });

    res.json(tickets);
  } catch (error) {
    logger.error('Mobile worker tickets error:', error);
    res.status(500).json({
      error: 'Failed to load worker tickets',
      message: error.message,
    });
  }
});

// Worker: update ticket status (accept → in_progress → completed)
router.post('/worker/tickets/:ticket_id/update-status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role && req.user.role !== 'worker') {
      return res.status(403).json({ error: 'Only workers can update worker tickets' });
    }

    const { ticket_id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const ticket = await ticketService.updateTicketStatus(ticket_id, status, req.user.id, notes || null);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({ message: 'Ticket status updated', ticket });
  } catch (error) {
    logger.error('Mobile worker update ticket error:', error);
    res.status(500).json({
      error: 'Failed to update ticket status',
      message: error.message,
    });
  }
});

// Worker: fetch alerts near their current village/location
router.get('/worker/alerts', authenticateToken, async (req, res) => {
  try {
    if (req.user.role && req.user.role !== 'worker') {
      return res.status(403).json({ error: 'Only workers can access worker alerts' });
    }

    const lat = req.query.lat !== undefined ? parseFloat(req.query.lat) : null;
    const lon = req.query.lon !== undefined ? parseFloat(req.query.lon) : null;
    const limit = parseInt(req.query.limit, 10) || 50;
    const acknowledged = req.query.acknowledged === 'false' ? false : undefined;

    const villageId = await findNearestVillageId(lat, lon);
    
    const alerts = await alertService.getAlerts({
      village_id: villageId || undefined,
      acknowledged,
      limit,
    });

    res.json(alerts);
  } catch (error) {
    logger.error('Mobile worker alerts error:', error);
    res.status(500).json({
      error: 'Failed to load worker alerts',
      message: error.message,
    });
  }
});

// Mobile complaints should be tied to the authenticated user so that
// the dashboard can display reporter name/email for each complaint.
router.post('/complaints', authenticateToken, async (req, res) => {
  try {
    const complaint = await mobileService.submitComplaint(req.body, req.user);
    res.status(201).json({
      message: 'Complaint submitted successfully',
      complaint,
    });
  } catch (error) {
    logger.error('Mobile complaint submission error:', error);
    res.status(500).json({
      error: 'Failed to submit complaint',
      message: error.message,
    });
  }
});

module.exports = router;

