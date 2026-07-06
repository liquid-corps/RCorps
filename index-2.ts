// Edge Function: send-registration-card
// Recibe { username, imageBase64 } y reenvía la imagen al webhook de
// "nuevos registros" de Discord. Requiere estar autenticado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autenticado." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "No autenticado." }, 401);

    const { username, imageBase64 } = await req.json();
    if (!username || !imageBase64) return json({ error: "Faltan datos." }, 400);

    const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append(
      "payload_json",
      JSON.stringify({ content: `**Nuevo registro:** ${username}` })
    );
    form.append("files[0]", new Blob([bytes], { type: "image/png" }), `ficha_${username}.png`);

    const webhook = Deno.env.get("WEBHOOK_REGISTROS")!;
    const res = await fetch(webhook, { method: "POST", body: form });
    if (!res.ok) return json({ error: "El webhook rechazó el envío." }, 502);

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
