// model/MobileLoad.js
// ───────────────────
// Rôle : fabrique d'une charge mobile (voiture, camion, ou tout objet roulant
// défini par sa masse et sa puissance). Décrit uniquement la FORME des
// données — aucune formule physique ici, voir physics/vehicleMotion.js.
//
// distanceAlongPath : position le long de la "route" courante, mesurée depuis
// le nœud A de l'élément référencé par currentElementId (PAS une paire
// (élément, pourcentage) figée pour toujours : voir physics/vehicleMotion.js,
// qui rebase ces deux champs ensemble dès que la charge franchit la frontière
// de l'élément courant). On retrouve la position monde et la tangente
// correspondantes à la volée quand on en a besoin (voir
// physics/vehicleMotion.js::getCurrentRoadSegment).
//
// state : 'falling' tant que la charge n'a pas encore atteint sa route de
// départ (uniquement si fallHeight > 0 à la création), puis 'onRoad' tant
// qu'elle progresse le long d'une chaîne de routes connectées, puis
// 'fallenOff' si elle atteint la fin d'une route sans suite (chute libre,
// ne pousse plus aucune force sur la structure).
//
// `presetId` n'a aucun rôle physique : c'est la seule donnée qui permet à
// render/vehicleRenderer.js de savoir quelle taille/couleur dessiner sans
// deviner à partir de la masse (voir model/vehiclePresets.js).
// CHOIX: champ ajouté en plus du gabarit demandé, pour éviter une heuristique
// fragile (ex. "masse > 5000kg => camion") côté rendu.

export function createMobileLoad({
  id,
  mass,
  powerHp,
  referenceSpeed,
  startRoadElementId,
  startProgress,
  fallHeight = 0,
  presetId,
}) {
  return {
    id,
    mass, // kg
    powerHp, // chevaux — 0 = charge immobile (voir physics/vehicleMotion.js)
    referenceSpeed, // m/s — vitesse de croisière sur le plat
    startRoadElementId,
    startProgress, // 0..1 le long de l'élément de départ
    fallHeight, // m, hauteur de chute initiale (0 = posée directement sur la route)
    presetId,
    state: fallHeight > 0 ? "falling" : "onRoad",
    currentElementId: startRoadElementId,
    distanceAlongPath: 0, // recalculé par model/Structure.js::addMobileLoad si onRoad dès la création
    pathVelocity: 0, // m/s, signée (négative = recule)
    fallY: null, // initialisé par physics/vehicleMotion.js au premier pas si state="falling"
    fallVelocityY: 0,
  };
}
