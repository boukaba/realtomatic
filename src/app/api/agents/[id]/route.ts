import { NextResponse } from 'next/server';
import { agents as agentCatalog } from '@/lib/mock-data';
import { getState } from '@/lib/store';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const agent = agentCatalog.find((a) => a.id === id);
  if (!agent) {
    return NextResponse.json({ error: `Agent with id '${id}' not found` }, { status: 404 });
  }

  const state = getState();
  const live = state.executions.filter((e) => e.agentId === id);

  return NextResponse.json({
    agent: {
      ...agent,
      lastRun: live.length > 0 ? live[live.length - 1].timestamp : agent.lastRun,
      liveExecutions: live.length,
    },
    executions: live.slice(-25).reverse(),
  });
}
