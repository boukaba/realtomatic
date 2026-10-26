import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SQLite-backed store for agent/human threads.
 *
 * The rest of the demo state lives in a JSON file that is rewritten whole on
 * every change and trimmed to stay bounded — fine for executions, but threads
 * are the audit trail and must never be lost. SQLite gives incremental writes,
 * indexed queries, and durability across restarts, so a visitor always finds
 * the history of what the agents decided and what is waiting on a human.
 */

const DB_DIR = join(process.cwd(), '.realtomatic-state');
const DB_FILE = join(DB_DIR, 'threads.db');

export type ThreadStatus = 'open' | 'awaiting_human' | 'resolved';
export type MessageRole = 'agent' | 'human' | 'system';
export type MessageKind = 'handoff' | 'reply' | 'result' | 'request' | 'decision' | 'note';

export type ThreadMessage = {
  id: string;
  threadId: string;
  role: MessageRole;
  authorId?: string;
  authorName: string;
  kind: MessageKind;
  text: string;
  meta?: Record<string, unknown>;
  at: string;
};

export type Thread = {
  id: string;
  title: string;
  topic?: string;
  artifactId?: string;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  awaitingSince?: string;
  messageCount: number;
  participants: string[];
  lastMessage?: string;
};

type ThreadRow = {
  id: string;
  title: string;
  topic: string | null;
  artifact_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  awaiting_since: string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  role: string;
  author_id: string | null;
  author_name: string;
  kind: string;
  text: string;
  meta: string | null;
  at: string;
};

let db: DatabaseSync | null = null;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getDb(): DatabaseSync {
  if (db) return db;
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      topic TEXT,
      artifact_id TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      awaiting_since TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      meta TEXT,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, at);
    CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_threads_artifact ON threads(artifact_id);
  `);
  return db;
}

function rowToThread(row: ThreadRow): Thread {
  const database = getDb();
  const msgs = database
    .prepare('SELECT author_name, text, role FROM messages WHERE thread_id = ? ORDER BY at ASC')
    .all(row.id) as { author_name: string; text: string; role: string }[];
  const participants = [...new Set(msgs.map((m) => m.author_name))];
  const last = msgs[msgs.length - 1];
  return {
    id: row.id,
    title: row.title,
    topic: row.topic ?? undefined,
    artifactId: row.artifact_id ?? undefined,
    status: row.status as ThreadStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    awaitingSince: row.awaiting_since ?? undefined,
    messageCount: msgs.length,
    participants,
    lastMessage: last ? `${last.author_name}: ${last.text.slice(0, 120)}` : undefined,
  };
}

/** Find the thread for a work item, or create it. Idempotent. */
export function ensureThread(input: {
  artifactId?: string;
  title: string;
  topic?: string;
}): string {
  const database = getDb();
  if (input.artifactId) {
    const existing = database
      .prepare('SELECT id FROM threads WHERE artifact_id = ? ORDER BY updated_at DESC LIMIT 1')
      .get(input.artifactId) as { id: string } | undefined;
    if (existing) return existing.id;
  }
  const id = uid('thr');
  const now = new Date().toISOString();
  database
    .prepare(
      'INSERT INTO threads (id, title, topic, artifact_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(id, input.title, input.topic ?? null, input.artifactId ?? null, 'open', now, now);
  return id;
}

export function appendMessage(
  threadId: string,
  message: {
    role: MessageRole;
    authorId?: string;
    authorName: string;
    kind: MessageKind;
    text: string;
    meta?: Record<string, unknown>;
  }
): ThreadMessage {
  const database = getDb();
  const id = uid('msg');
  const at = new Date().toISOString();
  database
    .prepare(
      'INSERT INTO messages (id, thread_id, role, author_id, author_name, kind, text, meta, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      id,
      threadId,
      message.role,
      message.authorId ?? null,
      message.authorName,
      message.kind,
      message.text,
      message.meta ? JSON.stringify(message.meta) : null,
      at
    );
  database.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(at, threadId);
  return { id, threadId, at, ...message };
}

export function setThreadStatus(threadId: string, status: ThreadStatus): void {
  const database = getDb();
  const now = new Date().toISOString();
  if (status === 'awaiting_human') {
    database
      .prepare('UPDATE threads SET status = ?, awaiting_since = ?, updated_at = ? WHERE id = ?')
      .run(status, now, now, threadId);
  } else {
    database
      .prepare('UPDATE threads SET status = ?, awaiting_since = NULL, updated_at = ? WHERE id = ?')
      .run(status, now, threadId);
  }
}

export function listThreads(options: { status?: ThreadStatus; limit?: number } = {}): Thread[] {
  const database = getDb();
  const limit = options.limit ?? 60;
  const rows = options.status
    ? (database
        .prepare('SELECT * FROM threads WHERE status = ? ORDER BY updated_at DESC LIMIT ?')
        .all(options.status, limit) as ThreadRow[])
    : (database
        .prepare('SELECT * FROM threads ORDER BY updated_at DESC LIMIT ?')
        .all(limit) as ThreadRow[]);
  return rows.map(rowToThread);
}

export function getThread(threadId: string): { thread: Thread; messages: ThreadMessage[] } | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM threads WHERE id = ?').get(threadId) as
    | ThreadRow
    | undefined;
  if (!row) return null;
  const msgs = database
    .prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY at ASC')
    .all(threadId) as MessageRow[];
  return {
    thread: rowToThread(row),
    messages: msgs.map((m) => ({
      id: m.id,
      threadId: m.thread_id,
      role: m.role as MessageRole,
      authorId: m.author_id ?? undefined,
      authorName: m.author_name,
      kind: m.kind as MessageKind,
      text: m.text,
      meta: m.meta ? (JSON.parse(m.meta) as Record<string, unknown>) : undefined,
      at: m.at,
    })),
  };
}

export function threadCounts(): { open: number; awaiting: number; resolved: number; total: number } {
  const database = getDb();
  const rows = database
    .prepare('SELECT status, COUNT(*) as n FROM threads GROUP BY status')
    .all() as { status: string; n: number }[];
  const by = new Map(rows.map((r) => [r.status, Number(r.n)]));
  const open = by.get('open') ?? 0;
  const awaiting = by.get('awaiting_human') ?? 0;
  const resolved = by.get('resolved') ?? 0;
  return { open, awaiting, resolved, total: open + awaiting + resolved };
}

/** Most recent thread for a work item, used to attach follow-up activity. */
export function threadForArtifact(artifactId: string): string | null {
  const database = getDb();
  const row = database
    .prepare('SELECT id FROM threads WHERE artifact_id = ? ORDER BY updated_at DESC LIMIT 1')
    .get(artifactId) as { id: string } | undefined;
  return row?.id ?? null;
}
