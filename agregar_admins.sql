-- ============================================================
--  ACTUALIZAR TRIGGER: añadir a princesuijin como admin
-- ============================================================
--  Ejecuta esto en Supabase → SQL Editor → Run
--  (solo si quieres que princesuijin / Water sea admin automáticamente
--   al entrar con Discord)
-- ============================================================

-- 1. Actualizar la función para incluir los usernames admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username   text;
  v_discord_id text;
  v_avatar     text;
  v_role       text := 'user';
BEGIN
  v_username   := COALESCE(
                    NEW.raw_user_meta_data->>'full_name',
                    NEW.raw_user_meta_data->>'name',
                    NEW.raw_user_meta_data->>'user_name',
                    split_part(COALESCE(NEW.email, '@unknown'), '@', 1)
                  );
  v_discord_id := NEW.raw_user_meta_data->>'provider_id';
  v_avatar     := NEW.raw_user_meta_data->>'avatar_url';

  -- LISTA DE ADMINS (añade aquí los usernames de Discord)
  IF v_username IN ('Water', 'Riper', 'princesuijin', 'soyriper') THEN
    v_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, username, discord_id, avatar_url, role)
  VALUES (NEW.id, v_username, v_discord_id, v_avatar, v_role);

  RETURN NEW;
END;
$$;

-- 2. Para usuarios YA existentes (por si ya entraron pero sin ser admin):
--    Actualiza el rol de cualquier perfil cuyo username esté en la lista.
UPDATE public.profiles
SET role = 'admin'
WHERE username IN ('Water', 'Riper', 'princesuijin', 'soyriper');

-- 3. Verificación
SELECT id, username, role FROM public.profiles;
