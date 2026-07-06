/**
 * Cloud Functions del sistema de cuentas Lcorps.
 * Aquí viven los secretos (Discord Client Secret y las 2 URLs de webhook).
 * El navegador nunca los ve: solo llama a estas funciones por su nombre.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

// ---- Secretos (se configuran una vez con `firebase functions:secrets:set NOMBRE`) ----
const DISCORD_CLIENT_ID = defineSecret("DISCORD_CLIENT_ID");
const DISCORD_CLIENT_SECRET = defineSecret("DISCORD_CLIENT_SECRET");
const DISCORD_REDIRECT_URI = defineSecret("DISCORD_REDIRECT_URI");
const WEBHOOK_REGISTROS = defineSecret("WEBHOOK_REGISTROS");
const WEBHOOK_VERIFICACIONES = defineSecret("WEBHOOK_VERIFICACIONES");
// La API key web de Firebase no es secreta (aparece en tu firebaseConfig),
// pero igual la pasamos como secreto para no repetirla dos veces.
const FIREBASE_WEB_API_KEY = defineSecret("FIREBASE_WEB_API_KEY");

const DOMINIO_FALSO = "lcorps.local";
const EDIT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const RESET_EXPIRA_MS = 15 * 60 * 1000; // 15 minutos

function usernameId(username) {
  return username.trim().toLowerCase();
}

// ==================================================================
// 1) ¿Está disponible el nombre de usuario?
// ==================================================================
exports.checkUsername = onCall(async (req) => {
  const username = (req.data?.username || "").trim();
  if (!username) throw new HttpsError("invalid-argument", "Falta el usuario.");
  const doc = await db.collection("usernames").doc(usernameId(username)).get();
  return { available: !doc.exists };
});

// ==================================================================
// 2) Vincular con Discord (OAuth2 - intercambia el "code" por datos del usuario)
// ==================================================================
exports.discordOAuthExchange = onCall(
  { secrets: [DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI] },
  async (req) => {
    const code = req.data?.code;
    if (!code) throw new HttpsError("invalid-argument", "Falta el code de Discord.");

    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID.value(),
      client_secret: DISCORD_CLIENT_SECRET.value(),
      grant_type: "authorization_code",
      code,
      redirect_uri: DISCORD_REDIRECT_URI.value(),
    });

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!tokenRes.ok) {
      throw new HttpsError("internal", "No se pudo validar con Discord.");
    }
    const tokenJson = await tokenRes.json();

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!userRes.ok) {
      throw new HttpsError("internal", "No se pudo leer el perfil de Discord.");
    }
    const discordUser = await userRes.json();
    const discordUsername = discordUser.global_name || discordUser.username;

    // ¿Ese Discord ya está vinculado a otra cuenta?
    const existing = await db
      .collection("users")
      .where("discordId", "==", discordUser.id)
      .limit(1)
      .get();

    if (!existing.empty) {
      return { linked: false, alreadyLinked: true };
    }

    return {
      linked: true,
      alreadyLinked: false,
      discordId: discordUser.id,
      discordUsername,
    };
  }
);

// ==================================================================
// 3) Crear cuenta (Auth + Firestore) y reenviar la ficha al webhook
// ==================================================================
exports.registerAccount = onCall(
  { secrets: [WEBHOOK_REGISTROS] },
  async (req) => {
    const { username, password, discordId, discordUsername, imageBase64 } =
      req.data || {};

    if (!username || !password || !discordId || !discordUsername) {
      throw new HttpsError("invalid-argument", "Faltan datos del formulario.");
    }
    if (password.length < 6 || password.length > 8) {
      throw new HttpsError(
        "invalid-argument",
        "La clave debe tener entre 6 y 8 caracteres."
      );
    }

    const uid = usernameId(username);
    const usernameRef = db.collection("usernames").doc(uid);

    // Doble chequeo dentro de una transacción (evita carreras entre 2 registros simultáneos)
    await db.runTransaction(async (tx) => {
      const usernameDoc = await tx.get(usernameRef);
      if (usernameDoc.exists) {
        throw new HttpsError("already-exists", "Usuario en uso");
      }
      const discordDoc = await db
        .collection("users")
        .where("discordId", "==", discordId)
        .limit(1)
        .get();
      if (!discordDoc.empty) {
        throw new HttpsError("already-exists", "Cuenta ya vinculada");
      }

      const authUser = await admin.auth().createUser({
        email: `${uid}@${DOMINIO_FALSO}`,
        password,
        displayName: username,
      });

      tx.set(usernameRef, { uid: authUser.uid });
      tx.set(db.collection("users").doc(authUser.uid), {
        username,
        discordId,
        discordUsername,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastEdited: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Reenviar la imagen de la ficha al canal de registros (el webhook queda oculto aquí)
    if (imageBase64) {
      const buffer = Buffer.from(imageBase64, "base64");
      const form = new (require("form-data"))();
      form.append(
        "payload_json",
        JSON.stringify({ content: `**Nuevo registro:** ${username}` })
      );
      form.append("files[0]", buffer, { filename: `ficha_${uid}.png` });
      await fetch(WEBHOOK_REGISTROS.value(), { method: "POST", body: form });
    }

    return { ok: true };
  }
);

// ==================================================================
// 4) Login (devuelve mensajes distintos: "Usuario no encontrado" / "Clave incorrecta")
// ==================================================================
exports.login = onCall({ secrets: [FIREBASE_WEB_API_KEY] }, async (req) => {
  const { username, password } = req.data || {};
  if (!username || !password) {
    throw new HttpsError("invalid-argument", "Faltan datos.");
  }
  const uid = usernameId(username);
  const usernameDoc = await db.collection("usernames").doc(uid).get();
  if (!usernameDoc.exists) {
    throw new HttpsError("not-found", "Usuario no encontrado");
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY.value()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${uid}@${DOMINIO_FALSO}`,
        password,
        returnSecureToken: true,
      }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new HttpsError("unauthenticated", "Clave incorrecta");
  }

  const customToken = await admin.auth().createCustomToken(json.localId);
  return { customToken };
});

// ==================================================================
// 5) Olvidaste la clave: paso 1 - pedir código (se envía al canal de verificaciones)
// ==================================================================
exports.requestPasswordReset = onCall(
  { secrets: [WEBHOOK_VERIFICACIONES] },
  async (req) => {
    const discordUsername = (req.data?.discordUsername || "").trim();
    if (!discordUsername) {
      throw new HttpsError("invalid-argument", "Falta el usuario de Discord.");
    }

    const snap = await db
      .collection("users")
      .where("discordUsername", "==", discordUsername)
      .limit(1)
      .get();

    if (snap.empty) {
      throw new HttpsError("not-found", "Usuario no encontrado");
    }
    const userDoc = snap.docs[0];
    const { discordId } = userDoc.data();

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    await db.collection("resetRequests").doc(codigo).set({
      uid: userDoc.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: Date.now() + RESET_EXPIRA_MS,
      used: false,
    });

    await fetch(WEBHOOK_VERIFICACIONES.value(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `<@${discordId}> tu código para recuperar la clave es **${codigo}** (vence en 15 minutos).`,
        allowed_mentions: { users: [discordId] },
      }),
    });

    return { ok: true };
  }
);

// ==================================================================
// 6) Olvidaste la clave: paso 2 - confirmar código y poner nueva clave
// ==================================================================
exports.resetPassword = onCall(async (req) => {
  const { codigo, nuevaClave } = req.data || {};
  if (!codigo || !nuevaClave) {
    throw new HttpsError("invalid-argument", "Faltan datos.");
  }
  if (nuevaClave.length < 6 || nuevaClave.length > 8) {
    throw new HttpsError("invalid-argument", "La clave debe tener entre 6 y 8 caracteres.");
  }

  const ref = db.collection("resetRequests").doc(codigo);
  const doc = await ref.get();
  if (!doc.exists || doc.data().used || Date.now() > doc.data().expiresAt) {
    throw new HttpsError("not-found", "Clave incorrecta");
  }

  await admin.auth().updateUser(doc.data().uid, { password: nuevaClave });
  await ref.update({ used: true });
  return { ok: true };
});

// ==================================================================
// 7) Editar perfil (respeta el cooldown de 7 días, validado en servidor)
// ==================================================================
exports.updateProfile = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Iniciá sesión.");
  const ref = db.collection("users").doc(req.auth.uid);
  const doc = await ref.get();
  if (!doc.exists) throw new HttpsError("not-found", "Cuenta no encontrada.");

  const lastEdited = doc.data().lastEdited?.toMillis?.() || 0;
  if (Date.now() - lastEdited < EDIT_COOLDOWN_MS) {
    const diasRestantes = Math.ceil(
      (EDIT_COOLDOWN_MS - (Date.now() - lastEdited)) / (24 * 60 * 60 * 1000)
    );
    throw new HttpsError("failed-precondition", `${diasRestantes}d restantes para editar`);
  }

  await ref.update({
    ficha: req.data?.ficha || {},
    lastEdited: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true };
});
