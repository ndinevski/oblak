import { useState } from 'react';
import { 
  Button, 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  Input,
  Badge,
  Skeleton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui';
import { 
  Plus, 
  Boxes, 
  Search, 
  LayoutGrid, 
  List, 
  MoreHorizontal, 
  Trash2, 
  Eye,
  Pencil,
  RefreshCw,
  HardDrive,
  FileText,
  Link as LinkIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useBuckets, useDeleteBucket, useSyncBucket } from '@/hooks/useStorage';
import { formatBytes, getPolicyLabel, type Bucket } from '@/lib/api/storage';

function PermissionBadge({ policy }: { policy: Bucket['policy'] }) {
  const variant = policy === 'private' ? 'secondary' : 'default';

  return (
    <Badge variant={variant} className="capitalize">
      {getPolicyLabel(policy)}
    </Badge>
  );
}

export default function BucketsListPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bucketToDelete, setBucketToDelete] = useState<Bucket | null>(null);

  const { data, isLoading, error } = useBuckets({ page, pageSize: 12 });
  const deleteMutation = useDeleteBucket();
  const syncMutation = useSyncBucket();

  const buckets = data?.data || [];
  const pagination = data?.meta?.pagination;
  const spomenApiBase = import.meta.env.VITE_SPOMEN_API_BASE_URL || 'http://localhost:8083/api/v1';
  const spomenDocsUrl = import.meta.env.VITE_SPOMEN_DOCS_URL || 'https://docs.oblak.local/spomen-api';

  const filteredBuckets = buckets.filter((bucket) =>
    bucket.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!bucketToDelete) return;
    try {
      await deleteMutation.mutateAsync({ id: bucketToDelete.id, force: true });
      setDeleteDialogOpen(false);
      setBucketToDelete(null);
    } catch (error) {
      console.error('Failed to delete bucket:', error);
    }
  };

  const handleSync = async (bucket: Bucket) => {
    try {
      await syncMutation.mutateAsync(bucket.id);
    } catch (error) {
      console.error('Failed to sync bucket:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Spomen Buckets</h1>
          <p className="text-muted-foreground">Manage your object storage</p>
        </div>
        <Link to="/storage/new">
          <Button data-testid="bucket-new-button">
            <Plus className="mr-2 h-4 w-4" />
            New Bucket
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spomen API</CardTitle>
          <CardDescription>
            Direct object storage API endpoint and documentation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Base Endpoint</p>
            <p className="font-mono text-sm break-all">{spomenApiBase}</p>
          </div>
          <Button variant="outline" asChild>
            <a href={spomenDocsUrl} target="_blank" rel="noreferrer">
              <LinkIcon className="mr-2 h-4 w-4" />
              API Docs
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Search and View Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search buckets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="bucket-search-input"
          />
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className={viewMode === 'grid' ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3' : 'space-y-2'}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Failed to load buckets. Please try again.
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredBuckets.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5" />
              {search ? 'No Matching Buckets' : 'Your Buckets'}
            </CardTitle>
            <CardDescription>
              {search 
                ? 'No buckets match your search criteria.'
                : 'Store and manage objects with Spomen'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {search ? (
              <Button variant="outline" onClick={() => setSearch('')}>
                Clear Search
              </Button>
            ) : (
              <Link to="/storage/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Bucket
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Grid View */}
      {!isLoading && !error && filteredBuckets.length > 0 && viewMode === 'grid' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredBuckets.map((bucket) => (
            <Card
              key={bucket.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              data-testid={`bucket-card-${bucket.id}`}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/storage/${bucket.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(`/storage/${bucket.id}`);
                }
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Boxes className="h-4 w-4" />
                      {bucket.name}
                    </CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        data-testid={`bucket-menu-${bucket.id}`}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <DropdownMenuItem onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/storage/${bucket.id}`);
                      }}>
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/storage/${bucket.id}/edit`);
                      }}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(event) => {
                        event.stopPropagation();
                        void handleSync(bucket);
                      }}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Sync
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        data-testid={`bucket-delete-${bucket.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setBucketToDelete(bucket);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <PermissionBadge policy={bucket.policy} />
              </CardHeader>
              <CardContent>
                {bucket.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {bucket.description}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{bucket.objectCount} objects</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <span>{formatBytes(bucket.totalSize)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table View */}
      {!isLoading && !error && filteredBuckets.length > 0 && viewMode === 'table' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Policy</th>
                  <th className="px-4 py-3 font-medium">Objects</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredBuckets.map((bucket) => (
                  <tr key={bucket.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`bucket-row-${bucket.id}`}>
                    <td className="px-4 py-3">
                      <Link 
                        to={`/storage/${bucket.id}`}
                        className="font-medium hover:underline flex items-center gap-2"
                      >
                        <Boxes className="h-4 w-4" />
                        {bucket.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <PermissionBadge policy={bucket.policy} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{bucket.objectCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatBytes(bucket.totalSize)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(bucket.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`bucket-menu-${bucket.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/storage/${bucket.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/storage/${bucket.id}/edit`)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSync(bucket)}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Sync
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            data-testid={`bucket-delete-${bucket.id}`}
                            onClick={() => {
                              setBucketToDelete(bucket);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {pagination && pagination.pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total} buckets
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pagination.pageCount, p + 1))}
              disabled={page === pagination.pageCount}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bucket</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete bucket "{bucketToDelete?.name}"? This will permanently
              delete all objects in the bucket. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="bucket-delete-confirm"
            >
              Delete Bucket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

