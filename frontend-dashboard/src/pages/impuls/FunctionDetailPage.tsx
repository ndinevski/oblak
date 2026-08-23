import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  Button,
  Badge,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Input,
  Switch,
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
  Check,
  XCircle,
  RefreshCw,
  ChevronDown,
  Power,
  Copy,
} from 'lucide-react';
import {
  useFunction,
  useDeleteFunction,
  useInvokeFunction,
  useSetFunctionStatus,
  useFunctionLogs,
  useFunctionLogsRetention,
  useUpdateFunctionLogsRetention,
  FunctionData,
} from '@/hooks/useFunctions';
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
  functionName,
  canInvoke,
  onInvoked,
}: {
  functionId: number;
  functionName: string;
  canInvoke: boolean;
  onInvoked?: () => void;
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
        data: response,
      });
      // Refresh the invocation log list. The audit record is written
      // asynchronously (Impuls -> dashboard -> telemetry store), so refresh
      // shortly after as well to catch it once it lands.
      onInvoked?.();
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
          disabled={invokeFunction.isPending || !canInvoke}
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

        {!canInvoke && (
          <p className="text-sm text-muted-foreground">
            This function is inactive. Activate it to run test invocations.
          </p>
        )}

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
                {typeof result.data === 'string'
                  ? result.data
                  : JSON.stringify(result.data, null, 2)}
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
  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useFunctionLogs(fn?.id, 25);
  const { data: retentionPolicy, isLoading: retentionLoading } = useFunctionLogsRetention();
  const updateLogsRetention = useUpdateFunctionLogsRetention();
  const setFunctionStatus = useSetFunctionStatus();
  const deleteFunction = useDeleteFunction();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [useCustomRetention, setUseCustomRetention] = useState(false);
  const [customRetentionDays, setCustomRetentionDays] = useState('30');
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  useEffect(() => {
    if (!retentionPolicy) {
      return;
    }

    setUseCustomRetention(retentionPolicy.useCustomRetention);
    setCustomRetentionDays(String(retentionPolicy.customRetentionDays));
  }, [retentionPolicy]);

  const handleDelete = async () => {
    if (!fn) return;
    try {
      await deleteFunction.mutateAsync(fn.id);
      setDeleteDialogOpen(false);
      navigate('/functions');
    } catch {
      // Error handled by mutation
    }
  };

  const handleSaveRetention = async () => {
    const parsedDays = Number(customRetentionDays);

    await updateLogsRetention.mutateAsync({
      useCustomRetention,
      customRetentionDays: Number.isFinite(parsedDays) ? parsedDays : undefined,
    });

    refetchLogs();
  };

  const handleToggleActive = async () => {
    if (!fn) return;
    const nextStatus = fn.status === 'active' ? 'inactive' : 'active';
    await setFunctionStatus.mutateAsync({ id: fn.id, status: nextStatus });
  };

  const handleCopyEndpoint = async () => {
    await navigator.clipboard?.writeText(directInvokeEndpoint);
    setCopiedEndpoint(true);
    window.setTimeout(() => setCopiedEndpoint(false), 1500);
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
  const impulsBaseUrl = (import.meta.env.VITE_IMPULS_URL || 'http://localhost:8080').replace(/\/$/, '');
  const directInvokeEndpoint = `${impulsBaseUrl}/api/v1/functions/${encodeURIComponent(fn.name)}/invoke`;

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
          <Button
            variant="outline"
            onClick={() => void handleToggleActive()}
            disabled={setFunctionStatus.isPending}
          >
            {setFunctionStatus.isPending ? (
              <Spinner className="h-4 w-4 mr-2" />
            ) : (
              <Power className="h-4 w-4 mr-2" />
            )}
            {fn.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
          <Link to={`/functions/${fn.id}/edit`}>
            <Button variant="outline">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          <Button 
            variant="destructive" 
            onClick={() => setDeleteDialogOpen(true)}
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
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Direct Invoke Endpoint (Impuls)</CardTitle>
              <CardDescription>
                Call Impuls directly to invoke this function.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Input readOnly value={directInvokeEndpoint} />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void handleCopyEndpoint()}
                  aria-label="Copy invoke endpoint"
                >
                  {copiedEndpoint ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Method: POST • Body: JSON payload
              </p>
            </CardContent>
          </Card>

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
          <TestInvokePanel
            functionId={fn.id}
            functionName={fn.name}
            canInvoke={fn.status === 'active'}
            onInvoked={() => {
              // Refresh now and again after the async audit record lands.
              refetchLogs();
              window.setTimeout(() => refetchLogs(), 2500);
            }}
          />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Invocation Logs</CardTitle>
                  <CardDescription>
                    Latest execution logs for {fn.name}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner className="h-6 w-6" />
                </div>
              ) : logsData?.data?.length ? (
                <div className="space-y-4">
                  {logsData.data.map((entry) => (
                    <details key={entry.id} className="group rounded-lg border bg-card">
                      <summary className="list-none cursor-pointer px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {new Date(entry.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={entry.status === 'failure' ? 'destructive' : entry.status === 'pending' ? 'outline' : 'default'}
                              className="capitalize"
                            >
                              {entry.status}
                            </Badge>
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                          </div>
                        </div>
                      </summary>

                      <div className="border-t px-3 py-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {typeof entry.executionTimeMs === 'number' && (
                            <span>Duration: {entry.executionTimeMs}ms</span>
                          )}
                          {typeof entry.providerStatusCode === 'number' && (
                            <span>Provider status: {entry.providerStatusCode}</span>
                          )}
                        </div>

                        {entry.errorMessage && (
                          <p className="text-sm text-destructive">{entry.errorMessage}</p>
                        )}

                        {entry.response !== undefined && (
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Response</p>
                            <pre className="text-xs font-mono bg-muted p-3 rounded overflow-auto max-h-48">
                              {JSON.stringify(entry.response, null, 2)}
                            </pre>
                          </div>
                        )}

                        {entry.runtimeLogs && (entry.runtimeLogs.stdout.length > 0 || entry.runtimeLogs.stderr.length > 0) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">stdout</p>
                              <pre className="text-xs font-mono bg-muted p-3 rounded overflow-auto max-h-40">
                                {entry.runtimeLogs.stdout.length > 0
                                  ? entry.runtimeLogs.stdout.join('\n')
                                  : '(empty)'}
                              </pre>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">stderr</p>
                              <pre className="text-xs font-mono bg-muted p-3 rounded overflow-auto max-h-40">
                                {entry.runtimeLogs.stderr.length > 0
                                  ? entry.runtimeLogs.stderr.join('\n')
                                  : '(empty)'}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  No invocation logs yet. Invoke this function from the Test tab to generate logs.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Log Retention</CardTitle>
              <CardDescription>
                Default retention is 7 days. Enable custom retention only if you want to keep logs longer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Use custom retention period</p>
                  <p className="text-sm text-muted-foreground">
                    {retentionLoading
                      ? 'Loading retention policy...'
                      : `Effective retention: ${retentionPolicy?.effectiveRetentionDays ?? 7} days`}
                  </p>
                </div>
                <Switch
                  checked={useCustomRetention}
                  onCheckedChange={setUseCustomRetention}
                  disabled={retentionLoading || updateLogsRetention.isPending}
                />
              </div>

              {useCustomRetention && (
                <div className="grid gap-2 max-w-xs">
                  <label className="text-sm font-medium">Custom retention days</label>
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    value={customRetentionDays}
                    onChange={(e) => setCustomRetentionDays(e.target.value)}
                    disabled={updateLogsRetention.isPending}
                  />
                </div>
              )}

              <Button
                onClick={handleSaveRetention}
                disabled={retentionLoading || updateLogsRetention.isPending}
              >
                {updateLogsRetention.isPending ? (
                  <>
                    <Spinner className="h-4 w-4 mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save Retention Settings'
                )}
              </Button>
            </CardContent>
          </Card>

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
                  onClick={() => setDeleteDialogOpen(true)}
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Function</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{fn.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
