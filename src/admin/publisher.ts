import { randomUUID } from "node:crypto";
import type { Store } from "../db/client.js";
import { isMajorPair, type Signal, type SignalSide } from "../core/signal.js";
import { fanOutSignal, type DeliveryTarget } from "../core/fanout.js";
import type { PlatformSender } from "../core/fanout.js";
import { postFreeChannelSignal } from "../platforms/telegram/freeChannel.js";

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
): Promise<{ signal: Signal; deliveries: number; channelPosted: boolean }> {
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

  // Public free channel (delayed / no SL-TP). Soft-fail — never abort publish.
  let channelPosted = false;
  try {
    const channel = await postFreeChannelSignal(signal);
    if (channel.ok) {
      channelPosted = true;
      console.log(`Free channel posted to ${channel.chatId} for signal ${signal.id}`);
    } else if (channel.skipped) {
      console.log(
        `Free channel skip (${channel.reason}) for signal ${signal.id}`,
      );
    } else {
      console.error(
        `Free channel post failed for signal ${signal.id}: ${channel.reason}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Free channel post error for signal ${signal.id}: ${msg}`);
  }

  return {
    signal,
    deliveries: results.filter((r) => r.delivered).length,
    channelPosted,
  };
}
