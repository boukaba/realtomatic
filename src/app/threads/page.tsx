'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  CornerDownRight,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  User,
  XCircle,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { cn, timeAgo } from '@/lib/utils';

type ThreadStatus = 'open' | 'awaiting_human' | 'resolved';

type ThreadSummary = {
  id: string;
  title: string;
  topic?: string;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  awaitingSince?: string;
  messageCount: number;
  participants: string[];
  lastMessage?: string;
};

type ThreadMessage = {
  id: string;
  role: 'agent' | 'human' | 'system';
  authorName: string;
  kind: 'handoff' | 'reply' | 'result' | 'request' | 'decision' | 'note';
  text: string;
  meta?: Record<string, unknown>;
  at: string;
};

const STATUS_META: Record<ThreadStatus, { label: string; chip: string }> = {
  awaiting_human: { label: 'Waiting on you', chip: 'bg-amber-500/15 text-amber-300' },
  open: { label: 'In progress', chip: 'bg-blue-500/15 text-blue-300' },
  resolved: { label: 'Resolved', chip: 'bg-emerald-500/15 text-emerald-300' },
};

const KIND_LABEL: Record<ThreadMessage['kind'], string> = {
  handoff: 'handed off',
  reply: 'replied',
  result: 'result',
  request: 'needs a human',
  decision: 'decision',
  note: 'note',
};

function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Threads — a Slack-like view of how work actually got decided. Every agent
 * hand-off, result and human decision is recorded against the work item, so a
 * visitor can read the reasoning trail and step in where a human is expected.
 */
export default function ThreadsPage() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [counts, setCounts] = useState({ open: 0, awaiting: 0, resolved: 0, total: 0 });
  const [filter, setFilter] = useState<'all' | ThreadStatus>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // On narrow screens the list and the conversation swap places; on xl both
  // are visible side by side.
  const [view, setView] = useState<'list' | 'thread'>('list');
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const pullList = useCallback(async () => {
    try {
      const res = await fetch('/api/threads');
      if (!res.ok) return;
      const body = await res.json();
      setThreads(body.threads ?? []);
      setCounts(body.counts ?? { open: 0, awaiting: 0, resolved: 0, total: 0 });
      setSelectedId((prev) => prev ?? body.threads?.[0]?.id ?? null);
    } catch {
      // keep last
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void pullList(), 0);
    const t = setInterval(pullList, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [pullList]);

  const pullThread = useCallback(async (id: string) => {
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/threads/${id}`);
      if (!res.ok) return;
      const body = await res.json();
      setMessages(body.messages ?? []);
    } catch {
      // keep last
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const first = setTimeout(() => void pullThread(selectedId), 0);
    const t = setInterval(() => void pullThread(selectedId), 8_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [selectedId, pullThread]);

  const visible = useMemo(
    () => (filter === 'all' ? threads : threads.filter((t) => t.status === filter)),
    [threads, filter]
  );
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  const send = async (decision?: 'approved' | 'rejected' | 'changes_requested') => {
    if (!selectedId) return;
    const text = draft.trim();
    if (!text && !decision) return;
    setSending(true);
    try {
      const res = await fetch(`/api/threads/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text || undefined, decision }),
      });
      if (res.ok) {
        setDraft('');
        toast(decision ? 'Decision sent — workflow resumed' : 'Message sent to the thread');
        await Promise.all([pullThread(selectedId), pullList()]);
      } else {
        toast('Could not send — please retry', 'error');
      }
    } catch {
      toast('Could not send — please retry', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <AppLayout title="Threads">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Threads</h2>
            <p className="mt-1 text-sm text-zinc-400">
              How each job was decided — every agent hand-off, result, and human call, in one place.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {counts.awaiting > 0 && (
              <Badge className="border-transparent bg-amber-500/15 text-amber-300">
                <Clock className="mr-1 h-3 w-3" />
                {counts.awaiting} waiting on you
              </Badge>
            )}
            <Badge className="border-transparent bg-slate-700 text-slate-300">
              {counts.total} threads
            </Badge>
          </div>
        </div>

        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
          {([
            ['all', `All (${counts.total})`],
            ['awaiting_human', `Waiting on you (${counts.awaiting})`],
            ['open', `In progress (${counts.open})`],
            ['resolved', `Resolved (${counts.resolved})`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                filter === value ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {/* Thread list */}
          <Card
            className={cn(
              'border-slate-700 bg-slate-900 xl:col-span-1',
              view === 'thread' && 'hidden xl:block'
            )}
          >
            <CardContent className="p-0">
              {loadingList ? (
                <p className="px-5 py-12 text-center text-sm text-zinc-500">Loading threads…</p>
              ) : visible.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <MessageSquare className="mx-auto h-8 w-8 text-slate-600" />
                  <p className="mt-3 text-sm text-zinc-400">
                    {filter === 'awaiting_human'
                      ? 'Nothing is waiting on you.'
                      : 'No threads yet.'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Threads appear as agents hand work to each other.
                  </p>
                </div>
              ) : (
                <ul className="max-h-[620px] divide-y divide-slate-800 overflow-y-auto">
                  {visible.map((t) => {
                    const meta = STATUS_META[t.status];
                    const active = t.id === selectedId;
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => {
                            setSelectedId(t.id);
                            setView('thread');
                          }}
                          className={cn(
                            'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors',
                            active ? 'bg-blue-600/10' : 'hover:bg-slate-800/50'
                          )}
                        >
                          <div className="flex shrink-0 -space-x-2 pt-0.5">
                            {t.participants.slice(0, 2).map((p) => (
                              <span
                                key={p}
                                className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-900 bg-slate-700 text-[9px] font-bold text-slate-200"
                              >
                                {initials(p)}
                              </span>
                            ))}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate text-sm font-medium text-zinc-100">{t.title}</p>
                              <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold', meta.chip)}>
                                {meta.label}
                              </span>
                            </div>
                            {t.lastMessage && (
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{t.lastMessage}</p>
                            )}
                            <p className="mt-1 text-[10px] text-zinc-600">
                              {t.messageCount} message{t.messageCount === 1 ? '' : 's'} · {timeAgo(t.updatedAt)}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Conversation */}
          <Card
            className={cn(
              'flex min-h-[520px] flex-col border-slate-700 bg-slate-900 xl:col-span-2',
              view === 'list' && 'hidden xl:flex'
            )}
          >
            {!selected ? (
              <CardContent className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="mx-auto h-10 w-10 text-slate-600" />
                  <p className="mt-3 text-sm text-zinc-400">Select a thread to read the decision trail.</p>
                </div>
              </CardContent>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 px-5 py-4">
                  <button
                    onClick={() => setView('list')}
                    className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 xl:hidden"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    All threads
                  </button>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-zinc-100">{selected.title}</h3>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {selected.participants.join(' · ')} · started {timeAgo(selected.createdAt)}
                    </p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', STATUS_META[selected.status].chip)}>
                    {STATUS_META[selected.status].label}
                  </span>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                  {loadingThread && messages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-zinc-500">Loading conversation…</p>
                  ) : (
                    messages.map((m) => {
                      if (m.role === 'system') {
                        return (
                          <div key={m.id} className="flex justify-center">
                            <div className="flex max-w-xl items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2.5">
                              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">
                                  {KIND_LABEL[m.kind]}
                                </p>
                                <p className="mt-0.5 text-xs leading-relaxed text-amber-100/90">{m.text}</p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      const isHuman = m.role === 'human';
                      return (
                        <div key={m.id} className={cn('flex gap-3', isHuman && 'justify-end')}>
                          {!isHuman && (
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-[10px] font-bold text-slate-300">
                              {initials(m.authorName)}
                            </span>
                          )}
                          <div className={cn('max-w-[80%]', isHuman && 'order-first')}>
                            <div className="mb-1 flex items-center gap-2">
                              <span className={cn('text-[11px] font-semibold', isHuman ? 'text-indigo-300' : 'text-zinc-300')}>
                                {m.authorName}
                              </span>
                              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                                {KIND_LABEL[m.kind]}
                              </span>
                              <span className="text-[10px] text-slate-600">{timeAgo(m.at)}</span>
                            </div>
                            <div
                              className={cn(
                                'whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm leading-relaxed',
                                isHuman
                                  ? 'bg-indigo-600 text-white'
                                  : m.kind === 'reply'
                                    ? 'border border-slate-700/60 bg-slate-800/40 text-zinc-200'
                                    : 'border border-slate-800 bg-slate-950/50 text-zinc-300'
                              )}
                            >
                              {m.text}
                            </div>
                          </div>
                          {isHuman && (
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-300">
                              <User className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Composer */}
                <div className="border-t border-slate-800 px-5 py-4">
                  {selected.status === 'awaiting_human' && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2.5">
                      <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span className="text-xs text-amber-200/90">
                        The workflow is paused — your decision resumes it.
                      </span>
                      <div className="ml-auto flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          disabled={sending}
                          onClick={() => void send('approved')}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-700 bg-slate-800/50 text-zinc-200 hover:bg-slate-800"
                          disabled={sending}
                          onClick={() => void send('changes_requested')}
                        >
                          Request changes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          disabled={sending}
                          onClick={() => void send('rejected')}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      placeholder="Give your orientation — an opinion, a constraint, or what the agent should do next…"
                      className="min-h-[44px] flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <Button
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                      disabled={sending || !draft.trim()}
                      onClick={() => void send()}
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </Button>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-600">
                    <ArrowRight className="h-3 w-3" />
                    Your message is recorded on the thread for the audit trail.
                  </p>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
