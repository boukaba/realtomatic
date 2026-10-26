import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Durable demo state. The demo has no database; instead every artifact the
 * agents produce (market feeds, lease documents, executions, workflow runs,
 * approvals) is persisted to a JSON file so the demo survives reloads and
 * restarts. Stored outside .next so it is not wiped by builds.
 */

const STATE_DIR = join(process.cwd(), '.realtomatic-state');
const STATE_FILE = join(STATE_DIR, 'state.json');

export type ActivityEntry = {
  id: string;
  type: 'fabricator' | 'execution' | 'workflow' | 'approval' | 'chat';
  agentId?: string;
  agentName?: string;
  title: string;
  detail: string;
  timestamp: string;
};

export type GeneratedArtifact = {
  id: string;
  kind: 'market-snapshot' | 'lease-document' | 'tenant-email' | 'lead' | 'comps-set';
  producedBy: string;
  city?: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
  /** The input artifact this was produced from, when there was one. Lets the
   *  UI tell "the same lease, abstracted again" apart from a new lease. */
  sourceArtifactId?: string;
};

export type ExecutionRecord = {
  id: string;
  agentId: string;
  agentName: string;
  input: string;
  output: string;
  status: 'success' | 'failed' | 'running';
  duration: number;
  timestamp: string;
  confidence: number;
  vmId: string;
  policyChecks: {
    name: 'cosign' | 'sbom' | 'seccomp' | 'egress' | 'secrets';
    status: 'passed' | 'failed' | 'warning';
    details: string;
  }[];
  tokens?: { input: number; output: number };
  model?: string;
  cost?: number;
  artifact?: GeneratedArtifact;
  workflowId?: string;
};

export type LiveWorkflowStep = {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval';
  startedAt: string | null;
  completedAt: string | null;
  input: string;
  output: string | null;
  confidence: number | null;
  artifactId?: string;
  approvalId?: string;
};

export type LiveWorkflow = {
  id: string;
  template: string;
  name: string;
  description: string;
  status: 'running' | 'completed' | 'failed' | 'pending_approval';
  steps: LiveWorkflowStep[];
  startedAt: string;
  completedAt: string | null;
  triggeredBy: string;
};

export type ApprovalRecord = {
  id: string;
  workflowId?: string;
  stepId?: string;
  agentId: string;
  agentName: string;
  type: 'approval' | 'review' | 'escalation';
  title: string;
  description: string;
  data: Record<string, unknown>;
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  requestedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
};

export type FabricatorState = {
  lastRunAt: string | null;
  lastArtifactId: string | null;
  artifactsProduced: number;
  running: boolean;
};

export type Resolution = {
  itemId: string;
  artifactId: string;
  action: 'replied' | 'directive' | 'resolved';
  note?: string;
  agentName?: string;
  at: string;
};

export type ConsultRecord = {
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  toAgentName: string;
  reason: string;
  replySummary: string;
  at: string;
};

export type DemoState = {
  seededAt: string;
  fabricator: FabricatorState;
  artifacts: GeneratedArtifact[];
  executions: ExecutionRecord[];
  workflows: LiveWorkflow[];
  approvals: ApprovalRecord[];
  activity: ActivityEntry[];
  /** Operator decisions on attention items — keeps "Needs you" honest. */
  resolutions: Resolution[];
  /** Agent-to-agent handoffs — evidence of autonomous collaboration. */
  consults: ConsultRecord[];
};

let cache: DemoState | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function emptyState(): DemoState {
  return {
    seededAt: new Date().toISOString(),
    fabricator: {
      lastRunAt: null,
      lastArtifactId: null,
      artifactsProduced: 0,
      running: false,
    },
    artifacts: [],
    executions: [],
    workflows: [],
    approvals: [],
    activity: [],
    resolutions: [],
    consults: [],
  };
}

function loadFromDisk(): DemoState {
  try {
    if (existsSync(STATE_FILE)) {
      const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as DemoState;
      if (parsed && Array.isArray(parsed.artifacts)) {
        // Backfill fields added after a state file was first written.
        if (!Array.isArray(parsed.resolutions)) parsed.resolutions = [];
        if (!Array.isArray(parsed.consults)) parsed.consults = [];
        if (!parsed.fabricator) parsed.fabricator = emptyState().fabricator;
        // A crash mid-run should not leave phantom "running" state.
        parsed.executions = parsed.executions.map((e) =>
          e.status === 'running' ? { ...e, status: 'failed', output: 'Interrupted by server restart' } : e
        );
        parsed.workflows = parsed.workflows.map((w) =>
          w.status === 'running'
            ? {
                ...w,
                status: 'failed',
                steps: w.steps.map((s) => (s.status === 'running' ? { ...s, status: 'failed', completedAt: new Date().toISOString() } : s)),
              }
            : w
        );
        parsed.fabricator.running = false;
        return parsed;
      }
    }
  } catch {
    // Corrupt state file — start fresh rather than crash the demo.
  }
  return emptyState();
}

export function getState(): DemoState {
  if (!cache) {
    cache = loadFromDisk();
  }
  return cache;
}

function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (!cache) return;
    try {
      if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
      // Keep the file bounded so a long-lived demo never balloons.
      const trimmed: DemoState = {
        ...cache,
        artifacts: cache.artifacts.slice(-400),
        executions: cache.executions.slice(-500),
        workflows: cache.workflows.slice(-100),
        approvals: cache.approvals.slice(-200),
        activity: cache.activity.slice(-300),
        consults: cache.consults.slice(-100),
      };
      writeFileSync(STATE_FILE, JSON.stringify(trimmed));
    } catch {
      // Never let persistence break the demo surface.
    }
  }, 250);
}

export function mutateState<T>(fn: (state: DemoState) => T): T {
  const state = getState();
  const result = fn(state);
  persist();
  return result;
}

export function pushActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>) {
  mutateState((state) => {
    state.activity.push({
      ...entry,
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    });
  });
}

export function resetState() {
  cache = emptyState();
  persist();
}
