import { missions } from './missions';
import { runFabricatorCycle } from './fabricator';
import { executeAgent } from './executor';
import { getState, mutateState, pushActivity, type ApprovalRecord, type LiveWorkflow, type LiveWorkflowStep, type GeneratedArtifact } from './store';
import { publish } from './bus';
import { appendMessage, ensureThread, setThreadStatus } from './db';

/**
 * Workflow orchestrator — chains real agent tasks (Atlas data synthesis →
 * specialist agents) into multi-step pipelines with human-in-the-loop gates.
 * When a step's confidence falls below the approval threshold, the workflow
 * parks in `pending_approval` and resumes when a human resolves it.
 */

const APPROVAL_THRESHOLD = 0.85;

type StepTemplate = { agentId: string; name: string };

type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  /** First step synthesizes this artifact kind via Atlas. */
  seedKind: GeneratedArtifact['kind'];
  seedInstruction: string;
  steps: StepTemplate[];
};

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: 'lease-intake',
    name: 'Lease Intake & Risk Review',
    description: 'Atlas ingests a new lease document, the Document Processor triages it, the Lease Abstractor extracts clauses, and the Tenant Screener grades risk before human sign-off.',
    seedKind: 'lease-document',
    seedInstruction: 'Synthesize one incoming commercial lease document (NNN office or Gross retail) that just arrived in the intake queue.',
    steps: [
      { agentId: 'agent-atlas', name: 'Document Ingestion' },
      { agentId: 'agent-007', name: 'Document Triage' },
      { agentId: 'agent-001', name: 'Lease Abstraction' },
      { agentId: 'agent-006', name: 'Tenant Risk Assessment' },
    ],
  },
  {
    id: 'market-analysis',
    name: 'Submarket Intelligence Sweep',
    description: 'Atlas refreshes the market fabric for a metro, Market Intelligence produces the snapshot, the Valuation Engine revalues a property, and the Portfolio Optimizer recommends actions.',
    seedKind: 'market-snapshot',
    seedInstruction: 'Synthesize one market snapshot for a rotating top-30 metro (office or multifamily).',
    steps: [
      { agentId: 'agent-atlas', name: 'Market Data Refresh' },
      { agentId: 'agent-003', name: 'Trend Analysis' },
      { agentId: 'agent-002', name: 'Property Revaluation' },
      { agentId: 'agent-004', name: 'Portfolio Actions' },
    ],
  },
  {
    id: 'tenant-retention',
    name: 'Tenant Retention Play',
    description: 'Atlas detects an inbound tenant email, the Email Outreach Agent drafts the response, and the Maintenance Predictor attaches any work orders implied by the message.',
    seedKind: 'tenant-email',
    seedInstruction: 'Synthesize one inbound tenant email — prefer maintenance or expansion category.',
    steps: [
      { agentId: 'agent-atlas', name: 'Inbox Intake' },
      { agentId: 'agent-011', name: 'Response Draft' },
      { agentId: 'agent-005', name: 'Maintenance Check' },
    ],
  },
  {
    id: 'lead-funnel',
    name: 'Inbound Lead Qualification',
    description: 'Atlas captures a portal lead, the Lead Response Agent scores and qualifies it, and the Email Outreach Agent prepares the first reply for human approval.',
    seedKind: 'lead',
    seedInstruction: 'Synthesize one inbound leasing lead from a portal (Zillow, Realtor.com or Apartments.com).',
    steps: [
      { agentId: 'agent-atlas', name: 'Lead Capture' },
      { agentId: 'agent-012', name: 'Qualification' },
      { agentId: 'agent-011', name: 'First Reply Draft' },
    ],
  },
];

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emitWorkflow(workflow: LiveWorkflow) {
  publish(`workflow:${workflow.id}`, workflow);
  publish('activity', { type: 'workflow', workflowId: workflow.id });
}

function stepInputFor(stepIndex: number, template: WorkflowTemplate, priorOutput: string | null): string {
  if (stepIndex === 0) return template.seedInstruction;
  return priorOutput ? `Carry forward: ${priorOutput}` : 'Continue pipeline';
}

async function runStep(
  workflow: LiveWorkflow,
  step: LiveWorkflowStep,
  inputArtifact: GeneratedArtifact | undefined
): Promise<{ artifact?: GeneratedArtifact; confidence: number }> {
  const started = new Date().toISOString();
  mutateState((s) => {
    const wf = s.workflows.find((w) => w.id === workflow.id);
    const st = wf?.steps.find((x) => x.id === step.id);
    if (st) {
      st.status = 'running';
      st.startedAt = started;
    }
  });
  emitWorkflow(workflow);

  // Atlas steps synthesize data; specialist steps run through the executor.
  if (step.agentId === 'agent-atlas') {
    const template = workflowTemplates.find((t) => t.id === workflow.template)!;
    const artifact = await runFabricatorCycle(
      workflow.template === 'lease-intake'
        ? 'lease-document'
        : workflow.template === 'tenant-retention'
          ? 'tenant-email'
          : workflow.template === 'lead-funnel'
            ? 'lead'
            : template.seedKind
    ) ?? undefined;
    const confidence = typeof artifact?.payload.confidence === 'number' ? artifact.payload.confidence : 0.9;
    mutateState((s) => {
      const wf = s.workflows.find((w) => w.id === workflow.id);
      const st = wf?.steps.find((x) => x.id === step.id);
      if (st) {
        st.status = 'completed';
        st.completedAt = new Date().toISOString();
        st.output = artifact?.summary ?? 'artifact synthesized';
        st.confidence = confidence;
        if (artifact) st.artifactId = artifact.id;
      }
    });
    return { artifact, confidence };
  }

  return new Promise((resolve, reject) => {
    void executeAgent(step.agentId, {
      goal: `${workflow.name} — step: ${step.name}`,
      inputArtifact,
      workflowId: workflow.id,
      onEvent: (event) => {
        if (event.type === 'log') {
          mutateState((s) => {
            const wf = s.workflows.find((w) => w.id === workflow.id);
            const st = wf?.steps.find((x) => x.id === step.id);
            if (st) st.input = st.input || event.line;
          });
        }
        if (event.type === 'result') {
          if (event.status === 'success' && event.execution) {
            const confidence = event.execution.confidence;
            mutateState((s) => {
              const wf = s.workflows.find((w) => w.id === workflow.id);
              const st = wf?.steps.find((x) => x.id === step.id);
              if (st) {
                st.status = 'completed';
                st.completedAt = new Date().toISOString();
                st.output = event.execution!.output;
                st.confidence = confidence;
                if (event.execution!.artifact) st.artifactId = event.execution!.artifact.id;
              }
            });
            resolve({ artifact: event.execution.artifact, confidence });
          } else {
            mutateState((s) => {
              const wf = s.workflows.find((w) => w.id === workflow.id);
              const st = wf?.steps.find((x) => x.id === step.id);
              if (st) {
                st.status = 'failed';
                st.completedAt = new Date().toISOString();
                st.output = event.error ?? 'step failed';
              }
            });
            reject(new Error(event.error ?? 'step failed'));
          }
        }
      },
    });
  });
}

function requestApproval(
  workflow: LiveWorkflow,
  step: LiveWorkflowStep,
  confidence: number,
  artifact: GeneratedArtifact | undefined
): ApprovalRecord {
  const approval: ApprovalRecord = {
    id: uid('hitl'),
    workflowId: workflow.id,
    stepId: step.id,
    agentId: step.agentId,
    agentName: step.agentName,
    type: confidence < 0.7 ? 'escalation' : 'approval',
    title: `${step.agentName} requests review — ${(confidence * 100).toFixed(0)}% confidence`,
    description: `Step "${step.name}" in "${workflow.name}" finished below the ${Math.round(APPROVAL_THRESHOLD * 100)}% auto-proceed threshold. Review the structured output before the workflow continues.`,
    data: artifact?.payload ?? {},
    confidence,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    priority: confidence < 0.7 ? 'high' : 'medium',
  };
  mutateState((s) => {
    s.approvals.push(approval);
    const wf = s.workflows.find((w) => w.id === workflow.id);
    const st = wf?.steps.find((x) => x.id === step.id);
    if (st) {
      st.status = 'awaiting_approval';
      st.approvalId = approval.id;
    }
  });
  pushActivity({
    type: 'approval',
    agentId: step.agentId,
    agentName: step.agentName,
    title: `HITL request: ${step.agentName}`,
    detail: approval.title,
  });

  // Thread record: this is where a human is now expected to weigh in.
  try {
    const threadId = ensureThread({
      artifactId: artifact?.id ?? `wf-${workflow.id}-${step.id}`,
      title: `${workflow.name} — ${step.name}`,
      topic: step.agentName,
    });
    appendMessage(threadId, {
      role: 'agent',
      authorId: step.agentId,
      authorName: step.agentName,
      kind: 'result',
      text: step.output ?? `Completed "${step.name}".`,
      meta: { confidence },
    });
    appendMessage(threadId, {
      role: 'system',
      authorName: 'Realtomatic',
      kind: 'request',
      text: `${step.agentName} is only ${(confidence * 100).toFixed(0)}% confident — the workflow is paused until you decide. ${approval.description}`,
      meta: { approvalId: approval.id, workflowId: workflow.id },
    });
    setThreadStatus(threadId, 'awaiting_human');
    approval.threadId = threadId;
    mutateState((s) => {
      const stored = s.approvals.find((a) => a.id === approval.id);
      if (stored) stored.threadId = threadId;
    });
  } catch {
    // Thread logging must never block a workflow.
  }

  return approval;
}

async function runWorkflow(workflow: LiveWorkflow): Promise<void> {
  const template = workflowTemplates.find((t) => t.id === workflow.template);
  if (!template) return;

  let carryArtifact: GeneratedArtifact | undefined;

  for (let i = 0; i < template.steps.length; i++) {
    // Re-read live state each step: a reject can cancel mid-flight.
    const current = mutateState((s) => s.workflows.find((w) => w.id === workflow.id));
    if (!current || current.status === 'failed') return;

    const step = current.steps[i];

    // Resume path: steps already completed in a previous pass are skipped,
    // but their artifacts stay in the carry chain.
    if (step.status === 'completed') {
      if (step.artifactId) {
        carryArtifact = getState().artifacts.find((a) => a.id === step.artifactId) ?? carryArtifact;
      }
      continue;
    }

    step.input = stepInputFor(i, template, carryArtifact?.summary ?? null);
    emitWorkflow(current);

    try {
      const { artifact, confidence } = await runStep(current, step, carryArtifact);
      carryArtifact = artifact ?? carryArtifact;

      if (confidence < APPROVAL_THRESHOLD) {
        requestApproval(current, step, confidence, carryArtifact);
        mutateState((s) => {
          const wf = s.workflows.find((w) => w.id === workflow.id);
          if (wf) wf.status = 'pending_approval';
        });
        emitWorkflow(current);
        return; // resumed by resolveApproval()
      }
    } catch {
      mutateState((s) => {
        const wf = s.workflows.find((w) => w.id === workflow.id);
        if (wf) {
          wf.status = 'failed';
          wf.completedAt = new Date().toISOString();
          for (const st of wf.steps) {
            if (st.status === 'pending' || st.status === 'running') st.status = 'failed';
          }
        }
      });
      pushActivity({
        type: 'workflow',
        agentName: 'Orchestrator',
        title: `Workflow failed: ${workflow.name}`,
        detail: 'A step failed and downstream steps were cancelled.',
      });
      emitWorkflow(current);
      return;
    }
  }

  mutateState((s) => {
    const wf = s.workflows.find((w) => w.id === workflow.id);
    if (wf) {
      wf.status = 'completed';
      wf.completedAt = new Date().toISOString();
    }
  });
  pushActivity({
    type: 'workflow',
    title: `Workflow completed: ${workflow.name}`,
    detail: 'All steps processed and published to the data fabric.',
  });
  const finished = mutateState((s) => s.workflows.find((w) => w.id === workflow.id));
  if (finished) emitWorkflow(finished);
}

/** Start a run from a template id. Returns the workflow id. */
export function startWorkflow(templateId: string, triggeredBy = 'dashboard:sarah-chen'): string | null {
  const template = workflowTemplates.find((t) => t.id === templateId);
  if (!template) return null;

  const steps: LiveWorkflowStep[] = template.steps.map((s, i) => ({
    id: uid('ws'),
    name: s.name,
    agentId: s.agentId,
    agentName:
      s.agentId === 'agent-atlas'
        ? 'Atlas — Data Synthesis'
        : missions[s.agentId]
          ? s.agentId.replace('agent-', 'Agent ')
          : s.agentId,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    input: stepInputFor(i, template, null),
    output: null,
    confidence: null,
  }));

  // Human-readable agent names from the mock catalog where possible.
  const names: Record<string, string> = {
    'agent-001': 'Lease Abstractor',
    'agent-002': 'Valuation Engine',
    'agent-003': 'Market Intelligence',
    'agent-004': 'Portfolio Optimizer',
    'agent-005': 'Maintenance Predictor',
    'agent-006': 'Tenant Screener',
    'agent-007': 'Document Processor',
    'agent-008': 'ESG Compliance Agent',
    'agent-009': 'Insurance Risk Agent',
    'agent-010': 'Tax Assessment Agent',
    'agent-011': 'Email Outreach Agent',
    'agent-012': 'Lead Response Agent',
    'agent-atlas': 'Atlas — Data Synthesis',
  };
  for (const step of steps) step.agentName = names[step.agentId] ?? step.agentName;

  const workflow: LiveWorkflow = {
    id: uid('wf'),
    template: template.id,
    name: template.name,
    description: template.description,
    status: 'running',
    steps,
    startedAt: new Date().toISOString(),
    completedAt: null,
    triggeredBy,
  };

  mutateState((s) => {
    s.workflows.push(workflow);
  });
  pushActivity({
    type: 'workflow',
    title: `Workflow started: ${workflow.name}`,
    detail: `${steps.length} steps · triggered by ${triggeredBy}`,
  });
  emitWorkflow(workflow);

  void runWorkflow(workflow);
  return workflow.id;
}

/** Resume a parked workflow after a human decision. */
export function resolveApproval(approvalId: string, decision: 'approved' | 'rejected' | 'changes_requested', resolvedBy = 'sarah-chen'): void {
  let approval: ApprovalRecord | undefined;
  mutateState((s) => {
    approval = s.approvals.find((a) => a.id === approvalId);
    if (approval && approval.status === 'pending') {
      approval.status = decision;
      approval.resolvedAt = new Date().toISOString();
      approval.resolvedBy = resolvedBy;
    }
  });
  if (!approval || approval.status === 'pending') return;

  // Thread record: the human's decision, closing the loop on the paused work.
  try {
    const threadId =
      approval.threadId ??
      ensureThread({
        artifactId: approval.workflowId ? `wf-${approval.workflowId}-${approval.stepId}` : approval.id,
        title: `${approval.agentName} — review`,
        topic: approval.agentName,
      });
    const verdict =
      decision === 'approved'
        ? 'Approved — proceed.'
        : decision === 'rejected'
          ? 'Rejected — do not proceed.'
          : 'Changes requested — revise before proceeding.';
    appendMessage(threadId, {
      role: 'human',
      authorId: resolvedBy,
      authorName: resolvedBy === 'you' ? 'You' : resolvedBy,
      kind: 'decision',
      text: verdict,
      meta: { approvalId, decision },
    });
    setThreadStatus(threadId, decision === 'changes_requested' ? 'open' : 'resolved');
  } catch {
    // Never block a decision on logging.
  }

  pushActivity({
    type: 'approval',
    agentName: approval.agentName,
    title: `Review ${decision.replace('_', ' ')}: ${approval.agentName}`,
    detail: `Resolved by ${resolvedBy}`,
  });

  if (!approval.workflowId || decision === 'rejected') {
    if (approval.workflowId) {
      mutateState((s) => {
        const wf = s.workflows.find((w) => w.id === approval!.workflowId);
        if (wf) {
          wf.status = 'failed';
          wf.completedAt = new Date().toISOString();
          for (const st of wf.steps) {
            if (st.id === approval!.stepId) st.status = 'failed';
            if (st.status === 'pending') st.status = 'failed';
          }
        }
      });
    }
    return;
  }

  // Approved (or changes requested → proceed with note): continue the run.
  mutateState((s) => {
    const wf = s.workflows.find((w) => w.id === approval!.workflowId);
    if (wf) {
      wf.status = 'running';
      const st = wf.steps.find((x) => x.id === approval!.stepId);
      if (st) {
        st.status = 'completed';
        st.completedAt = st.completedAt ?? new Date().toISOString();
        st.output = st.output ?? `Approved by ${resolvedBy}`;
      }
    }
  });

  const workflow = mutateState((s) => s.workflows.find((w) => w.id === approval!.workflowId));
  if (workflow) {
    emitWorkflow(workflow);
    void runWorkflow(workflow);
  }
}
