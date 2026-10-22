-- Every alert reaches Telegram, whatever wrote it (the worker or a workflow function): inserting
-- an alert for a member who linked Telegram queues one delivery job. The worker's scheduler also
-- sweeps for alerts this job missed because it was already running.

create function public.queue_alert_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from inserted a join public.telegram_links l on l.user_id = a.user_id) then
    perform public.enqueue_job('deliver_alerts', '{}'::jsonb, 0, 'deliver-alerts');
  end if;
  return null;
end;
$$;

revoke execute on function public.queue_alert_delivery() from public, anon, authenticated;

create trigger alerts_queue_delivery
  after insert on public.alerts
  referencing new table as inserted
  for each statement execute function public.queue_alert_delivery();
