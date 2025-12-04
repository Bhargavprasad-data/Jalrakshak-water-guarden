const db = require('../db/connection');
const alertService = require('./alertService');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const SUPPLY_FLOW_THRESHOLD = 5;
const DEFAULT_SUPPLY = {
  isSupplying: false,
  nextSupplyTime: 'TBD',
  lastSupplyDuration: 0,
  lastUpdated: null,
  history: [],
  prediction: {
    time: 'TBD',
    confidence: 0,
  },
};

const DEFAULT_QUALITY = {
  turbidity: 0,
  status: 'safe',
  lastContaminationAlert: null,
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isNaN(num) ? null : num;
};

const readingIndicatesSupply = (reading) => {
  if (!reading) return false;
  const pumpStatus = reading.pump_status?.toLowerCase?.() === 'on';
  const flow = parseNumber(reading.flow_rate);
  return pumpStatus || (flow !== null && flow > SUPPLY_FLOW_THRESHOLD);
};

const formatTimeLabel = (date) => {
  if (!date) return 'TBD';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

async function fetchRecentTelemetrySamples(villageId = null) {
  const params = [];
  let whereClause = '';

  if (villageId) {
    params.push(villageId);
    whereClause = 'WHERE v.id = $1';
  }

  const result = await db.query(
    `
      SELECT 
        t.*,
        d.device_type,
        v.name AS village_name
      FROM telemetry t
      LEFT JOIN devices d ON t.device_id = d.device_id
      LEFT JOIN villages v ON d.village_id = v.id
      ${whereClause}
      ORDER BY t.timestamp DESC
      LIMIT 500
    `,
    params,
  );
  return result.rows || [];
}

function calculateLastSupplyDuration(readings) {
  if (!readings.length) return 0;
  let lastOnTime = null;
  let lastOffTime = null;

  for (const reading of readings) {
    const isOn = readingIndicatesSupply(reading);
    if (isOn && !lastOnTime) {
      lastOnTime = new Date(reading.timestamp);
      continue;
    }
    if (!isOn && lastOnTime) {
      lastOffTime = new Date(reading.timestamp);
      break;
    }
  }

  if (!lastOnTime) return 0;
  if (!lastOffTime) {
    return Math.max(
      0,
      Math.round((Date.now() - lastOnTime.getTime()) / 60000)
    );
  }

  return Math.max(
    0,
    Math.round((lastOnTime.getTime() - lastOffTime.getTime()) / 60000)
  );
}

function predictNextSupplyTime(onEvents, isSupplying, fallbackTimestamp) {
  if (isSupplying) {
    return 'Supplying now';
  }

  if (onEvents.length >= 2) {
    const [latest, previous] = onEvents;
    const intervalMs = Math.max(
      60 * 60 * 1000,
      latest.getTime() - previous.getTime()
    );
    return formatTimeLabel(new Date(latest.getTime() + intervalMs));
  }

  if (onEvents.length === 1) {
    return formatTimeLabel(
      new Date(onEvents[0].getTime() + 6 * 60 * 60 * 1000)
    );
  }

  if (fallbackTimestamp) {
    return formatTimeLabel(
      new Date(new Date(fallbackTimestamp).getTime() + 6 * 60 * 60 * 1000)
    );
  }

  return 'TBD';
}

function buildSupplySummary(telemetryRows) {
  if (!telemetryRows.length) {
    return DEFAULT_SUPPLY;
  }

  let pumpReadings = telemetryRows.filter(
    (row) => row.device_type === 'pump' || row.pump_status !== null
  );

  // If we don't have explicit pump readings, fall back to using ALL telemetry
  // rows and infer supply from flow_rate/pressure. This makes timings work
  // even when devices are only flow/pressure sensors without a dedicated pump
  // device row.
  if (!pumpReadings.length) {
    pumpReadings = telemetryRows;
  }

  const isSupplying = pumpReadings
    .slice(0, 5)
    .some((reading) => readingIndicatesSupply(reading));

  const onEvents = pumpReadings
    .filter((reading) => readingIndicatesSupply(reading))
    .map((reading) => new Date(reading.timestamp))
    .sort((a, b) => b.getTime() - a.getTime());

  const lastSupplyDuration = calculateLastSupplyDuration(pumpReadings);
  const nextSupplyTime = predictNextSupplyTime(
    onEvents,
    isSupplying,
    pumpReadings[0]?.timestamp
  );

  const sortedPumpReadings = [...pumpReadings].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  const historyEntries = [];
  let sessionStart = null;

  for (const reading of sortedPumpReadings) {
    const timestamp = new Date(reading.timestamp);
    const pumpOn = readingIndicatesSupply(reading);

    if (pumpOn && !sessionStart) {
      sessionStart = timestamp;
      continue;
    }

    if (!pumpOn && sessionStart) {
      const durationMinutes = Math.max(
        1,
        Math.round((timestamp.getTime() - sessionStart.getTime()) / 60000)
      );
      historyEntries.push({
        day: sessionStart.toLocaleDateString('en-IN', { weekday: 'short' }),
        date: sessionStart.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        time: sessionStart.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        duration: durationMinutes,
      });
      sessionStart = null;
    }
  }

  if (sessionStart) {
    const now = new Date();
    const durationMinutes = Math.max(
      1,
      Math.round((now.getTime() - sessionStart.getTime()) / 60000)
    );
    historyEntries.push({
      day: sessionStart.toLocaleDateString('en-IN', { weekday: 'short' }),
      date: sessionStart.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      time: sessionStart.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      duration: durationMinutes,
    });
  }

  const recentHistory = historyEntries.slice(-7).reverse();

  const predictionConfidence = Math.min(
    95,
    Math.max(50, (onEvents.length || 1) * 10 + 50)
  );

  const latest = telemetryRows[0] || pumpReadings[0];
  const currentVillageName = latest?.village_name || null;
  const currentTimestamp = latest?.timestamp || null;

  return {
    isSupplying,
    nextSupplyTime,
    lastSupplyDuration,
    lastUpdated: pumpReadings[0]?.timestamp || null,
    currentVillageName,
    currentTimestamp,
    history: recentHistory,
    prediction: {
      time: nextSupplyTime,
      confidence: predictionConfidence,
    },
  };
}

function determineQualityStatus(turbidity, ph) {
  if (
    (turbidity !== null && turbidity > 7) ||
    (ph !== null && (ph < 6.5 || ph > 8.5))
  ) {
    return 'unsafe';
  }
  if (turbidity !== null && turbidity > 4) {
    return 'moderate';
  }
  return 'safe';
}

function normalizeAlertType(type) {
  if (!type) return 'alert';
  const normalized = type.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
  switch (normalized) {
    case 'contamination':
    case 'high-turbidity':
    case 'unsafe-water':
      return 'unsafe-water';
    case 'low-pressure':
    case 'pressure-anomaly':
    case 'high-pressure':
      return 'low-pressure';
    case 'tank-cleaning':
    case 'maintenance':
      return 'tank-cleaning';
    case 'leak':
    case 'leak-detected':
      return 'leak';
    default:
      return normalized;
  }
}

function buildQualitySummary(telemetryRows, alerts) {
  if (!telemetryRows.length) {
    return DEFAULT_QUALITY;
  }

  const qualityReading =
    telemetryRows.find(
      (row) => row.turbidity !== null || row.ph !== null
    ) || telemetryRows[0];

  const turbidity = parseNumber(qualityReading?.turbidity) ?? 0;
  const ph = parseNumber(qualityReading?.ph);
  const status = determineQualityStatus(turbidity, ph);

  const contaminationAlert = (alerts || []).find((alert) => {
    const type =
      alert.alert_type || alert.anomaly_type || alert.type || alert.issue_type;
    const normalized = normalizeAlertType(type);
    return normalized === 'unsafe-water';
  });

  return {
    turbidity,
    status,
    lastContaminationAlert:
      contaminationAlert?.sent_at ||
      contaminationAlert?.detected_at ||
      contaminationAlert?.created_at ||
      null,
  };
}

function mapAlertForMobile(alert) {
  const type = normalizeAlertType(
    alert.alert_type || alert.anomaly_type || alert.type || alert.issue_type
  );
  const severity = (alert.severity || 'medium').toLowerCase();
  const timestamp =
    alert.sent_at ||
    alert.detected_at ||
    alert.created_at ||
    alert.timestamp ||
    new Date().toISOString();

  return {
    id: String(alert.id || alert.alert_id || `dynamic-${Date.now()}`),
    type,
    severity,
    message:
      alert.message ||
      `Alert: ${type.replace(/-/g, ' ')}`.replace(/\b\w/g, (c) =>
        c.toUpperCase()
      ),
    timestamp: new Date(timestamp).toISOString(),
  };
}

async function getDashboardData(options = {}) {
  try {
    const { lat = null, lon = null } = options;

    let villageId = null;
    if (lat !== null && lon !== null) {
      villageId = await findNearestVillageId(lat, lon);
    }

    const telemetryRows = await fetchRecentTelemetrySamples(villageId);
    const alerts = await alertService.getAlerts({
      limit: 30,
      village_id: villageId || undefined,
    });

    return {
      supply: buildSupplySummary(telemetryRows),
      quality: buildQualitySummary(telemetryRows, alerts),
      alerts: alerts.slice(0, 12).map(mapAlertForMobile),
    };
  } catch (error) {
    logger.error('Error building mobile dashboard data:', error);
    throw error;
  }
}

async function findNearestVillageId(lat, lon) {
  try {
    if (lat === null || lat === undefined || lon === null || lon === undefined) {
      return null;
    }

    const result = await db.query(
      `
        SELECT id, gps_lat, gps_lon
        FROM villages
        WHERE gps_lat IS NOT NULL AND gps_lon IS NOT NULL
        ORDER BY (gps_lat - $1)^2 + (gps_lon - $2)^2 ASC
        LIMIT 1
      `,
      [lat, lon],
    );

    return result.rows[0]?.id || null;
  } catch (error) {
    logger.error('Failed to find nearest village for complaint:', error);
    return null;
  }
}

async function saveBase64PhotoIfNeeded(photoUrl) {
  try {
    if (!photoUrl || typeof photoUrl !== 'string') return null;

    // If it's already a normal URL (http/https or /uploads/...), keep as is
    if (!photoUrl.startsWith('data:')) {
      return photoUrl;
    }

    // data:[mime];base64,xxxx
    const match = /^data:(.+);base64,(.+)$/.exec(photoUrl);
    if (!match) {
      return null;
    }

    const mimeType = match[1];
    const base64Data = match[2];

    let ext = '.jpg';
    if (mimeType.includes('png')) ext = '.png';
    else if (mimeType.includes('jpeg')) ext = '.jpg';
    else if (mimeType.includes('webp')) ext = '.webp';

    const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
    const complaintsDir = path.join(uploadsRoot, 'complaints');

    await fs.promises.mkdir(complaintsDir, { recursive: true });

    const fileName = `complaint-${Date.now()}-${uuidv4().substring(0, 8)}${ext}`;
    const filePath = path.join(complaintsDir, fileName);

    await fs.promises.writeFile(filePath, Buffer.from(base64Data, 'base64'));

    // Public URL that dashboard/mobile can use
    return `/uploads/complaints/${fileName}`;
  } catch (error) {
    logger.error('Failed to save complaint photo:', error);
    return null;
  }
}

async function submitComplaint(payload = {}, user = null) {
  const {
    village_id = null,
    complaint_type = 'other',
    description = '',
    gps_lat = null,
    gps_lon = null,
    photo_url = null,
  } = payload;

  if (!description.trim()) {
    throw new Error('Complaint description is required');
  }

  const complaintId = `MOB-${Date.now()}-${uuidv4()
    .substring(0, 6)
    .toUpperCase()}`;

  const lat =
    gps_lat === null || gps_lat === undefined ? null : parseFloat(gps_lat);
  const lon =
    gps_lon === null || gps_lon === undefined ? null : parseFloat(gps_lon);

  // If village_id not provided, try to infer nearest village from GPS
  let resolvedVillageId = village_id;
  if (!resolvedVillageId && lat !== null && lon !== null) {
    resolvedVillageId = await findNearestVillageId(lat, lon);
  }

  // If mobile sends a base64 image, save it under /uploads/complaints and store the URL
  const storedPhotoUrl = await saveBase64PhotoIfNeeded(photo_url);

  const reportedBy = user?.id || null;

  const result = await db.query(
    `
      INSERT INTO complaints (
        complaint_id,
        village_id,
        reported_by,
        complaint_type,
        description,
        gps_lat,
        gps_lon,
        photo_urls
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      complaintId,
      resolvedVillageId,
      reportedBy,
      complaint_type,
      description,
      lat,
      lon,
      storedPhotoUrl ? [storedPhotoUrl] : [],
    ]
  );

  const complaint = result.rows[0];

  // Broadcast new complaint to any connected dashboards/mobile clients
  // so they can update in real time without waiting for the next poll.
  try {
    if (typeof global.broadcastUpdate === 'function') {
      global.broadcastUpdate({
        type: 'complaint',
        data: {
          complaint_id: complaint.complaint_id,
          village_id: complaint.village_id,
          complaint_type: complaint.complaint_type,
          description: complaint.description,
          gps_lat: complaint.gps_lat,
          gps_lon: complaint.gps_lon,
          photo_urls: complaint.photo_urls,
          status: complaint.status,
          created_at: complaint.created_at,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Failed to broadcast new complaint update:', error);
  }

  return {
    complaint_id: complaint.complaint_id,
    status: complaint.status,
    created_at: complaint.created_at,
  };
}

module.exports = {
  getDashboardData,
  submitComplaint,
};

