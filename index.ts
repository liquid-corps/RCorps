// Edge Function: request-password-reset
// Recibe { discordUsername }, busca la cuenta, genera un código de 6 dígitos
// y lo publica en el webhook de "verificaciones" mencionando al usuario.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RESET_EXPIRA_MS = 15 * 60 * 1000; // 15 minutos

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { discordUsername } = await req.json();
    if (!discordUsername) {
      return json({ error: "Falta el usuario de Discord." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: perfil, error: buscarError } = await supabase
      .from("profiles")
      .select("id, discord_id")
      .ilike("discord_username", discordUsername)
      .maybeSingle();

    if (buscarError) throw buscarError;
    if (!perfil) return json({ error: "Usuario no encontrado" }, 404);

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();

    const { error: insertError } = await supabase.from("reset_requests").insert({
      code: codigo,
      user_id: perfil.id,
      expires_at: new Date(Date.now() + RESET_EXPIRA_MS).toISOString(),
    });
    if (insertError) throw insertError;

    const webhook = Deno.env.get("WEBHOOK_VERIFICACIONES")!;
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `<@${perfil.discord_id}> tu código para recuperar la clave es **${codigo}** (vence en 15 minutos).`,
        allowed_mentions: { users: [perfil.discord_id] },
      }),
    });

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Error del servidor." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
