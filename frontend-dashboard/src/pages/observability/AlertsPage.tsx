/**
 * Alerts.
 *
 * Threshold rules evaluated against the telemetry store, with their current
 * state, the history of every state change, and a form for editing them.
 */

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  BellOff,
  BellRing,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatTile } from '@/components/observability/charts';
import { EmptyState, TelemetryUnavailable } from '@/components/observability/controls';
import { useTelemetryHealth } from '@/hooks/useTelemetry';
import {
  useAlertHistory,
  useAlertRuleTypes,
  useAlertRules,
  useCreateAlertRule,
  useDeleteAlertRule,
  useEvaluateAlerts,
  useMuteAlertRule,
  useTestAlertRule,
  useUpdateAlertRule,
} from '@/hooks/useAlerts';
import {
  alertStateClass,
  alertStateLabel,
  formatAlertValue,
  type AlertRule,
  type AlertRuleInput,
  type AlertRuleType,
  type AlertState,
} from '@/lib/api/alerts';
import { formatTimestamp } from '@/lib/api/telemetry';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const EMPTY_FORM: AlertRuleInput = {
  name: '',
  description: '',
  enabled: true,
  ruleType: 'service.error_rate',
  target: '',
  comparison: 'gt',
  threshold: 5,
  windowMinutes: 5,
  forMinutes: 0,
  severity: 'warning',
  notifyWebhook: '',
  notifyEmail: '',
  notifyCooldownMinutes: 0,
};

export default function AlertsPage() {
  const { toast } = useToast();
  const health = useTelemetryHealth();
  const rules = useAlertRules();
  const types = useAlertRuleTypes();
  const history = useAlertHistory(24);
  const evaluate = useEvaluateAlerts();
  const removeRule = useDeleteAlertRule();
  const muteRule = useMuteAlertRule();

  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AlertRule | null>(null);

  const typeByValue = useMemo(
    () => new Map((types.data ?? []).map((t) => [t.value, t])),
    [types.data]
  );

  if (health.data && (!health.data.configured || !health.data.reachable)) {
    return (
      <div className="space-y-4">
        <Heading />
        <TelemetryUnavailable configured={health.data.configured} error={health.data.error} />
      </div>
    );
  }

  const meta = rules.data?.meta;
  const list = rules.data?.rules ?? [];

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await removeRule.mutateAsync(confirmDelete.id);
      toast({ title: 'Alert rule deleted', description: confirmDelete.name });
    } catch (error) {
      toast({
        title: 'Could not delete the rule',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const result = await evaluate.mutateAsync();
              toast({
                title: 'Evaluation complete',
                description: `${result.evaluated} rules checked, ${result.firing} firing`,
              });
            }}
            disabled={evaluate.isPending}
          >
            <RefreshCw className={cn('mr-2 h-3.5 w-3.5', evaluate.isPending && 'animate-spin')} />
            Evaluate now
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            New rule
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Firing"
          value={String(meta?.firing ?? 0)}
          tone={meta?.firing ? 'critical' : 'good'}
          icon={<AlertCircle className="h-4 w-4" />}
        />
        <StatTile
          label="Pending"
          value={String(meta?.pending ?? 0)}
          tone={meta?.pending ? 'warning' : 'default'}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatTile
          label="Unknown"
          value={String(meta?.unknown ?? 0)}
          hint="no data or not yet evaluated"
          icon={<HelpCircle className="h-4 w-4" />}
        />
        <StatTile
          label="Total rules"
          value={String(meta?.total ?? 0)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Rules</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.length === 0 && !rules.isLoading ? (
            <EmptyState
              message="No alert rules yet"
              hint="Create one to be told when a threshold is crossed"
            />
          ) : (
            <div className="divide-y divide-border">
              {list.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  unit={typeByValue.get(rule.ruleType)?.unit ?? ''}
                  onEdit={() => setEditing(rule)}
                  onDelete={() => setConfirmDelete(rule)}
                  onMute={async (minutes) => {
                    await muteRule.mutateAsync({ id: rule.id, minutes });
                    toast({
                      title: minutes ? 'Alert silenced' : 'Silence lifted',
                      description: minutes
                        ? `${rule.name} will not notify for ${describeMinutes(minutes)}`
                        : rule.name,
                    });
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent state changes</CardTitle>
          <p className="text-xs text-muted-foreground">
            Read from the telemetry store, so it expires with the same retention
          </p>
        </CardHeader>
        <CardContent>
          {history.data?.length ? (
            <div className="max-h-[340px] space-y-1.5 overflow-y-auto">
              {history.data.map((entry, i) => (
                <div
                  key={`${entry.timestampMs}-${entry.rule}-${i}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn('shrink-0 text-[10px]', alertStateClass(entry.state, entry.severity))}
                    >
                      {alertStateLabel(entry.state)}
                    </Badge>
                    <span className="truncate">{entry.rule}</span>
                    {entry.target && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {entry.target}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatTimestamp(entry.timestampMs)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No alert state changes in the last 24 hours" />
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <RuleDialog
          open
          rule={editing}
          types={types.data ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this alert rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.name} will stop being evaluated. Its past state changes stay in
              the telemetry store until they age out.
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

const MUTE_DURATIONS = [
  { minutes: 60, label: '1 hour' },
  { minutes: 4 * 60, label: '4 hours' },
  { minutes: 24 * 60, label: '24 hours' },
  { minutes: 7 * 24 * 60, label: '7 days' },
];

function describeMinutes(minutes: number): string {
  return MUTE_DURATIONS.find((d) => d.minutes === minutes)?.label ?? `${minutes} minutes`;
}

function RuleRow({
  rule,
  unit,
  onEdit,
  onDelete,
  onMute,
}: {
  rule: AlertRule;
  unit: string;
  onEdit: () => void;
  onDelete: () => void;
  onMute: (minutes: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <StateBadge state={rule.state} severity={rule.severity} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('truncate font-medium', !rule.enabled && 'text-muted-foreground')}>
            {rule.name}
          </span>
          {!rule.enabled && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Disabled
            </Badge>
          )}
          {rule.severity === 'critical' && (
            <Badge variant="outline" className="border-red-500/20 text-[10px] text-red-600 dark:text-red-400">
              Critical
            </Badge>
          )}
          {/* Muted is distinct from disabled: the rule still evaluates and
              still shows its state, it just does not notify. */}
          {rule.isMuted && (
            <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
              <BellOff className="h-3 w-3" />
              Silenced
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{rule.condition}</p>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-sm tabular-nums">{formatAlertValue(rule.lastValue, unit)}</p>
        {rule.lastEvaluatedAt && (
          <p className="text-[11px] text-muted-foreground">
            {new Date(rule.lastEvaluatedAt).toLocaleTimeString()}
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-1">
        {rule.isMuted ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onMute(null)}
            aria-label={`Lift silence on ${rule.name}`}
            title="Lift silence"
          >
            <BellRing className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label={`Silence ${rule.name}`}
                title="Silence notifications"
              >
                <BellOff className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Silence notifications</DropdownMenuLabel>
              {MUTE_DURATIONS.map((d) => (
                <DropdownMenuItem key={d.minutes} onClick={() => onMute(d.minutes)}>
                  For {d.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onEdit} aria-label={`Edit ${rule.name}`}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onDelete} aria-label={`Delete ${rule.name}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** State is always an icon plus a word, never colour alone. */
function StateBadge({ state, severity }: { state: AlertState; severity?: 'warning' | 'critical' }) {
  const Icon =
    state === 'firing'
      ? AlertCircle
      : state === 'pending'
        ? AlertTriangle
        : state === 'ok'
          ? CheckCircle2
          : HelpCircle;

  return (
    <Badge
      variant="outline"
      className={cn('shrink-0 gap-1 text-[10px]', alertStateClass(state, severity))}
    >
      <Icon className="h-3 w-3" />
      {alertStateLabel(state)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------

function RuleDialog({
  open,
  rule,
  types,
  onClose,
}: {
  open: boolean;
  rule: AlertRule | null;
  types: AlertRuleType[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateAlertRule();
  const update = useUpdateAlertRule();
  const test = useTestAlertRule();

  const [form, setForm] = useState<AlertRuleInput>(() =>
    rule
      ? {
          name: rule.name,
          description: rule.description ?? '',
          enabled: rule.enabled,
          ruleType: rule.ruleType,
          target: rule.target ?? '',
          comparison: rule.comparison,
          threshold: rule.threshold,
          windowMinutes: rule.windowMinutes,
          forMinutes: rule.forMinutes,
          severity: rule.severity,
          notifyWebhook: rule.notifyWebhook ?? '',
          notifyEmail: rule.notifyEmail ?? '',
          notifyCooldownMinutes: rule.notifyCooldownMinutes ?? 0,
        }
      : EMPTY_FORM
  );

  const meta = types.find((t) => t.value === form.ruleType);
  const saving = create.isPending || update.isPending;

  const set = <K extends keyof AlertRuleInput>(key: K, value: AlertRuleInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    // Empty optional strings are sent as undefined so the backend stores null
    // rather than an empty string that later looks like a configured channel.
    const payload: AlertRuleInput = {
      ...form,
      target: form.target?.trim() || undefined,
      description: form.description?.trim() || undefined,
      notifyWebhook: form.notifyWebhook?.trim() || undefined,
      notifyEmail: form.notifyEmail?.trim() || undefined,
    };

    try {
      if (rule) {
        await update.mutateAsync({ id: rule.id, input: payload });
        toast({ title: 'Alert rule updated', description: payload.name });
      } else {
        await create.mutateAsync(payload);
        toast({ title: 'Alert rule created', description: payload.name });
      }
      onClose();
    } catch (error) {
      const issues = (error as { details?: { issues?: Array<{ message: string }> } })?.details
        ?.issues;
      toast({
        title: rule ? 'Could not update the rule' : 'Could not create the rule',
        description:
          issues?.map((i) => i.message).join('; ') ||
          (error instanceof Error ? error.message : 'Unknown error'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit alert rule' : 'New alert rule'}</DialogTitle>
          <DialogDescription>
            Rules are evaluated against the telemetry store on the backend's timer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="alert-name">Name</Label>
            <Input
              id="alert-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Impuls error rate high"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alert-type">Condition</Label>
            <Select value={form.ruleType} onValueChange={(v) => set('ruleType', v)}>
              <SelectTrigger id="alert-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {meta && <p className="text-xs text-muted-foreground">{meta.description}</p>}
          </div>

          {meta?.targetLabel && (
            <div className="space-y-1.5">
              <Label htmlFor="alert-target">
                {meta.targetLabel}
                {meta.targetOptional && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    (blank means any)
                  </span>
                )}
              </Label>
              <Input
                id="alert-target"
                value={form.target ?? ''}
                onChange={(e) => set('target', e.target.value)}
                placeholder={meta.targetOptional ? 'Any' : 'Required'}
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="alert-comparison">Trigger when</Label>
              <Select
                value={form.comparison}
                onValueChange={(v) => set('comparison', v as 'gt' | 'lt')}
              >
                <SelectTrigger id="alert-comparison">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gt">Above</SelectItem>
                  <SelectItem value="lt">Below</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-threshold">
                Threshold{meta?.unit ? ` (${meta.unit})` : ''}
              </Label>
              <Input
                id="alert-threshold"
                type="number"
                value={form.threshold}
                onChange={(e) => set('threshold', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-severity">Severity</Label>
              <Select
                value={form.severity}
                onValueChange={(v) => set('severity', v as 'warning' | 'critical')}
              >
                <SelectTrigger id="alert-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="alert-window">Measure over (minutes)</Label>
              <Input
                id="alert-window"
                type="number"
                min={1}
                max={1440}
                value={form.windowMinutes}
                onChange={(e) => set('windowMinutes', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-for">Sustained for (minutes)</Label>
              <Input
                id="alert-for"
                type="number"
                min={0}
                max={1440}
                value={form.forMinutes}
                onChange={(e) => set('forMinutes', Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                0 fires immediately. Higher values suppress brief spikes.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="alert-webhook">Webhook URL</Label>
              <Input
                id="alert-webhook"
                value={form.notifyWebhook ?? ''}
                onChange={(e) => set('notifyWebhook', e.target.value)}
                placeholder="https://hooks.example.com/oblak"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-email">Notification email</Label>
              <Input
                id="alert-email"
                value={form.notifyEmail ?? ''}
                onChange={(e) => set('notifyEmail', e.target.value)}
                placeholder="ops@example.com"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alert-cooldown">Minimum gap between notifications (minutes)</Label>
            <Input
              id="alert-cooldown"
              type="number"
              min={0}
              max={1440}
              value={form.notifyCooldownMinutes ?? 0}
              onChange={(e) => set('notifyCooldownMinutes', Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Damps a rule that oscillates around its threshold. 0 notifies on every
              transition. Recovery notifications are never held back.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Leave the webhook and email blank to have the alert appear in the dashboard only.
            Notifications are sent on transitions into and out of firing, never on every
            evaluation.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="alert-description">Description</Label>
            <Textarea
              id="alert-description"
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              placeholder="What this alert means and what to do about it"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="alert-enabled"
              checked={form.enabled ?? true}
              onCheckedChange={(v) => set('enabled', v)}
            />
            <Label htmlFor="alert-enabled">Enabled</Label>
          </div>

          {/* Testing before saving turns "did I pick a sane threshold" from a
              guess into an observation. */}
          {test.data && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium">
                Current value: {formatAlertValue(test.data.value, meta?.unit ?? '')}
              </p>
              <p className="text-xs text-muted-foreground">
                {test.data.error
                  ? test.data.error
                  : test.data.wouldFire
                    ? 'This rule would be triggering right now.'
                    : 'This rule would be quiet right now.'}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => test.mutate(form)}
            disabled={test.isPending || !form.ruleType}
          >
            {test.isPending ? 'Testing...' : 'Test now'}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : rule ? 'Save changes' : 'Create rule'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Heading() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
      <p className="text-sm text-muted-foreground">
        Threshold rules evaluated against Oblak telemetry
      </p>
    </div>
  );
}
