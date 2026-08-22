import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { 
  ChevronLeft, Plus, Trash2, Share2, Pencil, Image as ImageIcon, Video, Calendar, MoreVertical, Heart, Download, ImagePlus, Check, X
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Button, Card, CardContent, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Input, Textarea, Label, Skeleton, Alert, AlertTitle, AlertDescription, Spinner,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui";

import { 
  useAlbum, useUpdateAlbum, useDeleteAlbum, useRemoveAlbumAssets, useDownloadAsset, useUpdateAsset, useAddAlbumAssets, useTimeBuckets, useTimeBucket, useAsset
} from "@/hooks/usePolaroid";
import { PolaroidAsset, PolaroidTimeBucket, formatDuration } from "@/lib/api/polaroid";
import { AssetImage } from "@/components/polaroid/AuthenticatedImage";

function AlbumVideoPreview({ assetId }: { assetId: string }) {
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

function AssetPickerBucket({ timeBucket, selectedIds, onToggle }: { timeBucket: PolaroidTimeBucket; selectedIds: Set<string>; onToggle: (id: string) => void }) {
  const { data: bucketData, isLoading } = useTimeBucket({ timeBucket: timeBucket.timeBucket, size: 'MONTH' });

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded" />
        ))}
      </div>
    );
  }

  if (!bucketData || bucketData.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">{format(new Date(timeBucket.timeBucket), "MMMM yyyy")}</h4>
      <div className="grid grid-cols-4 gap-1">
        {bucketData.map((asset) => (
          <div
            key={asset.id}
            className={cn(
              "relative aspect-square cursor-pointer rounded overflow-hidden border-2 transition-colors",
              selectedIds.has(asset.id) ? "border-primary" : "border-transparent"
            )}
            onClick={() => onToggle(asset.id)}
          >
            <AssetImage assetId={asset.id} size="thumbnail" alt="" className="object-cover w-full h-full" />
            {selectedIds.has(asset.id) && (
              <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                <Check className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AlbumDetailPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  
  const { data: album, isLoading, isError } = useAlbum(albumId!);
  const updateMutation = useUpdateAlbum();
  const deleteMutation = useDeleteAlbum();
  const removeAssetsMutation = useRemoveAlbumAssets();
  const downloadMutation = useDownloadAsset();
  const updateAssetMutation = useUpdateAsset();
  const addAssetsMutation = useAddAlbumAssets();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  const [selectedAsset, setSelectedAsset] = useState<PolaroidAsset | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());
  const { data: pickerBuckets } = useTimeBuckets({ size: 'MONTH' }, { enabled: pickerOpen });

  const { data: fullAsset } = useAsset(selectedAsset?.id || '', { enabled: !!selectedAsset });
  const assetWithExif = fullAsset || selectedAsset;

  const handleEditOpen = () => {
    if (album) {
      setEditName(album.albumName);
      setEditDescription(album.description || "");
      setEditDialogOpen(true);
    }
  };

  const handleEditSave = () => {
    if (!albumId || !editName.trim()) return;
    updateMutation.mutate({
      albumId: albumId,
      data: { albumName: editName, description: editDescription }
    }, {
      onSuccess: () => setEditDialogOpen(false)
    });
  };

  const handleDeleteAlbum = () => {
    if (!albumId) return;
    deleteMutation.mutate(albumId, {
      onSuccess: () => navigate("/photos/albums")
    });
  };

  const handleRemoveAsset = (assetId: string) => {
    if (!albumId) return;
    removeAssetsMutation.mutate({
      albumId: albumId,
      assetIds: [assetId]
    }, {
      onSuccess: () => {
        if (selectedAsset?.id === assetId) {
          setSelectedAsset(null);
        }
      }
    });
  };

  const handleDownload = () => {
    if (selectedAsset) {
      downloadMutation.mutate({ assetId: selectedAsset.id, fileName: selectedAsset.originalFileName });
    }
  };

  const handleFavorite = () => {
    if (selectedAsset) {
      const newVal = !selectedAsset.isFavorite;
      updateAssetMutation.mutate({ assetId: selectedAsset.id, data: { isFavorite: newVal } }, {
        onSuccess: () => setSelectedAsset({ ...selectedAsset, isFavorite: newVal })
      });
    }
  };

  const handleSetThumbnail = (assetId: string) => {
    if (!albumId) return;
    updateMutation.mutate({ albumId, data: { albumThumbnailAssetId: assetId } });
  };

  const handleAddAssets = () => {
    if (!albumId || pickerSelectedIds.size === 0) return;
    addAssetsMutation.mutate({ albumId, assetIds: Array.from(pickerSelectedIds) }, {
      onSuccess: () => { setPickerOpen(false); setPickerSelectedIds(new Set()); }
    });
  };

  const togglePickerAsset = (id: string) => {
    setPickerSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const dateRangeString = useMemo(() => {
    if (!album?.startDate || !album?.endDate) return null;
    const start = format(new Date(album.startDate), "MMM d, yyyy");
    const end = format(new Date(album.endDate), "MMM d, yyyy");
    return start === end ? start : `${start} - ${end}`;
  }, [album]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skeleton className="w-8 h-8 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="aspect-square w-full rounded-md" />)}
        </div>
      </div>
    );
  }

  if (isError || !album) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load album details. It may have been deleted.</AlertDescription>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/photos/albums")}>
          Back to Albums
        </Button>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="-ml-2">
            <Link to="/photos/albums"><ChevronLeft className="w-5 h-5" /></Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{album.albumName}</h1>
            <div className="flex items-center gap-3 text-muted-foreground mt-1 text-sm">
              <span className="flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" />
                {album.assetCount} items
              </span>
              {dateRangeString && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {dateRangeString}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPickerOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Photos
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEditOpen}>
                <Pencil className="w-4 h-4 mr-2" /> Edit Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/photos/sharing")}>
                <Share2 className="w-4 h-4 mr-2" /> Share Album
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete Album
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {album.description && (
        <p className="text-muted-foreground max-w-3xl">{album.description}</p>
      )}

      {(album.assets || []).length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="p-4 bg-muted rounded-full">
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-semibold">Album is empty</h3>
              <p className="text-muted-foreground max-w-sm">
                Add photos and videos to this album to organize them.
              </p>
            </div>
            <Button onClick={() => setPickerOpen(true)}>
              Add Photos
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {(album.assets || []).map((asset) => (
              <div
                key={asset.id}
                className="relative aspect-square cursor-pointer group rounded-md overflow-hidden bg-muted"
                onClick={() => setSelectedAsset(asset)}
              >
                <AssetImage
                  assetId={asset.id}
                  size="thumbnail"
                  alt={asset.originalFileName}
                  loading="lazy"
                  className="object-cover w-full h-full transition-transform group-hover:scale-105"
                />
              {asset.type === "VIDEO" && (
                <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-1 text-white text-xs">
                  <Video className="w-3 h-3" />
                  <span>{asset.duration ? formatDuration(asset.duration) : ""}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleFavorite} disabled={updateAssetMutation.isPending}>
                    <Heart className={cn("w-4 h-4", selectedAsset.isFavorite && "fill-red-500 text-red-500")} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => handleSetThumbnail(selectedAsset.id)} title="Set as album thumbnail">
                    <ImagePlus className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-white hover:bg-red-500/20 hover:text-red-500" 
                    onClick={() => handleRemoveAsset(selectedAsset.id)}
                    title="Remove from album"
                  >
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
                    <AlbumVideoPreview assetId={selectedAsset.id} />
                  ) : (
                    <AssetImage
                      assetId={selectedAsset.id}
                      size="preview"
                      alt={selectedAsset.originalFileName}
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Album</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Album Name</Label>
              <Input 
                id="name" 
                value={editName} 
                onChange={(e) => setEditName(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea 
                id="description" 
                value={editDescription} 
                onChange={(e) => setEditDescription(e.target.value)} 
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={!editName.trim() || updateMutation.isPending}>
              {updateMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Album?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this album? The photos inside will not be deleted from your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAlbum} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete Album
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Photos to Album</DialogTitle>
            <DialogDescription>{pickerSelectedIds.size} selected</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {pickerBuckets?.map(bucket => (
              <AssetPickerBucket key={bucket.timeBucket} timeBucket={bucket} selectedIds={pickerSelectedIds} onToggle={togglePickerAsset} />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button onClick={handleAddAssets} disabled={pickerSelectedIds.size === 0 || addAssetsMutation.isPending}>
              {addAssetsMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Add {pickerSelectedIds.size} Photos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
