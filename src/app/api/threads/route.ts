import { NextResponse } from 'next/server';
import { listThreads, threadCounts } from '@/lib/db';
import { ensureFabricator } from '@/lib/fabricator';

export const dynamic = 'force-dynamic';

/**
 * Threads are the audit trail of agent collaboration and human decisions.
 * `status=awaiting_human` is the HITL queue with full context attached.
 */
export async function GET(request: Request) {
  ensureFabricator();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const valid = ['open', 'awaiting_human', 'resolved'] as const;
  const filter =
    status && (valid as readonly string[]).includes(status)
      ? { status: status as (typeof valid)[number], limit: 80 }
      : { limit: 80 };

  return NextResponse.json({
    threads: listThreads(filter),
    counts: threadCounts(),
  });
}
