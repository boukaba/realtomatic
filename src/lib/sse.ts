import { NextResponse } from 'next/server';

/**
 * Server-Sent Events helper for route handlers. The setup function receives
 * a `send` helper (JSON-encoded data frames) and must call `close()` when
 * done. It may return a disposer that runs when the stream closes. A
 * heartbeat comment keeps proxies from idling the connection out.
 */
export function sseResponse(
  setup: (send: (data: unknown) => void, close: () => void) => Promise<void | (() => void)> | void | (() => void)
): Response {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let disposer: (() => void) | void | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* consumer gone */
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        if (typeof disposer === 'function') {
          try {
            disposer();
          } catch {
            /* noop */
          }
        }
      };
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          close();
        }
      }, 15_000);

      try {
        const maybeDisposer = await setup(send, close);
        if (typeof maybeDisposer === 'function') disposer = maybeDisposer;
      } catch (error) {
        send({ type: 'error', error: error instanceof Error ? error.message : 'stream failed' });
        close();
      }
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (typeof disposer === 'function') {
        try {
          disposer();
        } catch {
          /* noop */
        }
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
