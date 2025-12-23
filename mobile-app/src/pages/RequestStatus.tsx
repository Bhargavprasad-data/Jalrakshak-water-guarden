import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';

const apiEnv = (import.meta as any)?.env ?? {};
const API_BASE_URL: string = apiEnv.VITE_API_BASE_URL || 'http://localhost:3000';

export default function RequestStatus() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'checking' | 'not_found'>('checking');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [requestData, setRequestData] = useState<any>(null);

  useEffect(() => {
    // Get phone from localStorage (stored during signup)
    const storedPhone = localStorage.getItem('pending_worker_phone');
    const storedUsername = localStorage.getItem('pending_worker_username');
    const storedPassword = localStorage.getItem('pending_worker_password');
    
    if (storedPhone) {
      setPhone(storedPhone);
      setUsername(storedUsername || '');
      setPassword(storedPassword || '');
      checkStatus(storedPhone);
      
      // Poll for status updates every 5 seconds
      const interval = setInterval(() => {
        checkStatus(storedPhone);
      }, 5000);
      
      return () => clearInterval(interval);
    } else {
      setStatus('not_found');
    }
  }, []);

  const checkStatus = async (phoneNumber: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/worker-requests/status/${phoneNumber}`);
      if (!response.ok) {
        throw new Error('Failed to check status');
      }
      const data = await response.json();
      
      if (data.status === 'not_found') {
        setStatus('not_found');
      } else {
        setStatus(data.status);
        setRequestData(data);
        if (data.rejection_reason) {
          setRejectionReason(data.rejection_reason);
        }
        
        // If approved, try to login automatically
        if (data.status === 'approved' && username && password) {
          handleAutoLogin();
        }
      }
    } catch (error) {
      console.error('Error checking status:', error);
    }
  };

  const handleAutoLogin = async () => {
    if (!username || !password) {
      toast({
        title: 'Login information missing',
        description: 'Please login manually',
        variant: 'destructive',
      });
      navigate('/login');
      return;
    }

    try {
      await login(username, password);
      // Clear stored data
      localStorage.removeItem('pending_worker_phone');
      localStorage.removeItem('pending_worker_username');
      localStorage.removeItem('pending_worker_password');
      
      toast({
        title: 'Account Approved!',
        description: 'You have been logged in successfully.',
      });
      navigate('/', { replace: true });
    } catch (error: any) {
      toast({
        title: 'Auto-login failed',
        description: 'Please login manually with your credentials',
        variant: 'destructive',
      });
      navigate('/login');
    }
  };

  const handleManualLogin = () => {
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            Registration Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'checking' && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Checking your registration status...</p>
            </div>
          )}

          {status === 'pending' && (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
              <h3 className="text-lg font-semibold mb-2">Request Pending</h3>
              <p className="text-muted-foreground mb-4">
                Your registration request is being reviewed by the administrator.
                You will be notified once it's approved.
              </p>
              <p className="text-sm text-muted-foreground">
                Requested on: {requestData?.created_at ? new Date(requestData.created_at).toLocaleString() : 'N/A'}
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                This page will automatically update when your request is approved.
              </p>
            </div>
          )}

          {status === 'approved' && (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-semibold mb-2 text-green-600">Request Approved!</h3>
              <p className="text-muted-foreground mb-4">
                Your registration has been approved. You can now access the mobile app.
              </p>
              <Button onClick={handleAutoLogin} className="w-full">
                Continue to App
              </Button>
            </div>
          )}

          {status === 'rejected' && (
            <div className="text-center py-8">
              <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <h3 className="text-lg font-semibold mb-2 text-red-600">Request Rejected</h3>
              {rejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                  <p className="text-sm text-red-800">
                    <strong>Reason:</strong> {rejectionReason}
                  </p>
                </div>
              )}
              <p className="text-muted-foreground mb-4">
                Your registration request was rejected. Please contact the administrator for more information.
              </p>
              <Button onClick={() => navigate('/signup')} variant="outline" className="w-full">
                Try Again
              </Button>
            </div>
          )}

          {status === 'not_found' && (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                No registration request found. Please sign up first.
              </p>
              <Button onClick={() => navigate('/signup')} className="w-full">
                Go to Signup
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



