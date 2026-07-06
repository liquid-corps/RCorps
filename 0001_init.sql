-- ============================================================
-- Esquema de datos para el sistema de cuentas Lcorps (Supabase)
-- Pégalo en: Dashboard de Supabase → SQL Editor → New query → Run
-- ============================================================

-- Perfil público de cada cuenta (además del usuario/clave que ya maneja
-- Supabase Auth internamente). Un registro por usuario autenticado.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  discord_id text unique,
  discord_username text,
  ficha jsonb default '{}'::jsonb,
  last_edited timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Cada quien puede leer/editar solo su propia fila.
create policy "leer propio perfil" on public.profiles
  for select using (auth.uid() = id);
create policy "editar propio perfil" on public.profiles
  for update using (auth.uid() = id);
create policy "crear propio perfil" on public.profiles
  for insert with check (auth.uid() = id);

-- Códigos de recuperación de clave (nadie los lee/escribe directo: solo
-- las Edge Functions, que usan la service_role key y se saltan RLS).
create table if not exists public.reset_requests (
  code text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean default false,
  created_at timestamptz default now()
);
alter table public.reset_requests enable row level security;
-- (sin policies = nadie puede leer/escribir desde el navegador)

-- ------------------------------------------------------------
-- Función para comprobar "Usuario en uso" SIN exponer toda la tabla.
-- Se puede llamar desde el navegador de forma segura (solo devuelve true/false).
-- ------------------------------------------------------------
create or replace function public.username_available(uname text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(uname)
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- ------------------------------------------------------------
-- Cooldown de 7 días para editar: función que valida y actualiza la ficha.
-- Se llama desde el navegador vía supabase.rpc(), pero la revisa el propio
-- Postgres (no se puede saltar editando el JS).
-- ------------------------------------------------------------
create or replace function public.update_ficha(nueva_ficha jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  fila public.profiles%rowtype;
  dias_restantes int;
begin
  select * into fila from public.profiles where id = auth.uid();
  if fila is null then
    raise exception 'Cuenta no encontrada';
  end if;

  if fila.last_edited > now() - interval '7 days' then
    dias_restantes := ceil(extract(epoch from (fila.last_edited + interval '7 days' - now())) / 86400);
    raise exception '%d restantes para editar', dias_restantes;
  end if;

  update public.profiles
    set ficha = nueva_ficha, last_edited = now()
    where id = auth.uid();

  return 'ok';
end;
$$;

grant execute on function public.update_ficha(jsonb) to authenticated;
