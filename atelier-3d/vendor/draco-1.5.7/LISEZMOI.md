# Draco 1.5.7 — décodeur seul

Décompresse les maillages `.drc` des éprouvettes de calibration
(`atelier-3d/calibration/modeles/`). Téléchargé une fois depuis
three.js 0.186.0 (`examples/jsm/libs/draco/`), jamais chargé depuis un CDN.

- `draco_wasm_wrapper.js` : la glue JavaScript. Une ligne a été ajoutée en fin
  de fichier, `export default DracoDecoderModule;`, pour l'importer en module
  comme le reste de l'atelier. Rien d'autre n'est modifié.
- `draco_decoder.wasm` : le décodeur.

Draco est publié par Google sous licence Apache 2.0.
https://github.com/google/draco
