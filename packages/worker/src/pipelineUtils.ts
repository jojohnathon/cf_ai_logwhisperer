import { createHash } from "node:crypto";

const IP_REGEX = /\b(\d{1,3}\.){3}\d{1,3}\b/g;
const TOKEN_REGEX = /[a-f0-9]{32,64}/gi;
const USER_REGEX = /\buser=\w+\b/gi;

const HIGH_RISK_TERMS = [
  "flush",
  "--force",
  "rm ",
  "shutdown",
  "reboot",
  "disable",
  "stop",
  "delete"
];

export function scrubPII(input: string): string {
  return input
    .replace(IP_REGEX, "IP_REDACTED")
    .replace(TOKEN_REGEX, "TOKEN_REDACTED")
    .replace(USER_REGEX, "user=USER_REDACTED");
}

export function chunkByBytes(text: string, maxBytes: number, overlapBytes = 0): string[] {
  if (maxBytes <= 0) {
    throw new Error("maxBytes must be greater than 0");
  }
  if (text.length === 0) {
    return [];
  }
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start;
    let size = 0;
    while (end < text.length) {
      const slice = text.slice(end, end + 1);
      const byteLength = encoder.encode(slice).length;
      if (size + byteLength > maxBytes) {
        break;
      }
      size += byteLength;
      end += 1;
    }
    const segment = text.slice(start, end);
    chunks.push(segment);
    if (end >= text.length) {
      break;
    }
    const overlap = Math.min(overlapBytes, segment.length);
    start = end - overlap;
  }

  return chunks.map((chunk) => decoder.decode(encoder.encode(chunk)));
}

export function sha1(content: string): string {
  const hash = createHash("sha1");
  hash.update(content);
  return hash.digest("hex");
}

export interface RiskTaggedCommand {
  cmd: string;
  why: string;
  risk?: "low" | "med" | "high";
}

export function tagRisk(command: RiskTaggedCommand): RiskTaggedCommand & { risk: "low" | "med" | "high" } {
  const normalized = command.cmd.toLowerCase();
  const baseRisk = command.risk ?? "med";
  const risk = HIGH_RISK_TERMS.some((term) => normalized.includes(term))
    ? "high"
    : baseRisk;
  return { ...command, risk };
}

export function isCommandAllowlisted(command: string, allowlist: string[]): boolean {
  const binary = command.split(/\s+/)[0]?.toLowerCase() ?? "";
  return allowlist.some((entry) => binary.startsWith(entry.toLowerCase()));
}

export function coerceAllowlist(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function redactMessage(message: { role: string; content: string }): { role: string; content: string } {
  return { ...message, content: scrubPII(message.content) };
}
