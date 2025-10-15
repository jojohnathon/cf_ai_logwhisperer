export type ChatRequest = {
  sessionId?: string;
  logs: string;
  hints?: string;
  vendor?: string;
};

export type ChatResponse = {
  summary: string;
  anomalies: string[];
  suggested_commands: Array<{ cmd: string; why: string; risk: string }>;
  sessionId: string;
};

export async function analyzeLogs(payload: ChatRequest): Promise<ChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Analysis failed: ${response.status}`);
  }

  return (await response.json()) as ChatResponse;
}

export async function fetchHistory(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}`);
  if (!response.ok) {
    throw new Error(`History fetch failed: ${response.status}`);
  }
  return response.json();
}
