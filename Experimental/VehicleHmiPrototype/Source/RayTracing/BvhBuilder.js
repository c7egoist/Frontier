// BvhBuilder.js — two-level BVH for the WebGPU ReSTIR path tracer.
// BLAS: one binned-SAH BVH per facet set, built once. TLAS: median-split BVH
// over the raster-visible occupants, rebuilt per frame on CPU (~500 instances).
// Buffer layouts match RayCommon.wgsl: Node = min.xyz,left | max.xyz,count
// (left = child node index for interior, first triangle for leaves; integers
// stored in f32 slots, exact below 2^24). Tri = A(mat), B, C, geomNormal.

import { OccupantRole } from "../FacetStructure.js";
import { TransformPoint } from "../TransformProjection.js";

export const NODE_FLOATS = 8;

function boxArea(mn, mx) {
  const x = Math.max(0, mx[0]-mn[0]), y = Math.max(0, mx[1]-mn[1]), z = Math.max(0, mx[2]-mn[2]);
  return 2*(x*y + y*z + z*x);
}

// Binned-SAH BVH. pos: Float32Array, 9 floats/triangle. Node indices in the
// returned array are local to this BVH; caller offsets them when merging.
export function BuildBvh(pos) {
  const count = pos.length / 9;
  const indices = new Uint32Array(count);
  const centroids = new Float32Array(count*3), bounds = new Float32Array(count*6);
  for (let i = 0; i < count; i++) {
    indices[i] = i;
    const mn=[1e30,1e30,1e30], mx=[-1e30,-1e30,-1e30], c=[0,0,0];
    for (let k=0;k<3;k++) for (let a=0;a<3;a++) {
      const v = pos[i*9+k*3+a];
      mn[a]=Math.min(mn[a],v); mx[a]=Math.max(mx[a],v); c[a]+=v/3;
    }
    bounds.set([...mn,...mx], i*6); centroids.set(c, i*3);
  }
  const nodes = [];
  const push = () => { nodes.push(0,0,0,0, 0,0,0,0); return nodes.length/NODE_FLOATS - 1; };
  const stack = [[push(), 0, count]];
  while (stack.length) {
    const [ni, start, n] = stack.pop(), o = ni*NODE_FLOATS;
    const mn=[1e30,1e30,1e30], mx=[-1e30,-1e30,-1e30];
    for (let i=start;i<start+n;i++){ const t=indices[i]; for(let a=0;a<3;a++){ mn[a]=Math.min(mn[a],bounds[t*6+a]); mx[a]=Math.max(mx[a],bounds[t*6+3+a]); } }
    nodes[o]=mn[0];nodes[o+1]=mn[1];nodes[o+2]=mn[2]; nodes[o+4]=mx[0];nodes[o+5]=mx[1];nodes[o+6]=mx[2];
    let best = null;
    if (n > 4) {
      const parentArea = boxArea(mn,mx) || 1e-12, BINS = 16;
      for (let axis=0; axis<3; axis++) {
        let cmn=1e30, cmx=-1e30;
        for(let i=start;i<start+n;i++){ const c=centroids[indices[i]*3+axis]; cmn=Math.min(cmn,c); cmx=Math.max(cmx,c); }
        if (cmx-cmn < 1e-12) continue;
        const bins = Array.from({length:BINS},()=>({n:0,mn:[1e30,1e30,1e30],mx:[-1e30,-1e30,-1e30]}));
        for(let i=start;i<start+n;i++){ const t=indices[i], b=Math.min(BINS-1, ((centroids[t*3+axis]-cmn)/(cmx-cmn)*BINS)|0), bin=bins[b];
          bin.n++; for(let a=0;a<3;a++){ bin.mn[a]=Math.min(bin.mn[a],bounds[t*6+a]); bin.mx[a]=Math.max(bin.mx[a],bounds[t*6+3+a]); } }
        for(let split=1;split<BINS;split++){
          const L={n:0,mn:[1e30,1e30,1e30],mx:[-1e30,-1e30,-1e30]}, R={n:0,mn:[1e30,1e30,1e30],mx:[-1e30,-1e30,-1e30]};
          const acc=(D,bin)=>{ if(!bin.n)return; D.n+=bin.n; for(let a=0;a<3;a++){D.mn[a]=Math.min(D.mn[a],bin.mn[a]);D.mx[a]=Math.max(D.mx[a],bin.mx[a]);} };
          for(let b=0;b<split;b++)acc(L,bins[b]); for(let b=split;b<BINS;b++)acc(R,bins[b]);
          if(!L.n||!R.n) continue;
          const cost = 0.125 + (L.n*boxArea(L.mn,L.mx) + R.n*boxArea(R.mn,R.mx))/parentArea;
          if(!best||cost<best.cost) best={cost,axis,split,cmn,cmx,BINS};
        }
      }
    }
    if (!best || best.cost >= n) { nodes[o+3]=start; nodes[o+7]=n; continue; }
    let lo=start, hi=start+n-1;
    const splitPos = best.cmn + (best.cmx-best.cmn)*best.split/best.BINS;
    while (lo<=hi){ const t=indices[lo]; if (centroids[t*3+best.axis] < splitPos) lo++; else { indices[lo]=indices[hi]; indices[hi]=t; hi--; } }
    const mid = lo;
    if (mid===start || mid===start+n) { nodes[o+3]=start; nodes[o+7]=n; continue; }
    const L=push(), R=push();
    nodes[o+3]=L; nodes[o+7]=0;
    stack.push([L,start,mid-start],[R,mid,start+n-mid]);
  }
  return { nodes: new Float32Array(nodes), indices };
}

function facetNormal(c) {
  const u=[c[1][0]-c[0][0],c[1][1]-c[0][1],c[1][2]-c[0][2]];
  const v=[c[2][0]-c[0][0],c[2][1]-c[0][1],c[2][2]-c[0][2]];
  const n=[u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
  const l=Math.hypot(...n)||1; return n.map(x=>x/l);
}

export class RayScene {
  constructor(scene) {
    this.scene = scene;
    const triData=[], nodeData=[]; this.setInfo=[];
    for (const set of scene.FacetSets) {
      const info = { triBase: triData.length/16, nodeBase: nodeData.length/NODE_FLOATS, triCount: set.Facets.length };
      this.setInfo.push(info);
      if (!set.Facets.length) continue;
      const pos = new Float32Array(set.Facets.length*9);
      set.Facets.forEach((f,i)=>f.Corners.forEach((c,k)=>pos.set(c, i*9+k*3)));
      const { nodes, indices } = BuildBvh(pos);
      const nf = nodes; // node fields are integer-valued f32s; read them as floats, never as bits
      for (let i=0;i<nodes.length;i+=NODE_FLOATS) {
        const at = nodeData.length;
        nodeData.push(nf[i],nf[i+1],nf[i+2],0, nf[i+4],nf[i+5],nf[i+6],0);
        if (nf[i+7]===0) nodeData[at+3] = info.nodeBase + nf[i+3];       // interior: global child
        else { nodeData[at+3] = info.triBase + nf[i+3]; nodeData[at+7] = nf[i+7]; } // leaf: global tri start
      }
      for (const ti of indices) {
        const f=set.Facets[ti], gn=facetNormal(f.Corners);
        triData.push(...f.Corners[0], f.Family, ...f.Corners[1], 0, ...f.Corners[2], 0, gn[0], gn[1], gn[2], 0);
      }
    }
    this.triangles = new Float32Array(triData);
    this.nodes = new Float32Array(nodeData);
  }

  // Instances + TLAS for this frame. Returns typed arrays ready to upload:
  // instances: 40 floats each (mat4, invMat4, prevMat4 -> see Instance struct is
  // mat4+invMat4+vec4 meta; prev transform kept in a second buffer region).
  buildFrame() {
    const scene=this.scene, list=[], boxes=[];
    for (let i=0;i<scene.Occupants.length;i++) {
      const occ=scene.Occupants[i];
      if (!(occ.Roles & OccupantRole.Raster) || occ.Inactive) continue;
      const info=this.setInfo[occ.FacetSet]; if(!info||!info.triCount) continue;
      const set=scene.FacetSets[occ.FacetSet];
      const lo=[1e30,1e30,1e30], hi=[-1e30,-1e30,-1e30];
      for (const x of [set.LocalMinimum[0],set.LocalMaximum[0]])
        for (const y of [set.LocalMinimum[1],set.LocalMaximum[1]])
          for (const z of [set.LocalMinimum[2],set.LocalMaximum[2]]) {
            const p=TransformPoint(occ.Transform,[x,y,z]);
            for(let a=0;a<3;a++){ lo[a]=Math.min(lo[a],p[a]); hi[a]=Math.max(hi[a],p[a]); }
          }
      boxes.push({mn:lo,mx:hi});
      list.push({occ, info});
    }
    const order=boxes.map((_,i)=>i), nodes=[];
    const push=()=>{nodes.push(0,0,0,0,0,0,0,0);return nodes.length/8-1;};
    const stack=[[push(),0,boxes.length]];
    while(stack.length){
      const [ni,start,n]=stack.pop(), o=ni*8, lo=[1e30,1e30,1e30], hi=[-1e30,-1e30,-1e30];
      for(let i=start;i<start+n;i++){const b=boxes[order[i]];for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],b.mn[a]);hi[a]=Math.max(hi[a],b.mx[a]);}}
      nodes[o]=lo[0];nodes[o+1]=lo[1];nodes[o+2]=lo[2];nodes[o+4]=hi[0];nodes[o+5]=hi[1];nodes[o+6]=hi[2];
      if(n<=4||!n){ nodes[o+3]=start; nodes[o+7]=n; continue; }
      let axis=0,best=-1; for(let a=0;a<3;a++){const e=hi[a]-lo[a]; if(e>best){best=e;axis=a;}}
      const slice=order.slice(start,start+n).sort((p,q)=>(boxes[p].mn[axis]+boxes[p].mx[axis])-(boxes[q].mn[axis]+boxes[q].mx[axis]));
      for(let i=0;i<n;i++) order[start+i]=slice[i];
      const mid=start+(n>>1), L=push(), R=push(); nodes[o+3]=L; nodes[o+7]=0;
      stack.push([L,start,mid-start],[R,mid,start+n-mid]);
    }
    // Instance buffer ordered by TLAS leaf order so leaves index directly.
    const INST_FLOATS=40; // mat4(16) inv(16) meta(4) prevTranslation? -> use 36+4
    const instData=new Float32Array(Math.max(1,list.length)*INST_FLOATS);
    const prevData=new Float32Array(Math.max(1,list.length)*16);
    // InvertTransform imported lazily to avoid cycle cost at module load
    order.forEach((src, dst) => {
      const {occ, info}=list[src], o=dst*INST_FLOATS;
      instData.set(occ.Transform, o);
      instData.set(invert(occ.Transform), o+16);
      instData[o+32]=info.nodeBase; instData[o+33]=info.triBase; instData[o+34]=occ.MaterialOverride; instData[o+35]=src;
      prevData.set(occ.PreviousTransform, dst*16);
    });
    this.frameInstances=list;
    return { instData, prevData, tlasNodes:new Float32Array(nodes), count:list.length };
  }
}

import { InvertTransform as invert } from "../TransformProjection.js";
