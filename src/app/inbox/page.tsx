'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCheck,
  Loader2,
  Mail,
  MailOpen,
  MessageSquare,
  RefreshCw,
  Search,
  Wrench,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { AgentActionDialog, type ActionTarget } from '@/components/agent-action-dialog';
import { toast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, timeAgo } from '@/lib/utils';

type AttentionItem = {
  id: string;
  category: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  body?: string;
  senderEmail?: string;
  subject?: string;
  propertyAddress?: string;
  counterparty?: string;
  source: string;
  artifactId: string;
  createdAt: string;
  needsReply: boolean;
};

type SentEmail = {
  id: string;
  to: string;
  subject: string;
  body: string;
  followUpInDays?: number;
  producedBy: string;
  createdAt: string;
};

const URGENCY_STYLE: Record<AttentionItem['urgency'], string> = {
  critical: 'bg-red-500/15 text-red-300',
  high: 'bg-amber-500/15 text-amber-300',
  medium: 'bg-blue-500/15 text-blue-300',
  low: 'bg-slate-500/15 text-slate-300',
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
 * The operator's inbox: inbound messages and leads waiting on a human, plus
 * the outbound emails the agents already sent on your behalf. Both sides are
 * real artifacts produced by the running agents.
 */
export default function InboxPage() {
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [sent, setSent] = useState<SentEmail[]>([]);
  const [counts, setCounts] = useState({ critical: 0, needsReply: 0, total: 0, sent: 0 });
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AttentionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const pull = useCallback(async () => {
    try {
      const res = await fetch('/api/attention');
      if (!res.ok) return;
      const body = await res.json();
      setAttention(body.items ?? []);
      setSent(body.sent ?? []);
      setCounts(body.counts ?? { critical: 0, needsReply: 0, total: 0, sent: 0 });
    } catch {
      // keep last state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void pull(), 0);
    const t = setInterval(pull, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [pull]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = tab === 'inbox' ? attention : [];
    if (!q) return base;
    return base.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.detail.toLowerCase().includes(q) ||
        (i.propertyAddress ?? '').toLowerCase().includes(q) ||
        (i.counterparty ?? '').toLowerCase().includes(q)
    );
  }, [attention, tab, query]);

  const filteredSent = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sent;
    return sent.filter(
      (s) => s.subject.toLowerCase().includes(q) || s.to.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)
    );
  }, [sent, query]);

  /** The agent's outbound reply to this message, matched by sender address. */
  const replyFor = (item: AttentionItem): SentEmail | undefined => {
    if (!item.senderEmail) return undefined;
    const needle = item.senderEmail.toLowerCase();
    return sent.find((s) => s.to.toLowerCase().includes(needle));
  };

  const closeItem = async (item: AttentionItem) => {
    setClosing(true);
    try {
      const res = await fetch('/api/attention/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, artifactId: item.artifactId, action: 'resolve' }),
      });
      if (res.ok) {
        toast('Item closed');
        setSelected(null);
        await pull();
      }
    } catch {
      // next poll will reconcile
    } finally {
      setClosing(false);
    }
  };

  return (
    <AppLayout title="Inbox">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Inbox</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Everything your agents received and sent across the portfolio.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {counts.critical > 0 && (
              <Badge className="border-transparent bg-red-500/15 text-red-300">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {counts.critical} critical
              </Badge>
            )}
            <Badge className="border-transparent bg-indigo-500/15 text-indigo-300">
              {counts.needsReply} need a reply
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
            <button
              onClick={() => setTab('inbox')}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === 'inbox' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              <MailOpen className="h-4 w-4" />
              Inbox
              <span className="rounded bg-black/20 px-1.5 text-xs">{attention.length}</span>
            </button>
            <button
              onClick={() => setTab('sent')}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === 'sent' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              <CheckCheck className="h-4 w-4" />
              Sent by agents
              <span className="rounded bg-black/20 px-1.5 text-xs">{sent.length}</span>
            </button>
          </div>

          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by subject, address, contact…"
              className="border-slate-700 bg-slate-900 pl-9 text-slate-200 placeholder:text-slate-600"
            />
          </div>
        </div>

        {tab === 'inbox' ? (
          <Card className="border-slate-700 bg-slate-900">
            <CardContent className="p-0">
              {loading ? (
                <p className="px-5 py-12 text-center text-sm text-zinc-500">Loading mail…</p>
              ) : filtered.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-zinc-500">
                  Nothing needs you. Nice.
                </p>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {filtered.map((item) => {
                    const Icon = CATEGORY_ICON[item.category] ?? Mail;
                    const replied = Boolean(replyFor(item));
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => {
                            setSelected(item);
                            setDetailOpen(true);
                          }}
                          className="group flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-800/50"
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium text-zinc-100">{item.title}</p>
                              <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', URGENCY_STYLE[item.urgency])}>
                                {item.urgency}
                              </span>
                              {replied && (
                                <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                                  replied
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{item.detail}</p>
                            <p className="mt-1 text-[11px] text-zinc-500">
                              {item.source} &middot; {timeAgo(item.createdAt)}
                            </p>
                          </div>
                          <span className="mt-1 shrink-0 text-[11px] font-medium text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
                            Open →
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredSent.length === 0 ? (
              <Card className="border-slate-700 bg-slate-900 xl:col-span-2">
                <CardContent className="py-14 text-center">
                  <p className="text-sm text-zinc-400">
                    No outbound mail yet — run the Email Outreach agent or a tenant-retention workflow.
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredSent.map((s) => (
                <Card key={s.id} className="border-slate-700 bg-slate-900">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-100">{s.subject}</p>
                        <p className="mt-0.5 truncate text-xs text-zinc-400">To: {s.to}</p>
                      </div>
                      <Badge className="shrink-0 border-transparent bg-emerald-500/15 text-emerald-300">
                        <ArrowUpRight className="mr-1 h-3 w-3" />
                        {s.producedBy}
                      </Badge>
                    </div>
                    <p className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm leading-relaxed text-zinc-300">
                      {s.body}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {timeAgo(s.createdAt)}
                      {s.followUpInDays ? ` · follow-up in ${s.followUpInDays}d` : ''}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Message detail — a dialog so it is reachable at every screen size */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-slate-700 bg-slate-950">
            {selected && (
              <>
                <DialogHeader>
                  <DialogTitle className="pr-6 text-white">{selected.title}</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    {selected.counterparty ?? 'Unknown sender'}
                    {selected.senderEmail ? ` · ${selected.senderEmail}` : ''}
                    {selected.propertyAddress ? ` · ${selected.propertyAddress}` : ''}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', URGENCY_STYLE[selected.urgency])}>
                      {selected.urgency}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {selected.source} · {timeAgo(selected.createdAt)}
                    </span>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Message
                    </p>
                    <p className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm leading-relaxed text-zinc-300">
                      {selected.body ?? selected.detail}
                    </p>
                  </div>

                  {replyFor(selected) ? (
                    <div>
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-400/80">
                          Reply sent
                        </p>
                        <span className="text-[11px] text-slate-500">
                          {replyFor(selected)?.producedBy} · {timeAgo(replyFor(selected)!.createdAt)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-4 text-sm leading-relaxed text-slate-200">
                        {replyFor(selected)?.body}
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-500">
                      No reply sent yet.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
                  <Button
                    className="bg-blue-600 text-white hover:bg-blue-700"
                    disabled={closing}
                    onClick={() => {
                      setActionTarget({
                        id: selected.id,
                        artifactId: selected.artifactId,
                        title: selected.title,
                        mode: selected.needsReply ? 'reply' : 'direct',
                      });
                      setDetailOpen(false);
                      setDialogOpen(true);
                    }}
                  >
                    <Mail className="h-4 w-4" />
                    {replyFor(selected) ? 'Reply again with agent' : 'Draft reply with agent'}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-slate-700 bg-slate-800/50 text-zinc-300 hover:bg-slate-800"
                    disabled={closing}
                    onClick={() => void closeItem(selected)}
                  >
                    {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                    Close item
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <p className="flex items-center gap-2 text-xs text-zinc-600">
          <RefreshCw className="h-3 w-3" />
          Auto-refreshing every 15s as your agents work.
        </p>
      </div>

      <AgentActionDialog
        key={actionTarget ? `${actionTarget.id}:${actionTarget.mode}` : 'none'}
        target={actionTarget}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCommitted={() => {
          void pull();
        }}
      />
    </AppLayout>
  );
}
