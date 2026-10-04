const G=Math.PI*2,N=64,U=64,O={slip:{id:"slip",title:"Silk slip",graphName:"Silk slip dress",fabric:"Mulberry silk",fabricMeta:"19 momme · satin weave",color:"#a52343",roughness:.16,hem:.23,flare:.78,top:2.42,neckDrop:.105,train:0,strapRadius:.015,gravity:.78,stretch:.68},midi:{id:"midi",title:"Soft midi",graphName:"Soft midi dress",fabric:"Washed satin",fabricMeta:"24 momme · sand-washed",color:"#728b78",roughness:.24,hem:.49,flare:.72,top:2.43,neckDrop:.07,train:0,strapRadius:.022,gravity:.86,stretch:.54},gown:{id:"gown",title:"Evening gown",graphName:"Evening gown",fabric:"Silk velvet",fabricMeta:"32 momme · fluid velvet",color:"#273e64",roughness:.31,hem:.13,flare:1.2,top:2.41,neckDrop:.145,train:.17,strapRadius:.025,gravity:.91,stretch:.46}};function et(e){const r=String(e).replace("#","").trim(),i=r.length===3?r.split("").map(n=>n+n).join(""):r,o=Number.parseInt(i||"000000",16);return[(o>>16&255)/255,(o>>8&255)/255,(o&255)/255]}function Y(e,r,i){const o=Math.hypot(e,r,i)||1;return[e/o,r/o,i/o]}class rt{constructor(){this.positions=[],this.indices=[],this.colors=[],this.roughness=[]}addMesh(r,i,o,n=.7){const s=Array.isArray(o)?o:et(o),t=this.positions.length/3;for(let a=0;a<r.length;a+=3)this.positions.push(r[a],r[a+1],r[a+2]),this.colors.push(s[0],s[1],s[2],1),this.roughness.push(n);for(let a=0;a<i.length;a++)this.indices.push(i[a]+t)}addEllipsoid(r,i,o,n=.7,s=16,t=24){const a=[],h=[];for(let l=0;l<=s;l++){const c=Math.PI*l/s,d=Math.cos(c),w=Math.sin(c);for(let p=0;p<t;p++){const v=G*p/t;a.push(r[0]+i[0]*w*Math.sin(v),r[1]+i[1]*d,r[2]+i[2]*w*Math.cos(v))}}for(let l=0;l<s;l++)for(let c=0;c<t;c++){const d=(c+1)%t,w=l*t+c,p=(l+1)*t+c,v=(l+1)*t+d,g=l*t+d;h.push(w,p,g,p,v,g)}this.addMesh(a,h,o,n)}addLoft(r,i,o=.72,n=36){const s=[],t=[];for(const a of r)for(let h=0;h<n;h++){const l=G*h/n;s.push((a.cx||0)+a.rx*Math.sin(l),a.y,(a.cz||0)+a.rz*Math.cos(l))}for(let a=0;a<r.length-1;a++)for(let h=0;h<n;h++){const l=(h+1)%n,c=a*n+h,d=a*n+l,w=(a+1)*n+h,p=(a+1)*n+l;t.push(c,d,w,d,p,w)}this.addMesh(s,t,i,o)}addTubePath(r,i,o,n=.62,s=12){const t=[],a=[],h=r.map(c=>[...c]),l=(c,d)=>[d[0]-c[0],d[1]-c[1],d[2]-c[2]];for(let c=0;c<h.length;c++){const d=h[Math.max(0,c-1)],w=h[Math.min(h.length-1,c+1)],p=Y(...l(d,w)),v=Math.abs(p[2])>.92?[0,1,0]:[0,0,1],g=Y(p[1]*v[2]-p[2]*v[1],p[2]*v[0]-p[0]*v[2],p[0]*v[1]-p[1]*v[0]),M=[p[1]*g[2]-p[2]*g[1],p[2]*g[0]-p[0]*g[2],p[0]*g[1]-p[1]*g[0]],P=Array.isArray(i)?i[c]:i;for(let A=0;A<s;A++){const L=G*A/s,E=Math.cos(L),m=Math.sin(L);t.push(h[c][0]+P*(g[0]*E+M[0]*m),h[c][1]+P*(g[1]*E+M[1]*m),h[c][2]+P*(g[2]*E+M[2]*m))}}for(let c=0;c<h.length-1;c++)for(let d=0;d<s;d++){const w=(d+1)%s,p=c*s+d,v=c*s+w,g=(c+1)*s+d,M=(c+1)*s+w;a.push(p,v,g,v,M,g)}this.addMesh(t,a,o,n)}finish(){const r=new Float32Array(this.positions),i=new Uint16Array(this.indices),o=nt(r,i),n=r.length/3,s=new Float32Array(n*11);for(let t=0;t<n;t++){const a=t*11,h=t*3;s[a]=r[h],s[a+1]=r[h+1],s[a+2]=r[h+2],s[a+3]=o[h],s[a+4]=o[h+1],s[a+5]=o[h+2],s[a+6]=this.colors[t*4],s[a+7]=this.colors[t*4+1],s[a+8]=this.colors[t*4+2],s[a+9]=this.colors[t*4+3],s[a+10]=this.roughness[t]}return{vertices:s,indices:i,indexCount:i.length,vertexCount:n}}}function nt(e,r){const i=new Float32Array(e.length);for(let o=0;o<r.length;o+=3){const n=r[o]*3,s=r[o+1]*3,t=r[o+2]*3,a=e[s]-e[n],h=e[s+1]-e[n+1],l=e[s+2]-e[n+2],c=e[t]-e[n],d=e[t+1]-e[n+1],w=e[t+2]-e[n+2],p=h*w-l*d,v=l*c-a*w,g=a*d-h*c;i[n]+=p,i[n+1]+=v,i[n+2]+=g,i[s]+=p,i[s+1]+=v,i[s+2]+=g,i[t]+=p,i[t+1]+=v,i[t+2]+=g}for(let o=0;o<i.length;o+=3){const n=Y(i[o],i[o+1],i[o+2]);i[o]=n[0],i[o+1]=n[1],i[o+2]=n[2]}return i}function st(){const e=new rt,r="#c9977f",i="#d3a48d",o="#332b2b",n="#b9955d";e.addLoft([{y:1.02,rx:.245,rz:.16},{y:1.1,rx:.34,rz:.215},{y:1.26,rx:.365,rz:.23},{y:1.42,rx:.33,rz:.215},{y:1.56,rx:.285,rz:.19},{y:1.67,rx:.275,rz:.19},{y:1.79,rx:.3,rz:.205},{y:1.91,rx:.345,rz:.23},{y:2.04,rx:.375,rz:.245},{y:2.16,rx:.36,rz:.23},{y:2.27,rx:.3,rz:.195},{y:2.35,rx:.22,rz:.155}],r,.77,40),e.addLoft([{y:2.31,rx:.15,rz:.13},{y:2.39,rx:.12,rz:.115},{y:2.49,rx:.098,rz:.095},{y:2.6,rx:.091,rz:.088},{y:2.68,rx:.103,rz:.094}],i,.72,32),e.addEllipsoid([0,2.87,.006],[.146,.205,.139],i,.7,20,28),e.addEllipsoid([0,3.016,-.045],[.15,.079,.145],o,.53,14,24),e.addEllipsoid([0,2.943,-.147],[.082,.093,.081],o,.56,12,20),e.addEllipsoid([-.133,2.84,.001],[.025,.045,.028],r,.74,10,16),e.addEllipsoid([.133,2.84,.001],[.025,.045,.028],r,.74,10,16),e.addEllipsoid([-.154,2.805,.006],[.011,.022,.011],n,.35,10,14),e.addEllipsoid([.154,2.805,.006],[.011,.022,.011],n,.35,10,14),e.addEllipsoid([-.052,2.891,.133],[.014,.008,.006],"#3b302f",.32,8,12),e.addEllipsoid([.052,2.891,.133],[.014,.008,.006],"#3b302f",.32,8,12),e.addEllipsoid([0,2.846,.14],[.018,.032,.021],r,.76,10,14),e.addEllipsoid([0,2.796,.137],[.034,.009,.007],"#9f615e",.57,8,16),e.addTubePath([[-.071,2.91,.126],[-.052,2.918,.132],[-.034,2.91,.128]],[.004,.004,.003],o,.54,7),e.addTubePath([[.034,2.91,.128],[.052,2.918,.132],[.071,2.91,.126]],[.003,.004,.004],o,.54,7);const s=[[-.279,2.345,.005],[-.354,2.15,.017],[-.398,1.936,.044],[-.456,1.704,.078],[-.496,1.482,.104],[-.505,1.376,.118]],t=[.095,.08,.069,.055,.041,.037];e.addTubePath(s,t,i,.74,14),e.addTubePath(s.map(([l,c,d])=>[-l,c,d]),t,i,.74,14),e.addEllipsoid([-.507,1.31,.137],[.043,.085,.035],r,.77,12,18),e.addEllipsoid([.507,1.31,.137],[.043,.085,.035],r,.77,12,18);for(const l of[-1,1])for(let c=-1;c<=1;c++){const d=l*(.507+c*.018);e.addTubePath([[d,1.29,.15],[d+l*c*.004,1.235,.158]],[.011,.007],r,.78,7)}const a=[[-.155,1.12,.005],[-.158,.78,.013],[-.164,.38,.024],[-.164,.105,.034]],h=[.118,.094,.067,.054];return e.addTubePath(a,h,i,.76,16),e.addTubePath(a.map(([l,c,d])=>[-l,c,d]),h,i,.76,16),e.addEllipsoid([-.164,.076,.12],[.071,.064,.15],r,.77,12,18),e.addEllipsoid([.164,.076,.12],[.071,.064,.15],r,.77,12,18),e.addMesh(new Float32Array([-16,-.012,-16,16,-.012,-16,16,-.012,16,-16,-.012,16]),new Uint16Array([0,2,1,0,3,2]),"#e8e3dc",.96),e.finish()}function D(e,r){const i=.9+(r.flare-.78)*.16,o=[{y:.08,rx:.7*i,rz:.46*i},{y:.48,rx:.62*i,rz:.42*i},{y:.93,rx:.47,rz:.31},{y:1.13,rx:.405,rz:.272},{y:1.3,rx:.37,rz:.25},{y:1.47,rx:.325,rz:.225},{y:1.61,rx:.29,rz:.204},{y:1.75,rx:.302,rz:.21},{y:1.92,rx:.347,rz:.232},{y:2.08,rx:.376,rz:.247},{y:2.2,rx:.365,rz:.236},{y:2.34,rx:.325,rz:.218},{y:2.49,rx:.276,rz:.192}];if(e<=o[0].y)return[o[0].rx,o[0].rz];for(let n=0;n<o.length-1;n++){const s=o[n],t=o[n+1];if(e<=t.y){const a=Math.max(0,Math.min(1,(e-s.y)/(t.y-s.y)));return[s.rx+(t.rx-s.rx)*a,s.rz+(t.rz-s.rz)*a]}}return[o.at(-1).rx,o.at(-1).rz]}function J(e,r=N,i=U){const o=new Float32Array(r*i*3),n=new Uint16Array((i-1)*r*6);let s=0;for(let t=0;t<i;t++){const a=t/(i-1);for(let h=0;h<r;h++){const l=G*h/r,c=Math.max(0,Math.cos(l)),d=Math.max(0,-Math.cos(l)),w=Math.sin(l)**2,p=e.top+.022*w-e.neckDrop*Math.pow(c,1.25),v=e.hem+e.train*Math.pow(d,5),g=p*(1-a)+v*a;let[M,P]=D(g,e);const A=Math.max(0,Math.min(1,(1.34-g)/1.2)),L=Math.sin(l*8+g*2.7)*.007*Math.pow(a,1.35),E=Math.sin(l*4-g*3.2)*.0035*A;M+=(L+E)*(.55+e.flare*.2),P+=L*.65+E*.45;const m=(t*r+h)*3;o[m]=M*Math.sin(l),o[m+1]=g,o[m+2]=P*Math.cos(l)}}for(let t=0;t<i-1;t++)for(let a=0;a<r;a++){const h=(a+1)%r,l=t*r+a,c=t*r+h,d=(t+1)*r+a,w=(t+1)*r+h;n[s++]=l,n[s++]=d,n[s++]=c,n[s++]=c,n[s++]=d,n[s++]=w}return{positions:o,restPositions:o.slice(),indices:n,cols:r,rows:i,count:r*i}}function W(e,r=e.color){const i=new rt,o=e.strapRadius,n=e.id==="gown"?.018:.006;for(const t of[-1,1]){const a=t*.145,[h,l]=D(e.top,e),c=Math.asin(Math.min(.92,Math.abs(a)/h)),d=e.top+.022*Math.sin(c)**2-e.neckDrop*Math.pow(Math.cos(c),1.25),p=D(d,e)[1]*Math.cos(c),v=e.top+.022*Math.sin(c)**2,g=D(v,e)[1]*Math.cos(c);i.addTubePath([[a,d+.006,p+.006+n],[a,d+.082,p+.012+n],[t*.158,2.52,.145+n],[t*.161,2.565,.045+n],[t*.16,2.52,-.105+n],[t*.145,v-.004,-g-.008+n]],[o*.92,o,o,o*.95,o,o*.9],r,e.roughness,10)}const s=[];for(let t=0;t<=48;t++){const a=G*t/48,h=Math.max(0,Math.cos(a)),l=e.top+.022*Math.sin(a)**2-e.neckDrop*Math.pow(h,1.25),[c,d]=D(l,e);s.push([c*Math.sin(a),l+.005,d*Math.cos(a)])}return i.addTubePath(s,.006,r,Math.min(.34,e.roughness+.08),6),i.finish()}function at(e,r,i,o=.16){const n=r*i,s=new Float32Array(n*11);for(let t=0;t<i;t++){const a=Math.max(0,t-1),h=Math.min(i-1,t+1);for(let l=0;l<r;l++){const c=t*r+(l+r-1)%r,d=t*r+(l+1)%r,w=a*r+l,p=h*r+l,v=c*3,g=d*3,M=w*3,P=p*3,A=[e[g]-e[v],e[g+1]-e[v+1],e[g+2]-e[v+2]],L=[e[P]-e[M],e[P+1]-e[M+1],e[P+2]-e[M+2]];let E=L[1]*A[2]-L[2]*A[1],m=L[2]*A[0]-L[0]*A[2],C=L[0]*A[1]-L[1]*A[0];const b=Math.hypot(E,m,C)||1;E/=b,m/=b,C/=b;const S=(t*r+l)*3,B=(t*r+l)*11;s[B]=e[S],s[B+1]=e[S+1],s[B+2]=e[S+2],s[B+3]=E,s[B+4]=m,s[B+5]=C,s[B+6]=1,s[B+7]=1,s[B+8]=1,s[B+9]=1,s[B+10]=o}}return s}const ct=`
struct SimParams {
  step: vec4<f32>,
  meta: vec4<f32>,
};

fn bodyRx(y: f32) -> f32 {
  if (y < 1.08 || y > 2.43) { return 0.0; }
  if (y < 1.56) { return mix(0.36, 0.29, clamp((y - 1.08) / 0.48, 0.0, 1.0)); }
  if (y < 2.02) { return mix(0.29, 0.37, clamp((y - 1.56) / 0.46, 0.0, 1.0)); }
  return mix(0.37, 0.30, clamp((y - 2.02) / 0.41, 0.0, 1.0));
}

fn bodyRz(y: f32) -> f32 {
  if (y < 1.08 || y > 2.43) { return 0.0; }
  if (y < 1.56) { return mix(0.235, 0.195, clamp((y - 1.08) / 0.48, 0.0, 1.0)); }
  if (y < 2.02) { return mix(0.195, 0.24, clamp((y - 1.56) / 0.46, 0.0, 1.0)); }
  return mix(0.24, 0.19, clamp((y - 2.02) / 0.41, 0.0, 1.0));
}

fn collide(input: vec3<f32>) -> vec3<f32> {
  var p = input;
  let rx = bodyRx(p.y);
  if (rx > 0.0) {
    let rz = bodyRz(p.y);
    let scaled = vec2<f32>(p.x / (rx + 0.012), p.z / (rz + 0.012));
    let radius = length(scaled);
    if (radius < 1.0 && radius > 0.0001) {
      p.x = p.x / radius;
      p.z = p.z / radius;
    }
  }
  if (p.y < 0.055) { p.y = 0.055; }
  return p;
}

@group(0) @binding(0) var<storage, read> current: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> previous: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> predicted: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> rest: array<vec4<f32>>;
@group(0) @binding(4) var<uniform> params: SimParams;

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let i = invocation.x;
  let cols = u32(params.meta.z);
  let rows = u32(params.meta.y);
  let count = cols * rows;
  if (i >= count) { return; }
  let row = i / cols;
  if (row == 0u) {
    predicted[i] = rest[i];
    previous[i] = rest[i];
    return;
  }

  let p = current[i].xyz;
  let old = previous[i].xyz;
  let dt = params.step.x;
  let velocity = (p - old) * params.step.y;
  let phase = params.meta.x;
  let wind = params.step.z;
  let windAcceleration = vec3<f32>(
    sin(phase * 1.35 + p.y * 1.7) * 0.85,
    0.035,
    sin(phase * 0.83 + p.x * 2.1) * 0.65
  ) * wind;
  let gravity = vec3<f32>(0.0, -9.8 * params.step.w, 0.0);
  let restPosition = rest[i].xyz;
  let softBend = vec3<f32>(restPosition.x - p.x, 0.0, restPosition.z - p.z) * 4.0;
  let nextPosition = collide(p + velocity + (gravity + windAcceleration + softBend) * dt * dt);
  previous[i] = vec4<f32>(p, 1.0);
  predicted[i] = vec4<f32>(nextPosition, 1.0);
}
`,lt=`
struct SimParams {
  step: vec4<f32>,
  meta: vec4<f32>,
};

fn bodyRx(y: f32) -> f32 {
  if (y < 1.08 || y > 2.43) { return 0.0; }
  if (y < 1.56) { return mix(0.36, 0.29, clamp((y - 1.08) / 0.48, 0.0, 1.0)); }
  if (y < 2.02) { return mix(0.29, 0.37, clamp((y - 1.56) / 0.46, 0.0, 1.0)); }
  return mix(0.37, 0.30, clamp((y - 2.02) / 0.41, 0.0, 1.0));
}

fn bodyRz(y: f32) -> f32 {
  if (y < 1.08 || y > 2.43) { return 0.0; }
  if (y < 1.56) { return mix(0.235, 0.195, clamp((y - 1.08) / 0.48, 0.0, 1.0)); }
  if (y < 2.02) { return mix(0.195, 0.24, clamp((y - 1.56) / 0.46, 0.0, 1.0)); }
  return mix(0.24, 0.19, clamp((y - 2.02) / 0.41, 0.0, 1.0));
}

fn collide(input: vec3<f32>) -> vec3<f32> {
  var p = input;
  let rx = bodyRx(p.y);
  if (rx > 0.0) {
    let rz = bodyRz(p.y);
    let scaled = vec2<f32>(p.x / (rx + 0.012), p.z / (rz + 0.012));
    let radius = length(scaled);
    if (radius < 1.0 && radius > 0.0001) {
      p.x = p.x / radius;
      p.z = p.z / radius;
    }
  }
  if (p.y < 0.055) { p.y = 0.055; }
  return p;
}

@group(0) @binding(0) var<storage, read> source: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> destination: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> rest: array<vec4<f32>>;
@group(0) @binding(3) var<uniform> params: SimParams;

fn edgeCorrection(i: u32, j: u32, p: vec3<f32>) -> vec3<f32> {
  let q = source[j].xyz;
  let delta = q - p;
  let distanceNow = length(delta);
  let restDistance = distance(rest[i].xyz, rest[j].xyz);
  if (distanceNow < 0.00001) { return vec3<f32>(0.0); }
  return delta * ((distanceNow - restDistance) / distanceNow);
}

@compute @workgroup_size(64)
fn solve(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let i = invocation.x;
  let cols = u32(params.meta.z);
  let rows = u32(params.meta.y);
  let count = cols * rows;
  if (i >= count) { return; }
  let row = i / cols;
  if (row == 0u) {
    destination[i] = rest[i];
    return;
  }
  let col = i % cols;
  let p = source[i].xyz;
  let left = row * cols + ((col + cols - 1u) % cols);
  let right = row * cols + ((col + 1u) % cols);
  var correction = edgeCorrection(i, left, p) + edgeCorrection(i, right, p);
  var edgeCount = 2.0;
  if (row > 0u) {
    let up = (row - 1u) * cols + col;
    correction += edgeCorrection(i, up, p);
    edgeCount += 1.0;
    correction += edgeCorrection(i, (row - 1u) * cols + ((col + cols - 1u) % cols), p);
    correction += edgeCorrection(i, (row - 1u) * cols + ((col + 1u) % cols), p);
    edgeCount += 2.0;
  }
  if (row + 1u < rows) {
    let down = (row + 1u) * cols + col;
    correction += edgeCorrection(i, down, p);
    edgeCount += 1.0;
    correction += edgeCorrection(i, (row + 1u) * cols + ((col + cols - 1u) % cols), p);
    correction += edgeCorrection(i, (row + 1u) * cols + ((col + 1u) % cols), p);
    edgeCount += 2.0;
  }
  let stiffness = clamp(0.135 + params.meta.w * 0.19, 0.15, 0.34);
  let corrected = collide(p + correction * (stiffness / sqrt(edgeCount)));
  destination[i] = vec4<f32>(corrected, 1.0);
}
`;function K(e){const r=new Float32Array(e.length/3*4);for(let i=0,o=0;i<e.length;i+=3,o+=4)r[o]=e[i],r[o+1]=e[i+1],r[o+2]=e[i+2],r[o+3]=1;return r}function ut(e,r,i){let o=0,n=0;if(r>=1.08&&r<=2.43)if(r<1.56){const s=Math.max(0,Math.min(1,(r-1.08)/.48));o=.36+(.29-.36)*s,n=.235+(.195-.235)*s}else if(r<2.02){const s=Math.max(0,Math.min(1,(r-1.56)/.46));o=.29+(.37-.29)*s,n=.195+(.24-.195)*s}else{const s=Math.max(0,Math.min(1,(r-2.02)/.41));o=.37+(.3-.37)*s,n=.24+(.19-.24)*s}if(o>0){const s=Math.hypot(e/(o+.012),i/(n+.012));s<1&&s>1e-4&&(e/=s,i/=s)}return[e,Math.max(r,.055),i]}async function ht(){if(!("gpu"in navigator))return null;try{const e=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});return e?await e.requestDevice():null}catch(e){return console.warn("WebGPU device unavailable; using the CPU cloth fallback.",e),null}}class dt{constructor(r){this.iterations=5,this.reset(r)}reset(r){this.cols=r.cols,this.rows=r.rows,this.count=r.count,this.rest=r.restPositions.slice(),this.positions=r.positions.slice(),this.previous=r.positions.slice(),this.predicted=new Float32Array(this.positions.length),this.scratch=new Float32Array(this.positions.length),this.indices=r.indices}step(r,i,o={}){if(r<=0)return;r=Math.min(r,1/30);const n=.988,s=o.wind??.42,t=o.gravity??.78,a=o.stretch??.68,h=r*r,l=this.cols,c=this.rows,d=this.positions,w=this.previous,p=this.rest,v=this.predicted;for(let A=0;A<c;A++)for(let L=0;L<l;L++){const m=(A*l+L)*3;if(A===0){v[m]=p[m],v[m+1]=p[m+1],v[m+2]=p[m+2],w[m]=p[m],w[m+1]=p[m+1],w[m+2]=p[m+2];continue}const C=d[m],b=d[m+1],S=d[m+2],B=(C-w[m])*n,u=(b-w[m+1])*n,x=(S-w[m+2])*n;w[m]=C,w[m+1]=b,w[m+2]=S;const y=Math.sin(i*1.35+b*1.7)*.85*s,R=Math.sin(i*.83+C*2.1)*.65*s;v[m]=C+B+(y+(p[m]-C)*4)*h,v[m+1]=b+u+(.08-9.8*t)*h,v[m+2]=S+x+(R+(p[m+2]-S)*4)*h}let g=v,M=this.scratch;const P=.135+a*.19;for(let A=0;A<this.iterations;A++){for(let E=0;E<c;E++)for(let m=0;m<l;m++){const b=(E*l+m)*3;if(E===0){M[b]=p[b],M[b+1]=p[b+1],M[b+2]=p[b+2];continue}let S=0,B=0,u=0,x=0;const y=ot=>{const I=ot*3,q=g[I]-g[b],j=g[I+1]-g[b+1],X=g[I+2]-g[b+2],$=Math.hypot(q,j,X),it=Math.hypot(p[I]-p[b],p[I+1]-p[b+1],p[I+2]-p[b+2]);if($>1e-5){const H=($-it)/$;S+=q*H,B+=j*H,u+=X*H}x++};y(E*l+(m+l-1)%l),y(E*l+(m+1)%l),E>0&&(y((E-1)*l+m),y((E-1)*l+(m+l-1)%l),y((E-1)*l+(m+1)%l)),E+1<c&&(y((E+1)*l+m),y((E+1)*l+(m+l-1)%l),y((E+1)*l+(m+1)%l));const R=P/Math.sqrt(x),k=ut(g[b]+S*R,g[b+1]+B*R,g[b+2]+u*R);M[b]=k[0],M[b+1]=k[1],M[b+2]=k[2]}const L=g;g=M,M=L}this.positions.set(g)}}class ft{constructor(r,i){this.device=r,this.geometry=i,this.count=i.count,this.cols=i.cols,this.rows=i.rows,this.running=!0,this.iterations=5,this.positions=i.positions.slice(),this.stateVersion=0;const o=GPUBufferUsage;this.positionBuffer=r.createBuffer({label:"cloth positions",size:this.count*16,usage:o.STORAGE|o.COPY_DST|o.COPY_SRC}),this.previousBuffer=r.createBuffer({label:"cloth previous positions",size:this.count*16,usage:o.STORAGE|o.COPY_DST}),this.scratchA=r.createBuffer({label:"cloth solver A",size:this.count*16,usage:o.STORAGE}),this.scratchB=r.createBuffer({label:"cloth solver B",size:this.count*16,usage:o.STORAGE}),this.restBuffer=r.createBuffer({label:"cloth rest shape",size:this.count*16,usage:o.STORAGE|o.COPY_DST}),this.uniformBuffer=r.createBuffer({label:"cloth solver uniforms",size:32,usage:o.UNIFORM|o.COPY_DST}),this.readbackSlots=Array.from({length:3},(l,c)=>({buffer:r.createBuffer({label:`cloth display readback ${c+1}`,size:this.count*16,usage:o.MAP_READ|o.COPY_DST}),busy:!1,version:0}));const n=r.createShaderModule({label:"Verlet integrate WGSL",code:ct}),s=r.createShaderModule({label:"Position constraints WGSL",code:lt});this.integratePipeline=r.createComputePipeline({label:"cloth integration",layout:"auto",compute:{module:n,entryPoint:"integrate"}}),this.constraintPipeline=r.createComputePipeline({label:"cloth distance constraints",layout:"auto",compute:{module:s,entryPoint:"solve"}});const t=this.integratePipeline.getBindGroupLayout(0);this.integrateGroup=r.createBindGroup({label:"cloth integrate bindings",layout:t,entries:[{binding:0,resource:{buffer:this.positionBuffer}},{binding:1,resource:{buffer:this.previousBuffer}},{binding:2,resource:{buffer:this.scratchA}},{binding:3,resource:{buffer:this.restBuffer}},{binding:4,resource:{buffer:this.uniformBuffer}}]});const a=this.constraintPipeline.getBindGroupLayout(0),h=(l,c,d)=>r.createBindGroup({label:l,layout:a,entries:[{binding:0,resource:{buffer:c}},{binding:1,resource:{buffer:d}},{binding:2,resource:{buffer:this.restBuffer}},{binding:3,resource:{buffer:this.uniformBuffer}}]});this.solveAB=h("cloth A to B",this.scratchA,this.scratchB),this.solveBA=h("cloth B to A",this.scratchB,this.scratchA),this.solveAToPosition=h("cloth final pass",this.scratchA,this.positionBuffer),this.reset(i)}reset(r=this.geometry){this.geometry=r,this.cols=r.cols,this.rows=r.rows,this.count=r.count;const i=K(r.restPositions),o=K(r.positions);this.positions.set(r.positions),this.stateVersion++,this.device.queue.writeBuffer(this.restBuffer,0,i),this.device.queue.writeBuffer(this.positionBuffer,0,o),this.device.queue.writeBuffer(this.previousBuffer,0,o)}encode(r,i,o,n={}){if(!n.running||i<=0)return;i=Math.min(i,1/30);const s=new Float32Array([i,.988,n.wind??.42,n.gravity??.78,o,this.rows,this.cols,n.stretch??.68]);this.device.queue.writeBuffer(this.uniformBuffer,0,s);const t=Math.ceil(this.count/64);let a=r.beginComputePass({label:"cloth verlet integration"});a.setPipeline(this.integratePipeline),a.setBindGroup(0,this.integrateGroup),a.dispatchWorkgroups(t),a.end();for(let h=0;h<this.iterations;h++)a=r.beginComputePass({label:`cloth constraints ${h+1}`}),a.setPipeline(this.constraintPipeline),h===this.iterations-1?a.setBindGroup(0,this.solveAToPosition):a.setBindGroup(0,h%2===0?this.solveAB:this.solveBA),a.dispatchWorkgroups(t),a.end()}step(r,i,o={}){if(r<=0||!o.running)return;const n=this.device.createCommandEncoder({label:"GPU cloth simulation step"});this.encode(n,r,i,o);const s=this.readbackSlots.find(t=>!t.busy);s&&(s.busy=!0,s.version=this.stateVersion,n.copyBufferToBuffer(this.positionBuffer,0,s.buffer,0,this.count*16)),this.device.queue.submit([n.finish()]),s&&s.buffer.mapAsync(GPUMapMode.READ).then(()=>{const t=new Float32Array(s.buffer.getMappedRange());if(s.version===this.stateVersion)for(let a=0,h=0;a<this.count;a++,h+=4){const l=a*3;this.positions[l]=t[h],this.positions[l+1]=t[h+1],this.positions[l+2]=t[h+2]}s.buffer.unmap(),s.busy=!1}).catch(t=>{s.busy=!1,console.warn("Cloth display readback failed.",t)})}destroy(){this.positionBuffer.destroy(),this.previousBuffer.destroy(),this.scratchA.destroy(),this.scratchB.destroy(),this.restBuffer.destroy(),this.uniformBuffer.destroy(),this.readbackSlots.forEach(r=>r.buffer.destroy())}}const pt=`#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in vec4 aColor;
in float aRoughness;
uniform mat4 uViewProjection;
out vec3 vWorldPosition;
out vec3 vWorldNormal;
out vec4 vColor;
out float vRoughness;
void main() {
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
  vWorldPosition = aPosition;
  vWorldNormal = aNormal;
  vColor = aColor;
  vRoughness = aRoughness;
}
`,mt=`#version 300 es
precision highp float;
uniform vec3 uCamera;
uniform vec3 uTint;
in vec3 vWorldPosition;
in vec3 vWorldNormal;
in vec4 vColor;
in float vRoughness;
out vec4 outColor;
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 light = normalize(vec3(-0.48, 0.82, 0.48));
  vec3 view = normalize(uCamera - vWorldPosition);
  vec3 halfVector = normalize(light + view);
  float diffuse = max(dot(n, light), 0.0);
  float rough = clamp(vRoughness, 0.055, 1.0);
  float gloss = 1.0 - rough;
  float specular = pow(max(dot(n, halfVector), 0.0), mix(7.0, 88.0, gloss)) * mix(0.025, 0.32, gloss);
  float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0) * mix(0.025, 0.12, gloss);
  float broadHighlight = pow(max(dot(n, halfVector), 0.0), 5.0) * mix(0.005, 0.08, gloss);
  float sheen = pow(1.0 - abs(dot(n, view)), 4.0) * mix(0.0, 0.055, gloss);
  vec3 base = vColor.rgb * uTint;
  vec3 lit = base * (0.39 + diffuse * 0.74) + vec3(specular + rim + broadHighlight + sheen);
  outColor = vec4(lit, vColor.a);
}
`;function Z(e,r,i){const o=Math.hypot(e,r,i)||1;return[e/o,r/o,i/o]}function gt(e,r,i=[0,1,0]){const o=Z(e[0]-r[0],e[1]-r[1],e[2]-r[2]),n=Z(i[1]*o[2]-i[2]*o[1],i[2]*o[0]-i[0]*o[2],i[0]*o[1]-i[1]*o[0]),s=[o[1]*n[2]-o[2]*n[1],o[2]*n[0]-o[0]*n[2],o[0]*n[1]-o[1]*n[0]],t=new Float32Array(16);return t[0]=n[0],t[1]=s[0],t[2]=o[0],t[3]=0,t[4]=n[1],t[5]=s[1],t[6]=o[1],t[7]=0,t[8]=n[2],t[9]=s[2],t[10]=o[2],t[11]=0,t[12]=-(n[0]*e[0]+n[1]*e[1]+n[2]*e[2]),t[13]=-(s[0]*e[0]+s[1]*e[1]+s[2]*e[2]),t[14]=-(o[0]*e[0]+o[1]*e[1]+o[2]*e[2]),t[15]=1,t}function vt(e,r){const i=1/Math.tan(35*Math.PI/180/2),o=.1,n=90,s=new Float32Array(16);return s[0]=i/Math.max(e,.1),s[5]=i,r?(s[10]=n/(o-n),s[11]=-1,s[14]=n*o/(o-n)):(s[10]=(n+o)/(o-n),s[11]=-1,s[14]=2*n*o/(o-n)),s}function wt(e,r){const i=new Float32Array(16);for(let o=0;o<4;o++)for(let n=0;n<4;n++)i[o*4+n]=e[n]*r[o*4]+e[4+n]*r[o*4+1]+e[8+n]*r[o*4+2]+e[12+n]*r[o*4+3];return i}function bt(e,r,i=!1){const o=Math.cos(e.pitch),n=[e.target[0]+Math.sin(e.yaw)*o*e.distance,e.target[1]+Math.sin(e.pitch)*e.distance,e.target[2]+Math.cos(e.yaw)*o*e.distance],s=gt(n,e.target),t=vt(r,i);return{matrix:wt(t,s),eye:n}}function xt(e,r){const i=[];for(let o=0;o<r;o++)for(let n=0;n<e;n++){const s=o*e+n,t=o*e+(n+1)%e;i.push(s,t),o+1<r&&i.push(s,(o+1)*e+n)}return new Uint16Array(i)}function Q(e,r,i){const o=e.createShader(r);if(e.shaderSource(o,i),e.compileShader(o),!e.getShaderParameter(o,e.COMPILE_STATUS)){const n=e.getShaderInfoLog(o)||"Unknown shader compilation error";throw e.deleteShader(o),new Error(n)}return o}function yt(e){const r=Q(e,e.VERTEX_SHADER,pt),i=Q(e,e.FRAGMENT_SHADER,mt),o=e.createProgram();if(e.attachShader(o,r),e.attachShader(o,i),e.linkProgram(o),e.deleteShader(r),e.deleteShader(i),!e.getProgramParameter(o,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(o)||"Could not link the viewport shaders.");return o}function tt(e,r,i,o){const n=e.getContext("webgl2",{alpha:!0,antialias:!0,premultipliedAlpha:!0,powerPreference:"high-performance"});if(!n)throw new Error("This browser does not provide a WebGPU or WebGL2 renderer.");return new Et(e,n,r,i,o)}class Et{constructor(r,i,o,n,s){this.type="webgl",this.canvas=r,this.gl=i,this.modelGeometry=o,this.clothGeometry=n,this.detailsGeometry=s,this.isWireframe=!1,this.staticVisible=!0,this.program=yt(i),this.locations={position:i.getAttribLocation(this.program,"aPosition"),normal:i.getAttribLocation(this.program,"aNormal"),color:i.getAttribLocation(this.program,"aColor"),roughness:i.getAttribLocation(this.program,"aRoughness"),matrix:i.getUniformLocation(this.program,"uViewProjection"),camera:i.getUniformLocation(this.program,"uCamera"),tint:i.getUniformLocation(this.program,"uTint")},this.staticVertexBuffer=i.createBuffer(),this.staticIndexBuffer=i.createBuffer(),i.bindBuffer(i.ARRAY_BUFFER,this.staticVertexBuffer),i.bufferData(i.ARRAY_BUFFER,o.vertices,i.STATIC_DRAW),i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,this.staticIndexBuffer),i.bufferData(i.ELEMENT_ARRAY_BUFFER,o.indices,i.STATIC_DRAW),this.staticIndexCount=o.indexCount,this.detailsVertexBuffer=i.createBuffer(),this.detailsIndexBuffer=i.createBuffer(),this.setDressDetails(s),this.clothVertexBuffer=i.createBuffer(),this.clothIndexBuffer=i.createBuffer(),i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,this.clothIndexBuffer),i.bufferData(i.ELEMENT_ARRAY_BUFFER,n.indices,i.STATIC_DRAW),this.wireIndices=xt(n.cols,n.rows),this.clothWireIndexBuffer=i.createBuffer(),i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,this.clothWireIndexBuffer),i.bufferData(i.ELEMENT_ARRAY_BUFFER,this.wireIndices,i.STATIC_DRAW),this.clothWireIndexCount=this.wireIndices.length,this.resize(),i.enable(i.DEPTH_TEST),i.depthFunc(i.LEQUAL),i.disable(i.CULL_FACE),i.enable(i.BLEND),i.blendFunc(i.ONE,i.ONE_MINUS_SRC_ALPHA)}setDressDetails(r){this.detailsGeometry=r;const i=this.gl;i.bindBuffer(i.ARRAY_BUFFER,this.detailsVertexBuffer),i.bufferData(i.ARRAY_BUFFER,r.vertices,i.STATIC_DRAW),i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,this.detailsIndexBuffer),i.bufferData(i.ELEMENT_ARRAY_BUFFER,r.indices,i.STATIC_DRAW),this.detailsIndexCount=r.indexCount}resize(){const r=this.canvas.getBoundingClientRect(),i=Math.min(window.devicePixelRatio||1,1.8),o=Math.max(1,Math.round(r.width*i)),n=Math.max(1,Math.round(r.height*i));(this.canvas.width!==o||this.canvas.height!==n)&&(this.canvas.width=o,this.canvas.height=n),this.gl.viewport(0,0,o,n),this.width=o,this.height=n}bindGeometry(r,i){const o=this.gl,n=this.locations;o.bindBuffer(o.ARRAY_BUFFER,r),o.bindBuffer(o.ELEMENT_ARRAY_BUFFER,i),o.enableVertexAttribArray(n.position),o.enableVertexAttribArray(n.normal),o.enableVertexAttribArray(n.color),o.enableVertexAttribArray(n.roughness),o.vertexAttribPointer(n.position,3,o.FLOAT,!1,44,0),o.vertexAttribPointer(n.normal,3,o.FLOAT,!1,44,12),o.vertexAttribPointer(n.color,4,o.FLOAT,!1,44,24),o.vertexAttribPointer(n.roughness,1,o.FLOAT,!1,44,40)}render({simulation:r,dt:i,time:o,camera:n,color:s,roughness:t,settings:a,wireframe:h=!1,showModel:l=!0}){this.resize();const c=this.gl;c.clearColor(0,0,0,0),c.clear(c.COLOR_BUFFER_BIT|c.DEPTH_BUFFER_BIT),c.useProgram(this.program);const d=this.width/Math.max(1,this.height),{matrix:w,eye:p}=bt(n,d,!1);if(c.uniformMatrix4fv(this.locations.matrix,!1,w),c.uniform3fv(this.locations.camera,p),l&&(c.uniform3f(this.locations.tint,1,1,1),this.bindGeometry(this.staticVertexBuffer,this.staticIndexBuffer),c.drawElements(c.TRIANGLES,this.staticIndexCount,c.UNSIGNED_SHORT,0)),this.detailsIndexCount&&(c.uniform3f(this.locations.tint,1,1,1),this.bindGeometry(this.detailsVertexBuffer,this.detailsIndexBuffer),c.drawElements(c.TRIANGLES,this.detailsIndexCount,c.UNSIGNED_SHORT,0)),r){const v=at(r.positions,r.cols,r.rows,t);c.bindBuffer(c.ARRAY_BUFFER,this.clothVertexBuffer),c.bufferData(c.ARRAY_BUFFER,v,c.DYNAMIC_DRAW),c.uniform3fv(this.locations.tint,s),h?(this.bindGeometry(this.clothVertexBuffer,this.clothWireIndexBuffer),c.drawElements(c.LINES,this.clothWireIndexCount,c.UNSIGNED_SHORT,0)):(this.bindGeometry(this.clothVertexBuffer,this.clothIndexBuffer),c.drawElements(c.TRIANGLES,this.clothGeometry.indices.length,c.UNSIGNED_SHORT,0))}}dispose(){const r=this.gl;r.deleteBuffer(this.staticVertexBuffer),r.deleteBuffer(this.staticIndexBuffer),r.deleteBuffer(this.detailsVertexBuffer),r.deleteBuffer(this.detailsIndexBuffer),r.deleteBuffer(this.clothVertexBuffer),r.deleteBuffer(this.clothIndexBuffer),r.deleteBuffer(this.clothWireIndexBuffer),r.deleteProgram(this.program)}}const f=e=>document.querySelector(e),z=e=>[...document.querySelectorAll(e)],Mt='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.4 4.5h2.8v11H6.4zm4.5 0h2.8v11h-2.8z" fill="currentColor"/></svg>',At='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 4.8 8.2 5.2L7 15.2V4.8Z" fill="currentColor"/></svg>';function T(e){const r=f("#toast");r.textContent=e,r.classList.add("show"),clearTimeout(T.timeout),T.timeout=setTimeout(()=>r.classList.remove("show"),2300)}function _(e){const r=Number(e.min||0),i=Number(e.max||100),n=(Number(e.value||0)-r)/(i-r)*100;e.style.setProperty("--range-progress",`${n}%`)}function Lt(e){const r=Math.floor(e*24),i=Math.floor(r/24),o=r%24;return`00:${String(i).padStart(2,"0")}${o?`:${String(o).padStart(2,"0")}`:""}`}function Bt(e){const r={application:"stitch / garment lab",version:1,project:"Violet hour",exportedAt:new Date().toISOString(),renderer:e.rendererType==="webgpu"?"WebGPU cloth compute + WebGL viewport":"WebGL viewport + CPU cloth fallback",garment:{silhouette:e.preset.id,name:e.preset.title,fabric:e.preset.fabric,color:e.color,roughness:e.preset.roughness,particles:`${N} × ${U}`},simulation:{running:e.running,windMetersPerSecond:e.wind,weightKgPerSquareMeter:e.weight,biasStretch:e.stretch,timeSeconds:Number(e.time.toFixed(2))}},i=new Blob([JSON.stringify(r,null,2)],{type:"application/json"}),o=URL.createObjectURL(i),n=document.createElement("a");n.href=o,n.download="violet-hour-look.json",n.click(),setTimeout(()=>URL.revokeObjectURL(o),1e3)}function F(e){const r=e.running?"LIVE DRAPE":"SIM PAUSED";f("#hud-state").textContent=r,f("#hud-wind").textContent=`WIND ${e.wind.toFixed(2)} M/S`,f("#hud-particles").textContent=`${(N*U).toLocaleString()} PTS`,f(".sim-hud").classList.toggle("paused",!e.running);const i=f("#play-pause");i.innerHTML=e.running?Mt:At,i.classList.toggle("is-playing",e.running),i.setAttribute("aria-label",e.running?"Pause simulation":"Play simulation"),i.title=e.running?"Pause simulation":"Play simulation",f("#timeline-time").innerHTML=`${Lt(e.time)} <small> / 00:08</small>`,f("#timeline-range").value=String(e.time),f("#timeline-progress").style.width=`${Math.max(0,Math.min(100,e.time/8*100))}%`,f("#frame-counter").textContent=`FRAME ${String(Math.floor(e.time*24)).padStart(3,"0")}`}function V(e){f("#graph-garment-name").textContent=e.preset.graphName,f("#viewport-look-title").textContent=`VIOLET HOUR / ${e.preset.title.toUpperCase()}`,f("#fabric-name").textContent=e.preset.fabric,f("#fabric-weight-label").textContent=e.preset.fabricMeta,f("#fabric-preview").style.background=`radial-gradient(ellipse at 28% 20%, rgba(255,255,255,.6), transparent 37%), linear-gradient(135deg, ${e.color}, #35212b)`,f(".node-swatch").style.background=`radial-gradient(ellipse at 28% 22%, rgba(255,255,255,.58), transparent 35%), linear-gradient(135deg, ${e.color}, #571c32)`;const r=z(".color-swatch").find(i=>i.dataset.color.toLowerCase()===e.color.toLowerCase());z(".color-swatch").forEach(i=>i.classList.toggle("selected",i===r)),f("#weight-range").value=String(e.weight),f("#weight-value").innerHTML=`${e.weight.toFixed(2)} <small>kg/m²</small>`,f("#stretch-range").value=String(Math.round(e.stretch*100)),f("#stretch-value").innerHTML=`${Math.round(e.stretch*100)} <small>%</small>`,_(f("#weight-range")),_(f("#stretch-range"))}async function Rt(e){let r=e;const i=st();let o={};try{o=JSON.parse(localStorage.getItem("stitch-violet-hour")||"{}")}catch{}const n=O[o.preset]||O.slip,s=typeof o.color=="string"&&/^#[0-9a-f]{6}$/i.test(o.color)?o.color.toLowerCase():n.color,t={renderer:null,simulation:null,rendererType:"pending",preset:{...n,color:s},color:s,weight:Math.max(.25,Math.min(1.35,Number(o.weight??f("#weight-range").value)||.72)),stretch:Math.max(.2,Math.min(1,Number(o.stretch??Number(f("#stretch-range").value)/100)||.68)),wind:Math.max(0,Math.min(2,Number(o.wind??f("#wind-range").value)||0)),running:!0,time:0,speed:1,autoRotate:!1,wireframe:!1,showModel:!0,rotation:{yaw:.24,pitch:.025,distance:6.7,target:[0,1.55,0]},pointer:null};let a=J(t.preset,N,U),h=W(t.preset,t.color);f("#weight-range").value=String(t.weight),f("#weight-value").innerHTML=`${t.weight.toFixed(2)} <small>kg/m²</small>`,f("#stretch-value").innerHTML=`${Math.round(t.stretch*100)} <small>%</small>`,f("#wind-value").innerHTML=`${t.wind.toFixed(2)} <small>m/s</small>`,z("#weight-range, #stretch-range, #wind-range").forEach(_);const l=f("#engine-status"),c=l.querySelector(".engine-label");c.textContent="CONNECTING WEBGPU";let d=null;const w=await ht();if(w)try{t.simulation=new ft(w,a),d=tt(r,i,a,h),t.rendererType="webgpu"}catch(u){console.error("WebGPU cloth setup failed; using the CPU cloth fallback.",u),w.destroy(),t.simulation=null,d=null}d?(l.classList.remove("fallback"),c.textContent="WEBGPU CLOTH · WEBGL VIEW"):(d=tt(r,i,a,h),t.simulation=new dt(a),t.rendererType="webgl",l.classList.add("fallback"),c.textContent="WEBGL · CPU FALLBACK"),f("#solver-node-detail").textContent=`${N} × ${U} PARTICLES`,t.renderer=d,r.dataset.renderer=t.rendererType,l.title=t.rendererType==="webgpu"?"WebGPU compute cloth solver, read back for the WebGL viewport":"WebGL viewport with the real-time CPU cloth fallback";const p=(u,x=!1)=>{const y=O[u]||O.slip;t.preset={...y,color:x?t.color:y.color},x||(t.color=y.color),a=J(t.preset,N,U),h=W(t.preset,t.color),t.simulation.reset(a),d.clothGeometry=a,d.setDressDetails(h),V(t),f("#weight-range").value=String(t.weight),z(".look-card").forEach(R=>{const k=R.dataset.look===u;R.classList.toggle("active",k),R.setAttribute("aria-pressed",String(k))}),t.time=0,F(t)},v=u=>{t.color=u.toLowerCase(),t.preset={...t.preset,color:t.color},h=W(t.preset,t.color),d.setDressDetails(h),V(t)},g=(u=!1)=>{t.simulation.reset(a),t.time=0,t.running||(t.running=!0),F(t),u&&T("Drape reset — the garment is settling again.")};z(".look-card").forEach(u=>{const x=u.dataset.look===t.preset.id;u.classList.toggle("active",x),u.setAttribute("aria-pressed",String(x))}),V(t),F(t),z(".editor-tab").forEach(u=>{u.addEventListener("click",()=>{z(".editor-tab").forEach(y=>y.classList.toggle("active",y===u));const x=document.getElementById(u.dataset.scroll);x&&x.scrollIntoView({behavior:"smooth",block:"start"})})}),z(".graph-node").forEach(u=>{u.addEventListener("click",()=>{var y;z(".graph-node").forEach(R=>R.classList.toggle("selected",R===u));const x={fabric:"material-section",pattern:"look-section",garment:"look-section",solver:"material-section"};(y=document.getElementById(x[u.dataset.node]))==null||y.scrollIntoView({behavior:"smooth",block:"nearest"}),u.dataset.node==="solver"&&T(t.rendererType==="webgpu"?"WebGPU is solving 4,096 particles every frame.":"CPU solver is active in this browser preview.")})}),f("#add-node").addEventListener("click",()=>T("All four construction nodes are connected and live.")),f("#browse-silhouettes").addEventListener("click",()=>{f("#look-section").scrollIntoView({behavior:"smooth",block:"nearest"})}),z(".look-card").forEach(u=>u.addEventListener("click",()=>{p(u.dataset.look),T(`${t.preset.title} loaded on the mannequin.`)}));const M=[{name:"Mulberry silk",meta:"19 momme · satin weave",roughness:.16},{name:"Cloud organza",meta:"12 momme · crisp sheer",roughness:.36},{name:"Soft velvet",meta:"32 momme · fluid pile",roughness:.31}];let P=0;(()=>{const u=M.findIndex(x=>x.name.toLowerCase()===t.preset.fabric.toLowerCase());P=u>=0?u:0})(),f("#fabric-choice").addEventListener("click",()=>{P=(P+1)%M.length;const u=M[P];t.preset={...t.preset,fabric:u.name,fabricMeta:u.meta,roughness:u.roughness},h=W(t.preset,t.color),d.setDressDetails(h),V(t),T(`${u.name} · ${u.meta}`)}),z(".color-swatch").forEach(u=>u.addEventListener("click",()=>v(u.dataset.color))),f("#custom-color").addEventListener("click",()=>f("#custom-color-input").click()),f("#custom-color-input").addEventListener("input",u=>v(u.target.value)),f("#weight-range").addEventListener("input",u=>{t.weight=Number(u.target.value),f("#weight-value").innerHTML=`${t.weight.toFixed(2)} <small>kg/m²</small>`,_(u.target)}),f("#stretch-range").addEventListener("input",u=>{t.stretch=Number(u.target.value)/100,f("#stretch-value").innerHTML=`${Math.round(t.stretch*100)} <small>%</small>`,_(u.target)}),f("#wind-range").addEventListener("input",u=>{t.wind=Number(u.target.value),f("#wind-value").innerHTML=`${t.wind.toFixed(2)} <small>m/s</small>`,f("#hud-wind").textContent=`WIND ${t.wind.toFixed(2)} M/S`,_(u.target)}),f("#play-pause").addEventListener("click",()=>{t.running=!t.running,F(t)}),f("#reset-sim").addEventListener("click",()=>g(!0)),f("#timeline-range").addEventListener("input",u=>{t.time=Number(u.target.value),t.simulation.reset(a),F(t)}),f("#speed-select").addEventListener("change",u=>{t.speed=Number(u.target.value),T(`Simulation speed set to ${t.speed}×.`)}),f("#save-project").addEventListener("click",()=>{const u={preset:t.preset.id,color:t.color,weight:t.weight,stretch:t.stretch,wind:t.wind,speed:t.speed};try{localStorage.setItem("stitch-violet-hour",JSON.stringify(u))}catch{}f(".saved-state").innerHTML="<i></i> Saved just now",T("Project saved in this browser.")}),f("#export-project").addEventListener("click",()=>Bt(t)),f("#rotate-view").addEventListener("click",()=>{t.autoRotate=!t.autoRotate,f("#rotate-view").classList.toggle("is-active",t.autoRotate),T(t.autoRotate?"Auto-rotate enabled.":"Auto-rotate paused.")}),f("#reset-view").addEventListener("click",()=>{t.rotation.yaw=.24,t.rotation.pitch=.025,t.rotation.distance=6.7,t.rotation.target=[0,1.55,0]}),f("#toggle-wireframe").addEventListener("click",()=>{t.wireframe=!t.wireframe,f("#toggle-wireframe").classList.toggle("is-active",t.wireframe),T(t.wireframe?"Fabric particle mesh shown.":"Fabric surface view restored.")}),f("#toggle-model").addEventListener("click",()=>{t.showModel=!t.showModel,f("#toggle-model").classList.toggle("is-active",!t.showModel),T(t.showModel?"Mannequin visible.":"Mannequin hidden.")}),f("#fullscreen-view").addEventListener("click",async()=>{const u=f(".viewport-shell");try{document.fullscreenElement?await document.exitFullscreen():await u.requestFullscreen()}catch{T("Fullscreen is not available in this browser.")}}),r.addEventListener("pointerdown",u=>{var x;u.button===0&&(t.pointer={x:u.clientX,y:u.clientY,moved:!1},(x=r.setPointerCapture)==null||x.call(r,u.pointerId),r.classList.add("dragging"))}),r.addEventListener("pointermove",u=>{var R;if(!t.pointer)return;const x=u.clientX-t.pointer.x,y=u.clientY-t.pointer.y;(R=t.pointer).moved||(R.moved=Math.abs(x)+Math.abs(y)>2),t.rotation.yaw+=x*.006,t.rotation.pitch=Math.max(-.16,Math.min(.62,t.rotation.pitch-y*.0045)),t.pointer.x=u.clientX,t.pointer.y=u.clientY});const L=()=>{t.pointer=null,r.classList.remove("dragging")};r.addEventListener("pointerup",L),r.addEventListener("pointercancel",L),r.addEventListener("wheel",u=>{u.preventDefault(),t.rotation.distance=Math.max(4.15,Math.min(10.5,t.rotation.distance+u.deltaY*.004))},{passive:!1}),r.addEventListener("dblclick",()=>{t.rotation.yaw=.24,t.rotation.pitch=.025,t.rotation.distance=6.7}),window.addEventListener("keydown",u=>{var x,y;u.code==="Space"&&!["INPUT","SELECT","TEXTAREA","BUTTON"].includes((x=document.activeElement)==null?void 0:x.tagName)&&(u.preventDefault(),t.running=!t.running,F(t)),u.key.toLowerCase()==="r"&&!["INPUT","SELECT","TEXTAREA"].includes((y=document.activeElement)==null?void 0:y.tagName)&&g(!0)}),new ResizeObserver(()=>{var u;return(u=d.resize)==null?void 0:u.call(d)}).observe(f(".stage"));let m=performance.now(),C=0,b=0,S=m;const B=u=>{const x=Math.min((u-m)/1e3,.05);m=u;const y=t.running?x*t.speed:0;t.running&&(t.time+=y,t.time>=8&&(t.time%=8,t.simulation.reset(a))),t.autoRotate&&(t.rotation.yaw+=x*.13);const R={running:t.running,wind:t.wind,gravity:t.weight,stretch:t.stretch};if(t.running&&t.simulation.step(y,t.time,R),d.render({simulation:t.simulation,dt:y,time:t.time,camera:t.rotation,color:et(t.color),roughness:t.preset.roughness,settings:R,wireframe:t.wireframe,showModel:t.showModel}),b++,C+=x,C>.6){const k=Math.round(b/C);f("#fps-label").textContent=`${k} FPS`,b=0,C=0}u-S>80&&(F(t),S=u),requestAnimationFrame(B)};requestAnimationFrame(B)}export{Rt as boot};
