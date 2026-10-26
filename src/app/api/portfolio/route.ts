import { NextResponse } from 'next/server';
import { portfolioSummary, properties, leases } from '@/lib/mock-data';
import { getState } from '@/lib/store';
import { ensureFabricator } from '@/lib/fabricator';

export const dynamic = 'force-dynamic';

export async function GET() {
  ensureFabricator();
  const state = getState();
  const successExecutions = state.executions.filter((e) => e.status === 'success');

  return NextResponse.json({
    summary: {
      ...portfolioSummary,
      recentActivity: [
        ...state.activity.slice(-8).reverse().map((a) => ({
          id: a.id,
          type: a.type === 'fabricator' || a.type === 'workflow' ? ('market' as const) : (a.type as 'lease' | 'valuation' | 'maintenance' | 'market' | 'tenant'),
          message: `${a.agentName ? `${a.agentName}: ` : ''}${a.title}`,
          timestamp: a.timestamp,
        })),
        ...portfolioSummary.recentActivity,
      ].slice(0, 10),
      liveStats: {
        agentRuns: successExecutions.length,
        artifactsSynthesized: state.fabricator.artifactsProduced,
        pendingApprovals: state.approvals.filter((a) => a.status === 'pending').length,
        workflowsRun: state.workflows.length,
      },
    },
    properties,
    leases,
  });
}
