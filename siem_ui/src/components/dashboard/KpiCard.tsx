
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { KpiCardSkeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

interface KpiData {
  title: string;
  value: string;
  trend?: string;
  trendColor?: 'positive' | 'negative' | 'neutral';
}

interface KpiCardProps {
  data?: KpiData;
  isLoading?: boolean;
}

export function KpiCard({ data, isLoading = false }: KpiCardProps) {
  if (isLoading || !data) {
    return <KpiCardSkeleton />;
  }

  const getTrendIcon = () => {
    if (!data.trend) return null;
    
    switch (data.trendColor) {
      case 'positive':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'negative':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'neutral':
      default:
        return <Minus className="h-4 w-4 text-secondary-text" />;
    }
  };

  const getTrendColor = () => {
    switch (data.trendColor) {
      case 'positive':
        return 'text-green-500';
      case 'negative':
        return 'text-red-500';
      case 'neutral':
      default:
        return 'text-secondary-text';
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-secondary-text">
          {data.title}
        </h3>
        
        <div className="text-3xl font-bold text-primary-text">
          {data.value}
        </div>
        
        {data.trend && (
          <div className="flex items-center space-x-2">
            {getTrendIcon()}
            <span className={cn("text-sm font-medium", getTrendColor())}>
              {data.trend}
            </span>
            <span className="text-xs text-secondary-text">
              vs previous period
            </span>
          </div>
        )}
      </div>
    </Card>
  );
} 