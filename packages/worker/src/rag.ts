import type { AiBinding } from "./db";

export interface RetrievedPattern {
  id: string;
  title: string;
  vendor: string;
  signature: string;
  guidance: string;
  score?: number;
}

type ReturnMetadataOption = boolean | "none" | "indexed" | "all";

interface VectorizeQueryOptions {
  topK?: number;
  returnMetadata?: ReturnMetadataOption;
}

interface VectorQueryCapableIndex {
  query: (
    vector: ArrayLike<number> | Float32Array,
    options?: VectorizeQueryOptions
  ) => Promise<{
    matches?: Array<{
      id: string;
      score?: number;
      metadata?: Record<string, unknown>;
    }>;
  }>;
}

const DEFAULT_EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5";

function extractEmbeddingVector(result: unknown): ArrayLike<number> | Float32Array | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const payload = result as Record<string, unknown>;

  const inspectEntry = (entry: unknown): ArrayLike<number> | Float32Array | undefined => {
    if (!entry || typeof entry !== "object") {
      return undefined;
    }
    const embedding = (entry as Record<string, unknown>).embedding;
    if (embedding instanceof Float32Array) {
      return embedding;
    }
    if (Array.isArray(embedding)) {
      return embedding as number[];
    }
    return undefined;
  };

  if (Array.isArray(payload.data)) {
    for (const entry of payload.data) {
      const vector = inspectEntry(entry);
      if (vector) {
        return vector;
      }
    }
  }

  if ("embedding" in payload) {
    const embedding = payload.embedding;
    if (embedding instanceof Float32Array) {
      return embedding;
    }
    if (Array.isArray(embedding)) {
      return embedding as number[];
    }
  }

  const nested = payload.result ?? payload.response;
  if (nested && typeof nested === "object") {
    const vector = extractEmbeddingVector(nested);
    if (vector) {
      return vector;
    }
  }

  return undefined;
}

function toFloat32Array(vector: ArrayLike<number> | Float32Array): Float32Array {
  if (vector instanceof Float32Array) {
    return vector;
  }
  if (ArrayBuffer.isView(vector)) {
    return new Float32Array(vector as ArrayLike<number>);
  }
  return Float32Array.from(Array.from(vector, (value) => Number(value)));
}

export async function embedText(
  ai: AiBinding,
  text: string,
  model = DEFAULT_EMBEDDING_MODEL
): Promise<Float32Array> {
  const trimmed = text.trim();
  if (!trimmed) {
    return new Float32Array();
  }
  // Call with model as first parameter, options as second
  const result = await ai.run(model, {
    text: trimmed
  });
  const vector = extractEmbeddingVector(result);
  if (!vector) {
    throw new Error("Embedding model returned an unexpected response shape");
  }
  const normalized = toFloat32Array(vector);
  if (normalized.length === 0) {
    throw new Error("Embedding model returned an empty vector");
  }
  return normalized;
}

export async function vectorizeSearch(
  index: VectorizeIndex,
  vector?: ArrayLike<number> | Float32Array | null,
  options: VectorizeQueryOptions = {}
): Promise<RetrievedPattern[]> {
  if (!index) {
    console.warn("Vectorize index is not available");
    return [];
  }
  if (!vector) {
    return [];
  }
  const normalized = toFloat32Array(vector);
  if (normalized.length === 0) {
    return [];
  }
  const queryable = index as unknown as VectorQueryCapableIndex;
  const results = await queryable.query(normalized, {
    topK: options.topK ?? 8,
    returnMetadata: options.returnMetadata ?? "all"
  });

  return (results.matches ?? []).map((match: any) => ({
    id: match.id,
    score: match.score,
    title: match.metadata?.title ?? "",
    vendor: match.metadata?.vendor ?? "",
    signature: match.metadata?.signature ?? "",
    guidance: match.metadata?.guidance ?? ""
  }));
}
