/**
 * Caveman Stacked Compression — unified preset combining RTK + Caveman + Ponytail.
 *
 * Presets (one-click):
 *   "off"   → all off
 *   "lite"  → RTK only (compress tool results)
 *   "full"  → RTK + Caveman full (terse system prompt)
 *   "ultra" → RTK + Caveman ultra + Ponytail full (max compression)
 *
 * Headroom and Pxpipe stay as independent toggles (not part of stacked).
 *
 * Backward compat: if old individual toggles (rtkEnabled, cavemanEnabled,
 * ponytailEnabled) are explicitly set in the raw settings DB blob, they
 * override the stacked preset. New installs get full preset control.
 */

export const STACKED_PRESETS = Object.freeze({
  off:   { rtk: false, caveman: null,   ponytail: null },
  lite:  { rtk: true,  caveman: null,   ponytail: null },
  full:  { rtk: true,  caveman: "full", ponytail: null },
  ultra: { rtk: true,  caveman: "ultra",ponytail: "full" },
});

/**
 * Resolve effective compression settings from stacked preset + old toggles.
 *
 * Rules:
 *  - stackedCompression picks the preset (default "off" for unknown/missing).
 *  - If rtkEnabled was explicitly set in raw settings, it wins over preset.
 *  - If cavemanEnabled was explicitly set in raw settings, it wins over preset.
 *  - If ponytailEnabled was explicitly set in raw settings, it wins over preset.
 *  - Otherwise, preset controls everything.
 *
 * @param {object}  opts
 * @param {string}  [opts.stackedCompression]  - "off" | "lite" | "full" | "ultra"
 * @param {boolean} [opts.rtkEnabled]
 * @param {boolean} [opts.cavemanEnabled]
 * @param {string}  [opts.cavemanLevel]
 * @param {boolean} [opts.ponytailEnabled]
 * @param {string}  [opts.ponytailLevel]
 * @param {object}  [opts.hasOldSettings]       - { rtk, caveman, ponytail } booleans
 * @returns {{ effectiveRtk: boolean, effectiveCavemanEnabled: boolean, effectiveCavemanLevel: string|null, effectivePonytailEnabled: boolean, effectivePonytailLevel: string|null, stackedLabel: string|null }}
 */
export function resolveStackedCompression({
  stackedCompression,
  rtkEnabled,
  cavemanEnabled,
  cavemanLevel,
  ponytailEnabled,
  ponytailLevel,
  hasOldSettings = {},
}) {
  const preset = STACKED_PRESETS[stackedCompression] || STACKED_PRESETS.off;

  const effectiveRtk = hasOldSettings.rtk
    ? !!rtkEnabled
    : preset.rtk;

  let effectiveCavemanEnabled;
  let effectiveCavemanLevel;
  if (hasOldSettings.caveman) {
    effectiveCavemanEnabled = !!cavemanEnabled;
    effectiveCavemanLevel = cavemanLevel || "full";
  } else {
    effectiveCavemanEnabled = preset.caveman !== null;
    effectiveCavemanLevel = preset.caveman || "full";
  }

  let effectivePonytailEnabled;
  let effectivePonytailLevel;
  if (hasOldSettings.ponytail) {
    effectivePonytailEnabled = !!ponytailEnabled;
    effectivePonytailLevel = ponytailLevel || "full";
  } else {
    effectivePonytailEnabled = preset.ponytail !== null;
    effectivePonytailLevel = preset.ponytail || "full";
  }

  const stackedLabel = stackedCompression && stackedCompression !== "off"
    ? stackedCompression
    : null;

  return {
    effectiveRtk,
    effectiveCavemanEnabled,
    effectiveCavemanLevel,
    effectivePonytailEnabled,
    effectivePonytailLevel,
    stackedLabel,
  };
}
