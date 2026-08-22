/**
 * VM Detail Page
 * Displays comprehensive VM information with actions, console, and snapshots
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Server,
  Play,
  Square,
  RotateCcw,
  Pause,
  PlayCircle,
  Terminal,
  Camera,
  Trash2,
  RefreshCw,
  Cpu,
  HardDrive,
  Monitor,
  Wifi,
  Clock,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  useVM,
  useVMStats,
  useVMSnapshots,
  useStartVM,
  useStopVM,
  useRebootVM,
  usePauseVM,
  useResumeVM,
  useDeleteVM,
  useSyncVM,
  useCreateVMSnapshot,
  useRestoreVMSnapshot,
  useDeleteVMSnapshot,
  useVMPolling,
} from '@/hooks/useVMs';
import {
  getStatusColor,
  getStatusLabel,
  formatMemory,
  formatDisk,
  formatUptime,
  canStartVM,
  canStopVM,
  canPauseVM,
  canResumeVM,
  canAccessConsole,
  isVMActionable,
} from '@/lib/api/vms';

export default function VMDetailPage() {
  const { vmId } = useParams<{ vmId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  // State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotDescription, setSnapshotDescription] = useState('');

  // Queries
  const { data: vmData, isLoading, error, refetch } = useVM(vmId || '');
  const vm = vmData?.data;

  const { data: statsData } = useVMStats(vmId || '', { enabled: vm?.status === 'running' });
  const stats = statsData?.data;

  const { data: snapshotsData, refetch: refetchSnapshots } = useVMSnapshots(vmId || '');
  const snapshots = snapshotsData?.data || [];

  // Auto-poll during transitions
  useVMPolling(vm);

  // Mutations
  const startVMMutation = useStartVM();
  const stopVMMutation = useStopVM();
  const rebootVMMutation = useRebootVM();
  const pauseVMMutation = usePauseVM();
  const resumeVMMutation = useResumeVM();
  const deleteVMMutation = useDeleteVM();
  const syncVMMutation = useSyncVM();
  const createSnapshotMutation = useCreateVMSnapshot();
  const restoreSnapshotMutation = useRestoreVMSnapshot();
  const deleteSnapshotMutation = useDeleteVMSnapshot();

  // Actions
  const handleStart = async () => {
    if (!vmId) return;
    try {
      await startVMMutation.mutateAsync(vmId);
      toast({ title: 'VM Starting', description: `${vm?.name} is starting...` });
    } catch (err) {
      toast({ title: 'Failed to start VM', variant: 'destructive' });
    }
  };

  const handleStop = async (force = false) => {
    if (!vmId) return;
    try {
      await stopVMMutation.mutateAsync({ id: vmId, force });
      toast({ title: 'VM Stopping', description: `${vm?.name} is stopping...` });
    } catch (err) {
      toast({ title: 'Failed to stop VM', variant: 'destructive' });
    }
  };

  const handleReboot = async () => {
    if (!vmId) return;
    try {
      await rebootVMMutation.mutateAsync(vmId);
      toast({ title: 'VM Rebooting', description: `${vm?.name} is rebooting...` });
    } catch (err) {
      toast({ title: 'Failed to reboot VM', variant: 'destructive' });
    }
  };

  const handlePause = async () => {
    if (!vmId) return;
    try {
      await pauseVMMutation.mutateAsync(vmId);
      toast({ title: 'VM Paused', description: `${vm?.name} has been paused.` });
    } catch (err) {
      toast({ title: 'Failed to pause VM', variant: 'destructive' });
    }
  };

  const handleResume = async () => {
    if (!vmId) return;
    try {
      await resumeVMMutation.mutateAsync(vmId);
      toast({ title: 'VM Resuming', description: `${vm?.name} is resuming...` });
    } catch (err) {
      toast({ title: 'Failed to resume VM', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!vmId) return;
    try {
      await deleteVMMutation.mutateAsync(vmId);
      toast({ title: 'VM Deleted', description: `${vm?.name} has been deleted.` });
      navigate('/vms');
    } catch (err) {
      toast({ title: 'Failed to delete VM', variant: 'destructive' });
    }
  };

  const handleSync = async () => {
    if (!vmId) return;
    try {
      await syncVMMutation.mutateAsync(vmId);
      toast({ title: 'VM Synced', description: 'VM status synchronized with Izvor.' });
    } catch (err) {
      toast({ title: 'Failed to sync VM', variant: 'destructive' });
    }
  };

  const handleCreateSnapshot = async () => {
    if (!vmId || !snapshotName.trim()) return;
    try {
      await createSnapshotMutation.mutateAsync({
        vmId,
        data: { name: snapshotName.trim(), description: snapshotDescription },
      });
      toast({ title: 'Snapshot Created', description: `Snapshot "${snapshotName}" created.` });
      setSnapshotDialogOpen(false);
      setSnapshotName('');
      setSnapshotDescription('');
      refetchSnapshots();
    } catch (err) {
      toast({ title: 'Failed to create snapshot', variant: 'destructive' });
    }
  };

  const handleRestoreSnapshot = async () => {
    if (!vmId || !selectedSnapshot) return;
    try {
      await restoreSnapshotMutation.mutateAsync({ vmId, snapshotName: selectedSnapshot });
      toast({ title: 'Snapshot Restored', description: `Restored to "${selectedSnapshot}".` });
      setRestoreDialogOpen(false);
      setSelectedSnapshot(null);
    } catch (err) {
      toast({ title: 'Failed to restore snapshot', variant: 'destructive' });
    }
  };

  const handleDeleteSnapshot = async (name: string) => {
    if (!vmId) return;
    try {
      await deleteSnapshotMutation.mutateAsync({ vmId, snapshotName: name });
      toast({ title: 'Snapshot Deleted' });
      refetchSnapshots();
    } catch (err) {
      toast({ title: 'Failed to delete snapshot', variant: 'destructive' });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32 mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error || !vm) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="p-6 text-center">
            <p className="text-destructive">Failed to load VM</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/vms')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <Server className="h-6 w-6 text-muted-foreground" />
              <h1 className="text-2xl font-bold">{vm.name}</h1>
              <Badge className={`${getStatusColor(vm.status)} text-white`}>
                {getStatusLabel(vm.status)}
              </Badge>
            </div>
            {vm.description && (
              <p className="text-muted-foreground mt-1">{vm.description}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canStartVM(vm.status) && (
            <Button onClick={handleStart} disabled={startVMMutation.isPending}>
              <Play className="h-4 w-4 mr-2" />
              Start
            </Button>
          )}
          {canStopVM(vm.status) && (
            <Button variant="secondary" onClick={() => handleStop()} disabled={stopVMMutation.isPending}>
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          )}
          {vm.status === 'running' && (
            <Button variant="secondary" onClick={handleReboot} disabled={rebootVMMutation.isPending}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reboot
            </Button>
          )}
          {canPauseVM(vm.status) && (
            <Button variant="outline" onClick={handlePause} disabled={pauseVMMutation.isPending}>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          {canResumeVM(vm.status) && (
            <Button variant="outline" onClick={handleResume} disabled={resumeVMMutation.isPending}>
              <PlayCircle className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}
          <Button variant="outline" onClick={handleSync} disabled={syncVMMutation.isPending}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Resource Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              CPU
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vm.cores} vCPU</div>
            {stats && (
              <>
                <Progress value={stats.cpuUsage} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.cpuUsage.toFixed(1)}% usage
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Memory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMemory(vm.memoryMB)}</div>
            {stats && (
              <>
                <Progress value={(stats.memoryUsed / stats.memoryTotal) * 100} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {formatMemory(stats.memoryUsed)} used
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Disk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDisk(vm.diskGB)}</div>
            {stats && (
              <>
                <Progress value={(stats.diskUsed / stats.diskTotal) * 100} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDisk(stats.diskUsed / (1024 * 1024 * 1024))} used
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Uptime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats && vm.status === 'running' ? formatUptime(stats.uptime) : '-'}
            </div>
            {vm.ipAddress && (
              <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                <Wifi className="h-3 w-3" />
                {vm.ipAddress}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="console" disabled={!canAccessConsole(vm.status)}>
            Console
          </TabsTrigger>
          <TabsTrigger value="snapshots">Snapshots ({snapshots.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">Size</dt>
                  <dd className="font-medium capitalize">{vm.size}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">OS Type</dt>
                  <dd className="font-medium capitalize">{vm.osType}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Template</dt>
                  <dd className="font-medium">{vm.template || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Network</dt>
                  <dd className="font-medium font-mono">{vm.network}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Created</dt>
                  <dd className="font-medium">{new Date(vm.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Updated</dt>
                  <dd className="font-medium">{new Date(vm.updatedAt).toLocaleString()}</dd>
                </div>
              </dl>

              {vm.tags && vm.tags.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <dt className="text-sm text-muted-foreground mb-2">Tags</dt>
                  <div className="flex flex-wrap gap-2">
                    {vm.tags.map(tag => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Button
                variant="destructive"
                disabled={!isVMActionable(vm.status) || deleteVMMutation.isPending}
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete VM
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="console">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Console Access
              </CardTitle>
              <CardDescription>
                Access the VM console directly in your browser
              </CardDescription>
            </CardHeader>
            <CardContent>
              {vm.status === 'running' ? (
                <div className="bg-black rounded-lg p-4 min-h-[400px] flex items-center justify-center">
                  <p className="text-green-400 font-mono text-center">
                    Console viewer would be embedded here.<br />
                    VNC/SPICE client integration required.
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  VM must be running to access the console.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="snapshots">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Snapshots
                </CardTitle>
                <CardDescription>
                  Create and manage VM snapshots
                </CardDescription>
              </div>
              <Button onClick={() => setSnapshotDialogOpen(true)} disabled={!isVMActionable(vm.status)}>
                <Camera className="h-4 w-4 mr-2" />
                Create Snapshot
              </Button>
            </CardHeader>
            <CardContent>
              {snapshots.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No snapshots yet. Create one to save the current VM state.
                </p>
              ) : (
                <div className="space-y-3">
                  {snapshots.map(snapshot => (
                    <div
                      key={snapshot.name}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{snapshot.name}</p>
                        {snapshot.description && (
                          <p className="text-sm text-muted-foreground">{snapshot.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(snapshot.createdAt).toLocaleString()}
                          {snapshot.vmstate && ' (includes memory)'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSnapshot(snapshot.name);
                            setRestoreDialogOpen(true);
                          }}
                          disabled={restoreSnapshotMutation.isPending}
                        >
                          Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSnapshot(snapshot.name)}
                          disabled={deleteSnapshotMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Activity Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                Activity log coming soon.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Virtual Machine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{vm.name}</strong>?
              This action cannot be undone and all data will be permanently lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Snapshot Dialog */}
      <Dialog open={snapshotDialogOpen} onOpenChange={setSnapshotDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Snapshot</DialogTitle>
            <DialogDescription>
              Create a snapshot of the current VM state.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="snapshot-name">Snapshot Name</Label>
              <Input
                id="snapshot-name"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder="before-upgrade"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="snapshot-desc">Description (optional)</Label>
              <Input
                id="snapshot-desc"
                value={snapshotDescription}
                onChange={(e) => setSnapshotDescription(e.target.value)}
                placeholder="Snapshot before system upgrade"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnapshotDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSnapshot}
              disabled={!snapshotName.trim() || createSnapshotMutation.isPending}
            >
              Create Snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Snapshot Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Snapshot</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore the snapshot <strong>{selectedSnapshot}</strong>?
              The VM will be reverted to this state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreSnapshot}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
