# Sistema de cuentas Lcorps (Registro / Login / Recuperar clave / Vincular Discord)

## Cómo funciona (arquitectura)

Un webhook de Discord **solo puede enviar** mensajes a un canal — no puede
consultar "¿existe este usuario?" ni guardar contraseñas. Por eso el sistema
usa **Firebase** (gratis) como backend real:

| Pieza | Para qué sirve |
|---|---|
| **Firebase Authentication** | Guarda usuario + clave de forma segura (cifrada). Se usa el "usuario" como si fuera un correo falso: `usuario@lcorps.local`, así el usuario nunca escribe un email real. |
| **Firestore** (base de datos) | Guarda: mapeo usuario→cuenta (para saber si "Usuario en uso"), Discord vinculado, fecha de creación/edición (para el cooldown de 7 días), y los códigos de recuperación de clave. |
| **Cloud Functions** | Único lugar donde viven tus secretos (Client Secret de Discord, URLs de los 2 webhooks). El navegador nunca los ve. Aquí se hace: comprobar disponibilidad de usuario, vincular Discord (OAuth2), enviar el aviso de recuperación de clave, cambiar la clave, y reenviar la ficha al webhook. |
| **Discord Developer App (OAuth2)** | Permite el botón "Vincular con Discord": el usuario inicia sesión con su Discord real, y así confirmas que ese `discordId` es suyo (no solo un texto que escribió). |
| **2 Webhooks de Discord** | 1) canal de "nuevos registros" (recibe la imagen de la ficha). 2) canal de "verificaciones/recuperación" (el bot menciona `<@discordId>` con el código de recuperación, para que le llegue una notificación). |

## Flujo de Registro (Imagen 3)
1. Usuario escribe **Usuario** → al salir del campo, se llama a
   `checkUsername` → si existe, muestra "Usuario en uso".
2. Presiona **Vincular con Discord** → se abre el OAuth2 de Discord (popup) →
   Discord redirige con un `code` → el frontend llama a `discordOAuthExchange`
   → si ese Discord ya tiene cuenta, responde "Cuenta ya vinculada"; si no,
   guarda `discordId` + `discordUsername` temporalmente en el formulario.
3. Escribe **Clave** (letras y números, se recomienda 6–8 caracteres).
4. **Crear** → llama a `registerAccount`:
   - crea el usuario en Firebase Auth (`usuario@lcorps.local` + clave)
   - crea el documento en Firestore con el Discord vinculado
   - recibe la imagen (PNG en base64) generada con html2canvas y la reenvía
     al **webhook de registros**.

## Flujo de Login (Imágenes 6 y 7)
`Entrar` → Firebase Auth `signInWithEmailAndPassword("usuario@lcorps.local", clave)`.
- Si el usuario no existe → "Usuario no encontrado".
- Si la clave está mal → "Clave incorrecta".

## Flujo de recuperación (Imagen 8)
1. Escribe **Usuario de Discord** → `Enviar` → Cloud Function
   `requestPasswordReset`:
   - busca en Firestore si ese Discord está vinculado a alguna cuenta.
   - si no → "Usuario no encontrado".
   - si sí → genera un código de 6 dígitos, lo guarda con expiración (15 min),
     y lo publica en el **webhook de verificaciones** mencionando
     `<@discordId>` (esto le llega como notificación en ese canal).
2. El panel muestra entonces el campo **Código** + **Nueva clave** →
   `Confirmar` → Cloud Function `resetPassword` valida el código y cambia
   la clave directamente con el Admin SDK.

## Cooldown de 7 días para editar (Imagen 9)
Cada cuenta guarda `lastEdited`. Antes de guardar una edición del perfil se
muestra el diálogo de confirmación (Cancelar / Aceptar) porque no podrá
volver a editar hasta que pasen 7 días. Esto se valida también en el
servidor (Cloud Function `updateProfile`) para que no se pueda saltar
editando el HTML del navegador.

---

## Pasos para configurar (tú, una sola vez)

### 1. Crear proyecto Firebase
1. Ve a https://console.firebase.google.com → **Crear proyecto** → nómbralo
   "lcorps" (o el que quieras).
2. Dentro del proyecto: **Build → Authentication → Get started → Sign-in
   method → Email/Password → Habilitar**.
3. **Build → Firestore Database → Crear base de datos** (modo producción,
   región la que te quede más cerca).
4. **Build → Functions** → necesitas el plan **Blaze** (pago por uso, pero
   tiene una capa gratis enorme; sin tarjeta no deja usar Functions).
5. En ⚙️ **Configuración del proyecto → General → Tus apps → Web (</>)**,
   registra una app web y copia el `firebaseConfig` (apiKey, authDomain,
   projectId, etc.) — lo vas a pegar en `public/auth.js`.

### 2. Crear la app de Discord (para el botón "Vincular con Discord")
1. Ve a https://discord.com/developers/applications → **New Application**.
2. Pestaña **OAuth2 → General**: copia **Client ID** y **Client Secret**.
3. En **Redirects**, agrega la URL de tu página, por ejemplo:
   `https://tusitio.com/index.html` (o donde vaya a vivir el formulario).
4. Guarda Client ID y Client Secret — el **Secret va solo en Cloud
   Functions**, nunca en el HTML.

### 3. Crear los 2 webhooks de Discord
- Canal de registros → *Editar canal → Integraciones → Webhooks → Nuevo
  webhook* → copiar URL.
- Canal de verificaciones/recuperación → mismo proceso, otra URL.
- (Opcional pero recomendado) En ese canal de verificaciones, habilita que
  el bot/webhook pueda mencionar usuarios (los webhooks pueden mencionar
  con `<@id>` sin necesitar un bot con permisos extra).

### 4. Configurar los secretos en Firebase Functions
Desde tu computadora, con [Node.js](https://nodejs.org) y
`npm install -g firebase-tools` instalados:

```bash
firebase login
firebase use --add            # elige tu proyecto "lcorps"
firebase functions:secrets:set DISCORD_CLIENT_ID
firebase functions:secrets:set DISCORD_CLIENT_SECRET
firebase functions:secrets:set DISCORD_REDIRECT_URI
firebase functions:secrets:set WEBHOOK_REGISTROS
firebase functions:secrets:set WEBHOOK_VERIFICACIONES
```
(cada comando te va a pedir que pegues el valor)

### 5. Instalar y subir las funciones
```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules
```

### 6. Completar el frontend
- Abre `public/auth.js` y pega tu `firebaseConfig` arriba del todo.
- Pega también tu `DISCORD_CLIENT_ID` (este sí puede ir en el frontend,
  el Secret no) y la URL exacta de redirect que registraste en Discord.
- Copia `public/auth-modals.html` dentro de tu `index.html` (antes de
  `</body>`) y `public/auth.css` en un `<link>` o dentro de tu `<style>`.
- Asegúrate de tener en `assets/`: `panel_dialogo.png`, `write_long_bar.png`,
  `write_medium_bar.png`, `boton_cancelar.png`, `boton_aceptar.png`,
  `hub_bar.png` (¡ya los tienes!).

Con eso el sistema queda funcionando igual a como lo mostraste en las
capturas. Cualquier cosa que quieras ajustar (textos, tiempos de expiración,
límite de caracteres de la clave, etc.) está señalado con comentarios en
cada archivo.
