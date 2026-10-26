import { FABRICATOR_AGENT_ID, missions } from './missions';
import { runAgentJson } from './llm';
import { withLlmSlot } from './llm-queue';
import { getState, mutateState, pushActivity, type GeneratedArtifact } from './store';

/**
 * Atlas — the background Data Synthesis Agent.
 *
 * While the "real" product would ingest market feeds and document drops,
 * this demo's data fabric is itself an agent: Atlas synthesizes market
 * snapshots, lease documents, tenant emails, and leads with a real LLM and
 * feeds them to the worker agents. It runs one artifact per cycle on a
 * timer, forever, so the platform always looks alive.
 */

const FABRICATOR_INTERVAL_MS = 90_000;

const METRO_ROTATION = [
  'Austin, TX (office)',
  'Miami, FL (retail)',
  'Dallas, TX (industrial)',
  'Seattle, WA (office)',
  'Phoenix, AZ (multifamily)',
  'Atlanta, GA (mixed-use)',
  'Denver, CO (office)',
  'Nashville, TN (multifamily)',
];

/**
 * Anchor operational artifacts to the actual buildings Realtomatic manages so
 * a property page has a genuine story attached to it (instead of generic
 * off-portfolio mail). Injected into the synthesis prompt below.
 */
const BUILDING_ROTATION = [
  { name: 'One Congress Plaza', address: '1 Congress Ave, Austin, TX 78701', city: 'Austin', type: 'office' },
  { name: 'The Domain Tower', address: '11011 Domain Dr, Austin, TX 78758', city: 'Austin', type: 'office' },
  { name: 'Galleria Financial Center', address: '5085 W Dallas Pkwy, Dallas, TX 75254', city: 'Dallas', type: 'office' },
  { name: 'Biscayne Bayfront', address: '1000 Brickell Ave, Miami, FL 33131', city: 'Miami', type: 'mixed-use' },
  { name: 'RiNo Art District Lofts', address: '3501 Blake St, Denver, CO 80205', city: 'Denver', type: 'multifamily' },
  { name: 'Desert Ridge Corporate Center', address: '10050 N Crescent Ave, Phoenix, AZ 85023', city: 'Phoenix', type: 'office' },
  { name: 'South End Logistics Hub', address: '225 Franklin St, Boston, MA 02110', city: 'Boston', type: 'industrial' },
  { name: 'The Gulch Union', address: '1200 McGavock St, Nashville, TN 37203', city: 'Nashville', type: 'multifamily' },
];

function buildingContext(): string {
  const b = BUILDING_ROTATION[cycleIndex % BUILDING_ROTATION.length];
  return `\nANCHOR: this must concern the property "${b.name}" at ${b.address} (${b.type}, ${b.city}). Use that exact propertyAddress in the output.`;
}

const ARTIFACT_PLAN: { kind: GeneratedArtifact['kind']; describe: (i: number) => string }[] = [
  {
    kind: 'market-snapshot',
    describe: (i) => `Synthesize one market snapshot for ${METRO_ROTATION[i % METRO_ROTATION.length]}.`,
  },
  {
    kind: 'lease-document',
    describe: (i) =>
      `Synthesize one incoming commercial lease document (${
        ['NNN office', 'Gross retail', 'Modified Gross medical office', 'Percentage Rent flagship retail', 'NNN flex industrial'][i % 5]
      }) that just arrived in the intake queue.`,
  },
  {
    kind: 'tenant-email',
    describe: () => `Synthesize one inbound tenant email from a property contact (rotate categories: maintenance, lease_question, expansion, complaint).`,
  },
  {
    kind: 'lead',
    describe: () => `Synthesize one inbound leasing lead from a portal source.`,
  },
  {
    kind: 'market-snapshot',
    describe: (i) => `Synthesize one market snapshot for ${METRO_ROTATION[(i + 4) % METRO_ROTATION.length]}.`,
  },
];

let cycleIndex = 0;
let inFlight: Promise<GeneratedArtifact | null> | null = null;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function summarize(payload: Record<string, unknown>, kind: GeneratedArtifact['kind']): string {
  switch (kind) {
    case 'market-snapshot':
      return `${payload.city ?? 'Market'} ${payload.propertyType ?? ''}: ${(Number(payload.vacancyRate) || 0).toFixed(1)}% vacancy, cap ${(Number(payload.capRate) || 0).toFixed(2)}%`;
    case 'lease-document':
      return `Lease doc — ${payload.tenantName ?? 'tenant'}, ${payload.sqFt ?? '?'} sqft @ $${Number(payload.monthlyRent || 0).toLocaleString()}/mo`;
    case 'tenant-email':
      return `Tenant email (${payload.category ?? 'general'}) — ${payload.subject ?? ''}`;
    case 'lead':
      return `Lead: ${payload.name ?? 'unknown'} — ${payload.propertyInterest ?? ''} (${payload.budget ?? ''})`;
    default:
      return String(payload.summary ?? 'Artifact produced');
  }
}

export async function runFabricatorCycle(forceKind?: GeneratedArtifact['kind']): Promise<GeneratedArtifact | null> {
  if (inFlight) return inFlight;

  const plan = ARTIFACT_PLAN[cycleIndex % ARTIFACT_PLAN.length];
  cycleIndex++;
  const kind = forceKind ?? plan.kind;
  const baseInstruction = forceKind
    ? `Synthesize one ${kind} artifact for the data fabric.`
    : plan.describe(cycleIndex);

  // Market snapshots are metro-level; operational artifacts get anchored to a
  // real managed building so property pages have a genuine story.
  const anchorBuilding = kind !== 'market-snapshot';
  const instruction = `${baseInstruction}${anchorBuilding ? buildingContext() : ''}`;

  inFlight = (async (): Promise<GeneratedArtifact | null> => {
    mutateState((s) => {
      s.fabricator.running = true;
    });

    try {
      const mission = missions[FABRICATOR_AGENT_ID];
      const { data, meta } = await withLlmSlot(() =>
        runAgentJson(
          `Atlas — ${kind}`,
          mission.system,
          `${instruction}\n\nGenerate exactly one JSON object for kind="${kind}" now.`,
          mission.validate
        )
      );

      const payloadKind = (data.kind as GeneratedArtifact['kind']) || kind;
      const artifact: GeneratedArtifact = {
        id: uid('art'),
        kind: payloadKind,
        producedBy: 'Atlas (Data Synthesis)',
        city: typeof data.city === 'string' ? data.city : undefined,
        summary: summarize(data, payloadKind),
        payload: data,
        createdAt: new Date().toISOString(),
      };

      mutateState((s) => {
        s.artifacts.push(artifact);
        s.fabricator.lastRunAt = artifact.createdAt;
        s.fabricator.lastArtifactId = artifact.id;
        s.fabricator.artifactsProduced += 1;
        s.fabricator.running = false;
      });

      pushActivity({
        type: 'fabricator',
        agentId: FABRICATOR_AGENT_ID,
        agentName: 'Atlas — Data Synthesis',
        title: `Synthesized ${payloadKind.replace('-', ' ')}`,
        detail: `${artifact.summary} · ${meta.model} · ${meta.outputTokens} tokens`,
      });

      return artifact;
    } catch (error) {
      mutateState((s) => {
        s.fabricator.running = false;
      });
      pushActivity({
        type: 'fabricator',
        agentId: FABRICATOR_AGENT_ID,
        agentName: 'Atlas — Data Synthesis',
        title: 'Synthesis cycle failed',
        detail: error instanceof Error ? error.message : 'unknown error',
      });
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Cold-start warm-up. A fresh checkout has an empty store, so the first
 * visitor would see a blank dashboard. On first request we backfill a small,
 * realistic history: Atlas synthesizes the core artifact kinds and a couple
 * of agents run for real, so the demo opens populated with genuine output.
 * Runs once, then never again (state persists to disk).
 */
export async function ensureSeeded(): Promise<void> {
  const state = getState();
  if (state.executions.length > 0) return; // already warm

  mutateState((s) => {
    s.fabricator.running = true;
  });
  pushActivity({
    type: 'fabricator',
    agentId: FABRICATOR_AGENT_ID,
    agentName: 'Atlas — Data Synthesis',
    title: 'Cold start: warming the data fabric',
    detail: 'Synthesizing an initial portfolio snapshot before you arrive',
  });

  // One artifact of each core kind so every downstream agent has input.
  for (const kind of ['market-snapshot', 'lease-document', 'tenant-email', 'lead'] as const) {
    await runFabricatorCycle(kind);
  }

  // Run one real agent end-to-end so the demo opens with a genuine execution.
  const { executeAgent } = await import('./executor');
  await executeAgent('agent-001', {
    goal: 'Abstract a recent lease from the intake queue for the portfolio view.',
    onEvent: () => {},
  }).promise;

  pushActivity({
    type: 'fabricator',
    agentId: FABRICATOR_AGENT_ID,
    agentName: 'Atlas — Data Synthesis',
    title: 'Data fabric warm',
    detail: 'Initial portfolio synthesized — agents are live',
  });
}

declare global {
  var __realtomaticFabricatorTimer: ReturnType<typeof setInterval> | undefined;
  var __realtomaticSeeding: Promise<void> | undefined;
}

/** Starts the Atlas heartbeat (idempotent across HMR). */
export function ensureFabricator(): void {
  if (globalThis.__realtomaticFabricatorTimer) {
    // Already running — still make sure the autopilot dispatcher is alive
    // (it is started lazily to avoid a static import cycle).
    void import('./autopilot').then((m) => m.ensureAutopilot());
    return;
  }

  // The team keeps working without anyone watching: start the autopilot the
  // first time any part of the app touches the runtime.
  void import('./autopilot').then((m) => m.ensureAutopilot());

  // Warm the store once on boot (populate dashboard), then keep producing.
  if (!globalThis.__realtomaticSeeding) {
    globalThis.__realtomaticSeeding = ensureSeeded().catch(() => {
      globalThis.__realtomaticSeeding = undefined; // retry next boot
    });
  }

  // First cycle shortly after boot so the demo is alive by the time someone
  // opens the dashboard; then keep producing on the interval.
  setTimeout(() => {
    void runFabricatorCycle();
  }, 8_000);

  globalThis.__realtomaticFabricatorTimer = setInterval(() => {
    void runFabricatorCycle();
  }, FABRICATOR_INTERVAL_MS);
}

/** Pull the most recent artifact usable as input for a given mission. */
export function latestArtifact(kind: GeneratedArtifact['kind']): GeneratedArtifact | undefined {
  return [...getState().artifacts].reverse().find((a) => a.kind === kind);
}

/**
 * The most recent *source* artifact for a mission — i.e. raw input, not the
 * output an agent already produced from it.
 *
 * This matters for lease documents: an abstract is also kind
 * 'lease-document', so `latestArtifact` would hand the Lease Abstractor its
 * own previous abstract, producing chains of abstracts with drifting
 * confidence. Raw documents carry `documentText`; abstracts carry `clauses`.
 */
export function latestSourceArtifact(
  kind: GeneratedArtifact['kind']
): GeneratedArtifact | undefined {
  const all = [...getState().artifacts].reverse();
  if (kind === 'lease-document') {
    return all.find((a) => {
      if (a.kind !== kind) return false;
      const p = a.payload as Record<string, unknown>;
      const isAbstract = Array.isArray(p.clauses) && p.clauses.length > 0;
      return !isAbstract;
    });
  }
  return all.find((a) => a.kind === kind);
}
