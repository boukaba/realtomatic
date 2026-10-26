'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  DatabaseZap,
  FileText,
  FileStack,
  Fingerprint,
  Gauge,
  Globe,
  HardDrive,
  Leaf,
  KeyRound,
  ListChecks,
  Lock,
  MemoryStick,
  Moon,
  Network,
  PackageCheck,
  PieChart,
  Play,
  ReceiptText,
  ScrollText,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Timer,
  TrendingUp,
  UserCheck,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AppLayout from '@/components/layout/app-layout';
import { LiveExecutionConsole } from '@/components/live-execution-console';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { agents, agentExecutions } from '@/lib/mock-data';
import type { Agent, AgentExecution, AgentStatus, ExecutionStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const categoryIcons: Record<string, LucideIcon> = {
  lease: FileText,
  valuation: TrendingUp,
  market: BarChart3,
  portfolio: PieChart,
  maintenance: Wrench,
  tenant: UserCheck,
  document: FileStack,
  esg: Leaf,
  insurance: ShieldCheck,
  tax: ReceiptText,
  data: DatabaseZap,
};

const statusConfig: Record<AgentStatus, { label: string; badge: string; dot: string; pulse?: boolean }> = {
  running: { label: 'Running', badge: 'border-transparent bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400', pulse: true },
  idle: { label: 'Idle', badge: 'border-transparent bg-slate-500/15 text-slate-400', dot: 'bg-slate-500' },
  error: { label: 'Error', badge: 'border-transparent bg-red-500/15 text-red-400', dot: 'bg-red-400' },
  deploying: { label: 'Deploying', badge: 'border-transparent bg-amber-500/15 text-amber-400', dot: 'bg-amber-400', pulse: true },
};

const executionStatusConfig: Record<ExecutionStatus, { label: string; icon: LucideIcon; className: string }> = {
  success: { label: 'Success', icon: CheckCircle2, className: 'text-emerald-400' },
  failed: { label: 'Failed', icon: XCircle, className: 'text-red-400' },
  running: { label: 'Running', icon: Activity, className: 'text-blue-400' },
};

const PAGE_SIZE = 8;

function generateExecutions(agent: Agent): AgentExecution[] {
  return Array.from({ length: 14 }, (_, i) => {
    const seed = agent.id.charCodeAt(agent.id.length - 1) * 31 + i * 17;
    const status: ExecutionStatus = seed % 9 === 0 ? 'failed' : seed % 7 === 0 ? 'running' : 'success';
    const date = new Date();
    date.setHours(date.getHours() - i * 6 - (seed % 5));
    const baseDuration = agent.avgExecutionTime > 0 ? agent.avgExecutionTime : 5;
    return {
      id: `exec-${agent.id.slice(-3)}-${String(i + 1).padStart(2, '0')}`,
      agentId: agent.id,
      agentName: agent.name,
      input: `Task batch ${String(i + 1).padStart(2, '0')} — ${agent.category} pipeline`,
      output: status === 'failed' ? 'Error: upstream timeout after 30s' : `Completed with ${(85 + (seed % 14)).toFixed(0)}% confidence`,
      status,
      duration: Math.round(baseDuration * (0.7 + ((seed % 10) / 10)) * 10) / 10,
      timestamp: date.toISOString(),
      confidence: Math.round((0.8 + ((seed % 15) / 100)) * 100) / 100,
      vmId: `vm-${agent.id.slice(-3)}${String(i + 1).padStart(2, '0')}`,
      policyChecks: [
        { name: 'cosign', status: 'passed', details: 'Image signed by registry.realtomatic.ai' },
        { name: 'sbom', status: 'passed', details: 'No vulnerabilities found' },
        { name: 'seccomp', status: 'passed', details: `${agent.seccompProfile} profile active` },
        { name: 'egress', status: seed % 11 === 0 ? 'warning' : 'passed', details: seed % 11 === 0 ? '1 request outside allowlist' : 'All egress within allowlist' },
      ],
    };
  });
}

function buildChartData(agent: Agent) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const seed = agent.id.charCodeAt(agent.id.length - 1) + i * 13;
    const executions = Math.max(2, Math.round(agent.tasksToday * (0.55 + ((seed * 37) % 10) / 22)));
    const failures = Math.round(executions * ((seed * 13) % 6) / 100);
    return {
      day: format(date, 'EEE'),
      executions,
      failures,
    };
  });
}

function StatCard({ label, value, sub, icon: Icon, iconClass }: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  iconClass: string;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconClass)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{sub}</p>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ agent, executions }: { agent: Agent; executions: AgentExecution[] }) {
  const chartData = useMemo(() => buildChartData(agent), [agent]);
  const recent = executions.slice(0, 5);
  const totalExecutions = executions.length * 137;
  const successRate = agent.successRate > 0 ? agent.successRate : 97.4;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Executions"
          value={totalExecutions.toLocaleString()}
          sub={`${agent.tasksToday} tasks today`}
          icon={Activity}
          iconClass="bg-blue-500/15 text-blue-400"
        />
        <StatCard
          label="Success Rate"
          value={`${successRate}%`}
          sub="Rolling 7-day average"
          icon={CheckCircle2}
          iconClass="bg-emerald-500/15 text-emerald-400"
        />
        <StatCard
          label="Avg Duration"
          value={agent.avgExecutionTime > 0 ? `${agent.avgExecutionTime}s` : '—'}
          sub="Per execution, last 7 days"
          icon={Clock}
          iconClass="bg-violet-500/15 text-violet-400"
        />
        <StatCard
          label="Last Run"
          value={formatDistanceToNow(new Date(agent.lastRun), { addSuffix: true })}
          sub={format(new Date(agent.lastRun), 'MMM d, yyyy h:mm a')}
          icon={Timer}
          iconClass="bg-amber-500/15 text-amber-400"
        />
      </div>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white">Executions — Last 7 Days</CardTitle>
          <CardDescription className="text-slate-500">
            Daily execution volume and failure count for {agent.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="execGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="failGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="day" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                  itemStyle={{ color: '#94a3b8' }}
                />
                <Area
                  type="monotone"
                  dataKey="executions"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#execGradient)"
                  name="Executions"
                />
                <Area
                  type="monotone"
                  dataKey="failures"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#failGradient)"
                  name="Failures"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white">Recent Executions</CardTitle>
          <CardDescription className="text-slate-500">
            The 5 most recent runs of this agent
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-800/60">
            {recent.map((exec) => {
              const status = executionStatusConfig[exec.status];
              return (
                <div key={exec.id} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-800/30">
                  <status.icon className={cn('h-5 w-5 shrink-0', status.className)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{exec.input}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{exec.output}</p>
                  </div>
                  <div className="hidden items-center gap-6 text-xs text-slate-500 sm:flex">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {exec.duration}s
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5" />
                      {(exec.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="w-28 text-right">{formatDistanceToNow(new Date(exec.timestamp), { addSuffix: true })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExecutionsTab({ executions }: { executions: AgentExecution[] }) {
  const [statusFilter, setStatusFilter] = useState<'all' | ExecutionStatus>('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? executions : executions.filter((e) => e.status === statusFilter)),
    [executions, statusFilter]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleFilterChange = (value: string) => {
    setStatusFilter(value as 'all' | ExecutionStatus);
    setPage(1);
  };

  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-white">All Executions</CardTitle>
          <CardDescription className="text-slate-500">
            {filtered.length} execution{filtered.length === 1 ? '' : 's'}
            {statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}
          </CardDescription>
        </div>
        <Select value={statusFilter} onValueChange={handleFilterChange}>
          <SelectTrigger className="w-40 border-slate-800 bg-slate-900/60 text-slate-200">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="running">Running</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="pl-6 text-slate-500">Execution</TableHead>
              <TableHead className="text-slate-500">Input</TableHead>
              <TableHead className="text-slate-500">Status</TableHead>
              <TableHead className="text-slate-500">Duration</TableHead>
              <TableHead className="text-slate-500">Confidence</TableHead>
              <TableHead className="text-slate-500">VM</TableHead>
              <TableHead className="pr-6 text-right text-slate-500">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((exec) => {
              const status = executionStatusConfig[exec.status];
              return (
                <TableRow key={exec.id} className="border-slate-800/60">
                  <TableCell className="pl-6 font-mono text-xs text-slate-400">{exec.id}</TableCell>
                  <TableCell className="max-w-56">
                    <p className="truncate text-sm text-slate-200">{exec.input}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{exec.output}</p>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('border-transparent', status.className.replace('text-', 'bg-').replace('400', '500/15'))}>
                      <status.icon className="mr-1 h-3 w-3" />
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-300">{exec.duration}s</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={exec.confidence * 100}
                        className="h-1 w-16 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-teal-400"
                      />
                      <span className="font-mono text-xs text-slate-400">{(exec.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{exec.vmId}</TableCell>
                  <TableCell className="pr-6 text-right text-xs text-slate-500">
                    {format(new Date(exec.timestamp), 'MMM d, h:mm a')}
                  </TableCell>
                </TableRow>
              );
            })}
            {pageItems.length === 0 && (
              <TableRow className="border-slate-800/60 hover:bg-transparent">
                <TableCell colSpan={7} className="py-12 text-center">
                  <Activity className="mx-auto h-8 w-8 text-slate-600" />
                  <p className="mt-2 text-sm text-slate-400">No executions match this filter</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-3">
          <p className="text-xs text-slate-500">
            Page <span className="font-medium text-slate-300">{currentPage}</span> of{' '}
            <span className="font-medium text-slate-300">{totalPages}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  'h-8 w-8 rounded-md text-xs font-medium transition-colors',
                  p === currentPage
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                )}
              >
                {p}
              </button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigField({ label, value, icon: Icon, mono = true }: {
  label: string;
  value: string;
  icon: LucideIcon;
  mono?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-slate-500">{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
        <Input
          readOnly
          value={value}
          className={cn(
            'border-slate-800 bg-slate-900/60 pl-9 text-slate-300',
            mono && 'font-mono text-xs'
          )}
        />
      </div>
    </div>
  );
}

function ConfigurationTab({ agent }: { agent: Agent }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Settings2 className="h-4 w-4 text-slate-400" />
            Runtime Configuration
          </CardTitle>
          <CardDescription className="text-slate-500">
            Deployment settings for this agent version
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ConfigField label="Container Image" value={agent.image} icon={PackageCheck} />
          <ConfigField label="Seccomp Profile" value={agent.seccompProfile} icon={ShieldCheck} />
          <div className="grid grid-cols-3 gap-4">
            <ConfigField label="Max Duration" value={`${agent.maxDuration}s`} icon={Timer} />
            <ConfigField label="Max Memory" value={`${agent.maxMemory} MB`} icon={MemoryStick} />
            <ConfigField label="Max CPU" value={`${agent.maxCpu} vCPU`} icon={Cpu} />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-500">Egress Allowlist</Label>
            <div className="flex flex-wrap gap-2">
              {agent.egressAllowlist.map((domain) => (
                <Badge
                  key={domain}
                  className="border-slate-700 bg-slate-800/60 font-mono text-xs font-normal text-slate-300"
                >
                  <Globe className="mr-1.5 h-3 w-3 text-emerald-400" />
                  {domain}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <KeyRound className="h-4 w-4 text-slate-400" />
              Secrets
            </CardTitle>
            <CardDescription className="text-slate-500">
              Injected at runtime, never stored in the image
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {['OPENAI_API_KEY', 'REALTOMATIC_API_TOKEN', 'S3_UPLOAD_CREDENTIALS'].map((secret) => (
              <div
                key={secret}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2.5"
              >
                <span className="font-mono text-xs text-slate-300">{secret}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-600">••••••••••••</span>
                  <Lock className="h-3.5 w-3.5 text-slate-600" />
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-600">
              Rotated 12 days ago · Next rotation in 18 days
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <ListChecks className="h-4 w-4 text-slate-400" />
              Human-in-the-Loop Policy
            </CardTitle>
            <CardDescription className="text-slate-500">
              When this agent must request human review
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Confidence below 75%', enabled: true },
              { label: 'Non-standard clause detected', enabled: true },
              { label: 'Valuation variance above 5%', enabled: true },
              { label: 'Tenant risk score above 50', enabled: false },
              { label: 'Disposition recommendations', enabled: true },
            ].map((rule) => (
              <div
                key={rule.label}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2.5"
              >
                <span className="text-sm text-slate-300">{rule.label}</span>
                <Badge
                  className={cn(
                    'border-transparent',
                    rule.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-500'
                  )}
                >
                  {rule.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HibernationTab({ agent }: { agent: Agent }) {
  const stats = agent.hibernationStats;
  const isHibernating = stats.state === 'hibernating';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Moon className="h-4 w-4 text-slate-400" />
            Hibernation Status
          </CardTitle>
          <CardDescription className="text-slate-500">
            Current hibernation state and configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <span className="text-sm text-slate-300">Current State</span>
            <Badge
              className={cn(
                'border-transparent',
                isHibernating ? 'bg-indigo-500/15 text-indigo-400' : 'bg-emerald-500/15 text-emerald-400'
              )}
            >
              {isHibernating ? 'Hibernating' : 'Active'}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <span className="text-sm text-slate-300">Last Hibernated</span>
            <span className="text-xs text-slate-400">
              {formatDistanceToNow(new Date(stats.lastHibernatedAt), { addSuffix: true })}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <span className="text-sm text-slate-300">Wake-up Time</span>
            <span className="font-mono text-xs text-slate-400">{stats.wakeUpTimeMs}ms</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <span className="text-sm text-slate-300">Cost Saved This Month</span>
            <span className="font-mono text-xs font-semibold text-emerald-400">
              ${stats.costSavedThisMonth.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <span className="text-sm text-slate-300">Hibernation Policy</span>
            <span className="text-xs text-slate-400">{stats.policy}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Gauge className="h-4 w-4 text-slate-400" />
            Cost Savings
          </CardTitle>
          <CardDescription className="text-slate-500">
            Compute cost savings from agent hibernation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10">
              <span className="text-lg font-bold text-emerald-400">90%</span>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">Lower Compute Costs</p>
              <p className="text-xs text-slate-500">vs always-on VMs</p>
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Monthly savings</span>
              <span className="font-mono text-xs text-emerald-400">
                ${stats.costSavedThisMonth.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Projected annual savings</span>
              <span className="font-mono text-xs text-emerald-400">
                ${(stats.costSavedThisMonth * 12).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Idle time avoided</span>
              <span className="font-mono text-xs text-slate-400">~92%</span>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            Hibernation saves compute costs by suspending agent VMs when idle and resuming them in 200ms at the same memory state.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function PolicyTab({ agent }: { agent: Agent }) {
  const sbomFindings = [
    { severity: 'Critical', count: 0, color: 'bg-red-500' },
    { severity: 'High', count: 0, color: 'bg-orange-500' },
    { severity: 'Medium', count: 2, color: 'bg-amber-500' },
    { severity: 'Low', count: 5, color: 'bg-sky-500' },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Fingerprint className="h-4 w-4 text-slate-400" />
            Cosign Signature
          </CardTitle>
          <CardDescription className="text-slate-500">
            Supply-chain signature verification for the container image
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-emerald-400">Image Signed & Verified</p>
                <p className="text-xs text-slate-500">Signature validated against registry.realtomatic.ai public key</p>
              </div>
            </div>
            <Badge className="border-transparent bg-emerald-500/15 text-emerald-400">Valid</Badge>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Signed by</span>
              <span className="font-mono text-xs text-slate-300">registry.realtomatic.ai</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Signed at</span>
              <span className="text-xs text-slate-300">Nov 18, 2026 09:42:17 UTC</span>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm text-slate-500">Signature digest</span>
              <p className="break-all rounded-lg border border-slate-800 bg-slate-900/60 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
                {agent.signature}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <ScrollText className="h-4 w-4 text-slate-400" />
            SBOM — Software Bill of Materials
          </CardTitle>
          <CardDescription className="text-slate-500">
            Vulnerability scan of all packages in the image
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10">
              <span className="text-lg font-bold text-emerald-400">2.4</span>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">Max CVSS Score: 2.4 — Low</p>
              <p className="text-xs text-slate-500">142 packages scanned · Syft SBOM v0.98.1</p>
            </div>
            <Badge className="ml-auto border-transparent bg-emerald-500/15 text-emerald-400">Passing</Badge>
          </div>
          <div className="space-y-2.5">
            {sbomFindings.map((finding) => (
              <div key={finding.severity} className="flex items-center gap-3">
                <span className="w-16 text-xs font-medium text-slate-400">{finding.severity}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={cn('h-full rounded-full', finding.color)}
                    style={{ width: finding.count === 0 ? '2%' : `${Math.min(100, finding.count * 18)}%` }}
                  />
                </div>
                <span className="w-6 text-right font-mono text-xs text-slate-400">{finding.count}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600">
            Last scanned 6 hours ago · Next scan scheduled in 18 hours
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <ShieldCheck className="h-4 w-4 text-slate-400" />
            Seccomp Profile
          </CardTitle>
          <CardDescription className="text-slate-500">
            System call filtering applied to the agent sandbox
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <span className="text-sm text-slate-300">Active profile</span>
            <Badge className="border-transparent bg-blue-500/15 font-mono text-blue-400">
              {agent.seccompProfile}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <span className="text-sm text-slate-300">Default action</span>
            <span className="font-mono text-xs text-slate-400">SCMP_ACT_ERRNO</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <span className="text-sm text-slate-300">Blocked syscalls</span>
            <span className="font-mono text-xs text-slate-400">
              {agent.seccompProfile === 'restricted' ? '312 of 334' : '187 of 334'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
            <span className="text-sm text-slate-300">Privileged operations</span>
            <Badge className="border-transparent bg-red-500/15 text-red-400">Blocked</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Network className="h-4 w-4 text-slate-400" />
            Network & Egress
          </CardTitle>
          <CardDescription className="text-slate-500">
            Network isolation and outbound traffic rules
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-emerald-400">Network Isolation: Enabled</p>
                <p className="text-xs text-slate-500">No inbound connections · egress-only via allowlist</p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Allowed egress targets</p>
            {agent.egressAllowlist.map((domain, i) => (
              <div
                key={domain}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2.5"
              >
                <span className="font-mono text-xs text-slate-300">{domain}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-600">rule {String(i + 1).padStart(2, '0')}</span>
                  <Badge className="border-transparent bg-emerald-500/15 text-emerald-400">Allowed</Badge>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2.5">
            <span className="text-sm text-slate-300">Cloud metadata endpoint</span>
            <Badge className="border-transparent bg-red-500/15 text-red-400">
              <ShieldAlert className="mr-1 h-3 w-3" />
              Blocked
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [runOpen, setRunOpen] = useState(false);

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const agent = agents.find((a) => a.id === rawId);

  const executions = useMemo(() => {
    if (!agent) return [];
    const real = agentExecutions.filter((e) => e.agentId === agent.id);
    return real.length > 0 ? real : generateExecutions(agent);
  }, [agent]);

  if (!agent) {
    return (
      <AppLayout title="Agent Not Found">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 py-24">
          <Bot className="h-12 w-12 text-slate-600" />
          <p className="mt-4 text-lg font-semibold text-slate-300">Agent not found</p>
          <p className="mt-1 text-sm text-slate-500">
            No agent exists with ID <span className="font-mono text-slate-400">{rawId}</span>
          </p>
          <Button
            variant="outline"
            className="mt-6 border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => router.push('/agents')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Agents
          </Button>
        </div>
      </AppLayout>
    );
  }

  const Icon = categoryIcons[agent.category] ?? Bot;
  const status = statusConfig[agent.status];

  return (
    <AppLayout title={agent.name}>
      <div className="space-y-6">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Agents
        </Link>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardContent className="p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                <Icon className="h-7 w-7 text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-bold tracking-tight text-white">{agent.name}</h2>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                    v{agent.version}
                  </span>
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium', status.badge)}>
                    <span className="relative flex h-1.5 w-1.5">
                      {status.pulse && (
                        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', status.dot)} />
                      )}
                      <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', status.dot)} />
                    </span>
                    {status.label}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{agent.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <PackageCheck className="h-3.5 w-3.5" />
                    <span className="font-mono">{agent.image}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5" />
                    {agent.maxMemory} MB · {agent.maxCpu} vCPU
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    {agent.egressAllowlist.length} egress rules
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => setRunOpen(true)}>
                  <Play className="h-3.5 w-3.5" />
                  Run
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-10 gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'executions', label: 'Executions', icon: ListChecks },
              { id: 'hibernation', label: 'Hibernation', icon: Moon },
              { id: 'configuration', label: 'Configuration', icon: Settings2 },
              { id: 'policy', label: 'Policy', icon: ShieldCheck },
            ].map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview" className="mt-6">
            <OverviewTab agent={agent} executions={executions} />
          </TabsContent>
          <TabsContent value="executions" className="mt-6">
            <ExecutionsTab executions={executions} />
          </TabsContent>
          <TabsContent value="hibernation" className="mt-6">
            <HibernationTab agent={agent} />
          </TabsContent>
          <TabsContent value="configuration" className="mt-6">
            <ConfigurationTab agent={agent} />
          </TabsContent>
          <TabsContent value="policy" className="mt-6">
            <PolicyTab agent={agent} />
          </TabsContent>
        </Tabs>

        <Dialog open={runOpen} onOpenChange={setRunOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-800 bg-slate-950">
            <DialogHeader>
              <DialogTitle className="text-white">Run {agent.name}</DialogTitle>
              <DialogDescription className="text-slate-500">
                Live execution: microVM boot, policy gates, streamed inference, structured artifact.
              </DialogDescription>
            </DialogHeader>
            <LiveExecutionConsole agentId={agent.id} agentName={agent.name} />
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
