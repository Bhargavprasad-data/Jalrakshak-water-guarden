import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BottomNav } from '@/components/BottomNav';
import { useWater } from '@/contexts/WaterContext';
import { Droplets, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
export default function Quality() {
  const {
    quality,
    telemetry
  } = useWater();

  const turbidityValue =
    typeof quality.turbidity === 'number' && Number.isFinite(quality.turbidity)
      ? quality.turbidity
      : 0;

  const scaleLabel =
    turbidityValue < 3 ? 'Clean' : turbidityValue < 6 ? 'Moderate' : 'High';
  const getStatusIcon = () => {
    if (quality.status === 'safe') return CheckCircle;
    if (quality.status === 'moderate') return AlertTriangle;
    return XCircle;
  };
  const getStatusColor = () => {
    if (quality.status === 'safe') return 'text-success';
    if (quality.status === 'moderate') return 'text-warning';
    return 'text-danger';
  };
  const getStatusBg = () => {
    if (quality.status === 'safe') return 'bg-success/10 border-success/30';
    if (quality.status === 'moderate') return 'bg-warning/10 border-warning/30';
    return 'bg-danger/10 border-danger/30';
  };
  const StatusIcon = getStatusIcon();
  return <div className="min-h-screen bg-muted pb-24">
      <div className="text-primary-foreground p-6 shadow-lg bg-[#0d80a6]">
        <h1 className="text-3xl font-bold">Water Quality</h1>
        <p className="text-sm mt-1 opacity-90">Real-time water safety monitoring</p>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <Card className={cn('border-2', getStatusBg())}>
          <CardContent className="p-8 text-center">
            <StatusIcon size={80} className={cn('mx-auto mb-4', getStatusColor())} />
            <h2 className="text-3xl font-bold mb-2">
              {quality.status.charAt(0).toUpperCase() + quality.status.slice(1)}
            </h2>
            <p className="text-lg text-muted-foreground">
              {quality.status === 'safe' && '🟢 Safe to drink'}
              {quality.status === 'moderate' && '🟡 Use with caution'}
              {quality.status === 'unsafe' && '🔴 Do not drink'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Droplets className="text-primary" />
              Water Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                <span className="font-semibold">Turbidity</span>
                <span className="text-2xl font-bold text-primary">
                  {turbidityValue.toFixed(2)} <span className="text-sm">NTU</span>
                </span>
              </div>
              <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                <span className="font-semibold">Pressure</span>
                <span className="text-xl font-semibold">
                  {telemetry.pressure != null ? `${telemetry.pressure.toFixed(2)} bar` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                <span className="font-semibold">Flow Rate</span>
                <span className="text-xl font-semibold">
                  {telemetry.flowRate != null ? `${telemetry.flowRate.toFixed(2)} L/min` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                <span className="font-semibold">pH Level</span>
                <span className="text-xl font-semibold">
                  {telemetry.ph != null ? telemetry.ph.toFixed(2) : 'N/A'}
                </span>
              </div>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Scale (0-10)</span>
                <span className="text-sm text-muted-foreground">
                  {scaleLabel}
                </span>
              </div>
              <div className="w-full bg-border rounded-full h-3 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    turbidityValue < 3 && 'bg-success',
                    turbidityValue >= 3 && turbidityValue < 6 && 'bg-warning',
                    turbidityValue >= 6 && 'bg-danger',
                  )}
                  style={{
                    width: `${Math.max(0, Math.min(10, turbidityValue)) / 10 * 100}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last Contamination Alert</CardTitle>
          </CardHeader>
          <CardContent>
            {quality.lastContaminationAlert ? <p className="text-sm">{quality.lastContaminationAlert}</p> : <p className="text-sm text-muted-foreground">No recent contamination detected</p>}
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">Safety Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>✓ Always boil water before drinking if quality is moderate</p>
            <p>✓ Report any unusual color, smell, or taste immediately</p>
            <p>✓ Store water in clean, covered containers</p>
            <p>✓ Check quality status daily</p>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>;
}