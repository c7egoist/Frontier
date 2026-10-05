import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RoadBuilder, sampleSplineNodes, Vec3 } from '../lib/geometry';
import { PatchMesh, PillarMesh, PillarFooting } from './PatchMesh';

export interface SplineNode {
  id: string;
  position: Vec3;
  handle1: Vec3;
  handle2: Vec3;
}

export interface RoadSpline {
  id: string;
  name: string;
  nodes: SplineNode[];
  closed: boolean;
  profile: {
    roadWidth: number;
    laneCount: number;
    paveLeft: number;
    paveRight: number;
    curbHeight: number;
    isBridge: boolean;
    bridgeDepth: number;
    bridgePillarSpacing: number;
    elevation: number;
  };
  visible: boolean;
}

export function RoadNetwork({ splines }: { splines: RoadSpline[] }) {
  const built = useMemo(() => {
    return splines.filter(s => s.visible && s.nodes.length >= 2).map(spline => {
      const rawCurve = sampleSplineNodes(spline.nodes, spline.closed, 32);
      // Apply elevation offset
      const elevated = rawCurve.map(p => [p[0], p[1], p[2] + spline.profile.elevation] as Vec3);

      const builder = new RoadBuilder({
        roadWidth: spline.profile.roadWidth,
        laneCount: spline.profile.laneCount,
        paveLeft: spline.profile.paveLeft,
        paveRight: spline.profile.paveRight,
        curbHeight: spline.profile.curbHeight,
        isBridge: spline.profile.isBridge,
        bridgeDepth: spline.profile.bridgeDepth,
        bridgePillarSpacing: spline.profile.bridgePillarSpacing,
      });

      const result = builder.build(elevated);
      return { spline, result };
    });
  }, [splines]);

  return (
    <group>
      {built.map(({ spline, result }) => (
        <group key={spline.id}>
          {result.patches.map((patch, i) => (
            <PatchMesh key={`${spline.id}-patch-${i}`} patch={patch} />
          ))}
          {result.pillars.map((pillar, i) => (
            <group key={`${spline.id}-pillar-${i}`}>
              <PillarMesh pos={pillar.pos} height={pillar.height} radius={pillar.radius} />
              <PillarFooting pos={pillar.pos} radius={pillar.radius} />
            </group>
          ))}
          {/* Lane markings */}
          <LaneMarkings centerLine={result.centerLine} roadWidth={spline.profile.roadWidth} laneCount={spline.profile.laneCount} />
        </group>
      ))}
    </group>
  );
}

function LaneMarkings({ centerLine, roadWidth, laneCount }: { centerLine: Vec3[], roadWidth: number, laneCount: number }) {
  const lines = useMemo(() => {
    if (laneCount <= 1 || centerLine.length < 2) return [];
    const result: Vec3[][] = [];
    // Compute frames
    const frames: { tangent: Vec3, normal: Vec3 }[] = [];
    for (let i = 0; i < centerLine.length; i++) {
      let t: Vec3;
      if (i === 0) {
        const d = [centerLine[1][0] - centerLine[0][0], centerLine[1][1] - centerLine[0][1], 0] as Vec3;
        const len = Math.hypot(d[0], d[1]);
        t = len > 1e-9 ? [d[0] / len, d[1] / len, 0] : [1, 0, 0];
      } else if (i === centerLine.length - 1) {
        const d = [centerLine[i][0] - centerLine[i - 1][0], centerLine[i][1] - centerLine[i - 1][1], 0] as Vec3;
        const len = Math.hypot(d[0], d[1]);
        t = len > 1e-9 ? [d[0] / len, d[1] / len, 0] : [1, 0, 0];
      } else {
        const d1 = [centerLine[i][0] - centerLine[i - 1][0], centerLine[i][1] - centerLine[i - 1][1], 0] as Vec3;
        const d2 = [centerLine[i + 1][0] - centerLine[i][0], centerLine[i + 1][1] - centerLine[i][1], 0] as Vec3;
        const len1 = Math.hypot(d1[0], d1[1]);
        const len2 = Math.hypot(d2[0], d2[1]);
        const n1 = len1 > 1e-9 ? [d1[0] / len1, d1[1] / len1, 0] as Vec3 : [1, 0, 0] as Vec3;
        const n2 = len2 > 1e-9 ? [d2[0] / len2, d2[1] / len2, 0] as Vec3 : [1, 0, 0] as Vec3;
        const avg: Vec3 = [(n1[0] + n2[0]) * 0.5, (n1[1] + n2[1]) * 0.5, 0];
        const len = Math.hypot(avg[0], avg[1]);
        t = len > 1e-9 ? [avg[0] / len, avg[1] / len, 0] : [1, 0, 0];
      }
      const n: Vec3 = [-t[1], t[0], 0];
      frames.push({ tangent: t, normal: n });
    }

    const laneWidth = roadWidth / laneCount;
    for (let lane = 1; lane < laneCount; lane++) {
      const offset = -roadWidth / 2 + lane * laneWidth;
      const line: Vec3[] = centerLine.map((p, i) => {
        const n = frames[i].normal;
        return [p[0] + n[0] * offset, p[1] + n[1] * offset, p[2] + 0.02] as Vec3;
      });
      result.push(line);
    }
    return result;
  }, [centerLine, roadWidth, laneCount]);

  return (
    <group>
      {lines.map((line, idx) => {
        // Create dashed line via segments
        const segments: Vec3[][] = [];
        const dashLen = 3;
        const gapLen = 4;
        let acc = 0;
        let currentSeg: Vec3[] = [];
        let drawing = true;
        let nextSwitch = dashLen;

        for (let i = 0; i < line.length - 1; i++) {
          const a = line[i];
          const b = line[i + 1];
          const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);

          if (drawing) {
            currentSeg.push(a);
            if (acc + segLen >= nextSwitch) {
              // Interpolate end
              const t = (nextSwitch - acc) / segLen;
              const mid: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
              currentSeg.push(mid);
              segments.push([...currentSeg]);
              currentSeg = [];
              drawing = false;
              nextSwitch += gapLen;
            }
          } else {
            if (acc + segLen >= nextSwitch) {
              drawing = true;
              nextSwitch += dashLen;
            }
          }
          acc += segLen;
        }
        if (drawing && currentSeg.length > 0) {
          currentSeg.push(line[line.length - 1]);
          segments.push(currentSeg);
        }

        return segments.map((seg, sIdx) => {
          if (seg.length < 2) return null;
          const pts = seg.map(p => new THREE.Vector3(p[0], p[2] + 0.03, -p[1]));
          const geom = new THREE.BufferGeometry().setFromPoints(pts);
          return (
            <primitive key={`${idx}-${sIdx}`} object={new THREE.Line(geom, new THREE.LineBasicMaterial({ color: '#e5e5e5', transparent: true, opacity: 0.9 }))} />
          );
        });
      })}
    </group>
  );
}
