import { Card, CardContent } from '@/components/ui/card';
import { BottomNav } from '@/components/BottomNav';
import { useWater } from '@/contexts/WaterContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserLocation } from '@/hooks/use-user-location';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Droplet, Wrench, AlertTriangle } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

const apiEnv = (import.meta as any)?.env ?? {};
const API_BASE_URL: string = apiEnv.VITE_API_BASE_URL || 'http://localhost:3000';

interface Alert {
  id: string;
  alert_type?: string;
  type?: string; // For compatibility with WaterContext alerts
  message: string;
  severity: string;
  device_id?: string;
  village_name?: string;
  acknowledged?: boolean;
  detected_at?: string;
  sent_at?: string;
  timestamp?: string;
  confidence?: number;
  location?: string;
}

export default function Alerts() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const { status: locationStatus, coords } = useUserLocation();
  const { alerts: contextAlerts } = useWater(); // Fallback for regular users
  
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    severity: '',
    village: '',
  });
  const [nearestVillage, setNearestVillage] = useState<{ id: string; name: string } | null>(null);
  // Auto-select K. Kotturu on mount, then update when location changes
  useEffect(() => {
    async function autoSelectKotturu() {
      try {
        const villagesRes = await fetch(`${API_BASE_URL}/api/gis/villages`);
        if (!villagesRes.ok) return;
        const villages = await villagesRes.json();
        if (!Array.isArray(villages) || villages.length === 0) return;

        // First, try to find K. Kotturu village (auto-select if available)
        const kotturuVillage = villages.find((v: any) => {
          const name = String(v.name || '').toLowerCase();
          return name.includes('kotturu') || name.includes('k. kotturu') || name === 'k kotturu';
        });

        if (kotturuVillage && kotturuVillage.id && !nearestVillage) {
          console.log('Auto-selecting K. Kotturu village:', kotturuVillage.name);
          setNearestVillage({ id: kotturuVillage.id, name: kotturuVillage.name || 'K. Kotturu' });
          if (!filters.village) {
            setFilters(prev => ({ ...prev, village: kotturuVillage.id }));
          }
          return; // Don't override with GPS if K. Kotturu is found
        }

        // If K. Kotturu not found and location is granted, use GPS-based selection
        if (locationStatus === 'granted' && coords && !nearestVillage) {
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
              coords.lat,
              coords.lon,
              parseFloat(village.gps_lat),
              parseFloat(village.gps_lon),
            );
            if (distance < bestDistance) {
              bestDistance = distance;
              closest = village;
            }
          });

          if (closest && closest.id) {
            setNearestVillage({ id: closest.id, name: closest.name || 'Unknown' });
            if (!filters.village) {
              setFilters(prev => ({ ...prev, village: closest.id }));
            }
          }
        }
      } catch (error) {
        console.error('Failed to find nearest village:', error);
      }
    }
    
    autoSelectKotturu();
  }, [locationStatus, coords, nearestVillage, filters.village]);

  // Fetch alerts (same as dashboard)
  useEffect(() => {
    // For regular users, use context alerts
    if (user?.role !== 'worker') {
      setAlerts(contextAlerts.map(a => ({
        id: a.id,
        type: a.type,
        alert_type: a.type,
        message: a.message,
        severity: a.severity,
        timestamp: a.timestamp,
      })));
      setLoading(false);
      return;
    }

    // For workers, use assigned villages from user context
    const assignedVillages = user?.assigned_villages || [];
    
    if (assignedVillages.length === 0) {
      setAlerts([]);
      setLoading(false);
      // Show message to contact administrator
      return;
    }

    // Use first assigned village (workers typically have one village)
    const targetVillageId = assignedVillages[0];

    const controller = new AbortController();

    async function loadAlerts() {
      try {
        const params: Record<string, string> = {
          village_id: filters.village || targetVillageId || '',
          limit: '1000', // Same limit as dashboard
        };
        if (filters.severity) {
          params.severity = filters.severity;
        }

        const url = new URL(`${API_BASE_URL}/api/alerts`);
        Object.entries(params).forEach(([key, value]) => {
          if (value) url.searchParams.set(key, value);
        });

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(url.toString(), {
          headers,
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load alerts');
        }

        const data = (await res.json()) as Alert[];
        
        // Sort by severity (critical first) and then by timestamp (newest first) - same as dashboard
        const sortedAlerts = (Array.isArray(data) ? data : []).sort((a, b) => {
          // First sort by severity (critical > high > medium > low)
          const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
          const severityDiff = (severityOrder[b.severity || 'low'] || 0) - (severityOrder[a.severity || 'low'] || 0);
          if (severityDiff !== 0) return severityDiff;
          
          // Then sort by timestamp (newest first)
          const timeA = new Date(a.detected_at || a.sent_at || a.timestamp || 0).getTime();
          const timeB = new Date(b.detected_at || b.sent_at || b.timestamp || 0).getTime();
          return timeB - timeA;
        });

        setAlerts(sortedAlerts);
        setLoading(false);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Failed to load alerts', err);
        // Fallback to context alerts for regular users
        if (user?.role !== 'worker') {
          setAlerts(contextAlerts.map(a => ({
            id: a.id,
            type: a.type,
            alert_type: a.type,
            message: a.message,
            severity: a.severity,
            timestamp: a.timestamp,
          })));
        } else {
          toast({
            title: 'Unable to load alerts',
            description: err?.message || 'Please try again later',
            variant: 'destructive',
          });
          setAlerts([]);
        }
        setLoading(false);
      }
    }

    // Fetch immediately
    setLoading(true);
    loadAlerts();

    // Poll for updates every 5 seconds (same as dashboard)
    const FIVE_SECONDS = 5 * 1000;
    const interval = setInterval(() => {
      if (!controller.signal.aborted) {
        // Always fetch - don't check locationStatus/nearestVillage here as they're checked inside loadAlerts
        loadAlerts();
      }
    }, FIVE_SECONDS);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [user, user?.assigned_villages, token, filters.severity, filters.village, contextAlerts, toast]);

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error('Failed to acknowledge');
      toast({ title: 'Alert acknowledged', description: 'Alert has been acknowledged.' });
      // Refresh alerts
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
    } catch (err: any) {
      toast({
        title: 'Failed to acknowledge alert',
        description: err?.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'leak':
        return Droplet;
      case 'unsafe-water':
        return AlertCircle;
      case 'pump-repair':
        return Wrench;
      case 'low-pressure':
        return Droplet;
      case 'tank-cleaning':
        return Wrench;
      default:
        return AlertCircle;
    }
  };
  
  const getAlertColor = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'bg-danger/10 border-danger/30 text-danger';
      case 'medium':
        return 'bg-warning/10 border-warning/30 text-warning';
      case 'low':
        return 'bg-primary/10 border-primary/30 text-primary';
      default:
        return 'bg-muted border-border text-foreground';
    }
  };
  
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      default: return '🔵';
    }
  };
  
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate stats (same as dashboard)
  const criticalAlerts = useMemo(() => alerts.filter(a => a.severity === 'critical'), [alerts]);
  const otherAlerts = useMemo(() => alerts.filter(a => a.severity !== 'critical'), [alerts]);
  const activeCount = useMemo(() => alerts.filter(a => !a.acknowledged).length, [alerts]);
  if (user?.role === 'worker' && locationStatus !== 'granted') {
    return (
      <div className="min-h-screen bg-muted pb-24 flex items-center justify-center">
        <p className="text-sm text-muted-foreground px-4 text-center">
          Please enable location to see nearby alerts.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted pb-24">
      <div className="text-primary-foreground p-6 shadow-lg bg-[#0d80a6]">
        <div className="flex items-center justify-between">
          <div>
        <h1 className="text-3xl font-bold">Alerts</h1>
            <p className="text-sm mt-1 opacity-90">
              {nearestVillage ? `Live alerts near ${nearestVillage.name}` : 'System notifications and warnings'}
            </p>
          </div>
          {user?.role === 'worker' && (
            <div className="flex gap-2">
              <div className="bg-white/20 px-3 py-1.5 rounded-lg text-center">
                <div className="text-lg font-bold">{activeCount}</div>
                <div className="text-xs opacity-90">Active</div>
              </div>
              <div className="bg-white/20 px-3 py-1.5 rounded-lg text-center">
                <div className="text-lg font-bold">{alerts.length}</div>
                <div className="text-xs opacity-90">Total</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Filters for workers (same as dashboard) */}
        {user?.role === 'worker' && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block">Severity</label>
                  <select
                    value={filters.severity}
                    onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value }))}
                    className="w-full px-2 py-1.5 text-sm rounded-md border bg-background"
                  >
                    <option value="">All</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Village</label>
                  <select
                    value={filters.village}
                    onChange={(e) => setFilters(prev => ({ ...prev, village: e.target.value }))}
                    className="w-full px-2 py-1.5 text-sm rounded-md border bg-background"
                  >
                    <option value="">All</option>
                    {nearestVillage && (
                      <option value={nearestVillage.id}>{nearestVillage.name}</option>
                    )}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-sm text-muted-foreground">Loading alerts...</p>
            </CardContent>
          </Card>
        ) : user?.role === 'worker' && (!user?.assigned_villages || user.assigned_villages.length === 0) ? (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle size={64} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No Village Assigned</h3>
              <p className="text-sm text-muted-foreground">
                Please contact your administrator to assign a village to your account.
              </p>
            </CardContent>
          </Card>
        ) : alerts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle size={64} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No Active Alerts</h3>
              <p className="text-sm text-muted-foreground">
                All systems are running normally
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Critical Alerts First (same as dashboard) */}
            {criticalAlerts.length > 0 && (
              <div>
                <h2 className="text-lg font-bold mb-3 px-1">Critical Alerts</h2>
                <div className="space-y-3">
                  {criticalAlerts.map(alert => {
                    const Icon = getAlertIcon(alert.alert_type || alert.type || '');
                    const colorClass = getAlertColor(alert.severity);
                    return (
                      <Card 
                        key={alert.id} 
                        className={cn('border-2', colorClass, !alert.acknowledged && 'animate-pulse')}
                        onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
                      >
                        <CardContent className="p-5">
                          <div className="flex gap-4">
                            <div className="flex-shrink-0">
                              <div className={cn('rounded-full p-3', colorClass)}>
                                <Icon size={32} />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{getSeverityIcon(alert.severity)}</span>
                                  <h3 className="font-bold text-lg capitalize">
                                    {alert.alert_type || alert.type || 'Alert'}
                                  </h3>
                                </div>
                                <span className={cn('text-xs font-semibold px-2 py-1 rounded-full uppercase', 
                                  alert.severity === 'critical' || alert.severity === 'high' ? 'bg-danger text-white' : 
                                  alert.severity === 'medium' ? 'bg-warning text-white' : 
                                  'bg-primary text-white')}>
                                  {alert.severity}
                                </span>
                              </div>
                              <p className="text-sm mb-2 text-foreground/90">{alert.message}</p>
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{alert.device_id ? `Device: ${alert.device_id}` : ''}</span>
                                <span>
                                  {formatDate(alert.detected_at || alert.sent_at || alert.timestamp || '')}
                                </span>
                              </div>
                              {expandedAlert === alert.id && (
                                <div className="mt-3 pt-3 border-t space-y-2">
                                  <div className="text-xs space-y-1">
                                    <div><span className="font-semibold">Alert ID:</span> {alert.id}</div>
                                    {alert.confidence && (
                                      <div><span className="font-semibold">Confidence:</span> {(alert.confidence * 100).toFixed(1)}%</div>
                                    )}
                                    {alert.location && (
                                      <div><span className="font-semibold">Location:</span> {alert.location}</div>
                                    )}
                                  </div>
                                  {!alert.acknowledged && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        acknowledgeAlert(alert.id);
                                      }}
                                      className="w-full px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-semibold"
                                    >
                                      Acknowledge
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Other Alerts */}
            {otherAlerts.length > 0 && (
              <div>
                {criticalAlerts.length > 0 && <h2 className="text-lg font-bold mb-3 px-1">All Alerts</h2>}
                <div className="space-y-3">
                  {otherAlerts.map(alert => {
                    const Icon = getAlertIcon(alert.alert_type || alert.type || '');
          const colorClass = getAlertColor(alert.severity);
                    return (
                      <Card 
                        key={alert.id} 
                        className={cn('border-2', colorClass)}
                        onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
                      >
                  <CardContent className="p-5">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div className={cn('rounded-full p-3', colorClass)}>
                          <Icon size={32} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{getSeverityIcon(alert.severity)}</span>
                          <h3 className="font-bold text-lg capitalize">
                                    {alert.alert_type || alert.type || 'Alert'}
                          </h3>
                                </div>
                                <span className={cn('text-xs font-semibold px-2 py-1 rounded-full uppercase',
                                  alert.severity === 'critical' || alert.severity === 'high' ? 'bg-danger text-white' :
                                  alert.severity === 'medium' ? 'bg-warning text-white' :
                                  'bg-primary text-white')}>
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm mb-2 text-foreground/90">{alert.message}</p>
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{alert.device_id ? `Device: ${alert.device_id}` : ''}</span>
                                <span>
                                  {formatDate(alert.detected_at || alert.sent_at || alert.timestamp || '')}
                                </span>
                              </div>
                              {expandedAlert === alert.id && (
                                <div className="mt-3 pt-3 border-t space-y-2">
                                  <div className="text-xs space-y-1">
                                    <div><span className="font-semibold">Alert ID:</span> {alert.id}</div>
                                    {alert.confidence && (
                                      <div><span className="font-semibold">Confidence:</span> {(alert.confidence * 100).toFixed(1)}%</div>
                                    )}
                                    {alert.location && (
                                      <div><span className="font-semibold">Location:</span> {alert.location}</div>
                                    )}
                                  </div>
                                  {!alert.acknowledged && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        acknowledgeAlert(alert.id);
                                      }}
                                      className="w-full px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-semibold"
                                    >
                                      Acknowledge
                                    </button>
                                  )}
                                </div>
                              )}
                      </div>
                    </div>
                  </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-primary flex-shrink-0 mt-1" size={20} />
              <div className="text-sm">
                <p className="font-semibold mb-1">Alert Guidelines:</p>
                <p className="text-muted-foreground">
                  • <span className="text-danger font-semibold">High</span> - Immediate action required
                  <br />
                  • <span className="text-warning font-semibold">Medium</span> - Attention needed soon
                  <br />
                  • <span className="text-primary font-semibold">Low</span> - Informational
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}