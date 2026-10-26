'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Live team feed. Keeps each agent's in-flight phase (queued -> boot ->
 * policy -> infer -> done) updated as the backend runs them, so the board
 * animates in real time instead of polling a stale summary.
 */

export type AgentActivityEvent = {
  type: 'activity';
  agentId: string;
  agentName: string;
  phase: string;
  label?: string;
  line?: string;
  executionId: string;
  at: string;
};

export type AgentDoneEvent = {
  type: 'done';
  agentId: string;
  agentName: string;
  executionId: string;
  summary?: string;
  duration?: number;
  at: string;
};

export type AgentFeedEvent = AgentActivityEvent | AgentDoneEvent;

export function useTeamFeed(enabled = true) {
  const [live, setLive] = useState<Record<string, { phase: string; label?: string; line?: string; at: string }>>({});
  const [recentDone, setRecentDone] = useState<AgentDoneEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const es = new EventSource('/api/team/stream');
      esRef.current = es;
      es.onmessage = (e) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(e.data) as AgentFeedEvent;
          if (data.type === 'activity') {
            setLive((prev) => ({
              ...prev,
              [data.agentId]: { phase: data.phase, label: data.label, line: data.line, at: data.at },
            }));
          } else if (data.type === 'done') {
            setLive((prev) => {
              const next = { ...prev };
              delete next[data.agentId];
              return next;
            });
            setRecentDone((prev) => [data, ...prev].slice(0, 12));
          }
        } catch {
          // ignore malformed
        }
      };
      es.onerror = () => {
        es.close();
        if (!cancelled) retry = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      esRef.current?.close();
    };
  }, [enabled]);

  return { live, recentDone };
}
