import { describe, expect, it } from "vitest";
import {
  atr,
  clamp,
  confidenceFromSeparation,
  detectCrossOnLastClosed,
  ema,
} from "../src/market/indicators.js";
import {
  evaluateSetup,
  evaluateSetupResult,
  MIN_CONFIDENCE,
  MIN_SEP_ATR,
} from "../src/market/strategy.js";
import type { Candle } from "../src/market/ohlcv.js";
import { closedCandlesOnly } from "../src/market/ohlcv.js";

/** Synthetic closes → candles; `rangePct` controls high/low vs close (ATR size). */
function closesToCandles(
  closes: number[],
  start = 1_700_000_000,
  rangePct = 0.01,
): Candle[] {
  return closes.map((c, i) => ({
    time: start + i * 3600,
    open: c,
    high: c * (1 + rangePct),
    low: c * (1 - rangePct),
    close: c,
    volume: 100,
  }));
}

/** Strong last-bar long cross that clears ATR / separation / confidence gates. */
function strongLongCloses(): number[] {
  const base: number[] = [];
  for (let i = 0; i < 50; i++) base.push(100 - i * 0.8);
  for (let i = 0; i < 10; i++) base.push(base[base.length - 1]);
  base[base.length - 1] = base[base.length - 1] + 80;
  return base;
}

/** Strong last-bar short cross that clears quality gates. */
function strongShortCloses(): number[] {
  const base: number[] = [];
  for (let i = 0; i < 50; i++) base.push(50 + i * 0.8);
  for (let i = 0; i < 10; i++) base.push(base[base.length - 1]);
  base[base.length - 1] = base[base.length - 1] - 80;
  return base;
}

describe("ema", () => {
  it("seeds with SMA then smooths", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const out = ema(values, 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBeCloseTo(2, 8); // (1+2+3)/3
    // next = 4*(2/4) + 2*(1-2/4) = 2 + 1 = 3
    expect(out[3]).toBeCloseTo(3, 8);
    expect(out[4]).toBeCloseTo(4, 8);
  });
});

describe("atr", () => {
  it("computes Wilder ATR after warm-up", () => {
    const highs = [10, 12, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const lows = [9, 10, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    const closes = [9.5, 11, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    const out = atr(highs, lows, closes, 5);
    expect(out[0]).toBeNull();
    expect(out[4]).toBeNull(); // first ATR at index period (=5)
    expect(out[5]).not.toBeNull();
    expect(out[5]!).toBeGreaterThan(0);
    expect(out[out.length - 1]!).toBeGreaterThan(0);
  });
});

describe("detectCrossOnLastClosed", () => {
  it("detects bullish cross only on last bar", () => {
    // previous: fast <= slow; last: fast > slow
    const fast = [1, 2, 3, 4, 5.5];
    const slow = [2, 3, 4, 5, 5];
    expect(detectCrossOnLastClosed(fast, slow)).toBe("long");
  });

  it("detects bearish cross only on last bar", () => {
    const fast = [5, 4, 3, 2, 1];
    const slow = [4, 3, 2, 1.5, 1.5];
    expect(detectCrossOnLastClosed(fast, slow)).toBe("short");
  });

  it("returns null when no cross on last bar", () => {
    const fast = [1, 2, 3, 4, 5];
    const slow = [0.5, 1, 2, 3, 4];
    expect(detectCrossOnLastClosed(fast, slow)).toBeNull();
  });

  it("ignores crosses that happened earlier", () => {
    // Cross at index 2, then stays above — last bar is not a cross
    const fast = [1, 1, 3, 4, 5];
    const slow = [2, 2, 2, 2, 2];
    expect(detectCrossOnLastClosed(fast, slow)).toBeNull();
  });
});

describe("confidenceFromSeparation", () => {
  it("clamps to 50–75", () => {
    expect(confidenceFromSeparation(100, 100, 10)).toBe(50);
    expect(confidenceFromSeparation(110, 100, 10)).toBe(75); // sep=1 → 75
    expect(confidenceFromSeparation(130, 100, 10)).toBe(75); // sep>1 capped
    expect(clamp(40, 50, 75)).toBe(50);
  });
});

describe("evaluateSetup", () => {
  it("emits long when EMA9 crosses above EMA21 on last closed candle", () => {
    const candles = closesToCandles(strongLongCloses());
    const setup = evaluateSetup("BTCUSDT", "kraken", candles);
    expect(setup).not.toBeNull();
    expect(setup!.side).toBe("long");
    expect(setup!.stopLoss).toBeLessThan(setup!.entry);
    expect(setup!.takeProfit[0]).toBeGreaterThan(setup!.entry);
    expect(setup!.takeProfit[1]).toBeGreaterThan(setup!.takeProfit[0]);
    expect(setup!.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    expect(setup!.confidence).toBeLessThanOrEqual(75);
    expect(setup!.note).toMatch(/kraken/i);
    expect(setup!.note).toMatch(/Quality gates/i);
    expect(setup!.note).toMatch(/not financial advice/i);
  });

  it("returns null when there is no cross on the last closed candle", () => {
    const flat = Array.from({ length: 50 }, () => 100);
    const candles = closesToCandles(flat);
    expect(evaluateSetup("ETHUSDT", "coinbase", candles)).toBeNull();
    const result = evaluateSetupResult("ETHUSDT", "coinbase", candles);
    expect(result.status).toBe("skip");
    if (result.status === "skip") {
      expect(result.reason).toMatch(/no cross/i);
    }
  });

  it("mirrors SL/TP for short", () => {
    const candles = closesToCandles(strongShortCloses());
    const setup = evaluateSetup("ETHUSDT", "kraken", candles);
    expect(setup).not.toBeNull();
    expect(setup!.side).toBe("short");
    expect(setup!.stopLoss).toBeGreaterThan(setup!.entry);
    expect(setup!.takeProfit[0]).toBeLessThan(setup!.entry);
    expect(setup!.takeProfit[1]).toBeLessThan(setup!.takeProfit[0]);
  });
});

describe("closedCandlesOnly", () => {
  it("drops the still-forming candle", () => {
    const now = 1_700_003_600; // exactly 1h after second open
    const candles: Candle[] = [
      { time: 1_700_000_000, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: 1_700_003_600, open: 2, high: 2, low: 2, close: 2, volume: 1 }, // open now → still forming
    ];
    const closed = closedCandlesOnly(candles, 60, now);
    expect(closed).toHaveLength(1);
    expect(closed[0].close).toBe(1);
  });
});

/** Deterministic cross: decline + hold (fast below slow), then one spike on last bar. */
describe("evaluateSetup deterministic long cross", () => {
  it("publishes long levels from a known cross series", () => {
    const candles = closesToCandles(strongLongCloses());
    const setup = evaluateSetup("BTCUSDT", "kraken", candles);
    expect(setup).not.toBeNull();
    expect(setup!.side).toBe("long");
    expect(setup!.entry).toBe(candles[candles.length - 1].close);
    expect(setup!.stopLoss).toBeLessThan(setup!.entry);
    expect(setup!.takeProfit[1]).toBeGreaterThan(setup!.takeProfit[0]);
    expect(setup!.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    expect(setup!.note).toContain("kraken");
    expect(setup!.note).toMatch(/Quality gates/i);
    expect(setup!.note).toMatch(/not financial advice/i);
  });

  it("publishes short levels from a known bearish cross series", () => {
    const candles = closesToCandles(strongShortCloses());
    const setup = evaluateSetup("ETHUSDT", "coinbase", candles);
    expect(setup).not.toBeNull();
    expect(setup!.side).toBe("short");
    expect(setup!.stopLoss).toBeGreaterThan(setup!.entry);
    expect(setup!.takeProfit[1]).toBeLessThan(setup!.takeProfit[0]);
    expect(setup!.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    expect(setup!.note).toContain("coinbase");
    expect(setup!.note).toMatch(/Quality gates/i);
  });
});

describe("quality gates reject weak setups", () => {
  it("SKIPs when ATR is ≤ 0.15% of price (dead market)", () => {
    // Flat prices + tiny recovery cross; near-zero bar range → ATR << 0.15% price
    const base: number[] = [];
    for (let i = 0; i < 50; i++) base.push(100);
    for (let i = 0; i < 5; i++) base.push(99.95);
    base.push(100.2);
    const candles = closesToCandles(base, 1_700_000_000, 0.000001);
    const result = evaluateSetupResult("BTCUSDT", "kraken", candles);
    expect(result.status).toBe("skip");
    if (result.status === "skip") {
      expect(result.reason).toMatch(/ATR too low/i);
    }
    expect(evaluateSetup("BTCUSDT", "kraken", candles)).toBeNull();
  });

  it("SKIPs hairline EMA separation (|EMA9−EMA21|/ATR < 0.15)", () => {
    // Wide bars (large ATR) + tiny tip-over cross → sep << MIN_SEP_ATR
    const base: number[] = [];
    for (let i = 0; i < 40; i++) base.push(100);
    for (let i = 0; i < 15; i++) base.push(100 - 0.05);
    base.push(100 - 0.05 + 0.5);
    const candles = closesToCandles(base, 1_700_000_000, 0.05);
    const result = evaluateSetupResult("BTCUSDT", "kraken", candles);
    expect(result.status).toBe("skip");
    if (result.status === "skip") {
      expect(result.reason).toMatch(/EMA separation too tight/i);
      expect(result.reason).toContain(String(MIN_SEP_ATR));
    }
    expect(evaluateSetup("BTCUSDT", "kraken", candles)).toBeNull();
  });

  it("SKIPs when confidence after clamp is < 58", () => {
    // Moderate spike: cross + ATR ok + sep ≈ 0.15 → confidence 54 < 58
    const base: number[] = [];
    for (let i = 0; i < 50; i++) base.push(100 - i * 0.8);
    for (let i = 0; i < 10; i++) base.push(base[base.length - 1]);
    base[base.length - 1] = base[base.length - 1] + 30;
    const candles = closesToCandles(base);
    const result = evaluateSetupResult("BTCUSDT", "kraken", candles);
    expect(result.status).toBe("skip");
    if (result.status === "skip") {
      expect(result.reason).toMatch(new RegExp(`confidence \\d+ < ${MIN_CONFIDENCE}`));
    }
    expect(evaluateSetup("BTCUSDT", "kraken", candles)).toBeNull();
  });
});
