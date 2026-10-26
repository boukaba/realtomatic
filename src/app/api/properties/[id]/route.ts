import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import { ensureFabricator } from '@/lib/fabricator';
import { properties } from '@/lib/mock-data';

export const dynamic = 'force-dynamic';

/**
 * Per-property rollup: everything the agents know about ONE building —
 * open items, handled work, mail, and the artifacts that mention it.
 * Matching is by property name / street / city against artifact text, so a
 * building page is assembled from real data rather than canned rows.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  ensureFabricator();
  const { id } = await context.params;
  const property = properties.find((p) => p.id === id);
  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  }

  const state = getState();
  const resolvedArtifactIds = new Set(state.resolutions.map((r) => r.artifactId));

  const needles = [property.name, property.address.split(',')[0]].filter(Boolean).map((s) => s.toLowerCase());

  const mentions = (text: unknown): boolean => {
    if (typeof text !== 'string') return false;
    const t = text.toLowerCase();
    return needles.some((n) => t.includes(n));
  };

  const forProperty = state.artifacts.filter((a) => {
    const p = a.payload as Record<string, unknown>;
    return (
      mentions(p.propertyAddress) ||
      mentions(p.propertyInterest) ||
      mentions(a.summary) ||
      mentions(p.city)
    );
  });

  const openItems = forProperty
    .filter((a) => !resolvedArtifactIds.has(a.id))
    .map((a) => {
      const p = a.payload as Record<string, unknown>;
      const isEmail = a.kind === 'tenant-email';
      const isLease = a.kind === 'lease-document';
      const isLead = a.kind === 'lead';
      return {
        id: `pi-${a.id}`,
        artifactId: a.id,
        kind: a.kind,
        urgency: isEmail || isLead ? 'high' : isLease ? 'medium' : 'low',
        title:
          (typeof p.subject === 'string' && p.subject) ||
          (typeof p.name === 'string' && `${p.name} · ${p.source ?? 'lead'}`) ||
          (typeof p.tenantName === 'string' && `Lease · ${p.tenantName}`) ||
          a.summary,
        detail: (typeof p.body === 'string' && p.body.slice(0, 200)) || (typeof p.summary === 'string' && p.summary) || a.summary,
        createdAt: a.createdAt,
      };
    });

  // Mail sent by agents that references this property.
  const mail = state.executions
    .filter((e) => {
      const p = e.artifact?.payload as Record<string, unknown> | undefined;
      return p ? mentions(p.body) || mentions(p.subject) : false;
    })
    .slice(-15)
    .reverse()
    .map((e) => {
      const p = e.artifact?.payload as Record<string, unknown>;
      return {
        id: `pm-${e.id}`,
        to: typeof p?.to === 'string' ? p.to : undefined,
        subject: typeof p?.subject === 'string' ? p.subject : e.output,
        body: typeof p?.body === 'string' ? p.body : e.output,
        agentName: e.agentName,
        createdAt: e.timestamp,
      };
    });

  return NextResponse.json({
    property,
    openItems,
    mail,
    counts: {
      open: openItems.length,
      mail: mail.length,
      artifacts: forProperty.length,
    },
  });
}
