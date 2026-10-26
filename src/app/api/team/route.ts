import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import { ensureFabricator } from '@/lib/fabricator';
import { agents } from '@/lib/mock-data';

export const dynamic = 'force-dynamic';

/**
 * The agent team as it actually is: each agent's live duty status, the work it
 * most recently completed, and the consults it has handed to peers. Powers
 * the autonomous-team board — agents are shown as staff on shift, not tools.
 */
export async function GET() {
  ensureFabricator();
  const state = getState();

  // An execution counts as "on task" if it finished in the last 90 seconds.
  const RECENT_MS = 90_000;
  const now = Date.now();

  const team = agents.map((agent) => {
    const runs = state.executions.filter((e) => e.agentId === agent.id).slice(-10).reverse();
    const last = runs[0];
    const lastAge = last ? now - Date.parse(last.timestamp) : Infinity;
    const working = lastAge < RECENT_MS;
    const consultsFrom = state.consults.filter((c) => c.fromAgentId === agent.id).length;
    const consultsTo = state.consults.filter((c) => c.toAgentId === agent.id).length;
    const successes = runs.filter((r) => r.status === 'success').length;

    return {
      id: agent.id,
      name: agent.name,
      category: agent.category,
      description: agent.description,
      // 'working' = mid-task, 'active' = did work recently, 'standing' = idle
      status: working ? 'working' : lastAge < 30 * 60_000 ? 'active' : 'standing',
      currentTask: working && last ? last.input : null,
      lastOutput: last?.output ?? null,
      lastRunAt: last?.timestamp ?? null,
      lastConfidence: last?.confidence ?? null,
      runCount: runs.length,
      successRate: runs.length > 0 ? Math.round((successes / runs.length) * 100) : agent.successRate,
      avgDuration: runs.length > 0 ? Math.round((runs.reduce((s, r) => s + r.duration, 0) / runs.length) * 10) / 10 : agent.avgExecutionTime,
      consultsFrom,
      consultsTo,
    };
  });

  return NextResponse.json({
    team,
    consults: state.consults.slice(-25).reverse(),
    fabricator: state.fabricator,
    counts: {
      working: team.filter((t) => t.status === 'working').length,
      active: team.filter((t) => t.status === 'active').length,
      consults: state.consults.length,
    },
  });
}
