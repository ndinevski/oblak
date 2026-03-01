import { Breadcrumb } from '@/components/ui';
import { Zap, Server, Database } from 'lucide-react';
import {
  ResourceCard,
  QuotaWidget,
  RecentActivity,
  QuickActions,
} from '@/components/dashboard';
import { useDashboardSummary, useRecentActivities } from '@/hooks/useDashboard';
import { useUser } from '@/stores/authStore';

export default function OverviewPage() {
  const user = useUser();
  const { data: summary } = useDashboardSummary();
  const { data: activities = [] } = useRecentActivities(5);

  const formatOrNA = (value: number | null | undefined) =>
    typeof value === 'number' ? value : 'N/A';

  // Build quota items from summary
  const quotaItems = summary
    ? [
        {
          name: 'Functions',
          used: summary.quotas.functions.used ?? 0,
          max: summary.quotas.functions.max ?? 0,
        },
        {
          name: 'Virtual Machines',
          used: summary.quotas.vms.used ?? 0,
          max: summary.quotas.vms.max ?? 0,
        },
        {
          name: 'Buckets',
          used: summary.quotas.buckets.used ?? 0,
          max: summary.quotas.buckets.max ?? 0,
        },
        {
          name: 'Storage',
          used: summary.quotas.storage.used ?? 0,
          max: summary.quotas.storage.max ?? 0,
          unit: summary.quotas.storage.unit,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          {user ? `Welcome back, ${user.username}` : 'Welcome to Oblak Console'}
        </p>
      </div>

      {/* Quick actions */}
      <QuickActions />

      {/* Service overview cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <ResourceCard
          title="Functions"
          value={formatOrNA(summary?.functions.total)}
          description={
            summary?.functions.active !== null && summary?.functions.active !== undefined
              ? `${summary.functions.active} active`
              : 'N/A'
          }
          icon={Zap}
          href="/functions"
          trend={summary?.functions.trend ? { value: summary.functions.trend } : undefined}
        />
        <ResourceCard
          title="Virtual Machines"
          value={formatOrNA(summary?.virtualMachines.total)}
          description={
            summary?.virtualMachines.running !== null && summary?.virtualMachines.running !== undefined
              ? `${summary.virtualMachines.running} running`
              : 'N/A'
          }
          icon={Server}
          href="/vms"
          trend={summary?.virtualMachines.trend ? { value: summary.virtualMachines.trend } : undefined}
        />
        <ResourceCard
          title="Storage Buckets"
          value={formatOrNA(summary?.storage.totalBuckets)}
          description={
            summary?.storage.usedGB !== null && summary?.storage.usedGB !== undefined
              ? `${summary.storage.usedGB} GB used`
              : 'N/A'
          }
          icon={Database}
          href="/storage"
          trend={summary?.storage.trend ? { value: summary.storage.trend } : undefined}
        />
      </div>

      {/* Quotas and Activity grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <QuotaWidget quotas={quotaItems} />
        <RecentActivity activities={activities} />
      </div>
    </div>
  );
}
