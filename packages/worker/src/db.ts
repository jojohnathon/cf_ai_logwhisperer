import type { AnalysisResult, CommandSuggestion, D1Database } from "./workflows";

export async function insertAnalysisEvent(db: D1Database, sessionId: string, analysis: AnalysisResult): Promise<void> {
  await db
    .prepare("INSERT INTO events (session_id, kind, payload) VALUES (?1, ?2, ?3)")
    .bind(sessionId, "analysis", JSON.stringify(analysis))
    .run();
}

export async function insertSuggestion(db: D1Database, sessionId: string, suggestion: CommandSuggestion): Promise<void> {
  await db
    .prepare("INSERT INTO suggestions (session_id, cmd, why, risk) VALUES (?1, ?2, ?3, ?4)")
    .bind(sessionId, suggestion.cmd, suggestion.why, suggestion.risk)
    .run();
}

export async function fetchSessionEvents(db: D1Database, sessionId: string, limit = 20): Promise<unknown[]> {
  const stmt = db.prepare(
    "SELECT kind, payload, ts FROM events WHERE session_id = ?1 ORDER BY ts DESC LIMIT ?2"
  );
  const { results } = await stmt.bind(sessionId, limit).all();
  return results ?? [];
}

export async function fetchSessionSuggestions(db: D1Database, sessionId: string, limit = 10): Promise<unknown[]> {
  const stmt = db.prepare(
    "SELECT cmd, why, risk, ts, accepted FROM suggestions WHERE session_id = ?1 ORDER BY ts DESC LIMIT ?2"
  );
  const { results } = await stmt.bind(sessionId, limit).all();
  return results ?? [];
}
