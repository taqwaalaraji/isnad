import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Run \`make env\` from the repo root (or set it in the deployment).`);
  }
  return value;
}

/** Server-side configuration. Read lazily so builds don't need runtime secrets. */
export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get publishableKey() {
    return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  },
  get secretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get siteUrl() {
    return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get workerApiUrl() {
    return (process.env.WORKER_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
  },
  get internalApiToken() {
    return required("INTERNAL_API_TOKEN");
  },
  get telegramBotUsername() {
    return process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null;
  },
};
