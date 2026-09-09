/* ════════════════════════════════════════════════════════════════════════════════════════════
   GEOMETRY / OBJECT INSTRUMENT
   Shared by cubes, spheres, cylinders, tori and planes. The object itself is the orientation
   control; a plan plot places it; a material laboratory exposes the BRDF instead of two sliders.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { el, colorChip } from '../kit.js';
import { tape, stepper, pillToggle } from './controls.js';
import { ic } from '../icons.js';
import { typeOf } from '../world.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rgb=c=>{const n=parseInt((c||'#c9ccd1').slice(1),16);return[n>>16&255,n>>8&255,n&255]};
const css=(c,a=1)=>`rgba(${c.map(Math.round).join(',')},${a})`;
const lum=c=>{const [r,g,b]=rgb(c).map(v=>v/255);return .2126*r+.7152*g+.0722*b};

export function geometryPanel(node,ctx){
  const {compact=false,setProp,register}=ctx,P=node.props,T=typeOf(node);const host=el('div','mpanel geopanel');
  const pos=()=>P.pos||[0,0,0],rot=()=>P.rot||[0,0,0],scale=()=>P.scale||[1,1,1];
  const canvas=(cv,h)=>{const w=cv.clientWidth||290,d=Math.min(devicePixelRatio||1,2);if(cv.width!==w*d||cv.height!==h*d){cv.width=w*d;cv.height=h*d}cv.style.height=h+'px';const g=cv.getContext('2d');g.setTransform(d,0,0,d,0,0);return[g,w,h]};
  const shapePath=(g,type,r)=>{
    if(type==='sphere'){g.beginPath();g.arc(0,0,r,0,Math.PI*2);return}
    if(type==='torus'){g.beginPath();g.ellipse(0,0,r,r*.42,0,0,Math.PI*2);g.ellipse(0,0,r*.46,r*.17,0,0,Math.PI*2,true);return}
    if(type==='cylinder'){g.beginPath();g.ellipse(0,-r*.55,r*.65,r*.22,0,Math.PI,Math.PI*2);g.lineTo(r*.65,r*.55);g.ellipse(0,r*.55,r*.65,r*.22,0,0,Math.PI);g.closePath();return}
    if(type==='plane'){g.beginPath();g.moveTo(-r,-r*.35);g.lineTo(r*.55,-r*.65);g.lineTo(r,r*.35);g.lineTo(-r*.55,r*.65);g.closePath();return}
    g.beginPath();g.moveTo(-r*.72,-r*.52);g.lineTo(r*.28,-r*.75);g.lineTo(r*.76,-r*.36);g.lineTo(r*.72,r*.58);g.lineTo(-r*.28,r*.76);g.lineTo(-r*.76,r*.38);g.closePath();
  };

  /* hero: object turntable */
  const hero=el('div','pcard mp-hero ge-hero'),heroCv=el('canvas');heroCv.title='Drag the object to orient it';const cap=el('div','mp-cap',`<div class="l"><b>${T.label}</b><span class="mp-illum ge-sub">OBJECT SPACE</span></div><div class="r">DRAG TO ORIENT</div>`);hero.append(heroCv,cap);host.append(hero);let drag=null;
  function paintHero(){const[g,w,h]=canvas(heroCv,compact?142:170),c=rgb(P.color),e=rgb(P.emissive);g.clearRect(0,0,w,h);const bg=g.createRadialGradient(w*.5,h*.44,2,w*.5,h*.44,w*.7);bg.addColorStop(0,'#25282c');bg.addColorStop(1,'#060607');g.fillStyle=bg;g.fillRect(0,0,w,h);
    const floor=h*.77;g.strokeStyle='rgba(255,255,255,.07)';for(let i=-8;i<=8;i++){g.beginPath();g.moveTo(w/2+i*18,floor);g.lineTo(w/2+i*42,h);g.stroke()}for(let i=0;i<6;i++){const y=floor+(h-floor)*i*i/25;g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}
    g.save();g.translate(w/2,h*.46);g.rotate((rot()[2]+rot()[1]*.22)*Math.PI/180);const sx=clamp(scale()[0]/Math.max(...scale()),.2,1),sy=clamp(scale()[1]/Math.max(...scale()),.2,1);g.scale(sx,sy);shapePath(g,node.type,47);
    const grad=g.createLinearGradient(-40,-45,38,45);grad.addColorStop(0,css(c.map(v=>Math.min(255,v*1.5))));grad.addColorStop(.55,css(c));grad.addColorStop(1,css(c.map(v=>v*.25)));g.fillStyle=grad;g.shadowColor=css(e,(P.emissiveStrength||0)/5);g.shadowBlur=(P.emissiveStrength||0)*8;g.fill('evenodd');g.shadowBlur=0;g.strokeStyle='rgba(255,255,255,.58)';g.stroke();
    if(node.type==='cube'){g.strokeStyle='rgba(255,255,255,.22)';g.beginPath();g.moveTo(-34,-25);g.lineTo(-14,-3);g.lineTo(36,-16);g.moveTo(-14,-3);g.lineTo(-14,36);g.stroke()}g.restore();
    g.fillStyle='rgba(255,255,255,.3)';g.font='8px ui-sans-serif,system-ui';g.textAlign='left';g.fillText(`RX ${rot()[0].toFixed(0)}°`,9,13);g.textAlign='center';g.fillText(`RY ${rot()[1].toFixed(0)}°`,w/2,13);g.textAlign='right';g.fillText(`RZ ${rot()[2].toFixed(0)}°`,w-9,13);
    g.strokeStyle='rgba(239,83,80,.7)';g.beginPath();g.moveTo(15,h-13);g.lineTo(31,h-13);g.stroke();g.strokeStyle='rgba(105,208,109,.7)';g.beginPath();g.moveTo(15,h-13);g.lineTo(15,h-29);g.stroke();g.fillStyle='rgba(255,255,255,.3)';g.textAlign='left';g.fillText('X',34,h-10);g.fillText('Y',12,h-32);
  }
  const orient=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;setProp(node,'rot',[clamp(drag.r[0]-dy*.7,-180,180),((drag.r[1]+dx*.7+180)%360)-180,drag.r[2]]);paintAll()};
  heroCv.onpointerdown=e=>{heroCv.setPointerCapture(e.pointerId);heroCv.classList.add('grabbing');drag={x:e.clientX,y:e.clientY,r:[...rot()]}};heroCv.onpointermove=orient;heroCv.onpointerup=()=>{drag=null;heroCv.classList.remove('grabbing')};

  /* metrics */
  const rail=el('div','mp-rail');const metric=k=>{const e=el('div','mp-pill',`<b class="v">—</b><span class="k">${k}</span>`);rail.append(e);return e.querySelector('.v')};const rx=metric('World X'),ry=metric('World Y'),rz=metric('World Z'),rv=metric('Volume');host.append(rail);

  /* placement */
  const pc=el('div','pcard mp-light ge-place');pc.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Placement</span><span class="s">World plan · X / Z</span></div></div>`;const pb=el('div','pbody');pc.append(pb);const plan=el('div','mp-meter ge-plan','<div class="hd"><span class="k">coordinate deck · ±20 m</span></div>'),planCv=el('canvas');plan.append(planCv);pb.append(plan);
  const yTape=tape({label:'Elevation Y',min:-10,max:20,value:pos()[1],dec:2,step:.05,unit:'m',marks:[{t:0,l:'−10 m'},{t:1/3,l:'DATUM 0'},{t:1,l:'+20 m'}],onInput:v=>{setProp(node,'pos',[pos()[0],v,pos()[2]]);paintAll()}});pb.append(yTape);
  const xyz=el('div','ge-steppers');['X','Y','Z'].forEach((k,i)=>{const r=el('div','ge-axis',`<span class="${k.toLowerCase()}">${k}</span>`);const st=stepper({value:pos()[i],min:-999,max:999,dec:2,step:.05,unit:'m',onInput:v=>{const p=[...pos()];p[i]=v;setProp(node,'pos',p);paintAll()}});r.append(st);r._step=st;xyz.append(r)});pb.append(xyz);host.append(pc);pc.querySelector('.mp-chead .l').onclick=()=>pc.classList.toggle('shut');
  function paintPlan(){const[g,w,h]=canvas(planCv,126),pad=9,cx=w/2,cy=h/2,span=Math.min(w-18,h-18);g.clearRect(0,0,w,h);g.fillStyle='#050505';g.fillRect(0,0,w,h);for(let i=-4;i<=4;i++){const x=cx+i*span/8,y=cy+i*span/8;g.strokeStyle=i?'rgba(255,255,255,.06)':'rgba(255,255,255,.20)';g.beginPath();g.moveTo(x,pad);g.lineTo(x,h-pad);g.moveTo(cx-span/2,y);g.lineTo(cx+span/2,y);g.stroke()}const x=cx+clamp(pos()[0]/20,-1,1)*span/2,y=cy+clamp(pos()[2]/20,-1,1)*span/2;g.strokeStyle='rgba(255,255,255,.7)';g.beginPath();g.arc(x,y,8,0,Math.PI*2);g.stroke();g.fillStyle=T.color;g.beginPath();g.arc(x,y,3,0,Math.PI*2);g.fill();g.font='8px ui-sans-serif,system-ui';g.fillStyle='rgba(255,255,255,.3)';g.textAlign='left';g.fillText('−X',cx-span/2,pad+8);g.textAlign='right';g.fillText('+X',cx+span/2,pad+8);g.fillText('+Z',cx+span/2,h-pad)}
  const placeFrom=e=>{const r=planCv.getBoundingClientRect(),span=Math.min(r.width-18,r.height-18),x=clamp((e.clientX-r.left-r.width/2)/(span/2),-1,1)*20,z=clamp((e.clientY-r.top-r.height/2)/(span/2),-1,1)*20;setProp(node,'pos',[+x.toFixed(2),pos()[1],+z.toFixed(2)]);paintAll()};planCv.onpointerdown=e=>{planCv.setPointerCapture(e.pointerId);planCv.classList.add('drag');placeFrom(e)};planCv.onpointermove=e=>{if(planCv.hasPointerCapture?.(e.pointerId))placeFrom(e)};planCv.onpointerup=e=>{planCv.releasePointerCapture?.(e.pointerId);planCv.classList.remove('drag')};

  /* orientation & dimensions: numbers are steppers; the hero is the continuous control */
  const oc=el('div','pcard mp-light ge-form');oc.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Form</span><span class="s">Attitude · dimensions</span></div></div>`;const ob=el('div','pbody');oc.append(ob);
  const heading=el('div','mp-subhead','<span class="k">orientation matrix · drag object above</span>');ob.append(heading);const rsteps=el('div','ge-steppers');['X','Y','Z'].forEach((k,i)=>{const r=el('div','ge-axis',`<span class="${k.toLowerCase()}">R${k}</span>`),st=stepper({value:rot()[i],min:-180,max:180,dec:1,step:1,unit:'°',onInput:v=>{const p=[...rot()];p[i]=v;setProp(node,'rot',p);paintAll()}});r.append(st);r._step=st;rsteps.append(r)});ob.append(rsteps);
  const dims=el('div','mp-subhead','<span class="k">axis scale</span>');ob.append(dims);const ssteps=el('div','ge-steppers');['X','Y','Z'].forEach((k,i)=>{const r=el('div','ge-axis',`<span class="${k.toLowerCase()}">${k}</span>`),st=stepper({value:scale()[i],min:.01,max:100,dec:2,step:.02,unit:'×',onInput:v=>{const p=[...scale()];p[i]=v;setProp(node,'scale',p);paintAll()}});r.append(st);r._step=st;ssteps.append(r)});ob.append(ssteps);host.append(oc);oc.querySelector('.mp-chead .l').onclick=()=>oc.classList.toggle('shut');

  /* material lab */
  const mc=el('div','pcard mp-light ge-mat');mc.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Surface laboratory</span><span class="s">BRDF response · drag the sample</span></div></div>`;const mb=el('div','pbody'),lab=el('div','mp-meter ge-lab','<div class="hd"><span class="k">roughness ↑ · metallic →</span></div>'),labCv=el('canvas');lab.append(labCv);mb.append(lab);mc.append(mb);
  const swatches=el('div','ge-colours');const ah=el('div','mp-subhead','<span class="k">albedo</span>'),ac=colorChip(P.color,v=>{setProp(node,'color',v);paintAll()});ah.append(ac);const eh=el('div','mp-subhead','<span class="k">emissive</span>'),ec=colorChip(P.emissive,v=>{setProp(node,'emissive',v);paintAll()});eh.append(ec);swatches.append(ah,eh);mb.append(swatches);
  const em=tape({label:'Emission',min:0,max:12,value:P.emissiveStrength||0,dec:2,step:.05,unit:'×',marks:[{t:0,l:'OFF'},{t:.2,l:'GLOW'},{t:1,l:'12×'}],onInput:v=>{setProp(node,'emissiveStrength',v);paintAll()}});mb.append(em);const tags=el('div','mp-tags'),shadow=pillToggle('CAST SHADOW',P.castShadow!==false,v=>{setProp(node,'castShadow',v);paintAll()});tags.append(shadow);mb.append(tags);host.append(mc);mc.querySelector('.mp-chead .l').onclick=()=>mc.classList.toggle('shut');
  function paintLab(){const[g,w,h]=canvas(labCv,112),c=rgb(P.color),mx=P.metalness||0,rough=P.roughness??.45;g.clearRect(0,0,w,h);g.fillStyle='#050505';g.fillRect(0,0,w,h);for(let x=0;x<w;x+=3){const m=x/w;for(let y=0;y<h;y+=3){const r=1-y/h,dx=(m-mx),dy=(r-rough),spot=Math.exp(-(dx*dx/(.003+rough*.05)+dy*dy/(.005+rough*.08)));const base=c.map(v=>v*(.15+.45*(1-r))*(1-m*.35)),white=[235,240,248];const out=base.map((v,i)=>v+(white[i]*(.3+.7*m)-v)*spot);g.fillStyle=css(out);g.fillRect(x,y,3.2,3.2)}}const x=mx*w,y=(1-rough)*h;g.strokeStyle='#fff';g.beginPath();g.arc(x,y,6,0,Math.PI*2);g.stroke();g.fillStyle='rgba(255,255,255,.35)';g.font='8px ui-sans-serif,system-ui';g.textAlign='left';g.fillText('DIELECTRIC',7,h-6);g.textAlign='right';g.fillText('METAL',w-7,h-6)}
  const matFrom=e=>{const r=labCv.getBoundingClientRect();setProp(node,'metalness',+clamp((e.clientX-r.left)/r.width,0,1).toFixed(2));setProp(node,'roughness',+clamp(1-(e.clientY-r.top)/r.height,0,1).toFixed(2));paintAll()};labCv.onpointerdown=e=>{labCv.setPointerCapture(e.pointerId);labCv.classList.add('drag');matFrom(e)};labCv.onpointermove=e=>{if(labCv.hasPointerCapture?.(e.pointerId))matFrom(e)};labCv.onpointerup=e=>{labCv.releasePointerCapture?.(e.pointerId);labCv.classList.remove('drag')};

  function paintAll(){paintHero();paintPlan();paintLab();const p=pos(),s=scale();rx.innerHTML=`${p[0].toFixed(1)}<em>m</em>`;ry.innerHTML=`${p[1].toFixed(1)}<em>m</em>`;rz.innerHTML=`${p[2].toFixed(1)}<em>m</em>`;rv.innerHTML=`${(s[0]*s[1]*s[2]).toFixed(2)}<em>×</em>`;[...xyz.children].forEach((r,i)=>r._step._set(p[i]));[...rsteps.children].forEach((r,i)=>r._step._set(rot()[i]));[...ssteps.children].forEach((r,i)=>r._step._set(s[i]));yTape._set(p[1]);em._set(P.emissiveStrength||0);ac._set?.(P.color);ec._set?.(P.emissive);shadow._set(P.castShadow!==false);cap.querySelector('.ge-sub').textContent=`${s.map(v=>v.toFixed(2)).join(' × ')} · ${lum(P.color)>.65?'LIGHT':'DARK'} ALBEDO`;}
  register?.(paintAll);const ro=new ResizeObserver(()=>{paintHero();paintPlan();paintLab();yTape._paint?.();em._paint?.()});ro.observe(host);host._dispose=()=>ro.disconnect();requestAnimationFrame(paintAll);paintAll();return host;
}
