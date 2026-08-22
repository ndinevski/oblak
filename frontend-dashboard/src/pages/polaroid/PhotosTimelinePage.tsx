import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Upload, Camera, Heart, Archive, Trash2, Download, Image as ImageIcon, Video, Folder, MapPin, Users, Search, Share2, Settings, Info, X, RotateCcw, Check
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Button, Card, CardContent,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Skeleton, Alert, AlertTitle, AlertDescription, Spinner
} from "@/components/ui";

import {
  useAssetStatistics, useTimeBuckets, useTimeBucket, useUploadAsset, useDeleteAssets, useDownloadAsset, useUpdateAsset, useAsset, useRestoreAssets
} from "@/hooks/usePolaroid";
import {
  PolaroidAsset, PolaroidTimeBucket, formatBytes, formatDuration
} from "@/lib/api/polaroid";
import { AssetImage } from "@/components/polaroid/AuthenticatedImage";

function VideoPreview({ assetId }: { assetId: string }) {
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;

    import('@/lib/api/polaroid').then(({ downloadAsset }) => {
      downloadAsset(assetId).then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setLoading(false);
      }).catch(() => {
        if (!cancelled) setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);

  if (loading && !url) return <div className="flex items-center justify-center h-full"><Spinner className="w-8 h-8" /></div>;
  if (!url) return null;
  return <video src={url} controls className="max-h-full max-w-full object-contain" />;
}

interface SelectionProps {
  selectedIds: Set<string>;
  selectionMode: boolean;
  onToggleSelection: (id: string) => void;
}

function TimeBucketSection({ timeBucket, selectedIds, selectionMode, onToggleSelection }: { timeBucket: PolaroidTimeBucket } & SelectionProps) {
  const { data: bucketData, isLoading, isError } = useTimeBucket({ timeBucket: timeBucket.timeBucket, size: 'MONTH', visibility: 'timeline' });
  const [selectedAsset, setSelectedAsset] = useState<PolaroidAsset | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const deleteMutation = useDeleteAssets();
  const downloadMutation = useDownloadAsset();
  const updateMutation = useUpdateAsset();

  const { data: fullAsset } = useAsset(selectedAsset?.id || '', { enabled: !!selectedAsset });
  const assetWithExif = fullAsset || selectedAsset;

  if (isLoading) {
    return (
      <div className="space-y-4 mb-8">
      <h3 className="font-semibold text-lg">{format(new Date(timeBucket.timeBucket), "MMMM yyyy")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {Array.from({ length: Math.min(timeBucket.count, 6) }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !bucketData) {
    return null;
  }

  const handleDelete = () => {
    if (selectedAsset) {
      deleteMutation.mutate({ ids: [selectedAsset.id] }, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setSelectedAsset(null);
          setShowMetadata(false);
        }
      });
    }
  };

  const handleDownload = () => {
    if (selectedAsset) {
      downloadMutation.mutate({ assetId: selectedAsset.id, fileName: selectedAsset.originalFileName || selectedAsset.id });
    }
  };

  const handleFavorite = () => {
    if (selectedAsset) {
      const newVal = !selectedAsset.isFavorite;
      updateMutation.mutate({ assetId: selectedAsset.id, data: { isFavorite: newVal } }, {
        onSuccess: () => {
          setSelectedAsset({ ...selectedAsset, isFavorite: newVal });
        }
      });
    }
  };

  const handleArchive = () => {
    if (selectedAsset) {
      const newVisibility = selectedAsset.visibility === 'archive' ? 'timeline' : 'archive';
      updateMutation.mutate({ assetId: selectedAsset.id, data: { visibility: newVisibility } }, {
        onSuccess: () => {
          setSelectedAsset({ ...selectedAsset, visibility: newVisibility, isArchived: newVisibility === 'archive' });
        }
      });
    }
  };

  return (
    <div className="space-y-4 mb-8">
      <h3 className="font-semibold text-lg">{format(new Date(timeBucket.timeBucket), "MMMM yyyy")}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {bucketData.map((asset) => (
          <div
            key={asset.id}
            className="relative aspect-square cursor-pointer group rounded-md overflow-hidden bg-muted"
            onClick={() => selectionMode ? onToggleSelection(asset.id) : setSelectedAsset(asset)}
          >
            <AssetImage
              assetId={asset.id}
              size="thumbnail"
              alt={asset.originalFileName}
              loading="lazy"
              className="object-cover w-full h-full transition-transform group-hover:scale-105"
            />
            <div
              className={cn(
                "absolute top-2 left-2 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-opacity cursor-pointer",
                selectionMode || selectedIds.has(asset.id)
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
                selectedIds.has(asset.id)
                  ? "bg-blue-500 border-blue-500 text-white"
                  : "bg-black/30 border-white/70"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection(asset.id);
              }}
            >
              {selectedIds.has(asset.id) && <Check className="w-3 h-3" />}
            </div>
            {selectedIds.has(asset.id) && (
              <div className="absolute inset-0 bg-blue-500/20 pointer-events-none" />
            )}
            {asset.type === "VIDEO" && (
              <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-1 text-white text-xs">
                <Video className="w-3 h-3" />
                <span>{asset.duration ? formatDuration(asset.duration) : ""}</span>
              </div>
            )}
            {asset.isFavorite && (
              <div className="absolute bottom-2 right-2">
                <Heart className="w-4 h-4 text-red-500 fill-red-500" />
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!selectedAsset} onOpenChange={(open) => !open && setSelectedAsset(null)}>
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-black/95 border-none text-white [&>[data-slot=dialog-close]]:hidden">
          {selectedAsset && (
            <div className="flex flex-col h-[80vh]">
              <div className="p-4 flex justify-between items-center bg-black/50 absolute top-0 w-full z-10">
                <div className="text-sm text-gray-300">
                  {format(new Date(selectedAsset.fileCreatedAt), "PPP p")}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleDownload} disabled={downloadMutation.isPending}>
                    {downloadMutation.isPending ? <Spinner className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleFavorite} disabled={updateMutation.isPending}>
                    <Heart className={cn("w-4 h-4", selectedAsset.isFavorite && "fill-red-500 text-red-500")} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleArchive} disabled={updateMutation.isPending}>
                    <Archive className={cn("w-4 h-4", selectedAsset.visibility === 'archive' && "fill-blue-400 text-blue-400")} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setShowMetadata(!showMetadata)}>
                    <Info className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-red-500/20 hover:text-red-500" onClick={() => setDeleteDialogOpen(true)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setSelectedAsset(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 flex relative bg-black overflow-hidden">
                <div className="flex-1 flex items-center justify-center">
                  {selectedAsset.type === "VIDEO" ? (
                    <VideoPreview assetId={selectedAsset.id} />
                  ) : (
                    <AssetImage
                      assetId={selectedAsset.id}
                      size="preview"
                      alt={selectedAsset.originalFileName}
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>
                {showMetadata && assetWithExif && (
                  <div className="w-72 bg-black/80 border-l border-white/10 overflow-y-auto p-4 pt-14 text-sm space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-white">Details</h3>
                      <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-6 w-6" onClick={() => setShowMetadata(false)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="space-y-3 text-gray-300">
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wider">Filename</p>
                        <p className="break-all">{assetWithExif.originalFileName || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wider">Date</p>
                        <p>{assetWithExif.exifInfo?.dateTimeOriginal ? format(new Date(assetWithExif.exifInfo.dateTimeOriginal), "PPP p") : format(new Date(assetWithExif.fileCreatedAt), "PPP p")}</p>
                      </div>
                      {assetWithExif.exifInfo?.fileSizeInByte && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">File Size</p>
                          <p>{formatBytes(assetWithExif.exifInfo.fileSizeInByte)}</p>
                        </div>
                      )}
                      {(assetWithExif.exifInfo?.exifImageWidth || assetWithExif.exifInfo?.exifImageHeight) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Dimensions</p>
                          <p>{assetWithExif.exifInfo.exifImageWidth} × {assetWithExif.exifInfo.exifImageHeight}</p>
                        </div>
                      )}
                      {(assetWithExif.exifInfo?.make || assetWithExif.exifInfo?.model) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Camera</p>
                          <p>{[assetWithExif.exifInfo.make, assetWithExif.exifInfo.model].filter(Boolean).join(' ')}</p>
                        </div>
                      )}
                      {assetWithExif.exifInfo?.lensModel && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Lens</p>
                          <p>{assetWithExif.exifInfo.lensModel}</p>
                        </div>
                      )}
                      {(assetWithExif.exifInfo?.fNumber || assetWithExif.exifInfo?.exposureTime || assetWithExif.exifInfo?.iso) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Settings</p>
                          <p>{[
                            assetWithExif.exifInfo.fNumber ? `ƒ/${assetWithExif.exifInfo.fNumber}` : null,
                            assetWithExif.exifInfo.exposureTime ? `${assetWithExif.exifInfo.exposureTime}s` : null,
                            assetWithExif.exifInfo.iso ? `ISO ${assetWithExif.exifInfo.iso}` : null,
                            assetWithExif.exifInfo.focalLength ? `${assetWithExif.exifInfo.focalLength}mm` : null,
                          ].filter(Boolean).join(' · ')}</p>
                        </div>
                      )}
                      {(assetWithExif.exifInfo?.city || assetWithExif.exifInfo?.state || assetWithExif.exifInfo?.country) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Location</p>
                          <p>{[assetWithExif.exifInfo.city, assetWithExif.exifInfo.state, assetWithExif.exifInfo.country].filter(Boolean).join(', ')}</p>
                        </div>
                      )}
                      {(assetWithExif.exifInfo?.latitude && assetWithExif.exifInfo?.longitude) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">GPS</p>
                          <p>{assetWithExif.exifInfo.latitude.toFixed(6)}, {assetWithExif.exifInfo.longitude.toFixed(6)}</p>
                        </div>
                      )}
                      {assetWithExif.exifInfo?.description && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Description</p>
                          <p>{assetWithExif.exifInfo.description}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {selectedAsset?.type.toLowerCase() || 'asset'}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilteredBucketSection({ timeBucket, filter, mode, selectedIds, selectionMode, onToggleSelection }: { timeBucket: PolaroidTimeBucket; filter: Record<string, unknown>; mode: 'favorites' | 'archive' | 'trash' } & SelectionProps) {
  const { data: bucketData, isLoading } = useTimeBucket({ timeBucket: timeBucket.timeBucket, size: 'MONTH', ...filter });
  const [selectedAsset, setSelectedAsset] = useState<PolaroidAsset | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const deleteMutation = useDeleteAssets();
  const downloadMutation = useDownloadAsset();
  const updateMutation = useUpdateAsset();
  const restoreMutation = useRestoreAssets();

  const { data: fullAsset } = useAsset(selectedAsset?.id || '', { enabled: !!selectedAsset });
  const assetWithExif = fullAsset || selectedAsset;

  if (isLoading) {
    return (
      <div className="space-y-4 mb-8">
        <h3 className="font-semibold text-lg">{format(new Date(timeBucket.timeBucket), "MMMM yyyy")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {Array.from({ length: Math.min(timeBucket.count, 6) }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (!bucketData || bucketData.length === 0) return null;

  const handleDelete = () => {
    if (selectedAsset) {
      deleteMutation.mutate({ ids: [selectedAsset.id], force: mode === 'trash' }, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setSelectedAsset(null);
          setShowMetadata(false);
        }
      });
    }
  };

  const handleDownload = () => {
    if (selectedAsset) {
      downloadMutation.mutate({ assetId: selectedAsset.id, fileName: selectedAsset.originalFileName || selectedAsset.id });
    }
  };

  const handleFavorite = () => {
    if (selectedAsset) {
      const newVal = !selectedAsset.isFavorite;
      updateMutation.mutate({ assetId: selectedAsset.id, data: { isFavorite: newVal } }, {
        onSuccess: () => setSelectedAsset({ ...selectedAsset, isFavorite: newVal })
      });
    }
  };

  const handleArchive = () => {
    if (selectedAsset) {
      const newVisibility = selectedAsset.visibility === 'archive' ? 'timeline' : 'archive';
      updateMutation.mutate({ assetId: selectedAsset.id, data: { visibility: newVisibility } }, {
        onSuccess: () => {
          setSelectedAsset({ ...selectedAsset, visibility: newVisibility, isArchived: newVisibility === 'archive' });
        }
      });
    }
  };

  const handleRestore = () => {
    if (selectedAsset) {
      restoreMutation.mutate([selectedAsset.id], {
        onSuccess: () => {
          setSelectedAsset(null);
          setShowMetadata(false);
        }
      });
    }
  };

  const deleteDescription = mode === 'trash'
    ? `Are you sure you want to permanently delete this ${selectedAsset?.type.toLowerCase() || 'asset'}? This cannot be undone.`
    : `Are you sure you want to delete this ${selectedAsset?.type.toLowerCase() || 'asset'}? It will be moved to trash for 30 days.`;

  return (
    <div className="space-y-4 mb-8">
      <h3 className="font-semibold text-lg">{format(new Date(timeBucket.timeBucket), "MMMM yyyy")}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {bucketData.map((asset) => (
          <div
            key={asset.id}
            className="relative aspect-square cursor-pointer group rounded-md overflow-hidden bg-muted"
            onClick={() => selectionMode ? onToggleSelection(asset.id) : setSelectedAsset(asset)}
          >
            <AssetImage assetId={asset.id} size="thumbnail" alt={asset.originalFileName} loading="lazy" className="object-cover w-full h-full transition-transform group-hover:scale-105" />
            <div
              className={cn(
                "absolute top-2 left-2 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-opacity cursor-pointer",
                selectionMode || selectedIds.has(asset.id)
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
                selectedIds.has(asset.id)
                  ? "bg-blue-500 border-blue-500 text-white"
                  : "bg-black/30 border-white/70"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection(asset.id);
              }}
            >
              {selectedIds.has(asset.id) && <Check className="w-3 h-3" />}
            </div>
            {selectedIds.has(asset.id) && (
              <div className="absolute inset-0 bg-blue-500/20 pointer-events-none" />
            )}
            {asset.type === "VIDEO" && (
              <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-1 text-white text-xs">
                <Video className="w-3 h-3" />
                <span>{asset.duration ? formatDuration(asset.duration) : ""}</span>
              </div>
            )}
            {asset.isFavorite && (
              <div className="absolute bottom-2 right-2">
                <Heart className="w-4 h-4 text-red-500 fill-red-500" />
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!selectedAsset} onOpenChange={(open) => { if (!open) { setSelectedAsset(null); setShowMetadata(false); } }}>
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-black/95 border-none text-white [&>[data-slot=dialog-close]]:hidden">
          {selectedAsset && (
            <div className="flex flex-col h-[80vh]">
              <div className="p-4 flex justify-between items-center bg-black/50 absolute top-0 w-full z-10">
                <div className="text-sm text-gray-300">
                  {format(new Date(selectedAsset.fileCreatedAt), "PPP p")}
                </div>
                <div className="flex gap-2">
                  {mode === 'trash' ? (
                    <>
                      <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setShowMetadata(!showMetadata)}>
                        <Info className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-white hover:bg-green-500/20 hover:text-green-400" onClick={handleRestore} disabled={restoreMutation.isPending}>
                        {restoreMutation.isPending ? <Spinner className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="text-white hover:bg-red-500/20 hover:text-red-500" onClick={() => setDeleteDialogOpen(true)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleDownload} disabled={downloadMutation.isPending}>
                        {downloadMutation.isPending ? <Spinner className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                      </Button>
                      {mode === 'favorites' && (
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleFavorite} disabled={updateMutation.isPending}>
                          <Heart className={cn("w-4 h-4", selectedAsset.isFavorite && "fill-red-500 text-red-500")} />
                        </Button>
                      )}
                      {mode === 'archive' && (
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleArchive} disabled={updateMutation.isPending}>
                          <Archive className={cn("w-4 h-4", selectedAsset.visibility === 'archive' && "fill-blue-400 text-blue-400")} />
                        </Button>
                      )}
                      {mode === 'favorites' && (
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleArchive} disabled={updateMutation.isPending}>
                          <Archive className={cn("w-4 h-4", selectedAsset.visibility === 'archive' && "fill-blue-400 text-blue-400")} />
                        </Button>
                      )}
                      {mode === 'archive' && (
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleFavorite} disabled={updateMutation.isPending}>
                          <Heart className={cn("w-4 h-4", selectedAsset.isFavorite && "fill-red-500 text-red-500")} />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setShowMetadata(!showMetadata)}>
                        <Info className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-white hover:bg-red-500/20 hover:text-red-500" onClick={() => setDeleteDialogOpen(true)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => { setSelectedAsset(null); setShowMetadata(false); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 flex relative bg-black overflow-hidden">
                <div className="flex-1 flex items-center justify-center">
                  {selectedAsset.type === "VIDEO" ? (
                    <VideoPreview assetId={selectedAsset.id} />
                  ) : (
                    <AssetImage
                      assetId={selectedAsset.id}
                      size="preview"
                      alt={selectedAsset.originalFileName}
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>
                {showMetadata && assetWithExif && (
                  <div className="w-72 bg-black/80 border-l border-white/10 overflow-y-auto p-4 pt-14 text-sm space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-white">Details</h3>
                      <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-6 w-6" onClick={() => setShowMetadata(false)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="space-y-3 text-gray-300">
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wider">Filename</p>
                        <p className="break-all">{assetWithExif.originalFileName || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wider">Date</p>
                        <p>{assetWithExif.exifInfo?.dateTimeOriginal ? format(new Date(assetWithExif.exifInfo.dateTimeOriginal), "PPP p") : format(new Date(assetWithExif.fileCreatedAt), "PPP p")}</p>
                      </div>
                      {assetWithExif.exifInfo?.fileSizeInByte && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">File Size</p>
                          <p>{formatBytes(assetWithExif.exifInfo.fileSizeInByte)}</p>
                        </div>
                      )}
                      {(assetWithExif.exifInfo?.exifImageWidth || assetWithExif.exifInfo?.exifImageHeight) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Dimensions</p>
                          <p>{assetWithExif.exifInfo.exifImageWidth} × {assetWithExif.exifInfo.exifImageHeight}</p>
                        </div>
                      )}
                      {(assetWithExif.exifInfo?.make || assetWithExif.exifInfo?.model) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Camera</p>
                          <p>{[assetWithExif.exifInfo.make, assetWithExif.exifInfo.model].filter(Boolean).join(' ')}</p>
                        </div>
                      )}
                      {assetWithExif.exifInfo?.lensModel && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Lens</p>
                          <p>{assetWithExif.exifInfo.lensModel}</p>
                        </div>
                      )}
                      {(assetWithExif.exifInfo?.fNumber || assetWithExif.exifInfo?.exposureTime || assetWithExif.exifInfo?.iso) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Settings</p>
                          <p>{[
                            assetWithExif.exifInfo.fNumber ? `\u0192/${assetWithExif.exifInfo.fNumber}` : null,
                            assetWithExif.exifInfo.exposureTime ? `${assetWithExif.exifInfo.exposureTime}s` : null,
                            assetWithExif.exifInfo.iso ? `ISO ${assetWithExif.exifInfo.iso}` : null,
                            assetWithExif.exifInfo.focalLength ? `${assetWithExif.exifInfo.focalLength}mm` : null,
                          ].filter(Boolean).join(' \u00b7 ')}</p>
                        </div>
                      )}
                      {(assetWithExif.exifInfo?.city || assetWithExif.exifInfo?.state || assetWithExif.exifInfo?.country) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Location</p>
                          <p>{[assetWithExif.exifInfo.city, assetWithExif.exifInfo.state, assetWithExif.exifInfo.country].filter(Boolean).join(', ')}</p>
                        </div>
                      )}
                      {(assetWithExif.exifInfo?.latitude && assetWithExif.exifInfo?.longitude) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">GPS</p>
                          <p>{assetWithExif.exifInfo.latitude.toFixed(6)}, {assetWithExif.exifInfo.longitude.toFixed(6)}</p>
                        </div>
                      )}
                      {assetWithExif.exifInfo?.description && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Description</p>
                          <p>{assetWithExif.exifInfo.description}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{mode === 'trash' ? 'Permanently Delete?' : 'Delete Asset?'}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
              {mode === 'trash' ? 'Permanently Delete' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilteredTimeline({ filter, mode, selectedIds, selectionMode, onToggleSelection }: { filter: { isFavorite?: boolean; isArchived?: boolean; visibility?: 'timeline' | 'archive' | 'hidden'; isTrashed?: boolean; withStacked?: boolean }; mode: 'favorites' | 'archive' | 'trash' } & SelectionProps) {
  const { data: timeBuckets, isLoading, isError } = useTimeBuckets({ size: 'MONTH', ...filter });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="aspect-square w-full rounded-md" />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load. Please try again.</AlertDescription>
      </Alert>
    );
  }

  if (!timeBuckets || timeBuckets.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
          <p className="text-muted-foreground">No items found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {timeBuckets.map((bucket) => (
        <FilteredBucketSection
          key={bucket.timeBucket}
          timeBucket={bucket}
          filter={filter}
          mode={mode}
          selectedIds={selectedIds}
          selectionMode={selectionMode}
          onToggleSelection={onToggleSelection}
        />
      ))}
    </div>
  );
}

export default function PhotosTimelinePage() {
  const { data: stats, isLoading: statsLoading } = useAssetStatistics();
  const { data: timeBuckets, isLoading: bucketsLoading, isError: bucketsError } = useTimeBuckets({ size: 'MONTH', visibility: 'timeline' });
  
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadAsset();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedIds.size > 0;

  const [activeTab, setActiveTab] = useState("timeline");

  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const deleteMutation = useDeleteAssets();
  const restoreMutation = useRestoreAssets();
  const updateMutation = useUpdateAsset();

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkFavorite = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await updateMutation.mutateAsync({ assetId: id, data: { isFavorite: true } });
    }
    clearSelection();
  };

  const handleBulkUnfavorite = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await updateMutation.mutateAsync({ assetId: id, data: { isFavorite: false } });
    }
    clearSelection();
  };

  const handleBulkArchive = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await updateMutation.mutateAsync({ assetId: id, data: { visibility: 'archive' } });
    }
    clearSelection();
  };

  const handleBulkUnarchive = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await updateMutation.mutateAsync({ assetId: id, data: { visibility: 'timeline' } });
    }
    clearSelection();
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    deleteMutation.mutate({ ids, force: activeTab === 'trash' }, {
      onSuccess: () => {
        setBulkDeleteDialogOpen(false);
        clearSelection();
      }
    });
  };

  const handleBulkRestore = () => {
    const ids = Array.from(selectedIds);
    restoreMutation.mutate(ids, {
      onSuccess: () => clearSelection()
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFilesToUpload(Array.from(e.target.files));
      setUploadDialogOpen(true);
    }
  };

  const handleUpload = () => {
    if (filesToUpload.length > 0) {
      filesToUpload.forEach(file => {
        const fd = new FormData();
        fd.append('assetData', file);
        uploadMutation.mutate(fd);
      });
      setUploadDialogOpen(false);
      setFilesToUpload([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Polaroid</h1>
          <p className="text-muted-foreground">Your photos & videos</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
            <Upload className="w-4 h-4" />
            Upload
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pb-2">
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link to="/photos/albums"><Folder className="w-4 h-4" /> Albums</Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link to="/photos/people"><Users className="w-4 h-4" /> People</Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link to="/photos/map"><MapPin className="w-4 h-4" /> Map</Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link to="/photos/search"><Search className="w-4 h-4" /> Search</Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link to="/photos/sharing"><Share2 className="w-4 h-4" /> Sharing</Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link to="/photos/settings"><Settings className="w-4 h-4" /> Settings</Link>
        </Button>
      </div>

      <Card className="bg-muted/50 border-none">
        <CardContent className="p-4 flex flex-wrap gap-6 items-center text-sm">
          {statsLoading ? (
            <Skeleton className="h-5 w-64" />
          ) : stats ? (
            <>
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{stats.images.toLocaleString()} photos</span>
              </div>
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{stats.videos.toLocaleString()} videos</span>
              </div>
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">Total: {stats.total.toLocaleString()}</span>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); clearSelection(); }} className="w-full">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="favorites">Favorites</TabsTrigger>
          <TabsTrigger value="archive">Archive</TabsTrigger>
          <TabsTrigger value="trash">Trash</TabsTrigger>
        </TabsList>
        
        <TabsContent value="timeline" className="mt-6">
          {bucketsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="aspect-square w-full rounded-md" />)}
              </div>
            </div>
          ) : bucketsError ? (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>Failed to load timeline. Please try again later.</AlertDescription>
            </Alert>
          ) : !timeBuckets || timeBuckets.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                <div className="p-4 bg-primary/10 rounded-full text-primary">
                  <Camera className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold">No photos yet</h3>
                  <p className="text-muted-foreground max-w-sm">
                    Upload your first photo or video to get started with Polaroid.
                  </p>
                </div>
                <Button onClick={() => fileInputRef.current?.click()}>
                  Upload Media
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div>
              {timeBuckets.map((bucket) => (
                <TimeBucketSection
                  key={bucket.timeBucket}
                  timeBucket={bucket}
                  selectedIds={selectedIds}
                  selectionMode={selectionMode}
                  onToggleSelection={toggleSelection}
                />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="favorites" className="mt-6">
          <FilteredTimeline
            filter={{ isFavorite: true }}
            mode="favorites"
            selectedIds={selectedIds}
            selectionMode={selectionMode}
            onToggleSelection={toggleSelection}
          />
        </TabsContent>
        <TabsContent value="archive" className="mt-6">
          <FilteredTimeline
            filter={{ visibility: 'archive' }}
            mode="archive"
            selectedIds={selectedIds}
            selectionMode={selectionMode}
            onToggleSelection={toggleSelection}
          />
        </TabsContent>
        <TabsContent value="trash" className="mt-6">
          <FilteredTimeline
            filter={{ isTrashed: true }}
            mode="trash"
            selectedIds={selectedIds}
            selectionMode={selectionMode}
            onToggleSelection={toggleSelection}
          />
        </TabsContent>
      </Tabs>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-lg rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border" />
          {activeTab === 'trash' ? (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBulkRestore} disabled={restoreMutation.isPending}>
                <RotateCcw className="w-3.5 h-3.5" /> Restore
              </Button>
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setBulkDeleteDialogOpen(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete Forever
              </Button>
            </>
          ) : activeTab === 'favorites' ? (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBulkUnfavorite} disabled={updateMutation.isPending}>
                <Heart className="w-3.5 h-3.5" /> Unfavorite
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBulkArchive} disabled={updateMutation.isPending}>
                <Archive className="w-3.5 h-3.5" /> Archive
              </Button>
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setBulkDeleteDialogOpen(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            </>
          ) : activeTab === 'archive' ? (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBulkFavorite} disabled={updateMutation.isPending}>
                <Heart className="w-3.5 h-3.5" /> Favorite
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBulkUnarchive} disabled={updateMutation.isPending}>
                <Archive className="w-3.5 h-3.5" /> Unarchive
              </Button>
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setBulkDeleteDialogOpen(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBulkFavorite} disabled={updateMutation.isPending}>
                <Heart className="w-3.5 h-3.5" /> Favorite
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBulkArchive} disabled={updateMutation.isPending}>
                <Archive className="w-3.5 h-3.5" /> Archive
              </Button>
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setBulkDeleteDialogOpen(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            </>
          )}
          <div className="h-4 w-px bg-border" />
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
            <DialogDescription>
              {filesToUpload.length} {filesToUpload.length === 1 ? 'file' : 'files'} selected for upload.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {filesToUpload.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                {f.type.startsWith('video/') ? <Video className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                <span className="truncate flex-1">{f.name}</span>
                <span className="text-muted-foreground text-xs">{formatBytes(f.size)}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Upload {filesToUpload.length} items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{activeTab === 'trash' ? 'Permanently Delete?' : 'Delete Selected?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {activeTab === 'trash'
                ? `Are you sure you want to permanently delete ${selectedIds.size} item(s)? This cannot be undone.`
                : `Are you sure you want to delete ${selectedIds.size} item(s)? They will be moved to trash for 30 days.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
              {activeTab === 'trash' ? 'Permanently Delete' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
