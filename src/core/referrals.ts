/** Referral / affiliate codes. */

export interface ReferralRecord {
  code: string;
  ownerUserId: string;
  uses: number;
  bonusDays: number;
}

export interface ReferralRedemption {
  code: string;
  redeemerUserId: string;
  redeemedAt: string;
}

export function validateReferralCode(code: string): boolean {
  return /^REF[A-Z0-9]{4,12}$/i.test(code.trim());
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}
