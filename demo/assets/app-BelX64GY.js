const D=Math.PI*2,G=64,U=64,V={slip:{id:"slip",title:"Silk slip",graphName:"Silk slip dress",fabric:"Mulberry silk",fabricMeta:"19 momme · satin weave",color:"#a52343",roughness:.16,hem:.23,flare:.78,top:2.42,neckDrop:.105,train:0,strapRadius:.015,gravity:.78,stretch:.68},midi:{id:"midi",title:"Soft midi",graphName:"Soft midi dress",fabric:"Washed satin",fabricMeta:"24 momme · sand-washed",color:"#728b78",roughness:.24,hem:.49,flare:.72,top:2.43,neckDrop:.07,train:0,strapRadius:.022,gravity:.86,stretch:.54},gown:{id:"gown",title:"Evening gown",graphName:"Evening gown",fabric:"Silk velvet",fabricMeta:"32 momme · fluid velvet",color:"#273e64",roughness:.31,hem:.13,flare:1.2,top:2.41,neckDrop:.145,train:.17,strapRadius:.025,gravity:.91,stretch:.46}};function q(i){const t=String(i).replace("#","").trim(),r=t.length===3?t.split("").map(n=>n+n).join(""):t,o=Number.parseInt(r||"000000",16);return[(o>>16&255)/255,(o>>8&255)/255,(o&255)/255]}function j(i,t,r){const o=Math.hypot(i,t,r)||1;return[i/o,t/o,r/o]}class ie{constructor(){this.positions=[],this.indices=[],this.colors=[],this.roughness=[]}addMesh(t,r,o,n=.7){const s=Array.isArray(o)?o:q(o),e=this.positions.length/3;for(let a=0;a<t.length;a+=3)this.positions.push(t[a],t[a+1],t[a+2]),this.colors.push(s[0],s[1],s[2],1),this.roughness.push(n);for(let a=0;a<r.length;a++)this.indices.push(r[a]+e)}addEllipsoid(t,r,o,n=.7,s=16,e=24){const a=[],h=[];for(let u=0;u<=s;u++){const c=Math.PI*u/s,d=Math.cos(c),w=Math.sin(c);for(let m=0;m<e;m++){const v=D*m/e;a.push(t[0]+r[0]*w*Math.sin(v),t[1]+r[1]*d,t[2]+r[2]*w*Math.cos(v))}}for(let u=0;u<s;u++)for(let c=0;c<e;c++){const d=(c+1)%e,w=u*e+c,m=(u+1)*e+c,v=(u+1)*e+d,f=u*e+d;h.push(w,m,f,m,v,f)}this.addMesh(a,h,o,n)}addLoft(t,r,o=.72,n=36){const s=[],e=[];for(const a of t)for(let h=0;h<n;h++){const u=D*h/n;s.push((a.cx||0)+a.rx*Math.sin(u),a.y,(a.cz||0)+a.rz*Math.cos(u))}for(let a=0;a<t.length-1;a++)for(let h=0;h<n;h++){const u=(h+1)%n,c=a*n+h,d=a*n+u,w=(a+1)*n+h,m=(a+1)*n+u;e.push(c,d,w,d,m,w)}this.addMesh(s,e,r,o)}addTubePath(t,r,o,n=.62,s=12){const e=[],a=[],h=t.map(c=>[...c]),u=(c,d)=>[d[0]-c[0],d[1]-c[1],d[2]-c[2]];for(let c=0;c<h.length;c++){const d=h[Math.max(0,c-1)],w=h[Math.min(h.length-1,c+1)],m=j(...u(d,w)),v=Math.abs(m[2])>.92?[0,1,0]:[0,0,1],f=j(m[1]*v[2]-m[2]*v[1],m[2]*v[0]-m[0]*v[2],m[0]*v[1]-m[1]*v[0]),B=[m[1]*f[2]-m[2]*f[1],m[2]*f[0]-m[0]*f[2],m[0]*f[1]-m[1]*f[0]],C=Array.isArray(r)?r[c]:r;for(let P=0;P<s;P++){const A=D*P/s,x=Math.cos(A),g=Math.sin(A);e.push(h[c][0]+C*(f[0]*x+B[0]*g),h[c][1]+C*(f[1]*x+B[1]*g),h[c][2]+C*(f[2]*x+B[2]*g))}}for(let c=0;c<h.length-1;c++)for(let d=0;d<s;d++){const w=(d+1)%s,m=c*s+d,v=c*s+w,f=(c+1)*s+d,B=(c+1)*s+w;a.push(m,v,f,v,B,f)}this.addMesh(e,a,o,n)}finish(){const t=new Float32Array(this.positions),r=new Uint16Array(this.indices),o=ae(t,r),n=t.length/3,s=new Float32Array(n*11);for(let e=0;e<n;e++){const a=e*11,h=e*3;s[a]=t[h],s[a+1]=t[h+1],s[a+2]=t[h+2],s[a+3]=o[h],s[a+4]=o[h+1],s[a+5]=o[h+2],s[a+6]=this.colors[e*4],s[a+7]=this.colors[e*4+1],s[a+8]=this.colors[e*4+2],s[a+9]=this.colors[e*4+3],s[a+10]=this.roughness[e]}return{vertices:s,indices:r,indexCount:r.length,vertexCount:n}}}function ae(i,t){const r=new Float32Array(i.length);for(let o=0;o<t.length;o+=3){const n=t[o]*3,s=t[o+1]*3,e=t[o+2]*3,a=i[s]-i[n],h=i[s+1]-i[n+1],u=i[s+2]-i[n+2],c=i[e]-i[n],d=i[e+1]-i[n+1],w=i[e+2]-i[n+2],m=h*w-u*d,v=u*c-a*w,f=a*d-h*c;r[n]+=m,r[n+1]+=v,r[n+2]+=f,r[s]+=m,r[s+1]+=v,r[s+2]+=f,r[e]+=m,r[e+1]+=v,r[e+2]+=f}for(let o=0;o<r.length;o+=3){const n=j(r[o],r[o+1],r[o+2]);r[o]=n[0],r[o+1]=n[1],r[o+2]=n[2]}return r}function ce(){const i=new ie,t="#c9977f",r="#d3a48d",o="#332b2b",n="#b9955d";i.addLoft([{y:1.02,rx:.245,rz:.16},{y:1.1,rx:.34,rz:.215},{y:1.26,rx:.365,rz:.23},{y:1.42,rx:.33,rz:.215},{y:1.56,rx:.285,rz:.19},{y:1.67,rx:.275,rz:.19},{y:1.79,rx:.3,rz:.205},{y:1.91,rx:.345,rz:.23},{y:2.04,rx:.375,rz:.245},{y:2.16,rx:.36,rz:.23},{y:2.27,rx:.3,rz:.195},{y:2.35,rx:.22,rz:.155}],t,.77,40),i.addLoft([{y:2.31,rx:.15,rz:.13},{y:2.39,rx:.12,rz:.115},{y:2.49,rx:.098,rz:.095},{y:2.6,rx:.091,rz:.088},{y:2.68,rx:.103,rz:.094}],r,.72,32),i.addEllipsoid([0,2.87,.006],[.146,.205,.139],r,.7,20,28),i.addEllipsoid([0,3.016,-.045],[.15,.079,.145],o,.53,14,24),i.addEllipsoid([0,2.943,-.147],[.082,.093,.081],o,.56,12,20),i.addEllipsoid([-.133,2.84,.001],[.025,.045,.028],t,.74,10,16),i.addEllipsoid([.133,2.84,.001],[.025,.045,.028],t,.74,10,16),i.addEllipsoid([-.154,2.805,.006],[.011,.022,.011],n,.35,10,14),i.addEllipsoid([.154,2.805,.006],[.011,.022,.011],n,.35,10,14),i.addEllipsoid([-.052,2.891,.133],[.014,.008,.006],"#3b302f",.32,8,12),i.addEllipsoid([.052,2.891,.133],[.014,.008,.006],"#3b302f",.32,8,12),i.addEllipsoid([0,2.846,.14],[.018,.032,.021],t,.76,10,14),i.addEllipsoid([0,2.796,.137],[.034,.009,.007],"#9f615e",.57,8,16),i.addTubePath([[-.071,2.91,.126],[-.052,2.918,.132],[-.034,2.91,.128]],[.004,.004,.003],o,.54,7),i.addTubePath([[.034,2.91,.128],[.052,2.918,.132],[.071,2.91,.126]],[.003,.004,.004],o,.54,7);const s=[[-.279,2.345,.005],[-.354,2.15,.017],[-.398,1.936,.044],[-.456,1.704,.078],[-.496,1.482,.104],[-.505,1.376,.118]],e=[.095,.08,.069,.055,.041,.037];i.addTubePath(s,e,r,.74,14),i.addTubePath(s.map(([u,c,d])=>[-u,c,d]),e,r,.74,14),i.addEllipsoid([-.507,1.31,.137],[.043,.085,.035],t,.77,12,18),i.addEllipsoid([.507,1.31,.137],[.043,.085,.035],t,.77,12,18);for(const u of[-1,1])for(let c=-1;c<=1;c++){const d=u*(.507+c*.018);i.addTubePath([[d,1.29,.15],[d+u*c*.004,1.235,.158]],[.011,.007],t,.78,7)}const a=[[-.155,1.12,.005],[-.158,.78,.013],[-.164,.38,.024],[-.164,.105,.034]],h=[.118,.094,.067,.054];return i.addTubePath(a,h,r,.76,16),i.addTubePath(a.map(([u,c,d])=>[-u,c,d]),h,r,.76,16),i.addEllipsoid([-.164,.076,.12],[.071,.064,.15],t,.77,12,18),i.addEllipsoid([.164,.076,.12],[.071,.064,.15],t,.77,12,18),i.addMesh(new Float32Array([-16,-.012,-16,16,-.012,-16,16,-.012,16,-16,-.012,16]),new Uint16Array([0,2,1,0,3,2]),"#e8e3dc",.96),i.finish()}function _(i,t){const r=.9+(t.flare-.78)*.16,o=[{y:.08,rx:.7*r,rz:.46*r},{y:.48,rx:.62*r,rz:.42*r},{y:.93,rx:.47,rz:.31},{y:1.13,rx:.405,rz:.272},{y:1.3,rx:.37,rz:.25},{y:1.47,rx:.325,rz:.225},{y:1.61,rx:.29,rz:.204},{y:1.75,rx:.302,rz:.21},{y:1.92,rx:.347,rz:.232},{y:2.08,rx:.376,rz:.247},{y:2.2,rx:.365,rz:.236},{y:2.34,rx:.325,rz:.218},{y:2.49,rx:.276,rz:.192}];if(i<=o[0].y)return[o[0].rx,o[0].rz];for(let n=0;n<o.length-1;n++){const s=o[n],e=o[n+1];if(i<=e.y){const a=Math.max(0,Math.min(1,(i-s.y)/(e.y-s.y)));return[s.rx+(e.rx-s.rx)*a,s.rz+(e.rz-s.rz)*a]}}return[o.at(-1).rx,o.at(-1).rz]}function Q(i,t=G,r=U){const o=new Float32Array(t*r*3),n=new Uint16Array((r-1)*t*6);let s=0;for(let e=0;e<r;e++){const a=e/(r-1);for(let h=0;h<t;h++){const u=D*h/t,c=Math.max(0,Math.cos(u)),d=Math.max(0,-Math.cos(u)),w=Math.sin(u)**2,m=i.top+.022*w-i.neckDrop*Math.pow(c,1.25),v=i.hem+i.train*Math.pow(d,5),f=m*(1-a)+v*a;let[B,C]=_(f,i);const P=Math.max(0,Math.min(1,(1.34-f)/1.2)),A=Math.sin(u*8+f*2.7)*.007*Math.pow(a,1.35),x=Math.sin(u*4-f*3.2)*.0035*P;B+=(A+x)*(.55+i.flare*.2),C+=A*.65+x*.45;const g=(e*t+h)*3;o[g]=B*Math.sin(u),o[g+1]=f,o[g+2]=C*Math.cos(u)}}for(let e=0;e<r-1;e++)for(let a=0;a<t;a++){const h=(a+1)%t,u=e*t+a,c=e*t+h,d=(e+1)*t+a,w=(e+1)*t+h;n[s++]=u,n[s++]=d,n[s++]=c,n[s++]=c,n[s++]=d,n[s++]=w}return{positions:o,restPositions:o.slice(),indices:n,cols:t,rows:r,count:t*r}}function O(i,t=i.color){const r=new ie,o=i.strapRadius,n=i.id==="gown"?.018:.006;for(const e of[-1,1]){const a=e*.145,[h,u]=_(i.top,i),c=Math.asin(Math.min(.92,Math.abs(a)/h)),d=i.top+.022*Math.sin(c)**2-i.neckDrop*Math.pow(Math.cos(c),1.25),m=_(d,i)[1]*Math.cos(c),v=i.top+.022*Math.sin(c)**2,f=_(v,i)[1]*Math.cos(c);r.addTubePath([[a,d+.006,m+.006+n],[a,d+.082,m+.012+n],[e*.158,2.52,.145+n],[e*.161,2.565,.045+n],[e*.16,2.52,-.105+n],[e*.145,v-.004,-f-.008+n]],[o*.92,o,o,o*.95,o,o*.9],t,i.roughness,10)}const s=[];for(let e=0;e<=48;e++){const a=D*e/48,h=Math.max(0,Math.cos(a)),u=i.top+.022*Math.sin(a)**2-i.neckDrop*Math.pow(h,1.25),[c,d]=_(u,i);s.push([c*Math.sin(a),u+.005,d*Math.cos(a)])}return r.addTubePath(s,.006,t,Math.min(.34,i.roughness+.08),6),r.finish()}function le(i,t,r,o=.16){const n=t*r,s=new Float32Array(n*11);for(let e=0;e<r;e++){const a=Math.max(0,e-1),h=Math.min(r-1,e+1);for(let u=0;u<t;u++){const c=e*t+(u+t-1)%t,d=e*t+(u+1)%t,w=a*t+u,m=h*t+u,v=c*3,f=d*3,B=w*3,C=m*3,P=[i[f]-i[v],i[f+1]-i[v+1],i[f+2]-i[v+2]],A=[i[C]-i[B],i[C+1]-i[B+1],i[C+2]-i[B+2]];let x=A[1]*P[2]-A[2]*P[1],g=A[2]*P[0]-A[0]*P[2],L=A[0]*P[1]-A[1]*P[0];const b=Math.hypot(x,g,L)||1;x/=b,g/=b,L/=b;const R=(e*t+u)*3,l=(e*t+u)*11;s[l]=i[R],s[l+1]=i[R+1],s[l+2]=i[R+2],s[l+3]=x,s[l+4]=g,s[l+5]=L,s[l+6]=1,s[l+7]=1,s[l+8]=1,s[l+9]=1,s[l+10]=o}}return s}const ue=`
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
`,he=`
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
`;function ee(i){const t=new Float32Array(i.length/3*4);for(let r=0,o=0;r<i.length;r+=3,o+=4)t[o]=i[r],t[o+1]=i[r+1],t[o+2]=i[r+2],t[o+3]=1;return t}function de(i,t,r){let o=0,n=0;if(t>=1.08&&t<=2.43)if(t<1.56){const s=Math.max(0,Math.min(1,(t-1.08)/.48));o=.36+(.29-.36)*s,n=.235+(.195-.235)*s}else if(t<2.02){const s=Math.max(0,Math.min(1,(t-1.56)/.46));o=.29+(.37-.29)*s,n=.195+(.24-.195)*s}else{const s=Math.max(0,Math.min(1,(t-2.02)/.41));o=.37+(.3-.37)*s,n=.24+(.19-.24)*s}if(o>0){const s=Math.hypot(i/(o+.012),r/(n+.012));s<1&&s>1e-4&&(i/=s,r/=s)}return[i,Math.max(t,.055),r]}class fe{constructor(t){this.iterations=5,this.reset(t)}reset(t){this.cols=t.cols,this.rows=t.rows,this.count=t.count,this.rest=t.restPositions.slice(),this.positions=t.positions.slice(),this.previous=t.positions.slice(),this.predicted=new Float32Array(this.positions.length),this.scratch=new Float32Array(this.positions.length),this.indices=t.indices}step(t,r,o={}){if(t<=0)return;t=Math.min(t,1/30);const n=.988,s=o.wind??.42,e=o.gravity??.78,a=o.stretch??.68,h=t*t,u=this.cols,c=this.rows,d=this.positions,w=this.previous,m=this.rest,v=this.predicted;for(let P=0;P<c;P++)for(let A=0;A<u;A++){const g=(P*u+A)*3;if(P===0){v[g]=m[g],v[g+1]=m[g+1],v[g+2]=m[g+2],w[g]=m[g],w[g+1]=m[g+1],w[g+2]=m[g+2];continue}const L=d[g],b=d[g+1],R=d[g+2],l=(L-w[g])*n,y=(b-w[g+1])*n,M=(R-w[g+2])*n;w[g]=L,w[g+1]=b,w[g+2]=R;const E=Math.sin(r*1.35+b*1.7)*.85*s,z=Math.sin(r*.83+L*2.1)*.65*s;v[g]=L+l+(E+(m[g]-L)*4)*h,v[g+1]=b+y+(.08-9.8*e)*h,v[g+2]=R+M+(z+(m[g+2]-R)*4)*h}let f=v,B=this.scratch;const C=.135+a*.19;for(let P=0;P<this.iterations;P++){for(let x=0;x<c;x++)for(let g=0;g<u;g++){const b=(x*u+g)*3;if(x===0){B[b]=m[b],B[b+1]=m[b+1],B[b+2]=m[b+2];continue}let R=0,l=0,y=0,M=0;const E=ne=>{const N=ne*3,J=f[N]-f[b],K=f[N+1]-f[b+1],Z=f[N+2]-f[b+2],$=Math.hypot(J,K,Z),se=Math.hypot(m[N]-m[b],m[N+1]-m[b+1],m[N+2]-m[b+2]);if($>1e-5){const Y=($-se)/$;R+=J*Y,l+=K*Y,y+=Z*Y}M++};E(x*u+(g+u-1)%u),E(x*u+(g+1)%u),x>0&&(E((x-1)*u+g),E((x-1)*u+(g+u-1)%u),E((x-1)*u+(g+1)%u)),x+1<c&&(E((x+1)*u+g),E((x+1)*u+(g+u-1)%u),E((x+1)*u+(g+1)%u));const z=C/Math.sqrt(M),H=de(f[b]+R*z,f[b+1]+l*z,f[b+2]+y*z);B[b]=H[0],B[b+1]=H[1],B[b+2]=H[2]}const A=f;f=B,B=A}this.positions.set(f)}}class pe{constructor(t,r){this.device=t,this.geometry=r,this.count=r.count,this.cols=r.cols,this.rows=r.rows,this.running=!0,this.iterations=5;const o=GPUBufferUsage;this.positionBuffer=t.createBuffer({label:"cloth positions",size:this.count*16,usage:o.STORAGE|o.COPY_DST|o.COPY_SRC}),this.previousBuffer=t.createBuffer({label:"cloth previous positions",size:this.count*16,usage:o.STORAGE|o.COPY_DST}),this.scratchA=t.createBuffer({label:"cloth solver A",size:this.count*16,usage:o.STORAGE}),this.scratchB=t.createBuffer({label:"cloth solver B",size:this.count*16,usage:o.STORAGE}),this.restBuffer=t.createBuffer({label:"cloth rest shape",size:this.count*16,usage:o.STORAGE|o.COPY_DST}),this.uniformBuffer=t.createBuffer({label:"cloth solver uniforms",size:32,usage:o.UNIFORM|o.COPY_DST});const n=t.createShaderModule({label:"Verlet integrate WGSL",code:ue}),s=t.createShaderModule({label:"Position constraints WGSL",code:he});this.integratePipeline=t.createComputePipeline({label:"cloth integration",layout:"auto",compute:{module:n,entryPoint:"integrate"}}),this.constraintPipeline=t.createComputePipeline({label:"cloth distance constraints",layout:"auto",compute:{module:s,entryPoint:"solve"}});const e=this.integratePipeline.getBindGroupLayout(0);this.integrateGroup=t.createBindGroup({label:"cloth integrate bindings",layout:e,entries:[{binding:0,resource:{buffer:this.positionBuffer}},{binding:1,resource:{buffer:this.previousBuffer}},{binding:2,resource:{buffer:this.scratchA}},{binding:3,resource:{buffer:this.restBuffer}},{binding:4,resource:{buffer:this.uniformBuffer}}]});const a=this.constraintPipeline.getBindGroupLayout(0),h=(u,c,d)=>t.createBindGroup({label:u,layout:a,entries:[{binding:0,resource:{buffer:c}},{binding:1,resource:{buffer:d}},{binding:2,resource:{buffer:this.restBuffer}},{binding:3,resource:{buffer:this.uniformBuffer}}]});this.solveAB=h("cloth A to B",this.scratchA,this.scratchB),this.solveBA=h("cloth B to A",this.scratchB,this.scratchA),this.solveAToPosition=h("cloth final pass",this.scratchA,this.positionBuffer),this.reset(r)}reset(t=this.geometry){this.geometry=t,this.cols=t.cols,this.rows=t.rows,this.count=t.count;const r=ee(t.restPositions),o=ee(t.positions);this.device.queue.writeBuffer(this.restBuffer,0,r),this.device.queue.writeBuffer(this.positionBuffer,0,o),this.device.queue.writeBuffer(this.previousBuffer,0,o)}encode(t,r,o,n={}){if(!n.running||r<=0)return;r=Math.min(r,1/30);const s=new Float32Array([r,.988,n.wind??.42,n.gravity??.78,o,this.rows,this.cols,n.stretch??.68]);this.device.queue.writeBuffer(this.uniformBuffer,0,s);const e=Math.ceil(this.count/64);let a=t.beginComputePass({label:"cloth verlet integration"});a.setPipeline(this.integratePipeline),a.setBindGroup(0,this.integrateGroup),a.dispatchWorkgroups(e),a.end();for(let h=0;h<this.iterations;h++)a=t.beginComputePass({label:`cloth constraints ${h+1}`}),a.setPipeline(this.constraintPipeline),h===this.iterations-1?a.setBindGroup(0,this.solveAToPosition):a.setBindGroup(0,h%2===0?this.solveAB:this.solveBA),a.dispatchWorkgroups(e),a.end()}destroy(){this.positionBuffer.destroy(),this.previousBuffer.destroy(),this.scratchA.destroy(),this.scratchB.destroy(),this.restBuffer.destroy(),this.uniformBuffer.destroy()}}const me=`
struct SceneUniforms {
  viewProjection: mat4x4<f32>,
  camera: vec4<f32>,
  dress: vec4<f32>,
  clock: vec4<f32>,
};
@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) roughness: f32,
};
struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) roughness: f32,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.clipPosition = scene.viewProjection * vec4<f32>(input.position, 1.0);
  output.worldPosition = input.position;
  output.worldNormal = input.normal;
  output.color = input.color;
  output.roughness = input.roughness;
  return output;
}

fn illuminate(base: vec3<f32>, normal: vec3<f32>, position: vec3<f32>, roughness: f32) -> vec4<f32> {
  let n = normalize(normal);
  let light = normalize(vec3<f32>(-0.48, 0.82, 0.48));
  let view = normalize(scene.camera.xyz - position);
  let halfVector = normalize(light + view);
  let diffuse = max(dot(n, light), 0.0);
  let r = clamp(roughness, 0.055, 1.0);
  let gloss = 1.0 - r;
  let specular = pow(max(dot(n, halfVector), 0.0), mix(7.0, 88.0, gloss)) * mix(0.025, 0.32, gloss);
  let rim = pow(1.0 - max(dot(n, view), 0.0), 3.0) * mix(0.025, 0.12, gloss);
  let broadHighlight = pow(max(dot(n, halfVector), 0.0), 5.0) * mix(0.005, 0.08, gloss);
  let lit = base * (0.39 + diffuse * 0.74) + vec3<f32>(specular + rim + broadHighlight);
  return vec4<f32>(lit, 1.0);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return illuminate(input.color.rgb, input.worldNormal, input.worldPosition, input.roughness);
}
`,ge=`
struct SceneUniforms {
  viewProjection: mat4x4<f32>,
  camera: vec4<f32>,
  dress: vec4<f32>,
  clock: vec4<f32>,
};
@group(0) @binding(0) var<storage, read> clothPositions: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> scene: SceneUniforms;

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  let cols = 64u;
  let rows = 64u;
  let row = vertexIndex / cols;
  let col = vertexIndex % cols;
  let left = row * cols + ((col + cols - 1u) % cols);
  let right = row * cols + ((col + 1u) % cols);
  var aboveRow = row;
  var belowRow = row;
  if (row > 0u) { aboveRow = row - 1u; }
  if (row + 1u < rows) { belowRow = row + 1u; }
  let above = aboveRow * cols + col;
  let below = belowRow * cols + col;
  let p = clothPositions[vertexIndex].xyz;
  let across = clothPositions[right].xyz - clothPositions[left].xyz;
  let vertical = clothPositions[below].xyz - clothPositions[above].xyz;
  let normal = normalize(cross(vertical, across));
  var output: VertexOutput;
  output.clipPosition = scene.viewProjection * vec4<f32>(p, 1.0);
  output.worldPosition = p;
  output.worldNormal = normal;
  return output;
}

fn illuminate(base: vec3<f32>, normal: vec3<f32>, position: vec3<f32>, roughness: f32) -> vec4<f32> {
  let n = normalize(normal);
  let light = normalize(vec3<f32>(-0.48, 0.82, 0.48));
  let view = normalize(scene.camera.xyz - position);
  let halfVector = normalize(light + view);
  let diffuse = max(dot(n, light), 0.0);
  let r = clamp(roughness, 0.055, 1.0);
  let gloss = 1.0 - r;
  let specular = pow(max(dot(n, halfVector), 0.0), mix(7.0, 88.0, gloss)) * mix(0.025, 0.32, gloss);
  let rim = pow(1.0 - max(dot(n, view), 0.0), 3.0) * mix(0.025, 0.12, gloss);
  let broadHighlight = pow(max(dot(n, halfVector), 0.0), 5.0) * mix(0.005, 0.08, gloss);
  let sheen = pow(1.0 - abs(dot(n, view)), 4.0) * mix(0.0, 0.055, gloss);
  let lit = base * (0.39 + diffuse * 0.74) + vec3<f32>(specular + rim + broadHighlight + sheen);
  return vec4<f32>(lit, 1.0);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return illuminate(scene.dress.rgb, input.worldNormal, input.worldPosition, scene.dress.a);
}
`,ve=`#version 300 es
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
`,we=`#version 300 es
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
`;function te(i,t,r){const o=Math.hypot(i,t,r)||1;return[i/o,t/o,r/o]}function xe(i,t,r=[0,1,0]){const o=te(i[0]-t[0],i[1]-t[1],i[2]-t[2]),n=te(r[1]*o[2]-r[2]*o[1],r[2]*o[0]-r[0]*o[2],r[0]*o[1]-r[1]*o[0]),s=[o[1]*n[2]-o[2]*n[1],o[2]*n[0]-o[0]*n[2],o[0]*n[1]-o[1]*n[0]],e=new Float32Array(16);return e[0]=n[0],e[1]=s[0],e[2]=o[0],e[3]=0,e[4]=n[1],e[5]=s[1],e[6]=o[1],e[7]=0,e[8]=n[2],e[9]=s[2],e[10]=o[2],e[11]=0,e[12]=-(n[0]*i[0]+n[1]*i[1]+n[2]*i[2]),e[13]=-(s[0]*i[0]+s[1]*i[1]+s[2]*i[2]),e[14]=-(o[0]*i[0]+o[1]*i[1]+o[2]*i[2]),e[15]=1,e}function be(i,t){const r=1/Math.tan(35*Math.PI/180/2),o=.1,n=90,s=new Float32Array(16);return s[0]=r/Math.max(i,.1),s[5]=r,t?(s[10]=n/(o-n),s[11]=-1,s[14]=n*o/(o-n)):(s[10]=(n+o)/(o-n),s[11]=-1,s[14]=2*n*o/(o-n)),s}function ye(i,t){const r=new Float32Array(16);for(let o=0;o<4;o++)for(let n=0;n<4;n++)r[o*4+n]=i[n]*t[o*4]+i[4+n]*t[o*4+1]+i[8+n]*t[o*4+2]+i[12+n]*t[o*4+3];return r}function oe(i,t,r=!1){const o=Math.cos(i.pitch),n=[i.target[0]+Math.sin(i.yaw)*o*i.distance,i.target[1]+Math.sin(i.pitch)*i.distance,i.target[2]+Math.cos(i.yaw)*o*i.distance],s=xe(n,i.target),e=be(t,r);return{matrix:ye(e,s),eye:n}}function F(i,t,r,o){const n=i.createBuffer({label:t,size:Math.max(4,r.byteLength),usage:o,mappedAtCreation:!0});return new Uint8Array(n.getMappedRange()).set(new Uint8Array(r.buffer,r.byteOffset,r.byteLength)),n.unmap(),n}function Be(i,t,r,o){const n=new Float32Array(28);return n.set(i,0),n.set(t,16),n[19]=1,n[20]=r[0],n[21]=r[1],n[22]=r[2],n[23]=r[3],n[24]=o,n[25]=0,n[26]=0,n[27]=0,n}function X(i,t){const r=[];for(let o=0;o<t;o++)for(let n=0;n<i;n++){const s=o*i+n,e=o*i+(n+1)%i;r.push(s,e),o+1<t&&r.push(s,(o+1)*i+n)}return new Uint16Array(r)}async function Me(i,t,r,o){if(!("gpu"in navigator))return null;let n,s;try{if(n=await navigator.gpu.requestAdapter({powerPreference:"high-performance"}),!n)return null;s=await n.requestDevice();const e=i.getContext("webgpu");if(!e)return s.destroy(),null;const a=navigator.gpu.getPreferredCanvasFormat();e.configure({device:s,format:a,alphaMode:"premultiplied"});const h=new Ee(i,s,e,a,t,r,o);return await h.initialize(),h}catch(e){console.warn("WebGPU setup failed; using the WebGL renderer instead.",e);try{s==null||s.destroy()}catch{}return null}}class Ee{constructor(t,r,o,n,s,e,a){this.type="webgpu",this.canvas=t,this.device=r,this.context=o,this.format=n,this.modelGeometry=s,this.clothGeometry=e,this.detailsGeometry=a,this.sceneUniformBuffer=r.createBuffer({label:"camera and fabric uniforms",size:112,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.depthTexture=null,this.depthView=null,this.width=0,this.height=0,this.simulation=null,this.clothBindGroup=null,this.isWireframe=!1,this.staticVisible=!0}async initialize(){const t=this.device,r=t.createShaderModule({label:"studio material shader",code:me}),o=t.createShaderModule({label:"silk surface shader",code:ge}),n=[{arrayStride:44,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"},{shaderLocation:2,offset:24,format:"float32x4"},{shaderLocation:3,offset:40,format:"float32"}]}],s=e=>t.createRenderPipeline({label:e,layout:"auto",vertex:{module:r,entryPoint:"vertexMain",buffers:n},fragment:{module:r,entryPoint:"fragmentMain",targets:[{format:this.format}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:"depth24plus",depthWriteEnabled:!0,depthCompare:"less"}});this.staticPipeline=s("body and garment detail pipeline"),this.clothPipeline=t.createRenderPipeline({label:"live fabric surface pipeline",layout:"auto",vertex:{module:o,entryPoint:"vertexMain"},fragment:{module:o,entryPoint:"fragmentMain",targets:[{format:this.format}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:"depth24plus",depthWriteEnabled:!0,depthCompare:"less"}}),this.wirePipeline=t.createRenderPipeline({label:"fabric topology pipeline",layout:"auto",vertex:{module:o,entryPoint:"vertexMain"},fragment:{module:o,entryPoint:"fragmentMain",targets:[{format:this.format}]},primitive:{topology:"line-list"},depthStencil:{format:"depth24plus",depthWriteEnabled:!1,depthCompare:"less-equal"}}),this.sceneBindGroup=t.createBindGroup({label:"studio scene uniforms",layout:this.staticPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.sceneUniformBuffer}}]}),this.staticVertexBuffer=F(t,"mannequin and studio vertices",this.modelGeometry.vertices,GPUBufferUsage.VERTEX),this.staticIndexBuffer=F(t,"mannequin and studio indices",this.modelGeometry.indices,GPUBufferUsage.INDEX),this.staticIndexCount=this.modelGeometry.indexCount,this.clothIndexBuffer=F(t,"dress triangle indices",this.clothGeometry.indices,GPUBufferUsage.INDEX),this.clothWireIndexBuffer=F(t,"dress wire indices",X(this.clothGeometry.cols,this.clothGeometry.rows),GPUBufferUsage.INDEX),this.clothWireIndexCount=X(this.clothGeometry.cols,this.clothGeometry.rows).length,this.setDressDetails(this.detailsGeometry),this.resize(!0)}setSimulation(t){this.simulation=t;const r=[{binding:0,resource:{buffer:t.positionBuffer}},{binding:1,resource:{buffer:this.sceneUniformBuffer}}];this.clothBindGroup=this.device.createBindGroup({label:"live fabric positions and material",layout:this.clothPipeline.getBindGroupLayout(0),entries:r}),this.clothWireBindGroup=this.device.createBindGroup({label:"live fabric wireframe positions and material",layout:this.wirePipeline.getBindGroupLayout(0),entries:r})}setDressDetails(t){this.detailsVertexBuffer&&this.detailsVertexBuffer.destroy(),this.detailsIndexBuffer&&this.detailsIndexBuffer.destroy(),this.detailsGeometry=t,this.detailsVertexBuffer=F(this.device,"stitched garment details",t.vertices,GPUBufferUsage.VERTEX),this.detailsIndexBuffer=F(this.device,"stitched garment indices",t.indices,GPUBufferUsage.INDEX),this.detailsIndexCount=t.indexCount}resize(t=!1){const r=this.canvas.getBoundingClientRect(),o=Math.min(window.devicePixelRatio||1,1.8),n=Math.max(1,Math.round(r.width*o)),s=Math.max(1,Math.round(r.height*o));!t&&n===this.width&&s===this.height||(this.width=n,this.height=s,this.canvas.width=n,this.canvas.height=s,this.context.configure({device:this.device,format:this.format,alphaMode:"premultiplied"}),this.depthTexture&&this.depthTexture.destroy(),this.depthTexture=this.device.createTexture({label:"viewport depth",size:[n,s],format:"depth24plus",usage:GPUTextureUsage.RENDER_ATTACHMENT}),this.depthView=this.depthTexture.createView())}render({simulation:t,dt:r,time:o,camera:n,color:s,roughness:e,settings:a,wireframe:h=!1,showModel:u=!0}){this.resize();const c=this.width/Math.max(1,this.height),{matrix:d,eye:w}=oe(n,c,!0),m=[s[0],s[1],s[2],e];this.device.queue.writeBuffer(this.sceneUniformBuffer,0,Be(d,w,m,o));const v=this.device.createCommandEncoder({label:"stitch viewport frame"});a.running&&t&&t.encode(v,r,o,a);const f=v.beginRenderPass({label:"studio render pass",colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:{view:this.depthView,depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"}});u&&(f.setPipeline(this.staticPipeline),f.setBindGroup(0,this.sceneBindGroup),f.setVertexBuffer(0,this.staticVertexBuffer),f.setIndexBuffer(this.staticIndexBuffer,"uint16"),f.drawIndexed(this.staticIndexCount)),this.detailsIndexCount&&(f.setPipeline(this.staticPipeline),f.setBindGroup(0,this.sceneBindGroup),f.setVertexBuffer(0,this.detailsVertexBuffer),f.setIndexBuffer(this.detailsIndexBuffer,"uint16"),f.drawIndexed(this.detailsIndexCount)),t&&this.clothBindGroup&&(h?(f.setPipeline(this.wirePipeline),f.setBindGroup(0,this.clothWireBindGroup),f.setIndexBuffer(this.clothWireIndexBuffer,"uint16"),f.drawIndexed(this.clothWireIndexCount)):(f.setPipeline(this.clothPipeline),f.setBindGroup(0,this.clothBindGroup),f.setIndexBuffer(this.clothIndexBuffer,"uint16"),f.drawIndexed(this.clothGeometry.indices.length))),f.end(),this.device.queue.submit([v.finish()])}dispose(){var t,r,o,n,s,e,a,h,u;(t=this.depthTexture)==null||t.destroy(),(r=this.staticVertexBuffer)==null||r.destroy(),(o=this.staticIndexBuffer)==null||o.destroy(),(n=this.detailsVertexBuffer)==null||n.destroy(),(s=this.detailsIndexBuffer)==null||s.destroy(),(e=this.clothIndexBuffer)==null||e.destroy(),(a=this.clothWireIndexBuffer)==null||a.destroy(),(h=this.sceneUniformBuffer)==null||h.destroy(),(u=this.device)==null||u.destroy()}}function re(i,t,r){const o=i.createShader(t);if(i.shaderSource(o,r),i.compileShader(o),!i.getShaderParameter(o,i.COMPILE_STATUS)){const n=i.getShaderInfoLog(o)||"Unknown shader compilation error";throw i.deleteShader(o),new Error(n)}return o}function Pe(i){const t=re(i,i.VERTEX_SHADER,ve),r=re(i,i.FRAGMENT_SHADER,we),o=i.createProgram();if(i.attachShader(o,t),i.attachShader(o,r),i.linkProgram(o),i.deleteShader(t),i.deleteShader(r),!i.getProgramParameter(o,i.LINK_STATUS))throw new Error(i.getProgramInfoLog(o)||"Could not link the viewport shaders.");return o}function Ae(i,t,r,o){const n=i.getContext("webgl2",{alpha:!0,antialias:!0,premultipliedAlpha:!0,powerPreference:"high-performance"});if(!n)throw new Error("This browser does not provide a WebGPU or WebGL2 renderer.");return new Le(i,n,t,r,o)}class Le{constructor(t,r,o,n,s){this.type="webgl",this.canvas=t,this.gl=r,this.modelGeometry=o,this.clothGeometry=n,this.detailsGeometry=s,this.isWireframe=!1,this.staticVisible=!0,this.program=Pe(r),this.locations={position:r.getAttribLocation(this.program,"aPosition"),normal:r.getAttribLocation(this.program,"aNormal"),color:r.getAttribLocation(this.program,"aColor"),roughness:r.getAttribLocation(this.program,"aRoughness"),matrix:r.getUniformLocation(this.program,"uViewProjection"),camera:r.getUniformLocation(this.program,"uCamera"),tint:r.getUniformLocation(this.program,"uTint")},this.staticVertexBuffer=r.createBuffer(),this.staticIndexBuffer=r.createBuffer(),r.bindBuffer(r.ARRAY_BUFFER,this.staticVertexBuffer),r.bufferData(r.ARRAY_BUFFER,o.vertices,r.STATIC_DRAW),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,this.staticIndexBuffer),r.bufferData(r.ELEMENT_ARRAY_BUFFER,o.indices,r.STATIC_DRAW),this.staticIndexCount=o.indexCount,this.detailsVertexBuffer=r.createBuffer(),this.detailsIndexBuffer=r.createBuffer(),this.setDressDetails(s),this.clothVertexBuffer=r.createBuffer(),this.clothIndexBuffer=r.createBuffer(),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,this.clothIndexBuffer),r.bufferData(r.ELEMENT_ARRAY_BUFFER,n.indices,r.STATIC_DRAW),this.wireIndices=X(n.cols,n.rows),this.clothWireIndexBuffer=r.createBuffer(),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,this.clothWireIndexBuffer),r.bufferData(r.ELEMENT_ARRAY_BUFFER,this.wireIndices,r.STATIC_DRAW),this.clothWireIndexCount=this.wireIndices.length,this.resize(),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.disable(r.CULL_FACE),r.enable(r.BLEND),r.blendFunc(r.ONE,r.ONE_MINUS_SRC_ALPHA)}setDressDetails(t){this.detailsGeometry=t;const r=this.gl;r.bindBuffer(r.ARRAY_BUFFER,this.detailsVertexBuffer),r.bufferData(r.ARRAY_BUFFER,t.vertices,r.STATIC_DRAW),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,this.detailsIndexBuffer),r.bufferData(r.ELEMENT_ARRAY_BUFFER,t.indices,r.STATIC_DRAW),this.detailsIndexCount=t.indexCount}resize(){const t=this.canvas.getBoundingClientRect(),r=Math.min(window.devicePixelRatio||1,1.8),o=Math.max(1,Math.round(t.width*r)),n=Math.max(1,Math.round(t.height*r));(this.canvas.width!==o||this.canvas.height!==n)&&(this.canvas.width=o,this.canvas.height=n),this.gl.viewport(0,0,o,n),this.width=o,this.height=n}bindGeometry(t,r){const o=this.gl,n=this.locations;o.bindBuffer(o.ARRAY_BUFFER,t),o.bindBuffer(o.ELEMENT_ARRAY_BUFFER,r),o.enableVertexAttribArray(n.position),o.enableVertexAttribArray(n.normal),o.enableVertexAttribArray(n.color),o.enableVertexAttribArray(n.roughness),o.vertexAttribPointer(n.position,3,o.FLOAT,!1,44,0),o.vertexAttribPointer(n.normal,3,o.FLOAT,!1,44,12),o.vertexAttribPointer(n.color,4,o.FLOAT,!1,44,24),o.vertexAttribPointer(n.roughness,1,o.FLOAT,!1,44,40)}render({simulation:t,dt:r,time:o,camera:n,color:s,roughness:e,settings:a,wireframe:h=!1,showModel:u=!0}){this.resize();const c=this.gl;c.clearColor(0,0,0,0),c.clear(c.COLOR_BUFFER_BIT|c.DEPTH_BUFFER_BIT),c.useProgram(this.program);const d=this.width/Math.max(1,this.height),{matrix:w,eye:m}=oe(n,d,!1);if(c.uniformMatrix4fv(this.locations.matrix,!1,w),c.uniform3fv(this.locations.camera,m),u&&(c.uniform3f(this.locations.tint,1,1,1),this.bindGeometry(this.staticVertexBuffer,this.staticIndexBuffer),c.drawElements(c.TRIANGLES,this.staticIndexCount,c.UNSIGNED_SHORT,0)),this.detailsIndexCount&&(c.uniform3f(this.locations.tint,1,1,1),this.bindGeometry(this.detailsVertexBuffer,this.detailsIndexBuffer),c.drawElements(c.TRIANGLES,this.detailsIndexCount,c.UNSIGNED_SHORT,0)),t){const v=le(t.positions,t.cols,t.rows,e);c.bindBuffer(c.ARRAY_BUFFER,this.clothVertexBuffer),c.bufferData(c.ARRAY_BUFFER,v,c.DYNAMIC_DRAW),c.uniform3fv(this.locations.tint,s),h?(this.bindGeometry(this.clothVertexBuffer,this.clothWireIndexBuffer),c.drawElements(c.LINES,this.clothWireIndexCount,c.UNSIGNED_SHORT,0)):(this.bindGeometry(this.clothVertexBuffer,this.clothIndexBuffer),c.drawElements(c.TRIANGLES,this.clothGeometry.indices.length,c.UNSIGNED_SHORT,0))}}dispose(){const t=this.gl;t.deleteBuffer(this.staticVertexBuffer),t.deleteBuffer(this.staticIndexBuffer),t.deleteBuffer(this.detailsVertexBuffer),t.deleteBuffer(this.detailsIndexBuffer),t.deleteBuffer(this.clothVertexBuffer),t.deleteBuffer(this.clothIndexBuffer),t.deleteBuffer(this.clothWireIndexBuffer),t.deleteProgram(this.program)}}const p=i=>document.querySelector(i),T=i=>[...document.querySelectorAll(i)],Re='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.4 4.5h2.8v11H6.4zm4.5 0h2.8v11h-2.8z" fill="currentColor"/></svg>',Ce='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 4.8 8.2 5.2L7 15.2V4.8Z" fill="currentColor"/></svg>';function Se(i){const t=document.createElement("canvas");return t.id=i.id,t.className=i.className,t.setAttribute("aria-label",i.getAttribute("aria-label")||"3D garment viewport"),t.dataset.renderer="webgl",i.replaceWith(t),t}function S(i){const t=p("#toast");t.textContent=i,t.classList.add("show"),clearTimeout(S.timeout),S.timeout=setTimeout(()=>t.classList.remove("show"),2300)}function k(i){const t=Number(i.min||0),r=Number(i.max||100),n=(Number(i.value||0)-t)/(r-t)*100;i.style.setProperty("--range-progress",`${n}%`)}function Te(i){const t=Math.floor(i*24),r=Math.floor(t/24),o=t%24;return`00:${String(r).padStart(2,"0")}${o?`:${String(o).padStart(2,"0")}`:""}`}function ze(i){const t={application:"stitch / garment lab",version:1,project:"Violet hour",exportedAt:new Date().toISOString(),renderer:i.rendererType==="webgpu"?"WebGPU compute + render":"WebGL render + CPU cloth fallback",garment:{silhouette:i.preset.id,name:i.preset.title,fabric:i.preset.fabric,color:i.color,roughness:i.preset.roughness,particles:`${G} × ${U}`},simulation:{running:i.running,windMetersPerSecond:i.wind,weightKgPerSquareMeter:i.weight,biasStretch:i.stretch,timeSeconds:Number(i.time.toFixed(2))}},r=new Blob([JSON.stringify(t,null,2)],{type:"application/json"}),o=URL.createObjectURL(r),n=document.createElement("a");n.href=o,n.download="violet-hour-look.json",n.click(),setTimeout(()=>URL.revokeObjectURL(o),1e3)}function I(i){const t=i.running?"LIVE DRAPE":"SIM PAUSED";p("#hud-state").textContent=t,p("#hud-wind").textContent=`WIND ${i.wind.toFixed(2)} M/S`,p("#hud-particles").textContent=`${(G*U).toLocaleString()} PTS`,p(".sim-hud").classList.toggle("paused",!i.running);const r=p("#play-pause");r.innerHTML=i.running?Re:Ce,r.classList.toggle("is-playing",i.running),r.setAttribute("aria-label",i.running?"Pause simulation":"Play simulation"),r.title=i.running?"Pause simulation":"Play simulation",p("#timeline-time").innerHTML=`${Te(i.time)} <small> / 00:08</small>`,p("#timeline-range").value=String(i.time),p("#timeline-progress").style.width=`${Math.max(0,Math.min(100,i.time/8*100))}%`,p("#frame-counter").textContent=`FRAME ${String(Math.floor(i.time*24)).padStart(3,"0")}`}function W(i){p("#graph-garment-name").textContent=i.preset.graphName,p("#viewport-look-title").textContent=`VIOLET HOUR / ${i.preset.title.toUpperCase()}`,p("#fabric-name").textContent=i.preset.fabric,p("#fabric-weight-label").textContent=i.preset.fabricMeta,p("#fabric-preview").style.background=`radial-gradient(ellipse at 28% 20%, rgba(255,255,255,.6), transparent 37%), linear-gradient(135deg, ${i.color}, #35212b)`,p(".node-swatch").style.background=`radial-gradient(ellipse at 28% 22%, rgba(255,255,255,.58), transparent 35%), linear-gradient(135deg, ${i.color}, #571c32)`;const t=T(".color-swatch").find(r=>r.dataset.color.toLowerCase()===i.color.toLowerCase());T(".color-swatch").forEach(r=>r.classList.toggle("selected",r===t)),p("#weight-range").value=String(i.weight),p("#weight-value").innerHTML=`${i.weight.toFixed(2)} <small>kg/m²</small>`,p("#stretch-range").value=String(Math.round(i.stretch*100)),p("#stretch-value").innerHTML=`${Math.round(i.stretch*100)} <small>%</small>`,k(p("#weight-range")),k(p("#stretch-range"))}async function Ie(i){let t=i;const r=ce();let o={};try{o=JSON.parse(localStorage.getItem("stitch-violet-hour")||"{}")}catch{}const n=V[o.preset]||V.slip,s=typeof o.color=="string"&&/^#[0-9a-f]{6}$/i.test(o.color)?o.color.toLowerCase():n.color,e={renderer:null,simulation:null,rendererType:"pending",preset:{...n,color:s},color:s,weight:Math.max(.25,Math.min(1.35,Number(o.weight??p("#weight-range").value)||.72)),stretch:Math.max(.2,Math.min(1,Number(o.stretch??Number(p("#stretch-range").value)/100)||.68)),wind:Math.max(0,Math.min(2,Number(o.wind??p("#wind-range").value)||0)),running:!0,time:0,speed:1,autoRotate:!1,wireframe:!1,showModel:!0,rotation:{yaw:.24,pitch:.025,distance:6.7,target:[0,1.55,0]},pointer:null};let a=Q(e.preset,G,U),h=O(e.preset,e.color);p("#weight-range").value=String(e.weight),p("#weight-value").innerHTML=`${e.weight.toFixed(2)} <small>kg/m²</small>`,p("#stretch-value").innerHTML=`${Math.round(e.stretch*100)} <small>%</small>`,p("#wind-value").innerHTML=`${e.wind.toFixed(2)} <small>m/s</small>`,T("#weight-range, #stretch-range, #wind-range").forEach(k);const u=p("#engine-status"),c=u.querySelector(".engine-label");c.textContent="CONNECTING WEBGPU";let d=await Me(t,r,a,h);if(d)try{e.simulation=new pe(d.device,a),d.setSimulation(e.simulation),e.rendererType="webgpu"}catch(l){console.error("WebGPU cloth pipeline failed, falling back to WebGL.",l),d.dispose(),d=null}d?(u.classList.remove("fallback"),c.textContent="WEBGPU · CLOTH COMPUTE",p("#solver-node-detail").textContent=`${G} × ${U} PARTICLES`):(t=Se(t),d=Ae(t,r,a,h),e.simulation=new fe(a),e.rendererType="webgl",u.classList.add("fallback"),c.textContent="WEBGL · CPU FALLBACK",p("#solver-node-detail").textContent=`${G} × ${U} PARTICLES`),e.renderer=d,t.dataset.renderer=e.rendererType,u.title=e.rendererType==="webgpu"?"WebGPU compute cloth simulation and WebGPU rendering":"WebGL rendering with the real-time CPU cloth fallback";const w=(l,y=!1)=>{const M=V[l]||V.slip;e.preset={...M,color:y?e.color:M.color},y||(e.color=M.color),a=Q(e.preset,G,U),h=O(e.preset,e.color),e.simulation.reset(a),d.clothGeometry=a,d.setDressDetails(h),W(e),p("#weight-range").value=String(e.weight),T(".look-card").forEach(E=>{const z=E.dataset.look===l;E.classList.toggle("active",z),E.setAttribute("aria-pressed",String(z))}),e.time=0,I(e)},m=l=>{e.color=l.toLowerCase(),e.preset={...e.preset,color:e.color},h=O(e.preset,e.color),d.setDressDetails(h),W(e)},v=(l=!1)=>{e.simulation.reset(a),e.time=0,e.running||(e.running=!0),I(e),l&&S("Drape reset — the garment is settling again.")};T(".look-card").forEach(l=>{const y=l.dataset.look===e.preset.id;l.classList.toggle("active",y),l.setAttribute("aria-pressed",String(y))}),W(e),I(e),T(".editor-tab").forEach(l=>{l.addEventListener("click",()=>{T(".editor-tab").forEach(M=>M.classList.toggle("active",M===l));const y=document.getElementById(l.dataset.scroll);y&&y.scrollIntoView({behavior:"smooth",block:"start"})})}),T(".graph-node").forEach(l=>{l.addEventListener("click",()=>{var M;T(".graph-node").forEach(E=>E.classList.toggle("selected",E===l));const y={fabric:"material-section",pattern:"look-section",garment:"look-section",solver:"material-section"};(M=document.getElementById(y[l.dataset.node]))==null||M.scrollIntoView({behavior:"smooth",block:"nearest"}),l.dataset.node==="solver"&&S(e.rendererType==="webgpu"?"WebGPU is solving 4,096 particles every frame.":"CPU solver is active in this browser preview.")})}),p("#add-node").addEventListener("click",()=>S("All four construction nodes are connected and live.")),p("#browse-silhouettes").addEventListener("click",()=>{p("#look-section").scrollIntoView({behavior:"smooth",block:"nearest"})}),T(".look-card").forEach(l=>l.addEventListener("click",()=>{w(l.dataset.look),S(`${e.preset.title} loaded on the mannequin.`)}));const f=[{name:"Mulberry silk",meta:"19 momme · satin weave",roughness:.16},{name:"Cloud organza",meta:"12 momme · crisp sheer",roughness:.36},{name:"Soft velvet",meta:"32 momme · fluid pile",roughness:.31}];let B=0;(()=>{const l=f.findIndex(y=>y.name.toLowerCase()===e.preset.fabric.toLowerCase());B=l>=0?l:0})(),p("#fabric-choice").addEventListener("click",()=>{B=(B+1)%f.length;const l=f[B];e.preset={...e.preset,fabric:l.name,fabricMeta:l.meta,roughness:l.roughness},h=O(e.preset,e.color),d.setDressDetails(h),W(e),S(`${l.name} · ${l.meta}`)}),T(".color-swatch").forEach(l=>l.addEventListener("click",()=>m(l.dataset.color))),p("#custom-color").addEventListener("click",()=>p("#custom-color-input").click()),p("#custom-color-input").addEventListener("input",l=>m(l.target.value)),p("#weight-range").addEventListener("input",l=>{e.weight=Number(l.target.value),p("#weight-value").innerHTML=`${e.weight.toFixed(2)} <small>kg/m²</small>`,k(l.target)}),p("#stretch-range").addEventListener("input",l=>{e.stretch=Number(l.target.value)/100,p("#stretch-value").innerHTML=`${Math.round(e.stretch*100)} <small>%</small>`,k(l.target)}),p("#wind-range").addEventListener("input",l=>{e.wind=Number(l.target.value),p("#wind-value").innerHTML=`${e.wind.toFixed(2)} <small>m/s</small>`,p("#hud-wind").textContent=`WIND ${e.wind.toFixed(2)} M/S`,k(l.target)}),p("#play-pause").addEventListener("click",()=>{e.running=!e.running,I(e)}),p("#reset-sim").addEventListener("click",()=>v(!0)),p("#timeline-range").addEventListener("input",l=>{e.time=Number(l.target.value),e.simulation.reset(a),I(e)}),p("#speed-select").addEventListener("change",l=>{e.speed=Number(l.target.value),S(`Simulation speed set to ${e.speed}×.`)}),p("#save-project").addEventListener("click",()=>{const l={preset:e.preset.id,color:e.color,weight:e.weight,stretch:e.stretch,wind:e.wind,speed:e.speed};try{localStorage.setItem("stitch-violet-hour",JSON.stringify(l))}catch{}p(".saved-state").innerHTML="<i></i> Saved just now",S("Project saved in this browser.")}),p("#export-project").addEventListener("click",()=>ze(e)),p("#rotate-view").addEventListener("click",()=>{e.autoRotate=!e.autoRotate,p("#rotate-view").classList.toggle("is-active",e.autoRotate),S(e.autoRotate?"Auto-rotate enabled.":"Auto-rotate paused.")}),p("#reset-view").addEventListener("click",()=>{e.rotation.yaw=.24,e.rotation.pitch=.025,e.rotation.distance=6.7,e.rotation.target=[0,1.55,0]}),p("#toggle-wireframe").addEventListener("click",()=>{e.wireframe=!e.wireframe,p("#toggle-wireframe").classList.toggle("is-active",e.wireframe),S(e.wireframe?"Fabric particle mesh shown.":"Fabric surface view restored.")}),p("#toggle-model").addEventListener("click",()=>{e.showModel=!e.showModel,p("#toggle-model").classList.toggle("is-active",!e.showModel),S(e.showModel?"Mannequin visible.":"Mannequin hidden.")}),p("#fullscreen-view").addEventListener("click",async()=>{const l=p(".viewport-shell");try{document.fullscreenElement?await document.exitFullscreen():await l.requestFullscreen()}catch{S("Fullscreen is not available in this browser.")}}),t.addEventListener("pointerdown",l=>{var y;l.button===0&&(e.pointer={x:l.clientX,y:l.clientY,moved:!1},(y=t.setPointerCapture)==null||y.call(t,l.pointerId),t.classList.add("dragging"))}),t.addEventListener("pointermove",l=>{var E;if(!e.pointer)return;const y=l.clientX-e.pointer.x,M=l.clientY-e.pointer.y;(E=e.pointer).moved||(E.moved=Math.abs(y)+Math.abs(M)>2),e.rotation.yaw+=y*.006,e.rotation.pitch=Math.max(-.16,Math.min(.62,e.rotation.pitch-M*.0045)),e.pointer.x=l.clientX,e.pointer.y=l.clientY});const P=()=>{e.pointer=null,t.classList.remove("dragging")};t.addEventListener("pointerup",P),t.addEventListener("pointercancel",P),t.addEventListener("wheel",l=>{l.preventDefault(),e.rotation.distance=Math.max(4.15,Math.min(10.5,e.rotation.distance+l.deltaY*.004))},{passive:!1}),t.addEventListener("dblclick",()=>{e.rotation.yaw=.24,e.rotation.pitch=.025,e.rotation.distance=6.7}),window.addEventListener("keydown",l=>{var y,M;l.code==="Space"&&!["INPUT","SELECT","TEXTAREA","BUTTON"].includes((y=document.activeElement)==null?void 0:y.tagName)&&(l.preventDefault(),e.running=!e.running,I(e)),l.key.toLowerCase()==="r"&&!["INPUT","SELECT","TEXTAREA"].includes((M=document.activeElement)==null?void 0:M.tagName)&&v(!0)}),new ResizeObserver(()=>{var l;return(l=d.resize)==null?void 0:l.call(d)}).observe(p(".stage"));let x=performance.now(),g=0,L=0,b=x;const R=l=>{const y=Math.min((l-x)/1e3,.05);x=l;const M=e.running?y*e.speed:0;e.running&&(e.time+=M,e.time>=8&&(e.time%=8,e.simulation.reset(a))),e.autoRotate&&(e.rotation.yaw+=y*.13);const E={running:e.running,wind:e.wind,gravity:e.weight,stretch:e.stretch};if(e.rendererType==="webgpu"?d.render({simulation:e.simulation,dt:M,time:e.time,camera:e.rotation,color:q(e.color),roughness:e.preset.roughness,settings:E,wireframe:e.wireframe,showModel:e.showModel}):(e.running&&e.simulation.step(M,e.time,E),d.render({simulation:e.simulation,dt:M,time:e.time,camera:e.rotation,color:q(e.color),roughness:e.preset.roughness,settings:E,wireframe:e.wireframe,showModel:e.showModel})),L++,g+=y,g>.6){const z=Math.round(L/g);p("#fps-label").textContent=`${z} FPS`,L=0,g=0}l-b>80&&(I(e),b=l),requestAnimationFrame(R)};requestAnimationFrame(R)}export{Ie as boot};
