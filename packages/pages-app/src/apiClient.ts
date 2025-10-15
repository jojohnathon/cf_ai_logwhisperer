export interface ChatRequest {
  sessionId?: string;
  logs: string;
  hints?: string;
  vendor?: string;
}

export interface ChatResponse {
  summary: string;
  anomalies: string[];
  evidence?: Record<string, string[]>;
  suggested_commands: { cmd: string; why: string; risk: string }[];
  sessionId: string;
}

// Use environment variable for API base URL, fallback to relative path
const API_BASE = import.meta.env.VITE_API_URL || '';

export async function sendChat(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchHistory(sessionId: string) {
  const response = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
  if (!response.ok) {
    throw new Error("Failed to load history");
  }
  return response.json();
}

export async function uploadLogs(sessionId: string | undefined, file: File) {
  const buffer = await file.arrayBuffer();
  const response = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    headers: {
      "x-session-id": sessionId ?? ""
    },
    body: buffer
  });
  if (!response.ok) {
    throw new Error("Upload failed");
  }
  return response.json();
}
