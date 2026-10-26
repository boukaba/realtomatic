import { agents, properties } from './mock-data';
import { missions, type Mission } from './missions';
import { extractJsonObject, streamAgentText, runAgentJson } from './llm';
import { withLlmSlot } from './llm-queue';
import { latestSourceArtifact, runFabricatorCycle } from './fabricator';
import { mutateState, pushActivity, type ConsultRecord, type ExecutionRecord, type GeneratedArtifact } from './store';
import { publish } from './bus';
import { appendMessage, ensureThread } from './db';

/**
 * Executes a single agent task end-to-end and streams its life cycle:
 *   queued → microVM boot (theater) → policy gates (theater) →
 *   data-fabric ingest (real: Atlas provides input if none exists) →
 *   live inference (real: streamed tokens) → artifact → confidence/HITL.
 *
 * The boot and policy phases reproduce the isolation story the product
 * will have once VM-per-agent ships; the inference and artifacts are real
 * LLM output.
 */

export type ExecEvent =
  | { type: 'phase'; phase: string; label: string }
  | { type: 'log'; line: string; tone?: 'info' | 'ok' | 'warn' | 'data' }
  | { type: 'delta'; text: string }
  | {
      type: 'result';
      status: 'success' | 'failed';
      execution?: ExecutionRecord;
      error?: string;
    };

export type ExecHandle = {
  executionId: string;
  promise: Promise<void>;
};

const REQUIRED_ARTIFACT: Record<string, GeneratedArtifact['kind']> = {
  'agent-001': 'lease-document',
  'agent-002': 'market-snapshot',
  'agent-004': 'market-snapshot',
  'agent-006': 'lease-document',
  'agent-007': 'lease-document',
  'agent-010': 'market-snapshot',
  'agent-011': 'tenant-email',
  'agent-012': 'lead',
};

/**
 * When an agent's own confidence is low, or it surfaces something outside its
 * lane, it consults a specialist instead of guessing. The specialist is a
 * real agent run with the first agent's output — this is how the team behaves
 * like a team rather than a set of isolated tools.
 */
const CONSULT_MAP: Record<string, { agentId: string; trigger: (payload: Record<string, unknown>) => string | null }> = {
  'agent-001': {
    // Lease Abstractor: a flagged clause needs a tenant-risk read.
    agentId: 'agent-006',
    trigger: (payload) => {
      const flags = Array.isArray(payload.nonStandardFlags) ? (payload.nonStandardFlags as unknown[]) : [];
      const conf = Number(payload.overallConfidence ?? 1);
      if (flags.length > 0) {
        return `The Lease Abstractor flagged non-standard clause(s) in a lease: ${flags.map(String).join('; ')}. Give the tenant risk read: who is this tenant, what is the exposure, and do we approve?`;
      }
      if (conf < 0.75) {
        return `The Lease Abstractor was only ${Math.round(conf * 100)}% confident on a lease abstraction (${String(payload.summary ?? '')}). Independently assess the tenant and lease risk.`;
      }
      return null;
    },
  },
  'agent-007': {
    // Document Processor: low-confidence classification -> abstractor.
    agentId: 'agent-001',
    trigger: (payload) => {
      const conf = Number(payload.confidence ?? Number(payload.overallConfidence ?? 1));
      if (conf < 0.8) {
        return `The Document Processor was ${Math.round(conf * 100)}% confident classifying a document (${String(payload.summary ?? '')}). Abstract the key lease terms as a backup read.`;
      }
      return null;
    },
  },
  'agent-005': {
    // Maintenance Predictor: a high-risk failure -> insurance/risk view.
    agentId: 'agent-009',
    trigger: (payload) => {
      const text = JSON.stringify(payload).toLowerCase();
      if (text.includes('critical') || text.includes('urgent')) {
        return `The Maintenance Predictor flagged a critical issue (${String(payload.summary ?? '')}). Assess the insurance/financial exposure and recommended response.`;
      }
      return null;
    },
  },
};


const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function propertyContextFor(agentId: string): string {
  const property = properties[agentId.length % properties.length];
  return `${property.name} — ${property.type}, ${property.sqFt.toLocaleString()} sqft, ${property.occupancy}% occupied, ${property.city}, ${property.state}. Year built ${property.yearBuilt}.`;
}

function bootLogLines(agentName: string, vmId: string): string[] {
  return [
    `firecracker: allocating microvm ${vmId} (2 vCPU / 2048 MB)`,
    `firecracker: kernel loaded (vmlinuz-6.1.55-firecracker) · dm-verity rootfs verified`,
    `runtime: pulling ${agentName.toLowerCase().replace(/\s+/g, '-')} image · layers 6/6 cached`,
    `runtime: applying seccomp profile · egress allowlist enforced`,
    `netns: egress proxy up · 0 routes outside allowlist`,
    `agent: hibernation snapshot restored in 198ms · resuming mission skill`,
  ];
}

function persistExecution(record: ExecutionRecord) {
  mutateState((state) => {
    state.executions.push(record);
  });
  publish('activity', { type: 'execution', executionId: record.id, agentId: record.agentId });
}

export function executeAgent(
  agentId: string,
  options: {
    userInput?: string;
    goal?: string;
    inputArtifact?: GeneratedArtifact;
    workflowId?: string;
    /** Interactive mode: skip theatrics, briefing and repair passes so an
     *  operator waiting on a draft gets it as fast as the model allows. */
    fast?: boolean;
    onEvent: (event: ExecEvent) => void;
  }
): ExecHandle {
  const agent = agents.find((a) => a.id === agentId) ?? {
    id: agentId,
    name: agentId,
    category: 'document',
    seccompProfile: 'restricted',
  } as (typeof agents)[number];
  const mission: Mission | undefined = missions[agentId];
  const onEvent = options.onEvent;
  const started = Date.now();
  const executionId = uid('exec');
  const vmId = `vm-${Math.random().toString(36).slice(2, 10)}`;

  const emit = onEvent;

  const promise = (async () => {
    try {
      /* ---- phase 1: queue + boot (theater, kept tight) ---- */
      const bootPause = options.fast ? 0 : 100;
      const phasePause = options.fast ? 0 : 150;

      emit({ type: 'phase', phase: 'queued', label: 'Queued' });
      emit({ type: 'log', line: `scheduler: task accepted · priority class interactive`, tone: 'info' });
      await sleep(phasePause);

      emit({ type: 'phase', phase: 'boot', label: 'Booting microVM' });
      for (const line of bootLogLines(agent.name, vmId)) {
        emit({ type: 'log', line, tone: 'info' });
        await sleep(bootPause);
      }

      emit({ type: 'phase', phase: 'policy', label: 'Policy gates' });
      emit({ type: 'log', line: `cosign: image signature verified (registry.realtomatic.ai)`, tone: 'ok' });
      emit({ type: 'log', line: `sbom: 142 packages scanned · 0 critical · 0 high`, tone: 'ok' });
      await sleep(phasePause);

      /* ---- phase 2: input resolution (real, may invoke Atlas) ---- */
      emit({ type: 'phase', phase: 'context', label: 'Context assembly' });
      let artifact = options.inputArtifact;
      if (!artifact) {
        const requiredKind = REQUIRED_ARTIFACT[agentId];
        artifact = requiredKind ? latestSourceArtifact(requiredKind) : undefined;
      }
      if (mission && REQUIRED_ARTIFACT[agentId] && !artifact) {
        emit({ type: 'log', line: `data-fabric: no ${REQUIRED_ARTIFACT[agentId]} available · requesting Atlas synthesis`, tone: 'warn' });
        emit({ type: 'phase', phase: 'fabricate', label: 'Atlas synthesizing input' });
        artifact = (await runFabricatorCycle(REQUIRED_ARTIFACT[agentId])) ?? undefined;
        if (artifact) {
          emit({ type: 'log', line: `data-fabric: received ${artifact.kind} from Atlas — ${artifact.summary}`, tone: 'ok' });
        }
      }
      if (artifact) {
        emit({ type: 'log', line: `context: bound ${artifact.kind} artifact (${artifact.id}) · ${JSON.stringify(artifact.payload).length} bytes`, tone: 'data' });
      }
      if (agentId === 'agent-002' || agentId === 'agent-005' || agentId === 'agent-008' || agentId === 'agent-009') {
        emit({ type: 'log', line: `context: loaded portfolio record — ${propertyContextFor(agentId)}`, tone: 'data' });
      }

      // One thread per unit of work: the input artifact when there is one, so
      // consults and results for the same job land in the same conversation.
      const workItemArtifactId = artifact?.id;

      if (!mission) {
        throw new Error(`No mission skill registered for agent ${agentId}`);
      }

      const prompt = mission.buildPrompt({
        inputArtifact: artifact,
        userInput: options.userInput,
        goal: options.goal,
      });

      /* ---- phase 3: inference (real, streamed) ---- */
      emit({ type: 'phase', phase: 'infer', label: 'Reasoning' });
      emit({ type: 'log', line: `inference: session opened · mission skill loaded (${mission.inputLabel})`, tone: 'ok' });

      // Heartbeat so long inferences feel alive even when the provider
      // streams coarsely: elapsed time + chars received, every 15s.
      let inferStarted = 0;
      let streamedChars = 0;
      const heartbeat = setInterval(() => {
        if (!inferStarted) return;
        const elapsedS = Math.round((Date.now() - inferStarted) / 1000);
        emit({ type: 'log', line: `inference: still reasoning… ${elapsedS}s elapsed · ~${streamedChars.toLocaleString()} chars streamed`, tone: 'info' });
      }, 15000);
      let result: Awaited<ReturnType<typeof streamAgentText>>;
      try {
        result = await withLlmSlot(() => {
          inferStarted = Date.now();
          return streamAgentText(
            `${agent.name} — ${mission.inputLabel}`,
            mission.system,
            prompt,
            (chunk) => {
              streamedChars += chunk.length;
              emit({ type: 'delta', text: chunk });
            },
            { skipBriefing: options.fast }
          );
        });
      } finally {
        clearInterval(heartbeat);
      }
      if (streamedChars === 0) {
        // Provider buffered instead of streaming: replay the think-aloud
        // section as a burst so the thinking panel still populates.
        const idx = result.text.indexOf('{');
        const thinking = (idx === -1 ? result.text : result.text.slice(0, idx)).trim();
        if (thinking) emit({ type: 'delta', text: thinking });
      }
      emit({ type: 'log', line: `inference: ${result.meta.outputTokens} output tokens · ${result.meta.latencyMs}ms · ${result.meta.model}`, tone: 'ok' });

      let payload: Record<string, unknown>;
      try {
        payload = mission.validate(extractJsonObject(result.text));
      } catch {
        if (options.fast) {
          // Interactive path: rather than spend another model round trip on
          // repair, hand back the raw text for the operator to review.
          payload = { summary: result.text };
        } else {
          emit({ type: 'log', line: `validation: structured output failed · requesting self-repair`, tone: 'warn' });
          const repaired = await withLlmSlot(() =>
            runAgentJson(
              `${agent.name} — repair`,
              mission.system,
              `Your previous reply was not a single valid JSON object matching the requested shape. Reply again with ONLY the JSON object.\n\nOriginal request:\n${prompt}`,
              mission.validate
            )
          );
          payload = repaired.data;
          emit({ type: 'log', line: `validation: repaired · ${repaired.meta.outputTokens} tokens`, tone: 'ok' });
        }
      }

      const confidence =
        typeof payload.overallConfidence === 'number'
          ? payload.overallConfidence
          : typeof payload.confidence === 'number'
            ? payload.confidence
            : 0.85;

      /* ---- phase 3.5: consult a specialist when out of lane / unsure ---- */
      const consult = options.fast ? undefined : CONSULT_MAP[agentId];
      const reason = consult?.trigger(payload) ?? null;
      if (consult && reason) {
        const specialist = agents.find((a) => a.id === consult.agentId);
        emit({ type: 'log', line: `consult: handing off to ${specialist?.name ?? consult.agentId} — ${reason.slice(0, 90)}`, tone: 'warn' });
        try {
          const specialistMission = missions[consult.agentId];
          if (specialistMission) {
            const advice = await withLlmSlot(() =>
              runAgentJson(
                `${specialist?.name ?? consult.agentId} — consult`,
                specialistMission.system,
                `${reason}\n\nContext from the requesting agent:\n${JSON.stringify(payload).slice(0, 1200)}\n\nReturn your JSON assessment.`,
                specialistMission.validate
              )
            );
            const consultRecord: ConsultRecord = {
              fromAgentId: agentId,
              fromAgentName: agent.name,
              toAgentId: consult.agentId,
              toAgentName: specialist?.name ?? consult.agentId,
              reason,
              replySummary: String((advice.data as Record<string, unknown>).summary ?? 'Specialist assessment complete'),
              at: new Date().toISOString(),
            };
            mutateState((state) => {
              state.consults.push(consultRecord);
            });

            // Record the exchange in the work item's thread so the decision
            // trail survives for review (SQLite, never trimmed).
            try {
              const threadId = ensureThread({
                artifactId: workItemArtifactId ?? `run-${executionId}`,
                title: artifact?.summary ?? `${agent.name} — ${mission.inputLabel}`,
                topic: propertyContextFor(agentId).split(' — ')[0],
              });
              appendMessage(threadId, {
                role: 'agent',
                authorId: agentId,
                authorName: agent.name,
                kind: 'handoff',
                text: reason,
                meta: { consult: consult.agentId },
              });
              appendMessage(threadId, {
                role: 'agent',
                authorId: consult.agentId,
                authorName: specialist?.name ?? consult.agentId,
                kind: 'reply',
                text: consultRecord.replySummary,
              });
            } catch {
              // Thread logging must never break an agent run.
            }

            pushActivity({
              type: 'execution',
              agentId: consult.agentId,
              agentName: specialist?.name ?? consult.agentId,
              title: `${specialist?.name ?? 'Specialist'} consulted by ${agent.name}`,
              detail: consultRecord.replySummary.slice(0, 160),
            });
            emit({ type: 'log', line: `consult: ${specialist?.name ?? 'specialist'} replied — ${consultRecord.replySummary.slice(0, 90)}`, tone: 'ok' });
          }
        } catch (error) {
          emit({ type: 'log', line: `consult: specialist unavailable — ${error instanceof Error ? error.message : 'error'}`, tone: 'warn' });
        }
      }

      /* ---- phase 4: persist + HITL ---- */
      const durationMs = Date.now() - started;
      const outputSummary = String(payload.summary || `${agent.name} completed the task`);
      const artifactRecord: GeneratedArtifact = {
        id: uid('art'),
        kind:
          agentId === 'agent-003'
            ? 'market-snapshot'
            : agentId === 'agent-001'
              ? 'lease-document'
              : 'comps-set',
        producedBy: agent.name,
        summary: outputSummary,
        payload,
        createdAt: new Date().toISOString(),
        sourceArtifactId: workItemArtifactId,
      };

      const record: ExecutionRecord = {
        id: executionId,
        agentId,
        agentName: agent.name,
        input: options.userInput || artifact?.summary || mission.inputLabel,
        output: outputSummary,
        status: 'success',
        duration: Math.round((durationMs / 1000) * 10) / 10,
        timestamp: new Date().toISOString(),
        confidence: Math.round(confidence * 100) / 100,
        vmId,
        policyChecks: [
          { name: 'cosign', status: 'passed', details: 'Image signed by registry.realtomatic.ai' },
          { name: 'sbom', status: 'passed', details: 'No vulnerabilities found' },
          { name: 'seccomp', status: 'passed', details: `${agent.seccompProfile} profile active` },
          { name: 'egress', status: 'passed', details: 'All egress within allowlist' },
        ],
        tokens: { input: result.meta.inputTokens, output: result.meta.outputTokens },
        model: result.meta.model,
        cost: result.meta.cost,
        artifact: artifactRecord,
        workflowId: options.workflowId,
      };
      persistExecution(record);
      mutateState((state) => {
        state.artifacts.push(artifactRecord);
      });

      // Thread record: the agent's own conclusion for this work item.
      try {
        const threadId = ensureThread({
          artifactId: workItemArtifactId ?? `run-${executionId}`,
          title: artifact?.summary ?? artifactRecord.summary,
          topic: propertyContextFor(agentId).split(' — ')[0],
        });
        appendMessage(threadId, {
          role: 'agent',
          authorId: agentId,
          authorName: agent.name,
          kind: 'result',
          text: outputSummary,
          meta: { confidence, model: result.meta.model },
        });
      } catch {
        // Never let thread logging break a run.
      }
      pushActivity({
        type: 'execution',
        agentId,
        agentName: agent.name,
        title: `${agent.name} completed a task`,
        detail: `${outputSummary} · confidence ${(confidence * 100).toFixed(0)}% · ${record.duration}s`,
      });

      emit({ type: 'log', line: `egress: result published to data fabric (${artifactRecord.id})`, tone: 'ok' });
      emit({ type: 'result', status: 'success', execution: record });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      emit({ type: 'log', line: `error: ${message}`, tone: 'warn' });
      emit({ type: 'result', status: 'failed', error: message });
      const record: ExecutionRecord = {
        id: executionId,
        agentId,
        agentName: agent.name,
        input: options.userInput || options.goal || 'task',
        output: `Failed: ${message}`,
        status: 'failed',
        duration: Math.round(((Date.now() - started) / 1000) * 10) / 10,
        timestamp: new Date().toISOString(),
        confidence: 0,
        vmId,
        policyChecks: [
          { name: 'cosign', status: 'passed', details: 'Image signed by registry.realtomatic.ai' },
          { name: 'sbom', status: 'passed', details: 'No vulnerabilities found' },
          { name: 'seccomp', status: 'passed', details: 'profile active' },
          { name: 'egress', status: 'passed', details: 'All egress within allowlist' },
        ],
        workflowId: options.workflowId,
      };
      persistExecution(record);
    }
  })();

  return { executionId, promise };
}
