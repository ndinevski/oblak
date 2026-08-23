/**
 * Containers.
 *
 * Running workloads launched from images in Brod's registry, with lifecycle
 * controls, logs and live resource usage.
 */

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Box,
  FileText,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Square,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useBrodHealth,
  useContainerAction,
  useContainerLogs,
  useContainerStats,
  useContainers,
  useCreateContainer,
  useDeleteContainer,
  useRepositories,
} from '@/hooks/useBrod';
import {
  containerStatusClass,
  containerStatusLabel,
  formatBytes,
  formatPorts,
  isRunning,
  type BrodContainer,
  type RestartPolicy,
} from '@/lib/api/brod';
import { BrodUnavailable } from './BrodUnavailable';

export default function ContainersPage() {
  const { toast } = useToast();
  const health = useBrodHealth();
  const containers = useContainers();
  const action = useContainerAction();
  const removeContainer = useDeleteContainer();

  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BrodContainer | null>(null);
  const [logsFor, setLogsFor] = useState<BrodContainer | null>(null);

  if (health.data && health.data.status === 'unavailable') {
    return (
      <div className="space-y-4">
        <Heading />
        <BrodUnavailable health={health.data} />
      </div>
    );
  }

  const list = containers.data ?? [];
  const runningCount = list.filter((c) => isRunning(c.status)).length;

  const runAction = async (c: BrodContainer, verb: 'start' | 'stop' | 'restart') => {
    try {
      await action.mutateAsync({ id: c.name || c.id, action: verb });
      toast({ title: `Container ${verb}ed`, description: c.name });
    } catch (error) {
      toast({
        title: `Could not ${verb} the container`,
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await removeContainer.mutateAsync(confirmDelete.name || confirmDelete.id);
      toast({ title: 'Container removed', description: confirmDelete.name });
    } catch (error) {
      toast({
        title: 'Could not remove the container',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => containers.refetch()}
            disabled={containers.isFetching}
          >
            <RefreshCw className={cn('mr-2 h-3.5 w-3.5', containers.isFetching && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Run container
          </Button>
        </div>
      </div>

      {health.data && health.data.status === 'degraded' && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="flex items-center gap-2 py-3 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Brod is degraded: engine {health.data.engine}, registry {health.data.registry}.
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Containers
            <span className="ml-2 font-normal text-muted-foreground">
              {runningCount} running of {list.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.length === 0 && !containers.isLoading ? (
            <div className="flex flex-col items-center gap-1 py-12 text-center">
              <Box className="mb-1 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No containers yet</p>
              <p className="text-xs text-muted-foreground/70">
                Push an image, then run it from here
              </p>
            </div>
          ) : (
            <div className={cn('divide-y divide-border', containers.isFetching && 'opacity-60')}>
              {list.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  {/* Status is a badge with its own text, never colour alone. */}
                  <Badge
                    variant="outline"
                    className={cn('shrink-0 text-[10px]', containerStatusClass(c.status))}
                  >
                    {containerStatusLabel(c.status)}
                  </Badge>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {c.image}
                      {c.ports?.length ? ` · ${formatPorts(c.ports)}` : ''}
                    </p>
                  </div>

                  <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:block">
                    {c.id}
                  </span>

                  <div className="flex shrink-0 gap-1">
                    {isRunning(c.status) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => runAction(c, 'stop')}
                        aria-label={`Stop ${c.name}`}
                        title="Stop"
                      >
                        <Square className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => runAction(c, 'start')}
                        aria-label={`Start ${c.name}`}
                        title="Start"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => runAction(c, 'restart')}
                      aria-label={`Restart ${c.name}`}
                      title="Restart"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setLogsFor(c)}
                      aria-label={`Logs for ${c.name}`}
                      title="Logs"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setConfirmDelete(c)}
                      aria-label={`Remove ${c.name}`}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {creating && <RunContainerDialog open onClose={() => setCreating(false)} />}
      {logsFor && <LogsDialog container={logsFor} onClose={() => setLogsFor(null)} />}

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this container?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.name} will be stopped and removed, along with any anonymous
              volumes it created. The image it ran stays in the registry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RunContainerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateContainer();
  const repositories = useRepositories();

  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [hostPort, setHostPort] = useState('');
  const [containerPort, setContainerPort] = useState('');
  const [memoryMb, setMemoryMb] = useState('');
  const [restartPolicy, setRestartPolicy] = useState<RestartPolicy>('unless-stopped');
  const [start, setStart] = useState(true);

  // Suggest images already in the registry, so the common case needs no typing.
  const suggestions = useMemo(() => {
    return (repositories.data ?? [])
      .filter((r) => r.exists && r.latest_tag)
      .map((r) => `${r.name}:${r.latest_tag}`);
  }, [repositories.data]);

  const submit = async () => {
    const ports =
      containerPort && hostPort
        ? [{ container_port: Number(containerPort), host_port: Number(hostPort) }]
        : undefined;

    try {
      await create.mutateAsync({
        name: name.trim(),
        image: image.trim(),
        ports,
        // The API takes bytes; the form asks for MB because nobody thinks in
        // bytes when sizing a container.
        memory_limit: memoryMb ? Number(memoryMb) * 1024 * 1024 : undefined,
        restart_policy: restartPolicy,
        start,
      });
      toast({ title: 'Container created', description: name });
      onClose();
    } catch (error) {
      toast({
        title: 'Could not create the container',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Run a container</DialogTitle>
          <DialogDescription>
            An unqualified image name resolves against Brod's own registry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="container-name">Name</Label>
            <Input
              id="container-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-app"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="container-image">Image</Label>
            <Input
              id="container-image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="my-app:v1"
              list="brod-image-suggestions"
            />
            <datalist id="brod-image-suggestions">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {suggestions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                In your registry: {suggestions.slice(0, 3).join(', ')}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="host-port">Host port</Label>
              <Input
                id="host-port"
                type="number"
                value={hostPort}
                onChange={(e) => setHostPort(e.target.value)}
                placeholder="8090"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="container-port">Container port</Label>
              <Input
                id="container-port"
                type="number"
                value={containerPort}
                onChange={(e) => setContainerPort(e.target.value)}
                placeholder="80"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="memory-limit">Memory limit (MB)</Label>
              <Input
                id="memory-limit"
                type="number"
                min={6}
                value={memoryMb}
                onChange={(e) => setMemoryMb(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="restart-policy">Restart policy</Label>
              <Select
                value={restartPolicy}
                onValueChange={(v) => setRestartPolicy(v as RestartPolicy)}
              >
                <SelectTrigger id="restart-policy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unless-stopped">Unless stopped</SelectItem>
                  <SelectItem value="always">Always</SelectItem>
                  <SelectItem value="on-failure">On failure</SelectItem>
                  <SelectItem value="no">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="start-now" checked={start} onCheckedChange={setStart} />
            <Label htmlFor="start-now">Start immediately</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={create.isPending || !name.trim() || !image.trim()}
          >
            {/* Creating pulls the image first, which can take a while. */}
            {create.isPending ? 'Pulling and starting...' : 'Run'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogsDialog({ container, onClose }: { container: BrodContainer; onClose: () => void }) {
  const [follow, setFollow] = useState(true);
  const id = container.name || container.id;
  const logs = useContainerLogs(id, 300, follow);
  const stats = useContainerStats(id, isRunning(container.status));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{container.name}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{container.image}</DialogDescription>
        </DialogHeader>

        {stats.data && (
          <div className="flex flex-wrap gap-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
            <span>
              CPU <span className="font-medium tabular-nums">{stats.data.cpu_percent.toFixed(1)}%</span>
            </span>
            <span>
              Memory{' '}
              <span className="font-medium tabular-nums">
                {formatBytes(stats.data.memory_usage)}
                {stats.data.memory_limit > 0 && ` / ${formatBytes(stats.data.memory_limit)}`}
              </span>
            </span>
            <span>
              Net in <span className="font-medium tabular-nums">{formatBytes(stats.data.network_rx_bytes)}</span>
            </span>
            <span>
              Net out <span className="font-medium tabular-nums">{formatBytes(stats.data.network_tx_bytes)}</span>
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Switch id="follow-logs" checked={follow} onCheckedChange={setFollow} />
          <Label htmlFor="follow-logs" className="text-sm">
            Follow
          </Label>
        </div>

        <div className="max-h-[45vh] overflow-auto rounded-md border border-border bg-muted/30 p-3">
          {logs.data?.length ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
              {logs.data.map((entry, i) => (
                <div
                  key={i}
                  className={cn(entry.stream === 'stderr' && 'text-red-600 dark:text-red-400')}
                >
                  {entry.message}
                </div>
              ))}
            </pre>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {logs.isLoading ? 'Loading logs...' : 'No output yet'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Heading() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Containers</h1>
      <p className="text-sm text-muted-foreground">
        Workloads running from images in your registry
      </p>
    </div>
  );
}
