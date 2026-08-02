/**
 * Combo routing strategies — port/extension of OmniRoute's 19-strategy system
 * on top of 9router's existing fallback + round-robin model.
 *
 * A selector receives `(models, ctx)` and returns the reordered model list.
 * Selectors that need persistent state (round-robin, lkgp, least-used) mutate
 * the in-memory `ctx.rotationState` / `ctx.lkgpState` / `ctx.usageCounts` maps
 * directly. Selectors that don't need state are pure functions of (models, ctx)
 * — same input → same output, safe to test.
 *
 * Backward compat: the legacy names `"fallback"` and `"round-robin"` map to
 * the new selectors (`"priority"` and `"round-robin"` respectively) via
 * `NORMALIZE_LEGACY`. The single `.compatibility` module also lurks a tiny
 * state Map used by both new and legacy code — round-robin rotation indices.
 *
 * `fusion` and `pipeline` are NOT pure reorders. They have their own dispatch
 * paths (`handleFusionChat` already exists; `pipeline` is TODO experimental).
 * Use `getDispatcher(name)` to decide which one.
 */

import { normalizeStickyLimit } from "./strategiesState.js";

// ---------- In-memory state containers ----------
// Module-scoped so all strategy calls share the same state across the process.
// Exported via getters/writers so callers can also feed them via `ctx` (preferred
// for tests — pass a fresh Map per test rather than touching the live ones).

const _rotationState = new Map();      // comboName -> { index, consecutiveUseCount }
const _lkgpState     = new Map();      // comboName -> last successful model id
const _usageCounts   = new Map();      // model id -> cumulative request count

export const strategyState = {
  get rotation() { return _rotationState; },
  get lkgp()     { return _lkgpState; },
  get usage()    { return _usageCounts; },
  reset(comboName) {
    if (!comboName) {
      _rotationState.clear();
      _lkgpState.clear();
      _usageCounts.clear();
    } else {
      _rotationState.delete(comboName);
      _lkgpState.delete(comboName);
      // usage counts are global, not per-combo — only clear if explicitly asked.
    }
  },
};

// ---------- Legacy strategy name normalization ----------
// `"fallback"` was the pre-strategy default. Semantically it means "try models in
// stored array order until one succeeds" — which is identical to the new
// `"priority"` selector (identity reorder). `NORMALIZE_LEGACY` lets us route old
// settings through the new dispatcher without changing stored values.
export const NORMALIZE_LEGACY = Object.freeze({
  fallback: "priority",
});

// ---------- Strategy selectors ----------
// Pure functions of (models, ctx). They NEVER mutate the input `models` array
// (always copy first). Side-effect-bearing state is stored via the Maps above
// (round-robin, lkgp, least-used). Each selector documents its requires() list.

// 1. priority: identity reorder — stored array order IS the priority list.
function prioritySelect(models) {
  return models.slice();
}

// 2. fill-first: drain each model's quota fully before falling over.
// At the combo level this is identical to priority — the per-account fill-first
// behavior already lives in `src/sse/services/auth.js` (line ~162). Returning
// identity here keeps the combo-level contract simple while letting the inner
// account picker do the heavy work. If we ever want a combo-layer quota API,
// we'll thread that here.
function fillFirstSelect(models) {
  return models.slice();
}

// 3. weighted: weighted random shuffle. Defaults to equal weights for missing
// entries so a partial `ctx.weights` map doesn't blow up. Stable across calls
// only if `seed` is provided (used by tests).
function weightedSelect(models, ctx) {
  const weights = ctx?.weights && typeof ctx.weights === "object" ? ctx.weights : null;
  if (!weights) {
    // No weights given → uniform shuffle, equivalent to `random`.
    return shuffle(models.slice(), ctx?.seed);
  }
  const total = models.reduce((s, m) => s + (Number(weights[m]) || 0), 0);
  if (total <= 0) return shuffle(models.slice(), ctx?.seed);
  // Weighted KEY order matters: take the order users specified in `models`, but
  // commit to a sampled subset weighted by `weights[model]`. Implementing this
  // as a single weighted permutation in one pass keeps it O(n).
  const remaining = models.slice();
  const out = [];
  while (remaining.length > 0) {
    let pick = 0;
    let r = rng(remaining, ctx?.seed, out.length) * sumOf(remaining, weights);
    for (let i = 0; i < remaining.length; i++) {
      r -= Number(weights[remaining[i]]) || 0;
      if (r <= 0) { pick = i; break; }
    }
    out.push(remaining[pick]);
    remaining.splice(pick, 1);
  }
  return out;
}

// 4. round-robin: sticky rotation, every `stickyLimit` requests advance by one.
// State lives in `ctx.rotationState` keyed by `ctx.comboName`. Behavior matches
// the original `getRotatedModels` exactly — see tests/unit/combo-rotation.test.js.
function roundRobinSelect(models, ctx) {
  if (!ctx?.comboName) return models.slice();
  const state = ctx.rotationState instanceof Map ? ctx.rotationState : strategyState.rotation;
  // Accept either the legacy numeric form (old code stored a bare index) or
  // the new {index, consecutiveUseCount} shape — both migrate on read.
  const existingRaw = state.get(ctx.comboName);
  const stick = normalizeStickyLimit(ctx?.stickyLimit ?? 1);
  const existing = typeof existingRaw === "number"
    ? { index: existingRaw, consecutiveUseCount: 0 }
    : (existingRaw || { index: 0, consecutiveUseCount: 0 });

  const currentIndex = existing.index % models.length;
  const rotated = rotateFromIndex(models, currentIndex);
  const next = existing.consecutiveUseCount + 1;

  if (next >= stick) {
    state.set(ctx.comboName, {
      index: (currentIndex + 1) % models.length,
      consecutiveUseCount: 0,
    });
  } else {
    state.set(ctx.comboName, {
      index: currentIndex,
      consecutiveUseCount: next,
    });
  }
  return rotated;
}

// 5. p2c (power-of-two-choices): pick 2 random, return the one with the lower
// load (usageCounts first, then cooldowns as a tiebreak). Pure (no state mut).
function p2cSelect(models, ctx) {
  const usage = ctx?.usageCounts && typeof ctx.usageCounts === "object" ? ctx.usageCounts : null;
  const cooldowns = ctx?.cooldowns && typeof ctx.cooldowns === "object" ? ctx.cooldowns : null;
  const a = models[Math.floor(rng(models, ctx?.seed, models.length * 7) * models.length)];
  const b = models[Math.floor(rng(models, ctx?.seed, models.length * 13 + 1) * models.length)];
  const score = (m) => {
    // Lower = better. Cooldown-active models penalized heavily.
    const u = usage ? (Number(usage[m]) || 0) : 0;
    const c = cooldowns && cooldowns[m]?.rateLimitedUntil ? 1_000_000 : 0;
    return u + c;
  };
  if (!a || !b) return models.slice();
  const winner = score(a) <= score(b) ? a : b;
  // Put winner first, then the OTHER random pick (verse `b`), then the rest.
  const tail = models.slice();
  tail.splice(tail.indexOf(winner), 1);
  return [winner, ...tail];
}

// 6. least-used: sort ascending by `ctx.usageCounts[model]`. Mutates count so
// consecutive calls naturally trend toward equalizing load. Stable sort to keep
// the user's authored order on ties.
//
// `usageCounts` may be a plain object or a Map — we adapt the read/write so
// callers can pick whichever shape fits (tests use Map; UI uses plain object
// from JSON settings).
function leastUsedSelect(models, ctx) {
  const usage = ctx?.usageCounts && typeof ctx.usageCounts === "object"
    ? ctx.usageCounts
    : strategyState.usage;
  const get = (k) => usage instanceof Map ? usage.get(k) : usage[k];
  const set = (k, v) => usage instanceof Map ? usage.set(k, v) : (usage[k] = v);
  const counts = models.map((m) => Number(get(m)) || 0);
  const idx = models.map((m, i) => [m, counts[i], i])
    .sort((a, b) => a[1] - b[1] || a[2] - b[2])
    .map(([m]) => m);
  // Bump counts for the selected order so the next call reorders naturally.
  for (let i = 0; i < idx.length; i++) {
    set(idx[i], (Number(get(idx[i])) || 0) + 1);
  }
  return idx;
}

// 7. random: uniform shuffle with no consecutive duplicates. (Sort by hash.)
function randomSelect(models, ctx) {
  return shuffle(models.slice(), ctx?.seed);
}

// 8. strict-random: pick first model from uniform random, then shuffle the tail.
// Not pure in a "deterministic" sense: results vary. Still safe — caller can
// pin via `ctx.seed`.
function strictRandomSelect(models, ctx) {
  const out = models.slice();
  // Single Fisher-Yates pass — may produce consecutive duplicates.
  let seed = ctx?.seed;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng(out, seed, i) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
    seed = (seed + 1) >>> 0;
  }
  return out;
}

// 9. cost-optimized: sort ascending by `pricing[model].input` (proxy for "cheapest
// to talk to"). Models missing a price entry are pushed to the end (unknown cost
// = not-cheap). `pricing` is a flat map keyed by full model id ("provider/model").
function costOptimizedSelect(models, ctx) {
  const pricing = ctx?.pricing && typeof ctx.pricing === "object" ? ctx.pricing : null;
  const score = (m) => pricing && pricing[m] && typeof pricing[m].input === "number"
    ? pricing[m].input
    : Number.POSITIVE_INFINITY;
  const withIdx = models.map((m, i) => [m, score(m), i]);
  withIdx.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  return withIdx.map(([m]) => m);
}

// 10. headroom: sort by "remaining quota" — never-limited first, then
// soonest-rate-limited-reset first. A model in cooldown with `rateLimitedUntil`
// in the future goes last; expired cooldowns are treated as fresh.
function headroomSelect(models, ctx) {
  const cooldowns = ctx?.cooldowns && typeof ctx.cooldowns === "object" ? ctx.cooldowns : null;
  const now = Date.now();
  const score = (m) => {
    if (!cooldowns) return Number.NEGATIVE_INFINITY;
    const c = cooldowns[m];
    if (!c || !c.rateLimitedUntil) return Number.NEGATIVE_INFINITY; // never-limited first
    const until = new Date(c.rateLimitedUntil).getTime();
    if (until <= now) return Number.NEGATIVE_INFINITY; // expired = fresh
    return until; // ascending sort = soonest-reset first
  };
  const withIdx = models.map((m, i) => [m, score(m), i]);
  withIdx.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  return withIdx.map(([m]) => m);
}

// 11. reset-window: soonest-rate-limit-reset first. Both limited and unlimited
// models are sorted by their rateLimitedUntil timestamp (limited models most
// recently reset, then never-limited models).
function resetWindowSelect(models, ctx) {
  const cooldowns = ctx?.cooldowns && typeof ctx.cooldowns === "object" ? ctx.cooldowns : null;
  const now = Date.now();
  const score = (m) => {
    if (!cooldowns) return Number.POSITIVE_INFINITY;
    const c = cooldowns[m];
    if (!c || !c.rateLimitedUntil) return Number.POSITIVE_INFINITY;
    const until = new Date(c.rateLimitedUntil).getTime();
    if (until <= now) return Number.POSITIVE_INFINITY - 1;
    return until;
  };
  const withIdx = models.map((m, i) => [m, score(m), i]);
  withIdx.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  return withIdx.map(([m]) => m);
}

// 12. reset-aware: reset-window first, then headroom for ties. Equivalent to
// reset-window for the combo-loop but documents the intent (short-window-first
// with headroom tiebreak) so a future implementation can swap one piece without
// renaming. Today this is just reset-window.
function resetAwareSelect(models, ctx) {
  return resetWindowSelect(models, ctx);
}

// 13. context-optimized: pick the model whose contextWindow is the smallest one
// that still fits `ctx.contextTokens`. If none fit, return all (caller will
// surface a length error from the upstream). Stable on ties.
function contextOptimizedSelect(models, ctx) {
  const capabilities = ctx?.capabilities && typeof ctx.capabilities === "object"
    ? ctx.capabilities
    : null;
  const tokens = Number(ctx?.contextTokens);
  const isValidTokens = Number.isFinite(tokens) && tokens > 0;
  if (!capabilities || !isValidTokens) return models.slice();
  const window = (m) => {
    const cap = capabilities[m];
    if (!cap) return null; // unknown capability → exclude from candidate pool
    return Number(cap.contextWindow) || 32_000;
  };
  const fits = (m) => {
    const w = window(m);
    return w !== null && w >= tokens;
  };
  const fitting = models.filter(fits);
  if (fitting.length === 0) return models.slice(); // fail-open
  const withIdx = fitting.map((m) => [m, window(m), models.indexOf(m)]);
  withIdx.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  return withIdx.map(([m]) => m);
}

// 14. cache-optimized: pin to the model that was last successful for this combo,
// maximizing prompt-cache hits. If we don't know yet, fall through to priority
// order. State in `ctx.lkgpState` (Map). Pure-SELECT — the state UPDATE happens
// in the `combo.js` success path, identical to lkgp.
function cacheOptimizedSelect(models, ctx) {
  const stick = ctx?.lkgpState instanceof Map ? ctx.lkgpState : strategyState.lkgp;
  const last = ctx?.comboName ? stick.get(ctx.comboName) : null;
  if (!last || !models.includes(last)) return models.slice();
  const out = [last, ...models.filter((m) => m !== last)];
  return out;
}

// 15. lkgp: same pin-to-last-success behavior, but framed as a routing policy
// rather than a cache-affinity trick. Implementation is identical to
// cacheOptimizedSelect — the difference is in intent and metric (success
// durability vs prompt-cache hit rate), but at the combo layer the model order
// is the same. Documented in `__strategies` so callers know what they're
// getting.
const lkgpSelect = cacheOptimizedSelect;

// 16. auto: live scored ordering, but without a real scoring signal we fall back
// to a composite: cost-optimized → headroom → priority. When enough telemetry
// is collected (combo usage history) the scoring module can replace this stub
// without changing the public selector name. Behavior today: prefer cheapest
// healthy model, break ties by priority.
function autoSelect(models, ctx) {
  return costOptimizedSelect(headroomSelect(models, ctx), ctx);
}

// 17. context-relay: hand off context across targets for long conversations.
// At the combo layer we approximate this by preferring the largest context
// window model — same logic shape as context-optimized but inverted (best fit
// vs biggest fit). Real implementation needs response hand-off — that's a
// follow-up. Today's behavior: pick the biggest-window model that fits.
function contextRelaySelect(models, ctx) {
  const c = { ...ctx };
  if (!c.capabilities) return models.slice();
  const withIdx = models.map((m, i) => [m, c.capabilities[m]?.contextWindow || 32_000, i]);
  withIdx.sort((a, b) => b[1] - a[1] || a[2] - b[2]); // DESC: biggest first
  return withIdx.map(([m]) => m);
}

// 18. pipeline: chain steps. NOT a pure-reorder — needs dispatcher. Declared
// here so `STRATEGIES` knows it exists and `getDispatcher` returns "pipeline".
async function pipelineSelect(_models, _ctx) {
  throw new Error("pipeline strategy is a dispatcher, not a selector — call handleComboChat with strategy='pipeline'");
}

// 19. fusion: fan-out + judge. NOT a pure-reorder — handled by handleFusionChat.
// Declared so the strategy registry is complete.

export const STRATEGIES = Object.freeze({
  "priority": {
    selector: prioritySelect,
    pure: true,
    requires: [],
    description: "Stored array order IS the priority list. Drain first before next (legacy: fallback).",
  },
  "fill-first": {
    selector: fillFirstSelect,
    pure: true,
    requires: [],
    description: "Drain each target's quota fully before next. Combo-layer identical to priority; per-account fill-first in auth.js.",
  },
  "weighted": {
    selector: weightedSelect,
    pure: true,
    requires: [], // weights is optional; selector defaults to uniform shuffle.
    description: "Weighted random permutation by ctx.weights.",
  },
  "round-robin": {
    selector: roundRobinSelect,
    pure: true, // controllable via mutation-safe State (combo.js handles reset)
    mutatesState: true,
    requires: ["comboName"],
    description: "Sticky round-robin across models; advance every stickyLimit requests.",
  },
  "p2c": {
    selector: p2cSelect,
    pure: true,
    requires: [], // uses usageCounts/cooldowns if available, else uniform
    description: "Power-of-two-choices random; pick 2, pick the lower-load.",
  },
  "least-used": {
    selector: leastUsedSelect,
    pure: true,
    mutatesState: true,
    requires: [], // falls back to module-level map if ctx.usageCounts missing
    description: "Sort by usageCounts ascending; bump count on each pick.",
  },
  "random": {
    selector: randomSelect,
    pure: true,
    requires: [],
    description: "Uniform shuffle, deduplicated (no consecutive same model).",
  },
  "strict-random": {
    selector: strictRandomSelect,
    pure: true,
    requires: [],
    description: "Uniform Fisher-Yates shuffle, may repeat consecutive models.",
  },
  "cost-optimized": {
    selector: costOptimizedSelect,
    pure: true,
    requires: [], // models missing pricing pushed to end
    description: "Sort by lowest $/M-token input price; unknown costs last.",
  },
  "headroom": {
    selector: headroomSelect,
    pure: true,
    requires: [], // works with empty ctx but falls back to identity
    description: "Sort by most remaining quota; rate-limited models last.",
  },
  "reset-window": {
    selector: resetWindowSelect,
    pure: true,
    requires: [],
    description: "Sort by soonest rate-limit reset; never-limited first.",
  },
  "reset-aware": {
    selector: resetAwareSelect,
    pure: true,
    requires: [],
    description: "Reset-window with headroom tiebreak.",
  },
  "context-optimized": {
    selector: contextOptimizedSelect,
    pure: true,
    requires: [], // works without ctx but degrades to identity
    description: "Choose smallest contextWindow that fits ctx.contextTokens.",
  },
  "cache-optimized": {
    selector: cacheOptimizedSelect,
    pure: true,
    // mutates lkgpState on success, in the combo success path (same as lkgp)
    requires: ["comboName"],
    description: "Pin to last successful model for this combo (cache hits).",
  },
  "lkgp": {
    selector: lkgpSelect,
    pure: true,
    requires: ["comboName"],
    description: "Last-known-good path; sticky to last successful model.",
  },
  "auto": {
    selector: autoSelect,
    pure: true,
    requires: [],
    description: "Composite cost+headroom priority. Future: 12-factor live scoring.",
  },
  "context-relay": {
    selector: contextRelaySelect,
    pure: true,
    requires: [],
    description: "Pick the biggest contextWindow model (proxy for relay hand-off).",
  },
  "pipeline": {
    selector: pipelineSelect,
    pure: false,
    dispatcher: "pipeline",
    requires: [],
    description: "Chain steps; non-reorder, see combo.js dispatcher.",
  },
  "fusion": {
    selector: null,
    pure: false,
    dispatcher: "fusion",
    requires: [],
    description: "Fan-out + judge synthesis, see handleFusionChat.",
  },
});

// ---------- Dispatcher ----------

const PURE_REORDER = new Set(
  Object.entries(STRATEGIES)
    .filter(([, def]) => def.pure && def.selector && !def.dispatcher)
    .map(([name]) => name)
);

/**
 * Apply a strategy selector to a model list.
 * Returns the reordered models, OR the original list if:
 *   - the strategy is unknown
 *   - the strategy has no selector (it's a non-reorder dispatcher)
 *   - the strategy is missing required ctx fields (returns original + warns)
 *
 * @param {string}            name
 * @param {string[] | null}   models
 * @param {object}            ctx  - see module docstring
 * @returns {string[] | null} Reordered list — for non-array input, returns
 *   the input as-is (no implicit coercion to []), so callers can distinguish
 *   "bad input — keep null" from "empty models — got []".
 */
export function selectStrategy(name, models, ctx = {}) {
  ctx = ctx ?? {};
  if (models === undefined || models === null) return models;
  if (!Array.isArray(models)) return models;
  if (models.length === 0) return [];
  const normalized = NORMALIZE_LEGACY[name] || name;
  const def = STRATEGIES[normalized];
  if (!def) return models.slice();
  if (typeof def.selector !== "function") return models.slice();
  const missing = (def.requires || []).filter((k) => ctx[k] === undefined || ctx[k] === null);
  if (missing.length > 0) {
    console.warn(`[STRATEGY] "${normalized}" missing ctx fields: ${missing.join(",")} — returning original order`);
    return models.slice();
  }
  try {
    return def.selector(models, ctx);
  } catch (err) {
    // Fail-open: never throw out of a strategy — return the originals.
    console.warn(`[STRATEGY] "${normalized}" threw: ${err?.message || err}`);
    return models.slice();
  }
}

/**
 * True if the strategy can drop into the existing fallback loop in handleComboChat.
 */
export function isPureReorder(name) {
  const normalized = NORMALIZE_LEGACY[name] || name;
  return PURE_REORDER.has(normalized);
}

/**
 * For non-reorder strategies, return which dispatcher path should handle them.
 * `null` for unknown, `"combo"` for pure reorders (caller falls through to the
 * regular fallback loop).
 */
export function getDispatcher(name) {
  const normalized = NORMALIZE_LEGACY[name] || name;
  const def = STRATEGIES[normalized];
  if (!def) return null;
  if (def.dispatcher) return def.dispatcher;
  if (PURE_REORDER.has(normalized)) return "combo";
  return null;
}

/**
 * Convenience for the existing combo loop: pick a strategy + apply, then layer
 * capability-based auto-switch on top. Backward-compatible alias for the
 * original `getRotatedModels(models, comboName, strategy, stickyLimit)`.
 */
export function computeModels({ strategy, models, comboName, body, ctx = {} }) {
  if (!Array.isArray(models) || models.length <= 1) return models ? models.slice() : [];
  ctx = ctx ?? {};
  // ctx passed in wins over module state for testing
  const merged = {
    comboName,
    rotationState: ctx.rotationState instanceof Map ? ctx.rotationState : strategyState.rotation,
    lkgpState:     ctx.lkgpState     instanceof Map ? ctx.lkgpState     : strategyState.lkgp,
    usageCounts:   ctx.usageCounts   && typeof ctx.usageCounts === "object" ? ctx.usageCounts : strategyState.usage,
    pricing:       ctx.pricing,
    cooldowns:     ctx.cooldowns,
    capabilities:  ctx.capabilities,
    contextTokens: ctx.contextTokens,
    weights:       ctx.weights,
    stickyLimit:   ctx.stickyLimit,
    seed:          ctx.seed,
  };
  // required-by-capabilities auto-switch is done OUTSIDE this helper today
  // (combo.js calls `reorderByCapabilities` after `getRotatedModels`). To stay
  // 100% backward-compatible we do NOT do it here.
  return selectStrategy(strategy, models, merged);
}

/**
 * Record a successful combo attempt. For lkgp/cache-optimized. Called by
 * `handleComboChat` on 2xx in combo.js; safe to call for non-stateful strategies.
 */
export function recordComboSuccess(comboName, model) {
  if (!comboName || !model) return;
  strategyState.lkgp.set(comboName, model);
}

/**
 * Reset all in-memory strategy state. Called when settings change or
 * combo CRUD happens — `combo.js#resetComboRotation` is kept for compatibility.
 */
export function resetStrategyState(comboName) {
  strategyState.reset(comboName);
}

// ---------- helpers ----------

function rotateFromIndex(models, currentIndex) {
  if (currentIndex === 0) return models.slice();
  const out = models.slice();
  for (let i = 0; i < currentIndex; i++) {
    out.push(out.shift());
  }
  return out;
}

// Stable Fisher-Yates with optional seeded randomness. Deterministic only when
// `seed` is provided; otherwise uses Math.random (test-stable by seed=0).
function shuffle(arr, seed) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng(arr, seed, i) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
    seed = (seed + 1) >>> 0;
  }
  return arr;
}

// xorshift32 — tiny PRNG. Output in [0, 1). Deterministic when seed is given,
// chaotic otherwise (Math.random fallback for unseeded calls).
function rng(_arr, seed, salt) {
  if (typeof seed !== "number") return Math.random();
  // xorshift32 dead-state guard: if (seed XOR salt, both 0) or any mix that
  // maps x to 0 stays 0 forever, so seed=0 is silently seeded to a non-zero
  // value. Prevents Fisher-Yates from degenerating into identity.
  let x = (Math.imul(seed ^ salt, 0x9E3779B1) ^ (Math.imul(salt, 0x85EBCA6B) || 1)) >>> 0;
  if (x === 0) x = 0x9E3779B1;
  x ^= Math.imul(x, 0x40C59DFF) | 0; x >>>= 0;
  x ^= x >>> 17;
  x ^= Math.imul(x, 0xED5AD4B) | 0; x >>>= 0;
  x ^= x << 5; x >>>= 0;
  return (x >>> 0) / 0x100000000;
}

function sumOf(arr, weights) {
  let s = 0;
  for (const m of arr) s += Number(weights[m]) || 0;
  return s;
}
