'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { AgentActionDialog, type ActionTarget } from '@/components/agent-action-dialog';
import { toast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn, timeAgo } from '@/lib/utils';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';

type ReviewItem = {
  id: string;
  artifactId: string;
  category: string;
  urgency: string;
  title: string;
  detail: string;
  counterparty?: string;
  propertyAddress?: string;
  source: string;
  createdAt: string;
};

type Approval = {
  id: string;
  workflowId?: string;
  stepId?: string;
  agentId: string;
  agentName: string;
  type: 'approval' | 'review' | 'escalation';
  title: string;
  description: string;
  data: Record<string, unknown>;
  confidence: number;
  status: ApprovalStatus;
  requestedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
};

const PRIORITY_CHIP: Record<Approval['priority'], string> = {
  critical: 'bg-red-500/15 text-red-300',
  high: 'bg-amber-500/15 text-amber-300',
  medium: 'bg-blue-500/15 text-blue-300',
  low: 'bg-slate-500/15 text-slate-300',
};

const STATUS_CHIP: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-300',
  rejected: 'bg-red-500/15 text-red-300',
  changes_requested: 'bg-violet-500/15 text-violet-300',
};

function confidenceColor(c: number): string {
  if (c >= 0.85) return 'text-emerald-400';
  if (c >= 0.7) return 'text-amber-400';
  return 'text-red-400';
}

/** Render a structured payload as readable key/value rows. */
function PayloadView({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) {
    return <p className="text-xs text-slate-500">No structured output attached.</p>;
  }
  return (
    <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      {entries.slice(0, 24).map(([key, value]) => (
        <div key={key} className="flex gap-3 text-[11px]">
          <span className="w-32 shrink-0 font-medium text-sky-400">{key}</span>
          <span className="min-w-0 flex-1 break-words text-slate-300">
            {Array.isArray(value)
              ? value.length === 0
                ? '—'
                : typeof value[0] === 'object'
                  ? `${value.length} item${value.length === 1 ? '' : 's'}`
                  : value.map(String).join(', ').slice(0, 260)
              : typeof value === 'object' && value !== null
                ? JSON.stringify(value).slice(0, 260)
                : String(value).slice(0, 260)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<Approval[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [counts, setCounts] = useState({ pending: 0, resolved: 0, reviews: 0 });
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const pull = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals');
      if (!res.ok) return;
      const body = await res.json();
      setRequests(body.requests ?? []);
      setReviews(body.reviews ?? []);
      setCounts(body.counts ?? { pending: 0, resolved: 0, reviews: 0 });
    } catch {
      // keep last
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void pull(), 0);
    const t = setInterval(pull, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [pull]);

  const decide = async (id: string, decision: 'approved' | 'rejected' | 'changes_requested') => {
    setBusy(id);
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      });
      if (res.ok) await pull();
    } catch {
      // ignore
    } finally {
      setBusy(null);
    }
  };

  const closeReview = async (r: ReviewItem) => {
    try {
      const res = await fetch('/api/attention/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, artifactId: r.artifactId, action: 'resolve' }),
      });
      if (res.ok) {
        toast('Item closed');
        await pull();
      }
    } catch {
      // next poll reconciles
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const resolved = requests.filter((r) => r.status !== 'pending');
  const visible = showResolved ? resolved : pending;

  return (
    <AppLayout title="Approvals">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Approvals</h2>
            <p className="mt-1 text-sm text-zinc-400">
              When an agent is less than 85% certain, it stops and asks. Approve to resume the workflow.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {counts.pending > 0 && (
              <Badge className="border-transparent bg-amber-500/15 text-amber-300">
                <Clock className="mr-1 h-3 w-3" />
                {counts.pending} waiting
              </Badge>
            )}
            <Badge className="border-transparent bg-emerald-500/15 text-emerald-300">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {counts.resolved} resolved
            </Badge>
          </div>
        </div>

        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
          <button
            onClick={() => setShowResolved(false)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              !showResolved ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            Awaiting review ({pending.length})
          </button>
          <button
            onClick={() => setShowResolved(true)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              showResolved ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            Resolved ({resolved.length})
          </button>
        </div>

        {/* Messages waiting on a human reply */}
        {!showResolved && reviews.length > 0 && (
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              Messages awaiting your reply ({reviews.length})
            </h3>
            <div className="space-y-3">
              {reviews.map((r) => (
                <Card key={r.id} className="border-slate-700 bg-slate-900">
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-zinc-100">{r.title}</p>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              r.urgency === 'critical'
                                ? 'bg-red-500/15 text-red-300'
                                : r.urgency === 'high'
                                  ? 'bg-amber-500/15 text-amber-300'
                                  : 'bg-blue-500/15 text-blue-300'
                            )}
                          >
                            {r.urgency}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{r.detail}</p>
                        <p className="mt-1.5 text-[11px] text-slate-500">
                          {r.counterparty ?? 'Property contact'}
                          {r.propertyAddress ? ` · ${r.propertyAddress}` : ''} · {timeAgo(r.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          className="bg-blue-600 text-white hover:bg-blue-700"
                          onClick={() => {
                            setActionTarget({
                              id: r.id,
                              artifactId: r.artifactId,
                              title: r.title,
                              mode: 'reply',
                            });
                            setDialogOpen(true);
                          }}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Draft reply
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-400 hover:text-emerald-400"
                          onClick={() => void closeReview(r)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Close
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading queue…</p>
        ) : visible.length === 0 ? (
          <Card className="border-slate-700 bg-slate-900">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <ShieldCheck className="h-10 w-10 text-emerald-400/70" />
              <p className="mt-3 text-sm font-medium text-zinc-200">
                {showResolved ? 'Nothing resolved yet.' : 'No approvals waiting — your agents are handling it.'}
              </p>
              <p className="mt-1 max-w-md text-xs text-slate-500">
                {showResolved
                  ? 'Decisions you make here are logged and resume the paused workflow.'
                  : 'Requests appear here when a workflow step finishes below the confidence threshold.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {visible.map((r) => {
              const isOpen = expanded === r.id;
              const isPending = r.status === 'pending';
              return (
                <Card key={r.id} className="border-slate-700 bg-slate-900">
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                            isPending ? 'bg-amber-500/15' : 'bg-slate-800'
                          )}
                        >
                          {isPending ? (
                            <AlertTriangle className="h-5 w-5 text-amber-400" />
                          ) : r.status === 'approved' ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-zinc-100">{r.title}</p>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PRIORITY_CHIP[r.priority])}>
                              {r.priority}
                            </span>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_CHIP[r.status])}>
                              {r.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-400">{r.description}</p>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              {r.agentName}
                            </span>
                            <span className={cn('font-semibold', confidenceColor(r.confidence))}>
                              {Math.round(r.confidence * 100)}% confidence
                            </span>
                            <span>{timeAgo(r.requestedAt)}</span>
                            {r.resolvedBy && <span>· resolved by {r.resolvedBy}</span>}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-400 hover:text-slate-200"
                          onClick={() => setExpanded(isOpen ? null : r.id)}
                        >
                          <FileSearch className="h-3.5 w-3.5" />
                          Output
                          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
                        </Button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mt-4">
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          Structured output under review
                        </p>
                        <PayloadView data={r.data} />
                      </div>
                    )}

                    {isPending && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          disabled={busy === r.id}
                          onClick={() => void decide(r.id, 'approved')}
                        >
                          {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Approve &amp; resume
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-700 bg-slate-800/50 text-zinc-200 hover:bg-slate-800"
                          disabled={busy === r.id}
                          onClick={() => void decide(r.id, 'changes_requested')}
                        >
                          Request changes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          disabled={busy === r.id}
                          onClick={() => void decide(r.id, 'rejected')}
                        >
                          Reject
                        </Button>
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-600">
                          <RefreshCw className="h-3 w-3" />
                          auto-refreshing
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AgentActionDialog
        key={actionTarget ? `${actionTarget.id}:${actionTarget.mode}` : 'none'}
        target={actionTarget}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCommitted={() => void pull()}
      />
    </AppLayout>
  );
}
