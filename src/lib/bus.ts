/**
 * In-process pub/sub used to bridge agent activity (executions, workflow
 * steps, fabricator cycles) into SSE responses. Channel-scoped and simple:
 * everything lives in one Next.js server process.
 */

type Listener = (data: unknown) => void;

declare global {
  var __realtomaticBus: Map<string, Set<Listener>> | undefined;
}

function channels(): Map<string, Set<Listener>> {
  if (!globalThis.__realtomaticBus) {
    globalThis.__realtomaticBus = new Map();
  }
  return globalThis.__realtomaticBus;
}

export function subscribe(channel: string, listener: Listener): () => void {
  const map = channels();
  const set = map.get(channel) ?? new Set<Listener>();
  set.add(listener);
  map.set(channel, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) map.delete(channel);
  };
}

export function publish(channel: string, data: unknown): void {
  const set = channels().get(channel);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(data);
    } catch {
      // a dead SSE consumer must never break the publisher
    }
  }
}

/** Wire a bus channel into an SSE ReadableStream controller. */
export function pipeChannelToStream(
  channel: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): () => void {
  const send = (data: unknown) => {
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      // consumer gone
    }
  };
  return subscribe(channel, send);
}
