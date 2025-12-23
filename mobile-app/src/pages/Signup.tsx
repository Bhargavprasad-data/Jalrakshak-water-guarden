import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, Link } from 'react-router-dom';

export default function Signup() {
  const { signup } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountType, setAccountType] = useState<'citizen' | 'worker'>('citizen');
  const [workerName, setWorkerName] = useState('');
  const [workerDistrict, setWorkerDistrict] = useState('');
  const [workerMandal, setWorkerMandal] = useState('');
  const [workerVillage, setWorkerVillage] = useState('');
  const [villages, setVillages] = useState<any[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [mandals, setMandals] = useState<string[]>([]);
  const [filteredVillages, setFilteredVillages] = useState<any[]>([]);

  const apiEnv = (import.meta as any)?.env ?? {};
  const API_BASE_URL: string = apiEnv.VITE_API_BASE_URL || 'http://localhost:3000';

  // Fetch villages on mount
  useEffect(() => {
    const fetchVillages = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/gis/villages`);
        if (response.ok) {
          const data = await response.json();
          setVillages(data || []);
        }
      } catch (error) {
        console.error('Failed to fetch villages:', error);
      }
    };
    if (accountType === 'worker') {
      fetchVillages();
    }
  }, [accountType]);

  // Extract unique districts from villages
  useEffect(() => {
    if (villages.length > 0) {
      const uniqueDistricts = [...new Set(villages.map(v => v.district).filter(Boolean))].sort();
      setDistricts(uniqueDistricts);
    }
  }, [villages]);

  // Filter mandals based on selected district
  useEffect(() => {
    if (workerDistrict && villages.length > 0) {
      const districtVillages = villages.filter(v => v.district === workerDistrict);
      const uniqueMandals = [...new Set(districtVillages.map(v => v.mandal || v.name).filter(Boolean))].sort();
      setMandals(uniqueMandals);
    } else {
      setMandals([]);
    }
    // Reset mandal and village when district changes
    if (!workerDistrict) {
      setWorkerMandal('');
      setWorkerVillage('');
    }
  }, [workerDistrict, villages]);

  // Filter villages based on selected district and mandal
  useEffect(() => {
    if (accountType !== 'worker' || !workerDistrict) {
      setFilteredVillages([]);
      setWorkerVillage('');
      return;
    }

    let filtered = villages.filter(v => v.district === workerDistrict);
    
    if (workerMandal) {
      filtered = filtered.filter(v => (v.mandal || v.name) === workerMandal);
    }

    setFilteredVillages(filtered);
    
    // Auto-select if only one village matches
    if (filtered.length === 1 && !workerVillage) {
      setWorkerVillage(filtered[0].id);
    } else if (filtered.length === 0 || !filtered.find(v => v.id === workerVillage)) {
      setWorkerVillage('');
    }
  }, [workerDistrict, workerMandal, villages, accountType, workerVillage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !phone || !password) {
      toast({
        title: 'Missing fields',
        description: 'Please fill username, phone and password',
        variant: 'destructive',
      });
      return;
    }
    if (accountType === 'worker') {
      if (!workerName.trim()) {
        toast({
          title: 'Name required',
          description: 'Please enter your full name for worker signup',
          variant: 'destructive',
        });
        return;
      }
      if (!workerDistrict) {
        toast({
          title: 'District required',
          description: 'Please select your district for worker signup',
          variant: 'destructive',
        });
        return;
      }
      if (!workerVillage) {
        toast({
          title: 'Village required',
          description: 'Please select your village for worker signup',
          variant: 'destructive',
        });
        return;
      }
    }
    setIsSubmitting(true);
    try {
      const result = await signup({
        username,
        email,
        phone,
        password,
        role: accountType === 'worker' ? 'worker' : 'operator',
        name: accountType === 'worker' ? workerName.trim() : undefined,
        district: accountType === 'worker' ? workerDistrict.trim() : undefined,
        mandal: accountType === 'worker' ? workerMandal.trim() : undefined,
        village_id: accountType === 'worker' ? workerVillage : undefined,
      });
      
      if (result?.requiresApproval) {
        // Store credentials for auto-login after approval
        localStorage.setItem('pending_worker_phone', phone);
        localStorage.setItem('pending_worker_username', username);
        localStorage.setItem('pending_worker_password', password);
        
        toast({
          title: 'Registration Request Submitted',
          description: 'Your registration request has been sent to the administrator. You will be notified once approved.',
        });
        navigate('/request-status', { replace: true });
      } else {
        toast({
          title: 'Account created',
          description: 'You have been signed up and logged in',
        });
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      toast({
        title: 'Signup failed',
        description: err?.message || 'Please check your details and try again',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Create JalRakshak Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Account Type</label>
              <div className="flex gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => setAccountType('citizen')}
                  className={`flex-1 px-3 py-2 rounded-md border ${
                    accountType === 'citizen'
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-border text-foreground'
                  }`}
                >
                  Citizen
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('worker')}
                  className={`flex-1 px-3 py-2 rounded-md border ${
                    accountType === 'worker'
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-border text-foreground'
                  }`}
                >
                  Worker
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email (optional)</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
            {accountType === 'worker' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Full Name *</label>
                  <Input
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder="Enter your full name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">District *</label>
                  <Select
                    value={workerDistrict}
                    onValueChange={(value) => {
                      setWorkerDistrict(value);
                      setWorkerMandal(''); // Reset mandal when district changes
                      setWorkerVillage(''); // Reset village when district changes
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select District" />
                    </SelectTrigger>
                    <SelectContent>
                      {districts.map((district) => (
                        <SelectItem key={district} value={district}>
                          {district}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Mandal (Optional)</label>
                  <Select
                    value={workerMandal}
                    onValueChange={(value) => {
                      setWorkerMandal(value);
                      setWorkerVillage(''); // Reset village when mandal changes
                    }}
                    disabled={!workerDistrict || mandals.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        !workerDistrict 
                          ? 'Select district first' 
                          : mandals.length === 0 
                          ? 'No mandals found' 
                          : 'Select Mandal'
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {mandals.map((mandal) => (
                        <SelectItem key={mandal} value={mandal}>
                          {mandal}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Village *</label>
                  <Select
                    value={workerVillage}
                    onValueChange={setWorkerVillage}
                    disabled={!workerDistrict || filteredVillages.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        !workerDistrict 
                          ? 'Select district first' 
                          : filteredVillages.length === 0 
                          ? 'No villages found for this district/mandal' 
                          : 'Select village'
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredVillages.map((village) => (
                        <SelectItem key={village.id} value={village.id}>
                          {village.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {workerDistrict && filteredVillages.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      No villages found. Please check your district and mandal.
                    </p>
                  )}
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>
            <Button type="submit" className="w-full h-11 bg-[#0d80a6]" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account...' : 'Sign Up'}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-semibold">
              Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}


