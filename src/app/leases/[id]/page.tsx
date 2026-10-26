'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  FileText,
  FileSearch,
  Filter,
  Gauge,
  History,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import AppLayout from '@/components/layout/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { agents, agentExecutions, hitlRequests, leases, properties } from '@/lib/mock-data';
import type { LeaseClause, LeaseClauseType, LeaseStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';

const STATUS_CONFIG: Record<LeaseStatus, { label: string; badge: string; icon: LucideIcon }> = {
  active: { label: 'Active', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: CheckCircle2 },
  expiring: { label: 'Expiring', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: AlertTriangle },
  expired: { label: 'Expired', badge: 'bg-red-500/15 text-red-400 border-red-500/30', icon: XCircle },
  pending: { label: 'Pending', badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: Loader2 },
};

const CLAUSE_TYPE_CONFIG: Record<LeaseClauseType, { label: string; color: string }> = {
  rent: { label: 'Rent', color: 'bg-blue-500/15 text-blue-400' },
  term: { label: 'Term', color: 'bg-slate-500/15 text-slate-400' },
  renewal: { label: 'Renewal', color: 'bg-emerald-500/15 text-emerald-400' },
  CAM: { label: 'CAM', color: 'bg-violet-500/15 text-violet-400' },
  'co-tenancy': { label: 'Co-Tenancy', color: 'bg-amber-500/15 text-amber-400' },
  termination: { label: 'Termination', color: 'bg-red-500/15 text-red-400' },
  assignment: { label: 'Assignment', color: 'bg-cyan-500/15 text-cyan-400' },
  maintenance: { label: 'Maintenance', color: 'bg-orange-500/15 text-orange-400' },
  insurance: { label: 'Insurance', color: 'bg-pink-500/15 text-pink-400' },
  default: { label: 'Default', color: 'bg-rose-500/15 text-rose-400' },
};

const CLAUSE_TYPES = Object.keys(CLAUSE_TYPE_CONFIG) as LeaseClauseType[];

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'text-emerald-400';
  if (confidence >= 0.75) return 'text-amber-400';
  return 'text-red-400';
}

function getConfidenceBarColor(confidence: number): string {
  if (confidence >= 0.9) return 'bg-emerald-500';
  if (confidence >= 0.75) return 'bg-amber-500';
  return 'bg-red-500';
}

function ConfidenceBar({ confidence, showLabel = true }: { confidence: number; showLabel?: boolean }) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className={cn('h-1.5 w-16', getConfidenceBarColor(confidence))} />
      {showLabel && (
        <span className={cn('text-xs font-medium', getConfidenceColor(confidence))}>{pct}%</span>
      )}
    </div>
  );
}

function KeyTermCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-400">{label}</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-white">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{sub}</p>
          </div>
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', accent)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ClauseCard({
  clause,
  isExpanded,
  onToggle,
}: {
  clause: LeaseClause;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const typeConfig = CLAUSE_TYPE_CONFIG[clause.type] ?? CLAUSE_TYPE_CONFIG.default;
  const isNonStandard = !clause.isStandard;

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        isNonStandard
          ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-slate-800 bg-slate-900/60'
      )}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', typeConfig.color)}>
              {typeConfig.label}
            </span>
            <span className="text-sm font-medium text-white">{clause.title}</span>
            {isNonStandard ? (
              <Badge variant="warning" className="shrink-0 border-amber-500/30 bg-amber-500/15 text-amber-400">
                <ShieldAlert className="h-3 w-3" />
                Non-Standard
              </Badge>
            ) : (
              <Badge className="shrink-0 border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                <ShieldCheck className="h-3 w-3" />
                Standard
              </Badge>
            )}
          </div>
          <p
            className={cn(
              'mt-2 text-xs leading-relaxed text-slate-400',
              !isExpanded && 'line-clamp-2'
            )}
          >
            {clause.content}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-slate-500" />
              <ConfidenceBar confidence={clause.confidence} />
            </div>
            {isNonStandard && (
              <span className="text-[10px] font-medium text-amber-500">Review recommended</span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>
      {isExpanded && (
        <div className="border-t border-slate-800/60 px-4 py-3">
          <p className="text-xs leading-relaxed text-slate-300">{clause.content}</p>
          <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-500">
            <span>Clause ID: <span className="font-mono text-slate-400">{clause.id}</span></span>
            <span>Type: <span className="font-mono text-slate-400">{clause.type}</span></span>
            <span>Classification: <span className={isNonStandard ? 'text-amber-400' : 'text-emerald-400'}>{isNonStandard ? 'Non-Standard' : 'Standard'}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

function ExtractedClausesSection({ clauses }: { clauses: LeaseClause[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<LeaseClauseType | 'all'>('all');

  const filtered = useMemo(
    () => (typeFilter === 'all' ? clauses : clauses.filter((c) => c.type === typeFilter)),
    [clauses, typeFilter]
  );

  const nonStandardCount = clauses.filter((c) => !c.isStandard).length;

  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <ScrollText className="h-4 w-4 text-slate-400" />
              Extracted Clauses
            </CardTitle>
            <CardDescription className="text-slate-500">
              {clauses.length} clauses extracted
              {nonStandardCount > 0 && (
                <span className="text-amber-400"> · {nonStandardCount} non-standard</span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as LeaseClauseType | 'all')}
            >
              <SelectTrigger className="w-40 border-slate-800 bg-slate-900/60 text-slate-200">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {CLAUSE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CLAUSE_TYPE_CONFIG[type].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filtered.map((clause) => (
          <ClauseCard
            key={clause.id}
            clause={clause}
            isExpanded={expandedId === clause.id}
            onToggle={() => setExpandedId(expandedId === clause.id ? null : clause.id)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <ScrollText className="h-8 w-8 text-slate-600" />
            <p className="mt-2 text-sm text-slate-400">No clauses match this filter</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentViewerSection({ documentUrl, extractedAt }: { documentUrl: string; extractedAt: string }) {
  const [viewingDoc, setViewingDoc] = useState(false);

  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <FileText className="h-4 w-4 text-slate-400" />
          Source Document
        </CardTitle>
        <CardDescription className="text-slate-500">
          Original lease agreement uploaded for extraction
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/40">
          <FileSearch className="h-10 w-10 text-slate-600" />
          <p className="mt-3 text-sm text-slate-400">{documentUrl.split('/').pop()}</p>
          <p className="text-xs text-slate-600">Document preview not available in demo</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => setViewingDoc(true)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Original Document
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-xs text-slate-500">Format</p>
            <p className="mt-1 text-sm font-medium text-white">PDF</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-xs text-slate-500">File Size</p>
            <p className="mt-1 text-sm font-medium text-white">2.4 MB</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-xs text-slate-500">Uploaded</p>
            <p className="mt-1 text-sm font-medium text-white">{formatDate(extractedAt)}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-xs text-slate-500">Pages</p>
            <p className="mt-1 text-sm font-medium text-white">47</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Version History</p>
          <div className="space-y-2">
            {[
              { version: 'v3', date: extractedAt, note: 'Latest extraction', current: true },
              { version: 'v2', date: '2026-11-19T10:00:00Z', note: 'Re-processed after document update', current: false },
              { version: 'v1', date: '2026-11-15T08:00:00Z', note: 'Initial upload and extraction', current: false },
            ].map((v) => (
              <div
                key={v.version}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-4 py-2.5',
                  v.current
                    ? 'border-blue-500/30 bg-blue-500/5'
                    : 'border-slate-800 bg-slate-900/60'
                )}
              >
                <div className="flex items-center gap-3">
                  <History className={cn('h-4 w-4', v.current ? 'text-blue-400' : 'text-slate-500')} />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{v.version}</p>
                    <p className="text-xs text-slate-500">{v.note}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500">{formatDateTime(v.date)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>

      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setViewingDoc(false)}>
          <div className="flex h-96 w-full max-w-lg flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900 p-8" onClick={(e) => e.stopPropagation()}>
            <FileSearch className="h-16 w-16 text-slate-700" />
            <p className="mt-4 text-lg font-semibold text-slate-300">Document Preview</p>
            <p className="mt-1 text-sm text-slate-500">Full document viewer not available in demo</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-6 border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={() => setViewingDoc(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AgentExtractionSection({ leaseId, extractedAt }: { leaseId: string; extractedAt: string }) {
  const abstractor = agents.find((a) => a.id === 'agent-001');
  const executions = agentExecutions.filter((e) => e.agentId === 'agent-001');
  const relatedExecution = executions.find((e) => e.input.includes(leaseId)) ?? executions[0];

  const fieldConfidences = [
    { field: 'Tenant Name', confidence: 0.99 },
    { field: 'Property', confidence: 0.98 },
    { field: 'Monthly Rent', confidence: 0.97 },
    { field: 'Lease Term', confidence: 0.99 },
    { field: 'Start Date', confidence: 0.98 },
    { field: 'End Date', confidence: 0.98 },
    { field: 'Lease Type', confidence: 0.96 },
    { field: 'Total Sq Ft', confidence: 0.95 },
  ];

  if (!abstractor) return null;

  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Bot className="h-4 w-4 text-slate-400" />
          Agent Extraction Details
        </CardTitle>
        <CardDescription className="text-slate-500">
          How this lease data was extracted and processed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800">
            <Bot className="h-6 w-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">{abstractor.name}</p>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                v{abstractor.version}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{abstractor.description}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {relatedExecution ? `${relatedExecution.duration}s` : '—'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateTime(extractedAt)}
            </span>
          </div>
        </div>

        {relatedExecution && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Policy Checks Performed
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {relatedExecution.policyChecks.map((check) => (
                <div
                  key={check.name}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2',
                    check.status === 'passed'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : check.status === 'warning'
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-red-500/30 bg-red-500/5'
                  )}
                >
                  {check.status === 'passed' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : check.status === 'warning' ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                  )}
                  <div>
                    <p className="text-xs font-medium text-slate-200">{check.name}</p>
                    <p className="text-[10px] text-slate-500">{check.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Extraction Confidence by Field
          </p>
          <div className="space-y-2">
            {fieldConfidences.map((f) => (
              <div key={f.field} className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{f.field}</span>
                <ConfidenceBar confidence={f.confidence} />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LinkedPropertyCard({ propertyId }: { propertyId: string }) {
  const property = properties.find((p) => p.id === propertyId);
  if (!property) return null;

  return (
    <Card className="border-slate-800 bg-slate-900/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Building2 className="h-4 w-4 text-slate-400" />
          Linked Property
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800">
            <Building2 className="h-6 w-6 text-indigo-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">{property.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3 w-3" />
              {property.address}, {property.city}, {property.state}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>{formatCurrency(property.value, true)} value</span>
              <span>{property.sqFt.toLocaleString()} sq ft</span>
              <span>{property.occupancy}% occupied</span>
            </div>
          </div>
          <Link href={`/portfolio/${property.id}`}>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              View
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LeaseDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const lease = leases.find((l) => l.id === rawId);

  const [rerunning, setRerunning] = useState(false);
  const [hitlDialogOpen, setHitlDialogOpen] = useState(false);

  const property = lease ? properties.find((p) => p.id === lease.propertyId) : null;
  const statusConfig = lease ? STATUS_CONFIG[lease.status] : null;
  const StatusIcon = statusConfig?.icon ?? FileText;

  const nonStandardClauses = lease?.clauses.filter((c) => !c.isStandard) ?? [];
  const relatedHitl = hitlRequests.filter((h) => h.data && typeof h.data === 'object' && 'leaseId' in h.data && h.data.leaseId === rawId);

  const start = lease ? new Date(lease.startDate) : null;
  const end = lease ? new Date(lease.endDate) : null;
  const months =
    start && end
      ? Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
      : 0;

  const totalObligation = lease ? lease.monthlyRent * months : 0;
  const npv = (() => {
    if (!lease) return 0;
    const monthlyRate = 0.06 / 12;
    let sum = 0;
    for (let i = 0; i < months; i++) {
      sum += lease.monthlyRent / Math.pow(1 + monthlyRate, i);
    }
    return sum;
  })();

  const handleRerun = () => {
    setRerunning(true);
    setTimeout(() => setRerunning(false), 2000);
  };

  if (!lease || !statusConfig) {
    return (
      <AppLayout title="Lease Not Found">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 py-24">
          <FileText className="h-12 w-12 text-slate-600" />
          <p className="mt-4 text-lg font-semibold text-slate-300">Lease not found</p>
          <p className="mt-1 text-sm text-slate-500">
            No lease exists with ID <span className="font-mono text-slate-400">{rawId}</span>
          </p>
          <Link href="/leases" className="mt-6">
            <Button
              variant="outline"
              className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Leases
            </Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`${lease.tenantName} Lease`}>
      <div className="space-y-6">
        <Link
          href="/leases"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leases
        </Link>

        <Card className="border-slate-800 bg-slate-900/60">
          <CardContent className="p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-bold tracking-tight text-white">{lease.tenantName}</h2>
                  <Badge variant="secondary" className={cn('border', statusConfig.badge)}>
                    <StatusIcon className="h-3 w-3" />
                    {statusConfig.label}
                  </Badge>
                  <Badge className="border-slate-700 bg-slate-800 text-slate-300">
                    {lease.leaseType}
                  </Badge>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-400">
                  <MapPin className="h-3.5 w-3.5" />
                  {property
                    ? `${property.name} — ${property.address}, ${property.city}, ${property.state}`
                    : 'Unknown Property'}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {lease.tenantIndustry}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(lease.startDate)} — {formatDate(lease.endDate)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Extracted {formatDistanceToNow(new Date(lease.extractedAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                  onClick={handleRerun}
                  disabled={rerunning}
                >
                  {rerunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {rerunning ? 'Re-running...' : 'Re-run Abstractor'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export to PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Extracted Data
                </Button>
                {nonStandardClauses.length > 0 && (
                  <Button
                    size="sm"
                    className="bg-amber-600 text-white hover:bg-amber-700"
                    onClick={() => setHitlDialogOpen(true)}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Create HITL Request
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KeyTermCard
            label="Monthly Rent"
            value={formatCurrency(lease.monthlyRent)}
            sub={`${formatCurrency(lease.monthlyRent / lease.totalSqFt)}/sq ft`}
            icon={FileText}
            accent="bg-blue-500/15"
          />
          <KeyTermCard
            label="Lease Term"
            value={`${months} months`}
            sub={`${formatDate(lease.startDate)} — ${formatDate(lease.endDate)}`}
            icon={Calendar}
            accent="bg-violet-500/15"
          />
          <KeyTermCard
            label="Total Sq Ft"
            value={lease.totalSqFt.toLocaleString()}
            sub={property ? `at ${property.name}` : ''}
            icon={Building2}
            accent="bg-emerald-500/15"
          />
          <KeyTermCard
            label="Total Obligation"
            value={formatCurrency(totalObligation, true)}
            sub={`${formatCurrency(lease.monthlyRent)} × ${months} months`}
            icon={ScrollText}
            accent="bg-amber-500/15"
          />
          <KeyTermCard
            label="NPV (6% discount)"
            value={formatCurrency(Math.round(npv), true)}
            sub="Discounted cash flow value"
            icon={Sparkles}
            accent="bg-cyan-500/15"
          />
          <KeyTermCard
            label="Extraction Confidence"
            value={`${Math.round(lease.confidence * 100)}%`}
            sub={`${lease.clauses.length} clauses · ${nonStandardClauses.length} non-standard`}
            icon={Gauge}
            accent="bg-pink-500/15"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <ExtractedClausesSection clauses={lease.clauses} />
            <AgentExtractionSection
              leaseId={lease.id}
              extractedAt={lease.extractedAt}
            />
          </div>
          <div className="space-y-6">
            <DocumentViewerSection
              documentUrl={lease.documentUrl}
              extractedAt={lease.extractedAt}
            />
            <LinkedPropertyCard propertyId={lease.propertyId} />
            {relatedHitl.length > 0 && (
              <Card className="border-slate-800 bg-slate-900/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <UserCheck className="h-4 w-4 text-slate-400" />
                    Related HITL Requests
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {relatedHitl.map((h) => (
                    <div key={h.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-200">{h.title}</p>
                        <Badge
                          className={cn(
                            'shrink-0 border-transparent',
                            h.status === 'pending' && 'bg-amber-500/15 text-amber-400',
                            h.status === 'approved' && 'bg-emerald-500/15 text-emerald-400',
                            h.status === 'rejected' && 'bg-red-500/15 text-red-400',
                            h.status === 'changes_requested' && 'bg-blue-500/15 text-blue-400'
                          )}
                        >
                          {h.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{h.description}</p>
                      <p className="mt-2 text-[10px] text-slate-600">
                        {formatDateTime(h.requestedAt)} · {h.agentName}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {hitlDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setHitlDialogOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white">Create HITL Request</h3>
            <p className="mt-2 text-sm text-slate-400">
              Submit non-standard clauses for human review. A reviewer will be notified to verify the extracted terms.
            </p>
            <div className="mt-4 space-y-2">
              {nonStandardClauses.map((c) => (
                <div key={c.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-sm font-medium text-amber-400">{c.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{c.content}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={() => setHitlDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => setHitlDialogOpen(false)}
              >
                <UserCheck className="h-3.5 w-3.5" />
                Submit Request
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
