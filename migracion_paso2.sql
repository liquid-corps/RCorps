-- ============================================================
--  MIGRACIÓN PASO 2: Crear función handle_new_user + trigger
-- ============================================================
--  Ejecuta este DESPUÉS del paso 1 (que ya corrió sin error).
-- ============================================================

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

  IF v_username IN ('Water', 'Riper') THEN
    v_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, username, discord_id, avatar_url, role)
  VALUES (NEW.id, v_username, v_discord_id, v_avatar, v_role);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

SELECT 'trigger creado' as check;
