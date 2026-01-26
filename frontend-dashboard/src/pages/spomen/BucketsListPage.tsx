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
  Database, 
  Search, 
  LayoutGrid, 
  List, 
  MoreHorizontal, 
  Trash2, 
  Settings, 
  ExternalLink,
  RefreshCw,
  Lock,
  Globe,
  HardDrive,
  FileText,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useBuckets, useDeleteBucket, useSyncBucket } from '@/hooks/useStorage';
import { formatBytes, getPolicyLabel, getPolicyColor, type Bucket } from '@/lib/api/storage';

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

  const getPolicyIcon = (policy: string) => {
    if (policy === 'private') return <Lock className="h-3 w-3" />;
    return <Globe className="h-3 w-3" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Storage Buckets</h1>
          <p className="text-muted-foreground">Manage your object storage</p>
        </div>
        <Link to="/storage/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Bucket
          </Button>
        </Link>
      </div>

      {/* Search and View Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search buckets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
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
              <Database className="h-5 w-5" />
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
            <Card key={bucket.id} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Link to={`/storage/${bucket.id}`} className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      {bucket.name}
                    </CardTitle>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/storage/${bucket.id}`)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View Objects
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/storage/${bucket.id}/settings`)}>
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSync(bucket)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Sync
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
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
                </div>
                <Badge variant="secondary" className={getPolicyColor(bucket.policy)}>
                  {getPolicyIcon(bucket.policy)}
                  <span className="ml-1">{getPolicyLabel(bucket.policy)}</span>
                </Badge>
              </CardHeader>
              <CardContent>
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
                {bucket.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {bucket.description}
                  </p>
                )}
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
                  <tr key={bucket.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link 
                        to={`/storage/${bucket.id}`}
                        className="font-medium hover:underline flex items-center gap-2"
                      >
                        <Database className="h-4 w-4" />
                        {bucket.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={getPolicyColor(bucket.policy)}>
                        {getPolicyIcon(bucket.policy)}
                        <span className="ml-1">{getPolicyLabel(bucket.policy)}</span>
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{bucket.objectCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatBytes(bucket.totalSize)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(bucket.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/storage/${bucket.id}`)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View Objects
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/storage/${bucket.id}/settings`)}>
                            <Settings className="mr-2 h-4 w-4" />
                            Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSync(bucket)}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Sync
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
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
            >
              Delete Bucket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

