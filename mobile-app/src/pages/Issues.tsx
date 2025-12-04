import { useEffect, useState } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useUserLocation } from '@/hooks/use-user-location';

type TicketStatus = 'open' | 'accepted' | 'in_progress' | 'completed' | 'closed';

interface Ticket {
  id: string;
  ticket_id: string;
  device_id: string;
  issue_type: string;
  description: string | null;
  severity: string;
  status: TicketStatus;
  village_name?: string | null;
  created_at: string;
}

const apiEnv = (import.meta as any)?.env ?? {};
const API_BASE_URL: string = apiEnv.VITE_API_BASE_URL || 'http://localhost:3000';

export default function Issues() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const { status: locationStatus, coords } = useUserLocation();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TicketStatus>('open');
   const [updatingId, setUpdatingId] = useState<string | null>(null);

  const reload = () => {
    // Trigger useEffect by toggling activeTab to itself (no-op but dependency)
    setActiveTab((prev) => prev);
  };

  useEffect(() => {
    if (!user || user.role !== 'worker') return;
    if (locationStatus !== 'granted' || !coords) return;

    const controller = new AbortController();

    async function loadTickets() {
      try {
        const url = new URL(`${API_BASE_URL}/api/mobile/worker/tickets`);
        url.searchParams.set('lat', String(coords.lat));
        url.searchParams.set('lon', String(coords.lon));
        url.searchParams.set('status', activeTab);
        url.searchParams.set('limit', '200');

        const headers: Record<string, string> = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(url.toString(), {
          headers,
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load tickets');
        }

        const data = (await res.json()) as Ticket[];
        setTickets(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Failed to load worker tickets', err);
        toast({
          title: 'Unable to load issues',
          description: err?.message || 'Please try again later',
          variant: 'destructive',
        });
        setTickets([]);
      } finally {
        setLoading(false);
      }
    }

    setLoading(true);
    loadTickets();

    // Poll for updates every 30 seconds
    const THIRTY_SECONDS = 30 * 1000;
    const interval = setInterval(() => {
      if (!controller.signal.aborted) {
        loadTickets();
      }
    }, THIRTY_SECONDS);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [user, token, coords, locationStatus, activeTab, toast]);

  const hasActiveTicket = tickets.some(
    (t) => t.status === 'accepted' || t.status === 'in_progress',
  );

  const visibleTickets =
    activeTab === 'open' && hasActiveTicket
      ? []
      : tickets.filter((t) => t.status === activeTab);

  const updateStatus = async (ticketId: string, nextStatus: TicketStatus) => {
    try {
      setUpdatingId(ticketId);
      const res = await fetch(
        `${API_BASE_URL}/api/mobile/worker/tickets/${ticketId}/update-status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update ticket');
      }

      // Show a small confirmation to the worker
      const label =
        nextStatus === 'accepted'
          ? 'Accepted'
          : nextStatus === 'in_progress'
          ? 'Started'
          : nextStatus === 'completed'
          ? 'Completed'
          : 'Updated';

      toast({
        title: `Issue ${label}`,
        description: `Ticket status changed to ${label}.`,
      });

      // Refresh current tab
      reload();
    } catch (err: any) {
      console.error('Failed to update ticket status', err);
      toast({
        title: 'Unable to update issue',
        description: err?.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  if (!user || user.role !== 'worker') {
    return (
      <div className="min-h-screen bg-muted pb-24 flex items-center justify-center">
        <p className="text-sm text-muted-foreground px-4 text-center">
          Issues view is only available for worker accounts.
        </p>
      </div>
    );
  }

  if (locationStatus !== 'granted') {
    return (
      <div className="min-h-screen bg-muted pb-24 flex items-center justify-center">
        <p className="text-sm text-muted-foreground px-4 text-center">
          Please enable location to see nearby issues.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted pb-24">
      <div className="text-primary-foreground p-6 shadow-lg bg-[#0d80a6]">
        <h1 className="text-3xl font-bold">Issues</h1>
        <p className="text-sm mt-1 opacity-90">
          Tickets near your assigned village/location
        </p>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <div className="flex gap-2 mb-2">
          {(['open', 'accepted', 'in_progress', 'completed'] as TicketStatus[]).map(
            (status) => (
              <button
                key={status}
                type="button"
                onClick={() => setActiveTab(status)}
                className={`flex-1 px-3 py-2 rounded-full text-xs font-semibold ${
                  activeTab === status
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground border border-border'
                }`}
              >
                {status.replace('_', ' ').toUpperCase()}
              </button>
            ),
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Loading tickets...
          </p>
        ) : visibleTickets.length === 0 ? (
          <div className="text-center py-10 border border-dashed rounded-lg bg-background">
            <p className="text-lg font-semibold mb-1">No tickets</p>
            <p className="text-sm text-muted-foreground">
              There are no {activeTab.replace('_', ' ')} tickets near you.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleTickets.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border bg-card p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-mono text-muted-foreground">
                    #{t.ticket_id}
                  </div>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                    {t.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div>
                  <h2 className="text-sm font-semibold capitalize">
                    {t.issue_type.replace(/_/g, ' ')}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {t.description || 'No description provided'}
                  </p>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{t.village_name || 'Unknown village'}</span>
                  <span>
                    {new Date(t.created_at).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: '2-digit',
                    })}
                  </span>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  {t.status === 'open' && (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60"
                      disabled={updatingId === t.id}
                      onClick={() => updateStatus(t.id, 'accepted')}
                    >
                      {updatingId === t.id ? 'Accepting...' : 'Accept'}
                    </button>
                  )}
                  {t.status === 'accepted' && (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60"
                      disabled={updatingId === t.id}
                      onClick={() => updateStatus(t.id, 'in_progress')}
                    >
                      {updatingId === t.id ? 'Starting...' : 'Start'}
                    </button>
                  )}
                  {t.status === 'in_progress' && (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-md bg-green-600 text-primary-foreground text-xs font-semibold disabled:opacity-60"
                      disabled={updatingId === t.id}
                      onClick={() => updateStatus(t.id, 'completed')}
                    >
                      {updatingId === t.id ? 'Completing...' : 'Complete'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}


