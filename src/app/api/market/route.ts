import { NextResponse } from 'next/server';
import { marketData } from '@/lib/mock-data';
import { getState } from '@/lib/store';
import { ensureFabricator } from '@/lib/fabricator';
import type { MarketData, PropertyType } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Market data = seeded baseline + live market snapshots synthesized by the
 * Atlas agent. Live snapshots sit on top, so the page visibly accumulates
 * fresh metros as the demo runs.
 */
export async function GET(request: Request) {
  ensureFabricator();
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city');
  const state = searchParams.get('state');
  const propertyType = searchParams.get('propertyType');

  const live: MarketData[] = getState()
    .artifacts.filter((a) => a.kind === 'market-snapshot')
    .slice(-8)
    .reverse()
    .map((a) => {
      const p = a.payload as Record<string, number | string>;
      return {
        id: a.id,
        city: String(p.city ?? 'Unknown'),
        state: String(p.state ?? ''),
        propertyType: (String(p.propertyType ?? 'office') as PropertyType),
        medianRent: Math.round(Number(p.medianRentPerSqFt ?? 0) * 100) / 100,
        rentGrowth: Number(p.rentGrowth ?? 0),
        vacancyRate: Number(p.vacancyRate ?? 0),
        absorption: Number(p.absorption ?? 0),
        capRate: Number(p.capRate ?? 0),
        populationGrowth: Number(p.populationGrowth ?? 0),
        jobGrowth: Number(p.jobGrowth ?? 0),
        timestamp: a.createdAt,
      };
    });

  const combined = [...live, ...marketData];

  let filtered = combined;
  if (city) filtered = filtered.filter((m) => m.city.toLowerCase() === city.toLowerCase());
  if (state) filtered = filtered.filter((m) => m.state.toLowerCase() === state.toLowerCase());
  if (propertyType) filtered = filtered.filter((m) => m.propertyType === (propertyType as PropertyType));

  return NextResponse.json({ marketData: filtered, liveCount: live.length });
}
