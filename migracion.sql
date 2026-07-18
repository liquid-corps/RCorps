-- ============================================================
--  RCorps - Migración a Supabase Auth + Discord OAuth
-- ============================================================

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

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

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
  RETURNING id INTO v_profile_id;

  IF v_role = 'user' THEN
    INSERT INTO public.characters (
      category, skills, modes,
      portrait_list, portrait_info,
      name, roblox, age, gender, bio,
      owner_id
    ) VALUES (
      'Kages',
      '[]'::jsonb,
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

ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

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
