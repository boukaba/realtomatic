'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  Building2,
  CheckCheck,
  Inbox,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AgentConstellation } from '@/components/agent-constellation';

/**
 * Wall display — a full-screen operations view meant to be left running on a
 * TV or projected during a demo. No chrome, no interaction required: the live
 * constellation plus a rolling feed of what the agents are actually doing.
 */

type ActivityEntry = {
  id: string;
  type: string;
  agentName?: string;
  title: string;
  detail: string;
  timestamp: string;
};

type Snapshot = {
  type: 'snapshot';
  activity: ActivityEntry[];
  executions: { id: string; status: string }[];
  approvals: number;
};

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  return now;
}

export default function WallPage() {
  const clock = useClock();
  const [feed, setFeed] = useState<ActivityEntry[]>([]);
  const [stats, setStats] = useState({ properties: 0, open: 0, handled: 0, handoffs: 0 });
  const seenRef = useRef<Set<string>>(new Set());

  // Live activity firehose for the rolling feed.
  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;

    const connect = () => {
      source = new EventSource('/api/activity');
      source.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data) as Snapshot | { type: 'event' };
          if (data.type !== 'snapshot') return;
          const incoming = (data as Snapshot).activity ?? [];
          const fresh = incoming.filter((a) => !seenRef.current.has(a.id));
          if (fresh.length === 0) return;
          for (const a of fresh) seenRef.current.add(a.id);
          setFeed((prev) => [...fresh, ...prev].slice(0, 40));
        } catch {
          // ignore malformed
        }
      };
      source.onerror = () => {
        source?.close();
        if (!cancelled) setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      cancelled = true;
      source?.close();
    };
  }, []);

  // Headline numbers, refreshed slowly (they move in minutes, not seconds).
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const [teamRes, attRes, propsRes] = await Promise.all([
          fetch('/api/team'),
          fetch('/api/attention'),
          fetch('/api/portfolio'),
        ]);
        const team = teamRes.ok ? await teamRes.json() : null;
        const att = attRes.ok ? await attRes.json() : null;
        const props = propsRes.ok ? await propsRes.json() : null;
        if (cancelled) return;
        setStats({
          properties: props?.properties?.length ?? 0,
          open: att?.counts?.total ?? 0,
          handled: att?.counts?.handled ?? 0,
          handoffs: team?.counts?.consults ?? 0,
        });
      } catch {
        // keep last
      }
    };
    const first = setTimeout(() => void pull(), 0);
    const t = setInterval(pull, 15_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-zinc-100">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-4 border-b border-slate-800 px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight text-white">Realtomatic</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              AI Operations · Live
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-6">
          <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Streaming
          </span>
          <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-200">
            {clock
              ? clock.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
              : '--:--:--'}
          </span>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Exit
          </Link>
        </div>
      </header>

      {/* Body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 p-6 xl:grid-cols-3">
        <div className="min-h-0 xl:col-span-2">
          <AgentConstellation variant="wall" />
        </div>

        {/* Rolling feed */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Activity className="h-4 w-4 text-emerald-400" />
              Live activity
            </h2>
            <span className="text-[11px] text-zinc-500">{feed.length} events</span>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-slate-800/70 overflow-y-auto">
            {feed.length === 0 ? (
              <li className="px-5 py-10 text-center text-sm text-zinc-500">
                Watching the runtime…
              </li>
            ) : (
              feed.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-200">{entry.title}</p>
                    <p className="line-clamp-2 text-xs text-zinc-500">{entry.detail}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      {entry.agentName ?? 'System'} ·{' '}
                      {clock
                        ? new Date(entry.timestamp).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })
                        : ''}
                    </p>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Stats strip */}
      <footer className="grid shrink-0 grid-cols-2 gap-4 border-t border-slate-800 px-8 py-4 md:grid-cols-4">
        {[
          { icon: Building2, label: 'Buildings managed', value: stats.properties, tone: 'text-blue-400' },
          { icon: Inbox, label: 'Open items', value: stats.open, tone: 'text-amber-400' },
          { icon: CheckCheck, label: 'Handled by agents', value: stats.handled, tone: 'text-emerald-400' },
          { icon: Zap, label: 'Agent hand-offs', value: stats.handoffs, tone: 'text-indigo-400' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <s.icon className={`h-5 w-5 ${s.tone}`} />
            <div>
              <p className="text-2xl font-bold tabular-nums leading-none text-white">{s.value}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">{s.label}</p>
            </div>
          </div>
        ))}
      </footer>
    </div>
  );
}
