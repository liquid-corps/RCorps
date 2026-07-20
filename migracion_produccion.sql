-- ============================================================
--  RCorps - Migración FINAL para producción (idempotente)
--  Ejecutar TODO este archivo en Supabase -> SQL Editor -> Run.
--  Se puede correr varias veces sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabla profiles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     text,
  discord_id   text,
  discord_tag  text,
  avatar_url   text,
  role         text NOT NULL DEFAULT 'user',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_discord_id_idx
  ON public.profiles (discord_id);

-- ------------------------------------------------------------
-- 2. Columnas de characters
-- ------------------------------------------------------------
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS is_wiki boolean DEFAULT true;

UPDATE public.characters SET is_wiki = true WHERE is_wiki IS NULL;

CREATE INDEX IF NOT EXISTS characters_is_wiki_idx  ON public.characters (is_wiki);
CREATE INDEX IF NOT EXISTS characters_owner_id_idx ON public.characters (owner_id);

-- ------------------------------------------------------------
-- 2b. Tabla de categorías (dinámicas, gestionadas por admins)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text DEFAULT '',
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.categories (name, description, sort_order)
VALUES
  ('Kages',   'Lideres de cada Clan', 1),
  ('Bestias', 'Elite de Corps..',     2)
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Función is_admin (usada por policies y por el front)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. Trigger: crear profile al registrarse (y personaje si es user)
-- ------------------------------------------------------------
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
  v_username   := COALESCE(
                    NEW.raw_user_meta_data->>'full_name',
                    NEW.raw_user_meta_data->>'name',
                    NEW.raw_user_meta_data->>'user_name',
                    split_part(COALESCE(NEW.email,'@'), '@', 1)
                  );
  v_discord_id := NEW.raw_user_meta_data->>'provider_id';
  v_avatar     := NEW.raw_user_meta_data->>'avatar_url';

  IF lower(v_username) IN ('water', 'riper', 'princesuijin', 'soyriper') THEN
    v_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, username, discord_id, avatar_url, role)
  VALUES (NEW.id, v_username, v_discord_id, v_avatar, v_role)
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_profile_id;

  IF v_role = 'user' AND v_profile_id IS NOT NULL THEN
    INSERT INTO public.characters (
      category, skills, modes,
      portrait_list, portrait_info,
      name, roblox, age, gender, bio,
      owner_id, is_wiki
    ) VALUES (
      'Kages',
      ARRAY[]::text[],
      ARRAY['Tags/0079.gif', 'Tags/0087.gif'],
      'assets/foto_lista1.png',
      'assets/foto_info.png',
      '', '', '', '', '',
      v_profile_id,
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- 5. Likes y comentarios de perfiles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.character_likes (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  character_id integer NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, user_id)
);
CREATE INDEX IF NOT EXISTS character_likes_char_idx ON public.character_likes (character_id);

CREATE TABLE IF NOT EXISTS public.character_comments (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  character_id integer NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS character_comments_char_idx ON public.character_comments (character_id);

-- ------------------------------------------------------------
-- 6. Row Level Security
-- ------------------------------------------------------------
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_comments ENABLE ROW LEVEL SECURITY;

-- ---- profiles ----
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ---- categories ----
DROP POLICY IF EXISTS "categories_select_all" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_all"  ON public.categories;

CREATE POLICY "categories_select_all"
  ON public.categories FOR SELECT USING (true);

CREATE POLICY "categories_admin_all"
  ON public.categories FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- characters ----
DROP POLICY IF EXISTS "characters_select_all" ON public.characters;
DROP POLICY IF EXISTS "characters_update_own" ON public.characters;
DROP POLICY IF EXISTS "characters_insert_own" ON public.characters;
DROP POLICY IF EXISTS "characters_delete_own" ON public.characters;
DROP POLICY IF EXISTS "characters_admin_all"  ON public.characters;

CREATE POLICY "characters_select_all"
  ON public.characters FOR SELECT USING (true);

CREATE POLICY "characters_insert_own"
  ON public.characters FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND is_wiki = false);

CREATE POLICY "characters_update_own"
  ON public.characters FOR UPDATE
  USING (owner_id = auth.uid() AND is_wiki = false)
  WITH CHECK (owner_id = auth.uid() AND is_wiki = false);

CREATE POLICY "characters_delete_own"
  ON public.characters FOR DELETE
  USING (owner_id = auth.uid() AND is_wiki = false);

CREATE POLICY "characters_admin_all"
  ON public.characters FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- character_likes ----
DROP POLICY IF EXISTS "likes_select_all"  ON public.character_likes;
DROP POLICY IF EXISTS "likes_insert_own"  ON public.character_likes;
DROP POLICY IF EXISTS "likes_delete_own"  ON public.character_likes;

CREATE POLICY "likes_select_all"
  ON public.character_likes FOR SELECT USING (true);

CREATE POLICY "likes_insert_own"
  ON public.character_likes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "likes_delete_own"
  ON public.character_likes FOR DELETE
  USING (user_id = auth.uid());

-- ---- character_comments ----
DROP POLICY IF EXISTS "comments_select_all"   ON public.character_comments;
DROP POLICY IF EXISTS "comments_insert_own"   ON public.character_comments;
DROP POLICY IF EXISTS "comments_delete_own"   ON public.character_comments;
DROP POLICY IF EXISTS "comments_delete_admin" ON public.character_comments;

CREATE POLICY "comments_select_all"
  ON public.character_comments FOR SELECT USING (true);

CREATE POLICY "comments_insert_own"
  ON public.character_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- El autor borra sus comentarios; los admins borran cualquiera.
CREATE POLICY "comments_delete_own"
  ON public.character_comments FOR DELETE
  USING (user_id = auth.uid() OR public.is_admin());
