import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { fetchHistory, sendChat, uploadLogs, type ChatResponse } from "./apiClient";

function App() {
  const [logs, setLogs] = useState("");
  const [hints, setHints] = useState("");
  const [vendor, setVendor] = useState("auto");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ChatResponse | undefined>();
  const [history, setHistory] = useState<any>();

  useEffect(() => {
    if (!sessionId) return;
    fetchHistory(sessionId)
      .then(setHistory)
      .catch(() => setHistory(undefined));
  }, [sessionId, result]);

  const hasLogs = logs.trim().length > 0;

  async function handleAnalyze() {
    if (!hasLogs) {
      setError("Paste logs before analyzing.");
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const response = await sendChat({
        sessionId,
        logs,
        hints: hints || undefined,
        vendor: vendor === "auto" ? undefined : vendor
      });
      setResult(response);
      setSessionId(response.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const anomalies = result?.anomalies ?? [];
  const commands = result?.suggested_commands ?? [];

  const sessionLabel = useMemo(() => sessionId ? `Session ${sessionId.slice(0, 8)}` : "No session", [sessionId]);

  async function handleFileDrop(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setLogs((current) => `${current}${current ? "\n" : ""}${text}`);
    try {
      await uploadLogs(sessionId, file);
    } catch (err) {
      console.warn("Upload failed", err);
    }
  }

  return (
    <div style={{ fontFamily: "Inter, sans-serif", maxWidth: 960, margin: "0 auto", padding: "2rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1>cf_ai_logwhisperer</h1>
        <p>Paste router/firewall/system logs. Get a plain-English summary, anomalies, and safe command suggestions.</p>
        <span style={{ fontSize: "0.9rem", color: "#555" }}>{sessionLabel}</span>
      </header>

      <section style={{ display: "grid", gap: "1rem" }}>
        <textarea
          placeholder="Paste logs here"
          value={logs}
          onChange={(event) => setLogs(event.target.value)}
          rows={12}
          style={{ width: "100%", fontFamily: "monospace", padding: "1rem" }}
        />
        <label>
          Vendor
          <select value={vendor} onChange={(event) => setVendor(event.target.value)} style={{ marginLeft: "0.5rem" }}>
            <option value="auto">Auto-detect</option>
            <option value="linux">Linux</option>
            <option value="cisco">Cisco</option>
            <option value="juniper">Juniper</option>
            <option value="paloalto">Palo Alto</option>
          </select>
        </label>
        <input
          type="text"
          placeholder="Optional hints (e.g., wifi drops during video calls)"
          value={hints}
          onChange={(event) => setHints(event.target.value)}
          style={{ padding: "0.5rem" }}
        />
        <label style={{ border: "1px dashed #888", padding: "1rem", textAlign: "center" }}>
          <span>Attach log file (optional)</span>
          <input type="file" style={{ display: "none" }} onChange={handleFileDrop} />
        </label>
        <button onClick={handleAnalyze} disabled={loading} style={{ padding: "0.75rem", fontSize: "1rem" }}>
          {loading ? "Analyzing..." : "Analyze"}
        </button>
        {error && <div style={{ color: "red" }}>{error}</div>}
      </section>

      {result && (
        <section style={{ marginTop: "2rem" }}>
          <h2>Summary</h2>
          <p>{result.summary}</p>

          <h3>Anomalies</h3>
          <ul>
            {anomalies.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h3>Suggested commands</h3>
          <ul>
            {commands.map((command) => (
              <li key={command.cmd} style={{ marginBottom: "0.5rem" }}>
                <code>{command.cmd}</code>
                <div>{command.why}</div>
                <span style={{ fontSize: "0.8rem", color: "#555" }}>Risk: {command.risk}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history && (
        <section style={{ marginTop: "2rem" }}>
          <h2>Recent history</h2>
          <pre style={{ background: "#f5f5f5", padding: "1rem", maxHeight: 240, overflow: "auto" }}>
            {JSON.stringify(history, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
