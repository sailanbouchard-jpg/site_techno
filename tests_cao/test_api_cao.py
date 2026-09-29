"""
tests_cao/test_api_cao.py
─────────────────────────
Routes /api/cao/ de l'atelier 3D, testées avec le client de test de Flask sur
une base TEMPORAIRE : data.db et uploads/ ne sont jamais touchés.

  python -m unittest tests_cao/test_api_cao.py
"""

import hashlib
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE))

import core.database as database  # noqa: E402
import server  # noqa: E402

DOCUMENT = {"format": "cao-college", "version": 1, "nom": "Lampe", "racine": {"id": "r", "type": "racine"}}
VIGNETTE = "data:image/png;base64,iVBORw0KGgo="
CLE = "0123456789abcdef0123456789abcdef00000010"


class TestApiCao(unittest.TestCase):

    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp(prefix="test_api_cao_"))
        self.db_origine = database.DB_PATH
        self.uploads_origine = server.UPLOADS_CAO_DIR
        database.DB_PATH = self.dossier / "test.db"
        server.UPLOADS_CAO_DIR = self.dossier / "uploads_cao"
        database.init_db()

        with database.get_connection() as conn:
            for identifiant in ("eleve_a", "eleve_b"):
                conn.execute(
                    "INSERT INTO eleves (identifiant, mot_de_passe) VALUES (?, ?)",
                    (identifiant, hashlib.sha256(b"essai").hexdigest()),
                )

        server.app.config["TESTING"] = True
        self.client = server.app.test_client()

    def tearDown(self):
        database.DB_PATH = self.db_origine
        server.UPLOADS_CAO_DIR = self.uploads_origine
        shutil.rmtree(self.dossier, ignore_errors=True)

    def connecter(self, identifiant):
        reponse = self.client.post("/api/login", json={"identifiant": identifiant, "mot_de_passe": "essai"})
        self.assertEqual(reponse.status_code, 200)

    def creer(self, **champs):
        corps = {"nom": "Lampe", "document": DOCUMENT, "vignette": VIGNETTE, **champs}
        return self.client.post("/api/cao/projets", json=corps)

    # ── Projets ─────────────────────────────────────────────────────────────

    def test_sans_connexion_tout_est_refuse(self):
        self.assertEqual(self.client.get("/api/cao/projets").status_code, 401)
        self.assertEqual(self.creer().status_code, 401)
        self.assertEqual(self.client.get(f"/api/cao/fichiers/{CLE}").status_code, 401)

    def test_creer_lister_lire_enregistrer_supprimer(self):
        self.connecter("eleve_a")

        cree = self.creer()
        self.assertEqual(cree.status_code, 201)
        projet_id = cree.get_json()["id"]

        liste = self.client.get("/api/cao/projets").get_json()
        self.assertEqual([p["id"] for p in liste], [projet_id])
        self.assertEqual(liste[0]["vignette_png"], VIGNETTE)
        self.assertNotIn("document_json", liste[0], "la liste reste légère")

        lu = self.client.get(f"/api/cao/projets/{projet_id}").get_json()
        self.assertEqual(lu["document"], DOCUMENT)

        modifie = dict(DOCUMENT, nom="Lampe de Léo")
        reponse = self.client.put(f"/api/cao/projets/{projet_id}", json={"nom": "Lampe de Léo", "document": modifie})
        self.assertEqual(reponse.status_code, 200)
        lu = self.client.get(f"/api/cao/projets/{projet_id}").get_json()
        self.assertEqual(lu["nom"], "Lampe de Léo")
        self.assertEqual(lu["document"]["nom"], "Lampe de Léo", "les accents passent")

        liste = self.client.get("/api/cao/projets").get_json()
        self.assertEqual(liste[0]["vignette_png"], VIGNETTE, "sans vignette, l'ancienne est gardée")

        self.assertEqual(self.client.delete(f"/api/cao/projets/{projet_id}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/cao/projets/{projet_id}").status_code, 404)

    def test_un_eleve_ne_voit_pas_les_projets_d_un_autre(self):
        self.connecter("eleve_a")
        projet_id = self.creer().get_json()["id"]
        self.client.post("/api/logout")

        self.connecter("eleve_b")
        self.assertEqual(self.client.get("/api/cao/projets").get_json(), [])
        self.assertEqual(self.client.get(f"/api/cao/projets/{projet_id}").status_code, 404)
        self.assertEqual(self.client.put(f"/api/cao/projets/{projet_id}",
                                         json={"nom": "x", "document": DOCUMENT}).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/cao/projets/{projet_id}").status_code, 404)

    def test_les_corps_invalides_sont_refuses(self):
        self.connecter("eleve_a")
        self.assertEqual(self.creer(nom="   ").status_code, 400)
        self.assertEqual(self.creer(document={"format": "autre", "version": 1}).status_code, 400)
        self.assertEqual(self.creer(document={"format": "cao-college"}).status_code, 400)
        self.assertEqual(self.creer(document="pas un objet").status_code, 400)
        self.assertEqual(self.creer(vignette="javascript:alert(1)").status_code, 400)
        self.assertEqual(self.creer(vignette="data:image/png;base64," + "A" * 400_000).status_code, 400)

        enorme = dict(DOCUMENT, bourrage="x" * (server.MAX_CAO_DOCUMENT_CHARS + 1))
        self.assertEqual(self.creer(document=enorme).status_code, 413)

    def test_le_nom_est_tronque_proprement(self):
        self.connecter("eleve_a")
        projet_id = self.creer(nom="  " + "é" * 200 + "  ").get_json()["id"]
        nom = self.client.get(f"/api/cao/projets/{projet_id}").get_json()["nom"]
        self.assertEqual(nom, "é" * server.MAX_CAO_NOM_CHARS)

    def test_le_nombre_de_projets_est_plafonne(self):
        self.connecter("eleve_a")
        for _ in range(server.MAX_CAO_PROJETS_PAR_ELEVE):
            self.assertEqual(self.creer().status_code, 201)
        self.assertEqual(self.creer().status_code, 409)

    # ── Fichiers importés ───────────────────────────────────────────────────

    def test_deposer_puis_relire_un_fichier(self):
        self.connecter("eleve_a")
        octets = b"solid essai\nendsolid essai\n" * 20

        self.assertEqual(self.client.head(f"/api/cao/fichiers/{CLE}").status_code, 404)
        depose = self.client.put(f"/api/cao/fichiers/{CLE}?nom=boîtier lampe.stl", data=octets,
                                 content_type="application/octet-stream")
        self.assertEqual(depose.status_code, 201)
        self.assertEqual(self.client.head(f"/api/cao/fichiers/{CLE}").status_code, 200)

        relu = self.client.get(f"/api/cao/fichiers/{CLE}")
        self.assertEqual(relu.status_code, 200)
        self.assertEqual(relu.data, octets)
        relu.close()

        with database.get_connection() as conn:
            ligne = conn.execute("SELECT nom_original, taille FROM fichiers_cao").fetchone()
        self.assertEqual(ligne["taille"], len(octets))
        self.assertNotIn("/", ligne["nom_original"])

    def test_redeposer_le_meme_fichier_ne_change_rien(self):
        self.connecter("eleve_a")
        for _ in range(2):
            self.assertEqual(self.client.put(f"/api/cao/fichiers/{CLE}", data=b"abc").status_code, 201)
        with database.get_connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM fichiers_cao").fetchone()[0], 1)

    def test_les_fichiers_sont_prives(self):
        self.connecter("eleve_a")
        self.client.put(f"/api/cao/fichiers/{CLE}", data=b"secret")
        self.client.post("/api/logout")
        self.connecter("eleve_b")
        self.assertEqual(self.client.get(f"/api/cao/fichiers/{CLE}").status_code, 404)

    def test_les_cles_malformees_ne_touchent_jamais_le_disque(self):
        self.connecter("eleve_a")
        for cle in ("..%2F..%2Fserver", "ABC", CLE + "0", "g" * 40, "../" + CLE[3:]):
            reponse = self.client.put(f"/api/cao/fichiers/{cle}", data=b"x")
            # 405 : une clé avec des « / » n'atteint même pas la route (le
            # routage de Flask l'envoie vers les fichiers statiques, en lecture seule).
            self.assertIn(reponse.status_code, (400, 404, 405), cle)
        self.assertFalse((self.dossier / "uploads_cao").exists())

    def test_un_fichier_vide_ou_trop_gros_est_refuse(self):
        self.connecter("eleve_a")
        self.assertEqual(self.client.put(f"/api/cao/fichiers/{CLE}", data=b"").status_code, 400)
        trop = b"x" * (server.MAX_CAO_FICHIER_BYTES + 1)
        self.assertEqual(self.client.put(f"/api/cao/fichiers/{CLE}", data=trop).status_code, 413)

    # ── Pages ───────────────────────────────────────────────────────────────

    def test_l_atelier_et_la_page_de_mesures_sont_servis(self):
        for chemin in ("/cao/", "/cao/v0/"):
            reponse = self.client.get(chemin)
            self.assertEqual(reponse.status_code, 200, chemin)
            self.assertIn(b"<html", reponse.data)
            reponse.close()

        wasm = self.client.get("/cao/vendor/manifold-3.5.3/manifold.wasm")
        self.assertEqual(wasm.mimetype, "application/wasm")
        wasm.close()


if __name__ == "__main__":
    unittest.main()
