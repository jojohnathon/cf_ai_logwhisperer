import { Router } from "itty-router";
import type { EnvBindings } from "./db";

export { SessionDO } from "./durable";
export { LogWhispererPipeline } from "./workflows";

const router = Router();

router.post("/api/test-ai", async (request, env: EnvBindings) => {
  // Test with @cf/baai/bge-small-en-v1.5 embedding model (simpler, no messages)
  try {
    const embedResult = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
      text: "Hello world"
    });
    
    return new Response(JSON.stringify({ 
      success: true, 
      embedResult,
      message: "Embedding model works!"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (embedError) {
    // If embedding fails, try different LLM call format
    try {
      const llmResult = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-awq", {
        prompt: "Say hello in one word"
      });
      
      return new Response(JSON.stringify({ 
        success: true, 
        llmResult,
        message: "LLM with prompt works!"
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (llmError) {
      return new Response(JSON.stringify({ 
        embedError: String(embedError),
        llmError: String(llmError),
        aiType: typeof env.AI
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
});

router.post("/api/chat", async (request, env: EnvBindings) => {
  const payload = await request.json<{
    sessionId?: string;
    logs: string;
    hints?: string;
    vendor?: string;
  }>();
  const sessionId = payload.sessionId ?? crypto.randomUUID();
  const id = env.SESSION_DO.idFromName(sessionId);
  const stub = env.SESSION_DO.get(id);
  const response = await stub.fetch("https://session/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, sessionId })
  });
  return response;
});

router.get("/api/sessions/:id", async (request, env: EnvBindings) => {
  const { id } = request.params as { id: string };
  const stubId = env.SESSION_DO.idFromName(id);
  const stub = env.SESSION_DO.get(stubId);
  return stub.fetch(`https://session/history?sessionId=${encodeURIComponent(id)}`);
});

router.post("/api/upload", async (request, env: EnvBindings) => {
  const sessionId = request.headers.get("x-session-id") ?? crypto.randomUUID();
  const body = await request.arrayBuffer();
  const key = `${sessionId}/${Date.now()}.log`;
  await env.LOGR2.put(key, body);
  return new Response(JSON.stringify({ key, sessionId }), {
    headers: { "Content-Type": "application/json" }
  });
});

router.all("*", () => new Response("Not found", { status: 404 }));

export default {
  fetch: (request: Request, env: EnvBindings, ctx: ExecutionContext) =>
    router.handle(request, env, ctx)
};
