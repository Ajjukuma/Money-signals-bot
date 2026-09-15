import "dotenv/config";

export interface AppConfig {
  demoMode: boolean;
  databasePath: string;
  adminToken: string;
  adminHttpPort: number;
  freeSignalsPerDay: number;
  freeDelayMinutes: number;
  referralBonusDays: number;
  telegramBotToken: string | undefined;
}

function parseDemoMode(env: NodeJS.ProcessEnv): boolean {
  const raw = env.DEMO_MODE?.trim().toLowerCase();
  // Explicit flag always wins so token + DEMO_MODE=true → live poll + demo payments.
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  // Auto: demo when no payment/bot credentials are configured.
  return !env.TELEGRAM_BOT_TOKEN?.trim() && !env.STRIPE_SECRET_KEY?.trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    demoMode: parseDemoMode(env),
    databasePath: env.DATABASE_PATH ?? "./data/signals.db",
    adminToken: env.ADMIN_TOKEN ?? "change-me-admin-token",
    adminHttpPort: Number(env.ADMIN_HTTP_PORT ?? 8787),
    freeSignalsPerDay: Number(env.FREE_SIGNALS_PER_DAY ?? 2),
    freeDelayMinutes: Number(env.FREE_DELAY_MINUTES ?? 20),
    referralBonusDays: Number(env.REFERRAL_BONUS_DAYS ?? 7),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
  };
}
