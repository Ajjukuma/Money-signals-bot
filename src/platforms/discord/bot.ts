/**
 * Discord slash-command stubs + premium role stub.
 */

import type { Store } from "../../db/client.js";
import type { PaymentProvider } from "../../payments/provider.js";
import { applyWebhookGrant } from "../../payments/index.js";
import { effectiveTier } from "../../core/entitlements.js";
import type { PlatformSender } from "../../core/fanout.js";

export type DiscordSlashCommand =
  | "status"
  | "subscribe"
  | "signals"
  | "referral";

export class DiscordBot implements PlatformSender {
  private logs: string[] = [];

  constructor(
    private store: Store,
    private stripe: PaymentProvider,
    private demoMode: boolean,
  ) {}

  getLogs(): string[] {
    return [...this.logs];
  }

  async send(platformUserId: string, text: string): Promise<void> {
    this.logs.push(`discord:${platformUserId} => ${text}`);
  }

  /** Stub: would sync Discord premium role when paid. */
  async syncPremiumRole(platformUserId: string): Promise<string> {
    const userId = `discord:${platformUserId}`;
    const ent = this.store.getEntitlement(userId);
    const tier = effectiveTier(ent);
    const roleId = process.env.DISCORD_PREMIUM_ROLE_ID ?? "premium-role-stub";
    if (tier === "paid" || tier === "demo_paid") {
      this.logs.push(`assign_role ${platformUserId} ${roleId}`);
      return `Assigned premium role ${roleId} (stub)`;
    }
    this.logs.push(`remove_role ${platformUserId} ${roleId}`);
    return `Removed premium role ${roleId} (stub)`;
  }

  async handleSlash(
    command: DiscordSlashCommand,
    discordUserId: string,
    options?: { referralCode?: string },
  ): Promise<string> {
    const user = this.store.upsertUser("discord", discordUserId);
    switch (command) {
      case "status": {
        const ent = this.store.getEntitlement(user.id);
        return `Discord status — tier=${effectiveTier(ent)} source=${ent.source}`;
      }
      case "subscribe": {
        const session = await this.stripe.createCheckout(user.id, "monthly");
        if (this.demoMode) {
          const wh = await this.stripe.handleWebhook(`demo_stripe_${session.id}`, {
            userId: user.id,
          });
          if (wh.handled && wh.userId && wh.grantTier && wh.grantDays) {
            applyWebhookGrant(this.store, wh.userId, wh.grantTier, wh.grantDays);
          }
          await this.syncPremiumRole(discordUserId);
          return `Demo Stripe checkout OK: ${session.url}`;
        }
        return `Subscribe via Stripe: ${session.url}`;
      }
      case "signals": {
        const signals = this.store.listRecentSignals(3);
        return signals.length
          ? signals.map((s) => `${s.side} ${s.pair} @ ${s.entry}`).join("\n")
          : "No signals yet.";
      }
      case "referral": {
        if (options?.referralCode) {
          const ok = this.store.redeemReferral(options.referralCode, user.id, 7);
          return ok ? "Referral applied." : "Referral failed.";
        }
        return `Your code: ${user.referralCode}`;
      }
      default:
        return "Unknown command";
    }
  }
}
