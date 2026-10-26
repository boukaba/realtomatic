'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type ActionMode = 'reply' | 'direct';

export type ActionTarget = {
  id: string;
  artifactId: string;
  title: string;
  /** Reply drafts an email; direct runs a general instruction. */
  mode: ActionMode;
  /** Operator's instruction text, for `direct` mode. */
  note?: string;
};

/**
 * Review-before-commit dialog for agent actions. The agent drafts (streaming
 * its work live), the operator reads it, optionally asks for a change, then
 * confirms. Nothing is committed until "Confirm".
 *
 * Render with a `key` unique to the target so each new item mounts a fresh
 * dialog — that keeps state initialisation out of effects.
 */
export function AgentActionDialog({
  target,
  open,
  onOpenChange,
  onCommitted,
}: {
  target: ActionTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [phase, setPhase] = useState<string | null>(null);
  const [liveText, setLiveText] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [agentName, setAgentName] = useState<string>('Agent');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const startedRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  /** Stop an in-flight draft. The agent run is abandoned; nothing is saved. */
  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setPhase(null);
  }, []);

  const runDraft = useCallback(
    async (mode: 'draft' | 'revise', instruction?: string, previousDraft?: string | null) => {
      if (!target) return;
      // Abort any previous in-flight attempt before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setRunning(true);
      setError(null);
      setLiveText('');
      setElapsed(0);
      startedRef.current = Date.now();
      if (mode === 'draft') setDraft(null);

      try {
        const res = await fetch('/api/attention/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: target.id,
            artifactId: target.artifactId,
            action: target.mode,
            mode,
            note: mode === 'revise' ? undefined : target.note,
            draft: mode === 'revise' ? previousDraft : undefined,
            feedback: mode === 'revise' ? instruction : undefined,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
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
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string;
                label?: string;
                line?: string;
                text?: string;
                content?: string;
                subject?: string;
                to?: string;
                agentName?: string;
                message?: string;
              };
              if (event.type === 'phase' && event.label) {
                setPhase(event.label);
              } else if (event.type === 'delta' && event.text) {
                // Real token stream — show it as it arrives.
                setLiveText((prev) => (prev + (event.text as string)).slice(-4000));
              } else if (event.type === 'log' && event.line) {
                setLog((prev) => [...prev.slice(-6), event.line as string]);
              } else if (event.type === 'draft' && event.content) {
                setDraft(event.content);
                setSubject(event.subject);
                setTo(event.to);
                if (event.agentName) setAgentName(event.agentName);
              } else if (event.type === 'error') {
                setError(event.message ?? 'Action failed');
              }
            } catch {
              // ignore malformed
            }
          }
        }
      } catch (e) {
        // An abort is an intentional cancel — never surface it as an error.
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof Error && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Action failed');
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setRunning(false);
          setPhase(null);
        }
      }
    },
    [target]
  );

  // Kick off the first draft once the dialog is open (deferred so the effect
  // doesn't set state synchronously).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void runDraft('draft'), 0);
    return () => clearTimeout(t);
  }, [open, runDraft]);

  // Live elapsed timer so a long model call reads as "working", not frozen.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedRef.current) / 100) / 10), 100);
    return () => clearInterval(t);
  }, [running]);

  const confirm = async () => {
    if (!target || !draft) return;
    setCommitting(true);
    try {
      const res = await fetch('/api/attention/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: target.id,
          artifactId: target.artifactId,
          action: target.mode,
          mode: 'confirm',
          draft,
        }),
      });
      if (res.ok) {
        onCommitted();
        onOpenChange(false);
        toast(isReply ? 'Reply sent successfully' : 'Result confirmed and saved');
      } else {
        toast('Could not save — please retry.', 'error');
        setError('Could not save — please retry.');
      }
    } catch {
      toast('Could not save — please retry.', 'error');
      setError('Could not save — please retry.');
    } finally {
      setCommitting(false);
    }
  };

  if (!target) return null;
  const isReply = target.mode === 'reply';

  const close = () => {
    cancelRun();
    onOpenChange(false);
  };

  // The model thinks out loud before emitting its JSON contract; show that
  // reasoning as it streams and hide the raw JSON (the draft panel renders it).
  const jsonStart = liveText.indexOf('{');
  const thinking = (jsonStart === -1 ? liveText : liveText.slice(0, jsonStart)).trim();

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-700 bg-slate-950">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isReply ? <Mail className="h-4 w-4 text-blue-400" /> : <Sparkles className="h-4 w-4 text-indigo-400" />}
            {isReply ? 'Reply via agent' : 'Agent instruction'}
          </DialogTitle>
          <DialogDescription className="text-slate-400">{target.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Agent working — live reasoning stream */}
          {(running || thinking) && (
            <div className="rounded-lg border border-slate-800 bg-[#0a0f1c] px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {running ? (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                  ) : (
                    <Terminal className="h-3 w-3" />
                  )}
                  {running ? (phase ?? 'Reasoning') : 'Reasoning complete'}
                </div>
                {running && (
                  <span className="font-mono text-[11px] text-slate-500">{elapsed.toFixed(1)}s</span>
                )}
              </div>

              {thinking ? (
                <div className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-300">
                  {thinking.split('\n').map((line, i) => (
                    <div key={i} className={line.startsWith('▸') ? 'text-blue-200/90' : 'text-slate-400'}>
                      {line}
                    </div>
                  ))}
                  {running && (
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-blue-400" />
                  )}
                </div>
              ) : (
                <div className="space-y-0.5 font-mono text-[11px] leading-relaxed text-slate-400">
                  {log.slice(-4).map((line, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="select-none text-slate-700">$</span>
                      <span className="truncate">{line}</span>
                    </div>
                  ))}
                  {running && (
                    <div className="flex items-center gap-2 pt-1 text-slate-500">
                      <span className="inline-block h-3 w-1.5 animate-pulse bg-blue-400" />
                      contacting the model…
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Draft */}
          {draft && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {isReply ? 'Draft reply' : 'Agent result'}
                </p>
                <span className="text-[11px] text-slate-500">by {agentName}</span>
              </div>
              {isReply && (to || subject) && (
                <div className="rounded-t-lg border border-b-0 border-slate-800 bg-slate-900/60 px-4 py-2.5 text-xs text-slate-400">
                  {to && <p><span className="text-slate-500">To:</span> {to}</p>}
                  {subject && <p><span className="text-slate-500">Subject:</span> {subject}</p>}
                </div>
              )}
              <div
                className={cn(
                  'whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm leading-relaxed text-slate-200',
                  isReply && (to || subject) && 'rounded-t-none'
                )}
              >
                {draft}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-4 py-3">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Revision request */}
          {draft && !running && (
            <div className="space-y-2">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={
                  isReply
                    ? 'Ask for a change, e.g. "More formal. Offer Thursday 10am as the concrete slot."'
                    : 'Ask for a change, e.g. "Also flag the insurance exposure."'
                }
                rows={2}
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-700 bg-slate-800/50 text-zinc-200 hover:bg-slate-800"
                  disabled={!feedback.trim() || running}
                  onClick={() => void runDraft('revise', feedback.trim(), draft)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Request change
                </Button>
                <p className="text-[11px] text-slate-500">
                  The agent revises and shows you the new version before anything is sent.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-4">
          <Button
            variant="ghost"
            className="text-slate-400 hover:text-slate-200"
            disabled={committing}
            onClick={close}
          >
            {running ? 'Cancel' : 'Close'}
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={!draft || running || committing}
            onClick={() => void confirm()}
          >
            {committing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isReply ? (
              <Send className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {isReply ? 'Confirm & send' : 'Confirm result'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
