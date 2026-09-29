/* ─────────────────────────────────────────────────────────────
   cyberdefis/defis.js
   Le moteur commun des Cyber-défis. Trois usages :

     Defis.sommaire(conteneur)              → accueil du module
     Defis.categorie("web", conteneur)      → page d'une catégorie
     Defis.panneau({ defi: "w1" })          → panneau de validation d'un défi

   Le flag n'est jamais ici : la page envoie la proposition à /api/defi/verifier
   et le serveur répond. Les indices arrivent un par un, sur demande.
───────────────────────────────────────────────────────────── */

(function () {
    "use strict";

    // ── Constantes ───────────────────────────────────────────

    const API_CATALOGUE   = "/api/defi/catalogue";
    const API_PROGRESSION = "/api/defi/progression";
    const API_VERIFIER    = "/api/defi/verifier";
    const API_INDICE      = "/api/defi/indice";

    const MSG_ERREUR_RESEAU = "Le serveur ne répond pas. Vérifie ta connexion.";
    const MSG_RATE          = "Trop de tentatives d'un coup. Attends une minute.";
    const MSG_ECHEC         = "Ce n'est pas la bonne réponse. Relis l'énoncé, ou demande un indice.";
    const MSG_VIDE          = "Saisis d'abord une réponse.";
    const MSG_REUSSITE      = "Bonne réponse — défi validé.";
    const MSG_DEJA          = "Tu as déjà validé ce défi.";

    // Catalogue et progression : lus une seule fois par page.
    let catalogue   = null;
    let progression = null;

    // ── Accès au serveur ─────────────────────────────────────

    async function lireJson(url) {
        const r = await fetch(url);
        return r.ok ? r.json() : null;
    }

    async function poster(url, corps) {
        const r = await fetch(url, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(corps),
        });
        return { statut: r.status, donnees: r.ok ? await r.json() : null };
    }

    async function chargerCatalogue() {
        if (!catalogue) catalogue = await lireJson(API_CATALOGUE);
        return catalogue;
    }

    async function chargerProgression() {
        if (!progression) progression = await lireJson(API_PROGRESSION) || { connecte: false, defis: [] };
        return progression;
    }

    function etatDuDefi(prog, defiId) {
        const ligne = (prog.defis || []).find(d => d.defi_id === defiId);
        if (!ligne)           return "neuf";
        if (ligne.resolu_le)  return "resolu";
        return "encours";
    }

    // ── Fabrique d'éléments (évite les chaînes HTML à rallonge) ──

    function element(balise, classe, texte) {
        const e = document.createElement(balise);
        if (classe) e.className = classe;
        if (texte !== undefined) e.textContent = texte;
        return e;
    }

    function fenetre(titre) {
        const cadre = element("div", "fenetre");
        const barre = element("div", "fenetre-titre");
        barre.appendChild(element("span", "puce"));
        barre.appendChild(element("span", null, titre));
        const corps = element("div", "fenetre-corps");
        cadre.appendChild(barre);
        cadre.appendChild(corps);
        cadre.corps = corps;
        return cadre;
    }

    // ── Accueil du module : une fenêtre par catégorie ────────

    async function sommaire(conteneur) {
        const cat  = await chargerCatalogue();
        const prog = await chargerProgression();
        if (!cat) { conteneur.appendChild(element("p", null, MSG_ERREUR_RESEAU)); return; }

        for (const infos of cat.categories) {
            const resolus = infos.defis.filter(d => etatDuDefi(prog, d.id) === "resolu").length;

            const cadre = fenetre(infos.titre + "  —  " + resolus + " / " + infos.defis.length + " validés");
            cadre.corps.appendChild(element("p", null, infos.resume));

            const liste = element("div", "liste-cartes");
            for (const defi of infos.defis) liste.appendChild(carteDefi(defi, prog));
            cadre.corps.appendChild(liste);

            conteneur.appendChild(cadre);
        }
    }

    // ── Page d'une catégorie ─────────────────────────────────

    async function categorie(nom, conteneur) {
        const cat  = await chargerCatalogue();
        const prog = await chargerProgression();
        if (!cat) { conteneur.appendChild(element("p", null, MSG_ERREUR_RESEAU)); return; }

        const infos   = cat.categories.find(c => c.cle === nom) || { defis: [] };
        const resolus = infos.defis.filter(d => etatDuDefi(prog, d.id) === "resolu").length;

        const cadre = fenetre("Défis  —  " + resolus + " / " + infos.defis.length + " validés");
        const liste = element("div", "liste-cartes");
        for (const defi of infos.defis) liste.appendChild(carteDefi(defi, prog));
        cadre.corps.appendChild(liste);
        conteneur.appendChild(cadre);

        if (!prog.connecte) {
            cadre.corps.appendChild(noteConnexion());
        }
    }

    function carteDefi(defi, prog) {
        const lien = element("a", "carte");
        lien.href = defi.url;

        const entete = element("div", "carte-entete");
        entete.appendChild(element("span", "carte-titre", defi.id.toUpperCase() + " — " + defi.titre));

        const etat = etatDuDefi(prog, defi.id);
        if (etat === "resolu")  entete.appendChild(element("span", "etat-resolu", "[ validé ]"));
        if (etat === "encours") entete.appendChild(element("span", "etat-encours", "[ commencé ]"));

        lien.appendChild(entete);
        lien.appendChild(element("div", "carte-resume", defi.resume));
        return lien;
    }

    function noteConnexion() {
        const note = element("div", "note");
        note.appendChild(element("strong", null, "Tu n'es pas connecté."));
        note.appendChild(document.createTextNode(
            "Les défis fonctionnent quand même, mais rien n'est conservé : connecte-toi " +
            "depuis l'accueil du site, puis reviens, pour garder ta progression."
        ));
        return note;
    }

    // ── Panneau de validation d'un défi ──────────────────────
    //
    //   config = { defi, conteneur, placeholder, libelleBouton, msgEchec }
    //
    //   Tous les défis se valident par une saisie ; certaines pages soumettent
    //   elles-mêmes une valeur en appelant panneau.soumettre(valeur).

    async function panneau(config) {
        const conteneur = config.conteneur || document.getElementById("panneau");
        const cat       = await chargerCatalogue();
        const prog      = await chargerProgression();
        const infos     = trouverDefi(cat, config.defi);

        const cadre = fenetre("Validation");
        const corps = cadre.corps;

        const champ  = element("input", "champ");
        champ.type         = "text";
        champ.placeholder  = config.placeholder || "FLAG{…}";
        champ.autocomplete = "off";
        champ.spellcheck   = false;

        const btnValider = element("button", "bouton", config.libelleBouton || "Valider");
        const btnIndice  = element("button", "bouton", "Indice");

        const ligne = element("div", "panneau-ligne");
        ligne.appendChild(champ);
        ligne.appendChild(btnValider);
        ligne.appendChild(btnIndice);
        corps.appendChild(ligne);

        const message = element("p", "panneau-message");
        corps.appendChild(message);

        const listeIndices = element("ul", "liste-indices");
        corps.appendChild(listeIndices);

        const zoneLecon = element("div");
        corps.appendChild(zoneLecon);

        if (!prog.connecte) corps.appendChild(noteConnexion());
        conteneur.appendChild(cadre);

        // ── État local du panneau ──
        let indicesVus = 0;
        let termine    = false;

        if (etatDuDefi(prog, config.defi) === "resolu") {
            afficher(MSG_DEJA, "est-ok");
        }

        btnIndice.disabled = infos.nb_indices === 0;
        if (infos.nb_indices === 0) btnIndice.textContent = "Aucun indice";

        function afficher(texte, classe) {
            message.textContent = texte;
            message.className   = "panneau-message " + (classe || "");
        }

        async function soumettre(proposition) {
            if (termine) return true;
            if (!proposition || !String(proposition).trim()) { afficher(MSG_VIDE, "est-attente"); return false; }

            const rep = await poster(API_VERIFIER, { defi: config.defi, proposition: String(proposition) });

            if (rep.statut === 429) { afficher(MSG_RATE, "est-attente"); return false; }
            if (!rep.donnees)       { afficher(MSG_ERREUR_RESEAU, "est-erreur"); return false; }

            if (!rep.donnees.resolu) { afficher(config.msgEchec || MSG_ECHEC, "est-erreur"); return false; }

            termine = true;
            afficher(MSG_REUSSITE, "est-ok");
            btnValider.disabled = true;
            btnIndice.disabled  = true;
            champ.disabled      = true;
            afficherLecon(rep.donnees.lecon);
            return true;
        }

        function afficherLecon(texte) {
            zoneLecon.innerHTML = "";
            const bloc = element("div", "lecon");
            bloc.appendChild(element("h3", null, "Ce que tu viens de faire"));
            bloc.appendChild(element("p", null, texte));
            zoneLecon.appendChild(bloc);
        }

        btnValider.addEventListener("click", () => soumettre(champ.value));
        champ.addEventListener("keydown", e => { if (e.key === "Enter") soumettre(champ.value); });

        btnIndice.addEventListener("click", async () => {
            const rep = await poster(API_INDICE, { defi: config.defi, numero: indicesVus + 1 });
            if (!rep.donnees) { btnIndice.disabled = true; return; }
            indicesVus += 1;
            listeIndices.appendChild(element("li", null, rep.donnees.indice));
            btnIndice.disabled = indicesVus >= infos.nb_indices;
            if (btnIndice.disabled) btnIndice.textContent = "Plus d'indice";
        });

        return { soumettre, afficher };
    }

    function trouverDefi(cat, defiId) {
        // Catalogue injoignable : panneau minimal, le serveur tranchera quand même.
        if (!cat) return { nb_indices: 0 };

        for (const c of cat.categories) {
            const trouve = c.defis.find(d => d.id === defiId);
            if (trouve) return trouve;
        }
        return { nb_indices: 0 };
    }

    // ── Exposition ───────────────────────────────────────────

    window.Defis = { sommaire, categorie, panneau };
})();
