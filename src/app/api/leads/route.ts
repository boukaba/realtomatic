import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import { ensureFabricator } from '@/lib/fabricator';

export const dynamic = 'force-dynamic';

/** Residential leasing leads straight from the artifacts the Lead agent works on. */
export async function GET() {
  ensureFabricator();
  const state = getState();

  const leads = state.artifacts
    .filter((a) => a.kind === 'lead')
    .reverse()
    .slice(0, 40)
    .map((a) => {
      const p = a.payload as Record<string, unknown>;
      return {
        id: a.id,
        name: typeof p.name === 'string' ? p.name : 'Unknown lead',
        email: typeof p.email === 'string' ? p.email : undefined,
        phone: typeof p.phone === 'string' ? p.phone : undefined,
        source: typeof p.source === 'string' ? p.source : 'Website',
        propertyInterest:
          typeof p.propertyInterest === 'string' ? p.propertyInterest : (a.summary ?? ''),
        budget: typeof p.budget === 'string' ? p.budget : undefined,
        timeline: typeof p.timeline === 'string' ? p.timeline : undefined,
        message: typeof p.message === 'string' ? p.message : a.summary,
        createdAt: a.createdAt,
      };
    });

  return NextResponse.json({ leads, total: leads.length });
}
