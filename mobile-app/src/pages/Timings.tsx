import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BottomNav } from '@/components/BottomNav';
import { useWater } from '@/contexts/WaterContext';
import { Clock, Calendar, TrendingUp } from 'lucide-react';

export default function Timings() {
  const { supply } = useWater();
  const history = supply.history ?? [];
  const prediction = supply.prediction ?? { time: 'TBD', confidence: 0 };

  return <div className="min-h-screen bg-muted pb-24">
      <div className="text-primary-foreground p-6 shadow-lg bg-[#0d80a6]">
        <h1 className="text-3xl font-bold">Supply Timings</h1>
        <p className="text-sm mt-1 opacity-90">Water supply schedule and history</p>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <Card className="bg-primary text-primary-foreground border-primary">
          <CardContent className="p-6 text-center bg-[#0d80a6]">
            <Clock size={64} className="mx-auto mb-4" />
            <p className="text-sm opacity-90 mb-2">
              {supply.currentVillageName || 'Current Location'}
            </p>
            <p className="text-4xl font-bold mb-1">
              {supply.currentTimestamp
                ? new Date(supply.currentTimestamp).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </p>
            <p className="text-sm opacity-90">
              {supply.currentTimestamp
                ? new Date(supply.currentTimestamp).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'No recent data'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="text-primary" />
              Recent Supply Days
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.length > 0 ? (
              history.map((entry, index) => (
                <div
                  key={`${entry.day}-${entry.time}-${index}`}
                  className="flex items-center justify-between p-4 bg-muted rounded-lg hover:bg-muted/70 transition-colors"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold">
                      {entry.day}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entry.date}
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock size={16} />
                      <span>{entry.time}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-primary">
                        {entry.duration}
                      </span>
                      <span className="text-sm text-muted-foreground ml-1">
                        min
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                No recent supply sessions detected
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-accent text-accent-foreground border-accent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp size={20} />
              AI Prediction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-3">
              Based on recent patterns, the next supply is predicted to start at:
            </p>
            <div className="p-4 bg-background/10 rounded-lg text-center">
              <p className="text-2xl font-bold">{prediction.time}</p>
              <p className="text-sm mt-1 opacity-90">
                Confidence: {prediction.confidence || 0}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 space-y-2 text-sm">
            <p className="font-semibold">💡 Tips:</p>
            <p>• Fill containers during supply hours</p>
            <p>• Check for updates on holidays</p>
            <p>• Report irregular timings immediately</p>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>;
}