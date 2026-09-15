/** PaymentProvider interface for Stars / Stripe / future providers. */

export type PaymentProviderName = "stars" | "stripe" | "demo";

export interface CheckoutSession {
  id: string;
  url?: string;
  provider: PaymentProviderName;
  userId: string;
  amountLabel: string;
}

export interface WebhookResult {
  handled: boolean;
  duplicate: boolean;
  userId?: string;
  grantTier?: "paid" | "demo_paid";
  grantDays?: number;
  message?: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createCheckout(userId: string, plan: "monthly"): Promise<CheckoutSession>;
  handleWebhook(idempotencyKey: string, payload: unknown): Promise<WebhookResult>;
}
