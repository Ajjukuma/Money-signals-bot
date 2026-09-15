/** Platform identity for a connected user account. */

export type Platform = "telegram" | "discord" | "x";

export interface Identity {
  id: string;
  platform: Platform;
  platformUserId: string;
  displayName?: string;
  referralCode: string;
  referredBy?: string | null;
  createdAt: string;
}

export function makeIdentityId(platform: Platform, platformUserId: string): string {
  return `${platform}:${platformUserId}`;
}

export function generateReferralCode(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `REF${hash.toString(36).toUpperCase().padStart(6, "0").slice(0, 8)}`;
}
