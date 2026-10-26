import { NextResponse } from 'next/server';
import { getState, type LiveWorkflow } from '@/lib/store';
import { startWorkflow, workflowTemplates } from '@/lib/workflow-orchestrator';
import { ensureFabricator } from '@/lib/fabricator';
import { listHistoricalWorkflows } from '@/lib/historical-workflows';
import type { Workflow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export type WorkflowStepView = {
  id: string;
  name: string;
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval';
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  input: string;
  output: string | null;
  confidence: number | null;
};

export type WorkflowView = {
  id: string;
  name: string;
  description: string;
  status: 'running' | 'completed' | 'failed' | 'pending_approval';
  steps: WorkflowStepView[];
  startedAt: string;
  completedAt: string | null;
  triggeredBy: string;
  live: boolean;
  template?: string;
};

function stepDuration(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) return null;
  return Math.round(((Date.parse(completedAt) - Date.parse(startedAt)) / 1000) * 10) / 10;
}

function liveToView(w: LiveWorkflow): WorkflowView {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    status: w.status,
    steps: w.steps.map((s) => ({
      id: s.id,
      name: s.name,
      agentName: s.agentName,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      duration: stepDuration(s.startedAt, s.completedAt),
      input: s.input,
      output: s.output,
      confidence: s.confidence,
    })),
    startedAt: w.startedAt,
    completedAt: w.completedAt,
    triggeredBy: w.triggeredBy,
    live: true,
    template: w.template,
  };
}

function historicalToView(w: Workflow): WorkflowView {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    status: w.status,
    steps: w.steps.map((s) => ({
      id: s.id,
      name: s.name,
      agentName: s.agentName,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      duration: s.duration,
      input: s.input,
      output: s.output,
      confidence: s.confidence,
    })),
    startedAt: w.startedAt,
    completedAt: w.completedAt,
    triggeredBy: w.triggeredBy,
    live: false,
  };
}

export async function GET() {
  ensureFabricator();
  const state = getState();
  const liveIds = new Set(state.workflows.map((w) => w.id));
  const runs: WorkflowView[] = [
    ...state.workflows.slice().reverse().map(liveToView),
    ...listHistoricalWorkflows()
      .filter((w) => !liveIds.has(w.id))
      .map(historicalToView),
  ].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  return NextResponse.json({
    runs,
    templates: workflowTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      steps: t.steps.map((s) => s.name),
    })),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.template) {
      return NextResponse.json({ error: 'template is required' }, { status: 400 });
    }
    ensureFabricator();
    const workflowId = startWorkflow(String(body.template), body.triggeredBy || 'operator');
    if (!workflowId) {
      return NextResponse.json({ error: `Unknown template '${body.template}'` }, { status: 404 });
    }
    return NextResponse.json({ workflowId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
