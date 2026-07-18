# 🔧 Instrucciones finales — RCorps + Discord

Lo que yo ya hice está listo. Para que el login con Discord funcione,
**tienes que hacer 2 configuraciones** (5 minutos cada una). Sin esto,
el botón "Iniciar sesión" dará error.

---

## ✅ Lo que ya está hecho (no tocar)

- [x] `perfil.html` creado (login Discord + perfil editable)
- [x] `libreria.html` adaptado (lee sesión de Discord, sin contraseñas)
- [x] `index.html` corregido (clanes Equinox/Asakura ya no son "Rain")
- [x] Botones "Perfil." ya apuntan a `perfil.html`
- [x] Assets nuevos copiados a `assets/`
- [x] BD limpia (6 personajes vacíos borrados)
- [x] `migracion.sql` escrito (falta ejecutarlo — ver paso 1)

---

## ⚠️ PASO 1 — Ejecutar la migración SQL (OBLIGATORIO)

Sin esto **no funciona nada del login nuevo**. Tienes que pegar y ejecutar
el SQL una sola vez:

1. Entra a https://supabase.com/dashboard
2. Abre tu proyecto **`gqzspbfeodmhnpxegpjf`**
3. En el menú izquierdo: **SQL Editor** → **New query**
4. Abre el archivo `migracion.sql` que está en esta carpeta
5. **Copia todo su contenido** y pégalo en el editor
6. Clic en **Run** (botón verde abajo a la derecha)
7. Si todo sale bien verás: `Success. No rows returned`

**¿Qué hace este script?**
- Crea la tabla `profiles` (vinculada a las cuentas de Discord)
- Añade `owner_id` a `characters` para saber de quién es cada personaje
- Crea un trigger que genera perfil + personaje automáticamente al
  entrar con Discord
- Activa **Row Level Security** (protege los datos)
- Define policies (quién puede leer/escribir qué)
- Crea la función `is_admin()` para detectar admins

---

## ⚠️ PASO 2 — Configurar Discord OAuth en Supabase (OBLIGATORIO)

1. Entra a https://supabase.com/dashboard → tu proyecto
2. Menú izquierdo: **Authentication** → **Providers**
3. Busca **Discord** y haz clic en él
4. Activa el toggle **"Enable Discord Provider"**
5. Rellena con las credenciales que me pasaste:

   ```
   Client ID:     1340567254466560031
   Client Secret: c32VXLUoyCOmAqnuA5FtdX74qVicc6CU
   ```

6. Debajo verás un campo **"Callback URL"** que Supabase te genera.
   Cópialo. Será algo como:
   ```
   https://gqzspbfeodmhnpxegpjf.supabase.co/auth/v1/callback
   ```
7. Clic en **Save**

---

## ⚠️ PASO 3 — Configurar el Redirect en Discord (OBLIGATORIO)

1. Entra a https://discord.com/developers/applications
2. Abre tu aplicación (la del Client ID `1340567254466560031`)
3. Menú izquierdo: **OAuth2**
4. En la sección **Redirects**, haz clic en **Add Redirect**
5. Pega la **Callback URL** que copiaste en el paso 2 (la de Supabase):
   ```
   https://gqzspbfeodmhnpxegpjf.supabase.co/auth/v1/callback
   ```
6. Clic en **Save Changes**

> ⚠️ La URL debe ser **exactamente igual**, con `https://` y sin `/` al final
> (o con `/` al final, según la dé Supabase — copia y pega tal cual).

---

## 🚀 PASO 4 — Subir el sitio a GitHub Pages

Como me dijiste que se aloja en GitHub Pages:

1. Sube todos los archivos de esta carpeta a tu repositorio:
   - `index.html`, `libreria.html`, `perfil.html`
   - `migracion.sql` (opcional, puedes dejarlo como respaldo)
   - carpetas `assets/`, `Clan/`, `Skills/`, `Tags/`
   - `PixelArial11.ttf`
2. En GitHub: **Settings → Pages**
3. Source: **Deploy from a branch** → `main` → `/root` → Save
4. Espera 1-2 minutos y entra a tu URL, algo como:
   ```
   https://TU_USUARIO.github.io/RCorps/perfil.html
   ```

---

## 🧪 Cómo probar que todo funciona

1. Entra a `https://TU_USUARIO.github.io/RCorps/perfil.html`
2. Verás la pantalla de login → clic en **"Iniciar Sesión"**
3. Te redirige a Discord → autoriza → vuelve al perfil
4. Debes ver tu nombre de Discord y un personaje vacío listo para editar

**Para que un usuario sea admin:**
Entra por primera vez con una cuenta de Discord cuyo username sea
`Water` o `Riper` (ya configurado en el trigger). Esa cuenta
automáticamente será admin. Para añadir más admins, edita la línea
del `migracion.sql`:

```sql
IF v_username IN ('Water', 'Riper') THEN  -- ← añade aquí
```

…y vuelve a ejecutar esa parte, o cambia el rol manualmente en la
tabla `profiles` desde el Table Editor de Supabase.

---

## 🔴 PASO 5 — SEGURIDAD: Rotar la service_role key

Como me compartiste la `service_role` en el chat, **por seguridad
debes rotarla cuando terminemos**:

1. Supabase Dashboard → **Project Settings** (engranaje)
2. **API**
3. Clic en **Reset service_role key**
4. Actualiza la referencia donde la uses (si la usabas en algún backend propio)

> Esto **no afecta** al sitio web (que usa la `anon key`, pública).
> Solo invalida la clave maestra que quedó expuesta.

---

## ❓ Problemas comunes

**"Invalid login_redirect_url"**
→ Falta el PASO 3 (Redirect en Discord) o la URL no coincide.

**El usuario entra pero no se le crea personaje**
→ Falta el PASO 1 (migración SQL), específicamente el trigger.

**No puedo editar personajes en la librería (modo admin)**
→ Tu cuenta no tiene `role='admin'` en la tabla `profiles`.
Verifícalo en Supabase → Table Editor → `profiles`.

**El botón "Borrar Cuenta" no hace la solicitud a Discord**
→ Falta configurar `DELETE_REQUEST_WEBHOOK` en `perfil.html` (línea ~415).
Pega ahí un webhook del canal donde quieres recibir las solicitudes.
