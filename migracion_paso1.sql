-- ============================================================
--  MIGRACIÓN PASO 1: Crear tabla profiles (versión simple)
-- ============================================================
--  Ejecuta SOLO este bloque primero. Si da error, copia el mensaje
--  completo y pégaselo al asistente.
-- ============================================================

-- 1. Crear tabla profiles si no existe
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     text,
  discord_id   text,
  discord_tag  text,
  avatar_url   text,
  role         text NOT NULL DEFAULT 'user',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 2. Añadir owner_id a characters si no existe
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS owner_id uuid;

-- 3. Verificar que existan (esto debe mostrar 2 filas)
SELECT 'profiles existe' as check;
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'profiles' ORDER BY ordinal_position;
