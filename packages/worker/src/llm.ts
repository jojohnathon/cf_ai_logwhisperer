import type { EnvBindings } from "./db";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmOptions {
  model: string;
  messages: LlmMessage[];
  response_format?: Record<string, unknown>;
  max_tokens?: number;
}

export async function runWorkersAI(env: EnvBindings, options: LlmOptions) {
  const body = {
    model: options.model,
    max_tokens: options.max_tokens ?? Number(env.MAX_TOKENS ?? "2048"),
    messages: options.messages,
    response_format: options.response_format
  };
  const response = await env.AI.run(body as Record<string, unknown>);
  return response as Record<string, unknown>;
}

export function forceJSON(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object" && "response" in result) {
    const response = (result as Record<string, unknown>).response;
    if (typeof response === "string") {
      return response;
    }
  }
  return JSON.stringify(result);
}
