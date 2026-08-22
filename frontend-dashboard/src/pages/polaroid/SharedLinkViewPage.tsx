import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Download, Lock, Image, AlertCircle, X, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { format } from "date-fns";
import {
  Button, Card, CardContent, Input, Spinner,
  Dialog, DialogContent,
} from "@/components/ui";
import {
  PolaroidSharedLink,
  PolaroidAsset,
  getSharedLinkByKey,
  getShareAssetThumbnailUrl,
  downloadShareAsset,
  formatDuration,
} from "@/lib/api/polaroid";

function ShareAssetImage({ shareKey, asset, className, onClick }: {
  shareKey: string;
  asset: PolaroidAsset;
  className?: string;
  onClick?: () => void;
}) {
  const [src, setSrc] = useState<string>("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const url = getShareAssetThumbnailUrl(shareKey, asset.id, "thumbnail");
    setSrc(url);
    setError(false);
  }, [shareKey, asset.id]);

  if (error || !src) {
    return (
      <div
        className={`bg-muted flex items-center justify-center ${className || ""}`}
        onClick={onClick}
        style={{ cursor: onClick ? "pointer" : undefined }}
      >
        <Image className="w-8 h-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={asset.originalFileName}
      className={className}
      onClick={onClick}
      onError={() => setError(true)}
      style={{ cursor: onClick ? "pointer" : undefined }}
    />
  );
}

function SharePreviewDialog({ shareKey, assets, initialIndex, onClose }: {
  shareKey: string;
  assets: PolaroidAsset[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [previewSrc, setPreviewSrc] = useState<string>("");
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [loadingVideo, setLoadingVideo] = useState(false);
  const asset = assets[index];
  const isVideo = asset?.type === "VIDEO";

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    if (!asset) return;
    setVideoSrc("");
    setLoadingVideo(false);

    if (isVideo) {
      setPreviewSrc(getShareAssetThumbnailUrl(shareKey, asset.id, "preview"));
      setLoadingVideo(true);
      downloadShareAsset(shareKey, asset.id).then((blob) => {
        setVideoSrc(URL.createObjectURL(blob));
        setLoadingVideo(false);
      }).catch(() => setLoadingVideo(false));
    } else {
      setPreviewSrc(getShareAssetThumbnailUrl(shareKey, asset.id, "preview"));
    }

    return () => {
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareKey, asset?.id, isVideo]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : assets.length - 1));
  }, [assets.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (i < assets.length - 1 ? i + 1 : 0));
  }, [assets.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goPrev, goNext, onClose]);

  if (!asset) return null;

  const handleDownload = async () => {
    try {
      const blob = await downloadShareAsset(shareKey, asset.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = asset.originalFileName || "download";
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 bg-black/95 border-none overflow-hidden [&>button]:hidden">
        <div className="relative flex items-center justify-center w-[95vw] h-[95vh]">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <button
            onClick={handleDownload}
            className="absolute top-4 right-16 z-50 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            <Download className="w-5 h-5" />
          </button>

          {assets.length > 1 && (
            <>
              <button
                onClick={goPrev}
                className="absolute left-4 z-50 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={goNext}
                className="absolute right-4 z-50 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {isVideo && videoSrc ? (
            <video
              src={videoSrc}
              controls
              autoPlay
              className="max-w-full max-h-full object-contain"
            />
          ) : isVideo && loadingVideo ? (
            <div className="relative">
              <img
                src={previewSrc}
                alt={asset.originalFileName}
                className="max-w-full max-h-[95vh] object-contain"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="p-4 bg-black/60 rounded-full">
                  <Spinner size="lg" />
                </div>
              </div>
            </div>
          ) : (
            <img
              src={previewSrc}
              alt={asset.originalFileName}
              className="max-w-full max-h-[95vh] object-contain"
            />
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 text-white/70 text-sm bg-black/60 px-3 py-1 rounded-full">
            {index + 1} / {assets.length}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SharedLinkViewPage() {
  const { key } = useParams<{ key: string }>();
  const [link, setLink] = useState<PolaroidSharedLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const fetchLink = useCallback(async (pw?: string) => {
    if (!key) return;
    setLoading(true);
    setError(null);

    try {
      const data = await getSharedLinkByKey(key, pw);
      setLink(data);
      setNeedsPassword(false);
      setPasswordError(false);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status ??
                     (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setNeedsPassword(true);
        if (pw) setPasswordError(true);
      } else if (status === 404) {
        setError("This shared link does not exist or has been removed.");
      } else {
        setError("Failed to load shared content. The link may have expired.");
      }
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    fetchLink();
  }, [fetchLink]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      fetchLink(password.trim());
    }
  };

  const assets: PolaroidAsset[] = link?.album?.assets ?? link?.assets ?? [];

  const handleDownloadAll = async () => {
    for (const asset of assets) {
      try {
        const blob = await downloadShareAsset(key!, asset.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = asset.originalFileName || "download";
        a.click();
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 300));
      } catch {}
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-6 p-8">
            <div className="p-4 bg-primary/10 rounded-full text-primary">
              <Lock className="w-8 h-8" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold">Password Protected</h2>
              <p className="text-muted-foreground text-sm">
                Enter the password to view this shared content.
              </p>
            </div>
            <form onSubmit={handlePasswordSubmit} className="w-full space-y-4">
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-destructive">Incorrect password. Please try again.</p>
              )}
              <Button type="submit" className="w-full" disabled={!password.trim()}>
                View Content
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="p-4 bg-destructive/10 rounded-full text-destructive">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold">Link Unavailable</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!link) return null;

  const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
  if (isExpired) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="p-4 bg-destructive/10 rounded-full text-destructive">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold">Link Expired</h2>
            <p className="text-muted-foreground">
              This shared link expired on {format(new Date(link.expiresAt!), "PPP")}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">
              {link.album?.albumName || link.description || "Shared Photos"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {assets.length} {assets.length === 1 ? "item" : "items"}
              {link.album?.description ? ` · ${link.album.description}` : ""}
            </p>
          </div>
          {link.allowDownload && assets.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleDownloadAll} className="shrink-0 gap-2">
              <Download className="w-4 h-4" />
              Download All
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Image className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No photos to show</h3>
            <p className="text-muted-foreground mt-1">This shared link has no content.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1">
            {assets.map((asset, idx) => (
              <div
                key={asset.id}
                className="relative aspect-square overflow-hidden cursor-pointer group"
                onClick={() => setPreviewIndex(idx)}
              >
                <ShareAssetImage
                  shareKey={key!}
                  asset={asset}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
                {asset.type === "VIDEO" && (
                  <div className="absolute bottom-1 left-1 flex items-center gap-1 text-white text-xs bg-black/60 px-1.5 py-0.5 rounded">
                    <Play className="w-3 h-3" />
                    {asset.duration ? formatDuration(asset.duration) : ""}
                  </div>
                )}
                {link.allowDownload && (
                  <button
                    className="absolute top-1 right-1 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const blob = await downloadShareAsset(key!, asset.id);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = asset.originalFileName || "download";
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {}
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {previewIndex !== null && (
        <SharePreviewDialog
          shareKey={key!}
          assets={assets}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}
