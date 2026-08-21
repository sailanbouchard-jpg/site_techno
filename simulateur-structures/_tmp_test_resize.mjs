import { MESH, gridToWorld, BASE_COLS, applyWorldToMesh } from "./js/model/mesh.js";
import { createStructure, addBeam, addAnchorPoint, toggleAnchor, resizeWorldWidth,
         findJointAtGrid, findNodeById, jointBeamCount } from "./js/model/Structure.js";

let fails=0;
const eq=(a,b,m)=>{ if(Math.abs(a-b)>1e-9){console.log("FAIL:",m,"got",a,"want",b);fails++;} else console.log("ok:",m); };
const ok=(c,m)=>{ if(!c){console.log("FAIL:",m);fails++;} else console.log("ok:",m); };

const s = createStructure();
const beam = addBeam(s, {i:48,j:20}, {i:52,j:20}, "wood-thin");
const jA = findNodeById(s, beam.jointAId);
const jB = findNodeById(s, beam.jointBId);
const worldAx0 = jA.x, worldBx0 = jB.x;
eq(worldAx0, 24, "beam A world x before = 24 (i48*0.5)");
eq(worldBx0, 26, "beam B world x before = 26");
ok(s.world.cols===100 && s.world.originX===0, "initial world = base");

// Add a terrain part too
s.terrain.push({points:[{i:48,j:30},{i:52,j:30}]});

// WIDEN by 4 per side
const r1 = resizeWorldWidth(s, 4);
ok(r1===true, "widen applied");
eq(MESH.cols, 108, "cols=108 after +4 per side");
eq(MESH.originX, -2, "originX=-2 (shifted left by 4*0.5)");
// world positions preserved
eq(jA.x, worldAx0, "beam A world x unchanged after widen");
eq(jB.x, worldBx0, "beam B world x unchanged after widen");
// indices shifted +4
eq(jA.gridI, 52, "beam A gridI 48->52");
eq(beam.gridA.i, 52, "beam.gridA.i shifted");
eq(s.terrain[0].points[0].i, 52, "terrain i shifted");
// gridToWorld consistent with stored index
eq(gridToWorld(jA.gridI, jA.gridJ).x, jA.x, "gridToWorld(index) == node.x after widen");
eq(gridToWorld(s.terrain[0].points[0].i, 30).x, 24, "terrain gridToWorld world preserved (24)");
ok(s.world.cols===108 && s.world.originX===-2, "structure.world updated");

// findJointAtGrid uses new index
ok(findJointAtGrid(s, 52, 20) === jA, "findJointAtGrid finds A at new index 52");

// SHRINK back by 4 per side -> should succeed (nothing at edges now cols=108, cut=4 keep 4..104; min index=52 ok)
const r2 = resizeWorldWidth(s, -4);
ok(r2===true, "shrink applied");
eq(MESH.cols, 100, "cols back to 100");
eq(MESH.originX, 0, "originX back to 0");
eq(jA.gridI, 48, "index back to 48");
eq(jA.x, worldAx0, "world x still preserved after shrink");

// SHRINK that would cut into structure: shrink a lot until fails
// current cols=100, beam at i 48..52. Try -46 per side => cut 46, keep 46..54, index48..52 ok. Try -47 => keep 47..53, 48..52 ok. Try huge -> min cols bound
const before = MESH.cols;
const r3 = resizeWorldWidth(s, -40); // newCols=20 == MESH_MIN_COLS(40)? 100-80=20 <40 -> blocked by min
ok(r3===false, "shrink below MESH_MIN_COLS blocked");
eq(MESH.cols, before, "cols unchanged when blocked by min");

// Shrink that cuts structure: move: widen to give room then place beam near left edge
// Place an anchor near the far right to test occupancy block
const r4 = resizeWorldWidth(s, 4); // cols 108, indices+4 (A at 52)
addAnchorPoint(s, {i: MESH.cols, j: 10}); // anchor at right edge i=108
const r5 = resizeWorldWidth(s, -4); // would cut col 104..108 region -> anchor at 108 occupies -> blocked
ok(r5===false, "shrink blocked because anchor occupies removed columns");
eq(MESH.cols, 108, "cols unchanged when structure occupies edge");

// ANCHOR toggle on existing beam endpoint
ok(jA.fixed===false, "beam endpoint initially not fixed");
toggleAnchor(s, jA.id);
ok(jA.fixed===true, "toggleAnchor set endpoint fixed");
ok(jointBeamCount(s, jA.id) >= 1, "endpoint still has its beam");
toggleAnchor(s, jA.id);
ok(jA.fixed===false, "toggleAnchor un-anchors");

// applyWorldToMesh restores width (simulate load)
applyWorldToMesh({originX:-3, cols:112});
eq(MESH.cols,112,"applyWorldToMesh cols");
eq(MESH.originX,-3,"applyWorldToMesh originX");
applyWorldToMesh(undefined); // old save
eq(MESH.cols,100,"applyWorldToMesh undefined -> base cols");
eq(MESH.originX,0,"applyWorldToMesh undefined -> base originX");

console.log(fails===0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails===0?0:1);
