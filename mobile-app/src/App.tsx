import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { WaterProvider, useWater } from "./contexts/WaterContext";
import { SplashScreen } from "./components/SplashScreen";
import { LocationGateMobile } from "./components/LocationGateMobile";
import Home from "./pages/Home";
import Quality from "./pages/Quality";
import Timings from "./pages/Timings";
import Alerts from "./pages/Alerts";
import Complaint from "./pages/Complaint";
import Settings from "./pages/Settings";
import Issues from "./pages/Issues";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { user, isLoading } = useAuth();
  const { locationStatus } = useWater();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-muted">Loading...</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (locationStatus !== 'granted') {
    return <LocationGateMobile />;
  }

  // Worker: focused experience with only Issues + Settings
  if (user.role === 'worker') {
    return (
      <Routes>
        <Route path="/" element={<Issues />} />
        <Route path="/issues" element={<Issues />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/issues" replace />} />
      </Routes>
    );
  }

  // Citizen / other roles: normal consumer app, no Issues page
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/quality" element={<Quality />} />
      <Route path="/timings" element={<Timings />} />
      <Route path="/alerts" element={<Alerts />} />
      <Route path="/complaint" element={<Complaint />} />
      <Route path="/settings" element={<Settings />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WaterProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            {showSplash ? (
              <SplashScreen onFinish={() => setShowSplash(false)} />
            ) : (
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            )}
          </TooltipProvider>
        </WaterProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
