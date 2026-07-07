/**
 * auth.js — lógica de Registrar / Iniciar sesión / Olvidaste la clave.
 * Ahora usando Supabase (Auth + Postgres + Edge Functions), sin necesitar
 * ninguna tarjeta de pago.
 *
 * En tu index.html agrega:
 *   <script type="module" src="auth.js"></script>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// 1) PEGA AQUÍ TUS DATOS DE SUPABASE (Project Settings → API)
// ============================================================
const SUPABASE_URL = "https://bshwjiukzvfqczgbxuse.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzaHdqaXVrenZmcWN6Z2J4dXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjgwODksImV4cCI6MjA5ODk0NDA4OX0.EGkDntr5xvB-D_G0P-7jxJLZbdMjBW_mWY70KuVTzsQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DOMINIO_FALSO = "lcorps.local";

// URL de tus Edge Functions (se arman solas con tu SUPABASE_URL)
const FN_URL = (nombre) => `${SUPABASE_URL}/functions/v1/${nombre}`;

// ============================================================
// Helpers de UI
// ============================================================
const $ = (id) => document.getElementById(id);
const overlay = $("auth-overlay");
const panels = {
  registrar: $("panel-registrar"),
  login: $("panel-login"),
  olvide: $("panel-olvide"),
  confirmar: $("panel-confirmar"),
};

function mostrarPanel(nombre) {
  overlay.classList.add("open");
  Object.values(panels).forEach((p) => p.classList.add("auth-hidden"));
  panels[nombre].classList.remove("auth-hidden");
}
function cerrarPaneles() {
  overlay.classList.remove("open");
}
function setMsg(id, texto, tipo) {
  const el = $(id);
  el.textContent = texto || "";
  el.className = "auth-msg" + (tipo ? " " + tipo : "");
}

document.querySelectorAll("[data-open-registro]").forEach((el) =>
  el.addEventListener("click", (e) => {
    e.preventDefault();
    mostrarPanel("registrar");
  })
);
document.querySelectorAll("[data-open-login]").forEach((el) =>
  el.addEventListener("click", (e) => {
    e.preventDefault();
    mostrarPanel("login");
  })
);

$("btn-ir-olvide-1").onclick = () => mostrarPanel("olvide");
$("btn-ir-olvide-2").onclick = () => mostrarPanel("olvide");
$("btn-ir-login-1").onclick = () => mostrarPanel("login");
$("btn-ir-login-2").onclick = () => mostrarPanel("login");
$("btn-ir-registrar-1").onclick = () => mostrarPanel("registrar");
$("btn-ir-registrar-2").onclick = () => mostrarPanel("registrar");

// ============================================================
// Puente con el botón "Enviar" de la ficha (llamado desde index.html)
// - Si no hay sesión: guarda la imagen para más tarde y abre "Registrar".
// - Si ya hay sesión: pide confirmación (respeta el cooldown de 7 días)
//   y recién ahí manda la imagen.
// ============================================================
async function enviarImagenAlWebhook(imageBase64, name) {
  const { data: sesion } = await supabase.auth.getSession();
  const res = await fetch(FN_URL("send-registration-card"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sesion.session.access_token}`,
    },
    body: JSON.stringify({ username: name, imageBase64 }),
  });
  if (!res.ok) throw new Error("No se pudo enviar la imagen al servidor.");
}

window.lcorpsEnviarFicha = async function (imageBase64, name) {
  const { data: sesion } = await supabase.auth.getSession();

  if (!sesion.session) {
    // Todavía no tiene cuenta: guardamos la imagen y lo mandamos a Registrar.
    window.__fichaPendiente = { imageBase64, name };
    mostrarPanel("registrar");
    return;
  }

  // Ya tiene cuenta: confirmar antes de enviar (cooldown de 7 días).
  mostrarPanel("confirmar");
  $("btn-cancelar-confirm").onclick = () => cerrarPaneles();
  $("btn-aceptar-confirm").onclick = async () => {
    const { error } = await supabase.rpc("update_ficha", { nueva_ficha: { nombre: name } });
    if (error) {
      cerrarPaneles();
      alert(error.message); // p.ej. "5d restantes para editar"
      return;
    }
    try {
      await enviarImagenAlWebhook(imageBase64, name);
      cerrarPaneles();
      alert("¡Registro enviado con éxito!");
    } catch (e) {
      cerrarPaneles();
      alert("No se pudo enviar la imagen. Intentalo de nuevo.");
    }
  };
};

// ============================================================
// PANEL REGISTRAR
// ============================================================
$("reg-username").addEventListener("blur", async () => {
  const username = $("reg-username").value.trim();
  if (!username) return;
  setMsg("reg-username-msg", "Comprobando...", "");
  const { data, error } = await supabase.rpc("username_available", { uname: username });
  if (error) return setMsg("reg-username-msg", "No se pudo comprobar.", "err");
  setMsg("reg-username-msg", data ? "" : "Usuario en uso", "err");
});

// Vincular Discord: abrimos un popup a este mismo sitio; como comparte el
// mismo localStorage (mismo origen), cuando el popup termina el login con
// Discord y se lo linkea a la sesión, la pestaña principal solo necesita
// refrescar el usuario.
$("btn-vincular-discord").onclick = () => {
  const popup = window.open(
    window.location.pathname + "?vincular-discord=1",
    "discord-oauth",
    "width=480,height=720"
  );
  if (!popup) {
    setMsg("reg-discord-msg", "El navegador bloqueó la ventana emergente. Permití popups para este sitio e intentá de nuevo.", "err");
    return;
  }
  window.addEventListener("message", async function handler(ev) {
    if (ev.data?.source !== "lcorps-discord-linked") return;
    window.removeEventListener("message", handler);
    popup?.close();

    if (ev.data.error) {
      setMsg("reg-discord-msg", "Cuenta ya vinculada", "err");
      return;
    }
    setMsg("reg-discord-msg", "Verificando...", "");
    const { data: userData } = await supabase.auth.getUser();
    const identidadDiscord = userData.user?.identities?.find((i) => i.provider === "discord");
    if (identidadDiscord) {
      window.__discordVinculado = {
        discordId: identidadDiscord.identity_data.provider_id || identidadDiscord.identity_data.sub,
        discordUsername:
          identidadDiscord.identity_data.full_name ||
          identidadDiscord.identity_data.name ||
          identidadDiscord.identity_data.username,
      };
      $("reg-discord").value = window.__discordVinculado.discordUsername;
      setMsg("reg-discord-msg", "Vinculado ✓", "ok");
    } else {
      setMsg("reg-discord-msg", "No se pudo vincular.", "err");
    }
  });
};

$("btn-crear").onclick = async () => {
  const username = $("reg-username").value.trim();
  const password = $("reg-password").value;
  const discordVinculado = window.__discordVinculado;

  if (!username) return setMsg("reg-username-msg", "Escribe un usuario.", "err");
  if (!discordVinculado) return setMsg("reg-discord-msg", "Vincula tu Discord.", "err");
  if (password.length < 6 || password.length > 8)
    return setMsg("reg-password-msg", "La clave debe tener 6 a 8 caracteres.", "err");

  $("btn-crear").disabled = true;
  try {
    // En este punto ya hay una sesión (se creó al vincular Discord con
    // signInWithOAuth). Le ponemos usuario/clave a ESA misma cuenta:
    const { error: passError } = await supabase.auth.updateUser({
      email: `${username.toLowerCase()}@${DOMINIO_FALSO}`,
      password,
    });
    if (passError) throw passError;

    const { error: perfilError } = await supabase.from("profiles").insert({
      id: (await supabase.auth.getUser()).data.user.id,
      username,
      discord_id: discordVinculado.discordId,
      discord_username: discordVinculado.discordUsername,
    });
    if (perfilError) throw perfilError;

    // Si tenés la ficha llena en pantalla, generá el PNG con html2canvas y
    // mandalo al webhook a través de la Edge Function (mantiene oculta la URL):
    // const canvas = await html2canvas(document.getElementById('card'));
    // const imageBase64 = canvas.toDataURL('image/png').split(',')[1];
    // const { data: sesion } = await supabase.auth.getSession();
    // await fetch(FN_URL('send-registration-card'), {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     Authorization: `Bearer ${sesion.session.access_token}`,
    //   },
    //   body: JSON.stringify({ username, imageBase64 }),
    // });

    cerrarPaneles();

    // Si venías de tocar "Enviar" en la ficha antes de tener cuenta,
    // ahora que ya existe, se manda sola.
    if (window.__fichaPendiente) {
      try {
        await enviarImagenAlWebhook(window.__fichaPendiente.imageBase64, window.__fichaPendiente.name);
        alert("¡Cuenta creada y registro enviado con éxito!");
      } catch (e) {
        alert("¡Cuenta creada! (la ficha no se pudo enviar, probá tocar Enviar de nuevo)");
      }
      window.__fichaPendiente = null;
    } else {
      alert("¡Cuenta creada! Ya podés iniciar sesión.");
    }
  } catch (e) {
    if (e.message.includes("duplicate") || e.message.includes("unique"))
      setMsg("reg-username-msg", "Usuario en uso", "err");
    else setMsg("reg-password-msg", "No se pudo crear la cuenta.", "err");
  } finally {
    $("btn-crear").disabled = false;
  }
};

// ============================================================
// PANEL INICIAR SESIÓN
// ============================================================
$("btn-entrar").onclick = async () => {
  setMsg("login-username-msg", "", "");
  setMsg("login-password-msg", "", "");
  const username = $("login-username").value.trim();
  const password = $("login-password").value;

  $("btn-entrar").disabled = true;
  try {
    // Supabase no distingue "no existe" de "clave mal" por seguridad, así
    // que primero comprobamos si el usuario existe para dar el mismo
    // mensaje que en tus capturas.
    const { data: disponible } = await supabase.rpc("username_available", { uname: username });
    if (disponible) {
      setMsg("login-username-msg", "Usuario no encontrado", "err");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: `${username.toLowerCase()}@${DOMINIO_FALSO}`,
      password,
    });
    if (error) {
      setMsg("login-password-msg", "Clave incorrecta", "err");
      return;
    }
    cerrarPaneles();
  } finally {
    $("btn-entrar").disabled = false;
  }
};

// ============================================================
// PANEL OLVIDASTE LA CLAVE
// ============================================================
$("btn-enviar-codigo").onclick = async () => {
  const discordUsername = $("olvide-discord").value.trim();
  setMsg("olvide-discord-msg", "Enviando...", "");
  const res = await fetch(FN_URL("request-password-reset"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ discordUsername }),
  });
  if (!res.ok) {
    setMsg("olvide-discord-msg", "Usuario no encontrado", "err");
    return;
  }
  setMsg("olvide-discord-msg", "Código enviado por Discord.", "ok");
  $("olvide-codigo-wrap").classList.remove("auth-hidden");
  $("olvide-clave-wrap").classList.remove("auth-hidden");
};

$("olvide-nueva-clave").addEventListener("keyup", async (ev) => {
  if (ev.key !== "Enter") return;
  const codigo = $("olvide-codigo").value.trim();
  const nuevaClave = $("olvide-nueva-clave").value;
  const res = await fetch(FN_URL("reset-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo, nuevaClave }),
  });
  if (!res.ok) {
    setMsg("olvide-codigo-msg", "Clave incorrecta", "err");
    return;
  }
  setMsg("olvide-codigo-msg", "¡Clave actualizada! Ya podés iniciar sesión.", "ok");
  setTimeout(() => mostrarPanel("login"), 1200);
});

// ============================================================
// PANEL CONFIRMAR (guardar ediciones de la ficha, respeta el cooldown de 7 días)
// Llamá a window.pedirConfirmacionYGuardar(datosFicha) desde tu código del perfil.
// ============================================================
window.pedirConfirmacionYGuardar = function (ficha) {
  mostrarPanel("confirmar");
  $("btn-cancelar-confirm").onclick = () => cerrarPaneles();
  $("btn-aceptar-confirm").onclick = async () => {
    const { error } = await supabase.rpc("update_ficha", { nueva_ficha: ficha });
    cerrarPaneles();
    if (error) alert(error.message); // p.ej. "5d restantes para editar"
    else alert("Perfil actualizado.");
  };
};

overlay.addEventListener("click", (e) => {
  if (e.target === overlay) cerrarPaneles();
});

// ============================================================
// Estado de sesión (muestra "Perfil" en vez de "Registro" en la barra)
// ============================================================
supabase.auth.onAuthStateChange((_event, session) => {
  const logueado = !!session;
  document.querySelectorAll("[data-if-logged-in]").forEach((el) => {
    el.style.display = logueado ? "" : "none";
  });
  document.querySelectorAll("[data-if-logged-out]").forEach((el) => {
    el.style.display = logueado ? "none" : "";
  });
});

document.querySelectorAll("[data-logout]").forEach((el) =>
  el.addEventListener("click", (e) => {
    e.preventDefault();
    supabase.auth.signOut();
  })
);

// ============================================================
// Si esta pestaña se abrió como el popup de "Vincular con Discord"
// (?vincular-discord=1), dispara el login OAuth y, cuando vuelva de
// Discord, avisa a la ventana principal y se cierra sola.
// ============================================================
(async function manejarPopupDeDiscord() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("vincular-discord") === "1" && window.opener) {
    // Recién llegamos al popup: mandamos a Discord.
    // Ojo: usamos signInWithOAuth (no linkIdentity). En este punto todavía
    // NO existe ninguna sesión -sos un visitante anónimo registrándote-, y
    // linkIdentity exige que ya haya alguien logueado o falla en silencio
    // (por eso la página "se reiniciaba" sin vincular nada). signInWithOAuth
    // sí puede crear la sesión desde cero con la cuenta de Discord.
    if (!params.get("code")) {
      await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: { redirectTo: window.location.href },
      });
      return; // la página navega a Discord; el resto corre al volver
    }
    // Volvimos de Discord con ?code=...: supabase-js ya procesó la sesión.
    const { data, error } = await supabase.auth.getUser();
    const yaTeniaDiscord = data.user?.identities?.filter((i) => i.provider === "discord").length;
    window.opener.postMessage(
      { source: "lcorps-discord-linked", error: error?.message && !yaTeniaDiscord },
      window.location.origin
    );
    window.close();
  }
})();
