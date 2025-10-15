import { insertEvent, insertSuggestion, type EnvBindings } from "./db";
import { vectorizeSearch, type RetrievedPattern } from "./rag";
import { forceJSON, runWorkersAI } from "./llm";
import {
  chunkByBytes,
  coerceAllowlist,
  isCommandAllowlisted,
  scrubPII,
  sha1,
  tagRisk
} from "./pipelineUtils";

export interface PipelineInput {
  sessionId: string;
  text: string;
  hints?: string;
  vendor?: string;
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

export interface PipelineOutput {
  summary: string;
  anomalies: string[];
  evidence: Record<string, string[]>;
  assumptions: string[];
  suggested_commands: CommandSuggestion[];
}

const SYSTEM_ANALYSIS_PROMPT = `You are LogWhisperer. Task: read the redacted logs, reason step-by-step privately, and produce strict JSON with keys: summary (1-2 sentences), anomalies (<=5 bullet phrases), evidence (map from anomaly->log lines), assumptions (<=3).\n\nBe decisive. If uncertain, state what single observation would resolve it. Avoid vendor-specific commands here.`;

function buildAnalysisUserPrompt(chunks: string[], retrieved: RetrievedPattern[]): string {
  const joinedChunks = chunks.join("\n---\n");
  const knownPatterns = retrieved
    .map((pattern) => `${pattern.title} (${pattern.vendor})\nSignature: ${pattern.signature}\nGuidance: ${pattern.guidance}`)
    .join("\n\n");
  return `LOGS:\n<<<\n${joinedChunks}\n>>>\nKNOWN PATTERNS:\n<<<\n${knownPatterns}\n>>>\nReturn JSON only.`;
}

function buildCommandSystemPrompt(allowlist: string[]): string {
  return `You generate up to 3 SAFE shell commands from an allowlist: ${allowlist.join(",")}.\nEach item: { "cmd": "...", "why": "...", "risk": "low|med|high" }.\nClassify as "high" if it stops services, modifies firewall broadly, or deletes configs.\nNever include destructive commands without "high" and a clear rollback line.`;
}

function safeParseJSON<T>(text: string): T {
  return JSON.parse(text) as T;
}

function limitSuggestions(suggestions: CommandSuggestion[], allowlist: string[]): CommandSuggestion[] {
  return suggestions
    .filter((suggestion) => isCommandAllowlisted(suggestion.cmd, allowlist))
    .slice(0, 3)
    .map((suggestion) => tagRisk(suggestion));
}

export class LogWhispererPipeline {
  constructor(private readonly env: EnvBindings) {}

  async scrubPII(input: { text: string }) {
    const redacted = scrubPII(input.text);
    return { redacted };
  }

  async chunkLogs(input: { redacted: string }) {
    const chunks = chunkByBytes(input.redacted, 2000, 200);
    const hashes = chunks.map((chunk) => sha1(chunk));
    return { chunks, hashes };
  }

  async retrievePatterns(input: { chunks: string[] }) {
    const query = input.chunks.slice(0, 3).join("\n");
    const retrieved = await vectorizeSearch(this.env.PATTERNS_INDEX, query, {
      topK: 8,
      returnMetadata: "all"
    });
    return { retrieved };
  }

  async analyze(input: { chunks: string[]; retrieved: RetrievedPattern[]; hints?: string; vendor?: string }) {
    const userPrompt = buildAnalysisUserPrompt(input.chunks, input.retrieved);
    const messages = [
      { role: "system" as const, content: SYSTEM_ANALYSIS_PROMPT },
      { role: "user" as const, content: userPrompt }
    ];
    const response = await runWorkersAI(this.env, {
      model: "@cf/meta/llama-3.3-70b-instruct-fp8",
      messages,
      response_format: { type: "json_object" }
    });
    const analysis = safeParseJSON<AnalysisResult>(forceJSON(response));
    return { analysis };
  }

  async suggestCommands(input: { analysis: AnalysisResult }) {
    const allowlist = coerceAllowlist(this.env.SAFE_COMMANDS_ALLOWLIST);
    const messages = [
      {
        role: "system" as const,
        content: buildCommandSystemPrompt(allowlist)
      },
      {
        role: "user" as const,
        content: JSON.stringify(input.analysis)
      }
    ];
    const response = await runWorkersAI(this.env, {
      model: "@cf/meta/llama-3.3-8b-instruct",
      messages,
      response_format: { type: "json_object" }
    });
    const parsed = safeParseJSON<{ suggested_commands: CommandSuggestion[] }>(forceJSON(response));
    const suggestions = limitSuggestions(parsed.suggested_commands, allowlist);
    return { suggestions };
  }

  async writeMemory(input: { sessionId: string; analysis: AnalysisResult; suggestions: CommandSuggestion[] }) {
    await insertEvent(this.env.LOGDB, {
      session_id: input.sessionId,
      kind: "analysis",
      payload: input.analysis
    });
    for (const suggestion of input.suggestions) {
      await insertSuggestion(this.env.LOGDB, {
        session_id: input.sessionId,
        cmd: suggestion.cmd,
        why: suggestion.why,
        risk: suggestion.risk
      });
    }
    return { ok: true };
  }

  async run(input: PipelineInput): Promise<PipelineOutput> {
    const { redacted } = await this.scrubPII({ text: input.text });
    const { chunks } = await this.chunkLogs({ redacted });
    const { retrieved } = await this.retrievePatterns({ chunks });
    const { analysis } = await this.analyze({ chunks, retrieved, hints: input.hints, vendor: input.vendor });
    const { suggestions } = await this.suggestCommands({ analysis });
    await this.writeMemory({ sessionId: input.sessionId, analysis, suggestions });
    return {
      summary: analysis.summary,
      anomalies: analysis.anomalies,
      evidence: analysis.evidence,
      assumptions: analysis.assumptions,
      suggested_commands: suggestions
    };
  }
}
