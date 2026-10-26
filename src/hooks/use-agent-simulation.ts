'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { agents } from '@/lib/mock-data';
import type { AgentExecution, PolicyCheck } from '@/lib/types';
import { generateId } from '@/lib/utils';

export type SimulationStage = 'queued' | 'booting' | 'policy-checks' | 'executing' | 'completed' | 'failed';

export type SimulationStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface SimulationLog {
  id: string;
  at: number;
  message: string;
  type: 'command' | 'info' | 'success' | 'warning' | 'system' | 'error';
}

export interface SimulationState {
  status: SimulationStatus;
  stage: SimulationStage;
  progress: number;
  elapsed: number;
  logs: SimulationLog[];
  result: AgentExecution | null;
  vmId: string;
  executionId: string;
}

export interface UseAgentSimulationOptions {
  agentId: string;
  input: string;
  autoStart?: boolean;
  speed?: number;
  onComplete?: (result: AgentExecution) => void;
  onLog?: (log: SimulationLog) => void;
}

const QUEUE_DURATION = 500;
const BOOT_DURATION = 1000;
const POLICY_DURATION = 1000;
const EXECUTE_DURATION = 2500;
const TOTAL_DURATION = QUEUE_DURATION + BOOT_DURATION + POLICY_DURATION + EXECUTE_DURATION;

const BOOT_LOGS: Array<Omit<SimulationLog, 'id'>> = [
  { at: 550, message: 'firecracker[1]: Starting Firecracker v1.7.0 (KVM enabled)', type: 'system' },
  { at: 700, message: 'firecracker[1]: Configuring microVM — 2 vCPU, 4096 MB RAM', type: 'system' },
  { at: 850, message: 'firecracker[1]: Attaching rootfs (ext4, read-only, dm-verity)', type: 'system' },
  { at: 1050, message: 'firecracker[1]: virtio-net device ready (tap0, isolated bridge)', type: 'system' },
  { at: 1250, message: 'firecracker[1]: Guest kernel booted in 612ms', type: 'success' },
  { at: 1400, message: 'firecracker[1]: microVM is ready for workload', type: 'success' },
];

function generateHexId(length: number): string {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function truncate(str: string, length: number): string {
  return str.length <= length ? str : `${str.slice(0, length)}...`;
}

function buildExecutionLogs(agentName: string, input: string, vmId: string): Array<Omit<SimulationLog, 'id'>> {
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
}

function buildPolicyChecks(): PolicyCheck[] {
  return [
    { name: 'cosign', status: 'passed', details: 'ED25519 signature verified against registry key' },
    { name: 'sbom', status: 'passed', details: '0 critical, 0 high vulnerabilities across 142 packages' },
    { name: 'seccomp', status: 'passed', details: 'Default profile applied — 324 syscalls allowed' },
    { name: 'egress', status: 'passed', details: 'Egress restricted to allowlist (3 endpoints)' },
    { name: 'secrets', status: 'passed', details: '4 secrets injected via vault (ttl=15m)' },
  ];
}

export function useAgentSimulation(options: UseAgentSimulationOptions) {
  const { agentId, input, autoStart = false, speed = 1, onComplete, onLog } = options;

  const [state, setState] = useState<SimulationState>(() => ({
    status: 'idle',
    stage: 'queued',
    progress: 0,
    elapsed: 0,
    logs: [],
    result: null,
    vmId: `vm-${generateHexId(8)}`,
    executionId: `exec-${generateHexId(12)}`,
  }));

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const pausedAtRef = useRef(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onLogRef = useRef(onLog);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  const agent = agents.find((a) => a.id === agentId);
  const agentName = agent?.name ?? 'Agent';

  const allLogs = useMemo<SimulationLog[]>(() => {
    const boot = BOOT_LOGS.map((l, i) => ({ ...l, id: `boot-${i}` }));
    const exec = buildExecutionLogs(agentName, input, state.vmId).map((l, i) => ({
      ...l,
      id: `exec-${i}`,
    }));
    return [...boot, ...exec];
  }, [agentName, input, state.vmId]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState((prev) => {
      if (prev.status === 'running') {
        return { ...prev, status: 'paused' };
      }
      return prev;
    });
  }, []);

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    completedRef.current = false;
    setState({
      status: 'idle',
      stage: 'queued',
      progress: 0,
      elapsed: 0,
      logs: [],
      result: null,
      vmId: `vm-${generateHexId(8)}`,
      executionId: `exec-${generateHexId(12)}`,
    });
  }, []);

  const start = useCallback(() => {
    if (intervalRef.current) return;

    if (state.status === 'paused') {
      startRef.current = performance.now() - pausedAtRef.current;
    } else {
      startRef.current = performance.now();
      completedRef.current = false;
      setState((prev) => ({
        ...prev,
        status: 'running',
        stage: 'queued',
        progress: 0,
        elapsed: 0,
        logs: [],
        result: null,
      }));
    }

    const tickMs = 50;
    intervalRef.current = setInterval(() => {
      const now = performance.now();
      const e = (now - startRef.current) * speed;

      if (e >= TOTAL_DURATION) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        const result: AgentExecution = {
          id: state.executionId,
          agentId,
          agentName,
          input,
          output: `Task completed. Analyzed "${truncate(input, 60)}" — generated 12 findings, 3 recommendations, and 1 report. All outputs validated against schema v2.`,
          status: 'success',
          duration: TOTAL_DURATION,
          timestamp: new Date().toISOString(),
          confidence: 95 + (hashCode(input + agentId) % 40) / 10,
          vmId: state.vmId,
          policyChecks: buildPolicyChecks(),
        };

        setState((prev) => ({
          ...prev,
          status: 'completed',
          stage: 'completed',
          progress: 100,
          elapsed: TOTAL_DURATION,
          logs: allLogs,
          result,
        }));

        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.(result);
        }
        return;
      }

      const stage: SimulationStage =
        e < QUEUE_DURATION
          ? 'queued'
          : e < QUEUE_DURATION + BOOT_DURATION
            ? 'booting'
            : e < QUEUE_DURATION + BOOT_DURATION + POLICY_DURATION
              ? 'policy-checks'
              : 'executing';

      const visibleLogs = allLogs.filter((l) => e >= l.at);
      visibleLogs.forEach((log) => onLogRef.current?.(log));

      setState((prev) => ({
        ...prev,
        status: 'running',
        stage,
        progress: Math.min(100, (e / TOTAL_DURATION) * 100),
        elapsed: e,
        logs: visibleLogs,
      }));
    }, tickMs);

    setState((prev) => ({ ...prev, status: 'running' }));
  }, [state.status, state.executionId, state.vmId, agentId, agentName, input, allLogs, speed]);

  const restart = useCallback(() => {
    reset();
    setTimeout(() => start(), 50);
  }, [reset, start]);

  useEffect(() => {
    if (autoStart) {
      const timer = setTimeout(() => start(), 100);
      return () => clearTimeout(timer);
    }
  }, [autoStart, start]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    state,
    start,
    stop,
    reset,
    restart,
    agent,
    agentName,
    totalDuration: TOTAL_DURATION,
  };
}

export type ExecutionPriority = 'low' | 'medium' | 'high' | 'critical';

export interface QueuedExecution {
  id: string;
  agentId: string;
  agentName: string;
  input: string;
  priority: ExecutionPriority;
  status: 'queued' | 'running' | 'completed' | 'failed';
  addedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  result: AgentExecution | null;
}

export interface UseExecutionQueueOptions {
  maxConcurrent?: number;
  onItemStart?: (item: QueuedExecution) => void;
  onItemComplete?: (item: QueuedExecution) => void;
  onItemFail?: (item: QueuedExecution) => void;
}

const PRIORITY_WEIGHT: Record<ExecutionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function useExecutionQueue(options: UseExecutionQueueOptions = {}) {
  const { maxConcurrent = 2, onItemStart, onItemComplete, onItemFail } = options;

  const [queue, setQueue] = useState<QueuedExecution[]>([]);
  const [running, setRunning] = useState<QueuedExecution[]>([]);
  const [completed, setCompleted] = useState<QueuedExecution[]>([]);
  const [paused, setPaused] = useState(false);

  const onItemStartRef = useRef(onItemStart);
  const onItemCompleteRef = useRef(onItemComplete);
  const onItemFailRef = useRef(onItemFail);

  useEffect(() => {
    onItemStartRef.current = onItemStart;
  }, [onItemStart]);

  useEffect(() => {
    onItemCompleteRef.current = onItemComplete;
  }, [onItemComplete]);

  useEffect(() => {
    onItemFailRef.current = onItemFail;
  }, [onItemFail]);

  const add = useCallback((agentId: string, input: string, priority: ExecutionPriority = 'medium') => {
    const agent = agents.find((a) => a.id === agentId);
    const item: QueuedExecution = {
      id: generateId('queue'),
      agentId,
      agentName: agent?.name ?? 'Unknown Agent',
      input,
      priority,
      status: 'queued',
      addedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
    };
    setQueue((prev) => [...prev, item]);
    return item.id;
  }, []);

  const remove = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
    setRunning((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    setQueue([]);
    setCompleted([]);
  }, []);

  const clearCompleted = useCallback(() => {
    setCompleted([]);
  }, []);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  const startNext = useCallback(() => {
    if (paused || running.length >= maxConcurrent || queue.length === 0) return;

    const sorted = [...queue].sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]);
    const next = sorted[0];
    if (!next) return;

    const started: QueuedExecution = { ...next, status: 'running', startedAt: Date.now() };
    onItemStartRef.current?.(started);

    setQueue((prev) => prev.filter((item) => item.id !== next.id));
    setRunning((prev) => [...prev, started]);

    setTimeout(() => {
      const succeeded = Math.random() > 0.08;
      const finished: QueuedExecution = {
        ...started,
        status: succeeded ? 'completed' : 'failed',
        completedAt: Date.now(),
        result: succeeded
          ? {
              id: generateId('exec'),
              agentId: started.agentId,
              agentName: started.agentName,
              input: started.input,
              output: `Task completed. Analyzed "${truncate(started.input, 60)}" — generated 12 findings, 3 recommendations, and 1 report.`,
              status: 'success',
              duration: 2000 + Math.random() * 3000,
              timestamp: new Date().toISOString(),
              confidence: 0.85 + Math.random() * 0.14,
              vmId: `vm-${generateHexId(8)}`,
              policyChecks: buildPolicyChecks(),
            }
          : null,
      };

      setRunning((r) => r.filter((item) => item.id !== started.id));
      setCompleted((c) => [finished, ...c]);

      if (succeeded) {
        onItemCompleteRef.current?.(finished);
      } else {
        onItemFailRef.current?.(finished);
      }
    }, 2000 + Math.random() * 3000);
  }, [paused, running.length, maxConcurrent, queue]);

  useEffect(() => {
    if (!paused && running.length < maxConcurrent && queue.length > 0) {
      const timer = setTimeout(startNext, 100);
      return () => clearTimeout(timer);
    }
  }, [paused, running.length, maxConcurrent, queue.length, startNext]);

  const stats = useMemo(
    () => ({
      queued: queue.length,
      running: running.length,
      completed: completed.length,
      total: queue.length + running.length + completed.length,
    }),
    [queue.length, running.length, completed.length]
  );

  return {
    queue,
    running,
    completed,
    paused,
    stats,
    add,
    remove,
    clear,
    clearCompleted,
    pause,
    resume,
  };
}

export interface ResourceMetrics {
  cpu: number;
  memory: number;
  network: number;
  disk: number;
  activeVMs: number;
  timestamp: number;
}

export interface ResourceHistoryPoint extends ResourceMetrics {
  time: string;
}

export interface UseResourceMonitorOptions {
  interval?: number;
  baseLoad?: number;
  maxHistory?: number;
}

export function useResourceMonitor(options: UseResourceMonitorOptions = {}) {
  const { interval = 1000, baseLoad = 15, maxHistory = 60 } = options;

  const [metrics, setMetrics] = useState<ResourceMetrics>({
    cpu: baseLoad,
    memory: 30,
    network: 5,
    disk: 42,
    activeVMs: 0,
    // Populated by the monitor interval on mount; 0 until the first tick.
    timestamp: 0,
  });

  const [history, setHistory] = useState<ResourceHistoryPoint[]>([]);
  const [activeExecutions, setActiveExecutions] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const loadFactor = Math.min(activeExecutions, 8) / 8;
      const newMetrics: ResourceMetrics = {
        cpu: Math.min(100, Math.max(2, baseLoad + loadFactor * 55 + (Math.random() - 0.5) * 12)),
        memory: Math.min(100, Math.max(10, 30 + loadFactor * 45 + (Math.random() - 0.5) * 8)),
        network: Math.min(100, Math.max(1, 5 + loadFactor * 60 + (Math.random() - 0.5) * 15)),
        disk: Math.min(100, Math.max(20, 42 + loadFactor * 20 + (Math.random() - 0.5) * 4)),
        activeVMs: activeExecutions,
        timestamp: Date.now(),
      };
      setMetrics(newMetrics);

      setHistory((prevHistory) => {
        const point: ResourceHistoryPoint = {
          ...newMetrics,
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        };
        const next = [...prevHistory, point];
        return next.length > maxHistory ? next.slice(next.length - maxHistory) : next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [interval, baseLoad, maxHistory, activeExecutions]);

  return {
    metrics,
    history,
    activeExecutions,
    setActiveExecutions,
  };
}

export type RealtimeEventType =
  | 'execution_started'
  | 'execution_progress'
  | 'execution_completed'
  | 'execution_failed'
  | 'policy_alert'
  | 'resource_warning'
  | 'agent_status_change';

export interface RealtimeEvent {
  id: string;
  type: RealtimeEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface UseRealtimeUpdatesOptions {
  interval?: number;
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
}

const EVENT_TEMPLATES: Array<{ type: RealtimeEventType; message: string }> = [
  { type: 'execution_started', message: 'Agent execution started' },
  { type: 'execution_progress', message: 'Execution progress update' },
  { type: 'execution_completed', message: 'Agent execution completed' },
  { type: 'execution_failed', message: 'Agent execution failed' },
  { type: 'policy_alert', message: 'Security policy alert triggered' },
  { type: 'resource_warning', message: 'Resource usage warning' },
  { type: 'agent_status_change', message: 'Agent status changed' },
];

export function useRealtimeUpdates(options: UseRealtimeUpdatesOptions = {}) {
  const { interval = 3000, enabled = true, onEvent } = options;

  const [connected, setConnected] = useState(enabled);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [subscribedChannels, setSubscribedChannels] = useState<Set<string>>(new Set());

  // Sync connection flag when `enabled` toggles (adjust-state-during-render
  // pattern — no effect needed for this derived state).
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (prevEnabled !== enabled) {
    setPrevEnabled(enabled);
    setConnected(enabled);
  }

  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = setInterval(() => {
      setConnected(true);
      const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
      const randomAgent = agents[Math.floor(Math.random() * agents.length)];

      const event: RealtimeEvent = {
        id: generateId('evt'),
        type: template.type,
        timestamp: Date.now(),
        data: {
          message: template.message,
          agentId: randomAgent.id,
          agentName: randomAgent.name,
          ...(template.type === 'policy_alert' && {
            alertType: Math.random() > 0.5 ? 'egress_violation' : 'signature_mismatch',
            severity: Math.random() > 0.5 ? 'high' : 'medium',
          }),
          ...(template.type === 'resource_warning' && {
            resource: Math.random() > 0.5 ? 'cpu' : 'memory',
            usage: 75 + Math.random() * 20,
          }),
        },
      };

      setEvents((prev) => {
        const next = [event, ...prev];
        return next.length > 50 ? next.slice(0, 50) : next;
      });
      setLastEvent(event);
      onEventRef.current?.(event);
    }, interval);

    return () => {
      clearInterval(timer);
      setConnected(false);
    };
  }, [enabled, interval]);

  const subscribe = useCallback((channel: string) => {
    setSubscribedChannels((prev) => new Set(prev).add(channel));
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    setSubscribedChannels((prev) => {
      const next = new Set(prev);
      next.delete(channel);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setEvents([]);
    setLastEvent(null);
  }, []);

  return {
    connected,
    events,
    lastEvent,
    subscribedChannels,
    subscribe,
    unsubscribe,
    clear,
  };
}

export interface SimulatedAlert {
  id: string;
  type: 'security' | 'policy' | 'resource';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface UseAlertSimulationOptions {
  enabled?: boolean;
  minInterval?: number;
  maxInterval?: number;
  onAlert?: (alert: SimulatedAlert) => void;
}

const ALERT_TEMPLATES: Array<Omit<SimulatedAlert, 'id' | 'timestamp' | 'acknowledged'>> = [
  {
    type: 'security',
    severity: 'critical',
    title: 'Egress Violation Detected',
    message: 'Agent attempted to connect to unauthorized endpoint api.unknown-service.com',
  },
  {
    type: 'security',
    severity: 'warning',
    title: 'Signature Mismatch',
    message: 'Container image signature does not match registry record for agent-006',
  },
  {
    type: 'policy',
    severity: 'warning',
    title: 'Seccomp Profile Violation',
    message: 'Agent attempted to use blocked syscall (mount) — request denied',
  },
  {
    type: 'policy',
    severity: 'info',
    title: 'Policy Check Passed',
    message: 'All 5 security policy checks passed for new execution',
  },
  {
    type: 'resource',
    severity: 'warning',
    title: 'High Memory Usage',
    message: 'Cluster memory usage exceeded 85% — consider scaling',
  },
  {
    type: 'resource',
    severity: 'critical',
    title: 'CPU Throttling Detected',
    message: 'Node worker-3 CPU usage at 98% — executions may be delayed',
  },
  {
    type: 'security',
    severity: 'info',
    title: 'New Agent Deployed',
    message: 'Document Processor v3.0.1 deployed successfully with verified signature',
  },
  {
    type: 'policy',
    severity: 'warning',
    title: 'Rate Limit Approaching',
    message: 'API rate limit at 80% — 200 requests remaining in current window',
  },
];

export function useAlertSimulation(options: UseAlertSimulationOptions = {}) {
  const { enabled = true, minInterval = 5000, maxInterval = 15000, onAlert } = options;

  const [alerts, setAlerts] = useState<SimulatedAlert[]>([]);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);

  const onAlertRef = useRef(onAlert);

  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      const delay = minInterval + Math.random() * (maxInterval - minInterval);
      timer = setTimeout(() => {
        const template = ALERT_TEMPLATES[Math.floor(Math.random() * ALERT_TEMPLATES.length)];
        const alert: SimulatedAlert = {
          ...template,
          id: generateId('alert'),
          timestamp: Date.now(),
          acknowledged: false,
        };

        setAlerts((prev) => {
          const next = [alert, ...prev];
          return next.length > 20 ? next.slice(0, 20) : next;
        });
        setUnacknowledgedCount((prev) => prev + 1);
        onAlertRef.current?.(alert);

        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => clearTimeout(timer);
  }, [enabled, minInterval, maxInterval]);

  const acknowledge = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => {
        if (a.id === id && !a.acknowledged) {
          setUnacknowledgedCount((c) => Math.max(0, c - 1));
          return { ...a, acknowledged: true };
        }
        return a;
      })
    );
  }, []);

  const acknowledgeAll = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
    setUnacknowledgedCount(0);
  }, []);

  const clear = useCallback(() => {
    setAlerts([]);
    setUnacknowledgedCount(0);
  }, []);

  return {
    alerts,
    unacknowledgedCount,
    acknowledge,
    acknowledgeAll,
    clear,
  };
}
