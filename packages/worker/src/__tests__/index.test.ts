import { describe, expect, it } from "vitest";
import { LogWhispererPipeline as PipelineFromIndex, SessionDO as DOFromIndex } from "../index";
import { LogWhispererPipeline as PipelineFromWorkflows } from "../workflows";
import { SessionDO as DOFromDurable } from "../durable";

// The Wrangler deploy step requires the LogWhispererPipeline workflow class to be exported
// from the Worker entrypoint. This regression test ensures that the entrypoint re-exports
// the workflow so the binding remains discoverable to the deployment tooling.
describe("index exports", () => {
  it("re-exports LogWhispererPipeline", () => {
    expect(PipelineFromIndex).toBe(PipelineFromWorkflows);
  });

  it("re-exports SessionDO", () => {
    expect(DOFromIndex).toBe(DOFromDurable);
  });
});
