/* ─────────────────────────────────────────────────────────────
   cyberdefis/outils/outils.js
   Le seul outil intégré restant, réuni sous window.Outils :

     Outils.metadonnees(el)  — lecteur de métadonnées d'image (F3)

   Les autres défis (César, binaire, base64…) se résolvent avec des
   sites de conversion trouvés sur le web ; ils n'ont plus d'outil ici.
   JavaScript natif uniquement : aucune bibliothèque, aucun CDN. Les
   couleurs et dimensions viennent de style.css.
───────────────────────────────────────────────────────────── */

(function () {
    "use strict";

    // ── Fabrique d'éléments ──────────────────────────────────

    function el(balise, classe, texte) {
        const e = document.createElement(balise);
        if (classe) e.className = classe;
        if (texte !== undefined) e.textContent = texte;
        return e;
    }

    function cadre(conteneur, titre) {
        const boite = el("div", "outil");
        if (titre) boite.appendChild(el("div", "outil-titre", titre));
        conteneur.appendChild(boite);
        return boite;
    }

    // ── F3 · Lecteur de métadonnées d'image (PNG) ────────────

    function metadonnees(conteneur) {
        const boite = cadre(conteneur, "Lecteur de métadonnées");

        const zone = el("div", "depot");
        zone.textContent = "Dépose l'image ici, ou clique pour la choisir.";
        const choix = el("input");
        choix.type = "file";
        choix.accept = "image/*";
        choix.className = "depot-champ";
        zone.appendChild(choix);
        boite.appendChild(zone);

        const sortie = el("div", "meta-sortie");
        boite.appendChild(sortie);

        function lire(fichier) {
            const lecteur = new FileReader();
            lecteur.onload = function () {
                const champs = extraireTextePNG(new Uint8Array(lecteur.result));
                afficher(fichier.name, champs);
            };
            lecteur.readAsArrayBuffer(fichier);
        }

        function afficher(nom, champs) {
            sortie.innerHTML = "";
            sortie.appendChild(el("p", "discret", "Fichier : " + nom));
            if (!champs.length) {
                sortie.appendChild(el("p", null, "Aucune métadonnée textuelle trouvée dans ce fichier."));
                return;
            }
            const table = el("table");
            for (const [cle, val] of champs) {
                const tr = el("tr");
                tr.appendChild(el("th", null, cle));
                tr.appendChild(el("td", "mono", val));
                table.appendChild(tr);
            }
            sortie.appendChild(table);
        }

        choix.addEventListener("change", () => { if (choix.files[0]) lire(choix.files[0]); });
        zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("survol"); });
        zone.addEventListener("dragleave", () => zone.classList.remove("survol"));
        zone.addEventListener("drop", function (e) {
            e.preventDefault();
            zone.classList.remove("survol");
            if (e.dataTransfer.files[0]) lire(e.dataTransfer.files[0]);
        });
    }

    // Lit les blocs tEXt d'un PNG : signature, puis chaînes de blocs
    // [longueur | type | données | crc]. Un bloc tEXt vaut « clé \0 texte ».
    function extraireTextePNG(octets) {
        const champs = [];
        const sig = [137, 80, 78, 71, 13, 10, 26, 10];
        if (sig.some((b, i) => octets[i] !== b)) return champs;

        let i = 8;
        const vue = new DataView(octets.buffer);
        while (i + 8 <= octets.length) {
            const longueur = vue.getUint32(i);
            const type = String.fromCharCode(octets[i + 4], octets[i + 5], octets[i + 6], octets[i + 7]);
            const debut = i + 8;
            if (type === "tEXt") {
                let sep = debut;
                while (sep < debut + longueur && octets[sep] !== 0) sep++;
                const cle = decodeLatin1(octets, debut, sep);
                const texte = decodeLatin1(octets, sep + 1, debut + longueur);
                champs.push([cle, texte]);
            }
            if (type === "IEND") break;
            i = debut + longueur + 4;
        }
        return champs;
    }

    function decodeLatin1(octets, debut, fin) {
        let s = "";
        for (let k = debut; k < fin; k++) s += String.fromCharCode(octets[k]);
        try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
    }

    // ── Exposition ───────────────────────────────────────────

    window.Outils = { metadonnees };
})();
