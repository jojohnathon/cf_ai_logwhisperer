export interface LogEvent {
  session_id: string;
  kind: string;
  payload: unknown;
}

export interface SuggestionRecord {
  session_id: string;
  cmd: string;
  why: string;
  risk: "low" | "med" | "high";
  accepted?: number;
}

export interface EnvBindings {
  AI: AiBinding;
  PIPELINE: WorkflowBinding;
  SESSION_DO: DurableObjectNamespace;
  CFG_KV: KVNamespace;
  LOGDB: D1Database;
  PATTERNS_INDEX: VectorizeIndex;
  LOGR2: R2Bucket;
  SAFE_COMMANDS_ALLOWLIST: string;
  MAX_TOKENS: string;
}

export interface AiBinding {
  run: (options: Record<string, unknown>) => Promise<unknown>;
}

export interface WorkflowBinding {
  createDispatcher<T>(name: string): WorkflowDispatcher<T>;
}

export interface WorkflowDispatcher<T> {
  run(input: T): Promise<unknown>;
}

export async function insertEvent(db: D1Database, event: LogEvent): Promise<void> {
  await db.prepare(
    `INSERT INTO events (session_id, kind, payload) VALUES (?1, ?2, ?3)`
  ).bind(event.session_id, event.kind, JSON.stringify(event.payload)).run();
}

export async function insertSuggestion(db: D1Database, suggestion: SuggestionRecord): Promise<void> {
  await db.prepare(
    `INSERT INTO suggestions (session_id, cmd, why, risk, accepted) VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(
      suggestion.session_id,
      suggestion.cmd,
      suggestion.why,
      suggestion.risk,
      suggestion.accepted ?? 0
    )
    .run();
}

export async function getSessionEvents(db: D1Database, sessionId: string, limit = 50) {
  const { results } = await db.prepare(
    `SELECT id, ts, kind, payload FROM events WHERE session_id = ?1 ORDER BY ts DESC LIMIT ?2`
  ).bind(sessionId, limit).all();
  return results ?? [];
}

export async function getSessionSuggestions(db: D1Database, sessionId: string, limit = 20) {
  const { results } = await db.prepare(
    `SELECT id, ts, cmd, why, risk, accepted FROM suggestions WHERE session_id = ?1 ORDER BY ts DESC LIMIT ?2`
  ).bind(sessionId, limit).all();
  return results ?? [];
}
