import { sseResponse } from '@/lib/sse';
import { getState, mutateState, pushActivity, type Resolution } from '@/lib/store';
import { ensureFabricator } from '@/lib/fabricator';
import { executeAgent } from '@/lib/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ActionBody = {
  id?: string;
  artifactId?: string;
  action?: string;
  note?: string;
  agentId?: string;
  /** draft = run the agent and return its work for review (no commit).
   *  revise = same, but with operator feedback on the previous draft.
   *  confirm = commit the reviewed draft. */
  mode?: 'draft' | 'revise' | 'confirm';
  draft?: string;
  feedback?: string;
};

/**
 * Operator actions on attention items.
 *
 *   resolve  -> instant: "handled it myself"
 *   reply    -> Email Outreach agent drafts a reply  (review before sending)
 *   direct   -> a chosen agent acts on the instruction (review the result)
 *
 * Draft runs stream the agent's live phases and finish with a `draft` frame.
 * Nothing is committed until the operator confirms, so a mistaken instruction
 * never closes the item.
 */
export async function POST(request: Request) {
  ensureFabricator();

  let body: ActionBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, artifactId, action, note, mode = 'draft', draft, feedback } = body;
  if (!id || !artifactId || !action) {
    return Response.json({ error: 'id, artifactId and action are required' }, { status: 400 });
  }

  const state = getState();
  if (state.resolutions.some((r) => r.itemId === id)) {
    return Response.json({ ok: true, deduped: true });
  }

  const commit = (resolution: Resolution) => {
    mutateState((s) => {
      s.resolutions.push(resolution);
    });
  };

  /* ---- instant paths (no agent run) ---- */

  if (action === 'resolve') {
    pushActivity({
      type: 'approval',
      title: 'Item closed by operator',
      detail: note?.slice(0, 140) || `Resolved ${id}`,
    });
    const resolution: Resolution = {
      itemId: id,
      artifactId,
      action: 'resolved',
      note,
      at: new Date().toISOString(),
    };
    commit(resolution);
    return Response.json({ ok: true, resolution });
  }

  if (mode === 'confirm') {
    const resolution: Resolution = {
      itemId: id,
      artifactId,
      action: action === 'reply' ? 'replied' : 'directive',
      note: draft?.slice(0, 2000) ?? note,
      agentName: 'Agent',
      at: new Date().toISOString(),
    };
    commit(resolution);
    pushActivity({
      type: 'execution',
      agentName: 'Agent',
      title: action === 'reply' ? 'Reply approved and sent' : 'Instruction result approved',
      detail: (draft ?? '').slice(0, 140),
    });
    return Response.json({ ok: true, resolution });
  }

  /* ---- streaming draft path ---- */

  const isReply = action === 'reply';
  const agentId = isReply ? 'agent-011' : body.agentId || 'agent-011';

  return sseResponse(async (send, close) => {
    try {
      let instruction: string;

      if (isReply) {
        const artifact = state.artifacts.find((a) => a.id === artifactId);
        const p = (artifact?.payload ?? {}) as Record<string, unknown>;
        const counterparty =
          (typeof p.from === 'string' && p.from) ||
          (typeof p.name === 'string' ? String(p.name) : 'the tenant');
        const subject = typeof p.subject === 'string' ? p.subject : 'your message';
        const bodyText =
          typeof p.body === 'string' ? p.body : typeof p.message === 'string' ? p.message : '';

        instruction = [
          `Reply to an inbound message from ${counterparty} regarding: "${subject}".`,
          bodyText ? `Their message:\n"""\n${bodyText}\n"""` : '',
          note ? `Operator instructions: ${note}` : '',
          `Property context: ${typeof p.propertyAddress === 'string' ? p.propertyAddress : 'the property'}.`,
          'Draft a concise, professional reply that acknowledges the issue and states a concrete next step and timeframe.',
        ]
          .filter(Boolean)
          .join('\n');
      } else {
        instruction =
          note?.trim() || 'Review this item and take the appropriate action; summarize what you did.';
      }

      // Revision pass: hand the model its previous draft plus the operator's
      // feedback so it produces an edited version rather than starting over.
      // The original instruction already carries the source message, and we
      // explicitly forbid switching to a different tenant/message — otherwise
      // the agent re-runs its general mission and answers someone else.
      if (mode === 'revise' && draft) {
        instruction = [
          `You are revising a draft you already wrote. This is an EDIT task, not a new task.`,
          ``,
          `Your previous draft:`,
          `"""`,
          draft,
          `"""`,
          ``,
          feedback?.trim()
            ? `The operator reviewed it and asks for this change: ${feedback.trim()}`
            : `The operator asks you to improve it.`,
          ``,
          `Rules for this revision:`,
          `- Keep the SAME recipient and the SAME underlying message.`,
          `- Do NOT write about any other tenant, property, or message.`,
          `- Apply the requested change only; leave everything else as it was.`,
          `- Reply with the revised text only, no commentary.`,
          ``,
          isReply ? `Source message and context (unchanged):\n${instruction}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }

      send({ type: 'log', line: mode === 'revise' ? 'revising draft…' : 'dispatching to agent…' });

      const sourceArtifact = state.artifacts.find((a) => a.id === artifactId);

      let streamed = '';
      const handle = executeAgent(agentId, {
        userInput: instruction,
        // Bind the exact item under review so the agent never has to look up
        // (or synthesize) context, and `fast` skips theatrics and repair.
        inputArtifact: sourceArtifact,
        fast: true,
        onEvent: (event) => {
          if (event.type === 'phase') send({ type: 'phase', phase: event.phase, label: event.label });
          else if (event.type === 'log') send({ type: 'log', line: event.line, tone: event.tone });
          else if (event.type === 'delta') {
            streamed += event.text;
            send({ type: 'delta', text: event.text });
          }
        },
      });
      await handle.promise;

      const after = getState();
      const exec = [...after.executions].reverse().find((e) => e.id === handle.executionId);
      const payload = (exec?.artifact?.payload ?? {}) as Record<string, unknown>;

      // The email agent returns {to, subject, body}; other agents return a summary.
      const content =
        typeof payload.body === 'string' && payload.body.trim()
          ? payload.body
          : exec?.output || streamed || 'The agent completed the task.';

      send({
        type: 'draft',
        content,
        subject: typeof payload.subject === 'string' ? payload.subject : undefined,
        to: typeof payload.to === 'string' ? payload.to : undefined,
        agentName: exec?.agentName ?? 'Agent',
        duration: exec?.duration,
      });
      close();
    } catch (error) {
      send({ type: 'error', message: error instanceof Error ? error.message : 'Action failed' });
      close();
    }
  });
}
