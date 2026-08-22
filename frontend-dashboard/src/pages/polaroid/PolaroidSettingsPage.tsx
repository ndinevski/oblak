import { useState } from "react";
import { Link } from "react-router-dom";
import { 
  ChevronLeft, Key, Server, HardDrive, Plus, Trash2, Copy, Check, Image as ImageIcon, Video, ShieldAlert, Wifi
} from "lucide-react";
import { format } from "date-fns";
import {
  Button, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Input, Label, Skeleton, Alert, AlertTitle, AlertDescription, Spinner,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Progress
} from "@/components/ui";

import { 
  useServerInfo, useAssetStatistics, useApiKeys, useCreateApiKey, useDeleteApiKey
} from "@/hooks/usePolaroid";

export default function PolaroidSettingsPage() {
  const { data: serverInfo, isLoading: serverLoading } = useServerInfo();
  const { data: stats, isLoading: statsLoading } = useAssetStatistics();
  const { data: apiKeys, isLoading: keysLoading } = useApiKeys();
  
  const createKeyMutation = useCreateApiKey();
  const deleteKeyMutation = useDeleteApiKey();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;
    createKeyMutation.mutate(newKeyName, {
      onSuccess: (data) => {
        setCreatedSecret(data.secret);
      }
    });
  };

  const closeCreateDialog = () => {
    setCreateDialogOpen(false);
    setTimeout(() => {
      setNewKeyName("");
      setCreatedSecret(null);
    }, 300);
  };

  const copySecret = () => {
    if (createdSecret) {
      navigator.clipboard.writeText(createdSecret);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const confirmDeleteKey = (id: string) => {
    setKeyToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteKey = () => {
    if (keyToDelete) {
      deleteKeyMutation.mutate(keyToDelete, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setKeyToDelete(null);
        }
      });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/photos"><ChevronLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your Polaroid server and integrations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              <CardTitle>Server Information</CardTitle>
            </div>
            <CardDescription>Status and version of your Polaroid backend</CardDescription>
          </CardHeader>
          <CardContent>
            {serverLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : serverInfo ? (
              <div className="space-y-4 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Status</span>
                  <span className="flex items-center gap-1 font-medium text-green-500">
                    <Wifi className="w-4 h-4" /> Online
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Photos</span>
                  <span className="font-mono">{serverInfo.photos.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Videos</span>
                  <span className="font-mono">{serverInfo.videos.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>Could not connect to server.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-primary" />
              <CardTitle>Storage</CardTitle>
            </div>
            <CardDescription>Space used by your photos and videos</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : stats ? (
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2 text-sm">
                    <span className="font-medium">Total Items</span>
                    <span className="font-mono">{stats.total.toLocaleString()}</span>
                  </div>
                  <Progress value={100} className="h-2 bg-muted">
                    <div className="h-full bg-primary" style={{ width: '100%' }} />
                  </Progress>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Images</p>
                      <p className="font-semibold">{stats.images.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                      <Video className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Videos</p>
                      <p className="font-semibold">{stats.videos.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>Failed to load storage statistics.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start sm:items-center justify-between space-y-0">
          <div>
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              <CardTitle>API Keys</CardTitle>
            </div>
            <CardDescription className="mt-1">
              API keys allow external applications (like the Immich mobile app) to upload photos directly to your server.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> Create Key
          </Button>
        </CardHeader>
        <CardContent>
          {keysLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !apiKeys || apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg border-dashed">
              No API keys created yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(key.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => confirmDeleteKey(key.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={closeCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              {createdSecret ? "Your new API key has been created." : "Create a new API key for external integrations."}
            </DialogDescription>
          </DialogHeader>
          
          {createdSecret ? (
            <div className="space-y-4 py-4">
              <Alert className="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900">
                <ShieldAlert className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <AlertTitle className="text-orange-800 dark:text-orange-300">Copy this key now</AlertTitle>
                <AlertDescription className="text-orange-700 dark:text-orange-400">
                  For security reasons, it cannot be shown again.
                </AlertDescription>
              </Alert>
              
              <div className="flex items-center gap-2">
                <Input value={createdSecret} readOnly className="font-mono bg-muted" />
                <Button variant="outline" size="icon" onClick={copySecret}>
                  {copiedKey ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="keyName">Key Name</Label>
                <Input 
                  id="keyName" 
                  value={newKeyName} 
                  onChange={(e) => setNewKeyName(e.target.value)} 
                  placeholder="e.g. Mobile App"
                  autoFocus
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {createdSecret ? (
              <Button onClick={closeCreateDialog}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeCreateDialog}>Cancel</Button>
                <Button onClick={handleCreateKey} disabled={!newKeyName.trim() || createKeyMutation.isPending}>
                  {createKeyMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
                  Generate Key
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this API key? Any applications using it will immediately lose access to your server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteKey} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteKeyMutation.isPending}>
              {deleteKeyMutation.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
