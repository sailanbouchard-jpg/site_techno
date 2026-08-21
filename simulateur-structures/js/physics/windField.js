// physics/windField.js
// ────────────────────
// CHAMP de vent : une grille GROSSIÈRE de vecteurs vitesse (vx, vy) couvrant la
// zone autour de la structure. C'est le cœur « fluide » simplifié : le vent
// arrive horizontal (vitesse du signal w) et est DÉVIÉ par les poutres selon
// leur orientation et leur SURFACE (épaisseur). But : un rendu à l'œil correct
// — le vent contourne ce qui lui est perpendiculaire, glisse le long de ce qui
// est dans son axe — SANS chercher la vérité physique, et SANS coupler encore la
// structure (les poutres ne bougent pas sous le vent pour l'instant).
//
// LÉGÈRETÉ : on ne calcule PAS le champ à chaque image. On le construit sur une
// grille grossière, puis les particules ne font que l'ÉCHANTILLONNER (bilinéaire,
// O(1)). Le champ n'est RECONSTRUIT que lorsque la vitesse du vent a NOTABLEMENT
// changé (voir windSim.js) : plusieurs fois par seconde par grand vent nerveux,
// ou pas du tout pendant 10 s par vent calme. Entre deux, il reste FIGÉ.
//
// Modèle de déviation (par cellule, linéaire et stable) : v = (w, 0) auquel
// chaque segment proche RETIRE sa composante NORMALE (le vent ne traverse pas la
// planche) et AJOUTE un glissement le long du segment (le flux file autour). Un
// segment horizontal (dans l'axe du vent) a une normale ~verticale → il ne
// retire quasi rien ; un segment vertical (perpendiculaire) retire tout le vent
// de face → forte déviation. C'est exactement l'effet pédagogique voulu.

// ── Constantes de réglage (l'« aspect » du vent, pas de physique vraie) ──
const CELL_SIZE = 1.0; // m : finesse de la grille (≈ une maille)
const MAX_CELLS_PER_AXIS = 200; // garde-fou mémoire/coût
const DOMAIN_MARGIN = 12; // m ajoutés autour de la structure
const MIN_DOMAIN_HALF_W = 24; // m : demi-largeur minimale du domaine
const MIN_DOMAIN_HALF_H = 15; // m : demi-hauteur minimale du domaine

// Rayon et force d'influence d'un segment, croissants avec son ÉPAISSEUR
// (surface exposée). Un câble fin dévie à peine ; une grosse poutre béton dévie
// large et fort.
function segmentInfluence(thickness) {
  const R = 0.7 + 4 * thickness; // m
  const strength = Math.max(0.35, Math.min(1.25, 0.4 + 6 * thickness));
  return { R, strength };
}
const TANGENTIAL_SLIP = 0.6; // part du flux bloqué renvoyée le long du segment
const BACKFLOW_LIMIT = 0.3; // reflux amont max (fraction de |w|) — anti-stagnation
const CROSS_LIMIT = 1.3; // déviation transverse max (fraction de |w|)

// Domaine couvert par le champ : boîte englobante de la structure + marge, avec
// une taille minimale (pour remplir l'écran même sur une petite structure).
export function computeWindDomain(structure) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of structure.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  if (!isFinite(minX)) { minX = -10; maxX = 10; minY = -8; maxY = 8; }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfW = Math.max(MIN_DOMAIN_HALF_W, (maxX - minX) / 2 + DOMAIN_MARGIN);
  const halfH = Math.max(MIN_DOMAIN_HALF_H, (maxY - minY) / 2 + DOMAIN_MARGIN);
  return { x0: cx - halfW, y0: cy - halfH, x1: cx + halfW, y1: cy + halfH };
}

// Liste PLATE des segments avec leur géométrie et leur influence, préparée une
// fois par reconstruction (évite de refouiller la structure par cellule).
function collectSegments(structure) {
  const thicknessByBeam = new Map();
  for (const b of structure.beams) thicknessByBeam.set(b.id, b.sectionArea || 0.1);

  const nodeById = new Map();
  for (const n of structure.nodes) nodeById.set(n.id, n);

  const segs = [];
  for (const s of structure.segments) {
    const a = nodeById.get(s.nodeAId);
    const b = nodeById.get(s.nodeBId);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) continue;
    const len = Math.sqrt(len2);
    const { R, strength } = segmentInfluence(thicknessByBeam.get(s.beamId) || 0.1);
    segs.push({
      ax: a.x, ay: a.y, dx, dy, len2, len,
      nx: -dy / len, ny: dx / len, // normale unitaire
      tx: dx / len, ty: dy / len, // tangente unitaire
      R2inv: 1 / (R * R), cut2: (3 * R) * (3 * R), strength,
    });
  }
  return segs;
}

// Construit le champ (grille) pour une vitesse de vent `speed` donnée et un
// domaine donné. Renvoie un objet échantillonnable par sampleWindField.
//
// OPTIMISATION (boucle INVERSÉE) : l'ancienne version testait TOUS les segments
// pour CHAQUE cellule — O(cellules × segments), soit des millions d'exp() à
// chaque reconstruction (pic de latence à chaque rafale). Or l'influence d'un
// segment est bornée (rayon de coupure 3R) et les déviations s'ACCUMULENT
// ADDITIVEMENT : on parcourt donc chaque SEGMENT et on n'ajoute sa contribution
// qu'aux cellules de sa boîte englobante élargie de 3R. Même maths, même ordre
// d'accumulation par cellule (ordre des segments) → champ IDENTIQUE, coût quasi
// linéaire en segments (~50-100× plus rapide sur une grande structure).
export function buildWindField(structure, speed, domain) {
  const width = domain.x1 - domain.x0;
  const height = domain.y1 - domain.y0;
  const cols = Math.max(2, Math.min(MAX_CELLS_PER_AXIS, Math.ceil(width / CELL_SIZE) + 1));
  const rows = Math.max(2, Math.min(MAX_CELLS_PER_AXIS, Math.ceil(height / CELL_SIZE) + 1));
  const cellX = width / (cols - 1);
  const cellY = height / (rows - 1);

  const count = cols * rows;
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const segs = collectSegments(structure);

  const S = speed;
  const absS = Math.abs(S);
  const sign = S >= 0 ? 1 : -1;

  // 1. Accumulation des déviations, segment par segment, cellules à portée.
  const accX = new Float64Array(count); // déviation accumulée en x
  const accY = new Float64Array(count); // déviation accumulée en y
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    const cut = Math.sqrt(s.cut2);
    // Boîte englobante du segment élargie du rayon de coupure, en indices.
    const bx0 = Math.min(s.ax, s.ax + s.dx) - cut;
    const bx1 = Math.max(s.ax, s.ax + s.dx) + cut;
    const by0 = Math.min(s.ay, s.ay + s.dy) - cut;
    const by1 = Math.max(s.ay, s.ay + s.dy) + cut;
    const i0 = Math.max(0, Math.ceil((bx0 - domain.x0) / cellX));
    const i1 = Math.min(cols - 1, Math.floor((bx1 - domain.x0) / cellX));
    const j0 = Math.max(0, Math.ceil((by0 - domain.y0) / cellY));
    const j1 = Math.min(rows - 1, Math.floor((by1 - domain.y0) / cellY));

    // Composante normale du vent de face (base = (S, 0)) à retirer, et sens du
    // glissement le long du segment : constants pour tout le segment.
    const vn = S * s.nx;
    const along = S * s.tx; // (S,0)·t
    const slipSign = along >= 0 ? 1 : -1;

    for (let j = j0; j <= j1; j++) {
      const py = domain.y0 + j * cellY;
      const rowBase = j * cols;
      for (let i = i0; i <= i1; i++) {
        const px = domain.x0 + i * cellX;
        // Point le plus proche du segment (projection bornée), puis distance².
        let u = ((px - s.ax) * s.dx + (py - s.ay) * s.dy) / s.len2;
        if (u < 0) u = 0; else if (u > 1) u = 1;
        const ddx = px - (s.ax + u * s.dx);
        const ddy = py - (s.ay + u * s.dy);
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > s.cut2) continue; // hors de portée : ignoré
        const f = s.strength * Math.exp(-d2 * s.R2inv);
        const blocked = f * vn;
        // Glissement : le flux bloqué repart le long du segment, dans le sens
        // qui prolonge l'écoulement.
        const mag = TANGENTIAL_SLIP * Math.abs(blocked) * slipSign;
        const idx = rowBase + i;
        accX[idx] -= blocked * s.nx;
        accX[idx] += mag * s.tx;
        accY[idx] -= blocked * s.ny;
        accY[idx] += mag * s.ty;
      }
    }
  }

  // 2. Finalisation par cellule : vent de base + déviation, bornée.
  const minAlong = -BACKFLOW_LIMIT * absS;
  const maxAlong = 1.7 * absS;
  const crossLim = CROSS_LIMIT * absS;
  for (let idx = 0; idx < count; idx++) {
    let fx = S + accX[idx];
    let fy = accY[idx];
    // Bornage (stabilité visuelle) : pas de reflux amont marqué, déviation
    // transverse plafonnée. Exprimé dans le repère du vent (sens = sign).
    let alongV = fx * sign; // composante dans l'axe du vent
    if (alongV < minAlong) alongV = minAlong; else if (alongV > maxAlong) alongV = maxAlong;
    fx = alongV * sign;
    if (fy < -crossLim) fy = -crossLim; else if (fy > crossLim) fy = crossLim;
    vx[idx] = fx;
    vy[idx] = fy;
  }

  return { x0: domain.x0, y0: domain.y0, cols, rows, cellX, cellY, vx, vy, speed: S, domain };
}

// Échantillonnage bilinéaire du champ en (x, y) (mètres monde). Hors domaine :
// on renvoie le vent de base non dévié. Écrit dans `out` {vx, vy} (sans alloc).
export function sampleWindField(field, x, y, out) {
  const gx = (x - field.x0) / field.cellX;
  const gy = (y - field.y0) / field.cellY;
  if (gx < 0 || gy < 0 || gx > field.cols - 1 || gy > field.rows - 1) {
    out.vx = field.speed;
    out.vy = 0;
    return out;
  }
  const i0 = Math.floor(gx);
  const j0 = Math.floor(gy);
  const i1 = Math.min(i0 + 1, field.cols - 1);
  const j1 = Math.min(j0 + 1, field.rows - 1);
  const fx = gx - i0;
  const fy = gy - j0;
  const c = field.cols;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const a = j0 * c + i0, b = j0 * c + i1, d = j1 * c + i0, e = j1 * c + i1;
  out.vx = field.vx[a] * w00 + field.vx[b] * w10 + field.vx[d] * w01 + field.vx[e] * w11;
  out.vy = field.vy[a] * w00 + field.vy[b] * w10 + field.vy[d] * w01 + field.vy[e] * w11;
  return out;
}
