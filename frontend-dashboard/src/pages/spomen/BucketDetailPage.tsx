import { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription,
  Button,
  Input,
  Badge,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Progress,
  Checkbox,
} from '@/components/ui';
import {
  ChevronRight,
  FolderOpen,
  File,
  Upload,
  Download,
  Trash2,
  MoreHorizontal,
  Search,
  Home,
  Copy,
  ExternalLink,
  RefreshCw,
  Settings,
  Info,
  HardDrive,
  FileText,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { 
  useBucket, 
  useBucketStats,
  useObjects,
  useDeleteObject,
  useDeleteObjects,
  useDownloadObject,
  useFileUpload,
  useSyncBucket,
} from '@/hooks/useStorage';
import {
  formatBytes,
  getPolicyLabel,
  getPolicyColor,
  getFileIcon,
  getFileName,
  isPreviewable,
  type StorageObject,
} from '@/lib/api/storage';

export default function BucketDetailPage() {
  const { bucketId } = useParams();
  const navigate = useNavigate();
  const id = parseInt(bucketId || '0', 10);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPrefix, setCurrentPrefix] = useState('');
  const [search, setSearch] = useState('');
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [objectToDelete, setObjectToDelete] = useState<string | null>(null);
  const [previewObject, setPreviewObject] = useState<StorageObject | null>(null);

  const { data: bucket, isLoading: bucketLoading } = useBucket(id);
  const { data: stats } = useBucketStats(id);
  const { data: objectsData, isLoading: objectsLoading, refetch } = useObjects(id, {
    prefix: currentPrefix,
    delimiter: '/',
  });

  const deleteMutation = useDeleteObject(id);
  const deleteMultipleMutation = useDeleteObjects(id);
  const downloadMutation = useDownloadObject(id);
  const syncMutation = useSyncBucket();
  const { uploadFile, isUploading } = useFileUpload(id);

  const objects = objectsData?.objects || [];
  const folders = objectsData?.commonPrefixes || [];

  // Filter objects by search
  const filteredObjects = objects.filter((obj) =>
    getFileName(obj.key).toLowerCase().includes(search.toLowerCase())
  );
  const filteredFolders = folders.filter((folder) =>
    folder.toLowerCase().includes(search.toLowerCase())
  );

  // Breadcrumbs
  const breadcrumbs = currentPrefix
    ? currentPrefix.split('/').filter(Boolean).map((part, i, arr) => ({
        name: part,
        path: arr.slice(0, i + 1).join('/') + '/',
      }))
    : [];

  const handleFolderClick = (folder: string) => {
    setCurrentPrefix(folder);
    setSelectedObjects(new Set());
  };

  const handleNavigateUp = () => {
    const parts = currentPrefix.split('/').filter(Boolean);
    parts.pop();
    setCurrentPrefix(parts.length ? parts.join('/') + '/' : '');
    setSelectedObjects(new Set());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      try {
        await uploadFile(file, currentPrefix.replace(/\/$/, ''));
      } catch (error) {
        console.error('Upload failed:', error);
      }
    }

    refetch();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (objectToDelete) {
      try {
        await deleteMutation.mutateAsync(objectToDelete);
        setDeleteDialogOpen(false);
        setObjectToDelete(null);
      } catch (error) {
        console.error('Delete failed:', error);
      }
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedObjects.size === 0) return;
    try {
      await deleteMultipleMutation.mutateAsync(Array.from(selectedObjects));
      setSelectedObjects(new Set());
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleSelectAll = () => {
    if (selectedObjects.size === objects.length) {
      setSelectedObjects(new Set());
    } else {
      setSelectedObjects(new Set(objects.map((o) => o.key)));
    }
  };

  const toggleObjectSelection = (key: string) => {
    const newSet = new Set(selectedObjects);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedObjects(newSet);
  };

  if (bucketLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!bucket) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Bucket not found</p>
        <Link to="/storage">
          <Button variant="link">Back to buckets</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/storage">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              {bucket.name}
              <Badge variant="secondary" className={getPolicyColor(bucket.policy)}>
                {getPolicyLabel(bucket.policy)}
              </Badge>
            </h1>
            <p className="text-muted-foreground">{bucket.description || 'No description'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => syncMutation.mutate(id)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync
          </Button>
          <Button variant="outline" onClick={() => navigate(`/storage/${id}/settings`)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Objects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bucket.objectCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              Total Size
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(bucket.totalSize)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.recentObjects || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              Versioning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {bucket.versioning ? 'Enabled' : 'Disabled'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Object Browser */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Objects</CardTitle>
            <div className="flex items-center gap-2">
              {selectedObjects.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={deleteMultipleMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete ({selectedObjects.size})
                </Button>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                multiple
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </div>
          <CardDescription>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Breadcrumb navigation */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPrefix('')}
                className="h-6 px-2"
              >
                <Home className="h-3 w-3" />
              </Button>
              {breadcrumbs.map((crumb, i) => (
                <div key={crumb.path} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleFolderClick(crumb.path)}
                    className="h-6 px-2"
                  >
                    {crumb.name}
                  </Button>
                </div>
              ))}
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Actions */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search objects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            {currentPrefix && (
              <Button variant="outline" size="sm" onClick={handleNavigateUp}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Up
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Loading */}
          {objectsLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!objectsLoading && filteredFolders.length === 0 && filteredObjects.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No objects in this location</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Files
              </Button>
            </div>
          )}

          {/* Objects Table */}
          {!objectsLoading && (filteredFolders.length > 0 || filteredObjects.length > 0) && (
            <div className="border rounded-lg">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="px-4 py-3 w-10">
                      <Checkbox
                        checked={selectedObjects.size === objects.length && objects.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Size</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Modified</th>
                    <th className="px-4 py-3 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Folders */}
                  {filteredFolders.map((folder) => {
                    const folderName = folder.split('/').filter(Boolean).pop() || folder;
                    return (
                      <tr
                        key={folder}
                        className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                        onClick={() => handleFolderClick(folder)}
                      >
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4 text-yellow-500" />
                            <span className="font-medium">{folderName}/</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">-</td>
                        <td className="px-4 py-3 text-muted-foreground">Folder</td>
                        <td className="px-4 py-3 text-muted-foreground">-</td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    );
                  })}
                  {/* Files */}
                  {filteredObjects.map((obj) => (
                    <tr key={obj.key} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedObjects.has(obj.key)}
                          onCheckedChange={() => toggleObjectSelection(obj.key)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{getFileIcon(obj.contentType)}</span>
                          <span
                            className="font-medium hover:underline cursor-pointer"
                            onClick={() => setPreviewObject(obj)}
                          >
                            {getFileName(obj.key)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatBytes(obj.size)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{obj.contentType}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(obj.lastModified).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => downloadMutation.mutate(obj.key)}>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            {isPreviewable(obj.contentType) && (
                              <DropdownMenuItem onClick={() => setPreviewObject(obj)}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Preview
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => navigator.clipboard.writeText(obj.key)}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy Key
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setObjectToDelete(obj.key);
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Object</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{objectToDelete}"? This action cannot be undone.
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

      {/* Preview Dialog */}
      <Dialog open={!!previewObject} onOpenChange={() => setPreviewObject(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewObject && getFileName(previewObject.key)}</DialogTitle>
            <DialogDescription>
              {previewObject && (
                <>
                  {formatBytes(previewObject.size)} • {previewObject.contentType}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {previewObject && (
              <div className="text-center text-muted-foreground">
                <p>Preview coming soon...</p>
                <Button
                  className="mt-4"
                  onClick={() => downloadMutation.mutate(previewObject.key)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download File
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
