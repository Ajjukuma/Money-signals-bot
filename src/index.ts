/**
 * Money Signals Bot — entrypoint.
 * With TELEGRAM_BOT_TOKEN: long-poll Telegram forever.
 * Without token + DEMO_MODE: offline demo walkthrough.
 * DEMO_MODE controls payment stubs independently of polling.
 */

import { loadConfig } from "./config.js";
import { openStore } from "./db/client.js";
import { createPaymentProviders } from "./payments/index.js";
import { TelegramBot } from "./platforms/telegram/bot.js";
import { DiscordBot } from "./platforms/discord/bot.js";
import { StubXAdapter } from "./platforms/x/adapter.js";
import { publishSignal } from "./admin/publisher.js";
import {
  deleteWebhook,
  getMe,
  getUpdates,
  sendMessage,
} from "./platforms/telegram/api.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOfflineDemo(
  store: ReturnType<typeof openStore>,
  telegram: TelegramBot,
  discord: DiscordBot,
  x: StubXAdapter,
): Promise<void> {
  const start = await telegram.handleUpdate({
    message: {
      chat: { id: 1001 },
      from: { id: 1001, username: "demo_trader" },
      text: "/start",
    },
  });
  console.log("--- /start ---\n" + start);

  const sub = await telegram.handleUpdate({
    message: {
      chat: { id: 1001 },
      from: { id: 1001, username: "demo_trader" },
      text: "/subscribe",
    },
  });
  console.log("--- /subscribe ---\n" + sub);

  const status = await telegram.handleUpdate({
    message: {
      chat: { id: 1001 },
      from: { id: 1001, username: "demo_trader" },
      text: "/status",
    },
  });
  console.log("--- /status ---\n" + status);

  await telegram.handleUpdate({
    message: {
      chat: { id: 2002 },
      from: { id: 2002, username: "free_user" },
      text: "/start",
    },
  });

  const { signal, deliveries } = await publishSignal(
    store,
    {
      pair: "BTCUSDT",
      side: "long",
      entry: 65000,
      stopLoss: 64000,
      takeProfit: [67000, 69000],
      confidence: 72,
      note: "Demo signal",
    },
    { telegram, discord, x },
  );
  console.log(`Published ${signal.id} to ${deliveries} deliveries`);

  const signalsView = await telegram.handleUpdate({
    message: {
      chat: { id: 1001 },
      from: { id: 1001, username: "demo_trader" },
      text: "/signals",
    },
  });
  console.log("--- /signals ---\n" + signalsView);

  console.log("Demo complete. Set TELEGRAM_BOT_TOKEN for live long-polling.");
}

async function runTelegramPolling(
  token: string,
  telegram: TelegramBot,
  store: ReturnType<typeof openStore>,
): Promise<void> {
  await deleteWebhook(token);
  const me = await getMe(token);
  const username = me.username ?? String(me.id);
  console.log(`Telegram long-polling as @${username} (demoMode payments=${process.env.DEMO_MODE})`);

  let offset = 0;
  let running = true;

  const shutdown = () => {
    if (!running) return;
    running = false;
    console.log("Shutting down Telegram poller (SIGINT/SIGTERM)...");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (running) {
    try {
      const updates = await getUpdates(token, offset, 30);
      for (const update of updates) {
        offset = update.update_id + 1;
        const reply = await telegram.handleUpdate(update);
        const chatId = update.message?.chat?.id;
        if (chatId != null && reply && reply !== "ignored") {
          try {
            await sendMessage(token, chatId, reply);
          } catch (err) {
            console.error("sendMessage failed:", err);
          }
        }
      }
    } catch (err) {
      if (!running) break;
      console.error("getUpdates error:", err);
      await sleep(2000);
    }
  }

  store.close();
  console.log("Poller stopped.");
}

async function main(): Promise<void> {
  const config = loadConfig();
  console.log(`Money Signals Bot starting (demoMode=${config.demoMode})`);

  const store = openStore(config.databasePath);
  const payments = createPaymentProviders(store, config.demoMode);
  const telegram = new TelegramBot(
    store,
    payments.stars,
    config.demoMode,
    config.referralBonusDays,
  );
  const discord = new DiscordBot(store, payments.stripe, config.demoMode);
  const x = new StubXAdapter();

  const token = config.telegramBotToken;

  if (token) {
    // Live Telegram: never exit the poll loop (until signal).
    await runTelegramPolling(token, telegram, store);
    return;
  }

  if (config.demoMode) {
    await runOfflineDemo(store, telegram, discord, x);
    store.close();
    return;
  }

  console.log("No TELEGRAM_BOT_TOKEN and DEMO_MODE=false; nothing to run.");
  console.log("Use `npm run admin -- http` for signal publishing.");
  store.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
