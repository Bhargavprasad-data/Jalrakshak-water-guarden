import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  const [workerVillage, setWorkerVillage] = useState('');

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
    if (accountType === 'worker' && !workerVillage.trim()) {
      toast({
        title: 'Village required',
        description: 'Please enter your village name for worker signup',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await signup({
        username,
        email,
        phone,
        password,
        role: accountType === 'worker' ? 'worker' : 'operator',
        villageName: accountType === 'worker' ? workerVillage.trim() : undefined,
      });
      toast({
        title: 'Account created',
        description: 'You have been signed up and logged in',
      });
      navigate('/', { replace: true });
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
              <div>
                <label className="block text-sm font-medium mb-1">Village Name</label>
                <Input
                  value={workerVillage}
                  onChange={(e) => setWorkerVillage(e.target.value)}
                  placeholder="Enter your village name (must match dashboard villages)"
                />
              </div>
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


