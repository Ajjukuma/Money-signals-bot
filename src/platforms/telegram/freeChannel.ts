/**
 * Public free Telegram channel posts (delayed / no SL-TP funnel into premium bot).
 */

import { FREE_FEATURES } from "../../core/entitlements.js";
import { formatSignal, isMajorPair, type Signal } from "../../core/signal.js";
import { sendMessage } from "./api.js";

export const PREMIUM_BOT_CTA = "Real-time premium → @MoneySignalsAjju_bot";

export interface FreeChannelEnv {
  botToken?: string;
  channelId?: string;
  channelUsername?: string;
  delayMinutes?: number;
}

export function resolveFreeChannelChatId(env: FreeChannelEnv = readFreeChannelEnv()): string | null {
  const id = env.channelId?.trim();
  if (id) return id;
  const user = env.channelUsername?.trim();
  if (!user) return null;
  return user.startsWith("@") ? user : `@${user}`;
}

export function readFreeChannelEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): FreeChannelEnv {
  return {
    botToken: processEnv.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    channelId: processEnv.TELEGRAM_FREE_CHANNEL_ID?.trim() || undefined,
    channelUsername: processEnv.TELEGRAM_FREE_CHANNEL?.trim() || undefined,
    delayMinutes: Number(
      processEnv.FREE_DELAY_MINUTES ?? FREE_FEATURES.delayMinutes,
    ),
  };
}

/** Free-tier formatting for the public channel (no SL/TP, delay banner, premium CTA). */
export function formatFreeChannelMessage(
  signal: Signal,
  delayMinutes = FREE_FEATURES.delayMinutes,
): string {
  const body = formatSignal(signal, { includeSlTp: false });
  const delay =
    delayMinutes > 0
      ? `[Delayed ~${delayMinutes}m for free tier]\n`
      : "";
  return `${delay}${body}\n\n${PREMIUM_BOT_CTA}`;
}

export type PostFreeChannelResult =
  | { ok: true; chatId: string; skipped?: undefined; reason?: undefined }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string };

/**
 * Post the free/delayed signal version to the public channel.
 * Never throws — callers should log and continue on failure.
 * Skips non-majors (same free-tier majors-only rule) and when env is incomplete.
 */
export async function postFreeChannelSignal(
  signal: Signal,
  env: FreeChannelEnv = readFreeChannelEnv(),
  send: typeof sendMessage = sendMessage,
): Promise<PostFreeChannelResult> {
  if (!isMajorPair(signal.pair) && !signal.isMajor) {
    return { ok: false, skipped: true, reason: "majors_only" };
  }

  const token = env.botToken?.trim();
  if (!token) {
    return { ok: false, skipped: true, reason: "no_bot_token" };
  }

  const chatId = resolveFreeChannelChatId(env);
  if (!chatId) {
    return { ok: false, skipped: true, reason: "no_free_channel" };
  }

  const delayMinutes =
    env.delayMinutes != null && Number.isFinite(env.delayMinutes)
      ? env.delayMinutes
      : FREE_FEATURES.delayMinutes;
  const text = formatFreeChannelMessage(signal, delayMinutes);

  try {
    await send(token, chatId, text);
    return { ok: true, chatId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `send_failed: ${reason}` };
  }
}
