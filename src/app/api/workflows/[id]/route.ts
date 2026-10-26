import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import { workflows as historicalWorkflows } from '@/lib/mock-data';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const live = getState().workflows.find((w) => w.id === id);
  if (live) return NextResponse.json({ workflow: live });

  const historical = historicalWorkflows.find((w) => w.id === id);
  if (historical) return NextResponse.json({ workflow: historical });

  return NextResponse.json({ error: `Workflow '${id}' not found` }, { status: 404 });
}
