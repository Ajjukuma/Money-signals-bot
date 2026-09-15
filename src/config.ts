import "dotenv/config";

export interface AppConfig {
  demoMode: boolean;
  databasePath: string;
  adminToken: string;
  adminHttpPort: number;
  freeSignalsPerDay: number;
  freeDelayMinutes: number;
  referralBonusDays: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const demoMode =
    env.DEMO_MODE === "true" ||
    (!env.TELEGRAM_BOT_TOKEN && !env.STRIPE_SECRET_KEY);

  return {
    demoMode,
    databasePath: env.DATABASE_PATH ?? "./data/signals.db",
    adminToken: env.ADMIN_TOKEN ?? "change-me-admin-token",
    adminHttpPort: Number(env.ADMIN_HTTP_PORT ?? 8787),
    freeSignalsPerDay: Number(env.FREE_SIGNALS_PER_DAY ?? 2),
    freeDelayMinutes: Number(env.FREE_DELAY_MINUTES ?? 20),
    referralBonusDays: Number(env.REFERRAL_BONUS_DAYS ?? 7),
  };
}
