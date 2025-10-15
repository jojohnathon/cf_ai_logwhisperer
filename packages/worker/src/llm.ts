import type { AnalysisResult } from "./workflows";

const ANALYSIS_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8";
const COMMAND_MODEL = "@cf/meta/llama-3.3-8b-instruct";

interface EnvWithAI {
  AI: {
    run: (model: string, payload: Record<string, unknown>) => Promise<unknown>;
  };
  MAX_TOKENS: string;
}

export async function runAnalysisModel(env: EnvWithAI, systemPrompt: string, userPrompt: string): Promise<unknown> {
  try {
    const response = await env.AI.run(ANALYSIS_MODEL, {
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: Number(env.MAX_TOKENS) || 2048
    });
    return coerceJSON(response);
  } catch (error) {
    console.error("Analysis model error", error);
    return {
      summary: "Analysis service unavailable.",
      anomalies: [],
      evidence: {},
      assumptions: []
    } satisfies AnalysisResult;
  }
}

export async function runCommandModel(env: EnvWithAI, systemPrompt: string, analysis: AnalysisResult): Promise<unknown> {
  try {
    const response = await env.AI.run(COMMAND_MODEL, {
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(analysis) }],
      max_tokens: Number(env.MAX_TOKENS) || 2048
    });
    return coerceJSON(response);
  } catch (error) {
    console.error("Command model error", error);
    return { suggested_commands: [] };
  }
}

function coerceJSON(response: unknown): unknown {
  if (typeof response === "object" && response !== null) {
    if ("response" in response && typeof (response as Record<string, unknown>).response === "string") {
      return safeParseJSON((response as Record<string, string>).response);
    }
    if ("output" in response && typeof (response as Record<string, unknown>).output === "string") {
      return safeParseJSON((response as Record<string, string>).output);
    }
    if ("result" in response && typeof (response as Record<string, unknown>).result === "string") {
      return safeParseJSON((response as Record<string, string>).result);
    }
  }
  if (typeof response === "string") {
    return safeParseJSON(response);
  }
  return response;
}

function safeParseJSON(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return {};
      }
    }
    return {};
  }
}
