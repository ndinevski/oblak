import { useState } from 'react';
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
  MoreHorizontal, 
  Eye, 
  Pencil, 
  Trash2,
  Play,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useFunctions, useDeleteFunction, FunctionData, FunctionFilters } from '@/hooks/useFunctions';
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
  const [page, setPage] = useState(1);
  
  const { data, isLoading, error, refetch } = useFunctions({ 
    page, 
    pageSize: 10,
    ...filters 
  });
  const deleteFunction = useDeleteFunction();

  const handleSearch = (search: string) => {
    setFilters((prev) => ({ ...prev, search }));
    setPage(1);
  };

  const handleDelete = async (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
      try {
        await deleteFunction.mutateAsync(id);
      } catch {
        // Error handling is done via the mutation's error state
      }
    }
  };

  const functions = data?.data || [];
  const pagination = data?.meta?.pagination;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Functions</h1>
          <p className="text-muted-foreground">Manage your serverless functions</p>
        </div>
        <Link to="/functions/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Function
          </Button>
        </Link>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Your Functions
              </CardTitle>
              <CardDescription>
                Deploy and manage serverless functions with Impuls
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search functions..."
                className="pl-10"
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-5 w-5" />
              <span>Failed to load functions. Please try again.</span>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-8 w-8" />
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && functions.length === 0 && (
            <div className="text-center py-12">
              <Zap className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No functions yet</h3>
              <p className="mt-2 text-muted-foreground">
                Create your first function to get started with serverless computing.
              </p>
              <Link to="/functions/new">
                <Button className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Function
                </Button>
              </Link>
            </div>
          )}

          {/* Functions Table */}
          {!isLoading && !error && functions.length > 0 && (
            <>
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
                    <TableRow key={fn.id}>
                      <TableCell>
                        <Link 
                          to={`/functions/${fn.id}`}
                          className="font-medium hover:underline"
                        >
                          {fn.name}
                        </Link>
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
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/functions/${fn.id}`)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/functions/${fn.id}/test`)}>
                              <Play className="mr-2 h-4 w-4" />
                              Test
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/functions/${fn.id}/edit`)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDelete(fn.id, fn.name)}
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

              {/* Pagination */}
              {pagination && pagination.pageCount > 1 && (
                <div className="flex items-center justify-between pt-4">
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
