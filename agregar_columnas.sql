-- ============================================================
--  AÑADIR COLUMNAS FALTANTES a `characters`
-- ============================================================
--  Ejecuta esto en Supabase → SQL Editor → Run
--  Añade: clan, rank, zodiac (que faltaban y causaban el error
--  "Could not find the 'clan' column")
-- ============================================================

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS clan   text,
  ADD COLUMN IF NOT EXISTS rank   text,
  ADD COLUMN IF NOT EXISTS zodiac text;

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'characters'
ORDER BY ordinal_position;
