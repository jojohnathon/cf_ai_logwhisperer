import { insertEvent, insertSuggestion, type EnvBindings } from "./db";
import { embedText, vectorizeSearch, type RetrievedPattern } from "./rag";
import { forceJSON, runWorkersAI, type LlmMessage } from "./llm";
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
  return `You are a JSON API. Generate up to 3 shell commands from this allowlist: ${allowlist.join(", ")}.

Return ONLY valid JSON in this exact format:
{"suggested_commands": [{"cmd": "command here", "why": "reason", "risk": "low"}]}

Rules:
- Only use commands from the allowlist
- Mark as "high" risk if it stops services or modifies firewall
- Return valid JSON only, no other text`;
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
    // Increased from 2000 to 50000 bytes to support larger log inputs
    const chunks = chunkByBytes(input.redacted, 50000, 5000);
    const hashes = chunks.map((chunk) => sha1(chunk));
    return { chunks, hashes };
  }

  async retrievePatterns(input: { chunks: string[] }) {
    const query = input.chunks.slice(0, 3).join("\n").trim();
    if (!query) {
      return { retrieved: [] };
    }
    
    // Check if PATTERNS_INDEX is available
    if (!this.env.PATTERNS_INDEX) {
      console.warn("PATTERNS_INDEX is not available, skipping vector retrieval");
      return { retrieved: [] };
    }
    
    try {
      const embedding = await embedText(
        this.env.AI,
        query,
        this.env.PATTERN_EMBED_MODEL
      );
      const retrieved = await vectorizeSearch(this.env.PATTERNS_INDEX, embedding, {
        topK: 8,
        returnMetadata: "all"
      });
      return { retrieved };
    } catch (error) {
      console.warn("Vector retrieval failed:", error);
      return { retrieved: [] };
    }
  }

  async analyze(input: { chunks: string[]; retrieved: RetrievedPattern[]; hints?: string; vendor?: string }) {
    const userPrompt = buildAnalysisUserPrompt(input.chunks, input.retrieved);
    const messages: LlmMessage[] = [
      { role: "system" as const, content: SYSTEM_ANALYSIS_PROMPT },
      { role: "user" as const, content: userPrompt }
    ];
    
    // Validate messages before sending
    for (const msg of messages) {
      if (!msg.content || typeof msg.content !== 'string') {
        throw new Error(`Invalid message content: ${JSON.stringify(msg)}`);
      }
    }
    
    const response = await runWorkersAI(this.env, {
      model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
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
      model: "@cf/meta/llama-3.1-8b-instruct-awq",
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
