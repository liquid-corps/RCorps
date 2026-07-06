# Sistema de cuentas Lcorps (Registro / Login / Recuperar clave / Vincular Discord)

Usa **Supabase** como backend (no Firebase): plan gratis sin pedir tarjeta,
con Auth + base de datos + funciones con secretos, todo incluido.

## Cómo funciona (arquitectura)

Un webhook de Discord **solo puede enviar** mensajes a un canal — no puede
consultar "¿existe este usuario?" ni guardar contraseñas. Por eso hace falta
un backend real:

| Pieza | Para qué sirve |
|---|---|
| **Supabase Auth** | Guarda usuario + clave de forma segura (cifrada). El "usuario" se guarda como si fuera un correo falso: `usuario@lcorps.local`. También trae **Discord como proveedor de login** integrado, así el botón "Vincular con Discord" no requiere que programes el OAuth2 a mano. |
| **Postgres (incluido en Supabase)** | Tabla `profiles` (usuario, discord vinculado, fecha de última edición) y `reset_requests` (códigos de recuperación). |
| **Edge Functions** (Deno) | Único lugar donde viven tus secretos (las 2 URLs de webhook). Aquí se: manda el aviso de recuperación de clave por Discord, se valida el código y cambia la clave, y se reenvía la ficha al webhook de registros. |
| **Discord Developer App (OAuth2)** | Se configura directo dentro de Supabase (Authentication → Providers → Discord), pegando el Client ID/Secret de tu app de Discord. |
| **2 Webhooks de Discord** | 1) canal de "nuevos registros" (recibe la imagen de la ficha). 2) canal de "verificaciones/recuperación" (menciona `<@discordId>` con el código, para que le llegue como notificación). |

## Flujo de Registro (Imagen 3)
1. Usuario escribe **Usuario** → al salir del campo, `username_available` (función SQL) dice si está libre.
2. **Vincular con Discord** → se abre un popup a tu mismo sitio, que dispara
   `supabase.auth.linkIdentity({ provider: 'discord' })`. Si ese Discord ya
   tiene cuenta en otro lado, Supabase devuelve error → "Cuenta ya vinculada".
3. Escribe **Clave** (6 a 8 caracteres, letras y números).
4. **Crear** → se le pone usuario+clave a la cuenta ya autenticada por
   Discord, se guarda el perfil en `profiles`, y (opcional) se reenvía la
   imagen de la ficha al webhook de registros vía la Edge Function
   `send-registration-card`.

## Flujo de Login (Imágenes 6 y 7)
`Entrar` → primero se comprueba si el usuario existe (para poder decir
"Usuario no encontrado" como en tus capturas); si existe, se intenta
`signInWithPassword`; si falla, "Clave incorrecta".

## Flujo de recuperación (Imagen 8)
1. **Usuario de Discord** → `Enviar` → Edge Function `request-password-reset`:
   busca ese Discord en `profiles`; si no está, "Usuario no encontrado"; si
   está, genera un código de 6 dígitos (vence en 15 min) y lo publica en el
   **webhook de verificaciones** mencionando `<@discordId>`.
2. Aparecen los campos **Código** + **Nueva clave** → Edge Function
   `reset-password` valida el código y cambia la clave con la Admin API.

## Cooldown de 7 días para editar (Imagen 9)
La función SQL `update_ficha` revisa `last_edited` en el propio Postgres
(no se puede saltar editando el HTML del navegador) y avisa cuántos días
faltan si todavía no se cumplen los 7 días.

---

## Pasos para configurar (tú, una sola vez, sin tarjeta)

### 1. Crear proyecto en Supabase
1. Ve a https://supabase.com → **Start your project** → creá una cuenta
   (con GitHub o correo, sin tarjeta) → **New project**, nombralo "lcorps".
2. Cuando esté listo: **Project Settings → API** → copiá `Project URL` y
   `anon public key` — los vas a pegar en `public/auth.js`.
3. **Project Settings → API → service_role key**: copiala también (¡es
   secreta! se usa solo en las Edge Functions, nunca en el navegador).

### 2. Crear las tablas
- Abrí **SQL Editor → New query**, pegá todo el contenido de
  `supabase/migrations/0001_init.sql` y dale **Run**.

### 3. Habilitar el login con Discord
1. En Discord: https://discord.com/developers/applications → **New
   Application** → pestaña **OAuth2 → General** → copiá **Client ID** y
   **Client Secret**.
2. En **OAuth2 → Redirects**, agregá la URL que te muestra Supabase en el
   siguiente paso (Supabase te da un redirect URI único, algo como
   `https://xxxx.supabase.co/auth/v1/callback`).
3. En Supabase: **Authentication → Providers → Discord** → activalo y pegá
   el Client ID y Client Secret de tu app de Discord → Guardar.

### 4. Crear los 2 webhooks de Discord
- Canal de registros → *Editar canal → Integraciones → Webhooks → Nuevo
  webhook* → copiar URL.
- Canal de verificaciones/recuperación → mismo proceso, otra URL.

### 5. Instalar la CLI de Supabase y subir las funciones
Con [Node.js](https://nodejs.org) instalado:

```bash
npm install -g supabase
supabase login
supabase link --project-ref TU_PROJECT_REF   # está en Project Settings → General
supabase secrets set WEBHOOK_REGISTROS=https://discord.com/api/webhooks/....
supabase secrets set WEBHOOK_VERIFICACIONES=https://discord.com/api/webhooks/....
supabase functions deploy request-password-reset
supabase functions deploy reset-password
supabase functions deploy send-registration-card
```
(`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya están
disponibles automáticamente dentro de las Edge Functions, no hace falta
configurarlas a mano.)

### 6. Completar el frontend
- Abrí `public/auth.js` y pegá tu `SUPABASE_URL` y `SUPABASE_ANON_KEY`
  arriba del todo (la anon key es pública, no pasa nada si se ve).
- Copiá `public/auth-modals.html` dentro de tu `index.html` (antes de
  `</body>`) y `public/auth.css` (agregalo con un `<link rel="stylesheet">`
  o pegalo dentro de tu `<style>`).
- Asegurate de tener en `assets/`: `panel_dialogo.png`, `write_long_bar.png`,
  `write_medium_bar.png`, `boton_cancelar.png`, `boton_aceptar.png`,
  `hub_bar.png` (¡ya los tenés!).

### Nota sobre el plan gratis
El proyecto de Supabase se "pausa" si pasa una semana sin uso (se reactiva
solo con un clic desde el dashboard, no perdés datos). Para un proyecto de
comunidad/rol esto normalmente no es problema.

---

Con esto el sistema queda funcionando igual a como lo mostraste en las
capturas, pero sin necesitar ninguna tarjeta de crédito. Decime si querés
que ajuste textos, tiempos de expiración, o que conectemos esto con tu
`index-1.html` original de la ficha.
