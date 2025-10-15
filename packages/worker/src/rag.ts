export interface RetrievedPattern {
  id: string;
  title: string;
  vendor: string;
  signature: string;
  guidance: string;
  score?: number;
}

interface VectorizeQueryOptions {
  topK?: number;
  returnMetadata?: string[];
}

export async function vectorizeSearch(
  index: VectorizeIndex,
  query: string,
  options: VectorizeQueryOptions = {}
): Promise<RetrievedPattern[]> {
  const results = await index.query(query, {
    topK: options.topK ?? 8,
    returnMetadata: options.returnMetadata ?? ["title", "vendor", "signature", "guidance"]
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
