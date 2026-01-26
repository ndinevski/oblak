/**
 * Activity Page
 * View and filter activity logs
 */

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Skeleton,
  Input,
} from '@/components/ui';
import {
  Activity,
  Filter,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Code,
  Server,
  Database,
  File,
  User,
  Calendar,
} from 'lucide-react';
import { useActivityLogs, useActivitySummary, useActivityFilters } from '@/hooks/useActivity';
import {
  getActionLabel,
  getActionColor,
  getResourceTypeLabel,
  getStatusColor,
  formatRelativeTime,
  getResourceTypes,
  getStatuses,
} from '@/lib/api/activity';

// =============================================================================
// Helper Components
// =============================================================================

function StatCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function ResourceIcon({ type }: { type: string }) {
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    function: Code,
    'virtual-machine': Server,
    vm: Server,
    bucket: Database,
    object: File,
    user: User,
  };
  const Icon = icons[type] || Activity;
  return <Icon className="h-4 w-4" />;
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4 p-4 border rounded-lg">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function ActivityPage() {
  const [showFilters, setShowFilters] = useState(false);
  const {
    filters,
    setResourceType,
    setAction,
    setStatus,
    setPage,
    clearFilters,
    hasActiveFilters,
  } = useActivityFilters();

  const { data: logsData, isLoading: logsLoading, refetch } = useActivityLogs(filters);
  const { data: summary, isLoading: summaryLoading } = useActivitySummary(30);

  const logs = logsData?.data || [];
  const pagination = logsData?.meta?.pagination;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Activity Log</h1>
          <p className="text-muted-foreground">View your recent activity across all resources</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <Badge className="ml-2" variant="secondary">Active</Badge>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      {!summaryLoading && summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Total Activities"
            value={summary.totalActivities}
            icon={Activity}
            color="text-blue-500"
          />
          <StatCard
            title="Successful"
            value={summary.byStatus?.success || 0}
            icon={Activity}
            color="text-green-500"
          />
          <StatCard
            title="Failed"
            value={summary.byStatus?.failure || 0}
            icon={Activity}
            color="text-red-500"
          />
          <StatCard
            title="Last 30 Days"
            value={summary.recentDays}
            icon={Calendar}
            color="text-purple-500"
          />
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
            <CardDescription>Filter activity logs by various criteria</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Resource Type</label>
                <Select
                  value={filters.resourceType || 'all'}
                  onValueChange={(value) => setResourceType(value === 'all' ? undefined : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All resources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All resources</SelectItem>
                    {getResourceTypes().map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Action</label>
                <Input
                  placeholder="e.g., create, delete"
                  value={filters.action || ''}
                  onChange={(e) => setAction(e.target.value || undefined)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={filters.status || 'all'}
                  onValueChange={(value) => setStatus(value === 'all' ? undefined : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {getStatuses().map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                {hasActiveFilters && (
                  <Button variant="ghost" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            {pagination
              ? `Showing ${logs.length} of ${pagination.total} activities`
              : 'Loading activities...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <ActivitySkeleton />
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No activity found</h3>
              <p className="text-muted-foreground">
                {hasActiveFilters
                  ? 'Try adjusting your filters'
                  : 'Your activity will appear here'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <ResourceIcon type={log.resourceType} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{getActionLabel(log.action)}</span>
                      {log.resourceName && (
                        <span className="text-muted-foreground">
                          on <code className="text-sm">{log.resourceName}</code>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Badge variant="outline" className="font-normal">
                        {getResourceTypeLabel(log.resourceType)}
                      </Badge>
                      <span>•</span>
                      <span>{formatRelativeTime(log.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge className={getStatusColor(log.status)}>{log.status}</Badge>
                    <Badge className={getActionColor(log.action)} variant="outline">
                      {log.action.split('.')[1] || log.action}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.pageCount > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.pageCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage(pagination.page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.pageCount}
                  onClick={() => setPage(pagination.page + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
