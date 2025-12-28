import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
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
  turbidity: number | null;
  temperature: number | null;
  conductivity: number | null;
  batteryLevel: number | null;
  timestamp: string | null;
}

interface Alert {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  timestamp: string;
}

type Language = 'english' | 'telugu' | 'tamil' | 'hindi';
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
  nearestVillage: { id: string; name: string } | null;
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
    'settings.languageHint': 'Toggle to switch between Telugu, Tamil, Hindi, and English',
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
    'settings.languageHint': 'तेलुगु, तमिल, हिंदी और अंग्रेज़ी के बीच बदलें',
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
    'settings.languageHint': 'తెలుగు, తమిళం, హిందీ మరియు ఇంగ్లీష్ మధ్య మార్చండి',
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
  tamil: {
    'nav.home': 'வீடு',
    'nav.quality': 'நீர் தரம்',
    'nav.timings': 'வழங்கல் நேரம்',
    'nav.alerts': 'எச்சரிக்கைகள்',
    'nav.complaint': 'புகார்',
    'nav.issues': 'பிரச்சினைகள்',
    'nav.settings': 'அமைப்புகள்',
    'home.quickAlerts': 'விரைவு எச்சரிக்கைகள்',
    'home.noAlerts': 'செயலில் உள்ள எச்சரிக்கைகள் இல்லை',
    'home.quickAccess': 'விரைவு அணுகல்',
    'home.waterSupplyStatus': 'நீர் வழங்கல் நிலை',
    'home.nextSupplyTime': 'அடுத்த வழங்கல் நேரம்',
    'home.waterQuality': 'நீர் தரம்',
    'settings.title': 'அமைப்புகள்',
    'settings.subtitle': 'உங்கள் விருப்பங்களை தனிப்பயனாக்கவும்',
    'settings.language': 'மொழி',
    'settings.languageDescription': 'பயன்பாட்டு மொழி',
    'settings.languageHint': 'தெலுங்கு, தமிழ், இந்தி மற்றும் ஆங்கிலம் இடையே மாற்றவும்',
    'settings.notifications': 'அறிவிப்புகள்',
    'settings.notificationsTitle': 'புஷ் அறிவிப்புகள்',
    'settings.notificationsDescription': 'நீர் வழங்கல் மற்றும் தரம் பற்றிய எச்சரிக்கைகளைப் பெறுங்கள்',
    'settings.whatsapp': 'வாட்ஸ்அப் எச்சரிக்கைகள்',
    'settings.whatsappTitle': 'வாட்ஸ்அப் புதுப்பிப்புகள்',
    'settings.whatsappDescription': 'வாட்ஸ்அப்பில் முக்கியமான புதுப்பிப்புகளைப் பெறுங்கள்',
    'settings.theme': 'தீம்',
    'settings.themeLight': 'வெளிச்ச முறை',
    'settings.themeDark': 'இருண்ட முறை',
    'settings.themeDescription': 'வெளிச்ச மற்றும் இருண்ட முறை இடையே மாற்றவும்',
    'settings.appVersion': 'பயன்பாட்டு பதிப்பு',
  },
};

export const WaterProvider = ({ children }: { children: ReactNode }) => {
  const [supply, setSupply] = useState<WaterSupplyData>(defaultSupply);
  const [quality, setQuality] = useState<WaterQualityData>(defaultQuality);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>({
    pressure: null,
    flowRate: null,
    ph: null,
    turbidity: null,
    temperature: null,
    conductivity: null,
    batteryLevel: null,
    timestamp: null,
  });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [nearestVillage, setNearestVillage] = useState<{ id: string; name: string } | null>(null);

  // Auth token from mobile login, used for authenticated API calls
  const { token } = useAuth();

  const {
    status: locationStatus,
    error: locationError,
    coords,
    requestLocation,
  } = useUserLocation();

  // Helper function to find nearest village (same as dashboard)
  const findNearestVillage = useCallback(async (lat: number, lon: number) => {
    try {
      const villagesRes = await fetch(`${API_BASE_URL}/api/gis/villages`);
      if (!villagesRes.ok) return null;
      
      const villages = await villagesRes.json();
      if (!Array.isArray(villages) || villages.length === 0) return null;

      // First, try to find K. Kotturu village (auto-select if available)
      const kotturuVillage = villages.find((v: any) => {
        const name = String(v.name || '').toLowerCase();
        return name.includes('kotturu') || name.includes('k. kotturu') || name === 'k kotturu';
      });

      if (kotturuVillage && kotturuVillage.id) {
        console.log('Auto-selecting K. Kotturu village:', kotturuVillage.name);
        return { id: kotturuVillage.id, name: kotturuVillage.name || 'K. Kotturu' };
      }

      // If K. Kotturu not found, use GPS-based nearest village
      const toRadians = (value: number) => (value * Math.PI) / 180;
      const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371000;
        const dLat = toRadians(lat2 - lat1);
        const dLon = toRadians(lon2 - lon1);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      let closest = null;
      let bestDistance = Infinity;
      villages.forEach((village: any) => {
        if (village.gps_lat == null || village.gps_lon == null) return;
        const distance = getDistanceMeters(
          lat,
          lon,
          parseFloat(village.gps_lat),
          parseFloat(village.gps_lon),
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          closest = village;
        }
      });

      if (closest && closest.id) {
        return { id: closest.id, name: closest.name || 'Unknown' };
      }
      return null;
    } catch (error) {
      console.warn('Failed to find nearest village:', error);
      return null;
    }
  }, []);

  // Auto-select K. Kotturu on mount, then update when location changes
  useEffect(() => {
    // First, try to auto-select K. Kotturu without needing location
    async function autoSelectKotturu() {
      try {
        const villagesRes = await fetch(`${API_BASE_URL}/api/gis/villages`);
        if (!villagesRes.ok) return;
        
        const villages = await villagesRes.json();
        if (!Array.isArray(villages) || villages.length === 0) return;

        // Find K. Kotturu village
        const kotturuVillage = villages.find((v: any) => {
          const name = String(v.name || '').toLowerCase();
          return name.includes('kotturu') || name.includes('k. kotturu') || name === 'k kotturu';
        });

        if (kotturuVillage && kotturuVillage.id && !nearestVillage) {
          console.log('Auto-selecting K. Kotturu village:', kotturuVillage.name);
          setNearestVillage({ id: kotturuVillage.id, name: kotturuVillage.name || 'K. Kotturu' });
          return; // Don't override with GPS if K. Kotturu is found
        }
      } catch (error) {
        console.warn('Failed to auto-select K. Kotturu:', error);
      }
    }

    // Try to auto-select K. Kotturu first
    autoSelectKotturu();

    // Then, if location is granted, use GPS-based selection (but don't override K. Kotturu if already set)
    if (locationStatus === 'granted' && coords && !nearestVillage) {
      findNearestVillage(coords.lat, coords.lon).then((village) => {
        if (village) {
          setNearestVillage(village);
        }
      });
    }
  }, [locationStatus, coords, findNearestVillage, nearestVillage]);

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

  // Helper function to check if reading indicates water supply (same logic as backend mobileService)
  const readingIndicatesSupply = (reading: any): boolean => {
    if (!reading) return false;
    const pumpStatus = reading.pump_status?.toLowerCase?.() === 'on';
    const flow = reading.flow_rate != null 
      ? (typeof reading.flow_rate === 'string' ? parseFloat(reading.flow_rate) : reading.flow_rate)
      : null;
    // Same threshold as backend: SUPPLY_FLOW_THRESHOLD = 5
    return pumpStatus || (flow !== null && flow > 5);
  };

  // Calculate water quality dynamically (same logic as backend telemetryService)
  const calculateWaterQuality = (turbidity: number | null, ph: number | null, temperature: number | null, conductivity: number | null): { status: 'safe' | 'moderate' | 'unsafe'; wqi: number } => {
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

    const scoreTurbidity = (turb: number | null): number => {
      if (turb === null || turb === undefined) return 60;
      return clamp(100 - (clamp(turb, 0, 50) / 50) * 100, 0, 100);
    };

    const scorePH = (phValue: number | null): number => {
      if (phValue === null || phValue === undefined) return 70;
      const ideal = 7.4;
      const deviation = Math.abs(phValue - ideal);
      if (deviation >= 3) return 0;
      return clamp(100 - (deviation / 3) * 100, 0, 100);
    };

    const scoreTemperature = (temp: number | null): number => {
      if (temp === null || temp === undefined) return 70;
      if (temp >= 15 && temp <= 30) return 100;
      const deviation = Math.min(Math.abs(temp - 22.5), 15);
      return clamp(100 - (deviation / 15) * 100, 0, 100);
    };

    const scoreConductivity = (cond: number | null): number => {
      if (cond === null || cond === undefined) return 65;
      return clamp(100 - ((clamp(cond, 0, 1500) - 250) / 1250) * 100, 0, 100);
    };

    const turbidityScore = scoreTurbidity(turbidity);
    const phScore = scorePH(ph);
    const tempScore = scoreTemperature(temperature);
    const condScore = scoreConductivity(conductivity);

    // Weighted WQI (same weights as backend: 0.3, 0.3, 0.2, 0.2)
    const wqi = (
      turbidityScore * 0.3 +
      phScore * 0.3 +
      tempScore * 0.2 +
      condScore * 0.2
    );

    // Classify WQI (same as backend)
    let status: 'safe' | 'moderate' | 'unsafe';
    if (wqi >= 80) {
      status = 'safe'; // 'good' maps to 'safe'
    } else if (wqi >= 60) {
      status = 'moderate'; // 'average' maps to 'moderate'
    } else {
      status = 'unsafe'; // 'bad' maps to 'unsafe'
    }

    return { status, wqi: Math.round(wqi * 100) / 100 };
  };

  // Calculate supply timings from telemetry data (same logic as backend mobileService)
  const calculateSupplyTimings = (telemetry: any[]): {
    isSupplying: boolean;
    nextSupplyTime: string;
    lastSupplyDuration: number;
    history: SupplyHistoryEntry[];
    prediction: SupplyPrediction;
  } => {
    if (!telemetry || telemetry.length === 0) {
      return {
        isSupplying: false,
        nextSupplyTime: 'TBD',
        lastSupplyDuration: 0,
        history: [],
        prediction: { time: 'TBD', confidence: 0 },
      };
    }

    // Check if currently supplying (check first 5 readings)
    const isSupplying = telemetry.slice(0, 5).some(readingIndicatesSupply);

    // Get all "on" events sorted by timestamp (newest first)
    const onEvents = telemetry
      .filter(readingIndicatesSupply)
      .map((r) => new Date(r.timestamp))
      .sort((a, b) => b.getTime() - a.getTime());

    // Calculate last supply duration
    let lastSupplyDuration = 0;
    let sessionStart: Date | null = null;
    for (const reading of telemetry.slice().reverse()) {
      const isOn = readingIndicatesSupply(reading);
      if (isOn && !sessionStart) {
        sessionStart = new Date(reading.timestamp);
      }
      if (!isOn && sessionStart) {
        const sessionEnd = new Date(reading.timestamp);
        lastSupplyDuration = Math.max(0, Math.round((sessionEnd.getTime() - sessionStart.getTime()) / 60000));
        break;
      }
    }
    if (sessionStart && isSupplying) {
      const now = new Date();
      lastSupplyDuration = Math.max(0, Math.round((now.getTime() - sessionStart.getTime()) / 60000));
    }

    // Predict next supply time
    let nextSupplyTime = 'TBD';
    if (isSupplying) {
      nextSupplyTime = 'Supplying now';
    } else if (onEvents.length >= 2) {
      const [latest, previous] = onEvents;
      const intervalMs = Math.max(60 * 60 * 1000, latest.getTime() - previous.getTime());
      const nextTime = new Date(latest.getTime() + intervalMs);
      nextSupplyTime = nextTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } else if (onEvents.length === 1) {
      const nextTime = new Date(onEvents[0].getTime() + 6 * 60 * 60 * 1000);
      nextSupplyTime = nextTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }

    // Build history from telemetry
    const sortedReadings = [...telemetry].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const historyEntries: SupplyHistoryEntry[] = [];
    let currentSessionStart: Date | null = null;

    for (const reading of sortedReadings) {
      const timestamp = new Date(reading.timestamp);
      const pumpOn = readingIndicatesSupply(reading);

      if (pumpOn && !currentSessionStart) {
        currentSessionStart = timestamp;
        continue;
      }

      if (!pumpOn && currentSessionStart) {
        const durationMinutes = Math.max(1, Math.round((timestamp.getTime() - currentSessionStart.getTime()) / 60000));
        historyEntries.push({
          day: currentSessionStart.toLocaleDateString('en-IN', { weekday: 'short' }),
          date: currentSessionStart.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          time: currentSessionStart.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          duration: durationMinutes,
        });
        currentSessionStart = null;
      }
    }

    if (currentSessionStart) {
      const now = new Date();
      const durationMinutes = Math.max(1, Math.round((now.getTime() - currentSessionStart.getTime()) / 60000));
      historyEntries.push({
        day: currentSessionStart.toLocaleDateString('en-IN', { weekday: 'short' }),
        date: currentSessionStart.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        time: currentSessionStart.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        duration: durationMinutes,
      });
    }

    const recentHistory = historyEntries.slice(-7).reverse();
    const predictionConfidence = Math.min(95, Math.max(50, (onEvents.length || 1) * 10 + 50));

    return {
      isSupplying,
      nextSupplyTime,
      lastSupplyDuration,
      history: recentHistory,
      prediction: {
        time: nextSupplyTime,
        confidence: predictionConfidence,
      },
    };
  };

  const fetchDashboard = useCallback(async () => {
    try {
            const toNumber = (v: any): number | null => {
              if (v === null || v === undefined || v === '') return null;
              const n = typeof v === 'string' ? parseFloat(v) : Number(v);
              return Number.isNaN(n) ? null : n;
            };

      // Use exact same APIs as dashboard with village_id filtering
      if (!nearestVillage) {
        // If no village, still fetch general data
        const [telemetryRes, statsRes] = await Promise.allSettled([
          fetch(`${API_BASE_URL}/api/telemetry/live`).then(r => r.ok ? r.json() : []).catch(() => []),
          fetch(`${API_BASE_URL}/api/telemetry/stats/summary`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        let telemetry = telemetryRes.status === 'fulfilled' ? telemetryRes.value : [];
        const stats = statsRes.status === 'fulfilled' ? statsRes.value : null;

        // Sort telemetry by timestamp DESC (newest first) - same as dashboard
        if (Array.isArray(telemetry) && telemetry.length > 0) {
          telemetry = telemetry.sort((a, b) => {
            const timeA = new Date(a.timestamp || 0).getTime();
            const timeB = new Date(b.timestamp || 0).getTime();
            return timeB - timeA; // Newest first
          });
        }

        if (telemetry.length > 0) {
          const latest = telemetry[0];
          setTelemetry({
            pressure: toNumber(latest.pressure),
            flowRate: toNumber(latest.flow_rate),
            ph: toNumber(latest.ph),
            turbidity: toNumber(latest.turbidity),
            temperature: toNumber(latest.temperature),
            conductivity: toNumber(latest.conductivity),
            batteryLevel: toNumber(latest.battery_level),
            timestamp: latest.timestamp || null,
          });
        }

        // Process stats data (same as dashboard) - fallback case when no village
        let avgTurbidity: number | null = null;
        if (stats) {
          avgTurbidity = toNumber(stats.avg_turbidity);
        } else if (telemetry.length > 0) {
          const turbidityValues = telemetry
            .map((t) => toNumber(t.turbidity))
            .filter((v) => v !== null && v > 0);
          avgTurbidity = turbidityValues.length > 0
            ? turbidityValues.reduce((a, b) => a + b, 0) / turbidityValues.length
            : null;
        }

            if (avgTurbidity !== null) {
          setQuality((prev) => ({ ...prev, turbidity: avgTurbidity! }));
        } else if (telemetry.length > 0) {
          const latestTurbidity = toNumber(telemetry[0].turbidity);
          if (latestTurbidity !== null) {
            setQuality((prev) => ({ ...prev, turbidity: latestTurbidity }));
          }
        }

        let waterQuality = null;
        if (stats && stats.water_quality) {
          waterQuality = stats.water_quality;
        } else if (telemetry.length > 0) {
          const latestWithQuality = telemetry.find((reading) => reading.metadata?.water_quality);
          if (latestWithQuality) {
            waterQuality = latestWithQuality.metadata.water_quality;
          }
            }

            if (waterQuality && typeof waterQuality.status === 'string') {
              const status = String(waterQuality.status).toLowerCase();
              let mappedStatus: WaterQualityData['status'] = 'safe';
              if (status === 'average') mappedStatus = 'moderate';
              else if (status === 'bad') mappedStatus = 'unsafe';
          setQuality((prev) => ({ ...prev, status: mappedStatus }));
        }
        return;
      }

      const villageIdParam = `village_id=${encodeURIComponent(nearestVillage.id)}`;
      
      // Use exact same parallel API calls as dashboard (matching dashboard exactly)
      const [telemetryRes, dynamicStatsRes, alertsRes, ticketsRes, devicesRes, statsRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/telemetry/live?${villageIdParam}`).then(r => {
          if (!r.ok) {
            console.warn(`Telemetry API returned ${r.status}`);
            return [];
          }
          return r.json();
        }).catch((err) => {
          console.error('Telemetry fetch error:', err);
          return [];
        }),
        fetch(`${API_BASE_URL}/api/dynamic-stats/alerts-tickets`).then(r => {
          if (!r.ok) return { activeAlerts: 0, openTickets: 0 };
          return r.json();
        }).catch(() => ({ activeAlerts: 0, openTickets: 0 })),
        fetch(`${API_BASE_URL}/api/alerts?acknowledged=false&${villageIdParam}`).then(r => {
          if (!r.ok) return [];
          return r.json();
        }).catch(() => []),
        fetch(`${API_BASE_URL}/api/tickets?status=open&${villageIdParam}`).then(r => {
          if (!r.ok) return [];
          return r.json();
        }).catch(() => []),
        fetch(`${API_BASE_URL}/api/device?${villageIdParam}`).then(r => {
          if (!r.ok) return [];
          return r.json();
        }).catch(() => []),
        fetch(`${API_BASE_URL}/api/telemetry/stats/summary?${villageIdParam}`).then(r => {
          if (!r.ok) return null;
          return r.json();
        }).catch(() => null),
      ]);

      let telemetry = telemetryRes.status === 'fulfilled' ? telemetryRes.value : [];
      const stats = statsRes.status === 'fulfilled' ? statsRes.value : null;

      // Ensure telemetry is an array
      if (!Array.isArray(telemetry)) {
        console.warn('Telemetry is not an array:', telemetry);
        telemetry = [];
      }

      // Sort telemetry by timestamp DESC (newest first) - same as dashboard
      if (telemetry.length > 0) {
        telemetry = telemetry.sort((a, b) => {
          const timeA = new Date(a.timestamp || 0).getTime();
          const timeB = new Date(b.timestamp || 0).getTime();
          return timeB - timeA; // Newest first
        });
      }

      // Process stats data FIRST (same as dashboard) - stats API takes precedence
      // Calculate averages from telemetry if stats unavailable (same logic as dashboard)
      let avgTurbidity: number | null = null;
      let avgPH: number | null = null;
      let avgTemperature: number | null = null;
      let avgConductivity: number | null = null;
      
      if (stats) {
        // Use stats API values (same as dashboard)
        avgTurbidity = toNumber(stats.avg_turbidity ?? stats.avgTurbidity);
        avgPH = toNumber(stats.avg_ph);
        avgTemperature = toNumber(stats.avg_temperature);
        avgConductivity = toNumber(stats.avg_conductivity);
      } else if (telemetry.length > 0) {
        // Calculate from telemetry (same fallback logic as dashboard)
        const turbidityValues = telemetry
          .map((t) => toNumber(t.turbidity))
          .filter((v) => v !== null && v > 0);
        const phValues = telemetry
          .map((t) => toNumber(t.ph ?? t.metadata?.ph))
          .filter((v) => v !== null);
        const tempValues = telemetry
          .map((t) => toNumber(t.temperature ?? t.metadata?.temperature))
          .filter((v) => v !== null);
        const condValues = telemetry
          .map((t) => toNumber(t.conductivity ?? t.metadata?.conductivity))
          .filter((v) => v !== null);

        avgTurbidity = turbidityValues.length > 0
          ? turbidityValues.reduce((a, b) => a + b, 0) / turbidityValues.length
          : null;
        avgPH = phValues.length > 0
          ? phValues.reduce((a, b) => a + b, 0) / phValues.length
          : null;
        avgTemperature = tempValues.length > 0
          ? tempValues.reduce((a, b) => a + b, 0) / tempValues.length
          : null;
        avgConductivity = condValues.length > 0
          ? condValues.reduce((a, b) => a + b, 0) / condValues.length
          : null;
      }

      // Process telemetry data for latest readings (same as dashboard)
      if (telemetry.length > 0) {
        const latest = telemetry[0];
            const pressureRaw = latest.pressure ?? latest.metadata?.pressure;
            const flowRaw = latest.flow_rate ?? latest.flow ?? latest.metadata?.flow_rate;
            const phRaw = latest.ph ?? latest.metadata?.ph;
        const turbidityRaw = latest.turbidity ?? latest.metadata?.turbidity;
        const temperatureRaw = latest.temperature ?? latest.metadata?.temperature;
        const conductivityRaw = latest.conductivity ?? latest.metadata?.conductivity;
        const batteryRaw = latest.battery_level ?? latest.metadata?.battery_level;

        const telemetryValues = {
              pressure: toNumber(pressureRaw),
              flowRate: toNumber(flowRaw),
              ph: toNumber(phRaw),
          turbidity: toNumber(turbidityRaw),
          temperature: toNumber(temperatureRaw),
          conductivity: toNumber(conductivityRaw),
          batteryLevel: toNumber(batteryRaw),
              timestamp: latest.timestamp || null,
        };

        // Always create new telemetry object to ensure React detects changes
        setTelemetry(telemetryValues);

        // Calculate supply timings from telemetry (same logic as backend)
        const supplyTimings = calculateSupplyTimings(telemetry);
        
        // Always create new supply object to ensure React detects changes
        setSupply((prev) => ({
          ...prev,
          isSupplying: supplyTimings.isSupplying,
          nextSupplyTime: supplyTimings.nextSupplyTime,
          lastSupplyDuration: supplyTimings.lastSupplyDuration,
          history: supplyTimings.history,
          prediction: supplyTimings.prediction,
          currentVillageName: nearestVillage.name,
          currentTimestamp: latest.timestamp || prev.currentTimestamp,
          lastUpdated: latest.timestamp || null,
        }));
      }

      // Calculate water quality status (same as dashboard - stats API takes precedence)
      let waterQuality = null;
      if (stats && stats.water_quality) {
        // Use water_quality from stats API (same as dashboard)
        waterQuality = stats.water_quality;
      } else if (telemetry.length > 0) {
        // Try to get from latest telemetry metadata
        const latestWithQuality = telemetry.find((reading) => reading.metadata?.water_quality);
        if (latestWithQuality) {
          waterQuality = latestWithQuality.metadata.water_quality;
        }
      }

      // Update quality status and turbidity (same priority as dashboard)
      if (waterQuality && typeof waterQuality.status === 'string') {
        // Use stats API water_quality status (same as dashboard)
        const status = String(waterQuality.status).toLowerCase();
        let mappedStatus: 'safe' | 'moderate' | 'unsafe' = 'safe';
        if (status === 'average') mappedStatus = 'moderate';
        else if (status === 'bad') mappedStatus = 'unsafe';
        
        setQuality((prev) => {
          // Always create new object to ensure React detects changes
          const newTurbidity = avgTurbidity ?? prev.turbidity ?? 0;
          return {
            ...prev,
            status: mappedStatus,
            turbidity: newTurbidity,
          };
        });
      } else if (avgTurbidity !== null && avgPH !== null && avgTemperature !== null) {
        // Calculate WQI from averages (same as backend) - fallback when stats API doesn't have water_quality
        const calculatedQuality = calculateWaterQuality(avgTurbidity, avgPH, avgTemperature, avgConductivity);
        setQuality((prev) => {
          // Always create new object to ensure React detects changes
          if (prev.status === calculatedQuality.status && prev.turbidity === avgTurbidity) {
            return { ...prev }; // Still create new object reference
          }
          return {
            ...prev,
            status: calculatedQuality.status,
            turbidity: avgTurbidity,
          };
        });
      } else if (telemetry.length > 0) {
        // Fallback: Calculate from latest telemetry reading
        const latest = telemetry[0];
        const latestTurbidity = toNumber(latest.turbidity);
        const latestPH = toNumber(latest.ph ?? latest.metadata?.ph);
        const latestTemp = toNumber(latest.temperature ?? latest.metadata?.temperature);
        const latestCond = toNumber(latest.conductivity ?? latest.metadata?.conductivity);
        
        if (latestTurbidity !== null && latestPH !== null && latestTemp !== null) {
          const calculatedQuality = calculateWaterQuality(latestTurbidity, latestPH, latestTemp, latestCond);
          setQuality((prev) => {
            // Always create new object to ensure React detects changes
            if (prev.status === calculatedQuality.status && prev.turbidity === latestTurbidity) {
              return { ...prev }; // Still create new object reference
            }
            return {
              ...prev,
              status: calculatedQuality.status,
              turbidity: latestTurbidity,
            };
          });
        } else if (latestTurbidity !== null) {
          // At least update turbidity if available
          setQuality((prev) => ({
            ...prev,
            turbidity: latestTurbidity,
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  }, [nearestVillage]);

  const fetchAlerts = useCallback(async () => {
    try {
      // Use same endpoint as dashboard with village_id filtering
      const villageIdParam = nearestVillage ? `village_id=${encodeURIComponent(nearestVillage.id)}` : '';
      const alertsUrl = villageIdParam
        ? `${API_BASE_URL}/api/alerts?acknowledged=false&limit=50&${villageIdParam}`
        : `${API_BASE_URL}/api/alerts?acknowledged=false&limit=50`;

      const alertsRes = await fetch(alertsUrl);
      if (!alertsRes.ok) return;
      const alertsData = await alertsRes.json();
      if (!Array.isArray(alertsData)) return;

      const mapped = alertsData
        .map(mapAlert)
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
      
      // Always create new array to ensure React detects changes
      setAlerts(mapped);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  }, [nearestVillage]);

  useEffect(() => {
    // Start fetching immediately - location is optional for regular users
    // Fetch immediately on mount and when nearestVillage changes
    if (locationStatus === 'granted' || !nearestVillage) {
      // Only fetch if location is granted OR if we don't have a village yet (will fetch general data)
      fetchDashboard();
      fetchAlerts();
    }

    // Sync all data every 5 seconds for real-time updates (same as dashboard)
    // This ensures: Water quality, Quick alerts, Quality page data, Timings page data, Alerts page data all update
    const FIVE_SECONDS = 5 * 1000;
    const intervalDashboard = window.setInterval(() => {
      // Always fetch latest data - functions will use current nearestVillage via closure
      // Fetch even if location not granted yet (will get general data)
      fetchDashboard(); // Updates: supply (timings), quality (turbidity, status), telemetry (pressure, flow, pH)
    }, FIVE_SECONDS);

    // Also refresh alerts on the same 5-second cadence (same as dashboard)
    const intervalAlerts = window.setInterval(() => {
      // Always fetch latest data - functions will use current nearestVillage via closure
      fetchAlerts(); // Updates: alerts data for Home page quick alerts and Alerts page
    }, FIVE_SECONDS);

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
            // Refresh all data when backend sends updates (same as dashboard behavior)
            // This ensures instant updates for: Water quality, Quick alerts, Quality page, Timings page, Alerts page
          if (payload?.type === 'telemetry') {
              // New telemetry from MQTT/AI pipeline → refresh all data immediately
              fetchDashboard(); // Updates: supply (timings), quality (turbidity, status), telemetry (pressure, flow, pH)
              fetchAlerts(); // Updates: alerts data for Home page quick alerts and Alerts page
            }
            // Also refresh on any alert or ticket updates
            if (payload?.type === 'alert' || payload?.type === 'ticket') {
              fetchAlerts(); // Update alerts immediately
              fetchDashboard(); // Refresh dashboard to show updated stats (quality, supply, telemetry)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearestVillage?.id, locationStatus, fetchDashboard, fetchAlerts]); // Include all dependencies to ensure proper updates

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

  // Memoize context value to ensure React detects changes and triggers re-renders
  // This ensures all pages (Home, Quality, Alerts) update dynamically when data changes
  const contextValue = useMemo(
    () => ({
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
        nearestVillage,
    }),
    [supply, quality, telemetry, alerts, settings, locationStatus, locationError, nearestVillage]
  );

  return (
    <WaterContext.Provider value={contextValue}>
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


