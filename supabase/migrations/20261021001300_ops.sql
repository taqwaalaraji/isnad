-- Operations: the evaluation newsroom, eval runs started outside the queue, Telegram update dedupe.

-- Internal newsrooms (the evaluation harness) are left out of product statistics and member lists.
alter table public.newsrooms add column internal boolean not null default false;

comment on column public.newsrooms.internal is
  'Internal workspaces (e.g. the evaluation harness): excluded from product statistics and usage.';

-- Eval runs created from the console are queued; the CLI creates them already running and runs them
-- in-process, so only queued runs go to the job queue.
create or replace function public.enqueue_eval_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'queued' then
    perform public.enqueue_job('run_eval', jsonb_build_object('eval_run_id', new.id), 0);
  end if;
  return new;
end;
$$;

-- Telegram may deliver the same update more than once (webhook retries, polling restarts):
-- each update is handled once.
create table public.telegram_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);

alter table public.telegram_updates enable row level security;
revoke all on public.telegram_updates from anon, authenticated;

create index telegram_updates_received_idx on public.telegram_updates (received_at);
