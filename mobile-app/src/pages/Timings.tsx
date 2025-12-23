import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BottomNav } from '@/components/BottomNav';
import { useWater } from '@/contexts/WaterContext';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, Calendar, TrendingUp, RefreshCw } from 'lucide-react';

const apiEnv = (import.meta as any)?.env ?? {};
const API_BASE_URL: string = apiEnv.VITE_API_BASE_URL || 'http://localhost:3000';

interface WaterSupplyTiming {
  id: string;
  village_id: string;
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  notes: string | null;
  is_active: boolean;
  village_name?: string;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Helper function to normalize village name for matching
function normalizeVillageName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Helper function to check if village names match (multiple strategies)
function villageNameMatches(villageName: string, targetName: string): boolean {
  const normalized1 = normalizeVillageName(villageName);
  const normalized2 = normalizeVillageName(targetName);
  
  // Exact match
  if (normalized1 === normalized2) return true;
  
  // Partial match (one contains the other)
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true;
  
  // Word-based matching (check if significant words match)
  const words1 = normalized1.split(' ').filter(w => w.length > 2);
  const words2 = normalized2.split(' ').filter(w => w.length > 2);
  const commonWords = words1.filter(w => words2.includes(w));
  if (commonWords.length > 0 && commonWords.length >= Math.min(words1.length, words2.length) / 2) {
    return true;
  }
  
  return false;
}

export default function Timings() {
  const { supply, nearestVillage } = useWater();
  const { user } = useAuth();
  const [timings, setTimings] = useState<WaterSupplyTiming[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Determine which village to use (prioritize assigned villages for workers, then "Bobbili Kothapeta", then nearestVillage)
  const getTargetVillage = useCallback(() => {
    // Priority 1: For workers, use assigned villages from user context
    if (user && user.role === 'worker' && user.assigned_villages && user.assigned_villages.length > 0) {
      return { id: user.assigned_villages[0], name: null }; // Will fetch village name from API
    }
    
    // Priority 2: "Bobbili Kothapeta" as default
    const defaultVillage = { id: null, name: 'Bobbili Kothapeta' };
    
    // Priority 3: Nearest village from location
    if (nearestVillage?.id && nearestVillage?.name) {
      return nearestVillage;
    }
    
    // Priority 4: Village from user context (supply.currentVillageName)
    if (supply.currentVillageName) {
      return { id: null, name: supply.currentVillageName };
    }
    
    // Fallback to default
    return defaultVillage;
  }, [nearestVillage, supply.currentVillageName, user]);

  const fetchTimings = useCallback(async () => {
    try {
      setError(null);
      const targetVillage = getTargetVillage();
      
      let fetchedTimings: WaterSupplyTiming[] = [];
      
      // Strategy 1: Try fetching by village ID if available
      if (targetVillage.id) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/water-supply-timings/village/${targetVillage.id}`);
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
              fetchedTimings = data;
              setTimings(fetchedTimings);
              setLastRefresh(new Date());
              setLoading(false);
              return;
            }
          }
        } catch (err) {
          console.warn('Failed to fetch timings by village ID:', err);
        }
      }
      
      // Strategy 2: Fallback to fetching all timings and filtering by village name
      try {
        const response = await fetch(`${API_BASE_URL}/api/water-supply-timings?is_active=true`);
        if (response.ok) {
          const allTimings: WaterSupplyTiming[] = await response.json();
          
          // Filter by village name using multiple matching strategies
          if (targetVillage.name) {
            fetchedTimings = allTimings.filter(timing => 
              timing.village_name && villageNameMatches(timing.village_name, targetVillage.name)
            );
          } else {
            fetchedTimings = allTimings;
          }
          
          if (fetchedTimings.length > 0) {
            setTimings(fetchedTimings);
            setLastRefresh(new Date());
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Failed to fetch all timings:', err);
      }
      
      // If we get here, no timings were found
      setTimings([]);
      setError('No water supply timings found for your village');
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching water supply timings:', err);
      setError('Failed to load water supply timings');
      setTimings([]);
    } finally {
      setLoading(false);
    }
  }, [getTargetVillage]);

  useEffect(() => {
    fetchTimings();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchTimings();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [fetchTimings]);

  // Group timings by day of week
  const timingsByDay = DAYS_OF_WEEK.map((dayName, index) => ({
    dayName,
    dayIndex: index,
    timings: timings.filter(t => t.day_of_week === index).sort((a, b) => {
      // Sort by start time
      return a.start_time.localeCompare(b.start_time);
    })
  }));

  // Get current day
  const currentDayIndex = new Date().getDay();
  const currentDayTimings = timingsByDay[currentDayIndex];

  // Format time (HH:MM:SS -> HH:MM)
  const formatTime = (time: string) => {
    if (!time) return '';
    const parts = time.split(':');
    return `${parts[0]}:${parts[1]}`;
  };

  // Format duration
  const formatDuration = (minutes: number) => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Check if a timing is upcoming today
  const isUpcoming = (timing: WaterSupplyTiming) => {
    if (timing.day_of_week !== currentDayIndex) return false;
    const now = new Date();
    const [hours, minutes] = timing.start_time.split(':').map(Number);
    const startTime = new Date();
    startTime.setHours(hours, minutes, 0, 0);
    return startTime > now;
  };

  // Get next upcoming timing
  const getNextUpcoming = () => {
    const todayTimings = currentDayTimings?.timings || [];
    const upcoming = todayTimings.find(isUpcoming);
    if (upcoming) return upcoming;
    
    // Check next 7 days
    for (let i = 1; i <= 7; i++) {
      const dayIndex = (currentDayIndex + i) % 7;
      const dayTimings = timingsByDay[dayIndex];
      if (dayTimings.timings.length > 0) {
        return dayTimings.timings[0];
      }
    }
    return null;
  };

  const nextUpcoming = getNextUpcoming();
  const targetVillage = getTargetVillage();

  if (loading) {
    return (
      <div className="min-h-screen bg-muted pb-24 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading water supply timings...</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted pb-24">
      <div className="text-primary-foreground p-6 shadow-lg bg-[#0d80a6]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Supply Timings</h1>
            <p className="text-sm mt-1 opacity-90">
              {targetVillage.name || 'Water supply schedule'}
            </p>
          </div>
          <button
            onClick={fetchTimings}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
        {lastRefresh && (
          <p className="text-xs mt-2 opacity-75">
            Last updated: {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {error && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">{error}</p>
            </CardContent>
          </Card>
        )}

        {user?.role === 'worker' && (!user?.assigned_villages || user.assigned_villages.length === 0) && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                No village assigned to your account. Please contact your administrator to assign a village.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Next Upcoming Timing */}
        {nextUpcoming && (
          <Card className="bg-primary text-primary-foreground border-primary">
            <CardContent className="p-6 text-center bg-[#0d80a6]">
              <Clock size={48} className="mx-auto mb-3" />
              <p className="text-sm opacity-90 mb-2">Next Supply</p>
              <p className="text-3xl font-bold mb-1">
                {formatTime(nextUpcoming.start_time)} - {formatTime(nextUpcoming.end_time)}
              </p>
              <p className="text-sm opacity-90">
                {DAYS_OF_WEEK[nextUpcoming.day_of_week]} • {formatDuration(nextUpcoming.duration_minutes)}
              </p>
              {nextUpcoming.notes && (
                <p className="text-xs mt-2 opacity-75">{nextUpcoming.notes}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Current Day's Timings (Prominently Displayed) */}
        {currentDayTimings && currentDayTimings.timings.length > 0 && (
          <Card className="border-primary border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="text-primary" />
                Today ({DAYS_OF_WEEK[currentDayIndex]})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {currentDayTimings.timings.map((timing) => (
                <div
                  key={timing.id}
                  className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                    isUpcoming(timing)
                      ? 'bg-primary/10 border-2 border-primary'
                      : 'bg-muted hover:bg-muted/70'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className={isUpcoming(timing) ? 'text-primary' : 'text-muted-foreground'} />
                      <span className={`text-sm font-semibold ${isUpcoming(timing) ? 'text-primary' : ''}`}>
                        {formatTime(timing.start_time)} - {formatTime(timing.end_time)}
                      </span>
                      {isUpcoming(timing) && (
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                          Upcoming
                        </span>
                      )}
                    </div>
                    {timing.notes && (
                      <span className="text-xs text-muted-foreground">{timing.notes}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-primary">
                      {formatDuration(timing.duration_minutes)}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Weekly Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="text-primary" />
              Weekly Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {timingsByDay.map((day) => {
              if (day.timings.length === 0) return null;
              
              const isToday = day.dayIndex === currentDayIndex;
              
              return (
                <div key={day.dayIndex} className={isToday ? 'border-l-4 border-primary pl-4' : ''}>
                  <h3 className={`font-semibold mb-2 ${isToday ? 'text-primary' : ''}`}>
                    {day.dayName} {isToday && '(Today)'}
                  </h3>
                  <div className="space-y-2">
                    {day.timings.map((timing) => (
                      <div
                        key={timing.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/70 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-muted-foreground" />
                          <span className="text-sm">
                            {formatTime(timing.start_time)} - {formatTime(timing.end_time)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {timing.notes && (
                            <span className="text-xs text-muted-foreground max-w-[100px] truncate" title={timing.notes}>
                              {timing.notes}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-primary">
                            {formatDuration(timing.duration_minutes)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {timings.length === 0 && !error && (
          <Card>
            <CardContent className="p-6 text-center">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">No water supply timings available</p>
              <p className="text-sm text-muted-foreground mt-2">
                Contact your local water authority for schedule information
              </p>
            </CardContent>
          </Card>
        )}

        {/* Tips Card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 space-y-2 text-sm">
            <p className="font-semibold">💡 Tips:</p>
            <p>• Fill containers during supply hours</p>
            <p>• Check for updates on holidays</p>
            <p>• Report irregular timings immediately</p>
            <p>• Timings refresh automatically every 30 seconds</p>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}
