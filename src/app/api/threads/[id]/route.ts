import { NextResponse } from 'next/server';
import { appendMessage, getThread, setThreadStatus } from '@/lib/db';
import { ensureFabricator } from '@/lib/fabricator';
import { resolveApproval } from '@/lib/workflow-orchestrator';
import { getState } from '@/lib/store';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** One thread with its full conversation. */
export async function GET(_request: Request, context: RouteContext) {
  ensureFabricator();
  const { id } = await context.params;
  const found = getThread(id);
  if (!found) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }
  return NextResponse.json(found);
}

/**
 * A human weighing in on a thread. The message is always recorded; if the
 * thread is waiting on an approval and a decision is supplied, that approval
 * is resolved too — which resumes the paused workflow.
 */
export async function POST(request: Request, context: RouteContext) {
  ensureFabricator();
  const { id } = await context.params;

  const found = getThread(id);
  if (!found) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }

  let body: { text?: string; decision?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const decision = body.decision;

  if (!text && !decision) {
    return NextResponse.json({ error: 'text or decision is required' }, { status: 400 });
  }

  // Find the approval this thread is waiting on, if any.
  const pendingApproval = getState().approvals.find(
    (a) => a.status === 'pending' && found.messages.some((m) => m.meta?.approvalId === a.id)
  );

  if (decision) {
    const valid = ['approved', 'rejected', 'changes_requested'];
    if (!valid.includes(decision)) {
      return NextResponse.json({ error: `Unknown decision '${decision}'` }, { status: 400 });
    }
    if (pendingApproval) {
      resolveApproval(pendingApproval.id, decision as 'approved' | 'rejected' | 'changes_requested', 'you');
    } else {
      appendMessage(id, {
        role: 'human',
        authorId: 'you',
        authorName: 'You',
        kind: 'decision',
        text: `Decision: ${decision.replace('_', ' ')}`,
      });
      setThreadStatus(id, decision === 'changes_requested' ? 'open' : 'resolved');
    }
  }

  if (text) {
    appendMessage(id, {
      role: 'human',
      authorId: 'you',
      authorName: 'You',
      kind: 'note',
      text,
    });
    // A note on an open thread keeps it open; on a resolved one it reopens it
    // so the orientation is not lost.
    const after = getThread(id);
    if (after && after.thread.status === 'resolved') setThreadStatus(id, 'open');
  }

  return NextResponse.json(getThread(id));
}
