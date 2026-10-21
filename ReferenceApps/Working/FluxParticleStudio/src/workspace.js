import {serialize,parseComposition} from './io.js';
export function InstallWorkspace(Store,Engine,Refresh){
 const Token=new URLSearchParams(location.search).get('workspace-token');if(!Token||window.parent===window)return;
 const Post=(Type,Payload,Request)=>window.parent.postMessage({Frontier:'particle-workspace',Version:1,Token,Editor:'flux',Type,Payload,Request},location.origin);
 let Last='',Timer;
 const Publish=Request=>{const Text=serialize(Store);if(Text===Last&&!Request)return;Last=Text;try{localStorage.setItem('Frontier.ParticleWorkspace.flux.v1',Text);}catch{Post('storage-error','Browser storage unavailable; export your composition.');}Post('document',JSON.parse(Text),Request);};
 Store.subscribe(()=>{clearTimeout(Timer);Timer=setTimeout(()=>Publish(),180);});
 window.addEventListener('message',E=>{const M=E.data;if(E.origin!==location.origin||E.source!==window.parent||M?.Frontier!=='particle-workspace'||M.Token!==Token||M.Version!==1)return;
  if(M.Type==='save'){Publish(M.Request);return;}
  if(M.Type==='restore')try{if(M.Payload){const {doc}=parseComposition(JSON.stringify(M.Payload));Store.restore(JSON.stringify(doc));Store.notify('comp');Engine.seek(0);Refresh();}Last='';Publish();}catch(Error){Post('error',String(Error.message??Error));}
 });
 setInterval(()=>{Publish();const R=Engine.debug.report();Post('metrics',{editor:'flux',canvas_size:R.canvasSize,float_targets:R.floatTargets,render_api:'webgl2',layers:Store.layers.length,particle_capacity:Store.layers.reduce((S,L)=>S+L.emitter.count,0),draw_calls:R.calls,triangles:R.tris,playhead_seconds:Engine.time});},1000);
 window.addEventListener('pagehide',()=>Publish());
 window.addEventListener('error',E=>Post('error',E.message));window.addEventListener('unhandledrejection',E=>Post('error',String(E.reason)));
 Post('ready');
}
