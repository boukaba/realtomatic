'use client';

import { useEffect, useState } from 'react';
import type { AgentExecution } from '@/lib/types';

/**
 * Live dashboard feed. Consumes the /api/activity SSE firehose: an initial
 * snapshot of the server's real state (LLM-synthesized artifacts, real agent
 * executions, pending approvals) followed by a rolling refresh, so the page
 * fills in with genuine activity as agents run.
 */

export type LiveActivityEntry = {
  id: string;
  type: string;
  agentId?: string;
  agentName?: string;
  title: string;
  detail: string;
  timestamp: string;
};

export type LiveArtifact = {
  id: string;
  kind: string;
  summary: string;
  producedBy: string;
  createdAt: string;
};

export type LiveFabricator = {
  lastRunAt: string | null;
  artifactsProduced: number;
  running: boolean;
};

export type LivePortfolioStats = {
  agentRuns: number;
  artifactsSynthesized: number;
  pendingApprovals: number;
  workflowsRun: number;
};

type Snapshot = {
  type: 'snapshot';
  activity: LiveActivityEntry[];
  fabricator: LiveFabricator;
  artifacts: LiveArtifact[];
  executions: AgentExecution[];
  approvals: number;
};

export type LiveActivity = {
  activity: LiveActivityEntry[];
  artifacts: LiveArtifact[];
  executions: AgentExecution[];
  fabricator: LiveFabricator;
  pendingApprovals: number;
  portfolio: LivePortfolioStats;
  connected: boolean;
};

const EMPTY: LiveActivity = {
  activity: [],
  artifacts: [],
  executions: [],
  fabricator: { lastRunAt: null, artifactsProduced: 0, running: false },
  pendingApprovals: 0,
  portfolio: { agentRuns: 0, artifactsSynthesized: 0, pendingApprovals: 0, workflowsRun: 0 },
  connected: false,
};

export function useLiveActivity(enabled = true): LiveActivity {
  const [live, setLive] = useState<LiveActivity>(EMPTY);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    // Snapshot pull for the numeric KPIs the SSE feed does not carry.
    const pullPortfolio = async () => {
      try {
        const res = await fetch('/api/portfolio');
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        setLive((prev) => ({
          ...prev,
          portfolio: body?.summary?.liveStats ?? prev.portfolio,
          pendingApprovals: body?.summary?.liveStats?.pendingApprovals ?? prev.pendingApprovals,
        }));
      } catch {
        // Offline / server restarting — keep last known values.
      }
    };

    const connect = () => {
      source = new EventSource('/api/activity');
      source.onopen = () => {
        if (!cancelled) setLive((prev) => ({ ...prev, connected: true }));
      };
      source.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data) as Snapshot | { type: 'event' };
          if (data.type !== 'snapshot') return;
          setLive((prev) => ({
            ...prev,
            connected: true,
            activity: data.activity ?? prev.activity,
            artifacts: data.artifacts ?? prev.artifacts,
            executions: data.executions ?? prev.executions,
            fabricator: data.fabricator ?? prev.fabricator,
            pendingApprovals: data.approvals ?? prev.pendingApprovals,
          }));
        } catch {
          // Malformed frame — ignore.
        }
      };
      source.onerror = () => {
        if (!cancelled) setLive((prev) => ({ ...prev, connected: false }));
        // EventSource auto-reconnects; if it drops entirely, poll as backup.
        if (source && source.readyState === EventSource.CLOSED && !cancelled) {
          pullPortfolio();
        }
      };
    };

    connect();
    void pullPortfolio();
    pollTimer = setInterval(pullPortfolio, 15_000);

    return () => {
      cancelled = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [enabled]);

  return live;
}
