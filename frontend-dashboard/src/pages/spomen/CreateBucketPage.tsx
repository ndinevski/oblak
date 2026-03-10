import { useState } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle, 
  Button, 
  Input, 
  Label,
  Switch,
  Badge,
  Alert,
  AlertDescription,
} from '@/components/ui';
import { useNavigate } from 'react-router-dom';
import { Lock, Globe, GlobeLock, AlertCircle, Check, Database } from 'lucide-react';
import { useCreateBucket } from '@/hooks/useStorage';
import { validateBucketName, type BucketPolicy } from '@/lib/api/storage';

interface PolicyOption {
  value: BucketPolicy;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const policyOptions: PolicyOption[] = [
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

export default function CreateBucketPage() {
  const navigate = useNavigate();
  const createMutation = useCreateBucket();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [policy, setPolicy] = useState<BucketPolicy>('private');
  const [versioning, setVersioning] = useState(false);
  const [tags, setTags] = useState<Record<string, string>>({});
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');

  const nameValidation = name ? validateBucketName(name) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (nameValidation && !nameValidation.valid) return;

    try {
      const bucket = await createMutation.mutateAsync({
        name,
        description: description || undefined,
        policy,
        versioning,
        tags: Object.keys(tags).length > 0 ? tags : undefined,
      });
      navigate(`/storage/${bucket.id}`);
    } catch (error) {
      console.error('Failed to create bucket:', error);
    }
  };

  const addTag = () => {
    const key = newTagKey.trim();
    const value = newTagValue.trim();
    if (!key || !value) {
      return;
    }

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Bucket</h1>
        <p className="text-muted-foreground">Create a new storage bucket</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Basic Information
            </CardTitle>
            <CardDescription>Configure your new storage bucket</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Bucket Name *</Label>
              <Input
                id="name"
                placeholder="my-bucket"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                className={nameValidation && !nameValidation.valid ? 'border-destructive' : ''}
                data-testid="bucket-name-input"
              />
              <div className="min-h-5">
                {nameValidation && !nameValidation.valid && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {nameValidation.error}
                  </p>
                )}
                {nameValidation && nameValidation.valid && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Valid bucket name
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                3-63 characters, lowercase letters, numbers, hyphens, and periods only.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="A brief description of what this bucket is for..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-testid="bucket-description-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Tags (optional)</Label>

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
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  className="font-mono"
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

        {/* Access Policy */}
        <Card>
          <CardHeader>
            <CardTitle>Access Policy</CardTitle>
            <CardDescription>Control who can access your bucket</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {policyOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => setPolicy(option.value)}
                  className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                    policy === option.value
                      ? 'border-primary bg-muted'
                      : 'border-muted hover:border-muted-foreground/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={policy === option.value ? 'text-foreground' : 'text-muted-foreground'}>
                      {option.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{option.label}</span>
                        {policy === option.value && (
                          <Badge variant="secondary" className="text-xs">
                            Selected
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {policy !== 'private' && (
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {policy === 'public-read'
                    ? 'Objects in this bucket will be publicly accessible. Consider this carefully before storing sensitive data.'
                    : 'Anyone will be able to read AND modify objects in this bucket. This is generally not recommended.'}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Advanced Settings</CardTitle>
            <CardDescription>Optional advanced configurations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="versioning">Object Versioning</Label>
                <p className="text-sm text-muted-foreground">
                  Keep multiple versions of objects when they are overwritten
                </p>
              </div>
              <Switch
                id="versioning"
                checked={versioning}
                onCheckedChange={setVersioning}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Add tags in Basic Information section.
            </p>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={!name || (nameValidation && !nameValidation.valid) || createMutation.isPending}
            data-testid="bucket-create-submit"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Bucket'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/storage')}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
        </div>

        {createMutation.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {(createMutation.error as Error).message || 'Failed to create bucket'}
            </AlertDescription>
          </Alert>
        )}
      </form>
    </div>
  );
}
