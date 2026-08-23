/**
 * Indeks tables.
 *
 * The list of key/value tables, with a dialog to create one. A table has a
 * partition key and, optionally, a sort key; those cannot change after
 * creation, which the create form makes explicit.
 */

import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Plus, Table2, Trash2 } from 'lucide-react';
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
import {
  useCreateTable,
  useDeleteTable,
  useIndeksHealth,
  useTables,
} from '@/hooks/useIndeks';
import {
  formatBytes,
  keySchemaSummary,
  type CreateTableInput,
  type IndeksTable,
  type KeyType,
} from '@/lib/api/indeks';
import { IndeksUnavailable } from './IndeksUnavailable';

export default function TablesPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const health = useIndeksHealth();
  const tables = useTables();
  const removeTable = useDeleteTable();

  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<IndeksTable | null>(null);

  if (health.data && health.data.status === 'unavailable') {
    return (
      <div className="space-y-6">
        <Heading onCreate={() => setCreating(true)} disabled />
        <IndeksUnavailable />
      </div>
    );
  }

  const list = tables.data ?? [];

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await removeTable.mutateAsync(confirmDelete.name);
      toast({ title: 'Table deleted', description: confirmDelete.name });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not delete table',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <Heading onCreate={() => setCreating(true)} />

      {tables.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Table2 className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">No tables yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Create a table with a partition key (and an optional sort key) to start storing
                items.
              </p>
            </div>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> New table
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead>Key schema</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((t) => (
                  <TableRow
                    key={t.name}
                    className="cursor-pointer"
                    onClick={() => navigate(`/keyvalue/${encodeURIComponent(t.name)}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{t.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <KeyRound className="h-3.5 w-3.5" />
                        {keySchemaSummary(t.keys)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.item_count}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatBytes(t.size_bytes)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(t);
                        }}
                        aria-label={`Delete ${t.name}`}
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

      <CreateDialog open={creating} onOpenChange={setCreating} />

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete table {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the table and all {confirmDelete?.item_count ?? 0} of its
              items. Existing backups are kept.
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
        <h1 className="text-3xl font-bold">Indeks Tables</h1>
        <p className="text-muted-foreground">
          A DynamoDB-style store: tables of items addressed by a partition and optional sort key.
        </p>
      </div>
      <Button onClick={onCreate} disabled={disabled}>
        <Plus className="mr-2 h-4 w-4" /> New table
      </Button>
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const createTable = useCreateTable();

  const [name, setName] = useState('');
  const [partitionKey, setPartitionKey] = useState('');
  const [partitionType, setPartitionType] = useState<KeyType>('S');
  const [useSort, setUseSort] = useState(false);
  const [sortKey, setSortKey] = useState('');
  const [sortType, setSortType] = useState<KeyType>('S');

  const reset = () => {
    setName('');
    setPartitionKey('');
    setPartitionType('S');
    setUseSort(false);
    setSortKey('');
    setSortType('S');
  };

  const handleSubmit = async () => {
    const input: CreateTableInput = {
      name: name.trim(),
      partition_key: partitionKey.trim(),
      partition_type: partitionType,
    };
    if (useSort && sortKey.trim()) {
      input.sort_key = sortKey.trim();
      input.sort_type = sortType;
    }
    try {
      await createTable.mutateAsync(input);
      toast({ title: 'Table created', description: input.name });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not create table',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New table</DialogTitle>
          <DialogDescription>
            The key schema is fixed once the table exists. Every item must carry the key
            attributes you choose here.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tbl-name">Name</Label>
            <Input
              id="tbl-name"
              placeholder="users"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label htmlFor="pk">Partition key</Label>
              <Input id="pk" placeholder="id" value={partitionKey} onChange={(e) => setPartitionKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={partitionType} onValueChange={(v) => setPartitionType(v as KeyType)}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="S">String</SelectItem>
                  <SelectItem value="N">Number</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useSort} onChange={(e) => setUseSort(e.target.checked)} />
            Add a sort key (for range queries within a partition)
          </label>

          {useSort && (
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-2">
                <Label htmlFor="sk">Sort key</Label>
                <Input id="sk" placeholder="created_at" value={sortKey} onChange={(e) => setSortKey(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={sortType} onValueChange={(v) => setSortType(v as KeyType)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S">String</SelectItem>
                    <SelectItem value="N">Number</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !partitionKey.trim() || (useSort && !sortKey.trim()) || createTable.isPending}
          >
            {createTable.isPending ? 'Creating...' : 'Create table'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
