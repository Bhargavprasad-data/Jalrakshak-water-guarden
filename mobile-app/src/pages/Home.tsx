import { StatusCard } from '@/components/StatusCard';
import { NavCard } from '@/components/NavCard';
import { BottomNav } from '@/components/BottomNav';
import { useWater } from '@/contexts/WaterContext';
import { Droplet, Clock, Droplets, AlertCircle } from 'lucide-react';
import logo from '@/assets/jalrakshak-logo.jpg';
export default function Home() {
  const { supply, quality, alerts, t } = useWater();
  const getQualityStatus = () => {
    if (quality.status === 'safe') return 'success';
    if (quality.status === 'moderate') return 'warning';
    return 'danger';
  };
  return <div className="min-h-screen bg-muted pb-24">
      <div className="text-primary-foreground p-6 shadow-lg bg-[#0f82a8] flex items-center gap-4">
        <img 
          src={logo} 
          alt="JalRakshak Logo" 
          className="w-16 h-16 object-cover rounded-full"
          style={{
            boxShadow: '0 0 20px rgba(255, 255, 255, 0.5), 0 0 40px rgba(30, 168, 214, 0.4)',
          }}
        />
        <div>
          <h1 className="text-3xl font-bold">JALRAKSHAK</h1>
          <p className="text-sm mt-1 opacity-90">water guardian</p>
          {supply.currentVillageName && (
            <p className="text-xs mt-1 opacity-90">
              {supply.currentVillageName}
            </p>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <div className="space-y-3">
          <StatusCard
            icon={Droplet}
            title={t('home.waterSupplyStatus')}
            value={supply.isSupplying ? 'ON' : 'OFF'}
            status={supply.isSupplying ? 'success' : 'danger'}
          />

          <StatusCard
            icon={Clock}
            title={t('home.nextSupplyTime')}
            value={supply.nextSupplyTime}
          />

          <StatusCard
            icon={Droplets}
            title={t('home.waterQuality')}
            value={`${quality.status.charAt(0).toUpperCase() + quality.status.slice(1)}${Number.isFinite(quality.turbidity) ? ` (${quality.turbidity.toFixed(2)} NTU)` : ''}`}
            status={getQualityStatus()}
          />
        </div>

        <div className="pt-4">
          <h2 className="text-lg font-bold mb-3 px-1">{t('home.quickAlerts')}</h2>
          {alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border p-4 bg-background flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold capitalize">
                      {alert.type.replace(/-/g, ' ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {alert.message}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {new Date(alert.timestamp).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className="text-xs font-semibold uppercase px-2 py-1 rounded-full bg-primary/10 text-primary">
                    {alert.severity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
              {t('home.noAlerts')}
            </div>
          )}
        </div>

        <div className="pt-4">
          <h2 className="text-lg font-bold mb-3 px-1">{t('home.quickAccess')}</h2>
          <div className="space-y-3">
            <NavCard
              icon={Droplets}
              title={t('home.waterQuality')}
              description="Check water safety status"
              path="/quality"
            />
            <NavCard
              icon={Clock}
              title={t('home.nextSupplyTime')}
              description="View supply schedule"
              path="/timings"
            />
            <NavCard
              icon={AlertCircle}
              title={t('home.quickAlerts')}
              description="View all notifications"
              path="/alerts"
            />
          </div>
        </div>
      </div>

      <BottomNav />
    </div>;
}