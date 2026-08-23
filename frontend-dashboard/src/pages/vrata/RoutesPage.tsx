/**
 * Gateway routes.
 *
 * Vrata's route table: each route sends traffic for a name or hostname to a
 * Pristaniste container or Izvor VM, so that traffic is traced and logged. Routes come
 * from two places - created here by hand, or auto-discovered from Pristaniste - and
 * the list shows both, distinguished by source.
 */

import { useState } from 'react';
import { Check, Copy, Plus, Trash2, Waypoints, Container, Server, Boxes } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import {
  useCreateRoute,
  useDeleteRoute,
  useRoutes,
  useVrataHealth,
} from '@/hooks/useVrata';
import {
  isAutoManaged,
  routeAccessHint,
  routeKindLabel,
  routeSourceClass,
  routeSourceLabel,
  type CreateRouteInput,
  type Route,
  type RouteKind,
} from '@/lib/api/vrata';
import { VrataUnavailable } from './VrataUnavailable';

export default function RoutesPage() {
  const { toast } = useToast();
  const health = useVrataHealth();
  const routes = useRoutes();
  const removeRoute = useDeleteRoute();

  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Route | null>(null);

  const proxyPort = health.data?.proxy_port;

  if (health.data && health.data.status === 'unavailable') {
    return (
      <div className="space-y-4">
        <Heading onCreate={() => setCreating(true)} disabled />
        <VrataUnavailable />
      </div>
    );
  }

  const list = routes.data ?? [];
  const manual = list.filter((r) => !isAutoManaged(r));
  const auto = list.filter(isAutoManaged);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await removeRoute.mutateAsync(confirmDelete.name);
      toast({ title: 'Route deleted', description: confirmDelete.name });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not delete route',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <Heading onCreate={() => setCreating(true)} />

      {routes.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading routes...
          </CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Waypoints className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">No routes yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Add a route to send traffic for a container or VM through the gateway, so its
                requests are traced and logged. Containers deployed through Pristaniste are discovered
                automatically.
              </p>
            </div>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> New route
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <RouteTable
              routes={[...manual, ...auto]}
              proxyPort={proxyPort}
              onDelete={setConfirmDelete}
            />
          </CardContent>
        </Card>
      )}

      <CreateDialog open={creating} onOpenChange={setCreating} />

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete route {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Traffic to this route will stop being proxied and will no longer appear in
              observability.
              {confirmDelete && isAutoManaged(confirmDelete) && (
                <>
                  {' '}This route was discovered automatically from a Pristaniste container, so it will
                  reappear on the next discovery poll while that container is running.
                </>
              )}
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
    </div>
  );
}

function Heading({ onCreate, disabled }: { onCreate: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gateway Routes</h1>
        <p className="text-sm text-muted-foreground">
          Route traffic to containers and VMs through Vrata so it is traced and logged.
        </p>
      </div>
      <Button onClick={onCreate} disabled={disabled}>
        <Plus className="mr-2 h-4 w-4" /> New route
      </Button>
    </div>
  );
}

function KindIcon({ kind }: { kind: RouteKind }) {
  const className = 'h-4 w-4 shrink-0 text-muted-foreground';
  if (kind === 'container') return <Container className={className} />;
  if (kind === 'vm') return <Server className={className} />;
  return <Boxes className={className} />;
}

function RouteTable({
  routes,
  proxyPort,
  onDelete,
}: {
  routes: Route[];
  proxyPort?: string;
  onDelete: (route: Route) => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const copyUpstream = async (route: Route) => {
    const ok = await copyToClipboard(route.upstream);
    if (!ok) {
      toast({ variant: 'destructive', title: 'Could not copy', description: 'Copy it manually.' });
      return;
    }
    setCopied(route.name);
    toast({ title: 'Copied', description: route.upstream });
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Route</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Access</TableHead>
          <TableHead>Upstream</TableHead>
          <TableHead>Source</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {routes.map((route) => (
          <TableRow key={route.name}>
            <TableCell>
              <div className="flex items-center gap-2">
                <KindIcon kind={route.kind} />
                <span className="font-medium">{route.name}</span>
              </div>
              {route.target && (
                <div className="pl-6 text-xs text-muted-foreground">→ {route.target}</div>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="text-xs">
                {routeKindLabel(route.kind)}
              </Badge>
            </TableCell>
            <TableCell>
              <code className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">
                {routeAccessHint(route, proxyPort)}
              </code>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <code className="max-w-[16rem] truncate font-mono text-xs">{route.upstream}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => copyUpstream(route)}
                  aria-label={`Copy upstream for ${route.name}`}
                >
                  {copied === route.name ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={cn('text-xs', routeSourceClass(route.source))}>
                {routeSourceLabel(route.source)}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(route)}
                aria-label={`Delete ${route.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const DEFAULT_KIND: RouteKind = 'container';

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const createRoute = useCreateRoute();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<RouteKind>(DEFAULT_KIND);
  const [upstream, setUpstream] = useState('');
  const [host, setHost] = useState('');
  const [target, setTarget] = useState('');

  const reset = () => {
    setName('');
    setKind(DEFAULT_KIND);
    setUpstream('');
    setHost('');
    setTarget('');
  };

  const handleSubmit = async () => {
    const input: CreateRouteInput = {
      name: name.trim(),
      kind,
      upstream: upstream.trim(),
      host: host.trim() || undefined,
      target: target.trim() || undefined,
    };
    try {
      await createRoute.mutateAsync(input);
      toast({ title: 'Route created', description: input.name });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create route',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New route</DialogTitle>
          <DialogDescription>
            Send traffic for a name or hostname to a container or VM. Requests through the gateway
            are traced and logged.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="route-name">Name</Label>
            <Input
              id="route-name"
              placeholder="my-app"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, digits and hyphens. Path requests use it: <code>/my-app/...</code>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as RouteKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="container">Container</SelectItem>
                  <SelectItem value="vm">VM</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-target">Target (optional)</Label>
              <Input
                id="route-target"
                placeholder="container or VM name"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="route-upstream">Upstream</Label>
            <Input
              id="route-upstream"
              placeholder="http://192.168.1.100:8080"
              value={upstream}
              onChange={(e) => setUpstream(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Where requests go. A bare <code>host:port</code> is assumed http. For a Pristaniste container,
              use <code>http://host.docker.internal:&lt;published-port&gt;</code>; for a VM, its LAN
              address.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="route-host">Host (optional)</Label>
            <Input
              id="route-host"
              placeholder="my-app.oblak.lan"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Match requests by this hostname, forwarding the path untouched (best for web apps).
              Leave blank to match by the <code>/name</code> path prefix instead.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !upstream.trim() || createRoute.isPending}>
            {createRoute.isPending ? 'Creating...' : 'Create route'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
