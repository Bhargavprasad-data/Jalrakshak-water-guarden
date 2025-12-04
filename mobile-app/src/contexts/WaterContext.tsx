import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useUserLocation } from '@/hooks/use-user-location';
import { useAuth } from './AuthContext';

const apiEnv = (import.meta as any)?.env ?? {};

/**
 * Base URL for the Node backend.
 *
 * - In development on this machine, the backend runs on http://localhost:3000.
 * - When testing on a physical phone, set VITE_API_BASE_URL in the mobile app
 *   (e.g. VITE_API_BASE_URL="http://192.168.1.10:3000") so the phone can reach
 *   your laptop/PC on the LAN.
 */
const API_BASE_URL: string =
  apiEnv.VITE_API_BASE_URL || 'http://localhost:3000';

const SETTINGS_STORAGE_KEY = 'jalrakshak_settings';

interface SupplyHistoryEntry {
  day: string;
  date: string;
  time: string;
  duration: number;
}

interface SupplyPrediction {
  time: string;
  confidence: number;
}

interface WaterSupplyData {
  isSupplying: boolean;
  nextSupplyTime: string;
  lastSupplyDuration: number;
  lastUpdated: string | null;
  currentVillageName?: string | null;
  currentTimestamp?: string | null;
  history: SupplyHistoryEntry[];
  prediction: SupplyPrediction;
}

interface WaterQualityData {
  turbidity: number;
  status: 'safe' | 'moderate' | 'unsafe';
  lastContaminationAlert: string | null;
}

interface TelemetrySnapshot {
  pressure: number | null;
  flowRate: number | null;
  ph: number | null;
  timestamp: string | null;
}

interface Alert {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  timestamp: string;
}

type Language = 'english' | 'telugu' | 'hindi';
type Theme = 'light' | 'dark';

interface Settings {
  language: Language;
  notifications: boolean;
  whatsappAlerts: boolean;
  theme: Theme;
}

interface ComplaintPhotoPayload {
  name: string;
  base64: string;
}

interface ComplaintPayload {
  problemType: string;
  description: string;
  photoUrl?: string | null;
  photo?: ComplaintPhotoPayload | null;
  latitude?: number | null;
  longitude?: number | null;
  villageId?: string | null;
}

interface WaterContextType {
  supply: WaterSupplyData;
  quality: WaterQualityData;
  telemetry: TelemetrySnapshot;
  alerts: Alert[];
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  submitComplaint: (complaint: ComplaintPayload) => Promise<void>;
  t: (key: string) => string;
  locationStatus: string;
  locationError: string | null;
  requestLocation: () => void;
}

const WaterContext = createContext<WaterContextType | undefined>(undefined);

const defaultSupply: WaterSupplyData = {
  isSupplying: false,
  nextSupplyTime: 'TBD',
  lastSupplyDuration: 0,
  lastUpdated: null,
  currentVillageName: null,
  currentTimestamp: null,
  history: [],
  prediction: {
    time: 'TBD',
    confidence: 0,
  },
};

const defaultQuality: WaterQualityData = {
  turbidity: 0,
  status: 'safe',
  lastContaminationAlert: null,
};

const defaultSettings: Settings = {
  language: 'english',
  notifications: true,
  whatsappAlerts: true,
  theme: 'light',
};

const loadSettings = (): Settings => {
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(stored) };
  } catch {
    return defaultSettings;
  }
};

const normalizeAlertType = (type: string) => {
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
};

const mapAlert = (alert: any): Alert => {
  const rawType =
    alert?.type || alert?.alert_type || alert?.anomaly_type || 'alert';
  const type = normalizeAlertType(String(rawType));
  const timestamp =
    alert?.timestamp || alert?.sent_at || alert?.detected_at || alert?.created_at;
  const severity = (alert?.severity || 'medium').toLowerCase();
  const dateValue = timestamp ? new Date(timestamp) : new Date();
  const safeTimestamp = Number.isNaN(dateValue.getTime()) ? new Date() : dateValue;

  return {
    id: String(alert?.id || alert?.alert_id || alert?.device_id || `alert-${Date.now()}`),
    type,
    severity: ['critical', 'high', 'medium', 'low'].includes(severity)
      ? (severity as Alert['severity'])
      : 'medium',
    message:
      alert?.message ||
      `Alert: ${type.replace(/-/g, ' ')}`.replace(/\b\w/g, (c) => c.toUpperCase()),
    timestamp: safeTimestamp.toISOString(),
  };
};

const translations: Record<Language, Record<string, string>> = {
  english: {
    'nav.home': 'Home',
    'nav.quality': 'Quality',
    'nav.timings': 'Timings',
    'nav.alerts': 'Alerts',
    'nav.complaint': 'Complaint',
    'nav.issues': 'Issues',
    'nav.settings': 'Settings',
    'home.quickAlerts': 'Quick Alerts',
    'home.noAlerts': 'No active alerts',
    'home.quickAccess': 'Quick Access',
    'home.waterSupplyStatus': 'Water Supply Status',
    'home.nextSupplyTime': 'Next Supply Time',
    'home.waterQuality': 'Water Quality',
    'settings.title': 'Settings',
    'settings.subtitle': 'Customize your preferences',
    'settings.language': 'Language',
    'settings.languageDescription': 'App language',
    'settings.languageHint': 'Toggle to switch between English and Telugu',
    'settings.notifications': 'Notifications',
    'settings.notificationsTitle': 'Push Notifications',
    'settings.notificationsDescription': 'Get alerts about water supply and quality',
    'settings.whatsapp': 'WhatsApp Alerts',
    'settings.whatsappTitle': 'WhatsApp Updates',
    'settings.whatsappDescription': 'Receive important updates via WhatsApp',
    'settings.theme': 'Theme',
    'settings.themeLight': 'Light Mode',
    'settings.themeDark': 'Dark Mode',
    'settings.themeDescription': 'Switch between light and dark mode',
    'settings.appVersion': 'App Version',
  },
  hindi: {
    'nav.home': 'होम',
    'nav.quality': 'जल गुणवत्ता',
    'nav.timings': 'सप्लाई समय',
    'nav.alerts': 'अलर्ट',
    'nav.complaint': 'शिकायत',
    'nav.issues': 'इश्यूज़',
    'nav.settings': 'सेटिंग्स',
    'home.quickAlerts': 'त्वरित अलर्ट',
    'home.noAlerts': 'कोई सक्रिय अलर्ट नहीं',
    'home.quickAccess': 'त्वरित पहुँच',
    'home.waterSupplyStatus': 'जल आपूर्ति स्थिति',
    'home.nextSupplyTime': 'अगला सप्लाई समय',
    'home.waterQuality': 'जल गुणवत्ता',
    'settings.title': 'सेटिंग्स',
    'settings.subtitle': 'अपनी पसंद को अनुकूलित करें',
    'settings.language': 'भाषा',
    'settings.languageDescription': 'ऐप की भाषा',
    'settings.languageHint': 'अंग्रेज़ी, हिंदी और तेलुगु के बीच बदलें',
    'settings.notifications': 'सूचनाएँ',
    'settings.notificationsTitle': 'पुश सूचनाएँ',
    'settings.notificationsDescription': 'जल आपूर्ति और गुणवत्ता के बारे में अलर्ट प्राप्त करें',
    'settings.whatsapp': 'व्हाट्सऐप अलर्ट',
    'settings.whatsappTitle': 'व्हाट्सऐप अपडेट',
    'settings.whatsappDescription': 'महत्वपूर्ण अपडेट व्हाट्सऐप पर प्राप्त करें',
    'settings.theme': 'थीम',
    'settings.themeLight': 'लाइट मोड',
    'settings.themeDark': 'डार्क मोड',
    'settings.themeDescription': 'लाइट और डार्क मोड के बीच बदलें',
    'settings.appVersion': 'ऐप संस्करण',
  },
  telugu: {
    'nav.home': 'హోమ్',
    'nav.quality': 'నీటి నాణ్యత',
    'nav.timings': 'సప్లై టైమింగ్',
    'nav.alerts': 'అలర్ట్స్',
    'nav.complaint': 'ఫిర్యాదు',
    'nav.issues': 'ఇష్యూస్',
    'nav.settings': 'సెట్టింగ్స్',
    'home.quickAlerts': 'త్వరిత అలర్ట్స్',
    'home.noAlerts': 'సక్రియ అలర్ట్స్ లేవు',
    'home.quickAccess': 'త్వరిత ప్రాప్యత',
    'home.waterSupplyStatus': 'నీటి సరఫరా స్థితి',
    'home.nextSupplyTime': 'తదుపరి సరఫరా సమయం',
    'home.waterQuality': 'నీటి నాణ్యత',
    'settings.title': 'సెట్టింగ్స్',
    'settings.subtitle': 'మీ ఇష్టాలను మార్చుకోండి',
    'settings.language': 'భాష',
    'settings.languageDescription': 'యాప్ భాష',
    'settings.languageHint': 'ఇంగ్లీష్ మరియు తెలుగు మధ్య మార్చండి',
    'settings.notifications': 'నోటిఫికేషన్‌లు',
    'settings.notificationsTitle': 'పుష్ నోటిఫికేషన్‌లు',
    'settings.notificationsDescription': 'నీటి సరఫరా & నాణ్యతపై అలర్ట్స్ పొందండి',
    'settings.whatsapp': 'వాట్సాప్ అలర్ట్స్',
    'settings.whatsappTitle': 'వాట్సాప్ అప్‌డేట్‌లు',
    'settings.whatsappDescription': 'వాట్సాప్ ద్వారా ముఖ్యమైన అప్‌డేట్‌లు పొందండి',
    'settings.theme': 'థీమ్',
    'settings.themeLight': 'లైట్ మోడ్',
    'settings.themeDark': 'డార్క్ మోడ్',
    'settings.themeDescription': 'లైట్ / డార్క్ మోడ్ మార్చండి',
    'settings.appVersion': 'యాప్ వెర్షన్',
  },
};

export const WaterProvider = ({ children }: { children: ReactNode }) => {
  const [supply, setSupply] = useState<WaterSupplyData>(defaultSupply);
  const [quality, setQuality] = useState<WaterQualityData>(defaultQuality);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>({
    pressure: null,
    flowRate: null,
    ph: null,
    timestamp: null,
  });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  // Auth token from mobile login, used for authenticated API calls
  const { token } = useAuth();

  const {
    status: locationStatus,
    error: locationError,
    coords,
    requestLocation,
  } = useUserLocation();

  // Apply theme to <html> element so Tailwind dark mode works
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  const fetchDashboard = useCallback(async () => {
    try {
      if (locationStatus !== 'granted' || !coords) return;

      const url = new URL(`${API_BASE_URL}/api/mobile/dashboard`);
      url.searchParams.set('lat', String(coords.lat));
      url.searchParams.set('lon', String(coords.lon));

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to load live data');
      }
      const data = await response.json();

      if (data.supply) {
        setSupply({
          ...defaultSupply,
          ...data.supply,
        });
      }

      if (data.quality) {
        let baseQuality: WaterQualityData = {
          ...defaultQuality,
          ...data.quality,
          lastContaminationAlert: data.quality.lastContaminationAlert
            ? new Date(data.quality.lastContaminationAlert).toLocaleString()
            : null,
        };

        // Enhance quality using the same stats endpoint as the web dashboard
        // so turbidity and overall status match exactly.
        try {
          const statsRes = await fetch(`${API_BASE_URL}/api/telemetry/stats/summary`);
          if (statsRes.ok) {
            const stats = await statsRes.json();
            const avgTurbidityRaw = stats?.avg_turbidity ?? stats?.avgTurbidity;
            const waterQuality = stats?.water_quality;

            const toNumber = (v: any): number | null => {
              if (v === null || v === undefined || v === '') return null;
              const n = typeof v === 'string' ? parseFloat(v) : Number(v);
              return Number.isNaN(n) ? null : n;
            };

            const avgTurbidity = toNumber(avgTurbidityRaw);
            if (avgTurbidity !== null) {
              baseQuality = {
                ...baseQuality,
                turbidity: avgTurbidity,
              };
            }

            if (waterQuality && typeof waterQuality.status === 'string') {
              const status = String(waterQuality.status).toLowerCase();
              // Map WQI status (good/average/bad) to mobile quality categories
              let mappedStatus: WaterQualityData['status'] = 'safe';
              if (status === 'average') mappedStatus = 'moderate';
              else if (status === 'bad') mappedStatus = 'unsafe';

              baseQuality = {
                ...baseQuality,
                status: mappedStatus,
              };
            }
          }
        } catch {
          // If stats fetch fails, we still keep base quality from mobile dashboard
        }

        setQuality(baseQuality);
      }

      // Latest telemetry snapshot from live endpoint to mirror dashboard
      try {
        const liveRes = await fetch(`${API_BASE_URL}/api/telemetry/live`);
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          const latest = Array.isArray(liveData) && liveData.length > 0 ? liveData[0] : null;
          if (latest) {
            const pressureRaw = latest.pressure ?? latest.metadata?.pressure;
            const flowRaw = latest.flow_rate ?? latest.flow ?? latest.metadata?.flow_rate;
            const phRaw = latest.ph ?? latest.metadata?.ph;

            const toNumber = (v: any): number | null => {
              if (v === null || v === undefined || v === '') return null;
              const n = typeof v === 'string' ? parseFloat(v) : Number(v);
              return Number.isNaN(n) ? null : n;
            };

            setTelemetry({
              pressure: toNumber(pressureRaw),
              flowRate: toNumber(flowRaw),
              ph: toNumber(phRaw),
              timestamp: latest.timestamp || null,
            });
          }
        }
      } catch {
        // ignore live fetch errors, dashboard data still works
      }

      if (Array.isArray(data.alerts)) {
        const mappedAlerts = data.alerts
          .map(mapAlert)
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          );
        setAlerts(mappedAlerts);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  }, [coords, locationStatus]);

  const fetchAlerts = useCallback(async () => {
    try {
      const alertsRes = await fetch(
        `${API_BASE_URL}/api/alerts?acknowledged=false&limit=50`,
      );
      if (!alertsRes.ok) return;
      const alertsData = await alertsRes.json();
      if (!Array.isArray(alertsData)) return;

      const mapped = alertsData
        .map(mapAlert)
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
      setAlerts(mapped);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  }, []);

  useEffect(() => {
    // Wait until location is granted before starting polling
    if (locationStatus !== 'granted') return;

    fetchDashboard();
    fetchAlerts();

    // Sync dashboard data every 30 seconds for real-time updates
    const THIRTY_SECONDS = 30 * 1000;
    const intervalDashboard = window.setInterval(fetchDashboard, THIRTY_SECONDS);

    // Also refresh alerts on the same 30-second cadence.
    const intervalAlerts = window.setInterval(fetchAlerts, THIRTY_SECONDS);

    // Also connect to backend WebSocket and refresh when telemetry arrives.
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY = 5000; // 5 seconds

    const connectWebSocket = () => {
      try {
        const url = new URL(API_BASE_URL);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.pathname = '/ws';
        url.search = '';
        ws = new WebSocket(url.toString());

        ws.onopen = () => {
          console.log('WebSocket connected');
          reconnectAttempts = 0; // Reset on successful connection
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload?.type === 'telemetry') {
              // New telemetry from MQTT/AI pipeline → refresh dashboard summary.
              fetchDashboard();
            }
            // Also refresh on any alert updates
            if (payload?.type === 'alert' || payload?.type === 'ticket') {
              fetchAlerts();
              fetchDashboard();
            }
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onerror = (err) => {
          console.error('WebSocket error, will retry:', err);
        };

        ws.onclose = () => {
          console.log('WebSocket closed');
          // Attempt to reconnect if we haven't exceeded max attempts
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            reconnectTimeout = setTimeout(() => {
              connectWebSocket();
            }, RECONNECT_DELAY);
          }
        };
      } catch (error) {
        console.error('Failed to initialise WebSocket, using polling only:', error);
      }
    };

    connectWebSocket();

    return () => {
      window.clearInterval(intervalDashboard);
      window.clearInterval(intervalAlerts);
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [fetchDashboard, fetchAlerts, locationStatus]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            SETTINGS_STORAGE_KEY,
            JSON.stringify(updated),
          );
        } catch {
          // ignore storage failures
        }
      }
      return updated;
    });
  };

  const t = (key: string): string => {
    const lang = settings.language || 'english';
    return translations[lang]?.[key] ?? translations.english[key] ?? key;
  };

  const submitComplaint = async (complaint: ComplaintPayload) => {
    const derivedPhotoUrl =
      complaint.photoUrl ??
      complaint.photo?.base64 ??
      null;

    const payload = {
      complaint_type: complaint.problemType || 'other',
      description: complaint.description,
      village_id: complaint.villageId || null,
      gps_lat: complaint.latitude ?? null,
      gps_lon: complaint.longitude ?? null,
      photo_url: derivedPhotoUrl,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/mobile/complaints`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error || 'Unable to submit complaint');
    }
  };

  return (
    <WaterContext.Provider
      value={{
        supply,
        quality,
        telemetry,
        alerts,
        settings,
        updateSettings,
        submitComplaint,
        t,
        locationStatus,
        locationError,
        requestLocation,
      }}
    >
      {children}
    </WaterContext.Provider>
  );
};

export const useWater = () => {
  const context = useContext(WaterContext);
  if (context === undefined) {
    throw new Error('useWater must be used within a WaterProvider');
  }
  return context;
};


