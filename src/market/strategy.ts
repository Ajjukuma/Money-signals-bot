/**
 * EMA(9) vs EMA(21) cross + ATR(14) stops on closed 1h candles.
 * Emits at most one setup per pair when a cross happened on the most recently closed bar.
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

function roundPrice(n: number): number {
  if (n >= 1000) return Math.round(n * 100) / 100;
  if (n >= 1) return Math.round(n * 1000) / 1000;
  return Math.round(n * 1e6) / 1e6;
}

export function evaluateSetup(
  pair: string,
  source: ExchangeSource,
  candles: Candle[],
): Setup | null {
  if (candles.length < Math.max(EMA_SLOW, ATR_PERIOD) + 2) return null;

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const fast = ema(closes, EMA_FAST);
  const slow = ema(closes, EMA_SLOW);
  const atrSeries = atr(highs, lows, closes, ATR_PERIOD);

  const side = detectCrossOnLastClosed(fast, slow);
  if (!side) return null;

  const i = candles.length - 1;
  const emaF = fast[i];
  const emaS = slow[i];
  const atrV = atrSeries[i];
  if (emaF == null || emaS == null || atrV == null || !(atrV > 0)) return null;

  const entry = closes[i];
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

  const confidence = confidenceFromSeparation(emaF, emaS, atrV);
  const note = [
    `${STRATEGY_NAME} on 1h closed candles via ${source}.`,
    "Automated technical signal — not financial advice.",
  ].join(" ");

  return {
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
  };
}
