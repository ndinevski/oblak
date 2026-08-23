/**
 * API Keys - self-service.
 *
 * Any signed-in user manages their own API keys here. A key authenticates the
 * CLI and SDKs as its owner and inherits exactly the owner's access, so a key
 * is never more powerful than the person who created it. The secret is shown
 * once, at creation, and never again.
 */

import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { KeyRound, Plus, Trash2, Copy, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { useToast } from '@/hooks/use-toast';
import { useApiKeys, useCreateApiKey, useDeleteApiKey } from '@/hooks/useIdentitet';
import type { ApiKey, CreatedApiKey } from '@/lib/api/identitet';

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export default function ApiKeysPage() {
  const { toast } = useToast();
  const keys = useApiKeys();
  const deleteKey = useDeleteApiKey();

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiKey | null>(null);

  const list = keys.data ?? [];

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteKey.mutateAsync(confirmDelete.id);
      toast({ title: 'Key revoked', description: confirmDelete.name });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not revoke key',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">
            Keys let the CLI and SDKs act as you. A key has exactly your access, no more.
            Send it as <code className="text-xs">Authorization: Bearer &lt;key&gt;</code> or{' '}
            <code className="text-xs">X-API-Key: &lt;key&gt;</code>.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> New key
        </Button>
      </div>

      {keys.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">No API keys yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Create one to use the CLI or an SDK without your dashboard password.
              </p>
            </div>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> New key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key ID</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">
                      {k.name}
                      {k.revoked && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          revoked
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      oblak_{k.keyId}…
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(k.lastUsedAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {k.expiresAt ? formatDate(k.expiresAt) : 'never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmDelete(k)}
                        aria-label={`Revoke ${k.name}`}
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

      <CreateKeyDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(k) => setCreated(k)}
      />
      <RevealKeyDialog created={created} onClose={() => setCreated(null)} />

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything using this key stops working immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (key: CreatedApiKey) => void;
}) {
  const { toast } = useToast();
  const createKey = useCreateApiKey();
  const [name, setName] = useState('');
  const [expires, setExpires] = useState('');

  const reset = () => {
    setName('');
    setExpires('');
  };

  const handleSubmit = async () => {
    try {
      const input: { name: string; expiresInDays?: number } = { name: name.trim() };
      if (expires.trim()) input.expiresInDays = Number(expires);
      const key = await createKey.mutateAsync(input);
      onCreated(key);
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create key',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New API key</DialogTitle>
          <DialogDescription>
            The key inherits your current access. You will see the secret only once.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="k-name">Name</Label>
            <Input
              id="k-name"
              placeholder="cli-laptop"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="k-exp">Expires in (days, optional)</Label>
            <Input
              id="k-exp"
              type="number"
              placeholder="never"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || createKey.isPending}>
            {createKey.isPending ? 'Creating...' : 'Create key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevealKeyDialog({
  created,
  onClose,
}: {
  created: CreatedApiKey | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: 'destructive', title: 'Could not copy', description: 'Copy it manually.' });
    }
  };

  return (
    <Dialog open={Boolean(created)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy your API key</DialogTitle>
          <DialogDescription>
            This is the only time the full key is shown. Store it somewhere safe; if you lose
            it, revoke it and make a new one.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-muted px-3 py-2 font-mono text-sm">
            {created?.key}
          </code>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={copy}
            aria-label="Copy key"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
