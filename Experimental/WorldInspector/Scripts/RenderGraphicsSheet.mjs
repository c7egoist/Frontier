// Renders every World Inspector graphic (SVG builders + the solver-driven canvases) into one PNG contact sheet, from the
// showcase document at a chosen hour.  No browser needed: canvases are captured as ImageData and encoded here.
//   npm install --prefix /tmp/rs @resvg/resvg-js@2
//   RESVG_DIR=/tmp/rs node Experimental/WorldInspector/Scripts/RenderGraphicsSheet.mjs 13.4 Experimental/WorldInspector/Screenshots/graphics-day.png
import fs from "node:fs"; import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
const { Resvg } = createRequire(pathToFileURL(resolve(process.env.RESVG_DIR || "/tmp/rs") + "/"))("@resvg/resvg-js");
const R = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const Panels = JSON.parse(fs.readFileSync(R+"../FrontierWorldMirror/NativePanels.json","utf8")).Panels;
const UI = await import(R+"WorldInspector.js"); const D = await import(R+"WorldDerived.js"); const G = await import(R+"WorldGraphics.js");
const Doc = await import(R+"WorldDocument.js"); const A = await import(R+"../FrontierWorldMirror/AtmosphereSky.js");
const H = UI.MountHeadless(Panels);
const hour = Number(process.argv[2] || 13.4);
Doc.Edit(H.State.Doc, "sun", "Local Hours", hour);
const C = H.Context(); const S = C.Scene;
function png(w,h,data){const crc=(b)=>{let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}let x=0xffffffff;for(const v of b)x=t[(x^v)&255]^(x>>>8);return (x^0xffffffff)>>>0};
 const chunk=(ty,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])};
 const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;Buffer.from(data.buffer,data.byteOffset+y*w*4,w*4).copy(raw,y*(w*4+1)+1)}
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",zlib.deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);}
function fakeCanvas(){const c={width:0,height:0,img:null,getContext:()=>({createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData:(i)=>{c.img=i}})};return c;}
globalThis.requestAnimationFrame=(f)=>f();
const lut=A.BuildSkyViewLut(S.SunDir,S.Atmosphere);
const disc={HalfRad:S.SunAngularRadiusRad,Rgb:S.Solar.Transmittance.map((t,i)=>t*S.Solar.DiscIntensity*S.Solar.Tint[i])};
const domes={sky:{Lut:lut,SunDir:S.SunDir,Gain:S.ExposureGain,SunDisc:disc},clouds:{Lut:lut,SunDir:S.SunDir,Gain:S.ExposureGain,Clouds:S.Clouds,SunIrr:S.SunIrradiance,SkyCol:S.SkyRadiance,SunDisc:disc},stars:{Lut:lut,SunDir:S.SunDir,Gain:S.ExposureGain,Stars:S.Stars,Moon:S.Moon}};
const imgs={};
for(const [k,spec] of Object.entries(domes)){const c=fakeCanvas();G.RenderDome(c,spec);imgs[k]=png(c.width,c.height,c.img.data);}
{const c=fakeCanvas();G.RenderMoon(c,{Preset:0,Phase:S.Moon.phase,Bright:1.6,Glow:0.8,Roll:0});imgs.moon=png(150,150,c.img.data);}
const Rec=(id)=>Doc.RecordOf(C.Doc,id);
const day=D.SunDay(Rec("sun"));
const parts=[
 G.SunChart(day,Rec("sun")["Local Hours"],"#ffd38a"), G.DayStrip(day,Rec("sun")["Local Hours"]),
 G.DensityProfile({Rayleigh:1,Mie:1,Ozone:1.2,RayleighH:8000,MieH:1200,Top:60000}), G.ScatterSpectrum({Rayleigh:1,Mie:1,Ozone:1.2}),
 G.CloudSection({Enabled:true,Coverage:0.42,Density:2.2,Bottom:1400,Thickness:1100,Ceiling:8000,Anvil:0.5}), G.PhasePolar(0.78),
 G.PhaseStrip(0.62), G.Compass(300,28,{Colour:"#e8e3d6"}), G.MagnitudeScale(5.5), G.TwinkleWave(30,1.2,true),
 G.FlareFrame({Enabled:true,Intensity:1,Ghosts:6,HaloRadius:0.28,Chromatic:0.6,Blades:6,StreakGain:1,Anamorphic:true,Streaks:true,Starburst:true,Spread:1,Rotation:0,RayPairs:6,GhostGain:1,Spacing:1,HaloGain:1,HaloWidth:0.04,Shape:1,X:0.25,Y:0.3}),
 G.ToneChart(1.35,1,0), G.EvLadder(0.5), G.LensFx(0.05,0.15,1),
 G.FovDiagram(D.CameraOptics(25.7,36,4,4.11),4.11,25.7), G.WindRose(25,6.5,0.3,0.25), G.WindProfile(6.5,0.3,10,25), G.BeaufortStrip(6.5),
 G.FogChart(0.02,400,true), G.VisibilityStrip(0.02,50,true), G.RainbowDiagram(20,{Enabled:true,Intensity:1,Width:1,Secondary:1,Alexander:true}), G.RainScale(12,true,"Rain"),
 G.TransformDiagram([-0.15,0.55,0.34],[1.04,1.04,1.04],[0,0,0]), G.LuxScale(420,"420 lx"), G.LightFootprint(1.7,1.3,2.46,165), G.KelvinBar(5650), G.DiscCompare(2.06,0.533)
];
let y=10, out=[], x=10, rowH=0, W=1700;
const place=(svg,w)=>{const vb=svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);const vw=+vb[1],vh=+vb[2];const h=vh*w/vw;if(x+w>W){x=10;y+=rowH+16;rowH=0;}
 out.push(svg.replace("<svg ",`<svg x="${x}" y="${y}" width="${w}" height="${h}" `).replace(/class="[^"]*"/,""));x+=w+16;rowH=Math.max(rowH,h);};
for(const [k,b] of Object.entries(imgs)){ if(x+170>W){x=10;y+=rowH+16;rowH=0;} out.push(`<image x="${x}" y="${y}" width="168" height="168" href="data:image/png;base64,${b.toString("base64")}"/>`);x+=184;rowH=Math.max(rowH,168);}
for(const p of parts){const vw=+p.match(/viewBox="0 0 ([\d.]+)/)[1]; place(p, vw>=380?400:vw>=200?220:vw);}
y+=rowH+10;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="100%" height="100%" fill="#1d1d1d"/>${out.join("")}</svg>`;
const r=new Resvg(svg,{font:{loadSystemFonts:true,defaultFontFamily:"DejaVu Sans"}});fs.writeFileSync(process.argv[3]||"graphics-sheet.png",r.render().asPng());
console.log("ok",y);
{const c=fakeCanvas();G.RenderStarWindow(c,{Lut:lut,SunDir:S.SunDir,Gain:S.ExposureGain,Stars:S.Stars,Moon:S.Moon,FovDeg:30});if(process.argv[4])fs.writeFileSync(process.argv[4],png(168,168,c.img.data));}
