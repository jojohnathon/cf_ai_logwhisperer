export function chunkByBytes(input: string, chunkSize = 2000, overlap = 0): string[] {
  if (!input) {
    return [];
  }
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  const chunks: string[] = [];
  const step = Math.max(1, chunkSize - Math.max(0, overlap));
  for (let index = 0; index < bytes.length; index += step) {
    const slice = bytes.slice(index, Math.min(bytes.length, index + chunkSize));
    chunks.push(new TextDecoder().decode(slice));
  }
  return chunks;
}

export async function computeSHA1(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && "subtle" in crypto) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-1", data);
    return bufferToHex(digest);
  }

  // Fallback non-cryptographic hash for local testing environments without Web Crypto
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0; // convert to 32-bit int
  }
  return hash.toString(16);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
