import { getSessionEvents, getSessionSuggestions, type EnvBindings } from "./db";
import {
  LogWhispererPipeline,
  type PipelineInput,
  type PipelineOutput
} from "./workflows";
import { redactMessage } from "./pipelineUtils";

interface StoredState {
  createdAt: string;
  lastActive: string;
  messages: { role: string; content: string }[];
}

export class SessionDO {
  private stateCache?: StoredState;

  constructor(private readonly state: DurableObjectState, private readonly env: EnvBindings) {}

  private async loadState(): Promise<StoredState> {
    if (!this.stateCache) {
      const stored = await this.state.storage.get<StoredState>("session");
      this.stateCache = stored ?? {
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        messages: []
      };
    }
    return this.stateCache;
  }

  private async persistState() {
    if (this.stateCache) {
      await this.state.storage.put("session", this.stateCache);
    }
  }

  private async runPipeline(input: PipelineInput): Promise<PipelineOutput> {
    if (this.env.PIPELINE?.createDispatcher) {
      const dispatcher = this.env.PIPELINE.createDispatcher<PipelineInput>("LogWhispererPipeline");
      return dispatcher.run(input) as Promise<PipelineOutput>;
    }
    const pipeline = new LogWhispererPipeline(this.env);
    return pipeline.run(input);
  }

  private async handleChat(request: Request) {
    const payload = await request.json<{
      sessionId: string;
      logs: string;
      hints?: string;
      vendor?: string;
    }>();

    const sessionId = payload.sessionId;
    const state = await this.loadState();
    state.lastActive = new Date().toISOString();
    state.messages.push(redactMessage({ role: "user", content: payload.logs }));
    state.messages = state.messages.slice(-20);
    await this.persistState();

    const output = await this.runPipeline({
      sessionId,
      text: payload.logs,
      hints: payload.hints,
      vendor: payload.vendor
    });

    return new Response(JSON.stringify({ ...output, sessionId }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  private async handleHistory(request: Request) {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId required" }), { status: 400 });
    }
    const [events, suggestions, state] = await Promise.all([
      getSessionEvents(this.env.LOGDB, sessionId),
      getSessionSuggestions(this.env.LOGDB, sessionId),
      this.loadState()
    ]);
    return new Response(
      JSON.stringify({
        events,
        suggestions,
        messages: state.messages
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/chat") {
      return this.handleChat(request);
    }
    if (request.method === "GET" && url.pathname === "/history") {
      return this.handleHistory(request);
    }
    return new Response("Not found", { status: 404 });
  }
}
