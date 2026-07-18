-- ============================================================
--  MIGRACIÓN PASO 3: Activar RLS + policies + is_admin()
-- ============================================================
--  Ejecuta este DESPUÉS del paso 2.
-- ============================================================

ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- Policies para profiles
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policies para characters
DROP POLICY IF EXISTS "characters_select_all"  ON public.characters;
DROP POLICY IF EXISTS "characters_update_own"  ON public.characters;
DROP POLICY IF EXISTS "characters_admin_all"   ON public.characters;

CREATE POLICY "characters_select_all"
  ON public.characters FOR SELECT USING (true);

CREATE POLICY "characters_update_own"
  ON public.characters FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "characters_admin_all"
  ON public.characters FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- Función is_admin()
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

SELECT 'RLS + policies + is_admin OK' as check;
