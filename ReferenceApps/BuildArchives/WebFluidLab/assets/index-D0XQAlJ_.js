(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=typeof Float32Array<`u`?Float32Array:Array;function t(){var t=new e(16);return e!=Float32Array&&(t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0),t[0]=1,t[5]=1,t[10]=1,t[15]=1,t}function n(e){return e[0]=1,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=1,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=1,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,e}function r(e,t){var n=t[0],r=t[1],i=t[2],a=t[3],o=t[4],s=t[5],c=t[6],l=t[7],u=t[8],d=t[9],f=t[10],p=t[11],m=t[12],h=t[13],g=t[14],_=t[15],v=n*s-r*o,y=n*c-i*o,b=n*l-a*o,x=r*c-i*s,S=r*l-a*s,C=i*l-a*c,w=u*h-d*m,T=u*g-f*m,E=u*_-p*m,D=d*g-f*h,O=d*_-p*h,k=f*_-p*g,A=v*k-y*O+b*D+x*E-S*T+C*w;return A?(A=1/A,e[0]=(s*k-c*O+l*D)*A,e[1]=(i*O-r*k-a*D)*A,e[2]=(h*C-g*S+_*x)*A,e[3]=(f*S-d*C-p*x)*A,e[4]=(c*E-o*k-l*T)*A,e[5]=(n*k-i*E+a*T)*A,e[6]=(g*b-m*C-_*y)*A,e[7]=(u*C-f*b+p*y)*A,e[8]=(o*O-s*E+l*w)*A,e[9]=(r*E-n*O-a*w)*A,e[10]=(m*S-h*b+_*v)*A,e[11]=(d*b-u*S-p*v)*A,e[12]=(s*T-o*D-c*w)*A,e[13]=(n*D-r*T+i*w)*A,e[14]=(h*y-m*x-g*v)*A,e[15]=(u*x-d*y+f*v)*A,e):null}function i(e,t,n){var r=t[0],i=t[1],a=t[2],o=t[3],s=t[4],c=t[5],l=t[6],u=t[7],d=t[8],f=t[9],p=t[10],m=t[11],h=t[12],g=t[13],_=t[14],v=t[15],y=n[0],b=n[1],x=n[2],S=n[3];return e[0]=y*r+b*s+x*d+S*h,e[1]=y*i+b*c+x*f+S*g,e[2]=y*a+b*l+x*p+S*_,e[3]=y*o+b*u+x*m+S*v,y=n[4],b=n[5],x=n[6],S=n[7],e[4]=y*r+b*s+x*d+S*h,e[5]=y*i+b*c+x*f+S*g,e[6]=y*a+b*l+x*p+S*_,e[7]=y*o+b*u+x*m+S*v,y=n[8],b=n[9],x=n[10],S=n[11],e[8]=y*r+b*s+x*d+S*h,e[9]=y*i+b*c+x*f+S*g,e[10]=y*a+b*l+x*p+S*_,e[11]=y*o+b*u+x*m+S*v,y=n[12],b=n[13],x=n[14],S=n[15],e[12]=y*r+b*s+x*d+S*h,e[13]=y*i+b*c+x*f+S*g,e[14]=y*a+b*l+x*p+S*_,e[15]=y*o+b*u+x*m+S*v,e}function a(e,t){return e[0]=1,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=1,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=1,e[11]=0,e[12]=t[0],e[13]=t[1],e[14]=t[2],e[15]=1,e}function o(e,t,n){var r=t[0],i=t[1],a=t[2],o=t[3],s=r+r,c=i+i,l=a+a,u=r*s,d=r*c,f=r*l,p=i*c,m=i*l,h=a*l,g=o*s,_=o*c,v=o*l;return e[0]=1-(p+h),e[1]=d+v,e[2]=f-_,e[3]=0,e[4]=d-v,e[5]=1-(u+h),e[6]=m+g,e[7]=0,e[8]=f+_,e[9]=m-g,e[10]=1-(u+p),e[11]=0,e[12]=n[0],e[13]=n[1],e[14]=n[2],e[15]=1,e}function s(e,t,n,r,i){var a=1/Math.tan(t/2);if(e[0]=a/n,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=a,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[11]=-1,e[12]=0,e[13]=0,e[15]=0,i!=null&&i!==1/0){var o=1/(r-i);e[10]=(i+r)*o,e[14]=2*i*r*o}else e[10]=-1,e[14]=-2*r;return e}function c(e,t,n,r,i){var a=1/Math.tan(t/2);if(e[0]=a/n,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=a,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[11]=-1,e[12]=0,e[13]=0,e[15]=0,i!=null&&i!==1/0){var o=1/(r-i);e[10]=i*o,e[14]=i*r*o}else e[10]=-1,e[14]=-r;return e}function l(e,t,r,i){var a,o,s,c,l,u,d,f,p,m,h=t[0],g=t[1],_=t[2],v=i[0],y=i[1],b=i[2],x=r[0],S=r[1],C=r[2];return Math.abs(h-x)<1e-6&&Math.abs(g-S)<1e-6&&Math.abs(_-C)<1e-6?n(e):(d=h-x,f=g-S,p=_-C,m=1/Math.sqrt(d*d+f*f+p*p),d*=m,f*=m,p*=m,a=y*p-b*f,o=b*d-v*p,s=v*f-y*d,m=Math.sqrt(a*a+o*o+s*s),m?(m=1/m,a*=m,o*=m,s*=m):(a=0,o=0,s=0),c=f*s-p*o,l=p*a-d*s,u=d*o-f*a,m=Math.sqrt(c*c+l*l+u*u),m?(m=1/m,c*=m,l*=m,u*=m):(c=0,l=0,u=0),e[0]=a,e[1]=c,e[2]=d,e[3]=0,e[4]=o,e[5]=l,e[6]=f,e[7]=0,e[8]=s,e[9]=u,e[10]=p,e[11]=0,e[12]=-(a*h+o*g+s*_),e[13]=-(c*h+l*g+u*_),e[14]=-(d*h+f*g+p*_),e[15]=1,e)}function u(){var t=new e(3);return e!=Float32Array&&(t[0]=0,t[1]=0,t[2]=0),t}function d(t,n,r){var i=new e(3);return i[0]=t,i[1]=n,i[2]=r,i}function f(e,t,n){return e[0]=t[0]-n[0],e[1]=t[1]-n[1],e[2]=t[2]-n[2],e}function p(e,t){var n=t[0],r=t[1],i=t[2],a=n*n+r*r+i*i;return a>0&&(a=1/Math.sqrt(a)),e[0]=t[0]*a,e[1]=t[1]*a,e[2]=t[2]*a,e}function m(e,t,n){var r=t[0],i=t[1],a=t[2],o=n[0],s=n[1],c=n[2];return e[0]=i*c-a*s,e[1]=a*o-r*c,e[2]=r*s-i*o,e}(function(){var e=u();return function(t,n,r,i,a,o){var s,c;for(n||=3,r||=0,c=i?Math.min(i*n+r,t.length):t.length,s=r;s<c;s+=n)e[0]=t[s],e[1]=t[s+1],e[2]=t[s+2],a(e,e,o),t[s]=e[0],t[s+1]=e[1],t[s+2]=e[2];return t}})();var h=class{yaw=.78;pitch=.42;distance=6.2;target=d(0,1,0);minDistance=2.5;maxDistance=16;dragging=!1;lastX=0;lastY=0;constructor(e){e.addEventListener(`pointerdown`,t=>{this.dragging=!0,this.lastX=t.clientX,this.lastY=t.clientY,e.setPointerCapture(t.pointerId)}),e.addEventListener(`pointerup`,t=>{this.dragging=!1,e.releasePointerCapture(t.pointerId)}),e.addEventListener(`pointercancel`,()=>{this.dragging=!1}),e.addEventListener(`pointermove`,e=>{if(!this.dragging)return;let t=e.clientX-this.lastX,n=e.clientY-this.lastY;this.lastX=e.clientX,this.lastY=e.clientY,this.yaw-=t*.0065,this.pitch=Math.min(1.45,Math.max(-.2,this.pitch-n*.0065))}),e.addEventListener(`wheel`,e=>{e.preventDefault(),this.distance=Math.min(this.maxDistance,Math.max(this.minDistance,this.distance+e.deltaY*.0045))},{passive:!1})}get eye(){let e=Math.cos(this.pitch);return d(this.target[0]+this.distance*e*Math.sin(this.yaw),this.target[1]+this.distance*Math.sin(this.pitch),this.target[2]+this.distance*e*Math.cos(this.yaw))}viewMatrix(){let e=t();return l(e,this.eye,this.target,[0,1,0]),e}projMatrixZeroToOne(e){let n=t();return c(n,Math.PI/4.1,e,.05,60),n}projMatrixNegOneToOne(e){let n=t();return s(n,Math.PI/4.1,e,.05,60),n}},g=-9.8,_=.16,v=[-2.1,0,-1.5],y=[2.1,3.4,1.5],b={potato:{tier:`potato`,renderScale:.45,maxParticles:4e3,pressureIterations:2,blurPasses:1,shadow:!1},low:{tier:`low`,renderScale:.6,maxParticles:9e3,pressureIterations:3,blurPasses:2,shadow:!1},medium:{tier:`medium`,renderScale:.78,maxParticles:22e3,pressureIterations:4,blurPasses:3,shadow:!0},high:{tier:`high`,renderScale:.92,maxParticles:55e3,pressureIterations:4,blurPasses:4,shadow:!0},ultra:{tier:`ultra`,renderScale:1,maxParticles:12e4,pressureIterations:5,blurPasses:5,shadow:!0}},x=[`potato`,`low`,`medium`,`high`,`ultra`],S={potato:{tier:`potato`,renderScale:.55,maxParticles:500,pressureIterations:1,blurPasses:1,shadow:!1},low:{tier:`low`,renderScale:.7,maxParticles:900,pressureIterations:1,blurPasses:2,shadow:!1},medium:{tier:`medium`,renderScale:.85,maxParticles:1500,pressureIterations:1,blurPasses:2,shadow:!1},high:{tier:`high`,renderScale:1,maxParticles:2200,pressureIterations:1,blurPasses:3,shadow:!1},ultra:{tier:`ultra`,renderScale:1,maxParticles:3e3,pressureIterations:1,blurPasses:3,shadow:!1}},C=class{table;mode=`auto`;tierIndex=3;emaMs=16.6;targetMs=16.6;cooldown=0;continuousScale=1;constructor(e){this.table=e}setMode(e){this.mode=e,e!==`auto`&&(this.tierIndex=x.indexOf(e),this.continuousScale=1)}getMode(){return this.mode}update(e){if(this.emaMs=this.emaMs*.92+e*.08,this.mode!==`auto`){this.continuousScale=1;return}this.cooldown>0?this.cooldown--:this.emaMs>this.targetMs*1.18&&this.tierIndex>0?(this.tierIndex--,this.cooldown=45):this.emaMs<this.targetMs*.78&&this.tierIndex<x.length-1&&(this.tierIndex++,this.cooldown=70);let t=this.targetMs/Math.max(this.emaMs,.001),n=Math.min(1.08,Math.max(.55,t));this.continuousScale+=(n-this.continuousScale)*.05}get tier(){return x[this.tierIndex]}get settings(){let e=this.table[this.tier],t=Math.min(1,Math.max(.4,this.continuousScale));return{...e,renderScale:Math.min(1,e.renderScale*t)}}get smoothedFrameMs(){return this.emaMs}get fps(){return 1e3/Math.max(this.emaMs,.001)}},w={water:{id:`water`,label:`Water`,restDensity:1e3,stiffness:180,viscosity:.045,cohesion:.02,adhesion:.25,friction:.03,releaseThreshold:.02,color:[.1,.35,.55],absorption:.9,roughness:.06,refraction:.08,particleRadius:.055,damping:0},milk:{id:`milk`,label:`Milk`,restDensity:1030,stiffness:160,viscosity:.09,cohesion:.06,adhesion:.45,friction:.08,releaseThreshold:.05,color:[.93,.91,.85],absorption:3.2,roughness:.18,refraction:.02,particleRadius:.058,damping:.04},chocolate:{id:`chocolate`,label:`Chocolate`,restDensity:1250,stiffness:170,viscosity:.55,cohesion:.13,adhesion:.85,friction:.35,releaseThreshold:.14,color:[.27,.14,.07],absorption:6,roughness:.32,refraction:0,particleRadius:.062,damping:.22},mud:{id:`mud`,label:`Mud`,restDensity:1700,stiffness:150,viscosity:.85,cohesion:.2,adhesion:.95,friction:.55,releaseThreshold:.22,color:[.22,.16,.1],absorption:8,roughness:.65,refraction:0,particleRadius:.065,damping:.4}},T=[`water`,`milk`,`chocolate`,`mud`];function E(e){return T.indexOf(e)}function D(e){return Math.min(.97,Math.max(.12,1-Math.exp(-e.absorption*.4)))}var O=[`auto`,`potato`,`low`,`medium`,`high`,`ultra`],k=class{root;statsEl;pouring=!1;pourBtn;constructor(e,t){this.root=document.createElement(`div`),this.root.className=`hud`,e.appendChild(this.root);let n=document.createElement(`div`);n.className=`hud-title`,n.innerHTML=`<span>Realtime Fluid Lab</span><small>${t.onBackendHint()}</small>`,this.root.appendChild(n);let r=document.createElement(`div`);r.className=`hud-row`;let i=document.createElement(`div`);i.className=`hud-label`,i.textContent=`Material`,r.appendChild(i);let a=document.createElement(`div`);a.className=`hud-chip-group`,T.forEach((e,n)=>{let r=document.createElement(`button`);r.className=`hud-chip`,n===0&&r.classList.add(`active`),r.textContent=w[e].label;let[i,o,s]=w[e].color;r.style.setProperty(`--swatch`,`rgb(${i*255}, ${o*255}, ${s*255})`),r.addEventListener(`click`,()=>{a.querySelectorAll(`.hud-chip`).forEach(e=>e.classList.remove(`active`)),r.classList.add(`active`),t.onMaterialChange(e)}),a.appendChild(r)}),r.appendChild(a),this.root.appendChild(r);let o=document.createElement(`div`);o.className=`hud-row`,this.pourBtn=document.createElement(`button`),this.pourBtn.className=`hud-button primary`,this.pourBtn.textContent=`Start Pouring`,this.pourBtn.addEventListener(`click`,()=>{this.pouring=!this.pouring,this.pourBtn.textContent=this.pouring?`Stop Pouring`:`Start Pouring`,this.pourBtn.classList.toggle(`active`,this.pouring),t.onPourChange(this.pouring)}),o.appendChild(this.pourBtn);let s=document.createElement(`button`);s.className=`hud-button`,s.textContent=`Burst`,s.title=`Spawn a large splash to stress-test dynamic resolution`,s.addEventListener(`click`,()=>t.onBurst()),o.appendChild(s);let c=document.createElement(`button`);c.className=`hud-button`,c.textContent=`Reset`,c.addEventListener(`click`,()=>t.onReset()),o.appendChild(c),this.root.appendChild(o);let l=document.createElement(`div`);l.className=`hud-row`;let u=document.createElement(`div`);u.className=`hud-label`,u.textContent=`Resolution`,l.appendChild(u);let d=document.createElement(`select`);d.className=`hud-select`,O.forEach(e=>{let t=document.createElement(`option`);t.value=e,t.textContent=e===`auto`?`Auto (dynamic)`:e[0].toUpperCase()+e.slice(1),d.appendChild(t)}),d.addEventListener(`change`,()=>t.onQualityChange(d.value)),l.appendChild(d),this.root.appendChild(l),this.statsEl=document.createElement(`div`),this.statsEl.className=`hud-stats`,this.root.appendChild(this.statsEl);let f=document.createElement(`div`);f.className=`hud-hint`,f.textContent=`Drag to orbit · Scroll to zoom · Pour then watch it cling to the sphere, box and paddle.`,this.root.appendChild(f)}setStats(e,t,n,r,i){this.statsEl.textContent=`${e.toFixed(0)} fps · tier ${t} · res ${(n*100).toFixed(0)}% · particles ${r.toLocaleString()} / ${i.toLocaleString()}`}},A=[2.1,2.4,1.5];function j(){return[{kind:`sphere`,position:[-.7,.55,.3],size:[.55,.55,.55],rotationY:0,spinSpeed:0,color:[.75,.78,.82]},{kind:`box`,position:[.85,.4,-.35],size:[.4,.4,.4],rotationY:.4,spinSpeed:.3,color:[.65,.5,.35]},{kind:`paddle`,position:[.1,1.1,0],size:[.95,.09,.22],rotationY:0,spinSpeed:.8,color:[.82,.82,.86]}]}function M(e,t,n,r,i){switch(e.kind){case`sphere`:{let i=t-e.position[0],a=n-e.position[1],o=r-e.position[2],s=Math.hypot(i,a,o)||1e-6;return{dist:s-e.size[0],nx:i/s,ny:a/s,nz:o/s}}case`box`:{let a=e.rotationY+(e.spinSpeed===0?0:e.spinSpeed*i),o=Math.cos(-a),s=Math.sin(-a),c=t-e.position[0],l=r-e.position[2],u=c*o-l*s,d=c*s+l*o,f=n-e.position[1],p=Math.abs(u)-e.size[0],m=Math.abs(f)-e.size[1],h=Math.abs(d)-e.size[2],g=Math.hypot(Math.max(p,0),Math.max(m,0),Math.max(h,0))+Math.min(Math.max(p,Math.max(m,h)),0),_=p>m&&p>h?Math.sign(u):0,v=m>p&&m>h?Math.sign(f):0,y=h>p&&h>m?Math.sign(d):0;return _===0&&v===0&&y===0&&(_=Math.sign(u)||1),{dist:g,nx:_*o+y*s,ny:v,nz:-_*s+y*o}}case`paddle`:{let a=e.spinSpeed*i,o=Math.cos(-a),s=Math.sin(-a),c=t-e.position[0],l=r-e.position[2],u=c*o-l*s,d=c*s+l*o,f=n-e.position[1],p=Math.abs(u)-e.size[0],m=Math.abs(f)-e.size[1],h=Math.abs(d)-e.size[2],g=Math.hypot(Math.max(p,0),Math.max(m,0),Math.max(h,0))+Math.min(Math.max(p,Math.max(m,h)),0),_=m>=p&&m>=h?Math.sign(f)||1:0,v=!_&&p>h?Math.sign(u):0,y=!_&&h>=p?Math.sign(d):0;return{dist:g,nx:v*o+y*s,ny:_,nz:-v*s+y*o}}default:return{dist:n-0,nx:0,ny:1,nz:0}}}function N(e){let t=new Float32Array(e.length*12),n={plane:0,sphere:1,box:2,paddle:3};return e.forEach((e,r)=>{let i=r*12;t[i+0]=e.position[0],t[i+1]=e.position[1],t[i+2]=e.position[2],t[i+3]=n[e.kind]??0,t[i+4]=e.size[0],t[i+5]=e.size[1],t[i+6]=e.size[2],t[i+7]=e.rotationY,t[i+8]=e.spinSpeed,t[i+9]=e.color[0],t[i+10]=e.color[1],t[i+11]=e.color[2]}),t}var P=`// Shared structures, bindings and SPH kernel math used by every compute pass.
// Concatenated in front of each pass-specific WGSL source at pipeline-build
// time (see GpuSolver.ts) because WGSL has no #include directive.

struct Particle {
  position : vec4<f32>, // xyz = world position [m],         w = reserved
  velocity : vec4<f32>, // xyz = velocity [m/s],              w = density scratch
  props    : vec4<f32>, // x materialType, y spawnAge, z contactAmount, w pressure scratch
  accel    : vec4<f32>, // xyz = acceleration [m/s^2],        w = reserved
};

struct MaterialGpu {
  a : vec4<f32>, // restDensity, stiffness, viscosity, cohesion
  b : vec4<f32>, // adhesion, friction, releaseThreshold, particleRadius
  c : vec4<f32>, // colorR, colorG, colorB, damping
  d : vec4<f32>, // opacity, unused, unused, unused
};

struct ColliderGpu {
  posKind : vec4<f32>, // xyz position,     w kind (0 unused/plane,1 sphere,2 box,3 paddle)
  size    : vec4<f32>, // xyz half extents, w static rotationY
  spin    : vec4<f32>, // x spinSpeed,      yzw colour (unused by solver)
};

struct SimParams {
  p0        : vec4<f32>, // dt, smoothingRadius(h), cellSize, gravity
  domainMin : vec4<f32>,
  domainMax : vec4<f32>,
  gridDims  : vec4<f32>, // nx, ny, nz, maxPerCell
  counts    : vec4<f32>, // activeCount, numColliders, time, particleVolume
};

const PI : f32 = 3.14159265359;
const MAX_PER_CELL : u32 = 64u;

@group(0) @binding(0) var<uniform> params : SimParams;
@group(0) @binding(1) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(2) var<storage, read> materials : array<MaterialGpu>;
@group(0) @binding(3) var<storage, read> colliders : array<ColliderGpu>;
@group(0) @binding(4) var<storage, read_write> gridCount : array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> gridCells : array<u32>;

fn cellCoord(pos: vec3<f32>) -> vec3<i32> {
  let rel = (pos - params.domainMin.xyz) / params.p0.z;
  let nx = i32(params.gridDims.x);
  let ny = i32(params.gridDims.y);
  let nz = i32(params.gridDims.z);
  let cx = clamp(i32(floor(rel.x)), 0, nx - 1);
  let cy = clamp(i32(floor(rel.y)), 0, ny - 1);
  let cz = clamp(i32(floor(rel.z)), 0, nz - 1);
  return vec3<i32>(cx, cy, cz);
}

fn cellIndex(c: vec3<i32>) -> u32 {
  let nx = i32(params.gridDims.x);
  let ny = i32(params.gridDims.y);
  return u32(c.x + c.y * nx + c.z * nx * ny);
}

fn poly6(r2: f32, h: f32) -> f32 {
  if (r2 > h * h) { return 0.0; }
  let h2 = h * h;
  let diff = h2 - r2;
  let k = 315.0 / (64.0 * PI * pow(h, 9.0));
  return k * diff * diff * diff;
}

fn spikyGrad(rij: vec3<f32>, r: f32, h: f32) -> vec3<f32> {
  if (r <= 0.00001 || r > h) { return vec3<f32>(0.0, 0.0, 0.0); }
  let k = -45.0 / (PI * pow(h, 6.0));
  let diff = h - r;
  return (rij / r) * (k * diff * diff);
}

fn viscLap(r: f32, h: f32) -> f32 {
  if (r > h) { return 0.0; }
  let k = 45.0 / (PI * pow(h, 6.0));
  return k * (h - r);
}

fn cohesionKernel(r: f32, h: f32) -> f32 {
  if (r > h || r <= 0.0001) { return 0.0; }
  return (1.0 - r / h) * (h - r);
}

struct SdfHit {
  dist   : f32,
  normal : vec3<f32>,
};

fn sdfSphere(p: vec3<f32>, c: ColliderGpu) -> SdfHit {
  var hit : SdfHit;
  let d = p - c.posKind.xyz;
  let dist = length(d);
  hit.dist = dist - c.size.x;
  hit.normal = d / max(dist, 0.00001);
  return hit;
}

fn sdfBox(p: vec3<f32>, c: ColliderGpu, extraYaw: f32) -> SdfHit {
  var hit : SdfHit;
  let yaw = c.size.w + extraYaw;
  let cs = cos(-yaw);
  let sn = sin(-yaw);
  let lx0 = p.x - c.posKind.x;
  let lz0 = p.z - c.posKind.z;
  let lx = lx0 * cs - lz0 * sn;
  let lz = lx0 * sn + lz0 * cs;
  let ly = p.y - c.posKind.y;
  let q = vec3<f32>(abs(lx), abs(ly), abs(lz)) - c.size.xyz;
  let outside = length(max(q, vec3<f32>(0.0, 0.0, 0.0)));
  let inside = min(max(q.x, max(q.y, q.z)), 0.0);
  hit.dist = outside + inside;
  var gx = 0.0;
  var gy = 0.0;
  var gz = 0.0;
  if (q.x > q.y && q.x > q.z) {
    gx = sign(lx);
  } else if (q.y > q.x && q.y > q.z) {
    gy = sign(ly);
  } else {
    gz = sign(lz);
  }
  if (gx == 0.0 && gy == 0.0 && gz == 0.0) {
    gx = select(-1.0, 1.0, lx >= 0.0);
  }
  let wx = gx * cs + gz * sn;
  let wz = -gx * sn + gz * cs;
  hit.normal = vec3<f32>(wx, gy, wz);
  return hit;
}

fn evalCollider(p: vec3<f32>, c: ColliderGpu) -> SdfHit {
  let kind = c.posKind.w;
  if (kind < 1.5) {
    return sdfSphere(p, c);
  }
  return sdfBox(p, c, c.spin.x * params.counts.z);
}
`,F=`// Pass 1/4 — scatter every active particle into a fixed-capacity uniform
// grid using an atomic bucket counter (no sort / prefix-sum required).

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(params.counts.x)) {
    return;
  }
  let pos = particles[i].position.xyz;
  let cc = cellCoord(pos);
  let cell = cellIndex(cc);
  let slot = atomicAdd(&gridCount[cell], 1u);
  if (slot < MAX_PER_CELL) {
    gridCells[cell * MAX_PER_CELL + slot] = i;
  }
}
`,ee=`// Pass 2/4 — SPH density estimation (Poly6 kernel) over the 27 neighbouring
// grid cells. Writes density into particle.velocity.w as a scratch slot.

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(params.counts.x)) {
    return;
  }
  let p = particles[i];
  let h = params.p0.y;
  let cc = cellCoord(p.position.xyz);
  let nx = i32(params.gridDims.x);
  let ny = i32(params.gridDims.y);
  let nz = i32(params.gridDims.z);
  var density = 0.0;

  for (var dz = -1; dz <= 1; dz = dz + 1) {
    for (var dy = -1; dy <= 1; dy = dy + 1) {
      for (var dx = -1; dx <= 1; dx = dx + 1) {
        let cx = cc.x + dx;
        let cy = cc.y + dy;
        let cz = cc.z + dz;
        if (cx < 0 || cy < 0 || cz < 0 || cx >= nx || cy >= ny || cz >= nz) {
          continue;
        }
        let cell = cellIndex(vec3<i32>(cx, cy, cz));
        let cnt = min(atomicLoad(&gridCount[cell]), MAX_PER_CELL);
        for (var k = 0u; k < cnt; k = k + 1u) {
          let j = gridCells[cell * MAX_PER_CELL + k];
          let pj = particles[j];
          let rij = p.position.xyz - pj.position.xyz;
          let r2 = dot(rij, rij);
          if (r2 < h * h) {
            let mj = materials[u32(pj.props.x)];
            let massJ = mj.a.x * params.counts.w;
            density = density + massJ * poly6(r2, h);
          }
        }
      }
    }
  }

  particles[i].velocity.w = max(density, 1.0);
}
`,te=`// Pass 3/4 — pressure (Tait equation of state), viscosity and short-range
// cohesion forces, plus gravity. Writes total acceleration into particle.accel.

const TAIT_GAMMA : f32 = 7.0;

fn taitPressure(density: f32, restDensity: f32, stiffness: f32) -> f32 {
  let ratio = density / restDensity;
  let p = stiffness * (pow(ratio, TAIT_GAMMA) - 1.0);
  return max(p, 0.0);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(params.counts.x)) {
    return;
  }
  let p = particles[i];
  let mat = materials[u32(p.props.x)];
  let h = params.p0.y;
  let densI = max(p.velocity.w, 1.0);
  let pressI = taitPressure(densI, mat.a.x, mat.a.y);

  let cc = cellCoord(p.position.xyz);
  let nx = i32(params.gridDims.x);
  let ny = i32(params.gridDims.y);
  let nz = i32(params.gridDims.z);

  var pforce = vec3<f32>(0.0, 0.0, 0.0);
  var vforce = vec3<f32>(0.0, 0.0, 0.0);
  var cforce = vec3<f32>(0.0, 0.0, 0.0);

  for (var dz = -1; dz <= 1; dz = dz + 1) {
    for (var dy = -1; dy <= 1; dy = dy + 1) {
      for (var dx = -1; dx <= 1; dx = dx + 1) {
        let cx = cc.x + dx;
        let cy = cc.y + dy;
        let cz = cc.z + dz;
        if (cx < 0 || cy < 0 || cz < 0 || cx >= nx || cy >= ny || cz >= nz) {
          continue;
        }
        let cell = cellIndex(vec3<i32>(cx, cy, cz));
        let cnt = min(atomicLoad(&gridCount[cell]), MAX_PER_CELL);
        for (var k = 0u; k < cnt; k = k + 1u) {
          let j = gridCells[cell * MAX_PER_CELL + k];
          if (j == i) {
            continue;
          }
          let pj = particles[j];
          let rij = p.position.xyz - pj.position.xyz;
          let r2 = dot(rij, rij);
          if (r2 >= h * h || r2 <= 1e-10) {
            continue;
          }
          let r = sqrt(r2);
          let mj = materials[u32(pj.props.x)];
          let massJ = mj.a.x * params.counts.w;
          let densJ = max(pj.velocity.w, 1.0);
          let pressJ = taitPressure(densJ, mj.a.x, mj.a.y);

          let grad = spikyGrad(rij, r, h);
          pforce = pforce - massJ * (pressI / (densI * densI) + pressJ / (densJ * densJ)) * grad;

          let relVel = pj.velocity.xyz - p.velocity.xyz;
          let viscCoeff = (mat.a.z + mj.a.z) * 0.5;
          vforce = vforce + viscCoeff * massJ * (relVel / densJ) * viscLap(r, h);

          let cohCoeff = (mat.a.w + mj.a.w) * 0.5;
          cforce = cforce - cohCoeff * massJ * (rij / r) * cohesionKernel(r, h);
        }
      }
    }
  }

  var accel = pforce + vforce + cforce;
  accel.y = accel.y + params.p0.w;

  let mag = length(accel);
  let maxAccel = 70.0;
  if (mag > maxAccel) {
    accel = accel * (maxAccel / mag);
  }

  particles[i].accel = vec4<f32>(accel, 0.0);
}
`,ne=`// Pass 4/4 — semi-implicit Euler integration, tank & collider contact
// response (friction + restitution-free normal response) and a soft
// "wetting" adhesion zone just outside every surface so sticky materials
// (chocolate, mud) visibly cling to objects and walls instead of free-falling.

fn resolveContact(
  pos: ptr<function, vec3<f32>>,
  vel: ptr<function, vec3<f32>>,
  dist: f32,
  normal: vec3<f32>,
  radius: f32,
  friction: f32,
  adhesion: f32,
  dt: f32,
  contactAccum: ptr<function, f32>,
) {
  let pen = radius - dist;
  if (pen > 0.0) {
    *pos = *pos + normal * pen;
    let vn = dot(*vel, normal);
    if (vn < 0.0) {
      *vel = *vel - normal * vn;
    }
    let stick = clamp(adhesion * 1.4, 0.0, 0.97);
    *vel = *vel * ((1.0 - friction) * (1.0 - stick * 0.6));
    *contactAccum = max(*contactAccum, clamp(adhesion, 0.0, 1.0));
  } else if (dist < radius * 3.5 && adhesion > 0.05) {
    let pull = adhesion * (1.0 - dist / (radius * 3.5));
    *vel = *vel - normal * pull * 2.4 * dt;
    *contactAccum = max(*contactAccum, pull * 0.5);
  }
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(params.counts.x)) {
    return;
  }
  var p = particles[i];
  let mat = materials[u32(p.props.x)];
  let dt = params.p0.x;

  var vel = p.velocity.xyz + p.accel.xyz * dt;
  vel = vel * exp(-mat.c.w * 9.0 * dt);
  var pos = p.position.xyz + vel * dt;

  var contact = 0.0;
  let radius = mat.b.w;
  let friction = mat.b.y;
  let adhesion = mat.b.x;

  resolveContact(&pos, &vel, pos.y - params.domainMin.y, vec3<f32>(0.0, 1.0, 0.0), radius, friction, adhesion, dt, &contact);
  resolveContact(&pos, &vel, params.domainMax.x - pos.x, vec3<f32>(-1.0, 0.0, 0.0), radius, friction, adhesion, dt, &contact);
  resolveContact(&pos, &vel, pos.x - params.domainMin.x, vec3<f32>(1.0, 0.0, 0.0), radius, friction, adhesion, dt, &contact);
  resolveContact(&pos, &vel, params.domainMax.z - pos.z, vec3<f32>(0.0, 0.0, -1.0), radius, friction, adhesion, dt, &contact);
  resolveContact(&pos, &vel, pos.z - params.domainMin.z, vec3<f32>(0.0, 0.0, 1.0), radius, friction, adhesion, dt, &contact);

  let numColliders = u32(params.counts.y);
  for (var ci = 0u; ci < numColliders; ci = ci + 1u) {
    let c = colliders[ci];
    let hit = evalCollider(pos, c);
    resolveContact(&pos, &vel, hit.dist, hit.normal, radius, friction, adhesion, dt, &contact);
  }

  // Bingham-plastic-style yield behaviour: thick materials (mud, chocolate)
  // have a yield speed below which residual SPH jitter gets strongly braked
  // instead of persisting forever, so a poured pile actually comes to rest
  // instead of gently simmering indefinitely.
  let yieldSpeed = mat.c.w * 0.9;
  let restSpeed = length(vel);
  if (yieldSpeed > 0.001 && restSpeed < yieldSpeed) {
    let t = clamp(restSpeed / yieldSpeed, 0.0, 1.0);
    vel = vel * mix(0.015, 1.0, t);
  }

  let speed = length(vel);
  let maxSpeed = 9.0;
  if (speed > maxSpeed) {
    vel = vel * (maxSpeed / speed);
  }

  p.position = vec4<f32>(pos, p.position.w);
  p.velocity = vec4<f32>(vel, p.velocity.w);
  p.props.y = p.props.y + dt;
  p.props.z = contact;
  particles[i] = p;
}
`,I=16,L=64,re=64,ie=.0017,R=class{device;maxParticles;particleBuffer;materialBuffer;colliderBuffer;gridCountBuffer;gridCountZero;gridCellsBuffer;paramsBuffer;insertPipeline;densityPipeline;forcesPipeline;integratePipeline;bindGroup;bindGroupLayout;gridDims;numCells;activeCount=0;spawnCursor=0;simTime=0;colliderCount=0;colliders=[];constructor(e,t){this.device=e,this.maxParticles=t;let n=_,r=Math.max(1,Math.ceil((y[0]-v[0])/n)),i=Math.max(1,Math.ceil((y[1]-v[1])/n)),a=Math.max(1,Math.ceil((y[2]-v[2])/n));this.gridDims=[r,i,a],this.numCells=r*i*a,this.particleBuffer=e.createBuffer({label:`particles`,size:t*I*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.materialBuffer=e.createBuffer({label:`materials`,size:T.length*16*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.uploadMaterials(),this.colliderBuffer=e.createBuffer({label:`colliders`,size:384,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.gridCountBuffer=e.createBuffer({label:`gridCount`,size:this.numCells*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),this.gridCountZero=e.createBuffer({label:`gridCountZero`,size:this.numCells*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),this.gridCellsBuffer=e.createBuffer({label:`gridCells`,size:this.numCells*L*4,usage:GPUBufferUsage.STORAGE}),this.paramsBuffer=e.createBuffer({label:`simParams`,size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.buildPipelines()}uploadMaterials(){let e=new Float32Array(T.length*16);T.forEach((t,n)=>{let r=w[t],i=n*16;e[i+0]=r.restDensity,e[i+1]=r.stiffness,e[i+2]=r.viscosity,e[i+3]=r.cohesion,e[i+4]=r.adhesion,e[i+5]=r.friction,e[i+6]=r.releaseThreshold,e[i+7]=r.particleRadius,e[i+8]=r.color[0],e[i+9]=r.color[1],e[i+10]=r.color[2],e[i+11]=r.damping,e[i+12]=D(r),e[i+13]=0,e[i+14]=0,e[i+15]=0}),this.device.queue.writeBuffer(this.materialBuffer,0,e)}setColliders(e){this.colliders=e,this.colliderCount=e.length,this.device.queue.writeBuffer(this.colliderBuffer,0,N(e))}buildPipelines(){let e=P,t=(t,n)=>this.device.createShaderModule({label:n,code:e+`
`+t});this.bindGroupLayout=this.device.createBindGroupLayout({label:`sph-bind-group-layout`,entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:`uniform`}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:`storage`}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:`read-only-storage`}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:`read-only-storage`}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:`storage`}},{binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:`storage`}}]});let n=this.device.createPipelineLayout({label:`sph-pipeline-layout`,bindGroupLayouts:[this.bindGroupLayout]});this.bindGroup=this.device.createBindGroup({label:`sph-bind-group`,layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.paramsBuffer}},{binding:1,resource:{buffer:this.particleBuffer}},{binding:2,resource:{buffer:this.materialBuffer}},{binding:3,resource:{buffer:this.colliderBuffer}},{binding:4,resource:{buffer:this.gridCountBuffer}},{binding:5,resource:{buffer:this.gridCellsBuffer}}]});let r=(e,r)=>this.device.createComputePipeline({label:r,layout:n,compute:{module:t(e,r),entryPoint:`main`}});this.insertPipeline=r(F,`insert`),this.densityPipeline=r(ee,`density`),this.forcesPipeline=r(te,`forces`),this.integratePipeline=r(ne,`integrate`)}writeParams(e){let t=new Float32Array(20);t[0]=e,t[1]=_,t[2]=_,t[3]=g,t[4]=v[0],t[5]=v[1],t[6]=v[2],t[7]=0,t[8]=y[0],t[9]=y[1],t[10]=y[2],t[11]=0,t[12]=this.gridDims[0],t[13]=this.gridDims[1],t[14]=this.gridDims[2],t[15]=L,t[16]=this.activeCount,t[17]=this.colliderCount,t[18]=this.simTime,t[19]=ie,this.device.queue.writeBuffer(this.paramsBuffer,0,t)}spawn(e,t){let n=Math.max(1,Math.min(this.maxParticles,Math.floor(t))),r=E(e.material),i=e.count,a=I,o=new Float32Array(i*a);for(let t=0;t<i;t++){let n=t*a,i=(Math.random()*2-1)*e.spread,s=(Math.random()*2-1)*e.spread,c=Math.random()*e.spread*.4;o[n+0]=e.origin[0]+i,o[n+1]=e.origin[1]+c,o[n+2]=e.origin[2]+s,o[n+3]=0,o[n+4]=e.initialVelocity[0]+(Math.random()-.5)*.2,o[n+5]=e.initialVelocity[1],o[n+6]=e.initialVelocity[2]+(Math.random()-.5)*.2,o[n+7]=0,o[n+8]=r,o[n+9]=0,o[n+10]=0,o[n+11]=0,o[n+12]=0,o[n+13]=0,o[n+14]=0,o[n+15]=0}let s=Math.min(i,n),c=0,l=this.spawnCursor%n;for(;s>0;){let e=n-l,t=Math.min(e,s);this.device.queue.writeBuffer(this.particleBuffer,l*a*4,o.buffer,c*a*4,t*a*4),l=(l+t)%n,c+=t,s-=t}this.spawnCursor=l,this.activeCount=Math.min(n,this.activeCount+i)}setActiveBudget(e){this.activeCount=Math.min(this.activeCount,e)}reset(){this.activeCount=0,this.spawnCursor=0,this.simTime=0}step(e,t){if(this.activeCount===0)return;let n=e/t;for(let e=0;e<t;e++){this.simTime+=n,this.writeParams(n);let e=this.device.createCommandEncoder({label:`sph-step`});e.copyBufferToBuffer(this.gridCountZero,0,this.gridCountBuffer,0,this.numCells*4);let t=Math.ceil(this.activeCount/re),r=e.beginComputePass({label:`sph-passes`});r.setBindGroup(0,this.bindGroup),r.setPipeline(this.insertPipeline),r.dispatchWorkgroups(t),r.setPipeline(this.densityPipeline),r.dispatchWorkgroups(t),r.setPipeline(this.forcesPipeline),r.dispatchWorkgroups(t),r.setPipeline(this.integratePipeline),r.dispatchWorkgroups(t),r.end(),this.device.queue.submit([e.finish()])}}},z=_,B=z*z,V=.0017,H=7;function ae(e,t){if(e>t*t)return 0;let n=t*t-e;return 315/(64*Math.PI*t**9)*n*n*n}function oe(e,t){if(e<=1e-5||e>t)return 0;let n=-45/(Math.PI*t**6),r=t-e;return n*r*r}function se(e,t){return e>t?0:45/(Math.PI*t**6)*(t-e)}function ce(e,t){return e>t||e<=1e-4?0:(1-e/t)*(t-e)}var le=class{maxParticles;posX;posY;posZ;velX;velY;velZ;accelX;accelY;accelZ;dens;matIdx;contact;activeCount=0;spawnCursor=0;colliders=[];simTime=0;grid=new Map;gridNx;gridNy;gridNz;constructor(e){this.maxParticles=e,this.posX=new Float32Array(e),this.posY=new Float32Array(e),this.posZ=new Float32Array(e),this.velX=new Float32Array(e),this.velY=new Float32Array(e),this.velZ=new Float32Array(e),this.accelX=new Float32Array(e),this.accelY=new Float32Array(e),this.accelZ=new Float32Array(e),this.dens=new Float32Array(e).fill(1),this.matIdx=new Float32Array(e),this.contact=new Float32Array(e),this.gridNx=Math.max(1,Math.ceil((y[0]-v[0])/z)),this.gridNy=Math.max(1,Math.ceil((y[1]-v[1])/z)),this.gridNz=Math.max(1,Math.ceil((y[2]-v[2])/z))}setColliders(e){this.colliders=e}setActiveBudget(e){this.activeCount=Math.min(this.activeCount,e)}reset(){this.activeCount=0,this.spawnCursor=0,this.simTime=0}spawn(e,t){let n=Math.max(1,Math.min(this.maxParticles,Math.floor(t)));this.spawnCursor%=n;let r=E(e.material);for(let t=0;t<e.count;t++){let t=this.spawnCursor;this.posX[t]=e.origin[0]+(Math.random()*2-1)*e.spread,this.posY[t]=e.origin[1]+Math.random()*e.spread*.4,this.posZ[t]=e.origin[2]+(Math.random()*2-1)*e.spread,this.velX[t]=e.initialVelocity[0]+(Math.random()-.5)*.2,this.velY[t]=e.initialVelocity[1],this.velZ[t]=e.initialVelocity[2]+(Math.random()-.5)*.2,this.accelX[t]=0,this.accelY[t]=0,this.accelZ[t]=0,this.dens[t]=1,this.matIdx[t]=r,this.contact[t]=0,this.spawnCursor=(this.spawnCursor+1)%n,this.activeCount=Math.min(n,this.activeCount+1)}}cellKey(e,t,n){return e+t*this.gridNx+n*this.gridNx*this.gridNy}cellCoord(e,t,n){return[Math.min(this.gridNx-1,Math.max(0,Math.floor((e-v[0])/z))),Math.min(this.gridNy-1,Math.max(0,Math.floor((t-v[1])/z))),Math.min(this.gridNz-1,Math.max(0,Math.floor((n-v[2])/z)))]}buildGrid(){this.grid.clear();let e=this.activeCount;for(let t=0;t<e;t++){let[e,n,r]=this.cellCoord(this.posX[t],this.posY[t],this.posZ[t]),i=this.cellKey(e,n,r),a=this.grid.get(i);a||(a=[],this.grid.set(i,a)),a.push(t)}}forEachNeighbor(e,t,n,r){let[i,a,o]=this.cellCoord(e,t,n);for(let e=-1;e<=1;e++){let t=o+e;if(!(t<0||t>=this.gridNz))for(let e=-1;e<=1;e++){let n=a+e;if(!(n<0||n>=this.gridNy))for(let e=-1;e<=1;e++){let a=i+e;if(a<0||a>=this.gridNx)continue;let o=this.grid.get(this.cellKey(a,n,t));if(o)for(let e=0;e<o.length;e++)r(o[e])}}}}step(e,t){if(this.activeCount===0)return;let n=e/t;for(let e=0;e<t;e++)this.simTime+=n,this.buildGrid(),this.computeDensity(),this.computeForces(),this.integrate(n)}computeDensity(){let e=this.activeCount;for(let t=0;t<e;t++){let e=this.posX[t],n=this.posY[t],r=this.posZ[t],i=0;this.forEachNeighbor(e,n,r,t=>{let a=e-this.posX[t],o=n-this.posY[t],s=r-this.posZ[t],c=a*a+o*o+s*s;if(c<B){let e=w[T[this.matIdx[t]]];i+=e.restDensity*V*ae(c,z)}}),this.dens[t]=Math.max(i,1)}}computeForces(){let e=this.activeCount;for(let t=0;t<e;t++){let e=this.posX[t],n=this.posY[t],r=this.posZ[t],i=w[T[this.matIdx[t]]],a=this.dens[t],o=a/i.restDensity,s=Math.max(i.stiffness*(o**+H-1),0),c=0,l=0,u=0;this.forEachNeighbor(e,n,r,o=>{if(o===t)return;let d=e-this.posX[o],f=n-this.posY[o],p=r-this.posZ[o],m=d*d+f*f+p*p;if(m>=B||m<=1e-10)return;let h=Math.sqrt(m),g=w[T[this.matIdx[o]]],_=g.restDensity*V,v=this.dens[o],y=v/g.restDensity,b=Math.max(g.stiffness*(y**+H-1),0),x=oe(h,z),S=1/h,C=d*S*x,E=f*S*x,D=p*S*x,O=-_*(s/(a*a)+b/(v*v));c+=O*C,l+=O*E,u+=O*D;let k=this.velX[o]-this.velX[t],A=this.velY[o]-this.velY[t],j=this.velZ[o]-this.velZ[t],M=(i.viscosity+g.viscosity)*.5,N=se(h,z);c+=M*_*k*N/v,l+=M*_*A*N/v,u+=M*_*j*N/v;let P=(i.cohesion+g.cohesion)*.5,F=ce(h,z);c+=-P*_*d*S*F,l+=-P*_*f*S*F,u+=-P*_*p*S*F}),l+=g;let d=Math.hypot(c,l,u);if(d>70){let e=70/d;c*=e,l*=e,u*=e}this.accelX[t]=c,this.accelY[t]=l,this.accelZ[t]=u}}resolveContact(e,t,n,r,i,a,o,s,c,l,u){let d=s-r;if(d>0){t[0]+=i*d,t[1]+=a*d,t[2]+=o*d;let r=n[0]*i+n[1]*a+n[2]*o;r<0&&(n[0]-=i*r,n[1]-=a*r,n[2]-=o*r);let s=Math.min(.97,Math.max(0,l*1.4)),u=(1-c)*(1-s*.6);n[0]*=u,n[1]*=u,n[2]*=u,this.contact[e]=Math.max(this.contact[e],Math.min(1,Math.max(0,l)))}else if(r<s*3.5&&l>.05){let t=l*(1-r/(s*3.5));n[0]-=i*t*2.4*u,n[1]-=a*t*2.4*u,n[2]-=o*t*2.4*u,this.contact[e]=Math.max(this.contact[e],t*.5)}}integrate(e){let t=this.activeCount,n=[0,0,0],r=[0,0,0];for(let i=0;i<t;i++){let t=w[T[this.matIdx[i]]],a=this.velX[i]+this.accelX[i]*e,o=this.velY[i]+this.accelY[i]*e,s=this.velZ[i]+this.accelZ[i]*e,c=Math.exp(-t.damping*9*e);a*=c,o*=c,s*=c;let l=this.posX[i]+a*e,u=this.posY[i]+o*e,d=this.posZ[i]+s*e;this.contact[i]=0,n[0]=l,n[1]=u,n[2]=d,r[0]=a,r[1]=o,r[2]=s;let f=t.particleRadius;this.resolveContact(i,n,r,n[1]-v[1],0,1,0,f,t.friction,t.adhesion,e),this.resolveContact(i,n,r,y[0]-n[0],-1,0,0,f,t.friction,t.adhesion,e),this.resolveContact(i,n,r,n[0]-v[0],1,0,0,f,t.friction,t.adhesion,e),this.resolveContact(i,n,r,y[2]-n[2],0,0,-1,f,t.friction,t.adhesion,e),this.resolveContact(i,n,r,n[2]-v[2],0,0,1,f,t.friction,t.adhesion,e);for(let a of this.colliders){let o=M(a,n[0],n[1],n[2],this.simTime);this.resolveContact(i,n,r,o.dist,o.nx,o.ny,o.nz,f,t.friction,t.adhesion,e)}let p=t.damping*.9,m=Math.hypot(r[0],r[1],r[2]);if(p>.001&&m<p){let e=.015+.985*Math.min(1,Math.max(0,m/p));r[0]*=e,r[1]*=e,r[2]*=e}let h=Math.hypot(r[0],r[1],r[2]);if(h>9){let e=9/h;r[0]*=e,r[1]*=e,r[2]*=e}this.posX[i]=n[0],this.posY[i]=n[1],this.posZ[i]=n[2],this.velX[i]=r[0],this.velY[i]=r[1],this.velZ[i]=r[2]}}},U=`// Shared camera uniform + lighting helpers for every WebGPU render pass.

struct Camera {
  viewProj     : mat4x4<f32>,
  invViewProj  : mat4x4<f32>,
  view         : mat4x4<f32>,
  proj         : mat4x4<f32>,
  cameraPos    : vec4<f32>,
  cameraRight  : vec4<f32>,
  cameraUp     : vec4<f32>,
  cameraForward: vec4<f32>,
  lightDir     : vec4<f32>,
  params       : vec4<f32>, // x = time, y = aspect, z = near, w = far
};

fn fresnelSchlick(cosTheta: f32, f0: f32) -> f32 {
  let c = clamp(1.0 - cosTheta, 0.0, 1.0);
  return f0 + (1.0 - f0) * pow(c, 5.0);
}

fn acesTonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn skyGradient(dir: vec3<f32>) -> vec3<f32> {
  let t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  let horizon = vec3<f32>(0.55, 0.58, 0.63);
  let zenith = vec3<f32>(0.12, 0.2, 0.38);
  return mix(horizon, zenith, t);
}
`,ue=`// Forward-shaded pass for the tank floor/walls and the analytic colliders
// (sphere, box, paddle). Simple Lambert + Blinn-Phong + sky ambient so the
// fluid has believable objects to collide with, refract against and coat.

struct ObjectUniform {
  model     : mat4x4<f32>,
  color     : vec4<f32>,
  roughness : vec4<f32>, // x roughness, y metallic-ish spec scale, zw unused
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(1) @binding(0) var<uniform> object : ObjectUniform;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
  @location(1) worldNormal : vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> VsOut {
  var out: VsOut;
  let world = object.model * vec4<f32>(position, 1.0);
  out.worldPos = world.xyz;
  let normalMat = mat3x3<f32>(object.model[0].xyz, object.model[1].xyz, object.model[2].xyz);
  out.worldNormal = normalize(normalMat * normal);
  out.clip = camera.viewProj * world;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let n = normalize(in.worldNormal);
  let viewDir = normalize(camera.cameraPos.xyz - in.worldPos);
  let lightDir = normalize(camera.lightDir.xyz);
  let ndotl = max(dot(n, lightDir), 0.0);
  let halfV = normalize(lightDir + viewDir);
  let spec = pow(max(dot(n, halfV), 0.0), mix(8.0, 128.0, 1.0 - object.roughness.x)) * object.roughness.y;
  let ambient = skyGradient(n) * 0.55;
  let diffuse = object.color.rgb * (ambient + ndotl * 1.15);
  let col = diffuse + vec3<f32>(spec);
  return vec4<f32>(acesTonemap(col), object.color.a);
}
`,de=`// Instanced camera-facing sphere-impostor particle renderer. Each instance
// is a quad expanded in the camera's right/up plane; the fragment shader
// ray-casts an analytic sphere so lighting, silhouette and depth are all
// pixel-accurate (not just a flat dot sprite).

struct RenderParticle {
  position : vec4<f32>,
  velocity : vec4<f32>,
  props    : vec4<f32>, // x materialType, y age, z contact, w unused
  accel    : vec4<f32>,
};

struct RenderMaterial {
  a : vec4<f32>, // restDensity, stiffness, viscosity, cohesion
  b : vec4<f32>, // adhesion, friction, releaseThreshold, particleRadius
  c : vec4<f32>, // colorR, colorG, colorB, damping
  d : vec4<f32>, // opacity, unused, unused, unused
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(1) @binding(0) var<storage, read> particles : array<RenderParticle>;
@group(1) @binding(1) var<storage, read> materials : array<RenderMaterial>;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) color : vec3<f32>,
  @location(2) roughness : f32,
  @location(3) contact : f32,
  @location(4) speed : f32,
  @location(5) worldCenter : vec3<f32>,
  @location(6) radius : f32,
  @location(7) opacity : f32,
};

const QUAD_UV = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
  vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0),
);

@vertex
fn vs_main(@builtin(vertex_index) vIdx: u32, @builtin(instance_index) iIdx: u32) -> VsOut {
  var out: VsOut;
  let p = particles[iIdx];
  let mat = materials[u32(p.props.x)];
  let radius = mat.b.w;
  let uv = QUAD_UV[vIdx % 6u];

  let worldCenter = p.position.xyz;
  let worldCorner = worldCenter + camera.cameraRight.xyz * uv.x * radius * 1.35 + camera.cameraUp.xyz * uv.y * radius * 1.35;

  out.clip = camera.viewProj * vec4<f32>(worldCorner, 1.0);
  out.uv = uv;
  out.color = mat.c.rgb;
  out.roughness = mat.c.w;
  out.contact = p.props.z;
  out.speed = length(p.velocity.xyz);
  out.worldCenter = worldCenter;
  out.radius = radius;
  out.opacity = mat.d.x;
  return out;
}

struct FsOut {
  @builtin(frag_depth) depth : f32,
  @location(0) color : vec4<f32>,
};

@fragment
fn fs_main(in: VsOut) -> FsOut {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) {
    discard;
  }
  let z = sqrt(1.0 - r2);
  let normal = normalize(camera.cameraRight.xyz * in.uv.x + camera.cameraUp.xyz * in.uv.y - camera.cameraForward.xyz * z);

  // Reconstruct the true analytic sphere-surface position (not just the
  // interpolated billboard quad) so depth is pixel-accurate and particles
  // occlude / are occluded by scene geometry and each other correctly.
  let surfacePos = in.worldCenter + normal * in.radius;
  let reprojected = camera.viewProj * vec4<f32>(surfacePos, 1.0);
  let trueDepth = reprojected.z / reprojected.w;

  let lightDir = normalize(camera.lightDir.xyz);
  let viewDir = normalize(camera.cameraPos.xyz - surfacePos);
  let ndotl = max(dot(normal, lightDir), 0.0);
  let ndotv = max(dot(normal, viewDir), 0.0);
  let halfV = normalize(lightDir + viewDir);
  let shininess = mix(96.0, 8.0, in.roughness);
  let spec = pow(max(dot(normal, halfV), 0.0), shininess);
  let fres = fresnelSchlick(ndotv, 0.04);

  let ambient = skyGradient(normal) * 0.6;
  let wet = mix(1.0, 1.35, in.contact);
  let base = in.color * (ambient + ndotl * 1.2) * wet;
  let specStrength = mix(0.15, 0.85, 1.0 - in.roughness) + in.contact * 0.2;
  var col = base + vec3<f32>(spec) * specStrength + skyGradient(reflect(-viewDir, normal)) * fres * 0.5;

  let speedTint = clamp(in.speed * 0.015, 0.0, 0.12);
  col = col + vec3<f32>(speedTint * 0.3, speedTint * 0.3, speedTint * 0.5);

  let edgeFade = 1.0 - smoothstep(0.7, 1.0, r2);
  let alpha = clamp(in.opacity * edgeFade, 0.0, 1.0);

  var out: FsOut;
  out.color = vec4<f32>(acesTonemap(col), alpha);
  out.depth = clamp(trueDepth, 0.0, 1.0);
  return out;
}
`,fe=`// Fullscreen upscale blit from the (dynamically resized) internal render
// target to the swapchain, with a light unsharp-mask so lowered dynamic
// resolution scales still read reasonably crisp — the same spirit as
// Unreal's dynamic-resolution upscale pass.

@group(0) @binding(0) var srcTex : texture_2d<f32>;
@group(0) @binding(1) var srcSampler : sampler;

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VsOut {
  var out: VsOut;
  let uv = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
  out.uv = uv;
  out.pos = vec4<f32>(uv * 2.0 - 1.0, 0.0, 1.0);
  out.pos.y = -out.pos.y;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let dims = vec2<f32>(textureDimensions(srcTex));
  let texel = 1.0 / dims;
  let center = textureSample(srcTex, srcSampler, in.uv);
  let n = textureSample(srcTex, srcSampler, in.uv + vec2<f32>(0.0, -texel.y));
  let s = textureSample(srcTex, srcSampler, in.uv + vec2<f32>(0.0, texel.y));
  let e = textureSample(srcTex, srcSampler, in.uv + vec2<f32>(texel.x, 0.0));
  let w = textureSample(srcTex, srcSampler, in.uv + vec2<f32>(-texel.x, 0.0));
  let blur = (n + s + e + w) * 0.25;
  let sharpened = center + (center - blur) * 0.35;
  return vec4<f32>(clamp(sharpened.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;function W(e,t,n){let r=[{n:[0,0,1],verts:[[-e,-t,n],[e,-t,n],[e,t,n],[-e,t,n]]},{n:[0,0,-1],verts:[[e,-t,-n],[-e,-t,-n],[-e,t,-n],[e,t,-n]]},{n:[1,0,0],verts:[[e,-t,n],[e,-t,-n],[e,t,-n],[e,t,n]]},{n:[-1,0,0],verts:[[-e,-t,-n],[-e,-t,n],[-e,t,n],[-e,t,-n]]},{n:[0,1,0],verts:[[-e,t,n],[e,t,n],[e,t,-n],[-e,t,-n]]},{n:[0,-1,0],verts:[[-e,-t,-n],[e,-t,-n],[e,-t,n],[-e,-t,n]]}],i=[],a=[];return r.forEach((e,t)=>{e.verts.forEach(t=>{i.push(t[0],t[1],t[2],e.n[0],e.n[1],e.n[2])});let n=t*4;a.push(n,n+1,n+2,n,n+2,n+3)}),{vertices:new Float32Array(i),indices:new Uint16Array(a)}}function G(e,t=20,n=14){let r=[],i=[];for(let i=0;i<=n;i++){let a=i/n*Math.PI;for(let n=0;n<=t;n++){let i=n/t*Math.PI*2,o=Math.sin(a)*Math.cos(i),s=Math.cos(a),c=Math.sin(a)*Math.sin(i);r.push(o*e,s*e,c*e,o,s,c)}}let a=t+1;for(let e=0;e<n;e++)for(let n=0;n<t;n++){let t=e*a+n,r=t+a;i.push(t,r,t+1,t+1,r,r+1)}return{vertices:new Float32Array(r),indices:new Uint16Array(i)}}function K(e,t){return{vertices:new Float32Array([-e,0,-t,0,1,0,e,0,-t,0,1,0,e,0,t,0,1,0,-e,0,t,0,1,0]),indices:new Uint16Array([0,1,2,0,2,3])}}function pe(e,n,a,o){let s=e.viewMatrix(),c=t();i(c,a,s);let l=t();r(l,c);let h=e.eye,g=u();f(g,e.target,h),p(g,g);let _=d(0,1,0),v=u();m(v,g,_),p(v,v);let y=u();m(y,v,g),p(y,y);let b=d(.45,.82,.3);p(b,b);let x=new Float32Array(88);return x.set(c,0),x.set(l,16),x.set(s,32),x.set(a,48),x.set([h[0],h[1],h[2],0],64),x.set([v[0],v[1],v[2],0],68),x.set([y[0],y[1],y[2],0],72),x.set([g[0],g[1],g[2],0],76),x.set([b[0],b[1],b[2],0],80),x.set([o,n,.05,60],84),x}var me=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function q(e,t,n,r){let i=Math.cos(r),a=Math.sin(r);return new Float32Array([i,0,-a,0,0,1,0,0,a,0,i,0,e,t,n,1])}var he=class{device;context;format;canvas;colorTex=null;depthTex=null;internalW=0;internalH=0;cameraBuffer;sceneBindGroupLayout;scenePipeline;particlePipelineLayout;particlePipeline;particleBindGroup=null;blitPipeline;blitSampler;objectBindGroupLayout;objects=[];constructor(e,t,n,r){this.canvas=e,this.device=t,this.context=n,this.format=r,this.cameraBuffer=t.createBuffer({label:`camera-uniform`,size:352,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.blitSampler=t.createSampler({minFilter:`linear`,magFilter:`linear`}),this.buildPipelines(),this.buildStaticScene()}buildPipelines(){let e=this.device,t=U;this.sceneBindGroupLayout=e.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}}]}),this.objectBindGroupLayout=e.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}}]});let n=e.createPipelineLayout({bindGroupLayouts:[this.sceneBindGroupLayout,this.objectBindGroupLayout]}),r=e.createShaderModule({code:t+`
`+ue});this.scenePipeline=e.createRenderPipeline({label:`scene-pipeline`,layout:n,vertex:{module:r,entryPoint:`vs_main`,buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`}]}]},fragment:{module:r,entryPoint:`fs_main`,targets:[{format:`rgba16float`}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}});let i=e.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:`read-only-storage`}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:`read-only-storage`}}]});this.particlePipelineLayout=e.createPipelineLayout({bindGroupLayouts:[this.sceneBindGroupLayout,i]});let a=e.createShaderModule({code:t+`
`+de});this.particlePipeline=e.createRenderPipeline({label:`particle-pipeline`,layout:this.particlePipelineLayout,vertex:{module:a,entryPoint:`vs_main`},fragment:{module:a,entryPoint:`fs_main`,targets:[{format:`rgba16float`,blend:{color:{srcFactor:`src-alpha`,dstFactor:`one-minus-src-alpha`,operation:`add`},alpha:{srcFactor:`one`,dstFactor:`one-minus-src-alpha`,operation:`add`}}}]},primitive:{topology:`triangle-list`,cullMode:`none`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}});let o=e.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:`float`}},{binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:`filtering`}}]}),s=e.createPipelineLayout({bindGroupLayouts:[o]}),c=e.createShaderModule({code:fe});this.blitPipeline=e.createRenderPipeline({label:`blit-pipeline`,layout:s,vertex:{module:c,entryPoint:`vs_main`},fragment:{module:c,entryPoint:`fs_main`,targets:[{format:this.format}]},primitive:{topology:`triangle-list`}}),this.blitBindGroupLayout=o}blitBindGroupLayout;addObject(e,t,n){let r=this.device,i=r.createBuffer({size:e.vertices.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,mappedAtCreation:!0});new Float32Array(i.getMappedRange()).set(e.vertices),i.unmap();let a=r.createBuffer({size:Math.ceil(e.indices.byteLength/4)*4,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST,mappedAtCreation:!0});new Uint16Array(a.getMappedRange()).set(e.indices),a.unmap();let o=r.createBuffer({size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s=r.createBindGroup({layout:this.objectBindGroupLayout,entries:[{binding:0,resource:{buffer:o}}]}),c={vertexBuffer:i,indexBuffer:a,indexCount:e.indices.length,uniformBuffer:o,bindGroup:s,model:me(),color:t,roughness:n,spin:0,baseY:0,baseRotY:0};return this.objects.push(c),c}buildStaticScene(){let e=this.addObject(K(A[0]+.15,A[2]+.15),[.14,.14,.17,1],[.75,.3]);e.model=q(0,0,0,0);let t=A[1]*2,n=W(.035,t*.5,.035),r=[[-A[0],-A[2]],[A[0],-A[2]],[-A[0],A[2]],[A[0],A[2]]];for(let[e,i]of r){let r=this.addObject(n,[.55,.58,.63,1],[.35,.6]);r.model=q(e,t*.5,i,0)}}colliderObjects=[];setColliders(e){for(let e of this.colliderObjects)e.vertexBuffer.destroy(),e.indexBuffer.destroy(),e.uniformBuffer.destroy();this.colliderObjects=[];for(let t of e){let e;e=t.kind===`sphere`?G(t.size[0]):W(t.size[0],t.size[1],t.size[2]);let n=this.addObject(e,[t.color[0],t.color[1],t.color[2],1],[.4,.5]);n.model=q(t.position[0],t.position[1],t.position[2],t.rotationY),n.spin=t.spinSpeed,n.baseY=t.position[1],n.baseRotY=t.rotationY,this.colliderObjects.push(n),this.objects.push(n)}}setParticleSource(e){this.particleBindGroup=this.device.createBindGroup({layout:this.particlePipeline.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:e.particleBuffer}},{binding:1,resource:{buffer:e.materialBuffer}}]})}ensureTargets(e,t){let n=Math.max(1,Math.floor(e)),r=Math.max(1,Math.floor(t));n===this.internalW&&r===this.internalH&&this.colorTex||(this.internalW=n,this.internalH=r,this.colorTex?.destroy(),this.depthTex?.destroy(),this.colorTex=this.device.createTexture({size:[n,r],format:`rgba16float`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),this.depthTex=this.device.createTexture({size:[n,r],format:`depth24plus`,usage:GPUTextureUsage.RENDER_ATTACHMENT}))}render(e){let t=this.canvas.getBoundingClientRect(),n=Math.min(window.devicePixelRatio||1,2),r=Math.max(1,Math.round(t.width*n)),i=Math.max(1,Math.round(t.height*n));(this.canvas.width!==r||this.canvas.height!==i)&&(this.canvas.width=r,this.canvas.height=i),this.ensureTargets(r*e.renderScale,i*e.renderScale);let a=r/i,o=e.camera.projMatrixZeroToOne(a),s=pe(e.camera,a,o,e.time);this.device.queue.writeBuffer(this.cameraBuffer,0,s);for(let t of this.colliderObjects)if(t.spin!==0){let n=t.baseRotY+t.spin*e.time;t.model=q(t.model[12],t.baseY,t.model[14],n)}for(let e of this.objects){let t=new Float32Array(24);t.set(e.model,0),t.set(e.color,16),t.set([e.roughness[0],e.roughness[1],0,0],20),this.device.queue.writeBuffer(e.uniformBuffer,0,t)}let c=this.device.createBindGroup({layout:this.sceneBindGroupLayout,entries:[{binding:0,resource:{buffer:this.cameraBuffer}}]}),l=this.device.createCommandEncoder({label:`frame`}),u=this.colorTex.createView(),d=this.depthTex.createView(),f=l.beginRenderPass({colorAttachments:[{view:u,clearValue:{r:.03,g:.035,b:.05,a:1},loadOp:`clear`,storeOp:`store`}],depthStencilAttachment:{view:d,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});f.setPipeline(this.scenePipeline),f.setBindGroup(0,c);for(let e of this.objects)f.setBindGroup(1,e.bindGroup),f.setVertexBuffer(0,e.vertexBuffer),f.setIndexBuffer(e.indexBuffer,`uint16`),f.drawIndexed(e.indexCount);if(f.end(),(e.viewMode===`particles`||e.viewMode===`both`)&&this.particleBindGroup&&e.activeCount>0){let t=l.beginRenderPass({colorAttachments:[{view:u,loadOp:`load`,storeOp:`store`}],depthStencilAttachment:{view:d,depthLoadOp:`load`,depthStoreOp:`store`}});t.setPipeline(this.particlePipeline),t.setBindGroup(0,c),t.setBindGroup(1,this.particleBindGroup),t.draw(6,e.activeCount),t.end()}let p=this.device.createBindGroup({layout:this.blitBindGroupLayout,entries:[{binding:0,resource:u},{binding:1,resource:this.blitSampler}]}),m=this.context.getCurrentTexture().createView(),h=l.beginRenderPass({colorAttachments:[{view:m,clearValue:{r:0,g:0,b:0,a:1},loadOp:`clear`,storeOp:`store`}]});h.setPipeline(this.blitPipeline),h.setBindGroup(0,p),h.draw(3),h.end(),this.device.queue.submit([l.finish()])}},ge=`#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uViewProj;
uniform mat4 uModel;

out vec3 vWorldPos;
out vec3 vWorldNormal;

void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorldPos = world.xyz;
  mat3 normalMat = mat3(uModel);
  vWorldNormal = normalize(normalMat * aNormal);
  gl_Position = uViewProj * world;
}
`,_e=`#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vWorldNormal;

uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec4 uColor;
uniform vec2 uRoughness; // x roughness, y spec scale

out vec4 fragColor;

vec3 skyGradient(vec3 dir) {
  float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 horizon = vec3(0.55, 0.58, 0.63);
  vec3 zenith = vec3(0.12, 0.2, 0.38);
  return mix(horizon, zenith, t);
}

vec3 acesTonemap(vec3 x) {
  float a = 2.51; float b = 0.03; float c = 2.43; float d = 0.59; float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  vec3 lightDir = normalize(uLightDir);
  float ndotl = max(dot(n, lightDir), 0.0);
  vec3 halfV = normalize(lightDir + viewDir);
  float spec = pow(max(dot(n, halfV), 0.0), mix(8.0, 128.0, 1.0 - uRoughness.x)) * uRoughness.y;
  vec3 ambient = skyGradient(n) * 0.55;
  vec3 diffuse = uColor.rgb * (ambient + ndotl * 1.15);
  vec3 col = diffuse + vec3(spec);
  fragColor = vec4(acesTonemap(col), uColor.a);
}
`,ve=`#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aData0; // pos.xyz, matIdx
layout(location = 2) in vec4 aData1; // velLen, contact, 0, 0

uniform mat4 uViewProj;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform vec4 uMatRadius; // per-material particle radius, indexed by matIdx

out vec2 vUv;
out vec3 vWorldCenter;
out float vRadius;
out float vMatIdx;
out float vContact;
out float vSpeed;

float radiusFor(float idx) {
  int i = int(idx + 0.5);
  if (i == 0) return uMatRadius.x;
  if (i == 1) return uMatRadius.y;
  if (i == 2) return uMatRadius.z;
  return uMatRadius.w;
}

void main() {
  vec3 center = aData0.xyz;
  float matIdx = aData0.w;
  float radius = radiusFor(matIdx);
  vec3 worldCorner = center + uCameraRight * aCorner.x * radius * 1.35 + uCameraUp * aCorner.y * radius * 1.35;

  vUv = aCorner;
  vWorldCenter = center;
  vRadius = radius;
  vMatIdx = matIdx;
  vSpeed = aData1.x;
  vContact = aData1.y;

  gl_Position = uViewProj * vec4(worldCorner, 1.0);
}
`,ye=`#version 300 es
precision highp float;

in vec2 vUv;
in vec3 vWorldCenter;
in float vRadius;
in float vMatIdx;
in float vContact;
in float vSpeed;

uniform mat4 uViewProj;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform vec3 uCameraForward;
uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec4 uMatColorR; // per-material color.r packed by index
uniform vec4 uMatColorG;
uniform vec4 uMatColorB;
uniform vec4 uMatRoughness;
uniform vec4 uMatOpacity;

out vec4 fragColor;

vec3 skyGradient(vec3 dir) {
  float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 horizon = vec3(0.55, 0.58, 0.63);
  vec3 zenith = vec3(0.12, 0.2, 0.38);
  return mix(horizon, zenith, t);
}

vec3 acesTonemap(vec3 x) {
  float a = 2.51; float b = 0.03; float c = 2.43; float d = 0.59; float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float fresnelSchlick(float cosTheta, float f0) {
  float c = clamp(1.0 - cosTheta, 0.0, 1.0);
  return f0 + (1.0 - f0) * pow(c, 5.0);
}

vec4 pick(vec4 v, int i) {
  if (i == 0) return vec4(v.x);
  if (i == 1) return vec4(v.y);
  if (i == 2) return vec4(v.z);
  return vec4(v.w);
}

void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float z = sqrt(1.0 - r2);
  vec3 normal = normalize(uCameraRight * vUv.x + uCameraUp * vUv.y - uCameraForward * z);

  vec3 surfacePos = vWorldCenter + normal * vRadius;
  vec4 reprojected = uViewProj * vec4(surfacePos, 1.0);
  float ndcZ = reprojected.z / reprojected.w;
  gl_FragDepth = clamp(ndcZ * 0.5 + 0.5, 0.0, 1.0);

  int idx = int(vMatIdx + 0.5);
  float cr = pick(uMatColorR, idx).x;
  float cg = pick(uMatColorG, idx).x;
  float cb = pick(uMatColorB, idx).x;
  float roughness = pick(uMatRoughness, idx).x;
  float opacity = pick(uMatOpacity, idx).x;
  vec3 color = vec3(cr, cg, cb);

  vec3 lightDir = normalize(uLightDir);
  vec3 viewDir = normalize(uCameraPos - surfacePos);
  float ndotl = max(dot(normal, lightDir), 0.0);
  float ndotv = max(dot(normal, viewDir), 0.0);
  vec3 halfV = normalize(lightDir + viewDir);
  float shininess = mix(96.0, 8.0, roughness);
  float spec = pow(max(dot(normal, halfV), 0.0), shininess);
  float fres = fresnelSchlick(ndotv, 0.04);

  vec3 ambient = skyGradient(normal) * 0.6;
  float wet = mix(1.0, 1.35, vContact);
  vec3 base = color * (ambient + ndotl * 1.2) * wet;
  float specStrength = mix(0.15, 0.85, 1.0 - roughness) + vContact * 0.2;
  vec3 col = base + vec3(spec) * specStrength + skyGradient(reflect(-viewDir, normal)) * fres * 0.5;

  float speedTint = clamp(vSpeed * 0.015, 0.0, 0.12);
  col += vec3(speedTint * 0.3, speedTint * 0.3, speedTint * 0.5);

  float edgeFade = 1.0 - smoothstep(0.7, 1.0, r2);
  float alpha = clamp(opacity * edgeFade, 0.0, 1.0);
  fragColor = vec4(acesTonemap(col), alpha);
}
`,be=`#version 300 es
out vec2 vUv;
void main() {
  vec2 uv = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = uv;
  vec2 pos = uv * 2.0 - 1.0;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`,xe=`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
out vec4 fragColor;
void main() {
  vec4 center = texture(uSrc, vUv);
  vec4 n = texture(uSrc, vUv + vec2(0.0, -uTexel.y));
  vec4 s = texture(uSrc, vUv + vec2(0.0, uTexel.y));
  vec4 e = texture(uSrc, vUv + vec2(uTexel.x, 0.0));
  vec4 w = texture(uSrc, vUv + vec2(-uTexel.x, 0.0));
  vec4 blur = (n + s + e + w) * 0.25;
  vec4 sharpened = center + (center - blur) * 0.35;
  fragColor = vec4(clamp(sharpened.rgb, 0.0, 1.0), 1.0);
}
`;function J(e,t,n){let r=e.createShader(t);if(e.shaderSource(r,n),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS)){let t=e.getShaderInfoLog(r);throw e.deleteShader(r),Error(`Shader compile error: `+t)}return r}function Y(e,t,n){let r=J(e,e.VERTEX_SHADER,t),i=J(e,e.FRAGMENT_SHADER,n),a=e.createProgram();if(e.attachShader(a,r),e.attachShader(a,i),e.linkProgram(a),!e.getProgramParameter(a,e.LINK_STATUS)){let t=e.getProgramInfoLog(a);throw Error(`Program link error: `+t)}return e.deleteShader(r),e.deleteShader(i),a}var Se=class{gl;canvas;sceneProgram;particleProgram;blitProgram;objects=[];colliderObjects=[];particleVao;particleInstanceBuffer;particleInstanceCapacity=0;particleScratch;fbo;fboColorTex;fboDepthRb;internalW=0;internalH=0;blitVao;constructor(e,t,n){this.canvas=e,this.gl=t,this.sceneProgram=Y(t,ge,_e),this.particleProgram=Y(t,ve,ye),this.blitProgram=Y(t,be,xe),this.particleScratch=new Float32Array(n*8),this.particleInstanceBuffer=t.createBuffer(),this.particleVao=this.buildParticleVao(),this.fbo=t.createFramebuffer(),this.fboColorTex=t.createTexture(),this.fboDepthRb=t.createRenderbuffer(),this.blitVao=t.createVertexArray(),this.buildStaticScene()}buildMeshVao(e){let t=this.gl,n=t.createVertexArray();t.bindVertexArray(n);let r=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,r),t.bufferData(t.ARRAY_BUFFER,e.vertices,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,24,0),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,3,t.FLOAT,!1,24,12);let i=t.createBuffer();return t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,i),t.bufferData(t.ELEMENT_ARRAY_BUFFER,e.indices,t.STATIC_DRAW),t.bindVertexArray(null),{vao:n,indexCount:e.indices.length}}buildParticleVao(){let e=this.gl,t=e.createVertexArray();e.bindVertexArray(t);let n=new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),r=e.createBuffer();return e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,n,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,8,0),e.vertexAttribDivisor(0,0),e.bindBuffer(e.ARRAY_BUFFER,this.particleInstanceBuffer),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,4,e.FLOAT,!1,32,0),e.vertexAttribDivisor(1,1),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,4,e.FLOAT,!1,32,16),e.vertexAttribDivisor(2,1),e.bindVertexArray(null),t}addObject(e,n,r){let{vao:i,indexCount:a}=this.buildMeshVao(e),o={vao:i,indexCount:a,model:t(),color:n,roughness:r,spin:0,baseRotY:0,posX:0,posY:0,posZ:0};return this.objects.push(o),o}buildStaticScene(){n(this.addObject(K(A[0]+.15,A[2]+.15),[.14,.14,.17,1],[.75,.3]).model);let e=A[1]*2,t=W(.035,e*.5,.035),r=[[-A[0],-A[2]],[A[0],-A[2]],[-A[0],A[2]],[A[0],A[2]]];for(let[n,i]of r){let r=this.addObject(t,[.55,.58,.63,1],[.35,.6]);a(r.model,[n,e*.5,i]),r.posX=n,r.posY=e*.5,r.posZ=i}}setColliders(e){for(let e of this.colliderObjects)this.objects=this.objects.filter(t=>t!==e);this.colliderObjects=[];for(let t of e){let e=t.kind===`sphere`?G(t.size[0]):W(t.size[0],t.size[1],t.size[2]),n=this.addObject(e,[t.color[0],t.color[1],t.color[2],1],[.4,.5]);o(n.model,[0,Math.sin(t.rotationY/2),0,Math.cos(t.rotationY/2)],[t.position[0],t.position[1],t.position[2]]),n.spin=t.spinSpeed,n.baseRotY=t.rotationY,n.posX=t.position[0],n.posY=t.position[1],n.posZ=t.position[2],this.colliderObjects.push(n)}}ensureTargets(e,t){let n=this.gl,r=Math.max(1,Math.floor(e)),i=Math.max(1,Math.floor(t));(r!==this.internalW||i!==this.internalH)&&(this.internalW=r,this.internalH=i,n.bindTexture(n.TEXTURE_2D,this.fboColorTex),n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,r,i,0,n.RGBA,n.UNSIGNED_BYTE,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindRenderbuffer(n.RENDERBUFFER,this.fboDepthRb),n.renderbufferStorage(n.RENDERBUFFER,n.DEPTH_COMPONENT24,r,i),n.bindFramebuffer(n.FRAMEBUFFER,this.fbo),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,this.fboColorTex,0),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.RENDERBUFFER,this.fboDepthRb),n.bindFramebuffer(n.FRAMEBUFFER,null))}render(e){let n=this.gl,r=this.canvas.getBoundingClientRect(),a=Math.min(window.devicePixelRatio||1,2),s=Math.max(1,Math.round(r.width*a)),c=Math.max(1,Math.round(r.height*a));(this.canvas.width!==s||this.canvas.height!==c)&&(this.canvas.width=s,this.canvas.height=c),this.ensureTargets(s*e.renderScale,c*e.renderScale);let l=s/c,h=e.camera.projMatrixNegOneToOne(l),g=e.camera.viewMatrix(),_=t();i(_,h,g);let v=e.camera.eye,y=u();f(y,e.camera.target,v),p(y,y);let b=u();m(b,y,[0,1,0]),p(b,b);let x=u();m(x,b,y),p(x,x);let S=d(.45,.82,.3);p(S,S),n.bindFramebuffer(n.FRAMEBUFFER,this.fbo),n.viewport(0,0,this.internalW,this.internalH),n.enable(n.DEPTH_TEST),n.depthFunc(n.LESS),n.disable(n.BLEND),n.clearColor(.03,.035,.05,1),n.clear(n.COLOR_BUFFER_BIT|n.DEPTH_BUFFER_BIT);for(let t of this.colliderObjects)if(t.spin!==0){let n=t.baseRotY+t.spin*e.time;o(t.model,[0,Math.sin(n/2),0,Math.cos(n/2)],[t.posX,t.posY,t.posZ])}n.useProgram(this.sceneProgram);let C=this.sceneProgram;n.uniformMatrix4fv(n.getUniformLocation(C,`uViewProj`),!1,_),n.uniform3f(n.getUniformLocation(C,`uCameraPos`),v[0],v[1],v[2]),n.uniform3f(n.getUniformLocation(C,`uLightDir`),S[0],S[1],S[2]);for(let e of this.objects)n.uniformMatrix4fv(n.getUniformLocation(C,`uModel`),!1,e.model),n.uniform4f(n.getUniformLocation(C,`uColor`),e.color[0],e.color[1],e.color[2],e.color[3]),n.uniform2f(n.getUniformLocation(C,`uRoughness`),e.roughness[0],e.roughness[1]),n.bindVertexArray(e.vao),n.drawElements(n.TRIANGLES,e.indexCount,n.UNSIGNED_SHORT,0);n.bindVertexArray(null),(e.viewMode===`particles`||e.viewMode===`both`)&&e.solver.activeCount>0&&this.renderParticles(e.solver,_,b,x,y,S,v),n.bindFramebuffer(n.FRAMEBUFFER,null),n.viewport(0,0,s,c),n.disable(n.DEPTH_TEST),n.disable(n.BLEND),n.clearColor(0,0,0,1),n.clear(n.COLOR_BUFFER_BIT),n.useProgram(this.blitProgram),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,this.fboColorTex),n.uniform1i(n.getUniformLocation(this.blitProgram,`uSrc`),0),n.uniform2f(n.getUniformLocation(this.blitProgram,`uTexel`),1/this.internalW,1/this.internalH),n.bindVertexArray(this.blitVao),n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null)}renderParticles(e,t,n,r,i,a,o){let s=this.gl,c=e.activeCount;c>this.particleInstanceCapacity&&(this.particleInstanceCapacity=c);let l=this.particleScratch;for(let t=0;t<c;t++){let n=t*8;l[n+0]=e.posX[t],l[n+1]=e.posY[t],l[n+2]=e.posZ[t],l[n+3]=e.matIdx[t],l[n+4]=Math.hypot(e.velX[t],e.velY[t],e.velZ[t]),l[n+5]=e.contact[t],l[n+6]=0,l[n+7]=0}s.bindBuffer(s.ARRAY_BUFFER,this.particleInstanceBuffer),s.bufferData(s.ARRAY_BUFFER,l.subarray(0,c*8),s.DYNAMIC_DRAW),s.enable(s.DEPTH_TEST),s.enable(s.BLEND),s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA),s.useProgram(this.particleProgram);let u=this.particleProgram;s.uniformMatrix4fv(s.getUniformLocation(u,`uViewProj`),!1,t),s.uniform3f(s.getUniformLocation(u,`uCameraRight`),n[0],n[1],n[2]),s.uniform3f(s.getUniformLocation(u,`uCameraUp`),r[0],r[1],r[2]),s.uniform3f(s.getUniformLocation(u,`uCameraForward`),i[0],i[1],i[2]),s.uniform3f(s.getUniformLocation(u,`uCameraPos`),o[0],o[1],o[2]),s.uniform3f(s.getUniformLocation(u,`uLightDir`),a[0],a[1],a[2]);let d=T.map(e=>w[e].particleRadius);s.uniform4f(s.getUniformLocation(u,`uMatRadius`),d[0],d[1],d[2],d[3]);let f=T.map(e=>w[e].color[0]),p=T.map(e=>w[e].color[1]),m=T.map(e=>w[e].color[2]),h=T.map(e=>w[e].roughness);s.uniform4f(s.getUniformLocation(u,`uMatColorR`),f[0],f[1],f[2],f[3]),s.uniform4f(s.getUniformLocation(u,`uMatColorG`),p[0],p[1],p[2],p[3]),s.uniform4f(s.getUniformLocation(u,`uMatColorB`),m[0],m[1],m[2],m[3]),s.uniform4f(s.getUniformLocation(u,`uMatRoughness`),h[0],h[1],h[2],h[3]);let g=T.map(e=>D(w[e]));s.uniform4f(s.getUniformLocation(u,`uMatOpacity`),g[0],g[1],g[2],g[3]),s.bindVertexArray(this.particleVao),s.drawArraysInstanced(s.TRIANGLES,0,6,c),s.bindVertexArray(null),s.disable(s.BLEND)}},X=[0,3.15,0];function Z(e){let t=document.createElement(`canvas`);return t.id=`fluid-canvas`,e.appendChild(t),t}function Q(e,t){let n=document.createElement(`div`);return n.className=`boot-overlay`,n.textContent=t,e.appendChild(n),n}async function Ce(e){await we(e)||Te(e)||Q(e,`This browser supports neither WebGPU nor WebGL2 — please use an up-to-date Chrome, Edge or Firefox.`)}async function we(e){if(!(`gpu`in navigator))return!1;try{let t=navigator.gpu,n=await t.requestAdapter();if(!n)return!1;let r=await n.requestDevice(),i=Z(e),a=i.getContext(`webgpu`);if(!a)return!1;let o=t.getPreferredCanvasFormat();a.configure({device:r,format:o,alphaMode:`opaque`});let s=b.ultra.maxParticles,c=new R(r,s),l=j();c.setColliders(l);let u=new he(i,r,a,o);u.setColliders(l),u.setParticleSource(c);let d=new h(i),f=new C(b),p=`water`,m=!1,g=new k(e,{onMaterialChange:e=>p=e,onPourChange:e=>m=e,onBurst:()=>{let e=f.settings.maxParticles;c.spawn({material:p,origin:X,spread:.55,count:Math.min(6e3,e),initialVelocity:[0,-2.2,0]},e)},onReset:()=>c.reset(),onQualityChange:e=>f.setMode(e),onBackendHint:()=>`WebGPU compute SPH · up to `+s.toLocaleString()+` particles`});r.lost.then(t=>{Q(e,`WebGPU device was lost (`+t.message+`). Please reload.`)});let _=performance.now(),v=()=>{let e=performance.now(),t=Math.min(e-_,1e3/24);_=e,f.update(t);let n=f.settings;c.setActiveBudget(n.maxParticles),m&&c.spawn({material:p,origin:X,spread:.14,count:48,initialVelocity:[0,-1.6,0]},n.maxParticles);let r=n.tier===`potato`||n.tier===`low`?1:n.tier===`medium`?2:3;c.step(Math.min(t/1e3,1/30),r),u.render({camera:d,renderScale:n.renderScale,viewMode:`particles`,activeCount:c.activeCount,time:c.simTime}),g.setStats(f.fps,n.tier,n.renderScale,c.activeCount,n.maxParticles),requestAnimationFrame(v)};return requestAnimationFrame(v),!0}catch(t){return console.warn(`WebGPU init failed, falling back:`,t),e.querySelectorAll(`canvas, .hud`).forEach(e=>e.remove()),!1}}function Te(e){try{let t=Z(e),n=t.getContext(`webgl2`,{antialias:!1,depth:!0,alpha:!1});if(!n)return!1;let r=S.ultra.maxParticles,i=new le(r),a=j();i.setColliders(a);let o=new Se(t,n,r);o.setColliders(a);let s=new h(t),c=new C(S),l=`water`,u=!1,d=new k(e,{onMaterialChange:e=>l=e,onPourChange:e=>u=e,onBurst:()=>{let e=c.settings.maxParticles;i.spawn({material:l,origin:X,spread:.5,count:Math.min(600,e),initialVelocity:[0,-2,0]},e)},onReset:()=>i.reset(),onQualityChange:e=>c.setMode(e),onBackendHint:()=>`WebGL2 CPU SPH fallback · up to `+r.toLocaleString()+` particles`}),f=performance.now(),p=()=>{let e=performance.now(),t=Math.min(e-f,50);f=e,c.update(t);let n=c.settings;i.setActiveBudget(n.maxParticles),u&&i.spawn({material:l,origin:X,spread:.12,count:6,initialVelocity:[0,-1.5,0]},n.maxParticles),i.step(Math.min(t/1e3,1/24),1),o.render({camera:s,renderScale:n.renderScale,viewMode:`particles`,solver:i,time:i.simTime}),d.setStats(c.fps,n.tier,n.renderScale,i.activeCount,n.maxParticles),requestAnimationFrame(p)};return requestAnimationFrame(p),!0}catch(t){return console.warn(`WebGL2 init failed:`,t),e.querySelectorAll(`canvas, .hud`).forEach(e=>e.remove()),!1}}var $=document.querySelector(`#app`);if(!$)throw Error(`Missing #app root element`);Ce($);