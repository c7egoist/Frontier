(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e={LEFT:0,MIDDLE:1,RIGHT:2,ROTATE:0,DOLLY:1,PAN:2},t={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},n=1e3,r=1001,i=1002,a=1003,o=1004,s=1005,c=1006,l=1007,u=1008,d=1009,f=1010,p=1011,m=1012,h=1013,g=1014,_=1015,v=1016,y=1017,b=1018,x=1020,S=35902,C=35899,w=1021,T=1022,E=1023,D=1026,O=1027,k=1028,A=1029,j=1030,M=1031,N=1033,P=33776,F=33777,I=33778,L=33779,R=35840,ee=35841,te=35842,z=35843,ne=36196,re=37492,B=37496,V=37488,H=37489,ie=37490,ae=37491,oe=37808,se=37809,ce=37810,le=37811,ue=37812,de=37813,U=37814,fe=37815,pe=37816,me=37817,he=37818,ge=37819,_e=37820,ve=37821,ye=36492,be=36494,xe=36495,Se=36283,Ce=36284,we=36285,W=36286,Te=2300,Ee=2301,De=2302,G=2303,Oe=2400,K=2401,ke=2402,Ae=3200,je=3201,Me=`srgb`,Ne=`srgb-linear`,Pe=`linear`,Fe=`srgb`,Ie=7680,Le=35044,Re=2e3;function ze(e){for(let t=e.length-1;t>=0;--t)if(e[t]>=65535)return!0;return!1}function Be(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function Ve(e){return document.createElementNS(`http://www.w3.org/1999/xhtml`,e)}function He(){let e=Ve(`canvas`);return e.style.display=`block`,e}var Ue={};function We(...e){let t=`THREE.`+e.shift();console.log(t,...e)}function Ge(e){let t=e[0];if(typeof t==`string`&&t.startsWith(`TSL:`)){let t=e[1];t&&t.isStackTrace?e[0]+=` `+t.getLocation():e[1]=`Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.`}return e}function Ke(...e){e=Ge(e);let t=`THREE.`+e.shift();{let n=e[0];n&&n.isStackTrace?console.warn(n.getError(t)):console.warn(t,...e)}}function qe(...e){e=Ge(e);let t=`THREE.`+e.shift();{let n=e[0];n&&n.isStackTrace?console.error(n.getError(t)):console.error(t,...e)}}function Je(...e){let t=e.join(` `);t in Ue||(Ue[t]=!0,Ke(...e))}function Ye(e,t,n){return new Promise(function(r,i){function a(){switch(e.clientWaitSync(t,e.SYNC_FLUSH_COMMANDS_BIT,0)){case e.WAIT_FAILED:i();break;case e.TIMEOUT_EXPIRED:setTimeout(a,n);break;default:r()}}setTimeout(a,n)})}var Xe={0:1,2:6,4:7,3:5,1:0,6:2,7:4,5:3},Ze=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){let n=this._listeners;return n!==void 0&&n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){let n=this._listeners;if(n===void 0)return;let r=n[e];if(r!==void 0){let e=r.indexOf(t);e!==-1&&r.splice(e,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let n=t[e.type];if(n!==void 0){e.target=this;let t=n.slice(0);for(let n=0,r=t.length;n<r;n++)t[n].call(this,e);e.target=null}}},Qe=`00.01.02.03.04.05.06.07.08.09.0a.0b.0c.0d.0e.0f.10.11.12.13.14.15.16.17.18.19.1a.1b.1c.1d.1e.1f.20.21.22.23.24.25.26.27.28.29.2a.2b.2c.2d.2e.2f.30.31.32.33.34.35.36.37.38.39.3a.3b.3c.3d.3e.3f.40.41.42.43.44.45.46.47.48.49.4a.4b.4c.4d.4e.4f.50.51.52.53.54.55.56.57.58.59.5a.5b.5c.5d.5e.5f.60.61.62.63.64.65.66.67.68.69.6a.6b.6c.6d.6e.6f.70.71.72.73.74.75.76.77.78.79.7a.7b.7c.7d.7e.7f.80.81.82.83.84.85.86.87.88.89.8a.8b.8c.8d.8e.8f.90.91.92.93.94.95.96.97.98.99.9a.9b.9c.9d.9e.9f.a0.a1.a2.a3.a4.a5.a6.a7.a8.a9.aa.ab.ac.ad.ae.af.b0.b1.b2.b3.b4.b5.b6.b7.b8.b9.ba.bb.bc.bd.be.bf.c0.c1.c2.c3.c4.c5.c6.c7.c8.c9.ca.cb.cc.cd.ce.cf.d0.d1.d2.d3.d4.d5.d6.d7.d8.d9.da.db.dc.dd.de.df.e0.e1.e2.e3.e4.e5.e6.e7.e8.e9.ea.eb.ec.ed.ee.ef.f0.f1.f2.f3.f4.f5.f6.f7.f8.f9.fa.fb.fc.fd.fe.ff`.split(`.`),$e=1234567,et=Math.PI/180,tt=180/Math.PI;function nt(){let e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0,r=Math.random()*4294967295|0;return(Qe[e&255]+Qe[e>>8&255]+Qe[e>>16&255]+Qe[e>>24&255]+`-`+Qe[t&255]+Qe[t>>8&255]+`-`+Qe[t>>16&15|64]+Qe[t>>24&255]+`-`+Qe[n&63|128]+Qe[n>>8&255]+`-`+Qe[n>>16&255]+Qe[n>>24&255]+Qe[r&255]+Qe[r>>8&255]+Qe[r>>16&255]+Qe[r>>24&255]).toLowerCase()}function rt(e,t,n){return Math.max(t,Math.min(n,e))}function it(e,t){return(e%t+t)%t}function at(e,t,n,r,i){return r+(e-t)*(i-r)/(n-t)}function ot(e,t,n){return e===t?0:(n-e)/(t-e)}function st(e,t,n){return(1-n)*e+n*t}function ct(e,t,n,r){return st(e,t,1-Math.exp(-n*r))}function lt(e,t=1){return t-Math.abs(it(e,t*2)-t)}function ut(e,t,n){return e<=t?0:e>=n?1:(e=(e-t)/(n-t),e*e*(3-2*e))}function dt(e,t,n){return e<=t?0:e>=n?1:(e=(e-t)/(n-t),e*e*e*(e*(e*6-15)+10))}function ft(e,t){return e+Math.floor(Math.random()*(t-e+1))}function pt(e,t){return e+Math.random()*(t-e)}function mt(e){return e*(.5-Math.random())}function ht(e){e!==void 0&&($e=e);let t=$e+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function gt(e){return e*et}function _t(e){return e*tt}function vt(e){return!(e&e-1)&&e!==0}function yt(e){return 2**Math.ceil(Math.log(e)/Math.LN2)}function bt(e){return 2**Math.floor(Math.log(e)/Math.LN2)}function xt(e,t,n,r,i){let a=Math.cos,o=Math.sin,s=a(n/2),c=o(n/2),l=a((t+r)/2),u=o((t+r)/2),d=a((t-r)/2),f=o((t-r)/2),p=a((r-t)/2),m=o((r-t)/2);switch(i){case`XYX`:e.set(s*u,c*d,c*f,s*l);break;case`YZY`:e.set(c*f,s*u,c*d,s*l);break;case`ZXZ`:e.set(c*d,c*f,s*u,s*l);break;case`XZX`:e.set(s*u,c*m,c*p,s*l);break;case`YXY`:e.set(c*p,s*u,c*m,s*l);break;case`ZYZ`:e.set(c*m,c*p,s*u,s*l);break;default:Ke(`MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: `+i)}}function St(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return e/4294967295;case Uint16Array:return e/65535;case Uint8Array:return e/255;case Int32Array:return Math.max(e/2147483647,-1);case Int16Array:return Math.max(e/32767,-1);case Int8Array:return Math.max(e/127,-1);default:throw Error(`THREE.MathUtils: Invalid component type.`)}}function Ct(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return Math.round(e*4294967295);case Uint16Array:return Math.round(e*65535);case Uint8Array:return Math.round(e*255);case Int32Array:return Math.round(e*2147483647);case Int16Array:return Math.round(e*32767);case Int8Array:return Math.round(e*127);default:throw Error(`THREE.MathUtils: Invalid component type.`)}}var wt={DEG2RAD:et,RAD2DEG:tt,generateUUID:nt,clamp:rt,euclideanModulo:it,mapLinear:at,inverseLerp:ot,lerp:st,damp:ct,pingpong:lt,smoothstep:ut,smootherstep:dt,randInt:ft,randFloat:pt,randFloatSpread:mt,seededRandom:ht,degToRad:gt,radToDeg:_t,isPowerOfTwo:vt,ceilPowerOfTwo:yt,floorPowerOfTwo:bt,setQuaternionFromProperEuler:xt,normalize:Ct,denormalize:St},Tt=class e{static{e.prototype.isVector2=!0}constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw Error(`THREE.Vector2: index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw Error(`THREE.Vector2: index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6],this.y=r[1]*t+r[4]*n+r[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=rt(this.x,e.x,t.x),this.y=rt(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=rt(this.x,e,t),this.y=rt(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(rt(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(rt(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),r=Math.sin(t),i=this.x-e.x,a=this.y-e.y;return this.x=i*n-a*r+e.x,this.y=i*r+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},Et=class{constructor(e=0,t=0,n=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=r}static slerpFlat(e,t,n,r,i,a,o){let s=n[r+0],c=n[r+1],l=n[r+2],u=n[r+3],d=i[a+0],f=i[a+1],p=i[a+2],m=i[a+3];if(u!==m||s!==d||c!==f||l!==p){let e=s*d+c*f+l*p+u*m;e<0&&(d=-d,f=-f,p=-p,m=-m,e=-e);let t=1-o;if(e<.9995){let n=Math.acos(e),r=Math.sin(n);t=Math.sin(t*n)/r,o=Math.sin(o*n)/r,s=s*t+d*o,c=c*t+f*o,l=l*t+p*o,u=u*t+m*o}else{s=s*t+d*o,c=c*t+f*o,l=l*t+p*o,u=u*t+m*o;let e=1/Math.sqrt(s*s+c*c+l*l+u*u);s*=e,c*=e,l*=e,u*=e}}e[t]=s,e[t+1]=c,e[t+2]=l,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,r,i,a){let o=n[r],s=n[r+1],c=n[r+2],l=n[r+3],u=i[a],d=i[a+1],f=i[a+2],p=i[a+3];return e[t]=o*p+l*u+s*f-c*d,e[t+1]=s*p+l*d+c*u-o*f,e[t+2]=c*p+l*f+o*d-s*u,e[t+3]=l*p-o*u-s*d-c*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,r){return this._x=e,this._y=t,this._z=n,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,r=e._y,i=e._z,a=e._order,o=Math.cos,s=Math.sin,c=o(n/2),l=o(r/2),u=o(i/2),d=s(n/2),f=s(r/2),p=s(i/2);switch(a){case`XYZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`YXZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`ZXY`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`ZYX`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`YZX`:this._x=d*l*u+c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u-d*f*p;break;case`XZY`:this._x=d*l*u-c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u+d*f*p;break;default:Ke(`Quaternion: .setFromEuler() encountered an unknown order: `+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,r=Math.sin(n);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],r=t[4],i=t[8],a=t[1],o=t[5],s=t[9],c=t[2],l=t[6],u=t[10],d=n+o+u;if(d>0){let e=.5/Math.sqrt(d+1);this._w=.25/e,this._x=(l-s)*e,this._y=(i-c)*e,this._z=(a-r)*e}else if(n>o&&n>u){let e=2*Math.sqrt(1+n-o-u);this._w=(l-s)/e,this._x=.25*e,this._y=(r+a)/e,this._z=(i+c)/e}else if(o>u){let e=2*Math.sqrt(1+o-n-u);this._w=(i-c)/e,this._x=(r+a)/e,this._y=.25*e,this._z=(s+l)/e}else{let e=2*Math.sqrt(1+u-n-o);this._w=(a-r)/e,this._x=(i+c)/e,this._y=(s+l)/e,this._z=.25*e}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(rt(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let r=Math.min(1,t/n);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x*=e,this._y*=e,this._z*=e,this._w*=e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,r=e._y,i=e._z,a=e._w,o=t._x,s=t._y,c=t._z,l=t._w;return this._x=n*l+a*o+r*c-i*s,this._y=r*l+a*s+i*o-n*c,this._z=i*l+a*c+n*s-r*o,this._w=a*l-n*o-r*s-i*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,r=e._y,i=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,r=-r,i=-i,a=-a,o=-o);let s=1-t;if(o<.9995){let e=Math.acos(o),c=Math.sin(e);s=Math.sin(s*e)/c,t=Math.sin(t*e)/c,this._x=this._x*s+n*t,this._y=this._y*s+r*t,this._z=this._z*s+i*t,this._w=this._w*s+a*t,this._onChangeCallback()}else this._x=this._x*s+n*t,this._y=this._y*s+r*t,this._z=this._z*s+i*t,this._w=this._w*s+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),r=Math.sqrt(1-n),i=Math.sqrt(n);return this.set(r*Math.sin(e),r*Math.cos(e),i*Math.sin(t),i*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},q=class e{static{e.prototype.isVector3=!0}constructor(e=0,t=0,n=0){this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw Error(`THREE.Vector3: index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw Error(`THREE.Vector3: index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Ot.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Ot.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6]*r,this.y=i[1]*t+i[4]*n+i[7]*r,this.z=i[2]*t+i[5]*n+i[8]*r,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=e.elements,a=1/(i[3]*t+i[7]*n+i[11]*r+i[15]);return this.x=(i[0]*t+i[4]*n+i[8]*r+i[12])*a,this.y=(i[1]*t+i[5]*n+i[9]*r+i[13])*a,this.z=(i[2]*t+i[6]*n+i[10]*r+i[14])*a,this}applyQuaternion(e){let t=this.x,n=this.y,r=this.z,i=e.x,a=e.y,o=e.z,s=e.w,c=2*(a*r-o*n),l=2*(o*t-i*r),u=2*(i*n-a*t);return this.x=t+s*c+a*u-o*l,this.y=n+s*l+o*c-i*u,this.z=r+s*u+i*l-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[4]*n+i[8]*r,this.y=i[1]*t+i[5]*n+i[9]*r,this.z=i[2]*t+i[6]*n+i[10]*r,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=rt(this.x,e.x,t.x),this.y=rt(this.y,e.y,t.y),this.z=rt(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=rt(this.x,e,t),this.y=rt(this.y,e,t),this.z=rt(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(rt(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,r=e.y,i=e.z,a=t.x,o=t.y,s=t.z;return this.x=r*s-i*o,this.y=i*a-n*s,this.z=n*o-r*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return Dt.copy(this).projectOnVector(e),this.sub(Dt)}reflect(e){return this.sub(Dt.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(rt(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,r=this.z-e.z;return t*t+n*n+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let r=Math.sin(t)*e;return this.x=r*Math.sin(n),this.y=Math.cos(t)*e,this.z=r*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=r,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Dt=new q,Ot=new Et,kt=class e{static{e.prototype.isMatrix3=!0}constructor(e,t,n,r,i,a,o,s,c){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,r,i,a,o,s,c)}set(e,t,n,r,i,a,o,s,c){let l=this.elements;return l[0]=e,l[1]=r,l[2]=o,l[3]=t,l[4]=i,l[5]=s,l[6]=n,l[7]=a,l[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[3],s=n[6],c=n[1],l=n[4],u=n[7],d=n[2],f=n[5],p=n[8],m=r[0],h=r[3],g=r[6],_=r[1],v=r[4],y=r[7],b=r[2],x=r[5],S=r[8];return i[0]=a*m+o*_+s*b,i[3]=a*h+o*v+s*x,i[6]=a*g+o*y+s*S,i[1]=c*m+l*_+u*b,i[4]=c*h+l*v+u*x,i[7]=c*g+l*y+u*S,i[2]=d*m+f*_+p*b,i[5]=d*h+f*v+p*x,i[8]=d*g+f*y+p*S,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8];return t*a*l-t*o*c-n*i*l+n*o*s+r*i*c-r*a*s}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=l*a-o*c,d=o*s-l*i,f=c*i-a*s,p=t*u+n*d+r*f;if(p===0)return this.set(0,0,0,0,0,0,0,0,0);let m=1/p;return e[0]=u*m,e[1]=(r*c-l*n)*m,e[2]=(o*n-r*a)*m,e[3]=d*m,e[4]=(l*t-r*s)*m,e[5]=(r*i-o*t)*m,e[6]=f*m,e[7]=(n*s-c*t)*m,e[8]=(a*t-n*i)*m,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,r,i,a,o){let s=Math.cos(i),c=Math.sin(i);return this.set(n*s,n*c,-n*(s*a+c*o)+a+e,-r*c,r*s,-r*(-c*a+s*o)+o+t,0,0,1),this}scale(e,t){return Je(`Matrix3: .scale() is deprecated. Use .makeScale() instead.`),this.premultiply(At.makeScale(e,t)),this}rotate(e){return Je(`Matrix3: .rotate() is deprecated. Use .makeRotation() instead.`),this.premultiply(At.makeRotation(-e)),this}translate(e,t){return Je(`Matrix3: .translate() is deprecated. Use .makeTranslation() instead.`),this.premultiply(At.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<9;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},At=new kt,jt=new kt().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Mt=new kt().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Nt(){let e={enabled:!0,workingColorSpace:Ne,spaces:{},convert:function(e,t,n){return this.enabled===!1||t===n||!t||!n?e:(this.spaces[t].transfer===`srgb`&&(e.r=Ft(e.r),e.g=Ft(e.g),e.b=Ft(e.b)),this.spaces[t].primaries!==this.spaces[n].primaries&&(e.applyMatrix3(this.spaces[t].toXYZ),e.applyMatrix3(this.spaces[n].fromXYZ)),this.spaces[n].transfer===`srgb`&&(e.r=It(e.r),e.g=It(e.g),e.b=It(e.b)),e)},workingToColorSpace:function(e,t){return this.convert(e,this.workingColorSpace,t)},colorSpaceToWorking:function(e,t){return this.convert(e,t,this.workingColorSpace)},getPrimaries:function(e){return this.spaces[e].primaries},getTransfer:function(e){return e===``?Pe:this.spaces[e].transfer},getToneMappingMode:function(e){return this.spaces[e].outputColorSpaceConfig.toneMappingMode||`standard`},getLuminanceCoefficients:function(e,t=this.workingColorSpace){return e.fromArray(this.spaces[t].luminanceCoefficients)},define:function(e){Object.assign(this.spaces,e)},_getMatrix:function(e,t,n){return e.copy(this.spaces[t].toXYZ).multiply(this.spaces[n].fromXYZ)},_getDrawingBufferColorSpace:function(e){return this.spaces[e].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(e=this.workingColorSpace){return this.spaces[e].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(t,n){return Je(`ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace().`),e.workingToColorSpace(t,n)},toWorkingColorSpace:function(t,n){return Je(`ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking().`),e.colorSpaceToWorking(t,n)}},t=[.64,.33,.3,.6,.15,.06],n=[.2126,.7152,.0722],r=[.3127,.329];return e.define({[Ne]:{primaries:t,whitePoint:r,transfer:Pe,toXYZ:jt,fromXYZ:Mt,luminanceCoefficients:n,workingColorSpaceConfig:{unpackColorSpace:Me},outputColorSpaceConfig:{drawingBufferColorSpace:Me}},[Me]:{primaries:t,whitePoint:r,transfer:Fe,toXYZ:jt,fromXYZ:Mt,luminanceCoefficients:n,outputColorSpaceConfig:{drawingBufferColorSpace:Me}}}),e}var Pt=Nt();function Ft(e){return e<.04045?e*.0773993808:(e*.9478672986+.0521327014)**2.4}function It(e){return e<.0031308?e*12.92:1.055*e**.41666-.055}var Lt,Rt=class{static getDataURL(e,t=`image/png`){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>`u`)return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{Lt===void 0&&(Lt=Ve(`canvas`)),Lt.width=e.width,Lt.height=e.height;let t=Lt.getContext(`2d`);e instanceof ImageData?t.putImageData(e,0,0):t.drawImage(e,0,0,e.width,e.height),n=Lt}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap){let t=Ve(`canvas`);t.width=e.width,t.height=e.height;let n=t.getContext(`2d`);n.drawImage(e,0,0,e.width,e.height);let r=n.getImageData(0,0,e.width,e.height),i=r.data;for(let e=0;e<i.length;e++)i[e]=Ft(i[e]/255)*255;return n.putImageData(r,0,0),t}if(e.data){let t=e.data.slice(0);for(let e=0;e<t.length;e++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[e]=Math.floor(Ft(t[e]/255)*255):t[e]=Ft(t[e]);return{data:t,width:e.width,height:e.height}}return Ke(`ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.`),e}},zt=0,Bt=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:zt++}),this.uuid=nt(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return typeof HTMLVideoElement<`u`&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<`u`&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t===null?e.set(0,0,0):e.set(t.width,t.height,t.depth||0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:``},r=this.data;if(r!==null){let e;if(Array.isArray(r)){e=[];for(let t=0,n=r.length;t<n;t++)r[t].isDataTexture?e.push(Vt(r[t].image)):e.push(Vt(r[t]))}else e=Vt(r);n.url=e}return t||(e.images[this.uuid]=n),n}};function Vt(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap?Rt.getDataURL(e):e.data?{data:Array.from(e.data),width:e.width,height:e.height,type:e.data.constructor.name}:(Ke(`Texture: Unable to serialize Texture.`),{})}var Ht=0,Ut=new q,Wt=class e extends Ze{constructor(t=e.DEFAULT_IMAGE,n=e.DEFAULT_MAPPING,i=r,a=r,o=c,s=u,l=E,f=d,p=e.DEFAULT_ANISOTROPY,m=``){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Ht++}),this.uuid=nt(),this.name=``,this.source=new Bt(t),this.mipmaps=[],this.mapping=n,this.channel=0,this.wrapS=i,this.wrapT=a,this.magFilter=o,this.minFilter=s,this.anisotropy=p,this.format=l,this.internalFormat=null,this.type=f,this.offset=new Tt(0,0),this.repeat=new Tt(1,1),this.center=new Tt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new kt,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=m,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(Ut).x}get height(){return this.source.getSize(Ut).y}get depth(){return this.source.getSize(Ut).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let n=e[t];if(n===void 0){Ke(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){Ke(`Texture.setValues(): property '${t}' does not exist.`);continue}r&&n&&r.isVector2&&n.isVector2||r&&n&&r.isVector3&&n.isVector3||r&&n&&r.isMatrix3&&n.isMatrix3?r.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.7,type:`Texture`,generator:`Texture.toJSON`},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:`dispose`})}transformUv(e){if(this.mapping!==300)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case n:e.x-=Math.floor(e.x);break;case r:e.x=e.x<0?0:1;break;case i:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x-=Math.floor(e.x)}if(e.y<0||e.y>1)switch(this.wrapT){case n:e.y-=Math.floor(e.y);break;case r:e.y=e.y<0?0:1;break;case i:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y-=Math.floor(e.y)}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};Wt.DEFAULT_IMAGE=null,Wt.DEFAULT_MAPPING=300,Wt.DEFAULT_ANISOTROPY=1;var Gt=class e{static{e.prototype.isVector4=!0}constructor(e=0,t=0,n=0,r=1){this.x=e,this.y=t,this.z=n,this.w=r}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,r){return this.x=e,this.y=t,this.z=n,this.w=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw Error(`THREE.Vector4: index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw Error(`THREE.Vector4: index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w===void 0?1:e.w,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*r+a[12]*i,this.y=a[1]*t+a[5]*n+a[9]*r+a[13]*i,this.z=a[2]*t+a[6]*n+a[10]*r+a[14]*i,this.w=a[3]*t+a[7]*n+a[11]*r+a[15]*i,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,r,i,a=.01,o=.1,s=e.elements,c=s[0],l=s[4],u=s[8],d=s[1],f=s[5],p=s[9],m=s[2],h=s[6],g=s[10];if(Math.abs(l-d)<a&&Math.abs(u-m)<a&&Math.abs(p-h)<a){if(Math.abs(l+d)<o&&Math.abs(u+m)<o&&Math.abs(p+h)<o&&Math.abs(c+f+g-3)<o)return this.set(1,0,0,0),this;t=Math.PI;let e=(c+1)/2,s=(f+1)/2,_=(g+1)/2,v=(l+d)/4,y=(u+m)/4,b=(p+h)/4;return e>s&&e>_?e<a?(n=0,r=.707106781,i=.707106781):(n=Math.sqrt(e),r=v/n,i=y/n):s>_?s<a?(n=.707106781,r=0,i=.707106781):(r=Math.sqrt(s),n=v/r,i=b/r):_<a?(n=.707106781,r=.707106781,i=0):(i=Math.sqrt(_),n=y/i,r=b/i),this.set(n,r,i,t),this}let _=Math.sqrt((h-p)*(h-p)+(u-m)*(u-m)+(d-l)*(d-l));return Math.abs(_)<.001&&(_=1),this.x=(h-p)/_,this.y=(u-m)/_,this.z=(d-l)/_,this.w=Math.acos((c+f+g-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=rt(this.x,e.x,t.x),this.y=rt(this.y,e.y,t.y),this.z=rt(this.z,e.z,t.z),this.w=rt(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=rt(this.x,e,t),this.y=rt(this.y,e,t),this.z=rt(this.z,e,t),this.w=rt(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(rt(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},Kt=class extends Ze{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:c,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new Gt(0,0,e,t),this.scissorTest=!1,this.viewport=new Gt(0,0,e,t),this.textures=[];let r=new Wt({width:e,height:t,depth:n.depth}),i=n.count;for(let e=0;e<i;e++)this.textures[e]=r.clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(e={}){let t={minFilter:c,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let e=0;e<this.textures.length;e++)this.textures[e].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let r=0,i=this.textures.length;r<i;r++)this.textures[r].image.width=e,this.textures[r].image.height=t,this.textures[r].image.depth=n,this.textures[r].isData3DTexture!==!0&&(this.textures[r].isArrayTexture=this.textures[r].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let n=Object.assign({},e.textures[t].image);this.textures[t].source=new Bt(n)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:`dispose`})}},qt=class extends Kt{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},Jt=class extends Wt{constructor(e=null,t=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=a,this.minFilter=a,this.wrapR=r,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}},Yt=class extends Wt{constructor(e=null,t=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=a,this.minFilter=a,this.wrapR=r,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},Xt=class e{static{e.prototype.isMatrix4=!0}constructor(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h)}set(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h){let g=this.elements;return g[0]=e,g[4]=t,g[8]=n,g[12]=r,g[1]=i,g[5]=a,g[9]=o,g[13]=s,g[2]=c,g[6]=l,g[10]=u,g[14]=d,g[3]=f,g[7]=p,g[11]=m,g[15]=h,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new e().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();let t=this.elements,n=e.elements,r=1/Zt.setFromMatrixColumn(e,0).length(),i=1/Zt.setFromMatrixColumn(e,1).length(),a=1/Zt.setFromMatrixColumn(e,2).length();return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=0,t[4]=n[4]*i,t[5]=n[5]*i,t[6]=n[6]*i,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,r=e.y,i=e.z,a=Math.cos(n),o=Math.sin(n),s=Math.cos(r),c=Math.sin(r),l=Math.cos(i),u=Math.sin(i);if(e.order===`XYZ`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=-s*u,t[8]=c,t[1]=n+r*c,t[5]=e-i*c,t[9]=-o*s,t[2]=i-e*c,t[6]=r+n*c,t[10]=a*s}else if(e.order===`YXZ`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e+i*o,t[4]=r*o-n,t[8]=a*c,t[1]=a*u,t[5]=a*l,t[9]=-o,t[2]=n*o-r,t[6]=i+e*o,t[10]=a*s}else if(e.order===`ZXY`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e-i*o,t[4]=-a*u,t[8]=r+n*o,t[1]=n+r*o,t[5]=a*l,t[9]=i-e*o,t[2]=-a*c,t[6]=o,t[10]=a*s}else if(e.order===`ZYX`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=r*c-n,t[8]=e*c+i,t[1]=s*u,t[5]=i*c+e,t[9]=n*c-r,t[2]=-c,t[6]=o*s,t[10]=a*s}else if(e.order===`YZX`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=i-e*u,t[8]=r*u+n,t[1]=u,t[5]=a*l,t[9]=-o*l,t[2]=-c*l,t[6]=n*u+r,t[10]=e-i*u}else if(e.order===`XZY`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=-u,t[8]=c*l,t[1]=e*u+i,t[5]=a*l,t[9]=n*u-r,t[2]=r*u-n,t[6]=o*l,t[10]=i*u+e}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose($t,e,en)}lookAt(e,t,n){let r=this.elements;return rn.subVectors(e,t),rn.lengthSq()===0&&(rn.z=1),rn.normalize(),tn.crossVectors(n,rn),tn.lengthSq()===0&&(Math.abs(n.z)===1?rn.x+=1e-4:rn.z+=1e-4,rn.normalize(),tn.crossVectors(n,rn)),tn.normalize(),nn.crossVectors(rn,tn),r[0]=tn.x,r[4]=nn.x,r[8]=rn.x,r[1]=tn.y,r[5]=nn.y,r[9]=rn.y,r[2]=tn.z,r[6]=nn.z,r[10]=rn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[4],s=n[8],c=n[12],l=n[1],u=n[5],d=n[9],f=n[13],p=n[2],m=n[6],h=n[10],g=n[14],_=n[3],v=n[7],y=n[11],b=n[15],x=r[0],S=r[4],C=r[8],w=r[12],T=r[1],E=r[5],D=r[9],O=r[13],k=r[2],A=r[6],j=r[10],M=r[14],N=r[3],P=r[7],F=r[11],I=r[15];return i[0]=a*x+o*T+s*k+c*N,i[4]=a*S+o*E+s*A+c*P,i[8]=a*C+o*D+s*j+c*F,i[12]=a*w+o*O+s*M+c*I,i[1]=l*x+u*T+d*k+f*N,i[5]=l*S+u*E+d*A+f*P,i[9]=l*C+u*D+d*j+f*F,i[13]=l*w+u*O+d*M+f*I,i[2]=p*x+m*T+h*k+g*N,i[6]=p*S+m*E+h*A+g*P,i[10]=p*C+m*D+h*j+g*F,i[14]=p*w+m*O+h*M+g*I,i[3]=_*x+v*T+y*k+b*N,i[7]=_*S+v*E+y*A+b*P,i[11]=_*C+v*D+y*j+b*F,i[15]=_*w+v*O+y*M+b*I,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],r=e[8],i=e[12],a=e[1],o=e[5],s=e[9],c=e[13],l=e[2],u=e[6],d=e[10],f=e[14],p=e[3],m=e[7],h=e[11],g=e[15],_=s*f-c*d,v=o*f-c*u,y=o*d-s*u,b=a*f-c*l,x=a*d-s*l,S=a*u-o*l;return t*(m*_-h*v+g*y)-n*(p*_-h*b+g*x)+r*(p*v-m*b+g*S)-i*(p*y-m*x+h*S)}determinantAffine(){let e=this.elements,t=e[0],n=e[4],r=e[8],i=e[1],a=e[5],o=e[9],s=e[2],c=e[6],l=e[10];return t*(a*l-o*c)-n*(i*l-o*s)+r*(i*c-a*s)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let r=this.elements;return e.isVector3?(r[12]=e.x,r[13]=e.y,r[14]=e.z):(r[12]=e,r[13]=t,r[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=e[9],d=e[10],f=e[11],p=e[12],m=e[13],h=e[14],g=e[15],_=t*o-n*a,v=t*s-r*a,y=t*c-i*a,b=n*s-r*o,x=n*c-i*o,S=r*c-i*s,C=l*m-u*p,w=l*h-d*p,T=l*g-f*p,E=u*h-d*m,D=u*g-f*m,O=d*g-f*h,k=_*O-v*D+y*E+b*T-x*w+S*C;if(k===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let A=1/k;return e[0]=(o*O-s*D+c*E)*A,e[1]=(r*D-n*O-i*E)*A,e[2]=(m*S-h*x+g*b)*A,e[3]=(d*x-u*S-f*b)*A,e[4]=(s*T-a*O-c*w)*A,e[5]=(t*O-r*T+i*w)*A,e[6]=(h*y-p*S-g*v)*A,e[7]=(l*S-d*y+f*v)*A,e[8]=(a*D-o*T+c*C)*A,e[9]=(n*T-t*D-i*C)*A,e[10]=(p*x-m*y+g*_)*A,e[11]=(u*y-l*x-f*_)*A,e[12]=(o*w-a*E-s*C)*A,e[13]=(t*E-n*w+r*C)*A,e[14]=(m*v-p*b-h*_)*A,e[15]=(l*b-u*v+d*_)*A,this}scale(e){let t=this.elements,n=e.x,r=e.y,i=e.z;return t[0]*=n,t[4]*=r,t[8]*=i,t[1]*=n,t[5]*=r,t[9]*=i,t[2]*=n,t[6]*=r,t[10]*=i,t[3]*=n,t[7]*=r,t[11]*=i,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,r))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),r=Math.sin(t),i=1-n,a=e.x,o=e.y,s=e.z,c=i*a,l=i*o;return this.set(c*a+n,c*o-r*s,c*s+r*o,0,c*o+r*s,l*o+n,l*s-r*a,0,c*s-r*o,l*s+r*a,i*s*s+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,r,i,a){return this.set(1,n,i,0,e,1,a,0,t,r,1,0,0,0,0,1),this}compose(e,t,n){let r=this.elements,i=t._x,a=t._y,o=t._z,s=t._w,c=i+i,l=a+a,u=o+o,d=i*c,f=i*l,p=i*u,m=a*l,h=a*u,g=o*u,_=s*c,v=s*l,y=s*u,b=n.x,x=n.y,S=n.z;return r[0]=(1-(m+g))*b,r[1]=(f+y)*b,r[2]=(p-v)*b,r[3]=0,r[4]=(f-y)*x,r[5]=(1-(d+g))*x,r[6]=(h+_)*x,r[7]=0,r[8]=(p+v)*S,r[9]=(h-_)*S,r[10]=(1-(d+m))*S,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this}decompose(e,t,n){let r=this.elements;e.x=r[12],e.y=r[13],e.z=r[14];let i=this.determinantAffine();if(i===0)return n.set(1,1,1),t.identity(),this;let a=Zt.set(r[0],r[1],r[2]).length(),o=Zt.set(r[4],r[5],r[6]).length(),s=Zt.set(r[8],r[9],r[10]).length();i<0&&(a=-a),Qt.copy(this);let c=1/a,l=1/o,u=1/s;return Qt.elements[0]*=c,Qt.elements[1]*=c,Qt.elements[2]*=c,Qt.elements[4]*=l,Qt.elements[5]*=l,Qt.elements[6]*=l,Qt.elements[8]*=u,Qt.elements[9]*=u,Qt.elements[10]*=u,t.setFromRotationMatrix(Qt),n.x=a,n.y=o,n.z=s,this}makePerspective(e,t,n,r,i,a,o=Re,s=!1){let c=this.elements,l=2*i/(t-e),u=2*i/(n-r),d=(t+e)/(t-e),f=(n+r)/(n-r),p,m;if(s)p=i/(a-i),m=a*i/(a-i);else if(o===2e3)p=-(a+i)/(a-i),m=-2*a*i/(a-i);else if(o===2001)p=-a/(a-i),m=-a*i/(a-i);else throw Error(`THREE.Matrix4.makePerspective(): Invalid coordinate system: `+o);return c[0]=l,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=u,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=p,c[14]=m,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,r,i,a,o=Re,s=!1){let c=this.elements,l=2/(t-e),u=2/(n-r),d=-(t+e)/(t-e),f=-(n+r)/(n-r),p,m;if(s)p=1/(a-i),m=a/(a-i);else if(o===2e3)p=-2/(a-i),m=-(a+i)/(a-i);else if(o===2001)p=-1/(a-i),m=-i/(a-i);else throw Error(`THREE.Matrix4.makeOrthographic(): Invalid coordinate system: `+o);return c[0]=l,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=u,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=p,c[14]=m,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<16;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},Zt=new q,Qt=new Xt,$t=new q(0,0,0),en=new q(1,1,1),tn=new q,nn=new q,rn=new q,an=new Xt,on=new Et,sn=class e{constructor(t=0,n=0,r=0,i=e.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=n,this._z=r,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,r=this._order){return this._x=e,this._y=t,this._z=n,this._order=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let r=e.elements,i=r[0],a=r[4],o=r[8],s=r[1],c=r[5],l=r[9],u=r[2],d=r[6],f=r[10];switch(t){case`XYZ`:this._y=Math.asin(rt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-l,f),this._z=Math.atan2(-a,i)):(this._x=Math.atan2(d,c),this._z=0);break;case`YXZ`:this._x=Math.asin(-rt(l,-1,1)),Math.abs(l)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(s,c)):(this._y=Math.atan2(-u,i),this._z=0);break;case`ZXY`:this._x=Math.asin(rt(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(s,i));break;case`ZYX`:this._y=Math.asin(-rt(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,f),this._z=Math.atan2(s,i)):(this._x=0,this._z=Math.atan2(-a,c));break;case`YZX`:this._z=Math.asin(rt(s,-1,1)),Math.abs(s)<.9999999?(this._x=Math.atan2(-l,c),this._y=Math.atan2(-u,i)):(this._x=0,this._y=Math.atan2(o,f));break;case`XZY`:this._z=Math.asin(-rt(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(o,i)):(this._x=Math.atan2(-l,f),this._y=0);break;default:Ke(`Euler: .setFromRotationMatrix() encountered an unknown order: `+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return an.makeRotationFromQuaternion(e),this.setFromRotationMatrix(an,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return on.setFromEuler(this),this.setFromQuaternion(on,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};sn.DEFAULT_ORDER=`XYZ`;var cn=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return!!(this.mask&(1<<e|0))}},ln=0,un=new q,dn=new Et,fn=new Xt,pn=new q,mn=new q,hn=new q,gn=new Et,_n=new q(1,0,0),vn=new q(0,1,0),yn=new q(0,0,1),bn={type:`added`},xn={type:`removed`},Sn={type:`childadded`,child:null},Cn={type:`childremoved`,child:null},wn=class e extends Ze{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:ln++}),this.uuid=nt(),this.name=``,this.type=`Object3D`,this.parent=null,this.children=[],this.up=e.DEFAULT_UP.clone();let t=new q,n=new sn,r=new Et,i=new q(1,1,1);function a(){r.setFromEuler(n,!1)}function o(){n.setFromQuaternion(r,void 0,!1)}n._onChange(a),r._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:n},quaternion:{configurable:!0,enumerable:!0,value:r},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Xt},normalMatrix:{value:new kt}}),this.matrix=new Xt,this.matrixWorld=new Xt,this.matrixAutoUpdate=e.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=e.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new cn,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return dn.setFromAxisAngle(e,t),this.quaternion.multiply(dn),this}rotateOnWorldAxis(e,t){return dn.setFromAxisAngle(e,t),this.quaternion.premultiply(dn),this}rotateX(e){return this.rotateOnAxis(_n,e)}rotateY(e){return this.rotateOnAxis(vn,e)}rotateZ(e){return this.rotateOnAxis(yn,e)}translateOnAxis(e,t){return un.copy(e).applyQuaternion(this.quaternion),this.position.add(un.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(_n,e)}translateY(e){return this.translateOnAxis(vn,e)}translateZ(e){return this.translateOnAxis(yn,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(fn.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?pn.copy(e):pn.set(e,t,n);let r=this.parent;this.updateWorldMatrix(!0,!1),mn.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?fn.lookAt(mn,pn,this.up):fn.lookAt(pn,mn,this.up),this.quaternion.setFromRotationMatrix(fn),r&&(fn.extractRotation(r.matrixWorld),dn.setFromRotationMatrix(fn),this.quaternion.premultiply(dn.invert()))}add(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return e===this?(qe(`Object3D.add: object can't be added as a child of itself.`,e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(bn),Sn.child=e,this.dispatchEvent(Sn),Sn.child=null):qe(`Object3D.add: object not an instance of THREE.Object3D.`,e),this)}remove(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.remove(arguments[e]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(xn),Cn.child=e,this.dispatchEvent(Cn),Cn.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),fn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),fn.multiply(e.parent.matrixWorld)),e.applyMatrix4(fn),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(bn),Sn.child=e,this.dispatchEvent(Sn),Sn.child=null,this}getObjectById(e){return this.getObjectByProperty(`id`,e)}getObjectByName(e){return this.getObjectByProperty(`name`,e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,r=this.children.length;n<r;n++){let r=this.children[n].getObjectByProperty(e,t);if(r!==void 0)return r}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let r=this.children;for(let i=0,a=r.length;i<a;i++)r[i].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(mn,e,hn),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(mn,gn,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let e=this.pivot;if(e!==null){let t=e.x,n=e.y,r=e.z,i=this.matrix.elements;i[12]+=t-i[0]*t-i[4]*n-i[8]*r,i[13]+=n-i[1]*t-i[5]*n-i[9]*r,i[14]+=r-i[2]*t-i[6]*n-i[10]*r}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t,n=!1){let r=this.parent;if(e===!0&&r!==null&&r.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),t===!0){let e=this.children;for(let t=0,r=e.length;t<r;t++)e[t].updateWorldMatrix(!1,!0,n)}}toJSON(e){let t=e===void 0||typeof e==`string`,n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:`Object`,generator:`Object3D.toJSON`});let r={};r.uuid=this.uuid,r.type=this.type,this.name!==``&&(r.name=this.name),this.castShadow===!0&&(r.castShadow=!0),this.receiveShadow===!0&&(r.receiveShadow=!0),this.visible===!1&&(r.visible=!1),this.frustumCulled===!1&&(r.frustumCulled=!1),this.renderOrder!==0&&(r.renderOrder=this.renderOrder),this.static!==!1&&(r.static=this.static),Object.keys(this.userData).length>0&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),r.up=this.up.toArray(),this.pivot!==null&&(r.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(r.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(r.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(r.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(r.type=`InstancedMesh`,r.count=this.count,r.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(r.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(r.type=`BatchedMesh`,r.perObjectFrustumCulled=this.perObjectFrustumCulled,r.sortObjects=this.sortObjects,r.drawRanges=this._drawRanges,r.reservedRanges=this._reservedRanges,r.geometryInfo=this._geometryInfo.map(e=>({...e,boundingBox:e.boundingBox?e.boundingBox.toJSON():void 0,boundingSphere:e.boundingSphere?e.boundingSphere.toJSON():void 0})),r.instanceInfo=this._instanceInfo.map(e=>({...e})),r.availableInstanceIds=this._availableInstanceIds.slice(),r.availableGeometryIds=this._availableGeometryIds.slice(),r.nextIndexStart=this._nextIndexStart,r.nextVertexStart=this._nextVertexStart,r.geometryCount=this._geometryCount,r.maxInstanceCount=this._maxInstanceCount,r.maxVertexCount=this._maxVertexCount,r.maxIndexCount=this._maxIndexCount,r.geometryInitialized=this._geometryInitialized,r.matricesTexture=this._matricesTexture.toJSON(e),r.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(r.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(r.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(r.boundingBox=this.boundingBox.toJSON()));function i(t,n){return t[n.uuid]===void 0&&(t[n.uuid]=n.toJSON(e)),n.uuid}if(this.isScene)this.background&&(this.background.isColor?r.background=this.background.toJSON():this.background.isTexture&&(r.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(r.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){r.geometry=i(e.geometries,this.geometry);let t=this.geometry.parameters;if(t!==void 0&&t.shapes!==void 0){let n=t.shapes;if(Array.isArray(n))for(let t=0,r=n.length;t<r;t++){let r=n[t];i(e.shapes,r)}else i(e.shapes,n)}}if(this.isSkinnedMesh&&(r.bindMode=this.bindMode,r.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(i(e.skeletons,this.skeleton),r.skeleton=this.skeleton.uuid)),this.material!==void 0){if(Array.isArray(this.material)){let t=[];for(let n=0,r=this.material.length;n<r;n++)t.push(i(e.materials,this.material[n]));r.material=t}else r.material=i(e.materials,this.material)}if(this.children.length>0){r.children=[];for(let t=0;t<this.children.length;t++)r.children.push(this.children[t].toJSON(e).object)}if(this.animations.length>0){r.animations=[];for(let t=0;t<this.animations.length;t++){let n=this.animations[t];r.animations.push(i(e.animations,n))}}if(t){let t=a(e.geometries),r=a(e.materials),i=a(e.textures),o=a(e.images),s=a(e.shapes),c=a(e.skeletons),l=a(e.animations),u=a(e.nodes);t.length>0&&(n.geometries=t),r.length>0&&(n.materials=r),i.length>0&&(n.textures=i),o.length>0&&(n.images=o),s.length>0&&(n.shapes=s),c.length>0&&(n.skeletons=c),l.length>0&&(n.animations=l),u.length>0&&(n.nodes=u)}return n.object=r,n;function a(e){let t=[];for(let n in e){let r=e[n];delete r.metadata,t.push(r)}return t}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot===null?null:e.pivot.clone(),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let t=0;t<e.children.length;t++){let n=e.children[t];this.add(n.clone())}return this}};wn.DEFAULT_UP=new q(0,1,0),wn.DEFAULT_MATRIX_AUTO_UPDATE=!0,wn.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Tn=class extends wn{constructor(){super(),this.isGroup=!0,this.type=`Group`}},En={type:`move`},Dn=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Tn,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Tn,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new q,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new q),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Tn,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new q,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new q,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:`connected`,data:e}),this}disconnect(e){return this.dispatchEvent({type:`disconnected`,data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let r=null,i=null,a=null,o=this._targetRay,s=this._grip,c=this._hand;if(e&&t.session.visibilityState!==`visible-blurred`){if(c&&e.hand){a=!0;for(let r of e.hand.values()){let e=t.getJointPose(r,n),i=this._getHandJoint(c,r);e!==null&&(i.matrix.fromArray(e.transform.matrix),i.matrix.decompose(i.position,i.rotation,i.scale),i.matrixWorldNeedsUpdate=!0,i.jointRadius=e.radius),i.visible=e!==null}let r=c.joints[`index-finger-tip`],i=c.joints[`thumb-tip`],o=r.position.distanceTo(i.position);c.inputState.pinching&&o>.025?(c.inputState.pinching=!1,this.dispatchEvent({type:`pinchend`,handedness:e.handedness,target:this})):!c.inputState.pinching&&o<=.015&&(c.inputState.pinching=!0,this.dispatchEvent({type:`pinchstart`,handedness:e.handedness,target:this}))}else s!==null&&e.gripSpace&&(i=t.getPose(e.gripSpace,n),i!==null&&(s.matrix.fromArray(i.transform.matrix),s.matrix.decompose(s.position,s.rotation,s.scale),s.matrixWorldNeedsUpdate=!0,i.linearVelocity?(s.hasLinearVelocity=!0,s.linearVelocity.copy(i.linearVelocity)):s.hasLinearVelocity=!1,i.angularVelocity?(s.hasAngularVelocity=!0,s.angularVelocity.copy(i.angularVelocity)):s.hasAngularVelocity=!1,s.eventsEnabled&&s.dispatchEvent({type:`gripUpdated`,data:e,target:this})));o!==null&&(r=t.getPose(e.targetRaySpace,n),r===null&&i!==null&&(r=i),r!==null&&(o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,r.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(r.linearVelocity)):o.hasLinearVelocity=!1,r.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(r.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(En)))}return o!==null&&(o.visible=r!==null),s!==null&&(s.visible=i!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new Tn;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}},On={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},kn={h:0,s:0,l:0},An={h:0,s:0,l:0};function jn(e,t,n){return n<0&&(n+=1),n>1&&--n,n<1/6?e+(t-e)*6*n:n<1/2?t:n<2/3?e+(t-e)*6*(2/3-n):e}var Mn=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let t=e;t&&t.isColor?this.copy(t):typeof t==`number`?this.setHex(t):typeof t==`string`&&this.setStyle(t)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=Me){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,Pt.colorSpaceToWorking(this,t),this}setRGB(e,t,n,r=Pt.workingColorSpace){return this.r=e,this.g=t,this.b=n,Pt.colorSpaceToWorking(this,r),this}setHSL(e,t,n,r=Pt.workingColorSpace){if(e=it(e,1),t=rt(t,0,1),n=rt(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,i=2*n-r;this.r=jn(i,r,e+1/3),this.g=jn(i,r,e),this.b=jn(i,r,e-1/3)}return Pt.colorSpaceToWorking(this,r),this}setStyle(e,t=Me){function n(t){t!==void 0&&parseFloat(t)<1&&Ke(`Color: Alpha component of `+e+` will be ignored.`)}let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let i,a=r[1],o=r[2];switch(a){case`rgb`:case`rgba`:if(i=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(255,parseInt(i[1],10))/255,Math.min(255,parseInt(i[2],10))/255,Math.min(255,parseInt(i[3],10))/255,t);if(i=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(100,parseInt(i[1],10))/100,Math.min(100,parseInt(i[2],10))/100,Math.min(100,parseInt(i[3],10))/100,t);break;case`hsl`:case`hsla`:if(i=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setHSL(parseFloat(i[1])/360,parseFloat(i[2])/100,parseFloat(i[3])/100,t);break;default:Ke(`Color: Unknown color model `+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){let n=r[1],i=n.length;if(i===3)return this.setRGB(parseInt(n.charAt(0),16)/15,parseInt(n.charAt(1),16)/15,parseInt(n.charAt(2),16)/15,t);if(i===6)return this.setHex(parseInt(n,16),t);Ke(`Color: Invalid hex color `+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=Me){let n=On[e.toLowerCase()];return n===void 0?Ke(`Color: Unknown color `+e):this.setHex(n,t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Ft(e.r),this.g=Ft(e.g),this.b=Ft(e.b),this}copyLinearToSRGB(e){return this.r=It(e.r),this.g=It(e.g),this.b=It(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=Me){return Pt.workingToColorSpace(Nn.copy(this),e),Math.round(rt(Nn.r*255,0,255))*65536+Math.round(rt(Nn.g*255,0,255))*256+Math.round(rt(Nn.b*255,0,255))}getHexString(e=Me){return(`000000`+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=Pt.workingColorSpace){Pt.workingToColorSpace(Nn.copy(this),t);let n=Nn.r,r=Nn.g,i=Nn.b,a=Math.max(n,r,i),o=Math.min(n,r,i),s,c,l=(o+a)/2;if(o===a)s=0,c=0;else{let e=a-o;switch(c=l<=.5?e/(a+o):e/(2-a-o),a){case n:s=(r-i)/e+(r<i?6:0);break;case r:s=(i-n)/e+2;break;case i:s=(n-r)/e+4}s/=6}return e.h=s,e.s=c,e.l=l,e}getRGB(e,t=Pt.workingColorSpace){return Pt.workingToColorSpace(Nn.copy(this),t),e.r=Nn.r,e.g=Nn.g,e.b=Nn.b,e}getStyle(e=Me){Pt.workingToColorSpace(Nn.copy(this),e);let t=Nn.r,n=Nn.g,r=Nn.b;return e===`srgb`?`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(r*255)})`:`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${r.toFixed(3)})`}offsetHSL(e,t,n){return this.getHSL(kn),this.setHSL(kn.h+e,kn.s+t,kn.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(kn),e.getHSL(An);let n=st(kn.h,An.h,t),r=st(kn.s,An.s,t),i=st(kn.l,An.l,t);return this.setHSL(n,r,i),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,r=this.b,i=e.elements;return this.r=i[0]*t+i[3]*n+i[6]*r,this.g=i[1]*t+i[4]*n+i[7]*r,this.b=i[2]*t+i[5]*n+i[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Nn=new Mn;Mn.NAMES=On;var Pn=class e{constructor(e,t=25e-5){this.isFogExp2=!0,this.name=``,this.color=new Mn(e),this.density=t}clone(){return new e(this.color,this.density)}toJSON(){return{type:`FogExp2`,name:this.name,color:this.color.getHex(),density:this.density}}},Fn=class extends wn{constructor(){super(),this.isScene=!0,this.type=`Scene`,this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new sn,this.environmentIntensity=1,this.environmentRotation=new sn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}},In=new q,Ln=new q,Rn=new q,zn=new q,Bn=new q,Vn=new q,Hn=new q,Un=new q,Wn=new q,Gn=new q,Kn=new Gt,qn=new Gt,Jn=new Gt,Yn=class e{constructor(e=new q,t=new q,n=new q){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,r){r.subVectors(n,t),In.subVectors(e,t),r.cross(In);let i=r.lengthSq();return i>0?r.multiplyScalar(1/Math.sqrt(i)):r.set(0,0,0)}static getBarycoord(e,t,n,r,i){In.subVectors(r,t),Ln.subVectors(n,t),Rn.subVectors(e,t);let a=In.dot(In),o=In.dot(Ln),s=In.dot(Rn),c=Ln.dot(Ln),l=Ln.dot(Rn),u=a*c-o*o;if(u===0)return i.set(0,0,0),null;let d=1/u,f=(c*s-o*l)*d,p=(a*l-o*s)*d;return i.set(1-f-p,p,f)}static containsPoint(e,t,n,r){return this.getBarycoord(e,t,n,r,zn)!==null&&zn.x>=0&&zn.y>=0&&zn.x+zn.y<=1}static getInterpolation(e,t,n,r,i,a,o,s){return this.getBarycoord(e,t,n,r,zn)===null?(s.x=0,s.y=0,`z`in s&&(s.z=0),`w`in s&&(s.w=0),null):(s.setScalar(0),s.addScaledVector(i,zn.x),s.addScaledVector(a,zn.y),s.addScaledVector(o,zn.z),s)}static getInterpolatedAttribute(e,t,n,r,i,a){return Kn.setScalar(0),qn.setScalar(0),Jn.setScalar(0),Kn.fromBufferAttribute(e,t),qn.fromBufferAttribute(e,n),Jn.fromBufferAttribute(e,r),a.setScalar(0),a.addScaledVector(Kn,i.x),a.addScaledVector(qn,i.y),a.addScaledVector(Jn,i.z),a}static isFrontFacing(e,t,n,r){return In.subVectors(n,t),Ln.subVectors(e,t),In.cross(Ln).dot(r)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,r){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[r]),this}setFromAttributeAndIndices(e,t,n,r){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,r),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return In.subVectors(this.c,this.b),Ln.subVectors(this.a,this.b),In.cross(Ln).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return e.getNormal(this.a,this.b,this.c,t)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,n){return e.getBarycoord(t,this.a,this.b,this.c,n)}getInterpolation(t,n,r,i,a){return e.getInterpolation(t,this.a,this.b,this.c,n,r,i,a)}containsPoint(t){return e.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return e.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,r=this.b,i=this.c,a,o;Bn.subVectors(r,n),Vn.subVectors(i,n),Un.subVectors(e,n);let s=Bn.dot(Un),c=Vn.dot(Un);if(s<=0&&c<=0)return t.copy(n);Wn.subVectors(e,r);let l=Bn.dot(Wn),u=Vn.dot(Wn);if(l>=0&&u<=l)return t.copy(r);let d=s*u-l*c;if(d<=0&&s>=0&&l<=0)return a=s/(s-l),t.copy(n).addScaledVector(Bn,a);Gn.subVectors(e,i);let f=Bn.dot(Gn),p=Vn.dot(Gn);if(p>=0&&f<=p)return t.copy(i);let m=f*c-s*p;if(m<=0&&c>=0&&p<=0)return o=c/(c-p),t.copy(n).addScaledVector(Vn,o);let h=l*p-f*u;if(h<=0&&u-l>=0&&f-p>=0)return Hn.subVectors(i,r),o=(u-l)/(u-l+(f-p)),t.copy(r).addScaledVector(Hn,o);let g=1/(h+m+d);return a=m*g,o=d*g,t.copy(n).addScaledVector(Bn,a).addScaledVector(Vn,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},Xn=class{constructor(e=new q(1/0,1/0,1/0),t=new q(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(Qn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(Qn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=Qn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute(`position`);if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let t=0,n=r.count;t<n;t++)e.isMesh===!0?e.getVertexPosition(t,Qn):Qn.fromBufferAttribute(r,t),Qn.applyMatrix4(e.matrixWorld),this.expandByPoint(Qn);else e.boundingBox===void 0?(n.boundingBox===null&&n.computeBoundingBox(),$n.copy(n.boundingBox)):(e.boundingBox===null&&e.computeBoundingBox(),$n.copy(e.boundingBox)),$n.applyMatrix4(e.matrixWorld),this.union($n)}let r=e.children;for(let e=0,n=r.length;e<n;e++)this.expandByObject(r[e],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Qn),Qn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(or),sr.subVectors(this.max,or),er.subVectors(e.a,or),tr.subVectors(e.b,or),nr.subVectors(e.c,or),rr.subVectors(tr,er),ir.subVectors(nr,tr),ar.subVectors(er,nr);let t=[0,-rr.z,rr.y,0,-ir.z,ir.y,0,-ar.z,ar.y,rr.z,0,-rr.x,ir.z,0,-ir.x,ar.z,0,-ar.x,-rr.y,rr.x,0,-ir.y,ir.x,0,-ar.y,ar.x,0];return!ur(t,er,tr,nr,sr)||(t=[1,0,0,0,1,0,0,0,1],!ur(t,er,tr,nr,sr))?!1:(cr.crossVectors(rr,ir),t=[cr.x,cr.y,cr.z],ur(t,er,tr,nr,sr))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Qn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(Qn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(Zn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Zn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Zn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Zn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Zn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Zn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Zn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Zn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Zn),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},Zn=[new q,new q,new q,new q,new q,new q,new q,new q],Qn=new q,$n=new Xn,er=new q,tr=new q,nr=new q,rr=new q,ir=new q,ar=new q,or=new q,sr=new q,cr=new q,lr=new q;function ur(e,t,n,r,i){for(let a=0,o=e.length-3;a<=o;a+=3){lr.fromArray(e,a);let o=i.x*Math.abs(lr.x)+i.y*Math.abs(lr.y)+i.z*Math.abs(lr.z),s=t.dot(lr),c=n.dot(lr),l=r.dot(lr);if(Math.max(-Math.max(s,c,l),Math.min(s,c,l))>o)return!1}return!0}var dr=new q,fr=new Tt,pr=0,mr=class extends Ze{constructor(e,t,n=!1){if(super(),Array.isArray(e))throw TypeError(`THREE.BufferAttribute: array should be a Typed Array.`);this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:pr++}),this.name=``,this.array=e,this.itemSize=t,this.count=e===void 0?0:e.length/t,this.normalized=n,this.usage=Le,this.updateRanges=[],this.gpuType=_,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let r=0,i=this.itemSize;r<i;r++)this.array[e+r]=t.array[n+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)fr.fromBufferAttribute(this,t),fr.applyMatrix3(e),this.setXY(t,fr.x,fr.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)dr.fromBufferAttribute(this,t),dr.applyMatrix3(e),this.setXYZ(t,dr.x,dr.y,dr.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)dr.fromBufferAttribute(this,t),dr.applyMatrix4(e),this.setXYZ(t,dr.x,dr.y,dr.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)dr.fromBufferAttribute(this,t),dr.applyNormalMatrix(e),this.setXYZ(t,dr.x,dr.y,dr.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)dr.fromBufferAttribute(this,t),dr.transformDirection(e),this.setXYZ(t,dr.x,dr.y,dr.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=St(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=Ct(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=St(t,this.array)),t}setX(e,t){return this.normalized&&(t=Ct(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=St(t,this.array)),t}setY(e,t){return this.normalized&&(t=Ct(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=St(t,this.array)),t}setZ(e,t){return this.normalized&&(t=Ct(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=St(t,this.array)),t}setW(e,t){return this.normalized&&(t=Ct(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=Ct(t,this.array),n=Ct(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,r){return e*=this.itemSize,this.normalized&&(t=Ct(t,this.array),n=Ct(n,this.array),r=Ct(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this}setXYZW(e,t,n,r,i){return e*=this.itemSize,this.normalized&&(t=Ct(t,this.array),n=Ct(n,this.array),r=Ct(r,this.array),i=Ct(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this.array[e+3]=i,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==``&&(e.name=this.name),this.usage!==35044&&(e.usage=this.usage),e}dispose(){this.dispatchEvent({type:`dispose`})}},hr=class extends mr{constructor(e,t,n){super(new Uint16Array(e),t,n)}},gr=class extends mr{constructor(e,t,n){super(new Uint32Array(e),t,n)}},_r=class extends mr{constructor(e,t,n){super(new Float32Array(e),t,n)}},vr=new Xn,yr=new q,br=new q,xr=class{constructor(e=new q,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t===void 0?vr.setFromPoints(e).getCenter(n):n.copy(t);let r=0;for(let t=0,i=e.length;t<i;t++)r=Math.max(r,n.distanceToSquared(e[t]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius*=e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;yr.subVectors(e,this.center);let t=yr.lengthSq();if(t>this.radius*this.radius){let e=Math.sqrt(t),n=(e-this.radius)*.5;this.center.addScaledVector(yr,n/e),this.radius+=n}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(br.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(yr.copy(e.center).add(br)),this.expandByPoint(yr.copy(e.center).sub(br))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}},Sr=0,Cr=new Xt,wr=new wn,Tr=new q,Er=new Xn,Dr=new Xn,Or=new q,kr=class e extends Ze{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Sr++}),this.uuid=nt(),this.name=``,this.type=`BufferGeometry`,this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return this.index=Array.isArray(e)?new(ze(e)?gr:hr)(e,1):e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let t=new kt().getNormalMatrix(e);n.applyNormalMatrix(t),n.needsUpdate=!0}let r=this.attributes.tangent;return r!==void 0&&(r.transformDirection(e),r.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return Cr.makeRotationFromQuaternion(e),this.applyMatrix4(Cr),this}rotateX(e){return Cr.makeRotationX(e),this.applyMatrix4(Cr),this}rotateY(e){return Cr.makeRotationY(e),this.applyMatrix4(Cr),this}rotateZ(e){return Cr.makeRotationZ(e),this.applyMatrix4(Cr),this}translate(e,t,n){return Cr.makeTranslation(e,t,n),this.applyMatrix4(Cr),this}scale(e,t,n){return Cr.makeScale(e,t,n),this.applyMatrix4(Cr),this}lookAt(e){return wr.lookAt(e),wr.updateMatrix(),this.applyMatrix4(wr.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Tr).negate(),this.translate(Tr.x,Tr.y,Tr.z),this}setFromPoints(e){let t=this.getAttribute(`position`);if(t===void 0){let t=[];for(let n=0,r=e.length;n<r;n++){let r=e[n];t.push(r.x,r.y,r.z||0)}this.setAttribute(`position`,new _r(t,3))}else{let n=Math.min(e.length,t.count);for(let r=0;r<n;r++){let n=e[r];t.setXYZ(r,n.x,n.y,n.z||0)}e.length>t.count&&Ke(`BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry.`),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Xn);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){qe(`BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.`,this),this.boundingBox.set(new q(-1/0,-1/0,-1/0),new q(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];Er.setFromBufferAttribute(n),this.morphTargetsRelative?(Or.addVectors(this.boundingBox.min,Er.min),this.boundingBox.expandByPoint(Or),Or.addVectors(this.boundingBox.max,Er.max),this.boundingBox.expandByPoint(Or)):(this.boundingBox.expandByPoint(Er.min),this.boundingBox.expandByPoint(Er.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&qe(`BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.`,this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new xr);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){qe(`BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.`,this),this.boundingSphere.set(new q,1/0);return}if(e){let n=this.boundingSphere.center;if(Er.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];Dr.setFromBufferAttribute(n),this.morphTargetsRelative?(Or.addVectors(Er.min,Dr.min),Er.expandByPoint(Or),Or.addVectors(Er.max,Dr.max),Er.expandByPoint(Or)):(Er.expandByPoint(Dr.min),Er.expandByPoint(Dr.max))}Er.getCenter(n);let r=0;for(let t=0,i=e.count;t<i;t++)Or.fromBufferAttribute(e,t),r=Math.max(r,n.distanceToSquared(Or));if(t)for(let i=0,a=t.length;i<a;i++){let a=t[i],o=this.morphTargetsRelative;for(let t=0,i=a.count;t<i;t++)Or.fromBufferAttribute(a,t),o&&(Tr.fromBufferAttribute(e,t),Or.add(Tr)),r=Math.max(r,n.distanceToSquared(Or))}this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&qe(`BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.`,this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){qe(`BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)`);return}let n=t.position,r=t.normal,i=t.uv,a=this.getAttribute(`tangent`);(a===void 0||a.count!==n.count)&&(a=new mr(new Float32Array(4*n.count),4),this.setAttribute(`tangent`,a));let o=[],s=[];for(let e=0;e<n.count;e++)o[e]=new q,s[e]=new q;let c=new q,l=new q,u=new q,d=new Tt,f=new Tt,p=new Tt,m=new q,h=new q;function g(e,t,r){c.fromBufferAttribute(n,e),l.fromBufferAttribute(n,t),u.fromBufferAttribute(n,r),d.fromBufferAttribute(i,e),f.fromBufferAttribute(i,t),p.fromBufferAttribute(i,r),l.sub(c),u.sub(c),f.sub(d),p.sub(d);let a=1/(f.x*p.y-p.x*f.y);isFinite(a)&&(m.copy(l).multiplyScalar(p.y).addScaledVector(u,-f.y).multiplyScalar(a),h.copy(u).multiplyScalar(f.x).addScaledVector(l,-p.x).multiplyScalar(a),o[e].add(m),o[t].add(m),o[r].add(m),s[e].add(h),s[t].add(h),s[r].add(h))}let _=this.groups;_.length===0&&(_=[{start:0,count:e.count}]);for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)g(e.getX(t+0),e.getX(t+1),e.getX(t+2))}let v=new q,y=new q,b=new q,x=new q;function S(e){b.fromBufferAttribute(r,e),x.copy(b);let t=o[e];v.copy(t),v.sub(b.multiplyScalar(b.dot(t))).normalize(),y.crossVectors(x,t);let n=y.dot(s[e])<0?-1:1;a.setXYZW(e,v.x,v.y,v.z,n)}for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)S(e.getX(t+0)),S(e.getX(t+1)),S(e.getX(t+2))}this._transformed=!0}computeVertexNormals(){let e=this.index,t=this.getAttribute(`position`);if(t!==void 0){let n=this.getAttribute(`normal`);if(n===void 0||n.count!==t.count)n=new mr(new Float32Array(t.count*3),3),this.setAttribute(`normal`,n);else for(let e=0,t=n.count;e<t;e++)n.setXYZ(e,0,0,0);let r=new q,i=new q,a=new q,o=new q,s=new q,c=new q,l=new q,u=new q;if(e)for(let d=0,f=e.count;d<f;d+=3){let f=e.getX(d+0),p=e.getX(d+1),m=e.getX(d+2);r.fromBufferAttribute(t,f),i.fromBufferAttribute(t,p),a.fromBufferAttribute(t,m),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),o.fromBufferAttribute(n,f),s.fromBufferAttribute(n,p),c.fromBufferAttribute(n,m),o.add(l),s.add(l),c.add(l),n.setXYZ(f,o.x,o.y,o.z),n.setXYZ(p,s.x,s.y,s.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let e=0,o=t.count;e<o;e+=3)r.fromBufferAttribute(t,e+0),i.fromBufferAttribute(t,e+1),a.fromBufferAttribute(t,e+2),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),n.setXYZ(e+0,l.x,l.y,l.z),n.setXYZ(e+1,l.x,l.y,l.z),n.setXYZ(e+2,l.x,l.y,l.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Or.fromBufferAttribute(e,t),Or.normalize(),e.setXYZ(t,Or.x,Or.y,Or.z)}toNonIndexed(){function t(e,t){let n=e.array,r=e.itemSize,i=e.normalized,a=new n.constructor(t.length*r),o=0,s=0;for(let i=0,c=t.length;i<c;i++){o=e.isInterleavedBufferAttribute?t[i]*e.data.stride+e.offset:t[i]*r;for(let e=0;e<r;e++)a[s++]=n[o++]}return new mr(a,r,i)}if(this.index===null)return Ke(`BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.`),this;let n=new e,r=this.index.array,i=this.attributes;for(let e in i){let a=i[e],o=t(a,r);n.setAttribute(e,o)}let a=this.morphAttributes;for(let e in a){let i=[],o=a[e];for(let e=0,n=o.length;e<n;e++){let n=o[e],a=t(n,r);i.push(a)}n.morphAttributes[e]=i}n.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let e=0,t=o.length;e<t;e++){let t=o[e];n.addGroup(t.start,t.count,t.materialIndex)}return n}toJSON(){let e={metadata:{version:4.7,type:`BufferGeometry`,generator:`BufferGeometry.toJSON`}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?`BufferGeometry`:this.type,this.name!==``&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let t=this.parameters;for(let n in t)t[n]!==void 0&&(e[n]=t[n]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let t in n){let r=n[t];e.data.attributes[t]=r.toJSON(e.data)}let r={},i=!1;for(let t in this.morphAttributes){let n=this.morphAttributes[t],a=[];for(let t=0,r=n.length;t<r;t++){let r=n[t];a.push(r.toJSON(e.data))}a.length>0&&(r[t]=a,i=!0)}i&&(e.data.morphAttributes=r,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone());let r=e.attributes;for(let e in r){let n=r[e];this.setAttribute(e,n.clone(t))}let i=e.morphAttributes;for(let e in i){let n=[],r=i[e];for(let e=0,i=r.length;e<i;e++)n.push(r[e].clone(t));this.morphAttributes[e]=n}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let e=0,t=a.length;e<t;e++){let t=a[e];this.addGroup(t.start,t.count,t.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let s=e.boundingSphere;return s!==null&&(this.boundingSphere=s.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:`dispose`})}},Ar=0,jr=class extends Ze{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Ar++}),this.uuid=nt(),this.name=``,this.type=`Material`,this.blending=1,this.side=0,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=204,this.blendDst=205,this.blendEquation=100,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Mn(0,0,0),this.blendAlpha=0,this.depthFunc=3,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=519,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Ie,this.stencilZFail=Ie,this.stencilZPass=Ie,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){Ke(`Material: parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){Ke(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}r&&r.isColor?r.set(n):r&&r.isVector2&&n&&n.isVector2||r&&r.isEuler&&n&&n.isEuler||r&&r.isVector3&&n&&n.isVector3?r.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e==`string`;t&&(e={textures:{},images:{}});let n={metadata:{version:4.7,type:`Material`,generator:`Material.toJSON`}};n.uuid=this.uuid,n.type=this.type,this.name!==``&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==1&&(n.blending=this.blending),this.side!==0&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==204&&(n.blendSrc=this.blendSrc),this.blendDst!==205&&(n.blendDst=this.blendDst),this.blendEquation!==100&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==3&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==519&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==7680&&(n.stencilFail=this.stencilFail),this.stencilZFail!==7680&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==7680&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==`round`&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==`round`&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function r(e){let t=[];for(let n in e){let r=e[n];delete r.metadata,t.push(r)}return t}if(t){let t=r(e.textures),i=r(e.images);t.length>0&&(n.textures=t),i.length>0&&(n.images=i)}return n}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new Mn().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=e.iridescenceThicknessRange),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(this.vertexColors=typeof e.vertexColors==`number`?e.vertexColors>0:e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let t=e.normalScale;Array.isArray(t)===!1&&(t=[t,t]),this.normalScale=new Tt().fromArray(t)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new Tt().fromArray(e.clearcoatNormalScale)),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let e=t.length;n=Array(e);for(let r=0;r!==e;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:`dispose`})}set needsUpdate(e){e===!0&&this.version++}},Mr=new q,Nr=new q,Pr=new q,Fr=new q,Ir=new q,Lr=new q,Rr=new q,zr=class{constructor(e=new q,t=new q(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Mr)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=Mr.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Mr.copy(this.origin).addScaledVector(this.direction,t),Mr.distanceToSquared(e))}distanceSqToSegment(e,t,n,r){Nr.copy(e).add(t).multiplyScalar(.5),Pr.copy(t).sub(e).normalize(),Fr.copy(this.origin).sub(Nr);let i=e.distanceTo(t)*.5,a=-this.direction.dot(Pr),o=Fr.dot(this.direction),s=-Fr.dot(Pr),c=Fr.lengthSq(),l=Math.abs(1-a*a),u,d,f,p;if(l>0){if(u=a*s-o,d=a*o-s,p=i*l,u>=0){if(d>=-p){if(d<=p){let e=1/l;u*=e,d*=e,f=u*(u+a*d+2*o)+d*(a*u+d+2*s)+c}else d=i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c}else d=-i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c}else d<=-p?(u=Math.max(0,-(-a*i+o)),d=u>0?-i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c):d<=p?(u=0,d=Math.min(Math.max(-i,-s),i),f=d*(d+2*s)+c):(u=Math.max(0,-(a*i+o)),d=u>0?i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c)}else d=a>0?-i:i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,u),r&&r.copy(Nr).addScaledVector(Pr,d),f}intersectSphere(e,t){Mr.subVectors(e.center,this.origin);let n=Mr.dot(this.direction),r=Mr.dot(Mr)-n*n,i=e.radius*e.radius;if(r>i)return null;let a=Math.sqrt(i-r),o=n-a,s=n+a;return s<0?null:o<0?this.at(s,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,r,i,a,o,s,c=1/this.direction.x,l=1/this.direction.y,u=1/this.direction.z,d=this.origin;return c>=0?(n=(e.min.x-d.x)*c,r=(e.max.x-d.x)*c):(n=(e.max.x-d.x)*c,r=(e.min.x-d.x)*c),l>=0?(i=(e.min.y-d.y)*l,a=(e.max.y-d.y)*l):(i=(e.max.y-d.y)*l,a=(e.min.y-d.y)*l),n>a||i>r||((i>n||isNaN(n))&&(n=i),(a<r||isNaN(r))&&(r=a),u>=0?(o=(e.min.z-d.z)*u,s=(e.max.z-d.z)*u):(o=(e.max.z-d.z)*u,s=(e.min.z-d.z)*u),n>s||o>r)||((o>n||n!==n)&&(n=o),(s<r||r!==r)&&(r=s),r<0)?null:this.at(n>=0?n:r,t)}intersectsBox(e){return this.intersectBox(e,Mr)!==null}intersectTriangle(e,t,n,r,i){Ir.subVectors(t,e),Lr.subVectors(n,e),Rr.crossVectors(Ir,Lr);let a=this.direction.dot(Rr),o;if(a>0){if(r)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Fr.subVectors(this.origin,e);let s=o*this.direction.dot(Lr.crossVectors(Fr,Lr));if(s<0)return null;let c=o*this.direction.dot(Ir.cross(Fr));if(c<0||s+c>a)return null;let l=-o*Fr.dot(Rr);return l<0?null:this.at(l/a,i)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Br=class extends jr{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type=`MeshBasicMaterial`,this.color=new Mn(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new sn,this.combine=0,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},Vr=new Xt,Hr=new zr,Ur=new xr,Wr=new q,Gr=new q,Kr=new q,qr=new q,Jr=new q,Yr=new q,Xr=new q,Zr=new q,Qr=class extends wn{constructor(e=new kr,t=new Br){super(),this.isMesh=!0,this.type=`Mesh`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}getVertexPosition(e,t){let n=this.geometry,r=n.attributes.position,i=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(r,e);let o=this.morphTargetInfluences;if(i&&o){Yr.set(0,0,0);for(let n=0,r=i.length;n<r;n++){let r=o[n],s=i[n];r!==0&&(Jr.fromBufferAttribute(s,e),a?Yr.addScaledVector(Jr,r):Yr.addScaledVector(Jr.sub(t),r))}t.add(Yr)}return t}raycast(e,t){let n=this.geometry,r=this.material,i=this.matrixWorld;r!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Ur.copy(n.boundingSphere),Ur.applyMatrix4(i),Hr.copy(e.ray).recast(e.near),!(Ur.containsPoint(Hr.origin)===!1&&(Hr.intersectSphere(Ur,Wr)===null||Hr.origin.distanceToSquared(Wr)>(e.far-e.near)**2))&&(Vr.copy(i).invert(),Hr.copy(e.ray).applyMatrix4(Vr),(n.boundingBox===null||Hr.intersectsBox(n.boundingBox)!==!1)&&this._computeIntersections(e,t,Hr)))}_computeIntersections(e,t,n){let r,i=this.geometry,a=this.material,o=i.index,s=i.attributes.position,c=i.attributes.uv,l=i.attributes.uv1,u=i.attributes.normal,d=i.groups,f=i.drawRange;if(o!==null){if(Array.isArray(a))for(let i=0,s=d.length;i<s;i++){let s=d[i],p=a[s.materialIndex],m=Math.max(s.start,f.start),h=Math.min(o.count,Math.min(s.start+s.count,f.start+f.count));for(let i=m,a=h;i<a;i+=3){let a=o.getX(i),d=o.getX(i+1),f=o.getX(i+2);r=ei(this,p,e,n,c,l,u,a,d,f),r&&(r.faceIndex=Math.floor(i/3),r.face.materialIndex=s.materialIndex,t.push(r))}}else{let i=Math.max(0,f.start),s=Math.min(o.count,f.start+f.count);for(let d=i,f=s;d<f;d+=3){let i=o.getX(d),s=o.getX(d+1),f=o.getX(d+2);r=ei(this,a,e,n,c,l,u,i,s,f),r&&(r.faceIndex=Math.floor(d/3),t.push(r))}}}else if(s!==void 0){if(Array.isArray(a))for(let i=0,o=d.length;i<o;i++){let o=d[i],p=a[o.materialIndex],m=Math.max(o.start,f.start),h=Math.min(s.count,Math.min(o.start+o.count,f.start+f.count));for(let i=m,a=h;i<a;i+=3){let a=i,s=i+1,d=i+2;r=ei(this,p,e,n,c,l,u,a,s,d),r&&(r.faceIndex=Math.floor(i/3),r.face.materialIndex=o.materialIndex,t.push(r))}}else{let i=Math.max(0,f.start),o=Math.min(s.count,f.start+f.count);for(let s=i,d=o;s<d;s+=3){let i=s,o=s+1,d=s+2;r=ei(this,a,e,n,c,l,u,i,o,d),r&&(r.faceIndex=Math.floor(s/3),t.push(r))}}}}};function $r(e,t,n,r,i,a,o,s){let c;if(c=t.side===1?r.intersectTriangle(o,a,i,!0,s):r.intersectTriangle(i,a,o,t.side===0,s),c===null)return null;Zr.copy(s),Zr.applyMatrix4(e.matrixWorld);let l=n.ray.origin.distanceTo(Zr);return l<n.near||l>n.far?null:{distance:l,point:Zr.clone(),object:e}}function ei(e,t,n,r,i,a,o,s,c,l){e.getVertexPosition(s,Gr),e.getVertexPosition(c,Kr),e.getVertexPosition(l,qr);let u=$r(e,t,n,r,Gr,Kr,qr,Xr);if(u){let e=new q;Yn.getBarycoord(Xr,Gr,Kr,qr,e),i&&(u.uv=Yn.getInterpolatedAttribute(i,s,c,l,e,new Tt)),a&&(u.uv1=Yn.getInterpolatedAttribute(a,s,c,l,e,new Tt)),o&&(u.normal=Yn.getInterpolatedAttribute(o,s,c,l,e,new q),u.normal.dot(r.direction)>0&&u.normal.multiplyScalar(-1));let t={a:s,b:c,c:l,normal:new q,materialIndex:0};Yn.getNormal(Gr,Kr,qr,t.normal),u.face=t,u.barycoord=e}return u}var ti=class extends Wt{constructor(e=null,t=1,n=1,r,i,o,s,c,l=a,u=a,d,f){super(null,o,s,c,l,u,r,i,d,f),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},ni=new q,ri=new q,ii=new kt,ai=class{constructor(e=new q(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,r){return this.normal.set(e,t,n),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let r=ni.subVectors(n,t).cross(ri.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,n=!0){let r=e.delta(ni),i=this.normal.dot(r);if(i===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let a=-(e.start.dot(this.normal)+this.constant)/i;return n===!0&&(a<0||a>1)?null:t.copy(e.start).addScaledVector(r,a)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||ii.getNormalMatrix(e),r=this.coplanarPoint(ni).applyMatrix4(e),i=this.normal.applyMatrix3(n).normalize();return this.constant=-r.dot(i),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},oi=new xr,si=new Tt(.5,.5),ci=new q,li=class{constructor(e=new ai,t=new ai,n=new ai,r=new ai,i=new ai,a=new ai){this.planes=[e,t,n,r,i,a]}set(e,t,n,r,i,a){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(r),o[4].copy(i),o[5].copy(a),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=Re,n=!1){let r=this.planes,i=e.elements,a=i[0],o=i[1],s=i[2],c=i[3],l=i[4],u=i[5],d=i[6],f=i[7],p=i[8],m=i[9],h=i[10],g=i[11],_=i[12],v=i[13],y=i[14],b=i[15];if(r[0].setComponents(c-a,f-l,g-p,b-_).normalize(),r[1].setComponents(c+a,f+l,g+p,b+_).normalize(),r[2].setComponents(c+o,f+u,g+m,b+v).normalize(),r[3].setComponents(c-o,f-u,g-m,b-v).normalize(),n)r[4].setComponents(s,d,h,y).normalize(),r[5].setComponents(c-s,f-d,g-h,b-y).normalize();else if(r[4].setComponents(c-s,f-d,g-h,b-y).normalize(),t===2e3)r[5].setComponents(c+s,f+d,g+h,b+y).normalize();else if(t===2001)r[5].setComponents(s,d,h,y).normalize();else throw Error(`THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: `+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),oi.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),oi.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(oi)}intersectsSprite(e){return oi.center.set(0,0,0),oi.radius=.7071067811865476+si.distanceTo(e.center),oi.applyMatrix4(e.matrixWorld),this.intersectsSphere(oi)}intersectsSphere(e){let t=this.planes,n=e.center,r=-e.radius;for(let e=0;e<6;e++)if(t[e].distanceToPoint(n)<r)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let r=t[n];if(ci.x=r.normal.x>0?e.max.x:e.min.x,ci.y=r.normal.y>0?e.max.y:e.min.y,ci.z=r.normal.z>0?e.max.z:e.min.z,r.distanceToPoint(ci)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},ui=class extends jr{constructor(e){super(),this.isLineBasicMaterial=!0,this.type=`LineBasicMaterial`,this.color=new Mn(16777215),this.map=null,this.linewidth=1,this.linecap=`round`,this.linejoin=`round`,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}},di=new q,fi=new q,pi=new Xt,mi=new zr,hi=new xr,gi=new q,_i=new q,vi=class extends wn{constructor(e=new kr,t=new ui){super(),this.isLine=!0,this.type=`Line`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[0];for(let e=1,r=t.count;e<r;e++)di.fromBufferAttribute(t,e-1),fi.fromBufferAttribute(t,e),n[e]=n[e-1],n[e]+=di.distanceTo(fi);e.setAttribute(`lineDistance`,new _r(n,1))}else Ke(`Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.`);return this}raycast(e,t){let n=this.geometry,r=this.matrixWorld,i=e.params.Line.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),hi.copy(n.boundingSphere),hi.applyMatrix4(r),hi.radius+=i,e.ray.intersectsSphere(hi)===!1)return;pi.copy(r).invert(),mi.copy(e.ray).applyMatrix4(pi);let o=i/((this.scale.x+this.scale.y+this.scale.z)/3),s=o*o,c=this.isLineSegments?2:1,l=n.index,u=n.attributes.position;if(l!==null){let n=Math.max(0,a.start),r=Math.min(l.count,a.start+a.count);for(let i=n,a=r-1;i<a;i+=c){let n=l.getX(i),r=l.getX(i+1),a=yi(this,e,mi,s,n,r,i);a&&t.push(a)}if(this.isLineLoop){let i=l.getX(r-1),a=l.getX(n),o=yi(this,e,mi,s,i,a,r-1);o&&t.push(o)}}else{let n=Math.max(0,a.start),r=Math.min(u.count,a.start+a.count);for(let i=n,a=r-1;i<a;i+=c){let n=yi(this,e,mi,s,i,i+1,i);n&&t.push(n)}if(this.isLineLoop){let i=yi(this,e,mi,s,r-1,n,r-1);i&&t.push(i)}}}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}};function yi(e,t,n,r,i,a,o){let s=e.geometry.attributes.position;if(di.fromBufferAttribute(s,i),fi.fromBufferAttribute(s,a),n.distanceSqToSegment(di,fi,gi,_i)>r)return;gi.applyMatrix4(e.matrixWorld);let c=t.ray.origin.distanceTo(gi);if(!(c<t.near||c>t.far))return{distance:c,point:_i.clone().applyMatrix4(e.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:e}}var bi=new q,xi=new q,Si=class extends vi{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type=`LineSegments`}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[];for(let e=0,r=t.count;e<r;e+=2)bi.fromBufferAttribute(t,e),xi.fromBufferAttribute(t,e+1),n[e]=e===0?0:n[e-1],n[e+1]=n[e]+bi.distanceTo(xi);e.setAttribute(`lineDistance`,new _r(n,1))}else Ke(`LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.`);return this}},Ci=class extends jr{constructor(e){super(),this.isPointsMaterial=!0,this.type=`PointsMaterial`,this.color=new Mn(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},wi=new Xt,Ti=new zr,Ei=new xr,Di=new q,Oi=class extends wn{constructor(e=new kr,t=new Ci){super(),this.isPoints=!0,this.type=`Points`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){let n=this.geometry,r=this.matrixWorld,i=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Ei.copy(n.boundingSphere),Ei.applyMatrix4(r),Ei.radius+=i,e.ray.intersectsSphere(Ei)===!1)return;wi.copy(r).invert(),Ti.copy(e.ray).applyMatrix4(wi);let o=i/((this.scale.x+this.scale.y+this.scale.z)/3),s=o*o,c=n.index,l=n.attributes.position;if(c!==null){let n=Math.max(0,a.start),i=Math.min(c.count,a.start+a.count);for(let a=n,o=i;a<o;a++){let n=c.getX(a);Di.fromBufferAttribute(l,n),ki(Di,n,s,r,e,t,this)}}else{let n=Math.max(0,a.start),i=Math.min(l.count,a.start+a.count);for(let a=n,o=i;a<o;a++)Di.fromBufferAttribute(l,a),ki(Di,a,s,r,e,t,this)}}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}};function ki(e,t,n,r,i,a,o){let s=Ti.distanceSqToPoint(e);if(s<n){let n=new q;Ti.closestPointToPoint(e,n),n.applyMatrix4(r);let c=i.ray.origin.distanceTo(n);if(c<i.near||c>i.far)return;a.push({distance:c,distanceToRay:Math.sqrt(s),point:n,index:t,face:null,faceIndex:null,barycoord:null,object:o})}}var Ai=class extends Wt{constructor(e=[],t=301,n,r,i,a,o,s,c,l){super(e,t,n,r,i,a,o,s,c,l),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},ji=class extends Wt{constructor(e,t,n=g,r,i,o,s=a,c=a,l,u=D,d=1){if(u!==1026&&u!==1027)throw Error(`THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat`);super({width:e,height:t,depth:d},r,i,o,s,c,u,n,l),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Bt(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}},Mi=class extends ji{constructor(e,t=g,n=301,r,i,o=a,s=a,c,l=D){let u={width:e,height:e,depth:1},d=[u,u,u,u,u,u];super(e,e,t,n,r,i,o,s,c,l),this.image=d,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}},Ni=class extends Wt{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}},Pi=class e extends kr{constructor(e=1,t=1,n=1,r=1,i=1,a=1){super(),this.type=`BoxGeometry`,this.parameters={width:e,height:t,depth:n,widthSegments:r,heightSegments:i,depthSegments:a};let o=this;r=Math.floor(r),i=Math.floor(i),a=Math.floor(a);let s=[],c=[],l=[],u=[],d=0,f=0;p(`z`,`y`,`x`,-1,-1,n,t,e,a,i,0),p(`z`,`y`,`x`,1,-1,n,t,-e,a,i,1),p(`x`,`z`,`y`,1,1,e,n,t,r,a,2),p(`x`,`z`,`y`,1,-1,e,n,-t,r,a,3),p(`x`,`y`,`z`,1,-1,e,t,n,r,i,4),p(`x`,`y`,`z`,-1,-1,e,t,-n,r,i,5),this.setIndex(s),this.setAttribute(`position`,new _r(c,3)),this.setAttribute(`normal`,new _r(l,3)),this.setAttribute(`uv`,new _r(u,2));function p(e,t,n,r,i,a,p,m,h,g,_){let v=a/h,y=p/g,b=a/2,x=p/2,S=m/2,C=h+1,w=g+1,T=0,E=0,D=new q;for(let a=0;a<w;a++){let o=a*y-x;for(let s=0;s<C;s++)D[e]=(s*v-b)*r,D[t]=o*i,D[n]=S,c.push(D.x,D.y,D.z),D[e]=0,D[t]=0,D[n]=m>0?1:-1,l.push(D.x,D.y,D.z),u.push(s/h),u.push(1-a/g),T+=1}for(let e=0;e<g;e++)for(let t=0;t<h;t++){let n=d+t+C*e,r=d+t+C*(e+1),i=d+(t+1)+C*(e+1),a=d+(t+1)+C*e;s.push(n,r,a),s.push(r,i,a),E+=6}o.addGroup(f,E,_),f+=E,d+=T}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}},Fi=class e extends kr{constructor(e=1,t=1,n=1,r=32,i=1,a=!1,o=0,s=Math.PI*2){super(),this.type=`CylinderGeometry`,this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:r,heightSegments:i,openEnded:a,thetaStart:o,thetaLength:s};let c=this;r=Math.floor(r),i=Math.floor(i);let l=[],u=[],d=[],f=[],p=0,m=[],h=n/2,g=0;_(),a===!1&&(e>0&&v(!0),t>0&&v(!1)),this.setIndex(l),this.setAttribute(`position`,new _r(u,3)),this.setAttribute(`normal`,new _r(d,3)),this.setAttribute(`uv`,new _r(f,2));function _(){let a=new q,_=new q,v=0,y=(t-e)/n;for(let c=0;c<=i;c++){let l=[],g=c/i,v=g*(t-e)+e;for(let e=0;e<=r;e++){let t=e/r,i=t*s+o,c=Math.sin(i),m=Math.cos(i);_.x=v*c,_.y=-g*n+h,_.z=v*m,u.push(_.x,_.y,_.z),a.set(c,y,m).normalize(),d.push(a.x,a.y,a.z),f.push(t,1-g),l.push(p++)}m.push(l)}for(let n=0;n<r;n++)for(let r=0;r<i;r++){let a=m[r][n],o=m[r+1][n],s=m[r+1][n+1],c=m[r][n+1];(e>0||r!==0)&&(l.push(a,o,c),v+=3),(t>0||r!==i-1)&&(l.push(o,s,c),v+=3)}c.addGroup(g,v,0),g+=v}function v(n){let i=p,a=new Tt,m=new q,_=0,v=n===!0?e:t,y=n===!0?1:-1;for(let e=1;e<=r;e++)u.push(0,h*y,0),d.push(0,y,0),f.push(.5,.5),p++;let b=p;for(let e=0;e<=r;e++){let t=e/r*s+o,n=Math.cos(t),i=Math.sin(t);m.x=v*i,m.y=h*y,m.z=v*n,u.push(m.x,m.y,m.z),d.push(0,y,0),a.x=n*.5+.5,a.y=i*.5*y+.5,f.push(a.x,a.y),p++}for(let e=0;e<r;e++){let t=i+e,r=b+e;n===!0?l.push(r,r+1,t):l.push(r+1,r,t),_+=3}c.addGroup(g,_,n===!0?1:2),g+=_}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},Ii=class e extends Fi{constructor(e=1,t=1,n=32,r=1,i=!1,a=0,o=Math.PI*2){super(0,e,t,n,r,i,a,o),this.type=`ConeGeometry`,this.parameters={radius:e,height:t,radialSegments:n,heightSegments:r,openEnded:i,thetaStart:a,thetaLength:o}}static fromJSON(t){return new e(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},Li=new q,Ri=new q,zi=new q,Bi=new Yn,Vi=class extends kr{constructor(e=null,t=1){if(super(),this.type=`EdgesGeometry`,this.parameters={geometry:e,thresholdAngle:t},e!==null){let n=1e4,r=Math.cos(et*t),i=e.getIndex(),a=e.getAttribute(`position`),o=i?i.count:a.count,s=[0,0,0],c=[`a`,`b`,`c`],l=[,,,],u={},d=[];for(let e=0;e<o;e+=3){i?(s[0]=i.getX(e),s[1]=i.getX(e+1),s[2]=i.getX(e+2)):(s[0]=e,s[1]=e+1,s[2]=e+2);let{a:t,b:o,c:f}=Bi;if(t.fromBufferAttribute(a,s[0]),o.fromBufferAttribute(a,s[1]),f.fromBufferAttribute(a,s[2]),Bi.getNormal(zi),l[0]=`${Math.round(t.x*n)},${Math.round(t.y*n)},${Math.round(t.z*n)}`,l[1]=`${Math.round(o.x*n)},${Math.round(o.y*n)},${Math.round(o.z*n)}`,l[2]=`${Math.round(f.x*n)},${Math.round(f.y*n)},${Math.round(f.z*n)}`,l[0]!==l[1]&&l[1]!==l[2]&&l[2]!==l[0])for(let e=0;e<3;e++){let t=(e+1)%3,n=l[e],i=l[t],a=Bi[c[e]],o=Bi[c[t]],f=`${n}_${i}`,p=`${i}_${n}`;p in u&&u[p]?(zi.dot(u[p].normal)<=r&&(d.push(a.x,a.y,a.z),d.push(o.x,o.y,o.z)),u[p]=null):f in u||(u[f]={index0:s[e],index1:s[t],normal:zi.clone()})}}for(let e in u)if(u[e]){let{index0:t,index1:n}=u[e];Li.fromBufferAttribute(a,t),Ri.fromBufferAttribute(a,n),d.push(Li.x,Li.y,Li.z),d.push(Ri.x,Ri.y,Ri.z)}this.setAttribute(`position`,new _r(d,3))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}},Hi=class e extends kr{constructor(e=1,t=1,n=1,r=1){super(),this.type=`PlaneGeometry`,this.parameters={width:e,height:t,widthSegments:n,heightSegments:r};let i=e/2,a=t/2,o=Math.floor(n),s=Math.floor(r),c=o+1,l=s+1,u=e/o,d=t/s,f=[],p=[],m=[],h=[];for(let e=0;e<l;e++){let t=e*d-a;for(let n=0;n<c;n++){let r=n*u-i;p.push(r,-t,0),m.push(0,0,1),h.push(n/o),h.push(1-e/s)}}for(let e=0;e<s;e++)for(let t=0;t<o;t++){let n=t+c*e,r=t+c*(e+1),i=t+1+c*(e+1),a=t+1+c*e;f.push(n,r,a),f.push(r,i,a)}this.setIndex(f),this.setAttribute(`position`,new _r(p,3)),this.setAttribute(`normal`,new _r(m,3)),this.setAttribute(`uv`,new _r(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.widthSegments,t.heightSegments)}},Ui=class e extends kr{constructor(e=1,t=32,n=16,r=0,i=Math.PI*2,a=0,o=Math.PI){super(),this.type=`SphereGeometry`,this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:r,phiLength:i,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let s=Math.min(a+o,Math.PI),c=0,l=[],u=new q,d=new q,f=[],p=[],m=[],h=[];for(let f=0;f<=n;f++){let g=[],_=f/n,v=a+_*o,y=e*Math.cos(v),b=Math.sqrt(e*e-y*y),x=0;f===0&&a===0?x=.5/t:f===n&&s===Math.PI&&(x=-.5/t);for(let e=0;e<=t;e++){let n=e/t,a=r+n*i;u.x=-b*Math.cos(a),u.y=y,u.z=b*Math.sin(a),p.push(u.x,u.y,u.z),d.copy(u).normalize(),m.push(d.x,d.y,d.z),h.push(n+x,1-_),g.push(c++)}l.push(g)}for(let e=0;e<n;e++)for(let r=0;r<t;r++){let t=l[e][r+1],i=l[e][r],o=l[e+1][r],c=l[e+1][r+1];(e!==0||a>0)&&f.push(t,i,c),(e!==n-1||s<Math.PI)&&f.push(i,o,c)}this.setIndex(f),this.setAttribute(`position`,new _r(p,3)),this.setAttribute(`normal`,new _r(m,3)),this.setAttribute(`uv`,new _r(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}},Wi=class e extends kr{constructor(e=1,t=.4,n=12,r=48,i=Math.PI*2,a=0,o=Math.PI*2){super(),this.type=`TorusGeometry`,this.parameters={radius:e,tube:t,radialSegments:n,tubularSegments:r,arc:i,thetaStart:a,thetaLength:o},n=Math.floor(n),r=Math.floor(r);let s=[],c=[],l=[],u=[],d=new q,f=new q,p=new q;for(let s=0;s<=n;s++){let m=a+s/n*o;for(let a=0;a<=r;a++){let o=a/r*i;f.x=(e+t*Math.cos(m))*Math.cos(o),f.y=(e+t*Math.cos(m))*Math.sin(o),f.z=t*Math.sin(m),c.push(f.x,f.y,f.z),d.x=e*Math.cos(o),d.y=e*Math.sin(o),p.subVectors(f,d).normalize(),l.push(p.x,p.y,p.z),u.push(a/r),u.push(s/n)}}for(let e=1;e<=n;e++)for(let t=1;t<=r;t++){let n=(r+1)*e+t-1,i=(r+1)*(e-1)+t-1,a=(r+1)*(e-1)+t,o=(r+1)*e+t;s.push(n,i,o),s.push(i,a,o)}this.setIndex(s),this.setAttribute(`position`,new _r(c,3)),this.setAttribute(`normal`,new _r(l,3)),this.setAttribute(`uv`,new _r(u,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc)}};function Gi(e){let t={};for(let n in e){t[n]={};for(let r in e[n]){let i=e[n][r];if(qi(i))i.isRenderTargetTexture?(Ke(`UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms().`),t[n][r]=null):t[n][r]=i.clone();else if(Array.isArray(i)){if(qi(i[0])){let e=[];for(let t=0,n=i.length;t<n;t++)e[t]=i[t].clone();t[n][r]=e}else t[n][r]=i.slice()}else t[n][r]=i}}return t}function Ki(e){let t={};for(let n=0;n<e.length;n++){let r=Gi(e[n]);for(let e in r)t[e]=r[e]}return t}function qi(e){return e&&(e.isColor||e.isMatrix3||e.isMatrix4||e.isVector2||e.isVector3||e.isVector4||e.isTexture||e.isQuaternion)}function Ji(e){let t=[];for(let n=0;n<e.length;n++)t.push(e[n].clone());return t}function Yi(e){let t=e.getRenderTarget();return t===null?e.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:Pt.workingColorSpace}var Xi={clone:Gi,merge:Ki},Zi=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Qi=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,$i=class extends jr{constructor(e){super(),this.isShaderMaterial=!0,this.type=`ShaderMaterial`,this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Zi,this.fragmentShader=Qi,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Gi(e.uniforms),this.uniformsGroups=Ji(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let n in this.uniforms){let r=this.uniforms[n].value;r&&r.isTexture?t.uniforms[n]={type:`t`,value:r.toJSON(e).uuid}:r&&r.isColor?t.uniforms[n]={type:`c`,value:r.getHex()}:r&&r.isVector2?t.uniforms[n]={type:`v2`,value:r.toArray()}:r&&r.isVector3?t.uniforms[n]={type:`v3`,value:r.toArray()}:r&&r.isVector4?t.uniforms[n]={type:`v4`,value:r.toArray()}:r&&r.isMatrix3?t.uniforms[n]={type:`m3`,value:r.toArray()}:r&&r.isMatrix4?t.uniforms[n]={type:`m4`,value:r.toArray()}:t.uniforms[n]={value:r}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let e in this.extensions)this.extensions[e]===!0&&(n[e]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(let n in e.uniforms){let r=e.uniforms[n];switch(this.uniforms[n]={},r.type){case`t`:this.uniforms[n].value=t[r.value]||null;break;case`c`:this.uniforms[n].value=new Mn().setHex(r.value);break;case`v2`:this.uniforms[n].value=new Tt().fromArray(r.value);break;case`v3`:this.uniforms[n].value=new q().fromArray(r.value);break;case`v4`:this.uniforms[n].value=new Gt().fromArray(r.value);break;case`m3`:this.uniforms[n].value=new kt().fromArray(r.value);break;case`m4`:this.uniforms[n].value=new Xt().fromArray(r.value);break;default:this.uniforms[n].value=r.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(let t in e.extensions)this.extensions[t]=e.extensions[t];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}},ea=class extends $i{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type=`RawShaderMaterial`}},ta=class extends jr{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type=`MeshStandardMaterial`,this.defines={STANDARD:``},this.color=new Mn(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Mn(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new Tt(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new sn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:``},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},na=class extends jr{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type=`MeshDepthMaterial`,this.depthPacking=Ae,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},ra=class extends jr{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type=`MeshDistanceMaterial`,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};function ia(e,t){return!e||e.constructor===t?e:typeof t.BYTES_PER_ELEMENT==`number`?new t(e):Array.prototype.slice.call(e)}var aa=class{constructor(e,t,n,r){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=r===void 0?new t.constructor(n):r,this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,r=t[n],i=t[n-1];validate_interval:{seek:{let a;linear_scan:{forward_scan:if(!(e<r)){for(let a=n+2;;){if(r===void 0){if(e<i)break forward_scan;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(i=r,r=t[++n],e<r)break seek}a=t.length;break linear_scan}if(!(e>=i)){let o=t[1];e<o&&(n=2,i=o);for(let a=n-2;;){if(i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===a)break;if(r=i,i=t[--n-1],e>=i)break seek}a=n,n=0;break linear_scan}break validate_interval}for(;n<a;){let r=n+a>>>1;e<t[r]?a=r:n=r+1}if(r=t[n],i=t[n-1],i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(r===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,i,r)}return this.interpolate_(n,i,e,r)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,r=this.valueSize,i=e*r;for(let e=0;e!==r;++e)t[e]=n[i+e];return t}interpolate_(){throw Error(`THREE.Interpolant: Call to abstract method.`)}intervalChanged_(){}},oa=class extends aa{constructor(e,t,n,r){super(e,t,n,r),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Oe,endingEnd:Oe}}intervalChanged_(e,t,n){let r=this.parameterPositions,i=e-2,a=e+1,o=r[i],s=r[a];if(o===void 0)switch(this.getSettings_().endingStart){case K:i=e,o=2*t-n;break;case ke:i=r.length-2,o=t+r[i]-r[i+1];break;default:i=e,o=n}if(s===void 0)switch(this.getSettings_().endingEnd){case K:a=e,s=2*n-t;break;case ke:a=1,s=n+r[1]-r[0];break;default:a=e-1,s=t}let c=(n-t)*.5,l=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(s-n),this._offsetPrev=i*l,this._offsetNext=a*l}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,f=this._weightNext,p=(n-t)/(r-t),m=p*p,h=m*p,g=-d*h+2*d*m-d*p,_=(1+d)*h+(-1.5-2*d)*m+(-.5+d)*p+1,v=(-1-f)*h+(1.5+f)*m+.5*p,y=f*h-f*m;for(let e=0;e!==o;++e)i[e]=g*a[l+e]+_*a[c+e]+v*a[s+e]+y*a[u+e];return i}},sa=class extends aa{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=(n-t)/(r-t),u=1-l;for(let e=0;e!==o;++e)i[e]=a[c+e]*u+a[s+e]*l;return i}},ca=class extends aa{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e){return this.copySampleValue_(e-1)}},la=class extends aa{interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=this.inTangents,u=this.outTangents;if(!l||!u){let e=(n-t)/(r-t),l=1-e;for(let t=0;t!==o;++t)i[t]=a[c+t]*l+a[s+t]*e;return i}let d=o*2,f=e-1;for(let p=0;p!==o;++p){let o=a[c+p],m=a[s+p],h=f*d+p*2,g=u[h],_=u[h+1],v=e*d+p*2,y=l[v],b=l[v+1],x=(n-t)/(r-t),S,C,w,T,E;for(let e=0;e<8;e++){S=x*x,C=S*x,w=1-x,T=w*w,E=T*w;let e=E*t+3*T*x*g+3*w*S*y+C*r-n;if(Math.abs(e)<1e-10)break;let i=3*T*(g-t)+6*w*x*(y-g)+3*S*(r-y);if(Math.abs(i)<1e-10)break;x-=e/i,x=Math.max(0,Math.min(1,x))}i[p]=E*o+3*T*x*_+3*w*S*b+C*m}return i}},ua=class{constructor(e,t,n,r){if(e===void 0)throw Error(`THREE.KeyframeTrack: track name is undefined`);if(t===void 0||t.length===0)throw Error(`THREE.KeyframeTrack: no keyframes in track named `+e);this.name=e,this.times=ia(t,this.TimeBufferType),this.values=ia(n,this.ValueBufferType),this.setInterpolation(r||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:ia(e.times,Array),values:ia(e.values,Array)};let t=e.getInterpolation();t!==e.DefaultInterpolation&&(n.interpolation=t)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new ca(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new sa(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new oa(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodBezier(e){let t=new la(this.times,this.values,this.getValueSize(),e);return this.settings&&(t.inTangents=this.settings.inTangents,t.outTangents=this.settings.outTangents),t}setInterpolation(e){let t;switch(e){case Te:t=this.InterpolantFactoryMethodDiscrete;break;case Ee:t=this.InterpolantFactoryMethodLinear;break;case De:t=this.InterpolantFactoryMethodSmooth;break;case G:t=this.InterpolantFactoryMethodBezier}if(t===void 0){let t=`unsupported interpolation for `+this.ValueTypeName+` keyframe track named `+this.name;if(this.createInterpolant===void 0){if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw Error(t)}return Ke(`KeyframeTrack:`,t),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Te;case this.InterpolantFactoryMethodLinear:return Ee;case this.InterpolantFactoryMethodSmooth:return De;case this.InterpolantFactoryMethodBezier:return G}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]*=e}return this}trim(e,t){let n=this.times,r=n.length,i=0,a=r-1;for(;i!==r&&n[i]<e;)++i;for(;a!==-1&&n[a]>t;)--a;if(++a,i!==0||a!==r){i>=a&&(a=Math.max(a,1),i=a-1);let e=this.getValueSize();this.times=n.slice(i,a),this.values=this.values.slice(i*e,a*e)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(qe(`KeyframeTrack: Invalid value size in track.`,this),e=!1);let n=this.times,r=this.values,i=n.length;i===0&&(qe(`KeyframeTrack: Track is empty.`,this),e=!1);let a=null;for(let t=0;t!==i;t++){let r=n[t];if(typeof r==`number`&&isNaN(r)){qe(`KeyframeTrack: Time is not a valid number.`,this,t,r),e=!1;break}if(a!==null&&a>r){qe(`KeyframeTrack: Out of order keys.`,this,t,r,a),e=!1;break}a=r}if(r!==void 0&&Be(r))for(let t=0,n=r.length;t!==n;++t){let n=r[t];if(isNaN(n)){qe(`KeyframeTrack: Value is not a valid number.`,this,t,n),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),r=this.getInterpolation()===De,i=e.length-1,a=1;for(let o=1;o<i;++o){let i=!1,s=e[o];if(s!==e[o+1]&&(o!==1||s!==e[0])){if(r)i=!0;else{let e=o*n,r=e-n,a=e+n;for(let o=0;o!==n;++o){let n=t[e+o];if(n!==t[r+o]||n!==t[a+o]){i=!0;break}}}}if(i){if(o!==a){e[a]=e[o];let r=o*n,i=a*n;for(let e=0;e!==n;++e)t[i+e]=t[r+e]}++a}}if(i>0){e[a]=e[i];for(let e=i*n,r=a*n,o=0;o!==n;++o)t[r+o]=t[e+o];++a}return a===e.length?(this.times=e,this.values=t):(this.times=e.slice(0,a),this.values=t.slice(0,a*n)),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=this.constructor,r=new n(this.name,e,t);return r.createInterpolant=this.createInterpolant,r}};ua.prototype.ValueTypeName=``,ua.prototype.TimeBufferType=Float32Array,ua.prototype.ValueBufferType=Float32Array,ua.prototype.DefaultInterpolation=Ee;var da=class extends ua{constructor(e,t,n){super(e,t,n)}};da.prototype.ValueTypeName=`bool`,da.prototype.ValueBufferType=Array,da.prototype.DefaultInterpolation=Te,da.prototype.InterpolantFactoryMethodLinear=void 0,da.prototype.InterpolantFactoryMethodSmooth=void 0;var fa=class extends ua{constructor(e,t,n,r){super(e,t,n,r)}};fa.prototype.ValueTypeName=`color`;var pa=class extends ua{constructor(e,t,n,r){super(e,t,n,r)}};pa.prototype.ValueTypeName=`number`;var ma=class extends aa{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=(n-t)/(r-t),c=e*o;for(let e=c+o;c!==e;c+=4)Et.slerpFlat(i,0,a,c-o,a,c,s);return i}},ha=class extends ua{constructor(e,t,n,r){super(e,t,n,r)}InterpolantFactoryMethodLinear(e){return new ma(this.times,this.values,this.getValueSize(),e)}};ha.prototype.ValueTypeName=`quaternion`,ha.prototype.InterpolantFactoryMethodSmooth=void 0;var ga=class extends ua{constructor(e,t,n){super(e,t,n)}};ga.prototype.ValueTypeName=`string`,ga.prototype.ValueBufferType=Array,ga.prototype.DefaultInterpolation=Te,ga.prototype.InterpolantFactoryMethodLinear=void 0,ga.prototype.InterpolantFactoryMethodSmooth=void 0;var _a=class extends ua{constructor(e,t,n,r){super(e,t,n,r)}};_a.prototype.ValueTypeName=`vector`;var va=class extends wn{constructor(e,t=1){super(),this.isLight=!0,this.type=`Light`,this.color=new Mn(e),this.intensity=t}dispose(){this.dispatchEvent({type:`dispose`})}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}},ya=class extends va{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type=`HemisphereLight`,this.position.copy(wn.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Mn(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){let t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}},ba=new Xt,xa=new q,Sa=new q,Ca=class{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Tt(512,512),this.mapType=d,this.map=null,this.mapPass=null,this.matrix=new Xt,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new li,this._frameExtents=new Tt(1,1),this._viewportCount=1,this._viewports=[new Gt(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera,n=this.matrix;xa.setFromMatrixPosition(e.matrixWorld),t.position.copy(xa),Sa.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(Sa),t.updateMatrixWorld(),ba.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(ba,t.coordinateSystem,t.reversedDepth),t.coordinateSystem===2001||t.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(ba)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}},wa=new q,Ta=new Et,Ea=new q,Da=class extends wn{constructor(){super(),this.isCamera=!0,this.type=`Camera`,this.matrixWorldInverse=new Xt,this.projectionMatrix=new Xt,this.projectionMatrixInverse=new Xt,this.coordinateSystem=Re,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(wa,Ta,Ea),Ea.x===1&&Ea.y===1&&Ea.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(wa,Ta,Ea.set(1,1,1)).invert()}updateWorldMatrix(e,t,n=!1){super.updateWorldMatrix(e,t,n),this.matrixWorld.decompose(wa,Ta,Ea),Ea.x===1&&Ea.y===1&&Ea.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(wa,Ta,Ea.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},Oa=new q,ka=new Tt,Aa=new Tt,ja=class extends Da{constructor(e=50,t=1,n=.1,r=2e3){super(),this.isPerspectiveCamera=!0,this.type=`PerspectiveCamera`,this.fov=e,this.zoom=1,this.near=n,this.far=r,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=tt*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(et*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return tt*2*Math.atan(Math.tan(et*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){Oa.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Oa.x,Oa.y).multiplyScalar(-e/Oa.z),Oa.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Oa.x,Oa.y).multiplyScalar(-e/Oa.z)}getViewSize(e,t){return this.getViewBounds(e,ka,Aa),t.subVectors(Aa,ka)}setViewOffset(e,t,n,r,i,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=i,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(et*.5*this.fov)/this.zoom,n=2*t,r=this.aspect*n,i=-.5*r,a=this.view;if(this.view!==null&&this.view.enabled){let e=a.fullWidth,o=a.fullHeight;i+=a.offsetX*r/e,t-=a.offsetY*n/o,r*=a.width/e,n*=a.height/o}let o=this.filmOffset;o!==0&&(i+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(i,i+r,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},Ma=class extends Ca{constructor(){super(new ja(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(e){let t=this.camera,n=tt*2*e.angle*this.focus,r=this.mapSize.width/this.mapSize.height*this.aspect,i=e.distance||t.far;(n!==t.fov||r!==t.aspect||i!==t.far)&&(t.fov=n,t.aspect=r,t.far=i,t.updateProjectionMatrix()),super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this}},Na=class extends va{constructor(e,t,n=0,r=Math.PI/3,i=0,a=2){super(e,t),this.isSpotLight=!0,this.type=`SpotLight`,this.position.copy(wn.DEFAULT_UP),this.updateMatrix(),this.target=new wn,this.distance=n,this.angle=r,this.penumbra=i,this.decay=a,this.map=null,this.shadow=new Ma}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.map=e.map,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.angle=this.angle,t.object.decay=this.decay,t.object.penumbra=this.penumbra,t.object.target=this.target.uuid,this.map&&this.map.isTexture&&(t.object.map=this.map.toJSON(e).uuid),t.object.shadow=this.shadow.toJSON(),t}},Pa=class extends Ca{constructor(){super(new ja(90,1,.5,500)),this.isPointLightShadow=!0}},Fa=class extends va{constructor(e,t,n=0,r=2){super(e,t),this.isPointLight=!0,this.type=`PointLight`,this.distance=n,this.decay=r,this.shadow=new Pa}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}},Ia=class extends Da{constructor(e=-1,t=1,n=1,r=-1,i=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type=`OrthographicCamera`,this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=r,this.near=i,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,r,i,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=i,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,r=(this.top+this.bottom)/2,i=n-e,a=n+e,o=r+t,s=r-t;if(this.view!==null&&this.view.enabled){let e=(this.right-this.left)/this.view.fullWidth/this.zoom,t=(this.top-this.bottom)/this.view.fullHeight/this.zoom;i+=e*this.view.offsetX,a=i+e*this.view.width,o-=t*this.view.offsetY,s=o-t*this.view.height}this.projectionMatrix.makeOrthographic(i,a,o,s,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},La=class extends Ca{constructor(){super(new Ia(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},Ra=class extends va{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type=`DirectionalLight`,this.position.copy(wn.DEFAULT_UP),this.updateMatrix(),this.target=new wn,this.shadow=new La}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}},za=-90,Ba=1,Va=class extends wn{constructor(e,t,n){super(),this.type=`CubeCamera`,this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let r=new ja(za,Ba,e,t);r.layers=this.layers,this.add(r);let i=new ja(za,Ba,e,t);i.layers=this.layers,this.add(i);let a=new ja(za,Ba,e,t);a.layers=this.layers,this.add(a);let o=new ja(za,Ba,e,t);o.layers=this.layers,this.add(o);let s=new ja(za,Ba,e,t);s.layers=this.layers,this.add(s);let c=new ja(za,Ba,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,r,i,a,o,s]=t;for(let e of t)this.remove(e);if(e===2e3)n.up.set(0,1,0),n.lookAt(1,0,0),r.up.set(0,1,0),r.lookAt(-1,0,0),i.up.set(0,0,-1),i.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),s.up.set(0,1,0),s.lookAt(0,0,-1);else if(e===2001)n.up.set(0,-1,0),n.lookAt(-1,0,0),r.up.set(0,-1,0),r.lookAt(1,0,0),i.up.set(0,0,1),i.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),s.up.set(0,-1,0),s.lookAt(0,0,-1);else throw Error(`THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: `+e);for(let e of t)this.add(e),e.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:r}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[i,a,o,s,c,l]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),p=e.xr.enabled;e.xr.enabled=!1;let m=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let h=!1;h=e.isWebGLRenderer===!0?e.state.buffers.depth.getReversed():e.reversedDepthBuffer,e.setRenderTarget(n,0,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,i),e.setRenderTarget(n,1,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,s),e.setRenderTarget(n,4,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.generateMipmaps=m,e.setRenderTarget(n,5,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(u,d,f),e.xr.enabled=p,n.texture.needsPMREMUpdate=!0}},Ha=class extends ja{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}},Ua=class{constructor(){this._previousTime=0,this._currentTime=0,this._startTime=performance.now(),this._delta=0,this._elapsed=0,this._timescale=1,this._document=null,this._pageVisibilityHandler=null}connect(e){this._document=e,e.hidden!==void 0&&(this._pageVisibilityHandler=Wa.bind(this),e.addEventListener(`visibilitychange`,this._pageVisibilityHandler,!1))}disconnect(){this._pageVisibilityHandler!==null&&(this._document.removeEventListener(`visibilitychange`,this._pageVisibilityHandler),this._pageVisibilityHandler=null),this._document=null}getDelta(){return this._delta/1e3}getElapsed(){return this._elapsed/1e3}getTimescale(){return this._timescale}setTimescale(e){return this._timescale=e,this}reset(){return this._currentTime=performance.now()-this._startTime,this}dispose(){this.disconnect()}update(e){return this._pageVisibilityHandler!==null&&this._document.hidden===!0?this._delta=0:(this._previousTime=this._currentTime,this._currentTime=(e===void 0?performance.now():e)-this._startTime,this._delta=(this._currentTime-this._previousTime)*this._timescale,this._elapsed+=this._delta),this}};function Wa(){this._document.hidden===!1&&this.reset()}var Ga=`\\[\\]\\.:\\/`,Ka=RegExp(`[\\[\\]\\.:\\/]`,`g`),qa=`[^\\[\\]\\.:\\/]`,Ja=`[^`+Ga.replace(`\\.`,``)+`]`,Ya=`((?:WC+[\\/:])*)`.replace(`WC`,qa),Xa=`(WCOD+)?`.replace(`WCOD`,Ja),Za=`(?:\\.(WC+)(?:\\[(.+)\\])?)?`.replace(`WC`,qa),Qa=`\\.(WC+)(?:\\[(.+)\\])?`.replace(`WC`,qa),$a=RegExp(`^`+Ya+Xa+Za+Qa+`$`),eo=[`material`,`materials`,`bones`,`map`],to=class{constructor(e,t,n){let r=n||no.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,r)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,r=this._bindings[n];r!==void 0&&r.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let r=this._targetGroup.nCachedObjects_,i=n.length;r!==i;++r)n[r].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},no=class e{constructor(t,n,r){this.path=n,this.parsedPath=r||e.parseTrackName(n),this.node=e.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,n,r){return t&&t.isAnimationObjectGroup?new e.Composite(t,n,r):new e(t,n,r)}static sanitizeNodeName(e){return e.replace(/\s/g,`_`).replace(Ka,``)}static parseTrackName(e){let t=$a.exec(e);if(t===null)throw Error(`THREE.PropertyBinding: Cannot parse trackName: `+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},r=n.nodeName&&n.nodeName.lastIndexOf(`.`);if(r!==void 0&&r!==-1){let e=n.nodeName.substring(r+1);eo.indexOf(e)!==-1&&(n.nodeName=n.nodeName.substring(0,r),n.objectName=e)}if(n.propertyName===null||n.propertyName.length===0)throw Error(`THREE.PropertyBinding: can not parse propertyName from trackName: `+e);return n}static findNode(e,t){if(t===void 0||t===``||t===`.`||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(e){for(let r=0;r<e.length;r++){let i=e[r];if(i.name===t||i.uuid===t)return i;let a=n(i.children);if(a)return a}return null},r=n(e.children);if(r)return r}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)e[t++]=n[r]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let t=this.node,n=this.parsedPath,r=n.objectName,i=n.propertyName,a=n.propertyIndex;if(t||(t=e.findNode(this.rootNode,n.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){Ke(`PropertyBinding: No target node found for track: `+this.path+`.`);return}if(r){let e=n.objectIndex;switch(r){case`materials`:if(!t.material){qe(`PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.materials){qe(`PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.`,this);return}t=t.material.materials;break;case`bones`:if(!t.skeleton){qe(`PropertyBinding: Can not bind to bones as node does not have a skeleton.`,this);return}t=t.skeleton.bones;for(let n=0;n<t.length;n++)if(t[n].name===e){e=n;break}break;case`map`:if(`map`in t){t=t.map;break}if(!t.material){qe(`PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.map){qe(`PropertyBinding: Can not bind to material.map as node.material does not have a map.`,this);return}t=t.material.map;break;default:if(t[r]===void 0){qe(`PropertyBinding: Can not bind to objectName of node undefined.`,this);return}t=t[r]}if(e!==void 0){if(t[e]===void 0){qe(`PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.`,this,t);return}t=t[e]}}let o=t[i];if(o===void 0){let e=n.nodeName;qe(`PropertyBinding: Trying to update property for track: `+e+`.`+i+` but it wasn't found.`,t);return}let s=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?s=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(s=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(a!==void 0){if(i===`morphTargetInfluences`){if(!t.geometry){qe(`PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.`,this);return}if(!t.geometry.morphAttributes){qe(`PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.`,this);return}t.morphTargetDictionary[a]!==void 0&&(a=t.morphTargetDictionary[a])}c=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=a}else o.fromArray!==void 0&&o.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(c=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=i;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][s]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};no.Composite=to,no.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3},no.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2},no.prototype.GetterByBindingType=[no.prototype._getValue_direct,no.prototype._getValue_array,no.prototype._getValue_arrayElement,no.prototype._getValue_toArray],no.prototype.SetterByBindingTypeAndVersioning=[[no.prototype._setValue_direct,no.prototype._setValue_direct_setNeedsUpdate,no.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[no.prototype._setValue_array,no.prototype._setValue_array_setNeedsUpdate,no.prototype._setValue_array_setMatrixWorldNeedsUpdate],[no.prototype._setValue_arrayElement,no.prototype._setValue_arrayElement_setNeedsUpdate,no.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[no.prototype._setValue_fromArray,no.prototype._setValue_fromArray_setNeedsUpdate,no.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var ro=new Xt,io=class{constructor(e,t,n=0,r=1/0){this.ray=new zr(e,t),this.near=n,this.far=r,this.camera=null,this.layers=new cn,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){t.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t):t.isOrthographicCamera?(this.ray.origin.set(e.x,e.y,t.projectionMatrix.elements[14]).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t):qe(`Raycaster: Unsupported camera type: `+t.type)}setFromXRController(e){return ro.identity().extractRotation(e.matrixWorld),this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(ro),this}intersectObject(e,t=!0,n=[]){return oo(e,this,n,t),n.sort(ao),n}intersectObjects(e,t=!0,n=[]){for(let r=0,i=e.length;r<i;r++)oo(e[r],this,n,t);return n.sort(ao),n}};function ao(e,t){return e.distance-t.distance}function oo(e,t,n,r){let i=!0;if(e.layers.test(t.layers)&&e.raycast(t,n)===!1&&(i=!1),i===!0&&r===!0){let r=e.children;for(let e=0,i=r.length;e<i;e++)oo(r[e],t,n,!0)}}var so=class{constructor(e=!0){this.autoStart=e,this.startTime=0,this.oldTime=0,this.elapsedTime=0,this.running=!1,Ke(`Clock: This module has been deprecated. Please use THREE.Timer instead.`)}start(){this.startTime=performance.now(),this.oldTime=this.startTime,this.elapsedTime=0,this.running=!0}stop(){this.getElapsedTime(),this.running=!1,this.autoStart=!1}getElapsedTime(){return this.getDelta(),this.elapsedTime}getDelta(){let e=0;if(this.autoStart&&!this.running)return this.start(),0;if(this.running){let t=performance.now();e=(t-this.oldTime)/1e3,this.oldTime=t,this.elapsedTime+=e}return e}},co=class{constructor(e=1,t=0,n=0){this.radius=e,this.phi=t,this.theta=n}set(e,t,n){return this.radius=e,this.phi=t,this.theta=n,this}copy(e){return this.radius=e.radius,this.phi=e.phi,this.theta=e.theta,this}makeSafe(){let e=1e-6;return this.phi=rt(this.phi,e,Math.PI-e),this}setFromVector3(e){return this.setFromCartesianCoords(e.x,e.y,e.z)}setFromCartesianCoords(e,t,n){return this.radius=Math.sqrt(e*e+t*t+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(e,n),this.phi=Math.acos(rt(t/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}};(class e{static{e.prototype.isMatrix2=!0}constructor(e,t,n,r){this.elements=[1,0,0,1],e!==void 0&&this.set(e,t,n,r)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let n=0;n<4;n++)this.elements[n]=e[n+t];return this}set(e,t,n,r){let i=this.elements;return i[0]=e,i[2]=t,i[1]=n,i[3]=r,this}});var lo=new q,uo=new Da,fo=class extends Si{constructor(e){let t=new kr,n=new ui({color:16777215,vertexColors:!0,toneMapped:!1}),r=[],i=[],a={};o(`n1`,`n2`),o(`n2`,`n4`),o(`n4`,`n3`),o(`n3`,`n1`),o(`f1`,`f2`),o(`f2`,`f4`),o(`f4`,`f3`),o(`f3`,`f1`),o(`n1`,`f1`),o(`n2`,`f2`),o(`n3`,`f3`),o(`n4`,`f4`),o(`p`,`n1`),o(`p`,`n2`),o(`p`,`n3`),o(`p`,`n4`),o(`u1`,`u2`),o(`u2`,`u3`),o(`u3`,`u1`),o(`c`,`t`),o(`p`,`c`),o(`cn1`,`cn2`),o(`cn3`,`cn4`),o(`cf1`,`cf2`),o(`cf3`,`cf4`);function o(e,t){s(e),s(t)}function s(e){r.push(0,0,0),i.push(0,0,0),a[e]===void 0&&(a[e]=[]),a[e].push(r.length/3-1)}t.setAttribute(`position`,new _r(r,3)),t.setAttribute(`color`,new _r(i,3)),super(t,n),this.type=`CameraHelper`,this.camera=e,this.camera.updateProjectionMatrix&&this.camera.updateProjectionMatrix(),this.matrix=e.matrixWorld,this.matrixAutoUpdate=!1,this.pointMap=a,this.update();let c=new Mn(16755200),l=new Mn(16711680),u=new Mn(43775),d=new Mn(16777215),f=new Mn(3355443);this.setColors(c,l,u,d,f)}setColors(e,t,n,r,i){let a=this.geometry.getAttribute(`color`);return a.setXYZ(0,e.r,e.g,e.b),a.setXYZ(1,e.r,e.g,e.b),a.setXYZ(2,e.r,e.g,e.b),a.setXYZ(3,e.r,e.g,e.b),a.setXYZ(4,e.r,e.g,e.b),a.setXYZ(5,e.r,e.g,e.b),a.setXYZ(6,e.r,e.g,e.b),a.setXYZ(7,e.r,e.g,e.b),a.setXYZ(8,e.r,e.g,e.b),a.setXYZ(9,e.r,e.g,e.b),a.setXYZ(10,e.r,e.g,e.b),a.setXYZ(11,e.r,e.g,e.b),a.setXYZ(12,e.r,e.g,e.b),a.setXYZ(13,e.r,e.g,e.b),a.setXYZ(14,e.r,e.g,e.b),a.setXYZ(15,e.r,e.g,e.b),a.setXYZ(16,e.r,e.g,e.b),a.setXYZ(17,e.r,e.g,e.b),a.setXYZ(18,e.r,e.g,e.b),a.setXYZ(19,e.r,e.g,e.b),a.setXYZ(20,e.r,e.g,e.b),a.setXYZ(21,e.r,e.g,e.b),a.setXYZ(22,e.r,e.g,e.b),a.setXYZ(23,e.r,e.g,e.b),a.setXYZ(24,t.r,t.g,t.b),a.setXYZ(25,t.r,t.g,t.b),a.setXYZ(26,t.r,t.g,t.b),a.setXYZ(27,t.r,t.g,t.b),a.setXYZ(28,t.r,t.g,t.b),a.setXYZ(29,t.r,t.g,t.b),a.setXYZ(30,t.r,t.g,t.b),a.setXYZ(31,t.r,t.g,t.b),a.setXYZ(32,n.r,n.g,n.b),a.setXYZ(33,n.r,n.g,n.b),a.setXYZ(34,n.r,n.g,n.b),a.setXYZ(35,n.r,n.g,n.b),a.setXYZ(36,n.r,n.g,n.b),a.setXYZ(37,n.r,n.g,n.b),a.setXYZ(38,r.r,r.g,r.b),a.setXYZ(39,r.r,r.g,r.b),a.setXYZ(40,i.r,i.g,i.b),a.setXYZ(41,i.r,i.g,i.b),a.setXYZ(42,i.r,i.g,i.b),a.setXYZ(43,i.r,i.g,i.b),a.setXYZ(44,i.r,i.g,i.b),a.setXYZ(45,i.r,i.g,i.b),a.setXYZ(46,i.r,i.g,i.b),a.setXYZ(47,i.r,i.g,i.b),a.setXYZ(48,i.r,i.g,i.b),a.setXYZ(49,i.r,i.g,i.b),a.needsUpdate=!0,this}update(){let e=this.geometry,t=this.pointMap,n,r;if(uo.projectionMatrixInverse.copy(this.camera.projectionMatrixInverse),this.camera.reversedDepth===!0)n=1,r=0;else if(this.camera.coordinateSystem===2e3)n=-1,r=1;else if(this.camera.coordinateSystem===2001)n=0,r=1;else throw Error(`THREE.CameraHelper.update(): Invalid coordinate system: `+this.camera.coordinateSystem);po(`c`,t,e,uo,0,0,n),po(`t`,t,e,uo,0,0,r),po(`n1`,t,e,uo,-1,-1,n),po(`n2`,t,e,uo,1,-1,n),po(`n3`,t,e,uo,-1,1,n),po(`n4`,t,e,uo,1,1,n),po(`f1`,t,e,uo,-1,-1,r),po(`f2`,t,e,uo,1,-1,r),po(`f3`,t,e,uo,-1,1,r),po(`f4`,t,e,uo,1,1,r),po(`u1`,t,e,uo,.7,1.1,n),po(`u2`,t,e,uo,-.7,1.1,n),po(`u3`,t,e,uo,0,2,n),po(`cf1`,t,e,uo,-1,0,r),po(`cf2`,t,e,uo,1,0,r),po(`cf3`,t,e,uo,0,-1,r),po(`cf4`,t,e,uo,0,1,r),po(`cn1`,t,e,uo,-1,0,n),po(`cn2`,t,e,uo,1,0,n),po(`cn3`,t,e,uo,0,-1,n),po(`cn4`,t,e,uo,0,1,n),e.getAttribute(`position`).needsUpdate=!0}dispose(){this.geometry.dispose(),this.material.dispose()}};function po(e,t,n,r,i,a,o){lo.set(i,a,o).unproject(r);let s=t[e];if(s!==void 0){let e=n.getAttribute(`position`);for(let t=0,n=s.length;t<n;t++)e.setXYZ(s[t],lo.x,lo.y,lo.z)}}var mo=class extends Ze{constructor(e,t=null){super(),this.object=e,this.domElement=t,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(e){if(e===void 0){Ke(`Controls: connect() now requires an element.`);return}this.domElement!==null&&this.disconnect(),this.domElement=e}disconnect(){}dispose(){}update(){}};function ho(e,t,n,r){let i=go(r);switch(n){case w:return e*t;case k:return e*t/i.components*i.byteLength;case A:return e*t/i.components*i.byteLength;case j:return e*t*2/i.components*i.byteLength;case M:return e*t*2/i.components*i.byteLength;case T:return e*t*3/i.components*i.byteLength;case E:return e*t*4/i.components*i.byteLength;case N:return e*t*4/i.components*i.byteLength;case P:case F:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case I:case L:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case ee:case z:return Math.max(e,16)*Math.max(t,8)/4;case R:case te:return Math.max(e,8)*Math.max(t,8)/2;case ne:case re:case V:case H:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case B:case ie:case ae:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case oe:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case se:return Math.floor((e+4)/5)*Math.floor((t+3)/4)*16;case ce:return Math.floor((e+4)/5)*Math.floor((t+4)/5)*16;case le:return Math.floor((e+5)/6)*Math.floor((t+4)/5)*16;case ue:return Math.floor((e+5)/6)*Math.floor((t+5)/6)*16;case de:return Math.floor((e+7)/8)*Math.floor((t+4)/5)*16;case U:return Math.floor((e+7)/8)*Math.floor((t+5)/6)*16;case fe:return Math.floor((e+7)/8)*Math.floor((t+7)/8)*16;case pe:return Math.floor((e+9)/10)*Math.floor((t+4)/5)*16;case me:return Math.floor((e+9)/10)*Math.floor((t+5)/6)*16;case he:return Math.floor((e+9)/10)*Math.floor((t+7)/8)*16;case ge:return Math.floor((e+9)/10)*Math.floor((t+9)/10)*16;case _e:return Math.floor((e+11)/12)*Math.floor((t+9)/10)*16;case ve:return Math.floor((e+11)/12)*Math.floor((t+11)/12)*16;case ye:case be:case xe:return Math.ceil(e/4)*Math.ceil(t/4)*16;case Se:case Ce:return Math.ceil(e/4)*Math.ceil(t/4)*8;case we:case W:return Math.ceil(e/4)*Math.ceil(t/4)*16}throw Error(`Unable to determine texture byte length for ${n} format.`)}function go(e){switch(e){case d:case f:return{byteLength:1,components:1};case m:case p:case v:return{byteLength:2,components:1};case y:case b:return{byteLength:2,components:4};case g:case h:case _:return{byteLength:4,components:1};case S:case C:return{byteLength:4,components:3}}throw Error(`THREE.TextureUtils: Unknown texture type ${e}.`)}typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`register`,{detail:{revision:`185`}})),typeof window<`u`&&(window.__THREE__?Ke(`WARNING: Multiple instances of Three.js being imported.`):window.__THREE__=`185`);function _o(){let e=null,t=!1,n=null,r=null;function i(t,a){n(t,a),r=e.requestAnimationFrame(i)}return{start:function(){t!==!0&&n!==null&&e!==null&&(r=e.requestAnimationFrame(i),t=!0)},stop:function(){e!==null&&e.cancelAnimationFrame(r),t=!1},setAnimationLoop:function(e){n=e},setContext:function(t){e=t}}}function vo(e){let t=new WeakMap;function n(t,n){let r=t.array,i=t.usage,a=r.byteLength,o=e.createBuffer();e.bindBuffer(n,o),e.bufferData(n,r,i),t.onUploadCallback();let s;if(r instanceof Float32Array)s=e.FLOAT;else if(typeof Float16Array<`u`&&r instanceof Float16Array)s=e.HALF_FLOAT;else if(r instanceof Uint16Array)s=t.isFloat16BufferAttribute?e.HALF_FLOAT:e.UNSIGNED_SHORT;else if(r instanceof Int16Array)s=e.SHORT;else if(r instanceof Uint32Array)s=e.UNSIGNED_INT;else if(r instanceof Int32Array)s=e.INT;else if(r instanceof Int8Array)s=e.BYTE;else if(r instanceof Uint8Array)s=e.UNSIGNED_BYTE;else if(r instanceof Uint8ClampedArray)s=e.UNSIGNED_BYTE;else throw Error(`THREE.WebGLAttributes: Unsupported buffer data format: `+r);return{buffer:o,type:s,bytesPerElement:r.BYTES_PER_ELEMENT,version:t.version,size:a}}function r(t,n,r){let i=n.array,a=n.updateRanges;if(e.bindBuffer(r,t),a.length===0)e.bufferSubData(r,0,i);else{a.sort((e,t)=>e.start-t.start);let t=0;for(let e=1;e<a.length;e++){let n=a[t],r=a[e];r.start<=n.start+n.count+1?n.count=Math.max(n.count,r.start+r.count-n.start):(++t,a[t]=r)}a.length=t+1;for(let t=0,n=a.length;t<n;t++){let n=a[t];e.bufferSubData(r,n.start*i.BYTES_PER_ELEMENT,i,n.start,n.count)}n.clearUpdateRanges()}n.onUploadCallback()}function i(e){return e.isInterleavedBufferAttribute&&(e=e.data),t.get(e)}function a(n){n.isInterleavedBufferAttribute&&(n=n.data);let r=t.get(n);r&&(e.deleteBuffer(r.buffer),t.delete(n))}function o(e,i){if(e.isInterleavedBufferAttribute&&(e=e.data),e.isGLBufferAttribute){let n=t.get(e);(!n||n.version<e.version)&&t.set(e,{buffer:e.buffer,type:e.type,bytesPerElement:e.elementSize,version:e.version});return}let a=t.get(e);if(a===void 0)t.set(e,n(e,i));else if(a.version<e.version){if(a.size!==e.array.byteLength)throw Error(`THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.`);r(a.buffer,e,i),a.version=e.version}}return{get:i,remove:a,update:o}}var yo={alphahash_fragment:`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,alphahash_pars_fragment:`#ifdef USE_ALPHAHASH
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
#endif`,alphamap_fragment:`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,alphamap_pars_fragment:`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,alphatest_fragment:`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,alphatest_pars_fragment:`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,aomap_fragment:`#ifdef USE_AOMAP
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
#endif`,aomap_pars_fragment:`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,batching_pars_vertex:`#ifdef USE_BATCHING
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
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,batching_vertex:`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,begin_vertex:`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,beginnormal_vertex:`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,bsdfs:`float G_BlinnPhong_Implicit( ) {
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
} // validated`,iridescence_fragment:`#ifdef USE_IRIDESCENCE
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
#endif`,bumpmap_pars_fragment:`#ifdef USE_BUMPMAP
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
#endif`,clipping_planes_fragment:`#if NUM_CLIPPING_PLANES > 0
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
#endif`,clipping_planes_pars_fragment:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,clipping_planes_pars_vertex:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,clipping_planes_vertex:`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,color_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,color_pars_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,color_pars_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,color_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,common:`#define PI 3.141592653589793
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
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
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
} // validated`,cube_uv_reflection_fragment:`#ifdef ENVMAP_TYPE_CUBE_UV
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
#endif`,defaultnormal_vertex:`vec3 transformedNormal = objectNormal;
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
#endif`,displacementmap_pars_vertex:`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,displacementmap_vertex:`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,emissivemap_fragment:`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,emissivemap_pars_fragment:`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,colorspace_fragment:`gl_FragColor = linearToOutputTexel( gl_FragColor );`,colorspace_pars_fragment:`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,envmap_fragment:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,envmap_common_pars_fragment:`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,envmap_pars_fragment:`#ifdef USE_ENVMAP
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
#endif`,envmap_pars_vertex:`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,envmap_physical_pars_fragment:`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
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
#endif`,envmap_vertex:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,fog_vertex:`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,fog_pars_vertex:`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,fog_fragment:`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fog_pars_fragment:`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,gradientmap_pars_fragment:`#ifdef USE_GRADIENTMAP
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
}`,lightmap_pars_fragment:`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,lights_lambert_fragment:`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,lights_lambert_pars_fragment:`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,lights_pars_begin:`uniform bool receiveShadow;
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
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
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
#endif
#include <lightprobes_pars_fragment>`,lights_toon_fragment:`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,lights_toon_pars_fragment:`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lights_phong_fragment:`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,lights_phong_pars_fragment:`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,lights_physical_fragment:`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
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
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
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
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
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
#endif`,lights_physical_pars_fragment:`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
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
		vec3 iridescenceFresnelDielectric;
		vec3 iridescenceFresnelMetallic;
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
		return 0.5 / max( gv + gl, EPSILON );
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
	vec3 f0 = material.specularColorBlended;
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
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
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
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
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
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;
	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;
	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;
	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;
	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;
	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;
	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;
	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );
	float compensationFactor = Ems_V * Ems_L;
	vec3 multiScatter = Fms * compensationFactor;
	return singleScatter + multiScatter;
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
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
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
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,lights_fragment_begin:`
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
		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );
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
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
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
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,lights_fragment_maps:`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
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
#endif`,lights_fragment_end:`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,lightprobes_pars_fragment:`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,logdepthbuf_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,logdepthbuf_pars_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_pars_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,map_fragment:`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,map_pars_fragment:`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,map_particle_fragment:`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,map_particle_pars_fragment:`#if defined( USE_POINTS_UV )
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
#endif`,metalnessmap_fragment:`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,metalnessmap_pars_fragment:`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,morphinstance_vertex:`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,morphcolor_vertex:`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,morphnormal_vertex:`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,morphtarget_pars_vertex:`#ifdef USE_MORPHTARGETS
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
#endif`,morphtarget_vertex:`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,normal_fragment_begin:`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
	#ifdef DOUBLE_SIDED
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
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,normal_fragment_maps:`#ifdef USE_NORMALMAP_OBJECTSPACE
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
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,normal_pars_fragment:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_pars_vertex:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_vertex:`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,normalmap_pars_fragment:`#ifdef USE_NORMALMAP
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
#endif`,clearcoat_normal_fragment_begin:`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,clearcoat_normal_fragment_maps:`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,clearcoat_pars_fragment:`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,iridescence_pars_fragment:`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,opaque_fragment:`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,packing:`vec3 packNormalToRGB( const in vec3 normal ) {
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
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,premultiplied_alpha_fragment:`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,project_vertex:`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,dithering_fragment:`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,dithering_pars_fragment:`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,roughnessmap_fragment:`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,roughnessmap_pars_fragment:`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,shadowmap_pars_fragment:`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
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
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
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
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
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
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,shadowmap_pars_vertex:`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,shadowmap_vertex:`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
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
#endif`,shadowmask_pars_fragment:`float getShadowMask() {
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
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
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
}`,skinbase_vertex:`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,skinning_pars_vertex:`#ifdef USE_SKINNING
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
#endif`,skinning_vertex:`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,skinnormal_vertex:`#ifdef USE_SKINNING
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
#endif`,specularmap_fragment:`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,specularmap_pars_fragment:`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,tonemapping_fragment:`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,tonemapping_pars_fragment:`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,transmission_fragment:`#ifdef USE_TRANSMISSION
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
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,transmission_pars_fragment:`#ifdef USE_TRANSMISSION
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
#endif`,uv_pars_fragment:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,uv_pars_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,uv_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,worldpos_vertex:`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,background_vert:`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,background_frag:`uniform sampler2D t2D;
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
}`,backgroundCube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,backgroundCube_frag:`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cube_frag:`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,depth_vert:`#include <common>
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
}`,depth_frag:`#if DEPTH_PACKING == 3200
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
}`,distance_vert:`#define DISTANCE
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
}`,distance_frag:`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,equirect_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,equirect_frag:`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,linedashed_vert:`uniform float scale;
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
}`,linedashed_frag:`uniform vec3 diffuse;
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
}`,meshbasic_vert:`#include <common>
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
}`,meshbasic_frag:`uniform vec3 diffuse;
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
}`,meshlambert_vert:`#define LAMBERT
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
}`,meshlambert_frag:`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
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
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
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
}`,meshmatcap_vert:`#define MATCAP
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
}`,meshmatcap_frag:`#define MATCAP
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
}`,meshnormal_vert:`#define NORMAL
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
}`,meshnormal_frag:`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
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
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,meshphong_vert:`#define PHONG
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
}`,meshphong_frag:`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
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
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
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
}`,meshphysical_vert:`#define STANDARD
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
}`,meshphysical_frag:`#define STANDARD
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
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
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
}`,meshtoon_vert:`#define TOON
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
}`,meshtoon_frag:`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
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
}`,points_vert:`uniform float size;
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
}`,points_frag:`uniform vec3 diffuse;
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
}`,shadow_vert:`#include <common>
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
}`,shadow_frag:`uniform vec3 color;
uniform float opacity;
#include <common>
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
	#include <premultiplied_alpha_fragment>
}`,sprite_vert:`uniform float rotation;
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
}`,sprite_frag:`uniform vec3 diffuse;
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
}`},J={common:{diffuse:{value:new Mn(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new kt},alphaMap:{value:null},alphaMapTransform:{value:new kt},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new kt}},envmap:{envMap:{value:null},envMapRotation:{value:new kt},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new kt}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new kt}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new kt},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new kt},normalScale:{value:new Tt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new kt},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new kt}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new kt}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new kt}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Mn(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new q},probesMax:{value:new q},probesResolution:{value:new q}},points:{diffuse:{value:new Mn(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new kt},alphaTest:{value:0},uvTransform:{value:new kt}},sprite:{diffuse:{value:new Mn(16777215)},opacity:{value:1},center:{value:new Tt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new kt},alphaMap:{value:null},alphaMapTransform:{value:new kt},alphaTest:{value:0}}},bo={basic:{uniforms:Ki([J.common,J.specularmap,J.envmap,J.aomap,J.lightmap,J.fog]),vertexShader:yo.meshbasic_vert,fragmentShader:yo.meshbasic_frag},lambert:{uniforms:Ki([J.common,J.specularmap,J.envmap,J.aomap,J.lightmap,J.emissivemap,J.bumpmap,J.normalmap,J.displacementmap,J.fog,J.lights,{emissive:{value:new Mn(0)},envMapIntensity:{value:1}}]),vertexShader:yo.meshlambert_vert,fragmentShader:yo.meshlambert_frag},phong:{uniforms:Ki([J.common,J.specularmap,J.envmap,J.aomap,J.lightmap,J.emissivemap,J.bumpmap,J.normalmap,J.displacementmap,J.fog,J.lights,{emissive:{value:new Mn(0)},specular:{value:new Mn(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:yo.meshphong_vert,fragmentShader:yo.meshphong_frag},standard:{uniforms:Ki([J.common,J.envmap,J.aomap,J.lightmap,J.emissivemap,J.bumpmap,J.normalmap,J.displacementmap,J.roughnessmap,J.metalnessmap,J.fog,J.lights,{emissive:{value:new Mn(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:yo.meshphysical_vert,fragmentShader:yo.meshphysical_frag},toon:{uniforms:Ki([J.common,J.aomap,J.lightmap,J.emissivemap,J.bumpmap,J.normalmap,J.displacementmap,J.gradientmap,J.fog,J.lights,{emissive:{value:new Mn(0)}}]),vertexShader:yo.meshtoon_vert,fragmentShader:yo.meshtoon_frag},matcap:{uniforms:Ki([J.common,J.bumpmap,J.normalmap,J.displacementmap,J.fog,{matcap:{value:null}}]),vertexShader:yo.meshmatcap_vert,fragmentShader:yo.meshmatcap_frag},points:{uniforms:Ki([J.points,J.fog]),vertexShader:yo.points_vert,fragmentShader:yo.points_frag},dashed:{uniforms:Ki([J.common,J.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:yo.linedashed_vert,fragmentShader:yo.linedashed_frag},depth:{uniforms:Ki([J.common,J.displacementmap]),vertexShader:yo.depth_vert,fragmentShader:yo.depth_frag},normal:{uniforms:Ki([J.common,J.bumpmap,J.normalmap,J.displacementmap,{opacity:{value:1}}]),vertexShader:yo.meshnormal_vert,fragmentShader:yo.meshnormal_frag},sprite:{uniforms:Ki([J.sprite,J.fog]),vertexShader:yo.sprite_vert,fragmentShader:yo.sprite_frag},background:{uniforms:{uvTransform:{value:new kt},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:yo.background_vert,fragmentShader:yo.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new kt}},vertexShader:yo.backgroundCube_vert,fragmentShader:yo.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:yo.cube_vert,fragmentShader:yo.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:yo.equirect_vert,fragmentShader:yo.equirect_frag},distance:{uniforms:Ki([J.common,J.displacementmap,{referencePosition:{value:new q},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:yo.distance_vert,fragmentShader:yo.distance_frag},shadow:{uniforms:Ki([J.lights,J.fog,{color:{value:new Mn(0)},opacity:{value:1}}]),vertexShader:yo.shadow_vert,fragmentShader:yo.shadow_frag}};bo.physical={uniforms:Ki([bo.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new kt},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new kt},clearcoatNormalScale:{value:new Tt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new kt},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new kt},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new kt},sheen:{value:0},sheenColor:{value:new Mn(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new kt},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new kt},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new kt},transmissionSamplerSize:{value:new Tt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new kt},attenuationDistance:{value:0},attenuationColor:{value:new Mn(0)},specularColor:{value:new Mn(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new kt},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new kt},anisotropyVector:{value:new Tt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new kt}}]),vertexShader:yo.meshphysical_vert,fragmentShader:yo.meshphysical_frag};var xo={r:0,b:0,g:0},So=new Xt,Co=new kt;Co.set(-1,0,0,0,1,0,0,0,1);function wo(e,t,n,r,i,a){let o=new Mn(0),s=i===!0?0:1,c,l,u=null,d=0,f=null;function p(e){let n=e.isScene===!0?e.background:null;if(n&&n.isTexture){let r=e.backgroundBlurriness>0;n=t.get(n,r)}return n}function m(t){let r=!1,i=p(t);i===null?g(o,s):i&&i.isColor&&(g(i,1),r=!0);let c=e.xr.getEnvironmentBlendMode();c===`additive`?n.buffers.color.setClear(0,0,0,1,a):c===`alpha-blend`&&n.buffers.color.setClear(0,0,0,0,a),(e.autoClear||r)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function h(t,n){let i=p(n);i&&(i.isCubeTexture||i.mapping===306)?(l===void 0&&(l=new Qr(new Pi(1,1,1),new $i({name:`BackgroundCubeMaterial`,uniforms:Gi(bo.backgroundCube.uniforms),vertexShader:bo.backgroundCube.vertexShader,fragmentShader:bo.backgroundCube.fragmentShader,side:1,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute(`normal`),l.geometry.deleteAttribute(`uv`),l.onBeforeRender=function(e,t,n){this.matrixWorld.copyPosition(n.matrixWorld)},Object.defineProperty(l.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),r.update(l)),l.material.uniforms.envMap.value=i,l.material.uniforms.backgroundBlurriness.value=n.backgroundBlurriness,l.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,l.material.uniforms.backgroundRotation.value.setFromMatrix4(So.makeRotationFromEuler(n.backgroundRotation)).transpose(),i.isCubeTexture&&i.isRenderTargetTexture===!1&&l.material.uniforms.backgroundRotation.value.premultiply(Co),l.material.toneMapped=Pt.getTransfer(i.colorSpace)!==Fe,(u!==i||d!==i.version||f!==e.toneMapping)&&(l.material.needsUpdate=!0,u=i,d=i.version,f=e.toneMapping),l.layers.enableAll(),t.unshift(l,l.geometry,l.material,0,0,null)):i&&i.isTexture&&(c===void 0&&(c=new Qr(new Hi(2,2),new $i({name:`BackgroundMaterial`,uniforms:Gi(bo.background.uniforms),vertexShader:bo.background.vertexShader,fragmentShader:bo.background.fragmentShader,side:0,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute(`normal`),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),r.update(c)),c.material.uniforms.t2D.value=i,c.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,c.material.toneMapped=Pt.getTransfer(i.colorSpace)!==Fe,i.matrixAutoUpdate===!0&&i.updateMatrix(),c.material.uniforms.uvTransform.value.copy(i.matrix),(u!==i||d!==i.version||f!==e.toneMapping)&&(c.material.needsUpdate=!0,u=i,d=i.version,f=e.toneMapping),c.layers.enableAll(),t.unshift(c,c.geometry,c.material,0,0,null))}function g(t,r){t.getRGB(xo,Yi(e)),n.buffers.color.setClear(xo.r,xo.g,xo.b,r,a)}function _(){l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0),c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0)}return{getClearColor:function(){return o},setClearColor:function(e,t=1){o.set(e),s=t,g(o,s)},getClearAlpha:function(){return s},setClearAlpha:function(e){s=e,g(o,s)},render:m,addToRenderList:h,dispose:_}}function To(e,t){let n=e.getParameter(e.MAX_VERTEX_ATTRIBS),r={},i=f(null),a=i,o=!1;function s(n,r,i,s,c){let u=!1,f=d(n,s,i,r);a!==f&&(a=f,l(a.object)),u=p(n,s,i,c),u&&m(n,s,i,c),c!==null&&t.update(c,e.ELEMENT_ARRAY_BUFFER),(u||o)&&(o=!1,b(n,r,i,s),c!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(c).buffer))}function c(){return e.createVertexArray()}function l(t){return e.bindVertexArray(t)}function u(t){return e.deleteVertexArray(t)}function d(e,t,n,i){let a=i.wireframe===!0,o=r[t.id];o===void 0&&(o={},r[t.id]=o);let s=e.isInstancedMesh===!0?e.id:0,l=o[s];l===void 0&&(l={},o[s]=l);let u=l[n.id];u===void 0&&(u={},l[n.id]=u);let d=u[a];return d===void 0&&(d=f(c()),u[a]=d),d}function f(e){let t=[],r=[],i=[];for(let e=0;e<n;e++)t[e]=0,r[e]=0,i[e]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:t,enabledAttributes:r,attributeDivisors:i,object:e,attributes:{},index:null}}function p(e,t,n,r){let i=a.attributes,o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=i[t],r=o[t];if(r===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(r=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(r=e.instanceColor)),n===void 0||n.attribute!==r||r&&n.data!==r.data)return!0;s++}return a.attributesNum!==s||a.index!==r}function m(e,t,n,r){let i={},o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=o[t];n===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(n=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(n=e.instanceColor));let r={};r.attribute=n,n&&n.data&&(r.data=n.data),i[t]=r,s++}a.attributes=i,a.attributesNum=s,a.index=r}function h(){let e=a.newAttributes;for(let t=0,n=e.length;t<n;t++)e[t]=0}function g(e){_(e,0)}function _(t,n){let r=a.newAttributes,i=a.enabledAttributes,o=a.attributeDivisors;r[t]=1,i[t]===0&&(e.enableVertexAttribArray(t),i[t]=1),o[t]!==n&&(e.vertexAttribDivisor(t,n),o[t]=n)}function v(){let t=a.newAttributes,n=a.enabledAttributes;for(let r=0,i=n.length;r<i;r++)n[r]!==t[r]&&(e.disableVertexAttribArray(r),n[r]=0)}function y(t,n,r,i,a,o,s){s===!0?e.vertexAttribIPointer(t,n,r,a,o):e.vertexAttribPointer(t,n,r,i,a,o)}function b(n,r,i,a){h();let o=a.attributes,s=i.getAttributes(),c=r.defaultAttributeValues;for(let r in s){let i=s[r];if(i.location>=0){let s=o[r];if(s===void 0&&(r===`instanceMatrix`&&n.instanceMatrix&&(s=n.instanceMatrix),r===`instanceColor`&&n.instanceColor&&(s=n.instanceColor)),s!==void 0){let r=s.normalized,o=s.itemSize,c=t.get(s);if(c===void 0)continue;let l=c.buffer,u=c.type,d=c.bytesPerElement,f=u===e.INT||u===e.UNSIGNED_INT||s.gpuType===1013;if(s.isInterleavedBufferAttribute){let t=s.data,c=t.stride,p=s.offset;if(t.isInstancedInterleavedBuffer){for(let e=0;e<i.locationSize;e++)_(i.location+e,t.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=t.meshPerAttribute*t.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,c*d,(p+o/i.locationSize*e)*d,f)}else{if(s.isInstancedBufferAttribute){for(let e=0;e<i.locationSize;e++)_(i.location+e,s.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=s.meshPerAttribute*s.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,o*d,o/i.locationSize*e*d,f)}}else if(c!==void 0){let t=c[r];if(t!==void 0)switch(t.length){case 2:e.vertexAttrib2fv(i.location,t);break;case 3:e.vertexAttrib3fv(i.location,t);break;case 4:e.vertexAttrib4fv(i.location,t);break;default:e.vertexAttrib1fv(i.location,t)}}}}v()}function x(){T();for(let e in r){let t=r[e];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e]}}function S(e){if(r[e.id]===void 0)return;let t=r[e.id];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e.id]}function C(e){for(let t in r){let n=r[t];for(let t in n){let r=n[t];if(r[e.id]===void 0)continue;let i=r[e.id];for(let e in i)u(i[e].object),delete i[e];delete r[e.id]}}}function w(e){for(let t in r){let n=r[t],i=e.isInstancedMesh===!0?e.id:0,a=n[i];if(a!==void 0){for(let e in a){let t=a[e];for(let e in t)u(t[e].object),delete t[e];delete a[e]}delete n[i],Object.keys(n).length===0&&delete r[t]}}}function T(){E(),o=!0,a!==i&&(a=i,l(a.object))}function E(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:s,reset:T,resetDefaultState:E,dispose:x,releaseStatesOfGeometry:S,releaseStatesOfObject:w,releaseStatesOfProgram:C,initAttributes:h,enableAttribute:g,disableUnusedAttributes:v}}function Eo(e,t,n){let r;function i(e){r=e}function a(t,i){e.drawArrays(r,t,i),n.update(i,r,1)}function o(t,i,a){a!==0&&(e.drawArraysInstanced(r,t,i,a),n.update(i,r,a))}function s(e,i,a){if(a===0)return;t.get(`WEBGL_multi_draw`).multiDrawArraysWEBGL(r,e,0,i,0,a);let o=0;for(let e=0;e<a;e++)o+=i[e];n.update(o,r,1)}this.setMode=i,this.render=a,this.renderInstances=o,this.renderMultiDraw=s}function Do(e,t,n,r){let i;function a(){if(i!==void 0)return i;if(t.has(`EXT_texture_filter_anisotropic`)===!0){let n=t.get(`EXT_texture_filter_anisotropic`);i=e.getParameter(n.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(t){return t===1023||r.convert(t)===e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT)}function s(n){let i=n===1016&&(t.has(`EXT_color_buffer_half_float`)||t.has(`EXT_color_buffer_float`));return!(n!==1009&&r.convert(n)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE)&&n!==1015&&!i)}function c(t){if(t===`highp`){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return`highp`;t=`mediump`}return t===`mediump`&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?`mediump`:`lowp`}let l=n.precision===void 0?`highp`:n.precision,u=c(l);u!==l&&(Ke(`WebGLRenderer:`,l,`not supported, using`,u,`instead.`),l=u);let d=n.logarithmicDepthBuffer===!0,f=n.reversedDepthBuffer===!0&&t.has(`EXT_clip_control`);n.reversedDepthBuffer===!0&&f===!1&&Ke(`WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.`);let p=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),m=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),h=e.getParameter(e.MAX_TEXTURE_SIZE),g=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),_=e.getParameter(e.MAX_VERTEX_ATTRIBS),v=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),y=e.getParameter(e.MAX_VARYING_VECTORS),b=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),x=e.getParameter(e.MAX_SAMPLES),S=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:a,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:s,precision:l,logarithmicDepthBuffer:d,reversedDepthBuffer:f,maxTextures:p,maxVertexTextures:m,maxTextureSize:h,maxCubemapSize:g,maxAttributes:_,maxVertexUniforms:v,maxVaryings:y,maxFragmentUniforms:b,maxSamples:x,samples:S}}function Oo(e){let t=this,n=null,r=0,i=!1,a=!1,o=new ai,s=new kt,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(e,t){let n=e.length!==0||t||r!==0||i;return i=t,r=e.length,n},this.beginShadows=function(){a=!0,u(null)},this.endShadows=function(){a=!1},this.setGlobalState=function(e,t){n=u(e,t,0)},this.setState=function(t,o,s){let d=t.clippingPlanes,f=t.clipIntersection,p=t.clipShadows,m=e.get(t);if(!i||d===null||d.length===0||a&&!p)a?u(null):l();else{let e=a?0:r,t=e*4,i=m.clippingState||null;c.value=i,i=u(d,o,t,s);for(let e=0;e!==t;++e)i[e]=n[e];m.clippingState=i,this.numIntersection=f?this.numPlanes:0,this.numPlanes+=e}};function l(){c.value!==n&&(c.value=n,c.needsUpdate=r>0),t.numPlanes=r,t.numIntersection=0}function u(e,n,r,i){let a=e===null?0:e.length,l=null;if(a!==0){if(l=c.value,i!==!0||l===null){let t=r+a*4,i=n.matrixWorldInverse;s.getNormalMatrix(i),(l===null||l.length<t)&&(l=new Float32Array(t));for(let t=0,n=r;t!==a;++t,n+=4)o.copy(e[t]).applyMatrix4(i,s),o.normal.toArray(l,n),l[n+3]=o.constant}c.value=l,c.needsUpdate=!0}return t.numPlanes=a,t.numIntersection=0,l}}var ko=4,Ao=[.125,.215,.35,.446,.526,.582],jo=20,Mo=256,No=new Ia,Po=new Mn,Fo=null,Io=0,Lo=0,Ro=!1,zo=new q,Bo=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,r=100,i={}){let{size:a=256,position:o=zo}=i;Fo=this._renderer.getRenderTarget(),Io=this._renderer.getActiveCubeFace(),Lo=this._renderer.getActiveMipmapLevel(),Ro=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let s=this._allocateTargets();return s.depthBuffer=!0,this._sceneToCubeUV(e,n,r,s,o),t>0&&this._blur(s,0,0,t),this._applyPMREM(s),this._cleanup(s),s}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=qo(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Ko(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=2**this._lodMax}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Fo,Io,Lo),this._renderer.xr.enabled=Ro,e.scissorTest=!1,Uo(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===301||e.mapping===302?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Fo=this._renderer.getRenderTarget(),Io=this._renderer.getActiveCubeFace(),Lo=this._renderer.getActiveMipmapLevel(),Ro=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:c,minFilter:c,generateMipmaps:!1,type:v,format:E,colorSpace:Ne,depthBuffer:!1},r=Ho(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Ho(e,t,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=Vo(r)),this._blurMaterial=Go(r,e,t),this._ggxMaterial=Wo(r,e,t)}return r}_compileMaterial(e){let t=new Qr(new kr,e);this._renderer.compile(t,No)}_sceneToCubeUV(e,t,n,r,i){let a=new ja(90,1,t,n),o=[1,-1,1,1,1,1],s=[1,1,1,-1,-1,-1],c=this._renderer,l=c.autoClear,u=c.toneMapping;c.getClearColor(Po),c.toneMapping=0,c.autoClear=!1,c.state.buffers.depth.getReversed()&&(c.setRenderTarget(r),c.clearDepth(),c.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new Qr(new Pi,new Br({name:`PMREM.Background`,side:1,depthWrite:!1,depthTest:!1})));let d=this._backgroundBox,f=d.material,p=!1,m=e.background;m?m.isColor&&(f.color.copy(m),e.background=null,p=!0):(f.color.copy(Po),p=!0);for(let t=0;t<6;t++){let n=t%3;n===0?(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x+s[t],i.y,i.z)):n===1?(a.up.set(0,0,o[t]),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y+s[t],i.z)):(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y,i.z+s[t]));let l=this._cubeSize;Uo(r,n*l,t>2?l:0,l,l),c.setRenderTarget(r),p&&c.render(d,a),c.render(e,a)}c.toneMapping=u,c.autoClear=l,e.background=m}_textureToCubeUV(e,t){let n=this._renderer,r=e.mapping===301||e.mapping===302;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=qo()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Ko());let i=r?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=i;let o=i.uniforms;o.envMap.value=e;let s=this._cubeSize;Uo(t,0,0,3*s,2*s),n.setRenderTarget(t),n.render(a,No)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let r=this._lodMeshes.length;for(let t=1;t<r;t++)this._applyGGXFilter(e,t-1,t);t.autoClear=n}_applyGGXFilter(e,t,n){let r=this._renderer,i=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;let s=a.uniforms,c=n/(this._lodMeshes.length-1),l=t/(this._lodMeshes.length-1),u=Math.sqrt(c*c-l*l)*(0+c*1.25),{_lodMax:d}=this,f=this._sizeLods[n],p=3*f*(n>d-ko?n-d+ko:0),m=4*(this._cubeSize-f);s.envMap.value=e.texture,s.roughness.value=u,s.mipInt.value=d-t,Uo(i,p,m,3*f,2*f),r.setRenderTarget(i),r.render(o,No),s.envMap.value=i.texture,s.roughness.value=0,s.mipInt.value=d-n,Uo(e,p,m,3*f,2*f),r.setRenderTarget(e),r.render(o,No)}_blur(e,t,n,r,i){let a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,r,`latitudinal`,i),this._halfBlur(a,e,n,n,r,`longitudinal`,i)}_halfBlur(e,t,n,r,i,a,o){let s=this._renderer,c=this._blurMaterial;a!==`latitudinal`&&a!==`longitudinal`&&qe(`blur direction must be either latitudinal or longitudinal!`);let l=this._lodMeshes[r];l.material=c;let u=c.uniforms,d=this._sizeLods[n]-1,f=isFinite(i)?Math.PI/(2*d):2*Math.PI/39,p=i/f,m=isFinite(i)?1+Math.floor(3*p):jo;m>jo&&Ke(`sigmaRadians, ${i}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${jo}`);let h=[],g=0;for(let e=0;e<jo;++e){let t=e/p,n=Math.exp(-t*t/2);h.push(n),e===0?g+=n:e<m&&(g+=2*n)}for(let e=0;e<h.length;e++)h[e]=h[e]/g;u.envMap.value=e.texture,u.samples.value=m,u.weights.value=h,u.latitudinal.value=a===`latitudinal`,o&&(u.poleAxis.value=o);let{_lodMax:_}=this;u.dTheta.value=f,u.mipInt.value=_-n;let v=this._sizeLods[r];Uo(t,3*v*(r>_-ko?r-_+ko:0),4*(this._cubeSize-v),3*v,2*v),s.setRenderTarget(t),s.render(l,No)}};function Vo(e){let t=[],n=[],r=[],i=e,a=e-ko+1+Ao.length;for(let o=0;o<a;o++){let a=2**i;t.push(a);let s=1/a;o>e-ko?s=Ao[o-e+ko-1]:o===0&&(s=0),n.push(s);let c=1/(a-2),l=-c,u=1+c,d=[l,l,u,l,u,u,l,l,u,u,l,u],f=new Float32Array(108),p=new Float32Array(72),m=new Float32Array(36);for(let e=0;e<6;e++){let t=e%3*2/3-1,n=e>2?0:-1,r=[t,n,0,t+2/3,n,0,t+2/3,n+1,0,t,n,0,t+2/3,n+1,0,t,n+1,0];f.set(r,18*e),p.set(d,12*e);let i=[e,e,e,e,e,e];m.set(i,6*e)}let h=new kr;h.setAttribute(`position`,new mr(f,3)),h.setAttribute(`uv`,new mr(p,2)),h.setAttribute(`faceIndex`,new mr(m,1)),r.push(new Qr(h,null)),i>ko&&i--}return{lodMeshes:r,sizeLods:t,sigmas:n}}function Ho(e,t,n){let r=new qt(e,t,n);return r.texture.mapping=306,r.texture.name=`PMREM.cubeUv`,r.scissorTest=!0,r}function Uo(e,t,n,r,i){e.viewport.set(t,n,r,i),e.scissor.set(t,n,r,i)}function Wo(e,t,n){return new $i({name:`PMREMGGXConvolution`,defines:{GGX_SAMPLES:Mo,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Jo(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Go(e,t,n){let r=new Float32Array(jo),i=new q(0,1,0);return new $i({name:`SphericalGaussianBlur`,defines:{n:jo,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:r},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:Jo(),fragmentShader:`

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
		`,blending:0,depthTest:!1,depthWrite:!1})}function Ko(){return new $i({name:`EquirectangularToCubeUV`,uniforms:{envMap:{value:null}},vertexShader:Jo(),fragmentShader:`

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
		`,blending:0,depthTest:!1,depthWrite:!1})}function qo(){return new $i({name:`CubemapToCubeUV`,uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Jo(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Jo(){return`

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
	`}var Yo=class extends qt{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},r=[n,n,n,n,n,n];this.texture=new Ai(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},r=new Pi(5,5,5),i=new $i({name:`CubemapFromEquirect`,uniforms:Gi(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:1,blending:0});i.uniforms.tEquirect.value=t;let a=new Qr(r,i),o=t.minFilter;return t.minFilter===1008&&(t.minFilter=c),new Va(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,r=!0){let i=e.getRenderTarget();for(let i=0;i<6;i++)e.setRenderTarget(this,i),e.clear(t,n,r);e.setRenderTarget(i)}};function Xo(e){let t=new WeakMap,n=new WeakMap,r=null;function i(e,t=!1){return e==null?null:t?o(e):a(e)}function a(n){if(n&&n.isTexture){let r=n.mapping;if(r===303||r===304){if(t.has(n)){let e=t.get(n).texture;return s(e,n.mapping)}{let r=n.image;if(r&&r.height>0){let i=new Yo(r.height);return i.fromEquirectangularTexture(e,n),t.set(n,i),n.addEventListener(`dispose`,l),s(i.texture,n.mapping)}return null}}}return n}function o(t){if(t&&t.isTexture){let i=t.mapping,a=i===303||i===304,o=i===301||i===302;if(a||o){let i=n.get(t),s=i===void 0?0:i.texture.pmremVersion;if(t.isRenderTargetTexture&&t.pmremVersion!==s)return r===null&&(r=new Bo(e)),i=a?r.fromEquirectangular(t,i):r.fromCubemap(t,i),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),i.texture;if(i!==void 0)return i.texture;{let s=t.image;return a&&s&&s.height>0||o&&s&&c(s)?(r===null&&(r=new Bo(e)),i=a?r.fromEquirectangular(t):r.fromCubemap(t),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),t.addEventListener(`dispose`,u),i.texture):null}}}return t}function s(e,t){return t===303?e.mapping=301:t===304&&(e.mapping=302),e}function c(e){let t=0;for(let n=0;n<6;n++)e[n]!==void 0&&t++;return t===6}function l(e){let n=e.target;n.removeEventListener(`dispose`,l);let r=t.get(n);r!==void 0&&(t.delete(n),r.dispose())}function u(e){let t=e.target;t.removeEventListener(`dispose`,u);let r=n.get(t);r!==void 0&&(n.delete(t),r.dispose())}function d(){t=new WeakMap,n=new WeakMap,r!==null&&(r.dispose(),r=null)}return{get:i,dispose:d}}function Zo(e){let t={};function n(n){if(t[n]!==void 0)return t[n];let r=e.getExtension(n);return t[n]=r,r}return{has:function(e){return n(e)!==null},init:function(){n(`EXT_color_buffer_float`),n(`WEBGL_clip_cull_distance`),n(`OES_texture_float_linear`),n(`EXT_color_buffer_half_float`),n(`WEBGL_multisampled_render_to_texture`),n(`WEBGL_render_shared_exponent`)},get:function(e){let t=n(e);return t===null&&Je(`WebGLRenderer: `+e+` extension not supported.`),t}}}function Qo(e,t,n,r){let i={},a=new WeakMap;function o(e){let s=e.target;s.index!==null&&t.remove(s.index);for(let e in s.attributes)t.remove(s.attributes[e]);s.removeEventListener(`dispose`,o),delete i[s.id];let c=a.get(s);c&&(t.remove(c),a.delete(s)),r.releaseStatesOfGeometry(s),s.isInstancedBufferGeometry===!0&&delete s._maxInstanceCount,n.memory.geometries--}function s(e,t){return i[t.id]===!0?t:(t.addEventListener(`dispose`,o),i[t.id]=!0,n.memory.geometries++,t)}function c(n){let r=n.attributes;for(let n in r)t.update(r[n],e.ARRAY_BUFFER)}function l(e){let n=[],r=e.index,i=e.attributes.position,o=0;if(i===void 0)return;if(r!==null){let e=r.array;o=r.version;for(let t=0,r=e.length;t<r;t+=3){let r=e[t+0],i=e[t+1],a=e[t+2];n.push(r,i,i,a,a,r)}}else{let e=i.array;o=i.version;for(let t=0,r=e.length/3-1;t<r;t+=3){let e=t+0,r=t+1,i=t+2;n.push(e,r,r,i,i,e)}}let s=new(i.count>=65535?gr:hr)(n,1);s.version=o;let c=a.get(e);c&&t.remove(c),a.set(e,s)}function u(e){let t=a.get(e);if(t){let n=e.index;n!==null&&t.version<n.version&&l(e)}else l(e);return a.get(e)}return{get:s,update:c,getWireframeAttribute:u}}function $o(e,t,n){let r;function i(e){r=e}let a,o;function s(e){a=e.type,o=e.bytesPerElement}function c(t,i){e.drawElements(r,i,a,t*o),n.update(i,r,1)}function l(t,i,s){s!==0&&(e.drawElementsInstanced(r,i,a,t*o,s),n.update(i,r,s))}function u(e,i,o){if(o===0)return;t.get(`WEBGL_multi_draw`).multiDrawElementsWEBGL(r,i,0,a,e,0,o);let s=0;for(let e=0;e<o;e++)s+=i[e];n.update(s,r,1)}this.setMode=i,this.setIndex=s,this.render=c,this.renderInstances=l,this.renderMultiDraw=u}function es(e){let t={geometries:0,textures:0},n={frame:0,calls:0,triangles:0,points:0,lines:0};function r(t,r,i){switch(n.calls++,r){case e.TRIANGLES:n.triangles+=t/3*i;break;case e.LINES:n.lines+=t/2*i;break;case e.LINE_STRIP:n.lines+=i*(t-1);break;case e.LINE_LOOP:n.lines+=i*t;break;case e.POINTS:n.points+=i*t;break;default:qe(`WebGLInfo: Unknown draw mode:`,r)}}function i(){n.calls=0,n.triangles=0,n.points=0,n.lines=0}return{memory:t,render:n,programs:null,autoReset:!0,reset:i,update:r}}function ts(e,t,n){let r=new WeakMap,i=new Gt;function a(a,o,s){let c=a.morphTargetInfluences,l=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,u=l===void 0?0:l.length,d=r.get(o);if(d===void 0||d.count!==u){d!==void 0&&d.texture.dispose();let e=o.morphAttributes.position!==void 0,n=o.morphAttributes.normal!==void 0,a=o.morphAttributes.color!==void 0,s=o.morphAttributes.position||[],c=o.morphAttributes.normal||[],l=o.morphAttributes.color||[],f=0;e===!0&&(f=1),n===!0&&(f=2),a===!0&&(f=3);let p=o.attributes.position.count*f,m=1;p>t.maxTextureSize&&(m=Math.ceil(p/t.maxTextureSize),p=t.maxTextureSize);let h=new Float32Array(p*m*4*u),g=new Jt(h,p,m,u);g.type=_,g.needsUpdate=!0;let v=f*4;for(let t=0;t<u;t++){let r=s[t],o=c[t],u=l[t],d=p*m*4*t;for(let t=0;t<r.count;t++){let s=t*v;e===!0&&(i.fromBufferAttribute(r,t),h[d+s+0]=i.x,h[d+s+1]=i.y,h[d+s+2]=i.z,h[d+s+3]=0),n===!0&&(i.fromBufferAttribute(o,t),h[d+s+4]=i.x,h[d+s+5]=i.y,h[d+s+6]=i.z,h[d+s+7]=0),a===!0&&(i.fromBufferAttribute(u,t),h[d+s+8]=i.x,h[d+s+9]=i.y,h[d+s+10]=i.z,h[d+s+11]=u.itemSize===4?i.w:1)}}d={count:u,texture:g,size:new Tt(p,m)},r.set(o,d);function y(){g.dispose(),r.delete(o),o.removeEventListener(`dispose`,y)}o.addEventListener(`dispose`,y)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)s.getUniforms().setValue(e,`morphTexture`,a.morphTexture,n);else{let t=0;for(let e=0;e<c.length;e++)t+=c[e];let n=o.morphTargetsRelative?1:1-t;s.getUniforms().setValue(e,`morphTargetBaseInfluence`,n),s.getUniforms().setValue(e,`morphTargetInfluences`,c)}s.getUniforms().setValue(e,`morphTargetsTexture`,d.texture,n),s.getUniforms().setValue(e,`morphTargetsTextureSize`,d.size)}return{update:a}}function ns(e,t,n,r,i){let a=new WeakMap;function o(r){let o=i.render.frame,s=r.geometry,l=t.get(r,s);if(a.get(l)!==o&&(t.update(l),a.set(l,o)),r.isInstancedMesh&&(r.hasEventListener(`dispose`,c)===!1&&r.addEventListener(`dispose`,c),a.get(r)!==o&&(n.update(r.instanceMatrix,e.ARRAY_BUFFER),r.instanceColor!==null&&n.update(r.instanceColor,e.ARRAY_BUFFER),a.set(r,o))),r.isSkinnedMesh){let e=r.skeleton;a.get(e)!==o&&(e.update(),a.set(e,o))}return l}function s(){a=new WeakMap}function c(e){let t=e.target;t.removeEventListener(`dispose`,c),r.releaseStatesOfObject(t),n.remove(t.instanceMatrix),t.instanceColor!==null&&n.remove(t.instanceColor)}return{update:o,dispose:s}}var rs={1:`LINEAR_TONE_MAPPING`,2:`REINHARD_TONE_MAPPING`,3:`CINEON_TONE_MAPPING`,4:`ACES_FILMIC_TONE_MAPPING`,6:`AGX_TONE_MAPPING`,7:`NEUTRAL_TONE_MAPPING`,5:`CUSTOM_TONE_MAPPING`};function is(e,t,n,r,i,a){let o=new qt(t,n,{type:e,depthBuffer:i,stencilBuffer:a,samples:r?4:0,depthTexture:i?new ji(t,n):void 0}),s=new qt(t,n,{type:v,depthBuffer:!1,stencilBuffer:!1}),c=new kr;c.setAttribute(`position`,new _r([-1,3,0,-1,-1,0,3,-1,0],3)),c.setAttribute(`uv`,new _r([0,2,0,0,2,0],2));let l=new ea({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),u=new Qr(c,l),d=new Ia(-1,1,1,-1,0,1),f=null,p=null,m=!1,h,g=null,_=[],y=!1;this.setSize=function(e,t){o.setSize(e,t),s.setSize(e,t);for(let n=0;n<_.length;n++){let r=_[n];r.setSize&&r.setSize(e,t)}},this.setEffects=function(e){_=e,y=_.length>0&&_[0].isRenderPass===!0;let t=o.width,n=o.height;for(let e=0;e<_.length;e++){let r=_[e];r.setSize&&r.setSize(t,n)}},this.begin=function(e,t){if(m||e.toneMapping===0&&_.length===0)return!1;if(g=t,t!==null){let e=t.width,n=t.height;(o.width!==e||o.height!==n)&&this.setSize(e,n)}return y===!1&&e.setRenderTarget(o),h=e.toneMapping,e.toneMapping=0,!0},this.hasRenderPass=function(){return y},this.end=function(e,t){e.toneMapping=h,m=!0;let n=o,r=s;for(let i=0;i<_.length;i++){let a=_[i];if(a.enabled!==!1&&(a.render(e,r,n,t),a.needsSwap!==!1)){let e=n;n=r,r=e}}if(f!==e.outputColorSpace||p!==e.toneMapping){f=e.outputColorSpace,p=e.toneMapping,l.defines={},Pt.getTransfer(f)===`srgb`&&(l.defines.SRGB_TRANSFER=``);let t=rs[p];t&&(l.defines[t]=``),l.needsUpdate=!0}l.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(g),e.render(u,d),g=null,m=!1},this.isCompositing=function(){return m},this.dispose=function(){o.depthTexture&&o.depthTexture.dispose(),o.dispose(),s.dispose(),c.dispose(),l.dispose()}}var as=new Wt,os=new ji(1,1),ss=new Jt,cs=new Yt,ls=new Ai,us=[],ds=[],fs=new Float32Array(16),ps=new Float32Array(9),ms=new Float32Array(4);function hs(e,t,n){let r=e[0];if(r<=0||r>0)return e;let i=t*n,a=us[i];if(a===void 0&&(a=new Float32Array(i),us[i]=a),t!==0){r.toArray(a,0);for(let r=1,i=0;r!==t;++r)i+=n,e[r].toArray(a,i)}return a}function gs(e,t){if(e.length!==t.length)return!1;for(let n=0,r=e.length;n<r;n++)if(e[n]!==t[n])return!1;return!0}function _s(e,t){for(let n=0,r=t.length;n<r;n++)e[n]=t[n]}function vs(e,t){let n=ds[t];n===void 0&&(n=new Int32Array(t),ds[t]=n);for(let r=0;r!==t;++r)n[r]=e.allocateTextureUnit();return n}function ys(e,t){let n=this.cache;n[0]!==t&&(e.uniform1f(this.addr,t),n[0]=t)}function bs(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2f(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(gs(n,t))return;e.uniform2fv(this.addr,t),_s(n,t)}}function xs(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3f(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else if(t.r!==void 0)(n[0]!==t.r||n[1]!==t.g||n[2]!==t.b)&&(e.uniform3f(this.addr,t.r,t.g,t.b),n[0]=t.r,n[1]=t.g,n[2]=t.b);else{if(gs(n,t))return;e.uniform3fv(this.addr,t),_s(n,t)}}function Ss(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4f(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(gs(n,t))return;e.uniform4fv(this.addr,t),_s(n,t)}}function Cs(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(gs(n,t))return;e.uniformMatrix2fv(this.addr,!1,t),_s(n,t)}else{if(gs(n,r))return;ms.set(r),e.uniformMatrix2fv(this.addr,!1,ms),_s(n,r)}}function ws(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(gs(n,t))return;e.uniformMatrix3fv(this.addr,!1,t),_s(n,t)}else{if(gs(n,r))return;ps.set(r),e.uniformMatrix3fv(this.addr,!1,ps),_s(n,r)}}function Ts(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(gs(n,t))return;e.uniformMatrix4fv(this.addr,!1,t),_s(n,t)}else{if(gs(n,r))return;fs.set(r),e.uniformMatrix4fv(this.addr,!1,fs),_s(n,r)}}function Es(e,t){let n=this.cache;n[0]!==t&&(e.uniform1i(this.addr,t),n[0]=t)}function Ds(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2i(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(gs(n,t))return;e.uniform2iv(this.addr,t),_s(n,t)}}function Os(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3i(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(gs(n,t))return;e.uniform3iv(this.addr,t),_s(n,t)}}function ks(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4i(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(gs(n,t))return;e.uniform4iv(this.addr,t),_s(n,t)}}function As(e,t){let n=this.cache;n[0]!==t&&(e.uniform1ui(this.addr,t),n[0]=t)}function js(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2ui(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(gs(n,t))return;e.uniform2uiv(this.addr,t),_s(n,t)}}function Ms(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3ui(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(gs(n,t))return;e.uniform3uiv(this.addr,t),_s(n,t)}}function Ns(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(gs(n,t))return;e.uniform4uiv(this.addr,t),_s(n,t)}}function Ps(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i);let a;this.type===e.SAMPLER_2D_SHADOW?(os.compareFunction=n.isReversedDepthBuffer()?518:515,a=os):a=as,n.setTexture2D(t||a,i)}function Fs(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture3D(t||cs,i)}function Is(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTextureCube(t||ls,i)}function Ls(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture2DArray(t||ss,i)}function Rs(e){switch(e){case 5126:return ys;case 35664:return bs;case 35665:return xs;case 35666:return Ss;case 35674:return Cs;case 35675:return ws;case 35676:return Ts;case 5124:case 35670:return Es;case 35667:case 35671:return Ds;case 35668:case 35672:return Os;case 35669:case 35673:return ks;case 5125:return As;case 36294:return js;case 36295:return Ms;case 36296:return Ns;case 35678:case 36198:case 36298:case 36306:case 35682:return Ps;case 35679:case 36299:case 36307:return Fs;case 35680:case 36300:case 36308:case 36293:return Is;case 36289:case 36303:case 36311:case 36292:return Ls}}function zs(e,t){e.uniform1fv(this.addr,t)}function Bs(e,t){let n=hs(t,this.size,2);e.uniform2fv(this.addr,n)}function Vs(e,t){let n=hs(t,this.size,3);e.uniform3fv(this.addr,n)}function Hs(e,t){let n=hs(t,this.size,4);e.uniform4fv(this.addr,n)}function Us(e,t){let n=hs(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,n)}function Ws(e,t){let n=hs(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,n)}function Gs(e,t){let n=hs(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,n)}function Ks(e,t){e.uniform1iv(this.addr,t)}function qs(e,t){e.uniform2iv(this.addr,t)}function Js(e,t){e.uniform3iv(this.addr,t)}function Ys(e,t){e.uniform4iv(this.addr,t)}function Xs(e,t){e.uniform1uiv(this.addr,t)}function Zs(e,t){e.uniform2uiv(this.addr,t)}function Qs(e,t){e.uniform3uiv(this.addr,t)}function $s(e,t){e.uniform4uiv(this.addr,t)}function ec(e,t,n){let r=this.cache,i=t.length,a=vs(n,i);gs(r,a)||(e.uniform1iv(this.addr,a),_s(r,a));let o;o=this.type===e.SAMPLER_2D_SHADOW?os:as;for(let e=0;e!==i;++e)n.setTexture2D(t[e]||o,a[e])}function tc(e,t,n){let r=this.cache,i=t.length,a=vs(n,i);gs(r,a)||(e.uniform1iv(this.addr,a),_s(r,a));for(let e=0;e!==i;++e)n.setTexture3D(t[e]||cs,a[e])}function nc(e,t,n){let r=this.cache,i=t.length,a=vs(n,i);gs(r,a)||(e.uniform1iv(this.addr,a),_s(r,a));for(let e=0;e!==i;++e)n.setTextureCube(t[e]||ls,a[e])}function rc(e,t,n){let r=this.cache,i=t.length,a=vs(n,i);gs(r,a)||(e.uniform1iv(this.addr,a),_s(r,a));for(let e=0;e!==i;++e)n.setTexture2DArray(t[e]||ss,a[e])}function ic(e){switch(e){case 5126:return zs;case 35664:return Bs;case 35665:return Vs;case 35666:return Hs;case 35674:return Us;case 35675:return Ws;case 35676:return Gs;case 5124:case 35670:return Ks;case 35667:case 35671:return qs;case 35668:case 35672:return Js;case 35669:case 35673:return Ys;case 5125:return Xs;case 36294:return Zs;case 36295:return Qs;case 36296:return $s;case 35678:case 36198:case 36298:case 36306:case 35682:return ec;case 35679:case 36299:case 36307:return tc;case 35680:case 36300:case 36308:case 36293:return nc;case 36289:case 36303:case 36311:case 36292:return rc}}var ac=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=Rs(t.type)}},oc=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=ic(t.type)}},sc=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let r=this.seq;for(let i=0,a=r.length;i!==a;++i){let a=r[i];a.setValue(e,t[a.id],n)}}},cc=/(\w+)(\])?(\[|\.)?/g;function lc(e,t){e.seq.push(t),e.map[t.id]=t}function uc(e,t,n){let r=e.name,i=r.length;for(cc.lastIndex=0;;){let a=cc.exec(r),o=cc.lastIndex,s=a[1],c=a[2]===`]`,l=a[3];if(c&&(s|=0),l===void 0||l===`[`&&o+2===i){lc(n,l===void 0?new ac(s,e,t):new oc(s,e,t));break}{let e=n.map[s];e===void 0&&(e=new sc(s),lc(n,e)),n=e}}}var dc=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let r=0;r<n;++r){let n=e.getActiveUniform(t,r);uc(n,e.getUniformLocation(t,n.name),this)}let r=[],i=[];for(let t of this.seq)t.type===e.SAMPLER_2D_SHADOW||t.type===e.SAMPLER_CUBE_SHADOW||t.type===e.SAMPLER_2D_ARRAY_SHADOW?r.push(t):i.push(t);r.length>0&&(this.seq=r.concat(i))}setValue(e,t,n,r){let i=this.map[t];i!==void 0&&i.setValue(e,n,r)}setOptional(e,t,n){let r=t[n];r!==void 0&&this.setValue(e,n,r)}static upload(e,t,n,r){for(let i=0,a=t.length;i!==a;++i){let a=t[i],o=n[a.id];o.needsUpdate!==!1&&a.setValue(e,o.value,r)}}static seqWithValue(e,t){let n=[];for(let r=0,i=e.length;r!==i;++r){let i=e[r];i.id in t&&n.push(i)}return n}};function fc(e,t,n){let r=e.createShader(t);return e.shaderSource(r,n),e.compileShader(r),r}var pc=37297,mc=0;function hc(e,t){let n=e.split(`
`),r=[],i=Math.max(t-6,0),a=Math.min(t+6,n.length);for(let e=i;e<a;e++){let i=e+1;r.push(`${i===t?`>`:` `} ${i}: ${n[e]}`)}return r.join(`
`)}var gc=new kt;function _c(e){Pt._getMatrix(gc,Pt.workingColorSpace,e);let t=`mat3( ${gc.elements.map(e=>e.toFixed(4))} )`;switch(Pt.getTransfer(e)){case Pe:return[t,`LinearTransferOETF`];case Fe:return[t,`sRGBTransferOETF`];default:return Ke(`WebGLProgram: Unsupported color space: `,e),[t,`LinearTransferOETF`]}}function vc(e,t,n){let r=e.getShaderParameter(t,e.COMPILE_STATUS),i=(e.getShaderInfoLog(t)||``).trim();if(r&&i===``)return``;let a=/ERROR: 0:(\d+)/.exec(i);if(a){let r=parseInt(a[1]);return n.toUpperCase()+`

`+i+`

`+hc(e.getShaderSource(t),r)}return i}function yc(e,t){let n=_c(t);return[`vec4 ${e}( vec4 value ) {`,`	return ${n[1]}( vec4( value.rgb * ${n[0]}, value.a ) );`,`}`].join(`
`)}var bc={1:`Linear`,2:`Reinhard`,3:`Cineon`,4:`ACESFilmic`,6:`AgX`,7:`Neutral`,5:`Custom`};function xc(e,t){let n=bc[t];return n===void 0?(Ke(`WebGLProgram: Unsupported toneMapping:`,t),`vec3 `+e+`( vec3 color ) { return LinearToneMapping( color ); }`):`vec3 `+e+`( vec3 color ) { return `+n+`ToneMapping( color ); }`}var Sc=new q;function Cc(){return Pt.getLuminanceCoefficients(Sc),[`float luminance( const in vec3 rgb ) {`,`	const vec3 weights = vec3( ${Sc.x.toFixed(4)}, ${Sc.y.toFixed(4)}, ${Sc.z.toFixed(4)} );`,`	return dot( weights, rgb );`,`}`].join(`
`)}function wc(e){return[e.extensionClipCullDistance?`#extension GL_ANGLE_clip_cull_distance : require`:``,e.extensionMultiDraw?`#extension GL_ANGLE_multi_draw : require`:``].filter(Dc).join(`
`)}function Tc(e){let t=[];for(let n in e){let r=e[n];r!==!1&&t.push(`#define `+n+` `+r)}return t.join(`
`)}function Ec(e,t){let n={},r=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let i=0;i<r;i++){let r=e.getActiveAttrib(t,i),a=r.name,o=1;r.type===e.FLOAT_MAT2&&(o=2),r.type===e.FLOAT_MAT3&&(o=3),r.type===e.FLOAT_MAT4&&(o=4),n[a]={type:r.type,location:e.getAttribLocation(t,a),locationSize:o}}return n}function Dc(e){return e!==``}function Oc(e,t){let n=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,n).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function kc(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var Ac=/^[ \t]*#include +<([\w\d./]+)>/gm;function jc(e){return e.replace(Ac,Nc)}var Mc=new Map;function Nc(e,t){let n=yo[t];if(n===void 0){let e=Mc.get(t);if(e!==void 0)n=yo[e],Ke(`WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.`,t,e);else throw Error(`THREE.WebGLProgram: Can not resolve #include <`+t+`>`)}return jc(n)}var Pc=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Fc(e){return e.replace(Pc,Ic)}function Ic(e,t,n,r){let i=``;for(let e=parseInt(t);e<parseInt(n);e++)i+=r.replace(/\[\s*i\s*\]/g,`[ `+e+` ]`).replace(/UNROLLED_LOOP_INDEX/g,e);return i}function Lc(e){let t=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision===`highp`?t+=`
#define HIGH_PRECISION`:e.precision===`mediump`?t+=`
#define MEDIUM_PRECISION`:e.precision===`lowp`&&(t+=`
#define LOW_PRECISION`),t}var Rc={1:`SHADOWMAP_TYPE_PCF`,3:`SHADOWMAP_TYPE_VSM`};function zc(e){return Rc[e.shadowMapType]||`SHADOWMAP_TYPE_BASIC`}var Bc={301:`ENVMAP_TYPE_CUBE`,302:`ENVMAP_TYPE_CUBE`,306:`ENVMAP_TYPE_CUBE_UV`};function Vc(e){return e.envMap===!1?`ENVMAP_TYPE_CUBE`:Bc[e.envMapMode]||`ENVMAP_TYPE_CUBE`}var Hc={302:`ENVMAP_MODE_REFRACTION`};function Uc(e){return e.envMap===!1?`ENVMAP_MODE_REFLECTION`:Hc[e.envMapMode]||`ENVMAP_MODE_REFLECTION`}var Wc={0:`ENVMAP_BLENDING_MULTIPLY`,1:`ENVMAP_BLENDING_MIX`,2:`ENVMAP_BLENDING_ADD`};function Gc(e){return e.envMap===!1?`ENVMAP_BLENDING_NONE`:Wc[e.combine]||`ENVMAP_BLENDING_NONE`}function Kc(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let n=Math.log2(t)-2,r=1/t;return{texelWidth:1/(3*Math.max(2**n,112)),texelHeight:r,maxMip:n}}function qc(e,t,n,r){let i=e.getContext(),a=n.defines,o=n.vertexShader,s=n.fragmentShader,c=zc(n),l=Vc(n),u=Uc(n),d=Gc(n),f=Kc(n),p=wc(n),m=Tc(a),h=i.createProgram(),g,_,v=n.glslVersion?`#version `+n.glslVersion+`
`:``;n.isRawShaderMaterial?(g=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(Dc).join(`
`),g.length>0&&(g+=`
`),_=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(Dc).join(`
`),_.length>0&&(_+=`
`)):(g=[Lc(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.extensionClipCullDistance?`#define USE_CLIP_DISTANCE`:``,n.batching?`#define USE_BATCHING`:``,n.batchingColor?`#define USE_BATCHING_COLOR`:``,n.instancing?`#define USE_INSTANCING`:``,n.instancingColor?`#define USE_INSTANCING_COLOR`:``,n.instancingMorph?`#define USE_INSTANCING_MORPH`:``,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.map?`#define USE_MAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+u:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.displacementMap?`#define USE_DISPLACEMENTMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.mapUv?`#define MAP_UV `+n.mapUv:``,n.alphaMapUv?`#define ALPHAMAP_UV `+n.alphaMapUv:``,n.lightMapUv?`#define LIGHTMAP_UV `+n.lightMapUv:``,n.aoMapUv?`#define AOMAP_UV `+n.aoMapUv:``,n.emissiveMapUv?`#define EMISSIVEMAP_UV `+n.emissiveMapUv:``,n.bumpMapUv?`#define BUMPMAP_UV `+n.bumpMapUv:``,n.normalMapUv?`#define NORMALMAP_UV `+n.normalMapUv:``,n.displacementMapUv?`#define DISPLACEMENTMAP_UV `+n.displacementMapUv:``,n.metalnessMapUv?`#define METALNESSMAP_UV `+n.metalnessMapUv:``,n.roughnessMapUv?`#define ROUGHNESSMAP_UV `+n.roughnessMapUv:``,n.anisotropyMapUv?`#define ANISOTROPYMAP_UV `+n.anisotropyMapUv:``,n.clearcoatMapUv?`#define CLEARCOATMAP_UV `+n.clearcoatMapUv:``,n.clearcoatNormalMapUv?`#define CLEARCOAT_NORMALMAP_UV `+n.clearcoatNormalMapUv:``,n.clearcoatRoughnessMapUv?`#define CLEARCOAT_ROUGHNESSMAP_UV `+n.clearcoatRoughnessMapUv:``,n.iridescenceMapUv?`#define IRIDESCENCEMAP_UV `+n.iridescenceMapUv:``,n.iridescenceThicknessMapUv?`#define IRIDESCENCE_THICKNESSMAP_UV `+n.iridescenceThicknessMapUv:``,n.sheenColorMapUv?`#define SHEEN_COLORMAP_UV `+n.sheenColorMapUv:``,n.sheenRoughnessMapUv?`#define SHEEN_ROUGHNESSMAP_UV `+n.sheenRoughnessMapUv:``,n.specularMapUv?`#define SPECULARMAP_UV `+n.specularMapUv:``,n.specularColorMapUv?`#define SPECULAR_COLORMAP_UV `+n.specularColorMapUv:``,n.specularIntensityMapUv?`#define SPECULAR_INTENSITYMAP_UV `+n.specularIntensityMapUv:``,n.transmissionMapUv?`#define TRANSMISSIONMAP_UV `+n.transmissionMapUv:``,n.thicknessMapUv?`#define THICKNESSMAP_UV `+n.thicknessMapUv:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexNormals?`#define HAS_NORMAL`:``,n.vertexColors?`#define USE_COLOR`:``,n.vertexAlphas?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.flatShading?`#define FLAT_SHADED`:``,n.skinning?`#define USE_SKINNING`:``,n.morphTargets?`#define USE_MORPHTARGETS`:``,n.morphNormals&&n.flatShading===!1?`#define USE_MORPHNORMALS`:``,n.morphColors?`#define USE_MORPHCOLORS`:``,n.morphTargetsCount>0?`#define MORPHTARGETS_TEXTURE_STRIDE `+n.morphTextureStride:``,n.morphTargetsCount>0?`#define MORPHTARGETS_COUNT `+n.morphTargetsCount:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.sizeAttenuation?`#define USE_SIZEATTENUATION`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 modelMatrix;`,`uniform mat4 modelViewMatrix;`,`uniform mat4 projectionMatrix;`,`uniform mat4 viewMatrix;`,`uniform mat3 normalMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,`#ifdef USE_INSTANCING`,`	attribute mat4 instanceMatrix;`,`#endif`,`#ifdef USE_INSTANCING_COLOR`,`	attribute vec3 instanceColor;`,`#endif`,`#ifdef USE_INSTANCING_MORPH`,`	uniform sampler2D morphTexture;`,`#endif`,`attribute vec3 position;`,`attribute vec3 normal;`,`attribute vec2 uv;`,`#ifdef USE_UV1`,`	attribute vec2 uv1;`,`#endif`,`#ifdef USE_UV2`,`	attribute vec2 uv2;`,`#endif`,`#ifdef USE_UV3`,`	attribute vec2 uv3;`,`#endif`,`#ifdef USE_TANGENT`,`	attribute vec4 tangent;`,`#endif`,`#if defined( USE_COLOR_ALPHA )`,`	attribute vec4 color;`,`#elif defined( USE_COLOR )`,`	attribute vec3 color;`,`#endif`,`#ifdef USE_SKINNING`,`	attribute vec4 skinIndex;`,`	attribute vec4 skinWeight;`,`#endif`,`
`].filter(Dc).join(`
`),_=[Lc(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.alphaToCoverage?`#define ALPHA_TO_COVERAGE`:``,n.map?`#define USE_MAP`:``,n.matcap?`#define USE_MATCAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+l:``,n.envMap?`#define `+u:``,n.envMap?`#define `+d:``,f?`#define CUBEUV_TEXEL_WIDTH `+f.texelWidth:``,f?`#define CUBEUV_TEXEL_HEIGHT `+f.texelHeight:``,f?`#define CUBEUV_MAX_MIP `+f.maxMip+`.0`:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.packedNormalMap?`#define USE_PACKED_NORMALMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoat?`#define USE_CLEARCOAT`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.dispersion?`#define USE_DISPERSION`:``,n.iridescence?`#define USE_IRIDESCENCE`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaTest?`#define USE_ALPHATEST`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.sheen?`#define USE_SHEEN`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexColors||n.instancingColor?`#define USE_COLOR`:``,n.vertexAlphas||n.batchingColor?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.gradientMap?`#define USE_GRADIENTMAP`:``,n.flatShading?`#define FLAT_SHADED`:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.premultipliedAlpha?`#define PREMULTIPLIED_ALPHA`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.numLightProbeGrids>0?`#define USE_LIGHT_PROBES_GRID`:``,n.decodeVideoTexture?`#define DECODE_VIDEO_TEXTURE`:``,n.decodeVideoTextureEmissive?`#define DECODE_VIDEO_TEXTURE_EMISSIVE`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 viewMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,n.toneMapping===0?``:`#define TONE_MAPPING`,n.toneMapping===0?``:yo.tonemapping_pars_fragment,n.toneMapping===0?``:xc(`toneMapping`,n.toneMapping),n.dithering?`#define DITHERING`:``,n.opaque?`#define OPAQUE`:``,yo.colorspace_pars_fragment,yc(`linearToOutputTexel`,n.outputColorSpace),Cc(),n.useDepthPacking?`#define DEPTH_PACKING `+n.depthPacking:``,`
`].filter(Dc).join(`
`)),o=jc(o),o=Oc(o,n),o=kc(o,n),s=jc(s),s=Oc(s,n),s=kc(s,n),o=Fc(o),s=Fc(s),n.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,g=[p,`#define attribute in`,`#define varying out`,`#define texture2D texture`].join(`
`)+`
`+g,_=[`#define varying in`,n.glslVersion===`300 es`?``:`layout(location = 0) out highp vec4 pc_fragColor;`,n.glslVersion===`300 es`?``:`#define gl_FragColor pc_fragColor`,`#define gl_FragDepthEXT gl_FragDepth`,`#define texture2D texture`,`#define textureCube texture`,`#define texture2DProj textureProj`,`#define texture2DLodEXT textureLod`,`#define texture2DProjLodEXT textureProjLod`,`#define textureCubeLodEXT textureLod`,`#define texture2DGradEXT textureGrad`,`#define texture2DProjGradEXT textureProjGrad`,`#define textureCubeGradEXT textureGrad`].join(`
`)+`
`+_);let y=v+g+o,b=v+_+s,x=fc(i,i.VERTEX_SHADER,y),S=fc(i,i.FRAGMENT_SHADER,b);i.attachShader(h,x),i.attachShader(h,S),n.index0AttributeName===void 0?n.hasPositionAttribute===!0&&i.bindAttribLocation(h,0,`position`):i.bindAttribLocation(h,0,n.index0AttributeName),i.linkProgram(h);function C(t){if(e.debug.checkShaderErrors){let n=i.getProgramInfoLog(h)||``,r=i.getShaderInfoLog(x)||``,a=i.getShaderInfoLog(S)||``,o=n.trim(),s=r.trim(),c=a.trim(),l=!0,u=!0;if(i.getProgramParameter(h,i.LINK_STATUS)===!1){if(l=!1,typeof e.debug.onShaderError==`function`)e.debug.onShaderError(i,h,x,S);else{let e=vc(i,x,`vertex`),n=vc(i,S,`fragment`);qe(`WebGLProgram: Shader Error `+i.getError()+` - VALIDATE_STATUS `+i.getProgramParameter(h,i.VALIDATE_STATUS)+`

Material Name: `+t.name+`
Material Type: `+t.type+`

Program Info Log: `+o+`
`+e+`
`+n)}}else o===``?(s===``||c===``)&&(u=!1):Ke(`WebGLProgram: Program Info Log:`,o);u&&(t.diagnostics={runnable:l,programLog:o,vertexShader:{log:s,prefix:g},fragmentShader:{log:c,prefix:_}})}i.deleteShader(x),i.deleteShader(S),w=new dc(i,h),T=Ec(i,h)}let w;this.getUniforms=function(){return w===void 0&&C(this),w};let T;this.getAttributes=function(){return T===void 0&&C(this),T};let E=n.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return E===!1&&(E=i.getProgramParameter(h,pc)),E},this.destroy=function(){r.releaseStatesOfProgram(this),i.deleteProgram(h),this.program=void 0},this.type=n.shaderType,this.name=n.shaderName,this.id=mc++,this.cacheKey=t,this.usedTimes=1,this.program=h,this.vertexShader=x,this.fragmentShader=S,this}var Jc=0,Yc=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){let r=this._getShaderCacheForMaterial(e);return r.has(t)===!1&&(r.add(t),t.usedTimes++),r.has(n)===!1&&(r.add(n),n.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let e of t)e.usedTimes--,e.usedTimes===0&&this.shaderCache.delete(e.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new Xc(e),t.set(e,n)),n}},Xc=class{constructor(e){this.id=Jc++,this.code=e,this.usedTimes=0}};function Zc(e){return e===1030||e===37490||e===36285}function Qc(e,t,n,r,i,a){let o=new cn,s=new Yc,c=new Set,l=[],u=new Map,d=r.logarithmicDepthBuffer,f=r.precision,p={MeshDepthMaterial:`depth`,MeshDistanceMaterial:`distance`,MeshNormalMaterial:`normal`,MeshBasicMaterial:`basic`,MeshLambertMaterial:`lambert`,MeshPhongMaterial:`phong`,MeshToonMaterial:`toon`,MeshStandardMaterial:`physical`,MeshPhysicalMaterial:`physical`,MeshMatcapMaterial:`matcap`,LineBasicMaterial:`basic`,LineDashedMaterial:`dashed`,PointsMaterial:`points`,ShadowMaterial:`shadow`,SpriteMaterial:`sprite`};function m(e){return c.add(e),e===0?`uv`:`uv${e}`}function h(i,o,l,u,h,g){let _=u.fog,v=h.geometry,y=i.isMeshStandardMaterial||i.isMeshLambertMaterial||i.isMeshPhongMaterial?u.environment:null,b=i.isMeshStandardMaterial||i.isMeshLambertMaterial&&!i.envMap||i.isMeshPhongMaterial&&!i.envMap,x=t.get(i.envMap||y,b),S=x&&x.mapping===306?x.image.height:null,C=p[i.type];i.precision!==null&&(f=r.getMaxPrecision(i.precision),f!==i.precision&&Ke(`WebGLProgram.getParameters:`,i.precision,`not supported, using`,f,`instead.`));let w=v.morphAttributes.position||v.morphAttributes.normal||v.morphAttributes.color,T=w===void 0?0:w.length,E=0;v.morphAttributes.position!==void 0&&(E=1),v.morphAttributes.normal!==void 0&&(E=2),v.morphAttributes.color!==void 0&&(E=3);let D,O,k,A;if(C){let e=bo[C];D=e.vertexShader,O=e.fragmentShader}else{D=i.vertexShader,O=i.fragmentShader;let e=s.getVertexShaderStage(i),t=s.getFragmentShaderStage(i);s.update(i,e,t),k=e.id,A=t.id}let j=e.getRenderTarget(),M=e.state.buffers.depth.getReversed(),N=h.isInstancedMesh===!0,P=h.isBatchedMesh===!0,F=!!i.map,I=!!i.matcap,L=!!x,R=!!i.aoMap,ee=!!i.lightMap,te=!!i.bumpMap&&i.wireframe===!1,z=!!i.normalMap,ne=!!i.displacementMap,re=!!i.emissiveMap,B=!!i.metalnessMap,V=!!i.roughnessMap,H=i.anisotropy>0,ie=i.clearcoat>0,ae=i.dispersion>0,oe=i.iridescence>0,se=i.sheen>0,ce=i.transmission>0,le=H&&!!i.anisotropyMap,ue=ie&&!!i.clearcoatMap,de=ie&&!!i.clearcoatNormalMap,U=ie&&!!i.clearcoatRoughnessMap,fe=oe&&!!i.iridescenceMap,pe=oe&&!!i.iridescenceThicknessMap,me=se&&!!i.sheenColorMap,he=se&&!!i.sheenRoughnessMap,ge=!!i.specularMap,_e=!!i.specularColorMap,ve=!!i.specularIntensityMap,ye=ce&&!!i.transmissionMap,be=ce&&!!i.thicknessMap,xe=!!i.gradientMap,Se=!!i.alphaMap,Ce=i.alphaTest>0,we=!!i.alphaHash,W=!!i.extensions,Te=0;i.toneMapped&&(j===null||j.isXRRenderTarget===!0)&&(Te=e.toneMapping);let Ee={shaderID:C,shaderType:i.type,shaderName:i.name,vertexShader:D,fragmentShader:O,defines:i.defines,customVertexShaderID:k,customFragmentShaderID:A,isRawShaderMaterial:i.isRawShaderMaterial===!0,glslVersion:i.glslVersion,precision:f,batching:P,batchingColor:P&&h._colorsTexture!==null,instancing:N,instancingColor:N&&h.instanceColor!==null,instancingMorph:N&&h.morphTexture!==null,outputColorSpace:j===null?e.outputColorSpace:j.isXRRenderTarget===!0?j.texture.colorSpace:Pt.workingColorSpace,alphaToCoverage:!!i.alphaToCoverage,map:F,matcap:I,envMap:L,envMapMode:L&&x.mapping,envMapCubeUVHeight:S,aoMap:R,lightMap:ee,bumpMap:te,normalMap:z,displacementMap:ne,emissiveMap:re,normalMapObjectSpace:z&&i.normalMapType===1,normalMapTangentSpace:z&&i.normalMapType===0,packedNormalMap:z&&i.normalMapType===0&&Zc(i.normalMap.format),metalnessMap:B,roughnessMap:V,anisotropy:H,anisotropyMap:le,clearcoat:ie,clearcoatMap:ue,clearcoatNormalMap:de,clearcoatRoughnessMap:U,dispersion:ae,iridescence:oe,iridescenceMap:fe,iridescenceThicknessMap:pe,sheen:se,sheenColorMap:me,sheenRoughnessMap:he,specularMap:ge,specularColorMap:_e,specularIntensityMap:ve,transmission:ce,transmissionMap:ye,thicknessMap:be,gradientMap:xe,opaque:i.transparent===!1&&i.blending===1&&i.alphaToCoverage===!1,alphaMap:Se,alphaTest:Ce,alphaHash:we,combine:i.combine,mapUv:F&&m(i.map.channel),aoMapUv:R&&m(i.aoMap.channel),lightMapUv:ee&&m(i.lightMap.channel),bumpMapUv:te&&m(i.bumpMap.channel),normalMapUv:z&&m(i.normalMap.channel),displacementMapUv:ne&&m(i.displacementMap.channel),emissiveMapUv:re&&m(i.emissiveMap.channel),metalnessMapUv:B&&m(i.metalnessMap.channel),roughnessMapUv:V&&m(i.roughnessMap.channel),anisotropyMapUv:le&&m(i.anisotropyMap.channel),clearcoatMapUv:ue&&m(i.clearcoatMap.channel),clearcoatNormalMapUv:de&&m(i.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:U&&m(i.clearcoatRoughnessMap.channel),iridescenceMapUv:fe&&m(i.iridescenceMap.channel),iridescenceThicknessMapUv:pe&&m(i.iridescenceThicknessMap.channel),sheenColorMapUv:me&&m(i.sheenColorMap.channel),sheenRoughnessMapUv:he&&m(i.sheenRoughnessMap.channel),specularMapUv:ge&&m(i.specularMap.channel),specularColorMapUv:_e&&m(i.specularColorMap.channel),specularIntensityMapUv:ve&&m(i.specularIntensityMap.channel),transmissionMapUv:ye&&m(i.transmissionMap.channel),thicknessMapUv:be&&m(i.thicknessMap.channel),alphaMapUv:Se&&m(i.alphaMap.channel),vertexTangents:!!v.attributes.tangent&&(z||H),vertexNormals:!!v.attributes.normal,vertexColors:i.vertexColors,vertexAlphas:i.vertexColors===!0&&!!v.attributes.color&&v.attributes.color.itemSize===4,pointsUvs:h.isPoints===!0&&!!v.attributes.uv&&(F||Se),fog:!!_,useFog:i.fog===!0,fogExp2:!!_&&_.isFogExp2,flatShading:i.wireframe===!1&&(i.flatShading===!0||v.attributes.normal===void 0&&z===!1&&(i.isMeshLambertMaterial||i.isMeshPhongMaterial||i.isMeshStandardMaterial||i.isMeshPhysicalMaterial)),sizeAttenuation:i.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:M,skinning:h.isSkinnedMesh===!0,hasPositionAttribute:v.attributes.position!==void 0,morphTargets:v.morphAttributes.position!==void 0,morphNormals:v.morphAttributes.normal!==void 0,morphColors:v.morphAttributes.color!==void 0,morphTargetsCount:T,morphTextureStride:E,numDirLights:o.directional.length,numPointLights:o.point.length,numSpotLights:o.spot.length,numSpotLightMaps:o.spotLightMap.length,numRectAreaLights:o.rectArea.length,numHemiLights:o.hemi.length,numDirLightShadows:o.directionalShadowMap.length,numPointLightShadows:o.pointShadowMap.length,numSpotLightShadows:o.spotShadowMap.length,numSpotLightShadowsWithMaps:o.numSpotLightShadowsWithMaps,numLightProbes:o.numLightProbes,numLightProbeGrids:g.length,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:i.dithering,shadowMapEnabled:e.shadowMap.enabled&&l.length>0,shadowMapType:e.shadowMap.type,toneMapping:Te,decodeVideoTexture:F&&i.map.isVideoTexture===!0&&Pt.getTransfer(i.map.colorSpace)===`srgb`,decodeVideoTextureEmissive:re&&i.emissiveMap.isVideoTexture===!0&&Pt.getTransfer(i.emissiveMap.colorSpace)===`srgb`,premultipliedAlpha:i.premultipliedAlpha,doubleSided:i.side===2,flipSided:i.side===1,useDepthPacking:i.depthPacking>=0,depthPacking:i.depthPacking||0,index0AttributeName:i.index0AttributeName,extensionClipCullDistance:W&&i.extensions.clipCullDistance===!0&&n.has(`WEBGL_clip_cull_distance`),extensionMultiDraw:(W&&i.extensions.multiDraw===!0||P)&&n.has(`WEBGL_multi_draw`),rendererExtensionParallelShaderCompile:n.has(`KHR_parallel_shader_compile`),customProgramCacheKey:i.customProgramCacheKey()};return Ee.vertexUv1s=c.has(1),Ee.vertexUv2s=c.has(2),Ee.vertexUv3s=c.has(3),c.clear(),Ee}function g(t){let n=[];if(t.shaderID?n.push(t.shaderID):(n.push(t.customVertexShaderID),n.push(t.customFragmentShaderID)),t.defines!==void 0)for(let e in t.defines)n.push(e),n.push(t.defines[e]);return t.isRawShaderMaterial===!1&&(_(n,t),v(n,t),n.push(e.outputColorSpace)),n.push(t.customProgramCacheKey),n.join()}function _(e,t){e.push(t.precision),e.push(t.outputColorSpace),e.push(t.envMapMode),e.push(t.envMapCubeUVHeight),e.push(t.mapUv),e.push(t.alphaMapUv),e.push(t.lightMapUv),e.push(t.aoMapUv),e.push(t.bumpMapUv),e.push(t.normalMapUv),e.push(t.displacementMapUv),e.push(t.emissiveMapUv),e.push(t.metalnessMapUv),e.push(t.roughnessMapUv),e.push(t.anisotropyMapUv),e.push(t.clearcoatMapUv),e.push(t.clearcoatNormalMapUv),e.push(t.clearcoatRoughnessMapUv),e.push(t.iridescenceMapUv),e.push(t.iridescenceThicknessMapUv),e.push(t.sheenColorMapUv),e.push(t.sheenRoughnessMapUv),e.push(t.specularMapUv),e.push(t.specularColorMapUv),e.push(t.specularIntensityMapUv),e.push(t.transmissionMapUv),e.push(t.thicknessMapUv),e.push(t.combine),e.push(t.fogExp2),e.push(t.sizeAttenuation),e.push(t.morphTargetsCount),e.push(t.morphAttributeCount),e.push(t.numDirLights),e.push(t.numPointLights),e.push(t.numSpotLights),e.push(t.numSpotLightMaps),e.push(t.numHemiLights),e.push(t.numRectAreaLights),e.push(t.numDirLightShadows),e.push(t.numPointLightShadows),e.push(t.numSpotLightShadows),e.push(t.numSpotLightShadowsWithMaps),e.push(t.numLightProbes),e.push(t.shadowMapType),e.push(t.toneMapping),e.push(t.numClippingPlanes),e.push(t.numClipIntersection),e.push(t.depthPacking)}function v(e,t){o.disableAll(),t.instancing&&o.enable(0),t.instancingColor&&o.enable(1),t.instancingMorph&&o.enable(2),t.matcap&&o.enable(3),t.envMap&&o.enable(4),t.normalMapObjectSpace&&o.enable(5),t.normalMapTangentSpace&&o.enable(6),t.clearcoat&&o.enable(7),t.iridescence&&o.enable(8),t.alphaTest&&o.enable(9),t.vertexColors&&o.enable(10),t.vertexAlphas&&o.enable(11),t.vertexUv1s&&o.enable(12),t.vertexUv2s&&o.enable(13),t.vertexUv3s&&o.enable(14),t.vertexTangents&&o.enable(15),t.anisotropy&&o.enable(16),t.alphaHash&&o.enable(17),t.batching&&o.enable(18),t.dispersion&&o.enable(19),t.batchingColor&&o.enable(20),t.gradientMap&&o.enable(21),t.packedNormalMap&&o.enable(22),t.vertexNormals&&o.enable(23),e.push(o.mask),o.disableAll(),t.fog&&o.enable(0),t.useFog&&o.enable(1),t.flatShading&&o.enable(2),t.logarithmicDepthBuffer&&o.enable(3),t.reversedDepthBuffer&&o.enable(4),t.skinning&&o.enable(5),t.morphTargets&&o.enable(6),t.morphNormals&&o.enable(7),t.morphColors&&o.enable(8),t.premultipliedAlpha&&o.enable(9),t.shadowMapEnabled&&o.enable(10),t.doubleSided&&o.enable(11),t.flipSided&&o.enable(12),t.useDepthPacking&&o.enable(13),t.dithering&&o.enable(14),t.transmission&&o.enable(15),t.sheen&&o.enable(16),t.opaque&&o.enable(17),t.pointsUvs&&o.enable(18),t.decodeVideoTexture&&o.enable(19),t.decodeVideoTextureEmissive&&o.enable(20),t.alphaToCoverage&&o.enable(21),t.numLightProbeGrids>0&&o.enable(22),t.hasPositionAttribute&&o.enable(23),e.push(o.mask)}function y(e){let t=p[e.type],n;if(t){let e=bo[t];n=Xi.clone(e.uniforms)}else n=e.uniforms;return n}function b(t,n){let r=u.get(n);return r===void 0?(r=new qc(e,n,t,i),l.push(r),u.set(n,r)):++r.usedTimes,r}function x(e){if(--e.usedTimes===0){let t=l.indexOf(e);l[t]=l[l.length-1],l.pop(),u.delete(e.cacheKey),e.destroy()}}function S(e){s.remove(e)}function C(){s.dispose()}return{getParameters:h,getProgramCacheKey:g,getUniforms:y,acquireProgram:b,releaseProgram:x,releaseShaderCache:S,programs:l,dispose:C}}function $c(){let e=new WeakMap;function t(t){return e.has(t)}function n(t){let n=e.get(t);return n===void 0&&(n={},e.set(t,n)),n}function r(t){e.delete(t)}function i(t,n,r){e.get(t)[n]=r}function a(){e=new WeakMap}return{has:t,get:n,remove:r,update:i,dispose:a}}function el(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.material.id===t.material.id?e.materialVariant===t.materialVariant?e.z===t.z?e.id-t.id:e.z-t.z:e.materialVariant-t.materialVariant:e.material.id-t.material.id:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function tl(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.z===t.z?e.id-t.id:t.z-e.z:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function nl(){let e=[],t=0,n=[],r=[],i=[];function a(){t=0,n.length=0,r.length=0,i.length=0}function o(e){let t=0;return e.isInstancedMesh&&(t+=2),e.isSkinnedMesh&&(t+=1),t}function s(n,r,i,a,s,c){let l=e[t];return l===void 0?(l={id:n.id,object:n,geometry:r,material:i,materialVariant:o(n),groupOrder:a,renderOrder:n.renderOrder,z:s,group:c},e[t]=l):(l.id=n.id,l.object=n,l.geometry=r,l.material=i,l.materialVariant=o(n),l.groupOrder=a,l.renderOrder=n.renderOrder,l.z=s,l.group=c),t++,l}function c(e,t,a,o,c,l){let u=s(e,t,a,o,c,l);a.transmission>0?r.push(u):a.transparent===!0?i.push(u):n.push(u)}function l(e,t,a,o,c,l){let u=s(e,t,a,o,c,l);a.transmission>0?r.unshift(u):a.transparent===!0?i.unshift(u):n.unshift(u)}function u(e,t,a){n.length>1&&n.sort(e||el),r.length>1&&r.sort(t||tl),i.length>1&&i.sort(t||tl),a&&(n.reverse(),r.reverse(),i.reverse())}function d(){for(let n=t,r=e.length;n<r;n++){let t=e[n];if(t.id===null)break;t.id=null,t.object=null,t.geometry=null,t.material=null,t.group=null}}return{opaque:n,transmissive:r,transparent:i,init:a,push:c,unshift:l,finish:d,sort:u}}function rl(){let e=new WeakMap;function t(t,n){let r=e.get(t),i;return r===void 0?(i=new nl,e.set(t,[i])):n>=r.length?(i=new nl,r.push(i)):i=r[n],i}function n(){e=new WeakMap}return{get:t,dispose:n}}function il(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`DirectionalLight`:n={direction:new q,color:new Mn};break;case`SpotLight`:n={position:new q,direction:new q,color:new Mn,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case`PointLight`:n={position:new q,color:new Mn,distance:0,decay:0};break;case`HemisphereLight`:n={direction:new q,skyColor:new Mn,groundColor:new Mn};break;case`RectAreaLight`:n={color:new Mn,position:new q,halfWidth:new q,halfHeight:new q}}return e[t.id]=n,n}}}function al(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`DirectionalLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Tt};break;case`SpotLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Tt};break;case`PointLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Tt,shadowCameraNear:1,shadowCameraFar:1e3}}return e[t.id]=n,n}}}var ol=0;function sl(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+ +!!t.map-!!e.map}function cl(e){let t=new il,n=al(),r={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let e=0;e<9;e++)r.probe.push(new q);let i=new q,a=new Xt,o=new Xt;function s(i){let a=0,o=0,s=0;for(let e=0;e<9;e++)r.probe[e].set(0,0,0);let c=0,l=0,u=0,d=0,f=0,p=0,m=0,h=0,g=0,_=0,v=0;i.sort(sl);for(let e=0,y=i.length;e<y;e++){let y=i[e],b=y.color,x=y.intensity,S=y.distance,C=null;if(y.shadow&&y.shadow.map&&(C=y.shadow.map.texture.format===1030?y.shadow.map.texture:y.shadow.map.depthTexture||y.shadow.map.texture),y.isAmbientLight)a+=b.r*x,o+=b.g*x,s+=b.b*x;else if(y.isLightProbe){for(let e=0;e<9;e++)r.probe[e].addScaledVector(y.sh.coefficients[e],x);v++}else if(y.isDirectionalLight){let e=t.get(y);if(e.color.copy(y.color).multiplyScalar(y.intensity),y.castShadow){let e=y.shadow,t=n.get(y);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,r.directionalShadow[c]=t,r.directionalShadowMap[c]=C,r.directionalShadowMatrix[c]=y.shadow.matrix,p++}r.directional[c]=e,c++}else if(y.isSpotLight){let e=t.get(y);e.position.setFromMatrixPosition(y.matrixWorld),e.color.copy(b).multiplyScalar(x),e.distance=S,e.coneCos=Math.cos(y.angle),e.penumbraCos=Math.cos(y.angle*(1-y.penumbra)),e.decay=y.decay,r.spot[u]=e;let i=y.shadow;if(y.map&&(r.spotLightMap[g]=y.map,g++,i.updateMatrices(y),y.castShadow&&_++),r.spotLightMatrix[u]=i.matrix,y.castShadow){let e=n.get(y);e.shadowIntensity=i.intensity,e.shadowBias=i.bias,e.shadowNormalBias=i.normalBias,e.shadowRadius=i.radius,e.shadowMapSize=i.mapSize,r.spotShadow[u]=e,r.spotShadowMap[u]=C,h++}u++}else if(y.isRectAreaLight){let e=t.get(y);e.color.copy(b).multiplyScalar(x),e.halfWidth.set(y.width*.5,0,0),e.halfHeight.set(0,y.height*.5,0),r.rectArea[d]=e,d++}else if(y.isPointLight){let e=t.get(y);if(e.color.copy(y.color).multiplyScalar(y.intensity),e.distance=y.distance,e.decay=y.decay,y.castShadow){let e=y.shadow,t=n.get(y);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,t.shadowCameraNear=e.camera.near,t.shadowCameraFar=e.camera.far,r.pointShadow[l]=t,r.pointShadowMap[l]=C,r.pointShadowMatrix[l]=y.shadow.matrix,m++}r.point[l]=e,l++}else if(y.isHemisphereLight){let e=t.get(y);e.skyColor.copy(y.color).multiplyScalar(x),e.groundColor.copy(y.groundColor).multiplyScalar(x),r.hemi[f]=e,f++}}d>0&&(e.has(`OES_texture_float_linear`)===!0?(r.rectAreaLTC1=J.LTC_FLOAT_1,r.rectAreaLTC2=J.LTC_FLOAT_2):(r.rectAreaLTC1=J.LTC_HALF_1,r.rectAreaLTC2=J.LTC_HALF_2)),r.ambient[0]=a,r.ambient[1]=o,r.ambient[2]=s;let y=r.hash;(y.directionalLength!==c||y.pointLength!==l||y.spotLength!==u||y.rectAreaLength!==d||y.hemiLength!==f||y.numDirectionalShadows!==p||y.numPointShadows!==m||y.numSpotShadows!==h||y.numSpotMaps!==g||y.numLightProbes!==v)&&(r.directional.length=c,r.spot.length=u,r.rectArea.length=d,r.point.length=l,r.hemi.length=f,r.directionalShadow.length=p,r.directionalShadowMap.length=p,r.pointShadow.length=m,r.pointShadowMap.length=m,r.spotShadow.length=h,r.spotShadowMap.length=h,r.directionalShadowMatrix.length=p,r.pointShadowMatrix.length=m,r.spotLightMatrix.length=h+g-_,r.spotLightMap.length=g,r.numSpotLightShadowsWithMaps=_,r.numLightProbes=v,y.directionalLength=c,y.pointLength=l,y.spotLength=u,y.rectAreaLength=d,y.hemiLength=f,y.numDirectionalShadows=p,y.numPointShadows=m,y.numSpotShadows=h,y.numSpotMaps=g,y.numLightProbes=v,r.version=ol++)}function c(e,t){let n=0,s=0,c=0,l=0,u=0,d=t.matrixWorldInverse;for(let t=0,f=e.length;t<f;t++){let f=e[t];if(f.isDirectionalLight){let e=r.directional[n];e.direction.setFromMatrixPosition(f.matrixWorld),i.setFromMatrixPosition(f.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(d),n++}else if(f.isSpotLight){let e=r.spot[c];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),e.direction.setFromMatrixPosition(f.matrixWorld),i.setFromMatrixPosition(f.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(d),c++}else if(f.isRectAreaLight){let e=r.rectArea[l];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),o.identity(),a.copy(f.matrixWorld),a.premultiply(d),o.extractRotation(a),e.halfWidth.set(f.width*.5,0,0),e.halfHeight.set(0,f.height*.5,0),e.halfWidth.applyMatrix4(o),e.halfHeight.applyMatrix4(o),l++}else if(f.isPointLight){let e=r.point[s];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),s++}else if(f.isHemisphereLight){let e=r.hemi[u];e.direction.setFromMatrixPosition(f.matrixWorld),e.direction.transformDirection(d),u++}}}return{setup:s,setupView:c,state:r}}function ll(e){let t=new cl(e),n=[],r=[],i=[];function a(e){d.camera=e,n.length=0,r.length=0,i.length=0}function o(e){n.push(e)}function s(e){r.push(e)}function c(e){i.push(e)}function l(){t.setup(n)}function u(e){t.setupView(n,e)}let d={lightsArray:n,shadowsArray:r,lightProbeGridArray:i,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:a,state:d,setupLights:l,setupLightsView:u,pushLight:o,pushShadow:s,pushLightProbeGrid:c}}function ul(e){let t=new WeakMap;function n(n,r=0){let i=t.get(n),a;return i===void 0?(a=new ll(e),t.set(n,[a])):r>=i.length?(a=new ll(e),i.push(a)):a=i[r],a}function r(){t=new WeakMap}return{get:n,dispose:r}}var dl=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,fl=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,pl=[new q(1,0,0),new q(-1,0,0),new q(0,1,0),new q(0,-1,0),new q(0,0,1),new q(0,0,-1)],ml=[new q(0,-1,0),new q(0,-1,0),new q(0,0,1),new q(0,0,-1),new q(0,-1,0),new q(0,-1,0)],hl=new Xt,gl=new q,_l=new q;function vl(e,t,n){let r=new li,i=new Tt,o=new Tt,s=new Gt,l=new na,u=new ra,d={},f=n.maxTextureSize,p={0:1,1:0,2:2},m=new $i({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Tt},radius:{value:4}},vertexShader:dl,fragmentShader:fl}),h=m.clone();h.defines.HORIZONTAL_PASS=1;let y=new kr;y.setAttribute(`position`,new mr(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let b=new Qr(y,m),x=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=1;let S=this.type;this.render=function(t,n,l){if(x.enabled===!1||x.autoUpdate===!1&&x.needsUpdate===!1||t.length===0)return;this.type===2&&(Ke(`WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.`),this.type=1);let u=e.getRenderTarget(),d=e.getActiveCubeFace(),p=e.getActiveMipmapLevel(),m=e.state;m.setBlending(0),m.buffers.depth.getReversed()===!0?m.buffers.color.setClear(0,0,0,0):m.buffers.color.setClear(1,1,1,1),m.buffers.depth.setTest(!0),m.setScissorTest(!1);let h=S!==this.type;h&&n.traverse(function(e){e.material&&(Array.isArray(e.material)?e.material.forEach(e=>e.needsUpdate=!0):e.material.needsUpdate=!0)});for(let u=0,d=t.length;u<d;u++){let d=t[u],p=d.shadow;if(p===void 0){Ke(`WebGLShadowMap:`,d,`has no shadow.`);continue}if(p.autoUpdate===!1&&p.needsUpdate===!1)continue;i.copy(p.mapSize);let y=p.getFrameExtents();i.multiply(y),o.copy(p.mapSize),(i.x>f||i.y>f)&&(i.x>f&&(o.x=Math.floor(f/y.x),i.x=o.x*y.x,p.mapSize.x=o.x),i.y>f&&(o.y=Math.floor(f/y.y),i.y=o.y*y.y,p.mapSize.y=o.y));let b=e.state.buffers.depth.getReversed();if(p.camera._reversedDepth=b,p.map===null||h===!0){if(p.map!==null&&(p.map.depthTexture!==null&&(p.map.depthTexture.dispose(),p.map.depthTexture=null),p.map.dispose()),this.type===3){if(d.isPointLight){Ke(`WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.`);continue}p.map=new qt(i.x,i.y,{format:j,type:v,minFilter:c,magFilter:c,generateMipmaps:!1}),p.map.texture.name=d.name+`.shadowMap`,p.map.depthTexture=new ji(i.x,i.y,_),p.map.depthTexture.name=d.name+`.shadowMapDepth`,p.map.depthTexture.format=D,p.map.depthTexture.compareFunction=null,p.map.depthTexture.minFilter=a,p.map.depthTexture.magFilter=a}else d.isPointLight?(p.map=new Yo(i.x),p.map.depthTexture=new Mi(i.x,g)):(p.map=new qt(i.x,i.y),p.map.depthTexture=new ji(i.x,i.y,g)),p.map.depthTexture.name=d.name+`.shadowMap`,p.map.depthTexture.format=D,this.type===1?(p.map.depthTexture.compareFunction=b?518:515,p.map.depthTexture.minFilter=c,p.map.depthTexture.magFilter=c):(p.map.depthTexture.compareFunction=null,p.map.depthTexture.minFilter=a,p.map.depthTexture.magFilter=a);p.camera.updateProjectionMatrix()}let x=p.map.isWebGLCubeRenderTarget?6:1;for(let t=0;t<x;t++){if(p.map.isWebGLCubeRenderTarget)e.setRenderTarget(p.map,t),e.clear();else{t===0&&(e.setRenderTarget(p.map),e.clear());let n=p.getViewport(t);s.set(o.x*n.x,o.y*n.y,o.x*n.z,o.y*n.w),m.viewport(s)}if(d.isPointLight){let e=p.camera,n=p.matrix,r=d.distance||e.far;r!==e.far&&(e.far=r,e.updateProjectionMatrix()),gl.setFromMatrixPosition(d.matrixWorld),e.position.copy(gl),_l.copy(e.position),_l.add(pl[t]),e.up.copy(ml[t]),e.lookAt(_l),e.updateMatrixWorld(),n.makeTranslation(-gl.x,-gl.y,-gl.z),hl.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),p._frustum.setFromProjectionMatrix(hl,e.coordinateSystem,e.reversedDepth)}else p.updateMatrices(d);r=p.getFrustum(),T(n,l,p.camera,d,this.type)}p.isPointLightShadow!==!0&&this.type===3&&C(p,l),p.needsUpdate=!1}S=this.type,x.needsUpdate=!1,e.setRenderTarget(u,d,p)};function C(n,r){let a=t.update(b);m.defines.VSM_SAMPLES!==n.blurSamples&&(m.defines.VSM_SAMPLES=n.blurSamples,h.defines.VSM_SAMPLES=n.blurSamples,m.needsUpdate=!0,h.needsUpdate=!0),n.mapPass===null&&(n.mapPass=new qt(i.x,i.y,{format:j,type:v})),m.uniforms.shadow_pass.value=n.map.depthTexture,m.uniforms.resolution.value=n.mapSize,m.uniforms.radius.value=n.radius,e.setRenderTarget(n.mapPass),e.clear(),e.renderBufferDirect(r,null,a,m,b,null),h.uniforms.shadow_pass.value=n.mapPass.texture,h.uniforms.resolution.value=n.mapSize,h.uniforms.radius.value=n.radius,e.setRenderTarget(n.map),e.clear(),e.renderBufferDirect(r,null,a,h,b,null)}function w(t,n,r,i){let a=null,o=r.isPointLight===!0?t.customDistanceMaterial:t.customDepthMaterial;if(o!==void 0)a=o;else if(a=r.isPointLight===!0?u:l,e.localClippingEnabled&&n.clipShadows===!0&&Array.isArray(n.clippingPlanes)&&n.clippingPlanes.length!==0||n.displacementMap&&n.displacementScale!==0||n.alphaMap&&n.alphaTest>0||n.map&&n.alphaTest>0||n.alphaToCoverage===!0){let e=a.uuid,t=n.uuid,r=d[e];r===void 0&&(r={},d[e]=r);let i=r[t];i===void 0&&(i=a.clone(),r[t]=i,n.addEventListener(`dispose`,E)),a=i}if(a.visible=n.visible,a.wireframe=n.wireframe,i===3?a.side=n.shadowSide===null?n.side:n.shadowSide:a.side=n.shadowSide===null?p[n.side]:n.shadowSide,a.alphaMap=n.alphaMap,a.alphaTest=n.alphaToCoverage===!0?.5:n.alphaTest,a.map=n.map,a.clipShadows=n.clipShadows,a.clippingPlanes=n.clippingPlanes,a.clipIntersection=n.clipIntersection,a.displacementMap=n.displacementMap,a.displacementScale=n.displacementScale,a.displacementBias=n.displacementBias,a.wireframeLinewidth=n.wireframeLinewidth,a.linewidth=n.linewidth,r.isPointLight===!0&&a.isMeshDistanceMaterial===!0){let t=e.properties.get(a);t.light=r}return a}function T(n,i,a,o,s){if(n.visible===!1)return;if(n.layers.test(i.layers)&&(n.isMesh||n.isLine||n.isPoints)&&(n.castShadow||n.receiveShadow&&s===3)&&(!n.frustumCulled||r.intersectsObject(n))){n.modelViewMatrix.multiplyMatrices(a.matrixWorldInverse,n.matrixWorld);let r=t.update(n),c=n.material;if(Array.isArray(c)){let t=r.groups;for(let l=0,u=t.length;l<u;l++){let u=t[l],d=c[u.materialIndex];if(d&&d.visible){let t=w(n,d,o,s);n.onBeforeShadow(e,n,i,a,r,t,u),e.renderBufferDirect(a,null,r,t,n,u),n.onAfterShadow(e,n,i,a,r,t,u)}}}else if(c.visible){let t=w(n,c,o,s);n.onBeforeShadow(e,n,i,a,r,t,null),e.renderBufferDirect(a,null,r,t,n,null),n.onAfterShadow(e,n,i,a,r,t,null)}}let c=n.children;for(let e=0,t=c.length;e<t;e++)T(c[e],i,a,o,s)}function E(e){e.target.removeEventListener(`dispose`,E);for(let t in d){let n=d[t],r=e.target.uuid;r in n&&(n[r].dispose(),delete n[r])}}}function yl(e,t){function n(){let t=!1,n=new Gt,r=null,i=new Gt(0,0,0,0);return{setMask:function(n){r!==n&&!t&&(e.colorMask(n,n,n,n),r=n)},setLocked:function(e){t=e},setClear:function(t,r,a,o,s){s===!0&&(t*=o,r*=o,a*=o),n.set(t,r,a,o),i.equals(n)===!1&&(e.clearColor(t,r,a,o),i.copy(n))},reset:function(){t=!1,r=null,i.set(-1,0,0,0)}}}function r(){let n=!1,r=!1,i=null,a=null,o=null;return{setReversed:function(e){if(r!==e){let n=t.get(`EXT_clip_control`);e?n.clipControlEXT(n.LOWER_LEFT_EXT,n.ZERO_TO_ONE_EXT):n.clipControlEXT(n.LOWER_LEFT_EXT,n.NEGATIVE_ONE_TO_ONE_EXT),r=e;let i=o;o=null,this.setClear(i)}},getReversed:function(){return r},setTest:function(t){t?B(e.DEPTH_TEST):V(e.DEPTH_TEST)},setMask:function(t){i!==t&&!n&&(e.depthMask(t),i=t)},setFunc:function(t){if(r&&(t=Xe[t]),a!==t){switch(t){case 0:e.depthFunc(e.NEVER);break;case 1:e.depthFunc(e.ALWAYS);break;case 2:e.depthFunc(e.LESS);break;case 3:e.depthFunc(e.LEQUAL);break;case 4:e.depthFunc(e.EQUAL);break;case 5:e.depthFunc(e.GEQUAL);break;case 6:e.depthFunc(e.GREATER);break;case 7:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}a=t}},setLocked:function(e){n=e},setClear:function(t){o!==t&&(o=t,r&&(t=1-t),e.clearDepth(t))},reset:function(){n=!1,i=null,a=null,o=null,r=!1}}}function i(){let t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null;return{setTest:function(n){t||(n?B(e.STENCIL_TEST):V(e.STENCIL_TEST))},setMask:function(r){n!==r&&!t&&(e.stencilMask(r),n=r)},setFunc:function(t,n,o){(r!==t||i!==n||a!==o)&&(e.stencilFunc(t,n,o),r=t,i=n,a=o)},setOp:function(t,n,r){(o!==t||s!==n||c!==r)&&(e.stencilOp(t,n,r),o=t,s=n,c=r)},setLocked:function(e){t=e},setClear:function(t){l!==t&&(e.clearStencil(t),l=t)},reset:function(){t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null}}}let a=new n,o=new r,s=new i,c=new WeakMap,l=new WeakMap,u={},d={},f={},p=new WeakMap,m=[],h=null,g=!1,_=null,v=null,y=null,b=null,x=null,S=null,C=null,w=new Mn(0,0,0),T=0,E=!1,D=null,O=null,k=null,A=null,j=null,M=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),N=!1,P=0,F=e.getParameter(e.VERSION);F.indexOf(`WebGL`)===-1?F.indexOf(`OpenGL ES`)!==-1&&(P=parseFloat(/^OpenGL ES (\d)/.exec(F)[1]),N=P>=2):(P=parseFloat(/^WebGL (\d)/.exec(F)[1]),N=P>=1);let I=null,L={},R=e.getParameter(e.SCISSOR_BOX),ee=e.getParameter(e.VIEWPORT),te=new Gt().fromArray(R),z=new Gt().fromArray(ee);function ne(t,n,r,i){let a=new Uint8Array(4),o=e.createTexture();e.bindTexture(t,o),e.texParameteri(t,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(t,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let o=0;o<r;o++)t===e.TEXTURE_3D||t===e.TEXTURE_2D_ARRAY?e.texImage3D(n,0,e.RGBA,1,1,i,0,e.RGBA,e.UNSIGNED_BYTE,a):e.texImage2D(n+o,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,a);return o}let re={};re[e.TEXTURE_2D]=ne(e.TEXTURE_2D,e.TEXTURE_2D,1),re[e.TEXTURE_CUBE_MAP]=ne(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),re[e.TEXTURE_2D_ARRAY]=ne(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),re[e.TEXTURE_3D]=ne(e.TEXTURE_3D,e.TEXTURE_3D,1,1),a.setClear(0,0,0,1),o.setClear(1),s.setClear(0),B(e.DEPTH_TEST),o.setFunc(3),ue(!1),de(1),B(e.CULL_FACE),ce(0);function B(t){u[t]!==!0&&(e.enable(t),u[t]=!0)}function V(t){u[t]!==!1&&(e.disable(t),u[t]=!1)}function H(t,n){return f[t]!==n&&(e.bindFramebuffer(t,n),f[t]=n,t===e.DRAW_FRAMEBUFFER&&(f[e.FRAMEBUFFER]=n),t===e.FRAMEBUFFER&&(f[e.DRAW_FRAMEBUFFER]=n),!0)}function ie(t,n){let r=m,i=!1;if(t){r=p.get(n),r===void 0&&(r=[],p.set(n,r));let a=t.textures;if(r.length!==a.length||r[0]!==e.COLOR_ATTACHMENT0){for(let t=0,n=a.length;t<n;t++)r[t]=e.COLOR_ATTACHMENT0+t;r.length=a.length,i=!0}}else r[0]!==e.BACK&&(r[0]=e.BACK,i=!0);i&&e.drawBuffers(r)}function ae(t){return h!==t&&(e.useProgram(t),h=t,!0)}let oe={100:e.FUNC_ADD,101:e.FUNC_SUBTRACT,102:e.FUNC_REVERSE_SUBTRACT};oe[103]=e.MIN,oe[104]=e.MAX;let se={200:e.ZERO,201:e.ONE,202:e.SRC_COLOR,204:e.SRC_ALPHA,210:e.SRC_ALPHA_SATURATE,208:e.DST_COLOR,206:e.DST_ALPHA,203:e.ONE_MINUS_SRC_COLOR,205:e.ONE_MINUS_SRC_ALPHA,209:e.ONE_MINUS_DST_COLOR,207:e.ONE_MINUS_DST_ALPHA,211:e.CONSTANT_COLOR,212:e.ONE_MINUS_CONSTANT_COLOR,213:e.CONSTANT_ALPHA,214:e.ONE_MINUS_CONSTANT_ALPHA};function ce(t,n,r,i,a,o,s,c,l,u){if(t===0){g===!0&&(V(e.BLEND),g=!1);return}if(g===!1&&(B(e.BLEND),g=!0),t!==5){if(t!==_||u!==E){if((v!==100||x!==100)&&(e.blendEquation(e.FUNC_ADD),v=100,x=100),u)switch(t){case 1:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFunc(e.ONE,e.ONE);break;case 3:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case 4:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:qe(`WebGLState: Invalid blending: `,t)}else switch(t){case 1:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case 3:qe(`WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true`);break;case 4:qe(`WebGLState: MultiplyBlending requires material.premultipliedAlpha = true`);break;default:qe(`WebGLState: Invalid blending: `,t)}y=null,b=null,S=null,C=null,w.set(0,0,0),T=0,_=t,E=u}return}a||=n,o||=r,s||=i,(n!==v||a!==x)&&(e.blendEquationSeparate(oe[n],oe[a]),v=n,x=a),(r!==y||i!==b||o!==S||s!==C)&&(e.blendFuncSeparate(se[r],se[i],se[o],se[s]),y=r,b=i,S=o,C=s),(c.equals(w)===!1||l!==T)&&(e.blendColor(c.r,c.g,c.b,l),w.copy(c),T=l),_=t,E=!1}function le(t,n){t.side===2?V(e.CULL_FACE):B(e.CULL_FACE);let r=t.side===1;n&&(r=!r),ue(r),t.blending===1&&t.transparent===!1?ce(0):ce(t.blending,t.blendEquation,t.blendSrc,t.blendDst,t.blendEquationAlpha,t.blendSrcAlpha,t.blendDstAlpha,t.blendColor,t.blendAlpha,t.premultipliedAlpha),o.setFunc(t.depthFunc),o.setTest(t.depthTest),o.setMask(t.depthWrite),a.setMask(t.colorWrite);let i=t.stencilWrite;s.setTest(i),i&&(s.setMask(t.stencilWriteMask),s.setFunc(t.stencilFunc,t.stencilRef,t.stencilFuncMask),s.setOp(t.stencilFail,t.stencilZFail,t.stencilZPass)),fe(t.polygonOffset,t.polygonOffsetFactor,t.polygonOffsetUnits),t.alphaToCoverage===!0?B(e.SAMPLE_ALPHA_TO_COVERAGE):V(e.SAMPLE_ALPHA_TO_COVERAGE)}function ue(t){D!==t&&(t?e.frontFace(e.CW):e.frontFace(e.CCW),D=t)}function de(t){t===0?V(e.CULL_FACE):(B(e.CULL_FACE),t!==O&&(t===1?e.cullFace(e.BACK):t===2?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))),O=t}function U(t){t!==k&&(N&&e.lineWidth(t),k=t)}function fe(t,n,r){t?(B(e.POLYGON_OFFSET_FILL),(A!==n||j!==r)&&(A=n,j=r,o.getReversed()&&(n=-n),e.polygonOffset(n,r))):V(e.POLYGON_OFFSET_FILL)}function pe(t){t?B(e.SCISSOR_TEST):V(e.SCISSOR_TEST)}function me(t){t===void 0&&(t=e.TEXTURE0+M-1),I!==t&&(e.activeTexture(t),I=t)}function he(t,n,r){r===void 0&&(r=I===null?e.TEXTURE0+M-1:I);let i=L[r];i===void 0&&(i={type:void 0,texture:void 0},L[r]=i),(i.type!==t||i.texture!==n)&&(I!==r&&(e.activeTexture(r),I=r),e.bindTexture(t,n||re[t]),i.type=t,i.texture=n)}function ge(){let t=L[I];t!==void 0&&t.type!==void 0&&(e.bindTexture(t.type,null),t.type=void 0,t.texture=void 0)}function _e(){try{e.compressedTexImage2D(...arguments)}catch(e){qe(`WebGLState:`,e)}}function ve(){try{e.compressedTexImage3D(...arguments)}catch(e){qe(`WebGLState:`,e)}}function ye(){try{e.texSubImage2D(...arguments)}catch(e){qe(`WebGLState:`,e)}}function be(){try{e.texSubImage3D(...arguments)}catch(e){qe(`WebGLState:`,e)}}function xe(){try{e.compressedTexSubImage2D(...arguments)}catch(e){qe(`WebGLState:`,e)}}function Se(){try{e.compressedTexSubImage3D(...arguments)}catch(e){qe(`WebGLState:`,e)}}function Ce(){try{e.texStorage2D(...arguments)}catch(e){qe(`WebGLState:`,e)}}function we(){try{e.texStorage3D(...arguments)}catch(e){qe(`WebGLState:`,e)}}function W(){try{e.texImage2D(...arguments)}catch(e){qe(`WebGLState:`,e)}}function Te(){try{e.texImage3D(...arguments)}catch(e){qe(`WebGLState:`,e)}}function Ee(t){return d[t]===void 0?e.getParameter(t):d[t]}function De(t,n){d[t]!==n&&(e.pixelStorei(t,n),d[t]=n)}function G(t){te.equals(t)===!1&&(e.scissor(t.x,t.y,t.z,t.w),te.copy(t))}function Oe(t){z.equals(t)===!1&&(e.viewport(t.x,t.y,t.z,t.w),z.copy(t))}function K(t,n){let r=l.get(n);r===void 0&&(r=new WeakMap,l.set(n,r));let i=r.get(t);i===void 0&&(i=e.getUniformBlockIndex(n,t.name),r.set(t,i))}function ke(t,n){let r=l.get(n).get(t);c.get(n)!==r&&(e.uniformBlockBinding(n,r,t.__bindingPointIndex),c.set(n,r))}function Ae(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),o.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),e.pixelStorei(e.PACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,e.BROWSER_DEFAULT_WEBGL),e.pixelStorei(e.PACK_ROW_LENGTH,0),e.pixelStorei(e.PACK_SKIP_PIXELS,0),e.pixelStorei(e.PACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_ROW_LENGTH,0),e.pixelStorei(e.UNPACK_IMAGE_HEIGHT,0),e.pixelStorei(e.UNPACK_SKIP_PIXELS,0),e.pixelStorei(e.UNPACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_SKIP_IMAGES,0),u={},d={},I=null,L={},f={},p=new WeakMap,m=[],h=null,g=!1,_=null,v=null,y=null,b=null,x=null,S=null,C=null,w=new Mn(0,0,0),T=0,E=!1,D=null,O=null,k=null,A=null,j=null,te.set(0,0,e.canvas.width,e.canvas.height),z.set(0,0,e.canvas.width,e.canvas.height),a.reset(),o.reset(),s.reset()}return{buffers:{color:a,depth:o,stencil:s},enable:B,disable:V,bindFramebuffer:H,drawBuffers:ie,useProgram:ae,setBlending:ce,setMaterial:le,setFlipSided:ue,setCullFace:de,setLineWidth:U,setPolygonOffset:fe,setScissorTest:pe,activeTexture:me,bindTexture:he,unbindTexture:ge,compressedTexImage2D:_e,compressedTexImage3D:ve,texImage2D:W,texImage3D:Te,pixelStorei:De,getParameter:Ee,updateUBOMapping:K,uniformBlockBinding:ke,texStorage2D:Ce,texStorage3D:we,texSubImage2D:ye,texSubImage3D:be,compressedTexSubImage2D:xe,compressedTexSubImage3D:Se,scissor:G,viewport:Oe,reset:Ae}}function bl(e,t,d,f,p,m,h){let g=t.has(`WEBGL_multisampled_render_to_texture`)?t.get(`WEBGL_multisampled_render_to_texture`):null,_=typeof navigator>`u`?!1:/OculusBrowser/g.test(navigator.userAgent),v=new Tt,y=new WeakMap,b=new Set,x,S=new WeakMap,C=!1;try{C=typeof OffscreenCanvas<`u`&&new OffscreenCanvas(1,1).getContext(`2d`)!==null}catch{}function w(e,t){return C?new OffscreenCanvas(e,t):Ve(`canvas`)}function T(e,t,n){let r=1,i=Ee(e);if((i.width>n||i.height>n)&&(r=n/Math.max(i.width,i.height)),r<1){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap||typeof VideoFrame<`u`&&e instanceof VideoFrame){let n=Math.floor(r*i.width),a=Math.floor(r*i.height);x===void 0&&(x=w(n,a));let o=t?w(n,a):x;return o.width=n,o.height=a,o.getContext(`2d`).drawImage(e,0,0,n,a),Ke(`WebGLRenderer: Texture has been resized from (`+i.width+`x`+i.height+`) to (`+n+`x`+a+`).`),o}return`data`in e&&Ke(`WebGLRenderer: Image in DataTexture is too big (`+i.width+`x`+i.height+`).`),e}return e}function E(e){return e.generateMipmaps}function D(t){e.generateMipmap(t)}function k(t){return t.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:t.isWebGL3DRenderTarget?e.TEXTURE_3D:t.isWebGLArrayRenderTarget||t.isCompressedArrayTexture?e.TEXTURE_2D_ARRAY:e.TEXTURE_2D}function A(n,r,i,a,o,s=!1){if(n!==null){if(e[n]!==void 0)return e[n];Ke(`WebGLRenderer: Attempt to use non-existing WebGL internal format '`+n+`'`)}let c;a&&(c=t.get(`EXT_texture_norm16`),c||Ke(`WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension`));let l=r;if(r===e.RED&&(i===e.FLOAT&&(l=e.R32F),i===e.HALF_FLOAT&&(l=e.R16F),i===e.UNSIGNED_BYTE&&(l=e.R8),i===e.UNSIGNED_SHORT&&c&&(l=c.R16_EXT),i===e.SHORT&&c&&(l=c.R16_SNORM_EXT)),r===e.RED_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.R8UI),i===e.UNSIGNED_SHORT&&(l=e.R16UI),i===e.UNSIGNED_INT&&(l=e.R32UI),i===e.BYTE&&(l=e.R8I),i===e.SHORT&&(l=e.R16I),i===e.INT&&(l=e.R32I)),r===e.RG&&(i===e.FLOAT&&(l=e.RG32F),i===e.HALF_FLOAT&&(l=e.RG16F),i===e.UNSIGNED_BYTE&&(l=e.RG8),i===e.UNSIGNED_SHORT&&c&&(l=c.RG16_EXT),i===e.SHORT&&c&&(l=c.RG16_SNORM_EXT)),r===e.RG_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RG8UI),i===e.UNSIGNED_SHORT&&(l=e.RG16UI),i===e.UNSIGNED_INT&&(l=e.RG32UI),i===e.BYTE&&(l=e.RG8I),i===e.SHORT&&(l=e.RG16I),i===e.INT&&(l=e.RG32I)),r===e.RGB_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RGB8UI),i===e.UNSIGNED_SHORT&&(l=e.RGB16UI),i===e.UNSIGNED_INT&&(l=e.RGB32UI),i===e.BYTE&&(l=e.RGB8I),i===e.SHORT&&(l=e.RGB16I),i===e.INT&&(l=e.RGB32I)),r===e.RGBA_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RGBA8UI),i===e.UNSIGNED_SHORT&&(l=e.RGBA16UI),i===e.UNSIGNED_INT&&(l=e.RGBA32UI),i===e.BYTE&&(l=e.RGBA8I),i===e.SHORT&&(l=e.RGBA16I),i===e.INT&&(l=e.RGBA32I)),r===e.RGB&&(i===e.UNSIGNED_SHORT&&c&&(l=c.RGB16_EXT),i===e.SHORT&&c&&(l=c.RGB16_SNORM_EXT),i===e.UNSIGNED_INT_5_9_9_9_REV&&(l=e.RGB9_E5),i===e.UNSIGNED_INT_10F_11F_11F_REV&&(l=e.R11F_G11F_B10F)),r===e.RGBA){let t=s?Pe:Pt.getTransfer(o);i===e.FLOAT&&(l=e.RGBA32F),i===e.HALF_FLOAT&&(l=e.RGBA16F),i===e.UNSIGNED_BYTE&&(l=t===`srgb`?e.SRGB8_ALPHA8:e.RGBA8),i===e.UNSIGNED_SHORT&&c&&(l=c.RGBA16_EXT),i===e.SHORT&&c&&(l=c.RGBA16_SNORM_EXT),i===e.UNSIGNED_SHORT_4_4_4_4&&(l=e.RGBA4),i===e.UNSIGNED_SHORT_5_5_5_1&&(l=e.RGB5_A1)}return(l===e.R16F||l===e.R32F||l===e.RG16F||l===e.RG32F||l===e.RGBA16F||l===e.RGBA32F)&&t.get(`EXT_color_buffer_float`),l}function j(t,n){let r;return t?n===null||n===1014||n===1020?r=e.DEPTH24_STENCIL8:n===1015?r=e.DEPTH32F_STENCIL8:n===1012&&(r=e.DEPTH24_STENCIL8,Ke(`DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.`)):n===null||n===1014||n===1020?r=e.DEPTH_COMPONENT24:n===1015?r=e.DEPTH_COMPONENT32F:n===1012&&(r=e.DEPTH_COMPONENT16),r}function M(e,t){return E(e)===!0||e.isFramebufferTexture&&e.minFilter!==1003&&e.minFilter!==1006?Math.log2(Math.max(t.width,t.height))+1:e.mipmaps!==void 0&&e.mipmaps.length>0?e.mipmaps.length:e.isCompressedTexture&&Array.isArray(e.image)?t.mipmaps.length:1}function N(e){let t=e.target;t.removeEventListener(`dispose`,N),F(t),t.isVideoTexture&&y.delete(t),t.isHTMLTexture&&b.delete(t)}function P(e){let t=e.target;t.removeEventListener(`dispose`,P),L(t)}function F(e){let t=f.get(e);if(t.__webglInit===void 0)return;let n=e.source,r=S.get(n);if(r){let i=r[t.__cacheKey];i.usedTimes--,i.usedTimes===0&&I(e),Object.keys(r).length===0&&S.delete(n)}f.remove(e)}function I(t){let n=f.get(t);e.deleteTexture(n.__webglTexture);let r=t.source,i=S.get(r);delete i[n.__cacheKey],h.memory.textures--}function L(t){let n=f.get(t);if(t.depthTexture&&(t.depthTexture.dispose(),f.remove(t.depthTexture)),t.isWebGLCubeRenderTarget)for(let t=0;t<6;t++){if(Array.isArray(n.__webglFramebuffer[t]))for(let r=0;r<n.__webglFramebuffer[t].length;r++)e.deleteFramebuffer(n.__webglFramebuffer[t][r]);else e.deleteFramebuffer(n.__webglFramebuffer[t]);n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer[t])}else{if(Array.isArray(n.__webglFramebuffer))for(let t=0;t<n.__webglFramebuffer.length;t++)e.deleteFramebuffer(n.__webglFramebuffer[t]);else e.deleteFramebuffer(n.__webglFramebuffer);if(n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer),n.__webglMultisampledFramebuffer&&e.deleteFramebuffer(n.__webglMultisampledFramebuffer),n.__webglColorRenderbuffer)for(let t=0;t<n.__webglColorRenderbuffer.length;t++)n.__webglColorRenderbuffer[t]&&e.deleteRenderbuffer(n.__webglColorRenderbuffer[t]);n.__webglDepthRenderbuffer&&e.deleteRenderbuffer(n.__webglDepthRenderbuffer)}let r=t.textures;for(let t=0,n=r.length;t<n;t++){let n=f.get(r[t]);n.__webglTexture&&(e.deleteTexture(n.__webglTexture),h.memory.textures--),f.remove(r[t])}f.remove(t)}let R=0;function ee(){R=0}function te(){return R}function z(e){R=e}function ne(){let e=R;return e>=p.maxTextures&&Ke(`WebGLTextures: Trying to use `+e+` texture units while this GPU supports only `+p.maxTextures),R+=1,e}function re(e){let t=[];return t.push(e.wrapS),t.push(e.wrapT),t.push(e.wrapR||0),t.push(e.magFilter),t.push(e.minFilter),t.push(e.anisotropy),t.push(e.internalFormat),t.push(e.format),t.push(e.type),t.push(e.generateMipmaps),t.push(e.premultiplyAlpha),t.push(e.flipY),t.push(e.unpackAlignment),t.push(e.colorSpace),t.join()}function B(t,n){let r=f.get(t);if(t.isVideoTexture&&W(t),t.isRenderTargetTexture===!1&&t.isExternalTexture!==!0&&t.version>0&&r.__version!==t.version){let e=t.image;if(e===null)Ke(`WebGLRenderer: Texture marked for update but no image data found.`);else if(e.complete===!1)Ke(`WebGLRenderer: Texture marked for update but image is incomplete`);else{U(r,t,n);return}}else t.isExternalTexture&&(r.__webglTexture=t.sourceTexture?t.sourceTexture:null);d.bindTexture(e.TEXTURE_2D,r.__webglTexture,e.TEXTURE0+n)}function V(t,n){let r=f.get(t);if(t.isRenderTargetTexture===!1&&t.version>0&&r.__version!==t.version){U(r,t,n);return}t.isExternalTexture&&(r.__webglTexture=t.sourceTexture?t.sourceTexture:null),d.bindTexture(e.TEXTURE_2D_ARRAY,r.__webglTexture,e.TEXTURE0+n)}function H(t,n){let r=f.get(t);if(t.isRenderTargetTexture===!1&&t.version>0&&r.__version!==t.version){U(r,t,n);return}d.bindTexture(e.TEXTURE_3D,r.__webglTexture,e.TEXTURE0+n)}function ie(t,n){let r=f.get(t);if(t.isCubeDepthTexture!==!0&&t.version>0&&r.__version!==t.version){fe(r,t,n);return}d.bindTexture(e.TEXTURE_CUBE_MAP,r.__webglTexture,e.TEXTURE0+n)}let ae={[n]:e.REPEAT,[r]:e.CLAMP_TO_EDGE,[i]:e.MIRRORED_REPEAT},oe={[a]:e.NEAREST,[o]:e.NEAREST_MIPMAP_NEAREST,[s]:e.NEAREST_MIPMAP_LINEAR,[c]:e.LINEAR,[l]:e.LINEAR_MIPMAP_NEAREST,[u]:e.LINEAR_MIPMAP_LINEAR},se={512:e.NEVER,519:e.ALWAYS,513:e.LESS,515:e.LEQUAL,514:e.EQUAL,518:e.GEQUAL,516:e.GREATER,517:e.NOTEQUAL};function ce(n,r){if(r.type===1015&&t.has(`OES_texture_float_linear`)===!1&&(r.magFilter===1006||r.magFilter===1007||r.magFilter===1005||r.magFilter===1008||r.minFilter===1006||r.minFilter===1007||r.minFilter===1005||r.minFilter===1008)&&Ke(`WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device.`),e.texParameteri(n,e.TEXTURE_WRAP_S,ae[r.wrapS]),e.texParameteri(n,e.TEXTURE_WRAP_T,ae[r.wrapT]),(n===e.TEXTURE_3D||n===e.TEXTURE_2D_ARRAY)&&e.texParameteri(n,e.TEXTURE_WRAP_R,ae[r.wrapR]),e.texParameteri(n,e.TEXTURE_MAG_FILTER,oe[r.magFilter]),e.texParameteri(n,e.TEXTURE_MIN_FILTER,oe[r.minFilter]),r.compareFunction&&(e.texParameteri(n,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(n,e.TEXTURE_COMPARE_FUNC,se[r.compareFunction])),t.has(`EXT_texture_filter_anisotropic`)===!0){if(r.magFilter===1003||r.minFilter!==1005&&r.minFilter!==1008||r.type===1015&&t.has(`OES_texture_float_linear`)===!1)return;if(r.anisotropy>1||f.get(r).__currentAnisotropy){let i=t.get(`EXT_texture_filter_anisotropic`);e.texParameterf(n,i.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(r.anisotropy,p.getMaxAnisotropy())),f.get(r).__currentAnisotropy=r.anisotropy}}}function le(t,n){let r=!1;t.__webglInit===void 0&&(t.__webglInit=!0,n.addEventListener(`dispose`,N));let i=n.source,a=S.get(i);a===void 0&&(a={},S.set(i,a));let o=re(n);if(o!==t.__cacheKey){a[o]===void 0&&(a[o]={texture:e.createTexture(),usedTimes:0},h.memory.textures++,r=!0),a[o].usedTimes++;let i=a[t.__cacheKey];i!==void 0&&(a[t.__cacheKey].usedTimes--,i.usedTimes===0&&I(n)),t.__cacheKey=o,t.__webglTexture=a[o].texture}return r}function ue(e,t,n){return Math.floor(Math.floor(e/n)/t)}function de(t,n,r,i){let a=t.updateRanges;if(a.length===0)d.texSubImage2D(e.TEXTURE_2D,0,0,0,n.width,n.height,r,i,n.data);else{a.sort((e,t)=>e.start-t.start);let o=0;for(let e=1;e<a.length;e++){let t=a[o],r=a[e],i=t.start+t.count,s=ue(r.start,n.width,4),c=ue(t.start,n.width,4);r.start<=i+1&&s===c&&ue(r.start+r.count-1,n.width,4)===s?t.count=Math.max(t.count,r.start+r.count-t.start):(++o,a[o]=r)}a.length=o+1;let s=d.getParameter(e.UNPACK_ROW_LENGTH),c=d.getParameter(e.UNPACK_SKIP_PIXELS),l=d.getParameter(e.UNPACK_SKIP_ROWS);d.pixelStorei(e.UNPACK_ROW_LENGTH,n.width);for(let t=0,o=a.length;t<o;t++){let o=a[t],s=Math.floor(o.start/4),c=Math.ceil(o.count/4),l=s%n.width,u=Math.floor(s/n.width),f=c;d.pixelStorei(e.UNPACK_SKIP_PIXELS,l),d.pixelStorei(e.UNPACK_SKIP_ROWS,u),d.texSubImage2D(e.TEXTURE_2D,0,l,u,f,1,r,i,n.data)}t.clearUpdateRanges(),d.pixelStorei(e.UNPACK_ROW_LENGTH,s),d.pixelStorei(e.UNPACK_SKIP_PIXELS,c),d.pixelStorei(e.UNPACK_SKIP_ROWS,l)}}function U(t,n,r){let i=e.TEXTURE_2D;(n.isDataArrayTexture||n.isCompressedArrayTexture)&&(i=e.TEXTURE_2D_ARRAY),n.isData3DTexture&&(i=e.TEXTURE_3D);let a=le(t,n),o=n.source;d.bindTexture(i,t.__webglTexture,e.TEXTURE0+r);let s=f.get(o);if(o.version!==s.__version||a===!0){if(d.activeTexture(e.TEXTURE0+r),!(typeof ImageBitmap<`u`&&n.image instanceof ImageBitmap)){let t=Pt.getPrimaries(Pt.workingColorSpace),r=n.colorSpace===``?null:Pt.getPrimaries(n.colorSpace),i=n.colorSpace===``||t===r?e.NONE:e.BROWSER_DEFAULT_WEBGL;d.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,n.flipY),d.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,n.premultiplyAlpha),d.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,i)}d.pixelStorei(e.UNPACK_ALIGNMENT,n.unpackAlignment);let t=T(n.image,!1,p.maxTextureSize);t=Te(n,t);let c=m.convert(n.format,n.colorSpace),l=m.convert(n.type),u=A(n.internalFormat,c,l,n.normalized,n.colorSpace,n.isVideoTexture);ce(i,n);let f,h=n.mipmaps,g=n.isVideoTexture!==!0,_=s.__version===void 0||a===!0,v=o.dataReady,y=M(n,t);if(n.isDepthTexture)u=j(n.format===O,n.type),_&&(g?d.texStorage2D(e.TEXTURE_2D,1,u,t.width,t.height):d.texImage2D(e.TEXTURE_2D,0,u,t.width,t.height,0,c,l,null));else if(n.isDataTexture){if(h.length>0){g&&_&&d.texStorage2D(e.TEXTURE_2D,y,u,h[0].width,h[0].height);for(let t=0,n=h.length;t<n;t++)f=h[t],g?v&&d.texSubImage2D(e.TEXTURE_2D,t,0,0,f.width,f.height,c,l,f.data):d.texImage2D(e.TEXTURE_2D,t,u,f.width,f.height,0,c,l,f.data);n.generateMipmaps=!1}else g?(_&&d.texStorage2D(e.TEXTURE_2D,y,u,t.width,t.height),v&&de(n,t,c,l)):d.texImage2D(e.TEXTURE_2D,0,u,t.width,t.height,0,c,l,t.data)}else if(n.isCompressedTexture){if(n.isCompressedArrayTexture){g&&_&&d.texStorage3D(e.TEXTURE_2D_ARRAY,y,u,h[0].width,h[0].height,t.depth);for(let r=0,i=h.length;r<i;r++)if(f=h[r],n.format!==1023){if(c!==null){if(g){if(v){if(n.layerUpdates.size>0){let t=ho(f.width,f.height,n.format,n.type);for(let i of n.layerUpdates){let n=f.data.subarray(i*t/f.data.BYTES_PER_ELEMENT,(i+1)*t/f.data.BYTES_PER_ELEMENT);d.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,r,0,0,i,f.width,f.height,1,c,n)}n.clearLayerUpdates()}else d.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,r,0,0,0,f.width,f.height,t.depth,c,f.data)}}else d.compressedTexImage3D(e.TEXTURE_2D_ARRAY,r,u,f.width,f.height,t.depth,0,f.data,0,0)}else Ke(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`)}else g?v&&d.texSubImage3D(e.TEXTURE_2D_ARRAY,r,0,0,0,f.width,f.height,t.depth,c,l,f.data):d.texImage3D(e.TEXTURE_2D_ARRAY,r,u,f.width,f.height,t.depth,0,c,l,f.data)}else{g&&_&&d.texStorage2D(e.TEXTURE_2D,y,u,h[0].width,h[0].height);for(let t=0,r=h.length;t<r;t++)f=h[t],n.format===1023?g?v&&d.texSubImage2D(e.TEXTURE_2D,t,0,0,f.width,f.height,c,l,f.data):d.texImage2D(e.TEXTURE_2D,t,u,f.width,f.height,0,c,l,f.data):c===null?Ke(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`):g?v&&d.compressedTexSubImage2D(e.TEXTURE_2D,t,0,0,f.width,f.height,c,f.data):d.compressedTexImage2D(e.TEXTURE_2D,t,u,f.width,f.height,0,f.data)}}else if(n.isDataArrayTexture){if(g){if(_&&d.texStorage3D(e.TEXTURE_2D_ARRAY,y,u,t.width,t.height,t.depth),v){if(n.layerUpdates.size>0){let r=ho(t.width,t.height,n.format,n.type);for(let i of n.layerUpdates){let n=t.data.subarray(i*r/t.data.BYTES_PER_ELEMENT,(i+1)*r/t.data.BYTES_PER_ELEMENT);d.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,i,t.width,t.height,1,c,l,n)}n.clearLayerUpdates()}else d.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,t.width,t.height,t.depth,c,l,t.data)}}else d.texImage3D(e.TEXTURE_2D_ARRAY,0,u,t.width,t.height,t.depth,0,c,l,t.data)}else if(n.isData3DTexture)g?(_&&d.texStorage3D(e.TEXTURE_3D,y,u,t.width,t.height,t.depth),v&&d.texSubImage3D(e.TEXTURE_3D,0,0,0,0,t.width,t.height,t.depth,c,l,t.data)):d.texImage3D(e.TEXTURE_3D,0,u,t.width,t.height,t.depth,0,c,l,t.data);else if(n.isFramebufferTexture){if(_){if(g)d.texStorage2D(e.TEXTURE_2D,y,u,t.width,t.height);else{let n=t.width,r=t.height;for(let t=0;t<y;t++)d.texImage2D(e.TEXTURE_2D,t,u,n,r,0,c,l,null),n>>=1,r>>=1}}}else if(n.isHTMLTexture){if(`texElementImage2D`in e){let r=e.canvas;if(r.hasAttribute(`layoutsubtree`)||r.setAttribute(`layoutsubtree`,`true`),t.parentNode!==r){r.appendChild(t),b.add(n),r.onpaint=e=>{let t=e.changedElements;for(let e of b)t.includes(e.image)&&(e.needsUpdate=!0)},r.requestPaint();return}if(e.texElementImage2D.length===3)e.texElementImage2D(e.TEXTURE_2D,e.RGBA8,t);else{let n=e.RGBA,r=e.RGBA,i=e.UNSIGNED_BYTE;e.texElementImage2D(e.TEXTURE_2D,0,n,r,i,t)}e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}}else if(h.length>0){if(g&&_){let t=Ee(h[0]);d.texStorage2D(e.TEXTURE_2D,y,u,t.width,t.height)}for(let t=0,n=h.length;t<n;t++)f=h[t],g?v&&d.texSubImage2D(e.TEXTURE_2D,t,0,0,c,l,f):d.texImage2D(e.TEXTURE_2D,t,u,c,l,f);n.generateMipmaps=!1}else if(g){if(_){let n=Ee(t);d.texStorage2D(e.TEXTURE_2D,y,u,n.width,n.height)}v&&d.texSubImage2D(e.TEXTURE_2D,0,0,0,c,l,t)}else d.texImage2D(e.TEXTURE_2D,0,u,c,l,t);E(n)&&D(i),s.__version=o.version,n.onUpdate&&n.onUpdate(n)}t.__version=n.version}function fe(t,n,r){if(n.image.length!==6)return;let i=le(t,n),a=n.source;d.bindTexture(e.TEXTURE_CUBE_MAP,t.__webglTexture,e.TEXTURE0+r);let o=f.get(a);if(a.version!==o.__version||i===!0){d.activeTexture(e.TEXTURE0+r);let t=Pt.getPrimaries(Pt.workingColorSpace),s=n.colorSpace===``?null:Pt.getPrimaries(n.colorSpace),c=n.colorSpace===``||t===s?e.NONE:e.BROWSER_DEFAULT_WEBGL;d.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,n.flipY),d.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,n.premultiplyAlpha),d.pixelStorei(e.UNPACK_ALIGNMENT,n.unpackAlignment),d.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,c);let l=n.isCompressedTexture||n.image[0].isCompressedTexture,u=n.image[0]&&n.image[0].isDataTexture,f=[];for(let e=0;e<6;e++)!l&&!u?f[e]=T(n.image[e],!0,p.maxCubemapSize):f[e]=u?n.image[e].image:n.image[e],f[e]=Te(n,f[e]);let h=f[0],g=m.convert(n.format,n.colorSpace),_=m.convert(n.type),v=A(n.internalFormat,g,_,n.normalized,n.colorSpace),y=n.isVideoTexture!==!0,b=o.__version===void 0||i===!0,x=a.dataReady,S=M(n,h);ce(e.TEXTURE_CUBE_MAP,n);let C;if(l){y&&b&&d.texStorage2D(e.TEXTURE_CUBE_MAP,S,v,h.width,h.height);for(let t=0;t<6;t++){C=f[t].mipmaps;for(let r=0;r<C.length;r++){let i=C[r];n.format===1023?y?x&&d.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,0,0,i.width,i.height,g,_,i.data):d.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,v,i.width,i.height,0,g,_,i.data):g===null?Ke(`WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()`):y?x&&d.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,0,0,i.width,i.height,g,i.data):d.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,v,i.width,i.height,0,i.data)}}}else{if(C=n.mipmaps,y&&b){C.length>0&&S++;let t=Ee(f[0]);d.texStorage2D(e.TEXTURE_CUBE_MAP,S,v,t.width,t.height)}for(let t=0;t<6;t++)if(u){y?x&&d.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,f[t].width,f[t].height,g,_,f[t].data):d.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,v,f[t].width,f[t].height,0,g,_,f[t].data);for(let n=0;n<C.length;n++){let r=C[n].image[t].image;y?x&&d.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,n+1,0,0,r.width,r.height,g,_,r.data):d.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,n+1,v,r.width,r.height,0,g,_,r.data)}}else{y?x&&d.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,g,_,f[t]):d.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,v,g,_,f[t]);for(let n=0;n<C.length;n++){let r=C[n];y?x&&d.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,n+1,0,0,g,_,r.image[t]):d.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,n+1,v,g,_,r.image[t])}}}E(n)&&D(e.TEXTURE_CUBE_MAP),o.__version=a.version,n.onUpdate&&n.onUpdate(n)}t.__version=n.version}function pe(t,n,r,i,a,o){let s=m.convert(r.format,r.colorSpace),c=m.convert(r.type),l=A(r.internalFormat,s,c,r.normalized,r.colorSpace),u=f.get(n),p=f.get(r);if(p.__renderTarget=n,!u.__hasExternalTextures){let t=Math.max(1,n.width>>o),r=Math.max(1,n.height>>o);a===e.TEXTURE_3D||a===e.TEXTURE_2D_ARRAY?d.texImage3D(a,o,l,t,r,n.depth,0,s,c,null):d.texImage2D(a,o,l,t,r,0,s,c,null)}d.bindFramebuffer(e.FRAMEBUFFER,t),we(n)?g.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,i,a,p.__webglTexture,0,Ce(n)):(a===e.TEXTURE_2D||a>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&a<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,i,a,p.__webglTexture,o),d.bindFramebuffer(e.FRAMEBUFFER,null)}function me(t,n,r){if(e.bindRenderbuffer(e.RENDERBUFFER,t),n.depthBuffer){let i=n.depthTexture,a=i&&i.isDepthTexture?i.type:null,o=j(n.stencilBuffer,a),s=n.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;we(n)?g.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Ce(n),o,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,Ce(n),o,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,o,n.width,n.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,s,e.RENDERBUFFER,t)}else{let t=n.textures;for(let i=0;i<t.length;i++){let a=t[i],o=m.convert(a.format,a.colorSpace),s=m.convert(a.type),c=A(a.internalFormat,o,s,a.normalized,a.colorSpace);we(n)?g.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Ce(n),c,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,Ce(n),c,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,c,n.width,n.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function he(t,n,r){let i=n.isWebGLCubeRenderTarget===!0;if(d.bindFramebuffer(e.FRAMEBUFFER,t),!(n.depthTexture&&n.depthTexture.isDepthTexture))throw Error(`THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.`);let a=f.get(n.depthTexture);if(a.__renderTarget=n,(!a.__webglTexture||n.depthTexture.image.width!==n.width||n.depthTexture.image.height!==n.height)&&(n.depthTexture.image.width=n.width,n.depthTexture.image.height=n.height,n.depthTexture.needsUpdate=!0),i){if(a.__webglInit===void 0&&(a.__webglInit=!0,n.depthTexture.addEventListener(`dispose`,N)),a.__webglTexture===void 0){a.__webglTexture=e.createTexture(),d.bindTexture(e.TEXTURE_CUBE_MAP,a.__webglTexture),ce(e.TEXTURE_CUBE_MAP,n.depthTexture);let t=m.convert(n.depthTexture.format),r=m.convert(n.depthTexture.type),i;n.depthTexture.format===1026?i=e.DEPTH_COMPONENT24:n.depthTexture.format===1027&&(i=e.DEPTH24_STENCIL8);for(let a=0;a<6;a++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+a,0,i,n.width,n.height,0,t,r,null)}}else B(n.depthTexture,0);let o=a.__webglTexture,s=Ce(n),c=i?e.TEXTURE_CUBE_MAP_POSITIVE_X+r:e.TEXTURE_2D,l=n.depthTexture.format===1027?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(n.depthTexture.format===1026)we(n)?g.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,l,c,o,0,s):e.framebufferTexture2D(e.FRAMEBUFFER,l,c,o,0);else if(n.depthTexture.format===1027)we(n)?g.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,l,c,o,0,s):e.framebufferTexture2D(e.FRAMEBUFFER,l,c,o,0);else throw Error(`THREE.WebGLTextures: Unknown depthTexture format.`)}function ge(t){let n=f.get(t),r=t.isWebGLCubeRenderTarget===!0;if(n.__boundDepthTexture!==t.depthTexture){let e=t.depthTexture;if(n.__depthDisposeCallback&&n.__depthDisposeCallback(),e){let t=()=>{delete n.__boundDepthTexture,delete n.__depthDisposeCallback,e.removeEventListener(`dispose`,t)};e.addEventListener(`dispose`,t),n.__depthDisposeCallback=t}n.__boundDepthTexture=e}if(t.depthTexture&&!n.__autoAllocateDepthBuffer){if(r)for(let e=0;e<6;e++)he(n.__webglFramebuffer[e],t,e);else{let e=t.texture.mipmaps;e&&e.length>0?he(n.__webglFramebuffer[0],t,0):he(n.__webglFramebuffer,t,0)}}else if(r){n.__webglDepthbuffer=[];for(let r=0;r<6;r++)if(d.bindFramebuffer(e.FRAMEBUFFER,n.__webglFramebuffer[r]),n.__webglDepthbuffer[r]===void 0)n.__webglDepthbuffer[r]=e.createRenderbuffer(),me(n.__webglDepthbuffer[r],t,!1);else{let i=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,a=n.__webglDepthbuffer[r];e.bindRenderbuffer(e.RENDERBUFFER,a),e.framebufferRenderbuffer(e.FRAMEBUFFER,i,e.RENDERBUFFER,a)}}else{let r=t.texture.mipmaps;if(r&&r.length>0?d.bindFramebuffer(e.FRAMEBUFFER,n.__webglFramebuffer[0]):d.bindFramebuffer(e.FRAMEBUFFER,n.__webglFramebuffer),n.__webglDepthbuffer===void 0)n.__webglDepthbuffer=e.createRenderbuffer(),me(n.__webglDepthbuffer,t,!1);else{let r=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,i=n.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,i),e.framebufferRenderbuffer(e.FRAMEBUFFER,r,e.RENDERBUFFER,i)}}d.bindFramebuffer(e.FRAMEBUFFER,null)}function _e(t,n,r){let i=f.get(t);n!==void 0&&pe(i.__webglFramebuffer,t,t.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),r!==void 0&&ge(t)}function ve(t){let n=t.texture,r=f.get(t),i=f.get(n);t.addEventListener(`dispose`,P);let a=t.textures,o=t.isWebGLCubeRenderTarget===!0,s=a.length>1;if(s||(i.__webglTexture===void 0&&(i.__webglTexture=e.createTexture()),i.__version=n.version,h.memory.textures++),o){r.__webglFramebuffer=[];for(let t=0;t<6;t++)if(n.mipmaps&&n.mipmaps.length>0){r.__webglFramebuffer[t]=[];for(let i=0;i<n.mipmaps.length;i++)r.__webglFramebuffer[t][i]=e.createFramebuffer()}else r.__webglFramebuffer[t]=e.createFramebuffer()}else{if(n.mipmaps&&n.mipmaps.length>0){r.__webglFramebuffer=[];for(let t=0;t<n.mipmaps.length;t++)r.__webglFramebuffer[t]=e.createFramebuffer()}else r.__webglFramebuffer=e.createFramebuffer();if(s)for(let t=0,n=a.length;t<n;t++){let n=f.get(a[t]);n.__webglTexture===void 0&&(n.__webglTexture=e.createTexture(),h.memory.textures++)}if(t.samples>0&&we(t)===!1){r.__webglMultisampledFramebuffer=e.createFramebuffer(),r.__webglColorRenderbuffer=[],d.bindFramebuffer(e.FRAMEBUFFER,r.__webglMultisampledFramebuffer);for(let n=0;n<a.length;n++){let i=a[n];r.__webglColorRenderbuffer[n]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,r.__webglColorRenderbuffer[n]);let o=m.convert(i.format,i.colorSpace),s=m.convert(i.type),c=A(i.internalFormat,o,s,i.normalized,i.colorSpace,t.isXRRenderTarget===!0),l=Ce(t);e.renderbufferStorageMultisample(e.RENDERBUFFER,l,c,t.width,t.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+n,e.RENDERBUFFER,r.__webglColorRenderbuffer[n])}e.bindRenderbuffer(e.RENDERBUFFER,null),t.depthBuffer&&(r.__webglDepthRenderbuffer=e.createRenderbuffer(),me(r.__webglDepthRenderbuffer,t,!0)),d.bindFramebuffer(e.FRAMEBUFFER,null)}}if(o){d.bindTexture(e.TEXTURE_CUBE_MAP,i.__webglTexture),ce(e.TEXTURE_CUBE_MAP,n);for(let i=0;i<6;i++)if(n.mipmaps&&n.mipmaps.length>0)for(let a=0;a<n.mipmaps.length;a++)pe(r.__webglFramebuffer[i][a],t,n,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+i,a);else pe(r.__webglFramebuffer[i],t,n,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+i,0);E(n)&&D(e.TEXTURE_CUBE_MAP),d.unbindTexture()}else if(s){for(let n=0,i=a.length;n<i;n++){let i=a[n],o=f.get(i),s=e.TEXTURE_2D;(t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(s=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),d.bindTexture(s,o.__webglTexture),ce(s,i),pe(r.__webglFramebuffer,t,i,e.COLOR_ATTACHMENT0+n,s,0),E(i)&&D(s)}d.unbindTexture()}else{let a=e.TEXTURE_2D;if((t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(a=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),d.bindTexture(a,i.__webglTexture),ce(a,n),n.mipmaps&&n.mipmaps.length>0)for(let i=0;i<n.mipmaps.length;i++)pe(r.__webglFramebuffer[i],t,n,e.COLOR_ATTACHMENT0,a,i);else pe(r.__webglFramebuffer,t,n,e.COLOR_ATTACHMENT0,a,0);E(n)&&D(a),d.unbindTexture()}t.depthBuffer&&ge(t)}function ye(e){let t=e.textures;for(let n=0,r=t.length;n<r;n++){let r=t[n];if(E(r)){let t=k(e),n=f.get(r).__webglTexture;d.bindTexture(t,n),D(t),d.unbindTexture()}}}let be=[],xe=[];function Se(t){if(t.samples>0){if(we(t)===!1){let n=t.textures,r=t.width,i=t.height,a=e.COLOR_BUFFER_BIT,o=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,s=f.get(t),c=n.length>1;if(c)for(let t=0;t<n.length;t++)d.bindFramebuffer(e.FRAMEBUFFER,s.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,null),d.bindFramebuffer(e.FRAMEBUFFER,s.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,null,0);d.bindFramebuffer(e.READ_FRAMEBUFFER,s.__webglMultisampledFramebuffer);let l=t.texture.mipmaps;l&&l.length>0?d.bindFramebuffer(e.DRAW_FRAMEBUFFER,s.__webglFramebuffer[0]):d.bindFramebuffer(e.DRAW_FRAMEBUFFER,s.__webglFramebuffer);for(let l=0;l<n.length;l++){if(t.resolveDepthBuffer&&(t.depthBuffer&&(a|=e.DEPTH_BUFFER_BIT),t.stencilBuffer&&t.resolveStencilBuffer&&(a|=e.STENCIL_BUFFER_BIT)),c){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,s.__webglColorRenderbuffer[l]);let t=f.get(n[l]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t,0)}e.blitFramebuffer(0,0,r,i,0,0,r,i,a,e.NEAREST),_===!0&&(be.length=0,xe.length=0,be.push(e.COLOR_ATTACHMENT0+l),t.depthBuffer&&t.resolveDepthBuffer===!1&&(be.push(o),xe.push(o),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,xe)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,be))}if(d.bindFramebuffer(e.READ_FRAMEBUFFER,null),d.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),c)for(let t=0;t<n.length;t++){d.bindFramebuffer(e.FRAMEBUFFER,s.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,s.__webglColorRenderbuffer[t]);let r=f.get(n[t]).__webglTexture;d.bindFramebuffer(e.FRAMEBUFFER,s.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,r,0)}d.bindFramebuffer(e.DRAW_FRAMEBUFFER,s.__webglMultisampledFramebuffer)}else if(t.depthBuffer&&t.resolveDepthBuffer===!1&&_){let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[n])}}}function Ce(e){return Math.min(p.maxSamples,e.samples)}function we(e){let n=f.get(e);return e.samples>0&&t.has(`WEBGL_multisampled_render_to_texture`)===!0&&n.__useRenderToTexture!==!1}function W(e){let t=h.render.frame;y.get(e)!==t&&(y.set(e,t),e.update())}function Te(e,t){let n=e.colorSpace,r=e.format,i=e.type;return e.isCompressedTexture===!0||e.isVideoTexture===!0||n!==`srgb-linear`&&n!==``&&(Pt.getTransfer(n)===`srgb`?(r!==1023||i!==1009)&&Ke(`WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.`):qe(`WebGLTextures: Unsupported texture color space:`,n)),t}function Ee(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement?(v.width=e.naturalWidth||e.width,v.height=e.naturalHeight||e.height):typeof VideoFrame<`u`&&e instanceof VideoFrame?(v.width=e.displayWidth,v.height=e.displayHeight):(v.width=e.width,v.height=e.height),v}this.allocateTextureUnit=ne,this.resetTextureUnits=ee,this.getTextureUnits=te,this.setTextureUnits=z,this.setTexture2D=B,this.setTexture2DArray=V,this.setTexture3D=H,this.setTextureCube=ie,this.rebindTextures=_e,this.setupRenderTarget=ve,this.updateRenderTargetMipmap=ye,this.updateMultisampleRenderTarget=Se,this.setupDepthRenderbuffer=ge,this.setupFrameBufferTexture=pe,this.useMultisampledRTT=we,this.isReversedDepthBuffer=function(){return d.buffers.depth.getReversed()}}function xl(e,t){function n(n,r=``){let i,a=Pt.getTransfer(r);if(n===1009)return e.UNSIGNED_BYTE;if(n===1017)return e.UNSIGNED_SHORT_4_4_4_4;if(n===1018)return e.UNSIGNED_SHORT_5_5_5_1;if(n===35902)return e.UNSIGNED_INT_5_9_9_9_REV;if(n===35899)return e.UNSIGNED_INT_10F_11F_11F_REV;if(n===1010)return e.BYTE;if(n===1011)return e.SHORT;if(n===1012)return e.UNSIGNED_SHORT;if(n===1013)return e.INT;if(n===1014)return e.UNSIGNED_INT;if(n===1015)return e.FLOAT;if(n===1016)return e.HALF_FLOAT;if(n===1021)return e.ALPHA;if(n===1022)return e.RGB;if(n===1023)return e.RGBA;if(n===1026)return e.DEPTH_COMPONENT;if(n===1027)return e.DEPTH_STENCIL;if(n===1028)return e.RED;if(n===1029)return e.RED_INTEGER;if(n===1030)return e.RG;if(n===1031)return e.RG_INTEGER;if(n===1033)return e.RGBA_INTEGER;if(n===33776||n===33777||n===33778||n===33779){if(a===`srgb`){if(i=t.get(`WEBGL_compressed_texture_s3tc_srgb`),i!==null){if(n===33776)return i.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null}else if(i=t.get(`WEBGL_compressed_texture_s3tc`),i!==null){if(n===33776)return i.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null}if(n===35840||n===35841||n===35842||n===35843){if(i=t.get(`WEBGL_compressed_texture_pvrtc`),i!==null){if(n===35840)return i.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===35841)return i.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===35842)return i.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===35843)return i.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null}if(n===36196||n===37492||n===37496||n===37488||n===37489||n===37490||n===37491){if(i=t.get(`WEBGL_compressed_texture_etc`),i!==null){if(n===36196||n===37492)return a===`srgb`?i.COMPRESSED_SRGB8_ETC2:i.COMPRESSED_RGB8_ETC2;if(n===37496)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:i.COMPRESSED_RGBA8_ETC2_EAC;if(n===37488)return i.COMPRESSED_R11_EAC;if(n===37489)return i.COMPRESSED_SIGNED_R11_EAC;if(n===37490)return i.COMPRESSED_RG11_EAC;if(n===37491)return i.COMPRESSED_SIGNED_RG11_EAC}else return null}if(n===37808||n===37809||n===37810||n===37811||n===37812||n===37813||n===37814||n===37815||n===37816||n===37817||n===37818||n===37819||n===37820||n===37821){if(i=t.get(`WEBGL_compressed_texture_astc`),i!==null){if(n===37808)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:i.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===37809)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:i.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===37810)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:i.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===37811)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:i.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===37812)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:i.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===37813)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:i.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===37814)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:i.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===37815)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:i.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===37816)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:i.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===37817)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:i.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===37818)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:i.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===37819)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:i.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===37820)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:i.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===37821)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:i.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null}if(n===36492||n===36494||n===36495){if(i=t.get(`EXT_texture_compression_bptc`),i!==null){if(n===36492)return a===`srgb`?i.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:i.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===36494)return i.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===36495)return i.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null}if(n===36283||n===36284||n===36285||n===36286){if(i=t.get(`EXT_texture_compression_rgtc`),i!==null){if(n===36283)return i.COMPRESSED_RED_RGTC1_EXT;if(n===36284)return i.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===36285)return i.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===36286)return i.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null}return n===1020?e.UNSIGNED_INT_24_8:e[n]===void 0?null:e[n]}return{convert:n}}var Sl=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Cl=`
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

}`,wl=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new Ni(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new $i({vertexShader:Sl,fragmentShader:Cl,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new Qr(new Hi(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Tl=class extends Ze{constructor(e,t){super();let n=this,r=null,i=1,a=null,o=`local-floor`,s=1,c=null,l=null,u=null,f=null,p=null,m=null,h=typeof XRWebGLBinding<`u`,_=new wl,v={},y=t.getContextAttributes(),b=null,S=null,C=[],w=[],T=new Tt,k=null,A=new ja;A.viewport=new Gt;let j=new ja;j.viewport=new Gt;let M=[A,j],N=new Ha,P=null,F=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(e){let t=C[e];return t===void 0&&(t=new Dn,C[e]=t),t.getTargetRaySpace()},this.getControllerGrip=function(e){let t=C[e];return t===void 0&&(t=new Dn,C[e]=t),t.getGripSpace()},this.getHand=function(e){let t=C[e];return t===void 0&&(t=new Dn,C[e]=t),t.getHandSpace()};function I(e){let t=w.indexOf(e.inputSource);if(t===-1)return;let n=C[t];n!==void 0&&(n.update(e.inputSource,e.frame,c||a),n.dispatchEvent({type:e.type,data:e.inputSource}))}function L(){r.removeEventListener(`select`,I),r.removeEventListener(`selectstart`,I),r.removeEventListener(`selectend`,I),r.removeEventListener(`squeeze`,I),r.removeEventListener(`squeezestart`,I),r.removeEventListener(`squeezeend`,I),r.removeEventListener(`end`,L),r.removeEventListener(`inputsourceschange`,R);for(let e=0;e<C.length;e++){let t=w[e];t!==null&&(w[e]=null,C[e].disconnect(t))}P=null,F=null,_.reset();for(let e in v)delete v[e];e.setRenderTarget(b),p=null,f=null,u=null,r=null,S=null,H.stop(),n.isPresenting=!1,e.setPixelRatio(k),e.setSize(T.width,T.height,!1),n.dispatchEvent({type:`sessionend`})}this.setFramebufferScaleFactor=function(e){i=e,n.isPresenting===!0&&Ke(`WebXRManager: Cannot change framebuffer scale while presenting.`)},this.setReferenceSpaceType=function(e){o=e,n.isPresenting===!0&&Ke(`WebXRManager: Cannot change reference space type while presenting.`)},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(e){c=e},this.getBaseLayer=function(){return f===null?p:f},this.getBinding=function(){return u===null&&h&&(u=new XRWebGLBinding(r,t)),u},this.getFrame=function(){return m},this.getSession=function(){return r},this.setSession=async function(l){if(r=l,r!==null){if(b=e.getRenderTarget(),r.addEventListener(`select`,I),r.addEventListener(`selectstart`,I),r.addEventListener(`selectend`,I),r.addEventListener(`squeeze`,I),r.addEventListener(`squeezestart`,I),r.addEventListener(`squeezeend`,I),r.addEventListener(`end`,L),r.addEventListener(`inputsourceschange`,R),y.xrCompatible!==!0&&await t.makeXRCompatible(),k=e.getPixelRatio(),e.getSize(T),h&&`createProjectionLayer`in XRWebGLBinding.prototype){let n=null,a=null,o=null;y.depth&&(o=y.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,n=y.stencil?O:D,a=y.stencil?x:g);let s={colorFormat:t.RGBA8,depthFormat:o,scaleFactor:i};u=this.getBinding(),f=u.createProjectionLayer(s),r.updateRenderState({layers:[f]}),e.setPixelRatio(1),e.setSize(f.textureWidth,f.textureHeight,!1),S=new qt(f.textureWidth,f.textureHeight,{format:E,type:d,depthTexture:new ji(f.textureWidth,f.textureHeight,a,void 0,void 0,void 0,void 0,void 0,void 0,n),stencilBuffer:y.stencil,colorSpace:e.outputColorSpace,samples:y.antialias?4:0,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}else{let n={antialias:y.antialias,alpha:!0,depth:y.depth,stencil:y.stencil,framebufferScaleFactor:i};p=new XRWebGLLayer(r,t,n),r.updateRenderState({baseLayer:p}),e.setPixelRatio(1),e.setSize(p.framebufferWidth,p.framebufferHeight,!1),S=new qt(p.framebufferWidth,p.framebufferHeight,{format:E,type:d,colorSpace:e.outputColorSpace,stencilBuffer:y.stencil,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1})}S.isXRRenderTarget=!0,this.setFoveation(s),c=null,a=await r.requestReferenceSpace(o),H.setContext(r),H.start(),n.isPresenting=!0,n.dispatchEvent({type:`sessionstart`})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return _.getDepthTexture()};function R(e){for(let t=0;t<e.removed.length;t++){let n=e.removed[t],r=w.indexOf(n);r>=0&&(w[r]=null,C[r].disconnect(n))}for(let t=0;t<e.added.length;t++){let n=e.added[t],r=w.indexOf(n);if(r===-1){for(let e=0;e<C.length;e++)if(e>=w.length){w.push(n),r=e;break}else if(w[e]===null){w[e]=n,r=e;break}if(r===-1)break}let i=C[r];i&&i.connect(n)}}let ee=new q,te=new q;function z(e,t,n){ee.setFromMatrixPosition(t.matrixWorld),te.setFromMatrixPosition(n.matrixWorld);let r=ee.distanceTo(te),i=t.projectionMatrix.elements,a=n.projectionMatrix.elements,o=i[14]/(i[10]-1),s=i[14]/(i[10]+1),c=(i[9]+1)/i[5],l=(i[9]-1)/i[5],u=(i[8]-1)/i[0],d=(a[8]+1)/a[0],f=o*u,p=o*d,m=r/(-u+d),h=m*-u;if(t.matrixWorld.decompose(e.position,e.quaternion,e.scale),e.translateX(h),e.translateZ(m),e.matrixWorld.compose(e.position,e.quaternion,e.scale),e.matrixWorldInverse.copy(e.matrixWorld).invert(),i[10]===-1)e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse);else{let t=o+m,n=s+m,i=f-h,a=p+(r-h),u=c*s/n*t,d=l*s/n*t;e.projectionMatrix.makePerspective(i,a,u,d,t,n),e.projectionMatrixInverse.copy(e.projectionMatrix).invert()}}function ne(e,t){t===null?e.matrixWorld.copy(e.matrix):e.matrixWorld.multiplyMatrices(t.matrixWorld,e.matrix),e.matrixWorldInverse.copy(e.matrixWorld).invert()}this.updateCamera=function(e){if(r===null)return;let t=e.near,n=e.far;_.texture!==null&&(_.depthNear>0&&(t=_.depthNear),_.depthFar>0&&(n=_.depthFar)),N.near=j.near=A.near=t,N.far=j.far=A.far=n,(P!==N.near||F!==N.far)&&(r.updateRenderState({depthNear:N.near,depthFar:N.far}),P=N.near,F=N.far),N.layers.mask=e.layers.mask|6,A.layers.mask=N.layers.mask&-5,j.layers.mask=N.layers.mask&-3;let i=e.parent,a=N.cameras;ne(N,i);for(let e=0;e<a.length;e++)ne(a[e],i);a.length===2?z(N,A,j):N.projectionMatrix.copy(A.projectionMatrix),re(e,N,i)};function re(e,t,n){n===null?e.matrix.copy(t.matrixWorld):(e.matrix.copy(n.matrixWorld),e.matrix.invert(),e.matrix.multiply(t.matrixWorld)),e.matrix.decompose(e.position,e.quaternion,e.scale),e.updateMatrixWorld(!0),e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse),e.isPerspectiveCamera&&(e.fov=tt*2*Math.atan(1/e.projectionMatrix.elements[5]),e.zoom=1)}this.getCamera=function(){return N},this.getFoveation=function(){if(f!==null||p!==null)return s},this.setFoveation=function(e){s=e,f!==null&&(f.fixedFoveation=e),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=e)},this.hasDepthSensing=function(){return _.texture!==null},this.getDepthSensingMesh=function(){return _.getMesh(N)},this.getCameraTexture=function(e){return v[e]};let B=null;function V(t,i){if(l=i.getViewerPose(c||a),m=i,l!==null){let t=l.views;p!==null&&(e.setRenderTargetFramebuffer(S,p.framebuffer),e.setRenderTarget(S));let i=!1;t.length!==N.cameras.length&&(N.cameras.length=0,i=!0);for(let n=0;n<t.length;n++){let r=t[n],a=null;if(p!==null)a=p.getViewport(r);else{let t=u.getViewSubImage(f,r);a=t.viewport,n===0&&(e.setRenderTargetTextures(S,t.colorTexture,t.depthStencilTexture),e.setRenderTarget(S))}let o=M[n];o===void 0&&(o=new ja,o.layers.enable(n),o.viewport=new Gt,M[n]=o),o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.quaternion,o.scale),o.projectionMatrix.fromArray(r.projectionMatrix),o.projectionMatrixInverse.copy(o.projectionMatrix).invert(),o.viewport.set(a.x,a.y,a.width,a.height),n===0&&(N.matrix.copy(o.matrix),N.matrix.decompose(N.position,N.quaternion,N.scale)),i===!0&&N.cameras.push(o)}let a=r.enabledFeatures;if(a&&a.includes(`depth-sensing`)&&r.depthUsage==`gpu-optimized`&&h){u=n.getBinding();let e=u.getDepthInformation(t[0]);e&&e.isValid&&e.texture&&_.init(e,r.renderState)}if(a&&a.includes(`camera-access`)&&h){e.state.unbindTexture(),u=n.getBinding();for(let e=0;e<t.length;e++){let n=t[e].camera;if(n){let e=v[n];e||(e=new Ni,v[n]=e);let t=u.getCameraImage(n);e.sourceTexture=t}}}}for(let e=0;e<C.length;e++){let t=w[e],n=C[e];t!==null&&n!==void 0&&n.update(t,i,c||a)}B&&B(t,i),i.detectedPlanes&&n.dispatchEvent({type:`planesdetected`,data:i}),m=null}let H=new _o;H.setAnimationLoop(V),this.setAnimationLoop=function(e){B=e},this.dispose=function(){}}},El=new Xt,Dl=new kt;Dl.set(-1,0,0,0,1,0,0,0,1);function Ol(e,t){function n(e,t){e.matrixAutoUpdate===!0&&e.updateMatrix(),t.value.copy(e.matrix)}function r(t,n){n.color.getRGB(t.fogColor.value,Yi(e)),n.isFog?(t.fogNear.value=n.near,t.fogFar.value=n.far):n.isFogExp2&&(t.fogDensity.value=n.density)}function i(e,t,n,r,i){t.isNodeMaterial?t.uniformsNeedUpdate=!1:t.isMeshBasicMaterial?a(e,t):t.isMeshLambertMaterial?(a(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshToonMaterial?(a(e,t),d(e,t)):t.isMeshPhongMaterial?(a(e,t),u(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshStandardMaterial?(a(e,t),f(e,t),t.isMeshPhysicalMaterial&&p(e,t,i)):t.isMeshMatcapMaterial?(a(e,t),m(e,t)):t.isMeshDepthMaterial?a(e,t):t.isMeshDistanceMaterial?(a(e,t),h(e,t)):t.isMeshNormalMaterial?a(e,t):t.isLineBasicMaterial?(o(e,t),t.isLineDashedMaterial&&s(e,t)):t.isPointsMaterial?c(e,t,n,r):t.isSpriteMaterial?l(e,t):t.isShadowMaterial?(e.color.value.copy(t.color),e.opacity.value=t.opacity):t.isShaderMaterial&&(t.uniformsNeedUpdate=!1)}function a(e,r){e.opacity.value=r.opacity,r.color&&e.diffuse.value.copy(r.color),r.emissive&&e.emissive.value.copy(r.emissive).multiplyScalar(r.emissiveIntensity),r.map&&(e.map.value=r.map,n(r.map,e.mapTransform)),r.alphaMap&&(e.alphaMap.value=r.alphaMap,n(r.alphaMap,e.alphaMapTransform)),r.bumpMap&&(e.bumpMap.value=r.bumpMap,n(r.bumpMap,e.bumpMapTransform),e.bumpScale.value=r.bumpScale,r.side===1&&(e.bumpScale.value*=-1)),r.normalMap&&(e.normalMap.value=r.normalMap,n(r.normalMap,e.normalMapTransform),e.normalScale.value.copy(r.normalScale),r.side===1&&e.normalScale.value.negate()),r.displacementMap&&(e.displacementMap.value=r.displacementMap,n(r.displacementMap,e.displacementMapTransform),e.displacementScale.value=r.displacementScale,e.displacementBias.value=r.displacementBias),r.emissiveMap&&(e.emissiveMap.value=r.emissiveMap,n(r.emissiveMap,e.emissiveMapTransform)),r.specularMap&&(e.specularMap.value=r.specularMap,n(r.specularMap,e.specularMapTransform)),r.alphaTest>0&&(e.alphaTest.value=r.alphaTest);let i=t.get(r),a=i.envMap,o=i.envMapRotation;a&&(e.envMap.value=a,e.envMapRotation.value.setFromMatrix4(El.makeRotationFromEuler(o)).transpose(),a.isCubeTexture&&a.isRenderTargetTexture===!1&&e.envMapRotation.value.premultiply(Dl),e.reflectivity.value=r.reflectivity,e.ior.value=r.ior,e.refractionRatio.value=r.refractionRatio),r.lightMap&&(e.lightMap.value=r.lightMap,e.lightMapIntensity.value=r.lightMapIntensity,n(r.lightMap,e.lightMapTransform)),r.aoMap&&(e.aoMap.value=r.aoMap,e.aoMapIntensity.value=r.aoMapIntensity,n(r.aoMap,e.aoMapTransform))}function o(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform))}function s(e,t){e.dashSize.value=t.dashSize,e.totalSize.value=t.dashSize+t.gapSize,e.scale.value=t.scale}function c(e,t,r,i){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.size.value=t.size*r,e.scale.value=i*.5,t.map&&(e.map.value=t.map,n(t.map,e.uvTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function l(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.rotation.value=t.rotation,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function u(e,t){e.specular.value.copy(t.specular),e.shininess.value=Math.max(t.shininess,1e-4)}function d(e,t){t.gradientMap&&(e.gradientMap.value=t.gradientMap)}function f(e,t){e.metalness.value=t.metalness,t.metalnessMap&&(e.metalnessMap.value=t.metalnessMap,n(t.metalnessMap,e.metalnessMapTransform)),e.roughness.value=t.roughness,t.roughnessMap&&(e.roughnessMap.value=t.roughnessMap,n(t.roughnessMap,e.roughnessMapTransform)),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)}function p(e,t,r){e.ior.value=t.ior,t.sheen>0&&(e.sheenColor.value.copy(t.sheenColor).multiplyScalar(t.sheen),e.sheenRoughness.value=t.sheenRoughness,t.sheenColorMap&&(e.sheenColorMap.value=t.sheenColorMap,n(t.sheenColorMap,e.sheenColorMapTransform)),t.sheenRoughnessMap&&(e.sheenRoughnessMap.value=t.sheenRoughnessMap,n(t.sheenRoughnessMap,e.sheenRoughnessMapTransform))),t.clearcoat>0&&(e.clearcoat.value=t.clearcoat,e.clearcoatRoughness.value=t.clearcoatRoughness,t.clearcoatMap&&(e.clearcoatMap.value=t.clearcoatMap,n(t.clearcoatMap,e.clearcoatMapTransform)),t.clearcoatRoughnessMap&&(e.clearcoatRoughnessMap.value=t.clearcoatRoughnessMap,n(t.clearcoatRoughnessMap,e.clearcoatRoughnessMapTransform)),t.clearcoatNormalMap&&(e.clearcoatNormalMap.value=t.clearcoatNormalMap,n(t.clearcoatNormalMap,e.clearcoatNormalMapTransform),e.clearcoatNormalScale.value.copy(t.clearcoatNormalScale),t.side===1&&e.clearcoatNormalScale.value.negate())),t.dispersion>0&&(e.dispersion.value=t.dispersion),t.iridescence>0&&(e.iridescence.value=t.iridescence,e.iridescenceIOR.value=t.iridescenceIOR,e.iridescenceThicknessMinimum.value=t.iridescenceThicknessRange[0],e.iridescenceThicknessMaximum.value=t.iridescenceThicknessRange[1],t.iridescenceMap&&(e.iridescenceMap.value=t.iridescenceMap,n(t.iridescenceMap,e.iridescenceMapTransform)),t.iridescenceThicknessMap&&(e.iridescenceThicknessMap.value=t.iridescenceThicknessMap,n(t.iridescenceThicknessMap,e.iridescenceThicknessMapTransform))),t.transmission>0&&(e.transmission.value=t.transmission,e.transmissionSamplerMap.value=r.texture,e.transmissionSamplerSize.value.set(r.width,r.height),t.transmissionMap&&(e.transmissionMap.value=t.transmissionMap,n(t.transmissionMap,e.transmissionMapTransform)),e.thickness.value=t.thickness,t.thicknessMap&&(e.thicknessMap.value=t.thicknessMap,n(t.thicknessMap,e.thicknessMapTransform)),e.attenuationDistance.value=t.attenuationDistance,e.attenuationColor.value.copy(t.attenuationColor)),t.anisotropy>0&&(e.anisotropyVector.value.set(t.anisotropy*Math.cos(t.anisotropyRotation),t.anisotropy*Math.sin(t.anisotropyRotation)),t.anisotropyMap&&(e.anisotropyMap.value=t.anisotropyMap,n(t.anisotropyMap,e.anisotropyMapTransform))),e.specularIntensity.value=t.specularIntensity,e.specularColor.value.copy(t.specularColor),t.specularColorMap&&(e.specularColorMap.value=t.specularColorMap,n(t.specularColorMap,e.specularColorMapTransform)),t.specularIntensityMap&&(e.specularIntensityMap.value=t.specularIntensityMap,n(t.specularIntensityMap,e.specularIntensityMapTransform))}function m(e,t){t.matcap&&(e.matcap.value=t.matcap)}function h(e,n){let r=t.get(n).light;e.referencePosition.value.setFromMatrixPosition(r.matrixWorld),e.nearDistance.value=r.shadow.camera.near,e.farDistance.value=r.shadow.camera.far}return{refreshFogUniforms:r,refreshMaterialUniforms:i}}function kl(e,t,n,r){let i={},a={},o=[],s=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function c(e,t){let n=t.program;r.uniformBlockBinding(e,n)}function l(e,n){let o=i[e.id];o===void 0&&(g(e),o=u(e),i[e.id]=o,e.addEventListener(`dispose`,v));let s=n.program;r.updateUBOMapping(e,s);let c=t.render.frame;a[e.id]!==c&&(f(e),a[e.id]=c)}function u(t){let n=d();t.__bindingPointIndex=n;let r=e.createBuffer(),i=t.__size,a=t.usage;return e.bindBuffer(e.UNIFORM_BUFFER,r),e.bufferData(e.UNIFORM_BUFFER,i,a),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,n,r),r}function d(){for(let e=0;e<s;e++)if(o.indexOf(e)===-1)return o.push(e),e;return qe(`WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached.`),0}function f(t){let n=i[t.id],r=t.uniforms,a=t.__cache;e.bindBuffer(e.UNIFORM_BUFFER,n);for(let e=0,t=r.length;e<t;e++){let t=r[e];if(Array.isArray(t))for(let n=0,r=t.length;n<r;n++)p(t[n],e,n,a);else p(t,e,0,a)}e.bindBuffer(e.UNIFORM_BUFFER,null)}function p(t,n,r,i){if(h(t,n,r,i)===!0){let n=t.__offset,r=t.value;if(Array.isArray(r)){let e=0;for(let n=0;n<r.length;n++){let i=r[n],a=_(i);m(i,t.__data,e),typeof i!=`number`&&typeof i!=`boolean`&&!i.isMatrix3&&!ArrayBuffer.isView(i)&&(e+=a.storage/Float32Array.BYTES_PER_ELEMENT)}}else m(r,t.__data,0);e.bufferSubData(e.UNIFORM_BUFFER,n,t.__data)}}function m(e,t,n){typeof e==`number`||typeof e==`boolean`?t[0]=e:e.isMatrix3?(t[0]=e.elements[0],t[1]=e.elements[1],t[2]=e.elements[2],t[3]=0,t[4]=e.elements[3],t[5]=e.elements[4],t[6]=e.elements[5],t[7]=0,t[8]=e.elements[6],t[9]=e.elements[7],t[10]=e.elements[8],t[11]=0):ArrayBuffer.isView(e)?t.set(new e.constructor(e.buffer,e.byteOffset,t.length)):e.toArray(t,n)}function h(e,t,n,r){let i=e.value,a=t+`_`+n;if(r[a]===void 0)return r[a]=typeof i==`number`||typeof i==`boolean`?i:ArrayBuffer.isView(i)?i.slice():i.clone(),!0;{let e=r[a];if(typeof i==`number`||typeof i==`boolean`){if(e!==i)return r[a]=i,!0}else if(ArrayBuffer.isView(i))return!0;else if(e.equals(i)===!1)return e.copy(i),!0}return!1}function g(e){let t=e.uniforms,n=0;for(let e=0,r=t.length;e<r;e++){let r=Array.isArray(t[e])?t[e]:[t[e]];for(let e=0,t=r.length;e<t;e++){let t=r[e],i=Array.isArray(t.value)?t.value:[t.value];for(let e=0,r=i.length;e<r;e++){let r=i[e],a=_(r),o=n%16,s=o%a.boundary,c=o+s;n+=s,c!==0&&16-c<a.storage&&(n+=16-c),t.__data=new Float32Array(a.storage/Float32Array.BYTES_PER_ELEMENT),t.__offset=n,n+=a.storage}}}let r=n%16;return r>0&&(n+=16-r),e.__size=n,e.__cache={},this}function _(e){let t={boundary:0,storage:0};return typeof e==`number`||typeof e==`boolean`?(t.boundary=4,t.storage=4):e.isVector2?(t.boundary=8,t.storage=8):e.isVector3||e.isColor?(t.boundary=16,t.storage=12):e.isVector4?(t.boundary=16,t.storage=16):e.isMatrix3?(t.boundary=48,t.storage=48):e.isMatrix4?(t.boundary=64,t.storage=64):e.isTexture?Ke(`WebGLRenderer: Texture samplers can not be part of an uniforms group.`):ArrayBuffer.isView(e)?(t.boundary=16,t.storage=e.byteLength):Ke(`WebGLRenderer: Unsupported uniform value type.`,e),t}function v(t){let n=t.target;n.removeEventListener(`dispose`,v);let r=o.indexOf(n.__bindingPointIndex);o.splice(r,1),e.deleteBuffer(i[n.id]),delete i[n.id],delete a[n.id]}function y(){for(let t in i)e.deleteBuffer(i[t]);o=[],i={},a={}}return{bind:c,update:l,dispose:y}}var Al=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),jl=null;function Ml(){return jl===null&&(jl=new ti(Al,16,16,j,v),jl.name=`DFG_LUT`,jl.minFilter=c,jl.magFilter=c,jl.wrapS=r,jl.wrapT=r,jl.generateMipmaps=!1,jl.needsUpdate=!0),jl}var Nl=class{constructor(e={}){let{canvas:t=He(),context:n=null,depth:r=!0,stencil:i=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:s=!0,preserveDrawingBuffer:c=!1,powerPreference:l=`default`,failIfMajorPerformanceCaveat:f=!1,reversedDepthBuffer:p=!1,outputBufferType:h=d}=e;this.isWebGLRenderer=!0;let _;if(n!==null){if(typeof WebGLRenderingContext<`u`&&n instanceof WebGLRenderingContext)throw Error(`THREE.WebGLRenderer: WebGL 1 is not supported since r163.`);_=n.getContextAttributes().alpha}else _=a;let S=h,C=new Set([N,M,A]),w=new Set([d,g,m,x,y,b]),T=new Uint32Array(4),E=new Int32Array(4),D=new q,O=null,k=null,j=[],P=[],F=null;this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=0,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let I=this,L=!1,R=null,ee=null,te=null,z=null;this._outputColorSpace=Me;let ne=0,re=0,B=null,V=-1,H=null,ie=new Gt,ae=new Gt,oe=null,se=new Mn(0),ce=0,le=t.width,ue=t.height,de=1,U=null,fe=null,pe=new Gt(0,0,le,ue),me=new Gt(0,0,le,ue),he=!1,ge=new li,_e=!1,ve=!1,ye=new Xt,be=new q,xe=new Gt,Se={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Ce=!1;function we(){return B===null?de:1}let W=n;function Te(e,n){return t.getContext(e,n)}try{let e={alpha:!0,depth:r,stencil:i,antialias:o,premultipliedAlpha:s,preserveDrawingBuffer:c,powerPreference:l,failIfMajorPerformanceCaveat:f};if(`setAttribute`in t&&t.setAttribute(`data-engine`,`three.js r185`),t.addEventListener(`webglcontextlost`,nt,!1),t.addEventListener(`webglcontextrestored`,rt,!1),t.addEventListener(`webglcontextcreationerror`,it,!1),W===null){let t=`webgl2`;if(W=Te(t,e),W===null)throw Te(t)?Error(`THREE.WebGLRenderer: Error creating WebGL context with your selected attributes.`):Error(`THREE.WebGLRenderer: Error creating WebGL context.`)}}catch(e){throw qe(`WebGLRenderer: `+e.message),e}let Ee,De,G,Oe,K,ke,Ae,je,Ne,Pe,Fe,Ie,Le,ze,Be,Ve,Ue,Ge,Je,Xe,Ze,Qe,$e;function et(){Ee=new Zo(W),Ee.init(),Ze=new xl(W,Ee),De=new Do(W,Ee,e,Ze),G=new yl(W,Ee),De.reversedDepthBuffer&&p&&G.buffers.depth.setReversed(!0),ee=W.createFramebuffer(),te=W.createFramebuffer(),z=W.createFramebuffer(),Oe=new es(W),K=new $c,ke=new bl(W,Ee,G,K,De,Ze,Oe),Ae=new Xo(I),je=new vo(W),Qe=new To(W,je),Ne=new Qo(W,je,Oe,Qe),Pe=new ns(W,Ne,je,Qe,Oe),Ge=new ts(W,De,ke),Be=new Oo(K),Fe=new Qc(I,Ae,Ee,De,Qe,Be),Ie=new Ol(I,K),Le=new rl,ze=new ul(Ee),Ue=new wo(I,Ae,G,Pe,_,s),Ve=new vl(I,Pe,De),$e=new kl(W,Oe,De,G),Je=new Eo(W,Ee,Oe),Xe=new $o(W,Ee,Oe),Oe.programs=Fe.programs,I.capabilities=De,I.extensions=Ee,I.properties=K,I.renderLists=Le,I.shadowMap=Ve,I.state=G,I.info=Oe}et(),S!==1009&&(F=new is(S,t.width,t.height,o,r,i));let tt=new Tl(I,W);this.xr=tt,this.getContext=function(){return W},this.getContextAttributes=function(){return W.getContextAttributes()},this.forceContextLoss=function(){let e=Ee.get(`WEBGL_lose_context`);e&&e.loseContext()},this.forceContextRestore=function(){let e=Ee.get(`WEBGL_lose_context`);e&&e.restoreContext()},this.getPixelRatio=function(){return de},this.setPixelRatio=function(e){e!==void 0&&(de=e,this.setSize(le,ue,!1))},this.getSize=function(e){return e.set(le,ue)},this.setSize=function(e,n,r=!0){if(tt.isPresenting){Ke(`WebGLRenderer: Can't change size while VR device is presenting.`);return}le=e,ue=n,t.width=Math.floor(e*de),t.height=Math.floor(n*de),r===!0&&(t.style.width=e+`px`,t.style.height=n+`px`),F!==null&&F.setSize(t.width,t.height),this.setViewport(0,0,e,n)},this.getDrawingBufferSize=function(e){return e.set(le*de,ue*de).floor()},this.setDrawingBufferSize=function(e,n,r){le=e,ue=n,de=r,t.width=Math.floor(e*r),t.height=Math.floor(n*r),this.setViewport(0,0,e,n)},this.setEffects=function(e){if(S===1009){qe(`WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.`);return}if(e){for(let t=0;t<e.length;t++)if(e[t].isOutputPass===!0){Ke(`WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.`);break}}F.setEffects(e||[])},this.getCurrentViewport=function(e){return e.copy(ie)},this.getViewport=function(e){return e.copy(pe)},this.setViewport=function(e,t,n,r){e.isVector4?pe.set(e.x,e.y,e.z,e.w):pe.set(e,t,n,r),G.viewport(ie.copy(pe).multiplyScalar(de).round())},this.getScissor=function(e){return e.copy(me)},this.setScissor=function(e,t,n,r){e.isVector4?me.set(e.x,e.y,e.z,e.w):me.set(e,t,n,r),G.scissor(ae.copy(me).multiplyScalar(de).round())},this.getScissorTest=function(){return he},this.setScissorTest=function(e){G.setScissorTest(he=e)},this.setOpaqueSort=function(e){U=e},this.setTransparentSort=function(e){fe=e},this.getClearColor=function(e){return e.copy(Ue.getClearColor())},this.setClearColor=function(){Ue.setClearColor(...arguments)},this.getClearAlpha=function(){return Ue.getClearAlpha()},this.setClearAlpha=function(){Ue.setClearAlpha(...arguments)},this.clear=function(e=!0,t=!0,n=!0){let r=0;if(e){let e=!1;if(B!==null){let t=B.texture.format;e=C.has(t)}if(e){let e=B.texture.type,t=w.has(e),n=Ue.getClearColor(),r=Ue.getClearAlpha(),i=n.r,a=n.g,o=n.b;t?(T[0]=i,T[1]=a,T[2]=o,T[3]=r,W.clearBufferuiv(W.COLOR,0,T)):(E[0]=i,E[1]=a,E[2]=o,E[3]=r,W.clearBufferiv(W.COLOR,0,E))}else r|=W.COLOR_BUFFER_BIT}t&&(r|=W.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),n&&(r|=W.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),r!==0&&W.clear(r)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(e){e.setRenderer(this),R=e},this.dispose=function(){t.removeEventListener(`webglcontextlost`,nt,!1),t.removeEventListener(`webglcontextrestored`,rt,!1),t.removeEventListener(`webglcontextcreationerror`,it,!1),Ue.dispose(),Le.dispose(),ze.dispose(),K.dispose(),Ae.dispose(),Pe.dispose(),Qe.dispose(),$e.dispose(),Fe.dispose(),tt.dispose(),tt.removeEventListener(`sessionstart`,dt),tt.removeEventListener(`sessionend`,ft),pt.stop()};function nt(e){e.preventDefault(),We(`WebGLRenderer: Context Lost.`),L=!0}function rt(){We(`WebGLRenderer: Context Restored.`),L=!1;let e=Oe.autoReset,t=Ve.enabled,n=Ve.autoUpdate,r=Ve.needsUpdate,i=Ve.type;et(),Oe.autoReset=e,Ve.enabled=t,Ve.autoUpdate=n,Ve.needsUpdate=r,Ve.type=i}function it(e){qe(`WebGLRenderer: A WebGL context could not be created. Reason: `,e.statusMessage)}function at(e){let t=e.target;t.removeEventListener(`dispose`,at),ot(t)}function ot(e){st(e),K.remove(e)}function st(e){let t=K.get(e).programs;t!==void 0&&(t.forEach(function(e){Fe.releaseProgram(e)}),e.isShaderMaterial&&Fe.releaseShaderCache(e))}this.renderBufferDirect=function(e,t,n,r,i,a){t===null&&(t=Se);let o=i.isMesh&&i.matrixWorld.determinantAffine()<0,s=Ct(e,t,n,r,i);G.setMaterial(r,o);let c=n.index,l=1;if(r.wireframe===!0){if(c=Ne.getWireframeAttribute(n),c===void 0)return;l=2}let u=n.drawRange,d=n.attributes.position,f=u.start*l,p=(u.start+u.count)*l;a!==null&&(f=Math.max(f,a.start*l),p=Math.min(p,(a.start+a.count)*l)),c===null?d!=null&&(f=Math.max(f,0),p=Math.min(p,d.count)):(f=Math.max(f,0),p=Math.min(p,c.count));let m=p-f;if(m<0||m===1/0)return;Qe.setup(i,r,s,n,c);let h,g=Je;if(c!==null&&(h=je.get(c),g=Xe,g.setIndex(h)),i.isMesh)r.wireframe===!0?(G.setLineWidth(r.wireframeLinewidth*we()),g.setMode(W.LINES)):g.setMode(W.TRIANGLES);else if(i.isLine){let e=r.linewidth;e===void 0&&(e=1),G.setLineWidth(e*we()),i.isLineSegments?g.setMode(W.LINES):i.isLineLoop?g.setMode(W.LINE_LOOP):g.setMode(W.LINE_STRIP)}else i.isPoints?g.setMode(W.POINTS):i.isSprite&&g.setMode(W.TRIANGLES);if(i.isBatchedMesh){if(Ee.get(`WEBGL_multi_draw`))g.renderMultiDraw(i._multiDrawStarts,i._multiDrawCounts,i._multiDrawCount);else{let e=i._multiDrawStarts,t=i._multiDrawCounts,n=i._multiDrawCount,a=c?je.get(c).bytesPerElement:1,o=K.get(r).currentProgram.getUniforms();for(let r=0;r<n;r++)o.setValue(W,`_gl_DrawID`,r),g.render(e[r]/a,t[r])}}else if(i.isInstancedMesh)g.renderInstances(f,m,i.count);else if(n.isInstancedBufferGeometry){let e=n._maxInstanceCount===void 0?1/0:n._maxInstanceCount,t=Math.min(n.instanceCount,e);g.renderInstances(f,m,t)}else g.render(f,m)};function ct(e,t,n){e.transparent===!0&&e.side===2&&e.forceSinglePass===!1?(e.side=1,e.needsUpdate=!0,yt(e,t,n),e.side=0,e.needsUpdate=!0,yt(e,t,n),e.side=2):yt(e,t,n)}this.compile=function(e,t,n=null){n===null&&(n=e),k=ze.get(n),k.init(t),P.push(k),n.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(k.pushLight(e),e.castShadow&&k.pushShadow(e))}),e!==n&&e.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(k.pushLight(e),e.castShadow&&k.pushShadow(e))}),k.setupLights();let r=new Set;return e.traverse(function(e){if(!(e.isMesh||e.isPoints||e.isLine||e.isSprite))return;let t=e.material;if(t){if(Array.isArray(t))for(let i=0;i<t.length;i++){let a=t[i];ct(a,n,e),r.add(a)}else ct(t,n,e),r.add(t)}}),k=P.pop(),r},this.compileAsync=function(e,t,n=null){let r=this.compile(e,t,n);return new Promise(t=>{function n(){if(r.forEach(function(e){K.get(e).currentProgram.isReady()&&r.delete(e)}),r.size===0){t(e);return}setTimeout(n,10)}Ee.get(`KHR_parallel_shader_compile`)===null?setTimeout(n,10):n()})};let lt=null;function ut(e){lt&&lt(e)}function dt(){pt.stop()}function ft(){pt.start()}let pt=new _o;pt.setAnimationLoop(ut),typeof self<`u`&&pt.setContext(self),this.setAnimationLoop=function(e){lt=e,tt.setAnimationLoop(e),e===null?pt.stop():pt.start()},tt.addEventListener(`sessionstart`,dt),tt.addEventListener(`sessionend`,ft),this.render=function(e,t){if(t!==void 0&&t.isCamera!==!0){qe(`WebGLRenderer.render: camera is not an instance of THREE.Camera.`);return}if(L===!0)return;R!==null&&R.renderStart(e,t);let n=tt.enabled===!0&&tt.isPresenting===!0,r=F!==null&&(B===null||n)&&F.begin(I,B);if(e.matrixWorldAutoUpdate===!0&&e.updateMatrixWorld(),t.parent===null&&t.matrixWorldAutoUpdate===!0&&t.updateMatrixWorld(),tt.enabled===!0&&tt.isPresenting===!0&&(F===null||F.isCompositing()===!1)&&(tt.cameraAutoUpdate===!0&&tt.updateCamera(t),t=tt.getCamera()),e.isScene===!0&&e.onBeforeRender(I,e,t,B),k=ze.get(e,P.length),k.init(t),k.state.textureUnits=ke.getTextureUnits(),P.push(k),ye.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),ge.setFromProjectionMatrix(ye,Re,t.reversedDepth),ve=this.localClippingEnabled,_e=Be.init(this.clippingPlanes,ve),O=Le.get(e,j.length),O.init(),j.push(O),tt.enabled===!0&&tt.isPresenting===!0){let e=I.xr.getDepthSensingMesh();e!==null&&mt(e,t,-1/0,I.sortObjects)}mt(e,t,0,I.sortObjects),O.finish(),I.sortObjects===!0&&O.sort(U,fe,t.reversedDepth),Ce=tt.enabled===!1||tt.isPresenting===!1||tt.hasDepthSensing()===!1,Ce&&Ue.addToRenderList(O,e),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),_e===!0&&Be.beginShadows();let i=k.state.shadowsArray;if(Ve.render(i,e,t),_e===!0&&Be.endShadows(),(r&&F.hasRenderPass())===!1){let n=O.opaque,r=O.transmissive;if(k.setupLights(),t.isArrayCamera){let i=t.cameras;if(r.length>0)for(let t=0,a=i.length;t<a;t++){let a=i[t];gt(n,r,e,a)}Ce&&Ue.render(e);for(let t=0,n=i.length;t<n;t++){let n=i[t];ht(O,e,n,n.viewport)}}else r.length>0&&gt(n,r,e,t),Ce&&Ue.render(e),ht(O,e,t)}B!==null&&re===0&&(ke.updateMultisampleRenderTarget(B),ke.updateRenderTargetMipmap(B)),r&&F.end(I),e.isScene===!0&&e.onAfterRender(I,e,t),Qe.resetDefaultState(),V=-1,H=null,P.pop(),P.length>0?(k=P[P.length-1],ke.setTextureUnits(k.state.textureUnits),_e===!0&&Be.setGlobalState(I.clippingPlanes,k.state.camera)):k=null,j.pop(),O=j.length>0?j[j.length-1]:null,R!==null&&R.renderEnd()};function mt(e,t,n,r){if(e.visible===!1)return;if(e.layers.test(t.layers)){if(e.isGroup)n=e.renderOrder;else if(e.isLOD)e.autoUpdate===!0&&e.update(t);else if(e.isLightProbeGrid)k.pushLightProbeGrid(e);else if(e.isLight)k.pushLight(e),e.castShadow&&k.pushShadow(e);else if(e.isSprite){if(!e.frustumCulled||ge.intersectsSprite(e)){r&&xe.setFromMatrixPosition(e.matrixWorld).applyMatrix4(ye);let t=Pe.update(e),i=e.material;i.visible&&O.push(e,t,i,n,xe.z,null)}}else if((e.isMesh||e.isLine||e.isPoints)&&(!e.frustumCulled||ge.intersectsObject(e))){let t=Pe.update(e),i=e.material;if(r&&(e.boundingSphere===void 0?(t.boundingSphere===null&&t.computeBoundingSphere(),xe.copy(t.boundingSphere.center)):(e.boundingSphere===null&&e.computeBoundingSphere(),xe.copy(e.boundingSphere.center)),xe.applyMatrix4(e.matrixWorld).applyMatrix4(ye)),Array.isArray(i)){let r=t.groups;for(let a=0,o=r.length;a<o;a++){let o=r[a],s=i[o.materialIndex];s&&s.visible&&O.push(e,t,s,n,xe.z,o)}}else i.visible&&O.push(e,t,i,n,xe.z,null)}}let i=e.children;for(let e=0,a=i.length;e<a;e++)mt(i[e],t,n,r)}function ht(e,t,n,r){let{opaque:i,transmissive:a,transparent:o}=e;k.setupLightsView(n),_e===!0&&Be.setGlobalState(I.clippingPlanes,n),r&&G.viewport(ie.copy(r)),i.length>0&&_t(i,t,n),a.length>0&&_t(a,t,n),o.length>0&&_t(o,t,n),G.buffers.depth.setTest(!0),G.buffers.depth.setMask(!0),G.buffers.color.setMask(!0),G.setPolygonOffset(!1)}function gt(e,t,n,r){if((n.isScene===!0?n.overrideMaterial:null)!==null)return;if(k.state.transmissionRenderTarget[r.id]===void 0){let e=Ee.has(`EXT_color_buffer_half_float`)||Ee.has(`EXT_color_buffer_float`);k.state.transmissionRenderTarget[r.id]=new qt(1,1,{generateMipmaps:!0,type:e?v:d,minFilter:u,samples:Math.max(4,De.samples),stencilBuffer:i,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:Pt.workingColorSpace})}let a=k.state.transmissionRenderTarget[r.id],o=r.viewport||ie;a.setSize(o.z*I.transmissionResolutionScale,o.w*I.transmissionResolutionScale);let s=I.getRenderTarget(),c=I.getActiveCubeFace(),l=I.getActiveMipmapLevel();I.setRenderTarget(a),I.getClearColor(se),ce=I.getClearAlpha(),ce<1&&I.setClearColor(16777215,.5),I.clear(),Ce&&Ue.render(n);let f=I.toneMapping;I.toneMapping=0;let p=r.viewport;if(r.viewport!==void 0&&(r.viewport=void 0),k.setupLightsView(r),_e===!0&&Be.setGlobalState(I.clippingPlanes,r),_t(e,n,r),ke.updateMultisampleRenderTarget(a),ke.updateRenderTargetMipmap(a),Ee.has(`WEBGL_multisampled_render_to_texture`)===!1){let e=!1;for(let i=0,a=t.length;i<a;i++){let{object:a,geometry:o,material:s,group:c}=t[i];if(s.side===2&&a.layers.test(r.layers)){let t=s.side;s.side=1,s.needsUpdate=!0,vt(a,n,r,o,s,c),s.side=t,s.needsUpdate=!0,e=!0}}e===!0&&(ke.updateMultisampleRenderTarget(a),ke.updateRenderTargetMipmap(a))}I.setRenderTarget(s,c,l),I.setClearColor(se,ce),p!==void 0&&(r.viewport=p),I.toneMapping=f}function _t(e,t,n){let r=t.isScene===!0?t.overrideMaterial:null;for(let i=0,a=e.length;i<a;i++){let a=e[i],{object:o,geometry:s,group:c}=a,l=a.material;l.allowOverride===!0&&r!==null&&(l=r),o.layers.test(n.layers)&&vt(o,t,n,s,l,c)}}function vt(e,t,n,r,i,a){e.onBeforeRender(I,t,n,r,i,a),e.modelViewMatrix.multiplyMatrices(n.matrixWorldInverse,e.matrixWorld),e.normalMatrix.getNormalMatrix(e.modelViewMatrix),i.onBeforeRender(I,t,n,r,e,a),i.transparent===!0&&i.side===2&&i.forceSinglePass===!1?(i.side=1,i.needsUpdate=!0,I.renderBufferDirect(n,t,r,i,e,a),i.side=0,i.needsUpdate=!0,I.renderBufferDirect(n,t,r,i,e,a),i.side=2):I.renderBufferDirect(n,t,r,i,e,a),e.onAfterRender(I,t,n,r,i,a)}function yt(e,t,n){t.isScene!==!0&&(t=Se);let r=K.get(e),i=k.state.lights,a=k.state.shadowsArray,o=i.state.version,s=Fe.getParameters(e,i.state,a,t,n,k.state.lightProbeGridArray),c=Fe.getProgramCacheKey(s),l=r.programs;r.environment=e.isMeshStandardMaterial||e.isMeshLambertMaterial||e.isMeshPhongMaterial?t.environment:null,r.fog=t.fog;let u=e.isMeshStandardMaterial||e.isMeshLambertMaterial&&!e.envMap||e.isMeshPhongMaterial&&!e.envMap;r.envMap=Ae.get(e.envMap||r.environment,u),r.envMapRotation=r.environment!==null&&e.envMap===null?t.environmentRotation:e.envMapRotation,l===void 0&&(e.addEventListener(`dispose`,at),l=new Map,r.programs=l);let d=l.get(c);if(d!==void 0){if(r.currentProgram===d&&r.lightsStateVersion===o)return xt(e,s),d}else s.uniforms=Fe.getUniforms(e),R!==null&&e.isNodeMaterial&&R.build(e,n,s),e.onBeforeCompile(s,I),d=Fe.acquireProgram(s,c),l.set(c,d),r.uniforms=s.uniforms;let f=r.uniforms;return(!e.isShaderMaterial&&!e.isRawShaderMaterial||e.clipping===!0)&&(f.clippingPlanes=Be.uniform),xt(e,s),r.needsLights=Tt(e),r.lightsStateVersion=o,r.needsLights&&(f.ambientLightColor.value=i.state.ambient,f.lightProbe.value=i.state.probe,f.directionalLights.value=i.state.directional,f.directionalLightShadows.value=i.state.directionalShadow,f.spotLights.value=i.state.spot,f.spotLightShadows.value=i.state.spotShadow,f.rectAreaLights.value=i.state.rectArea,f.ltc_1.value=i.state.rectAreaLTC1,f.ltc_2.value=i.state.rectAreaLTC2,f.pointLights.value=i.state.point,f.pointLightShadows.value=i.state.pointShadow,f.hemisphereLights.value=i.state.hemi,f.directionalShadowMatrix.value=i.state.directionalShadowMatrix,f.spotLightMatrix.value=i.state.spotLightMatrix,f.spotLightMap.value=i.state.spotLightMap,f.pointShadowMatrix.value=i.state.pointShadowMatrix),r.lightProbeGrid=k.state.lightProbeGridArray.length>0,r.currentProgram=d,r.uniformsList=null,d}function bt(e){if(e.uniformsList===null){let t=e.currentProgram.getUniforms();e.uniformsList=dc.seqWithValue(t.seq,e.uniforms)}return e.uniformsList}function xt(e,t){let n=K.get(e);n.outputColorSpace=t.outputColorSpace,n.batching=t.batching,n.batchingColor=t.batchingColor,n.instancing=t.instancing,n.instancingColor=t.instancingColor,n.instancingMorph=t.instancingMorph,n.skinning=t.skinning,n.morphTargets=t.morphTargets,n.morphNormals=t.morphNormals,n.morphColors=t.morphColors,n.morphTargetsCount=t.morphTargetsCount,n.numClippingPlanes=t.numClippingPlanes,n.numIntersection=t.numClipIntersection,n.vertexAlphas=t.vertexAlphas,n.vertexTangents=t.vertexTangents,n.toneMapping=t.toneMapping}function St(e,t){if(e.length===0)return null;if(e.length===1)return e[0].texture===null?null:e[0];D.setFromMatrixPosition(t.matrixWorld);for(let t=0,n=e.length;t<n;t++){let n=e[t];if(n.texture!==null&&n.boundingBox.containsPoint(D))return n}return null}function Ct(e,t,n,r,i){t.isScene!==!0&&(t=Se),ke.resetTextureUnits();let a=t.fog,o=r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial?t.environment:null,s=B===null?I.outputColorSpace:B.isXRRenderTarget===!0?B.texture.colorSpace:Pt.workingColorSpace,c=r.isMeshStandardMaterial||r.isMeshLambertMaterial&&!r.envMap||r.isMeshPhongMaterial&&!r.envMap,l=Ae.get(r.envMap||o,c),u=r.vertexColors===!0&&!!n.attributes.color&&n.attributes.color.itemSize===4,d=!!n.attributes.tangent&&(!!r.normalMap||r.anisotropy>0),f=!!n.morphAttributes.position,p=!!n.morphAttributes.normal,m=!!n.morphAttributes.color,h=0;r.toneMapped&&(B===null||B.isXRRenderTarget===!0)&&(h=I.toneMapping);let g=n.morphAttributes.position||n.morphAttributes.normal||n.morphAttributes.color,_=g===void 0?0:g.length,v=K.get(r),y=k.state.lights;if(_e===!0&&(ve===!0||e!==H)){let t=e===H&&r.id===V;Be.setState(r,e,t)}let b=!1;r.version===v.__version?v.needsLights&&v.lightsStateVersion!==y.state.version?b=!0:v.outputColorSpace===s?i.isBatchedMesh&&v.batching===!1||!i.isBatchedMesh&&v.batching===!0||i.isBatchedMesh&&v.batchingColor===!0&&i.colorTexture===null||i.isBatchedMesh&&v.batchingColor===!1&&i.colorTexture!==null||i.isInstancedMesh&&v.instancing===!1||!i.isInstancedMesh&&v.instancing===!0||i.isSkinnedMesh&&v.skinning===!1||!i.isSkinnedMesh&&v.skinning===!0||i.isInstancedMesh&&v.instancingColor===!0&&i.instanceColor===null||i.isInstancedMesh&&v.instancingColor===!1&&i.instanceColor!==null||i.isInstancedMesh&&v.instancingMorph===!0&&i.morphTexture===null||i.isInstancedMesh&&v.instancingMorph===!1&&i.morphTexture!==null?b=!0:v.envMap===l?r.fog===!0&&v.fog!==a||v.numClippingPlanes!==void 0&&(v.numClippingPlanes!==Be.numPlanes||v.numIntersection!==Be.numIntersection)?b=!0:v.vertexAlphas===u&&v.vertexTangents===d&&v.morphTargets===f&&v.morphNormals===p&&v.morphColors===m&&v.toneMapping===h&&v.morphTargetsCount===_?!!v.lightProbeGrid!=k.state.lightProbeGridArray.length>0&&(b=!0):b=!0:b=!0:b=!0:(b=!0,v.__version=r.version);let x=v.currentProgram;b===!0&&(x=yt(r,t,i),R&&r.isNodeMaterial&&R.onUpdateProgram(r,x,v));let S=!1,C=!1,w=!1,T=x.getUniforms(),E=v.uniforms;if(G.useProgram(x.program)&&(S=!0,C=!0,w=!0),r.id!==V&&(V=r.id,C=!0),v.needsLights){let e=St(k.state.lightProbeGridArray,i);v.lightProbeGrid!==e&&(v.lightProbeGrid=e,C=!0)}if(S||H!==e){G.buffers.depth.getReversed()&&e.reversedDepth!==!0&&(e._reversedDepth=!0,e.updateProjectionMatrix()),T.setValue(W,`projectionMatrix`,e.projectionMatrix),T.setValue(W,`viewMatrix`,e.matrixWorldInverse);let t=T.map.cameraPosition;t!==void 0&&t.setValue(W,be.setFromMatrixPosition(e.matrixWorld)),De.logarithmicDepthBuffer&&T.setValue(W,`logDepthBufFC`,2/(Math.log(e.far+1)/Math.LN2)),(r.isMeshPhongMaterial||r.isMeshToonMaterial||r.isMeshLambertMaterial||r.isMeshBasicMaterial||r.isMeshStandardMaterial||r.isShaderMaterial)&&T.setValue(W,`isOrthographic`,e.isOrthographicCamera===!0),H!==e&&(H=e,C=!0,w=!0)}if(v.needsLights&&(y.state.directionalShadowMap.length>0&&T.setValue(W,`directionalShadowMap`,y.state.directionalShadowMap,ke),y.state.spotShadowMap.length>0&&T.setValue(W,`spotShadowMap`,y.state.spotShadowMap,ke),y.state.pointShadowMap.length>0&&T.setValue(W,`pointShadowMap`,y.state.pointShadowMap,ke)),i.isSkinnedMesh){T.setOptional(W,i,`bindMatrix`),T.setOptional(W,i,`bindMatrixInverse`);let e=i.skeleton;e&&(e.boneTexture===null&&e.computeBoneTexture(),T.setValue(W,`boneTexture`,e.boneTexture,ke))}i.isBatchedMesh&&(T.setOptional(W,i,`batchingTexture`),T.setValue(W,`batchingTexture`,i._matricesTexture,ke),T.setOptional(W,i,`batchingIdTexture`),T.setValue(W,`batchingIdTexture`,i._indirectTexture,ke),T.setOptional(W,i,`batchingColorTexture`),i._colorsTexture!==null&&T.setValue(W,`batchingColorTexture`,i._colorsTexture,ke));let D=n.morphAttributes;if((D.position!==void 0||D.normal!==void 0||D.color!==void 0)&&Ge.update(i,n,x),(C||v.receiveShadow!==i.receiveShadow)&&(v.receiveShadow=i.receiveShadow,T.setValue(W,`receiveShadow`,i.receiveShadow)),(r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial)&&r.envMap===null&&t.environment!==null&&(E.envMapIntensity.value=t.environmentIntensity),E.dfgLUT!==void 0&&(E.dfgLUT.value=Ml()),C){if(T.setValue(W,`toneMappingExposure`,I.toneMappingExposure),v.needsLights&&wt(E,w),a&&r.fog===!0&&Ie.refreshFogUniforms(E,a),Ie.refreshMaterialUniforms(E,r,de,ue,k.state.transmissionRenderTarget[e.id]),v.needsLights&&v.lightProbeGrid){let e=v.lightProbeGrid;E.probesSH.value=e.texture,E.probesMin.value.copy(e.boundingBox.min),E.probesMax.value.copy(e.boundingBox.max),E.probesResolution.value.copy(e.resolution)}dc.upload(W,bt(v),E,ke)}if(r.isShaderMaterial&&r.uniformsNeedUpdate===!0&&(dc.upload(W,bt(v),E,ke),r.uniformsNeedUpdate=!1),r.isSpriteMaterial&&T.setValue(W,`center`,i.center),T.setValue(W,`modelViewMatrix`,i.modelViewMatrix),T.setValue(W,`normalMatrix`,i.normalMatrix),T.setValue(W,`modelMatrix`,i.matrixWorld),r.uniformsGroups!==void 0){let e=r.uniformsGroups;for(let t=0,n=e.length;t<n;t++){let n=e[t];$e.update(n,x),$e.bind(n,x)}}return x}function wt(e,t){e.ambientLightColor.needsUpdate=t,e.lightProbe.needsUpdate=t,e.directionalLights.needsUpdate=t,e.directionalLightShadows.needsUpdate=t,e.pointLights.needsUpdate=t,e.pointLightShadows.needsUpdate=t,e.spotLights.needsUpdate=t,e.spotLightShadows.needsUpdate=t,e.rectAreaLights.needsUpdate=t,e.hemisphereLights.needsUpdate=t}function Tt(e){return e.isMeshLambertMaterial||e.isMeshToonMaterial||e.isMeshPhongMaterial||e.isMeshStandardMaterial||e.isShadowMaterial||e.isShaderMaterial&&e.lights===!0}this.getActiveCubeFace=function(){return ne},this.getActiveMipmapLevel=function(){return re},this.getRenderTarget=function(){return B},this.setRenderTargetTextures=function(e,t,n){let r=K.get(e);r.__autoAllocateDepthBuffer=e.resolveDepthBuffer===!1,r.__autoAllocateDepthBuffer===!1&&(r.__useRenderToTexture=!1),K.get(e.texture).__webglTexture=t,K.get(e.depthTexture).__webglTexture=r.__autoAllocateDepthBuffer?void 0:n,r.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(e,t){let n=K.get(e);n.__webglFramebuffer=t,n.__useDefaultFramebuffer=t===void 0},this.setRenderTarget=function(e,t=0,n=0){B=e,ne=t,re=n;let r=null,i=!1,a=!1;if(e){let o=K.get(e);if(o.__useDefaultFramebuffer!==void 0){G.bindFramebuffer(W.FRAMEBUFFER,o.__webglFramebuffer),ie.copy(e.viewport),ae.copy(e.scissor),oe=e.scissorTest,G.viewport(ie),G.scissor(ae),G.setScissorTest(oe),V=-1;return}if(o.__webglFramebuffer===void 0)ke.setupRenderTarget(e);else if(o.__hasExternalTextures)ke.rebindTextures(e,K.get(e.texture).__webglTexture,K.get(e.depthTexture).__webglTexture);else if(e.depthBuffer){let t=e.depthTexture;if(o.__boundDepthTexture!==t){if(t!==null&&K.has(t)&&(e.width!==t.image.width||e.height!==t.image.height))throw Error(`THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.`);ke.setupDepthRenderbuffer(e)}}let s=e.texture;(s.isData3DTexture||s.isDataArrayTexture||s.isCompressedArrayTexture)&&(a=!0);let c=K.get(e).__webglFramebuffer;e.isWebGLCubeRenderTarget?(r=Array.isArray(c[t])?c[t][n]:c[t],i=!0):r=e.samples>0&&ke.useMultisampledRTT(e)===!1?K.get(e).__webglMultisampledFramebuffer:Array.isArray(c)?c[n]:c,ie.copy(e.viewport),ae.copy(e.scissor),oe=e.scissorTest}else ie.copy(pe).multiplyScalar(de).floor(),ae.copy(me).multiplyScalar(de).floor(),oe=he;if(n!==0&&(r=ee),G.bindFramebuffer(W.FRAMEBUFFER,r)&&G.drawBuffers(e,r),G.viewport(ie),G.scissor(ae),G.setScissorTest(oe),i){let r=K.get(e.texture);W.framebufferTexture2D(W.FRAMEBUFFER,W.COLOR_ATTACHMENT0,W.TEXTURE_CUBE_MAP_POSITIVE_X+t,r.__webglTexture,n)}else if(a){let r=t;for(let t=0;t<e.textures.length;t++){let i=K.get(e.textures[t]);W.framebufferTextureLayer(W.FRAMEBUFFER,W.COLOR_ATTACHMENT0+t,i.__webglTexture,n,r)}}else if(e!==null&&n!==0){let t=K.get(e.texture);W.framebufferTexture2D(W.FRAMEBUFFER,W.COLOR_ATTACHMENT0,W.TEXTURE_2D,t.__webglTexture,n)}V=-1},this.readRenderTargetPixels=function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget)){qe(`WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);return}let c=K.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){G.bindFramebuffer(W.FRAMEBUFFER,c);try{let o=e.textures[s],c=o.format,l=o.type;if(e.textures.length>1&&W.readBuffer(W.COLOR_ATTACHMENT0+s),!De.textureFormatReadable(c)){qe(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.`);return}if(!De.textureTypeReadable(l)){qe(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.`);return}t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i&&W.readPixels(t,n,r,i,Ze.convert(c),Ze.convert(l),a)}finally{let e=B===null?null:K.get(B).__webglFramebuffer;G.bindFramebuffer(W.FRAMEBUFFER,e)}}},this.readRenderTargetPixelsAsync=async function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget))throw Error(`THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);let c=K.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){if(t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i){G.bindFramebuffer(W.FRAMEBUFFER,c);let o=e.textures[s],l=o.format,u=o.type;if(e.textures.length>1&&W.readBuffer(W.COLOR_ATTACHMENT0+s),!De.textureFormatReadable(l))throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.`);if(!De.textureTypeReadable(u))throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.`);let d=W.createBuffer();W.bindBuffer(W.PIXEL_PACK_BUFFER,d),W.bufferData(W.PIXEL_PACK_BUFFER,a.byteLength,W.STREAM_READ),W.readPixels(t,n,r,i,Ze.convert(l),Ze.convert(u),0);let f=B===null?null:K.get(B).__webglFramebuffer;G.bindFramebuffer(W.FRAMEBUFFER,f);let p=W.fenceSync(W.SYNC_GPU_COMMANDS_COMPLETE,0);return W.flush(),await Ye(W,p,4),W.bindBuffer(W.PIXEL_PACK_BUFFER,d),W.getBufferSubData(W.PIXEL_PACK_BUFFER,0,a),W.deleteBuffer(d),W.deleteSync(p),a}throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.`)}},this.copyFramebufferToTexture=function(e,t=null,n=0){let r=2**-n,i=Math.floor(e.image.width*r),a=Math.floor(e.image.height*r),o=t===null?0:t.x,s=t===null?0:t.y;ke.setTexture2D(e,0),W.copyTexSubImage2D(W.TEXTURE_2D,n,0,0,o,s,i,a),G.unbindTexture()},this.copyTextureToTexture=function(e,t,n=null,r=null,i=0,a=0){let o,s,c,l,u,d,f,p,m,h=e.isCompressedTexture?e.mipmaps[a]:e.image;if(n!==null)o=n.max.x-n.min.x,s=n.max.y-n.min.y,c=n.isBox3?n.max.z-n.min.z:1,l=n.min.x,u=n.min.y,d=n.isBox3?n.min.z:0;else{let t=2**-i;o=Math.floor(h.width*t),s=Math.floor(h.height*t),c=e.isDataArrayTexture?h.depth:e.isData3DTexture?Math.floor(h.depth*t):1,l=0,u=0,d=0}r===null?(f=0,p=0,m=0):(f=r.x,p=r.y,m=r.z);let g=Ze.convert(t.format),_=Ze.convert(t.type),v;t.isData3DTexture?(ke.setTexture3D(t,0),v=W.TEXTURE_3D):t.isDataArrayTexture||t.isCompressedArrayTexture?(ke.setTexture2DArray(t,0),v=W.TEXTURE_2D_ARRAY):(ke.setTexture2D(t,0),v=W.TEXTURE_2D),G.activeTexture(W.TEXTURE0),G.pixelStorei(W.UNPACK_FLIP_Y_WEBGL,t.flipY),G.pixelStorei(W.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.premultiplyAlpha),G.pixelStorei(W.UNPACK_ALIGNMENT,t.unpackAlignment);let y=G.getParameter(W.UNPACK_ROW_LENGTH),b=G.getParameter(W.UNPACK_IMAGE_HEIGHT),x=G.getParameter(W.UNPACK_SKIP_PIXELS),S=G.getParameter(W.UNPACK_SKIP_ROWS),C=G.getParameter(W.UNPACK_SKIP_IMAGES);G.pixelStorei(W.UNPACK_ROW_LENGTH,h.width),G.pixelStorei(W.UNPACK_IMAGE_HEIGHT,h.height),G.pixelStorei(W.UNPACK_SKIP_PIXELS,l),G.pixelStorei(W.UNPACK_SKIP_ROWS,u),G.pixelStorei(W.UNPACK_SKIP_IMAGES,d);let w=e.isDataArrayTexture||e.isData3DTexture,T=t.isDataArrayTexture||t.isData3DTexture;if(e.isDepthTexture){let n=K.get(e),r=K.get(t),h=K.get(n.__renderTarget),g=K.get(r.__renderTarget);G.bindFramebuffer(W.READ_FRAMEBUFFER,h.__webglFramebuffer),G.bindFramebuffer(W.DRAW_FRAMEBUFFER,g.__webglFramebuffer);for(let n=0;n<c;n++)w&&(W.framebufferTextureLayer(W.READ_FRAMEBUFFER,W.COLOR_ATTACHMENT0,K.get(e).__webglTexture,i,d+n),W.framebufferTextureLayer(W.DRAW_FRAMEBUFFER,W.COLOR_ATTACHMENT0,K.get(t).__webglTexture,a,m+n)),W.blitFramebuffer(l,u,o,s,f,p,o,s,W.DEPTH_BUFFER_BIT,W.NEAREST);G.bindFramebuffer(W.READ_FRAMEBUFFER,null),G.bindFramebuffer(W.DRAW_FRAMEBUFFER,null)}else if(i!==0||e.isRenderTargetTexture||K.has(e)){let n=K.get(e),r=K.get(t);G.bindFramebuffer(W.READ_FRAMEBUFFER,te),G.bindFramebuffer(W.DRAW_FRAMEBUFFER,z);for(let e=0;e<c;e++)w?W.framebufferTextureLayer(W.READ_FRAMEBUFFER,W.COLOR_ATTACHMENT0,n.__webglTexture,i,d+e):W.framebufferTexture2D(W.READ_FRAMEBUFFER,W.COLOR_ATTACHMENT0,W.TEXTURE_2D,n.__webglTexture,i),T?W.framebufferTextureLayer(W.DRAW_FRAMEBUFFER,W.COLOR_ATTACHMENT0,r.__webglTexture,a,m+e):W.framebufferTexture2D(W.DRAW_FRAMEBUFFER,W.COLOR_ATTACHMENT0,W.TEXTURE_2D,r.__webglTexture,a),i===0?T?W.copyTexSubImage3D(v,a,f,p,m+e,l,u,o,s):W.copyTexSubImage2D(v,a,f,p,l,u,o,s):W.blitFramebuffer(l,u,o,s,f,p,o,s,W.COLOR_BUFFER_BIT,W.NEAREST);G.bindFramebuffer(W.READ_FRAMEBUFFER,null),G.bindFramebuffer(W.DRAW_FRAMEBUFFER,null)}else T?e.isDataTexture||e.isData3DTexture?W.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h.data):t.isCompressedArrayTexture?W.compressedTexSubImage3D(v,a,f,p,m,o,s,c,g,h.data):W.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h):e.isDataTexture?W.texSubImage2D(W.TEXTURE_2D,a,f,p,o,s,g,_,h.data):e.isCompressedTexture?W.compressedTexSubImage2D(W.TEXTURE_2D,a,f,p,h.width,h.height,g,h.data):W.texSubImage2D(W.TEXTURE_2D,a,f,p,o,s,g,_,h);G.pixelStorei(W.UNPACK_ROW_LENGTH,y),G.pixelStorei(W.UNPACK_IMAGE_HEIGHT,b),G.pixelStorei(W.UNPACK_SKIP_PIXELS,x),G.pixelStorei(W.UNPACK_SKIP_ROWS,S),G.pixelStorei(W.UNPACK_SKIP_IMAGES,C),a===0&&t.generateMipmaps&&W.generateMipmap(v),G.unbindTexture()},this.initRenderTarget=function(e){K.get(e).__webglFramebuffer===void 0&&ke.setupRenderTarget(e)},this.initTexture=function(e){e.isCubeTexture?ke.setTextureCube(e,0):e.isData3DTexture?ke.setTexture3D(e,0):e.isDataArrayTexture||e.isCompressedArrayTexture?ke.setTexture2DArray(e,0):ke.setTexture2D(e,0),G.unbindTexture()},this.resetState=function(){ne=0,re=0,B=null,G.reset(),Qe.reset()},typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}get coordinateSystem(){return Re}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=Pt._getDrawingBufferColorSpace(e),t.unpackColorSpace=Pt._getUnpackColorSpace()}},Y=(e,t,n,r,i={})=>({k:e,label:t,kind:`slider`,min:n,max:r,...i}),Pl=(e,t,n={})=>({k:e,label:t,kind:`switch`,...n}),Fl=(e,t,n={})=>({k:e,label:t,kind:`vec3`,...n}),Il=(e,t,n={})=>({k:e,label:t,kind:`color`,...n}),Ll=(e,t,n,r={})=>({k:e,label:t,kind:`select`,options:n,...r}),Rl=(e,t,n={})=>({k:e,label:t,kind:`readout`,...n}),zl=(e={})=>({title:`Transform`,props:[Fl(`pos`,`Position`,{def:[0,0,0],step:.05}),Fl(`rot`,`Rotation`,{def:[0,0,0],step:1,unit:`°`}),Fl(`scale`,`Scale`,{def:[1,1,1],step:.02,min:.01}),...e.extra||[]]}),Bl={title:`Surface`,props:[Il(`color`,`Albedo`,{def:`#c9ccd1`}),Y(`metalness`,`Metallic`,0,1,{def:.1,dec:2}),Y(`roughness`,`Roughness`,0,1,{def:.45,dec:2}),Il(`emissive`,`Emissive`,{def:`#000000`}),Y(`emissiveStrength`,`Emission`,0,12,{def:0,dec:2,unit:`×`}),Pl(`castShadow`,`Cast shadow`,{def:!0})]},Vl={folder:{label:`Folder`,icon:`folder`,color:`#c9a24b`,cat:`Scene`,noBillboard:!0,groups:[{title:`Group`,props:[Rl(`children`,`Contents`),Il(`tint`,`Row tint`,{def:`#c9a24b`,swatches:!0})]}]},sky:{label:`Sky`,icon:`sky`,color:`#8fd3ff`,cat:`Environment`,groups:[{title:`Atmosphere`,props:[Y(`rayleigh`,`Rayleigh`,0,4,{def:1.35,dec:2}),Y(`mie`,`Mie haze`,0,1,{def:.22,dec:3}),Y(`mieG`,`Mie forward`,0,.98,{def:.78,dec:2}),Y(`turbidity`,`Turbidity`,1,20,{def:3.4,dec:1}),Y(`ozone`,`Ozone`,0,3,{def:1,dec:2})]},{title:`Look`,props:[Il(`zenith`,`Zenith tint`,{def:`#2f6dd0`}),Il(`horizon`,`Horizon tint`,{def:`#9fc4e8`}),Il(`ground`,`Ground bounce`,{def:`#14181d`}),Y(`intensity`,`Sky light`,0,4,{def:1,dec:2,unit:`×`})]},{title:`Rendering`,props:[Pl(`aerial`,`Aerial perspective`,{def:!0}),Pl(`lightsScene`,`Sky lights scene`,{def:!0})]}]},sun:{label:`Sun`,icon:`sun`,color:`#ffb14b`,cat:`Environment`,groups:[{title:`Orbit`,props:[Y(`elevation`,`Elevation`,-20,90,{def:14,dec:1,unit:`°`}),Y(`azimuth`,`Azimuth`,0,360,{def:118,dec:0,unit:`°`}),Pl(`animate`,`Animate`,{def:!1}),Y(`rate`,`Rate`,1,600,{def:120,dec:0,unit:`×`})]},{title:`Disc & light`,props:[Y(`angular`,`Angular size`,.1,4,{def:.6,dec:2,unit:`°`}),Y(`intensity`,`Illuminance`,0,160,{def:88,dec:0,unit:`klx`}),Il(`tint`,`Tint`,{def:`#fff0d4`}),Y(`temperature`,`Temperature`,1600,12e3,{def:5400,dec:0,unit:`K`}),Pl(`shadows`,`Cast shadows`,{def:!0}),Y(`softness`,`Shadow softness`,0,10,{def:2.4,dec:1})]}]},moon:{label:`Moon`,icon:`moon`,color:`#b8c4d6`,cat:`Environment`,groups:[{title:`Orbit`,props:[Y(`elevation`,`Elevation`,-20,90,{def:46,dec:1,unit:`°`}),Y(`azimuth`,`Azimuth`,0,360,{def:292,dec:0,unit:`°`}),Y(`phase`,`Phase`,0,1,{def:.68,dec:2}),Y(`period`,`Period`,1,60,{def:27.3,dec:1,unit:`d`})]},{title:`Appearance`,props:[Y(`angular`,`Angular size`,.2,6,{def:1.6,dec:2,unit:`°`}),Y(`brightness`,`Brightness`,0,4,{def:1.1,dec:2,unit:`×`}),Y(`earthshine`,`Earthshine`,0,1,{def:.16,dec:2}),Il(`tint`,`Tint`,{def:`#d8e2f2`}),Y(`moonlight`,`Moonlight`,0,2,{def:.35,dec:2,unit:`lx`})]}]},stars:{label:`Stars`,icon:`stars`,color:`#cfd8ff`,cat:`Environment`,groups:[{title:`Field`,props:[Y(`density`,`Density`,0,1,{def:.55,dec:2}),Y(`brightness`,`Brightness`,0,3,{def:1.15,dec:2,unit:`×`}),Y(`size`,`Point size`,.4,4,{def:1.5,dec:2,unit:`px`}),Y(`twinkle`,`Twinkle`,0,1,{def:.45,dec:2})]},{title:`Sphere`,props:[Y(`rotation`,`Rotation`,0,360,{def:24,dec:0,unit:`°`}),Y(`drift`,`Sidereal drift`,0,4,{def:.6,dec:2,unit:`×`}),Il(`warm`,`Warm class`,{def:`#ffd7ae`}),Il(`cool`,`Cool class`,{def:`#bcd4ff`}),Pl(`milkyway`,`Galactic band`,{def:!0})]}]},clouds:{label:`Clouds`,icon:`cloud`,color:`#dfe6ee`,cat:`Environment`,groups:[{title:`Layer`,props:[Y(`coverage`,`Coverage`,0,1,{def:.46,dec:2}),Y(`density`,`Density`,0,1,{def:.62,dec:2}),Y(`altitude`,`Altitude`,20,400,{def:130,dec:0,unit:`m`}),Y(`scale`,`Feature size`,.2,4,{def:1,dec:2,unit:`×`}),Y(`detail`,`Detail`,0,1,{def:.55,dec:2})]},{title:`Motion & tint`,props:[Y(`speed`,`Drift speed`,0,6,{def:1,dec:2,unit:`×`}),Il(`tint`,`Base tint`,{def:`#eef3f8`}),Il(`shade`,`Shadowed`,{def:`#5c6a7c`}),Pl(`windLinked`,`Follow wind`,{def:!0})]}]},fog:{label:`Fog`,icon:`fog`,color:`#9fb0c0`,cat:`Environment`,groups:[{title:`Volumetrics`,props:[Pl(`enabled`,`Enabled`,{def:!0}),Y(`density`,`Density`,0,.06,{def:.011,dec:4}),Y(`height`,`Height falloff`,1,200,{def:42,dec:0,unit:`m`}),Il(`color`,`Colour`,{def:`#8fa4bb`}),Y(`sunScatter`,`Sun scatter`,0,2,{def:.7,dec:2})]}]},wind:{label:`Wind`,icon:`wind`,color:`#89e0c4`,cat:`Environment`,noBillboard:!0,groups:[{title:`Field`,props:[Y(`speed`,`Speed`,0,30,{def:4.2,dec:1,unit:`m/s`}),Y(`direction`,`Direction`,0,360,{def:214,dec:0,unit:`°`}),Y(`gust`,`Gustiness`,0,1,{def:.3,dec:2}),Y(`turbulence`,`Turbulence`,0,1,{def:.24,dec:2})]}]},water:{label:`Water`,icon:`water`,color:`#4fb6d8`,cat:`Water`,groups:[{title:`Body`,props:[Y(`level`,`Sea level`,-8,6,{def:-.6,dec:2,unit:`m`}),Y(`extent`,`Extent`,50,4e3,{def:1400,dec:0,unit:`m`}),Il(`deep`,`Deep colour`,{def:`#06222e`}),Il(`shallow`,`Shallow`,{def:`#1d7b8c`}),Y(`clarity`,`Clarity`,0,1,{def:.55,dec:2})]},{title:`Waves`,props:[Y(`amplitude`,`Amplitude`,0,1.4,{def:.19,dec:3,unit:`m`}),Y(`wavelength`,`Wavelength`,.5,30,{def:7.5,dec:1,unit:`m`}),Y(`choppiness`,`Choppiness`,0,2,{def:.85,dec:2}),Y(`speed`,`Speed`,0,4,{def:1,dec:2,unit:`×`}),Pl(`windLinked`,`Follow wind`,{def:!0})]},{title:`Surface`,props:[Y(`reflectivity`,`Reflectivity`,0,1,{def:.82,dec:2}),Y(`roughness`,`Roughness`,0,1,{def:.07,dec:3}),Y(`foam`,`Foam`,0,1,{def:.28,dec:2}),Y(`specular`,`Sun glint`,0,4,{def:1.6,dec:2,unit:`×`})]}]},cube:{label:`Cube`,icon:`cube`,color:`#9aa0a6`,cat:`Geometry`,mesh:`box`,groups:[zl(),Bl]},sphere:{label:`Sphere`,icon:`sphere`,color:`#9aa0a6`,cat:`Geometry`,mesh:`sphere`,groups:[zl(),Bl]},torus:{label:`Torus`,icon:`torus`,color:`#9aa0a6`,cat:`Geometry`,mesh:`torus`,groups:[zl(),Bl]},cylinder:{label:`Cylinder`,icon:`cylinder`,color:`#9aa0a6`,cat:`Geometry`,mesh:`cylinder`,groups:[zl(),Bl]},plane:{label:`Plane`,icon:`plane`,color:`#9aa0a6`,cat:`Geometry`,mesh:`plane`,groups:[zl(),Bl]},pointlight:{label:`Point Light`,icon:`light`,color:`#f5d34b`,cat:`Lighting`,groups:[{title:`Transform`,props:[Fl(`pos`,`Position`,{def:[0,2,0],step:.05})]},{title:`Emission`,props:[Il(`color`,`Colour`,{def:`#ffd9a0`}),Y(`intensity`,`Intensity`,0,60,{def:14,dec:1,unit:`cd`}),Y(`distance`,`Reach`,1,120,{def:26,dec:0,unit:`m`}),Y(`decay`,`Decay`,0,4,{def:2,dec:2}),Pl(`shadows`,`Cast shadows`,{def:!1}),Pl(`gizmoGlow`,`Show glow`,{def:!0})]}]},spotlight:{label:`Spot Light`,icon:`spot`,color:`#f5d34b`,cat:`Lighting`,groups:[{title:`Transform`,props:[Fl(`pos`,`Position`,{def:[0,6,0],step:.05}),Fl(`target`,`Aim at`,{def:[0,0,0],step:.05})]},{title:`Cone`,props:[Y(`angle`,`Cone angle`,2,80,{def:26,dec:1,unit:`°`}),Y(`penumbra`,`Softness`,0,1,{def:.42,dec:2}),Y(`intensity`,`Intensity`,0,200,{def:62,dec:0,unit:`cd`}),Il(`color`,`Colour`,{def:`#e8f0ff`}),Pl(`shadows`,`Cast shadows`,{def:!0}),Pl(`showCone`,`Draw cone`,{def:!0})]}]},ieslight:{label:`IES / Automotive`,icon:`spot`,color:`#f6dc72`,cat:`Lighting`,groups:[{title:`Transform`,props:[Fl(`pos`,`Position`,{def:[0,1,0],step:.05}),Fl(`target`,`Aim at`,{def:[0,.6,-12],step:.05})]},{title:`Photometry`,props:[Ll(`profile`,`Distribution`,[`ECE Low Beam`,`SAE Low Beam`,`High Beam`,`Fog Lamp`,`Parking Lamp`,`Custom .IES`],{def:`ECE Low Beam`}),Y(`lumens`,`Luminous flux`,0,8e3,{def:1650,dec:0,unit:`lm`}),Y(`multiplier`,`Profile multiplier`,0,4,{def:1,dec:2,unit:`×`}),Y(`range`,`Photometric range`,1,250,{def:120,dec:0,unit:`m`}),Y(`cone`,`Field angle`,5,100,{def:58,dec:1,unit:`°`}),Y(`cutoff`,`Cut-off pitch`,-5,5,{def:-1,dec:1,unit:`°`}),Il(`color`,`Colour`,{def:`#fff2cf`}),Y(`temperature`,`Temperature`,1800,12e3,{def:4300,dec:0,unit:`K`}),Pl(`shadows`,`Cast shadows`,{def:!0}),Pl(`showDistribution`,`Draw distribution`,{def:!0})]}]},arealight:{label:`Rect Area Light`,icon:`plane`,color:`#f5d34b`,cat:`Lighting`,groups:[{title:`Transform`,props:[Fl(`pos`,`Position`,{def:[0,3,0],step:.05}),Fl(`target`,`Aim at`,{def:[0,0,0],step:.05})]},{title:`Emitter`,props:[Y(`width`,`Width`,.1,20,{def:2,dec:2,unit:`m`}),Y(`height`,`Height`,.1,20,{def:1,dec:2,unit:`m`}),Y(`lumens`,`Luminous flux`,0,2e4,{def:2400,dec:0,unit:`lm`}),Y(`spread`,`Spread`,1,180,{def:120,dec:0,unit:`°`}),Il(`color`,`Colour`,{def:`#fff1d6`}),Pl(`twoSided`,`Two sided`,{def:!1}),Pl(`shadows`,`Cast shadows`,{def:!1}),Pl(`showShape`,`Draw emitter`,{def:!0})]}]},tubelight:{label:`Tube Light`,icon:`light`,color:`#f5d34b`,cat:`Lighting`,groups:[{title:`Transform`,props:[Fl(`pos`,`Position`,{def:[0,2,0],step:.05}),Fl(`rot`,`Rotation`,{def:[0,0,0],step:1,unit:`°`})]},{title:`Emitter`,props:[Y(`length`,`Length`,.1,20,{def:1.5,dec:2,unit:`m`}),Y(`radius`,`Radius`,.01,1,{def:.04,dec:2,unit:`m`}),Y(`lumens`,`Luminous flux`,0,12e3,{def:1800,dec:0,unit:`lm`}),Y(`distance`,`Reach`,1,120,{def:24,dec:0,unit:`m`}),Il(`color`,`Colour`,{def:`#e8f2ff`}),Y(`temperature`,`Temperature`,1800,12e3,{def:5600,dec:0,unit:`K`}),Pl(`shadows`,`Cast shadows`,{def:!1}),Pl(`showShape`,`Draw emitter`,{def:!0})]}]},camera:{label:`Camera`,icon:`camera`,color:`#69c3ff`,cat:`Cameras`,groups:[{title:`Transform`,props:[Fl(`pos`,`Position`,{def:[8,3,10],step:.05}),Fl(`lookAt`,`Look at`,{def:[0,1,0],step:.05})]},{title:`Lens`,props:[Y(`fov`,`Field of view`,12,120,{def:46,dec:0,unit:`°`}),Y(`focus`,`Focus distance`,.2,80,{def:12,dec:1,unit:`m`}),Y(`aperture`,`Aperture`,.7,22,{def:2.8,dec:1,unit:`f`}),Y(`shutter`,`Shutter`,1,500,{def:60,dec:0,unit:`1/s`})]},{title:`Framing`,props:[Ll(`gate`,`Aspect`,[`16:9`,`2.39:1`,`4:3`,`1:1`],{def:`16:9`}),Pl(`showFrustum`,`Draw frustum`,{def:!0})]}]},cinecamera:{label:`Cinematic Camera`,icon:`camera`,color:`#64d2ff`,cat:`Cameras`,groups:[{title:`Transform`,props:[Fl(`pos`,`Position`,{def:[10,3,12],step:.05}),Fl(`lookAt`,`Look at`,{def:[0,1,0],step:.05})]},{title:`Cinema Lens`,props:[Y(`focal`,`Focal length`,12,200,{def:50,dec:0,unit:`mm`}),Y(`sensorWidth`,`Sensor width`,12,70,{def:36,dec:1,unit:`mm`}),Y(`fov`,`Field of view`,6,140,{def:39.6,dec:1,unit:`°`}),Y(`focus`,`Focus distance`,.2,500,{def:8,dec:1,unit:`m`}),Y(`aperture`,`Aperture`,.7,22,{def:2.8,dec:1,unit:`f`}),Y(`shutterAngle`,`Shutter angle`,1,360,{def:180,dec:0,unit:`°`}),Y(`iso`,`ISO`,25,12800,{def:800,dec:0}),Y(`squeeze`,`Anamorphic squeeze`,1,2,{def:1,dec:2,unit:`×`}),Ll(`gate`,`Aspect`,[`16:9`,`2.39:1`,`4:3`,`1:1`],{def:`2.39:1`}),Pl(`showFrustum`,`Draw frustum`,{def:!0})]}]},playercamera:{label:`Player Camera`,icon:`camera`,color:`#69c3ff`,cat:`Cameras`,groups:[{title:`Transform`,props:[Fl(`pos`,`Position`,{def:[0,2.2,6],step:.05}),Fl(`lookAt`,`Look at`,{def:[0,1.4,0],step:.05})]},{title:`Player Rig`,props:[Y(`fov`,`Field of view`,35,120,{def:72,dec:0,unit:`°`}),Y(`boom`,`Boom length`,0,12,{def:4.2,dec:1,unit:`m`}),Y(`shoulder`,`Shoulder offset`,-2,2,{def:.45,dec:2,unit:`m`}),Y(`damping`,`Follow damping`,0,1,{def:.72,dec:2}),Y(`near`,`Near clip`,.01,2,{def:.1,dec:2,unit:`m`}),Y(`far`,`Far clip`,10,1e4,{def:2e3,dec:0,unit:`m`}),Pl(`collision`,`Camera collision`,{def:!0}),Pl(`input`,`Player input`,{def:!0}),Ll(`gate`,`Aspect`,[`16:9`,`2.39:1`,`4:3`,`1:1`],{def:`16:9`}),Y(`aperture`,`Preview aperture`,.7,22,{def:5.6,dec:1,unit:`f`}),Pl(`showFrustum`,`Draw frustum`,{def:!0})]}]},vehiclecamera:{label:`Vehicle Camera`,icon:`camera`,color:`#5eead4`,cat:`Cameras`,groups:[{title:`Transform`,props:[Fl(`pos`,`Position`,{def:[0,1.8,6.5],step:.05}),Fl(`lookAt`,`Look at`,{def:[0,1,0],step:.05})]},{title:`Vehicle Rig`,props:[Ll(`mode`,`Mount`,[`Chase`,`Bumper`,`Cockpit`,`Hood`,`Orbit Rig`],{def:`Chase`}),Y(`fov`,`Field of view`,35,130,{def:68,dec:0,unit:`°`}),Y(`distance`,`Follow distance`,0,20,{def:6.5,dec:1,unit:`m`}),Y(`height`,`Mount height`,.2,6,{def:1.8,dec:1,unit:`m`}),Y(`lag`,`Velocity lag`,0,1,{def:.35,dec:2}),Y(`lookAhead`,`Look ahead`,0,50,{def:12,dec:0,unit:`m`}),Y(`shake`,`Road vibration`,0,1,{def:.12,dec:2}),Pl(`horizonLock`,`Horizon lock`,{def:!0}),Pl(`collision`,`Collision sweep`,{def:!0}),Ll(`gate`,`Aspect`,[`16:9`,`2.39:1`,`4:3`,`1:1`],{def:`16:9`}),Y(`aperture`,`Preview aperture`,.7,22,{def:4,dec:1,unit:`f`}),Pl(`showFrustum`,`Draw frustum`,{def:!0})]}]},particles:{label:`Particles`,icon:`particles`,color:`#ffa8e0`,cat:`Effects`,groups:[{title:`Emitter`,props:[Fl(`pos`,`Position`,{def:[0,1.4,0],step:.05}),Y(`count`,`Count`,0,4e3,{def:420,dec:0}),Y(`radius`,`Spread`,.5,40,{def:7,dec:1,unit:`m`}),Y(`height`,`Column`,.2,30,{def:4.2,dec:1,unit:`m`})]},{title:`Look`,props:[Il(`color`,`Colour`,{def:`#ffd88a`}),Y(`size`,`Size`,.2,8,{def:1.5,dec:2,unit:`px`}),Y(`speed`,`Rise speed`,0,3,{def:.5,dec:2,unit:`×`}),Y(`flicker`,`Flicker`,0,1,{def:.7,dec:2})]}]},probe:{label:`Reflection Probe`,icon:`probe`,color:`#7de0ff`,cat:`Effects`,groups:[{title:`Capture`,props:[Fl(`pos`,`Position`,{def:[0,2,0],step:.05}),Y(`radius`,`Radius`,1,80,{def:14,dec:1,unit:`m`}),Y(`intensity`,`Intensity`,0,3,{def:1,dec:2,unit:`×`}),Ll(`resolution`,`Resolution`,[`128`,`256`,`512`,`1024`],{def:`256`}),Pl(`realtime`,`Realtime`,{def:!1}),Pl(`showBounds`,`Draw bounds`,{def:!0})]}]},audio:{label:`Audio Emitter`,icon:`audio`,color:`#b78dff`,cat:`Effects`,groups:[{title:`Source`,props:[Fl(`pos`,`Position`,{def:[0,1,0],step:.05}),Ll(`clip`,`Clip`,[`Shoreline`,`Wind in pines`,`Night insects`,`Distant thunder`],{def:`Shoreline`}),Y(`gain`,`Gain`,0,2,{def:.8,dec:2,unit:`×`}),Y(`radius`,`Falloff`,1,200,{def:32,dec:0,unit:`m`}),Pl(`loop`,`Loop`,{def:!0}),Pl(`spatial`,`3D spatialised`,{def:!0})]}]},post:{label:`Post Stack`,icon:`post`,color:`#ff9d6c`,cat:`Effects`,noBillboard:!0,groups:[{title:`Tone`,props:[Y(`exposure`,`Exposure`,.05,4,{def:1,dec:2,unit:`EV`}),Ll(`tonemap`,`Tonemap`,[`ACES`,`AgX`,`Filmic`,`Reinhard`,`Linear`],{def:`ACES`}),Y(`contrast`,`Contrast`,.5,2,{def:1.02,dec:2}),Y(`saturation`,`Saturation`,0,2,{def:1,dec:2})]},{title:`Image`,props:[Pl(`bloom`,`Bloom`,{def:!0}),Y(`bloomStrength`,`Bloom strength`,0,2,{def:.42,dec:2}),Y(`bloomThreshold`,`Threshold`,0,2,{def:.85,dec:2}),Y(`vignette`,`Vignette`,0,1,{def:.32,dec:2}),Y(`grain`,`Grain`,0,1,{def:.12,dec:2})]}]}},Hl=0,Ul=(e,t,n=[],r={})=>{let i=Vl[t],a={};(i?.groups||[]).forEach(e=>e.props.forEach(e=>{e.kind!==`readout`&&(a[e.k]=Array.isArray(e.def)?e.def.slice():e.def)}));let{props:o,...s}=r;return{id:++Hl,name:e,type:t,kids:n,open:!0,vis:!0,locked:!1,solo:!1,dynamic:!1,notes:``,props:{...a,...o||{}},...s}},Wl=Ul,Gl=[Wl(`Environment`,`folder`,[Wl(`Sky Atmosphere`,`sky`,[],{locked:!0}),Wl(`Sun`,`sun`,[],{dynamic:!0,props:{elevation:12,azimuth:108}}),Wl(`Moon`,`moon`,[],{dynamic:!0}),Wl(`Star Field`,`stars`,[]),Wl(`Cloud Layer`,`clouds`,[]),Wl(`Height Fog`,`fog`,[]),Wl(`Wind Field`,`wind`,[])],{props:{tint:`#8fd3ff`}}),Wl(`Water`,`folder`,[Wl(`Ocean`,`water`,[])],{props:{tint:`#4fb6d8`}}),Wl(`Objects`,`folder`,[Wl(`Platform`,`cylinder`,[],{locked:!0,props:{pos:[0,-.35,0],scale:[7.4,.35,7.4],color:`#20242a`,roughness:.85,metalness:.05}}),Wl(`Anchor Cube`,`cube`,[],{dynamic:!0,props:{pos:[-2.4,.9,.6],rot:[0,24,0],scale:[1.6,1.6,1.6],color:`#d64f45`,roughness:.35}}),Wl(`Chrome Sphere`,`sphere`,[],{props:{pos:[1.6,1,-1.4],scale:[1,1,1],color:`#f2f4f7`,metalness:1,roughness:.08}}),Wl(`Signal Torus`,`torus`,[],{dynamic:!0,props:{pos:[2.6,1.5,1.9],rot:[64,0,0],scale:[.85,.85,.85],color:`#2f3a44`,metalness:.7,roughness:.25,emissive:`#6c77ff`,emissiveStrength:2.4}}),Wl(`Marker Post`,`cylinder`,[],{props:{pos:[-4.4,1.2,-2.8],scale:[.16,2.4,.16],color:`#e8e2d6`,roughness:.6}}),Wl(`Glass Slab`,`cube`,[],{props:{pos:[4.6,.85,-2.2],rot:[0,-18,0],scale:[.25,1.7,2.6],color:`#8fd3ff`,metalness:.2,roughness:.05,emissive:`#123044`,emissiveStrength:.4}})],{props:{tint:`#9aa0a6`}}),Wl(`Lighting`,`folder`,[Wl(`Key Spot`,`spotlight`,[],{props:{pos:[-6,8.5,5],target:[-2.4,.9,.6],angle:22,intensity:90,color:`#fff2dd`}}),Wl(`Rim Point`,`pointlight`,[],{props:{pos:[5.2,2.4,-4.2],color:`#6c77ff`,intensity:22,distance:30}}),Wl(`Fill Point`,`pointlight`,[],{props:{pos:[-3.5,1.6,4.6],color:`#ffb47a`,intensity:10,distance:22}}),Wl(`ECE Low Beam`,`ieslight`,[],{props:{pos:[-1.1,.72,4.2],target:[-1.1,.45,-24],profile:`ECE Low Beam`}}),Wl(`Softbox`,`arealight`,[],{props:{pos:[3.5,4.5,2],target:[0,1,0]}}),Wl(`Studio Tube`,`tubelight`,[],{props:{pos:[-3,3.2,-2],rot:[0,0,20]}})],{props:{tint:`#f5d34b`}}),Wl(`Cameras`,`folder`,[Wl(`Hero Camera`,`camera`,[],{props:{pos:[9.5,3.4,9.5],lookAt:[0,1.1,0],fov:42}}),Wl(`Wide Camera`,`camera`,[],{props:{pos:[-11,6,-8],lookAt:[0,1,0],fov:74,gate:`2.39:1`}}),Wl(`Picture Car Cinema`,`cinecamera`,[],{props:{pos:[8,2.6,11],lookAt:[0,1,0],focal:65,fov:31,focus:9.5}}),Wl(`Player Follow`,`playercamera`,[],{dynamic:!0}),Wl(`Vehicle Chase`,`vehiclecamera`,[],{dynamic:!0})],{props:{tint:`#69c3ff`}}),Wl(`Effects`,`folder`,[Wl(`Fireflies`,`particles`,[]),Wl(`Shore Ambience`,`audio`,[],{props:{pos:[-7,1.2,6.5],clip:`Shoreline`}}),Wl(`Centre Probe`,`probe`,[],{props:{pos:[0,2.2,0],radius:12}}),Wl(`Post Stack`,`post`,[])],{props:{tint:`#ff9d6c`}})],Kl=[];function ql(){Kl.length=0;let e=(t,n,r)=>t.forEach(t=>{t.depth=n,t.parent=r,Kl.push(t),e(t.kids,n+1,t)});return e(Gl,0,null),Kl}var Jl=e=>Kl.find(t=>t.id===e)||null,Yl=e=>e.type===`folder`,Xl=e=>Vl[e.type]||Vl.cube,Zl=new Set,Ql=(e,t)=>{let n=t;for(;n;){if(n===e)return!0;n=n.parent}for(n=e;n;){if(n===t)return!0;n=n.parent}return!1},$l=e=>{Zl=new Set(e||[])},eu=()=>Zl,tu=()=>Zl.size>0,nu=e=>Zl.has(e.id),ru=e=>{if(!Zl.size)return!0;for(let t of Zl){let n=Kl.find(e=>e.id===t);if(n&&Ql(n,e))return!0}return!1},iu=e=>{let t=e;for(;t;){if(!t.vis)return!1;t=t.parent}return ru(e)},au=[`Environment`,`Water`,`Geometry`,`Lighting`,`Cameras`,`Effects`];ql();var ou={type:`change`},su={type:`start`},cu={type:`end`},lu=new zr,uu=new ai,du=Math.cos(70*wt.DEG2RAD),fu=new q,pu=2*Math.PI,mu={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},hu=1e-6,gu=class extends mo{constructor(n,r=null){super(n,r),this.state=mu.NONE,this.target=new q,this.cursor=new q,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:`ArrowLeft`,UP:`ArrowUp`,RIGHT:`ArrowRight`,BOTTOM:`ArrowDown`},this.mouseButtons={LEFT:e.ROTATE,MIDDLE:e.DOLLY,RIGHT:e.PAN},this.touches={ONE:t.ROTATE,TWO:t.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle=`auto`,this._domElementKeyEvents=null,this._lastPosition=new q,this._lastQuaternion=new Et,this._lastTargetPosition=new q,this._quat=new Et().setFromUnitVectors(n.up,new q(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new co,this._sphericalDelta=new co,this._scale=1,this._panOffset=new q,this._rotateStart=new Tt,this._rotateEnd=new Tt,this._rotateDelta=new Tt,this._panStart=new Tt,this._panEnd=new Tt,this._panDelta=new Tt,this._dollyStart=new Tt,this._dollyEnd=new Tt,this._dollyDelta=new Tt,this._dollyDirection=new q,this._mouse=new Tt,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=vu.bind(this),this._onPointerDown=_u.bind(this),this._onPointerUp=yu.bind(this),this._onContextMenu=Eu.bind(this),this._onMouseWheel=Su.bind(this),this._onKeyDown=Cu.bind(this),this._onTouchStart=wu.bind(this),this._onTouchMove=Tu.bind(this),this._onMouseDown=bu.bind(this),this._onMouseMove=xu.bind(this),this._interceptControlDown=Du.bind(this),this._interceptControlUp=Ou.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(e){this._cursorStyle=e,e===`grab`?this.domElement.style.cursor=`grab`:this.domElement.style.cursor=`auto`}get cursorStyle(){return this._cursorStyle}connect(e){super.connect(e),this.domElement.addEventListener(`pointerdown`,this._onPointerDown),this.domElement.addEventListener(`pointercancel`,this._onPointerUp),this.domElement.addEventListener(`contextmenu`,this._onContextMenu),this.domElement.addEventListener(`wheel`,this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener(`keydown`,this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction=`none`}disconnect(){this.domElement.removeEventListener(`pointerdown`,this._onPointerDown),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.domElement.removeEventListener(`pointercancel`,this._onPointerUp),this.domElement.removeEventListener(`wheel`,this._onMouseWheel),this.domElement.removeEventListener(`contextmenu`,this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.getRootNode().removeEventListener(`keydown`,this._interceptControlDown,{capture:!0}),this.domElement.style.touchAction=``}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(ou),this.update(),this.state=mu.NONE}pan(e,t){this._pan(e,t),this.update()}dollyIn(e){this._dollyIn(e),this.update()}dollyOut(e){this._dollyOut(e),this.update()}rotateLeft(e){this._rotateLeft(e),this.update()}rotateUp(e){this._rotateUp(e),this.update()}update(e=null){let t=this.object.position;fu.copy(t).sub(this.target),fu.applyQuaternion(this._quat),this._spherical.setFromVector3(fu),this.autoRotate&&this.state===mu.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,r=this.maxAzimuthAngle;isFinite(n)&&isFinite(r)&&(n<-Math.PI?n+=pu:n>Math.PI&&(n-=pu),r<-Math.PI?r+=pu:r>Math.PI&&(r-=pu),n<=r?this._spherical.theta=Math.max(n,Math.min(r,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+r)/2?Math.max(n,this._spherical.theta):Math.min(r,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let i=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let e=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),i=e!=this._spherical.radius}if(fu.setFromSpherical(this._spherical),fu.applyQuaternion(this._quatInverse),t.copy(this.target).add(fu),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let e=null;if(this.object.isPerspectiveCamera){let t=fu.length();e=this._clampDistance(t*this._scale);let n=t-e;this.object.position.addScaledVector(this._dollyDirection,n),this.object.updateMatrixWorld(),i=!!n}else if(this.object.isOrthographicCamera){let t=new q(this._mouse.x,this._mouse.y,0);t.unproject(this.object);let n=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),i=n!==this.object.zoom;let r=new q(this._mouse.x,this._mouse.y,0);r.unproject(this.object),this.object.position.sub(r).add(t),this.object.updateMatrixWorld(),e=fu.length()}else console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.`),this.zoomToCursor=!1;e!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(e).add(this.object.position):(lu.origin.copy(this.object.position),lu.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(lu.direction))<du?this.object.lookAt(this.target):(uu.setFromNormalAndCoplanarPoint(this.object.up,this.target),lu.intersectPlane(uu,this.target))))}else if(this.object.isOrthographicCamera){let e=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),e!==this.object.zoom&&(this.object.updateProjectionMatrix(),i=!0)}return this._scale=1,this._performCursorZoom=!1,i||this._lastPosition.distanceToSquared(this.object.position)>hu||8*(1-this._lastQuaternion.dot(this.object.quaternion))>hu||this._lastTargetPosition.distanceToSquared(this.target)>hu?(this.dispatchEvent(ou),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e===null?pu/60/60*this.autoRotateSpeed:pu/60*this.autoRotateSpeed*e}_getZoomScale(e){let t=Math.abs(e*.01);return .95**(this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){fu.setFromMatrixColumn(t,0),fu.multiplyScalar(-e),this._panOffset.add(fu)}_panUp(e,t){this.screenSpacePanning===!0?fu.setFromMatrixColumn(t,1):(fu.setFromMatrixColumn(t,0),fu.crossVectors(this.object.up,fu)),fu.multiplyScalar(e),this._panOffset.add(fu)}_pan(e,t){let n=this.domElement;if(this.object.isPerspectiveCamera){let r=this.object.position;fu.copy(r).sub(this.target);let i=fu.length();i*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*i/n.clientHeight,this.object.matrix),this._panUp(2*t*i/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.`),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let n=this.domElement.getBoundingClientRect(),r=e-n.left,i=t-n.top,a=n.width,o=n.height;this._mouse.x=r/a*2-1,this._mouse.y=-(i/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(pu*this._rotateDelta.x/t.clientHeight),this._rotateUp(pu*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(pu*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-pu*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(pu*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-pu*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateStart.set(n,r)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panStart.set(n,r)}}_handleTouchStartDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyStart.set(0,i)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateEnd.set(n,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(pu*this._rotateDelta.x/t.clientHeight),this._rotateUp(pu*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panEnd.set(n,r)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyEnd.set(0,i),this._dollyDelta.set(0,(this._dollyEnd.y/this._dollyStart.y)**+this.zoomSpeed),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let a=(e.pageX+t.x)*.5,o=(e.pageY+t.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new Tt,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){let t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){let t=e.deltaMode,n={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100}return e.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}};function _u(e){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(e.pointerId),this.domElement.ownerDocument.addEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.addEventListener(`pointerup`,this._onPointerUp)),!this._isTrackingPointer(e)&&(this._addPointer(e),e.pointerType===`touch`?this._onTouchStart(e):this._onMouseDown(e),this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grabbing`)))}function vu(e){this.enabled!==!1&&(e.pointerType===`touch`?this._onTouchMove(e):this._onMouseMove(e))}function yu(e){switch(this._removePointer(e),this._pointers.length){case 0:this.domElement.releasePointerCapture(e.pointerId),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.dispatchEvent(cu),this.state=mu.NONE,this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grab`);break;case 1:let t=this._pointers[0],n=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:n.x,pageY:n.y})}}function bu(t){let n;switch(t.button){case 0:n=this.mouseButtons.LEFT;break;case 1:n=this.mouseButtons.MIDDLE;break;case 2:n=this.mouseButtons.RIGHT;break;default:n=-1}switch(n){case e.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(t),this.state=mu.DOLLY;break;case e.ROTATE:if(t.ctrlKey||t.metaKey||t.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(t),this.state=mu.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(t),this.state=mu.ROTATE}break;case e.PAN:if(t.ctrlKey||t.metaKey||t.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(t),this.state=mu.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(t),this.state=mu.PAN}break;default:this.state=mu.NONE}this.state!==mu.NONE&&this.dispatchEvent(su)}function xu(e){switch(this.state){case mu.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(e);break;case mu.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(e);break;case mu.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(e)}}function Su(e){this.enabled!==!1&&this.enableZoom!==!1&&this.state===mu.NONE&&(e.preventDefault(),this.dispatchEvent(su),this._handleMouseWheel(this._customWheelEvent(e)),this.dispatchEvent(cu))}function Cu(e){this.enabled!==!1&&this._handleKeyDown(e)}function wu(e){switch(this._trackPointer(e),this._pointers.length){case 1:switch(this.touches.ONE){case t.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(e),this.state=mu.TOUCH_ROTATE;break;case t.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(e),this.state=mu.TOUCH_PAN;break;default:this.state=mu.NONE}break;case 2:switch(this.touches.TWO){case t.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(e),this.state=mu.TOUCH_DOLLY_PAN;break;case t.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(e),this.state=mu.TOUCH_DOLLY_ROTATE;break;default:this.state=mu.NONE}break;default:this.state=mu.NONE}this.state!==mu.NONE&&this.dispatchEvent(su)}function Tu(e){switch(this._trackPointer(e),this.state){case mu.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(e),this.update();break;case mu.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(e),this.update();break;case mu.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(e),this.update();break;case mu.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(e),this.update();break;default:this.state=mu.NONE}}function Eu(e){this.enabled!==!1&&e.preventDefault()}function Du(e){e.key===`Control`&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}function Ou(e){e.key===`Control`&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}var ku={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`},Au=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error(`THREE.Pass: .render() must be implemented in derived pass.`)}dispose(){}},ju=new Ia(-1,1,1,-1,0,1),Mu=new class extends kr{constructor(){super(),this.setAttribute(`position`,new _r([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new _r([0,2,0,0,2,0],2))}},Nu=class{constructor(e){this._mesh=new Qr(Mu,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,ju)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},Pu=class extends Au{constructor(e,t=`tDiffuse`){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof $i?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=Xi.clone(e.uniforms),this.material=new $i({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new Nu(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},Fu=class extends Au{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let r=e.getContext(),i=e.state;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(r.REPLACE,r.REPLACE,r.REPLACE),i.buffers.stencil.setFunc(r.ALWAYS,a,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(r.EQUAL,1,4294967295),i.buffers.stencil.setOp(r.KEEP,r.KEEP,r.KEEP),i.buffers.stencil.setLocked(!0)}},Iu=class extends Au{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}},Lu=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new Tt);this._width=n.width,this._height=n.height,t=new qt(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:v}),t.texture.name=`EffectComposer.rt1`}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name=`EffectComposer.rt2`,this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Pu(ku),this.copyPass.material.blending=0,this.timer=new Ua}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),r.needsSwap){if(n){let t=this.renderer.getContext(),n=this.renderer.state.buffers.stencil;n.setFunc(t.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),n.setFunc(t.EQUAL,1,4294967295)}this.swapBuffers()}Fu!==void 0&&(r instanceof Fu?n=!0:r instanceof Iu&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new Tt);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(n,r),this.renderTarget2.setSize(n,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(n,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}},Ru=class extends Au{constructor(e,t,n=null,r=null,i=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=r,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new Mn}render(e,t,n){let r=e.autoClear;e.autoClear=!1;let i,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(i=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(i),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=r}},zu={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new Mn(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`},Bu=class e extends Au{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new Tt(256,256):new Tt(e.x,e.y),this.clearColor=new Mn(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new qt(i,a,{type:v}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new qt(i,a,{type:v});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new qt(i,a,{type:v});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),i=Math.round(i/2),a=Math.round(a/2)}let o=zu;this.highPassUniforms=Xi.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new $i({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let s=[6,10,14,18,22];i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(s[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new Tt(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new q(1,1,1),new q(1,1,1),new q(1,1,1),new q(1,1,1),new q(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=Xi.clone(ku.uniforms),this.blendMaterial=new $i({uniforms:this.copyUniforms,vertexShader:ku.vertexShader,fragmentShader:ku.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new Mn,this._oldClearAlpha=1,this._basic=new Br,this._fsQuad=new Nu(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new Tt(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);return new $i({defines:{KERNEL_RADIUS:e},uniforms:{colorTexture:{value:null},invSize:{value:new Tt(.5,.5)},direction:{value:new Tt(.5,.5)},gaussianCoefficients:{value:t}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {

					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;

					for ( int i = 1; i < KERNEL_RADIUS; i ++ ) {

						float x = float( i );
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * w;

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(e){return new $i({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}};Bu.BlurDirectionX=new Tt(1,0),Bu.BlurDirectionY=new Tt(0,1);var Vu=class e extends Au{constructor(e,t,n,r){super(),this.renderScene=t,this.renderCamera=n,this.selectedObjects=r===void 0?[]:r,this.visibleEdgeColor=new Mn(1,1,1),this.hiddenEdgeColor=new Mn(.1,.04,.02),this.edgeGlow=0,this.usePatternTexture=!1,this.patternTexture=null,this.edgeThickness=1,this.edgeStrength=3,this.downSampleRatio=2,this.pulsePeriod=0,this._visibilityCache=new Map,this._selectionCache=new Set,this.resolution=e===void 0?new Tt(256,256):new Tt(e.x,e.y);let i=Math.round(this.resolution.x/this.downSampleRatio),a=Math.round(this.resolution.y/this.downSampleRatio);this.renderTargetMaskBuffer=new qt(this.resolution.x,this.resolution.y),this.renderTargetMaskBuffer.texture.name=`OutlinePass.mask`,this.renderTargetMaskBuffer.texture.generateMipmaps=!1,this.depthMaterial=new na,this.depthMaterial.side=2,this.depthMaterial.depthPacking=je,this.depthMaterial.blending=0,this.prepareMaskMaterial=this._getPrepareMaskMaterial(),this.prepareMaskMaterial.side=2,this.prepareMaskMaterial.fragmentShader=s(this.prepareMaskMaterial.fragmentShader,this.renderCamera),this.renderTargetDepthBuffer=new qt(this.resolution.x,this.resolution.y,{type:v}),this.renderTargetDepthBuffer.texture.name=`OutlinePass.depth`,this.renderTargetDepthBuffer.texture.generateMipmaps=!1,this.renderTargetMaskDownSampleBuffer=new qt(i,a,{type:v}),this.renderTargetMaskDownSampleBuffer.texture.name=`OutlinePass.depthDownSample`,this.renderTargetMaskDownSampleBuffer.texture.generateMipmaps=!1,this.renderTargetBlurBuffer1=new qt(i,a,{type:v}),this.renderTargetBlurBuffer1.texture.name=`OutlinePass.blur1`,this.renderTargetBlurBuffer1.texture.generateMipmaps=!1,this.renderTargetBlurBuffer2=new qt(Math.round(i/2),Math.round(a/2),{type:v}),this.renderTargetBlurBuffer2.texture.name=`OutlinePass.blur2`,this.renderTargetBlurBuffer2.texture.generateMipmaps=!1,this.edgeDetectionMaterial=this._getEdgeDetectionMaterial(),this.renderTargetEdgeBuffer1=new qt(i,a,{type:v}),this.renderTargetEdgeBuffer1.texture.name=`OutlinePass.edge1`,this.renderTargetEdgeBuffer1.texture.generateMipmaps=!1,this.renderTargetEdgeBuffer2=new qt(Math.round(i/2),Math.round(a/2),{type:v}),this.renderTargetEdgeBuffer2.texture.name=`OutlinePass.edge2`,this.renderTargetEdgeBuffer2.texture.generateMipmaps=!1,this.separableBlurMaterial1=this._getSeparableBlurMaterial(4),this.separableBlurMaterial1.uniforms.texSize.value.set(i,a),this.separableBlurMaterial1.uniforms.kernelRadius.value=1,this.separableBlurMaterial2=this._getSeparableBlurMaterial(4),this.separableBlurMaterial2.uniforms.texSize.value.set(Math.round(i/2),Math.round(a/2)),this.separableBlurMaterial2.uniforms.kernelRadius.value=4,this.overlayMaterial=this._getOverlayMaterial();let o=ku;this.copyUniforms=Xi.clone(o.uniforms),this.materialCopy=new $i({uniforms:this.copyUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader,blending:0,depthTest:!1,depthWrite:!1}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new Mn,this.oldClearAlpha=1,this._fsQuad=new Nu(null),this.tempPulseColor1=new Mn,this.tempPulseColor2=new Mn,this.textureMatrix=new Xt;function s(e,t){let n=t.isPerspectiveCamera?`perspective`:`orthographic`;return e.replace(/DEPTH_TO_VIEW_Z/g,n+`DepthToViewZ`)}}dispose(){this.renderTargetMaskBuffer.dispose(),this.renderTargetDepthBuffer.dispose(),this.renderTargetMaskDownSampleBuffer.dispose(),this.renderTargetBlurBuffer1.dispose(),this.renderTargetBlurBuffer2.dispose(),this.renderTargetEdgeBuffer1.dispose(),this.renderTargetEdgeBuffer2.dispose(),this.depthMaterial.dispose(),this.prepareMaskMaterial.dispose(),this.edgeDetectionMaterial.dispose(),this.separableBlurMaterial1.dispose(),this.separableBlurMaterial2.dispose(),this.overlayMaterial.dispose(),this.materialCopy.dispose(),this._fsQuad.dispose()}setSize(e,t){this.renderTargetMaskBuffer.setSize(e,t),this.renderTargetDepthBuffer.setSize(e,t);let n=Math.round(e/this.downSampleRatio),r=Math.round(t/this.downSampleRatio);this.renderTargetMaskDownSampleBuffer.setSize(n,r),this.renderTargetBlurBuffer1.setSize(n,r),this.renderTargetEdgeBuffer1.setSize(n,r),this.separableBlurMaterial1.uniforms.texSize.value.set(n,r),n=Math.round(n/2),r=Math.round(r/2),this.renderTargetBlurBuffer2.setSize(n,r),this.renderTargetEdgeBuffer2.setSize(n,r),this.separableBlurMaterial2.uniforms.texSize.value.set(n,r)}render(t,n,r,i,a){if(this.selectedObjects.length>0){t.getClearColor(this._oldClearColor),this.oldClearAlpha=t.getClearAlpha();let n=t.autoClear;t.autoClear=!1,a&&t.state.buffers.stencil.setTest(!1),t.setClearColor(16777215,1),this._updateSelectionCache(),this._changeVisibilityOfSelectedObjects(!1);let i=this.renderScene.background,o=this.renderScene.overrideMaterial;if(this.renderScene.background=null,this.renderScene.overrideMaterial=this.depthMaterial,t.setRenderTarget(this.renderTargetDepthBuffer),t.clear(),t.render(this.renderScene,this.renderCamera),this._changeVisibilityOfSelectedObjects(!0),this._visibilityCache.clear(),this._updateTextureMatrix(),this._changeVisibilityOfNonSelectedObjects(!1),this.renderScene.overrideMaterial=this.prepareMaskMaterial,this.prepareMaskMaterial.uniforms.cameraNearFar.value.set(this.renderCamera.near,this.renderCamera.far),this.prepareMaskMaterial.uniforms.depthTexture.value=this.renderTargetDepthBuffer.texture,this.prepareMaskMaterial.uniforms.textureMatrix.value=this.textureMatrix,t.setRenderTarget(this.renderTargetMaskBuffer),t.clear(),t.render(this.renderScene,this.renderCamera),this._changeVisibilityOfNonSelectedObjects(!0),this._visibilityCache.clear(),this._selectionCache.clear(),this.renderScene.background=i,this.renderScene.overrideMaterial=o,this._fsQuad.material=this.materialCopy,this.copyUniforms.tDiffuse.value=this.renderTargetMaskBuffer.texture,t.setRenderTarget(this.renderTargetMaskDownSampleBuffer),t.clear(),this._fsQuad.render(t),this.tempPulseColor1.copy(this.visibleEdgeColor),this.tempPulseColor2.copy(this.hiddenEdgeColor),this.pulsePeriod>0){let e=1.25/2+Math.cos(performance.now()*.01/this.pulsePeriod)*.75/2;this.tempPulseColor1.multiplyScalar(e),this.tempPulseColor2.multiplyScalar(e)}this._fsQuad.material=this.edgeDetectionMaterial,this.edgeDetectionMaterial.uniforms.maskTexture.value=this.renderTargetMaskDownSampleBuffer.texture,this.edgeDetectionMaterial.uniforms.texSize.value.set(this.renderTargetMaskDownSampleBuffer.width,this.renderTargetMaskDownSampleBuffer.height),this.edgeDetectionMaterial.uniforms.visibleEdgeColor.value=this.tempPulseColor1,this.edgeDetectionMaterial.uniforms.hiddenEdgeColor.value=this.tempPulseColor2,t.setRenderTarget(this.renderTargetEdgeBuffer1),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.separableBlurMaterial1,this.separableBlurMaterial1.uniforms.colorTexture.value=this.renderTargetEdgeBuffer1.texture,this.separableBlurMaterial1.uniforms.direction.value=e.BlurDirectionX,this.separableBlurMaterial1.uniforms.kernelRadius.value=this.edgeThickness,t.setRenderTarget(this.renderTargetBlurBuffer1),t.clear(),this._fsQuad.render(t),this.separableBlurMaterial1.uniforms.colorTexture.value=this.renderTargetBlurBuffer1.texture,this.separableBlurMaterial1.uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetEdgeBuffer1),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.separableBlurMaterial2,this.separableBlurMaterial2.uniforms.colorTexture.value=this.renderTargetEdgeBuffer1.texture,this.separableBlurMaterial2.uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetBlurBuffer2),t.clear(),this._fsQuad.render(t),this.separableBlurMaterial2.uniforms.colorTexture.value=this.renderTargetBlurBuffer2.texture,this.separableBlurMaterial2.uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetEdgeBuffer2),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.overlayMaterial,this.overlayMaterial.uniforms.maskTexture.value=this.renderTargetMaskBuffer.texture,this.overlayMaterial.uniforms.edgeTexture1.value=this.renderTargetEdgeBuffer1.texture,this.overlayMaterial.uniforms.edgeTexture2.value=this.renderTargetEdgeBuffer2.texture,this.overlayMaterial.uniforms.patternTexture.value=this.patternTexture,this.overlayMaterial.uniforms.edgeStrength.value=this.edgeStrength,this.overlayMaterial.uniforms.edgeGlow.value=this.edgeGlow,this.overlayMaterial.uniforms.usePatternTexture.value=this.usePatternTexture,a&&t.state.buffers.stencil.setTest(!0),t.setRenderTarget(r),this._fsQuad.render(t),t.setClearColor(this._oldClearColor,this.oldClearAlpha),t.autoClear=n}this.renderToScreen&&(this._fsQuad.material=this.materialCopy,this.copyUniforms.tDiffuse.value=r.texture,t.setRenderTarget(null),this._fsQuad.render(t))}_updateSelectionCache(){let e=this._selectionCache;function t(t){t.isMesh&&e.add(t)}e.clear();for(let e=0;e<this.selectedObjects.length;e++)this.selectedObjects[e].traverse(t)}_changeVisibilityOfSelectedObjects(e){let t=this._visibilityCache;for(let n of this._selectionCache)e===!0?n.visible=t.get(n):(t.set(n,n.visible),n.visible=e)}_changeVisibilityOfNonSelectedObjects(e){let t=this._visibilityCache,n=this._selectionCache;function r(r){if(r.isPoints||r.isLine||r.isLine2)e===!0?r.visible=t.get(r):(t.set(r,r.visible),r.visible=e);else if((r.isMesh||r.isSprite)&&!n.has(r)){let n=r.visible;(e===!1||t.get(r)===!0)&&(r.visible=e),t.set(r,n)}}this.renderScene.traverse(r)}_updateTextureMatrix(){this.textureMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),this.textureMatrix.multiply(this.renderCamera.projectionMatrix),this.textureMatrix.multiply(this.renderCamera.matrixWorldInverse)}_getPrepareMaskMaterial(){return new $i({uniforms:{depthTexture:{value:null},cameraNearFar:{value:new Tt(.5,.5)},textureMatrix:{value:null}},vertexShader:`#include <batching_pars_vertex>
				#include <morphtarget_pars_vertex>
				#include <skinning_pars_vertex>

				varying vec4 projTexCoord;
				varying vec4 vPosition;
				uniform mat4 textureMatrix;

				void main() {

					#include <batching_vertex>
					#include <skinbase_vertex>
					#include <begin_vertex>
					#include <morphtarget_vertex>
					#include <skinning_vertex>
					#include <project_vertex>

					vPosition = mvPosition;

					vec4 worldPosition = vec4( transformed, 1.0 );

					#ifdef USE_INSTANCING

						worldPosition = instanceMatrix * worldPosition;

					#endif

					worldPosition = modelMatrix * worldPosition;

					projTexCoord = textureMatrix * worldPosition;

				}`,fragmentShader:`#include <packing>
				varying vec4 vPosition;
				varying vec4 projTexCoord;
				uniform sampler2D depthTexture;
				uniform vec2 cameraNearFar;

				void main() {

					float depth = unpackRGBAToDepth(texture2DProj( depthTexture, projTexCoord ));
					float viewZ = - DEPTH_TO_VIEW_Z( depth, cameraNearFar.x, cameraNearFar.y );
					float depthTest = (-vPosition.z > viewZ) ? 1.0 : 0.0;
					gl_FragColor = vec4(0.0, depthTest, 1.0, 1.0);

				}`})}_getEdgeDetectionMaterial(){return new $i({uniforms:{maskTexture:{value:null},texSize:{value:new Tt(.5,.5)},visibleEdgeColor:{value:new q(1,1,1)},hiddenEdgeColor:{value:new q(1,1,1)}},vertexShader:`varying vec2 vUv;

				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;

				uniform sampler2D maskTexture;
				uniform vec2 texSize;
				uniform vec3 visibleEdgeColor;
				uniform vec3 hiddenEdgeColor;

				void main() {
					vec2 invSize = 1.0 / texSize;
					vec4 uvOffset = vec4(1.0, 0.0, 0.0, 1.0) * vec4(invSize, invSize);
					vec4 c1 = texture2D( maskTexture, vUv + uvOffset.xy);
					vec4 c2 = texture2D( maskTexture, vUv - uvOffset.xy);
					vec4 c3 = texture2D( maskTexture, vUv + uvOffset.yw);
					vec4 c4 = texture2D( maskTexture, vUv - uvOffset.yw);
					float diff1 = (c1.r - c2.r)*0.5;
					float diff2 = (c3.r - c4.r)*0.5;
					float d = length( vec2(diff1, diff2) );
					float a1 = min(c1.g, c2.g);
					float a2 = min(c3.g, c4.g);
					float visibilityFactor = min(a1, a2);
					vec3 edgeColor = 1.0 - visibilityFactor > 0.001 ? visibleEdgeColor : hiddenEdgeColor;
					gl_FragColor = vec4(edgeColor, 1.0) * vec4(d);
				}`})}_getSeparableBlurMaterial(e){return new $i({defines:{MAX_RADIUS:e},uniforms:{colorTexture:{value:null},texSize:{value:new Tt(.5,.5)},direction:{value:new Tt(.5,.5)},kernelRadius:{value:1}},vertexShader:`varying vec2 vUv;

				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 texSize;
				uniform vec2 direction;
				uniform float kernelRadius;

				float gaussianPdf(in float x, in float sigma) {
					return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
				}

				void main() {
					vec2 invSize = 1.0 / texSize;
					float sigma = kernelRadius/2.0;
					float weightSum = gaussianPdf(0.0, sigma);
					vec4 diffuseSum = texture2D( colorTexture, vUv) * weightSum;
					vec2 delta = direction * invSize * kernelRadius/float(MAX_RADIUS);
					vec2 uvOffset = delta;
					for( int i = 1; i <= MAX_RADIUS; i ++ ) {
						float x = kernelRadius * float(i) / float(MAX_RADIUS);
						float w = gaussianPdf(x, sigma);
						vec4 sample1 = texture2D( colorTexture, vUv + uvOffset);
						vec4 sample2 = texture2D( colorTexture, vUv - uvOffset);
						diffuseSum += ((sample1 + sample2) * w);
						weightSum += (2.0 * w);
						uvOffset += delta;
					}
					gl_FragColor = diffuseSum/weightSum;
				}`})}_getOverlayMaterial(){return new $i({uniforms:{maskTexture:{value:null},edgeTexture1:{value:null},edgeTexture2:{value:null},patternTexture:{value:null},edgeStrength:{value:1},edgeGlow:{value:1},usePatternTexture:{value:0}},vertexShader:`varying vec2 vUv;

				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;

				uniform sampler2D maskTexture;
				uniform sampler2D edgeTexture1;
				uniform sampler2D edgeTexture2;
				uniform sampler2D patternTexture;
				uniform float edgeStrength;
				uniform float edgeGlow;
				uniform bool usePatternTexture;

				void main() {
					vec4 edgeValue1 = texture2D(edgeTexture1, vUv);
					vec4 edgeValue2 = texture2D(edgeTexture2, vUv);
					vec4 maskColor = texture2D(maskTexture, vUv);
					vec4 patternColor = texture2D(patternTexture, 6.0 * vUv);
					float visibilityFactor = 1.0 - maskColor.g > 0.0 ? 1.0 : 0.5;
					vec4 edgeValue = edgeValue1 + edgeValue2 * edgeGlow;
					vec4 finalColor = edgeStrength * maskColor.r * edgeValue;
					if(usePatternTexture)
						finalColor += + visibilityFactor * (1.0 - maskColor.r) * (1.0 - patternColor.r);
					gl_FragColor = finalColor;
				}`,blending:2,depthTest:!1,depthWrite:!1,transparent:!0})}};Vu.BlurDirectionX=new Tt(1,0),Vu.BlurDirectionY=new Tt(0,1);var Hu={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`},Uu=class extends Au{constructor(){super(),this.isOutputPass=!0,this.uniforms=Xi.clone(Hu.uniforms),this.material=new ea({name:Hu.name,uniforms:this.uniforms,vertexShader:Hu.vertexShader,fragmentShader:Hu.fragmentShader}),this._fsQuad=new Nu(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},Pt.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},Wu=Math.PI/180,Gu=e=>new Mn(e),Ku=(e,t)=>{let n=e*Wu,r=t*Wu;return new q(Math.cos(n)*Math.sin(r),Math.sin(n),Math.cos(n)*Math.cos(r)).normalize()},qu=`
  varying vec3 vWorld;
  void main(){
    vec4 wp = modelMatrix * vec4(position,1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`,Ju=`
  precision highp float;
  varying vec3 vWorld;
  uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uGround, uSunTint, uMoonTint;
  uniform float uRayleigh, uMie, uMieG, uTurbidity, uOzone, uIntensity;
  uniform float uSunAngular, uSunIntensity, uMoonAngular, uMoonPhase, uMoonBright, uEarthshine;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
  }

  void main(){
    vec3 dir = normalize(vWorld - cameraPosition);
    float y = dir.y;
    float day = smoothstep(-0.10, 0.24, uSunDir.y);

    float h = pow(clamp(1.0 - max(y,0.0), 0.0, 1.0), 2.4 / max(uRayleigh, 0.25));
    vec3 dayCol   = mix(uZenith, uHorizon, h);
    vec3 nightCol = mix(vec3(0.010,0.014,0.030), vec3(0.030,0.042,0.075), h);
    vec3 c = mix(nightCol, dayCol, day);

    float sunDot = clamp(dot(dir, uSunDir), 0.0, 1.0);
    float twilight = exp(-pow(abs(uSunDir.y) * 5.5, 2.0));
    c += vec3(1.0,0.45,0.18) * pow(sunDot, 6.0) * twilight * (0.35 + uTurbidity * 0.06);
    c += vec3(1.0,0.30,0.12) * pow(clamp(1.0-abs(y)*3.2,0.0,1.0), 3.0) * twilight * 0.22;

    float g = clamp(uMieG, 0.0, 0.95);
    float hg = (1.0-g*g) / pow(max(1.0 + g*g - 2.0*g*sunDot, 1e-3), 1.5);
    c += uSunTint * uMie * hg * 0.05 * max(day, 0.04);

    c *= mix(vec3(1.0), vec3(0.85,0.93,1.08), uOzone * 0.45 * day);
    c = mix(c, uGround * (0.25 + 0.75*day), smoothstep(0.0, -0.05, y));

    // sun disc + bloom-feeding glow
    float sunAng = acos(clamp(dot(dir, uSunDir), -1.0, 1.0));
    float sr = max(radians(uSunAngular) * 0.5, 0.0015);
    float disc = 1.0 - smoothstep(sr*0.88, sr*1.18, sunAng);
    c += uSunTint * disc * (1.6 + uSunIntensity * 0.045);
    c += uSunTint * exp(-sunAng * 26.0) * 0.30 * max(day, 0.08);

    // moon: analytic phase, soft terminator, a little surface mottling
    float mr = max(radians(uMoonAngular) * 0.5, 0.0015);
    float moonAng = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
    if(moonAng < mr * 2.6 && uMoonBright > 0.001){
      vec3 mx = normalize(cross(vec3(0.0,1.0,0.0), uMoonDir) + vec3(1e-5));
      vec3 my = normalize(cross(uMoonDir, mx));
      vec2 p = vec2(dot(dir, mx), dot(dir, my)) / mr;
      float r2 = dot(p,p);
      if(r2 <= 1.0){
        float z = sqrt(max(0.0, 1.0 - r2));
        float th = (1.0 - clamp(uMoonPhase,0.0,1.0)) * 3.14159265;
        vec3 n = vec3(p.x, p.y, z);
        vec3 L = vec3(sin(th), 0.0, cos(th));
        float lit = smoothstep(-0.06, 0.12, dot(n, L));
        float mott = 0.80 + 0.20 * noise(p * 6.0 + 3.0);
        float limb = 0.55 + 0.45 * z;
        c = mix(c, uMoonTint * (lit * mott * limb + uEarthshine) * uMoonBright,
                clamp((1.0 - smoothstep(0.92, 1.0, sqrt(r2))), 0.0, 1.0));
      }
      c += uMoonTint * exp(-moonAng / max(mr,1e-4) * 1.4) * 0.05 * uMoonBright;
    }

    gl_FragColor = vec4(max(c,0.0) * uIntensity, 1.0);
  }`,Yu=`
  attribute float aSize; attribute float aSeed; attribute vec3 aColor;
  varying vec3 vColor; varying float vTw;
  uniform float uTime, uSize, uTwinkle, uPixelRatio;
  void main(){
    vColor = aColor;
    float tw = 1.0 - uTwinkle * 0.55 * (0.5 + 0.5*sin(uTime*2.4 + aSeed*63.7));
    vTw = tw;
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uSize * uPixelRatio * tw;
  }`,Xu=`
  precision highp float;
  varying vec3 vColor; varying float vTw;
  uniform float uBright, uVisible;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float a = smoothstep(0.5, 0.06, r);
    a *= a;
    float spike = max(0.0, 1.0 - abs(d.x)*14.0) * max(0.0, 1.0 - abs(d.y)*3.0)
                + max(0.0, 1.0 - abs(d.y)*14.0) * max(0.0, 1.0 - abs(d.x)*3.0);
    a = clamp(a + spike * 0.30, 0.0, 1.0);
    float alpha = a * uBright * uVisible * vTw;
    if(alpha < 0.004) discard;
    gl_FragColor = vec4(vColor * alpha, alpha);
  }`,Zu=`
  varying vec2 vUv; varying vec3 vWorld;
  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position,1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`,Qu=`
  precision highp float;
  varying vec2 vUv; varying vec3 vWorld;
  uniform float uTime, uCoverage, uDensity, uScale, uDetail, uSpeed, uDay;
  uniform vec2 uWind;
  uniform vec3 uTint, uShade, uSunDir, uSunTint;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
  }
  float fbm(vec2 p){
    float v=0.0, a=0.5;
    for(int i=0;i<6;i++){ v += a*noise(p); p = p*2.03 + 17.3; a *= 0.5; }
    return v;
  }

  void main(){
    vec2 uv = (vUv - 0.5) * 26.0 / max(uScale, 0.05);
    vec2 drift = uWind * uTime * uSpeed * 0.03;
    float base = fbm(uv + drift);
    float det  = fbm(uv * 3.1 - drift * 1.7);
    float f = mix(base, det, uDetail * 0.45);
    float cov = mix(0.92, 0.18, clamp(uCoverage,0.0,1.0));
    float a = smoothstep(cov, cov + 0.22, f) * clamp(uDensity,0.0,1.0);

    // horizon fade so the deck reads as sky, not as a lid
    float d = length(vWorld.xz);
    a *= 1.0 - smoothstep(900.0, 2200.0, d);
    a *= smoothstep(0.0, 240.0, d);
    if(a < 0.004) discard;

    float lift = smoothstep(cov, cov + 0.45, f);
    vec3 c = mix(uShade, uTint, lift);
    c = mix(c * (0.20 + 0.25*uDay), c, uDay);
    c += uSunTint * pow(clamp(dot(normalize(vec3(uv.x,6.0,uv.y)), uSunDir),0.0,1.0), 8.0) * 0.35 * uDay;
    gl_FragColor = vec4(c, a * 0.92);
  }`,$u=`
  uniform float uTime, uAmp, uLen, uChop, uSpeed;
  uniform vec2 uWind;
  varying vec3 vWorld; varying vec3 vNormal2; varying float vCrest;

  void wave(vec2 dir, float len, float amp, float speed, vec2 p, inout float h, inout vec2 slope){
    float k = 6.28318 / max(len, 0.2);
    float f = k * dot(dir, p) - uTime * speed * k;
    h += amp * sin(f);
    slope += dir * (amp * k * cos(f));
  }
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 p = wp.xz;
    vec2 w = normalize(uWind + vec2(1e-4));
    vec2 w2 = normalize(vec2(w.y, -w.x) * 0.6 + w);
    float h = 0.0; vec2 slope = vec2(0.0);
    wave(w,  uLen,        uAmp,        1.10*uSpeed, p, h, slope);
    wave(w2, uLen*0.63,   uAmp*0.55,   1.42*uSpeed, p, h, slope);
    wave(normalize(w + vec2(-0.7,0.4)), uLen*0.31, uAmp*0.30*uChop, 1.9*uSpeed, p, h, slope);
    wave(normalize(w + vec2(0.5,-0.8)), uLen*0.14, uAmp*0.14*uChop, 2.6*uSpeed, p, h, slope);
    // ripple detail keeps the far field from going glassy
    h += sin(p.x*1.7 + uTime*1.3)*sin(p.y*1.4 - uTime*1.1) * uAmp * 0.06 * uChop;

    wp.y += h;
    vWorld = wp.xyz;
    vCrest = clamp(h / max(uAmp, 1e-3), -1.0, 1.0);
    vNormal2 = normalize(vec3(-slope.x, 1.0, -slope.y));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`,ed=`
  precision highp float;
  varying vec3 vWorld; varying vec3 vNormal2; varying float vCrest;
  uniform vec3 uDeep, uShallow, uSunDir, uSunTint, uSkyZenith, uSkyHorizon, uFogColor;
  uniform float uReflect, uRough, uFoam, uSpec, uClarity, uDay, uFogDensity, uTime;

  void main(){
    vec3 n = normalize(vNormal2);
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
    fres = mix(0.03, 1.0, fres) * uReflect;

    float upness = clamp(dot(reflect(-v, n), vec3(0.0,1.0,0.0)), 0.0, 1.0);
    vec3 sky = mix(uSkyHorizon, uSkyZenith, upness);
    vec3 body = mix(uDeep, uShallow, clamp(uClarity * (0.35 + 0.65*upness), 0.0, 1.0));
    body *= (0.16 + 0.84 * uDay);

    vec3 c = mix(body, sky * (0.25 + 0.75*uDay), fres);

    vec3 hv = normalize(uSunDir + v);
    float shine = pow(clamp(dot(n, hv), 0.0, 1.0), mix(2000.0, 40.0, clamp(uRough,0.0,1.0)));
    c += uSunTint * shine * uSpec * max(uDay, 0.05) * 2.2;
    // glitter path towards the sun
    c += uSunTint * pow(clamp(dot(n, normalize(uSunDir + vec3(0.0,0.2,0.0))),0.0,1.0), 60.0) * 0.25 * uDay;

    float foam = smoothstep(0.62, 0.98, vCrest) * uFoam;
    c = mix(c, vec3(0.92,0.95,0.98) * (0.3 + 0.7*uDay), foam);

    float dist = length(vWorld - cameraPosition);
    float fogAmt = 1.0 - exp(-uFogDensity * dist * 1.4);
    c = mix(c, uFogColor * (0.25 + 0.75*uDay), clamp(fogAmt, 0.0, 0.92));

    gl_FragColor = vec4(c, 1.0);
  }`,td=`
  attribute float aSeed;
  uniform float uTime, uSize, uSpeed, uRadius, uHeight, uPixelRatio, uFlicker, uDay;
  varying float vA;
  void main(){
    float s = aSeed;
    float ang = s * 6.28318 * 7.0;
    float rad = uRadius * (0.15 + 0.85 * fract(s * 13.13));
    float t = fract(s * 7.77 + uTime * 0.05 * uSpeed * (0.4 + fract(s*3.3)));
    vec3 p = vec3(cos(ang + uTime*0.12*uSpeed) * rad,
                  t * uHeight + sin(uTime*0.9 + s*20.0) * 0.15,
                  sin(ang + uTime*0.1*uSpeed) * rad);
    vA = (0.35 + 0.65 * abs(sin(uTime * (1.4 + fract(s*5.0)*2.6) + s*40.0))) ;
    vA = mix(1.0, vA, uFlicker) * smoothstep(0.0,0.12,t) * (1.0 - smoothstep(0.7,1.0,t));
    vA *= mix(1.0, 0.10, clamp(uDay, 0.0, 1.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (60.0 / max(-mv.z, 1.0));
  }`,nd=`
  precision highp float;
  varying float vA;
  uniform vec3 uColor;
  void main(){
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, r) * vA;
    if(a < 0.01) discard;
    gl_FragColor = vec4(uColor * a * 1.6, a);
  }`;function rd(e,{onPick:t}={}){let n=new Nl({canvas:e,antialias:!0,powerPreference:`high-performance`});n.setPixelRatio(Math.min(devicePixelRatio,1.75)),n.toneMapping=4,n.toneMappingExposure=1,n.shadowMap.enabled=!0,n.shadowMap.type=2;let r=new Fn,i=new ja(48,1,.1,6e3);i.position.set(11.5,5.4,13.5);let a=new gu(i,e);a.enableDamping=!0,a.dampingFactor=.075,a.minDistance=2.5,a.maxDistance=260,a.maxPolarAngle=Math.PI*.495,a.target.set(0,1.1,0);let o={uSunDir:{value:new q(0,.3,1)},uMoonDir:{value:new q(0,.6,-1)},uZenith:{value:Gu(`#2f6dd0`)},uHorizon:{value:Gu(`#9fc4e8`)},uGround:{value:Gu(`#14181d`)},uSunTint:{value:Gu(`#fff0d4`)},uMoonTint:{value:Gu(`#d8e2f2`)},uRayleigh:{value:1.35},uMie:{value:.22},uMieG:{value:.78},uTurbidity:{value:3.4},uOzone:{value:1},uIntensity:{value:1},uSunAngular:{value:.6},uSunIntensity:{value:88},uMoonAngular:{value:1.6},uMoonPhase:{value:.68},uMoonBright:{value:1.1},uEarthshine:{value:.16}},s=new Qr(new Ui(2600,48,32),new $i({vertexShader:qu,fragmentShader:Ju,uniforms:o,side:1,depthWrite:!1}));s.frustumCulled=!1,r.add(s);let c=5200,l=new kr;{let e=new Float32Array(c*3),t=new Float32Array(c),n=new Float32Array(c),r=new Float32Array(c*3),i=Gu(`#ffd7ae`),a=Gu(`#bcd4ff`);for(let o=0;o<c;o++){let s;if(o%2==0){let e=Math.random()*Math.PI*2,t=(Math.random()+Math.random()+Math.random()-1.5)*.22;s=new q(Math.cos(e),t*1.6,Math.sin(e)).applyAxisAngle(new q(1,0,.35).normalize(),.9).normalize()}else s=new q(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1),s.lengthSq()<1e-4&&s.set(0,1,0),s.normalize();s.y=Math.abs(s.y)*.92+.03,s.normalize().multiplyScalar(2400),e.set([s.x,s.y,s.z],o*3),t[o]=.6+Math.random()**3.2*4.2,n[o]=Math.random();let c=i.clone().lerp(a,Math.random());r.set([c.r,c.g,c.b],o*3)}l.setAttribute(`position`,new mr(e,3)),l.setAttribute(`aSize`,new mr(t,1)),l.setAttribute(`aSeed`,new mr(n,1)),l.setAttribute(`aColor`,new mr(r,3))}let u={uTime:{value:0},uSize:{value:1.5},uTwinkle:{value:.45},uBright:{value:1.15},uVisible:{value:1},uPixelRatio:{value:n.getPixelRatio()}},d=new Oi(l,new $i({vertexShader:Yu,fragmentShader:Xu,uniforms:u,transparent:!0,depthWrite:!1,blending:2}));d.frustumCulled=!1,r.add(d);let f={uTime:{value:0},uCoverage:{value:.46},uDensity:{value:.62},uScale:{value:1},uDetail:{value:.55},uSpeed:{value:1},uDay:{value:1},uWind:{value:new Tt(.6,.4)},uTint:{value:Gu(`#eef3f8`)},uShade:{value:Gu(`#5c6a7c`)},uSunDir:{value:new q(0,1,0)},uSunTint:{value:Gu(`#fff0d4`)}},p=new Qr(new Hi(5e3,5e3,1,1),new $i({vertexShader:Zu,fragmentShader:Qu,uniforms:f,transparent:!0,depthWrite:!1,side:2}));p.rotation.x=-Math.PI/2,p.position.y=130,p.renderOrder=1,r.add(p);let m={uTime:{value:0},uAmp:{value:.19},uLen:{value:7.5},uChop:{value:.85},uSpeed:{value:1},uWind:{value:new Tt(.6,.4)},uDeep:{value:Gu(`#06222e`)},uShallow:{value:Gu(`#1d7b8c`)},uSunDir:{value:new q(0,1,0)},uSunTint:{value:Gu(`#fff0d4`)},uSkyZenith:{value:Gu(`#2f6dd0`)},uSkyHorizon:{value:Gu(`#9fc4e8`)},uFogColor:{value:Gu(`#8fa4bb`)},uReflect:{value:.82},uRough:{value:.07},uFoam:{value:.28},uSpec:{value:1.6},uClarity:{value:.55},uDay:{value:1},uFogDensity:{value:.011}},h=new Qr(new Hi(1400,1400,220,220),new $i({vertexShader:$u,fragmentShader:ed,uniforms:m}));h.rotation.x=-Math.PI/2,h.position.y=-.6,r.add(h);let g=new Ra(16773332,3);g.castShadow=!0,g.shadow.mapSize.set(2048,2048);let _=g.shadow.camera;_.left=-18,_.right=18,_.top=18,_.bottom=-18,_.near=.5,_.far=120,g.shadow.bias=-6e-4,g.shadow.normalBias=.03,r.add(g,g.target);let v=new Ra(11453672,.2);r.add(v,v.target);let y=new ya(10470632,1316893,.7);r.add(y);let b=new Pn(9413819,.011),x=new Bo(n);x.compileEquirectangularShader();let S=new Fn;S.add(new Qr(s.geometry,s.material));let C=null,w=!0,T=0;function E(){let e=C;C=x.fromScene(S,0,1,4e3),r.environment=C.texture,r.environmentIntensity=1,e&&e.dispose()}let D=new Map,O=new Set,k=new Map,A=[],j={box:()=>new Pi(1,1,1),sphere:()=>new Ui(.6,48,32),torus:()=>new Wi(.7,.22,24,72),cylinder:()=>new Fi(.5,.5,1,40),plane:()=>new Hi(2,2,1,1)};function M(e,t,n=64){let r=[];for(let t=0;t<=n;t++){let i=t/n*Math.PI*2;r.push(new q(Math.cos(i)*e,0,Math.sin(i)*e))}return new vi(new kr().setFromPoints(r),new ui({color:t,transparent:!0,opacity:.55}))}function N(e){let t=Xl(e),i=new Tn,a={root:i,node:e};if(i.userData.nodeId=e.id,t.mesh){let n=new ta({color:Gu(e.props.color)}),r=new Qr(j[t.mesh](),n);r.castShadow=!0,r.receiveShadow=!0,r.userData.nodeId=e.id,i.add(r),a.mesh=r,A.push(r)}else if(e.type===`pointlight`){let t=new Fa(Gu(e.props.color),14,26,2),n=new Qr(new Ui(.11,16,12),new Br({color:Gu(e.props.color)}));i.add(t,n),a.light=t,a.glow=n}else if(e.type===`spotlight`){let t=new Na(Gu(e.props.color),60,0,.45,.4,1.6);t.castShadow=!0,t.shadow.mapSize.set(1024,1024);let n=new wn,o=new Qr(new Ii(1,1,40,1,!0),new Br({color:Gu(e.props.color),transparent:!0,opacity:.035,side:2,depthWrite:!1})),s=new Si(new Vi(new Ii(1,1,4,1,!0)),new ui({color:Gu(e.props.color),transparent:!0,opacity:.18}));r.add(n),t.target=n,i.add(t,o,s),a.light=t,a.target=n,a.cone=o,a.wire=s}else if(e.type===`ieslight`){let t=new Na(Gu(e.props.color),80,0,.55,.18,2);t.castShadow=!0;let n=new wn;r.add(n),t.target=n;let o=new Qr(new Ii(1,1,48,1,!0),new Br({color:Gu(e.props.color),transparent:!0,opacity:.045,side:2,depthWrite:!1}));i.add(t,o),a.light=t,a.target=n,a.cone=o}else if(e.type===`arealight`||e.type===`tubelight`){let t=new Fa(Gu(e.props.color),30,50,2),n=new Qr(e.type===`arealight`?new Hi(1,1):new Fi(1,1,1,20),new Br({color:Gu(e.props.color),side:2}));i.add(t,n),a.light=t,a.shape=n}else if([`camera`,`cinecamera`,`playercamera`,`vehiclecamera`].includes(e.type)){let t=new ja(e.props.fov,16/9,e.props.near||.4,e.props.far||6e3),n=new fo(t);n.material.opacity=.22,n.material.transparent=!0,a.proxy=t,a.helper=n,r.add(n);let o=new Qr(new Pi(.22,.16,.34),new ta({color:2830907,roughness:.45,metalness:.3,emissive:658704}));o.castShadow=!1,i.add(o),a.mesh=o}else if(e.type===`particles`){let e=4e3,t=new kr,r=new Float32Array(e*3),o=new Float32Array(e);for(let t=0;t<e;t++)o[t]=Math.random();t.setAttribute(`position`,new mr(r,3)),t.setAttribute(`aSeed`,new mr(o,1));let s={uTime:{value:0},uSize:{value:2.1},uSpeed:{value:.5},uRadius:{value:9},uHeight:{value:5},uPixelRatio:{value:n.getPixelRatio()},uFlicker:{value:.7},uDay:{value:1},uColor:{value:Gu(`#ffd88a`)}},c=new Oi(t,new $i({vertexShader:td,fragmentShader:nd,uniforms:s,transparent:!0,depthWrite:!1,blending:2}));c.frustumCulled=!1,i.add(c),a.points=c,a.uni=s}else if(e.type===`probe`){let e=new Qr(new Ui(1,24,16),new Br({color:8249599,wireframe:!0,transparent:!0,opacity:.16}));i.add(e),a.bounds=e}else if(e.type===`audio`){let e=M(1,12029439);i.add(e),a.ring=e}return r.add(i),D.set(e.id,a),a}let P=e=>Kl.find(t=>t.type===e),F=new q(0,.4,1),I=new q(0,.7,-1),L=1;function R(){let e=P(`sky`),t=P(`sun`),i=P(`moon`),a=P(`stars`),s=P(`clouds`),l=P(`fog`),_=P(`wind`),x=P(`water`),S=t.props,C=i.props,T=e.props;F=Ku(S.elevation,S.azimuth),I=Ku(C.elevation,C.azimuth),L=wt.clamp((F.y+.1)/.34,0,1);let E=t.vis&&iu(t),D=i.vis&&iu(i);o.uSunDir.value.copy(F),o.uMoonDir.value.copy(I),o.uRayleigh.value=T.rayleigh,o.uMie.value=T.mie,o.uMieG.value=T.mieG,o.uTurbidity.value=T.turbidity,o.uOzone.value=T.ozone,o.uIntensity.value=e.vis&&iu(e)?T.intensity:.02,o.uZenith.value.set(T.zenith),o.uHorizon.value.set(T.horizon),o.uGround.value.set(T.ground),o.uSunTint.value.set(S.tint),o.uSunAngular.value=E?S.angular:0,o.uSunIntensity.value=E?S.intensity:0,o.uMoonTint.value.set(C.tint),o.uMoonAngular.value=C.angular,o.uMoonPhase.value=C.phase,o.uMoonBright.value=D?C.brightness:0,o.uEarthshine.value=C.earthshine;let O=a.props;u.uSize.value=O.size,u.uTwinkle.value=O.twinkle,u.uBright.value=O.brightness,u.uVisible.value=a.vis&&iu(a)?(1-L)**2.2:0,d.rotation.y=O.rotation*Wu,d.geometry.setDrawRange(0,Math.floor(c*wt.clamp(O.density*1.4,.02,1))),d.visible=a.vis&&iu(a);let A=_.props,j=new Tt(Math.sin(A.direction*Wu),Math.cos(A.direction*Wu)).multiplyScalar(Math.max(A.speed,.05)*.25),M=s.props;f.uCoverage.value=M.coverage,f.uDensity.value=M.density,f.uScale.value=M.scale,f.uDetail.value=M.detail,f.uSpeed.value=M.speed,f.uTint.value.set(M.tint),f.uShade.value.set(M.shade),f.uSunDir.value.copy(F),f.uSunTint.value.set(S.tint),f.uWind.value.copy(M.windLinked?j:new Tt(.6,.4)),p.position.y=M.altitude,p.visible=s.vis&&iu(s);let N=l.props,R=N.enabled&&l.vis&&iu(l);R?(b.color.set(N.color).multiplyScalar(.25+.75*L),b.density=N.density,r.fog=b):r.fog=null,m.uFogDensity.value=R?N.density:0,m.uFogColor.value.set(N.color);let z=x.props;m.uAmp.value=z.amplitude,m.uLen.value=z.wavelength,m.uChop.value=z.choppiness,m.uSpeed.value=z.speed,m.uDeep.value.set(z.deep),m.uShallow.value.set(z.shallow),m.uReflect.value=z.reflectivity,m.uRough.value=z.roughness,m.uFoam.value=z.foam,m.uSpec.value=z.specular,m.uClarity.value=z.clarity,m.uSunDir.value.copy(F),m.uSunTint.value.set(S.tint),m.uSkyZenith.value.set(T.zenith),m.uSkyHorizon.value.set(T.horizon),m.uWind.value.copy(z.windLinked?j:new Tt(1,0)),h.position.y=z.level,h.visible=x.vis&&iu(x),Math.abs(h.scale.x-z.extent/1400)>.001&&h.scale.setScalar(z.extent/1400);let ne=te(S.temperature);g.color.set(S.tint).multiply(ne),g.intensity=E?S.intensity/30*Math.max(L,0):0,g.castShadow=!!S.shadows&&E,g.shadow.radius=S.softness,g.position.copy(F).multiplyScalar(60),g.target.position.set(0,0,0),v.color.set(C.tint),v.intensity=D?C.moonlight*(1-L)*.9:0,v.position.copy(I).multiplyScalar(60),y.color.set(T.horizon),y.groundColor.set(T.ground),y.intensity=(e.vis&&T.lightsScene?1:.05)*T.intensity*(.16+.66*L);let re=P(`post`);if(re){let e=re.props,t=re.vis&&iu(re);n.toneMappingExposure=t?e.exposure:1,n.toneMapping=t?ee[e.tonemap]??4:4,V.enabled=t&&e.bloom,V.strength=e.bloomStrength,V.threshold=e.bloomThreshold,se&&se.style.setProperty(`--vig`,t?e.vignette:0),ce&&ce.style.setProperty(`--grain`,t?e.grain*.16:0),ae=t?e.saturation:1,oe=t?e.contrast:1}w=!0,k.set(P(`sun`).id,F.clone().multiplyScalar(1500)),k.set(P(`moon`).id,I.clone().multiplyScalar(1500)),k.set(P(`sky`).id,Ku(38,(S.azimuth+90)%360).multiplyScalar(900)),k.set(P(`stars`).id,Ku(62,(S.azimuth+200)%360).multiplyScalar(1200)),k.set(P(`clouds`).id,new q(0,M.altitude,0).add(Ku(0,(A.direction+180)%360).multiplyScalar(180))),k.set(P(`fog`).id,new q(-11,z.level+1.6,9)),k.set(P(`water`).id,new q(9,z.level+.35,9))}let ee={ACES:4,AgX:6,Filmic:3,Reinhard:2,Linear:1};function te(e){let t=wt.clamp((e-1600)/10400,0,1);return new Mn().setRGB(wt.lerp(1,.72,t),wt.lerp(.62,.84,t),wt.lerp(.3,1,t))}function z(t){be=!0;let n=Xl(t);if([`sky`,`sun`,`moon`,`stars`,`clouds`,`fog`,`wind`,`water`,`post`].includes(t.type)){R();return}let r=D.get(t.id)||N(t),i=t.props,a=t.vis&&iu(t);if(r.root.visible=a,n.mesh&&r.mesh){r.root.position.set(...i.pos),r.root.rotation.set(i.rot[0]*Wu,i.rot[1]*Wu,i.rot[2]*Wu),r.root.scale.set(...i.scale.map(e=>Math.max(e,.001)));let e=r.mesh.material;e.color.set(i.color),e.metalness=i.metalness,e.roughness=Math.max(i.roughness,.02),e.emissive.set(i.emissive),e.emissiveIntensity=i.emissiveStrength,r.mesh.castShadow=i.castShadow,k.set(t.id,new q(i.pos[0],i.pos[1]+Math.abs(i.scale[1])*.62+.35,i.pos[2]))}else if(t.type===`pointlight`)r.root.position.set(...i.pos),r.light.color.set(i.color),r.light.intensity=a?i.intensity:0,r.light.distance=i.distance,r.light.decay=i.decay,r.light.castShadow=i.shadows,r.glow.material.color.set(i.color),r.glow.visible=i.gizmoGlow&&a&&!Se,k.set(t.id,new q(...i.pos));else if(t.type===`spotlight`){r.root.position.set(...i.pos),r.target.position.set(...i.target),r.light.color.set(i.color),r.light.intensity=a?i.intensity:0,r.light.angle=i.angle*Wu,r.light.penumbra=i.penumbra,r.light.castShadow=i.shadows;let e=new q(...i.pos),n=new q(...i.target),o=Math.max(e.distanceTo(n),.2),s=Math.tan(i.angle*Wu)*o;[r.cone,r.wire].forEach(c=>{c.visible=i.showCone&&a&&!Se&&(c===r.wire||O.has(t.id)),c.scale.set(s,o,s),c.position.set(0,0,0);let l=n.clone().sub(e).multiplyScalar(.5);c.position.copy(l),c.quaternion.setFromUnitVectors(new q(0,-1,0),n.clone().sub(e).normalize()),c.material.color.set(i.color)}),k.set(t.id,new q(...i.pos))}else if(t.type===`ieslight`){r.root.position.set(...i.pos),r.target.position.set(...i.target),r.light.color.set(i.color),r.light.intensity=a?i.lumens*i.multiplier*.055:0,r.light.distance=i.range,r.light.angle=i.cone*Wu*.5,r.light.penumbra=.22,r.light.castShadow=i.shadows;let e=new q(...i.pos),n=new q(...i.target),o=Math.max(e.distanceTo(n),.2),s=Math.tan(i.cone*Wu*.5)*o;r.cone.visible=i.showDistribution&&a&&!Se&&O.has(t.id),r.cone.scale.set(s,o,s),r.cone.position.copy(n.clone().sub(e).multiplyScalar(.5)),r.cone.quaternion.setFromUnitVectors(new q(0,-1,0),n.clone().sub(e).normalize()),r.cone.material.color.set(i.color),k.set(t.id,new q(...i.pos))}else t.type===`arealight`?(r.root.position.set(...i.pos),r.root.lookAt(new q(...i.target)),r.light.color.set(i.color),r.light.intensity=a?i.lumens*.018:0,r.light.distance=80,r.light.castShadow=i.shadows,r.shape.scale.set(i.width,i.height,1),r.shape.material.color.set(i.color),r.shape.visible=i.showShape&&a&&!Se,k.set(t.id,new q(...i.pos))):t.type===`tubelight`?(r.root.position.set(...i.pos),r.root.rotation.set(...i.rot.map(e=>e*Wu)),r.light.color.set(i.color),r.light.intensity=a?i.lumens*.018:0,r.light.distance=i.distance,r.light.castShadow=i.shadows,r.shape.scale.set(i.radius,i.length,i.radius),r.shape.material.color.set(i.color),r.shape.visible=i.showShape&&a&&!Se,k.set(t.id,new q(...i.pos))):[`camera`,`cinecamera`,`playercamera`,`vehiclecamera`].includes(t.type)?(r.root.position.set(...i.pos),r.root.lookAt(new q(...i.lookAt)),r.proxy.position.set(...i.pos),r.proxy.lookAt(new q(...i.lookAt)),r.proxy.fov=i.fov,r.proxy===Se?(r.proxy.aspect=(e.clientWidth||16)/(e.clientHeight||9),r.proxy.near=i.near||.1,r.proxy.far=i.far||6e3):(r.proxy.aspect={"16:9":16/9,"2.39:1":2.39,"4:3":4/3,"1:1":1}[i.gate]||16/9,r.proxy.near=i.near||.1,r.proxy.far=wt.clamp((i.focus??i.distance??i.boom??12)*.4,1.6,6)),r.proxy.updateProjectionMatrix(),r.proxy.updateMatrixWorld(!0),r.helper.update(),r.helper.visible=i.showFrustum&&a&&!Se&&O.has(t.id),k.set(t.id,new q(i.pos[0],i.pos[1]+.35,i.pos[2]))):t.type===`particles`?(r.root.position.set(...i.pos),r.uni.uSize.value=i.size,r.uni.uSpeed.value=i.speed,r.uni.uRadius.value=i.radius,r.uni.uHeight.value=i.height,r.uni.uFlicker.value=i.flicker,r.uni.uColor.value.set(i.color),r.points.geometry.setDrawRange(0,Math.floor(i.count)),k.set(t.id,new q(i.pos[0],i.pos[1]+i.height*.5,i.pos[2]))):t.type===`probe`?(r.root.position.set(...i.pos),r.bounds.scale.setScalar(i.radius),r.bounds.visible=i.showBounds&&a&&!Se&&O.has(t.id),r.bounds.material.opacity=.06+.12*i.intensity,k.set(t.id,new q(...i.pos))):t.type===`audio`&&(r.root.position.set(...i.pos),r.ring.scale.setScalar(i.radius),r.ring.material.opacity=.12+.3*i.gain,r.ring.visible=a&&!Se&&O.has(t.id),k.set(t.id,new q(...i.pos)))}function ne(){be=!0,ql(),R(),Kl.forEach(e=>{e.type!==`folder`&&z(e)})}let re=new Lu(n),B=new Ru(r,i);re.addPass(B);let V=new Bu(new Tt(1,1),.42,.6,.85);re.addPass(V);let H=new Vu(new Tt(1,1),r,i);H.edgeStrength=4,H.edgeGlow=.35,H.edgeThickness=1.2,H.pulsePeriod=0,H.visibleEdgeColor.set(`#ffffff`),H.hiddenEdgeColor.set(`#3a3a3a`),re.addPass(H);let ie=le();re.addPass(ie),re.addPass(new Uu);let ae=1,oe=1,se=null,ce=null;function le(){return new Pu({uniforms:{tDiffuse:{value:null},uSat:{value:1},uCon:{value:1}},vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,fragmentShader:`
        uniform sampler2D tDiffuse; uniform float uSat, uCon; varying vec2 vUv;
        void main(){
          vec4 t = texture2D(tDiffuse, vUv);
          float l = dot(t.rgb, vec3(0.2126,0.7152,0.0722));
          vec3 c = mix(vec3(l), t.rgb, uSat);
          c = (c - 0.5) * uCon + 0.5;
          gl_FragColor = vec4(max(c, 0.0), t.a);
        }`})}let ue=new io,de=new Tt,U=new ai(new q(0,1,0),.6);function fe(t,n){let r=e.getBoundingClientRect();de.set((t-r.left)/r.width*2-1,-((n-r.top)/r.height)*2+1),ue.setFromCamera(de,i);let a=ue.intersectObjects(A.filter(e=>e.visible&&e.parent?.visible),!1);if(a.length)return a[0].object.userData.nodeId;if(h.visible){U.constant=-h.position.y;let e=ue.ray.intersectPlane(U,new q);if(e&&e.distanceTo(i.position)<900)return P(`water`).id}return null}e.addEventListener(`pointerdown`,()=>e.classList.add(`dragging`)),addEventListener(`pointerup`,()=>e.classList.remove(`dragging`));let pe=null;e.addEventListener(`pointerdown`,e=>{pe={x:e.clientX,y:e.clientY,t:performance.now()}}),e.addEventListener(`pointerup`,e=>{pe&&=(Math.hypot(e.clientX-pe.x,e.clientY-pe.y)<4&&performance.now()-pe.t<500&&t&&t(fe(e.clientX,e.clientY),e),null)});function me(e){let t=O;O=new Set(e),Kl.forEach(e=>{[`camera`,`cinecamera`,`playercamera`,`vehiclecamera`,`probe`,`audio`,`spotlight`,`ieslight`].includes(e.type)&&t.has(e.id)!==O.has(e.id)&&z(e)});let n=[];e.forEach(e=>{let t=D.get(e);t?.mesh&&n.push(t.mesh),t?.bounds&&n.push(t.bounds)}),H.selectedObjects=Se?[]:n,Ae=n}let he=null;function ge(e){let t=k.get(e.id);if(!t)return;if(t.length()>400){a.maxPolarAngle=Math.PI;let e=i.position.clone(),n=e.clone().add(t.clone().normalize().multiplyScalar(60));he={t:0,fromT:a.target.clone(),toT:n,fromP:e,toP:e};return}a.maxPolarAngle=Math.PI*.495;let n=Math.max(3.2,t.distanceTo(a.target)*.35+4.2),r=i.position.clone().sub(a.target).setLength(n);he={t:0,fromT:a.target.clone(),toT:t.clone(),fromP:i.position.clone(),toP:t.clone().add(r)}}function _e(){a.maxPolarAngle=Math.PI*.495,he={t:0,fromT:a.target.clone(),toT:new q(0,1.1,0),fromP:i.position.clone(),toP:new q(11.5,5.4,13.5)}}let ve=!0,ye=!0,be=!0,xe=0,Se=null;function Ce(){let t=e.clientWidth||1,r=e.clientHeight||1;n.setSize(t,r,!1),re.setSize(t,r),V.setSize(t,r),H.setSize(t,r),i.aspect=t/r,i.updateProjectionMatrix(),Se&&(Se.aspect=t/r,Se.updateProjectionMatrix()),u.uPixelRatio.value=n.getPixelRatio(),be=!0}new ResizeObserver(Ce).observe(e),Ce();let we=new so,W=0,Te=60,Ee=0,De=0,G=()=>Se||i,Oe=()=>{be=!0};a.addEventListener(`change`,Oe);function K({animate:e,render:t}){e!==void 0&&(ve=e),t!==void 0&&(ye=t),be=!0}function ke(e=1/30){xe=e,be=!0}let Ae=[];function je(t){if(!t)Se=null,B.camera=i,H.renderCamera=i,a.enabled=!0;else{let n=D.get(t.id);if(!n?.proxy)return!1;Se=n.proxy,Se.aspect=(e.clientWidth||16)/(e.clientHeight||9),Se.near=.1,Se.far=6e3,Se.updateProjectionMatrix(),B.camera=Se,H.renderCamera=Se,a.enabled=!1}return H.selectedObjects=Se?[]:Ae,ne(),be=!0,!0}function Me(e){let t=new q(e.x,e.y,e.z).normalize();a.maxPolarAngle=t.y<-.5?Math.PI:Math.PI*.495;let n=Math.max(i.position.distanceTo(a.target),3),r=t.multiplyScalar(n);Math.abs(r.y)>n*.9&&(r.x+=n*.004),he={t:0,fromT:a.target.clone(),toT:a.target.clone(),fromP:i.position.clone(),toP:a.target.clone().add(r)},be=!0}function Ne(e,t){let n=i.position.clone().sub(a.target),r=new co().setFromVector3(n);r.theta-=e*.009,r.phi=wt.clamp(r.phi-t*.009,.03,a.maxPolarAngle-.01),i.position.copy(a.target).add(new q().setFromSpherical(r)),i.lookAt(a.target),be=!0}function Pe(e){let t=G();W+=e;let r=P(`stars`);if(d.rotation.y+=e*.0015*(r.props.drift||0),s.position.copy(t.position),d.position.copy(t.position),u.uTime.value=W,f.uTime.value=W,f.uDay.value=L,m.uTime.value=W,m.uDay.value=L,p.position.x=t.position.x,p.position.z=t.position.z,D.forEach(e=>{e.uni&&(e.uni.uTime.value=W,e.uni.uDay.value=L)}),T+=e,w&&T>.25&&(w=!1,T=0,E()),he){he.t=Math.min(1,he.t+e*2.1);let t=1-(1-he.t)**3;a.target.lerpVectors(he.fromT,he.toT,t),i.position.lerpVectors(he.fromP,he.toP,t),he.t>=1&&(he=null)}Se||a.update(),ie.uniforms.uSat.value=ae,ie.uniforms.uCon.value=oe,n.info.autoReset=!1,n.info.reset(),re.render()}let Fe=0;function Ie(e){let t=()=>{Fe=requestAnimationFrame(t);let n=we.getDelta(),r=Math.min(n,.06);Se||a.update();let o=ve?r:0;xe>0&&(o=xe,xe=0,be=!0),(ye||ve||be||he)&&(be=!1,Pe(o),De++,Ee+=n,Ee>.5&&(Te=De/Ee,De=0,Ee=0),e&&e({fps:Te,dt:o,time:W,dayFactor:L,camera:G(),editorCamera:i,controls:a,playing:!!Se}))};return t(),()=>cancelAnimationFrame(Fe)}return{scene3:r,camera:i,controls:a,renderer:n,anchors:k,objects:D,applyNode:z,applyAll:ne,setSelection:me,focusOn:ge,frameAll:_e,start:Ie,resize:Ce,pickAt:fe,setClock:K,stepOnce:ke,setViewCamera:je,snapView:Me,orbitBy:Ne,requestRender:Oe,get isPlaying(){return!!Se},get isFlying(){return!!he},get renderInfo(){return n.info.render},get dayFactor(){return L},get sunDir(){return F},setHudElements(e,t){se=e,ce=t},onEnvTick:e=>{},remove(e){let t=D.get(e.id);if(t){if(r.remove(t.root),t.helper&&r.remove(t.helper),t.target&&r.remove(t.target),t.mesh){let e=A.indexOf(t.mesh);e>=0&&A.splice(e,1)}D.delete(e.id),k.delete(e.id)}},purge(e){let t=D.get(e.id),i={geometries:0,materials:0,textures:0,triangles:0};if(!t)return be=!0,i;let a=e=>{if(e.geometry){let t=e.geometry,n=t.index?t.index.count:t.attributes.position?.count||0;i.triangles+=Math.floor(n/3),t.dispose(),i.geometries++}(Array.isArray(e.material)?e.material:e.material?[e.material]:[]).forEach(e=>{Object.values(e).forEach(e=>{e&&e.isTexture&&(e.dispose(),i.textures++)}),e.dispose(),i.materials++})};if([t.root,t.helper,t.target].forEach(e=>e&&e.traverse&&e.traverse(a)),r.remove(t.root),t.helper&&r.remove(t.helper),t.target&&r.remove(t.target),t.mesh){let e=A.indexOf(t.mesh);e>=0&&A.splice(e,1)}return D.delete(e.id),k.delete(e.id),n.renderLists.dispose(),be=!0,i}}}var id=(e,{size:t=14,color:n=`currentColor`,width:r=1.9}={})=>`<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="${n}"
    stroke-width="${r}" stroke-linecap="round" stroke-linejoin="round">${e}</svg>`,ad={folder:`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`,cube:`<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M12 22V12"/><path d="m3 7 9 5 9-5"/>`,sphere:`<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="4"/><path d="M12 3v18"/>`,torus:`<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="3.4"/>`,cylinder:`<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12a7 3 0 0 0 14 0V6"/>`,plane:`<path d="m2 16 10-9 10 9-10 4z"/>`,light:`<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9 4.9 19.1"/>`,spot:`<path d="M12 3 5 17h14z"/><ellipse cx="12" cy="18" rx="7" ry="3"/>`,camera:`<rect x="2" y="6" width="13" height="12" rx="2"/><path d="m15 10 7-4v12l-7-4z"/>`,sky:`<path d="M4 16a5 5 0 1 1 3-9 6 6 0 1 1 5 9z"/><path d="M2 20h20"/>`,sun:`<circle cx="12" cy="12" r="5"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M19.8 4.2l-2.1 2.1M6.3 17.7l-2.1 2.1"/>`,moon:`<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>`,stars:`<path d="m12 2 1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9z"/><path d="M18.5 15.5 19 17l1.5.5L19 18l-.5 1.5L18 18l-1.5-.5L18 17z"/><path d="M5 15l.4 1.2L6.6 16.6 5.4 17 5 18.2 4.6 17 3.4 16.6 4.6 16.2z"/>`,cloud:`<path d="M6.5 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.6 9.3 3.9 3.9 0 0 1 17.5 18z"/>`,fog:`<path d="M3 9h18M5 13h14M4 17h16"/><path d="M6.5 5.5a5 5 0 0 1 9.5 0"/>`,wind:`<path d="M3 8h9a3 3 0 1 0-3-3"/><path d="M3 13h13a3 3 0 1 1-3 3"/><path d="M3 18h7"/>`,water:`<path d="M2 8c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/><path d="M2 14c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"/><path d="M2 20c2.5 0 2.5 1.6 5 1.6"/>`,particles:`<circle cx="6" cy="7" r="1.6"/><circle cx="17" cy="5" r="1.2"/><circle cx="12" cy="12" r="2"/><circle cx="7" cy="17" r="1.3"/><circle cx="18" cy="16" r="1.7"/>`,probe:`<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16"/><path d="M6.5 6.5A7.6 7.6 0 0 1 17 17"/>`,audio:`<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 8.5a5 5 0 0 1 0 7"/><path d="M20 6a9 9 0 0 1 0 12"/>`,post:`<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" opacity=".35" stroke="none"/>`,fx:`<path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.4 6.1L21.5 11.5 15.4 13.9 13 20l-2.4-6.1L4.5 11.5l6.1-2.4z"/>`,eye:`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>`,eyeoff:`<path d="M2 12s3.5-7 10-7c2 0 3.8.7 5.3 1.6M22 12s-3.5 7-10 7c-2 0-3.8-.7-5.3-1.6"/><path d="m3 3 18 18"/>`,lock:`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,unlock:`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>`,solo:`<path d="M12 3 14.5 9 21 9.7l-4.9 4.3 1.5 6.4L12 17l-5.6 3.4L7.9 14 3 9.7 9.5 9z"/>`,motion:`<path d="M3 12h4l3-8 4 16 3-8h4"/>`,chev:`<path d="m9 6 6 6-6 6"/>`,chevdown:`<path d="m6 9 6 6 6-6"/>`,search:`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`,close:`<path d="M18 6 6 18M6 6l12 12"/>`,pin:`<path d="M15 3 21 9l-4 1-3.5 3.5L14 18l-2 2-3.5-5L3 21l5.5-5.5L3.5 12l2-2 4.5.5L13.5 7z"/>`,focus:`<circle cx="12" cy="12" r="3"/><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/>`,settings:`<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2 7 7M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8 7 17M17 7l2.8-2.8"/>`,layers:`<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>`,panelL:`<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>`,panelR:`<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>`,play:`<path d="M6 4l14 8-14 8z"/>`,pause:`<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`,stop:`<rect x="6" y="6" width="12" height="12" rx="2"/>`,tag:`<path d="M3 12.5V4a1 1 0 0 1 1-1h8.5L21 11.5 12.5 20 3 12.5z"/><circle cx="7.5" cy="7.5" r="1.4"/>`,step:`<path d="M7 5v14l9-7z"/><path d="M18 5v14"/>`,sim:`<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7v5l3.5 2"/><path d="M17 3l4 2-4 2z"/>`,plus:`<path d="M12 5v14M5 12h14"/>`,trash:`<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>`,copy:`<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>`,reset:`<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>`,command:`<path d="M6 3a3 3 0 1 1-3 3v12a3 3 0 1 0 3-3h12a3 3 0 1 1 3 3V6a3 3 0 1 0-3 3H6z"/>`,check:`<path d="m4 12 6 6L20 6"/>`,alert:`<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17.2v.4"/>`,arrowout:`<path d="M8.5 15.5 15.5 8.5"/><path d="M9.5 8.5h6v6"/>`,grid:`<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>`,world:`<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>`},X=(e,t)=>id(ad[e]||ad.cube,t);function Z(e,t,n){let r=document.createElement(e);return t&&(r.className=t),n!=null&&(r.innerHTML=n),r}var od=(e,t,n)=>Math.min(n,Math.max(t,e)),sd=(e,t)=>Number(e).toFixed(t??2);function cd({min:e=0,max:t=1,value:n=0,dec:r=2,unit:i=``,hi:a=!1,thin:o=!1,onInput:s}){let c=Z(`div`,`ctl-slider`,``);c.style.cssText=`display:flex;align-items:center;gap:10px;flex:1;min-width:0;`;let l=Z(`div`,`vpill`,`<div class="num"></div><div class="unit">${i||`—`}</div>`),u=Z(`div`,`kslider${a?` hi`:``}${o?` thin`:``}`,`<div class="track"></div><div class="kfill"></div><div class="knob"></div>`);c.append(l,u);let d=od(n,e,t),f=l.querySelector(`.num`),p=()=>{let n=(d-e)/(t-e||1),i=o?18:24,a=u.clientWidth||150,s=i/2+n*Math.max(a-i,1);u.querySelector(`.knob`).style.left=s+`px`,u.querySelector(`.kfill`).style.width=Math.max(s,i)+`px`,f.querySelector(`input`)||(f.textContent=sd(d,r))},m=(n,r=!0)=>{d=od(n,e,t),p(),r&&s&&s(d)};u._paint=p;let h=n=>{let r=u.getBoundingClientRect(),i=o?18:24,a=od((n.clientX-r.left-i/2)/Math.max(r.width-i,1),0,1);m(e+a*(t-e))};return u.addEventListener(`pointerdown`,e=>{u.setPointerCapture(e.pointerId),u.classList.add(`drag`),h(e);let t=e=>h(e),n=()=>{u.classList.remove(`drag`),u.removeEventListener(`pointermove`,t),u.removeEventListener(`pointerup`,n)};u.addEventListener(`pointermove`,t),u.addEventListener(`pointerup`,n)}),u.addEventListener(`wheel`,n=>{n.preventDefault(),m(d-Math.sign(n.deltaY)*(t-e)/100)},{passive:!1}),f.onclick=()=>{if(f.querySelector(`input`))return;let e=sd(d,r);f.innerHTML=`<input value="${e}">`;let t=f.querySelector(`input`);t.focus(),t.select();let n=!1,i=r=>{if(n)return;n=!0;let i=parseFloat(t.value);f.textContent=e,r&&isFinite(i)?m(i):p()};t.onkeydown=e=>{e.stopPropagation(),e.key===`Enter`&&i(!0),e.key===`Escape`&&i(!1)},t.onblur=()=>i(!0)},requestAnimationFrame(p),c._set=e=>m(e,!1),c}function ld(e,t){let n=Z(`div`,`switch`);return n.dataset.on=e?`true`:`false`,n.onclick=()=>{n.dataset.on=n.dataset.on===`true`?`false`:`true`,t(n.dataset.on===`true`)},n._set=e=>{n.dataset.on=e?`true`:`false`},n}function ud(e,{step:t=.05,disabled:n=!1,dec:r=2,onChange:i}){let a=Z(`div`,`vec`),o=[];return[`x`,`y`,`z`].forEach((s,c)=>{let l=Z(`div`,`vfield ${s}`,`<span class="ax">${s.toUpperCase()}</span><span class="num"><input value="${sd(e[c],r)}" ${n?`disabled`:``}></span>`),u=l.querySelector(`input`);if(o.push(u),!n){let e=u.value;u.onfocus=()=>{e=u.value,u.select()},u.onkeydown=n=>{if(n.stopPropagation(),n.key===`Enter`&&u.blur(),n.key===`Escape`&&(u.value=e,u.blur()),n.key===`ArrowUp`||n.key===`ArrowDown`){n.preventDefault();let e=(n.key===`ArrowUp`?1:-1)*t*(n.shiftKey?10:1);u.value=sd((parseFloat(u.value)||0)+e,r),d()}},u.onblur=()=>d();let n=l.querySelector(`.ax`);n.style.cursor=`ew-resize`,n.addEventListener(`pointerdown`,e=>{n.setPointerCapture(e.pointerId);let i=e.clientX,a=parseFloat(u.value)||0,o=e=>{u.value=sd(a+(e.clientX-i)*t,r),d()},s=()=>{n.removeEventListener(`pointermove`,o),n.removeEventListener(`pointerup`,s)};n.addEventListener(`pointermove`,o),n.addEventListener(`pointerup`,s)})}let d=()=>{let e=o.map(e=>{let t=parseFloat(e.value);return isFinite(t)?t:0});o.forEach((t,n)=>{t.value=sd(e[n],r)}),i(e)};a.appendChild(l)}),a._set=e=>o.forEach((t,n)=>{document.activeElement!==t&&(t.value=sd(e[n],r))}),a}function dd(e,t){let n=Z(`div`,`colorrow`),r=Z(`div`,`colorchip`,`<input type="color" value="${e}">`);r.style.background=e;let i=Z(`span`,`hexval`,e.toUpperCase()),a=r.querySelector(`input`);return a.oninput=()=>{r.style.background=a.value,i.textContent=a.value.toUpperCase(),t(a.value)},n.append(r,i),n._set=e=>{a.value=e,r.style.background=e,i.textContent=e.toUpperCase()},n}function fd(e,t,n){let r=Z(`div`,`swatches`);return t.forEach(t=>{let i=Z(`span`,`swatch${e===t?` on`:``}`);i.style.background=t,i.onclick=()=>{r.querySelectorAll(`.swatch`).forEach(e=>e.classList.remove(`on`)),i.classList.add(`on`),n(t)},r.appendChild(i)}),r}function pd(e,t,n,{width:r}={}){let i=Z(`div`,`dd`);r?i.style.flex=`0 0 ${r}px`:i.style.flex=`1`,i.innerHTML=`<div class="dd-btn"><div class="cur"></div><div class="caret">${X(`chevdown`,{size:13})}</div></div>
    <div class="dd-menu"></div>`;let a=i.querySelector(`.cur`),o=i.querySelector(`.dd-menu`),s=`<span class="tick">${X(`check`,{size:12,width:3})}</span>`,c=t,l=()=>{a.textContent=c,o.innerHTML=e.map(e=>`<div class="opt${e===c?` sel`:``}" data-v="${e}">${s}${e}</div>`).join(``),o.querySelectorAll(`.opt`).forEach(e=>e.onclick=t=>{t.stopPropagation(),c=e.dataset.v,l(),i.classList.remove(`open`),n(c)})};return l(),i.querySelector(`.dd-btn`).onclick=e=>{e.stopPropagation(),document.querySelectorAll(`.dd.open`).forEach(e=>{e!==i&&e.classList.remove(`open`)}),i.classList.toggle(`open`)},i._set=e=>{c=e,l()},i}document.addEventListener(`click`,e=>{e.target.closest(`.dd`)||document.querySelectorAll(`.dd.open`).forEach(e=>e.classList.remove(`open`))});function md(e,t,n){if(!t||t.querySelector(`input`))return;let r=e.name;t.innerHTML=`<input value="${r.replace(/"/g,`&quot;`)}">`;let i=t.querySelector(`input`);i.focus(),i.select();let a=!1,o=t=>{if(a)return;a=!0;let o=i.value.trim();e.name=t&&o?o:r,n()};i.onkeydown=e=>{e.stopPropagation(),e.key===`Enter`&&o(!0),e.key===`Escape`&&o(!1)},i.onblur=()=>o(!0),i.onclick=e=>e.stopPropagation(),i.ondblclick=e=>e.stopPropagation()}addEventListener(`resize`,()=>document.querySelectorAll(`.kslider`).forEach(e=>e._paint&&e._paint()));var hd=e=>(e||document).querySelectorAll(`.kslider`).forEach(e=>e._paint&&e._paint());function gd(e,t,{onSelect:n,onOpen:r,onContext:i}={}){let a=new Map,o=new Set,s=new Set,c=`hover`,l=new q;function u(e){let t=new Set(e.map(e=>e.id));a.forEach((e,n)=>{t.has(n)||(e.remove(),a.delete(n))}),e.forEach(e=>{a.has(e.id)||a.set(e.id,d(e))})}function d(t){let a=Xl(t),o=Z(`div`,`bb`);return o.dataset.id=t.id,o.innerHTML=`<div class="ring"></div>
       <div class="disc">${X(a.icon,{size:15,color:a.color})}</div>
       <div class="tag"></div>`,o.querySelector(`.tag`).textContent=t.name,o.addEventListener(`pointerdown`,e=>e.stopPropagation()),o.addEventListener(`click`,e=>{e.stopPropagation();let i=s.has(t.id)&&s.size===1;n&&n(t,e),(i||e.detail===2)&&r&&r(t,o)}),o.addEventListener(`dblclick`,e=>{e.stopPropagation(),r&&r(t,o)}),o.addEventListener(`contextmenu`,e=>{e.preventDefault(),e.stopPropagation(),i&&i(t,e)}),e.appendChild(o),o}function f(){let n=t.camera,r=e.getBoundingClientRect(),i=r.width,u=r.height,d=[];a.forEach((e,r)=>{let s=Kl.find(e=>e.id===r);if(!s){e.remove(),a.delete(r);return}let c=t.anchors.get(r),f=Xl(s);if(!c||!o.has(f.cat)||!ru(s)){e.style.display=`none`;return}if(l.copy(c).project(n),l.z>1){e.style.display=`none`;return}let p=(l.x*.5+.5)*i,m=(-l.y*.5+.5)*u;if(p<-80||m<-60||p>i+80||m>u+60){e.style.display=`none`;return}let h=n.position.distanceTo(c);d.push({elm:e,node:s,x:p,y:m,dist:h,id:r})}),d.sort((e,t)=>e.dist-t.dist);let f=[];d.forEach(e=>{let{elm:t,node:n,x:r,y:i,dist:a}=e,o=s.has(e.id),l=wt.clamp(1.12-Math.log10(Math.max(a,1))*.16,.72,1.12),u=!1,d=c===`always`?116:34;for(let e of f)if(Math.abs(e.x-r)<d&&Math.abs(e.y-i)<30){u=!0;break}f.push(e),t.style.display=`flex`,t.style.transform=`translate3d(${(r-15).toFixed(1)}px, ${(i-15).toFixed(1)}px, 0) scale(${l.toFixed(3)})`,t.style.zIndex=String(4e3-Math.round(a*4)),t.classList.toggle(`sel`,o),t.classList.toggle(`dim`,u&&!o),t.classList.toggle(`muted`,!iu(n)),t.classList.toggle(`named`,c===`always`&&!u),c===`none`&&!o&&t.classList.remove(`named`);let p=t.querySelector(`.tag`);p.textContent!==n.name&&(p.textContent=n.name)})}return{rebuild:u,update:f,setSelection(e){s=new Set(e)},setCategories(e){o=new Set(e)},setLabelMode(e){c=e},elementFor(e){return a.get(e)},screenPos(e){let t=a.get(e);if(!t||t.style.display===`none`)return null;let n=t.getBoundingClientRect();return{x:n.left,y:n.top,w:n.width,h:n.height}}}}var _d=new Map,vd={on(e,t){return(_d.get(e)||_d.set(e,[]).get(e)).push(t),()=>vd.off(e,t)},off(e,t){let n=_d.get(e);n&&n.splice(n.indexOf(t)>>>0,1)},emit(e,t){(_d.get(e)||[]).forEach(e=>e(t))}};function yd(e,t){let n=``,r=new Set;e.innerHTML=`
    <div class="panel-header">
      <div class="ph-icon">${X(`layers`,{size:15})}</div>
      <div><div class="ph-title">Outliner</div><div class="ph-sub" id="olSub"></div></div>
      <div class="spacer"></div>
      <div class="vm" id="olAddWrap">
        <button class="iconbtn ghost" id="olAdd" title="Add an entity to the world">${X(`plus`,{size:14})}</button>
        <div class="vmpop right" id="olAddPop"></div>
      </div>
      <button class="iconbtn ghost" id="olFold" title="Collapse / expand every group">${X(`chevdown`,{size:13})}</button>
    </div>
    <div class="search-row">
      <div class="field">
        <span class="ic">${X(`search`,{size:13})}</span>
        <input id="olSearch" type="text" placeholder="Search world…" autocomplete="off" spellcheck="false">
        <button class="clr" id="olClear" title="Clear" style="display:none">✕</button>
      </div>
      <div id="olFilter"></div>
    </div>
    <div class="filter-row" id="olChips"></div>
    <div class="tree" id="olTree"></div>
    <div class="panel-footer"><span id="olFoot">—</span><div class="spacer"></div><span id="olHits"></span></div>`;let i=e.querySelector(`#olTree`),a=e.querySelector(`#olSub`),o=e.querySelector(`#olChips`),s=e.querySelector(`#olSearch`),c=e.querySelector(`#olClear`),l=pd([`All types`,...Object.keys(Vl).filter(e=>e!==`folder`).map(e=>Vl[e].label)],`All types`,e=>{e===`All types`?r.clear():r.has(e)?r.delete(e):r.add(e),l._set(r.size===0?`All types`:r.size===1?[...r][0]:`${r.size} types`),T()},{width:118});e.querySelector(`#olFilter`).appendChild(l),s.addEventListener(`input`,()=>{n=s.value.trim().toLowerCase(),T()}),s.addEventListener(`keydown`,e=>{e.stopPropagation(),e.key===`Escape`&&(s.value=``,n=``,T())}),c.onclick=()=>{s.value=``,n=``,T(),s.focus()};let u=e.querySelector(`#olFold`);u.onclick=()=>{let e=Kl.some(e=>e.kids.length&&!e.open);Kl.forEach(t=>{t.kids.length&&(t.open=e||t.depth>0)}),e||Kl.forEach(e=>{e.depth===0&&(e.open=!1)}),u.classList.toggle(`on`,!e),T()};let d=e.querySelector(`#olAddWrap`),f=e.querySelector(`#olAddPop`);function p(){f.innerHTML=``;let e=Z(`div`,`vmhead`,`Add entity`);f.appendChild(e);let n=null;(t.addable?t.addable():[]).forEach(e=>{e.cat!==n&&(n=e.cat,f.appendChild(Z(`div`,`vmhead`,n)));let r=Z(`div`,`vmrow`,`<span class="tick"></span>${X(e.icon,{size:13,color:e.color})}<span>${e.label}</span>`);r.onclick=n=>{n.stopPropagation(),d.classList.remove(`open`),t.addEntity(e.key,null)},f.appendChild(r)})}e.querySelector(`#olAdd`).onclick=e=>{e.stopPropagation();let t=d.classList.contains(`open`);document.querySelectorAll(`.vm.open`).forEach(e=>e.classList.remove(`open`)),t||(p(),d.classList.add(`open`))};let m=e=>{let t=!n||e.name.toLowerCase().includes(n)||Xl(e).label.toLowerCase().includes(n),i=!r.size||r.has(Xl(e).label);return t&&i},h=e=>m(e)||e.kids.some(h),g=e=>{if(!n)return _(e);let t=e.toLowerCase().indexOf(n);return t<0?_(e):_(e.slice(0,t))+`<mark>`+_(e.slice(t,t+n.length))+`</mark>`+_(e.slice(t+n.length))},_=e=>e.replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]);function v(e,t){let n=t.nextElementSibling;if(!n||!n.classList.contains(`kids`))return;let r=t.querySelector(`.tw`);e.open=!e.open,r.classList.toggle(`open`,e.open);let i=n.scrollHeight;e.open?(n.classList.remove(`shut`),n.style.height=i+`px`,setTimeout(()=>{e.open&&(n.style.height=`auto`)},270)):(n.style.height=i+`px`,requestAnimationFrame(()=>{n.style.height=`0px`,n.classList.add(`shut`)}))}let y=null,b=Z(`div`);b.style.cssText=`position:fixed;height:2px;background:var(--hi);border-radius:2px;z-index:400;display:none;box-shadow:0 0 8px rgba(108,119,255,.9);pointer-events:none;`,document.body.appendChild(b);let x=Z(`div`);x.style.cssText=`position:fixed;z-index:401;pointer-events:none;display:none;background:rgba(20,20,20,.92);border:1px solid var(--stroke-strong);border-radius:999px;padding:5px 12px;font-size:11.5px;box-shadow:var(--shadow-pop);`,document.body.appendChild(x);let S=(e,t)=>{let n=t;for(;n;){if(n===e)return!0;n=n.parent}return!1},C=e=>{let t=e.parent?e.parent.kids:Gl;t.splice(t.indexOf(e),1)};function w(e,n){y={node:e,target:null,mode:null},x.textContent=e.name,x.style.display=`block`;let r=t=>{x.style.left=t.clientX+12+`px`,x.style.top=t.clientY+10+`px`;let n=document.elementFromPoint(t.clientX,t.clientY)?.closest(`.row`);if(b.style.display=`none`,i.querySelectorAll(`.row`).forEach(e=>e.style.background=``),y.target=null,!n||!n.dataset.id)return;let r=Kl.find(e=>e.id===+n.dataset.id);if(!r||S(e,r))return;let a=n.getBoundingClientRect(),o=(t.clientY-a.top)/a.height,s=Yl(r)?o<.25?`before`:o>.75?`after`:`inside`:o<.5?`before`:`after`;y.target=r,y.mode=s,s===`inside`?n.style.background=`rgba(108,119,255,.18)`:(b.style.display=`block`,b.style.left=a.left+`px`,b.style.width=a.width+`px`,b.style.top=(s===`before`?a.top:a.bottom)-1+`px`)},a=()=>{if(removeEventListener(`pointermove`,r),removeEventListener(`pointerup`,a),x.style.display=`none`,b.style.display=`none`,i.querySelectorAll(`.row`).forEach(e=>e.style.background=``),y?.target){let{node:e,target:n,mode:r}=y;if(C(e),r===`inside`)n.kids.push(e),n.open=!0;else{let t=n.parent?n.parent.kids:Gl,i=t.indexOf(n);t.splice(r===`before`?i:i+1,0,e)}ql(),t.toast(`Moved <b>${e.name}</b>`),vd.emit(`treechange`)}y=null};addEventListener(`pointermove`,r),addEventListener(`pointerup`,a),r(n)}function T(){ql(),i.innerHTML=``;let s=0,u=(e,i)=>e.forEach(e=>{if(!h(e))return;s++;let a=Xl(e),o=Z(`div`,`row`);o.dataset.id=e.id,t.selection.has(e.id)&&o.classList.add(`sel`),t.cursorId===e.id&&o.classList.add(`cursor`),(!e.vis||!iu(e))&&o.classList.add(`hidden-node`),e.locked&&o.classList.add(`locked`),o.style.paddingLeft=7+e.depth*15+`px`;let c=!e.kids.length,l=n||r.size?!0:e.open,d=Yl(e)&&e.props.tint||a.color;if(o.innerHTML=`<span class="tw ${c?`leaf`:``} ${l?`open`:``}">${X(`chev`,{size:12})}</span>
         <span class="ni">${X(a.icon,{size:14,color:d})}</span>
         <span class="nm">${g(e.name)}</span>
         ${Yl(e)?`<span class="badge count">${e.kids.length}</span>`:``}
         ${e.dynamic?`<span class="badge dyn">dyn</span>`:``}
         ${e.physics?`<span class="badge phys" title="Physics body">phys</span>`:``}
         <button class="st ${e.solo?`solo`:``}" data-a="solo" title="Isolate  (I)">${X(`solo`,{size:12})}</button>
         ${Yl(e)?``:`<button class="st ${e.locked?`act`:``}" data-a="lock" title="Lock">${X(e.locked?`lock`:`unlock`,{size:12})}</button>`}
         <button class="st ${e.vis?``:`off`}" data-a="vis" title="Visibility">${X(e.vis?`eye`:`eyeoff`,{size:12})}</button>`,c||(o.querySelector(`.tw`).onclick=t=>{t.stopPropagation(),v(e,o)}),o.querySelectorAll(`.st`).forEach(n=>n.onclick=r=>{r.stopPropagation();let i=n.dataset.a;if(i===`vis`&&(e.vis=!e.vis),i===`lock`&&(e.locked=!e.locked),i===`solo`){t.toggleIsolateNode(e);return}vd.emit(`treechange`)}),o.onclick=n=>t.select(e.id,{additive:n.ctrlKey||n.metaKey,range:n.shiftKey}),o.ondblclick=n=>{if(n.stopPropagation(),Yl(e)){v(e,o);return}t.focus(e)},o.oncontextmenu=n=>{n.preventDefault(),t.contextMenu(e,n)},o.addEventListener(`pointerdown`,t=>{if(t.button!==0||t.target.closest(`.st`)||t.target.closest(`.tw`))return;let n=t.clientX,r=t.clientY,i=t=>{Math.hypot(t.clientX-n,t.clientY-r)>6&&(removeEventListener(`pointermove`,i),removeEventListener(`pointerup`,a),w(e,t))},a=()=>{removeEventListener(`pointermove`,i),removeEventListener(`pointerup`,a)};addEventListener(`pointermove`,i),addEventListener(`pointerup`,a)}),o.querySelector(`.nm`).addEventListener(`dblclick`,t=>{t.stopPropagation(),md(e,o.querySelector(`.nm`),()=>{vd.emit(`treechange`)})}),i.appendChild(o),!c){let t=Z(`div`,`kids`+(l?``:` shut`));l||(t.style.height=`0px`),i.appendChild(t),u(e.kids,t)}});u(Gl,i),s||(i.innerHTML=`<div class="nohits">Nothing matches “${_(n)}”</div>`),i.querySelectorAll(`.kids:not(.shut)`).forEach(e=>e.style.height=`auto`);let d=Kl.filter(e=>!Yl(e)).length,f=Kl.filter(e=>!Yl(e)&&m(e)).length;a.textContent=`${d} entities · ${Gl.length} groups`,e.querySelector(`#olHits`).textContent=n||r.size?`${f} of ${d}`:``,e.querySelector(`#olFoot`).textContent=t.selection.size===0?`Nothing selected`:t.selection.size===1?`${Kl.find(e=>e.id===[...t.selection][0])?.name??``} selected`:`${t.selection.size} selected`,c.style.display=n?`grid`:`none`,o.innerHTML=[...r].map(e=>`<span class="pill">${e}<button class="px" data-t="${e}">✕</button></span>`).join(``),o.querySelectorAll(`.px`).forEach(e=>e.onclick=()=>{r.delete(e.dataset.t),l._set(r.size===0?`All types`:r.size===1?[...r][0]:`${r.size} types`),T()})}function E(e){let t=e.parent;for(;t;)t.open=!0,t=t.parent;T(),i.querySelector(`.row[data-id="${e.id}"]`)?.scrollIntoView({block:`nearest`,behavior:`smooth`})}return{render:T,revealNode:E,get query(){return n}}}function bd({value:e=0,min:t=-1/0,max:n=1/0,dec:r=2,step:i=.1,unit:a=``,onInput:o}){let s=Z(`div`,`step`);s.innerHTML=`<button class="mn" tabindex="-1">−</button>
    <span class="f"><input value="${sd(e,r)}"><i>${a}</i></span>
    <button class="pl" tabindex="-1">+</button>`;let c=s.querySelector(`input`),l=od(e,t,n),u=()=>{document.activeElement!==c&&(c.value=sd(l,r))},d=(e,r=!0)=>{l=od(e,t,n),u(),r&&o&&o(l)};return s.querySelector(`.mn`).onclick=()=>d(l-i),s.querySelector(`.pl`).onclick=()=>d(l+i),c.onkeydown=e=>{e.stopPropagation(),e.key===`Enter`&&c.blur(),e.key===`ArrowUp`&&(e.preventDefault(),d(l+i)),e.key===`ArrowDown`&&(e.preventDefault(),d(l-i))},c.onblur=()=>{let e=parseFloat(c.value);isFinite(e)?d(e):u()},s._set=e=>d(e,!1),s}function Q({label:e,min:t=0,max:n=1,value:r=0,dec:i=2,step:a,unit:o=``,marks:s,height:c=30,toPos:l,fromPos:u,tint:d,onInput:f}){let p=Z(`div`,`tape`),m=Z(`div`,`hd`,`<span class="k">${e}</span>`),h=bd({value:r,min:t,max:n,dec:i,unit:o,step:a??+((n-t)/100).toPrecision(1),onInput:e=>S(e)});m.appendChild(h);let g=Z(`canvas`);p.append(m,g);let _=od(r,t,n),v=e=>l?l(e,t,n):(e-t)/(n-t||1),y=e=>u?u(e,t,n):t+e*(n-t),b=g.getContext(`2d`);function x(){let e=p.clientWidth||260,r=c,a=Math.min(devicePixelRatio||1,2);(g.width!==e*a||g.height!==r*a)&&(g.width=e*a,g.height=r*a),g.style.height=r+`px`,b.setTransform(a,0,0,a,0,0),b.clearRect(0,0,e,r);let o=e-16,l=r-11;b.font=`8px ui-sans-serif, system-ui`;for(let e=0;e<=40;e++){let t=e/40,n=e%10==0,r=t<=v(_);b.strokeStyle=n?`rgba(255,255,255,.30)`:`rgba(255,255,255,${r?.22:.09})`,b.lineWidth=1;let i=n?9:e%5==0?6:4,a=8+t*o;b.beginPath(),b.moveTo(a,l-i),b.lineTo(a,l),b.stroke()}b.strokeStyle=`rgba(255,255,255,.10)`,b.beginPath(),b.moveTo(8,l+.5),b.lineTo(8+o,l+.5),b.stroke();let u=s||[{t:0,l:sd(t,i)},{t:1,l:sd(n,i)}];b.fillStyle=`rgba(255,255,255,.28)`;let f=[];u.forEach(({t:e,l:t})=>{let n=8+e*o,i=b.measureText(t).width,a=e<=0?n:e>=1?n-i:n-i/2,s=a+i;f.some(([e,t])=>a<t+5&&s>e-5)||(f.push([a,s]),b.textAlign=e<=0?`left`:e>=1?`right`:`center`,b.fillText(t,n,r-1))});let m=8+v(_)*o;b.fillStyle=d||`#fff`,b.beginPath(),b.moveTo(m,l-13),b.lineTo(m+4,l-19),b.lineTo(m-4,l-19),b.closePath(),b.fill(),b.strokeStyle=d||`rgba(255,255,255,.85)`,b.lineWidth=1.4,b.beginPath(),b.moveTo(m,l-12),b.lineTo(m,l),b.stroke()}let S=(e,r=!0)=>{_=od(e,t,n),h._set(_),x(),r&&f&&f(_)},C=e=>{let t=g.getBoundingClientRect(),n=Math.max(1,t.width-16);S(y(od((e.clientX-t.left-8)/n,0,1)))};return g.addEventListener(`pointerdown`,e=>{g.setPointerCapture(e.pointerId),g.classList.add(`drag`),C(e)}),g.addEventListener(`pointermove`,e=>{g.hasPointerCapture?.(e.pointerId)&&C(e)}),g.addEventListener(`pointerup`,e=>{g.releasePointerCapture?.(e.pointerId),g.classList.remove(`drag`)}),g.addEventListener(`wheel`,e=>{e.preventDefault(),S(_-Math.sign(e.deltaY)*(n-t)/100)},{passive:!1}),p._set=e=>{_=od(e,t,n),h._set(_),x()},p._paint=x,requestAnimationFrame(x),p}function xd(e,t,n){let r=Z(`button`,`mp-tag state${t?` on`:``}`,`<i></i>${e}`);return r.onclick=()=>{let e=!r.classList.contains(`on`);r.classList.toggle(`on`,e),n(e)},r._set=e=>r.classList.toggle(`on`,!!e),r}function Sd(e){let t=Z(`div`,`mp-spec`);return e.forEach(([e,n])=>t.insertAdjacentHTML(`beforeend`,`<div><span class="k">${e}</span><b>${n}</b></div>`)),t}var Cd=e=>(1-Math.cos(2*Math.PI*e))/2;function wd(e){let t=(e%1+1)%1;return t<.035||t>=.965?`New moon`:t<.215?`Waxing crescent`:t<.285?`First quarter`:t<.465?`Waxing gibbous`:t<.535?`Full moon`:t<.715?`Waning gibbous`:t<.785?`Last quarter`:`Waning crescent`}var Td=[`N`,`NNE`,`NE`,`ENE`,`E`,`ESE`,`SE`,`SSE`,`S`,`SSW`,`SW`,`WSW`,`W`,`WNW`,`NW`,`NNW`],Ed=e=>Td[Math.round((e%360+360)%360/22.5)%16],Dd=e=>18+(e-90)/15;function Od(e,t){let n=Math.asin(Math.max(-58,Math.min(58,e))/58)*12/Math.PI,r=[18+n,18+(12-n)].map(e=>(e%24+24)%24),i=e=>{let n=Math.abs(e-t);return Math.min(n,24-n)};return i(r[0])<=i(r[1])?r[0]:r[1]}var kd=(e,t)=>{let n=parseInt((e||`#d8e2f2`).slice(1),16);return`rgba(${n>>16&255},${n>>8&255},${n&255},${t})`},Ad=[[-.28,-.22,.2],[.16,-.34,.13],[.34,.12,.17],[-.14,.34,.15],[-.46,.1,.1],[.05,.05,.11],[.44,-.3,.08],[-.02,-.55,.07]];function jd(e,t,n,r,{phase:i=.5,tint:a=`#d8e2f2`,earthshine:o=.16,brightness:s=1}){let c=(i%1+1)%1,l=c<.5,u=Math.cos(2*Math.PI*c)*r,d=Cd(c);if(d>.02){let i=e.createRadialGradient(t,n,r*.8,t,n,r*(2.6+s));i.addColorStop(0,kd(a,.2*d*Math.min(s,2))),i.addColorStop(1,kd(a,0)),e.fillStyle=i,e.beginPath(),e.arc(t,n,r*(2.6+s),0,Math.PI*2),e.fill()}if(e.save(),e.beginPath(),e.arc(t,n,r,0,Math.PI*2),e.clip(),e.fillStyle=kd(a,.06+o*.5),e.fillRect(t-r,n-r,r*2,r*2),d>.005){e.save(),l||(e.translate(t,0),e.scale(-1,1),e.translate(-t,0)),e.beginPath(),e.arc(t,n,r,-Math.PI/2,Math.PI/2,!1),e.ellipse(t,n,Math.abs(u),r,0,Math.PI/2,-Math.PI/2,u>0),e.closePath();let i=e.createLinearGradient(t-r,n-r,t+r,n+r);i.addColorStop(0,kd(a,Math.min(1,.72*s))),i.addColorStop(1,kd(a,Math.min(1,.98*s))),e.fillStyle=i,e.fill(),e.restore()}Ad.forEach(([i,a,o],s)=>{let c=t+i*r,d=n+a*r,f=l?c-t>u*-1:t-c>u*-1;e.beginPath(),e.arc(c,d,o*r,0,Math.PI*2),e.fillStyle=`rgba(20,26,40,${(f?.13:.05)+s%3*.015})`,e.fill()}),e.restore(),e.beginPath(),e.arc(t,n,r,0,Math.PI*2),e.strokeStyle=kd(a,.16+.2*d),e.lineWidth=1,e.stroke()}function Md(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=Z(`div`,`mpanel`),s=[],c=(e,t,n)=>e.addEventListener(t,n),l=(e,t)=>{let n=(Dd(a.azimuth??292)%24+24)%24,r=t==null?Od(e,n):Dd(t);vd.emit(`settod`,(r%24+24)%24)},u=Z(`div`,`pcard mp-hero`),d=Z(`canvas`,`mp-sky`);d.title=`Drag left and right to walk the phase`;let f=Z(`div`,`mp-cap`,`<div class="l"><b class="mp-name">—</b><span class="mp-illum">—</span></div>
     <div class="r"><span class="mp-alt">—</span></div>`);u.append(d,f),o.appendChild(u);let p=Z(`div`,`mp-rail`),m=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return p.appendChild(t),t.querySelector(`.v`)},h=m(`Lit`),g=m(`Age`),_=m(`Alt`),v=m(`Bearing`);v.parentElement.classList.add(`wide`),o.appendChild(p);let y=Z(`div`,`mp-duo`),b=(e,t)=>{let n=Z(`div`,`pcard mp-stat`,`<span class="i">${e}</span><span class="l">${t}</span><b class="n">—</b>`);return y.appendChild(n),n},x=b(X(`check`,{size:12}),`Above horizon`),S=b(X(`moon`,{size:12}),`Moonlight`);o.appendChild(y);let C=Z(`div`,`pcard mp-metric`);C.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Illumination</span></div>
      <button class="mp-x" title="Taller chart">${X(`arrowout`,{size:12})}</button>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">%</span></div>
    <div class="mp-k mp-target">Peak <span class="v">100% at full</span></div>`;let w=Z(`div`,`mp-chartwrap`),T=Z(`canvas`);w.appendChild(T),C.appendChild(w),C.querySelector(`.mp-x`).onclick=()=>{C.classList.toggle(`tall`),O()},o.appendChild(C);let E=C.querySelector(`.mp-num .i`),D=C.querySelector(`.mp-num .d`);function O(){let e=w.clientWidth||280,t=C.classList.contains(`tall`)?168:104,n=Math.min(devicePixelRatio||1,2);(T.width!==e*n||T.height!==t*n)&&(T.width=e*n,T.height=t*n),T.style.height=t+`px`;let r=T.getContext(`2d`);r.setTransform(n,0,0,n,0,0),r.clearRect(0,0,e,t);let i=t=>2+t*(e-2-34),o=e=>8+(1-e)*(t-8-16);r.font=`9px ui-sans-serif, system-ui`,[.25,.5,.75,1].forEach(t=>{r.strokeStyle=t===1?`rgba(255,255,255,.16)`:`rgba(255,255,255,.07)`,r.setLineDash(t===1?[4,4]:[2,5]),r.beginPath(),r.moveTo(i(0),o(t)),r.lineTo(i(1),o(t)),r.stroke(),r.setLineDash([]),r.fillStyle=`rgba(255,255,255,.30)`,r.textAlign=`left`,r.fillText(`${t*100}%`,e-34+7,o(t)+3)});let s=((a.phase??.68)%1+1)%1,c=Math.max(10,(e-2-34)*.055);r.fillStyle=`rgba(255,255,255,.05)`,r.fillRect(i(s)-c/2,8,c,t-8-16);let l=Math.min(1,(a.brightness??1.1)/2);r.strokeStyle=`rgba(255,255,255,.14)`,r.lineWidth=1,r.beginPath();for(let e=0;e<=120;e++){let t=e/120,n=Cd(t)*l;e?r.lineTo(i(t),o(n)):r.moveTo(i(t),o(n))}r.stroke(),r.lineWidth=1.6;for(let e=0;e<120;e++){let t=e/120,n=(e+1)/120,a=Cd(t),s=Cd(n);r.strokeStyle=Math.min(a,s)<.08?`rgba(245,158,11,.85)`:`rgba(232,238,255,.75)`,r.beginPath(),r.moveTo(i(t),o(a)),r.lineTo(i(n),o(s)),r.stroke()}let u=[[0,`NEW`],[.25,`1Q`],[.5,`FULL`],[.75,`3Q`],[1,`NEW`]];r.fillStyle=`rgba(255,255,255,.26)`,u.forEach(([e,n],a)=>{r.strokeStyle=`rgba(255,255,255,.10)`,r.beginPath(),r.moveTo(i(e),o(0)),r.lineTo(i(e),o(0)+4),r.stroke(),r.textAlign=a===0?`left`:a===u.length-1?`right`:`center`,r.fillText(n,i(e),t-4)});let d=Cd(s);r.fillStyle=`#fff`,r.beginPath(),r.arc(i(s),o(d),3,0,Math.PI*2),r.fill(),r.strokeStyle=`rgba(255,255,255,.25)`,r.beginPath(),r.moveTo(i(s),o(d)+4),r.lineTo(i(s),o(0)),r.stroke()}let k=[[-57,16,23,27,`PROCELLARUM`],[-16,33,19,13,`IMBRIUM`],[18,28,12,10,`SERENITATIS`],[31,7,13,11,`TRANQUILLITATIS`],[59,17,8,7,`CRISIUM`],[52,-8,10,10,`FECUNDITATIS`],[34,-15,6,6,`NECTARIS`],[-17,-21,11,8,`NUBIUM`],[-39,-24,7,7,`HUMORUM`],[4,13,5,4,`VAPORUM`],[-5,55,32,5,`FRIGORIS`]],A=[[-11,-43,`TYCHO`],[-20,10,`COPERNICUS`],[-2,-2,``],[23,-44,``],[-48,-12,``]],j=Z(`div`,`pcard mp-atlas`);j.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Atlas</span><span class="s">Near side · selenographic grid</span></div>
      <button class="mp-x" title="Taller atlas">${X(`arrowout`,{size:12})}</button>
    </div>`;let M=Z(`div`,`mp-map`),N=Z(`canvas`);N.title=`Drag to walk the terminator across the face`,M.appendChild(N);let P=Z(`div`,`mp-read`,``);M.appendChild(P),j.appendChild(M);let F={grid:!0,labels:!0,term:!0},I=Z(`div`,`mp-tags`);Object.keys(F).forEach(e=>{let t=Z(`button`,`mp-tag on`,e===`term`?`TERMINATOR`:e.toUpperCase());t.onclick=()=>{F[e]=!F[e],t.classList.toggle(`on`,F[e]),R()},I.appendChild(t)}),j.appendChild(I),j.querySelector(`.mp-x`).onclick=()=>{j.classList.toggle(`tall`),R()},o.appendChild(j);let L=e=>180-360*((e%1+1)%1);function R(){let e=M.clientWidth||280,t=j.classList.contains(`tall`)?214:148,n=Math.min(devicePixelRatio||1,2);(N.width!==e*n||N.height!==t*n)&&(N.width=e*n,N.height=t*n),N.style.height=t+`px`;let r=N.getContext(`2d`);r.setTransform(n,0,0,n,0,0),r.clearRect(0,0,e,t);let i=t=>(t+90)/180*e,o=e=>(62-e)/124*t,s=r.createLinearGradient(0,0,0,t);if(s.addColorStop(0,`#171a20`),s.addColorStop(.5,`#1d2027`),s.addColorStop(1,`#141619`),r.fillStyle=s,r.fillRect(0,0,e,t),k.forEach(([n,a,s,c],l)=>{let u=i(n),d=o(a),f=r.createRadialGradient(u,d,0,u,d,Math.max(s/180*e,c/124*t));f.addColorStop(0,`rgba(8,10,16,${.62-l%3*.06})`),f.addColorStop(1,`rgba(8,10,16,0)`),r.save(),r.translate(u,d),r.scale(1,c/124*t/(s/180*e)),r.fillStyle=f,r.beginPath(),r.arc(0,0,s/180*e,0,Math.PI*2),r.fill(),r.restore()}),A.forEach(([e,t,n])=>{let a=i(e),s=o(t);if(r.strokeStyle=`rgba(255,255,255,.18)`,r.lineWidth=1,r.beginPath(),r.arc(a,s,n===`TYCHO`?4.5:3.2,0,Math.PI*2),r.stroke(),n===`TYCHO`){r.strokeStyle=`rgba(255,255,255,.07)`;for(let e=0;e<9;e++){let t=e/9*Math.PI*2+.3;r.beginPath(),r.moveTo(a+Math.cos(t)*6,s+Math.sin(t)*6),r.lineTo(a+Math.cos(t)*(26+e%3*12),s+Math.sin(t)*(18+e%3*9)),r.stroke()}}}),F.grid){r.font=`8px ui-sans-serif, system-ui`;for(let e=-90;e<=90;e+=15){let n=e%45==0;r.strokeStyle=e===0?`rgba(255,255,255,.20)`:`rgba(255,255,255,${n?.11:.05})`,r.setLineDash(e===0?[]:[2,4]),r.beginPath(),r.moveTo(i(e),0),r.lineTo(i(e),t),r.stroke(),n&&(r.setLineDash([]),r.fillStyle=`rgba(255,255,255,.34)`,r.textAlign=e<=-90?`left`:e>=90?`right`:`center`,r.fillText(e===0?`0°`:`${Math.abs(e)}°${e<0?`W`:`E`}`,i(e),t-5))}for(let t=-60;t<=60;t+=15){let n=t%30==0;r.strokeStyle=t===0?`rgba(255,255,255,.20)`:`rgba(255,255,255,${n?.11:.05})`,r.setLineDash(t===0?[]:[2,4]),r.beginPath(),r.moveTo(0,o(t)),r.lineTo(e,o(t)),r.stroke(),n&&t!==0&&(r.setLineDash([]),r.fillStyle=`rgba(255,255,255,.34)`,r.textAlign=`left`,r.fillText(`${t>0?`+`:`−`}${Math.abs(t)}`,4,o(t)-3))}r.setLineDash([])}F.labels&&e>250&&(r.font=`7.5px ui-sans-serif, system-ui`,r.textAlign=`center`,k.forEach(([e,t,n,,a])=>{n<11||(r.fillStyle=`rgba(226,234,255,.40)`,r.fillText(a,i(e),o(t)+2))}),r.fillStyle=`rgba(226,234,255,.32)`,r.fillText(`TYCHO`,i(-11),o(-43)+13));let c=L(a.phase??.68);for(let n=0;n<e;n++){let i=n/e*180-90,a=Math.cos((i-c)*Math.PI/180);r.fillStyle=`rgba(3,5,11,${(.9*Math.max(0,Math.min(1,1-Math.max(0,a)**.55))).toFixed(3)})`,r.fillRect(n,0,1.02,t)}if(F.term)for(let e of[c-90,c+90])e<-92||e>92||(r.strokeStyle=`rgba(160,190,255,.55)`,r.lineWidth=1,r.setLineDash([5,4]),r.beginPath(),r.moveTo(i(e),0),r.lineTo(i(e),t),r.stroke(),r.setLineDash([]));if(Math.abs(c)<=90){let e=i(c),t=o(0);r.strokeStyle=`rgba(255,214,140,.9)`,r.beginPath(),r.arc(e,t,4.5,0,Math.PI*2),r.stroke(),r.beginPath(),r.moveTo(e-9,t),r.lineTo(e-6,t),r.moveTo(e+6,t),r.lineTo(e+9,t),r.moveTo(e,t-9),r.lineTo(e,t-6),r.moveTo(e,t+6),r.lineTo(e,t+9),r.stroke()}let l=i(0),u=o(0);r.strokeStyle=`rgba(255,255,255,.8)`,r.lineWidth=1.4,r.beginPath(),r.moveTo(l-5,u),r.lineTo(l+5,u),r.moveTo(l,u-5),r.lineTo(l,u+5),r.stroke(),r.fillStyle=`rgba(255,255,255,.9)`,r.beginPath(),r.arc(l,u,1.7,0,Math.PI*2),r.fill(),P.innerHTML=`<span class="k">sub-earth</span><b>0.0°N 0.0°E</b><span class="k">sub-solar</span><b>${c>=0?``:`−`}${Math.abs(c).toFixed(1)}°${c<0?`W`:`E`}</b>`}let ee=(e,t)=>{let n=n=>{let r=e.getBoundingClientRect();t(Math.max(0,Math.min(1,(n.clientX-r.left)/r.width)),n)};c(e,`pointerdown`,t=>{e.setPointerCapture(t.pointerId),e.classList.add(`grabbing`),n(t)}),c(e,`pointermove`,t=>{e.hasPointerCapture?.(t.pointerId)&&n(t)}),c(e,`pointerup`,t=>{e.releasePointerCapture?.(t.pointerId),e.classList.remove(`grabbing`)})},te=null;c(N,`pointerdown`,e=>{N.setPointerCapture(e.pointerId),te={x:e.clientX,p:a.phase??.68},N.classList.add(`grabbing`)}),c(N,`pointermove`,t=>{if(!te)return;let n=((te.p-(t.clientX-te.x)/(N.clientWidth||280)*.5)%1+1)%1;r(e,`phase`,+n.toFixed(4)),it()});let z=()=>{te=null,N.classList.remove(`grabbing`)};c(N,`pointerup`,z),c(N,`pointercancel`,z);let ne=d.getContext(`2d`);function re(){let e=d.clientWidth||300,t=n?116:138,r=Math.min(devicePixelRatio||1,2);(d.width!==e*r||d.height!==t*r)&&(d.width=e*r,d.height=t*r),d.style.height=t+`px`,ne.setTransform(r,0,0,r,0,0),ne.clearRect(0,0,e,t);let i=a.elevation??46,o=Math.max(-1,Math.min(1,i/60)),s=t-22,c=ne.createLinearGradient(0,0,0,t);c.addColorStop(0,`#05070f`),c.addColorStop(.62,`#0a1020`),c.addColorStop(1,`#141c2c`),ne.fillStyle=c,ne.fillRect(0,0,e,t);for(let t=0;t<46;t++){let n=t*977%1e3/1e3*e,r=t*613%1e3/1e3*s,i=t*37%10/10;ne.fillStyle=`rgba(210,224,255,${.1+i*.35})`,ne.fillRect(n,r,1.1,1.1)}let l=ne.createLinearGradient(0,s-26,0,s);l.addColorStop(0,`rgba(90,120,180,0)`),l.addColorStop(1,`rgba(120,150,205,.16)`),ne.fillStyle=l,ne.fillRect(0,s-26,e,26),ne.fillStyle=`#070a11`,ne.fillRect(0,s,e,t-s),ne.strokeStyle=`rgba(255,255,255,.10)`,ne.beginPath(),ne.moveTo(0,s+.5),ne.lineTo(e,s+.5),ne.stroke();let u=Math.max(13,Math.min(30,9+(a.angular??1.6)*8)),f=e*(.18+(a.azimuth??292)%360/360*.64),p=s-14-o*(s-34);jd(ne,f,p,u,{phase:a.phase??.68,tint:a.tint,earthshine:a.earthshine??.16,brightness:a.brightness??1.1}),i<0&&(ne.fillStyle=`rgba(4,6,11,.72)`,ne.fillRect(0,s,e,t-s),ne.fillStyle=`rgba(4,6,11,.55)`,ne.fillRect(0,0,e,t))}let B=f.querySelector(`.mp-name`),V=f.querySelector(`.mp-illum`),H=f.querySelector(`.mp-alt`);function ie(){let e=a.phase??.68;B.textContent=wd(e),V.textContent=`${Math.round(Cd(e)*100)}% lit`;let t=a.elevation??46,n=a.azimuth??292;H.innerHTML=t<0?`<span class="down">below the horizon</span> · ${Ed(n)}`:`${t.toFixed(0)}° above · ${Ed(n)} ${Math.round(n)}°`}let ae=null;c(d,`pointerdown`,e=>{d.setPointerCapture(e.pointerId),ae={x:e.clientX,p:a.phase??.68},d.classList.add(`grabbing`)}),c(d,`pointermove`,t=>{if(!ae)return;let n=d.clientWidth||300,i=((ae.p+(t.clientX-ae.x)/n)%1+1)%1;r(e,`phase`,+i.toFixed(4)),it()});let oe=()=>{ae=null,d.classList.remove(`grabbing`)};c(d,`pointerup`,oe),c(d,`pointercancel`,oe);let se=Z(`div`,`pcard mp-phase`);se.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Phase</span><span class="s">—</span></div>
      <button class="mp-x" title="Jump to full">${X(`arrowout`,{size:12})}</button>
    </div>`;let ce=Z(`div`,`pbody`);se.appendChild(ce),se.querySelector(`.mp-chead .l`).onclick=()=>se.classList.toggle(`shut`),se.querySelector(`.mp-x`).onclick=()=>{r(e,`phase`,.5),it()};let le=se.querySelector(`.mp-chead .s`),ue=Z(`div`,`mp-strip`),de=[0,.125,.25,.375,.5,.625,.75,.875].map(t=>{let n=Z(`button`,`mp-chip`);n.title=wd(t);let i=Z(`canvas`);i.width=68,i.height=68,n.appendChild(i);let o=i.getContext(`2d`);return o.setTransform(2,0,0,2,0,0),jd(o,17,17,12,{phase:t,tint:a.tint,earthshine:.14,brightness:1}),n.onclick=()=>{r(e,`phase`,t),it()},ue.appendChild(n),{b:n,v:t}});ce.appendChild(ue);let U=Z(`div`,`mp-tl`),fe=Z(`canvas`);U.appendChild(fe);let pe=Z(`div`,`mp-tllbl`,`<span>NEW</span><span>FULL</span><span>NEW</span>`);ce.append(U,pe);function me(){let e=U.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(fe.width!==e*t||fe.height!==26*t)&&(fe.width=e*t,fe.height=26*t),fe.style.height=`26px`;let n=fe.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,26);let r=e-18,i=Math.max(1,Math.round(a.period??27.3));n.fillStyle=`rgba(255,255,255,.22)`,n.beginPath(),n.arc(3.5,13,2.2,0,Math.PI*2),n.fill(),n.beginPath(),n.arc(e-3.5,13,2.2,0,Math.PI*2),n.fill();for(let e=0;e<=i;e++){let t=e/i,a=9+t*r,o=Math.abs(t*4%1)<.02||Math.abs(t*4%1)>.98;n.strokeStyle=o?`rgba(255,255,255,.34)`:`rgba(255,255,255,.14)`,n.lineWidth=1;let s=o?9:5;n.beginPath(),n.moveTo(a,13-s/2),n.lineTo(a,13+s/2),n.stroke()}let o=((a.phase??.68)%1+1)%1,s=9+o*r;n.fillStyle=`rgba(18,18,18,.96)`,n.strokeStyle=`rgba(255,255,255,.16)`,n.beginPath(),n.roundRect(Math.max(0,Math.min(e-30,s-15)),3,30,20,10),n.fill(),n.stroke(),jd(n,Math.max(15,Math.min(e-15,s)),13,6.4,{phase:o,tint:a.tint,earthshine:.18,brightness:1})}ee(U,t=>{r(e,`phase`,+t.toFixed(4)),it()});let he=bd({value:a.phase??.68,min:0,max:1,dec:3,step:.005,onInput:t=>{r(e,`phase`,t),it()}}),ge=Z(`div`,`mp-subhead`,`<span class="k">phase</span>`);ge.appendChild(he),ce.appendChild(ge);let _e=Q({label:`Cycle length`,min:1,max:60,value:a.period??27.3,dec:1,unit:`d`,step:.1,marks:[{t:0,l:`1 d`},{t:27.3/59,l:`LUNAR 27.3`},{t:1,l:`60 d`}],onInput:t=>{r(e,`period`,t),it()}});ce.appendChild(_e);let ve=Z(`div`,`mp-note`,``);ce.appendChild(ve),o.appendChild(se);let ye=Z(`div`,`pcard mp-track2`);ye.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Sky track</span><span class="s">Tonight's arc · noon to noon</span></div>
      <button class="mp-x" title="Taller arc">${X(`arrowout`,{size:12})}</button>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">°</span></div>
    <div class="mp-k mp-target">Bearing <span class="v">—</span></div>`;let be=Z(`div`,`pbody`);ye.appendChild(be),ye.querySelector(`.mp-chead .l`).onclick=()=>ye.classList.toggle(`shut`),ye.querySelector(`.mp-x`).onclick=()=>{ye.classList.toggle(`tall`),Ee()};let xe=ye.querySelector(`.mp-num .i`),Se=ye.querySelector(`.mp-num .d`),Ce=ye.querySelector(`.mp-target .v`),we=Z(`div`,`mp-chartwrap`),W=Z(`canvas`);we.appendChild(W),be.appendChild(we);let Te=e=>58*Math.sin((e-18)/12*Math.PI);function Ee(){let e=we.clientWidth||280,t=ye.classList.contains(`tall`)?168:108,n=Math.min(devicePixelRatio||1,2);(W.width!==e*n||W.height!==t*n)&&(W.width=e*n,W.height=t*n),W.style.height=t+`px`;let r=W.getContext(`2d`);r.setTransform(n,0,0,n,0,0),r.clearRect(0,0,e,t);let i=t=>2+t*(e-2-30),o=e=>8+(1-(e+66)/132)*(t-8-15);r.font=`9px ui-sans-serif, system-ui`,[60,30,0,-30,-60].forEach(t=>{let n=t===0;r.strokeStyle=n?`rgba(255,255,255,.24)`:`rgba(255,255,255,.06)`,r.setLineDash(n?[]:[2,5]),r.beginPath(),r.moveTo(i(0),o(t)),r.lineTo(i(1),o(t)),r.stroke(),r.setLineDash([]),r.fillStyle=n?`rgba(255,255,255,.40)`:`rgba(255,255,255,.26)`,r.textAlign=`left`,r.fillText(n?`0°`:`${t>0?`+`:`−`}${Math.abs(t)}`,e-30+6,o(t)+3)}),r.fillStyle=`rgba(255,255,255,.022)`,r.fillRect(i(0),o(0),i(1)-i(0),o(-66)-o(0));let s=(Dd(a.azimuth??292)%24+24)%24,c=e=>((e-12)%24+24)%24/24;for(let e=0;e<144;e++){let t=e/144,n=(e+1)/144,a=Te(12+t*24),s=Te(12+n*24),c=Math.min(a,s)>=0;r.strokeStyle=c?`rgba(232,238,255,.8)`:`rgba(255,255,255,.16)`,r.lineWidth=c?1.7:1,r.beginPath(),r.moveTo(i(t),o(a)),r.lineTo(i(n),o(s)),r.stroke()}[[18,`RISE`],[6,`SET`]].forEach(([e,t])=>{let n=i(c(e));r.fillStyle=`rgba(255,255,255,.55)`,r.beginPath(),r.arc(n,o(0),2.4,0,Math.PI*2),r.fill(),r.font=`8px ui-sans-serif, system-ui`,r.textAlign=`center`,r.fillStyle=`rgba(255,255,255,.34)`,r.fillText(t,n,o(0)+12),r.font=`9px ui-sans-serif, system-ui`}),r.fillStyle=`rgba(255,255,255,.26)`,[[0,`12:00`],[.25,`18:00`],[.5,`00:00`],[.75,`06:00`],[1,`12:00`]].forEach(([e,n],a)=>{r.strokeStyle=`rgba(255,255,255,.09)`,r.beginPath(),r.moveTo(i(e),8),r.lineTo(i(e),o(-66)),r.stroke(),r.textAlign=a===0?`left`:a===4?`right`:`center`,r.fillText(n,i(e),t-3)});let l=c(s),u=a.elevation??Te(s),d=Math.max(8,(e-2-30)*.04);r.fillStyle=`rgba(255,255,255,.05)`,r.fillRect(i(l)-d/2,8,d,o(-66)-8),r.strokeStyle=`rgba(255,255,255,.22)`,r.beginPath(),r.moveTo(i(l),o(u)),r.lineTo(i(l),o(0)),r.stroke(),jd(r,i(l),o(u),5.6,{phase:a.phase??.68,tint:a.tint,earthshine:.2,brightness:1})}let De=e=>{let t=W.getBoundingClientRect(),n=Math.max(0,Math.min(1,(e.clientX-t.left-2)/Math.max(1,t.width-2-30)));vd.emit(`settod`,(12+n*24)%24)};c(W,`pointerdown`,e=>{W.setPointerCapture(e.pointerId),W.classList.add(`drag`),De(e)}),c(W,`pointermove`,e=>{W.hasPointerCapture?.(e.pointerId)&&De(e)}),c(W,`pointerup`,e=>{W.releasePointerCapture?.(e.pointerId),W.classList.remove(`drag`)});let G=Q({label:`Bearing`,min:0,max:360,value:((a.azimuth??292)%360+360)%360,dec:0,unit:`°`,step:1,marks:[{t:0,l:`N`},{t:.25,l:`E`},{t:.5,l:`S`},{t:.75,l:`W`},{t:1,l:`N`}],onInput:e=>l(null,e)});be.appendChild(G);let Oe=Z(`div`,`mp-3up`);be.appendChild(Oe);let K=Z(`div`,`mp-tl`),ke=Z(`canvas`);K.appendChild(ke);let Ae=Z(`div`,`mp-tllbl`,`<span>12:00</span><span>MIDNIGHT</span><span>12:00</span>`);be.append(K,Ae);function je(){let e=K.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(ke.width!==e*t||ke.height!==26*t)&&(ke.width=e*t,ke.height=26*t),ke.style.height=`26px`;let n=ke.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,26);let r=e-18;n.fillStyle=`rgba(255,255,255,.22)`,n.beginPath(),n.arc(3.5,13,2.2,0,Math.PI*2),n.fill(),n.beginPath(),n.arc(e-3.5,13,2.2,0,Math.PI*2),n.fill();for(let e=0;e<=24;e++){let t=e/24,i=9+t*r,a=e%6==0,o=Te(12+t*24)>=0;n.strokeStyle=a?`rgba(255,255,255,.34)`:`rgba(255,255,255,${o?.2:.08})`;let s=a?9:5;n.beginPath(),n.moveTo(i,13-s/2),n.lineTo(i,13+s/2),n.stroke()}let i=9+(((Dd(a.azimuth??292)%24+24)%24-12)%24+24)%24/24*r;n.fillStyle=`rgba(18,18,18,.96)`,n.strokeStyle=`rgba(255,255,255,.16)`,n.beginPath(),n.roundRect(Math.max(0,Math.min(e-30,i-15)),3,30,20,10),n.fill(),n.stroke(),jd(n,Math.max(15,Math.min(e-15,i)),13,6.4,{phase:a.phase??.68,tint:a.tint,earthshine:.18,brightness:1})}ee(K,e=>vd.emit(`settod`,(12+e*24)%24)),o.appendChild(ye);let Me=Z(`div`,`pcard mp-light`);Me.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Light</span><span class="s">Output · colour · scale</span></div>
      <button class="mp-x" title="Taller scale">${X(`arrowout`,{size:12})}</button>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">lx</span></div>
    <div class="mp-k mp-target">On the ground <span class="v">—</span></div>`;let Ne=Z(`div`,`pbody`);Me.appendChild(Ne),Me.querySelector(`.mp-chead .l`).onclick=()=>Me.classList.toggle(`shut`);let Pe=Me.querySelector(`.mp-num .i`),Fe=Me.querySelector(`.mp-num .d`),Ie=Me.querySelector(`.mp-target .v`),Le=Z(`div`,`mp-meter`);Le.innerHTML=`<div class="hd"><span class="k">moonlight</span></div>`;let Re=Z(`canvas`);Le.appendChild(Re);let ze=bd({value:a.moonlight??.35,min:0,max:2,dec:2,step:.01,unit:`lx`,onInput:t=>{r(e,`moonlight`,t),it()}});Le.querySelector(`.hd`).appendChild(ze),Ne.appendChild(Le);let Be=[[5e-4,`STARLIGHT`],[.05,`WALK`],[.25,`READ`],[1,`PRINT`],[2,``]],Ve=e=>{let t=Math.log10(5e-4),n=Math.log10(2);return Math.max(0,Math.min(1,(Math.log10(Math.max(5e-4,e))-t)/(n-t)))},He=t=>{let n=Re.getBoundingClientRect(),i=Math.max(1,n.width-16),o=Math.max(0,Math.min(1,(t.clientX-n.left-8)/i)),s=Math.log10(5e-4),c=10**(s+o*(Math.log10(2)-s)),l=Math.max(.02,Cd(a.phase??.68));r(e,`moonlight`,+Math.min(2,c/l).toFixed(3)),it()};c(Re,`pointerdown`,e=>{Re.setPointerCapture(e.pointerId),Re.classList.add(`drag`),He(e)}),c(Re,`pointermove`,e=>{Re.hasPointerCapture?.(e.pointerId)&&He(e)}),c(Re,`pointerup`,e=>{Re.releasePointerCapture?.(e.pointerId),Re.classList.remove(`drag`)});function Ue(){let e=Le.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(Re.width!==e*t||Re.height!==40*t)&&(Re.width=e*t,Re.height=40*t),Re.style.height=`40px`;let n=Re.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,40);let r=e-16,i=(a.moonlight??.35)*Cd(a.phase??.68),o=n.createLinearGradient(8,0,8+r,0);o.addColorStop(0,`rgba(255,255,255,.05)`),o.addColorStop(1,kd(a.tint,.55)),n.fillStyle=o,n.beginPath(),n.roundRect(8,12,r,6,3),n.fill(),n.fillStyle=`rgba(0,0,0,.55)`,n.beginPath(),n.roundRect(8+Ve(i)*r,12,r-Ve(i)*r,6,3),n.fill(),n.font=`8px ui-sans-serif, system-ui`,Be.forEach(([e,t])=>{let i=8+Ve(e)*r;n.strokeStyle=`rgba(255,255,255,.16)`,n.beginPath(),n.moveTo(i,20),n.lineTo(i,24),n.stroke(),t&&(n.fillStyle=`rgba(255,255,255,.30)`,n.textAlign=e<=5e-4?`left`:`center`,n.fillText(t,i,38))});let s=8+Ve(i)*r;n.fillStyle=`#fff`,n.beginPath(),n.arc(s,15,4,0,Math.PI*2),n.fill(),n.strokeStyle=`rgba(0,0,0,.6)`,n.lineWidth=1,n.beginPath(),n.arc(s,15,4,0,Math.PI*2),n.stroke(),n.font=`8.5px ui-sans-serif, system-ui`,n.fillStyle=`rgba(255,255,255,.5)`,n.textAlign=`left`,n.fillText(`0.0005 lx`,8,8),n.textAlign=`right`,n.fillText(`2 lx`,e-8,8)}let We=Z(`div`,`mp-size`);We.innerHTML=`<div class="hd"><span class="k">angular size</span></div>`;let Ge=Z(`canvas`);We.appendChild(Ge);let Ke=Z(`div`,`mp-k mp-note`,``),qe=bd({value:a.angular??1.6,min:.2,max:6,dec:2,step:.05,unit:`°`,onInput:t=>{r(e,`angular`,t),it()}});We.querySelector(`.hd`).appendChild(qe),Ne.append(We,Ke);let Je=t=>{let n=Ge.getBoundingClientRect(),i=Math.max(1,n.width-16),a=Math.max(.2,Math.min(6,(t.clientX-n.left-8)/i*6));r(e,`angular`,+a.toFixed(2)),it()};c(Ge,`pointerdown`,e=>{Ge.setPointerCapture(e.pointerId),Ge.classList.add(`drag`),Je(e)}),c(Ge,`pointermove`,e=>{Ge.hasPointerCapture?.(e.pointerId)&&Je(e)}),c(Ge,`pointerup`,e=>{Ge.releasePointerCapture?.(e.pointerId),Ge.classList.remove(`drag`)}),Me.querySelector(`.mp-x`).onclick=()=>{Me.classList.toggle(`tall`),Ye()};function Ye(){let e=We.clientWidth||280,t=Me.classList.contains(`tall`)?116:76,n=Math.min(devicePixelRatio||1,2);(Ge.width!==e*n||Ge.height!==t*n)&&(Ge.width=e*n,Ge.height=t*n),Ge.style.height=t+`px`;let r=Ge.getContext(`2d`);r.setTransform(n,0,0,n,0,0),r.clearRect(0,0,e,t);let i=.52,o=Math.max(.2,a.angular??1.6),s=e/2,c=(t-14)/2,l=(t-30)/2/Math.max(i,o),u=e-16;r.font=`8px ui-sans-serif, system-ui`;for(let e=0;e<=6;e+=.5){let n=8+e/6*u,i=e%2==0;r.strokeStyle=`rgba(255,255,255,${i?.22:.09})`,r.beginPath(),r.moveTo(n,t-12),r.lineTo(n,t-12+(i?6:3)),r.stroke(),i&&(r.fillStyle=`rgba(255,255,255,.28)`,r.textAlign=e===0?`left`:e===6?`right`:`center`,r.fillText(`${e}°`,n,t-1))}r.strokeStyle=`rgba(255,255,255,.10)`,r.beginPath(),r.moveTo(8,t-12.5),r.lineTo(e-8,t-12.5),r.stroke();let d=8+Math.min(o,6)/6*u;r.strokeStyle=kd(a.tint,.75),r.lineWidth=1.4,r.beginPath(),r.moveTo(d,t-16),r.lineTo(d,t-8),r.stroke(),r.lineWidth=1,jd(r,s,c,o*l,{phase:.5,tint:a.tint,earthshine:.2,brightness:.7}),r.lineWidth=2.5,r.strokeStyle=`rgba(0,0,0,.45)`,r.beginPath(),r.arc(s,c,i*l,0,Math.PI*2),r.stroke(),r.lineWidth=1,r.strokeStyle=`rgba(255,255,255,.85)`,r.setLineDash([3,3]),r.beginPath(),r.arc(s,c,i*l,0,Math.PI*2),r.stroke(),r.setLineDash([]),r.fillStyle=`rgba(255,255,255,.34)`,r.font=`8px ui-sans-serif, system-ui`,r.textAlign=`center`,r.fillText(`REAL 0.52°`,s,c+Math.max(i,o)*l+10),Ke.textContent=`${(o/i).toFixed(1)}× the real moon`}let Xe=[[`#d8e2f2`,`COLD`],[`#f2ece0`,`NEUTRAL`],[`#f6d9b0`,`HARVEST`],[`#c3d0ff`,`BLUE HOUR`]],Ze=Z(`div`,`mp-tags mp-tints`),Qe=Xe.map(([t,n])=>{let i=Z(`button`,`mp-tag`,`<i style="background:${t}"></i>${n}`);return i.onclick=()=>{r(e,`tint`,t),it()},Ze.appendChild(i),{b:i,c:t}}),$e=()=>Qe.forEach(({b:e,c:t})=>e.classList.toggle(`on`,(a.tint||``).toLowerCase()===t)),et=dd(a.tint,t=>{r(e,`tint`,t),it()}),tt=Z(`div`,`mp-subhead`,`<span class="k">tint</span>`);tt.appendChild(et),Ne.append(tt,Ze);let nt=Q({label:`Brightness`,min:0,max:4,value:a.brightness??1.1,dec:2,unit:`×`,step:.05,marks:[{t:0,l:`OFF`},{t:.25,l:`REAL 1.0`},{t:1,l:`4×`}],onInput:t=>{r(e,`brightness`,t),it()}}),rt=Q({label:`Earthshine`,min:0,max:1,value:a.earthshine??.16,dec:2,step:.01,marks:[{t:0,l:`NONE`},{t:.16,l:`REAL`},{t:1,l:`FULL`}],onInput:t=>{r(e,`earthshine`,t),it()}});Ne.append(nt,rt),o.appendChild(Me);function it(){re(),ie(),Ye(),O(),R(),Ee(),je(),Ue(),me(),$e(),G._set(((a.azimuth??292)%360+360)%360);let e=((a.phase??.68)%1+1)%1,t=Cd(e)*100,n=a.period??27.3,r=a.elevation??46,i=a.azimuth??292;E.textContent=Math.floor(t),D.textContent=`.${Math.round(t*10)%10}`,h.innerHTML=`${Math.round(t)}<em>%</em>`,g.innerHTML=`${(e*n).toFixed(1)}<em>d</em>`,_.innerHTML=`${r>=0?`+`:`−`}${Math.abs(r).toFixed(0)}<em>°</em>`,v.innerHTML=`${Ed(i)}<em>${Math.round(i)}°</em>`,v.parentElement.title=`Azimuth ${i.toFixed(1)}°`,x.classList.toggle(`down`,r<0),x.querySelector(`.i`).innerHTML=X(r<0?`alert`:`check`,{size:12}),x.querySelector(`.l`).textContent=r<0?`Below horizon`:`Above horizon`,x.querySelector(`.n`).innerHTML=`${r>=0?``:`−`}${Math.abs(r).toFixed(0)}<em>°</em>`,S.querySelector(`.n`).innerHTML=`${((a.moonlight??.35)*Cd(e)).toFixed(2)}<em>lx</em>`,de.forEach(({b:t,v:n})=>t.classList.toggle(`on`,Math.abs((e-n+1.5)%1-.5)<.0626)),le.textContent=`${wd(e)} · day ${(e*n).toFixed(1)} of ${n.toFixed(1)}`;let o=(.5-e+1)%1*(a.period??27.3);ve.textContent=wd(e)===`Full moon`?`Full tonight`:`Full in ${o.toFixed(1)} days · ${((1-e)%1*(a.period??27.3)).toFixed(1)} to new`,xe.textContent=`${r>=0?`+`:`−`}${Math.floor(Math.abs(r))}`,Se.textContent=`.${Math.round(Math.abs(r)*10)%10}`,Ce.textContent=`${Ed(i)} ${Math.round(i)}° · ${r<0?`under the horizon`:`up`}`;let s=Od(0,21),c=Od(0,9),l=e=>`${String(Math.floor(e)).padStart(2,`0`)}:${String(Math.round(e%1*60)).padStart(2,`0`)}`;Oe.innerHTML=[[`rise`,l(s)],[`transit`,l(0)],[`set`,l(c)]].map(([e,t])=>`<div><span class="k">${e}</span><b>${t}</b></div>`).join(``);let u=(a.moonlight??.35)*Cd(e);Pe.textContent=u.toFixed(2).split(`.`)[0],Fe.textContent=`.${u.toFixed(2).split(`.`)[1]}`,Ie.textContent=r<0?`nothing while it is down`:u<.02?`starlight only`:u<.08?`shapes, no colour`:u<.25?`you could walk`:u<1?`you could read`:`bright enough to work by`,he._set(a.phase??.68),_e._set(a.period??27.3),qe._set(a.angular??1.6),ze._set(a.moonlight??.35),nt._set(a.brightness??1.1),rt._set(a.earthshine??.16),et._set&&et._set(a.tint)}s.push(it),i&&i(()=>s.forEach(e=>e()));let at=new ResizeObserver(()=>{re(),Ye(),O(),R(),Ee(),je(),me(),Ue(),[G,_e,nt,rt].forEach(e=>e._paint&&e._paint())});return at.observe(o),o._dispose=()=>at.disconnect(),requestAnimationFrame(it),it(),o}var Nd=e=>62*Math.sin((e-6)/12*Math.PI),Pd=e=>((90+(e-6)*15)%360+360)%360,Fd=e=>6+(e-90)/15,Id=[`N`,`NNE`,`NE`,`ENE`,`E`,`ESE`,`SE`,`SSE`,`S`,`SSW`,`SW`,`WSW`,`W`,`WNW`,`NW`,`NNW`],Ld=e=>Id[Math.round((e%360+360)%360/22.5)%16],Rd=e=>`${String(Math.floor((e%24+24)%24)).padStart(2,`0`)}:${String(Math.floor((e%1+1)%1*60)).padStart(2,`0`)}`;function zd(e){return e>=50?`High sun`:e>=25?`Full day`:e>=6?`Low sun`:e>=-.5?`Golden hour`:e>=-6?`Civil twilight`:e>=-12?`Blue hour`:e>=-18?`Astronomical twilight`:`Night`}function Bd(e){let t=Math.max(1e3,Math.min(4e4,e))/100,n,r,i;t<=66?(n=255,r=99.47*Math.log(t)-161.12):(n=329.7*(t-60)**-.1332,r=288.12*(t-60)**-.0755),i=t>=66?255:t<=19?0:138.52*Math.log(t-10)-305.04;let a=e=>Math.max(0,Math.min(255,Math.round(e)));return[a(n),a(r),a(i)]}var Vd=(e,t=1)=>{let[n,r,i]=Bd(e);return`rgba(${n},${r},${i},${t})`},Hd=[[-20,`#04060d`,`#080b16`],[-10,`#06080f`,`#131b33`],[-5,`#0a0f21`,`#2b3157`],[-1,`#122045`,`#7d5a6a`],[3,`#1d3566`,`#e08a4a`],[9,`#245089`,`#e5b273`],[20,`#2a63a8`,`#bcd0e2`],[45,`#2f6dc0`,`#a9c9ea`],[75,`#2b6ecb`,`#9dc4ee`]],Ud=(e,t,n)=>{let r=parseInt(e.slice(1),16),i=parseInt(t.slice(1),16),a=(e,t)=>Math.round(e+(t-e)*n);return`rgb(${a(r>>16&255,i>>16&255)},${a(r>>8&255,i>>8&255)},${a(r&255,i&255)})`};function Wd(e){let t=0;for(;t<Hd.length-2&&e>Hd[t+1][0];)t++;let[n,r,i]=Hd[t],[a,o,s]=Hd[t+1],c=Math.max(0,Math.min(1,(e-n)/(a-n||1)));return[Ud(r,o,c),Ud(i,s,c)]}function Gd(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=Z(`div`,`mpanel spanel`),s=[],c=(e,t,n)=>e.addEventListener(t,n),l=e=>vd.emit(`settod`,(e%24+24)%24),u=()=>{let e=a.elevation??14,t=Math.max(0,Math.min(1,(12-e)/18));return(a.temperature??5400)+(1700-(a.temperature??5400))*t**.7},d=()=>(Fd(a.azimuth??118)%24+24)%24,f=Z(`div`,`pcard mp-hero`),p=Z(`canvas`,`mp-sky`);p.title=`Drag to run the day`;let m=Z(`div`,`mp-cap`,`<div class="l"><b class="s-name">—</b><span class="mp-illum s-sub">—</span></div>
     <div class="r"><span class="s-alt">—</span></div>`);f.append(p,m),o.appendChild(f);let h=p.getContext(`2d`);function g(){let e=p.clientWidth||300,t=n?118:142,r=Math.min(devicePixelRatio||1,2);(p.width!==e*r||p.height!==t*r)&&(p.width=e*r,p.height=t*r),p.style.height=t+`px`,h.setTransform(r,0,0,r,0,0),h.clearRect(0,0,e,t);let i=a.elevation??14,o=a.azimuth??118,s=t-20,[c,l]=Wd(i),d=h.createLinearGradient(0,0,0,s);if(d.addColorStop(0,c),d.addColorStop(1,l),h.fillStyle=d,h.fillRect(0,0,e,s),i<-4){let t=Math.min(1,(-i-4)/10);for(let n=0;n<40;n++){let r=n*977%1e3/1e3*e,i=n*613%1e3/1e3*s;h.fillStyle=`rgba(220,232,255,${(.1+n*37%10/10*.3)*t})`,h.fillRect(r,i,1.1,1.1)}}h.fillStyle=`#080a0e`,h.fillRect(0,s,e,t-s);let f=Math.max(0,Math.sin(Math.max(0,i)*Math.PI/180)),m=h.createLinearGradient(0,s,0,t);m.addColorStop(0,Vd(u(),.18*f+.04)),m.addColorStop(1,`rgba(0,0,0,0)`),h.fillStyle=m,h.fillRect(0,s,e,t-s),h.strokeStyle=`rgba(255,255,255,.10)`,h.beginPath(),h.moveTo(0,s+.5),h.lineTo(e,s+.5),h.stroke();let g=Math.max(-.35,Math.min(1,i/62)),_=e*(.12+o%360/360*.76),v=s-g*(s-26),y=Math.max(7,Math.min(26,5+(a.angular??.6)*14)),b=Vd(u()),x=h.createRadialGradient(_,v,y*.5,_,v,y*7);x.addColorStop(0,Vd(u(),.55*Math.max(.18,f))),x.addColorStop(.35,Vd(u(),.14*Math.max(.18,f))),x.addColorStop(1,`rgba(0,0,0,0)`),h.fillStyle=x,h.beginPath(),h.arc(_,v,y*7,0,Math.PI*2),h.fill(),v<s+y&&(h.fillStyle=b,h.beginPath(),h.arc(_,v,y,0,Math.PI*2),h.fill(),h.fillStyle=`rgba(255,255,255,${.15+.45*f})`,h.beginPath(),h.arc(_,v,y*.62,0,Math.PI*2),h.fill())}let _=m.querySelector(`.s-name`),v=m.querySelector(`.s-sub`),y=m.querySelector(`.s-alt`);function b(){let e=a.elevation??14,t=a.azimuth??118;_.textContent=zd(e),v.textContent=`${Rd(d())} · ${(a.temperature??5400).toFixed(0)}K`,y.innerHTML=e<0?`<span class="down">${Math.abs(e).toFixed(0)}° below</span> · ${Ld(t)}`:`${e.toFixed(0)}° above · ${Ld(t)} ${Math.round(t)}°`}let x=null;c(p,`pointerdown`,e=>{p.setPointerCapture(e.pointerId),x=e.clientX,p.classList.add(`grabbing`)}),c(p,`pointermove`,e=>{x!=null&&(l(d()+(e.clientX-x)/(p.clientWidth||300)*12),x=e.clientX)});let S=()=>{x=null,p.classList.remove(`grabbing`)};c(p,`pointerup`,S),c(p,`pointercancel`,S);let C=Z(`div`,`mp-rail`),w=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return C.appendChild(t),t.querySelector(`.v`)},T=w(`Local`),E=w(`Alt`),D=w(`Bearing`),O=w(`Colour`);o.appendChild(C);let k=Z(`div`,`mp-duo`),A=(e,t)=>{let n=Z(`div`,`pcard mp-stat`,`<span class="i">${e}</span><span class="l">${t}</span><b class="n">—</b>`);return k.appendChild(n),n},j=A(X(`check`,{size:12}),`Daylight`),M=A(X(`sun`,{size:12}),`On the ground`);o.appendChild(k);let N=Z(`div`,`pcard mp-atlas s-path`);N.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Sun path</span><span class="s">Stereographic · north up</span></div>
      <button class="mp-x" title="Taller chart">${X(`arrowout`,{size:12})}</button>
    </div>`;let P=Z(`div`,`mp-map s-map`),F=Z(`canvas`);F.title=`Drag the sun around its path`,P.appendChild(F);let I=Z(`div`,`mp-read`,``);P.appendChild(I),N.appendChild(P);let L={hours:!0,twilight:!0,rings:!0},R=Z(`div`,`mp-tags`);Object.keys(L).forEach(e=>{let t=Z(`button`,`mp-tag on`,e.toUpperCase());t.onclick=()=>{L[e]=!L[e],t.classList.toggle(`on`,L[e]),ie()},R.appendChild(t)}),N.appendChild(R);let ee=Z(`div`,`mp-3up`);N.appendChild(ee);let te=Z(`div`,`mp-tl`),z=Z(`canvas`);te.appendChild(z);let ne=Z(`div`,`mp-tllbl`,`<span>00:00</span><span>NOON</span><span>24:00</span>`);N.append(te,ne);let re=xd(`RUN THE DAY`,!!a.animate,t=>{r(e,`animate`,t),Ve()}),B=Z(`div`,`mp-tags`);B.appendChild(re),N.appendChild(B);let V=Q({label:`Clock rate`,min:1,max:600,value:a.rate??120,dec:0,unit:`×`,step:5,marks:[{t:0,l:`REAL`},{t:120/599,l:`120×`},{t:1,l:`600×`}],onInput:t=>{r(e,`rate`,t),Ve()}});N.appendChild(V);let H=Z(`div`,`mp-note`,``);N.appendChild(H),N.querySelector(`.mp-x`).onclick=()=>{N.classList.toggle(`tall`),ie()},o.appendChild(N);function ie(){let e=P.clientWidth||280,t=N.classList.contains(`tall`)?300:210,n=Math.min(devicePixelRatio||1,2);(F.width!==e*n||F.height!==t*n)&&(F.width=e*n,F.height=t*n),F.style.height=t+`px`;let r=F.getContext(`2d`);r.setTransform(n,0,0,n,0,0),r.clearRect(0,0,e,t);let i=e/2,o=t/2,s=Math.min(e,t)/2-20,c=e=>s*(90-e)/90,l=(e,t)=>{let n=c(e),r=(t-90)*Math.PI/180;return[i+n*Math.cos(r),o+n*Math.sin(r)]};if(r.fillStyle=`#0b0d12`,r.beginPath(),r.arc(i,o,s+8,0,Math.PI*2),r.fill(),L.twilight){let e=r.createRadialGradient(i,o,s-1,i,o,s+9);e.addColorStop(0,`rgba(86,116,196,.34)`),e.addColorStop(1,`rgba(86,116,196,0)`),r.fillStyle=e,r.beginPath(),r.arc(i,o,s+9,0,Math.PI*2),r.arc(i,o,s,0,Math.PI*2,!0),r.fill()}r.font=`8px ui-sans-serif, system-ui`,L.rings&&([0,30,60].forEach(e=>{r.strokeStyle=e===0?`rgba(255,255,255,.26)`:`rgba(255,255,255,.09)`,r.setLineDash(e===0?[]:[2,4]),r.beginPath(),r.arc(i,o,c(e),0,Math.PI*2),r.stroke(),r.setLineDash([]),e&&(r.fillStyle=`rgba(255,255,255,.30)`,r.textAlign=`center`,r.fillText(`${e}°`,i,o-c(e)+9))}),r.fillStyle=`rgba(255,255,255,.10)`,r.beginPath(),r.arc(i,o,2,0,Math.PI*2),r.fill());for(let e=0;e<360;e+=15){let t=e%90==0,[n,a]=l(0,e),c=s-(t?7:4),u=(e-90)*Math.PI/180;r.strokeStyle=`rgba(255,255,255,${t?.3:.12})`,r.beginPath(),r.moveTo(n,a),r.lineTo(i+c*Math.cos(u),o+c*Math.sin(u)),r.stroke()}[`N`,`E`,`S`,`W`].forEach((e,t)=>{let n=(t*90-90)*Math.PI/180;r.fillStyle=t===0?`rgba(255,255,255,.55)`:`rgba(255,255,255,.35)`,r.textAlign=`center`,r.fillText(e,i+(s+12)*Math.cos(n),o+(s+12)*Math.sin(n)+3)}),r.lineWidth=1.6;let f=!1;r.beginPath();for(let e=0;e<=24;e+=.1){let t=Nd(e);if(t<0){f=!1;continue}let[n,i]=l(t,Pd(e));f?r.lineTo(n,i):r.moveTo(n,i),f=!0}if(r.strokeStyle=Vd(a.temperature??5400,.85),r.stroke(),r.lineWidth=1,L.hours)for(let e=6;e<=18;e+=2){let t=Nd(e);if(t<-1)continue;let[n,i]=l(Math.max(t,0),Pd(e));r.fillStyle=`rgba(255,255,255,.5)`,r.beginPath(),r.arc(n,i,1.8,0,Math.PI*2),r.fill(),r.fillStyle=`rgba(255,255,255,.34)`,r.textAlign=`center`,r.fillText(String(e).padStart(2,`0`),n,i-6)}let p=a.elevation??14,m=a.azimuth??118,[h,g]=l(Math.max(p,-6),m),_=Vd(u()),v=r.createRadialGradient(h,g,0,h,g,16);v.addColorStop(0,Vd(u(),p<0?.25:.55)),v.addColorStop(1,`rgba(0,0,0,0)`),r.fillStyle=v,r.beginPath(),r.arc(h,g,16,0,Math.PI*2),r.fill(),r.fillStyle=p<0?`rgba(140,150,170,.7)`:_,r.beginPath(),r.arc(h,g,5,0,Math.PI*2),r.fill(),r.strokeStyle=`rgba(0,0,0,.5)`,r.beginPath(),r.arc(h,g,5,0,Math.PI*2),r.stroke(),I.innerHTML=`<span class="k">alt</span><b>${p>=0?`+`:`−`}${Math.abs(p).toFixed(1)}°</b><span class="k">az</span><b>${Math.round(m)}°</b><span class="k">t</span><b>${Rd(d())}</b>`}let ae=e=>{let t=F.getBoundingClientRect(),n=e.clientX-t.left-t.width/2,r=e.clientY-t.top-t.height/2,i=(Math.atan2(r,n)*180/Math.PI+90+360)%360;l(Fd(i))};c(F,`pointerdown`,e=>{F.setPointerCapture(e.pointerId),F.classList.add(`drag`),ae(e)}),c(F,`pointermove`,e=>{F.hasPointerCapture?.(e.pointerId)&&ae(e)}),c(F,`pointerup`,e=>{F.releasePointerCapture?.(e.pointerId),F.classList.remove(`drag`)});function oe(){let e=te.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(z.width!==e*t||z.height!==26*t)&&(z.width=e*t,z.height=26*t),z.style.height=`26px`;let n=z.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,26);let r=e-18;n.fillStyle=`rgba(255,255,255,.22)`,n.beginPath(),n.arc(3.5,13,2.2,0,Math.PI*2),n.fill(),n.beginPath(),n.arc(e-3.5,13,2.2,0,Math.PI*2),n.fill();for(let e=0;e<=24;e++){let t=9+e/24*r,i=e%6==0,a=Nd(e)>=0;n.strokeStyle=i?`rgba(255,255,255,.34)`:`rgba(255,255,255,${a?.22:.08})`;let o=i?9:5;n.beginPath(),n.moveTo(t,13-o/2),n.lineTo(t,13+o/2),n.stroke()}let i=9+d()/24*r;n.fillStyle=`rgba(18,18,18,.96)`,n.strokeStyle=`rgba(255,255,255,.16)`,n.beginPath(),n.roundRect(Math.max(0,Math.min(e-30,i-15)),3,30,20,10),n.fill(),n.stroke();let o=Math.max(15,Math.min(e-15,i)),s=a.elevation??14,c=n.createRadialGradient(o,13,0,o,13,9);c.addColorStop(0,Vd(u(),s<0?.2:.6)),c.addColorStop(1,`rgba(0,0,0,0)`),n.fillStyle=c,n.beginPath(),n.arc(o,13,9,0,Math.PI*2),n.fill(),n.fillStyle=s<0?`rgba(150,160,180,.75)`:Vd(u()),n.beginPath(),n.arc(o,13,4.6,0,Math.PI*2),n.fill()}((e,t)=>{let n=n=>{let r=e.getBoundingClientRect();t(Math.max(0,Math.min(1,(n.clientX-r.left)/r.width)))};c(e,`pointerdown`,t=>{e.setPointerCapture(t.pointerId),e.classList.add(`grabbing`),n(t)}),c(e,`pointermove`,t=>{e.hasPointerCapture?.(t.pointerId)&&n(t)}),c(e,`pointerup`,t=>{e.releasePointerCapture?.(t.pointerId),e.classList.remove(`grabbing`)})})(te,e=>l(e*24));let se=e=>Math.max(0,Math.sin(Nd(e)*Math.PI/180))*(a.intensity??88),ce=Z(`div`,`pcard mp-metric`);ce.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Illuminance</span><span class="s">Through the day</span></div>
      <button class="mp-x" title="Taller chart">${X(`arrowout`,{size:12})}</button>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">klx</span></div>
    <div class="mp-k mp-target">Peak <span class="v">—</span></div>`;let le=Z(`div`,`mp-chartwrap`),ue=Z(`canvas`);le.appendChild(ue),ce.appendChild(le);let de=ce.querySelector(`.mp-target .v`),U=ce.querySelector(`.mp-num .i`),fe=ce.querySelector(`.mp-num .d`);ce.querySelector(`.mp-x`).onclick=()=>{ce.classList.toggle(`tall`),me()};let pe=Q({label:`Illuminance at noon`,min:0,max:160,value:a.intensity??88,dec:0,unit:`klx`,step:1,marks:[{t:0,l:`0`},{t:88/160,l:`CLEAR SKY 88`},{t:1,l:`160`}],onInput:t=>{r(e,`intensity`,t),Ve()}});ce.appendChild(pe),o.appendChild(ce);function me(){let e=le.clientWidth||280,t=ce.classList.contains(`tall`)?168:110,n=Math.min(devicePixelRatio||1,2);(ue.width!==e*n||ue.height!==t*n)&&(ue.width=e*n,ue.height=t*n),ue.style.height=t+`px`;let r=ue.getContext(`2d`);r.setTransform(n,0,0,n,0,0),r.clearRect(0,0,e,t);let i=Math.max(20,a.intensity??88),o=t=>2+t*(e-2-34),s=e=>8+(1-e/i)*(t-8-16);r.font=`9px ui-sans-serif, system-ui`,[.25,.5,.75,1].forEach(t=>{r.strokeStyle=t===1?`rgba(255,255,255,.16)`:`rgba(255,255,255,.07)`,r.setLineDash(t===1?[4,4]:[2,5]),r.beginPath(),r.moveTo(o(0),s(i*t)),r.lineTo(o(1),s(i*t)),r.stroke(),r.setLineDash([]),r.fillStyle=`rgba(255,255,255,.30)`,r.textAlign=`left`,r.fillText(`${Math.round(i*t)}`,e-34+7,s(i*t)+3)});for(let n=0;n<96;n++){let i=n/4,a=Nd(i);a>-4&&a<6&&(r.fillStyle=`rgba(245,158,11,.10)`,r.fillRect(o(i/24),8,(e-2-34)/96,t-8-16))}r.beginPath(),r.moveTo(o(0),s(0));for(let e=0;e<=96;e++){let t=e/4;r.lineTo(o(t/24),s(se(t)))}r.lineTo(o(1),s(0)),r.closePath();let c=r.createLinearGradient(0,8,0,s(0));c.addColorStop(0,Vd(a.temperature??5400,.22)),c.addColorStop(1,`rgba(0,0,0,0)`),r.fillStyle=c,r.fill(),r.strokeStyle=Vd(a.temperature??5400,.85),r.lineWidth=1.6,r.beginPath();for(let e=0;e<=96;e++){let t=e/4;e?r.lineTo(o(t/24),s(se(t))):r.moveTo(o(t/24),s(se(t)))}r.stroke(),r.lineWidth=1,r.fillStyle=`rgba(255,255,255,.26)`,[[0,`00`],[.25,`06`],[.5,`12`],[.75,`18`],[1,`24`]].forEach(([e,n],i)=>{r.strokeStyle=`rgba(255,255,255,.09)`,r.beginPath(),r.moveTo(o(e),s(0)),r.lineTo(o(e),s(0)+4),r.stroke(),r.textAlign=i===0?`left`:i===4?`right`:`center`,r.fillText(n,o(e),t-3)});let l=d()/24,u=se(d()),f=Math.max(8,(e-2-34)*.04);r.fillStyle=`rgba(255,255,255,.05)`,r.fillRect(o(l)-f/2,8,f,s(0)-8),r.fillStyle=`#fff`,r.beginPath(),r.arc(o(l),s(u),3,0,Math.PI*2),r.fill()}let he=Z(`div`,`pcard mp-light`);he.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Colour</span><span class="s">Blackbody · disc</span></div>
    </div>`;let ge=Z(`div`,`pbody`);he.appendChild(ge),he.querySelector(`.mp-chead .l`).onclick=()=>he.classList.toggle(`shut`);let _e=Z(`div`,`mp-meter s-ramp`);_e.innerHTML=`<div class="hd"><span class="k">temperature</span></div>`;let ve=Z(`canvas`);_e.appendChild(ve);let ye=bd({value:a.temperature??5400,min:1600,max:12e3,dec:0,step:50,unit:`K`,onInput:t=>{r(e,`temperature`,t),Ve()}});_e.querySelector(`.hd`).appendChild(ye),ge.appendChild(_e);let be=[[1900,`CANDLE`],[2800,`TUNGSTEN`],[3400,`GOLDEN`],[5400,`DAYLIGHT`],[6500,`OVERCAST`],[8e3,`SHADE`]],xe=Z(`div`,`mp-tags`),Se=be.map(([t,n])=>{let i=Z(`button`,`mp-tag`,`<i style="background:${Vd(t)}"></i>${n}`);return i.onclick=()=>{r(e,`temperature`,t),Ve()},xe.appendChild(i),{b:i,K:t}});ge.appendChild(xe);let Ce=t=>{let n=ve.getBoundingClientRect(),i=Math.max(1,n.width-16),a=Math.max(0,Math.min(1,(t.clientX-n.left-8)/i));r(e,`temperature`,Math.round((1600+a*10400)/50)*50),Ve()};c(ve,`pointerdown`,e=>{ve.setPointerCapture(e.pointerId),ve.classList.add(`drag`),Ce(e)}),c(ve,`pointermove`,e=>{ve.hasPointerCapture?.(e.pointerId)&&Ce(e)}),c(ve,`pointerup`,e=>{ve.releasePointerCapture?.(e.pointerId),ve.classList.remove(`drag`)});function we(){let e=_e.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(ve.width!==e*t||ve.height!==44*t)&&(ve.width=e*t,ve.height=44*t),ve.style.height=`44px`;let n=ve.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,44);let r=e-16;for(let e=0;e<r;e++)n.fillStyle=Vd(1600+e/r*10400),n.fillRect(8+e,8,1.02,14);n.strokeStyle=`rgba(0,0,0,.35)`,n.strokeRect(8.5,8.5,r-1,13),n.font=`8px ui-sans-serif, system-ui`,[[1600,`1.6k`],[3400,`3.4k`],[5400,`5.4k`],[8e3,`8k`],[12e3,`12k`]].forEach(([e,t])=>{let i=8+(e-1600)/10400*r;n.strokeStyle=`rgba(255,255,255,.18)`,n.beginPath(),n.moveTo(i,23),n.lineTo(i,27),n.stroke(),n.fillStyle=`rgba(255,255,255,.30)`,n.textAlign=e<=1600?`left`:e>=12e3?`right`:`center`,n.fillText(t,i,41)});let i=8+((a.temperature??5400)-1600)/10400*r;n.fillStyle=`#fff`,n.beginPath(),n.moveTo(i,7),n.lineTo(i+4,1),n.lineTo(i-4,1),n.closePath(),n.fill(),n.strokeStyle=`rgba(255,255,255,.9)`,n.lineWidth=1.4,n.beginPath(),n.moveTo(i,8),n.lineTo(i,22),n.stroke(),n.lineWidth=1,Se.forEach(({b:e,K:t})=>e.classList.toggle(`on`,Math.abs((a.temperature??5400)-t)<60))}let W=Z(`div`,`mp-subhead`,`<span class="k">tint</span>`),Te=dd(a.tint||`#fff0d4`,t=>{r(e,`tint`,t),Ve()});W.appendChild(Te),ge.appendChild(W);let Ee=Z(`div`,`mp-size`);Ee.innerHTML=`<div class="hd"><span class="k">angular size</span></div>`;let De=Z(`canvas`);Ee.appendChild(De);let G=bd({value:a.angular??.6,min:.1,max:4,dec:2,step:.05,unit:`°`,onInput:t=>{r(e,`angular`,t),Ve()}});Ee.querySelector(`.hd`).appendChild(G);let Oe=Z(`div`,`mp-k mp-note`,``);ge.append(Ee,Oe);let K=t=>{let n=De.getBoundingClientRect(),i=Math.max(1,n.width-16);r(e,`angular`,+Math.max(.1,Math.min(4,(t.clientX-n.left-8)/i*4)).toFixed(2)),Ve()};c(De,`pointerdown`,e=>{De.setPointerCapture(e.pointerId),De.classList.add(`drag`),K(e)}),c(De,`pointermove`,e=>{De.hasPointerCapture?.(e.pointerId)&&K(e)}),c(De,`pointerup`,e=>{De.releasePointerCapture?.(e.pointerId),De.classList.remove(`drag`)}),o.appendChild(he);function ke(){let e=Ee.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(De.width!==e*t||De.height!==78*t)&&(De.width=e*t,De.height=78*t),De.style.height=`78px`;let n=De.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,78);let r=.53,i=Math.max(.1,a.angular??.6),o=e/2,s=23/Math.max(r,i),c=e-16;n.font=`8px ui-sans-serif, system-ui`;for(let e=0;e<=4;e+=.25){let t=8+e/4*c,r=e%1==0;n.strokeStyle=`rgba(255,255,255,${r?.22:.09})`,n.beginPath(),n.moveTo(t,66),n.lineTo(t,66+(r?6:3)),n.stroke(),r&&(n.fillStyle=`rgba(255,255,255,.28)`,n.textAlign=e===0?`left`:e===4?`right`:`center`,n.fillText(`${e}°`,t,77))}n.strokeStyle=`rgba(255,255,255,.10)`,n.beginPath(),n.moveTo(8,65.5),n.lineTo(e-8,65.5),n.stroke();let l=8+Math.min(i,4)/4*c;n.strokeStyle=Vd(a.temperature??5400,.9),n.lineWidth=1.4,n.beginPath(),n.moveTo(l,62),n.lineTo(l,70),n.stroke(),n.lineWidth=1;let u=n.createRadialGradient(o,32,0,o,32,i*s*2.4);u.addColorStop(0,Vd(a.temperature??5400,.42)),u.addColorStop(1,`rgba(0,0,0,0)`),n.fillStyle=u,n.beginPath(),n.arc(o,32,i*s*2.4,0,Math.PI*2),n.fill(),n.fillStyle=Vd(a.temperature??5400),n.beginPath(),n.arc(o,32,i*s,0,Math.PI*2),n.fill(),n.lineWidth=2.5,n.strokeStyle=`rgba(0,0,0,.45)`,n.beginPath(),n.arc(o,32,r*s,0,Math.PI*2),n.stroke(),n.lineWidth=1,n.strokeStyle=`rgba(255,255,255,.85)`,n.setLineDash([3,3]),n.beginPath(),n.arc(o,32,r*s,0,Math.PI*2),n.stroke(),n.setLineDash([]),n.fillStyle=`rgba(255,255,255,.34)`,n.textAlign=`center`,n.fillText(`REAL 0.53°`,o,32+Math.max(r,i)*s+10),Oe.textContent=`${(i/r).toFixed(1)}× the real sun`}let Ae=Z(`div`,`pcard mp-light s-shadow`);Ae.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Shadows</span><span class="s">Length · bearing · edge</span></div>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">× height</span></div>
    <div class="mp-k mp-target">Falling <span class="v">—</span></div>`;let je=Z(`div`,`pbody`);Ae.appendChild(je),Ae.querySelector(`.mp-chead .l`).onclick=()=>Ae.classList.toggle(`shut`);let Me=Ae.querySelector(`.mp-num .i`),Ne=Ae.querySelector(`.mp-num .d`),Pe=Ae.querySelector(`.mp-target .v`),Fe=Z(`div`,`mp-map s-shadowmap`),Ie=Z(`canvas`);Fe.appendChild(Ie),je.appendChild(Fe);let Le=Z(`div`,`mp-tags`),Re=xd(`CAST SHADOWS`,a.shadows!==!1,t=>{r(e,`shadows`,t),Ve()});Le.appendChild(Re),je.appendChild(Le);let ze=Q({label:`Edge softness`,min:0,max:10,value:a.softness??2.4,dec:1,step:.1,marks:[{t:0,l:`HARD`},{t:.24,l:`SUN 2.4`},{t:1,l:`OVERCAST`}],onInput:t=>{r(e,`softness`,t),Ve()}});je.appendChild(ze),o.appendChild(Ae);function Be(){let e=Fe.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(Ie.width!==e*t||Ie.height!==150*t)&&(Ie.width=e*t,Ie.height=150*t),Ie.style.height=`150px`;let n=Ie.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,150);let r=a.elevation??14,i=a.azimuth??118,o=e/2,s=r>.4,c=s?1/Math.tan(r*Math.PI/180):1/0,l=c<=1.5?[.5,1,1.5]:c<=3.5?[1,2,3]:[2,4,6],u=Math.min(e*.42,63)/l[l.length-1];n.font=`8px ui-sans-serif, system-ui`,n.strokeStyle=`rgba(255,255,255,.045)`;for(let t=o%20;t<e;t+=20)n.beginPath(),n.moveTo(t,0),n.lineTo(t,150),n.stroke();for(let t=19;t<150;t+=20)n.beginPath(),n.moveTo(0,t),n.lineTo(e,t),n.stroke();l.forEach(e=>{n.strokeStyle=`rgba(255,255,255,.10)`,n.setLineDash([2,4]),n.beginPath(),n.arc(o,79,e*u,0,Math.PI*2),n.stroke(),n.setLineDash([]),n.fillStyle=`rgba(255,255,255,.24)`,n.textAlign=`left`,n.fillText(`${e}×`,o+e*u+3,77)}),n.strokeStyle=`rgba(255,255,255,.13)`,n.beginPath(),n.moveTo(o,-71),n.lineTo(o,229),n.moveTo(o-e,79),n.lineTo(o+e,79),n.stroke(),n.fillStyle=`rgba(255,255,255,.32)`,n.textAlign=`center`,[`N`,`E`,`S`,`W`].forEach((t,r)=>{let i=(r*90-90)*Math.PI/180,a=Math.min(e,150)/2-6;n.fillText(t,o+Math.cos(i)*a,79+Math.sin(i)*a+3)});let d=(i-90)*Math.PI/180,f=Math.min(e,150)/2-16,p=o+Math.cos(d)*f,m=79+Math.sin(d)*f,h=n.createRadialGradient(p,m,0,p,m,13);if(h.addColorStop(0,Vd(a.temperature??5400,s?.55:.18)),h.addColorStop(1,`rgba(0,0,0,0)`),n.fillStyle=h,n.beginPath(),n.arc(p,m,13,0,Math.PI*2),n.fill(),n.fillStyle=s?Vd(a.temperature??5400):`rgba(150,160,180,.5)`,n.beginPath(),n.arc(p,m,3.4,0,Math.PI*2),n.fill(),n.strokeStyle=`rgba(255,255,255,.12)`,n.setLineDash([2,4]),n.beginPath(),n.moveTo(p,m),n.lineTo(o,79),n.stroke(),n.setLineDash([]),s&&a.shadows!==!1){let e=((i+180)%360-90)*Math.PI/180,t=Math.min(c,l[l.length-1]*1.35)*u,r=o+Math.cos(e)*t,s=79+Math.sin(e)*t,d=a.softness??2.4,f=-Math.sin(e),p=Math.cos(e),m=4+d*2.2,h=n.createLinearGradient(o,79,r,s);h.addColorStop(0,`rgba(0,0,0,.85)`),h.addColorStop(1,`rgba(0,0,0,${Math.max(.05,.5-d*.035)})`),n.fillStyle=h,n.beginPath(),n.moveTo(o+f*4/2,79+p*4/2),n.lineTo(r+f*m/2,s+p*m/2),n.lineTo(r-f*m/2,s-p*m/2),n.lineTo(o-f*4/2,79-p*4/2),n.closePath(),n.fill();let g=n.createRadialGradient(r,s,0,r,s,4+d*2.4);g.addColorStop(0,`rgba(0,0,0,${Math.max(.05,.45-d*.03)})`),g.addColorStop(1,`rgba(0,0,0,0)`),n.fillStyle=g,n.beginPath(),n.arc(r,s,4+d*2.4,0,Math.PI*2),n.fill(),n.fillStyle=`rgba(255,255,255,.45)`,n.textAlign=Math.cos(e)<0?`right`:`left`,n.fillText(`${c.toFixed(1)}× height`,r+(Math.cos(e)<0?-7:7),s+3)}n.fillStyle=s?Vd(a.temperature??5400,.95):`rgba(170,180,200,.5)`,n.beginPath(),n.arc(o,79,4.5,0,Math.PI*2),n.fill(),n.strokeStyle=`rgba(0,0,0,.6)`,n.beginPath(),n.arc(o,79,4.5,0,Math.PI*2),n.stroke(),s||(n.fillStyle=`rgba(255,255,255,.32)`,n.textAlign=`center`,n.font=`9px ui-sans-serif, system-ui`,n.fillText(`the sun is down — nothing to cast`,o,103))}function Ve(){g(),b(),ie(),oe(),me(),we(),ke(),Be();let e=a.elevation??14,t=a.azimuth??118,n=a.temperature??5400,r=se(d()),i=Math.max(0,Math.sin(Math.max(0,e)*Math.PI/180))*100;T.innerHTML=Rd(d()),E.innerHTML=`${e>=0?`+`:`−`}${Math.abs(e).toFixed(0)}<em>°</em>`,D.innerHTML=`${Ld(t)}<em>${Math.round(t)}°</em>`,O.innerHTML=`${(n/1e3).toFixed(1)}<em>kK</em>`,j.classList.toggle(`down`,e<0),j.querySelector(`.i`).innerHTML=X(e<0?`alert`:`check`,{size:12}),j.querySelector(`.l`).textContent=zd(e),j.querySelector(`.n`).innerHTML=`${i.toFixed(0)}<em>%</em>`,M.querySelector(`.n`).innerHTML=`${r.toFixed(+(r<10))}<em>klx</em>`,U.textContent=Math.floor(r),fe.textContent=`.${Math.round(r*10)%10}`,de.textContent=`${(a.intensity??88).toFixed(0)} klx at noon · ${zd(e).toLowerCase()} now`,ee.innerHTML=[[`rise`,Rd(6)],[`noon`,Rd(12)],[`set`,Rd(18)]].map(([e,t])=>`<div><span class="k">${e}</span><b>${t}</b></div>`).join(``);let o=86400/((a.rate??120)*6);H.textContent=a.animate?`Running · a whole day every ${o<90?`${o.toFixed(0)} s`:`${(o/60).toFixed(1)} min`}`:`Held at this hour — switch it on to let the day run`;let s=e>.4,c=s?1/Math.tan(e*Math.PI/180):0;Me.textContent=s?c>99?`99`:Math.floor(c):`—`,Ne.textContent=s&&c<100?`.${Math.round(c*10)%10}`:``,Pe.textContent=s?a.shadows===!1?`nothing — casting is off`:`${Ld((t+180)%360)} ${Math.round((t+180)%360)}° · ${(a.softness??2.4)<1?`hard edge`:(a.softness??2.4)<4?`sun-soft edge`:`overcast edge`}`:`nothing while the sun is down`,ye._set(n),G._set(a.angular??.6),pe._set(a.intensity??88),V._set(a.rate??120),ze._set(a.softness??2.4),re._set(!!a.animate),Re._set(a.shadows!==!1),Te._set&&Te._set(a.tint||`#fff0d4`)}s.push(Ve),i&&i(()=>s.forEach(e=>e()));let He=new ResizeObserver(()=>{g(),ie(),oe(),me(),we(),ke(),Be(),[V,pe,ze].forEach(e=>e._paint&&e._paint())});return He.observe(o),o._dispose=()=>He.disconnect(),requestAnimationFrame(Ve),Ve(),o}var Kd=9.81,qd=e=>Math.sqrt(2*Math.PI*e/Kd),Jd=e=>Math.sqrt(Kd*e/(2*Math.PI)),Yd=[[.001,0,`Glassy`],[.1,1,`Rippled`],[.5,2,`Smooth`],[1.25,3,`Slight`],[2.5,4,`Moderate`],[4,5,`Rough`],[6,6,`Very rough`],[9,7,`High`]];function Xd(e){for(let[t,n,r]of Yd)if(e<t)return{n,name:r};return{n:8,name:`Very high`}}var Zd=e=>.09+(1-Math.max(0,Math.min(1,e)))**1.6*1.5,Qd=e=>1.7/Zd(e),$d=e=>{let t=parseInt((e||`#1d7b8c`).slice(1),16);return[t>>16&255,t>>8&255,t&255]},ef=(e,t,n)=>{let r=$d(e),i=$d(t),a=Math.max(0,Math.min(1,n));return`rgb(${Math.round(r[0]+(i[0]-r[0])*a)},${Math.round(r[1]+(i[1]-r[1])*a)},${Math.round(r[2]+(i[2]-r[2])*a)})`},tf=(e,t)=>{let[n,r,i]=$d(e);return`rgba(${n},${r},${i},${t})`};function nf(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=Z(`div`,`mpanel wpanel`),s=[],c=(e,t,n)=>e.addEventListener(t,n),l=()=>a.amplitude??.19,u=()=>a.wavelength??7.5,d=()=>l()*2,f=(e,t,n,r)=>{let i=t*e;return n*(Math.cos(i)+r*.35*Math.cos(2*i)*Math.sign(Math.cos(i)))},p=Z(`div`,`pcard mp-hero w-hero`),m=Z(`canvas`,`mp-sky`);m.title=`Drag: sideways for wavelength, up and down for height`;let h=Z(`div`,`mp-cap`,`<div class="l"><b class="w-name">—</b><span class="mp-illum w-sub">—</span></div>
     <div class="r"><span class="w-lvl">—</span></div>`);p.append(m,h),o.appendChild(p);let g=m.getContext(`2d`);function _(){let e=m.clientWidth||300,t=n?138:164,r=Math.min(devicePixelRatio||1,2);(m.width!==e*r||m.height!==t*r)&&(m.width=e*r,m.height=t*r),m.style.height=t+`px`;let i=g;i.setTransform(r,0,0,r,0,0),i.clearRect(0,0,e,t);let o=a.shallow||`#1d7b8c`,s=a.deep||`#06222e`,c=Math.round(t*.44),d=t-c,p=26/e,h=9/d,_=l()/1.4*(c-16),v=_/Math.max(l(),1e-4)/(1/h),y=i.createLinearGradient(0,0,0,c);y.addColorStop(0,`#0a1119`),y.addColorStop(1,`#16222c`),i.fillStyle=y,i.fillRect(0,0,e,c);let b=Zd(a.clarity??.55);for(let n=c;n<t;n++){let t=(n-c)*h;i.fillStyle=ef(o,s,1-Math.exp(-b*t*.8)),i.fillRect(0,n,e,1.02)}let x=e=>c+d*(.3+.64*e+.03*Math.sin(e*9));i.beginPath(),i.moveTo(0,t);for(let t=0;t<=e;t+=3)i.lineTo(t,x(t/e));i.lineTo(e,t),i.closePath(),i.fillStyle=`rgba(146,132,104,.75)`,i.fill();for(let t=0;t<e;t+=7){let n=x(t/e);i.fillStyle=`rgba(0,0,0,.10)`,i.fillRect(t,n+2,3.5,1.2)}for(let n=0;n<e;n+=1){let r=x(n/e),a=1-Math.exp(-b*(r-c)*h*.8);i.fillStyle=ef(o,s,a),i.globalAlpha=a,i.fillRect(n,r,1.02,t-r),i.globalAlpha=1}let C=2*Math.PI/Math.max(.5,u())*p,w=a.choppiness??.85,T=[];for(let t=0;t<=e;t+=2)T.push([t,c-f(t,C,_,w)]);i.save(),i.beginPath(),i.moveTo(0,0),i.lineTo(e,0);for(let e=T.length-1;e>=0;e--)i.lineTo(T[e][0],T[e][1]);i.closePath(),i.clip(),i.fillStyle=y,i.fillRect(0,0,e,c+_+4),i.restore(),i.beginPath(),T.forEach(([e,t],n)=>n?i.lineTo(e,t):i.moveTo(e,t)),i.strokeStyle=tf(o,.95),i.lineWidth=1.6,i.stroke(),i.lineWidth=1;let E=a.specular??1.6,D=a.foam??.28;T.forEach(([e,t],n)=>{if(n>0&&n<T.length-1&&t<=T[n-1][1]&&t<=T[n+1][1]){if(E>.05){let n=i.createRadialGradient(e,t,0,e,t,10+E*6);n.addColorStop(0,`rgba(255,247,225,${Math.min(.5,.08+E*.12)*(a.reflectivity??.82)})`),n.addColorStop(1,`rgba(255,247,225,0)`),i.fillStyle=n,i.beginPath(),i.arc(e,t,10+E*6,0,Math.PI*2),i.fill()}if(D>.02&&_>3){i.fillStyle=`rgba(255,255,255,${.15+D*.6})`;for(let n=0;n<3+D*6;n++)i.fillRect(e+n*37%13-6,t+n*17%4,1.3,1.1)}}}),i.strokeStyle=`rgba(255,255,255,.14)`,i.setLineDash([3,4]),i.beginPath(),i.moveTo(0,c+.5),i.lineTo(e,c+.5),i.stroke(),i.setLineDash([]),i.font=`8px ui-sans-serif, system-ui`,[.5,1,1.4].forEach(t=>{let n=c-t/1.4*(c-16);i.strokeStyle=`rgba(255,255,255,.08)`,i.beginPath(),i.moveTo(0,n),i.lineTo(e,n),i.stroke(),i.fillStyle=`rgba(255,255,255,.26)`,i.textAlign=`left`,i.fillText(`${t} m`,6,n-2)}),i.fillStyle=`rgba(255,255,255,.30)`,i.textAlign=`left`,i.fillText(`26 m across · vertical ×${v.toFixed(0)}`,8,t-6),i.textAlign=`right`,i.fillText(`9 m deep`,e-8,t-6),S&&(i.strokeStyle=`rgba(255,255,255,.25)`,i.setLineDash([2,3]),i.beginPath(),i.moveTo(S.x,0),i.lineTo(S.x,t),i.moveTo(0,S.y),i.lineTo(e,S.y),i.stroke(),i.setLineDash([]))}let v=h.querySelector(`.w-name`),y=h.querySelector(`.w-sub`),b=h.querySelector(`.w-lvl`);function x(){let e=Xd(d());v.textContent=`${e.name} · sea ${e.n}`,y.textContent=`${d().toFixed(2)} m at ${u().toFixed(1)} m · ${(a.speed??1).toFixed(2)}×`,b.innerHTML=`level ${(a.level??-.6).toFixed(2)} m · vis ${Qd(a.clarity??.55).toFixed(1)} m`}let S=null,C=t=>{let n=m.getBoundingClientRect(),i=Math.max(0,Math.min(1,(t.clientX-n.left)/n.width)),a=Math.max(0,Math.min(1,(t.clientY-n.top)/n.height));S={x:i*n.width,y:a*n.height},r(e,`wavelength`,+(.5+i*29.5).toFixed(1)),r(e,`amplitude`,+(1.4*(1-a)**1.6).toFixed(3)),K()};c(m,`pointerdown`,e=>{m.setPointerCapture(e.pointerId),m.classList.add(`grabbing`),C(e)}),c(m,`pointermove`,e=>{m.hasPointerCapture?.(e.pointerId)&&C(e)});let w=()=>{S=null,m.classList.remove(`grabbing`),_()};c(m,`pointerup`,w),c(m,`pointercancel`,w);let T=Z(`div`,`mp-rail`),E=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return T.appendChild(t),t.querySelector(`.v`)},D=E(`Height`),O=E(`Length`),k=E(`Period`),A=E(`Level`);o.appendChild(T);let j=Z(`div`,`mp-duo`),M=(e,t)=>{let n=Z(`div`,`pcard mp-stat`,`<span class="i">${e}</span><span class="l">${t}</span><b class="n">—</b>`);return j.appendChild(n),n},N=M(X(`water`,{size:12}),`Sea state`),P=M(X(`eye`,{size:12}),`You can see`);o.appendChild(j);let F=Z(`div`,`pcard mp-metric w-state`);F.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Sea state</span><span class="s">Douglas scale · deep water</span></div>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">m</span></div>
    <div class="mp-k mp-target">Crest to trough <span class="v">—</span></div>`;let I=Z(`div`,`mp-meter w-scale`),L=Z(`canvas`);I.appendChild(L),F.appendChild(I);let R=Z(`div`,`mp-spec w-specs`);F.appendChild(R);let ee=F.querySelector(`.mp-num .i`),te=F.querySelector(`.mp-num .d`),z=F.querySelector(`.mp-target .v`);o.appendChild(F);let ne=[[.1,`RIPPLE`],[.5,`SMOOTH`],[1.25,`SLIGHT`],[2.5,`MODERATE`],[2.8,``]];function re(){let e=I.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(L.width!==e*t||L.height!==40*t)&&(L.width=e*t,L.height=40*t),L.style.height=`40px`;let n=L.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,40);let r=e-16,i=e=>8+Math.max(0,Math.min(1,e/2.8))*r,o=n.createLinearGradient(8,0,8+r,0);o.addColorStop(0,tf(a.shallow||`#1d7b8c`,.25)),o.addColorStop(1,tf(a.shallow||`#1d7b8c`,.85)),n.fillStyle=o,n.beginPath(),n.roundRect(8,12,r,6,3),n.fill(),n.fillStyle=`rgba(0,0,0,.55)`,n.beginPath(),n.roundRect(i(d()),12,8+r-i(d()),6,3),n.fill(),n.font=`8px ui-sans-serif, system-ui`,ne.forEach(([e,t])=>{let r=i(e);n.strokeStyle=`rgba(255,255,255,.16)`,n.beginPath(),n.moveTo(r,20),n.lineTo(r,24),n.stroke(),t&&(n.fillStyle=`rgba(255,255,255,.30)`,n.textAlign=`center`,n.fillText(t,r,38))});let s=i(d());n.fillStyle=`#fff`,n.beginPath(),n.arc(s,15,4,0,Math.PI*2),n.fill(),n.strokeStyle=`rgba(0,0,0,.6)`,n.beginPath(),n.arc(s,15,4,0,Math.PI*2),n.stroke(),n.font=`8.5px ui-sans-serif, system-ui`,n.fillStyle=`rgba(255,255,255,.5)`,n.textAlign=`left`,n.fillText(`CALM`,8,8),n.textAlign=`right`,n.fillText(`2.8 m`,e-8,8)}let B=Z(`div`,`pcard mp-light w-wave`);B.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Wave</span><span class="s">Shape · pace</span></div>
    </div>`;let V=Z(`div`,`pbody`);B.appendChild(V),B.querySelector(`.mp-chead .l`).onclick=()=>B.classList.toggle(`shut`);let H=Q({label:`Amplitude`,min:0,max:1.4,value:l(),dec:3,unit:`m`,step:.005,marks:[{t:0,l:`FLAT`},{t:.19/1.4,l:`SWELL`},{t:1,l:`1.4 m`}],onInput:t=>{r(e,`amplitude`,t),K()}}),ie=Q({label:`Wavelength`,min:.5,max:30,value:u(),dec:1,unit:`m`,step:.1,marks:[{t:0,l:`CHOP`},{t:7.5/30,l:`WIND SEA`},{t:1,l:`SWELL 30`}],onInput:t=>{r(e,`wavelength`,t),K()}}),ae=Q({label:`Choppiness`,min:0,max:2,value:a.choppiness??.85,dec:2,step:.01,marks:[{t:0,l:`ROUND`},{t:.425,l:`TROCHOID`},{t:1,l:`PEAKED`}],onInput:t=>{r(e,`choppiness`,t),K()}}),oe=Q({label:`Speed`,min:0,max:4,value:a.speed??1,dec:2,unit:`×`,step:.05,marks:[{t:0,l:`STILL`},{t:.25,l:`REAL 1×`},{t:1,l:`4×`}],onInput:t=>{r(e,`speed`,t),K()}}),se=xd(`FOLLOW WIND`,a.windLinked!==!1,t=>{r(e,`windLinked`,t),K()}),ce=Z(`div`,`mp-tags`);ce.appendChild(se),V.append(H,ie,ae,oe,ce),o.appendChild(B);let le=Z(`div`,`pcard mp-light w-depth`);le.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Depth</span><span class="s">Colour · clarity · datum</span></div>
    </div>`;let ue=Z(`div`,`pbody`);le.appendChild(ue),le.querySelector(`.mp-chead .l`).onclick=()=>le.classList.toggle(`shut`);let de=Z(`div`,`mp-meter w-ramp`);de.innerHTML=`<div class="hd"><span class="k">water column</span></div>`;let U=Z(`canvas`);de.appendChild(U);let fe=bd({value:a.clarity??.55,min:0,max:1,dec:2,step:.01,onInput:t=>{r(e,`clarity`,t),K()}});de.querySelector(`.hd`).appendChild(fe),ue.appendChild(de);let pe=t=>{let n=U.getBoundingClientRect(),i=Math.max(1,n.width-16);r(e,`clarity`,+Math.max(0,Math.min(1,(t.clientX-n.left-8)/i)).toFixed(2)),K()};c(U,`pointerdown`,e=>{U.setPointerCapture(e.pointerId),U.classList.add(`drag`),pe(e)}),c(U,`pointermove`,e=>{U.hasPointerCapture?.(e.pointerId)&&pe(e)}),c(U,`pointerup`,e=>{U.releasePointerCapture?.(e.pointerId),U.classList.remove(`drag`)});let me=Z(`div`,`mp-subhead`,`<span class="k">shallow</span>`),he=dd(a.shallow||`#1d7b8c`,t=>{r(e,`shallow`,t),K()});me.appendChild(he);let ge=Z(`div`,`mp-subhead`,`<span class="k">deep</span>`),_e=dd(a.deep||`#06222e`,t=>{r(e,`deep`,t),K()});ge.appendChild(_e),ue.append(me,ge);let ve=Q({label:`Sea level`,min:-8,max:6,value:a.level??-.6,dec:2,unit:`m`,step:.05,marks:[{t:0,l:`−8`},{t:8/14,l:`DATUM 0`},{t:1,l:`+6`}],onInput:t=>{r(e,`level`,t),K()}}),ye=Q({label:`Extent`,min:50,max:4e3,value:a.extent??1400,dec:0,unit:`m`,step:10,marks:[{t:0,l:`POOL`},{t:1400/3950,l:`BAY 1.4 km`},{t:1,l:`OCEAN`}],onInput:t=>{r(e,`extent`,t),K()}});ue.append(ve,ye),o.appendChild(le);function be(){let e=de.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(U.width!==e*t||U.height!==52*t)&&(U.width=e*t,U.height=52*t),U.style.height=`52px`;let n=U.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,52);let r=e-16,i=Zd(a.clarity??.55);for(let e=0;e<r;e++){let t=e/r*20;n.fillStyle=ef(a.shallow||`#1d7b8c`,a.deep||`#06222e`,1-Math.exp(-i*t)),n.fillRect(8+e,6,1.02,22)}n.strokeStyle=`rgba(0,0,0,.35)`,n.strokeRect(8.5,6.5,r-1,21),n.font=`8px ui-sans-serif, system-ui`,[0,5,10,15,20].forEach(e=>{let t=8+e/20*r;n.strokeStyle=`rgba(255,255,255,.18)`,n.beginPath(),n.moveTo(t,29),n.lineTo(t,33),n.stroke(),n.fillStyle=`rgba(255,255,255,.30)`,n.textAlign=e===0?`left`:e===20?`right`:`center`,n.fillText(`${e} m`,t,49)});let o=8+Math.min(20,Qd(a.clarity??.55))/20*r;n.strokeStyle=`rgba(255,255,255,.9)`,n.setLineDash([2,2]),n.beginPath(),n.moveTo(o,4),n.lineTo(o,30),n.stroke(),n.setLineDash([]),n.fillStyle=`#fff`,n.beginPath(),n.moveTo(o,4),n.lineTo(o+4,-2),n.lineTo(o-4,-2),n.closePath(),n.fill()}let xe=Z(`div`,`pcard mp-light w-surface`);xe.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Surface</span><span class="s">Reflection · foam · glint</span></div>
    </div>`;let Se=Z(`div`,`pbody`);xe.appendChild(Se),xe.querySelector(`.mp-chead .l`).onclick=()=>xe.classList.toggle(`shut`);let Ce=Z(`div`,`mp-map w-glint`),we=Z(`canvas`);Ce.appendChild(we);let W=Z(`div`,`mp-read`,``);Ce.appendChild(W),Se.appendChild(Ce);let Te=Q({label:`Reflectivity`,min:0,max:1,value:a.reflectivity??.82,dec:2,step:.01,marks:[{t:0,l:`MATTE`},{t:.82,l:`WATER`},{t:1,l:`MIRROR`}],onInput:t=>{r(e,`reflectivity`,t),K()}}),Ee=Q({label:`Roughness`,min:0,max:1,value:a.roughness??.07,dec:3,step:.005,marks:[{t:0,l:`GLASS`},{t:.07,l:`CALM`},{t:1,l:`SCATTERED`}],onInput:t=>{r(e,`roughness`,t),K()}}),De=Q({label:`Foam`,min:0,max:1,value:a.foam??.28,dec:2,step:.01,marks:[{t:0,l:`NONE`},{t:.28,l:`WHITECAPS`},{t:1,l:`SURF`}],onInput:t=>{r(e,`foam`,t),K()}}),G=Q({label:`Sun glint`,min:0,max:4,value:a.specular??1.6,dec:2,unit:`×`,step:.05,marks:[{t:0,l:`OFF`},{t:.4,l:`REAL 1.6`},{t:1,l:`4×`}],onInput:t=>{r(e,`specular`,t),K()}});Se.append(Te,Ee,De,G),o.appendChild(xe);function Oe(){let e=Ce.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(we.width!==e*t||we.height!==116*t)&&(we.width=e*t,we.height=116*t),we.style.height=`116px`;let n=we.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,116);let r=a.reflectivity??.82,i=a.roughness??.07,o=a.foam??.28,s=a.specular??1.6,c=n.createLinearGradient(0,0,0,39);c.addColorStop(0,`#101a24`),c.addColorStop(1,`#2a3a46`),n.fillStyle=c,n.fillRect(0,0,e,39);let l=e*.5,u=n.createRadialGradient(l,23,0,l,23,26);u.addColorStop(0,`rgba(255,244,214,.85)`),u.addColorStop(1,`rgba(255,244,214,0)`),n.fillStyle=u,n.beginPath(),n.arc(l,23,26,0,Math.PI*2),n.fill();for(let t=39;t<116;t++){let r=(t-39)/77;n.fillStyle=ef(a.deep||`#06222e`,a.shallow||`#1d7b8c`,.15+r*.35),n.fillRect(0,t,e,1.02)}for(let e=0;e<46;e++){let t=e/46,a=39+t*77,o=(4+i*190*(.25+t))*(.4+s*.4),c=Math.round(3+t*12);for(let i=0;i<c;i++){let c=(e*73+i*131)%1e3/1e3-.5,u=l+c*o*2,d=r*s*.22*(1-t*.55)*(.4+Math.abs(.5-Math.abs(c))*1.2);d<=.01||(n.fillStyle=`rgba(255,247,226,${Math.min(.85,d)})`,n.fillRect(u,a,1+t*3.5,1+t*1.4))}}if(o>.02)for(let t=0;t<90;t++){let r=t*37%100/100,i=39+r**1.6*77,a=t*613%1e3/1e3*e;t*97%100/100>o||(n.fillStyle=`rgba(255,255,255,${.1+o*.45})`,n.fillRect(a,i,2+r*5,1+r*1.6))}n.strokeStyle=`rgba(255,255,255,.18)`,n.beginPath(),n.moveTo(0,39.5),n.lineTo(e,39.5),n.stroke(),W.innerHTML=`<span class="k">albedo</span><b>${(r*100).toFixed(0)}%</b><span class="k">rough</span><b>${i.toFixed(3)}</b><span class="k">glint</span><b>${s.toFixed(2)}×</b>`}function K(){_(),x(),re(),be(),Oe();let e=Xd(d()),t=qd(u()),n=Jd(u()),r=d()/u(),i=Qd(a.clarity??.55);D.innerHTML=`${d().toFixed(2)}<em>m</em>`,O.innerHTML=`${u().toFixed(1)}<em>m</em>`,k.innerHTML=`${t.toFixed(1)}<em>s</em>`,A.innerHTML=`${(a.level??-.6).toFixed(2)}<em>m</em>`,N.classList.toggle(`down`,r>1/7),N.querySelector(`.i`).innerHTML=X(r>1/7?`alert`:`water`,{size:12}),N.querySelector(`.l`).textContent=e.name,N.querySelector(`.n`).innerHTML=`${e.n}`,P.querySelector(`.n`).innerHTML=`${i.toFixed(1)}<em>m</em>`,ee.textContent=Math.floor(d()),te.textContent=`.${String(Math.round(d()*100)%100).padStart(2,`0`)}`,z.textContent=`over ${u().toFixed(1)} m · ${e.name.toLowerCase()}, sea ${e.n}`,R.innerHTML=[[`period`,`${t.toFixed(2)} s`],[`phase speed`,`${n.toFixed(2)} m/s`],[`steepness`,`1 : ${(1/Math.max(r,1e-4)).toFixed(0)}`],[`breaking`,r>1/7?`YES · over 1:7`:`${(r/(1/7)*100).toFixed(0)}% of limit`]].map(([e,t])=>`<div><span class="k">${e}</span><b>${t}</b></div>`).join(``),H._set(l()),ie._set(u()),ae._set(a.choppiness??.85),oe._set(a.speed??1),ve._set(a.level??-.6),ye._set(a.extent??1400),Te._set(a.reflectivity??.82),Ee._set(a.roughness??.07),De._set(a.foam??.28),G._set(a.specular??1.6),fe._set(a.clarity??.55),se._set(a.windLinked!==!1),he._set&&he._set(a.shallow||`#1d7b8c`),_e._set&&_e._set(a.deep||`#06222e`)}s.push(K),i&&i(()=>s.forEach(e=>e()));let ke=new ResizeObserver(()=>{_(),re(),be(),Oe(),[H,ie,ae,oe,ve,ye,Te,Ee,De,G].forEach(e=>e._paint&&e._paint())});return ke.observe(o),o._dispose=()=>ke.disconnect(),requestAnimationFrame(K),K(),o}var rf=[[.5,0,`Calm`],[1.5,1,`Light air`],[3.3,2,`Light breeze`],[5.5,3,`Gentle breeze`],[7.9,4,`Moderate breeze`],[10.7,5,`Fresh breeze`],[13.8,6,`Strong breeze`],[17.1,7,`Near gale`],[20.7,8,`Gale`],[24.4,9,`Strong gale`],[28.4,10,`Storm`]];function af(e){for(let[t,n,r]of rf)if(e<t)return{n,name:r};return{n:11,name:`Violent storm`}}var of=[[.5,`smoke rises straight up`],[1.5,`smoke drifts`],[3.3,`leaves rustle`],[5.5,`flags stir, leaves move`],[7.9,`dust lifts, small branches move`],[10.7,`small trees sway`],[13.8,`large branches move`],[17.1,`whole trees in motion`],[20.7,`twigs break off`],[24.4,`slates lift`],[28.4,`trees uprooted`]],sf=e=>(of.find(([t])=>e<t)||[0,`structural damage`])[1],cf=[`N`,`NNE`,`NE`,`ENE`,`E`,`ESE`,`SE`,`SSE`,`S`,`SSW`,`SW`,`WSW`,`W`,`WNW`,`NW`,`NNW`],lf=e=>cf[Math.round((e%360+360)%360/22.5)%16];function uf(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=Z(`div`,`mpanel windpanel`),s=[],c=(e,t,n)=>e.addEventListener(t,n),l=()=>a.speed??4.2,u=()=>((a.direction??214)%360+360)%360,d=()=>a.gust??.3,f=()=>a.turbulence??.24,p=Z(`div`,`pcard mp-hero wf-hero`),m=Z(`canvas`,`mp-sky`);m.title=`Drag out from the middle: the angle is the bearing, the distance is the speed`;let h=Z(`div`,`mp-cap`,`<div class="l"><b class="wf-name">—</b><span class="mp-illum wf-sub">—</span></div>
     <div class="r"><span class="wf-r">—</span></div>`);p.append(m,h),o.appendChild(p);let g=Array.from({length:190},(e,t)=>({x:t*977%1e3/1e3,y:t*613%1e3/1e3,life:t*37%100/100,seed:t*131%1e3/1e3})),_=performance.now()/1e3,v=0,y=1,b=(e,t,n)=>Math.sin(e*7.1+n*.7)*Math.cos(t*6.3-n*.5)+.5*Math.sin(e*13.7-n*1.1)*Math.cos(t*11.3+n*.9),x=m.getContext(`2d`);function S(e=0){let t=m.clientWidth||300,r=n?138:168,i=Math.min(devicePixelRatio||1,2);(m.width!==t*i||m.height!==r*i)&&(m.width=t*i,m.height=r*i),m.style.height=r+`px`;let a=x;a.setTransform(i,0,0,i,0,0);let o=a.createLinearGradient(0,0,0,r);o.addColorStop(0,`#0a1014`),o.addColorStop(1,`#0d1a1b`),a.fillStyle=o,a.fillRect(0,0,t,r);let s=l(),c=u(),d=(c+180-90)*Math.PI/180,p=Math.cos(d),h=Math.sin(d),_=f(),S=Math.min(1,s/30);a.strokeStyle=`rgba(255,255,255,.035)`;for(let e=0;e<t;e+=26)a.beginPath(),a.moveTo(e,0),a.lineTo(e,r),a.stroke();for(let e=0;e<r;e+=26)a.beginPath(),a.moveTo(0,e),a.lineTo(t,e),a.stroke();let C=(.03+S*.55)*y*e;g.forEach(n=>{let i=b(n.x,n.y,v)*_*.9,o=Math.cos(i*.9),s=Math.sin(i*.9),c=p*o-h*s,l=p*s+h*o,u=C*(.65+n.seed*.7);n.x+=c*u,n.y+=l*u*(t/r),n.life-=e*(.25+S*.5),(n.life<=0||n.x<-.05||n.x>1.05||n.y<-.05||n.y>1.05)&&(n.x=p>0?-.02-n.seed*.1:p<0?1.02+n.seed*.1:n.seed,Math.abs(p)<.35?(n.x=n.seed,n.y=h>0?-.02:1.02):n.y=n.seed*7919%1e3/1e3,n.life=.6+n.seed*.9);let d=(7+S*34)*(.5+n.seed),f=n.x*t,m=n.y*r,g=Math.min(.8,(.3+S*.45)*Math.min(1,n.life*2.2)*y),x=a.createLinearGradient(f-c*d,m-l*d,f,m);x.addColorStop(0,`rgba(137,224,196,0)`),x.addColorStop(1,`rgba(137,224,196,${g})`),a.strokeStyle=x,a.lineWidth=.9+S*1.3,a.beginPath(),a.moveTo(f-c*d,m-l*d),a.lineTo(f,m),a.stroke()}),a.lineWidth=1;let w=t/2,T=r/2,E=Math.min(t,r)*.34,D=E*(.25+S*.75);a.strokeStyle=`rgba(255,255,255,.10)`,a.setLineDash([2,4]),a.beginPath(),a.arc(w,T,E,0,Math.PI*2),a.stroke(),a.setLineDash([]),a.strokeStyle=`rgba(255,255,255,.85)`,a.lineWidth=2,a.beginPath(),a.moveTo(w,T),a.lineTo(w+p*D,T+h*D),a.stroke(),a.lineWidth=1;let O=w+p*D,k=T+h*D;a.fillStyle=`#fff`,a.beginPath(),a.moveTo(O+p*7,k+h*7),a.lineTo(O-h*4.5-p*2,k+p*4.5-h*2),a.lineTo(O+h*4.5-p*2,k-p*4.5-h*2),a.closePath(),a.fill(),a.fillStyle=`rgba(255,255,255,.55)`,a.beginPath(),a.arc(w,T,2.5,0,Math.PI*2),a.fill(),a.font=`8px ui-sans-serif, system-ui`,a.fillStyle=`rgba(255,255,255,.42)`,a.textAlign=`center`;let A=(c-90)*Math.PI/180;a.fillText(lf(c),w+Math.cos(A)*(E+11),T+Math.sin(A)*(E+11)+3),[`N`,`E`,`S`,`W`].forEach((e,t)=>{let n=(t*90-90)*Math.PI/180;a.fillStyle=`rgba(255,255,255,.18)`,a.fillText(e,w+Math.cos(n)*(E+11),T+Math.sin(n)*(E+11)+3)})}let C=h.querySelector(`.wf-name`),w=h.querySelector(`.wf-sub`),T=h.querySelector(`.wf-r`);function E(){let e=af(l());C.textContent=e.name,w.textContent=`${l().toFixed(1)} m/s from ${lf(u())} ${Math.round(u())}° · ${sf(l())}`,T.innerHTML=`force ${e.n}`}let D=t=>{let n=m.getBoundingClientRect(),i=t.clientX-n.left-n.width/2,a=t.clientY-n.top-n.height/2,o=Math.min(n.width,n.height)*.34,s=(Math.atan2(a,i)*180/Math.PI+90+360)%360;r(e,`direction`,Math.round((s+180)%360)),r(e,`speed`,+Math.max(0,Math.min(30,(Math.hypot(i,a)/o-.25)/.75*30)).toFixed(1)),De()};c(m,`pointerdown`,e=>{m.setPointerCapture(e.pointerId),m.classList.add(`grabbing`),D(e)}),c(m,`pointermove`,e=>{m.hasPointerCapture?.(e.pointerId)&&D(e)});let O=()=>m.classList.remove(`grabbing`);c(m,`pointerup`,O),c(m,`pointercancel`,O);let k=Z(`div`,`mp-rail`),A=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return k.appendChild(t),t.querySelector(`.v`)},j=A(`Mean`),M=A(`Gust`),N=A(`From`),P=A(`Force`);o.appendChild(k);let F=Z(`div`,`mp-duo`),I=(e,t)=>{let n=Z(`div`,`pcard mp-stat`,`<span class="i">${e}</span><span class="l">${t}</span><b class="n">—</b>`);return F.appendChild(n),n},L=I(X(`wind`,{size:12}),`Gusting to`),R=I(X(`wind`,{size:12}),`Lulling to`);o.appendChild(F);let ee=Z(`div`,`pcard mp-metric wf-trace`);ee.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Anemometer</span><span class="s">Last 60 seconds</span></div>
      <button class="mp-x" title="Taller trace">${X(`arrowout`,{size:12})}</button>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">m/s</span></div>
    <div class="mp-k mp-target">Mean <span class="v">—</span></div>`;let te=Z(`div`,`mp-chartwrap`),z=Z(`canvas`);te.appendChild(z),ee.appendChild(te);let ne=Z(`div`,`mp-spec wf-specs`);ee.appendChild(ne);let re=ee.querySelector(`.mp-num .i`),B=ee.querySelector(`.mp-num .d`),V=ee.querySelector(`.mp-target .v`);ee.querySelector(`.mp-x`).onclick=()=>{ee.classList.toggle(`tall`),ce()},o.appendChild(ee);let H=e=>{let t=Math.sin(e*.9)*.6+Math.sin(e*2.3+1.7)*.3+Math.sin(e*5.1)*.1,n=(Math.sin(e*17.3)+Math.sin(e*29.7+2.1))*.5;return 1+d()*(t*.55)+f()*n*.18},ie=Array(240);(()=>{let e=.4+f()*2.2;for(let t=0;t<ie.length;t++)ie[t]=Math.max(0,l()*H(v-(ie.length-t)*.25*e))})();let ae=0,oe=l();function se(e){for(v+=e*(.4+f()*2.2),y=H(v),oe=Math.max(0,l()*y),ae+=e;ae>=.25;)ae-=.25,ie.push(oe),ie.shift()}function ce(){let e=te.clientWidth||280,t=ee.classList.contains(`tall`)?170:112,n=Math.min(devicePixelRatio||1,2);(z.width!==e*n||z.height!==t*n)&&(z.width=e*n,z.height=t*n),z.style.height=t+`px`;let r=z.getContext(`2d`);r.setTransform(n,0,0,n,0,0),r.clearRect(0,0,e,t);let i=Math.max(2,Math.max(...ie,l())*1.18),a=t=>2+t*(e-2-30),o=e=>8+(1-e/i)*(t-8-15);r.font=`9px ui-sans-serif, system-ui`,[.25,.5,.75,1].forEach(t=>{r.strokeStyle=`rgba(255,255,255,.06)`,r.setLineDash([2,5]),r.beginPath(),r.moveTo(a(0),o(i*t)),r.lineTo(a(1),o(i*t)),r.stroke(),r.setLineDash([]),r.fillStyle=`rgba(255,255,255,.26)`,r.textAlign=`left`,r.fillText((i*t).toFixed(i>12?0:1),e-30+6,o(i*t)+3)});let s=l(),c=Math.max(...ie),u=Math.min(...ie);r.fillStyle=`rgba(137,224,196,.07)`,r.fillRect(a(0),o(c),a(1)-a(0),Math.max(1,o(u)-o(c))),r.strokeStyle=`rgba(255,255,255,.28)`,r.setLineDash([4,4]),r.beginPath(),r.moveTo(a(0),o(s)),r.lineTo(a(1),o(s)),r.stroke(),r.setLineDash([]),r.beginPath(),ie.forEach((e,t)=>{let n=a(t/(ie.length-1)),i=o(e);t?r.lineTo(n,i):r.moveTo(n,i)}),r.strokeStyle=`rgba(137,224,196,.9)`,r.lineWidth=1.4,r.stroke(),r.lineWidth=1,r.fillStyle=`#fff`,r.beginPath(),r.arc(a(1),o(ie[ie.length-1]),2.6,0,Math.PI*2),r.fill(),r.fillStyle=`rgba(255,255,255,.26)`,[[0,`−60 s`],[.5,`−30 s`],[1,`now`]].forEach(([e,n],i)=>{r.textAlign=i===0?`left`:i===2?`right`:`center`,r.fillText(n,a(e),t-3)})}let le=Z(`div`,`pcard mp-light wf-scale`);le.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Beaufort</span><span class="s">Force · bearing</span></div>
    </div>`;let ue=Z(`div`,`pbody`);le.appendChild(ue),le.querySelector(`.mp-chead .l`).onclick=()=>le.classList.toggle(`shut`);let de=Z(`div`,`mp-meter wf-meter`);de.innerHTML=`<div class="hd"><span class="k">wind speed</span></div>`;let U=Z(`canvas`);de.appendChild(U);let fe=bd({value:l(),min:0,max:30,dec:1,step:.1,unit:`m/s`,onInput:t=>{r(e,`speed`,t),De()}});de.querySelector(`.hd`).appendChild(fe),ue.appendChild(de);let pe=t=>{let n=U.getBoundingClientRect(),i=Math.max(1,n.width-16);r(e,`speed`,+Math.max(0,Math.min(30,(t.clientX-n.left-8)/i*30)).toFixed(1)),De()};c(U,`pointerdown`,e=>{U.setPointerCapture(e.pointerId),U.classList.add(`drag`),pe(e)}),c(U,`pointermove`,e=>{U.hasPointerCapture?.(e.pointerId)&&pe(e)}),c(U,`pointerup`,e=>{U.releasePointerCapture?.(e.pointerId),U.classList.remove(`drag`)});let me=Q({label:`Coming from`,min:0,max:360,value:u(),dec:0,unit:`°`,step:1,marks:[{t:0,l:`N`},{t:.25,l:`E`},{t:.5,l:`S`},{t:.75,l:`W`},{t:1,l:`N`}],onInput:t=>{r(e,`direction`,Math.round(t)%360),De()}});ue.appendChild(me);let he=Z(`div`,`mp-note`,``);ue.appendChild(he),o.appendChild(le);function ge(){let e=de.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(U.width!==e*t||U.height!==44*t)&&(U.width=e*t,U.height=44*t),U.style.height=`44px`;let n=U.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,44);let r=e-16,i=e=>8+Math.max(0,Math.min(1,e/30))*r,a=0;rf.concat([[30,11,``]]).forEach(([e,t])=>{let r=i(a),o=i(e),s=t/11;n.fillStyle=`rgb(${Math.round(60+s*195)},${Math.round(200-s*120)},${Math.round(180-s*120)})`,n.globalAlpha=.85,n.fillRect(r,10,Math.max(1,o-r-1),14),n.globalAlpha=1,t%2==0&&o-r>9&&(n.font=`7.5px ui-sans-serif, system-ui`,n.fillStyle=`rgba(0,0,0,.55)`,n.textAlign=`center`,n.fillText(String(t),(r+o)/2,20)),a=e}),n.font=`8px ui-sans-serif, system-ui`,[[0,`0`],[10,`10`],[20,`20`],[30,`30 m/s`]].forEach(([e,t])=>{let r=i(e);n.strokeStyle=`rgba(255,255,255,.18)`,n.beginPath(),n.moveTo(r,25),n.lineTo(r,29),n.stroke(),n.fillStyle=`rgba(255,255,255,.30)`,n.textAlign=e===0?`left`:e>=30?`right`:`center`,n.fillText(t,r,41)});let o=i(l());n.fillStyle=`#fff`,n.beginPath(),n.moveTo(o,9),n.lineTo(o+4,3),n.lineTo(o-4,3),n.closePath(),n.fill(),n.strokeStyle=`rgba(255,255,255,.95)`,n.lineWidth=1.4,n.beginPath(),n.moveTo(o,10),n.lineTo(o,24),n.stroke(),n.lineWidth=1}let _e=Z(`div`,`pcard mp-light wf-steady`);_e.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Steadiness</span><span class="s">Gust · turbulence</span></div>
    </div>`;let ve=Z(`div`,`pbody`);_e.appendChild(ve),_e.querySelector(`.mp-chead .l`).onclick=()=>_e.classList.toggle(`shut`);let ye=Q({label:`Gustiness`,min:0,max:1,value:d(),dec:2,step:.01,marks:[{t:0,l:`STEADY`},{t:.3,l:`BREEZY`},{t:1,l:`SQUALLY`}],onInput:t=>{r(e,`gust`,t),De()}}),be=Q({label:`Turbulence`,min:0,max:1,value:f(),dec:2,step:.01,marks:[{t:0,l:`LAMINAR`},{t:.24,l:`OPEN AIR`},{t:1,l:`ROTOR`}],onInput:t=>{r(e,`turbulence`,t),De()}}),xe=Z(`div`,`mp-spec`);ve.append(ye,be,xe),o.appendChild(_e);let Se=Z(`div`,`pcard mp-light wf-drives`);Se.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Driving</span><span class="s">Everything that follows this field</span></div>
    </div>`;let Ce=Z(`div`,`pbody`);Se.appendChild(Ce),Se.querySelector(`.mp-chead .l`).onclick=()=>Se.classList.toggle(`shut`);let we=Z(`div`,`mp-tags`);Ce.appendChild(we);let W=Z(`div`,`mp-note`,`Clouds and water can each be cut loose from the field — switch one off and it keeps its own drift.`);Ce.appendChild(W),o.appendChild(Se);let Te=Kl.filter(e=>`windLinked`in(e.props||{})).map(e=>{let t=xd(e.name.toUpperCase(),e.props.windLinked!==!1,t=>{e.props.windLinked=t,vd.emit(`propchange`,{node:e,key:`windLinked`,src:`wind-panel`}),De()});return we.appendChild(t),{p:t,n:e}});function Ee(){let e=af(l()),t=Math.max(...ie),n=Math.min(...ie),r=.6125*l()**2;j.innerHTML=`${l().toFixed(1)}<em>m/s</em>`,M.innerHTML=`${t.toFixed(1)}<em>m/s</em>`,N.innerHTML=`${lf(u())}<em>${Math.round(u())}°</em>`,P.innerHTML=`${e.n}<em>bf</em>`,L.querySelector(`.n`).innerHTML=`${t.toFixed(1)}<em>m/s</em>`,R.querySelector(`.n`).innerHTML=`${n.toFixed(1)}<em>m/s</em>`,L.classList.toggle(`down`,t>17),L.querySelector(`.i`).innerHTML=X(t>17?`alert`:`wind`,{size:12}),V.textContent=`${l().toFixed(1)} m/s · ${e.name.toLowerCase()}, force ${e.n}`,ne.innerHTML=[[`gust factor`,`${(t/Math.max(l(),.1)).toFixed(2)}×`],[`spread`,`${(t-n).toFixed(1)} m/s`],[`pressure`,`${r.toFixed(+(r<10))} Pa`],[`also`,`${(l()*3.6).toFixed(0)} km/h · ${(l()*1.944).toFixed(1)} kn`]].map(([e,t])=>`<div><span class="k">${e}</span><b>${t}</b></div>`).join(``)}function De(){E(),ce(),ge(),Ee();let e=af(l());re.textContent=Math.floor(oe),B.textContent=`.${Math.round(oe*10)%10}`,xe.innerHTML=[[`turbulence intensity`,`${(f()*100).toFixed(0)}%`],[`gust to mean`,`${(1+d()*.6).toFixed(2)}×`]].map(([e,t])=>`<div><span class="k">${e}</span><b>${t}</b></div>`).join(``),he.textContent=`Force ${e.n} · ${e.name.toLowerCase()} — ${sf(l())}.`,fe._set(l()),me._set(u()),ye._set(d()),be._set(f()),Te.forEach(({p:e,n:t})=>e._set(t.props.windLinked!==!1))}let G=0,Oe=!0,K=!0,ke=0,Ae=new IntersectionObserver(e=>{K=e[0].isIntersecting},{threshold:0});Ae.observe(p);let je=()=>{if(!Oe)return;let e=performance.now()/1e3,t=Math.min(.12,e-_);_=e,K&&(se(t),S(t),ce(),re.textContent=Math.floor(oe),B.textContent=`.${Math.round(oe*10)%10}`,ke+=t,ke>.4&&(ke=0,Ee())),G=requestAnimationFrame(je)};G=requestAnimationFrame(je),s.push(De),i&&i(()=>s.forEach(e=>e()));let Me=new ResizeObserver(()=>{S(0),ce(),ge(),[me,ye,be].forEach(e=>e._paint&&e._paint())});return Me.observe(o),o._dispose=()=>{Oe=!1,cancelAnimationFrame(G),Me.disconnect(),Ae.disconnect()},De(),o}var df=Math.PI/180,ff=e=>{let t=parseInt((e||`#2f6dd0`).slice(1),16);return[t>>16&255,t>>8&255,t&255]},pf=(e,t,n)=>{let r=ff(e),i=ff(t),a=Math.max(0,Math.min(1,n));return[r[0]+(i[0]-r[0])*a,r[1]+(i[1]-r[1])*a,r[2]+(i[2]-r[2])*a]},mf=([e,t,n],r=1)=>`rgba(${Math.round(Math.max(0,Math.min(255,e)))},${Math.round(Math.max(0,Math.min(255,t)))},${Math.round(Math.max(0,Math.min(255,n)))},${r})`,hf=(e,t)=>(1-t*t)/(4*Math.PI*Math.max(1e-4,1+t*t-2*t*e)**1.5),gf=(e,t)=>.02*e+t*1.2,_f=(e,t)=>3.912/Math.max(.002,gf(e,t));function vf(e){let t=0,n=0,r=0;e<440?(t=-(e-440)/60,r=1):e<490?(n=(e-440)/50,r=1):e<510?(n=1,r=-(e-510)/20):e<580?(t=(e-510)/70,n=1):e<645?(t=1,n=-(e-645)/65):t=1;let i=e<420?.3+.7*(e-380)/40:e>700?.3+.7*(780-e)/80:1;return[t*i*255,n*i*255,r*i*255]}function yf(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=Z(`div`,`mpanel skypanel`),s=[],c=(e,t,n)=>e.addEventListener(t,n),l=()=>Kl.find(e=>e.type===`sun`),u=()=>l()?.props.elevation??14,d=()=>a.rayleigh??1.35,f=()=>a.mie??.22,p=()=>a.mieG??.78,m=()=>a.turbidity??3.4,h=()=>a.ozone??1;function g(e,t){let n=u(),r=Math.max(-2,e),i=Math.sin(Math.max(0,r)*df),o=Math.max(0,Math.min(1,(n+6)/12)),s=1-o,c=pf(a.zenith||`#2f6dd0`,a.horizon||`#9fc4e8`,Math.min(1,(1-i)**1.1*(.5+m()*.06)*(.45+d()*.45))),l=.06+.94*o;c=c.map(e=>e*l);let g=h()*s;c=[c[0]*(1-g*.35),c[1]*(1-g*.18),c[2]*(1+g*.06)];let _=Math.min(.95,p()),v=hf(Math.cos(r*df)*Math.cos(Math.abs(t)*df)*Math.cos(n*df)+Math.sin(r*df)*Math.sin(n*df),_)/hf(1,_)*(.25+f()*1.9)*Math.max(.04,o);c=[c[0]+v*235,c[1]+v*218,c[2]+v*186];let y=(1-i)**5*(.08+f()*.9)*(.15+o*.85);c=[c[0]+y*62,c[1]+y*66,c[2]+y*74];let b=a.intensity??1;return c.map(e=>e*(.55+b*.45))}let _=Z(`div`,`pcard mp-hero sk-hero`),v=Z(`canvas`,`mp-sky`);v.title=`Drag: across for turbidity, up and down for Rayleigh`;let y=Z(`div`,`mp-cap`,`<div class="l"><b class="sk-name">—</b><span class="mp-illum sk-sub">—</span></div>
     <div class="r"><span class="sk-r">—</span></div>`);_.append(v,y),o.appendChild(_);let b=v.getContext(`2d`),x=null;function S(){let e=v.clientWidth||300,t=n?140:168,r=Math.min(devicePixelRatio||1,2);(v.width!==e*r||v.height!==t*r)&&(v.width=e*r,v.height=t*r),v.style.height=t+`px`;let i=b;i.setTransform(r,0,0,r,0,0),i.clearRect(0,0,e,t);let o=t-16;for(let t=0;t<e;t+=3){let n=(t/e-.5)*180;for(let e=0;e<o;e+=3)i.fillStyle=mf(g((1-e/o)*90,n)),i.fillRect(t,e,3.5,3.5)}let s=u();if(s>-3){let t=(1-Math.min(90,Math.max(0,s))/90)*o,n=e/2,r=i.createRadialGradient(n,t,0,n,t,34);r.addColorStop(0,`rgba(255,248,226,.95)`),r.addColorStop(.25,`rgba(255,240,205,.35)`),r.addColorStop(1,`rgba(255,240,205,0)`),i.fillStyle=r,i.beginPath(),i.arc(n,t,34,0,Math.PI*2),i.fill(),i.fillStyle=`rgba(255,252,240,.95)`,i.beginPath(),i.arc(n,t,5,0,Math.PI*2),i.fill()}i.fillStyle=mf(ff(a.ground||`#14181d`)),i.fillRect(0,o,e,t-o),i.strokeStyle=`rgba(255,255,255,.10)`,i.beginPath(),i.moveTo(0,o+.5),i.lineTo(e,o+.5),i.stroke(),i.font=`8px ui-sans-serif, system-ui`,[[0,`0°`],[30,`30`],[60,`60`],[90,`90° ZENITH`]].forEach(([e,t])=>{let n=(1-e/90)*o;i.strokeStyle=`rgba(255,255,255,.10)`,i.beginPath(),i.moveTo(0,n),i.lineTo(10,n),i.stroke(),i.fillStyle=`rgba(255,255,255,.42)`,i.textAlign=`left`,i.fillText(t,13,n+(e===90?9:3))}),i.textAlign=`center`,i.fillStyle=`rgba(255,255,255,.42)`,[[-90,`−90°`],[0,`SUN`],[90,`+90°`]].forEach(([n,r])=>{let a=(n/180+.5)*e;i.textAlign=n<0?`left`:n>0?`right`:`center`,i.fillText(r,Math.max(4,Math.min(e-4,a)),t-5)}),x&&(i.strokeStyle=`rgba(255,255,255,.3)`,i.setLineDash([2,3]),i.beginPath(),i.moveTo(x.x,0),i.lineTo(x.x,t),i.moveTo(0,x.y),i.lineTo(e,x.y),i.stroke(),i.setLineDash([]))}let C=y.querySelector(`.sk-name`),w=y.querySelector(`.sk-sub`),T=y.querySelector(`.sk-r`),E=()=>{let e=m();return e<2?`Arctic air`:e<3?`Clear air`:e<5?`Clean air`:e<8?`Hazy air`:e<13?`Murky air`:`Smog`};function D(){C.textContent=E(),w.textContent=`turbidity ${m().toFixed(1)} · rayleigh ${d().toFixed(2)} · mie ${f().toFixed(3)}`,T.innerHTML=`${_f(m(),f()).toFixed(0)} km`}let O=t=>{let n=v.getBoundingClientRect(),i=Math.max(0,Math.min(1,(t.clientX-n.left)/n.width)),a=Math.max(0,Math.min(1,(t.clientY-n.top)/n.height));x={x:i*n.width,y:a*n.height},r(e,`turbidity`,+(1+i*19).toFixed(1)),r(e,`rayleigh`,+(4*(1-a)).toFixed(2)),Me()};c(v,`pointerdown`,e=>{v.setPointerCapture(e.pointerId),v.classList.add(`grabbing`),O(e)}),c(v,`pointermove`,e=>{v.hasPointerCapture?.(e.pointerId)&&O(e)});let k=()=>{x=null,v.classList.remove(`grabbing`),S()};c(v,`pointerup`,k),c(v,`pointercancel`,k);let A=Z(`div`,`mp-rail`),j=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return A.appendChild(t),t.querySelector(`.v`)},M=j(`Rayleigh`),N=j(`Turbidity`),P=j(`Mie`),F=j(`Ozone`);o.appendChild(A);let I=Z(`div`,`mp-duo`),L=(e,t)=>{let n=Z(`div`,`pcard mp-stat`,`<span class="i">${e}</span><span class="l">${t}</span><b class="n">—</b>`);return I.appendChild(n),n},R=L(X(`eye`,{size:12}),`Visibility`),ee=L(X(`sky`,{size:12}),`Sky light`);o.appendChild(I);let te=Z(`div`,`pcard mp-metric sk-spec`);te.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Extinction</span><span class="s">Per kilometre · 380–720 nm</span></div>
      <button class="mp-x" title="Taller chart">${X(`arrowout`,{size:12})}</button>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">km</span></div>
    <div class="mp-k mp-target">Visibility <span class="v">—</span></div>`;let z=Z(`div`,`mp-chartwrap`),ne=Z(`canvas`);z.appendChild(ne),te.appendChild(z);let re=Z(`div`,`mp-spec sk-specs`);te.appendChild(re);let B=te.querySelector(`.mp-num .i`),V=te.querySelector(`.mp-num .d`),H=te.querySelector(`.mp-target .v`);te.querySelector(`.mp-x`).onclick=()=>{te.classList.toggle(`tall`),oe()},o.appendChild(te);let ie=e=>d()*.012*(550/e)**4,ae=()=>f()*1.2+m()*.004;function oe(){let e=z.clientWidth||280,t=te.classList.contains(`tall`)?168:112,n=Math.min(devicePixelRatio||1,2);(ne.width!==e*n||ne.height!==t*n)&&(ne.width=e*n,ne.height=t*n),ne.style.height=t+`px`;let r=ne.getContext(`2d`);r.setTransform(n,0,0,n,0,0),r.clearRect(0,0,e,t);let i=Math.max(.12,ie(380)+ae())*1.15,a=t=>2+(t-380)/340*(e-2-32),o=e=>8+(1-e/i)*(t-8-16);r.font=`9px ui-sans-serif, system-ui`,[.25,.5,.75,1].forEach(t=>{r.strokeStyle=`rgba(255,255,255,.06)`,r.setLineDash([2,5]),r.beginPath(),r.moveTo(a(380),o(i*t)),r.lineTo(a(720),o(i*t)),r.stroke(),r.setLineDash([]),r.fillStyle=`rgba(255,255,255,.26)`,r.textAlign=`left`,r.fillText((i*t).toFixed(2),e-32+5,o(i*t)+3)});for(let e=380;e<=720;e+=2){let t=ie(e)+ae();r.fillStyle=mf(vf(e),.3),r.fillRect(a(e),o(t),2.4,o(0)-o(t))}r.strokeStyle=`rgba(255,255,255,.42)`,r.setLineDash([4,3]),r.beginPath(),r.moveTo(a(380),o(ae())),r.lineTo(a(720),o(ae())),r.stroke(),r.setLineDash([]),r.fillStyle=`rgba(255,255,255,.34)`,r.textAlign=`left`,r.fillText(`MIE`,a(392),o(ae())-4),r.beginPath();for(let e=380;e<=720;e+=2){let t=ie(e)+ae();e===380?r.moveTo(a(e),o(t)):r.lineTo(a(e),o(t))}r.strokeStyle=`rgba(255,255,255,.9)`,r.lineWidth=1.6,r.stroke(),r.lineWidth=1,r.fillStyle=`rgba(255,255,255,.26)`,[[400,`400`],[550,`550 nm`],[700,`700`]].forEach(([e,n],i)=>{r.textAlign=i===0?`left`:i===2?`right`:`center`,r.fillText(n,a(e),t-3)})}let se=Z(`div`,`pcard mp-light sk-haze`);se.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Haze</span><span class="s">Mie scattering · phase</span></div>
    </div>`;let ce=Z(`div`,`pbody`);se.appendChild(ce),se.querySelector(`.mp-chead .l`).onclick=()=>se.classList.toggle(`shut`);let le=Z(`div`,`mp-meter sk-phase`);le.innerHTML=`<div class="hd"><span class="k">phase function</span></div>`;let ue=Z(`canvas`);le.appendChild(ue);let de=bd({value:p(),min:0,max:.98,dec:2,step:.01,onInput:t=>{r(e,`mieG`,t),Me()}});le.querySelector(`.hd`).appendChild(de),ce.appendChild(le);let U=t=>{let n=ue.getBoundingClientRect(),i=Math.max(1,n.width-16);r(e,`mieG`,+Math.max(0,Math.min(.98,(t.clientX-n.left-8)/i*.98)).toFixed(2)),Me()};c(ue,`pointerdown`,e=>{ue.setPointerCapture(e.pointerId),ue.classList.add(`drag`),U(e)}),c(ue,`pointermove`,e=>{ue.hasPointerCapture?.(e.pointerId)&&U(e)}),c(ue,`pointerup`,e=>{ue.releasePointerCapture?.(e.pointerId),ue.classList.remove(`drag`)});let fe=Q({label:`Mie haze`,min:0,max:1,value:f(),dec:3,step:.005,marks:[{t:0,l:`VACUUM`},{t:.22,l:`CLEAR`},{t:1,l:`FOG`}],onInput:t=>{r(e,`mie`,t),Me()}}),pe=Q({label:`Turbidity`,min:1,max:20,value:m(),dec:1,step:.1,marks:[{t:0,l:`ARCTIC 1`},{t:2.4/19,l:`CLEAR 3.4`},{t:1,l:`SMOG 20`}],onInput:t=>{r(e,`turbidity`,t),Me()}}),me=Q({label:`Rayleigh`,min:0,max:4,value:d(),dec:2,step:.01,marks:[{t:0,l:`NONE`},{t:.3375,l:`EARTH 1.35`},{t:1,l:`4×`}],onInput:t=>{r(e,`rayleigh`,t),Me()}}),he=Q({label:`Ozone`,min:0,max:3,value:h(),dec:2,step:.01,marks:[{t:0,l:`NONE`},{t:1/3,l:`EARTH 1.0`},{t:1,l:`3×`}],onInput:t=>{r(e,`ozone`,t),Me()}});ce.append(fe,pe,me,he),o.appendChild(se);function ge(){let e=le.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(ue.width!==e*t||ue.height!==62*t)&&(ue.width=e*t,ue.height=62*t),ue.style.height=`62px`;let n=ue.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,62);let r=e-16,i=Math.min(.95,p()),a=e=>8+e/180*r,o=Math.log10(hf(1,i)+1)*1.1,s=e=>6+(1-Math.log10(e+1)/o)*43;n.font=`8px ui-sans-serif, system-ui`,n.strokeStyle=`rgba(255,255,255,.07)`,[45,90,135].forEach(e=>{n.beginPath(),n.moveTo(a(e),6),n.lineTo(a(e),s(0)),n.stroke()}),n.strokeStyle=`rgba(255,255,255,.10)`,n.beginPath(),n.moveTo(8,s(0)+.5),n.lineTo(8+r,s(0)+.5),n.stroke(),n.beginPath(),n.moveTo(a(0),s(0));for(let e=0;e<=180;e+=2)n.lineTo(a(e),s(hf(Math.cos(e*df),i)));n.lineTo(a(180),s(0)),n.closePath();let c=n.createLinearGradient(8,0,8+r,0);c.addColorStop(0,`rgba(255,244,214,.35)`),c.addColorStop(1,`rgba(160,190,230,.10)`),n.fillStyle=c,n.fill(),n.beginPath();for(let e=0;e<=180;e+=2){let t=s(hf(Math.cos(e*df),i));e===0?n.moveTo(a(e),t):n.lineTo(a(e),t)}n.strokeStyle=`rgba(255,255,255,.85)`,n.lineWidth=1.4,n.stroke(),n.lineWidth=1,n.fillStyle=`rgba(255,255,255,.30)`,[[0,`FORWARD`],[90,`90°`],[180,`BACK`]].forEach(([e,t],r)=>{n.textAlign=r===0?`left`:r===2?`right`:`center`,n.fillText(t,a(e),60)})}let _e=Z(`div`,`pcard mp-light sk-colour`);_e.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Colour</span><span class="s">Zenith · horizon · bounce</span></div>
    </div>`;let ve=Z(`div`,`pbody`);_e.appendChild(ve),_e.querySelector(`.mp-chead .l`).onclick=()=>_e.classList.toggle(`shut`);let ye=Z(`div`,`mp-meter sk-grad`);ye.innerHTML=`<div class="hd"><span class="k">horizon to zenith</span></div>`;let be=Z(`canvas`);ye.appendChild(be),ve.appendChild(ye);let xe=Z(`div`,`mp-subhead`,`<span class="k">zenith</span>`),Se=dd(a.zenith||`#2f6dd0`,t=>{r(e,`zenith`,t),Me()});xe.appendChild(Se);let Ce=Z(`div`,`mp-subhead`,`<span class="k">horizon</span>`),we=dd(a.horizon||`#9fc4e8`,t=>{r(e,`horizon`,t),Me()});Ce.appendChild(we);let W=Z(`div`,`mp-subhead`,`<span class="k">ground bounce</span>`),Te=dd(a.ground||`#14181d`,t=>{r(e,`ground`,t),Me()});W.appendChild(Te),ve.append(xe,Ce,W);let Ee=Q({label:`Sky light`,min:0,max:4,value:a.intensity??1,dec:2,unit:`×`,step:.05,marks:[{t:0,l:`DARK`},{t:.25,l:`REAL 1×`},{t:1,l:`4×`}],onInput:t=>{r(e,`intensity`,t),Me()}});ve.appendChild(Ee),o.appendChild(_e);function De(){let e=ye.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(be.width!==e*t||be.height!==46*t)&&(be.width=e*t,be.height=46*t),be.style.height=`46px`;let n=be.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,46);let r=e-16;for(let e=0;e<r;e++)n.fillStyle=mf(g(e/r*90,60)),n.fillRect(8+e,6,1.02,20);n.strokeStyle=`rgba(0,0,0,.35)`,n.strokeRect(8.5,6.5,r-1,19),n.font=`8px ui-sans-serif, system-ui`,[[0,`0° HORIZON`],[30,`30`],[60,`60`],[90,`90° ZENITH`]].forEach(([e,t],i)=>{let a=8+e/90*r;n.strokeStyle=`rgba(255,255,255,.18)`,n.beginPath(),n.moveTo(a,27),n.lineTo(a,31),n.stroke(),n.fillStyle=`rgba(255,255,255,.30)`,n.textAlign=i===0?`left`:i===3?`right`:`center`,n.fillText(t,a,43)})}let G=Z(`div`,`pcard mp-light sk-render`);G.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Rendering</span><span class="s">What the sky does to the scene</span></div>
    </div>`;let Oe=Z(`div`,`pbody`);G.appendChild(Oe),G.querySelector(`.mp-chead .l`).onclick=()=>G.classList.toggle(`shut`);let K=Z(`div`,`mp-tags`),ke=xd(`AERIAL PERSPECTIVE`,a.aerial!==!1,t=>{r(e,`aerial`,t),Me()}),Ae=xd(`SKY LIGHTS SCENE`,a.lightsScene!==!1,t=>{r(e,`lightsScene`,t),Me()});K.append(ke,Ae),Oe.appendChild(K);let je=Z(`div`,`mp-note`,``);Oe.appendChild(je),o.appendChild(G);function Me(){S(),D(),oe(),ge(),De();let e=_f(m(),f()),t=gf(m(),f());M.innerHTML=`${d().toFixed(2)}`,N.innerHTML=`${m().toFixed(1)}`,P.innerHTML=`${f().toFixed(3)}`,F.innerHTML=`${h().toFixed(2)}`,R.classList.toggle(`down`,e<5),R.querySelector(`.i`).innerHTML=X(e<5?`alert`:`eye`,{size:12}),R.querySelector(`.n`).innerHTML=`${e.toFixed(+(e<10))}<em>km</em>`,ee.querySelector(`.n`).innerHTML=`${(a.intensity??1).toFixed(2)}<em>×</em>`,B.textContent=Math.floor(e),V.textContent=`.${Math.round(e*10)%10}`,H.textContent=`${E().toLowerCase()} · β ${t.toFixed(3)} per km`,re.innerHTML=[[`rayleigh at 550`,`${ie(550).toFixed(3)}`],[`mie, flat`,`${ae().toFixed(3)}`],[`blue vs red`,`${(ie(450)/ie(650)).toFixed(1)}×`],[`forward g`,`${p().toFixed(2)}`]].map(([e,t])=>`<div><span class="k">${e}</span><b>${t}</b></div>`).join(``),je.textContent=`${a.aerial===!1?`Distance is not tinted by the air.`:`Distant geometry picks up the colour of the air between you and it.`} ${a.lightsScene===!1?`The sky is a backdrop only.`:`The sky itself lights the scene from every direction.`}`,fe._set(f()),pe._set(m()),me._set(d()),he._set(h()),Ee._set(a.intensity??1),de._set(p()),ke._set(a.aerial!==!1),Ae._set(a.lightsScene!==!1),Se._set&&Se._set(a.zenith||`#2f6dd0`),we._set&&we._set(a.horizon||`#9fc4e8`),Te._set&&Te._set(a.ground||`#14181d`)}s.push(Me),i&&i(()=>s.forEach(e=>e()));let Ne=new ResizeObserver(()=>{S(),oe(),ge(),De(),[fe,pe,me,he,Ee].forEach(e=>e._paint&&e._paint())});return Ne.observe(o),o._dispose=()=>Ne.disconnect(),requestAnimationFrame(Me),Me(),o}var bf=5200,xf=e=>{let t=parseInt((e||`#bcd4ff`).slice(1),16);return[t>>16&255,t>>8&255,t&255]},Sf=(e,t,n)=>{let r=xf(e),i=xf(t),a=Math.max(0,Math.min(1,n));return[r[0]+(i[0]-r[0])*a,r[1]+(i[1]-r[1])*a,r[2]+(i[2]-r[2])*a]},Cf=([e,t,n],r=1)=>`rgba(${Math.round(e)},${Math.round(t)},${Math.round(n)},${r})`,wf=e=>Math.round(bf*Math.min(1,Math.max(.02,e*1.4))),Tf=(e,t)=>2.6+Math.log(wf(e))/Math.log(2.512)*.42+Math.log2(Math.max(.05,t))*.35,Ef=[[`O`,0],[`B`,.12],[`A`,.26],[`F`,.42],[`G`,.58],[`K`,.74],[`M`,1]];function Df(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=Z(`div`,`mpanel starpanel`),s=[],c=(e,t,n)=>e.addEventListener(t,n),l=()=>a.density??.55,u=()=>a.brightness??1.15,d=()=>a.size??1.5,f=()=>a.twinkle??.45,p=()=>((a.rotation??24)%360+360)%360,m=()=>a.drift??.6,h=(e,t)=>{let n=Math.sin(e*127.1+t*311.7)*43758.5453;return n-Math.floor(n)},g=Array.from({length:900},(e,t)=>({u:h(t,1),v:h(t,2),mag:1+h(t,3)**.55*5.6,temp:h(t,4),tw:h(t,5)})),_=Z(`div`,`pcard mp-hero st-hero`),v=Z(`canvas`,`mp-sky`);v.title=`Drag to turn the sphere`;let y=Z(`div`,`mp-cap`,`<div class="l"><b class="st-name">—</b><span class="mp-illum st-sub">—</span></div>
     <div class="r"><span class="st-r">—</span></div>`);_.append(v,y),o.appendChild(_);let b=performance.now()/1e3,x=0,S=v.getContext(`2d`);function C(){let e=v.clientWidth||300,t=n?140:170,r=Math.min(devicePixelRatio||1,2);(v.width!==e*r||v.height!==t*r)&&(v.width=e*r,v.height=t*r),v.style.height=t+`px`;let i=S;i.setTransform(r,0,0,r,0,0),i.fillStyle=`#04060c`,i.fillRect(0,0,e,t);let o=(p()+x*m()*1.2)%360,s=o/360,c=Tf(l(),u()),h=a.warm||`#ffd7ae`,_=a.cool||`#bcd4ff`;if(a.milkyway!==!1){i.save(),i.translate(e/2,t/2),i.rotate(-.34);let n=i.createLinearGradient(0,-t*.42,0,t*.42);n.addColorStop(0,`rgba(150,170,220,0)`),n.addColorStop(.42,`rgba(150,170,220,.055)`),n.addColorStop(.5,`rgba(190,200,235,.10)`),n.addColorStop(.58,`rgba(150,170,220,.055)`),n.addColorStop(1,`rgba(150,170,220,0)`),i.fillStyle=n,i.fillRect(-e,-t*.42,e*2,t*.84);for(let t=0;t<5;t++)i.fillStyle=`rgba(4,6,12,${.1+t%3*.05})`,i.fillRect(-e,-6+t*4-2,e*2,2+t%2);i.restore()}let y=Math.min(g.length,Math.round(g.length*Math.min(1,Math.max(.02,l()*1.4))));for(let n=0;n<y;n++){let r=g[n];if(r.mag>c)continue;let a=(r.u+s)%1*e,o=r.v*t,l=2.512**(c-r.mag)/2.512**(c-1),p=1-f()*.55*(.5+.5*Math.sin(x*(2+r.tw*6)+r.tw*40)),m=Math.max(.05,Math.min(1,l*u()*p)),v=Math.max(.35,d()*(.35+l*.9)),y=Sf(_,h,r.temp);if(v>1.1){let e=i.createRadialGradient(a,o,0,a,o,v*3.4);e.addColorStop(0,Cf(y,m*.5)),e.addColorStop(1,Cf(y,0)),i.fillStyle=e,i.beginPath(),i.arc(a,o,v*3.4,0,Math.PI*2),i.fill()}i.fillStyle=Cf(y,m),i.beginPath(),i.arc(a,o,v,0,Math.PI*2),i.fill()}i.font=`8px ui-sans-serif, system-ui`,i.fillStyle=`rgba(255,255,255,.20)`;for(let n=0;n<360;n+=30){let r=((n-o)/360%1+1)%1*e;i.fillRect(r,t-8,1,n%90==0?5:3),n%90==0&&(i.textAlign=`center`,i.fillText(`${n}°`,r,t-10))}}let w=y.querySelector(`.st-name`),T=y.querySelector(`.st-sub`),E=y.querySelector(`.st-r`),D=()=>{let e=Tf(l(),u());return e<4?`City sky`:e<5?`Suburban sky`:e<5.8?`Rural sky`:e<6.4?`Dark sky`:`Desert sky`};function O(){w.textContent=D(),T.textContent=`${wf(l()).toLocaleString()} stars · ${d().toFixed(2)} px · twinkle ${f().toFixed(2)}`,E.innerHTML=`mag ${Tf(l(),u()).toFixed(1)}`}let k=null;c(v,`pointerdown`,e=>{v.setPointerCapture(e.pointerId),k=e.clientX,v.classList.add(`grabbing`)}),c(v,`pointermove`,t=>{if(k==null)return;let n=(t.clientX-k)/(v.clientWidth||300)*360;k=t.clientX,r(e,`rotation`,Math.round((p()-n+360)%360)),Ee()});let A=()=>{k=null,v.classList.remove(`grabbing`)};c(v,`pointerup`,A),c(v,`pointercancel`,A);let j=Z(`div`,`mp-rail`),M=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return j.appendChild(t),t.querySelector(`.v`)},N=M(`Stars`),P=M(`Limit`),F=M(`Size`),I=M(`Rotation`);o.appendChild(j);let L=Z(`div`,`mp-duo`),R=(e,t)=>{let n=Z(`div`,`pcard mp-stat`,`<span class="i">${e}</span><span class="l">${t}</span><b class="n">—</b>`);return L.appendChild(n),n},ee=R(X(`stars`,{size:12}),`Naked eye`),te=R(X(`motion`,{size:12}),`Full turn in`);o.appendChild(L);let z=Z(`div`,`pcard mp-metric st-mag`);z.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Magnitudes</span><span class="s">How many, how bright</span></div>
      <button class="mp-x" title="Taller chart">${X(`arrowout`,{size:12})}</button>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">stars</span></div>
    <div class="mp-k mp-target">Down to <span class="v">—</span></div>`;let ne=Z(`div`,`mp-chartwrap`),re=Z(`canvas`);ne.appendChild(re),z.appendChild(ne);let B=Z(`div`,`mp-spec st-specs`);z.appendChild(B);let V=z.querySelector(`.mp-num .i`),H=z.querySelector(`.mp-num .d`),ie=z.querySelector(`.mp-target .v`);z.querySelector(`.mp-x`).onclick=()=>{z.classList.toggle(`tall`),ae()},o.appendChild(z);function ae(){let e=ne.clientWidth||280,t=z.classList.contains(`tall`)?168:112,n=Math.min(devicePixelRatio||1,2);(re.width!==e*n||re.height!==t*n)&&(re.width=e*n,re.height=t*n),re.style.height=t+`px`;let r=re.getContext(`2d`);r.setTransform(n,0,0,n,0,0),r.clearRect(0,0,e,t);let i=Tf(l(),u()),a=wf(l()),o=[];for(let e=0;e<=7;e++)o.push(2.512**(e*.6));let s=o.reduce((e,t)=>e+t,0),c=o.map(e=>Math.round(e/s*a)),d=Math.max(...c)*1.15,f=t=>2+t/8*(e-2-32),p=e=>8+(1-e/d)*(t-8-16);r.font=`9px ui-sans-serif, system-ui`,[.25,.5,.75,1].forEach(t=>{r.strokeStyle=`rgba(255,255,255,.06)`,r.setLineDash([2,5]),r.beginPath(),r.moveTo(f(0),p(d*t)),r.lineTo(f(8),p(d*t)),r.stroke(),r.setLineDash([]),r.fillStyle=`rgba(255,255,255,.26)`,r.textAlign=`left`,r.fillText(String(Math.round(d*t)),e-32+5,p(d*t)+3)});let m=(f(1)-f(0))*.72;c.forEach((e,t)=>{let n=t<=i,a=f(t+.5)-m/2;r.fillStyle=n?`rgba(190,206,255,.75)`:`rgba(255,255,255,.07)`,r.fillRect(a,p(e),m,p(0)-p(e)),n&&(r.fillStyle=`rgba(255,255,255,.45)`,r.textAlign=`center`,r.font=`8px ui-sans-serif, system-ui`,r.fillText(String(e),a+m/2,p(e)-3),r.font=`9px ui-sans-serif, system-ui`)});let h=f(i);r.strokeStyle=`rgba(255,255,255,.55)`,r.setLineDash([3,3]),r.beginPath(),r.moveTo(h,8),r.lineTo(h,p(0)),r.stroke(),r.setLineDash([]),r.fillStyle=`rgba(255,255,255,.55)`,r.textAlign=i>5?`right`:`left`,r.font=`8px ui-sans-serif, system-ui`,r.fillText(`LIMIT ${i.toFixed(1)}`,h+(i>5?-4:4),16),r.font=`9px ui-sans-serif, system-ui`,r.fillStyle=`rgba(255,255,255,.26)`,r.textAlign=`center`;for(let e=0;e<=7;e++)r.fillText(String(e),f(e+.5),t-3);r.textAlign=`left`,r.fillStyle=`rgba(255,255,255,.20)`,r.font=`8px ui-sans-serif, system-ui`,r.fillText(`MAGNITUDE — BRIGHTER TO FAINTER`,f(0),15)}let oe=Z(`div`,`pcard mp-light st-field`);oe.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Field</span><span class="s">Density · brightness · size</span></div>
    </div>`;let se=Z(`div`,`pbody`);oe.appendChild(se),oe.querySelector(`.mp-chead .l`).onclick=()=>oe.classList.toggle(`shut`);let ce=Q({label:`Density`,min:0,max:1,value:l(),dec:2,step:.01,marks:[{t:0,l:`EMPTY`},{t:.55,l:`RURAL`},{t:1,l:`FULL 5 200`}],onInput:t=>{r(e,`density`,t),Ee()}}),le=Q({label:`Brightness`,min:0,max:3,value:u(),dec:2,unit:`×`,step:.01,marks:[{t:0,l:`OFF`},{t:1/3,l:`REAL 1×`},{t:1,l:`3×`}],onInput:t=>{r(e,`brightness`,t),Ee()}}),ue=Q({label:`Point size`,min:.4,max:4,value:d(),dec:2,unit:`px`,step:.05,marks:[{t:0,l:`PIN`},{t:1.1/3.6,l:`SHARP 1.5`},{t:1,l:`BLOOM`}],onInput:t=>{r(e,`size`,t),Ee()}}),de=Q({label:`Twinkle`,min:0,max:1,value:f(),dec:2,step:.01,marks:[{t:0,l:`STEADY`},{t:.45,l:`AIR`},{t:1,l:`HEAT HAZE`}],onInput:t=>{r(e,`twinkle`,t),Ee()}});se.append(ce,le,ue,de),o.appendChild(oe);let U=Z(`div`,`pcard mp-light st-class`);U.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Classes</span><span class="s">Cool blue to warm amber</span></div>
    </div>`;let fe=Z(`div`,`pbody`);U.appendChild(fe),U.querySelector(`.mp-chead .l`).onclick=()=>U.classList.toggle(`shut`);let pe=Z(`div`,`mp-meter st-ramp`);pe.innerHTML=`<div class="hd"><span class="k">spectral ramp</span></div>`;let me=Z(`canvas`);pe.appendChild(me),fe.appendChild(pe);let he=Z(`div`,`mp-subhead`,`<span class="k">cool class</span>`),ge=dd(a.cool||`#bcd4ff`,t=>{r(e,`cool`,t),Ee()});he.appendChild(ge);let _e=Z(`div`,`mp-subhead`,`<span class="k">warm class</span>`),ve=dd(a.warm||`#ffd7ae`,t=>{r(e,`warm`,t),Ee()});_e.appendChild(ve),fe.append(he,_e),o.appendChild(U);function ye(){let e=pe.clientWidth||280,t=Math.min(devicePixelRatio||1,2);(me.width!==e*t||me.height!==48*t)&&(me.width=e*t,me.height=48*t),me.style.height=`48px`;let n=me.getContext(`2d`);n.setTransform(t,0,0,t,0,0),n.clearRect(0,0,e,48);let r=e-16;for(let e=0;e<r;e++)n.fillStyle=Cf(Sf(a.cool||`#bcd4ff`,a.warm||`#ffd7ae`,e/r)),n.fillRect(8+e,6,1.02,16);n.strokeStyle=`rgba(0,0,0,.35)`,n.strokeRect(8.5,6.5,r-1,15);let i=Tf(l(),u()),o=Math.min(g.length,Math.round(g.length*Math.min(1,Math.max(.02,l()*1.4))));for(let e=0;e<o;e+=2){let t=g[e];if(t.mag>i)continue;let o=8+t.temp*r,s=28+e*37%7;n.fillStyle=Cf(Sf(a.cool||`#bcd4ff`,a.warm||`#ffd7ae`,t.temp),.5),n.fillRect(o,s,1.4,1.4)}n.font=`8px ui-sans-serif, system-ui`,Ef.forEach(([e,t],i)=>{let a=8+t*r;n.fillStyle=`rgba(0,0,0,.55)`,n.textAlign=i===0?`left`:i===Ef.length-1?`right`:`center`,n.fillText(e,Math.max(11,Math.min(8+r-3,a)),17)}),n.fillStyle=`rgba(255,255,255,.28)`,n.textAlign=`left`,n.fillText(`30 000 K`,8,46),n.textAlign=`right`,n.fillText(`3 000 K`,8+r,46)}let be=Z(`div`,`pcard mp-light st-sphere`);be.innerHTML=`
    <div class="mp-chead">
      <div class="l"><span class="t">Sphere</span><span class="s">Rotation · sidereal drift</span></div>
    </div>`;let xe=Z(`div`,`pbody`);be.appendChild(xe),be.querySelector(`.mp-chead .l`).onclick=()=>be.classList.toggle(`shut`);let Se=Q({label:`Rotation`,min:0,max:360,value:p(),dec:0,unit:`°`,step:1,marks:[{t:0,l:`0°`},{t:.25,l:`90`},{t:.5,l:`180`},{t:.75,l:`270`},{t:1,l:`360`}],onInput:t=>{r(e,`rotation`,Math.round(t)%360),Ee()}}),Ce=Q({label:`Sidereal drift`,min:0,max:4,value:m(),dec:2,unit:`×`,step:.05,marks:[{t:0,l:`FIXED`},{t:.15,l:`REAL 0.6`},{t:1,l:`4×`}],onInput:t=>{r(e,`drift`,t),Ee()}}),we=Z(`div`,`mp-tags`),W=xd(`GALACTIC BAND`,a.milkyway!==!1,t=>{r(e,`milkyway`,t),Ee()});we.appendChild(W),xe.append(Se,Ce,we);let Te=Z(`div`,`mp-note`,``);xe.appendChild(Te),o.appendChild(be);function Ee(){O(),ae(),ye();let e=wf(l()),t=Tf(l(),u()),n=m()>.01?1440/(m()*120):1/0;N.innerHTML=`${e.toLocaleString()}`,P.innerHTML=`${t.toFixed(1)}<em>mag</em>`,F.innerHTML=`${d().toFixed(2)}<em>px</em>`,I.innerHTML=`${Math.round(p())}<em>°</em>`,ee.querySelector(`.n`).innerHTML=`${Math.min(e,Math.round(e*.42)).toLocaleString()}`,te.classList.toggle(`down`,m()<.01),te.querySelector(`.n`).innerHTML=m()<.01?`never`:n>90?`${(n/60).toFixed(1)}<em>h</em>`:`${n.toFixed(0)}<em>min</em>`,V.textContent=e.toLocaleString(),H.textContent=``,ie.textContent=`magnitude ${t.toFixed(1)} · ${D().toLowerCase()}`,B.innerHTML=[[`brightest`,`mag 1.0`],[`faintest drawn`,`mag ${t.toFixed(1)}`],[`per square degree`,`${(e/41253).toFixed(3)}`],[`galactic band`,a.milkyway===!1?`hidden`:`shown`]].map(([e,t])=>`<div><span class="k">${e}</span><b>${t}</b></div>`).join(``),Te.textContent=m()<.01?`The sphere is pinned — the sky will not move at all.`:`At ${m().toFixed(2)}× the sky comes back round every ${n>90?`${(n/60).toFixed(1)} hours`:`${n.toFixed(0)} minutes`}.`,ce._set(l()),le._set(u()),ue._set(d()),de._set(f()),Se._set(p()),Ce._set(m()),W._set(a.milkyway!==!1),ge._set&&ge._set(a.cool||`#bcd4ff`),ve._set&&ve._set(a.warm||`#ffd7ae`)}let De=0,G=!0,Oe=!0,K=new IntersectionObserver(e=>{Oe=e[0].isIntersecting},{threshold:0});K.observe(_);let ke=()=>{if(!G)return;let e=performance.now()/1e3,t=Math.min(.12,e-b);b=e,Oe&&(x+=t,C()),De=requestAnimationFrame(ke)};De=requestAnimationFrame(ke),s.push(Ee),i&&i(()=>s.forEach(e=>e()));let Ae=new ResizeObserver(()=>{C(),ae(),ye(),[ce,le,ue,de,Se,Ce].forEach(e=>e._paint&&e._paint())});return Ae.observe(o),o._dispose=()=>{G=!1,cancelAnimationFrame(De),Ae.disconnect(),K.disconnect()},Ee(),o}var Of=(e,t,n)=>Math.max(t,Math.min(n,e)),kf=e=>{let t=parseInt((e||`#8fa4bb`).slice(1),16);return[t>>16&255,t>>8&255,t&255]},Af=(e,t=1)=>`rgba(${e.map(Math.round).join(`,`)},${t})`,jf=(e,t)=>Math.exp(-((Math.max(0,e)*t)**2)),Mf=e=>e<=0?9999:Math.sqrt(-Math.log(.02))/e,Nf=(e,t,n)=>e*Math.exp(-Math.max(0,n)/Math.max(1,t)),Pf=e=>e>1e3?`Mist`:e>500?`Light fog`:e>200?`Moderate fog`:e>50?`Thick fog`:`Dense fog`;function Ff(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=Z(`div`,`mpanel fogpanel`),s=()=>a.density??.011,c=()=>a.height??42,l=()=>a.sunScatter??.7,u=()=>a.color||`#8fa4bb`,d=(e,t,n)=>e.addEventListener(t,n),f=Z(`div`,`pcard mp-hero fg-hero`),p=Z(`canvas`);p.title=`Drag across for density; up and down for layer height`;let m=Z(`div`,`mp-cap`,`<div class="l"><b>—</b><span class="mp-illum fg-sub">—</span></div><div class="r">—</div>`);f.append(p,m),o.appendChild(f);let h=null;function g(e,t){let n=e.clientWidth||290,r=Math.min(devicePixelRatio||1,2);(e.width!==n*r||e.height!==t*r)&&(e.width=n*r,e.height=t*r),e.style.height=t+`px`;let i=e.getContext(`2d`);return i.setTransform(r,0,0,r,0,0),[i,n,t]}function _(){let[e,t,r]=g(p,n?138:166),i=kf(u()),a=r*.42,o=e.createLinearGradient(0,0,0,r);o.addColorStop(0,`#090b0e`),o.addColorStop(.42,`#181d22`),o.addColorStop(1,`#08090a`),e.fillStyle=o,e.fillRect(0,0,t,r),e.strokeStyle=`rgba(255,255,255,.075)`,e.lineWidth=1;for(let n=-7;n<=7;n++){let i=t/2+n*t*.13;e.beginPath(),e.moveTo(t/2,a),e.lineTo(i,r),e.stroke()}for(let n=1;n<=12;n++){let i=a+(n/12)**1.75*(r-a);e.beginPath(),e.moveTo(0,i),e.lineTo(t,i),e.stroke()}let l=[10,25,50,100,200,400];l.slice().reverse().forEach((n,i)=>{let o=l.indexOf(n)/(l.length-1),c=.16+(1-o)*.7,u=t/2,d=a+(1-o)*(r-a)*.82,f=r*.58*c,p=t*.36*c,m=jf(s(),n);e.strokeStyle=`rgba(255,255,255,${.05+m*.58})`,e.strokeRect(u-p/2,d-f,p,f),e.fillStyle=`rgba(255,255,255,${.12+m*.55})`,e.font=`8px ui-sans-serif,system-ui`,e.textAlign=`center`,e.fillText(`${n} m`,u,d-f+10),i===0&&e.fillRect(u-1,d-f*.48,2,f*.48)});for(let n=0;n<r;n+=3){let r=Math.max(0,(a-n)/Math.max(1,a)*200);e.fillStyle=Af(i,Of(Nf(s(),c(),r)/.06,0,1)*.38+(n>a?Of(s()/.06,0,1)*.12:0)),e.fillRect(0,n,t,3.2)}let d=Mf(s()),f=8+Of(d/400,0,1)*(t-16);e.strokeStyle=`rgba(255,255,255,.72)`,e.setLineDash([3,3]),e.beginPath(),e.moveTo(f,9),e.lineTo(f,r-10),e.stroke(),e.setLineDash([]),e.fillStyle=`rgba(255,255,255,.7)`,e.textAlign=f>t-45?`right`:`left`,e.fillText(`2% CONTRAST`,f+(f>t-45?-4:4),17),h&&(e.strokeStyle=`rgba(255,255,255,.4)`,e.setLineDash([2,3]),e.beginPath(),e.moveTo(h.x,0),e.lineTo(h.x,r),e.moveTo(0,h.y),e.lineTo(t,h.y),e.stroke(),e.setLineDash([])),m.querySelector(`b`).textContent=Pf(d),m.querySelector(`.fg-sub`).textContent=`exponential² · ${s().toFixed(4)} per metre`,m.querySelector(`.r`).textContent=d>=1e3?`${(d/1e3).toFixed(1)} km sight`:`${d.toFixed(0)} m sight`}let v=t=>{let n=p.getBoundingClientRect(),i=Of((t.clientX-n.left)/n.width,0,1),a=Of((t.clientY-n.top)/n.height,0,1);h={x:i*n.width,y:a*n.height},r(e,`density`,+(i*.06).toFixed(4)),r(e,`height`,Math.round(1+(1-a)*199)),U()};d(p,`pointerdown`,e=>{p.setPointerCapture(e.pointerId),p.classList.add(`grabbing`),v(e)}),d(p,`pointermove`,e=>{p.hasPointerCapture?.(e.pointerId)&&v(e)});let y=()=>{h=null,p.classList.remove(`grabbing`),_()};d(p,`pointerup`,y),d(p,`pointercancel`,y);let b=Z(`div`,`mp-rail`),x=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return b.append(t),t.querySelector(`.v`)},S=x(`Density`),C=x(`Sight`),w=x(`Ceiling`),T=x(`Scatter`);o.append(b);let E=Z(`div`,`mp-duo`),D=(e,t)=>{let n=Z(`div`,`pcard mp-stat`,`<span class="i">${X(e,{size:12})}</span><span class="l">${t}</span><b class="n">—</b>`);return E.append(n),n},O=D(`eye`,`Contrast at 50 m`),k=D(`fog`,`WMO character`);o.append(E);let A=Z(`div`,`pcard mp-metric fg-vis`);A.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Visibility</span><span class="s">Contrast transmission · 0–400 m</span></div><button class="mp-x">${X(`arrowout`,{size:12})}</button></div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">m</span></div>
    <div class="mp-k mp-target">Sight range <span class="v">2% contrast threshold</span></div>`;let j=Z(`div`,`mp-chartwrap`),M=Z(`canvas`);j.append(M),A.append(j),o.append(A),A.querySelector(`.mp-x`).onclick=()=>{A.classList.toggle(`tall`),N()};function N(){let[e,t,n]=g(M,A.classList.contains(`tall`)?170:112);e.clearRect(0,0,t,n);let r=e=>8+e/400*(t-8-30),i=e=>8+(1-e)*(n-8-18);e.font=`8px ui-sans-serif,system-ui`,[.02,.25,.5,.75,1].forEach(n=>{e.strokeStyle=n===.02?`rgba(239,68,68,.45)`:`rgba(255,255,255,.07)`,e.setLineDash(n===.02?[3,3]:[2,5]),e.beginPath(),e.moveTo(8,i(n)),e.lineTo(t-30,i(n)),e.stroke(),e.setLineDash([]),e.fillStyle=`rgba(255,255,255,.28)`,e.textAlign=`left`,e.fillText(`${Math.round(n*100)}%`,t-30+5,i(n)+3)});let a=e.createLinearGradient(0,8,0,n-18);a.addColorStop(0,Af(kf(u()),.38)),a.addColorStop(1,Af(kf(u()),.03)),e.beginPath(),e.moveTo(r(0),i(0));for(let t=0;t<=400;t+=2)e.lineTo(r(t),i(jf(s(),t)));e.lineTo(r(400),i(0)),e.closePath(),e.fillStyle=a,e.fill(),e.beginPath();for(let t=0;t<=400;t+=2)t?e.lineTo(r(t),i(jf(s(),t))):e.moveTo(r(t),i(1));e.strokeStyle=`rgba(255,255,255,.9)`,e.lineWidth=1.5,e.stroke(),e.lineWidth=1,[0,100,200,300,400].forEach((t,i)=>{e.fillStyle=`rgba(255,255,255,.27)`,e.textAlign=i?i===4?`right`:`center`:`left`,e.fillText(i===2?`200 m`:t,r(t),n-3)});let o=r(Of(Mf(s()),0,400));e.fillStyle=`#fff`,e.beginPath(),e.arc(o,i(.02),3,0,Math.PI*2),e.fill()}let P=t=>{let n=M.getBoundingClientRect();r(e,`density`,+(Of((t.clientX-n.left-8)/Math.max(1,n.width-38),0,1)*.06).toFixed(4)),U()};d(M,`pointerdown`,e=>{M.setPointerCapture(e.pointerId),M.classList.add(`drag`),P(e)}),d(M,`pointermove`,e=>{M.hasPointerCapture?.(e.pointerId)&&P(e)}),d(M,`pointerup`,e=>{M.releasePointerCapture?.(e.pointerId),M.classList.remove(`drag`)});let F=Z(`div`,`pcard mp-light fg-layer`);F.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Layer</span><span class="s">Extinction with altitude</span></div></div>`;let I=Z(`div`,`pbody`);F.append(I);let L=Z(`div`,`mp-meter fg-profile`,`<div class="hd"><span class="k">vertical profile</span></div>`),R=Z(`canvas`);L.append(R),I.append(L);let ee=bd({value:c(),min:1,max:200,dec:0,step:1,unit:`m`,onInput:t=>{r(e,`height`,t),U()}});L.querySelector(`.hd`).append(ee);let te=Q({label:`Density at datum`,min:0,max:.06,value:s(),dec:4,step:5e-4,marks:[{t:0,l:`CLEAR 0`},{t:.183,l:`FOG .011`},{t:1,l:`OPAQUE .060`}],onInput:t=>{r(e,`density`,+t.toFixed(4)),U()}}),z=Q({label:`Height falloff`,min:1,max:200,value:c(),dec:0,step:1,unit:`m`,marks:[{t:0,l:`1 m`},{t:.206,l:`LOW 42`},{t:1,l:`200 m`}],onInput:t=>{r(e,`height`,Math.round(t)),U()}});I.append(te,z),o.append(F),F.querySelector(`.mp-chead .l`).onclick=()=>F.classList.toggle(`shut`);function ne(){let[e,t,n]=g(R,96);e.clearRect(0,0,t,n);let r=e=>5+(1-e/200)*(n-5-14),i=e=>32+e/.06*(t-32-8);[0,50,100,150,200].forEach(n=>{e.strokeStyle=`rgba(255,255,255,.07)`,e.beginPath(),e.moveTo(32,r(n)),e.lineTo(t-8,r(n)),e.stroke(),e.fillStyle=`rgba(255,255,255,.28)`,e.font=`8px ui-sans-serif,system-ui`,e.textAlign=`right`,e.fillText(n===100?`100 m`:n,27,r(n)+3)});let a=e.createLinearGradient(32,0,t-8,0);a.addColorStop(0,Af(kf(u()),.04)),a.addColorStop(1,Af(kf(u()),.5)),e.beginPath(),e.moveTo(32,r(0));for(let t=0;t<=200;t+=2)e.lineTo(i(Nf(s(),c(),t)),r(t));e.lineTo(32,r(200)),e.closePath(),e.fillStyle=a,e.fill(),e.beginPath();for(let t=0;t<=200;t+=2)t?e.lineTo(i(Nf(s(),c(),t)),r(t)):e.moveTo(i(s()),r(0));e.strokeStyle=`rgba(255,255,255,.85)`,e.lineWidth=1.4,e.stroke(),e.lineWidth=1;let o=r(c());e.setLineDash([3,3]),e.strokeStyle=`rgba(255,255,255,.38)`,e.beginPath(),e.moveTo(32,o),e.lineTo(t-8,o),e.stroke(),e.setLineDash([]),e.fillStyle=`#fff`,e.beginPath(),e.arc(i(s()/Math.E),o,3,0,Math.PI*2),e.fill()}let re=t=>{let n=R.getBoundingClientRect();r(e,`height`,Math.round(Of((1-(t.clientY-n.top-5)/Math.max(1,n.height-19))*200,1,200))),U()};d(R,`pointerdown`,e=>{R.setPointerCapture(e.pointerId),R.classList.add(`drag`),re(e)}),d(R,`pointermove`,e=>{R.hasPointerCapture?.(e.pointerId)&&re(e)}),d(R,`pointerup`,e=>R.releasePointerCapture?.(e.pointerId));let B=Z(`div`,`pcard mp-light fg-scatter`);B.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Light transport</span><span class="s">Forward sun scatter through the volume</span></div></div>`;let V=Z(`div`,`pbody`);B.append(V);let H=Z(`div`,`mp-meter fg-chamber`,`<div class="hd"><span class="k">beam chamber</span></div>`),ie=Z(`canvas`);H.append(ie),V.append(H);let ae=Q({label:`Sun scatter`,min:0,max:2,value:l(),dec:2,step:.02,marks:[{t:0,l:`FLAT 0`},{t:.35,l:`NATURAL .70`},{t:1,l:`HALO 2`}],onInput:t=>{r(e,`sunScatter`,t),U()}});V.append(ae);let oe=Z(`div`,`mp-subhead`,`<span class="k">volume colour</span>`),se=dd(u(),t=>{r(e,`color`,t),U()});oe.append(se),V.append(oe);let ce=Z(`div`,`mp-tags`),le=xd(`VOLUME ENABLED`,a.enabled!==!1,t=>{r(e,`enabled`,t),U()});ce.append(le),V.append(ce);let ue=Z(`div`,`mp-note`);V.append(ue),o.append(B),B.querySelector(`.mp-chead .l`).onclick=()=>B.classList.toggle(`shut`);function de(){let[e,t,n]=g(ie,74);e.clearRect(0,0,t,n),e.fillStyle=`#070809`,e.fillRect(0,0,t,n);let r=n/2,i=kf(u()),a=l();for(let n=0;n<t;n+=2){let o=n/t,c=3+o*o*(12+a*22),l=(.03+a*.1)*jf(s(),o*120),u=e.createLinearGradient(0,r-c,0,r+c);u.addColorStop(0,Af(i,0)),u.addColorStop(.5,Af(i,l)),u.addColorStop(1,Af(i,0)),e.fillStyle=u,e.fillRect(n,r-c,2.1,c*2)}e.fillStyle=`rgba(255,247,220,.95)`,e.beginPath(),e.arc(10,r,4,0,Math.PI*2),e.fill(),e.strokeStyle=`rgba(255,255,255,.13)`,e.beginPath(),e.moveTo(10,r),e.lineTo(t-8,r),e.stroke(),e.fillStyle=`rgba(255,255,255,.3)`,e.font=`8px ui-sans-serif,system-ui`,e.textAlign=`left`,e.fillText(`SUN`,7,10),e.textAlign=`right`,e.fillText(`${(jf(s(),120)*100).toFixed(0)}% AT 120 m`,t-7,n-6)}function U(){let e=Mf(s()),t=jf(s(),50);_(),N(),ne(),de(),S.textContent=s().toFixed(4),C.innerHTML=e>=1e3?`${(e/1e3).toFixed(1)}<em>km</em>`:`${e.toFixed(0)}<em>m</em>`,w.innerHTML=`${c().toFixed(0)}<em>m</em>`,T.textContent=l().toFixed(2),O.querySelector(`.n`).innerHTML=`${(t*100).toFixed(0)}<em>%</em>`,O.classList.toggle(`down`,t<.1),O.querySelector(`.i`).innerHTML=X(t<.1?`alert`:`eye`,{size:12}),k.querySelector(`.n`).innerHTML=Pf(e).replace(` fog`,`<em> fog</em>`);let n=Math.floor(Math.min(e,9999)),r=Math.round(e*10)%10;A.querySelector(`.mp-num .i`).textContent=n,A.querySelector(`.mp-num .d`).textContent=`.${r}`,A.querySelector(`.mp-num .u`).textContent=e>=1e3?`m+`:`m`,ee._set(c()),te._set(s()),z._set(c()),ae._set(l()),le._set(a.enabled!==!1),se._set?.(u()),ue.textContent=`${a.enabled===!1?`The volume is bypassed.`:`${Pf(e)} is active.`} At one falloff height (${c().toFixed(0)} m), density is 37% of its datum value. Sun scatter is ${l()<.3?`flat`:l()<1.2?`natural`:`strong`}.`,o.classList.toggle(`disabled`,a.enabled===!1)}i?.(U);let fe=new ResizeObserver(()=>{_(),N(),ne(),de(),[te,z,ae].forEach(e=>e._paint?.())});return fe.observe(o),o._dispose=()=>fe.disconnect(),requestAnimationFrame(U),U(),o}var If=e=>String(e).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]);function Lf(e,t){let{compact:n=!1,setProp:r,register:i,onDirty:a}=t,o=Z(`div`,`mpanel folderpanel`),s=()=>{let t=[],n=e=>e.forEach(e=>{t.push(e),n(e.kids||[])});return n(e.kids),t},c=()=>s().filter(e=>!Yl(e)),l=()=>e.props.tint||`#c9a24b`,u=Z(`div`,`pcard mp-hero fd-hero`),d=Z(`canvas`),f=Z(`div`,`mp-cap`,`<div class="l"><b>Collection</b><span class="mp-illum fd-sub">—</span></div><div class="r">—</div>`);u.append(d,f),o.append(u);function p(e,t){let n=e.clientWidth||290,r=Math.min(devicePixelRatio||1,2);(e.width!==n*r||e.height!==t*r)&&(e.width=n*r,e.height=t*r),e.style.height=t+`px`;let i=e.getContext(`2d`);return i.setTransform(r,0,0,r,0,0),[i,n,t]}function m(){let[t,r,i]=p(d,n?132:154),a=s();t.clearRect(0,0,r,i),t.fillStyle=`#070707`,t.fillRect(0,0,r,i);let o=i/2;t.strokeStyle=`rgba(255,255,255,.12)`,t.lineWidth=1,t.beginPath(),t.moveTo(27,o),t.lineTo(r-15,o),t.stroke(),t.fillStyle=l(),t.beginPath(),t.arc(18,o,6,0,Math.PI*2),t.fill();let u=e.kids.length||1,m=(i-28)/u;e.kids.forEach((e,n)=>{let i=14+m*(n+.5);t.strokeStyle=`rgba(255,255,255,.15)`,t.beginPath(),t.moveTo(24,o),t.bezierCurveTo(42,o,42,i,70,i),t.stroke();let a=e.props?.tint||Xl(e).color;if(t.fillStyle=a,t.beginPath(),t.arc(70,i,Yl(e)?4.5:3,0,Math.PI*2),t.fill(),t.fillStyle=e.vis===!1?`rgba(255,255,255,.22)`:`rgba(255,255,255,.72)`,t.font=`9px ui-sans-serif,system-ui`,t.textAlign=`left`,t.fillText(e.name,79,i+3),Yl(e)&&e.kids.length){let n=Math.min(r-20,158);t.strokeStyle=`rgba(255,255,255,.10)`,t.beginPath(),t.moveTo(75,i),t.lineTo(n,i),t.stroke(),e.kids.slice(0,7).forEach((e,r)=>{let a=n+r*12;t.fillStyle=e.vis===!1?`rgba(255,255,255,.16)`:Xl(e).color,t.fillRect(a-2,i-2,4,4)})}}),t.fillStyle=`rgba(255,255,255,.25)`,t.font=`8px ui-sans-serif,system-ui`,t.textAlign=`right`,t.fillText(`ROOT  /  DIRECT CHILDREN  /  DESCENDANTS`,r-10,i-7),f.querySelector(`.fd-sub`).textContent=`${e.kids.length} direct · ${a.length} total · depth ${Math.max(0,...a.map(t=>(t.depth??e.depth)-(e.depth??0)))}`,f.querySelector(`.r`).textContent=`${c().filter(e=>e.vis!==!1).length} / ${c().length} visible`}let h=Z(`div`,`mp-rail`),g=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return h.append(t),t.querySelector(`.v`)},_=g(`Direct`),v=g(`Total`),y=g(`Visible`),b=g(`Dynamic`);o.append(h);let x=Z(`div`,`pcard mp-metric fd-comp`);x.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Composition</span><span class="s">Entity classes in this collection</span></div></div><div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">entities</span></div>`;let S=Z(`div`,`fd-donut`),C=Z(`canvas`),w=Z(`div`,`fd-legend`);S.append(C,w),x.append(S),o.append(x);function T(){let e=c(),t=new Map;e.forEach(e=>{let n=Xl(e).cat||`Scene`,r=t.get(n)||{n:0,c:Xl(e).color};r.n++,t.set(n,r)});let[n,r,i]=p(C,128);n.clearRect(0,0,r,i);let a=Math.min(65,r*.25),o=i/2,s=Math.max(1,e.length),l=-Math.PI/2;[...t].forEach(([e,t])=>{let r=t.n/s*Math.PI*2;n.beginPath(),n.arc(a,o,42,l,l+r),n.arc(a,o,28,l+r,l,!0),n.closePath(),n.fillStyle=t.c,n.globalAlpha=.78,n.fill(),n.globalAlpha=1,l+=r}),n.fillStyle=`#f0f0f0`,n.font=`300 28px ui-sans-serif,system-ui`,n.textAlign=`center`,n.fillText(e.length,a,o+7),n.fillStyle=`rgba(255,255,255,.35)`,n.font=`8px ui-sans-serif,system-ui`,n.fillText(`TOTAL`,a,o+20),w.innerHTML=[...t].map(([e,t])=>`<div><i style="background:${t.c}"></i><span>${If(e)}</span><b>${t.n}</b></div>`).join(``)||`<div><span>EMPTY COLLECTION</span><b>0</b></div>`}let E=Z(`div`,`pcard mp-light fd-manifest`);E.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Manifest</span><span class="s">Direct children · live state</span></div></div>`;let D=Z(`div`,`pbody fd-list`);E.append(D),o.append(E),E.querySelector(`.mp-chead .l`).onclick=()=>E.classList.toggle(`shut`);function O(){if(D.innerHTML=``,!e.kids.length){D.innerHTML=`<div class="fd-empty">NO ENTITIES IN THIS COLLECTION</div>`;return}e.kids.forEach(e=>{let t=Z(`div`,`fd-row`);t.innerHTML=`<span class="fd-ic">${X(Xl(e).icon,{size:14,color:e.props?.tint||Xl(e).color})}</span><span class="fd-who"><b>${If(e.name)}</b><em>${If(Xl(e).label)}${Yl(e)?` · ${e.kids.length} children`:``}</em></span><button class="fd-eye" title="Toggle visibility">${X(e.vis===!1?`eyeoff`:`eye`,{size:13})}</button>`,t.querySelector(`.fd-eye`).onclick=()=>{e.vis=e.vis===!1,vd.emit(`treechange`),a?.(),L()},D.append(t)})}let k=Z(`div`,`pcard mp-light fd-state`);k.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Collection state</span><span class="s">One control for the whole branch</span></div></div>`;let A=Z(`div`,`pbody`);k.append(A);let j=Z(`div`,`mp-tags`),M=xd(`BRANCH VISIBLE`,e.vis!==!1,t=>{e.vis=t,vd.emit(`treechange`),a?.(),L()}),N=xd(`EXPANDED`,e.open!==!1,t=>{e.open=t,vd.emit(`treechange`),L()});j.append(M,N),A.append(j);let P=Z(`div`,`mp-subhead`,`<span class="k">collection colour</span>`),F=dd(l(),t=>{r(e,`tint`,t),vd.emit(`treechange`),L()});P.append(F),A.append(P);let I=Z(`div`,`mp-note`);A.append(I),o.append(k);function L(){let t=s(),n=c(),r=n.filter(e=>e.vis!==!1).length,i=n.filter(e=>e.dynamic).length;m(),T(),O(),_.textContent=e.kids.length,v.textContent=t.length,y.textContent=r,b.textContent=i,x.querySelector(`.mp-num .i`).textContent=n.length,M._set(e.vis!==!1),N._set(e.open!==!1),F._set?.(l()),I.textContent=`${e.name} contains ${n.length} renderable ${n.length===1?`entity`:`entities`}. ${n.length-r} hidden, ${n.filter(e=>e.locked).length} locked, ${i} dynamic.`}i?.(L);let R=new ResizeObserver(()=>{m(),T()});return R.observe(o),o._dispose=()=>R.disconnect(),requestAnimationFrame(L),L(),o}var Rf=(e,t,n)=>Math.max(t,Math.min(n,e)),zf=e=>{let t=parseInt((e||`#c9ccd1`).slice(1),16);return[t>>16&255,t>>8&255,t&255]},Bf=(e,t=1)=>`rgba(${e.map(Math.round).join(`,`)},${t})`,Vf=e=>{let[t,n,r]=zf(e).map(e=>e/255);return .2126*t+.7152*n+.0722*r};function Hf(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=Xl(e),s=Z(`div`,`mpanel geopanel`),c=()=>a.pos||[0,0,0],l=()=>a.rot||[0,0,0],u=()=>a.scale||[1,1,1],d=(e,t)=>{let n=e.clientWidth||290,r=Math.min(devicePixelRatio||1,2);(e.width!==n*r||e.height!==t*r)&&(e.width=n*r,e.height=t*r),e.style.height=t+`px`;let i=e.getContext(`2d`);return i.setTransform(r,0,0,r,0,0),[i,n,t]},f=(e,t,n)=>{if(t===`sphere`){e.beginPath(),e.arc(0,0,n,0,Math.PI*2);return}if(t===`torus`){e.beginPath(),e.ellipse(0,0,n,n*.42,0,0,Math.PI*2),e.ellipse(0,0,n*.46,n*.17,0,0,Math.PI*2,!0);return}if(t===`cylinder`){e.beginPath(),e.ellipse(0,-n*.55,n*.65,n*.22,0,Math.PI,Math.PI*2),e.lineTo(n*.65,n*.55),e.ellipse(0,n*.55,n*.65,n*.22,0,0,Math.PI),e.closePath();return}if(t===`plane`){e.beginPath(),e.moveTo(-n,-n*.35),e.lineTo(n*.55,-n*.65),e.lineTo(n,n*.35),e.lineTo(-n*.55,n*.65),e.closePath();return}e.beginPath(),e.moveTo(-n*.72,-n*.52),e.lineTo(n*.28,-n*.75),e.lineTo(n*.76,-n*.36),e.lineTo(n*.72,n*.58),e.lineTo(-n*.28,n*.76),e.lineTo(-n*.76,n*.38),e.closePath()},p=Z(`div`,`pcard mp-hero ge-hero`),m=Z(`canvas`);m.title=`Drag the object to orient it`;let h=Z(`div`,`mp-cap`,`<div class="l"><b>${o.label}</b><span class="mp-illum ge-sub">OBJECT SPACE</span></div><div class="r">DRAG TO ORIENT</div>`);p.append(m,h),s.append(p);let g=null;function _(){let[t,r,i]=d(m,n?142:170),o=zf(a.color),s=zf(a.emissive);t.clearRect(0,0,r,i);let c=t.createRadialGradient(r*.5,i*.44,2,r*.5,i*.44,r*.7);c.addColorStop(0,`#25282c`),c.addColorStop(1,`#060607`),t.fillStyle=c,t.fillRect(0,0,r,i);let p=i*.77;t.strokeStyle=`rgba(255,255,255,.07)`;for(let e=-8;e<=8;e++)t.beginPath(),t.moveTo(r/2+e*18,p),t.lineTo(r/2+e*42,i),t.stroke();for(let e=0;e<6;e++){let n=p+(i-p)*e*e/25;t.beginPath(),t.moveTo(0,n),t.lineTo(r,n),t.stroke()}t.save(),t.translate(r/2,i*.46),t.rotate((l()[2]+l()[1]*.22)*Math.PI/180);let h=Rf(u()[0]/Math.max(...u()),.2,1),g=Rf(u()[1]/Math.max(...u()),.2,1);t.scale(h,g),f(t,e.type,47);let _=t.createLinearGradient(-40,-45,38,45);_.addColorStop(0,Bf(o.map(e=>Math.min(255,e*1.5)))),_.addColorStop(.55,Bf(o)),_.addColorStop(1,Bf(o.map(e=>e*.25))),t.fillStyle=_,t.shadowColor=Bf(s,(a.emissiveStrength||0)/5),t.shadowBlur=(a.emissiveStrength||0)*8,t.fill(`evenodd`),t.shadowBlur=0,t.strokeStyle=`rgba(255,255,255,.58)`,t.stroke(),e.type===`cube`&&(t.strokeStyle=`rgba(255,255,255,.22)`,t.beginPath(),t.moveTo(-34,-25),t.lineTo(-14,-3),t.lineTo(36,-16),t.moveTo(-14,-3),t.lineTo(-14,36),t.stroke()),t.restore(),t.fillStyle=`rgba(255,255,255,.3)`,t.font=`8px ui-sans-serif,system-ui`,t.textAlign=`left`,t.fillText(`RX ${l()[0].toFixed(0)}°`,9,13),t.textAlign=`center`,t.fillText(`RY ${l()[1].toFixed(0)}°`,r/2,13),t.textAlign=`right`,t.fillText(`RZ ${l()[2].toFixed(0)}°`,r-9,13),t.strokeStyle=`rgba(239,83,80,.7)`,t.beginPath(),t.moveTo(15,i-13),t.lineTo(31,i-13),t.stroke(),t.strokeStyle=`rgba(105,208,109,.7)`,t.beginPath(),t.moveTo(15,i-13),t.lineTo(15,i-29),t.stroke(),t.fillStyle=`rgba(255,255,255,.3)`,t.textAlign=`left`,t.fillText(`X`,34,i-10),t.fillText(`Y`,12,i-32)}m.onpointerdown=e=>{m.setPointerCapture(e.pointerId),m.classList.add(`grabbing`),g={x:e.clientX,y:e.clientY,r:[...l()]}},m.onpointermove=t=>{if(!g)return;let n=t.clientX-g.x,i=t.clientY-g.y;r(e,`rot`,[Rf(g.r[0]-i*.7,-180,180),(g.r[1]+n*.7+180)%360-180,g.r[2]]),le()},m.onpointerup=()=>{g=null,m.classList.remove(`grabbing`)};let v=Z(`div`,`mp-rail`),y=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return v.append(t),t.querySelector(`.v`)},b=y(`World X`),x=y(`World Y`),S=y(`World Z`),C=y(`Volume`);s.append(v);let w=Z(`div`,`pcard mp-light ge-place`);w.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Placement</span><span class="s">World plan · X / Z</span></div></div>`;let T=Z(`div`,`pbody`);w.append(T);let E=Z(`div`,`mp-meter ge-plan`,`<div class="hd"><span class="k">coordinate deck · ±20 m</span></div>`),D=Z(`canvas`);E.append(D),T.append(E);let O=Q({label:`Elevation Y`,min:-10,max:20,value:c()[1],dec:2,step:.05,unit:`m`,marks:[{t:0,l:`−10 m`},{t:1/3,l:`DATUM 0`},{t:1,l:`+20 m`}],onInput:t=>{r(e,`pos`,[c()[0],t,c()[2]]),le()}});T.append(O);let k=Z(`div`,`ge-steppers`);[`X`,`Y`,`Z`].forEach((t,n)=>{let i=Z(`div`,`ge-axis`,`<span class="${t.toLowerCase()}">${t}</span>`),a=bd({value:c()[n],min:-999,max:999,dec:2,step:.05,unit:`m`,onInput:t=>{let i=[...c()];i[n]=t,r(e,`pos`,i),le()}});i.append(a),i._step=a,k.append(i)}),T.append(k),s.append(w),w.querySelector(`.mp-chead .l`).onclick=()=>w.classList.toggle(`shut`);function A(){let[e,t,n]=d(D,126),r=t/2,i=n/2,a=Math.min(t-18,n-18);e.clearRect(0,0,t,n),e.fillStyle=`#050505`,e.fillRect(0,0,t,n);for(let t=-4;t<=4;t++){let o=r+t*a/8,s=i+t*a/8;e.strokeStyle=t?`rgba(255,255,255,.06)`:`rgba(255,255,255,.20)`,e.beginPath(),e.moveTo(o,9),e.lineTo(o,n-9),e.moveTo(r-a/2,s),e.lineTo(r+a/2,s),e.stroke()}let s=r+Rf(c()[0]/20,-1,1)*a/2,l=i+Rf(c()[2]/20,-1,1)*a/2;e.strokeStyle=`rgba(255,255,255,.7)`,e.beginPath(),e.arc(s,l,8,0,Math.PI*2),e.stroke(),e.fillStyle=o.color,e.beginPath(),e.arc(s,l,3,0,Math.PI*2),e.fill(),e.font=`8px ui-sans-serif,system-ui`,e.fillStyle=`rgba(255,255,255,.3)`,e.textAlign=`left`,e.fillText(`−X`,r-a/2,17),e.textAlign=`right`,e.fillText(`+X`,r+a/2,17),e.fillText(`+Z`,r+a/2,n-9)}let j=t=>{let n=D.getBoundingClientRect(),i=Math.min(n.width-18,n.height-18),a=Rf((t.clientX-n.left-n.width/2)/(i/2),-1,1)*20,o=Rf((t.clientY-n.top-n.height/2)/(i/2),-1,1)*20;r(e,`pos`,[+a.toFixed(2),c()[1],+o.toFixed(2)]),le()};D.onpointerdown=e=>{D.setPointerCapture(e.pointerId),D.classList.add(`drag`),j(e)},D.onpointermove=e=>{D.hasPointerCapture?.(e.pointerId)&&j(e)},D.onpointerup=e=>{D.releasePointerCapture?.(e.pointerId),D.classList.remove(`drag`)};let M=Z(`div`,`pcard mp-light ge-form`);M.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Form</span><span class="s">Attitude · dimensions</span></div></div>`;let N=Z(`div`,`pbody`);M.append(N);let P=Z(`div`,`mp-subhead`,`<span class="k">orientation matrix · drag object above</span>`);N.append(P);let F=Z(`div`,`ge-steppers`);[`X`,`Y`,`Z`].forEach((t,n)=>{let i=Z(`div`,`ge-axis`,`<span class="${t.toLowerCase()}">R${t}</span>`),a=bd({value:l()[n],min:-180,max:180,dec:1,step:1,unit:`°`,onInput:t=>{let i=[...l()];i[n]=t,r(e,`rot`,i),le()}});i.append(a),i._step=a,F.append(i)}),N.append(F);let I=Z(`div`,`mp-subhead`,`<span class="k">axis scale</span>`);N.append(I);let L=Z(`div`,`ge-steppers`);[`X`,`Y`,`Z`].forEach((t,n)=>{let i=Z(`div`,`ge-axis`,`<span class="${t.toLowerCase()}">${t}</span>`),a=bd({value:u()[n],min:.01,max:100,dec:2,step:.02,unit:`×`,onInput:t=>{let i=[...u()];i[n]=t,r(e,`scale`,i),le()}});i.append(a),i._step=a,L.append(i)}),N.append(L),s.append(M),M.querySelector(`.mp-chead .l`).onclick=()=>M.classList.toggle(`shut`);let R=Z(`div`,`pcard mp-light ge-mat`);R.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Surface laboratory</span><span class="s">BRDF response · drag the sample</span></div></div>`;let ee=Z(`div`,`pbody`),te=Z(`div`,`mp-meter ge-lab`,`<div class="hd"><span class="k">roughness ↑ · metallic →</span></div>`),z=Z(`canvas`);te.append(z),ee.append(te),R.append(ee);let ne=Z(`div`,`ge-colours`),re=Z(`div`,`mp-subhead`,`<span class="k">albedo</span>`),B=dd(a.color,t=>{r(e,`color`,t),le()});re.append(B);let V=Z(`div`,`mp-subhead`,`<span class="k">emissive</span>`),H=dd(a.emissive,t=>{r(e,`emissive`,t),le()});V.append(H),ne.append(re,V),ee.append(ne);let ie=Q({label:`Emission`,min:0,max:12,value:a.emissiveStrength||0,dec:2,step:.05,unit:`×`,marks:[{t:0,l:`OFF`},{t:.2,l:`GLOW`},{t:1,l:`12×`}],onInput:t=>{r(e,`emissiveStrength`,t),le()}});ee.append(ie);let ae=Z(`div`,`mp-tags`),oe=xd(`CAST SHADOW`,a.castShadow!==!1,t=>{r(e,`castShadow`,t),le()});ae.append(oe),ee.append(ae),s.append(R),R.querySelector(`.mp-chead .l`).onclick=()=>R.classList.toggle(`shut`);function se(){let[e,t,n]=d(z,112),r=zf(a.color),i=a.metalness||0,o=a.roughness??.45;e.clearRect(0,0,t,n),e.fillStyle=`#050505`,e.fillRect(0,0,t,n);for(let a=0;a<t;a+=3){let s=a/t;for(let t=0;t<n;t+=3){let c=1-t/n,l=s-i,u=c-o,d=Math.exp(-(l*l/(.003+o*.05)+u*u/(.005+o*.08))),f=r.map(e=>e*(.15+.45*(1-c))*(1-s*.35)),p=[235,240,248];e.fillStyle=Bf(f.map((e,t)=>e+(p[t]*(.3+.7*s)-e)*d)),e.fillRect(a,t,3.2,3.2)}}let s=i*t,c=(1-o)*n;e.strokeStyle=`#fff`,e.beginPath(),e.arc(s,c,6,0,Math.PI*2),e.stroke(),e.fillStyle=`rgba(255,255,255,.35)`,e.font=`8px ui-sans-serif,system-ui`,e.textAlign=`left`,e.fillText(`DIELECTRIC`,7,n-6),e.textAlign=`right`,e.fillText(`METAL`,t-7,n-6)}let ce=t=>{let n=z.getBoundingClientRect();r(e,`metalness`,+Rf((t.clientX-n.left)/n.width,0,1).toFixed(2)),r(e,`roughness`,+Rf(1-(t.clientY-n.top)/n.height,0,1).toFixed(2)),le()};z.onpointerdown=e=>{z.setPointerCapture(e.pointerId),z.classList.add(`drag`),ce(e)},z.onpointermove=e=>{z.hasPointerCapture?.(e.pointerId)&&ce(e)},z.onpointerup=e=>{z.releasePointerCapture?.(e.pointerId),z.classList.remove(`drag`)};function le(){_(),A(),se();let e=c(),t=u();b.innerHTML=`${e[0].toFixed(1)}<em>m</em>`,x.innerHTML=`${e[1].toFixed(1)}<em>m</em>`,S.innerHTML=`${e[2].toFixed(1)}<em>m</em>`,C.innerHTML=`${(t[0]*t[1]*t[2]).toFixed(2)}<em>×</em>`,[...k.children].forEach((t,n)=>t._step._set(e[n])),[...F.children].forEach((e,t)=>e._step._set(l()[t])),[...L.children].forEach((e,n)=>e._step._set(t[n])),O._set(e[1]),ie._set(a.emissiveStrength||0),B._set?.(a.color),H._set?.(a.emissive),oe._set(a.castShadow!==!1),h.querySelector(`.ge-sub`).textContent=`${t.map(e=>e.toFixed(2)).join(` × `)} · ${Vf(a.color)>.65?`LIGHT`:`DARK`} ALBEDO`}i?.(le);let ue=new ResizeObserver(()=>{_(),A(),se(),O._paint?.(),ie._paint?.()});return ue.observe(s),s._dispose=()=>ue.disconnect(),requestAnimationFrame(le),le(),s}var Uf=(e,t,n)=>Math.max(t,Math.min(n,e)),Wf=e=>{let t=parseInt((e||`#eef3f8`).slice(1),16);return[t>>16&255,t>>8&255,t&255]},Gf=(e,t=1)=>`rgba(${e.map(Math.round).join(`,`)},${t})`,Kf=(e,t)=>{let n=Math.sin(e*127.1+t*311.7)*43758.5453;return n-Math.floor(n)},qf=(e,t)=>{let n=Math.floor(e),r=Math.floor(t),i=e-n,a=t-r,o=i*i*(3-2*i),s=a*a*(3-2*a),c=Kf(n,r),l=Kf(n+1,r),u=Kf(n,r+1),d=Kf(n+1,r+1);return c+(l-c)*o+(u-c)*s+(c-l-u+d)*o*s},Jf=(e,t,n,r)=>{let i=Math.max(.2,n),a=qf(e*.028*i,t*.028*i)*.55+qf(e*.067*i+9,t*.067*i-4)*.3;return a+=qf(e*.16*i-3,t*.16*i+7)*(.07+r*.08),Uf(a/(.92+r*.08),0,1)},Yf=e=>e<.12?`Few`:e<.35?`Scattered`:e<.65?`Broken`:`Overcast`;function Xf(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=Z(`div`,`mpanel cloudpanel`),s=()=>a.coverage??.46,c=()=>a.density??.62,l=()=>a.altitude??130,u=()=>a.scale??1,d=()=>a.detail??.55,f=()=>a.speed??1,p=(e,t)=>{let n=e.clientWidth||290,r=Math.min(devicePixelRatio||1,2);(e.width!==n*r||e.height!==t*r)&&(e.width=n*r,e.height=t*r),e.style.height=t+`px`;let i=e.getContext(`2d`);return i.setTransform(r,0,0,r,0,0),[i,n,t]},m=()=>1-s()*.78,h=Z(`div`,`pcard mp-hero cl-hero`),g=Z(`canvas`);g.title=`Drag across for cloud cover; vertically for optical density`;let _=Z(`div`,`mp-cap`,`<div class="l"><b>—</b><span class="mp-illum cl-sub">—</span></div><div class="r">—</div>`);h.append(g,_),o.append(h);let v=null;function y(){let[e,t,r]=p(g,n?142:170),i=Wf(a.tint),o=Wf(a.shade);e.clearRect(0,0,t,r);let f=e.createLinearGradient(0,0,t,r);f.addColorStop(0,`#111820`),f.addColorStop(1,`#050708`),e.fillStyle=f,e.fillRect(0,0,t,r);let h=m();for(let n=0;n<r;n+=3)for(let r=0;r<t;r+=3){let t=Jf(r,n,u(),d());if(t>h){let a=Uf((t-h)/(1-h),0,1);e.fillStyle=Gf(o.map((e,t)=>e+(i[t]-e)*(a*.55+.2)),(.16+a*.72)*c()),e.fillRect(r,n,3.3,3.3)}}e.strokeStyle=`rgba(255,255,255,.10)`;for(let n=0;n<t;n+=t/8)e.beginPath(),e.moveTo(n,0),e.lineTo(n,r),e.stroke();for(let n=0;n<r;n+=r/5)e.beginPath(),e.moveTo(0,n),e.lineTo(t,n),e.stroke();e.font=`8px ui-sans-serif,system-ui`,e.fillStyle=`rgba(255,255,255,.34)`,e.textAlign=`left`,e.fillText(`N`,8,13),e.textAlign=`right`,e.fillText(`${Math.round(12/u())} km SWATH`,t-8,13);let y=((Kl.find(e=>e.type===`wind`)?.props||{direction:214,speed:4.2}).direction+90)*Math.PI/180,b=t-30,x=r-22;e.strokeStyle=`rgba(255,255,255,.7)`,e.beginPath(),e.moveTo(b,x),e.lineTo(b+Math.cos(y)*18,x+Math.sin(y)*18),e.stroke(),e.fillStyle=`#fff`,e.beginPath(),e.arc(b,x,2,0,Math.PI*2),e.fill(),v&&(e.strokeStyle=`rgba(255,255,255,.45)`,e.setLineDash([2,3]),e.beginPath(),e.moveTo(v.x,0),e.lineTo(v.x,r),e.moveTo(0,v.y),e.lineTo(t,v.y),e.stroke(),e.setLineDash([])),_.querySelector(`b`).textContent=Yf(s()),_.querySelector(`.cl-sub`).textContent=`${Math.round(s()*8)} / 8 oktas · optical depth ${(c()*12).toFixed(1)}`,_.querySelector(`.r`).textContent=`base ${l().toFixed(0)} m`}let b=t=>{let n=g.getBoundingClientRect(),i=Uf((t.clientX-n.left)/n.width,0,1),a=Uf((t.clientY-n.top)/n.height,0,1);v={x:i*n.width,y:a*n.height},r(e,`coverage`,+i.toFixed(2)),r(e,`density`,+(1-a).toFixed(2)),pe()};g.onpointerdown=e=>{g.setPointerCapture(e.pointerId),g.classList.add(`grabbing`),b(e)},g.onpointermove=e=>{g.hasPointerCapture?.(e.pointerId)&&b(e)},g.onpointerup=()=>{v=null,g.classList.remove(`grabbing`),y()};let x=Z(`div`,`mp-rail`),S=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return x.append(t),t.querySelector(`.v`)},C=S(`Coverage`),w=S(`Optical`),T=S(`Base`),E=S(`Drift`);o.append(x);let D=Z(`div`,`mp-duo`),O=(e,t)=>{let n=Z(`div`,`pcard mp-stat`,`<span class="i">${X(e,{size:12})}</span><span class="l">${t}</span><b class="n">—</b>`);return D.append(n),n},k=O(`sun`,`Sun reaching datum`),A=O(`cloud`,`Sky cover`);o.append(D);let j=Z(`div`,`pcard mp-metric cl-cover`);j.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Coverage</span><span class="s">Condensate threshold · cell population</span></div></div><div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">%</span></div><div class="mp-k mp-target">Sky fraction <span class="v">—</span></div>`;let M=Z(`div`,`mp-chartwrap`),N=Z(`canvas`);M.append(N),j.append(M),o.append(j);function P(){let[e,t,n]=p(N,110);e.clearRect(0,0,t,n);let r=Array(20).fill(0);for(let e=0;e<1600;e++)r[Math.min(19,Math.floor(Jf(e%40*7,Math.floor(e/40)*5,u(),d())*20))]++;let i=Math.max(...r);r.forEach((r,a)=>{let o=8+a/20*(t-8-8),s=r/i*(n-8-17);e.fillStyle=a/20>m()?`rgba(238,243,248,.72)`:`rgba(255,255,255,.11)`,e.fillRect(o,n-17-s,(t-8-8)/20-2,s)});let a=8+m()*(t-8-8);e.strokeStyle=`#fff`,e.setLineDash([3,3]),e.beginPath(),e.moveTo(a,8),e.lineTo(a,n-17),e.stroke(),e.setLineDash([]),e.font=`8px ui-sans-serif,system-ui`,e.fillStyle=`rgba(255,255,255,.3)`,e.textAlign=`left`,e.fillText(`CLEAR AIR`,8,n-3),e.textAlign=`right`,e.fillText(`CONDENSED`,t-8,n-3)}let F=t=>{let n=N.getBoundingClientRect();r(e,`coverage`,+Uf((t.clientX-n.left)/n.width,0,1).toFixed(2)),pe()};N.onpointerdown=e=>{N.setPointerCapture(e.pointerId),N.classList.add(`drag`),F(e)},N.onpointermove=e=>{N.hasPointerCapture?.(e.pointerId)&&F(e)},N.onpointerup=e=>N.releasePointerCapture?.(e.pointerId);let I=Z(`div`,`pcard mp-light cl-layer`);I.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Cloud deck</span><span class="s">Base altitude · optical body</span></div></div>`;let L=Z(`div`,`pbody`),R=Z(`div`,`mp-meter cl-section`,`<div class="hd"><span class="k">vertical section · 0–400 m</span></div>`),ee=Z(`canvas`);R.append(ee),L.append(R),I.append(L);let te=Q({label:`Cloud base`,min:20,max:400,value:l(),dec:0,step:2,unit:`m`,marks:[{t:0,l:`20 m`},{t:.289,l:`LOW 130`},{t:1,l:`400 m`}],onInput:t=>{r(e,`altitude`,Math.round(t)),pe()}}),z=Q({label:`Optical density`,min:0,max:1,value:c(),dec:2,step:.01,marks:[{t:0,l:`VEIL`},{t:.62,l:`BODY .62`},{t:1,l:`OPAQUE`}],onInput:t=>{r(e,`density`,t),pe()}});L.append(te,z),o.append(I),I.querySelector(`.mp-chead .l`).onclick=()=>I.classList.toggle(`shut`);function ne(){let[e,t,n]=p(ee,104);e.clearRect(0,0,t,n),e.fillStyle=`#060708`,e.fillRect(0,0,t,n);let r=e=>n-12-e/400*(n-20),i=r(l()),o=10+34*c();for(let n=0;n<t;n+=4){let t=i-o*(.65+.3*Math.sin(n*.08*u())+.12*Math.sin(n*.31)),r=e.createLinearGradient(0,t,0,i+4);r.addColorStop(0,Gf(Wf(a.tint),.05)),r.addColorStop(.35,Gf(Wf(a.tint),.75*c())),r.addColorStop(1,Gf(Wf(a.shade),.72*c())),e.fillStyle=r,e.fillRect(n,t,4.3,i-t+4)}[0,100,200,300,400].forEach(n=>{let i=r(n);e.strokeStyle=`rgba(255,255,255,.07)`,e.beginPath(),e.moveTo(0,i),e.lineTo(t,i),e.stroke(),e.fillStyle=`rgba(255,255,255,.27)`,e.font=`8px ui-sans-serif`,e.textAlign=`left`,e.fillText(n===0?`DATUM`:n+` m`,5,i-2)}),e.strokeStyle=`rgba(255,255,255,.65)`,e.setLineDash([3,3]),e.beginPath(),e.moveTo(0,i),e.lineTo(t,i),e.stroke(),e.setLineDash([])}let re=t=>{let n=ee.getBoundingClientRect();r(e,`altitude`,Math.round(Uf((1-(t.clientY-n.top)/n.height)*400,20,400))),pe()};ee.onpointerdown=e=>{ee.setPointerCapture(e.pointerId),ee.classList.add(`drag`),re(e)},ee.onpointermove=e=>{ee.hasPointerCapture?.(e.pointerId)&&re(e)},ee.onpointerup=e=>ee.releasePointerCapture?.(e.pointerId);let B=Z(`div`,`pcard mp-light cl-form`);B.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Morphology</span><span class="s">Cell scale · edge detail · advection</span></div></div>`;let V=Z(`div`,`pbody`);B.append(V);let H=Q({label:`Feature size`,min:.2,max:4,value:u(),dec:2,step:.02,unit:`×`,marks:[{t:0,l:`SHEETS`},{t:.21,l:`1×`},{t:1,l:`CELLS`}],onInput:t=>{r(e,`scale`,t),pe()}}),ie=Q({label:`Edge detail`,min:0,max:1,value:d(),dec:2,step:.01,marks:[{t:0,l:`SOFT`},{t:.55,l:`NATURAL`},{t:1,l:`FRACTAL`}],onInput:t=>{r(e,`detail`,t),pe()}}),ae=Q({label:`Drift speed`,min:0,max:6,value:f(),dec:2,step:.05,unit:`×`,marks:[{t:0,l:`STILL`},{t:.167,l:`REAL 1×`},{t:1,l:`6×`}],onInput:t=>{r(e,`speed`,t),pe()}});V.append(H,ie,ae);let oe=Z(`div`,`cl-colours`),se=Z(`div`,`mp-subhead`,`<span class="k">sunlit</span>`),ce=dd(a.tint,t=>{r(e,`tint`,t),pe()}),le=Z(`div`,`mp-subhead`,`<span class="k">shadowed</span>`),ue=dd(a.shade,t=>{r(e,`shade`,t),pe()});se.append(ce),le.append(ue),oe.append(se,le),V.append(oe);let de=Z(`div`,`mp-tags`),U=xd(`FOLLOW WIND`,a.windLinked!==!1,t=>{r(e,`windLinked`,t),pe()});de.append(U),V.append(de);let fe=Z(`div`,`mp-note`);V.append(fe),o.append(B),B.querySelector(`.mp-chead .l`).onclick=()=>B.classList.toggle(`shut`);function pe(){y(),P(),ne();let e=Math.exp(-c()*s()*2.2),t=s()*100;C.innerHTML=`${t.toFixed(0)}<em>%</em>`,w.textContent=(c()*12).toFixed(1),T.innerHTML=`${l().toFixed(0)}<em>m</em>`,E.innerHTML=`${f().toFixed(1)}<em>×</em>`,k.querySelector(`.n`).innerHTML=`${(e*100).toFixed(0)}<em>%</em>`,A.querySelector(`.n`).innerHTML=`${Math.round(s()*8)}<em>/8</em>`,j.querySelector(`.mp-num .i`).textContent=Math.floor(t),j.querySelector(`.mp-num .d`).textContent=`.`+Math.round(t*10)%10,j.querySelector(`.mp-target .v`).textContent=Yf(s()).toLowerCase()+` cloud`,te._set(l()),z._set(c()),H._set(u()),ie._set(d()),ae._set(f()),ce._set?.(a.tint),ue._set?.(a.shade),U._set(a.windLinked!==!1),fe.textContent=`${a.windLinked===!1?`Layer has independent drift.`:`Advection follows the Wind Field.`} Feature scale is ${u().toFixed(2)}× with ${Math.round(d()*100)}% edge detail.`}i?.(pe);let me=new ResizeObserver(()=>{y(),P(),ne(),[te,z,H,ie,ae].forEach(e=>e._paint?.())});return me.observe(o),o._dispose=()=>me.disconnect(),requestAnimationFrame(pe),pe(),o}var Zf=(e,t,n)=>Math.max(t,Math.min(n,e)),Qf=e=>{let t=parseInt((e||`#ffd9a0`).slice(1),16);return[t>>16&255,t>>8&255,t&255]},$f=(e,t=1)=>`rgba(${e.map(Math.round).join(`,`)},${t})`,ep=(e,t,n=2)=>e/Math.max(1,t)**+n;function tp(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=e.type===`spotlight`,s=Z(`div`,`mpanel lightpanel`),c=()=>a.intensity??(o?62:14),l=()=>a.distance??26,u=()=>a.angle??26,d=()=>a.penumbra??.42,f=()=>a.decay??2,p=()=>a.pos||[0,2,0],m=()=>a.target||[0,0,0],h=(e,t)=>{let n=e.clientWidth||290,r=Math.min(devicePixelRatio||1,2);(e.width!==n*r||e.height!==t*r)&&(e.width=n*r,e.height=t*r),e.style.height=t+`px`;let i=e.getContext(`2d`);return i.setTransform(r,0,0,r,0,0),[i,n,t]},g=Z(`div`,`pcard mp-hero li-hero`),_=Z(`canvas`);_.title=o?`Drag across for cone angle; vertically for intensity`:`Drag across for reach; vertically for intensity`;let v=Z(`div`,`mp-cap`,`<div class="l"><b>${Xl(e).label}</b><span class="mp-illum li-sub">PHOTOMETRIC DISTRIBUTION</span></div><div class="r">—</div>`);g.append(_,v),s.append(g);let y=null;function b(){let[e,t,r]=h(_,n?145:172),i=Qf(a.color),s=o?t*.22:t/2,p=o?r*.5:r*.47;if(e.clearRect(0,0,t,r),e.fillStyle=`#050505`,e.fillRect(0,0,t,r),o){let n=t*.65,r=u()*Math.PI/360,a=p-Math.tan(r)*n,o=p+Math.tan(r)*n,c=e.createLinearGradient(s,0,t,0);c.addColorStop(0,$f(i,.65)),c.addColorStop(1,$f(i,.03)),e.fillStyle=c,e.beginPath(),e.moveTo(s,p),e.lineTo(t-10,a),e.quadraticCurveTo(t-3,p,t-10,o),e.closePath(),e.fill();let l=r*(1-d());e.strokeStyle=`rgba(255,255,255,.28)`,e.setLineDash([3,3]),e.beginPath(),e.moveTo(s,p),e.lineTo(t-10,p-Math.tan(l)*n),e.moveTo(s,p),e.lineTo(t-10,p+Math.tan(l)*n),e.stroke(),e.setLineDash([]),e.strokeStyle=`rgba(255,255,255,.65)`,e.beginPath(),e.moveTo(s,p),e.lineTo(t-10,a),e.moveTo(s,p),e.lineTo(t-10,o),e.stroke()}else{for(let t=70;t>4;t-=3){let n=t/70*l();e.fillStyle=$f(i,Zf(ep(c(),n,f())/Math.max(1,c()),0,1)*.35),e.beginPath(),e.arc(s,p,t,0,Math.PI*2),e.fill()}[.25,.5,.75,1].forEach(t=>{e.strokeStyle=`rgba(255,255,255,.11)`,e.beginPath(),e.arc(s,p,70*t,0,Math.PI*2),e.stroke(),(t===.5||t===1)&&(e.fillStyle=`rgba(255,255,255,.3)`,e.font=`8px ui-sans-serif`,e.fillText(`${Math.round(l()*t)} m`,s+70*t+3,p-4))})}let m=e.createRadialGradient(s,p,0,s,p,16);m.addColorStop(0,`rgba(255,255,255,.98)`),m.addColorStop(.25,$f(i,.9)),m.addColorStop(1,$f(i,0)),e.fillStyle=m,e.beginPath(),e.arc(s,p,16,0,Math.PI*2),e.fill(),e.font=`8px ui-sans-serif,system-ui`,e.fillStyle=`rgba(255,255,255,.32)`,e.textAlign=`left`,e.fillText(o?`0° AXIS`:`ISOTROPIC 360°`,8,13),e.textAlign=`right`,e.fillText(`${c().toFixed(+!o)} cd`,t-8,13),y&&(e.strokeStyle=`rgba(255,255,255,.45)`,e.setLineDash([2,3]),e.beginPath(),e.moveTo(y.x,0),e.lineTo(y.x,r),e.moveTo(0,y.y),e.lineTo(t,y.y),e.stroke(),e.setLineDash([])),v.querySelector(`.r`).textContent=o?`${u().toFixed(1)}° cone`:`${l().toFixed(0)} m reach`}let x=t=>{let n=_.getBoundingClientRect(),i=Zf((t.clientX-n.left)/n.width,0,1),a=Zf((t.clientY-n.top)/n.height,0,1);y={x:i*n.width,y:a*n.height},o?r(e,`angle`,+(2+i*78).toFixed(1)):r(e,`distance`,Math.round(1+i*119)),r(e,`intensity`,+((1-a)*(o?200:60)).toFixed(+!o)),de()};_.onpointerdown=e=>{_.setPointerCapture(e.pointerId),_.classList.add(`grabbing`),x(e)},_.onpointermove=e=>{_.hasPointerCapture?.(e.pointerId)&&x(e)},_.onpointerup=()=>{y=null,_.classList.remove(`grabbing`),b()};let S=Z(`div`,`mp-rail`),C=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return S.append(t),t.querySelector(`.v`)},w=C(`Intensity`),T=C(`At 1 m`),E=C(`At 10 m`),D=C(o?`Cone`:`Decay`);s.append(S);let O=Z(`div`,`mp-duo`),k=e=>{let t=Z(`div`,`pcard mp-stat`,`<span class="i">●</span><span class="l">${e}</span><b class="n">—</b>`);return O.append(t),t},A=k(`Exposure at 5 m`),j=k(o?`Pool at 5 m`:`Reach limit`);s.append(O);let M=Z(`div`,`pcard mp-metric li-photo`);M.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Photometry</span><span class="s">Illuminance over distance</span></div></div><div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">lx</span></div><div class="mp-k mp-target">At five metres <span class="v">inverse power law</span></div>`;let N=Z(`div`,`mp-chartwrap`),P=Z(`canvas`);N.append(P),M.append(N),s.append(M);function F(){let[e,t,n]=h(P,112);e.clearRect(0,0,t,n);let r=Math.max(1,c()),i=e=>8+e/Math.max(o?30:l(),10)*(t-8-31),s=e=>8+(1-Zf(Math.log10(e+.01)/Math.log10(r+.01),0,1))*(n-8-17);[.25,.5,.75,1].forEach(r=>{let i=8+(1-r)*(n-8-17);e.strokeStyle=`rgba(255,255,255,.07)`,e.setLineDash([2,5]),e.beginPath(),e.moveTo(8,i),e.lineTo(t-31,i),e.stroke(),e.setLineDash([])});let u=o?30:l(),d=Qf(a.color);e.beginPath(),e.moveTo(i(1),s(0));for(let t=1;t<=u;t+=.3)e.lineTo(i(t),s(ep(c(),t,o?2:f())));e.lineTo(i(u),n-17),e.closePath(),e.fillStyle=$f(d,.22),e.fill(),e.beginPath();for(let t=1;t<=u;t+=.3)t===1?e.moveTo(i(t),s(ep(c(),t,o?2:f()))):e.lineTo(i(t),s(ep(c(),t,o?2:f())));e.strokeStyle=`rgba(255,255,255,.9)`,e.stroke(),e.font=`8px ui-sans-serif`,e.fillStyle=`rgba(255,255,255,.28)`,[1,5,10,u].forEach((t,r)=>{e.textAlign=r===0?`left`:r===3?`right`:`center`,e.fillText(t===u?`${t.toFixed(0)} m`:t,i(t),n-3)});let p=s(ep(c(),5,o?2:f()));e.fillStyle=`#fff`,e.beginPath(),e.arc(i(5),p,3,0,Math.PI*2),e.fill()}let I=Z(`div`,`pcard mp-light li-output`);I.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Output</span><span class="s">Distribution · attenuation</span></div></div>`;let L=Z(`div`,`pbody`);I.append(L);let R=Q({label:`Intensity`,min:0,max:o?200:60,value:c(),dec:+!o,step:o?1:.5,unit:`cd`,marks:[{t:0,l:`OFF`},{t:o?.31:.233,l:o?`KEY 62`:`POINT 14`},{t:1,l:o?`200 cd`:`60 cd`}],onInput:t=>{r(e,`intensity`,t),de()}});L.append(R);let ee,te;o?(ee=Q({label:`Cone angle`,min:2,max:80,value:u(),dec:1,step:.5,unit:`°`,marks:[{t:0,l:`PIN 2°`},{t:.308,l:`SPOT 26°`},{t:1,l:`FLOOD 80°`}],onInput:t=>{r(e,`angle`,t),de()}}),te=Q({label:`Penumbra`,min:0,max:1,value:d(),dec:2,step:.01,marks:[{t:0,l:`HARD`},{t:.42,l:`SOFT .42`},{t:1,l:`FEATHER`}],onInput:t=>{r(e,`penumbra`,t),de()}})):(ee=Q({label:`Reach`,min:1,max:120,value:l(),dec:0,step:1,unit:`m`,marks:[{t:0,l:`1 m`},{t:.21,l:`26 m`},{t:1,l:`120 m`}],onInput:t=>{r(e,`distance`,Math.round(t)),de()}}),te=Q({label:`Decay exponent`,min:0,max:4,value:f(),dec:2,step:.05,marks:[{t:0,l:`NONE`},{t:.5,l:`PHYSICAL 2`},{t:1,l:`4`}],onInput:t=>{r(e,`decay`,t),de()}})),L.append(ee,te);let z=Z(`div`,`mp-subhead`,`<span class="k">emission colour</span>`),ne=dd(a.color,t=>{r(e,`color`,t),de()});z.append(ne),L.append(z);let re=Z(`div`,`mp-tags`),B=xd(`CAST SHADOWS`,!!a.shadows,t=>{r(e,`shadows`,t),de()}),V=xd(o?`DRAW CONE`:`SHOW GLOW`,o?a.showCone!==!1:a.gizmoGlow!==!1,t=>{r(e,o?`showCone`:`gizmoGlow`,t),de()});re.append(B,V),L.append(re),s.append(I),I.querySelector(`.mp-chead .l`).onclick=()=>I.classList.toggle(`shut`);let H=Z(`div`,`pcard mp-light li-place`);H.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">${o?`Aim`:`Placement`}</span><span class="s">World coordinates${o?` · source to target`:``}</span></div></div>`;let ie=Z(`div`,`pbody`),ae=Z(`div`,`mp-meter li-aim`,`<div class="hd"><span class="k">world plan · ±20 m</span></div>`),oe=Z(`canvas`);ae.append(oe),ie.append(ae),H.append(ie);let se=[],ce=(t,n,i)=>{let a=Z(`div`,`mp-subhead`,`<span class="k">${t}</span>`),o=Z(`div`,`li-steppers`);[`X`,`Y`,`Z`].forEach((t,a)=>{let s=Z(`div`,`li-axis`,`<span>${t}</span>`),c=bd({value:n()[a],min:-999,max:999,dec:2,step:.05,unit:`m`,onInput:t=>{let o=[...n()];o[a]=t,r(e,i,o),de()}});s.append(c),s._step=c,o.append(s)}),ie.append(a,o),se.push([o,n])};ce(`position`,p,`pos`),o&&ce(`target`,m,`target`),s.append(H),H.querySelector(`.mp-chead .l`).onclick=()=>H.classList.toggle(`shut`);function le(){let[e,t,n]=h(oe,118),r=t/2,i=n/2,s=Math.min(t,n)-20,c=e=>[r+Zf(e[0]/20,-1,1)*s/2,i+Zf(e[2]/20,-1,1)*s/2];e.clearRect(0,0,t,n),e.fillStyle=`#050505`,e.fillRect(0,0,t,n);for(let t=-4;t<=4;t++)e.strokeStyle=t?`rgba(255,255,255,.06)`:`rgba(255,255,255,.18)`,e.beginPath(),e.moveTo(r+t*s/8,10),e.lineTo(r+t*s/8,n-10),e.moveTo(r-s/2,i+t*s/8),e.lineTo(r+s/2,i+t*s/8),e.stroke();let l=c(p()),u=c(m());o&&(e.strokeStyle=$f(Qf(a.color),.75),e.beginPath(),e.moveTo(...l),e.lineTo(...u),e.stroke(),e.fillStyle=`#fff`,e.beginPath(),e.arc(...u,4,0,Math.PI*2),e.fill()),e.fillStyle=$f(Qf(a.color)),e.beginPath(),e.arc(...l,6,0,Math.PI*2),e.fill(),e.strokeStyle=`#fff`,e.beginPath(),e.arc(...l,9,0,Math.PI*2),e.stroke()}let ue=t=>{let n=oe.getBoundingClientRect(),i=Math.min(n.width,n.height)-20,a=Zf((t.clientX-n.left-n.width/2)/(i/2),-1,1)*20,s=Zf((t.clientY-n.top-n.height/2)/(i/2),-1,1)*20,c=o&&t.shiftKey?`target`:`pos`,l=[...c===`target`?m():p()];l[0]=+a.toFixed(2),l[2]=+s.toFixed(2),r(e,c,l),de()};oe.onpointerdown=e=>{oe.setPointerCapture(e.pointerId),oe.classList.add(`drag`),ue(e)},oe.onpointermove=e=>{oe.hasPointerCapture?.(e.pointerId)&&ue(e)},oe.onpointerup=e=>oe.releasePointerCapture?.(e.pointerId);function de(){b(),F(),le();let e=o?2:f(),t=ep(c(),5,e);w.innerHTML=`${c().toFixed(+!o)}<em>cd</em>`,T.innerHTML=`${c().toFixed(0)}<em>lx</em>`,E.innerHTML=`${ep(c(),10,e).toFixed(2)}<em>lx</em>`,D.innerHTML=o?`${u().toFixed(1)}<em>°</em>`:`${f().toFixed(1)}<em>n</em>`,A.querySelector(`.n`).innerHTML=`${t.toFixed(2)}<em>lx</em>`,j.querySelector(`.n`).innerHTML=o?`${(10*Math.tan(u()*Math.PI/360)).toFixed(1)}<em>m</em>`:`${l().toFixed(0)}<em>m</em>`;let n=Math.floor(t),r=Math.round(t*10)%10;M.querySelector(`.mp-num .i`).textContent=n,M.querySelector(`.mp-num .d`).textContent=`.`+r,R._set(c()),ee._set(o?u():l()),te._set(o?d():f()),ne._set?.(a.color),B._set(!!a.shadows),V._set(o?a.showCone!==!1:a.gizmoGlow!==!1),se.forEach(([e,t])=>[...e.children].forEach((e,n)=>e._step._set(t()[n])))}i?.(de);let U=new ResizeObserver(()=>{b(),F(),le(),[R,ee,te].forEach(e=>e._paint?.())});return U.observe(s),s._dispose=()=>U.disconnect(),requestAnimationFrame(de),de(),s}var np=(e,t,n)=>Math.max(t,Math.min(n,e)),rp=e=>{let t=parseInt((e||`#fff2cf`).slice(1),16);return[t>>16&255,t>>8&255,t&255]},ip=(e,t=1)=>`rgba(${e.map(Math.round).join(`,`)},${t})`,ap=[`ECE Low Beam`,`SAE Low Beam`,`High Beam`,`Fog Lamp`,`Parking Lamp`,`Custom .IES`];function op(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=e.type,s=o===`ieslight`,c=o===`arealight`,l=o===`tubelight`,u=Z(`div`,`mpanel advlightpanel`),d=()=>a.lumens??1800,f=()=>a.range??a.distance??(c?80:24),p=()=>a.pos||[0,2,0],m=(e,t)=>{let n=e.clientWidth||290,r=Math.min(devicePixelRatio||1,2);(e.width!==n*r||e.height!==t*r)&&(e.width=n*r,e.height=t*r),e.style.height=t+`px`;let i=e.getContext(`2d`);return i.setTransform(r,0,0,r,0,0),[i,n,t]},h=Z(`div`,`pcard mp-hero al-hero`),g=Z(`canvas`),_=Z(`div`,`mp-cap`,`<div class="l"><b>${Xl(e).label}</b><span class="mp-illum al-sub">—</span></div><div class="r">DRAG EMITTER</div>`);h.append(g,_),u.append(h);let v=null;function y(){let[e,t,r]=m(g,n?145:174),i=rp(a.color),o=t/2,l=r*.44;if(e.clearRect(0,0,t,r),e.fillStyle=`#040404`,e.fillRect(0,0,t,r),s){let n=(a.cone??58)*Math.PI/360,s=(a.cutoff??-1)*Math.PI/180;for(let c=8;c<r-25;c+=3)for(let u=4;u<t-4;u+=3){let d=(u-o)/(t*.47),f=(c-l)/(r*.42),p=Math.atan2(f,d),m=Math.hypot(d,f),h=Math.abs(p-s)<n?Math.exp(-m*m*(a.profile===`High Beam`?6:2.2)):0;a.profile?.includes(`Low Beam`)&&f<-.04&&(h*=.06),a.profile===`Fog Lamp`&&(h*=Math.exp(-f*f*18)),a.profile===`Parking Lamp`&&(h=.18*Math.exp(-m*m*1.3)),e.fillStyle=ip(i,h*.58*(a.multiplier??1)),e.fillRect(u,c,3.2,3.2)}e.strokeStyle=`rgba(255,255,255,.55)`,e.beginPath(),e.moveTo(o,l),e.lineTo(t-8,l-Math.tan(n-s)*(t*.47)),e.moveTo(o,l),e.lineTo(t-8,l+Math.tan(n+s)*(t*.47)),e.stroke(),e.setLineDash([3,3]),e.strokeStyle=`rgba(255,255,255,.25)`,e.beginPath(),e.moveTo(8,l),e.lineTo(t-8,l),e.stroke(),e.setLineDash([]),e.fillStyle=`rgba(255,255,255,.38)`,e.font=`8px ui-sans-serif`,e.fillText(`H–V PHOTOMETRIC PLANE`,8,13)}else if(c){let n=np((a.width??2)/20,0,1)*(t*.65)+25,s=np((a.height??1)/20,0,1)*(r*.55)+14,c=o-n/2,u=l-s/2,d=e.createRadialGradient(o,l,2,o,l,Math.max(n,s));d.addColorStop(0,ip(i,.95)),d.addColorStop(1,ip(i,.22)),e.fillStyle=d,e.fillRect(c,u,n,s),e.strokeStyle=`#fff`,e.strokeRect(c+.5,u+.5,n-1,s-1);for(let t=1;t<4;t++)e.strokeStyle=`rgba(255,255,255,.12)`,e.beginPath(),e.ellipse(o,l+s/2,n*.3*t,s*.16*t,0,0,Math.PI*2),e.stroke()}else{let n=np((a.length??1.5)/20,0,1)*(t*.72)+30,r=np(a.radius??.04,.01,1)*12+2,s=o-n/2,c=e.createLinearGradient(s,0,s+n,0);c.addColorStop(0,ip(i,.25)),c.addColorStop(.15,ip(i,.95)),c.addColorStop(.85,ip(i,.95)),c.addColorStop(1,ip(i,.25)),e.shadowColor=ip(i),e.shadowBlur=22,e.fillStyle=c,e.fillRect(s,l-r,n,r*2),e.shadowBlur=0,e.strokeStyle=`rgba(255,255,255,.8)`,e.strokeRect(s,l-r,n,r*2)}v&&(e.strokeStyle=`rgba(255,255,255,.4)`,e.setLineDash([2,3]),e.beginPath(),e.moveTo(v.x,0),e.lineTo(v.x,r),e.moveTo(0,v.y),e.lineTo(t,v.y),e.stroke(),e.setLineDash([])),_.querySelector(`.al-sub`).textContent=s?`${a.profile} · ${(a.temperature??4300).toFixed(0)} K`:c?`${(a.width??2).toFixed(1)} × ${(a.height??1).toFixed(1)} m emitter`:`${(a.length??1.5).toFixed(2)} m luminous tube`,_.querySelector(`.r`).textContent=`${d().toFixed(0)} lm`}let b=t=>{let n=g.getBoundingClientRect(),i=np((t.clientX-n.left)/n.width,0,1),a=np((t.clientY-n.top)/n.height,0,1);v={x:i*n.width,y:a*n.height},s?(r(e,`cone`,+(5+i*95).toFixed(1)),r(e,`cutoff`,+(-5+a*10).toFixed(1))):c?(r(e,`width`,+(.1+i*19.9).toFixed(2)),r(e,`height`,+(.1+(1-a)*19.9).toFixed(2))):(r(e,`length`,+(.1+i*19.9).toFixed(2)),r(e,`radius`,+(.01+(1-a)*.99).toFixed(2))),V()};g.onpointerdown=e=>{g.setPointerCapture(e.pointerId),g.classList.add(`grabbing`),b(e)},g.onpointermove=e=>{g.hasPointerCapture?.(e.pointerId)&&b(e)},g.onpointerup=()=>{v=null,g.classList.remove(`grabbing`),y()};let x=Z(`div`,`mp-rail`),S=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return x.append(t),t.querySelector(`.v`)},C=S(`Flux`),w=S(`Peak cd`),T=S(`Efficacy`),E=S(`Range`);u.append(x);let D=Z(`div`,`pcard mp-metric al-dist`);D.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">${s?`IES distribution`:`Emitter geometry`}</span><span class="s">${s?`Candela map · homologation view`:`Luminous aperture · projected solid angle`}</span></div></div><div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">lm</span></div><div class="mp-k mp-target">Luminous flux <span class="v">—</span></div>`;let O=Z(`div`,`mp-chartwrap`),k=Z(`canvas`);O.append(k),D.append(O),u.append(D);function A(){let[e,t,n]=m(k,118);e.clearRect(0,0,t,n),e.fillStyle=`#050505`,e.fillRect(0,0,t,n);let r=rp(a.color),i=t/2,o=n/2;if(s){for(let t=-80;t<=80;t+=2){let n=a.profile?.includes(`Low Beam`)?Math.exp(-(((t-8)/25)**2))*(t>-2?1:.16):Math.exp(-((t/(a.profile===`High Beam`?12:35))**2)),s=8+n*45*(a.multiplier??1),c=(t-90)*Math.PI/180;e.strokeStyle=ip(r,.18+n*.65),e.beginPath(),e.moveTo(i,o),e.lineTo(i+Math.cos(c)*s,o+Math.sin(c)*s),e.stroke()}e.strokeStyle=`rgba(255,255,255,.15)`,[15,30,45].forEach(t=>{e.beginPath(),e.arc(i,o,t,0,Math.PI*2),e.stroke()}),e.fillStyle=`rgba(255,255,255,.3)`,e.font=`8px ui-sans-serif`,e.fillText(`LEFT`,6,o),e.textAlign=`right`,e.fillText(`RIGHT`,t-6,o)}else{let t=c?(a.width??2)/(a.height??1):(a.length??1.5)/Math.max(.02,(a.radius??.04)*2);e.fillStyle=ip(r,.5),e.fillRect(i-np(t,1,12)*8,o-9,np(t,1,12)*16,18),e.strokeStyle=`#fff`,e.strokeRect(i-np(t,1,12)*8,o-9,np(t,1,12)*16,18),e.fillStyle=`rgba(255,255,255,.3)`,e.font=`8px ui-sans-serif`,e.textAlign=`center`,e.fillText(`${t.toFixed(1)} : 1 ASPECT`,i,n-7)}}if(s){let t=Z(`div`,`mp-tags al-profiles`);ap.forEach(n=>{let i=Z(`button`,`mp-tag${a.profile===n?` on`:``}`,n.toUpperCase());i.onclick=()=>{r(e,`profile`,n),V()},t.append(i)}),D.append(t)}let j=Z(`div`,`pcard mp-light al-output`);j.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Photometric output</span><span class="s">Calibrated source values</span></div></div>`;let M=Z(`div`,`pbody`);j.append(M);let N=Q({label:`Luminous flux`,min:0,max:s?8e3:c?2e4:12e3,value:d(),dec:0,step:50,unit:`lm`,marks:[{t:0,l:`OFF`},{t:s?.206:c?.12:.15,l:s?`ECE 1 650`:`NOMINAL`},{t:1,l:`MAX`}],onInput:t=>{r(e,`lumens`,Math.round(t)),V()}});M.append(N);let P=[];P=s?[Q({label:`Profile multiplier`,min:0,max:4,value:a.multiplier,dec:2,step:.05,unit:`×`,marks:[{t:0,l:`OFF`},{t:.25,l:`1×`},{t:1,l:`4×`}],onInput:t=>{r(e,`multiplier`,t),V()}}),Q({label:`Photometric range`,min:1,max:250,value:a.range,dec:0,step:1,unit:`m`,marks:[{t:0,l:`1 m`},{t:.48,l:`120 m`},{t:1,l:`250 m`}],onInput:t=>{r(e,`range`,Math.round(t)),V()}}),Q({label:`Field angle`,min:5,max:100,value:a.cone,dec:1,step:.5,unit:`°`,marks:[{t:0,l:`5°`},{t:.558,l:`58°`},{t:1,l:`100°`}],onInput:t=>{r(e,`cone`,t),V()}}),Q({label:`Cut-off pitch`,min:-5,max:5,value:a.cutoff,dec:1,step:.1,unit:`°`,marks:[{t:0,l:`−5°`},{t:.4,l:`ECE −1°`},{t:1,l:`+5°`}],onInput:t=>{r(e,`cutoff`,t),V()}})]:c?[Q({label:`Width`,min:.1,max:20,value:a.width,dec:2,step:.1,unit:`m`,onInput:t=>{r(e,`width`,t),V()}}),Q({label:`Height`,min:.1,max:20,value:a.height,dec:2,step:.1,unit:`m`,onInput:t=>{r(e,`height`,t),V()}}),Q({label:`Beam spread`,min:1,max:180,value:a.spread,dec:0,step:1,unit:`°`,marks:[{t:0,l:`1°`},{t:.665,l:`120°`},{t:1,l:`180°`}],onInput:t=>{r(e,`spread`,Math.round(t)),V()}})]:[Q({label:`Length`,min:.1,max:20,value:a.length,dec:2,step:.1,unit:`m`,onInput:t=>{r(e,`length`,t),V()}}),Q({label:`Tube radius`,min:.01,max:1,value:a.radius,dec:2,step:.01,unit:`m`,onInput:t=>{r(e,`radius`,t),V()}}),Q({label:`Reach`,min:1,max:120,value:a.distance,dec:0,step:1,unit:`m`,onInput:t=>{r(e,`distance`,Math.round(t)),V()}})],M.append(...P);let F=Q({label:`Colour temperature`,min:1800,max:12e3,value:a.temperature??(c?3200:5600),dec:0,step:100,unit:`K`,marks:[{t:0,l:`1800 K`},{t:.245,l:`4300 K`},{t:1,l:`12000 K`}],onInput:t=>{r(e,`temperature`,Math.round(t)),V()}});c||M.append(F);let I=Z(`div`,`mp-subhead`,`<span class="k">emission colour</span>`),L=dd(a.color,t=>{r(e,`color`,t),V()});I.append(L),M.append(I);let R=Z(`div`,`mp-tags`),ee=xd(`CAST SHADOWS`,!!a.shadows,t=>{r(e,`shadows`,t),V()}),te=xd(s?`DRAW DISTRIBUTION`:`DRAW EMITTER`,s?a.showDistribution!==!1:a.showShape!==!1,t=>{r(e,s?`showDistribution`:`showShape`,t),V()});R.append(ee,te),c&&R.append(xd(`TWO SIDED`,!!a.twoSided,t=>{r(e,`twoSided`,t),V()})),M.append(R),u.append(j),j.querySelector(`.mp-chead .l`).onclick=()=>j.classList.toggle(`shut`);let z=Z(`div`,`pcard mp-light al-place`);z.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Mounting</span><span class="s">World transform · optical axis</span></div></div>`;let ne=Z(`div`,`pbody`),re=[];z.append(ne);let B=(t,n,i)=>{let a=Z(`div`,`mp-subhead`,`<span class="k">${t}</span>`),o=Z(`div`,`al-steppers`);[`X`,`Y`,`Z`].forEach((t,a)=>{let s=Z(`div`,`al-axis`,`<span>${t}</span>`),c=bd({value:i()[a],min:-999,max:999,dec:2,step:.05,unit:a===0?`m`:``,onInput:t=>{let o=[...i()];o[a]=t,r(e,n,o),V()}});s.append(c),s._step=c,o.append(s)}),ne.append(a,o),re.push([o,i])};B(`position`,`pos`,p),l?B(`rotation`,`rot`,()=>a.rot||[0,0,0]):B(`target`,`target`,()=>a.target||[0,0,0]),u.append(z),z.querySelector(`.mp-chead .l`).onclick=()=>z.classList.toggle(`shut`);function V(){y(),A();let e=d(),t=s?e*(a.multiplier??1)*1.8:e/(c?Math.max(.1,(a.width??2)*(a.height??1)):Math.max(.1,a.length??1.5))*.45;C.innerHTML=`${e.toFixed(0)}<em>lm</em>`,w.innerHTML=`${t.toFixed(0)}<em>cd</em>`,T.textContent=Math.min(160,70+(a.temperature??4300)/100).toFixed(0),E.innerHTML=`${f().toFixed(0)}<em>m</em>`,D.querySelector(`.mp-num .i`).textContent=Math.floor(e),D.querySelector(`.mp-num .d`).textContent=``,D.querySelector(`.mp-target .v`).textContent=s?`${a.profile} · ${(a.multiplier??1).toFixed(2)}×`:c?`${(a.width??2).toFixed(2)} × ${(a.height??1).toFixed(2)} m aperture`:`${(a.length??1.5).toFixed(2)} m line source`,N._set(e),P.forEach((e,t)=>e._set(s?[a.multiplier,a.range,a.cone,a.cutoff][t]:c?[a.width,a.height,a.spread][t]:[a.length,a.radius,a.distance][t])),c||F._set(a.temperature),L._set?.(a.color),ee._set(!!a.shadows),te._set(s?a.showDistribution!==!1:a.showShape!==!1),re.forEach(([e,t])=>[...e.children].forEach((e,n)=>e._step._set(t()[n]))),s&&[...D.querySelectorAll(`.al-profiles .mp-tag`)].forEach((e,t)=>e.classList.toggle(`on`,ap[t]===a.profile))}i?.(V);let H=new ResizeObserver(()=>{y(),A(),[N,...P,...c?[]:[F]].forEach(e=>e._paint?.())});return H.observe(u),u._dispose=()=>H.disconnect(),requestAnimationFrame(V),V(),u}var sp=(e,t,n)=>Math.max(t,Math.min(n,e)),cp=e=>{let t=parseInt((e||`#ffffff`).slice(1),16);return[t>>16&255,t>>8&255,t&255]},lp=(e,t=1)=>`rgba(${e.map(Math.round).join(`,`)},${t})`,up=(e,t)=>{let n=e.clientWidth||290,r=Math.min(devicePixelRatio||1,2);(e.width!==n*r||e.height!==t*r)&&(e.width=n*r,e.height=t*r),e.style.height=t+`px`;let i=e.getContext(`2d`);return i.setTransform(r,0,0,r,0,0),[i,n,t]},dp=(e,t,n=``)=>{let r=Z(`div`,`pcard mp-light ${n}`);r.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">${e}</span><span class="s">${t}</span></div></div>`;let i=Z(`div`,`pbody`);return r.append(i),r.querySelector(`.mp-chead .l`).onclick=()=>r.classList.toggle(`shut`),[r,i]},fp=(e,t,n,r,i,a,o)=>{let s=Z(`div`,`mp-subhead`,`<span class="k">${t}</span>`),c=Z(`div`,`ef-steppers`);return[`X`,`Y`,`Z`].forEach((e,t)=>{let s=Z(`div`,`ef-axis`,`<span>${e}</span>`),l=bd({value:r()[t],min:-999,max:999,dec:2,step:.05,unit:t===0?`m`:``,onInput:e=>{let s=[...r()];s[t]=e,a(i,n,s),o()}});s.append(l),s._step=l,c.append(s)}),e.append(s,c),()=>[...c.children].forEach((e,t)=>e._step._set(r()[t]))};function pp(e,t){return e.type===`particles`?mp(e,t):e.type===`probe`?hp(e,t):e.type===`audio`?gp(e,t):_p(e,t)}function mp(e,{compact:t=!1,setProp:n,register:r}){let i=e.props,a=Z(`div`,`mpanel effectpanel particlepanel`),o=()=>i.pos||[0,0,0],s=Z(`div`,`pcard mp-hero ef-hero`),c=Z(`canvas`),l=Z(`div`,`mp-cap`,`<div class="l"><b>Particle field</b><span class="mp-illum ef-sub">EMITTER VOLUME</span></div><div class="r">—</div>`);s.append(c,l),a.append(s);let u=0,d=0,f=!0;function p(){let[e,n,r]=up(c,t?145:174),a=cp(i.color),o=Math.min(420,Math.max(8,Math.floor((i.count??420)/8))),s=i.radius??7,d=i.height??4.2;e.clearRect(0,0,n,r),e.fillStyle=`#040404`,e.fillRect(0,0,n,r),e.strokeStyle=`rgba(255,255,255,.1)`,e.strokeRect(n*.12,r*.12,n*.76,r*.7);for(let t=0;t<o;t++){let o=((Math.sin(t*91.7)*43758.5%1+1)%1-.5)*s/40*n*.7+n/2,c=((t*.618+u*(i.speed??.5))%1+1)%1,l=r*.82-c*(.28+.72*d/30)*r*.66,f=.4+.6*Math.sin(u*4+t*2.7)*(i.flicker??.7);e.fillStyle=lp(a,.18+.7*Math.abs(f)),e.fillRect(o,l,Math.max(1,i.size??1.5),Math.max(1,i.size??1.5))}e.font=`8px ui-sans-serif`,e.fillStyle=`rgba(255,255,255,.3)`,e.fillText(`${s.toFixed(1)} m SPREAD`,8,r-7),e.textAlign=`right`,e.fillText(`${d.toFixed(1)} m COLUMN`,n-8,r-7),l.querySelector(`.r`).textContent=`${(i.count??420).toFixed(0)} particles`}function m(){f&&(u+=.012,p(),d=requestAnimationFrame(m))}let h=Z(`div`,`mp-rail`),g=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return h.append(t),t.querySelector(`.v`)},_=g(`Count`),v=g(`Rise`),y=g(`Column`),b=g(`Density`);a.append(h);let[x,S]=dp(`Emitter`,`Population · spatial envelope`,`ef-emitter`),C=Q({label:`Particle count`,min:0,max:4e3,value:i.count,dec:0,step:20,marks:[{t:0,l:`EMPTY`},{t:.105,l:`420`},{t:1,l:`4 000`}],onInput:t=>{n(e,`count`,Math.round(t)),I()}}),w=Q({label:`Radial spread`,min:.5,max:40,value:i.radius,dec:1,step:.5,unit:`m`,onInput:t=>{n(e,`radius`,t),I()}}),T=Q({label:`Column height`,min:.2,max:30,value:i.height,dec:1,step:.2,unit:`m`,onInput:t=>{n(e,`height`,t),I()}});S.append(C,w,T),a.append(x);let[E,D]=dp(`Particle appearance`,`Point response · temporal motion`,`ef-look`),O=Q({label:`Point size`,min:.2,max:8,value:i.size,dec:2,step:.1,unit:`px`,marks:[{t:0,l:`DUST`},{t:.167,l:`1.5 px`},{t:1,l:`ORB`}],onInput:t=>{n(e,`size`,t),I()}}),k=Q({label:`Rise speed`,min:0,max:3,value:i.speed,dec:2,step:.05,unit:`×`,marks:[{t:0,l:`STILL`},{t:.167,l:`.50×`},{t:1,l:`3×`}],onInput:t=>{n(e,`speed`,t),I()}}),A=Q({label:`Flicker`,min:0,max:1,value:i.flicker,dec:2,step:.01,marks:[{t:0,l:`STEADY`},{t:.7,l:`FIREFLY`},{t:1,l:`STROBE`}],onInput:t=>{n(e,`flicker`,t),I()}});D.append(O,k,A);let j=Z(`div`,`mp-subhead`,`<span class="k">particle colour</span>`),M=dd(i.color,t=>{n(e,`color`,t),I()});j.append(M),D.append(j),a.append(E);let[N,P]=dp(`Emitter placement`,`World coordinates`,`ef-place`),F=fp(P,`origin`,`pos`,o,e,n,I);a.append(N);function I(){p(),_.textContent=i.count.toFixed(0),v.innerHTML=`${i.speed.toFixed(2)}<em>×</em>`,y.innerHTML=`${i.height.toFixed(1)}<em>m</em>`,b.innerHTML=`${(i.count/(Math.PI*i.radius*i.radius*i.height)).toFixed(1)}<em>/m³</em>`,[C,w,T,O,k,A].forEach((e,t)=>e._set([i.count,i.radius,i.height,i.size,i.speed,i.flicker][t])),M._set?.(i.color),F()}r?.(I);let L=new ResizeObserver(()=>{p(),[C,w,T,O,k,A].forEach(e=>e._paint?.())});return L.observe(a),a._dispose=()=>{f=!1,cancelAnimationFrame(d),L.disconnect()},requestAnimationFrame(m),I(),a}function hp(e,{compact:t=!1,setProp:n,register:r}){let i=e.props,a=Z(`div`,`mpanel effectpanel probepanel`),o=()=>i.pos||[0,0,0],s=Z(`div`,`pcard mp-hero ef-hero`),c=Z(`canvas`),l=Z(`div`,`mp-cap`,`<div class="l"><b>Reflection capture</b><span class="mp-illum ef-sub">CUBEMAP PROJECTION</span></div><div class="r">—</div>`);s.append(c,l),a.append(s);function u(){let[e,n,r]=up(c,t?145:174),a=cp(`#7de0ff`),o=Math.min(n/4,r/3),s=n/2-o*1.5,u=r/2-o*.5;e.clearRect(0,0,n,r),e.fillStyle=`#040404`,e.fillRect(0,0,n,r),[[`+X`,1,1],[`−X`,-1,1],[`+Y`,0,0],[`−Y`,0,2],[`+Z`,0,1],[`−Z`,2,1]].forEach(([t,n,r],i)=>{let c=s+n*o,l=u+r*o,d=e.createLinearGradient(c,l,c+o,l+o);d.addColorStop(0,lp(a,.08+i*.025)),d.addColorStop(1,`rgba(${30+i*18},${18+i*10},${42+i*12},.8)`),e.fillStyle=d,e.fillRect(c,l,o-2,o-2),e.strokeStyle=`rgba(255,255,255,.18)`,e.strokeRect(c+.5,l+.5,o-3,o-3),e.fillStyle=`rgba(255,255,255,.45)`,e.font=`8px ui-sans-serif`,e.fillText(t,c+5,l+11)}),l.querySelector(`.r`).textContent=`${i.resolution}² capture`}let d=Z(`div`,`mp-rail`),f=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return d.append(t),t.querySelector(`.v`)},p=f(`Radius`),m=f(`Volume`),h=f(`Face`),g=f(`Mode`);a.append(d);let[_,v]=dp(`Influence volume`,`Spherical blend domain`,`ef-influence`),y=Z(`div`,`mp-meter ef-sphere`,`<div class="hd"><span class="k">radial influence section</span></div>`),b=Z(`canvas`);y.append(b),v.append(y);let x=Q({label:`Capture radius`,min:1,max:80,value:i.radius,dec:1,step:.5,unit:`m`,marks:[{t:0,l:`1 m`},{t:.165,l:`14 m`},{t:1,l:`80 m`}],onInput:t=>{n(e,`radius`,t),N()}}),S=Q({label:`Reflection intensity`,min:0,max:3,value:i.intensity,dec:2,step:.05,unit:`×`,marks:[{t:0,l:`OFF`},{t:.333,l:`REAL 1×`},{t:1,l:`3×`}],onInput:t=>{n(e,`intensity`,t),N()}});v.append(x,S),a.append(_);function C(){let[e,t,n]=up(b,105),r=t/2,a=n/2;e.clearRect(0,0,t,n);let o=e.createRadialGradient(r,a,0,r,a,40);o.addColorStop(0,`rgba(125,224,255,.34)`),o.addColorStop(1,`rgba(125,224,255,.02)`),e.fillStyle=o,e.beginPath(),e.arc(r,a,40,0,Math.PI*2),e.fill(),e.strokeStyle=`rgba(125,224,255,.75)`,e.stroke(),[.25,.5,.75].forEach(t=>{e.strokeStyle=`rgba(255,255,255,.1)`,e.beginPath(),e.arc(r,a,40*t,0,Math.PI*2),e.stroke()}),e.fillStyle=`rgba(255,255,255,.35)`,e.font=`8px ui-sans-serif`,e.textAlign=`center`,e.fillText(`${i.radius.toFixed(1)} m`,r,a+3)}let[w,T]=dp(`Capture`,`Resolution · update policy`,`ef-capture`),E=Z(`div`,`mp-tags ef-res`);[`128`,`256`,`512`,`1024`].forEach(t=>{let r=Z(`button`,`mp-tag${i.resolution===t?` on`:``}`,`${t}²`);r.onclick=()=>{n(e,`resolution`,t),N()},E.append(r)}),T.append(E);let D=Z(`div`,`mp-tags`),O=xd(`REALTIME`,!!i.realtime,t=>{n(e,`realtime`,t),N()}),k=xd(`DRAW BOUNDS`,i.showBounds!==!1,t=>{n(e,`showBounds`,t),N()});D.append(O,k),T.append(D),a.append(w);let[A,j]=dp(`Probe placement`,`World coordinates`,`ef-place`),M=fp(j,`capture origin`,`pos`,o,e,n,N);a.append(A);function N(){u(),C(),p.innerHTML=`${i.radius.toFixed(1)}<em>m</em>`,m.innerHTML=`${(4/3*Math.PI*i.radius**3/1e3).toFixed(1)}<em>km³</em>`,h.textContent=i.resolution,g.textContent=i.realtime?`LIVE`:`BAKED`,x._set(i.radius),S._set(i.intensity),O._set(i.realtime),k._set(i.showBounds!==!1),[...E.children].forEach((e,t)=>e.classList.toggle(`on`,[`128`,`256`,`512`,`1024`][t]===i.resolution)),M()}r?.(N);let P=new ResizeObserver(()=>{u(),C(),x._paint?.(),S._paint?.()});return P.observe(a),a._dispose=()=>P.disconnect(),requestAnimationFrame(N),N(),a}function gp(e,{compact:t=!1,setProp:n,register:r}){let i=e.props,a=Z(`div`,`mpanel effectpanel audiopanel`),o=()=>i.pos||[0,0,0],s=[`Shoreline`,`Wind in pines`,`Night insects`,`Distant thunder`],c=Z(`div`,`pcard mp-hero ef-hero`),l=Z(`canvas`),u=Z(`div`,`mp-cap`,`<div class="l"><b>Spatial audio</b><span class="mp-illum ef-sub">WAVEFORM · 12 S</span></div><div class="r">—</div>`);c.append(l,u),a.append(c);function d(){let[e,n,r]=up(l,t?145:174),a=r/2,o=(i.gain??.8)*r*.28;e.clearRect(0,0,n,r),e.fillStyle=`#040404`,e.fillRect(0,0,n,r),e.strokeStyle=`rgba(183,141,255,.85)`,e.beginPath();for(let t=0;t<n;t++){let r=t/n*18,i=a+(Math.sin(r*2.1)+.45*Math.sin(r*5.7)+.2*Math.sin(r*13.3))*o*.5*(.5+.5*Math.sin(r*.23+1));t?e.lineTo(t,i):e.moveTo(t,i)}e.stroke(),e.strokeStyle=`rgba(255,255,255,.1)`,e.beginPath(),e.moveTo(0,a),e.lineTo(n,a),e.stroke();for(let t=0;t<n;t+=n/12)e.strokeStyle=`rgba(255,255,255,.05)`,e.beginPath(),e.moveTo(t,0),e.lineTo(t,r),e.stroke();u.querySelector(`.r`).textContent=`${i.gain.toFixed(2)}× gain`}let f=Z(`div`,`mp-rail`),p=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return f.append(t),t.querySelector(`.v`)},m=p(`Gain`),h=p(`Falloff`),g=p(`Edge`),_=p(`Mode`);a.append(f);let[v,y]=dp(`Spatial falloff`,`Inverse-distance listening field`,`ef-falloff`),b=Z(`div`,`mp-meter ef-polar`,`<div class="hd"><span class="k">audibility field</span></div>`),x=Z(`canvas`);b.append(x),y.append(b);let S=Q({label:`Source gain`,min:0,max:2,value:i.gain,dec:2,step:.02,unit:`×`,marks:[{t:0,l:`MUTE`},{t:.4,l:`.80×`},{t:1,l:`2×`}],onInput:t=>{n(e,`gain`,t),P()}}),C=Q({label:`Falloff radius`,min:1,max:200,value:i.radius,dec:0,step:1,unit:`m`,marks:[{t:0,l:`1 m`},{t:.156,l:`32 m`},{t:1,l:`200 m`}],onInput:t=>{n(e,`radius`,Math.round(t)),P()}});y.append(S,C),a.append(v);function w(){let[e,t,n]=up(x,112),r=t/2,a=n/2;e.clearRect(0,0,t,n);for(let t=10;t>=1;t--){let n=t/10;e.fillStyle=`rgba(183,141,255,${(1-n)*.35*i.gain})`,e.beginPath(),e.arc(r,a,45*n,0,Math.PI*2),e.fill()}[.25,.5,.75,1].forEach(t=>{e.strokeStyle=`rgba(255,255,255,.1)`,e.beginPath(),e.arc(r,a,45*t,0,Math.PI*2),e.stroke()}),e.fillStyle=`#fff`,e.beginPath(),e.arc(r,a,3,0,Math.PI*2),e.fill(),e.fillStyle=`rgba(255,255,255,.3)`,e.font=`8px ui-sans-serif`,e.textAlign=`center`,e.fillText(`${i.radius} m`,r,a-45-4)}let[T,E]=dp(`Source`,`Clip · playback policy`,`ef-source`),D=Z(`div`,`mp-tags ef-clips`);s.forEach(t=>{let r=Z(`button`,`mp-tag${i.clip===t?` on`:``}`,t.toUpperCase());r.onclick=()=>{n(e,`clip`,t),P()},D.append(r)}),E.append(D);let O=Z(`div`,`mp-tags`),k=xd(`LOOP`,i.loop!==!1,t=>{n(e,`loop`,t),P()}),A=xd(`3D SPATIAL`,i.spatial!==!1,t=>{n(e,`spatial`,t),P()});O.append(k,A),E.append(O),a.append(T);let[j,M]=dp(`Emitter placement`,`World coordinates`,`ef-place`),N=fp(M,`source origin`,`pos`,o,e,n,P);a.append(j);function P(){d(),w(),m.innerHTML=`${i.gain.toFixed(2)}<em>×</em>`,h.innerHTML=`${i.radius}<em>m</em>`,g.innerHTML=`${(-20*Math.log10(Math.max(1,i.radius))).toFixed(0)}<em>dB</em>`,_.textContent=i.spatial?`3D`:`2D`,S._set(i.gain),C._set(i.radius),k._set(i.loop),A._set(i.spatial),[...D.children].forEach((e,t)=>e.classList.toggle(`on`,s[t]===i.clip)),N()}r?.(P);let F=new ResizeObserver(()=>{d(),w(),S._paint?.(),C._paint?.()});return F.observe(a),a._dispose=()=>F.disconnect(),requestAnimationFrame(P),P(),a}function _p(e,{compact:t=!1,setProp:n,register:r}){let i=e.props,a=Z(`div`,`mpanel effectpanel postpanel`),o=[`ACES`,`AgX`,`Filmic`,`Reinhard`,`Linear`],s=Z(`div`,`pcard mp-hero ef-hero`),c=Z(`canvas`),l=Z(`div`,`mp-cap`,`<div class="l"><b>Final image</b><span class="mp-illum ef-sub">BEFORE / AFTER</span></div><div class="r">—</div>`);s.append(c,l),a.append(s);function u(){let[e,n,r]=up(c,t?145:174);e.clearRect(0,0,n,r);for(let t=0;t<n;t++)for(let a=0;a<r;a+=3){let r=t/n*1.25,o=t>n/2;r*=o?i.exposure:1,o&&(r=(r-.5)*(i.contrast??1.02)+.5,r=sp(r,0,1)**(i.tonemap===`Linear`?1:i.tonemap===`Reinhard`?.7:.82));let s=o?i.saturation:1,c=sp(r*(.75+.25*s),0,1),l=sp(r*(.85+.15*s),0,1),u=sp(r*(1.1-.1*s),0,1);e.fillStyle=`rgb(${c*255},${l*255},${u*255})`,e.fillRect(t,a,1,3)}e.strokeStyle=`#fff`,e.beginPath(),e.moveTo(n/2,0),e.lineTo(n/2,r),e.stroke(),e.fillStyle=`rgba(255,255,255,.65)`,e.font=`8px ui-sans-serif`,e.fillText(`SOURCE`,8,13),e.textAlign=`right`,e.fillText(`GRADED`,n-8,13);let a=i.vignette??.32,o=e.createRadialGradient(n*.75,r/2,r*.15,n*.75,r/2,r*.65);o.addColorStop(0,`rgba(0,0,0,0)`),o.addColorStop(1,`rgba(0,0,0,${a})`),e.fillStyle=o,e.fillRect(n/2,0,n/2,r),l.querySelector(`.r`).textContent=`${i.tonemap} · ${i.exposure.toFixed(2)} EV`}let d=Z(`div`,`mp-rail`),f=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return d.append(t),t.querySelector(`.v`)},p=f(`Exposure`),m=f(`Contrast`),h=f(`Saturation`),g=f(`Bloom`);a.append(d);let[_,v]=dp(`Tone response`,`Transfer curve · display mapping`,`ef-tone`),y=Z(`div`,`mp-meter ef-curve`,`<div class="hd"><span class="k">input luminance → display</span></div>`),b=Z(`canvas`);y.append(b),v.append(y);let x=Q({label:`Exposure`,min:.05,max:4,value:i.exposure,dec:2,step:.05,unit:`EV`,marks:[{t:0,l:`DARK`},{t:.24,l:`1 EV`},{t:1,l:`4 EV`}],onInput:t=>{n(e,`exposure`,t),P()}}),S=Q({label:`Contrast`,min:.5,max:2,value:i.contrast,dec:2,step:.02,marks:[{t:0,l:`FLAT`},{t:.347,l:`1.02`},{t:1,l:`HARD`}],onInput:t=>{n(e,`contrast`,t),P()}}),C=Q({label:`Saturation`,min:0,max:2,value:i.saturation,dec:2,step:.02,marks:[{t:0,l:`MONO`},{t:.5,l:`REAL 1`},{t:1,l:`2×`}],onInput:t=>{n(e,`saturation`,t),P()}});v.append(x,S,C);let w=Z(`div`,`mp-tags ef-maps`);o.forEach(t=>{let r=Z(`button`,`mp-tag${i.tonemap===t?` on`:``}`,t.toUpperCase());r.onclick=()=>{n(e,`tonemap`,t),P()},w.append(r)}),v.append(w),a.append(_);function T(){let[e,t,n]=up(b,112);e.clearRect(0,0,t,n),e.strokeStyle=`rgba(255,255,255,.08)`;for(let r=0;r<=4;r++){let i=9+r/4*(t-18),a=9+r/4*(n-18);e.beginPath(),e.moveTo(i,9),e.lineTo(i,n-9),e.moveTo(9,a),e.lineTo(t-9,a),e.stroke()}e.beginPath();for(let r=0;r<=100;r++){let a=r/100,o=(a*i.exposure-.5)*i.contrast+.5,s=i.tonemap===`Linear`?o:o/(1+Math.max(0,o)*.35);r?e.lineTo(9+a*(t-18),n-9-sp(s,0,1)*(n-18)):e.moveTo(9,n-9)}e.strokeStyle=`rgba(255,255,255,.9)`,e.lineWidth=1.5,e.stroke(),e.lineWidth=1}let[E,D]=dp(`Image texture`,`Bloom · vignette · grain`,`ef-image`),O=Q({label:`Bloom strength`,min:0,max:2,value:i.bloomStrength,dec:2,step:.02,marks:[{t:0,l:`OFF`},{t:.21,l:`.42`},{t:1,l:`HALO`}],onInput:t=>{n(e,`bloomStrength`,t),P()}}),k=Q({label:`Bloom threshold`,min:0,max:2,value:i.bloomThreshold,dec:2,step:.02,marks:[{t:0,l:`ALL`},{t:.425,l:`.85`},{t:1,l:`HIGHLIGHTS`}],onInput:t=>{n(e,`bloomThreshold`,t),P()}}),A=Q({label:`Vignette`,min:0,max:1,value:i.vignette,dec:2,step:.01,marks:[{t:0,l:`NONE`},{t:.32,l:`.32`},{t:1,l:`TUNNEL`}],onInput:t=>{n(e,`vignette`,t),P()}}),j=Q({label:`Film grain`,min:0,max:1,value:i.grain,dec:2,step:.01,marks:[{t:0,l:`CLEAN`},{t:.12,l:`.12`},{t:1,l:`COARSE`}],onInput:t=>{n(e,`grain`,t),P()}});D.append(O,k,A,j);let M=Z(`div`,`mp-tags`),N=xd(`BLOOM`,i.bloom!==!1,t=>{n(e,`bloom`,t),P()});M.append(N),D.append(M),a.append(E);function P(){u(),T(),p.innerHTML=`${i.exposure.toFixed(2)}<em>EV</em>`,m.textContent=i.contrast.toFixed(2),h.textContent=i.saturation.toFixed(2),g.textContent=i.bloom?`ON`:`OFF`,[x,S,C,O,k,A,j].forEach((e,t)=>e._set([i.exposure,i.contrast,i.saturation,i.bloomStrength,i.bloomThreshold,i.vignette,i.grain][t])),N._set(i.bloom),[...w.children].forEach((e,t)=>e.classList.toggle(`on`,o[t]===i.tonemap))}r?.(P);let F=new ResizeObserver(()=>{u(),T(),[x,S,C,O,k,A,j].forEach(e=>e._paint?.())});return F.observe(a),a._dispose=()=>F.disconnect(),requestAnimationFrame(P),P(),a}var vp=(e,t,n)=>Math.max(t,Math.min(n,e)),yp={"16:9":16/9,"2.39:1":2.39,"4:3":4/3,"1:1":1},bp=(e,t)=>Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2]),xp=(e,t=36)=>2*Math.atan(t/(2*e))*180/Math.PI,Sp=(e,t=36)=>t/(2*Math.tan(e*Math.PI/360)),Cp=(e,t,n=.03)=>e*e/(t*n)+e;function wp(e,t){let{compact:n=!1,setProp:r,register:i}=t,a=e.props,o=e.type,s=o===`cinecamera`,c=o===`playercamera`,l=o===`vehiclecamera`,u=Z(`div`,`mpanel camerapanel`),d=()=>a.pos||[0,0,0],f=()=>a.lookAt||[0,0,0],p=()=>a.focus??bp(d(),f()),m=()=>a.fov??46,h=(e,t)=>{let n=e.clientWidth||290,r=Math.min(devicePixelRatio||1,2);(e.width!==n*r||e.height!==t*r)&&(e.width=n*r,e.height=t*r),e.style.height=t+`px`;let i=e.getContext(`2d`);return i.setTransform(r,0,0,r,0,0),[i,n,t]},g=Z(`div`,`pcard mp-hero ca-hero`),_=Z(`canvas`);_.title=s?`Drag across for focal length; vertically for focus`:`Drag across for field of view`;let v=Z(`div`,`mp-cap`,`<div class="l"><b>${Xl(e).label}</b><span class="mp-illum ca-sub">LIVE VIEWFINDER</span></div><div class="r">—</div>`);g.append(_,v),u.append(g);let y=null;function b(){let[e,t,r]=h(_,n?148:178),i=yp[a.gate]||16/9;e.clearRect(0,0,t,r);let o=e.createLinearGradient(0,0,0,r);o.addColorStop(0,`#19242e`),o.addColorStop(.55,`#0d1116`),o.addColorStop(1,`#050506`),e.fillStyle=o,e.fillRect(0,0,t,r);let u=t-18,d=Math.min(r-16,u/i),f=(t-u)/2,g=(r-d)/2;e.save(),e.beginPath(),e.rect(f,g,u,d),e.clip();let b=46/m();e.strokeStyle=`rgba(255,255,255,.12)`;for(let n=-5;n<=5;n++)e.beginPath(),e.moveTo(t/2+n*28*b,r*.58),e.lineTo(t/2+n*62*b,r),e.stroke();for(let n=0;n<6;n++){let i=r*.58+r*.42*n*n/25;e.beginPath(),e.moveTo(0,i),e.lineTo(t,i),e.stroke()}[[-.28,.53,32],[.04,.46,22],[.27,.58,27]].forEach(([n,i,a],o)=>{let s=t/2+n*t*b,c=r*i,l=a*b;e.fillStyle=[`#c24f48`,`#8baed0`,`#a78bfa`][o],o===1?(e.beginPath(),e.arc(s,c,l*.65,0,Math.PI*2),e.fill()):e.fillRect(s-l*.55,c-l,l*1.1,l*2)}),e.strokeStyle=`rgba(255,255,255,.18)`,e.setLineDash([2,3]),[1/3,2/3].forEach(t=>{e.beginPath(),e.moveTo(f+u*t,g),e.lineTo(f+u*t,g+d),e.moveTo(f,g+d*t),e.lineTo(f+u,g+d*t),e.stroke()}),e.setLineDash([]),e.strokeStyle=`rgba(255,255,255,.30)`,e.strokeRect(f+u*.05,g+d*.05,u*.9,d*.9),e.restore(),e.fillStyle=`rgba(0,0,0,.88)`,e.fillRect(0,0,t,g),e.fillRect(0,g+d,t,r-g-d),e.fillRect(0,g,f,d),e.fillRect(f+u,g,t-f-u,d),e.strokeStyle=`rgba(255,255,255,.55)`,e.strokeRect(f+.5,g+.5,u-1,d-1),e.font=`8px ui-sans-serif`,e.fillStyle=`rgba(255,255,255,.55)`,e.textAlign=`left`,e.fillText(`${a.gate}  ${m().toFixed(1)}°`,f+6,g+12),e.textAlign=`right`,e.fillText(s?`${a.focal.toFixed(0)} mm  f/${a.aperture.toFixed(1)}  ISO ${a.iso}`:`NEAR ${(a.near??.1).toFixed(2)} m`,f+u-6,g+12);let x=t/2,S=g+d/2;e.strokeStyle=`rgba(255,255,255,.55)`,e.beginPath(),e.moveTo(x-8,S),e.lineTo(x+8,S),e.moveTo(x,S-8),e.lineTo(x,S+8),e.stroke(),y&&(e.strokeStyle=`rgba(255,255,255,.4)`,e.setLineDash([2,3]),e.beginPath(),e.moveTo(y.x,0),e.lineTo(y.x,r),e.moveTo(0,y.y),e.lineTo(t,y.y),e.stroke(),e.setLineDash([])),v.querySelector(`.ca-sub`).textContent=s?`${a.focal.toFixed(0)} mm · ${a.sensorWidth.toFixed(1)} mm sensor · ${p().toFixed(1)} m focus`:l?`${a.mode} mount · ${a.distance.toFixed(1)} m chase`:c?`${a.boom.toFixed(1)} m boom · ${a.damping.toFixed(2)} damping`:`${m().toFixed(1)}° field · ${p().toFixed(1)} m focus`,v.querySelector(`.r`).textContent=a.gate}let x=t=>{let n=_.getBoundingClientRect(),i=vp((t.clientX-n.left)/n.width,0,1),o=vp((t.clientY-n.top)/n.height,0,1);if(y={x:i*n.width,y:o*n.height},s){let t=12+i*188;r(e,`focal`,+t.toFixed(1)),r(e,`fov`,+xp(t,a.sensorWidth).toFixed(1)),r(e,`focus`,+(.2+(1-o)*49.8).toFixed(1))}else{let t=c||l?35:12;r(e,`fov`,+(t+i*((c?120:l?130:120)-t)).toFixed(1)),c&&r(e,`damping`,+(1-o).toFixed(2)),l&&r(e,`lag`,+(1-o).toFixed(2))}H()};_.onpointerdown=e=>{_.setPointerCapture(e.pointerId),_.classList.add(`grabbing`),x(e)},_.onpointermove=e=>{_.hasPointerCapture?.(e.pointerId)&&x(e)},_.onpointerup=()=>{y=null,_.classList.remove(`grabbing`),b()};let S=Z(`div`,`mp-rail`),C=e=>{let t=Z(`div`,`mp-pill`,`<b class="v">—</b><span class="k">${e}</span>`);return S.append(t),t.querySelector(`.v`)},w=C(s?`Focal`:`Field`),T=C(s?`Focus`:`Target`),E=C(`Gate`),D=C(s?`T-stop`:c?`Boom`:l?`Lag`:`Clip`);u.append(S);let O=Z(`div`,`pcard mp-metric ca-frame`);O.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">Framing</span><span class="s">Gate geometry · projection</span></div></div><div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">°</span></div><div class="mp-k mp-target">Horizontal field <span class="v">—</span></div>`;let k=Z(`div`,`mp-chartwrap`),A=Z(`canvas`);k.append(A),O.append(k);let j=Z(`div`,`mp-tags ca-gates`);Object.keys(yp).forEach(t=>{let n=Z(`button`,`mp-tag${a.gate===t?` on`:``}`,t);n.onclick=()=>{r(e,`gate`,t),H()},j.append(n)}),O.append(j),u.append(O);function M(){let[e,t,n]=h(A,108),r=t/2,i=n-17,a=m()*Math.PI/360,o=Math.min(t*.42,(i-8)/Math.max(.15,Math.cos(a))),s=Math.sin(a)*o,c=Math.cos(a)*o;e.clearRect(0,0,t,n),e.fillStyle=`#050505`,e.fillRect(0,0,t,n);let l=e.createLinearGradient(0,i,0,8);l.addColorStop(0,`rgba(105,195,255,.25)`),l.addColorStop(1,`rgba(105,195,255,.03)`),e.fillStyle=l,e.beginPath(),e.moveTo(r,i),e.lineTo(r-s,i-c),e.lineTo(r+s,i-c),e.closePath(),e.fill(),e.strokeStyle=`rgba(255,255,255,.7)`,e.beginPath(),e.moveTo(r-s,i-c),e.lineTo(r,i),e.lineTo(r+s,i-c),e.stroke(),[.25,.5,.75].forEach(t=>{e.strokeStyle=`rgba(255,255,255,.1)`,e.beginPath(),e.moveTo(r-s*t,i-c*t),e.lineTo(r+s*t,i-c*t),e.stroke()}),e.fillStyle=`rgba(255,255,255,.3)`,e.font=`8px ui-sans-serif`,e.textAlign=`center`,e.fillText(`${m().toFixed(1)}° FIELD`,r,n-3)}let N=[],P=()=>{};if(s){let[t,n]=V(`Cinema lens`,`Depth of field · exposure triangle`),i=Z(`div`,`mp-meter ca-dof`,`<div class="hd"><span class="k">depth of field · metres</span></div>`),o=Z(`canvas`);i.append(o),n.append(i);let s=Q({label:`Focal length`,min:12,max:200,value:a.focal,dec:0,step:1,unit:`mm`,marks:[{t:0,l:`12 WIDE`},{t:.202,l:`50 mm`},{t:1,l:`200 TELE`}],onInput:t=>{r(e,`focal`,Math.round(t)),r(e,`fov`,+xp(t,a.sensorWidth).toFixed(1)),H()}}),c=Q({label:`Focus distance`,min:.2,max:100,value:a.focus,dec:1,step:.1,unit:`m`,toPos:e=>Math.log(e/.2)/Math.log(500),fromPos:e=>.2*500**e,marks:[{t:0,l:`.2 m`},{t:.63,l:`10 m`},{t:1,l:`100 m`}],onInput:t=>{r(e,`focus`,t),H()}}),l=Q({label:`Aperture`,min:.7,max:22,value:a.aperture,dec:1,step:.1,unit:`f`,marks:[{t:0,l:`f/.7`},{t:.1,l:`2.8`},{t:1,l:`f/22`}],onInput:t=>{r(e,`aperture`,t),H()}});n.append(s,c,l),u.append(t);function d(){let[e,t,n]=h(o,92),r=a.focal,i=a.aperture,s=a.focus*1e3,c=Cp(r,i),l=c*s/(c+s-r)/1e3,u=s>=c?1/0:c*s/(c-s+r)/1e3,d=e=>8+Math.log10(Math.max(.2,e)/.2)/Math.log10(500)*(t-16);e.clearRect(0,0,t,n),e.fillStyle=`#050505`,e.fillRect(0,0,t,n),e.fillStyle=`rgba(105,195,255,.22)`,e.fillRect(d(l),30,(isFinite(u)?d(Math.min(100,u)):t-8)-d(l),25),e.strokeStyle=`#fff`,e.beginPath(),e.moveTo(d(a.focus),20),e.lineTo(d(a.focus),66),e.stroke(),e.fillStyle=`rgba(255,255,255,.3)`,e.font=`8px ui-sans-serif`,e.textAlign=`left`,e.fillText(`.2 m`,8,n-7),e.textAlign=`center`,e.fillText(`10 m`,d(10),n-7),e.textAlign=`right`,e.fillText(`∞`,t-8,n-7),e.textAlign=`center`,e.fillText(`${l.toFixed(1)} — ${isFinite(u)?u.toFixed(1):`∞`} m`,t/2,18)}let[f,p]=V(`Exposure`,`Motion cadence · sensor gain`),m=Q({label:`Shutter angle`,min:1,max:360,value:a.shutterAngle,dec:0,step:1,unit:`°`,marks:[{t:0,l:`1°`},{t:.5,l:`180°`},{t:1,l:`360°`}],onInput:t=>{r(e,`shutterAngle`,Math.round(t)),H()}}),g=Q({label:`Sensor ISO`,min:25,max:12800,value:a.iso,dec:0,step:25,toPos:e=>Math.log2(e/25)/Math.log2(512),fromPos:e=>25*512**e,marks:[{t:0,l:`25`},{t:.556,l:`800`},{t:1,l:`12 800`}],onInput:t=>{r(e,`iso`,Math.round(t/25)*25),H()}}),_=Q({label:`Sensor width`,min:12,max:70,value:a.sensorWidth,dec:1,step:.5,unit:`mm`,marks:[{t:0,l:`S16 12`},{t:.414,l:`FF 36`},{t:1,l:`70 mm`}],onInput:t=>{r(e,`sensorWidth`,t),r(e,`fov`,+xp(a.focal,t).toFixed(1)),H()}}),v=Q({label:`Anamorphic squeeze`,min:1,max:2,value:a.squeeze,dec:2,step:.05,unit:`×`,marks:[{t:0,l:`SPHERICAL`},{t:.33,l:`1.33×`},{t:1,l:`2×`}],onInput:t=>{r(e,`squeeze`,t),H()}});p.append(m,g,_,v),u.append(f),N=[s,c,l,m,g,_,v],P=()=>{d(),[s,c,l,m,g,_,v].forEach((e,t)=>e._set([a.focal,a.focus,a.aperture,a.shutterAngle,a.iso,a.sensorWidth,a.squeeze][t]))}}else if(c){let[t,n]=V(`Player rig`,`Spring arm · collision · response`),i=Z(`div`,`mp-meter ca-rig`,`<div class="hd"><span class="k">third-person spring arm</span></div>`),o=Z(`canvas`);i.append(o),n.append(i);let s=Q({label:`Boom length`,min:0,max:12,value:a.boom,dec:1,step:.1,unit:`m`,marks:[{t:0,l:`FIRST PERSON`},{t:.35,l:`4.2 m`},{t:1,l:`12 m`}],onInput:t=>{r(e,`boom`,t),H()}}),c=Q({label:`Shoulder offset`,min:-2,max:2,value:a.shoulder,dec:2,step:.05,unit:`m`,marks:[{t:0,l:`LEFT`},{t:.5,l:`CENTRE`},{t:1,l:`RIGHT`}],onInput:t=>{r(e,`shoulder`,t),H()}}),l=Q({label:`Follow damping`,min:0,max:1,value:a.damping,dec:2,step:.01,marks:[{t:0,l:`RIGID`},{t:.72,l:`FOLLOW .72`},{t:1,l:`FLOAT`}],onInput:t=>{r(e,`damping`,t),H()}}),d=Q({label:`Field of view`,min:35,max:120,value:a.fov,dec:0,step:1,unit:`°`,marks:[{t:0,l:`35°`},{t:.435,l:`PLAYER 72°`},{t:1,l:`120°`}],onInput:t=>{r(e,`fov`,t),H()}});n.append(s,c,l,d);let f=Z(`div`,`mp-tags`),p=xd(`CAMERA COLLISION`,a.collision!==!1,t=>{r(e,`collision`,t),H()}),m=xd(`PLAYER INPUT`,a.input!==!1,t=>{r(e,`input`,t),H()});f.append(p,m),n.append(f),u.append(t);function g(){let[e,t,n]=h(o,104),r=n-16,i=t*.68,s=r-33,c=i-a.boom/12*t*.52,l=s-14;e.clearRect(0,0,t,n),e.fillStyle=`#050505`,e.fillRect(0,0,t,n),e.strokeStyle=`rgba(255,255,255,.15)`,e.beginPath(),e.moveTo(8,r),e.lineTo(t-8,r),e.stroke(),e.fillStyle=`rgba(255,255,255,.55)`,e.fillRect(i-7,s-22,14,22),e.beginPath(),e.arc(i,s-29,7,0,Math.PI*2),e.fill(),e.strokeStyle=`#69c3ff`,e.lineWidth=2,e.beginPath(),e.moveTo(i,s-20),e.lineTo(c,l),e.stroke(),e.lineWidth=1,e.fillStyle=`#69c3ff`,e.fillRect(c-7,l-5,14,10),e.setLineDash([3,3]),e.strokeStyle=`rgba(105,195,255,.45)`,e.beginPath(),e.moveTo(c,l),e.lineTo(i,s-12),e.stroke(),e.setLineDash([])}N=[s,c,l,d],P=()=>{g(),[s,c,l,d].forEach((e,t)=>e._set([a.boom,a.shoulder,a.damping,a.fov][t])),p._set(a.collision),m._set(a.input)}}else if(l){let[t,n]=V(`Vehicle rig`,`Mount preset · velocity response`),i=Z(`div`,`mp-meter ca-car`,`<div class="hd"><span class="k">automotive camera envelope</span></div>`),o=Z(`canvas`);i.append(o),n.append(i);let s=Z(`div`,`mp-tags ca-modes`);[`Chase`,`Bumper`,`Cockpit`,`Hood`,`Orbit Rig`].forEach(t=>{let n=Z(`button`,`mp-tag${a.mode===t?` on`:``}`,t.toUpperCase());n.onclick=()=>{r(e,`mode`,t),H()},s.append(n)}),n.append(s);let c=Q({label:`Follow distance`,min:0,max:20,value:a.distance,dec:1,step:.1,unit:`m`,marks:[{t:0,l:`MOUNTED`},{t:.325,l:`CHASE 6.5`},{t:1,l:`20 m`}],onInput:t=>{r(e,`distance`,t),H()}}),l=Q({label:`Mount height`,min:.2,max:6,value:a.height,dec:1,step:.1,unit:`m`,marks:[{t:0,l:`BUMPER`},{t:.276,l:`1.8 m`},{t:1,l:`6 m`}],onInput:t=>{r(e,`height`,t),H()}}),d=Q({label:`Velocity lag`,min:0,max:1,value:a.lag,dec:2,step:.01,marks:[{t:0,l:`LOCKED`},{t:.35,l:`CHASE .35`},{t:1,l:`DRIFT`}],onInput:t=>{r(e,`lag`,t),H()}}),f=Q({label:`Look ahead`,min:0,max:50,value:a.lookAhead,dec:0,step:1,unit:`m`,marks:[{t:0,l:`CAR`},{t:.24,l:`12 m`},{t:1,l:`50 m`}],onInput:t=>{r(e,`lookAhead`,Math.round(t)),H()}}),p=Q({label:`Road vibration`,min:0,max:1,value:a.shake,dec:2,step:.01,marks:[{t:0,l:`STABILIZED`},{t:.12,l:`.12`},{t:1,l:`RAW`}],onInput:t=>{r(e,`shake`,t),H()}});n.append(c,l,d,f,p);let m=Z(`div`,`mp-tags`),g=xd(`HORIZON LOCK`,a.horizonLock!==!1,t=>{r(e,`horizonLock`,t),H()}),_=xd(`COLLISION SWEEP`,a.collision!==!1,t=>{r(e,`collision`,t),H()});m.append(g,_),n.append(m),u.append(t);function v(){let[e,t,n]=h(o,110),r=n-22,i=t*.63;e.clearRect(0,0,t,n),e.fillStyle=`#050505`,e.fillRect(0,0,t,n),e.strokeStyle=`rgba(255,255,255,.1)`;for(let r=0;r<t;r+=24)e.beginPath(),e.moveTo(r,8),e.lineTo(r,n-8),e.stroke();e.fillStyle=`#343a42`,e.beginPath(),e.roundRect(i-42,r-24,84,22,8),e.fill(),e.fillStyle=`#111`,[i-27,i+27].forEach(t=>{e.beginPath(),e.arc(t,r,9,0,Math.PI*2),e.fill()});let s=i-a.distance/20*t*.5,c=r-20-a.height/6*n*.55;e.strokeStyle=`#5eead4`,e.beginPath(),e.moveTo(i,r-20),e.lineTo(s,c),e.stroke(),e.fillStyle=`#5eead4`,e.fillRect(s-8,c-5,16,10),e.setLineDash([3,3]),e.strokeStyle=`rgba(94,234,212,.4)`,e.beginPath(),e.moveTo(s,c),e.lineTo(i+a.lookAhead/50*t*.28,r-15),e.stroke(),e.setLineDash([])}N=[c,l,d,f,p],P=()=>{v(),[c,l,d,f,p].forEach((e,t)=>e._set([a.distance,a.height,a.lag,a.lookAhead,a.shake][t])),g._set(a.horizonLock),_._set(a.collision),[...s.children].forEach((e,t)=>e.classList.toggle(`on`,[`Chase`,`Bumper`,`Cockpit`,`Hood`,`Orbit Rig`][t]===a.mode))}}else{let[t,n]=V(`Perspective lens`,`Field · focus · aperture`),i=Q({label:`Field of view`,min:12,max:120,value:a.fov,dec:0,step:1,unit:`°`,marks:[{t:0,l:`TELE 12°`},{t:.315,l:`46°`},{t:1,l:`ULTRA 120°`}],onInput:t=>{r(e,`fov`,t),H()}}),o=Q({label:`Focus distance`,min:.2,max:80,value:a.focus,dec:1,step:.1,unit:`m`,marks:[{t:0,l:`.2 m`},{t:.148,l:`12 m`},{t:1,l:`80 m`}],onInput:t=>{r(e,`focus`,t),H()}}),s=Q({label:`Aperture`,min:.7,max:22,value:a.aperture,dec:1,step:.1,unit:`f`,marks:[{t:0,l:`f/.7`},{t:.1,l:`2.8`},{t:1,l:`f/22`}],onInput:t=>{r(e,`aperture`,t),H()}}),c=Q({label:`Shutter`,min:1,max:500,value:a.shutter,dec:0,step:1,unit:`1/s`,marks:[{t:0,l:`1 s`},{t:.118,l:`1/60`},{t:1,l:`1/500`}],onInput:t=>{r(e,`shutter`,Math.round(t)),H()}});n.append(i,o,s,c),u.append(t),N=[i,o,s,c],P=()=>[i,o,s,c].forEach((e,t)=>e._set([a.fov,a.focus,a.aperture,a.shutter][t]))}let[F,I]=V(`Camera transform`,`World placement · look target`),L=Z(`div`,`mp-meter ca-plan`,`<div class="hd"><span class="k">plan view · source to target</span></div>`),R=Z(`canvas`);L.append(R),I.append(L);let ee=[];function te(t,n,i){let a=Z(`div`,`mp-subhead`,`<span class="k">${t}</span>`),o=Z(`div`,`ca-steppers`);[`X`,`Y`,`Z`].forEach((t,a)=>{let s=Z(`div`,`ca-axis`,`<span>${t}</span>`),c=bd({value:i()[a],min:-999,max:999,dec:2,step:.05,unit:a===0?`m`:``,onInput:t=>{let o=[...i()];o[a]=t,r(e,n,o),H()}});s.append(c),s._step=c,o.append(s)}),I.append(a,o),ee.push([o,i])}te(`camera position`,`pos`,d),te(`look target`,`lookAt`,f);let z=Z(`div`,`mp-tags`),ne=xd(`DRAW FRUSTUM`,a.showFrustum!==!1,t=>{r(e,`showFrustum`,t),H()});z.append(ne),I.append(z),u.append(F);function re(){let[e,t,n]=h(R,115),r=t/2,i=n/2,a=Math.min(t,n)-18,o=e=>[r+vp(e[0]/20,-1,1)*a/2,i+vp(e[2]/20,-1,1)*a/2],s=o(d()),c=o(f());e.clearRect(0,0,t,n),e.fillStyle=`#050505`,e.fillRect(0,0,t,n);for(let t=-4;t<=4;t++)e.strokeStyle=t?`rgba(255,255,255,.06)`:`rgba(255,255,255,.18)`,e.beginPath(),e.moveTo(r+t*a/8,9),e.lineTo(r+t*a/8,n-9),e.moveTo(r-a/2,i+t*a/8),e.lineTo(r+a/2,i+t*a/8),e.stroke();e.strokeStyle=`#69c3ff`,e.beginPath(),e.moveTo(...s),e.lineTo(...c),e.stroke(),e.fillStyle=`#fff`,e.beginPath(),e.arc(...c,4,0,Math.PI*2),e.fill(),e.fillStyle=`#69c3ff`,e.fillRect(s[0]-6,s[1]-4,12,8)}let B=t=>{let n=R.getBoundingClientRect(),i=Math.min(n.width,n.height)-18,a=vp((t.clientX-n.left-n.width/2)/(i/2),-1,1)*20,o=vp((t.clientY-n.top-n.height/2)/(i/2),-1,1)*20,s=[...d()];s[0]=+a.toFixed(2),s[2]=+o.toFixed(2),r(e,`pos`,s),H()};R.onpointerdown=e=>{R.setPointerCapture(e.pointerId),R.classList.add(`drag`),B(e)},R.onpointermove=e=>{R.hasPointerCapture?.(e.pointerId)&&B(e)},R.onpointerup=e=>R.releasePointerCapture?.(e.pointerId);function V(e,t){let n=Z(`div`,`pcard mp-light`);n.innerHTML=`<div class="mp-chead"><div class="l"><span class="t">${e}</span><span class="s">${t}</span></div></div>`;let r=Z(`div`,`pbody`);return n.append(r),n.querySelector(`.mp-chead .l`).onclick=()=>n.classList.toggle(`shut`),[n,r]}function H(){b(),M(),re(),P();let e=bp(d(),f());w.innerHTML=s?`${a.focal.toFixed(0)}<em>mm</em>`:`${m().toFixed(0)}<em>°</em>`,T.innerHTML=`${(s?p():e).toFixed(1)}<em>m</em>`,E.textContent=a.gate,D.innerHTML=s?`f/${a.aperture.toFixed(1)}`:c?`${a.boom.toFixed(1)}<em>m</em>`:l?`${a.lag.toFixed(2)}`:`${a.focus.toFixed(1)}<em>m</em>`,O.querySelector(`.mp-num .i`).textContent=Math.floor(m()),O.querySelector(`.mp-num .d`).textContent=`.`+Math.round(m()*10)%10,O.querySelector(`.mp-target .v`).textContent=`${a.gate} · ${Sp(m(),a.sensorWidth||36).toFixed(0)} mm equivalent`,[...j.children].forEach((e,t)=>e.classList.toggle(`on`,Object.keys(yp)[t]===a.gate)),ee.forEach(([e,t])=>[...e.children].forEach((e,n)=>e._step._set(t()[n]))),ne._set(a.showFrustum!==!1)}i?.(H);let ie=new ResizeObserver(()=>{b(),M(),re(),N.forEach(e=>e._paint?.())});return ie.observe(u),u._dispose=()=>ie.disconnect(),requestAnimationFrame(H),H(),u}var Tp={folder:{build:Lf,owns:[`Group`]},cube:{build:Hf,owns:[`Transform`,`Surface`]},sphere:{build:Hf,owns:[`Transform`,`Surface`]},torus:{build:Hf,owns:[`Transform`,`Surface`]},cylinder:{build:Hf,owns:[`Transform`,`Surface`]},plane:{build:Hf,owns:[`Transform`,`Surface`]},pointlight:{build:tp,owns:[`Transform`,`Emission`]},spotlight:{build:tp,owns:[`Transform`,`Cone`]},ieslight:{build:op,owns:[`Transform`,`Photometry`]},arealight:{build:op,owns:[`Transform`,`Emitter`]},tubelight:{build:op,owns:[`Transform`,`Emitter`]},particles:{build:pp,owns:[`Emitter`,`Look`]},probe:{build:pp,owns:[`Capture`]},audio:{build:pp,owns:[`Source`]},post:{build:pp,owns:[`Tone`,`Image`]},camera:{build:wp,owns:[`Transform`,`Lens`,`Framing`]},cinecamera:{build:wp,owns:[`Transform`,`Cinema Lens`]},playercamera:{build:wp,owns:[`Transform`,`Player Rig`]},vehiclecamera:{build:wp,owns:[`Transform`,`Vehicle Rig`]},clouds:{build:Xf,owns:[`Layer`,`Motion & tint`]},moon:{build:Md,owns:[`Orbit`,`Appearance`]},sun:{build:Gd,owns:[`Orbit`,`Disc & light`]},water:{build:nf,owns:[`Body`,`Waves`,`Surface`]},wind:{build:uf,owns:[`Field`]},sky:{build:yf,owns:[`Atmosphere`,`Look`,`Rendering`]},stars:{build:Df,owns:[`Field`,`Sphere`]},fog:{build:Ff,owns:[`Volumetrics`]}},Ep=[`#c9a24b`,`#ef5350`,`#f59e0b`,`#22c55e`,`#3b82f6`,`#8b5cf6`,`#ec4899`,`#9aa0a6`],Dp=new Set;vd.on(`propchange`,({node:e,src:t})=>Dp.forEach(n=>{n!==t&&n.node===e&&n.sync()}));function Op(e,t,n,r){e.props[t]=n,vd.emit(`propchange`,{node:e,key:t,value:n,src:r})}function kp(e,t,{wide:n=!1}={}){let r=Z(`div`,`prow${n?` wide`:``}`);return r.append(Z(`span`,`pl`,e),t),r}function Ap(e,t,n){let r=e.props[t.k];switch(t.kind){case`slider`:return cd({min:t.min,max:t.max,value:r??t.def,dec:t.dec,unit:t.unit,hi:t.hi,thin:n.compact,onInput:r=>Op(e,t.k,r,n)});case`switch`:return ld(r,r=>Op(e,t.k,r,n));case`vec3`:return ud(r||[0,0,0],{step:t.step,disabled:e.locked,dec:2,onChange:r=>Op(e,t.k,r,n)});case`color`:return t.swatches?fd(r,Ep,r=>Op(e,t.k,r,n)):dd(r,r=>Op(e,t.k,r,n));case`select`:return pd(t.options,r,r=>Op(e,t.k,r,n));case`readout`:{let n=Z(`span`,`val`,jp(e,t.k));return n._set=()=>{n.textContent=jp(e,t.k)},n}default:return Z(`span`,`val`,String(r))}}var jp=(e,t)=>t===`children`?`${e.kids.length} direct · ${(function e(t){return t.reduce((t,n)=>t+1+e(n.kids),0)})(e.kids)} total`:String(e.props[t]??`—`);function Mp(e,{compact:t=!1,onDirty:n=()=>{}}={}){let r=Z(`div`,`sheet`),i=[],a=[],o={node:e,compact:t,sync:()=>{i.forEach(t=>t.ctl._set&&t.ctl._set(e.props[t.def.k])),a.forEach(e=>e())}};Dp.add(o);let s=Xl(e),c=Tp[e.type],l=new Set(c&&c.owns||[]),u=null;r._dispose=()=>{Dp.delete(o),u&&u._dispose&&u._dispose()},t||d();function d(){let t=Z(`div`,`ident`);t.innerHTML=`<div class="glyph">${X(s.icon,{size:18,color:e.props.tint||s.color})}</div>
     <div class="who"><span class="name-edit" title="Double click to rename">${e.name}</span>
       <div class="kind">${s.label}${e.locked?` · locked`:``}${e.vis?``:` · hidden`}</div></div>`;let i=Z(`div`,`row-actions`);i.style.cssText=`display:flex;gap:6px;`;let a=Z(`button`,`iconbtn ghost${e.vis?``:` on`}`,X(e.vis?`eye`:`eyeoff`,{size:13}));a.title=`Visibility  (H)`,a.onclick=()=>{e.vis=!e.vis,vd.emit(`treechange`),n()};let o=Z(`button`,`iconbtn ghost${e.locked?` on`:``}`,X(e.locked?`lock`:`unlock`,{size:13}));o.title=`Lock  (L)`,o.onclick=()=>{e.locked=!e.locked,vd.emit(`treechange`),n()},i.append(a,o),t.appendChild(i),t.querySelector(`.name-edit`).ondblclick=t=>{md(e,t.currentTarget,()=>{vd.emit(`treechange`),n()})},r.appendChild(t)}if(c&&(r.classList.add(`bespoke`),u=c.build(e,{compact:t,setProp:(e,t,n)=>Op(e,t,n,o),register:e=>a.push(e),onDirty:n}),r.appendChild(u)),(s.groups||[]).filter(e=>!l.has(e.title)).forEach((n,a)=>{let s=Z(`div`,`pcard`),c=Z(`h4`,null,`${n.title}<span class="cw">${X(`chevdown`,{size:12})}</span>`),l=Z(`div`,`pbody`);c.onclick=()=>{s.classList.toggle(`shut`),s.classList.contains(`shut`)||hd(s)},s.append(c,l),n.props.forEach(t=>{let n=Ap(e,t,o);i.push({def:t,ctl:n}),l.appendChild(kp(t.label,n))}),r.appendChild(s),t&&a>2&&s.classList.add(`shut`)}),!Yl(e)){let t=Z(`div`,`pcard mp-state`);t.innerHTML=`<h4>Object<span class="cw">${X(`chevdown`,{size:12})}</span></h4>`;let i=Z(`div`,`pbody`);t.appendChild(i),t.querySelector(`h4`).onclick=()=>t.classList.toggle(`shut`);let a=Z(`div`,`mp-tags`);a.append(xd(`VISIBLE`,e.vis,t=>{e.vis=t,vd.emit(`treechange`),n()}),xd(`LOCKED`,e.locked,t=>{e.locked=t,vd.emit(`treechange`),n()}),xd(`DYNAMIC`,e.dynamic,t=>{e.dynamic=t,vd.emit(`treechange`)})),Array.isArray(e.props.pos)&&a.appendChild(xd(`PHYSICS`,!!e.physics,t=>{e.physics=t,e.vel=0,vd.emit(`treechange`),vd.emit(`physicschange`)})),i.append(a,Sd([[`type`,Vl[e.type].label],[`id`,`#${String(e.id).padStart(3,`0`)}`]])),r.appendChild(t)}let f=Z(`div`,`pcard`);f.innerHTML=`<h4>Notes<span class="cw">${X(`chevdown`,{size:12})}</span></h4>`;let p=Z(`div`,`pbody`),m=Z(`textarea`,`notes`);return m.placeholder=`Notes for ${e.name}…`,m.spellcheck=!1,m.value=e.notes||``,m.oninput=()=>{e.notes=m.value},m.onkeydown=e=>e.stopPropagation(),p.appendChild(m),f.appendChild(p),f.querySelector(`h4`).onclick=e=>{e.target.closest(`textarea`)||f.classList.toggle(`shut`)},t&&f.classList.add(`shut`),r.appendChild(f),r}function Np(e,t,n=()=>({left:8,top:8,right:innerWidth-8,bottom:innerHeight-8})){let r=new Map;function i(e){let t=r.get(e);t&&(t.elm.classList.add(`closing`),t.sheet._dispose&&t.sheet._dispose(),t.tether.remove(),setTimeout(()=>t.elm.remove(),160),r.delete(e))}let a=()=>[...r.keys()].forEach(i);function o(e){return r.has(e.id)?(i(e.id),null):c(e)}function s(e=null){[...r.values()].forEach(t=>{t.auto&&t.node.id!==e&&i(t.node.id)})}function c(n,{auto:a=!1}={}){if(r.has(n.id)){let e=r.get(n.id);return a||(e.auto=!1),l(e),e}let o=Xl(n),s=Z(`div`,`pop`),c=Z(`div`);c.style.cssText=`position:absolute;height:1px;background:linear-gradient(90deg,rgba(255,255,255,.45),rgba(255,255,255,.12));transform-origin:0 50%;pointer-events:none;z-index:-1;`,e.appendChild(c);let d=Z(`div`,`pop-head`,`<div class="glyph">${X(o.icon,{size:14,color:o.color})}</div>
       <div style="min-width:0;flex:1">
         <div class="t"></div><div class="s">${o.label}</div>
       </div>`),f=d.querySelector(`.t`);f.textContent=n.name,f.title=`Double click to rename`,f.style.cursor=`text`,f.ondblclick=()=>md(n,f,()=>{f.textContent=n.name,t.refreshChrome()});let p=Z(`button`,`iconbtn ghost`,X(n.vis?`eye`:`eyeoff`,{size:12}));p.title=`Visibility  (H)`,p.onclick=()=>{n.vis=!n.vis,p.innerHTML=X(n.vis?`eye`:`eyeoff`,{size:12}),p.classList.toggle(`on`,!n.vis),vd.emit(`treechange`)};let m=Z(`button`,`iconbtn ghost`,X(`pin`,{size:12}));m.title=`Pin in place`;let h=Z(`button`,`iconbtn ghost`,X(`focus`,{size:12}));h.title=`Frame in viewport  (F)`;let g=Z(`button`,`iconbtn ghost`,X(`close`,{size:12}));g.title=`Close  (Esc)`,d.append(p,h,m,g);let _=Z(`div`,`pop-body`),v=Mp(n,{compact:!0,onDirty:()=>{d.querySelector(`.t`).textContent=n.name,t.refreshChrome()}});_.appendChild(v);let y=Z(`div`,`pop-foot`),b=Z(`button`,`btn sm ghost`,`${X(`panelR`,{size:12})} Inspector`);b.onclick=()=>{t.select(n.id),t.showInspector()};let x=Z(`button`,`btn sm ghost`,`${X(`solo`,{size:12})} Isolate`),S=()=>{x.classList.toggle(`on`,nu(n)),x.lastChild.textContent=nu(n)?` Leave`:` Isolate`};x.onclick=()=>{t.toggleIsolateNode(n),S()},S(),y.append(b,x),s.append(d,_,y),e.appendChild(s);let C={node:n,elm:s,tether:c,sheet:v,pinned:!1,detached:!1,auto:a,pos:{x:0,y:0}};return a&&s.classList.add(`auto`),r.set(n.id,C),g.onclick=()=>i(n.id),h.onclick=()=>t.focus(n),m.onclick=()=>{C.pinned=!C.pinned,C.auto=!1,s.classList.remove(`auto`),C.detached=C.detached||C.pinned,m.classList.toggle(`on`,C.pinned),c.style.display=C.pinned?`none`:``},d.addEventListener(`pointerdown`,e=>{if(e.target.closest(`button`))return;d.classList.add(`grabbing`),C.auto=!1,s.classList.remove(`auto`),d.setPointerCapture(e.pointerId);let t={x:e.clientX,y:e.clientY,px:C.pos.x,py:C.pos.y};C.detached=!0;let n=e=>{C.pos.x=t.px+(e.clientX-t.x),C.pos.y=t.py+(e.clientY-t.y),u(C)},r=()=>{d.classList.remove(`grabbing`),d.removeEventListener(`pointermove`,n),d.removeEventListener(`pointerup`,r)};d.addEventListener(`pointermove`,n),d.addEventListener(`pointerup`,r)}),s.addEventListener(`pointerdown`,()=>{[...r.values()].forEach(e=>e.elm.style.zIndex=`1`),s.style.zIndex=`2`}),C}let l=e=>{e.elm.style.animation=`none`,e.elm.offsetWidth,e.elm.style.animation=`popIn .22s var(--ease)`};function u(e){let t=n(),r=e.elm.offsetWidth||318,i=e.elm.offsetHeight||320,a=Math.min(Math.max(e.pos.x,t.left+10),Math.max(t.right-r-10,t.left+10)),o=Math.min(Math.max(e.pos.y,t.top+10),Math.max(t.bottom-i-10,t.top+10));return e.elm.style.left=a+`px`,e.elm.style.top=o+`px`,{x:a,y:o,w:r,h:i}}function d(e){r.forEach(t=>{let r=e.screenPos(t.node.id);if(!t.detached){let e=n(),i=t.elm.offsetWidth||318;if(r){let n=r.x+46;t.pos.x=n+i+12>e.right?r.x-i-16:n,t.pos.y=r.y-14}else t.pinned||(t.pos.x=e.right-i-20,t.pos.y=e.top+70)}let i=u(t);if(r&&!t.pinned){let e=r.x+r.w/2,n=r.y+r.h/2,a=(i.x>e?i.x:i.x+i.w)-e,o=i.y+22-n,s=Math.hypot(a,o);t.tether.style.display=s>8&&s<900?`block`:`none`,t.tether.style.left=e+`px`,t.tether.style.top=n+`px`,t.tether.style.width=s+`px`,t.tether.style.transform=`rotate(${Math.atan2(o,a)}rad)`}else t.tether.style.display=`none`})}return{openFor:c,toggle:o,close:i,closeAll:a,closeAuto:s,update:d,has:e=>r.has(e),count:()=>r.size,ids:()=>[...r.keys()]}}var Pp=e=>String(e).toLowerCase().replace(/[^a-z0-9]+/g,` `).trim(),Fp=e=>e.replace(/\s+/g,` `).trim(),Ip=`(-?\\d+(?:\\.\\d+)?)`,Lp=/\b(?:please|the|a|an|of|for|with|its|it's|entity|entities|object|objects|thing|things)\b/gi,Rp=e=>Fp(String(e).replace(Lp,` `).replace(/[,.;]+\s*$/,``).replace(/\s+/g,` `));function zp(e,t){let n=0;for(let r of t)r===e[n]&&n++;return n===e.length}function Bp(e,t){let n=Pp(e);if(!n)return 0;let r=Pp(t.name),i=Pp(Xl(t).label);if(n===r)return 100;if(r.startsWith(n+` `))return 88;if(r.startsWith(n))return 84;if(r.endsWith(` `+n))return 80;if(r.includes(` `+n+` `))return 74;if(r.includes(n))return 62;if(n===i)return 52;let a=n.split(` `),o=r.split(` `).concat(i.split(` `)),s=a.filter(e=>o.some(t=>t.startsWith(e)||e.startsWith(t))).length;if(s===a.length)return 58;if(s)return 26+s*6;let c=n.replace(/[0-9]+$/,``);return c&&c!==n&&(r.includes(c)||i===c)?64:zp(n.replace(/ /g,``),(r+i).replace(/ /g,``))?16:0}var Vp={cube:[`cube`,`box`,`block`],sphere:[`sphere`,`ball`,`orb`],torus:[`torus`,`donut`,`ring`],cylinder:[`cylinder`,`tube`,`pillar`,`post`],plane:[`plane`,`quad`,`panel`,`card`],pointlight:[`point light`,`pointlight`,`light`,`lamp`,`bulb`],spotlight:[`spot light`,`spotlight`,`spot`],ieslight:[`ies light`,`ies`,`automotive light`,`headlamp`,`headlight`],arealight:[`area light`,`rect light`,`softbox`],tubelight:[`tube light`,`linear light`,`light bar`],camera:[`camera`,`cam`,`view camera`],cinecamera:[`cinematic camera`,`cinema camera`,`film camera`,`cine camera`],playercamera:[`player camera`,`game camera`,`follow camera`],vehiclecamera:[`vehicle camera`,`car camera`,`chase camera`,`cockpit camera`],particles:[`particles`,`particle system`,`sparks`,`fx`],probe:[`probe`,`reflection probe`],audio:[`audio`,`sound`,`speaker`,`emitter`],water:[`water`,`ocean`,`sea`],sky:[`sky`,`atmosphere`],sun:[`sun`],moon:[`moon`],stars:[`stars`,`star field`,`starfield`],clouds:[`clouds`,`cloud layer`],fog:[`fog`,`height fog`,`haze`],wind:[`wind`,`wind field`],post:[`post`,`post stack`,`grade`],folder:[`folder`,`group`]},Hp={red:`#ef5350`,crimson:`#d64f45`,orange:`#f59e0b`,amber:`#ffb14b`,yellow:`#f5d34b`,green:`#22c55e`,teal:`#1d7b8c`,cyan:`#4fb6d8`,blue:`#3b82f6`,indigo:`#6c77ff`,purple:`#8b5cf6`,violet:`#8b5cf6`,pink:`#ec4899`,white:`#f2f4f7`,black:`#0b0d10`,grey:`#9aa0a6`,gray:`#9aa0a6`,silver:`#c9ccd1`,gold:`#c9a24b`,chrome:`#f2f4f7`},Up={sunrise:6,dawn:5.4,morning:9,midday:12,noon:12,afternoon:15,"golden hour":17.66,sunset:18.4,dusk:18.9,"blue hour":19.16,evening:20,night:22,midnight:0},Wp=e=>{let t=Pp(e).replace(/s$/,``),n=null,r=0;for(let[e,i]of Object.entries(Vp))for(let a of i){let i=Pp(a).replace(/s$/,``);(t===i||t.endsWith(` `+i)||t.startsWith(i+` `))&&i.length>r&&(n=e,r=i.length)}return n};function Gp(e){let t=t=>{let n=e.match(RegExp(`\\b${t}\\s*[:=]?\\s*${Ip}`,`i`));return n?{v:parseFloat(n[1]),txt:n[0]}:null},n=t(`x`),r=t(`y`),i=t(`z`);if([n,r,i].filter(Boolean).length>=2){let t=e;return[n,r,i].forEach(e=>{e&&(t=t.replace(e.txt,` `))}),{v:[n?n.v:null,r?r.v:null,i?i.v:null],rest:t,partial:!0}}let a=e.match(RegExp(`${Ip}[ ,]+${Ip}[ ,]+${Ip}`));return a?{v:[+a[1],+a[2],+a[3]],rest:e.replace(a[0],` `),partial:!1}:null}function Kp(e){let t=e.match(RegExp(`\\b(?:by\\s+|to\\s+)?${Ip}\\s*(degrees?|degs?|deg|°|radians?|rads?|rad|metres?|meters?|m|units?|u|percent|%|times|x|×)?(?![a-z0-9])`,`i`));return t?{n:parseFloat(t[1]),unit:Pp(t[2]||``),rest:e.replace(t[0],` `),abs:/^\s*to\s/i.test(t[0])}:null}function qp(e){let t=e.match(/\b(?:on|about|around|along|in|over|the)?\s*\b([xyz])\b(?:\s*-?\s*axis)?/i);return t?{axis:t[1].toLowerCase(),rest:e.replace(t[0],` `)}:null}var Jp={x:0,y:1,z:2},Yp=(e,t)=>/^rad/.test(t)?e*180/Math.PI:e,Xp=/^(?:selection|selected|selected objects?|selected entit(?:y|ies)|current selection|this|these|them|it|that)$/i,Zp=/^(?:everything|all|all objects?|all entit(?:y|ies)|world|scene)$/i;function Qp(e){let{state:t,act:n}=e,r=()=>{let e=[...t.selection].map(Jl).filter(Boolean);if(e.length)return e;let n=Jl(t.cursorId);return n?[n]:[]};function i(e){let t=Rp(e);if(!t)return{nodes:[],miss:null};if(Xp.test(t))return{nodes:r(),miss:r().length?null:`nothing is selected`,word:`the selection`};if(Zp.test(t))return{nodes:Kl.filter(e=>!Yl(e)),word:`everything`};let n=t.match(/^(?:all|every|each)\s+(.+)$/i),i=n?n[1]:null;if(i){let e=au.find(e=>Pp(e)===Pp(i).replace(/s$/,``));if(e)return{nodes:Kl.filter(t=>!Yl(t)&&Xl(t).cat===e),word:`all ${e}`};let t=Wp(i);if(t)return{nodes:Kl.filter(e=>e.type===t),word:`all ${Vl[t].label.toLowerCase()}s`};if(/^light/.test(Pp(i)))return{nodes:Kl.filter(e=>[`pointlight`,`spotlight`,`ieslight`,`arealight`,`tubelight`].includes(e.type)),word:`all lights`}}let a=Kl.map(e=>({n:e,s:Bp(t,e)})).filter(e=>e.s>0).sort((e,t)=>t.s-e.s);return a.length?/s$/i.test(t.trim())&&a.length>1&&a[0].s===a[1].s?{nodes:a.filter(e=>e.s===a[0].s).map(e=>e.n)}:{nodes:[a[0].n],alts:a.slice(1,4).map(e=>e.n)}:{nodes:[],miss:t}}function a(e){let t=Rp(e);if(!t){let e=r();return{nodes:e,misses:[],word:e.length===1?e[0].name:`the selection`,implicit:!0}}let n=t.split(/\s*(?:,|\band\b|\+)\s*/i).map(Rp).filter(Boolean),a=[],o=[],s=null,c=[];return n.forEach(e=>{let t=i(e);t.miss&&o.push(t.miss),t.nodes.forEach(e=>{a.includes(e)||a.push(e)}),t.word&&(s=t.word),t.alts&&(c=c.concat(t.alts))}),{nodes:a,misses:o,word:s,alts:c}}let o=e=>e.length===1?e[0].name:`${e.length} entities`,s=(e,t)=>({ok:!1,error:e,hint:t}),c=e=>({ok:!0,sub:`command`,icon:`command`,...e});function l(e,t,r,{title:i,sub:a,icon:l}){let u=e.filter(e=>Array.isArray(e.props?.[t])),d=u.filter(e=>e.locked),f=u.filter(e=>!e.locked);return u.length?f.length?c({title:i,sub:a,icon:l,run(){return f.forEach(r),n.commit(f,t),`${i}${d.length?` · ${d.length} locked skipped`:``}`}}):s(`${o(d)} is locked`,`unlock it first`):s(`${o(e)} has no ${t===`pos`?`position`:t===`rot`?`rotation`:`scale`} to change`)}let u=[{id:`find`,keys:[`find`,`locate`,`select`,`where is`,`go to`,`show me`,`pick`],usage:`find <entity>`,help:`select it, reveal it in the tree and frame it`,build(e){let t=a(e);if(!t.nodes.length)return s(`Nothing here is called “${t.misses[0]||e}”`,`try part of the name, or a type like “sphere”`);let r=t.nodes[0],i=Xl(r);return c({title:`Find ${r.name}`,sub:`${i.label} · select, reveal and frame`,icon:i.icon,color:i.color,run(){return n.find(t.nodes),`Found <b>${r.name}</b>`}})}},{id:`rotate`,keys:[`rotate`,`turn`,`spin`,`yaw`,`pitch`,`roll`],usage:`rotate <entity> 40 degrees on z`,help:`degrees by default, radians if you say so`,build(e,t){let n=` `+e+` `,r=qp(n);r&&(n=r.rest);let i=Kp(n);if(i&&(n=i.rest),!i)return s(`How far should it turn?`,`rotate cube 40 degrees on z`);let c=r?r.axis:t===`pitch`?`x`:t===`roll`?`z`:`y`,u=Yp(i.n,i.unit),d=a(n);if(!d.nodes.length)return s(d.misses.length?`No entity called “${d.misses[0]}”`:`Nothing is selected`,`name it, or select it first`);let f=Jp[c],p=i.abs;return l(d.nodes,`rot`,e=>{e.props.rot[f]=+((p?0:e.props.rot[f])+u).toFixed(2)},{title:`${p?`Set`:`Rotate`} ${o(d.nodes)} ${p?`to`:`by`} ${+u.toFixed(2)}° on ${c.toUpperCase()}`,sub:/^rad/.test(i.unit)?`${i.n} rad`:`transform`,icon:`motion`})}},{id:`move`,keys:[`move`,`translate`,`shift`,`nudge`,`push`,`place`,`put`],usage:`move <entity> 2 m on x`,help:`or “move cube to x 4 y 1 z 0”`,build(e){let t=` `+e+` `,n=/\bto\b/i.test(t),r=Gp(t);if(r){t=r.rest;let e=a(t.replace(/\bto\b/gi,` `));if(!e.nodes.length)return s(e.misses.length?`No entity called “${e.misses[0]}”`:`Nothing is selected`);let n=r.v.map((e,t)=>e??null);return l(e.nodes,`pos`,e=>{n.forEach((t,n)=>{t!=null&&(e.props.pos[n]=t)})},{title:`Move ${o(e.nodes)} to ${n.map((e,t)=>e==null?null:`${`XYZ`[t]} ${e}`).filter(Boolean).join(`, `)}`,sub:`absolute position`,icon:`motion`})}let i=qp(t);i&&(t=i.rest);let c=Kp(t);if(c&&(t=c.rest),!c)return s(`How far, and on which axis?`,`move cube 2 m on x`);let u=i?i.axis:`x`,d=Jp[u],f=a(t);return f.nodes.length?l(f.nodes,`pos`,e=>{e.props.pos[d]=+((n&&c.abs?0:e.props.pos[d])+c.n).toFixed(3)},{title:`Move ${o(f.nodes)} ${c.abs?`to`:`by`} ${c.n} m on ${u.toUpperCase()}`,sub:/^(deg|°|rad)/.test(c.unit)?`metres — degrees do not move things`:`transform`,icon:`motion`}):s(f.misses.length?`No entity called “${f.misses[0]}”`:`Nothing is selected`)}},{id:`scale`,keys:[`scale`,`resize`,`grow`,`shrink`],usage:`scale <entity> 2x`,help:`uniform, or add “on y” for one axis`,build(e,t){let n=` `+e+` `,r=qp(n);r&&(n=r.rest);let i=Kp(n);if(i&&(n=i.rest),!i)return s(`By how much?`,`scale sphere 2x`);let c=i.n;/^percent|%$/.test(i.unit)&&(c=i.n/100),t===`shrink`&&c>1&&(c=1/c);let u=a(n);if(!u.nodes.length)return s(u.misses.length?`No entity called “${u.misses[0]}”`:`Nothing is selected`);let d=r?Jp[r.axis]:null;return l(u.nodes,`scale`,e=>{d==null?e.props.scale=e.props.scale.map(e=>+(e*c).toFixed(3)):e.props.scale[d]=+(e.props.scale[d]*c).toFixed(3)},{title:`Scale ${o(u.nodes)} ×${+c.toFixed(3)}${d==null?``:` on ${`XYZ`[d]}`}`,sub:`transform`,icon:`motion`})}},{id:`add`,keys:[`add`,`create`,`spawn`,`new`,`insert`,`drop`],usage:`add sphere at x 3 y 2 z -1`,help:`any entity type, anywhere`,build(e){let t=` `+e+` `,r=null,i=t.match(/\b(?:named|called)\s+"?([^",]+?)"?(?=\s+(?:at|on|in|near|with|by)\b|[,"]|$)/i);i&&(r=Fp(i[1]),t=t.replace(i[0],` `));let a=Gp(t);a&&(t=a.rest),t=t.replace(/\bat\b/gi,` `);let o=Wp(t);if(!o)return s(`I do not know an entity called “${Rp(t)||`…`}”`,`try cube, sphere, light, camera, particles…`);let l=Vl[o],u=a?a.v.map(e=>e??0):null;return c({title:`Add ${r||l.label}${u?` at ${u.join(`, `)}`:``}`,sub:`new ${l.label.toLowerCase()}`,icon:l.icon,color:l.color,run(){return`Added <b>${n.add(o,{pos:u,name:r}).name}</b>`}})}},{id:`physics`,keys:[`enable physics`,`disable physics`,`turn on physics`,`turn off physics`,`add physics`,`remove physics`,`physics`],usage:`enable physics on <entity>`,help:`bodies fall and settle while the world runs`,build(e,t){let r=!/disable|off|remove/.test(t),i=a(` `+e.replace(/^\s*(?:on|for|to)\b/i,` `)+` `),l=i.nodes.filter(e=>Array.isArray(e.props?.pos)&&!Yl(e));return l.length?c({title:`${r?`Enable`:`Disable`} physics on ${o(l)}`,sub:r?`gravity, bounce and rest`:`back to static`,icon:r?`motion`:`reset`,run(){return n.physics(l,r),`Physics ${r?`on`:`off`} for <b>${o(l)}</b>`}}):s(i.misses.length?`No entity called “${i.misses[0]}”`:`Nothing is selected`,`enable physics on cube, sphere`)}},{id:`unisolate`,keys:[`exit isolation`,`unisolate`,`leave isolation`,`clear isolation`,`show everything`],usage:`exit isolation`,help:`bring the rest of the world back`,build(){return c({title:`Exit isolation`,sub:`view`,icon:`solo`,run(){return n.exitIsolation(),`Isolation cleared`}})}},{id:`isolate`,keys:[`isolate`,`solo`,`only show`],usage:`isolate selection`,help:`hide everything else`,build(e){let t=a(e);return t.nodes.length?c({title:`Isolate ${o(t.nodes)}`,sub:`hides everything else`,icon:`solo`,run(){return n.isolate(t.nodes),`Isolated <b>${o(t.nodes)}</b>`}}):s(`Nothing to isolate`,`isolate selection · isolate chrome sphere`)}},{id:`purge`,keys:[`delete from ram`,`remove from ram`,`delete from memory`,`purge`,`wipe`,`free`,`destroy`,`nuke`],usage:`delete from ram <entity>`,help:`deletes it and disposes its GPU + RAM buffers for good`,build(e){let t=a(e.replace(/^\s*(?:from|the)\b/i,` `));return t.nodes.length?c({title:`Purge ${o(t.nodes)}`,sub:`delete and free geometry, materials and textures`,icon:`trash`,danger:!0,run(){return n.purge(t.nodes)}}):s(t.misses.length?`No entity called “${t.misses[0]}”`:`Nothing is selected`)}},{id:`delete`,keys:[`delete`,`remove`,`erase`,`kill`],usage:`delete <entity>`,help:`removes it from the scene`,build(e){let t=a(e);return t.nodes.length?c({title:`Delete ${o(t.nodes)}`,sub:`remove from the scene`,icon:`trash`,danger:!0,run(){return n.remove(t.nodes),`Deleted <b>${o(t.nodes)}</b>`}}):s(t.misses.length?`No entity called “${t.misses[0]}”`:`Nothing is selected`)}},{id:`hide`,keys:[`hide`,`unhide`,`show`],usage:`hide <entity>`,help:`visibility, same as the eye in the outliner`,build(e,t){let r=t!==`hide`,i=a(e);return i.nodes.length?c({title:`${r?`Show`:`Hide`} ${o(i.nodes)}`,sub:`visibility`,icon:r?`eye`:`eyeoff`,run(){return n.visible(i.nodes,r),`${r?`Showing`:`Hidden`}: <b>${o(i.nodes)}</b>`}}):s(i.misses.length?`No entity called “${i.misses[0]}”`:`Nothing is selected`)}},{id:`lock`,keys:[`lock`,`unlock`],usage:`lock <entity>`,help:`stop it being edited or dragged`,build(e,t){let r=t===`lock`,i=a(e);return i.nodes.length?c({title:`${r?`Lock`:`Unlock`} ${o(i.nodes)}`,sub:`protection`,icon:r?`lock`:`unlock`,run(){return n.lock(i.nodes,r),`${r?`Locked`:`Unlocked`} <b>${o(i.nodes)}</b>`}}):s(i.misses.length?`No entity called “${i.misses[0]}”`:`Nothing is selected`)}},{id:`rename`,keys:[`rename`,`call`],usage:`rename <entity> to <name>`,help:``,build(e){let t=e.match(/^(.*?)\s+(?:to|as)\s+"?([^"]+)"?$/i);if(!t)return s(`Rename what, to what?`,`rename cube to Anchor Block`);let r=a(t[1]);if(!r.nodes.length)return s(`No entity called “${Rp(t[1])}”`);let i=r.nodes[0],o=Fp(t[2]);return c({title:`Rename ${i.name} → ${o}`,sub:`identity`,icon:`settings`,run(){return n.rename(i,o),`Renamed to <b>${o}</b>`}})}},{id:`duplicate`,keys:[`duplicate`,`copy`,`clone`],usage:`duplicate <entity>`,help:``,build(e){let t=a(e);return t.nodes.length?c({title:`Duplicate ${o(t.nodes)}`,sub:`copy alongside the original`,icon:`copy`,run(){return n.duplicate(t.nodes),`Duplicated <b>${o(t.nodes)}</b>`}}):s(t.misses.length?`No entity called “${t.misses[0]}”`:`Nothing is selected`)}},{id:`frame`,keys:[`frame`,`focus`,`look at`,`zoom to`],usage:`frame <entity|everything>`,help:``,build(e){let t=Rp(e);if(!t||Zp.test(t))return c({title:`Frame everything`,sub:`camera`,icon:`focus`,run(){return n.frameAll(),`Framed the whole scene`}});let r=a(t);return r.nodes.length?c({title:`Frame ${r.nodes[0].name}`,sub:`camera`,icon:`focus`,run(){return n.focus(r.nodes[0]),`Framing <b>${r.nodes[0].name}</b>`}}):s(`No entity called “${t}”`)}},{id:`view`,keys:[`view`,`look from`,`camera`],usage:`view top`,help:`front · back · left · right · top · bottom`,build(e){let t=Pp(e),r=[`front`,`back`,`left`,`right`,`top`,`bottom`].find(e=>t.includes(e));return r?c({title:`View from the ${r}`,sub:`camera`,icon:`camera`,run(){return n.snapView(r),`Looking from the ${r}`}}):s(`Which view?`,`view top · view front · view left`)}},{id:`time`,keys:[`set time`,`time`,`set the time`,`make it`],usage:`set time to golden hour`,help:`a clock time, or sunrise / noon / dusk / midnight`,build(e){let t=` `+e.replace(/^\s*to\b/i,` `)+` `,r=t.match(/\b(\d{1,2})[:h](\d{2})\b/),i=t.match(/\b(\d{1,2})(?:\.(\d))?\s*(am|pm)\b/i),a=Object.keys(Up).find(e=>Pp(t).includes(e)),o=null,l=``;if(r)o=+r[1]+r[2]/60,l=`${r[1]}:${r[2]}`;else if(i)o=i[1]%12+(/pm/i.test(i[3])?12:0),l=`${i[1]}${i[3].toLowerCase()}`;else if(a)o=Up[a],l=a;else{let e=t.match(RegExp(`\\b${Ip}\\s*(?:h|hours?)?\\s*$`));e&&(o=+e[1],l=`${o} h`)}if(o==null)return s(`What time?`,`set time to 17:40 · set time to golden hour`);let u=(o%24+24)%24;return c({title:`Set time to ${l}`,sub:`${String(Math.floor(u)).padStart(2,`0`)}:${String(Math.round(u%1*60)).padStart(2,`0`)}`,icon:`sun`,run(){return n.setTime(u),`Time is now ${l}`}})}},{id:`daycycle`,keys:[`start day cycle`,`stop day cycle`,`run day cycle`,`toggle day cycle`,`day cycle`],usage:`start day cycle`,help:``,build(e,t){let r=!/stop/.test(t);return c({title:`${r?`Start`:`Stop`} the day cycle`,sub:`time`,icon:`sun`,run(){return n.dayCycle(r),`Day cycle ${r?`running`:`stopped`}`}})}},{id:`play`,keys:[`play`,`run`],usage:`play`,help:`run the world through a camera`,build(){return c({title:`Play`,sub:`run through a scene camera`,icon:`play`,run(){return n.transport(`play`),`Playing`}})}},{id:`simulate`,keys:[`simulate`],usage:`simulate`,help:`run the world, keep the editor camera`,build(){return c({title:`Simulate`,sub:`run with the editor camera`,icon:`sim`,run(){return n.transport(`simulate`),`Simulating`}})}},{id:`stop`,keys:[`stop`,`end`],usage:`stop`,help:`restore the editor state`,build(){return c({title:`Stop`,sub:`restore the world`,icon:`stop`,run(){return n.transport(`edit`),`Stopped`}})}},{id:`pause`,keys:[`pause`,`resume`,`freeze`],usage:`pause`,help:``,build(e,t){let r=t!==`resume`;return c({title:r?`Pause`:`Resume`,sub:`transport`,icon:`pause`,run(){return n.pause(r),r?`Paused`:`Resumed`}})}},{id:`step`,keys:[`step`,`advance`],usage:`step`,help:`one frame`,build(){return c({title:`Step one frame`,sub:`transport`,icon:`step`,run(){return n.step(),`Stepped one frame`}})}},{id:`settings`,keys:[`settings`,`open settings`,`edit`,`tune`,`inspect`],usage:`settings <entity>`,help:`open the floating settings popup`,build(e){let t=a(e);return t.nodes.length?c({title:`Open settings for ${o(t.nodes)}`,sub:`popup`,icon:`settings`,run(){return n.openSettings(t.nodes),`Settings for <b>${o(t.nodes)}</b>`}}):s(t.misses.length?`No entity called “${t.misses[0]}”`:`Nothing is selected`)}},{id:`closepops`,keys:[`close popups`,`close all popups`,`clear popups`],usage:`close popups`,help:``,build(){return c({title:`Close all popups`,sub:`view`,icon:`close`,run(){return n.closePopups(),`Popups closed`}})}},{id:`markers`,keys:[`markers`,`labels`],usage:`labels always`,help:`hover · always · icons only`,build(e){let t=Pp(e),r=/always|on$|show/.test(t)?`always`:/hover/.test(t)?`hover`:/icon|off|none|hide/.test(t)?`none`:null;return r?c({title:`Markers: ${r===`none`?`icons only`:`names ${r}`}`,sub:`billboards`,icon:`tag`,run(){return n.labels(r),`Marker mode changed`}}):s(`Which marker mode?`,`labels always · labels on hover · labels icons only`)}},{id:`autopop`,keys:[`auto popup`,`auto popups`,`popup on select`,`toggle auto popup`],usage:`auto popups off`,help:`open a settings popup whenever you select something`,build(e){let t=!/\b(off|no|disable|stop)\b/i.test(e);return c({title:`Settings popup on select: ${t?`on`:`off`}`,sub:`behaviour`,icon:`settings`,run(){return n.autoPopup(t),`Auto popups ${t?`on`:`off`}`}})}},{id:`set`,keys:[`set`,`make`],usage:`set roughness of <entity> to 0.2`,help:`any property on any entity`,build(e){let t=e.match(/^(.*?)\s+(?:of|on|for)\s+(.*?)\s+(?:to|=)\s+(.+)$/i),r,i,l;if(t)[,r,i,l]=t;else{if(t=e.match(/^(.*?)\s+(?:to|=)\s+(.+)$/i),!t)return s(`Set what, to what?`,`set roughness of chrome sphere to 0.2`);l=t[2];let n=Rp(t[1]).split(` `);for(let e=Math.min(2,n.length);e>=1;e--){let t=n.slice(-e).join(` `),o=n.slice(0,-e).join(` `),s=a(o);if(s.nodes.length&&d(s.nodes[0],t)){r=t,i=o;break}}if(!r)return s(`I could not find that property`,`set roughness of chrome sphere to 0.2`)}let u=a(i);if(!u.nodes.length)return s(u.misses.length?`No entity called “${u.misses[0]}”`:`Nothing is selected`);let p=u.nodes.map(e=>({n:e,def:d(e,r)})).filter(e=>e.def);if(!p.length)return s(`${o(u.nodes)} has no “${Rp(r)}”`,`try: colour, roughness, intensity, metallic…`);let{def:m}=p[0],h=f(m,l);return h==null?s(`“${Rp(l)}” is not a valid ${m.label.toLowerCase()}`):c({title:`Set ${m.label.toLowerCase()} of ${o(p.map(e=>e.n))} to ${Array.isArray(h)?h.join(`, `):h}`,sub:`property`,icon:`settings`,run(){return p.forEach(e=>n.setProp(e.n,e.def.k,h)),`${m.label} set to <b>${Array.isArray(h)?h.join(`, `):h}</b>`}})}},{id:`help`,keys:[`help`,`commands`,`what can i say`,`?`],usage:`help`,help:``,build(){return c({title:`Show what you can type`,sub:`help`,icon:`command`,run(){return n.help(),`Type any of these`}})}}];function d(e,t){let n=Pp(t);if(!n)return null;let r=(Xl(e).groups||[]).flatMap(e=>e.props).filter(e=>e.kind!==`readout`),i={colour:`color`,color:`color`,metallic:`metalness`,shininess:`roughness`,brightness:`intensity`,size:`scale`}[n]||n;return r.find(e=>Pp(e.k)===i||Pp(e.label)===i)||r.find(e=>Pp(e.label).includes(i)||Pp(e.k).includes(i))||(i===`position`?r.find(e=>e.k===`pos`):null)||(i===`rotation`?r.find(e=>e.k===`rot`):null)}function f(e,t){let n=Rp(t);switch(e.kind){case`slider`:{let t=n.match(new RegExp(Ip));if(!t)return null;let r=parseFloat(t[1]);return/%/.test(n)&&e.max<=1&&(r/=100),Math.min(e.max??1/0,Math.max(e.min??-1/0,r))}case`switch`:return/^(on|yes|true|1|enabled?)$/i.test(n)?!0:!/^(off|no|false|0|disabled?)$/i.test(n)&&null;case`color`:{let e=n.match(/#?([0-9a-f]{6})\b/i);if(e)return`#`+e[1].toLowerCase();let t=Object.keys(Hp).find(e=>Pp(n).includes(e));return t?Hp[t]:null}case`vec3`:{let e=Gp(` `+n+` `);return e?e.v.map(e=>e??0):null}case`select`:return e.options.find(e=>Pp(e)===Pp(n))||e.options.find(e=>Pp(e).includes(Pp(n)))||null;default:return n}}let p=u.flatMap(e=>e.keys.map(t=>({k:t,v:e}))).sort((e,t)=>t.k.length-e.k.length);function m(e){let t=Fp(String(e||``));if(!t)return null;let r=` `+t.toLowerCase()+` `;for(let{k:e,v:n}of p)if(r.startsWith(` `+e+` `)||r.trim()===e){let r=t.slice(e.length).trim();try{return{...n.build(r,e,t),verb:n.id,input:t}}catch{return{ok:!1,error:`I could not work that out`,hint:n.usage,input:t}}}let i=a(t);if(i.nodes.length){let e=i.nodes[0],r=Xl(e);return{ok:!0,verb:`find`,input:t,title:`Find ${e.name}`,sub:`${r.label} · select and frame`,icon:r.icon,color:r.color,run(){return n.find([e]),`Found <b>${e.name}</b>`}}}return{ok:!1,input:t,error:`I do not understand “${t}”`,hint:`try “help”, or start with find · move · rotate · add · set`}}let h=[`find chrome sphere`,`rotate anchor cube 40 degrees on z`,`move glass slab 2 m on x`,`add sphere at x 3 y 2 z -1`,`enable physics on selected objects`,`isolate selection`,`set roughness of chrome sphere to 0.2`,`set time to golden hour`,`delete from ram marker post`];function g(e,t=[]){let n=Fp(e||``),r=n.toLowerCase(),i=[];if(!n)return i.push(...h.map(e=>({title:e,sub:`try this`,icon:`command`,insert:e}))),i.slice(0,9);let a=m(n),o=u.some(e=>e.keys.some(e=>e.startsWith(r)&&e!==r));a&&a.ok?i.push({...a,primary:!0,sub:a.sub||`run`}):a&&!o&&i.push({...a,title:a.error,primary:!0,sub:a.hint||`not understood`,icon:`close`,bad:!0}),u.forEach(e=>{e.keys.find(e=>e.startsWith(r)||r.length>2&&e.includes(r.split(` `)[0]))&&(a&&a.ok&&a.verb===e.id&&e.usage.split(` `).length<=n.split(` `).length||i.push({title:e.usage,sub:e.help||`command`,icon:`command`,insert:e.usage.replace(/<.*>.*/,``).trim()+` `}))}),Kl.map(e=>({n:e,s:Bp(n,e)})).filter(e=>e.s>=30).sort((e,t)=>t.s-e.s).slice(0,5).forEach(({n:e})=>{let t=Xl(e);i.push({title:e.name,sub:`${t.label} · find and frame`,icon:t.icon,color:t.color,insert:`find ${e.name}`})}),t.filter(e=>e.label.toLowerCase().includes(r)).slice(0,5).forEach(e=>i.push({title:e.label,sub:e.sub,icon:`command`,run:e.run}));let s=new Set;return i.filter(e=>{let t=e.title+(e.insert||``);return!s.has(t)&&(s.add(t),!0)}).slice(0,9)}function _(e,t){let n=e||``;if(!n.trim())return``;let r=t.map(e=>e.insert||(e.primary,``)).filter(Boolean).find(e=>e.toLowerCase().startsWith(n.toLowerCase())&&e.length>n.length);return r?r.slice(n.length):``}return{parse:m,suggest:g,completion:_,EXAMPLES:h,VERBS:u,resolve:a,findProp:d}}var $={selection:new Set,cursorId:null,mode:`split`,docks:{left:!0,right:!0},cats:new Set(au),labelMode:`hover`,view:`persp`,tod:7.4,dayCycle:!1,transport:`edit`,paused:!1,realtime:!0,playCamId:null,snapshot:null,autoPopup:!0,gravity:9.81},$p=e=>document.querySelector(e),em=$p(`#stage`),tm=$p(`#vpView`),nm=rd($p(`#gl`),{onPick:(e,t)=>{if(e==null){!t.shiftKey&&!t.ctrlKey&&!t.metaKey&&om.select(null);return}om.select(e,{additive:t.ctrlKey||t.metaKey})}});nm.setHudElements($p(`#vign`),$p(`#grain`));var rm=gd($p(`#billboards`),nm,{onSelect:(e,t)=>om.select(e.id,{additive:t.ctrlKey||t.metaKey}),onOpen:e=>im.openFor(e),onContext:(e,t)=>{om.select(e.id),om.contextMenu(e,t)}}),im=Np($p(`#popups`),{select:(...e)=>om.select(...e),focus:e=>om.focus(e),soloNode:e=>om.soloNode(e),toggleIsolateNode:e=>om.toggleIsolateNode(e),showInspector:()=>om.showInspector(),refreshChrome:()=>om.refreshChrome()},()=>{let e=tm.getBoundingClientRect();return{left:e.left,top:e.top,right:e.right,bottom:e.bottom}});function am(e,{silent:t=!1}={}){$.tod=(e+24)%24;let n=Kl.find(e=>e.type===`sun`),r=Kl.find(e=>e.type===`moon`),i=($.tod-6)/12*Math.PI;n.props.elevation=62*Math.sin(i),n.props.azimuth=(90+($.tod-6)*15+360)%360;let a=($.tod-18)/12*Math.PI;r.props.elevation=58*Math.sin(a),r.props.azimuth=(90+($.tod-18)*15+360)%360,r.props.phase=(r.props.phase+0)%1,nm.applyNode(n),vd.emit(`propchange`,{node:n,key:`elevation`,src:`tod`}),vd.emit(`propchange`,{node:r,key:`elevation`,src:`tod`});let o=Math.floor($.tod),s=Math.floor($.tod%1*60);$p(`#todClock`).textContent=`${String(o).padStart(2,`0`)}:${String(s).padStart(2,`0`)}`,t||eh._set($.tod)}var om={selection:$.selection,get cursorId(){return $.cursorId},select(e,{additive:t=!1,range:n=!1,silent:r=!1}={}){if(e==null)$.selection.clear(),$.cursorId=null;else if(t)$.selection.has(e)?$.selection.delete(e):$.selection.add(e),$.cursorId=e;else if(n&&$.cursorId!=null){let t=Kl.map(e=>e.id),n=t.indexOf($.cursorId),r=t.indexOf(e);t.slice(Math.min(n,r),Math.max(n,r)+1).forEach(e=>$.selection.add(e)),$.cursorId=e}else $.selection.clear(),$.selection.add(e),$.cursorId=e;fm(),!r&&e!=null&&lm.render()},focus(e){e&&(nm.focusOn(e),om.toast(`Framing <b>${e.name}</b>`))},isolate(e){let t=new Set([...e].filter(e=>Jl(e))),n=eu();$l(t.size===n.size&&[...t].every(e=>n.has(e))?[]:t),om.applyIsolation();let r=eu().size;om.toast(r?`Isolated <b>${r}</b> ${r===1?`entity`:`entities`}`:`Isolation cleared`)},toggleIsolateSelection(){if(!$.selection.size){tu()&&om.isolate([]);return}om.isolate([...$.selection])},toggleIsolateNode(e){let t=new Set(eu());t.has(e.id)?t.delete(e.id):t.add(e.id),$l(t),om.applyIsolation()},exitIsolation(){$l([]),om.applyIsolation(),om.toast(`Isolation cleared`)},applyIsolation(){Kl.forEach(e=>e.solo=nu(e)),nm.applyAll(),lm.render(),Zh(),Zm()},soloNode(e){om.isolate([e.id])},contextMenu(e,t){uh(e,t)},toast:dh,refreshChrome(){dm(),lm.render(),rm.rebuild(mm()),Zh()},showInspector(){sh(`right`,!0)},addEntity(e,t){let n=Vl[e],r=(t&&Yl(t)?t:null)??Gl.find(e=>e.name===sm(n.cat))??Gl[2],i=Ul(cm(n.label),e,[]);if(i.props.pos){let e=nm.camera.position.clone().add(nm.controls.target.clone().sub(nm.camera.position).setLength(Math.min(nm.camera.position.distanceTo(nm.controls.target),9)));i.props.pos=[+e.x.toFixed(2),Math.max(+e.y.toFixed(2),.6),+e.z.toFixed(2)]}return r.kids.push(i),r.open=!0,ql(),nm.applyNode(i),om.select(i.id),lm.revealNode(i),rm.rebuild(mm()),om.toast(`Added <b>${i.name}</b>`),i},duplicate(e){if(!e||Yl(e))return;let t=Ul(cm(e.name.replace(/ \d+$/,``)),e.type,[],{props:JSON.parse(JSON.stringify(e.props)),dynamic:e.dynamic,notes:e.notes});t.props.pos&&(t.props.pos=t.props.pos.map((e,t)=>t===0?e+1.6:e));let n=e.parent?e.parent.kids:Gl;n.splice(n.indexOf(e)+1,0,t),ql(),nm.applyNode(t),om.select(t.id),rm.rebuild(mm()),om.toast(`Duplicated <b>${e.name}</b>`)},remove(e){if(!e)return;if([`sky`,`sun`,`water`,`post`].includes(e.type)){om.toast(`That entity is required by the world`);return}let t=e=>{e.kids.slice().forEach(t),nm.remove(e)};t(e);let n=e.parent?e.parent.kids:Gl;n.splice(n.indexOf(e),1),ql(),$.selection.delete(e.id),im.has(e.id)&&im.close(e.id),rm.rebuild(mm()),lm.render(),dm(),om.toast(`Deleted <b>${e.name}</b>`)},purge(e){if(!e)return null;if([`sky`,`sun`,`water`,`post`].includes(e.type))return om.toast(`That entity is required by the world`),null;let t={geometries:0,materials:0,textures:0,triangles:0,nodes:0},n=e=>{e.kids.slice().forEach(n);let r=nm.purge(e)||{};t.geometries+=r.geometries||0,t.materials+=r.materials||0,t.textures+=r.textures||0,t.triangles+=r.triangles||0,t.nodes++,$.selection.delete(e.id),im.has(e.id)&&im.close(e.id),$.snapshot&&($.snapshot.nodes=$.snapshot.nodes.filter(t=>t.id!==e.id),$.snapshot.ids=$.snapshot.ids.filter(t=>t!==e.id))};n(e);let r=e.parent?e.parent.kids:Gl,i=r.indexOf(e);return i>=0&&r.splice(i,1),ql(),$.cursorId===e.id&&($.cursorId=null),rm.rebuild(mm()),lm.render(),dm(),Zh(),t},addable:()=>nh.map(e=>({key:e,...Vl[e]})),setPhysics(e,t){e.forEach(e=>{e.physics=t,e.vel=0}),lm.render(),dm(),Zh()}};function sm(e){return{Environment:`Environment`,Water:`Water`,Geometry:`Objects`,Lighting:`Lighting`,Cameras:`Cameras`,Effects:`Effects`}[e]||`Objects`}function cm(e){let t=new Set(Kl.map(e=>e.name));if(!t.has(e))return e;let n=2;for(;t.has(`${e} ${n}`);)n++;return`${e} ${n}`}var lm=yd($p(`#outliner`),om),um=null;function dm(){let e=$p(`#insBody`),t=Jl($.cursorId);um?._dispose&&um._dispose(),e.innerHTML=``;let n=t?Xl(t):null;if($p(`#insIcon`).innerHTML=X(n?n.icon:`settings`,{size:15,color:n?n.color:void 0}),$p(`#insTitle`).textContent=t?t.name:`Inspector`,$p(`#insSub`).textContent=t?$.selection.size>1?`${$.selection.size} selected · editing ${n.label}`:`${n.label} · #${String(t.id).padStart(3,`0`)}`:`Nothing selected`,$p(`#insFoot`).textContent=t?`${n.cat} · ${t.dynamic?`dynamic`:`static`}${t.locked?` · locked`:``}`:`—`,!t){e.innerHTML=`<div class="empty"><div><div class="big">No entity selected</div>
      Pick a billboard in the viewport, or a row in the outliner.<br>Press <span class="kbd">⌘K</span> to search the world.</div></div>`,um=null;return}um=Mp(t,{onDirty:()=>{lm.render(),dm()}}),e.appendChild(um),hd(e)}function fm(){nm.setSelection([...$.selection]),rm.setSelection([...$.selection]),dm();let e=Jl($.cursorId);$.autoPopup&&$.transport!==`play`&&(e&&!Yl(e)?(im.closeAuto(e.id),im.openFor(e,{auto:!0})):im.closeAuto()),Zh()}var pm=e=>String(e).replace(/[&<>]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`})[e]),mm=()=>Kl.filter(e=>!Yl(e)&&!Xl(e).noBillboard);rm.setCategories($.cats),rm.rebuild(mm());var hm=$p(`#vpMenus`),gm=X(`check`,{size:12,width:3});function _m(e,t){let n=Z(`div`,`vm`),r=Z(`button`,`vmbtn`,``),i=Z(`div`,`vmpop`);n.append(r,i),hm.appendChild(n);let a={wrap:n,btn:r,pop:i,setLabel(e){r.innerHTML=`${e}<span class="caret">${X(`chevdown`,{size:12})}</span>`},close(){n.classList.remove(`open`)},paint(){i.innerHTML=``,t(a,i)}};return a.row=(e,t,n,{keep:r=!1}={})=>{let o=Z(`div`,`vmrow${t?` on`:``}`,`<span class="tick">${gm}</span>${e}`);return o.onclick=e=>{e.stopPropagation(),n(),a.paint(),r||a.close()},i.appendChild(o),o},a.head=e=>i.appendChild(Z(`div`,`vmhead`,e)),a.sep=()=>i.appendChild(Z(`div`,`vmsep`)),r.onclick=e=>{e.stopPropagation();let t=n.classList.contains(`open`);document.querySelectorAll(`.vm.open`).forEach(e=>e.classList.remove(`open`)),t||(a.paint(),n.classList.add(`open`))},a.paint(),a.setLabel(e),a}addEventListener(`pointerdown`,e=>{e.target.closest(`.vm`)||document.querySelectorAll(`.vm.open`).forEach(e=>e.classList.remove(`open`))});function vm(e){let t=Object.values(Vl).find(t=>t.cat===e);return t?t.color:`#888`}var ym=e=>Kl.filter(t=>!Yl(t)&&Xl(t).cat===e).length,bm=_m(``,(e,t)=>{e.head(`Show in viewport`),au.forEach(t=>e.row(`<span class="swat" style="background:${vm(t)}"></span>${t}<span class="n">${ym(t)}</span>`,$.cats.has(t),()=>{$.cats.has(t)?$.cats.delete(t):$.cats.add(t),rm.setCategories($.cats),xm()},{keep:!0})),e.sep(),e.row(`All categories`,$.cats.size===au.length,()=>{$.cats=new Set(au),rm.setCategories($.cats),xm()},{keep:!0}),e.row(`None`,$.cats.size===0,()=>{$.cats=new Set,rm.setCategories($.cats),xm()},{keep:!0})});function xm(){let e=$.cats.size,t=au.length;bm.setLabel(`${X(`layers`,{size:13})}Show <span class="val">${e===t?`All`:e===0?`None`:`${e}/${t}`}</span>`)}xm();var Sm=[[`hover`,`Names on hover`],[`always`,`Names always`],[`none`,`Icons only`]],Cm=_m(``,e=>{e.head(`Markers`),Sm.forEach(([t,n])=>e.row(n,$.labelMode===t,()=>Ph(t))),e.sep(),e.head(`On select`),e.row(`Open the settings popup`,$.autoPopup,()=>vh.autoPopup(!$.autoPopup),{keep:!0}),e.sep(),e.row(`Close all open popups`,!1,()=>{im.closeAll(),dh(`Popups closed`)})});function wm(){let e=Sm.find(([e])=>e===$.labelMode);Cm.setLabel(`${X(`tag`,{size:13})}Markers <span class="val">${e?e[1].replace(`Names `,``).replace(`Icons only`,`Icons`):``}</span>`)}wm();var Tm=[[`front`,`Front`,`Z`],[`back`,`Back`,``],[`right`,`Right`,`X`],[`left`,`Left`,``],[`top`,`Top`,`Y`],[`bottom`,`Bottom`,``]],Em=_m(``,e=>{e.head(`Standard views`),Tm.forEach(([t,n])=>e.row(n,$.view===t,()=>Bh(t))),e.sep(),e.row(`Frame everything<span class="sc">⇧F</span>`,!1,()=>{nm.frameAll(),$.view=`persp`,Dm()}),e.row(`Frame selection<span class="sc">F</span>`,!1,()=>om.focus(Jl($.cursorId)))});function Dm(){let e=Tm.find(([e])=>e===$.view);Em.setLabel(`${X(`camera`,{size:13})}View <span class="val">${e?e[1]:`Perspective`}</span>`)}Dm();var Om=$p(`#transport`),km=(e,t,n)=>{let r=Z(`button`,`tbtn ${e}`,X(t,{size:13}));return r.title=n,Om.appendChild(r),r},Am=km(`play`,`play`,`Play — run the world through a scene camera  (Alt P)`),jm=km(`sim`,`sim`,`Simulate — run the world, keep the editor camera  (Alt S)`),Mm=km(`pause`,`pause`,`Pause / resume  (P)`),Nm=km(`step`,`step`,`Advance one frame  (.)`),Pm=km(`stop`,`stop`,`Stop — restore the editor state  (Esc)`);Om.appendChild(Z(`div`,`sep`));var Fm=Z(`button`,`tbtn rt on`,`<span class="led"></span>Realtime`);Fm.title=`Realtime viewport — animate and redraw continuously  (Ctrl R)`,Om.appendChild(Fm);var Im=Z(`div`,`statechip edit`,`Edit`);Om.appendChild(Im);var Lm=$p(`#gateMask`),Rm=Z(`div`,`bar l`),zm=Z(`div`,`bar r`);Lm.append(Rm,zm);var Bm={"16:9":16/9,"2.39:1":2.39,"4:3":4/3,"1:1":1};function Vm(e){if(!e){Lm.classList.remove(`on`);return}let t=tm.getBoundingClientRect(),n=Bm[e.props.gate]||16/9,r=t.width/t.height,i=r>n?0:(t.height-t.width/n)/2,a=r>n?(t.width-t.height*n)/2:0;Lm.classList.add(`on`),Lm.querySelector(`.bar.t`).style.height=i+`px`,Lm.querySelector(`.bar.b`).style.height=i+`px`,Rm.style.width=a+`px`,zm.style.width=a+`px`;let o=$p(`#gateTag`);o.textContent=`${e.name} · ${e.props.gate} · ${Math.round(e.props.fov)}° · f/${e.props.aperture}`,o.style.top=i+10+`px`,o.style.left=a+14+`px`}var Hm=[`camera`,`cinecamera`,`playercamera`,`vehiclecamera`],Um=()=>{let e=Jl($.cursorId);return e&&Hm.includes(e.type)?e:Kl.find(e=>e.type===`playercamera`)||Kl.find(e=>Hm.includes(e.type))||null};function Wm(){$.snapshot={tod:$.tod,iso:[...eu()],ids:Kl.map(e=>e.id),nodes:Kl.map(e=>({id:e.id,name:e.name,vis:e.vis,locked:e.locked,dynamic:e.dynamic,physics:!!e.physics,props:JSON.parse(JSON.stringify(e.props))}))}}function Gm(){let e=$.snapshot;if(!e)return;let t=new Set(e.ids);Kl.filter(e=>!t.has(e.id)).forEach(e=>{nm.remove(e);let t=e.parent?e.parent.kids:Gl,n=t.indexOf(e);n>=0&&t.splice(n,1),$.selection.delete(e.id),im.has(e.id)&&im.close(e.id)}),ql(),e.nodes.forEach(e=>{let t=Jl(e.id);t&&(t.name=e.name,t.vis=e.vis,t.locked=e.locked,t.dynamic=e.dynamic,t.physics=e.physics,t.vel=0,t.props=e.props)}),$l(e.iso),Kl.forEach(e=>e.solo=nu(e)),$.snapshot=null,am(e.tod),nm.applyAll(),lm.render(),dm(),Zm(),rm.rebuild(mm())}function Km(e){if(e!==`edit`&&$.transport===`edit`&&dh(`Running — <b>Esc</b> stops and restores the editor state`),e===`edit`){let e=$.transport;e!==`edit`&&Gm(),$.transport=`edit`,$.paused=!1,$.playCamId=null,nm.setViewCamera(null),document.body.classList.remove(`playing`),Vm(null),e!==`edit`&&dh(`Stopped · editor state restored`)}else{if($.transport===`edit`&&Wm(),$.realtime=!0,$.paused=!1,e===`play`){let t=Um();t&&nm.setViewCamera(t)?($.transport=`play`,$.playCamId=t.id,document.body.classList.add(`playing`),Vm(t),dh(`Playing through <b>${t.name}</b>`)):(dh(`No camera to play through — simulating instead`),e=`simulate`)}e===`simulate`&&($.transport=`simulate`,$.playCamId=null,nm.setViewCamera(null),document.body.classList.remove(`playing`),Vm(null),dh(`Simulating`))}Xm()}function qm(e){$.paused=e,Xm(),dh(e?`Paused`:`Resumed`)}function Jm(){$.paused||qm(!0);let e=1/30;nm.stepOnce(e),$m(!0)&&am($.tod+e*Qm().props.rate/600)}function Ym(e){$.realtime=e,Xm()}function Xm(){let e=$.transport!==`edit`;Am.classList.toggle(`on`,$.transport===`play`),jm.classList.toggle(`on`,$.transport===`simulate`),Mm.classList.toggle(`on`,$.paused),Mm.innerHTML=X($.paused?`play`:`pause`,{size:13}),Nm.disabled=!$.paused,Pm.disabled=!e,Fm.classList.toggle(`on`,$.realtime),Fm.disabled=e,Im.textContent=$.paused?`Paused`:$.transport===`play`?`Play`:$.transport===`simulate`?`Simulate`:$.realtime?`Edit`:`Edit · static`,Im.className=`statechip `+($.paused?`paused`:$.transport);let t=$.realtime&&!$.paused;nm.setClock({animate:t,render:t})}Am.onclick=()=>Km($.transport===`play`?`edit`:`play`),jm.onclick=()=>Km($.transport===`simulate`?`edit`:`simulate`),Mm.onclick=()=>qm(!$.paused),Nm.onclick=()=>Jm(),Pm.onclick=()=>Km(`edit`),Fm.onclick=()=>Ym(!$.realtime);function Zm(){let e=$p(`#isoBanner`),t=eu().size;if(!t){e.style.display=`none`,e.innerHTML=``;return}e.style.display=`flex`,e.title=`${t} ${t===1?`entity is`:`entities are`} isolated — everything else is hidden`,e.innerHTML=`${X(`solo`,{size:11,color:`currentColor`})}<span>${t}</span>`;let n=Z(`button`,`chipbtn`,`Exit`);n.onclick=()=>om.exitIsolation(),e.appendChild(n)}var Qm=()=>Kl.find(e=>e.type===`sun`),$m=(e=!1)=>(e||$.realtime&&!$.paused)&&($.transport!==`edit`||Qm().props.animate),eh=cd({min:0,max:24,value:$.tod,dec:2,unit:`h`,thin:!0,onInput:e=>am(e,{silent:!0})});eh.querySelector(`.vpill`).style.display=`none`,$p(`#todSlider`).appendChild(eh);var th=$p(`#todPlay`);th.innerHTML=X(`play`,{size:12}),th.onclick=()=>{$.dayCycle=!$.dayCycle;let e=Qm();e.props.animate=$.dayCycle,th.innerHTML=X($.dayCycle?`pause`:`play`,{size:12}),th.classList.toggle(`on`,$.dayCycle),vd.emit(`propchange`,{node:e,key:`animate`,src:`tod`}),$.dayCycle&&!$.realtime&&Ym(!0)},$p(`#vpBrand`).innerHTML=X(`world`,{size:15}),$p(`#insPopout`).innerHTML=X(`copy`,{size:13}),$p(`#insFocus`).innerHTML=X(`focus`,{size:13}),$p(`#insFocus`).onclick=()=>om.focus(Jl($.cursorId)),$p(`#insPopout`).onclick=()=>{let e=Jl($.cursorId);e&&!Xl(e).noBillboard?im.openFor(e):e&&dh(`That entity has no billboard`)};var nh=[`cube`,`sphere`,`torus`,`cylinder`,`plane`,`pointlight`,`spotlight`,`ieslight`,`arealight`,`tubelight`,`camera`,`cinecamera`,`playercamera`,`vehiclecamera`,`particles`,`probe`,`audio`],rh=$p(`#vpDocks`),ih=(e,t,n,r)=>{let i=Z(`button`,`dockbtn`,X(t,{size:14}));return i.title=`${n} panel  (${r})`,i.onclick=()=>sh(e,!$.docks[e]),rh.appendChild(i),i},ah=ih(`left`,`panelL`,`Outliner`,`[`),oh=ih(`right`,`panelR`,`Inspector`,`]`);function sh(e,t){$.docks[e]=t,$.mode=$.docks.left&&$.docks.right?`split`:$.docks.left?`outliner`:$.docks.right?`inspector`:`viewport`,$p(`#outliner`).classList.toggle(`collapsed`,!$.docks.left),$p(`#inspector`).classList.toggle(`collapsed`,!$.docks.right),ah.classList.toggle(`on`,$.docks.left),oh.classList.toggle(`on`,$.docks.right),setTimeout(()=>{nm.resize(),hd(),Xh()},340)}function ch(e){sh(`left`,e===`split`||e===`outliner`),sh(`right`,e===`split`||e===`inspector`)}var lh=$p(`#ctxmenu`);function uh(e,t){let n=[[`Open settings popup`,`settings`,()=>im.openFor(e),!Xl(e).noBillboard&&!Yl(e)],[`Frame in viewport`,`focus`,()=>om.focus(e),!0,`F`],[`Rename`,`copy`,()=>{lm.render();let t=document.querySelector(`.row[data-id="${e.id}"] .nm`);t&&t.dispatchEvent(new MouseEvent(`dblclick`,{bubbles:!0}))},!0,`F2`],[`sep`],[e.vis?`Hide`:`Show`,e.vis?`eyeoff`:`eye`,()=>{e.vis=!e.vis,vd.emit(`treechange`)},!0,`H`],[e.locked?`Unlock`:`Lock`,e.locked?`unlock`:`lock`,()=>{e.locked=!e.locked,vd.emit(`treechange`)},!0,`L`],[nu(e)?`Leave isolation`:`Isolate`,`solo`,()=>om.toggleIsolateNode(e),!0,`I`],[`Duplicate`,`copy`,()=>om.duplicate(e),!Yl(e),`⌘D`],[`sep`],[`Delete`,`trash`,()=>om.remove(e),!0,`⌫`,!0]];lh.innerHTML=``,n.forEach(e=>{if(e[0]===`sep`){lh.appendChild(Z(`div`,`sep`));return}let[t,n,r,i=!0,a=``,o=!1]=e;if(!i)return;let s=Z(`div`,`mi${o?` danger`:``}`,`${X(n,{size:13})}<span>${t}</span>${a?`<span class="sc">${a}</span>`:``}`);s.onclick=()=>{lh.classList.remove(`open`),r()},lh.appendChild(s)}),lh.classList.add(`open`);let r=lh.offsetWidth,i=lh.offsetHeight;lh.style.left=Math.min(t.clientX,innerWidth-r-10)+`px`,lh.style.top=Math.min(t.clientY,innerHeight-i-10)+`px`}addEventListener(`pointerdown`,e=>{e.target.closest(`#ctxmenu`)||lh.classList.remove(`open`)}),em.addEventListener(`contextmenu`,e=>e.preventDefault());function dh(e){let t=Z(`div`,`toast`,e);$p(`#toasts`).appendChild(t),setTimeout(()=>{t.style.transition=`opacity .3s, transform .3s`,t.style.opacity=`0`,t.style.transform=`translateY(6px)`},1500),setTimeout(()=>t.remove(),1900)}var fh=$p(`#console`),ph=$p(`#cmdInput`),mh=$p(`#cmdSug`),hh=$p(`#cmdTyped`),gh=$p(`#cmdRest`),_h=$p(`#cmdEcho`);$p(`#cmdIcon`).innerHTML=X(`command`,{size:14}),$p(`#cmdRun`).innerHTML=X(`play`,{size:13});var vh={find(e){om.select(e[0].id),e.slice(1).forEach(e=>om.select(e.id,{additive:!0})),lm.revealNode(e[0]),nm.focusOn(e[0]),$.autoPopup||im.openFor(e[0])},commit(e,t){e.forEach(e=>vd.emit(`propchange`,{node:e,key:t,value:e.props[t],src:`console`})),dm()},add(e,{pos:t,name:n}={}){let r=om.addEntity(e,Jl($.cursorId));return t&&(r.props.pos=t.slice(),vd.emit(`propchange`,{node:r,key:`pos`,src:`console`})),n&&(r.name=cm(n),vd.emit(`treechange`)),nm.focusOn(r),r},physics(e,t){om.setPhysics(e,t),t&&$.transport===`edit`&&dh(`Press <b>Simulate</b> (Alt S) to let them fall`)},isolate(e){om.isolate(e.map(e=>e.id))},exitIsolation(){om.exitIsolation()},purge(e){let t={geometries:0,materials:0,textures:0,triangles:0,nodes:0},n=e.map(e=>e.name);return e.forEach(e=>{let n=om.purge(e);n&&(t.geometries+=n.geometries,t.materials+=n.materials,t.textures+=n.textures,t.triangles+=n.triangles,t.nodes+=n.nodes)}),t.nodes?`Purged <b>${n.join(`, `)}</b> — freed ${Yh(t.triangles)} triangles, ${t.geometries} ${t.geometries===1?`geometry`:`geometries`}, ${t.materials} materials`:`Nothing was purged`},remove(e){e.forEach(e=>om.remove(e))},visible(e,t){e.forEach(e=>e.vis=t),vd.emit(`treechange`)},lock(e,t){e.forEach(e=>e.locked=t),vd.emit(`treechange`)},rename(e,t){e.name=cm(t),vd.emit(`treechange`),dm()},duplicate(e){e.forEach(e=>om.duplicate(e))},focus(e){om.focus(e)},frameAll(){nm.frameAll(),$.view=`persp`,Dm()},snapView(e){Bh(e)},setTime(e){am(e)},dayCycle(e){$.dayCycle!==e&&th.click()},transport(e){Km(e)},pause(e){qm(e)},step(){Jm()},labels(e){Ph(e)},autoPopup(e){if($.autoPopup=e,!e)im.closeAuto();else{let e=Jl($.cursorId);e&&!Yl(e)&&im.openFor(e,{auto:!0})}wm()},openSettings(e){e.slice(0,4).forEach(e=>im.openFor(e))},closePopups(){im.closeAll()},setProp(e,t,n){Op(e,t,n,null),dm()},help(){ph.value=``,Eh(),Oh()}},yh=Qp({state:$,act:vh});function bh(){let e=Jl($.cursorId);return[{label:`Play — run through a camera`,sub:`transport`,run:()=>Km(`play`)},{label:`Simulate — run the world`,sub:`transport`,run:()=>Km(`simulate`)},{label:`Pause / resume`,sub:`transport`,run:()=>qm(!$.paused)},{label:`Step one frame`,sub:`transport`,run:()=>Jm()},{label:`Stop and restore`,sub:`transport`,run:()=>Km(`edit`)},{label:`Realtime viewport: turn ${$.realtime?`off`:`on`}`,sub:`viewport`,run:()=>Ym(!$.realtime)},{label:`Isolate selection`,sub:`view`,run:()=>om.toggleIsolateSelection()},{label:`Frame everything`,sub:`view`,run:()=>nm.frameAll()},{label:`Frame selection`,sub:`view`,run:()=>om.focus(e)},{label:`Close all popups`,sub:`view`,run:()=>im.closeAll()},{label:`Settings popup on select: turn ${$.autoPopup?`off`:`on`}`,sub:`behaviour`,run:()=>vh.autoPopup(!$.autoPopup)},{label:`Outliner panel: ${$.docks.left?`hide`:`show`}`,sub:`layout`,run:()=>sh(`left`,!$.docks.left)},{label:`Inspector panel: ${$.docks.right?`hide`:`show`}`,sub:`layout`,run:()=>sh(`right`,!$.docks.right)},{label:`Layout — both panels`,sub:`layout`,run:()=>ch(`split`)},{label:`Layout — viewport only`,sub:`layout`,run:()=>ch(`viewport`)},...nh.map(t=>({label:`Add ${Vl[t].label}`,sub:`create`,run:()=>om.addEntity(t,e)}))]}var xh=[],Sh=0,Ch=``,wh=[],Th=-1,Eh=()=>fh.classList.add(`open`,`on`),Dh=()=>fh.classList.remove(`open`);function Oh(){let e=ph.value;if(xh=yh.suggest(e,bh()),Sh=0,Ch=yh.completion(e,xh),hh.textContent=e,gh.textContent=Ch,fh.classList.toggle(`bad`,!!(e.trim()&&xh[0]&&xh[0].bad)),mh.innerHTML=``,!xh.length){mh.innerHTML=`<div class="csughead">Nothing matches — try “help”</div>`;return}mh.appendChild(Z(`div`,`csughead`,e.trim()?`What this will do`:`Say something like`)),xh.forEach((e,t)=>{let n=Z(`div`,`crow2${e.primary?` primary`:``}${e.bad?` bad`:``}${e.danger?` danger`:``}`,`${X(e.icon||`command`,{size:14,color:e.color})}
       <span class="t">${pm(e.title)}</span>
       <span class="sub">${pm(e.sub||(e.insert?`complete`:`run`))}</span>`);n.onmouseenter=()=>{Sh=t,kh()},n.onclick=e=>{e.preventDefault(),jh(t)},n.onmousedown=e=>e.preventDefault(),mh.appendChild(n)}),kh()}var kh=()=>mh.querySelectorAll(`.crow2`).forEach((e,t)=>e.classList.toggle(`on`,t===Sh));function Ah(e,t=!1){_h.innerHTML=e,_h.classList.toggle(`err`,t),_h.classList.add(`show`),clearTimeout(Ah._t),Ah._t=setTimeout(()=>_h.classList.remove(`show`),3200)}function jh(e){let t=xh[e];if(!t)return;if(t.insert&&!t.run){ph.value=t.insert,ph.focus(),Oh();return}if(t.bad||!t.run){Ah(t.error||`I did not understand that`,!0);return}let n=ph.value.trim(),r;try{r=t.run()}catch(e){Ah(e.message||`That did not work`,!0);return}n&&wh[wh.length-1]!==n&&wh.push(n),Th=-1;let i=typeof r==`string`?r:t.title;Ah(i),dh(i),ph.value=``,Oh(),Dh()}ph.addEventListener(`focus`,()=>{Eh(),Oh()}),ph.addEventListener(`blur`,()=>{fh.classList.remove(`on`,`bad`),setTimeout(Dh,120)}),ph.addEventListener(`input`,()=>{Eh(),Oh()}),ph.addEventListener(`keydown`,e=>{e.stopPropagation();let t=ph.selectionStart===ph.value.length;if(e.key===`Escape`){ph.value=``,Oh(),Dh(),ph.blur();return}if((e.key===`Tab`||e.key===`ArrowRight`&&t&&Ch)&&Ch){e.preventDefault(),ph.value+=Ch,Oh();return}if(e.key===`ArrowDown`){if(e.preventDefault(),!ph.value&&wh.length){Th=Math.max(Th-1,-1),ph.value=Th<0?``:wh[wh.length-1-Th],Oh();return}Sh=Math.min(Sh+1,xh.length-1),kh(),Mh();return}if(e.key===`ArrowUp`){if(e.preventDefault(),!ph.value&&wh.length){Th=Math.min(Th+1,wh.length-1),ph.value=wh[wh.length-1-Th],Oh();return}Sh=Math.max(Sh-1,0),kh(),Mh();return}e.key===`Enter`&&(e.preventDefault(),jh(Sh))});var Mh=()=>mh.querySelectorAll(`.crow2`)[Sh]?.scrollIntoView({block:`nearest`});$p(`#cmdRun`).onclick=()=>jh(Sh),$p(`#cmdKbd`).onclick=()=>Nh();function Nh(e=null){e!=null&&(ph.value=e),Eh(),ph.focus(),ph.select(),Oh()}function Ph(e){$.labelMode=e,rm.setLabelMode(e),wm()}addEventListener(`keydown`,e=>{if(e.target.matches(`input, textarea`))return;let t=Jl($.cursorId),n=e.key.toLowerCase();if((e.metaKey||e.ctrlKey)&&n===`k`){e.preventDefault(),Nh(``);return}if((e.metaKey||e.ctrlKey)&&n===`d`){e.preventDefault(),om.duplicate(t);return}if((e.metaKey||e.ctrlKey)&&n===`r`){e.preventDefault(),Ym(!$.realtime);return}if(e.altKey&&n===`p`){e.preventDefault(),Km($.transport===`play`?`edit`:`play`);return}if(e.altKey&&n===`s`){e.preventDefault(),Km($.transport===`simulate`?`edit`:`simulate`);return}if(n===`p`&&!e.altKey&&!e.metaKey&&!e.ctrlKey){qm(!$.paused);return}if(e.key===`.`){Jm();return}if(e.key===`Escape`){if(Dh(),lh.classList.remove(`open`),$.transport!==`edit`){Km(`edit`);return}if(tu()){om.exitIsolation();return}im.count()?im.closeAll():om.select(null);return}if(n===`f`){e.shiftKey?nm.frameAll():om.focus(t);return}if(n===`h`&&t){t.vis=!t.vis,vd.emit(`treechange`);return}if(n===`l`&&t){t.locked=!t.locked,vd.emit(`treechange`);return}if(n===`i`){om.toggleIsolateSelection();return}if(e.key===`[`){sh(`left`,!$.docks.left);return}if(e.key===`]`){sh(`right`,!$.docks.right);return}if(n===`enter`&&t&&!Xl(t).noBillboard&&!Yl(t)){im.toggle(t);return}if((e.key===`Delete`||e.key===`Backspace`)&&t){e.preventDefault(),om.remove(t);return}if(e.key===`ArrowDown`||e.key===`ArrowUp`){e.preventDefault();let t=Kl.filter(e=>Fh(e)).map(e=>e.id),n=t.indexOf($.cursorId),r=t[Math.min(Math.max(n+(e.key===`ArrowDown`?1:-1),0),t.length-1)];r!=null&&(om.select(r,{additive:!1}),lm.revealNode(Jl(r)))}e.key===`ArrowRight`&&t&&t.kids.length&&(t.open=!0,lm.render()),e.key===`ArrowLeft`&&t&&(t.kids.length&&t.open?t.open=!1:t.parent&&om.select(t.parent.id),lm.render())});var Fh=e=>{let t=e.parent;for(;t;){if(!t.open)return!1;t=t.parent}return!0};vd.on(`propchange`,({node:e,src:t})=>{nm.applyNode(e),t!==`tod`&&(e.type===`sun`||e.type===`moon`)&&Ih()}),vd.on(`treechange`,()=>{ql(),nm.applyAll(),lm.render(),dm(),rm.rebuild(mm()),fm()}),vd.on(`settod`,e=>am(e));function Ih(){$.tod=(6+(Kl.find(e=>e.type===`sun`).props.azimuth-90)/15+24)%24;let e=Math.floor($.tod),t=Math.floor($.tod%1*60);$p(`#todClock`).textContent=`${String(e).padStart(2,`0`)}:${String(t).padStart(2,`0`)}`,eh._set($.tod)}var Lh=$p(`#axisOrb`),Rh=$p(`#orbHint`),zh={right:{v:[1,0,0],label:`X`,color:`var(--ax-x)`},left:{v:[-1,0,0],label:``,color:`var(--ax-x)`,neg:!0},top:{v:[0,1,0],label:`Y`,color:`var(--ax-y)`},bottom:{v:[0,-1,0],label:``,color:`var(--ax-y)`,neg:!0},front:{v:[0,0,1],label:`Z`,color:`var(--ax-z)`},back:{v:[0,0,-1],label:``,color:`var(--ax-z)`,neg:!0}};function Bh(e){let t=zh[e];if(t){if($.transport===`play`){dh(`Stop the run to move the editor camera`);return}nm.snapView(new q(...t.v)),$.view=e,Dm(),dh(`${e[0].toUpperCase()+e.slice(1)} view`)}}var Vh=()=>{$.view!==`persp`&&($.view=`persp`,Dm())};function Hh(e,t){if($.view===`persp`||nm.isFlying)return;let n=zh[$.view];n&&e.position.clone().sub(t.target).normalize().dot(new q(...n.v))<.9995&&Vh()}var Uh=Object.entries(zh).map(([e,t])=>{let n=Z(`div`,`stem`);n.style.background=t.color;let r=Z(`div`,`ax${t.neg?` neg`:``}`,t.label);return r.style.background=t.color,r.style.color=t.neg?t.color:`#000`,r.title=`${e[0].toUpperCase()+e.slice(1)} view`,r.addEventListener(`pointerdown`,e=>e.stopPropagation()),r.addEventListener(`click`,t=>{t.stopPropagation(),Bh(e)}),r.addEventListener(`pointerenter`,()=>{Rh.textContent=e}),r.addEventListener(`pointerleave`,()=>{Rh.textContent=`drag to orbit`}),Lh.append(n,r),{stem:n,dot:r,a:t}});Rh.textContent=`drag to orbit`,Lh.addEventListener(`pointerdown`,e=>{if(e.target.closest(`.ax`)||$.transport===`play`)return;Lh.setPointerCapture(e.pointerId);let t={x:e.clientX,y:e.clientY},n=e=>{nm.orbitBy(e.clientX-t.x,e.clientY-t.y),t={x:e.clientX,y:e.clientY}},r=()=>{Lh.removeEventListener(`pointermove`,n),Lh.removeEventListener(`pointerup`,r)};Lh.addEventListener(`pointermove`,n),Lh.addEventListener(`pointerup`,r)}),Lh.addEventListener(`dblclick`,()=>{nm.frameAll(),dh(`Framed the world`)});var Wh=$p(`#vpStats`),Gh=[[`perf`,`fps`],[`geo`,`tris`],[`ents`,`entities`],[`day`,`daylight`],[`phys`,`physics`],[`iso`,`isolated`],[`cam`,`camera`,`opt`]],Kh={perf:`Frames per second and the time each frame took`,geo:`Triangles and draw calls in the last frame, across every pass`,ents:`Entities in the world, and how many are visible right now`,day:`How much daylight the sun is giving, and its elevation`,phys:`Physics bodies, and how many are still moving`,iso:`How many entities the isolation set is holding`,cam:`Where the editor camera is, and how far it is from what it orbits`},qh={};Gh.forEach(([e,t,n])=>{let r=Z(`div`,`stat${n?` opt`:``}`,`<span class="lb">${t}</span><span class="vl">—</span>`);r.title=Kh[e]||``,Wh.appendChild(r),qh[e]={cell:r,vl:r.querySelector(`.vl`)}});var Jh=(e,t,n=``,{show:r=!0,warn:i=!1,dim:a=!1}={})=>{let o=qh[e];if(!o)return;o.cell.classList.toggle(`hide`,!r),o.cell.classList.toggle(`warn`,i),o.vl.classList.toggle(`dim`,a);let s=n?`${t}<span class="sub"> · ${n}</span>`:String(t);o.vl.innerHTML!==s&&(o.vl.innerHTML=s)},Yh=e=>e.toLocaleString(`en-US`);function Xh(){let e=Wh.parentElement;Wh.classList.remove(`lite`,`tight`),e.scrollWidth>e.clientWidth&&Wh.classList.add(`lite`),e.scrollWidth>e.clientWidth&&Wh.classList.add(`tight`)}addEventListener(`resize`,Xh);function Zh(){let e=Kl.filter(e=>!Yl(e)),t=e.filter(e=>iu(e));Jh(`ents`,e.length,`${t.length} visible`);let n=eu().size;Jh(`iso`,n,``,{show:n>0,warn:!0});let r=e.filter(e=>e.physics),i=r.filter(e=>!e.resting).length;Jh(`phys`,r.length,r.length?i?`${i} awake`:`at rest`:``,{show:r.length>0}),Xh()}var Qh={cube:.5,plane:.02,sphere:.6,cylinder:.5,torus:.92},$h=3.6,eg=-.175,tg=e=>(Qh[e.type]??.4)*Math.abs(e.props.scale?e.props.scale[1]:1);function ng(e){if(e<=0)return;let t=Kl.filter(e=>e.physics&&!Yl(e)&&!e.locked&&Array.isArray(e.props.pos));if(!t.length)return;let n=Kl.find(e=>e.type===`water`)?.props.level??-.6;t.forEach(t=>{let r=t.props.pos,i=(Math.hypot(r[0],r[2])<$h?eg:n)+tg(t);t.vel=(t.vel||0)-$.gravity*e,r[1]=+(r[1]+t.vel*e).toFixed(4),r[1]<=i?(r[1]=i,Math.abs(t.vel)>.8?(t.vel=-t.vel*.34,t.resting=!1):(t.vel=0,t.resting=!0)):t.resting=!1,vd.emit(`propchange`,{node:t,key:`pos`,value:r,src:`physics`})})}var rg=0;nm.start(({fps:e,dt:t,camera:n,controls:r,dayFactor:i,playing:a})=>{t>0&&$m()&&am($.tod+t*Qm().props.rate/600),t>0&&$.transport!==`edit`&&ng(t),rm.update(),im.update(rm);let o=nm.camera;if(Uh.forEach(({stem:e,dot:t,a:n})=>{let r=new q(...n.v).applyQuaternion(o.quaternion.clone().invert()),i=38+r.x*26,a=38-r.y*26;t.style.left=i+`px`,t.style.top=a+`px`,t.style.marginLeft=`-8px`,t.style.marginTop=`-8px`,t.style.opacity=String(.35+(r.z+1)*.32),t.style.zIndex=String(Math.round(100+r.z*50));let s=i-38,c=a-38;e.style.width=Math.hypot(s,c)+`px`,e.style.transform=`rotate(${Math.atan2(c,s)}rad)`,e.style.opacity=String(.15+(r.z+1)*.16)}),Hh(nm.camera,r),performance.now()-rg>250){rg=performance.now();let t=nm.renderInfo;Jh(`perf`,e.toFixed(0),`${(1e3/Math.max(e,1)).toFixed(1)} ms`,{warn:e<24}),Jh(`geo`,Yh(t.triangles),`${Yh(t.calls)} draws`),Jh(`day`,`${(i*100).toFixed(0)}%`,`${Qm().props.elevation.toFixed(0)}°`),Kl.some(e=>e.physics)&&Zh(),Xh();let o=n.position;Jh(`cam`,a?`through ${Jl($.playCamId)?.name||`camera`}`:`${o.x.toFixed(1)}, ${o.y.toFixed(1)}, ${o.z.toFixed(1)}`,a?``:`${n.position.distanceTo(r.target).toFixed(1)} m`,{dim:!0})}}),addEventListener(`resize`,()=>{$.transport===`play`&&Vm(Jl($.playCamId))}),am(7.4),nm.applyAll(),lm.render(),sh(`left`,!0),sh(`right`,!0),om.select(Kl.find(e=>e.name===`Anchor Cube`).id),rm.setLabelMode(`hover`),Zm(),Xm(),setTimeout(()=>dh(`Click a billboard to select · click again for settings`),700),window.frontier={state:$,app:om,setTimeOfDay:am,vp:nm,popups:im,outliner:lm,billboards:rm,world:{flat:Kl,scene:Gl},setTransport:Km,setPaused:qm,setRealtime:Ym,stepFrame:Jm,snapView:Bh,setMode:ch,setDock:sh,lang:yh,focusConsole:Nh,run(e){let t=yh.parse(e);if(!t)return null;if(!t.ok)return Ah(t.error,!0),t;let n=t.run();return Ah(typeof n==`string`?n:t.title),dh(typeof n==`string`?n:t.title),t}};