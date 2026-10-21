# The Web App

`web/` is a Next.js 16 app (App Router, React 19, TypeScript, Tailwind v4). It renders every screen on the server and reads data as the signed-in user, so row-level security applies to every query.

## Layout

| Path | What it holds |
|---|---|
| `src/app/[locale]/` | Routes. The root layout is per locale (`ar`, `en`) and sets `lang`, `dir`, fonts and the theme. |
| `src/app/[locale]/(auth)/` | Sign-in, check-email, reset-password, invitation (`invite/[token]`), no-newsroom |
| `src/app/[locale]/(app)/(workspace)/` | The newsroom workspace: home, checks, registry, alerts, briefs, settings, newsroom admin |
| `src/app/[locale]/(app)/console/` | The Isnad console for staff |
| `src/app/[locale]/n/[slug]/` | The public evidence page (no sign-in) |
| `src/app/[locale]/print/briefs/[id]/` | A brief without the app shell, for printing |
| `src/app/auth/` | Route handlers: `confirm` (email links), `sign-out`, `session-ended` |
| `src/app/api/admin/activity/` | CSV export of a newsroom's activity log (admins) |
| `src/features/<area>/` | Screen logic per area: `queries.ts` (server reads), `actions.ts` (server actions), components |
| `src/components/ui/`, `src/components/shell/` | Design-system primitives and the app frame |
| `src/lib/` | Auth (`auth.ts`), Supabase clients, i18n, formatting, shared types, errors |
| `src/proxy.ts` | Locale and session gate ([security.md](security.md#proxy)) |

## Routes

| Route | Screen |
|---|---|
| `/{locale}` | Home: drop zone, weekly metrics, awaiting review, latest alerts |
| `/checks`, `/checks/new`, `/checks/[id]` | Checks list (filters, search, pagination), new check, the check page (processing view or review workspace) |
| `/registry`, `/registry/ask`, `/registry/coverage`, `/registry/topics/[slug]`, `/registry/indicators/[slug]`, `/registry/entities/[slug]`, `/registry/documents/[id]` | The registry (indicator and entity pages accept a slug or an id) |
| `/alerts` | Alerts |
| `/briefs`, `/briefs/new`, `/briefs/[id]` | Interview briefs |
| `/settings` | Profile, password, notifications, Telegram link |
| `/admin/members`, `/admin/sources`, `/admin/policies`, `/admin/activity` | Newsroom admin |
| `/console`, `/console/sources[/new, /[id], /[id]/edit]`, `/console/inbox`, `/console/review`, `/console/catalog`, `/console/proposals`, `/console/newsrooms`, `/console/quality`, `/console/system` | Isnad console |
| `/n/[slug]` | Public evidence page |

Unknown paths render the localized not-found page (`[...rest]` route). The workspace has its own not-found and error boundaries so the sidebar stays.

## Rendering patterns

The app uses `cacheComponents` (Partial Prerendering):

- Pages are thin: they render a `<Suspense>` with a skeleton and an async `Content` component that awaits `params`/`searchParams` and loads data. Dynamic `params` are only read inside Suspense.
- `getViewer()` (React `cache`, one per request) calls `connection()` first, because session checks read the clock. Everything behind a viewer renders per request.
- `requireNewsroom(locale)` resolves the active newsroom: the `isnad_newsroom` cookie, then the user's last newsroom, then the first membership. Staff without a newsroom go to the console; others go to `/no-newsroom`.
- Pages declare breadcrumbs with `<SetBreadcrumbs items={…} />`; the top bar shows them.

### Server actions

Mutations are server actions in `features/<area>/actions.ts`. Each one resolves the viewer, validates input with zod, calls Supabase as the user (usually a workflow RPC), and returns `ActionResult<T>`:

```ts
type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: MessageKey };
```

`errorKey(error)` maps database error codes raised by the SQL functions (`not_allowed`, `claims_pending`, …) to dictionary keys. Actions call `refresh()` so the page re-renders with fresh data. Client components show results with `sonner` toasts.

Uploads go straight from the browser to Storage: `createUploadUrl` issues a signed upload URL for the newsroom's folder, `uploadWithProgress` PUTs the file (with the media type detected from the extension when the browser leaves it empty), then `createCheck` creates the row. A file dropped on the home page is handed to the new-check form through a small in-memory store (`pending-file.ts`).

### Realtime

Client components subscribe with `subscribeAsUser(name, configure)` (`lib/supabase/realtime.ts`), which sets the realtime token from the session before joining. On a change they call a debounced `router.refresh()`. Used by the check page (checks, claims, results, comments), alerts, briefs and console views.

### Public evidence page

`/n/[slug]` uses a cookie-free anonymous client (`lib/supabase/public.ts`) and a `"use cache"` function with `cacheLife("minutes")` and the tag `public-note:<slug>`. A missing note throws instead of being cached, so a page published a moment ago isn't stuck as not found.

## Supabase clients

| Client | File | Use |
|---|---|---|
| Server (user) | `lib/supabase/server.ts` | Server components and actions, with the session cookies; RLS applies |
| Browser | `lib/supabase/browser.ts` | Realtime and signed uploads |
| Admin | `lib/supabase/admin.ts` (`server-only`) | Secret key; only after an authorization check (signed URLs, invitation emails, staff aggregates) |
| Public | `lib/supabase/public.ts` (`server-only`) | Anonymous, cacheable reads for the public page |

## Internationalization

- Two locales: Arabic (default, RTL) and English (LTR). The URL prefix is the source of truth; the `isnad_locale` cookie remembers the choice.
- Dictionaries: `lib/i18n/dictionaries/ar.ts` is the source of truth; `en.ts` must have every key (enforced by the `Dictionary` type). Keys are typed (`MessageKey`), with `{name}` placeholders.
- Server components use `getT(locale)`; client components use `useI18n()`.
- Numbers use Western digits in both languages (`ar-AE-u-nu-latn`); helpers in `lib/format.ts` format numbers, figures, dates, relative times, durations and bytes.
- Layout uses logical properties (`ms-`, `pe-`, `start-`), so the same markup works in both directions.

## Design system

- Tokens in `src/styles/tokens.css` (brand colors ink, lapis, paper, sky; semantic surface, text, border and accent colors; verdict colors for match, context, differs and none) mapped into Tailwind in `app/globals.css`. Dark mode follows `data-theme="dark"`, set before first paint from local storage or the system setting.
- Fonts: IBM Plex Sans Arabic and Outfit (numbers use Outfit through the `num` utility).
- Components in `components/ui/`: Button/ButtonLink/IconButton, Badge, Card/CardHeader/Metric/PageHeader/EmptyState/Skeleton, Field/Input/Textarea/Select/Checkbox/Radio, Switch, Segmented, Dialog, Menu, Tooltip, Progress, Sparkline, Pagination, Avatar, Icon (paths generated from the design's icon set) and Nuqta (the brand's rhombus marker).
- Verdict colors are reserved for verdicts; workflow statuses use ink and lapis with an icon.

## Environment variables

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase clients |
| `SUPABASE_SECRET_KEY` | Admin client (server only) |
| `SITE_URL` | Links in emails (default `http://localhost:3000`) |
| `WORKER_API_URL`, `INTERNAL_API_TOKEN` | Calls to the worker API (Ask Isnad) |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | The Telegram deep link on the settings page |

`make env` writes `web/.env.local` for local development.
