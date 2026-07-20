-- Personalización de tarjetas de perfil
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS card_bg     text DEFAULT '#fdfbf7',
  ADD COLUMN IF NOT EXISTS card_border text DEFAULT '#c2b59b',
  ADD COLUMN IF NOT EXISTS card_text   text DEFAULT '#3a2e1e',
  ADD COLUMN IF NOT EXISTS card_font   text DEFAULT 'Courier New';
