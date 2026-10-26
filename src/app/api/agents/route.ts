import { NextResponse } from 'next/server';
import { agents as agentCatalog } from '@/lib/mock-data';
import { getState } from '@/lib/store';
import { ensureFabricator } from '@/lib/fabricator';
import { isLlmAvailable, llmBackend, llmBackendLabel } from '@/lib/llm';

export const dynamic = 'force-dynamic';

export async function GET() {
  ensureFabricator();
  const state = getState();
  const llmUp = await isLlmAvailable();

  const enriched = agentCatalog.map((agent) => {
    const liveExecutions = state.executions.filter((e) => e.agentId === agent.id);
    const isAtlas = agent.id === 'agent-atlas';
    return {
      ...agent,
      status: isAtlas
        ? state.fabricator.running
          ? ('running' as const)
          : ('idle' as const)
        : liveExecutions.some((e) => e.status === 'running')
          ? ('running' as const)
          : agent.status,
      tasksToday: agent.tasksToday + liveExecutions.filter((e) => e.status === 'success').length,
      lastRun: liveExecutions.length > 0 ? liveExecutions[liveExecutions.length - 1].timestamp : agent.lastRun,
      liveExecutions: liveExecutions.length,
      aiBackend: llmUp ? llmBackendLabel() : `${llmBackend()}-unavailable`,
    };
  });

  return NextResponse.json({
    agents: enriched,
    llm: llmUp,
    llmBackend: llmBackend(),
    llmLabel: llmBackendLabel(),
    // Kept for older clients that used the OpenCode-specific flag.
    opencode: llmBackend() === 'opencode' ? llmUp : false,
  });
}
