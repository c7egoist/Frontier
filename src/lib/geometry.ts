export type Vec3 = [number, number, number];

export function v_add(a: Vec3, b: Vec3): Vec3 { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
export function v_sub(a: Vec3, b: Vec3): Vec3 { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
export function v_scale(a: Vec3, s: number): Vec3 { return [a[0]*s, a[1]*s, a[2]*s]; }
export function v_dot(a: Vec3, b: Vec3): number { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
export function v_len(a: Vec3): number { return Math.sqrt(v_dot(a,a)); }
export function v_norm(a: Vec3): Vec3 {
  const l = v_len(a);
  if (l < 1e-9) return [1,0,0];
  return [a[0]/l, a[1]/l, a[2]/l];
}
export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
}
export function left_normal_xy(dir: Vec3): Vec3 {
  // dir is in XY plane, Z up
  const n: Vec3 = [-dir[1], dir[0], 0];
  return v_norm(n);
}

export interface RoadProfile {
  roadWidth: number;
  laneCount: number;
  paveLeft: number;
  paveRight: number;
  curbHeight: number;
  curbThickness: number;
  bridgeDepth: number;
  bridgeInset: number;
  isBridge: boolean;
  bridgePillarSpacing: number;
  bridgePillarRadius: number;
  guardRail: boolean;
}

export interface PatchSpec {
  name: string;
  grid: Vec3[][];
  color: string;
  alpha: number;
  type?: 'road'|'pave'|'curb'|'bridge'|'rail'|'pillar'|'deck';
}

export interface BridgePillar {
  pos: Vec3;
  height: number;
  radius: number;
}

export interface RoadBuildResult {
  patches: PatchSpec[];
  pillars: BridgePillar[];
  centerLine: Vec3[];
  leftRoadEdge: Vec3[];
  rightRoadEdge: Vec3[];
  leftPaveOuter: Vec3[];
  rightPaveOuter: Vec3[];
}

// ---------- Curve sampling ----------
export function sampleCubicBezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, count: number): Vec3[] {
  const res: Vec3[] = [];
  for (let i=0;i<count;i++) {
    const t = i/(count-1);
    const mt = 1-t;
    const w0 = mt*mt*mt;
    const w1 = 3*mt*mt*t;
    const w2 = 3*mt*t*t;
    const w3 = t*t*t;
    res.push([
      w0*p0[0]+w1*p1[0]+w2*p2[0]+w3*p3[0],
      w0*p0[1]+w1*p1[1]+w2*p2[1]+w3*p3[1],
      w0*p0[2]+w1*p1[2]+w2*p2[2]+w3*p3[2],
    ]);
  }
  return res;
}

export function sampleSplineNodes(nodes: {position: Vec3, handle1: Vec3, handle2: Vec3}[], closed: boolean, samplesPerSeg=24): Vec3[] {
  if (nodes.length < 2) return nodes.map(n=>n.position);
  const pts: Vec3[] = [];
  const segCount = closed ? nodes.length : nodes.length-1;
  for (let i=0;i<segCount;i++) {
    const n1 = nodes[i];
    const n2 = nodes[(i+1)%nodes.length];
    const seg = sampleCubicBezier(n1.position, n1.handle2, n2.handle1, n2.position, samplesPerSeg);
    if (i>0) seg.shift(); // avoid duplicate
    pts.push(...seg);
  }
  return pts;
}

export function resamplePolylineUniform(points: Vec3[], targetCount: number): Vec3[] {
  if (points.length===0) return [];
  if (points.length===1) return Array(targetCount).fill(points[0]);
  // compute cumulative length in XY + Z
  const lens: number[] = [0];
  for (let i=0;i<points.length-1;i++) {
    lens.push(lens[lens.length-1] + v_len(v_sub(points[i+1], points[i])));
  }
  const total = lens[lens.length-1];
  if (total < 1e-9) return Array(targetCount).fill(points[0]);
  const res: Vec3[] = [];
  for (let i=0;i<targetCount;i++) {
    const t = total * i/(targetCount-1);
    // find segment
    let idx = 0;
    for (let j=0;j<lens.length-1;j++) {
      if (t>=lens[j] && t<=lens[j+1]) { idx=j; break; }
      if (j===lens.length-2) idx=j;
    }
    const segLen = lens[idx+1]-lens[idx];
    const local = segLen<1e-9?0:(t-lens[idx])/segLen;
    res.push(lerp(points[idx], points[idx+1], local));
  }
  return res;
}

// ---------- Improved offset with miter joints ----------
interface TangentFrame { tangent: Vec3; normal: Vec3; }

function computeFrames(curve: Vec3[]): TangentFrame[] {
  const N = curve.length;
  const frames: TangentFrame[] = [];
  for (let i=0;i<N;i++) {
    let t: Vec3;
    if (i===0) t = v_norm(v_sub(curve[1], curve[0]));
    else if (i===N-1) t = v_norm(v_sub(curve[N-1], curve[N-2]));
    else {
      const d1 = v_norm(v_sub(curve[i], curve[i-1]));
      const d2 = v_norm(v_sub(curve[i+1], curve[i]));
      t = v_norm(v_add(d1, d2));
    }
    const n = left_normal_xy(t);
    frames.push({tangent:t, normal:n});
  }
  // Smooth normals to avoid flipping on sharp curves - average with neighbors
  for (let iter=0; iter<2; iter++) {
    for (let i=1;i<N-1;i++) {
      const avg = v_norm(v_add(frames[i-1].normal, v_add(frames[i].normal, frames[i+1].normal)));
      // keep roughly perpendicular to tangent
      const t = frames[i].tangent;
      // project avg onto plane perpendicular to t
      const dot = v_dot(avg, t);
      const proj: Vec3 = v_norm(v_sub(avg, v_scale(t, dot)));
      if (v_len(proj)>1e-6) frames[i].normal = proj;
    }
  }
  return frames;
}

function lineIntersection2D(p1: Vec3, d1: Vec3, p2: Vec3, d2: Vec3): Vec3 | null {
  // Solve p1 + t*d1 = p2 + s*d2 in XY
  const det = d1[0]*d2[1] - d1[1]*d2[0];
  if (Math.abs(det) < 1e-8) return null;
  const dx = p2[0]-p1[0];
  const dy = p2[1]-p1[1];
  const t = (dx*d2[1] - dy*d2[0]) / det;
  return [p1[0]+d1[0]*t, p1[1]+d1[1]*t, (p1[2]+p2[2])*0.5];
}

// Compute offset polyline with proper miter joins
export function computeOffsetPolyline(curve: Vec3[], frames: TangentFrame[], offset: number): Vec3[] {
  const N = curve.length;
  if (N<2) return curve.map(p=>v_add(p, v_scale(frames[0]?.normal ?? [0,1,0], offset)));
  const result: Vec3[] = [];
  for (let i=0;i<N;i++) {
    if (i===0 || i===N-1) {
      result.push(v_add(curve[i], v_scale(frames[i].normal, offset)));
    } else {
      // offset lines of adjacent segments
      const pPrev = curve[i-1];
      const pCurr = curve[i];
      const pNext = curve[i+1];
      const tPrev = frames[i-1].tangent;
      const tCurr = frames[i].tangent;
      // Actually need segment tangents, not frame tangents for line directions
      const seg1Dir = v_norm(v_sub(pCurr, pPrev));
      const seg2Dir = v_norm(v_sub(pNext, pCurr));
      const n1 = left_normal_xy(seg1Dir);
      const n2 = left_normal_xy(seg2Dir);
      const offP1 = v_add(pPrev, v_scale(n1, offset));
      const offP2a = v_add(pCurr, v_scale(n1, offset));
      const offP2b = v_add(pCurr, v_scale(n2, offset));
      const offP3 = v_add(pNext, v_scale(n2, offset));
      const inter = lineIntersection2D(offP1, seg1Dir, offP2b, seg2Dir);
      if (inter) {
        // Check miter length limit to avoid spikes
        const miterVec = v_sub(inter, pCurr);
        const miterLen = v_len(miterVec);
        const maxMiter = Math.abs(offset)*3.5;
        if (miterLen <= maxMiter && miterLen > 0) {
          // Keep Z from original
          result.push([inter[0], inter[1], pCurr[2]]);
        } else {
          // Bevel join - use average offset
          result.push(v_add(pCurr, v_scale(frames[i].normal, offset)));
        }
      } else {
        result.push(v_add(pCurr, v_scale(frames[i].normal, offset)));
      }
    }
  }
  return result;
}

// ---------- Road builder with fixed pavement/curbs + bridges ----------
export class RoadBuilder {
  profile: RoadProfile;

  constructor(profile?: Partial<RoadProfile>) {
    this.profile = {
      roadWidth: profile?.roadWidth ?? 8,
      laneCount: profile?.laneCount ?? 2,
      paveLeft: profile?.paveLeft ?? 2.2,
      paveRight: profile?.paveRight ?? 2.2,
      curbHeight: profile?.curbHeight ?? 0.15,
      curbThickness: profile?.curbThickness ?? 0.15,
      bridgeDepth: profile?.bridgeDepth ?? 1.2,
      bridgeInset: profile?.bridgeInset ?? 0.3,
      isBridge: profile?.isBridge ?? false,
      bridgePillarSpacing: profile?.bridgePillarSpacing ?? 18,
      bridgePillarRadius: profile?.bridgePillarRadius ?? 0.6,
      guardRail: profile?.guardRail ?? true,
    };
  }

  build(curve: Vec3[]): RoadBuildResult {
    if (curve.length < 2) return { patches:[], pillars:[], centerLine:curve, leftRoadEdge:[], rightRoadEdge:[], leftPaveOuter:[], rightPaveOuter:[] };

    // Ensure uniform sampling for clean topology
    const uniform = resamplePolylineUniform(curve, Math.max(64, Math.floor(v_len(v_sub(curve[curve.length-1], curve[0]))*1.2)));
    const frames = computeFrames(uniform);
    const N = uniform.length;

    const halfW = this.profile.roadWidth/2;
    const paveL = this.profile.paveLeft;
    const paveR = this.profile.paveRight;
    const curbH = this.profile.curbHeight;
    const bridgeDepth = this.profile.bridgeDepth;
    const bridgeInset = this.profile.bridgeInset;

    // Core road edges with miter joins - FIXES CURVE PAVEMENT
    const leftRoad = computeOffsetPolyline(uniform, frames, halfW);
    const rightRoad = computeOffsetPolyline(uniform, frames, -halfW);
    const leftPaveOuter = computeOffsetPolyline(uniform, frames, halfW + paveL);
    const rightPaveOuter = computeOffsetPolyline(uniform, frames, -(halfW + paveR));

    // Raised versions for pavement top
    const leftRoadRaised = leftRoad.map(p=>[p[0], p[1], p[2]+curbH] as Vec3);
    const rightRoadRaised = rightRoad.map(p=>[p[0], p[1], p[2]+curbH] as Vec3);
    const leftPaveOuterRaised = leftPaveOuter.map(p=>[p[0], p[1], p[2]+curbH] as Vec3);
    const rightPaveOuterRaised = rightPaveOuter.map(p=>[p[0], p[1], p[2]+curbH] as Vec3);

    const patches: PatchSpec[] = [];

    // 1. Road surface - clean quad topology
    patches.push({
      name: 'Road',
      grid: [leftRoad, rightRoad],
      color: '#2a2a2a',
      alpha: 1,
      type: 'road'
    });

    // 2. Curb vertical faces - FIXED: proper extrusion along curve, no gaps
    patches.push({
      name: 'Curb Left',
      grid: [leftRoad, leftRoadRaised],
      color: '#4a4a4a',
      alpha: 1,
      type: 'curb'
    });
    patches.push({
      name: 'Curb Right',
      grid: [rightRoadRaised, rightRoad],
      color: '#4a4a4a',
      alpha: 1,
      type: 'curb'
    });

    // 3. Pavement tops - follows road curvature perfectly
    patches.push({
      name: 'Pavement Left',
      grid: [leftPaveOuterRaised, leftRoadRaised],
      color: '#8a8a8a',
      alpha: 1,
      type: 'pave'
    });
    patches.push({
      name: 'Pavement Right',
      grid: [rightRoadRaised, rightPaveOuterRaised],
      color: '#8a8a8a',
      alpha: 1,
      type: 'pave'
    });

    // 4. Pavement outer curb drop (small lip)
    const leftPaveOuterLower = leftPaveOuter.map(p=>[p[0], p[1], p[2]+curbH*0.5] as Vec3);
    const rightPaveOuterLower = rightPaveOuter.map(p=>[p[0], p[1], p[2]+curbH*0.5] as Vec3);
    patches.push({
      name: 'Pave Lip Left',
      grid: [leftPaveOuterRaised, leftPaveOuterLower],
      color: '#6a6a6a',
      alpha: 1,
      type: 'curb'
    });
    patches.push({
      name: 'Pave Lip Right',
      grid: [rightPaveOuterLower, rightPaveOuterRaised],
      color: '#6a6a6a',
      alpha: 1,
      type: 'curb'
    });

    // 5. Bridge superstructure if elevated or marked as bridge
    const avgZ = uniform.reduce((s,p)=>s+p[2],0)/N;
    const isBridge = this.profile.isBridge || avgZ > 2.0 || uniform.some(p=>p[2]>3);
    const pillars: BridgePillar[] = [];

    if (isBridge) {
      // Deck bottom with inset for clean look
      const leftBottom = leftPaveOuter.map((p,i)=>{
        const n = frames[i].normal;
        return [p[0]-n[0]*bridgeInset, p[1]-n[1]*bridgeInset, p[2]-bridgeDepth] as Vec3;
      });
      const rightBottom = rightPaveOuter.map((p,i)=>{
        const n = frames[i].normal;
        return [p[0]-n[0]*bridgeInset, p[1]-n[1]*bridgeInset, p[2]-bridgeDepth] as Vec3;
      });
      // Actually inset should be inward
      const leftBottomInner = leftPaveOuter.map((p,i)=>{
        const n = frames[i].normal;
        return v_add(p, v_scale(n, -bridgeInset)) as Vec3;
      }).map(p=>[p[0], p[1], p[2]-bridgeDepth] as Vec3);
      const rightBottomInner = rightPaveOuter.map((p,i)=>{
        const n = frames[i].normal;
        return v_add(p, v_scale(n, bridgeInset)) as Vec3;
      }).map(p=>[p[0], p[1], p[2]-bridgeDepth] as Vec3);

      // Side walls - critical for bridge visual
      patches.push({
        name: 'Bridge Side Left',
        grid: [leftBottomInner, leftPaveOuterRaised],
        color: '#5a5a5a',
        alpha: 1,
        type: 'bridge'
      });
      patches.push({
        name: 'Bridge Side Right',
        grid: [rightPaveOuterRaised, rightBottomInner],
        color: '#5a5a5a',
        alpha: 1,
        type: 'bridge'
      });

      // Bottom deck
      patches.push({
        name: 'Bridge Bottom',
        grid: [rightBottomInner, leftBottomInner],
        color: '#4a4a4a',
        alpha: 1,
        type: 'deck'
      });

      // Girders - longitudinal beams under deck
      const girderCount = 3;
      for (let g=0; g<girderCount; g++) {
        const t = (g+0.5)/girderCount; // 0..1 across road
        // Interpolate between leftRoad and rightRoad
        const girderTop = uniform.map((_,i)=>{
          const l = leftRoad[i];
          const r = rightRoad[i];
          const x = l[0]*(1-t)+r[0]*t;
          const y = l[1]*(1-t)+r[1]*t;
          const z = (l[2]+r[2])*0.5 - 0.15;
          return [x,y,z] as Vec3;
        });
        const girderBottom = girderTop.map(p=>[p[0], p[1], p[2]-bridgeDepth*0.7] as Vec3);
        patches.push({
          name: `Girder ${g} Side A`,
          grid: [girderTop, girderBottom],
          color: '#3a3a3a',
          alpha: 1,
          type: 'bridge'
        });
      }

      // Pillars
      const totalLen = (()=>{ let l=0; for(let i=0;i<N-1;i++) l+=v_len(v_sub(uniform[i+1], uniform[i])); return l; })();
      const spacing = this.profile.bridgePillarSpacing;
      let acc = 0;
      let nextPillarAt = spacing;
      for (let i=0;i<N-1;i++) {
        const segLen = v_len(v_sub(uniform[i+1], uniform[i]));
        acc += segLen;
        if (acc >= nextPillarAt) {
          // Don't place pillars at very low sections
          if (uniform[i][2] > 1.0) {
            pillars.push({
              pos: [uniform[i][0], uniform[i][1], uniform[i][2]-bridgeDepth],
              height: uniform[i][2],
              radius: this.profile.bridgePillarRadius
            });
          }
          nextPillarAt += spacing;
        }
      }
    }

    // Guard rails if needed
    if (this.profile.guardRail && isBridge) {
      // Simple rail lines
      const railHeight = 0.9;
      const leftRail = leftPaveOuterRaised.map(p=>[p[0], p[1], p[2]+railHeight] as Vec3);
      const rightRail = rightPaveOuterRaised.map(p=>[p[0], p[1], p[2]+railHeight] as Vec3);
      patches.push({
        name: 'Guard Left',
        grid: [leftPaveOuterRaised, leftRail],
        color: '#cbd5e1',
        alpha: 1,
        type: 'rail'
      });
      patches.push({
        name: 'Guard Right',
        grid: [rightRail, rightPaveOuterRaised],
        color: '#cbd5e1',
        alpha: 1,
        type: 'rail'
      });
    }

    return {
      patches,
      pillars,
      centerLine: uniform,
      leftRoadEdge: leftRoad,
      rightRoadEdge: rightRoad,
      leftPaveOuter,
      rightPaveOuter
    };
  }
}

// Junction builder - improved with pavement continuity
export interface JunctionArm {
  angleDeg: number;
  width: number;
  paveLeft: number;
  paveRight: number;
}

export function buildJunction(center: Vec3, arms: JunctionArm[], filletRadius=5): PatchSpec[] {
  // Simple fan junction - for N arms, create central polygon and filleted corners
  const patches: PatchSpec[] = [];
  const N = arms.length;
  if (N<2) return patches;

  // Sort arms by angle
  const sorted = [...arms].sort((a,b)=>a.angleDeg-b.angleDeg);
  const dirs = sorted.map(a=>{
    const rad = a.angleDeg*Math.PI/180;
    return [Math.cos(rad), Math.sin(rad), 0] as Vec3;
  });
  const normals = dirs.map(d=>[-d[1], d[0], 0] as Vec3);

  const halfWs = sorted.map(a=>a.width/2);
  const centers: Vec3[] = [];
  const leftEdges: Vec3[] = [];
  const rightEdges: Vec3[] = [];
  const leftPave: Vec3[] = [];
  const rightPave: Vec3[] = [];

  for (let i=0;i<N;i++) {
    const d = dirs[i];
    const n = normals[i];
    const hw = halfWs[i];
    const pl = sorted[i].paveLeft;
    const pr = sorted[i].paveRight;
    const dist = 12; // arm length in junction
    const mc: Vec3 = v_add(center, v_scale(d, dist));
    mc[2] = center[2];
    centers.push(mc);
    leftEdges.push(v_add(mc, v_scale(n, hw)));
    rightEdges.push(v_add(mc, v_scale(n, -hw)));
    leftPave.push(v_add(mc, v_scale(n, hw+pl)));
    rightPave.push(v_add(mc, v_scale(n, -(hw+pr))));
  }

  // Central road polygon - triangulated fan
  const centralRoad: Vec3[] = [];
  for (let i=0;i<N;i++) {
    const next = (i+1)%N;
    // Create corner points
    centralRoad.push(leftEdges[i]);
    centralRoad.push(rightEdges[next]);
  }
  // For simplicity, create coons patches between arms
  for (let i=0;i<N;i++) {
    const next = (i+1)%N;
    // Fillet curve between left of i and right of next
    const p1 = leftEdges[i];
    const p2 = rightEdges[next];
    const midAngle = (sorted[i].angleDeg + sorted[next].angleDeg)/2;
    // handle wrap around 360
    let gap = sorted[next].angleDeg - sorted[i].angleDeg;
    if (gap<0) gap+=360;
    const midRad = (sorted[i].angleDeg + gap/2)*Math.PI/180;
    const filletCenter: Vec3 = [
      center[0]+Math.cos(midRad)*filletRadius,
      center[1]+Math.sin(midRad)*filletRadius,
      center[2]
    ];
    // Approximate fillet as 3 points
    const fillet = [
      p1,
      filletCenter,
      p2
    ];
    // Road fillet patch
    patches.push({
      name: `Junction Road ${i}`,
      grid: [[center, p1], [center, filletCenter], [center, p2]],
      color: '#2a2a2a',
      alpha: 1,
      type: 'road'
    });
    // Pavement fillet
    const pp1 = leftPave[i];
    const pp2 = rightPave[next];
    const paveMid: Vec3 = [
      center[0]+Math.cos(midRad)*(filletRadius+sorted[i].paveLeft),
      center[1]+Math.sin(midRad)*(filletRadius+sorted[i].paveRight),
      center[2]+0.15
    ];
    patches.push({
      name: `Junction Pave ${i}`,
      grid: [[p1, pp1], [filletCenter, paveMid], [p2, pp2]],
      color: '#8a8a8a',
      alpha: 1,
      type: 'pave'
    });
  }

  // Central cap
  patches.push({
    name: 'Junction Center',
    grid: [leftEdges, rightEdges], // not perfect but for patch renderer we need grid; we'll use fan via custom geometry later
    color: '#2a2a2a',
    alpha: 1,
    type: 'road'
  });

  return patches;
}
