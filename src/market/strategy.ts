/**
 * EMA(9) vs EMA(21) cross + ATR(14) stops on closed 1h candles.
 * Emits at most one setup per pair when a cross happened on the most recently closed bar
 * and quality gates pass (permissionless scanner — high-quality crosses only).
 */

import type { Candle, ExchangeSource } from "./ohlcv.js";
import {
  atr,
  confidenceFromSeparation,
  detectCrossOnLastClosed,
  ema,
  type CrossSide,
} from "./indicators.js";

export const STRATEGY_NAME = "EMA9/EMA21 cross + ATR(14) stops";
export const EMA_FAST = 9;
export const EMA_SLOW = 21;
export const ATR_PERIOD = 14;
export const SL_ATR_MULT = 1.5;
export const TP1_ATR_MULT = 1.5;
export const TP2_ATR_MULT = 2.5;

/** Min ATR as fraction of price (0.15% — skip dead markets). */
export const MIN_ATR_PCT = 0.0015;
/** Min |EMA9−EMA21| / ATR (hairline crosses rejected). */
export const MIN_SEP_ATR = 0.15;
/** Min confidence after 50–75 clamp. */
export const MIN_CONFIDENCE = 58;

export interface Setup {
  pair: string;
  side: CrossSide;
  entry: number;
  stopLoss: number;
  takeProfit: [number, number];
  confidence: number;
  source: ExchangeSource;
  note: string;
  atr: number;
  emaFast: number;
  emaSlow: number;
  closedAt: number;
}

export type EvalResult =
  | { status: "setup"; setup: Setup }
  | { status: "skip"; reason: string };

function roundPrice(n: number): number {
  if (n >= 1000) return Math.round(n * 100) / 100;
  if (n >= 1) return Math.round(n * 1000) / 1000;
  return Math.round(n * 1e6) / 1e6;
}

const QUALITY_NOTE =
  `Quality gates: ATR>0.15% price, |EMA9−EMA21|/ATR≥${MIN_SEP_ATR}, confidence≥${MIN_CONFIDENCE}.`;

/**
 * Evaluate a cross setup with quality gates.
 * Failures return `{ status: "skip", reason }` for SKIP logging.
 */
export function evaluateSetupResult(
  pair: string,
  source: ExchangeSource,
  candles: Candle[],
): EvalResult {
  if (candles.length < Math.max(EMA_SLOW, ATR_PERIOD) + 2) {
    return { status: "skip", reason: "insufficient candles" };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const fast = ema(closes, EMA_FAST);
  const slow = ema(closes, EMA_SLOW);
  const atrSeries = atr(highs, lows, closes, ATR_PERIOD);

  const side = detectCrossOnLastClosed(fast, slow);
  if (!side) {
    return { status: "skip", reason: "no cross on last closed candle" };
  }

  const i = candles.length - 1;
  const emaF = fast[i];
  const emaS = slow[i];
  const atrV = atrSeries[i];
  if (emaF == null || emaS == null || atrV == null || !(atrV > 0)) {
    return { status: "skip", reason: "indicators not ready" };
  }

  const entry = closes[i];

  // Gate: ATR(14) must be > 0.15% of price (avoid dead markets)
  const atrPct = atrV / entry;
  if (!(atrPct > MIN_ATR_PCT)) {
    return {
      status: "skip",
      reason: `ATR too low (${(atrPct * 100).toFixed(3)}% of price ≤ 0.15%)`,
    };
  }

  // Gate: |EMA9-EMA21| / ATR >= 0.15 (separation not a hairline)
  const sep = Math.abs(emaF - emaS) / atrV;
  if (!(sep >= MIN_SEP_ATR)) {
    return {
      status: "skip",
      reason: `EMA separation too tight (|EMA9−EMA21|/ATR=${sep.toFixed(3)} < ${MIN_SEP_ATR})`,
    };
  }

  const confidence = confidenceFromSeparation(emaF, emaS, atrV);

  // Gate: confidence must be >= 58 after clamp
  if (confidence < MIN_CONFIDENCE) {
    return {
      status: "skip",
      reason: `confidence ${confidence} < ${MIN_CONFIDENCE}`,
    };
  }

  let stopLoss: number;
  let tp1: number;
  let tp2: number;
  if (side === "long") {
    stopLoss = entry - SL_ATR_MULT * atrV;
    tp1 = entry + TP1_ATR_MULT * atrV;
    tp2 = entry + TP2_ATR_MULT * atrV;
  } else {
    stopLoss = entry + SL_ATR_MULT * atrV;
    tp1 = entry - TP1_ATR_MULT * atrV;
    tp2 = entry - TP2_ATR_MULT * atrV;
  }

  const note = [
    `${STRATEGY_NAME} on 1h closed candles via ${source}.`,
    QUALITY_NOTE,
    "Automated technical signal — not financial advice.",
  ].join(" ");

  return {
    status: "setup",
    setup: {
      pair: pair.toUpperCase(),
      side,
      entry: roundPrice(entry),
      stopLoss: roundPrice(stopLoss),
      takeProfit: [roundPrice(tp1), roundPrice(tp2)],
      confidence,
      source,
      note,
      atr: atrV,
      emaFast: emaF,
      emaSlow: emaS,
      closedAt: candles[i].time,
    },
  };
}

/** Convenience: setup or null (tests / callers that ignore skip reason). */
export function evaluateSetup(
  pair: string,
  source: ExchangeSource,
  candles: Candle[],
): Setup | null {
  const result = evaluateSetupResult(pair, source, candles);
  return result.status === "setup" ? result.setup : null;
}
