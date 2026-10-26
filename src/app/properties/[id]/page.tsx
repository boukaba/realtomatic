'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Mail,
  Square,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { properties } from '@/lib/mock-data';
import { cn, formatCurrency, timeAgo } from '@/lib/utils';

type OpenItem = {
  id: string;
  artifactId: string;
  kind: string;
  urgency: string;
  title: string;
  detail: string;
  createdAt: string;
};

type MailItem = {
  id: string;
  to?: string;
  subject: string;
  body: string;
  agentName: string;
  createdAt: string;
};

const KIND_ICON: Record<string, typeof Wrench> = {
  'tenant-email': Mail,
  'lease-document': CalendarClock,
  lead: Users,
  'market-snapshot': TrendingUp,
  'comps-set': TrendingUp,
};

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const property = properties.find((p) => p.id === rawId);

  const [items, setItems] = useState<OpenItem[]>([]);
  const [mail, setMail] = useState<MailItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rawId) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch(`/api/properties/${rawId}`);
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) {
          setItems(body.openItems ?? []);
          setMail(body.mail ?? []);
        }
      } catch {
        // keep last
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const first = setTimeout(() => void pull(), 0);
    const t = setInterval(pull, 20_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [rawId]);

  if (!property) {
    return (
      <AppLayout title="Not found">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 py-24">
          <Building2 className="h-12 w-12 text-slate-600" />
          <p className="mt-4 text-lg font-semibold text-slate-300">Property not found</p>
          <Link href="/properties" className="mt-6 inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300">
            <ArrowLeft className="h-4 w-4" /> Back to properties
          </Link>
        </div>
      </AppLayout>
    );
  }

  const occupancyPct = property.occupancy;

  return (
    <AppLayout title={property.name}>
      <div className="space-y-6">
        <Link href="/properties" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> All properties
        </Link>

        {/* Header */}
        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                <Building2 className="h-7 w-7 text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold tracking-tight text-white">{property.name}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {property.address}, {property.city}, {property.state} {property.zip}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge className="border-transparent bg-blue-500/15 capitalize text-blue-300">{property.type}</Badge>
                  <Badge className="border-transparent bg-slate-700 text-slate-300">
                    {property.sqFt.toLocaleString()} sqft
                  </Badge>
                  <Badge className="border-transparent bg-slate-700 text-slate-300">Built {property.yearBuilt}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-1 sm:text-right">
                <div>
                  <p className="text-xs text-slate-500">Value</p>
                  <p className="text-lg font-semibold text-zinc-100">{formatCurrency(property.value, true)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Occupancy</p>
                  <p className="text-lg font-semibold text-zinc-100">{occupancyPct}%</p>
                </div>
              </div>
            </div>
            <div className="mt-5">
              <Progress value={occupancyPct} className="h-1.5 bg-slate-800" />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Needs attention on this building */}
          <Card className="border-slate-700 bg-slate-900 xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-base text-zinc-100">Needs attention here</CardTitle>
              <p className="text-sm text-zinc-400">Live items your agents flagged for this property</p>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <p className="px-6 py-10 text-center text-sm text-zinc-500">Checking…</p>
              ) : items.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-zinc-500">
                  Nothing pending at {property.name} right now.
                </p>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {items.map((item) => {
                    const Icon = KIND_ICON[item.kind] ?? AlertTriangle;
                    const urgent = item.urgency === 'high';
                    return (
                      <li key={item.id} className="flex items-start gap-3 px-6 py-4 transition-colors hover:bg-slate-800/40">
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', urgent ? 'text-red-400' : 'text-slate-500')} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-zinc-100">{item.title}</p>
                            <Badge
                              className={cn(
                                'border-transparent text-[10px]',
                                urgent ? 'bg-red-500/15 text-red-300' : 'bg-blue-500/15 text-blue-300'
                              )}
                            >
                              {item.kind.replace('-', ' ')}
                            </Badge>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{item.detail}</p>
                          <p className="mt-1 text-[11px] text-zinc-500">{timeAgo(item.createdAt)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {/* Agent activity for this building */}
            <Card className="border-slate-700 bg-slate-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Agent activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {mail.length === 0 ? (
                  <p className="px-6 py-8 text-center text-sm text-zinc-500">
                    No agent correspondence logged for this building yet.
                  </p>
                ) : (
                  <ul className="max-h-72 divide-y divide-slate-800 overflow-y-auto">
                    {mail.map((m) => (
                      <li key={m.id} className="flex items-start gap-2 px-6 py-3">
                        <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-zinc-200">{m.subject}</p>
                          <p className="truncate text-[11px] text-zinc-500">
                            {m.agentName} · {timeAgo(m.createdAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Building facts */}
            <Card className="border-slate-700 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-base text-zinc-100">Building facts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                {[
                  ['Rentable area', `${property.sqFt.toLocaleString()} sqft`],
                  ['Occupancy', `${property.occupancy}%`],
                  ['Asset value', formatCurrency(property.value, true)],
                  ['Year built', String(property.yearBuilt)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-zinc-400">{k}</span>
                    <span className="font-medium text-zinc-100">{v}</span>
                  </div>
                ))}
                <div className="border-t border-slate-800 pt-2.5">
                  <p className="mb-1.5 text-xs text-zinc-500">Amenities</p>
                  <div className="flex flex-wrap gap-1.5">
                    {property.amenities.slice(0, 4).map((a) => (
                      <Badge key={a} className="border-transparent bg-slate-700 text-[10px] font-normal text-slate-300">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <p className="flex items-center gap-2 text-xs text-zinc-600">
          <Square className="h-3 w-3" />
          Items here are real artifacts produced by your agents. Ask the AI Assistant about this building.
        </p>
      </div>
    </AppLayout>
  );
}
