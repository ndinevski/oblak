/**
 * Quota Page
 * Visual breakdown of resource usage and limits
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Skeleton,
  Badge,
} from '@/components/ui';
import {
  Code,
  Server,
  Database,
  HardDrive,
  Cpu,
  MemoryStick,
  Zap,
  AlertTriangle,
  CheckCircle,
  Boxes,
  Table,
  Inbox,
  Layers,
} from 'lucide-react';
import { useQuota } from '@/hooks/useQuota';
import {
  formatBytes,
  formatMemory,
  getProgressColor,
  getQuotaStatus,
  calculateOverallHealth,
} from '@/lib/api/quota';

// =============================================================================
// Helper Components
// =============================================================================

interface QuotaItemProps {
  label: string;
  used: number | string;
  total: number | string;
  percentage: number;
  icon: React.ComponentType<{ className?: string }>;
  format?: (value: number) => string;
}

function QuotaItem({ label, used, total, percentage, icon: Icon, format }: QuotaItemProps) {
  const status = getQuotaStatus(percentage);
  const progressColor = getProgressColor(percentage);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {format ? format(Number(used)) : used} / {format ? format(Number(total)) : total}
          </span>
          {status === 'critical' && <AlertTriangle className="h-4 w-4 text-red-500" />}
          {status === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
          {status === 'ok' && <CheckCircle className="h-4 w-4 text-green-500" />}
        </div>
      </div>
      <div className="relative">
        <Progress value={percentage} className="h-2" />
        <div
          className={`absolute inset-0 h-2 rounded-full ${progressColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <p className="text-xs text-right text-muted-foreground">{percentage}% used</p>
    </div>
  );
}

function QuotaCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function HealthBadge({ health }: { health: 'healthy' | 'warning' | 'critical' }) {
  const config = {
    healthy: { label: 'Healthy', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
    warning: { label: 'Warning', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
    critical: { label: 'Critical', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  };

  return <Badge className={config[health].className}>{config[health].label}</Badge>;
}

// =============================================================================
// Main Component
// =============================================================================

export default function QuotaPage() {
  const { data: quota, isLoading, error } = useQuota();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Quota Usage</h1>
          <p className="text-muted-foreground">View your resource usage and limits</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <QuotaCardSkeleton />
          <QuotaCardSkeleton />
          <QuotaCardSkeleton />
        </div>
      </div>
    );
  }

  if (error || !quota) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Quota Usage</h1>
          <p className="text-muted-foreground">View your resource usage and limits</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Failed to load quota</h3>
            <p className="text-muted-foreground">Please try again later</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overallHealth = calculateOverallHealth(quota.percentages);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quota Usage</h1>
          <p className="text-muted-foreground">View your resource usage and limits</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Overall Health:</span>
          <HealthBadge health={overallHealth} />
        </div>
      </div>

      {/* Quota Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Functions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Functions
              </CardTitle>
            </div>
            <CardDescription>Serverless function resources</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <QuotaItem
              label="Function Count"
              used={quota.usage.functions.count}
              total={quota.limits.functions.maxCount}
              percentage={quota.percentages.functions.count}
              icon={Code}
            />
            <QuotaItem
              label="Daily Invocations"
              used={quota.usage.functions.invocationsToday}
              total={quota.limits.functions.maxInvocationsPerDay}
              percentage={quota.percentages.functions.invocations}
              icon={Zap}
            />
          </CardContent>
        </Card>

        {/* Virtual Machines */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Virtual Machines
              </CardTitle>
            </div>
            <CardDescription>VM compute resources</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <QuotaItem
              label="VM Count"
              used={quota.usage.virtualMachines.count}
              total={quota.limits.virtualMachines.maxCount}
              percentage={quota.percentages.virtualMachines.count}
              icon={Server}
            />
            <QuotaItem
              label="CPU Cores"
              used={quota.usage.virtualMachines.totalCores}
              total={quota.limits.virtualMachines.maxCores}
              percentage={quota.percentages.virtualMachines.cores}
              icon={Cpu}
            />
            <QuotaItem
              label="Memory"
              used={quota.usage.virtualMachines.totalMemoryMB}
              total={quota.limits.virtualMachines.maxMemoryMB}
              percentage={quota.percentages.virtualMachines.memory}
              icon={MemoryStick}
              format={formatMemory}
            />
            <QuotaItem
              label="Disk Storage"
              used={quota.usage.virtualMachines.totalDiskGB}
              total={quota.limits.virtualMachines.maxDiskGB}
              percentage={quota.percentages.virtualMachines.disk}
              icon={HardDrive}
              format={(gb) => `${gb} GB`}
            />
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Storage
              </CardTitle>
            </div>
            <CardDescription>Object storage resources</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <QuotaItem
              label="Bucket Count"
              used={quota.usage.storage.bucketCount}
              total={quota.limits.storage.maxBuckets}
              percentage={quota.percentages.storage.buckets}
              icon={Database}
            />
            <QuotaItem
              label="Total Storage"
              used={quota.usage.storage.totalBytes}
              total={quota.limits.storage.maxTotalBytes}
              percentage={quota.percentages.storage.bytes}
              icon={HardDrive}
              format={formatBytes}
            />
          </CardContent>
        </Card>

        {/* Platform Services */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Platform Services
              </CardTitle>
            </div>
            <CardDescription>
              Containers, databases, tables and queues (counted platform-wide)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <QuotaItem
              label="Containers (Pristaniste)"
              used={quota.usage.platform.containerCount}
              total={quota.limits.platform.maxContainers}
              percentage={quota.percentages.platform.containers}
              icon={Boxes}
            />
            <QuotaItem
              label="Databases (Tefter)"
              used={quota.usage.platform.databaseCount}
              total={quota.limits.platform.maxDatabases}
              percentage={quota.percentages.platform.databases}
              icon={Database}
            />
            <QuotaItem
              label="Key/Value Tables (Indeks)"
              used={quota.usage.platform.keyValueTableCount}
              total={quota.limits.platform.maxKeyValueTables}
              percentage={quota.percentages.platform.keyValueTables}
              icon={Table}
            />
            <QuotaItem
              label="Queues (Red)"
              used={quota.usage.platform.queueCount}
              total={quota.limits.platform.maxQueues}
              percentage={quota.percentages.platform.queues}
              icon={Inbox}
            />
          </CardContent>
        </Card>
      </div>

      {/* Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Resource Summary</CardTitle>
          <CardDescription>Detailed breakdown of your resource usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Resource</th>
                  <th className="text-right py-3 px-4 font-medium">Used</th>
                  <th className="text-right py-3 px-4 font-medium">Limit</th>
                  <th className="text-right py-3 px-4 font-medium">Remaining</th>
                  <th className="text-right py-3 px-4 font-medium">Usage</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3 px-4">Functions</td>
                  <td className="text-right py-3 px-4">{quota.usage.functions.count}</td>
                  <td className="text-right py-3 px-4">{quota.limits.functions.maxCount}</td>
                  <td className="text-right py-3 px-4">{quota.remaining.functions.count}</td>
                  <td className="text-right py-3 px-4">{quota.percentages.functions.count}%</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Daily Invocations</td>
                  <td className="text-right py-3 px-4">{quota.usage.functions.invocationsToday}</td>
                  <td className="text-right py-3 px-4">{quota.limits.functions.maxInvocationsPerDay.toLocaleString()}</td>
                  <td className="text-right py-3 px-4">{quota.remaining.functions.invocationsToday.toLocaleString()}</td>
                  <td className="text-right py-3 px-4">{quota.percentages.functions.invocations}%</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Virtual Machines</td>
                  <td className="text-right py-3 px-4">{quota.usage.virtualMachines.count}</td>
                  <td className="text-right py-3 px-4">{quota.limits.virtualMachines.maxCount}</td>
                  <td className="text-right py-3 px-4">{quota.remaining.virtualMachines.count}</td>
                  <td className="text-right py-3 px-4">{quota.percentages.virtualMachines.count}%</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">CPU Cores</td>
                  <td className="text-right py-3 px-4">{quota.usage.virtualMachines.totalCores}</td>
                  <td className="text-right py-3 px-4">{quota.limits.virtualMachines.maxCores}</td>
                  <td className="text-right py-3 px-4">{quota.remaining.virtualMachines.cores}</td>
                  <td className="text-right py-3 px-4">{quota.percentages.virtualMachines.cores}%</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Memory</td>
                  <td className="text-right py-3 px-4">{formatMemory(quota.usage.virtualMachines.totalMemoryMB)}</td>
                  <td className="text-right py-3 px-4">{formatMemory(quota.limits.virtualMachines.maxMemoryMB)}</td>
                  <td className="text-right py-3 px-4">{formatMemory(quota.remaining.virtualMachines.memoryMB)}</td>
                  <td className="text-right py-3 px-4">{quota.percentages.virtualMachines.memory}%</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Disk Storage</td>
                  <td className="text-right py-3 px-4">{quota.usage.virtualMachines.totalDiskGB} GB</td>
                  <td className="text-right py-3 px-4">{quota.limits.virtualMachines.maxDiskGB} GB</td>
                  <td className="text-right py-3 px-4">{quota.remaining.virtualMachines.diskGB} GB</td>
                  <td className="text-right py-3 px-4">{quota.percentages.virtualMachines.disk}%</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Buckets</td>
                  <td className="text-right py-3 px-4">{quota.usage.storage.bucketCount}</td>
                  <td className="text-right py-3 px-4">{quota.limits.storage.maxBuckets}</td>
                  <td className="text-right py-3 px-4">{quota.remaining.storage.buckets}</td>
                  <td className="text-right py-3 px-4">{quota.percentages.storage.buckets}%</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Object Storage</td>
                  <td className="text-right py-3 px-4">{formatBytes(quota.usage.storage.totalBytes)}</td>
                  <td className="text-right py-3 px-4">{formatBytes(quota.limits.storage.maxTotalBytes)}</td>
                  <td className="text-right py-3 px-4">{formatBytes(quota.remaining.storage.bytes)}</td>
                  <td className="text-right py-3 px-4">{quota.percentages.storage.bytes}%</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Containers (Pristaniste)</td>
                  <td className="text-right py-3 px-4">{quota.usage.platform.containerCount}</td>
                  <td className="text-right py-3 px-4">{quota.limits.platform.maxContainers}</td>
                  <td className="text-right py-3 px-4">{quota.remaining.platform.containers}</td>
                  <td className="text-right py-3 px-4">{quota.percentages.platform.containers}%</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Databases (Tefter)</td>
                  <td className="text-right py-3 px-4">{quota.usage.platform.databaseCount}</td>
                  <td className="text-right py-3 px-4">{quota.limits.platform.maxDatabases}</td>
                  <td className="text-right py-3 px-4">{quota.remaining.platform.databases}</td>
                  <td className="text-right py-3 px-4">{quota.percentages.platform.databases}%</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">Key/Value Tables (Indeks)</td>
                  <td className="text-right py-3 px-4">{quota.usage.platform.keyValueTableCount}</td>
                  <td className="text-right py-3 px-4">{quota.limits.platform.maxKeyValueTables}</td>
                  <td className="text-right py-3 px-4">{quota.remaining.platform.keyValueTables}</td>
                  <td className="text-right py-3 px-4">{quota.percentages.platform.keyValueTables}%</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Queues (Red)</td>
                  <td className="text-right py-3 px-4">{quota.usage.platform.queueCount}</td>
                  <td className="text-right py-3 px-4">{quota.limits.platform.maxQueues}</td>
                  <td className="text-right py-3 px-4">{quota.remaining.platform.queues}</td>
                  <td className="text-right py-3 px-4">{quota.percentages.platform.queues}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
