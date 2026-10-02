"""Migration unique : inscrit le type catalogue (beamTypeId) sur chaque poutre
enregistrée — catalogue de niveaux, sauvegardes élèves, ponts validés.

POURQUOI MAINTENANT. Une poutre d'avant ne connaît que son matériau et son
épaisseur ; son type catalogue se retrouve en appariant ce couple. Cet
appariement cesse de fonctionner dès qu'une épaisseur change dans BEAM_TYPES —
or c'est justement ce qu'on voudra régler. Il faut donc figer l'identité une
bonne fois, pendant qu'elle est encore déductible.

La raideur axiale, elle, n'est pas touchée ici : le simulateur la recalcule à
chaque chargement (Structure.js::migrerPoutres), et la dupliquer en Python
créerait une deuxième source de vérité pour la même formule.

    python migrer_types_poutres.py            # montre ce qui serait fait
    python migrer_types_poutres.py --ecrire   # applique (sauvegarde data.db avant)
"""

import json
import re
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# La console Windows est en cp1252 : sans ça, le moindre accent fait tout échouer.
sys.stdout.reconfigure(encoding="utf-8")

RACINE = Path(__file__).parent
BASE = RACINE / "data.db"
MATERIAUX_JS = RACINE / "simulateur-structures" / "js" / "model" / "materials.js"

# Colonnes qui contiennent une structure sérialisée : (table, clé, colonne JSON).
SOURCES = (
    ("sim_catalogue", "id", "contenu"),
    ("sim_structures", "id", "structure"),
    ("sim_niveaux", "niveau_id", "pont_json"),
)


def catalogue_types() -> dict:
    """{(materialId, epaisseur): beamTypeId}, lu dans materials.js — une seule
    source de vérité, pas une copie du catalogue dans ce script."""
    texte = MATERIAUX_JS.read_text(encoding="utf-8")
    bloc = texte.split("export const BEAM_TYPES = [", 1)[1].split("];", 1)[0]
    table = {}
    for ligne in re.finditer(
        r'id:\s*"([^"]+)".*?materialId:\s*"([^"]+)".*?thickness:\s*([0-9.]+)', bloc
    ):
        type_id, materiau, epaisseur = ligne.group(1), ligne.group(2), float(ligne.group(3))
        table[(materiau, epaisseur)] = type_id
    return table


def migrer_structure(structure: dict, types: dict, compteurs: dict) -> bool:
    """Inscrit beamTypeId sur les poutres qui n'en ont pas. Vrai si modifiée."""
    modifiee = False
    for poutre in structure.get("beams", []):
        if poutre.get("beamTypeId"):
            compteurs["deja"] += 1
            continue
        type_id = types.get((poutre.get("materialId"), poutre.get("sectionArea")))
        if type_id is None:
            compteurs["inconnues"] += 1
            print(f"      ! poutre sans type : {poutre.get('materialId')} / {poutre.get('sectionArea')} m")
            continue
        poutre["beamTypeId"] = type_id
        compteurs[type_id] = compteurs.get(type_id, 0) + 1
        modifiee = True
    return modifiee


def parcourir(contenu: str, types: dict, compteurs: dict):
    """Une colonne contient soit une structure, soit le catalogue (catégories →
    niveaux → structure). Renvoie le JSON migré, ou None si rien n'a changé."""
    donnees = json.loads(contenu)
    modifiee = False
    if isinstance(donnees, dict) and "beams" in donnees:
        modifiee = migrer_structure(donnees, types, compteurs)
    elif isinstance(donnees, list):  # catalogue de niveaux
        for categorie in donnees:
            for niveau in categorie.get("niveaux", []):
                structure = niveau.get("structure")
                if isinstance(structure, dict) and migrer_structure(structure, types, compteurs):
                    modifiee = True
                    print(f"      niveau {niveau.get('id')} : {niveau.get('label')}")
    return json.dumps(donnees, ensure_ascii=False) if modifiee else None


def main() -> None:
    ecrire = "--ecrire" in sys.argv
    types = catalogue_types()
    print(f"Catalogue lu : {len(types)} types — {sorted(types.values())}\n")

    if ecrire:
        # Nom collé à data.db, comme les autres copies de sauvegarde du projet.
        copie = BASE.with_name(f"{BASE.name}.avant-types-poutres-{datetime.now():%Y%m%d-%H%M%S}")
        shutil.copy2(BASE, copie)
        print(f"Sauvegarde de la base : {copie.name}\n")

    compteurs = {"deja": 0, "inconnues": 0}
    connexion = sqlite3.connect(BASE)
    for table, cle, colonne in SOURCES:
        lignes = connexion.execute(f"select {cle}, {colonne} from {table}").fetchall()
        print(f"{table} : {len(lignes)} ligne(s)")
        for identifiant, contenu in lignes:
            if not contenu:
                continue
            migre = parcourir(contenu, types, compteurs)
            if migre is None:
                continue
            print(f"   → {identifiant}")
            if ecrire:
                connexion.execute(
                    f"update {table} set {colonne} = ? where {cle} = ?", (migre, identifiant)
                )
    if ecrire:
        connexion.commit()
    connexion.close()

    estampillees = {k: v for k, v in compteurs.items() if k not in ("deja", "inconnues")}
    print(f"\nPoutres estampillées : {sum(estampillees.values())} {estampillees}")
    print(f"Déjà à jour : {compteurs['deja']}   Sans type reconnu : {compteurs['inconnues']}")
    print("\n(simulation — relancer avec --ecrire pour appliquer)" if not ecrire else "\nBase mise à jour.")


if __name__ == "__main__":
    main()
