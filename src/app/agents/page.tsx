'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Bot,
  Clock,
  Gauge,
  Leaf,
  Loader2,
  Mail,
  MessageSquare,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  Wrench,
  FileText,
  FileSearch,
  Calculator,
  Target,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { timeAgo } from '@/lib/utils';
import { useTeamFeed } from '@/hooks/use-team-feed';

type TeamMember = {
  id: string;
  name: string;
  category: string;
  description: string;
  status: 'working' | 'active' | 'standing';
  currentTask: string | null;
  lastOutput: string | null;
  lastRunAt: string | null;
  lastConfidence: number | null;
  runCount: number;
  successRate: number;
  avgDuration: number;
  consultsFrom: number;
  consultsTo: number;
};

type Consult = {
  id?: string;
  fromAgentName: string;
  toAgentName: string;
  reason: string;
  replySummary: string;
  at: string;
};

/** Group agents the way an org is organised, by the job they do. */
const SQUADS: { title: string; blurb: string; categories: string[]; icon: LucideIcon; accent: string }[] = [
  {
    title: 'Lease Operations',
    blurb: 'Reads every lease and flags what matters',
    categories: ['lease', 'document'],
    icon: FileText,
    accent: 'text-blue-400',
  },
  {
    title: 'Tenant & Risk',
    blurb: 'Screens tenants and sizes exposure',
    categories: ['tenant', 'insurance'],
    icon: ShieldCheck,
    accent: 'text-cyan-400',
  },
  {
    title: 'Building Operations',
    blurb: 'Predicts failures before they happen',
    categories: ['maintenance', 'esg'],
    icon: Wrench,
    accent: 'text-orange-400',
  },
  {
    title: 'Asset Performance',
    blurb: 'Values assets and recommends moves',
    categories: ['valuation', 'market', 'portfolio', 'tax'],
    icon: TrendingUp,
    accent: 'text-emerald-400',
  },
  {
    title: 'Leasing & Growth',
    blurb: 'Works leads and landlord relationships',
    categories: ['lead', 'email'],
    icon: UserCheck,
    accent: 'text-rose-400',
  },
  {
    title: 'Data Fabric',
    blurb: "Keeps the portfolio's facts fresh",
    categories: ['data'],
    icon: Database,
    accent: 'text-fuchsia-400',
  },
];

const ICONS: Record<string, LucideIcon> = {
  lease: FileText,
  document: FileSearch,
  tenant: UserCheck,
  insurance: ShieldCheck,
  maintenance: Wrench,
  esg: Leaf,
  valuation: Calculator,
  market: TrendingUp,
  portfolio: Target,
  tax: ReceiptText,
  lead: MessageSquare,
  email: Mail,
  data: Database,
};

const STATUS_META = {
  working: { label: 'Working now', dot: 'bg-emerald-400', ring: 'ring-emerald-500/30', chip: 'bg-emerald-500/15 text-emerald-300' },
  active: { label: 'On duty', dot: 'bg-blue-400', ring: 'ring-blue-500/30', chip: 'bg-blue-500/15 text-blue-300' },
  standing: { label: 'Standing by', dot: 'bg-slate-500', ring: 'ring-slate-700', chip: 'bg-slate-500/15 text-slate-400' },
} as const;

export default function AgentsPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [consults, setConsults] = useState<Consult[]>([]);
  const [loading, setLoading] = useState(true);
  const { live } = useTeamFeed();

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch('/api/team');
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) {
          setTeam(body.team ?? []);
          setConsults(body.consults ?? []);
        }
      } catch {
        // keep last
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const first = setTimeout(() => void pull(), 0);
    const t = setInterval(pull, 10_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const workingCount = team.filter((t) => t.status === 'working' || live[t.id]).length;

  return (
    <AppLayout title="Agent Team">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Your agent team</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {loading ? 'Connecting to the runtime…' : `${team.length} agents on the roster · ${workingCount} working right now`}
            </p>
          </div>
          <Badge className="border-transparent bg-emerald-500/15 text-emerald-300">
            <Activity className="mr-1 h-3 w-3" />
            Autonomous · 24/7
          </Badge>
        </div>

        {/* Consultations — the agents talking to each other */}
        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  Agent hand-offs
                </h3>
                <p className="text-sm text-zinc-400">
                  When an agent hits something outside its lane, it brings in a specialist
                </p>
              </div>
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                {consults.length} this session
              </span>
            </div>

            {consults.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-500">
                No hand-offs yet. They happen when an agent flags a clause or loses confidence.
              </p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {consults.slice(0, 5).map((c, i) => (
                  <li key={`${c.at}-${i}`} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                      {c.fromAgentName}
                      <ArrowRight className="h-3 w-3 text-amber-400" />
                      {c.toAgentName}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-xs text-zinc-300">{c.reason}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">↳ {c.replySummary}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-zinc-600">{timeAgo(c.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Squads */}
        {SQUADS.map((squad) => {
          const members = team.filter((t) => squad.categories.includes(t.category));
          if (members.length === 0) return null;
          const SquadIcon = squad.icon;
          return (
            <div key={squad.title}>
              <div className="mb-3 flex items-center gap-2">
                <SquadIcon className={`h-4 w-4 ${squad.accent}`} />
                <h3 className="text-sm font-semibold text-zinc-100">{squad.title}</h3>
                <span className="text-xs text-zinc-500">{squad.blurb}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {members.map((agent) => {
                  // Live SSE phase overrides the 10s polled status.
                  const streaming = live[agent.id];
                  const isWorking = Boolean(streaming) || agent.status === 'working';
                  const meta = STATUS_META[isWorking ? 'working' : agent.status === 'active' ? 'active' : 'standing'];
                  const Icon = ICONS[agent.category] ?? Bot;
                  return (
                    <Card
                      key={agent.id}
                      className="border-slate-700 bg-slate-900 transition-colors hover:border-slate-600"
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800`}>
                            <Icon className={`h-5 w-5 ${squad.accent}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="relative flex h-2 w-2 shrink-0">
                                {isWorking && (
                                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${meta.dot}`} />
                                )}
                                <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
                              </span>
                              <p className="truncate text-sm font-semibold text-zinc-100">{agent.name}</p>
                            </div>
                            <p className="mt-0.5 text-[11px] text-zinc-500">
                              {streaming ? streaming.label ?? 'working…' : agent.lastRunAt ? timeAgo(agent.lastRunAt) : 'no runs yet'}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
                            {meta.label}
                          </span>
                        </div>

                        {/* What it's doing right now / what it last did */}
                        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            {isWorking ? 'Working now' : 'Last result'}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-300">
                            {streaming ? streaming.line ?? streaming.label ?? 'working…' : agent.currentTask ?? agent.lastOutput ?? 'Waiting for work…'}
                          </p>
                          {agent.lastConfidence !== null && !isWorking && (
                            <p className="mt-1 text-[11px] text-zinc-500">
                              {Math.round(agent.lastConfidence * 100)}% confidence
                            </p>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                          <span className="inline-flex items-center gap-1">
                            <Gauge className="h-3 w-3" />
                            {agent.runCount} runs
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {agent.avgDuration > 0 ? `${agent.avgDuration}s` : '—'}
                          </span>
                          {(agent.consultsFrom > 0 || agent.consultsTo > 0) && (
                            <span className="inline-flex items-center gap-1 text-amber-400/80">
                              <ArrowRight className="h-3 w-3" />
                              {agent.consultsFrom} asked · {agent.consultsTo} advised
                            </span>
                          )}
                        </div>

                        <Link
                          href={`/agents/${agent.id}`}
                          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
                        >
                          Open workspace
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}

        <p className="flex items-center gap-2 text-xs text-zinc-600">
          <Loader2 className={loading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
          Live duty status updates every 10 seconds. Agents run on their own — the Run button is only for
          one-off tasks.
        </p>
      </div>
    </AppLayout>
  );
}
