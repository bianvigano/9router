import { describe, it, expect } from "vitest";
import { resolveStackedCompression, STACKED_PRESETS } from "../../open-sse/rtk/stacked.js";

describe("STACKED_PRESETS", () => {
  it("has 4 entries: off, lite, full, ultra", () => {
    expect(Object.keys(STACKED_PRESETS)).toEqual(["off", "lite", "full", "ultra"]);
  });

  it("off preset disables everything", () => {
    expect(STACKED_PRESETS.off).toEqual({ rtk: false, caveman: null, ponytail: null });
  });

  it("lite preset enables RTK only", () => {
    expect(STACKED_PRESETS.lite).toEqual({ rtk: true, caveman: null, ponytail: null });
  });

  it("full preset enables RTK + Caveman full", () => {
    expect(STACKED_PRESETS.full).toEqual({ rtk: true, caveman: "full", ponytail: null });
  });

  it("ultra preset enables RTK + Caveman ultra + Ponytail full", () => {
    expect(STACKED_PRESETS.ultra).toEqual({ rtk: true, caveman: "ultra", ponytail: "full" });
  });
});

describe("resolveStackedCompression", () => {
  it('"off" preset, no old settings — all disabled', () => {
    const r = resolveStackedCompression({
      stackedCompression: "off",
      hasOldSettings: {},
    });
    expect(r.effectiveRtk).toBe(false);
    expect(r.effectiveCavemanEnabled).toBe(false);
    expect(r.effectivePonytailEnabled).toBe(false);
    expect(r.stackedLabel).toBeNull();
  });

  it('"lite" preset, no old settings — RTK only', () => {
    const r = resolveStackedCompression({
      stackedCompression: "lite",
      hasOldSettings: {},
    });
    expect(r.effectiveRtk).toBe(true);
    expect(r.effectiveCavemanEnabled).toBe(false);
    expect(r.effectivePonytailEnabled).toBe(false);
    expect(r.stackedLabel).toBe("lite");
  });

  it('"full" preset, no old settings — RTK + Caveman full', () => {
    const r = resolveStackedCompression({
      stackedCompression: "full",
      hasOldSettings: {},
    });
    expect(r.effectiveRtk).toBe(true);
    expect(r.effectiveCavemanEnabled).toBe(true);
    expect(r.effectiveCavemanLevel).toBe("full");
    expect(r.effectivePonytailEnabled).toBe(false);
    expect(r.stackedLabel).toBe("full");
  });

  it('"ultra" preset, no old settings — RTK + Caveman ultra + Ponytail full', () => {
    const r = resolveStackedCompression({
      stackedCompression: "ultra",
      hasOldSettings: {},
    });
    expect(r.effectiveRtk).toBe(true);
    expect(r.effectiveCavemanEnabled).toBe(true);
    expect(r.effectiveCavemanLevel).toBe("ultra");
    expect(r.effectivePonytailEnabled).toBe(true);
    expect(r.effectivePonytailLevel).toBe("full");
    expect(r.stackedLabel).toBe("ultra");
  });

  it("old rtkEnabled=false overrides stacked=full preset", () => {
    const r = resolveStackedCompression({
      stackedCompression: "full",
      rtkEnabled: false,
      hasOldSettings: { rtk: true },
    });
    expect(r.effectiveRtk).toBe(false);
    // caveman still follows preset since hasOldSettings.caveman is false
    expect(r.effectiveCavemanEnabled).toBe(true);
    expect(r.effectiveCavemanLevel).toBe("full");
  });

  it("old cavemanEnabled=false overrides stacked=full preset", () => {
    const r = resolveStackedCompression({
      stackedCompression: "full",
      cavemanEnabled: false,
      hasOldSettings: { caveman: true },
    });
    expect(r.effectiveRtk).toBe(true);
    expect(r.effectiveCavemanEnabled).toBe(false);
  });

  it("old ponytailEnabled=true + ponytailLevel=ultra overrides stacked=lite preset", () => {
    const r = resolveStackedCompression({
      stackedCompression: "lite",
      ponytailEnabled: true,
      ponytailLevel: "ultra",
      hasOldSettings: { ponytail: true },
    });
    expect(r.effectivePonytailEnabled).toBe(true);
    expect(r.effectivePonytailLevel).toBe("ultra");
    // RTK follows lite preset (no old rtk override)
    expect(r.effectiveRtk).toBe(true);
  });

  it("unknown stackedCompression value falls back to off preset", () => {
    const r = resolveStackedCompression({
      stackedCompression: "garbage-value",
      hasOldSettings: {},
    });
    expect(r.effectiveRtk).toBe(false);
    expect(r.effectiveCavemanEnabled).toBe(false);
    expect(r.effectivePonytailEnabled).toBe(false);
  });

  it("missing stackedCompression + no old settings = off", () => {
    const r = resolveStackedCompression({ hasOldSettings: {} });
    expect(r.effectiveRtk).toBe(false);
    expect(r.effectiveCavemanEnabled).toBe(false);
    expect(r.stackedLabel).toBeNull();
  });

  it("all three old toggles explicitly set win over ultra preset", () => {
    const r = resolveStackedCompression({
      stackedCompression: "ultra",
      rtkEnabled: false,
      cavemanEnabled: false,
      ponytailEnabled: false,
      cavemanLevel: "lite",
      ponytailLevel: "lite",
      hasOldSettings: { rtk: true, caveman: true, ponytail: true },
    });
    expect(r.effectiveRtk).toBe(false);
    expect(r.effectiveCavemanEnabled).toBe(false);
    expect(r.effectivePonytailEnabled).toBe(false);
  });
});
