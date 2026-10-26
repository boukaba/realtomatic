'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock,
  GitBranch,
  Loader2,
  Play,
  PlayCircle,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn, timeAgo } from '@/lib/utils';

type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval';

type StepView = {
  id: string;
  name: string;
  agentName: string;
  status: StepStatus;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  input: string;
  output: string | null;
  confidence: number | null;
};

type WorkflowView = {
  id: string;
  name: string;
  description: string;
  status: 'running' | 'completed' | 'failed' | 'pending_approval';
  steps: StepView[];
  startedAt: string;
  completedAt: string | null;
  triggeredBy: string;
  live: boolean;
  template?: string;
};

type Template = { id: string; name: string; description: string; steps: string[] };

const STATUS_META: Record<WorkflowView['status'], { label: string; chip: string }> = {
  running: { label: 'Running', chip: 'bg-blue-500/15 text-blue-300' },
  completed: { label: 'Completed', chip: 'bg-emerald-500/15 text-emerald-300' },
  failed: { label: 'Failed', chip: 'bg-red-500/15 text-red-300' },
  pending_approval: { label: 'Needs approval', chip: 'bg-amber-500/15 text-amber-300' },
};

function StepDot({ status }: { status: StepStatus }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-400" />;
  if (status === 'awaiting_approval') return <Clock className="h-4 w-4 text-amber-400" />;
  return <CircleDashed className="h-4 w-4 text-slate-600" />;
}

function Stepper({ steps }: { steps: StepView[] }) {
  const completed = steps.filter((s) => s.status === 'completed').length;
  const pct = Math.round((completed / Math.max(1, steps.length)) * 100);

  return (
    <div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol className="space-y-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
              step.status === 'running'
                ? 'border-blue-500/40 bg-blue-500/[0.06]'
                : step.status === 'completed'
                  ? 'border-slate-800 bg-slate-950/40'
                  : step.status === 'failed'
                    ? 'border-red-500/30 bg-red-500/[0.05]'
                    : 'border-slate-800/60 bg-slate-950/20'
            )}
          >
            <span className="mt-0.5">
              <StepDot status={step.status} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn('text-sm font-medium', step.status === 'pending' ? 'text-slate-500' : 'text-zinc-100')}>
                  {step.name}
                </p>
                <span className="text-[11px] text-slate-500">{step.agentName}</span>
                {step.duration !== null && (
                  <span className="text-[11px] text-slate-500">· {step.duration}s</span>
                )}
                {step.confidence !== null && (
                  <span className="text-[11px] text-slate-500">· {Math.round(step.confidence * 100)}%</span>
                )}
              </div>
              {step.output && (
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-400">{step.output}</p>
              )}
              {step.status === 'running' && !step.output && (
                <p className="mt-0.5 text-xs text-blue-300/80">working…</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LiveRunCard({ workflow }: { workflow: WorkflowView }) {
  // SSE updates take precedence over the parent's polled copy; falling back to
  // the prop avoids syncing props into state via an effect.
  const [liveUpdate, setLiveUpdate] = useState<WorkflowView | null>(null);
  const [expanded, setExpanded] = useState(true);
  const runningRef = useRef(false);
  const current = liveUpdate ?? workflow;

  useEffect(() => {
    if (runningRef.current) return;
    if (workflow.status !== 'running' && workflow.status !== 'pending_approval') return;
    runningRef.current = true;

    const es = new EventSource(`/api/workflows/${workflow.id}/stream`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type: string; workflow?: WorkflowView };
        if (data.type === 'workflow' && data.workflow) {
          setLiveUpdate(data.workflow);
          if (['completed', 'failed'].includes(data.workflow.status)) {
            es.close();
          }
        }
      } catch {
        // ignore malformed
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [workflow.id, workflow.status]);

  const meta = STATUS_META[current.status];

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-zinc-100">{current.name}</p>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', meta.chip)}>
                {meta.label}
              </span>
              {current.status === 'running' && (
                <span className="inline-flex items-center gap-1 text-[11px] text-blue-300">
                  <Zap className="h-3 w-3" />
                  live
                </span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{current.description}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Started {timeAgo(current.startedAt)} · by {current.triggeredBy}
            </p>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
            aria-label="Toggle steps"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', !expanded && '-rotate-90')} />
          </button>
        </div>
        {expanded && (
          <div className="mt-4">
            <Stepper steps={current.steps} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function WorkflowsPage() {
  const [runs, setRuns] = useState<WorkflowView[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);

  const pull = useCallback(async () => {
    try {
      const res = await fetch('/api/workflows');
      if (!res.ok) return;
      const body = await res.json();
      setRuns(body.runs ?? []);
      setTemplates(body.templates ?? []);
    } catch {
      // keep last
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void pull(), 0);
    const t = setInterval(pull, 12_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [pull]);

  const launch = async (templateId: string) => {
    setLaunching(templateId);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: templateId, triggeredBy: 'you' }),
      });
      if (res.ok) {
        await pull();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      // ignore
    } finally {
      setLaunching(null);
    }
  };

  const active = runs.filter((r) => r.status === 'running' || r.status === 'pending_approval');
  const past = runs.filter((r) => r.status !== 'running' && r.status !== 'pending_approval');

  return (
    <AppLayout title="Workflows">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Workflows</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Chains of agents that handle an entire job end-to-end — and hand off to each other as they go.
          </p>
        </div>

        {/* Templates */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Start a workflow
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {templates.map((t) => (
              <Card key={t.id} className="border-slate-700 bg-slate-900 transition-colors hover:border-slate-600">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">{t.name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">{t.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {t.steps.map((s, i) => (
                      <span key={`${t.id}-${s}`} className="inline-flex items-center gap-1.5">
                        {i > 0 && <ArrowRight className="h-3 w-3 text-slate-600" />}
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{s}</span>
                      </span>
                    ))}
                  </div>
                  <Button
                    className="mt-4 w-full bg-blue-600 text-white hover:bg-blue-700"
                    disabled={launching !== null}
                    onClick={() => void launch(t.id)}
                  >
                    {launching === t.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Starting…
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Run with agents
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Active runs */}
        {active.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <PlayCircle className="h-4 w-4 text-blue-400" />
              In progress
            </h3>
            <div className="space-y-4">
              {active.map((w) => (
                <LiveRunCard key={w.id} workflow={w} />
              ))}
            </div>
          </div>
        )}

        {/* History */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <GitBranch className="h-4 w-4 text-slate-400" />
            History
          </h3>
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading runs…</p>
          ) : past.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No completed runs yet.</p>
          ) : (
            <div className="space-y-3">
              {past.slice(0, 12).map((w) => {
                const meta = STATUS_META[w.status];
                const completed = w.steps.filter((s) => s.status === 'completed').length;
                return (
                  <details
                    key={w.id}
                    className="group rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4"
                  >
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                      <CheckCircle2
                        className={cn('h-4 w-4', w.status === 'completed' ? 'text-emerald-400' : w.status === 'failed' ? 'text-red-400' : 'text-amber-400')}
                      />
                      <span className="text-sm font-medium text-zinc-200">{w.name}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', meta.chip)}>{meta.label}</span>
                      <span className="ml-auto text-[11px] text-slate-500">
                        {completed}/{w.steps.length} steps · {timeAgo(w.startedAt)}
                      </span>
                    </summary>
                    <div className="mt-4">
                      <Stepper steps={w.steps} />
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
