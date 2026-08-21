// ui/contextMenu.js
// ─────────────────
// Petit menu flottant du CLIC DROIT. On lui passe une position écran et une
// liste d'actions ({ label, danger?, onClick }) ; il s'affiche à l'endroit du
// clic et se referme au prochain clic ailleurs (ou sur Échap). Sert à inspecter
// / supprimer rapidement une poutre, un point, un poids, un véhicule ou une
// colline, sans passer par un outil dédié.

let menuEl = null;
let dismiss = null;

export function initContextMenu() {
  menuEl = document.getElementById("context-menu");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideContextMenu();
  });
}

export function showContextMenu(clientX, clientY, items) {
  if (!menuEl) menuEl = document.getElementById("context-menu");
  if (!menuEl || !items || items.length === 0) return;

  menuEl.innerHTML = "";
  for (const item of items) {
    const button = document.createElement("button");
    button.className = "context-menu-item" + (item.danger ? " danger" : "");
    button.textContent = item.label;
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      hideContextMenu();
      item.onClick();
    });
    menuEl.appendChild(button);
  }

  // Affiche d'abord (hors écran) pour mesurer, puis recale dans la fenêtre.
  menuEl.hidden = false;
  menuEl.style.left = "0px";
  menuEl.style.top = "0px";
  const rect = menuEl.getBoundingClientRect();
  const x = Math.min(clientX, window.innerWidth - rect.width - 8);
  const y = Math.min(clientY, window.innerHeight - rect.height - 8);
  menuEl.style.left = `${Math.max(4, x)}px`;
  menuEl.style.top = `${Math.max(4, y)}px`;

  // Referme au prochain clic / clic droit ailleurs (au tick suivant pour ne pas
  // attraper le clic droit courant).
  setTimeout(() => {
    dismiss = () => hideContextMenu();
    window.addEventListener("pointerdown", dismiss, { once: true });
    window.addEventListener("contextmenu", dismiss, { once: true });
    window.addEventListener("blur", dismiss, { once: true });
  }, 0);
}

export function hideContextMenu() {
  if (menuEl) menuEl.hidden = true;
  if (dismiss) {
    window.removeEventListener("pointerdown", dismiss);
    window.removeEventListener("contextmenu", dismiss);
    window.removeEventListener("blur", dismiss);
    dismiss = null;
  }
}
