/*
 * pdf_raw_viewer.js — Rendu "brut" du bloc =pdf> raw (aucune interface de
 * lecteur PDF : ni boutons, ni bordure, ni barre d'outils/panneau/scrollbar).
 * ---------------------------------------------------------------------------
 * Le lecteur PDF intégré des navigateurs ignore les paramètres d'URL type
 * #toolbar=0 (Firefox notamment), donc on ne peut pas s'en servir pour ce
 * rendu. À la place, chaque page du PDF est dessinée sur un <canvas> par
 * pdf.js (static/libs/pdfjs/, auto-hébergé, chargé juste avant ce script),
 * avec une couche de texte invisible superposée pour garder le texte
 * sélectionnable — exactement comme une image, mais avec du texte dessous.
 *
 * Zéro bouton, zéro zoom, zéro déplacement : chaque page est mise à l'échelle
 * une fois pour remplir la largeur du bloc, un point c'est tout.
 */
(function () {
  "use strict";

  // Ré-exécution (le bloc =pdf> raw insère ce <script> une fois par PDF) :
  // si déjà chargé, on se contente d'initialiser les nouveaux blocs.
  if (window.__pdfRawViewerInit) { window.__pdfRawViewerInit(); return; }

  const WORKER_SRC = "/static/libs/pdfjs/pdf.worker.min.js";

  function renderPage(pdf, pageNum, container) {
    return pdf.getPage(pageNum).then(function (page) {
      const containerWidth = container.clientWidth || container.getBoundingClientRect().width;
      const baseViewport   = page.getViewport({ scale: 1 });
      const scale          = containerWidth / baseViewport.width;
      const viewport       = page.getViewport({ scale: scale });

      const pageDiv = document.createElement("div");
      pageDiv.className = "pdf-raw-page";
      pageDiv.style.width  = viewport.width + "px";
      pageDiv.style.height = viewport.height + "px";

      // Le canvas est dessiné à la résolution physique de l'écran (outputScale)
      // mais affiché à la taille CSS du viewport — sinon le rendu est flou/
      // pixellisé sur les écrans haute densité (Retina, la plupart des laptops).
      const outputScale = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      canvas.width        = Math.floor(viewport.width * outputScale);
      canvas.height       = Math.floor(viewport.height * outputScale);
      canvas.style.width  = viewport.width + "px";
      canvas.style.height = viewport.height + "px";
      pageDiv.appendChild(canvas);

      const textLayerDiv = document.createElement("div");
      textLayerDiv.className = "textLayer";
      pageDiv.appendChild(textLayerDiv);

      container.appendChild(pageDiv);

      const renderContext = {
        canvasContext: canvas.getContext("2d"),
        viewport:      viewport,
        transform:     outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
      };

      return page.render(renderContext).promise
        .then(function () { return page.getTextContent(); })
        .then(function (textContent) {
          window.pdfjsLib.renderTextLayer({
            textContent: textContent,
            container:   textLayerDiv,
            viewport:    viewport,
            textDivs:    []
          });
        });
    });
  }

  function renderPdf(container) {
    if (container.dataset.pdfRawDone) return;   // évite un double rendu

    // Bloc encore masqué (pagination, onglet, section repliée) : largeur 0 →
    // pages dessinées en 0×0. On attend qu'il ait une vraie largeur.
    if (container.clientWidth === 0) {
      const observer = new ResizeObserver(function () {
        if (container.clientWidth === 0) return;
        observer.disconnect();
        renderPdf(container);
      });
      observer.observe(container);
      return;
    }
    container.dataset.pdfRawDone = "1";

    if (!window.pdfjsLib) return;   // pdf.min.js pas encore chargé, on abandonne
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;

    window.pdfjsLib.getDocument(container.dataset.pdfSrc).promise.then(function (pdf) {
      let chain = Promise.resolve();
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        chain = chain.then(renderPage.bind(null, pdf, pageNum, container));
      }
      chain.then(function () { setupPager(container, pdf.numPages); });
    });
  }

  // ── Compteur "page n/N" (mode horizontal uniquement) ──
  const ARROWS = { none: "·", left: "←", right: "→", both: "↔" };

  function setupPager(container, numPages) {
    const pager = container.closest(".media-pdf-raw").querySelector(".pdf-pager");
    if (!pager) return;
    const text  = pager.querySelector(".pdf-pager-text");
    const arrow = pager.querySelector(".pdf-pager-arrow");
    const pages = container.querySelectorAll(".pdf-raw-page");
    const prevBtn = container.closest(".media-pdf-raw").querySelector(".pdf-nav-prev");   // option "fleches"
    const nextBtn = container.closest(".media-pdf-raw").querySelector(".pdf-nav-next");
    let current = 0;

    function goToPage(i) {
      container.scrollTo({ left: pages[i].offsetLeft - pages[0].offsetLeft, behavior: "smooth" });
    }
    if (prevBtn) prevBtn.addEventListener("click", function () { goToPage(Math.max(current - 1, 0)); });
    if (nextBtn) nextBtn.addEventListener("click", function () { goToPage(Math.min(current + 1, numPages - 1)); });

    function update() {
      // Page courante = celle dont le bord gauche est le plus proche de la position de défilement
      let bestDist = Infinity;
      pages.forEach(function (p, i) {
        const dist = Math.abs(p.offsetLeft - pages[0].offsetLeft - container.scrollLeft);
        if (dist < bestDist) { bestDist = dist; current = i; }
      });
      const hasLeft  = current > 0;
      const hasRight = current < numPages - 1;
      text.textContent  = "page " + (current + 1) + "/" + numPages;
      arrow.textContent = hasLeft && hasRight ? ARROWS.both
                        : hasLeft ? ARROWS.left
                        : hasRight ? ARROWS.right
                        : ARROWS.none;
      if (prevBtn) prevBtn.hidden = !hasLeft;
      if (nextBtn) nextBtn.hidden = !hasRight;
    }

    container.addEventListener("scroll", update, { passive: true });
    update();
    setupTopScrollbar(container);
  }

  // ── Barre du haut : faux curseur ──
  // Ce n'est PAS une 2e zone défilante : deux zones qui se recopient leur
  // position se renvoient la balle à chaque image (tremblements, saccades).
  // Ici le curseur ne fait que suivre les pages, et le glisser pilote les pages.
  function setupTopScrollbar(container) {
    const track = container.closest(".media-pdf-raw").querySelector(".pdf-scroll-top");
    if (!track) return;
    const thumb = track.firstElementChild;

    function ratio() { return container.clientWidth / container.scrollWidth; }

    function drawThumb() {
      thumb.style.width     = (ratio() * track.clientWidth) + "px";
      thumb.style.transform = "translateX(" + (container.scrollLeft * track.clientWidth / container.scrollWidth) + "px)";
    }

    let dragStartX = 0;
    let dragStartScroll = 0;

    track.addEventListener("pointerdown", function (e) {
      // Clic sur la piste hors curseur : on centre le curseur sous la souris
      if (e.target !== thumb) {
        const x = e.clientX - track.getBoundingClientRect().left;
        container.scrollLeft = x / track.clientWidth * container.scrollWidth - container.clientWidth / 2;
      }
      dragStartX = e.clientX;
      dragStartScroll = container.scrollLeft;
      container.style.scrollSnapType = "none";   // sinon le calage ramène les pages à chaque mouvement
      track.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    track.addEventListener("pointermove", function (e) {
      if (!track.hasPointerCapture(e.pointerId)) return;
      container.scrollLeft = dragStartScroll + (e.clientX - dragStartX) / track.clientWidth * container.scrollWidth;
    });

    function endDrag(e) {
      if (!track.hasPointerCapture(e.pointerId)) return;
      track.releasePointerCapture(e.pointerId);
      container.style.scrollSnapType = "";   // le calage page par page reprend
    }
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);

    container.addEventListener("scroll", drawThumb, { passive: true });
    window.addEventListener("resize", drawThumb);
    drawThumb();
  }

  function initAll() {
    document.querySelectorAll(".block-pdf-raw").forEach(renderPdf);
  }

  window.__pdfRawViewerInit = initAll;
  document.addEventListener("DOMContentLoaded", initAll);
})();
