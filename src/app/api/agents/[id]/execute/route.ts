import { sseResponse } from '@/lib/sse';
import { executeAgent } from '@/lib/executor';
import { ensureFabricator } from '@/lib/fabricator';
import { isLlmAvailable, llmBackend, llmBackendLabel } from '@/lib/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Executes an agent task and streams its full life cycle over SSE:
 * microVM boot → policy gates → (optional) Atlas data-fabric ingest →
 * live token stream → structured artifact → confidence.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const llmUp = await isLlmAvailable();
  if (!llmUp) {
    const hint =
      llmBackend() === 'openai'
        ? 'check REALTOMATIC_OPENAI_BASE_URL, REALTOMATIC_OPENAI_API_KEY and REALTOMATIC_OPENAI_MODEL'
        : 'start the opencode server or check that the `opencode` binary is on PATH';
    return Response.json(
      { error: `LLM backend unavailable (${llmBackendLabel()}) — ${hint}.` },
      { status: 503 }
    );
  }

  let userInput: string | undefined;
  try {
    const body = await request.json();
    userInput = typeof body?.userInput === 'string' && body.userInput.trim() ? body.userInput.trim() : undefined;
  } catch {
    // empty body is fine — the agent runs on data-fabric context
  }

  ensureFabricator();

  return sseResponse(async (send, close) => {
    const handle = executeAgent(id, {
      userInput,
      onEvent: (event) => send(event),
    });
    await handle.promise;
    close();
  });
}
