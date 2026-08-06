# -*- coding: utf-8 -*-
"""
bot.py — Bot de Discord oficial para RCorps RPG
Comandos Slash implementados:
  - /perfil [nombre_o_usuario] : Muestra la tarjeta RPG y datos del personaje en Discord.
  - /perfiles                : Muestra la lista de personajes aprobados.
  - /link                     : Enlace directo a la web para editar o crear tu perfil.

Requisitos:
  pip install discord.py requests pillow
"""

import os
import io
import sys
import base64
import discord
from discord import app_commands
from discord.ext import commands
import requests
from PIL import Image

import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

# Importar generador de tarjetas de la carpeta tools
sys.path.append(os.path.join(os.path.dirname(__file__), "tools"))
try:
    from cardgen import build_card
except Exception as e:
    print("Aviso al importar cardgen:", e)

# ============================================================
# CONFIGURACIÓN DE SUPABASE Y DISCORD
# ============================================================
SUPABASE_URL = "https://gqzspbfeodmhnpxegpjf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxenNwYmZlb2RtaG5weGVncGpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5ODcyMjQsImV4cCI6MjA5OTU2MzIyNH0.kwbuMH_UpMrGnBlpf4uuc09nXH0b7Yp4mAVgsjrn_tk"

# Cargar variables de entorno si existe .env
if os.path.exists(".env"):
    with open(".env", "r", encoding="utf-8") as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                parts = line.strip().split("=", 1)
                os.environ[parts[0].strip()] = parts[1].strip()

BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")

WEB_URL_PERFILES = "https://liquid-corps.github.io/RCorps/perfiles.html"
WEB_URL_MI_PERFIL = "https://liquid-corps.github.io/RCorps/perfil.html"

# Configuración del Bot de Discord con Intents completos
intents = discord.Intents.default()
intents.members = True
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# Servidor de Health Check para Render ($PORT) para evitar reinicios
class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(b"RCorps Discord Bot is Live 24/7!")
    def log_message(self, format, *args):
        return

def run_health_server():
    try:
        port = int(os.getenv("PORT", 10000))
        server = HTTPServer(("0.0.0.0", port), HealthCheckHandler)
        print(f"🌐 Servidor de Health Check activo en puerto {port}")
        server.serve_forever()
    except Exception as e:
        print("Aviso en servidor Health Check:", e)

threading.Thread(target=run_health_server, daemon=True).start()

def generate_card_png(char):
    """Genera la imagen PNG completa de la tarjeta RPG (956x579) con los datos del personaje."""
    foto_img = None
    portrait_url = char.get("portrait_info")
    if portrait_url:
        if portrait_url.startswith("data:image"):
            try:
                header, base64_data = portrait_url.split(",", 1)
                img_bytes = base64.b64decode(base64_data)
                foto_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
            except Exception as e:
                print("Error decodificando foto base64:", e)
        elif portrait_url.startswith("http"):
            try:
                res = requests.get(portrait_url)
                if res.status_code == 200:
                    foto_img = Image.open(io.BytesIO(res.content)).convert("RGBA")
            except Exception as e:
                print("Error descargando foto:", e)

    # Clan icon (arriba de la foto)
    clan_img = None
    clan_name = char.get("clan")
    if clan_name:
        clan_path = os.path.join(os.path.dirname(__file__), "Clan", f"{clan_name.lower()}.png")
        if not os.path.exists(clan_path):
            clan_dir = os.path.join(os.path.dirname(__file__), "Clan")
            if os.path.exists(clan_dir):
                for f in os.listdir(clan_dir):
                    if f.lower().startswith(clan_name.lower()):
                        clan_path = os.path.join(clan_dir, f)
                        break
        if os.path.exists(clan_path):
            clan_img = clan_path

    # Tag badge (abajo de la foto)
    tag_img = None
    modes = char.get("modes") or []
    tag_val = char.get("tag") or (modes[0] if len(modes) > 0 else None)
    if tag_val:
        if tag_val.startswith("data:image"):
            try:
                header, base64_data = tag_val.split(",", 1)
                img_bytes = base64.b64decode(base64_data)
                tag_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
            except Exception as e:
                print("Error decodificando tag base64:", e)
        elif tag_val.startswith("http"):
            try:
                res = requests.get(tag_val)
                if res.status_code == 200:
                    tag_img = Image.open(io.BytesIO(res.content)).convert("RGBA")
            except Exception as e:
                print("Error descargando tag:", e)
        else:
            tag_name = os.path.basename(tag_val)
            tag_path = os.path.join(os.path.dirname(__file__), "Tags", tag_name)
            if not os.path.exists(tag_path):
                tag_path = os.path.join(os.path.dirname(__file__), tag_val)
            if os.path.exists(tag_path):
                tag_img = tag_path

    # Skills (slots 1 y 2)
    skill_imgs = []
    raw_skills = char.get("skills") or []
    if isinstance(raw_skills, str):
        raw_skills = [raw_skills]
    if not raw_skills:
        sk1 = char.get("skill_slot1")
        sk2 = char.get("skill_slot2")
        if sk1: raw_skills.append(sk1)
        if sk2: raw_skills.append(sk2)

    for sk in raw_skills[:2]:
        if not sk:
            continue
        if sk.startswith("data:image"):
            try:
                header, base64_data = sk.split(",", 1)
                img_bytes = base64.b64decode(base64_data)
                skill_imgs.append(Image.open(io.BytesIO(img_bytes)).convert("RGBA"))
            except Exception as e:
                print("Error decodificando skill base64:", e)
        elif sk.startswith("http"):
            try:
                res = requests.get(sk)
                if res.status_code == 200:
                    skill_imgs.append(Image.open(io.BytesIO(res.content)).convert("RGBA"))
            except Exception as e:
                print("Error descargando skill:", e)
        else:
            sk_name = os.path.basename(sk)
            sk_path = os.path.join(os.path.dirname(__file__), "Skills", sk_name)
            if not os.path.exists(sk_path):
                sk_path = os.path.join(os.path.dirname(__file__), sk)
            if os.path.exists(sk_path):
                skill_imgs.append(sk_path)

    card_pil = build_card(
        nombre=char.get("name", "Sin Nombre"),
        clase=char.get("zodiac", "—"),
        edad=str(char.get("age", "—")),
        rango=char.get("rank", "—"),
        zodiac=char.get("zodiac", "—"),
        frase=char.get("bio", "—"),
        foto=foto_img,
        clan=clan_img,
        tag=tag_img,
        skills=skill_imgs
    )
    
    buffer = io.BytesIO()
    card_pil.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer

# ============================================================
# FUNCIONES AUXILIARES DE SUPABASE
# ============================================================
def get_supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }

def fetch_character_by_name_or_discord(query_or_user):
    headers = get_supabase_headers()
    url = f"{SUPABASE_URL}/rest/v1/characters?select=*"
    
    clean_str = ""
    target_id = None
    target_username = None

    if isinstance(query_or_user, (discord.User, discord.Member)):
        target_id = str(query_or_user.id)
        target_username = query_or_user.name
        clean_str = query_or_user.name
    else:
        clean_str = str(query_or_user).replace("@", "").replace("<", "").replace(">", "").replace("!", "").strip()
        if clean_str.isdigit():
            target_id = clean_str

    # 1. Si tenemos Discord ID -> buscar profile -> luego character
    if target_id:
        p_res = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?discord_id=eq.{target_id}", headers=headers)
        if p_res.status_code == 200 and p_res.json():
            owner_id = p_res.json()[0]["id"]
            c_res = requests.get(f"{url}&owner_id=eq.{owner_id}", headers=headers)
            if c_res.status_code == 200 and c_res.json():
                return c_res.json()[0]

    # 2. Buscar por username de Discord en profiles -> luego character
    u_search = target_username or clean_str
    if u_search:
        p_res = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?username=ilike.*{u_search}*", headers=headers)
        if p_res.status_code == 200 and p_res.json():
            for prof in p_res.json():
                c_res = requests.get(f"{url}&owner_id=eq.{prof['id']}", headers=headers)
                if c_res.status_code == 200 and c_res.json():
                    return c_res.json()[0]

    # 3. Buscar por nombre de personaje en characters
    if clean_str:
        c_res = requests.get(f"{url}&name=ilike.*{clean_str}*", headers=headers)
        if c_res.status_code == 200 and c_res.json():
            return c_res.json()[0]

    # Nunca retornar personaje equivocado de fallback
    return None

def fetch_all_approved_characters():
    """Obtiene todos los personajes aprobados."""
    url = f"{SUPABASE_URL}/rest/v1/characters?select=id,name,rank,clan,zodiac,status&status=eq.aprobado&order=name.asc"
    res = requests.get(url, headers=get_supabase_headers())
    if res.status_code == 200:
        return res.json()
    return []

# ============================================================
# EVENTOS DEL BOT
# ============================================================
@bot.event
async def on_ready():
    print(f"✅ Bot conectado como: {bot.user.name} ({bot.user.id})")
    try:
        synced = await bot.tree.sync()
        print(f"🔄 Sincronizados {len(synced)} comandos Slash")
    except Exception as e:
        print(f"❌ Error al sincronizar comandos: {e}")

# ============================================================
# COMANDO SLASH: /perfil
# ============================================================
@bot.tree.command(name="perfil", description="Ver la ficha de perfil de un personaje en RCorps")
@app_commands.describe(busqueda="Nombre del personaje o usuario de Discord (opcional)")
async def cmd_perfil(interaction: discord.Interaction, busqueda: str = None):
    await interaction.response.defer()
    
    char = fetch_character_by_name_or_discord(busqueda or interaction.user)
    
    if not char:
        await interaction.followup.send(
            f"❌ No se encontró ningún personaje registrado para `{busqueda or interaction.user.name}`.\n"
            f"Crea o edita tu perfil aquí: {WEB_URL_MI_PERFIL}",
            ephemeral=True
        )
        return
        
    status = char.get("status", "pendiente")
    status_icon = "🟢 Aprobado" if status == "aprobado" else ("🔴 Rechazado" if status == "rechazado" else "🟡 Pendiente")
    color = 0xd4af37 if status == "aprobado" else (0xe74c3c if status == "rechazado" else 0xf1c40f)
    
    char_name = char.get('name', 'Sin Nombre')
    card_file = None
    try:
        card_buf = generate_card_png(char)
        card_file = discord.File(fp=card_buf, filename="tarjeta_rpg.png")
    except Exception as e:
        print("Error generando tarjeta RPG PNG:", e)

    embed = discord.Embed(
        title=f"📜 Perfil de {char_name}",
        description=f"**Estado:** {status_icon}\n**Clan:** {char.get('clan') or 'Sin Clan'}\n**Clase:** {char.get('zodiac') or '—'}\n**Rango:** {char.get('rank') or '—'}",
        color=color
    )
    if card_file:
        embed.set_image(url="attachment://tarjeta_rpg.png")
        
    view = discord.ui.View()
    web_button = discord.ui.Button(
        label="📝 Ir a Mi Perfil (Editar / Crear)",
        url=WEB_URL_MI_PERFIL,
        style=discord.ButtonStyle.link
    )
    view.add_item(web_button)
    
    if card_file:
        await interaction.followup.send(embed=embed, file=card_file, view=view)
    else:
        await interaction.followup.send(embed=embed, view=view)

# ============================================================
# COMANDO SLASH: /perfiles
# ============================================================
@bot.tree.command(name="perfiles", description="Lista de personajes aprobados en RCorps")
async def cmd_perfiles(interaction: discord.Interaction):
    await interaction.response.defer()
    
    chars = fetch_all_approved_characters()
    if not chars:
        await interaction.followup.send("📭 No hay personajes aprobados en la base de datos por el momento.")
        return
        
    embed = discord.Embed(
        title="👥 GALERÍA DE PERSONAJES APROBADOS",
        description=f"Se encontraron **{len(chars)}** personajes registrados en RCorps:\n",
        color=0x3498db
    )
    
    for c in chars[:15]: # Limite a 15 por mensaje de Discord
        clan_str = f"🏰 **Clan:** `{c.get('clan')}`" if c.get('clan') else "🏰 **Clan:** `Sin Clan`"
        rank_val = c.get('rank') or "—"
        zodiac_val = c.get('zodiac') or "—"
        
        entry_info = (
            f"**⚔️ Clase:** `{zodiac_val}` | **🎖️ Rango:** `{rank_val}` | {clan_str}\n"
            f"─────────────────────────────"
        )
        embed.add_field(
            name=f"👤 {c.get('name', 'Sin Nombre').upper()}",
            value=entry_info,
            inline=False
        )
        
    view = discord.ui.View()
    web_button = discord.ui.Button(
        label="🌐 Abrir Galería de Perfiles",
        url=WEB_URL_PERFILES,
        style=discord.ButtonStyle.link
    )
    view.add_item(web_button)
    
    await interaction.followup.send(embed=embed, view=view)

# ============================================================
# COMANDO SLASH: /link
# ============================================================
@bot.tree.command(name="link", description="Enlace para crear o editar tu perfil en la web")
async def cmd_link(interaction: discord.Interaction):
    embed = discord.Embed(
        title="🔗 Mi Perfil en RCorps",
        description="Haz clic en el botón de abajo para iniciar sesión con Discord y gestionar tu ficha de personaje.",
        color=0x9b59b6
    )
    view = discord.ui.View()
    web_button = discord.ui.Button(
        label="📝 Ir a Mi Perfil (Editar / Crear)",
        url=WEB_URL_MI_PERFIL,
        style=discord.ButtonStyle.link
    )
    view.add_item(web_button)
    
    await interaction.response.send_message(embed=embed, view=view, ephemeral=True)

def is_mod_or_admin(interaction: discord.Interaction) -> bool:
    if not interaction.guild:
        return False
    member = interaction.user
    if isinstance(member, discord.Member):
        if member.guild_permissions.administrator or member.guild_permissions.manage_roles:
            return True
        mod_role_names = ["mod", "moderador", "admin", "administrador", "soporte", "staff"]
        for role in member.roles:
            if any(m in role.name.lower() for m in mod_role_names):
                return True
    return False

# ============================================================
# COMANDO SLASH: /setrango (Solo Moderadores / Admins)
# ============================================================
@bot.tree.command(name="setrango", description="[MOD] Cambiar el rango de un personaje")
@app_commands.describe(usuario="Selecciona el usuario de Discord", nuevo_rango="Nuevo rango a asignar (B, A, S, SS)")
@app_commands.choices(nuevo_rango=[
    app_commands.Choice(name="B", value="B"),
    app_commands.Choice(name="A", value="A"),
    app_commands.Choice(name="S", value="S"),
    app_commands.Choice(name="SS", value="SS")
])
async def cmd_setrango(interaction: discord.Interaction, usuario: discord.User, nuevo_rango: app_commands.Choice[str]):
    await interaction.response.defer(ephemeral=True)
    if not is_mod_or_admin(interaction):
        await interaction.followup.send("⛔ Solo los moderadores o soportes pueden usar este comando.", ephemeral=True)
        return
    
    char = fetch_character_by_name_or_discord(usuario)
    if not char:
        await interaction.followup.send(f"❌ No se encontró ningún personaje registrado para {usuario.mention}.", ephemeral=True)
        return

    url = f"{SUPABASE_URL}/rest/v1/characters?id=eq.{char['id']}"
    res = requests.patch(url, json={"rank": nuevo_rango.value}, headers=get_supabase_headers())
    
    role_msg = ""
    if interaction.guild:
        try:
            member = interaction.guild.get_member(usuario.id) or await interaction.guild.fetch_member(usuario.id)
            if member:
                discord_role = discord.utils.find(lambda r: r.name.lower() == nuevo_rango.value.lower(), interaction.guild.roles)
                if discord_role:
                    await member.add_roles(discord_role)
                    role_msg = f" y se le asignó el rol @{discord_role.name} en Discord"
                else:
                    role_msg = f" (⚠️ Crea el rol @{nuevo_rango.value} en los ajustes de Discord para que el Bot lo asigne automáticamente)"
        except discord.Forbidden:
            role_msg = f" (⚠️ Mueve el rol de RCorps Bot por encima del rol @{nuevo_rango.value} en Ajustes de Servidor > Roles)"
        except Exception as e:
            print("Error asignando rol en Discord:", e)

    if res.status_code in [200, 204]:
        await interaction.followup.send(f"✅ Rango de **{char.get('name')}** ({usuario.mention}) actualizado a `{nuevo_rango.value}`{role_msg}.")
    else:
        await interaction.followup.send(f"❌ Error al actualizar el rango en la base de datos.", ephemeral=True)

# ============================================================
# COMANDO SLASH: /setclase (Solo Moderadores / Admins)
# ============================================================
@bot.tree.command(name="setclase", description="[MOD] Cambiar la clase de un personaje")
@app_commands.describe(usuario="Selecciona el usuario de Discord", nueva_clase="Nueva clase a asignar")
@app_commands.choices(nueva_clase=[
    app_commands.Choice(name="Miembro", value="Miembro"),
    app_commands.Choice(name="Sensei", value="Sensei"),
    app_commands.Choice(name="Ronin", value="Ronin"),
    app_commands.Choice(name="Soporte", value="Soporte"),
    app_commands.Choice(name="Bestia", value="Bestia"),
    app_commands.Choice(name="Kage", value="Kage"),
    app_commands.Choice(name="Lider", value="Lider")
])
async def cmd_setclase(interaction: discord.Interaction, usuario: discord.User, nueva_clase: app_commands.Choice[str]):
    await interaction.response.defer(ephemeral=True)
    if not is_mod_or_admin(interaction):
        await interaction.followup.send("⛔ Solo los moderadores o soportes pueden usar este comando.", ephemeral=True)
        return
    
    char = fetch_character_by_name_or_discord(usuario)
    if not char:
        await interaction.followup.send(f"❌ No se encontró ningún personaje registrado para {usuario.mention}.", ephemeral=True)
        return

    url = f"{SUPABASE_URL}/rest/v1/characters?id=eq.{char['id']}"
    res = requests.patch(url, json={"zodiac": nueva_clase.value}, headers=get_supabase_headers())
    
    role_msg = ""
    if interaction.guild:
        try:
            member = interaction.guild.get_member(usuario.id) or await interaction.guild.fetch_member(usuario.id)
            if member:
                discord_role = discord.utils.find(lambda r: r.name.lower() == nueva_clase.value.lower(), interaction.guild.roles)
                if discord_role:
                    await member.add_roles(discord_role)
                    role_msg = f" y se le asignó el rol @{discord_role.name} en Discord"
                else:
                    role_msg = f" (⚠️ Crea el rol @{nueva_clase.value} en los ajustes de Discord para que el Bot lo asigne automáticamente)"
        except discord.Forbidden:
            role_msg = f" (⚠️ Mueve el rol de RCorps Bot por encima del rol @{nueva_clase.value} en Ajustes de Servidor > Roles)"
        except Exception as e:
            print("Error asignando rol en Discord:", e)

    if res.status_code in [200, 204]:
        await interaction.followup.send(f"✅ Clase de **{char.get('name')}** ({usuario.mention}) actualizada a `{nueva_clase.value}`{role_msg}.")
    else:
        await interaction.followup.send(f"❌ Error al actualizar la clase en la base de datos.", ephemeral=True)

def fetch_profile_by_any_query(query, discord_user_obj=None):
    headers = get_supabase_headers()
    
    # Si recibimos directamente el objeto discord.User
    if discord_user_obj:
        d_id = str(discord_user_obj.id)
        res = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?discord_id=eq.{d_id}", headers=headers)
        if res.status_code == 200 and res.json():
            return res.json()[0]
        # probar por username de discord
        u_name = discord_user_obj.name
        res = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?username=ilike.{u_name}", headers=headers)
        if res.status_code == 200 and res.json():
            return res.json()[0]

    clean_query = str(query).replace("@", "").replace("<", "").replace(">", "").replace("!", "").strip()
    
    # 1. Si es ID numérico de Discord
    if clean_query.isdigit():
        res = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?discord_id=eq.{clean_query}", headers=headers)
        if res.status_code == 200 and res.json():
            return res.json()[0]

    # 2. Buscar por username parcial en profiles
    res = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?username=ilike.*{clean_query}*", headers=headers)
    if res.status_code == 200 and res.json():
        return res.json()[0]

    # 3. Buscar por nombre de personaje en characters
    res_char = requests.get(f"{SUPABASE_URL}/rest/v1/characters?name=ilike.*{clean_query}*", headers=headers)
    if res_char.status_code == 200 and res_char.json():
        owner_id = res_char.json()[0].get("owner_id")
        if owner_id:
            res_prof = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{owner_id}", headers=headers)
            if res_prof.status_code == 200 and res_prof.json():
                return res_prof.json()[0]

    return None

# ============================================================
# COMANDO SLASH: /setrol (Solo Admins)
# ============================================================
@bot.tree.command(name="setrol", description="[ADMIN] Cambiar el rol de sistema (admin/mod/user) de un usuario")
@app_commands.describe(usuario="Selecciona el usuario de Discord o escribe su nombre", nuevo_rol="Nuevo rol de sistema")
@app_commands.choices(nuevo_rol=[
    app_commands.Choice(name="Admin", value="admin"),
    app_commands.Choice(name="Mod / Soporte", value="mod"),
    app_commands.Choice(name="Usuario normal", value="user")
])
async def cmd_setrol(interaction: discord.Interaction, usuario: discord.User, nuevo_rol: app_commands.Choice[str]):
    await interaction.response.defer(ephemeral=True)
    if not is_mod_or_admin(interaction):
        await interaction.followup.send("⛔ Solo los administradores pueden cambiar roles del sistema.", ephemeral=True)
        return

    prof = fetch_profile_by_any_query(usuario.name, discord_user_obj=usuario)
    if not prof:
        await interaction.followup.send(f"❌ No se encontró ningún perfil vinculado a {usuario.mention}.", ephemeral=True)
        return

    prof_id = prof["id"]
    patch_res = requests.patch(f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{prof_id}", json={"role": nuevo_rol.value}, headers=get_supabase_headers())
    
    if patch_res.status_code in [200, 204]:
        await interaction.followup.send(f"✅ Rol del sistema para **@{prof.get('username')}** ({usuario.mention}) cambiado a `{nuevo_rol.name}` con éxito.")
    else:
        await interaction.followup.send(f"❌ Error al actualizar el rol en la base de datos.", ephemeral=True)

# ============================================================
# COMANDO SLASH: /darroles (Asignar roles de Discord 'Miembro' y Rango 'B')
# ============================================================
@bot.tree.command(name="darroles", description="[MOD] Asignar roles en el servidor de Discord (Miembro y Rango) a un usuario")
@app_commands.describe(miembro="Usuario de Discord a quien dar roles", rango_rol="Nombre del rol de rango (por defecto: B)")
async def cmd_darroles(interaction: discord.Interaction, miembro: discord.Member, rango_rol: str = "B"):
    await interaction.response.defer(ephemeral=True)
    if not is_mod_or_admin(interaction):
        await interaction.followup.send("⛔ Solo los moderadores pueden usar este comando.", ephemeral=True)
        return

    guild = interaction.guild
    if not guild:
        await interaction.followup.send("❌ Este comando solo se puede usar dentro del servidor de Discord.", ephemeral=True)
        return

    added_roles = []
    # Buscar rol 'Miembro'
    role_miembro = discord.utils.find(lambda r: r.name.lower() == "miembro", guild.roles)
    if role_miembro:
        try:
            await miembro.add_roles(role_miembro)
            added_roles.append(role_miembro.name)
        except Exception as e:
            print("Error añadiendo rol Miembro:", e)

    # Buscar rol de rango (ej. 'B' o 'b')
    role_rango = discord.utils.find(lambda r: r.name.lower() == rango_rol.lower(), guild.roles)
    if role_rango:
        try:
            await miembro.add_roles(role_rango)
            added_roles.append(role_rango.name)
        except Exception as e:
            print("Error añadiendo rol de rango:", e)

    if added_roles:
        await interaction.followup.send(f"✅ Roles `{', '.join(added_roles)}` asignados a {miembro.mention} en el servidor de Discord.")
    else:
        await interaction.followup.send(f"⚠️ Se intentó asignar los roles, pero verifica que existan los roles `Miembro` y `{rango_rol}` creados en la lista de roles del servidor.", ephemeral=True)

# ============================================================
# INICIO DEL BOT
# ============================================================
if __name__ == "__main__":
    if BOT_TOKEN == "TU_TOKEN_DE_DISCORD_AQUI":
        print("⚠️ INSTRUCCIONES:")
        print("1. Crea un Bot en https://discord.com/developers/applications")
        print("2. Pega su Token en la variable BOT_TOKEN o en la variable de entorno DISCORD_BOT_TOKEN")
        print("3. Ejecuta: python bot.py")
    else:
        bot.run(BOT_TOKEN)
