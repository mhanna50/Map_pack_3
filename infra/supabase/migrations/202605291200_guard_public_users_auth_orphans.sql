begin;

do $$
begin
  if to_regclass('public.users') is not null then
    delete from public.users u
    where not exists (
      select 1
      from auth.users au
      where au.id = u.id
    );

    if not exists (
      select 1
      from pg_constraint
      where conname = 'users_id_auth_users_fkey'
        and conrelid = 'public.users'::regclass
    ) then
      alter table public.users
        add constraint users_id_auth_users_fkey
        foreign key (id)
        references auth.users(id)
        on delete cascade;
    end if;
  end if;
end;
$$;

commit;
