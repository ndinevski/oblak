import { useState } from "react";
import { Link } from "react-router-dom";
import { 
  ChevronLeft, Plus, Copy, Check, Trash2, Link2, Calendar, Lock, Eye
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Button, Card, CardContent, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Input, Label, Skeleton, Alert, AlertTitle, AlertDescription, Spinner,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Badge, Switch, Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui";

import { 
  useSharedLinks, useCreateSharedLink, useDeleteSharedLink, useAlbums 
} from "@/hooks/usePolaroid";
import { PolaroidSharedLink } from "@/lib/api/polaroid";

export default function SharingPage() {
  const { data: links, isLoading, isError } = useSharedLinks();
  const { data: albums } = useAlbums();
  
  const createMutation = useCreateSharedLink();
  const deleteMutation = useDeleteSharedLink();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newType, setNewType] = useState<"ALBUM" | "INDIVIDUAL">("ALBUM");
  const [newAlbumId, setNewAlbumId] = useState<string>("");
  const [newDescription, setNewDescription] = useState("");
  const [newAllowDownload, setNewAllowDownload] = useState(true);
  const [newAllowUpload, setNewAllowUpload] = useState(false);
  const [newShowMetadata, setNewShowMetadata] = useState(true);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [linkToDelete, setLinkToDelete] = useState<PolaroidSharedLink | null>(null);

  const handleCreate = () => {
    if (newType === "ALBUM" && !newAlbumId) return;
    
    createMutation.mutate({
      type: newType,
      albumId: newType === "ALBUM" ? newAlbumId : undefined,
      description: newDescription,
      allowDownload: newAllowDownload,
      allowUpload: newAllowUpload,
      showMetadata: newShowMetadata
    }, {
      onSuccess: () => {
        setCreateDialogOpen(false);
        resetForm();
      }
    });
  };

  const resetForm = () => {
    setNewType("ALBUM");
    setNewAlbumId("");
    setNewDescription("");
    setNewAllowDownload(true);
    setNewAllowUpload(false);
    setNewShowMetadata(true);
  };

  const confirmDelete = (link: PolaroidSharedLink) => {
    setLinkToDelete(link);
    setDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (linkToDelete) {
      deleteMutation.mutate(linkToDelete.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setLinkToDelete(null);
        }
      });
    }
  };

  const copyToClipboard = (url: string, linkId: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLinkId(linkId);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/photos"><ChevronLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shared Links</h1>
          <p className="text-muted-foreground">Manage how you share your photos</p>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Link
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Details</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map(i => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load shared links. Please try again.</AlertDescription>
        </Alert>
      ) : !links || links.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="p-4 bg-primary/10 rounded-full text-primary">
              <Link2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-semibold">No shared links</h3>
              <p className="text-muted-foreground max-w-sm">
                Share your photos and albums with others by creating a public link.
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              Create Link
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Link Details</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        {link.type === 'ALBUM' ? <Link2 className="w-4 h-4 text-primary" /> : <Eye className="w-4 h-4 text-primary" />}
                        {link.description || (link.type === 'ALBUM' ? `Album Share` : `Photo Share`)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate max-w-[200px] sm:max-w-[300px]">
                        {link.key}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {link.allowDownload && <Badge variant="secondary" className="text-xs font-normal">Download</Badge>}
                        {link.allowUpload && <Badge variant="secondary" className="text-xs font-normal">Upload</Badge>}
                        {link.showMetadata && <Badge variant="secondary" className="text-xs font-normal">Metadata</Badge>}
                        {link.password && <Badge variant="outline" className="text-xs font-normal gap-1"><Lock className="w-3 h-3" /> Password</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div title={format(new Date(link.createdAt), "PPpp")}>
                        {formatDistanceToNow(new Date(link.createdAt), { addSuffix: true })}
                      </div>
                      {link.expiresAt && (
                        <div className="text-xs text-orange-500 mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> 
                          Exp: {format(new Date(link.expiresAt), "MMM d")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="gap-1 h-8"
                          onClick={() => copyToClipboard(`${window.location.origin}/share/${link.key}`, link.id)}
                        >
                          {copiedLinkId === link.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          <span className="hidden sm:inline">{copiedLinkId === link.id ? "Copied" : "Copy"}</span>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => confirmDelete(link)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Shared Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Share Type</Label>
              <Select value={newType} onValueChange={(val: any) => setNewType(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALBUM">Share an Album</SelectItem>
                  <SelectItem value="INDIVIDUAL">Share Individual Photos (Upload Later)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {newType === "ALBUM" && (
              <div className="space-y-2">
                <Label>Select Album</Label>
                <Select value={newAlbumId} onValueChange={setNewAlbumId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an album to share" />
                  </SelectTrigger>
                  <SelectContent>
                    {albums?.map(album => (
                      <SelectItem key={album.id} value={album.id}>{album.albumName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="desc">Description (Optional)</Label>
              <Input 
                id="desc" 
                value={newDescription} 
                onChange={(e) => setNewDescription(e.target.value)} 
                placeholder="e.g. Vacation photos for mom"
              />
            </div>

            <div className="space-y-3 pt-2">
              <Label>Permissions</Label>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow Downloads</Label>
                  <p className="text-xs text-muted-foreground">Viewers can download full-res photos</p>
                </div>
                <Switch checked={newAllowDownload} onCheckedChange={setNewAllowDownload} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow Uploads</Label>
                  <p className="text-xs text-muted-foreground">Viewers can add their own photos</p>
                </div>
                <Switch checked={newAllowUpload} onCheckedChange={setNewAllowUpload} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Show Metadata</Label>
                  <p className="text-xs text-muted-foreground">Show camera, location, and date info</p>
                </div>
                <Switch checked={newShowMetadata} onCheckedChange={setNewShowMetadata} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleCreate} 
              disabled={createMutation.isPending || (newType === "ALBUM" && !newAlbumId)}
            >
              {createMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Create Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Link?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this shared link? Anyone with the link will lose access immediately.
              Photos shared through this link will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
