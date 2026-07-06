/**
 * auth.js — lógica de Registrar / Iniciar sesión / Olvidaste la clave.
 *
 * Antes de este archivo, en tu index.html agrega (versión módulo):
 *
 * <script type="module" src="auth.js"></script>
 *
 * Este archivo importa el SDK de Firebase directo desde CDN, no necesitas
 * instalar nada para el frontend.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithCustomToken,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// ============================================================
// 1) PEGA AQUÍ TU CONFIG DE FIREBASE (Configuración del proyecto → Tus apps)
// ============================================================
const firebaseConfig = {
  apiKey: "PON_AQUI_TU_API_KEY",
  authDomain: "PON_AQUI.firebaseapp.com",
  projectId: "PON_AQUI",
  storageBucket: "PON_AQUI.appspot.com",
  messagingSenderId: "PON_AQUI",
  appId: "PON_AQUI",
};

// Estos dos SÍ pueden ir en el frontend (no son secretos, son públicos por diseño de OAuth2)
const DISCORD_CLIENT_ID = "PON_AQUI_TU_DISCORD_CLIENT_ID";
const DISCORD_REDIRECT_URI = window.location.origin + window.location.pathname;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);

const callCheckUsername = httpsCallable(functions, "checkUsername");
const callDiscordExchange = httpsCallable(functions, "discordOAuthExchange");
const callRegister = httpsCallable(functions, "registerAccount");
const callLogin = httpsCallable(functions, "login");
const callRequestReset = httpsCallable(functions, "requestPasswordReset");
const callResetPassword = httpsCallable(functions, "resetPassword");
const callUpdateProfile = httpsCallable(functions, "updateProfile");

// ============================================================
// Si esta página se abrió como el popup de Discord (viene con ?code=...),
// le avisa a la ventana principal y se cierra sola. No hace falta crear
// una página aparte: el mismo index.html sirve como redirect_uri.
// ============================================================
(function manejarRegresoDeDiscord() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (code && window.opener) {
    window.opener.postMessage({ source: "lcorps-discord-oauth", code }, window.location.origin);
    window.close();
  }
})();

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

// Abre estos paneles desde los links de tu barra ("Registro." / "Perfil.")
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

// Navegación entre paneles
$("btn-ir-olvide-1").onclick = () => mostrarPanel("olvide");
$("btn-ir-olvide-2").onclick = () => mostrarPanel("olvide");
$("btn-ir-login-1").onclick = () => mostrarPanel("login");
$("btn-ir-login-2").onclick = () => mostrarPanel("login");
$("btn-ir-registrar-1").onclick = () => mostrarPanel("registrar");
$("btn-ir-registrar-2").onclick = () => mostrarPanel("registrar");

// ============================================================
// PANEL REGISTRAR
// ============================================================
let discordVinculado = null; // { discordId, discordUsername }

$("reg-username").addEventListener("blur", async () => {
  const username = $("reg-username").value.trim();
  if (!username) return;
  setMsg("reg-username-msg", "Comprobando...", "");
  try {
    const { data } = await callCheckUsername({ username });
    setMsg("reg-username-msg", data.available ? "" : "Usuario en uso", "err");
  } catch (e) {
    setMsg("reg-username-msg", "No se pudo comprobar.", "err");
  }
});

$("btn-vincular-discord").onclick = () => {
  const url =
    `https://discord.com/api/oauth2/authorize` +
    `?client_id=${DISCORD_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}` +
    `&response_type=code&scope=identify`;
  const popup = window.open(url, "discord-oauth", "width=480,height=720");

  // Escucha el mensaje que la propia página de redirect le manda a este popup opener
  window.addEventListener("message", async function handler(ev) {
    if (ev.data?.source !== "lcorps-discord-oauth") return;
    window.removeEventListener("message", handler);
    popup?.close();
    setMsg("reg-discord-msg", "Verificando...", "");
    try {
      const { data } = await callDiscordExchange({ code: ev.data.code });
      if (data.alreadyLinked) {
        setMsg("reg-discord-msg", "Cuenta ya vinculada", "err");
        discordVinculado = null;
        $("reg-discord").value = "";
      } else {
        discordVinculado = data;
        $("reg-discord").value = data.discordUsername;
        setMsg("reg-discord-msg", "Vinculado ✓", "ok");
      }
    } catch (e) {
      setMsg("reg-discord-msg", "No se pudo vincular.", "err");
    }
  });
};

$("btn-crear").onclick = async () => {
  const username = $("reg-username").value.trim();
  const password = $("reg-password").value;

  if (!username) return setMsg("reg-username-msg", "Escribe un usuario.", "err");
  if (!discordVinculado) return setMsg("reg-discord-msg", "Vincula tu Discord.", "err");
  if (password.length < 6 || password.length > 8)
    return setMsg("reg-password-msg", "La clave debe tener 6 a 8 caracteres.", "err");

  $("btn-crear").disabled = true;
  try {
    // Si ya tienes la ficha llena en pantalla y quieres mandarla junto al registro,
    // genera aquí el PNG con html2canvas y conviértelo a base64 (sin el prefijo data:...).
    // const canvas = await html2canvas(document.getElementById('card'));
    // const imageBase64 = canvas.toDataURL('image/png').split(',')[1];

    await callRegister({
      username,
      password,
      discordId: discordVinculado.discordId,
      discordUsername: discordVinculado.discordUsername,
      // imageBase64,
    });
    cerrarPaneles();
    alert("¡Cuenta creada! Ya podés iniciar sesión.");
  } catch (e) {
    if (e.message.includes("Usuario en uso")) setMsg("reg-username-msg", "Usuario en uso", "err");
    else if (e.message.includes("Cuenta ya vinculada")) setMsg("reg-discord-msg", "Cuenta ya vinculada", "err");
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
    const { data } = await callLogin({ username, password });
    await signInWithCustomToken(auth, data.customToken);
    cerrarPaneles();
  } catch (e) {
    if (e.message.includes("Usuario no encontrado"))
      setMsg("login-username-msg", "Usuario no encontrado", "err");
    else setMsg("login-password-msg", "Clave incorrecta", "err");
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
  try {
    await callRequestReset({ discordUsername });
    setMsg("olvide-discord-msg", "Código enviado por Discord.", "ok");
    $("olvide-codigo-wrap").classList.remove("auth-hidden");
    $("olvide-clave-wrap").classList.remove("auth-hidden");
  } catch (e) {
    setMsg("olvide-discord-msg", "Usuario no encontrado", "err");
  }
};

$("olvide-nueva-clave").addEventListener("keyup", async (ev) => {
  if (ev.key !== "Enter") return;
  const codigo = $("olvide-codigo").value.trim();
  const nuevaClave = $("olvide-nueva-clave").value;
  try {
    await callResetPassword({ codigo, nuevaClave });
    setMsg("olvide-codigo-msg", "¡Clave actualizada! Ya podés iniciar sesión.", "ok");
    setTimeout(() => mostrarPanel("login"), 1200);
  } catch (e) {
    setMsg("olvide-codigo-msg", "Clave incorrecta", "err");
  }
});

// ============================================================
// PANEL CONFIRMAR (para cuando el usuario guarda ediciones de su ficha)
// Llama a window.pedirConfirmacionYGuardar(datosFicha) desde tu código del perfil.
// ============================================================
window.pedirConfirmacionYGuardar = function (ficha) {
  mostrarPanel("confirmar");
  $("btn-cancelar-confirm").onclick = () => cerrarPaneles();
  $("btn-aceptar-confirm").onclick = async () => {
    try {
      await callUpdateProfile({ ficha });
      cerrarPaneles();
      alert("Perfil actualizado.");
    } catch (e) {
      cerrarPaneles();
      alert(e.message); // p.ej. "5d restantes para editar"
    }
  };
};

// ============================================================
// Cerrar clickeando afuera del panel
// ============================================================
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) cerrarPaneles();
});

// ============================================================
// Estado de sesión (para mostrar "Perfil" en vez de "Registro" en la barra)
// ============================================================
onAuthStateChanged(auth, (user) => {
  document.querySelectorAll("[data-if-logged-in]").forEach((el) => {
    el.style.display = user ? "" : "none";
  });
  document.querySelectorAll("[data-if-logged-out]").forEach((el) => {
    el.style.display = user ? "none" : "";
  });
});

document.querySelectorAll("[data-logout]").forEach((el) =>
  el.addEventListener("click", (e) => {
    e.preventDefault();
    signOut(auth);
  })
);
