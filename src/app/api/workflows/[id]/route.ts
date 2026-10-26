import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import {
  getHistoricalWorkflow,
  resolveHistoricalWorkflow,
  retryHistoricalWorkflow,
} from '@/lib/historical-workflows';
import { resolveApproval } from '@/lib/workflow-orchestrator';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const live = getState().workflows.find((w) => w.id === id);
  if (live) return NextResponse.json({ workflow: live, live: true });

  const historical = getHistoricalWorkflow(id);
  if (historical) return NextResponse.json({ workflow: historical, live: false });

  return NextResponse.json({ error: `Workflow '${id}' not found` }, { status: 404 });
}

type DecisionBody = {
  decision?: 'approved' | 'rejected' | 'changes_requested' | 'retried';
  stepId?: string;
  resolvedBy?: string;
};

/**
 * A human decision on a workflow. Live workflows resolve the real approval and
 * resume the orchestrator; seeded history persists the decision so the detail
 * page, the workflow list, and a reload agree.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: DecisionBody;
  try {
    body = (await request.json()) as DecisionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const valid = ['approved', 'rejected', 'changes_requested', 'retried'];
  if (!body.decision || !valid.includes(body.decision)) {
    return NextResponse.json(
      { error: 'decision (approved | rejected | changes_requested | retried) is required' },
      { status: 400 }
    );
  }

  const resolvedBy = body.resolvedBy?.trim() || 'you';
  const state = getState();
  const live = state.workflows.find((w) => w.id === id);

  if (live) {
    if (body.decision === 'retried') {
      return NextResponse.json(
        { error: 'Retry is not available for this workflow' },
        { status: 409 }
      );
    }
    const approval = state.approvals.find(
      (a) =>
        a.workflowId === id &&
        a.status === 'pending' &&
        (!body.stepId || a.stepId === body.stepId)
    );
    if (!approval) {
      return NextResponse.json({ error: 'No pending approval for this workflow' }, { status: 409 });
    }
    resolveApproval(approval.id, body.decision, resolvedBy);
    const updated = getState().workflows.find((w) => w.id === id);
    return NextResponse.json({ workflow: updated, live: true });
  }

  const historical =
    body.decision === 'retried'
      ? retryHistoricalWorkflow(id, body.stepId, resolvedBy)
      : resolveHistoricalWorkflow(id, body.stepId, body.decision, resolvedBy);
  if (!historical) {
    return NextResponse.json({ error: `Workflow '${id}' not found` }, { status: 404 });
  }

  return NextResponse.json({ workflow: historical, live: false });
}
