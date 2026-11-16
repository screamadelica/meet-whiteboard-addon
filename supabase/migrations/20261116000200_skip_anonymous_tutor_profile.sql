create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  user_display_name text;
begin
  if new.is_anonymous then
    return new;
  end if;

  user_display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Tutor'
  );

  insert into public.profiles (id, email, display_name, role)
  values (new.id, new.email, user_display_name, 'Tutor')
  on conflict (id) do nothing;

  insert into public.tutors (name, email, member_since)
  select user_display_name, new.email, current_date
  where new.email is not null
    and not exists (
      select 1
      from public.tutors as tutor
      where tutor.email = new.email
    );

  return new;
end;
$function$;