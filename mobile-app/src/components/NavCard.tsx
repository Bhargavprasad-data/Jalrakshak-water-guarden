import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NavCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  path: string;
}

export const NavCard = ({ icon: Icon, title, description, path }: NavCardProps) => {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-lg hover:border-primary active:scale-95"
      onClick={() => navigate(path)}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-full bg-primary/10 p-3">
          <Icon size={28} className="text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
};
