import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { 
  ChevronLeft, Pencil, Eye, EyeOff, Users, Calendar as CalendarIcon, Image as ImageIcon, Video, Heart, Download, X
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Button, Card, CardContent, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Input, Label, Skeleton, Alert, AlertTitle, AlertDescription, Spinner,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui";

import { 
  usePerson, useUpdatePerson, useTimeBuckets, useTimeBucket, usePeople, useMergePeople, useDownloadAsset
} from "@/hooks/usePolaroid";
import { PolaroidAsset, PolaroidPerson, PolaroidTimeBucket, formatDuration } from "@/lib/api/polaroid";
import { AssetImage, PersonImage } from "@/components/polaroid/AuthenticatedImage";

function PersonVideoPreview({ assetId }: { assetId: string }) {
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

function PersonBucketSection({ 
  personId, 
  timeBucket, 
  onSelectAsset 
}: { 
  personId: string; 
  timeBucket: PolaroidTimeBucket; 
  onSelectAsset: (asset: PolaroidAsset) => void;
}) {
  const { data: assets, isLoading } = useTimeBucket({ 
    timeBucket: timeBucket.timeBucket, 
    size: 'MONTH', 
    personId 
  });

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

  if (!assets || assets.length === 0) return null;

  return (
    <div className="space-y-4 mb-8">
      <h3 className="font-semibold text-lg">{format(new Date(timeBucket.timeBucket), "MMMM yyyy")}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="relative aspect-square cursor-pointer group rounded-md overflow-hidden bg-muted"
            onClick={() => onSelectAsset(asset)}
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
    </div>
  );
}

export default function PersonDetailPage() {
  const { personId } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  
  const { data: person, isLoading: personLoading, isError: personError } = usePerson(personId!);
  const { data: timeBuckets, isLoading: bucketsLoading } = useTimeBuckets(
    { size: 'MONTH', personId: personId! },
    { enabled: !!personId }
  );
  const { data: allPeople } = usePeople();
  
  const updateMutation = useUpdatePerson();
  const mergeMutation = useMergePeople();
  const downloadMutation = useDownloadAsset();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");

  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [targetPersonId, setTargetPersonId] = useState("");

  const [selectedAsset, setSelectedAsset] = useState<PolaroidAsset | null>(null);

  const handleEditOpen = () => {
    if (person) {
      setEditName(person.name);
      setEditBirthDate(person.birthDate ? format(new Date(person.birthDate), "yyyy-MM-dd") : "");
      setEditDialogOpen(true);
    }
  };

  const handleEditSave = () => {
    if (!personId) return;
    updateMutation.mutate({
      personId: personId,
      data: { 
        name: editName,
        birthDate: editBirthDate ? new Date(editBirthDate).toISOString() : undefined
      }
    }, {
      onSuccess: () => setEditDialogOpen(false)
    });
  };

  const handleToggleHidden = () => {
    if (!personId || !person) return;
    updateMutation.mutate({
      personId: personId,
      data: { isHidden: !person.isHidden }
    });
  };

  const handleMerge = () => {
    if (!personId || !targetPersonId) return;
    mergeMutation.mutate({
      personId: personId,
      mergeIds: [targetPersonId]
    }, {
      onSuccess: () => navigate("/photos/people")
    });
  };

  const handleDownload = () => {
    if (selectedAsset) {
      downloadMutation.mutate({ assetId: selectedAsset.id, fileName: selectedAsset.originalFileName });
    }
  };

  if (personLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-20 h-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="aspect-square w-full rounded-md" />)}
        </div>
      </div>
    );
  }

  if (personError || !person) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load person details. They may have been deleted or merged.</AlertDescription>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/photos/people")}>
          Back to People
        </Button>
      </Alert>
    );
  }

  const otherPeople = allPeople?.people.filter((p: PolaroidPerson) => p.id !== personId) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="-ml-2">
            <Link to="/photos/people"><ChevronLeft className="w-5 h-5" /></Link>
          </Button>
          <PersonImage
            personId={person.id}
            alt={person.name}
            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-muted ${person.isHidden ? 'opacity-50 grayscale' : ''}`}
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {person.name || "Unknown Person"}
              </h1>
              {person.isHidden && (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-muted-foreground mt-1 text-sm">
              <span className="flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" />
                Photos
              </span>
              {person.birthDate && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Born {format(new Date(person.birthDate), "MMMM d, yyyy")}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleEditOpen} className="gap-2">
            <Pencil className="w-4 h-4" /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Users className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleToggleHidden}>
                {person.isHidden ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                {person.isHidden ? "Unhide Person" : "Hide Person"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMergeDialogOpen(true)}>
                <Users className="w-4 h-4 mr-2" /> Merge with...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {bucketsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="aspect-square w-full rounded-md" />)}
        </div>
      ) : !timeBuckets || timeBuckets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="p-4 bg-muted rounded-full">
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-semibold">No photos found</h3>
              <p className="text-muted-foreground max-w-sm">
                No photos are associated with this person.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div>
          {timeBuckets.map((bucket) => (
            <PersonBucketSection
              key={bucket.timeBucket}
              personId={personId!}
              timeBucket={bucket}
              onSelectAsset={setSelectedAsset}
            />
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
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                    <Heart className={cn("w-4 h-4", selectedAsset.isFavorite && "fill-red-500 text-red-500")} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setSelectedAsset(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 flex relative bg-black overflow-hidden">
                <div className="flex-1 flex items-center justify-center">
                  {selectedAsset.type === "VIDEO" ? (
                    <PersonVideoPreview assetId={selectedAsset.id} />
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
            <DialogTitle>Edit Person</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input 
                id="name" 
                value={editName} 
                onChange={(e) => setEditName(e.target.value)} 
                placeholder="Enter a name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birthdate">Date of Birth</Label>
              <Input 
                id="birthdate" 
                type="date"
                value={editBirthDate} 
                onChange={(e) => setEditBirthDate(e.target.value)} 
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

      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Person</DialogTitle>
            <DialogDescription>
              Merge {person.name || "this person"} into another person. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select target person</Label>
              <Select value={targetPersonId} onValueChange={setTargetPersonId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a person to merge into" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {otherPeople.map((p: PolaroidPerson) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <PersonImage
                          personId={p.id}
                          alt={p.name}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                        <span>{p.name || "Unknown"}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMerge} disabled={!targetPersonId || mergeMutation.isPending}>
              {mergeMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
