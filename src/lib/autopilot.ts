import { agents } from './mock-data';
import { executeAgent, type ExecEvent } from './executor';
import { runFabricatorCycle } from './fabricator';
import { latestSourceArtifact } from './fabricator';
import { llmQueueDepth } from './llm-queue';
import { publish } from './bus';

/**
 * Autopilot — the reason the team is always busy.
 *
 * Operators don't press Run. A dispatcher keeps the roster fed with work by
 * walking a rotating queue of realistic per-agent goals, seeding data-fabric
 * artifacts when an agent needs input. It respects the LLM concurrency limiter
 * (withLlmSlot inside executeAgent) by staggering dispatches, so "non-stop"
 * means the team is continuously working, not 13 simultaneous model calls.
 */

type AutopilotTask = {
  agentId: string;
  goal: string;
  needsKind?: 'lease-document' | 'market-snapshot' | 'tenant-email' | 'lead';
};

const ROTATION: AutopilotTask[] = [
  { agentId: 'agent-001', goal: 'Abstract the newest lease in the intake queue and flag anything non-standard.', needsKind: 'lease-document' },
  { agentId: 'agent-006', goal: 'Screen the tenant on the most recent abstracted lease and give an approve/hold read.' },
  { agentId: 'agent-002', goal: 'Revalue the most active property using current market comps.' },
  { agentId: 'agent-011', goal: 'Reply to the oldest unanswered inbound tenant message; confirm a concrete next step and timeframe.' },
  { agentId: 'agent-003', goal: 'Refresh the market snapshot for a metro and summarize what changed.' },
  { agentId: 'agent-004', goal: 'Review portfolio performance and recommend the single highest-value move this week.' },
  { agentId: 'agent-005', goal: 'Check maintenance risk across the portfolio; flag anything critical.' },
  { agentId: 'agent-012', goal: 'Respond to the newest inbound lead and score them.' },
  { agentId: 'agent-007', goal: 'Triage the newest document in the queue and extract its key fields.' },
  { agentId: 'agent-001', goal: 'Double-check the last lease abstraction for missed clauses or math errors.', needsKind: 'lease-document' },
  { agentId: 'agent-011', goal: 'Send a short follow-up to a landlord thread that went quiet.' },
  { agentId: 'agent-006', goal: 'Reassess a tenant whose payment or compliance signal changed.' },
];

const STAGGER_MS = 15_000; // gap between dispatches — sustainable on free tiers
const MAX_QUEUE_DEPTH = 2; // don't pile on when the model is slow or throttled
let cursor = 0;
let running = false;
let consecutiveFailures = 0;
let nextAttemptAt = 0;

declare global {
  var __realtomaticAutopilotTimer: ReturnType<typeof setInterval> | undefined;
}

function agentName(id: string): string {
  return agents.find((a) => a.id === id)?.name ?? id;
}

async function dispatchOne(): Promise<void> {
  if (running) return; // never overlap the staggered tick itself
  // Back off when the provider is throttling, so the demo slows down instead
  // of burning quota against a wall.
  if (nextAttemptAt > 0 && Date.now() < nextAttemptAt) return;
  // If the model queue is already deep, let it drain before adding more work.
  if (llmQueueDepth() > MAX_QUEUE_DEPTH) return;

  running = true;
  try {
    const task = ROTATION[cursor % ROTATION.length];
    cursor++;

    // Make sure the agent has an input artifact if its job needs one.
    if (task.needsKind && !latestSourceArtifact(task.needsKind)) {
      await runFabricatorCycle(task.needsKind);
    }

    const name = agentName(task.agentId);
    const handle = executeAgent(task.agentId, {
      goal: task.goal,
      onEvent: (event: ExecEvent) => {
        if (event.type === 'phase') {
          publish('team-feed', {
            type: 'activity',
            agentId: task.agentId,
            agentName: name,
            phase: event.phase,
            label: event.label,
            executionId: '',
            at: new Date().toISOString(),
          });
        } else if (event.type === 'log') {
          publish('team-feed', {
            type: 'activity',
            agentId: task.agentId,
            agentName: name,
            phase: 'infer',
            line: event.line,
            executionId: '',
            at: new Date().toISOString(),
          });
        } else if (event.type === 'result') {
          if (event.status === 'failed') {
            consecutiveFailures++;
            nextAttemptAt = Date.now() + Math.min(120_000, 5_000 * 2 ** Math.min(consecutiveFailures, 5));
          } else {
            consecutiveFailures = 0;
            nextAttemptAt = 0;
          }
          publish('team-feed', {
            type: 'done',
            agentId: task.agentId,
            agentName: name,
            executionId: event.execution?.id ?? '',
            summary: event.execution?.output ?? event.error,
            duration: event.execution?.duration,
            at: new Date().toISOString(),
          });
        }
      },
    });
    // Don't await the agent — dispatch and move on; the limiter serializes the
    // actual model calls so the team stays busy without thrashing free tiers.
    void handle.promise.catch(() => {
      consecutiveFailures++;
      nextAttemptAt = Date.now() + Math.min(120_000, 5_000 * 2 ** Math.min(consecutiveFailures, 5));
    });
  } catch {
    consecutiveFailures++;
    nextAttemptAt = Date.now() + Math.min(120_000, 5_000 * 2 ** Math.min(consecutiveFailures, 5));
  } finally {
    running = false;
  }
}

/** Starts the perpetual dispatcher (idempotent across HMR). */
export function ensureAutopilot(): void {
  if (globalThis.__realtomaticAutopilotTimer) return;
  globalThis.__realtomaticAutopilotTimer = setInterval(() => {
    void dispatchOne();
  }, STAGGER_MS);

  // Seed the board so it never looks empty on first load.
  setTimeout(() => void dispatchOne(), 2_000);
}

export function autopilotTaskCount(): number {
  return ROTATION.length;
}
