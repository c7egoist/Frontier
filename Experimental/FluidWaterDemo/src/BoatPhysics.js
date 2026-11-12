// Sculpted 3D watercraft geometry, coupled 6-DOF Archimedes buoyancy,
// coastal bathymetry awareness, steering/autopilot helm, and synchronized CPU heightfield mirror.

export function SampleShoreBedY(wx, wz, water, shore) {
  const depth = water.WaterDepth;
  if (!shore || !shore.ShoreEnabled) return -depth;

  const halfW = water.BoundWidth * 0.5;
  const coveOffset =
    shore.ShoreCurve *
    (0.62 * Math.sin((wz / Math.max(8, water.BoundLength * 0.5)) * Math.PI * 1.45) +
      0.38 * Math.cos((wz / Math.max(8, water.BoundLength * 0.5)) * Math.PI * 2.7 + 0.6));

  const beachStartX = halfW - shore.ShoreWidth + coveOffset;
  const distPastStart = wx - beachStartX;
  if (distPastStart <= 0) {
    // Gentle seabed rise leading toward sandbar
    const lead = Math.max(0, 1 + distPastStart / 6.0);
    return -depth + lead * lead * 0.35;
  }
  // Smooth S-curve coastal shelf transitioning up through y = 0 shoreline into golden beach
  const slopeRise = distPastStart * shore.ShoreSlope * 1.65;
  const bed = -depth + 0.35 + slopeRise;
  return Math.min(2.2, bed);
}

export function EstimateShorelineX(wz, water, shore) {
  if (!shore || !shore.ShoreEnabled) return water.BoundWidth * 0.5;
  const halfW = water.BoundWidth * 0.5;
  const coveOffset =
    shore.ShoreCurve *
    (0.62 * Math.sin((wz / Math.max(8, water.BoundLength * 0.5)) * Math.PI * 1.45) +
      0.38 * Math.cos((wz / Math.max(8, water.BoundLength * 0.5)) * Math.PI * 2.7 + 0.6));
  const beachStartX = halfW - shore.ShoreWidth + coveOffset;
  const distToZero = Math.max(0, water.WaterDepth - 0.35) / Math.max(0.05, shore.ShoreSlope * 1.65);
  return beachStartX + distToZero;
}

export function CreateWaveMirror(N = 64) {
  const Count = N * N;
  return {
    N,
    h: new Float32Array(Count),
    u: new Float32Array(Count),
    v: new Float32Array(Count),
    imprint: new Float32Array(Count),
    prevImprint: new Float32Array(Count),
    pendingImpulses: [],
  };
}

export function ResetWaveMirror(mirror) {
  mirror.h.fill(0);
  mirror.u.fill(0);
  mirror.v.fill(0);
  mirror.imprint.fill(0);
  mirror.prevImprint.fill(0);
  mirror.pendingImpulses.length = 0;
}

export function InjectMirrorImpulse(mirror, worldX, worldZ, radius, strength, vx = 0, vz = 0) {
  mirror.pendingImpulses.push({ worldX, worldZ, radius, strength, vx, vz });
}

function GerstnerSwellHeight(wx, wz, time, water, wind) {
  const amp = water.SwellAmplitude;
  if (amp <= 1e-4) return 0;
  const freq = water.SwellFrequency * 0.24;
  const rad = (wind.DirectionDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dz = Math.sin(rad);
  const px = -dz;
  const pz = dx;
  const spd = Math.sqrt(9.81 / Math.max(0.08, freq));

  const p1 = (wx * dx + wz * dz) * freq - time * spd * freq * 1.1;
  const p2 = (wx * (dx * 0.8 + px * 0.6) + wz * (dz * 0.8 + pz * 0.6)) * (freq * 1.65) - time * spd * freq * 1.45;
  const p3 = (wx * (dx * 0.65 - px * 0.76) + wz * (dz * 0.65 - pz * 0.76)) * (freq * 2.45) - time * spd * freq * 1.8;

  const chop = water.CrossChop;
  return (
    amp * (0.62 * Math.sin(p1) + 0.14 * Math.sin(2.0 * p1)) +
    amp * chop * (0.34 * Math.sin(p2) + 0.22 * Math.sin(p3))
  );
}

export function SampleMirrorWave(mirror, wx, wz, time, water, wind) {
  const N = mirror.N;
  const halfW = water.BoundWidth * 0.5;
  const halfL = water.BoundLength * 0.5;
  const gx = ((wx + halfW) / water.BoundWidth) * (N - 1);
  const gz = ((wz + halfL) / water.BoundLength) * (N - 1);

  const ix = Math.max(0, Math.min(N - 2, Math.floor(gx)));
  const iz = Math.max(0, Math.min(N - 2, Math.floor(gz)));
  const fx = Math.max(0, Math.min(1, gx - ix));
  const fz = Math.max(0, Math.min(1, gz - iz));

  const i00 = iz * N + ix;
  const i10 = i00 + 1;
  const i01 = i00 + N;
  const i11 = i01 + 1;

  const h0 = mirror.h[i00] * (1 - fx) + mirror.h[i10] * fx;
  const h1 = mirror.h[i01] * (1 - fx) + mirror.h[i11] * fx;
  const dynamicH = h0 * (1 - fz) + h1 * fz;

  const swell = GerstnerSwellHeight(wx, wz, time, water, wind);
  return swell + dynamicH * 0.75;
}

export function StepWaveMirror(mirror, dt, time, water, wind, boatState, boatParams, boatVisible, shore) {
  const N = mirror.N;
  const dx = water.BoundWidth / N;
  const dz = water.BoundLength / N;
  const g = 9.81;
  const c = water.WaveSpeed;
  const depth = Math.max(0.6, water.WaterDepth);
  const cflMax = Math.min(dx, dz) * 0.38;
  const substeps = Math.max(1, Math.min(4, Math.ceil((c * dt) / Math.max(0.05, cflMax))));
  const sdt = Math.min(0.025, dt / substeps);

  while (mirror.pendingImpulses.length > 0) {
    const imp = mirror.pendingImpulses.pop();
    const r2 = imp.radius * imp.radius;
    const minIx = Math.max(1, Math.floor(((imp.worldX - imp.radius + water.BoundWidth * 0.5) / water.BoundWidth) * N));
    const maxIx = Math.min(N - 2, Math.ceil(((imp.worldX + imp.radius + water.BoundWidth * 0.5) / water.BoundWidth) * N));
    const minIz = Math.max(1, Math.floor(((imp.worldZ - imp.radius + water.BoundLength * 0.5) / water.BoundLength) * N));
    const maxIz = Math.min(N - 2, Math.ceil(((imp.worldZ + imp.radius + water.BoundLength * 0.5) / water.BoundLength) * N));
    for (let z = minIz; z <= maxIz; z++) {
      const wz = ((z + 0.5) / N - 0.5) * water.BoundLength;
      for (let x = minIx; x <= maxIx; x++) {
        const wx = ((x + 0.5) / N - 0.5) * water.BoundWidth;
        const d2 = (wx - imp.worldX) ** 2 + (wz - imp.worldZ) ** 2;
        if (d2 < r2) {
          const w = Math.exp(-d2 / Math.max(0.04, r2 * 0.36));
          const idx = z * N + x;
          mirror.h[idx] = Math.max(-1.6, Math.min(1.6, mirror.h[idx] - imp.strength * 0.25 * w));
          mirror.u[idx] += imp.vx * 0.35 * w;
          mirror.v[idx] += imp.vz * 0.35 * w;
        }
      }
    }
  }

  mirror.prevImprint.set(mirror.imprint);
  mirror.imprint.fill(0);
  if (boatVisible) {
    const halfLen = boatParams.HullLength * 0.5;
    const halfBeam = boatParams.HullBeam * 0.5;
    const cy = Math.cos(boatState.yaw);
    const sy = Math.sin(boatState.yaw);
    const boundR = halfLen + halfBeam + 1.0;
    const minIx = Math.max(1, Math.floor(((boatState.x - boundR + water.BoundWidth * 0.5) / water.BoundWidth) * N));
    const maxIx = Math.min(N - 2, Math.ceil(((boatState.x + boundR + water.BoundWidth * 0.5) / water.BoundWidth) * N));
    const minIz = Math.max(1, Math.floor(((boatState.z - boundR + water.BoundLength * 0.5) / water.BoundLength) * N));
    const maxIz = Math.min(N - 2, Math.ceil(((boatState.z + boundR + water.BoundLength * 0.5) / water.BoundLength) * N));

    for (let z = minIz; z <= maxIz; z++) {
      const wz = ((z + 0.5) / N - 0.5) * water.BoundLength;
      for (let x = minIx; x <= maxIx; x++) {
        const wx = ((x + 0.5) / N - 0.5) * water.BoundWidth;
        const rx = wx - boatState.x;
        const rz = wz - boatState.z;
        const lx = rx * cy + rz * sy;
        const lz = -rx * sy + rz * cy;
        const u = lx / halfLen;
        const beamAtU = Math.max(0.08, Math.pow(Math.max(0, 1 - Math.max(0, u) * 0.92), 0.52) * (u < -0.7 ? 0.85 : 1.0));
        const vNorm = Math.abs(lz) / (halfBeam * beamAtU);
        if (u >= -1.05 && u <= 1.08 && vNorm <= 1.05) {
          const hullProfile = Math.max(0, 1 - vNorm * vNorm) * Math.max(0, 1 - Math.pow(Math.abs(u), 4.0));
          const sub = Math.max(0, boatParams.DraftDepth - boatState.y * 0.65) * hullProfile * boatParams.WakeCoupling;
          mirror.imprint[z * N + x] = sub;
        }
      }
    }
  }

  const h = mirror.h;
  const u = mirror.u;
  const v = mirror.v;
  const waveFactor = (c * c) / Math.max(0.8, g);
  const damp = Math.exp(-water.WaveDamping * sdt * 2.2);
  const inv2dx = 0.5 / dx;
  const inv2dz = 0.5 / dz;
  const isReflective = water.BoundaryMode === 1;

  for (let s = 0; s < substeps; s++) {
    for (let z = 1; z < N - 1; z++) {
      const row = z * N;
      const wz = ((z + 0.5) / N - 0.5) * water.BoundLength;
      for (let x = 1; x < N - 1; x++) {
        const i = row + x;
        const wx = ((x + 0.5) / N - 0.5) * water.BoundWidth;
        const bedY = SampleShoreBedY(wx, wz, water, shore);
        const localDepth = Math.max(0.0, h[i] - bedY);
        const shoal = Math.min(1.0, localDepth / depth);
        const dhdx = (h[i + 1] - h[i - 1]) * inv2dx;
        const dhdz = (h[i + N] - h[i - N]) * inv2dz;
        u[i] = (u[i] - g * waveFactor * dhdx * sdt) * damp * (0.65 + 0.35 * shoal);
        v[i] = (v[i] - g * waveFactor * dhdz * sdt) * damp * (0.65 + 0.35 * shoal);
      }
    }
    for (let z = 1; z < N - 1; z++) {
      const row = z * N;
      for (let x = 1; x < N - 1; x++) {
        const i = row + x;
        const div = (u[i + 1] - u[i - 1]) * inv2dx + (v[i + N] - v[i - N]) * inv2dz;
        const dImp = (mirror.imprint[i] - mirror.prevImprint[i]) / substeps;
        let nextH = h[i] - depth * div * sdt + dImp * 0.85;
        if (!isReflective) {
          const edgeX = Math.min(x, N - 1 - x) / (N * 0.08);
          const edgeZ = Math.min(z, N - 1 - z) / (N * 0.08);
          const edge = Math.min(1, Math.min(edgeX, edgeZ));
          nextH *= 0.88 + 0.12 * edge;
        }
        h[i] = Math.max(-2.5, Math.min(2.5, nextH));
      }
    }
  }
}

export function CreateBoatState() {
  return {
    x: -7,
    y: 0.05,
    z: 2,
    vx: 4.5,
    vy: 0,
    vz: 0,
    yaw: 0.3,
    pitch: 0,
    roll: 0,
    pitchVel: 0,
    rollVel: 0,
    yawRate: 0,
    rudderAngle: 0,
    propAngle: 0,
    speed: 0,
    submersionAvg: 0.55,
    foamChurn: 0,
    time: 0,
  };
}

export function ResetBoatState(boat, water, shore) {
  const offset = shore && shore.ShoreEnabled ? -shore.ShoreWidth * 0.42 : 0;
  boat.x = offset;
  boat.y = 0.05;
  boat.z = 2;
  boat.vx = 0;
  boat.vy = 0;
  boat.vz = 0;
  boat.yaw = 0.3;
  boat.pitch = 0;
  boat.roll = 0;
  boat.pitchVel = 0;
  boat.rollVel = 0;
  boat.yawRate = 0;
  boat.rudderAngle = 0;
  boat.speed = 0;
  boat.time = 0;
}

export function StepBoatPhysics(boat, dt, time, mirror, water, wind, params, keys, shore) {
  boat.time += dt;
  const clampedDt = Math.min(0.033, dt);
  const halfW = Math.max(6, water.BoundWidth * 0.5 - params.HullLength * 0.65);
  const halfL = Math.max(6, water.BoundLength * 0.5 - params.HullLength * 0.65);

  // Keep navigable channel safely offshore of the sloping beach
  const shoreLimitX =
    shore && shore.ShoreEnabled
      ? Math.min(halfW, EstimateShorelineX(boat.z, water, shore) - params.HullLength * 0.72)
      : halfW;
  const centerNavX = shore && shore.ShoreEnabled ? (shoreLimitX - halfW) * 0.5 : 0;
  const navHalfW = Math.max(4.5, (shoreLimitX + halfW) * 0.5 - 1.2);

  let throttle = 0;
  let steerCmd = 0;

  if (params.ControlMode === 'figure8') {
    const loopScaleX = navHalfW * 0.66;
    const loopScaleZ = halfL * 0.62;
    const omega = (params.ThrottleSpeed / Math.max(8, (loopScaleX + loopScaleZ) * 0.78)) * 0.95;
    const theta = boat.time * omega;
    const targetX = centerNavX + Math.sin(theta * 2.0) * loopScaleX * 0.58;
    const targetZ = Math.sin(theta) * loopScaleZ;
    const dx = targetX - boat.x;
    const dz = targetZ - boat.z;
    const desiredYaw = Math.atan2(dz, dx);
    let err = desiredYaw - boat.yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    steerCmd = Math.max(-1, Math.min(1, err * 1.45));
    throttle = 1.0;
  } else if (params.ControlMode === 'circle') {
    const rX = navHalfW * 0.6;
    const rZ = halfL * 0.58;
    const omega = params.ThrottleSpeed / Math.max(6, 0.5 * (rX + rZ));
    const theta = boat.time * omega;
    const targetX = centerNavX + Math.cos(theta) * rX;
    const targetZ = Math.sin(theta) * rZ;
    const dx = targetX - boat.x;
    const dz = targetZ - boat.z;
    const desiredYaw = Math.atan2(dz, dx);
    let err = desiredYaw - boat.yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    steerCmd = Math.max(-1, Math.min(1, err * 1.6));
    throttle = 1.0;
  } else if (params.ControlMode === 'manual') {
    const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const turn = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    throttle = fwd;
    steerCmd = turn;
  }

  const cy = Math.cos(boat.yaw);
  const sy = Math.sin(boat.yaw);
  const fwdSpeed = boat.vx * cy + boat.vz * sy;
  const latSpeed = -boat.vx * sy + boat.vz * cy;

  const targetFwd = throttle * params.ThrottleSpeed;
  const accel = (targetFwd - fwdSpeed) * 2.25;
  const nextFwd = fwdSpeed + accel * clampedDt;
  const nextLat = latSpeed * Math.exp(-5.4 * clampedDt);

  const speedNorm = Math.min(1.4, Math.abs(nextFwd) / Math.max(2.0, params.ThrottleSpeed));
  const targetYawRate = steerCmd * params.TurnAgility * (0.38 + 0.85 * speedNorm) * (nextFwd >= -0.4 ? 1 : -1);
  boat.yawRate += (targetYawRate - boat.yawRate) * Math.min(1, clampedDt * 6.5);
  boat.yaw += boat.yawRate * clampedDt;
  boat.rudderAngle += (steerCmd * 0.45 - boat.rudderAngle) * Math.min(1, clampedDt * 8.0);

  const ncy = Math.cos(boat.yaw);
  const nsy = Math.sin(boat.yaw);
  boat.vx = nextFwd * ncy - nextLat * nsy;
  boat.vz = nextFwd * nsy + nextLat * ncy;

  let nextX = boat.x + boat.vx * clampedDt;
  let nextZ = boat.z + boat.vz * clampedDt;
  if (nextX < -halfW) {
    nextX = -halfW;
    boat.vx *= -0.35;
  } else if (nextX > shoreLimitX) {
    nextX = shoreLimitX;
    boat.vx = Math.min(0, boat.vx) - 0.35 * Math.max(0, boat.vx);
  }
  if (Math.abs(nextZ) > halfL) {
    nextZ = Math.sign(nextZ) * halfL;
    boat.vz *= -0.35;
  }
  boat.x = nextX;
  boat.z = nextZ;
  boat.speed = Math.hypot(boat.vx, boat.vz);
  boat.propAngle += (0.8 + Math.abs(throttle) * 18.0 + boat.speed * 2.8) * clampedDt;

  const halfLen = params.HullLength * 0.5;
  const halfBeam = params.HullBeam * 0.5;
  const probes = [
    [0.85, 0.0, 0.9],
    [0.42, 0.55, 1.1],
    [0.42, -0.55, 1.1],
    [0.0, 0.78, 1.3],
    [0.0, -0.78, 1.3],
    [-0.45, 0.68, 1.2],
    [-0.45, -0.68, 1.2],
    [-0.86, 0.45, 1.0],
    [-0.86, -0.45, 1.0],
  ];

  let totalSubmersion = 0;
  let totalWeight = 0;
  let pitchTorque = 0;
  let rollTorque = 0;

  for (let i = 0; i < probes.length; i++) {
    const [u, vNorm, weight] = probes[i];
    const lx = u * halfLen;
    const lz = vNorm * halfBeam;
    const wx = boat.x + lx * ncy - lz * nsy;
    const wz = boat.z + lx * nsy + lz * ncy;
    const wyHull = boat.y - lx * Math.sin(boat.pitch) - lz * Math.sin(boat.roll) - params.DraftDepth * 0.42;
    const waveY = SampleMirrorWave(mirror, wx, wz, time, water, wind);
    const sub = Math.max(0, Math.min(params.DraftDepth * 1.6, waveY - wyHull));
    totalSubmersion += sub * weight;
    totalWeight += weight;
    pitchTorque -= (lx / halfLen) * sub * weight;
    rollTorque -= (lz / halfBeam) * sub * weight;
  }

  const avgSub = totalSubmersion / totalWeight;
  boat.submersionAvg = avgSub;

  const targetEquilibriumSub = params.DraftDepth * 0.44;
  const heaveAccel = (avgSub - targetEquilibriumSub) * params.BuoyancyStiffness - boat.vy * (params.PitchRollDamping * 1.15);
  boat.vy += heaveAccel * clampedDt;
  boat.y = Math.max(-1.2, Math.min(2.2, boat.y + boat.vy * clampedDt));

  const planingLift = Math.min(0.11, boat.speed * 0.012);
  const turnBank = -boat.yawRate * boat.speed * 0.022;

  const pitchAccel = (pitchTorque * 0.42 - planingLift - boat.pitch) * (params.BuoyancyStiffness * 0.68) - boat.pitchVel * params.PitchRollDamping;
  const rollAccel = (rollTorque * 0.56 + turnBank - boat.roll) * (params.BuoyancyStiffness * 0.78) - boat.rollVel * params.PitchRollDamping;

  boat.pitchVel += pitchAccel * clampedDt;
  boat.rollVel += rollAccel * clampedDt;
  boat.pitch = Math.max(-0.48, Math.min(0.48, boat.pitch + boat.pitchVel * clampedDt));
  boat.roll = Math.max(-0.55, Math.min(0.55, boat.roll + boat.rollVel * clampedDt));

  boat.foamChurn = Math.min(1.0, boat.speed * 0.12 * water.HullFoamChurn + Math.abs(boat.vy) * 0.45);
}

export function BuildBoatModelMatrix(boat, params) {
  const sx = params.HullLength / 6.2;
  const sz = params.HullBeam / 2.35;
  const sy = 0.5 * (sx + sz);

  const cy = Math.cos(boat.yaw);
  const syaw = Math.sin(boat.yaw);
  const cp = Math.cos(boat.pitch);
  const sp = Math.sin(boat.pitch);
  const cr = Math.cos(boat.roll);
  const sr = Math.sin(boat.roll);

  const fx0 = cy, fy0 = 0, fz0 = syaw;
  const rx0 = -syaw, ry0 = 0, rz0 = cy;
  const ux0 = 0, uy0 = 1, uz0 = 0;

  const fx1 = fx0 * cp - ux0 * sp;
  const fy1 = fy0 * cp - uy0 * sp;
  const fz1 = fz0 * cp - uz0 * sp;
  const ux1 = fx0 * sp + ux0 * cp;
  const uy1 = fy0 * sp + uy0 * cp;
  const uz1 = fz0 * sp + uz0 * cp;

  const rx2 = rx0 * cr - ux1 * sr;
  const ry2 = ry0 * cr - uy1 * sr;
  const rz2 = rz0 * cr - uz1 * sr;
  const ux2 = rx0 * sr + ux1 * cr;
  const uy2 = ry0 * sr + uy1 * cr;
  const uz2 = rz0 * sr + uz1 * cr;

  return new Float32Array([
    fx1 * sx, fy1 * sx, fz1 * sx, 0,
    ux2 * sy, uy2 * sy, uz2 * sy, 0,
    rx2 * sz, ry2 * sz, rz2 * sz, 0,
    boat.x, boat.y, boat.z, 1,
  ]);
}

export function BuildBoatMesh() {
  const verts = [];
  const indices = [];

  function pushQuad(a, b, c, d, matId) {
    const base = verts.length / 7;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c, d]) {
      verts.push(p[0], p[1], p[2], nx, ny, nz, matId);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  function pushBox(x0, y0, z0, x1, y1, z1, matId, taperTopX = 0, taperTopZ = 0) {
    const p000 = [x0, y0, z0], p100 = [x1, y0, z0], p101 = [x1, y0, z1], p001 = [x0, y0, z1];
    const p010 = [x0 + taperTopX, y1, z0 + taperTopZ];
    const p110 = [x1 - taperTopX, y1, z0 + taperTopZ];
    const p111 = [x1 - taperTopX, y1, z1 - taperTopZ];
    const p011 = [x0 + taperTopX, y1, z1 - taperTopZ];
    pushQuad(p010, p110, p111, p011, matId);
    pushQuad(p000, p001, p101, p100, matId);
    pushQuad(p100, p101, p111, p110, matId);
    pushQuad(p001, p000, p010, p011, matId);
    pushQuad(p001, p011, p111, p101, matId);
    pushQuad(p000, p100, p110, p010, matId);
  }

  const stations = [
    { x: -3.00, beam: 1.02, keelY: -0.44, chineY: -0.10, sheerY: 0.56 },
    { x: -2.10, beam: 1.14, keelY: -0.48, chineY: -0.10, sheerY: 0.60 },
    { x: -0.90, beam: 1.18, keelY: -0.52, chineY: -0.08, sheerY: 0.64 },
    { x:  0.40, beam: 1.12, keelY: -0.48, chineY: -0.04, sheerY: 0.69 },
    { x:  1.60, beam: 0.88, keelY: -0.36, chineY:  0.06, sheerY: 0.77 },
    { x:  2.55, beam: 0.44, keelY: -0.18, chineY:  0.22, sheerY: 0.88 },
    { x:  3.15, beam: 0.02, keelY:  0.14, chineY:  0.46, sheerY: 0.98 },
  ];

  for (let i = 0; i < stations.length - 1; i++) {
    const s0 = stations[i];
    const s1 = stations[i + 1];

    const k0 = [s0.x, s0.keelY, 0];
    const k1 = [s1.x, s1.keelY, 0];
    const c0S = [s0.x, s0.chineY, s0.beam * 0.88];
    const c1S = [s1.x, s1.chineY, s1.beam * 0.88];
    const c0P = [s0.x, s0.chineY, -s0.beam * 0.88];
    const c1P = [s1.x, s1.chineY, -s1.beam * 0.88];

    const h0S = [s0.x, s0.sheerY, s0.beam];
    const h1S = [s1.x, s1.sheerY, s1.beam];
    const h0P = [s0.x, s0.sheerY, -s0.beam];
    const h1P = [s1.x, s1.sheerY, -s1.beam];

    pushQuad(k0, k1, c1S, c0S, 1);
    pushQuad(k0, c0P, c1P, k1, 1);
    pushQuad(c0S, c1S, h1S, h0S, 0);
    pushQuad(c0P, h0P, h1P, c1P, 0);

    const deck0S = [s0.x, s0.sheerY - 0.03, s0.beam * 0.74];
    const deck1S = [s1.x, s1.sheerY - 0.03, s1.beam * 0.74];
    const deck0P = [s0.x, s0.sheerY - 0.03, -s0.beam * 0.74];
    const deck1P = [s1.x, s1.sheerY - 0.03, -s1.beam * 0.74];
    if (s0.x >= 0.35) {
      pushQuad(h0P, h1P, h1S, h0S, 2);
    } else {
      pushQuad(h0S, h1S, deck1S, deck0S, 3);
      pushQuad(h0P, deck0P, deck1P, h1P, 3);
      pushQuad(deck0P, deck1P, deck1S, deck0S, 2);
    }
  }

  const st = stations[0];
  pushQuad([st.x, st.keelY, 0], [st.x, st.chineY, st.beam * 0.88], [st.x, st.sheerY, st.beam], [st.x, st.sheerY, -st.beam], 0);
  pushQuad([st.x, st.keelY, 0], [st.x, st.sheerY, -st.beam], [st.x, st.chineY, -st.beam * 0.88], [st.x, st.keelY, 0], 0);

  pushBox(-0.65, 0.56, -0.78, 1.35, 1.05, 0.78, 3, 0.14, 0.06);
  pushQuad([1.22, 1.03, -0.68], [1.22, 1.03, 0.68], [0.76, 1.54, 0.58], [0.76, 1.54, -0.58], 4);
  pushQuad([0.76, 1.03, 0.71], [1.22, 1.03, 0.68], [0.76, 1.54, 0.58], [-0.42, 1.54, 0.62], 4);
  pushQuad([-0.42, 1.03, 0.71], [0.76, 1.03, 0.71], [0.76, 1.54, 0.58], [-0.42, 1.54, 0.62], 4);
  pushQuad([1.22, 1.03, -0.68], [0.76, 1.03, -0.71], [-0.42, 1.54, -0.62], [0.76, 1.54, -0.58], 4);
  pushQuad([0.76, 1.03, -0.71], [-0.42, 1.03, -0.71], [-0.42, 1.54, -0.62], [0.76, 1.54, -0.58], 4);
  pushBox(-0.50, 1.53, -0.65, 0.82, 1.62, 0.65, 3, 0.04, 0.03);
  pushBox(-0.18, 1.62, -0.04, -0.08, 2.28, 0.04, 5);
  pushBox(-0.22, 2.12, -0.34, -0.06, 2.18, 0.34, 5);
  pushBox(-3.16, -0.45, -0.05, -2.96, 0.38, 0.05, 5);
  pushBox(-3.26, 0.36, -0.18, -2.92, 0.74, 0.18, 0);

  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(indices),
    indexCount: indices.length,
  };
}
