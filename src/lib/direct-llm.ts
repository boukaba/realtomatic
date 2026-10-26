/**
 * Direct OpenAI-compatible LLM backend.
 *
 * The demo normally talks to a local OpenCode server (see `opencode.ts`).
 * Setting `REALTOMATIC_LLM_BACKEND=openai` switches every agent run, Atlas
 * synthesis cycle, workflow step, and chat turn to a plain HTTP
 * `POST {baseUrl}/chat/completions` endpoint instead. No SDK is required, so
 * this works with OpenAI, OpenRouter, vLLM, Ollama, LM Studio, LiteLLM, and
 * anything else that speaks the OpenAI chat API.
 *
 * Configuration (all server-side env vars):
 *   REALTOMATIC_LLM_BACKEND=openai
 *   REALTOMATIC_OPENAI_BASE_URL=https://api.openai.com/v1
 *   REALTOMATIC_OPENAI_API_KEY=sk-...
 *   REALTOMATIC_OPENAI_MODEL=gpt-4o-mini           (comma-separated fallbacks OK)
 *
 * Standard `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `OPENAI_MODEL` are also
 * accepted, so an existing OpenAI setup works without renaming anything.
 */

type ChatRole = 'system' | 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type DirectTaskMeta = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
  sessionId: string;
};

export type DirectTaskResult = {
  text: string;
  meta: DirectTaskMeta;
};

type DirectConfig = {
  baseUrl: string;
  apiKey: string;
  models: string[];
  temperature: number;
  maxTokens?: number;
  maxTokensField: 'max_tokens' | 'max_completion_tokens';
  timeoutMs: number;
  headers: Record<string, string>;
  reasoningEffort?: string;
  streamUsage: boolean;
  streamReasoning: boolean;
  historyMessages: number;
  historyChars: number;
};

type DirectSession = {
  id: string;
  title: string;
  system: string;
  messages: ChatMessage[];
  createdAt: number;
  lastUsed: number;
};

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 150_000;
const DEFAULT_HISTORY_MESSAGES = 30;
const DEFAULT_HISTORY_CHARS = 60_000;
const MODEL_COOLDOWN_MS = 10 * 60_000;
const MAX_SESSIONS = 60;

let lastGoodModel: string | null = null;
const modelCooldownUntil = new Map<string, number>();

declare global {
  var __realtomaticDirectSessions: Map<string, DirectSession> | undefined;
}

function sessions(): Map<string, DirectSession> {
  if (!globalThis.__realtomaticDirectSessions) {
    globalThis.__realtomaticDirectSessions = new Map();
  }
  return globalThis.__realtomaticDirectSessions;
}

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function numberEnv(name: string, fallback: number, { allowZero = false } = {}): number {
  const raw = envValue(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  if (value < 0) return fallback;
  if (value === 0 && !allowZero) return fallback;
  return value;
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

function chatEndpoint(baseUrl: string): string {
  return baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
}

function modelsEndpoint(baseUrl: string): string {
  const suffix = '/chat/completions';
  return baseUrl.endsWith(suffix)
    ? `${baseUrl.slice(0, -suffix.length)}/models`
    : `${baseUrl}/models`;
}

function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    );
  } catch {
    return {};
  }
}

function directConfig(): DirectConfig {
  const baseUrl = normalizeBaseUrl(
    envValue('REALTOMATIC_OPENAI_BASE_URL', 'OPENAI_BASE_URL') ?? DEFAULT_BASE_URL
  );
  const modelsRaw =
    envValue('REALTOMATIC_OPENAI_MODEL', 'OPENAI_MODEL') ?? DEFAULT_MODEL;
  const models = [...new Set(modelsRaw.split(',').map((m) => m.trim()).filter(Boolean))];
  const maxTokensRaw = envValue('REALTOMATIC_OPENAI_MAX_TOKENS');

  return {
    baseUrl,
    apiKey: envValue('REALTOMATIC_OPENAI_API_KEY', 'OPENAI_API_KEY') ?? '',
    models,
    temperature: numberEnv('REALTOMATIC_OPENAI_TEMPERATURE', 0.7, { allowZero: true }),
    maxTokens: maxTokensRaw ? Number(maxTokensRaw) || undefined : undefined,
    maxTokensField:
      envValue('REALTOMATIC_OPENAI_MAX_TOKENS_FIELD') === 'max_completion_tokens'
        ? 'max_completion_tokens'
        : 'max_tokens',
    timeoutMs: numberEnv('REALTOMATIC_OPENAI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    headers: parseHeaders(envValue('REALTOMATIC_OPENAI_HEADERS')),
    reasoningEffort: envValue('REALTOMATIC_OPENAI_REASONING_EFFORT'),
    streamUsage: envValue('REALTOMATIC_OPENAI_STREAM_USAGE') !== '0',
    streamReasoning: envValue('REALTOMATIC_OPENAI_STREAM_REASONING') === '1',
    historyMessages: numberEnv(
      'REALTOMATIC_OPENAI_HISTORY_MESSAGES',
      DEFAULT_HISTORY_MESSAGES
    ),
    historyChars: numberEnv('REALTOMATIC_OPENAI_HISTORY_CHARS', DEFAULT_HISTORY_CHARS),
  };
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

function isHostedOpenAi(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'openai.com' || host.endsWith('.openai.com');
  } catch {
    return false;
  }
}

function isCoolingDown(model: string): boolean {
  const until = modelCooldownUntil.get(model);
  return until !== undefined && Date.now() < until;
}

function modelOrder(cfg: DirectConfig): string[] {
  const base =
    lastGoodModel && cfg.models.includes(lastGoodModel)
      ? [lastGoodModel, ...cfg.models]
      : cfg.models;
  const unique = [...new Set(base)];
  const warm = unique.filter((model) => !isCoolingDown(model));
  // Never return an empty list — if everything is cooling down, try them all.
  return warm.length > 0 ? warm : unique;
}

function handleModelFailure(model: string): void {
  modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
}

function handleModelSuccess(model: string): void {
  lastGoodModel = model;
  modelCooldownUntil.delete(model);
}

/** True when the direct backend has enough configuration to attempt a call. */
export function isDirectLlmConfigured(): boolean {
  const cfg = directConfig();
  if (!cfg.models.length || !cfg.baseUrl) return false;
  try {
    new URL(cfg.baseUrl);
  } catch {
    return false;
  }
  // A remote OpenAI endpoint without a key can only fail; local compatible
  // servers (Ollama, LM Studio, vLLM) usually accept an empty key.
  if (!cfg.apiKey && isHostedOpenAi(cfg.baseUrl)) return false;
  return true;
}

/** Human-readable backend label used by the UI and errors. */
export function directLlmLabel(): string {
  const cfg = directConfig();
  const model = cfg.models[0] ?? 'no model';
  return `${model} · ${hostOf(cfg.baseUrl)}`;
}

/** Cheap config/endpoint probe for the chat UI. */
export async function directLlmHealth(): Promise<{
  ok: boolean;
  label: string;
  detail: string;
  model?: string;
}> {
  const cfg = directConfig();
  const label = directLlmLabel();
  const model = cfg.models[0];

  if (!cfg.models.length) {
    return { ok: false, label, detail: 'REALTOMATIC_OPENAI_MODEL is not set' };
  }
  if (!isDirectLlmConfigured()) {
    return {
      ok: false,
      label,
      model,
      detail: 'REALTOMATIC_OPENAI_API_KEY (or OPENAI_API_KEY) is required for api.openai.com',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(modelsEndpoint(cfg.baseUrl), {
      method: 'GET',
      headers: requestHeaders(cfg),
      signal: controller.signal,
      cache: 'no-store',
    });
    // Many compatible servers do not implement /models. A 404/405 still means
    // the host is reachable, so treat it as configured rather than broken.
    if (res.ok || res.status === 404 || res.status === 405) {
      return { ok: true, label, model, detail: `Configured for ${label}` };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        label,
        model,
        detail: `Endpoint rejected credentials (${res.status})`,
      };
    }
    return {
      ok: true,
      label,
      model,
      detail: `Endpoint responded ${res.status}; requests may still succeed`,
    };
  } catch (error) {
    return {
      ok: false,
      label,
      model,
      detail: `Cannot reach ${cfg.baseUrl}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function requestHeaders(cfg: DirectConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    ...cfg.headers,
  };
}

function requestBody(
  cfg: DirectConfig,
  model: string,
  messages: ChatMessage[],
  stream: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: cfg.temperature,
    stream,
  };
  if (cfg.maxTokens !== undefined) body[cfg.maxTokensField] = cfg.maxTokens;
  if (cfg.reasoningEffort) body.reasoning_effort = cfg.reasoningEffort;
  if (stream && cfg.streamUsage) body.stream_options = { include_usage: true };
  return body;
}

function contentToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

function readCompletion(
  json: Record<string, unknown>,
  fallbackModel: string
): {
  text: string;
  inputTokens: number;
  outputTokens: number;
  finishReason: string;
  model: string;
} {
  const choices = Array.isArray(json.choices) ? json.choices : [];
  const choice = (choices[0] ?? {}) as Record<string, unknown>;
  const message = (choice.message ?? {}) as Record<string, unknown>;
  const usage = (json.usage ?? {}) as Record<string, unknown>;
  return {
    text: contentToString(message.content),
    inputTokens: Number(usage.prompt_tokens ?? 0) || 0,
    outputTokens: Number(usage.completion_tokens ?? 0) || 0,
    finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : 'stop',
    model: typeof json.model === 'string' ? json.model : fallbackModel,
  };
}

type CompletionResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  finishReason: string;
  model: string;
};

async function readStream(
  body: ReadableStream<Uint8Array>,
  cfg: DirectConfig,
  fallbackModel: string,
  onDelta?: (chunk: string) => void
): Promise<CompletionResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let finishReason = 'stop';

  const handleLine = (rawLine: string) => {
    const line = rawLine.replace(/\r$/, '');
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return;
    }

    if (json.error) {
      const err = json.error;
      throw new Error(
        typeof err === 'string'
          ? err
          : typeof (err as { message?: unknown }).message === 'string'
            ? String((err as { message: string }).message)
            : 'LLM stream returned an error'
      );
    }

    const usage = json.usage as Record<string, unknown> | undefined;
    if (usage) {
      inputTokens = Number(usage.prompt_tokens ?? inputTokens) || 0;
      outputTokens = Number(usage.completion_tokens ?? outputTokens) || 0;
    }

    const choices = Array.isArray(json.choices) ? json.choices : [];
    const choice = (choices[0] ?? {}) as Record<string, unknown>;
    if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason;
    const delta = (choice.delta ?? {}) as Record<string, unknown>;
    const message = (choice.message ?? {}) as Record<string, unknown>;
    const content = contentToString(delta.content) || contentToString(message.content);
    if (content) {
      text += content;
      onDelta?.(content);
    }
    if (cfg.streamReasoning) {
      const reasoning =
        contentToString(delta.reasoning_content) || contentToString(delta.reasoning);
      // Reasoning is shown while it streams but not folded into `text`: the
      // mission prompts emit the JSON contract in the answer, and mixing
      // chain-of-thought into it would make extraction less reliable.
      if (reasoning) onDelta?.(reasoning);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  if (buffer.trim()) {
    for (const line of buffer.split('\n')) handleLine(line);
  }

  return { text, inputTokens, outputTokens, finishReason, model: fallbackModel };
}

async function requestCompletion(
  cfg: DirectConfig,
  model: string,
  messages: ChatMessage[],
  stream: boolean,
  onDelta?: (chunk: string) => void
): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  let body = requestBody(cfg, model, messages, stream);

  try {
    let res = await fetch(chatEndpoint(cfg.baseUrl), {
      method: 'POST',
      headers: requestHeaders(cfg),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    // Some compatible gateways reject `stream_options`. Retry once without it
    // rather than failing an otherwise valid endpoint.
    if (!res.ok && stream && body.stream_options && res.status === 400) {
      body = { ...body };
      delete body.stream_options;
      res = await fetch(chatEndpoint(cfg.baseUrl), {
        method: 'POST',
        headers: requestHeaders(cfg),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `${hostOf(cfg.baseUrl)} returned ${res.status} ${res.statusText}${
          detail ? ` — ${detail.slice(0, 300)}` : ''
        }`
      );
    }

    const contentType = res.headers.get('content-type') ?? '';
    // A provider that ignores `stream: true` and returns one JSON body is
    // handled transparently.
    if (!contentType.includes('text/event-stream') && contentType.includes('application/json')) {
      const json = (await res.json()) as Record<string, unknown>;
      return readCompletion(json, model);
    }

    if (!res.body) throw new Error('LLM endpoint returned no response body');
    return await readStream(res.body, cfg, model, onDelta);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `model call (${model}) timed out after ${Math.round(cfg.timeoutMs / 1000)}s`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function completeWithFallback(
  _title: string,
  system: string,
  prompt: string,
  stream: boolean,
  onDelta?: (chunk: string) => void
): Promise<DirectTaskResult> {
  const cfg = directConfig();
  if (!cfg.models.length) {
    throw new Error('REALTOMATIC_OPENAI_MODEL is not set');
  }
  if (!cfg.apiKey && isHostedOpenAi(cfg.baseUrl)) {
    throw new Error(
      'REALTOMATIC_OPENAI_API_KEY (or OPENAI_API_KEY) is required for api.openai.com'
    );
  }

  const messages: ChatMessage[] = [];
  if (system.trim()) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  let lastError: Error | null = null;

  for (const model of modelOrder(cfg)) {
    const started = Date.now();
    const sessionId = `direct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let received = false;

    try {
      const result = await requestCompletion(cfg, model, messages, stream, (chunk) => {
        received = true;
        onDelta?.(chunk);
      });
      const text = result.text.trim();
      if (!text) {
        lastError = new Error(`${model} returned an empty response`);
        handleModelFailure(model);
        if (received) throw lastError;
        continue;
      }

      handleModelSuccess(model);
      return {
        text,
        meta: {
          model: result.model || model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost: 0,
          latencyMs: Date.now() - started,
          sessionId,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      handleModelFailure(model);
      // Never restart a stream after the operator has already seen tokens.
      if (received) throw lastError;
    }
  }

  throw lastError ?? new Error('No OpenAI-compatible model available');
}

/** One-shot, non-streamed agent task. */
export async function runDirectAgentText(
  title: string,
  system: string,
  prompt: string
): Promise<DirectTaskResult> {
  return completeWithFallback(title, system, prompt, false);
}

/** One-shot agent task with token deltas. */
export async function streamDirectAgentText(
  title: string,
  system: string,
  prompt: string,
  onDelta: (chunk: string) => void
): Promise<DirectTaskResult> {
  return completeWithFallback(title, system, prompt, true, onDelta);
}

function pruneSessions(store: Map<string, DirectSession>): void {
  if (store.size <= MAX_SESSIONS) return;
  const oldest = [...store.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [id] of oldest.slice(0, store.size - MAX_SESSIONS)) {
    store.delete(id);
  }
}

/** Create a persisted (in-process) conversation for the chat assistant. */
export function startDirectSession(title: string, system: string): string {
  const store = sessions();
  const id = `direct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  store.set(id, {
    id,
    title,
    system,
    messages: [],
    createdAt: Date.now(),
    lastUsed: Date.now(),
  });
  pruneSessions(store);
  return id;
}

export function resetDirectSession(sessionId: string): void {
  sessions().delete(sessionId);
}

function trimHistory(messages: ChatMessage[], cfg: DirectConfig): ChatMessage[] {
  const sliced =
    messages.length > cfg.historyMessages
      ? messages.slice(-cfg.historyMessages)
      : messages;
  const out: ChatMessage[] = [];
  let chars = 0;
  for (let i = sliced.length - 1; i >= 0; i--) {
    const message = sliced[i];
    if (out.length > 0 && chars + message.content.length > cfg.historyChars) break;
    chars += message.content.length;
    out.unshift(message);
  }
  return out;
}

/**
 * Multi-turn chat against the direct backend. Conversation history lives in
 * memory keyed by the session id returned from `startDirectSession`; if the
 * server restarts, the next turn simply starts a fresh history.
 */
export async function runDirectInSession(
  sessionId: string,
  system: string,
  prompt: string,
  onDelta: (chunk: string) => void
): Promise<DirectTaskResult> {
  const cfg = directConfig();
  if (!cfg.models.length) {
    throw new Error('REALTOMATIC_OPENAI_MODEL is not set');
  }
  if (!cfg.apiKey && isHostedOpenAi(cfg.baseUrl)) {
    throw new Error(
      'REALTOMATIC_OPENAI_API_KEY (or OPENAI_API_KEY) is required for api.openai.com'
    );
  }

  const store = sessions();
  let session = store.get(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      title: 'Chat',
      system,
      messages: [],
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };
    store.set(sessionId, session);
    pruneSessions(store);
  }
  if (system.trim()) session.system = system;

  session.messages.push({ role: 'user', content: prompt });
  const history = trimHistory(session.messages, cfg);
  const messages: ChatMessage[] = [];
  if (session.system.trim()) messages.push({ role: 'system', content: session.system });
  messages.push(...history);

  let lastError: Error | null = null;

  for (const model of modelOrder(cfg)) {
    const started = Date.now();
    let received = false;

    try {
      const result = await requestCompletion(cfg, model, messages, true, (chunk) => {
        received = true;
        onDelta(chunk);
      });
      const text = result.text.trim();
      if (!text) {
        lastError = new Error(`${model} returned an empty response`);
        handleModelFailure(model);
        if (received) throw lastError;
        continue;
      }

      handleModelSuccess(model);
      session.messages.push({ role: 'assistant', content: text });
      session.lastUsed = Date.now();
      return {
        text,
        meta: {
          model: result.model || model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost: 0,
          latencyMs: Date.now() - started,
          sessionId,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      handleModelFailure(model);
      if (received) throw lastError;
    }
  }

  // Nothing was answered — drop the user turn so a retry does not duplicate it.
  if (session.messages[session.messages.length - 1]?.role === 'user') {
    session.messages.pop();
  }
  throw lastError ?? new Error('No OpenAI-compatible model available');
}
