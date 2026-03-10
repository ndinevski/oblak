import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';
import { AlertCircle, ArrowLeft, Globe, GlobeLock, Lock, Pencil } from 'lucide-react';
import { useBucket, useUpdateBucket } from '@/hooks/useStorage';
import type { BucketPolicy } from '@/lib/api/storage';
import { Spinner } from '@/components/ui/spinner';

const policyOptions: { value: BucketPolicy; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'private',
    label: 'Private',
    description: 'Only you can access objects',
    icon: <Lock className="h-5 w-5" />,
  },
  {
    value: 'public-read',
    label: 'Public Read',
    description: 'Anyone can view objects, only you can modify',
    icon: <GlobeLock className="h-5 w-5" />,
  },
  {
    value: 'public-read-write',
    label: 'Public Read/Write',
    description: 'Anyone can view and modify objects',
    icon: <Globe className="h-5 w-5" />,
  },
];

export default function EditBucketPage() {
  const { bucketId } = useParams<{ bucketId: string }>();
  const id = Number(bucketId);
  const navigate = useNavigate();

  const { data: bucket, isLoading, error } = useBucket(id);
  const updateBucket = useUpdateBucket();

  const [description, setDescription] = useState('');
  const [policy, setPolicy] = useState<BucketPolicy>('private');
  const [versioning, setVersioning] = useState(false);
  const [tags, setTags] = useState<Record<string, string>>({});
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');

  useEffect(() => {
    if (!bucket) return;

    setDescription(bucket.description || '');
    setPolicy(bucket.policy);
    setVersioning(bucket.versioning);
    setTags(bucket.tags || {});
  }, [bucket]);

  const addTag = () => {
    const key = newTagKey.trim();
    const value = newTagValue.trim();
    if (!key || !value) return;
    setTags((prev) => ({ ...prev, [key]: value }));
    setNewTagKey('');
    setNewTagValue('');
  };

  const removeTag = (key: string) => {
    setTags((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bucket) return;

    await updateBucket.mutateAsync({
      id: bucket.id,
      data: {
        description: description || undefined,
        policy,
        versioning,
        tags,
      },
    });

    navigate(`/storage/${bucket.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !bucket) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/storage')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Buckets
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Bucket not found or failed to load.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/storage/${bucket.id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Bucket
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Pencil className="h-7 w-7" />
          Edit Bucket
        </h1>
        <p className="text-muted-foreground">Editing: {bucket.name}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Bucket name cannot be changed after creation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Bucket Name</Label>
              <Input value={bucket.name} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                data-testid="bucket-edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              {Object.keys(tags).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(tags).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 p-2 bg-muted rounded">
                      <code className="flex-1 font-mono text-sm">{key}</code>
                      <code className="flex-1 font-mono text-sm text-muted-foreground truncate">
                        {value}
                      </code>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeTag(key)}>
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="key"
                  value={newTagKey}
                  onChange={(e) => setNewTagKey(e.target.value)}
                  className="font-mono"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Input
                  placeholder="value"
                  value={newTagValue}
                  onChange={(e) => setNewTagValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access & Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Policy</Label>
              <Select value={policy} onValueChange={(value) => setPolicy(value as BucketPolicy)}>
                <SelectTrigger className="max-w-sm pr-9" data-testid="bucket-edit-policy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {policyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {policyOptions.find((item) => item.value === policy)?.description}
              </p>
            </div>

            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="text-sm font-medium">Object Versioning</p>
                <p className="text-xs text-muted-foreground">Keep multiple versions of overwritten objects.</p>
              </div>
              <Switch checked={versioning} onCheckedChange={setVersioning} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => navigate(`/storage/${bucket.id}`)}>
            Cancel
          </Button>
          <Button type="submit" data-testid="bucket-edit-save" disabled={updateBucket.isPending}>
            {updateBucket.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
