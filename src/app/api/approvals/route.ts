import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import { resolveApproval } from '@/lib/workflow-orchestrator';
import { ensureFabricator } from '@/lib/fabricator';
import { listThreads, threadCounts } from '@/lib/db';

export const dynamic = 'force-dynamic';

type AttentionItem = {
  id: string;
  artifactId: string;
  category: string;
  urgency: string;
  title: string;
  detail: string;
  body?: string;
  senderEmail?: string;
  counterparty?: string;
  propertyAddress?: string;
  source: string;
  createdAt: string;
  needsReply: boolean;
};

/**
 * Everything waiting on a human, in one queue:
 *   1. workflow approvals — an agent paused below its confidence threshold
 *   2. messages awaiting a reply — inbound items the agents flagged for a human
 *
 * Both are "HITL"; keeping them in separate places made the queue look empty
 * while the dashboard showed a backlog.
 */
export async function GET(request: Request) {
  ensureFabricator();

  const state = getState();
  const requests = state.approvals.slice().reverse();

  // Derive review items from the same source the dashboard uses.
  let reviews: AttentionItem[] = [];
  try {
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';
    const base =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin);
    const res = await fetch(`${base}/api/attention`, { cache: 'no-store' });
    if (res.ok) {
      const body = (await res.json()) as { items?: AttentionItem[] };
      reviews = (body.items ?? []).filter((i) => i.needsReply).slice(0, 25);
    }
  } catch {
    // If the self-fetch fails, still return the workflow approvals.
  }

  return NextResponse.json({
    requests,
    reviews,
    threads: threadCounts(),
    awaitingThreads: listThreads({ status: 'awaiting_human', limit: 10 }),
    counts: {
      pending: requests.filter((r) => r.status === 'pending').length,
      resolved: requests.filter((r) => r.status !== 'pending').length,
      reviews: reviews.length,
      awaitingThreads: threadCounts().awaiting,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const valid = ['approved', 'rejected', 'changes_requested'];
    if (!body.id || !valid.includes(body.decision)) {
      return NextResponse.json(
        { error: 'id and decision (approved | rejected | changes_requested) are required' },
        { status: 400 }
      );
    }

    const existing = getState().approvals.find((a) => a.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: `Approval '${body.id}' not found` }, { status: 404 });
    }
    if (existing.status !== 'pending') {
      return NextResponse.json({ error: `Approval already ${existing.status}` }, { status: 409 });
    }

    resolveApproval(body.id, body.decision, body.resolvedBy || 'you');
    const updated = getState().approvals.find((a) => a.id === body.id);
    return NextResponse.json({ approval: updated });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
