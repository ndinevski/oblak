/**
 * One database instance.
 *
 * Overview, its read replicas (with live replication lag), and its backups
 * (create, restore, delete). Restore and promotion are guarded actions, so
 * each confirms before it runs.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowUpCircle,
  Check,
  Copy,
  Database,
  GitBranch,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { copyToClipboard } from '@/lib/clipboard';
import {
  useBackups,
  useCreateBackup,
  useCreateReplica,
  useDeleteBackup,
  useDeleteInstance,
  useInstance,
  usePromoteReplica,
  useReplicationStatus,
  useRestoreBackup,
  useSizes,
} from '@/hooks/useTefter';
import {
  connectionString,
  engineLabel,
  formatBytes,
  formatLag,
  instanceStatusClass,
  instanceStatusLabel,
  replicationStateClass,
  replicationStateLabel,
  type Backup,
  type DBInstance,
} from '@/lib/api/tefter';
import { TefterUnavailable } from './TefterUnavailable';

export default function DatabaseDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const instance = useInstance(name);
  const removeInstance = useDeleteInstance();

  const [confirmDelete, setConfirmDelete] = useState(false);

  if (instance.isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading {name}...
        </CardContent>
      </Card>
    );
  }

  if (instance.isError || !instance.data) {
    return (
      <div className="space-y-4">
        <BackLink onBack={() => navigate('/databases')} />
        <TefterUnavailable />
      </div>
    );
  }

  const db = instance.data;

  const handleDelete = async () => {
    try {
      await removeInstance.mutateAsync(db.name);
      toast({ title: 'Instance deleted', description: db.name });
      navigate('/databases');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not delete instance',
        description: error instanceof Error ? error.message : String(error),
      });
      setConfirmDelete(false);
    }
  };

  return (
    <div className="space-y-4">
      <BackLink onBack={() => navigate('/databases')} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {db.role === 'replica' ? (
            <GitBranch className="h-6 w-6 text-muted-foreground" />
          ) : (
            <Database className="h-6 w-6 text-muted-foreground" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{db.name}</h1>
              <Badge variant="outline" className={cn('text-xs', instanceStatusClass(db.status))}>
                {instanceStatusLabel(db.status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {engineLabel(db.engine)} {db.version} · {db.role} · {db.size}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {db.role === 'primary' && <TabsTrigger value="replicas">Replicas</TabsTrigger>}
          {db.role === 'replica' && <TabsTrigger value="replication">Replication</TabsTrigger>}
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <OverviewTab db={db} />
        </TabsContent>

        {db.role === 'primary' && (
          <TabsContent value="replicas" className="pt-4">
            <ReplicasTab db={db} onOpen={(n) => navigate(`/databases/${encodeURIComponent(n)}`)} />
          </TabsContent>
        )}

        {db.role === 'replica' && (
          <TabsContent value="replication" className="pt-4">
            <ReplicationTab db={db} />
          </TabsContent>
        )}

        <TabsContent value="backups" className="pt-4">
          <BackupsTab db={db} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {db.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the instance and its data volume. Existing backups are kept.
              {db.role === 'primary' &&
                (db.replicas?.length ?? 0) > 0 &&
                ' This primary still has replicas and cannot be deleted until they are removed or promoted.'}
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

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button className="text-sm text-muted-foreground hover:text-foreground" onClick={onBack}>
      ← Back to databases
    </button>
  );
}

function OverviewTab({ db }: { db: DBInstance }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const conn = connectionString(db);

  const copyConn = async () => {
    const ok = await copyToClipboard(conn);
    if (!ok) {
      toast({
        variant: 'destructive',
        title: 'Could not copy',
        description: 'Select the text and copy it manually.',
      });
      return;
    }
    setCopied(true);
    toast({ title: 'Copied', description: 'Connection string (with placeholder password)' });
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Detail label="Host" value={`${db.host}:${db.port}`} />
          <Detail label="Database" value={db.database} />
          <Detail label="Username" value={db.username} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Connection string</Label>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded border border-border bg-muted px-2 py-1.5 font-mono text-xs">
                {conn}
              </code>
              <Button variant="outline" size="icon" className="shrink-0" onClick={copyConn} aria-label="Copy connection string">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The password is set once at creation and is not shown here.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Detail label="Engine" value={`${engineLabel(db.engine)} ${db.version}`} />
          <Detail label="Image" value={db.image} />
          <Detail label="Role" value={db.role} />
          {db.source_instance && <Detail label="Follows" value={db.source_instance} />}
          <Detail label="Size" value={db.size} />
          {db.cpu_limit != null && <Detail label="CPU limit" value={`${db.cpu_limit} vCPU`} />}
          {db.memory_limit != null && <Detail label="Memory limit" value={formatBytes(db.memory_limit)} />}
          <Detail label="Created" value={new Date(db.created_at).toLocaleString()} />
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}

function ReplicasTab({ db, onOpen }: { db: DBInstance; onOpen: (name: string) => void }) {
  const [creating, setCreating] = useState(false);
  const replicas = db.replicas ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} disabled={db.status !== 'available'}>
          <Plus className="mr-2 h-4 w-4" /> Add replica
        </Button>
      </div>

      {replicas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <GitBranch className="h-7 w-7 text-muted-foreground" />
            <p className="font-medium">No replicas</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              A read replica streams changes from this primary and serves read-only queries.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {replicas.map((replicaName) => (
            <ReplicaRow key={replicaName} name={replicaName} onOpen={onOpen} />
          ))}
        </div>
      )}

      <CreateReplicaDialog source={db.name} open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function ReplicaRow({ name, onOpen }: { name: string; onOpen: (name: string) => void }) {
  // Each replica reports its own lag, polled live.
  const status = useReplicationStatus(name);

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(name)}>
          <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{name}</span>
        </button>
        {status.data && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('text-xs', replicationStateClass(status.data.state))}>
              {replicationStateLabel(status.data.state)}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatLag(status.data)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReplicationTab({ db }: { db: DBInstance }) {
  const { toast } = useToast();
  const status = useReplicationStatus(db.name);
  const promote = usePromoteReplica();
  const [confirmPromote, setConfirmPromote] = useState(false);

  const handlePromote = async () => {
    try {
      await promote.mutateAsync(db.name);
      toast({
        title: 'Replica promoted',
        description: `${db.name} is now a standalone primary.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not promote replica',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConfirmPromote(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Replication status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {status.isLoading && <p className="text-muted-foreground">Checking...</p>}
          {status.data && (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">State</span>
                <Badge variant="outline" className={cn('text-xs', replicationStateClass(status.data.state))}>
                  {replicationStateLabel(status.data.state)}
                </Badge>
              </div>
              <Detail label="Following" value={status.data.source_instance ?? db.source_instance ?? '-'} />
              <Detail label="Lag" value={formatLag(status.data)} />
              {status.data.lag_bytes != null && (
                <Detail label="Bytes behind" value={formatBytes(status.data.lag_bytes)} />
              )}
              {status.data.detail && (
                <p className="rounded border border-border bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                  {status.data.detail}
                </p>
              )}
              <Detail label="Checked" value={new Date(status.data.checked_at).toLocaleTimeString()} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Promote</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Promotion makes this replica a standalone primary that accepts writes and stops
            following {db.source_instance ?? 'its primary'}. It is one-way: to replicate again you
            create a new replica.
          </p>
          <Button variant="outline" onClick={() => setConfirmPromote(true)}>
            <ArrowUpCircle className="mr-2 h-4 w-4" /> Promote to primary
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmPromote} onOpenChange={setConfirmPromote}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote {db.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is one-way. {db.name} will accept writes and permanently stop following{' '}
              {db.source_instance ?? 'its primary'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePromote}>Promote</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BackupsTab({ db }: { db: DBInstance }) {
  const { toast } = useToast();
  const backups = useBackups(db.name);
  const createBackup = useCreateBackup();
  const deleteBackup = useDeleteBackup();
  const restoreBackup = useRestoreBackup();

  const [description, setDescription] = useState('');
  const [confirmRestore, setConfirmRestore] = useState<Backup | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Backup | null>(null);

  const list = backups.data ?? [];

  const handleBackup = async () => {
    try {
      await createBackup.mutateAsync({ instance: db.name, description: description.trim() || undefined });
      toast({ title: 'Backup started', description: db.name });
      setDescription('');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create backup',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleRestore = async () => {
    if (!confirmRestore) return;
    try {
      const result = await restoreBackup.mutateAsync({
        backup_id: confirmRestore.id,
        confirm: true,
      });
      toast({
        title: 'Restore complete',
        description: result.pre_restore_backup_id
          ? `A safety backup (${result.pre_restore_backup_id}) was taken first.`
          : 'The database was restored.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Restore failed',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConfirmRestore(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteBackup.mutateAsync(confirmDelete.id);
      toast({ title: 'Backup deleted', description: confirmDelete.id });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not delete backup',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Take a backup</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Optional note, e.g. before schema change"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleBackup} disabled={createBackup.isPending || db.status !== 'available'}>
            <Save className="mr-2 h-4 w-4" />
            {createBackup.isPending ? 'Backing up...' : 'Back up now'}
          </Button>
        </CardContent>
      </Card>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No backups yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Backup</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Taken</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((backup) => (
                  <TableRow key={backup.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{backup.id}</div>
                      {backup.description && (
                        <div className="text-xs text-muted-foreground">{backup.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {backup.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatBytes(backup.size_bytes)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(backup.started_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmRestore(backup)}
                          disabled={backup.status !== 'available'}
                          aria-label={`Restore ${backup.id}`}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDelete(backup)}
                          aria-label={`Delete ${backup.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={Boolean(confirmRestore)} onOpenChange={(o) => !o && setConfirmRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This overwrites the current data in {db.name} with the contents of{' '}
              <span className="font-mono text-xs">{confirmRestore?.id}</span>. A safety backup is
              taken automatically first, so the current state can be recovered if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono text-xs">{confirmDelete?.id}</span> will be permanently
              removed. This cannot be undone.
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

function CreateReplicaDialog({
  source,
  open,
  onOpenChange,
}: {
  source: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const sizes = useSizes();
  const createReplica = useCreateReplica();

  const [name, setName] = useState('');
  const [size, setSize] = useState('micro');

  const reset = () => {
    setName('');
    setSize('micro');
  };

  const handleSubmit = async () => {
    try {
      await createReplica.mutateAsync({ source, name: name.trim(), size });
      toast({ title: 'Replica created', description: name.trim() });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create replica',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a read replica</DialogTitle>
          <DialogDescription>
            The replica is seeded from a copy of {source} and then streams changes from it. It
            accepts the same credentials and rejects writes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="replica-name">Name</Label>
            <Input
              id="replica-name"
              placeholder={`${source}-ro`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Size</Label>
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(sizes.data ?? []).map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} — {s.cpu} vCPU, {s.memory_mb} MB
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || createReplica.isPending}>
            {createReplica.isPending ? 'Creating...' : 'Create replica'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
