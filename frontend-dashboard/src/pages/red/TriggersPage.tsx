/**
 * Impuls triggers.
 *
 * Subscriptions that connect a queue to an Impuls function: each message on the
 * queue invokes the function, and is acked on success or retried (and
 * eventually dead-lettered) on failure. This is the SQS-to-Lambda pattern - the
 * piece that makes Red integratable with the rest of Oblak.
 */

import { useState } from 'react';
import { Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import {
  useCreateSubscription,
  useDeleteSubscription,
  useQueues,
  useSubscriptions,
  useUpdateSubscription,
} from '@/hooks/useRed';
import type { RedSubscription } from '@/lib/api/red';

export default function TriggersPage() {
  const { toast } = useToast();
  const subs = useSubscriptions();
  const removeSub = useDeleteSubscription();
  const updateSub = useUpdateSubscription();

  const toggle = async (sub: RedSubscription) => {
    try {
      await updateSub.mutateAsync({ name: sub.name, patch: { enabled: !sub.enabled } });
      toast({ title: sub.enabled ? 'Trigger paused' : 'Trigger enabled', description: sub.name });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not update trigger',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RedSubscription | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RedSubscription | null>(null);

  const list = subs.data ?? [];

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await removeSub.mutateAsync(confirmDelete.name);
      toast({ title: 'Subscription deleted', description: confirmDelete.name });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not delete subscription',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Triggers</h1>
          <p className="text-sm text-muted-foreground">
            Invoke an Impuls function for every message on a queue, with automatic retry and
            dead-lettering.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> New trigger
        </Button>
      </div>

      {subs.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading...</CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Zap className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">No triggers yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Connect a queue to an Impuls function so its messages are processed automatically.
              </p>
            </div>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> New trigger
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Queue → Function</TableHead>
                  <TableHead className="text-right">Batch</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((sub) => (
                  <TableRow key={sub.name}>
                    <TableCell className="font-medium">{sub.name}</TableCell>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground">{sub.queue}</span>
                      {' → '}
                      <span>{sub.function}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{sub.batch_size}</TableCell>
                    <TableCell className="text-right tabular-nums">{sub.delivered_total}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {sub.failed_total}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={sub.enabled}
                          onCheckedChange={() => toggle(sub)}
                          aria-label={`${sub.enabled ? 'Disable' : 'Enable'} ${sub.name}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {sub.enabled ? 'Enabled' : 'Paused'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setEditing(sub)}
                        aria-label={`Edit ${sub.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmDelete(sub)}
                        aria-label={`Delete ${sub.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {list.some((s) => s.last_error) && (
        <p className="text-xs text-muted-foreground">
          Last error on a trigger:{' '}
          <code className="text-xs">{list.find((s) => s.last_error)?.last_error}</code>
        </p>
      )}

      <CreateDialog open={creating} onOpenChange={setCreating} />

      <EditDialog sub={editing} onOpenChange={(o) => !o && setEditing(null)} />

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete trigger {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Messages on {confirmDelete?.queue} will stop being delivered to{' '}
              {confirmDelete?.function}. The queue and its messages are untouched.
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

function EditDialog({
  sub,
  onOpenChange,
}: {
  sub: RedSubscription | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const updateSub = useUpdateSubscription();
  const [batch, setBatch] = useState('1');

  // Re-seed the field each time a different subscription is opened for editing.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (sub && seededFor !== sub.name) {
    setSeededFor(sub.name);
    setBatch(String(sub.batch_size));
  }

  const handleSubmit = async () => {
    if (!sub) return;
    try {
      await updateSub.mutateAsync({ name: sub.name, patch: { batch_size: Number(batch) || 1 } });
      toast({ title: 'Trigger updated', description: sub.name });
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not update trigger',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={Boolean(sub)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {sub?.name}</DialogTitle>
          <DialogDescription>
            How many messages the dispatcher receives per poll before invoking the function. The
            queue and function bindings are fixed; recreate the trigger to repoint it.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-batch">Batch size (1-10)</Label>
            <Input
              id="edit-batch"
              type="number"
              min={1}
              max={10}
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={updateSub.isPending}>
            {updateSub.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queues = useQueues();
  const createSub = useCreateSubscription();

  const [name, setName] = useState('');
  const [queue, setQueue] = useState('');
  const [fn, setFn] = useState('');
  const [batch, setBatch] = useState('1');

  const reset = () => {
    setName('');
    setQueue('');
    setFn('');
    setBatch('1');
  };

  const handleSubmit = async () => {
    try {
      await createSub.mutateAsync({
        name: name.trim(),
        queue,
        function: fn.trim(),
        batch_size: Number(batch) || 1,
      });
      toast({ title: 'Trigger created', description: `${queue} → ${fn}` });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create trigger',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New trigger</DialogTitle>
          <DialogDescription>
            Each message on the queue invokes the function. A successful invocation acks the
            message; a failure lets the queue retry it and, past its max-receive-count,
            dead-letter it.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="t-name">Name</Label>
            <Input id="t-name" placeholder="process-jobs" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Source queue</Label>
            <Select value={queue} onValueChange={setQueue}>
              <SelectTrigger><SelectValue placeholder="choose a queue" /></SelectTrigger>
              <SelectContent>
                {(queues.data ?? []).map((q) => (
                  <SelectItem key={q.name} value={q.name}>{q.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label htmlFor="t-fn">Impuls function</Label>
              <Input id="t-fn" placeholder="queue-worker" value={fn} onChange={(e) => setFn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-batch">Batch</Label>
              <Input id="t-batch" type="number" className="w-24" value={batch} onChange={(e) => setBatch(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The function receives the message body as its event, with the queue name, message id
            and receive count in request headers.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !queue || !fn.trim() || createSub.isPending}>
            {createSub.isPending ? 'Creating...' : 'Create trigger'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
