# Money Signals Bot

Monetized multi-platform **trading signals** bot. Telegram-first MVP, Discord slash stubs, X adapter stubs, with free vs paid entitlements, Telegram Stars + Stripe payment interfaces, referrals, and an admin publisher.

## Free vs paid

| Feature | Free | Paid / demo_paid |
|--------|------|------------------|
| Signals / day | 2 | Unlimited |
| Delivery delay | ~20 minutes | Real-time |
| Pairs | Majors only (BTC, ETH, BNB, SOL, XRP) | All pairs |
| SL / TP | Hidden | Included |
| Live updates | No | Yes |

## Free public channel vs premium bot

| Surface | Who | What they get |
|---------|-----|----------------|
| **@MoneySignalsFreeAjju** (public channel) | Anyone | Delayed free alerts: majors only, **no SL/TP**, delay banner, CTA to premium bot |
| **@MoneySignalsAjju_bot** (bot DMs) | Free bot users | Same delayed / majors-only / hidden SL-TP rules + daily quota |
| **@MoneySignalsAjju_bot** (bot DMs) | Paid / demo_paid | Real-time signals with SL/TP, all pairs, unlimited |

When a signal is **published** (admin `publish` / HTTP, or `npm run signal:scan`), the bot still fans out to registered users **and** also posts the free/delayed version to the public channel (if configured). Channel failures are logged and never abort the publish. Channel posts inherit the same scanner **dedup** as signals (no republish while an open same pair+side exists within `SIGNAL_DEDUP_HOURS`).

Env (see `.env.example`):

- `TELEGRAM_FREE_CHANNEL` — channel @username (e.g. `@MoneySignalsFreeAjju`)
- `TELEGRAM_FREE_CHANNEL_ID` — numeric chat id (preferred when set, e.g. `-100…`)
- `TELEGRAM_BOT_TOKEN` — required to actually `sendMessage` to the channel (bot must be an admin of the channel)

Premium CTA line on every free-channel post: `Real-time premium → @MoneySignalsAjju_bot`

## $0 demo mode

Set `DEMO_MODE=true` (default when bot/payment tokens are missing). You can run the full flow offline:

```bash
cp .env.example .env
npm install
npm test
npm run typecheck
npm run demo
```

Demo mode:

- Does **not** require Telegram, Discord, Stripe, or Stars credentials
- `/subscribe` auto-grants `demo_paid` via the Stars stub
- Discord `subscribe` stub uses the Stripe stub similarly
- Webhooks are **idempotent** (SQLite `payment_events`)

## BotFather (production Telegram)

1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token
2. Put it in `.env` as `TELEGRAM_BOT_TOKEN=...`
3. Set `DEMO_MODE=false`
4. Optionally configure Stars invoices later (Stars provider is stubbed with a clear interface)
5. Run `npm run dev` (wire long-polling/webhook in production as needed)
6. Publish signals with the admin CLI/HTTP (see below)

## Discord / X

- Discord: slash command stubs (`status`, `subscribe`, `signals`, `referral`) + premium role sync stub (`DISCORD_PREMIUM_ROLE_ID`)
- X: `StubXAdapter` logs DMs / public posts; swap in a real client behind `XAdapter`

## Env vars

See `.env.example`. Important:

- `DEMO_MODE` — `$0` offline mode
- `DATABASE_PATH` — SQLite file (default `./data/signals.db`)
- `TELEGRAM_BOT_TOKEN` — BotFather token
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID_MONTHLY` — Discord/X billing
- `ADMIN_TOKEN` — required for publisher CLI/HTTP
- `FREE_SIGNALS_PER_DAY`, `FREE_DELAY_MINUTES`, `REFERRAL_BONUS_DAYS`
- `TELEGRAM_FREE_CHANNEL` / `TELEGRAM_FREE_CHANNEL_ID` — public free delayed-alerts channel

**Never commit a real `.env`.**

## Admin publisher

```bash
export ADMIN_TOKEN=change-me-admin-token
npm run admin -- publish --pair BTCUSDT --side long --entry 65000 --sl 64000 --tp 67000,69000

# or HTTP
npm run admin -- http
curl -X POST http://127.0.0.1:8787/publish \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"pair":"ETHUSDT","side":"short","entry":3500,"stopLoss":3600,"takeProfit":[3400,3300]}'
```


## Live signal scanner (real market data)

`npm run signal:scan` fetches **real** 1h OHLCV (Kraken public OHLC first; Coinbase Exchange candles as fallback — Binance often returns 451 from this host) for majors **BTCUSDT** and **ETHUSDT**, then evaluates a transparent strategy on **closed** candles only.

### Strategy: EMA9 / EMA21 cross + ATR(14) stops

Permissionless auto-publish: the scanner only publishes **high-quality** crosses. Failed gates log under `SKIP` (pair skipped, no publish).

| Rule | Detail |
|------|--------|
| Timeframe | 1h closed candles |
| Long | EMA(9) crosses **above** EMA(21) on the most recently closed bar |
| Short | EMA(9) crosses **below** EMA(21) on that same bar |
| Entry | Last closed candle close |
| Stop loss | Long: `entry − 1.5×ATR(14)`; Short: mirror |
| Take profit | TP1 = `entry ± 1.5×ATR`; TP2 = `entry ± 2.5×ATR` |
| Emit rule | Only when a cross happened on the **most recently closed** candle (not every run) |
| Quality: ATR | ATR(14) must be **> 0.15% of price** (skip dead / flat markets) |
| Quality: separation | `|EMA9−EMA21| / ATR ≥ 0.15` (reject hairline crosses) |
| Quality: confidence | Confidence after `clamp(50…75)` must be **≥ 58** |
| Confidence | `clamp(50…75)` from `|EMA9−EMA21| / ATR` separation |
| Note | Includes strategy name, exchange source, quality gates summary, and “automated technical — not financial advice” |
| Dedup | Skips republish of same pair+side while an **open** signal exists within `SIGNAL_DEDUP_HOURS` (default 6) |
| SKIP logging | Each rejected pair logs a concrete reason (`no cross…`, `ATR too low…`, `EMA separation too tight…`, `confidence N < 58`, `dedup…`) |

```bash
npm run signal:scan
# → publishes via publishSignal / Telegram fan-out when setups exist
# → prints SKIP and exits 0 when none
```

Secrets stay in `.env` (never commit). Optional: `SIGNAL_DEDUP_HOURS=6`.

## Project layout

```
src/core/          identity, entitlements, quotas, signal, fan-out, referrals
src/platforms/     telegram / discord / x
src/payments/      PaymentProvider + Stars + Stripe stubs
src/admin/         publisher CLI + HTTP
src/market/        OHLCV fetch + EMA/ATR strategy scanner
src/db/            SQLite (better-sqlite3)
tests/             entitlement & quota + payment idempotency
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm test` | Vitest suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run demo` | Offline walkthrough |
| `npm run admin` | Publish signals |
| `npm run signal:scan` | Live EMA/ATR scan → publish or SKIP |

## License

MIT
