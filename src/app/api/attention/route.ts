import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import { ensureFabricator } from '@/lib/fabricator';

export const dynamic = 'force-dynamic';

/**
 * The operator's attention queue: everything Realtomatic has noticed across
 * the portfolio that a human should act on, derived from REAL artifacts the
 * agents produced. This is the "what needs me today" feed — not analytics.
 *
 * Sources:
 *  - tenant-email  → an inbound message from a tenant/prospect (needs a reply)
 *  - lease-document→ expiry horizon + non-standard clauses flagged by the abstractor
 *  - lead          → an inbound leasing lead waiting on a response
 *  - comps-set     → an outbound email an agent already sent (sent, not action)
 */

export type AttentionItem = {
  id: string;
  category: 'maintenance' | 'lease_question' | 'expansion' | 'complaint' | 'expiring-lease' | 'lead';
  urgency: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  /** Full inbound text, untruncated, for the detail view. */
  body?: string;
  /** Sender address, used to match an agent's outbound reply. */
  senderEmail?: string;
  subject?: string;
  propertyAddress?: string;
  counterparty?: string;
  source: string;
  artifactId: string;
  createdAt: string;
  needsReply: boolean;
};

export type SentEmail = {
  id: string;
  to: string;
  subject: string;
  body: string;
  followUpInDays?: number;
  tone?: string;
  producedBy: string;
  createdAt: string;
};

export type HandledItem = {
  id: string;
  kind: 'agent-run' | 'sent-email' | 'resolution';
  agentName: string;
  title: string;
  detail: string;
  createdAt: string;
  artifactId?: string;
};

export type InboxPayload = {
  attention: AttentionItem[];
  sent: SentEmail[];
  handled: HandledItem[];
  counts: {
    critical: number;
    needsReply: number;
    total: number;
    sent: number;
    handled: number;
  };
};

function daysUntil(dateStr: string): number | null {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

const URGENT_CATEGORIES = new Set(['maintenance', 'complaint']);

function urgencyForEmail(category: string): AttentionItem['urgency'] {
  if (URGENT_CATEGORIES.has(category)) return 'critical';
  if (category === 'lease_question') return 'high';
  if (category === 'expansion') return 'medium';
  return 'low';
}

function buildFromState() {
  const state = getState();
  const items: AttentionItem[] = [];
  const now = Date.now();

  for (const a of state.artifacts) {
    const ageMin = Math.round((now - Date.parse(a.createdAt)) / 60_000);

    if (a.kind === 'tenant-email') {
      const p = a.payload as Record<string, unknown>;
      const category = typeof p.category === 'string' ? p.category : 'lease_question';
      const from = typeof p.from === 'string' ? p.from : '';
      const emailMatch = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(from);
      items.push({
        id: `att-${a.id}`,
        category: category as AttentionItem['category'],
        urgency: urgencyForEmail(category),
        title: typeof p.subject === 'string' ? p.subject : 'Tenant message',
        detail:
          typeof p.body === 'string'
            ? p.body.slice(0, 180)
            : typeof p.summary === 'string'
              ? p.summary
              : 'Inbound message from a property contact.',
        body: typeof p.body === 'string' ? p.body : undefined,
        senderEmail: emailMatch?.[0],
        subject: typeof p.subject === 'string' ? p.subject : undefined,
        propertyAddress: typeof p.propertyAddress === 'string' ? p.propertyAddress : undefined,
        counterparty: from || undefined,
        source: 'Email (received)',
        artifactId: a.id,
        createdAt: a.createdAt,
        needsReply: true,
      });
    }

    if (a.kind === 'lease-document') {
      const p = a.payload as Record<string, unknown>;
      const endDate = typeof p.endDate === 'string' ? p.endDate : undefined;
      const days = endDate ? daysUntil(endDate) : null;
      const flags = Array.isArray(p.nonStandardFlags) ? (p.nonStandardFlags as unknown[]).map(String) : [];
      const tenant = typeof p.tenantName === 'string' ? p.tenantName : 'Tenant';
      const address = typeof p.propertyAddress === 'string' ? p.propertyAddress : undefined;

      if (flags.length > 0) {
        items.push({
          id: `att-flag-${a.id}`,
          category: 'lease_question',
          urgency: 'high',
          title: `Non-standard clause · ${tenant}`,
          detail: flags.join(' · '),
          propertyAddress: address,
          counterparty: tenant,
          source: 'Lease Abstractor',
          artifactId: a.id,
          createdAt: a.createdAt,
          needsReply: false,
        });
      }
      if (days !== null && days <= 180 && days >= 0) {
        items.push({
          id: `att-exp-${a.id}`,
          category: 'expiring-lease',
          urgency: days <= 90 ? 'high' : 'medium',
          title: days <= 0 ? `Lease expired · ${tenant}` : `Lease expires in ${days} days · ${tenant}`,
          detail: `Term ends ${endDate}. Renewal decision needed to avoid downtime.`,
          propertyAddress: address,
          counterparty: tenant,
          source: 'Lease Abstractor',
          artifactId: a.id,
          createdAt: a.createdAt,
          needsReply: false,
        });
      }
    }

    if (a.kind === 'lead') {
      const p = a.payload as Record<string, unknown>;
      const name = typeof p.name === 'string' ? p.name : 'New lead';
      const src = typeof p.source === 'string' ? p.source : 'Website';
      items.push({
        id: `att-lead-${a.id}`,
        category: 'lead',
        urgency: ageMin <= 10 ? 'high' : 'medium',
        title: `${name} · ${src}`,
        detail:
          typeof p.message === 'string'
            ? p.message.slice(0, 180)
            : `${typeof p.propertyInterest === 'string' ? p.propertyInterest : ''} · ${typeof p.budget === 'string' ? p.budget : ''}`,
        propertyAddress: typeof p.propertyInterest === 'string' ? p.propertyInterest : undefined,
        counterparty: name,
        source: `${src} lead`,
        artifactId: a.id,
        createdAt: a.createdAt,
        needsReply: true,
      });
    }
  }

  const rank: Record<AttentionItem['urgency'], number> = { critical: 0, high: 1, medium: 2, low: 3 };
  // Within an urgency band, oldest first — a work queue you move *through*.
  // (Newest-first made the list churn every cycle as agents produced work.)
  items.sort(
    (a, b) => rank[a.urgency] - rank[b.urgency] || Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );

  const open = items.slice(0, 60);

  // Outbound: execution artifacts that produced a real drafted/sent email
  // (the Email Outreach Agent's output shape carries to/subject/body).
  const sent: SentEmail[] = [];
  for (const e of state.executions) {
    const p = e.artifact?.payload as Record<string, unknown> | undefined;
    if (!p) continue;
    if (typeof p.to !== 'string' || typeof p.subject !== 'string' || typeof p.body !== 'string') continue;
    sent.push({
      id: `sent-${e.id}`,
      to: p.to,
      subject: p.subject,
      body: p.body,
      followUpInDays: typeof p.followUpInDays === 'number' ? p.followUpInDays : undefined,
      tone: typeof p.tone === 'string' ? p.tone : undefined,
      producedBy: e.agentName,
      createdAt: e.timestamp,
    });
  }
  sent.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  // Work your agents completed autonomously — the "staff did their job" side.
  const handled: HandledItem[] = [];
  for (const e of state.executions) {
    if (e.status !== 'success') continue;
    handled.push({
      id: `handled-${e.id}`,
      kind: 'agent-run',
      agentName: e.agentName,
      title: `${e.agentName} completed a task`,
      detail: `${e.output} · ${e.duration}s · ${e.confidence > 0 ? `${Math.round(e.confidence * 100)}% confidence` : ''}`.trim(),
      createdAt: e.timestamp,
      artifactId: e.artifact?.id,
    });
  }
  for (const s of sent) {
    handled.push({
      id: `handled-${s.id}`,
      kind: 'sent-email',
      agentName: s.producedBy,
      title: `${s.producedBy} replied to ${s.to}`,
      detail: s.subject,
      createdAt: s.createdAt,
    });
  }
  for (const r of state.resolutions) {
    handled.push({
      id: `handled-${r.itemId}`,
      kind: 'resolution',
      agentName: r.agentName ?? 'You',
      title:
        r.action === 'replied'
          ? 'You replied — agent drafted it'
          : r.action === 'directive'
            ? `${r.agentName ?? 'Agent'} acted on your instruction`
            : 'You closed this item',
      detail: r.note ?? 'Closed by operator',
      createdAt: r.at,
    });
  }
  handled.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return { items: open, sent: sent.slice(0, 25), handled: handled.slice(0, 40) };
}

export async function GET() {
  ensureFabricator();
  const { items, sent, handled } = buildFromState();

  // Anything the operator already acted on leaves the queue.
  const state = getState();
  const doneArtifactIds = new Set(state.resolutions.map((r) => r.artifactId));
  const open = items.filter((i) => !doneArtifactIds.has(i.artifactId));

  return NextResponse.json({
    items: open,
    sent,
    handled,
    counts: {
      critical: open.filter((i) => i.urgency === 'critical').length,
      needsReply: open.filter((i) => i.needsReply).length,
      total: open.length,
      sent: sent.length,
      handled: handled.length,
    },
  });
}
