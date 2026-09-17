// Seeded random + texture helpers
export class SeededRandom {
  constructor(seed=1){
    this.seed = seed % 2147483647;
    if(this.seed <=0) this.seed += 2147483646;
  }
  next(){
    this.seed = this.seed * 16807 % 2147483647;
    return (this.seed -1)/2147483646;
  }
  range(min,max){ return min + this.next()*(max-min); }
  int(min,max){ return Math.floor(this.range(min,max+1)); }
  pick(arr){ return arr[Math.floor(this.next()*arr.length)]; }
  bool(p=0.5){ return this.next() < p; }
}

export function createWoodTexture(colorBase='#c9a87a', type='hinoki', age=0.3, scale=1){
  const c = document.createElement('canvas');
  c.width=512; c.height=512;
  const ctx=c.getContext('2d');
  ctx.fillStyle=colorBase;
  ctx.fillRect(0,0,512,512);
  // wood grain
  const baseRgb = hexToRgb(colorBase);
  for(let i=0;i< 80*scale;i++){
    const x = Math.random()*512;
    const w = Math.random()*4+0.5;
    const alpha = 0.05 + Math.random()*0.15 + age*0.1;
    ctx.fillStyle=`rgba(${baseRgb.r*0.6},${baseRgb.g*0.5},${baseRgb.b*0.4},${alpha})`;
    ctx.fillRect(x,0,w,512);
    // waviness
    ctx.beginPath();
    ctx.moveTo(x,0);
    for(let y=0;y<512;y+=10){
      ctx.lineTo(x + Math.sin(y*0.01 + Math.random())*w*2, y);
    }
    ctx.strokeStyle=`rgba(${baseRgb.r*0.7},${baseRgb.g*0.6},${baseRgb.b*0.5},${alpha*0.5})`;
    ctx.lineWidth=w*0.5;
    ctx.stroke();
  }
  if(type==='yakisugi'){
    ctx.fillStyle='rgba(0,0,0,0.35)';
    ctx.fillRect(0,0,512,512);
    for(let i=0;i<200;i++){
      ctx.fillStyle=`rgba(20,10,5,${Math.random()*0.15})`;
      ctx.fillRect(Math.random()*512, Math.random()*512, Math.random()*80+10, Math.random()*3+1);
    }
  }
  if(type==='painted_red'){
    ctx.globalCompositeOperation='multiply';
    ctx.fillStyle='rgba(120,20,20,0.25)';
    ctx.fillRect(0,0,512,512);
    ctx.globalCompositeOperation='source-over';
  }
  return c;
}

export function createWallTexture(color='#f5f1e8', type='shikkui', scale=1){
  const c=document.createElement('canvas');
  c.width=512; c.height=512;
  const ctx=c.getContext('2d');
  ctx.fillStyle=color;
  ctx.fillRect(0,0,512,512);
  if(type==='shikkui'){
    for(let i=0;i<8000*scale;i++){
      const x=Math.random()*512, y=Math.random()*512;
      const s=Math.random()*2+0.5;
      ctx.fillStyle=`rgba(0,0,0,${Math.random()*0.04})`;
      ctx.fillRect(x,y,s,s);
    }
  } else if(type==='namako'){
    ctx.strokeStyle='rgba(0,0,0,0.15)';
    ctx.lineWidth=2;
    const tile=64*scale;
    for(let y=0;y<512;y+=tile){
      for(let x=0;x<512;x+=tile){
        ctx.fillStyle=( (Math.floor(x/tile)+Math.floor(y/tile))%2===0) ? color : shade(color,-10);
        ctx.fillRect(x,y,tile-4,tile-4);
        ctx.strokeRect(x,y,tile-4,tile-4);
        // circle in middle
        ctx.beginPath();
        ctx.arc(x+tile/2-2,y+tile/2-2, tile*0.2,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,0.2)';
        ctx.fill();
      }
    }
  } else if(type==='shitami'){
    const h=32*scale;
    for(let y=0;y<512;y+=h){
      ctx.fillStyle= y% (h*2)===0 ? shade(color, -5) : shade(color, 5);
      ctx.fillRect(0,y,512,h-2);
      ctx.fillStyle='rgba(0,0,0,0.15)';
      ctx.fillRect(0,y+h-2,512,2);
    }
  }
  return c;
}

export function createRoofTileTexture(tileType='kawara_nihon', baseColor='#4a4e52', scale=1){
  const c=document.createElement('canvas');
  c.width=512; c.height=512;
  const ctx=c.getContext('2d');
  const baseRgb=hexToRgb(baseColor);
  ctx.fillStyle=baseColor;
  ctx.fillRect(0,0,512,512);

  if(tileType.includes('kawara')){
    const tileH=24*scale;
    const tileW=48*scale;
    let isRed = tileType==='kawara_red';
    let isBlue = tileType==='ceramic_blue';
    for(let y=0;y<512;y+=tileH){
      const offset = (Math.floor(y/tileH)%2===0)?0:tileW/2;
      for(let x=-tileW;x<512+tileW;x+=tileW){
        const xx=x+offset;
        // tile
        const grad=ctx.createLinearGradient(xx,y,xx,y+tileH);
        if(isRed){
          grad.addColorStop(0,'#a33');
          grad.addColorStop(0.5,'#8b2222');
          grad.addColorStop(1,'#6b1515');
        } else if(isBlue){
          grad.addColorStop(0,'#4a6a9a');
          grad.addColorStop(0.5,'#2f4a71');
          grad.addColorStop(1,'#1e3252');
        } else if(tileType==='kawara_ibushi'){
          grad.addColorStop(0,`rgb(${baseRgb.r+20},${baseRgb.g+20},${baseRgb.b+25})`);
          grad.addColorStop(0.5, baseColor);
          grad.addColorStop(1,`rgb(${baseRgb.r-15},${baseRgb.g-15},${baseRgb.b-15})`);
        } else {
          grad.addColorStop(0,`rgb(${Math.min(255,baseRgb.r+25)},${Math.min(255,baseRgb.g+25)},${Math.min(255,baseRgb.b+25)})`);
          grad.addColorStop(0.5, baseColor);
          grad.addColorStop(1,`rgb(${Math.max(0,baseRgb.r-20)},${Math.max(0,baseRgb.g-20)},${Math.max(0,baseRgb.b-20)})`);
        }
        ctx.fillStyle=grad;
        ctx.beginPath();
        ctx.roundRect(xx+1,y+1,tileW-2,tileH-2, tileH*0.3);
        ctx.fill();
        // bottom edge highlight
        ctx.fillStyle='rgba(255,255,255,0.15)';
        ctx.fillRect(xx+2,y+1,tileW-4,2);
        // side
        ctx.fillStyle='rgba(0,0,0,0.25)';
        ctx.fillRect(xx+2,y+tileH-3,tileW-4,2);
      }
    }
    // vertical joints for round kawara
    if(tileType==='kawara_nihon' || tileType==='kawara_ibushi'){
      ctx.fillStyle='rgba(0,0,0,0.15)';
      for(let x=0;x<512;x+=48*scale){
        ctx.fillRect(x,0,4,512);
      }
    }
  } else if(tileType==='mokume'){
    ctx.fillStyle=baseColor;
    ctx.fillRect(0,0,512,512);
    for(let y=0;y<512;y+=16*scale){
      ctx.fillStyle= y%32===0 ? shade(baseColor,10) : shade(baseColor,-10);
      ctx.fillRect(0,y,512,12*scale);
      ctx.fillStyle='rgba(0,0,0,0.2)';
      ctx.fillRect(0,y+12*scale,512,2);
    }
  } else if(tileType==='copper'){
    for(let i=0;i<4000;i++){
      ctx.fillStyle=`rgba(${80+Math.random()*40},${120+Math.random()*40},${100+Math.random()*40},${Math.random()*0.15})`;
      ctx.fillRect(Math.random()*512,Math.random()*512, Math.random()*3+1, Math.random()*3+1);
    }
    // seams
    ctx.strokeStyle='rgba(0,0,0,0.25)';
    ctx.lineWidth=1;
    for(let x=0;x<512;x+=64){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,512); ctx.stroke();
    }
    for(let y=0;y<512;y+=128){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(512,y); ctx.stroke();
    }
  }
  return c;
}

export function createKanbanTexture(text='山田商店', sub='YAMADA', style='wood_vertical'){
  const c=document.createElement('canvas');
  c.width=512; c.height=1024;
  const ctx=c.getContext('2d');
  if(style.includes('wood')){
    ctx.fillStyle='#8d6e4a';
    ctx.fillRect(0,0,512,1024);
    // wood grain
    for(let i=0;i<100;i++){
      ctx.fillStyle=`rgba(0,0,0,${Math.random()*0.08})`;
      ctx.fillRect(Math.random()*512,0, Math.random()*20+2,1024);
    }
    ctx.strokeStyle='#5a3f24';
    ctx.lineWidth=12;
    ctx.strokeRect(6,6,500,1012);
  } else if(style==='metal_neon'){
    ctx.fillStyle='#1a1a1a';
    ctx.fillRect(0,0,512,1024);
    ctx.strokeStyle='#ff1744';
    ctx.lineWidth=4;
    ctx.strokeRect(10,10,492,1004);
  } else {
    ctx.fillStyle='#f5f1e8';
    ctx.fillRect(0,0,512,1024);
  }
  ctx.fillStyle= style==='metal_neon' ? '#ff1744' : '#111';
  ctx.textAlign='center';
  ctx.font='bold 120px "Noto Serif JP", serif';
  const lines=text.split('');
  if(style==='wood_vertical'){
    let y=160;
    for(let ch of lines){
      ctx.fillText(ch,256,y);
      y+=110;
    }
    ctx.font='600 48px JetBrains Mono';
    ctx.fillStyle='#111';
    ctx.fillText(sub,256, 900);
  } else {
    ctx.font='bold 80px "Noto Serif JP", serif';
    wrapText(ctx,text,256,300,460,90);
    ctx.font='600 36px JetBrains Mono';
    ctx.fillText(sub,256, 500);
  }
  return c;
}

export function createNorenTexture(text='営業中'){
  const c=document.createElement('canvas');
  c.width=512; c.height=512;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#f0e6d3';
  ctx.fillRect(0,0,512,512);
  ctx.fillStyle='#222';
  ctx.textAlign='center';
  ctx.font='bold 100px "Noto Serif JP"';
  ctx.fillText(text,256,256);
  // slits
  ctx.fillStyle='rgba(0,0,0,0.0)';
  ctx.clearRect(170, 320, 12, 192);
  ctx.clearRect(330, 320, 12, 192);
  return c;
}

function wrapText(ctx,text,x,y,maxW,lineH){
  const chars=text.split('');
  let line='';
  let yy=y;
  for(let ch of chars){
    const test=line+ch;
    if(ctx.measureText(test).width>maxW){
      ctx.fillText(line,x,yy);
      line=ch;
      yy+=lineH;
    } else line=test;
  }
  ctx.fillText(line,x,yy);
}

export function hexToRgb(hex){
  const r=parseInt(hex.slice(1,3),16);
  const g=parseInt(hex.slice(3,5),16);
  const b=parseInt(hex.slice(5,7),16);
  return {r,g,b};
}
export function shade(hex, amt){
  let {r,g,b}=hexToRgb(hex);
  r=Math.max(0,Math.min(255,r+amt));
  g=Math.max(0,Math.min(255,g+amt));
  b=Math.max(0,Math.min(255,b+amt));
  return `rgb(${r},${g},${b})`;
}
export function canvasToTexture(canvas, THREE){
  const tex=new THREE.CanvasTexture(canvas);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.anisotropy=4;
  tex.needsUpdate=true;
  return tex;
}
