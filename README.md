# cf_ai_logwhisperer

**cf_ai_logwhisperer** — Paste router/firewall/system logs. Get a plain-English summary, anomaly list, and up to 3 safe command suggestions with rationale — with session memory and reproducible prompts.

https://cf-ai-logwhisperer.pages.dev

## Architecture at a glance
```
Pages (chat UI)
   ↓
Durable Object SessionDO (conversation memory, rate limits)
   ↓
Workflows Pipeline (scrubPII → chunkLogs → retrievePatterns → analyze → suggestCommands → writeMemory)
   ↓
Workers AI (Llama 3.3) · Vectorize · KV · D1 · R2
```

### Core Cloudflare services
| Capability | Service |
|------------|---------|
| LLM reasoning, explanations | Workers AI (Llama 3.3 models) |
| Workflow orchestration | Cloudflare Workflows |
| Stateful memory per workspace | Durable Objects |
| Persistent storage | D1 (sessions, events, suggestions, patterns) |
| Feature flags / rate limiting | Workers KV |
| Retrieval augmented guidance | Vectorize |
| Log bundle storage | R2 |

### Request flow
1. Pages front-end collects logs (text or upload) plus optional hints/vendor.
2. Request hits the Worker router (`/api/chat`, `/api/upload`, `/api/sessions/:id`).
3. The Worker forwards the session to the `SessionDO` Durable Object which:
   - Enforces per-session limits
   - Invokes the `LogWhispererPipeline` Workflow run
   - Persists redacted analysis artifacts to D1
4. The Workflow pipeline executes the six steps outlined above, calling Workers AI for reasoning and command generation and Vectorize for prior-pattern retrieval.
5. Results (summary, anomalies, suggested commands) flow back to the Pages UI with evidence links and copy-friendly commands.

## Repository layout
```
cf_ai_logwhisperer/
├─ README.md
├─ PROMPTS.md
├─ packages/
│  ├─ worker/
│  │  ├─ src/
│  │  │  ├─ index.ts          # Router: /api/chat, /api/upload, /api/sessions/:id
│  │  │  ├─ durable.ts        # SessionDO implementation
│  │  │  ├─ workflows.ts      # Workflows graph + helpers
│  │  │  ├─ llm.ts            # Workers AI helpers
│  │  │  ├─ rag.ts            # Vectorize helpers
│  │  │  ├─ db.ts             # D1/KV/R2 bindings & persistence helpers
│  │  │  └─ pipelineUtils.ts  # Pure utilities (PII scrub, chunking, risk tagging)
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  ├─ vitest.config.ts
│  │  └─ wrangler.toml
│  └─ pages-app/
│     ├─ src/
│     │  ├─ main.tsx          # Minimal chat+dropzone UI
│     │  └─ apiClient.ts      # REST client for Worker endpoints
│     └─ package.json
├─ schema/d1.sql
├─ examples/
│  ├─ firewall_ufw.txt
│  ├─ firewall_ufw.expected.json
│  ├─ cisco_asa.txt
│  ├─ cisco_asa.expected.json
│  ├─ systemd_journal.txt
│  └─ systemd_journal.expected.json
├─ scripts/seed.ts            # Seeds Vectorize patterns + few-shots
├─ pnpm-workspace.yaml
├─ package.json               # Root workspace definition
└─ LICENSE
```

## Quickstart
### Install tooling
```bash
npm install -g wrangler pnpm
```

### Bootstrap Cloudflare resources
```bash
wrangler d1 create logwhisperer_db
wrangler kv namespace create CFG_KV
wrangler vectorize create log_patterns
wrangler r2 bucket create logwhisperer-uploads
```

### Apply database schema
```bash
wrangler d1 execute logwhisperer_db --file=schema/d1.sql
```

### Seed retrieval patterns
```bash
pnpm install
pnpm --filter worker exec ts-node ../scripts/seed.ts
```

### Run locally (Worker)
```bash
cd packages/worker
pnpm dev
```

### Run locally (Pages app)
```bash
cd packages/pages-app
pnpm install
pnpm dev
```

### Deploy
```bash
cd packages/worker
wrangler deploy --env production

cd ../pages-app
pnpm run deploy
```

## Testing
- Unit tests cover the pure utilities (`scrubPII`, chunking, risk tagging) using Vitest.
- Golden tests (via `pnpm --filter worker test:golden`) compare pipeline output against curated examples.
- Load and safety checks are described in `packages/worker/README-tests.md` (future work).

Run locally:
```bash
pnpm --filter worker test
```

## Limitations
- Commands are suggestions only; nothing is executed automatically.
- Voice intake is not yet implemented (stretch goal).
- The Pages UI is text-first; accessibility and localization pending.

## Attribution
Built on Cloudflare Workers, Workflows, Workers AI (Llama 3.3), Durable Objects, D1, KV, Vectorize, R2, and Pages.

## License
Distributed under the MIT License. See [LICENSE](./LICENSE).
