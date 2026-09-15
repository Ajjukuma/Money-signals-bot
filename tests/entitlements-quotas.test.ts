import { describe, expect, it } from "vitest";
import {
  effectiveTier,
  featuresForTier,
  isPaidActive,
  type Entitlement,
} from "../src/core/entitlements.js";
import { canDeliver, dayKey, nextQuota, type QuotaState } from "../src/core/quotas.js";
import { fanOutSignal, type DeliveryTarget } from "../src/core/fanout.js";
import type { Signal } from "../src/core/signal.js";
import { openStore } from "../src/db/client.js";
import { StarsPaymentProvider } from "../src/payments/stars.js";
import { StripePaymentProvider } from "../src/payments/stripe.js";
import { applyWebhookGrant } from "../src/payments/index.js";
import {
  formatFreeChannelMessage,
  postFreeChannelSignal,
  PREMIUM_BOT_CTA,
  resolveFreeChannelChatId,
} from "../src/platforms/telegram/freeChannel.js";


describe("entitlements", () => {
  it("treats free tier with delay and majors-only", () => {
    const f = featuresForTier("free");
    expect(f.signalsPerDay).toBe(2);
    expect(f.delayMinutes).toBe(20);
    expect(f.majorsOnly).toBe(true);
    expect(f.includeSlTp).toBe(false);
  });

  it("paid tier is real-time with SL/TP", () => {
    const f = featuresForTier("paid");
    expect(f.delayMinutes).toBe(0);
    expect(f.includeSlTp).toBe(true);
    expect(f.allPairs).toBe(true);
    expect(Number.isFinite(f.signalsPerDay)).toBe(false);
  });

  it("expires paid entitlements", () => {
    const ent: Entitlement = {
      userId: "u1",
      tier: "paid",
      expiresAt: "2020-01-01T00:00:00.000Z",
      source: "stripe",
    };
    expect(isPaidActive(ent, new Date("2024-01-01"))).toBe(false);
    expect(effectiveTier(ent, new Date("2024-01-01"))).toBe("free");
  });
});

describe("quotas", () => {
  it("allows up to free daily limit then blocks", () => {
    const features = featuresForTier("free");
    const now = new Date("2026-09-15T12:00:00.000Z");
    let state: QuotaState | null = null;

    const first = canDeliver(state, features, now);
    expect(first.ok).toBe(true);
    state = nextQuota(state, "u1", now);
    expect(state.delivered).toBe(1);

    state = nextQuota(state, "u1", now);
    expect(state.delivered).toBe(2);

    const blocked = canDeliver(state, features, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("daily_quota_exceeded");
  });

  it("resets on new day", () => {
    const features = featuresForTier("free");
    const state: QuotaState = { userId: "u1", dayKey: "2026-09-14", delivered: 2 };
    const now = new Date("2026-09-15T01:00:00.000Z");
    expect(dayKey(now)).toBe("2026-09-15");
    expect(canDeliver(state, features, now).ok).toBe(true);
  });
});

describe("fan-out", () => {
  it("delays free users and sends SL/TP only to paid", async () => {
    const signal: Signal = {
      id: "s1",
      pair: "BTCUSDT",
      side: "long",
      entry: 100,
      stopLoss: 90,
      takeProfit: [110],
      status: "open",
      createdAt: new Date().toISOString(),
      isMajor: true,
    };

    const targets: DeliveryTarget[] = [
      {
        userId: "telegram:1",
        platform: "telegram",
        platformUserId: "1",
        entitlement: { userId: "telegram:1", tier: "free", source: "none" },
        quota: null,
      },
      {
        userId: "telegram:2",
        platform: "telegram",
        platformUserId: "2",
        entitlement: {
          userId: "telegram:2",
          tier: "paid",
          source: "stars",
          expiresAt: null,
        },
        quota: null,
      },
    ];

    const sent: string[] = [];
    const results = await fanOutSignal(signal, targets, {
      telegram: {
        async send(_id, text) {
          sent.push(text);
        },
      },
    });

    expect(results[0].delayedUntil).toBeTruthy();
    expect(results[1].delayedUntil).toBeUndefined();
    expect(sent[0]).toContain("Delayed");
    expect(sent[0]).not.toContain("SL:");
    expect(sent[1]).toContain("SL:");
  });

  it("blocks non-major pairs for free tier", async () => {
    const signal: Signal = {
      id: "s2",
      pair: "PEPEUSDT",
      side: "short",
      entry: 1,
      status: "open",
      createdAt: new Date().toISOString(),
      isMajor: false,
    };
    const results = await fanOutSignal(
      signal,
      [
        {
          userId: "telegram:1",
          platform: "telegram",
          platformUserId: "1",
          entitlement: { userId: "telegram:1", tier: "free", source: "none" },
          quota: null,
        },
      ],
      {},
    );
    expect(results[0].delivered).toBe(false);
    expect(results[0].reason).toBe("majors_only");
  });
});

describe("payments idempotency", () => {
  it("stars webhook is idempotent", async () => {
    const store = openStore(":memory:");
    store.upsertUser("telegram", "9", "payer");
    const stars = new StarsPaymentProvider(store, true);
    const key = "evt_1";
    const a = await stars.handleWebhook(key, { userId: "telegram:9" });
    const b = await stars.handleWebhook(key, { userId: "telegram:9" });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    if (a.userId && a.grantTier && a.grantDays) {
      applyWebhookGrant(store, a.userId, a.grantTier, a.grantDays);
    }
    expect(store.getEntitlement("telegram:9").tier).toBe("demo_paid");
    store.close();
  });

  it("stripe stub grants demo_paid without secret", async () => {
    const store = openStore(":memory:");
    const stripe = new StripePaymentProvider(store, true);
    const r = await stripe.handleWebhook("evt_stripe", { userId: "discord:1" });
    expect(r.handled).toBe(true);
    store.close();
  });
});

describe("store referrals", () => {
  it("redeems referral once", () => {
    const store = openStore(":memory:");
    const owner = store.upsertUser("telegram", "10", "owner");
    const friend = store.upsertUser("telegram", "11", "friend");
    expect(store.redeemReferral(owner.referralCode, friend.id, 7)).toBe(true);
    expect(store.redeemReferral(owner.referralCode, friend.id, 7)).toBe(false);
    expect(store.getEntitlement(friend.id).source).toBe("referral");
    store.close();
  });
});

describe("free channel", () => {
  const major: Signal = {
    id: "ch1",
    pair: "BTCUSDT",
    side: "long",
    entry: 65000,
    stopLoss: 64000,
    takeProfit: [67000, 69000],
    confidence: 70,
    status: "open",
    createdAt: new Date().toISOString(),
    isMajor: true,
  };

  it("formats delayed free text without SL/TP and with premium CTA", () => {
    const text = formatFreeChannelMessage(major, 20);
    expect(text).toContain("Delayed ~20m");
    expect(text).toContain("LONG BTCUSDT");
    expect(text).not.toContain("SL:");
    expect(text).not.toContain("TP:");
    expect(text).toContain(PREMIUM_BOT_CTA);
  });

  it("prefers channel id over username", () => {
    expect(
      resolveFreeChannelChatId({
        channelId: "-1004316216666",
        channelUsername: "@MoneySignalsFreeAjju",
      }),
    ).toBe("-1004316216666");
    expect(
      resolveFreeChannelChatId({ channelUsername: "MoneySignalsFreeAjju" }),
    ).toBe("@MoneySignalsFreeAjju");
  });

  it("skips non-majors and missing env without throwing", async () => {
    const nonMajor: Signal = { ...major, pair: "PEPEUSDT", isMajor: false };
    const skipMajor = await postFreeChannelSignal(nonMajor, {
      botToken: "tok",
      channelId: "-1001",
    });
    expect(skipMajor.ok).toBe(false);
    if (!skipMajor.ok) expect(skipMajor.skipped).toBe(true);
    if (!skipMajor.ok) expect(skipMajor.reason).toBe("majors_only");

    const skipEnv = await postFreeChannelSignal(major, {});
    expect(skipEnv.ok).toBe(false);
    if (!skipEnv.ok) expect(skipEnv.skipped).toBe(true);
  });

  it("posts via sendMessage and soft-fails on API errors", async () => {
    const sent: Array<{ chatId: string | number; text: string }> = [];
    const ok = await postFreeChannelSignal(
      major,
      { botToken: "tok", channelId: "-1004316216666", delayMinutes: 20 },
      async (_token, chatId, text) => {
        sent.push({ chatId, text });
      },
    );
    expect(ok.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe("-1004316216666");
    expect(sent[0].text).toContain(PREMIUM_BOT_CTA);
    expect(sent[0].text).not.toContain("SL:");

    const fail = await postFreeChannelSignal(
      major,
      { botToken: "tok", channelUsername: "@MoneySignalsFreeAjju" },
      async () => {
        throw new Error("Telegram API sendMessage failed: boom");
      },
    );
    expect(fail.ok).toBe(false);
    if (!fail.ok) expect(fail.reason).toMatch(/send_failed/);
  });
});
