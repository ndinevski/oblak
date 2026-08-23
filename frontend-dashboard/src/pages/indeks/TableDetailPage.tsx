/**
 * One Indeks table.
 *
 * Three tabs: Items (scan or query by partition, put a new item as JSON,
 * delete by key), Overview (key schema and stats), and Backups (create,
 * restore, delete). Items are shown as formatted JSON, which is what a
 * schemaless document store naturally holds.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { KeyRound, Plus, RotateCcw, Save, Search, Table2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  useBackups,
  useCreateBackup,
  useDeleteBackup,
  useDeleteItem,
  usePutItem,
  useQueryItems,
  useRestoreBackup,
  useScanItems,
  useTable,
} from '@/hooks/useIndeks';
import {
  formatBytes,
  keySchemaSummary,
  keyTypeLabel,
  type Backup,
  type Item,
  type KeySchema,
  type SortOp,
} from '@/lib/api/indeks';
import { IndeksUnavailable } from './IndeksUnavailable';

export default function TableDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const table = useTable(name);

  if (table.isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading {name}...
        </CardContent>
      </Card>
    );
  }
  if (table.isError || !table.data) {
    return (
      <div className="space-y-4">
        <BackLink onBack={() => navigate('/keyvalue')} />
        <IndeksUnavailable />
      </div>
    );
  }

  const t = table.data;

  return (
    <div className="space-y-4">
      <BackLink onBack={() => navigate('/keyvalue')} />

      <div className="flex items-center gap-3">
        <Table2 className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.name}</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" />
            {keySchemaSummary(t.keys)}
          </p>
        </div>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="pt-4">
          <ItemsTab tableName={t.name} keys={t.keys} />
        </TabsContent>
        <TabsContent value="overview" className="pt-4">
          <OverviewTab
            name={t.name}
            keys={t.keys}
            itemCount={t.item_count}
            sizeBytes={t.size_bytes}
            createdAt={t.created_at}
          />
        </TabsContent>
        <TabsContent value="backups" className="pt-4">
          <BackupsTab tableName={t.name} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button className="text-sm text-muted-foreground hover:text-foreground" onClick={onBack}>
      ← Back to tables
    </button>
  );
}

function OverviewTab({
  name,
  keys,
  itemCount,
  sizeBytes,
  createdAt,
}: {
  name: string;
  keys: KeySchema;
  itemCount: number;
  sizeBytes: number;
  createdAt: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Key schema</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Detail label="Partition key" value={`${keys.partition_key} (${keyTypeLabel(keys.partition_type)})`} />
          {keys.sort_key ? (
            <Detail label="Sort key" value={`${keys.sort_key} (${keyTypeLabel(keys.sort_type)})`} />
          ) : (
            <Detail label="Sort key" value="none" />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Detail label="Name" value={name} />
          <Detail label="Items" value={String(itemCount)} />
          <Detail label="Size" value={formatBytes(sizeBytes)} />
          <Detail label="Created" value={createdAt ? new Date(createdAt).toLocaleString() : '-'} />
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

const SORT_OPS: { value: SortOp; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'between', label: 'between' },
  { value: 'begins_with', label: 'begins with' },
];

function ItemsTab({ tableName, keys }: { tableName: string; keys: KeySchema }) {
  const { toast } = useToast();
  const scan = useScanItems(tableName);
  const runQuery = useQueryItems(tableName);
  const deleteItem = useDeleteItem(tableName);

  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [putOpen, setPutOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);

  // Query controls.
  const [partitionValue, setPartitionValue] = useState('');
  const [sortOp, setSortOp] = useState<SortOp>('eq');
  const [sortValue, setSortValue] = useState('');
  const [sortValue2, setSortValue2] = useState('');

  const coerce = (raw: string, type: 'S' | 'N' | undefined) =>
    type === 'N' ? Number(raw) : raw;

  const handleScan = async () => {
    try {
      const res = await scan.mutateAsync(200);
      setItems(res.items);
      setLoaded(true);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Scan failed', description: msg(error) });
    }
  };

  const handleQuery = async () => {
    if (!partitionValue.trim()) {
      toast({ variant: 'destructive', title: 'Partition value required' });
      return;
    }
    try {
      const input: Parameters<typeof runQuery.mutateAsync>[0] = {
        partition_value: coerce(partitionValue, keys.partition_type),
      };
      if (keys.sort_key && sortValue.trim()) {
        input.sort = {
          op: sortOp,
          value: coerce(sortValue, keys.sort_type),
          ...(sortOp === 'between' ? { value2: coerce(sortValue2, keys.sort_type) } : {}),
        };
      }
      const res = await runQuery.mutateAsync(input);
      setItems(res.items);
      setLoaded(true);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Query failed', description: msg(error) });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteItem.mutateAsync({
        partitionValue: confirmDelete[keys.partition_key],
        sortValue: keys.sort_key ? confirmDelete[keys.sort_key] : undefined,
      });
      setItems((prev) => prev.filter((i) => i !== confirmDelete));
      toast({ title: 'Item deleted' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: msg(error) });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 space-y-1" style={{ minWidth: '12rem' }}>
              <Label className="text-xs">Partition value ({keys.partition_key})</Label>
              <Input
                placeholder={keys.partition_type === 'N' ? '123' : 'value'}
                value={partitionValue}
                onChange={(e) => setPartitionValue(e.target.value)}
              />
            </div>
            {keys.sort_key && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Sort ({keys.sort_key})</Label>
                  <Select value={sortOp} onValueChange={(v) => setSortOp(v as SortOp)}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SORT_OPS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Value</Label>
                  <Input className="w-32" value={sortValue} onChange={(e) => setSortValue(e.target.value)} />
                </div>
                {sortOp === 'between' && (
                  <div className="space-y-1">
                    <Label className="text-xs">and</Label>
                    <Input className="w-32" value={sortValue2} onChange={(e) => setSortValue2(e.target.value)} />
                  </div>
                )}
              </>
            )}
            <Button onClick={handleQuery} disabled={runQuery.isPending}>
              <Search className="mr-2 h-4 w-4" /> Query
            </Button>
            <Button variant="outline" onClick={handleScan} disabled={scan.isPending}>
              Scan all
            </Button>
            <div className="flex-1" />
            <Button onClick={() => setPutOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Put item
            </Button>
          </div>
        </CardContent>
      </Card>

      {!loaded ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Run a query or scan to see items.
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No items matched.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{keys.partition_key}</TableHead>
                  {keys.sort_key && <TableHead>{keys.sort_key}</TableHead>}
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{String(item[keys.partition_key])}</TableCell>
                    {keys.sort_key && <TableCell>{String(item[keys.sort_key])}</TableCell>}
                    <TableCell>
                      <code className="block max-w-[32rem] truncate text-xs text-muted-foreground">
                        {JSON.stringify(item)}
                      </code>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmDelete(item)}
                        aria-label="Delete item"
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

      <PutItemDialog
        tableName={tableName}
        keys={keys}
        open={putOpen}
        onOpenChange={setPutOpen}
        onDone={handleScan}
      />

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the item with key{' '}
              <span className="font-mono text-xs">
                {confirmDelete ? String(confirmDelete[keys.partition_key]) : ''}
                {confirmDelete && keys.sort_key ? ` / ${String(confirmDelete[keys.sort_key])}` : ''}
              </span>
              .
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

function PutItemDialog({
  tableName,
  keys,
  open,
  onOpenChange,
  onDone,
}: {
  tableName: string;
  keys: KeySchema;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const putItem = usePutItem(tableName);

  const template = () => {
    const obj: Record<string, unknown> = {
      [keys.partition_key]: keys.partition_type === 'N' ? 0 : '',
    };
    if (keys.sort_key) obj[keys.sort_key] = keys.sort_type === 'N' ? 0 : '';
    return JSON.stringify(obj, null, 2);
  };

  const [json, setJson] = useState(template());

  const handleSubmit = async () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      toast({ variant: 'destructive', title: 'Invalid JSON', description: 'Fix the item and try again.' });
      return;
    }
    try {
      await putItem.mutateAsync(parsed);
      toast({ title: 'Item saved' });
      setJson(template());
      onOpenChange(false);
      onDone();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not save item', description: msg(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setJson(template()); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Put item</DialogTitle>
          <DialogDescription>
            A JSON object. It must include the key attribute{keys.sort_key ? 's' : ''}{' '}
            <code>{keys.partition_key}</code>
            {keys.sort_key && <> and <code>{keys.sort_key}</code></>}. Putting an item with an
            existing key replaces it.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          className="min-h-[12rem] font-mono text-xs"
          value={json}
          onChange={(e) => setJson(e.target.value)}
          spellCheck={false}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={putItem.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {putItem.isPending ? 'Saving...' : 'Save item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BackupsTab({ tableName }: { tableName: string }) {
  const { toast } = useToast();
  const backups = useBackups(tableName);
  const createBackup = useCreateBackup(tableName);
  const deleteBackup = useDeleteBackup();
  const restoreBackup = useRestoreBackup();

  const [confirmRestore, setConfirmRestore] = useState<Backup | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Backup | null>(null);

  const list = backups.data ?? [];

  const handleBackup = async () => {
    try {
      await createBackup.mutateAsync();
      toast({ title: 'Backup created', description: tableName });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Backup failed', description: msg(error) });
    }
  };

  const handleRestore = async () => {
    if (!confirmRestore) return;
    try {
      await restoreBackup.mutateAsync({ backup_id: confirmRestore.id, confirm: true });
      toast({ title: 'Restore complete', description: `${confirmRestore.item_count} items restored` });
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
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Taken</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.id}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.item_count}</TableCell>
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
              This replaces the current contents of {tableName} with the {confirmRestore?.item_count ?? 0}{' '}
              items in <span className="font-mono text-xs">{confirmRestore?.id}</span>. The current
              data is overwritten.
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
              removed.
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
