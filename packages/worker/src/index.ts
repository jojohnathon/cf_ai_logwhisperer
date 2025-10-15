import { Router } from "itty-router";
import type { EnvBindings } from "./db";

const router = Router();

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
