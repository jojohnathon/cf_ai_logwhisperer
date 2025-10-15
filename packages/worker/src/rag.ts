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

interface TextQueryCapableIndex {
  query: (
    query: string,
    options?: VectorizeQueryOptions & {
      returnMetadata?: ReturnMetadataOption;
    }
  ) => Promise<{
    matches?: Array<{
      id: string;
      score?: number;
      metadata?: Record<string, unknown>;
    }>;
  }>;
}

export async function vectorizeSearch(
  index: VectorizeIndex,
  query: string,
  options: VectorizeQueryOptions = {}
): Promise<RetrievedPattern[]> {
  const queryable = index as unknown as TextQueryCapableIndex;
  const results = await queryable.query(query, {
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
