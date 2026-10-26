import { sseResponse } from '@/lib/sse';
import { subscribe } from '@/lib/bus';
import { getState } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Live progress for a workflow run. Sends the current snapshot, then deltas. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  return sseResponse((send, close) => {
    const snapshot = getState().workflows.find((w) => w.id === id);
    if (snapshot) send({ type: 'workflow', workflow: snapshot });

    const unsubscribe = subscribe(`workflow:${id}`, (data) => {
      send(data);
      const workflow = (data as { workflow?: { status?: string } }).workflow;
      if (workflow && ['completed', 'failed'].includes(workflow.status ?? '')) {
        setTimeout(close, 400);
      }
    });
    // Safety: never hold the stream open beyond 5 minutes.
    setTimeout(() => {
      unsubscribe();
      close();
    }, 300_000);
    return () => unsubscribe();
  });
}
