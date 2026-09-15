/**
 * Live signal scanner CLI.
 * Usage: npm run signal:scan
 * Fetches real 1h OHLCV, evaluates EMA/ATR strategy, publishes via publishSignal when setups exist.
 */

import { loadConfig } from "../config.js";
import { openStore } from "../db/client.js";
import { publishSignal } from "../admin/publisher.js";
import { createPaymentProviders } from "../payments/index.js";
import { TelegramBot } from "../platforms/telegram/bot.js";
import { DiscordBot } from "../platforms/discord/bot.js";
import { StubXAdapter } from "../platforms/x/adapter.js";
import { fetchOhlcv, scanPairs } from "./ohlcv.js";
import { evaluateSetup, STRATEGY_NAME } from "./strategy.js";

const DEFAULT_DEDUP_HOURS = 6;

async function main(): Promise<void> {
  const config = loadConfig();
  const dedupHours = Number(process.env.SIGNAL_DEDUP_HOURS ?? DEFAULT_DEDUP_HOURS);
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
  const senders = { telegram, discord, x };

  console.log(`Scanner: ${STRATEGY_NAME} (1h closed candles)`);
  console.log(`Pairs: ${scanPairs().join(", ")} | dedup=${dedupHours}h`);

  const published: string[] = [];
  const skipped: string[] = [];
  const livePrices: Record<string, { close: number; source: string }> = {};

  for (const pair of scanPairs()) {
    try {
      const ohlcv = await fetchOhlcv(pair, 60);
      const last = ohlcv.candles[ohlcv.candles.length - 1];
      livePrices[pair] = { close: last.close, source: ohlcv.source };
      console.log(
        `${pair}: ${ohlcv.candles.length} closed 1h bars from ${ohlcv.source}; last close=${last.close}`,
      );

      const setup = evaluateSetup(pair, ohlcv.source, ohlcv.candles);
      if (!setup) {
        skipped.push(`${pair}: no cross on last closed candle`);
        continue;
      }

      if (store.hasRecentOpenSignal(setup.pair, setup.side, dedupHours)) {
        skipped.push(
          `${pair}: dedup — open ${setup.side} already within ${dedupHours}h`,
        );
        continue;
      }

      const result = await publishSignal(
        store,
        {
          pair: setup.pair,
          side: setup.side,
          entry: setup.entry,
          stopLoss: setup.stopLoss,
          takeProfit: [...setup.takeProfit],
          confidence: setup.confidence,
          note: setup.note,
        },
        senders,
      );
      published.push(result.signal.id);
      console.log(
        `PUBLISHED ${result.signal.id} ${setup.side.toUpperCase()} ${setup.pair} @ ${setup.entry} (deliveries=${result.deliveries})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${pair}: fetch/eval failed: ${msg}`);
      skipped.push(`${pair}: error ${msg}`);
    }
  }

  console.log("Live prices:", JSON.stringify(livePrices));
  if (published.length === 0) {
    console.log("SKIP — no new setups to publish");
    for (const s of skipped) console.log(`  - ${s}`);
    store.close();
    process.exit(0);
  }

  console.log(
    JSON.stringify(
      { ok: true, published, skipped, livePrices },
      null,
      2,
    ),
  );
  store.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
