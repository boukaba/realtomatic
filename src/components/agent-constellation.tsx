'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, MonitorPlay, Zap } from 'lucide-react';
import { useTeamFeed } from '@/hooks/use-team-feed';

type TeamMember = {
  id: string;
  name: string;
  category: string;
  status: 'working' | 'active' | 'standing';
  runCount: number;
  consultsFrom: number;
  consultsTo: number;
};

type Consult = {
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  toAgentName: string;
  reason: string;
  replySummary: string;
  at: string;
};

const SQUAD_COLOR: Record<string, string> = {
  lease: '#60a5fa',
  document: '#60a5fa',
  tenant: '#22d3ee',
  insurance: '#38bdf8',
  maintenance: '#fb923c',
  esg: '#4ade80',
  valuation: '#34d399',
  market: '#a78bfa',
  portfolio: '#fbbf24',
  tax: '#f87171',
  lead: '#fb7185',
  email: '#818cf8',
  data: '#e879f9',
};

function initials(name: string): string {
  const words = name.replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Live agent constellation — the dashboard's opening visual.
 *
 * Every agent is a node; nodes glow while the agent is working and flash when
 * it finishes. Lines appear between agents that have actually consulted each
 * other, with packets flowing along them. All of it is driven by the real
 * runtime (duty status from /api/team, phases from the team SSE feed), so what
 * a visitor sees is the system working, not decoration.
 */
export function AgentConstellation({ variant = 'card' }: { variant?: 'card' | 'wall' } = {}) {
  const wall = variant === 'wall';
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [consults, setConsults] = useState<Consult[]>([]);
  const [counts, setCounts] = useState({ working: 0, active: 0, consults: 0 });
  const { live, recentDone } = useTeamFeed();
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const lastDoneRef = useRef<string | null>(null);
  // Clock captured at poll time so render stays pure.
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch('/api/team');
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        setTeam(body.team ?? []);
        setConsults(body.consults ?? []);
        setCounts(body.counts ?? { working: 0, active: 0, consults: 0 });
        setNow(Date.now());
      } catch {
        // keep last
      }
    };
    const first = setTimeout(() => void pull(), 0);
    const t = setInterval(pull, 8_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  // Flash a node for a few seconds when its agent completes a task.
  useEffect(() => {
    const latest = recentDone[0];
    if (!latest || latest.executionId === lastDoneRef.current) return;
    lastDoneRef.current = latest.executionId;
    const id = latest.agentId;
    setFlashing((prev) => new Set(prev).add(id));
    const t = setTimeout(() => {
      setFlashing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 3000);
    return () => clearTimeout(t);
  }, [recentDone]);

  const CX = 500;
  const CY = 268;
  const R = 186;

  const nodes = useMemo(
    () =>
      team.map((agent, i) => {
        const angle = (i / Math.max(1, team.length)) * Math.PI * 2 - Math.PI / 2;
        return {
          ...agent,
          x: CX + Math.cos(angle) * R,
          y: CY + Math.sin(angle) * R,
          color: SQUAD_COLOR[agent.category] ?? '#94a3b8',
        };
      }),
    [team]
  );

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Distinct consulting pairs, most recent first — these become the links.
  const links = useMemo(() => {
    const seen = new Set<string>();
    const out: { from: string; to: string; fresh: boolean }[] = [];
    for (const c of [...consults].reverse()) {
      const key = `${c.fromAgentId}->${c.toAgentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const parsed = Date.parse(c.at);
      out.push({
        from: c.fromAgentId,
        to: c.toAgentId,
        fresh: Number.isFinite(parsed) ? (now === 0 || now - parsed < 120_000) : true,
      });
      if (out.length >= (wall ? 18 : 10)) break;
    }
    return out;
  }, [consults, now, wall]);

  const workingNow = nodes.filter((n) => live[n.id] || n.status === 'working').length;
  const recentDoneEvent = recentDone[0];

  return (
    <div
      className={
        wall
          ? 'relative flex h-full flex-col overflow-hidden bg-transparent'
          : 'relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950'
      }
    >
      {/* ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(99,102,241,0.16), transparent 70%)',
        }}
      />

      <div className={wall ? 'relative hidden' : 'relative flex flex-wrap items-center justify-between gap-3 px-5 pt-5'}>
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
            <Activity className="h-4 w-4 text-emerald-400" />
            Your team, live
          </h3>
          <p className="mt-0.5 text-sm text-zinc-400">
            {workingNow > 0
              ? `${workingNow} agent${workingNow === 1 ? '' : 's'} working right now — they hand work to each other automatically`
              : 'Agents are on standby — start a workflow or wait for the next cycle'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            {workingNow} working
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-300">
            {nodes.length} agents
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
            <Zap className="h-3 w-3" />
            {counts.consults} hand-offs
          </span>
          <Link
            href="/wall"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <MonitorPlay className="h-3 w-3" />
            Wall display
          </Link>
        </div>
      </div>

      <svg
        viewBox="0 0 1000 520"
        className={wall ? 'relative min-h-0 w-full flex-1' : 'relative w-full'}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Live agent activity"
      >
        <defs>
          <filter id="nodeGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="hubGlow">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.55" />
            <stop offset="70%" stopColor="#6366f1" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="flowLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#a5b4fc" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* center hub */}
        <circle cx={CX} cy={CY} r={120} fill="url(#hubGlow)" />
        <circle cx={CX} cy={CY} r={62} fill="none" stroke="#334155" strokeWidth="1" />
        <circle
          cx={CX}
          cy={CY}
          r={62}
          fill="none"
          stroke="#6366f1"
          strokeWidth="1.5"
          strokeDasharray="6 10"
          className="origin-center"
          style={{ animation: 'spin 24s linear infinite' }}
        />
        <text x={CX} y={CY - 6} textAnchor="middle" className="fill-zinc-100" fontSize={wall ? 34 : 26} fontWeight="700">
          {counts.working}
        </text>
        <text x={CX} y={CY + 16} textAnchor="middle" className="fill-zinc-500" fontSize={wall ? 14 : 12}>
          working now
        </text>
        {recentDoneEvent && (
          <text x={CX} y={CY + 40} textAnchor="middle" className="fill-emerald-400" fontSize="11">
            {recentDoneEvent.agentName.split(' ')[0]} just finished
          </text>
        )}

        {/* consulting links with flowing packets */}
        {links.map((l) => {
          const a = byId.get(l.from);
          const b = byId.get(l.to);
          if (!a || !b) return null;
          const active = Boolean(live[a.id]) || Boolean(live[b.id]) || l.fresh;
          return (
            <g key={`${l.from}-${l.to}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#4338ca"
                strokeWidth={active ? 1.6 : 1}
                strokeOpacity={active ? 0.55 : 0.28}
              />
              {active && (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="url(#flowLine)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeDasharray="14 200"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="214"
                    to="0"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </line>
              )}
            </g>
          );
        })}

        {/* agents */}
        {nodes.map((n) => {
          const streaming = live[n.id];
          const isWorking = Boolean(streaming) || n.status === 'working';
          const isActive = isWorking || n.status === 'active';
          const flashed = flashing.has(n.id);
          return (
            <g key={n.id}>
              {isWorking && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={26}
                  fill="none"
                  stroke={n.color}
                  strokeWidth="1.5"
                  strokeOpacity="0.5"
                >
                  <animate attributeName="r" values="22;34;22" dur="2.2s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="2.2s" repeatCount="indefinite" />
                </circle>
              )}
              {flashed && (
                <circle cx={n.x} cy={n.y} r={30} fill="none" stroke="#34d399" strokeWidth="2">
                  <animate attributeName="r" values="24;42" dur="1.2s" fill="freeze" />
                  <animate attributeName="stroke-opacity" values="0.9;0" dur="1.2s" fill="freeze" />
                </circle>
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={22}
                fill="#0f172a"
                stroke={isActive ? n.color : '#334155'}
                strokeWidth={isWorking ? 2.4 : 1.6}
                filter={isWorking ? 'url(#nodeGlow)' : undefined}
                style={{ transition: 'stroke 0.4s' }}
              />
              <circle cx={n.x} cy={n.y} r={15} fill={n.color} fillOpacity={isActive ? 0.22 : 0.08} />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize={wall ? 14 : 12}
                fontWeight="700"
                fill={isActive ? n.color : '#64748b'}
              >
                {initials(n.name)}
              </text>
              <text x={n.x} y={n.y + 38} textAnchor="middle" fontSize={wall ? 12.5 : 10.5} fill={isWorking ? '#e2e8f0' : '#94a3b8'}>
                {n.name.length > 20 ? `${n.name.slice(0, 19)}…` : n.name}
              </text>
              {isWorking && (
                <text x={n.x} y={n.y - 30} textAnchor="middle" fontSize="9" fill="#34d399" fontWeight="600">
                  WORKING
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* live ticker */}
      <div className={wall ? 'hidden' : 'relative border-t border-slate-800 px-5 py-3'}>
        {recentDoneEvent ? (
          <p className="flex items-center gap-2 truncate font-mono text-[11px] text-slate-400">
            <span className="inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
            <span className="truncate">
              {recentDoneEvent.agentName} completed a task
              {recentDoneEvent.duration ? ` · ${recentDoneEvent.duration}s` : ''}
              {recentDoneEvent.summary ? ` · ${recentDoneEvent.summary.slice(0, 90)}` : ''}
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
            Watching for the next completion…
          </p>
        )}
      </div>
    </div>
  );
}
