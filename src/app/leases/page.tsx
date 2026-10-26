'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn, formatCurrency } from '@/lib/utils';

type Clause = {
  type: string;
  title: string;
  content: string;
  isStandard: boolean;
  confidence: number;
};

type Lease = {
  id: string;
  tenantName: string;
  tenantIndustry: string;
  propertyAddress: string;
  leaseType: string;
  monthlyRent: number;
  sqFt: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'expiring' | 'expired' | 'draft';
  confidence: number;
  clauses: Clause[];
  nonStandardFlags: string[];
  summary: string;
  abstracted: boolean;
  createdAt: string;
};

const STATUS_CHIP: Record<Lease['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-300',
  expiring: 'bg-amber-500/15 text-amber-300',
  expired: 'bg-red-500/15 text-red-300',
  draft: 'bg-slate-500/15 text-slate-300',
};

function LeaseRow({ lease }: { lease: Lease }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow className="border-slate-800/60">
        <TableCell>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-100">{lease.tenantName}</p>
            <p className="truncate text-xs text-zinc-500">{lease.tenantIndustry}</p>
          </div>
        </TableCell>
        <TableCell className="max-w-52">
          <p className="truncate text-xs text-zinc-400">{lease.propertyAddress}</p>
        </TableCell>
        <TableCell>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_CHIP[lease.status])}>
            {lease.status}
          </span>
        </TableCell>
        <TableCell className="font-mono text-xs text-zinc-300">
          {lease.monthlyRent > 0 ? `${formatCurrency(lease.monthlyRent, true)}/mo` : '—'}
        </TableCell>
        <TableCell className="font-mono text-xs text-zinc-400">
          {lease.sqFt > 0 ? lease.sqFt.toLocaleString() : '—'}
        </TableCell>
        <TableCell className="text-xs text-zinc-400">
          {lease.endDate || '—'}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {lease.abstracted ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                {Math.round(lease.confidence * 100)}%
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Loader2 className="h-3 w-3" />
                queued
              </span>
            )}
            {lease.nonStandardFlags.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                <AlertTriangle className="h-2.5 w-2.5" />
                {lease.nonStandardFlags.length}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="pr-6 text-right">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-slate-200"
          >
            {open ? 'Hide' : 'View'}
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="border-slate-800/60 hover:bg-transparent">
          <TableCell colSpan={8} className="bg-slate-950/40 px-6 py-4">
            <p className="mb-3 text-xs leading-relaxed text-slate-400">{lease.summary}</p>

            {lease.nonStandardFlags.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
                  <AlertTriangle className="h-3 w-3" />
                  Flagged for review
                </p>
                <ul className="space-y-1">
                  {lease.nonStandardFlags.map((f, i) => (
                    <li key={i} className="text-[11px] leading-relaxed text-amber-200/90">• {f}</li>
                  ))}
                </ul>
              </div>
            )}

            {lease.clauses.length > 0 && (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {lease.clauses.map((c, i) => (
                  <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-zinc-200">{c.title}</p>
                      {c.isStandard ? (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                          standard
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                          non-standard
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-3 text-[11px] leading-relaxed text-slate-400">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function LeasesPage() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [counts, setCounts] = useState({ total: 0, abstracted: 0, expiring: 0, flagged: 0 });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch('/api/leases');
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) {
          setLeases(body.leases ?? []);
          setCounts(body.counts ?? { total: 0, abstracted: 0, expiring: 0, flagged: 0 });
        }
      } catch {
        // keep last
      } finally {
        if (!cancelled) setLoading(false);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leases;
    return leases.filter(
      (l) =>
        l.tenantName.toLowerCase().includes(q) ||
        l.propertyAddress.toLowerCase().includes(q) ||
        l.summary.toLowerCase().includes(q)
    );
  }, [leases, query]);

  return (
    <AppLayout title="Leases">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Leases</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Every lease the abstractors have processed, with clauses and flags.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { icon: FileText, label: 'In the system', value: counts.total, cls: 'bg-blue-500/15 text-blue-400' },
            { icon: CheckCircle2, label: 'Abstracted', value: counts.abstracted, cls: 'bg-emerald-500/15 text-emerald-400' },
            { icon: CalendarClock, label: 'Expiring ≤180d', value: counts.expiring, cls: 'bg-amber-500/15 text-amber-400' },
            { icon: AlertTriangle, label: 'Flagged clauses', value: counts.flagged, cls: 'bg-red-500/15 text-red-400' },
          ].map((kpi) => (
            <Card key={kpi.label} className="border-slate-700 bg-slate-900">
              <CardContent className="p-5">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', kpi.cls)}>
                  <kpi.icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-2xl font-bold text-zinc-100">{kpi.value}</p>
                <p className="mt-1 text-sm text-zinc-400">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tenant, address, or summary…"
            className="border-slate-700 bg-slate-900 pl-9 text-slate-200 placeholder:text-slate-600"
          />
        </div>

        <Card className="border-slate-700 bg-slate-900">
          <CardContent className="p-0">
            {loading ? (
              <p className="py-12 text-center text-sm text-slate-500">Loading leases…</p>
            ) : filtered.length === 0 ? (
              <div className="py-14 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-3 text-sm text-zinc-300">No leases yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Atlas is synthesizing intake documents. Your abstractors will pick them up automatically.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="pl-6 text-slate-500">Tenant</TableHead>
                    <TableHead className="text-slate-500">Property</TableHead>
                    <TableHead className="text-slate-500">Status</TableHead>
                    <TableHead className="text-slate-500">Rent</TableHead>
                    <TableHead className="text-slate-500">Sqft</TableHead>
                    <TableHead className="text-slate-500">Expires</TableHead>
                    <TableHead className="text-slate-500">Abstract</TableHead>
                    <TableHead className="pr-6 text-right text-slate-500">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <LeaseRow key={l.id} lease={l} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-slate-600">
          {filtered.length > 0 && `Newest first · ${filtered.length} lease${filtered.length === 1 ? '' : 's'}`}
          {filtered.length > 0 && ' · auto-refreshing every 15s as abstractors finish.'}
        </p>
      </div>
    </AppLayout>
  );
}
