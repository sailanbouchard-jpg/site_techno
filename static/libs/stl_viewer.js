/*
 * stl_viewer.js — Visualisateur STL 3D en WebGL pur (zéro dépendance).
 * -------------------------------------------------------------------
 * Auto-hébergé (aucun CDN). Rend chaque élément .block-obj3d de la page :
 *   - charge le fichier STL indiqué par data-stl (binaire ou ASCII)
 *   - couleur par face si le STL en contient (attribut 5-5-5, bit15 = valide),
 *     sinon couleur unie lue dans data-couleur-defaut
 *   - rotation à la souris/au doigt, molette = zoom, curseur = puissance lumière
 *
 * AUCUNE COULEUR N'EST ÉCRITE EN DUR ICI : le fond (data-fond), la couleur
 * par défaut (data-couleur-defaut) et l'intensité (data-lumiere) proviennent
 * du renderer Python, qui les lit dans la palette [obj3d].
 */
(function () {
  "use strict";

  // Ré-exécution (le bloc =3D> insère ce <script> une fois par page) : si déjà
  // chargé, on se contente d'initialiser les nouveaux blocs et on s'arrête.
  if (window.__stlViewerInit) { window.__stlViewerInit(); return; }

  // ── Maths 4×4 (column-major, comme l'attend WebGL) ──────────────────────────
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0,  0, f, 0, 0,
            0, 0, (far + near) * nf, -1,  0, 0, 2 * far * near * nf, 0];
  }
  function multiply(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
                     a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function translation(x, y, z) {
    return [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  x, y, z, 1];
  }
  function scaling(s) {
    return [s, 0, 0, 0,  0, s, 0, 0,  0, 0, s, 0,  0, 0, 0, 1];
  }
  function rotX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [1, 0, 0, 0,  0, c, s, 0,  0, -s, c, 0,  0, 0, 0, 1];
  }
  function rotY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, 0, -s, 0,  0, 1, 0, 0,  s, 0, c, 0,  0, 0, 0, 1];
  }
  function mat3from4(m) {   // partie rotation 3×3 (les blocs restent orthonormés)
    return [m[0], m[1], m[2],  m[4], m[5], m[6],  m[8], m[9], m[10]];
  }

  // ── Couleur hexadécimale → [r, g, b] normalisé ──────────────────────────────
  function hexToRgb(hex, fallback) {
    if (!hex) return fallback;
    let h = hex.trim().replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) return fallback;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // ── Lecture STL (binaire ou ASCII) ──────────────────────────────────────────
  // Retourne { positions:Float32Array, normals:Float32Array, colors:Float32Array,
  //            hasColors:bool }. Normales recalculées à plat (les STL les stockent
  //            souvent à zéro).
  function parseSTL(buffer, defColor) {
    const view = new DataView(buffer);
    const nTri = buffer.byteLength >= 84 ? view.getUint32(80, true) : 0;
    const isBinary = buffer.byteLength === 84 + nTri * 50 && nTri > 0;
    return isBinary ? parseBinary(view, nTri, defColor)
                    : parseAscii(new TextDecoder().decode(buffer), defColor);
  }

  function faceNormal(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    return [nx / L, ny / L, nz / L];
  }

  function parseBinary(view, nTri, defColor) {
    const positions = new Float32Array(nTri * 9);
    const normals   = new Float32Array(nTri * 9);
    const colors    = new Float32Array(nTri * 9);
    let hasColors = false, off = 84;
    for (let t = 0; t < nTri; t++) {
      off += 12; // on ignore la normale stockée (souvent nulle)
      const v = [];
      for (let i = 0; i < 9; i++) { v.push(view.getFloat32(off, true)); off += 4; }
      const attr = view.getUint16(off, true); off += 2;
      const n = faceNormal(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8]);
      // Couleur par face : bit15 = valide, R = bits10-14, V = bits5-9, B = bits0-4
      let col = defColor;
      if (attr & 0x8000) {
        hasColors = true;
        col = [((attr >> 10) & 31) / 31, ((attr >> 5) & 31) / 31, (attr & 31) / 31];
      }
      for (let k = 0; k < 3; k++) {
        const b = t * 9 + k * 3;
        positions[b] = v[k * 3]; positions[b + 1] = v[k * 3 + 1]; positions[b + 2] = v[k * 3 + 2];
        normals[b] = n[0]; normals[b + 1] = n[1]; normals[b + 2] = n[2];
        colors[b] = col[0]; colors[b + 1] = col[1]; colors[b + 2] = col[2];
      }
    }
    return { positions, normals, colors, hasColors };
  }

  function parseAscii(text, defColor) {
    const nums = [];
    const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
    let m;
    while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
    const nTri = Math.floor(nums.length / 9);
    const positions = new Float32Array(nTri * 9);
    const normals   = new Float32Array(nTri * 9);
    const colors    = new Float32Array(nTri * 9);
    for (let t = 0; t < nTri; t++) {
      const o = t * 9;
      for (let i = 0; i < 9; i++) positions[o + i] = nums[o + i];
      const n = faceNormal(nums[o], nums[o+1], nums[o+2], nums[o+3], nums[o+4],
                           nums[o+5], nums[o+6], nums[o+7], nums[o+8]);
      for (let k = 0; k < 3; k++) {
        const b = o + k * 3;
        normals[b] = n[0]; normals[b + 1] = n[1]; normals[b + 2] = n[2];
        colors[b] = defColor[0]; colors[b + 1] = defColor[1]; colors[b + 2] = defColor[2];
      }
    }
    return { positions, normals, colors, hasColors: false };
  }

  // ── Shaders (WebGL 1, éclairage deux faces) ────────────────────────────────
  const VERT =
    "attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor;" +
    "uniform mat4 uMVP; uniform mat3 uNormal;" +
    "varying vec3 vN; varying vec3 vColor;" +
    "void main(){ vN = normalize(uNormal * aNormal); vColor = aColor;" +
    "  gl_Position = uMVP * vec4(aPos, 1.0); }";

  const FRAG =
    "precision mediump float;" +
    "varying vec3 vN; varying vec3 vColor;" +
    "uniform vec3 uLightDir; uniform float uAmbient; uniform float uLight;" +
    "void main(){" +
    "  vec3 N = normalize(vN);" +
    "  float d = abs(dot(N, normalize(uLightDir)));" +   // deux faces : solide fermé
    "  float l = uAmbient + uLight * d;" +
    "  gl_FragColor = vec4(min(vColor * l, 1.0), 1.0);" +
    "}";

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  // ── Un visualisateur par élément ───────────────────────────────────────────
  function initOne(el) {
    el.setAttribute("data-obj3d-ready", "1");
    const canvas  = el.querySelector(".obj3d-canvas");
    const message = el.querySelector(".obj3d-message");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) { if (message) message.textContent = "Ton navigateur ne gère pas la 3D (WebGL)."; return; }

    const bg       = hexToRgb(el.dataset.fond, [0.93, 0.95, 0.97]);
    const defColor = hexToRgb(el.dataset.couleurDefaut, [0.7, 0.72, 0.75]);
    const ambient  = parseFloat(el.dataset.ambiance || "0.45");

    // Programme
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);
    const loc = {
      aPos:      gl.getAttribLocation(prog, "aPos"),
      aNormal:   gl.getAttribLocation(prog, "aNormal"),
      aColor:    gl.getAttribLocation(prog, "aColor"),
      uMVP:      gl.getUniformLocation(prog, "uMVP"),
      uNormal:   gl.getUniformLocation(prog, "uNormal"),
      uLightDir: gl.getUniformLocation(prog, "uLightDir"),
      uAmbient:  gl.getUniformLocation(prog, "uAmbient"),
      uLight:    gl.getUniformLocation(prog, "uLight"),
    };
    gl.enable(gl.DEPTH_TEST);

    // État de la caméra
    const state = {
      yaw: 0.6, pitch: -0.4, dist: 2.6,
      light: parseFloat(el.dataset.lumiere || "0.9"),
      center: [0, 0, 0], scale: 1, count: 0, ready: false,
    };

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!state.ready) return;

      const proj  = perspective(Math.PI / 4, w / h, 0.01, 100);
      const rot   = multiply(rotY(state.yaw), rotX(state.pitch));
      const model = multiply(scaling(state.scale),
                             translation(-state.center[0], -state.center[1], -state.center[2]));
      const view  = translation(0, 0, -state.dist);
      const mvp   = multiply(proj, multiply(view, multiply(rot, model)));
      gl.uniformMatrix4fv(loc.uMVP, false, mvp);
      gl.uniformMatrix3fv(loc.uNormal, false, mat3from4(rot));
      gl.uniform3f(loc.uLightDir, 0.35, 0.55, 0.75);
      gl.uniform1f(loc.uAmbient, ambient);
      gl.uniform1f(loc.uLight, state.light);
      gl.drawArrays(gl.TRIANGLES, 0, state.count);
    }

    function bindBuffer(data, attrLoc) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(attrLoc);
      gl.vertexAttribPointer(attrLoc, 3, gl.FLOAT, false, 0, 0);
    }

    // Chargement du STL
    draw(); // fond immédiat, avant l'arrivée du fichier
    fetch(el.dataset.stl)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (buf) {
        const geo = parseSTL(buf, defColor);
        state.count = geo.positions.length / 3;
        // Boîte englobante → centre + échelle pour rentrer dans une sphère unité
        let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < geo.positions.length; i += 3)
          for (let a = 0; a < 3; a++) {
            const p = geo.positions[i + a];
            if (p < mn[a]) mn[a] = p; if (p > mx[a]) mx[a] = p;
          }
        state.center = [(mn[0]+mx[0])/2, (mn[1]+mx[1])/2, (mn[2]+mx[2])/2];
        const radius = Math.hypot(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]) / 2 || 1;
        state.scale = 1 / radius;
        bindBuffer(geo.positions, loc.aPos);
        bindBuffer(geo.normals, loc.aNormal);
        bindBuffer(geo.colors, loc.aColor);
        state.ready = true;
        if (message) message.style.display = "none";
        draw();
      })
      .catch(function () { if (message) message.textContent = "Impossible de charger le modèle 3D."; });

    // ── Interactions ─────────────────────────────────────────────────────────
    let dragging = false, lastX = 0, lastY = 0;
    function down(x, y) { dragging = true; lastX = x; lastY = y; }
    function move(x, y) {
      if (!dragging) return;
      state.yaw   += (x - lastX) * 0.01;
      state.pitch += (y - lastY) * 0.01;
      const lim = Math.PI / 2 - 0.01;
      state.pitch = Math.max(-lim, Math.min(lim, state.pitch));
      lastX = x; lastY = y; draw();
    }
    function up() { dragging = false; }

    canvas.addEventListener("mousedown", function (e) { down(e.clientX, e.clientY); });
    window.addEventListener("mousemove", function (e) { move(e.clientX, e.clientY); });
    window.addEventListener("mouseup", up);
    canvas.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) { down(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
    }, { passive: false });
    canvas.addEventListener("touchmove", function (e) {
      if (e.touches.length === 1) { move(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
    }, { passive: false });
    canvas.addEventListener("touchend", up);
    canvas.addEventListener("wheel", function (e) {
      state.dist *= (1 + Math.sign(e.deltaY) * 0.1);
      state.dist = Math.max(1.1, Math.min(12, state.dist));
      draw(); e.preventDefault();
    }, { passive: false });

    // Contrôles fournis par le renderer (curseur lumière, boutons)
    const lightInput = el.querySelector(".obj3d-light");
    if (lightInput) {
      lightInput.value = state.light;
      lightInput.addEventListener("input", function () { state.light = parseFloat(lightInput.value); draw(); });
    }
    const reset = el.querySelector(".obj3d-reset");
    if (reset) reset.addEventListener("click", function () {
      state.yaw = 0.6; state.pitch = -0.4; state.dist = 2.6; draw();
    });
    el.querySelectorAll(".obj3d-zoom").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.dist *= btn.dataset.dir === "in" ? 0.85 : 1.18;
        state.dist = Math.max(1.1, Math.min(12, state.dist));
        draw();
      });
    });

    if (window.ResizeObserver) new ResizeObserver(draw).observe(canvas);
    else window.addEventListener("resize", draw);
  }

  function initAll() {
    document.querySelectorAll(".block-obj3d:not([data-obj3d-ready])").forEach(initOne);
  }
  window.__stlViewerInit = initAll;

  if (document.readyState !== "loading") initAll();
  else document.addEventListener("DOMContentLoaded", initAll);
})();
