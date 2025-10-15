import type { RetrievedPattern, VectorizeIndex, VectorizeMatch } from "./workflows";

export async function vectorizeSearch(
  index: VectorizeIndex,
  query: string,
  topK: number,
  returnFields: string[]
): Promise<RetrievedPattern[]> {
  try {
    const result = await index.query({
      text: query,
      topK,
      returnFields
    });
    return (result.matches || []).map((match: VectorizeMatch) => {
      const fields = match.fields ?? {};
      return {
        id: match.id,
        score: match.score,
        title: typeof fields.title === "string" ? fields.title : undefined,
        vendor: typeof fields.vendor === "string" ? fields.vendor : undefined,
        signature: typeof fields.signature === "string" ? fields.signature : undefined,
        guidance: typeof fields.guidance === "string" ? fields.guidance : undefined
      } satisfies RetrievedPattern;
    });
  } catch (error) {
    console.error("Vectorize search error", error);
    return [];
  }
}
