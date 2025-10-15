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
  if (!env || !env.AI) {
    throw new Error("AI binding is not available");
  }
  
  const params: Record<string, any> = {
    messages: options.messages
  };
  
  if (options.max_tokens) {
    params.max_tokens = options.max_tokens;
  } else if (env.MAX_TOKENS) {
    params.max_tokens = parseInt(env.MAX_TOKENS, 10);
  }
  
  if (options.response_format) {
    params.response_format = options.response_format;
  }
  
  // Call with model as first parameter, options as second
  const response = await env.AI.run(options.model, params);
  return response as Record<string, unknown>;
}

export function forceJSON(result: unknown): string {
  let jsonString = "";
  
  if (typeof result === "string") {
    jsonString = result;
  } else if (result && typeof result === "object" && "response" in result) {
    const response = (result as Record<string, unknown>).response;
    if (typeof response === "string") {
      jsonString = response;
    } else {
      jsonString = JSON.stringify(result);
    }
  } else {
    jsonString = JSON.stringify(result);
  }
  
  // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
  jsonString = jsonString.trim();
  if (jsonString.startsWith("```")) {
    // Remove opening ```json or ```
    jsonString = jsonString.replace(/^```(?:json)?\s*\n?/, "");
    // Remove closing ```
    jsonString = jsonString.replace(/\n?```\s*$/, "");
    jsonString = jsonString.trim();
  }
  
  // Try to extract JSON from text that starts with non-JSON content
  // Look for first { and last }
  const firstBrace = jsonString.indexOf("{");
  const lastBrace = jsonString.lastIndexOf("}");
  
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    jsonString = jsonString.substring(firstBrace, lastBrace + 1);
  }
  
  return jsonString.trim();
}
