-- ============================================================
--  RCorps - Migración de APROBACIÓN de perfiles (idempotente)
--  Ejecutar DESPUÉS de migracion_produccion.sql en Supabase -> SQL Editor -> Run.
--  Se puede correr varias veces sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nuevas columnas en characters
-- ------------------------------------------------------------
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'pendiente'
                                      CHECK (status IN ('pendiente','aprobado','rechazado'));

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS reject_reason text;

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS reviewed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS reviewed_at   timestamptz;

-- Momento del último envío a revisión (para cooldown serio en BD de 3 días).
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS last_submit   timestamptz;

CREATE INDEX IF NOT EXISTS characters_status_idx ON public.characters (status);

-- Dejar los personajes preexistentes como aprobados (ya estaban en uso).
UPDATE public.characters SET status = 'aprobado' WHERE status = 'pendiente' AND reviewed_at IS NULL AND last_submit IS NULL;

-- ------------------------------------------------------------
-- 2. Función para saber si un usuario puede re-enviar (cooldown 3 días)
--    Devuelve true si ya pasaron 3 días desde last_submit (o nunca envió).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_resubmit(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    ( SELECT last_submit IS NULL
        OR last_submit < (now() - interval '3 days')
      FROM public.characters
      WHERE owner_id = p_owner
      LIMIT 1
    ), true
  );
$$;

-- ------------------------------------------------------------
-- 3. Ajustar RLS de characters para proteger status/reviewed_*
--    El usuario normal solo puede editar SU propio personaje (is_wiki=false),
--    pero NO puede cambiar status/reject_reason/reviewed_by/reviewed_at.
--    Esos campos solo los toca el admin (vía characters_admin_all).
-- ------------------------------------------------------------

-- Recrear la policy de UPDATE del dueño con protección de columnas.
DROP POLICY IF EXISTS "characters_update_own" ON public.characters;
CREATE POLICY "characters_update_own"
  ON public.characters FOR UPDATE
  USING (owner_id = auth.uid() AND is_wiki = false)
  WITH CHECK (
    owner_id = auth.uid()
    AND is_wiki = false
    AND status = (SELECT status FROM public.characters WHERE id = characters.id)  -- no puede cambiar status
    AND reviewed_by IS NOT DISTINCT FROM (SELECT reviewed_by FROM public.characters WHERE id = characters.id)
    AND reviewed_at IS NOT DISTINCT FROM (SELECT reviewed_at FROM public.characters WHERE id = characters.id)
    AND reject_reason IS NOT DISTINCT FROM (SELECT reject_reason FROM public.characters WHERE id = characters.id)
  );

-- La inserción del dueño arranca siempre en pendiente (no puede auto-aprobarse).
DROP POLICY IF EXISTS "characters_insert_own" ON public.characters;
CREATE POLICY "characters_insert_own"
  ON public.characters FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND is_wiki = false
    AND status = 'pendiente'
  );

-- characters_admin_all ya existe y es ALL para is_admin(); la dejamos igual
-- (el admin sí puede cambiar status). Solo nos aseguramos de que exista.
DROP POLICY IF EXISTS "characters_admin_all" ON public.characters;
CREATE POLICY "characters_admin_all"
  ON public.characters FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
