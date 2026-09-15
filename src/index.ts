/**
 * Money Signals Bot — entrypoint.
 * DEMO_MODE=true runs without real Telegram/Stripe keys.
 */

import { loadConfig } from "./config.js";
import { openStore } from "./db/client.js";
import { createPaymentProviders } from "./payments/index.js";
import { TelegramBot } from "./platforms/telegram/bot.js";
import { DiscordBot } from "./platforms/discord/bot.js";
import { StubXAdapter } from "./platforms/x/adapter.js";
import { publishSignal } from "./admin/publisher.js";

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

  if (config.demoMode) {
    // Seed a demo user walkthrough
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

    // Free user for quota demo
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

    console.log("Demo complete. Set DEMO_MODE=false and real tokens for production.");
    store.close();
    return;
  }

  console.log("Production mode: wire Telegram long-polling / webhook here.");
  console.log("Use `npm run admin -- http` for signal publishing.");
  store.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
