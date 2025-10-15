import { afterEach, describe, expect, it, vi } from "vitest";
import { LogWhispererPipeline } from "../workflows";
import * as llm from "../llm";
import type { EnvBindings } from "../db";

describe("LogWhispererPipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests JSON-formatted analysis responses", async () => {
    const env = {} as unknown as EnvBindings;
    const runSpy = vi
      .spyOn(llm, "runWorkersAI")
      .mockResolvedValue({
        response: JSON.stringify({
          summary: "",
          anomalies: [],
          evidence: {},
          assumptions: []
        })
      });

    const pipeline = new LogWhispererPipeline(env);
    await pipeline.analyze({ chunks: ["chunk"], retrieved: [] });

    expect(runSpy).toHaveBeenCalledWith(env, expect.objectContaining({
      response_format: { type: "json_object" }
    }));
  });

  it("requests all metadata fields during pattern retrieval", async () => {
    const query = vi.fn().mockResolvedValue({ matches: [] });
    const env = {
      PATTERNS_INDEX: { query }
    } as unknown as EnvBindings;

    const pipeline = new LogWhispererPipeline(env);
    await pipeline.retrievePatterns({ chunks: ["chunk"] });

    expect(query).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      returnMetadata: "all"
    }));
  });

  it("requests JSON-formatted command suggestions", async () => {
    const env = { SAFE_COMMANDS_ALLOWLIST: "ls,cat" } as unknown as EnvBindings;
    const runSpy = vi
      .spyOn(llm, "runWorkersAI")
      .mockResolvedValue({
        response: JSON.stringify({ suggested_commands: [] })
      });

    const pipeline = new LogWhispererPipeline(env);
    await pipeline.suggestCommands({
      analysis: {
        summary: "",
        anomalies: [],
        evidence: {},
        assumptions: []
      }
    });

    expect(runSpy).toHaveBeenCalledWith(env, expect.objectContaining({
      response_format: { type: "json_object" }
    }));
  });
});
