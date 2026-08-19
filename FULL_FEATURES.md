# 9Router — Full Feature Guide

> **Version:** 9Router `v0.5.45` (2026-07-30)  
> **Scope:** A comprehensive guide to every major feature in 9Router, how it works, why it matters, and how to use it.  
> **Audience:** Users, integrators, and contributors.

---

## Table of Contents

1. [What is 9Router?](#what-is-9router)
2. [Core Value Proposition](#core-value-proposition)
3. [Universal OpenAI-Compatible Endpoint](#universal-openai-compatible-endpoint)
4. [Supported Clients (CLI Tools)](#supported-clients-cli-tools)
5. [Supported Providers](#supported-providers)
6. [RTK Token Saver](#rtk-token-saver)
7. [Headroom Token Saver](#headroom-token-saver)
8. [Caveman Mode](#caveman-mode)
9. [Ponytail (Lazy Senior Dev)](#ponytail-lazy-senior-dev)
10. [Smart 3-Tier Fallback](#smart-3-tier-fallback)
11. [Custom Combos](#custom-combos)
12. [Multi-Account Support](#multi-account-support)
13. [Format Translation](#format-translation)
14. [OAuth Provider Support](#oauth-provider-support)
15. [Auto Token Refresh](#auto-token-refresh)
16. [Real-Time Quota Tracking](#real-time-quota-tracking)
17. [Usage Analytics](#usage-analytics)
18. [Request Logging](#request-logging)
19. [Cloud Sync](#cloud-sync)
20. [Thinking Level Picker](#thinking-level-picker)
21. [Token Saver Bypass Header](#token-saver-bypass-header)
22. [Dashboard](#dashboard)
23. [Deployment Options](#deployment-options)
24. [Security Model](#security-model)
25. [Common Use Cases](#common-use-cases)
26. [Cost Display vs. Real Billing](#cost-display-vs-real-billing)

---

## What is 9Router?

9Router is a **local AI routing gateway** and dashboard built on Next.js. It exposes one OpenAI-compatible endpoint (`http://localhost:20128/v1`) and routes traffic across 40+ AI providers with:

- Format translation
- Model-combo fallback
- Multi-account fallback
- OAuth/API-key credential management
- Auto token refresh
- Quota and usage tracking
- Optional cloud sync

It was built to solve one core problem: **never stop coding because of rate limits, quota expiration, or expensive AI subscriptions.**

---

## Core Value Proposition

| Pain Point | 9Router Solution |
|------------|------------------|
| Subscription quota expires unused every month | Real-time quota tracking + auto fallback |
| Rate limits stop you mid-coding | 3-tier fallback: Subscription → Cheap → Free |
| Tool outputs burn tokens fast | RTK Token Saver cuts 20-40% input tokens |
| Expensive APIs ($20-50/month per provider) | Free and cheap provider routing |
| Manual switching between providers | One endpoint, automatic routing |
| Multiple accounts per provider | Round-robin and priority-based account fallback |

---

## Universal OpenAI-Compatible Endpoint

Every client connects to the same endpoint:

```
http://localhost:20128/v1
```

9Router rewrites `/v1/*` to `/api/v1/*` internally. Supported compatibility routes include:

| Route | Purpose |
|-------|---------|
| `POST /v1/chat/completions` | Standard chat completions |
| `POST /v1/messages` | Anthropic-style messages endpoint |
| `POST /v1/responses` | OpenAI Responses API |
| `GET /v1/models` | List available models |
| `POST /v1/messages/count_tokens` | Token counting |

This means **any tool that supports a custom OpenAI endpoint** works with 9Router out of the box.

---

## Supported Clients (CLI Tools)

9Router works seamlessly with all major AI coding assistants:

- **Claude Code**
- **Codex CLI**
- **OpenClaw**
- **OpenCode**
- **Cursor**
- **Antigravity**
- **Cline**
- **Continue**
- **Droid**
- **Roo**
- **GitHub Copilot**
- **Kilo Code**
- Any custom OpenAI-compatible client

Typical client configuration:

```
Endpoint: http://localhost:20128/v1
API Key:  [copy from 9Router dashboard]
Model:    kr/claude-sonnet-4.5
```

---

## Supported Providers

### OAuth Providers

| Provider | Notes |
|----------|-------|
| Claude Code | Anthropic subscription routing |
| Antigravity | IDE-style provider |
| Codex | OpenAI Codex CLI |
| GitHub Copilot | Copilot chat/completions |
| Cursor | Cursor IDE native protocol |
| Kimchi | OAuth provider |
| Kiro | AWS Builder ID / Google / GitHub OAuth |
| Gemini CLI | Native Gemini CLI auth |
| Qwen | OAuth integration |
| Grok CLI | Device-code OAuth flow |
| Zed / Trae / Windsurf | OAuth callback proxies |

### Free Providers

| Provider | Models | Quota |
|----------|--------|-------|
| **Kiro AI** | Claude 4.5, GLM-5, MiniMax | ~50 credits/month free (500 trial credits for new accounts in first 30 days) |
| **OpenCode Free** | Auto-fetched model list | No auth, free tier varies over time |
| **Vertex AI** | Gemini 3 Pro, GLM-5, DeepSeek | $300 free credits for new GCP accounts |

> **Note:** Use the **Vertex AI Studio** endpoint to consume free credits. The Gemini API endpoint no longer consumes them as of March 2026.

### API Key Providers (40+)

OpenAI, Anthropic, OpenRouter, GLM, Kimi, MiniMax, DeepSeek, Groq, xAI, Mistral, Perplexity, Together AI, Fireworks, Cerebras, Cohere, NVIDIA, SiliconFlow, Nebius, Chutes, Hyperbolic, Featherless, Poolside, and many more.

---

## RTK Token Saver

Tool outputs like `git diff`, `grep`, `find`, `ls`, `tree`, and logs often consume 30-50% of your prompt budget. **RTK** detects these and compresses them **before** the request hits the LLM.

### How It Works

- **Auto-detect:** RTK peeks the first 1KB of each `tool_result` and picks the right filter.
- **Filters:** `git-diff`, `git-status`, `grep`, `find`, `ls`, `tree`, `dedup-log`, `smart-truncate`, `read-numbered`, `search-list`.
- **Fail-open:** If compression fails, throws, or makes output bigger, the original text is kept.
- **Universal:** Runs before format translation, so it works across OpenAI, Claude, Gemini, Cursor, Kiro, and OpenAI Responses.
- **Default ON:** Toggle in Dashboard → Endpoint settings.

```
Without RTK: 47K tokens sent to LLM
With RTK:    28K tokens sent to LLM   (40% saved)
```

### Per-Request Bypass

Set the header:

```http
X-9Router-Token-Saver: off
```

This disables all token savers for that single request.

---

## Headroom Token Saver

Optional external compression proxy. 9Router calls Headroom's `/v1/compress` endpoint, then continues normal routing, fallback, auth, and usage tracking.

```
Client → 9Router → Headroom /v1/compress → 9Router → provider
```

Local setup:

```bash
pip install "headroom-ai[proxy]"
headroom proxy --port 8787
```

Enable in Dashboard → Endpoint → Token Saver → Headroom. Default URL: `http://localhost:8787`. If Headroom is down, 9Router fails open.

---

## Caveman Mode

Injects a caveman-speak prompt that forces the LLM to reply tersely while preserving technical substance.

| Mode | Behavior |
|------|----------|
| **Lite** | Short sentences, no fluff |
| **Full** | Aggressive terseness |
| **Ultra** | Maximum compression |

Can save up to **65% output tokens**.

---

## Ponytail (Lazy Senior Dev)

Injects a "lazy senior dev" system prompt that biases the LLM toward minimal, YAGNI-first code:

- Deletion over addition
- Standard library over new dependencies
- One-liners over abstractions

| Mode | Behavior |
|------|----------|
| **Lite** | Build what's asked, name the lazier alternative |
| **Full** | Enforce the YAGNI ladder |
| **Ultra** | Deletion first, ship the one-liner, challenge the rest of the requirement |

Stacks with Caveman and RTK.

---

## Smart 3-Tier Fallback

9Router automatically routes requests through a priority chain:

```
Tier 1: SUBSCRIPTION  (Claude Code, Codex, GitHub Copilot, Cursor)
   ↓ quota exhausted / rate limited / error
Tier 2: CHEAP         (GLM $0.6/1M, MiniMax $0.2/1M, Kimi)
   ↓ budget limit / error
Tier 3: FREE          (Kiro, OpenCode Free, Vertex credits)
```

Result: zero downtime, minimal cost.

---

## Custom Combos

Create unlimited named model combinations with explicit fallback order:

```json
{
  "name": "my-coding-stack",
  "models": [
    "cc/claude-opus-4-6",
    "glm/glm-4.7",
    "if/kimi-k2-thinking"
  ]
}
```

Use them by name in any client:

```
Model: my-coding-stack
```

Combos can mix subscriptions, cheap providers, and free providers.

---

## Multi-Account Support

- Add multiple accounts per provider.
- Round-robin between accounts.
- Priority-based routing.
- Fallback to next account when one hits quota or fails.

Useful for maximizing free-tier limits and distributing load.

---

## Format Translation

9Router translates between formats so any client can talk to any provider:

| Source | Target |
|--------|--------|
| OpenAI chat | Claude, Gemini, Cursor, Kiro, Vertex, Ollama |
| Claude | OpenAI, Gemini, Cursor, Kiro, Vertex |
| Gemini | OpenAI, Claude, Cursor, Kiro |
| OpenAI Responses | OpenAI chat, Claude |

The engine pivots through OpenAI as an intermediate format, with direct routes for fragile pairs (thinking blocks, tool IDs, images, `is_error`).

---

## OAuth Provider Support

Full OAuth and device-code flows for supported providers.

### Lifecycle

1. Dashboard initiates OAuth or device-code flow.
2. User authenticates with provider.
3. 9Router exchanges code for access/refresh tokens.
4. Connection is stored in local DB.
5. Tokens auto-refresh before expiry.

### Supported Flows

- Authorization code (web callback)
- Device code (CLI-friendly)
- PAT (personal access token) for some providers
- External IdP import (e.g., Kiro Microsoft SSO)

---

## Auto Token Refresh

- OAuth tokens are refreshed automatically before expiration.
- 401/403 errors during live traffic trigger a refresh and retry.
- Works seamlessly during active chat sessions.
- No manual re-authentication needed.

---

## Real-Time Quota Tracking

Track usage live in the dashboard:

- Token consumption per provider and model
- Reset countdown (5-hour, daily, weekly, monthly)
- Cost estimation for paid tiers
- Monthly spending reports
- Quota visibility settings per provider

This helps you **maximize subscription value** before quotas reset.

---

## Usage Analytics

- Per-provider and per-model token usage
- Cost estimation and spending trends
- Monthly reports
- Cached token tracking
- Embedding token tracking
- Request log correlation

> **Important:** Dashboard costs are **for tracking and comparison only**. 9Router never charges you. You pay providers directly.

---

## Request Logging

Enable debug mode for full request/response logs:

- API calls, headers, and payloads
- Translation debug sessions under `logs/` when `ENABLE_REQUEST_LOGS=true`
- Per-request status log in `~/.9router/log.txt`
- Export for troubleshooting

---

## Cloud Sync

Sync providers, combos, aliases, keys, and settings across devices.

### How It Works

1. Enable cloud sync in dashboard.
2. 9Router uploads encrypted state to the configured cloud endpoint.
3. Periodic sync keeps devices in sync.
4. Local runtime continues even if cloud is unreachable.

### Env Variables

- `NEXT_PUBLIC_BASE_URL` / `BASE_URL`: callback URL
- `NEXT_PUBLIC_CLOUD_URL` / `CLOUD_URL`: cloud sync endpoint

---

## Thinking Level Picker

Dashboard UI for selecting per-model reasoning effort. Appends a `(level)` suffix to copied model names to force reasoning effort across all supported formats.

Supported targets:

- OpenAI
- Claude
- Gemini
- DeepSeek
- Kimi
- Qwen
- Zai
- MiniMax
- Hunyuan
- Step

The `(level)` suffix is stripped before sending to the upstream provider.

---

## Token Saver Bypass Header

For debugging or special cases, disable all token savers on a single request:

```http
X-9Router-Token-Saver: off
```

---

## Dashboard

The web dashboard at `http://localhost:20128/dashboard` provides:

- Provider connection management
- OAuth setup flows
- API key generation
- Model alias management
- Combo builder
- Usage analytics
- Quota tracking
- Token saver settings
- Request logging toggle
- Cloud sync settings
- CLI tool configuration helpers

---

## Deployment Options

| Target | How |
|--------|-----|
| **Localhost** | `npm install -g 9router && 9router` |
| **Source** | `npm install && PORT=20128 npm run dev` |
| **Docker** | `docker build -t 9router . && docker run -p 20128:20128 9router` |
| **VPS/Cloud** | `npm run build && npm start` |
| **Cloudflare Workers** | Edge deployment (external worker package) |

Default URLs:

- Dashboard: `http://localhost:20128/dashboard`
- API: `http://localhost:20128/v1`

---

## Security Model

- **Local-first:** All secrets stored in local SQLite/JSON.
- **Dashboard login:** Cookie-based auth with `JWT_SECRET`.
- **Default password:** `INITIAL_PASSWORD` (default `123456` — override in production).
- **API keys:** HMAC-signed with `API_KEY_SECRET`.
- **Provider secrets:** Stored in local DB, protected at filesystem level.
- **Outbound proxy:** Supports `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`.
- **IP handling:** `custom-server.js` derives client IP from TCP socket and strips untrusted `X-Forwarded-For`.

### Important Env Variables

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Dashboard session signing |
| `INITIAL_PASSWORD` | Default dashboard password |
| `API_KEY_SECRET` | Local API key HMAC |
| `MACHINE_ID_SALT` | Machine identification salt |
| `DATA_DIR` | Override storage location |
| `ENABLE_REQUEST_LOGS` | Deep request/translation logs |

---

## Common Use Cases

### Case 1: Maximize Claude Pro Subscription

```
Combo: "maximize-claude"
  1. cc/claude-opus-4-7
  2. glm/glm-5.1
  3. kr/claude-sonnet-4.5
```

### Case 2: Zero Cost

```
Combo: "free-forever"
  1. kr/claude-sonnet-4.5
  2. kr/glm-5
  3. oc/<auto>
```

### Case 3: Always On (5 Layers)

```
Combo: "always-on"
  1. cc/claude-opus-4-7
  2. cx/gpt-5.5
  3. glm/glm-5.1
  4. minimax/MiniMax-M2.7
  5. kr/claude-sonnet-4.5
```

### Case 4: Free AI in OpenClaw

```
Combo: "openclaw-free"
  1. kr/claude-sonnet-4.5
  2. kr/glm-5
  3. kr/MiniMax-M2.5
```

---

## Cost Display vs. Real Billing

9Router is **free, open-source software**. It never charges you.

| What Dashboard Shows | What It Means |
|----------------------|---------------|
| Total cost | Estimated cost if you used paid APIs directly |
| Total tokens | Actual tracked token usage |
| Provider cost | Comparison metric, not a bill |

**Example:**

```
Dashboard:  $290 total cost
Reality:    Using Kiro free tier (~50 credits/mo)
Actual:     $0.00
Savings:    $290
```

You only pay:

- Subscription providers directly (Claude, Codex, Copilot, Cursor).
- Cheap API-key providers directly (GLM, MiniMax, Kimi, etc.).

9Router itself has no billing system and cannot charge your card.

---

## Related Documentation

- [`README.md`](./README.md) — Main project overview and quick start.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — System architecture, request lifecycle, data model.
- [`CLAUDE.md`](./CLAUDE.md) — Contributor/developer guidance.
- [`CHANGELOG.md`](./CHANGELOG.md) — Version history and recent changes.
- [`DOCKER.md`](./DOCKER.md) — Docker deployment guide.

---

*This guide reflects 9Router v0.5.45. Features and provider availability may change in future releases.*
