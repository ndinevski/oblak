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
  Textarea,
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
  color: string;
}

const policyOptions: PolicyOption[] = [
  {
    value: 'private',
    label: 'Private',
    description: 'Only you can access objects',
    icon: <Lock className="h-5 w-5" />,
    color: 'border-green-500 bg-green-50',
  },
  {
    value: 'public-read',
    label: 'Public Read',
    description: 'Anyone can view objects, only you can modify',
    icon: <GlobeLock className="h-5 w-5" />,
    color: 'border-yellow-500 bg-yellow-50',
  },
  {
    value: 'public-read-write',
    label: 'Public Read/Write',
    description: 'Anyone can view and modify objects',
    icon: <Globe className="h-5 w-5" />,
    color: 'border-red-500 bg-red-50',
  },
];

export default function CreateBucketPage() {
  const navigate = useNavigate();
  const createMutation = useCreateBucket();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [policy, setPolicy] = useState<BucketPolicy>('private');
  const [versioning, setVersioning] = useState(false);
  const [tags, setTags] = useState('');

  const nameValidation = name ? validateBucketName(name) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (nameValidation && !nameValidation.valid) return;

    // Parse tags
    const parsedTags: Record<string, string> = {};
    if (tags.trim()) {
      tags.split('\n').forEach((line) => {
        const [key, value] = line.split('=').map((s) => s.trim());
        if (key && value) {
          parsedTags[key] = value;
        }
      });
    }

    try {
      const bucket = await createMutation.mutateAsync({
        name,
        description: description || undefined,
        policy,
        versioning,
        tags: Object.keys(parsedTags).length > 0 ? parsedTags : undefined,
      });
      navigate(`/storage/${bucket.id}`);
    } catch (error) {
      console.error('Failed to create bucket:', error);
    }
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
              />
              {nameValidation && !nameValidation.valid && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {nameValidation.error}
                </p>
              )}
              {nameValidation && nameValidation.valid && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Valid bucket name
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                3-63 characters, lowercase letters, numbers, hyphens, and periods only.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="A brief description of what this bucket is for..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
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
                      ? option.color + ' border-2'
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

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (optional)</Label>
              <Textarea
                id="tags"
                placeholder="environment=production&#10;project=myapp"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                One tag per line in key=value format
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={!name || (nameValidation && !nameValidation.valid) || createMutation.isPending}
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
