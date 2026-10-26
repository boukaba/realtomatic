'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Minimal toast system. A module-level store keeps the wiring to one line —
 * `toast('Sent successfully')` from anywhere — with a single <Toaster />
 * mounted in the app layout.
 */

type Tone = 'success' | 'error';

export type ToastItem = {
  id: number;
  message: string;
  tone: Tone;
};

let items: ToastItem[] = [];
let listeners: ((items: ToastItem[]) => void)[] = [];
let nextId = 1;

function emit() {
  for (const listener of listeners) listener(items);
}

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

export function toast(message: string, tone: Tone = 'success', durationMs = 2600) {
  const item: ToastItem = { id: nextId++, message, tone };
  items = [...items, item];
  emit();
  setTimeout(() => dismiss(item.id), durationMs);
}

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);

  useEffect(() => {
    listeners.push(setList);
    return () => {
      listeners = listeners.filter((l) => l !== setList);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {list.map((item) => (
        <div
          key={item.id}
          role="status"
          aria-live="polite"
          className={cn(
            'animate-slide-up pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-2.5 shadow-lg backdrop-blur',
            item.tone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-200'
              : 'border-red-500/30 bg-red-500/[0.12] text-red-200'
          )}
        >
          {item.tone === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          )}
          <span className="text-sm font-medium">{item.message}</span>
        </div>
      ))}
    </div>
  );
}
