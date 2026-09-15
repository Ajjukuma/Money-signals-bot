/** Trading signal model shared across platforms. */

export type SignalSide = "long" | "short";
export type SignalStatus = "open" | "updated" | "closed" | "cancelled";

export const MAJOR_PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
] as const;

export type MajorPair = (typeof MAJOR_PAIRS)[number];

export interface Signal {
  id: string;
  pair: string;
  side: SignalSide;
  entry: number;
  stopLoss?: number;
  takeProfit?: number[];
  confidence?: number;
  note?: string;
  status: SignalStatus;
  createdAt: string;
  publishedAt?: string;
  isMajor: boolean;
}

export function isMajorPair(pair: string): boolean {
  return (MAJOR_PAIRS as readonly string[]).includes(pair.toUpperCase());
}

export function formatSignal(signal: Signal, opts: { includeSlTp: boolean }): string {
  const lines = [
    `📡 ${signal.side.toUpperCase()} ${signal.pair}`,
    `Entry: ${signal.entry}`,
  ];
  if (opts.includeSlTp) {
    if (signal.stopLoss != null) lines.push(`SL: ${signal.stopLoss}`);
    if (signal.takeProfit?.length) {
      lines.push(`TP: ${signal.takeProfit.join(" / ")}`);
    }
  }
  if (signal.confidence != null) lines.push(`Confidence: ${signal.confidence}%`);
  if (signal.note) lines.push(signal.note);
  lines.push(`Status: ${signal.status}`);
  return lines.join("\n");
}
