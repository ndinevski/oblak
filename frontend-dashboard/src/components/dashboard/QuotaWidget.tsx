import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface QuotaItem {
  name: string;
  used: number;
  max: number;
  unit?: string;
}

export interface QuotaWidgetProps {
  quotas: QuotaItem[];
  className?: string;
}

/**
 * Calculate percentage used
 */
function calculatePercentage(used: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(Math.round((used / max) * 100), 100);
}

/**
 * Get color class based on usage percentage
 */
function getProgressColor(percentage: number): string {
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 75) return 'bg-yellow-500';
  return 'bg-primary';
}

/**
 * QuotaWidget displays resource usage progress bars
 */
export function QuotaWidget({ quotas, className }: QuotaWidgetProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Resource Quotas</CardTitle>
        <CardDescription>Your resource usage and limits</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {quotas.map((quota) => {
          const percentage = calculatePercentage(quota.used, quota.max);
          const progressColor = getProgressColor(percentage);

          return (
            <div key={quota.name} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{quota.name}</span>
                <span className="text-muted-foreground">
                  {quota.used} / {quota.max} {quota.unit || ''}
                </span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', progressColor)}
                  style={{ width: `${percentage}%` }}
                  role="progressbar"
                  aria-valuenow={quota.used}
                  aria-valuemin={0}
                  aria-valuemax={quota.max}
                  aria-label={`${quota.name}: ${percentage}% used`}
                />
              </div>
              <div className="text-xs text-muted-foreground text-right">
                {percentage}% used
              </div>
            </div>
          );
        })}
        {quotas.length === 0 && (
          <p className="text-sm text-muted-foreground">No quota information available</p>
        )}
      </CardContent>
    </Card>
  );
}

export default QuotaWidget;
