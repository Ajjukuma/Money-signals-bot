#!/usr/bin/env node
/**
 * Admin publisher CLI.
 * Usage:
 *   ADMIN_TOKEN=... npm run admin -- publish --pair BTCUSDT --side long --entry 65000 --sl 64000 --tp 67000,69000
 *   ADMIN_TOKEN=... npm run admin -- http   # starts HTTP publisher on ADMIN_HTTP_PORT
 */

import http from "node:http";
import { loadConfig } from "../config.js";
import { openStore } from "../db/client.js";
import { publishSignal } from "./publisher.js";
import { createPaymentProviders } from "../payments/index.js";
import { TelegramBot } from "../platforms/telegram/bot.js";
import { DiscordBot } from "../platforms/discord/bot.js";
import { StubXAdapter } from "../platforms/x/adapter.js";
import type { SignalSide } from "../core/signal.js";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") && i + 1 < argv.length) {
      out[a.slice(2)] = argv[++i];
    }
  }
  return out;
}

function assertAdmin(token: string | undefined, expected: string): void {
  if (!token || token !== expected) {
    console.error("Unauthorized: set ADMIN_TOKEN");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  assertAdmin(process.env.ADMIN_TOKEN ?? args.token, config.adminToken);

  const store = openStore(config.databasePath);
  const payments = createPaymentProviders(store, config.demoMode);
  const telegram = new TelegramBot(store, payments.stars, config.demoMode, config.referralBonusDays);
  const discord = new DiscordBot(store, payments.stripe, config.demoMode);
  const x = new StubXAdapter();
  const senders = { telegram, discord, x };

  if (cmd === "publish") {
    const pair = args.pair;
    const side = args.side as SignalSide;
    const entry = Number(args.entry);
    if (!pair || !side || !Number.isFinite(entry)) {
      console.error("Required: --pair --side --entry");
      process.exit(1);
    }
    const result = await publishSignal(
      store,
      {
        pair,
        side,
        entry,
        stopLoss: args.sl ? Number(args.sl) : undefined,
        takeProfit: args.tp
          ? args.tp.split(",").map((v) => Number(v.trim()))
          : undefined,
        confidence: args.confidence ? Number(args.confidence) : undefined,
        note: args.note,
      },
      senders,
    );
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    store.close();
    return;
  }

  if (cmd === "http") {
    const server = http.createServer(async (req, res) => {
      const auth = req.headers["x-admin-token"];
      if (auth !== config.adminToken) {
        res.writeHead(401).end("unauthorized");
        return;
      }
      if (req.method === "POST" && req.url === "/publish") {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            pair: string;
            side: SignalSide;
            entry: number;
            stopLoss?: number;
            takeProfit?: number[];
            confidence?: number;
            note?: string;
          };
          const result = await publishSignal(store, body, senders);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400).end(String(err));
        }
        return;
      }
      res.writeHead(404).end("not found");
    });
    server.listen(config.adminHttpPort, () => {
      console.log(`Admin HTTP listening on :${config.adminHttpPort}`);
    });
    return;
  }

  console.log("Usage: admin publish|http");
  store.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
