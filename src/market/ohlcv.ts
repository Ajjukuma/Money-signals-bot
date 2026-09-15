/** Public OHLCV fetchers: Kraken primary, Coinbase Exchange fallback. */

export interface Candle {
  /** Unix seconds (candle open time). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ExchangeSource = "kraken" | "coinbase";

export interface OhlcvResult {
  pair: string;
  source: ExchangeSource;
  intervalMinutes: number;
  candles: Candle[];
}

/** Canonical majors → exchange-native symbols. Prefer USDT when available. */
const KRAKEN_PAIRS: Record<string, string[]> = {
  BTCUSDT: ["XBTUSDT", "XXBTZUSD", "XBTUSD"],
  ETHUSDT: ["ETHUSDT", "XETHZUSD", "ETHUSD"],
};

const COINBASE_PAIRS: Record<string, string[]> = {
  BTCUSDT: ["BTC-USDT", "BTC-USD"],
  ETHUSDT: ["ETH-USDT", "ETH-USD"],
};

const SCAN_PAIRS = ["BTCUSDT", "ETHUSDT"] as const;

export function scanPairs(): readonly string[] {
  return SCAN_PAIRS;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "money-signals-bot/0.1" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`bad number: ${String(v)}`);
  return n;
}

/** Drop the still-forming candle (open time + interval > now). */
export function closedCandlesOnly(
  candles: Candle[],
  intervalMinutes: number,
  nowSec = Math.floor(Date.now() / 1000),
): Candle[] {
  const intervalSec = intervalMinutes * 60;
  return candles
    .filter((c) => c.time + intervalSec <= nowSec)
    .sort((a, b) => a.time - b.time);
}

async function fetchKraken(
  canonical: string,
  intervalMinutes: number,
): Promise<OhlcvResult | null> {
  const candidates = KRAKEN_PAIRS[canonical];
  if (!candidates) return null;
  let lastErr: unknown;
  for (const pair of candidates) {
    try {
      const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${intervalMinutes}`;
      const body = (await fetchJson(url)) as {
        error?: string[];
        result?: Record<string, unknown>;
      };
      if (body.error?.length) {
        lastErr = body.error.join("; ");
        continue;
      }
      const result = body.result ?? {};
      const key = Object.keys(result).find((k) => k !== "last");
      if (!key) {
        lastErr = "no OHLC key";
        continue;
      }
      const rows = result[key] as unknown[];
      if (!Array.isArray(rows) || rows.length === 0) {
        lastErr = "empty OHLC";
        continue;
      }
      // Kraken: [time, open, high, low, close, vwap, volume, count]
      const candles: Candle[] = rows.map((row) => {
        const r = row as unknown[];
        return {
          time: toNum(r[0]),
          open: toNum(r[1]),
          high: toNum(r[2]),
          low: toNum(r[3]),
          close: toNum(r[4]),
          volume: toNum(r[6]),
        };
      });
      return {
        pair: canonical,
        source: "kraken",
        intervalMinutes,
        candles: closedCandlesOnly(candles, intervalMinutes),
      };
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) {
    console.warn(`Kraken failed for ${canonical}:`, lastErr);
  }
  return null;
}

async function fetchCoinbase(
  canonical: string,
  intervalMinutes: number,
): Promise<OhlcvResult | null> {
  const candidates = COINBASE_PAIRS[canonical];
  if (!candidates) return null;
  const granularity = intervalMinutes * 60;
  let lastErr: unknown;
  for (const product of candidates) {
    try {
      const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles?granularity=${granularity}`;
      const rows = (await fetchJson(url)) as unknown[];
      if (!Array.isArray(rows) || rows.length === 0) {
        lastErr = "empty candles";
        continue;
      }
      // Coinbase: [time, low, high, open, close, volume] — newest first
      const candles: Candle[] = rows.map((row) => {
        const r = row as unknown[];
        return {
          time: toNum(r[0]),
          low: toNum(r[1]),
          high: toNum(r[2]),
          open: toNum(r[3]),
          close: toNum(r[4]),
          volume: toNum(r[5]),
        };
      });
      return {
        pair: canonical,
        source: "coinbase",
        intervalMinutes,
        candles: closedCandlesOnly(candles, intervalMinutes),
      };
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) {
    console.warn(`Coinbase failed for ${canonical}:`, lastErr);
  }
  return null;
}

/** Fetch 1h (or custom) closed candles. Kraken first, Coinbase fallback. */
export async function fetchOhlcv(
  canonicalPair: string,
  intervalMinutes = 60,
): Promise<OhlcvResult> {
  const pair = canonicalPair.toUpperCase();
  const fromKraken = await fetchKraken(pair, intervalMinutes);
  if (fromKraken && fromKraken.candles.length >= 30) return fromKraken;
  const fromCb = await fetchCoinbase(pair, intervalMinutes);
  if (fromCb && fromCb.candles.length >= 30) return fromCb;
  if (fromKraken && fromKraken.candles.length > 0) return fromKraken;
  if (fromCb && fromCb.candles.length > 0) return fromCb;
  throw new Error(`No OHLCV available for ${pair} (Kraken + Coinbase failed)`);
}
