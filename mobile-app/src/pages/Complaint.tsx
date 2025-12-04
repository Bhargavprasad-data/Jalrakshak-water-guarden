import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BottomNav } from '@/components/BottomNav';
import { useWater } from '@/contexts/WaterContext';
import { Camera, MapPin, Send, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
export default function Complaint() {
  const { submitComplaint } = useWater();
  const { toast } = useToast();
  const [problemType, setProblemType] = useState('');
  const [description, setDescription] = useState('');
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Live GPS location (lat/lng) for highest accuracy
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [gpsError, setGpsError] = useState('');

  // Human‑readable place name from reverse‑geocoding
  const [villageName, setVillageName] = useState('');
  const problemTypes = [
    { value: 'leak', label: 'Water Leak' },
    { value: 'muddy-water', label: 'Muddy Water' },
    { value: 'no-supply', label: 'No Supply' },
    { value: 'low-pressure', label: 'Low Pressure' },
    { value: 'other', label: 'Other Issue' },
  ];

  // Reverse‑geocode lat/lng to a village / town / city name using OpenStreetMap
  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await res.json();
      return (
        data.address?.village ||
        data.address?.town ||
        data.address?.city ||
        data.address?.hamlet ||
        data.address?.county ||
        'Unknown Location'
      );
    } catch {
      return 'Location lookup failed';
    }
  }

  // Auto‑detect GPS and look up human‑readable place name
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsError('Geolocation not supported on this device.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocation({ lat, lng });

        const name = await reverseGeocode(lat, lng);
        setVillageName(name);
      },
      (err) => {
        console.error('Failed to get location:', err);
        setGpsError(err.message || 'Unable to detect GPS automatically.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoName(file.name);

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          setPhotoBase64(result);
          toast({
            title: 'Photo added',
            description: 'Photo has been attached to your complaint'
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemType || !description) {
      toast({
        title: 'Missing information',
        description: 'Please select a problem type and provide a description',
        variant: 'destructive'
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await submitComplaint({
        problemType,
        description,
        photo:
          photoBase64 && photoName
            ? {
                name: photoName,
                base64: photoBase64,
              }
            : null,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        // We keep villageId null; dashboards can derive village from GPS or name if needed
        villageId: null,
      });
      setIsSubmitted(true);
      toast({
        title: 'Complaint submitted successfully!',
        description: 'Our team will respond within 24 hours'
      });
      setTimeout(() => {
        setProblemType('');
        setDescription('');
        setPhotoName(null);
        setPhotoBase64(null);
        setIsSubmitted(false);
      }, 3000);
    } catch (error) {
      toast({
        title: 'Submission failed',
        description: 'Please try again later',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  if (isSubmitted) {
    return <div className="min-h-screen bg-muted pb-24 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full bg-success/10 border-success/30">
          <CardContent className="p-12 text-center">
            <CheckCircle size={80} className="mx-auto mb-6 text-success" />
            <h2 className="text-3xl font-bold mb-3">Complaint Submitted!</h2>
            <p className="text-lg text-muted-foreground mb-6">
              Thank you for reporting. Our team will address this issue soon.
            </p>
            <p className="text-sm text-muted-foreground">
              You will receive updates via SMS and WhatsApp
            </p>
          </CardContent>
        </Card>
        <BottomNav />
      </div>;
  }
  return <div className="min-h-screen bg-muted pb-24">
      <div className="text-primary-foreground p-6 shadow-lg bg-[#0d80a6]">
        <h1 className="text-3xl font-bold">File Complaint</h1>
        <p className="text-sm mt-1 opacity-90">Report water-related issues</p>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Problem Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {problemTypes.map(type => <button key={type.value} type="button" onClick={() => setProblemType(type.value)} className={`w-full p-4 rounded-lg border-2 text-left font-semibold transition-all ${problemType === type.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:border-primary/50'}`}>
                  {type.label}
                </button>)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea placeholder="Describe the problem in detail..." value={description} onChange={e => setDescription(e.target.value)} className="min-h-32 text-base" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upload Photo (Optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label htmlFor="photo-upload" className="flex items-center justify-center gap-3 p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                <Camera size={32} className="text-primary" />
                <div className="text-center">
                  <p className="font-semibold">
                    {photoName || 'Take or Upload Photo'}
                  </p>
                  <p className="text-sm text-muted-foreground">Tap to add image</p>
                </div>
              </label>
              <Input id="photo-upload" type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} className="hidden" />
            </CardContent>
          </Card>

          {/* <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 flex items-center gap-3">
              <MapPin className="text-primary flex-shrink-0" size={24} />
              <div className="text-sm">
                <p className="font-semibold">Location Auto-Detected</p>
                {location ? (
                  <>
                    <p className="text-muted-foreground">
                      {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                    </p>
                    <p className="text-primary font-semibold">
                      {villageName || 'Fetching village...'}
                    </p>
                  </>
                ) : gpsError ? (
                  <p className="text-red-500">{gpsError}</p>
                ) : (
                  <p className="text-muted-foreground">Detecting GPS...</p>
                )}
              </div>
            </CardContent>
          </Card> */}

          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full text-lg h-14 bg-[#0d80a6]">
            {isSubmitting ? 'Submitting...' : <>
                <Send className="mr-2" size={24} />
                Submit Complaint
              </>}
          </Button>
        </form>
      </div>

      <BottomNav />
    </div>;
}