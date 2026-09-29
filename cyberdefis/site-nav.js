/* ─────────────────────────────────────────────────────────────
   cyberdefis/site-nav.js
   Ajoute la barre de navigation du site (menu + recherche + connexion)
   sur les pages de Cyber-défis, CÔTÉ CLIENT.

   Pourquoi côté client : la navbar pèse plusieurs centaines de lignes.
   L'écrire dans chaque page alourdirait le code source que l'élève inspecte
   (c'est justement le sujet de plusieurs défis). Ici chaque page n'ajoute
   qu'une ligne — ce <script> — et la navbar est chargée depuis /api/navbar.

   Sa feuille de style est celle du site (/static/style.css), chargée dans le
   <head> de la page avant celle du module.
───────────────────────────────────────────────────────────── */

(function () {
    "use strict";

    // On réserve tout de suite la colonne de gauche, pour que le contenu ne
    // saute pas quand la vraie navbar arrive (le corps est déjà en flex).
    var cale = document.createElement("div");
    cale.setAttribute("style", "flex:0 0 var(--nav-largeur,224px); align-self:stretch;");
    document.body.insertBefore(cale, document.body.firstChild);

    fetch("/api/navbar")
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (html) {
            if (!html) { cale.remove(); return; }

            var tampon = document.createElement("div");
            tampon.innerHTML = html;

            // On insère les nœuds à la place de la cale, avant le contenu du défi.
            // Les <script> injectés via innerHTML ne s'exécutent pas : on les
            // recrée pour qu'ils tournent (menu actif, recherche, connexion…).
            Array.prototype.slice.call(tampon.childNodes).forEach(function (noeud) {
                if (noeud.nodeType === 8) return; // ignore les commentaires
                if (noeud.tagName === "SCRIPT") {
                    var s = document.createElement("script");
                    if (noeud.src) s.src = noeud.src;
                    else s.textContent = noeud.textContent;
                    document.body.insertBefore(s, cale);
                } else {
                    document.body.insertBefore(noeud, cale);
                }
            });
            cale.remove();
        })
        .catch(function () { cale.remove(); });
})();
