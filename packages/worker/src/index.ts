import { Router } from "itty-router";
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import type { Env as PipelineEnv, PipelineInput } from "./workflows";

interface WorkerEnv extends PipelineEnv {
  SESSION_DO: DurableObjectNamespace;
}

const router = Router();

router.post("/api/chat", async (request: Request, env: WorkerEnv) => {
  const body = await safeJson(request);
  const sessionId = (body?.sessionId as string | undefined) ?? crypto.randomUUID();
  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId));
  const response = await stub.fetch(new URL(`/chat`, request.url).toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(body as PipelineInput), sessionId })
  });
  return response;
});

router.get("/api/sessions/:id", async (request: Request, env: WorkerEnv) => {
  const { params } = (request as unknown as { params: Record<string, string> });
  const sessionId = params.id;
  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId));
  return stub.fetch(new URL(`/sessions/${sessionId}`, request.url).toString(), {
    method: "GET"
  });
});

router.post("/api/upload", async (request: Request, env: WorkerEnv) => {
  const body = await request.arrayBuffer();
  const sessionId = request.headers.get("x-session-id") ?? crypto.randomUUID();
  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId));
  return stub.fetch(new URL(`/upload`, request.url).toString(), {
    method: "POST",
    headers: request.headers,
    body
  });
});

router.all("*", () => new Response("Not Found", { status: 404 }));

export default {
  fetch: (request: Request, env: WorkerEnv, ctx: ExecutionContext) => router.handle(request, env, ctx)
};

async function safeJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.json<Record<string, unknown>>();
  } catch {
    return {};
  }
}

export { SessionDO } from "./durable";
