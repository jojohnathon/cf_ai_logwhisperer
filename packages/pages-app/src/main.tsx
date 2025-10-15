import { ChangeEvent, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { analyzeLogs, fetchHistory, type ChatResponse } from "./apiClient";

type HistoryEntry = {
  events: unknown[];
  suggestions: unknown[];
};

const vendors = [
  { value: "", label: "Auto" },
  { value: "linux", label: "Linux" },
  { value: "cisco", label: "Cisco" },
  { value: "juniper", label: "Juniper" }
];

function App() {
  const [logs, setLogs] = useState("");
  const [vendor, setVendor] = useState("");
  const [hints, setHints] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionId) {
      setHistory(null);
    }
  }, [sessionId]);

  const onSubmit = async () => {
    if (!logs.trim()) {
      return;
    }
    setLoading(true);
    try {
      const response = await analyzeLogs({ logs, vendor: vendor || undefined, hints, sessionId });
      setResult(response);
      setSessionId(response.sessionId);
    } catch (error) {
      console.error(error);
      alert("Failed to analyze logs. See console for details.");
    } finally {
      setLoading(false);
    }
  };

  const onHistory = async () => {
    if (!sessionId) return;
    try {
      const payload = await fetchHistory(sessionId);
      setHistory(payload);
    } catch (error) {
      console.error(error);
      alert("Failed to load history");
    }
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setLogs((prev) => `${prev}\n${text}`.trim());
  };

  return (
    <div style={{ fontFamily: "sans-serif", margin: "0 auto", maxWidth: "960px", padding: "2rem" }}>
      <header>
        <h1>Log Whisperer</h1>
        <p>Paste logs to translate them into plain English insights and safe commands.</p>
      </header>

      <section style={{ marginBottom: "1.5rem" }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem" }}>Logs</label>
        <textarea
          value={logs}
          onChange={(event) => setLogs(event.target.value)}
          rows={12}
          style={{ width: "100%", fontFamily: "monospace", padding: "0.75rem" }}
          placeholder="Paste router, firewall, or system logs here"
        />
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <select value={vendor} onChange={(event) => setVendor(event.target.value)}>
            {vendors.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept=".log,.txt"
            onChange={onFileChange}
          />
        </div>
        <label style={{ display: "block", fontWeight: 600, margin: "1rem 0 0.5rem" }}>Hints</label>
        <input
          value={hints}
          onChange={(event) => setHints(event.target.value)}
          placeholder="Optional context (e.g., wifi drops when zooming)"
          style={{ width: "100%", padding: "0.5rem" }}
        />
        <button onClick={onSubmit} disabled={loading} style={{ marginTop: "1rem", padding: "0.75rem 1.5rem" }}>
          {loading ? "Analyzing..." : "Analyze"}
        </button>
        {sessionId && (
          <button onClick={onHistory} style={{ marginLeft: "0.75rem", padding: "0.75rem 1.5rem" }}>
            View History
          </button>
        )}
      </section>

      {result && (
        <section style={{ marginBottom: "2rem" }}>
          <h2>Summary</h2>
          <p>{result.summary}</p>
          <h3>Anomalies</h3>
          <ul>
            {result.anomalies.map((anomaly) => (
              <li key={anomaly}>{anomaly}</li>
            ))}
          </ul>
          <h3>Suggested Commands</h3>
          <ul>
            {result.suggested_commands.map((item) => (
              <li key={item.cmd} style={{ marginBottom: "0.5rem" }}>
                <code>{item.cmd}</code>
                <div>{item.why}</div>
                <small>Risk: {item.risk}</small>
                <button
                  style={{ marginLeft: "0.5rem" }}
                  onClick={() => navigator.clipboard.writeText(item.cmd)}
                >
                  Copy
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history && (
        <section>
          <h2>Recent History</h2>
          <pre style={{ background: "#f4f4f5", padding: "1rem", overflow: "auto" }}>
            {JSON.stringify(history, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}
