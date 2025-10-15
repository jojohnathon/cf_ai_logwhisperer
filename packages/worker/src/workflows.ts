import { computeSHA1, chunkByBytes } from "./utils";
import { runAnalysisModel, runCommandModel } from "./llm";
import { vectorizeSearch } from "./rag";
import { insertAnalysisEvent, insertSuggestion } from "./db";

export interface PipelineContext {
  env: Env;
  sessionId: string;
}

export interface Env {
  AI: WorkersAI;
  LOGDB: D1Database;
  CFG_KV: KVNamespace;
  PATTERNS_INDEX: VectorizeIndex;
  SAFE_COMMANDS_ALLOWLIST: string;
  MAX_TOKENS: string;
  LOGR2?: R2Bucket;
}

export interface WorkersAI {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(type?: string): Promise<T | null>;
  run<T = unknown>(): Promise<T>;
  all<T = unknown>(): Promise<{ results: T[] | undefined }>;
}

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: Record<string, unknown>): Promise<void>;
}

export interface VectorizeIndex {
  query(input: {
    topK: number;
    text: string;
    returnFields?: string[];
  }): Promise<{ matches: VectorizeMatch[] }>;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  fields?: Record<string, unknown>;
}

export interface R2Object {
  key: string;
  size: number;
  etag: string;
  uploaded: string;
  httpEtag?: string;
  checksums?: Record<string, string>;
  version?: string;
  customMetadata?: Record<string, string>;
}

export interface R2Bucket {
  put: (key: string, value: ArrayBuffer | string | ReadableStream, options?: Record<string, unknown>) => Promise<R2Object>;
}

export interface ScrubResult {
  redacted: string;
}

export interface ChunkResult {
  chunks: string[];
  hashes: string[];
}

export interface RetrievalResult {
  retrieved: RetrievedPattern[];
}

export interface RetrievedPattern {
  id?: string;
  title?: string;
  vendor?: string;
  signature?: string;
  guidance?: string;
  score?: number;
}

export interface AnalysisResult {
  summary: string;
  anomalies: string[];
  evidence: Record<string, string[]>;
  assumptions: string[];
}

export interface CommandSuggestion {
  cmd: string;
  why: string;
  risk: "low" | "med" | "high";
}

export interface SuggestionResult {
  suggestions: CommandSuggestion[];
}

export class LogWhispererPipeline {
  constructor(private readonly context: PipelineContext) {}

  async scrubPII({ text }: { text: string }): Promise<ScrubResult> {
    return { redacted: redactPII(text) };
  }

  async chunkLogs({ redacted }: ScrubResult): Promise<ChunkResult> {
    const chunks = chunkByBytes(redacted, 2000, 200);
    const hashes = await Promise.all(chunks.map((chunk) => computeSHA1(chunk)));
    return { chunks, hashes };
  }

  async retrievePatterns({ chunks }: ChunkResult): Promise<RetrievalResult> {
    if (chunks.length === 0) {
      return { retrieved: [] };
    }
    const seed = chunks.slice(0, 3).join("\n");
    const matches = await vectorizeSearch(this.context.env.PATTERNS_INDEX, seed, 8, [
      "title",
      "vendor",
      "signature",
      "guidance"
    ]);
    return { retrieved: matches };
  }

  async analyze({ chunks, retrieved }: ChunkResult & RetrievalResult): Promise<AnalysisResult> {
    const systemPrompt = buildAnalysisSystemPrompt();
    const userPrompt = buildAnalysisUserPrompt(chunks, retrieved);
    const raw = await runAnalysisModel(this.context.env, systemPrompt, userPrompt);
    return normalizeAnalysis(raw);
  }

  async suggestCommands({ analysis }: { analysis: AnalysisResult }): Promise<SuggestionResult> {
    const allowlist = parseAllowlist(this.context.env.SAFE_COMMANDS_ALLOWLIST);
    const systemPrompt = buildCommandSystemPrompt(allowlist);
    const raw = await runCommandModel(this.context.env, systemPrompt, analysis);
    return normalizeSuggestions(raw, allowlist);
  }

  async writeMemory({
    analysis,
    suggestions
  }: {
    analysis: AnalysisResult;
    suggestions: CommandSuggestion[];
  }): Promise<{ ok: boolean } | void> {
    await insertAnalysisEvent(this.context.env.LOGDB, this.context.sessionId, analysis);
    for (const suggestion of suggestions) {
      await insertSuggestion(this.context.env.LOGDB, this.context.sessionId, suggestion);
    }
    return { ok: true };
  }
}

export function redactPII(text: string): string {
  return text
    .replace(/\b(\d{1,3}\.){3}\d{1,3}\b/g, "IP_REDACTED")
    .replace(/[a-f0-9]{32,64}/gi, "TOKEN_REDACTED")
    .replace(/\buser=\w+\b/gi, "user=USER_REDACTED");
}

export function buildAnalysisSystemPrompt(): string {
  return `You are LogWhisperer. Task: read the redacted logs, reason step-by-step privately, and produce strict JSON with keys: summary (1-2 sentences), anomalies (<=5 bullet phrases), evidence (map from anomaly->log lines), assumptions (<=3). Be decisive. If uncertain, state what single observation would resolve it. Avoid vendor-specific commands here.`;
}

export function buildAnalysisUserPrompt(chunks: string[], retrieved: RetrievedPattern[]): string {
  const chunkSection = chunks.join("\n---\n");
  const patternSection = retrieved
    .map((match) => {
      const lines = [
        match.title ? `Title: ${match.title}` : undefined,
        match.vendor ? `Vendor: ${match.vendor}` : undefined,
        match.signature ? `Signature: ${match.signature}` : undefined,
        match.guidance ? `Guidance: ${match.guidance}` : undefined
      ].filter(Boolean);
      return lines.join(" | ");
    })
    .filter(Boolean)
    .join("\n");
  return `LOGS:\n<<<\n${chunkSection}\n>>>\nKNOWN PATTERNS:\n<<<\n${patternSection}\n>>>\nReturn JSON only.`;
}

export function buildCommandSystemPrompt(allowlist: string[]): string {
  return `You generate up to 3 SAFE shell commands from an allowlist: ${allowlist.join(",")}. Each item: { "cmd": "...", "why": "...", "risk": "low|med|high" }. Classify as "high" if it stops services, modifies firewall broadly, or deletes configs. Never include destructive commands without "high" and a clear rollback line.`;
}

export function parseAllowlist(input: string): string[] {
  return input
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function normalizeAnalysis(raw: unknown): AnalysisResult {
  if (isAnalysisResult(raw)) {
    return raw;
  }
  return {
    summary: "Unable to generate analysis.",
    anomalies: [],
    evidence: {},
    assumptions: []
  };
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.anomalies) &&
    typeof candidate.evidence === "object" &&
    Array.isArray(candidate.assumptions)
  );
}

export function normalizeSuggestions(raw: unknown, allowlist: string[]): SuggestionResult {
  const suggestions: CommandSuggestion[] = [];
  if (Array.isArray((raw as { suggested_commands?: unknown }).suggested_commands)) {
    for (const entry of (raw as { suggested_commands: unknown[] }).suggested_commands) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>).cmd === "string" &&
        typeof (entry as Record<string, unknown>).why === "string"
      ) {
        const cmd = (entry as Record<string, string>).cmd;
        const why = (entry as Record<string, string>).why;
        const risk = tagRisk(cmd, allowlist, (entry as Record<string, string>).risk);
        suggestions.push({ cmd, why, risk });
      }
    }
  }
  return { suggestions: suggestions.slice(0, 3) };
}

export function tagRisk(command: string, allowlist: string[], providedRisk?: string): "low" | "med" | "high" {
  const base = normalizeRisk(providedRisk);
  const destructivePatterns = /(flush|--force|rm\s+-rf|shutdown|reboot|erase|wipe)/i;
  if (destructivePatterns.test(command)) {
    return "high";
  }
  const normalized = command.trim().replace(/^sudo\s+/, "");
  const executable = normalized.split(/\s+/)[0];
  if (executable && !allowlist.some((allowed) => executable.includes(allowed))) {
    return base === "low" ? "med" : base;
  }
  return base;
}

function normalizeRisk(risk?: string): "low" | "med" | "high" {
  if (risk === "high" || risk === "med" || risk === "low") {
    return risk;
  }
  return "med";
}

export type PipelineInput = {
  logs: string;
  hints?: string;
  vendor?: string;
};

export type PipelineOutput = AnalysisResult & SuggestionResult;

export async function runPipeline(context: PipelineContext, input: PipelineInput): Promise<PipelineOutput> {
  const pipeline = new LogWhispererPipeline(context);
  const scrub = await pipeline.scrubPII({ text: input.logs });
  const chunks = await pipeline.chunkLogs(scrub);
  const retrieved = await pipeline.retrievePatterns(chunks);
  const analysis = await pipeline.analyze({ ...chunks, ...retrieved });
  const suggestions = await pipeline.suggestCommands({ analysis });
  await pipeline.writeMemory({ analysis, suggestions: suggestions.suggestions });
  return { ...analysis, ...suggestions };
}
