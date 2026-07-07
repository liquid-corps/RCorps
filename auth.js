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

$("btn-crear").onclick = async () => {
  const username = $("reg-username").value.trim();
  const email = $("reg-email").value.trim();
  const password = $("reg-password").value;

  if (!username) return setMsg("reg-username-msg", "Escribe un usuario.", "err");
  if (!email || !email.includes("@")) return setMsg("reg-email-msg", "Escribe un correo válido.", "err");
  if (password.length < 6 || password.length > 8)
    return setMsg("reg-password-msg", "La clave debe tener 6 a 8 caracteres.", "err");

  $("btn-crear").disabled = true;
  try {
    // Registro directo con el correo real del usuario (ya no hace falta
    // vincular Discord ni usar un dominio falso: Supabase maneja el
    // correo real, lo que además habilita su reseteo de clave nativo).
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (signUpError) throw signUpError;

    const { error: perfilError } = await supabase.from("profiles").insert({
      id: signUpData.user.id,
      username,
      email,
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

    // OJO: si en tu proyecto de Supabase está activado "Confirm email"
    // (Authentication → Providers → Email), signUp() NO deja sesión activa
    // hasta que el usuario confirme el correo, así que la ficha pendiente
    // recién se podrá enviar después de que confirme e inicie sesión.
    if (!signUpData.session) {
      alert("¡Cuenta creada! Revisa tu correo para confirmarla antes de iniciar sesión.");
      return;
    }

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
      alert("¡Cuenta creada!");
    }
  } catch (e) {
    if (e.message.includes("duplicate") || e.message.includes("unique"))
      setMsg("reg-username-msg", "Usuario en uso", "err");
    else if (e.message.toLowerCase().includes("already registered"))
      setMsg("reg-email-msg", "Ese correo ya tiene una cuenta.", "err");
    else setMsg("reg-password-msg", "No se pudo crear la cuenta.", "err");
  } finally {
    $("btn-crear").disabled = false;
  }
};

// ============================================================
// PANEL INICIAR SESIÓN
// ============================================================
$("btn-entrar").onclick = async () => {
  setMsg("login-email-msg", "", "");
  setMsg("login-password-msg", "", "");
  const email = $("login-email").value.trim();
  const password = $("login-password").value;

  $("btn-entrar").disabled = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Por seguridad, Supabase no distingue "correo no existe" de "clave
      // incorrecta", así que mostramos un solo mensaje genérico.
      setMsg("login-password-msg", "Correo o clave incorrectos", "err");
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
// NOTA IMPORTANTE (backend): esta Edge Function "request-password-reset"
// antes le mandaba el código por Discord (mensaje directo con un bot).
// Ahora que se le manda el correo en vez del usuario de Discord, tenés que
// actualizar ESA función en tu proyecto de Supabase para que envíe el
// código por correo (por ejemplo con Resend, SendGrid, o el email builtin
// de Supabase) en vez de por Discord. Yo no tengo acceso a tus Edge
// Functions, así que ese cambio del lado del servidor te queda a vos.
$("btn-enviar-codigo").onclick = async () => {
  const email = $("olvide-email").value.trim();
  setMsg("olvide-email-msg", "Enviando...", "");
  const res = await fetch(FN_URL("request-password-reset"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    setMsg("olvide-email-msg", "Correo no encontrado", "err");
    return;
  }
  setMsg("olvide-email-msg", "Código enviado por correo.", "ok");
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
