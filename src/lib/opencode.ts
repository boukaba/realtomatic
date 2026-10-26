import { createOpencodeClient } from '@opencode-ai/sdk/client';

/**
 * OpenCode runtime — the "model backend" of the demo.
 *
 * A single opencode server process backs every agent in the demo. It is
 * spawned once (on a fixed port so restarts reuse it) and every agent task
 * runs as an opencode session against free models, so the demo needs no API
 * keys.
 *
 * Free tiers enforce per-model quotas and a throttled model *hangs* rather
 * than erroring. Two safeguards make the team resilient:
 *   1. Model fallback — try the preferred model, then walk a fallback list.
 *   2. Fresh session per attempt — opencode processes prompts sequentially,
 *      so a hung request would block the next model on the same session.
 */


/**
 * Default runtime: OpenCode Go with DeepSeek V4.1 Flash.
 *
 * Chosen because it balances speed and quality for a live demo — roughly 4s
 * on short calls and ~20s on full agent tasks, with no free-tier throttling.
 * Both the provider and the model can be overridden per environment:
 *
 *   OPENCODE_PROVIDER_ID=opencode next dev        (Zen free tier)
 *   REALTOMATIC_MODEL=gpt-6-luna next dev         (any Go model)
 *   npm run dev:free                              (convenience script)
 */
export const DEFAULT_PROVIDER = 'opencode-go';
export const DEFAULT_MODEL = 'deepseek-v4.1-flash';

/** Zen's free tier — used only when the provider is explicitly set to it. */
const FREE_MODEL_FALLBACKS = [
  'nemotron-3.5-lightning-free',
  'muse-spark-1.3-contributor-free',
  'ling-3.1-flash-free',
  'space-bunny-free',
  'mimo-v2.6-flash-free',
];

/** OpenCode Go — paid models. Ordered best-first for fallback. */
const GO_MODEL_FALLBACKS = [
  'deepseek-v4.1-flash',
  'deepseek-v4-flash',
  'longcat-2.5-preview-free',
  'step-5-preview-free',
];

const MODEL_FALLBACKS_BY_PROVIDER: Record<string, string[]> = {
  opencode: FREE_MODEL_FALLBACKS,
  'opencode-go': GO_MODEL_FALLBACKS,
};

const DEFAULT_MODEL_FALLBACKS = GO_MODEL_FALLBACKS;

// Fixed port so a restarted dev server reuses the opencode server it spawned
// last time instead of leaking a new one per restart.
const SPAWN_PORT = Number(process.env.REALTOMATIC_OPENCODE_PORT || 4098);

// Hard ceiling on a single model call. Without this a stuck call would hold
// an LLM slot forever and stall the whole team.
const PROMPT_TIMEOUT_MS = Number(process.env.REALTOMATIC_PROMPT_TIMEOUT_MS || 150_000);

// How long to wait on a candidate model before trying the next one. Long
// enough for a cold start, short enough that a throttled model is skipped
// without stalling the operator.
const PROBE_TIMEOUT_MS = Number(process.env.REALTOMATIC_PROBE_TIMEOUT_MS || 30_000);

// Circuit breaker: skip a model that recently timed out or errored, so we
// don't pay the timeout penalty on every call.
const MODEL_COOLDOWN_MS = 10 * 60_000;
const modelCooldownUntil = new Map<string, number>();

let lastGoodModel: string | null = null;

function isCoolingDown(modelID: string): boolean {
  const until = modelCooldownUntil.get(modelID);
  return until !== undefined && Date.now() < until;
}

function preferredProvider(): string {
  return process.env.OPENCODE_PROVIDER_ID || DEFAULT_PROVIDER;
}

function modelFallbacks(): string[] {
  return MODEL_FALLBACKS_BY_PROVIDER[preferredProvider()] ?? DEFAULT_MODEL_FALLBACKS;
}

// Optional reasoning effort passed to the provider via model options.
// Defaults to "low" for demo latency. Note: DeepSeek V4.1 Flash on this
// gateway is already light (~250 reasoning tokens) and ignores this setting,
// but providers that honor it will respect the preference.
const REASONING_EFFORT = process.env.REALTOMATIC_REASONING || 'low';

function defaultModel(): string {
  return modelFallbacks()[0];
}

function preferredModel(): string {
  return process.env.REALTOMATIC_MODEL || defaultModel();
}

/** Human-readable label for the UI and health probes. */
export function opencodeLlmLabel(): string {
  return `${preferredModel()} · OpenCode (${preferredProvider()})`;
}

/** The model the OpenCode backend will try first. */
export function opencodePreferredModel(): string {
  return preferredModel();
}

function modelOrder(): string[] {
  const preferred = preferredModel();
  const fallbacks = modelFallbacks();
  const base =
    lastGoodModel && lastGoodModel !== preferred
      ? [lastGoodModel, preferred, ...fallbacks]
      : [preferred, ...fallbacks];
  const unique = [...new Set(base)];
  const warm = unique.filter((m) => !isCoolingDown(m));
  // Never return an empty list — if everything is cooling down, try them all.
  return warm.length > 0 ? warm : unique;
}

/**
 * Applies model options (e.g. reasoning effort) to the runtime. The provider
 * only accepts these through opencode config, so we PATCH it once at boot.
 * Non-fatal: a runtime that rejects the config still serves requests.
 */
async function applyModelConfig(client: OpencodeClientType): Promise<void> {
  if (!REASONING_EFFORT) return;
  try {
    await client.config.update({
      body: {
        provider: {
          [preferredProvider()]: {
            models: Object.fromEntries(
              modelFallbacks().map((modelID) => [
                modelID,
                { options: { reasoningEffort: REASONING_EFFORT } },
              ])
            ),
          },
        },
      },
    });
  } catch {
    // Ignore — running without the option is better than failing to boot.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

type OpencodeClientType = ReturnType<typeof createOpencodeClient>;

type Runtime = {
  client: OpencodeClientType;
  serverUrl: string;
  server: { close(): void } | null;
  healthy: boolean;
};

declare global {
  var __realtomaticOpencode: Promise<Runtime> | undefined;
}

function tryConnect(baseUrl: string, timeoutMs = 1500): Promise<OpencodeClientType | null> {
  const client = createOpencodeClient({ baseUrl, throwOnError: false });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(`${baseUrl}/project/current`, { signal: controller.signal })
    .then((res) => (res.ok ? client : null))
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

async function startRuntime(): Promise<Runtime> {
  // 1. Explicit override → connect only.
  const overrideUrl = process.env.OPENCODE_SERVER_URL;
  if (overrideUrl) {
    const client = await tryConnect(overrideUrl);
    if (client) return { client, serverUrl: overrideUrl, server: null, healthy: true };
    throw new Error(`OPENCODE_SERVER_URL is set but no server answers at ${overrideUrl}`);
  }

  // 2. An opencode serve may already be running on the default port.
  const reused = await tryConnect('http://127.0.0.1:4096');
  if (reused) {
    return { client: reused, serverUrl: 'http://127.0.0.1:4096', server: null, healthy: true };
  }

  // 2b. Reuse a server we spawned on a previous run (survives restarts).
  const ourPort = `http://127.0.0.1:${SPAWN_PORT}`;
  const previous = await tryConnect(ourPort);
  if (previous) {
    return { client: previous, serverUrl: ourPort, server: null, healthy: true };
  }

  // 3. Spawn our own server on a fixed port so the next restart reuses it.
  const { createOpencodeServer } = await import('@opencode-ai/sdk/server');
  const server = await createOpencodeServer({
    hostname: '127.0.0.1',
    port: SPAWN_PORT,
  });
  const client = createOpencodeClient({ baseUrl: server.url, throwOnError: true });
  return { client, serverUrl: server.url, server, healthy: true };
}

export function getRuntime(): Promise<Runtime> {
  if (!globalThis.__realtomaticOpencode) {
    globalThis.__realtomaticOpencode = startRuntime()
      .then(async (runtime) => {
        await applyModelConfig(runtime.client);
        return runtime;
      })
      .catch((error) => {
        // Do not cache failures — the next call retries (e.g. binary PATH fixed).
        globalThis.__realtomaticOpencode = undefined;
        throw error;
      });
  }
  return globalThis.__realtomaticOpencode;
}

export async function isOpencodeAvailable(): Promise<boolean> {
  try {
    await getRuntime();
    return true;
  } catch {
    return false;
  }
}

export type AgentTaskMeta = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
  sessionId: string;
};

export type AgentTaskResult = {
  text: string;
  meta: AgentTaskMeta;
};

function extractText(parts: unknown): string {
  return ((parts ?? []) as Array<{ type: string; text?: string }>)
    .filter((p) => p.type === 'text')
    .map((p) => p.text || '')
    .join('')
    .trim();
}

type PromptResponse = {
  data?: {
    parts?: unknown;
    info?: { tokens?: { input?: number; output?: number }; cost?: number; modelID?: string };
  };
  error?: unknown;
};

/** Create a session and prime it with the agent's mission. */
async function createSession(
  client: OpencodeClientType,
  title: string,
  system: string,
  modelID: string,
  skipBriefing = false
): Promise<string> {
  const session = await client.session.create({ body: { title } });
  if (!session.data?.id) throw new Error('Failed to create opencode session');
  const sessionId = session.data.id;

  // The briefing keeps a session in character for multi-turn work. For
  // single-shot interactive calls it's a wasted LLM round trip, so callers
  // that need speed skip it.
  if (skipBriefing) return sessionId;

  try {
    await withTimeout(
      client.session.prompt({
        path: { id: sessionId },
        body: {
          model: { providerID: preferredProvider(), modelID },
          system,
          noReply: true,
          parts: [
            {
              type: 'text',
              text: 'Mission briefing acknowledged. You are operating in a live production demo. Respond with production-grade output only.',
            },
          ],
        },
      }),
      10_000,
      'session briefing'
    );
  } catch {
    // Ignore.
  }
  return sessionId;
}

function handleModelFailure(modelID: string): void {
  modelCooldownUntil.set(modelID, Date.now() + MODEL_COOLDOWN_MS);
}

function handleModelSuccess(modelID: string): void {
  lastGoodModel = modelID;
  modelCooldownUntil.delete(modelID);
}

/**
 * Runs one prompt with automatic model fallback. Each attempt gets a FRESH
 * session: opencode serves a session's prompts sequentially, so retrying on
 * the same session behind a hung request would also hang.
 */
async function promptWithFallback(
  title: string,
  system: string,
  prompt: string
): Promise<AgentTaskResult> {
  const { client } = await getRuntime();
  const order = modelOrder();
  let lastError: Error | null = null;

  for (let i = 0; i < order.length; i++) {
    const modelID = order[i];
    const isLast = i === order.length - 1;
    const attemptTimeout = isLast ? PROMPT_TIMEOUT_MS : PROBE_TIMEOUT_MS;
    const started = Date.now();

    try {
      const sessionId = await createSession(client, title, system, modelID);
      const result = (await withTimeout(
        client.session.prompt({
          path: { id: sessionId },
          body: {
            model: { providerID: preferredProvider(), modelID },
            system,
            parts: [{ type: 'text', text: prompt }],
          },
        }),
        attemptTimeout,
        `model call (${modelID})`
      )) as PromptResponse;

      const text = extractText(result.data?.parts);
      if (!text) {
        lastError = new Error(`${modelID} returned an empty response`);
        handleModelFailure(modelID);
        continue;
      }

      handleModelSuccess(modelID);
      const info = result.data?.info;
      return {
        text,
        meta: {
          model: info?.modelID || modelID,
          inputTokens: info?.tokens?.input ?? 0,
          outputTokens: info?.tokens?.output ?? 0,
          cost: info?.cost ?? 0,
          latencyMs: Date.now() - started,
          sessionId,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      handleModelFailure(modelID);
      // Move on to the next model with a clean session.
    }
  }

  throw lastError ?? new Error('No model available');
}

export async function startTaskSession(
  title: string,
  system: string
): Promise<{ client: OpencodeClientType; sessionId: string }> {
  const { client } = await getRuntime();
  const modelID = lastGoodModel && !isCoolingDown(lastGoodModel) ? lastGoodModel : preferredModel();
  const sessionId = await createSession(client, title, system, modelID);
  return { client, sessionId };
}

export async function runAgentText(
  title: string,
  system: string,
  prompt: string
): Promise<AgentTaskResult> {
  return promptWithFallback(title, system, prompt);
}

export function extractJsonObject(raw: string): unknown {
  const cleaned = raw
    .replace(/```json/gi, '```')
    .split('```')
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const candidates = [raw, ...cleaned];
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      continue;
    }
  }
  throw new Error('No parsable JSON object in model output');
}

export async function runAgentJson<T>(
  title: string,
  system: string,
  prompt: string,
  validate: (value: unknown) => T
): Promise<{ data: T; meta: AgentTaskMeta }> {
  const result = await promptWithFallback(title, system, prompt);

  try {
    return { data: validate(extractJsonObject(result.text)), meta: result.meta };
  } catch {
    // One self-repair turn — models recover cleanly. Fresh call, fresh session.
    const repair = await promptWithFallback(
      `${title} — repair`,
      system,
      `Your previous reply was not a single valid JSON object matching the requested shape. Reply again with ONLY the JSON object, no prose, no markdown fences.\n\nOriginal request:\n${prompt}`
    );
    return { data: validate(extractJsonObject(repair.text)), meta: repair.meta };
  }
}

/**
 * Streams a task's token deltas. If the first model fails before producing
 * any tokens we fall back to the next model on a new session; once tokens
 * have started we stay put (a mid-stream switch would double the output).
 */
export async function streamAgentText(
  title: string,
  system: string,
  prompt: string,
  onDelta: (chunk: string) => void,
  options: { skipBriefing?: boolean } = {}
): Promise<AgentTaskResult> {
  const { client } = await getRuntime();
  const order = modelOrder();
  let lastError: Error | null = null;

  for (let i = 0; i < order.length; i++) {
    const modelID = order[i];
    const started = Date.now();
    let received = false;

    try {
      const sessionId = await createSession(client, title, system, modelID, options.skipBriefing);
      const events = await client.event.subscribe();
      const streamIterator = events.stream[Symbol.asyncIterator]();

      const pump = (async () => {
        try {
          while (true) {
            const next = await streamIterator.next();
            if (next.done) break;
            const event = next.value as {
              type?: string;
              properties?: {
                sessionID?: string;
                delta?: string;
                part?: { sessionID?: string };
              };
            };
            // Token deltas arrive as `message.part.delta` with sessionID at the
            // top level of properties. (The older `message.part.updated` shape
            // never carries a delta on this provider.)
            if (event?.type === 'message.part.delta') {
              const props = event.properties;
              if (props?.sessionID !== sessionId || !props?.delta) continue;
              received = true;
              onDelta(props.delta);
            } else if (event?.type === 'message.part.updated') {
              const part = event.properties?.part;
              if (part?.sessionID !== sessionId || !event.properties?.delta) continue;
              received = true;
              onDelta(event.properties.delta);
            }
          }
        } catch {
          /* closed */
        }
      })();

      let result: PromptResponse;
      try {
        result = (await withTimeout(
          client.session.prompt({
            path: { id: sessionId },
            body: {
              model: { providerID: preferredProvider(), modelID },
              system,
              parts: [{ type: 'text', text: prompt }],
            },
          }),
          PROMPT_TIMEOUT_MS,
          `model call (${modelID})`
        )) as PromptResponse;
      } finally {
        try {
          await streamIterator.return?.(undefined);
        } catch {
          /* noop */
        }
        void pump;
      }

      const text = extractText(result.data?.parts);
      if (!text) {
        // Nothing usable — retry on the next model only if we streamed nothing.
        lastError = new Error(`${modelID} returned an empty response`);
        handleModelFailure(modelID);
        if (received) throw lastError; // partial output already shown
        continue;
      }

      handleModelSuccess(modelID);
      const info = result.data?.info;
      return {
        text,
        meta: {
          model: info?.modelID || modelID,
          inputTokens: info?.tokens?.input ?? 0,
          outputTokens: info?.tokens?.output ?? 0,
          cost: info?.cost ?? 0,
          latencyMs: Date.now() - started,
          sessionId,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      handleModelFailure(modelID);
      if (received) throw lastError; // don't restart a stream mid-answer
    }
  }

  throw lastError ?? new Error('No model available');
}

/**
 * Streams a prompt into an EXISTING session (multi-turn, e.g. chat) and
 * forwards token deltas through onDelta.
 */
export async function runInSession(
  sessionId: string,
  system: string,
  prompt: string,
  onDelta: (chunk: string) => void
): Promise<AgentTaskResult> {
  const { client } = await getRuntime();
  const modelID =
    lastGoodModel && !isCoolingDown(lastGoodModel) ? lastGoodModel : preferredModel();
  const started = Date.now();

  const events = await client.event.subscribe();
  const streamIterator = events.stream[Symbol.asyncIterator]();

  const pump = (async () => {
    try {
      while (true) {
        const next = await streamIterator.next();
        if (next.done) break;
        const event = next.value as {
          type?: string;
          properties?: {
            sessionID?: string;
            delta?: string;
            part?: { sessionID?: string };
          };
        };
        if (event?.type === 'message.part.delta') {
          const props = event.properties;
          if (props?.sessionID !== sessionId || !props?.delta) continue;
          onDelta(props.delta);
        } else if (event?.type === 'message.part.updated') {
          const part = event.properties?.part;
          if (part?.sessionID !== sessionId || !event.properties?.delta) continue;
          onDelta(event.properties.delta);
        }
      }
    } catch {
      /* closed */
    }
  })();

  try {
    const result = (await withTimeout(
      client.session.prompt({
        path: { id: sessionId },
        body: {
          model: { providerID: preferredProvider(), modelID },
          system,
          parts: [{ type: 'text', text: prompt }],
        },
      }),
      PROMPT_TIMEOUT_MS,
      `model call (${modelID})`
    )) as PromptResponse;

    const text = extractText(result.data?.parts);
    if (text) handleModelSuccess(modelID);
    const info = result.data?.info;
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {
      text,
      meta: {
        model: info?.modelID || modelID,
        inputTokens: info?.tokens?.input ?? 0,
        outputTokens: info?.tokens?.output ?? 0,
        cost: info?.cost ?? 0,
        latencyMs: Date.now() - started,
        sessionId,
      },
    };
  } finally {
    try {
      await streamIterator.return?.(undefined);
    } catch {
      /* noop */
    }
    void pump;
  }
}
