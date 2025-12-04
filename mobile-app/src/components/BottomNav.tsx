import { Home, Droplets, Clock, AlertCircle, MessageSquare, Settings, Wrench } from 'lucide-react';
import { useWater } from '@/contexts/WaterContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useWater();
  const { user } = useAuth();

  const navItems =
    user?.role === 'worker'
      ? [
          { icon: Wrench, key: 'nav.issues', path: '/issues' as const },
          { icon: Settings, key: 'nav.settings', path: '/settings' as const },
        ]
      : [
          { icon: Home, key: 'nav.home', path: '/' as const },
          { icon: Droplets, key: 'nav.quality', path: '/quality' as const },
          { icon: Clock, key: 'nav.timings', path: '/timings' as const },
          { icon: AlertCircle, key: 'nav.alerts', path: '/alerts' as const },
          { icon: MessageSquare, key: 'nav.complaint', path: '/complaint' as const },
          { icon: Settings, key: 'nav.settings', path: '/settings' as const },
        ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-50">
      <div className="flex justify-around items-center h-20 max-w-lg mx-auto px-2">
        {navItems.map(({ icon: Icon, key, path }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all flex-1 min-w-0',
                isActive
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon size={24} className="flex-shrink-0" />
              <span className="text-xs font-medium truncate w-full text-center">
                {t(key)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
