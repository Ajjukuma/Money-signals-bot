/** Daily signal delivery quotas. */

import type { TierFeatures } from "./entitlements.js";

export interface QuotaState {
  userId: string;
  dayKey: string;
  delivered: number;
}

export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function canDeliver(
  state: QuotaState | null | undefined,
  features: TierFeatures,
  now = new Date(),
): { ok: boolean; remaining: number; reason?: string } {
  const limit = features.signalsPerDay;
  if (!Number.isFinite(limit)) {
    return { ok: true, remaining: Number.POSITIVE_INFINITY };
  }
  const delivered = state && state.dayKey === dayKey(now) ? state.delivered : 0;
  const remaining = Math.max(0, limit - delivered);
  if (remaining <= 0) {
    return { ok: false, remaining: 0, reason: "daily_quota_exceeded" };
  }
  return { ok: true, remaining };
}

export function nextQuota(state: QuotaState | null | undefined, userId: string, now = new Date()): QuotaState {
  const key = dayKey(now);
  if (!state || state.dayKey !== key) {
    return { userId, dayKey: key, delivered: 1 };
  }
  return { userId, dayKey: key, delivered: state.delivered + 1 };
}
