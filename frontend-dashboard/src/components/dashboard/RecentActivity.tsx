import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  LucideIcon,
  Zap,
  Server,
  Database,
  Plus,
  Trash2,
  Play,
  Square,
  Settings,
  User,
  Activity,
} from 'lucide-react';

export type ActivityType =
  | 'function_created'
  | 'function_deleted'
  | 'function_invoked'
  | 'vm_created'
  | 'vm_deleted'
  | 'vm_started'
  | 'vm_stopped'
  | 'bucket_created'
  | 'bucket_deleted'
  | 'settings_updated'
  | 'login'
  | 'other';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  message: string;
  timestamp: string | Date;
  resourceName?: string;
}

export interface RecentActivityProps {
  activities: ActivityItem[];
  maxItems?: number;
  className?: string;
}

/**
 * Get icon for activity type
 */
function getActivityIcon(type: ActivityType): LucideIcon {
  const iconMap: Record<ActivityType, LucideIcon> = {
    function_created: Plus,
    function_deleted: Trash2,
    function_invoked: Zap,
    vm_created: Plus,
    vm_deleted: Trash2,
    vm_started: Play,
    vm_stopped: Square,
    bucket_created: Plus,
    bucket_deleted: Trash2,
    settings_updated: Settings,
    login: User,
    other: Activity,
  };
  return iconMap[type] || Activity;
}

/**
 * Get icon color for activity type
 */
function getActivityColor(type: ActivityType): string {
  if (type.includes('deleted')) return 'text-red-500';
  if (type.includes('created')) return 'text-green-500';
  if (type.includes('started') || type.includes('invoked')) return 'text-blue-500';
  if (type.includes('stopped')) return 'text-yellow-500';
  return 'text-muted-foreground';
}

/**
 * Get background icon for resource type
 */
function getResourceIcon(type: ActivityType): LucideIcon | null {
  if (type.startsWith('function')) return Zap;
  if (type.startsWith('vm')) return Server;
  if (type.startsWith('bucket')) return Database;
  return null;
}

/**
 * RecentActivity widget shows recent user activities
 */
export function RecentActivity({ activities, maxItems = 5, className }: RecentActivityProps) {
  const displayActivities = activities.slice(0, maxItems);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Your recent actions and events</CardDescription>
      </CardHeader>
      <CardContent>
        {displayActivities.length > 0 ? (
          <div className="space-y-4">
            {displayActivities.map((activity) => {
              const ActionIcon = getActivityIcon(activity.type);
              const ResourceIcon = getResourceIcon(activity.type);
              const iconColor = getActivityColor(activity.type);
              const timestamp =
                typeof activity.timestamp === 'string'
                  ? new Date(activity.timestamp)
                  : activity.timestamp;

              return (
                <div key={activity.id} className="flex items-start gap-3">
                  <div className="relative">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full bg-secondary flex items-center justify-center',
                        iconColor
                      )}
                    >
                      <ActionIcon className="h-4 w-4" />
                    </div>
                    {ResourceIcon && (
                      <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-background border flex items-center justify-center">
                        <ResourceIcon className="h-2.5 w-2.5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{activity.message}</p>
                    {activity.resourceName && (
                      <p className="text-xs text-muted-foreground truncate">
                        {activity.resourceName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(timestamp, { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recent activity</p>
        )}
      </CardContent>
    </Card>
  );
}

export default RecentActivity;
