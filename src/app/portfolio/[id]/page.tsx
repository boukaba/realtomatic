'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Activity,
  ArrowLeft,
  Bot,
  Building,
  Building2,
  Calendar,
  CheckCircle2,
  DollarSign,
  FileText,
  Gauge,
  Home,
  Layers,
  MapPin,
  Pencil,
  Play,
  Ruler,
  Store,
  TrendingUp,
  Upload,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AppLayout from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { agentExecutions, agents, leases, properties } from '@/lib/mock-data';
import type { Property, PropertyType } from '@/lib/types';
import { cn, formatCurrency, formatDate, formatNumber, timeAgo } from '@/lib/utils';

const PROPERTY_TYPE_CONFIG: Record<PropertyType, { label: string; icon: typeof Building2 }> = {
  office: { label: 'Office', icon: Building },
  retail: { label: 'Retail', icon: Store },
  industrial: { label: 'Industrial', icon: Warehouse },
  multifamily: { label: 'Multifamily', icon: Home },
  'mixed-use': { label: 'Mixed-Use', icon: Layers },
};

const leaseStatusConfig: Record<string, { label: string; badge: string }> = {
  active: { label: 'Active', badge: 'border-transparent bg-emerald-500/15 text-emerald-400' },
  expiring: { label: 'Expiring', badge: 'border-transparent bg-amber-500/15 text-amber-400' },
  expired: { label: 'Expired', badge: 'border-transparent bg-red-500/15 text-red-400' },
  pending: { label: 'Pending', badge: 'border-transparent bg-sky-500/15 text-sky-400' },
};

function getPropertyStatus(occupancy: number): { label: string; badge: string; dot: string } {
  if (occupancy >= 95)
    return { label: 'High Occupancy', badge: 'border-transparent bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400' };
  if (occupancy >= 90)
    return { label: 'Good Standing', badge: 'border-transparent bg-blue-500/15 text-blue-400', dot: 'bg-blue-400' };
  return { label: 'At Risk', badge: 'border-transparent bg-amber-500/15 text-amber-400', dot: 'bg-amber-400' };
}

function buildValuationHistory(property: Property) {
  let seed = 0;
  for (const char of property.id) seed += char.charCodeAt(0);
  const now = new Date();
  return Array.from({ length: 12 }, (_, idx) => {
    const i = 11 - idx;
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const wave = Math.sin((seed + i * 7) / 3) * 0.012;
    const drift = ((seed % 13) / 1000) * (11 - i);
    return {
      month: format(date, 'MMM yy'),
      value: Math.round((property.value * (0.94 + wave + drift)) / 1_000_000),
    };
  });
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  iconClass: string;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconClass)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const property = properties.find((p) => p.id === rawId);

  const propertyLeases = useMemo(
    () => (property ? leases.filter((l) => l.propertyId === property.id) : []),
    [property]
  );
  const valuationHistory = useMemo(() => (property ? buildValuationHistory(property) : []), [property]);
  const comparables = useMemo(
    () => (property ? properties.filter((p) => p.type === property.type && p.id !== property.id).slice(0, 4) : []),
    [property]
  );
  const relatedExecutions = useMemo(
    () =>
      property
        ? agentExecutions
            .filter((e) => e.input.toLowerCase().includes(property.id))
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        : [],
    [property]
  );
  const involvedAgents = useMemo(
    () => agents.filter((a) => relatedExecutions.some((e) => e.agentId === a.id)),
    [relatedExecutions]
  );
  const lastAbstracted = useMemo(() => {
    if (propertyLeases.length === 0) return null;
    return propertyLeases
      .map((l) => new Date(l.extractedAt).getTime())
      .sort((a, b) => b - a)[0];
  }, [propertyLeases]);
  const lastValuated = useMemo(() => {
    const valuationExec = relatedExecutions.find((e) => e.agentId === 'agent-002');
    return valuationExec ? new Date(valuationExec.timestamp).getTime() : null;
  }, [relatedExecutions]);

  if (!property) {
    return (
      <AppLayout title="Property Not Found">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 py-24">
          <Building2 className="h-12 w-12 text-slate-600" />
          <p className="mt-4 text-lg font-semibold text-slate-300">Property not found</p>
          <p className="mt-1 text-sm text-slate-500">
            No property exists with ID <span className="font-mono text-slate-400">{rawId}</span>
          </p>
          <Button
            variant="outline"
            className="mt-6 border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => router.push('/portfolio')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Portfolio
          </Button>
        </div>
      </AppLayout>
    );
  }

  const typeConfig = PROPERTY_TYPE_CONFIG[property.type];
  const TypeIcon = typeConfig.icon;
  const status = getPropertyStatus(property.occupancy);
  const pricePerSqFt = Math.round(property.value / property.sqFt);
  const totalMonthlyRent = propertyLeases.reduce((sum, l) => sum + l.monthlyRent, 0);
  const leasedSqFt = propertyLeases.reduce((sum, l) => sum + l.totalSqFt, 0);
  const confidence = relatedExecutions.find((e) => e.agentId === 'agent-002')?.confidence ?? 0.93;

  return (
    <AppLayout title={property.name}>
      <div className="space-y-6">
        <Link
          href="/portfolio"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Portfolio
        </Link>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardContent className="p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                <TypeIcon className="h-7 w-7 text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-bold tracking-tight text-white">{property.name}</h2>
                  <Badge className="border-slate-700 bg-slate-800 text-slate-300">
                    <TypeIcon className="mr-1 h-3 w-3" />
                    {typeConfig.label}
                  </Badge>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium',
                      status.badge
                    )}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', status.dot)} />
                      <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', status.dot)} />
                    </span>
                    {status.label}
                  </span>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-400">
                  <MapPin className="h-3.5 w-3.5" />
                  {property.address}, {property.city}, {property.state} {property.zip}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Built {property.yearBuilt}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Ruler className="h-3.5 w-3.5" />
                    {formatNumber(property.sqFt)} sq ft
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" />
                    {formatCurrency(property.value, true)} valuation
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    {propertyLeases.length} lease{propertyLeases.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => router.push('/agents/agent-002')}>
                  <Play className="h-3.5 w-3.5" />
                  Run Valuation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Document
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  View on Map
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Property
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <Card className="overflow-hidden border-slate-800 bg-slate-900/60 xl:col-span-2">
            <div className="relative flex h-64 items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 sm:h-72">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.15),transparent_50%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(139,92,246,0.12),transparent_50%)]" />
              <div className="relative flex flex-col items-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-800/80 shadow-2xl shadow-blue-500/10">
                  <TypeIcon className="h-10 w-10 text-blue-400" />
                </div>
                <p className="mt-4 text-sm font-medium text-slate-400">{property.name}</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {property.city}, {property.state}
                </p>
              </div>
              <Badge className="absolute left-4 top-4 border-slate-700/60 bg-slate-900/70 text-slate-300 backdrop-blur">
                {typeConfig.label}
              </Badge>
            </div>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total Sq Ft', value: formatNumber(property.sqFt) },
                  { label: 'Leased Sq Ft', value: formatNumber(leasedSqFt) },
                  { label: 'Year Built', value: String(property.yearBuilt) },
                  { label: 'Price / Sq Ft', value: `$${pricePerSqFt.toLocaleString()}` },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6 xl:col-span-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard label="Sq Ft" value={formatNumber(property.sqFt)} sub="Rentable area" icon={Ruler} iconClass="bg-blue-500/15 text-blue-400" />
              <StatCard
                label="Occupancy"
                value={`${property.occupancy}%`}
                sub={property.occupancy >= 95 ? 'Excellent' : property.occupancy >= 90 ? 'Strong' : 'Needs attention'}
                icon={Gauge}
                iconClass="bg-emerald-500/15 text-emerald-400"
              />
              <StatCard label="Value" value={formatCurrency(property.value, true)} sub="Current valuation" icon={DollarSign} iconClass="bg-violet-500/15 text-violet-400" />
              <StatCard label="Price / Sq Ft" value={`$${pricePerSqFt.toLocaleString()}`} sub="Per rentable sq ft" icon={TrendingUp} iconClass="bg-amber-500/15 text-amber-400" />
              <StatCard label="Year Built" value={String(property.yearBuilt)} sub={`${new Date().getFullYear() - property.yearBuilt} years old`} icon={Calendar} iconClass="bg-sky-500/15 text-sky-400" />
              <StatCard label="Amenities" value={String(property.amenities.length)} sub="Building features" icon={Building} iconClass="bg-pink-500/15 text-pink-400" />
            </div>

            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="text-white">About This Property</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-slate-400">
                  {property.name} is a {property.occupancy}% occupied {typeConfig.label.toLowerCase()} property located in
                  the heart of {property.city}, {property.state}. Built in {property.yearBuilt}, the property spans{' '}
                  {formatNumber(property.sqFt)} square feet and is currently valued at {formatCurrency(property.value, true)}.
                </p>
                <p className="text-sm leading-relaxed text-slate-400">
                  The property generates {formatCurrency(totalMonthlyRent, true)} in monthly rental income across{' '}
                  {propertyLeases.length} lease{propertyLeases.length === 1 ? '' : 's'} and offers {property.amenities.length}{' '}
                  building amenities. The asset is monitored continuously by Realtomatic AI agents for valuation updates, lease
                  abstraction, and predictive maintenance.
                </p>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Amenities</p>
                  <div className="flex flex-wrap gap-1.5">
                    {property.amenities.map((amenity) => (
                      <Badge key={amenity} variant="secondary" className="border-slate-700 bg-slate-800 text-slate-300">
                        {amenity}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-white">Linked Leases</CardTitle>
              <CardDescription className="text-slate-500">
                {propertyLeases.length} lease{propertyLeases.length === 1 ? '' : 's'} at this property ·{' '}
                {formatCurrency(totalMonthlyRent, true)}/mo total rent
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => router.push('/leases')}>
              View All Leases
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="pl-6 text-slate-500">Tenant</TableHead>
                  <TableHead className="text-slate-500">Type</TableHead>
                  <TableHead className="text-slate-500">Term</TableHead>
                  <TableHead className="text-right text-slate-500">Monthly Rent</TableHead>
                  <TableHead className="text-slate-500">Status</TableHead>
                  <TableHead className="pr-6 text-right text-slate-500">Expiration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propertyLeases.map((lease) => {
                  const leaseStatus = leaseStatusConfig[lease.status];
                  return (
                    <TableRow key={lease.id} onClick={() => router.push('/leases')} className="cursor-pointer border-slate-800/60">
                      <TableCell className="pl-6">
                        <p className="text-sm font-medium text-white">{lease.tenantName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{lease.tenantIndustry}</p>
                      </TableCell>
                      <TableCell className="text-sm text-slate-300">{lease.leaseType}</TableCell>
                      <TableCell className="text-sm text-slate-300">
                        {formatDate(lease.startDate)} — {formatDate(lease.endDate)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-white">
                        {formatCurrency(lease.monthlyRent, true)}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('border-transparent', leaseStatus.badge)}>{leaseStatus.label}</Badge>
                      </TableCell>
                      <TableCell className="pr-6 text-right text-sm text-slate-400">{formatDate(lease.endDate)}</TableCell>
                    </TableRow>
                  );
                })}
                {propertyLeases.length === 0 && (
                  <TableRow className="border-slate-800/60 hover:bg-transparent">
                    <TableCell colSpan={6} className="py-12 text-center">
                      <FileText className="mx-auto h-8 w-8 text-slate-600" />
                      <p className="mt-2 text-sm text-slate-400">No leases linked to this property</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <Card className="border-slate-800 bg-slate-900/60 xl:col-span-3">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-white">Valuation History</CardTitle>
                  <CardDescription className="text-slate-500">Automated valuation over the last 12 months</CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold tracking-tight text-white">{formatCurrency(property.value, true)}</p>
                  <Badge className="mt-1.5 border-transparent bg-emerald-500/15 text-emerald-400">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    {(confidence * 100).toFixed(0)}% confidence
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={valuationHistory} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="valuationGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="month" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#475569"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      domain={['dataMin - 5', 'dataMax + 5']}
                      tickFormatter={(v: number) => `$${v}M`}
                    />
                    <Tooltip
                      cursor={{ stroke: '#334155', strokeDasharray: '4 4' }}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                      labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                      itemStyle={{ color: '#94a3b8' }}
                      formatter={(value) => [`$${Number(value).toFixed(1)}M`, 'Valuation']}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#60a5fa', strokeWidth: 0 }}
                      fill="url(#valuationGradient)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-white">Comparable Properties</CardTitle>
              <CardDescription className="text-slate-500">
                Similar {typeConfig.label.toLowerCase()} assets in the portfolio
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-800/60">
                {comparables.map((comp) => {
                  const CompIcon = PROPERTY_TYPE_CONFIG[comp.type].icon;
                  return (
                    <div
                      key={comp.id}
                      onClick={() => router.push(`/portfolio/${comp.id}`)}
                      className="flex cursor-pointer items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-800/30"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800">
                        <CompIcon className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{comp.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {comp.city}, {comp.state} · {formatNumber(comp.sqFt)} sq ft
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">{formatCurrency(comp.value, true)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          ${Math.round(comp.value / comp.sqFt).toLocaleString()}/sq ft
                        </p>
                      </div>
                    </div>
                  );
                })}
                {comparables.length === 0 && (
                  <div className="py-12 text-center">
                    <Building2 className="mx-auto h-8 w-8 text-slate-600" />
                    <p className="mt-2 text-sm text-slate-400">No comparable properties</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Bot className="h-4 w-4 text-slate-400" />
              Agent Activity
            </CardTitle>
            <CardDescription className="text-slate-500">AI agent executions related to this property</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <FileText className="h-3.5 w-3.5" />
                  Last Abstracted
                </div>
                <p className="mt-2 text-sm font-semibold text-white">
                  {lastAbstracted ? format(new Date(lastAbstracted), 'MMM d, yyyy h:mm a') : '—'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {lastAbstracted ? timeAgo(new Date(lastAbstracted)) : 'No lease abstracts yet'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Last Valuated
                </div>
                <p className="mt-2 text-sm font-semibold text-white">
                  {lastValuated ? format(new Date(lastValuated), 'MMM d, yyyy h:mm a') : '—'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {lastValuated ? timeAgo(new Date(lastValuated)) : 'No valuations yet'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <Activity className="h-3.5 w-3.5" />
                  Agents Involved
                </div>
                <p className="mt-2 truncate text-sm font-semibold text-white">
                  {involvedAgents.length > 0 ? involvedAgents.map((a) => a.name).join(', ') : '—'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {relatedExecutions.length} execution{relatedExecutions.length === 1 ? '' : 's'} on record
                </p>
              </div>
            </div>

            {involvedAgents.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {involvedAgents.map((agent) => (
                  <Badge key={agent.id} variant="secondary" className="border-slate-700 bg-slate-800 text-slate-300">
                    <Bot className="mr-1.5 h-3 w-3 text-blue-400" />
                    {agent.name}
                    <span className="ml-1.5 text-slate-500">v{agent.version}</span>
                  </Badge>
                ))}
              </div>
            )}

            <div className="divide-y divide-slate-800/60">
              {relatedExecutions.map((exec) => (
                <div key={exec.id} className="flex items-center gap-4 py-3.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800">
                    <Activity className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{exec.input}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{exec.output}</p>
                  </div>
                  <div className="hidden items-center gap-5 text-xs text-slate-500 sm:flex">
                    <span className="font-mono">{exec.duration}s</span>
                    <span className="font-mono">{(exec.confidence * 100).toFixed(0)}%</span>
                    <span className="w-28 text-right">{timeAgo(new Date(exec.timestamp))}</span>
                  </div>
                </div>
              ))}
              {relatedExecutions.length === 0 && (
                <div className="py-8 text-center">
                  <Bot className="mx-auto h-8 w-8 text-slate-600" />
                  <p className="mt-2 text-sm text-slate-400">No agent executions for this property yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
