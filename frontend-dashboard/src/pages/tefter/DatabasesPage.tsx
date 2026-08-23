/**
 * Databases.
 *
 * The list of managed PostgreSQL and MySQL instances Tefter runs, with a
 * dialog to provision a new one. A primary and its read replicas are grouped
 * together so the topology is legible at a glance.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Database, GitBranch, Plus, Trash2 } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import {
  useCreateInstance,
  useDeleteInstance,
  useEngines,
  useInstances,
  useSizes,
  useTefterHealth,
} from '@/hooks/useTefter';
import {
  connectionString,
  engineLabel,
  instanceStatusClass,
  instanceStatusLabel,
  type CreateInstanceResult,
  type DBInstance,
  type Engine,
} from '@/lib/api/tefter';
import { TefterUnavailable } from './TefterUnavailable';

export default function DatabasesPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const health = useTefterHealth();
  const instances = useInstances();
  const removeInstance = useDeleteInstance();

  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DBInstance | null>(null);
  const [credentials, setCredentials] = useState<CreateInstanceResult | null>(null);

  if (health.data && health.data.status === 'unavailable') {
    return (
      <div className="space-y-4">
        <Heading onCreate={() => setCreating(true)} disabled />
        <TefterUnavailable health={health.data} />
      </div>
    );
  }

  const list = instances.data ?? [];
  // Group replicas under their primary so the topology reads top-down.
  const primaries = list.filter((i) => i.role === 'primary');
  const replicasBySource = new Map<string, DBInstance[]>();
  for (const inst of list) {
    if (inst.role === 'replica' && inst.source_instance) {
      const group = replicasBySource.get(inst.source_instance) ?? [];
      group.push(inst);
      replicasBySource.set(inst.source_instance, group);
    }
  }
  // A replica whose primary is gone would otherwise vanish from the list.
  const orphanReplicas = list.filter(
    (i) => i.role === 'replica' && (!i.source_instance || !primaries.some((p) => p.name === i.source_instance))
  );

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await removeInstance.mutateAsync(confirmDelete.name);
      toast({ title: 'Instance deleted', description: confirmDelete.name });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not delete instance',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <Heading onCreate={() => setCreating(true)} />

      {instances.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading instances...
          </CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Database className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">No databases yet</p>
              <p className="text-sm text-muted-foreground">
                Provision a PostgreSQL or MySQL instance to get started.
              </p>
            </div>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> New database
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {primaries.map((primary) => (
            <InstanceGroup
              key={primary.id}
              primary={primary}
              replicas={replicasBySource.get(primary.name) ?? []}
              onOpen={(name) => navigate(`/databases/${encodeURIComponent(name)}`)}
              onDelete={setConfirmDelete}
            />
          ))}
          {orphanReplicas.map((replica) => (
            <InstanceRow
              key={replica.id}
              instance={replica}
              onOpen={(name) => navigate(`/databases/${encodeURIComponent(name)}`)}
              onDelete={setConfirmDelete}
            />
          ))}
        </div>
      )}

      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(result) => {
          setCreating(false);
          setCredentials(result);
        }}
      />

      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the instance and its data volume. Existing backups are kept.
              {confirmDelete?.role === 'primary' &&
                ' A primary with replicas cannot be deleted until its replicas are removed or promoted.'}
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
        <h1 className="text-2xl font-semibold tracking-tight">Databases</h1>
        <p className="text-sm text-muted-foreground">
          Managed PostgreSQL and MySQL, with read replicas and backups.
        </p>
      </div>
      <Button onClick={onCreate} disabled={disabled}>
        <Plus className="mr-2 h-4 w-4" /> New database
      </Button>
    </div>
  );
}

function InstanceGroup({
  primary,
  replicas,
  onOpen,
  onDelete,
}: {
  primary: DBInstance;
  replicas: DBInstance[];
  onOpen: (name: string) => void;
  onDelete: (instance: DBInstance) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <InstanceRow instance={primary} onOpen={onOpen} onDelete={onDelete} bare />
        {replicas.map((replica) => (
          <div key={replica.id} className="border-t border-border/60 pl-6">
            <InstanceRow instance={replica} onOpen={onOpen} onDelete={onDelete} bare replica />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InstanceRow({
  instance,
  onOpen,
  onDelete,
  bare,
  replica,
}: {
  instance: DBInstance;
  onOpen: (name: string) => void;
  onDelete: (instance: DBInstance) => void;
  bare?: boolean;
  replica?: boolean;
}) {
  const content = (
    <div className="flex items-center justify-between gap-4 p-4">
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => onOpen(instance.name)}
      >
        {replica ? (
          <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{instance.name}</span>
            <Badge variant="outline" className="shrink-0 text-xs">
              {engineLabel(instance.engine)} {instance.version}
            </Badge>
            {replica && (
              <Badge variant="outline" className="shrink-0 text-xs">
                replica
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {instance.host}:{instance.port} · {instance.size}
            {instance.source_instance && ` · follows ${instance.source_instance}`}
          </p>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline" className={cn('text-xs', instanceStatusClass(instance.status))}>
          {instanceStatusLabel(instance.status)}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(instance)}
          aria-label={`Delete ${instance.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  if (bare) return content;
  return (
    <Card>
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
}

const DEFAULT_SIZE = 'small';

function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: CreateInstanceResult) => void;
}) {
  const { toast } = useToast();
  const engines = useEngines();
  const sizes = useSizes();
  const createInstance = useCreateInstance();

  const [name, setName] = useState('');
  const [engine, setEngine] = useState<Engine>('postgres');
  const [version, setVersion] = useState('');
  const [size, setSize] = useState(DEFAULT_SIZE);

  // Versions offered depend on the chosen engine.
  const versions = useMemo(
    () => (engines.data ?? []).filter((e) => e.engine === engine),
    [engines.data, engine]
  );

  const reset = () => {
    setName('');
    setEngine('postgres');
    setVersion('');
    setSize(DEFAULT_SIZE);
  };

  const handleSubmit = async () => {
    try {
      const result = await createInstance.mutateAsync({
        name: name.trim(),
        engine,
        version: version || undefined,
        size,
      });
      toast({ title: 'Database provisioned', description: result.instance.name });
      reset();
      onCreated(result);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create database',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New database</DialogTitle>
          <DialogDescription>
            Tefter provisions the instance and returns its password once. There is no way to
            recover it afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="db-name">Name</Label>
            <Input
              id="db-name"
              placeholder="orders"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, digits and hyphens. The database and user default to this name.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Engine</Label>
              <Select
                value={engine}
                onValueChange={(v) => {
                  setEngine(v as Engine);
                  setVersion('');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Version</Label>
              <Select value={version || 'default'} onValueChange={(v) => setVersion(v === 'default' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  {versions.map((v) => (
                    <SelectItem key={v.version} value={v.version}>
                      {v.version}
                      {v.default ? ' (default)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          <Button onClick={handleSubmit} disabled={!name.trim() || createInstance.isPending}>
            {createInstance.isPending ? 'Provisioning...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The one and only time the generated password is shown. It is deliberately a
 * separate, explicit dialog so it cannot be dismissed by accident before it is
 * copied.
 */
function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: CreateInstanceResult | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  if (!credentials) return null;

  const { instance, password } = credentials;
  const conn = connectionString(instance).replace('<password>', password);

  const copy = async (value: string, what: string) => {
    const ok = await copyToClipboard(value);
    if (!ok) {
      toast({
        variant: 'destructive',
        title: 'Could not copy',
        description: 'Select the text and copy it manually.',
      });
      return;
    }
    setCopied(what);
    toast({ title: 'Copied', description: what });
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save your credentials</DialogTitle>
          <DialogDescription>
            This password is shown once and cannot be recovered. Store it somewhere safe before
            closing this dialog.
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0: DialogContent is a CSS grid, whose items default to
            min-width:auto and so refuse to shrink below their content width.
            Without this the long connection string would push this whole block
            (and the copy buttons) past the dialog's edge. */}
        <div className="min-w-0 space-y-3">
          <Field label="Password" value={password} copied={copied === 'Password'} onCopy={() => copy(password, 'Password')} mono />
          <Field label="Host" value={`${instance.host}:${instance.port}`} copied={copied === 'Host'} onCopy={() => copy(`${instance.host}:${instance.port}`, 'Host')} />
          <Field label="Database" value={instance.database} copied={copied === 'Database'} onCopy={() => copy(instance.database, 'Database')} />
          <Field label="Username" value={instance.username} copied={copied === 'Username'} onCopy={() => copy(instance.username, 'Username')} />
          <Field label="Connection string" value={conn} copied={copied === 'Connection string'} onCopy={() => copy(conn, 'Connection string')} mono />
        </div>

        <DialogFooter>
          <Button onClick={onClose}>I have saved the password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onCopy,
  copied,
  mono,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code
          className={cn(
            // min-w-0 lets the flex child shrink below its content width, so
            // truncate takes effect instead of pushing the copy button out of
            // the dialog.
            'min-w-0 flex-1 truncate rounded border border-border bg-muted px-2 py-1.5 text-xs',
            mono && 'font-mono'
          )}
        >
          {value}
        </code>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={onCopy}
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
