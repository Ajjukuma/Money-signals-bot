/**
 * Telegram-first MVP bot commands.
 * In DEMO_MODE, commands are handled in-process without Telegram API calls.
 */

import type { Store } from "../../db/client.js";
import { effectiveTier, featuresForTier } from "../../core/entitlements.js";
import { formatSignal } from "../../core/signal.js";
import { canDeliver } from "../../core/quotas.js";
import { validateReferralCode, normalizeReferralCode } from "../../core/referrals.js";
import type { PaymentProvider } from "../../payments/provider.js";
import { applyWebhookGrant } from "../../payments/index.js";
import type { PlatformSender } from "../../core/fanout.js";

export interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
}

export class TelegramBot implements PlatformSender {
  private logs: string[] = [];

  constructor(
    private store: Store,
    private stars: PaymentProvider,
    private demoMode: boolean,
    private bonusDays = Number(process.env.REFERRAL_BONUS_DAYS ?? 7),
  ) {}

  getLogs(): string[] {
    return [...this.logs];
  }

  async send(platformUserId: string, text: string): Promise<void> {
    this.logs.push(`telegram:${platformUserId} => ${text}`);
    if (!this.demoMode && process.env.TELEGRAM_BOT_TOKEN) {
      // Production path would call Telegram sendMessage API.
      // Intentionally stubbed so demo runs offline.
    }
  }

  async handleUpdate(update: TelegramUpdate): Promise<string> {
    const msg = update.message;
    if (!msg?.text || !msg.from) return "ignored";
    const text = msg.text.trim();
    const platformUserId = String(msg.from.id);
    const user = this.store.upsertUser(
      "telegram",
      platformUserId,
      msg.from.username ?? msg.from.first_name,
    );

    const [cmd, ...args] = text.split(/\s+/);
    switch (cmd.toLowerCase()) {
      case "/start":
        return this.cmdStart(user.id, user.referralCode);
      case "/status":
        return this.cmdStatus(user.id);
      case "/subscribe":
        return this.cmdSubscribe(user.id);
      case "/signals":
        return this.cmdSignals(user.id);
      case "/referral":
        return args[0]
          ? this.cmdRedeemReferral(user.id, args[0])
          : this.cmdShowReferral(user.id, user.referralCode);
      default:
        return "Unknown command. Try /start /status /subscribe /signals /referral";
    }
  }

  private cmdStart(userId: string, referralCode: string): string {
    return [
      "Welcome to Money Signals Bot 📈",
      "",
      "Free: 2 signals/day, ~20 min delay, majors only",
      "Paid: real-time, all pairs, SL/TP, live updates",
      "",
      `Your referral code: ${referralCode}`,
      "Commands: /status /subscribe /signals /referral",
      this.demoMode ? "(DEMO_MODE: no real charges)" : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private cmdStatus(userId: string): string {
    const ent = this.store.getEntitlement(userId);
    const tier = effectiveTier(ent);
    const features = featuresForTier(tier);
    const quota = this.store.getQuota(userId);
    const q = canDeliver(quota, features);
    return [
      `Tier: ${tier}`,
      `Source: ${ent.source}`,
      `Expires: ${ent.expiresAt ?? "n/a"}`,
      `Signals remaining today: ${Number.isFinite(q.remaining) ? q.remaining : "unlimited"}`,
      `Delay: ${features.delayMinutes}m`,
      `SL/TP: ${features.includeSlTp ? "yes" : "no"}`,
      `Pairs: ${features.allPairs ? "all" : "majors only"}`,
    ].join("\n");
  }

  private async cmdSubscribe(userId: string): Promise<string> {
    const session = await this.stars.createCheckout(userId, "monthly");
    if (this.demoMode) {
      // Auto-grant demo paid for zero-friction local runs.
      const result = await this.stars.handleWebhook(`demo_stars_${session.id}`, { userId });
      if (result.handled && result.userId && result.grantTier && result.grantDays) {
        applyWebhookGrant(this.store, result.userId, result.grantTier, result.grantDays);
        const ent = this.store.getEntitlement(userId);
        this.store.setEntitlement({ ...ent, source: "stars" });
      }
      return [
        "Demo subscribe complete ($0).",
        `Checkout: ${session.url}`,
        "You now have demo_paid features. Use /status.",
      ].join("\n");
    }
    return `Pay with Telegram Stars: ${session.url ?? session.id}`;
  }

  private cmdSignals(userId: string): string {
    const ent = this.store.getEntitlement(userId);
    const tier = effectiveTier(ent);
    const features = featuresForTier(tier);
    const signals = this.store.listRecentSignals(5);
    if (!signals.length) return "No signals published yet.";
    return signals
      .map((s) => formatSignal(s, { includeSlTp: features.includeSlTp }))
      .join("\n---\n");
  }

  private cmdShowReferral(userId: string, code: string): string {
    void userId;
    return `Share your code: ${code}\nFriends redeem with /referral ${code}`;
  }

  private cmdRedeemReferral(userId: string, code: string): string {
    if (!validateReferralCode(code)) return "Invalid referral code format.";
    const ok = this.store.redeemReferral(
      normalizeReferralCode(code),
      userId,
      this.bonusDays,
    );
    return ok
      ? `Referral applied! +${this.bonusDays} days paid access.`
      : "Could not redeem (invalid, self-referral, or already used).";
  }
}
