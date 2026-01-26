import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle, 
  Button, 
  Input, 
  Label,
  Badge,
} from '@/components/ui';
import { 
  ArrowLeft, 
  Save, 
  Zap,
  AlertCircle,
  Plus,
  X,
} from 'lucide-react';
import { useFunction, useUpdateFunction, FunctionRuntime } from '@/hooks/useFunctions';
import { Spinner } from '@/components/ui/spinner';

/**
 * Runtime options
 */
const RUNTIMES: { value: FunctionRuntime; label: string; description: string }[] = [
  { value: 'nodejs20', label: 'Node.js 20', description: 'Latest LTS with ES2023 features' },
  { value: 'nodejs18', label: 'Node.js 18', description: 'Stable LTS version' },
  { value: 'python312', label: 'Python 3.12', description: 'Latest with improved performance' },
  { value: 'python311', label: 'Python 3.11', description: 'Stable with great error messages' },
  { value: 'dotnet8', label: '.NET 8', description: 'Latest LTS with AOT support' },
];

/**
 * Edit function page component
 */
export default function EditFunctionPage() {
  const { functionId } = useParams<{ functionId: string }>();
  const navigate = useNavigate();
  const { data: fn, isLoading, error } = useFunction(functionId);
  const updateFunction = useUpdateFunction();

  const [form, setForm] = useState({
    description: '',
    runtime: 'nodejs20' as FunctionRuntime,
    handler: 'index.handler',
    memoryMB: 128,
    timeoutSec: 30,
    environment: {} as Record<string, string>,
    tags: [] as string[],
    code: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');
  const [newTag, setNewTag] = useState('');

  // Populate form when function data loads
  useEffect(() => {
    if (fn) {
      setForm({
        description: fn.description || '',
        runtime: fn.runtime,
        handler: fn.handler,
        memoryMB: fn.memoryMB,
        timeoutSec: fn.timeoutSec,
        environment: fn.environment || {},
        tags: fn.tags || [],
        code: fn.code || '',
      });
    }
  }, [fn]);

  const updateForm = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const addEnvVar = () => {
    if (newEnvKey.trim() && newEnvValue.trim()) {
      updateForm('environment', { ...form.environment, [newEnvKey]: newEnvValue });
      setNewEnvKey('');
      setNewEnvValue('');
    }
  };

  const removeEnvVar = (key: string) => {
    const newEnv = { ...form.environment };
    delete newEnv[key];
    updateForm('environment', newEnv);
  };

  const addTag = () => {
    if (newTag.trim() && !form.tags.includes(newTag.trim())) {
      updateForm('tags', [...form.tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    updateForm('tags', form.tags.filter((t) => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fn) return;

    // Validate
    const newErrors: Record<string, string> = {};
    if (!form.code.trim()) {
      newErrors.code = 'Function code is required';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await updateFunction.mutateAsync({
        id: fn.id,
        data: {
          description: form.description || undefined,
          runtime: form.runtime,
          handler: form.handler,
          memoryMB: form.memoryMB,
          timeoutSec: form.timeoutSec,
          environment: Object.keys(form.environment).length > 0 ? form.environment : undefined,
          tags: form.tags.length > 0 ? form.tags : undefined,
          code: form.code,
        },
      });
      navigate(`/functions/${fn.id}`);
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !fn) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/functions')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Functions
        </Button>
        <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <span>Function not found or failed to load.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/functions/${fn.id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Function
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Zap className="h-8 w-8" />
          Edit Function
        </h1>
        <p className="text-muted-foreground">Editing: {fn.name}</p>
      </div>

      {/* Error Alert */}
      {updateFunction.error && (
        <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to update function. Please try again.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Function name cannot be changed after creation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Function Name</Label>
              <Input
                id="name"
                value={fn.name}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="A brief description of what this function does"
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2 flex-wrap mb-2">
                {form.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Runtime and resource settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Runtime</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {RUNTIMES.map((runtime) => (
                  <button
                    key={runtime.value}
                    type="button"
                    onClick={() => updateForm('runtime', runtime.value)}
                    className={`p-4 rounded-lg border-2 text-left transition-colors ${
                      form.runtime === runtime.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium">{runtime.label}</div>
                    <div className="text-sm text-muted-foreground">{runtime.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="handler">Handler</Label>
              <Input
                id="handler"
                value={form.handler}
                onChange={(e) => updateForm('handler', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="memory">Memory (MB)</Label>
                <Input
                  id="memory"
                  type="number"
                  min={64}
                  max={3008}
                  step={64}
                  value={form.memoryMB}
                  onChange={(e) => updateForm('memoryMB', parseInt(e.target.value) || 128)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout">Timeout (seconds)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min={1}
                  max={900}
                  value={form.timeoutSec}
                  onChange={(e) => updateForm('timeoutSec', parseInt(e.target.value) || 30)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Environment Variables */}
        <Card>
          <CardHeader>
            <CardTitle>Environment Variables</CardTitle>
            <CardDescription>Variables available to your function at runtime</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(form.environment).length > 0 && (
              <div className="space-y-2">
                {Object.entries(form.environment).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <code className="flex-1 font-mono text-sm">{key}</code>
                    <code className="flex-1 font-mono text-sm text-muted-foreground truncate">
                      {value}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEnvVar(key)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="KEY"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value.toUpperCase())}
                className="font-mono"
              />
              <Input
                placeholder="value"
                value={newEnvValue}
                onChange={(e) => setNewEnvValue(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={addEnvVar}>
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Code */}
        <Card>
          <CardHeader>
            <CardTitle>Function Code</CardTitle>
            <CardDescription>Your function's source code</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <textarea
              value={form.code}
              onChange={(e) => updateForm('code', e.target.value)}
              className={`w-full h-80 p-4 font-mono text-sm bg-muted rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-ring ${
                errors.code ? 'border-destructive' : ''
              }`}
              placeholder="Enter your function code..."
            />
            {errors.code && (
              <p className="text-sm text-destructive">{errors.code}</p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-between">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => navigate(`/functions/${fn.id}`)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={updateFunction.isPending}>
            {updateFunction.isPending ? (
              <>
                <Spinner className="h-4 w-4 mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
