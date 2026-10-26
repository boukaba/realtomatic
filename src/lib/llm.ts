import * as direct from './direct-llm';
import * as opencode from './opencode';

/**
 * LLM backend facade.
 *
 * The app talks to agents through this module, never to a runtime directly.
 * Two backends are supported, selected by `REALTOMATIC_LLM_BACKEND`:
 *
 *   opencode (default) — the local OpenCode server, with its model fallbacks.
 *   openai             — any OpenAI-compatible `/chat/completions` endpoint.
 *
 * Keeping the switch here means every caller (executor, Atlas, workflows,
 * chat) gets the configured backend without knowing which one is active.
 */

export type LlmBackend = 'opencode' | 'openai';

export type AgentTaskMeta = opencode.AgentTaskMeta;
export type AgentTaskResult = opencode.AgentTaskResult;

const OPENAI_ALIASES = new Set([
  'openai',
  'openai-compatible',
  'openai_compatible',
  'openai-compat',
  'direct',
  'http',
]);

/** Which backend the environment asks for. Defaults to OpenCode. */
export function llmBackend(): LlmBackend {
  const raw = (process.env.REALTOMATIC_LLM_BACKEND || 'opencode').trim().toLowerCase();
  return OPENAI_ALIASES.has(raw) ? 'openai' : 'opencode';
}

/** Label safe to show in the UI (model + host/provider). */
export function llmBackendLabel(): string {
  return llmBackend() === 'openai' ? direct.directLlmLabel() : opencode.opencodeLlmLabel();
}

/** Whether the selected backend is configured/reachable enough to run work. */
export async function isLlmAvailable(): Promise<boolean> {
  if (llmBackend() === 'openai') return direct.isDirectLlmConfigured();
  return opencode.isOpencodeAvailable();
}

export type LlmHealth = {
  ok: boolean;
  backend: LlmBackend;
  label: string;
  detail: string;
  model?: string;
  serverUrl?: string;
};

/** Richer probe used by `/api/chat` and the assistant status panel. */
export async function getLlmHealth(): Promise<LlmHealth> {
  if (llmBackend() === 'openai') {
    const health = await direct.directLlmHealth();
    return { ...health, backend: 'openai' };
  }

  try {
    const runtime = await opencode.getRuntime();
    return {
      ok: true,
      backend: 'opencode',
      label: opencode.opencodeLlmLabel(),
      detail: `OpenCode runtime at ${runtime.serverUrl}`,
      model: opencode.opencodePreferredModel(),
      serverUrl: runtime.serverUrl,
    };
  } catch (error) {
    return {
      ok: false,
      backend: 'opencode',
      label: opencode.opencodeLlmLabel(),
      detail: error instanceof Error ? error.message : 'OpenCode runtime unreachable',
    };
  }
}

/** Start a session for multi-turn work (chat). */
export async function startTaskSession(
  title: string,
  system: string
): Promise<{ sessionId: string; backend: LlmBackend }> {
  if (llmBackend() === 'openai') {
    return { sessionId: direct.startDirectSession(title, system), backend: 'openai' };
  }
  const { sessionId } = await opencode.startTaskSession(title, system);
  return { sessionId, backend: 'opencode' };
}

/** One-shot task without streaming. */
export async function runAgentText(
  title: string,
  system: string,
  prompt: string
): Promise<AgentTaskResult> {
  if (llmBackend() === 'openai') return direct.runDirectAgentText(title, system, prompt);
  return opencode.runAgentText(title, system, prompt);
}

/** One-shot task with token deltas. */
export async function streamAgentText(
  title: string,
  system: string,
  prompt: string,
  onDelta: (chunk: string) => void,
  options: { skipBriefing?: boolean } = {}
): Promise<AgentTaskResult> {
  if (llmBackend() === 'openai') {
    return direct.streamDirectAgentText(title, system, prompt, onDelta);
  }
  return opencode.streamAgentText(title, system, prompt, onDelta, options);
}

/** Next turn in an existing session (chat with persistent context). */
export async function runInSession(
  sessionId: string,
  system: string,
  prompt: string,
  onDelta: (chunk: string) => void
): Promise<AgentTaskResult> {
  if (llmBackend() === 'openai') {
    return direct.runDirectInSession(sessionId, system, prompt, onDelta);
  }
  return opencode.runInSession(sessionId, system, prompt, onDelta);
}

export const extractJsonObject = opencode.extractJsonObject;

/**
 * Structured task with one self-repair pass. Backend-agnostic: parse the
 * model's JSON, validate it, and if either fails ask once more for a clean
 * object before surfacing the error.
 */
export async function runAgentJson<T>(
  title: string,
  system: string,
  prompt: string,
  validate: (value: unknown) => T
): Promise<{ data: T; meta: AgentTaskMeta }> {
  const result = await runAgentText(title, system, prompt);

  try {
    return { data: validate(extractJsonObject(result.text)), meta: result.meta };
  } catch {
    const repair = await runAgentText(
      `${title} — repair`,
      system,
      `Your previous reply was not a single valid JSON object matching the requested shape. Reply again with ONLY the JSON object, no prose, no markdown fences.\n\nOriginal request:\n${prompt}`
    );
    return { data: validate(extractJsonObject(repair.text)), meta: repair.meta };
  }
}
