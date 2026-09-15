/** Subscription / tier entitlements. */

export type Tier = "free" | "paid" | "demo_paid";

export interface Entitlement {
  userId: string;
  tier: Tier;
  expiresAt?: string | null;
  source: "none" | "stars" | "stripe" | "admin" | "referral" | "demo";
}

export interface TierFeatures {
  signalsPerDay: number;
  delayMinutes: number;
  majorsOnly: boolean;
  includeSlTp: boolean;
  realTimeUpdates: boolean;
  allPairs: boolean;
}

export const FREE_FEATURES: TierFeatures = {
  signalsPerDay: 2,
  delayMinutes: 20,
  majorsOnly: true,
  includeSlTp: false,
  realTimeUpdates: false,
  allPairs: false,
};

export const PAID_FEATURES: TierFeatures = {
  signalsPerDay: Number.POSITIVE_INFINITY,
  delayMinutes: 0,
  majorsOnly: false,
  includeSlTp: true,
  realTimeUpdates: true,
  allPairs: true,
};

export function featuresForTier(tier: Tier): TierFeatures {
  if (tier === "paid" || tier === "demo_paid") return { ...PAID_FEATURES };
  return { ...FREE_FEATURES };
}

export function isPaidActive(ent: Entitlement, now = new Date()): boolean {
  if (ent.tier !== "paid" && ent.tier !== "demo_paid") return false;
  if (!ent.expiresAt) return true;
  return new Date(ent.expiresAt).getTime() > now.getTime();
}

export function effectiveTier(ent: Entitlement, now = new Date()): Tier {
  if (isPaidActive(ent, now)) return ent.tier === "demo_paid" ? "demo_paid" : "paid";
  return "free";
}
