/**
 * Virtual Machines List Page
 * Displays all VMs with grid/table toggle, filters, and actions
 */

import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Grid,
  List,
  Server,
  Play,
  Square,
  RotateCcw,
  Trash2,
  MoreVertical,
  Cpu,
  HardDrive,
  Monitor,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  useVMs, 
  useStartVM, 
  useStopVM, 
  useRebootVM, 
  useDeleteVM 
} from '@/hooks/useVMs';
import {
  getStatusColor,
  getStatusLabel,
  formatMemory,
  formatDisk,
  canStartVM,
  canStopVM,
  isVMActionable,
  type VirtualMachine,
  type VMStatus,
} from '@/lib/api/vms';

type ViewMode = 'grid' | 'table';

export default function VMsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vmToDelete, setVmToDelete] = useState<VirtualMachine | null>(null);

  // URL params
  const page = parseInt(searchParams.get('page') || '1');
  const status = searchParams.get('status') as VMStatus | null;
  const search = searchParams.get('search') || '';

  // Queries
  const { data, isLoading, error, refetch } = useVMs({
    page,
    pageSize: 12,
    status: status || undefined,
    search: search || undefined,
  });

  // Mutations
  const startVMMutation = useStartVM();
  const stopVMMutation = useStopVM();
  const rebootVMMutation = useRebootVM();
  const deleteVMMutation = useDeleteVM();

  const vms = data?.data || [];
  const pagination = data?.meta?.pagination;

  // Handlers
  const handleSearch = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('search', value);
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handleStatusFilter = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      params.set('status', value);
    } else {
      params.delete('status');
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params);
  };

  const handleStartVM = async (vm: VirtualMachine) => {
    try {
      await startVMMutation.mutateAsync(vm.documentId);
      toast({
        title: 'VM Starting',
        description: `${vm.name} is starting...`,
      });
    } catch (err) {
      toast({
        title: 'Failed to start VM',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleStopVM = async (vm: VirtualMachine, force = false) => {
    try {
      await stopVMMutation.mutateAsync({ id: vm.documentId, force });
      toast({
        title: 'VM Stopping',
        description: `${vm.name} is stopping...`,
      });
    } catch (err) {
      toast({
        title: 'Failed to stop VM',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleRebootVM = async (vm: VirtualMachine) => {
    try {
      await rebootVMMutation.mutateAsync(vm.documentId);
      toast({
        title: 'VM Rebooting',
        description: `${vm.name} is rebooting...`,
      });
    } catch (err) {
      toast({
        title: 'Failed to reboot VM',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteVM = async () => {
    if (!vmToDelete) return;

    try {
      await deleteVMMutation.mutateAsync(vmToDelete.documentId);
      toast({
        title: 'VM Deleted',
        description: `${vmToDelete.name} has been deleted.`,
      });
      setDeleteDialogOpen(false);
      setVmToDelete(null);
    } catch (err) {
      toast({
        title: 'Failed to delete VM',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const confirmDelete = (vm: VirtualMachine) => {
    setVmToDelete(vm);
    setDeleteDialogOpen(true);
  };

  // Render status badge
  const StatusBadge = ({ status }: { status: VMStatus }) => (
    <Badge
      variant="secondary"
      className={`${getStatusColor(status)} text-white`}
    >
      {getStatusLabel(status)}
    </Badge>
  );

  // Render VM card for grid view
  const VMCard = ({ vm }: { vm: VirtualMachine }) => (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/izvor/vms/${vm.documentId}`)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{vm.name}</CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canStartVM(vm.status) && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStartVM(vm); }}>
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </DropdownMenuItem>
              )}
              {canStopVM(vm.status) && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStopVM(vm); }}>
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </DropdownMenuItem>
              )}
              {vm.status === 'running' && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRebootVM(vm); }}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reboot
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                disabled={!isVMActionable(vm.status)}
                onClick={(e) => { e.stopPropagation(); confirmDelete(vm); }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <StatusBadge status={vm.status} />
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            <span>{vm.cores} vCPU</span>
          </div>
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            <span>{formatMemory(vm.memoryMB)}</span>
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            <span>{formatDisk(vm.diskGB)}</span>
          </div>
          {vm.ipAddress && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t">
              <span className="font-mono text-xs">{vm.ipAddress}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-5 w-20" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="p-6 text-center">
            <p className="text-destructive">Failed to load virtual machines</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Virtual Machines</h1>
          <p className="text-muted-foreground">
            Manage your virtual machines
          </p>
        </div>
        <Button asChild>
          <Link to="/izvor/vms/new">
            <Plus className="h-4 w-4 mr-2" />
            Create VM
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search VMs..."
            className="pl-9"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <Select value={status || 'all'} onValueChange={handleStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="stopped">Stopped</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="creating">Creating</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1 border rounded-md p-1">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('grid')}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('table')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Empty state */}
      {vms.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Virtual Machines</h3>
            <p className="text-muted-foreground mb-4">
              {search || status
                ? 'No VMs match your filters.'
                : "You haven't created any virtual machines yet."}
            </p>
            {!search && !status && (
              <Button asChild>
                <Link to="/izvor/vms/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first VM
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Grid View */}
      {vms.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {vms.map((vm) => (
            <VMCard key={vm.documentId} vm={vm} />
          ))}
        </div>
      )}

      {/* Table View */}
      {vms.length > 0 && viewMode === 'table' && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Resources</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vms.map((vm) => (
                <TableRow
                  key={vm.documentId}
                  className="cursor-pointer"
                  onClick={() => navigate(`/izvor/vms/${vm.documentId}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{vm.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={vm.status} />
                  </TableCell>
                  <TableCell className="capitalize">{vm.size}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {vm.cores} vCPU / {formatMemory(vm.memoryMB)} / {formatDisk(vm.diskGB)}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">
                      {vm.ipAddress || '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canStartVM(vm.status) && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStartVM(vm); }}>
                            <Play className="h-4 w-4 mr-2" />
                            Start
                          </DropdownMenuItem>
                        )}
                        {canStopVM(vm.status) && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStopVM(vm); }}>
                            <Square className="h-4 w-4 mr-2" />
                            Stop
                          </DropdownMenuItem>
                        )}
                        {vm.status === 'running' && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRebootVM(vm); }}>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Reboot
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          disabled={!isVMActionable(vm.status)}
                          onClick={(e) => { e.stopPropagation(); confirmDelete(vm); }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      {pagination && pagination.pageCount > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
          >
            Previous
          </Button>
          <div className="flex items-center gap-2">
            {Array.from({ length: pagination.pageCount }, (_, i) => i + 1).map((p) => (
              <Button
                key={p}
                variant={p === page ? 'default' : 'outline'}
                size="icon"
                onClick={() => handlePageChange(p)}
              >
                {p}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            disabled={page >= pagination.pageCount}
            onClick={() => handlePageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Virtual Machine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{vmToDelete?.name}</strong>?
              This action cannot be undone and all data will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVM}
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
