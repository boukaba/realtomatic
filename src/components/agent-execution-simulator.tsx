'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Fingerprint,
  KeyRound,
  Loader2,
  MemoryStick,
  Network,
  ScrollText,
  ShieldCheck,
  Terminal,
  Timer,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { agents } from '@/lib/mock-data';
import type { AgentExecution, PolicyCheck } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  useAlertSimulation,
  useExecutionQueue,
  useRealtimeUpdates,
  useResourceMonitor,
  type ExecutionPriority,
  type QueuedExecution,
  type RealtimeEvent,
  type SimulatedAlert,
} from '@/hooks/use-agent-simulation';

type SimulationStage = 'queued' | 'booting' | 'policy-checks' | 'executing' | 'completed';

type LogType = 'command' | 'info' | 'success' | 'warning' | 'system';

interface LogEntry {
  id: number;
  at: number;
  message: string;
  type: LogType;
}

interface PolicyCheckDef {
  id: PolicyCheck['name'];
  label: string;
  icon: LucideIcon;
  details: string;
}

interface AgentExecutionSimulatorProps {
  agentId: string;
  input: string;
  onComplete: (result: AgentExecution) => void;
}

const QUEUE_DURATION = 500;
const BOOT_DURATION = 1000;
const POLICY_DURATION = 1000;
const EXECUTE_DURATION = 2500;
const TOTAL_DURATION = QUEUE_DURATION + BOOT_DURATION + POLICY_DURATION + EXECUTE_DURATION;

const POLICY_CHECKS: PolicyCheckDef[] = [
  {
    id: 'cosign',
    label: 'Cosign signature verification',
    icon: Fingerprint,
    details: 'ED25519 signature verified against registry key',
  },
  {
    id: 'sbom',
    label: 'SBOM vulnerability scan',
    icon: ScrollText,
    details: '0 critical, 0 high vulnerabilities across 142 packages',
  },
  {
    id: 'seccomp',
    label: 'Seccomp profile loaded',
    icon: ShieldCheck,
    details: 'Default profile applied — 324 syscalls allowed',
  },
  {
    id: 'egress',
    label: 'Network isolation enabled',
    icon: Network,
    details: 'Egress restricted to allowlist (3 endpoints)',
  },
  {
    id: 'secrets',
    label: 'Secrets injected',
    icon: KeyRound,
    details: '4 secrets injected via vault (ttl=15m)',
  },
];

const BOOT_LOGS: Array<Omit<LogEntry, 'id'>> = [
  { at: 550, message: 'firecracker[1]: Starting Firecracker v1.7.0 (KVM enabled)', type: 'system' },
  { at: 700, message: 'firecracker[1]: Configuring microVM — 2 vCPU, 4096 MB RAM', type: 'system' },
  { at: 850, message: 'firecracker[1]: Attaching rootfs (ext4, read-only, dm-verity)', type: 'system' },
  { at: 1050, message: 'firecracker[1]: virtio-net device ready (tap0, isolated bridge)', type: 'system' },
  { at: 1250, message: 'firecracker[1]: Guest kernel booted in 612ms', type: 'success' },
  { at: 1400, message: 'firecracker[1]: microVM is ready for workload', type: 'success' },
];

const STAGE_META: Record<SimulationStage, { label: string; className: string; pulse?: boolean }> = {
  queued: {
    label: 'Queued',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  },
  booting: {
    label: 'Booting VM',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  },
  'policy-checks': {
    label: 'Policy Checks',
    className: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
  },
  executing: {
    label: 'Executing',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    pulse: true,
  },
  completed: {
    label: 'Completed',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  },
};

const PRIORITY_STYLES: Record<ExecutionPriority, string> = {
  critical: 'border-red-500/30 bg-red-500/10 text-red-400',
  high: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  low: 'border-slate-500/30 bg-slate-500/10 text-slate-400',
};

const ALERT_SEVERITY_STYLES: Record<SimulatedAlert['severity'], string> = {
  critical: 'border-red-500/30 bg-red-500/10 text-red-400',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
};

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);
  return `T+${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function generateHexId(length: number): string {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function truncate(str: string, length: number): string {
  return str.length <= length ? str : `${str.slice(0, length)}...`;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function PolicyCheckBadge({
  icon: Icon,
  label,
  status,
}: {
  icon: LucideIcon;
  label: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-300',
        status === 'passed' && 'border-emerald-500/30 bg-emerald-500/5',
        status === 'running' && 'border-sky-500/30 bg-sky-500/5',
        status === 'pending' && 'border-slate-800 bg-slate-900/40 opacity-40',
        status === 'failed' && 'border-red-500/30 bg-red-500/5'
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          status === 'passed' && 'text-emerald-400',
          status === 'running' && 'text-sky-400',
          status === 'pending' && 'text-slate-600',
          status === 'failed' && 'text-red-400'
        )}
      />
      <span className="flex-1 text-sm text-slate-300">{label}</span>
      {status === 'passed' && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
      {status === 'running' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-400" />}
      {status === 'pending' && <div className="h-4 w-4 shrink-0 rounded-full border border-slate-700" />}
      {status === 'failed' && <XCircle className="h-4 w-4 shrink-0 text-red-400" />}
    </div>
  );
}

function VMStats({
  cpu,
  memory,
  duration,
}: {
  cpu: number;
  memory: number;
  duration: number;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 font-mono text-xs">
      <span className="flex items-center gap-1.5 text-slate-400">
        <Cpu className="h-3.5 w-3.5 text-sky-400" />
        <span className="text-slate-200">{cpu}%</span>
      </span>
      <span className="flex items-center gap-1.5 text-slate-400">
        <MemoryStick className="h-3.5 w-3.5 text-violet-400" />
        <span className="text-slate-200">{memory} MB</span>
      </span>
      <span className="flex items-center gap-1.5 text-slate-400">
        <Timer className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-slate-200">{(duration / 1000).toFixed(1)}s</span>
      </span>
    </div>
  );
}

function ExecutionLog({ logs }: { logs: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div
      ref={containerRef}
      className="max-h-64 overflow-y-auto rounded-lg border border-slate-800 bg-black/60 p-3 font-mono text-xs leading-relaxed"
    >
      {logs.map((log) => (
        <div key={log.id} className="flex gap-2">
          <span className="shrink-0 text-slate-600">[{formatTimestamp(log.at)}]</span>
          <span
            className={cn(
              log.type === 'command' && 'text-emerald-300',
              log.type === 'info' && 'text-slate-300',
              log.type === 'success' && 'text-emerald-400',
              log.type === 'warning' && 'text-amber-400',
              log.type === 'system' && 'text-slate-500'
            )}
          >
            {log.message}
          </span>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-1 text-slate-500">
        <span className="text-emerald-500">$</span>
        <span className="inline-block h-3.5 w-2 animate-pulse bg-emerald-500/70" />
      </div>
    </div>
  );
}

function SummaryItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn('mt-0.5 truncate text-sm text-slate-200', mono && 'font-mono')}>{value}</p>
    </div>
  );
}

function ResourceMonitorPanel() {
  const { metrics, history, setActiveExecutions } = useResourceMonitor({
    interval: 1000,
    baseLoad: 12,
  });

  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setActiveExecutions(Math.floor(Math.random() * 4) + 1);
  }, [setActiveExecutions]);

  const cpuColor = metrics.cpu > 80 ? 'text-red-400' : metrics.cpu > 60 ? 'text-amber-400' : 'text-emerald-400';
  const memColor = metrics.memory > 80 ? 'text-red-400' : metrics.memory > 60 ? 'text-amber-400' : 'text-emerald-400';
  const netColor = metrics.network > 80 ? 'text-red-400' : metrics.network > 60 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Activity className="h-4 w-4 text-indigo-400" />
          Cluster Resources
        </h4>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="text-[11px] text-slate-500 transition-colors hover:text-slate-300"
        >
          {showHistory ? 'Hide' : 'Show'} history
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <Cpu className="h-3 w-3" /> CPU
            </span>
            <span className={cn('font-mono text-xs font-semibold', cpuColor)}>{metrics.cpu.toFixed(0)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className={cn('h-full rounded-full transition-all duration-500', metrics.cpu > 80 ? 'bg-red-500' : metrics.cpu > 60 ? 'bg-amber-500' : 'bg-emerald-500')}
              style={{ width: `${metrics.cpu}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <MemoryStick className="h-3 w-3" /> Memory
            </span>
            <span className={cn('font-mono text-xs font-semibold', memColor)}>{metrics.memory.toFixed(0)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className={cn('h-full rounded-full transition-all duration-500', metrics.memory > 80 ? 'bg-red-500' : metrics.memory > 60 ? 'bg-amber-500' : 'bg-emerald-500')}
              style={{ width: `${metrics.memory}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <Network className="h-3 w-3" /> Network
            </span>
            <span className={cn('font-mono text-xs font-semibold', netColor)}>{metrics.network.toFixed(0)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className={cn('h-full rounded-full transition-all duration-500', metrics.network > 80 ? 'bg-red-500' : metrics.network > 60 ? 'bg-amber-500' : 'bg-emerald-500')}
              style={{ width: `${metrics.network}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <Zap className="h-3 w-3" /> Active VMs
            </span>
            <span className="font-mono text-xs font-semibold text-slate-200">{metrics.activeVMs}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${Math.min(100, metrics.activeVMs * 12.5)}%` }}
            />
          </div>
        </div>
      </div>

      {showHistory && history.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">History</span>
            <span className="text-[10px] text-slate-600">{history.length} points</span>
          </div>
          <div className="flex h-16 items-end gap-px">
            {history.slice(-30).map((point, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-indigo-500/40 transition-all"
                style={{ height: `${Math.max(4, point.cpu)}%` }}
                title={`CPU: ${point.cpu.toFixed(0)}% | Mem: ${point.memory.toFixed(0)}%`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExecutionQueuePanel() {
  const { queue, running, completed, stats, add, remove, clear, pause, resume, paused } = useExecutionQueue({
    maxConcurrent: 2,
  });

  const [selectedAgentId, setSelectedAgentId] = useState(agents[0].id);
  const [batchInput, setBatchInput] = useState('');
  const [batchPriority, setBatchPriority] = useState<ExecutionPriority>('medium');

  const handleAddToQueue = () => {
    if (!batchInput.trim()) return;
    add(selectedAgentId, batchInput.trim(), batchPriority);
    setBatchInput('');
  };

  const handleBatchAdd = () => {
    const lines = batchInput.split('\n').filter((l) => l.trim());
    lines.forEach((line, i) => {
      const priority: ExecutionPriority = i === 0 ? 'high' : batchPriority;
      add(selectedAgentId, line.trim(), priority);
    });
    setBatchInput('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Timer className="h-4 w-4 text-amber-400" />
          Execution Queue
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">
            {stats.queued} queued · {stats.running} running · {stats.completed} done
          </span>
          <button
            onClick={paused ? resume : pause}
            className="rounded-md border border-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={clear}
            className="rounded-md border border-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          className="h-8 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200 focus:border-indigo-500/50 focus:outline-none"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <select
          value={batchPriority}
          onChange={(e) => setBatchPriority(e.target.value as ExecutionPriority)}
          className="h-8 rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200 focus:border-indigo-500/50 focus:outline-none"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      <textarea
        value={batchInput}
        onChange={(e) => setBatchInput(e.target.value)}
        placeholder="Enter input (one per line for batch)..."
        rows={2}
        className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none"
      />

      <div className="flex gap-2">
        <button
          onClick={handleAddToQueue}
          disabled={!batchInput.trim()}
          className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
        >
          Add to Queue
        </button>
        <button
          onClick={handleBatchAdd}
          disabled={!batchInput.trim() || !batchInput.includes('\n')}
          className="flex-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40"
        >
          Batch Add
        </button>
      </div>

      {(queue.length > 0 || running.length > 0) && (
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {running.map((item) => (
            <QueueItem key={item.id} item={item} onRemove={remove} />
          ))}
          {queue.map((item) => (
            <QueueItem key={item.id} item={item} onRemove={remove} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="border-t border-slate-800 pt-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Recent Completed
          </p>
          <div className="space-y-1">
            {completed.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-[11px]">
                {item.status === 'completed' ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="h-3 w-3 shrink-0 text-red-400" />
                )}
                <span className="truncate text-slate-400">{item.agentName}</span>
                <span className="ml-auto shrink-0 text-slate-600">
                  {item.completedAt && item.startedAt
                    ? `${((item.completedAt - item.startedAt) / 1000).toFixed(1)}s`
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QueueItem({ item, onRemove }: { item: QueuedExecution; onRemove: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-2.5 py-1.5">
      <span
        className={cn(
          'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase',
          PRIORITY_STYLES[item.priority]
        )}
      >
        {item.priority}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-slate-300">{item.agentName}</p>
        <p className="truncate text-[10px] text-slate-500">{truncate(item.input, 40)}</p>
      </div>
      {item.status === 'running' ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-sky-400" />
      ) : (
        <div className="h-3 w-3 shrink-0 rounded-full border border-amber-500/50 bg-amber-500/20" />
      )}
      <button
        onClick={() => onRemove(item.id)}
        className="shrink-0 rounded p-0.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-300"
      >
        <XCircle className="h-3 w-3" />
      </button>
    </div>
  );
}

function AlertsPanel() {
  const { alerts, unacknowledgedCount, acknowledge, acknowledgeAll } = useAlertSimulation({
    enabled: true,
    minInterval: 4000,
    maxInterval: 12000,
  });

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <span className="text-xs text-slate-400">No active alerts</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Alerts
          {unacknowledgedCount > 0 && (
            <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
              {unacknowledgedCount}
            </span>
          )}
        </h4>
        {unacknowledgedCount > 0 && (
          <button
            onClick={acknowledgeAll}
            className="text-[10px] text-slate-500 transition-colors hover:text-slate-300"
          >
            Acknowledge all
          </button>
        )}
      </div>

      <div className="max-h-40 space-y-1.5 overflow-y-auto">
        {alerts.slice(0, 5).map((alert) => (
          <div
            key={alert.id}
            className={cn(
              'flex items-start gap-2 rounded-lg border px-2.5 py-2',
              ALERT_SEVERITY_STYLES[alert.severity],
              alert.acknowledged && 'opacity-50'
            )}
          >
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium">{alert.title}</p>
              <p className="truncate text-[10px] opacity-70">{alert.message}</p>
            </div>
            {!alert.acknowledged && (
              <button
                onClick={() => acknowledge(alert.id)}
                className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <Check className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RealtimeEventsPanel() {
  const { connected, events, clear } = useRealtimeUpdates({
    interval: 2500,
    enabled: true,
  });

  const getEventIcon = (type: RealtimeEvent['type']) => {
    switch (type) {
      case 'execution_started':
        return <Play className="h-3 w-3 text-sky-400" />;
      case 'execution_completed':
        return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
      case 'execution_failed':
        return <XCircle className="h-3 w-3 text-red-400" />;
      case 'policy_alert':
        return <ShieldCheck className="h-3 w-3 text-amber-400" />;
      case 'resource_warning':
        return <AlertTriangle className="h-3 w-3 text-orange-400" />;
      default:
        return <Zap className="h-3 w-3 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')} />
          Real-time Events
        </h4>
        <button
          onClick={clear}
          className="text-[10px] text-slate-500 transition-colors hover:text-slate-300"
        >
          Clear
        </button>
      </div>

      <div className="max-h-36 space-y-1 overflow-y-auto">
        {events.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-slate-600">Waiting for events...</p>
        ) : (
          events.slice(0, 8).map((event) => (
            <div key={event.id} className="flex items-center gap-2 text-[11px]">
              {getEventIcon(event.type)}
              <span className="truncate text-slate-400">{event.data.message as string}</span>
              <span className="ml-auto shrink-0 text-slate-600">
                {new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Activity({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function Play({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

export function AgentExecutionSimulator({ agentId, input, onComplete }: AgentExecutionSimulatorProps) {
  const [elapsed, setElapsed] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const startRef = useRef(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const agent = agents.find((a) => a.id === agentId);
  const agentName = agent?.name ?? 'Agent';

  const vmId = useMemo(() => `vm-${generateHexId(8)}`, []);
  const executionId = useMemo(() => `exec-${generateHexId(12)}`, []);

  const stage: SimulationStage =
    elapsed < QUEUE_DURATION
      ? 'queued'
      : elapsed < QUEUE_DURATION + BOOT_DURATION
        ? 'booting'
        : elapsed < QUEUE_DURATION + BOOT_DURATION + POLICY_DURATION
          ? 'policy-checks'
          : elapsed < TOTAL_DURATION
            ? 'executing'
            : 'completed';

  const buildExecution = useCallback(
    (durationMs: number): AgentExecution => ({
      id: executionId,
      agentId,
      agentName,
      input,
      output: `Task completed. Analyzed "${truncate(input, 60)}" — generated 12 findings, 3 recommendations, and 1 report. All outputs validated against schema v2.`,
      status: 'success',
      duration: durationMs,
      timestamp: new Date().toISOString(),
      confidence: 95 + (hashCode(input + agentId) % 40) / 10,
      vmId,
      policyChecks: POLICY_CHECKS.map((check) => ({
        name: check.id,
        status: 'passed' as const,
        details: check.details,
      })),
    }),
    [executionId, agentId, agentName, input, vmId]
  );

  useEffect(() => {
    startRef.current = performance.now();
    completedRef.current = false;
    const interval = window.setInterval(() => {
      const now = performance.now();
      const e = now - startRef.current;
      if (e >= TOTAL_DURATION) {
        window.clearInterval(interval);
        setElapsed(TOTAL_DURATION);
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.(buildExecution(TOTAL_DURATION));
        }
        return;
      }
      setElapsed(e);
    }, 50);
    return () => window.clearInterval(interval);
  }, [buildExecution]);

  const bootProgress =
    elapsed < QUEUE_DURATION
      ? 0
      : elapsed >= QUEUE_DURATION + BOOT_DURATION
        ? 100
        : ((elapsed - QUEUE_DURATION) / BOOT_DURATION) * 100;

  const wave = (period: number, min: number, max: number, phase = 0) =>
    Math.round(min + (max - min) * (0.5 + 0.5 * Math.sin((elapsed + phase) / period)));

  const cpuUsage =
    elapsed < QUEUE_DURATION
      ? 0
      : elapsed < QUEUE_DURATION + BOOT_DURATION
        ? Math.round(bootProgress * 0.35)
        : elapsed < QUEUE_DURATION + BOOT_DURATION + POLICY_DURATION
          ? wave(180, 8, 18)
          : wave(650, 22, 68);

  const memoryUsage =
    elapsed < QUEUE_DURATION
      ? 0
      : elapsed < QUEUE_DURATION + BOOT_DURATION
        ? Math.round(128 + bootProgress * 2.56)
        : elapsed < QUEUE_DURATION + BOOT_DURATION + POLICY_DURATION
          ? 384 + wave(220, -24, 24)
          : 512 + wave(800, -64, 96);

  const executionLogs = useMemo<Array<Omit<LogEntry, 'id'>>>(() => {
    const shortInput = truncate(input, 48);
    return [
      { at: 2500, message: `$ realtomatic-agent run --vm ${vmId} --input "${shortInput}"`, type: 'command' },
      { at: 2700, message: 'Parsing task input and resolving parameters...', type: 'info' },
      { at: 2900, message: `Loading agent configuration for ${agentName}...`, type: 'info' },
      { at: 3100, message: 'Fetching market data from 3 sources (CoStar, REIS, Census)...', type: 'info' },
      { at: 3350, message: 'Analyzing 12 lease documents (NLP pipeline, 98.1% confidence)...', type: 'info' },
      { at: 3600, message: 'Running valuation model (DCF, 10-year projection, 8.2% cap rate)...', type: 'info' },
      { at: 3850, message: 'Cross-referencing 24 comparable properties...', type: 'info' },
      { at: 4100, message: 'Generating execution report and recommendations...', type: 'info' },
      { at: 4350, message: 'Validating output against schema v2...', type: 'info' },
      { at: 4600, message: 'Uploading artifacts to encrypted storage...', type: 'info' },
      { at: 4800, message: 'Execution finished successfully — 0 errors, 0 warnings', type: 'success' },
    ];
  }, [input, vmId, agentName]);

  const allLogs = useMemo<LogEntry[]>(
    () => [
      ...BOOT_LOGS.map((l, i) => ({ ...l, id: i + 1 })),
      ...executionLogs.map((l, i) => ({ ...l, id: BOOT_LOGS.length + i + 1 })),
    ],
    [executionLogs]
  );

  const visibleLogs = allLogs.filter((l) => elapsed >= l.at);

  const policyStart = QUEUE_DURATION + BOOT_DURATION;
  const checkDuration = POLICY_DURATION / POLICY_CHECKS.length;
  const getCheckStatus = (index: number): 'pending' | 'running' | 'passed' => {
    const start = policyStart + index * checkDuration;
    if (elapsed < start) return 'pending';
    if (elapsed < start + checkDuration) return 'running';
    return 'passed';
  };

  const meta = STAGE_META[stage];
  const overallProgress = Math.min(100, (elapsed / TOTAL_DURATION) * 100);
  const bootSegments = 24;
  const filledSegments = Math.round((bootProgress / 100) * bootSegments);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/40">
      <div className="h-0.5 w-full bg-slate-900">
        <div
          className="h-full bg-emerald-500 transition-[width] duration-100 ease-linear"
          style={{ width: `${overallProgress}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-900/60"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
          <Terminal className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">Agent Execution</span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                meta.className
              )}
            >
              {meta.pulse && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
              )}
              {meta.label}
            </span>
          </div>
          <p className="truncate text-xs text-slate-500">
            {agentName} · {truncate(input, 64)}
          </p>
        </div>
        {stage !== 'queued' && (
          <span className="hidden shrink-0 font-mono text-xs text-slate-500 sm:block">{vmId}</span>
        )}
        <span className="shrink-0 font-mono text-xs text-slate-400">
          {(elapsed / 1000).toFixed(1)}s
        </span>
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        )}
      </button>

      {!collapsed && (
        <div className="border-t border-slate-800/80 px-4 py-4">
          {stage === 'queued' && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
              <p className="text-sm font-medium text-slate-200">Queued for execution</p>
              <p className="text-xs text-slate-500">
                Waiting for available microVM capacity
                <span className="animate-pulse">…</span>
              </p>
            </div>
          )}

          {stage === 'booting' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                  <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                  Booting Firecracker microVM
                </div>
                <span className="font-mono text-xs text-slate-500">{vmId}</span>
              </div>
              <div className="font-mono text-xs">
                <span className="text-slate-600">[</span>
                <span className="text-emerald-400">{'█'.repeat(filledSegments)}</span>
                <span className="text-slate-700">{'░'.repeat(bootSegments - filledSegments)}</span>
                <span className="text-slate-600">]</span>
                <span className="ml-2 text-slate-400">{bootProgress.toFixed(0)}%</span>
              </div>
              <ExecutionLog logs={visibleLogs} />
            </div>
          )}

          {stage === 'policy-checks' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <ShieldCheck className="h-4 w-4 text-violet-400" />
                Running security policy checks
              </div>
              <div className="space-y-2">
                {POLICY_CHECKS.map((check, i) => (
                  <PolicyCheckBadge
                    key={check.id}
                    icon={check.icon}
                    label={check.label}
                    status={getCheckStatus(i)}
                  />
                ))}
              </div>
            </div>
          )}

          {stage === 'executing' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                  <Zap className="h-4 w-4 text-amber-400" />
                  Executing agent workload
                </div>
                <VMStats cpu={cpuUsage} memory={memoryUsage} duration={elapsed} />
              </div>
              <ExecutionLog logs={visibleLogs} />
            </div>
          )}

          {stage === 'completed' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-emerald-300">
                    Execution completed successfully
                  </p>
                  <p className="text-xs text-slate-400">
                    Finished in {(TOTAL_DURATION / 1000).toFixed(1)}s with{' '}
                    {(95 + (hashCode(input + agentId) % 40) / 10).toFixed(1)}% confidence
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SummaryItem label="Agent" value={agentName} />
                <SummaryItem label="VM ID" value={vmId} mono />
                <SummaryItem label="Duration" value={`${(TOTAL_DURATION / 1000).toFixed(1)}s`} mono />
                <SummaryItem
                  label="Confidence"
                  value={`${(95 + (hashCode(input + agentId) % 40) / 10).toFixed(1)}%`}
                  mono
                />
              </div>

              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Input
                </p>
                <p className="truncate text-xs text-slate-400">{input}</p>
              </div>

              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Output
                </p>
                <div className="rounded-lg border border-slate-800 bg-black/60 p-3 font-mono text-xs leading-relaxed text-emerald-300/90">
                  Task completed. Analyzed &quot;{truncate(input, 60)}&quot; — generated 12
                  findings, 3 recommendations, and 1 report. All outputs validated against schema
                  v2.
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {POLICY_CHECKS.map((check) => (
                  <span
                    key={check.id}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[10px] text-emerald-400"
                    title={check.details}
                  >
                    <Check className="h-3 w-3" />
                    {check.label}
                  </span>
                ))}
              </div>

              <VMStats cpu={cpuUsage} memory={memoryUsage} duration={TOTAL_DURATION} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentSimulationDashboard() {
  const [activeTab, setActiveTab] = useState<'queue' | 'resources' | 'alerts' | 'events'>('queue');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['queue', 'resources', 'alerts', 'events'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === tab
                ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'queue' && <ExecutionQueuePanel />}
      {activeTab === 'resources' && <ResourceMonitorPanel />}
      {activeTab === 'alerts' && <AlertsPanel />}
      {activeTab === 'events' && <RealtimeEventsPanel />}
    </div>
  );
}

export default AgentExecutionSimulator;
