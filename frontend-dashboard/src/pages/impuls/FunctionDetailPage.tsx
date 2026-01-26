import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  Button,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Play,
  Zap,
  Clock,
  HardDrive,
  Activity,
  Code,
  Settings,
  Terminal,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useFunction, useDeleteFunction, useInvokeFunction, FunctionData } from '@/hooks/useFunctions';
import { Spinner } from '@/components/ui/spinner';
import { formatDistanceToNow } from 'date-fns';

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: FunctionData['status'] }) {
  const config: Record<FunctionData['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    active: { variant: 'default', icon: <CheckCircle className="h-3 w-3 mr-1" /> },
    inactive: { variant: 'secondary', icon: null },
    deploying: { variant: 'outline', icon: <Spinner className="h-3 w-3 mr-1" /> },
    error: { variant: 'destructive', icon: <XCircle className="h-3 w-3 mr-1" /> },
  };

  return (
    <Badge variant={config[status].variant} className="capitalize">
      {config[status].icon}
      {status}
    </Badge>
  );
}

/**
 * Stat card component
 */
function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  description 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number; 
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Test invoke panel component
 */
function TestInvokePanel({ 
  functionId, 
  functionName 
}: { 
  functionId: number; 
  functionName: string;
}) {
  const invokeFunction = useInvokeFunction();
  const [payload, setPayload] = useState('{\n  "message": "Hello, World!"\n}');
  const [result, setResult] = useState<{
    success: boolean;
    data?: unknown;
    error?: string;
    executionTime?: number;
    logs?: string[];
  } | null>(null);

  const handleInvoke = async () => {
    setResult(null);
    try {
      const parsedPayload = payload.trim() ? JSON.parse(payload) : {};
      const response = await invokeFunction.mutateAsync({
        id: functionId,
        request: { payload: parsedPayload },
      });
      setResult({
        success: true,
        data: response.result,
        executionTime: response.execution_time_ms,
        logs: response.logs,
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        setResult({ success: false, error: 'Invalid JSON payload' });
      } else {
        setResult({ success: false, error: 'Function invocation failed' });
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          Test Function
        </CardTitle>
        <CardDescription>
          Send a test request to {functionName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Request Payload (JSON)</label>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            className="w-full h-32 p-3 font-mono text-sm bg-muted rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder='{"key": "value"}'
          />
        </div>

        <Button 
          onClick={handleInvoke} 
          disabled={invokeFunction.isPending}
          className="w-full"
        >
          {invokeFunction.isPending ? (
            <>
              <Spinner className="h-4 w-4 mr-2" />
              Invoking...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Invoke Function
            </>
          )}
        </Button>

        {result && (
          <div className={`p-4 rounded-lg ${
            result.success ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {result.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span className={`font-medium ${
                result.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
              }`}>
                {result.success ? 'Success' : 'Error'}
              </span>
              {result.executionTime !== undefined && (
                <span className="text-sm text-muted-foreground ml-auto">
                  {result.executionTime}ms
                </span>
              )}
            </div>

            {result.data !== undefined && (
              <pre className="text-sm font-mono overflow-auto max-h-48 p-2 bg-background rounded">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            )}

            {result.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
            )}

            {result.logs && result.logs.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm font-medium mb-1">Logs:</p>
                <pre className="text-xs font-mono bg-background p-2 rounded overflow-auto max-h-32">
                  {result.logs.join('\n')}
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Function detail page component
 */
export default function FunctionDetailPage() {
  const { functionId } = useParams<{ functionId: string }>();
  const navigate = useNavigate();
  const { data: fn, isLoading, error } = useFunction(functionId);
  const deleteFunction = useDeleteFunction();

  const handleDelete = async () => {
    if (!fn) return;
    if (window.confirm(`Are you sure you want to delete "${fn.name}"? This cannot be undone.`)) {
      try {
        await deleteFunction.mutateAsync(fn.id);
        navigate('/functions');
      } catch {
        // Error handled by mutation
      }
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

  const runtimeLabels: Record<string, string> = {
    nodejs20: 'Node.js 20',
    nodejs18: 'Node.js 18',
    python312: 'Python 3.12',
    python311: 'Python 3.11',
    python310: 'Python 3.10',
    dotnet8: '.NET 8',
    dotnet7: '.NET 7',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/functions')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">{fn.name}</h1>
            <StatusBadge status={fn.status} />
          </div>
          {fn.description && (
            <p className="text-muted-foreground mt-1">{fn.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>Created {formatDistanceToNow(new Date(fn.createdAt), { addSuffix: true })}</span>
            <span>•</span>
            <span>Updated {formatDistanceToNow(new Date(fn.updatedAt), { addSuffix: true })}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Link to={`/functions/${fn.id}/edit`}>
            <Button variant="outline">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          <Button 
            variant="destructive" 
            onClick={handleDelete}
            disabled={deleteFunction.isPending}
          >
            {deleteFunction.isPending ? (
              <Spinner className="h-4 w-4 mr-2" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label="Invocations"
          value={Number(fn.invocationCount).toLocaleString()}
          description="Total executions"
        />
        <StatCard
          icon={Clock}
          label="Timeout"
          value={`${fn.timeoutSec}s`}
          description="Max execution time"
        />
        <StatCard
          icon={HardDrive}
          label="Memory"
          value={`${fn.memoryMB} MB`}
          description="Allocated memory"
        />
        <StatCard
          icon={Code}
          label="Runtime"
          value={runtimeLabels[fn.runtime] || fn.runtime}
          description={fn.handler}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Runtime</p>
                    <p className="font-medium">{runtimeLabels[fn.runtime] || fn.runtime}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Handler</p>
                    <p className="font-medium font-mono">{fn.handler}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Memory</p>
                    <p className="font-medium">{fn.memoryMB} MB</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Timeout</p>
                    <p className="font-medium">{fn.timeoutSec} seconds</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Environment Variables */}
            <Card>
              <CardHeader>
                <CardTitle>Environment Variables</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(fn.environment || {}).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(fn.environment).map(([key]) => (
                      <div key={key} className="flex justify-between p-2 bg-muted rounded">
                        <code className="font-mono text-sm">{key}</code>
                        <code className="font-mono text-sm text-muted-foreground">
                          ••••••
                        </code>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No environment variables configured.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tags */}
          {fn.tags && fn.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  {fn.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="code">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Function Code
              </CardTitle>
              <CardDescription>
                Handler: {fn.handler}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {fn.code ? (
                <pre className="p-4 bg-muted rounded-lg overflow-auto max-h-[500px] font-mono text-sm">
                  {fn.code}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Code is not available for viewing.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test">
          <TestInvokePanel functionId={fn.id} functionName={fn.name} />
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
              <CardDescription>
                Irreversible and destructive actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 border border-destructive rounded-lg">
                <div>
                  <h4 className="font-medium">Delete this function</h4>
                  <p className="text-sm text-muted-foreground">
                    Once deleted, this function cannot be recovered.
                  </p>
                </div>
                <Button 
                  variant="destructive" 
                  onClick={handleDelete}
                  disabled={deleteFunction.isPending}
                >
                  {deleteFunction.isPending ? (
                    <Spinner className="h-4 w-4 mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete Function
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
