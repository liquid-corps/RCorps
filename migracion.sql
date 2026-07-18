-- ============================================================
--  RCorps - Migración a Supabase Auth + Discord OAuth
-- ============================================================
--  Este script se ejecuta UNA SOLA VEZ en:
--    Supabase Dashboard → SQL Editor → New query → pegar → Run
--
--  Hace lo siguiente:
--    1. Crea la tabla `profiles` (vinculada a auth.users)
--    2. Añade `owner_id` a `characters` para saber de quién es cada uno
--    3. Crea un trigger que hace perfil + personaje automático al entrar con Discord
--    4. Activa Row Level Security (RLS) en ambas tablas
--    5. Define policies (quién puede leer/escribir qué)
--    6. Crea función helper is_admin()
-- ============================================================

-- ============================================================
-- 1. TABLA PROFILES (reemplaza a la antigua `users`)
-- ============================================================
--  Se vincula 1:1 con auth.users (donde Supabase Auth guarda las
--  cuentas, incluidas las de Discord). El ON DELETE CASCADE hace
--  que al borrar un usuario de Auth, su perfil también desaparezca.

CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     text,
  discord_id   text,
  discord_tag  text,
  avatar_url   text,
  role         text NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Índice para buscar perfiles por discord_id rápidamente
CREATE INDEX IF NOT EXISTS profiles_discord_id_idx
  ON public.profiles (discord_id);


-- ============================================================
-- 2. COLUMNA OWNER_ID EN CHARACTERS
-- ============================================================
--  Cada personaje puede tener un dueño (el usuario que lo edita
--  desde su perfil). Los personajes antiguos quedan sin dueño
--  (owner_id = NULL) y solo el admin puede editarlos.

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;


-- ============================================================
-- 3. TRIGGER: perfil + personaje automáticos al registrarse
-- ============================================================
--  Cuando un usuario entra por primera vez con Discord, Supabase
--  Auth crea su fila en auth.users. Este trigger la detecta y:
--    a) Crea su `profile` con los datos que manda Discord (nombre,
--       avatar, id de Discord).
--    b) Si el username de Discord es uno de los ADMIN_AUTORIZADOS,
--       le da role = 'admin'.
--    c) Si NO es admin, le crea automáticamente un personaje vacío
--       vinculado a su cuenta, para que pueda editarlo en perfil.html.

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
  v_profile_id uuid;
BEGIN
  -- Discord manda los datos en raw_user_meta_data
  v_username   := COALESCE(
                    NEW.raw_user_meta_data->>'full_name',
                    NEW.raw_user_meta_data->>'name',
                    NEW.raw_user_meta_data->>'user_name',
                    split_part(COALESCE(NEW.email,'@'), '@', 1)
                  );
  v_discord_id := NEW.raw_user_meta_data->>'provider_id';
  v_avatar     := NEW.raw_user_meta_data->>'avatar_url';

  -- Lista de usernames de Discord que son admin.
  -- Cámbiala si tus admins tienen otros nombres.
  IF lower(v_username) IN ('water', 'riper', 'princesuijin', 'soyriper') THEN
    v_role := 'admin';
  END IF;

  -- (a)+(b) Crear el perfil
  INSERT INTO public.profiles (id, username, discord_id, avatar_url, role)
  VALUES (NEW.id, v_username, v_discord_id, v_avatar, v_role)
  RETURNING id INTO v_profile_id;

  -- (c) Si es un usuario normal, crearle un personaje vacío
  IF v_role = 'user' THEN
    INSERT INTO public.characters (
      category, skills, modes,
      portrait_list, portrait_info,
      name, roblox, age, gender, bio,
      owner_id
    ) VALUES (
      'Kages',
      COALESCE(NEW.raw_user_meta_data->>'skills', '{}')::jsonb,
      ARRAY['Tags/0079.gif', 'Tags/0087.gif'],
      'assets/foto_lista1.png',
      'assets/foto_info.png',
      '', '', '', '', '',
      v_profile_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 4. ACTIVAR ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 5. POLICIES DE SEGURIDAD
-- ============================================================

-- ---- profiles ----
--  Todo el mundo puede ver perfiles (para mostrar nombres en la
--  librería). Pero solo el propio usuario puede editar el suyo.
DROP POLICY IF EXISTS "profiles_select_all"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"    ON public.profiles;

CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ---- characters ----
--  Lectura pública (el catálogo se ve sin login).
--  Escritura: el dueño del personaje O un admin.
DROP POLICY IF EXISTS "characters_select_all"   ON public.characters;
DROP POLICY IF EXISTS "characters_update_own"   ON public.characters;
DROP POLICY IF EXISTS "characters_admin_all"    ON public.characters;

CREATE POLICY "characters_select_all"
  ON public.characters FOR SELECT
  USING (true);

CREATE POLICY "characters_update_own"
  ON public.characters FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "characters_admin_all"
  ON public.characters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- ============================================================
-- 6. FUNCIÓN HELPER is_admin()
-- ============================================================
--  Permite saber desde el cliente si el usuario actual es admin,
--  llamando a supabase.rpc('is_admin', {}).

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;


-- ============================================================
-- 7. MIGRACIÓN DE ADMINS ACTUALES (opcional)
-- ============================================================
--  Los 2 admins de la tabla `users` antigua (@Water, @Riper) van
--  a aparecer solos como admin la primera vez que entren con
--  Discord, gracias al bloque del paso 3. Por eso no hace falta
--  migrarlos a mano.
--
--  La tabla `users` antigua NO se toca ni se borra aquí, por si
--  acaso. Cuando confirmes que Discord funciona, puedes borrarla
--  con:  DROP TABLE public.users;
-- ============================================================

-- Fin del script. Si todo salió bien verás "Success. No rows returned".
