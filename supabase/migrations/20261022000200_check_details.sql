-- Members change only a check's title, desk and visibility directly (its author, editors and
-- admins, under the checks_update policy); everything else changes through the workflow functions
-- and the worker. The desk must be one of the check's newsroom, and an archived check stays as it is.

create or replace function public.protect_check_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_title text := new.title;
  new_desk uuid := new.desk_id;
  new_visibility public.check_visibility := new.visibility;
begin
  if current_user = 'authenticated' then
    if old.status = 'archived' then
      raise exception 'check_not_editable' using errcode = '22023';
    end if;
    if new_desk is distinct from old.desk_id and new_desk is not null
       and not exists (select 1 from public.desks where id = new_desk and newsroom_id = old.newsroom_id) then
      raise exception 'desk_invalid' using errcode = '22023';
    end if;
    new := old;
    new.title := new_title;
    new.desk_id := new_desk;
    new.visibility := new_visibility;
  end if;
  return new;
end;
$$;
