import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Button, 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  Badge,
  Input,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { 
  Plus, 
  Zap, 
  Search, 
  LayoutGrid,
  List,
  Server,
  MoreHorizontal, 
  Eye, 
  Pencil, 
  Trash2,
  Play,
  RefreshCw,
  AlertCircle,
  Power,
} from 'lucide-react';
import { useFunctions, useDeleteFunction, useSetFunctionStatus, FunctionData, FunctionFilters } from '@/hooks/useFunctions';
import { Spinner } from '@/components/ui/spinner';
import { formatDistanceToNow } from 'date-fns';

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: FunctionData['status'] }) {
  const variants: Record<FunctionData['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    inactive: 'secondary',
    deploying: 'outline',
    error: 'destructive',
  };

  return (
    <Badge variant={variants[status]} className="capitalize">
      {status}
    </Badge>
  );
}

/**
 * Runtime badge component
 */
function RuntimeBadge({ runtime }: { runtime: string }) {
  const runtimeLabels: Record<string, string> = {
    nodejs20: 'Node.js 20',
    nodejs18: 'Node.js 18',
    python312: 'Python 3.12',
    python311: 'Python 3.11',
    python310: 'Python 3.10',
    dotnet8: '.NET 8',
    dotnet7: '.NET 7',
  };

  return (
    <Badge variant="outline" className="font-mono text-xs">
      {runtimeLabels[runtime] || runtime}
    </Badge>
  );
}

/**
 * Functions list page component
 */
export default function FunctionsListPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FunctionFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [page, setPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [functionToDelete, setFunctionToDelete] = useState<FunctionData | null>(null);
  
  const { data, isLoading, error, refetch } = useFunctions({ 
    page, 
    pageSize: 10,
    ...filters 
  });
  const deleteFunction = useDeleteFunction();
  const setFunctionStatus = useSetFunctionStatus();
  const functions = data?.data || [];
  const pagination = data?.meta?.pagination;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput || undefined }));
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    if (!pagination) {
      return;
    }

    if (pagination.pageCount > 0 && page > pagination.pageCount) {
      setPage(pagination.pageCount);
    }
  }, [pagination, page]);

  const handleStatusFilter = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      status: value === 'all' ? undefined : (value as FunctionData['status']),
    }));
    setPage(1);
  };

  const handleRuntimeFilter = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      runtime: value === 'all' ? undefined : (value as FunctionData['runtime']),
    }));
    setPage(1);
  };

  const requestDelete = (fn: FunctionData) => {
    setFunctionToDelete(fn);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!functionToDelete) return;

    try {
      await deleteFunction.mutateAsync(functionToDelete.id);
      setDeleteDialogOpen(false);
      setFunctionToDelete(null);
    } catch {
      // Error handling is done via the mutation's error state
    }
  };

  const handleToggleStatus = async (fn: FunctionData) => {
    const nextStatus = fn.status === 'active' ? 'inactive' : 'active';
    await setFunctionStatus.mutateAsync({ id: fn.id, status: nextStatus });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Impuls Functions</h1>
          <p className="text-muted-foreground">Manage your serverless functions</p>
        </div>
        <Link to="/functions/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Function
          </Button>
        </Link>
      </div>

      {/* Search and View Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search functions..."
            className="pl-10"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Select value={filters.runtime || 'all'} onValueChange={handleRuntimeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Runtime" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Runtimes</SelectItem>
              <SelectItem value="nodejs20">Node.js 20</SelectItem>
              <SelectItem value="nodejs18">Node.js 18</SelectItem>
              <SelectItem value="python312">Python 3.12</SelectItem>
              <SelectItem value="python311">Python 3.11</SelectItem>
              <SelectItem value="python310">Python 3.10</SelectItem>
              <SelectItem value="dotnet8">.NET 8</SelectItem>
              <SelectItem value="dotnet7">.NET 7</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.status || 'all'} onValueChange={handleStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="deploying">Deploying</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'table' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode('table')}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Unable to fetch functions right now. Showing page fallback.</span>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && functions.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {searchInput ? 'No Matching Functions' : 'Your Functions'}
            </CardTitle>
            <CardDescription>
              {searchInput
                ? 'No functions match your search criteria.'
                : 'Deploy and manage serverless functions with Impuls'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {searchInput ? (
              <Button variant="outline" onClick={() => setSearchInput('')}>
                Clear Search
              </Button>
            ) : (
              <Link to="/functions/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Function
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Grid View */}
      {!isLoading && functions.length > 0 && viewMode === 'grid' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {functions.map((fn) => (
            <Card
              key={fn.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/functions/${fn.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    {fn.name}
                  </CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/functions/${fn.id}`); }}>
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void handleToggleStatus(fn); }}>
                        <Power className="mr-2 h-4 w-4" />
                        {fn.status === 'active' ? 'Deactivate' : 'Activate'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/functions/${fn.id}/edit`); }}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); requestDelete(fn); }}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-2">
                  <RuntimeBadge runtime={fn.runtime} />
                  <StatusBadge status={fn.status} />
                </div>
              </CardHeader>
              <CardContent>
                {fn.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{fn.description}</p>
                )}
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  <span>{Number(fn.invocationCount).toLocaleString()} invocations</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table View */}
      {!isLoading && functions.length > 0 && viewMode === 'table' && (
        <Card>
          <CardContent className="p-0">
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Runtime</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Invocations</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {functions.map((fn) => (
                    <TableRow
                      key={fn.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/functions/${fn.id}`)}
                    >
                      <TableCell>
                        <span className="font-medium hover:underline">{fn.name}</span>
                        {fn.description && (
                          <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                            {fn.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <RuntimeBadge runtime={fn.runtime} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={fn.status} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(fn.invocationCount).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(fn.updatedAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/functions/${fn.id}`); }}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void handleToggleStatus(fn); }}>
                              <Power className="mr-2 h-4 w-4" />
                              {fn.status === 'active' ? 'Deactivate' : 'Activate'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/functions/${fn.id}`); }}>
                              <Play className="mr-2 h-4 w-4" />
                              Test
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/functions/${fn.id}/edit`); }}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={(e) => { e.stopPropagation(); requestDelete(fn); }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {pagination && pagination.pageCount > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total} functions
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Function</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{functionToDelete?.name}</strong>? This action cannot be undone.
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
