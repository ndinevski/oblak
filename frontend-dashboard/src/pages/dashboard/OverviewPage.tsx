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

  // Build quota items from summary
  const quotaItems = summary
    ? [
        { name: 'Functions', used: summary.quotas.functions.used, max: summary.quotas.functions.max },
        { name: 'Virtual Machines', used: summary.quotas.vms.used, max: summary.quotas.vms.max },
        { name: 'Buckets', used: summary.quotas.buckets.used, max: summary.quotas.buckets.max },
        { name: 'Storage', used: summary.quotas.storage.used, max: summary.quotas.storage.max, unit: summary.quotas.storage.unit },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          {user ? `Welcome back, ${user.username}` : 'Welcome to Oblak Cloud Dashboard'}
        </p>
      </div>

      {/* Quick actions */}
      <QuickActions />

      {/* Service overview cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <ResourceCard
          title="Functions"
          value={summary?.functions.total ?? 0}
          description={`${summary?.functions.active ?? 0} active`}
          icon={Zap}
          href="/functions"
          trend={summary?.functions.trend ? { value: summary.functions.trend } : undefined}
        />
        <ResourceCard
          title="Virtual Machines"
          value={summary?.virtualMachines.total ?? 0}
          description={`${summary?.virtualMachines.running ?? 0} running`}
          icon={Server}
          href="/vms"
          trend={summary?.virtualMachines.trend ? { value: summary.virtualMachines.trend } : undefined}
        />
        <ResourceCard
          title="Storage Buckets"
          value={summary?.storage.totalBuckets ?? 0}
          description={`${summary?.storage.usedGB ?? 0} GB used`}
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
