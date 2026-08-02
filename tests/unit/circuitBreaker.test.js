import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkProviderCircuit,
  recordProviderFailure,
  recordProviderSuccess,
  getCircuitState,
  getAllCircuitStates,
  resetCircuit,
} from "../../src/sse/services/circuitBreaker.js";

describe("circuitBreaker", () => {
  beforeEach(() => {
    resetCircuit();
    vi.useRealTimers();
  });

  describe("CLOSED state", () => {
    it("allows requests when no failures recorded", () => {
      expect(checkProviderCircuit("test").blocked).toBe(false);
    });

    it("stays CLOSED after 4 failures (below threshold)", () => {
      for (let i = 0; i < 4; i++) recordProviderFailure("test");
      expect(checkProviderCircuit("test").blocked).toBe(false);
      expect(getCircuitState("test").state).toBe("CLOSED");
    });

    it("transitions to OPEN after 5 failures within window", () => {
      for (let i = 0; i < 5; i++) recordProviderFailure("test");
      const r = checkProviderCircuit("test");
      expect(r.blocked).toBe(true);
      expect(getCircuitState("test").state).toBe("OPEN");
    });

    it("resets failure count on success in CLOSED", () => {
      for (let i = 0; i < 3; i++) recordProviderFailure("test");
      recordProviderSuccess("test");
      // 3 more failures after reset should not open the circuit
      for (let i = 0; i < 3; i++) recordProviderFailure("test");
      expect(checkProviderCircuit("test").blocked).toBe(false);
    });
  });

  describe("OPEN → HALF_OPEN transition", () => {
    it("blocks requests while OPEN and within cooldown", () => {
      for (let i = 0; i < 5; i++) recordProviderFailure("test");
      expect(checkProviderCircuit("test").blocked).toBe(true);
    });

    it("transitions to HALF_OPEN after cooldown", () => {
      vi.useFakeTimers();
      for (let i = 0; i < 5; i++) recordProviderFailure("test");
      expect(getCircuitState("test").state).toBe("OPEN");

      // advance past cooldown (30s)
      vi.advanceTimersByTime(31_000);

      expect(checkProviderCircuit("test").blocked).toBe(false);
      expect(getCircuitState("test").state).toBe("HALF_OPEN");
    });

    it("only allows one probe in HALF_OPEN", () => {
      vi.useFakeTimers();
      for (let i = 0; i < 5; i++) recordProviderFailure("test");
      vi.advanceTimersByTime(31_000);

      // first request = probe allowed
      expect(checkProviderCircuit("test").blocked).toBe(false);
      // second request = blocked (probe already in flight)
      expect(checkProviderCircuit("test").blocked).toBe(true);
    });
  });

  describe("HALF_OPEN recovery", () => {
    it("transitions to CLOSED on probe success", () => {
      vi.useFakeTimers();
      for (let i = 0; i < 5; i++) recordProviderFailure("test");
      vi.advanceTimersByTime(31_000);
      checkProviderCircuit("test"); // enter HALF_OPEN, probe count=1

      recordProviderSuccess("test");
      expect(getCircuitState("test").state).toBe("CLOSED");
    });

    it("transitions back to OPEN on probe failure", () => {
      vi.useFakeTimers();
      for (let i = 0; i < 5; i++) recordProviderFailure("test");
      vi.advanceTimersByTime(31_000);
      checkProviderCircuit("test"); // HALF_OPEN

      recordProviderFailure("test");
      expect(getCircuitState("test").state).toBe("OPEN");
    });
  });

  describe("sliding window", () => {
    it("prunes old failures — 5 old failures + 1 new ≠ OPEN", () => {
      vi.useFakeTimers();
      // 5 failures at t=0
      for (let i = 0; i < 5; i++) recordProviderFailure("test");
      // advance past window (60s)
      vi.advanceTimersByTime(61_000);
      // 1 new failure at t=61s — should not open
      recordProviderFailure("test");
      expect(checkProviderCircuit("test").blocked).toBe(false);
    });
  });

  describe("per-provider isolation", () => {
    it("openai circuit opens but anthropic stays CLOSED", () => {
      for (let i = 0; i < 5; i++) recordProviderFailure("openai");
      expect(checkProviderCircuit("openai").blocked).toBe(true);
      expect(checkProviderCircuit("anthropic").blocked).toBe(false);
    });
  });

  describe("getAllCircuitStates / resetCircuit", () => {
    it("returns all states", () => {
      recordProviderFailure("a");
      recordProviderFailure("b");
      const all = getAllCircuitStates();
      expect(all.a).toBeDefined();
      expect(all.b).toBeDefined();
    });

    it("resetCircuit clears specific provider", () => {
      for (let i = 0; i < 5; i++) recordProviderFailure("test");
      resetCircuit("test");
      expect(getCircuitState("test")).toBeNull();
      expect(checkProviderCircuit("test").blocked).toBe(false);
    });

    it("resetCircuit without args clears all", () => {
      for (let i = 0; i < 5; i++) recordProviderFailure("a");
      for (let i = 0; i < 5; i++) recordProviderFailure("b");
      resetCircuit();
      expect(getAllCircuitStates()).toEqual({});
    });
  });
});
