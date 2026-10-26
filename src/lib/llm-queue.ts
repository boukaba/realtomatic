/**
 * Tiny concurrency limiter for LLM-backed agent tasks. Free models are slow
 * and the demo should never stack five simultaneous sessions; tasks queue
 * and run with a small amount of parallelism.
 */

const MAX_CONCURRENCY = 2;

let active = 0;
const queue: (() => void)[] = [];

export async function withLlmSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = queue.shift();
    if (next) next();
  }
}

export function llmQueueDepth(): number {
  return Math.max(0, queue.length + active - MAX_CONCURRENCY);
}
