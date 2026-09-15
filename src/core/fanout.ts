/** Fan-out signals to platform adapters with entitlement filtering. */

import { effectiveTier, featuresForTier, type Entitlement } from "./entitlements.js";
import { canDeliver, nextQuota, type QuotaState } from "./quotas.js";
import { formatSignal, isMajorPair, type Signal } from "./signal.js";

export interface DeliveryTarget {
  userId: string;
  platform: "telegram" | "discord" | "x";
  platformUserId: string;
  entitlement: Entitlement;
  quota: QuotaState | null;
}

export interface DeliveryResult {
  userId: string;
  delivered: boolean;
  delayedUntil?: string;
  message?: string;
  reason?: string;
  newQuota?: QuotaState;
}

export interface PlatformSender {
  send(platformUserId: string, text: string): Promise<void>;
}

export async function fanOutSignal(
  signal: Signal,
  targets: DeliveryTarget[],
  senders: Partial<Record<DeliveryTarget["platform"], PlatformSender>>,
  now = new Date(),
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  for (const target of targets) {
    const tier = effectiveTier(target.entitlement, now);
    const features = featuresForTier(tier);

    if (features.majorsOnly && !isMajorPair(signal.pair) && !signal.isMajor) {
      results.push({ userId: target.userId, delivered: false, reason: "majors_only" });
      continue;
    }

    const quotaCheck = canDeliver(target.quota, features, now);
    if (!quotaCheck.ok) {
      results.push({ userId: target.userId, delivered: false, reason: quotaCheck.reason });
      continue;
    }

    const text = formatSignal(signal, { includeSlTp: features.includeSlTp });
    const sender = senders[target.platform];

    try {
      if (features.delayMinutes > 0) {
        const delayedUntil = new Date(now.getTime() + features.delayMinutes * 60_000).toISOString();
        // Demo / MVP: we record delay; real workers would enqueue.
        if (sender) {
          // Still send immediately in demo with a delay banner for observability.
          await sender.send(
            target.platformUserId,
            `[Delayed ~${features.delayMinutes}m for free tier]\n${text}`,
          );
        }
        results.push({
          userId: target.userId,
          delivered: true,
          delayedUntil,
          message: text,
          newQuota: nextQuota(target.quota, target.userId, now),
          reason: "scheduled_delay",
        });
        continue;
      }

      if (sender) {
        await sender.send(target.platformUserId, text);
      }
      results.push({
        userId: target.userId,
        delivered: true,
        message: text,
        newQuota: nextQuota(target.quota, target.userId, now),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      results.push({
        userId: target.userId,
        delivered: false,
        reason: `send_failed: ${reason}`,
      });
    }
  }

  return results;
}
