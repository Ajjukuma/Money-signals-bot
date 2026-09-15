import type { PaymentProvider, CheckoutSession, WebhookResult } from "./provider.js";
import type { Store } from "../db/client.js";

/** Telegram Stars stub — works in DEMO_MODE without real Stars invoicing. */
export class StarsPaymentProvider implements PaymentProvider {
  readonly name = "stars" as const;

  constructor(
    private store: Store,
    private demoMode: boolean,
  ) {}

  async createCheckout(userId: string, _plan: "monthly"): Promise<CheckoutSession> {
    const id = `stars_${Date.now()}_${userId}`;
    if (this.demoMode) {
      return {
        id,
        provider: "stars",
        userId,
        amountLabel: "Demo Stars (no charge)",
        url: `demo://stars/pay/${id}`,
      };
    }
    return {
      id,
      provider: "stars",
      userId,
      amountLabel: "Telegram Stars",
      url: `tg://invoice?slug=stub_${id}`,
    };
  }

  async handleWebhook(idempotencyKey: string, payload: unknown): Promise<WebhookResult> {
    const inserted = this.store.recordPaymentEvent(
      idempotencyKey,
      "stars",
      (payload as { userId?: string })?.userId ?? null,
      payload,
    );
    if (!inserted) {
      return { handled: true, duplicate: true, message: "already processed" };
    }
    const userId = (payload as { userId?: string })?.userId;
    if (!userId) {
      return { handled: false, duplicate: false, message: "missing userId" };
    }
    return {
      handled: true,
      duplicate: false,
      userId,
      grantTier: this.demoMode ? "demo_paid" : "paid",
      grantDays: 30,
      message: "stars payment accepted",
    };
  }
}
