import { NextResponse } from 'next/server';
import { leases } from '@/lib/mock-data';
import type { LeaseExtraction } from '@/lib/ai';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): Promise<void> {
  return delay(100 + Math.random() * 400);
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  await randomDelay();

  const { id } = await context.params;
  const lease = leases.find((l) => l.id === id);

  if (!lease) {
    return NextResponse.json(
      { error: `Lease with id '${id}' not found` },
      { status: 404 }
    );
  }

  return NextResponse.json({ lease });
}

export async function POST(_request: Request, context: RouteContext) {
  await delay(500 + Math.random() * 1000);

  const { id } = await context.params;
  const lease = leases.find((l) => l.id === id);

  if (!lease) {
    return NextResponse.json(
      { error: `Lease with id '${id}' not found` },
      { status: 404 }
    );
  }

  const extraction: LeaseExtraction = {
    tenantName: lease.tenantName,
    propertyAddress: `Property ${lease.propertyId}`,
    leaseTerm: `${lease.startDate} to ${lease.endDate}`,
    monthlyRent: lease.monthlyRent,
    startDate: lease.startDate,
    endDate: lease.endDate,
    clauses: lease.clauses.map((clause) => ({
      type: clause.type,
      title: clause.title,
      content: clause.content,
      confidence: clause.confidence,
    })),
    overallConfidence: lease.confidence,
  };

  return NextResponse.json({ extraction });
}
