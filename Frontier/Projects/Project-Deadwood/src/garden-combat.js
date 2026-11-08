export function createHull(){return {value:100,lastHit:-100};}
export function applyHullDamage(hull,amount,time){
  if(amount<=0||hull.value<=0||time-hull.lastHit<.42)return false;
  hull.lastHit=time;hull.value=Math.max(0,hull.value-amount);return true;
}
