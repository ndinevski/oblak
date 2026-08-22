import { useEffect, useRef, useState } from 'react';
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
  Checkbox,
} from '@/components/ui';
import {
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Database,
  Upload,
  Download,
  Trash2,
  MoreHorizontal,
  Search,
  Home,
  Copy,
  ExternalLink,
  RefreshCw,
  Pencil,
  HardDrive,
  FileText,
  ArrowLeft,
  Shield,
  History,
  Key,
  Link as LinkIcon,
} from 'lucide-react';
import { 
  useBucket, 
  useObjects,
  useDeleteObject,
  useDeleteObjects,
  useDeleteFolder,
  useDeleteBucket,
  useDownloadObject,
  useFileUpload,
  usePresignedUrl,
  useUploadObject,
  useSyncBucket,
  useIssueBucketAccessCredentials,
} from '@/hooks/useStorage';
import {
  formatBytes,
  downloadObject as downloadObjectBlob,
  getExtension,
  getPolicyLabel,
  getFileName,
  type StorageObject,
} from '@/lib/api/storage';
import { formatDistanceToNow } from 'date-fns';

function StatCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BucketDetailPage() {
  const navigate = useNavigate();
  const { bucketId } = useParams();
  const id = parseInt(bucketId || '0', 10);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPrefix, setCurrentPrefix] = useState('');
  const [search, setSearch] = useState('');
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [objectToDelete, setObjectToDelete] = useState<string | null>(null);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [deleteBucketDialogOpen, setDeleteBucketDialogOpen] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [previewObject, setPreviewObject] = useState<StorageObject | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewMimeType, setPreviewMimeType] = useState<string>('');
  const [generatedPresignedUrl, setGeneratedPresignedUrl] = useState<{ key: string; url: string; expiresAt: string } | null>(null);
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [issuedCredentials, setIssuedCredentials] = useState<{
    accessKey: string;
    secretKey: string;
    endpoint: string;
    region: string;
    buckets: string[];
  } | null>(null);

  const { data: bucket, isLoading: bucketLoading } = useBucket(id);
  const { data: objectsData, isLoading: objectsLoading, refetch } = useObjects(id, {
    prefix: currentPrefix,
    delimiter: '/',
  });

  const deleteMutation = useDeleteObject(id);
  const deleteMultipleMutation = useDeleteObjects(id);
  const deleteFolderMutation = useDeleteFolder(id);
  const deleteBucketMutation = useDeleteBucket();
  const downloadMutation = useDownloadObject(id);
  const uploadObjectMutation = useUploadObject(id);
  const presignedUrlMutation = usePresignedUrl(id);
  const issueCredentialsMutation = useIssueBucketAccessCredentials(id);
  const syncMutation = useSyncBucket();
  const { uploadFile, isUploading } = useFileUpload(id);

  const objects = objectsData?.objects || [];
  const folders = objectsData?.commonPrefixes || [];
  const bucketTags = Object.entries(bucket?.tags ?? {});

  const markerFolders = objects
    .filter((obj) => obj.key.endsWith('/'))
    .map((obj) => obj.key);
  const allFolders = Array.from(new Set([...folders, ...markerFolders]))
    .filter((folder) => folder !== currentPrefix);
  const fileObjects = objects.filter((obj) => !obj.key.endsWith('/'));

  // Filter objects by search
  const filteredObjects = fileObjects.filter((obj) =>
    getFileName(obj.key).toLowerCase().includes(search.toLowerCase())
  );
  const filteredFolders = allFolders.filter((folder) =>
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
    setSelectedFolders(new Set());
  };

  const handleNavigateUp = () => {
    const parts = currentPrefix.split('/').filter(Boolean);
    parts.pop();
    setCurrentPrefix(parts.length ? parts.join('/') + '/' : '');
    setSelectedObjects(new Set());
    setSelectedFolders(new Set());
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
    if (selectedObjects.size === 0 && selectedFolders.size === 0) return;

    try {
      const operations: Promise<unknown>[] = [];

      if (selectedObjects.size > 0) {
        operations.push(deleteMultipleMutation.mutateAsync(Array.from(selectedObjects)));
      }

      if (selectedFolders.size > 0) {
        for (const folder of selectedFolders) {
          operations.push(deleteFolderMutation.mutateAsync(folder));
        }
      }

      await Promise.all(operations);
      setBatchDeleteDialogOpen(false);
      setSelectedObjects(new Set());
      setSelectedFolders(new Set());
      await refetch();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;

    try {
      await deleteFolderMutation.mutateAsync(folderToDelete);
      setDeleteFolderDialogOpen(false);
      setFolderToDelete(null);
      await refetch();
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const handleDeleteBucket = async () => {
    if (!bucket) return;
    try {
      await deleteBucketMutation.mutateAsync({ id: bucket.id, force: true });
      setDeleteBucketDialogOpen(false);
      navigate('/storage');
    } catch (error) {
      console.error('Failed to delete bucket:', error);
    }
  };

  const handleCreateFolder = async () => {
    const normalizedFolderName = newFolderName
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\/{2,}/g, '/');

    if (!normalizedFolderName) {
      return;
    }

    const prefix = currentPrefix
      .replace(/^\/+/, '')
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$|^\/+$/g, '');
    const folderKey = prefix
      ? `${prefix}/${normalizedFolderName}/`
      : `${normalizedFolderName}/`;

    try {
      await uploadObjectMutation.mutateAsync({
        key: folderKey,
        data: '',
        contentType: 'application/x-directory',
      });
      setCreateFolderDialogOpen(false);
      setNewFolderName('');
      await refetch();
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleSelectAll = () => {
    const allFilesSelected = selectedObjects.size === fileObjects.length;
    const allFoldersSelected = selectedFolders.size === allFolders.length;

    if (allFilesSelected && allFoldersSelected) {
      setSelectedObjects(new Set());
      setSelectedFolders(new Set());
    } else {
      setSelectedObjects(new Set(fileObjects.map((o) => o.key)));
      setSelectedFolders(new Set(allFolders));
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

  const toggleFolderSelection = (key: string) => {
    const newSet = new Set(selectedFolders);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedFolders(newSet);
  };

  const inferContentTypeFromKey = (key: string): string => {
    const extension = getExtension(key);
    const map: Record<string, string> = {
      pdf: 'application/pdf',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    };
    return map[extension] || '';
  };

  const isPreviewTypeSupported = (contentType?: string) => {
    if (!contentType) return false;
    return (
      contentType === 'application/pdf' ||
      contentType.startsWith('image/') ||
      contentType.startsWith('text/plain') ||
      contentType === 'application/json' ||
      contentType === 'text/json' ||
      contentType.endsWith('+json')
    );
  };

  const getDisplayContentType = (obj: StorageObject) => {
    return obj.contentType || inferContentTypeFromKey(obj.key) || 'Unknown';
  };

  const handleGenerateObjectUrl = async (obj: StorageObject) => {
    try {
      const response = await presignedUrlMutation.mutateAsync({
        key: obj.key,
        method: 'GET',
        expiresIn: 3600,
      });

      setGeneratedPresignedUrl({
        key: obj.key,
        url: response.url,
        expiresAt: response.expiresAt,
      });
    } catch (error) {
      console.error('Failed to generate presigned URL:', error);
    }
  };

  const handleIssueCredentials = async () => {
    try {
      const creds = await issueCredentialsMutation.mutateAsync(true);
      setIssuedCredentials(creds);
      setCredentialsDialogOpen(true);
    } catch (error) {
      console.error('Failed to issue credentials:', error);
    }
  };

  useEffect(() => {
    if (!previewObject) {
      setPreviewUrl(null);
      setPreviewText(null);
      setPreviewLoading(false);
      setPreviewError(null);
      setPreviewMimeType('');
      return;
    }

    const fallbackMime = previewObject.contentType || inferContentTypeFromKey(previewObject.key);
    if (!isPreviewTypeSupported(fallbackMime)) {
      setPreviewUrl(null);
      setPreviewText(null);
      setPreviewLoading(false);
      setPreviewError(null);
      setPreviewMimeType(fallbackMime);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewMimeType(fallbackMime);
    setPreviewText(null);

    const applyBlobPreview = async (blob: Blob) => {
      if (cancelled) return;

      const safeBlobType = blob.type && blob.type !== 'application/json' ? blob.type : '';
      const resolvedMimeType = safeBlobType || fallbackMime || 'application/octet-stream';
      setPreviewMimeType(resolvedMimeType);

      if (
        resolvedMimeType.startsWith('text/plain') ||
        resolvedMimeType === 'application/json' ||
        resolvedMimeType === 'text/json' ||
        resolvedMimeType.endsWith('+json')
      ) {
        let text = await blob.text();
        if (
          resolvedMimeType === 'application/json' ||
          resolvedMimeType === 'text/json' ||
          resolvedMimeType.endsWith('+json')
        ) {
          try {
            text = JSON.stringify(JSON.parse(text), null, 2);
          } catch {
            // keep raw text if not valid JSON
          }
        }
        if (cancelled) return;
        setPreviewText(text);
        setPreviewUrl(null);
        return;
      }

      const normalizedBlob = safeBlobType ? blob : new Blob([blob], { type: resolvedMimeType });
      objectUrl = URL.createObjectURL(normalizedBlob);
      setPreviewUrl(objectUrl);
    };

    downloadObjectBlob(id, previewObject.key)
      .then(async (blob) => {
        await applyBlobPreview(blob);
      })
      .catch(async () => {
        try {
          const presigned = await presignedUrlMutation.mutateAsync({
            key: previewObject.key,
            method: 'GET',
            expiresIn: 600,
          });

          const response = await fetch(presigned.url);
          if (!response.ok) {
            throw new Error('Failed to fetch preview from presigned URL');
          }

          const blob = await response.blob();
          await applyBlobPreview(blob);
        } catch {
          if (cancelled) return;
          setPreviewError('Failed to load preview. You can still download the file.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [id, previewObject]);

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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/storage')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Database className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">{bucket.name}</h1>
          </div>
          <p className="text-muted-foreground">{bucket.description || 'No description'}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>Created {formatDistanceToNow(new Date(bucket.createdAt), { addSuffix: true })}</span>
            <span>•</span>
            <span>Updated {formatDistanceToNow(new Date(bucket.updatedAt), { addSuffix: true })}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void handleIssueCredentials()}>
            <Key className="mr-2 h-4 w-4" />
            Generate S3 Credentials
          </Button>
          <Button variant="outline" onClick={() => syncMutation.mutate(id)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync
          </Button>
          <Link to={`/storage/${bucket.id}/edit`}>
            <Button variant="outline" data-testid="bucket-edit-open">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Button
            variant="destructive"
            onClick={() => setDeleteBucketDialogOpen(true)}
            disabled={deleteBucketMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Objects"
          value={bucket.objectCount}
          description="Stored files"
        />
        <StatCard
          icon={HardDrive}
          label="Total Size"
          value={formatBytes(bucket.totalSize)}
          description="Current usage"
        />
        <StatCard
          icon={Shield}
          label="Permissions"
          value={getPolicyLabel(bucket.policy)}
          description="Bucket access policy"
        />
        <StatCard
          icon={History}
          label="Versioning"
          value={bucket.versioning ? 'Enabled' : 'Disabled'}
          description="Object history"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent>
          {bucketTags.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {bucketTags.map(([key, value]) => (
                <Badge key={key} variant="secondary">{key}={value}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tags configured.</p>
          )}
        </CardContent>
      </Card>

      {/* Object Browser */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Objects</CardTitle>
            <div className="flex items-center gap-2">
              {(selectedObjects.size > 0 || selectedFolders.size > 0) && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBatchDeleteDialogOpen(true)}
                  disabled={deleteMultipleMutation.isPending || deleteFolderMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete ({selectedObjects.size + selectedFolders.size})
                </Button>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                multiple
              />
              <Button variant="outline" onClick={() => setCreateFolderDialogOpen(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                New Folder
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </div>
          <CardDescription>
            Browse, upload, and manage objects stored in this bucket.
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {/* Breadcrumb navigation */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPrefix('')}
                className="h-6 px-2"
              >
                <Home className="h-3 w-3" />
              </Button>
              {breadcrumbs.map((crumb) => (
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
                Back
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
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b bg-muted/50">
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="px-4 py-3 w-10">
                      <Checkbox
                        checked={
                          selectedObjects.size === fileObjects.length &&
                          selectedFolders.size === allFolders.length &&
                          (fileObjects.length + allFolders.length) > 0
                        }
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="px-4 py-3 font-medium w-[25%]">Name</th>
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
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selectedFolders.has(folder)}
                            onCheckedChange={() => toggleFolderSelection(folder)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </td>
                        <td className="px-4 py-3 max-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <FolderOpen className="h-4 w-4 text-white" />
                            <span className="font-medium truncate" title={`${folderName}/`}>
                              {folderName}/
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">-</td>
                        <td className="px-4 py-3 text-muted-foreground">Folder</td>
                        <td className="px-4 py-3 text-muted-foreground">-</td>
                        <td className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setFolderToDelete(folder);
                                  setDeleteFolderDialogOpen(true);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Folder
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
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
                      <td className="px-4 py-3 max-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 shrink-0 text-foreground/80" />
                          <span
                            className="font-medium hover:underline cursor-pointer truncate block"
                            onClick={() => setPreviewObject(obj)}
                            title={getFileName(obj.key)}
                          >
                            {getFileName(obj.key)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatBytes(obj.size)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{getDisplayContentType(obj)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(obj.lastModified).toLocaleString()}
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
                            <DropdownMenuItem onClick={() => setPreviewObject(obj)}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void handleGenerateObjectUrl(obj)}>
                              <LinkIcon className="mr-2 h-4 w-4" />
                              Generate GET URL
                            </DropdownMenuItem>
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
            <AlertDialogDescription className="break-words">
              Are you sure you want to delete <span className="break-all">"{objectToDelete}"</span>? This action cannot be undone.
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

      <AlertDialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Items</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              Are you sure you want to delete {selectedObjects.size + selectedFolders.size} selected item(s)
              ({selectedFolders.size} folder(s), {selectedObjects.size} file(s))? This action cannot be undone.
              {selectedFolders.size > 0 && (
                <>
                  <br />
                  Everything inside selected folders will be deleted too.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              Are you sure you want to delete folder <span className="break-all">"{folderToDelete}"</span> and all objects inside it?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteBucketDialogOpen} onOpenChange={setDeleteBucketDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bucket</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              Are you sure you want to delete bucket <span className="break-all">"{bucket.name}"</span>? This will permanently delete all objects in the bucket.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBucket}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="bucket-detail-delete-confirm"
            >
              Delete Bucket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createFolderDialogOpen} onOpenChange={setCreateFolderDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>
              Create a virtual folder in this bucket.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="Folder Name"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Folder will be created as: {(currentPrefix || '/') + newFolderName.replace(/^\/+/, '').replace(/\/+$/, '') + '/'}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateFolderDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreateFolder()}
                disabled={!newFolderName.trim() || uploadObjectMutation.isPending}
              >
                {uploadObjectMutation.isPending ? 'Creating...' : 'Create Folder'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!generatedPresignedUrl} onOpenChange={() => setGeneratedPresignedUrl(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generated Presigned GET URL</DialogTitle>
            <DialogDescription>
              Temporary download URL for {generatedPresignedUrl?.key}. Expires at{' '}
              {generatedPresignedUrl ? new Date(generatedPresignedUrl.expiresAt).toLocaleString() : ''}.
            </DialogDescription>
          </DialogHeader>
          {generatedPresignedUrl && (
            <div className="space-y-3">
              <Input readOnly value={generatedPresignedUrl.url} />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(generatedPresignedUrl.url)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy URL
                </Button>
                <Button asChild>
                  <a href={generatedPresignedUrl.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open URL
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={credentialsDialogOpen} onOpenChange={setCredentialsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>One-Time S3 Credentials</DialogTitle>
            <DialogDescription>
              Save these values now. The secret key is shown only once and cannot be retrieved later.
            </DialogDescription>
          </DialogHeader>
          {issuedCredentials && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Endpoint</p>
                <Input readOnly value={issuedCredentials.endpoint} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Region</p>
                <Input readOnly value={issuedCredentials.region} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Access Key</p>
                <div className="flex gap-2">
                  <Input readOnly value={issuedCredentials.accessKey} />
                  <Button
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(issuedCredentials.accessKey)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Secret Key</p>
                <div className="flex gap-2">
                  <Input readOnly value={issuedCredentials.secretKey} />
                  <Button
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(issuedCredentials.secretKey)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Scoped buckets: {issuedCredentials.buckets.join(', ')}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewObject} onOpenChange={() => setPreviewObject(null)}>
        <DialogContent className="w-[95vw] max-w-3xl">
          <DialogHeader>
            <DialogTitle className="pr-8 break-all">
              {previewObject && getFileName(previewObject.key)}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {previewObject && (
                <>
                  {formatBytes(previewObject.size)} • {previewMimeType || getDisplayContentType(previewObject)} • Created {new Date(previewObject.metadata?.created_at || previewObject.metadata?.createdAt || previewObject.lastModified).toLocaleString()} • Modified {new Date(previewObject.lastModified).toLocaleString()}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div>Preview:</div>
          <div className="pb-4">
            {previewObject && (
              <div className="space-y-4">
                {previewLoading && (
                  <div className="text-center text-muted-foreground py-8">
                    Loading preview...
                  </div>
                )}

                {!previewLoading && previewError && (
                  <div className="text-center text-muted-foreground py-8">
                    {previewError}
                  </div>
                )}

                {!previewLoading && !previewError && isPreviewTypeSupported(previewMimeType) && previewUrl && (
                  previewMimeType === 'application/pdf' ? (
                    <iframe
                      src={`${previewUrl}${previewUrl.includes('#') ? '&' : '#'}navpanes=0&toolbar=1&scrollbar=1`}
                      title={getFileName(previewObject.key)}
                      className="w-full h-[70vh] rounded border"
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt={getFileName(previewObject.key)}
                      className="mx-auto max-h-[70vh] max-w-full object-contain rounded border"
                    />
                  )
                )}

                {!previewLoading && !previewError && (
                  previewMimeType.startsWith('text/plain') ||
                  previewMimeType === 'application/json' ||
                  previewMimeType === 'text/json' ||
                  previewMimeType.endsWith('+json')
                ) && previewText !== null && (
                  <pre className="max-h-[70vh] overflow-auto rounded border bg-muted p-4 text-sm whitespace-pre-wrap break-words">
                    {previewText}
                  </pre>
                )}

                {!previewLoading && !previewError && !isPreviewTypeSupported(previewMimeType || getDisplayContentType(previewObject)) && (
                  <div className="text-center text-muted-foreground py-8">
                    Preview is not available for this file type.
                  </div>
                )}

                <Button
                  className="w-full"
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
