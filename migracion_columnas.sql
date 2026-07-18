-- ============================================================
--  RCorps - Añadir columnas faltantes a la tabla characters
-- ============================================================
--  Ejecuta esto en Supabase → SQL Editor → New query → Run
--  (Después de haber corrido migracion.sql)
--
--  El perfil.html guarda: name, age, rank, zodiac, clan, bio,
--  skills, modes, portrait_info, portrait_list
--  pero la tabla no tenía rank / zodiac / clan.
-- ============================================================

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS clan   text;
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS rank   text;
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS zodiac text;

-- Índices opcionales para búsquedas rápidas
CREATE INDEX IF NOT EXISTS characters_clan_idx
  ON public.characters (clan);
