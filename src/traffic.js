// ============================================================================================================================================
//                                                                TRAFFIC.JS
// ============================================================================================================================================
// AI Traffic Simulation (strictly capped at <= 25 vehicles), Surface Railway Train, Underground Subway Train,
// and Autonomous 6-Wheel Sidewalk Delivery/Inspection Robots.
// Builds high-detail multi-part quad meshes (sculpted chassis, greenhouse glass, pillars, 4-6 cylindrical wheels with rims,
// side mirrors, headlights, brake lights, pantographs, LiDAR domes) — NO lowpoly single-box placeholders!

import {
  clamp,
  lerp,
  vAdd,
  vSub,
  vScale,
  vMad,
  vLerp,
  vLen,
  vNorm,
  vNormXZ,
  leftNormalXZ,
  cubicBezier,
  arcLengths,
  pointAtArc,
  tangentAtArc,
} from './math.js';
import { MAT, MAX_AI_VEHICLES } from './model.js';
import { QuadMeshBuilder } from './roadMesh.js';

export { MAX_AI_VEHICLES };

const VEHICLE_ARCHETYPES = [
  { kind: 'sedan', name: 'Executive Sedan', len: 4.65, width: 1.88, height: 1.44, speed: 13.5, paintId: 0 },
  { kind: 'coupe', name: 'GT Sport Coupé', len: 4.48, width: 1.94, height: 1.32, speed: 16.0, paintId: 1 },
  { kind: 'suv', name: 'Urban Luxury SUV', len: 4.88, width: 1.98, height: 1.72, speed: 12.8, paintId: 2 },
  { kind: 'bus', name: 'City Transit Bus', len: 9.80, width: 2.48, height: 2.95, speed: 9.8, paintId: 3 },
  { kind: 'truck', name: 'Heavy Logistics Truck', len: 7.40, width: 2.36, height: 2.75, speed: 10.5, paintId: 4 },
];

/**
 * Constructs a directed lane graph from built road runs and merged junctions,
 * plus sidewalk paths for autonomous robots and rail/subway paths for trains.
 */
export function buildTrafficSimulation(arg1, arg2) {
  const builtNetwork = arg1?.builtRuns ? arg1 : arg2;
  const project = arg1?.builtRuns ? arg2 : arg1;
  const laneSegments = [];
  const robotPaths = [];
  const parkedSpots = [];

  for (const r of builtNetwork.builtRuns) {
    const frames = r.cross.frames;
    if (!frames || frames.length < 2) continue;
    const laneOffset = Math.min(2.2, r.cross.carriageHalf * 0.48);

    // Forward lane (right side of travel = -left)
    const fwdPts = frames.map((f) => {
      const p = vMad(f.center, f.left, -laneOffset);
      p[1] += 0.08;
      return p;
    });
    const fwdLengths = arcLengths(fwdPts);

    // Reverse lane (left side of travel = +left, reversed order)
    const revPts = [...frames].reverse().map((f) => {
      const p = vMad(f.center, f.left, laneOffset);
      p[1] += 0.08;
      return p;
    });
    const revLengths = arcLengths(revPts);

    if (fwdLengths[fwdLengths.length - 1] > 4.0) {
      laneSegments.push({
        id: `${r.run.id}-fwd`,
        runId: r.run.id,
        fromJunction: r.run.fromId,
        toJunction: r.run.toId,
        pts: fwdPts,
        lengths: fwdLengths,
        total: fwdLengths[fwdLengths.length - 1],
        nextIds: [],
      });
    }
    if (revLengths[revLengths.length - 1] > 4.0) {
      laneSegments.push({
        id: `${r.run.id}-rev`,
        runId: r.run.id,
        fromJunction: r.run.toId,
        toJunction: r.run.fromId,
        pts: revPts,
        lengths: revLengths,
        total: revLengths[revLengths.length - 1],
        nextIds: [],
      });
    }

    // Sidewalk paths for autonomous delivery & inspection robots
    const swLeftPts = r.cross.curbTopL.map((c, idx) => vLerp(c, r.cross.paveL[idx], 0.48));
    const swRightPts = r.cross.curbTopR.map((c, idx) => vLerp(c, r.cross.paveR[idx], 0.48));
    const swLLen = arcLengths(swLeftPts);
    const swRLen = arcLengths(swRightPts);
    if (swLLen[swLLen.length - 1] > 8) {
      robotPaths.push({ pts: swLeftPts, lengths: swLLen, total: swLLen[swLLen.length - 1] });
    }
    if (swRLen[swRLen.length - 1] > 8) {
      robotPaths.push({ pts: swRightPts, lengths: swRLen, total: swRLen[swRLen.length - 1] });
    }

    // Collect a few on-street parking spots
    if (r.run.spline.parking && r.run.spline.parking !== 'none' && frames.length >= 8) {
      const pIdx = Math.floor(frames.length * 0.35);
      const f = frames[pIdx];
      const pos = vMad(f.center, f.left, r.cross.carriageHalf - 1.15);
      parkedSpots.push({
        position: [pos[0], pos[1] + 0.08, pos[2]],
        tangent: [...f.tangent],
        archetype: VEHICLE_ARCHETYPES[(parkedSpots.length + 1) % 3],
        paintId: (parkedSpots.length + 2) % 6,
      });
    }
  }

  // Build smooth Cubic Bezier turn connectors across each merged junction!
  const turnConnectors = [];
  for (const inc of laneSegments) {
    if (!inc.toJunction) continue;
    const candidates = laneSegments.filter(
      (out) => out.fromJunction === inc.toJunction && out.runId !== inc.runId
    );
    for (const out of candidates) {
      const p0 = inc.pts[inc.pts.length - 1];
      const t0 = tangentAtArc(inc.pts, inc.lengths, inc.total - 0.2);
      const p3 = out.pts[0];
      const t3 = tangentAtArc(out.pts, out.lengths, 0.2);
      const dist = vLen(vSub(p3, p0));
      const hLen = Math.max(2.0, dist * 0.38);
      const p1 = vMad(p0, t0, hLen);
      const p2 = vMad(p3, t3, -hLen);
      const curvePts = [];
      for (let k = 0; k <= 14; k++) {
        curvePts.push(cubicBezier(p0, p1, p2, p3, k / 14));
      }
      const cLengths = arcLengths(curvePts);
      const connId = `turn-${inc.id}-to-${out.id}`;
      const conn = {
        id: connId,
        isTurn: true,
        pts: curvePts,
        lengths: cLengths,
        total: cLengths[cLengths.length - 1],
        nextIds: [out.id],
      };
      turnConnectors.push(conn);
      inc.nextIds.push(connId);
    }
  }

  const allLaneMap = new Map();
  for (const seg of [...laneSegments, ...turnConnectors]) {
    allLaneMap.set(seg.id, seg);
  }

  // Spawn AI Vehicles (strictly clamped to <= 25!)
  const lTraffic = (project.roadLayers || []).find((l) => l.id === 'layer-traffic');
  const lFurn = (project.roadLayers || []).find((l) => l.id === 'layer-furniture');
  const requestedCount = lTraffic?.params?.vehicleCount ?? 18;
  const maxAllowed = clamp(Math.round(requestedCount), 0, MAX_AI_VEHICLES);
  const parkedEnabled = lTraffic?.params?.parkedCars ?? true;
  const activeParked = parkedEnabled ? parkedSpots.slice(0, Math.min(3, maxAllowed)) : [];
  const movingCount = Math.max(0, maxAllowed - activeParked.length);

  const vehicles = [];
  if (laneSegments.length > 0) {
    for (let i = 0; i < movingCount; i++) {
      const seg = laneSegments[i % laneSegments.length];
      const arch = VEHICLE_ARCHETYPES[i % VEHICLE_ARCHETYPES.length];
      const frac = ((i * 0.37 + 0.15) % 0.85);
      vehicles.push({
        id: `veh-${i + 1}`,
        archetype: arch,
        paintId: i % 6,
        segId: seg.id,
        s: frac * seg.total,
        speed: arch.speed * (0.88 + (i % 4) * 0.08),
        braking: false,
      });
    }
  }

  // Spawn Autonomous Sidewalk Robots
  const robotsOn = !lFurn || (lFurn.visible && (lFurn.params?.robotsEnabled ?? true));
  const robotCount = robotsOn ? clamp(Math.round(lFurn?.params?.robotCount ?? 8), 0, 16) : 0;
  const robots = [];
  if (robotPaths.length > 0) {
    for (let i = 0; i < robotCount; i++) {
      const path = robotPaths[i % robotPaths.length];
      robots.push({
        id: `robot-${i + 1}`,
        pathIndex: i % robotPaths.length,
        s: ((i * 0.29 + 0.1) % 0.9) * path.total,
        dir: i % 2 === 0 ? 1 : -1,
        speed: 2.4 + (i % 3) * 0.4,
      });
    }
  }

  return {
    allLaneMap,
    laneSegments,
    robotPaths,
    vehicles,
    parkedVehicles: activeParked,
    robots,
    railways: builtNetwork.railways || [],
    subways: builtNetwork.subways || [],
    trainPhase: 0.25,
    subwayPhase: 0.45,
  };
}

/**
 * Steps the AI Traffic, Surface Train, Subway Consist, and Sidewalk Robots forward by dt seconds,
 * and builds a fresh dynamic QuadMeshBuilder buffer for the current frame.
 */
export function stepAndEmitDynamicActors(sim, project, dt = 0.016) {
  const builder = new QuadMeshBuilder();
  if (!sim) return builder.toBuffers();

  const lTraffic = (project.roadLayers || []).find((l) => l.id === 'layer-traffic');
  const lRail = (project.roadLayers || []).find((l) => l.id === 'layer-rail-tunnel');
  const lFurn = (project.roadLayers || []).find((l) => l.id === 'layer-furniture');

  const trafficVisible = !lTraffic || (lTraffic.visible && (lTraffic.params?.trafficEnabled ?? true));
  const speedMult = lTraffic?.params?.speedMultiplier ?? 1.0;
  const maxVehicles = clamp(Math.round(lTraffic?.params?.vehicleCount ?? 18), 0, MAX_AI_VEHICLES);

  // 1. Update & Emit AI Road Vehicles (strictly capped at <= 25 total!)
  if (trafficVisible) {
    let emittedVehicles = 0;
    // Parked vehicles first
    for (const pv of sim.parkedVehicles) {
      if (emittedVehicles >= maxVehicles) break;
      emitHighDetailVehicle(builder, pv.position, pv.tangent, pv.archetype, pv.paintId, false, 2000 + emittedVehicles);
      emittedVehicles++;
    }

    // Moving AI vehicles
    for (let i = 0; i < sim.vehicles.length && emittedVehicles < maxVehicles; i++) {
      const v = sim.vehicles[i];
      let seg = sim.allLaneMap.get(v.segId);
      if (!seg) continue;

      // Car-following spacing check on same segment
      let slowFactor = 1.0;
      for (let j = 0; j < sim.vehicles.length; j++) {
        if (i === j) continue;
        const other = sim.vehicles[j];
        if (other.segId === v.segId && other.s > v.s && other.s - v.s < 11.5) {
          slowFactor = Math.min(slowFactor, clamp((other.s - v.s - 5.5) / 6.0, 0.0, 1.0));
        }
      }
      if (seg.isTurn) slowFactor *= 0.68;

      v.braking = slowFactor < 0.65;
      v.s += v.speed * speedMult * slowFactor * dt;

      if (v.s >= seg.total) {
        const overflow = v.s - seg.total;
        if (seg.nextIds && seg.nextIds.length > 0) {
          const nextId = seg.nextIds[i % seg.nextIds.length];
          v.segId = nextId;
          seg = sim.allLaneMap.get(nextId) || seg;
          v.s = Math.min(overflow, seg.total * 0.5);
        } else {
          // Respawn at start of another primary lane segment
          const nextSeg = sim.laneSegments[(i + 3) % sim.laneSegments.length];
          if (nextSeg) {
            v.segId = nextSeg.id;
            seg = nextSeg;
            v.s = 0.5;
          } else {
            v.s = 0;
          }
        }
      }

      const pos = pointAtArc(seg.pts, seg.lengths, v.s);
      const tan = tangentAtArc(seg.pts, seg.lengths, v.s);
      v.worldPos = pos;
      v.worldFwd = tan;
      emitHighDetailVehicle(builder, pos, tan, v.archetype, v.paintId, v.braking, 2000 + emittedVehicles);
      emittedVehicles++;
    }
  }

  // 2. Update & Emit Surface Railway Train (Locomotive + 2 Passenger Coaches)
  const trainOn = !lRail || (lRail.visible && (lRail.params?.railwayEnabled ?? true) && (lRail.params?.trainEnabled ?? true));
  if (trainOn && sim.railways && sim.railways.length > 0) {
    const trainSpeed = lRail?.params?.trainSpeed ?? 14.0;
    for (const rail of sim.railways) {
      if (rail.total < 20) continue;
      sim.trainPhase = (sim.trainPhase + (trainSpeed * dt) / rail.total) % 1.0;
      const headS = sim.trainPhase * rail.total;
      sim.trainPose = {
        pos: pointAtArc(rail.pts, rail.lengths, headS),
        fwd: tangentAtArc(rail.pts, rail.lengths, headS),
      };
      emitMultiCarTrain(builder, rail, headS, false, 2400);
    }
  }

  // 3. Update & Emit Underground Subway Train (3-Car Metro Consist)
  const subwayOn = !lRail || (lRail.visible && (lRail.params?.subwayEnabled ?? true));
  if (subwayOn && sim.subways && sim.subways.length > 0) {
    const trainSpeed = (lRail?.params?.trainSpeed ?? 14.0) * 0.85;
    for (const sub of sim.subways) {
      if (sub.total < 20) continue;
      sim.subwayPhase = (sim.subwayPhase + (trainSpeed * dt) / sub.total) % 1.0;
      const headS = sim.subwayPhase * sub.total;
      sim.subwayPose = {
        pos: pointAtArc(sub.pts, sub.lengths, headS),
        fwd: tangentAtArc(sub.pts, sub.lengths, headS),
      };
      emitMultiCarTrain(builder, sub, headS, true, 2500);
    }
  }

  // 4. Update & Emit Autonomous 6-Wheel Sidewalk Delivery & Inspection Robots
  const robotsOn = !lFurn || (lFurn.visible && (lFurn.params?.robotsEnabled ?? true));
  if (robotsOn && sim.robots && sim.robotPaths.length > 0) {
    const maxRobots = clamp(Math.round(lFurn?.params?.robotCount ?? 8), 0, 16);
    for (let i = 0; i < Math.min(sim.robots.length, maxRobots); i++) {
      const rb = sim.robots[i];
      const path = sim.robotPaths[rb.pathIndex];
      if (!path) continue;
      rb.s += rb.dir * rb.speed * dt;
      if (rb.s >= path.total - 1.5) {
        rb.s = path.total - 1.5;
        rb.dir = -1;
      } else if (rb.s <= 1.5) {
        rb.s = 1.5;
        rb.dir = 1;
      }
      const pos = pointAtArc(path.pts, path.lengths, rb.s);
      const rawTan = tangentAtArc(path.pts, path.lengths, rb.s);
      const tan = rb.dir >= 0 ? rawTan : vScale(rawTan, -1);
      rb.worldPos = pos;
      rb.worldFwd = tan;
      emitAutonomousRobot(builder, pos, tan, i, 2600 + i);
    }
  }

  return builder.toBuffers();
}

/**
 * Emits a high-detail sculpted multi-part vehicle (Chassis lower body, Greenhouse cabin, Sloped windshield/rear glass,
 * Hood/Grille, 4-6 Cylindrical Tires + Alloy Hubs, Side Mirrors, LED Headlights & Tail/Brake Lights).
 */
function emitHighDetailVehicle(builder, pos, tangent, arch, paintId, braking, entityId) {
  const fwd = vNormXZ(tangent, [0, 0, -1]);
  const left = leftNormalXZ(fwd);
  const L = arch.len;
  const W = arch.width;
  const H = arch.height;

  const wheelR = arch.kind === 'bus' || arch.kind === 'truck' ? 0.44 : 0.34;
  const groundClearance = wheelR * 0.65;
  const lowerH = H * 0.46;
  const upperH = H * 0.42;

  // 1. Sculpted Lower Body Tub
  const lowerCenter = [pos[0], pos[1] + groundClearance + lowerH * 0.5, pos[2]];
  builder.addBox(lowerCenter, W, lowerH, L, fwd, MAT.VEHICLE_BODY, paintId, 0, entityId);

  // Front bumper splitter & grille
  const frontPos = vMad(pos, fwd, L * 0.48);
  builder.addBox([frontPos[0], pos[1] + groundClearance + 0.16, frontPos[2]], W * 0.94, 0.22, 0.24, fwd, MAT.STEEL_DARK, 0, 0, entityId);

  // 2. Upper Greenhouse Cabin & Tinted Windshield/Windows
  if (arch.kind === 'bus') {
    const cabCenter = [pos[0], pos[1] + groundClearance + lowerH + upperH * 0.48, pos[2]];
    builder.addBox(cabCenter, W * 0.96, upperH, L * 0.96, fwd, MAT.VEHICLE_GLASS, paintId, 0, entityId);
    const roofCenter = [pos[0], pos[1] + groundClearance + lowerH + upperH + 0.08, pos[2]];
    builder.addBox(roofCenter, W * 0.92, 0.16, L * 0.94, fwd, MAT.VEHICLE_BODY, paintId, 0, entityId);
    // Rooftop HVAC unit
    builder.addBox([pos[0], roofCenter[1] + 0.16, pos[2]], W * 0.58, 0.22, L * 0.38, fwd, MAT.MARKING_WHITE, 0, 0, entityId);
  } else if (arch.kind === 'truck') {
    // Forward Tractor Cab + Rear High-Cube Cargo Box
    const cabPos = vMad(pos, fwd, L * 0.30);
    builder.addBox([cabPos[0], pos[1] + groundClearance + lowerH + upperH * 0.4, cabPos[2]], W * 0.92, upperH * 0.85, L * 0.28, fwd, MAT.VEHICLE_GLASS, paintId, 0, entityId);
    const boxPos = vMad(pos, fwd, -L * 0.14);
    builder.addBox([boxPos[0], pos[1] + groundClearance + lowerH + upperH * 0.6, boxPos[2]], W * 0.98, upperH * 1.25, L * 0.64, fwd, MAT.MARKING_WHITE, paintId, 0, entityId);
  } else {
    // Sedan / Coupé / SUV tapered greenhouse
    const cabLen = arch.kind === 'suv' ? L * 0.64 : L * 0.52;
    const cabOffset = arch.kind === 'suv' ? -L * 0.08 : -L * 0.05;
    const cabPos = vMad(pos, fwd, cabOffset);
    const cabY = pos[1] + groundClearance + lowerH + upperH * 0.45;
    builder.addBox([cabPos[0], cabY, cabPos[2]], W * 0.84, upperH * 0.92, cabLen, fwd, MAT.VEHICLE_GLASS, paintId, 0, entityId);
    // Roof panel above glass
    builder.addBox([cabPos[0], cabY + upperH * 0.48, cabPos[2]], W * 0.78, 0.09, cabLen * 0.82, fwd, MAT.VEHICLE_BODY, paintId, 0, entityId);

    // Side mirrors
    for (const s of [-1, 1]) {
      const mPos = vMad(vMad(pos, fwd, L * 0.14), left, s * (W * 0.54));
      builder.addBox([mPos[0], pos[1] + groundClearance + lowerH + 0.08, mPos[2]], 0.16, 0.11, 0.22, fwd, MAT.VEHICLE_BODY, paintId, 0, entityId);
    }
  }

  // 3. Cylindrical Rubber Tires + Brushed Alloy Wheel Rims
  const axleOffsets = arch.kind === 'bus' || arch.kind === 'truck' ? [-L * 0.34, -L * 0.16, L * 0.32] : [-L * 0.31, L * 0.31];
  for (const ax of axleOffsets) {
    const axleCenter = vMad(pos, fwd, ax);
    for (const side of [-1, 1]) {
      const wInner = vMad(axleCenter, left, side * (W * 0.40));
      const wOuter = vMad(axleCenter, left, side * (W * 0.53));
      wInner[1] = pos[1] + wheelR;
      wOuter[1] = pos[1] + wheelR;
      builder.addCylinder(wInner, wOuter, wheelR, wheelR, 10, MAT.RUBBER_TIRE, 0, 0, entityId);
      const hubOuter = vMad(axleCenter, left, side * (W * 0.54));
      hubOuter[1] = pos[1] + wheelR;
      builder.addCylinder(wOuter, hubOuter, wheelR * 0.62, wheelR * 0.62, 8, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    }
  }

  // 4. Twin High-Beam LED Headlights & Rear Tail/Brake Light Bar
  const hlY = pos[1] + groundClearance + lowerH * 0.62;
  for (const side of [-1, 1]) {
    const hlPos = vMad(vMad(pos, fwd, L * 0.50), left, side * (W * 0.34));
    builder.addBox([hlPos[0], hlY, hlPos[2]], 0.34, 0.14, 0.08, fwd, MAT.EMISSIVE_WHITE, 0, 0, entityId);
  }
  const tlPos = vMad(pos, fwd, -L * 0.50);
  builder.addBox(
    [tlPos[0], hlY + 0.04, tlPos[2]],
    W * 0.82,
    braking ? 0.18 : 0.12,
    0.08,
    fwd,
    MAT.EMISSIVE_RED,
    braking ? 1 : 0,
    0,
    entityId
  );
}

/**
 * Emits a Multi-Car Electric Express Train or Underground Subway Metro Consist!
 */
function emitMultiCarTrain(builder, track, headS, isSubway, entityId) {
  const carCount = 3;
  const carLen = isSubway ? 11.2 : 13.4;
  const carGap = 0.85;
  const carW = isSubway ? 2.65 : 2.92;
  const carH = isSubway ? 2.85 : 3.35;

  for (let c = 0; c < carCount; c++) {
    let s = headS - c * (carLen + carGap);
    while (s < 0) s += track.total;
    s = s % track.total;

    const pos = pointAtArc(track.pts, track.lengths, s);
    const fwd = tangentAtArc(track.pts, track.lengths, s);
    const left = leftNormalXZ(fwd);

    // Track offset (place on Northbound track for railway)
    const latShift = isSubway ? 0.0 : 1.1;
    const center = vMad(pos, left, latShift);
    const baseY = center[1] + 0.32;

    // Underframe Bogies & Steel Wheels
    for (const bogieOff of [-carLen * 0.32, carLen * 0.32]) {
      const bPos = vMad(center, fwd, bogieOff);
      builder.addBox([bPos[0], baseY + 0.25, bPos[2]], carW * 0.82, 0.36, 2.2, fwd, MAT.STEEL_DARK, 0, 0, entityId);
    }

    // Lower & Upper Coach Body + Illuminated Passenger Window Strip
    const bodyMat = isSubway ? MAT.STEEL_GALVANIZED : MAT.VEHICLE_BODY;
    const paintId = isSubway ? 0 : 5;
    builder.addBox([center[0], baseY + 0.85, center[2]], carW, 0.95, carLen, fwd, bodyMat, paintId, 0, entityId);
    builder.addBox([center[0], baseY + 1.65, center[2]], carW * 0.97, 0.72, carLen * 0.94, fwd, MAT.EMISSIVE_WHITE, 0, 0, entityId);
    builder.addBox([center[0], baseY + 2.28, center[2]], carW * 0.94, 0.55, carLen * 0.98, fwd, bodyMat, paintId, 0, entityId);

    // Lead Car Nose Cone, Headlights & Roof Pantograph
    if (c === 0) {
      const nosePos = vMad(center, fwd, carLen * 0.52);
      builder.addBox([nosePos[0], baseY + 1.1, nosePos[2]], carW * 0.86, 1.25, 0.95, fwd, bodyMat, paintId, 0, entityId);
      builder.addBox([nosePos[0], baseY + 0.95, nosePos[2]], carW * 0.68, 0.24, 1.05, fwd, MAT.EMISSIVE_WHITE, 0, 0, entityId);
      if (!isSubway) {
        // Overhead Pantograph Collector Frame
        const pantoPos = vMad(center, fwd, -carLen * 0.2);
        builder.addBox([pantoPos[0], baseY + carH + 0.45, pantoPos[2]], 1.4, 0.85, 1.6, fwd, MAT.STEEL_GALVANIZED, 0, 0, entityId);
      } else {
        // Subway Cyan Destination Header
        builder.addBox([nosePos[0], baseY + 2.15, nosePos[2]], carW * 0.62, 0.26, 0.98, fwd, MAT.EMISSIVE_CYAN, 0, 0, entityId);
      }
    }
  }
}

/**
 * Emits a high-detail 6-Wheel Autonomous Sidewalk Delivery / Road-Inspection Robot!
 */
function emitAutonomousRobot(builder, pos, tangent, index, entityId) {
  const fwd = vNormXZ(tangent, [0, 0, -1]);
  const left = leftNormalXZ(fwd);

  // Contoured Cargo Pod + Lower Rocker Chassis
  builder.addBox([pos[0], pos[1] + 0.20, pos[2]], 0.56, 0.16, 0.74, fwd, MAT.STEEL_DARK, 0, 0, entityId);
  builder.addBox([pos[0], pos[1] + 0.42, pos[2]], 0.52, 0.30, 0.68, fwd, MAT.MARKING_WHITE, 0, 0, entityId);

  // Glowing Cyan Front Sensor Visor
  const visorPos = vMad(pos, fwd, 0.35);
  builder.addBox([visorPos[0], pos[1] + 0.44, visorPos[2]], 0.42, 0.10, 0.06, fwd, MAT.EMISSIVE_CYAN, 0, 0, entityId);

  // 360° LiDAR Puck Dome + High-Visibility Safety Flag Mast
  builder.addCylinder([pos[0], pos[1] + 0.57, pos[2]], [pos[0], pos[1] + 0.66, pos[2]], 0.11, 0.10, 8, MAT.STEEL_DARK, 0, 0, entityId);
  const mastBase = vMad(vMad(pos, fwd, -0.24), left, 0.18);
  builder.addCylinder([mastBase[0], pos[1] + 0.55, mastBase[2]], [mastBase[0], pos[1] + 1.28, mastBase[2]], 0.018, 0.014, 6, MAT.STEEL_DARK, 0, 0, entityId);
  builder.addBox([mastBase[0], pos[1] + 1.32, mastBase[2]], 0.08, 0.10, 0.14, fwd, index % 2 === 0 ? MAT.EMISSIVE_AMBER : MAT.CONSTRUCTION_ORANGE, 0, 0, entityId);

  // 6 Rocker-Bogie Wheels (3 per side)
  for (const zOff of [-0.24, 0, 0.24]) {
    const axle = vMad(pos, fwd, zOff);
    for (const side of [-1, 1]) {
      const wIn = vMad(axle, left, side * 0.26);
      const wOut = vMad(axle, left, side * 0.32);
      wIn[1] = pos[1] + 0.11;
      wOut[1] = pos[1] + 0.11;
      builder.addCylinder(wIn, wOut, 0.11, 0.11, 8, MAT.RUBBER_TIRE, 0, 0, entityId);
    }
  }
}
