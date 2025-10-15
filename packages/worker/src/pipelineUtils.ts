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

function leftRotate(value: number, amount: number): number {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

export function sha1(content: string): string {
  const data = new TextEncoder().encode(content);
  const totalBlocks = ((data.length + 8) >> 6) + 1;
  const words = new Uint32Array(totalBlocks * 16);

  for (let i = 0; i < data.length; i += 1) {
    words[i >> 2] |= data[i] << (24 - (i % 4) * 8);
  }

  words[data.length >> 2] |= 0x80 << (24 - (data.length % 4) * 8);
  words[words.length - 1] = data.length * 8;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Array<number>(80);

  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 16; t += 1) {
      w[t] = words[i + t] ?? 0;
    }
    for (let t = 16; t < 80; t += 1) {
      const value = (w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]) >>> 0;
      w[t] = leftRotate(value, 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let t = 0; t < 80; t += 1) {
      let f: number;
      let k: number;

      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (leftRotate(a, 5) + f + e + k + w[t]) >>> 0;
      e = d;
      d = c;
      c = leftRotate(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const parts = [h0, h1, h2, h3, h4];
  return parts.map((part) => part.toString(16).padStart(8, "0")).join("");
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
