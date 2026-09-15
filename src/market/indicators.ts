/** Pure technical indicators used by the live scanner. */

/** Exponential moving average (seeded with SMA of first `period` closes). */
export function ema(values: number[], period: number): Array<number | null> {
  if (period < 1) throw new Error("EMA period must be >= 1");
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder ATR(period). Returns null until enough bars. */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): Array<number | null> {
  if (period < 1) throw new Error("ATR period must be >= 1");
  const n = closes.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (n < period + 1) return out;

  const tr: number[] = new Array(n).fill(0);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;

  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export type CrossSide = "long" | "short";

/**
 * Detect EMA fast/slow cross on the last closed bar (index n-1 vs n-2).
 * Returns null if no cross on that bar or indicators not ready.
 */
export function detectCrossOnLastClosed(
  fast: Array<number | null>,
  slow: Array<number | null>,
): CrossSide | null {
  const n = Math.min(fast.length, slow.length);
  if (n < 2) return null;
  const i = n - 1;
  const f0 = fast[i - 1];
  const s0 = slow[i - 1];
  const f1 = fast[i];
  const s1 = slow[i];
  if (f0 == null || s0 == null || f1 == null || s1 == null) return null;

  const wasBelowOrEqual = f0 <= s0;
  const wasAboveOrEqual = f0 >= s0;
  const nowAbove = f1 > s1;
  const nowBelow = f1 < s1;

  if (wasBelowOrEqual && nowAbove) return "long";
  if (wasAboveOrEqual && nowBelow) return "short";
  return null;
}

/** Map |EMA9-EMA21|/ATR into confidence 50–75. */
export function confidenceFromSeparation(
  emaFast: number,
  emaSlow: number,
  atrValue: number,
): number {
  if (!(atrValue > 0)) return 50;
  const sep = Math.abs(emaFast - emaSlow) / atrValue;
  const raw = 50 + sep * 25;
  return Math.round(Math.min(75, Math.max(50, raw)));
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
