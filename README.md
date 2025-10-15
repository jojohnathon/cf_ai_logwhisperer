# cf_ai_logwhisperer

## One-line pitch
Paste router, firewall, or system logs and receive a plain-English summary, anomaly list, and up to three safe command suggestions with rationale — complete with session memory and reproducible prompts.

## Overview
cf_ai_logwhisperer is a Cloudflare-native "log translator + triage + safe command suggester." It ingests noisy network and system logs, redacts sensitive data, recalls known patterns, and produces actionable explanations and remediation commands tailored for homelabbers and SRE-adjacent teams.

### Architecture at a glance
```
Pages chat UI ──▶ Durable Object (SessionDO)
                     │
                     ▼
             Workflows Pipeline (PIPELINE)
   ┌─────────────┬──────────┬────────────┬─────────────────┐
   │ scrubPII    │ chunkLogs│ retrieve   │ analyze &       │
   │ (regex)     │ (2 KB)   │ patterns   │ suggestCommands │
   └─────────────┴──────────┴────────────┴─────────────────┘
                     │
                     ▼
                Memory writes
        (D1 events, suggestions tables)
```

### Cloudflare services used
- **Workers AI** (Llama 3.3) for analysis and explanation
- **Workflows** for orchestrating PII scrubbing, chunking, retrieval, analysis, and command suggestion
- **Durable Objects** for per-session memory, conversation history, and rate limiting
- **D1** for append-only events, suggestions, and pattern metadata
- **KV** for rate limit counters and lightweight settings
- **Vectorize** for retrieving similar log patterns
- **R2** for optional raw log bundle storage
- **Pages** for the chat and dropzone interface

### Key capabilities
- Privacy-first redaction of IPs, secrets, and usernames before LLM calls
- Retrieval-augmented grounding via a log-patterns cookbook
- Constrained, allowlisted command suggestions with automatic risk tagging
- Append-only audit trail of analyses and suggestions
- Session awareness across chat turns and uploads

## Repository structure
```
cf_ai_logwhisperer/
├─ README.md
├─ PROMPTS.md
├─ packages/
│  ├─ worker/
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  ├─ durable.ts
│  │  │  ├─ workflows.ts
│  │  │  ├─ llm.ts
│  │  │  ├─ rag.ts
│  │  │  └─ db.ts
│  │  ├─ wrangler.toml
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ vitest.config.ts
│  └─ pages-app/
│     ├─ src/
│     │  ├─ main.tsx
│     │  └─ apiClient.ts
│     ├─ index.html
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ vite.config.ts
├─ schema/
│  └─ d1.sql
├─ examples/
│  ├─ firewall_ufw.txt
│  ├─ firewall_ufw.expected.json
│  ├─ cisco_asa.txt
│  ├─ cisco_asa.expected.json
│  ├─ systemd_journal.txt
│  └─ systemd_journal.expected.json
├─ scripts/
│  └─ seed.ts
├─ pnpm-workspace.yaml
└─ LICENSE
```

## Run locally

### Prerequisites
- Node.js 20+
- pnpm 9+
- Wrangler CLI (`npm i -g wrangler`)

### Install dependencies
```bash
pnpm install
```

### Seed data and create resources
```bash
wrangler d1 execute logwhisperer_db --file=schema/d1.sql
pnpm --filter worker ts-node scripts/seed.ts
```

### Start the Worker locally
```bash
cd packages/worker
wrangler dev --local --persist
```

### Start the Pages app
```bash
cd packages/pages-app
pnpm dev
```

## Deploy
```bash
cd packages/worker
wrangler deploy
cd ../pages-app
pnpm run deploy
```

## API examples
```bash
curl -X POST https://<your-pages-domain>/api/chat \
  -H "content-type: application/json" \
  -d '{
    "sessionId": "demo-session",
    "logs": "Jun 21 12:10:01 kernel: ...",
    "vendor": "linux",
    "hints": "wifi drops on zoom"
  }'
```

## Limitations
- Commands are suggestions only; no automatic execution occurs.
- Voice intake is planned but not yet available in v1.
- The analysis depends on high-quality log snippets; extremely large uploads should be chunked before submission.

## Success metrics
- Pipeline latency (PII scrub → suggestions)
- Suggestion acceptance rate
- Helpfulness thumbs feedback stored in KV counters
- Top recurring anomalies mined from events table

## License
Released under the MIT License. See [LICENSE](./LICENSE).
