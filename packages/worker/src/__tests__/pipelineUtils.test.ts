import { describe, expect, it } from "vitest";
import {
  chunkByBytes,
  coerceAllowlist,
  isCommandAllowlisted,
  redactMessage,
  scrubPII,
  sha1,
  tagRisk
} from "../pipelineUtils";

describe("scrubPII", () => {
  it("redacts IPv4 addresses, tokens, and usernames", () => {
    const input = "user=alice 192.168.1.10 token=abcdefabcdefabcdefabcdefabcdefab";
    const result = scrubPII(input);
    expect(result).toContain("user=USER_REDACTED");
    expect(result).toContain("IP_REDACTED");
    expect(result).toContain("TOKEN_REDACTED");
  });
});

describe("chunkByBytes", () => {
  it("returns overlapping chunks without exceeding byte limit", () => {
    const text = "a".repeat(10);
    const chunks = chunkByBytes(text, 4, 2);
    expect(chunks[0].length).toBeLessThanOrEqual(4);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].startsWith(chunks[0].slice(-2))).toBe(true);
  });

  it("handles empty input", () => {
    expect(chunkByBytes("", 10)).toEqual([]);
  });
});

describe("sha1", () => {
  it("hashes deterministically", () => {
    expect(sha1("hello")).toEqual(sha1("hello"));
  });
});

describe("tagRisk", () => {
  it("escalates risk for destructive verbs", () => {
    const result = tagRisk({ cmd: "iptables --flush", why: "", risk: "low" });
    expect(result.risk).toBe("high");
  });

  it("preserves provided risk otherwise", () => {
    const result = tagRisk({ cmd: "ip route show", why: "", risk: "low" });
    expect(result.risk).toBe("low");
  });
});

describe("allowlist", () => {
  it("parses allowlist strings", () => {
    expect(coerceAllowlist("ip, ufw")).toEqual(["ip", "ufw"]);
  });

  it("matches commands against allowlist", () => {
    const list = ["ip", "ufw"];
    expect(isCommandAllowlisted("ip route show", list)).toBe(true);
    expect(isCommandAllowlisted("cat /etc/passwd", list)).toBe(false);
  });
});

describe("redactMessage", () => {
  it("redacts message content", () => {
    const result = redactMessage({ role: "user", content: "user=alice" });
    expect(result.content).toContain("USER_REDACTED");
  });
});
