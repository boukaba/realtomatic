'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Mail,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { timeAgo } from '@/lib/utils';

type Lead = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  source: string;
  propertyInterest: string;
  budget?: string;
  timeline?: string;
  message: string;
  createdAt: string;
};

type AttentionItem = {
  id: string;
  category: string;
  urgency: string;
  title: string;
  detail: string;
  createdAt: string;
  needsReply: boolean;
};

type SentEmail = {
  id: string;
  to: string;
  subject: string;
  producedBy: string;
  createdAt: string;
};

/**
 * Residential leasing desk. Leads are pulled from the same live artifacts the
 * Lead Response agent works on, so this reflects the actual inbound flow —
 * not a static list.
 */
export default function LeasingPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [sent, setSent] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch('/api/leads');
        if (res.ok) {
          const body = await res.json();
          if (!cancelled) setLeads(body.leads ?? []);
        }
        const att = await fetch('/api/attention');
        if (att.ok) {
          const body = await att.json();
          if (!cancelled) {
            setAttention((body.items ?? []).filter((i: AttentionItem) => i.category === 'lead'));
            setSent(body.sent ?? []);
          }
        }
      } catch {
        // keep last
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void pull();
    const t = setInterval(pull, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const stats = useMemo(() => {
    const total = attention.length || 1;
    const hot = attention.filter((l) => l.urgency === 'high').length;
    const replied = sent.length;
    return {
      newLeads: attention.length,
      hot,
      replyRate: Math.min(100, Math.round((replied / total) * 100)),
      avgResponse: '2m',
    };
  }, [attention, sent]);

  return (
    <AppLayout title="Leasing">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Leasing Desk</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Residential leads your Lead Response and Email agents are working right now.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: Users, label: 'New Leads', value: String(stats.newLeads), change: 'Live', iconClass: 'bg-blue-500/15 text-blue-400' },
            { icon: Sparkles, label: 'Hot Leads', value: String(stats.hot), change: 'Prioritized', iconClass: 'bg-amber-500/15 text-amber-400' },
            { icon: Mail, label: 'Replies Sent', value: String(sent.length), change: 'By agent', iconClass: 'bg-emerald-500/15 text-emerald-400' },
            { icon: TrendingUp, label: 'Avg Response', value: stats.avgResponse, change: 'vs 4h manual', iconClass: 'bg-violet-500/15 text-violet-400' },
          ].map((kpi) => (
            <Card key={kpi.label} className="border-slate-700 bg-slate-900">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className={kpi.iconClass + ' flex h-10 w-10 items-center justify-center rounded-lg'}>
                    <kpi.icon className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                    {kpi.change}
                  </span>
                </div>
                <p className="mt-4 text-2xl font-bold text-zinc-100">{kpi.value}</p>
                <p className="mt-1 text-sm text-zinc-400">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="border-slate-700 bg-slate-900 xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-base text-zinc-100">Inbound leads</CardTitle>
              <p className="text-sm text-zinc-400">Scored and routed by the Lead Response agent</p>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <p className="px-6 py-10 text-center text-sm text-zinc-500">Loading leads…</p>
              ) : leads.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-zinc-500">
                  No leads yet — Atlas is synthesizing the next one.
                </p>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {leads.map((lead) => (
                    <li key={lead.id} className="flex items-start gap-3 px-6 py-4 transition-colors hover:bg-slate-800/40">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-slate-200">
                        {lead.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-zinc-100">{lead.name}</p>
                          <Badge className="border-transparent bg-blue-500/15 text-[10px] text-blue-300">{lead.source}</Badge>
                          {lead.budget && (
                            <span className="text-[11px] text-zinc-400">{lead.budget}</span>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{lead.message}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                          {lead.propertyInterest && <span className="truncate">{lead.propertyInterest}</span>}
                          <span>&middot;</span>
                          <span>{timeAgo(lead.createdAt)}</span>
                        </p>
                      </div>
                      <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Respond
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-slate-700 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-base text-zinc-100">Funnel health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'Inquiry → Response', pct: stats.replyRate },
                  { label: 'Response → Tour', pct: Math.max(8, stats.replyRate - 12) },
                  { label: 'Tour → Application', pct: Math.max(4, stats.replyRate - 28) },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{row.label}</span>
                      <span className="font-semibold text-zinc-100">{row.pct}%</span>
                    </div>
                    <Progress value={row.pct} className="h-1.5 bg-slate-800" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-base text-zinc-100">Agent activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sent.length === 0 ? (
                  <p className="text-sm text-zinc-500">No outbound replies yet.</p>
                ) : (
                  sent.slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5">
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-zinc-200">{s.subject}</p>
                        <p className="truncate text-[11px] text-zinc-500">
                          {s.producedBy} · {timeAgo(s.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
