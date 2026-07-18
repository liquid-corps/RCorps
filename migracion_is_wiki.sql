-- Separar personajes de perfil (is_wiki=false) de los de librería (is_wiki=true)
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS is_wiki boolean DEFAULT true;

-- Los personajes existentes se consideran de la wiki (el admin los puso ahí)
UPDATE public.characters SET is_wiki = true WHERE is_wiki IS NULL;

-- Índice para filtrar rápido
CREATE INDEX IF NOT EXISTS characters_is_wiki_idx
  ON public.characters (is_wiki);
