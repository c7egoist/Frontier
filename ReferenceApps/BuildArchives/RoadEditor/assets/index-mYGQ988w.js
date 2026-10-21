(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&n(o)}).observe(document,{childList:!0,subtree:!0});function e(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(s){if(s.ep)return;s.ep=!0;const r=e(s);fetch(s.href,r)}})();const Ol="frontier-road-editor/autosave-v1",ma=120;function Sn(i,t,e){const n=i.roads.find(r=>r.id===t);if(!n||!n.points.length)return null;const s=e===0?"start":e===n.points.length-1?"end":null;if(!s||n.closed)return null;for(const r of i.junctions||[])if((r.links||[]).some(o=>o.road===t&&o.end===s))return r;return null}function Pe(i,t){return t.points.map((e,n)=>{const s=Sn(i,t.id,n);return s?{...e,x:s.x,z:s.z,y:s.y}:e})}function Ji(i,t,e,n,s,r){const o=i.roads.find(c=>c.id===t);if(!o||!o.points[e])return!1;const a=Sn(i,t,e);if(a)return n!==void 0&&(a.x=n),s!==void 0&&(a.z=s),r!==void 0&&(a.y=r),!0;const l=o.points[e];return n!==void 0&&(l.x=n),s!==void 0&&(l.z=s),r!==void 0&&(l.y=r),!0}function At(i,t){return(i.roads||[]).find(e=>e.id===t)||null}const ga=i=>JSON.parse(JSON.stringify(i));function Gc(i){let t=ga(i),e={kind:null,roadId:null,index:-1,junctionId:null},n="select",s="plan",r={snapGrid:!0,gridSize:1,snapNode:!0,showIssues:!0,wireframe:!1,autoRotate:!1},o=null;const a=[],l=[];let c=JSON.stringify(t),u=null;const h=new Set,g=()=>JSON.stringify(t),p={get project(){return t},get selection(){return e},get tool(){return n},get view(){return s},get ui(){return r},get flash(){return o},get dirty(){return g()!==c},subscribe(m){return h.add(m),()=>h.delete(m)},notify(m="project"){for(const x of h)try{x(m,p)}catch(f){console.error(f)}},commit(m,x){a.push({label:m,snapshot:g()}),a.length>ma&&a.shift(),l.length=0,x(t),p.notify("project")},checkpoint(m){a.push({label:m,snapshot:g()}),a.length>ma&&a.shift(),l.length=0},transient(m){m(t),p.notify("project-live")},endGesture(){const m=a[a.length-1];m&&m.snapshot===g()&&a.pop(),p.notify("project")},undo(){if(!a.length)return null;l.push({snapshot:g()});const{label:m,snapshot:x}=a.pop();return t=JSON.parse(x),p.clampSelection(),p.notify("project"),m},redo(){return l.length?(a.push({label:"redo",snapshot:g()}),t=JSON.parse(l.pop().snapshot),p.clampSelection(),p.notify("project"),!0):null},canUndo(){return a.length>0},canRedo(){return l.length>0},undoLabel(){return a.length?a[a.length-1].label:null},select(m){e={kind:null,roadId:null,index:-1,junctionId:null,...m},p.clampSelection(),p.notify("selection")},clampSelection(){if(e.roadId&&!At(t,e.roadId))e={kind:null,roadId:null,index:-1,junctionId:null};else if(e.kind==="point"){const m=At(t,e.roadId);(!m||e.index<0||e.index>=m.points.length)&&(e=e.roadId?{kind:"road",roadId:e.roadId,index:-1,junctionId:null}:{kind:null,roadId:null,index:-1,junctionId:null})}else e.kind==="junction"&&((t.junctions||[]).some(m=>m.id===e.junctionId)||(e={kind:null,roadId:null,index:-1,junctionId:null}))},setTool(m){n!==m&&(n=m,p.notify("tool"))},setView(m){s!==m&&(s=m,p.notify("view"))},setUI(m){r={...r,...m},p.notify("ui")},ping(m,x){o={x:m,z:x,until:performance.now()+1600},p.notify("flash"),setTimeout(()=>{o=null,p.notify("flash")},1650)},loadProject(m,{resetHistory:x=!0}={}){t=ga(m),x&&(a.length=0,l.length=0),e={kind:null,roadId:null,index:-1,junctionId:null},c=g(),u=Date.now(),p.notify("project"),p.notify("selection")},markSaved(){c=g(),u=Date.now(),p.notify("saved")},get savedAt(){return u},autosave(){try{return typeof localStorage>"u"?!1:(localStorage.setItem(Ol,JSON.stringify({at:Date.now(),project:t})),!0)}catch{return!1}}};return p}function Vc(){try{if(typeof localStorage>"u")return null;const i=localStorage.getItem(Ol);if(!i)return null;const t=JSON.parse(i);return!t||!t.project||!Array.isArray(t.project.roads)?null:t}catch{return null}}const on=1e-9;function Wc(i,t=1e-6){const e=[];for(const n of i||[]){const s={x:+n.x||0,z:+n.z||0,y:+n.y||0,w:n.w==null?1:+n.w||0},r=e[e.length-1];r&&Math.abs(r.x-s.x)<t&&Math.abs(r.z-s.z)<t&&Math.abs(r.y-s.y)<t||e.push(s)}if(e.length>2){const n=e[0],s=e[e.length-1];Math.abs(n.x-s.x)<t&&Math.abs(n.z-s.z)<t&&Math.abs(n.y-s.y)<t&&e.pop()}return e}function Xc(i,t,e,n,s){const r=(d,A)=>Math.pow(Math.max(on,Math.hypot(A.x-d.x,A.z-d.z,(A.y-d.y)*.35)),.5),a=0+r(i,t),l=a+r(t,e),c=l+r(e,n),u=a+s*(l-a),h=(d,A,P,v)=>{const C=v-P;if(Math.abs(C)<on)return{x:d.x,z:d.z,y:d.y,w:d.w};const E=(u-P)/C;return{x:d.x+(A.x-d.x)*E,z:d.z+(A.z-d.z)*E,y:d.y+(A.y-d.y)*E,w:d.w+(A.w-d.w)*E}},g=h(i,t,0,a),p=h(t,e,a,l),m=h(e,n,l,c),x=h(g,p,0,l),f=h(p,m,a,c);return h(x,f,a,l)}function jc(i,t){return(Math.atan2(i,-t)*180/Math.PI+360)%360}function _a(i,t=1){if(t<=0)return i.slice();const e=i.length,n=new Array(e);for(let s=0;s<e;s++){let r=0,o=0;for(let a=-t;a<=t;a++){const l=s+a;l>=0&&l<e&&(r+=i[l],o++)}n[s]=r/o}return n}function Hi(i,{closed:t=!1,step:e=1}={}){const n={samples:[],length:0,count:0,closed:!!t},s=Wc(i);if(s.length<2)return n;const r=[],o=s.length,a=t?o:o-1,l=16;for(let _=0;_<a;_++){const S=s[_%o],N=s[(_+1)%o],B=t?s[(_-1+o)%o]:s[Math.max(0,_-1)],k=t?s[(_+2)%o]:s[Math.min(o-1,_+2)];for(let F=0;F<l;F++)r.push(Xc(B,S,N,k,F/l))}t||r.push({...s[o-1]});const c=new Array(r.length);let u=0;c[0]=0;for(let _=1;_<r.length;_++)u+=Math.hypot(r[_].x-r[_-1].x,r[_].z-r[_-1].z),c[_]=u;if(t&&(u+=Math.hypot(r[0].x-r[r.length-1].x,r[0].z-r[r.length-1].z)),!(u>on))return n;const h=Math.max(.1,e),g=Math.max(2,Math.round(u/h)+(t?0:1)),p=u/(t?g:g-1),m=[];let x=0;const f=_=>{if(!t&&_>=u)return{...r[r.length-1],s:u};let S=t?(_%u+u)%u:Math.min(_,u);for(;x<r.length-2&&c[x+1]<S;)x++;for(;x>0&&c[x]>S;)x--;const N=c[x];let B,k=r[x],F;if(x+1<r.length)B=c[x+1],F=r[x+1];else if(t)B=u,F=r[0];else return{...k,s:u};const G=B-N<on?0:(S-N)/(B-N);return{x:k.x+(F.x-k.x)*G,z:k.z+(F.z-k.z)*G,y:k.y+(F.y-k.y)*G,w:k.w+(F.w-k.w)*G,s:S}};for(let _=0;_<g;_++)m.push(f(_*p));const d=m.length,A=_=>t?(_%d+d)%d:Math.min(d-1,Math.max(0,_)),P=new Array(d).fill(0),v=new Array(d).fill(0);for(let _=0;_<d;_++){const S=m[A(_-1)],N=m[A(_+1)];let B=N.x-S.x,k=N.z-S.z;const F=Math.hypot(B,k);if(F<on){const G=m[_],H=m[A(_+1)];B=H.x-G.x,k=H.z-G.z;const $=Math.hypot(B,k)||1;B/=$,k/=$}else B/=F,k/=F;m[_].tx=B,m[_].tz=k,m[_].hdg=jc(B,k),v[_]=F<on?0:(N.y-S.y)/F}for(let _=0;_<d;_++){const S=m[A(_-1)],N=m[A(_+1)],B=Math.atan2(S.tx*N.tz-S.tz*N.tx,S.tx*N.tx+S.tz*N.tz),k=t||_>0&&_<d-1?Math.hypot(N.x-S.x,N.z-S.z):Math.max(on,p);P[_]=Math.abs(B)/Math.max(on,k)}const C=_a(P,1),E=_a(v,1);let T=1/0,L=0;for(let _=0;_<d;_++)m[_].curve=C[_],m[_].radius=C[_]<1e-6?1/0:1/C[_],m[_].grade=E[_],Number.isFinite(m[_].radius)&&(T=Math.min(T,m[_].radius)),L=Math.max(L,Math.abs(E[_]));return{samples:m,length:u,count:d,closed:!!t,minRadius:T,maxGrade:L}}function Si(i,t,e,n,s,r){const o=s-e,a=r-n,l=o*o+a*a;let c=l<on?0:((i-e)*o+(t-n)*a)/l;return c=Math.min(1,Math.max(0,c)),{d:Math.hypot(i-(e+o*c),t-(n+a*c)),t:c}}function zl(i,t,e,n,s=0){const r=t.x-i.x,o=t.z-i.z,a=n.x-e.x,l=n.z-e.z,c=r*l-o*a;if(Math.abs(c)<on)return null;const u=((e.x-i.x)*l-(e.z-i.z)*a)/c,h=((e.x-i.x)*o-(e.z-i.z)*r)/c;if(u>-s&&u<1+s&&h>-s&&h<1+s){const g=Math.min(1,Math.max(0,u));return{x:i.x+r*g,z:i.z+o*g,t:u,u:h}}return null}const ke={gateY:1.5,touchXZ:.8,weldGuard:1,mergeDist:2.5,bendDeg:15,mergeDeg:35,selfGap:2},Vr=(i,t=1)=>Math.max(1.5,(i.lanes*i.laneWidth+i.shoulderL+i.shoulderR)*(t||1)/2);function _e(i,t){if(!i.length)return null;if(t<=i[0].s)return i[0];if(t>=i[i.length-1].s)return i[i.length-1];let e=0,n=i.length-1;for(;n-e>1;){const u=e+n>>1;i[u].s<t?e=u:n=u}const s=i[e],r=i[n],o=(t-s.s)/Math.max(1e-9,r.s-s.s);let a=(s.tx||0)+((r.tx||0)-(s.tx||0))*o,l=(s.tz||0)+((r.tz||0)-(s.tz||0))*o;const c=Math.hypot(a,l)||1;return a/=c,l/=c,{x:s.x+(r.x-s.x)*o,z:s.z+(r.z-s.z)*o,y:s.y+(r.y-s.y)*o,tx:a,tz:l,grade:(s.grade||0)+((r.grade||0)-(s.grade||0))*o,w:(s.w||1)+((r.w||1)-(s.w||1))*o,s:t}}function Bs(i,t,e){let n=0,s=1/0;for(let r=0;r<i.length;r++){const o=(i[r].x-t)*(i[r].x-t)+(i[r].z-e)*(i[r].z-e);o<s&&(s=o,n=r)}return i[n].s}function $c(i){let t=1/0,e=-1/0,n=1/0,s=-1/0;for(const r of i)r.x<t&&(t=r.x),r.x>e&&(e=r.x),r.z<n&&(n=r.z),r.z>s&&(s=r.z);return{minX:t,maxX:e,minZ:n,maxZ:s}}const xa=(i,t,e=0)=>i.minX-e<=t.maxX+e&&t.minX-e<=i.maxX+e&&i.minZ-e<=t.maxZ+e&&t.minZ-e<=i.maxZ+e;function Yc(i){const t=[];for(const e of i.junctions||[]){const n=(e.links||[]).map(s=>s.road);n.length>=2&&t.push({x:e.x,z:e.z,roads:n})}return t}const qc=4;function Bl(i,t,e,n,s,r=!1){const o=new Map,a=u=>Math.floor(u/qc);for(let u=0;u<n;u++){const h=e[u%e.length],g=e[(u+1)%e.length];for(let p=a(Math.min(h.x,g.x));p<=a(Math.max(h.x,g.x));p++)for(let m=a(Math.min(h.z,g.z));m<=a(Math.max(h.z,g.z));m++){const x=p+","+m;let f=o.get(x);f||(f=[],o.set(x,f)),f.push(u)}}const l=[],c=new Int32Array(Math.max(1,n)).fill(-1);for(let u=0;u<t;u++){const h=i[u%i.length],g=i[(u+1)%i.length],p=[];for(let m=a(Math.min(h.x,g.x));m<=a(Math.max(h.x,g.x));m++)for(let x=a(Math.min(h.z,g.z));x<=a(Math.max(h.z,g.z));x++){const f=o.get(m+","+x);if(f)for(const d of f)c[d]!==u&&(c[d]=u,!(s&&d-u<=1)&&(s&&r&&u===0&&d===n-1||p.push(d)))}p.sort((m,x)=>m-x);for(const m of p)l.push([u,m])}return l}function Ho(i,t,e={}){const n=Math.min(14,Math.max(2,+e.cornerRadius||+i?.settings?.cornerRadius||6)),s=(i.roads||[]).filter(E=>E.visible!==!1&&t.get(E.id)?.count>=2),r=new Map;for(const E of s)r.set(E.id,$c(t.get(E.id).samples));const o=Yc(i),a=(E,T,L,_)=>o.some(S=>S.roads.includes(E)&&S.roads.includes(T)&&Math.hypot(S.x-L,S.z-_)<=ke.weldGuard),l=[],c=[];for(let E=0;E<s.length;E++)for(let T=E;T<s.length;T++){const L=s[E],_=s[T],S=L.id===_.id;if(!xa(r.get(L.id),r.get(_.id)))continue;const N=t.get(L.id),B=t.get(_.id),k=N.samples,F=B.samples,G=N.closed?k.length:k.length-1,H=B.closed?F.length:F.length-1,$=N.length/G,J=B.length/H;for(const[lt,pt]of Bl(k,G,F,H,S,S&&N.closed)){const Et=k[lt%k.length],ot=k[(lt+1)%k.length],ft=F[pt%F.length],Ut=F[(pt+1)%F.length],Pt=zl(Et,ot,ft,Ut,1e-6);if(!Pt)continue;const ct=lt*$+(Pt.t||0)*$,ut=pt*J+(Pt.u||0)*J;if(S&&Math.abs(ct-ut)<ke.selfGap)continue;const St=Et.y+(ot.y-Et.y)*(Pt.t||0),V=ft.y+(Ut.y-ft.y)*(Pt.u||0);if(Math.abs(St-V)>=ke.gateY){c.push({x:Pt.x,z:Pt.z,gap:Math.abs(St-V),a:{road:L.id,s:ct,y:St},b:{road:_.id,s:ut,y:V}});continue}!S&&a(L.id,_.id,Pt.x,Pt.z)||l.some(Q=>Q.kind==="cross"&&(Q.a.road===L.id&&Q.b.road===_.id||Q.a.road===_.id&&Q.b.road===L.id)&&Math.hypot(Q.x-Pt.x,Q.z-Pt.z)<1.5)||l.push({kind:"cross",x:Pt.x,z:Pt.z,a:{road:L.id,s:ct,y:St},b:{road:_.id,s:ut,y:V}})}}for(const E of s){if(E.closed)continue;const T=Pe(i,E);if(!(T.length<2))for(const L of[0,T.length-1]){if(Sn(i,E.id,L))continue;const _=T[L];for(const S of s){if(S.id===E.id||!xa(r.get(S.id),{minX:_.x,maxX:_.x,minZ:_.z,maxZ:_.z},ke.touchXZ))continue;const N=t.get(S.id),B=N.samples,k=N.closed?B.length:B.length-1;let F=null;for(let G=0;G<k;G++){const H=B[G%B.length],$=B[(G+1)%B.length];if(_.x<Math.min(H.x,$.x)-ke.touchXZ||_.x>Math.max(H.x,$.x)+ke.touchXZ||_.z<Math.min(H.z,$.z)-ke.touchXZ||_.z>Math.max(H.z,$.z)+ke.touchXZ)continue;const{d:J,t:lt}=Si(_.x,_.z,H.x,H.z,$.x,$.z);if(J>=ke.touchXZ||F&&J>=F.d)continue;const pt=H.y+($.y-H.y)*lt;Math.abs(_.y-pt)>=ke.gateY||(F={d:J,s:(G+lt)*(N.length/k),x:H.x+($.x-H.x)*lt,z:H.z+($.z-H.z)*lt,y:pt})}F&&l.push({kind:"touch",x:F.x,z:F.z,a:{road:S.id,s:F.s,y:F.y},b:{road:E.id,s:L===0?0:t.get(E.id).length,y:_.y,end:L===0?"start":"end"}})}}}for(const E of i.junctions||[]){const T=(E.links||[]).filter(L=>{const _=At(i,L.road);return _&&!_.closed&&t.get(L.road)?.count>=2});T.length<2||l.push({kind:"weld",x:E.x,z:E.z,weldId:E.id,legs:T.map(L=>{const _=t.get(L.road);return{road:L.road,s:L.end==="start"?0:_.length,y:E.y,end:L.end}})})}const u=[];for(const E of l){let T=u.find(L=>L.some(_=>Math.hypot(_.x-E.x,E.z-_.z)<=ke.mergeDist));T||(T=[],u.push(T)),T.push(E)}const h=[];for(const E of u){const T=new Map;for(const ot of E)if(ot.kind==="weld")for(const ft of ot.legs)T.has(ft.road)||T.set(ft.road,[]),T.get(ft.road).push({s:ft.s,end:ft.end,weld:!0});else T.has(ot.a.road)||T.set(ot.a.road,[]),T.get(ot.a.road).push({s:ot.a.s,end:null,weld:!1}),T.has(ot.b.road)||T.set(ot.b.road,[]),T.get(ot.b.road).push({s:ot.b.s,end:ot.b.end||null,weld:!1});let L=2;for(const[ot,ft]of T){const Ut=At(i,ot),Pt=t.get(ot).samples;for(const ct of ft){const ut=_e(Pt,ct.s);L=Math.max(L,Vr(Ut,ut?.w||1))}}const _=Math.min(20,Math.max(5,n+L)),S=E.reduce((ot,ft)=>ot+ft.x,0)/E.length,N=E.reduce((ot,ft)=>ot+ft.z,0)/E.length,B=[],k=new Set,F=[];for(const[ot,ft]of T){const Ut=At(i,ot),Pt=t.get(ot),ct=Pt.samples,ut=Pt.length;k.add(ot);const St=[...ft].sort((j,Q)=>j.s-Q.s),V=[];for(const j of St){const Q=V[V.length-1];Q&&j.s-Q.max<=_?(Q.max=j.s,Q.list.push(j)):V.push({max:j.s,list:[j]})}for(const j of V){const Q=j.list.reduce((w,b)=>w+b.s,0)/j.list.length,dt=!Pt.closed&&(j.list.some(w=>w.end)||Q<=_*.5||Q>=ut-_*.5),M=_e(ct,Math.min(ut-.01,Math.max(.01,Q))),z=Vr(Ut,M?.w||1);if(dt){const w=j.list.find(nt=>nt.end)?.end==="start"||Q<ut/2,b=w?Math.min(ut-1,_):Math.max(1,ut-_);if(w?b>=ut-1:b<=1)continue;const O=_e(ct,b),U=O.x-S,I=O.z-N,X=Math.hypot(U,I)||1,q=j.list.some(nt=>nt.weld);B.push({roadId:ot,sTrim:b,dirx:U/X,dirz:I/X,halfW:z,role:q?"weld":"branch"}),w?F.push({roadId:ot,s0:0,s1:Math.min(ut,Q+_)}):F.push({roadId:ot,s0:Math.max(0,Q-_),s1:ut})}else{F.push({roadId:ot,s0:Q-_,s1:Q+_});for(const w of[-1,1]){let b=Q+w*_;if(Pt.closed)b=(b%ut+ut)%ut;else if(b<1||b>ut-1)continue;const O=_e(ct,b),U=O.x-S,I=O.z-N,X=Math.hypot(U,I)||1;B.push({roadId:ot,sTrim:b,dirx:U/X,dirz:I/X,halfW:z,role:"through"})}}}}if(B.length<2)continue;if(B.length===2){const ot=B[0].dirx*B[1].dirx+B[0].dirz*B[1].dirz;if(Math.acos(Math.min(1,Math.max(-1,ot)))*180/Math.PI>180-ke.bendDeg)continue}const G=new Set(B.filter(ot=>ot.role==="through").map(ot=>ot.roadId)),H=B.filter(ot=>ot.role!=="through");let $="multi";if(B.length===2)$="elbow";else if(G.size>=2)$=B.length===4?"cross":"multi";else if(G.size===1)if(H.length===1){const ot=H[0],ft=t.get([...G][0]).samples,Ut=_e(ft,Bs(ft,S,N)),Pt=Math.abs(ot.dirx*(Ut?.tx||0)+ot.dirz*(Ut?.tz||0));$=Math.acos(Math.min(1,Math.max(-1,Pt)))*180/Math.PI<ke.mergeDeg?"merge":"tee"}else $="multi";else B.length===3&&($="wye");const J=B.map(ot=>Math.atan2(ot.dirx,-ot.dirz)).sort((ot,ft)=>ot-ft);let lt=360;for(let ot=0;ot<J.length;ot++){let ft=(J[(ot+1)%J.length]-J[ot])*180/Math.PI;ft<0&&(ft+=360),lt=Math.min(lt,ft)}const pt=E.reduce((ot,ft)=>ot+(ft.a?.y??ft.legs?.[0]?.y??0),0)/E.length,Et=`x_${B.map(ot=>`${ot.roadId}@${Math.round(ot.sTrim)}`).sort().join("-")}`;h.push({id:Et,x:S,z:N,y:pt,kind:$,legs:B,radius:_,minAngleDeg:lt,roads:[...k],cuts:F})}let g=!0;for(;g;){g=!1;t:for(let E=0;E<h.length;E++)for(let T=E+1;T<h.length;T++){const L=h[E],_=h[T];if(Math.hypot(L.x-_.x,L.z-_.z)<(L.radius+_.radius)*.8){const S=[...L.legs,..._.legs],N=S.length,B=(L.x+_.x)/2,k=(L.z+_.z)/2;for(const H of S){const $=t.get(H.roadId).samples,J=_e($,H.sTrim),lt=J.x-B,pt=J.z-k,Et=Math.hypot(lt,pt)||1;H.dirx=lt/Et,H.dirz=pt/Et}const F=S.map(H=>Math.atan2(H.dirx,-H.dirz)).sort((H,$)=>H-$);let G=360;for(let H=0;H<F.length;H++){let $=(F[(H+1)%F.length]-F[H])*180/Math.PI;$<0&&($+=360),G=Math.min(G,$)}h[E]={id:`x_${S.map(H=>`${H.roadId}@${Math.round(H.sTrim)}`).sort().join("-")}`,x:B,z:k,y:(L.y+_.y)/2,kind:N===4?"cross":"multi",legs:S,radius:Math.max(L.radius,_.radius),minAngleDeg:G,roads:[...new Set([...L.roads,..._.roads])],cuts:[...L.cuts||[],..._.cuts||[]]},h.splice(T,1),g=!0;break t}}}const p=[];for(const E of c){const T=p.find(L=>L.clusters.some(_=>_.a.road===E.a.road&&_.b.road===E.b.road&&Math.hypot(_.x-E.x,_.z-E.z)<2.5));T?T.clusters.push(E):p.push({clusters:[E]})}const m=p.map((E,T)=>{const L=E.clusters.length,_=E.clusters.reduce((H,$)=>H+$.x,0)/L,S=E.clusters.reduce((H,$)=>H+$.z,0)/L,N=E.clusters.reduce((H,$)=>H+$.gap,0)/L,B=E.clusters[0],k=B.a.y>=B.b.y,F=E.clusters.reduce((H,$)=>H+(k?$.a.s:$.b.s),0)/L,G=E.clusters.reduce((H,$)=>H+(k?$.b.s:$.a.s),0)/L;return{id:`o${T+1}_${k?B.a.road:B.b.road}x${k?B.b.road:B.a.road}`,x:_,z:S,gap:N,upper:k?B.a.road:B.b.road,lower:k?B.b.road:B.a.road,sUpper:F,sLower:G}}),x=i.intersectionOverrides&&typeof i.intersectionOverrides=="object"?i.intersectionOverrides:{},f=h.filter(E=>x[E.id]?.enabled!==!1),d=h.filter(E=>x[E.id]?.enabled===!1),A=new Set(f.map(E=>E.id)),P=new Map;for(const E of f)for(const T of E.cuts||[]){const L=t.get(T.roadId);if(!L)continue;const _=L.length;let{s0:S,s1:N}=T;if(!(N>S))continue;P.has(T.roadId)||P.set(T.roadId,[]);const B=P.get(T.roadId);L.closed&&(S<0||N>_)?S<0?(B.push({s0:0,s1:Math.min(_,N)}),B.push({s0:_+S,s1:_})):(B.push({s0:Math.max(0,S),s1:_}),B.push({s0:0,s1:N-_})):B.push({s0:Math.max(0,S),s1:Math.min(_,N)})}const v=new Map;for(const E of s){const T=t.get(E.id),L=T.samples,_=T.length,S=(P.get(E.id)||[]).filter(F=>F.s1-F.s0>.05).sort((F,G)=>F.s0-G.s0),N=[];for(const F of S){const G=N[N.length-1];G&&F.s0<=G.s1+.01?G.s1=Math.max(G.s1,F.s1):N.push({...F})}const B=[];let k=0;for(const F of N)F.s0-k>.3&&B.push([k,F.s0]),k=Math.max(k,F.s1);_-k>.3&&B.push([k,_]),v.set(E.id,B.map(([F,G])=>{const H=L.filter(lt=>lt.s>=F-1e-6&&lt.s<=G+1e-6),$=_e(L,F),J=_e(L,G);return H.length&&Math.abs(H[0].s-F)>1e-4&&H.unshift({...$}),H.length&&Math.abs(H[H.length-1].s-G)>1e-4&&H.push({...J}),H}).filter(F=>F.length>=2))}const C=[];for(const E of s){const T=Pe(i,E),L=t.get(E.id).samples,_=T.map((k,F)=>k.bridge?F:-1).filter(k=>k>=0);if(!_.length)continue;let S=_[0],N=_[0];const B=[];for(let k=1;k<=_.length;k++){const F=_[k];if(F===N+1){N=F;continue}N>S&&B.push([S,N]),S=F,N=F}for(const[k,F]of B){const G=Bs(L,T[k].x,T[k].z),H=Bs(L,T[F].x,T[F].z);H-G>1&&C.push({roadId:E.id,s0:G,s1:H,c0:k,c1:F})}}return{intersections:f,disabled:d,overpasses:m,runs:v,bridges:C,cornerRadius:n,cuts:P,activeIds:A}}function Zc(i,t,e,n){const s=(e?.overpasses||[]).find(T=>T.id===n);if(!s)return{error:"Overpass not found — it may have moved."};const r=At(i,s.upper),o=At(i,s.lower),a=t.get(s.upper);if(!r||!o||!a||a.count<2)return{error:"Upper road unavailable."};if(r.closed)return{error:"Loop bridges are not supported yet."};const l=Vr(o,1)+5,c=a.length,u=Math.max(1,s.sUpper-l),h=Math.min(c-1,s.sUpper+l);if(h-u<4)return{error:"No room for a bridge span here."};for(const T of e?.cuts?.get(s.upper)||[])if(T.s0<h-1&&T.s1>u+1)return{error:"Span would swallow a junction — flag points by hand."};const g=Pe(i,r),p=a.samples,m=g.map(T=>Bs(p,T.x,T.z));for(let T=0;T<g.length;T++){if(m[T]<u-1||m[T]>h+1)continue;let L=T;for(;L+1<g.length&&m[L+1]>=u-1&&m[L+1]<=h+1;)L++;if(L>T&&m[T]<=u+1&&m[L]>=h-1){const _=[];for(let S=T;S<=L;S++)_.push(S);return{roadId:r.id,inserts:[],flags:_,s0:u,s1:h}}T=L}const x=T=>{const L=_e(p,T);return{x:L.x,z:L.z,y:L.y,w:L.w||1,bridge:!0}},f=[u,h].map(T=>{let L=-1,_=2;if(m.forEach((N,B)=>{const k=Math.abs(N-T);k<_&&(_=k,L=B)}),L>=0)return{reuse:L};let S=m.findIndex(N=>N>T);return S<0&&(S=m.length),{insert:S,point:x(T)}}),d=f.filter(T=>T.insert!==void 0).sort((T,L)=>T.insert-L.insert),A=d.map((T,L)=>({index:T.insert+L,point:T.point})),P=T=>{if(T.insert!==void 0){const L=d.indexOf(T);return T.insert+L}return T.reuse+d.filter(L=>L.insert<=T.reuse).length},v=P(f[0]),C=P(f[1]),E=[];for(let T=Math.min(v,C);T<=Math.max(v,C);T++)E.push(T);return{roadId:r.id,inserts:A,flags:E,s0:u,s1:h}}function Kc(i){return{cross:"4-way cross",tee:"T-junction",merge:"Merge",wye:"Wye",elbow:"Elbow",multi:"Multi-way"}[i]||i}const We={radiusWarn:15,radiusErr:7,gradeWarn:.08,gradeErr:.12,minPointGap:.5,dupGap:.05,minJunctionAngle:25,minClearance:4.5,maxIssues:240};function Jc(i,t,e){const n=t.name||t.id,s=t.points||[];if(s.length<2)return e.push(Ze("error","too-few-points",t.id,n,0,s[0]?.x??0,s[0]?.z??0,s[0]?.y??0,`<b>${n}</b> needs at least 2 control points.`)),null;for(let x=1;x<s.length;x++){const f=Math.hypot(s[x].x-s[x-1].x,s[x].z-s[x-1].z);f<We.dupGap?e.push(Ze("error","duplicate-point",t.id,n,0,s[x].x,s[x].z,s[x].y,`<b>${n}</b> has stacked points (#${x}–#${x+1}); the curve is pinched there.`)):f<We.minPointGap&&e.push(Ze("warn","tight-spacing",t.id,n,0,s[x].x,s[x].z,s[x].y,`<b>${n}</b> points #${x}–#${x+1} are ${f.toFixed(2)} m apart — under ${We.minPointGap} m.`))}t.lanes*t.laneWidth<=0&&e.push(Ze("error","no-width",t.id,n,0,s[0].x,s[0].z,s[0].y,`<b>${n}</b> has no carriageway width (lanes × width ≤ 0).`));const r=Hi(s,{closed:t.closed,step:1});if(!r.count)return null;const o=[],a=r.samples;for(let x=1;x<a.length-1;x++){const f=a[x].radius;!Number.isFinite(f)||f>=We.radiusWarn||a[x-1].radius<=f||a[x+1].radius<f||o.push(a[x])}o.sort((x,f)=>x.radius-f.radius);const l=[];for(const x of o){if(l.length>=3)break;l.every(f=>Math.abs(f.s-x.s)>12)&&l.push(x)}for(const x of l){const f=x.radius<We.radiusErr?"error":"warn";e.push(Ze(f,"tight-curve",t.id,n,x.s,x.x,x.z,x.y,`<b>${n}</b> curve radius <b>${x.radius.toFixed(1)} m</b> at s=${x.s.toFixed(0)} m${f==="error"?" — under the 7 m minimum":""}.`))}const c=[];for(let x=1;x<a.length-1;x++){const f=Math.abs(a[x].grade);f<We.gradeWarn||Math.abs(a[x-1].grade)>=f||Math.abs(a[x+1].grade)>f||c.push(a[x])}c.sort((x,f)=>Math.abs(f.grade)-Math.abs(x.grade));const u=[];for(const x of c){if(u.length>=3)break;u.every(f=>Math.abs(f.s-x.s)>15)&&u.push(x)}for(const x of u){const f=Math.abs(x.grade),d=f>We.gradeErr?"error":"warn";e.push(Ze(d,"steep-grade",t.id,n,x.s,x.x,x.z,x.y,`<b>${n}</b> grade <b>${(f*100).toFixed(1)}%</b> at s=${x.s.toFixed(0)} m${d==="error"?" — over the 12% maximum":""}.`))}const h=a.length,g=!!t.closed,p=g?h:h-1;let m=0;for(const[x,f]of Bl(a,p,a,p,!0,g)){if(m>=2)break;const d=a[x%h],A=a[(x+1)%h],P=zl(d,A,a[f%h],a[(f+1)%h],1e-6);P&&(m++,e.push(Ze("error","self-crossing",t.id,n,d.s,P.x,P.z,d.y,`<b>${n}</b> crosses itself near (${P.x.toFixed(1)}, ${P.z.toFixed(1)}).`)))}return r}let Qc=1;function Ze(i,t,e,n,s,r,o,a,l){return{id:`is${Qc++}`,severity:i,code:t,road:e,roadName:n,idx:s,x:r,z:o,y:a,text:l}}function td(i,t=null){const e=[];for(const o of i.roads||[])if(Jc(i,o,e),e.length>We.maxIssues)break;const n=o=>(i.roads||[]).find(a=>a.id===o)?.name||o||"—";let s=t;if(!s){const o=new Map;for(const a of i.roads||[])o.set(a.id,Hi(Pe(i,a),{closed:a.closed,step:1}));s=Ho(i,o)}for(const o of s.intersections)o.kind!=="merge"&&o.minAngleDeg<We.minJunctionAngle&&e.push(Ze("warn","intersection-angle",o.roads[0]||null,n(o.roads[0]),0,o.x,o.z,o.y,`Approach angle <b>${o.minAngleDeg.toFixed(0)}°</b> at the ${o.kind} — under ${We.minJunctionAngle}° pinches turning paths.`));for(const o of s.overpasses)o.gap<We.minClearance&&e.push(Ze("warn","low-clearance",o.upper,n(o.upper),o.sUpper,o.x,o.z,0,`<b>${n(o.upper)}</b> clears <b>${n(o.lower)}</b> by <b>${o.gap.toFixed(1)} m</b> — under ${We.minClearance} m.`)),s.bridges.some(l=>l.roadId===o.upper&&l.s0-2<=o.sUpper&&o.sUpper<=l.s1+2)||e.push(Ze("info","overpass-span",o.upper,n(o.upper),o.sUpper,o.x,o.z,0,`<b>${n(o.upper)}</b> flies over <b>${n(o.lower)}</b> — flag a bridge span for deck + piers.`));for(const o of i.junctions||[]){const a=o.links||[];a.length<2&&e.push(Ze("warn","dangling-junction",a[0]?.road||null,"—",0,o.x,o.z,o.y,`Junction <b>${o.name||o.id}</b> links fewer than 2 road ends.`));for(const l of a)(i.roads||[]).find(u=>u.id===l.road)||e.push(Ze("error","broken-link",null,"—",0,o.x,o.z,o.y,`Junction <b>${o.name||o.id}</b> links a deleted road.`))}const r={error:0,warn:1,info:2};return e.sort((o,a)=>r[o.severity]-r[a.severity]),e.slice(0,We.maxIssues)}function ed(i,t){let e=0,n=1/0,s=0,r=0;for(const o of i.roads||[]){const a=t.get(o.id);r+=(o.points||[]).length,a&&(e+=a.length,Number.isFinite(a.minRadius)&&(n=Math.min(n,a.minRadius)),s=Math.max(s,a.maxGrade||0))}return{length:e,minRadius:n,maxGrade:s,points:r,roads:(i.roads||[]).length}}const Ui={asphalt:{label:"Asphalt",road:[.2,.212,.23],shoulder:[.16,.168,.182]},concrete:{label:"Concrete",road:[.585,.595,.59],shoulder:[.5,.51,.505]},gravel:{label:"Gravel",road:[.512,.462,.372],shoulder:[.44,.394,.316]},dirt:{label:"Dirt",road:[.41,.3,.196],shoulder:[.345,.25,.163]}},kl=Object.keys(Ui),nd={none:"None",single:"Single solid",double:"Double solid",dashed:"Dashed"},bi=[.88,.88,.86],va=[.91,.74,.23],or=[.62,.62,.6],Pi=[.7,.72,.74],Ma=[.42,.43,.44],He=[.55,.55,.53],$n=[.34,.34,.33],kn=[.45,.46,.48];function Wr(i){return Math.max(.5,i.lanes*i.laneWidth+i.shoulderL+i.shoulderR)}function id(i){return 1+.028*Math.sin(i*1.7)+.018*Math.sin(i*.43+2)}function Ti(i,t){const e=t.length,n=t[0].length,s=[],r=[],o=[],a=[],l=[];for(let c=0;c<e;c++)for(let u=0;u<n;u++){const h=t[c][u];s.push(h.x,h.y,h.z),r.push(h.nx,h.ny,h.nz),o.push(h.r,h.g,h.b),a.push(h.u,h.v)}for(let c=0;c<e-1;c++)for(let u=0;u<n-1;u++){const h=c*n+u,g=(c+1)*n+u;l.push(h,h+1,g,h+1,g+1,g)}i.positions=new Float32Array(s),i.normals=new Float32Array(r),i.colors=new Float32Array(o),i.uvs=new Float32Array(a),i.indices=new Uint32Array(l),i.triangles=l.length/3}function hs(i,t,e,n){i=Number.isFinite(i)?i:1,t=Number.isFinite(t)?t:0,e=Number.isFinite(e)?e:0,n=Number.isFinite(n)?n:0;const s=-t,r=n,o=i,a=i,l=e,c=t;let u=r*c-o*l,h=o*a-s*c,g=s*l-r*a;const p=Math.hypot(u,h,g)||1;return[u/p,h/p,g/p]}function tr(i,t){const e=Ui[i.surface]||Ui.asphalt,n=i.conform==="drape"&&typeof t=="function",s=+i.drapeOffset||0;return{surf:e,drape:n,baseY:c=>{if(!n)return c.y;const u=t(c.x,c.z);return u==null||!Number.isFinite(u)?c.y:u+s},halfRoad:c=>Math.max(.25,i.lanes*i.laneWidth*(c.w||1)/2),shoulders:c=>{const u=c.w||1;return[Math.max(0,+i.shoulderL||0)*u,Math.max(0,+i.shoulderR||0)*u]},crossY:(c,u,h,g)=>{const p=Math.abs(g);if(p<=h){const m=+i.camber||0;return m>0?u+m*(1-g/h*(g/h)):u}return u-(p-h)*.025}}}const ya=i=>(i=Math.min(1,Math.max(0,i)),i*i*(3-2*i));function sd(i,{step:t=1,terrain:e=null}={}){const n=Hi(i.points,{closed:i.closed,step:t}),s={length:n.length,triangles:0,minRadius:n.minRadius??1/0,maxGrade:n.maxGrade??0};if(!n.count)return{parts:[],samples:n,stats:s};const{parts:r,stats:o}=Hl(i,n.samples,tr(i,e),{});return s.triangles=o.triangles,{parts:r,samples:n,stats:s}}function Hl(i,t,e,{tag:n="",railCuts:s=[]}={}){const r=[],o={triangles:0};if(!t||t.length<2)return{parts:r,stats:o};const{surf:a,baseY:l,halfRoad:c,crossY:u}=e,h=m=>n?`${m}.${n}`:m;{const m=Math.max(5,i.lanes+2),x=[];for(let d=0;d<m;d++)x.push(-1+2*d/(m-1));const f=[];for(const d of t){const A=c(d),P=d.w||1,v=Math.max(0,+i.shoulderL||0)*P,C=Math.max(0,+i.shoulderR||0)*P,E=[];v>0&&E.push(-A-v,-A-v*.45);for(const S of x)E.push(S*A);C>0&&E.push(A+C*.45,A+C);const T=l(d),L=id(d.s),_=E.map(S=>{const N=u(d,T,A,S),k=Math.abs(S)<=A+1e-6?a.road:a.shoulder;return{o:S,x:d.x-d.tz*S,y:N,z:d.z+d.tx*S,r:k[0]*L,g:k[1]*L,b:k[2]*L,u:S,v:d.s}});for(let S=0;S<_.length;S++){const N=_[Math.max(0,S-1)],B=_[Math.min(_.length-1,S+1)],k=(B.y-N.y)/Math.max(1e-6,B.o-N.o||1e-6),[F,G,H]=hs(d.tx,d.tz,d.grade,k);_[S].nx=F,_[S].ny=G,_[S].nz=H}f.push(_)}if(f.length>1){const d={name:h("surface"),roadId:i.id};Ti(d,f),r.push(d)}}const g=(m,x,f,d,A)=>{const P=[];for(const v of t){if(A&&!A(v))continue;const C=c(v),E=l(v),T=_=>{const S=u(v,E,C,_)+.02;return{x:v.x-v.tz*_,y:S,z:v.z+v.tx*_,r:d[0],g:d[1],b:d[2],u:_,v:v.s}},L=[T(x),T(f)];for(const _ of L){const[S,N,B]=hs(v.tx,v.tz,v.grade,0);_.nx=S,_.ny=N,_.nz=B}P.push(L)}if(P.length>1){const v={name:m,roadId:i.id};Ti(v,P),r.push(v)}},p=i.centerMarking||"none";if(p==="single"?g(h("marking-center"),-.07,.07,bi):p==="double"?(g(h("marking-center-L"),-.24,-.12,va),g(h("marking-center-R"),.12,.24,va)):p==="dashed"&&g(h("marking-center"),-.07,.07,bi,m=>m.s%9<3),i.edgeMarking)for(const m of[-1,1]){const x=[];for(const f of t){const d=c(f);if(d<.6)continue;const A=m*(d-.22),P=l(f),v=C=>{const E=u(f,P,d,C)+.02,[T,L,_]=hs(f.tx,f.tz,f.grade,0);return{x:f.x-f.tz*C,y:E,z:f.z+f.tx*C,nx:T,ny:L,nz:_,r:bi[0],g:bi[1],b:bi[2],u:C,v:f.s}};x.push([v(A-.06),v(A+.06)])}if(x.length>1){const f={name:h(m<0?"marking-edge-L":"marking-edge-R"),roadId:i.id};Ti(f,x),r.push(f)}}for(const m of[-1,1]){if(!(m<0?i.kerbL:i.kerbR))continue;const f=[];for(const d of t){const A=c(d),P=d.w||1,v=m<0?Math.max(0,+i.shoulderL||0)*P:Math.max(0,+i.shoulderR||0)*P,C=m*(A+v),E=l(d),T=u(d,E,A,C),_=[{o:C,y:T+.005},{o:C+m*.06,y:T+.14},{o:C+m*.3,y:T+.14}].map(({o:S,y:N})=>{const[B,k,F]=hs(d.tx,d.tz,d.grade,m*.4);return{x:d.x-d.tz*S,y:N,z:d.z+d.tx*S,nx:B,ny:k,nz:F,r:or[0],g:or[1],b:or[2],u:S,v:d.s}});f.push(_)}if(f.length>1){const d={name:h(m<0?"kerb-L":"kerb-R"),roadId:i.id};Ti(d,f),r.push(d)}}for(const m of[-1,1]){if(!(m<0?i.guardrailL:i.guardrailR))continue;const f=A=>{const P=c(A),v=m<0?e.shoulders(A)[0]:e.shoulders(A)[1];return m*(P+v+.6)},d=A=>{const P=c(A),v=m<0?e.shoulders(A)[0]:e.shoulders(A)[1];return u(A,l(A),P,m*(P+v))};for(const A of Vl(t,s))A.length>=2&&r.push(...Xl(A,m,f,d,{roadId:i.id,railName:h(m<0?"rail-L":"rail-R"),postName:h(m<0?"posts-L":"posts-R")}))}for(const m of r)o.triangles+=m.triangles;return{parts:r,stats:o}}function rd(i,{terrain:t=null,samples:e=null,topo:n=null}={}){if(e&&n)return Go(i,e,n,t).stats.triangles;let s=0;for(const r of i.roads)r.visible!==!1&&(s+=sd(r,{terrain:t}).stats.triangles);return s}const Gl=i=>String(i||"road").replace(/[^A-Za-z0-9_.-]+/g,"_").slice(0,48)||"road";function od(i,{step:t=1,terrain:e=null,samples:n=null,topo:s=null}={}){const r=[],o=new Date().toISOString(),a=n||(()=>{const p=new Map;for(const m of i.roads||[])p.set(m.id,Hi(Pe(i,m),{closed:m.closed,step:t}));return p})(),l=s||Ho(i,a);r.push("# Frontier road network | units: meters | Y-up"),r.push(`# Project: ${i.name||"untitled"} | roads: ${i.roads.length} | exported: ${o}`);const c=i.roads.map(p=>{const m=a.get(p.id);return{name:p.name,closed:!!p.closed,points:p.points.length,length_m:+(m?.length||0).toFixed(2),lanes:p.lanes,laneWidth_m:p.laneWidth,surface:p.surface}});r.push(`# Roads: ${JSON.stringify(c)}`),r.push(`# Topology: ${l.intersections.length} intersections, ${l.overpasses.length} overpasses, ${l.bridges.length} bridge spans`);const u=new Map((i.roads||[]).map(p=>[p.id,Gl(p.name||p.id)])),{parts:h}=Go(i,a,l,e);let g=0;for(const p of h){const m=p.junction?p.name:`${u.get(p.roadId)||"road"}__${p.name}`;r.push(`o ${m}`);const{positions:x,normals:f,uvs:d,indices:A}=p;for(let P=0;P<x.length;P+=3)r.push(`v ${x[P].toFixed(4)} ${x[P+1].toFixed(4)} ${x[P+2].toFixed(4)}`);for(let P=0;P<d.length;P+=2)r.push(`vt ${d[P].toFixed(3)} ${d[P+1].toFixed(3)}`);for(let P=0;P<f.length;P+=3)r.push(`vn ${f[P].toFixed(5)} ${f[P+1].toFixed(5)} ${f[P+2].toFixed(5)}`);for(let P=0;P<A.length;P+=3){const v=A[P]+1+g,C=A[P+1]+1+g,E=A[P+2]+1+g;r.push(`f ${v}/${v}/${v} ${C}/${C}/${C} ${E}/${E}/${E}`)}g+=x.length/3}return r.join(`
`)+`
`}function Vl(i,t){if(!i.length)return[];if(!t||!t.length)return[i];const e=i[0].s,n=i[i.length-1].s,s=t.filter(l=>l.s1>l.s0).sort((l,c)=>l.s0-c.s0),r=[];for(const l of s){const c=r[r.length-1];c&&l.s0<=c.s1+.01?c.s1=Math.max(c.s1,l.s1):r.push({s0:l.s0,s1:l.s1})}const o=[];let a=e;for(const l of r)l.s0-a>.3&&o.push([a,l.s0]),a=Math.max(a,l.s1);return n-a>.3&&o.push([a,n]),o.map(([l,c])=>{const u=i.filter(p=>p.s>=l-1e-6&&p.s<=c+1e-6),h=_e(i,l),g=_e(i,c);return u.length&&Math.abs(u[0].s-l)>1e-4&&u.unshift({...h}),u.length&&Math.abs(u[u.length-1].s-c)>1e-4&&u.push({...g}),u}).filter(l=>l.length>=2)}function Yn(i,t,e){if(!e||e.length<2)return null;const n={name:i,roadId:t};return Ti(n,e),n}function Wl(i,t,e){const n=[],s=[],r=[],o=[],a=[];let l=0;const c=[{n:[1,0,0],c:[[1,-1,-1],[1,-1,1],[1,1,1],[1,1,-1]]},{n:[-1,0,0],c:[[-1,-1,1],[-1,-1,-1],[-1,1,-1],[-1,1,1]]},{n:[0,1,0],c:[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]},{n:[0,-1,0],c:[[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]]},{n:[0,0,1],c:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]},{n:[0,0,-1],c:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]}];for(const h of e){const[g,p,m]=h.c,[x,f,d]=h.s,A=h.yaw||0,P=h.color,v=Math.cos(A),C=Math.sin(A);for(const E of c){const[T,L,_]=E.n,S=T*v+_*C,N=-T*C+_*v,B=l;for(const[k,F,G]of E.c){const H=k*x/2,$=G*d/2;n.push(g+H*v+$*C,p+F*f/2,m-H*C+$*v),s.push(S,L,N),r.push(P[0],P[1],P[2]),o.push(k*.5,F*.5)}a.push(B,B+1,B+2,B,B+2,B+3),l+=4}}if(!a.length)return null;const u={name:i,roadId:t};return u.positions=new Float32Array(n),u.normals=new Float32Array(s),u.colors=new Float32Array(r),u.uvs=new Float32Array(o),u.indices=new Uint32Array(a),u.triangles=a.length/3,u}function ad(i,t,e,n,s,r,o){const a=r.length;if(a<3)return null;const l=[e,n,s],c=[0,0,0],u=[...o],h=[e*.05,s*.05];for(const x of r)l.push(x.x,x.y,x.z),c.push(0,0,0),u.push(o[0],o[1],o[2]),h.push(x.x*.05,x.z*.05);const g=[],p=(x,f,d,A)=>{c[x*3]+=f,c[x*3+1]+=d,c[x*3+2]+=A};for(let x=0;x<a;x++){const f=1+x,d=1+(x+1)%a;g.push(0,f,d);const A=l[f*3]-e,P=l[f*3+1]-n,v=l[f*3+2]-s,C=l[d*3]-e,E=l[d*3+1]-n,T=l[d*3+2]-s;let L=P*T-v*E,_=v*C-A*T,S=A*E-P*C;const N=Math.hypot(L,_,S)||1;L/=N,_/=N,S/=N,_<0&&(L=-L,_=-_,S=-S),p(0,L,_,S),p(f,L,_,S),p(d,L,_,S)}for(let x=0;x<=a;x++){const f=Math.hypot(c[x*3],c[x*3+1],c[x*3+2])||1;c[x*3]/=f,c[x*3+1]/=f,c[x*3+2]/=f}const m={name:i,roadId:t};return m.positions=new Float32Array(l),m.normals=new Float32Array(c),m.colors=new Float32Array(u),m.uvs=new Float32Array(h),m.indices=new Uint32Array(g),m.triangles=g.length/3,m}function ld(i,t,e,n){if(!e.length)return null;const s=[],r=[],o=[],a=[],l=[];let c=0;for(const h of e){const g=h[1][0]-h[0][0],p=h[1][1]-h[0][1],m=h[1][2]-h[0][2],x=h[3][0]-h[0][0],f=h[3][1]-h[0][1],d=h[3][2]-h[0][2];let A=p*d-m*f,P=m*x-g*d,v=g*f-p*x;const C=Math.hypot(A,P,v)||1;A/=C,P/=C,v/=C,P<0&&(A=-A,P=-P,v=-v);for(const[E,T,L]of h)s.push(E,T,L),r.push(A,P,v),o.push(n[0],n[1],n[2]),a.push(E*.1,L*.1);l.push(c,c+1,c+2,c,c+2,c+3),c+=4}const u={name:i,roadId:t};return u.positions=new Float32Array(s),u.normals=new Float32Array(r),u.colors=new Float32Array(o),u.uvs=new Float32Array(a),u.indices=new Uint32Array(l),u.triangles=l.length/3,u}const cd=[[.5,.02],[.6,-.03],[.71,.03],[.81,-.015]];function Xl(i,t,e,n,{roadId:s=null,railName:r="rail",postName:o="posts",postSpacing:a=2,bury:l=!0,onDeck:c=!1,maxPosts:u=1200}={}){const h=[];if(!i||i.length<2)return h;const g=i[0].s,p=i[i.length-1].s,m=l?Math.min(4,Math.max(0,(p-g)/2-.6)):0,x=v=>m<=0?1:ya((v-g)/m)*ya((p-v)/m),f=[];for(const v of i){const C=e(v),E=n(v),T=x(v.s),L=Math.hypot(1,.12);f.push(cd.map(([_,S])=>{const N=C+t*S*T;return{x:v.x-v.tz*N,y:E+.06+(_-.06)*T,z:v.z+v.tx*N,nx:-v.tz*t/L,ny:.12/L,nz:v.tx*t/L,r:Pi[0],g:Pi[1],b:Pi[2],u:N,v:v.s}}))}if(f.length>1){const v={name:r,roadId:s};Ti(v,f),h.push(v)}const d=[],A=v=>e(v)-t*.24;for(let v=g+1;v<p-.5;v+=a){if(x(v)<.4)continue;const C=_e(i,v),E=n(C),T=Math.atan2(C.tx,C.tz),L=c?.55:.78,_=A(C);d.push({c:[C.x-C.tz*_,E+L/2-.06,C.z+C.tx*_],s:[.15,L,.15],yaw:T,color:Ma});const S=e(C)-t*.12;if(d.push({c:[C.x-C.tz*S,E+.6,C.z+C.tx*S],s:[.3,.16,.14],yaw:T,color:Ma}),d.length>=u*2)break}const P=Wl(o,s,d);return P&&h.push(P),h}function jl(i,t,e,n){const s=[...i.legs||[]].sort((p,m)=>Math.atan2(p.dirx,-p.dirz)-Math.atan2(m.dirx,-m.dirz));if(s.length<2)return null;const r={x:i.x,z:i.z},o=[];for(const p of s){const m=(t.roads||[]).find(C=>C.id===p.roadId),x=e.get(p.roadId);if(!m||!x)continue;const f=tr(m,n),d=_e(x.samples,p.sTrim),A=f.baseY(d),P=f.halfRoad(d),v=[-p.halfW,p.halfW].map(C=>({o:C,x:d.x-d.tz*C,z:d.z+d.tx*C,y:f.crossY(d,A,P,C)}));o.push({leg:p,road:m,smp:x,ctx:f,b:d,yC:f.crossY(d,A,P,0),edges:v})}if(o.length<2)return null;const a=o.length;for(let p=0;p<a;p++){const m=o[p],x=o[(p-1+a)%a],f=o[(p+1)%a],d=m.edges.map(C=>Math.hypot(C.x-x.b.x,C.z-x.b.z)),A=m.edges.map(C=>Math.hypot(C.x-f.b.x,C.z-f.b.z));let P=d[0]<=d[1]?0:1,v=A[0]<=A[1]?0:1;P===v&&(v=1-v),m.ePrev=m.edges[P],m.eNext=m.edges[v]}const l=[];for(let p=0;p<a;p++){const m=o[p].eNext,x=o[(p+1)%a].ePrev;l.push({x:m.x,y:m.y,z:m.z});const f=Math.atan2(m.x-r.x,m.z-r.z);let A=Math.atan2(x.x-r.x,x.z-r.z)-f;for(;A>Math.PI;)A-=2*Math.PI;for(;A<-Math.PI;)A+=2*Math.PI;const P=Math.hypot(m.x-r.x,m.z-r.z),v=Math.hypot(x.x-r.x,x.z-r.z);for(let C=1;C<6;C++){const E=C/6,T=E*E*(3-2*E),L=f+A*E,_=P+(v-P)*E;l.push({x:r.x+_*Math.sin(L),y:m.y+(x.y-m.y)*T,z:r.z+_*Math.cos(L)})}l.push({x:x.x,y:x.y,z:x.z})}const c=o.reduce((p,m)=>p+m.yC,0)/a,h=[...o].sort((p,m)=>m.leg.halfW-p.leg.halfW)[0].road.surface||"asphalt",g=(Ui[h]||Ui.asphalt).road;return{ring:l,frames:o,surf:g,surfId:h,yC:c,C:r}}function dd(i,t,e,n){const s=[],r=jl(i,t,e,n);if(!r)return s;const{ring:o,frames:a,surf:l,yC:c,C:u}=r,h=ad("junction-top",null,u.x,c,u.z,o,l);h&&(h.junction=i.id,s.push(h));const g=[];for(let A=0;A<=o.length;A++){const P=o[A%o.length];let v=P.x-u.x,C=P.z-u.z;const E=Math.hypot(v,C)||1;v/=E,C/=E,g.push([{x:P.x,y:P.y+.01,z:P.z,nx:v,ny:.15,nz:C,r:$n[0],g:$n[1],b:$n[2],u:A,v:0},{x:P.x+v*.3,y:P.y-.55,z:P.z+C*.3,nx:v,ny:.15,nz:C,r:$n[0],g:$n[1],b:$n[2],u:A,v:1}])}const p=Yn("junction-skirt",null,g);p&&(p.junction=i.id,s.push(p));const m=[],x=i.radius,f=(A,P,v,C,E=0)=>{const T=A.b,L={x:u.x-T.x,z:u.z-T.z},_=Math.hypot(L.x,L.z)||1,S=Math.sign((L.x*T.tx+L.z*T.tz)/_)||1,N=A.leg.sTrim+S*x*(1-P),B=_e(A.smp.samples,N),k=A.ctx.crossY(B,A.ctx.baseY(B),A.ctx.halfRoad(B),0)+.025;let F=B.tx,G=B.tz;if(E){const J=Math.cos(E),lt=Math.sin(E),pt=F*J-G*lt,Et=F*lt+G*J;F=pt,G=Et}const H=-G,$=F;m.push([[B.x-H*v-F*C/2,k,B.z-$*v-G*C/2],[B.x+H*v-F*C/2,k,B.z+$*v-G*C/2],[B.x+H*v+F*C/2,k,B.z+$*v+G*C/2],[B.x-H*v+F*C/2,k,B.z-$*v+G*C/2]])};if(i.kind==="merge"){for(const A of a)if(A.leg.role==="branch")for(const P of[.4,.55,.7])f(A,P,1.2,.22,.6)}else{if(i.kind==="tee"||i.kind==="multi")for(const A of a){if(A.leg.role!=="branch")continue;const P=A.leg.halfW*.72;f(A,.55,P,.5)}if(i.kind==="cross"||i.kind==="tee"||i.kind==="wye"||i.kind==="multi")for(const A of a){const P=Math.max(1,A.leg.halfW-.6);for(const v of[.66,.78,.9])f(A,v,P,.45)}}const d=ld("junction-paint",null,m,bi);return d&&(d.junction=i.id,s.push(d)),s}function $l(i,t){const e=[];for(let n=i.s0+3;n<i.s1-3+1e-6;n+=t)e.push(n);return e}function ud(i,t,e,n,s){const r=[],o=tr(i,n),l=Vl(t,[{s0:-1e9,s1:e.s0},{s0:e.s1,s1:1e9}])[0];if(!l||l.length<2)return r;const c=v=>o.halfRoad(v)+Math.max(o.shoulders(v)[0],o.shoulders(v)[1])+.18,u=v=>o.crossY(v,o.baseY(v),o.halfRoad(v),0);for(const v of[-1,1]){const C=l.map(T=>{const L=v*c(T),_=Math.hypot(1,.05),S=N=>({x:T.x-T.tz*L,y:N,z:T.z+T.tx*L,nx:-T.tz*v/_,ny:.05/_,nz:T.tx*v/_,r:He[0],g:He[1],b:He[2],u:L,v:T.s});return[S(u(T)-.03),S(u(T)-1.15)]}),E=Yn("bridge-fascia",i.id,C);E&&r.push(E)}const h=l.reduce((v,C)=>v+c(C),0)/l.length,g=Math.min(5,Math.max(2,Math.round(h*2/3.2)));for(let v=0;v<g;v++){const C=g===1?0:(-1+2*v/(g-1))*((h-.9)/h),E=[{o:-.2,top:!0,n:[-1,0,0]},{o:.2,top:!0,n:[1,0,0]}];for(const _ of E){const S=_.o<0?-1:1,N=l.map(k=>{const F=C*c(k)+_.o,G=H=>({x:k.x-k.tz*F,y:H,z:k.z+k.tx*F,nx:-k.tz*S,ny:0,nz:k.tx*S,r:kn[0],g:kn[1],b:kn[2],u:F,v:k.s});return[G(u(k)-.28),G(u(k)-1.02)]}),B=Yn("bridge-girder",i.id,N);B&&r.push(B)}const T=l.map(_=>{const S=C*c(_),N=u(_)-1.02,B=k=>({x:_.x-_.tz*k,y:N,z:_.z+_.tx*k,nx:0,ny:-1,nz:0,r:kn[0],g:kn[1],b:kn[2],u:k,v:_.s});return[B(S-.2),B(S+.2)]}),L=Yn("bridge-girder",i.id,T);L&&r.push(L)}const p=Math.min(30,Math.max(4,+i.bridgeSpacing||12)),m=(v,C)=>(s?.intersections||[]).some(E=>Math.hypot(E.x-v,E.z-C)<E.radius),x=(v,C,E)=>{if(typeof n=="function"){const T=n(v,C);if(T!=null&&Number.isFinite(T))return T}return E};let f=1/0;for(const v of l)f=Math.min(f,u(v));const d=[];for(const v of $l(e,p)){const C=_e(t,v);if(m(C.x,C.z))continue;const E=Math.atan2(C.tx,C.tz),T=u(C)-1.02,L=x(C.x,C.z,f-6);if(T-L<1.2)continue;const _=c(C);d.push({c:[C.x,T-.45,C.z],s:[_*2+.8,.9,1.2],yaw:E,color:He});const S=_*2>7?[-(_-1.3),_-1.3]:[0];for(const N of S){const B=C.x-C.tz*N,k=C.z+C.tx*N,F=L+.15;d.push({c:[B,F-.35,k],s:[2,.7,2],yaw:E,color:$n});const G=T-.9-F;G>.3&&d.push({c:[B,F+G/2,k],s:[.85,G,.85],yaw:E,color:He})}d.push({c:[C.x,T-.35,C.z],s:[_*2-.6,.65,.5],yaw:E,color:kn})}for(const[v,C]of[[e.s0,-1],[e.s1,1]]){const E=_e(t,v),T=Math.atan2(E.tx,E.tz),L=Math.cos(T),_=Math.sin(T),S=u(E),N=x(E.x,E.z,S-4),B=c(E),k=Math.max(1.2,S+.4-N);d.push({c:[E.x,N+k/2,E.z],s:[B*2+2.4,k,1.6],yaw:T,color:He});for(const F of[-1,1]){const G=F*(B+1.6),H=C*2.4;d.push({c:[E.x+G*L+H*_,N+k*.75/2,E.z-G*_+H*L],s:[.6,k*.75,4.4],yaw:T+F*C*.6,color:He})}}const A=Wl("bridge-substructure",i.id,d);A&&r.push(A);const P=i.bridgeParapet==="wall"?"wall":"rail";for(const v of[-1,1])if(P==="rail"){const C=T=>v*(c(T)+.3),E=T=>o.crossY(T,o.baseY(T),o.halfRoad(T),v*(c(T)-.1));r.push(...Xl(l,v,C,E,{roadId:i.id,railName:"bridge-rail",postName:"bridge-posts",bury:!0,onDeck:!0}))}else{const C=k=>v*(c(k)+.35),E=k=>v*(c(k)+.27),T=k=>C(k)-v*.35,L=[{o0:C,y0:.02,o1:E,y1:.85,n:v},{o0:T,y0:.02,o1:T,y1:.85,n:-v}];for(const k of L){const F=l.map(H=>{const $=u(H),J=(lt,pt)=>({x:H.x-H.tz*lt,y:$+pt,z:H.z+H.tx*lt,nx:-H.tz*k.n,ny:.06,nz:H.tx*k.n,r:He[0],g:He[1],b:He[2],u:lt,v:H.s});return[J(k.o0(H),k.y0),J(k.o1(H),k.y1)]}),G=Yn("bridge-parapet",i.id,F);G&&r.push(G)}const _=l.map(k=>{const F=u(k),G=(H,$)=>({x:k.x-k.tz*H,y:F+$,z:k.z+k.tx*H,nx:0,ny:1,nz:0,r:He[0],g:He[1],b:He[2],u:H,v:k.s});return[G(T(k),.85),G(E(k),.85)]}),S=Yn("bridge-parapet",i.id,_);S&&r.push(S);const N=l.map(k=>{const F=u(k),G=E(k)+v*.02,H=$=>({x:k.x-k.tz*G,y:F+$,z:k.z+k.tx*G,nx:-k.tz*v,ny:0,nz:k.tx*v,r:Pi[0],g:Pi[1],b:Pi[2],u:G,v:k.s});return[H(.88),H(1.06)]}),B=Yn("bridge-parapet-rail",i.id,N);B&&r.push(B)}return r}function Go(i,t,e,n){const s=[],r={triangles:0,roads:0,junctions:0,bridges:0,overpasses:0},o=typeof n=="function"?n:null;for(const a of i.roads||[]){if(a.visible===!1)continue;const l=t.get(a.id);if(!l||!l.count)continue;const c=tr(a,o),u=e?.runs?.get(a.id)||[l.samples],h=(e?.bridges||[]).filter(g=>g.roadId===a.id);u.forEach((g,p)=>{const{parts:m,stats:x}=Hl(a,g,c,{tag:u.length>1?String(p):"",railCuts:h});s.push(...m),r.triangles+=x.triangles}),r.roads++}for(const a of e?.intersections||[]){for(const l of dd(a,i,t,o))l.junction=a.id,l.name=`junction_${Gl(a.id)}__${l.name}`,s.push(l),r.triangles+=l.triangles;r.junctions++}for(const a of e?.bridges||[]){const l=(i.roads||[]).find(u=>u.id===a.roadId),c=t.get(a.roadId);if(!(!l||!c||l.visible===!1)){for(const u of ud(l,c.samples,a,o,e))s.push(u),r.triangles+=u.triangles;r.bridges++}}return r.overpasses=e?.overpasses?.length||0,{parts:s,stats:r}}const Xr="frontier-road-network",jr=1,Sa=["#4a90e2","#e2a44a","#7ee7a5","#c792ea","#f6c66a","#6cd5e0","#f28b82","#9aa0a6"],de=(i,t)=>Number.isFinite(+i)?+i:t;function ts(i,t,e={}){return{id:i,name:`Road ${t}`,color:Sa[(t-1)%Sa.length],visible:!0,closed:!1,lanes:2,laneWidth:3.5,shoulderL:1,shoulderR:1,kerbL:!1,kerbR:!1,camber:.06,surface:"asphalt",centerMarking:"dashed",edgeMarking:!0,guardrailL:!1,guardrailR:!1,bridgeParapet:"rail",bridgeSpacing:12,conform:"design",drapeOffset:.15,points:[],...e}}function Vo(i="Untitled route"){return{format:Xr,version:jr,units:"meters",up:"+Y",name:i,nextId:1,roads:[],junctions:[],heightmap:null,settings:{cornerRadius:6},intersectionOverrides:{}}}function js(i,t){return`${t}${i.nextId++}`}function hd(i,t){const e=(Array.isArray(i.points)?i.points:[]).map((s,r)=>{(!Number.isFinite(+s?.x)||!Number.isFinite(+s?.z))&&t.push(`point #${r+1} had bad XZ and was reset to origin`);const o={x:de(s?.x,0),z:de(s?.z,0),y:de(s?.y,0),w:de(s?.w,1)||1};return s?.bridge&&(o.bridge=!0),o}),n=Math.min(6,Math.max(1,Math.round(de(i.lanes,2))));return{id:String(i.id||`r${Math.floor(Math.random()*1e9)}`),name:String(i.name||"Road"),color:/^#[0-9a-f]{6}$/i.test(i.color||"")?i.color:"#4a90e2",visible:i.visible!==!1,closed:!!i.closed,lanes:n,laneWidth:Math.min(12,Math.max(1.5,de(i.laneWidth,3.5))),shoulderL:Math.min(12,Math.max(0,de(i.shoulderL,1))),shoulderR:Math.min(12,Math.max(0,de(i.shoulderR,1))),kerbL:!!i.kerbL,kerbR:!!i.kerbR,camber:Math.min(.5,Math.max(0,de(i.camber,.06))),surface:kl.includes(i.surface)?i.surface:"asphalt",centerMarking:["none","single","double","dashed"].includes(i.centerMarking)?i.centerMarking:"dashed",edgeMarking:i.edgeMarking!==!1,guardrailL:!!i.guardrailL,guardrailR:!!i.guardrailR,bridgeParapet:i.bridgeParapet==="wall"?"wall":"rail",bridgeSpacing:Math.min(30,Math.max(4,de(i.bridgeSpacing,12))),conform:i.conform==="drape"?"drape":"design",drapeOffset:Math.min(50,Math.max(-50,de(i.drapeOffset,.15))),points:e}}function $r(i){const t=[];let e=i;if(typeof e=="string")try{e=JSON.parse(e)}catch{throw new Error("Not valid JSON — the file could not be parsed.")}if(!e||typeof e!="object")throw new Error("Not a road project file.");e.format!==Xr&&t.push(`format is “${e.format||"?"}”, expected “${Xr}” — loading anyway`),de(e.version,1)>jr&&t.push(`version ${e.version} is newer than this editor (v${jr}) — some data may be ignored`);const n=Vo(String(e.name||"Imported route"));n.nextId=Math.max(1,Math.round(de(e.nextId,1))||1),n.roads=(Array.isArray(e.roads)?e.roads:[]).map(o=>hd(o,t)),n.junctions=(Array.isArray(e.junctions)?e.junctions:[]).map((o,a)=>({id:String(o.id||`j${a+1}`),name:String(o.name||`Junction ${a+1}`),x:de(o.x,0),z:de(o.z,0),y:de(o.y,0),links:(Array.isArray(o.links)?o.links:[]).filter(l=>l&&l.road&&(l.end==="start"||l.end==="end")).map(l=>({road:String(l.road),end:l.end}))}));for(const o of n.junctions){const a=o.links.length;o.links=o.links.filter(l=>n.roads.some(c=>c.id===l.road)),o.links.length!==a&&t.push(`junction “${o.name}” referenced a missing road — link dropped`)}const s=e.heightmap;if(s&&typeof s=="object"&&(n.heightmap={name:String(s.name||"heightmap"),kind:s.kind==="demo"?"demo":"image",width:Math.round(de(s.width,0))||0,height:Math.round(de(s.height,0))||0,minX:de(s.minX,-100),maxX:de(s.maxX,100),minZ:de(s.minZ,-100),maxZ:de(s.maxZ,100),base:de(s.base,0),scale:de(s.scale,30),image:typeof s.image=="string"&&s.image.startsWith("data:image/")?s.image:null},(n.heightmap.width<=0||!n.heightmap.image)&&s.grid&&(n.heightmap.grid=s.grid)),n.settings={cornerRadius:Math.min(14,Math.max(2,de(e.settings?.cornerRadius,6)))},n.intersectionOverrides={},e.intersectionOverrides&&typeof e.intersectionOverrides=="object")for(const[o,a]of Object.entries(e.intersectionOverrides))/^[\w@.-]{1,80}$/.test(o)&&a&&typeof a=="object"&&(n.intersectionOverrides[o]={enabled:a.enabled!==!1});const r=new Set;for(const o of n.roads)r.has(o.id)&&(o.id=`${o.id}_${Math.floor(Math.random()*1e6)}`,t.push("duplicate road id repaired")),r.add(o.id);for(const o of n.junctions)r.has(o.id)&&(o.id=`${o.id}_${Math.floor(Math.random()*1e6)}`,t.push("duplicate junction id repaired")),r.add(o.id);return{project:n,warnings:t}}function fd(i){return JSON.stringify(i,null,2)}function pd(i,{step:t=2}={}){const e=["road_id,road_name,s_m,x_m,y_m,z_m,heading_deg,grade_pct,radius_m,width_m"];for(const n of i.roads||[]){const s=Hi(n.points,{closed:n.closed,step:t}),r=n.lanes*n.laneWidth+n.shoulderL+n.shoulderR;for(const o of s.samples)e.push([n.id,`"${String(n.name).replace(/"/g,'""')}"`,o.s.toFixed(2),o.x.toFixed(3),o.y.toFixed(3),o.z.toFixed(3),o.hdg.toFixed(1),(o.grade*100).toFixed(2),Number.isFinite(o.radius)?o.radius.toFixed(1):"",(r*(o.w||1)).toFixed(2)].join(","))}return e.join(`
`)+`
`}function md(i,t,e,n,s){if(!(n>=0&&s>=0&&n<=t-1&&s<=e-1))return null;const r=Math.floor(n),o=Math.floor(s),a=Math.min(t-1,r+1),l=Math.min(e-1,o+1),c=n-r,u=s-o,h=i[o*t+r],g=i[o*t+a],p=i[l*t+r],m=i[l*t+a];return(h*(1-c)+g*c)*(1-u)+(p*(1-c)+m*c)*u}function $s(i,t,e,n,s=1){const{minX:r,maxX:o,minZ:a,maxZ:l}=n;let c=1/0,u=-1/0;for(let h=0;h<i.length;h++)i[h]<c&&(c=i[h]),i[h]>u&&(u=i[h]);return{rev:s,bounds:{...n},minY:c,maxY:u,gridW:t,gridH:e,grid:i,sample(h,g){if(h<r||h>o||g<a||g>l)return null;const p=(h-r)/(o-r)*(t-1),m=(g-a)/(l-a)*(e-1);return md(i,t,e,p,m)}}}function Yl(i={minX:-160,maxX:160,minZ:-160,maxZ:160},t=128){const e=t,n=t,s=new Float32Array(e*n);for(let r=0;r<n;r++)for(let o=0;o<e;o++){const a=i.minX+(i.maxX-i.minX)*o/(e-1),l=i.minZ+(i.maxZ-i.minZ)*r/(n-1);s[r*e+o]=26*Math.exp(-((a+70)**2+(l-40)**2)/9800)+40*Math.exp(-((a-80)**2+(l+60)**2)/6050)+9*Math.exp(-((a-20)**2+(l-90)**2)/3200)+3.2*Math.sin(a*.045)*Math.cos(l*.05)+1.1*Math.sin(a*.13+1.7)*Math.sin(l*.11+.4)}return{grid:s,w:e,h:n,bounds:i}}const Wo=()=>typeof document<"u";async function ql(i,{bounds:t,base:e=0,scale:n=30,maxCells:s=256}={}){if(!Wo())throw new Error("Image decoding needs a browser.");const r=await new Promise((p,m)=>{const x=new Image;x.onload=()=>p(x),x.onerror=()=>m(new Error("Could not decode that image as a heightmap.")),x.src=i}),o=Math.min(1,s/Math.max(r.naturalWidth,r.naturalHeight)),a=Math.max(2,Math.round(r.naturalWidth*o)),l=Math.max(2,Math.round(r.naturalHeight*o)),c=document.createElement("canvas");c.width=a,c.height=l;const u=c.getContext("2d",{willReadFrequently:!0});u.drawImage(r,0,0,a,l);const h=u.getImageData(0,0,a,l).data,g=new Float32Array(a*l);for(let p=0;p<a*l;p++){const m=(h[p*4]*.299+h[p*4+1]*.587+h[p*4+2]*.114)/255;g[p]=e+m*n}return $s(g,a,l,t||{minX:-a/2,maxX:a/2,minZ:-l/2,maxZ:l/2})}function gd(i){return new Promise((t,e)=>{const n=new FileReader;n.onload=()=>t(n.result),n.onerror=()=>e(new Error("Could not read that file.")),n.readAsDataURL(i)})}function ar(i,t,e="application/json"){if(!Wo())return;const n=new Blob([t],{type:e}),s=URL.createObjectURL(n),r=document.createElement("a");r.href=s,r.download=i,document.body.appendChild(r),r.click(),r.remove(),setTimeout(()=>URL.revokeObjectURL(s),8e3)}function _d(i,t){Wo()&&i.toBlob(e=>{if(!e)return;const n=URL.createObjectURL(e),s=document.createElement("a");s.href=n,s.download=t,document.body.appendChild(s),s.click(),s.remove(),setTimeout(()=>URL.revokeObjectURL(n),8e3)},"image/png")}function xd(){const i=Vo("Ridge Pass");return i.nextId=5,i.roads=[{...ts("r1",1,{name:"Ridge Pass",color:"#4a90e2"}),lanes:2,laneWidth:3.5,shoulderL:1.2,shoulderR:1.2,centerMarking:"double",edgeMarking:!0,guardrailL:!0,guardrailR:!0,surface:"asphalt",points:[{x:-150,z:60,y:2,w:1},{x:-105,z:44,y:5,w:1},{x:-62,z:52,y:8,w:1},{x:-28,z:22,y:11,w:1},{x:-34,z:-22,y:14,w:1},{x:-4,z:-48,y:17,w:1},{x:38,z:-38,y:20,w:1},{x:52,z:2,y:22,w:1}]},{...ts("r2",2,{name:"Quarry Spur",color:"#e2a44a"}),lanes:1,laneWidth:4.5,shoulderL:.8,shoulderR:.8,centerMarking:"none",edgeMarking:!1,surface:"gravel",points:[{x:52,z:2,y:22,w:1},{x:92,z:10,y:19,w:1},{x:128,z:34,y:16,w:1.15},{x:142,z:72,y:13,w:1.25}]},{...ts("r3",3,{name:"Overlook Loop",color:"#7ee7a5"}),closed:!0,lanes:1,laneWidth:3.2,shoulderL:.5,shoulderR:.5,centerMarking:"dashed",edgeMarking:!0,surface:"dirt",points:[{x:-78,z:-72,y:30,w:1},{x:-44,z:-84,y:31,w:1},{x:-18,z:-62,y:30,w:1},{x:-30,z:-34,y:29,w:1},{x:-66,z:-38,y:29,w:1}]}],i.junctions=[{id:"j4",name:"Pass Summit",x:52,z:2,y:22,links:[{road:"r1",end:"end"},{road:"r2",end:"start"}]}],i}const fs={asphalt:{road:"#43474e",shoulder:"#33363c"},concrete:{road:"#8f9494",shoulder:"#717677"},gravel:{road:"#7d6f52",shoulder:"#66593f"},dirt:{road:"#6e5230",shoulder:"#59432a"}},ai="#4a90e2";function vd(i,t,e){const n=i.getContext("2d"),s=i.parentElement;let r=300,o=300,a=1;const l={cx:0,cz:0,scale:4};let c=null,u=null,h=null,g=!1,p=!1,m=null,x=null,f={rev:-1,canvas:null};const d=(V,j)=>[(V-l.cx)*l.scale+r/2,(j-l.cz)*l.scale+o/2],A=(V,j)=>({x:(V-r/2)/l.scale+l.cx,z:(j-o/2)/l.scale+l.cz});function P(){const V=s.getBoundingClientRect();a=Math.min(2,window.devicePixelRatio||1),r=Math.max(50,V.width),o=Math.max(50,V.height),i.width=Math.round(r*a),i.height=Math.round(o*a),lt()}function v(V=null,j=-1){const Q=[],dt=t.project;for(const M of dt.roads){if(M.visible===!1)continue;const z=Pe(dt,M),w=z.length;for(let b=0;b<w;b++)M.closed||b!==0&&b!==w-1||M.id===V&&b===j||Q.push({x:z[b].x,z:z[b].z,roadId:M.id,index:b})}return Q}function C(V,j,Q=null,dt=!1){let M=V,z=j,w=null,b=null,O=null,U=!1;if(t.ui.snapNode){let I=12/l.scale;for(const X of v(Q?.roadId,Q?.index??-1)){const q=Math.hypot(X.x-V,X.z-j);q<I&&(I=q,b=X)}b&&(M=b.x,z=b.z)}if(!b&&dt&&t.ui.snapNode){let I=12/l.scale,X=null;for(const q of t.project.roads){if(q.visible===!1||Q&&q.id===Q.roadId)continue;const nt=e.getSamples(q.id);if(!nt||!nt.count)continue;const R=nt.samples,y=R.length,W=nt.closed?y:y-1;for(let K=0;K<W;K++){const st=R[K],it=R[(K+1)%y];if(V<Math.min(st.x,it.x)-I||V>Math.max(st.x,it.x)+I||j<Math.min(st.z,it.z)-I||j>Math.max(st.z,it.z)+I)continue;const{d:Tt,t:mt}=Si(V,j,st.x,st.z,it.x,it.z);Tt<I&&(I=Tt,X={a:st,b:it,t:mt,roadId:q.id})}}if(X){const{a:q,b:nt,t:R}=X;M=q.x+(nt.x-q.x)*R,z=q.z+(nt.z-q.z)*R,w=q.y+(nt.y-q.y)*R,O={roadId:X.roadId}}}if(!b&&!O&&t.ui.snapGrid){const I=t.ui.gridSize||1;M=Math.round(V/I)*I,z=Math.round(j/I)*I,U=!0}return{x:M,z,y:w,node:b,curve:O,grid:U}}function E(V,j){const Q=t.project,dt=A(V,j);for(const O of Q.junctions||[]){const[U,I]=d(O.x,O.z);if(Math.hypot(U-V,I-j)<13)return{kind:"junction",junctionId:O.id}}let M=null,z=11;for(const O of Q.roads){if(O.visible===!1)continue;const U=Pe(Q,O);for(let I=0;I<U.length;I++){const[X,q]=d(U[I].x,U[I].z),nt=Math.hypot(X-V,q-j);nt<z&&(z=nt,M={kind:"point",roadId:O.id,index:I})}}if(M)return M;let w=null,b=9/l.scale;for(const O of Q.roads){if(O.visible===!1)continue;const U=e.getSamples(O.id);if(!U||!U.count)continue;const I=U.samples,X=I.length,q=U.closed?X:X-1;for(let nt=0;nt<q;nt++){const R=I[nt],y=I[(nt+1)%X],{d:W}=Si(dt.x,dt.z,R.x,R.z,y.x,y.z),K=Wr(O)*(R.w||1)/2;W<Math.max(b,K+1.5/l.scale)&&(w={kind:"road",roadId:O.id,seg:nt,t:0},b=W)}}return w}function T(V,j,Q){const dt=e.getSamples(V);if(!dt||!dt.count)return null;const M=dt.samples,z=M.length,w=dt.closed?z:z-1;let b=null;for(let O=0;O<w;O++){const U=M[O],I=M[(O+1)%z],{d:X,t:q}=Si(j,Q,U.x,U.z,I.x,I.z);(!b||X<b.d)&&(b={d:X,i:O,t:q,x:U.x+(I.x-U.x)*q,z:U.z+(I.z-U.z)*q,s:U.s+(I.s-U.s)*q})}return b}function L(){const V=e.getTerrain();if(!V)return f={rev:-1,canvas:null},null;if(f.rev===V.rev&&f.canvas)return f.canvas;const j=220,Q=document.createElement("canvas");Q.width=j,Q.height=j;const dt=Q.getContext("2d"),M=dt.createImageData(j,j),z=Math.max(1e-6,V.maxY-V.minY);for(let w=0;w<j;w++)for(let b=0;b<j;b++){const O=V.bounds.minX+(V.bounds.maxX-V.bounds.minX)*b/(j-1),U=V.bounds.minZ+(V.bounds.maxZ-V.bounds.minZ)*w/(j-1),I=V.sample(O,U),X=I==null?0:(I-V.minY)/z,q=18+X*66,nt=26+X*52,R=20+X*30,y=(w*j+b)*4;M.data[y]=q,M.data[y+1]=nt,M.data[y+2]=R,M.data[y+3]=I==null?0:235}return dt.putImageData(M,0,0),f={rev:V.rev,canvas:Q},Q}function _(V,j,Q,dt){n.strokeStyle=Q,n.lineWidth=dt,n.lineJoin="round",n.lineCap=j?"round":"butt",n.beginPath(),V.forEach((M,z)=>{const[w,b]=d(M.x,M.z);z===0?n.moveTo(w,b):n.lineTo(w,b)}),j&&n.closePath(),n.stroke()}function S(V,j,Q,dt){const M=[],z=[];for(const w of V){const b=Q(w),O=dt(w);M.push([w.x-w.tz*b,w.z+w.tx*b]),z.push([w.x-w.tz*O,w.z+w.tx*O])}n.beginPath(),M.forEach(([w,b],O)=>{const[U,I]=d(w,b);O===0?n.moveTo(U,I):n.lineTo(U,I)});for(let w=z.length-1;w>=0;w--){const[b,O]=d(z[w][0],z[w][1]);n.lineTo(b,O)}n.closePath()}function N(V,j,Q,dt,M){if(!j.length)return;const z=fs[V.surface]||fs.asphalt,w=X=>V.lanes*V.laneWidth*(X.w||1)/2,b=X=>-(w(X)+V.shoulderL*(X.w||1)),O=X=>w(X)+V.shoulderR*(X.w||1),U=Wr(V),I=U*l.scale>=5;if(dt&&(n.save(),n.shadowColor=ai,n.shadowBlur=14,_(j,Q,"rgba(74,144,226,.55)",Math.max(3,U*l.scale+5)),n.restore()),I){n.fillStyle="rgba(0,0,0,.9)",S(j,Q,q=>b(q)-.35,q=>O(q)+.35),n.fill(),(V.shoulderL>0||V.shoulderR>0)&&(n.fillStyle=z.shoulder,S(j,Q,b,O),n.fill()),n.fillStyle=z.road,S(j,Q,q=>-w(q),q=>w(q)),n.fill();const X=V.centerMarking;if(X==="single"||X==="double"){const q=X==="single"?[0]:[-.18,.18];for(const nt of q)n.strokeStyle=X==="double"?"#d8b93a":"#dfe3e6",n.lineWidth=Math.max(1,.13*l.scale),n.beginPath(),j.forEach((R,y)=>{const[W,K]=d(R.x-R.tz*nt,R.z+R.tx*nt);y===0?n.moveTo(W,K):n.lineTo(W,K)}),Q&&n.closePath(),n.stroke()}else if(X==="dashed"){n.strokeStyle="#dfe3e6",n.lineWidth=Math.max(1,.13*l.scale),n.lineCap="butt";let q=[];const nt=()=>{q.length>1&&(n.beginPath(),q.forEach(([R,y],W)=>W===0?n.moveTo(R,y):n.lineTo(R,y)),n.stroke()),q=[]};j.forEach(R=>{if(R.s%9<3){const[y,W]=d(R.x,R.z);q.push([y,W])}else nt()}),nt()}if(V.edgeMarking){n.strokeStyle="rgba(223,227,230,.85)",n.lineWidth=Math.max(1,.11*l.scale);for(const q of[-1,1]){n.beginPath();let nt=!1;for(const R of j){const y=w(R);if(y<.7){nt=!1;continue}const W=q*(y-.22),[K,st]=d(R.x-R.tz*W,R.z+R.tx*W);nt?n.lineTo(K,st):(n.moveTo(K,st),nt=!0)}n.stroke()}}}else _(j,Q,"rgba(0,0,0,.9)",5),_(j,Q,V.color||z.road,3);if(l.scale>=1.2&&!Q){n.fillStyle=dt?"#fff":"rgba(255,255,255,.5)";const X=Math.max(1,Math.round(28/(l.scale*1)));for(let q=X;q<j.length-1;q+=X*3){const nt=j[q],[R,y]=d(nt.x,nt.z),W=Math.atan2(nt.tz,nt.tx);n.save(),n.translate(R,y),n.rotate(W),n.beginPath(),n.moveTo(-3.4,-4),n.lineTo(3.6,0),n.lineTo(-3.4,4),n.closePath(),n.fill(),n.restore()}}if(M&&l.scale>=2.2){const X=j[Math.floor(j.length/2)],[q,nt]=d(X.x,X.z);n.font='600 11px "Segoe UI",system-ui,sans-serif';const R=n.measureText(V.name).width;n.fillStyle="rgba(0,0,0,.72)";const y=q-R/2-7,W=nt-26;n.beginPath(),n.roundRect(y,W,R+14,18,9),n.fill(),n.fillStyle=dt?"#fff":"rgba(237,237,237,.75)",n.textAlign="center",n.textBaseline="middle",n.fillText(V.name,q,W+9.5)}}function B(V,j){const Q=t.project,dt=Pe(Q,V),M=t.selection;j&&dt.length>1&&(n.strokeStyle="rgba(74,144,226,.5)",n.lineWidth=1,n.setLineDash([5,4]),n.beginPath(),dt.forEach((w,b)=>{const[O,U]=d(w.x,w.z);b===0?n.moveTo(O,U):n.lineTo(O,U)}),V.closed&&n.closePath(),n.stroke(),n.setLineDash([]));const z=!j&&l.scale>=4;if(!(!j&&!z))for(let w=0;w<dt.length;w++){const[b,O]=d(dt[w].x,dt[w].z),U=j&&M.kind==="point"&&M.index===w,I=c?.kind==="point"&&c.roadId===V.id&&c.index===w,X=!!Sn(Q,V.id,w);if(!j){n.fillStyle="rgba(255,255,255,.55)",n.fillRect(b-2,O-2,4,4);continue}const q=U||I?11:9;n.fillStyle=U?ai:"#f4f4f5",n.strokeStyle="#0a0a0b",n.lineWidth=2,n.beginPath(),n.rect(b-q/2,O-q/2,q,q),n.fill(),n.stroke(),X&&(n.strokeStyle="#f59e0b",n.lineWidth=1.6,n.beginPath(),n.arc(b,O,q/2+4,0,Math.PI*2),n.stroke()),V.points[w]?.bridge&&(n.fillStyle="#6cd5e0",n.fillRect(b-2.5,O+7,5,5)),!V.closed&&(w===0||w===dt.length-1)&&(n.fillStyle="rgba(255,255,255,.85)",n.font='700 8px "Segoe UI",system-ui,sans-serif',n.textAlign="center",n.fillText(w===0?"A":"B",b,O-9))}}function k(V){if(!V)return;const j=t.project,Q=new Map;for(const dt of j.roads){const M=e.getSamples(dt.id);M&&Q.set(dt.id,M)}for(const dt of V.intersections||[]){const M=jl(dt,j,Q,null);if(M&&M.ring.length>2){const b=fs[M.surfId]||fs.asphalt;for(const[O,U]of[["rgba(0,0,0,.9)",.35],[b.road,0]])n.fillStyle=O,n.beginPath(),M.ring.forEach((I,X)=>{let q=I.x,nt=I.z;if(U){const W=I.x-M.C.x,K=I.z-M.C.z,st=Math.hypot(W,K)||1;q+=W/st*U,nt+=K/st*U}const[R,y]=d(q,nt);X===0?n.moveTo(R,y):n.lineTo(R,y)}),n.closePath(),n.fill()}const[z,w]=d(dt.x,dt.z);dt.radius*l.scale>=6&&(n.beginPath(),n.arc(z,w,9,0,Math.PI*2),n.fillStyle="rgba(20,21,24,.92)",n.fill(),n.strokeStyle="rgba(246,198,106,.8)",n.lineWidth=1.2,n.stroke(),n.fillStyle="rgba(246,198,106,.95)",n.font='700 10px "Segoe UI",system-ui,sans-serif',n.textAlign="center",n.textBaseline="middle",n.fillText({cross:"X",tee:"T",merge:"M",wye:"Y",elbow:"L",multi:"*"}[dt.kind]||"?",z,w))}for(const dt of V.overpasses||[]){const[M,z]=d(dt.x,dt.z),w=dt.gap<4.5;n.strokeStyle=w?"#ef4444":"rgba(125,231,165,.85)",n.lineWidth=1.6,n.beginPath(),n.arc(M,z,9,0,Math.PI*2),n.stroke(),n.fillStyle=w?"#ef4444":"rgba(125,231,165,.95)",n.font='600 10px "Segoe UI",system-ui,sans-serif',n.textAlign="left",n.textBaseline="middle",n.fillText(`${dt.gap.toFixed(1)}m`,M+12,z)}for(const dt of V.bridges||[]){const M=At(t.project,dt.roadId),z=e.getSamples(dt.roadId);if(!M||!z)continue;const w=z.samples.filter(b=>b.s>=dt.s0&&b.s<=dt.s1);if(w.length>1)for(const b of[-1,1])n.strokeStyle="rgba(125,213,224,.9)",n.lineWidth=1.4,n.beginPath(),w.forEach((O,U)=>{const I=M.lanes*M.laneWidth*(O.w||1)/2,X=(b<0?M.shoulderL:M.shoulderR)*(O.w||1),q=b*(I+X+.18),[nt,R]=d(O.x-O.tz*q,O.z+O.tx*q);U===0?n.moveTo(nt,R):n.lineTo(nt,R)}),n.stroke();n.fillStyle="rgba(125,213,224,.95)";for(const b of $l(dt,+M.bridgeSpacing||12)){const O=_e(z.samples,b),[U,I]=d(O.x,O.z);n.fillRect(U-2.5,I-2.5,5,5)}}}function F(){const V=t.project,j=t.selection;n.textAlign="left",n.textBaseline="middle";for(const Q of V.junctions||[]){const[dt,M]=d(Q.x,Q.z),z=j.kind==="junction"&&j.junctionId===Q.id,w=c?.kind==="junction"&&c.junctionId===Q.id;n.save(),n.translate(dt,M),n.rotate(Math.PI/4);const b=z||w?13:11;n.fillStyle=z?ai:"#f59e0b",n.strokeStyle="#0a0a0b",n.lineWidth=2,n.fillRect(-b/2,-b/2,b,b),n.strokeRect(-b/2,-b/2,b,b),n.restore(),n.font='600 10.5px "Segoe UI",system-ui,sans-serif',n.fillStyle="rgba(246,198,106,.9)",n.fillText(Q.name||Q.id,dt+11,M-10)}}function G(){if(t.ui.showIssues)for(const V of e.getIssues()){if(V.x==null)continue;const[j,Q]=d(V.x,V.z);j<-20||Q<-20||j>r+20||Q>o+20||(n.fillStyle=V.severity==="error"?"#ef4444":V.severity==="warn"?"#f59e0b":ai,n.strokeStyle="#0a0a0b",n.lineWidth=1.5,n.beginPath(),n.moveTo(j,Q-8),n.lineTo(j+7,Q+5),n.lineTo(j-7,Q+5),n.closePath(),n.fill(),n.stroke(),n.fillStyle="#0a0a0b",n.font='800 8px "Segoe UI",system-ui,sans-serif',n.textAlign="center",n.textBaseline="middle",n.fillText("!",j,Q+1.5))}}function H(){let j=[.5,1,2,5,10,25,50,100,250,500,1e3].find(U=>U*l.scale>=26)||1e3;const Q=l.cx-r/2/l.scale,dt=l.cx+r/2/l.scale,M=l.cz-o/2/l.scale,z=l.cz+o/2/l.scale;n.lineWidth=1;for(let U=0;U<2;U++){const I=U===0?j:j*5;n.strokeStyle=U===0?"rgba(255,255,255,.055)":"rgba(255,255,255,.11)",n.beginPath();for(let X=Math.ceil(Q/I)*I;X<=dt;X+=I){const[q]=d(X,0);n.moveTo(Math.round(q)+.5,0),n.lineTo(Math.round(q)+.5,o)}for(let X=Math.ceil(M/I)*I;X<=z;X+=I){const[,q]=d(0,X);n.moveTo(0,Math.round(q)+.5),n.lineTo(r,Math.round(q)+.5)}n.stroke()}n.font='10px "Segoe UI",system-ui,sans-serif',n.fillStyle="rgba(255,255,255,.28)",n.textAlign="left",n.textBaseline="top";const w=j*5;for(let U=Math.ceil(Q/w)*w;U<=dt;U+=w){const[I]=d(U,0);n.fillText(`${U}`,I+4,4)}const[b,O]=d(0,0);b>-30&&b<r+30&&O>-30&&O<o+30&&(n.strokeStyle="rgba(74,144,226,.6)",n.lineWidth=1.5,n.beginPath(),n.moveTo(b-8,O),n.lineTo(b+8,O),n.moveTo(b,O-8),n.lineTo(b,O+8),n.stroke())}function $(){const j=130/l.scale,Q=Math.pow(10,Math.floor(Math.log10(j))),dt=[1,2,5,10].map(U=>U*Q).find(U=>U>=j)||10*Q,M=dt*l.scale,z=14,w=o-24;n.fillStyle="rgba(0,0,0,.65)",n.beginPath(),n.roundRect(z-8,w-8,M+16,30,8),n.fill(),n.fillStyle="#e9e9ec",n.fillRect(z,w+8,M,3),n.fillRect(z,w+4,2,7),n.fillRect(z+M-2,w+4,2,7),n.font='600 10px "Segoe UI",system-ui,sans-serif',n.textAlign="left",n.textBaseline="alphabetic",n.fillText(dt>=1e3?`${(dt/1e3).toFixed(1)} km`:`${dt} m`,z,w+5);const b=r-30,O=34;n.fillStyle="rgba(0,0,0,.65)",n.beginPath(),n.arc(b,O,15,0,Math.PI*2),n.fill(),n.fillStyle="#e9e9ec",n.beginPath(),n.moveTo(b,O-9),n.lineTo(b+5,O+4),n.lineTo(b,O+1),n.lineTo(b-5,O+4),n.closePath(),n.fill(),n.font='700 8px "Segoe UI",system-ui,sans-serif',n.textAlign="center",n.fillText("N",b,O+12)}function J(){if(!x||!u)return;const V=At(t.project,x.roadId);if(!V||!V.points.length)return;const j=V.points[V.points.length-1],[Q,dt]=d(j.x,j.z),[M,z]=d(u.x,u.z);n.strokeStyle=ai,n.lineWidth=1.6,n.setLineDash([6,4]),n.beginPath(),n.moveTo(Q,dt),n.lineTo(M,z),n.stroke(),n.setLineDash([]),n.fillStyle=ai,n.beginPath(),n.arc(M,z,4,0,Math.PI*2),n.fill()}function lt(){n.setTransform(a,0,0,a,0,0),n.fillStyle="#101010",n.fillRect(0,0,r,o);const V=e.getTerrain(),j=L();if(V&&j){const[w,b]=d(V.bounds.minX,V.bounds.minZ),[O,U]=d(V.bounds.maxX,V.bounds.maxZ);n.imageSmoothingEnabled=!0,n.drawImage(j,w,b,O-w,U-b)}H();const Q=t.project,dt=t.selection,M=e.getTopology?.();for(const w of Q.roads){if(w.visible===!1)continue;const b=e.getSamples(w.id);if(!b||!b.count)continue;const O=M?.runs?.get(w.id)||[b.samples],U=O.length===1&&O[0].length===b.samples.length,I=O.reduce((X,q)=>q.length>X.length?q:X,O[0]);for(const X of O)N(w,X,U&&b.closed,dt.roadId===w.id,X===I)}k(M);for(const w of Q.roads)w.visible!==!1&&B(w,dt.roadId===w.id);if(F(),G(),J(),h){const[w,b]=d(h.x,h.z);n.strokeStyle=h.node?"#f59e0b":h.curve?"#7ee7a5":"rgba(74,144,226,.8)",n.lineWidth=1.6,n.beginPath(),n.arc(w,b,9,0,Math.PI*2),n.stroke(),n.beginPath(),n.moveTo(w-13,b),n.lineTo(w-6,b),n.moveTo(w+6,b),n.lineTo(w+13,b),n.moveTo(w,b-13),n.lineTo(w,b-6),n.moveTo(w,b+6),n.lineTo(w,b+13),n.stroke()}if(c?.kind==="point"){const w=At(Q,c.roadId);if(w){const O=Pe(Q,w)[c.index];if(O){const[U,I]=d(O.x,O.z);n.strokeStyle="rgba(255,255,255,.7)",n.lineWidth=1.4,n.beginPath(),n.arc(U,I,10,0,Math.PI*2),n.stroke()}}}const z=t.flash;if(z){const[w,b]=d(z.x,z.z),O=1-Math.max(0,(z.until-performance.now())/1600);n.strokeStyle=`rgba(74,144,226,${1-O})`,n.lineWidth=2,n.beginPath(),n.arc(w,b,8+O*30,0,Math.PI*2),n.stroke(),O<1&&requestAnimationFrame(lt)}$()}function pt(){const V=t.project;let j=1/0,Q=-1/0,dt=1/0,M=-1/0;const z=(I,X)=>{I<j&&(j=I),I>Q&&(Q=I),X<dt&&(dt=X),X>M&&(M=X)};for(const I of V.roads){const X=e.getSamples(I.id);if(X&&X.count)for(const q of X.samples)z(q.x,q.z);else for(const q of I.points)z(q.x,q.z)}const w=e.getTerrain();Number.isFinite(j)||(w?(j=w.bounds.minX,Q=w.bounds.maxX,dt=w.bounds.minZ,M=w.bounds.maxZ):(j=-60,Q=60,dt=-60,M=60));const b=30,O=(r-b*2)/Math.max(10,Q-j),U=(o-b*2)/Math.max(10,M-dt);l.scale=Math.min(60,Math.max(.2,Math.min(O,U))),l.cx=(j+Q)/2,l.cz=(dt+M)/2,lt()}function Et(V,j,Q){l.cx=V,l.cz=j,Q&&(l.scale=Math.min(60,Math.max(.2,Q))),lt()}function ot(){let V=At(t.project,x?.roadId);if(!V){const j=js(t.project,"r"),Q=t.project.roads.length+1;t.transient(dt=>{dt.roads.push(ts(j,Q))}),t.select({kind:"road",roadId:j}),x.roadId=j,V=At(t.project,j)}return V}function ft(){if(x)return;t.checkpoint("draw road");const V=t.selection,j=V.roadId&&!At(t.project,V.roadId)?.closed?V.roadId:null;x={roadId:j,created:!j}}function Ut(V){if(x){if(V)t.undo();else{const j=At(t.project,x.roadId);j&&j.points.length<2?t.undo():t.endGesture()}x=null,lt()}}function Pt(V,j,Q){const dt=t.project,M=At(dt,V);if(!M||M.closed||j!==0&&j!==M.points.length-1||Q.roadId===V)return;const z=At(dt,Q.roadId);if(!z||z.closed)return;const w=j===0?"start":"end",b=Q.index===0?"start":"end",O=Sn(dt,V,j),U=Sn(dt,Q.roadId,Q.index);O&&U&&O.id===U.id||(t.transient(I=>{if(O&&U&&O.id!==U.id){for(const q of U.links)O.links.push(q);I.junctions=I.junctions.filter(q=>q.id!==U.id),I.junctions.includes(O)&&(O.x=Q.x,O.z=Q.z)}else if(O)O.links.push({road:Q.roadId,end:b});else if(U)U.links.push({road:V,end:w});else{const q=js(I,"j");I.junctions.push({id:q,name:`Junction ${(I.junctions||[]).length+1}`,x:Q.x,z:Q.z,y:(M.points[j].y+z.points[Q.index].y)/2,links:[{road:V,end:w},{road:Q.roadId,end:b}]})}const X=Sn(I,V,j);if(X){const q=Pe(I,z)[Q.index];X.x=q.x,X.z=q.z,X.y=(M.points[j].y+q.y)/2}}),e.toast("Endpoints welded — junction created"))}function ct(V){const j=i.getBoundingClientRect();return[V.clientX-j.left,V.clientY-j.top]}i.addEventListener("contextmenu",V=>V.preventDefault()),i.addEventListener("pointerdown",V=>{i.setPointerCapture(V.pointerId),i.focus?.();const[j,Q]=ct(V),dt=A(j,Q),M=p||V.button===1||V.button===2?"pan":t.tool;if(M==="pan"){m={mode:"pan",sx:j,sy:Q,cx:l.cx,cz:l.cz},s.dataset.tool="pan",i.classList.add("dragging");return}if(t.tool==="draw"&&M!=="pan"){if(V.button!==0)return;ft();const w=ot();if(w.closed){Ut(!1);return}if(w.points.length>=3){const U=w.points[0],[I,X]=d(U.x,U.z);if(Math.hypot(I-j,X-Q)<12){t.transient(q=>{At(q,w.id).closed=!0}),t.select({kind:"road",roadId:w.id}),Ut(!1),e.toast("Loop closed");return}}const b=C(dt.x,dt.z,null,!0),O=b.curve&&b.y!=null?+b.y.toFixed(2):w.points.length?w.points[w.points.length-1].y:0;if(t.transient(U=>{At(U,w.id).points.push({x:+b.x.toFixed(3),z:+b.z.toFixed(3),y:O,w:1})}),t.select({kind:"point",roadId:w.id,index:At(t.project,w.id).points.length-1}),b.node&&(b.node.roadId!==w.id||b.node.index!==0)){const U=At(t.project,w.id).points.length-1;b.node.roadId!==w.id&&Pt(w.id,U,b.node)}lt();return}const z=E(j,Q);if(V.button!==0){V.button===2&&t.select({kind:null});return}if(g&&z?.kind==="road"){const w=At(t.project,z.roadId),b=T(z.roadId,dt.x,dt.z);if(w&&b&&!w.closed){const O=Pe(t.project,w);let U=0,I=1/0;for(let nt=0;nt<O.length-1;nt++){const{d:R}=Si(dt.x,dt.z,O[nt].x,O[nt].z,O[nt+1].x,O[nt+1].z);R<I&&(I=R,U=nt)}const X=O[U].y,q=O[U+1].y;t.commit("insert point",nt=>{At(nt,w.id).points.splice(U+1,0,{x:+b.x.toFixed(3),z:+b.z.toFixed(3),y:+((X+q)/2).toFixed(2),w:1})}),t.select({kind:"point",roadId:w.id,index:U+1})}else if(w&&b&&w.closed){const O=Pe(t.project,w);let U=0,I=1/0;for(let X=0;X<O.length;X++){const q=O[X],nt=O[(X+1)%O.length],{d:R}=Si(dt.x,dt.z,q.x,q.z,nt.x,nt.z);R<I&&(I=R,U=X)}t.commit("insert point",X=>{At(X,w.id).points.splice(U+1,0,{x:+b.x.toFixed(3),z:+b.z.toFixed(3),y:+O[U].y.toFixed(2),w:1})}),t.select({kind:"point",roadId:w.id,index:(U+1)%O.length})}lt();return}if(!z){t.select({kind:null}),m={mode:"pan",sx:j,sy:Q,cx:l.cx,cz:l.cz,maybe:!0};return}if(z.kind==="junction"){t.select({kind:"junction",junctionId:z.junctionId});const w=t.project.junctions.find(b=>b.id===z.junctionId);t.checkpoint("move junction"),m={mode:"junction",jid:z.junctionId,dx:dt.x-w.x,dz:dt.z-w.z};return}if(z.kind==="road"){t.select({kind:"road",roadId:z.roadId}),m={mode:"pan",sx:j,sy:Q,cx:l.cx,cz:l.cz,maybe:!0};return}t.select({kind:"point",roadId:z.roadId,index:z.index}),t.checkpoint("move point"),m={mode:"point",roadId:z.roadId,index:z.index,moved:!1}}),i.addEventListener("pointermove",V=>{const[j,Q]=ct(V),dt=A(j,Q);if(u={x:dt.x,z:dt.z},e.onCursor?.(dt.x,dt.z),m?.mode==="pan"){l.cx=m.cx-(j-m.sx)/l.scale,l.cz=m.cz-(Q-m.sy)/l.scale,lt();return}if(m?.mode==="junction"){const M=C(dt.x-m.dx,dt.z-m.dz);t.transient(z=>{const w=z.junctions.find(b=>b.id===m.jid);w&&(w.x=+M.x.toFixed(3),w.z=+M.z.toFixed(3))}),h=M.node||M.grid?{x:M.x,z:M.z,node:!!M.node}:null,lt();return}if(m?.mode==="point"){m.moved=!0;const M=At(t.project,m.roadId),z=M&&!M.closed&&(m.index===0||m.index===M.points.length-1),w=C(dt.x,dt.z,{roadId:m.roadId,index:m.index},!!z);t.transient(b=>{Ji(b,m.roadId,m.index,+w.x.toFixed(3),+w.z.toFixed(3),w.curve&&w.y!=null?+w.y.toFixed(2):void 0)}),h=w.node||w.curve||w.grid?{x:w.x,z:w.z,node:!!w.node,curve:!!w.curve}:null,m.snapNode=w.node,lt();return}if(t.tool==="draw"){const M=C(dt.x,dt.z,null,!0);u={x:M.x,z:M.z},h=M.node||M.curve||M.grid?{x:M.x,z:M.z,node:!!M.node,curve:!!M.curve}:null,c=null}else c=E(j,Q),h=null;lt()});const ut=V=>{i.classList.remove("dragging"),s.dataset.tool=p?"pan":t.tool,m?.mode==="point"&&m.snapNode&&m.moved&&Pt(m.roadId,m.index,m.snapNode),m&&(m.mode==="point"||m.mode==="junction")&&t.endGesture(),m=null,h=null,lt()};i.addEventListener("pointerup",ut),i.addEventListener("pointercancel",ut),i.addEventListener("pointerleave",()=>{u=null,c=null,h=null,e.onCursor?.(null,null),lt()}),i.addEventListener("wheel",V=>{V.preventDefault();const[j,Q]=ct(V),dt=A(j,Q),M=Math.exp(-V.deltaY*.0012);l.scale=Math.min(120,Math.max(.15,l.scale*M));const z=A(j,Q);l.cx+=dt.x-z.x,l.cz+=dt.z-z.z,lt()},{passive:!1}),i.addEventListener("dblclick",V=>{if(t.tool!=="select")return;const[j,Q]=ct(V);if(E(j,Q))return;const M=t.selection,z=At(t.project,M.roadId||St);if(!z||z.closed||!z.points.length)return;const w=A(j,Q),b=C(w.x,w.z),O=Pe(t.project,z),U=Math.hypot(O[0].x-b.x,O[0].z-b.z),I=Math.hypot(O[O.length-1].x-b.x,O[O.length-1].z-b.z),X=U<I;if(Sn(t.project,z.id,X?0:O.length-1)){e.toast("That end is welded to a junction — unweld it first");return}t.commit("extend road",q=>{const nt=At(q,z.id),R=X?nt.points[0].y:nt.points[nt.points.length-1].y,y={x:+b.x.toFixed(3),z:+b.z.toFixed(3),y:R,w:1};X?nt.points.unshift(y):nt.points.push(y)}),t.select({kind:"point",roadId:z.id,index:X?0:At(t.project,z.id).points.length-1})}),window.addEventListener("keydown",V=>{V.key==="Alt"&&(g=!0),V.code==="Space"&&!V.repeat&&V.target===document.body&&(p=!0,V.preventDefault()),V.key==="Enter"&&x&&(V.preventDefault(),Ut(!1)),V.key==="Escape"&&x&&(V.preventDefault(),Ut(!0),e.toast("Draw cancelled"))}),window.addEventListener("keyup",V=>{V.key==="Alt"&&(g=!1),V.code==="Space"&&(p=!1)});let St=null;return t.subscribe(V=>{V==="selection"&&t.selection.roadId&&(St=t.selection.roadId),V==="tool"&&(s.dataset.tool=t.tool,t.tool!=="draw"&&x&&Ut(!1)),(V==="project"||V==="project-live"||V==="selection"||V==="ui"||V==="flash")&&lt()}),s.dataset.tool=t.tool,new ResizeObserver(P).observe(s),{redraw:lt,fitAll:pt,centerOn:Et,w2s:d,s2w:A,get drawing(){return!!x},finishDraw:Ut,exportPNG(V){lt(),_d(i,V)}}}const Xo="180",Li={ROTATE:0,DOLLY:1,PAN:2},wi={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},Md=0,ba=1,yd=2,Zl=1,Kl=2,yn=3,Fn=0,Fe=1,ln=2,Un=0,Di=1,Ea=2,Ta=3,wa=4,Sd=5,Zn=100,bd=101,Ed=102,Td=103,wd=104,Ad=200,Rd=201,Cd=202,Pd=203,Yr=204,qr=205,Ld=206,Dd=207,Id=208,Ud=209,Nd=210,Fd=211,Od=212,zd=213,Bd=214,Zr=0,Kr=1,Jr=2,Ni=3,Qr=4,to=5,eo=6,no=7,Jl=0,kd=1,Hd=2,Nn=0,Gd=1,Vd=2,Wd=3,Ql=4,Xd=5,jd=6,$d=7,tc=300,Fi=301,Oi=302,io=303,so=304,er=306,ro=1e3,Jn=1001,oo=1002,sn=1003,Yd=1004,ps=1005,dn=1006,lr=1007,Qn=1008,fn=1009,ec=1010,nc=1011,ns=1012,jo=1013,ei=1014,bn=1015,as=1016,$o=1017,Yo=1018,is=1020,ic=35902,sc=35899,rc=1021,oc=1022,nn=1023,ss=1026,rs=1027,ac=1028,qo=1029,lc=1030,Zo=1031,Ko=1033,ks=33776,Hs=33777,Gs=33778,Vs=33779,ao=35840,lo=35841,co=35842,uo=35843,ho=36196,fo=37492,po=37496,mo=37808,go=37809,_o=37810,xo=37811,vo=37812,Mo=37813,yo=37814,So=37815,bo=37816,Eo=37817,To=37818,wo=37819,Ao=37820,Ro=37821,Co=36492,Po=36494,Lo=36495,Do=36283,Io=36284,Uo=36285,No=36286,qd=3200,Zd=3201,cc=0,Kd=1,In="",Ke="srgb",zi="srgb-linear",Ys="linear",re="srgb",li=7680,Aa=519,Jd=512,Qd=513,tu=514,dc=515,eu=516,nu=517,iu=518,su=519,Ra=35044,Ca="300 es",un=2e3,qs=2001;class ri{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){const n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){const n=this._listeners;if(n===void 0)return;const s=n[t];if(s!==void 0){const r=s.indexOf(e);r!==-1&&s.splice(r,1)}}dispatchEvent(t){const e=this._listeners;if(e===void 0)return;const n=e[t.type];if(n!==void 0){t.target=this;const s=n.slice(0);for(let r=0,o=s.length;r<o;r++)s[r].call(this,t);t.target=null}}}const Te=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],Ws=Math.PI/180,Fo=180/Math.PI;function ls(){const i=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Te[i&255]+Te[i>>8&255]+Te[i>>16&255]+Te[i>>24&255]+"-"+Te[t&255]+Te[t>>8&255]+"-"+Te[t>>16&15|64]+Te[t>>24&255]+"-"+Te[e&63|128]+Te[e>>8&255]+"-"+Te[e>>16&255]+Te[e>>24&255]+Te[n&255]+Te[n>>8&255]+Te[n>>16&255]+Te[n>>24&255]).toLowerCase()}function Qt(i,t,e){return Math.max(t,Math.min(e,i))}function ru(i,t){return(i%t+t)%t}function cr(i,t,e){return(1-e)*i+e*t}function Xi(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("Invalid component type.")}}function Ie(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("Invalid component type.")}}const ou={DEG2RAD:Ws};class $t{constructor(t=0,e=0){$t.prototype.isVector2=!0,this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){const e=this.x,n=this.y,s=t.elements;return this.x=s[0]*e+s[3]*n+s[6],this.y=s[1]*e+s[4]*n+s[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=Qt(this.x,t.x,e.x),this.y=Qt(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=Qt(this.x,t,e),this.y=Qt(this.y,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Qt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(Qt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){const n=Math.cos(e),s=Math.sin(e),r=this.x-t.x,o=this.y-t.y;return this.x=r*n-o*s+t.x,this.y=r*s+o*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class ni{constructor(t=0,e=0,n=0,s=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=s}static slerpFlat(t,e,n,s,r,o,a){let l=n[s+0],c=n[s+1],u=n[s+2],h=n[s+3];const g=r[o+0],p=r[o+1],m=r[o+2],x=r[o+3];if(a===0){t[e+0]=l,t[e+1]=c,t[e+2]=u,t[e+3]=h;return}if(a===1){t[e+0]=g,t[e+1]=p,t[e+2]=m,t[e+3]=x;return}if(h!==x||l!==g||c!==p||u!==m){let f=1-a;const d=l*g+c*p+u*m+h*x,A=d>=0?1:-1,P=1-d*d;if(P>Number.EPSILON){const C=Math.sqrt(P),E=Math.atan2(C,d*A);f=Math.sin(f*E)/C,a=Math.sin(a*E)/C}const v=a*A;if(l=l*f+g*v,c=c*f+p*v,u=u*f+m*v,h=h*f+x*v,f===1-a){const C=1/Math.sqrt(l*l+c*c+u*u+h*h);l*=C,c*=C,u*=C,h*=C}}t[e]=l,t[e+1]=c,t[e+2]=u,t[e+3]=h}static multiplyQuaternionsFlat(t,e,n,s,r,o){const a=n[s],l=n[s+1],c=n[s+2],u=n[s+3],h=r[o],g=r[o+1],p=r[o+2],m=r[o+3];return t[e]=a*m+u*h+l*p-c*g,t[e+1]=l*m+u*g+c*h-a*p,t[e+2]=c*m+u*p+a*g-l*h,t[e+3]=u*m-a*h-l*g-c*p,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,s){return this._x=t,this._y=e,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){const n=t._x,s=t._y,r=t._z,o=t._order,a=Math.cos,l=Math.sin,c=a(n/2),u=a(s/2),h=a(r/2),g=l(n/2),p=l(s/2),m=l(r/2);switch(o){case"XYZ":this._x=g*u*h+c*p*m,this._y=c*p*h-g*u*m,this._z=c*u*m+g*p*h,this._w=c*u*h-g*p*m;break;case"YXZ":this._x=g*u*h+c*p*m,this._y=c*p*h-g*u*m,this._z=c*u*m-g*p*h,this._w=c*u*h+g*p*m;break;case"ZXY":this._x=g*u*h-c*p*m,this._y=c*p*h+g*u*m,this._z=c*u*m+g*p*h,this._w=c*u*h-g*p*m;break;case"ZYX":this._x=g*u*h-c*p*m,this._y=c*p*h+g*u*m,this._z=c*u*m-g*p*h,this._w=c*u*h+g*p*m;break;case"YZX":this._x=g*u*h+c*p*m,this._y=c*p*h+g*u*m,this._z=c*u*m-g*p*h,this._w=c*u*h-g*p*m;break;case"XZY":this._x=g*u*h-c*p*m,this._y=c*p*h-g*u*m,this._z=c*u*m+g*p*h,this._w=c*u*h+g*p*m;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+o)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){const n=e/2,s=Math.sin(n);return this._x=t.x*s,this._y=t.y*s,this._z=t.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){const e=t.elements,n=e[0],s=e[4],r=e[8],o=e[1],a=e[5],l=e[9],c=e[2],u=e[6],h=e[10],g=n+a+h;if(g>0){const p=.5/Math.sqrt(g+1);this._w=.25/p,this._x=(u-l)*p,this._y=(r-c)*p,this._z=(o-s)*p}else if(n>a&&n>h){const p=2*Math.sqrt(1+n-a-h);this._w=(u-l)/p,this._x=.25*p,this._y=(s+o)/p,this._z=(r+c)/p}else if(a>h){const p=2*Math.sqrt(1+a-n-h);this._w=(r-c)/p,this._x=(s+o)/p,this._y=.25*p,this._z=(l+u)/p}else{const p=2*Math.sqrt(1+h-n-a);this._w=(o-s)/p,this._x=(r+c)/p,this._y=(l+u)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(Qt(this.dot(t),-1,1)))}rotateTowards(t,e){const n=this.angleTo(t);if(n===0)return this;const s=Math.min(1,e/n);return this.slerp(t,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){const n=t._x,s=t._y,r=t._z,o=t._w,a=e._x,l=e._y,c=e._z,u=e._w;return this._x=n*u+o*a+s*c-r*l,this._y=s*u+o*l+r*a-n*c,this._z=r*u+o*c+n*l-s*a,this._w=o*u-n*a-s*l-r*c,this._onChangeCallback(),this}slerp(t,e){if(e===0)return this;if(e===1)return this.copy(t);const n=this._x,s=this._y,r=this._z,o=this._w;let a=o*t._w+n*t._x+s*t._y+r*t._z;if(a<0?(this._w=-t._w,this._x=-t._x,this._y=-t._y,this._z=-t._z,a=-a):this.copy(t),a>=1)return this._w=o,this._x=n,this._y=s,this._z=r,this;const l=1-a*a;if(l<=Number.EPSILON){const p=1-e;return this._w=p*o+e*this._w,this._x=p*n+e*this._x,this._y=p*s+e*this._y,this._z=p*r+e*this._z,this.normalize(),this}const c=Math.sqrt(l),u=Math.atan2(c,a),h=Math.sin((1-e)*u)/c,g=Math.sin(e*u)/c;return this._w=o*h+this._w*g,this._x=n*h+this._x*g,this._y=s*h+this._y*g,this._z=r*h+this._z*g,this._onChangeCallback(),this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){const t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(t),s*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class Z{constructor(t=0,e=0,n=0){Z.prototype.isVector3=!0,this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(Pa.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(Pa.setFromAxisAngle(t,e))}applyMatrix3(t){const e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*s,this.y=r[1]*e+r[4]*n+r[7]*s,this.z=r[2]*e+r[5]*n+r[8]*s,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){const e=this.x,n=this.y,s=this.z,r=t.elements,o=1/(r[3]*e+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*s+r[12])*o,this.y=(r[1]*e+r[5]*n+r[9]*s+r[13])*o,this.z=(r[2]*e+r[6]*n+r[10]*s+r[14])*o,this}applyQuaternion(t){const e=this.x,n=this.y,s=this.z,r=t.x,o=t.y,a=t.z,l=t.w,c=2*(o*s-a*n),u=2*(a*e-r*s),h=2*(r*n-o*e);return this.x=e+l*c+o*h-a*u,this.y=n+l*u+a*c-r*h,this.z=s+l*h+r*u-o*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){const e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*s,this.y=r[1]*e+r[5]*n+r[9]*s,this.z=r[2]*e+r[6]*n+r[10]*s,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=Qt(this.x,t.x,e.x),this.y=Qt(this.y,t.y,e.y),this.z=Qt(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=Qt(this.x,t,e),this.y=Qt(this.y,t,e),this.z=Qt(this.z,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Qt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){const n=t.x,s=t.y,r=t.z,o=e.x,a=e.y,l=e.z;return this.x=s*l-r*a,this.y=r*o-n*l,this.z=n*a-s*o,this}projectOnVector(t){const e=t.lengthSq();if(e===0)return this.set(0,0,0);const n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return dr.copy(this).projectOnVector(t),this.sub(dr)}reflect(t){return this.sub(dr.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(Qt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y,s=this.z-t.z;return e*e+n*n+s*s}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){const s=Math.sin(e)*t;return this.x=s*Math.sin(n),this.y=Math.cos(e)*t,this.z=s*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){const e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),s=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=s,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const dr=new Z,Pa=new ni;class Zt{constructor(t,e,n,s,r,o,a,l,c){Zt.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,o,a,l,c)}set(t,e,n,s,r,o,a,l,c){const u=this.elements;return u[0]=t,u[1]=s,u[2]=a,u[3]=e,u[4]=r,u[5]=l,u[6]=n,u[7]=o,u[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){const e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,s=e.elements,r=this.elements,o=n[0],a=n[3],l=n[6],c=n[1],u=n[4],h=n[7],g=n[2],p=n[5],m=n[8],x=s[0],f=s[3],d=s[6],A=s[1],P=s[4],v=s[7],C=s[2],E=s[5],T=s[8];return r[0]=o*x+a*A+l*C,r[3]=o*f+a*P+l*E,r[6]=o*d+a*v+l*T,r[1]=c*x+u*A+h*C,r[4]=c*f+u*P+h*E,r[7]=c*d+u*v+h*T,r[2]=g*x+p*A+m*C,r[5]=g*f+p*P+m*E,r[8]=g*d+p*v+m*T,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],u=t[8];return e*o*u-e*a*c-n*r*u+n*a*l+s*r*c-s*o*l}invert(){const t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],u=t[8],h=u*o-a*c,g=a*l-u*r,p=c*r-o*l,m=e*h+n*g+s*p;if(m===0)return this.set(0,0,0,0,0,0,0,0,0);const x=1/m;return t[0]=h*x,t[1]=(s*c-u*n)*x,t[2]=(a*n-s*o)*x,t[3]=g*x,t[4]=(u*e-s*l)*x,t[5]=(s*r-a*e)*x,t[6]=p*x,t[7]=(n*l-c*e)*x,t[8]=(o*e-n*r)*x,this}transpose(){let t;const e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){const e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,s,r,o,a){const l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*o+c*a)+o+t,-s*c,s*l,-s*(-c*o+l*a)+a+e,0,0,1),this}scale(t,e){return this.premultiply(ur.makeScale(t,e)),this}rotate(t){return this.premultiply(ur.makeRotation(-t)),this}translate(t,e){return this.premultiply(ur.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){const e=this.elements,n=t.elements;for(let s=0;s<9;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}}const ur=new Zt;function uc(i){for(let t=i.length-1;t>=0;--t)if(i[t]>=65535)return!0;return!1}function Zs(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function au(){const i=Zs("canvas");return i.style.display="block",i}const La={};function os(i){i in La||(La[i]=!0,console.warn(i))}function lu(i,t,e){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(t,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}const Da=new Zt().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Ia=new Zt().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function cu(){const i={enabled:!0,workingColorSpace:zi,spaces:{},convert:function(s,r,o){return this.enabled===!1||r===o||!r||!o||(this.spaces[r].transfer===re&&(s.r=En(s.r),s.g=En(s.g),s.b=En(s.b)),this.spaces[r].primaries!==this.spaces[o].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[o].fromXYZ)),this.spaces[o].transfer===re&&(s.r=Ii(s.r),s.g=Ii(s.g),s.b=Ii(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===In?Ys:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,o){return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[o].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(s,r){return os("THREE.ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),i.workingToColorSpace(s,r)},toWorkingColorSpace:function(s,r){return os("THREE.ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),i.colorSpaceToWorking(s,r)}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[zi]:{primaries:t,whitePoint:n,transfer:Ys,toXYZ:Da,fromXYZ:Ia,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:Ke},outputColorSpaceConfig:{drawingBufferColorSpace:Ke}},[Ke]:{primaries:t,whitePoint:n,transfer:re,toXYZ:Da,fromXYZ:Ia,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:Ke}}}),i}const ne=cu();function En(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Ii(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}let ci;class du{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{ci===void 0&&(ci=Zs("canvas")),ci.width=t.width,ci.height=t.height;const s=ci.getContext("2d");t instanceof ImageData?s.putImageData(t,0,0):s.drawImage(t,0,0,t.width,t.height),n=ci}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){const e=Zs("canvas");e.width=t.width,e.height=t.height;const n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);const s=n.getImageData(0,0,t.width,t.height),r=s.data;for(let o=0;o<r.length;o++)r[o]=En(r[o]/255)*255;return n.putImageData(s,0,0),e}else if(t.data){const e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(En(e[n]/255)*255):e[n]=En(e[n]);return{data:e,width:t.width,height:t.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}}let uu=0;class Jo{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:uu++}),this.uuid=ls(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){const e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):e instanceof VideoFrame?t.set(e.displayHeight,e.displayWidth,0):e!==null?t.set(e.width,e.height,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];const n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let o=0,a=s.length;o<a;o++)s[o].isDataTexture?r.push(hr(s[o].image)):r.push(hr(s[o]))}else r=hr(s);n.url=r}return e||(t.images[this.uuid]=n),n}}function hr(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?du.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}let hu=0;const fr=new Z;class Oe extends ri{constructor(t=Oe.DEFAULT_IMAGE,e=Oe.DEFAULT_MAPPING,n=Jn,s=Jn,r=dn,o=Qn,a=nn,l=fn,c=Oe.DEFAULT_ANISOTROPY,u=In){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:hu++}),this.uuid=ls(),this.name="",this.source=new Jo(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=o,this.anisotropy=c,this.format=a,this.internalFormat=null,this.type=l,this.offset=new $t(0,0),this.repeat=new $t(1,1),this.center=new $t(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Zt,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(fr).x}get height(){return this.source.getSize(fr).y}get depth(){return this.source.getSize(fr).z}get image(){return this.source.data}set image(t=null){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(const e in t){const n=t[e];if(n===void 0){console.warn(`THREE.Texture.setValues(): parameter '${e}' has value of undefined.`);continue}const s=this[e];if(s===void 0){console.warn(`THREE.Texture.setValues(): property '${e}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[e]=n}}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];const n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==tc)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case ro:t.x=t.x-Math.floor(t.x);break;case Jn:t.x=t.x<0?0:1;break;case oo:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case ro:t.y=t.y-Math.floor(t.y);break;case Jn:t.y=t.y<0?0:1;break;case oo:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}}Oe.DEFAULT_IMAGE=null;Oe.DEFAULT_MAPPING=tc;Oe.DEFAULT_ANISOTROPY=1;class pe{constructor(t=0,e=0,n=0,s=1){pe.prototype.isVector4=!0,this.x=t,this.y=e,this.z=n,this.w=s}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,s){return this.x=t,this.y=e,this.z=n,this.w=s,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){const e=this.x,n=this.y,s=this.z,r=this.w,o=t.elements;return this.x=o[0]*e+o[4]*n+o[8]*s+o[12]*r,this.y=o[1]*e+o[5]*n+o[9]*s+o[13]*r,this.z=o[2]*e+o[6]*n+o[10]*s+o[14]*r,this.w=o[3]*e+o[7]*n+o[11]*s+o[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);const e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,s,r;const l=t.elements,c=l[0],u=l[4],h=l[8],g=l[1],p=l[5],m=l[9],x=l[2],f=l[6],d=l[10];if(Math.abs(u-g)<.01&&Math.abs(h-x)<.01&&Math.abs(m-f)<.01){if(Math.abs(u+g)<.1&&Math.abs(h+x)<.1&&Math.abs(m+f)<.1&&Math.abs(c+p+d-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;const P=(c+1)/2,v=(p+1)/2,C=(d+1)/2,E=(u+g)/4,T=(h+x)/4,L=(m+f)/4;return P>v&&P>C?P<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(P),s=E/n,r=T/n):v>C?v<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(v),n=E/s,r=L/s):C<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(C),n=T/r,s=L/r),this.set(n,s,r,e),this}let A=Math.sqrt((f-m)*(f-m)+(h-x)*(h-x)+(g-u)*(g-u));return Math.abs(A)<.001&&(A=1),this.x=(f-m)/A,this.y=(h-x)/A,this.z=(g-u)/A,this.w=Math.acos((c+p+d-1)/2),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=Qt(this.x,t.x,e.x),this.y=Qt(this.y,t.y,e.y),this.z=Qt(this.z,t.z,e.z),this.w=Qt(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=Qt(this.x,t,e),this.y=Qt(this.y,t,e),this.z=Qt(this.z,t,e),this.w=Qt(this.w,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Qt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class fu extends ri{constructor(t=1,e=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:dn,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},n),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=n.depth,this.scissor=new pe(0,0,t,e),this.scissorTest=!1,this.viewport=new pe(0,0,t,e);const s={width:t,height:e,depth:n.depth},r=new Oe(s);this.textures=[];const o=n.count;for(let a=0;a<o;a++)this.textures[a]=r.clone(),this.textures[a].isRenderTargetTexture=!0,this.textures[a].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview}_setTextureOptions(t={}){const e={minFilter:dn,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(e.mapping=t.mapping),t.wrapS!==void 0&&(e.wrapS=t.wrapS),t.wrapT!==void 0&&(e.wrapT=t.wrapT),t.wrapR!==void 0&&(e.wrapR=t.wrapR),t.magFilter!==void 0&&(e.magFilter=t.magFilter),t.minFilter!==void 0&&(e.minFilter=t.minFilter),t.format!==void 0&&(e.format=t.format),t.type!==void 0&&(e.type=t.type),t.anisotropy!==void 0&&(e.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(e.colorSpace=t.colorSpace),t.flipY!==void 0&&(e.flipY=t.flipY),t.generateMipmaps!==void 0&&(e.generateMipmaps=t.generateMipmaps),t.internalFormat!==void 0&&(e.internalFormat=t.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(e)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),t!==null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=t,this.textures[s].image.height=e,this.textures[s].image.depth=n,this.textures[s].isArrayTexture=this.textures[s].image.depth>1;this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let e=0,n=t.textures.length;e<n;e++){this.textures[e]=t.textures[e].clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;const s=Object.assign({},t.textures[e].image);this.textures[e].source=new Jo(s)}return this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}}class ii extends fu{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}}class hc extends Oe{constructor(t=null,e=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=sn,this.minFilter=sn,this.wrapR=Jn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}}class pu extends Oe{constructor(t=null,e=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=sn,this.minFilter=sn,this.wrapR=Jn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class si{constructor(t=new Z(1/0,1/0,1/0),e=new Z(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(Qe.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(Qe.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){const n=Qe.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);const n=t.geometry;if(n!==void 0){const r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let o=0,a=r.count;o<a;o++)t.isMesh===!0?t.getVertexPosition(o,Qe):Qe.fromBufferAttribute(r,o),Qe.applyMatrix4(t.matrixWorld),this.expandByPoint(Qe);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),ms.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),ms.copy(n.boundingBox)),ms.applyMatrix4(t.matrixWorld),this.union(ms)}const s=t.children;for(let r=0,o=s.length;r<o;r++)this.expandByObject(s[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,Qe),Qe.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(ji),gs.subVectors(this.max,ji),di.subVectors(t.a,ji),ui.subVectors(t.b,ji),hi.subVectors(t.c,ji),Tn.subVectors(ui,di),wn.subVectors(hi,ui),Hn.subVectors(di,hi);let e=[0,-Tn.z,Tn.y,0,-wn.z,wn.y,0,-Hn.z,Hn.y,Tn.z,0,-Tn.x,wn.z,0,-wn.x,Hn.z,0,-Hn.x,-Tn.y,Tn.x,0,-wn.y,wn.x,0,-Hn.y,Hn.x,0];return!pr(e,di,ui,hi,gs)||(e=[1,0,0,0,1,0,0,0,1],!pr(e,di,ui,hi,gs))?!1:(_s.crossVectors(Tn,wn),e=[_s.x,_s.y,_s.z],pr(e,di,ui,hi,gs))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,Qe).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(Qe).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(gn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),gn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),gn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),gn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),gn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),gn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),gn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),gn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(gn),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}}const gn=[new Z,new Z,new Z,new Z,new Z,new Z,new Z,new Z],Qe=new Z,ms=new si,di=new Z,ui=new Z,hi=new Z,Tn=new Z,wn=new Z,Hn=new Z,ji=new Z,gs=new Z,_s=new Z,Gn=new Z;function pr(i,t,e,n,s){for(let r=0,o=i.length-3;r<=o;r+=3){Gn.fromArray(i,r);const a=s.x*Math.abs(Gn.x)+s.y*Math.abs(Gn.y)+s.z*Math.abs(Gn.z),l=t.dot(Gn),c=e.dot(Gn),u=n.dot(Gn);if(Math.max(-Math.max(l,c,u),Math.min(l,c,u))>a)return!1}return!0}const mu=new si,$i=new Z,mr=new Z;class nr{constructor(t=new Z,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){const n=this.center;e!==void 0?n.copy(e):mu.setFromPoints(t).getCenter(n);let s=0;for(let r=0,o=t.length;r<o;r++)s=Math.max(s,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(s),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){const e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){const n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;$i.subVectors(t,this.center);const e=$i.lengthSq();if(e>this.radius*this.radius){const n=Math.sqrt(e),s=(n-this.radius)*.5;this.center.addScaledVector($i,s/n),this.radius+=s}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(mr.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint($i.copy(t.center).add(mr)),this.expandByPoint($i.copy(t.center).sub(mr))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}}const _n=new Z,gr=new Z,xs=new Z,An=new Z,_r=new Z,vs=new Z,xr=new Z;class Qo{constructor(t=new Z,e=new Z(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,_n)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);const n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){const e=_n.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(_n.copy(this.origin).addScaledVector(this.direction,e),_n.distanceToSquared(t))}distanceSqToSegment(t,e,n,s){gr.copy(t).add(e).multiplyScalar(.5),xs.copy(e).sub(t).normalize(),An.copy(this.origin).sub(gr);const r=t.distanceTo(e)*.5,o=-this.direction.dot(xs),a=An.dot(this.direction),l=-An.dot(xs),c=An.lengthSq(),u=Math.abs(1-o*o);let h,g,p,m;if(u>0)if(h=o*l-a,g=o*a-l,m=r*u,h>=0)if(g>=-m)if(g<=m){const x=1/u;h*=x,g*=x,p=h*(h+o*g+2*a)+g*(o*h+g+2*l)+c}else g=r,h=Math.max(0,-(o*g+a)),p=-h*h+g*(g+2*l)+c;else g=-r,h=Math.max(0,-(o*g+a)),p=-h*h+g*(g+2*l)+c;else g<=-m?(h=Math.max(0,-(-o*r+a)),g=h>0?-r:Math.min(Math.max(-r,-l),r),p=-h*h+g*(g+2*l)+c):g<=m?(h=0,g=Math.min(Math.max(-r,-l),r),p=g*(g+2*l)+c):(h=Math.max(0,-(o*r+a)),g=h>0?r:Math.min(Math.max(-r,-l),r),p=-h*h+g*(g+2*l)+c);else g=o>0?-r:r,h=Math.max(0,-(o*g+a)),p=-h*h+g*(g+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,h),s&&s.copy(gr).addScaledVector(xs,g),p}intersectSphere(t,e){_n.subVectors(t.center,this.origin);const n=_n.dot(this.direction),s=_n.dot(_n)-n*n,r=t.radius*t.radius;if(s>r)return null;const o=Math.sqrt(r-s),a=n-o,l=n+o;return l<0?null:a<0?this.at(l,e):this.at(a,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){const e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){const n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){const e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,s,r,o,a,l;const c=1/this.direction.x,u=1/this.direction.y,h=1/this.direction.z,g=this.origin;return c>=0?(n=(t.min.x-g.x)*c,s=(t.max.x-g.x)*c):(n=(t.max.x-g.x)*c,s=(t.min.x-g.x)*c),u>=0?(r=(t.min.y-g.y)*u,o=(t.max.y-g.y)*u):(r=(t.max.y-g.y)*u,o=(t.min.y-g.y)*u),n>o||r>s||((r>n||isNaN(n))&&(n=r),(o<s||isNaN(s))&&(s=o),h>=0?(a=(t.min.z-g.z)*h,l=(t.max.z-g.z)*h):(a=(t.max.z-g.z)*h,l=(t.min.z-g.z)*h),n>l||a>s)||((a>n||n!==n)&&(n=a),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,e)}intersectsBox(t){return this.intersectBox(t,_n)!==null}intersectTriangle(t,e,n,s,r){_r.subVectors(e,t),vs.subVectors(n,t),xr.crossVectors(_r,vs);let o=this.direction.dot(xr),a;if(o>0){if(s)return null;a=1}else if(o<0)a=-1,o=-o;else return null;An.subVectors(this.origin,t);const l=a*this.direction.dot(vs.crossVectors(An,vs));if(l<0)return null;const c=a*this.direction.dot(_r.cross(An));if(c<0||l+c>o)return null;const u=-a*An.dot(xr);return u<0?null:this.at(u/o,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class me{constructor(t,e,n,s,r,o,a,l,c,u,h,g,p,m,x,f){me.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,o,a,l,c,u,h,g,p,m,x,f)}set(t,e,n,s,r,o,a,l,c,u,h,g,p,m,x,f){const d=this.elements;return d[0]=t,d[4]=e,d[8]=n,d[12]=s,d[1]=r,d[5]=o,d[9]=a,d[13]=l,d[2]=c,d[6]=u,d[10]=h,d[14]=g,d[3]=p,d[7]=m,d[11]=x,d[15]=f,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new me().fromArray(this.elements)}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){const e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){const e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){const e=this.elements,n=t.elements,s=1/fi.setFromMatrixColumn(t,0).length(),r=1/fi.setFromMatrixColumn(t,1).length(),o=1/fi.setFromMatrixColumn(t,2).length();return e[0]=n[0]*s,e[1]=n[1]*s,e[2]=n[2]*s,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*o,e[9]=n[9]*o,e[10]=n[10]*o,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){const e=this.elements,n=t.x,s=t.y,r=t.z,o=Math.cos(n),a=Math.sin(n),l=Math.cos(s),c=Math.sin(s),u=Math.cos(r),h=Math.sin(r);if(t.order==="XYZ"){const g=o*u,p=o*h,m=a*u,x=a*h;e[0]=l*u,e[4]=-l*h,e[8]=c,e[1]=p+m*c,e[5]=g-x*c,e[9]=-a*l,e[2]=x-g*c,e[6]=m+p*c,e[10]=o*l}else if(t.order==="YXZ"){const g=l*u,p=l*h,m=c*u,x=c*h;e[0]=g+x*a,e[4]=m*a-p,e[8]=o*c,e[1]=o*h,e[5]=o*u,e[9]=-a,e[2]=p*a-m,e[6]=x+g*a,e[10]=o*l}else if(t.order==="ZXY"){const g=l*u,p=l*h,m=c*u,x=c*h;e[0]=g-x*a,e[4]=-o*h,e[8]=m+p*a,e[1]=p+m*a,e[5]=o*u,e[9]=x-g*a,e[2]=-o*c,e[6]=a,e[10]=o*l}else if(t.order==="ZYX"){const g=o*u,p=o*h,m=a*u,x=a*h;e[0]=l*u,e[4]=m*c-p,e[8]=g*c+x,e[1]=l*h,e[5]=x*c+g,e[9]=p*c-m,e[2]=-c,e[6]=a*l,e[10]=o*l}else if(t.order==="YZX"){const g=o*l,p=o*c,m=a*l,x=a*c;e[0]=l*u,e[4]=x-g*h,e[8]=m*h+p,e[1]=h,e[5]=o*u,e[9]=-a*u,e[2]=-c*u,e[6]=p*h+m,e[10]=g-x*h}else if(t.order==="XZY"){const g=o*l,p=o*c,m=a*l,x=a*c;e[0]=l*u,e[4]=-h,e[8]=c*u,e[1]=g*h+x,e[5]=o*u,e[9]=p*h-m,e[2]=m*h-p,e[6]=a*u,e[10]=x*h+g}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(gu,t,_u)}lookAt(t,e,n){const s=this.elements;return Ge.subVectors(t,e),Ge.lengthSq()===0&&(Ge.z=1),Ge.normalize(),Rn.crossVectors(n,Ge),Rn.lengthSq()===0&&(Math.abs(n.z)===1?Ge.x+=1e-4:Ge.z+=1e-4,Ge.normalize(),Rn.crossVectors(n,Ge)),Rn.normalize(),Ms.crossVectors(Ge,Rn),s[0]=Rn.x,s[4]=Ms.x,s[8]=Ge.x,s[1]=Rn.y,s[5]=Ms.y,s[9]=Ge.y,s[2]=Rn.z,s[6]=Ms.z,s[10]=Ge.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,s=e.elements,r=this.elements,o=n[0],a=n[4],l=n[8],c=n[12],u=n[1],h=n[5],g=n[9],p=n[13],m=n[2],x=n[6],f=n[10],d=n[14],A=n[3],P=n[7],v=n[11],C=n[15],E=s[0],T=s[4],L=s[8],_=s[12],S=s[1],N=s[5],B=s[9],k=s[13],F=s[2],G=s[6],H=s[10],$=s[14],J=s[3],lt=s[7],pt=s[11],Et=s[15];return r[0]=o*E+a*S+l*F+c*J,r[4]=o*T+a*N+l*G+c*lt,r[8]=o*L+a*B+l*H+c*pt,r[12]=o*_+a*k+l*$+c*Et,r[1]=u*E+h*S+g*F+p*J,r[5]=u*T+h*N+g*G+p*lt,r[9]=u*L+h*B+g*H+p*pt,r[13]=u*_+h*k+g*$+p*Et,r[2]=m*E+x*S+f*F+d*J,r[6]=m*T+x*N+f*G+d*lt,r[10]=m*L+x*B+f*H+d*pt,r[14]=m*_+x*k+f*$+d*Et,r[3]=A*E+P*S+v*F+C*J,r[7]=A*T+P*N+v*G+C*lt,r[11]=A*L+P*B+v*H+C*pt,r[15]=A*_+P*k+v*$+C*Et,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[4],s=t[8],r=t[12],o=t[1],a=t[5],l=t[9],c=t[13],u=t[2],h=t[6],g=t[10],p=t[14],m=t[3],x=t[7],f=t[11],d=t[15];return m*(+r*l*h-s*c*h-r*a*g+n*c*g+s*a*p-n*l*p)+x*(+e*l*p-e*c*g+r*o*g-s*o*p+s*c*u-r*l*u)+f*(+e*c*h-e*a*p-r*o*h+n*o*p+r*a*u-n*c*u)+d*(-s*a*u-e*l*h+e*a*g+s*o*h-n*o*g+n*l*u)}transpose(){const t=this.elements;let e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){const s=this.elements;return t.isVector3?(s[12]=t.x,s[13]=t.y,s[14]=t.z):(s[12]=t,s[13]=e,s[14]=n),this}invert(){const t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],u=t[8],h=t[9],g=t[10],p=t[11],m=t[12],x=t[13],f=t[14],d=t[15],A=h*f*c-x*g*c+x*l*p-a*f*p-h*l*d+a*g*d,P=m*g*c-u*f*c-m*l*p+o*f*p+u*l*d-o*g*d,v=u*x*c-m*h*c+m*a*p-o*x*p-u*a*d+o*h*d,C=m*h*l-u*x*l-m*a*g+o*x*g+u*a*f-o*h*f,E=e*A+n*P+s*v+r*C;if(E===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const T=1/E;return t[0]=A*T,t[1]=(x*g*r-h*f*r-x*s*p+n*f*p+h*s*d-n*g*d)*T,t[2]=(a*f*r-x*l*r+x*s*c-n*f*c-a*s*d+n*l*d)*T,t[3]=(h*l*r-a*g*r-h*s*c+n*g*c+a*s*p-n*l*p)*T,t[4]=P*T,t[5]=(u*f*r-m*g*r+m*s*p-e*f*p-u*s*d+e*g*d)*T,t[6]=(m*l*r-o*f*r-m*s*c+e*f*c+o*s*d-e*l*d)*T,t[7]=(o*g*r-u*l*r+u*s*c-e*g*c-o*s*p+e*l*p)*T,t[8]=v*T,t[9]=(m*h*r-u*x*r-m*n*p+e*x*p+u*n*d-e*h*d)*T,t[10]=(o*x*r-m*a*r+m*n*c-e*x*c-o*n*d+e*a*d)*T,t[11]=(u*a*r-o*h*r-u*n*c+e*h*c+o*n*p-e*a*p)*T,t[12]=C*T,t[13]=(u*x*s-m*h*s+m*n*g-e*x*g-u*n*f+e*h*f)*T,t[14]=(m*a*s-o*x*s-m*n*l+e*x*l+o*n*f-e*a*f)*T,t[15]=(o*h*s-u*a*s+u*n*l-e*h*l-o*n*g+e*a*g)*T,this}scale(t){const e=this.elements,n=t.x,s=t.y,r=t.z;return e[0]*=n,e[4]*=s,e[8]*=r,e[1]*=n,e[5]*=s,e[9]*=r,e[2]*=n,e[6]*=s,e[10]*=r,e[3]*=n,e[7]*=s,e[11]*=r,this}getMaxScaleOnAxis(){const t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],s=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,s))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){const e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){const n=Math.cos(e),s=Math.sin(e),r=1-n,o=t.x,a=t.y,l=t.z,c=r*o,u=r*a;return this.set(c*o+n,c*a-s*l,c*l+s*a,0,c*a+s*l,u*a+n,u*l-s*o,0,c*l-s*a,u*l+s*o,r*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,s,r,o){return this.set(1,n,r,0,t,1,o,0,e,s,1,0,0,0,0,1),this}compose(t,e,n){const s=this.elements,r=e._x,o=e._y,a=e._z,l=e._w,c=r+r,u=o+o,h=a+a,g=r*c,p=r*u,m=r*h,x=o*u,f=o*h,d=a*h,A=l*c,P=l*u,v=l*h,C=n.x,E=n.y,T=n.z;return s[0]=(1-(x+d))*C,s[1]=(p+v)*C,s[2]=(m-P)*C,s[3]=0,s[4]=(p-v)*E,s[5]=(1-(g+d))*E,s[6]=(f+A)*E,s[7]=0,s[8]=(m+P)*T,s[9]=(f-A)*T,s[10]=(1-(g+x))*T,s[11]=0,s[12]=t.x,s[13]=t.y,s[14]=t.z,s[15]=1,this}decompose(t,e,n){const s=this.elements;let r=fi.set(s[0],s[1],s[2]).length();const o=fi.set(s[4],s[5],s[6]).length(),a=fi.set(s[8],s[9],s[10]).length();this.determinant()<0&&(r=-r),t.x=s[12],t.y=s[13],t.z=s[14],tn.copy(this);const c=1/r,u=1/o,h=1/a;return tn.elements[0]*=c,tn.elements[1]*=c,tn.elements[2]*=c,tn.elements[4]*=u,tn.elements[5]*=u,tn.elements[6]*=u,tn.elements[8]*=h,tn.elements[9]*=h,tn.elements[10]*=h,e.setFromRotationMatrix(tn),n.x=r,n.y=o,n.z=a,this}makePerspective(t,e,n,s,r,o,a=un,l=!1){const c=this.elements,u=2*r/(e-t),h=2*r/(n-s),g=(e+t)/(e-t),p=(n+s)/(n-s);let m,x;if(l)m=r/(o-r),x=o*r/(o-r);else if(a===un)m=-(o+r)/(o-r),x=-2*o*r/(o-r);else if(a===qs)m=-o/(o-r),x=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return c[0]=u,c[4]=0,c[8]=g,c[12]=0,c[1]=0,c[5]=h,c[9]=p,c[13]=0,c[2]=0,c[6]=0,c[10]=m,c[14]=x,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,e,n,s,r,o,a=un,l=!1){const c=this.elements,u=2/(e-t),h=2/(n-s),g=-(e+t)/(e-t),p=-(n+s)/(n-s);let m,x;if(l)m=1/(o-r),x=o/(o-r);else if(a===un)m=-2/(o-r),x=-(o+r)/(o-r);else if(a===qs)m=-1/(o-r),x=-r/(o-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return c[0]=u,c[4]=0,c[8]=0,c[12]=g,c[1]=0,c[5]=h,c[9]=0,c[13]=p,c[2]=0,c[6]=0,c[10]=m,c[14]=x,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){const e=this.elements,n=t.elements;for(let s=0;s<16;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}}const fi=new Z,tn=new me,gu=new Z(0,0,0),_u=new Z(1,1,1),Rn=new Z,Ms=new Z,Ge=new Z,Ua=new me,Na=new ni;class pn{constructor(t=0,e=0,n=0,s=pn.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=s}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,s=this._order){return this._x=t,this._y=e,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){const s=t.elements,r=s[0],o=s[4],a=s[8],l=s[1],c=s[5],u=s[9],h=s[2],g=s[6],p=s[10];switch(e){case"XYZ":this._y=Math.asin(Qt(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-u,p),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(g,c),this._z=0);break;case"YXZ":this._x=Math.asin(-Qt(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(a,p),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-h,r),this._z=0);break;case"ZXY":this._x=Math.asin(Qt(g,-1,1)),Math.abs(g)<.9999999?(this._y=Math.atan2(-h,p),this._z=Math.atan2(-o,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-Qt(h,-1,1)),Math.abs(h)<.9999999?(this._x=Math.atan2(g,p),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-o,c));break;case"YZX":this._z=Math.asin(Qt(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-u,c),this._y=Math.atan2(-h,r)):(this._x=0,this._y=Math.atan2(a,p));break;case"XZY":this._z=Math.asin(-Qt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(g,c),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-u,p),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return Ua.makeRotationFromQuaternion(t),this.setFromRotationMatrix(Ua,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return Na.setFromEuler(this),this.setFromQuaternion(Na,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}pn.DEFAULT_ORDER="XYZ";let fc=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},xu=0;const Fa=new Z,pi=new ni,xn=new me,ys=new Z,Yi=new Z,vu=new Z,Mu=new ni,Oa=new Z(1,0,0),za=new Z(0,1,0),Ba=new Z(0,0,1),ka={type:"added"},yu={type:"removed"},mi={type:"childadded",child:null},vr={type:"childremoved",child:null};class be extends ri{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:xu++}),this.uuid=ls(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=be.DEFAULT_UP.clone();const t=new Z,e=new pn,n=new ni,s=new Z(1,1,1);function r(){n.setFromEuler(e,!1)}function o(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new me},normalMatrix:{value:new Zt}}),this.matrix=new me,this.matrixWorld=new me,this.matrixAutoUpdate=be.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=be.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new fc,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return pi.setFromAxisAngle(t,e),this.quaternion.multiply(pi),this}rotateOnWorldAxis(t,e){return pi.setFromAxisAngle(t,e),this.quaternion.premultiply(pi),this}rotateX(t){return this.rotateOnAxis(Oa,t)}rotateY(t){return this.rotateOnAxis(za,t)}rotateZ(t){return this.rotateOnAxis(Ba,t)}translateOnAxis(t,e){return Fa.copy(t).applyQuaternion(this.quaternion),this.position.add(Fa.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(Oa,t)}translateY(t){return this.translateOnAxis(za,t)}translateZ(t){return this.translateOnAxis(Ba,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(xn.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?ys.copy(t):ys.set(t,e,n);const s=this.parent;this.updateWorldMatrix(!0,!1),Yi.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?xn.lookAt(Yi,ys,this.up):xn.lookAt(ys,Yi,this.up),this.quaternion.setFromRotationMatrix(xn),s&&(xn.extractRotation(s.matrixWorld),pi.setFromRotationMatrix(xn),this.quaternion.premultiply(pi.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(ka),mi.child=t,this.dispatchEvent(mi),mi.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(yu),vr.child=t,this.dispatchEvent(vr),vr.child=null),this}removeFromParent(){const t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),xn.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),xn.multiply(t.parent.matrixWorld)),t.applyMatrix4(xn),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(ka),mi.child=t,this.dispatchEvent(mi),mi.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,s=this.children.length;n<s;n++){const o=this.children[n].getObjectByProperty(t,e);if(o!==void 0)return o}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);const s=this.children;for(let r=0,o=s.length;r<o;r++)s[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Yi,t,vu),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Yi,Mu,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);const e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}traverse(t){t(this);const e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);const e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverseVisible(t)}traverseAncestors(t){const e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);const e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e){const n=this.parent;if(t===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),e===!0){const s=this.children;for(let r=0,o=s.length;r<o;r++)s[r].updateWorldMatrix(!1,!0)}}toJSON(t){const e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(a=>({...a,boundingBox:a.boundingBox?a.boundingBox.toJSON():void 0,boundingSphere:a.boundingSphere?a.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(a=>({...a})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(t),s.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(a,l){return a[l.uuid]===void 0&&(a[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(t.geometries,this.geometry);const a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){const l=a.shapes;if(Array.isArray(l))for(let c=0,u=l.length;c<u;c++){const h=l[c];r(t.shapes,h)}else r(t.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const a=[];for(let l=0,c=this.material.length;l<c;l++)a.push(r(t.materials,this.material[l]));s.material=a}else s.material=r(t.materials,this.material);if(this.children.length>0){s.children=[];for(let a=0;a<this.children.length;a++)s.children.push(this.children[a].toJSON(t).object)}if(this.animations.length>0){s.animations=[];for(let a=0;a<this.animations.length;a++){const l=this.animations[a];s.animations.push(r(t.animations,l))}}if(e){const a=o(t.geometries),l=o(t.materials),c=o(t.textures),u=o(t.images),h=o(t.shapes),g=o(t.skeletons),p=o(t.animations),m=o(t.nodes);a.length>0&&(n.geometries=a),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),u.length>0&&(n.images=u),h.length>0&&(n.shapes=h),g.length>0&&(n.skeletons=g),p.length>0&&(n.animations=p),m.length>0&&(n.nodes=m)}return n.object=s,n;function o(a){const l=[];for(const c in a){const u=a[c];delete u.metadata,l.push(u)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){const s=t.children[n];this.add(s.clone())}return this}}be.DEFAULT_UP=new Z(0,1,0);be.DEFAULT_MATRIX_AUTO_UPDATE=!0;be.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;const en=new Z,vn=new Z,Mr=new Z,Mn=new Z,gi=new Z,_i=new Z,Ha=new Z,yr=new Z,Sr=new Z,br=new Z,Er=new pe,Tr=new pe,wr=new pe;let qi=class Ei{constructor(t=new Z,e=new Z,n=new Z){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,s){s.subVectors(n,e),en.subVectors(t,e),s.cross(en);const r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(t,e,n,s,r){en.subVectors(s,e),vn.subVectors(n,e),Mr.subVectors(t,e);const o=en.dot(en),a=en.dot(vn),l=en.dot(Mr),c=vn.dot(vn),u=vn.dot(Mr),h=o*c-a*a;if(h===0)return r.set(0,0,0),null;const g=1/h,p=(c*l-a*u)*g,m=(o*u-a*l)*g;return r.set(1-p-m,m,p)}static containsPoint(t,e,n,s){return this.getBarycoord(t,e,n,s,Mn)===null?!1:Mn.x>=0&&Mn.y>=0&&Mn.x+Mn.y<=1}static getInterpolation(t,e,n,s,r,o,a,l){return this.getBarycoord(t,e,n,s,Mn)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,Mn.x),l.addScaledVector(o,Mn.y),l.addScaledVector(a,Mn.z),l)}static getInterpolatedAttribute(t,e,n,s,r,o){return Er.setScalar(0),Tr.setScalar(0),wr.setScalar(0),Er.fromBufferAttribute(t,e),Tr.fromBufferAttribute(t,n),wr.fromBufferAttribute(t,s),o.setScalar(0),o.addScaledVector(Er,r.x),o.addScaledVector(Tr,r.y),o.addScaledVector(wr,r.z),o}static isFrontFacing(t,e,n,s){return en.subVectors(n,e),vn.subVectors(t,e),en.cross(vn).dot(s)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,s){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[s]),this}setFromAttributeAndIndices(t,e,n,s){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,s),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return en.subVectors(this.c,this.b),vn.subVectors(this.a,this.b),en.cross(vn).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return Ei.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return Ei.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,s,r){return Ei.getInterpolation(t,this.a,this.b,this.c,e,n,s,r)}containsPoint(t){return Ei.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return Ei.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){const n=this.a,s=this.b,r=this.c;let o,a;gi.subVectors(s,n),_i.subVectors(r,n),yr.subVectors(t,n);const l=gi.dot(yr),c=_i.dot(yr);if(l<=0&&c<=0)return e.copy(n);Sr.subVectors(t,s);const u=gi.dot(Sr),h=_i.dot(Sr);if(u>=0&&h<=u)return e.copy(s);const g=l*h-u*c;if(g<=0&&l>=0&&u<=0)return o=l/(l-u),e.copy(n).addScaledVector(gi,o);br.subVectors(t,r);const p=gi.dot(br),m=_i.dot(br);if(m>=0&&p<=m)return e.copy(r);const x=p*c-l*m;if(x<=0&&c>=0&&m<=0)return a=c/(c-m),e.copy(n).addScaledVector(_i,a);const f=u*m-p*h;if(f<=0&&h-u>=0&&p-m>=0)return Ha.subVectors(r,s),a=(h-u)/(h-u+(p-m)),e.copy(s).addScaledVector(Ha,a);const d=1/(f+x+g);return o=x*d,a=g*d,e.copy(n).addScaledVector(gi,o).addScaledVector(_i,a)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}};const pc={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Cn={h:0,s:0,l:0},Ss={h:0,s:0,l:0};function Ar(i,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?i+(t-i)*6*e:e<1/2?t:e<2/3?i+(t-i)*6*(2/3-e):i}class Jt{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){const s=t;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=Ke){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,ne.colorSpaceToWorking(this,e),this}setRGB(t,e,n,s=ne.workingColorSpace){return this.r=t,this.g=e,this.b=n,ne.colorSpaceToWorking(this,s),this}setHSL(t,e,n,s=ne.workingColorSpace){if(t=ru(t,1),e=Qt(e,0,1),n=Qt(n,0,1),e===0)this.r=this.g=this.b=n;else{const r=n<=.5?n*(1+e):n+e-n*e,o=2*n-r;this.r=Ar(o,r,t+1/3),this.g=Ar(o,r,t),this.b=Ar(o,r,t-1/3)}return ne.colorSpaceToWorking(this,s),this}setStyle(t,e=Ke){function n(r){r!==void 0&&parseFloat(r)<1&&console.warn("THREE.Color: Alpha component of "+t+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(t)){let r;const o=s[1],a=s[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:console.warn("THREE.Color: Unknown color model "+t)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(t)){const r=s[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(o===6)return this.setHex(parseInt(r,16),e);console.warn("THREE.Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=Ke){const n=pc[t.toLowerCase()];return n!==void 0?this.setHex(n,e):console.warn("THREE.Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=En(t.r),this.g=En(t.g),this.b=En(t.b),this}copyLinearToSRGB(t){return this.r=Ii(t.r),this.g=Ii(t.g),this.b=Ii(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=Ke){return ne.workingToColorSpace(we.copy(this),t),Math.round(Qt(we.r*255,0,255))*65536+Math.round(Qt(we.g*255,0,255))*256+Math.round(Qt(we.b*255,0,255))}getHexString(t=Ke){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=ne.workingColorSpace){ne.workingToColorSpace(we.copy(this),e);const n=we.r,s=we.g,r=we.b,o=Math.max(n,s,r),a=Math.min(n,s,r);let l,c;const u=(a+o)/2;if(a===o)l=0,c=0;else{const h=o-a;switch(c=u<=.5?h/(o+a):h/(2-o-a),o){case n:l=(s-r)/h+(s<r?6:0);break;case s:l=(r-n)/h+2;break;case r:l=(n-s)/h+4;break}l/=6}return t.h=l,t.s=c,t.l=u,t}getRGB(t,e=ne.workingColorSpace){return ne.workingToColorSpace(we.copy(this),e),t.r=we.r,t.g=we.g,t.b=we.b,t}getStyle(t=Ke){ne.workingToColorSpace(we.copy(this),t);const e=we.r,n=we.g,s=we.b;return t!==Ke?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(t,e,n){return this.getHSL(Cn),this.setHSL(Cn.h+t,Cn.s+e,Cn.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(Cn),t.getHSL(Ss);const n=cr(Cn.h,Ss.h,e),s=cr(Cn.s,Ss.s,e),r=cr(Cn.l,Ss.l,e);return this.setHSL(n,s,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){const e=this.r,n=this.g,s=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*s,this.g=r[1]*e+r[4]*n+r[7]*s,this.b=r[2]*e+r[5]*n+r[8]*s,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const we=new Jt;Jt.NAMES=pc;let Su=0;class Gi extends ri{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Su++}),this.uuid=ls(),this.name="",this.type="Material",this.blending=Di,this.side=Fn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Yr,this.blendDst=qr,this.blendEquation=Zn,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Jt(0,0,0),this.blendAlpha=0,this.depthFunc=Ni,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=Aa,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=li,this.stencilZFail=li,this.stencilZPass=li,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(const e in t){const n=t[e];if(n===void 0){console.warn(`THREE.Material: parameter '${e}' has value of undefined.`);continue}const s=this[e];if(s===void 0){console.warn(`THREE.Material: '${e}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[e]=n}}toJSON(t){const e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});const n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==Di&&(n.blending=this.blending),this.side!==Fn&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==Yr&&(n.blendSrc=this.blendSrc),this.blendDst!==qr&&(n.blendDst=this.blendDst),this.blendEquation!==Zn&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==Ni&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==Aa&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==li&&(n.stencilFail=this.stencilFail),this.stencilZFail!==li&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==li&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){const o=[];for(const a in r){const l=r[a];delete l.metadata,o.push(l)}return o}if(e){const r=s(t.textures),o=s(t.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;const e=t.clippingPlanes;let n=null;if(e!==null){const s=e.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}}class ta extends Gi{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Jt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new pn,this.combine=Jl,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}}const ge=new Z,bs=new $t;let bu=0;class Ae{constructor(t,e,n=!1){if(Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:bu++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=Ra,this.updateRanges=[],this.gpuType=bn,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[t+s]=e.array[n+s];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)bs.fromBufferAttribute(this,e),bs.applyMatrix3(t),this.setXY(e,bs.x,bs.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)ge.fromBufferAttribute(this,e),ge.applyMatrix3(t),this.setXYZ(e,ge.x,ge.y,ge.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)ge.fromBufferAttribute(this,e),ge.applyMatrix4(t),this.setXYZ(e,ge.x,ge.y,ge.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)ge.fromBufferAttribute(this,e),ge.applyNormalMatrix(t),this.setXYZ(e,ge.x,ge.y,ge.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)ge.fromBufferAttribute(this,e),ge.transformDirection(t),this.setXYZ(e,ge.x,ge.y,ge.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=Xi(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=Ie(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=Xi(e,this.array)),e}setX(t,e){return this.normalized&&(e=Ie(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=Xi(e,this.array)),e}setY(t,e){return this.normalized&&(e=Ie(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=Xi(e,this.array)),e}setZ(t,e){return this.normalized&&(e=Ie(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=Xi(e,this.array)),e}setW(t,e){return this.normalized&&(e=Ie(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=Ie(e,this.array),n=Ie(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,s){return t*=this.itemSize,this.normalized&&(e=Ie(e,this.array),n=Ie(n,this.array),s=Ie(s,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this}setXYZW(t,e,n,s,r){return t*=this.itemSize,this.normalized&&(e=Ie(e,this.array),n=Ie(n,this.array),s=Ie(s,this.array),r=Ie(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==Ra&&(t.usage=this.usage),t}}class mc extends Ae{constructor(t,e,n){super(new Uint16Array(t),e,n)}}class gc extends Ae{constructor(t,e,n){super(new Uint32Array(t),e,n)}}class xe extends Ae{constructor(t,e,n){super(new Float32Array(t),e,n)}}let Eu=0;const qe=new me,Rr=new be,xi=new Z,Ve=new si,Zi=new si,Se=new Z;class je extends ri{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Eu++}),this.uuid=ls(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(uc(t)?gc:mc)(t,1):this.index=t,this}setIndirect(t){return this.indirect=t,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){const e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const r=new Zt().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}const s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(t),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(t){return qe.makeRotationFromQuaternion(t),this.applyMatrix4(qe),this}rotateX(t){return qe.makeRotationX(t),this.applyMatrix4(qe),this}rotateY(t){return qe.makeRotationY(t),this.applyMatrix4(qe),this}rotateZ(t){return qe.makeRotationZ(t),this.applyMatrix4(qe),this}translate(t,e,n){return qe.makeTranslation(t,e,n),this.applyMatrix4(qe),this}scale(t,e,n){return qe.makeScale(t,e,n),this.applyMatrix4(qe),this}lookAt(t){return Rr.lookAt(t),Rr.updateMatrix(),this.applyMatrix4(Rr.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(xi).negate(),this.translate(xi.x,xi.y,xi.z),this}setFromPoints(t){const e=this.getAttribute("position");if(e===void 0){const n=[];for(let s=0,r=t.length;s<r;s++){const o=t[s];n.push(o.x,o.y,o.z||0)}this.setAttribute("position",new xe(n,3))}else{const n=Math.min(t.length,e.count);for(let s=0;s<n;s++){const r=t[s];e.setXYZ(s,r.x,r.y,r.z||0)}t.length>e.count&&console.warn("THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new si);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new Z(-1/0,-1/0,-1/0),new Z(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,s=e.length;n<s;n++){const r=e[n];Ve.setFromBufferAttribute(r),this.morphTargetsRelative?(Se.addVectors(this.boundingBox.min,Ve.min),this.boundingBox.expandByPoint(Se),Se.addVectors(this.boundingBox.max,Ve.max),this.boundingBox.expandByPoint(Se)):(this.boundingBox.expandByPoint(Ve.min),this.boundingBox.expandByPoint(Ve.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new nr);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new Z,1/0);return}if(t){const n=this.boundingSphere.center;if(Ve.setFromBufferAttribute(t),e)for(let r=0,o=e.length;r<o;r++){const a=e[r];Zi.setFromBufferAttribute(a),this.morphTargetsRelative?(Se.addVectors(Ve.min,Zi.min),Ve.expandByPoint(Se),Se.addVectors(Ve.max,Zi.max),Ve.expandByPoint(Se)):(Ve.expandByPoint(Zi.min),Ve.expandByPoint(Zi.max))}Ve.getCenter(n);let s=0;for(let r=0,o=t.count;r<o;r++)Se.fromBufferAttribute(t,r),s=Math.max(s,n.distanceToSquared(Se));if(e)for(let r=0,o=e.length;r<o;r++){const a=e[r],l=this.morphTargetsRelative;for(let c=0,u=a.count;c<u;c++)Se.fromBufferAttribute(a,c),l&&(xi.fromBufferAttribute(t,c),Se.add(xi)),s=Math.max(s,n.distanceToSquared(Se))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=e.position,s=e.normal,r=e.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Ae(new Float32Array(4*n.count),4));const o=this.getAttribute("tangent"),a=[],l=[];for(let L=0;L<n.count;L++)a[L]=new Z,l[L]=new Z;const c=new Z,u=new Z,h=new Z,g=new $t,p=new $t,m=new $t,x=new Z,f=new Z;function d(L,_,S){c.fromBufferAttribute(n,L),u.fromBufferAttribute(n,_),h.fromBufferAttribute(n,S),g.fromBufferAttribute(r,L),p.fromBufferAttribute(r,_),m.fromBufferAttribute(r,S),u.sub(c),h.sub(c),p.sub(g),m.sub(g);const N=1/(p.x*m.y-m.x*p.y);isFinite(N)&&(x.copy(u).multiplyScalar(m.y).addScaledVector(h,-p.y).multiplyScalar(N),f.copy(h).multiplyScalar(p.x).addScaledVector(u,-m.x).multiplyScalar(N),a[L].add(x),a[_].add(x),a[S].add(x),l[L].add(f),l[_].add(f),l[S].add(f))}let A=this.groups;A.length===0&&(A=[{start:0,count:t.count}]);for(let L=0,_=A.length;L<_;++L){const S=A[L],N=S.start,B=S.count;for(let k=N,F=N+B;k<F;k+=3)d(t.getX(k+0),t.getX(k+1),t.getX(k+2))}const P=new Z,v=new Z,C=new Z,E=new Z;function T(L){C.fromBufferAttribute(s,L),E.copy(C);const _=a[L];P.copy(_),P.sub(C.multiplyScalar(C.dot(_))).normalize(),v.crossVectors(E,_);const N=v.dot(l[L])<0?-1:1;o.setXYZW(L,P.x,P.y,P.z,N)}for(let L=0,_=A.length;L<_;++L){const S=A[L],N=S.start,B=S.count;for(let k=N,F=N+B;k<F;k+=3)T(t.getX(k+0)),T(t.getX(k+1)),T(t.getX(k+2))}}computeVertexNormals(){const t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new Ae(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let g=0,p=n.count;g<p;g++)n.setXYZ(g,0,0,0);const s=new Z,r=new Z,o=new Z,a=new Z,l=new Z,c=new Z,u=new Z,h=new Z;if(t)for(let g=0,p=t.count;g<p;g+=3){const m=t.getX(g+0),x=t.getX(g+1),f=t.getX(g+2);s.fromBufferAttribute(e,m),r.fromBufferAttribute(e,x),o.fromBufferAttribute(e,f),u.subVectors(o,r),h.subVectors(s,r),u.cross(h),a.fromBufferAttribute(n,m),l.fromBufferAttribute(n,x),c.fromBufferAttribute(n,f),a.add(u),l.add(u),c.add(u),n.setXYZ(m,a.x,a.y,a.z),n.setXYZ(x,l.x,l.y,l.z),n.setXYZ(f,c.x,c.y,c.z)}else for(let g=0,p=e.count;g<p;g+=3)s.fromBufferAttribute(e,g+0),r.fromBufferAttribute(e,g+1),o.fromBufferAttribute(e,g+2),u.subVectors(o,r),h.subVectors(s,r),u.cross(h),n.setXYZ(g+0,u.x,u.y,u.z),n.setXYZ(g+1,u.x,u.y,u.z),n.setXYZ(g+2,u.x,u.y,u.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)Se.fromBufferAttribute(t,e),Se.normalize(),t.setXYZ(e,Se.x,Se.y,Se.z)}toNonIndexed(){function t(a,l){const c=a.array,u=a.itemSize,h=a.normalized,g=new c.constructor(l.length*u);let p=0,m=0;for(let x=0,f=l.length;x<f;x++){a.isInterleavedBufferAttribute?p=l[x]*a.data.stride+a.offset:p=l[x]*u;for(let d=0;d<u;d++)g[m++]=c[p++]}return new Ae(g,u,h)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const e=new je,n=this.index.array,s=this.attributes;for(const a in s){const l=s[a],c=t(l,n);e.setAttribute(a,c)}const r=this.morphAttributes;for(const a in r){const l=[],c=r[a];for(let u=0,h=c.length;u<h;u++){const g=c[u],p=t(g,n);l.push(p)}e.morphAttributes[a]=l}e.morphTargetsRelative=this.morphTargetsRelative;const o=this.groups;for(let a=0,l=o.length;a<l;a++){const c=o[a];e.addGroup(c.start,c.count,c.materialIndex)}return e}toJSON(){const t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0){const l=this.parameters;for(const c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};const e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});const n=this.attributes;for(const l in n){const c=n[l];t.data.attributes[l]=c.toJSON(t.data)}const s={};let r=!1;for(const l in this.morphAttributes){const c=this.morphAttributes[l],u=[];for(let h=0,g=c.length;h<g;h++){const p=c[h];u.push(p.toJSON(t.data))}u.length>0&&(s[l]=u,r=!0)}r&&(t.data.morphAttributes=s,t.data.morphTargetsRelative=this.morphTargetsRelative);const o=this.groups;o.length>0&&(t.data.groups=JSON.parse(JSON.stringify(o)));const a=this.boundingSphere;return a!==null&&(t.data.boundingSphere=a.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const e={};this.name=t.name;const n=t.index;n!==null&&this.setIndex(n.clone());const s=t.attributes;for(const c in s){const u=s[c];this.setAttribute(c,u.clone(e))}const r=t.morphAttributes;for(const c in r){const u=[],h=r[c];for(let g=0,p=h.length;g<p;g++)u.push(h[g].clone(e));this.morphAttributes[c]=u}this.morphTargetsRelative=t.morphTargetsRelative;const o=t.groups;for(let c=0,u=o.length;c<u;c++){const h=o[c];this.addGroup(h.start,h.count,h.materialIndex)}const a=t.boundingBox;a!==null&&(this.boundingBox=a.clone());const l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}}const Ga=new me,Vn=new Qo,Es=new nr,Va=new Z,Ts=new Z,ws=new Z,As=new Z,Cr=new Z,Rs=new Z,Wa=new Z,Cs=new Z;class Le extends be{constructor(t=new je,e=new ta){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){const a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(t,e){const n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;e.fromBufferAttribute(s,t);const a=this.morphTargetInfluences;if(r&&a){Rs.set(0,0,0);for(let l=0,c=r.length;l<c;l++){const u=a[l],h=r[l];u!==0&&(Cr.fromBufferAttribute(h,t),o?Rs.addScaledVector(Cr,u):Rs.addScaledVector(Cr.sub(e),u))}e.add(Rs)}return e}raycast(t,e){const n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Es.copy(n.boundingSphere),Es.applyMatrix4(r),Vn.copy(t.ray).recast(t.near),!(Es.containsPoint(Vn.origin)===!1&&(Vn.intersectSphere(Es,Va)===null||Vn.origin.distanceToSquared(Va)>(t.far-t.near)**2))&&(Ga.copy(r).invert(),Vn.copy(t.ray).applyMatrix4(Ga),!(n.boundingBox!==null&&Vn.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,Vn)))}_computeIntersections(t,e,n){let s;const r=this.geometry,o=this.material,a=r.index,l=r.attributes.position,c=r.attributes.uv,u=r.attributes.uv1,h=r.attributes.normal,g=r.groups,p=r.drawRange;if(a!==null)if(Array.isArray(o))for(let m=0,x=g.length;m<x;m++){const f=g[m],d=o[f.materialIndex],A=Math.max(f.start,p.start),P=Math.min(a.count,Math.min(f.start+f.count,p.start+p.count));for(let v=A,C=P;v<C;v+=3){const E=a.getX(v),T=a.getX(v+1),L=a.getX(v+2);s=Ps(this,d,t,n,c,u,h,E,T,L),s&&(s.faceIndex=Math.floor(v/3),s.face.materialIndex=f.materialIndex,e.push(s))}}else{const m=Math.max(0,p.start),x=Math.min(a.count,p.start+p.count);for(let f=m,d=x;f<d;f+=3){const A=a.getX(f),P=a.getX(f+1),v=a.getX(f+2);s=Ps(this,o,t,n,c,u,h,A,P,v),s&&(s.faceIndex=Math.floor(f/3),e.push(s))}}else if(l!==void 0)if(Array.isArray(o))for(let m=0,x=g.length;m<x;m++){const f=g[m],d=o[f.materialIndex],A=Math.max(f.start,p.start),P=Math.min(l.count,Math.min(f.start+f.count,p.start+p.count));for(let v=A,C=P;v<C;v+=3){const E=v,T=v+1,L=v+2;s=Ps(this,d,t,n,c,u,h,E,T,L),s&&(s.faceIndex=Math.floor(v/3),s.face.materialIndex=f.materialIndex,e.push(s))}}else{const m=Math.max(0,p.start),x=Math.min(l.count,p.start+p.count);for(let f=m,d=x;f<d;f+=3){const A=f,P=f+1,v=f+2;s=Ps(this,o,t,n,c,u,h,A,P,v),s&&(s.faceIndex=Math.floor(f/3),e.push(s))}}}}function Tu(i,t,e,n,s,r,o,a){let l;if(t.side===Fe?l=n.intersectTriangle(o,r,s,!0,a):l=n.intersectTriangle(s,r,o,t.side===Fn,a),l===null)return null;Cs.copy(a),Cs.applyMatrix4(i.matrixWorld);const c=e.ray.origin.distanceTo(Cs);return c<e.near||c>e.far?null:{distance:c,point:Cs.clone(),object:i}}function Ps(i,t,e,n,s,r,o,a,l,c){i.getVertexPosition(a,Ts),i.getVertexPosition(l,ws),i.getVertexPosition(c,As);const u=Tu(i,t,e,n,Ts,ws,As,Wa);if(u){const h=new Z;qi.getBarycoord(Wa,Ts,ws,As,h),s&&(u.uv=qi.getInterpolatedAttribute(s,a,l,c,h,new $t)),r&&(u.uv1=qi.getInterpolatedAttribute(r,a,l,c,h,new $t)),o&&(u.normal=qi.getInterpolatedAttribute(o,a,l,c,h,new Z),u.normal.dot(n.direction)>0&&u.normal.multiplyScalar(-1));const g={a,b:l,c,normal:new Z,materialIndex:0};qi.getNormal(Ts,ws,As,g.normal),u.face=g,u.barycoord=h}return u}class cs extends je{constructor(t=1,e=1,n=1,s=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:s,heightSegments:r,depthSegments:o};const a=this;s=Math.floor(s),r=Math.floor(r),o=Math.floor(o);const l=[],c=[],u=[],h=[];let g=0,p=0;m("z","y","x",-1,-1,n,e,t,o,r,0),m("z","y","x",1,-1,n,e,-t,o,r,1),m("x","z","y",1,1,t,n,e,s,o,2),m("x","z","y",1,-1,t,n,-e,s,o,3),m("x","y","z",1,-1,t,e,n,s,r,4),m("x","y","z",-1,-1,t,e,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new xe(c,3)),this.setAttribute("normal",new xe(u,3)),this.setAttribute("uv",new xe(h,2));function m(x,f,d,A,P,v,C,E,T,L,_){const S=v/T,N=C/L,B=v/2,k=C/2,F=E/2,G=T+1,H=L+1;let $=0,J=0;const lt=new Z;for(let pt=0;pt<H;pt++){const Et=pt*N-k;for(let ot=0;ot<G;ot++){const ft=ot*S-B;lt[x]=ft*A,lt[f]=Et*P,lt[d]=F,c.push(lt.x,lt.y,lt.z),lt[x]=0,lt[f]=0,lt[d]=E>0?1:-1,u.push(lt.x,lt.y,lt.z),h.push(ot/T),h.push(1-pt/L),$+=1}}for(let pt=0;pt<L;pt++)for(let Et=0;Et<T;Et++){const ot=g+Et+G*pt,ft=g+Et+G*(pt+1),Ut=g+(Et+1)+G*(pt+1),Pt=g+(Et+1)+G*pt;l.push(ot,ft,Pt),l.push(ft,Ut,Pt),J+=6}a.addGroup(p,J,_),p+=J,g+=$}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new cs(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}}function Bi(i){const t={};for(const e in i){t[e]={};for(const n in i[e]){const s=i[e][n];s&&(s.isColor||s.isMatrix3||s.isMatrix4||s.isVector2||s.isVector3||s.isVector4||s.isTexture||s.isQuaternion)?s.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=s.clone():Array.isArray(s)?t[e][n]=s.slice():t[e][n]=s}}return t}function Ce(i){const t={};for(let e=0;e<i.length;e++){const n=Bi(i[e]);for(const s in n)t[s]=n[s]}return t}function wu(i){const t=[];for(let e=0;e<i.length;e++)t.push(i[e].clone());return t}function _c(i){const t=i.getRenderTarget();return t===null?i.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:ne.workingColorSpace}const Au={clone:Bi,merge:Ce};var Ru=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Cu=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class On extends Gi{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Ru,this.fragmentShader=Cu,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=Bi(t.uniforms),this.uniformsGroups=wu(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this}toJSON(t){const e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(const s in this.uniforms){const o=this.uniforms[s].value;o&&o.isTexture?e.uniforms[s]={type:"t",value:o.toJSON(t).uuid}:o&&o.isColor?e.uniforms[s]={type:"c",value:o.getHex()}:o&&o.isVector2?e.uniforms[s]={type:"v2",value:o.toArray()}:o&&o.isVector3?e.uniforms[s]={type:"v3",value:o.toArray()}:o&&o.isVector4?e.uniforms[s]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?e.uniforms[s]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?e.uniforms[s]={type:"m4",value:o.toArray()}:e.uniforms[s]={value:o}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;const n={};for(const s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}}let xc=class extends be{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new me,this.projectionMatrix=new me,this.projectionMatrixInverse=new me,this.coordinateSystem=un,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(t,e){super.updateWorldMatrix(t,e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}};const Pn=new Z,Xa=new $t,ja=new $t;class Je extends xc{constructor(t=50,e=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){const e=.5*this.getFilmHeight()/t;this.fov=Fo*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){const t=Math.tan(Ws*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return Fo*2*Math.atan(Math.tan(Ws*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){Pn.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(Pn.x,Pn.y).multiplyScalar(-t/Pn.z),Pn.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Pn.x,Pn.y).multiplyScalar(-t/Pn.z)}getViewSize(t,e){return this.getViewBounds(t,Xa,ja),e.subVectors(ja,Xa)}setViewOffset(t,e,n,s,r,o){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=this.near;let e=t*Math.tan(Ws*.5*this.fov)/this.zoom,n=2*e,s=this.aspect*n,r=-.5*s;const o=this.view;if(this.view!==null&&this.view.enabled){const l=o.fullWidth,c=o.fullHeight;r+=o.offsetX*s/l,e-=o.offsetY*n/c,s*=o.width/l,n*=o.height/c}const a=this.filmOffset;a!==0&&(r+=t*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,e,e-n,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}}const vi=-90,Mi=1;class Pu extends be{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const s=new Je(vi,Mi,t,e);s.layers=this.layers,this.add(s);const r=new Je(vi,Mi,t,e);r.layers=this.layers,this.add(r);const o=new Je(vi,Mi,t,e);o.layers=this.layers,this.add(o);const a=new Je(vi,Mi,t,e);a.layers=this.layers,this.add(a);const l=new Je(vi,Mi,t,e);l.layers=this.layers,this.add(l);const c=new Je(vi,Mi,t,e);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){const t=this.coordinateSystem,e=this.children.concat(),[n,s,r,o,a,l]=e;for(const c of e)this.remove(c);if(t===un)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===qs)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(const c of e)this.add(c),c.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());const[r,o,a,l,c,u]=this.children,h=t.getRenderTarget(),g=t.getActiveCubeFace(),p=t.getActiveMipmapLevel(),m=t.xr.enabled;t.xr.enabled=!1;const x=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,t.setRenderTarget(n,0,s),t.render(e,r),t.setRenderTarget(n,1,s),t.render(e,o),t.setRenderTarget(n,2,s),t.render(e,a),t.setRenderTarget(n,3,s),t.render(e,l),t.setRenderTarget(n,4,s),t.render(e,c),n.texture.generateMipmaps=x,t.setRenderTarget(n,5,s),t.render(e,u),t.setRenderTarget(h,g,p),t.xr.enabled=m,n.texture.needsPMREMUpdate=!0}}class vc extends Oe{constructor(t=[],e=Fi,n,s,r,o,a,l,c,u){super(t,e,n,s,r,o,a,l,c,u),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}}class Lu extends ii{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;const n={width:t,height:t,depth:1},s=[n,n,n,n,n,n];this.texture=new vc(s),this._setTextureOptions(e),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new cs(5,5,5),r=new On({name:"CubemapFromEquirect",uniforms:Bi(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Fe,blending:Un});r.uniforms.tEquirect.value=e;const o=new Le(s,r),a=e.minFilter;return e.minFilter===Qn&&(e.minFilter=dn),new Pu(1,10,this).update(t,o),e.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(t,e=!0,n=!0,s=!0){const r=t.getRenderTarget();for(let o=0;o<6;o++)t.setRenderTarget(this,o),t.clear(e,n,s);t.setRenderTarget(r)}}class Ai extends be{constructor(){super(),this.isGroup=!0,this.type="Group"}}const Du={type:"move"};class Pr{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Ai,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Ai,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new Z,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new Z),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Ai,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new Z,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new Z),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){const e=this._hand;if(e)for(const n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let s=null,r=null,o=null;const a=this._targetRay,l=this._grip,c=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(c&&t.hand){o=!0;for(const x of t.hand.values()){const f=e.getJointPose(x,n),d=this._getHandJoint(c,x);f!==null&&(d.matrix.fromArray(f.transform.matrix),d.matrix.decompose(d.position,d.rotation,d.scale),d.matrixWorldNeedsUpdate=!0,d.jointRadius=f.radius),d.visible=f!==null}const u=c.joints["index-finger-tip"],h=c.joints["thumb-tip"],g=u.position.distanceTo(h.position),p=.02,m=.005;c.inputState.pinching&&g>p+m?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&g<=p-m&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1));a!==null&&(s=e.getPose(t.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(a.matrix.fromArray(s.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,s.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(s.linearVelocity)):a.hasLinearVelocity=!1,s.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(s.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(Du)))}return a!==null&&(a.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=o!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){const n=new Ai;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}}class ea{constructor(t,e=25e-5){this.isFogExp2=!0,this.name="",this.color=new Jt(t),this.density=e}clone(){return new ea(this.color,this.density)}toJSON(){return{type:"FogExp2",name:this.name,color:this.color.getHex(),density:this.density}}}class Iu extends be{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new pn,this.environmentIntensity=1,this.environmentRotation=new pn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){const e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(e.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(e.object.backgroundIntensity=this.backgroundIntensity),e.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(e.object.environmentIntensity=this.environmentIntensity),e.object.environmentRotation=this.environmentRotation.toArray(),e}}const Lr=new Z,Uu=new Z,Nu=new Zt;class Dn{constructor(t=new Z(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,s){return this.normal.set(t,e,n),this.constant=s,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){const s=Lr.subVectors(n,e).cross(Uu.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(s,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){const t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e){const n=t.delta(Lr),s=this.normal.dot(n);if(s===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;const r=-(t.start.dot(this.normal)+this.constant)/s;return r<0||r>1?null:e.copy(t.start).addScaledVector(n,r)}intersectsLine(t){const e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){const n=e||Nu.getNormalMatrix(t),s=this.coplanarPoint(Lr).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}}const Wn=new nr,Fu=new $t(.5,.5),Ls=new Z;class na{constructor(t=new Dn,e=new Dn,n=new Dn,s=new Dn,r=new Dn,o=new Dn){this.planes=[t,e,n,s,r,o]}set(t,e,n,s,r,o){const a=this.planes;return a[0].copy(t),a[1].copy(e),a[2].copy(n),a[3].copy(s),a[4].copy(r),a[5].copy(o),this}copy(t){const e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=un,n=!1){const s=this.planes,r=t.elements,o=r[0],a=r[1],l=r[2],c=r[3],u=r[4],h=r[5],g=r[6],p=r[7],m=r[8],x=r[9],f=r[10],d=r[11],A=r[12],P=r[13],v=r[14],C=r[15];if(s[0].setComponents(c-o,p-u,d-m,C-A).normalize(),s[1].setComponents(c+o,p+u,d+m,C+A).normalize(),s[2].setComponents(c+a,p+h,d+x,C+P).normalize(),s[3].setComponents(c-a,p-h,d-x,C-P).normalize(),n)s[4].setComponents(l,g,f,v).normalize(),s[5].setComponents(c-l,p-g,d-f,C-v).normalize();else if(s[4].setComponents(c-l,p-g,d-f,C-v).normalize(),e===un)s[5].setComponents(c+l,p+g,d+f,C+v).normalize();else if(e===qs)s[5].setComponents(l,g,f,v).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),Wn.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{const e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),Wn.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(Wn)}intersectsSprite(t){Wn.center.set(0,0,0);const e=Fu.distanceTo(t.center);return Wn.radius=.7071067811865476+e,Wn.applyMatrix4(t.matrixWorld),this.intersectsSphere(Wn)}intersectsSphere(t){const e=this.planes,n=t.center,s=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(t){const e=this.planes;for(let n=0;n<6;n++){const s=e[n];if(Ls.x=s.normal.x>0?t.max.x:t.min.x,Ls.y=s.normal.y>0?t.max.y:t.min.y,Ls.z=s.normal.z>0?t.max.z:t.min.z,s.distanceToPoint(Ls)<0)return!1}return!0}containsPoint(t){const e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class Mc extends Gi{constructor(t){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Jt(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.linewidth=t.linewidth,this.linecap=t.linecap,this.linejoin=t.linejoin,this.fog=t.fog,this}}const Ks=new Z,Js=new Z,$a=new me,Ki=new Qo,Ds=new nr,Dr=new Z,Ya=new Z;class Ou extends be{constructor(t=new je,e=new Mc){super(),this.isLine=!0,this.type="Line",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}computeLineDistances(){const t=this.geometry;if(t.index===null){const e=t.attributes.position,n=[0];for(let s=1,r=e.count;s<r;s++)Ks.fromBufferAttribute(e,s-1),Js.fromBufferAttribute(e,s),n[s]=n[s-1],n[s]+=Ks.distanceTo(Js);t.setAttribute("lineDistance",new xe(n,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(t,e){const n=this.geometry,s=this.matrixWorld,r=t.params.Line.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Ds.copy(n.boundingSphere),Ds.applyMatrix4(s),Ds.radius+=r,t.ray.intersectsSphere(Ds)===!1)return;$a.copy(s).invert(),Ki.copy(t.ray).applyMatrix4($a);const a=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=a*a,c=this.isLineSegments?2:1,u=n.index,g=n.attributes.position;if(u!==null){const p=Math.max(0,o.start),m=Math.min(u.count,o.start+o.count);for(let x=p,f=m-1;x<f;x+=c){const d=u.getX(x),A=u.getX(x+1),P=Is(this,t,Ki,l,d,A,x);P&&e.push(P)}if(this.isLineLoop){const x=u.getX(m-1),f=u.getX(p),d=Is(this,t,Ki,l,x,f,m-1);d&&e.push(d)}}else{const p=Math.max(0,o.start),m=Math.min(g.count,o.start+o.count);for(let x=p,f=m-1;x<f;x+=c){const d=Is(this,t,Ki,l,x,x+1,x);d&&e.push(d)}if(this.isLineLoop){const x=Is(this,t,Ki,l,m-1,p,m-1);x&&e.push(x)}}}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){const a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}}function Is(i,t,e,n,s,r,o){const a=i.geometry.attributes.position;if(Ks.fromBufferAttribute(a,s),Js.fromBufferAttribute(a,r),e.distanceSqToSegment(Ks,Js,Dr,Ya)>n)return;Dr.applyMatrix4(i.matrixWorld);const c=t.ray.origin.distanceTo(Dr);if(!(c<t.near||c>t.far))return{distance:c,point:Ya.clone().applyMatrix4(i.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:i}}const qa=new Z,Za=new Z;class zu extends Ou{constructor(t,e){super(t,e),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){const t=this.geometry;if(t.index===null){const e=t.attributes.position,n=[];for(let s=0,r=e.count;s<r;s+=2)qa.fromBufferAttribute(e,s),Za.fromBufferAttribute(e,s+1),n[s]=s===0?0:n[s-1],n[s+1]=n[s]+qa.distanceTo(Za);t.setAttribute("lineDistance",new xe(n,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}}class yc extends Oe{constructor(t,e,n=ei,s,r,o,a=sn,l=sn,c,u=ss,h=1){if(u!==ss&&u!==rs)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const g={width:t,height:e,depth:h};super(g,s,r,o,a,l,u,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new Jo(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){const e=super.toJSON(t);return this.compareFunction!==null&&(e.compareFunction=this.compareFunction),e}}class Sc extends Oe{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}}class ia extends je{constructor(t=1,e=1,n=1,s=32,r=1,o=!1,a=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:s,heightSegments:r,openEnded:o,thetaStart:a,thetaLength:l};const c=this;s=Math.floor(s),r=Math.floor(r);const u=[],h=[],g=[],p=[];let m=0;const x=[],f=n/2;let d=0;A(),o===!1&&(t>0&&P(!0),e>0&&P(!1)),this.setIndex(u),this.setAttribute("position",new xe(h,3)),this.setAttribute("normal",new xe(g,3)),this.setAttribute("uv",new xe(p,2));function A(){const v=new Z,C=new Z;let E=0;const T=(e-t)/n;for(let L=0;L<=r;L++){const _=[],S=L/r,N=S*(e-t)+t;for(let B=0;B<=s;B++){const k=B/s,F=k*l+a,G=Math.sin(F),H=Math.cos(F);C.x=N*G,C.y=-S*n+f,C.z=N*H,h.push(C.x,C.y,C.z),v.set(G,T,H).normalize(),g.push(v.x,v.y,v.z),p.push(k,1-S),_.push(m++)}x.push(_)}for(let L=0;L<s;L++)for(let _=0;_<r;_++){const S=x[_][L],N=x[_+1][L],B=x[_+1][L+1],k=x[_][L+1];(t>0||_!==0)&&(u.push(S,N,k),E+=3),(e>0||_!==r-1)&&(u.push(N,B,k),E+=3)}c.addGroup(d,E,0),d+=E}function P(v){const C=m,E=new $t,T=new Z;let L=0;const _=v===!0?t:e,S=v===!0?1:-1;for(let B=1;B<=s;B++)h.push(0,f*S,0),g.push(0,S,0),p.push(.5,.5),m++;const N=m;for(let B=0;B<=s;B++){const F=B/s*l+a,G=Math.cos(F),H=Math.sin(F);T.x=_*H,T.y=f*S,T.z=_*G,h.push(T.x,T.y,T.z),g.push(0,S,0),E.x=G*.5+.5,E.y=H*.5*S+.5,p.push(E.x,E.y),m++}for(let B=0;B<s;B++){const k=C+B,F=N+B;v===!0?u.push(F,F+1,k):u.push(F+1,F,k),L+=3}c.addGroup(d,L,v===!0?1:2),d+=L}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new ia(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}}class sa extends je{constructor(t=[],e=[],n=1,s=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:t,indices:e,radius:n,detail:s};const r=[],o=[];a(s),c(n),u(),this.setAttribute("position",new xe(r,3)),this.setAttribute("normal",new xe(r.slice(),3)),this.setAttribute("uv",new xe(o,2)),s===0?this.computeVertexNormals():this.normalizeNormals();function a(A){const P=new Z,v=new Z,C=new Z;for(let E=0;E<e.length;E+=3)p(e[E+0],P),p(e[E+1],v),p(e[E+2],C),l(P,v,C,A)}function l(A,P,v,C){const E=C+1,T=[];for(let L=0;L<=E;L++){T[L]=[];const _=A.clone().lerp(v,L/E),S=P.clone().lerp(v,L/E),N=E-L;for(let B=0;B<=N;B++)B===0&&L===E?T[L][B]=_:T[L][B]=_.clone().lerp(S,B/N)}for(let L=0;L<E;L++)for(let _=0;_<2*(E-L)-1;_++){const S=Math.floor(_/2);_%2===0?(g(T[L][S+1]),g(T[L+1][S]),g(T[L][S])):(g(T[L][S+1]),g(T[L+1][S+1]),g(T[L+1][S]))}}function c(A){const P=new Z;for(let v=0;v<r.length;v+=3)P.x=r[v+0],P.y=r[v+1],P.z=r[v+2],P.normalize().multiplyScalar(A),r[v+0]=P.x,r[v+1]=P.y,r[v+2]=P.z}function u(){const A=new Z;for(let P=0;P<r.length;P+=3){A.x=r[P+0],A.y=r[P+1],A.z=r[P+2];const v=f(A)/2/Math.PI+.5,C=d(A)/Math.PI+.5;o.push(v,1-C)}m(),h()}function h(){for(let A=0;A<o.length;A+=6){const P=o[A+0],v=o[A+2],C=o[A+4],E=Math.max(P,v,C),T=Math.min(P,v,C);E>.9&&T<.1&&(P<.2&&(o[A+0]+=1),v<.2&&(o[A+2]+=1),C<.2&&(o[A+4]+=1))}}function g(A){r.push(A.x,A.y,A.z)}function p(A,P){const v=A*3;P.x=t[v+0],P.y=t[v+1],P.z=t[v+2]}function m(){const A=new Z,P=new Z,v=new Z,C=new Z,E=new $t,T=new $t,L=new $t;for(let _=0,S=0;_<r.length;_+=9,S+=6){A.set(r[_+0],r[_+1],r[_+2]),P.set(r[_+3],r[_+4],r[_+5]),v.set(r[_+6],r[_+7],r[_+8]),E.set(o[S+0],o[S+1]),T.set(o[S+2],o[S+3]),L.set(o[S+4],o[S+5]),C.copy(A).add(P).add(v).divideScalar(3);const N=f(C);x(E,S+0,A,N),x(T,S+2,P,N),x(L,S+4,v,N)}}function x(A,P,v,C){C<0&&A.x===1&&(o[P]=A.x-1),v.x===0&&v.z===0&&(o[P]=C/2/Math.PI+.5)}function f(A){return Math.atan2(A.z,-A.x)}function d(A){return Math.atan2(-A.y,Math.sqrt(A.x*A.x+A.z*A.z))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new sa(t.vertices,t.indices,t.radius,t.details)}}class ra extends sa{constructor(t=1,e=0){const n=[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],s=[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2];super(n,s,t,e),this.type="OctahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new ra(t.radius,t.detail)}}class ki extends je{constructor(t=1,e=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:s};const r=t/2,o=e/2,a=Math.floor(n),l=Math.floor(s),c=a+1,u=l+1,h=t/a,g=e/l,p=[],m=[],x=[],f=[];for(let d=0;d<u;d++){const A=d*g-o;for(let P=0;P<c;P++){const v=P*h-r;m.push(v,-A,0),x.push(0,0,1),f.push(P/a),f.push(1-d/l)}}for(let d=0;d<l;d++)for(let A=0;A<a;A++){const P=A+c*d,v=A+c*(d+1),C=A+1+c*(d+1),E=A+1+c*d;p.push(P,v,E),p.push(v,C,E)}this.setIndex(p),this.setAttribute("position",new xe(m,3)),this.setAttribute("normal",new xe(x,3)),this.setAttribute("uv",new xe(f,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new ki(t.width,t.height,t.widthSegments,t.heightSegments)}}class oa extends je{constructor(t=1,e=.4,n=12,s=48,r=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:t,tube:e,radialSegments:n,tubularSegments:s,arc:r},n=Math.floor(n),s=Math.floor(s);const o=[],a=[],l=[],c=[],u=new Z,h=new Z,g=new Z;for(let p=0;p<=n;p++)for(let m=0;m<=s;m++){const x=m/s*r,f=p/n*Math.PI*2;h.x=(t+e*Math.cos(f))*Math.cos(x),h.y=(t+e*Math.cos(f))*Math.sin(x),h.z=e*Math.sin(f),a.push(h.x,h.y,h.z),u.x=t*Math.cos(x),u.y=t*Math.sin(x),g.subVectors(h,u).normalize(),l.push(g.x,g.y,g.z),c.push(m/s),c.push(p/n)}for(let p=1;p<=n;p++)for(let m=1;m<=s;m++){const x=(s+1)*p+m-1,f=(s+1)*(p-1)+m-1,d=(s+1)*(p-1)+m,A=(s+1)*p+m;o.push(x,f,A),o.push(f,d,A)}this.setIndex(o),this.setAttribute("position",new xe(a,3)),this.setAttribute("normal",new xe(l,3)),this.setAttribute("uv",new xe(c,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new oa(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc)}}class Us extends Gi{constructor(t){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Jt(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Jt(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=cc,this.normalScale=new $t(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new pn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}}class Bu extends Gi{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=qd,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}}class ku extends Gi{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}}class bc extends be{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new Jt(t),this.intensity=e}dispose(){}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){const e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,this.groundColor!==void 0&&(e.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(e.object.distance=this.distance),this.angle!==void 0&&(e.object.angle=this.angle),this.decay!==void 0&&(e.object.decay=this.decay),this.penumbra!==void 0&&(e.object.penumbra=this.penumbra),this.shadow!==void 0&&(e.object.shadow=this.shadow.toJSON()),this.target!==void 0&&(e.object.target=this.target.uuid),e}}class Hu extends bc{constructor(t,e,n){super(t,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(be.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Jt(e)}copy(t,e){return super.copy(t,e),this.groundColor.copy(t.groundColor),this}}const Ir=new me,Ka=new Z,Ja=new Z;class Gu{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new $t(512,512),this.mapType=fn,this.map=null,this.mapPass=null,this.matrix=new me,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new na,this._frameExtents=new $t(1,1),this._viewportCount=1,this._viewports=[new pe(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(t){const e=this.camera,n=this.matrix;Ka.setFromMatrixPosition(t.matrixWorld),e.position.copy(Ka),Ja.setFromMatrixPosition(t.target.matrixWorld),e.lookAt(Ja),e.updateMatrixWorld(),Ir.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Ir,e.coordinateSystem,e.reversedDepth),e.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Ir)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.autoUpdate=t.autoUpdate,this.needsUpdate=t.needsUpdate,this.normalBias=t.normalBias,this.blurSamples=t.blurSamples,this.mapSize.copy(t.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){const t={};return this.intensity!==1&&(t.intensity=this.intensity),this.bias!==0&&(t.bias=this.bias),this.normalBias!==0&&(t.normalBias=this.normalBias),this.radius!==1&&(t.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(t.mapSize=this.mapSize.toArray()),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}}class Ec extends xc{constructor(t=-1,e=1,n=1,s=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=s,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,s,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2;let r=n-t,o=n+t,a=s+e,l=s-e;if(this.view!==null&&this.view.enabled){const c=(this.right-this.left)/this.view.fullWidth/this.zoom,u=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,o=r+c*this.view.width,a-=u*this.view.offsetY,l=a-u*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}}class Vu extends Gu{constructor(){super(new Ec(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class Qa extends bc{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(be.DEFAULT_UP),this.updateMatrix(),this.target=new be,this.shadow=new Vu}dispose(){this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}}class Wu extends Je{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t}}class Xu{constructor(t=!0){this.autoStart=t,this.startTime=0,this.oldTime=0,this.elapsedTime=0,this.running=!1}start(){this.startTime=performance.now(),this.oldTime=this.startTime,this.elapsedTime=0,this.running=!0}stop(){this.getElapsedTime(),this.running=!1,this.autoStart=!1}getElapsedTime(){return this.getDelta(),this.elapsedTime}getDelta(){let t=0;if(this.autoStart&&!this.running)return this.start(),0;if(this.running){const e=performance.now();t=(e-this.oldTime)/1e3,this.oldTime=e,this.elapsedTime+=t}return t}}class tl{constructor(t=1,e=0,n=0){this.radius=t,this.phi=e,this.theta=n}set(t,e,n){return this.radius=t,this.phi=e,this.theta=n,this}copy(t){return this.radius=t.radius,this.phi=t.phi,this.theta=t.theta,this}makeSafe(){return this.phi=Qt(this.phi,1e-6,Math.PI-1e-6),this}setFromVector3(t){return this.setFromCartesianCoords(t.x,t.y,t.z)}setFromCartesianCoords(t,e,n){return this.radius=Math.sqrt(t*t+e*e+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(t,n),this.phi=Math.acos(Qt(e/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}}class el extends zu{constructor(t=10,e=10,n=4473924,s=8947848){n=new Jt(n),s=new Jt(s);const r=e/2,o=t/e,a=t/2,l=[],c=[];for(let g=0,p=0,m=-a;g<=e;g++,m+=o){l.push(-a,0,m,a,0,m),l.push(m,0,-a,m,0,a);const x=g===r?n:s;x.toArray(c,p),p+=3,x.toArray(c,p),p+=3,x.toArray(c,p),p+=3,x.toArray(c,p),p+=3}const u=new je;u.setAttribute("position",new xe(l,3)),u.setAttribute("color",new xe(c,3));const h=new Mc({vertexColors:!0,toneMapped:!1});super(u,h),this.type="GridHelper"}dispose(){this.geometry.dispose(),this.material.dispose()}}class ju extends ri{constructor(t,e=null){super(),this.object=t,this.domElement=e,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(t){if(t===void 0){console.warn("THREE.Controls: connect() now requires an element.");return}this.domElement!==null&&this.disconnect(),this.domElement=t}disconnect(){}dispose(){}update(){}}function nl(i,t,e,n){const s=$u(n);switch(e){case rc:return i*t;case ac:return i*t/s.components*s.byteLength;case qo:return i*t/s.components*s.byteLength;case lc:return i*t*2/s.components*s.byteLength;case Zo:return i*t*2/s.components*s.byteLength;case oc:return i*t*3/s.components*s.byteLength;case nn:return i*t*4/s.components*s.byteLength;case Ko:return i*t*4/s.components*s.byteLength;case ks:case Hs:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case Gs:case Vs:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case lo:case uo:return Math.max(i,16)*Math.max(t,8)/4;case ao:case co:return Math.max(i,8)*Math.max(t,8)/2;case ho:case fo:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case po:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case mo:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case go:return Math.floor((i+4)/5)*Math.floor((t+3)/4)*16;case _o:return Math.floor((i+4)/5)*Math.floor((t+4)/5)*16;case xo:return Math.floor((i+5)/6)*Math.floor((t+4)/5)*16;case vo:return Math.floor((i+5)/6)*Math.floor((t+5)/6)*16;case Mo:return Math.floor((i+7)/8)*Math.floor((t+4)/5)*16;case yo:return Math.floor((i+7)/8)*Math.floor((t+5)/6)*16;case So:return Math.floor((i+7)/8)*Math.floor((t+7)/8)*16;case bo:return Math.floor((i+9)/10)*Math.floor((t+4)/5)*16;case Eo:return Math.floor((i+9)/10)*Math.floor((t+5)/6)*16;case To:return Math.floor((i+9)/10)*Math.floor((t+7)/8)*16;case wo:return Math.floor((i+9)/10)*Math.floor((t+9)/10)*16;case Ao:return Math.floor((i+11)/12)*Math.floor((t+9)/10)*16;case Ro:return Math.floor((i+11)/12)*Math.floor((t+11)/12)*16;case Co:case Po:case Lo:return Math.ceil(i/4)*Math.ceil(t/4)*16;case Do:case Io:return Math.ceil(i/4)*Math.ceil(t/4)*8;case Uo:case No:return Math.ceil(i/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function $u(i){switch(i){case fn:case ec:return{byteLength:1,components:1};case ns:case nc:case as:return{byteLength:2,components:1};case $o:case Yo:return{byteLength:2,components:4};case ei:case jo:case bn:return{byteLength:4,components:1};case ic:case sc:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Xo}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=Xo);function Tc(){let i=null,t=!1,e=null,n=null;function s(r,o){e(r,o),n=i.requestAnimationFrame(s)}return{start:function(){t!==!0&&e!==null&&(n=i.requestAnimationFrame(s),t=!0)},stop:function(){i.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){i=r}}}function Yu(i){const t=new WeakMap;function e(a,l){const c=a.array,u=a.usage,h=c.byteLength,g=i.createBuffer();i.bindBuffer(l,g),i.bufferData(l,c,u),a.onUploadCallback();let p;if(c instanceof Float32Array)p=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)p=i.HALF_FLOAT;else if(c instanceof Uint16Array)a.isFloat16BufferAttribute?p=i.HALF_FLOAT:p=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)p=i.SHORT;else if(c instanceof Uint32Array)p=i.UNSIGNED_INT;else if(c instanceof Int32Array)p=i.INT;else if(c instanceof Int8Array)p=i.BYTE;else if(c instanceof Uint8Array)p=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)p=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:g,type:p,bytesPerElement:c.BYTES_PER_ELEMENT,version:a.version,size:h}}function n(a,l,c){const u=l.array,h=l.updateRanges;if(i.bindBuffer(c,a),h.length===0)i.bufferSubData(c,0,u);else{h.sort((p,m)=>p.start-m.start);let g=0;for(let p=1;p<h.length;p++){const m=h[g],x=h[p];x.start<=m.start+m.count+1?m.count=Math.max(m.count,x.start+x.count-m.start):(++g,h[g]=x)}h.length=g+1;for(let p=0,m=h.length;p<m;p++){const x=h[p];i.bufferSubData(c,x.start*u.BYTES_PER_ELEMENT,u,x.start,x.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(a){return a.isInterleavedBufferAttribute&&(a=a.data),t.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);const l=t.get(a);l&&(i.deleteBuffer(l.buffer),t.delete(a))}function o(a,l){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){const u=t.get(a);(!u||u.version<a.version)&&t.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}const c=t.get(a);if(c===void 0)t.set(a,e(a,l));else if(c.version<a.version){if(c.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,a,l),c.version=a.version}}return{get:s,remove:r,update:o}}var qu=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Zu=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,Ku=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Ju=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Qu=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,th=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,eh=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,nh=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,ih=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,sh=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,rh=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,oh=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,ah=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,lh=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,ch=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,dh=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,uh=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,hh=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,fh=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,ph=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,mh=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,gh=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,_h=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,xh=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,vh=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,Mh=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,yh=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Sh=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,bh=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Eh=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Th="gl_FragColor = linearToOutputTexel( gl_FragColor );",wh=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Ah=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,Rh=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,Ch=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Ph=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Lh=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Dh=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Ih=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Uh=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Nh=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Fh=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,Oh=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,zh=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Bh=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,kh=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,Hh=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,Gh=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Vh=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Wh=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Xh=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,jh=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,$h=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,Yh=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,qh=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,Zh=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Kh=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Jh=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Qh=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,tf=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,ef=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,nf=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,sf=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,rf=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,of=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,af=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,lf=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,cf=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,df=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,uf=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,hf=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,ff=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,pf=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,mf=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,gf=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,_f=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,xf=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,vf=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Mf=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,yf=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Sf=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,bf=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Ef=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,Tf=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,wf=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,Af=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Rf=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Cf=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Pf=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Lf=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		float depth = unpackRGBAToDepth( texture2D( depths, uv ) );
		#ifdef USE_REVERSED_DEPTH_BUFFER
			return step( depth, compare );
		#else
			return step( compare, depth );
		#endif
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow( sampler2D shadow, vec2 uv, float compare ) {
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		#ifdef USE_REVERSED_DEPTH_BUFFER
			float hard_shadow = step( distribution.x, compare );
		#else
			float hard_shadow = step( compare, distribution.x );
		#endif
		if ( hard_shadow != 1.0 ) {
			float distance = compare - distribution.x;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,Df=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,If=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,Uf=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,Nf=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,Ff=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,Of=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,zf=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,Bf=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,kf=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Hf=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Gf=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,Vf=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,Wf=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,Xf=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,jf=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,$f=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,Yf=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const qf=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Zf=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Kf=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Jf=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Qf=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,tp=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,ep=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,np=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,ip=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,sp=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,rp=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,op=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,ap=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,lp=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,cp=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,dp=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,up=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,hp=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,fp=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,pp=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,mp=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,gp=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,_p=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,xp=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,vp=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,Mp=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,yp=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Sp=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,bp=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,Ep=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Tp=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,wp=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Ap=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Rp=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Kt={alphahash_fragment:qu,alphahash_pars_fragment:Zu,alphamap_fragment:Ku,alphamap_pars_fragment:Ju,alphatest_fragment:Qu,alphatest_pars_fragment:th,aomap_fragment:eh,aomap_pars_fragment:nh,batching_pars_vertex:ih,batching_vertex:sh,begin_vertex:rh,beginnormal_vertex:oh,bsdfs:ah,iridescence_fragment:lh,bumpmap_pars_fragment:ch,clipping_planes_fragment:dh,clipping_planes_pars_fragment:uh,clipping_planes_pars_vertex:hh,clipping_planes_vertex:fh,color_fragment:ph,color_pars_fragment:mh,color_pars_vertex:gh,color_vertex:_h,common:xh,cube_uv_reflection_fragment:vh,defaultnormal_vertex:Mh,displacementmap_pars_vertex:yh,displacementmap_vertex:Sh,emissivemap_fragment:bh,emissivemap_pars_fragment:Eh,colorspace_fragment:Th,colorspace_pars_fragment:wh,envmap_fragment:Ah,envmap_common_pars_fragment:Rh,envmap_pars_fragment:Ch,envmap_pars_vertex:Ph,envmap_physical_pars_fragment:Hh,envmap_vertex:Lh,fog_vertex:Dh,fog_pars_vertex:Ih,fog_fragment:Uh,fog_pars_fragment:Nh,gradientmap_pars_fragment:Fh,lightmap_pars_fragment:Oh,lights_lambert_fragment:zh,lights_lambert_pars_fragment:Bh,lights_pars_begin:kh,lights_toon_fragment:Gh,lights_toon_pars_fragment:Vh,lights_phong_fragment:Wh,lights_phong_pars_fragment:Xh,lights_physical_fragment:jh,lights_physical_pars_fragment:$h,lights_fragment_begin:Yh,lights_fragment_maps:qh,lights_fragment_end:Zh,logdepthbuf_fragment:Kh,logdepthbuf_pars_fragment:Jh,logdepthbuf_pars_vertex:Qh,logdepthbuf_vertex:tf,map_fragment:ef,map_pars_fragment:nf,map_particle_fragment:sf,map_particle_pars_fragment:rf,metalnessmap_fragment:of,metalnessmap_pars_fragment:af,morphinstance_vertex:lf,morphcolor_vertex:cf,morphnormal_vertex:df,morphtarget_pars_vertex:uf,morphtarget_vertex:hf,normal_fragment_begin:ff,normal_fragment_maps:pf,normal_pars_fragment:mf,normal_pars_vertex:gf,normal_vertex:_f,normalmap_pars_fragment:xf,clearcoat_normal_fragment_begin:vf,clearcoat_normal_fragment_maps:Mf,clearcoat_pars_fragment:yf,iridescence_pars_fragment:Sf,opaque_fragment:bf,packing:Ef,premultiplied_alpha_fragment:Tf,project_vertex:wf,dithering_fragment:Af,dithering_pars_fragment:Rf,roughnessmap_fragment:Cf,roughnessmap_pars_fragment:Pf,shadowmap_pars_fragment:Lf,shadowmap_pars_vertex:Df,shadowmap_vertex:If,shadowmask_pars_fragment:Uf,skinbase_vertex:Nf,skinning_pars_vertex:Ff,skinning_vertex:Of,skinnormal_vertex:zf,specularmap_fragment:Bf,specularmap_pars_fragment:kf,tonemapping_fragment:Hf,tonemapping_pars_fragment:Gf,transmission_fragment:Vf,transmission_pars_fragment:Wf,uv_pars_fragment:Xf,uv_pars_vertex:jf,uv_vertex:$f,worldpos_vertex:Yf,background_vert:qf,background_frag:Zf,backgroundCube_vert:Kf,backgroundCube_frag:Jf,cube_vert:Qf,cube_frag:tp,depth_vert:ep,depth_frag:np,distanceRGBA_vert:ip,distanceRGBA_frag:sp,equirect_vert:rp,equirect_frag:op,linedashed_vert:ap,linedashed_frag:lp,meshbasic_vert:cp,meshbasic_frag:dp,meshlambert_vert:up,meshlambert_frag:hp,meshmatcap_vert:fp,meshmatcap_frag:pp,meshnormal_vert:mp,meshnormal_frag:gp,meshphong_vert:_p,meshphong_frag:xp,meshphysical_vert:vp,meshphysical_frag:Mp,meshtoon_vert:yp,meshtoon_frag:Sp,points_vert:bp,points_frag:Ep,shadow_vert:Tp,shadow_frag:wp,sprite_vert:Ap,sprite_frag:Rp},wt={common:{diffuse:{value:new Jt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Zt},alphaMap:{value:null},alphaMapTransform:{value:new Zt},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Zt}},envmap:{envMap:{value:null},envMapRotation:{value:new Zt},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Zt}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Zt}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Zt},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Zt},normalScale:{value:new $t(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Zt},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Zt}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Zt}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Zt}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Jt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Jt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Zt},alphaTest:{value:0},uvTransform:{value:new Zt}},sprite:{diffuse:{value:new Jt(16777215)},opacity:{value:1},center:{value:new $t(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Zt},alphaMap:{value:null},alphaMapTransform:{value:new Zt},alphaTest:{value:0}}},an={basic:{uniforms:Ce([wt.common,wt.specularmap,wt.envmap,wt.aomap,wt.lightmap,wt.fog]),vertexShader:Kt.meshbasic_vert,fragmentShader:Kt.meshbasic_frag},lambert:{uniforms:Ce([wt.common,wt.specularmap,wt.envmap,wt.aomap,wt.lightmap,wt.emissivemap,wt.bumpmap,wt.normalmap,wt.displacementmap,wt.fog,wt.lights,{emissive:{value:new Jt(0)}}]),vertexShader:Kt.meshlambert_vert,fragmentShader:Kt.meshlambert_frag},phong:{uniforms:Ce([wt.common,wt.specularmap,wt.envmap,wt.aomap,wt.lightmap,wt.emissivemap,wt.bumpmap,wt.normalmap,wt.displacementmap,wt.fog,wt.lights,{emissive:{value:new Jt(0)},specular:{value:new Jt(1118481)},shininess:{value:30}}]),vertexShader:Kt.meshphong_vert,fragmentShader:Kt.meshphong_frag},standard:{uniforms:Ce([wt.common,wt.envmap,wt.aomap,wt.lightmap,wt.emissivemap,wt.bumpmap,wt.normalmap,wt.displacementmap,wt.roughnessmap,wt.metalnessmap,wt.fog,wt.lights,{emissive:{value:new Jt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Kt.meshphysical_vert,fragmentShader:Kt.meshphysical_frag},toon:{uniforms:Ce([wt.common,wt.aomap,wt.lightmap,wt.emissivemap,wt.bumpmap,wt.normalmap,wt.displacementmap,wt.gradientmap,wt.fog,wt.lights,{emissive:{value:new Jt(0)}}]),vertexShader:Kt.meshtoon_vert,fragmentShader:Kt.meshtoon_frag},matcap:{uniforms:Ce([wt.common,wt.bumpmap,wt.normalmap,wt.displacementmap,wt.fog,{matcap:{value:null}}]),vertexShader:Kt.meshmatcap_vert,fragmentShader:Kt.meshmatcap_frag},points:{uniforms:Ce([wt.points,wt.fog]),vertexShader:Kt.points_vert,fragmentShader:Kt.points_frag},dashed:{uniforms:Ce([wt.common,wt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Kt.linedashed_vert,fragmentShader:Kt.linedashed_frag},depth:{uniforms:Ce([wt.common,wt.displacementmap]),vertexShader:Kt.depth_vert,fragmentShader:Kt.depth_frag},normal:{uniforms:Ce([wt.common,wt.bumpmap,wt.normalmap,wt.displacementmap,{opacity:{value:1}}]),vertexShader:Kt.meshnormal_vert,fragmentShader:Kt.meshnormal_frag},sprite:{uniforms:Ce([wt.sprite,wt.fog]),vertexShader:Kt.sprite_vert,fragmentShader:Kt.sprite_frag},background:{uniforms:{uvTransform:{value:new Zt},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Kt.background_vert,fragmentShader:Kt.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Zt}},vertexShader:Kt.backgroundCube_vert,fragmentShader:Kt.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Kt.cube_vert,fragmentShader:Kt.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Kt.equirect_vert,fragmentShader:Kt.equirect_frag},distanceRGBA:{uniforms:Ce([wt.common,wt.displacementmap,{referencePosition:{value:new Z},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Kt.distanceRGBA_vert,fragmentShader:Kt.distanceRGBA_frag},shadow:{uniforms:Ce([wt.lights,wt.fog,{color:{value:new Jt(0)},opacity:{value:1}}]),vertexShader:Kt.shadow_vert,fragmentShader:Kt.shadow_frag}};an.physical={uniforms:Ce([an.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Zt},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Zt},clearcoatNormalScale:{value:new $t(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Zt},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Zt},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Zt},sheen:{value:0},sheenColor:{value:new Jt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Zt},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Zt},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Zt},transmissionSamplerSize:{value:new $t},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Zt},attenuationDistance:{value:0},attenuationColor:{value:new Jt(0)},specularColor:{value:new Jt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Zt},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Zt},anisotropyVector:{value:new $t},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Zt}}]),vertexShader:Kt.meshphysical_vert,fragmentShader:Kt.meshphysical_frag};const Ns={r:0,b:0,g:0},Xn=new pn,Cp=new me;function Pp(i,t,e,n,s,r,o){const a=new Jt(0);let l=r===!0?0:1,c,u,h=null,g=0,p=null;function m(P){let v=P.isScene===!0?P.background:null;return v&&v.isTexture&&(v=(P.backgroundBlurriness>0?e:t).get(v)),v}function x(P){let v=!1;const C=m(P);C===null?d(a,l):C&&C.isColor&&(d(C,1),v=!0);const E=i.xr.getEnvironmentBlendMode();E==="additive"?n.buffers.color.setClear(0,0,0,1,o):E==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,o),(i.autoClear||v)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function f(P,v){const C=m(v);C&&(C.isCubeTexture||C.mapping===er)?(u===void 0&&(u=new Le(new cs(1,1,1),new On({name:"BackgroundCubeMaterial",uniforms:Bi(an.backgroundCube.uniforms),vertexShader:an.backgroundCube.vertexShader,fragmentShader:an.backgroundCube.fragmentShader,side:Fe,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),u.geometry.deleteAttribute("normal"),u.geometry.deleteAttribute("uv"),u.onBeforeRender=function(E,T,L){this.matrixWorld.copyPosition(L.matrixWorld)},Object.defineProperty(u.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),s.update(u)),Xn.copy(v.backgroundRotation),Xn.x*=-1,Xn.y*=-1,Xn.z*=-1,C.isCubeTexture&&C.isRenderTargetTexture===!1&&(Xn.y*=-1,Xn.z*=-1),u.material.uniforms.envMap.value=C,u.material.uniforms.flipEnvMap.value=C.isCubeTexture&&C.isRenderTargetTexture===!1?-1:1,u.material.uniforms.backgroundBlurriness.value=v.backgroundBlurriness,u.material.uniforms.backgroundIntensity.value=v.backgroundIntensity,u.material.uniforms.backgroundRotation.value.setFromMatrix4(Cp.makeRotationFromEuler(Xn)),u.material.toneMapped=ne.getTransfer(C.colorSpace)!==re,(h!==C||g!==C.version||p!==i.toneMapping)&&(u.material.needsUpdate=!0,h=C,g=C.version,p=i.toneMapping),u.layers.enableAll(),P.unshift(u,u.geometry,u.material,0,0,null)):C&&C.isTexture&&(c===void 0&&(c=new Le(new ki(2,2),new On({name:"BackgroundMaterial",uniforms:Bi(an.background.uniforms),vertexShader:an.background.vertexShader,fragmentShader:an.background.fragmentShader,side:Fn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),s.update(c)),c.material.uniforms.t2D.value=C,c.material.uniforms.backgroundIntensity.value=v.backgroundIntensity,c.material.toneMapped=ne.getTransfer(C.colorSpace)!==re,C.matrixAutoUpdate===!0&&C.updateMatrix(),c.material.uniforms.uvTransform.value.copy(C.matrix),(h!==C||g!==C.version||p!==i.toneMapping)&&(c.material.needsUpdate=!0,h=C,g=C.version,p=i.toneMapping),c.layers.enableAll(),P.unshift(c,c.geometry,c.material,0,0,null))}function d(P,v){P.getRGB(Ns,_c(i)),n.buffers.color.setClear(Ns.r,Ns.g,Ns.b,v,o)}function A(){u!==void 0&&(u.geometry.dispose(),u.material.dispose(),u=void 0),c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0)}return{getClearColor:function(){return a},setClearColor:function(P,v=1){a.set(P),l=v,d(a,l)},getClearAlpha:function(){return l},setClearAlpha:function(P){l=P,d(a,l)},render:x,addToRenderList:f,dispose:A}}function Lp(i,t){const e=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=g(null);let r=s,o=!1;function a(S,N,B,k,F){let G=!1;const H=h(k,B,N);r!==H&&(r=H,c(r.object)),G=p(S,k,B,F),G&&m(S,k,B,F),F!==null&&t.update(F,i.ELEMENT_ARRAY_BUFFER),(G||o)&&(o=!1,v(S,N,B,k),F!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,t.get(F).buffer))}function l(){return i.createVertexArray()}function c(S){return i.bindVertexArray(S)}function u(S){return i.deleteVertexArray(S)}function h(S,N,B){const k=B.wireframe===!0;let F=n[S.id];F===void 0&&(F={},n[S.id]=F);let G=F[N.id];G===void 0&&(G={},F[N.id]=G);let H=G[k];return H===void 0&&(H=g(l()),G[k]=H),H}function g(S){const N=[],B=[],k=[];for(let F=0;F<e;F++)N[F]=0,B[F]=0,k[F]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:N,enabledAttributes:B,attributeDivisors:k,object:S,attributes:{},index:null}}function p(S,N,B,k){const F=r.attributes,G=N.attributes;let H=0;const $=B.getAttributes();for(const J in $)if($[J].location>=0){const pt=F[J];let Et=G[J];if(Et===void 0&&(J==="instanceMatrix"&&S.instanceMatrix&&(Et=S.instanceMatrix),J==="instanceColor"&&S.instanceColor&&(Et=S.instanceColor)),pt===void 0||pt.attribute!==Et||Et&&pt.data!==Et.data)return!0;H++}return r.attributesNum!==H||r.index!==k}function m(S,N,B,k){const F={},G=N.attributes;let H=0;const $=B.getAttributes();for(const J in $)if($[J].location>=0){let pt=G[J];pt===void 0&&(J==="instanceMatrix"&&S.instanceMatrix&&(pt=S.instanceMatrix),J==="instanceColor"&&S.instanceColor&&(pt=S.instanceColor));const Et={};Et.attribute=pt,pt&&pt.data&&(Et.data=pt.data),F[J]=Et,H++}r.attributes=F,r.attributesNum=H,r.index=k}function x(){const S=r.newAttributes;for(let N=0,B=S.length;N<B;N++)S[N]=0}function f(S){d(S,0)}function d(S,N){const B=r.newAttributes,k=r.enabledAttributes,F=r.attributeDivisors;B[S]=1,k[S]===0&&(i.enableVertexAttribArray(S),k[S]=1),F[S]!==N&&(i.vertexAttribDivisor(S,N),F[S]=N)}function A(){const S=r.newAttributes,N=r.enabledAttributes;for(let B=0,k=N.length;B<k;B++)N[B]!==S[B]&&(i.disableVertexAttribArray(B),N[B]=0)}function P(S,N,B,k,F,G,H){H===!0?i.vertexAttribIPointer(S,N,B,F,G):i.vertexAttribPointer(S,N,B,k,F,G)}function v(S,N,B,k){x();const F=k.attributes,G=B.getAttributes(),H=N.defaultAttributeValues;for(const $ in G){const J=G[$];if(J.location>=0){let lt=F[$];if(lt===void 0&&($==="instanceMatrix"&&S.instanceMatrix&&(lt=S.instanceMatrix),$==="instanceColor"&&S.instanceColor&&(lt=S.instanceColor)),lt!==void 0){const pt=lt.normalized,Et=lt.itemSize,ot=t.get(lt);if(ot===void 0)continue;const ft=ot.buffer,Ut=ot.type,Pt=ot.bytesPerElement,ct=Ut===i.INT||Ut===i.UNSIGNED_INT||lt.gpuType===jo;if(lt.isInterleavedBufferAttribute){const ut=lt.data,St=ut.stride,V=lt.offset;if(ut.isInstancedInterleavedBuffer){for(let j=0;j<J.locationSize;j++)d(J.location+j,ut.meshPerAttribute);S.isInstancedMesh!==!0&&k._maxInstanceCount===void 0&&(k._maxInstanceCount=ut.meshPerAttribute*ut.count)}else for(let j=0;j<J.locationSize;j++)f(J.location+j);i.bindBuffer(i.ARRAY_BUFFER,ft);for(let j=0;j<J.locationSize;j++)P(J.location+j,Et/J.locationSize,Ut,pt,St*Pt,(V+Et/J.locationSize*j)*Pt,ct)}else{if(lt.isInstancedBufferAttribute){for(let ut=0;ut<J.locationSize;ut++)d(J.location+ut,lt.meshPerAttribute);S.isInstancedMesh!==!0&&k._maxInstanceCount===void 0&&(k._maxInstanceCount=lt.meshPerAttribute*lt.count)}else for(let ut=0;ut<J.locationSize;ut++)f(J.location+ut);i.bindBuffer(i.ARRAY_BUFFER,ft);for(let ut=0;ut<J.locationSize;ut++)P(J.location+ut,Et/J.locationSize,Ut,pt,Et*Pt,Et/J.locationSize*ut*Pt,ct)}}else if(H!==void 0){const pt=H[$];if(pt!==void 0)switch(pt.length){case 2:i.vertexAttrib2fv(J.location,pt);break;case 3:i.vertexAttrib3fv(J.location,pt);break;case 4:i.vertexAttrib4fv(J.location,pt);break;default:i.vertexAttrib1fv(J.location,pt)}}}}A()}function C(){L();for(const S in n){const N=n[S];for(const B in N){const k=N[B];for(const F in k)u(k[F].object),delete k[F];delete N[B]}delete n[S]}}function E(S){if(n[S.id]===void 0)return;const N=n[S.id];for(const B in N){const k=N[B];for(const F in k)u(k[F].object),delete k[F];delete N[B]}delete n[S.id]}function T(S){for(const N in n){const B=n[N];if(B[S.id]===void 0)continue;const k=B[S.id];for(const F in k)u(k[F].object),delete k[F];delete B[S.id]}}function L(){_(),o=!0,r!==s&&(r=s,c(r.object))}function _(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:a,reset:L,resetDefaultState:_,dispose:C,releaseStatesOfGeometry:E,releaseStatesOfProgram:T,initAttributes:x,enableAttribute:f,disableUnusedAttributes:A}}function Dp(i,t,e){let n;function s(c){n=c}function r(c,u){i.drawArrays(n,c,u),e.update(u,n,1)}function o(c,u,h){h!==0&&(i.drawArraysInstanced(n,c,u,h),e.update(u,n,h))}function a(c,u,h){if(h===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,c,0,u,0,h);let p=0;for(let m=0;m<h;m++)p+=u[m];e.update(p,n,1)}function l(c,u,h,g){if(h===0)return;const p=t.get("WEBGL_multi_draw");if(p===null)for(let m=0;m<c.length;m++)o(c[m],u[m],g[m]);else{p.multiDrawArraysInstancedWEBGL(n,c,0,u,0,g,0,h);let m=0;for(let x=0;x<h;x++)m+=u[x]*g[x];e.update(m,n,1)}}this.setMode=s,this.render=r,this.renderInstances=o,this.renderMultiDraw=a,this.renderMultiDrawInstances=l}function Ip(i,t,e,n){let s;function r(){if(s!==void 0)return s;if(t.has("EXT_texture_filter_anisotropic")===!0){const T=t.get("EXT_texture_filter_anisotropic");s=i.getParameter(T.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function o(T){return!(T!==nn&&n.convert(T)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(T){const L=T===as&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(T!==fn&&n.convert(T)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&T!==bn&&!L)}function l(T){if(T==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";T="mediump"}return T==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=e.precision!==void 0?e.precision:"highp";const u=l(c);u!==c&&(console.warn("THREE.WebGLRenderer:",c,"not supported, using",u,"instead."),c=u);const h=e.logarithmicDepthBuffer===!0,g=e.reversedDepthBuffer===!0&&t.has("EXT_clip_control"),p=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),m=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),x=i.getParameter(i.MAX_TEXTURE_SIZE),f=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),d=i.getParameter(i.MAX_VERTEX_ATTRIBS),A=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),P=i.getParameter(i.MAX_VARYING_VECTORS),v=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),C=m>0,E=i.getParameter(i.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:o,textureTypeReadable:a,precision:c,logarithmicDepthBuffer:h,reversedDepthBuffer:g,maxTextures:p,maxVertexTextures:m,maxTextureSize:x,maxCubemapSize:f,maxAttributes:d,maxVertexUniforms:A,maxVaryings:P,maxFragmentUniforms:v,vertexTextures:C,maxSamples:E}}function Up(i){const t=this;let e=null,n=0,s=!1,r=!1;const o=new Dn,a=new Zt,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(h,g){const p=h.length!==0||g||n!==0||s;return s=g,n=h.length,p},this.beginShadows=function(){r=!0,u(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(h,g){e=u(h,g,0)},this.setState=function(h,g,p){const m=h.clippingPlanes,x=h.clipIntersection,f=h.clipShadows,d=i.get(h);if(!s||m===null||m.length===0||r&&!f)r?u(null):c();else{const A=r?0:n,P=A*4;let v=d.clippingState||null;l.value=v,v=u(m,g,P,p);for(let C=0;C!==P;++C)v[C]=e[C];d.clippingState=v,this.numIntersection=x?this.numPlanes:0,this.numPlanes+=A}};function c(){l.value!==e&&(l.value=e,l.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function u(h,g,p,m){const x=h!==null?h.length:0;let f=null;if(x!==0){if(f=l.value,m!==!0||f===null){const d=p+x*4,A=g.matrixWorldInverse;a.getNormalMatrix(A),(f===null||f.length<d)&&(f=new Float32Array(d));for(let P=0,v=p;P!==x;++P,v+=4)o.copy(h[P]).applyMatrix4(A,a),o.normal.toArray(f,v),f[v+3]=o.constant}l.value=f,l.needsUpdate=!0}return t.numPlanes=x,t.numIntersection=0,f}}function Np(i){let t=new WeakMap;function e(o,a){return a===io?o.mapping=Fi:a===so&&(o.mapping=Oi),o}function n(o){if(o&&o.isTexture){const a=o.mapping;if(a===io||a===so)if(t.has(o)){const l=t.get(o).texture;return e(l,o.mapping)}else{const l=o.image;if(l&&l.height>0){const c=new Lu(l.height);return c.fromEquirectangularTexture(i,o),t.set(o,c),o.addEventListener("dispose",s),e(c.texture,o.mapping)}else return null}}return o}function s(o){const a=o.target;a.removeEventListener("dispose",s);const l=t.get(a);l!==void 0&&(t.delete(a),l.dispose())}function r(){t=new WeakMap}return{get:n,dispose:r}}const Ri=4,il=[.125,.215,.35,.446,.526,.582],Kn=20,Ur=new Ec,sl=new Jt;let Nr=null,Fr=0,Or=0,zr=!1;const qn=(1+Math.sqrt(5))/2,yi=1/qn,rl=[new Z(-qn,yi,0),new Z(qn,yi,0),new Z(-yi,0,qn),new Z(yi,0,qn),new Z(0,qn,-yi),new Z(0,qn,yi),new Z(-1,1,-1),new Z(1,1,-1),new Z(-1,1,1),new Z(1,1,1)],Fp=new Z;class ol{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(t,e=0,n=.1,s=100,r={}){const{size:o=256,position:a=Fp}=r;Nr=this._renderer.getRenderTarget(),Fr=this._renderer.getActiveCubeFace(),Or=this._renderer.getActiveMipmapLevel(),zr=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(o);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(t,n,s,l,a),e>0&&this._blur(l,0,0,e),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=cl(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=ll(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodPlanes.length;t++)this._lodPlanes[t].dispose()}_cleanup(t){this._renderer.setRenderTarget(Nr,Fr,Or),this._renderer.xr.enabled=zr,t.scissorTest=!1,Fs(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===Fi||t.mapping===Oi?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),Nr=this._renderer.getRenderTarget(),Fr=this._renderer.getActiveCubeFace(),Or=this._renderer.getActiveMipmapLevel(),zr=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:dn,minFilter:dn,generateMipmaps:!1,type:as,format:nn,colorSpace:zi,depthBuffer:!1},s=al(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=al(t,e,n);const{_lodMax:r}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=Op(r)),this._blurMaterial=zp(r,t,e)}return s}_compileMaterial(t){const e=new Le(this._lodPlanes[0],t);this._renderer.compile(e,Ur)}_sceneToCubeUV(t,e,n,s,r){const l=new Je(90,1,e,n),c=[1,-1,1,1,1,1],u=[1,1,1,-1,-1,-1],h=this._renderer,g=h.autoClear,p=h.toneMapping;h.getClearColor(sl),h.toneMapping=Nn,h.autoClear=!1,h.state.buffers.depth.getReversed()&&(h.setRenderTarget(s),h.clearDepth(),h.setRenderTarget(null));const x=new ta({name:"PMREM.Background",side:Fe,depthWrite:!1,depthTest:!1}),f=new Le(new cs,x);let d=!1;const A=t.background;A?A.isColor&&(x.color.copy(A),t.background=null,d=!0):(x.color.copy(sl),d=!0);for(let P=0;P<6;P++){const v=P%3;v===0?(l.up.set(0,c[P],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x+u[P],r.y,r.z)):v===1?(l.up.set(0,0,c[P]),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y+u[P],r.z)):(l.up.set(0,c[P],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y,r.z+u[P]));const C=this._cubeSize;Fs(s,v*C,P>2?C:0,C,C),h.setRenderTarget(s),d&&h.render(f,l),h.render(t,l)}f.geometry.dispose(),f.material.dispose(),h.toneMapping=p,h.autoClear=g,t.background=A}_textureToCubeUV(t,e){const n=this._renderer,s=t.mapping===Fi||t.mapping===Oi;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=cl()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=ll());const r=s?this._cubemapMaterial:this._equirectMaterial,o=new Le(this._lodPlanes[0],r),a=r.uniforms;a.envMap.value=t;const l=this._cubeSize;Fs(e,0,0,3*l,2*l),n.setRenderTarget(e),n.render(o,Ur)}_applyPMREM(t){const e=this._renderer,n=e.autoClear;e.autoClear=!1;const s=this._lodPlanes.length;for(let r=1;r<s;r++){const o=Math.sqrt(this._sigmas[r]*this._sigmas[r]-this._sigmas[r-1]*this._sigmas[r-1]),a=rl[(s-r-1)%rl.length];this._blur(t,r-1,r,o,a)}e.autoClear=n}_blur(t,e,n,s,r){const o=this._pingPongRenderTarget;this._halfBlur(t,o,e,n,s,"latitudinal",r),this._halfBlur(o,t,n,n,s,"longitudinal",r)}_halfBlur(t,e,n,s,r,o,a){const l=this._renderer,c=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");const u=3,h=new Le(this._lodPlanes[s],c),g=c.uniforms,p=this._sizeLods[n]-1,m=isFinite(r)?Math.PI/(2*p):2*Math.PI/(2*Kn-1),x=r/m,f=isFinite(r)?1+Math.floor(u*x):Kn;f>Kn&&console.warn(`sigmaRadians, ${r}, is too large and will clip, as it requested ${f} samples when the maximum is set to ${Kn}`);const d=[];let A=0;for(let T=0;T<Kn;++T){const L=T/x,_=Math.exp(-L*L/2);d.push(_),T===0?A+=_:T<f&&(A+=2*_)}for(let T=0;T<d.length;T++)d[T]=d[T]/A;g.envMap.value=t.texture,g.samples.value=f,g.weights.value=d,g.latitudinal.value=o==="latitudinal",a&&(g.poleAxis.value=a);const{_lodMax:P}=this;g.dTheta.value=m,g.mipInt.value=P-n;const v=this._sizeLods[s],C=3*v*(s>P-Ri?s-P+Ri:0),E=4*(this._cubeSize-v);Fs(e,C,E,3*v,2*v),l.setRenderTarget(e),l.render(h,Ur)}}function Op(i){const t=[],e=[],n=[];let s=i;const r=i-Ri+1+il.length;for(let o=0;o<r;o++){const a=Math.pow(2,s);e.push(a);let l=1/a;o>i-Ri?l=il[o-i+Ri-1]:o===0&&(l=0),n.push(l);const c=1/(a-2),u=-c,h=1+c,g=[u,u,h,u,h,h,u,u,h,h,u,h],p=6,m=6,x=3,f=2,d=1,A=new Float32Array(x*m*p),P=new Float32Array(f*m*p),v=new Float32Array(d*m*p);for(let E=0;E<p;E++){const T=E%3*2/3-1,L=E>2?0:-1,_=[T,L,0,T+2/3,L,0,T+2/3,L+1,0,T,L,0,T+2/3,L+1,0,T,L+1,0];A.set(_,x*m*E),P.set(g,f*m*E);const S=[E,E,E,E,E,E];v.set(S,d*m*E)}const C=new je;C.setAttribute("position",new Ae(A,x)),C.setAttribute("uv",new Ae(P,f)),C.setAttribute("faceIndex",new Ae(v,d)),t.push(C),s>Ri&&s--}return{lodPlanes:t,sizeLods:e,sigmas:n}}function al(i,t,e){const n=new ii(i,t,e);return n.texture.mapping=er,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Fs(i,t,e,n,s){i.viewport.set(t,e,n,s),i.scissor.set(t,e,n,s)}function zp(i,t,e){const n=new Float32Array(Kn),s=new Z(0,1,0);return new On({name:"SphericalGaussianBlur",defines:{n:Kn,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:aa(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:Un,depthTest:!1,depthWrite:!1})}function ll(){return new On({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:aa(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Un,depthTest:!1,depthWrite:!1})}function cl(){return new On({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:aa(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Un,depthTest:!1,depthWrite:!1})}function aa(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function Bp(i){let t=new WeakMap,e=null;function n(a){if(a&&a.isTexture){const l=a.mapping,c=l===io||l===so,u=l===Fi||l===Oi;if(c||u){let h=t.get(a);const g=h!==void 0?h.texture.pmremVersion:0;if(a.isRenderTargetTexture&&a.pmremVersion!==g)return e===null&&(e=new ol(i)),h=c?e.fromEquirectangular(a,h):e.fromCubemap(a,h),h.texture.pmremVersion=a.pmremVersion,t.set(a,h),h.texture;if(h!==void 0)return h.texture;{const p=a.image;return c&&p&&p.height>0||u&&p&&s(p)?(e===null&&(e=new ol(i)),h=c?e.fromEquirectangular(a):e.fromCubemap(a),h.texture.pmremVersion=a.pmremVersion,t.set(a,h),a.addEventListener("dispose",r),h.texture):null}}}return a}function s(a){let l=0;const c=6;for(let u=0;u<c;u++)a[u]!==void 0&&l++;return l===c}function r(a){const l=a.target;l.removeEventListener("dispose",r);const c=t.get(l);c!==void 0&&(t.delete(l),c.dispose())}function o(){t=new WeakMap,e!==null&&(e.dispose(),e=null)}return{get:n,dispose:o}}function kp(i){const t={};function e(n){if(t[n]!==void 0)return t[n];let s;switch(n){case"WEBGL_depth_texture":s=i.getExtension("WEBGL_depth_texture")||i.getExtension("MOZ_WEBGL_depth_texture")||i.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":s=i.getExtension("EXT_texture_filter_anisotropic")||i.getExtension("MOZ_EXT_texture_filter_anisotropic")||i.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":s=i.getExtension("WEBGL_compressed_texture_s3tc")||i.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||i.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":s=i.getExtension("WEBGL_compressed_texture_pvrtc")||i.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:s=i.getExtension(n)}return t[n]=s,s}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){const s=e(n);return s===null&&os("THREE.WebGLRenderer: "+n+" extension not supported."),s}}}function Hp(i,t,e,n){const s={},r=new WeakMap;function o(h){const g=h.target;g.index!==null&&t.remove(g.index);for(const m in g.attributes)t.remove(g.attributes[m]);g.removeEventListener("dispose",o),delete s[g.id];const p=r.get(g);p&&(t.remove(p),r.delete(g)),n.releaseStatesOfGeometry(g),g.isInstancedBufferGeometry===!0&&delete g._maxInstanceCount,e.memory.geometries--}function a(h,g){return s[g.id]===!0||(g.addEventListener("dispose",o),s[g.id]=!0,e.memory.geometries++),g}function l(h){const g=h.attributes;for(const p in g)t.update(g[p],i.ARRAY_BUFFER)}function c(h){const g=[],p=h.index,m=h.attributes.position;let x=0;if(p!==null){const A=p.array;x=p.version;for(let P=0,v=A.length;P<v;P+=3){const C=A[P+0],E=A[P+1],T=A[P+2];g.push(C,E,E,T,T,C)}}else if(m!==void 0){const A=m.array;x=m.version;for(let P=0,v=A.length/3-1;P<v;P+=3){const C=P+0,E=P+1,T=P+2;g.push(C,E,E,T,T,C)}}else return;const f=new(uc(g)?gc:mc)(g,1);f.version=x;const d=r.get(h);d&&t.remove(d),r.set(h,f)}function u(h){const g=r.get(h);if(g){const p=h.index;p!==null&&g.version<p.version&&c(h)}else c(h);return r.get(h)}return{get:a,update:l,getWireframeAttribute:u}}function Gp(i,t,e){let n;function s(g){n=g}let r,o;function a(g){r=g.type,o=g.bytesPerElement}function l(g,p){i.drawElements(n,p,r,g*o),e.update(p,n,1)}function c(g,p,m){m!==0&&(i.drawElementsInstanced(n,p,r,g*o,m),e.update(p,n,m))}function u(g,p,m){if(m===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,p,0,r,g,0,m);let f=0;for(let d=0;d<m;d++)f+=p[d];e.update(f,n,1)}function h(g,p,m,x){if(m===0)return;const f=t.get("WEBGL_multi_draw");if(f===null)for(let d=0;d<g.length;d++)c(g[d]/o,p[d],x[d]);else{f.multiDrawElementsInstancedWEBGL(n,p,0,r,g,0,x,0,m);let d=0;for(let A=0;A<m;A++)d+=p[A]*x[A];e.update(d,n,1)}}this.setMode=s,this.setIndex=a,this.render=l,this.renderInstances=c,this.renderMultiDraw=u,this.renderMultiDrawInstances=h}function Vp(i){const t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(e.calls++,o){case i.TRIANGLES:e.triangles+=a*(r/3);break;case i.LINES:e.lines+=a*(r/2);break;case i.LINE_STRIP:e.lines+=a*(r-1);break;case i.LINE_LOOP:e.lines+=a*r;break;case i.POINTS:e.points+=a*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",o);break}}function s(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:s,update:n}}function Wp(i,t,e){const n=new WeakMap,s=new pe;function r(o,a,l){const c=o.morphTargetInfluences,u=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,h=u!==void 0?u.length:0;let g=n.get(a);if(g===void 0||g.count!==h){let S=function(){L.dispose(),n.delete(a),a.removeEventListener("dispose",S)};var p=S;g!==void 0&&g.texture.dispose();const m=a.morphAttributes.position!==void 0,x=a.morphAttributes.normal!==void 0,f=a.morphAttributes.color!==void 0,d=a.morphAttributes.position||[],A=a.morphAttributes.normal||[],P=a.morphAttributes.color||[];let v=0;m===!0&&(v=1),x===!0&&(v=2),f===!0&&(v=3);let C=a.attributes.position.count*v,E=1;C>t.maxTextureSize&&(E=Math.ceil(C/t.maxTextureSize),C=t.maxTextureSize);const T=new Float32Array(C*E*4*h),L=new hc(T,C,E,h);L.type=bn,L.needsUpdate=!0;const _=v*4;for(let N=0;N<h;N++){const B=d[N],k=A[N],F=P[N],G=C*E*4*N;for(let H=0;H<B.count;H++){const $=H*_;m===!0&&(s.fromBufferAttribute(B,H),T[G+$+0]=s.x,T[G+$+1]=s.y,T[G+$+2]=s.z,T[G+$+3]=0),x===!0&&(s.fromBufferAttribute(k,H),T[G+$+4]=s.x,T[G+$+5]=s.y,T[G+$+6]=s.z,T[G+$+7]=0),f===!0&&(s.fromBufferAttribute(F,H),T[G+$+8]=s.x,T[G+$+9]=s.y,T[G+$+10]=s.z,T[G+$+11]=F.itemSize===4?s.w:1)}}g={count:h,texture:L,size:new $t(C,E)},n.set(a,g),a.addEventListener("dispose",S)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",o.morphTexture,e);else{let m=0;for(let f=0;f<c.length;f++)m+=c[f];const x=a.morphTargetsRelative?1:1-m;l.getUniforms().setValue(i,"morphTargetBaseInfluence",x),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",g.texture,e),l.getUniforms().setValue(i,"morphTargetsTextureSize",g.size)}return{update:r}}function Xp(i,t,e,n){let s=new WeakMap;function r(l){const c=n.render.frame,u=l.geometry,h=t.get(l,u);if(s.get(h)!==c&&(t.update(h),s.set(h,c)),l.isInstancedMesh&&(l.hasEventListener("dispose",a)===!1&&l.addEventListener("dispose",a),s.get(l)!==c&&(e.update(l.instanceMatrix,i.ARRAY_BUFFER),l.instanceColor!==null&&e.update(l.instanceColor,i.ARRAY_BUFFER),s.set(l,c))),l.isSkinnedMesh){const g=l.skeleton;s.get(g)!==c&&(g.update(),s.set(g,c))}return h}function o(){s=new WeakMap}function a(l){const c=l.target;c.removeEventListener("dispose",a),e.remove(c.instanceMatrix),c.instanceColor!==null&&e.remove(c.instanceColor)}return{update:r,dispose:o}}const wc=new Oe,dl=new yc(1,1),Ac=new hc,Rc=new pu,Cc=new vc,ul=[],hl=[],fl=new Float32Array(16),pl=new Float32Array(9),ml=new Float32Array(4);function Vi(i,t,e){const n=i[0];if(n<=0||n>0)return i;const s=t*e;let r=ul[s];if(r===void 0&&(r=new Float32Array(s),ul[s]=r),t!==0){n.toArray(r,0);for(let o=1,a=0;o!==t;++o)a+=e,i[o].toArray(r,a)}return r}function Me(i,t){if(i.length!==t.length)return!1;for(let e=0,n=i.length;e<n;e++)if(i[e]!==t[e])return!1;return!0}function ye(i,t){for(let e=0,n=t.length;e<n;e++)i[e]=t[e]}function ir(i,t){let e=hl[t];e===void 0&&(e=new Int32Array(t),hl[t]=e);for(let n=0;n!==t;++n)e[n]=i.allocateTextureUnit();return e}function jp(i,t){const e=this.cache;e[0]!==t&&(i.uniform1f(this.addr,t),e[0]=t)}function $p(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Me(e,t))return;i.uniform2fv(this.addr,t),ye(e,t)}}function Yp(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(i.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(Me(e,t))return;i.uniform3fv(this.addr,t),ye(e,t)}}function qp(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Me(e,t))return;i.uniform4fv(this.addr,t),ye(e,t)}}function Zp(i,t){const e=this.cache,n=t.elements;if(n===void 0){if(Me(e,t))return;i.uniformMatrix2fv(this.addr,!1,t),ye(e,t)}else{if(Me(e,n))return;ml.set(n),i.uniformMatrix2fv(this.addr,!1,ml),ye(e,n)}}function Kp(i,t){const e=this.cache,n=t.elements;if(n===void 0){if(Me(e,t))return;i.uniformMatrix3fv(this.addr,!1,t),ye(e,t)}else{if(Me(e,n))return;pl.set(n),i.uniformMatrix3fv(this.addr,!1,pl),ye(e,n)}}function Jp(i,t){const e=this.cache,n=t.elements;if(n===void 0){if(Me(e,t))return;i.uniformMatrix4fv(this.addr,!1,t),ye(e,t)}else{if(Me(e,n))return;fl.set(n),i.uniformMatrix4fv(this.addr,!1,fl),ye(e,n)}}function Qp(i,t){const e=this.cache;e[0]!==t&&(i.uniform1i(this.addr,t),e[0]=t)}function tm(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Me(e,t))return;i.uniform2iv(this.addr,t),ye(e,t)}}function em(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Me(e,t))return;i.uniform3iv(this.addr,t),ye(e,t)}}function nm(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Me(e,t))return;i.uniform4iv(this.addr,t),ye(e,t)}}function im(i,t){const e=this.cache;e[0]!==t&&(i.uniform1ui(this.addr,t),e[0]=t)}function sm(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Me(e,t))return;i.uniform2uiv(this.addr,t),ye(e,t)}}function rm(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Me(e,t))return;i.uniform3uiv(this.addr,t),ye(e,t)}}function om(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Me(e,t))return;i.uniform4uiv(this.addr,t),ye(e,t)}}function am(i,t,e){const n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?(dl.compareFunction=dc,r=dl):r=wc,e.setTexture2D(t||r,s)}function lm(i,t,e){const n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture3D(t||Rc,s)}function cm(i,t,e){const n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTextureCube(t||Cc,s)}function dm(i,t,e){const n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture2DArray(t||Ac,s)}function um(i){switch(i){case 5126:return jp;case 35664:return $p;case 35665:return Yp;case 35666:return qp;case 35674:return Zp;case 35675:return Kp;case 35676:return Jp;case 5124:case 35670:return Qp;case 35667:case 35671:return tm;case 35668:case 35672:return em;case 35669:case 35673:return nm;case 5125:return im;case 36294:return sm;case 36295:return rm;case 36296:return om;case 35678:case 36198:case 36298:case 36306:case 35682:return am;case 35679:case 36299:case 36307:return lm;case 35680:case 36300:case 36308:case 36293:return cm;case 36289:case 36303:case 36311:case 36292:return dm}}function hm(i,t){i.uniform1fv(this.addr,t)}function fm(i,t){const e=Vi(t,this.size,2);i.uniform2fv(this.addr,e)}function pm(i,t){const e=Vi(t,this.size,3);i.uniform3fv(this.addr,e)}function mm(i,t){const e=Vi(t,this.size,4);i.uniform4fv(this.addr,e)}function gm(i,t){const e=Vi(t,this.size,4);i.uniformMatrix2fv(this.addr,!1,e)}function _m(i,t){const e=Vi(t,this.size,9);i.uniformMatrix3fv(this.addr,!1,e)}function xm(i,t){const e=Vi(t,this.size,16);i.uniformMatrix4fv(this.addr,!1,e)}function vm(i,t){i.uniform1iv(this.addr,t)}function Mm(i,t){i.uniform2iv(this.addr,t)}function ym(i,t){i.uniform3iv(this.addr,t)}function Sm(i,t){i.uniform4iv(this.addr,t)}function bm(i,t){i.uniform1uiv(this.addr,t)}function Em(i,t){i.uniform2uiv(this.addr,t)}function Tm(i,t){i.uniform3uiv(this.addr,t)}function wm(i,t){i.uniform4uiv(this.addr,t)}function Am(i,t,e){const n=this.cache,s=t.length,r=ir(e,s);Me(n,r)||(i.uniform1iv(this.addr,r),ye(n,r));for(let o=0;o!==s;++o)e.setTexture2D(t[o]||wc,r[o])}function Rm(i,t,e){const n=this.cache,s=t.length,r=ir(e,s);Me(n,r)||(i.uniform1iv(this.addr,r),ye(n,r));for(let o=0;o!==s;++o)e.setTexture3D(t[o]||Rc,r[o])}function Cm(i,t,e){const n=this.cache,s=t.length,r=ir(e,s);Me(n,r)||(i.uniform1iv(this.addr,r),ye(n,r));for(let o=0;o!==s;++o)e.setTextureCube(t[o]||Cc,r[o])}function Pm(i,t,e){const n=this.cache,s=t.length,r=ir(e,s);Me(n,r)||(i.uniform1iv(this.addr,r),ye(n,r));for(let o=0;o!==s;++o)e.setTexture2DArray(t[o]||Ac,r[o])}function Lm(i){switch(i){case 5126:return hm;case 35664:return fm;case 35665:return pm;case 35666:return mm;case 35674:return gm;case 35675:return _m;case 35676:return xm;case 5124:case 35670:return vm;case 35667:case 35671:return Mm;case 35668:case 35672:return ym;case 35669:case 35673:return Sm;case 5125:return bm;case 36294:return Em;case 36295:return Tm;case 36296:return wm;case 35678:case 36198:case 36298:case 36306:case 35682:return Am;case 35679:case 36299:case 36307:return Rm;case 35680:case 36300:case 36308:case 36293:return Cm;case 36289:case 36303:case 36311:case 36292:return Pm}}class Dm{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=um(e.type)}}class Im{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=Lm(e.type)}}class Um{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){const s=this.seq;for(let r=0,o=s.length;r!==o;++r){const a=s[r];a.setValue(t,e[a.id],n)}}}const Br=/(\w+)(\])?(\[|\.)?/g;function gl(i,t){i.seq.push(t),i.map[t.id]=t}function Nm(i,t,e){const n=i.name,s=n.length;for(Br.lastIndex=0;;){const r=Br.exec(n),o=Br.lastIndex;let a=r[1];const l=r[2]==="]",c=r[3];if(l&&(a=a|0),c===void 0||c==="["&&o+2===s){gl(e,c===void 0?new Dm(a,i,t):new Im(a,i,t));break}else{let h=e.map[a];h===void 0&&(h=new Um(a),gl(e,h)),e=h}}}class Xs{constructor(t,e){this.seq=[],this.map={};const n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let s=0;s<n;++s){const r=t.getActiveUniform(e,s),o=t.getUniformLocation(e,r.name);Nm(r,o,this)}}setValue(t,e,n,s){const r=this.map[e];r!==void 0&&r.setValue(t,n,s)}setOptional(t,e,n){const s=e[n];s!==void 0&&this.setValue(t,n,s)}static upload(t,e,n,s){for(let r=0,o=e.length;r!==o;++r){const a=e[r],l=n[a.id];l.needsUpdate!==!1&&a.setValue(t,l.value,s)}}static seqWithValue(t,e){const n=[];for(let s=0,r=t.length;s!==r;++s){const o=t[s];o.id in e&&n.push(o)}return n}}function _l(i,t,e){const n=i.createShader(t);return i.shaderSource(n,e),i.compileShader(n),n}const Fm=37297;let Om=0;function zm(i,t){const e=i.split(`
`),n=[],s=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let o=s;o<r;o++){const a=o+1;n.push(`${a===t?">":" "} ${a}: ${e[o]}`)}return n.join(`
`)}const xl=new Zt;function Bm(i){ne._getMatrix(xl,ne.workingColorSpace,i);const t=`mat3( ${xl.elements.map(e=>e.toFixed(4))} )`;switch(ne.getTransfer(i)){case Ys:return[t,"LinearTransferOETF"];case re:return[t,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",i),[t,"LinearTransferOETF"]}}function vl(i,t,e){const n=i.getShaderParameter(t,i.COMPILE_STATUS),r=(i.getShaderInfoLog(t)||"").trim();if(n&&r==="")return"";const o=/ERROR: 0:(\d+)/.exec(r);if(o){const a=parseInt(o[1]);return e.toUpperCase()+`

`+r+`

`+zm(i.getShaderSource(t),a)}else return r}function km(i,t){const e=Bm(t);return[`vec4 ${i}( vec4 value ) {`,`	return ${e[1]}( vec4( value.rgb * ${e[0]}, value.a ) );`,"}"].join(`
`)}function Hm(i,t){let e;switch(t){case Gd:e="Linear";break;case Vd:e="Reinhard";break;case Wd:e="Cineon";break;case Ql:e="ACESFilmic";break;case jd:e="AgX";break;case $d:e="Neutral";break;case Xd:e="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",t),e="Linear"}return"vec3 "+i+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}const Os=new Z;function Gm(){ne.getLuminanceCoefficients(Os);const i=Os.x.toFixed(4),t=Os.y.toFixed(4),e=Os.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Vm(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Qi).join(`
`)}function Wm(i){const t=[];for(const e in i){const n=i[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function Xm(i,t){const e={},n=i.getProgramParameter(t,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){const r=i.getActiveAttrib(t,s),o=r.name;let a=1;r.type===i.FLOAT_MAT2&&(a=2),r.type===i.FLOAT_MAT3&&(a=3),r.type===i.FLOAT_MAT4&&(a=4),e[o]={type:r.type,location:i.getAttribLocation(t,o),locationSize:a}}return e}function Qi(i){return i!==""}function Ml(i,t){const e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function yl(i,t){return i.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}const jm=/^[ \t]*#include +<([\w\d./]+)>/gm;function Oo(i){return i.replace(jm,Ym)}const $m=new Map;function Ym(i,t){let e=Kt[t];if(e===void 0){const n=$m.get(t);if(n!==void 0)e=Kt[n],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("Can not resolve #include <"+t+">")}return Oo(e)}const qm=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Sl(i){return i.replace(qm,Zm)}function Zm(i,t,e,n){let s="";for(let r=parseInt(t);r<parseInt(e);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function bl(i){let t=`precision ${i.precision} float;
	precision ${i.precision} int;
	precision ${i.precision} sampler2D;
	precision ${i.precision} samplerCube;
	precision ${i.precision} sampler3D;
	precision ${i.precision} sampler2DArray;
	precision ${i.precision} sampler2DShadow;
	precision ${i.precision} samplerCubeShadow;
	precision ${i.precision} sampler2DArrayShadow;
	precision ${i.precision} isampler2D;
	precision ${i.precision} isampler3D;
	precision ${i.precision} isamplerCube;
	precision ${i.precision} isampler2DArray;
	precision ${i.precision} usampler2D;
	precision ${i.precision} usampler3D;
	precision ${i.precision} usamplerCube;
	precision ${i.precision} usampler2DArray;
	`;return i.precision==="highp"?t+=`
#define HIGH_PRECISION`:i.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:i.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}function Km(i){let t="SHADOWMAP_TYPE_BASIC";return i.shadowMapType===Zl?t="SHADOWMAP_TYPE_PCF":i.shadowMapType===Kl?t="SHADOWMAP_TYPE_PCF_SOFT":i.shadowMapType===yn&&(t="SHADOWMAP_TYPE_VSM"),t}function Jm(i){let t="ENVMAP_TYPE_CUBE";if(i.envMap)switch(i.envMapMode){case Fi:case Oi:t="ENVMAP_TYPE_CUBE";break;case er:t="ENVMAP_TYPE_CUBE_UV";break}return t}function Qm(i){let t="ENVMAP_MODE_REFLECTION";return i.envMap&&i.envMapMode===Oi&&(t="ENVMAP_MODE_REFRACTION"),t}function tg(i){let t="ENVMAP_BLENDING_NONE";if(i.envMap)switch(i.combine){case Jl:t="ENVMAP_BLENDING_MULTIPLY";break;case kd:t="ENVMAP_BLENDING_MIX";break;case Hd:t="ENVMAP_BLENDING_ADD";break}return t}function eg(i){const t=i.envMapCubeUVHeight;if(t===null)return null;const e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),112)),texelHeight:n,maxMip:e}}function ng(i,t,e,n){const s=i.getContext(),r=e.defines;let o=e.vertexShader,a=e.fragmentShader;const l=Km(e),c=Jm(e),u=Qm(e),h=tg(e),g=eg(e),p=Vm(e),m=Wm(r),x=s.createProgram();let f,d,A=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(f=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m].filter(Qi).join(`
`),f.length>0&&(f+=`
`),d=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m].filter(Qi).join(`
`),d.length>0&&(d+=`
`)):(f=[bl(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+u:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Qi).join(`
`),d=[bl(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+c:"",e.envMap?"#define "+u:"",e.envMap?"#define "+h:"",g?"#define CUBEUV_TEXEL_WIDTH "+g.texelWidth:"",g?"#define CUBEUV_TEXEL_HEIGHT "+g.texelHeight:"",g?"#define CUBEUV_MAX_MIP "+g.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor||e.batchingColor?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==Nn?"#define TONE_MAPPING":"",e.toneMapping!==Nn?Kt.tonemapping_pars_fragment:"",e.toneMapping!==Nn?Hm("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",Kt.colorspace_pars_fragment,km("linearToOutputTexel",e.outputColorSpace),Gm(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(Qi).join(`
`)),o=Oo(o),o=Ml(o,e),o=yl(o,e),a=Oo(a),a=Ml(a,e),a=yl(a,e),o=Sl(o),a=Sl(a),e.isRawShaderMaterial!==!0&&(A=`#version 300 es
`,f=[p,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+f,d=["#define varying in",e.glslVersion===Ca?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===Ca?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+d);const P=A+f+o,v=A+d+a,C=_l(s,s.VERTEX_SHADER,P),E=_l(s,s.FRAGMENT_SHADER,v);s.attachShader(x,C),s.attachShader(x,E),e.index0AttributeName!==void 0?s.bindAttribLocation(x,0,e.index0AttributeName):e.morphTargets===!0&&s.bindAttribLocation(x,0,"position"),s.linkProgram(x);function T(N){if(i.debug.checkShaderErrors){const B=s.getProgramInfoLog(x)||"",k=s.getShaderInfoLog(C)||"",F=s.getShaderInfoLog(E)||"",G=B.trim(),H=k.trim(),$=F.trim();let J=!0,lt=!0;if(s.getProgramParameter(x,s.LINK_STATUS)===!1)if(J=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,x,C,E);else{const pt=vl(s,C,"vertex"),Et=vl(s,E,"fragment");console.error("THREE.WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(x,s.VALIDATE_STATUS)+`

Material Name: `+N.name+`
Material Type: `+N.type+`

Program Info Log: `+G+`
`+pt+`
`+Et)}else G!==""?console.warn("THREE.WebGLProgram: Program Info Log:",G):(H===""||$==="")&&(lt=!1);lt&&(N.diagnostics={runnable:J,programLog:G,vertexShader:{log:H,prefix:f},fragmentShader:{log:$,prefix:d}})}s.deleteShader(C),s.deleteShader(E),L=new Xs(s,x),_=Xm(s,x)}let L;this.getUniforms=function(){return L===void 0&&T(this),L};let _;this.getAttributes=function(){return _===void 0&&T(this),_};let S=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return S===!1&&(S=s.getProgramParameter(x,Fm)),S},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(x),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=Om++,this.cacheKey=t,this.usedTimes=1,this.program=x,this.vertexShader=C,this.fragmentShader=E,this}let ig=0;class sg{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t){const e=t.vertexShader,n=t.fragmentShader,s=this._getShaderStage(e),r=this._getShaderStage(n),o=this._getShaderCacheForMaterial(t);return o.has(s)===!1&&(o.add(s),s.usedTimes++),o.has(r)===!1&&(o.add(r),r.usedTimes++),this}remove(t){const e=this.materialCache.get(t);for(const n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderID(t){return this._getShaderStage(t.vertexShader).id}getFragmentShaderID(t){return this._getShaderStage(t.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){const e=this.materialCache;let n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){const e=this.shaderCache;let n=e.get(t);return n===void 0&&(n=new rg(t),e.set(t,n)),n}}class rg{constructor(t){this.id=ig++,this.code=t,this.usedTimes=0}}function og(i,t,e,n,s,r,o){const a=new fc,l=new sg,c=new Set,u=[],h=s.logarithmicDepthBuffer,g=s.vertexTextures;let p=s.precision;const m={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function x(_){return c.add(_),_===0?"uv":`uv${_}`}function f(_,S,N,B,k){const F=B.fog,G=k.geometry,H=_.isMeshStandardMaterial?B.environment:null,$=(_.isMeshStandardMaterial?e:t).get(_.envMap||H),J=$&&$.mapping===er?$.image.height:null,lt=m[_.type];_.precision!==null&&(p=s.getMaxPrecision(_.precision),p!==_.precision&&console.warn("THREE.WebGLProgram.getParameters:",_.precision,"not supported, using",p,"instead."));const pt=G.morphAttributes.position||G.morphAttributes.normal||G.morphAttributes.color,Et=pt!==void 0?pt.length:0;let ot=0;G.morphAttributes.position!==void 0&&(ot=1),G.morphAttributes.normal!==void 0&&(ot=2),G.morphAttributes.color!==void 0&&(ot=3);let ft,Ut,Pt,ct;if(lt){const ie=an[lt];ft=ie.vertexShader,Ut=ie.fragmentShader}else ft=_.vertexShader,Ut=_.fragmentShader,l.update(_),Pt=l.getVertexShaderID(_),ct=l.getFragmentShaderID(_);const ut=i.getRenderTarget(),St=i.state.buffers.depth.getReversed(),V=k.isInstancedMesh===!0,j=k.isBatchedMesh===!0,Q=!!_.map,dt=!!_.matcap,M=!!$,z=!!_.aoMap,w=!!_.lightMap,b=!!_.bumpMap,O=!!_.normalMap,U=!!_.displacementMap,I=!!_.emissiveMap,X=!!_.metalnessMap,q=!!_.roughnessMap,nt=_.anisotropy>0,R=_.clearcoat>0,y=_.dispersion>0,W=_.iridescence>0,K=_.sheen>0,st=_.transmission>0,it=nt&&!!_.anisotropyMap,Tt=R&&!!_.clearcoatMap,mt=R&&!!_.clearcoatNormalMap,Dt=R&&!!_.clearcoatRoughnessMap,Lt=W&&!!_.iridescenceMap,gt=W&&!!_.iridescenceThicknessMap,bt=K&&!!_.sheenColorMap,Xt=K&&!!_.sheenRoughnessMap,Bt=!!_.specularMap,Rt=!!_.specularColorMap,qt=!!_.specularIntensityMap,Y=st&&!!_.transmissionMap,vt=st&&!!_.thicknessMap,yt=!!_.gradientMap,Nt=!!_.alphaMap,_t=_.alphaTest>0,ht=!!_.alphaHash,zt=!!_.extensions;let Yt=Nn;_.toneMapped&&(ut===null||ut.isXRRenderTarget===!0)&&(Yt=i.toneMapping);const le={shaderID:lt,shaderType:_.type,shaderName:_.name,vertexShader:ft,fragmentShader:Ut,defines:_.defines,customVertexShaderID:Pt,customFragmentShaderID:ct,isRawShaderMaterial:_.isRawShaderMaterial===!0,glslVersion:_.glslVersion,precision:p,batching:j,batchingColor:j&&k._colorsTexture!==null,instancing:V,instancingColor:V&&k.instanceColor!==null,instancingMorph:V&&k.morphTexture!==null,supportsVertexTextures:g,outputColorSpace:ut===null?i.outputColorSpace:ut.isXRRenderTarget===!0?ut.texture.colorSpace:zi,alphaToCoverage:!!_.alphaToCoverage,map:Q,matcap:dt,envMap:M,envMapMode:M&&$.mapping,envMapCubeUVHeight:J,aoMap:z,lightMap:w,bumpMap:b,normalMap:O,displacementMap:g&&U,emissiveMap:I,normalMapObjectSpace:O&&_.normalMapType===Kd,normalMapTangentSpace:O&&_.normalMapType===cc,metalnessMap:X,roughnessMap:q,anisotropy:nt,anisotropyMap:it,clearcoat:R,clearcoatMap:Tt,clearcoatNormalMap:mt,clearcoatRoughnessMap:Dt,dispersion:y,iridescence:W,iridescenceMap:Lt,iridescenceThicknessMap:gt,sheen:K,sheenColorMap:bt,sheenRoughnessMap:Xt,specularMap:Bt,specularColorMap:Rt,specularIntensityMap:qt,transmission:st,transmissionMap:Y,thicknessMap:vt,gradientMap:yt,opaque:_.transparent===!1&&_.blending===Di&&_.alphaToCoverage===!1,alphaMap:Nt,alphaTest:_t,alphaHash:ht,combine:_.combine,mapUv:Q&&x(_.map.channel),aoMapUv:z&&x(_.aoMap.channel),lightMapUv:w&&x(_.lightMap.channel),bumpMapUv:b&&x(_.bumpMap.channel),normalMapUv:O&&x(_.normalMap.channel),displacementMapUv:U&&x(_.displacementMap.channel),emissiveMapUv:I&&x(_.emissiveMap.channel),metalnessMapUv:X&&x(_.metalnessMap.channel),roughnessMapUv:q&&x(_.roughnessMap.channel),anisotropyMapUv:it&&x(_.anisotropyMap.channel),clearcoatMapUv:Tt&&x(_.clearcoatMap.channel),clearcoatNormalMapUv:mt&&x(_.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Dt&&x(_.clearcoatRoughnessMap.channel),iridescenceMapUv:Lt&&x(_.iridescenceMap.channel),iridescenceThicknessMapUv:gt&&x(_.iridescenceThicknessMap.channel),sheenColorMapUv:bt&&x(_.sheenColorMap.channel),sheenRoughnessMapUv:Xt&&x(_.sheenRoughnessMap.channel),specularMapUv:Bt&&x(_.specularMap.channel),specularColorMapUv:Rt&&x(_.specularColorMap.channel),specularIntensityMapUv:qt&&x(_.specularIntensityMap.channel),transmissionMapUv:Y&&x(_.transmissionMap.channel),thicknessMapUv:vt&&x(_.thicknessMap.channel),alphaMapUv:Nt&&x(_.alphaMap.channel),vertexTangents:!!G.attributes.tangent&&(O||nt),vertexColors:_.vertexColors,vertexAlphas:_.vertexColors===!0&&!!G.attributes.color&&G.attributes.color.itemSize===4,pointsUvs:k.isPoints===!0&&!!G.attributes.uv&&(Q||Nt),fog:!!F,useFog:_.fog===!0,fogExp2:!!F&&F.isFogExp2,flatShading:_.flatShading===!0&&_.wireframe===!1,sizeAttenuation:_.sizeAttenuation===!0,logarithmicDepthBuffer:h,reversedDepthBuffer:St,skinning:k.isSkinnedMesh===!0,morphTargets:G.morphAttributes.position!==void 0,morphNormals:G.morphAttributes.normal!==void 0,morphColors:G.morphAttributes.color!==void 0,morphTargetsCount:Et,morphTextureStride:ot,numDirLights:S.directional.length,numPointLights:S.point.length,numSpotLights:S.spot.length,numSpotLightMaps:S.spotLightMap.length,numRectAreaLights:S.rectArea.length,numHemiLights:S.hemi.length,numDirLightShadows:S.directionalShadowMap.length,numPointLightShadows:S.pointShadowMap.length,numSpotLightShadows:S.spotShadowMap.length,numSpotLightShadowsWithMaps:S.numSpotLightShadowsWithMaps,numLightProbes:S.numLightProbes,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:_.dithering,shadowMapEnabled:i.shadowMap.enabled&&N.length>0,shadowMapType:i.shadowMap.type,toneMapping:Yt,decodeVideoTexture:Q&&_.map.isVideoTexture===!0&&ne.getTransfer(_.map.colorSpace)===re,decodeVideoTextureEmissive:I&&_.emissiveMap.isVideoTexture===!0&&ne.getTransfer(_.emissiveMap.colorSpace)===re,premultipliedAlpha:_.premultipliedAlpha,doubleSided:_.side===ln,flipSided:_.side===Fe,useDepthPacking:_.depthPacking>=0,depthPacking:_.depthPacking||0,index0AttributeName:_.index0AttributeName,extensionClipCullDistance:zt&&_.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(zt&&_.extensions.multiDraw===!0||j)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:_.customProgramCacheKey()};return le.vertexUv1s=c.has(1),le.vertexUv2s=c.has(2),le.vertexUv3s=c.has(3),c.clear(),le}function d(_){const S=[];if(_.shaderID?S.push(_.shaderID):(S.push(_.customVertexShaderID),S.push(_.customFragmentShaderID)),_.defines!==void 0)for(const N in _.defines)S.push(N),S.push(_.defines[N]);return _.isRawShaderMaterial===!1&&(A(S,_),P(S,_),S.push(i.outputColorSpace)),S.push(_.customProgramCacheKey),S.join()}function A(_,S){_.push(S.precision),_.push(S.outputColorSpace),_.push(S.envMapMode),_.push(S.envMapCubeUVHeight),_.push(S.mapUv),_.push(S.alphaMapUv),_.push(S.lightMapUv),_.push(S.aoMapUv),_.push(S.bumpMapUv),_.push(S.normalMapUv),_.push(S.displacementMapUv),_.push(S.emissiveMapUv),_.push(S.metalnessMapUv),_.push(S.roughnessMapUv),_.push(S.anisotropyMapUv),_.push(S.clearcoatMapUv),_.push(S.clearcoatNormalMapUv),_.push(S.clearcoatRoughnessMapUv),_.push(S.iridescenceMapUv),_.push(S.iridescenceThicknessMapUv),_.push(S.sheenColorMapUv),_.push(S.sheenRoughnessMapUv),_.push(S.specularMapUv),_.push(S.specularColorMapUv),_.push(S.specularIntensityMapUv),_.push(S.transmissionMapUv),_.push(S.thicknessMapUv),_.push(S.combine),_.push(S.fogExp2),_.push(S.sizeAttenuation),_.push(S.morphTargetsCount),_.push(S.morphAttributeCount),_.push(S.numDirLights),_.push(S.numPointLights),_.push(S.numSpotLights),_.push(S.numSpotLightMaps),_.push(S.numHemiLights),_.push(S.numRectAreaLights),_.push(S.numDirLightShadows),_.push(S.numPointLightShadows),_.push(S.numSpotLightShadows),_.push(S.numSpotLightShadowsWithMaps),_.push(S.numLightProbes),_.push(S.shadowMapType),_.push(S.toneMapping),_.push(S.numClippingPlanes),_.push(S.numClipIntersection),_.push(S.depthPacking)}function P(_,S){a.disableAll(),S.supportsVertexTextures&&a.enable(0),S.instancing&&a.enable(1),S.instancingColor&&a.enable(2),S.instancingMorph&&a.enable(3),S.matcap&&a.enable(4),S.envMap&&a.enable(5),S.normalMapObjectSpace&&a.enable(6),S.normalMapTangentSpace&&a.enable(7),S.clearcoat&&a.enable(8),S.iridescence&&a.enable(9),S.alphaTest&&a.enable(10),S.vertexColors&&a.enable(11),S.vertexAlphas&&a.enable(12),S.vertexUv1s&&a.enable(13),S.vertexUv2s&&a.enable(14),S.vertexUv3s&&a.enable(15),S.vertexTangents&&a.enable(16),S.anisotropy&&a.enable(17),S.alphaHash&&a.enable(18),S.batching&&a.enable(19),S.dispersion&&a.enable(20),S.batchingColor&&a.enable(21),S.gradientMap&&a.enable(22),_.push(a.mask),a.disableAll(),S.fog&&a.enable(0),S.useFog&&a.enable(1),S.flatShading&&a.enable(2),S.logarithmicDepthBuffer&&a.enable(3),S.reversedDepthBuffer&&a.enable(4),S.skinning&&a.enable(5),S.morphTargets&&a.enable(6),S.morphNormals&&a.enable(7),S.morphColors&&a.enable(8),S.premultipliedAlpha&&a.enable(9),S.shadowMapEnabled&&a.enable(10),S.doubleSided&&a.enable(11),S.flipSided&&a.enable(12),S.useDepthPacking&&a.enable(13),S.dithering&&a.enable(14),S.transmission&&a.enable(15),S.sheen&&a.enable(16),S.opaque&&a.enable(17),S.pointsUvs&&a.enable(18),S.decodeVideoTexture&&a.enable(19),S.decodeVideoTextureEmissive&&a.enable(20),S.alphaToCoverage&&a.enable(21),_.push(a.mask)}function v(_){const S=m[_.type];let N;if(S){const B=an[S];N=Au.clone(B.uniforms)}else N=_.uniforms;return N}function C(_,S){let N;for(let B=0,k=u.length;B<k;B++){const F=u[B];if(F.cacheKey===S){N=F,++N.usedTimes;break}}return N===void 0&&(N=new ng(i,S,_,r),u.push(N)),N}function E(_){if(--_.usedTimes===0){const S=u.indexOf(_);u[S]=u[u.length-1],u.pop(),_.destroy()}}function T(_){l.remove(_)}function L(){l.dispose()}return{getParameters:f,getProgramCacheKey:d,getUniforms:v,acquireProgram:C,releaseProgram:E,releaseShaderCache:T,programs:u,dispose:L}}function ag(){let i=new WeakMap;function t(o){return i.has(o)}function e(o){let a=i.get(o);return a===void 0&&(a={},i.set(o,a)),a}function n(o){i.delete(o)}function s(o,a,l){i.get(o)[a]=l}function r(){i=new WeakMap}return{has:t,get:e,remove:n,update:s,dispose:r}}function lg(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.material.id!==t.material.id?i.material.id-t.material.id:i.z!==t.z?i.z-t.z:i.id-t.id}function El(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.z!==t.z?t.z-i.z:i.id-t.id}function Tl(){const i=[];let t=0;const e=[],n=[],s=[];function r(){t=0,e.length=0,n.length=0,s.length=0}function o(h,g,p,m,x,f){let d=i[t];return d===void 0?(d={id:h.id,object:h,geometry:g,material:p,groupOrder:m,renderOrder:h.renderOrder,z:x,group:f},i[t]=d):(d.id=h.id,d.object=h,d.geometry=g,d.material=p,d.groupOrder=m,d.renderOrder=h.renderOrder,d.z=x,d.group=f),t++,d}function a(h,g,p,m,x,f){const d=o(h,g,p,m,x,f);p.transmission>0?n.push(d):p.transparent===!0?s.push(d):e.push(d)}function l(h,g,p,m,x,f){const d=o(h,g,p,m,x,f);p.transmission>0?n.unshift(d):p.transparent===!0?s.unshift(d):e.unshift(d)}function c(h,g){e.length>1&&e.sort(h||lg),n.length>1&&n.sort(g||El),s.length>1&&s.sort(g||El)}function u(){for(let h=t,g=i.length;h<g;h++){const p=i[h];if(p.id===null)break;p.id=null,p.object=null,p.geometry=null,p.material=null,p.group=null}}return{opaque:e,transmissive:n,transparent:s,init:r,push:a,unshift:l,finish:u,sort:c}}function cg(){let i=new WeakMap;function t(n,s){const r=i.get(n);let o;return r===void 0?(o=new Tl,i.set(n,[o])):s>=r.length?(o=new Tl,r.push(o)):o=r[s],o}function e(){i=new WeakMap}return{get:t,dispose:e}}function dg(){const i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={direction:new Z,color:new Jt};break;case"SpotLight":e={position:new Z,direction:new Z,color:new Jt,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new Z,color:new Jt,distance:0,decay:0};break;case"HemisphereLight":e={direction:new Z,skyColor:new Jt,groundColor:new Jt};break;case"RectAreaLight":e={color:new Jt,position:new Z,halfWidth:new Z,halfHeight:new Z};break}return i[t.id]=e,e}}}function ug(){const i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new $t};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new $t};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new $t,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[t.id]=e,e}}}let hg=0;function fg(i,t){return(t.castShadow?2:0)-(i.castShadow?2:0)+(t.map?1:0)-(i.map?1:0)}function pg(i){const t=new dg,e=ug(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new Z);const s=new Z,r=new me,o=new me;function a(c){let u=0,h=0,g=0;for(let _=0;_<9;_++)n.probe[_].set(0,0,0);let p=0,m=0,x=0,f=0,d=0,A=0,P=0,v=0,C=0,E=0,T=0;c.sort(fg);for(let _=0,S=c.length;_<S;_++){const N=c[_],B=N.color,k=N.intensity,F=N.distance,G=N.shadow&&N.shadow.map?N.shadow.map.texture:null;if(N.isAmbientLight)u+=B.r*k,h+=B.g*k,g+=B.b*k;else if(N.isLightProbe){for(let H=0;H<9;H++)n.probe[H].addScaledVector(N.sh.coefficients[H],k);T++}else if(N.isDirectionalLight){const H=t.get(N);if(H.color.copy(N.color).multiplyScalar(N.intensity),N.castShadow){const $=N.shadow,J=e.get(N);J.shadowIntensity=$.intensity,J.shadowBias=$.bias,J.shadowNormalBias=$.normalBias,J.shadowRadius=$.radius,J.shadowMapSize=$.mapSize,n.directionalShadow[p]=J,n.directionalShadowMap[p]=G,n.directionalShadowMatrix[p]=N.shadow.matrix,A++}n.directional[p]=H,p++}else if(N.isSpotLight){const H=t.get(N);H.position.setFromMatrixPosition(N.matrixWorld),H.color.copy(B).multiplyScalar(k),H.distance=F,H.coneCos=Math.cos(N.angle),H.penumbraCos=Math.cos(N.angle*(1-N.penumbra)),H.decay=N.decay,n.spot[x]=H;const $=N.shadow;if(N.map&&(n.spotLightMap[C]=N.map,C++,$.updateMatrices(N),N.castShadow&&E++),n.spotLightMatrix[x]=$.matrix,N.castShadow){const J=e.get(N);J.shadowIntensity=$.intensity,J.shadowBias=$.bias,J.shadowNormalBias=$.normalBias,J.shadowRadius=$.radius,J.shadowMapSize=$.mapSize,n.spotShadow[x]=J,n.spotShadowMap[x]=G,v++}x++}else if(N.isRectAreaLight){const H=t.get(N);H.color.copy(B).multiplyScalar(k),H.halfWidth.set(N.width*.5,0,0),H.halfHeight.set(0,N.height*.5,0),n.rectArea[f]=H,f++}else if(N.isPointLight){const H=t.get(N);if(H.color.copy(N.color).multiplyScalar(N.intensity),H.distance=N.distance,H.decay=N.decay,N.castShadow){const $=N.shadow,J=e.get(N);J.shadowIntensity=$.intensity,J.shadowBias=$.bias,J.shadowNormalBias=$.normalBias,J.shadowRadius=$.radius,J.shadowMapSize=$.mapSize,J.shadowCameraNear=$.camera.near,J.shadowCameraFar=$.camera.far,n.pointShadow[m]=J,n.pointShadowMap[m]=G,n.pointShadowMatrix[m]=N.shadow.matrix,P++}n.point[m]=H,m++}else if(N.isHemisphereLight){const H=t.get(N);H.skyColor.copy(N.color).multiplyScalar(k),H.groundColor.copy(N.groundColor).multiplyScalar(k),n.hemi[d]=H,d++}}f>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=wt.LTC_FLOAT_1,n.rectAreaLTC2=wt.LTC_FLOAT_2):(n.rectAreaLTC1=wt.LTC_HALF_1,n.rectAreaLTC2=wt.LTC_HALF_2)),n.ambient[0]=u,n.ambient[1]=h,n.ambient[2]=g;const L=n.hash;(L.directionalLength!==p||L.pointLength!==m||L.spotLength!==x||L.rectAreaLength!==f||L.hemiLength!==d||L.numDirectionalShadows!==A||L.numPointShadows!==P||L.numSpotShadows!==v||L.numSpotMaps!==C||L.numLightProbes!==T)&&(n.directional.length=p,n.spot.length=x,n.rectArea.length=f,n.point.length=m,n.hemi.length=d,n.directionalShadow.length=A,n.directionalShadowMap.length=A,n.pointShadow.length=P,n.pointShadowMap.length=P,n.spotShadow.length=v,n.spotShadowMap.length=v,n.directionalShadowMatrix.length=A,n.pointShadowMatrix.length=P,n.spotLightMatrix.length=v+C-E,n.spotLightMap.length=C,n.numSpotLightShadowsWithMaps=E,n.numLightProbes=T,L.directionalLength=p,L.pointLength=m,L.spotLength=x,L.rectAreaLength=f,L.hemiLength=d,L.numDirectionalShadows=A,L.numPointShadows=P,L.numSpotShadows=v,L.numSpotMaps=C,L.numLightProbes=T,n.version=hg++)}function l(c,u){let h=0,g=0,p=0,m=0,x=0;const f=u.matrixWorldInverse;for(let d=0,A=c.length;d<A;d++){const P=c[d];if(P.isDirectionalLight){const v=n.directional[h];v.direction.setFromMatrixPosition(P.matrixWorld),s.setFromMatrixPosition(P.target.matrixWorld),v.direction.sub(s),v.direction.transformDirection(f),h++}else if(P.isSpotLight){const v=n.spot[p];v.position.setFromMatrixPosition(P.matrixWorld),v.position.applyMatrix4(f),v.direction.setFromMatrixPosition(P.matrixWorld),s.setFromMatrixPosition(P.target.matrixWorld),v.direction.sub(s),v.direction.transformDirection(f),p++}else if(P.isRectAreaLight){const v=n.rectArea[m];v.position.setFromMatrixPosition(P.matrixWorld),v.position.applyMatrix4(f),o.identity(),r.copy(P.matrixWorld),r.premultiply(f),o.extractRotation(r),v.halfWidth.set(P.width*.5,0,0),v.halfHeight.set(0,P.height*.5,0),v.halfWidth.applyMatrix4(o),v.halfHeight.applyMatrix4(o),m++}else if(P.isPointLight){const v=n.point[g];v.position.setFromMatrixPosition(P.matrixWorld),v.position.applyMatrix4(f),g++}else if(P.isHemisphereLight){const v=n.hemi[x];v.direction.setFromMatrixPosition(P.matrixWorld),v.direction.transformDirection(f),x++}}}return{setup:a,setupView:l,state:n}}function wl(i){const t=new pg(i),e=[],n=[];function s(u){c.camera=u,e.length=0,n.length=0}function r(u){e.push(u)}function o(u){n.push(u)}function a(){t.setup(e)}function l(u){t.setupView(e,u)}const c={lightsArray:e,shadowsArray:n,camera:null,lights:t,transmissionRenderTarget:{}};return{init:s,state:c,setupLights:a,setupLightsView:l,pushLight:r,pushShadow:o}}function mg(i){let t=new WeakMap;function e(s,r=0){const o=t.get(s);let a;return o===void 0?(a=new wl(i),t.set(s,[a])):r>=o.length?(a=new wl(i),o.push(a)):a=o[r],a}function n(){t=new WeakMap}return{get:e,dispose:n}}const gg=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,_g=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function xg(i,t,e){let n=new na;const s=new $t,r=new $t,o=new pe,a=new Bu({depthPacking:Zd}),l=new ku,c={},u=e.maxTextureSize,h={[Fn]:Fe,[Fe]:Fn,[ln]:ln},g=new On({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new $t},radius:{value:4}},vertexShader:gg,fragmentShader:_g}),p=g.clone();p.defines.HORIZONTAL_PASS=1;const m=new je;m.setAttribute("position",new Ae(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const x=new Le(m,g),f=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Zl;let d=this.type;this.render=function(E,T,L){if(f.enabled===!1||f.autoUpdate===!1&&f.needsUpdate===!1||E.length===0)return;const _=i.getRenderTarget(),S=i.getActiveCubeFace(),N=i.getActiveMipmapLevel(),B=i.state;B.setBlending(Un),B.buffers.depth.getReversed()===!0?B.buffers.color.setClear(0,0,0,0):B.buffers.color.setClear(1,1,1,1),B.buffers.depth.setTest(!0),B.setScissorTest(!1);const k=d!==yn&&this.type===yn,F=d===yn&&this.type!==yn;for(let G=0,H=E.length;G<H;G++){const $=E[G],J=$.shadow;if(J===void 0){console.warn("THREE.WebGLShadowMap:",$,"has no shadow.");continue}if(J.autoUpdate===!1&&J.needsUpdate===!1)continue;s.copy(J.mapSize);const lt=J.getFrameExtents();if(s.multiply(lt),r.copy(J.mapSize),(s.x>u||s.y>u)&&(s.x>u&&(r.x=Math.floor(u/lt.x),s.x=r.x*lt.x,J.mapSize.x=r.x),s.y>u&&(r.y=Math.floor(u/lt.y),s.y=r.y*lt.y,J.mapSize.y=r.y)),J.map===null||k===!0||F===!0){const Et=this.type!==yn?{minFilter:sn,magFilter:sn}:{};J.map!==null&&J.map.dispose(),J.map=new ii(s.x,s.y,Et),J.map.texture.name=$.name+".shadowMap",J.camera.updateProjectionMatrix()}i.setRenderTarget(J.map),i.clear();const pt=J.getViewportCount();for(let Et=0;Et<pt;Et++){const ot=J.getViewport(Et);o.set(r.x*ot.x,r.y*ot.y,r.x*ot.z,r.y*ot.w),B.viewport(o),J.updateMatrices($,Et),n=J.getFrustum(),v(T,L,J.camera,$,this.type)}J.isPointLightShadow!==!0&&this.type===yn&&A(J,L),J.needsUpdate=!1}d=this.type,f.needsUpdate=!1,i.setRenderTarget(_,S,N)};function A(E,T){const L=t.update(x);g.defines.VSM_SAMPLES!==E.blurSamples&&(g.defines.VSM_SAMPLES=E.blurSamples,p.defines.VSM_SAMPLES=E.blurSamples,g.needsUpdate=!0,p.needsUpdate=!0),E.mapPass===null&&(E.mapPass=new ii(s.x,s.y)),g.uniforms.shadow_pass.value=E.map.texture,g.uniforms.resolution.value=E.mapSize,g.uniforms.radius.value=E.radius,i.setRenderTarget(E.mapPass),i.clear(),i.renderBufferDirect(T,null,L,g,x,null),p.uniforms.shadow_pass.value=E.mapPass.texture,p.uniforms.resolution.value=E.mapSize,p.uniforms.radius.value=E.radius,i.setRenderTarget(E.map),i.clear(),i.renderBufferDirect(T,null,L,p,x,null)}function P(E,T,L,_){let S=null;const N=L.isPointLight===!0?E.customDistanceMaterial:E.customDepthMaterial;if(N!==void 0)S=N;else if(S=L.isPointLight===!0?l:a,i.localClippingEnabled&&T.clipShadows===!0&&Array.isArray(T.clippingPlanes)&&T.clippingPlanes.length!==0||T.displacementMap&&T.displacementScale!==0||T.alphaMap&&T.alphaTest>0||T.map&&T.alphaTest>0||T.alphaToCoverage===!0){const B=S.uuid,k=T.uuid;let F=c[B];F===void 0&&(F={},c[B]=F);let G=F[k];G===void 0&&(G=S.clone(),F[k]=G,T.addEventListener("dispose",C)),S=G}if(S.visible=T.visible,S.wireframe=T.wireframe,_===yn?S.side=T.shadowSide!==null?T.shadowSide:T.side:S.side=T.shadowSide!==null?T.shadowSide:h[T.side],S.alphaMap=T.alphaMap,S.alphaTest=T.alphaToCoverage===!0?.5:T.alphaTest,S.map=T.map,S.clipShadows=T.clipShadows,S.clippingPlanes=T.clippingPlanes,S.clipIntersection=T.clipIntersection,S.displacementMap=T.displacementMap,S.displacementScale=T.displacementScale,S.displacementBias=T.displacementBias,S.wireframeLinewidth=T.wireframeLinewidth,S.linewidth=T.linewidth,L.isPointLight===!0&&S.isMeshDistanceMaterial===!0){const B=i.properties.get(S);B.light=L}return S}function v(E,T,L,_,S){if(E.visible===!1)return;if(E.layers.test(T.layers)&&(E.isMesh||E.isLine||E.isPoints)&&(E.castShadow||E.receiveShadow&&S===yn)&&(!E.frustumCulled||n.intersectsObject(E))){E.modelViewMatrix.multiplyMatrices(L.matrixWorldInverse,E.matrixWorld);const k=t.update(E),F=E.material;if(Array.isArray(F)){const G=k.groups;for(let H=0,$=G.length;H<$;H++){const J=G[H],lt=F[J.materialIndex];if(lt&&lt.visible){const pt=P(E,lt,_,S);E.onBeforeShadow(i,E,T,L,k,pt,J),i.renderBufferDirect(L,null,k,pt,E,J),E.onAfterShadow(i,E,T,L,k,pt,J)}}}else if(F.visible){const G=P(E,F,_,S);E.onBeforeShadow(i,E,T,L,k,G,null),i.renderBufferDirect(L,null,k,G,E,null),E.onAfterShadow(i,E,T,L,k,G,null)}}const B=E.children;for(let k=0,F=B.length;k<F;k++)v(B[k],T,L,_,S)}function C(E){E.target.removeEventListener("dispose",C);for(const L in c){const _=c[L],S=E.target.uuid;S in _&&(_[S].dispose(),delete _[S])}}}const vg={[Zr]:Kr,[Jr]:eo,[Qr]:no,[Ni]:to,[Kr]:Zr,[eo]:Jr,[no]:Qr,[to]:Ni};function Mg(i,t){function e(){let Y=!1;const vt=new pe;let yt=null;const Nt=new pe(0,0,0,0);return{setMask:function(_t){yt!==_t&&!Y&&(i.colorMask(_t,_t,_t,_t),yt=_t)},setLocked:function(_t){Y=_t},setClear:function(_t,ht,zt,Yt,le){le===!0&&(_t*=Yt,ht*=Yt,zt*=Yt),vt.set(_t,ht,zt,Yt),Nt.equals(vt)===!1&&(i.clearColor(_t,ht,zt,Yt),Nt.copy(vt))},reset:function(){Y=!1,yt=null,Nt.set(-1,0,0,0)}}}function n(){let Y=!1,vt=!1,yt=null,Nt=null,_t=null;return{setReversed:function(ht){if(vt!==ht){const zt=t.get("EXT_clip_control");ht?zt.clipControlEXT(zt.LOWER_LEFT_EXT,zt.ZERO_TO_ONE_EXT):zt.clipControlEXT(zt.LOWER_LEFT_EXT,zt.NEGATIVE_ONE_TO_ONE_EXT),vt=ht;const Yt=_t;_t=null,this.setClear(Yt)}},getReversed:function(){return vt},setTest:function(ht){ht?ut(i.DEPTH_TEST):St(i.DEPTH_TEST)},setMask:function(ht){yt!==ht&&!Y&&(i.depthMask(ht),yt=ht)},setFunc:function(ht){if(vt&&(ht=vg[ht]),Nt!==ht){switch(ht){case Zr:i.depthFunc(i.NEVER);break;case Kr:i.depthFunc(i.ALWAYS);break;case Jr:i.depthFunc(i.LESS);break;case Ni:i.depthFunc(i.LEQUAL);break;case Qr:i.depthFunc(i.EQUAL);break;case to:i.depthFunc(i.GEQUAL);break;case eo:i.depthFunc(i.GREATER);break;case no:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}Nt=ht}},setLocked:function(ht){Y=ht},setClear:function(ht){_t!==ht&&(vt&&(ht=1-ht),i.clearDepth(ht),_t=ht)},reset:function(){Y=!1,yt=null,Nt=null,_t=null,vt=!1}}}function s(){let Y=!1,vt=null,yt=null,Nt=null,_t=null,ht=null,zt=null,Yt=null,le=null;return{setTest:function(ie){Y||(ie?ut(i.STENCIL_TEST):St(i.STENCIL_TEST))},setMask:function(ie){vt!==ie&&!Y&&(i.stencilMask(ie),vt=ie)},setFunc:function(ie,mn,rn){(yt!==ie||Nt!==mn||_t!==rn)&&(i.stencilFunc(ie,mn,rn),yt=ie,Nt=mn,_t=rn)},setOp:function(ie,mn,rn){(ht!==ie||zt!==mn||Yt!==rn)&&(i.stencilOp(ie,mn,rn),ht=ie,zt=mn,Yt=rn)},setLocked:function(ie){Y=ie},setClear:function(ie){le!==ie&&(i.clearStencil(ie),le=ie)},reset:function(){Y=!1,vt=null,yt=null,Nt=null,_t=null,ht=null,zt=null,Yt=null,le=null}}}const r=new e,o=new n,a=new s,l=new WeakMap,c=new WeakMap;let u={},h={},g=new WeakMap,p=[],m=null,x=!1,f=null,d=null,A=null,P=null,v=null,C=null,E=null,T=new Jt(0,0,0),L=0,_=!1,S=null,N=null,B=null,k=null,F=null;const G=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let H=!1,$=0;const J=i.getParameter(i.VERSION);J.indexOf("WebGL")!==-1?($=parseFloat(/^WebGL (\d)/.exec(J)[1]),H=$>=1):J.indexOf("OpenGL ES")!==-1&&($=parseFloat(/^OpenGL ES (\d)/.exec(J)[1]),H=$>=2);let lt=null,pt={};const Et=i.getParameter(i.SCISSOR_BOX),ot=i.getParameter(i.VIEWPORT),ft=new pe().fromArray(Et),Ut=new pe().fromArray(ot);function Pt(Y,vt,yt,Nt){const _t=new Uint8Array(4),ht=i.createTexture();i.bindTexture(Y,ht),i.texParameteri(Y,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(Y,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let zt=0;zt<yt;zt++)Y===i.TEXTURE_3D||Y===i.TEXTURE_2D_ARRAY?i.texImage3D(vt,0,i.RGBA,1,1,Nt,0,i.RGBA,i.UNSIGNED_BYTE,_t):i.texImage2D(vt+zt,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,_t);return ht}const ct={};ct[i.TEXTURE_2D]=Pt(i.TEXTURE_2D,i.TEXTURE_2D,1),ct[i.TEXTURE_CUBE_MAP]=Pt(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),ct[i.TEXTURE_2D_ARRAY]=Pt(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),ct[i.TEXTURE_3D]=Pt(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),a.setClear(0),ut(i.DEPTH_TEST),o.setFunc(Ni),b(!1),O(ba),ut(i.CULL_FACE),z(Un);function ut(Y){u[Y]!==!0&&(i.enable(Y),u[Y]=!0)}function St(Y){u[Y]!==!1&&(i.disable(Y),u[Y]=!1)}function V(Y,vt){return h[Y]!==vt?(i.bindFramebuffer(Y,vt),h[Y]=vt,Y===i.DRAW_FRAMEBUFFER&&(h[i.FRAMEBUFFER]=vt),Y===i.FRAMEBUFFER&&(h[i.DRAW_FRAMEBUFFER]=vt),!0):!1}function j(Y,vt){let yt=p,Nt=!1;if(Y){yt=g.get(vt),yt===void 0&&(yt=[],g.set(vt,yt));const _t=Y.textures;if(yt.length!==_t.length||yt[0]!==i.COLOR_ATTACHMENT0){for(let ht=0,zt=_t.length;ht<zt;ht++)yt[ht]=i.COLOR_ATTACHMENT0+ht;yt.length=_t.length,Nt=!0}}else yt[0]!==i.BACK&&(yt[0]=i.BACK,Nt=!0);Nt&&i.drawBuffers(yt)}function Q(Y){return m!==Y?(i.useProgram(Y),m=Y,!0):!1}const dt={[Zn]:i.FUNC_ADD,[bd]:i.FUNC_SUBTRACT,[Ed]:i.FUNC_REVERSE_SUBTRACT};dt[Td]=i.MIN,dt[wd]=i.MAX;const M={[Ad]:i.ZERO,[Rd]:i.ONE,[Cd]:i.SRC_COLOR,[Yr]:i.SRC_ALPHA,[Nd]:i.SRC_ALPHA_SATURATE,[Id]:i.DST_COLOR,[Ld]:i.DST_ALPHA,[Pd]:i.ONE_MINUS_SRC_COLOR,[qr]:i.ONE_MINUS_SRC_ALPHA,[Ud]:i.ONE_MINUS_DST_COLOR,[Dd]:i.ONE_MINUS_DST_ALPHA,[Fd]:i.CONSTANT_COLOR,[Od]:i.ONE_MINUS_CONSTANT_COLOR,[zd]:i.CONSTANT_ALPHA,[Bd]:i.ONE_MINUS_CONSTANT_ALPHA};function z(Y,vt,yt,Nt,_t,ht,zt,Yt,le,ie){if(Y===Un){x===!0&&(St(i.BLEND),x=!1);return}if(x===!1&&(ut(i.BLEND),x=!0),Y!==Sd){if(Y!==f||ie!==_){if((d!==Zn||v!==Zn)&&(i.blendEquation(i.FUNC_ADD),d=Zn,v=Zn),ie)switch(Y){case Di:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Ea:i.blendFunc(i.ONE,i.ONE);break;case Ta:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case wa:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:console.error("THREE.WebGLState: Invalid blending: ",Y);break}else switch(Y){case Di:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Ea:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case Ta:console.error("THREE.WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case wa:console.error("THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:console.error("THREE.WebGLState: Invalid blending: ",Y);break}A=null,P=null,C=null,E=null,T.set(0,0,0),L=0,f=Y,_=ie}return}_t=_t||vt,ht=ht||yt,zt=zt||Nt,(vt!==d||_t!==v)&&(i.blendEquationSeparate(dt[vt],dt[_t]),d=vt,v=_t),(yt!==A||Nt!==P||ht!==C||zt!==E)&&(i.blendFuncSeparate(M[yt],M[Nt],M[ht],M[zt]),A=yt,P=Nt,C=ht,E=zt),(Yt.equals(T)===!1||le!==L)&&(i.blendColor(Yt.r,Yt.g,Yt.b,le),T.copy(Yt),L=le),f=Y,_=!1}function w(Y,vt){Y.side===ln?St(i.CULL_FACE):ut(i.CULL_FACE);let yt=Y.side===Fe;vt&&(yt=!yt),b(yt),Y.blending===Di&&Y.transparent===!1?z(Un):z(Y.blending,Y.blendEquation,Y.blendSrc,Y.blendDst,Y.blendEquationAlpha,Y.blendSrcAlpha,Y.blendDstAlpha,Y.blendColor,Y.blendAlpha,Y.premultipliedAlpha),o.setFunc(Y.depthFunc),o.setTest(Y.depthTest),o.setMask(Y.depthWrite),r.setMask(Y.colorWrite);const Nt=Y.stencilWrite;a.setTest(Nt),Nt&&(a.setMask(Y.stencilWriteMask),a.setFunc(Y.stencilFunc,Y.stencilRef,Y.stencilFuncMask),a.setOp(Y.stencilFail,Y.stencilZFail,Y.stencilZPass)),I(Y.polygonOffset,Y.polygonOffsetFactor,Y.polygonOffsetUnits),Y.alphaToCoverage===!0?ut(i.SAMPLE_ALPHA_TO_COVERAGE):St(i.SAMPLE_ALPHA_TO_COVERAGE)}function b(Y){S!==Y&&(Y?i.frontFace(i.CW):i.frontFace(i.CCW),S=Y)}function O(Y){Y!==Md?(ut(i.CULL_FACE),Y!==N&&(Y===ba?i.cullFace(i.BACK):Y===yd?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):St(i.CULL_FACE),N=Y}function U(Y){Y!==B&&(H&&i.lineWidth(Y),B=Y)}function I(Y,vt,yt){Y?(ut(i.POLYGON_OFFSET_FILL),(k!==vt||F!==yt)&&(i.polygonOffset(vt,yt),k=vt,F=yt)):St(i.POLYGON_OFFSET_FILL)}function X(Y){Y?ut(i.SCISSOR_TEST):St(i.SCISSOR_TEST)}function q(Y){Y===void 0&&(Y=i.TEXTURE0+G-1),lt!==Y&&(i.activeTexture(Y),lt=Y)}function nt(Y,vt,yt){yt===void 0&&(lt===null?yt=i.TEXTURE0+G-1:yt=lt);let Nt=pt[yt];Nt===void 0&&(Nt={type:void 0,texture:void 0},pt[yt]=Nt),(Nt.type!==Y||Nt.texture!==vt)&&(lt!==yt&&(i.activeTexture(yt),lt=yt),i.bindTexture(Y,vt||ct[Y]),Nt.type=Y,Nt.texture=vt)}function R(){const Y=pt[lt];Y!==void 0&&Y.type!==void 0&&(i.bindTexture(Y.type,null),Y.type=void 0,Y.texture=void 0)}function y(){try{i.compressedTexImage2D(...arguments)}catch(Y){console.error("THREE.WebGLState:",Y)}}function W(){try{i.compressedTexImage3D(...arguments)}catch(Y){console.error("THREE.WebGLState:",Y)}}function K(){try{i.texSubImage2D(...arguments)}catch(Y){console.error("THREE.WebGLState:",Y)}}function st(){try{i.texSubImage3D(...arguments)}catch(Y){console.error("THREE.WebGLState:",Y)}}function it(){try{i.compressedTexSubImage2D(...arguments)}catch(Y){console.error("THREE.WebGLState:",Y)}}function Tt(){try{i.compressedTexSubImage3D(...arguments)}catch(Y){console.error("THREE.WebGLState:",Y)}}function mt(){try{i.texStorage2D(...arguments)}catch(Y){console.error("THREE.WebGLState:",Y)}}function Dt(){try{i.texStorage3D(...arguments)}catch(Y){console.error("THREE.WebGLState:",Y)}}function Lt(){try{i.texImage2D(...arguments)}catch(Y){console.error("THREE.WebGLState:",Y)}}function gt(){try{i.texImage3D(...arguments)}catch(Y){console.error("THREE.WebGLState:",Y)}}function bt(Y){ft.equals(Y)===!1&&(i.scissor(Y.x,Y.y,Y.z,Y.w),ft.copy(Y))}function Xt(Y){Ut.equals(Y)===!1&&(i.viewport(Y.x,Y.y,Y.z,Y.w),Ut.copy(Y))}function Bt(Y,vt){let yt=c.get(vt);yt===void 0&&(yt=new WeakMap,c.set(vt,yt));let Nt=yt.get(Y);Nt===void 0&&(Nt=i.getUniformBlockIndex(vt,Y.name),yt.set(Y,Nt))}function Rt(Y,vt){const Nt=c.get(vt).get(Y);l.get(vt)!==Nt&&(i.uniformBlockBinding(vt,Nt,Y.__bindingPointIndex),l.set(vt,Nt))}function qt(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),o.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),u={},lt=null,pt={},h={},g=new WeakMap,p=[],m=null,x=!1,f=null,d=null,A=null,P=null,v=null,C=null,E=null,T=new Jt(0,0,0),L=0,_=!1,S=null,N=null,B=null,k=null,F=null,ft.set(0,0,i.canvas.width,i.canvas.height),Ut.set(0,0,i.canvas.width,i.canvas.height),r.reset(),o.reset(),a.reset()}return{buffers:{color:r,depth:o,stencil:a},enable:ut,disable:St,bindFramebuffer:V,drawBuffers:j,useProgram:Q,setBlending:z,setMaterial:w,setFlipSided:b,setCullFace:O,setLineWidth:U,setPolygonOffset:I,setScissorTest:X,activeTexture:q,bindTexture:nt,unbindTexture:R,compressedTexImage2D:y,compressedTexImage3D:W,texImage2D:Lt,texImage3D:gt,updateUBOMapping:Bt,uniformBlockBinding:Rt,texStorage2D:mt,texStorage3D:Dt,texSubImage2D:K,texSubImage3D:st,compressedTexSubImage2D:it,compressedTexSubImage3D:Tt,scissor:bt,viewport:Xt,reset:qt}}function yg(i,t,e,n,s,r,o){const a=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new $t,u=new WeakMap;let h;const g=new WeakMap;let p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function m(R,y){return p?new OffscreenCanvas(R,y):Zs("canvas")}function x(R,y,W){let K=1;const st=nt(R);if((st.width>W||st.height>W)&&(K=W/Math.max(st.width,st.height)),K<1)if(typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&R instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&R instanceof ImageBitmap||typeof VideoFrame<"u"&&R instanceof VideoFrame){const it=Math.floor(K*st.width),Tt=Math.floor(K*st.height);h===void 0&&(h=m(it,Tt));const mt=y?m(it,Tt):h;return mt.width=it,mt.height=Tt,mt.getContext("2d").drawImage(R,0,0,it,Tt),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+st.width+"x"+st.height+") to ("+it+"x"+Tt+")."),mt}else return"data"in R&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+st.width+"x"+st.height+")."),R;return R}function f(R){return R.generateMipmaps}function d(R){i.generateMipmap(R)}function A(R){return R.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:R.isWebGL3DRenderTarget?i.TEXTURE_3D:R.isWebGLArrayRenderTarget||R.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function P(R,y,W,K,st=!1){if(R!==null){if(i[R]!==void 0)return i[R];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+R+"'")}let it=y;if(y===i.RED&&(W===i.FLOAT&&(it=i.R32F),W===i.HALF_FLOAT&&(it=i.R16F),W===i.UNSIGNED_BYTE&&(it=i.R8)),y===i.RED_INTEGER&&(W===i.UNSIGNED_BYTE&&(it=i.R8UI),W===i.UNSIGNED_SHORT&&(it=i.R16UI),W===i.UNSIGNED_INT&&(it=i.R32UI),W===i.BYTE&&(it=i.R8I),W===i.SHORT&&(it=i.R16I),W===i.INT&&(it=i.R32I)),y===i.RG&&(W===i.FLOAT&&(it=i.RG32F),W===i.HALF_FLOAT&&(it=i.RG16F),W===i.UNSIGNED_BYTE&&(it=i.RG8)),y===i.RG_INTEGER&&(W===i.UNSIGNED_BYTE&&(it=i.RG8UI),W===i.UNSIGNED_SHORT&&(it=i.RG16UI),W===i.UNSIGNED_INT&&(it=i.RG32UI),W===i.BYTE&&(it=i.RG8I),W===i.SHORT&&(it=i.RG16I),W===i.INT&&(it=i.RG32I)),y===i.RGB_INTEGER&&(W===i.UNSIGNED_BYTE&&(it=i.RGB8UI),W===i.UNSIGNED_SHORT&&(it=i.RGB16UI),W===i.UNSIGNED_INT&&(it=i.RGB32UI),W===i.BYTE&&(it=i.RGB8I),W===i.SHORT&&(it=i.RGB16I),W===i.INT&&(it=i.RGB32I)),y===i.RGBA_INTEGER&&(W===i.UNSIGNED_BYTE&&(it=i.RGBA8UI),W===i.UNSIGNED_SHORT&&(it=i.RGBA16UI),W===i.UNSIGNED_INT&&(it=i.RGBA32UI),W===i.BYTE&&(it=i.RGBA8I),W===i.SHORT&&(it=i.RGBA16I),W===i.INT&&(it=i.RGBA32I)),y===i.RGB&&(W===i.UNSIGNED_INT_5_9_9_9_REV&&(it=i.RGB9_E5),W===i.UNSIGNED_INT_10F_11F_11F_REV&&(it=i.R11F_G11F_B10F)),y===i.RGBA){const Tt=st?Ys:ne.getTransfer(K);W===i.FLOAT&&(it=i.RGBA32F),W===i.HALF_FLOAT&&(it=i.RGBA16F),W===i.UNSIGNED_BYTE&&(it=Tt===re?i.SRGB8_ALPHA8:i.RGBA8),W===i.UNSIGNED_SHORT_4_4_4_4&&(it=i.RGBA4),W===i.UNSIGNED_SHORT_5_5_5_1&&(it=i.RGB5_A1)}return(it===i.R16F||it===i.R32F||it===i.RG16F||it===i.RG32F||it===i.RGBA16F||it===i.RGBA32F)&&t.get("EXT_color_buffer_float"),it}function v(R,y){let W;return R?y===null||y===ei||y===is?W=i.DEPTH24_STENCIL8:y===bn?W=i.DEPTH32F_STENCIL8:y===ns&&(W=i.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):y===null||y===ei||y===is?W=i.DEPTH_COMPONENT24:y===bn?W=i.DEPTH_COMPONENT32F:y===ns&&(W=i.DEPTH_COMPONENT16),W}function C(R,y){return f(R)===!0||R.isFramebufferTexture&&R.minFilter!==sn&&R.minFilter!==dn?Math.log2(Math.max(y.width,y.height))+1:R.mipmaps!==void 0&&R.mipmaps.length>0?R.mipmaps.length:R.isCompressedTexture&&Array.isArray(R.image)?y.mipmaps.length:1}function E(R){const y=R.target;y.removeEventListener("dispose",E),L(y),y.isVideoTexture&&u.delete(y)}function T(R){const y=R.target;y.removeEventListener("dispose",T),S(y)}function L(R){const y=n.get(R);if(y.__webglInit===void 0)return;const W=R.source,K=g.get(W);if(K){const st=K[y.__cacheKey];st.usedTimes--,st.usedTimes===0&&_(R),Object.keys(K).length===0&&g.delete(W)}n.remove(R)}function _(R){const y=n.get(R);i.deleteTexture(y.__webglTexture);const W=R.source,K=g.get(W);delete K[y.__cacheKey],o.memory.textures--}function S(R){const y=n.get(R);if(R.depthTexture&&(R.depthTexture.dispose(),n.remove(R.depthTexture)),R.isWebGLCubeRenderTarget)for(let K=0;K<6;K++){if(Array.isArray(y.__webglFramebuffer[K]))for(let st=0;st<y.__webglFramebuffer[K].length;st++)i.deleteFramebuffer(y.__webglFramebuffer[K][st]);else i.deleteFramebuffer(y.__webglFramebuffer[K]);y.__webglDepthbuffer&&i.deleteRenderbuffer(y.__webglDepthbuffer[K])}else{if(Array.isArray(y.__webglFramebuffer))for(let K=0;K<y.__webglFramebuffer.length;K++)i.deleteFramebuffer(y.__webglFramebuffer[K]);else i.deleteFramebuffer(y.__webglFramebuffer);if(y.__webglDepthbuffer&&i.deleteRenderbuffer(y.__webglDepthbuffer),y.__webglMultisampledFramebuffer&&i.deleteFramebuffer(y.__webglMultisampledFramebuffer),y.__webglColorRenderbuffer)for(let K=0;K<y.__webglColorRenderbuffer.length;K++)y.__webglColorRenderbuffer[K]&&i.deleteRenderbuffer(y.__webglColorRenderbuffer[K]);y.__webglDepthRenderbuffer&&i.deleteRenderbuffer(y.__webglDepthRenderbuffer)}const W=R.textures;for(let K=0,st=W.length;K<st;K++){const it=n.get(W[K]);it.__webglTexture&&(i.deleteTexture(it.__webglTexture),o.memory.textures--),n.remove(W[K])}n.remove(R)}let N=0;function B(){N=0}function k(){const R=N;return R>=s.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+R+" texture units while this GPU supports only "+s.maxTextures),N+=1,R}function F(R){const y=[];return y.push(R.wrapS),y.push(R.wrapT),y.push(R.wrapR||0),y.push(R.magFilter),y.push(R.minFilter),y.push(R.anisotropy),y.push(R.internalFormat),y.push(R.format),y.push(R.type),y.push(R.generateMipmaps),y.push(R.premultiplyAlpha),y.push(R.flipY),y.push(R.unpackAlignment),y.push(R.colorSpace),y.join()}function G(R,y){const W=n.get(R);if(R.isVideoTexture&&X(R),R.isRenderTargetTexture===!1&&R.isExternalTexture!==!0&&R.version>0&&W.__version!==R.version){const K=R.image;if(K===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(K.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{ct(W,R,y);return}}else R.isExternalTexture&&(W.__webglTexture=R.sourceTexture?R.sourceTexture:null);e.bindTexture(i.TEXTURE_2D,W.__webglTexture,i.TEXTURE0+y)}function H(R,y){const W=n.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&W.__version!==R.version){ct(W,R,y);return}e.bindTexture(i.TEXTURE_2D_ARRAY,W.__webglTexture,i.TEXTURE0+y)}function $(R,y){const W=n.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&W.__version!==R.version){ct(W,R,y);return}e.bindTexture(i.TEXTURE_3D,W.__webglTexture,i.TEXTURE0+y)}function J(R,y){const W=n.get(R);if(R.version>0&&W.__version!==R.version){ut(W,R,y);return}e.bindTexture(i.TEXTURE_CUBE_MAP,W.__webglTexture,i.TEXTURE0+y)}const lt={[ro]:i.REPEAT,[Jn]:i.CLAMP_TO_EDGE,[oo]:i.MIRRORED_REPEAT},pt={[sn]:i.NEAREST,[Yd]:i.NEAREST_MIPMAP_NEAREST,[ps]:i.NEAREST_MIPMAP_LINEAR,[dn]:i.LINEAR,[lr]:i.LINEAR_MIPMAP_NEAREST,[Qn]:i.LINEAR_MIPMAP_LINEAR},Et={[Jd]:i.NEVER,[su]:i.ALWAYS,[Qd]:i.LESS,[dc]:i.LEQUAL,[tu]:i.EQUAL,[iu]:i.GEQUAL,[eu]:i.GREATER,[nu]:i.NOTEQUAL};function ot(R,y){if(y.type===bn&&t.has("OES_texture_float_linear")===!1&&(y.magFilter===dn||y.magFilter===lr||y.magFilter===ps||y.magFilter===Qn||y.minFilter===dn||y.minFilter===lr||y.minFilter===ps||y.minFilter===Qn)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(R,i.TEXTURE_WRAP_S,lt[y.wrapS]),i.texParameteri(R,i.TEXTURE_WRAP_T,lt[y.wrapT]),(R===i.TEXTURE_3D||R===i.TEXTURE_2D_ARRAY)&&i.texParameteri(R,i.TEXTURE_WRAP_R,lt[y.wrapR]),i.texParameteri(R,i.TEXTURE_MAG_FILTER,pt[y.magFilter]),i.texParameteri(R,i.TEXTURE_MIN_FILTER,pt[y.minFilter]),y.compareFunction&&(i.texParameteri(R,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(R,i.TEXTURE_COMPARE_FUNC,Et[y.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(y.magFilter===sn||y.minFilter!==ps&&y.minFilter!==Qn||y.type===bn&&t.has("OES_texture_float_linear")===!1)return;if(y.anisotropy>1||n.get(y).__currentAnisotropy){const W=t.get("EXT_texture_filter_anisotropic");i.texParameterf(R,W.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(y.anisotropy,s.getMaxAnisotropy())),n.get(y).__currentAnisotropy=y.anisotropy}}}function ft(R,y){let W=!1;R.__webglInit===void 0&&(R.__webglInit=!0,y.addEventListener("dispose",E));const K=y.source;let st=g.get(K);st===void 0&&(st={},g.set(K,st));const it=F(y);if(it!==R.__cacheKey){st[it]===void 0&&(st[it]={texture:i.createTexture(),usedTimes:0},o.memory.textures++,W=!0),st[it].usedTimes++;const Tt=st[R.__cacheKey];Tt!==void 0&&(st[R.__cacheKey].usedTimes--,Tt.usedTimes===0&&_(y)),R.__cacheKey=it,R.__webglTexture=st[it].texture}return W}function Ut(R,y,W){return Math.floor(Math.floor(R/W)/y)}function Pt(R,y,W,K){const it=R.updateRanges;if(it.length===0)e.texSubImage2D(i.TEXTURE_2D,0,0,0,y.width,y.height,W,K,y.data);else{it.sort((gt,bt)=>gt.start-bt.start);let Tt=0;for(let gt=1;gt<it.length;gt++){const bt=it[Tt],Xt=it[gt],Bt=bt.start+bt.count,Rt=Ut(Xt.start,y.width,4),qt=Ut(bt.start,y.width,4);Xt.start<=Bt+1&&Rt===qt&&Ut(Xt.start+Xt.count-1,y.width,4)===Rt?bt.count=Math.max(bt.count,Xt.start+Xt.count-bt.start):(++Tt,it[Tt]=Xt)}it.length=Tt+1;const mt=i.getParameter(i.UNPACK_ROW_LENGTH),Dt=i.getParameter(i.UNPACK_SKIP_PIXELS),Lt=i.getParameter(i.UNPACK_SKIP_ROWS);i.pixelStorei(i.UNPACK_ROW_LENGTH,y.width);for(let gt=0,bt=it.length;gt<bt;gt++){const Xt=it[gt],Bt=Math.floor(Xt.start/4),Rt=Math.ceil(Xt.count/4),qt=Bt%y.width,Y=Math.floor(Bt/y.width),vt=Rt,yt=1;i.pixelStorei(i.UNPACK_SKIP_PIXELS,qt),i.pixelStorei(i.UNPACK_SKIP_ROWS,Y),e.texSubImage2D(i.TEXTURE_2D,0,qt,Y,vt,yt,W,K,y.data)}R.clearUpdateRanges(),i.pixelStorei(i.UNPACK_ROW_LENGTH,mt),i.pixelStorei(i.UNPACK_SKIP_PIXELS,Dt),i.pixelStorei(i.UNPACK_SKIP_ROWS,Lt)}}function ct(R,y,W){let K=i.TEXTURE_2D;(y.isDataArrayTexture||y.isCompressedArrayTexture)&&(K=i.TEXTURE_2D_ARRAY),y.isData3DTexture&&(K=i.TEXTURE_3D);const st=ft(R,y),it=y.source;e.bindTexture(K,R.__webglTexture,i.TEXTURE0+W);const Tt=n.get(it);if(it.version!==Tt.__version||st===!0){e.activeTexture(i.TEXTURE0+W);const mt=ne.getPrimaries(ne.workingColorSpace),Dt=y.colorSpace===In?null:ne.getPrimaries(y.colorSpace),Lt=y.colorSpace===In||mt===Dt?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,y.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,y.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,y.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Lt);let gt=x(y.image,!1,s.maxTextureSize);gt=q(y,gt);const bt=r.convert(y.format,y.colorSpace),Xt=r.convert(y.type);let Bt=P(y.internalFormat,bt,Xt,y.colorSpace,y.isVideoTexture);ot(K,y);let Rt;const qt=y.mipmaps,Y=y.isVideoTexture!==!0,vt=Tt.__version===void 0||st===!0,yt=it.dataReady,Nt=C(y,gt);if(y.isDepthTexture)Bt=v(y.format===rs,y.type),vt&&(Y?e.texStorage2D(i.TEXTURE_2D,1,Bt,gt.width,gt.height):e.texImage2D(i.TEXTURE_2D,0,Bt,gt.width,gt.height,0,bt,Xt,null));else if(y.isDataTexture)if(qt.length>0){Y&&vt&&e.texStorage2D(i.TEXTURE_2D,Nt,Bt,qt[0].width,qt[0].height);for(let _t=0,ht=qt.length;_t<ht;_t++)Rt=qt[_t],Y?yt&&e.texSubImage2D(i.TEXTURE_2D,_t,0,0,Rt.width,Rt.height,bt,Xt,Rt.data):e.texImage2D(i.TEXTURE_2D,_t,Bt,Rt.width,Rt.height,0,bt,Xt,Rt.data);y.generateMipmaps=!1}else Y?(vt&&e.texStorage2D(i.TEXTURE_2D,Nt,Bt,gt.width,gt.height),yt&&Pt(y,gt,bt,Xt)):e.texImage2D(i.TEXTURE_2D,0,Bt,gt.width,gt.height,0,bt,Xt,gt.data);else if(y.isCompressedTexture)if(y.isCompressedArrayTexture){Y&&vt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,Nt,Bt,qt[0].width,qt[0].height,gt.depth);for(let _t=0,ht=qt.length;_t<ht;_t++)if(Rt=qt[_t],y.format!==nn)if(bt!==null)if(Y){if(yt)if(y.layerUpdates.size>0){const zt=nl(Rt.width,Rt.height,y.format,y.type);for(const Yt of y.layerUpdates){const le=Rt.data.subarray(Yt*zt/Rt.data.BYTES_PER_ELEMENT,(Yt+1)*zt/Rt.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,_t,0,0,Yt,Rt.width,Rt.height,1,bt,le)}y.clearLayerUpdates()}else e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,_t,0,0,0,Rt.width,Rt.height,gt.depth,bt,Rt.data)}else e.compressedTexImage3D(i.TEXTURE_2D_ARRAY,_t,Bt,Rt.width,Rt.height,gt.depth,0,Rt.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Y?yt&&e.texSubImage3D(i.TEXTURE_2D_ARRAY,_t,0,0,0,Rt.width,Rt.height,gt.depth,bt,Xt,Rt.data):e.texImage3D(i.TEXTURE_2D_ARRAY,_t,Bt,Rt.width,Rt.height,gt.depth,0,bt,Xt,Rt.data)}else{Y&&vt&&e.texStorage2D(i.TEXTURE_2D,Nt,Bt,qt[0].width,qt[0].height);for(let _t=0,ht=qt.length;_t<ht;_t++)Rt=qt[_t],y.format!==nn?bt!==null?Y?yt&&e.compressedTexSubImage2D(i.TEXTURE_2D,_t,0,0,Rt.width,Rt.height,bt,Rt.data):e.compressedTexImage2D(i.TEXTURE_2D,_t,Bt,Rt.width,Rt.height,0,Rt.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Y?yt&&e.texSubImage2D(i.TEXTURE_2D,_t,0,0,Rt.width,Rt.height,bt,Xt,Rt.data):e.texImage2D(i.TEXTURE_2D,_t,Bt,Rt.width,Rt.height,0,bt,Xt,Rt.data)}else if(y.isDataArrayTexture)if(Y){if(vt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,Nt,Bt,gt.width,gt.height,gt.depth),yt)if(y.layerUpdates.size>0){const _t=nl(gt.width,gt.height,y.format,y.type);for(const ht of y.layerUpdates){const zt=gt.data.subarray(ht*_t/gt.data.BYTES_PER_ELEMENT,(ht+1)*_t/gt.data.BYTES_PER_ELEMENT);e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,ht,gt.width,gt.height,1,bt,Xt,zt)}y.clearLayerUpdates()}else e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,gt.width,gt.height,gt.depth,bt,Xt,gt.data)}else e.texImage3D(i.TEXTURE_2D_ARRAY,0,Bt,gt.width,gt.height,gt.depth,0,bt,Xt,gt.data);else if(y.isData3DTexture)Y?(vt&&e.texStorage3D(i.TEXTURE_3D,Nt,Bt,gt.width,gt.height,gt.depth),yt&&e.texSubImage3D(i.TEXTURE_3D,0,0,0,0,gt.width,gt.height,gt.depth,bt,Xt,gt.data)):e.texImage3D(i.TEXTURE_3D,0,Bt,gt.width,gt.height,gt.depth,0,bt,Xt,gt.data);else if(y.isFramebufferTexture){if(vt)if(Y)e.texStorage2D(i.TEXTURE_2D,Nt,Bt,gt.width,gt.height);else{let _t=gt.width,ht=gt.height;for(let zt=0;zt<Nt;zt++)e.texImage2D(i.TEXTURE_2D,zt,Bt,_t,ht,0,bt,Xt,null),_t>>=1,ht>>=1}}else if(qt.length>0){if(Y&&vt){const _t=nt(qt[0]);e.texStorage2D(i.TEXTURE_2D,Nt,Bt,_t.width,_t.height)}for(let _t=0,ht=qt.length;_t<ht;_t++)Rt=qt[_t],Y?yt&&e.texSubImage2D(i.TEXTURE_2D,_t,0,0,bt,Xt,Rt):e.texImage2D(i.TEXTURE_2D,_t,Bt,bt,Xt,Rt);y.generateMipmaps=!1}else if(Y){if(vt){const _t=nt(gt);e.texStorage2D(i.TEXTURE_2D,Nt,Bt,_t.width,_t.height)}yt&&e.texSubImage2D(i.TEXTURE_2D,0,0,0,bt,Xt,gt)}else e.texImage2D(i.TEXTURE_2D,0,Bt,bt,Xt,gt);f(y)&&d(K),Tt.__version=it.version,y.onUpdate&&y.onUpdate(y)}R.__version=y.version}function ut(R,y,W){if(y.image.length!==6)return;const K=ft(R,y),st=y.source;e.bindTexture(i.TEXTURE_CUBE_MAP,R.__webglTexture,i.TEXTURE0+W);const it=n.get(st);if(st.version!==it.__version||K===!0){e.activeTexture(i.TEXTURE0+W);const Tt=ne.getPrimaries(ne.workingColorSpace),mt=y.colorSpace===In?null:ne.getPrimaries(y.colorSpace),Dt=y.colorSpace===In||Tt===mt?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,y.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,y.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,y.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Dt);const Lt=y.isCompressedTexture||y.image[0].isCompressedTexture,gt=y.image[0]&&y.image[0].isDataTexture,bt=[];for(let ht=0;ht<6;ht++)!Lt&&!gt?bt[ht]=x(y.image[ht],!0,s.maxCubemapSize):bt[ht]=gt?y.image[ht].image:y.image[ht],bt[ht]=q(y,bt[ht]);const Xt=bt[0],Bt=r.convert(y.format,y.colorSpace),Rt=r.convert(y.type),qt=P(y.internalFormat,Bt,Rt,y.colorSpace),Y=y.isVideoTexture!==!0,vt=it.__version===void 0||K===!0,yt=st.dataReady;let Nt=C(y,Xt);ot(i.TEXTURE_CUBE_MAP,y);let _t;if(Lt){Y&&vt&&e.texStorage2D(i.TEXTURE_CUBE_MAP,Nt,qt,Xt.width,Xt.height);for(let ht=0;ht<6;ht++){_t=bt[ht].mipmaps;for(let zt=0;zt<_t.length;zt++){const Yt=_t[zt];y.format!==nn?Bt!==null?Y?yt&&e.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,zt,0,0,Yt.width,Yt.height,Bt,Yt.data):e.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,zt,qt,Yt.width,Yt.height,0,Yt.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):Y?yt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,zt,0,0,Yt.width,Yt.height,Bt,Rt,Yt.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,zt,qt,Yt.width,Yt.height,0,Bt,Rt,Yt.data)}}}else{if(_t=y.mipmaps,Y&&vt){_t.length>0&&Nt++;const ht=nt(bt[0]);e.texStorage2D(i.TEXTURE_CUBE_MAP,Nt,qt,ht.width,ht.height)}for(let ht=0;ht<6;ht++)if(gt){Y?yt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,0,0,0,bt[ht].width,bt[ht].height,Bt,Rt,bt[ht].data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,0,qt,bt[ht].width,bt[ht].height,0,Bt,Rt,bt[ht].data);for(let zt=0;zt<_t.length;zt++){const le=_t[zt].image[ht].image;Y?yt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,zt+1,0,0,le.width,le.height,Bt,Rt,le.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,zt+1,qt,le.width,le.height,0,Bt,Rt,le.data)}}else{Y?yt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,0,0,0,Bt,Rt,bt[ht]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,0,qt,Bt,Rt,bt[ht]);for(let zt=0;zt<_t.length;zt++){const Yt=_t[zt];Y?yt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,zt+1,0,0,Bt,Rt,Yt.image[ht]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ht,zt+1,qt,Bt,Rt,Yt.image[ht])}}}f(y)&&d(i.TEXTURE_CUBE_MAP),it.__version=st.version,y.onUpdate&&y.onUpdate(y)}R.__version=y.version}function St(R,y,W,K,st,it){const Tt=r.convert(W.format,W.colorSpace),mt=r.convert(W.type),Dt=P(W.internalFormat,Tt,mt,W.colorSpace),Lt=n.get(y),gt=n.get(W);if(gt.__renderTarget=y,!Lt.__hasExternalTextures){const bt=Math.max(1,y.width>>it),Xt=Math.max(1,y.height>>it);st===i.TEXTURE_3D||st===i.TEXTURE_2D_ARRAY?e.texImage3D(st,it,Dt,bt,Xt,y.depth,0,Tt,mt,null):e.texImage2D(st,it,Dt,bt,Xt,0,Tt,mt,null)}e.bindFramebuffer(i.FRAMEBUFFER,R),I(y)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,K,st,gt.__webglTexture,0,U(y)):(st===i.TEXTURE_2D||st>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&st<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,K,st,gt.__webglTexture,it),e.bindFramebuffer(i.FRAMEBUFFER,null)}function V(R,y,W){if(i.bindRenderbuffer(i.RENDERBUFFER,R),y.depthBuffer){const K=y.depthTexture,st=K&&K.isDepthTexture?K.type:null,it=v(y.stencilBuffer,st),Tt=y.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,mt=U(y);I(y)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,mt,it,y.width,y.height):W?i.renderbufferStorageMultisample(i.RENDERBUFFER,mt,it,y.width,y.height):i.renderbufferStorage(i.RENDERBUFFER,it,y.width,y.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,Tt,i.RENDERBUFFER,R)}else{const K=y.textures;for(let st=0;st<K.length;st++){const it=K[st],Tt=r.convert(it.format,it.colorSpace),mt=r.convert(it.type),Dt=P(it.internalFormat,Tt,mt,it.colorSpace),Lt=U(y);W&&I(y)===!1?i.renderbufferStorageMultisample(i.RENDERBUFFER,Lt,Dt,y.width,y.height):I(y)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,Lt,Dt,y.width,y.height):i.renderbufferStorage(i.RENDERBUFFER,Dt,y.width,y.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function j(R,y){if(y&&y.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(e.bindFramebuffer(i.FRAMEBUFFER,R),!(y.depthTexture&&y.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");const K=n.get(y.depthTexture);K.__renderTarget=y,(!K.__webglTexture||y.depthTexture.image.width!==y.width||y.depthTexture.image.height!==y.height)&&(y.depthTexture.image.width=y.width,y.depthTexture.image.height=y.height,y.depthTexture.needsUpdate=!0),G(y.depthTexture,0);const st=K.__webglTexture,it=U(y);if(y.depthTexture.format===ss)I(y)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,i.DEPTH_ATTACHMENT,i.TEXTURE_2D,st,0,it):i.framebufferTexture2D(i.FRAMEBUFFER,i.DEPTH_ATTACHMENT,i.TEXTURE_2D,st,0);else if(y.depthTexture.format===rs)I(y)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,i.DEPTH_STENCIL_ATTACHMENT,i.TEXTURE_2D,st,0,it):i.framebufferTexture2D(i.FRAMEBUFFER,i.DEPTH_STENCIL_ATTACHMENT,i.TEXTURE_2D,st,0);else throw new Error("Unknown depthTexture format")}function Q(R){const y=n.get(R),W=R.isWebGLCubeRenderTarget===!0;if(y.__boundDepthTexture!==R.depthTexture){const K=R.depthTexture;if(y.__depthDisposeCallback&&y.__depthDisposeCallback(),K){const st=()=>{delete y.__boundDepthTexture,delete y.__depthDisposeCallback,K.removeEventListener("dispose",st)};K.addEventListener("dispose",st),y.__depthDisposeCallback=st}y.__boundDepthTexture=K}if(R.depthTexture&&!y.__autoAllocateDepthBuffer){if(W)throw new Error("target.depthTexture not supported in Cube render targets");const K=R.texture.mipmaps;K&&K.length>0?j(y.__webglFramebuffer[0],R):j(y.__webglFramebuffer,R)}else if(W){y.__webglDepthbuffer=[];for(let K=0;K<6;K++)if(e.bindFramebuffer(i.FRAMEBUFFER,y.__webglFramebuffer[K]),y.__webglDepthbuffer[K]===void 0)y.__webglDepthbuffer[K]=i.createRenderbuffer(),V(y.__webglDepthbuffer[K],R,!1);else{const st=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,it=y.__webglDepthbuffer[K];i.bindRenderbuffer(i.RENDERBUFFER,it),i.framebufferRenderbuffer(i.FRAMEBUFFER,st,i.RENDERBUFFER,it)}}else{const K=R.texture.mipmaps;if(K&&K.length>0?e.bindFramebuffer(i.FRAMEBUFFER,y.__webglFramebuffer[0]):e.bindFramebuffer(i.FRAMEBUFFER,y.__webglFramebuffer),y.__webglDepthbuffer===void 0)y.__webglDepthbuffer=i.createRenderbuffer(),V(y.__webglDepthbuffer,R,!1);else{const st=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,it=y.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,it),i.framebufferRenderbuffer(i.FRAMEBUFFER,st,i.RENDERBUFFER,it)}}e.bindFramebuffer(i.FRAMEBUFFER,null)}function dt(R,y,W){const K=n.get(R);y!==void 0&&St(K.__webglFramebuffer,R,R.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),W!==void 0&&Q(R)}function M(R){const y=R.texture,W=n.get(R),K=n.get(y);R.addEventListener("dispose",T);const st=R.textures,it=R.isWebGLCubeRenderTarget===!0,Tt=st.length>1;if(Tt||(K.__webglTexture===void 0&&(K.__webglTexture=i.createTexture()),K.__version=y.version,o.memory.textures++),it){W.__webglFramebuffer=[];for(let mt=0;mt<6;mt++)if(y.mipmaps&&y.mipmaps.length>0){W.__webglFramebuffer[mt]=[];for(let Dt=0;Dt<y.mipmaps.length;Dt++)W.__webglFramebuffer[mt][Dt]=i.createFramebuffer()}else W.__webglFramebuffer[mt]=i.createFramebuffer()}else{if(y.mipmaps&&y.mipmaps.length>0){W.__webglFramebuffer=[];for(let mt=0;mt<y.mipmaps.length;mt++)W.__webglFramebuffer[mt]=i.createFramebuffer()}else W.__webglFramebuffer=i.createFramebuffer();if(Tt)for(let mt=0,Dt=st.length;mt<Dt;mt++){const Lt=n.get(st[mt]);Lt.__webglTexture===void 0&&(Lt.__webglTexture=i.createTexture(),o.memory.textures++)}if(R.samples>0&&I(R)===!1){W.__webglMultisampledFramebuffer=i.createFramebuffer(),W.__webglColorRenderbuffer=[],e.bindFramebuffer(i.FRAMEBUFFER,W.__webglMultisampledFramebuffer);for(let mt=0;mt<st.length;mt++){const Dt=st[mt];W.__webglColorRenderbuffer[mt]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,W.__webglColorRenderbuffer[mt]);const Lt=r.convert(Dt.format,Dt.colorSpace),gt=r.convert(Dt.type),bt=P(Dt.internalFormat,Lt,gt,Dt.colorSpace,R.isXRRenderTarget===!0),Xt=U(R);i.renderbufferStorageMultisample(i.RENDERBUFFER,Xt,bt,R.width,R.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+mt,i.RENDERBUFFER,W.__webglColorRenderbuffer[mt])}i.bindRenderbuffer(i.RENDERBUFFER,null),R.depthBuffer&&(W.__webglDepthRenderbuffer=i.createRenderbuffer(),V(W.__webglDepthRenderbuffer,R,!0)),e.bindFramebuffer(i.FRAMEBUFFER,null)}}if(it){e.bindTexture(i.TEXTURE_CUBE_MAP,K.__webglTexture),ot(i.TEXTURE_CUBE_MAP,y);for(let mt=0;mt<6;mt++)if(y.mipmaps&&y.mipmaps.length>0)for(let Dt=0;Dt<y.mipmaps.length;Dt++)St(W.__webglFramebuffer[mt][Dt],R,y,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+mt,Dt);else St(W.__webglFramebuffer[mt],R,y,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+mt,0);f(y)&&d(i.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(Tt){for(let mt=0,Dt=st.length;mt<Dt;mt++){const Lt=st[mt],gt=n.get(Lt);let bt=i.TEXTURE_2D;(R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(bt=R.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(bt,gt.__webglTexture),ot(bt,Lt),St(W.__webglFramebuffer,R,Lt,i.COLOR_ATTACHMENT0+mt,bt,0),f(Lt)&&d(bt)}e.unbindTexture()}else{let mt=i.TEXTURE_2D;if((R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(mt=R.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(mt,K.__webglTexture),ot(mt,y),y.mipmaps&&y.mipmaps.length>0)for(let Dt=0;Dt<y.mipmaps.length;Dt++)St(W.__webglFramebuffer[Dt],R,y,i.COLOR_ATTACHMENT0,mt,Dt);else St(W.__webglFramebuffer,R,y,i.COLOR_ATTACHMENT0,mt,0);f(y)&&d(mt),e.unbindTexture()}R.depthBuffer&&Q(R)}function z(R){const y=R.textures;for(let W=0,K=y.length;W<K;W++){const st=y[W];if(f(st)){const it=A(R),Tt=n.get(st).__webglTexture;e.bindTexture(it,Tt),d(it),e.unbindTexture()}}}const w=[],b=[];function O(R){if(R.samples>0){if(I(R)===!1){const y=R.textures,W=R.width,K=R.height;let st=i.COLOR_BUFFER_BIT;const it=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,Tt=n.get(R),mt=y.length>1;if(mt)for(let Lt=0;Lt<y.length;Lt++)e.bindFramebuffer(i.FRAMEBUFFER,Tt.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Lt,i.RENDERBUFFER,null),e.bindFramebuffer(i.FRAMEBUFFER,Tt.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+Lt,i.TEXTURE_2D,null,0);e.bindFramebuffer(i.READ_FRAMEBUFFER,Tt.__webglMultisampledFramebuffer);const Dt=R.texture.mipmaps;Dt&&Dt.length>0?e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Tt.__webglFramebuffer[0]):e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Tt.__webglFramebuffer);for(let Lt=0;Lt<y.length;Lt++){if(R.resolveDepthBuffer&&(R.depthBuffer&&(st|=i.DEPTH_BUFFER_BIT),R.stencilBuffer&&R.resolveStencilBuffer&&(st|=i.STENCIL_BUFFER_BIT)),mt){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,Tt.__webglColorRenderbuffer[Lt]);const gt=n.get(y[Lt]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,gt,0)}i.blitFramebuffer(0,0,W,K,0,0,W,K,st,i.NEAREST),l===!0&&(w.length=0,b.length=0,w.push(i.COLOR_ATTACHMENT0+Lt),R.depthBuffer&&R.resolveDepthBuffer===!1&&(w.push(it),b.push(it),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,b)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,w))}if(e.bindFramebuffer(i.READ_FRAMEBUFFER,null),e.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),mt)for(let Lt=0;Lt<y.length;Lt++){e.bindFramebuffer(i.FRAMEBUFFER,Tt.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Lt,i.RENDERBUFFER,Tt.__webglColorRenderbuffer[Lt]);const gt=n.get(y[Lt]).__webglTexture;e.bindFramebuffer(i.FRAMEBUFFER,Tt.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+Lt,i.TEXTURE_2D,gt,0)}e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Tt.__webglMultisampledFramebuffer)}else if(R.depthBuffer&&R.resolveDepthBuffer===!1&&l){const y=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[y])}}}function U(R){return Math.min(s.maxSamples,R.samples)}function I(R){const y=n.get(R);return R.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&y.__useRenderToTexture!==!1}function X(R){const y=o.render.frame;u.get(R)!==y&&(u.set(R,y),R.update())}function q(R,y){const W=R.colorSpace,K=R.format,st=R.type;return R.isCompressedTexture===!0||R.isVideoTexture===!0||W!==zi&&W!==In&&(ne.getTransfer(W)===re?(K!==nn||st!==fn)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",W)),y}function nt(R){return typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement?(c.width=R.naturalWidth||R.width,c.height=R.naturalHeight||R.height):typeof VideoFrame<"u"&&R instanceof VideoFrame?(c.width=R.displayWidth,c.height=R.displayHeight):(c.width=R.width,c.height=R.height),c}this.allocateTextureUnit=k,this.resetTextureUnits=B,this.setTexture2D=G,this.setTexture2DArray=H,this.setTexture3D=$,this.setTextureCube=J,this.rebindTextures=dt,this.setupRenderTarget=M,this.updateRenderTargetMipmap=z,this.updateMultisampleRenderTarget=O,this.setupDepthRenderbuffer=Q,this.setupFrameBufferTexture=St,this.useMultisampledRTT=I}function Sg(i,t){function e(n,s=In){let r;const o=ne.getTransfer(s);if(n===fn)return i.UNSIGNED_BYTE;if(n===$o)return i.UNSIGNED_SHORT_4_4_4_4;if(n===Yo)return i.UNSIGNED_SHORT_5_5_5_1;if(n===ic)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===sc)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===ec)return i.BYTE;if(n===nc)return i.SHORT;if(n===ns)return i.UNSIGNED_SHORT;if(n===jo)return i.INT;if(n===ei)return i.UNSIGNED_INT;if(n===bn)return i.FLOAT;if(n===as)return i.HALF_FLOAT;if(n===rc)return i.ALPHA;if(n===oc)return i.RGB;if(n===nn)return i.RGBA;if(n===ss)return i.DEPTH_COMPONENT;if(n===rs)return i.DEPTH_STENCIL;if(n===ac)return i.RED;if(n===qo)return i.RED_INTEGER;if(n===lc)return i.RG;if(n===Zo)return i.RG_INTEGER;if(n===Ko)return i.RGBA_INTEGER;if(n===ks||n===Hs||n===Gs||n===Vs)if(o===re)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===ks)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Hs)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Gs)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Vs)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===ks)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Hs)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Gs)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Vs)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===ao||n===lo||n===co||n===uo)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===ao)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===lo)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===co)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===uo)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===ho||n===fo||n===po)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===ho||n===fo)return o===re?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===po)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(n===mo||n===go||n===_o||n===xo||n===vo||n===Mo||n===yo||n===So||n===bo||n===Eo||n===To||n===wo||n===Ao||n===Ro)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===mo)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===go)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===_o)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===xo)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===vo)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Mo)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===yo)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===So)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===bo)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===Eo)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===To)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===wo)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===Ao)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===Ro)return o===re?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Co||n===Po||n===Lo)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===Co)return o===re?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Po)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===Lo)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Do||n===Io||n===Uo||n===No)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===Do)return r.COMPRESSED_RED_RGTC1_EXT;if(n===Io)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Uo)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===No)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===is?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:e}}const bg=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Eg=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class Tg{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e){if(this.texture===null){const n=new Sc(t.texture);(t.depthNear!==e.depthNear||t.depthFar!==e.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=n}}getMesh(t){if(this.texture!==null&&this.mesh===null){const e=t.cameras[0].viewport,n=new On({vertexShader:bg,fragmentShader:Eg,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new Le(new ki(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class wg extends ri{constructor(t,e){super();const n=this;let s=null,r=1,o=null,a="local-floor",l=1,c=null,u=null,h=null,g=null,p=null,m=null;const x=typeof XRWebGLBinding<"u",f=new Tg,d={},A=e.getContextAttributes();let P=null,v=null;const C=[],E=[],T=new $t;let L=null;const _=new Je;_.viewport=new pe;const S=new Je;S.viewport=new pe;const N=[_,S],B=new Wu;let k=null,F=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(ct){let ut=C[ct];return ut===void 0&&(ut=new Pr,C[ct]=ut),ut.getTargetRaySpace()},this.getControllerGrip=function(ct){let ut=C[ct];return ut===void 0&&(ut=new Pr,C[ct]=ut),ut.getGripSpace()},this.getHand=function(ct){let ut=C[ct];return ut===void 0&&(ut=new Pr,C[ct]=ut),ut.getHandSpace()};function G(ct){const ut=E.indexOf(ct.inputSource);if(ut===-1)return;const St=C[ut];St!==void 0&&(St.update(ct.inputSource,ct.frame,c||o),St.dispatchEvent({type:ct.type,data:ct.inputSource}))}function H(){s.removeEventListener("select",G),s.removeEventListener("selectstart",G),s.removeEventListener("selectend",G),s.removeEventListener("squeeze",G),s.removeEventListener("squeezestart",G),s.removeEventListener("squeezeend",G),s.removeEventListener("end",H),s.removeEventListener("inputsourceschange",$);for(let ct=0;ct<C.length;ct++){const ut=E[ct];ut!==null&&(E[ct]=null,C[ct].disconnect(ut))}k=null,F=null,f.reset();for(const ct in d)delete d[ct];t.setRenderTarget(P),p=null,g=null,h=null,s=null,v=null,Pt.stop(),n.isPresenting=!1,t.setPixelRatio(L),t.setSize(T.width,T.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(ct){r=ct,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(ct){a=ct,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||o},this.setReferenceSpace=function(ct){c=ct},this.getBaseLayer=function(){return g!==null?g:p},this.getBinding=function(){return h===null&&x&&(h=new XRWebGLBinding(s,e)),h},this.getFrame=function(){return m},this.getSession=function(){return s},this.setSession=async function(ct){if(s=ct,s!==null){if(P=t.getRenderTarget(),s.addEventListener("select",G),s.addEventListener("selectstart",G),s.addEventListener("selectend",G),s.addEventListener("squeeze",G),s.addEventListener("squeezestart",G),s.addEventListener("squeezeend",G),s.addEventListener("end",H),s.addEventListener("inputsourceschange",$),A.xrCompatible!==!0&&await e.makeXRCompatible(),L=t.getPixelRatio(),t.getSize(T),x&&"createProjectionLayer"in XRWebGLBinding.prototype){let St=null,V=null,j=null;A.depth&&(j=A.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,St=A.stencil?rs:ss,V=A.stencil?is:ei);const Q={colorFormat:e.RGBA8,depthFormat:j,scaleFactor:r};h=this.getBinding(),g=h.createProjectionLayer(Q),s.updateRenderState({layers:[g]}),t.setPixelRatio(1),t.setSize(g.textureWidth,g.textureHeight,!1),v=new ii(g.textureWidth,g.textureHeight,{format:nn,type:fn,depthTexture:new yc(g.textureWidth,g.textureHeight,V,void 0,void 0,void 0,void 0,void 0,void 0,St),stencilBuffer:A.stencil,colorSpace:t.outputColorSpace,samples:A.antialias?4:0,resolveDepthBuffer:g.ignoreDepthValues===!1,resolveStencilBuffer:g.ignoreDepthValues===!1})}else{const St={antialias:A.antialias,alpha:!0,depth:A.depth,stencil:A.stencil,framebufferScaleFactor:r};p=new XRWebGLLayer(s,e,St),s.updateRenderState({baseLayer:p}),t.setPixelRatio(1),t.setSize(p.framebufferWidth,p.framebufferHeight,!1),v=new ii(p.framebufferWidth,p.framebufferHeight,{format:nn,type:fn,colorSpace:t.outputColorSpace,stencilBuffer:A.stencil,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1})}v.isXRRenderTarget=!0,this.setFoveation(l),c=null,o=await s.requestReferenceSpace(a),Pt.setContext(s),Pt.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return f.getDepthTexture()};function $(ct){for(let ut=0;ut<ct.removed.length;ut++){const St=ct.removed[ut],V=E.indexOf(St);V>=0&&(E[V]=null,C[V].disconnect(St))}for(let ut=0;ut<ct.added.length;ut++){const St=ct.added[ut];let V=E.indexOf(St);if(V===-1){for(let Q=0;Q<C.length;Q++)if(Q>=E.length){E.push(St),V=Q;break}else if(E[Q]===null){E[Q]=St,V=Q;break}if(V===-1)break}const j=C[V];j&&j.connect(St)}}const J=new Z,lt=new Z;function pt(ct,ut,St){J.setFromMatrixPosition(ut.matrixWorld),lt.setFromMatrixPosition(St.matrixWorld);const V=J.distanceTo(lt),j=ut.projectionMatrix.elements,Q=St.projectionMatrix.elements,dt=j[14]/(j[10]-1),M=j[14]/(j[10]+1),z=(j[9]+1)/j[5],w=(j[9]-1)/j[5],b=(j[8]-1)/j[0],O=(Q[8]+1)/Q[0],U=dt*b,I=dt*O,X=V/(-b+O),q=X*-b;if(ut.matrixWorld.decompose(ct.position,ct.quaternion,ct.scale),ct.translateX(q),ct.translateZ(X),ct.matrixWorld.compose(ct.position,ct.quaternion,ct.scale),ct.matrixWorldInverse.copy(ct.matrixWorld).invert(),j[10]===-1)ct.projectionMatrix.copy(ut.projectionMatrix),ct.projectionMatrixInverse.copy(ut.projectionMatrixInverse);else{const nt=dt+X,R=M+X,y=U-q,W=I+(V-q),K=z*M/R*nt,st=w*M/R*nt;ct.projectionMatrix.makePerspective(y,W,K,st,nt,R),ct.projectionMatrixInverse.copy(ct.projectionMatrix).invert()}}function Et(ct,ut){ut===null?ct.matrixWorld.copy(ct.matrix):ct.matrixWorld.multiplyMatrices(ut.matrixWorld,ct.matrix),ct.matrixWorldInverse.copy(ct.matrixWorld).invert()}this.updateCamera=function(ct){if(s===null)return;let ut=ct.near,St=ct.far;f.texture!==null&&(f.depthNear>0&&(ut=f.depthNear),f.depthFar>0&&(St=f.depthFar)),B.near=S.near=_.near=ut,B.far=S.far=_.far=St,(k!==B.near||F!==B.far)&&(s.updateRenderState({depthNear:B.near,depthFar:B.far}),k=B.near,F=B.far),B.layers.mask=ct.layers.mask|6,_.layers.mask=B.layers.mask&3,S.layers.mask=B.layers.mask&5;const V=ct.parent,j=B.cameras;Et(B,V);for(let Q=0;Q<j.length;Q++)Et(j[Q],V);j.length===2?pt(B,_,S):B.projectionMatrix.copy(_.projectionMatrix),ot(ct,B,V)};function ot(ct,ut,St){St===null?ct.matrix.copy(ut.matrixWorld):(ct.matrix.copy(St.matrixWorld),ct.matrix.invert(),ct.matrix.multiply(ut.matrixWorld)),ct.matrix.decompose(ct.position,ct.quaternion,ct.scale),ct.updateMatrixWorld(!0),ct.projectionMatrix.copy(ut.projectionMatrix),ct.projectionMatrixInverse.copy(ut.projectionMatrixInverse),ct.isPerspectiveCamera&&(ct.fov=Fo*2*Math.atan(1/ct.projectionMatrix.elements[5]),ct.zoom=1)}this.getCamera=function(){return B},this.getFoveation=function(){if(!(g===null&&p===null))return l},this.setFoveation=function(ct){l=ct,g!==null&&(g.fixedFoveation=ct),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=ct)},this.hasDepthSensing=function(){return f.texture!==null},this.getDepthSensingMesh=function(){return f.getMesh(B)},this.getCameraTexture=function(ct){return d[ct]};let ft=null;function Ut(ct,ut){if(u=ut.getViewerPose(c||o),m=ut,u!==null){const St=u.views;p!==null&&(t.setRenderTargetFramebuffer(v,p.framebuffer),t.setRenderTarget(v));let V=!1;St.length!==B.cameras.length&&(B.cameras.length=0,V=!0);for(let M=0;M<St.length;M++){const z=St[M];let w=null;if(p!==null)w=p.getViewport(z);else{const O=h.getViewSubImage(g,z);w=O.viewport,M===0&&(t.setRenderTargetTextures(v,O.colorTexture,O.depthStencilTexture),t.setRenderTarget(v))}let b=N[M];b===void 0&&(b=new Je,b.layers.enable(M),b.viewport=new pe,N[M]=b),b.matrix.fromArray(z.transform.matrix),b.matrix.decompose(b.position,b.quaternion,b.scale),b.projectionMatrix.fromArray(z.projectionMatrix),b.projectionMatrixInverse.copy(b.projectionMatrix).invert(),b.viewport.set(w.x,w.y,w.width,w.height),M===0&&(B.matrix.copy(b.matrix),B.matrix.decompose(B.position,B.quaternion,B.scale)),V===!0&&B.cameras.push(b)}const j=s.enabledFeatures;if(j&&j.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&x){h=n.getBinding();const M=h.getDepthInformation(St[0]);M&&M.isValid&&M.texture&&f.init(M,s.renderState)}if(j&&j.includes("camera-access")&&x){t.state.unbindTexture(),h=n.getBinding();for(let M=0;M<St.length;M++){const z=St[M].camera;if(z){let w=d[z];w||(w=new Sc,d[z]=w);const b=h.getCameraImage(z);w.sourceTexture=b}}}}for(let St=0;St<C.length;St++){const V=E[St],j=C[St];V!==null&&j!==void 0&&j.update(V,ut,c||o)}ft&&ft(ct,ut),ut.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:ut}),m=null}const Pt=new Tc;Pt.setAnimationLoop(Ut),this.setAnimationLoop=function(ct){ft=ct},this.dispose=function(){}}}const jn=new pn,Ag=new me;function Rg(i,t){function e(f,d){f.matrixAutoUpdate===!0&&f.updateMatrix(),d.value.copy(f.matrix)}function n(f,d){d.color.getRGB(f.fogColor.value,_c(i)),d.isFog?(f.fogNear.value=d.near,f.fogFar.value=d.far):d.isFogExp2&&(f.fogDensity.value=d.density)}function s(f,d,A,P,v){d.isMeshBasicMaterial||d.isMeshLambertMaterial?r(f,d):d.isMeshToonMaterial?(r(f,d),h(f,d)):d.isMeshPhongMaterial?(r(f,d),u(f,d)):d.isMeshStandardMaterial?(r(f,d),g(f,d),d.isMeshPhysicalMaterial&&p(f,d,v)):d.isMeshMatcapMaterial?(r(f,d),m(f,d)):d.isMeshDepthMaterial?r(f,d):d.isMeshDistanceMaterial?(r(f,d),x(f,d)):d.isMeshNormalMaterial?r(f,d):d.isLineBasicMaterial?(o(f,d),d.isLineDashedMaterial&&a(f,d)):d.isPointsMaterial?l(f,d,A,P):d.isSpriteMaterial?c(f,d):d.isShadowMaterial?(f.color.value.copy(d.color),f.opacity.value=d.opacity):d.isShaderMaterial&&(d.uniformsNeedUpdate=!1)}function r(f,d){f.opacity.value=d.opacity,d.color&&f.diffuse.value.copy(d.color),d.emissive&&f.emissive.value.copy(d.emissive).multiplyScalar(d.emissiveIntensity),d.map&&(f.map.value=d.map,e(d.map,f.mapTransform)),d.alphaMap&&(f.alphaMap.value=d.alphaMap,e(d.alphaMap,f.alphaMapTransform)),d.bumpMap&&(f.bumpMap.value=d.bumpMap,e(d.bumpMap,f.bumpMapTransform),f.bumpScale.value=d.bumpScale,d.side===Fe&&(f.bumpScale.value*=-1)),d.normalMap&&(f.normalMap.value=d.normalMap,e(d.normalMap,f.normalMapTransform),f.normalScale.value.copy(d.normalScale),d.side===Fe&&f.normalScale.value.negate()),d.displacementMap&&(f.displacementMap.value=d.displacementMap,e(d.displacementMap,f.displacementMapTransform),f.displacementScale.value=d.displacementScale,f.displacementBias.value=d.displacementBias),d.emissiveMap&&(f.emissiveMap.value=d.emissiveMap,e(d.emissiveMap,f.emissiveMapTransform)),d.specularMap&&(f.specularMap.value=d.specularMap,e(d.specularMap,f.specularMapTransform)),d.alphaTest>0&&(f.alphaTest.value=d.alphaTest);const A=t.get(d),P=A.envMap,v=A.envMapRotation;P&&(f.envMap.value=P,jn.copy(v),jn.x*=-1,jn.y*=-1,jn.z*=-1,P.isCubeTexture&&P.isRenderTargetTexture===!1&&(jn.y*=-1,jn.z*=-1),f.envMapRotation.value.setFromMatrix4(Ag.makeRotationFromEuler(jn)),f.flipEnvMap.value=P.isCubeTexture&&P.isRenderTargetTexture===!1?-1:1,f.reflectivity.value=d.reflectivity,f.ior.value=d.ior,f.refractionRatio.value=d.refractionRatio),d.lightMap&&(f.lightMap.value=d.lightMap,f.lightMapIntensity.value=d.lightMapIntensity,e(d.lightMap,f.lightMapTransform)),d.aoMap&&(f.aoMap.value=d.aoMap,f.aoMapIntensity.value=d.aoMapIntensity,e(d.aoMap,f.aoMapTransform))}function o(f,d){f.diffuse.value.copy(d.color),f.opacity.value=d.opacity,d.map&&(f.map.value=d.map,e(d.map,f.mapTransform))}function a(f,d){f.dashSize.value=d.dashSize,f.totalSize.value=d.dashSize+d.gapSize,f.scale.value=d.scale}function l(f,d,A,P){f.diffuse.value.copy(d.color),f.opacity.value=d.opacity,f.size.value=d.size*A,f.scale.value=P*.5,d.map&&(f.map.value=d.map,e(d.map,f.uvTransform)),d.alphaMap&&(f.alphaMap.value=d.alphaMap,e(d.alphaMap,f.alphaMapTransform)),d.alphaTest>0&&(f.alphaTest.value=d.alphaTest)}function c(f,d){f.diffuse.value.copy(d.color),f.opacity.value=d.opacity,f.rotation.value=d.rotation,d.map&&(f.map.value=d.map,e(d.map,f.mapTransform)),d.alphaMap&&(f.alphaMap.value=d.alphaMap,e(d.alphaMap,f.alphaMapTransform)),d.alphaTest>0&&(f.alphaTest.value=d.alphaTest)}function u(f,d){f.specular.value.copy(d.specular),f.shininess.value=Math.max(d.shininess,1e-4)}function h(f,d){d.gradientMap&&(f.gradientMap.value=d.gradientMap)}function g(f,d){f.metalness.value=d.metalness,d.metalnessMap&&(f.metalnessMap.value=d.metalnessMap,e(d.metalnessMap,f.metalnessMapTransform)),f.roughness.value=d.roughness,d.roughnessMap&&(f.roughnessMap.value=d.roughnessMap,e(d.roughnessMap,f.roughnessMapTransform)),d.envMap&&(f.envMapIntensity.value=d.envMapIntensity)}function p(f,d,A){f.ior.value=d.ior,d.sheen>0&&(f.sheenColor.value.copy(d.sheenColor).multiplyScalar(d.sheen),f.sheenRoughness.value=d.sheenRoughness,d.sheenColorMap&&(f.sheenColorMap.value=d.sheenColorMap,e(d.sheenColorMap,f.sheenColorMapTransform)),d.sheenRoughnessMap&&(f.sheenRoughnessMap.value=d.sheenRoughnessMap,e(d.sheenRoughnessMap,f.sheenRoughnessMapTransform))),d.clearcoat>0&&(f.clearcoat.value=d.clearcoat,f.clearcoatRoughness.value=d.clearcoatRoughness,d.clearcoatMap&&(f.clearcoatMap.value=d.clearcoatMap,e(d.clearcoatMap,f.clearcoatMapTransform)),d.clearcoatRoughnessMap&&(f.clearcoatRoughnessMap.value=d.clearcoatRoughnessMap,e(d.clearcoatRoughnessMap,f.clearcoatRoughnessMapTransform)),d.clearcoatNormalMap&&(f.clearcoatNormalMap.value=d.clearcoatNormalMap,e(d.clearcoatNormalMap,f.clearcoatNormalMapTransform),f.clearcoatNormalScale.value.copy(d.clearcoatNormalScale),d.side===Fe&&f.clearcoatNormalScale.value.negate())),d.dispersion>0&&(f.dispersion.value=d.dispersion),d.iridescence>0&&(f.iridescence.value=d.iridescence,f.iridescenceIOR.value=d.iridescenceIOR,f.iridescenceThicknessMinimum.value=d.iridescenceThicknessRange[0],f.iridescenceThicknessMaximum.value=d.iridescenceThicknessRange[1],d.iridescenceMap&&(f.iridescenceMap.value=d.iridescenceMap,e(d.iridescenceMap,f.iridescenceMapTransform)),d.iridescenceThicknessMap&&(f.iridescenceThicknessMap.value=d.iridescenceThicknessMap,e(d.iridescenceThicknessMap,f.iridescenceThicknessMapTransform))),d.transmission>0&&(f.transmission.value=d.transmission,f.transmissionSamplerMap.value=A.texture,f.transmissionSamplerSize.value.set(A.width,A.height),d.transmissionMap&&(f.transmissionMap.value=d.transmissionMap,e(d.transmissionMap,f.transmissionMapTransform)),f.thickness.value=d.thickness,d.thicknessMap&&(f.thicknessMap.value=d.thicknessMap,e(d.thicknessMap,f.thicknessMapTransform)),f.attenuationDistance.value=d.attenuationDistance,f.attenuationColor.value.copy(d.attenuationColor)),d.anisotropy>0&&(f.anisotropyVector.value.set(d.anisotropy*Math.cos(d.anisotropyRotation),d.anisotropy*Math.sin(d.anisotropyRotation)),d.anisotropyMap&&(f.anisotropyMap.value=d.anisotropyMap,e(d.anisotropyMap,f.anisotropyMapTransform))),f.specularIntensity.value=d.specularIntensity,f.specularColor.value.copy(d.specularColor),d.specularColorMap&&(f.specularColorMap.value=d.specularColorMap,e(d.specularColorMap,f.specularColorMapTransform)),d.specularIntensityMap&&(f.specularIntensityMap.value=d.specularIntensityMap,e(d.specularIntensityMap,f.specularIntensityMapTransform))}function m(f,d){d.matcap&&(f.matcap.value=d.matcap)}function x(f,d){const A=t.get(d).light;f.referencePosition.value.setFromMatrixPosition(A.matrixWorld),f.nearDistance.value=A.shadow.camera.near,f.farDistance.value=A.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function Cg(i,t,e,n){let s={},r={},o=[];const a=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function l(A,P){const v=P.program;n.uniformBlockBinding(A,v)}function c(A,P){let v=s[A.id];v===void 0&&(m(A),v=u(A),s[A.id]=v,A.addEventListener("dispose",f));const C=P.program;n.updateUBOMapping(A,C);const E=t.render.frame;r[A.id]!==E&&(g(A),r[A.id]=E)}function u(A){const P=h();A.__bindingPointIndex=P;const v=i.createBuffer(),C=A.__size,E=A.usage;return i.bindBuffer(i.UNIFORM_BUFFER,v),i.bufferData(i.UNIFORM_BUFFER,C,E),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,P,v),v}function h(){for(let A=0;A<a;A++)if(o.indexOf(A)===-1)return o.push(A),A;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function g(A){const P=s[A.id],v=A.uniforms,C=A.__cache;i.bindBuffer(i.UNIFORM_BUFFER,P);for(let E=0,T=v.length;E<T;E++){const L=Array.isArray(v[E])?v[E]:[v[E]];for(let _=0,S=L.length;_<S;_++){const N=L[_];if(p(N,E,_,C)===!0){const B=N.__offset,k=Array.isArray(N.value)?N.value:[N.value];let F=0;for(let G=0;G<k.length;G++){const H=k[G],$=x(H);typeof H=="number"||typeof H=="boolean"?(N.__data[0]=H,i.bufferSubData(i.UNIFORM_BUFFER,B+F,N.__data)):H.isMatrix3?(N.__data[0]=H.elements[0],N.__data[1]=H.elements[1],N.__data[2]=H.elements[2],N.__data[3]=0,N.__data[4]=H.elements[3],N.__data[5]=H.elements[4],N.__data[6]=H.elements[5],N.__data[7]=0,N.__data[8]=H.elements[6],N.__data[9]=H.elements[7],N.__data[10]=H.elements[8],N.__data[11]=0):(H.toArray(N.__data,F),F+=$.storage/Float32Array.BYTES_PER_ELEMENT)}i.bufferSubData(i.UNIFORM_BUFFER,B,N.__data)}}}i.bindBuffer(i.UNIFORM_BUFFER,null)}function p(A,P,v,C){const E=A.value,T=P+"_"+v;if(C[T]===void 0)return typeof E=="number"||typeof E=="boolean"?C[T]=E:C[T]=E.clone(),!0;{const L=C[T];if(typeof E=="number"||typeof E=="boolean"){if(L!==E)return C[T]=E,!0}else if(L.equals(E)===!1)return L.copy(E),!0}return!1}function m(A){const P=A.uniforms;let v=0;const C=16;for(let T=0,L=P.length;T<L;T++){const _=Array.isArray(P[T])?P[T]:[P[T]];for(let S=0,N=_.length;S<N;S++){const B=_[S],k=Array.isArray(B.value)?B.value:[B.value];for(let F=0,G=k.length;F<G;F++){const H=k[F],$=x(H),J=v%C,lt=J%$.boundary,pt=J+lt;v+=lt,pt!==0&&C-pt<$.storage&&(v+=C-pt),B.__data=new Float32Array($.storage/Float32Array.BYTES_PER_ELEMENT),B.__offset=v,v+=$.storage}}}const E=v%C;return E>0&&(v+=C-E),A.__size=v,A.__cache={},this}function x(A){const P={boundary:0,storage:0};return typeof A=="number"||typeof A=="boolean"?(P.boundary=4,P.storage=4):A.isVector2?(P.boundary=8,P.storage=8):A.isVector3||A.isColor?(P.boundary=16,P.storage=12):A.isVector4?(P.boundary=16,P.storage=16):A.isMatrix3?(P.boundary=48,P.storage=48):A.isMatrix4?(P.boundary=64,P.storage=64):A.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",A),P}function f(A){const P=A.target;P.removeEventListener("dispose",f);const v=o.indexOf(P.__bindingPointIndex);o.splice(v,1),i.deleteBuffer(s[P.id]),delete s[P.id],delete r[P.id]}function d(){for(const A in s)i.deleteBuffer(s[A]);o=[],s={},r={}}return{bind:l,update:c,dispose:d}}class Pg{constructor(t={}){const{canvas:e=au(),context:n=null,depth:s=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:u="default",failIfMajorPerformanceCaveat:h=!1,reversedDepthBuffer:g=!1}=t;this.isWebGLRenderer=!0;let p;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");p=n.getContextAttributes().alpha}else p=o;const m=new Uint32Array(4),x=new Int32Array(4);let f=null,d=null;const A=[],P=[];this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Nn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const v=this;let C=!1;this._outputColorSpace=Ke;let E=0,T=0,L=null,_=-1,S=null;const N=new pe,B=new pe;let k=null;const F=new Jt(0);let G=0,H=e.width,$=e.height,J=1,lt=null,pt=null;const Et=new pe(0,0,H,$),ot=new pe(0,0,H,$);let ft=!1;const Ut=new na;let Pt=!1,ct=!1;const ut=new me,St=new Z,V=new pe,j={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let Q=!1;function dt(){return L===null?J:1}let M=n;function z(D,tt){return e.getContext(D,tt)}try{const D={alpha:!0,depth:s,stencil:r,antialias:a,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:u,failIfMajorPerformanceCaveat:h};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${Xo}`),e.addEventListener("webglcontextlost",yt,!1),e.addEventListener("webglcontextrestored",Nt,!1),e.addEventListener("webglcontextcreationerror",_t,!1),M===null){const tt="webgl2";if(M=z(tt,D),M===null)throw z(tt)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(D){throw console.error("THREE.WebGLRenderer: "+D.message),D}let w,b,O,U,I,X,q,nt,R,y,W,K,st,it,Tt,mt,Dt,Lt,gt,bt,Xt,Bt,Rt,qt;function Y(){w=new kp(M),w.init(),Bt=new Sg(M,w),b=new Ip(M,w,t,Bt),O=new Mg(M,w),b.reversedDepthBuffer&&g&&O.buffers.depth.setReversed(!0),U=new Vp(M),I=new ag,X=new yg(M,w,O,I,b,Bt,U),q=new Np(v),nt=new Bp(v),R=new Yu(M),Rt=new Lp(M,R),y=new Hp(M,R,U,Rt),W=new Xp(M,y,R,U),gt=new Wp(M,b,X),mt=new Up(I),K=new og(v,q,nt,w,b,Rt,mt),st=new Rg(v,I),it=new cg,Tt=new mg(w),Lt=new Pp(v,q,nt,O,W,p,l),Dt=new xg(v,W,b),qt=new Cg(M,U,b,O),bt=new Dp(M,w,U),Xt=new Gp(M,w,U),U.programs=K.programs,v.capabilities=b,v.extensions=w,v.properties=I,v.renderLists=it,v.shadowMap=Dt,v.state=O,v.info=U}Y();const vt=new wg(v,M);this.xr=vt,this.getContext=function(){return M},this.getContextAttributes=function(){return M.getContextAttributes()},this.forceContextLoss=function(){const D=w.get("WEBGL_lose_context");D&&D.loseContext()},this.forceContextRestore=function(){const D=w.get("WEBGL_lose_context");D&&D.restoreContext()},this.getPixelRatio=function(){return J},this.setPixelRatio=function(D){D!==void 0&&(J=D,this.setSize(H,$,!1))},this.getSize=function(D){return D.set(H,$)},this.setSize=function(D,tt,rt=!0){if(vt.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}H=D,$=tt,e.width=Math.floor(D*J),e.height=Math.floor(tt*J),rt===!0&&(e.style.width=D+"px",e.style.height=tt+"px"),this.setViewport(0,0,D,tt)},this.getDrawingBufferSize=function(D){return D.set(H*J,$*J).floor()},this.setDrawingBufferSize=function(D,tt,rt){H=D,$=tt,J=rt,e.width=Math.floor(D*rt),e.height=Math.floor(tt*rt),this.setViewport(0,0,D,tt)},this.getCurrentViewport=function(D){return D.copy(N)},this.getViewport=function(D){return D.copy(Et)},this.setViewport=function(D,tt,rt,at){D.isVector4?Et.set(D.x,D.y,D.z,D.w):Et.set(D,tt,rt,at),O.viewport(N.copy(Et).multiplyScalar(J).round())},this.getScissor=function(D){return D.copy(ot)},this.setScissor=function(D,tt,rt,at){D.isVector4?ot.set(D.x,D.y,D.z,D.w):ot.set(D,tt,rt,at),O.scissor(B.copy(ot).multiplyScalar(J).round())},this.getScissorTest=function(){return ft},this.setScissorTest=function(D){O.setScissorTest(ft=D)},this.setOpaqueSort=function(D){lt=D},this.setTransparentSort=function(D){pt=D},this.getClearColor=function(D){return D.copy(Lt.getClearColor())},this.setClearColor=function(){Lt.setClearColor(...arguments)},this.getClearAlpha=function(){return Lt.getClearAlpha()},this.setClearAlpha=function(){Lt.setClearAlpha(...arguments)},this.clear=function(D=!0,tt=!0,rt=!0){let at=0;if(D){let et=!1;if(L!==null){const xt=L.texture.format;et=xt===Ko||xt===Zo||xt===qo}if(et){const xt=L.texture.type,Ct=xt===fn||xt===ei||xt===ns||xt===is||xt===$o||xt===Yo,Ft=Lt.getClearColor(),It=Lt.getClearAlpha(),Wt=Ft.r,jt=Ft.g,kt=Ft.b;Ct?(m[0]=Wt,m[1]=jt,m[2]=kt,m[3]=It,M.clearBufferuiv(M.COLOR,0,m)):(x[0]=Wt,x[1]=jt,x[2]=kt,x[3]=It,M.clearBufferiv(M.COLOR,0,x))}else at|=M.COLOR_BUFFER_BIT}tt&&(at|=M.DEPTH_BUFFER_BIT),rt&&(at|=M.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),M.clear(at)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){e.removeEventListener("webglcontextlost",yt,!1),e.removeEventListener("webglcontextrestored",Nt,!1),e.removeEventListener("webglcontextcreationerror",_t,!1),Lt.dispose(),it.dispose(),Tt.dispose(),I.dispose(),q.dispose(),nt.dispose(),W.dispose(),Rt.dispose(),qt.dispose(),K.dispose(),vt.dispose(),vt.removeEventListener("sessionstart",rn),vt.removeEventListener("sessionend",ca),zn.stop()};function yt(D){D.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),C=!0}function Nt(){console.log("THREE.WebGLRenderer: Context Restored."),C=!1;const D=U.autoReset,tt=Dt.enabled,rt=Dt.autoUpdate,at=Dt.needsUpdate,et=Dt.type;Y(),U.autoReset=D,Dt.enabled=tt,Dt.autoUpdate=rt,Dt.needsUpdate=at,Dt.type=et}function _t(D){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",D.statusMessage)}function ht(D){const tt=D.target;tt.removeEventListener("dispose",ht),zt(tt)}function zt(D){Yt(D),I.remove(D)}function Yt(D){const tt=I.get(D).programs;tt!==void 0&&(tt.forEach(function(rt){K.releaseProgram(rt)}),D.isShaderMaterial&&K.releaseShaderCache(D))}this.renderBufferDirect=function(D,tt,rt,at,et,xt){tt===null&&(tt=j);const Ct=et.isMesh&&et.matrixWorld.determinant()<0,Ft=Fc(D,tt,rt,at,et);O.setMaterial(at,Ct);let It=rt.index,Wt=1;if(at.wireframe===!0){if(It=y.getWireframeAttribute(rt),It===void 0)return;Wt=2}const jt=rt.drawRange,kt=rt.attributes.position;let te=jt.start*Wt,se=(jt.start+jt.count)*Wt;xt!==null&&(te=Math.max(te,xt.start*Wt),se=Math.min(se,(xt.start+xt.count)*Wt)),It!==null?(te=Math.max(te,0),se=Math.min(se,It.count)):kt!=null&&(te=Math.max(te,0),se=Math.min(se,kt.count));const fe=se-te;if(fe<0||fe===1/0)return;Rt.setup(et,at,Ft,rt,It);let ce,ae=bt;if(It!==null&&(ce=R.get(It),ae=Xt,ae.setIndex(ce)),et.isMesh)at.wireframe===!0?(O.setLineWidth(at.wireframeLinewidth*dt()),ae.setMode(M.LINES)):ae.setMode(M.TRIANGLES);else if(et.isLine){let Gt=at.linewidth;Gt===void 0&&(Gt=1),O.setLineWidth(Gt*dt()),et.isLineSegments?ae.setMode(M.LINES):et.isLineLoop?ae.setMode(M.LINE_LOOP):ae.setMode(M.LINE_STRIP)}else et.isPoints?ae.setMode(M.POINTS):et.isSprite&&ae.setMode(M.TRIANGLES);if(et.isBatchedMesh)if(et._multiDrawInstances!==null)os("THREE.WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),ae.renderMultiDrawInstances(et._multiDrawStarts,et._multiDrawCounts,et._multiDrawCount,et._multiDrawInstances);else if(w.get("WEBGL_multi_draw"))ae.renderMultiDraw(et._multiDrawStarts,et._multiDrawCounts,et._multiDrawCount);else{const Gt=et._multiDrawStarts,ue=et._multiDrawCounts,ee=et._multiDrawCount,ze=It?R.get(It).bytesPerElement:1,oi=I.get(at).currentProgram.getUniforms();for(let Be=0;Be<ee;Be++)oi.setValue(M,"_gl_DrawID",Be),ae.render(Gt[Be]/ze,ue[Be])}else if(et.isInstancedMesh)ae.renderInstances(te,fe,et.count);else if(rt.isInstancedBufferGeometry){const Gt=rt._maxInstanceCount!==void 0?rt._maxInstanceCount:1/0,ue=Math.min(rt.instanceCount,Gt);ae.renderInstances(te,fe,ue)}else ae.render(te,fe)};function le(D,tt,rt){D.transparent===!0&&D.side===ln&&D.forceSinglePass===!1?(D.side=Fe,D.needsUpdate=!0,us(D,tt,rt),D.side=Fn,D.needsUpdate=!0,us(D,tt,rt),D.side=ln):us(D,tt,rt)}this.compile=function(D,tt,rt=null){rt===null&&(rt=D),d=Tt.get(rt),d.init(tt),P.push(d),rt.traverseVisible(function(et){et.isLight&&et.layers.test(tt.layers)&&(d.pushLight(et),et.castShadow&&d.pushShadow(et))}),D!==rt&&D.traverseVisible(function(et){et.isLight&&et.layers.test(tt.layers)&&(d.pushLight(et),et.castShadow&&d.pushShadow(et))}),d.setupLights();const at=new Set;return D.traverse(function(et){if(!(et.isMesh||et.isPoints||et.isLine||et.isSprite))return;const xt=et.material;if(xt)if(Array.isArray(xt))for(let Ct=0;Ct<xt.length;Ct++){const Ft=xt[Ct];le(Ft,rt,et),at.add(Ft)}else le(xt,rt,et),at.add(xt)}),d=P.pop(),at},this.compileAsync=function(D,tt,rt=null){const at=this.compile(D,tt,rt);return new Promise(et=>{function xt(){if(at.forEach(function(Ct){I.get(Ct).currentProgram.isReady()&&at.delete(Ct)}),at.size===0){et(D);return}setTimeout(xt,10)}w.get("KHR_parallel_shader_compile")!==null?xt():setTimeout(xt,10)})};let ie=null;function mn(D){ie&&ie(D)}function rn(){zn.stop()}function ca(){zn.start()}const zn=new Tc;zn.setAnimationLoop(mn),typeof self<"u"&&zn.setContext(self),this.setAnimationLoop=function(D){ie=D,vt.setAnimationLoop(D),D===null?zn.stop():zn.start()},vt.addEventListener("sessionstart",rn),vt.addEventListener("sessionend",ca),this.render=function(D,tt){if(tt!==void 0&&tt.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(C===!0)return;if(D.matrixWorldAutoUpdate===!0&&D.updateMatrixWorld(),tt.parent===null&&tt.matrixWorldAutoUpdate===!0&&tt.updateMatrixWorld(),vt.enabled===!0&&vt.isPresenting===!0&&(vt.cameraAutoUpdate===!0&&vt.updateCamera(tt),tt=vt.getCamera()),D.isScene===!0&&D.onBeforeRender(v,D,tt,L),d=Tt.get(D,P.length),d.init(tt),P.push(d),ut.multiplyMatrices(tt.projectionMatrix,tt.matrixWorldInverse),Ut.setFromProjectionMatrix(ut,un,tt.reversedDepth),ct=this.localClippingEnabled,Pt=mt.init(this.clippingPlanes,ct),f=it.get(D,A.length),f.init(),A.push(f),vt.enabled===!0&&vt.isPresenting===!0){const xt=v.xr.getDepthSensingMesh();xt!==null&&sr(xt,tt,-1/0,v.sortObjects)}sr(D,tt,0,v.sortObjects),f.finish(),v.sortObjects===!0&&f.sort(lt,pt),Q=vt.enabled===!1||vt.isPresenting===!1||vt.hasDepthSensing()===!1,Q&&Lt.addToRenderList(f,D),this.info.render.frame++,Pt===!0&&mt.beginShadows();const rt=d.state.shadowsArray;Dt.render(rt,D,tt),Pt===!0&&mt.endShadows(),this.info.autoReset===!0&&this.info.reset();const at=f.opaque,et=f.transmissive;if(d.setupLights(),tt.isArrayCamera){const xt=tt.cameras;if(et.length>0)for(let Ct=0,Ft=xt.length;Ct<Ft;Ct++){const It=xt[Ct];ua(at,et,D,It)}Q&&Lt.render(D);for(let Ct=0,Ft=xt.length;Ct<Ft;Ct++){const It=xt[Ct];da(f,D,It,It.viewport)}}else et.length>0&&ua(at,et,D,tt),Q&&Lt.render(D),da(f,D,tt);L!==null&&T===0&&(X.updateMultisampleRenderTarget(L),X.updateRenderTargetMipmap(L)),D.isScene===!0&&D.onAfterRender(v,D,tt),Rt.resetDefaultState(),_=-1,S=null,P.pop(),P.length>0?(d=P[P.length-1],Pt===!0&&mt.setGlobalState(v.clippingPlanes,d.state.camera)):d=null,A.pop(),A.length>0?f=A[A.length-1]:f=null};function sr(D,tt,rt,at){if(D.visible===!1)return;if(D.layers.test(tt.layers)){if(D.isGroup)rt=D.renderOrder;else if(D.isLOD)D.autoUpdate===!0&&D.update(tt);else if(D.isLight)d.pushLight(D),D.castShadow&&d.pushShadow(D);else if(D.isSprite){if(!D.frustumCulled||Ut.intersectsSprite(D)){at&&V.setFromMatrixPosition(D.matrixWorld).applyMatrix4(ut);const Ct=W.update(D),Ft=D.material;Ft.visible&&f.push(D,Ct,Ft,rt,V.z,null)}}else if((D.isMesh||D.isLine||D.isPoints)&&(!D.frustumCulled||Ut.intersectsObject(D))){const Ct=W.update(D),Ft=D.material;if(at&&(D.boundingSphere!==void 0?(D.boundingSphere===null&&D.computeBoundingSphere(),V.copy(D.boundingSphere.center)):(Ct.boundingSphere===null&&Ct.computeBoundingSphere(),V.copy(Ct.boundingSphere.center)),V.applyMatrix4(D.matrixWorld).applyMatrix4(ut)),Array.isArray(Ft)){const It=Ct.groups;for(let Wt=0,jt=It.length;Wt<jt;Wt++){const kt=It[Wt],te=Ft[kt.materialIndex];te&&te.visible&&f.push(D,Ct,te,rt,V.z,kt)}}else Ft.visible&&f.push(D,Ct,Ft,rt,V.z,null)}}const xt=D.children;for(let Ct=0,Ft=xt.length;Ct<Ft;Ct++)sr(xt[Ct],tt,rt,at)}function da(D,tt,rt,at){const et=D.opaque,xt=D.transmissive,Ct=D.transparent;d.setupLightsView(rt),Pt===!0&&mt.setGlobalState(v.clippingPlanes,rt),at&&O.viewport(N.copy(at)),et.length>0&&ds(et,tt,rt),xt.length>0&&ds(xt,tt,rt),Ct.length>0&&ds(Ct,tt,rt),O.buffers.depth.setTest(!0),O.buffers.depth.setMask(!0),O.buffers.color.setMask(!0),O.setPolygonOffset(!1)}function ua(D,tt,rt,at){if((rt.isScene===!0?rt.overrideMaterial:null)!==null)return;d.state.transmissionRenderTarget[at.id]===void 0&&(d.state.transmissionRenderTarget[at.id]=new ii(1,1,{generateMipmaps:!0,type:w.has("EXT_color_buffer_half_float")||w.has("EXT_color_buffer_float")?as:fn,minFilter:Qn,samples:4,stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:ne.workingColorSpace}));const xt=d.state.transmissionRenderTarget[at.id],Ct=at.viewport||N;xt.setSize(Ct.z*v.transmissionResolutionScale,Ct.w*v.transmissionResolutionScale);const Ft=v.getRenderTarget(),It=v.getActiveCubeFace(),Wt=v.getActiveMipmapLevel();v.setRenderTarget(xt),v.getClearColor(F),G=v.getClearAlpha(),G<1&&v.setClearColor(16777215,.5),v.clear(),Q&&Lt.render(rt);const jt=v.toneMapping;v.toneMapping=Nn;const kt=at.viewport;if(at.viewport!==void 0&&(at.viewport=void 0),d.setupLightsView(at),Pt===!0&&mt.setGlobalState(v.clippingPlanes,at),ds(D,rt,at),X.updateMultisampleRenderTarget(xt),X.updateRenderTargetMipmap(xt),w.has("WEBGL_multisampled_render_to_texture")===!1){let te=!1;for(let se=0,fe=tt.length;se<fe;se++){const ce=tt[se],ae=ce.object,Gt=ce.geometry,ue=ce.material,ee=ce.group;if(ue.side===ln&&ae.layers.test(at.layers)){const ze=ue.side;ue.side=Fe,ue.needsUpdate=!0,ha(ae,rt,at,Gt,ue,ee),ue.side=ze,ue.needsUpdate=!0,te=!0}}te===!0&&(X.updateMultisampleRenderTarget(xt),X.updateRenderTargetMipmap(xt))}v.setRenderTarget(Ft,It,Wt),v.setClearColor(F,G),kt!==void 0&&(at.viewport=kt),v.toneMapping=jt}function ds(D,tt,rt){const at=tt.isScene===!0?tt.overrideMaterial:null;for(let et=0,xt=D.length;et<xt;et++){const Ct=D[et],Ft=Ct.object,It=Ct.geometry,Wt=Ct.group;let jt=Ct.material;jt.allowOverride===!0&&at!==null&&(jt=at),Ft.layers.test(rt.layers)&&ha(Ft,tt,rt,It,jt,Wt)}}function ha(D,tt,rt,at,et,xt){D.onBeforeRender(v,tt,rt,at,et,xt),D.modelViewMatrix.multiplyMatrices(rt.matrixWorldInverse,D.matrixWorld),D.normalMatrix.getNormalMatrix(D.modelViewMatrix),et.onBeforeRender(v,tt,rt,at,D,xt),et.transparent===!0&&et.side===ln&&et.forceSinglePass===!1?(et.side=Fe,et.needsUpdate=!0,v.renderBufferDirect(rt,tt,at,et,D,xt),et.side=Fn,et.needsUpdate=!0,v.renderBufferDirect(rt,tt,at,et,D,xt),et.side=ln):v.renderBufferDirect(rt,tt,at,et,D,xt),D.onAfterRender(v,tt,rt,at,et,xt)}function us(D,tt,rt){tt.isScene!==!0&&(tt=j);const at=I.get(D),et=d.state.lights,xt=d.state.shadowsArray,Ct=et.state.version,Ft=K.getParameters(D,et.state,xt,tt,rt),It=K.getProgramCacheKey(Ft);let Wt=at.programs;at.environment=D.isMeshStandardMaterial?tt.environment:null,at.fog=tt.fog,at.envMap=(D.isMeshStandardMaterial?nt:q).get(D.envMap||at.environment),at.envMapRotation=at.environment!==null&&D.envMap===null?tt.environmentRotation:D.envMapRotation,Wt===void 0&&(D.addEventListener("dispose",ht),Wt=new Map,at.programs=Wt);let jt=Wt.get(It);if(jt!==void 0){if(at.currentProgram===jt&&at.lightsStateVersion===Ct)return pa(D,Ft),jt}else Ft.uniforms=K.getUniforms(D),D.onBeforeCompile(Ft,v),jt=K.acquireProgram(Ft,It),Wt.set(It,jt),at.uniforms=Ft.uniforms;const kt=at.uniforms;return(!D.isShaderMaterial&&!D.isRawShaderMaterial||D.clipping===!0)&&(kt.clippingPlanes=mt.uniform),pa(D,Ft),at.needsLights=zc(D),at.lightsStateVersion=Ct,at.needsLights&&(kt.ambientLightColor.value=et.state.ambient,kt.lightProbe.value=et.state.probe,kt.directionalLights.value=et.state.directional,kt.directionalLightShadows.value=et.state.directionalShadow,kt.spotLights.value=et.state.spot,kt.spotLightShadows.value=et.state.spotShadow,kt.rectAreaLights.value=et.state.rectArea,kt.ltc_1.value=et.state.rectAreaLTC1,kt.ltc_2.value=et.state.rectAreaLTC2,kt.pointLights.value=et.state.point,kt.pointLightShadows.value=et.state.pointShadow,kt.hemisphereLights.value=et.state.hemi,kt.directionalShadowMap.value=et.state.directionalShadowMap,kt.directionalShadowMatrix.value=et.state.directionalShadowMatrix,kt.spotShadowMap.value=et.state.spotShadowMap,kt.spotLightMatrix.value=et.state.spotLightMatrix,kt.spotLightMap.value=et.state.spotLightMap,kt.pointShadowMap.value=et.state.pointShadowMap,kt.pointShadowMatrix.value=et.state.pointShadowMatrix),at.currentProgram=jt,at.uniformsList=null,jt}function fa(D){if(D.uniformsList===null){const tt=D.currentProgram.getUniforms();D.uniformsList=Xs.seqWithValue(tt.seq,D.uniforms)}return D.uniformsList}function pa(D,tt){const rt=I.get(D);rt.outputColorSpace=tt.outputColorSpace,rt.batching=tt.batching,rt.batchingColor=tt.batchingColor,rt.instancing=tt.instancing,rt.instancingColor=tt.instancingColor,rt.instancingMorph=tt.instancingMorph,rt.skinning=tt.skinning,rt.morphTargets=tt.morphTargets,rt.morphNormals=tt.morphNormals,rt.morphColors=tt.morphColors,rt.morphTargetsCount=tt.morphTargetsCount,rt.numClippingPlanes=tt.numClippingPlanes,rt.numIntersection=tt.numClipIntersection,rt.vertexAlphas=tt.vertexAlphas,rt.vertexTangents=tt.vertexTangents,rt.toneMapping=tt.toneMapping}function Fc(D,tt,rt,at,et){tt.isScene!==!0&&(tt=j),X.resetTextureUnits();const xt=tt.fog,Ct=at.isMeshStandardMaterial?tt.environment:null,Ft=L===null?v.outputColorSpace:L.isXRRenderTarget===!0?L.texture.colorSpace:zi,It=(at.isMeshStandardMaterial?nt:q).get(at.envMap||Ct),Wt=at.vertexColors===!0&&!!rt.attributes.color&&rt.attributes.color.itemSize===4,jt=!!rt.attributes.tangent&&(!!at.normalMap||at.anisotropy>0),kt=!!rt.morphAttributes.position,te=!!rt.morphAttributes.normal,se=!!rt.morphAttributes.color;let fe=Nn;at.toneMapped&&(L===null||L.isXRRenderTarget===!0)&&(fe=v.toneMapping);const ce=rt.morphAttributes.position||rt.morphAttributes.normal||rt.morphAttributes.color,ae=ce!==void 0?ce.length:0,Gt=I.get(at),ue=d.state.lights;if(Pt===!0&&(ct===!0||D!==S)){const Re=D===S&&at.id===_;mt.setState(at,D,Re)}let ee=!1;at.version===Gt.__version?(Gt.needsLights&&Gt.lightsStateVersion!==ue.state.version||Gt.outputColorSpace!==Ft||et.isBatchedMesh&&Gt.batching===!1||!et.isBatchedMesh&&Gt.batching===!0||et.isBatchedMesh&&Gt.batchingColor===!0&&et.colorTexture===null||et.isBatchedMesh&&Gt.batchingColor===!1&&et.colorTexture!==null||et.isInstancedMesh&&Gt.instancing===!1||!et.isInstancedMesh&&Gt.instancing===!0||et.isSkinnedMesh&&Gt.skinning===!1||!et.isSkinnedMesh&&Gt.skinning===!0||et.isInstancedMesh&&Gt.instancingColor===!0&&et.instanceColor===null||et.isInstancedMesh&&Gt.instancingColor===!1&&et.instanceColor!==null||et.isInstancedMesh&&Gt.instancingMorph===!0&&et.morphTexture===null||et.isInstancedMesh&&Gt.instancingMorph===!1&&et.morphTexture!==null||Gt.envMap!==It||at.fog===!0&&Gt.fog!==xt||Gt.numClippingPlanes!==void 0&&(Gt.numClippingPlanes!==mt.numPlanes||Gt.numIntersection!==mt.numIntersection)||Gt.vertexAlphas!==Wt||Gt.vertexTangents!==jt||Gt.morphTargets!==kt||Gt.morphNormals!==te||Gt.morphColors!==se||Gt.toneMapping!==fe||Gt.morphTargetsCount!==ae)&&(ee=!0):(ee=!0,Gt.__version=at.version);let ze=Gt.currentProgram;ee===!0&&(ze=us(at,tt,et));let oi=!1,Be=!1,Wi=!1;const he=ze.getUniforms(),$e=Gt.uniforms;if(O.useProgram(ze.program)&&(oi=!0,Be=!0,Wi=!0),at.id!==_&&(_=at.id,Be=!0),oi||S!==D){O.buffers.depth.getReversed()&&D.reversedDepth!==!0&&(D._reversedDepth=!0,D.updateProjectionMatrix()),he.setValue(M,"projectionMatrix",D.projectionMatrix),he.setValue(M,"viewMatrix",D.matrixWorldInverse);const De=he.map.cameraPosition;De!==void 0&&De.setValue(M,St.setFromMatrixPosition(D.matrixWorld)),b.logarithmicDepthBuffer&&he.setValue(M,"logDepthBufFC",2/(Math.log(D.far+1)/Math.LN2)),(at.isMeshPhongMaterial||at.isMeshToonMaterial||at.isMeshLambertMaterial||at.isMeshBasicMaterial||at.isMeshStandardMaterial||at.isShaderMaterial)&&he.setValue(M,"isOrthographic",D.isOrthographicCamera===!0),S!==D&&(S=D,Be=!0,Wi=!0)}if(et.isSkinnedMesh){he.setOptional(M,et,"bindMatrix"),he.setOptional(M,et,"bindMatrixInverse");const Re=et.skeleton;Re&&(Re.boneTexture===null&&Re.computeBoneTexture(),he.setValue(M,"boneTexture",Re.boneTexture,X))}et.isBatchedMesh&&(he.setOptional(M,et,"batchingTexture"),he.setValue(M,"batchingTexture",et._matricesTexture,X),he.setOptional(M,et,"batchingIdTexture"),he.setValue(M,"batchingIdTexture",et._indirectTexture,X),he.setOptional(M,et,"batchingColorTexture"),et._colorsTexture!==null&&he.setValue(M,"batchingColorTexture",et._colorsTexture,X));const Ye=rt.morphAttributes;if((Ye.position!==void 0||Ye.normal!==void 0||Ye.color!==void 0)&&gt.update(et,rt,ze),(Be||Gt.receiveShadow!==et.receiveShadow)&&(Gt.receiveShadow=et.receiveShadow,he.setValue(M,"receiveShadow",et.receiveShadow)),at.isMeshGouraudMaterial&&at.envMap!==null&&($e.envMap.value=It,$e.flipEnvMap.value=It.isCubeTexture&&It.isRenderTargetTexture===!1?-1:1),at.isMeshStandardMaterial&&at.envMap===null&&tt.environment!==null&&($e.envMapIntensity.value=tt.environmentIntensity),Be&&(he.setValue(M,"toneMappingExposure",v.toneMappingExposure),Gt.needsLights&&Oc($e,Wi),xt&&at.fog===!0&&st.refreshFogUniforms($e,xt),st.refreshMaterialUniforms($e,at,J,$,d.state.transmissionRenderTarget[D.id]),Xs.upload(M,fa(Gt),$e,X)),at.isShaderMaterial&&at.uniformsNeedUpdate===!0&&(Xs.upload(M,fa(Gt),$e,X),at.uniformsNeedUpdate=!1),at.isSpriteMaterial&&he.setValue(M,"center",et.center),he.setValue(M,"modelViewMatrix",et.modelViewMatrix),he.setValue(M,"normalMatrix",et.normalMatrix),he.setValue(M,"modelMatrix",et.matrixWorld),at.isShaderMaterial||at.isRawShaderMaterial){const Re=at.uniformsGroups;for(let De=0,rr=Re.length;De<rr;De++){const Bn=Re[De];qt.update(Bn,ze),qt.bind(Bn,ze)}}return ze}function Oc(D,tt){D.ambientLightColor.needsUpdate=tt,D.lightProbe.needsUpdate=tt,D.directionalLights.needsUpdate=tt,D.directionalLightShadows.needsUpdate=tt,D.pointLights.needsUpdate=tt,D.pointLightShadows.needsUpdate=tt,D.spotLights.needsUpdate=tt,D.spotLightShadows.needsUpdate=tt,D.rectAreaLights.needsUpdate=tt,D.hemisphereLights.needsUpdate=tt}function zc(D){return D.isMeshLambertMaterial||D.isMeshToonMaterial||D.isMeshPhongMaterial||D.isMeshStandardMaterial||D.isShadowMaterial||D.isShaderMaterial&&D.lights===!0}this.getActiveCubeFace=function(){return E},this.getActiveMipmapLevel=function(){return T},this.getRenderTarget=function(){return L},this.setRenderTargetTextures=function(D,tt,rt){const at=I.get(D);at.__autoAllocateDepthBuffer=D.resolveDepthBuffer===!1,at.__autoAllocateDepthBuffer===!1&&(at.__useRenderToTexture=!1),I.get(D.texture).__webglTexture=tt,I.get(D.depthTexture).__webglTexture=at.__autoAllocateDepthBuffer?void 0:rt,at.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(D,tt){const rt=I.get(D);rt.__webglFramebuffer=tt,rt.__useDefaultFramebuffer=tt===void 0};const Bc=M.createFramebuffer();this.setRenderTarget=function(D,tt=0,rt=0){L=D,E=tt,T=rt;let at=!0,et=null,xt=!1,Ct=!1;if(D){const It=I.get(D);if(It.__useDefaultFramebuffer!==void 0)O.bindFramebuffer(M.FRAMEBUFFER,null),at=!1;else if(It.__webglFramebuffer===void 0)X.setupRenderTarget(D);else if(It.__hasExternalTextures)X.rebindTextures(D,I.get(D.texture).__webglTexture,I.get(D.depthTexture).__webglTexture);else if(D.depthBuffer){const kt=D.depthTexture;if(It.__boundDepthTexture!==kt){if(kt!==null&&I.has(kt)&&(D.width!==kt.image.width||D.height!==kt.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");X.setupDepthRenderbuffer(D)}}const Wt=D.texture;(Wt.isData3DTexture||Wt.isDataArrayTexture||Wt.isCompressedArrayTexture)&&(Ct=!0);const jt=I.get(D).__webglFramebuffer;D.isWebGLCubeRenderTarget?(Array.isArray(jt[tt])?et=jt[tt][rt]:et=jt[tt],xt=!0):D.samples>0&&X.useMultisampledRTT(D)===!1?et=I.get(D).__webglMultisampledFramebuffer:Array.isArray(jt)?et=jt[rt]:et=jt,N.copy(D.viewport),B.copy(D.scissor),k=D.scissorTest}else N.copy(Et).multiplyScalar(J).floor(),B.copy(ot).multiplyScalar(J).floor(),k=ft;if(rt!==0&&(et=Bc),O.bindFramebuffer(M.FRAMEBUFFER,et)&&at&&O.drawBuffers(D,et),O.viewport(N),O.scissor(B),O.setScissorTest(k),xt){const It=I.get(D.texture);M.framebufferTexture2D(M.FRAMEBUFFER,M.COLOR_ATTACHMENT0,M.TEXTURE_CUBE_MAP_POSITIVE_X+tt,It.__webglTexture,rt)}else if(Ct){const It=tt;for(let Wt=0;Wt<D.textures.length;Wt++){const jt=I.get(D.textures[Wt]);M.framebufferTextureLayer(M.FRAMEBUFFER,M.COLOR_ATTACHMENT0+Wt,jt.__webglTexture,rt,It)}}else if(D!==null&&rt!==0){const It=I.get(D.texture);M.framebufferTexture2D(M.FRAMEBUFFER,M.COLOR_ATTACHMENT0,M.TEXTURE_2D,It.__webglTexture,rt)}_=-1},this.readRenderTargetPixels=function(D,tt,rt,at,et,xt,Ct,Ft=0){if(!(D&&D.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let It=I.get(D).__webglFramebuffer;if(D.isWebGLCubeRenderTarget&&Ct!==void 0&&(It=It[Ct]),It){O.bindFramebuffer(M.FRAMEBUFFER,It);try{const Wt=D.textures[Ft],jt=Wt.format,kt=Wt.type;if(!b.textureFormatReadable(jt)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!b.textureTypeReadable(kt)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}tt>=0&&tt<=D.width-at&&rt>=0&&rt<=D.height-et&&(D.textures.length>1&&M.readBuffer(M.COLOR_ATTACHMENT0+Ft),M.readPixels(tt,rt,at,et,Bt.convert(jt),Bt.convert(kt),xt))}finally{const Wt=L!==null?I.get(L).__webglFramebuffer:null;O.bindFramebuffer(M.FRAMEBUFFER,Wt)}}},this.readRenderTargetPixelsAsync=async function(D,tt,rt,at,et,xt,Ct,Ft=0){if(!(D&&D.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let It=I.get(D).__webglFramebuffer;if(D.isWebGLCubeRenderTarget&&Ct!==void 0&&(It=It[Ct]),It)if(tt>=0&&tt<=D.width-at&&rt>=0&&rt<=D.height-et){O.bindFramebuffer(M.FRAMEBUFFER,It);const Wt=D.textures[Ft],jt=Wt.format,kt=Wt.type;if(!b.textureFormatReadable(jt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!b.textureTypeReadable(kt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const te=M.createBuffer();M.bindBuffer(M.PIXEL_PACK_BUFFER,te),M.bufferData(M.PIXEL_PACK_BUFFER,xt.byteLength,M.STREAM_READ),D.textures.length>1&&M.readBuffer(M.COLOR_ATTACHMENT0+Ft),M.readPixels(tt,rt,at,et,Bt.convert(jt),Bt.convert(kt),0);const se=L!==null?I.get(L).__webglFramebuffer:null;O.bindFramebuffer(M.FRAMEBUFFER,se);const fe=M.fenceSync(M.SYNC_GPU_COMMANDS_COMPLETE,0);return M.flush(),await lu(M,fe,4),M.bindBuffer(M.PIXEL_PACK_BUFFER,te),M.getBufferSubData(M.PIXEL_PACK_BUFFER,0,xt),M.deleteBuffer(te),M.deleteSync(fe),xt}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(D,tt=null,rt=0){const at=Math.pow(2,-rt),et=Math.floor(D.image.width*at),xt=Math.floor(D.image.height*at),Ct=tt!==null?tt.x:0,Ft=tt!==null?tt.y:0;X.setTexture2D(D,0),M.copyTexSubImage2D(M.TEXTURE_2D,rt,0,0,Ct,Ft,et,xt),O.unbindTexture()};const kc=M.createFramebuffer(),Hc=M.createFramebuffer();this.copyTextureToTexture=function(D,tt,rt=null,at=null,et=0,xt=null){xt===null&&(et!==0?(os("WebGLRenderer: copyTextureToTexture function signature has changed to support src and dst mipmap levels."),xt=et,et=0):xt=0);let Ct,Ft,It,Wt,jt,kt,te,se,fe;const ce=D.isCompressedTexture?D.mipmaps[xt]:D.image;if(rt!==null)Ct=rt.max.x-rt.min.x,Ft=rt.max.y-rt.min.y,It=rt.isBox3?rt.max.z-rt.min.z:1,Wt=rt.min.x,jt=rt.min.y,kt=rt.isBox3?rt.min.z:0;else{const Ye=Math.pow(2,-et);Ct=Math.floor(ce.width*Ye),Ft=Math.floor(ce.height*Ye),D.isDataArrayTexture?It=ce.depth:D.isData3DTexture?It=Math.floor(ce.depth*Ye):It=1,Wt=0,jt=0,kt=0}at!==null?(te=at.x,se=at.y,fe=at.z):(te=0,se=0,fe=0);const ae=Bt.convert(tt.format),Gt=Bt.convert(tt.type);let ue;tt.isData3DTexture?(X.setTexture3D(tt,0),ue=M.TEXTURE_3D):tt.isDataArrayTexture||tt.isCompressedArrayTexture?(X.setTexture2DArray(tt,0),ue=M.TEXTURE_2D_ARRAY):(X.setTexture2D(tt,0),ue=M.TEXTURE_2D),M.pixelStorei(M.UNPACK_FLIP_Y_WEBGL,tt.flipY),M.pixelStorei(M.UNPACK_PREMULTIPLY_ALPHA_WEBGL,tt.premultiplyAlpha),M.pixelStorei(M.UNPACK_ALIGNMENT,tt.unpackAlignment);const ee=M.getParameter(M.UNPACK_ROW_LENGTH),ze=M.getParameter(M.UNPACK_IMAGE_HEIGHT),oi=M.getParameter(M.UNPACK_SKIP_PIXELS),Be=M.getParameter(M.UNPACK_SKIP_ROWS),Wi=M.getParameter(M.UNPACK_SKIP_IMAGES);M.pixelStorei(M.UNPACK_ROW_LENGTH,ce.width),M.pixelStorei(M.UNPACK_IMAGE_HEIGHT,ce.height),M.pixelStorei(M.UNPACK_SKIP_PIXELS,Wt),M.pixelStorei(M.UNPACK_SKIP_ROWS,jt),M.pixelStorei(M.UNPACK_SKIP_IMAGES,kt);const he=D.isDataArrayTexture||D.isData3DTexture,$e=tt.isDataArrayTexture||tt.isData3DTexture;if(D.isDepthTexture){const Ye=I.get(D),Re=I.get(tt),De=I.get(Ye.__renderTarget),rr=I.get(Re.__renderTarget);O.bindFramebuffer(M.READ_FRAMEBUFFER,De.__webglFramebuffer),O.bindFramebuffer(M.DRAW_FRAMEBUFFER,rr.__webglFramebuffer);for(let Bn=0;Bn<It;Bn++)he&&(M.framebufferTextureLayer(M.READ_FRAMEBUFFER,M.COLOR_ATTACHMENT0,I.get(D).__webglTexture,et,kt+Bn),M.framebufferTextureLayer(M.DRAW_FRAMEBUFFER,M.COLOR_ATTACHMENT0,I.get(tt).__webglTexture,xt,fe+Bn)),M.blitFramebuffer(Wt,jt,Ct,Ft,te,se,Ct,Ft,M.DEPTH_BUFFER_BIT,M.NEAREST);O.bindFramebuffer(M.READ_FRAMEBUFFER,null),O.bindFramebuffer(M.DRAW_FRAMEBUFFER,null)}else if(et!==0||D.isRenderTargetTexture||I.has(D)){const Ye=I.get(D),Re=I.get(tt);O.bindFramebuffer(M.READ_FRAMEBUFFER,kc),O.bindFramebuffer(M.DRAW_FRAMEBUFFER,Hc);for(let De=0;De<It;De++)he?M.framebufferTextureLayer(M.READ_FRAMEBUFFER,M.COLOR_ATTACHMENT0,Ye.__webglTexture,et,kt+De):M.framebufferTexture2D(M.READ_FRAMEBUFFER,M.COLOR_ATTACHMENT0,M.TEXTURE_2D,Ye.__webglTexture,et),$e?M.framebufferTextureLayer(M.DRAW_FRAMEBUFFER,M.COLOR_ATTACHMENT0,Re.__webglTexture,xt,fe+De):M.framebufferTexture2D(M.DRAW_FRAMEBUFFER,M.COLOR_ATTACHMENT0,M.TEXTURE_2D,Re.__webglTexture,xt),et!==0?M.blitFramebuffer(Wt,jt,Ct,Ft,te,se,Ct,Ft,M.COLOR_BUFFER_BIT,M.NEAREST):$e?M.copyTexSubImage3D(ue,xt,te,se,fe+De,Wt,jt,Ct,Ft):M.copyTexSubImage2D(ue,xt,te,se,Wt,jt,Ct,Ft);O.bindFramebuffer(M.READ_FRAMEBUFFER,null),O.bindFramebuffer(M.DRAW_FRAMEBUFFER,null)}else $e?D.isDataTexture||D.isData3DTexture?M.texSubImage3D(ue,xt,te,se,fe,Ct,Ft,It,ae,Gt,ce.data):tt.isCompressedArrayTexture?M.compressedTexSubImage3D(ue,xt,te,se,fe,Ct,Ft,It,ae,ce.data):M.texSubImage3D(ue,xt,te,se,fe,Ct,Ft,It,ae,Gt,ce):D.isDataTexture?M.texSubImage2D(M.TEXTURE_2D,xt,te,se,Ct,Ft,ae,Gt,ce.data):D.isCompressedTexture?M.compressedTexSubImage2D(M.TEXTURE_2D,xt,te,se,ce.width,ce.height,ae,ce.data):M.texSubImage2D(M.TEXTURE_2D,xt,te,se,Ct,Ft,ae,Gt,ce);M.pixelStorei(M.UNPACK_ROW_LENGTH,ee),M.pixelStorei(M.UNPACK_IMAGE_HEIGHT,ze),M.pixelStorei(M.UNPACK_SKIP_PIXELS,oi),M.pixelStorei(M.UNPACK_SKIP_ROWS,Be),M.pixelStorei(M.UNPACK_SKIP_IMAGES,Wi),xt===0&&tt.generateMipmaps&&M.generateMipmap(ue),O.unbindTexture()},this.initRenderTarget=function(D){I.get(D).__webglFramebuffer===void 0&&X.setupRenderTarget(D)},this.initTexture=function(D){D.isCubeTexture?X.setTextureCube(D,0):D.isData3DTexture?X.setTexture3D(D,0):D.isDataArrayTexture||D.isCompressedArrayTexture?X.setTexture2DArray(D,0):X.setTexture2D(D,0),O.unbindTexture()},this.resetState=function(){E=0,T=0,L=null,O.reset(),Rt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return un}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;const e=this.getContext();e.drawingBufferColorSpace=ne._getDrawingBufferColorSpace(t),e.unpackColorSpace=ne._getUnpackColorSpace()}}const Al={type:"change"},la={type:"start"},Pc={type:"end"},zs=new Qo,Rl=new Dn,Lg=Math.cos(70*ou.DEG2RAD),ve=new Z,Ue=2*Math.PI,oe={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},kr=1e-6;class Dg extends ju{constructor(t,e=null){super(t,e),this.state=oe.NONE,this.target=new Z,this.cursor=new Z,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:Li.ROTATE,MIDDLE:Li.DOLLY,RIGHT:Li.PAN},this.touches={ONE:wi.ROTATE,TWO:wi.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._domElementKeyEvents=null,this._lastPosition=new Z,this._lastQuaternion=new ni,this._lastTargetPosition=new Z,this._quat=new ni().setFromUnitVectors(t.up,new Z(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new tl,this._sphericalDelta=new tl,this._scale=1,this._panOffset=new Z,this._rotateStart=new $t,this._rotateEnd=new $t,this._rotateDelta=new $t,this._panStart=new $t,this._panEnd=new $t,this._panDelta=new $t,this._dollyStart=new $t,this._dollyEnd=new $t,this._dollyDelta=new $t,this._dollyDirection=new Z,this._mouse=new $t,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=Ug.bind(this),this._onPointerDown=Ig.bind(this),this._onPointerUp=Ng.bind(this),this._onContextMenu=Gg.bind(this),this._onMouseWheel=zg.bind(this),this._onKeyDown=Bg.bind(this),this._onTouchStart=kg.bind(this),this._onTouchMove=Hg.bind(this),this._onMouseDown=Fg.bind(this),this._onMouseMove=Og.bind(this),this._interceptControlDown=Vg.bind(this),this._interceptControlUp=Wg.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}connect(t){super.connect(t),this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.getRootNode().removeEventListener("keydown",this._interceptControlDown,{capture:!0}),this.domElement.style.touchAction="auto"}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(t){t.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=t}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(Al),this.update(),this.state=oe.NONE}update(t=null){const e=this.object.position;ve.copy(e).sub(this.target),ve.applyQuaternion(this._quat),this._spherical.setFromVector3(ve),this.autoRotate&&this.state===oe.NONE&&this._rotateLeft(this._getAutoRotationAngle(t)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,s=this.maxAzimuthAngle;isFinite(n)&&isFinite(s)&&(n<-Math.PI?n+=Ue:n>Math.PI&&(n-=Ue),s<-Math.PI?s+=Ue:s>Math.PI&&(s-=Ue),n<=s?this._spherical.theta=Math.max(n,Math.min(s,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+s)/2?Math.max(n,this._spherical.theta):Math.min(s,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let r=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{const o=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),r=o!=this._spherical.radius}if(ve.setFromSpherical(this._spherical),ve.applyQuaternion(this._quatInverse),e.copy(this.target).add(ve),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let o=null;if(this.object.isPerspectiveCamera){const a=ve.length();o=this._clampDistance(a*this._scale);const l=a-o;this.object.position.addScaledVector(this._dollyDirection,l),this.object.updateMatrixWorld(),r=!!l}else if(this.object.isOrthographicCamera){const a=new Z(this._mouse.x,this._mouse.y,0);a.unproject(this.object);const l=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),r=l!==this.object.zoom;const c=new Z(this._mouse.x,this._mouse.y,0);c.unproject(this.object),this.object.position.sub(c).add(a),this.object.updateMatrixWorld(),o=ve.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;o!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(o).add(this.object.position):(zs.origin.copy(this.object.position),zs.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(zs.direction))<Lg?this.object.lookAt(this.target):(Rl.setFromNormalAndCoplanarPoint(this.object.up,this.target),zs.intersectPlane(Rl,this.target))))}else if(this.object.isOrthographicCamera){const o=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),o!==this.object.zoom&&(this.object.updateProjectionMatrix(),r=!0)}return this._scale=1,this._performCursorZoom=!1,r||this._lastPosition.distanceToSquared(this.object.position)>kr||8*(1-this._lastQuaternion.dot(this.object.quaternion))>kr||this._lastTargetPosition.distanceToSquared(this.target)>kr?(this.dispatchEvent(Al),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(t){return t!==null?Ue/60*this.autoRotateSpeed*t:Ue/60/60*this.autoRotateSpeed}_getZoomScale(t){const e=Math.abs(t*.01);return Math.pow(.95,this.zoomSpeed*e)}_rotateLeft(t){this._sphericalDelta.theta-=t}_rotateUp(t){this._sphericalDelta.phi-=t}_panLeft(t,e){ve.setFromMatrixColumn(e,0),ve.multiplyScalar(-t),this._panOffset.add(ve)}_panUp(t,e){this.screenSpacePanning===!0?ve.setFromMatrixColumn(e,1):(ve.setFromMatrixColumn(e,0),ve.crossVectors(this.object.up,ve)),ve.multiplyScalar(t),this._panOffset.add(ve)}_pan(t,e){const n=this.domElement;if(this.object.isPerspectiveCamera){const s=this.object.position;ve.copy(s).sub(this.target);let r=ve.length();r*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*t*r/n.clientHeight,this.object.matrix),this._panUp(2*e*r/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(t*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(e*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(t,e){if(!this.zoomToCursor)return;this._performCursorZoom=!0;const n=this.domElement.getBoundingClientRect(),s=t-n.left,r=e-n.top,o=n.width,a=n.height;this._mouse.x=s/o*2-1,this._mouse.y=-(r/a)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(t){return Math.max(this.minDistance,Math.min(this.maxDistance,t))}_handleMouseDownRotate(t){this._rotateStart.set(t.clientX,t.clientY)}_handleMouseDownDolly(t){this._updateZoomParameters(t.clientX,t.clientX),this._dollyStart.set(t.clientX,t.clientY)}_handleMouseDownPan(t){this._panStart.set(t.clientX,t.clientY)}_handleMouseMoveRotate(t){this._rotateEnd.set(t.clientX,t.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const e=this.domElement;this._rotateLeft(Ue*this._rotateDelta.x/e.clientHeight),this._rotateUp(Ue*this._rotateDelta.y/e.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(t){this._dollyEnd.set(t.clientX,t.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(t){this._panEnd.set(t.clientX,t.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(t){this._updateZoomParameters(t.clientX,t.clientY),t.deltaY<0?this._dollyIn(this._getZoomScale(t.deltaY)):t.deltaY>0&&this._dollyOut(this._getZoomScale(t.deltaY)),this.update()}_handleKeyDown(t){let e=!1;switch(t.code){case this.keys.UP:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateUp(Ue*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),e=!0;break;case this.keys.BOTTOM:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateUp(-Ue*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),e=!0;break;case this.keys.LEFT:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateLeft(Ue*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),e=!0;break;case this.keys.RIGHT:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateLeft(-Ue*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),e=!0;break}e&&(t.preventDefault(),this.update())}_handleTouchStartRotate(t){if(this._pointers.length===1)this._rotateStart.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),s=.5*(t.pageY+e.y);this._rotateStart.set(n,s)}}_handleTouchStartPan(t){if(this._pointers.length===1)this._panStart.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),s=.5*(t.pageY+e.y);this._panStart.set(n,s)}}_handleTouchStartDolly(t){const e=this._getSecondPointerPosition(t),n=t.pageX-e.x,s=t.pageY-e.y,r=Math.sqrt(n*n+s*s);this._dollyStart.set(0,r)}_handleTouchStartDollyPan(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enablePan&&this._handleTouchStartPan(t)}_handleTouchStartDollyRotate(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enableRotate&&this._handleTouchStartRotate(t)}_handleTouchMoveRotate(t){if(this._pointers.length==1)this._rotateEnd.set(t.pageX,t.pageY);else{const n=this._getSecondPointerPosition(t),s=.5*(t.pageX+n.x),r=.5*(t.pageY+n.y);this._rotateEnd.set(s,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const e=this.domElement;this._rotateLeft(Ue*this._rotateDelta.x/e.clientHeight),this._rotateUp(Ue*this._rotateDelta.y/e.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(t){if(this._pointers.length===1)this._panEnd.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),s=.5*(t.pageY+e.y);this._panEnd.set(n,s)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(t){const e=this._getSecondPointerPosition(t),n=t.pageX-e.x,s=t.pageY-e.y,r=Math.sqrt(n*n+s*s);this._dollyEnd.set(0,r),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);const o=(t.pageX+e.x)*.5,a=(t.pageY+e.y)*.5;this._updateZoomParameters(o,a)}_handleTouchMoveDollyPan(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enablePan&&this._handleTouchMovePan(t)}_handleTouchMoveDollyRotate(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enableRotate&&this._handleTouchMoveRotate(t)}_addPointer(t){this._pointers.push(t.pointerId)}_removePointer(t){delete this._pointerPositions[t.pointerId];for(let e=0;e<this._pointers.length;e++)if(this._pointers[e]==t.pointerId){this._pointers.splice(e,1);return}}_isTrackingPointer(t){for(let e=0;e<this._pointers.length;e++)if(this._pointers[e]==t.pointerId)return!0;return!1}_trackPointer(t){let e=this._pointerPositions[t.pointerId];e===void 0&&(e=new $t,this._pointerPositions[t.pointerId]=e),e.set(t.pageX,t.pageY)}_getSecondPointerPosition(t){const e=t.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[e]}_customWheelEvent(t){const e=t.deltaMode,n={clientX:t.clientX,clientY:t.clientY,deltaY:t.deltaY};switch(e){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100;break}return t.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}}function Ig(i){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(i.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.domElement.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(i)&&(this._addPointer(i),i.pointerType==="touch"?this._onTouchStart(i):this._onMouseDown(i)))}function Ug(i){this.enabled!==!1&&(i.pointerType==="touch"?this._onTouchMove(i):this._onMouseMove(i))}function Ng(i){switch(this._removePointer(i),this._pointers.length){case 0:this.domElement.releasePointerCapture(i.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(Pc),this.state=oe.NONE;break;case 1:const t=this._pointers[0],e=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:e.x,pageY:e.y});break}}function Fg(i){let t;switch(i.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case Li.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(i),this.state=oe.DOLLY;break;case Li.ROTATE:if(i.ctrlKey||i.metaKey||i.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(i),this.state=oe.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(i),this.state=oe.ROTATE}break;case Li.PAN:if(i.ctrlKey||i.metaKey||i.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(i),this.state=oe.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(i),this.state=oe.PAN}break;default:this.state=oe.NONE}this.state!==oe.NONE&&this.dispatchEvent(la)}function Og(i){switch(this.state){case oe.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(i);break;case oe.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(i);break;case oe.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(i);break}}function zg(i){this.enabled===!1||this.enableZoom===!1||this.state!==oe.NONE||(i.preventDefault(),this.dispatchEvent(la),this._handleMouseWheel(this._customWheelEvent(i)),this.dispatchEvent(Pc))}function Bg(i){this.enabled!==!1&&this._handleKeyDown(i)}function kg(i){switch(this._trackPointer(i),this._pointers.length){case 1:switch(this.touches.ONE){case wi.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(i),this.state=oe.TOUCH_ROTATE;break;case wi.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(i),this.state=oe.TOUCH_PAN;break;default:this.state=oe.NONE}break;case 2:switch(this.touches.TWO){case wi.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(i),this.state=oe.TOUCH_DOLLY_PAN;break;case wi.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(i),this.state=oe.TOUCH_DOLLY_ROTATE;break;default:this.state=oe.NONE}break;default:this.state=oe.NONE}this.state!==oe.NONE&&this.dispatchEvent(la)}function Hg(i){switch(this._trackPointer(i),this.state){case oe.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(i),this.update();break;case oe.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(i),this.update();break;case oe.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(i),this.update();break;case oe.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(i),this.update();break;default:this.state=oe.NONE}}function Gg(i){this.enabled!==!1&&i.preventDefault()}function Vg(i){i.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function Wg(i){i.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}const Cl="#16191f";function Xg(i,t,e){const n=new Pg({antialias:!0,preserveDrawingBuffer:!0});n.setPixelRatio(Math.min(window.devicePixelRatio||1,2)),n.shadowMap.enabled=!0,n.shadowMap.type=Kl,n.toneMapping=Ql,n.toneMappingExposure=1.12,i.appendChild(n.domElement);const s=new Iu;s.background=new Jt(Cl),s.fog=new ea(Cl,.0011);const r=new Je(46,1,.1,4e3),o=new Dg(r,n.domElement);o.enableDamping=!0,o.dampingFactor=.08,o.maxDistance=1200,o.maxPolarAngle=Math.PI*.49,s.add(new Hu(15068143,3815986,1.05));const a=new Qa(16773855,2.8);a.castShadow=!0,a.shadow.mapSize.set(2048,2048),a.shadow.normalBias=.1,a.shadow.bias=-2e-4,s.add(a),s.add(a.target);const l=new Qa(13687779,.55);l.position.set(120,60,-140),s.add(l);let c=new Ai,u=null,h=null,g=new Ai;s.add(c,g);let p=-1,m=4;const x=()=>{m=6};o.addEventListener("change",x);let f=null;const d=new Xu;function A(F){F.traverse(G=>{G.geometry&&G.geometry.dispose(),G.material&&(Array.isArray(G.material)?G.material:[G.material]).forEach(H=>H.dispose())}),F.clear()}function P(){const F=e.getTerrain();return F?F.sample:null}function v(){A(c),A(g);const F=t.project,G=t.selection,H=P();let $;try{$=Go(F,e.getSampleMap(),e.getTopology(),H)}catch(ot){console.error("mesh build failed",ot);return}const J=ot=>{const ft=new Us({vertexColors:!0,roughness:.93,metalness:0,side:ln});return ot&&G.roadId===ot&&(ft.emissive=new Jt("#4a90e2"),ft.emissiveIntensity=.22),t.ui.wireframe&&(ft.wireframe=!0),ft},lt=new Map,pt=ot=>{const ft=ot||"";return lt.has(ft)||lt.set(ft,J(ot)),lt.get(ft)};for(const ot of $.parts){const ft=new je;ft.setAttribute("position",new Ae(ot.positions,3)),ft.setAttribute("normal",new Ae(ot.normals,3)),ft.setAttribute("color",new Ae(ot.colors,3)),ft.setAttribute("uv",new Ae(ot.uvs,2)),ft.setIndex(new Ae(ot.indices,1));const Ut=new Le(ft,pt(ot.roadId));Ut.castShadow=!0,Ut.receiveShadow=!0,Ut.name=ot.junction?`junction__${ot.name}`:`${ot.roadId||"?"}__${ot.name}`,c.add(Ut)}const Et=new Us({color:16096779,roughness:.5,emissive:8014336,emissiveIntensity:.4});for(const ot of F.junctions||[]){const ft=new Le(new ra(1.1),Et);ft.position.set(ot.x,ot.y+1.2,ot.z),ft.castShadow=!0,g.add(ft)}for(const ot of e.getTopology?.()?.overpasses||[]){const ft=e.getSamples(ot.upper),Ut=e.getSamples(ot.lower);if(!ft||!Ut)continue;const Pt=_e(ft.samples,ot.sUpper),ct=_e(Ut.samples,ot.sLower);if(!Pt||!ct)continue;const ut=ot.gap<4.5?15680580:ot.gap<6?16096779:3462041,St=new ta({color:ut,transparent:!0,opacity:.9}),V=Math.min(Pt.y,ct.y)+.15,j=Math.max(Pt.y,ct.y)-.15;if(j-V>.4){const Q=new Le(new ia(.07,.07,j-V,6),St);Q.position.set(ot.x,(V+j)/2,ot.z),g.add(Q)}for(const Q of[V,j]){const dt=new Le(new oa(.55,.09,6,18),St);dt.position.set(ot.x,Q,ot.z),dt.rotation.x=Math.PI/2,g.add(dt)}}C(),x()}function C(){const F=new si().setFromObject(c);if(F.isEmpty()){const $=e.getTerrain(),J=$?Math.max($.bounds.maxX-$.bounds.minX,$.bounds.maxZ-$.bounds.minZ)/2:200;F.set(new Z(-J,-5,-J),new Z(J,30,J))}const G=F.getCenter(new Z),H=Math.max(60,F.getSize(new Z).length()/2);a.position.set(G.x-H*.9,G.y+H*1.4,G.z+H*.7),a.target.position.copy(G),Object.assign(a.shadow.camera,{left:-H,right:H,top:H,bottom:-H,far:H*6,near:1}),a.shadow.camera.updateProjectionMatrix()}function E(){const F=e.getTerrain();if(!(F&&F.rev===p&&u)){if(u&&(s.remove(u),u.geometry.dispose(),u.material.dispose(),u=null),h&&(s.remove(h),h.geometry.dispose(),h.material.dispose(),h=null),p=F?F.rev:-1,F){const G=F.bounds.maxX-F.bounds.minX,H=F.bounds.maxZ-F.bounds.minZ,$=150,J=new ki(G,H,$,$);J.rotateX(-Math.PI/2);const lt=J.attributes.position,pt=new Float32Array(lt.count*3),Et=Math.max(1e-6,F.maxY-F.minY);for(let ft=0;ft<lt.count;ft++){const Ut=lt.getX(ft)+(F.bounds.minX+F.bounds.maxX)/2,Pt=lt.getZ(ft)+(F.bounds.minZ+F.bounds.maxZ)/2,ct=F.sample(Ut,Pt)??F.minY;lt.setY(ft,ct-.06),lt.setX(ft,Ut),lt.setZ(ft,Pt);const ut=(ct-F.minY)/Et;pt[ft*3]=.1+ut*.3,pt[ft*3+1]=.13+ut*.24,pt[ft*3+2]=.09+ut*.13}J.setAttribute("color",new Ae(pt,3)),J.computeVertexNormals(),u=new Le(J,new Us({vertexColors:!0,roughness:1})),u.receiveShadow=!0,s.add(u);const ot=Math.max(G,H);h=new el(ot,Math.round(ot/10),9079438,3815998),h.position.set((F.bounds.minX+F.bounds.maxX)/2,F.minY+.05,(F.bounds.minZ+F.bounds.maxZ)/2)}else u=new Le(new ki(1600,1600),new Us({color:1777947,roughness:1})),u.rotation.x=-Math.PI/2,u.position.y=-.08,u.receiveShadow=!0,s.add(u),h=new el(1200,120,4608571,3357230),h.position.y=-.04;h.material.transparent=!0,h.material.opacity=.5,s.add(h),x()}}function T(F=!1){S();const G=new si().setFromObject(c),H=e.getTerrain();let $,J;G.isEmpty()?H?($=new Z((H.bounds.minX+H.bounds.maxX)/2,(H.minY+H.maxY)/2,(H.bounds.minZ+H.bounds.maxZ)/2),J=Math.max(H.bounds.maxX-H.bounds.minX,H.bounds.maxZ-H.bounds.minZ)/2):($=new Z(0,0,0),J=120):($=G.getCenter(new Z),J=Math.max(20,G.getSize(new Z).length()/2)),o.target.copy($);const lt=F?new Z(.001,1,.001):new Z(1.1,.75,1.35).normalize();r.position.copy($).addScaledVector(lt,J*(F?2.1:1.9)),r.near=Math.max(.05,J/500),r.far=Math.max(2e3,J*12),r.updateProjectionMatrix(),o.update(),x()}function L(F,G){const H=e.getSamples(F);if(!H||!H.count)return null;const $=H.samples;let J=G;H.closed?J=(G%H.length+H.length)%H.length:J=Math.min(H.length-.001,Math.max(0,G));const lt=H.length/(H.closed?$.length:$.length-1),pt=J/lt,Et=Math.floor(pt)%$.length,ot=(Et+1)%$.length,ft=pt-Math.floor(pt),Ut=$[Et],Pt=H.closed||ot<$.length?$[ot]:Ut;return{x:Ut.x+(Pt.x-Ut.x)*ft,y:Ut.y+(Pt.y-Ut.y)*ft,z:Ut.z+(Pt.z-Ut.z)*ft,tx:Ut.tx,tz:Ut.tz,length:H.length,closed:H.closed}}function _(F,G=16){const H=e.getSamples(F);return!H||!H.count?!1:(f={roadId:F,s:0,speed:G,playing:!0},o.enabled=!1,e.onDriveState?.(!0),!0)}function S(F=!1){f&&(f=null,o.enabled=!0,F||e.onDriveState?.(!1),x())}function N(F){if(!f?.playing)return;const G=e.getSamples(f.roadId);if(!G||!G.count){S();return}if(f.s+=f.speed*F,!G.closed&&f.s>=G.length){S(),e.toast("End of road — drive finished");return}const H=L(f.roadId,f.s),$=L(f.roadId,f.s+9);!H||!$||(r.position.set(H.x,H.y+2.5,H.z),r.lookAt($.x,$.y+1.1,$.z))}function B(){E(),v()}function k(){const F=i.getBoundingClientRect(),G=Math.max(50,F.width),H=Math.max(50,F.height);n.setSize(G,H),r.aspect=G/H,r.updateProjectionMatrix(),x()}return n.setAnimationLoop(()=>{const F=Math.min(.1,d.getDelta());if(f){N(F),n.render(s,r);return}o.update(),o.autoRotate=!!t.ui.autoRotate,o.autoRotateSpeed=.7,!(m<=0&&!o.autoRotate)&&(m--,n.render(s,r))}),t.subscribe(F=>{F==="selection"&&v(),F==="ui"&&(c.traverse(G=>{G.material&&(G.material.wireframe=!!t.ui.wireframe)}),x())}),new ResizeObserver(k).observe(i),{refresh:B,resize:k,resetCamera:T,screenshot(F){n.render(s,r),n.domElement.toBlob(G=>{if(!G)return;const H=URL.createObjectURL(G),$=document.createElement("a");$.href=H,$.download=F,document.body.appendChild($),$.click(),$.remove(),setTimeout(()=>URL.revokeObjectURL(H),8e3)},"image/png")},drive:_,stopDrive:S,setDriveSpeed(F){f&&(f.speed=F)},toggleDrivePlay(){return f?(f.playing=!f.playing,f.playing):!1},get driving(){return!!f},get drivePlaying(){return!!f?.playing},invalidate:x,dispose(){n.setAnimationLoop(null),A(c),A(g),n.dispose(),i.innerHTML=""}}}const Lc=(i,t,e=[])=>{const n=document.createElementNS("http://www.w3.org/2000/svg",i);return Object.keys(t).forEach(s=>{n.setAttribute(s,String(t[s]))}),e.length&&e.forEach(s=>{const r=Lc(...s);n.appendChild(r)}),n};var jg=([i,t,e])=>Lc(i,t,e);const $g=i=>Array.from(i.attributes).reduce((t,e)=>(t[e.name]=e.value,t),{}),Yg=i=>typeof i=="string"?i:!i||!i.class?"":i.class&&typeof i.class=="string"?i.class.split(" "):i.class&&Array.isArray(i.class)?i.class:"",qg=i=>i.flatMap(Yg).map(e=>e.trim()).filter(Boolean).filter((e,n,s)=>s.indexOf(e)===n).join(" "),Zg=i=>i.replace(/(\w)(\w*)(_|-|\s*)/g,(t,e,n)=>e.toUpperCase()+n.toLowerCase()),Pl=(i,{nameAttr:t,icons:e,attrs:n})=>{const s=i.getAttribute(t);if(s==null)return;const r=Zg(s),o=e[r];if(!o)return console.warn(`${i.outerHTML} icon name was not found in the provided icons object.`);const a=$g(i),[l,c,u]=o,h={...c,"data-lucide":s,...n,...a},g=qg(["lucide",`lucide-${s}`,a,n]);g&&Object.assign(h,{class:g});const p=jg([l,h,u]);return i.parentNode?.replaceChild(p,i)};const Ot={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};const Kg=["svg",Ot,[["path",{d:"m21 16-4 4-4-4"}],["path",{d:"M17 20V4"}],["path",{d:"m3 8 4-4 4 4"}],["path",{d:"M7 4v16"}]]];const Jg=["svg",Ot,[["path",{d:"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"}],["path",{d:"m3.3 7 8.7 5 8.7-5"}],["path",{d:"M12 22V12"}]]];const Qg=["svg",Ot,[["path",{d:"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"}],["circle",{cx:"12",cy:"13",r:"3"}]]];const t0=["svg",Ot,[["path",{d:"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"}],["circle",{cx:"7",cy:"17",r:"2"}],["path",{d:"M9 17h6"}],["circle",{cx:"17",cy:"17",r:"2"}]]];const e0=["svg",Ot,[["path",{d:"M20 6 9 17l-5-5"}]]];const n0=["svg",Ot,[["path",{d:"m6 9 6 6 6-6"}]]];const i0=["svg",Ot,[["circle",{cx:"12",cy:"12",r:"10"}],["circle",{cx:"12",cy:"12",r:"1"}]]];const s0=["svg",Ot,[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M12 3v18"}]]];const r0=["svg",Ot,[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]]];const o0=["svg",Ot,[["circle",{cx:"12",cy:"12",r:"10"}],["line",{x1:"22",x2:"18",y1:"12",y2:"12"}],["line",{x1:"6",x2:"2",y1:"12",y2:"12"}],["line",{x1:"12",x2:"12",y1:"6",y2:"2"}],["line",{x1:"12",x2:"12",y1:"22",y2:"18"}]]];const a0=["svg",Ot,[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["polyline",{points:"7 10 12 15 17 10"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3"}]]];const l0=["svg",Ot,[["path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"}],["path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242"}],["path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"}],["path",{d:"m2 2 20 20"}]]];const c0=["svg",Ot,[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{cx:"12",cy:"12",r:"3"}]]];const d0=["svg",Ot,[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4"}],["path",{d:"M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"}],["path",{d:"M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"}]]];const u0=["svg",Ot,[["path",{d:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"}],["line",{x1:"4",x2:"4",y1:"22",y2:"15"}]]];const h0=["svg",Ot,[["path",{d:"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"}]]];const f0=["svg",Ot,[["path",{d:"m12 14 4-4"}],["path",{d:"M3.34 19a10 10 0 1 1 17.32 0"}]]];const p0=["svg",Ot,[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M3 9h18"}],["path",{d:"M3 15h18"}],["path",{d:"M9 3v18"}],["path",{d:"M15 3v18"}]]];const m0=["svg",Ot,[["path",{d:"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"}],["path",{d:"M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"}],["path",{d:"M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"}],["path",{d:"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"}]]];const g0=["svg",Ot,[["line",{x1:"4",x2:"20",y1:"9",y2:"9"}],["line",{x1:"4",x2:"20",y1:"15",y2:"15"}],["line",{x1:"10",x2:"8",y1:"3",y2:"21"}],["line",{x1:"16",x2:"14",y1:"3",y2:"21"}]]];const _0=["svg",Ot,[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}],["circle",{cx:"9",cy:"9",r:"2"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"}]]];const x0=["svg",Ot,[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"M12 16v-4"}],["path",{d:"M12 8h.01"}]]];const v0=["svg",Ot,[["path",{d:"M10 8h.01"}],["path",{d:"M12 12h.01"}],["path",{d:"M14 8h.01"}],["path",{d:"M16 12h.01"}],["path",{d:"M18 8h.01"}],["path",{d:"M6 8h.01"}],["path",{d:"M7 16h10"}],["path",{d:"M8 12h.01"}],["rect",{width:"20",height:"16",x:"2",y:"4",rx:"2"}]]];const M0=["svg",Ot,[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]]];const y0=["svg",Ot,[["path",{d:"M9 17H7A5 5 0 0 1 7 7h2"}],["path",{d:"M15 7h2a5 5 0 1 1 0 10h-2"}],["line",{x1:"8",x2:"16",y1:"12",y2:"12"}]]];const S0=["svg",Ot,[["line",{x1:"2",x2:"5",y1:"12",y2:"12"}],["line",{x1:"19",x2:"22",y1:"12",y2:"12"}],["line",{x1:"12",x2:"12",y1:"2",y2:"5"}],["line",{x1:"12",x2:"12",y1:"19",y2:"22"}],["circle",{cx:"12",cy:"12",r:"7"}],["circle",{cx:"12",cy:"12",r:"3"}]]];const b0=["svg",Ot,[["path",{d:"m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"}],["path",{d:"m5 8 4 4"}],["path",{d:"m12 15 4 4"}]]];const E0=["svg",Ot,[["path",{d:"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"}],["path",{d:"M15 5.764v15"}],["path",{d:"M9 3.236v15"}]]];const T0=["svg",Ot,[["path",{d:"M8 3H5a2 2 0 0 0-2 2v3"}],["path",{d:"M21 8V5a2 2 0 0 0-2-2h-3"}],["path",{d:"M3 16v3a2 2 0 0 0 2 2h3"}],["path",{d:"M16 21h3a2 2 0 0 0 2-2v-3"}]]];const w0=["svg",Ot,[["path",{d:"M12 13v8"}],["path",{d:"M12 3v3"}],["path",{d:"M4 6a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h13a2 2 0 0 0 1.152-.365l3.424-2.317a1 1 0 0 0 0-1.635l-3.424-2.318A2 2 0 0 0 17 6z"}]]];const A0=["svg",Ot,[["path",{d:"m8 3 4 8 5-5 5 15H2L8 3z"}],["path",{d:"M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"}]]];const R0=["svg",Ot,[["path",{d:"m8 3 4 8 5-5 5 15H2L8 3z"}]]];const C0=["svg",Ot,[["path",{d:"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"}]]];const P0=["svg",Ot,[["path",{d:"M12 2v20"}],["path",{d:"m15 19-3 3-3-3"}],["path",{d:"m19 9 3 3-3 3"}],["path",{d:"M2 12h20"}],["path",{d:"m5 9-3 3 3 3"}],["path",{d:"m9 5 3-3 3 3"}]]];const L0=["svg",Ot,[["path",{d:"m15 9-6 6"}],["path",{d:"M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z"}],["path",{d:"m9 9 6 6"}]]];const D0=["svg",Ot,[["circle",{cx:"12",cy:"12",r:"3"}],["circle",{cx:"19",cy:"5",r:"2"}],["circle",{cx:"5",cy:"19",r:"2"}],["path",{d:"M10.4 21.9a10 10 0 0 0 9.941-15.416"}],["path",{d:"M13.5 2.1a10 10 0 0 0-9.841 15.416"}]]];const I0=["svg",Ot,[["circle",{cx:"13.5",cy:"6.5",r:".5",fill:"currentColor"}],["circle",{cx:"17.5",cy:"10.5",r:".5",fill:"currentColor"}],["circle",{cx:"8.5",cy:"7.5",r:".5",fill:"currentColor"}],["circle",{cx:"6.5",cy:"12.5",r:".5",fill:"currentColor"}],["path",{d:"M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"}]]];const U0=["svg",Ot,[["rect",{x:"14",y:"4",width:"4",height:"16",rx:"1"}],["rect",{x:"6",y:"4",width:"4",height:"16",rx:"1"}]]];const N0=["svg",Ot,[["path",{d:"M12 20h9"}],["path",{d:"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"}]]];const F0=["svg",Ot,[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"}],["path",{d:"m15 5 4 4"}]]];const O0=["svg",Ot,[["polygon",{points:"6 3 20 12 6 21 6 3"}]]];const z0=["svg",Ot,[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]]];const B0=["svg",Ot,[["path",{d:"m15 14 5-5-5-5"}],["path",{d:"M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"}]]];const k0=["svg",Ot,[["path",{d:"M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{d:"M3 3v5h5"}],["path",{d:"M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"}],["path",{d:"M16 16h5v5"}]]];const H0=["svg",Ot,[["path",{d:"M16.466 7.5C15.643 4.237 13.952 2 12 2 9.239 2 7 6.477 7 12s2.239 10 5 10c.342 0 .677-.069 1-.2"}],["path",{d:"m15.194 13.707 3.814 1.86-1.86 3.814"}],["path",{d:"M19 15.57c-1.804.885-4.274 1.43-7 1.43-5.523 0-10-2.239-10-5s4.477-5 10-5c4.838 0 8.873 1.718 9.8 4"}]]];const G0=["svg",Ot,[["circle",{cx:"6",cy:"19",r:"3"}],["path",{d:"M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"}],["circle",{cx:"18",cy:"5",r:"3"}]]];const V0=["svg",Ot,[["path",{d:"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"}],["path",{d:"m14.5 12.5 2-2"}],["path",{d:"m11.5 9.5 2-2"}],["path",{d:"m8.5 6.5 2-2"}],["path",{d:"m17.5 15.5 2-2"}]]];const W0=["svg",Ot,[["path",{d:"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"}],["path",{d:"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"}],["path",{d:"M7 3v4a1 1 0 0 0 1 1h7"}]]];const X0=["svg",Ot,[["path",{d:"M3 7V5a2 2 0 0 1 2-2h2"}],["path",{d:"M17 3h2a2 2 0 0 1 2 2v2"}],["path",{d:"M21 17v2a2 2 0 0 1-2 2h-2"}],["path",{d:"M7 21H5a2 2 0 0 1-2-2v-2"}]]];const j0=["svg",Ot,[["circle",{cx:"19",cy:"5",r:"2"}],["circle",{cx:"5",cy:"19",r:"2"}],["path",{d:"M5 17A12 12 0 0 1 17 5"}]]];const $0=["svg",Ot,[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}]]];const Y0=["svg",Ot,[["path",{d:"M12 3v18"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["path",{d:"M3 9h18"}],["path",{d:"M3 15h18"}]]];const q0=["svg",Ot,[["path",{d:"M3 6h18"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"}],["line",{x1:"10",x2:"10",y1:"11",y2:"17"}],["line",{x1:"14",x2:"14",y1:"11",y2:"17"}]]];const Z0=["svg",Ot,[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17"}],["polyline",{points:"16 7 22 7 22 13"}]]];const K0=["svg",Ot,[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"}],["path",{d:"M12 9v4"}],["path",{d:"M12 17h.01"}]]];const J0=["svg",Ot,[["path",{d:"M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"}]]];const Q0=["svg",Ot,[["path",{d:"M9 14 4 9l5-5"}],["path",{d:"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"}]]];const t_=["svg",Ot,[["path",{d:"m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"}],["path",{d:"m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"}],["line",{x1:"8",x2:"8",y1:"2",y2:"5"}],["line",{x1:"2",x2:"5",y1:"8",y2:"8"}],["line",{x1:"16",x2:"16",y1:"19",y2:"22"}],["line",{x1:"19",x2:"22",y1:"16",y2:"16"}]]];const e_=["svg",Ot,[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["polyline",{points:"17 8 12 3 7 8"}],["line",{x1:"12",x2:"12",y1:"3",y2:"15"}]]];const n_=["svg",Ot,[["circle",{cx:"12",cy:"4.5",r:"2.5"}],["path",{d:"m10.2 6.3-3.9 3.9"}],["circle",{cx:"4.5",cy:"12",r:"2.5"}],["path",{d:"M7 12h10"}],["circle",{cx:"19.5",cy:"12",r:"2.5"}],["path",{d:"m13.8 17.7 3.9-3.9"}],["circle",{cx:"12",cy:"19.5",r:"2.5"}]]];const i_=["svg",Ot,[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]]];const s_=({icons:i={},nameAttr:t="data-lucide",attrs:e={}}={})=>{if(!Object.values(i).length)throw new Error(`Please provide an icons object.
If you want to use all the icons you can import it like:
 \`import { createIcons, icons } from 'lucide';
lucide.createIcons({icons});\``);if(typeof document>"u")throw new Error("`createIcons()` only works in a browser environment.");const n=document.querySelectorAll(`[${t}]`);if(Array.from(n).forEach(s=>Pl(s,{nameAttr:t,icons:i,attrs:e})),t==="data-lucide"){const s=document.querySelectorAll("[icon-name]");s.length>0&&(console.warn("[Lucide] Some icons were found with the now deprecated icon-name attribute. These will still be replaced for backwards compatibility, but will no longer be supported in v1.0 and you should switch to data-lucide"),Array.from(s).forEach(r=>Pl(r,{nameAttr:"icon-name",icons:i,attrs:e})))}},r_={Route:G0,Spline:j0,Waypoints:n_,Milestone:w0,Ruler:V0,Gauge:f0,TrendingUp:Z0,ArrowUpDown:Kg,Mountain:R0,MountainSnow:A0,Layers:M0,Link2:y0,Unlink:t_,CircleDot:i0,Eye:c0,EyeOff:l0,Plus:z0,Copy:r0,Trash2:q0,Pencil:F0,Save:W0,FolderOpen:h0,Upload:e_,FileJson:d0,Image:_0,Table:Y0,Camera:Qg,Flag:u0,Move:P0,Hash:g0,Info:x0,TriangleAlert:K0,Check:e0,X:i_,ChevronDown:n0,Crosshair:o0,Palette:I0,OctagonX:L0,RefreshCcw:k0,Map:E0,Box:Jg,Columns2:s0,Undo2:Q0,Redo2:B0,Download:a0,Keyboard:v0,MousePointer2:C0,PenLine:N0,Hand:m0,Grid3x3:p0,Magnet:b0,Maximize:T0,Orbit:D0,Scan:X0,Triangle:J0,Rotate3d:H0,Car:t0,LocateFixed:S0,Pause:U0,Play:O0,Square:$0},Ln=()=>{try{s_({icons:r_})}catch(i){console.error(i)}},Ne=(i,t=1)=>Number.isFinite(i)?i.toFixed(t):"—",Hr=i=>Number.isFinite(i)?i>=1e3?`${(i/1e3).toFixed(2)} km`:`${i.toFixed(i<100?1:0)} m`:"—";function Mt(i,t,e,n){const s=document.createElement(i);return t&&(s.className=t),n!=null&&(s.innerHTML=n),e&&e.appendChild(s),s}const o_=[{key:"diamond-interchange",name:"Diamond Interchange",sub:"Overpass · ramps · bridges"},{key:"mountain-pass",name:"Alpine Descent",sub:"Hairpins · guardrails · grades"},{key:"quarry-haul",name:"Quarry Haul Road",sub:"Wide gravel · switchbacks"},{key:"village-loop",name:"Village Loop",sub:"Closed loop · junctions"}];function a_(i,t){const e=M=>document.getElementById(M),n=e("left-panel"),s=e("inspector"),r=e("metrics"),o=e("statusbar"),a=new Map;let l=0,c=null;function u(M){const z=e("toast");z.textContent=M,z.hidden=!1,requestAnimationFrame(()=>z.classList.add("show")),clearTimeout(l),l=setTimeout(()=>{z.classList.remove("show"),setTimeout(()=>z.hidden=!0,220)},3200)}function h(){e("export-menu").hidden=!0,e("popup-menu").hidden=!0,document.querySelectorAll(".dropdown.open").forEach(M=>M.classList.remove("open")),c&&(c(),c=null)}function g(M,z,w){h(),M.innerHTML="",w(M),M.hidden=!1;const b=z.getBoundingClientRect(),O=M.offsetWidth,U=M.offsetHeight;let I=Math.min(window.innerWidth-O-10,Math.max(10,b.left)),X=b.bottom+8;X+U>window.innerHeight-10&&(X=Math.max(10,b.top-U-8)),M.style.left=`${I}px`,M.style.top=`${X}px`,Ln();const q=y=>{!M.contains(y.target)&&!z.contains(y.target)&&h()},nt=y=>{y.key==="Escape"&&h()},R=()=>h();setTimeout(()=>{document.addEventListener("mousedown",q),document.addEventListener("keydown",nt),window.addEventListener("resize",R)},0),c=()=>{document.removeEventListener("mousedown",q),document.removeEventListener("keydown",nt),window.removeEventListener("resize",R)}}const p=(M,{icon:z,label:w,sub:b,selected:O,fn:U})=>{const I=Mt("div","mi"+(O?" sel":""),M);return I.innerHTML=`${z?`<i data-lucide="${z}"></i>`:""}<span class="ml">${w}${b?`<small>${b}</small>`:""}</span>${O?'<span class="radio"></span>':""}`,I.onclick=X=>{X.stopPropagation(),h(),U?.()},I};function m({value:M,step:z=1,unit:w="",min:b,max:O,wide:U=!1,onchange:I,oninput:X,disabled:q=!1}){const nt=Mt("div","valuebox"+(U?" wide":"")),R=Mt("div","num",nt),y=Mt("input","",R);y.type="number",y.value=Number.isFinite(M)?+M.toFixed(4):0,z&&(y.step=z),b!=null&&(y.min=b),O!=null&&(y.max=O),y.disabled=q,w&&Mt("div","unitseg",nt,w);let W=!1;return y.addEventListener("focus",()=>{i.checkpoint("edit value"),W=!0,y.select()}),y.addEventListener("input",()=>{const K=parseFloat(y.value);if(!Number.isFinite(K))return;const st=b!=null&&O!=null?Math.min(O,Math.max(b,K)):K;i.transient(()=>X(st))}),y.addEventListener("change",()=>{W&&(W=!1,i.endGesture()),I?.()}),y.addEventListener("blur",()=>{W&&(W=!1,i.endGesture())}),y.addEventListener("keydown",K=>{K.key==="Enter"&&y.blur(),K.key==="Escape"&&y.blur(),K.stopPropagation()}),{box:nt,input:y,set(K){document.activeElement!==y&&(y.value=+K.toFixed(4))}}}function x({value:M,onchange:z,placeholder:w=""}){const b=Mt("div","valuebox wide"),O=Mt("div","num",b),U=Mt("input","",O);U.type="text",U.value=M,U.placeholder=w,U.style.textAlign="left";let I=!1;return U.addEventListener("focus",()=>{i.checkpoint("rename"),I=!0,U.select()}),U.addEventListener("input",()=>i.transient(()=>z(U.value))),U.addEventListener("change",()=>{I&&(I=!1,i.endGesture())}),U.addEventListener("blur",()=>{I&&(I=!1,i.endGesture())}),U.addEventListener("keydown",X=>{X.key==="Enter"&&U.blur(),X.stopPropagation()}),b}function f(M,z,{min:w,max:b,step:O,unit:U,value:I,fmt:X=nt=>nt,oninput:q}){const nt=Mt("div","slider-row",M);Mt("label","",nt,z);const R=m({value:I,step:O,unit:U,min:w,max:b,oninput:q});nt.appendChild(R.box);const y=Mt("div","slider",nt,'<div class="fill"></div><div class="knob"></div>'),W=y.querySelector(".fill"),K=y.querySelector(".knob"),st=it=>{const Tt=(it-w)/(b-w);W.style.width=`${Tt*100}%`,K.style.left=`${Tt*100}%`,R.set(it)};return st(I),y.addEventListener("pointerdown",it=>{it.preventDefault(),y.setPointerCapture(it.pointerId),i.checkpoint("adjust "+z.toLowerCase());const Tt=Lt=>{const gt=y.getBoundingClientRect();let bt=w+Math.min(1,Math.max(0,(Lt.clientX-gt.left)/gt.width))*(b-w);bt=Math.round(bt/O)*O,bt=Math.min(b,Math.max(w,+bt.toFixed(5))),i.transient(()=>q(bt)),st(bt)};Tt(it);const mt=Lt=>Tt(Lt),Dt=()=>{y.removeEventListener("pointermove",mt),y.removeEventListener("pointerup",Dt),i.endGesture()};y.addEventListener("pointermove",mt),y.addEventListener("pointerup",Dt)}),{paint:st}}function d(M,z,w,b,O){const U=Mt("div","ctl-row",M);Mt("label","",U,(O?`<i data-lucide="${O}" style="width:11px;height:11px;vertical-align:-1px"></i> `:"")+z);const I=Mt("div","grow",U);I.style.display="flex",I.style.justifyContent="flex-end";const X=Mt("div","switch"+(w?" on":""),I,'<div class="nub"></div>');X.onclick=()=>i.commit("toggle "+z.toLowerCase(),()=>b(!w))}function A(M,z,w,b,O){const U=Mt("div","ctl-row",M);Mt("label","",U,z);const I=Mt("div","dropdown",U),X=w.find(q=>q.value===b);I.innerHTML=`<div class="dd-head"><span class="cur">${X?X.label:"—"}</span><span class="caret"><i data-lucide="chevron-down"></i></span></div>`,I.querySelector(".dd-head").onclick=q=>{q.stopPropagation(),I.classList.add("open"),g(e("popup-menu"),I,nt=>{for(const R of w)p(nt,{icon:R.icon,label:R.label,sub:R.sub,selected:R.value===b,fn:()=>{R.value!==b&&i.commit("set "+z.toLowerCase(),()=>O(R.value))}})})}}function P(M,z,w,b){const O=Mt("div","ctl-row",M);Mt("label","",O,z);const U=Mt("div","colorbar",O);U.innerHTML=`<div class="swatchseg"><div class="circle" style="background:${w}"></div><div class="cname">${w}</div></div><div class="caret"><i data-lucide="chevron-down"></i></div>`;const I=Mt("input","",O);I.type="color",I.value=w,I.style.display="none";let X=!1;U.onclick=()=>{X=!1,I.click()},I.addEventListener("input",()=>{X||(i.checkpoint("set colour"),X=!0),i.transient(()=>b(I.value))}),I.addEventListener("change",()=>{X&&(X=!1,i.endGesture())})}function v(M,z,w,b,O=""){const U=Mt("button","btn "+O,M,`<i data-lucide="${w}"></i>${z}`);return U.onclick=b,U}function C(M,z,w,b,O,{collapsible:U=!0,startOpen:I=!0}={}){const X=Mt("div","prop-section",M),q=Mt("div","prop-title"+(U?" foldable":""),X,`${b?`<i data-lucide="${b}"></i>`:""}${w}${U?'<i data-lucide="chevron-down" class="chev"></i>':""}`),nt=Mt("div","prop-content",X);O(nt);const R=U&&(a.has(z)?a.get(z):!I),y=()=>{q.classList.toggle("collapsed",R),nt.style.maxHeight=R?"0":`${nt.scrollHeight+40}px`};return U&&(R&&q.classList.add("collapsed"),q.onclick=()=>{const W=!q.classList.contains("collapsed");q.classList.toggle("collapsed",W),a.set(z,W),nt.style.maxHeight=W?"0":`${nt.scrollHeight+40}px`},requestAnimationFrame(y)),{sec:X,content:nt}}const E=(M,z,w)=>Mt("div","kv",M,`<span class="k">${z}</span><span class="v">${w}</span>`);function T(M){M.junctions=(M.junctions||[]).filter(z=>(z.links||[]).length>=2)}function L(M){i.commit("delete road",z=>{z.roads=z.roads.filter(w=>w.id!==M);for(const w of z.junctions||[])w.links=(w.links||[]).filter(b=>b.road!==M);T(z)}),i.select({kind:null}),u("Road deleted — Ctrl+Z restores it")}function _(M){const z=At(i.project,M);if(!z)return;const w=js(i.project,"r");i.commit("duplicate road",b=>{const O=JSON.parse(JSON.stringify(z));O.id=w,O.name=`${z.name} copy`,O.points=O.points.map(U=>({...U,x:U.x+6,z:U.z+6})),b.roads.push(O)}),i.select({kind:"road",roadId:w})}function S(M,z){const w=At(i.project,M);if(!w||!w.points[z])return;i.commit("delete point",O=>{const U=At(O,M);U.points.splice(z,1),U.closed&&U.points.length<3&&(U.closed=!1);for(const I of O.junctions||[])I.links=(I.links||[]).filter(X=>X.road!==M);T(O)});const b=At(i.project,M)?.points.length||0;i.select(b?{kind:"road",roadId:M}:{kind:null})}function N(M,z){i.commit("unweld point",w=>{for(const b of w.junctions||[])b.links=(b.links||[]).filter(O=>O.road!==M);T(w)}),u("Endpoint unwelded from its junction")}function B(M,z){i.commit(z?"enable intersection":"disable intersection",w=>{w.intersectionOverrides=w.intersectionOverrides||{},w.intersectionOverrides[M]={enabled:z}})}function k(M){const z=i.selection;if(M&&z.roadId){L(z.roadId);return}z.kind==="point"?S(z.roadId,z.index):z.kind==="road"?L(z.roadId):z.kind==="junction"&&(i.commit("delete junction",w=>{w.junctions=(w.junctions||[]).filter(b=>b.id!==z.junctionId)}),i.select({kind:null}),u("Junction removed — endpoints keep their positions"))}function F(M){i.commit("smooth grades",z=>{const w=At(z,M.id),b=w.points.map(O=>O.y);for(let O=0;O<2;O++){const U=b.slice();for(let I=1;I<b.length-1;I++)U[I]=(b[I-1]+b[I]*2+b[I+1])/4;for(let I=0;I<b.length;I++)b[I]=U[I]}w.points.forEach((O,U)=>{O.y=+b[U].toFixed(2)});for(const O of z.junctions||[])for(const U of O.links||[]){if(U.road!==w.id)continue;const I=U.end==="start"?0:w.points.length-1;w.points[I]&&(O.y=w.points[I].y)}}),u("Grades smoothed")}function G(M){const z=t.getTerrain();if(!z){u("Import a heightmap or grow demo hills first");return}i.commit("drape to terrain",w=>{const b=At(w,M.id);let O=0;b.points.forEach((U,I)=>{const X=z.sample(U.x,U.z);if(X==null)return;const q=+(X+(b.drapeOffset||0)).toFixed(2);Ji(w,b.id,I,void 0,void 0,q),O++}),u(O?`Draped ${O} point${O===1?"":"s"} to terrain`:"No points inside the terrain bounds")})}function H(M){i.commit("reverse direction",z=>{const w=At(z,M.id);w.points.reverse();for(const b of z.junctions||[])for(const O of b.links||[])O.road===w.id&&(O.end=O.end==="start"?"end":"start")})}function $(){n.innerHTML="";const M=Mt("div","panel-scroll",n),z=i.project;C(M,"project","Project","folder-open",w=>{Mt("div","ctl-label",w,"Name"),w.appendChild(x({value:z.name,onchange:O=>{i.project.name=O}}));const b=Mt("div","btn-row",w);v(b,"New","plus",()=>t.newProject()),v(b,"Open","upload",()=>e("file-road").click()),v(b,"Save","save",()=>t.saveProjectFile()),E(w,"Format","frontier-road-network · v1"),E(w,"Units","metres · Y-up"),E(w,"Autosave",t.autosaveNote())}),C(M,"roads",`Roads · ${z.roads.length}`,"route",w=>{z.roads.length||Mt("div","empty-note",w,"No roads yet.<br>Draw one on the plan (D).");for(const b of z.roads){const O=t.getSamples(b.id),U=Mt("div","road-item"+(i.selection.roadId===b.id?" sel":""),w);U.innerHTML=`<span class="dot" style="background:${b.color}"></span>
          <span class="meta"><span class="name">${b.name}${b.closed?'<span class="loop-tag">LOOP</span>':""}</span>
          <span class="sub">${O?Hr(O.length):"—"} · ${b.points.length} pts · ${b.lanes}×${Ne(b.laneWidth,1)} m</span></span>
          <span class="acts"></span>`,U.title="Click to select · double-click to rename",U.onclick=()=>i.select({kind:"road",roadId:b.id}),U.ondblclick=R=>{R.stopPropagation();const y=U.querySelector(".name"),W=b.name;y.innerHTML="";const K=Mt("input","",y);K.type="text",K.value=W,K.onclick=st=>st.stopPropagation(),K.onkeydown=st=>{st.stopPropagation(),st.key==="Enter"&&K.blur(),st.key==="Escape"&&(K.value=W,K.blur())},K.onchange=()=>{const st=K.value.trim()||W;st!==W?i.commit("rename road",it=>{At(it,b.id).name=st}):$()},K.focus(),K.select()};const I=U.querySelector(".acts"),X=Mt("button","mini-btn"+(b.visible===!1?" off":""),I,`<i data-lucide="${b.visible===!1?"eye-off":"eye"}"></i>`);X.title=b.visible===!1?"Show":"Hide",X.onclick=R=>{R.stopPropagation(),i.commit("toggle visibility",y=>{At(y,b.id).visible=b.visible===!1})};const q=Mt("button","mini-btn",I,'<i data-lucide="copy"></i>');q.title="Duplicate",q.onclick=R=>{R.stopPropagation(),_(b.id)};const nt=Mt("button","mini-btn",I,'<i data-lucide="trash-2"></i>');nt.title="Delete road",nt.onclick=R=>{R.stopPropagation(),L(b.id)}}v(w,"Draw a road","pen-line",()=>{const b=js(i.project,"r"),O=i.project.roads.length+1;i.commit("add road",U=>{U.roads.push(ts(b,O))}),i.select({kind:"road",roadId:b}),i.setTool("draw"),u("Click the plan to lay points · Enter finishes")},"primary")}),C(M,"intersections",`Intersections · ${t.getTopology().intersections.length}`,"network",w=>{const b=t.getTopology(),O=[...b.intersections,...b.disabled];!O.length&&!b.overpasses.length&&!b.bridges.length&&Mt("div","ctl-hint",w,"Cross roads at grade for a paved junction · separate heights for an overpass · flag points to span a bridge."),f(w,"Corner radius",{min:2,max:14,step:.5,unit:"m",value:z.settings?.cornerRadius??6,oninput:U=>{i.project.settings=i.project.settings||{},i.project.settings.cornerRadius=U}});for(const U of O){const I=b.disabled.includes(U),X=U.roads.map(R=>At(z,R)?.name||R).join(" × "),q=Mt("div","junc-item",w);I&&(q.style.opacity=".45"),q.innerHTML=`<span class="dia"></span><span class="meta"><span class="name">${Kc(U.kind)} <small>· ${U.legs.length} legs</small></span><span class="sub">${X}</span></span><span class="acts"></span>`,q.title="Click to zoom",q.onclick=()=>t.gotoPoint(U.x,U.z);const nt=Mt("button","mini-btn"+(I?" off":""),q.querySelector(".acts"),`<i data-lucide="${I?"eye-off":"eye"}"></i>`);nt.title=I?"Enable":"Disable (roads render uncut)",nt.onclick=R=>{R.stopPropagation(),B(U.id,I)}}for(const U of b.overpasses){const I=At(z,U.upper)?.name||U.upper,X=At(z,U.lower)?.name||U.lower,q=Mt("div","junc-item",w);q.innerHTML=`<span class="dia"></span><span class="meta"><span class="name">Overpass <small>· ${U.gap.toFixed(1)} m</small></span><span class="sub">${I} over ${X}</span></span><span class="acts"></span>`,q.title="Click to zoom",q.onclick=()=>t.gotoPoint(U.x,U.z);const nt=Mt("button","mini-btn",q.querySelector(".acts"),'<i data-lucide="landmark"></i>');nt.title="Build a bridge span over the lower road",nt.onclick=R=>{R.stopPropagation();const y=Zc(i.project,t.getSampleMap(),t.getTopology(),U.id);if(y.error){t.toast(y.error);return}i.commit("Bridge overpass",()=>{const W=At(i.project,y.roadId);for(const K of y.inserts)W.points.splice(Math.min(K.index,W.points.length),0,{...K.point});for(const K of y.flags)W.points[K]&&(W.points[K].bridge=!0)}),t.toast(`Bridge span planted on ${At(i.project,y.roadId)?.name||"road"}`)}}for(const U of b.bridges){const I=At(z,U.roadId),X=Mt("div","junc-item",w);X.innerHTML=`<span class="dia"></span><span class="meta"><span class="name">Bridge <small>· ${(U.s1-U.s0).toFixed(0)} m</small></span><span class="sub">${I?.name||U.roadId}</span></span>`,X.title="Click to zoom",X.onclick=()=>{const q=t.getSamples(U.roadId),nt=q&&_e(q.samples,(U.s0+U.s1)/2);nt&&t.gotoPoint(nt.x,nt.z)}}}),C(M,"terrain","Terrain","mountain",w=>{const b=t.getTerrain();if(!b)Mt("div","ctl-hint",w,"Flat world. Import a <b>heightmap PNG</b> (white = high) or grow <b>demo hills</b> to drape roads onto ground.");else if(E(w,"Source",b.name),E(w,"Grid",`${b.w} × ${b.h}`),E(w,"Height",`${Ne(b.minY,1)} … ${Ne(b.maxY,1)} m`),b.image){const U=Mt("img","hm-preview",w);U.src=b.image,U.alt="Heightmap preview"}const O=Mt("div","btn-row",w);v(O,"Import PNG","image",()=>e("file-height").click()),v(O,"Demo hills","mountain-snow",()=>t.makeDemoHills()),b&&v(w,"Remove terrain","trash-2",()=>t.clearTerrain())}),C(M,"junctions",`Junctions · ${(z.junctions||[]).length}`,"waypoints",w=>{(z.junctions||[]).length||Mt("div","ctl-hint",w,"Drag one road <b>endpoint</b> onto another — they weld into a shared junction node. <b>Both roads keep their own lanes and markings.</b>");for(const b of z.junctions||[]){const O=Mt("div","junc-item"+(i.selection.junctionId===b.id?" sel":""),w),U=(b.links||[]).map(I=>{const X=At(z,I.road);return X?`${X.name} ${I.end==="start"?"Ⓐ":"Ⓑ"}`:"?"}).join(" · ");O.innerHTML=`<span class="dia"></span><span class="meta"><span class="name">${b.name||b.id}</span><span class="sub">${U||"no links"}</span></span>`,O.onclick=()=>{i.select({kind:"junction",junctionId:b.id}),t.gotoPoint(b.x,b.z)}}}),C(M,"samples","Samples","flag",w=>{for(const b of o_){const O=Mt("button","sample-card",w,`<i data-lucide="milestone"></i><span><b>${b.name}</b><span>${b.sub}</span></span>`);O.onclick=()=>t.loadSample(b.key)}},{startOpen:!1}),C(M,"about","About","info",w=>{Mt("div","ctl-hint",w,"Spline centreline editor. Exports <b>.road.json</b> (reloadable), <b>.obj</b> mesh, <b>.csv</b> stations and <b>.png</b> captures. Engine loader lives in <b>integration/</b>.")},{startOpen:!1}),Ln()}function J(M,z){const w=t.getSamples(z.id);if(!w||!w.count){Mt("div","empty-note",M,"Add at least 2 points to sample this road.");return}E(M,"Length",Hr(w.length)),E(M,"Width",`${Ne(Wr(z),1)} m`),E(M,"Min radius",Number.isFinite(w.minRadius)?`${Ne(w.minRadius,1)} m`:"straight"),E(M,"Max grade",`${Ne((w.maxGrade||0)*100,1)}%`)}function lt(){s.innerHTML="";const M=Mt("div","panel-scroll",s),z=i.selection,w=i.project,b=z.roadId?At(w,z.roadId):null,O=t.getIssues();if(O.length){const U=O.filter(q=>q.severity==="error").length,I=O.filter(q=>q.severity==="warn").length;C(M,"issues",`Issues · ${U} errors ${I} warnings`,"triangle-alert",q=>{for(const nt of O.slice(0,30)){const R=Mt("div",`issue-row ${nt.severity}`,q,`<i data-lucide="${nt.severity==="error"?"octagon-x":nt.severity==="warn"?"triangle-alert":"info"}"></i><span><span class="msg">${nt.message}</span><br><span class="loc">${nt.x!=null?`(${Ne(nt.x,1)}, ${Ne(nt.z,1)})`:""}</span></span>`);R.onclick=()=>t.gotoIssue(nt)}O.length>30&&Mt("div","empty-note",q,`…and ${O.length-30} more`)}).sec.classList.add("alert")}if(!b){const U=z.kind==="junction"?(w.junctions||[]).find(I=>I.id===z.junctionId):null;U?C(M,"junc","Junction","waypoints",I=>{Mt("div","ctl-label",I,"Name"),I.appendChild(x({value:U.name||U.id,onchange:R=>{const y=i.project.junctions.find(W=>W.id===U.id);y&&(y.name=R)}}));const X=Mt("div","ctl-row",I);Mt("label","",X,"Position");const q=Mt("div","grow",X);q.style.cssText="display:flex;gap:6px;";for(const[R,y,W]of[["X","x","m"],["Z","z","m"],["Y","y","m"]]){const K=Mt("div","valuebox",q);K.style.flex="1",K.innerHTML=`<div class="axisseg">${R}</div><div class="num"><input type="number" step="0.5"></div>`;const st=K.querySelector("input");st.value=+U[y].toFixed(3);let it=!1;st.addEventListener("focus",()=>{i.checkpoint("move junction"),it=!0}),st.addEventListener("input",()=>{const Tt=parseFloat(st.value);Number.isFinite(Tt)&&i.transient(mt=>{const Dt=mt.junctions.find(Lt=>Lt.id===U.id);Dt&&(Dt[y]=Tt)})}),st.addEventListener("change",()=>{it&&(it=!1,i.endGesture())}),st.addEventListener("blur",()=>{it&&(it=!1,i.endGesture())}),st.addEventListener("keydown",Tt=>{Tt.key==="Enter"&&st.blur(),Tt.stopPropagation()})}Mt("div","ctl-label",I,`Links · ${U.links.length}`);for(const R of U.links||[]){const y=At(w,R.road);E(I,y?y.name:"(deleted)",R.end==="start"?"start Ⓐ":"end Ⓑ")}const nt=Mt("div","btn-row",I);v(nt,"Zoom to","crosshair",()=>t.gotoPoint(U.x,U.z)),v(nt,"Unweld all","unlink",()=>{i.commit("delete junction",R=>{R.junctions=R.junctions.filter(y=>y.id!==U.id)}),i.select({kind:null})},"danger")}):C(M,"none","Inspector","crosshair",I=>{Mt("div","empty-note",I,"Select a road, a control point, or a junction to edit it here."),Mt("div","ctl-hint",I,"<b>V</b> select · <b>D</b> draw · <b>Alt+click</b> insert point · <b>double-click</b> extend · <b>Del</b> remove.")}),Ln();return}if(C(M,"road","Road","route",U=>{Mt("div","ctl-label",U,"Name"),U.appendChild(x({value:b.name,onchange:I=>{At(i.project,b.id).name=I}})),P(U,"Colour",b.color,I=>{At(i.project,b.id).color=I}),d(U,"Visible",b.visible!==!1,I=>{At(i.project,b.id).visible=I},"eye"),d(U,"Closed loop",!!b.closed,I=>{const X=At(i.project,b.id);if(I&&X.points.length<3){u("A loop needs at least 3 points");return}if(X.closed=I,I){for(const q of i.project.junctions||[])q.links=(q.links||[]).filter(nt=>nt.road!==X.id);T(i.project)}},"refresh-ccw"),A(U,"Surface",kl.map(I=>({value:I,label:Ui[I].label})),b.surface,I=>{At(i.project,b.id).surface=I}),J(U,b)}),C(M,"xsec","Cross-section","spline",U=>{f(U,"Lanes",{min:1,max:6,step:1,unit:"",value:b.lanes,oninput:I=>{At(i.project,b.id).lanes=Math.round(I)}}),f(U,"Lane width",{min:2,max:6,step:.1,unit:"m",value:b.laneWidth,oninput:I=>{At(i.project,b.id).laneWidth=I}}),f(U,"Shoulder L",{min:0,max:6,step:.1,unit:"m",value:b.shoulderL,oninput:I=>{At(i.project,b.id).shoulderL=I}}),f(U,"Shoulder R",{min:0,max:6,step:.1,unit:"m",value:b.shoulderR,oninput:I=>{At(i.project,b.id).shoulderR=I}}),f(U,"Camber",{min:0,max:.3,step:.01,unit:"m",value:b.camber,oninput:I=>{At(i.project,b.id).camber=I}}),Mt("div","ctl-label",U,"Centre marking");{const I=Mt("div","ctl-row",U);Mt("label","",I,"Style");const X=Mt("div","segment",I);for(const[q,nt]of Object.entries(nd)){const R=Mt("div","seg-opt"+(b.centerMarking===q?" sel":""),X,nt);R.onclick=()=>{b.centerMarking!==q&&i.commit("set marking",y=>{At(y,b.id).centerMarking=q})}}}d(U,"Edge lines",!!b.edgeMarking,I=>{At(i.project,b.id).edgeMarking=I}),d(U,"Kerb left",!!b.kerbL,I=>{At(i.project,b.id).kerbL=I}),d(U,"Kerb right",!!b.kerbR,I=>{At(i.project,b.id).kerbR=I}),d(U,"Rail left",!!b.guardrailL,I=>{At(i.project,b.id).guardrailL=I}),d(U,"Rail right",!!b.guardrailR,I=>{At(i.project,b.id).guardrailR=I}),A(U,"Conform",[{value:"design",label:"Design heights",sub:"Ribbon follows control-point Y"},{value:"drape",label:"Drape to terrain",sub:"Ribbon hugs the heightfield"}],b.conform,I=>{At(i.project,b.id).conform=I}),f(U,"Drape lift",{min:-2,max:5,step:.05,unit:"m",value:b.drapeOffset,oninput:I=>{At(i.project,b.id).drapeOffset=I}})}),C(M,"structure","Structure","landmark",U=>{const I=t.getTopology().bridges.filter(nt=>nt.roadId===b.id),X=I.reduce((nt,R)=>nt+(R.s1-R.s0),0);E(U,"Bridge spans",I.length?`${I.length} · ${X.toFixed(0)} m deck`:"None — flag 2+ adjacent points"),A(U,"Parapet",[{value:"rail",label:"Steel rail",sub:"W-beam on posts"},{value:"wall",label:"Concrete wall",sub:"Parapet + steel band"}],b.bridgeParapet||"rail",nt=>{At(i.project,b.id).bridgeParapet=nt}),f(U,"Pier spacing",{min:4,max:30,step:1,unit:"m",value:b.bridgeSpacing||12,oninput:nt=>{At(i.project,b.id).bridgeSpacing=nt}});const q=Mt("div","btn-row",U);v(q,"Flag all","flag",()=>{i.commit("flag bridge span",nt=>{At(nt,b.id).points.forEach(R=>{R.bridge=!0})})}),v(q,"Clear","eraser",()=>{i.commit("clear bridge span",nt=>{At(nt,b.id).points.forEach(R=>{delete R.bridge})})})}),z.kind==="point"&&b.points[z.index]){const U=z.index,I=b.points[U],X=Sn(w,b.id,U),q=X||I;C(M,"point",`Point #${U+1}`,"circle-dot",nt=>{X&&Mt("div","ctl-hint",nt,`Welded to junction <b>${X.name||X.id}</b> — moving it moves every road on that node.`);const R=(K,st,it)=>{const Tt=Mt("div","ctl-row tight",nt);Mt("label","",Tt,K);const mt=Mt("div","grow",Tt),Dt=m({value:q[st],step:it,unit:"m",oninput:Lt=>Ji(i.project,b.id,U,st==="x"?Lt:void 0,st==="z"?Lt:void 0,st==="y"?Lt:void 0)});mt.appendChild(Dt.box)};R("X east","x",.5),R("Z south","z",.5),R("Y height","y",.25),f(nt,"Width ×",{min:.3,max:3,step:.05,unit:"×",value:I.w||1,oninput:K=>{At(i.project,b.id).points[U].w=K}}),d(nt,"Bridge deck",!!I.bridge,K=>{const st=At(i.project,b.id).points[U];K?st.bridge=!0:delete st.bridge});const y=Mt("div","btn-row",nt);v(y,"− Before","plus",()=>pt(b,U,-1)),v(y,"+ After","plus",()=>pt(b,U,1));const W=Mt("div","btn-row",nt);v(W,"Drape point","mountain",()=>{const K=t.getTerrain();if(!K){u("No terrain loaded");return}const st=K.sample(q.x,q.z);if(st==null){u("Point is outside the terrain bounds");return}i.commit("drape point",it=>{Ji(it,b.id,U,void 0,void 0,+(st+(b.drapeOffset||0)).toFixed(2))})}),X?v(W,"Unweld","unlink",()=>N(b.id),"danger"):v(W,"Delete","trash-2",()=>S(b.id,U),"danger")})}C(M,"vertical","Vertical","trending-up",U=>{const I=b.points.map(W=>W.y);I.length&&E(U,"Height range",`${Ne(Math.min(...I),1)} … ${Ne(Math.max(...I),1)} m`);const X=Mt("div","btn-row",U);v(X,"Smooth","trending-up",()=>F(b)),v(X,"Drape all","mountain",()=>G(b));const q=Mt("div","ctl-row",U);Mt("label","",q,"Flatten to");const nt=Mt("div","grow",q);nt.style.display="flex",nt.style.gap="6px";const R=m({value:I.length?I[0]:0,step:.5,unit:"m",oninput:()=>{}});nt.appendChild(R.box);const y=Mt("button","btn",nt,"Apply");y.style.cssText="width:auto;margin:0;padding:8px 14px;flex-shrink:0;",y.onclick=()=>{const W=parseFloat(R.input.value);Number.isFinite(W)&&i.commit("flatten heights",K=>{const st=At(K,b.id);st.points.forEach((it,Tt)=>Ji(K,st.id,Tt,void 0,void 0,W))})},v(U,"Reverse direction","arrow-up-down",()=>H(b))}),C(M,"actions","Road actions","flag",U=>{const I=Mt("div","btn-row",U);v(I,"Duplicate","copy",()=>_(b.id)),v(I,"Delete","trash-2",()=>L(b.id),"danger"),v(U,"Zoom to road","crosshair",()=>t.zoomRoad(b.id))},{startOpen:!1}),Ln()}function pt(M,z,w){const b=Pe(i.project,M),O=b.length,U=b[z];let I;if(w<0){if(I=z>0?b[z-1]:M.closed?b[O-1]:null,!I){u("Already at the start — double-click the plan to extend");return}}else if(I=z<O-1?b[z+1]:M.closed?b[0]:null,!I){u("Already at the end — double-click the plan to extend");return}const X=w<0?z:z+1;i.commit("insert point",q=>{At(q,M.id).points.splice(X,0,{x:+((U.x+I.x)/2).toFixed(3),z:+((U.z+I.z)/2).toFixed(3),y:+((U.y+I.y)/2).toFixed(2),w:1})}),i.select({kind:"point",roadId:M.id,index:X})}function Et(){const M=t.getTopology(),z={ix:M.intersections.length,over:M.overpasses.length,br:M.bridges.length},w=t.getSummary(),b=t.getIssues(),O=b.filter(q=>q.severity==="error").length,U=b.filter(q=>q.severity==="warn").length,I=Number.isFinite(w.minRadius)&&w.minRadius<7?"bad":Number.isFinite(w.minRadius)&&w.minRadius<15?"warnm":"",X=w.maxGrade>.12?"bad":w.maxGrade>.08?"warnm":"";r.innerHTML=`
      <div class="metric"><i data-lucide="ruler"></i><div><div class="mm-label">Total length</div><div class="mm-val">${Hr(w.length)}</div></div></div>
      <div class="metric"><i data-lucide="route"></i><div><div class="mm-label">Roads · Points</div><div class="mm-val">${w.roads} <small>· ${w.points} pts</small></div></div></div>
      <div class="metric ${I}"><i data-lucide="spline"></i><div><div class="mm-label">Min radius</div><div class="mm-val">${Number.isFinite(w.minRadius)?`${Ne(w.minRadius,1)} <small>m</small>`:"—"}</div></div></div>
      <div class="metric ${X}"><i data-lucide="trending-up"></i><div><div class="mm-label">Max grade</div><div class="mm-val">${Ne(w.maxGrade*100,1)} <small>%</small></div></div></div>
      <div class="metric"><i data-lucide="network"></i><div><div class="mm-label">Junctions</div><div class="mm-val">${z.ix} <small>· ${z.over} over · ${z.br} br</small></div></div></div>
      <div class="metric ${O?"bad":U?"warnm":""}"><i data-lucide="triangle-alert"></i><div><div class="mm-label">Validation</div><div class="mm-val">${O?`${O} <small>errors</small>`:U?`${U} <small>warnings</small>`:"<small>clean</small>"}</div></div></div>`,Ln()}const ot={select:"Drag points · Alt+click inserts · double-click extends · Del removes",draw:"Click to append · click first point to close · Enter finishes · Esc cancels",pan:"Drag to pan · wheel to zoom · F fits all"};function ft(M){const z=t.getIssues(),w=z.filter(U=>U.severity==="error").length,b=i.ui,O=[b.snapGrid?`GRID ${b.gridSize}m`:null,b.snapNode?"NODE":null].filter(Boolean).join(" · ")||"OFF";o.innerHTML=`
      <span class="stat"><i data-lucide="${i.tool==="draw"?"pen-line":i.tool==="pan"?"hand":"mouse-pointer-2"}"></i><b>${i.tool.toUpperCase()}</b></span>
      <div class="vf-sep"></div>
      <span class="hint">${ot[i.tool]}</span>
      <div class="vf-sep"></div>
      <span class="stat"><i data-lucide="crosshair"></i>${M?`<b>X ${Ne(M.x,1)}</b> · <b>Z ${Ne(M.z,1)}</b>`:"<b>—</b>"}</span>
      <div class="vf-sep"></div>
      <span class="stat"><i data-lucide="magnet"></i><b>${O}</b></span>
      <span class="spacer"></span>
      <span class="stat"><i data-lucide="triangle-alert"></i><b>${w?`${w} err`:`${z.length} issues`}</b></span>
      <div class="vf-sep"></div>
      <span class="stat">${i.dirty?"<b>● unsaved</b>":"<b>saved</b>"}</span>
      <span class="live"><span class="pulse"></span>Live</span>`,Ln()}function Ut(){e("project-name").textContent=i.project.name||"Untitled route",e("dirty-dot").hidden=!i.dirty,e("btn-undo").disabled=!i.canUndo(),e("btn-redo").disabled=!i.canRedo(),e("btn-undo").title=i.canUndo()?`Undo: ${i.undoLabel()} (Ctrl+Z)`:"Nothing to undo"}function Pt(){const M=i.view;e("stage").className=`stage view-${M}`,document.querySelectorAll("#view-seg button").forEach(z=>z.classList.toggle("sel",z.dataset.view===M)),e("view3d-wrap").hidden=M==="plan",requestAnimationFrame(()=>{t.plan.redraw(),t.preview.resize()})}function ct(){document.querySelectorAll("#plan-toolbar [data-tool]").forEach(z=>z.classList.toggle("sel",z.dataset.tool===i.tool));const M=i.ui;document.querySelectorAll("#plan-toolbar [data-snap]").forEach(z=>{const w=z.dataset.snap,b=w==="grid"?M.snapGrid:w==="node"?M.snapNode:M.showIssues;z.classList.toggle("sel",!!b)}),document.querySelectorAll("#td-toolbar [data-act]").forEach(z=>{const w=z.dataset.act;w==="wire"&&z.classList.toggle("sel",!!M.wireframe),w==="spin"&&z.classList.toggle("sel",!!M.autoRotate),w==="drive"&&z.classList.toggle("sel",t.preview.driving)})}function ut(M,z,w){e("drive-capsule").hidden=!M,M&&(e("drive-road").textContent=z||"—",St(w!==!1))}function St(M){const z=document.querySelector('#drive-capsule [data-d="play"]');z.innerHTML=`<i data-lucide="${M?"pause":"play"}"></i>`,z.title=M?"Pause (Space)":"Resume (Space)",Ln()}function V(){const M=(i.project.name||"route").replace(/[^\w-]+/g,"-").toLowerCase();ar(`${M}.road.json`,fd(i.project),"application/json"),i.markSaved(),u("Project JSON downloaded")}function j(){const M=t.getTerrain()?.sample||null,z=t.getSampleMap(),w=t.getTopology(),b=rd(i.project,{terrain:M,samples:z,topo:w}),O=(i.project.name||"route").replace(/[^\w-]+/g,"-").toLowerCase(),U=od(i.project,{terrain:M,samples:z,topo:w});ar(`${O}.obj`,U,"text/plain"),u(`OBJ exported · ${b.toLocaleString()} triangles · Y-up metres`)}function Q(){const M=(i.project.name||"route").replace(/[^\w-]+/g,"-").toLowerCase();ar(`${M}-centerlines.csv`,pd(i.project),"text/csv"),u("Centreline stations exported")}function dt(){document.querySelectorAll("#view-seg button").forEach(z=>z.onclick=()=>i.setView(z.dataset.view));const M=()=>t.plan?.drawing?(u("Finish the draw first — Enter keeps it, Esc cancels"),!0):!1;e("btn-undo").onclick=()=>{if(M())return;const z=i.undo();z&&u(`Undid ${z}`)},e("btn-redo").onclick=()=>{M()||i.redo()&&u("Redone")},e("btn-help").onclick=()=>{e("help").hidden=!1},e("help-close").onclick=()=>{e("help").hidden=!0},e("help").addEventListener("mousedown",z=>{z.target===e("help")&&(e("help").hidden=!0)}),e("btn-export").onclick=z=>{z.stopPropagation(),g(e("export-menu"),e("btn-export"),w=>{Mt("div","menu-cap",w,"Project"),p(w,{icon:"file-json",label:"Road project (.json)",sub:"Reloadable here + engine-readable",fn:V}),Mt("div","menu-sep",w),Mt("div","menu-cap",w,"Mesh + data"),p(w,{icon:"box",label:"Mesh (.obj)",sub:"Y-up metres, Terrain Lab convention",fn:j}),p(w,{icon:"table",label:"Centrelines (.csv)",sub:"Stations, headings, grades, radii",fn:Q}),Mt("div","menu-sep",w),Mt("div","menu-cap",w,"Captures"),p(w,{icon:"map",label:"Plan capture (.png)",fn:()=>t.plan.exportPNG("road-plan.png")}),p(w,{icon:"camera",label:"3D capture (.png)",fn:()=>t.preview.screenshot("road-3d.png")})})},document.querySelectorAll("#plan-toolbar [data-tool]").forEach(z=>z.onclick=()=>i.setTool(z.dataset.tool)),document.querySelectorAll("#plan-toolbar [data-snap]").forEach(z=>z.onclick=()=>{const w=z.dataset.snap;w==="grid"?i.setUI({snapGrid:!i.ui.snapGrid}):w==="node"?i.setUI({snapNode:!i.ui.snapNode}):i.setUI({showIssues:!i.ui.showIssues})}),document.querySelector('#plan-toolbar [data-act="fit"]').onclick=()=>t.plan.fitAll(),document.querySelectorAll("#td-toolbar [data-act]").forEach(z=>z.onclick=()=>{const w=z.dataset.act;w==="orbit"||w==="top"?(document.querySelector('#td-toolbar [data-act="orbit"]').classList.toggle("sel",w==="orbit"),document.querySelector('#td-toolbar [data-act="top"]').classList.toggle("sel",w==="top"),t.preview.resetCamera(w==="top")):w==="wire"?i.setUI({wireframe:!i.ui.wireframe}):w==="spin"?i.setUI({autoRotate:!i.ui.autoRotate}):w==="drive"?t.startDrive():w==="shot"?t.preview.screenshot("road-3d.png"):w==="reset"&&t.preview.resetCamera(!1)}),document.querySelectorAll("#drive-capsule [data-d]").forEach(z=>z.onclick=()=>{const w=z.dataset.d;w==="play"?St(t.preview.toggleDrivePlay()):w==="stop"?t.preview.stopDrive():(document.querySelectorAll("#drive-capsule [data-d]").forEach(b=>{["slow","cruise","fast"].includes(b.dataset.d)&&b.classList.toggle("sel",b===z)}),t.preview.setDriveSpeed(w==="slow"?8:w==="fast"?30:16))})}return dt(),Ln(),{renderLeft:$,renderInspector:lt,renderMetrics:Et,renderStatus:ft,refreshHeader:Ut,refreshView:Pt,refreshToolbars:ct,showDrive:ut,syncDrivePlay:St,toast:u,closeMenu:h,exportJSON:V,exportOBJ:j,exportCSV:Q,deleteSelection:k,deleteRoad:L,deletePoint:S}}const cn=new Map;let Dc=[],Ic={length:0,minRadius:1/0,maxGrade:0,points:0,roads:0},zo={intersections:[],disabled:[],overpasses:[],runs:new Map,bridges:[]},ti=null,Ll=0,Ci=null,Bo=null;function Uc(i=!1){cn.clear();let t=0;for(const e of Vt.project.roads){const n=Hi(Pe(Vt.project,e),{closed:e.closed,step:1});cn.set(e.id,n),t+=n.count}zo=Ho(Vt.project,cn),(!i||t<8e3)&&(Dc=td(Vt.project,zo)),Ic=ed(Vt.project,cn)}const Gr=Vc();let Qs=xd(),ko="";if(Gr)try{const{project:i,warnings:t}=$r(Gr.project);Qs=i,ko=`Restored autosave from ${new Date(Gr.at).toLocaleTimeString()}${t.length?` (${t.length} repaired)`:""}`}catch{}const Vt=Gc(Qs),Xe={plan:null,preview:null,getSamples:i=>cn.get(i)||null,getSampleMap:()=>cn,getTopology:()=>zo,getIssues:()=>Dc,getSummary:()=>Ic,getTerrain:()=>ti,autosaveNote:()=>Bo?`saved ${new Date(Bo).toLocaleTimeString()}`:"pending first edit",toast:i=>Ht.toast(i),newProject(){Vt.dirty&&!window.confirm("Discard unsaved changes and start a new project?")||(Ee.drawing&&Ee.finishDraw(!0),ti=null,Vt.loadProject(Vo("Untitled route")),Ee.fitAll(),Ht.toast("New project — draw roads with D"))},async openProjectFile(i){try{const t=await i.text(),{project:e,warnings:n}=$r(t);if(Vt.dirty&&!window.confirm(`Open “${i.name}”? Unsaved changes will be lost.`))return;Ee.drawing&&Ee.finishDraw(!0),await Il(e),Ee.fitAll(),Ht.toast(n.length?`Opened with ${n.length} repair${n.length===1?"":"s"} — first: ${n[0]}`:`Opened ${e.name}`)}catch(t){Ht.toast(`Open failed: ${t.message}`)}},saveProjectFile(){Ht.exportJSON()},async loadSample(i){if(!(Vt.dirty&&!window.confirm("Load a sample? Unsaved changes will be lost."))){Ee.drawing&&Ee.finishDraw(!0);try{const t=await fetch(`./samples/${i}.road.json`);if(!t.ok)throw new Error(`HTTP ${t.status}`);const{project:e,warnings:n}=$r(await t.text());await Il(e),Ee.fitAll(),Ht.toast(n.length?`Sample loaded (${n.length} repairs)`:`Sample loaded: ${e.name}`)}catch(t){Ht.toast(`Sample failed: ${t.message}`)}}},async importHeightFile(i){try{const t=await gd(i),e=await new Promise((h,g)=>{const p=new Image;p.onload=()=>h(p),p.onerror=()=>g(new Error("could not decode image")),p.src=t}),n=Dl()||{minX:-160,maxX:160,minZ:-160,maxZ:160},s=e.naturalHeight/Math.max(1,e.naturalWidth),r=(n.minX+n.maxX)/2,o=(n.minZ+n.maxZ)/2,a=Math.max(60,n.maxX-n.minX+80),l={minX:r-a/2,maxX:r+a/2,minZ:o-a*s/2,maxZ:o+a*s/2},c=await ql(t,{bounds:l,base:0,scale:30}),u={name:i.name.replace(/\.[^.]+$/,""),kind:"image",width:c.gridW,height:c.gridH,...l,base:0,scale:30,image:t};Vt.commit("import heightmap",h=>{h.heightmap=u}),es(c,u.name,"image",t),Ht.toast(`Heightmap on ${(l.maxX-l.minX).toFixed(0)}×${(l.maxZ-l.minZ).toFixed(0)} m · white = +30 m`),t.length>3e6&&Ht.toast("Note: embedded image is large — project JSON will be heavy")}catch(t){Ht.toast(`Heightmap failed: ${t.message}`)}},makeDemoHills(){const i=Dl()||{minX:-160,maxX:160,minZ:-160,maxZ:160},t=60,e={minX:i.minX-t,maxX:i.maxX+t,minZ:i.minZ-t,maxZ:i.maxZ+t},{grid:n,w:s,h:r}=Yl(e,128),o=$s(n,s,r,e,1);Vt.commit("grow demo hills",a=>{a.heightmap={name:"Demo hills",kind:"demo",width:s,height:r,...e,base:0,scale:1,image:null}}),es(o,"Demo hills","demo",null),Ht.toast("Demo hills grown — try Drape all on a road")},clearTerrain(){ti=null,Vt.commit("remove terrain",i=>{i.heightmap=null})},gotoIssue(i){i.roadId&&At(Vt.project,i.roadId)&&Vt.select({kind:"road",roadId:i.roadId}),i.x!=null&&(Vt.view==="td"&&Vt.setView("split"),Ee.centerOn(i.x,i.z,10),Vt.ping(i.x,i.z))},gotoPoint(i,t){Vt.view==="td"&&Vt.setView("split"),Ee.centerOn(i,t,10),Vt.ping(i,t)},zoomRoad(i){const t=cn.get(i);if(!t||!t.count)return;let e=1/0,n=-1/0,s=1/0,r=-1/0;for(const l of t.samples)l.x<e&&(e=l.x),l.x>n&&(n=l.x),l.z<s&&(s=l.z),l.z>r&&(r=l.z);const o=document.getElementById("plan").getBoundingClientRect(),a=Math.min((o.width-120)/Math.max(10,n-e),(o.height-120)/Math.max(10,r-s));Vt.view==="td"&&Vt.setView("split"),Ee.centerOn((e+n)/2,(s+r)/2,Math.min(60,Math.max(.5,a)))},startDrive(){const i=Vt.project;let t=Vt.selection.roadId&&At(i,Vt.selection.roadId)&&cn.get(Vt.selection.roadId)?.count?Vt.selection.roadId:null;if(!t){let e=0;for(const[n,s]of cn)s.length>e&&At(i,n)?.visible!==!1&&(e=s.length,t=n)}if(!t){Ht.toast("Draw a road first — nothing to drive");return}Vt.view==="plan"&&Vt.setView("td"),requestAnimationFrame(()=>{const e=At(Vt.project,t);hn.drive(t,16)&&(Ht.showDrive(!0,e?.name||t,!0),Ht.toast(`Driving ${e?.name||""} — Esc exits`))})}};function Dl(){let i=1/0,t=-1/0,e=1/0,n=-1/0,s=!1;for(const r of cn.values())for(const o of r.samples||[])s=!0,o.x<i&&(i=o.x),o.x>t&&(t=o.x),o.z<e&&(e=o.z),o.z>n&&(n=o.z);return s?{minX:i,maxX:t,minZ:e,maxZ:n}:null}function es(i,t,e,n){Ll++,ti={sample:i.sample,bounds:i.bounds,minY:i.minY,maxY:i.maxY,w:i.gridW,h:i.gridH,rev:Ll,name:t,kind:e,image:n||null},Vt.notify("project")}async function Nc(i){if(!i){ti=null;return}try{if(i.kind==="demo"){const{grid:t,w:e,h:n}=Yl({minX:i.minX,maxX:i.maxX,minZ:i.minZ,maxZ:i.maxZ},128);es($s(t,e,n,{minX:i.minX,maxX:i.maxX,minZ:i.minZ,maxZ:i.maxZ},1),i.name||"Demo hills","demo",null)}else if(i.image){const t=await ql(i.image,{bounds:{minX:i.minX,maxX:i.maxX,minZ:i.minZ,maxZ:i.maxZ},base:i.base||0,scale:i.scale||30});es(t,i.name||"heightmap","image",i.image)}else if(i.grid){const t=Float32Array.from(i.grid);es($s(t,i.width,i.height,{minX:i.minX,maxX:i.maxX,minZ:i.minZ,maxZ:i.maxZ},1),i.name||"heightmap","image",null)}else ti=null}catch(t){console.error(t),Ht.toast("Embedded heightmap could not be decoded — starting flat"),ti=null}}async function Il(i){Vt.loadProject(i),await Nc(i.heightmap),Vt.notify("project")}const Ee=vd(document.getElementById("plan"),Vt,{getSamples:Xe.getSamples,getIssues:Xe.getIssues,getTerrain:Xe.getTerrain,getTopology:Xe.getTopology,toast:i=>Ht.toast(i),onCursor:(i,t)=>{Ci=i==null?null:{x:i,z:t},Ht.renderStatus(Ci)}});Xe.plan=Ee;const hn=Xg(document.getElementById("view3d"),Vt,{getSamples:Xe.getSamples,getSampleMap:Xe.getSampleMap,getTopology:Xe.getTopology,getTerrain:Xe.getTerrain,toast:i=>Ht.toast(i),onDriveState:i=>{Ht.showDrive(i),Ht.refreshToolbars()}});Xe.preview=hn;const Ht=a_(Vt,Xe);let Ul=0,Nl=0;const Fl=()=>{clearTimeout(Ul),Ul=setTimeout(()=>hn.refresh(),140)},l_=()=>{clearTimeout(Nl),Nl=setTimeout(()=>{Vt.autosave()&&(Bo=Date.now(),Ht.renderLeft())},900)};Vt.subscribe(i=>{i==="project"||i==="project-live"?(Uc(i==="project-live"),Ee.redraw(),Ht.renderMetrics(),Ht.renderStatus(Ci),Fl(),i==="project"&&(Ht.renderLeft(),Ht.renderInspector(),Ht.refreshHeader(),l_())):i==="selection"?(Ht.renderLeft(),Ht.renderInspector(),Ht.renderStatus(Ci)):i==="tool"?(Ht.refreshToolbars(),Ht.renderStatus(Ci)):i==="view"?(Ht.refreshView(),Ht.refreshToolbars(),Vt.view==="plan"&&hn.driving&&hn.stopDrive(),Vt.view!=="plan"&&Fl()):i==="ui"?(Ht.refreshToolbars(),Ht.renderStatus(Ci)):i==="saved"&&Ht.refreshHeader()});document.getElementById("file-road").addEventListener("change",i=>{const t=i.target.files[0];i.target.value="",t&&Xe.openProjectFile(t)});document.getElementById("file-height").addEventListener("change",i=>{const t=i.target.files[0];i.target.value="",t&&Xe.importHeightFile(t)});window.addEventListener("keydown",i=>{const t=/^(input|textarea|select)$/i.test(i.target?.tagName||"")||i.target?.isContentEditable;if(hn.driving&&(i.code==="Space"||i.key==="Escape")){i.preventDefault(),i.code==="Space"?Ht.syncDrivePlay(hn.toggleDrivePlay()):hn.stopDrive();return}if(Ee.drawing&&((i.ctrlKey||i.metaKey)&&["z","y"].includes(i.key.toLowerCase())||!i.ctrlKey&&!i.metaKey&&(i.key==="Delete"||i.key==="Backspace"))){i.preventDefault(),Ht.toast("Finish the draw first — Enter keeps it, Esc cancels");return}if((i.ctrlKey||i.metaKey)&&i.key.toLowerCase()==="z"){if(i.preventDefault(),t&&i.target.blur(),i.shiftKey)Vt.redo()&&Ht.toast("Redone");else{const e=Vt.undo();e?Ht.toast(`Undid ${e}`):Ht.toast("Nothing to undo")}return}if((i.ctrlKey||i.metaKey)&&i.key.toLowerCase()==="y"){i.preventDefault(),Vt.redo()&&Ht.toast("Redone");return}if((i.ctrlKey||i.metaKey)&&i.key.toLowerCase()==="s"){i.preventDefault(),Ht.exportJSON();return}if(!t){if(i.key==="Escape"){Ht.closeMenu(),document.getElementById("help").hidden=!0;return}switch(i.key.toLowerCase()){case"v":Vt.setTool("select");break;case"d":Vt.setTool("draw");break;case"h":Vt.setTool("pan");break;case"f":Ee.fitAll();break;case"1":Vt.setView("plan");break;case"2":Vt.setView("split");break;case"3":Vt.setView("td");break;case"?":document.getElementById("help").hidden=!1;break;case"delete":case"backspace":i.preventDefault(),Ht.deleteSelection?.(i.shiftKey);break}}});window.addEventListener("beforeunload",i=>{Vt.dirty&&i.preventDefault()});Uc();Ht.renderLeft();Ht.renderInspector();Ht.renderMetrics();Ht.renderStatus(null);Ht.refreshHeader();Ht.refreshView();Ht.refreshToolbars();requestAnimationFrame(()=>{Ee.fitAll(),hn.refresh(),hn.resetCamera(!1)});(async()=>(Qs.heightmap&&await Nc(Qs.heightmap),ko&&Ht.toast(ko)))();
