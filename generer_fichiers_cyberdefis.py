"""
generer_fichiers_cyberdefis.py
------------------------------
Génère les vrais fichiers manipulés par la catégorie « Manipulation de
fichiers » des Cyber-défis. À relancer si l'on change un flag de F1/F3/F4/F5.

  python generer_fichiers_cyberdefis.py

Bibliothèque standard uniquement (zlib, zipfile, struct) : aucune dépendance.
Les fichiers sont écrits dans cyberdefis/fichiers/<defi>/ et servis tels quels.
"""

import io
import struct
import zipfile
import zlib
from pathlib import Path

BASE = Path(__file__).parent / "cyberdefis" / "fichiers"


# ── PNG minimal mais valide (RGB 8 bits) ──────────────────────────────────────

def _chunk(typ: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)


def make_png(width: int, height: int, pixel, textes=()) -> bytes:
    """pixel(x, y) -> (r, g, b). `textes` = liste de (clé, valeur) en blocs tEXt."""
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # 8 bits, couleur RVB

    brut = bytearray()
    for y in range(height):
        brut.append(0)  # filtre « aucun » en tête de chaque ligne
        for x in range(width):
            r, g, b = pixel(x, y)
            brut += bytes((r & 255, g & 255, b & 255))

    out = sig + _chunk(b"IHDR", ihdr)
    for cle, valeur in textes:
        out += _chunk(b"tEXt", cle.encode("latin-1") + b"\x00" + valeur.encode("utf-8"))
    out += _chunk(b"IDAT", zlib.compress(bytes(brut), 9))
    out += _chunk(b"IEND", b"")
    return out


# ── F1 · Changer l'extension : un fichier texte nommé .jpg ────────────────────

def generer_f1():
    cible = BASE / "fichier_a_decoder.jpg"
    texte = (
        "Ce fichier contient du texte. Il n'y a pas d'image, c'est pour cela que\n"
        "l'ordinateur indique qu'il n'arrive pas a le lire.\n"
        "\n"
        "L'extension n'est qu'une etiquette : elle ne change pas le contenu reel.\n"
        "\n"
        "FLAG{FICHIERTXT}\n"
    )
    cible.write_text(texte, encoding="utf-8")
    # L'ancien fichier F1 (indice.jpg) n'a plus lieu d'etre.
    ancien = BASE / "indice.jpg"
    if ancien.exists():
        ancien.unlink()
    return cible


# ── F3 · Les informations cachées d'une image ────────────────────────────────

def generer_f3():
    cible = BASE / "photo.png"

    def ciel(x, y):
        # Dégradé bleuté, pour que le fichier ressemble à une vraie photo.
        return (60 + x * 90 // 480, 110 + y * 90 // 320, 190)

    textes = [
        ("Appareil",    "Pixel 5"),
        ("Date",        "2024:07:14 15:22:08"),
        ("Lieu",        "43.2951, 5.3708 (Vieux-Port, Marseille)"),
        ("Description", "FLAG{metadonnees}"),
    ]
    cible.write_bytes(make_png(480, 320, ciel, textes))
    return cible


# ── F4 · Les archives imbriquées ─────────────────────────────────────────────

def generer_f4():
    cible = BASE / "archive.zip"

    # Cœur : le fichier texte contenant le flag.
    donnee = b"Tu es alle au bout. Le voici :\n\nFLAG{tout-au-fond}\n"
    nom = "flag.txt"

    # On emballe quatre fois, chaque archive contenant la precedente.
    noms_intermediaires = ["encore-un-effort.zip", "presque.zip", "plus-que-deux.zip", "dernier.zip"]
    for etiquette in noms_intermediaires:
        tampon = io.BytesIO()
        with zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(nom, donnee)
        donnee = tampon.getvalue()
        nom = etiquette

    cible.write_bytes(donnee)
    return cible


# ── F5 · Le message ajouté après la fin de l'image ───────────────────────────

def generer_f5():
    cible = BASE / "image.png"

    def damier(x, y):
        c = 235 if (x // 24 + y // 24) % 2 == 0 else 120
        return (c, c, c)

    png = make_png(480, 320, damier)
    ajout = (
        b"\n\n---- message ajoute apres la fin de l'image ----\n"
        b"Bravo, tu as ouvert l'image avec un editeur de texte.\n"
        b"FLAG{a-la-fin-du-fichier}\n"
    )
    cible.write_bytes(png + ajout)
    return cible


def main():
    for generer in (generer_f1, generer_f3, generer_f4, generer_f5):
        cible = generer()
        print(f"  ecrit  {cible.relative_to(Path(__file__).parent)}  ({cible.stat().st_size} octets)")


if __name__ == "__main__":
    main()
