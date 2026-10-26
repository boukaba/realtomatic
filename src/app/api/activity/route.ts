import { sseResponse } from '@/lib/sse';
import { subscribe } from '@/lib/bus';
import { getState } from '@/lib/store';
import { ensureFabricator } from '@/lib/fabricator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Live activity firehose for the dashboard: initial recent-activity batch,
 * then every fabricator cycle, execution, workflow event, and approval as
 * it happens.
 */
export async function GET() {
  ensureFabricator();

  return sseResponse((send, close) => {
    const state = getState();
    send({
      type: 'snapshot',
      activity: state.activity.slice(-30).reverse(),
      fabricator: state.fabricator,
      artifacts: state.artifacts.slice(-12).reverse().map((a) => ({
        id: a.id,
        kind: a.kind,
        summary: a.summary,
        producedBy: a.producedBy,
        createdAt: a.createdAt,
      })),
      executions: state.executions.slice(-10).reverse().map((e) => ({
        id: e.id,
        agentId: e.agentId,
        agentName: e.agentName,
        status: e.status,
        duration: e.duration,
        confidence: e.confidence,
        timestamp: e.timestamp,
      })),
      approvals: state.approvals.filter((a) => a.status === 'pending').length,
    });

    const unsubscribe = subscribe('activity', (data) => send({ type: 'event', event: data }));
    // Refresh loop: the bus only carries notifications; snapshots re-pull state.
    const refresher = setInterval(() => {
      const s = getState();
      send({
        type: 'snapshot',
        activity: s.activity.slice(-30).reverse(),
        fabricator: s.fabricator,
        artifacts: s.artifacts.slice(-12).reverse().map((a) => ({
          id: a.id,
          kind: a.kind,
          summary: a.summary,
          producedBy: a.producedBy,
          createdAt: a.createdAt,
        })),
        executions: s.executions.slice(-10).reverse().map((e) => ({
          id: e.id,
          agentId: e.agentId,
          agentName: e.agentName,
          status: e.status,
          duration: e.duration,
          confidence: e.confidence,
          timestamp: e.timestamp,
        })),
        approvals: s.approvals.filter((a) => a.status === 'pending').length,
      });
    }, 10_000);

    const stop = setTimeout(close, 300_000);
    return () => {
      clearInterval(refresher);
      clearTimeout(stop);
      unsubscribe();
    };
  });
}
