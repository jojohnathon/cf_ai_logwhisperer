import { describe, expect, it } from "vitest";
import { chunkByBytes, computeSHA1 } from "./utils";
import { normalizeSuggestions, parseAllowlist, redactPII, tagRisk } from "./workflows";

describe("redactPII", () => {
  it("removes IPv4 addresses, tokens, and usernames", () => {
    const input = "User user=alice logged in from 192.168.0.1 with token 0123456789abcdef0123456789abcdef";
    const output = redactPII(input);
    expect(output).not.toContain("192.168.0.1");
    expect(output).toContain("IP_REDACTED");
    expect(output).not.toContain("0123456789abcdef0123456789abcdef");
    expect(output).toContain("TOKEN_REDACTED");
    expect(output).toContain("user=USER_REDACTED");
  });
});

describe("chunkByBytes", () => {
  it("splits text with overlap", () => {
    const sample = "a".repeat(5000);
    const chunks = chunkByBytes(sample, 2000, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeGreaterThan(0);
  });
});

describe("computeSHA1", () => {
  it("produces stable hashes", async () => {
    const hash1 = await computeSHA1("hello");
    const hash2 = await computeSHA1("hello");
    expect(hash1).toEqual(hash2);
  });
});

describe("suggestion normalization", () => {
  const allowlist = parseAllowlist("iptables,ufw,systemctl");

  it("respects provided risk but upgrades for destructive", () => {
    const normalized = normalizeSuggestions(
      {
        suggested_commands: [
          { cmd: "sudo ufw allow 5353/udp", why: "Allow mDNS", risk: "low" },
          { cmd: "sudo iptables --flush", why: "Reset firewall" }
        ]
      },
      allowlist
    );
    expect(normalized.suggestions).toHaveLength(2);
    expect(normalized.suggestions[0].risk).toBe("low");
    expect(normalized.suggestions[1].risk).toBe("high");
  });

  it("raises risk for commands outside allowlist", () => {
    const risk = tagRisk("sudo rm -rf /", allowlist, "low");
    expect(risk).toBe("high");

    const med = tagRisk("sudo docker restart", allowlist, "low");
    expect(med).toBe("med");
  });
});
