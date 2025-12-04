import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusCardProps {
  icon: LucideIcon;
  title: string;
  value: string;
  status?: 'success' | 'warning' | 'danger';
  onClick?: () => void;
}

export const StatusCard = ({ icon: Icon, title, value, status, onClick }: StatusCardProps) => {
  const statusColors = {
    success: 'bg-success/10 border-success/30',
    warning: 'bg-warning/10 border-warning/30',
    danger: 'bg-danger/10 border-danger/30',
  };

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-lg active:scale-95',
        status && statusColors[status]
      )}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4 p-6">
        <div
          className={cn(
            'rounded-full p-4',
            status === 'success' && 'bg-success text-white',
            status === 'warning' && 'bg-warning text-white',
            status === 'danger' && 'bg-danger text-white',
            !status && 'bg-primary text-primary-foreground'
          )}
        >
          <Icon size={32} />
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
};
