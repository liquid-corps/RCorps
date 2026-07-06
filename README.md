# Cómo organizar todos los archivos de Lcorps

```
lcorps-site/                        ← esta carpeta es la que subís a tu hosting
├── index.html                      ← tu ficha + la barra superior + los 4 paneles, todo ya integrado
├── auth.css                        ← estilos de los paneles (Registrar/Login/Recuperar)
├── auth.js                         ← lógica que habla con Supabase
│
├── assets/                         ← imágenes de UI (ver LEEME.txt adentro)
│   ├── base_cuadrada.png
│   ├── cuadrado_menu.png
│   ├── cuadrado_seleccion_skills.png
│   ├── cuadrado_foto_importacion.png
│   ├── menu_seleccion.png
│   ├── rectangulo_de_escribir_largo.png
│   ├── rectangulo_de_escribir_pequeno.png
│   ├── scroll.png
│   ├── PixelArial11.ttf
│   ├── hub_bar.png                 ← nuevo (barra superior)
│   ├── panel_dialogo.png           ← nuevo (panel base)
│   ├── write_long_bar.png          ← nuevo (usuario / usuario de discord)
│   ├── write_medium_bar.png        ← nuevo (clave / código)
│   ├── boton_cancelar.png          ← nuevo
│   └── boton_aceptar.png           ← nuevo
│
├── Clan/                           ← una imagen completa por clan (mizu.png, rain.png...)
├── Skills/                         ← un ícono cuadrado por skill (aroma.png, biwa.png...)
│
└── supabase/                       ← ⚠️ esta carpeta NO se sube al hosting.
    │                                  Se usa solo desde tu computadora con la
    │                                  CLI de Supabase para crear la base de
    │                                  datos y subir las funciones (ver README
    │                                  de configuración que te pasé antes).
    ├── migrations/
    │   └── 0001_init.sql            ← se pega una vez en el SQL Editor de Supabase
    └── functions/
        ├── _shared/cors.ts
        ├── request-password-reset/index.ts
        ├── reset-password/index.ts
        └── send-registration-card/index.ts
```

## Qué es cada cosa

- **`index.html`** — Ya tiene todo junto: arriba la barra de navegación
  (`Inicio | Librería | Wiki | Foro` + `Registro`/`Perfil` a la derecha),
  después tu ficha "Civil" tal cual la tenías, y al final los 4 paneles
  (Registrar, Iniciar sesión, Olvidaste la clave, Confirmar) ocultos hasta
  que se necesitan. También carga `auth.css` y `auth.js`.
- **`auth.css` / `auth.js`** — van en la raíz del sitio, junto a `index.html`
  (no dentro de `assets/`).
- **`assets/`, `Clan/`, `Skills/`** — igual que ya tenías armado tu proyecto;
  solo se sumaron las 6 imágenes nuevas del sistema de cuentas dentro de
  `assets/`.
- **`supabase/`** — es para la base de datos y las funciones con secretos.
  Vive en tu computadora (o en un repo aparte), **no en el hosting del
  sitio**, porque `migrations/` y `functions/` se despliegan con la CLI de
  Supabase, no como archivos web normales.

## Antes de subir el sitio

1. Abrí `auth.js` y pegá tu `SUPABASE_URL` y `SUPABASE_ANON_KEY` (líneas
   marcadas con `PON_AQUI`).
2. Seguí los pasos de configuración de Supabase (proyecto, tablas, Discord
   como proveedor, los 2 webhooks, y `supabase functions deploy`) que están
   en el README que te pasé en el mensaje anterior.
3. Poné las imágenes que faltan en `assets/`, `Clan/` y `Skills/` (cada
   carpeta tiene un `LEEME.txt` con la lista exacta).
4. Subís toda la carpeta `lcorps-site/` (menos `supabase/`) a tu hosting
   (GitHub Pages, Netlify, etc. — cualquiera que sirva archivos estáticos).
