import { Card, CardContent } from '@/components/ui/card';
import { BottomNav } from '@/components/BottomNav';
import { useWater } from '@/contexts/WaterContext';
import { AlertCircle, Droplet, Wrench, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
export default function Alerts() {
  const {
    alerts
  } = useWater();
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
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  return <div className="min-h-screen bg-muted pb-24">
      <div className="text-primary-foreground p-6 shadow-lg bg-[#0d80a6]">
        <h1 className="text-3xl font-bold">Alerts</h1>
        <p className="text-sm mt-1 opacity-90">System notifications and warnings</p>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {alerts.length === 0 ? <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle size={64} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No Active Alerts</h3>
              <p className="text-sm text-muted-foreground">
                All systems are running normally
              </p>
            </CardContent>
          </Card> : <div className="space-y-3">
            {alerts.map(alert => {
          const Icon = getAlertIcon(alert.type);
          const colorClass = getAlertColor(alert.severity);
          return <Card key={alert.id} className={cn('border-2', colorClass)}>
                  <CardContent className="p-5">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div className={cn('rounded-full p-3', colorClass)}>
                          <Icon size={32} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-bold text-lg capitalize">
                            {alert.type.replace('-', ' ')}
                          </h3>
                          <span className={cn('text-xs font-semibold px-2 py-1 rounded-full uppercase', alert.severity === 'high' && 'bg-danger text-white', alert.severity === 'medium' && 'bg-warning text-white', alert.severity === 'low' && 'bg-primary text-white')}>
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm mb-2 text-foreground/90">{alert.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(alert.timestamp)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>;
        })}
          </div>}

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
    </div>;
}