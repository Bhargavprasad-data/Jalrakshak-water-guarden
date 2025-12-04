import { useEffect, useState } from 'react';

export type LocationStatus = 'idle' | 'pending' | 'granted' | 'denied';

interface Coords {
  lat: number;
  lon: number;
}

export function useUserLocation() {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  const requestLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('denied');
      setError('Geolocation is not supported on this device.');
      return;
    }

    setStatus('pending');
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
        setStatus('granted');
      },
      (err) => {
        setStatus('denied');
        setError(err.message || 'Location permission denied.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  };

  useEffect(() => {
    // Request once on mount
    requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    error,
    coords,
    requestLocation,
  };
}


