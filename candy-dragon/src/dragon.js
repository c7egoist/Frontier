import * as THREE from 'three';
import {
  framesFromPoints, frameAt, tubeGeometry, sheetGeometry, finGeometry,
  gumdropGeometry, helixPath, basisQuaternion, placeForwardUp,
  sampleTable, clamp, lerp, smoothstep, rng, loftProfile,
} from './utils.js';
import { createMaterials } from './candy.js';

/* ================================================================== *
 *  CANDY DRAGON — a rearing confection
 *  poured sugar hide · opal crystal scales · raspberry-jelly crest
 *  spun-sugar wings · candy-cane bones · gilded claws
 * ================================================================== */

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* spine from the head base (t=0) down the neck, torso and into the
 * tail, which coils across the plinth. */
const SPINE = [
  [1.46, 3.92, 0.00],
  [1.42, 3.60, -0.01],
  [1.30, 3.28, -0.02],
  [1.10, 2.98, -0.02],
  [0.84, 2.70, 0.01],
  [0.52, 2.44, 0.04],
  [0.18, 2.20, 0.05],
  [-0.16, 1.96, 0.03],
  [-0.44, 1.70, -0.02],
  [-0.66, 1.44, -0.06],
  [-0.80, 1.16, -0.06],
  [-0.86, 0.90, -0.02],
  [-0.82, 0.64, 0.12],
  [-0.66, 0.46, 0.40],
  [-0.38, 0.36, 0.64],
  [0.00, 0.32, 0.78],
  [0.42, 0.34, 0.72],
  [0.76, 0.38, 0.48],
  [0.95, 0.46, 0.14],
  [1.00, 0.56, -0.18],
  [0.90, 0.70, -0.44],
];

const RADIUS = [
  [0.000, 0.205], [0.020, 0.222], [0.055, 0.244], [0.100, 0.262],
  [0.150, 0.292], [0.200, 0.345], [0.250, 0.420], [0.295, 0.505],
  [0.335, 0.590], [0.375, 0.638], [0.415, 0.660], [0.455, 0.655],
  [0.495, 0.635], [0.535, 0.612], [0.575, 0.600], [0.615, 0.612],
  [0.650, 0.600], [0.685, 0.560], [0.720, 0.500], [0.760, 0.430],
  [0.800, 0.355], [0.840, 0.285], [0.880, 0.215], [0.920, 0.150],
  [0.955, 0.095], [1.000, 0.040],
];

const bodyRadius = (t) => sampleTable(RADIUS, t);
const BODY_ELL = [0.90, 1.14];
const SHOULDER_T = 0.335;
const HIP_T = 0.615;

function surfacePoint(frames, t, angle, offset = 1, ellipse = BODY_ELL) {
  const f = frameAt(frames, t);
  const r = bodyRadius(t) * offset;
  const p = f.p.clone()
    .addScaledVector(f.N, Math.cos(angle) * r * ellipse[0])
    .addScaledVector(f.B, Math.sin(angle) * r * ellipse[1]);
  const n = f.N.clone().multiplyScalar(Math.cos(angle) / ellipse[0])
    .addScaledVector(f.B, Math.sin(angle) / ellipse[1]).normalize();
  return { p, n, f, r };
}

/* which way the chest/gullet points at spine parameter t */
/* which way the chest/gullet points at spine parameter t */
const VENTRAL_GUIDE = [
  [0.000, [0.62, -0.78, 0.0]],
  [0.060, [0.52, -0.85, 0.0]],
  [0.120, [0.38, -0.92, 0.0]],
  [0.200, [0.22, -0.97, 0.0]],
  [0.300, [0.08, -1.00, 0.0]],
  [0.420, [0.00, -1.00, 0.0]],
  [0.600, [0.00, -1.00, 0.0]],
  [0.800, [0.00, -1.00, 0.0]],
  [1.000, [0.20, -0.98, 0.0]],
];
const WORLD_SIDE = V3(0, 0, 1);

/**
 * The sculpture lies in the XY plane, so each cross-section is spanned by the
 * in-plane normal and by ±Z. This returns the angle around the body:
 *   0 = belly / throat,  ±PI = spine,  ±PI/2 = flanks
 * It needs no frame data, so it can never be flipped by frame roll.
 */
function bodyAngle(frames, t, p) {
  const f = frameAt(frames, t);
  const T = f.T.clone().setZ(0).normalize();
  const ventral = new THREE.Vector3(-T.y, T.x, 0).normalize();
  if (ventral.y > 0) ventral.negate();          // belly always points down
  // build a proper orthonormal cross-section basis: ventral and side
  const side = new THREE.Vector3().crossVectors(T, ventral).normalize();
  const d = new THREE.Vector3().subVectors(p, f.p);
  const down = d.dot(ventral);                  // + = belly side
  const across = d.dot(side);                   // ± = flanks
  return Math.atan2(across, down);              // 0 = belly, ±PI/2 = flank, ±PI = spine
}

/**
 * The sculpture is posed in the XY plane, so the body's cross-section is
 * spanned by (Z x tangent) and Z. The ventral (belly / throat) direction is
 * therefore just Z x tangent, projected into the cross-section.
 */
function ventralDir(frames, t) {
  const f = frameAt(frames, t);
  const T = f.T.clone().normalize();
  const v = new THREE.Vector3().crossVectors(WORLD_SIDE, T);
  if (v.lengthSq() < 1e-6) v.set(1, 0, 0);
  v.normalize();
  // the sculpture is planar: the belly always faces downward
  if (v.y > 0) v.negate();
  return v;
}

/** nearest spine parameter for an arbitrary world point */
function makeSpineLookup(frames) {
  const pts = frames.points;
  return (p, hint = null) => {
    let bestI = 0;
    let bestD = Infinity;
    if (hint !== null) {
      const c = Math.round(hint * frames.count);
      for (let i = Math.max(0, c - 12); i <= Math.min(frames.count, c + 12); i++) {
        const d = pts[i].distanceToSquared(p);
        if (d < bestD) { bestD = d; bestI = i; }
      }
    } else {
      for (let i = 0; i <= frames.count; i += 2) {
        const d = pts[i].distanceToSquared(p);
        if (d < bestD) { bestD = d; bestI = i; }
      }
    }
    return bestI / frames.count;
  };
}

/* the true dorsal / ventral line of the body, found by sampling the
 * cross-section each frame (robust where the frame's up vector rolls) */
function crestPoint(frames, t, offset = 1) {
  const f = frameAt(frames, t);
  const r = bodyRadius(t) * offset;
  const T = f.T.clone().setZ(0).normalize();
  let ventral = new THREE.Vector3(-T.y, T.x, 0).normalize();
  if (ventral.y > 0) ventral.negate();
  const up = ventral.clone().negate();
  const p = f.p.clone().addScaledVector(up, r * 1.0);
  return { p, n: up, f, r, up };
}

function bellyPoint(frames, t, spreadU, offset = 1) {
  const f = frameAt(frames, t);
  const r = bodyRadius(t) * offset;
  const down = ventralDir(frames, t);
  const across = new THREE.Vector3().crossVectors(down, f.T).normalize();
  const a = (spreadU * 2 - 1) * 0.78;
  const dir = down.clone().multiplyScalar(Math.cos(a)).addScaledVector(across, Math.sin(a));
  return f.p.clone().addScaledVector(dir, r * 1.03);
}

/* ------------------------------------------------------------------ *
 *  candy primitives
 * ------------------------------------------------------------------ */
function scaleGeometry(w = 0.3, h = 0.34, dome = 0.1) {
  return sheetGeometry((u, v) => {
    const width = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.60)), 0.85) * 0.5;
    const tip = 1 - Math.pow(u, 3.6) * 0.78;
    return V3(
      (v * 2 - 1) * w * width * tip,
      (u - 0.05) * h,
      dome * (1 - Math.pow(v * 2 - 1, 2)) * Math.sin(Math.PI * Math.pow(u, 0.75)) * tip
    );
  }, 5, 3);
}

/** tall jelly sail, built along +Y and swept back along -Z */
function sailGeometry(w, h, sweep, opts = {}) {
  const { thickness = 0.9, taper = 0.35 } = opts;
  return sheetGeometry((u, v) => {
    const s = (v * 2 - 1) * thickness;
    const ww = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.5)), 0.9) * (1 - u * taper);
    return V3(
      s * w * ww * 0.5,
      u * h,
      -Math.pow(u, 1.5) * sweep * h + 0.10 * Math.sin(u * Math.PI) * (1 - s * s) * w
    );
  }, 10, 3);
}

/** a jelly sail built directly in world space: no rotation guesswork */
function worldSail(origin, up, back, opts = {}) {
  const { w = 0.3, h = 0.6, sweep = 0.5, camber = 0.12, uSegs = 10, vSegs = 4 } = opts;
  const side = new THREE.Vector3().crossVectors(back, up).normalize();
  return sheetGeometry((u, v) => {
    const sv = (v * 2 - 1);
    const width = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.52)), 0.9) * (1 - u * 0.42) * w * 0.5;
    return origin.clone()
      .addScaledVector(side, sv * width)
      .addScaledVector(up, u * h)
      .addScaledVector(back, Math.pow(u, 1.6) * sweep * h)
      .addScaledVector(back, camber * Math.sin(u * Math.PI) * (1 - sv * sv) * w);
  }, uSegs, vSegs);
}

function clawGeometry(length = 0.3, radius = 0.05, curl = 0.6) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(V3(0, -t * length, Math.pow(t, 1.9) * length * curl));
  }
  return tubeGeometry(framesFromPoints(pts, 26), (t) => radius * Math.pow(1 - t, 0.75) + 0.002, 9);
}

/* ================================================================== *
 *  BUILD
 * ================================================================== */
export function buildDragon() {
  const M = createMaterials();
  const root = new THREE.Group();
  root.name = 'CandyDragon';
  const R = rng(31);

  const frames = framesFromPoints(SPINE.map((p) => V3(...p)), 420, 0.5);

  /* ================================================================ *
   *  TORSO
   * ================================================================ */
  const bodyGeo = tubeGeometry(frames, bodyRadius, 68, {
    ellipse: BODY_ELL,
    squash: (t, a) => {
      const chest = smoothstep(0.28, 0.36, t) * smoothstep(0.50, 0.40, t);
      const haunch = smoothstep(0.55, 0.62, t) * smoothstep(0.72, 0.66, t);
      const belly = Math.max(0, -Math.cos(a)) * 0.05;
      return 0.10 * chest + 0.06 * haunch + belly;
    },
  });
  {
    const pos = bodyGeo.attributes.position;
    const lookup = makeSpineLookup(frames);
    const col = [];
    const cream = new THREE.Color('#fff7f2');
    const pearl = new THREE.Color('#ffe4ef');
    const blush = new THREE.Color('#ffa8c9');
    const rose = new THREE.Color('#f0578f');
    const mid = new THREE.Color('#c11d68');
    const deep = new THREE.Color('#6e0736');
    const tmp = new THREE.Color();
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const t = lookup(p);
      const a = Math.abs(bodyAngle(frames, t, p));
      tmp.copy(cream)
        .lerp(pearl, smoothstep(0.24, 0.50, a))
        .lerp(blush, smoothstep(0.46, 0.74, a))
        .lerp(rose, smoothstep(0.70, 1.00, a))
        .lerp(mid, smoothstep(0.95, 1.55, a))
        .lerp(deep, smoothstep(2.30, 2.95, a));
      col.push(tmp.r, tmp.g, tmp.b);
    }
    bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const body = new THREE.Mesh(bodyGeo, M.bodyPainted);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  /* ---- opal crystal scales ---- */
  {
    const S = scaleGeometry(0.22, 0.34, 0.045);
    const rows = 96;
    const placements = [];
    for (let i = 0; i < rows; i++) {
      const t = 0.030 + (i / (rows - 1)) * 0.930;
      const f = frameAt(frames, t);
      const r = bodyRadius(t);
      const nSlots = Math.max(12, Math.round(34 * Math.pow(Math.min(1, r / 0.62), 0.85)));
      const stagger = (i % 2) * 0.5;
      for (let j = 0; j < nSlots; j++) {
        const a = ((j + stagger) / nSlots) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nrm = f.N.clone().multiplyScalar(ca / BODY_ELL[0])
          .addScaledVector(f.B, sa / BODY_ELL[1]).normalize();
        const p = f.p.clone()
          .addScaledVector(f.N, ca * r * BODY_ELL[0])
          .addScaledVector(f.B, sa * r * BODY_ELL[1]);
        // keep the pale gullet bare and stop at the flanks
        const ang = Math.abs(bodyAngle(frames, t, p));
        if (ang < 0.62) continue;
        placements.push({ t, r, p, n: nrm, f, a });
      }
    }
    const inst = new THREE.InstancedMesh(S, M.scaleMint, placements.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const cScale = new THREE.Color();
    const colAttr = new THREE.InstancedBufferAttribute(new Float32Array(placements.length * 3), 3);
    placements.forEach((pl, i) => {
      const { t, a, p, n, f, r } = pl;
      const neck = smoothstep(0.20, 0.01, t);
      const tail = smoothstep(0.88, 1.0, t);
      const size = (0.26 + 0.50 * Math.min(1, r / 0.60)) * (1 - 0.5 * tail) * (1 - 0.3 * neck);
      // local +Y points down the body toward the tail
      const downBody = f.T.clone().addScaledVector(n, -f.T.dot(n)).normalize();
      q.copy(basisQuaternion(n, downBody.clone().negate()));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), (R() - 0.5) * 0.25));
      m4.compose(p, q, V3(size, size * (0.95 + R() * 0.15), size * (0.85 + R() * 0.3)));
      inst.setMatrixAt(i, m4);

      const spineK = Math.pow(clamp((Math.abs(bodyAngle(frames, t, p)) - 1.9) / 1.1), 2.2);
      cScale.set('#ffe6f2');
      cScale.lerp(new THREE.Color('#8ef7e2'), 0.30 + R() * 0.35);
      cScale.lerp(new THREE.Color('#ffb3dc'), spineK * 0.45);
      cScale.lerp(new THREE.Color('#c3aeff'), 0.10 + R() * 0.12);
      colAttr.setXYZ(i, cScale.r, cScale.g, cScale.b);
    });
    inst.instanceColor = colAttr;
    inst.castShadow = true;
    root.add(inst);
  }

  /* ---- dorsal crest: jelly sails riding the spine, built in world space ---- */
  {
    const N = 120;
    const samples = [];
    for (let i = 0; i < N; i++) {
      const t = 0.13 + (i / (N - 1)) * 0.50;      // back + torso only
      const cp = crestPoint(frames, t, 0.985);
      if (cp.p.y < 0.75) continue;
      if (Math.abs(bodyAngle(frames, t, cp.p)) < 2.4) continue;
      samples.push({ t, ...cp });
    }
    const count = 30;
    for (let i = 0; i < count; i++) {
      const k = i / (count - 1);
      const { p, f } = samples[Math.min(samples.length - 1, Math.round(k * (samples.length - 1)))];
      const up = ventralDir(frames, samples[Math.min(samples.length - 1, Math.round(k * (samples.length - 1)))].t).negate();
      const back = f.T.clone();   // +T runs head -> tail, so this sweeps toward the tail
      const wave = Math.sin(Math.PI * clamp(k * 0.90 + 0.10));
      const scale = 0.50 + 0.42 * wave;
      const sail = new THREE.Mesh(worldSail(p, up, back, {
        w: 0.40 * scale, h: 0.44 * scale, sweep: 0.34, camber: 0.12,
      }), M.jelly);
      sail.castShadow = true;
      root.add(sail);
      if (i % 2 === 0) {
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), i % 4 === 0 ? M.ember : M.lollipopGold);
        bead.position.copy(p).addScaledVector(up, 0.02);
        root.add(bead);
      }
    }
  }

  /* ---- tail fan: a vertical jelly paddle standing at the tail tip ---- */
  {
    const f = frameAt(frames, 1.0);
    const origin = f.p.clone();
    const out = f.T.clone();                 // points away from the body
    const up = V3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(out, up).normalize();
    const up2 = new THREE.Vector3().crossVectors(side, out).normalize();
    const grp = new THREE.Group();
    const shape = (mul = 1) => sheetGeometry((u, v) => {
      const sv = v * 2 - 1;
      const w = Math.sin(Math.PI * Math.pow(u, 0.45)) * (0.32 + 0.68 * Math.sqrt(Math.abs(sv)));
      return V3(0, 0, 0)
        .addScaledVector(out, u * 0.66 * mul)
        .addScaledVector(up2, u * u * 0.24 + Math.sin(u * Math.PI) * 0.10)
        .addScaledVector(side, sv * w * 0.34 * mul);
    }, 26, 16);
    const fan = new THREE.Mesh(shape(), M.jelly);
    fan.castShadow = true;
    grp.add(fan);
    // gilded ribs fanning through the paddle
    for (let i = 0; i < 5; i++) {
      const sv = (i - 2) / 2;
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const u = k / 12;
        const w = Math.sin(Math.PI * Math.pow(u, 0.45)) * (0.32 + 0.68 * Math.sqrt(Math.abs(sv)));
        pts.push(origin.clone()
          .addScaledVector(out, u * 0.64)
          .addScaledVector(up2, u * u * 0.24 + Math.sin(u * Math.PI) * 0.10)
          .addScaledVector(side, sv * w * 0.32));
      }
      grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.020, 6), M.gold));
    }
    for (let i = 0; i < 5; i++) {
      const u = (i + 0.5) / 5;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.030, 10, 8), i % 2 ? M.ember : M.lollipopGold);
      bead.position.copy(origin)
        .addScaledVector(out, u * 0.62)
        .addScaledVector(up2, u * u * 0.24 + Math.sin(u * Math.PI) * 0.11);
      grp.add(bead);
    }
    root.add(grp);
  }

  /* ================================================================ *
   *  LIMBS
   * ================================================================ */
  function limb(a, b, r0, r1, mat, midPull = V3(0, 0, 0)) {
    const mid = a.clone().lerp(b, 0.5).add(midPull);
    const fr = framesFromPoints([a, mid, b], 60);
    const mesh = new THREE.Mesh(tubeGeometry(fr, (t) => lerp(r0, r1, Math.pow(t, 0.85)), 22, { ellipse: [1, 1.05] }), mat);
    mesh.castShadow = true;
    return { mesh, fr };
  }
  function paw(pos, radius, forward, claws = 3, toeLen = 0.32) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), M.body);
    pad.scale.set(1.1, 0.8, 1.25);
    g.add(pad);
    const q = basisQuaternion(forward.clone().normalize(), V3(0, 1, 0));
    for (let i = 0; i < claws; i++) {
      const toe = new THREE.Group();
      toe.quaternion.copy(q);
      toe.rotateY((i - (claws - 1) / 2) * 0.48);
      toe.rotateX(0.95);
      const kn = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.34, 12, 10), M.body);
      kn.position.set(0, -radius * 0.28, 0);
      toe.add(kn);
      const claw = new THREE.Mesh(clawGeometry(toeLen * (i === 1 ? 1.1 : 0.9), radius * 0.28, 0.55), M.gold);
      claw.position.set(0, -radius * 0.2, 0);
      toe.add(claw);
      g.add(toe);
    }
    root.add(g);
    return g;
  }

  // hind legs — crouched, claws gripping the plinth
  for (const s of [1, -1]) {
    const hip = surfacePoint(frames, HIP_T, Math.PI / 2 * s, 0.60).p;
    const knee = V3(-1.10, 0.92, 0.72 * s);
    const ankle = V3(-0.80, 0.44, 0.90 * s);
    const foot = V3(-0.40, 0.24, 0.86 * s);
    root.add(limb(hip, knee, 0.34, 0.24, M.body, V3(0.02, 0.05, 0.08 * s)).mesh);
    const kc = new THREE.Mesh(new THREE.SphereGeometry(0.215, 20, 14), M.body);
    kc.position.copy(knee);
    root.add(kc);
    root.add(limb(knee, ankle, 0.20, 0.14, M.body, V3(-0.05, -0.03, 0)).mesh);
    root.add(limb(ankle, foot, 0.14, 0.13, M.body).mesh);
    paw(foot, 0.15, V3(1, -0.5, 0.28 * s), 3, 0.32);
  }
  // fore legs — tucked up, claws curled
  for (const s of [1, -1]) {
    const shoulder = surfacePoint(frames, SHOULDER_T + 0.04, Math.PI / 2 * s, 0.52).p;
    const elbow = V3(0.62, 2.02, 0.58 * s);
    const hand = V3(1.02, 1.78, 0.46 * s);
    root.add(limb(shoulder, elbow, 0.19, 0.145, M.body, V3(0.05, -0.03, 0.04 * s)).mesh);
    root.add(limb(elbow, hand, 0.14, 0.11, M.body, V3(0.04, -0.02, 0)).mesh);
    paw(hand, 0.115, V3(0.75, -0.80, 0.25 * s), 3, 0.26);
  }

  /* ================================================================ *
   *  WINGS — arm up, five candy-cane fingers fanning out and back,
   *  sugar-glass membranes between them.
   * ================================================================ */
  const wingRigs = [];
  function buildWing(side) {
    const P = (x, y, z) => V3(x, y, z * side);
    const shoulder = new THREE.Group();
    const armGroup = new THREE.Group();
    const handGroup = new THREE.Group();
    shoulder.add(armGroup);
    armGroup.add(handGroup);

    const elbow = P(0.16, 0.52, 1.16);
    const wrist = P(-0.02, 1.66, 1.92);
    const armPts = [V3(0, 0, 0), elbow, wrist];
    const armCurve = new THREE.CatmullRomCurve3(armPts, false, 'centripetal');

    const fingerTips = [
      P(0.92, 2.62, 2.32),
      P(0.42, 2.78, 3.12),
      P(-0.34, 2.34, 3.52),
      P(-1.02, 1.34, 3.34),
      P(-1.28, 0.28, 2.62),
    ];
    const fingerCurves = fingerTips.map((tip, i) => {
      const mid = wrist.clone().lerp(tip, 0.55).add(V3(0.06, 0.10 - i * 0.02, 0));
      return new THREE.CatmullRomCurve3([wrist.clone(), mid, tip], false, 'centripetal');
    });

    /* arm bones with a candy-cane thread */
    {
      const rfn = (t) => sampleTable([[0, 0.205], [0.15, 0.185], [0.5, 0.145], [0.85, 0.118], [1, 0.125]], t);
      const fr = framesFromPoints(armPts, 90);
      const armMesh = new THREE.Mesh(tubeGeometry(fr, rfn, 22), M.body);
      armMesh.castShadow = true;
      armGroup.add(armMesh);
      armGroup.add(new THREE.Mesh(
        new THREE.TubeGeometry(helixPath(fr, rfn, { turns: 11, tubeR: 0.026, start: 0.03, end: 0.98 }), 320, 0.028, 6, false),
        M.candyStripe
      ));
      // pauldron: a swirl lollipop against the shoulder
      const pauldron = new THREE.Group();
      pauldron.position.copy(P(-0.04, 0.02, 0.06));
      pauldron.rotation.y = Math.PI / 2;
      pauldron.add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.065, 44), M.lollipop));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.034, 10, 44), M.gold);
      rim.rotation.x = Math.PI / 2;
      pauldron.add(rim);
      armGroup.add(pauldron);
      // elbow candy ring
      const el = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 10, 24), M.lollipopGold);
      el.position.copy(elbow);
      el.rotation.set(0.4, Math.PI / 2, 0.2);
      armGroup.add(el);
      // wrist gumdrop + gilded barbs
      const wc = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 14), M.candyStripeMint);
      wc.position.copy(wrist);
      handGroup.add(wc);
      for (let i = 0; i < 3; i++) {
        const spike = new THREE.Mesh(clawGeometry(0.30 - i * 0.05, 0.04, 0.75), M.gold);
        spike.position.copy(wrist);
        spike.rotation.set(-1.1 + i * 0.35, 0, 0.25 * side);
        handGroup.add(spike);
      }
    }

    /* fingers */
    fingerCurves.forEach((curve, i) => {
      const fr = framesFromPoints(curve.getPoints(38), 66);
      const r0 = i === 0 ? 0.072 : 0.105 - i * 0.014;
      const mesh = new THREE.Mesh(
        tubeGeometry(fr, (t) => lerp(r0, 0.014, Math.pow(t, 0.82)), 12),
        i === 0 ? M.candyStripeMint : M.gold
      );
      mesh.castShadow = true;
      handGroup.add(mesh);
      for (let k = 1; k <= 2; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(r0 * (1.25 - k * 0.22), 12, 10), k === 1 ? M.lollipop : M.lollipopGold);
        b.position.copy(curve.getPoint(k * 0.34));
        handGroup.add(b);
      }
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.ember);
      tip.position.copy(curve.getPoint(1));
      handGroup.add(tip);
    });

    /* membranes */
    const membrane = (cA, cB, opts = {}) => {
      const { sag = 0.16, uEnd = 1.0, scallops = 2, tint = 0, billow = 0.07 } = opts;
      const geo = sheetGeometry((u, v) => {
        const uu = u * uEnd;
        const A = cA.getPoint(clamp(uu));
        const B = cB.getPoint(clamp(uu));
        const p = A.clone().lerp(B, v);
        const env = Math.sin(Math.PI * uu) * Math.sin(Math.PI * v);
        p.y -= sag * env;
        p.z += billow * env * side;
        if (uu > 0.90) {
          p.z -= Math.pow((uu - 0.90) / 0.10, 1.3) * Math.sin(Math.PI * v * scallops) * 0.24 * side;
        }
        return p;
      }, 40, 18);
      const uvA = geo.attributes.uv;
      const col = [];
      const cDeep = new THREE.Color('#e81f76');
      const cLite = new THREE.Color('#ffd8ee');
      const cGold = new THREE.Color('#ffcf90');
      for (let i = 0; i < uvA.count; i++) {
        const u = uvA.getX(i), v = uvA.getY(i);
        const edge = Math.max(Math.pow(1 - Math.abs(v * 2 - 1), 1.4), Math.pow(u, 2.2));
        const c = cLite.clone().lerp(cDeep, 0.30 + edge * 0.55);
        c.lerp(cGold, tint * (1 - u) * 0.35);
        col.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, M.membrane);
      mesh.renderOrder = 4;
      return mesh;
    };

    handGroup.add(membrane(fingerCurves[0], fingerCurves[1], { sag: 0.14, scallops: 2, uEnd: 0.94 }));
    handGroup.add(membrane(fingerCurves[1], fingerCurves[2], { sag: 0.18, scallops: 2 }));
    handGroup.add(membrane(fingerCurves[2], fingerCurves[3], { sag: 0.20, scallops: 2 }));
    handGroup.add(membrane(fingerCurves[3], fingerCurves[4], { sag: 0.16, scallops: 1, tint: 0.5 }));
    // trailing sail down toward the flank
    // short trailing membrane tucked behind the last finger
    const trail = new THREE.CatmullRomCurve3([
      wrist.clone(),
      P(-1.34, -0.10, 1.78),
      P(-1.42, -0.62, 1.22),
      P(-1.30, -1.00, 0.66),
    ], false, 'centripetal');
    handGroup.add(membrane(fingerCurves[4], trail, { sag: 0.06, scallops: 1, tint: 1, uEnd: 0.86 }));

    /* embers along the leading edge */
    for (let i = 0; i < 9; i++) {
      const p = armCurve.getPoint(0.08 + i * 0.1);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 6), M.ember);
      b.position.copy(p).add(V3(0, 0.09, 0.04 * side));
      armGroup.add(b);
    }

    shoulder.userData = { armGroup, handGroup, side };
    return shoulder;
  }

  for (const s of [1, -1]) {
    const wing = buildWing(s);
    wing.position.copy(surfacePoint(frames, 0.345, Math.PI / 2 * s, 0.62).p);
    // a touch of outward cant so the sails clear the body
    wing.rotation.z = -0.16 * s;
    wing.rotation.x = -0.06;
    wing.rotation.y = 0.10 * s;
    root.add(wing);
    wingRigs.push({ wing, side: s, base: wing.quaternion.clone() });
  }

  /* ================================================================ *
   *  HEAD — lofted from a dragon silhouette
   * ================================================================ */
  const head = new THREE.Group();
  const headGeo = new THREE.Group();
  headGeo.rotation.y = -Math.PI / 2;
  head.add(headGeo);

  const jaw = new THREE.Group();
  const eyes = [];
  let mouthGlow = null;

  const PROF = [
    { x: -0.60, top: 0.11, bottom: -0.02, halfWidth: 0.055 },
    { x: -0.48, top: 0.24, bottom: -0.10, halfWidth: 0.150 },
    { x: -0.32, top: 0.335, bottom: -0.20, halfWidth: 0.250 },
    { x: -0.12, top: 0.375, bottom: -0.26, halfWidth: 0.300 },
    { x: 0.08, top: 0.375, bottom: -0.28, halfWidth: 0.292 },
    { x: 0.28, top: 0.330, bottom: -0.265, halfWidth: 0.250 },
    { x: 0.44, top: 0.270, bottom: -0.235, halfWidth: 0.200 },
    { x: 0.62, top: 0.232, bottom: -0.215, halfWidth: 0.178 },
    { x: 0.80, top: 0.212, bottom: -0.195, halfWidth: 0.160 },
    { x: 0.94, top: 0.198, bottom: -0.168, halfWidth: 0.146 },
    { x: 1.02, top: 0.170, bottom: -0.110, halfWidth: 0.120 },
    { x: 1.07, top: 0.105, bottom: -0.030, halfWidth: 0.070 },
  ];
  const profTop = (x) => sampleTable(PROF.map((p) => [p.x, p.top]), x);
  const profBot = (x) => sampleTable(PROF.map((p) => [p.x, p.bottom]), x);
  const profHW = (x) => sampleTable(PROF.map((p) => [p.x, p.halfWidth]), x);

  {
    const skullGeo = loftProfile(PROF, { xSegs: 96, radial: 42, power: 2.5, backPower: 2.8 });
    {
      const pos = skullGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (y < -0.10) pos.setY(i, y + clamp((-y - 0.10) / 0.20) * 0.05);
        const snout = smoothstep(0.2, 1.0, x);
        if (y > 0) pos.setY(i, y + snout * 0.05 * Math.exp(-Math.pow(z / 0.07, 2)));
      }
      skullGeo.computeVertexNormals();
    }
    const skull = new THREE.Mesh(skullGeo, M.body);
    skull.castShadow = true;
    headGeo.add(skull);

    // brow ridges (short wedges that sit *above* each eye, not across the face)
    for (const s2 of [-1, 1]) {
      const bc = new THREE.CatmullRomCurve3([
        V3(0.06, 0.330, 0.200 * s2), V3(0.20, 0.322, 0.238 * s2), V3(0.34, 0.268, 0.212 * s2),
      ]);
      const bFr = framesFromPoints(bc.getPoints(20), 40);
      const brow = new THREE.Mesh(tubeGeometry(bFr, (t) => 0.055 * Math.sin(Math.PI * (0.15 + t * 0.85)) + 0.012, 10, { ellipse: [1.3, 0.75] }), M.body);
      brow.castShadow = true;
      headGeo.add(brow);
      // cheek scale plates
      for (let i = 0; i < 3; i++) {
        const sc = new THREE.Mesh(scaleGeometry(0.18, 0.22, 0.05), M.scaleMint);
        sc.position.set(-0.06 - i * 0.13, 0.06 - i * 0.025, (0.245 - i * 0.012) * s2);
        sc.rotation.set(-0.10, -1.30 * s2, -0.15 * s2);
        sc.scale.setScalar(1.25);
        headGeo.add(sc);
      }
    }

    // nostril embers
    for (const s2 of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.030, 12, 10), M.ember);
      n.scale.set(1.7, 0.55, 1.0);
      n.position.set(0.955, 0.095, 0.058 * s2);
      headGeo.add(n);
    }
    // little snout horn
    const nh = new THREE.Mesh(clawGeometry(0.17, 0.036, 0.5), M.gold);
    nh.position.set(0.82, profTop(0.82) + 0.01, 0);
    nh.rotation.set(0, 0, -0.6);
    headGeo.add(nh);

    /* gilded ridge + candy-cane stripes down the snout */
    {
      const pts = [];
      for (let i = 0; i <= 18; i++) {
        const x = 0.26 + (i / 18) * 0.86;
        pts.push(V3(x, profTop(x) + 0.005, 0));
      }
      headGeo.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.019, 6), M.gold));
      for (let i = 0; i < 5; i++) {
        const x = 0.38 + i * 0.15;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.029, 10, 8), i % 2 ? M.ember : M.lollipopGold);
        bead.position.set(x, profTop(x) + 0.018, 0);
        headGeo.add(bead);
      }
      for (const s2 of [-1, 1]) {
        const sp = [];
        for (let i = 0; i <= 18; i++) {
          const x = 0.26 + (i / 18) * 0.86;
          const cy = (profTop(x) + profBot(x)) * 0.5;
          const hh = (profTop(x) - profBot(x)) * 0.5;
          sp.push(V3(x, cy + hh * 0.58, hh * 0.60 * s2));
        }
        headGeo.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 52, 0.014, 5), M.candyStripe));
      }
    }

    /* eyes */
    for (const s2 of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(0.245, 0.185, 0.196 * s2);
      g.rotation.set(0, -0.50 * s2, 0.16);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.082, 26, 18), M.eye));
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.078, 20, 16), M.eyePupil);
      pupil.scale.set(0.28, 1.02, 0.46);
      pupil.position.set(0.050, 0.002, 0.020 * s2);
      g.add(pupil);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.015, 8, 28), M.gold);
      rim.rotation.y = Math.PI / 2;
      rim.position.set(0.038, 0.0, 0.006 * s2);
      g.add(rim);
      // tiny sugar highlight bead on the eyeball
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      hl.position.set(0.062, 0.034, 0.026 * s2);
      g.add(hl);
      g.userData = { side: s2 };
      headGeo.add(g);
      eyes.push(g);
      // brow spike
      const bs = new THREE.Mesh(clawGeometry(0.30, 0.048, 0.85), M.gold);
      bs.position.set(0.20, 0.345, 0.235 * s2);
      bs.rotation.set(-0.35, 0, -0.95 * s2);
      headGeo.add(bs);
    }

    /* lower jaw */
    jaw.position.set(-0.12, -0.215, 0);
    const JAW = [
      { x: -0.40, top: 0.055, bottom: 0.00, halfWidth: 0.060 },
      { x: -0.26, top: 0.100, bottom: -0.05, halfWidth: 0.170 },
      { x: -0.04, top: 0.115, bottom: -0.10, halfWidth: 0.225 },
      { x: 0.24, top: 0.105, bottom: -0.10, halfWidth: 0.205 },
      { x: 0.54, top: 0.090, bottom: -0.080, halfWidth: 0.176 },
      { x: 0.80, top: 0.072, bottom: -0.055, halfWidth: 0.146 },
      { x: 0.94, top: 0.058, bottom: -0.025, halfWidth: 0.108 },
      { x: 1.00, top: 0.034, bottom: 0.004, halfWidth: 0.052 },
    ];
    const jawMesh = new THREE.Mesh(loftProfile(JAW, { xSegs: 64, radial: 28, power: 2.4 }), M.body);
    jawMesh.castShadow = true;
    jaw.add(jawMesh);
    // gold chin whiskers
    for (const s2 of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const bc = new THREE.CatmullRomCurve3([
          V3(0.32 + i * 0.16, -0.06, 0.09 * s2),
          V3(0.16 + i * 0.16, -0.13, 0.14 * s2),
          V3(-0.02 + i * 0.16, -0.19, 0.17 * s2),
        ]);
        jaw.add(new THREE.Mesh(tubeGeometry(framesFromPoints(bc.getPoints(14), 26), (t) => 0.026 * (1 - t) + 0.004, 8), M.gold));
      }
    }
    // teeth
    for (let i = 0; i < 7; i++) {
      for (const s2 of [-1, 1]) {
        const lower = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.055 - i * 0.004, 7), M.trim);
        lower.position.set(0.22 + i * 0.10, 0.085, (0.085 - i * 0.006) * s2);
        jaw.add(lower);
        const upper = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.062 - i * 0.005, 7), M.trim);
        upper.position.set(0.20 + i * 0.10, -0.112, (0.105 - i * 0.006) * s2);
        headGeo.add(upper);
      }
    }
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 12), M.ember);
    tongue.scale.set(2.9, 0.28, 0.70);
    tongue.position.set(0.42, 0.03, 0);
    jaw.add(tongue);
    headGeo.add(jaw);

    /* mouth cavity + furnace glow */
    const cav = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 18),
      new THREE.MeshStandardMaterial({ color: '#33020f', roughness: 0.85 }));
    cav.scale.set(2.1, 0.50, 0.60);
    cav.position.set(0.50, -0.10, 0);
    headGeo.add(cav);
    mouthGlow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ff9a3a'), transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
    mouthGlow.position.set(0.42, -0.10, 0);
    headGeo.add(mouthGlow);

    /* crown horns */
    const hornDefs = [
      { pts: [[-0.02, 0.30, 0.13], [-0.30, 0.52, 0.17], [-0.72, 0.64, 0.19], [-1.14, 0.62, 0.18], [-1.46, 0.50, 0.15]], r: 0.086, big: true },
      { pts: [[-0.20, 0.20, 0.23], [-0.50, 0.30, 0.33], [-0.88, 0.26, 0.38], [-1.16, 0.12, 0.36]], r: 0.050 },
    ];
    for (const s2 of [-1, 1]) {
      hornDefs.forEach((hd, idx) => {
        const pts = hd.pts.map((p2) => V3(p2[0], p2[1], p2[2] * s2));
        const fr = framesFromPoints(pts, 100);
        const rr = (t) => hd.r * Math.pow(1 - t, 0.62) + 0.004;
        const horn = new THREE.Mesh(tubeGeometry(fr, rr, 18), M.horn);
        horn.castShadow = true;
        headGeo.add(horn);
        for (let i = 0; i < 9; i++) {
          const t = 0.05 + i * 0.10;
          const f = frameAt(fr, t);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(rr(t) * 1.06, 0.009, 6, 18), M.gold);
          placeForwardUp(ring, f.p, f.T, f.N);
          ring.rotateX(Math.PI / 2);
          headGeo.add(ring);
        }
        if (hd.big) {
          headGeo.add(new THREE.Mesh(
            new THREE.TubeGeometry(helixPath(fr, rr, { turns: 15, tubeR: 0.014, start: 0.03, end: 0.93 }), 300, 0.015, 5, false),
            M.hornStripe
          ));
        }
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), M.ember);
        bead.position.copy(pts[pts.length - 1]);
        headGeo.add(bead);
      });
    }

    /* skull crest blades */
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Mesh(sailGeometry(0.12, 0.24 - i * 0.03, 0.75, { thickness: 1.0 }), M.jelly);
      sp.position.set(-0.06 - i * 0.10, 0.30 - i * 0.035, 0);
      sp.rotation.z = Math.PI * 0.5 - 0.30 + i * 0.05;
      headGeo.add(sp);
    }

  }

  /* orient the head at the neck tip */
  {
    const f = frameAt(frames, 0.0);
    head.position.copy(f.p).addScaledVector(f.T.clone().negate(), 0.08);
    const forward = V3(0.95, -0.18, 0.02).normalize();
    const up = V3(0.18, 0.98, 0).normalize();
    head.quaternion.copy(basisQuaternion(forward, up));
    head.scale.setScalar(1.42);
  }
  root.add(head);

  /* ================================================================ *
   *  LIGHTS, SPARKS, PEDESTAL
   * ================================================================ */
  const glow = new THREE.PointLight(new THREE.Color('#ff8a3d'), 3.0, 8, 2);
  glow.position.set(1.35, 4.45, 0.2);
  root.add(glow);

  // a soft rose uplight inside the pedestal, so the candy glows from beneath
  const upLight = new THREE.PointLight(new THREE.Color('#ff4f9e'), 2.2, 6.5, 2);
  upLight.position.set(0, 0.28, 0);
  root.add(upLight);

  // cold mint rim light behind the wings
  const rimLight = new THREE.PointLight(new THREE.Color('#6ff0d6'), 1.6, 9, 2);
  rimLight.position.set(-1.4, 3.2, -3.4);
  root.add(rimLight);

  const sparkCount = 640;
  const sparkGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(sparkCount * 3);
  const sCol = new Float32Array(sparkCount * 3);
  const sPhase = new Float32Array(sparkCount);
  const sSpeed = new Float32Array(sparkCount);
  const sRadius = new Float32Array(sparkCount);
  const sBase = new Float32Array(sparkCount * 3);
  const cA = new THREE.Color('#ff9ad5');
  const cB = new THREE.Color('#8ffbe3');
  const cC = new THREE.Color('#ffe9a8');
  for (let i = 0; i < sparkCount; i++) {
    const a = R() * Math.PI * 2;
    const rad = 1.2 + R() * 4.0;
    const y = 0.3 + R() * 5.0;
    sBase[i * 3] = Math.cos(a) * rad;
    sBase[i * 3 + 1] = y;
    sBase[i * 3 + 2] = Math.sin(a) * rad;
    sPhase[i] = R() * Math.PI * 2;
    sSpeed[i] = 0.15 + R() * 0.5;
    sRadius[i] = rad;
    sPos.set([sBase[i * 3], y, sBase[i * 3 + 2]], i * 3);
    const c = R() < 0.45 ? cA : R() < 0.8 ? cC : cB;
    const k = 0.5 + R() * 0.5;
    sCol[i * 3] = c.r * k;
    sCol[i * 3 + 1] = c.g * k;
    sCol[i * 3 + 2] = c.b * k;
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const sparks = new THREE.Points(sparkGeo, M.spark);
  sparks.frustumCulled = false;
  root.add(sparks);

  const pedestal = new THREE.Group();
  {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.95, 0.18, 96), M.pedestalTop);
    pedestal.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.76, 0.055, 10, 140), M.trim);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.09;
    pedestal.add(rim);
    const bodyP = new THREE.Mesh(new THREE.CylinderGeometry(2.90, 2.35, 0.60, 96, 1, true), M.pedestal);
    bodyP.position.y = -0.33;
    pedestal.add(bodyP);
    const under = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.10, 0.14, 96), M.trim);
    under.position.y = -0.66;
    pedestal.add(under);
    // leaning candy canes
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * 2.52, 0.09, Math.sin(a) * 2.52);
      g.rotation.y = -a;
      g.rotation.z = 0.18;
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        pts.push(V3(Math.sin(t * Math.PI * 0.95) * 0.50, t * 0.46, 0));
      }
      g.add(new THREE.Mesh(tubeGeometry(framesFromPoints(pts, 70), (t) => 0.050 * (1 - t * 0.40), 10), M.candyStripe));
      pedestal.add(g);
    }
    // gumdrops + dragées
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2;
      const rad = 1.55 + R() * 0.90;
      const gd = new THREE.Mesh(gumdropGeometry(0.12 + R() * 0.07, 0.18 + R() * 0.10, 18),
        [M.lollipop, M.candyStripeMint, M.lollipopGold, M.scaleMint][i % 4]);
      gd.position.set(Math.cos(a) * rad, 0.09, Math.sin(a) * rad);
      gd.rotation.y = R() * Math.PI;
      pedestal.add(gd);
    }
    for (let i = 0; i < 24; i++) {
      const a = R() * Math.PI * 2;
      const rad = 1.30 + R() * 1.25;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.042 + R() * 0.05, 12, 10),
        i % 3 === 0 ? M.lollipopGold : i % 3 === 1 ? M.trim : M.belly);
      p.position.set(Math.cos(a) * rad, 0.10, Math.sin(a) * rad);
      pedestal.add(p);
    }
  }
  pedestal.position.y = -0.06;
  root.add(pedestal);

  const stage = new THREE.Group();
  stage.add(root);
  stage.position.y = -2.35;

  /* ================================================================== *
   *  ANIMATION
   * ================================================================== */
  const state = { t: 0, reveal: 0, pose: { roar: 0, bloom: 0 } };
  const headBase = head.position.clone();
  const headBaseQ = head.quaternion.clone();
  const tmpQ = new THREE.Quaternion();
  const jawBaseZ = jaw.rotation.z;

  function update(dt, opts = {}) {
    state.t += dt;
    const t = state.t;
    if (!opts.freezeReveal) state.reveal = Math.min(1, state.reveal + dt * 0.40);
    const rv = smoothstep(0, 1, state.reveal);

    const breath = Math.sin(t * 1.0) * 0.5 + 0.5;
    const hover = Math.sin(t * 0.82) * 0.06;
    root.position.y = (1 - rv) * -1.8 + hover * rv;
    root.rotation.z = Math.sin(t * 0.68) * 0.008 * rv;
    root.rotation.x = Math.sin(t * 0.53) * 0.006 * rv;
    root.scale.setScalar(rv);
    root.scale.y *= 1 + breath * 0.006;
    root.visible = rv > 0.001;

    /* head: slow regal survey */
    const roar = state.pose.roar;
    const lookYaw = Math.sin(t * 0.30) * 0.22 + Math.sin(t * 0.19 + 1.1) * 0.10;
    const lookPitch = Math.sin(t * 0.24 + 0.6) * 0.08 - 0.02;
    head.position.copy(headBase);
    head.position.y += Math.sin(t * 1.0) * 0.014 + roar * 0.14;
    head.position.x += roar * 0.05;
    tmpQ.copy(headBaseQ)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, lookYaw * (1 - roar), 0, 'YXZ')))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lookPitch - roar * 0.26, 0, 0, 'YXZ')));
    head.quaternion.slerp(tmpQ, 0.10 + roar * 0.15);

    /* jaw + inner furnace  (layered with the roar action) */
    const jawOpen = 0.05 + Math.max(0, Math.sin(t * 0.8)) * 0.13 + roar * 0.52;
    jaw.rotation.z = jawBaseZ - jawOpen;
    if (mouthGlow) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.9);
      mouthGlow.material.opacity = 0.32 + 0.40 * pulse + roar * 0.5;
      mouthGlow.scale.setScalar(0.75 + 0.30 * pulse + roar * 1.5);
    }
    glow.intensity = 2.4 + Math.sin(t * 1.9) * 0.7 + roar * 9.0;

    for (const e of eyes) {
      e.scale.setScalar(1 + 0.05 * (0.5 + 0.5 * Math.sin(t * 1.2 + e.userData.side * 0.4)));
    }

    /* wings */
    const flap = Math.sin(t * 0.55);
    const flap2 = Math.sin(t * 0.55 - 0.7);
    const flap3 = Math.sin(t * 0.28);
    for (const rig of wingRigs) {
      const { wing, side } = rig;
      const raise = 0.16 + flap * 0.18 + state.pose.roar * 0.34;
      const sweep = 0.05 + flap3 * 0.07 - state.pose.roar * 0.12;
      const roll = 0.14 + flap2 * 0.08;
      const q = rig.base.clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -raise * side))
        .multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), sweep * side))
        .multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), roll * side));
      wing.quaternion.slerp(q, 0.08);
      const hg = wing.userData.handGroup;
      hg.rotation.z = flap2 * 0.16 * side;
      hg.rotation.x = flap2 * 0.10;
      wing.userData.armGroup.rotation.z = flap * 0.05 * side;
    }

    /* sparkles */
    const pos = sparkGeo.attributes.position;
    for (let i = 0; i < sparkCount; i++) {
      const ph = sPhase[i];
      const a = ph + t * sSpeed[i] * 0.28;
      const rad = sRadius[i] + Math.sin(t * 0.48 + ph) * 0.3;
      pos.setXYZ(i,
        Math.cos(a) * rad,
        sBase[i * 3 + 1] + Math.sin(t * 0.42 + ph * 2) * 0.4 + ((t * 0.05 * sSpeed[i]) % 1) * 0.8,
        Math.sin(a) * rad);
    }
    pos.needsUpdate = true;
    sparks.material.opacity = (0.5 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.5)))
      + state.pose.bloom * 0.45;

    pedestal.rotation.y = Math.sin(t * 0.08) * 0.02;
  }

  function setPose(p) {
    state.pose.roar = p.roar ?? 0;
    state.pose.bloom = p.bloom ?? 0;
  }

  return {
    stage, root, pedestal, materials: M, head, jaw, update, setPose, state, frames,
    bounds: new THREE.Box3().setFromObject(stage),
  };
}
