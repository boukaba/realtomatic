import { sseResponse } from '@/lib/sse';
import { subscribe } from '@/lib/bus';
import { ensureAutopilot } from '@/lib/autopilot';
import { ensureFabricator } from '@/lib/fabricator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Live team feed for the agents board: every phase/done event the autopilot
 * produces streams here so the UI shows agents genuinely working in real time.
 */
export async function GET() {
  ensureFabricator();
  ensureAutopilot();

  return sseResponse((send) => {
    const unsubscribe = subscribe('team-feed', (data) => send(data));
    // Keep the stream warm and let clients know we're live.
    send({ type: 'activity', agentId: '__system__', agentName: 'Autopilot', phase: 'boot', label: 'Team feed connected', at: new Date().toISOString() });
    const stop = setTimeout(() => unsubscribe(), 300_000);
    return () => {
      clearTimeout(stop);
      unsubscribe();
    };
  });
}
