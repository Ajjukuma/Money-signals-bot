import { randomUUID } from "node:crypto";
import type { Store } from "../db/client.js";
import { isMajorPair, type Signal, type SignalSide } from "../core/signal.js";
import { fanOutSignal, type DeliveryTarget } from "../core/fanout.js";
import type { PlatformSender } from "../core/fanout.js";

export interface PublishInput {
  pair: string;
  side: SignalSide;
  entry: number;
  stopLoss?: number;
  takeProfit?: number[];
  confidence?: number;
  note?: string;
}

export async function publishSignal(
  store: Store,
  input: PublishInput,
  senders: Partial<Record<"telegram" | "discord" | "x", PlatformSender>>,
): Promise<{ signal: Signal; deliveries: number }> {
  const signal: Signal = {
    id: randomUUID(),
    pair: input.pair.toUpperCase(),
    side: input.side,
    entry: input.entry,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    confidence: input.confidence,
    note: input.note,
    status: "open",
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    isMajor: isMajorPair(input.pair),
  };
  store.saveSignal(signal);

  const users = store.listActiveTargets();
  const targets: DeliveryTarget[] = users.map((u) => ({
    userId: u.userId,
    platform: u.platform,
    platformUserId: u.platformUserId,
    entitlement: store.getEntitlement(u.userId),
    quota: store.getQuota(u.userId),
  }));

  const results = await fanOutSignal(signal, targets, senders);
  for (const r of results) {
    if (r.delivered && r.newQuota) store.setQuota(r.newQuota);
  }
  return { signal, deliveries: results.filter((r) => r.delivered).length };
}
