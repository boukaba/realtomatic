'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  FileUp,
  Leaf,
  Mail,
  MessageSquare,
  Moon,
  PieChart,
  Play,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AppLayout } from '@/components/layout/app-layout';
import { AgentConstellation } from '@/components/agent-constellation';
import { AttentionQueue } from '@/components/attention-queue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { agents, agentExecutions, hitlRequests, leadSourceROI, leads, workflows } from '@/lib/mock-data';
import { useLiveActivity } from '@/hooks/use-live-activity';
import type { Agent, AgentStatus, Lead, LeadStatus, Workflow, WorkflowStatus } from '@/lib/types';
import { cn, formatDuration, timeAgo } from '@/lib/utils';

const agentIconMap: Record<string, LucideIcon> = {
  FileText,
  TrendingUp,
  BarChart3,
  PieChart,
  Wrench,
  UserCheck,
  FileStack: FileText,
  Leaf,
  ShieldCheck,
  ReceiptText,
  Mail,
  MessageSquare,
};

const agentIconColors: Record<string, string> = {
  lease: 'bg-blue-500/15 text-blue-400',
  valuation: 'bg-emerald-500/15 text-emerald-400',
  market: 'bg-violet-500/15 text-violet-400',
  portfolio: 'bg-amber-500/15 text-amber-400',
  maintenance: 'bg-orange-500/15 text-orange-400',
  tenant: 'bg-cyan-500/15 text-cyan-400',
  document: 'bg-pink-500/15 text-pink-400',
  email: 'bg-indigo-500/15 text-indigo-400',
  lead: 'bg-rose-500/15 text-rose-400',
};

const leadStatusConfig: Record<LeadStatus, { label: string; badge: string }> = {
  New: { label: 'New', badge: 'bg-blue-500/15 text-blue-300 ring-blue-500/20' },
  Contacted: { label: 'Contacted', badge: 'bg-amber-500/15 text-amber-300 ring-amber-500/20' },
  Qualified: { label: 'Qualified', badge: 'bg-violet-500/15 text-violet-300 ring-violet-500/20' },
  Booked: { label: 'Booked', badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/20' },
};

const leadSourceColors: Record<string, string> = {
  Zillow: '#6366f1',
  'Realtor.com': '#8b5cf6',
  Website: '#d946ef',
  Referral: '#a855f7',
  'Apartments.com': '#818cf8',
};

function leadScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

const agentStatusConfig: Record<AgentStatus, { label: string; dot: string; pulse?: boolean }> = {
  running: { label: 'Running', dot: 'bg-emerald-500', pulse: true },
  idle: { label: 'Idle', dot: 'bg-zinc-400' },
  error: { label: 'Error', dot: 'bg-red-500' },
  deploying: { label: 'Deploying', dot: 'bg-amber-500', pulse: true },
};

const workflowStatusConfig: Record<WorkflowStatus, { label: string; badge: string }> = {
  running: { label: 'Running', badge: 'bg-blue-500/15 text-blue-300 ring-blue-500/20' },
  completed: { label: 'Completed', badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/20' },
  failed: { label: 'Failed', badge: 'bg-red-500/15 text-red-300 ring-red-500/20' },
  pending_approval: { label: 'Pending Approval', badge: 'bg-amber-500/15 text-amber-300 ring-amber-500/20' },
};

const portfolioChartData = [
  { month: 'Nov', value: 1080 },
  { month: 'Dec', value: 1095 },
  { month: 'Jan', value: 1102 },
  { month: 'Feb', value: 1118 },
  { month: 'Mar', value: 1125 },
  { month: 'Apr', value: 1138 },
  { month: 'May', value: 1145 },
  { month: 'Jun', value: 1152 },
  { month: 'Jul', value: 1168 },
  { month: 'Aug', value: 1175 },
  { month: 'Sep', value: 1188 },
  { month: 'Oct', value: 1200 },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function KpiCard({
  icon: Icon,
  label,
  value,
  change,
  changeLabel,
  iconClass,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  change: string;
  changeLabel: string;
  iconClass: string;
}) {
  return (
    <Card className="group border-slate-700 bg-slate-900 transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconClass)}>
            <Icon className="h-5 w-5" />
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
              change === 'Action'
                ? 'bg-amber-500/15 text-amber-400'
                : change === 'Offline' || change === 'Clear'
                  ? 'bg-slate-500/15 text-slate-400'
                  : 'bg-emerald-500/15 text-emerald-400'
            )}
          >
            <ArrowUpRight className="h-3 w-3" />
            {change}
          </span>
        </div>
        <p className="mt-4 text-2xl font-bold tracking-tight text-zinc-100">{value}</p>
        <p className="mt-1 text-sm text-zinc-400">
          {label} <span className="text-zinc-500">&middot; {changeLabel}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const router = useRouter();
  const Icon = agentIconMap[agent.icon] ?? Bot;
  const status = agentStatusConfig[agent.status];
  const isHibernating = agent.hibernationEnabled && agent.hibernationStats.state === 'hibernating';

  return (
    <div
      onClick={() => router.push('/agents')}
      className="group flex cursor-pointer flex-col rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-600 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              agentIconColors[agent.category] ?? 'bg-slate-500/15 text-slate-400'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">{agent.name}</h3>
              <span className="rounded bg-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                v{agent.version}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                {status.pulse && (
                  <span
                    className={cn(
                      'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                      status.dot
                    )}
                  />
                )}
                <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', status.dot)} />
              </span>
              <span className="text-xs font-medium text-zinc-500">{status.label}</span>
              {isHibernating && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-medium text-indigo-400">
                  <Moon className="h-2.5 w-2.5" />
                  Hibernated
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-800 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Tasks Today</p>
          <p className="mt-0.5 text-sm font-semibold text-zinc-100">{agent.tasksToday}</p>
        </div>
        <div className="rounded-lg bg-slate-800 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Avg Time</p>
          <p className="mt-0.5 text-sm font-semibold text-zinc-100">
            {agent.avgExecutionTime > 0 ? `${agent.avgExecutionTime}s` : '—'}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Success Rate</span>
          <span className="font-semibold text-zinc-100">
            {agent.successRate > 0 ? `${agent.successRate}%` : '—'}
          </span>
        </div>
        <Progress
          value={agent.successRate}
          className="mt-1.5 h-1.5 bg-slate-700"
        />
      </div>

      <Button
        size="sm"
        className="mt-4 w-full bg-zinc-900 text-white hover:bg-zinc-800"
        onClick={(e) => {
          e.stopPropagation();
          router.push('/agents');
        }}
      >
        <Play className="h-3.5 w-3.5" />
        Run Agent
      </Button>
    </div>
  );
}

function workflowDurationMs(workflow: Workflow): number {
  const start = new Date(workflow.startedAt).getTime();
  const end = workflow.completedAt ? new Date(workflow.completedAt).getTime() : Date.now();
  return end - start;
}

// False during SSR / first client render, true after hydration — lets us
// render a stable placeholder for live (running) durations and only show
// the ticking value once mounted, avoiding hydration mismatches.
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const status = workflowStatusConfig[workflow.status];
  const completedSteps = workflow.steps.filter((s) => s.status === 'completed').length;
  const progress = Math.round((completedSteps / workflow.steps.length) * 100);
  const currentStep = workflow.steps.find(
    (s) => s.status === 'running' || s.status === 'awaiting_approval'
  );

  const mounted = useMounted();
  const duration = useMemo(() => {
    if (!workflow.completedAt && !mounted) return '—';
    return formatDuration(workflowDurationMs(workflow));
  }, [workflow, mounted]);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-100">{workflow.name}</h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{workflow.description}</p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
            status.badge
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">
            {completedSteps} of {workflow.steps.length} steps
          </span>
          <span className="font-semibold text-zinc-100">{progress}%</span>
        </div>
        <Progress value={progress} className="mt-1.5 h-1.5 bg-slate-700" />
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 text-zinc-500">
          <Activity className="h-3.5 w-3.5" />
          {currentStep ? currentStep.name : 'All steps complete'}
        </span>
        <span className="inline-flex items-center gap-1.5 text-zinc-500">
          <Clock className="h-3.5 w-3.5" />
          {duration}
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const live = useLiveActivity();
  // Mock rows are the baseline until the live feed lands, so the table is
  // never empty; once real executions stream in they take over.
  const pendingApprovals = hitlRequests.filter((r) => r.status === 'pending');
  const mockExecutions = agentExecutions.slice(0, 10);
  const liveExecutions = live.executions;
  const recentExecutions = liveExecutions.length > 0 ? liveExecutions : mockExecutions;
  const showLive = liveExecutions.length > 0;
  const pendingCount = showLive ? live.pendingApprovals : pendingApprovals.length;
  const recentWorkflows = workflows.slice(0, 3);
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">
            {greeting()}, Mohammed
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {today} &middot; Your agents worked the portfolio overnight. Here&apos;s what needs you.
          </p>
        </div>

        <AgentConstellation />

        <AttentionQueue />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            icon={Building2}
            label="Total Properties"
            value="247"
            change="+12"
            changeLabel="this quarter"
            iconClass="bg-blue-500/15 text-blue-400"
          />
          <KpiCard
            icon={TrendingUp}
            label="Portfolio Value"
            value="$1.2B"
            change="+3.2%"
            changeLabel="YoY"
            iconClass="bg-emerald-500/15 text-emerald-400"
          />
          <KpiCard
            icon={Bot}
            label="Agent Runs (live)"
            value={live.portfolio.agentRuns > 0 ? String(live.portfolio.agentRuns) : '—'}
            change={live.connected ? 'Live' : 'Offline'}
            changeLabel={live.connected ? 'streaming now' : 'connecting'}
            iconClass="bg-violet-500/15 text-violet-400"
          />
          <KpiCard
            icon={Moon}
            label="Artifacts Synthesized"
            value={live.portfolio.artifactsSynthesized > 0 ? String(live.portfolio.artifactsSynthesized) : '—'}
            change={live.fabricator.running ? 'Atlas' : 'Ready'}
            changeLabel="Atlas data fabric"
            iconClass="bg-indigo-500/15 text-indigo-400"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Pending Approvals"
            value={String(pendingCount)}
            change={pendingCount > 0 ? 'Action' : 'Clear'}
            changeLabel={pendingCount > 0 ? 'requires attention' : 'all caught up'}
            iconClass="bg-amber-500/15 text-amber-400"
          />
        </div>

        {pendingCount > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-200">
                {pendingCount} approval{pendingCount === 1 ? '' : 's'} awaiting
                your review
              </p>
              <p className="mt-0.5 text-sm text-amber-300/90">
                {pendingApprovals.map((r) => r.title).join(' &middot; ')}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-300 bg-slate-900 text-amber-700 hover:bg-amber-100"
              onClick={() => router.push('/approvals')}
            >
              Review Now
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: FileUp, label: 'Upload Lease', desc: 'Abstract a new lease document' },
            { icon: TrendingUp, label: 'Run Valuation', desc: 'Get an instant property valuation' },
            { icon: BarChart3, label: 'Market Report', desc: 'Generate a market analysis' },
            { icon: PieChart, label: 'Optimize Portfolio', desc: 'AI-powered recommendations' },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => router.push('/agents')}
              className="group flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-500/50 hover:shadow-md"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400 transition-colors group-hover:bg-indigo-500/25">
                <action.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-100">{action.label}</p>
                <p className="truncate text-xs text-zinc-500">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2 border-slate-700 bg-slate-900">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base text-zinc-100">Portfolio Value</CardTitle>
                <p className="text-sm text-zinc-400">Total portfolio value over the last 12 months</p>
              </div>
              <Badge variant="success" className="gap-1">
                <TrendingUp className="h-3 w-3" />
                +11.1% YoY
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={portfolioChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      tickFormatter={(v: number) => `$${v}B`}
                      domain={[1050, 1220]}
                    />
                    <Tooltip
                      formatter={(value) => [`$${value}B`, 'Portfolio Value']}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #334155', backgroundColor: '#0f172a', color: '#e2e8f0',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      fill="url(#portfolioGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-700 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-zinc-100">Active Workflows</CardTitle>
              <p className="text-sm text-zinc-400">Recent workflow executions</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentWorkflows.map((wf) => (
                <WorkflowCard key={wf.id} workflow={wf} />
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-zinc-500 hover:text-zinc-100"
                onClick={() => router.push('/workflows')}
              >
                View all workflows
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2 border-slate-700 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-zinc-100">Agent Command Center</CardTitle>
              <p className="text-sm text-zinc-400">Your AI agents and their performance today</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-700 bg-slate-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
                <Mail className="h-4 w-4 text-indigo-400" />
                Email Outreach
              </CardTitle>
              <p className="text-sm text-zinc-400">Autonomous email agent performance</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Emails Sent', value: '156', change: '+12 today' },
                { label: 'Responses Received', value: '89', change: '57% rate' },
                { label: 'Deals Progressed', value: '23', change: 'from email threads' },
                { label: 'Active Threads', value: '12', change: 'awaiting replies' },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{stat.value}</p>
                    <p className="text-xs text-zinc-500">{stat.label}</p>
                  </div>
                  <span className="text-xs text-zinc-500">{stat.change}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-700 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-zinc-100">Quick Actions</CardTitle>
              <p className="text-sm text-zinc-400">Common tasks and shortcuts</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { icon: FileUp, label: 'Upload Lease', desc: 'Abstract a new lease document', href: '/leases' },
                { icon: TrendingUp, label: 'Run Valuation', desc: 'Get an instant property valuation', href: '/agents' },
                { icon: BarChart3, label: 'Market Report', desc: 'Generate a market analysis', href: '/market' },
                { icon: PieChart, label: 'Optimize Portfolio', desc: 'AI-powered recommendations', href: '/agents' },
              ].map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="group flex items-center gap-3 rounded-lg border border-slate-700 p-3 transition-all hover:border-indigo-500/50 hover:bg-indigo-500/10"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-slate-300 transition-colors group-hover:bg-indigo-500/20 group-hover:text-indigo-300">
                    <action.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-100">{action.label}</p>
                    <p className="truncate text-xs text-zinc-500">{action.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-700 bg-slate-900">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base text-zinc-100">Recent Executions</CardTitle>
              <p className="text-sm text-zinc-400">
                {showLive ? 'Real agent runs streamed from the runtime' : 'Latest agent execution results'}
              </p>
            </div>
            <Badge variant={live.connected ? 'success' : 'secondary'} className="gap-1">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  live.connected ? 'bg-emerald-400' : 'bg-zinc-500'
                )}
              />
              {showLive ? 'Live' : live.connected ? 'Connected' : 'Offline'}
            </Badge>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentExecutions.map((exec) => (
                  <TableRow key={exec.id}>
                    <TableCell className="font-medium text-zinc-100">{exec.agentName}</TableCell>
                    <TableCell className="max-w-48 truncate text-zinc-600">{exec.input}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
                          exec.status === 'success'
                            ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/20'
                            : exec.status === 'failed'
                              ? 'bg-red-500/15 text-red-300 ring-red-500/20'
                              : 'bg-blue-500/15 text-blue-300 ring-blue-500/20'
                        )}
                      >
                        {exec.status === 'success' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : exec.status === 'failed' ? (
                          <XCircle className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {exec.status.charAt(0).toUpperCase() + exec.status.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-zinc-600">{formatDuration(exec.duration * 1000)}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'font-semibold',
                          exec.confidence >= 0.9
                            ? 'text-emerald-600'
                            : exec.confidence >= 0.75
                              ? 'text-amber-600'
                              : 'text-red-600'
                        )}
                      >
                        {(exec.confidence * 100).toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-zinc-500">{timeAgo(exec.timestamp)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/15">
              <MessageSquare className="h-5 w-5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">Lead Intelligence</h3>
              <p className="text-sm text-zinc-500">
                AI-powered lead capture, scoring, and engagement
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={Sparkles}
              label="New Leads"
              value="23"
              change="+8"
              changeLabel="this week"
              iconClass="bg-blue-500/15 text-blue-400"
            />
            <KpiCard
              icon={MessageSquare}
              label="Response Rate"
              value="94%"
              change="+2.1%"
              changeLabel="vs last month"
              iconClass="bg-emerald-500/15 text-emerald-400"
            />
            <KpiCard
              icon={Clock}
              label="Avg Reply Time"
              value="2min"
              change="-45s"
              changeLabel="with AI agent"
              iconClass="bg-violet-500/15 text-violet-400"
            />
            <KpiCard
              icon={CheckCircle2}
              label="Deals Closed"
              value="12"
              change="+4"
              changeLabel="this month"
              iconClass="bg-amber-500/15 text-amber-400"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2 border-slate-700 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-base text-zinc-100">Recent Leads</CardTitle>
                <p className="text-sm text-zinc-400">
                  Latest inquiries scored and routed by the Lead Response Agent
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned Agent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <LeadRow key={lead.id} lead={lead} />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-base text-zinc-100">Lead Source ROI</CardTitle>
                <p className="text-sm text-zinc-400">Conversion rate by acquisition channel</p>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leadSourceROI} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis
                        dataKey="source"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        interval={0}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        formatter={(value) => [`${value}%`, 'Conversion Rate']}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #334155', backgroundColor: '#0f172a', color: '#e2e8f0',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                        cursor={{ fill: 'rgb(99 102 241 / 0.05)' }}
                      />
                      <Bar dataKey="conversionRate" radius={[6, 6, 0, 0]}>
                        {leadSourceROI.map((entry) => (
                          <Cell key={entry.source} fill={leadSourceColors[entry.source] ?? '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2.5">
                  {leadSourceROI.map((entry) => (
                    <div key={entry.source} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-zinc-500">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: leadSourceColors[entry.source] ?? '#6366f1' }}
                        />
                        {entry.source}
                      </span>
                      <span className="font-semibold text-zinc-100">{entry.conversionRate}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  const status = leadStatusConfig[lead.status];

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200">
            {lead.name.split(' ').map((n) => n[0]).join('')}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-zinc-100">{lead.name}</p>
            <p className="truncate text-xs text-zinc-500">{lead.propertyInterest}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-zinc-600">{lead.source}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-700">
            <div
              className={cn(
                'h-full rounded-full',
                lead.score >= 80 ? 'bg-emerald-500' : lead.score >= 60 ? 'bg-amber-500' : 'bg-red-500'
              )}
              style={{ width: `${lead.score}%` }}
            />
          </div>
          <span className={cn('text-sm font-semibold', leadScoreColor(lead.score))}>{lead.score}</span>
        </div>
      </TableCell>
      <TableCell>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
            status.badge
          )}
        >
          {status.label}
        </span>
      </TableCell>
      <TableCell className="text-zinc-600">{lead.assignedAgent}</TableCell>
    </TableRow>
  );
}
