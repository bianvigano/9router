# 9Router — Full Feature Guide

> **Version:** 9Router `v0.5.55` (2026-08-14)  
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
27. [SAML 2.0 SSO](#saml-20-sso)
28. [Self-Hosted STT / TTS / Embedding](#self-hosted-stt--tts--embedding)
29. [Fish Audio TTS](#fish-audio-tts)
30. [Vision & Audio Capacity Adapter](#vision--audio-capacity-adapter)
31. [TokenRouter Provider](#tokenrouter-provider)
32. [Default Key Auto-Provisioning](#default-key-auto-provisioning)
33. [New Providers & Models](#new-providers--models)
34. [Claude Quota Cache](#claude-quota-cache)

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
| Kimchi | OAuth **or API key** (dual auth, v0.5.55) |
| Kiro | AWS Builder ID / Google / GitHub OAuth |
| Gemini CLI | Native Gemini CLI auth |
| Qwen | ~~OAuth integration~~ removed in v0.5.50 (flow unreliable) |
| Grok CLI | Device-code OAuth flow |
| Zed / Trae / Windsurf | OAuth callback proxies |

### Free Providers

| Provider | Models | Quota |
|----------|--------|-------|
| **Kiro AI** | Claude 4.5/5, GLM-5, MiniMax | ~50 credits/month free (500 trial credits for new accounts in first 30 days) |
| **OpenCode Free** | Auto-fetched model list | No auth, free tier varies over time |
| **Vertex AI** | Gemini 3 Pro, GLM-5, DeepSeek | $300 free credits for new GCP accounts |

> **Note:** Use the **Vertex AI Studio** endpoint to consume free credits. The Gemini API endpoint no longer consumes them as of March 2026.

### API Key Providers (40+)

OpenAI, Anthropic, OpenRouter, GLM, Kimi, MiniMax, DeepSeek, Groq, xAI, Mistral, Perplexity, Together AI, Fireworks, Cerebras, Cohere, NVIDIA, SiliconFlow, Nebius, Chutes, Hyperbolic, Featherless, Poolside, **TokenRouter** (300+ models), **Alibaba Token Plan** (SG-only), api-airforce, baidu, bazaarlink, bluesminds, kilo-gateway, llm7, morph, sambanova, tencent, **Self-hosted STT/TTS/Embedding**, and many more.

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

## SAML 2.0 SSO

Enterprise Single Sign-On via SAML 2.0 protocol (added in v0.5.55).

### How It Works

1. **AuthnRequest Generation**: 9Router generates SAML authentication requests.
2. **ACS Assertion Handling**: Assertion Consumer Service validates SAML responses from IdP.
3. **SP Metadata Export**: Download Service Provider metadata for IdP configuration.
4. **Admin Config Test**: Test SAML configuration from dashboard before enabling.
5. **Replay Protection**: Uses `saml_state` cookie matched against `InResponseTo` to prevent replay attacks.

### Use Cases

- Integrate 9Router with corporate identity providers (Okta, Azure AD, OneLogin, etc.)
- Centralized authentication management
- Automatic user provisioning from enterprise directory

### Configuration

Enable in Dashboard → Settings → Authentication → SAML SSO. Requires:
- IdP metadata URL or XML
- SP Entity ID
- Assertion Consumer Service URL
- Attribute mapping (email, name, etc.)

---

## Self-Hosted STT / TTS / Embedding

Point 9Router at your own OpenAI-compatible speech and embedding servers (added in v0.5.50).

### Supported Backends

| Type | Examples |
|------|----------|
| **Speech-to-Text** | whisper.cpp, faster-whisper |
| **Text-to-Speech** | Kokoro-FastAPI |
| **Embeddings** | llama-server, vLLM, Infinity |

### Benefits

- **Privacy**: Keep sensitive data on-premises
- **Cost**: No per-token charges for self-hosted models
- **Latency**: Lower latency than cloud APIs
- **Control**: Full control over model versions and configurations

### Configuration

Unlike named cloud providers, self-hosted providers read `baseUrl` per connection, so one provider can front several machines:

```
Provider: Self-hosted STT
Base URL: http://whisper-server:9000/v1
API Key: [optional]

Provider: Self-hosted TTS
Base URL: http://kokoro-server:8880/v1
API Key: [optional]

Provider: Self-hosted Embeddings
Base URL: http://embedding-server:8080/v1
API Key: [optional]
```

### Important Notes

- Self-hosted embeddings **do not** fall back to `api.openai.com` if misconfigured
- Adapter returns 400 with reason instead of silently failing
- Upstream fetch bounded by `FETCH_CONNECT_TIMEOUT_MS` to prevent hanging

---

## Fish Audio TTS

Text-to-speech provider with voice cloning support (added in v0.5.55).

### How It Works

- **Model ID**: Sent in HTTP `model` header
- **Voice**: Specified as `reference_id` (preset or cloned voice model)
- **Cloning**: Upload reference audio to create custom voices

### Use Cases

- Custom voice personas for AI assistants
- Multilingual TTS with natural prosody
- Voice cloning for accessibility

### Configuration

Add Fish Audio connection in Dashboard → Providers → Fish Audio:
- API Key: Your Fish Audio API key
- Model: Select from available models
- Voice: Choose preset or cloned voice

---

## Vision & Audio Capacity Adapter

Automatic routing to vision/audio-capable models when target lacks capability (added in v0.5.50).

### How It Works

When a request contains images or audio but the target model doesn't support them:

1. Adapter detects multimodal content
2. Checks target model capabilities
3. Auto-switches to vision/audio-capable model
4. Falls back to `oc/mimo-v2.5-free` if no suitable model found

### Detection

Detects images from:
- Hermes payloads
- `images[]` array
- `experimental_attachments`
- Message-level `image_url` / `audio_url`
- Inline `data:` URIs
- Vercel AI SDK shapes

### Configuration

Default-enabled in v0.5.50. No manual configuration needed.

---

## TokenRouter Provider

300+ models via OpenAI-compatible gateway (added in v0.5.50).

### Features

- **110 Models**: Exact per-model pricing for 110 models
- **Reasoning Effort**: `reasoning_effort` thinking config support
- **OpenAI-Compatible**: Works with any OpenAI-compatible client

### Use Cases

- Access multiple models through single provider
- Simplified billing and quota management
- Fallback chain across many models

### Configuration

Add TokenRouter connection in Dashboard → Providers → TokenRouter:
- API Key: Your TokenRouter API key
- Models: Browse available models in dashboard

---

## Default Key Auto-Provisioning

First-time users automatically get a "Default Key" (added in v0.5.50).

### How It Works

When 9Router starts for the first time:

1. System generates a default API key
2. Key is stored in local database
3. `/v1` endpoint works immediately without manual dashboard setup
4. Key appears in Dashboard → API Keys

### Benefits

- **Zero-config start**: New users can test immediately
- **Simplified onboarding**: No need to navigate dashboard first
- **Backward compatible**: Existing setups unaffected

---

## New Providers & Models

### v0.5.55 Additions

| Provider/Model | Notes |
|----------------|-------|
| **Alibaba Token Plan** | Singapore-only, OpenAI-compatible, 4th Alibaba key type |
| **GLM-5.3** | Added to GLM Coding and GLM (China) |
| **Gemini 3.7 Flash** | Tiered variants (high/medium/low) in Antigravity + Gemini registry |
| **Fish Audio** | TTS provider with voice cloning |
| **Claude Opus 5** | Default Opus model bumped in v0.5.45 |

### v0.5.50 Additions

| Provider/Model | Notes |
|----------------|-------|
| **TokenRouter** | 300+ models, 110 with exact pricing |
| **Self-hosted STT/TTS/Embedding** | whisper.cpp, faster-whisper, Kokoro, llama-server, vLLM, Infinity |
| **OpenDesign** | CLI tool support (manalkaff/opendesign) |

### v0.5.45 Additions

| Provider/Model | Notes |
|----------------|-------|
| **Poolside** | OpenAI-compatible |
| **api-airforce, baidu, bazaarlink, bluesminds, kilo-gateway, llm7, morph, sambanova, tencent** | API key providers |
| **Zed / Trae / Windsurf** | OAuth callback proxies |
| **Gemini 3.6 Flash** | Tier routing |
| **Gemini 3.5 Flash Lite** | Lightweight model |
| **Claude Opus 5** | Default Opus model |
| **Kiro Claude Opus 5** | Opus 5 models in Kiro |

---

## Claude Quota Cache

Deduplication and caching for Claude quota calls (added in v0.5.55).

### Problem

Multiple dashboard tabs making simultaneous quota requests could trigger 429 rate limits from Anthropic.

### Solution

- **120s TTL Cache**: Keyed by access token
- **In-flight Promise Dedup**: Concurrent requests share same promise
- **Last-good Read**: Soft failures return cached value instead of error
- **Manual Refresh**: Click ↻ button sends `force=1` to bypass cache

### Benefits

- No more 429 errors from multiple tabs
- Faster dashboard load (cached responses)
- Graceful degradation on network issues

---

## Security Updates (v0.5.55)

### Critical: Real IP Bypass (GHSA-pjm4-8fpg-f9p6)

**Vulnerability**: `x-9r-real-ip` and Host fallback headers were trusted from client-controlled headers when `custom-server.js` was not in the request path (`npm run start`, `start:bun`), allowing remote callers to pose as local and skip API key auth.

**Impact**: Could reach `LOCAL_ONLY_PATHS` (`/api/mcp/*`, `/api/tunnel/enable`, `/api/auth/reset-password`) without authentication.

**Fix**: 
- Server now stamps per-process `x-9r-peer-token` on every sanitized request
- Only trusts `x-9r-real-ip` behind peer token
- Falls back to Host in development, fails closed in production
- Fixed IPv6 loopback detection (`::1`, `::ffff:127.0.0.1`)
- Routes `npm run start` / `start:bun` through `custom-server.js`

**Action Required**: **Upgrade immediately if 9Router is exposed to network!**

### SSRF Guard

`resolveBaseUrl()` now rejects client-supplied non-public baseUrls on `/v1/search` endpoint.

### Login Security

Fresh-install remote login with default password now returns 403 without issuing JWT.

### Usage Redaction

`/api/usage/request-details` now redacts request/response payloads to prevent sensitive data exposure.

---

## Related Documentation

- [`README.md`](./README.md) — Main project overview and quick start.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — System architecture, request lifecycle, data model.
- [`CLAUDE.md`](./CLAUDE.md) — Contributor/developer guidance.
- [`CHANGELOG.md`](./CHANGELOG.md) — Version history and recent changes.
- [`DOCKER.md`](./DOCKER.md) — Docker deployment guide.

---

*This guide reflects 9Router v0.5.55. Features and provider availability may change in future releases.*
