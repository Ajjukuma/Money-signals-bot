import type { Store } from "../db/client.js";
import type { PaymentProvider } from "./provider.js";
import { StarsPaymentProvider } from "./stars.js";
import { StripePaymentProvider } from "./stripe.js";
import type { Entitlement } from "../core/entitlements.js";

export * from "./provider.js";
export * from "./stars.js";
export * from "./stripe.js";

export function createPaymentProviders(store: Store, demoMode: boolean): {
  stars: PaymentProvider;
  stripe: PaymentProvider;
} {
  return {
    stars: new StarsPaymentProvider(store, demoMode),
    stripe: new StripePaymentProvider(store, demoMode, process.env.STRIPE_SECRET_KEY),
  };
}

export function applyWebhookGrant(
  store: Store,
  userId: string,
  grantTier: "paid" | "demo_paid",
  grantDays: number,
): Entitlement {
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + grantDays);
  const ent: Entitlement = {
    userId,
    tier: grantTier,
    expiresAt: expires.toISOString(),
    source: grantTier === "demo_paid" ? "demo" : grantTier === "paid" ? "stripe" : "stars",
  };
  // Prefer stars source when coming from stars provider — caller may override source.
  store.setEntitlement(ent);
  return ent;
}
