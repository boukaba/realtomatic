import { sseResponse } from '@/lib/sse';
import { runInSession, startTaskSession, isLlmAvailable, getLlmHealth, llmBackend, llmBackendLabel } from '@/lib/llm';
import { withLlmSlot } from '@/lib/llm-queue';
import { pushActivity } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Chat with the Realtomatic assistant. Conversations map 1:1 to LLM sessions
 * so context persists across turns; replies stream token-by-token over SSE.
 * The backend is whatever `REALTOMATIC_LLM_BACKEND` selects — the local
 * OpenCode server by default, or a direct OpenAI-compatible endpoint.
 */

const ASSISTANT_SYSTEM = `You are Realtomatic Assistant, the AI copilot embedded in the Realtomatic commercial real estate platform. You help portfolio managers, asset managers, and leasing teams reason about leases, valuations, markets, tenants, and workflows.

You have deep CRE fluency: NNN vs gross structures, CAM caps, co-tenancy kicks, WALT, cap rate mechanics, absorption, LL97-style ordinances, estoppels and SNDA mechanics. Use it naturally — never lecture.

Style rules:
- Answer like a sharp colleague: direct, concrete, numerate. Short paragraphs.
- When numbers matter, show the quick math.
- Reference the platform's agents (Lease Abstractor, Valuation Engine, Market Intelligence, Atlas data fabric, etc.) when suggesting how to get something done.
- If asked what you are or how you work: you run on isolated agent infrastructure with real LLM inference; keep it brief and confident.
- Never output markdown tables unless asked. Prefer tight prose and short lists.
- Before answering, think out loud in 2-5 short lines, each starting with "▸ " (e.g. "▸ Checking what a CAM cap typically covers…"). A human watches these stream live, so keep them concrete and in order. Then give the answer.`;

type SessionMap = Map<string, { sessionId: string; backend: string; createdAt: number }>;

declare global {
  var __realtomaticChatSessions: SessionMap | undefined;
}

function sessions(): SessionMap {
  if (!globalThis.__realtomaticChatSessions) {
    globalThis.__realtomaticChatSessions = new Map();
  }
  return globalThis.__realtomaticChatSessions;
}

export async function POST(request: Request) {
  const llmUp = await isLlmAvailable();
  if (!llmUp) {
    const hint =
      llmBackend() === 'openai'
        ? 'check REALTOMATIC_OPENAI_BASE_URL, REALTOMATIC_OPENAI_API_KEY and REALTOMATIC_OPENAI_MODEL'
        : 'check that the `opencode` binary is installed and authenticated';
    return Response.json(
      { error: `LLM backend unavailable — ${hint}.` },
      { status: 503 }
    );
  }

  let conversationId: string | undefined;
  let message: string | undefined;
  try {
    const body = await request.json();
    conversationId = typeof body?.conversationId === 'string' ? body.conversationId : undefined;
    message = typeof body?.message === 'string' ? body.message.trim() : undefined;
  } catch {
    // fallthrough
  }

  if (!message) {
    return Response.json({ error: 'message is required' }, { status: 400 });
  }

  const chatId = conversationId || `chat-${Date.now()}`;

  return sseResponse(async (send, close) => {
    send({ type: 'meta', conversationId: chatId, backend: llmBackend(), label: llmBackendLabel() });

    let llmSessionId: string;
    const existing = sessions().get(chatId);
    if (existing?.sessionId && existing.backend === llmBackend()) {
      // Reuse the backend session — full multi-turn context.
      llmSessionId = existing.sessionId;
    } else {
      const { sessionId, backend } = await startTaskSession(`Chat — ${chatId}`, ASSISTANT_SYSTEM);
      sessions().set(chatId, { sessionId, backend, createdAt: Date.now() });
      llmSessionId = sessionId;
      send({ type: 'log', line: `session opened · ${sessionId.slice(0, 8)} · ${llmBackendLabel()}` });
    }

    // Bound the registry so long demo sessions don't leak.
    if (sessions().size > 60) {
      const oldest = [...sessions().entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest) sessions().delete(oldest[0]);
    }

    let full = '';
    // Heartbeat so long waits feel alive on providers that stream coarsely.
    const inferStarted = Date.now();
    const heartbeat = setInterval(() => {
      const s = Math.round((Date.now() - inferStarted) / 1000);
      send({ type: 'log', line: `thinking… ${s}s elapsed` });
    }, 15000);
    let result: Awaited<ReturnType<typeof runInSession>>;
    try {
      result = await withLlmSlot(() =>
        runInSession(llmSessionId, ASSISTANT_SYSTEM, message, (chunk) => {
          full += chunk;
          send({ type: 'delta', text: chunk });
        })
      );
    } finally {
      clearInterval(heartbeat);
    }

    pushActivity({
      type: 'chat',
      agentName: 'Realtomatic Assistant',
      title: 'Chat exchange completed',
      detail: `${result.meta.outputTokens} tokens · ${result.meta.latencyMs}ms · ${result.meta.model}`,
    });

    send({
      type: 'done',
      content: result.text || full,
      model: result.meta.model,
      backend: llmBackend(),
      label: llmBackendLabel(),
      tokens: { input: result.meta.inputTokens, output: result.meta.outputTokens },
      latencyMs: result.meta.latencyMs,
    });
    close();
  });
}

/** Health probe for the chat UI: is the configured backend reachable? */
export async function GET() {
  const health = await getLlmHealth();
  return Response.json(health, { status: health.ok ? 200 : 503 });
}
