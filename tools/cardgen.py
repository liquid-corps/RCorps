# -*- coding: utf-8 -*-
"""
cardgen.py — Generador oficial de la tarjeta de perfil de RCorps (956x579).
Alineado 1:1 con perfil.html y perfiles.html.
"""
import os
import argparse
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CARD_DIR = os.path.join(BASE_DIR, "..", "card")
FONT_PATH = os.path.join(BASE_DIR, "..", "PixelArial11.ttf")

# ----------------- LAYOUT EXACTO PERFIL.HTML -----------------
CANVAS = "base.png"                      # 956x579
POS = {
    "foto":     (74, 66, 270, 260),       # foto_perfil.png
    "clan":     (171, 36, 76, 72),        # clan_icon.png (arriba de la foto)
    "tag":      (90, 302, 237, 48),       # tag badge (abajo de la foto)
    "skill1":   (111, 356, 90, 84),       # skills.png slot 1
    "skill2":   (217, 356, 90, 84),       # skills.png slot 2
    "nombre":   (398, 52, 480, 56),       # large_area.png
    "clase":    (398, 118, 314, 52),      # medium_area.png
    "edad":     (398, 180, 235, 52),      # small_area.png
    "rango":    (643, 180, 235, 52),      # small_area.png
    "frase":    (398, 242, 480, 280),     # biografy.png
}

PIECE = {
    "foto":   "foto_perfil.png",
    "clan":   "clan_icon.png",
    "skill1": "skills.png",
    "skill2": "skills.png",
    "nombre": "large_area.png",
    "clase":  "medium_area.png",
    "edad":   "small_area.png",
    "rango":  "small_area.png",
    "frase":  "biografy.png",
}

INK = (43, 34, 24, 255)          # tinta oscura (texto)
LABEL = (122, 106, 84, 255)      # etiqueta (color cafe suave)
PAD = 16                         # relleno interno de las cajas

def font(px, bold=False):
    try:
        return ImageFont.truetype(FONT_PATH, px)
    except Exception:
        return ImageFont.load_default()

def paste_piece(card, key):
    x, y, w, h = POS[key]
    piece_file = PIECE[key]
    piece_path = os.path.join(CARD_DIR, piece_file)
    if os.path.exists(piece_path):
        piece = Image.open(piece_path).convert("RGBA")
        if piece.size != (w, h):
            piece = piece.resize((w, h), Image.LANCZOS)
        card.alpha_composite(piece, (x, y))
    return (x, y, w, h)

def paste_cover(card, img_input, box, margin=8, contain=False):
    """Pega una imagen recortada modo 'cover' o 'contain' dentro de una caja."""
    if not img_input:
        return
    x, y, w, h = box
    tw, th = w - 2 * margin, h - 2 * margin
    try:
        if isinstance(img_input, Image.Image):
            im = img_input.convert("RGBA")
        else:
            if not os.path.exists(img_input):
                return
            im = Image.open(img_input).convert("RGBA")
            
        if contain:
            s = min(tw / im.width, th / im.height)
            im = im.resize((int(im.width * s + 0.5), int(im.height * s + 0.5)), Image.LANCZOS)
            px = x + margin + (tw - im.width) // 2
            py = y + margin + (th - im.height) // 2
            card.alpha_composite(im, (px, py))
        else:
            s = max(tw / im.width, th / im.height)
            im = im.resize((int(im.width * s + 0.5), int(im.height * s + 0.5)), Image.LANCZOS)
            ox = (im.width - tw) // 2
            oy = (im.height - th) // 2
            im = im.crop((ox, oy, ox + tw, oy + th))
            card.alpha_composite(im, (x + margin, y + margin))
    except Exception as e:
        print(f"Error pegando imagen en {box}:", e)

def draw_label_value(dr, box, label, value):
    x, y, w, h = box
    fl = font(18)
    fv = font(22)
    lab = label + ":"
    value = str(value or "—")
    
    lbox = dr.textbbox((0, 0), lab, font=fl)
    vbox = dr.textbbox((0, 0), value, font=fv)
    
    lh = lbox[3] - lbox[1]
    vh = vbox[3] - vbox[1]
    
    vy = y + (h - vh) // 2 - vbox[1]
    ly = y + (h - lh) // 2 - lbox[1]
    
    dr.text((x + PAD, ly), lab, font=fl, fill=LABEL)
    lw = lbox[2] - lbox[0]
    dr.text((x + PAD + lw + 10, vy), value, font=fv, fill=INK)

def draw_wrapped(dr, box, label, text):
    x, y, w, h = box
    fl = font(18)
    ft = font(18)
    lab = label + ":"
    dr.text((x + PAD, y + PAD), lab, font=fl, fill=LABEL)
    
    ty = y + PAD + 28
    max_w = w - (PAD * 2)
    line, lines = "", []
    for word in str(text or "").split():
        test = (line + " " + word).strip()
        if dr.textbbox((0, 0), test, font=ft)[2] <= max_w:
            line = test
        else:
            lines.append(line); line = word
    if line:
        lines.append(line)
    for ln in lines[:6]:
        dr.text((x + PAD, ty), ln, font=ft, fill=INK)
        ty += 24

def build_card(nombre="", clase="", edad="", rango="", zodiac="", frase="",
               foto=None, clan=None, tag=None, skills=(), out="tarjeta.png"):
    card = Image.open(os.path.join(CARD_DIR, CANVAS)).convert("RGBA")
    
    # 1. Pegar estructuras base
    for key in ["foto", "nombre", "clase", "edad", "rango", "frase", "skill1", "skill2"]:
        paste_piece(card, key)

    # 2. Pegar foto de perfil
    if foto:
        paste_cover(card, foto, POS["foto"], margin=14)

    # 3. Pegar insignia de Clan (arriba de la foto)
    if clan:
        paste_piece(card, "clan")
        paste_cover(card, clan, POS["clan"], margin=6, contain=True)

    # 4. Pegar Tag badge (abajo de la foto)
    if tag:
        paste_cover(card, tag, POS["tag"], margin=0, contain=True)

    # 5. Pegar Skills (slots 1 y 2)
    if len(skills) > 0 and skills[0]:
        paste_cover(card, skills[0], POS["skill1"], margin=8, contain=True)
    if len(skills) > 1 and skills[1]:
        paste_cover(card, skills[1], POS["skill2"], margin=8, contain=True)

    # 6. Dibujar textos
    dr = ImageDraw.Draw(card)
    draw_label_value(dr, POS["nombre"], "Nombre", nombre)
    draw_label_value(dr, POS["clase"], "Clase", clase or zodiac)
    draw_label_value(dr, POS["edad"], "Edad", edad)
    draw_label_value(dr, POS["rango"], "Rango", rango)
    draw_wrapped(dr, POS["frase"], "Biografía", frase)
    
    return card

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--nombre", default="ripirin")
    ap.add_argument("--clase", default="SS")
    ap.add_argument("--edad", default="20")
    ap.add_argument("--rango", default="Mod")
    ap.add_argument("--frase", default="Algun dia los voy a Radiar")
    ap.add_argument("--out", default="tarjeta_demo.png")
    a = ap.parse_args()
    build_card(a.nombre, a.clase, a.edad, a.rango, frase=a.frase, out=a.out).save(a.out)
    print("OK ->", a.out)
