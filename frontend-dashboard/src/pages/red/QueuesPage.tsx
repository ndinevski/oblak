/**
 * Red queues.
 *
 * The list of message queues with their live depth, and a dialog to create one
 * (with optional dead-letter policy). Depth polls so a backing-up queue is
 * visible at a glance.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Plus, Trash2 } from 'lucide-react';
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
import { useCreateQueue, useDeleteQueue, useQueues, useRedHealth } from '@/hooks/useRed';
import { formatDuration, type CreateQueueInput, type RedQueue } from '@/lib/api/red';
import { RedUnavailable } from './RedUnavailable';

export default function QueuesPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const health = useRedHealth();
  const queues = useQueues();
  const removeQueue = useDeleteQueue();

  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RedQueue | null>(null);

  if (health.data && health.data.status === 'unavailable') {
    return (
      <div className="space-y-4">
        <Heading onCreate={() => setCreating(true)} disabled />
        <RedUnavailable />
      </div>
    );
  }

  const list = queues.data ?? [];

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await removeQueue.mutateAsync(confirmDelete.name);
      toast({ title: 'Queue deleted', description: confirmDelete.name });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not delete queue',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <Heading onCreate={() => setCreating(true)} />

      {queues.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading queues...</CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">No queues yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Create a queue to start sending and receiving messages.
              </p>
            </div>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> New queue
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Queue</TableHead>
                  <TableHead className="text-right">Visible</TableHead>
                  <TableHead className="text-right">In flight</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Dead-letter</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((q) => (
                  <TableRow
                    key={q.name}
                    className="cursor-pointer"
                    onClick={() => navigate(`/queues/${encodeURIComponent(q.name)}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Inbox className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{q.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{q.visible_messages}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {q.in_flight_messages}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDuration(q.visibility_timeout_seconds)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {q.dead_letter_queue ? `${q.dead_letter_queue} (×${q.max_receive_count})` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(q);
                        }}
                        aria-label={`Delete ${q.name}`}
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

      <CreateDialog open={creating} onOpenChange={setCreating} queues={list} />

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete queue {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the queue and all its messages. A queue that is another
              queue's dead-letter target cannot be deleted. Existing backups are kept.
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
        <h1 className="text-2xl font-semibold tracking-tight">Message Queues</h1>
        <p className="text-sm text-muted-foreground">
          SQS-style queues with at-least-once delivery, visibility timeouts and dead-letter queues.
        </p>
      </div>
      <Button onClick={onCreate} disabled={disabled}>
        <Plus className="mr-2 h-4 w-4" /> New queue
      </Button>
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  queues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queues: RedQueue[];
}) {
  const { toast } = useToast();
  const createQueue = useCreateQueue();

  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState('30');
  const [useDlq, setUseDlq] = useState(false);
  const [dlq, setDlq] = useState('');
  const [maxReceive, setMaxReceive] = useState('3');

  const reset = () => {
    setName('');
    setVisibility('30');
    setUseDlq(false);
    setDlq('');
    setMaxReceive('3');
  };

  const handleSubmit = async () => {
    const input: CreateQueueInput = {
      name: name.trim(),
      visibility_timeout_seconds: Number(visibility) || 30,
    };
    if (useDlq && dlq) {
      input.dead_letter_queue = dlq;
      input.max_receive_count = Number(maxReceive) || 3;
    }
    try {
      await createQueue.mutateAsync(input);
      toast({ title: 'Queue created', description: input.name });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create queue',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New queue</DialogTitle>
          <DialogDescription>
            A message stays invisible for the visibility timeout after it is received; if it is not
            deleted in that window it is redelivered.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="q-name">Name</Label>
            <Input id="q-name" placeholder="jobs" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="q-vis">Visibility timeout (seconds)</Label>
            <Input id="q-vis" type="number" value={visibility} onChange={(e) => setVisibility(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useDlq} onChange={(e) => setUseDlq(e.target.checked)} />
            Send failed messages to a dead-letter queue
          </label>

          {useDlq && (
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-2">
                <Label>Dead-letter queue</Label>
                <Select value={dlq} onValueChange={setDlq}>
                  <SelectTrigger><SelectValue placeholder="choose a queue" /></SelectTrigger>
                  <SelectContent>
                    {queues.map((q) => (
                      <SelectItem key={q.name} value={q.name}>{q.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-max">Max receives</Label>
                <Input id="q-max" type="number" className="w-28" value={maxReceive} onChange={(e) => setMaxReceive(e.target.value)} />
              </div>
            </div>
          )}
          {useDlq && queues.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Create the dead-letter queue first, then create this one pointing at it.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || (useDlq && !dlq) || createQueue.isPending}
          >
            {createQueue.isPending ? 'Creating...' : 'Create queue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
