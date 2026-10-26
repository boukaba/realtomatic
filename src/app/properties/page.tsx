'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Wrench,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { properties } from '@/lib/mock-data';
import { formatCurrency } from '@/lib/utils';

type Counts = { open: number; mail: number; artifacts: number };

/**
 * The commercial portfolio: every building Realtomatic manages, each showing a
 * live pulse of what the agents have found there.
 */
export default function PropertiesPage() {
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const pullAll = async () => {
      await Promise.all(
        properties.map(async (p) => {
          try {
            const res = await fetch(`/api/properties/${p.id}`);
            if (!res.ok) return;
            const body = await res.json();
            if (!cancelled) setCounts((prev) => ({ ...prev, [p.id]: body.counts }));
          } catch {
            // ignore individual failures
          }
        })
      );
      if (!cancelled) setLoading(false);
    };
    const first = setTimeout(() => void pullAll(), 0);
    const t = setInterval(pullAll, 30_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const totalOpen = Object.values(counts).reduce((s, c) => s + (c?.open ?? 0), 0);

  return (
    <AppLayout title="Properties">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Properties</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {properties.length} buildings under management
            {loading ? '' : totalOpen > 0 ? ` · ${totalOpen} open items across the portfolio` : ' · nothing pending'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map((p) => {
            const c = counts[p.id];
            const busy = (c?.open ?? 0) > 0;
            return (
              <Link
                key={p.id}
                href={`/properties/${p.id}`}
                className="group flex flex-col rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-500/50 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800">
                    <Building2 className="h-5 w-5 text-blue-400" />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {busy ? (
                      <Badge className="border-transparent bg-amber-500/15 text-[10px] text-amber-300">
                        <Wrench className="mr-1 h-3 w-3" />
                        {c?.open} open
                      </Badge>
                    ) : (
                      <Badge className="border-transparent bg-emerald-500/15 text-[10px] text-emerald-300">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Clear
                      </Badge>
                    )}
                    {(c?.mail ?? 0) > 0 && (
                      <Badge className="border-transparent bg-indigo-500/15 text-[10px] text-indigo-300">
                        <Mail className="mr-1 h-3 w-3" />
                        {c?.mail}
                      </Badge>
                    )}
                  </div>
                </div>

                <h3 className="mt-3 text-sm font-semibold text-zinc-100">{p.name}</h3>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                  <MapPin className="h-3 w-3" />
                  {p.city}, {p.state}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-800 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Value</p>
                    <p className="mt-0.5 text-sm font-semibold text-zinc-100">{formatCurrency(p.value, true)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-800 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">Sqft</p>
                    <p className="mt-0.5 text-sm font-semibold text-zinc-100">
                      {(p.sqFt / 1000).toFixed(0)}k
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Occupancy</span>
                    <span className="font-semibold text-zinc-100">{p.occupancy}%</span>
                  </div>
                  <Progress value={p.occupancy} className="h-1.5 bg-slate-800" />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="capitalize">{p.type}</span>}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-400" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
