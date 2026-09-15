import type { PaymentProvider, CheckoutSession, WebhookResult } from "./provider.js";
import type { Store } from "../db/client.js";

/** Stripe PaymentProvider stub for Discord / X. */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;

  constructor(
    private store: Store,
    private demoMode: boolean,
    private secretKey?: string,
  ) {}

  async createCheckout(userId: string, _plan: "monthly"): Promise<CheckoutSession> {
    const id = `cs_test_${Date.now()}_${userId.replace(/[^a-zA-Z0-9]/g, "_")}`;
    if (this.demoMode || !this.secretKey) {
      return {
        id,
        provider: "stripe",
        userId,
        amountLabel: "$0 demo",
        url: `https://checkout.stripe.com/demo/${id}`,
      };
    }
    return {
      id,
      provider: "stripe",
      userId,
      amountLabel: "Monthly",
      url: `https://checkout.stripe.com/pay/${id}`,
    };
  }

  async handleWebhook(idempotencyKey: string, payload: unknown): Promise<WebhookResult> {
    const inserted = this.store.recordPaymentEvent(
      idempotencyKey,
      "stripe",
      (payload as { userId?: string })?.userId ?? null,
      payload,
    );
    if (!inserted) {
      return { handled: true, duplicate: true, message: "already processed" };
    }
    const userId = (payload as { userId?: string; data?: { object?: { client_reference_id?: string } } })
      ?.userId
      ?? (payload as { data?: { object?: { client_reference_id?: string } } })?.data?.object
        ?.client_reference_id;
    if (!userId) {
      return { handled: false, duplicate: false, message: "missing userId" };
    }
    return {
      handled: true,
      duplicate: false,
      userId,
      grantTier: this.demoMode || !this.secretKey ? "demo_paid" : "paid",
      grantDays: 30,
      message: "stripe webhook accepted",
    };
  }
}
