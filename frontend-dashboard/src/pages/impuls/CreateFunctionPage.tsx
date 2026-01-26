import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ArrowRight, 
  Check, 
  Zap,
  AlertCircle,
  Plus,
  X,
} from 'lucide-react';
import { useCreateFunction, FunctionRuntime } from '@/hooks/useFunctions';
import { Spinner } from '@/components/ui/spinner';

/**
 * Step indicator component
 */
function StepIndicator({ 
  steps, 
  currentStep 
}: { 
  steps: string[]; 
  currentStep: number;
}) {
  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center">
          <div className={`
            flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
            ${index < currentStep 
              ? 'bg-primary text-primary-foreground' 
              : index === currentStep 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted text-muted-foreground'
            }
          `}>
            {index < currentStep ? <Check className="h-4 w-4" /> : index + 1}
          </div>
          <span className={`ml-2 text-sm ${
            index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
          }`}>
            {step}
          </span>
          {index < steps.length - 1 && (
            <div className={`w-12 h-0.5 mx-4 ${
              index < currentStep ? 'bg-primary' : 'bg-muted'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

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

const STEPS = ['Basic Info', 'Configuration', 'Environment', 'Code'];

/**
 * Default code templates
 */
const CODE_TEMPLATES: Record<string, string> = {
  nodejs20: `exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event));
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello from Node.js!' }),
  };
};`,
  nodejs18: `exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event));
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello from Node.js!' }),
  };
};`,
  python312: `def handler(event, context):
    print(f"Event: {event}")
    
    return {
        "statusCode": 200,
        "body": {"message": "Hello from Python!"}
    }`,
  python311: `def handler(event, context):
    print(f"Event: {event}")
    
    return {
        "statusCode": 200,
        "body": {"message": "Hello from Python!"}
    }`,
  dotnet8: `using System.Text.Json;

public class Function
{
    public object Handler(object input, object context)
    {
        Console.WriteLine($"Event: {JsonSerializer.Serialize(input)}");
        
        return new { 
            statusCode = 200, 
            body = new { message = "Hello from .NET!" } 
        };
    }
}`,
};

/**
 * Form state type
 */
interface FormState {
  name: string;
  description: string;
  runtime: FunctionRuntime;
  handler: string;
  memoryMB: number;
  timeoutSec: number;
  environment: Record<string, string>;
  tags: string[];
  code: string;
}

const initialFormState: FormState = {
  name: '',
  description: '',
  runtime: 'nodejs20',
  handler: 'index.handler',
  memoryMB: 128,
  timeoutSec: 30,
  environment: {},
  tags: [],
  code: CODE_TEMPLATES.nodejs20,
};

/**
 * Create function page component
 */
export default function CreateFunctionPage() {
  const navigate = useNavigate();
  const createFunction = useCreateFunction();
  
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');
  const [newTag, setNewTag] = useState('');

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateStep = (stepIndex: number): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};

    if (stepIndex === 0) {
      if (!form.name.trim()) {
        newErrors.name = 'Function name is required';
      } else if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(form.name) && form.name.length > 1) {
        newErrors.name = 'Name must start with a letter, contain only lowercase letters, numbers, and hyphens';
      } else if (form.name.length < 2) {
        newErrors.name = 'Name must be at least 2 characters';
      }
    }

    if (stepIndex === 3) {
      if (!form.code.trim()) {
        newErrors.code = 'Function code is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleRuntimeChange = (runtime: FunctionRuntime) => {
    updateForm('runtime', runtime);
    // Update handler based on runtime
    if (runtime.startsWith('python')) {
      updateForm('handler', 'main.handler');
    } else if (runtime.startsWith('dotnet')) {
      updateForm('handler', 'Function::Handler');
    } else {
      updateForm('handler', 'index.handler');
    }
    // Update code template
    updateForm('code', CODE_TEMPLATES[runtime] || CODE_TEMPLATES.nodejs20);
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

  const handleSubmit = async () => {
    if (!validateStep(step)) return;

    try {
      await createFunction.mutateAsync({
        name: form.name,
        description: form.description || undefined,
        runtime: form.runtime,
        handler: form.handler,
        memoryMB: form.memoryMB,
        timeoutSec: form.timeoutSec,
        environment: Object.keys(form.environment).length > 0 ? form.environment : undefined,
        tags: form.tags.length > 0 ? form.tags : undefined,
        code: form.code,
      });
      navigate('/functions');
    } catch {
      // Error is handled by mutation state
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/functions')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Functions
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Zap className="h-8 w-8" />
          Create Function
        </h1>
        <p className="text-muted-foreground">Deploy a new serverless function</p>
      </div>

      {/* Step Indicator */}
      <StepIndicator steps={STEPS} currentStep={step} />

      {/* Error Alert */}
      {createFunction.error && (
        <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to create function. Please try again.</span>
        </div>
      )}

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>
            {step === 0 && 'Enter the basic information for your function'}
            {step === 1 && 'Configure runtime and resource settings'}
            {step === 2 && 'Add environment variables for your function'}
            {step === 3 && 'Write or paste your function code'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Basic Info */}
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Function Name *</Label>
                <Input
                  id="name"
                  placeholder="my-function"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value.toLowerCase())}
                  className={errors.name ? 'border-destructive' : ''}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Lowercase letters, numbers, and hyphens only. Must start with a letter.
                </p>
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
                      <button onClick={() => removeTag(tag)}>
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
            </>
          )}

          {/* Step 2: Configuration */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Runtime *</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {RUNTIMES.map((runtime) => (
                    <button
                      key={runtime.value}
                      type="button"
                      onClick={() => handleRuntimeChange(runtime.value)}
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
                <p className="text-sm text-muted-foreground">
                  The entry point for your function (e.g., index.handler)
                </p>
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
            </>
          )}

          {/* Step 3: Environment */}
          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>Environment Variables</Label>
                <p className="text-sm text-muted-foreground">
                  Add environment variables that will be available to your function at runtime.
                </p>
              </div>

              {Object.entries(form.environment).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(form.environment).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 p-2 bg-muted rounded">
                      <code className="flex-1 font-mono text-sm">{key}</code>
                      <code className="flex-1 font-mono text-sm text-muted-foreground truncate">
                        {value}
                      </code>
                      <Button
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
            </>
          )}

          {/* Step 4: Code */}
          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="code">Function Code *</Label>
                <textarea
                  id="code"
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
              </div>
            </>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={step === 0 ? () => navigate('/functions') : handleBack}
            >
              {step === 0 ? 'Cancel' : (
                <>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </>
              )}
            </Button>

            {step < STEPS.length - 1 ? (
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={createFunction.isPending}>
                {createFunction.isPending ? (
                  <>
                    <Spinner className="h-4 w-4 mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Create Function
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
