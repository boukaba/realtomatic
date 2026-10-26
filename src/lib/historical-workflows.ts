import { workflows as historicalWorkflows } from './mock-data';
import {
  getState,
  mutateState,
  pushActivity,
  type HistoricalWorkflowOverride,
} from './store';
import type { Workflow } from './types';

/**
 * The seeded workflow history is presentation data, but its pending decision
 * must still behave like a real decision. Overrides are stored in the demo
 * workspace so the detail page, the workflow list, and a reload all agree.
 */

export function applyHistoricalOverride(workflow: Workflow): Workflow {
  const override = getState().historicalWorkflowOverrides[workflow.id];
  if (!override) return workflow;

  return {
    ...workflow,
    status: override.status,
    completedAt: override.completedAt,
    steps: workflow.steps.map((step) => {
      const stepOverride = override.steps[step.id];
      if (!stepOverride) return step;
      return {
        ...step,
        status: stepOverride.status,
        completedAt: stepOverride.completedAt,
        output: stepOverride.output ?? step.output,
        confidence: stepOverride.confidence ?? step.confidence,
        duration: stepOverride.duration ?? step.duration,
      };
    }),
  };
}

export function listHistoricalWorkflows(): Workflow[] {
  return historicalWorkflows.map(applyHistoricalOverride);
}

export function getHistoricalWorkflow(id: string): Workflow | undefined {
  const workflow = historicalWorkflows.find((w) => w.id === id);
  return workflow ? applyHistoricalOverride(workflow) : undefined;
}

export function resolveHistoricalWorkflow(
  id: string,
  stepId: string | undefined,
  decision: 'approved' | 'rejected' | 'changes_requested',
  resolvedBy = 'you'
): Workflow | null {
  const base = historicalWorkflows.find((w) => w.id === id);
  if (!base) return null;

  const current = applyHistoricalOverride(base);
  if (current.status !== 'pending_approval') return current;

  const step =
    current.steps.find((s) => s.id === stepId && s.status === 'awaiting_approval') ??
    current.steps.find((s) => s.status === 'awaiting_approval');
  if (!step) return current;

  const now = new Date().toISOString();
  const approved = decision === 'approved';
  const verdict = approved
    ? 'Approved — proceed.'
    : decision === 'rejected'
      ? 'Rejected — do not proceed.'
      : 'Changes requested — revise before proceeding.';

  const override: HistoricalWorkflowOverride = {
    status: approved ? 'completed' : 'failed',
    completedAt: now,
    resolvedAt: now,
    resolvedBy,
    steps: {
      [step.id]: {
        status: approved ? 'completed' : 'failed',
        completedAt: now,
        output: verdict,
        confidence: step.confidence ?? 0.87,
        duration: step.duration ?? 0,
      },
    },
  };

  mutateState((state) => {
    state.historicalWorkflowOverrides[id] = override;
  });

  pushActivity({
    type: 'approval',
    agentName: step.agentName,
    title: `${approved ? 'Approved' : 'Rejected'} seeded workflow: ${current.name}`,
    detail: `${step.name} · ${verdict} · by ${resolvedBy}`,
  });

  return applyHistoricalOverride(base);
}

export function retryHistoricalWorkflow(
  id: string,
  stepId: string | undefined,
  resolvedBy = 'you'
): Workflow | null {
  const base = historicalWorkflows.find((w) => w.id === id);
  if (!base) return null;

  const current = applyHistoricalOverride(base);
  const step =
    current.steps.find((s) => s.id === stepId && s.status === 'failed') ??
    current.steps.find((s) => s.status === 'failed');
  if (!step) return current;

  const now = new Date().toISOString();
  const override: HistoricalWorkflowOverride = {
    status: 'completed',
    completedAt: now,
    resolvedAt: now,
    resolvedBy,
    steps: {
      [step.id]: {
        status: 'completed',
        completedAt: now,
        output: 'Retried and completed',
        confidence: step.confidence ?? 0.9,
        duration: step.duration ?? 8,
      },
    },
  };

  mutateState((state) => {
    state.historicalWorkflowOverrides[id] = override;
  });

  pushActivity({
    type: 'workflow',
    agentName: step.agentName,
    title: `Retried seeded workflow: ${current.name}`,
    detail: `${step.name} · completed after retry · by ${resolvedBy}`,
  });

  return applyHistoricalOverride(base);
}
