# Security

## Principles

- Every client query runs as the signed-in user and is filtered by row-level security (RLS). There is no access without an explicit policy.
- State changes that carry rules (decisions, approval, publishing, invitations, figure review) go through `SECURITY DEFINER` SQL functions that check the caller's role themselves. The same rules hold whether a request comes from the web app or from anywhere else.
- Privileged keys (the Supabase secret key, model and speech keys) exist only on the server and in the worker.
- Files are private. Access is always a short-lived signed URL issued after an authorization check.

## Sign-in

Self sign-up is off (`enable_signup = false`). Accounts come from invitations or from platform staff.

| Flow | How it works |
|---|---|
| Magic link | `sendMagicLink` calls `signInWithOtp` with `shouldCreateUser: false`. The email links to `/auth/confirm?token_hash=…&type=…&next=…`, which verifies the token (`verifyOtp`) and redirects to a safe `next` path (`safeNext` only allows local paths). A failed link returns to sign-in with `error=link` and keeps `next`. |
| Password | `signInWithPassword`. Minimum length 8. |
| Password reset | `requestPasswordReset` → email → `/{locale}/reset-password` → `updatePassword`. |
| Invitation | See below. |
| Sign-out | `POST /auth/sign-out`. |

Email templates (Arabic and English) are in `supabase/templates/`.

### Proxy

`web/src/proxy.ts` runs on every request except static files:

1. Adds the locale prefix when missing (cookie `isnad_locale`, then `Accept-Language`, default Arabic).
2. Refreshes the session and validates it with `getClaims()`.
3. Sends signed-out users to `/{locale}/sign-in?next=…`, except on public pages: sign-in, check-email, reset-password, `/invite/…` and the public evidence page `/n/…`.
4. Sends signed-in users away from sign-in.

Route handlers under `/auth/` and `/api/` only get the session refresh.

Pages call `requireViewer`, `requireNewsroom`, `requireNewsroomRole` or `requireStaff` (`web/src/lib/auth.ts`). A token whose user no longer has a profile (for example after a database reset) is sent to `/auth/session-ended`, which signs it out locally only when no viewer can be resolved, so the link can't sign anyone else out.

### Invitations

1. A newsroom admin (or a platform admin) calls `create_invitation(newsroom, email, name, role, desk)`. It checks the caller, refuses existing active members and foreign desks, stores only the sha256 of a random token, and returns the raw token once.
2. The server sends the email through Supabase Auth: an invitation for an address without an account, or a one-time sign-in link for an existing account. Both land on `/{locale}/invite/{token}`.
3. The invite page calls `invitation_preview(token)` (callable without signing in; it returns only the newsroom name, role and a masked address) and shows one of: open, signed out, wrong account, expired, used, invalid.
4. `accept_invitation(token)` checks the hash, that it is open and unexpired, and that the signed-in email matches, then creates or reactivates the membership.

Admins can renew (new token, old link stops working) or revoke an open invitation. Invitations expire after 14 days.

## Roles

| Role | Where it is stored | Scope |
|---|---|---|
| Journalist, editor, newsroom admin | `memberships.role` | One newsroom. A user can belong to several newsrooms and switches between them. |
| Curator, platform admin | `profiles.platform_role` | The whole platform (the console at `/{locale}/console`). |

See [../product/roles-and-permissions.md](../product/roles-and-permissions.md) for the full matrix.

## RLS helpers

Defined as `SECURITY DEFINER` functions so policies can consult memberships without recursive RLS:

| Function | True when |
|---|---|
| `is_member(newsroom)` | The caller has an active membership. |
| `has_role(newsroom, roles[])` | The caller has an active membership with one of the roles. |
| `is_staff()` / `is_platform_admin()` | The caller's platform role is curator or admin / admin. |
| `shares_newsroom(user)` | The caller and that user share a newsroom (used to show names). |
| `can_view_check(check)` | Member of the check's newsroom, and one of: visibility is `newsroom`, the caller created it, the caller is an editor or admin, the caller is the assigned editor, or visibility is `desk` and the caller is on that desk. |
| `can_edit_check(check)` | Member, and the creator or an editor/admin. |
| `can_decide_check(check)` | Editor or admin in the check's newsroom. |

## What each table allows

| Area | Read | Write |
|---|---|---|
| Profiles | Self, people in a shared newsroom, staff | Self (not `platform_role` or `email`) |
| Newsrooms, desks, memberships | Members, staff | Newsroom admins (policies, desks, members); platform admins (limits, status) |
| Invitations | Newsroom admins, staff | Only through the invitation functions |
| Topics, entities, indicators | Everyone signed in | Staff |
| Sources | Shared active/paused sources, own newsroom's private sources, staff | Staff; newsroom admins for their private sources |
| Documents, versions | Shared ones, own newsroom's private ones, staff | Worker only |
| Figures | Approved shared figures and own newsroom's approved private ones; staff see all | Staff (through review functions) |
| Checks and derived rows | `can_view_check` | Insert by members (as themselves, `processing`/`queued` only); rename/visibility/desk by `can_edit_check`; everything else through functions |
| Comments | `can_view_check` | Insert as yourself; delete your own |
| Alerts | Your own, and newsroom-wide ones | Mark your own read/dismissed |
| Briefs | Members | Insert as yourself; delete your own (admins any) |
| Activity, usage | Newsroom admins (own newsroom), staff | Through `log_activity` and the worker |
| Model settings, eval runs, jobs | Staff | Model settings: platform admins; eval runs: staff insert queued runs; jobs: worker and functions only |
| Telegram links | Your own | Unlink your own |

The anonymous role has no table access. Its only entry points are `get_public_note(slug)` and `invitation_preview(token)`.

Triggers protect columns that RLS can't: `protect_check_columns` (status, stage, results, publication fields, storage path), `protect_profile_columns`, `protect_newsroom_columns` (slug, kind, status, limit unless platform admin), `protect_membership_columns` (a membership can't move), `ensure_newsroom_admin` (never remove the last active admin).

## Workflow functions and their checks

| Function | Allowed for | Other checks |
|---|---|---|
| `decide_claim(claim, approve/edit/escalate/reopen, note, wording)` | `can_decide_check` | Check not processing, archived or failed; `edit` needs wording; escalation alerts the assigned editor and the creator |
| `approve_matches(check)` | `can_decide_check` | Only pending `match` results without a verifier objection |
| `send_for_review(check, editor)` | `can_edit_check` | Not processing, failed, archived or published; the editor must be an active editor/admin |
| `approve_check(check)` | `can_decide_check` | Status awaiting review or in review; no pending or escalated numbers |
| `publish_check(check, url)` | `can_decide_check` | Approved or published; `http(s)` URL; creates the public slug |
| `archive_check(check)` | `can_edit_check` | Also cancels a processing check |
| `request_recheck(check)` | `can_edit_check` | Not processing or archived |
| `update_segment(segment, text)` | `can_edit_check` | Not processing, published or archived |
| `request_claim_search(claim)` | `can_edit_check` | Not processing, archived, failed or published |
| Console functions (`approve_figures`, `reject_figures`, `update_figure`, `assign_indicator`, `add_source_document`, `fetch_source_now`, `retry_extraction`, `review_source_proposal`, `retry_job`, `cancel_job`, `console_*` stats) | Staff (`require_staff`) | Platform-admin-only where noted in the console |
| Newsroom functions (`create_invitation`, `renew_invitation`, `revoke_invitation`, `update_member`, `set_member_status`, `newsroom_members`, `newsroom_activity`, `newsroom_stats`) | Newsroom admin or platform admin (`require_newsroom_admin`) | Last-admin guard |

Errors are raised with stable codes (for example `not_allowed`, `claims_pending`, `check_not_reviewable`) that the web app maps to translated messages (`web/src/lib/errors.ts`).

## Storage access

- Uploads for checks: the `createUploadUrl` server action checks the user and the media type, then issues a signed upload URL for a path inside the user's newsroom folder. `createCheck` refuses a storage path outside that folder and confirms the object exists.
- Media playback and stored documents: the server signs URLs with the secret key only after an RLS-respecting query has returned the row.
- The public evidence page links to the official document's original URL, never to Isnad's stored copy.

## Fetching from the internet (SSRF)

`isnad_worker.pipeline.content.download` is used for link checks, discovery, source fetches and re-fetches:

- Only `http` and `https`.
- The host is resolved and refused if any address is private, loopback, link-local, reserved or multicast.
- Redirects are followed by hand, and every redirect target is checked again.
- Downloads stop at 30 MB.

Discovery and registry intake also require the URL's host to be in an approved source's `domains` (exactly, or as a subdomain). The console's `add_source_document` repeats that check in SQL, so lookalike hosts are refused.

## Secrets

| Secret | Where it lives |
|---|---|
| Supabase secret key | `web/.env.local` (server-only module `lib/supabase/admin.ts`), `worker/.env` |
| `INTERNAL_API_TOKEN` | Web and worker; protects `/internal/*` on the worker API (constant-time compare) |
| Gemini API key | Worker only |
| Telegram bot token, webhook secret | Worker only |

Locally, `make env` writes both env files from the running Supabase and from a `credentials/` folder outside the repository, printing only variable names. Env files are git-ignored.

## Public evidence page

`get_public_note(slug)` returns only published checks, and only their approved or edited numbers that have evidence: the text, verdict, chain, quote, document title and original URL, and a revision notice. It never returns comments, verifier notes, people or unapproved numbers. Slugs are random (12 hex characters).
