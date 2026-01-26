import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface ResourceCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon: LucideIcon;
  href?: string;
  trend?: {
    value: number;
    label?: string;
  };
  className?: string;
}

/**
 * ResourceCard widget for displaying resource counts with optional trend
 */
export function ResourceCard({
  title,
  value,
  description,
  icon: Icon,
  href,
  trend,
  className,
}: ResourceCardProps) {
  const TrendIcon = trend
    ? trend.value > 0
      ? TrendingUp
      : trend.value < 0
      ? TrendingDown
      : Minus
    : null;

  const trendColor = trend
    ? trend.value > 0
      ? 'text-green-600'
      : trend.value < 0
      ? 'text-red-600'
      : 'text-muted-foreground'
    : '';

  const content = (
    <Card className={cn('transition-colors', href && 'hover:border-primary', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {(description || trend) && (
          <div className="flex items-center gap-2 mt-1">
            {trend && TrendIcon && (
              <span className={cn('flex items-center text-xs', trendColor)}>
                <TrendIcon className="h-3 w-3 mr-1" />
                {Math.abs(trend.value)}%
                {trend.label && <span className="ml-1">{trend.label}</span>}
              </span>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }

  return content;
}

export default ResourceCard;
