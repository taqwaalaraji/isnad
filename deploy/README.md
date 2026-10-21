# Deploy

Single-VM deployment: the official self-hosted Supabase stack, then this compose project (web,
worker, worker API, Telegram bot, Caddy for HTTPS). The full runbook is
[docs/technical/deployment.md](../docs/technical/deployment.md).

| File | What it is |
|---|---|
| `docker-compose.yml` | web, worker, api, bot, caddy; joins the Supabase network |
| `web.Dockerfile`, `worker.Dockerfile` | images (build context: the repository root) |
| `Caddyfile` | HTTPS for the app domain and the Supabase API domain |
| `.env.example` | every setting, names only; copy to `deploy/.env` |
| `migrate.sh` | applies `supabase/migrations` once each, in order |
| `backup.sh`, `restore.sh` | nightly database + storage backups, and restoring one |
