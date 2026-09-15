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

## Project layout

```
src/core/          identity, entitlements, quotas, signal, fan-out, referrals
src/platforms/     telegram / discord / x
src/payments/      PaymentProvider + Stars + Stripe stubs
src/admin/         publisher CLI + HTTP
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

## License

MIT
