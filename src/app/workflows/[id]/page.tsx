'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity,
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  Cpu,
  Download,
  Gauge,
  GitBranch,
  HardDrive,
  Loader2,
  MemoryStick,
  Network,
  PauseCircle,
  Play,
  RotateCcw,
  ScrollText,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Terminal,
  Timer,
  User,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import AppLayout from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { workflows } from '@/lib/mock-data';
import type {
  PolicyCheck,
  Workflow,
  WorkflowStep,
  WorkflowStepStatus,
  WorkflowStatus,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const WORKFLOW_STATUS_CONFIG: Record<
  WorkflowStatus,
  { label: string; badge: string; dot: string }
> = {
  running: {
    label: 'Running',
    badge: 'border-transparent bg-blue-500/15 text-blue-400',
    dot: 'bg-blue-400',
  },
  completed: {
    label: 'Completed',
    badge: 'border-transparent bg-emerald-500/15 text-emerald-400',
    dot: 'bg-emerald-400',
  },
  failed: {
    label: 'Failed',
    badge: 'border-transparent bg-red-500/15 text-red-400',
    dot: 'bg-red-400',
  },
  pending_approval: {
    label: 'Pending Approval',
    badge: 'border-transparent bg-amber-500/15 text-amber-400',
    dot: 'bg-amber-400',
  },
};

const STEP_STATUS_CONFIG: Record<
  WorkflowStepStatus,
  { ring: string; iconBg: string; iconColor: string; label: string }
> = {
  completed: {
    ring: 'border-emerald-500/50',
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-400',
    label: 'Completed',
  },
  running: {
    ring: 'border-blue-500/60',
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-400',
    label: 'Running',
  },
  failed: {
    ring: 'border-red-500/50',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-400',
    label: 'Failed',
  },
  pending: {
    ring: 'border-slate-700',
    iconBg: 'bg-slate-800',
    iconColor: 'text-slate-500',
    label: 'Pending',
  },
  awaiting_approval: {
    ring: 'border-amber-500/60',
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-400',
    label: 'Awaiting Approval',
  },
};

const POLICY_DETAILS: Record<PolicyCheck['name'], { passed: string; warning: string; failed: string }> = {
  cosign: {
    passed: 'Image signed by registry.realtomatic.ai',
    warning: 'Signature verification pending',
    failed: 'Image signature invalid',
  },
  sbom: {
    passed: 'No vulnerabilities found',
    warning: '2 low-severity dependencies',
    failed: 'Critical vulnerability detected',
  },
  seccomp: {
    passed: 'Restricted profile active',
    warning: 'Baseline profile active',
    failed: 'Seccomp profile disabled',
  },
  egress: {
    passed: 'All egress within allowlist',
    warning: '1 request outside allowlist',
    failed: 'Unauthorized egress detected',
  },
  secrets: {
    passed: 'No secrets detected in image',
    warning: 'Potential secret in environment',
    failed: 'Hardcoded credentials detected',
  },
};

const CONNECTOR_STYLES = `
@keyframes realtomatic-dash {
  to { background-position-x: -14px; }
}
.realtomatic-connector-pending {
  background-image: repeating-linear-gradient(90deg, #64748b 0, #64748b 5px, transparent 5px, transparent 10px);
  background-size: 14px 2px;
  background-repeat: repeat-x;
  animation: realtomatic-dash 0.8s linear infinite;
}
@keyframes realtomatic-flow {
  to { background-position-x: 28px; }
}
.realtomatic-connector-running {
  background-image: repeating-linear-gradient(90deg, #3b82f6 0, #3b82f6 8px, rgba(59, 130, 246, 0.2) 8px, rgba(59, 130, 246, 0.2) 14px);
  background-size: 28px 2px;
  background-repeat: repeat-x;
  animation: realtomatic-flow 0.9s linear infinite;
}
`;

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function policyChecksForStep(step: WorkflowStep): PolicyCheck[] {
  const h = hashString(step.id);
  const names: PolicyCheck['name'][] = ['cosign', 'sbom', 'seccomp', 'egress'];
  return names.map((name, i) => {
    const r = (h >> (i * 5)) & 0x7;
    let status: PolicyCheck['status'] = 'passed';
    if (step.status === 'failed') {
      status = i === (h & 3) ? 'failed' : r < 2 ? 'warning' : 'passed';
    } else if (step.status === 'awaiting_approval') {
      status = r === 0 ? 'warning' : 'passed';
    } else if (r === 0) {
      status = 'warning';
    }
    return { name, status, details: POLICY_DETAILS[name][status] };
  });
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatElapsed(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return formatDuration(seconds);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function workflowProgress(workflow: Workflow): number {
  const weight = (s: WorkflowStepStatus) =>
    s === 'completed' ? 1 : s === 'running' || s === 'awaiting_approval' ? 0.5 : 0;
  const total = workflow.steps.reduce((acc, s) => acc + weight(s.status), 0);
  return Math.round((total / workflow.steps.length) * 100);
}

function averageConfidence(workflow: Workflow): number | null {
  const scored = workflow.steps.filter((s) => s.confidence !== null);
  if (scored.length === 0) return null;
  return scored.reduce((acc, s) => acc + (s.confidence ?? 0), 0) / scored.length;
}

function vmDetailsForStep(step: WorkflowStep) {
  const h = hashString(step.id);
  return {
    vmId: `vm-${step.id.replace(/[^a-z0-9]/gi, '').slice(0, 8)}`,
    region: ['us-east-1', 'us-west-2', 'eu-west-1'][h % 3],
    bootTime: step.startedAt,
    vcpus: 2 + (h % 3),
    cpuUsage: 32 + (h % 58),
    memoryMb: 1024 + (h % 7) * 256,
    memoryUsage: 38 + (h % 47),
    networkMb: 42 + (h % 420),
  };
}

function resourcesForWorkflow(workflow: Workflow) {
  const executed = workflow.steps.filter((s) => s.status !== 'pending');
  const cpuSeconds = executed.reduce(
    (acc, s) => acc + (s.duration ?? 0) * (2 + (hashString(s.id) % 3)),
    0
  );
  const memoryGb = executed.reduce((acc, s) => acc + (1024 + (hashString(s.id) % 7) * 256), 0) / 1024;
  const networkMb = executed.reduce((acc, s) => acc + 42 + (hashString(s.id) % 420), 0);
  return { cpuSeconds, memoryGb, networkMb, vms: executed.length };
}

function generateStepLogs(step: WorkflowStep): string[] {
  const h = hashString(step.id);
  const base = step.startedAt ? new Date(step.startedAt).getTime() : Date.now();
  const ts = (offsetMs: number) =>
    new Date(base + offsetMs).toISOString().replace('T', ' ').replace('Z', '');
  const vm = vmDetailsForStep(step);
  const checks = policyChecksForStep(step);
  const logs: string[] = [];

  if (step.status === 'pending') {
    logs.push(`[${ts(0)}] INFO    step.queued     step="${step.name}" agent="${step.agentName}" waiting_for_upstream=true`);
    return logs;
  }

  logs.push(`[${ts(0)}] INFO    step.started    step="${step.name}" agent="${step.agentName}"`);
  logs.push(`[${ts(120)}] INFO    vm.boot        id=${vm.vmId} region=${vm.region} vcpus=${vm.vcpus} memory=${vm.memoryMb}MB`);
  checks.forEach((c, i) => {
    logs.push(`[${ts(380 + i * 95)}] INFO    policy.check   ${c.name}=${c.status} "${c.details}"`);
  });
  logs.push(`[${ts(900)}] INFO    input.received bytes=${1024 + (h % 4096)} source="orchestrator"`);

  if (step.status === 'running') {
    logs.push(`[${ts(1400)}] INFO    agent.invoked  model="realtomatic-${step.agentName.toLowerCase().replace(/\s+/g, '-')}"`);
    logs.push(`[${ts(2100)}] INFO    step.running   elapsed=2s confidence=null`);
    return logs;
  }

  if (step.status === 'awaiting_approval') {
    logs.push(`[${ts(1200)}] INFO    output.written bytes=${512 + (h % 2048)}`);
    logs.push(`[${ts(1240)}] WARN    hitl.required   reason="confidence below approval threshold" confidence=${step.confidence ?? 'null'}`);
    logs.push(`[${ts(1241)}] INFO    step.paused     awaiting="human approval" notified=["sarah.chen@realtomatic.ai"]`);
    return logs;
  }

  if (step.status === 'failed') {
    logs.push(`[${ts(1100)}] ERROR   agent.error    message="upstream timeout after 30s" retryable=true`);
    logs.push(`[${ts(1105)}] ERROR   step.failed    step="${step.name}" duration=${step.duration ?? 420}s`);
    logs.push(`[${ts(1106)}] INFO    retry.scheduled attempt=2 policy="auto-retry up to 3 times"`);
    return logs;
  }

  logs.push(`[${ts(1200)}] INFO    output.written bytes=${512 + (h % 2048)}`);
  logs.push(`[${ts(1260)}] INFO    step.completed  step="${step.name}" duration=${step.duration ?? 5}s confidence=${step.confidence ?? 0.9}`);
  return logs;
}

interface AuditEvent {
  time: string;
  icon: LucideIcon;
  iconClass: string;
  actor: string;
  message: string;
}

function buildAuditTrail(workflow: Workflow): AuditEvent[] {
  const events: AuditEvent[] = [];
  const trigger =
    workflow.triggeredBy === 'system'
      ? 'System (Scheduled)'
      : workflow.triggeredBy.replace('user:', '');

  events.push({
    time: workflow.startedAt,
    icon: Play,
    iconClass: 'bg-blue-500/15 text-blue-400',
    actor: trigger,
    message: `Workflow "${workflow.name}" started`,
  });

  for (const step of workflow.steps) {
    if (step.startedAt) {
      events.push({
        time: step.startedAt,
        icon: Play,
        iconClass: 'bg-slate-700/40 text-slate-400',
        actor: step.agentName,
        message: `Step "${step.name}" started`,
      });
    }
    if (step.status === 'completed' && step.completedAt) {
      events.push({
        time: step.completedAt,
        icon: CheckCircle2,
        iconClass: 'bg-emerald-500/15 text-emerald-400',
        actor: step.agentName,
        message: `Step "${step.name}" completed in ${formatDuration(step.duration ?? 0)}`,
      });
    }
    if (step.status === 'failed' && step.completedAt) {
      events.push({
        time: step.completedAt,
        icon: XCircle,
        iconClass: 'bg-red-500/15 text-red-400',
        actor: step.agentName,
        message: `Step "${step.name}" failed — upstream timeout`,
      });
    }
    if (step.status === 'awaiting_approval') {
      events.push({
        time: step.startedAt ?? workflow.startedAt,
        icon: PauseCircle,
        iconClass: 'bg-amber-500/15 text-amber-400',
        actor: step.agentName,
        message: `Step "${step.name}" paused for human approval`,
      });
    }
  }

  if (workflow.completedAt) {
    events.push({
      time: workflow.completedAt,
      icon: GitBranch,
      iconClass: 'bg-emerald-500/15 text-emerald-400',
      actor: 'System',
      message: 'Workflow completed successfully',
    });
  }

  return events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function StepIcon({ status, size = 'md' }: { status: WorkflowStepStatus; size?: 'sm' | 'md' }) {
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  switch (status) {
    case 'completed':
      return <Check className={iconSize} />;
    case 'running':
      return <Loader2 className={`${iconSize} animate-spin`} />;
    case 'failed':
      return <XCircle className={iconSize} />;
    case 'awaiting_approval':
      return <PauseCircle className={iconSize} />;
    default:
      return <Clock className={iconSize} />;
  }
}

function JsonBlock({ data, label }: { data: string; label: string }) {
  let formatted = data;
  try {
    formatted = JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    formatted = data;
  }

  const tokens = formatted.split(
    /("(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  );

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <pre className="max-h-64 overflow-auto rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs leading-relaxed">
        <code>
          {tokens.map((token, i) => {
            if (!token) return null;
            let color = 'text-slate-400';
            if (/^".*":$/.test(token)) color = 'text-sky-300';
            else if (token.startsWith('"')) color = 'text-emerald-300';
            else if (/^(true|false|null)$/.test(token)) color = 'text-violet-300';
            else if (/^-?\d/.test(token)) color = 'text-amber-300';
            return (
              <span key={i} className={color}>
                {token}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

function PolicyCheckChip({ check }: { check: PolicyCheck }) {
  const config = {
    passed: { icon: ShieldCheck, classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
    warning: { icon: ShieldAlert, classes: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
    failed: { icon: ShieldX, classes: 'border-red-500/30 bg-red-500/10 text-red-400' },
  }[check.status];
  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${config.classes}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide">{check.name}</p>
        <p className="text-xs opacity-80">{check.details}</p>
      </div>
    </div>
  );
}

function connectorClass(status: WorkflowStepStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-gradient-to-r from-emerald-500 to-emerald-400';
    case 'running':
      return 'realtomatic-connector-running';
    case 'failed':
      return 'bg-gradient-to-r from-red-500 to-red-400';
    case 'awaiting_approval':
      return 'bg-gradient-to-r from-amber-500 to-amber-400';
    default:
      return 'realtomatic-connector-pending';
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            value >= 0.9
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              : value >= 0.75
                ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                : 'bg-gradient-to-r from-red-500 to-red-400'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs font-medium tabular-nums text-slate-300">{pct}%</span>
    </div>
  );
}

function WorkflowGraph({
  workflow,
  selectedStepId,
  onSelectStep,
  onRetryStep,
}: {
  workflow: Workflow;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onRetryStep: (stepId: string) => void;
}) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const steps = workflow.steps;

  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <style>{CONNECTOR_STYLES}</style>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-white">
            <GitBranch className="h-4 w-4 text-blue-400" />
            Workflow Graph
          </CardTitle>
          <CardDescription className="text-slate-500">
            Live execution pipeline — click any step to inspect it
          </CardDescription>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          {(
            [
              ['completed', 'Completed'],
              ['running', 'Running'],
              ['failed', 'Failed'],
              ['pending', 'Pending'],
              ['awaiting_approval', 'Awaiting'],
            ] as [WorkflowStepStatus, string][]
          ).map(([status, label]) => (
            <span key={status} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  status === 'completed' && 'bg-emerald-400',
                  status === 'running' && 'bg-blue-400 animate-pulse',
                  status === 'failed' && 'bg-red-400',
                  status === 'pending' && 'bg-slate-600',
                  status === 'awaiting_approval' && 'bg-amber-400'
                )}
              />
              {label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-start">
            {steps.map((step, i) => {
              const config = STEP_STATUS_CONFIG[step.status];
              const isSelected = selectedStepId === step.id;
              const isExpanded = expandedStepId === step.id;
              const isCurrent =
                step.status === 'running' || step.status === 'awaiting_approval';

              return (
                <div key={step.id} className="flex w-60 shrink-0 flex-col">
                  <div className="flex items-center">
                    <div
                      className={cn(
                        'h-0.5 flex-1',
                        i === 0 ? 'bg-transparent' : connectorClass(steps[i - 1].status)
                      )}
                    />
                    <div className="relative mx-1.5">
                      {step.status === 'running' && (
                        <span className="absolute inset-0 animate-ping rounded-full bg-blue-500/40" />
                      )}
                      {isCurrent && (
                        <span
                          className={cn(
                            'absolute -inset-1.5 animate-pulse rounded-full border',
                            step.status === 'running'
                              ? 'border-blue-500/40'
                              : 'border-amber-500/40'
                          )}
                        />
                      )}
                      <div
                        className={cn(
                          'relative flex h-10 w-10 items-center justify-center rounded-full border-2',
                          config.ring,
                          config.iconBg,
                          config.iconColor
                        )}
                      >
                        <StepIcon status={step.status} />
                      </div>
                    </div>
                    <div
                      className={cn(
                        'h-0.5 flex-1',
                        i === steps.length - 1 ? 'bg-transparent' : connectorClass(step.status)
                      )}
                    />
                  </div>

                  <div className="flex flex-1 flex-col px-1.5 pt-3">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectStep(step.id)}
                      onKeyDown={(e) => e.key === 'Enter' && onSelectStep(step.id)}
                      className={cn(
                        'flex flex-1 cursor-pointer flex-col rounded-xl border bg-slate-900/60 p-3.5 text-left transition-all hover:border-slate-600',
                        isSelected
                          ? 'border-blue-500/60 shadow-lg shadow-blue-500/10'
                          : 'border-slate-800',
                        isCurrent && !isSelected && 'border-slate-700'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-800 text-[10px] font-semibold text-slate-400">
                          {i + 1}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                            config.iconBg,
                            config.iconColor
                          )}
                        >
                          <StepIcon status={step.status} size="sm" />
                          {config.label}
                        </span>
                      </div>

                      <p className="mt-2.5 truncate text-sm font-semibold text-white">
                        {step.name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
                        <Bot className="h-3 w-3 shrink-0" />
                        {step.agentName}
                      </p>

                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <Timer className="h-3 w-3" />
                            Duration
                          </span>
                          <span className="font-medium tabular-nums text-slate-300">
                            {step.duration !== null
                              ? formatDuration(step.duration)
                              : step.status === 'running'
                                ? 'Running…'
                                : '—'}
                          </span>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <Gauge className="h-3 w-3" />
                              Confidence
                            </span>
                          </div>
                          {step.confidence !== null ? (
                            <ConfidenceBar value={step.confidence} />
                          ) : (
                            <div className="h-1.5 w-full rounded-full bg-slate-800" />
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedStepId(isExpanded ? null : step.id);
                        }}
                        className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
                      >
                        <span className="flex items-center gap-1.5">
                          <ScrollText className="h-3 w-3" />
                          Input / Output
                        </span>
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 transition-transform',
                            isExpanded && 'rotate-180'
                          )}
                        />
                      </button>

                      {isExpanded && (
                        <div className="mt-2.5 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                          <JsonBlock data={step.input} label="Input" />
                          {step.output ? (
                            <JsonBlock data={step.output} label="Output" />
                          ) : (
                            <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-600">
                              No output yet
                            </div>
                          )}
                        </div>
                      )}

                      {step.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetryStep(step.id);
                          }}
                          className="mt-3 w-full border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Retry Step
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconClass,
  children,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  iconClass: string;
  children?: React.ReactNode;
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
        {children}
      </CardContent>
    </Card>
  );
}

function StepDetailDialog({
  workflow,
  step,
  onClose,
  onRetry,
  onApprove,
}: {
  workflow: Workflow;
  step: WorkflowStep;
  onClose: () => void;
  onRetry: (stepId: string) => void;
  onApprove: (stepId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState('io');
  const config = STEP_STATUS_CONFIG[step.status];
  const stepIndex = workflow.steps.findIndex((s) => s.id === step.id);
  const checks = policyChecksForStep(step);
  const vm = vmDetailsForStep(step);
  const logs = generateStepLogs(step);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-full max-w-4xl overflow-y-auto border-slate-800 bg-slate-900">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2.5 pr-8">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-sm font-bold text-slate-300">
              {stepIndex + 1}
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg text-white">{step.name}</DialogTitle>
              <DialogDescription className="text-slate-500">
                {step.agentName} · Step {stepIndex + 1} of {workflow.steps.length}
              </DialogDescription>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                config.iconBg,
                config.iconColor
              )}
            >
              <StepIcon status={step.status} size="sm" />
              {config.label}
            </span>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-9 gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
            {[
              { id: 'io', label: 'Input / Output' },
              { id: 'logs', label: 'Execution Logs' },
              { id: 'policy', label: 'Policy Checks' },
              { id: 'vm', label: 'VM Details' },
            ].map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="io" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <JsonBlock data={step.input} label="Input Data" />
              {step.output ? (
                <JsonBlock data={step.output} label="Output Data" />
              ) : (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Output Data
                  </p>
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-800 text-sm text-slate-600">
                    No output yet
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900">
              <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5">
                <Terminal className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-400">
                  {step.id}.log — {step.agentName}
                </span>
                <span className="ml-auto flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
                </span>
              </div>
              <pre className="max-h-80 overflow-auto p-4 font-mono text-[11px] leading-relaxed">
                {logs.map((line, i) => {
                  const level = line.match(/\] (INFO|WARN|ERROR|DEBUG)/)?.[1] ?? 'INFO';
                  return (
                    <div key={i} className="flex gap-3">
                      <span className="shrink-0 text-slate-600">
                        {line.slice(1, line.indexOf(']'))}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 font-semibold',
                          level === 'ERROR'
                            ? 'text-red-400'
                            : level === 'WARN'
                              ? 'text-amber-400'
                              : 'text-blue-400'
                        )}
                      >
                        {level}
                      </span>
                      <span className="text-slate-400">
                        {line.slice(line.indexOf('] ') + 2 + level.length + 1)}
                      </span>
                    </div>
                  );
                })}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="policy" className="mt-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {checks.map((check) => (
                <PolicyCheckChip key={check.name} check={check} />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
              <span className="text-sm text-slate-400">Overall policy verdict</span>
              <Badge
                className={cn(
                  'border-transparent',
                  checks.every((c) => c.status === 'passed')
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : checks.some((c) => c.status === 'failed')
                      ? 'bg-red-500/15 text-red-400'
                      : 'bg-amber-500/15 text-amber-400'
                )}
              >
                {checks.every((c) => c.status === 'passed')
                  ? 'All Checks Passed'
                  : checks.some((c) => c.status === 'failed')
                    ? 'Checks Failed'
                    : 'Warnings Present'}
              </Badge>
            </div>
          </TabsContent>

          <TabsContent value="vm" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2.5">
                {[
                  { label: 'VM ID', value: vm.vmId, icon: Server },
                  { label: 'Region', value: vm.region, icon: HardDrive },
                  { label: 'Boot Time', value: step.startedAt ? formatDateTime(step.startedAt) : '—', icon: Clock },
                  { label: 'vCPUs Allocated', value: `${vm.vcpus} vCPU`, icon: Cpu },
                  { label: 'Memory Allocated', value: `${vm.memoryMb} MB`, icon: MemoryStick },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-sm text-slate-400">
                      <row.icon className="h-3.5 w-3.5 text-slate-500" />
                      {row.label}
                    </span>
                    <span className="font-mono text-xs text-slate-200">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Cpu className="h-3.5 w-3.5 text-slate-500" />
                      CPU Usage
                    </span>
                    <span className="font-medium tabular-nums text-slate-200">{vm.cpuUsage}%</span>
                  </div>
                  <Progress
                    value={vm.cpuUsage}
                    className="h-1.5 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-blue-600 [&>div]:to-blue-400"
                  />
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <MemoryStick className="h-3.5 w-3.5 text-slate-500" />
                      Memory Usage
                    </span>
                    <span className="font-medium tabular-nums text-slate-200">
                      {vm.memoryUsage}% of {vm.memoryMb} MB
                    </span>
                  </div>
                  <Progress
                    value={vm.memoryUsage}
                    className="h-1.5 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-violet-600 [&>div]:to-violet-400"
                  />
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Network className="h-3.5 w-3.5 text-slate-500" />
                      Network Transferred
                    </span>
                    <span className="font-medium tabular-nums text-slate-200">{vm.networkMb} MB</span>
                  </div>
                  <Progress
                    value={Math.min(100, Math.round(vm.networkMb / 5))}
                    className="h-1.5 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-emerald-600 [&>div]:to-emerald-400"
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-800 pt-4">
          {step.status === 'failed' && (
            <Button
              onClick={() => onRetry(step.id)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              <RotateCcw className="h-4 w-4" />
              Retry Step
            </Button>
          )}
          {step.status === 'awaiting_approval' && (
            <Button
              onClick={() => onApprove(step.id)}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCheck className="h-4 w-4" />
              Approve Step
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800 hover:text-white"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowLogsDialog({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const allLogs = workflow.steps.flatMap((step) =>
    generateStepLogs(step).map((line) => ({ step: step.name, line }))
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] w-full max-w-3xl overflow-y-auto border-slate-800 bg-slate-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-white">
            <Terminal className="h-5 w-5 text-blue-400" />
            Workflow Execution Logs
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            {workflow.name} — {allLogs.length} log lines across {workflow.steps.length} steps
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5">
            <span className="text-xs font-medium text-slate-400">orchestrator — full trace</span>
            <span className="ml-auto flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
            </span>
          </div>
          <pre className="max-h-[55vh] overflow-auto p-4 font-mono text-[11px] leading-relaxed">
            {allLogs.map((entry, i) => {
              const level = entry.line.match(/\] (INFO|WARN|ERROR|DEBUG)/)?.[1] ?? 'INFO';
              return (
                <div key={i} className="flex gap-3">
                  <span className="shrink-0 text-slate-600">
                    {entry.line.slice(1, entry.line.indexOf(']'))}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 font-semibold',
                      level === 'ERROR'
                        ? 'text-red-400'
                        : level === 'WARN'
                          ? 'text-amber-400'
                          : 'text-blue-400'
                    )}
                  >
                    {level}
                  </span>
                  <span className="text-slate-500">[{entry.step}]</span>
                  <span className="text-slate-400">
                    {entry.line.slice(entry.line.indexOf('] ') + 2 + level.length + 1)}
                  </span>
                </div>
              );
            })}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WorkflowDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [workflow, setWorkflow] = useState<Workflow | null>(() =>
    workflows.find((w) => w.id === rawId) ?? null
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!workflow) return;
    const runningStep = workflow.steps.find((s) => s.status === 'running');
    if (!runningStep) return;

    const timeout = setTimeout(() => {
      setWorkflow((prev) => {
        if (!prev) return prev;
        const idx = prev.steps.findIndex((s) => s.id === runningStep.id && s.status === 'running');
        if (idx === -1) return prev;
        const completedAt = new Date().toISOString();
        const duration = runningStep.startedAt
          ? Math.max(1, Math.round((Date.now() - new Date(runningStep.startedAt).getTime()) / 1000))
          : 5;
        const confidence = Math.round((0.86 + (hashString(runningStep.id) % 12) / 100) * 100) / 100;
        const steps = prev.steps.map((s, i) => {
          if (i === idx) {
            return {
              ...s,
              status: 'completed' as const,
              completedAt,
              duration,
              output: `${s.input} → processed successfully`,
              confidence,
            };
          }
          if (i === idx + 1 && s.status === 'pending') {
            return { ...s, status: 'running' as const, startedAt: completedAt };
          }
          return s;
        });
        const allDone = steps.every((s) => s.status === 'completed');
        return {
          ...prev,
          status: allDone ? ('completed' as const) : ('running' as const),
          completedAt: allDone ? completedAt : null,
          steps,
        };
      });
    }, 5000);

    return () => clearTimeout(timeout);
  }, [workflow]);

  const selectedStep = workflow?.steps.find((s) => s.id === selectedStepId) ?? null;

  const progress = workflow ? workflowProgress(workflow) : 0;
  const confidence = workflow ? averageConfidence(workflow) : null;
  const completedSteps = workflow?.steps.filter((s) => s.status === 'completed').length ?? 0;
  const resources = useMemo(() => (workflow ? resourcesForWorkflow(workflow) : null), [workflow]);
  const auditTrail = useMemo(() => (workflow ? buildAuditTrail(workflow) : []), [workflow]);

  const totalDuration = useMemo(() => {
    if (!workflow) return 0;
    if (workflow.status === 'completed' && workflow.completedAt) {
      return Math.round(
        (new Date(workflow.completedAt).getTime() - new Date(workflow.startedAt).getTime()) / 1000
      );
    }
    const lastFinished = [...workflow.steps].reverse().find((s) => s.completedAt);
    const end = lastFinished?.completedAt
      ? new Date(lastFinished.completedAt).getTime()
      : now;
    return Math.max(0, Math.round((end - new Date(workflow.startedAt).getTime()) / 1000));
  }, [workflow, now]);

  if (!workflow) {
    return (
      <AppLayout title="Workflow Not Found">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 py-24">
          <GitBranch className="h-12 w-12 text-slate-600" />
          <p className="mt-4 text-lg font-semibold text-slate-300">Workflow not found</p>
          <p className="mt-1 text-sm text-slate-500">
            No workflow exists with ID <span className="font-mono text-slate-400">{rawId}</span>
          </p>
          <Button
            variant="outline"
            className="mt-6 border-slate-700 bg-slate-80/50 text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => router.push('/workflows')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Workflows
          </Button>
        </div>
      </AppLayout>
    );
  }

  const statusConfig = WORKFLOW_STATUS_CONFIG[workflow.status];
  const triggerLabel =
    workflow.triggeredBy === 'system'
      ? 'System (Scheduled)'
      : workflow.triggeredBy.replace('user:', '');

  const advanceFromStep = (stepId: string) => {
    setWorkflow((prev) => {
      if (!prev) return prev;
      const idx = prev.steps.findIndex((s) => s.id === stepId);
      if (idx === -1) return prev;
      const nowIso = new Date().toISOString();
      const steps = prev.steps.map((s, i) => {
        if (i === idx) {
          return { ...s, status: 'running' as const, startedAt: nowIso, completedAt: null, duration: null };
        }
        if (i === idx + 1 && s.status === 'pending') {
          return { ...s, status: 'pending' as const };
        }
        return s;
      });
      return { ...prev, status: 'running' as const, completedAt: null, steps };
    });
  };

  const completeRunningStep = (stepId: string) => {
    setWorkflow((prev) => {
      if (!prev) return prev;
      const idx = prev.steps.findIndex((s) => s.id === stepId);
      if (idx === -1) return prev;
      const completedAt = new Date().toISOString();
      const step = prev.steps[idx];
      const duration = step.startedAt
        ? Math.max(1, Math.round((Date.now() - new Date(step.startedAt).getTime()) / 1000))
        : 5;
      const confidence = Math.round((0.86 + (hashString(step.id) % 12) / 100) * 100) / 100;
      const steps = prev.steps.map((s, i) => {
        if (i === idx) {
          return {
            ...s,
            status: 'completed' as const,
            completedAt,
            duration,
            output: s.output ?? `${s.input} → processed successfully`,
            confidence,
          };
        }
        if (i === idx + 1 && s.status === 'pending') {
          return { ...s, status: 'running' as const, startedAt: completedAt };
        }
        return s;
      });
      const allDone = steps.every((s) => s.status === 'completed');
      return {
        ...prev,
        status: allDone ? ('completed' as const) : ('running' as const),
        completedAt: allDone ? completedAt : null,
        steps,
      };
    });
  };

  const handleRetryStep = (stepId: string) => {
    advanceFromStep(stepId);
    setTimeout(() => completeRunningStep(stepId), 4000);
  };

  const handleApproveStep = (stepId: string) => {
    setWorkflow((prev) => {
      if (!prev) return prev;
      const idx = prev.steps.findIndex((s) => s.id === stepId);
      if (idx === -1) return prev;
      const completedAt = new Date().toISOString();
      const steps = prev.steps.map((s, i) => {
        if (i === idx) {
          return {
            ...s,
            status: 'completed' as const,
            completedAt,
            duration: s.duration ?? 8,
            output: s.output ?? 'Approved by sarah.chen@realtomatic.ai',
          };
        }
        if (i === idx + 1 && s.status === 'pending') {
          return { ...s, status: 'running' as const, startedAt: completedAt };
        }
        return s;
      });
      const allDone = steps.every((s) => s.status === 'completed');
      return {
        ...prev,
        status: allDone ? ('completed' as const) : ('running' as const),
        completedAt: allDone ? completedAt : null,
        steps,
      };
    });
  };

  const handleExportReport = () => {
    const report = {
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        status: workflow.status,
        triggeredBy: workflow.triggeredBy,
        startedAt: workflow.startedAt,
        completedAt: workflow.completedAt,
      },
      summary: {
        totalDuration: `${totalDuration}s`,
        stepsCompleted: completedSteps,
        totalSteps: workflow.steps.length,
        overallConfidence: confidence !== null ? `${Math.round(confidence * 100)}%` : null,
        resources,
      },
      steps: workflow.steps.map((s) => ({
        ...s,
        policyChecks: policyChecksForStep(s),
        vm: vmDetailsForStep(s),
        logs: generateStepLogs(s),
      })),
      auditTrail,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `workflow-${workflow.id}-report.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title={workflow.name}>
      <div className="space-y-6">
        <Link
          href="/workflows"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Workflows
        </Link>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardContent className="p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    {workflow.name}
                  </h2>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium',
                      statusConfig.badge
                    )}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      {workflow.status === 'running' && (
                        <span
                          className={cn(
                            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                            statusConfig.dot
                          )}
                        />
                      )}
                      <span
                        className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', statusConfig.dot)}
                      />
                    </span>
                    {statusConfig.label}
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                    {workflow.id}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                  {workflow.description}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                  {workflow.triggeredBy === 'system' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-amber-400" />
                      Triggered by <span className="font-medium text-slate-300">{triggerLabel}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-blue-400" />
                      Triggered by <span className="font-medium text-slate-300">{triggerLabel}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Started {formatDateTime(workflow.startedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5" />
                    {workflow.status === 'completed' ? 'Duration' : 'Elapsed'}:{' '}
                    <span className="font-medium tabular-nums text-slate-200">
                      {formatDuration(totalDuration)}
                    </span>
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {workflow.status === 'failed' && (
                  <Button
                    onClick={() => {
                      const failed = workflow.steps.find((s) => s.status === 'failed');
                      if (failed) handleRetryStep(failed.id);
                    }}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retry Workflow
                  </Button>
                )}
                {workflow.status === 'pending_approval' && (
                  <Button
                    onClick={() => {
                      const awaiting = workflow.steps.find((s) => s.status === 'awaiting_approval');
                      if (awaiting) handleApproveStep(awaiting.id);
                    }}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <CheckCheck className="h-4 w-4" />
                    Approve
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setLogsOpen(true)}
                  className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <ScrollText className="h-4 w-4" />
                  View Logs
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExportReport}
                  className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <Download className="h-4 w-4" />
                  Export Report
                </Button>
              </div>
            </div>

            <div className="mt-5 space-y-2 border-t border-slate-800 pt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-300">Overall Progress</span>
                <span className="font-semibold text-white">{progress}%</span>
              </div>
              <Progress
                value={progress}
                className="h-2 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-blue-600 [&>div]:to-blue-400"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Duration"
            value={formatDuration(totalDuration)}
            sub={
              workflow.status === 'completed'
                ? `Finished ${formatDateTime(workflow.completedAt ?? workflow.startedAt)}`
                : `Running for ${formatElapsed(workflow.startedAt, now)}`
            }
            icon={Timer}
            iconClass="bg-blue-500/15 text-blue-400"
          />
          <StatCard
            label="Steps"
            value={`${completedSteps}/${workflow.steps.length}`}
            sub={`${workflow.steps.length - completedSteps} remaining`}
            icon={CircleDot}
            iconClass="bg-violet-500/15 text-violet-400"
          >
            <Progress
              value={workflow.steps.length > 0 ? (completedSteps / workflow.steps.length) * 100 : 0}
              className="mt-3 h-1.5 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-violet-600 [&>div]:to-violet-400"
            />
          </StatCard>
          <StatCard
            label="Overall Confidence"
            value={confidence !== null ? `${Math.round(confidence * 100)}%` : '—'}
            sub="Average across executed steps"
            icon={Gauge}
            iconClass="bg-emerald-500/15 text-emerald-400"
          >
            {confidence !== null && (
              <div className="mt-3">
                <ConfidenceBar value={confidence} />
              </div>
            )}
          </StatCard>
          <StatCard
            label="Resources Used"
            value={`${resources?.vms ?? 0} VMs`}
            sub="Provisioned for this run"
            icon={Server}
            iconClass="bg-amber-500/15 text-amber-400"
          >
            <div className="mt-3 space-y-1.5 text-[11px] text-slate-500">
              <p className="flex items-center gap-1.5">
                <Cpu className="h-3 w-3" />
                <span className="font-medium tabular-nums text-slate-300">
                  {Math.round(resources?.cpuSeconds ?? 0)} vCPU·s
                </span>
              </p>
              <p className="flex items-center gap-1.5">
                <MemoryStick className="h-3 w-3" />
                <span className="font-medium tabular-nums text-slate-300">
                  {(resources?.memoryGb ?? 0).toFixed(1)} GB memory
                </span>
              </p>
              <p className="flex items-center gap-1.5">
                <Network className="h-3 w-3" />
                <span className="font-medium tabular-nums text-slate-300">
                  {Math.round(resources?.networkMb ?? 0)} MB network
                </span>
              </p>
            </div>
          </StatCard>
        </div>

        <WorkflowGraph
          workflow={workflow}
          selectedStepId={selectedStepId}
          onSelectStep={setSelectedStepId}
          onRetryStep={handleRetryStep}
        />

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Activity className="h-4 w-4 text-blue-400" />
              Audit Trail
            </CardTitle>
            <CardDescription className="text-slate-500">
              Immutable record of every event in this workflow run
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-4 pl-7 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-slate-800">
              {auditTrail.map((event, i) => (
                <div key={i} className="relative">
                  <span
                    className={cn(
                      'absolute -left-7 top-0 flex h-7 w-7 items-center justify-center rounded-full border border-slate-800',
                      event.iconClass
                    )}
                  >
                    <event.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-sm text-slate-200">{event.message}</p>
                    <span className="text-xs text-slate-500">{event.actor}</span>
                  </div>
                  <p className="mt-0.5 text-xs tabular-nums text-slate-600">
                    {format(event.time, 'MMM d, yyyy h:mm:ss a')} ·{' '}
                    {formatDistanceToNow(new Date(event.time), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedStep && (
        <StepDetailDialog
          workflow={workflow}
          step={selectedStep}
          onClose={() => setSelectedStepId(null)}
          onRetry={handleRetryStep}
          onApprove={handleApproveStep}
        />
      )}

      {logsOpen && <WorkflowLogsDialog workflow={workflow} onClose={() => setLogsOpen(false)} />}
    </AppLayout>
  );
}
