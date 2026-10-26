'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Cpu,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  XCircle,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Live agent execution console — runs a REAL agent task via SSE:
 * microVM boot → policy gates → data-fabric context → streamed LLM
 * inference → structured artifact. Everything on screen is produced by
 * the backend in real time.
 */

type Phase = 'queued' | 'boot' | 'policy' | 'context' | 'fabricate' | 'infer' | 'done';

const PHASES: { id: Phase; label: string }[] = [
  { id: 'queued', label: 'Queued' },
  { id: 'boot', label: 'microVM Boot' },
  { id: 'policy', label: 'Policy Gates' },
  { id: 'context', label: 'Context' },
  { id: 'infer', label: 'Inference' },
  { id: 'done', label: 'Artifact' },
];

type LogTone = 'info' | 'ok' | 'warn' | 'data';

type StreamEvent =
  | { type: 'phase'; phase: Phase; label: string }
  | { type: 'log'; line: string; tone?: LogTone }
  | { type: 'delta'; text: string }
  | { type: 'result'; status: 'success' | 'failed'; execution?: ExecutionPayload; error?: string };

type ExecutionPayload = {
  id: string;
  agentName: string;
  output: string;
  duration: number;
  confidence: number;
  vmId: string;
  model?: string;
  tokens?: { input: number; output: number };
  artifact?: { id: string; kind: string; summary: string; payload: Record<string, unknown> };
};

const toneClass: Record<LogTone, string> = {
  info: 'text-slate-400',
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  data: 'text-sky-400',
};

function JsonView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) return <span className="text-slate-500">null</span>;
  if (typeof value === 'string') return <span className="text-emerald-300">&quot;{value.length > 220 ? `${value.slice(0, 220)}…` : value}&quot;</span>;
  if (typeof value === 'number')
    return <span className="text-amber-300">{Number.isInteger(value) ? value.toLocaleString() : value}</span>;
  if (typeof value === 'boolean') return <span className="text-fuchsia-300">{String(value)}</span>;

  if (Array.isArray(value)) {
    return (
      <div className="pl-3">
        {value.slice(0, 12).map((item, i) => (
          <div key={i} className="flex gap-2">
            <span className="select-none text-slate-600">{i}:</span>
            <JsonView value={item} depth={depth + 1} />
          </div>
        ))}
        {value.length > 12 && <div className="text-slate-500">+{value.length - 12} more…</div>}
      </div>
    );
  }

  if (typeof value === 'object') {
    return (
      <div className="pl-3">
        {Object.entries(value as Record<string, unknown>).slice(0, 18).map(([key, item]) => (
          <div key={key} className="flex gap-2">
            <span className="select-none text-sky-400">{key}:</span>
            <JsonView value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export function LiveExecutionConsole({
  agentId,
  agentName,
  compact = false,
}: {
  agentId: string;
  agentName: string;
  compact?: boolean;
}) {
  const [phase, setPhase] = useState<Phase | null>(null);
  const [logs, setLogs] = useState<{ line: string; tone: LogTone }[]>([]);
  const [streamText, setStreamText] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [result, setResult] = useState<ExecutionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskInput, setTaskInput] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const logRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const appendLog = useCallback((line: string, tone: LogTone = 'info') => {
    setLogs((prev) => [...prev.slice(-200), { line, tone }]);
  }, []);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase('queued');
    setLogs([]);
    setStreamText('');
    setResult(null);
    setError(null);
    setStatus('running');
    setElapsed(0);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 100) / 10), 100);

    try {
      const response = await fetch(`/api/agents/${agentId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskInput.trim() ? { userInput: taskInput.trim() } : {}),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error || `Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let event: StreamEvent;
          try {
            event = JSON.parse(line.slice(6)) as StreamEvent;
          } catch {
            continue;
          }

          if (event.type === 'phase') {
            setPhase(event.phase === 'fabricate' ? 'fabricate' : event.phase);
            if (event.phase !== 'done') appendLog(`── ${event.label} ──`, 'ok');
          } else if (event.type === 'log') {
            appendLog(event.line, event.tone ?? 'info');
          } else if (event.type === 'delta') {
            setStreamText((prev) => (prev + event.text).slice(-4000));
          } else if (event.type === 'result') {
            if (event.status === 'success' && event.execution) {
              setResult(event.execution);
              setStatus('success');
              setPhase('done');
            } else {
              setError(event.error ?? 'Execution failed');
              setStatus('failed');
            }
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'Execution failed');
        setStatus('failed');
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [agentId, taskInput, appendLog]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [logs, streamText]);

  const phaseIndex = phase ? PHASES.findIndex((p) => p.id === phase) : -1;

  // The model thinks out loud first, then emits the JSON artifact last.
  // Show the thinking live; hide the raw JSON (the structured result panel
  // renders it on completion).
  const jsonStart = streamText.indexOf('{');
  const thinkingText = (jsonStart === -1 ? streamText : streamText.slice(0, jsonStart)).trimEnd();
  const writingArtifact = jsonStart !== -1 && status === 'running';

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder={`Optional task instruction for ${agentName}…`}
          value={taskInput}
          onChange={(e) => setTaskInput(e.target.value)}
          disabled={status === 'running'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && status !== 'running') void run();
          }}
          className="border-slate-700 bg-slate-900/80 font-sm text-slate-200 placeholder:text-slate-600"
        />
        {status === 'running' ? (
          <Button disabled className="min-w-32 bg-blue-600/80 text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            {elapsed.toFixed(1)}s
          </Button>
        ) : (
          <Button onClick={() => void run()} className="min-w-32 bg-blue-600 text-white hover:bg-blue-700">
            {status === 'idle' ? (
              <>
                <Play className="h-4 w-4" />
                Run agent
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                Run again
              </>
            )}
          </Button>
        )}
      </div>

      {/* Phase stepper */}
      {(status !== 'idle' || phase) && (
        <div className="flex flex-wrap items-center gap-1">
          {PHASES.map((p, i) => {
            const done = status === 'success' || (phaseIndex > i && status !== 'failed');
            const active = phase === p.id && status === 'running';
            const failedHere = status === 'failed' && phase === p.id;
            return (
              <div key={p.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-slate-700" />}
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    failedHere
                      ? 'border-red-500/40 bg-red-500/10 text-red-400'
                      : active
                        ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                        : done
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border-slate-800 bg-slate-900/60 text-slate-600'
                  )}
                >
                  {failedHere ? (
                    <XCircle className="h-3 w-3" />
                  ) : active ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : done ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <CircleDashed className="h-3 w-3" />
                  )}
                  {p.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {status === 'idle' && (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-4 py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <p className="text-sm leading-relaxed text-slate-400">
            Run {agentName} for real. A microVM boots, policy gates pass, the agent pulls context from the Atlas data
            fabric, and a live LLM streams its reasoning right here — no canned output.
          </p>
        </div>
      )}

      {/* Terminal */}
      {logs.length > 0 && (
        <div
          ref={logRef}
          className={cn(
            'overflow-y-auto rounded-lg border border-slate-800 bg-[#0a0f1c] px-4 py-3 font-mono text-[11px] leading-relaxed',
            compact ? 'max-h-40' : 'max-h-52'
          )}
        >
          {logs.map((entry, i) => (
            <div key={i} className={cn('flex gap-2', toneClass[entry.tone])}>
              <span className="select-none text-slate-700">$</span>
              <span className="whitespace-pre-wrap break-all">{entry.line}</span>
            </div>
          ))}
        </div>
      )}

      {/* Live token stream */}
      {streamText && (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            <Terminal className="h-3 w-3" />
            Live inference
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] normal-case text-emerald-400">
              <Zap className="h-2.5 w-2.5" />
              streaming tokens
            </span>
          </div>
          <div
            ref={streamRef}
            className={cn(
              'overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950/80 px-4 py-3 font-mono text-[11px] leading-relaxed text-slate-300',
              compact ? 'max-h-32' : 'max-h-48'
            )}
          >
            {thinkingText}
            {writingArtifact && (
              <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                …writing structured output
              </div>
            )}
            {status === 'running' && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-blue-400" />}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">{result.agentName} — artifact published</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {result.model && (
                <Badge className="border-slate-700 bg-slate-800/60 font-mono text-[10px] text-slate-300">
                  <Cpu className="mr-1 h-3 w-3" />
                  {result.model}
                </Badge>
              )}
              <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
                {(result.confidence * 100).toFixed(0)}% confidence
              </Badge>
              <Badge className="border-slate-700 bg-slate-800/60 font-mono text-[10px] text-slate-400">
                {result.duration}s · {result.vmId}
              </Badge>
              {result.tokens && (
                <Badge className="border-slate-700 bg-slate-800/60 font-mono text-[10px] text-slate-400">
                  {result.tokens.output} out tok
                </Badge>
              )}
            </div>
          </div>
          {result.output && <p className="text-sm leading-relaxed text-slate-300">{result.output}</p>}
          {result.artifact?.payload && (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs font-medium text-sky-400 hover:text-sky-300">
                ▸ Structured output ({result.artifact.kind})
              </summary>
              <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-800 bg-[#0a0f1c] px-4 py-3 font-mono text-[11px] leading-relaxed text-slate-300">
                <JsonView value={result.artifact.payload} />
              </div>
            </details>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-4 py-3">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-300">Execution failed</p>
            <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-red-400/80">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
