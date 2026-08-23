/**
 * Image repositories.
 *
 * The registry side of Pristaniste: what has been pushed, how big it is, and how to
 * push more.
 */

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Package, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  usePristanisteHealth,
  usePristanisteRegistry,
  useCreateRepository,
  useDeleteImage,
  useDeleteRepository,
  useRepositories,
  useRepositoryImages,
} from '@/hooks/usePristaniste';
import {
  formatBytes,
  shortDigest,
  type PristanisteImage,
  type PristanisteRepository,
} from '@/lib/api/pristaniste';
import { PristanisteUnavailable } from './PristanisteUnavailable';

export default function RepositoriesPage() {
  const { toast } = useToast();
  const health = usePristanisteHealth();
  const registry = usePristanisteRegistry();
  const repositories = useRepositories();
  const removeRepository = useDeleteRepository();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PristanisteRepository | null>(null);

  if (health.data && health.data.status === 'unavailable') {
    return (
      <div className="space-y-6">
        <Heading />
        <PristanisteUnavailable health={health.data} />
      </div>
    );
  }

  const list = repositories.data ?? [];
  const totalSize = list.reduce((sum, r) => sum + r.size_bytes, 0);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await removeRepository.mutateAsync(confirmDelete.name);
      toast({ title: 'Repository deleted', description: confirmDelete.name });
    } catch (error) {
      toast({
        title: 'Could not delete the repository',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading />
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          New repository
        </Button>
      </div>

      {registry.data && <PushInstructions host={registry.data.host} />}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Repositories
            <span className="ml-2 font-normal text-muted-foreground">
              {list.length} · {formatBytes(totalSize)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.length === 0 && !repositories.isLoading ? (
            <div className="flex flex-col items-center gap-1 py-12 text-center">
              <Package className="mb-1 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No images pushed yet</p>
              <p className="text-xs text-muted-foreground/70">
                Push one with the command above to get started
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {list.map((repo) => (
                <RepositoryRow
                  key={repo.name}
                  repository={repo}
                  isExpanded={expanded === repo.name}
                  onToggle={() => setExpanded((p) => (p === repo.name ? null : repo.name))}
                  onDelete={() => setConfirmDelete(repo)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {creating && (
        <CreateRepositoryDialog
          open
          registryHost={registry.data?.host}
          onClose={() => setCreating(false)}
        />
      )}

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this repository?</AlertDialogTitle>
            <AlertDialogDescription>
              Every image in {confirmDelete?.name} will be removed
              {confirmDelete?.image_count ? ` (${confirmDelete.image_count} tags)` : ''}. Running
              containers already started from these images keep running. Disk space is reclaimed
              when the registry next runs garbage collection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PushInstructions({ host }: { host: string }) {
  const [copied, setCopied] = useState(false);
  const command = `docker tag my-app ${host}/my-app:v1 && docker push ${host}/my-app:v1`;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Push an image</p>
          <code className="block truncate font-mono text-xs">{command}</code>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => {
            navigator.clipboard?.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="ml-1.5">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </CardContent>
    </Card>
  );
}

function RepositoryRow({
  repository,
  isExpanded,
  onToggle,
  onDelete,
}: {
  repository: PristanisteRepository;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  // Images are only fetched when the row is opened: listing them costs the
  // registry a manifest read per tag.
  const images = useRepositoryImages(isExpanded ? repository.name : undefined);

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={isExpanded}
        >
          <span className="shrink-0 text-muted-foreground">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{repository.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{repository.uri}</p>
          </div>
        </button>

        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-sm tabular-nums">{repository.image_count} tags</p>
          <p className="text-xs text-muted-foreground">{formatBytes(repository.size_bytes)}</p>
        </div>

        {repository.latest_tag && (
          <Badge variant="outline" className="hidden shrink-0 text-[10px] md:inline-flex">
            {repository.latest_tag}
          </Badge>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          onClick={onDelete}
          aria-label={`Delete ${repository.name}`}
          title="Delete repository"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isExpanded && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 pl-11">
          {images.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading tags...</p>
          ) : images.data?.length ? (
            <div className="space-y-1">
              {images.data.map((img) => (
                <ImageRow key={img.tag} image={img} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No tags in this repository</p>
          )}
        </div>
      )}
    </div>
  );
}

function ImageRow({ image }: { image: PristanisteImage }) {
  const { toast } = useToast();
  const removeImage = useDeleteImage();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    try {
      await removeImage.mutateAsync({ repository: image.repository, tag: image.tag });
      toast({
        title: 'Image deleted',
        description: image.shared_tags?.length
          ? `${image.tag} and ${image.shared_tags.length} tag(s) sharing its digest`
          : `${image.repository}:${image.tag}`,
      });
    } catch (error) {
      toast({
        title: 'Could not delete the image',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 text-sm">
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {image.tag}
        </Badge>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {shortDigest(image.digest)}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatBytes(image.size_bytes)}
        </span>
        {image.architecture && (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {image.os}/{image.architecture}
          </span>
        )}
        {/* Tags sharing a digest go together, so say so before it happens. */}
        {image.shared_tags?.length ? (
          <span className="truncate text-xs text-amber-600 dark:text-amber-400">
            shares digest with {image.shared_tags.join(', ')}
          </span>
        ) : null}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${image.repository}:${image.tag}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {image.repository}:{image.tag}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {image.shared_tags?.length ? (
                <>
                  The registry deletes by digest, not by tag, so{' '}
                  <strong>{image.shared_tags.join(', ')}</strong> will be removed with it.
                </>
              ) : (
                'This image will be removed from the registry.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CreateRepositoryDialog({
  open,
  registryHost,
  onClose,
}: {
  open: boolean;
  registryHost?: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateRepository();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const submit = async () => {
    try {
      await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined });
      toast({
        title: 'Repository declared',
        description: `Push to ${registryHost}/${name.trim()} to populate it`,
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Could not create the repository',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New repository</DialogTitle>
          <DialogDescription>
            A repository becomes real on the first push. This reserves the name and checks it is
            valid.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="repo-name">Name</Label>
            <Input
              id="repo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-app"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, digits, and <code>.</code> <code>_</code> <code>-</code>
              separators. Use <code>/</code> for a namespace, as in <code>team/my-app</code>.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="repo-description">Description</Label>
            <Input
              id="repo-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this image is for"
            />
          </div>

          {name.trim() && registryHost && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Push to</p>
              <code className={cn('block break-all font-mono text-xs')}>
                {registryHost}/{name.trim()}:v1
              </code>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || !name.trim()}>
            {create.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Heading() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Registar Repositories</h1>
      <p className="text-muted-foreground">Container images in your private registry</p>
    </div>
  );
}
