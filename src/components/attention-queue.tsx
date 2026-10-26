'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CalendarClock,
  CheckCheck,
  Loader2,
  Mail,
  MessageSquare,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { timeAgo } from '@/lib/utils';
import { AgentActionDialog, type ActionTarget } from '@/components/agent-action-dialog';
import { toast } from '@/components/ui/toast';

export type AttentionItem = {
  id: string;
  category: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  propertyAddress?: string;
  counterparty?: string;
  source: string;
  artifactId: string;
  createdAt: string;
  needsReply: boolean;
};

type HandledItem = {
  id: string;
  kind: 'agent-run' | 'sent-email' | 'resolution';
  agentName: string;
  title: string;
  detail: string;
  createdAt: string;
};

const URGENCY_STYLE: Record<AttentionItem['urgency'], { dot: string; chip: string }> = {
  critical: { dot: 'bg-red-400', chip: 'bg-red-500/15 text-red-300' },
  high: { dot: 'bg-amber-400', chip: 'bg-amber-500/15 text-amber-300' },
  medium: { dot: 'bg-blue-400', chip: 'bg-blue-500/15 text-blue-300' },
  low: { dot: 'bg-slate-400', chip: 'bg-slate-500/15 text-slate-300' },
};

const CATEGORY_ICON: Record<string, typeof Wrench> = {
  maintenance: Wrench,
  complaint: Wrench,
  'lease_question': MessageSquare,
  'expiring-lease': CalendarClock,
  expansion: Building2,
  lead: Mail,
};

/**
 * The operator's day, in two halves:
 *  - "Your agents handled"  → autonomous work they completed on their own
 *  - "Needs you"            → open items, each one actionable (reply / direct / close)
 * Actions hit real agents, so closing an item actually runs work.
 */
export function AttentionQueue({ limit = 5 }: { limit?: number }) {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [handled, setHandled] = useState<HandledItem[]>([]);
  const [counts, setCounts] = useState({ critical: 0, needsReply: 0, total: 0, handled: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [directive, setDirective] = useState<Record<string, string>>({});
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openAction = (item: AttentionItem, mode: 'reply' | 'direct') => {
    setActionTarget({
      id: item.id,
      artifactId: item.artifactId,
      title: item.title,
      mode,
      note: mode === 'direct' ? (directive[item.id] ?? '').trim() || undefined : undefined,
    });
    setDialogOpen(true);
  };

  const pull = useCallback(async () => {
    try {
      const res = await fetch('/api/attention');
      if (!res.ok) return;
      const body = await res.json();
      setItems(body.items ?? []);
      setHandled(body.handled ?? []);
      setCounts(body.counts ?? { critical: 0, needsReply: 0, total: 0, handled: 0 });
    } catch {
      // keep last state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer the first pull so it doesn't set state synchronously in the effect
    // body (the interval below handles all subsequent refreshes).
    const first = setTimeout(() => void pull(), 0);
    const t = setInterval(pull, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [pull]);

  const act = async (item: AttentionItem, action: 'resolve') => {
    setBusy(`${item.id}:${action}`);
    try {
      const res = await fetch('/api/attention/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, artifactId: item.artifactId, action }),
      });
      if (res.ok) {
        toast('Item closed');
        await pull();
      }
    } catch {
      // retry on next poll
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {/* Needs you */}
      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-100">Needs you</h3>
              <p className="text-sm text-zinc-400">{counts.total} open items</p>
            </div>
            <div className="flex items-center gap-2">
              {counts.critical > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300">
                  <AlertTriangle className="h-3 w-3" />
                  {counts.critical}
                </span>
              )}
              <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-300">
                {counts.needsReply} reply
              </span>
            </div>
          </div>

          {loading ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">Scanning portfolio…</p>
          ) : items.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              Nothing needs you — your agents have it covered.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {items.slice(0, limit).map((item) => {
                const style = URGENCY_STYLE[item.urgency];
                const Icon = CATEGORY_ICON[item.category] ?? AlertTriangle;
                const busyKey = busy?.startsWith(item.id) ? busy.split(':')[1] : null;
                return (
                  <li key={item.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-1.5">
                        <span className={`block h-2 w-2 rounded-full ${style.dot}`} />
                      </span>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-zinc-100">{item.title}</p>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${style.chip}`}>
                            {item.urgency}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-400">{item.detail}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                          <span>{item.source}</span>
                          {item.propertyAddress && (
                            <>
                              <span>&middot;</span>
                              <span className="truncate">{item.propertyAddress}</span>
                            </>
                          )}
                          <span>&middot;</span>
                          <span>{timeAgo(item.createdAt)}</span>
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {item.needsReply && (
                            <Button
                              size="sm"
                              className="bg-blue-600 text-white hover:bg-blue-700"
                              disabled={busyKey !== null}
                              onClick={() => openAction(item, 'reply')}
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Reply via agent
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-700 bg-slate-800/50 text-zinc-200 hover:bg-slate-800"
                            disabled={busyKey !== null || !(directive[item.id] ?? '').trim()}
                            onClick={() => openAction(item, 'direct')}
                          >
                            <Bot className="h-3.5 w-3.5" />
                            Send instruction
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-zinc-400 hover:text-emerald-400"
                            disabled={busyKey !== null}
                            onClick={() => void act(item, 'resolve')}
                          >
                            {busyKey === 'resolve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                            Close
                          </Button>
                        </div>

                        <input
                          value={directive[item.id] ?? ''}
                          onChange={(e) =>
                            setDirective((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder={`Tell an agent what to do, e.g. "Dispatch a tech for 24h and confirm with the tenant"`}
                          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-zinc-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                        />

                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {items.length > limit && (
            <div className="border-t border-slate-800 px-5 py-3">
              <Link href="/inbox" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300">
                Open inbox for all {items.length}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Handled by your agents */}
      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-5 py-4">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                Your agents handled
              </h3>
              <p className="text-sm text-zinc-400">Completed autonomously, no action needed</p>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
              {counts.handled} done
            </span>
          </div>

          {handled.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              No completed work yet — run an agent or workflow.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {handled.slice(0, limit).map((h) => (
                <li key={h.id} className="flex items-start gap-3 px-5 py-3.5">
                  <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200">{h.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">{h.detail}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {h.agentName} · {timeAgo(h.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-800 px-5 py-3">
            <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300">
              See all agent runs
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardContent>
      </Card>

      <AgentActionDialog
        key={actionTarget ? `${actionTarget.id}:${actionTarget.mode}` : 'none'}
        target={actionTarget}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCommitted={() => void pull()}
      />
    </div>
  );
}
