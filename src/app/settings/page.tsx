'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  Brain,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  MonitorPlay,
  Plug,
  Plus,
  Receipt,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import AppLayout from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { integrationSettings } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

type SettingsTab = 'general' | 'ai' | 'security' | 'notifications' | 'billing' | 'integrations';

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'General', icon: Building2 },
  { id: 'ai', label: 'AI Configuration', icon: Brain },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', icon: Mail },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'integrations', label: 'Integrations', icon: Plug },
];

const PROVIDERS: { id: string; label: string; icon: LucideIcon; description: string }[] = [
  { id: 'demo', label: 'Demo Mode', icon: Sparkles, description: 'Simulated responses, no API key required' },
  { id: 'openai', label: 'OpenAI', icon: Brain, description: 'GPT-4o, GPT-4o mini, and o1 models' },
  { id: 'anthropic', label: 'Anthropic', icon: Bot, description: 'Claude Sonnet and Opus models' },
  { id: 'google', label: 'Google', icon: Globe, description: 'Gemini 2.0 and 1.5 models' },
];

const PROVIDER_MODELS: Record<string, string[]> = {
  demo: ['realtomatic-demo-model'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
  google: ['gemini-2.0-flash', 'gemini-1.5-pro'],
};

const TIMEZONES = [
  'America/New_York (ET)',
  'America/Chicago (CT)',
  'America/Denver (MT)',
  'America/Los_Angeles (PT)',
  'America/Phoenix (MST)',
  'Europe/London (GMT)',
  'Europe/Berlin (CET)',
  'Asia/Tokyo (JST)',
];

const CURRENCIES = ['USD — US Dollar', 'EUR — Euro', 'GBP — British Pound', 'CAD — Canadian Dollar', 'AUD — Australian Dollar'];

const AUDIT_LOG = [
  { id: 'audit-001', user: 'sarah.chen@realtomatic.ai', action: 'Updated AI configuration', target: 'OpenAI / gpt-4o', ip: '72.14.199.24', timestamp: '2026-10-01T15:32:00Z', status: 'success' },
  { id: 'audit-002', user: 'john.doe@realtomatic.ai', action: 'Approved HITL request', target: 'hitl-005 — Disposition Recommendation', ip: '98.124.55.102', timestamp: '2026-10-01T14:30:00Z', status: 'success' },
  { id: 'audit-003', user: 'jane.smith@realtomatic.ai', action: 'Modified egress allowlist', target: 'agent-005 — Maintenance Predictor', ip: '203.0.113.42', timestamp: '2026-10-01T11:15:00Z', status: 'success' },
  { id: 'audit-004', user: 'mike.wilson@realtomatic.ai', action: 'Failed login attempt', target: 'SSO / Okta', ip: '198.51.100.23', timestamp: '2026-10-01T09:48:00Z', status: 'warning' },
  { id: 'audit-005', user: 'sarah.chen@realtomatic.ai', action: 'Rotated API key', target: 'OpenAI production key', ip: '72.14.199.24', timestamp: '2026-09-30T17:22:00Z', status: 'success' },
  { id: 'audit-006', user: 'system', action: 'Agent auto-scaled', target: 'agent-005 — 3 replicas', ip: 'internal', timestamp: '2026-09-30T16:00:00Z', status: 'info' },
  { id: 'audit-007', user: 'john.doe@realtomatic.ai', action: 'Exported audit log', target: 'Q3 2026 compliance report', ip: '98.124.55.102', timestamp: '2026-11-19T10:05:00Z', status: 'success' },
];

const BILLING_HISTORY = [
  { id: 'inv-2026-11', date: '2026-11-01', description: 'Enterprise Plan — November 2026', amount: 4999, status: 'paid' },
  { id: 'inv-2026-10', date: '2026-10-01', description: 'Enterprise Plan — October 2026', amount: 4999, status: 'paid' },
  { id: 'inv-2026-09', date: '2026-09-01', description: 'Enterprise Plan — September 2026', amount: 4999, status: 'paid' },
  { id: 'inv-2026-08', date: '2026-08-01', description: 'Enterprise Plan — August 2026', amount: 4499, status: 'paid' },
  { id: 'inv-2026-07', date: '2026-07-01', description: 'Enterprise Plan — July 2026', amount: 4499, status: 'paid' },
];

const USAGE_METRICS = [
  { label: 'API Calls', used: 842350, total: 1000000, unit: 'calls', icon: KeyRound },
  { label: 'Agent Executions', used: 12450, total: 25000, unit: 'runs', icon: Bot },
  { label: 'Storage', used: 342, total: 500, unit: 'GB', icon: Receipt },
];

const NOTIFICATION_PREFERENCES = [
  { id: 'exec-completed', label: 'Execution completed', description: 'Notify when an agent finishes a task successfully' },
  { id: 'exec-failed', label: 'Execution failed', description: 'Notify immediately when an agent execution fails' },
  { id: 'hitl-request', label: 'HITL requests', description: 'Notify when an agent requests human review' },
  { id: 'security-alerts', label: 'Security alerts', description: 'Policy violations, egress anomalies, and sign-in alerts' },
  { id: 'weekly-digest', label: 'Weekly digest', description: 'Summary of agent performance and portfolio activity' },
  { id: 'billing-alerts', label: 'Billing alerts', description: 'Usage thresholds, invoices, and payment failures' },
];

function SaveButton({ label = 'Save Changes' }: { label?: string }) {
  const [saved, setSaved] = useState(false);

  return (
    <Button
      onClick={() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }}
      className="bg-blue-600 text-white hover:bg-blue-700"
    >
      {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
      {saved ? 'Saved' : label}
    </Button>
  );
}

function GeneralTab() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="border-slate-800 bg-slate-900/60 lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-white">Organization</CardTitle>
          <CardDescription className="text-slate-500">
            Basic information about your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="org-name" className="text-slate-300">Organization Name</Label>
            <Input
              id="org-name"
              defaultValue="Realtomatic AI Real Estate"
              className="border-slate-800 bg-slate-900/60 text-slate-200 placeholder:text-slate-600"
            />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timezone" className="text-slate-300">Default Timezone</Label>
              <Select defaultValue="America/Chicago (CT)">
                <SelectTrigger id="timezone" className="border-slate-800 bg-slate-900/60 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency" className="text-slate-300">Default Currency</Label>
              <Select defaultValue="USD — US Dollar">
                <SelectTrigger id="currency" className="border-slate-800 bg-slate-900/60 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <SaveButton />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white">Logo</CardTitle>
          <CardDescription className="text-slate-500">
            Displayed across the platform and reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
            <span className="text-2xl font-bold text-white">P</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center transition-colors hover:border-slate-600">
            <Upload className="h-6 w-6 text-slate-500" />
            <p className="mt-2 text-sm font-medium text-slate-300">Click to upload</p>
            <p className="mt-1 text-xs text-slate-500">PNG, SVG or JPG (max. 2MB)</p>
          </div>
          <Button variant="outline" size="sm" className="w-full border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white">
            <Upload className="h-3.5 w-3.5" />
            Upload New Logo
          </Button>
        </CardContent>
      </Card>

      <DemoControls />
    </div>
  );
}

/**
 * Operator controls for a live demo: wipe everything the agents produced and
 * let Atlas rebuild a fresh portfolio. Useful before each investor run.
 */
function DemoControls() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const reset = async () => {
    setBusy(true);
    setDone(null);
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      if (res.ok) {
        setDone('Demo reset. Agents are rebuilding the portfolio now.');
      } else {
        setDone('Reset failed — check the server log.');
      }
    } catch {
      setDone('Reset failed — server unreachable.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900/60 lg:col-span-3">
      <CardHeader>
        <CardTitle className="text-white">Demo Controls</CardTitle>
        <CardDescription className="text-slate-500">
          Reset the workspace before a demo. Everything the agents produced is cleared and
          Atlas begins generating a fresh portfolio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200"
            asChild
          >
            <Link href="/wall">
              <MonitorPlay className="h-4 w-4" />
              Open wall display
            </Link>
          </Button>
          <p className="text-xs text-slate-500">
            Full-screen live view for a TV or projector — agents working and handing off in real time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
          <Button
            variant="outline"
            className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200"
            disabled={busy}
            onClick={() => void reset()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            {busy ? 'Resetting…' : 'Reset demo state'}
          </Button>
          <p className="text-xs text-slate-500">
            Clears artifacts, executions, workflows, approvals and activity. Takes about a minute to refill.
          </p>
        </div>
        {done && <p className="text-xs text-slate-400">{done}</p>}
      </CardContent>
    </Card>
  );
}

function AIConfigurationTab() {
  const [provider, setProvider] = useState('demo');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(PROVIDER_MODELS.demo[0]);
  const [temperature, setTemperature] = useState([0.7]);
  const [maxTokens, setMaxTokens] = useState('4096');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');

  const models = PROVIDER_MODELS[provider] ?? PROVIDER_MODELS.demo;

  const handleProviderChange = (id: string) => {
    setProvider(id);
    setModel(PROVIDER_MODELS[id][0]);
    setTestResult('idle');
  };

  const handleTestConnection = () => {
    setTesting(true);
    setTestResult('idle');
    setTimeout(() => {
      setTesting(false);
      setTestResult(provider === 'demo' || apiKey.length > 0 ? 'success' : 'error');
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.06] px-4 py-3">
        <p className="text-sm font-medium text-indigo-200">Backend is configured server-side</p>
        <p className="mt-0.5 text-xs leading-relaxed text-indigo-200/70">
          Agents run on the backend selected by <span className="font-mono">REALTOMATIC_LLM_BACKEND</span>:
          the OpenCode server by default, or a direct OpenAI-compatible endpoint when set to{' '}
          <span className="font-mono">openai</span>. Credentials and the endpoint live in{' '}
          <span className="font-mono">.env.local</span>; see <span className="font-mono">.env.example</span>.
        </p>
      </div>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white">AI Provider</CardTitle>
          <CardDescription className="text-slate-500">
            Choose which AI provider powers your agents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
                  provider === p.id
                    ? 'border-blue-500/60 bg-blue-500/10 ring-1 ring-blue-500/40'
                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <p.icon className={cn('h-5 w-5', provider === p.id ? 'text-blue-400' : 'text-slate-500')} />
                  {provider === p.id && <CheckCircle2 className="h-4 w-4 text-blue-400" />}
                </div>
                <div>
                  <p className={cn('text-sm font-semibold', provider === p.id ? 'text-white' : 'text-slate-300')}>
                    {p.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{p.description}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white">Provider Settings</CardTitle>
          <CardDescription className="text-slate-500">
            Configure the connection and inference parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="api-key" className="text-slate-300">API Key</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider === 'demo' ? 'Not required for Demo Mode' : 'sk-...'}
                  disabled={provider === 'demo'}
                  className="border-slate-800 bg-slate-900/60 pl-9 pr-10 font-mono text-slate-200 placeholder:text-slate-600 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Stored encrypted with AES-256 and never logged or exposed to agents.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="model" className="text-slate-300">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="model" className="border-slate-800 bg-slate-900/60 font-mono text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m} className="font-mono">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="temperature" className="text-slate-300">Temperature</Label>
                <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs text-blue-400">
                  {temperature[0].toFixed(2)}
                </span>
              </div>
              <Slider
                id="temperature"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onValueChange={setTemperature}
                className="py-2"
              />
              <div className="flex justify-between text-[10px] font-medium uppercase tracking-wide text-slate-600">
                <span>Precise</span>
                <span>Balanced</span>
                <span>Creative</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-tokens" className="text-slate-300">Max Tokens</Label>
              <Input
                id="max-tokens"
                type="number"
                min={1}
                max={128000}
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                className="border-slate-800 bg-slate-900/60 text-slate-200"
              />
              <p className="text-xs text-slate-500">Maximum response length per agent inference call.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing}
              className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {testing ? 'Testing Connection...' : 'Test Connection'}
            </Button>
            {testResult === 'success' && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Connected successfully — latency 182ms
              </span>
            )}
            {testResult === 'error' && (
              <span className="inline-flex items-center gap-1.5 text-sm text-red-400">
                <Lock className="h-4 w-4" />
                Connection failed — check your API key
              </span>
            )}
            <div className="sm:ml-auto">
              <SaveButton label="Save Configuration" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityTab() {
  const [twoFactor, setTwoFactor] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState('8 hours');
  const [ipAllowlist, setIpAllowlist] = useState('72.14.199.0/24\n98.124.55.0/24\n203.0.113.42');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="text-white">Authentication</CardTitle>
            <CardDescription className="text-slate-500">
              Control how users access the platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-200">Two-Factor Authentication</p>
                <p className="text-xs text-slate-500">Require TOTP for all members of this organization</p>
              </div>
              <Switch checked={twoFactor} onCheckedChange={setTwoFactor} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-timeout" className="text-slate-300">Session Timeout</Label>
              <Select value={sessionTimeout} onValueChange={setSessionTimeout}>
                <SelectTrigger id="session-timeout" className="border-slate-800 bg-slate-900/60 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['1 hour', '4 hours', '8 hours', '12 hours', '24 hours', '7 days'].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Inactive sessions are automatically terminated.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ip-allowlist" className="text-slate-300">IP Allowlist</Label>
              <Textarea
                id="ip-allowlist"
                value={ipAllowlist}
                onChange={(e) => setIpAllowlist(e.target.value)}
                rows={4}
                className="border-slate-800 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600"
                placeholder="One IP or CIDR range per line"
              />
              <p className="text-xs text-slate-500">Leave empty to allow access from any IP address.</p>
            </div>
            <div className="flex justify-end">
              <SaveButton />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Egress Policy
            </CardTitle>
            <CardDescription className="text-slate-500">
              Outbound network policy enforced on all agent VMs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
              <span className="text-sm text-slate-300">Default outbound access</span>
              <Badge className="border-transparent bg-red-500/15 text-red-400">Denied</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
              <span className="text-sm text-slate-300">DNS resolution</span>
              <Badge className="border-transparent bg-emerald-500/15 text-emerald-400">Allowlisted</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
              <span className="text-sm text-slate-300">Metadata service (169.254.169.254)</span>
              <Badge className="border-transparent bg-red-500/15 text-red-400">Blocked</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
              <span className="text-sm text-slate-300">Policy enforcement</span>
              <Badge className="border-transparent bg-blue-500/15 text-blue-400">Kubernetes NetworkPolicy</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white">Audit Log</CardTitle>
          <CardDescription className="text-slate-500">
            Recent security-relevant actions across your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-500">User</TableHead>
                <TableHead className="text-slate-500">Action</TableHead>
                <TableHead className="text-slate-500">Status</TableHead>
                <TableHead className="text-right text-slate-500">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {AUDIT_LOG.map((entry) => (
                <TableRow key={entry.id} className="border-slate-800/60">
                  <TableCell className="font-mono text-xs text-slate-300">{entry.user}</TableCell>
                  <TableCell>
                    <p className="text-sm text-slate-200">{entry.action}</p>
                    <p className="text-xs text-slate-500">{entry.target}</p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        'border-transparent',
                        entry.status === 'success' && 'bg-emerald-500/15 text-emerald-400',
                        entry.status === 'warning' && 'bg-amber-500/15 text-amber-400',
                        entry.status === 'info' && 'bg-sky-500/15 text-sky-400'
                      )}
                    >
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-slate-500">
                    {new Date(entry.timestamp).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsTab() {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [slackWebhook, setSlackWebhook] = useState('https://hooks.slack.com/services/T04ABC/B05XYZ/realtomatic-alerts');
  const [failureRate, setFailureRate] = useState([5]);
  const [hitlTimeout, setHitlTimeout] = useState('30');
  const [preferences, setPreferences] = useState<string[]>(['exec-failed', 'hitl-request', 'security-alerts']);

  const togglePreference = (id: string) => {
    setPreferences((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white">Channels</CardTitle>
          <CardDescription className="text-slate-500">
            Where alerts and notifications are delivered
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800">
                <Mail className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">Email Notifications</p>
                <p className="text-xs text-slate-500">Send alerts to all organization admins</p>
              </div>
            </div>
            <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slack-webhook" className="text-slate-300">Slack Webhook URL</Label>
            <div className="relative">
              <MessageSquare className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="slack-webhook"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                className="border-slate-800 bg-slate-900/60 pl-9 font-mono text-xs text-slate-200 placeholder:text-slate-600"
                placeholder="https://hooks.slack.com/services/..."
              />
            </div>
            <p className="text-xs text-slate-500">Post agent alerts to a Slack channel of your choice.</p>
          </div>
          <div className="flex justify-end">
            <SaveButton />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="text-white">Alert Thresholds</CardTitle>
            <CardDescription className="text-slate-500">
              Trigger alerts when metrics cross these limits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="failure-rate" className="text-slate-300">Agent Failure Rate</Label>
                <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs text-amber-400">
                  {failureRate[0]}%
                </span>
              </div>
              <Slider
                id="failure-rate"
                min={0}
                max={25}
                step={1}
                value={failureRate}
                onValueChange={setFailureRate}
                className="py-2"
              />
              <p className="text-xs text-slate-500">Alert when the rolling 1h failure rate exceeds this value.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hitl-timeout" className="text-slate-300">HITL Timeout</Label>
              <div className="relative">
                <Input
                  id="hitl-timeout"
                  type="number"
                  min={5}
                  max={1440}
                  value={hitlTimeout}
                  onChange={(e) => setHitlTimeout(e.target.value)}
                  className="border-slate-800 bg-slate-900/60 pr-14 text-slate-200"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                  minutes
                </span>
              </div>
              <p className="text-xs text-slate-500">Escalate to on-call if a human review is not actioned in time.</p>
            </div>
            <div className="flex justify-end">
              <SaveButton />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="text-white">Notification Preferences</CardTitle>
            <CardDescription className="text-slate-500">
              Choose which events trigger a notification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {NOTIFICATION_PREFERENCES.map((pref) => (
              <label
                key={pref.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 transition-colors hover:border-slate-700"
              >
                <Checkbox
                  checked={preferences.includes(pref.id)}
                  onCheckedChange={() => togglePreference(pref.id)}
                  className="mt-0.5 border-slate-600 bg-slate-800 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-600"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-200">{pref.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{pref.description}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BillingTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white">Current Plan</CardTitle>
                <CardDescription className="text-slate-500">
                  Your subscription renews on December 1, 2026
                </CardDescription>
              </div>
              <Badge className="border-transparent bg-indigo-500/15 text-indigo-400">Enterprise</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <span className="text-4xl font-bold tracking-tight text-white">$4,999</span>
                <span className="text-sm text-slate-500"> / month</span>
              </div>
              <div className="flex gap-6 pb-1 text-sm">
                <div>
                  <p className="text-slate-500">Agents</p>
                  <p className="font-semibold text-slate-200">Unlimited</p>
                </div>
                <div>
                  <p className="text-slate-500">Seats</p>
                  <p className="font-semibold text-slate-200">25 included</p>
                </div>
                <div>
                  <p className="text-slate-500">Support</p>
                  <p className="font-semibold text-slate-200">24/7 Dedicated</p>
                </div>
                <div>
                  <p className="text-slate-500">SLA</p>
                  <p className="font-semibold text-slate-200">99.99%</p>
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" size="sm" className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white">
                Change Plan
              </Button>
              <Button variant="ghost" size="sm" className="text-slate-400 hover:bg-slate-800 hover:text-white">
                View Plan Comparison
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Wallet className="h-4 w-4 text-slate-400" />
              Payment Method
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-gradient-to-br from-slate-800/80 to-slate-900 p-4">
              <div className="flex h-9 w-12 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-700 text-[10px] font-bold italic text-white">
                VISA
              </div>
              <div>
                <p className="font-mono text-sm text-slate-200">•••• •••• •••• 4242</p>
                <p className="text-xs text-slate-500">Expires 09 / 2027</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white">
              Update Payment Method
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white">Usage This Cycle</CardTitle>
          <CardDescription className="text-slate-500">
            November 1 — November 30, 2026
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {USAGE_METRICS.map((metric) => {
              const pct = Math.round((metric.used / metric.total) * 100);
              return (
                <div key={metric.label} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <metric.icon className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-300">{metric.label}</span>
                    </div>
                    <span
                      className={cn(
                        'text-xs font-semibold',
                        pct >= 85 ? 'text-red-400' : pct >= 60 ? 'text-amber-400' : 'text-emerald-400'
                      )}
                    >
                      {pct}%
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    className="mt-3 h-1.5 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-indigo-500"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    <span className="font-mono font-medium text-slate-300">
                      {metric.used.toLocaleString()}
                    </span>{' '}
                    / {metric.total.toLocaleString()} {metric.unit}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white">Billing History</CardTitle>
          <CardDescription className="text-slate-500">
            Invoices from the last 5 billing cycles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-500">Invoice</TableHead>
                <TableHead className="text-slate-500">Date</TableHead>
                <TableHead className="text-slate-500">Description</TableHead>
                <TableHead className="text-right text-slate-500">Amount</TableHead>
                <TableHead className="text-right text-slate-500">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BILLING_HISTORY.map((invoice) => (
                <TableRow key={invoice.id} className="border-slate-800/60">
                  <TableCell className="font-mono text-xs text-blue-400">{invoice.id}</TableCell>
                  <TableCell className="text-slate-300">
                    {new Date(invoice.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell className="text-slate-400">{invoice.description}</TableCell>
                  <TableCell className="text-right font-mono text-slate-200">
                    ${invoice.amount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge className="border-transparent bg-emerald-500/15 text-emerald-400">
                      <Check className="mr-1 h-3 w-3" />
                      {invoice.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationsTab() {
  const [emailIntegrations, setEmailIntegrations] = useState(integrationSettings.email);
  const [calendarIntegrations, setCalendarIntegrations] = useState(integrationSettings.calendar);
  const [leadSourceIntegrations, setLeadSourceIntegrations] = useState(integrationSettings.leadSources);
  const [chatWidgetEnabled, setChatWidgetEnabled] = useState(integrationSettings.chatWidget.enabled);
  const [apiKeys, setApiKeys] = useState(integrationSettings.apiKeys);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');

  const toggleIntegration = <T extends { id: string; enabled: boolean }>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    id: string
  ) => {
    setter((prev) => prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)));
  };

  const handleCopyEmbedCode = async () => {
    try {
      await navigator.clipboard.writeText(integrationSettings.chatWidget.embedCode);
      setCopiedKeyId('embed');
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch {
      // Fallback for environments without clipboard API
    }
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;
    setApiKeys((prev) => [
      ...prev,
      {
        id: `key-${String(prev.length + 1).padStart(3, '0')}`,
        name: newKeyName.trim(),
        key: `rtm_live_${Math.random().toString(36).slice(2, 18)}`,
        createdAt: new Date().toISOString(),
        lastUsed: 'Never',
      },
    ]);
    setNewKeyName('');
  };

  const handleDeleteKey = (id: string) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const integrationRows = <T extends { id: string; enabled: boolean }>(
    items: T[],
    setter: React.Dispatch<React.SetStateAction<T[]>>
  ) =>
    items.map((item) => {
      const record = item as unknown as Record<string, string>;
      const label = record.provider ?? record.source ?? '';
      return (
        <div
          key={item.id}
          className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                item.enabled ? 'bg-emerald-400' : 'bg-slate-600'
              )}
            />
            <span className="text-sm font-medium text-slate-200">{label}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn('text-xs', item.enabled ? 'text-emerald-400' : 'text-slate-500')}>
              {item.enabled ? 'Connected' : 'Disabled'}
            </span>
            <Switch
              checked={item.enabled}
              onCheckedChange={() => toggleIntegration(setter, item.id)}
            />
          </div>
        </div>
      );
    });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Mail className="h-4 w-4 text-blue-400" />
              Email Integration
            </CardTitle>
            <CardDescription className="text-slate-500">
              Connect email to send and receive lead inquiries
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrationRows(emailIntegrations, setEmailIntegrations)}
            <div className="flex justify-end pt-1">
              <SaveButton />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Clock className="h-4 w-4 text-violet-400" />
              Calendar Integration
            </CardTitle>
            <CardDescription className="text-slate-500">
              Sync tours and meetings with your team calendar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrationRows(calendarIntegrations, setCalendarIntegrations)}
            <div className="flex justify-end pt-1">
              <SaveButton />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <MessageSquare className="h-4 w-4 text-rose-400" />
              Lead Sources
            </CardTitle>
            <CardDescription className="text-slate-500">
              Channels that feed inquiries into Lead Intelligence
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrationRows(leadSourceIntegrations, setLeadSourceIntegrations)}
            <div className="flex justify-end pt-1">
              <SaveButton />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Globe className="h-4 w-4 text-emerald-400" />
              Website Chat Widget
            </CardTitle>
            <CardDescription className="text-slate-500">
              Embed the AI chat widget on your property websites
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-200">Widget enabled</p>
                <p className="text-xs text-slate-500">
                  The Lead Response Agent answers chats 24/7
                </p>
              </div>
              <Switch checked={chatWidgetEnabled} onCheckedChange={setChatWidgetEnabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="embed-code" className="text-slate-300">Embed Code</Label>
              <div className="relative">
                <Textarea
                  id="embed-code"
                  readOnly
                  value={integrationSettings.chatWidget.embedCode}
                  rows={3}
                  className="border-slate-800 bg-slate-950 pr-16 font-mono text-xs text-slate-400"
                />
                <button
                  type="button"
                  onClick={handleCopyEmbedCode}
                  className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:bg-slate-700"
                >
                  {copiedKeyId === 'embed' ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Paste before the closing &lt;/body&gt; tag on any page.
              </p>
            </div>
            <div className="flex justify-end">
              <SaveButton />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <KeyRound className="h-4 w-4 text-amber-400" />
            API Keys
          </CardTitle>
          <CardDescription className="text-slate-500">
            Programmatic access to the Realtomatic API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="New key name (e.g. Production)"
              className="border-slate-800 bg-slate-900/60 text-slate-200 placeholder:text-slate-600"
            />
            <Button
              onClick={handleCreateKey}
              disabled={!newKeyName.trim()}
              variant="outline"
              className="shrink-0 border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Create Key
            </Button>
          </div>
          <div className="space-y-2">
            {apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200">{apiKey.name}</p>
                  <p className="truncate font-mono text-xs text-slate-500">{apiKey.key}</p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-xs text-slate-500">
                  <span>
                    Last used:{' '}
                    <span className="font-medium text-slate-300">
                      {apiKey.lastUsed === 'Never'
                        ? 'Never'
                        : new Date(apiKey.lastUsed).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteKey(apiKey.id)}
                    className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Delete key"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  return (
    <AppLayout title="Settings">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'ai' && <AIConfigurationTab />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'billing' && <BillingTab />}
        {activeTab === 'integrations' && <IntegrationsTab />}
      </div>
    </AppLayout>
  );
}
