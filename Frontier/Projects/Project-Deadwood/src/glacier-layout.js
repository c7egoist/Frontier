import { clamp } from './course.js';

export const GLACIER=Object.freeze({x:1600,z:3300,length:2000,maxSpeed:38,collapseDelay:4,collapseSpeed:14,collapseStart:-220,
  landing:{x:2700,z:5600,length:260}});
export const GLACIER_BEATS=[
  {s:0,name:'The blue vault',note:'Choose a gap between the ridges. Snow is a grip island, not a route.'},
  {s:360,name:'The avalanche cut',note:'The falling wall opens a shorter, fragile channel.'},
  {s:780,name:'The frozen fleet',note:'Weave between the hulls. Incoming crystal showers reshape the gaps. Do not commit to one line.'},
  {s:1650,name:'The crystal throat',note:'Watch the shadows. The far portal is beyond the last cave.'}
];
export const glacierCentre=s=>GLACIER.x+22*Math.sin(s/215)+9*Math.sin(s/81);
export const glacierY=s=>1.6*Math.sin(s/175)+.75*Math.sin(s/61);
const smooth=(a,b,s)=>{const t=clamp((s-a)/(b-a),0,1);return t*t*(3-2*t);};
export const glacierHalfWidth=s=>70+28*smooth(300,400,s)*(1-smooth(650,740,s))+65*smooth(720,850,s)*(1-smooth(1570,1690,s));
export function createShips(){
  return [
    [900,13,64,10,.16],[1055,-15,78,12,-.23],[1205,12,61,11,.34],
    [1370,-13,70,11,-.19],[1500,11,58,9,.26],[1630,-14,66,10,-.12],
    [815,55,83,13,-.58],[1575,58,76,12,.43]
  ].map(([s,offset,length,width,yaw],id)=>({id,s,x:glacierCentre(s)+offset,z:GLACIER.z+s,length,width,yaw,tilt:(id%2?1:-1)*.06}));
}
export function createAvalanches(){return [
  {id:0,s:520,x:glacierCentre(520)+8,z:GLACIER.z+520,width:53,depth:56,state:'sealed',age:0},
  {id:1,s:1210,x:glacierCentre(1210)-8,z:GLACIER.z+1210,width:24,depth:48,state:'sealed',age:0}
];}
