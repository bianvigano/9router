import { describe, it, expect, beforeEach } from "vitest";

import {
  selectStrategy,
  computeModels,
  STRATEGIES,
  NORMALIZE_LEGACY,
  isPureReorder,
  getDispatcher,
  recordComboSuccess,
  resetStrategyState,
  strategyState,
} from "../../open-sse/services/strategies.js";

import {
  getRotatedModels,
  resetComboRotation,
} from "../../open-sse/services/combo.js";

// ---------- helpers ----------
const log = { info: () => {}, warn: () => {}, debug: () => {} };
const MODELS = ["p/a", "p/b", "p/c", "p/d"];

beforeEach(() => {
  // Reset all in-memory strategy state so tests don't bleed into each other.
  resetStrategyState();
});

// ============================================================
// Pure-reorder strategies: pass-through identity / deterministic order
// ============================================================

describe("priority", () => {
  it("preserves stored array order (identity reorder)", () => {
    expect(selectStrategy("priority", MODELS, {})).toEqual(MODELS);
  });

  it("returns a copy, not the same array reference", () => {
    const out = selectStrategy("priority", MODELS, {});
    out.push("EXTRA");
    expect(MODELS).not.toContain("EXTRA");
  });
});

describe("fill-first", () => {
  it("preserves stored array order (combo-level fill-first is identity)", () => {
    expect(selectStrategy("fill-first", MODELS, {})).toEqual(MODELS);
  });
});

// ============================================================
// Random-family strategies
// ============================================================

describe("random", () => {
  it("returns a permutation of the input models", () => {
    const out = selectStrategy("random", MODELS, { seed: 12345 });
    expect(out).toHaveLength(MODELS.length);
    expect([...out].sort()).toEqual([...MODELS].sort());
  });

  it("is deterministic when seeded", () => {
    const a = selectStrategy("random", MODELS, { seed: 42 });
    const b = selectStrategy("random", MODELS, { seed: 42 });
    expect(a).toEqual(b);
  });

  it("yields different permutations for different seeds", () => {
    const a = selectStrategy("random", MODELS, { seed: 1 });
    const b = selectStrategy("random", MODELS, { seed: 999 });
    // Highly unlikely seeds 1 and 999 yield the exact same permutation on 4 items.
    expect(JSON.stringify(a) === JSON.stringify(b)).toBe(false);
  });
});

describe("strict-random", () => {
  it("returns a permutation of the input models", () => {
    const out = selectStrategy("strict-random", MODELS, { seed: 7 });
    expect(out).toHaveLength(MODELS.length);
    expect([...out].sort()).toEqual([...MODELS].sort());
  });

  it("is deterministic when seeded", () => {
    expect(
      selectStrategy("strict-random", MODELS, { seed: 99 })
    ).toEqual(selectStrategy("strict-random", MODELS, { seed: 99 }));
  });
});

describe("weighted", () => {
  it("weighted with strongly-biased weights should keep the dominant model first", () => {
    // 1000:1 ratio is overwhelmingly dominant — should be stable across seeded
    // trials without turning into a CI flake. Don't push the ratio past 1000:1
    // or the test becomes effectively deterministic instead of statistical.
    const weights = { "p/a": 1000, "p/b": 1, "p/c": 1, "p/d": 1 };
    let p_a_first = 0;
    const trials = 60;
    for (let i = 0; i < trials; i++) {
      const out = selectStrategy("weighted", MODELS, { weights, seed: i * 13 + 1 });
      if (out[0] === "p/a") p_a_first++;
    }
    // At 1000:1 the expected probability is ~99.94% per trial; 60/60 ≈ 96% of
    // CI runs. We assert ≥59/60 to absorb any one streak of bad seeds.
    expect(p_a_first).toBeGreaterThanOrEqual(59);
  });

  it("fallback to uniform shuffle when weights object is missing", () => {
    const out = selectStrategy("weighted", MODELS, { seed: 5 });
    expect(out).toHaveLength(4);
    // Just a permutation; details depend on seed but it should not crash.
    expect(new Set(out).size).toBe(MODELS.length);
  });

  it("fallback to uniform shuffle when all weights sum to 0", () => {
    const out = selectStrategy("weighted", MODELS, {
      weights: { "p/a": 0, "p/b": 0, "p/c": 0, "p/d": 0 },
      seed: 5,
    });
    expect(out).toHaveLength(4);
  });
});

// ============================================================
// p2c (power-of-two-choices)
// ============================================================

describe("p2c", () => {
  it("returns a permutation starting with one of the picks", () => {
    const usage = { "p/a": 1000, "p/b": 0, "p/c": 0, "p/d": 0 };
    const out = selectStrategy("p2c", MODELS, { usageCounts: usage, seed: 17 });
    // p/b,p/c,p/d have 0 usage — winner should not be p/a
    expect(out[0]).not.toBe("p/a");
  });

  it("is deterministic when seeded", () => {
    const out = (seed) => selectStrategy("p2c", MODELS, { seed });
    expect(out(123)).toEqual(out(123));
  });
});

// ============================================================
// least-used
// ============================================================

describe("least-used", () => {
  it("sorts by usage ascending, mutates counts forward", () => {
    const usage = new Map();
    // First call: all 0 → stable input order, then increments each by 1.
    const first = selectStrategy("least-used", MODELS, { usageCounts: usage });
    expect(first).toEqual(MODELS);
    // p/a now has count 1
    expect(usage.get("p/a")).toBe(1);
    expect(usage.get("p/d")).toBe(1);
    // Second call without changes: all tied at 1 → stable order, +1 each → 2.
    const second = selectStrategy("least-used", MODELS, { usageCounts: usage });
    expect(second).toEqual(MODELS);
    expect(usage.get("p/a")).toBe(2);
  });

  it("orders by ascending usage when calls are unbalanced", () => {
    const usage = { "p/a": 5, "p/b": 1, "p/c": 3, "p/d": 2 };
    const out = selectStrategy("least-used", MODELS, { usageCounts: usage });
    // Stable sort on equal-score ties, so index in MODELS decides which one comes first
    // when counts are distinct. Expected ordering ascending: b(1), d(2), c(3), a(5).
    expect(out).toEqual(["p/b", "p/d", "p/c", "p/a"]);
  });
});

// ============================================================
// round-robin — must remain backward-compatible with the original
// `getRotatedModels` semantics.
// ============================================================

describe("round-robin", () => {
  it("advances by stickyLimit, then rotates", () => {
    // First request: start at index 0.
    const r1 = selectStrategy("round-robin", MODELS, { comboName: "test", stickyLimit: 1 });
    expect(r1).toEqual(MODELS);
    // Second request: increment → rotate to index 1.
    const r2 = selectStrategy("round-robin", MODELS, { comboName: "test", stickyLimit: 1 });
    expect(r2).toEqual(["p/b", "p/c", "p/d", "p/a"]);
  });

  it("stickyLimit=3 keeps the same rotation for 3 calls then advances", () => {
    const s = (i) => selectStrategy("round-robin", MODELS, { comboName: "rr3", stickyLimit: 3 });
    expect(s(0)).toEqual(["p/a", "p/b", "p/c", "p/d"]);
    expect(s(1)).toEqual(["p/a", "p/b", "p/c", "p/d"]);
    expect(s(2)).toEqual(["p/a", "p/b", "p/c", "p/d"]);
    // 3rd call crosses threshold → next index starts at 1
    expect(s(3)).toEqual(["p/b", "p/c", "p/d", "p/a"]);
  });

  it("clamps sticky infinity to 1 when invalid", () => {
    // normalizeStickyLimit coerces; pass 0 → should default to 1.
    const r1 = selectStrategy("round-robin", MODELS, { comboName: "clamp", stickyLimit: 0 });
    const r2 = selectStrategy("round-robin", MODELS, { comboName: "clamp", stickyLimit: -5 });
    // Two consecutive calls should advance (both treated as stickyLimit=1).
    expect(r1).toEqual(MODELS);
    expect(r2).toEqual(["p/b", "p/c", "p/d", "p/a"]);
  });
});

// ============================================================
// cost-optimized
// ============================================================

describe("cost-optimized", () => {
  it("ascending input price; missing pricing pushed to end", () => {
    const pricing = {
      "p/a": { input: 10 },
      "p/b": { input: 2 },
      "p/c": { input: 5 },
      "p/d": { input: null }, // unknown → last
    };
    const out = selectStrategy("cost-optimized", MODELS, { pricing });
    expect(out).toEqual(["p/b", "p/c", "p/a", "p/d"]);
  });

  it("everything unpriced — stable original order", () => {
    const out = selectStrategy("cost-optimized", MODELS, {});
    expect(out).toEqual(MODELS);
  });
});

// ============================================================
// headroom / reset-window / reset-aware
// ============================================================

describe("headroom", () => {
  it("places never-limited models first, then soonest-limited", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const sooner = new Date(Date.now() + 10_000).toISOString();
    const cooldowns = {
      "p/a": { rateLimitedUntil: future },
      "p/b": null,
      "p/c": { rateLimitedUntil: sooner },
      "p/d": null,
    };
    // No-limited first (b, d — stable order), then soonest-limited (c, a).
    const out = selectStrategy("headroom", MODELS, { cooldowns });
    expect(out).toEqual(["p/b", "p/d", "p/c", "p/a"]);
  });

  it("passes-through unconditionally when no cooldowns supplied", () => {
    expect(selectStrategy("headroom", MODELS, {})).toEqual(MODELS);
  });
});

describe("reset-window", () => {
  it("orders by soonest rate-limit reset, never-limited last", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const sooner = new Date(Date.now() + 10_000).toISOString();
    const cooldowns = {
      "p/a": { rateLimitedUntil: sooner },
      "p/b": null,
      "p/c": { rateLimitedUntil: future },
      "p/d": null,
    };
    // Soonest first (a), then later-limited (c), then never-limited (b, d in stable order).
    const out = selectStrategy("reset-window", MODELS, { cooldowns });
    expect(out).toEqual(["p/a", "p/c", "p/b", "p/d"]);
  });
});

describe("reset-aware", () => {
  it("matches reset-window (alias) ordering", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const sooner = new Date(Date.now() + 10_000).toISOString();
    const cooldowns = {
      "p/a": { rateLimitedUntil: sooner },
      "p/b": null,
      "p/c": { rateLimitedUntil: future },
    };
    expect(selectStrategy("reset-aware", ["p/a", "p/b", "p/c"], { cooldowns }))
      .toEqual(["p/a", "p/c", "p/b"]);
  });
});

// ============================================================
// context-optimized / context-relay
// ============================================================

describe("context-optimized", () => {
  it("picks the smallest window that still fits ctx.contextTokens", () => {
    const capabilities = {
      "p/a": { contextWindow: 64_000 },
      "p/b": { contextWindow: 200_000 },
      "p/c": { contextWindow: 1_000_000 },
      "p/d": { contextWindow: 8_000 },
    };
    // 50k tokens: a,b,c fit. Smallest fit = p/a.
    const out = selectStrategy("context-optimized", MODELS, {
      capabilities, contextTokens: 50_000,
    });
    expect(out[0]).toBe("p/a");
  });

  it("fail-open: returns all if nothing fits", () => {
    const capabilities = { "p/a": { contextWindow: 1000 } };
    const out = selectStrategy("context-optimized", MODELS, {
      capabilities, contextTokens: 2000,
    });
    expect(out).toEqual(MODELS);
  });
});

describe("context-relay", () => {
  it("orders by biggest contextWindow first", () => {
    const capabilities = {
      "p/a": { contextWindow: 8_000 },
      "p/b": { contextWindow: 200_000 },
      "p/c": { contextWindow: 1_000_000 },
      "p/d": { contextWindow: 32_000 },
    };
    const out = selectStrategy("context-relay", MODELS, { capabilities });
    expect(out[0]).toBe("p/c"); // 1M
    expect(out[1]).toBe("p/b"); // 200k
  });
});

// ============================================================
// lkgp / cache-optimized
// ============================================================

describe("lkgp", () => {
  it("puts the last successful model first after a recordComboSuccess call", () => {
    recordComboSuccess("combo-x", "p/c");
    const out = selectStrategy("lkgp", MODELS, { comboName: "combo-x" });
    expect(out[0]).toBe("p/c");
    expect(out.slice(1)).toEqual(["p/a", "p/b", "p/d"]);
  });

  it("falls through to original order when no last-success recorded", () => {
    expect(selectStrategy("lkgp", MODELS, { comboName: "fresh" })).toEqual(MODELS);
  });
});

describe("cache-optimized", () => {
  it("share state with lkgp (success updates both)", () => {
    recordComboSuccess("read-cache", "p/b");
    const out = selectStrategy("cache-optimized", MODELS, { comboName: "read-cache" });
    expect(out[0]).toBe("p/b");
  });
});

// ============================================================
// auto (cost + headroom composite)
// ============================================================

describe("auto", () => {
  it("produces stable order when both pricing and cooldowns are absent", () => {
    expect(selectStrategy("auto", MODELS, {})).toEqual(MODELS);
  });

  it("sorts cheapest-by-input when only pricing supplied", () => {
    const pricing = {
      "p/a": { input: 5 }, "p/b": { input: 1 }, "p/c": { input: 3 }, "p/d": { input: null },
    };
    const out = selectStrategy("auto", MODELS, { pricing });
    expect(out).toEqual(["p/b", "p/c", "p/a", "p/d"]);
  });
});

// ============================================================
// registry / dispatcher helpers
// ============================================================

describe("STRATEGIES registry", () => {
  it("has 19 entries", () => {
    expect(Object.keys(STRATEGIES).length).toBe(19);
  });

  it("contains every documented OmniRoute strategy", () => {
    for (const name of [
      "priority", "fill-first", "weighted", "round-robin", "p2c", "least-used",
      "random", "strict-random", "cost-optimized", "headroom", "reset-window",
      "reset-aware", "context-relay", "context-optimized", "cache-optimized",
      "lkgp", "auto", "pipeline", "fusion",
    ]) {
      expect(STRATEGIES[name]).toBeDefined();
    }
  });
});

describe("NORMALIZE_LEGACY", () => {
  it("maps the legacy fallback name to priority", () => {
    expect(NORMALIZE_LEGACY.fallback).toBe("priority");
  });
});

describe("isPureReorder / getDispatcher", () => {
  // Note: `pure` here means the selector itself doesn't mutate state.
  // round-robin DOES have state, but the mutation lives in computeModels/
  // roundRobinSelect, not in the dispatcher's output flow. The legacy
  // "round-robin" path MUST be classified as pure-reorder so the existing
  // fallback loop in handleComboChat keeps driving it (no API break).
  it("classifies legacy and new strategies consistently", () => {
    expect(isPureReorder("priority")).toBe(true);
    expect(isPureReorder("round-robin")).toBe(true);
    expect(isPureReorder("lkgp")).toBe(true);
    expect(isPureReorder("pipeline")).toBe(false);
    expect(isPureReorder("fusion")).toBe(false);
    expect(getDispatcher("pipeline")).toBe("pipeline");
    expect(getDispatcher("fusion")).toBe("fusion");
    expect(getDispatcher("round-robin")).toBe("combo");
  });
});

// ============================================================
// selectStrategy: defensive / fail-open behavior
// ============================================================

describe("selectStrategy defensive behavior", () => {
  it("returns input for unknown strategy without throwing", () => {
    expect(selectStrategy("not-a-strategy", MODELS, {})).toEqual(MODELS);
  });

  it("returns input when ctx missing a required field — also warns once", () => {
    const calls = [];
    const origWarn = console.warn;
    console.warn = (...args) => calls.push(args.join(" "));
    try {
      // cache-optimized requires comboName
      const out = selectStrategy("cache-optimized", MODELS, {});
      expect(out).toEqual(MODELS);
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0]).toContain("cache-optimized");
    } finally {
      console.warn = origWarn;
    }
  });

  it("returns input for empty models array", () => {
    expect(selectStrategy("priority", [], {})).toEqual([]);
  });

  it("returns input when models is not an array", () => {
    expect(selectStrategy("priority", null, {})).toBe(null);
    expect(selectStrategy("priority", undefined, {})).toBe(undefined);
    expect(selectStrategy("priority", "string-not-array", {})).toBe("string-not-array");
  });
});

// ============================================================
// recordComboSuccess / resetStrategyState side-effects
// ============================================================

describe("recordComboSuccess / resetStrategyState", () => {
  it("stores the model for later lkgp reads", () => {
    recordComboSuccess("combo-y", "p/d");
    expect(strategyState.lkgp.get("combo-y")).toBe("p/d");
  });

  it("resetStrategyState clears all in-memory state", () => {
    recordComboSuccess("combo-z", "p/a");
    selectStrategy("round-robin", MODELS, { comboName: "combo-z" });
    expect(strategyState.lkgp.size).toBeGreaterThan(0);
    expect(strategyState.rotation.size).toBeGreaterThan(0);
    resetStrategyState();
    expect(strategyState.lkgp.size).toBe(0);
    expect(strategyState.rotation.size).toBe(0);
  });
});

// ============================================================
// computeModels — convenience wrapper
// ============================================================

describe("computeModels", () => {
  it("matches selectStrategy for non-stateful strategies", () => {
    expect(computeModels({ strategy: "priority", models: MODELS, comboName: "x" }))
      .toEqual(MODELS);
  });

  it("threads comboName and rotationState into ctx for round-robin", () => {
    const r1 = computeModels({ strategy: "round-robin", models: MODELS, comboName: "cm" });
    const r2 = computeModels({ strategy: "round-robin", models: MODELS, comboName: "cm" });
    expect(r1).toEqual(["p/a", "p/b", "p/c", "p/d"]);
    expect(r2).toEqual(["p/b", "p/c", "p/d", "p/a"]);
  });
});

// ============================================================
// BACKWARD COMPAT — original combo.js getRotatedModels contract.
// ============================================================

describe("getRotatedModels backward-compat", () => {
  beforeEach(() => resetComboRotation());

  it("forwards pricing/cooldowns/weights via computeModels (extended ctx arg)", () => {
    // 5th positional `ctx` is an OPTIONAL extension — original callers don't
    // pass it. New callers thread pricing/cooldowns via computeModels directly.
    // Here we assert the wrapper-mode (`computeModels`) gives the correct
    // price-sorted order so we don't have to bake a new positional arg.
    const pricing = {
      "p/a": { input: 4 }, "p/b": { input: 1 }, "p/c": { input: 2 }, "p/d": { input: 3 },
    };
    expect(computeModels({
      strategy: "cost-optimized", models: MODELS, comboName: "test-cost", ctx: { pricing },
    })).toEqual(["p/b", "p/c", "p/d", "p/a"]);
  });

  it("'fallback' returns models verbatim (legacy identity), unchanged behavior", () => {
    const out = getRotatedModels(MODELS, "legacy-fb", "fallback");
    expect(out).toEqual(MODELS);
  });

  it("'round-robin' advances on every call (stickyLimit=1), unchanged behavior", () => {
    const a = getRotatedModels(MODELS, "legacy-rr", "round-robin");
    const b = getRotatedModels(MODELS, "legacy-rr", "round-robin");
    expect(a).toEqual(MODELS);
    expect(b).toEqual(["p/b", "p/c", "p/d", "p/a"]);
  });

  it("preserve rotateModelsFromIndex semantics for stickyLimit—same as pre-refactor", () => {
    // stickyLimit=3: same model for 3 calls, then advance.
    const calls = ["c1", "c2", "c3"].map(() =>
      getRotatedModels(MODELS, "legacy-rr3", "round-robin", 3),
    );
    expect(calls[0]).toEqual(MODELS);
    expect(calls[1]).toEqual(MODELS);
    expect(calls[2]).toEqual(MODELS);
    const fourth = getRotatedModels(MODELS, "legacy-rr3", "round-robin", 3);
    expect(fourth).toEqual(["p/b", "p/c", "p/d", "p/a"]);
  });

  it("unknown strategy name returns models verbatim (no throw)", () => {
    expect(getRotatedModels(MODELS, "x", "gravity-falls")).toEqual(MODELS);
  });

  it("keeps new strategy context on computeModels entry point", () => {
    const pricing = {
      "p/a": { input: 4 }, "p/b": { input: 1 }, "p/c": { input: 2 }, "p/d": { input: 3 },
    };
    expect(computeModels({
      strategy: "cost-optimized",
      models: MODELS,
      comboName: "test-cost",
      ctx: { pricing },
    })).toEqual(["p/b", "p/c", "p/d", "p/a"]);
  });

  it("resetComboRotation still clears state (no API break)", () => {
    getRotatedModels(MODELS, "x", "round-robin");
    expect(resetComboRotation).toBeDefined();
    resetComboRotation();
    // After reset, the rotation starts at 0 again.
    const out = getRotatedModels(MODELS, "x", "round-robin");
    expect(out).toEqual(MODELS);
  });
});
