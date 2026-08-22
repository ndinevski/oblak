import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { 
  ChevronLeft, Search as SearchIcon, Sparkles, Filter, Video, Heart,
  Archive, Download, Trash2, Info, X
} from "lucide-react";
import {
  Button, Card, CardContent, Input, Label, Skeleton, Alert, AlertTitle, AlertDescription, Spinner,
  Tabs, TabsList, TabsTrigger, TabsContent, Checkbox, 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui";

import { useSearchSmart, useSearchMetadata, useDownloadAsset, useUpdateAsset, useDeleteAssets, useAsset } from "@/hooks/usePolaroid";
import { PolaroidAsset, formatDuration, formatBytes } from "@/lib/api/polaroid";
import { AssetImage } from "@/components/polaroid/AuthenticatedImage";
import { cn } from "@/lib/utils";

function SearchVideoPreview({ assetId }: { assetId: string }) {
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

export default function SearchPage() {
  const [activeTab, setActiveTab] = useState("smart");
  
  const [smartQuery, setSmartQuery] = useState("");
  
  const [metaCity, setMetaCity] = useState("");
  const [metaCountry, setMetaCountry] = useState("");
  const [metaType, setMetaType] = useState<string>("ALL");
  const [metaMake, setMetaMake] = useState("");
  const [metaModel, setMetaModel] = useState("");
  const [metaIsFavorite, setMetaIsFavorite] = useState<boolean | "indeterminate">("indeterminate");
  
  const smartSearchMutation = useSearchSmart();
  const metadataSearchMutation = useSearchMetadata();
  
  const [results, setResults] = useState<PolaroidAsset[] | null>(null);

  const [selectedAsset, setSelectedAsset] = useState<PolaroidAsset | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const downloadMutation = useDownloadAsset();
  const updateAssetMutation = useUpdateAsset();
  const deleteMutation = useDeleteAssets();
  const { data: fullAsset } = useAsset(selectedAsset?.id || '', { enabled: !!selectedAsset });
  const assetWithExif = fullAsset || selectedAsset;

  const handleSmartSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!smartQuery.trim()) return;
    
    smartSearchMutation.mutate({ query: smartQuery, params: { size: 20 } }, {
      onSuccess: (data) => setResults(data.assets.items)
    });
  };

  const handleMetadataSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    const filters: any = {};
    if (metaCity.trim()) filters.city = metaCity;
    if (metaCountry.trim()) filters.country = metaCountry;
    if (metaType !== "ALL") filters.type = metaType;
    if (metaMake.trim()) filters.make = metaMake;
    if (metaModel.trim()) filters.model = metaModel;
    if (metaIsFavorite !== "indeterminate") filters.isFavorite = metaIsFavorite;
    
    metadataSearchMutation.mutate(filters, {
      onSuccess: (data) => setResults(data.assets.items)
    });
  };

  const handleDownload = () => {
    if (selectedAsset) {
      downloadMutation.mutate({ assetId: selectedAsset.id, fileName: selectedAsset.originalFileName || selectedAsset.id });
    }
  };

  const handleFavorite = () => {
    if (selectedAsset) {
      const newVal = !selectedAsset.isFavorite;
      updateAssetMutation.mutate({ assetId: selectedAsset.id, data: { isFavorite: newVal } }, {
        onSuccess: () => {
          setSelectedAsset({ ...selectedAsset, isFavorite: newVal });
          setResults(prev => prev?.map(r => r.id === selectedAsset.id ? { ...r, isFavorite: newVal } : r) ?? null);
        }
      });
    }
  };

  const handleArchive = () => {
    if (selectedAsset) {
      const newVisibility = selectedAsset.visibility === 'archive' ? 'timeline' : 'archive';
      updateAssetMutation.mutate({ assetId: selectedAsset.id, data: { visibility: newVisibility } }, {
        onSuccess: () => {
          setSelectedAsset({ ...selectedAsset, visibility: newVisibility, isArchived: newVisibility === 'archive' });
        }
      });
    }
  };

  const handleDelete = () => {
    if (selectedAsset) {
      deleteMutation.mutate({ ids: [selectedAsset.id] }, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setResults(prev => prev?.filter(r => r.id !== selectedAsset.id) ?? null);
          setSelectedAsset(null);
          setShowMetadata(false);
        }
      });
    }
  };

  const isLoading = smartSearchMutation.isPending || metadataSearchMutation.isPending;
  const isError = smartSearchMutation.isError || metadataSearchMutation.isError;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/photos"><ChevronLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Search</h1>
          <p className="text-muted-foreground">Find specific photos and videos</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full sm:w-[400px] grid-cols-2">
          <TabsTrigger value="smart" className="gap-2">
            <Sparkles className="w-4 h-4" /> Smart Search
          </TabsTrigger>
          <TabsTrigger value="metadata" className="gap-2">
            <Filter className="w-4 h-4" /> Filters
          </TabsTrigger>
        </TabsList>

        <TabsContent value="smart" className="mt-6">
          <Card>
            <CardContent className="p-6">
              <form onSubmit={handleSmartSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search by describing what you see (e.g. 'dog playing in snow')" 
                    className="pl-9"
                    value={smartQuery}
                    onChange={(e) => setSmartQuery(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={isLoading || !smartQuery.trim()}>
                  {smartSearchMutation.isPending ? <Spinner className="w-4 h-4" /> : "Search"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metadata" className="mt-6">
          <Card>
            <CardContent className="p-6">
              <form onSubmit={handleMetadataSearch} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={metaCity} onChange={(e) => setMetaCity(e.target.value)} placeholder="e.g. Paris" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input id="country" value={metaCountry} onChange={(e) => setMetaCountry(e.target.value)} placeholder="e.g. France" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Media Type</Label>
                    <Select value={metaType} onValueChange={setMetaType}>
                      <SelectTrigger id="type">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Media</SelectItem>
                        <SelectItem value="IMAGE">Images Only</SelectItem>
                        <SelectItem value="VIDEO">Videos Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="make">Camera Make</Label>
                    <Input id="make" value={metaMake} onChange={(e) => setMetaMake(e.target.value)} placeholder="e.g. Apple" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="model">Camera Model</Label>
                    <Input id="model" value={metaModel} onChange={(e) => setMetaModel(e.target.value)} placeholder="e.g. iPhone 13 Pro" />
                  </div>
                  <div className="space-y-2 flex flex-col justify-center pt-6">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="favorite" 
                        checked={metaIsFavorite === true}
                        onCheckedChange={(checked) => setMetaIsFavorite(checked === true ? true : "indeterminate")}
                      />
                      <Label htmlFor="favorite">Favorites only</Label>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={isLoading}>
                    {metadataSearchMutation.isPending ? <Spinner className="w-4 h-4 mr-2" /> : <Filter className="w-4 h-4 mr-2" />}
                    Apply Filters
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-8">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <Skeleton key={i} className="aspect-square w-full rounded-md" />
              ))}
            </div>
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTitle>Search Failed</AlertTitle>
            <AlertDescription>We encountered an error while searching. Please try again.</AlertDescription>
          </Alert>
        ) : results ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Results</h2>
              <span className="text-sm text-muted-foreground">{results.length} items found</span>
            </div>
            
            {results.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                  <div className="p-4 bg-muted rounded-full">
                    <SearchIcon className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold">No results found</h3>
                  <p className="text-muted-foreground max-w-sm">
                    Try adjusting your search terms or filters to find what you're looking for.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {results.map((result) => (
                  <div key={result.id} className="relative aspect-square cursor-pointer group rounded-md overflow-hidden bg-muted" onClick={() => setSelectedAsset(result)}>
                    <AssetImage
                      assetId={result.id}
                      size="thumbnail"
                      alt="Search result"
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    {result.type === "VIDEO" && (
                      <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-1 text-white text-xs">
                        <Video className="w-3 h-3" />
                        <span>{result.duration ? formatDuration(result.duration) : ""}</span>
                      </div>
                    )}
                    {result.isFavorite && (
                      <div className="absolute bottom-2 right-2">
                        <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Card className="border-dashed bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
              <div className="flex items-center justify-center space-x-4 text-muted-foreground/50 mb-4">
                <Sparkles className="w-12 h-12" />
                <Filter className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-semibold text-muted-foreground">Search your library</h3>
              <p className="text-muted-foreground max-w-md">
                Use AI-powered smart search to find photos by describing them, or use metadata filters to narrow down by location, camera, and type.
              </p>
            </CardContent>
          </Card>
        )}
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
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleDownload} disabled={downloadMutation.isPending}>
                    {downloadMutation.isPending ? <Spinner className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleFavorite} disabled={updateAssetMutation.isPending}>
                    <Heart className={cn("w-4 h-4", selectedAsset.isFavorite && "fill-red-500 text-red-500")} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleArchive} disabled={updateAssetMutation.isPending}>
                     <Archive className={cn("w-4 h-4", selectedAsset.visibility === 'archive' && "fill-blue-400 text-blue-400")} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setShowMetadata(!showMetadata)}>
                    <Info className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-red-500/20 hover:text-red-500" onClick={() => setDeleteDialogOpen(true)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => { setSelectedAsset(null); setShowMetadata(false); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 flex relative bg-black overflow-hidden">
                <div className="flex-1 flex items-center justify-center">
                  {selectedAsset.type === "VIDEO" ? (
                    <SearchVideoPreview assetId={selectedAsset.id} />
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
              Are you sure you want to delete this {selectedAsset?.type?.toLowerCase() || 'asset'}? This action cannot be undone.
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
