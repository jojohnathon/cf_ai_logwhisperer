import type { DurableObjectState } from "@cloudflare/workers-types";
import { fetchSessionEvents, fetchSessionSuggestions } from "./db";
import type { Env, PipelineInput } from "./workflows";
import { runPipeline } from "./workflows";

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export class SessionDO {
  private readonly storage: DurableObjectState["storage"];
  private messages: StoredMessage[] = [];

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    this.storage = state.storage;
    state.blockConcurrencyWhile(async () => {
      const stored = await this.storage.get<StoredMessage[]>("messages");
      this.messages = stored ?? [];
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.split("/").pop();

    if (request.method === "POST" && path === "chat") {
      return this.handleChat(request);
    }

    if (request.method === "POST" && path === "upload") {
      return this.handleUpload(request);
    }

    if (request.method === "GET") {
      return this.handleHistory();
    }

    return new Response("Not found", { status: 404 });
  }

  private async handleChat(request: Request): Promise<Response> {
    const body = (await request.json()) as PipelineInput & { sessionId?: string };
    if (!body.logs) {
      return Response.json({ error: "logs field required" }, { status: 400 });
    }

    const sessionId = body.sessionId ?? this.state.id.toString();
    await this.recordMessage("user", body.logs);

    const result = await runPipeline({ env: this.env, sessionId }, body);
    await this.recordMessage("assistant", JSON.stringify(result));

    return Response.json({ ...result, sessionId });
  }

  private async handleUpload(request: Request): Promise<Response> {
    const key = `${this.state.id.toString()}/${Date.now()}`;
    if (!this.env.LOGR2) {
      return Response.json({ error: "R2 bucket not configured" }, { status: 501 });
    }
    const body = await request.arrayBuffer();
    await this.env.LOGR2.put(key, body, { httpMetadata: { contentType: request.headers.get("content-type") ?? "text/plain" } });
    return Response.json({ key });
  }

  private async handleHistory(): Promise<Response> {
    const sessionId = this.state.id.toString();
    const [events, suggestions] = await Promise.all([
      fetchSessionEvents(this.env.LOGDB, sessionId),
      fetchSessionSuggestions(this.env.LOGDB, sessionId)
    ]);
    return Response.json({ sessionId, events, suggestions });
  }

  private async recordMessage(role: "user" | "assistant", content: string): Promise<void> {
    const entry: StoredMessage = { role, content, timestamp: Date.now() };
    this.messages.push(entry);
    this.messages = this.messages.slice(-20);
    await this.storage.put("messages", this.messages);
  }
}
