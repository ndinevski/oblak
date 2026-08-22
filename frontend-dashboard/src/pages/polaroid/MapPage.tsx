import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { 
  ChevronLeft, MapPin, Image as ImageIcon, Map as MapIcon, Video,
  Heart, Archive, Download, Trash2, Info, X
} from "lucide-react";
import {
  Button, Card, CardContent, CardHeader, CardTitle,
  Skeleton, Alert, AlertTitle, AlertDescription, Spinner,
  Dialog, DialogContent,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui";
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import { useMapMarkers, useAsset, useDownloadAsset, useUpdateAsset, useDeleteAssets } from "@/hooks/usePolaroid";
import { PolaroidMapMarker, PolaroidAsset, formatDuration, formatBytes } from "@/lib/api/polaroid";
import { AssetImage } from "@/components/polaroid/AuthenticatedImage";
import { cn } from "@/lib/utils";

const DefaultIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapVideoPreview({ assetId }: { assetId: string }) {
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

export default function MapPage() {
  const { data: markers, isLoading, isError } = useMapMarkers();
  
  const [expandedLocations, setExpandedLocations] = useState<Record<string, boolean>>({});
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);

  const { data: selectedAsset } = useAsset(selectedAssetId || '', { enabled: !!selectedAssetId });
  const downloadMutation = useDownloadAsset();
  const updateMutation = useUpdateAsset();
  const deleteMutation = useDeleteAssets();

  const toggleLocation = (locId: string) => {
    setExpandedLocations(prev => ({
      ...prev,
      [locId]: !prev[locId]
    }));
  };

  const groupedMarkers = useMemo(() => {
    if (!markers) return [];
    
    const groups: Record<string, {
      locationName: string;
      city: string;
      country: string;
      markers: PolaroidMapMarker[];
    }> = {};

    markers.forEach(marker => {
      const city = marker.city || "Unknown City";
      const country = marker.country || "Unknown Country";
      const state = marker.state || "";
      
      const locId = `${country}-${state}-${city}`;
      
      if (!groups[locId]) {
        const nameParts = [];
        if (city !== "Unknown City") nameParts.push(city);
        if (state) nameParts.push(state);
        if (country !== "Unknown Country") nameParts.push(country);
        
        groups[locId] = {
          locationName: nameParts.length > 0 ? nameParts.join(", ") : "Unknown Location",
          city,
          country,
          markers: []
        };
      }
      
      groups[locId].markers.push(marker);
    });

    return Object.values(groups).sort((a, b) => 
      b.markers.length - a.markers.length
    );
  }, [markers]);

  const handleDownload = () => {
    if (selectedAsset) {
      downloadMutation.mutate({ assetId: selectedAsset.id, fileName: selectedAsset.originalFileName || selectedAsset.id });
    }
  };

  const handleFavorite = () => {
    if (selectedAsset) {
      const newVal = !selectedAsset.isFavorite;
      updateMutation.mutate({ assetId: selectedAsset.id, data: { isFavorite: newVal } });
    }
  };

  const handleArchive = () => {
    if (selectedAsset) {
      const newVisibility = selectedAsset.visibility === 'archive' ? 'timeline' : 'archive';
      updateMutation.mutate({ assetId: selectedAsset.id, data: { visibility: newVisibility } });
    }
  };

  const handleDelete = () => {
    if (selectedAsset) {
      deleteMutation.mutate({ ids: [selectedAsset.id] }, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setSelectedAssetId(null);
          setShowMetadata(false);
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/photos"><ChevronLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Map</h1>
          <p className="text-muted-foreground">Explore photos by location</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-[500px] w-full rounded-lg" />
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <Skeleton className="h-5 w-48" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load location data. Please try again.</AlertDescription>
        </Alert>
      ) : groupedMarkers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="p-4 bg-muted rounded-full">
              <MapIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-semibold">No geotagged photos</h3>
              <p className="text-muted-foreground max-w-sm">
                We couldn't find any location data in your photos.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {markers && markers.length > 0 && (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div style={{ height: '500px', width: '100%' }}>
                  <MapContainer
                    center={[markers[0].lat, markers[0].lon]}
                    zoom={3}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={true}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {markers.map((marker) => (
                      <Marker key={marker.id} position={[marker.lat, marker.lon]} icon={DefaultIcon}>
                        <Popup>
                          <div className="w-32 cursor-pointer" onClick={() => setSelectedAssetId(marker.id)}>
                            <AssetImage assetId={marker.id} size="thumbnail" alt="Photo" className="w-full h-24 object-cover rounded mb-1" />
                            <p className="text-xs text-center">
                              {[marker.city, marker.country].filter(Boolean).join(', ') || 'Unknown location'}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {groupedMarkers.map((group, idx) => {
            const locId = `loc-${idx}`;
            const isExpanded = expandedLocations[locId];
            
            return (
              <Card key={locId} className="overflow-hidden">
                <CardHeader 
                  className="py-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleLocation(locId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-full">
                        <MapPin className="w-4 h-4 text-primary" />
                      </div>
                      <CardTitle className="text-base">{group.locationName}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ImageIcon className="w-4 h-4" />
                      <span>{group.markers.length} photos</span>
                    </div>
                  </div>
                </CardHeader>
                
                {isExpanded && (
                  <CardContent className="pt-0 border-t bg-muted/20">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 pt-4">
                      {group.markers.map((marker) => (
                        <div
                          key={marker.id}
                          className="aspect-square rounded-md overflow-hidden bg-muted cursor-pointer"
                          onClick={() => setSelectedAssetId(marker.id)}
                        >
                          <AssetImage 
                            assetId={marker.id}
                            size="thumbnail"
                            alt={`Photo from ${group.locationName}`}
                            loading="lazy"
                            className="w-full h-full object-cover hover:scale-105 transition-transform"
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedAssetId} onOpenChange={(open) => { if (!open) { setSelectedAssetId(null); setShowMetadata(false); } }}>
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-black/95 border-none text-white [&>[data-slot=dialog-close]]:hidden">
          {selectedAsset ? (
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
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => { setSelectedAssetId(null); setShowMetadata(false); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 flex relative bg-black overflow-hidden">
                <div className="flex-1 flex items-center justify-center">
                  {selectedAsset.type === "VIDEO" ? (
                    <MapVideoPreview assetId={selectedAsset.id} />
                  ) : (
                    <AssetImage
                      assetId={selectedAsset.id}
                      size="preview"
                      alt={selectedAsset.originalFileName}
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>
                {showMetadata && selectedAsset && (
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
                        <p className="break-all">{selectedAsset.originalFileName || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs uppercase tracking-wider">Date</p>
                        <p>{selectedAsset.exifInfo?.dateTimeOriginal ? format(new Date(selectedAsset.exifInfo.dateTimeOriginal), "PPP p") : format(new Date(selectedAsset.fileCreatedAt), "PPP p")}</p>
                      </div>
                      {selectedAsset.exifInfo?.fileSizeInByte && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">File Size</p>
                          <p>{formatBytes(selectedAsset.exifInfo.fileSizeInByte)}</p>
                        </div>
                      )}
                      {(selectedAsset.exifInfo?.exifImageWidth || selectedAsset.exifInfo?.exifImageHeight) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Dimensions</p>
                          <p>{selectedAsset.exifInfo.exifImageWidth} × {selectedAsset.exifInfo.exifImageHeight}</p>
                        </div>
                      )}
                      {(selectedAsset.exifInfo?.make || selectedAsset.exifInfo?.model) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Camera</p>
                          <p>{[selectedAsset.exifInfo.make, selectedAsset.exifInfo.model].filter(Boolean).join(' ')}</p>
                        </div>
                      )}
                      {selectedAsset.exifInfo?.lensModel && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Lens</p>
                          <p>{selectedAsset.exifInfo.lensModel}</p>
                        </div>
                      )}
                      {(selectedAsset.exifInfo?.fNumber || selectedAsset.exifInfo?.exposureTime || selectedAsset.exifInfo?.iso) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Settings</p>
                          <p>{[
                            selectedAsset.exifInfo.fNumber ? `ƒ/${selectedAsset.exifInfo.fNumber}` : null,
                            selectedAsset.exifInfo.exposureTime ? `${selectedAsset.exifInfo.exposureTime}s` : null,
                            selectedAsset.exifInfo.iso ? `ISO ${selectedAsset.exifInfo.iso}` : null,
                            selectedAsset.exifInfo.focalLength ? `${selectedAsset.exifInfo.focalLength}mm` : null,
                          ].filter(Boolean).join(' · ')}</p>
                        </div>
                      )}
                      {(selectedAsset.exifInfo?.city || selectedAsset.exifInfo?.state || selectedAsset.exifInfo?.country) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Location</p>
                          <p>{[selectedAsset.exifInfo.city, selectedAsset.exifInfo.state, selectedAsset.exifInfo.country].filter(Boolean).join(', ')}</p>
                        </div>
                      )}
                      {(selectedAsset.exifInfo?.latitude && selectedAsset.exifInfo?.longitude) && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">GPS</p>
                          <p>{selectedAsset.exifInfo.latitude.toFixed(6)}, {selectedAsset.exifInfo.longitude.toFixed(6)}</p>
                        </div>
                      )}
                      {selectedAsset.exifInfo?.description && (
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wider">Description</p>
                          <p>{selectedAsset.exifInfo.description}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : selectedAssetId ? (
            <div className="flex items-center justify-center h-[80vh]">
              <Spinner className="w-8 h-8" />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {selectedAsset?.type?.toLowerCase() || 'asset'}? It will be moved to trash for 30 days.
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
