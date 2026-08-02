/**
 * In-memory circuit breaker — per-provider CLOSED/OPEN/HALF_OPEN state machine.
 *
 * Sits BEFORE the credential lookup loop. When a provider circuit is OPEN,
 * requests are rejected immediately (no DB reads, no token refresh attempts),
 * cutting latency and preventing cascade failures.
 *
 * Transitions:
 *   CLOSED → OPEN      when failureThreshold reached within windowMs
 *   OPEN   → HALF_OPEN  after cooldownMs (lazy — triggered by next request)
 *   HALF_OPEN → CLOSED  if probe request succeeds
 *   HALF_OPEN → OPEN    if probe request fails
 *
 * State is in-memory only — resets on process restart (circuit → CLOSED).
 */

import * as log from "../utils/logger.js";

// ---------- config ----------

const FAILURE_THRESHOLD = 5;       // failures before opening
const FAILURE_WINDOW_MS = 60_000;  // sliding window (60s)
const COOLDOWN_MS = 30_000;        // OPEN → HALF_OPEN delay (30s)
const HALF_OPEN_MAX_PROBES = 1;    // concurrent probes allowed during HALF_OPEN

// ---------- state ----------

/** @type {Map<string, { state: 'CLOSED'|'OPEN'|'HALF_OPEN', failureTimestamps: number[], openedAt: number|null, halfOpenProbeCount: number, lastFailureAt: number|null, lastSuccessAt: number|null }>} */
const circuits = new Map();

// ---------- helpers ----------

function getOrCreate(provider) {
  if (!circuits.has(provider)) {
    circuits.set(provider, {
      state: "CLOSED",
      failureTimestamps: [],
      openedAt: null,
      halfOpenProbeCount: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
    });
  }
  return circuits.get(provider);
}

function pruneWindow(timestamps, now) {
  const cutoff = now - FAILURE_WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
}

// ---------- public API ----------

/**
 * Record a provider failure after `markAccountUnavailable` returned shouldFallback=true.
 * Advances the failure counter and may transition CLOSED→OPEN or HALF_OPEN→OPEN.
 */
export function recordProviderFailure(provider) {
  if (!provider) return;
  const state = getOrCreate(provider);
  const now = Date.now();

  pruneWindow(state.failureTimestamps, now);
  state.failureTimestamps.push(now);
  state.lastFailureAt = now;

  if (state.state === "CLOSED" && state.failureTimestamps.length >= FAILURE_THRESHOLD) {
    state.state = "OPEN";
    state.openedAt = now;
    log.warn("CIRCUIT", `Circuit OPEN for ${provider} (${state.failureTimestamps.length} failures in ${FAILURE_WINDOW_MS}ms)`);
    return;
  }

  if (state.state === "HALF_OPEN") {
    // probe failed — reopen immediately
    state.state = "OPEN";
    state.openedAt = now;
    state.halfOpenProbeCount = 0;
    log.warn("CIRCUIT", `Circuit re-OPENED for ${provider} (HALF_OPEN probe failed)`);
  }
}

/**
 * Gate check — call BEFORE the credential lookup loop.
 * Returns true if the provider circuit is OPEN and requests should be rejected.
 * Has side-effects: transitions OPEN→HALF_OPEN when cooldown expires,
 * increments HALF_OPEN probe counter.
 *
 * @param {string} provider
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function checkProviderCircuit(provider) {
  if (!provider) return { blocked: false };
  const state = circuits.get(provider);
  if (!state) return { blocked: false };

  const now = Date.now();

  if (state.state === "CLOSED") {
    return { blocked: false };
  }

  if (state.state === "OPEN") {
    if (now - (state.openedAt || now) >= COOLDOWN_MS) {
      // cooldown expired → transition to HALF_OPEN, allow one probe
      state.state = "HALF_OPEN";
      state.halfOpenProbeCount = 1;
      state.failureTimestamps = [];
      log.info("CIRCUIT", `Circuit HALF_OPEN for ${provider}`);
      return { blocked: false };
    }
    const remaining = Math.ceil((COOLDOWN_MS - (now - (state.openedAt || now))) / 1000);
    return { blocked: true, reason: `Circuit open for ${provider}, retry in ${remaining}s` };
  }

  if (state.state === "HALF_OPEN") {
    if (state.halfOpenProbeCount < HALF_OPEN_MAX_PROBES) {
      state.halfOpenProbeCount++;
      return { blocked: false };
    }
    return { blocked: true, reason: `Circuit HALF_OPEN for ${provider}, probe already in flight` };
  }

  return { blocked: false };
}

/**
 * Record a provider success — transitions HALF_OPEN→CLOSED, resets failure count.
 */
export function recordProviderSuccess(provider) {
  if (!provider) return;
  const state = circuits.get(provider);
  if (!state) return;
  const now = Date.now();
  state.lastSuccessAt = now;

  if (state.state === "CLOSED") {
    state.failureTimestamps = [];
  }

  if (state.state === "HALF_OPEN") {
    state.state = "CLOSED";
    state.failureTimestamps = [];
    state.halfOpenProbeCount = 0;
    state.openedAt = null;
    log.info("CIRCUIT", `Circuit CLOSED for ${provider} (HALF_OPEN probe succeeded)`);
  }
}

/**
 * Debug/observability: get circuit state for a single provider.
 * @returns {object|null}
 */
export function getCircuitState(provider) {
  return circuits.has(provider) ? { ...circuits.get(provider) } : null;
}

/**
 * Dashboard visibility: get all circuit states.
 * @returns {Record<string, object>}
 */
export function getAllCircuitStates() {
  const result = {};
  for (const [provider, state] of circuits) {
    result[provider] = { ...state };
  }
  return result;
}

/**
 * Manual admin reset — clears circuit state for a provider.
 * Omit provider to reset all circuits.
 */
export function resetCircuit(provider) {
  if (provider) {
    circuits.delete(provider);
  } else {
    circuits.clear();
  }
}
