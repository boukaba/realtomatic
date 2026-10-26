import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import { ensureFabricator } from '@/lib/fabricator';

export const dynamic = 'force-dynamic';

export type LeaseView = {
  id: string;
  tenantName: string;
  tenantIndustry: string;
  propertyAddress: string;
  leaseType: string;
  monthlyRent: number;
  sqFt: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'expiring' | 'expired' | 'draft';
  confidence: number;
  clauses: {
    type: string;
    title: string;
    content: string;
    isStandard: boolean;
    confidence: number;
  }[];
  nonStandardFlags: string[];
  summary: string;
  abstracted: boolean;
  createdAt: string;
};

function daysUntil(dateStr: string): number | null {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

function statusFor(endDate: string, abstracted: boolean): LeaseView['status'] {
  if (!abstracted) return 'draft';
  const days = daysUntil(endDate);
  if (days === null) return 'active';
  if (days < 0) return 'expired';
  if (days <= 180) return 'expiring';
  return 'active';
}

/**
 * Every lease the platform knows about, built from real artifacts: raw lease
 * documents Atlas synthesized, and the structured abstracts the Lease
 * Abstractor produced from them.
 *
 * The same lease can be abstracted more than once (an agent may revisit it),
 * and each abstract is a separate artifact. Rows are therefore collapsed to
 * ONE per lease, preferring the abstracted version and, among those, the most
 * recent — otherwise the page fills with the same tenant at different
 * confidence scores.
 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
}

export async function GET() {
  ensureFabricator();
  const state = getState();

  type Candidate = LeaseView & { sourceArtifactId?: string };

  const candidates: Candidate[] = state.artifacts
    .filter((a) => a.kind === 'lease-document')
    .map((a) => {
      const p = a.payload as Record<string, unknown>;
      const clauses = Array.isArray(p.clauses)
        ? (p.clauses as Record<string, unknown>[]).map((c) => ({
            type: typeof c.type === 'string' ? c.type : 'rent',
            title: typeof c.title === 'string' ? c.title : 'Clause',
            content: typeof c.content === 'string' ? c.content : '',
            isStandard: c.isStandard !== false,
            confidence: typeof c.confidence === 'number' ? c.confidence : 0.9,
          }))
        : [];
      const abstracted = clauses.length > 0;

      return {
        id: a.id,
        tenantName: typeof p.tenantName === 'string' ? p.tenantName : 'Unknown tenant',
        tenantIndustry: typeof p.tenantIndustry === 'string' ? p.tenantIndustry : 'Commercial',
        propertyAddress: typeof p.propertyAddress === 'string' ? p.propertyAddress : 'Unknown address',
        leaseType: typeof p.leaseType === 'string' ? p.leaseType : 'NNN',
        monthlyRent: Number(p.monthlyRent ?? 0),
        sqFt: Number(p.sqFt ?? p.totalSqFt ?? 0),
        startDate: typeof p.startDate === 'string' ? p.startDate : '',
        endDate: typeof p.endDate === 'string' ? p.endDate : '',
        status: statusFor(typeof p.endDate === 'string' ? p.endDate : '', abstracted),
        confidence:
          typeof p.overallConfidence === 'number'
            ? p.overallConfidence
            : typeof p.confidence === 'number'
              ? p.confidence
              : 0.9,
        clauses,
        nonStandardFlags: Array.isArray(p.nonStandardFlags) ? (p.nonStandardFlags as unknown[]).map(String) : [],
        summary: typeof p.summary === 'string' ? p.summary : a.summary,
        abstracted,
        createdAt: a.createdAt,
        sourceArtifactId: a.sourceArtifactId,
      };
    });

  // Group: an abstract points at its source document; fall back to the lease's
  // own identity so raw documents and abstracts land in the same bucket.
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = normalize(`${c.tenantName}|${c.propertyAddress}|${c.sqFt}`);
    const bucket = groups.get(key);
    if (bucket) bucket.push(c);
    else groups.set(key, [c]);
  }

  const leases: LeaseView[] = [];
  for (const bucket of groups.values()) {
    // Prefer an abstract; among equals, the most recent run wins.
    const best = bucket
      .slice()
      .sort((a, b) => {
        if (a.abstracted !== b.abstracted) return a.abstracted ? -1 : 1;
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      })[0];
    leases.push(best);
  }

  leases.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return NextResponse.json({
    leases,
    counts: {
      total: leases.length,
      abstracted: leases.filter((l) => l.abstracted).length,
      expiring: leases.filter((l) => l.status === 'expiring').length,
      flagged: leases.filter((l) => l.nonStandardFlags.length > 0).length,
    },
  });
}
