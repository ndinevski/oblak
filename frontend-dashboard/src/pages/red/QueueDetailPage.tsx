/**
 * One Red queue.
 *
 * Three tabs: Messages (send a message; receive a batch, which makes them
 * in-flight, then delete/ack or let them redeliver), Overview (policy and live
 * depth), and Backups. Receiving here is a real consume - the dashboard is
 * acting as a client - so received messages show their receipt handle and a
 * Delete (ack) action.
 */

import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useNavigate, useParams } from 'react-router-dom';
import { Inbox, RotateCcw, Save, Send, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/hooks/use-toast';
import {
  useBackups,
  useCreateBackup,
  useDeleteBackup,
  useDeleteMessage,
  usePurgeQueue,
  useQueue,
  useQueues,
  useReceive,
  useRestoreBackup,
  useSendMessage,
  useUpdateQueue,
} from '@/hooks/useRed';
import {
  formatBytes,
  formatDuration,
  type RedBackup,
  type RedMessage,
  type RedQueue,
} from '@/lib/api/red';
import { RedUnavailable } from './RedUnavailable';

export default function QueueDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const queue = useQueue(name);

  if (queue.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
    );
  }
  if (queue.isError || !queue.data) {
    return (
      <div className="space-y-6">
        <BackLink onBack={() => navigate('/queues')} />
        <RedUnavailable />
      </div>
    );
  }

  const q = queue.data;

  return (
    <div className="space-y-6">
      <BackLink onBack={() => navigate('/queues')} />

      <div className="flex items-center gap-3">
        <Inbox className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">{q.name}</h1>
          <p className="text-muted-foreground">
            {q.visible_messages} visible · {q.in_flight_messages} in flight · visibility{' '}
            {formatDuration(q.visibility_timeout_seconds)}
          </p>
        </div>
      </div>

      <Tabs defaultValue="messages">
        <TabsList>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="pt-4">
          <MessagesTab queueName={q.name} />
        </TabsContent>
        <TabsContent value="overview" className="pt-4">
          <OverviewTab q={q} />
        </TabsContent>
        <TabsContent value="backups" className="pt-4">
          <BackupsTab queueName={q.name} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button className="text-sm text-muted-foreground hover:text-foreground" onClick={onBack}>
      ← Back to queues
    </button>
  );
}

function OverviewTab({ q }: { q: RedQueue }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Policy</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Detail label="Visibility timeout" value={formatDuration(q.visibility_timeout_seconds)} />
          <Detail label="Retention" value={formatDuration(q.message_retention_seconds)} />
          <Detail
            label="Dead-letter"
            value={q.dead_letter_queue ? `${q.dead_letter_queue} after ${q.max_receive_count} receives` : 'none'}
          />
          <Detail label="Created" value={q.created_at ? new Date(q.created_at).toLocaleString() : '-'} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Depth</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Detail label="Visible messages" value={String(q.visible_messages)} />
          <Detail label="In-flight messages" value={String(q.in_flight_messages)} />
        </CardContent>
      </Card>

      <EditPolicyDialog q={q} open={editing} onOpenChange={setEditing} />
    </div>
  );
}

function EditPolicyDialog({
  q,
  open,
  onOpenChange,
}: {
  q: RedQueue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const updateQueue = useUpdateQueue(q.name);
  const { data: allQueues } = useQueues();

  const [vis, setVis] = useState(String(q.visibility_timeout_seconds));
  const [retention, setRetention] = useState(String(q.message_retention_seconds));
  const [useDlq, setUseDlq] = useState(Boolean(q.dead_letter_queue));
  const [dlq, setDlq] = useState(q.dead_letter_queue ?? '');
  const [maxReceive, setMaxReceive] = useState(String(q.max_receive_count ?? 3));

  // A queue cannot be its own dead-letter target, so leave it out of the list.
  const dlqOptions = (allQueues ?? []).filter((other) => other.name !== q.name);

  const handleSubmit = async () => {
    const patch: Record<string, unknown> = {
      visibility_timeout_seconds: Number(vis),
      message_retention_seconds: Number(retention),
    };
    // Setting the policy sends both parts; clearing it sends the cleared pair
    // (max_receive_count 0 + empty dead_letter_queue), which the service reads
    // as "no dead-letter policy".
    if (useDlq && dlq) {
      patch.dead_letter_queue = dlq;
      patch.max_receive_count = Number(maxReceive) || 3;
    } else {
      patch.dead_letter_queue = '';
      patch.max_receive_count = 0;
    }
    try {
      await updateQueue.mutateAsync(patch);
      toast({ title: 'Queue updated', description: q.name });
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not update queue',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {q.name}</DialogTitle>
          <DialogDescription>
            Changes apply to messages received from now on. The queue name and its messages are
            unaffected.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-vis">Visibility timeout (seconds)</Label>
            <Input id="edit-vis" type="number" value={vis} onChange={(e) => setVis(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-ret">Retention (seconds)</Label>
            <Input id="edit-ret" type="number" value={retention} onChange={(e) => setRetention(e.target.value)} />
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
                    {dlqOptions.map((other) => (
                      <SelectItem key={other.name} value={other.name}>{other.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-max">Max receives</Label>
                <Input id="edit-max" type="number" className="w-28" value={maxReceive} onChange={(e) => setMaxReceive(e.target.value)} />
              </div>
            </div>
          )}
          {useDlq && dlqOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No other queue exists to use as a dead-letter target. Create one first.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={updateQueue.isPending || (useDlq && !dlq)}>
            {updateQueue.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function MessagesTab({ queueName }: { queueName: string }) {
  const { toast } = useToast();
  const send = useSendMessage(queueName);
  const receive = useReceive(queueName);
  const deleteMessage = useDeleteMessage(queueName);
  const purge = usePurgeQueue(queueName);

  const [body, setBody] = useState('');
  const [received, setReceived] = useState<RedMessage[]>([]);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const handleSend = async () => {
    if (!body.trim()) return;
    try {
      await send.mutateAsync({ body });
      toast({ title: 'Message sent' });
      setBody('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Send failed', description: msg(error) });
    }
  };

  const handleReceive = async () => {
    try {
      const res = await receive.mutateAsync({ max_messages: 10 });
      setReceived(res.messages);
      if (res.messages.length === 0) {
        toast({ title: 'No messages available' });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Receive failed', description: msg(error) });
    }
  };

  const handleDelete = async (m: RedMessage) => {
    if (!m.receipt_handle) return;
    try {
      await deleteMessage.mutateAsync(m.receipt_handle);
      setReceived((prev) => prev.filter((x) => x.id !== m.id));
      toast({ title: 'Message deleted' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: msg(error) });
    }
  };

  const handlePurge = async () => {
    try {
      const res = await purge.mutateAsync();
      setReceived([]);
      toast({ title: 'Queue purged', description: `${res.purged} messages removed` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Purge failed', description: msg(error) });
    } finally {
      setConfirmPurge(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send a message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            className="min-h-[6rem] font-mono text-xs"
            placeholder='{"task": "resize", "id": 42}'
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button onClick={handleSend} disabled={!body.trim() || send.isPending}>
              <Send className="mr-2 h-4 w-4" /> Send
            </Button>
            <Button variant="outline" onClick={handleReceive} disabled={receive.isPending}>
              <RotateCcw className="mr-2 h-4 w-4" /> Receive batch
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmPurge(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Purge
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Receiving makes messages in-flight (invisible to other consumers) until you delete them
            or the visibility timeout returns them to the queue.
          </p>
        </CardContent>
      </Card>

      {received.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Received ({received.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-right">Receives</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {received.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{m.id}</div>
                      <code className="block max-w-[36rem] truncate text-xs text-muted-foreground">{m.body}</code>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.receive_count}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => handleDelete(m)}>
                        Delete (ack)
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmPurge} onOpenChange={setConfirmPurge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge {queueName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every message in the queue, visible and in-flight. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePurge}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Purge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BackupsTab({ queueName }: { queueName: string }) {
  const { toast } = useToast();
  const backups = useBackups(queueName);
  const createBackup = useCreateBackup(queueName);
  const deleteBackup = useDeleteBackup();
  const restoreBackup = useRestoreBackup();

  const [confirmRestore, setConfirmRestore] = useState<RedBackup | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RedBackup | null>(null);

  const list = backups.data ?? [];

  const handleBackup = async () => {
    try {
      await createBackup.mutateAsync();
      toast({ title: 'Backup created', description: queueName });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Backup failed', description: msg(error) });
    }
  };

  const handleRestore = async () => {
    if (!confirmRestore) return;
    try {
      await restoreBackup.mutateAsync({ backup_id: confirmRestore.id, confirm: true });
      toast({ title: 'Restore complete', description: `${confirmRestore.message_count} messages restored` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Restore failed', description: msg(error) });
    } finally {
      setConfirmRestore(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteBackup.mutateAsync(confirmDelete.id);
      toast({ title: 'Backup deleted' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not delete backup', description: msg(error) });
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
        <CardContent>
          <Button onClick={handleBackup} disabled={createBackup.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {createBackup.isPending ? 'Backing up...' : 'Back up now'}
          </Button>
        </CardContent>
      </Card>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No backups yet.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Backup</TableHead>
                  <TableHead className="text-right">Messages</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Taken</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.id}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.message_count}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatBytes(b.size_bytes)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {b.created_at ? new Date(b.created_at).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setConfirmRestore(b)} aria-label={`Restore ${b.id}`}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDelete(b)}
                          aria-label={`Delete ${b.id}`}
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
              This replaces the current contents of {queueName} with the {confirmRestore?.message_count ?? 0}{' '}
              messages in <span className="font-mono text-xs">{confirmRestore?.id}</span>.
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
              <span className="font-mono text-xs">{confirmDelete?.id}</span> will be permanently removed.
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

function msg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
