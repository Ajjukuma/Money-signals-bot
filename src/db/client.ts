import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema.js";
import {
  generateReferralCode,
  makeIdentityId,
  type Identity,
  type Platform,
} from "../core/identity.js";
import type { Entitlement, Tier } from "../core/entitlements.js";
import type { QuotaState } from "../core/quotas.js";
import { dayKey } from "../core/quotas.js";
import type { Signal } from "../core/signal.js";
import { isMajorPair } from "../core/signal.js";

export class Store {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (dir && dir !== "." && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  upsertUser(platform: Platform, platformUserId: string, displayName?: string): Identity {
    const id = makeIdentityId(platform, platformUserId);
    const existing = this.db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (existing) {
      return this.rowToIdentity(existing);
    }
    const referralCode = generateReferralCode(id);
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO users (id, platform, platform_user_id, display_name, referral_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, platform, platformUserId, displayName ?? null, referralCode, createdAt);
    this.db
      .prepare(
        `INSERT INTO entitlements (user_id, tier, expires_at, source) VALUES (?, 'free', NULL, 'none')`,
      )
      .run(id);
    this.db
      .prepare(
        `INSERT INTO referrals (code, owner_user_id, uses, bonus_days) VALUES (?, ?, 0, 7)`,
      )
      .run(referralCode, id);
    return {
      id,
      platform,
      platformUserId,
      displayName,
      referralCode,
      createdAt,
    };
  }

  getUser(id: string): Identity | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToIdentity(row) : null;
  }

  getUserByReferralCode(code: string): Identity | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE referral_code = ?")
      .get(code.toUpperCase()) as Record<string, unknown> | undefined;
    return row ? this.rowToIdentity(row) : null;
  }

  getEntitlement(userId: string): Entitlement {
    const row = this.db
      .prepare("SELECT * FROM entitlements WHERE user_id = ?")
      .get(userId) as Record<string, unknown> | undefined;
    if (!row) {
      return { userId, tier: "free", expiresAt: null, source: "none" };
    }
    return {
      userId,
      tier: row.tier as Tier,
      expiresAt: (row.expires_at as string | null) ?? null,
      source: row.source as Entitlement["source"],
    };
  }

  setEntitlement(ent: Entitlement): void {
    this.db
      .prepare(
        `INSERT INTO entitlements (user_id, tier, expires_at, source)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           tier = excluded.tier,
           expires_at = excluded.expires_at,
           source = excluded.source`,
      )
      .run(ent.userId, ent.tier, ent.expiresAt ?? null, ent.source);
  }

  getQuota(userId: string): QuotaState | null {
    const row = this.db.prepare("SELECT * FROM quotas WHERE user_id = ?").get(userId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      userId,
      dayKey: row.day_key as string,
      delivered: row.delivered as number,
    };
  }

  setQuota(quota: QuotaState): void {
    this.db
      .prepare(
        `INSERT INTO quotas (user_id, day_key, delivered)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           day_key = excluded.day_key,
           delivered = excluded.delivered`,
      )
      .run(quota.userId, quota.dayKey, quota.delivered);
  }

  listActiveTargets(): Array<{
    userId: string;
    platform: Platform;
    platformUserId: string;
  }> {
    const rows = this.db
      .prepare(`SELECT id, platform, platform_user_id FROM users`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      userId: r.id as string,
      platform: r.platform as Platform,
      platformUserId: r.platform_user_id as string,
    }));
  }

  saveSignal(signal: Signal): void {
    this.db
      .prepare(
        `INSERT INTO signals (
          id, pair, side, entry, stop_loss, take_profit, confidence, note,
          status, created_at, published_at, is_major
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          stop_loss = excluded.stop_loss,
          take_profit = excluded.take_profit,
          note = excluded.note,
          published_at = excluded.published_at`,
      )
      .run(
        signal.id,
        signal.pair,
        signal.side,
        signal.entry,
        signal.stopLoss ?? null,
        signal.takeProfit ? JSON.stringify(signal.takeProfit) : null,
        signal.confidence ?? null,
        signal.note ?? null,
        signal.status,
        signal.createdAt,
        signal.publishedAt ?? null,
        signal.isMajor || isMajorPair(signal.pair) ? 1 : 0,
      );
  }

  listRecentSignals(limit = 10): Signal[] {
    const rows = this.db
      .prepare(`SELECT * FROM signals ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToSignal(r));
  }

  redeemReferral(code: string, redeemerUserId: string, bonusDays: number): boolean {
    const normalized = code.trim().toUpperCase();
    const owner = this.getUserByReferralCode(normalized);
    if (!owner || owner.id === redeemerUserId) return false;
    const already = this.db
      .prepare(
        `SELECT 1 FROM referral_redemptions WHERE code = ? AND redeemer_user_id = ?`,
      )
      .get(normalized, redeemerUserId);
    if (already) return false;

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO referral_redemptions (code, redeemer_user_id, redeemed_at)
           VALUES (?, ?, ?)`,
        )
        .run(normalized, redeemerUserId, new Date().toISOString());
      this.db
        .prepare(`UPDATE referrals SET uses = uses + 1 WHERE code = ?`)
        .run(normalized);
      this.db
        .prepare(`UPDATE users SET referred_by = ? WHERE id = ?`)
        .run(normalized, redeemerUserId);

      const expires = new Date();
      expires.setUTCDate(expires.getUTCDate() + bonusDays);
      this.setEntitlement({
        userId: redeemerUserId,
        tier: "paid",
        expiresAt: expires.toISOString(),
        source: "referral",
      });
    });
    tx();
    return true;
  }

  recordPaymentEvent(idempotencyKey: string, provider: string, userId: string | null, payload: unknown): boolean {
    const existing = this.db
      .prepare(`SELECT 1 FROM payment_events WHERE idempotency_key = ?`)
      .get(idempotencyKey);
    if (existing) return false;
    this.db
      .prepare(
        `INSERT INTO payment_events (idempotency_key, provider, user_id, payload, processed_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        idempotencyKey,
        provider,
        userId,
        JSON.stringify(payload),
        new Date().toISOString(),
      );
    return true;
  }

  private rowToIdentity(row: Record<string, unknown>): Identity {
    return {
      id: row.id as string,
      platform: row.platform as Platform,
      platformUserId: row.platform_user_id as string,
      displayName: (row.display_name as string | null) ?? undefined,
      referralCode: row.referral_code as string,
      referredBy: (row.referred_by as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  }

  private rowToSignal(row: Record<string, unknown>): Signal {
    return {
      id: row.id as string,
      pair: row.pair as string,
      side: row.side as Signal["side"],
      entry: row.entry as number,
      stopLoss: (row.stop_loss as number | null) ?? undefined,
      takeProfit: row.take_profit
        ? (JSON.parse(row.take_profit as string) as number[])
        : undefined,
      confidence: (row.confidence as number | null) ?? undefined,
      note: (row.note as string | null) ?? undefined,
      status: row.status as Signal["status"],
      createdAt: row.created_at as string,
      publishedAt: (row.published_at as string | null) ?? undefined,
      isMajor: Boolean(row.is_major),
    };
  }
}

export function openStore(dbPath = process.env.DATABASE_PATH ?? ":memory:"): Store {
  return new Store(dbPath);
}

// silence unused import warning for dayKey if tree-shaken differently
void dayKey;
