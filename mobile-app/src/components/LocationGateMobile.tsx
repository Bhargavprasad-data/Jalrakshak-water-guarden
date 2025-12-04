import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWater } from '@/contexts/WaterContext';

export const LocationGateMobile = () => {
  const { locationStatus, locationError, requestLocation } = useWater();

  const isPending = locationStatus === 'idle' || locationStatus === 'pending';

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-center">
            Enable Location for JalRakshak
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {isPending ? (
            <p className="text-center text-muted-foreground">
              Detecting your current location to show nearby water supply status...
            </p>
          ) : locationStatus === 'denied' ? (
            <>
              <p className="text-center text-red-600">
                {locationError || 'Location permission was denied.'}
              </p>
              <p className="text-center text-muted-foreground">
                Please allow location access in your browser / app settings and tap retry.
              </p>
              <Button className="w-full bg-[#0d80a6]" onClick={requestLocation}>
                Retry Location
              </Button>
            </>
          ) : (
            <>
              <p className="text-center text-muted-foreground">
                Preparing location-specific dashboard data...
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};


