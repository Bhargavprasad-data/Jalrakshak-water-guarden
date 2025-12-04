import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { BottomNav } from '@/components/BottomNav';
import { useWater } from '@/contexts/WaterContext';
import { Languages, Bell, MessageCircle, Moon, SunMedium, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
export default function Settings() {
  const {
    settings,
    updateSettings,
    t,
  } = useWater();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const handleLanguageChange = (value: string) => {
    const newLanguage = value as typeof settings.language;
    updateSettings({
      language: newLanguage
    });
    toast({
      title: 'Language changed',
      description:
        newLanguage === 'english'
          ? 'Language set to English'
          : newLanguage === 'hindi'
            ? 'भाषा हिंदी पर सेट की गई'
            : 'భాషను తెలుగుకు మార్చాం',
    });
  };
  const handleNotificationsToggle = () => {
    updateSettings({
      notifications: !settings.notifications
    });
    toast({
      title: settings.notifications ? 'Notifications disabled' : 'Notifications enabled',
      description: settings.notifications ? 'You will no longer receive notifications' : 'You will receive system notifications'
    });
  };
  const handleWhatsAppToggle = () => {
    updateSettings({
      whatsappAlerts: !settings.whatsappAlerts
    });
    toast({
      title: settings.whatsappAlerts ? 'WhatsApp alerts disabled' : 'WhatsApp alerts enabled',
      description: settings.whatsappAlerts ? 'WhatsApp alerts turned off' : 'You will receive WhatsApp updates'
    });
  };
  const handleThemeToggle = () => {
    const nextTheme = settings.theme === 'light' ? 'dark' : 'light';
    updateSettings({
      theme: nextTheme
    });
    toast({
      title: nextTheme === 'dark' ? 'Dark mode enabled' : 'Light mode enabled',
      description: nextTheme === 'dark' ? 'App switched to dark theme' : 'App switched to light theme'
    });
  };

  const handleLogout = () => {
    logout();
    toast({
      title: 'Logged out',
      description: 'You have been logged out successfully',
    });
    navigate('/login', { replace: true });
  };
  return <div className="min-h-screen bg-muted pb-24">
      <div className="text-primary-foreground p-6 shadow-lg bg-[#0d80a6]">
        <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
        <p className="text-sm mt-1 opacity-90">{t('settings.subtitle')}</p>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Languages className="text-primary" />
              {t('settings.language')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="font-semibold text-lg">
                  {settings.language === 'english'
                    ? 'English'
                    : settings.language === 'hindi'
                    ? 'हिन्दी (Hindi)'
                    : 'తెలుగు (Telugu)'}
                </p>
                <p className="text-sm text-muted-foreground">{t('settings.languageDescription')}</p>
              </div>
              <select
                className="ml-4 rounded-md border bg-background px-3 py-2 text-sm"
                value={settings.language}
                onChange={(e) => handleLanguageChange(e.target.value)}
              >
                <option value="english">English</option>
                <option value="hindi">हिन्दी (Hindi)</option>
                <option value="telugu">తెలుగు (Telugu)</option>
              </select>
            </div>
            <p className="text-sm text-muted-foreground mt-3 px-1">
              {t('settings.languageHint')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {settings.theme === 'dark' ? (
                <Moon className="text-primary" />
              ) : (
                <SunMedium className="text-primary" />
              )}
              {t('settings.theme')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="font-semibold text-lg">
                  {settings.theme === 'dark'
                    ? t('settings.themeDark')
                    : t('settings.themeLight')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('settings.themeDescription')}
                </p>
              </div>
              <Switch
                checked={settings.theme === 'dark'}
                onCheckedChange={handleThemeToggle}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="text-primary" />
              {t('settings.notifications')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="font-semibold text-lg">{t('settings.notificationsTitle')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('settings.notificationsDescription')}
                </p>
              </div>
              <Switch checked={settings.notifications} onCheckedChange={handleNotificationsToggle} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="text-primary" />
              {t('settings.whatsapp')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="font-semibold text-lg">{t('settings.whatsappTitle')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('settings.whatsappDescription')}
                </p>
              </div>
              <Switch checked={settings.whatsappAlerts} onCheckedChange={handleWhatsAppToggle} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">{t('settings.appVersion')}</p>
            <p className="font-bold text-2xl">1.0.0</p>
            <p className="text-xs text-muted-foreground mt-4">Jalraskhak water guardian</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-destructive/10">
                <LogOut className="text-destructive" size={20} />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">Logout</p>
                <p className="text-xs text-muted-foreground">
                  Sign out of your JalRakshak account on this device
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-md text-xs font-semibold bg-destructive text-destructive-foreground"
            >
              Logout
            </button>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>;
}