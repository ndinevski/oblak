import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ChevronLeft, Plus, Folder, Trash2, Image as ImageIcon, MoreHorizontal, Calendar 
} from "lucide-react";
import { format } from "date-fns";
import {
  Button, Card, CardContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Input, Textarea, Label, Skeleton, Alert, AlertTitle, AlertDescription, Spinner,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui";

import { useAlbums, useCreateAlbum, useDeleteAlbum } from "@/hooks/usePolaroid";
import { PolaroidAlbum } from "@/lib/api/polaroid";
import { AssetImage } from "@/components/polaroid/AuthenticatedImage";

export default function AlbumsListPage() {
  const navigate = useNavigate();
  const { data: albums, isLoading, isError } = useAlbums();
  const createMutation = useCreateAlbum();
  const deleteMutation = useDeleteAlbum();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDescription, setNewAlbumDescription] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [albumToDelete, setAlbumToDelete] = useState<PolaroidAlbum | null>(null);

  const handleCreate = () => {
    if (!newAlbumName.trim()) return;
    createMutation.mutate({
      albumName: newAlbumName,
      description: newAlbumDescription
    }, {
      onSuccess: () => {
        setCreateDialogOpen(false);
        setNewAlbumName("");
        setNewAlbumDescription("");
      }
    });
  };

  const confirmDelete = (album: PolaroidAlbum, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAlbumToDelete(album);
    setDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (albumToDelete) {
      deleteMutation.mutate(albumToDelete.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setAlbumToDelete(null);
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
          <h1 className="text-3xl font-bold tracking-tight">Albums</h1>
          <p className="text-muted-foreground">Group and organize your photos</p>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Album
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[4/3] w-full rounded-xl" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load albums. Please try again.</AlertDescription>
        </Alert>
      ) : !albums || albums.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="p-4 bg-primary/10 rounded-full text-primary">
              <Folder className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-semibold">No albums yet</h3>
              <p className="text-muted-foreground max-w-sm">
                Create your first album to organize your photos.
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              Create Album
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {albums.map(album => (
            <div 
              key={album.id}
              onClick={() => navigate(`/photos/albums/${album.id}`)}
              className="group cursor-pointer space-y-3"
            >
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-muted border">
                {album.albumThumbnailAssetId ? (
                  <AssetImage 
                    assetId={album.albumThumbnailAssetId!} 
                    size="thumbnail" 
                    alt={album.albumName}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted/50">
                    <ImageIcon className="w-10 h-10 opacity-20" />
                  </div>
                )}
                
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="secondary" size="icon" className="h-8 w-8 bg-black/50 text-white hover:bg-black/70 border-none">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => confirmDelete(album, e)}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Album
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
                  {album.albumName}
                </h3>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" />
                    {album.assetCount} items
                  </span>
                  {album.startDate && album.endDate && (
                    <span className="flex items-center gap-1 text-xs">
                      <Calendar className="w-3.5 h-3.5" />
                      {format(new Date(album.startDate), "MMM yyyy")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Album</DialogTitle>
            <DialogDescription>
              Create a new album to group related photos together.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Album Name</Label>
              <Input 
                id="name" 
                value={newAlbumName} 
                onChange={(e) => setNewAlbumName(e.target.value)} 
                placeholder="e.g. Summer Vacation 2026"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea 
                id="description" 
                value={newAlbumDescription} 
                onChange={(e) => setNewAlbumDescription(e.target.value)} 
                placeholder="Add a description for this album"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newAlbumName.trim() || createMutation.isPending}>
              {createMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Album?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the album "{albumToDelete?.albumName}"? 
              This will not delete the photos inside it, only the album itself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete Album
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
