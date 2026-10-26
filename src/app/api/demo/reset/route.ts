import { NextResponse } from 'next/server';
import { resetState } from '@/lib/store';

export const dynamic = 'force-dynamic';

declare global {
  var __realtomaticSeeding: Promise<void> | undefined;
}

/**
 * Wipe demo state and re-seed from scratch. Intended for operators rehearsing
 * or resetting a live demo — everything agents produced is cleared, the
 * warm-up seeder re-runs, and the autopilot rebuilds a fresh portfolio.
 */
export async function POST() {
  resetState();
  // Allow the warm-up seeder to run again on the next request.
  globalThis.__realtomaticSeeding = undefined;

  // Kick both loops immediately so the workspace refills without waiting for
  // someone to open a page.
  try {
    const { ensureFabricator } = await import('@/lib/fabricator');
    const { ensureAutopilot } = await import('@/lib/autopilot');
    ensureFabricator();
    ensureAutopilot();
  } catch {
    // The next page load will start them anyway.
  }

  return NextResponse.json({ ok: true, resetAt: new Date().toISOString() });
}
