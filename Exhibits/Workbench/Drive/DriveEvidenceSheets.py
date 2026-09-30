#!/usr/bin/env python3
"""Generate headless Project-Drive evidence sheets from actual DriveTelemetry CSV.

The images are CPU-reference state sheets, explicitly not native Frontier Vulkan/Slang/ImGui captures.
No image library is required; this module writes RGB PNGs with the Python standard library.
"""
from __future__ import annotations

import csv
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GALLERY = ROOT / "Exhibits/Gallery/Drive"

# Five-wide uppercase pixel typeface; this keeps the reference sheets dependency-free.
FONT: dict[str, tuple[int, ...]] = {
    "A": (14,17,17,31,17,17,17), "B": (30,17,17,30,17,17,30), "C": (14,17,16,16,16,17,14),
    "D": (30,17,17,17,17,17,30), "E": (31,16,16,30,16,16,31), "F": (31,16,16,30,16,16,16),
    "G": (14,17,16,23,17,17,14), "H": (17,17,17,31,17,17,17), "I": (31,4,4,4,4,4,31),
    "J": (7,2,2,2,2,18,12), "K": (17,18,20,24,20,18,17), "L": (16,16,16,16,16,16,31),
    "M": (17,27,21,21,17,17,17), "N": (17,25,21,19,17,17,17), "O": (14,17,17,17,17,17,14),
    "P": (30,17,17,30,16,16,16), "Q": (14,17,17,17,21,18,13), "R": (30,17,17,30,20,18,17),
    "S": (15,16,16,14,1,1,30), "T": (31,4,4,4,4,4,4), "U": (17,17,17,17,17,17,14),
    "V": (17,17,17,17,17,10,4), "W": (17,17,17,21,21,21,10), "X": (17,17,10,4,10,17,17),
    "Y": (17,17,10,4,4,4,4), "Z": (31,1,2,4,8,16,31), "0": (14,17,19,21,25,17,14),
    "1": (4,12,4,4,4,4,14), "2": (14,17,1,2,4,8,31), "3": (30,1,1,14,1,1,30),
    "4": (2,6,10,18,31,2,2), "5": (31,16,16,30,1,1,30), "6": (14,16,16,30,17,17,14),
    "7": (31,1,2,4,8,8,8), "8": (14,17,17,14,17,17,14), "9": (14,17,17,15,1,1,14),
    " ": (0,0,0,0,0,0,0), "-": (0,0,0,31,0,0,0), "/": (1,2,2,4,8,8,16), ".": (0,0,0,0,0,6,6),
    ":": (0,4,4,0,4,4,0), "[": (14,8,8,8,8,8,14), "]": (14,2,2,2,2,2,14), "=": (0,31,0,31,0,0,0),
}

DARK=(10,18,31); PANEL=(16,29,46); PANEL2=(29,52,81); BORDER=(39,71,98); INK=(233,242,255)
DIM=(169,192,220); CYAN=(80,220,232); BLUE=(73,137,255); ORANGE=(255,173,66); WHITE=(244,249,255)

class Raster:
    def __init__(self, width: int, height: int, colour: tuple[int,int,int]=DARK) -> None:
        self.width, self.height = width, height
        self.pixels = bytearray(colour * (width * height))
    def set(self, x: int, y: int, colour: tuple[int,int,int]) -> None:
        if 0 <= x < self.width and 0 <= y < self.height:
            i=(y*self.width+x)*3; self.pixels[i:i+3]=bytes(colour)
    def rect(self,x:int,y:int,w:int,h:int,c:tuple[int,int,int],border:tuple[int,int,int]|None=None) -> None:
        for yy in range(y,y+h):
            for xx in range(x,x+w): self.set(xx,yy,c)
        if border:
            self.line(x,y,x+w-1,y,border);self.line(x,y+h-1,x+w-1,y+h-1,border);self.line(x,y,x,y+h-1,border);self.line(x+w-1,y,x+w-1,y+h-1,border)
    def line(self,x0:int,y0:int,x1:int,y1:int,c:tuple[int,int,int],thickness:int=1) -> None:
        dx=abs(x1-x0); sx=1 if x0<x1 else -1; dy=-abs(y1-y0); sy=1 if y0<y1 else -1; error=dx+dy
        while True:
            for ox in range(-(thickness//2),thickness//2+1):
                for oy in range(-(thickness//2),thickness//2+1): self.set(x0+ox,y0+oy,c)
            if x0==x1 and y0==y1: break
            e2=2*error
            if e2>=dy: error+=dy;x0+=sx
            if e2<=dx: error+=dx;y0+=sy
    def disc(self,cx:int,cy:int,r:int,c:tuple[int,int,int]) -> None:
        for yy in range(-r,r+1):
            for xx in range(-r,r+1):
                if xx*xx+yy*yy<=r*r:self.set(cx+xx,cy+yy,c)
    def text(self,x:int,y:int,value:object,scale:int=2,c:tuple[int,int,int]=INK) -> None:
        for raw in str(value).upper():
            glyph=FONT.get(raw,FONT[" "])
            for row,bits in enumerate(glyph):
                for col in range(5):
                    if bits & (1 << (4-col)):
                        self.rect(x+col*scale,y+row*scale,scale,scale,c)
            x+=6*scale
    def png(self,target:Path)->None:
        raw=b"".join(b"\0"+bytes(self.pixels[y*self.width*3:(y+1)*self.width*3]) for y in range(self.height))
        def chunk(kind:bytes,data:bytes)->bytes:return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data)&0xffffffff)
        target.write_bytes(b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",self.width,self.height,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(raw,9))+chunk(b"IEND",b""))

def sample(rows:list[dict[str,str]],moment:float)->dict[str,str]:return min(rows,key=lambda row:abs(float(row["t"])-moment))
def card(canvas:Raster,x:int,y:int,w:int,h:int,title:str)->None:
    canvas.rect(x,y,w,h,PANEL,BORDER);canvas.text(x+18,y+18,title,2,INK)

def motion(rows:list[dict[str,str]])->Raster:
    image=Raster(1440,820); image.rect(30,26,1380,78,PANEL2);image.text(55,49,"PROJECT DRIVE / PHYSICS MOTION",3,INK);image.text(57,78,"CPU REFERENCE - VEHICLESOLVER XPBD PACEJKA - NOT NATIVE VULKAN",1,DIM)
    card(image,30,128,1110,430,"ACTUAL CHASSIS TRAJECTORY / TELEMETRY CSV"); card(image,1165,128,245,430,"RUN SUMMARY");card(image,30,583,1380,207,"SPEED PROFILE / ACTUAL TELEMETRY")
    max_x=max(float(r["x"]) for r in rows); min_y=min(float(r["y"]) for r in rows); max_y=max(float(r["y"]) for r in rows)
    sx=1040/max(1,max_x+10); sy=250/max(1,max_y-min_y+8); tx,ty=90,383
    image.rect(tx,ty-46,1060,92,(37,57,77),BORDER); ramp_x=int(tx+9*sx);ramp_w=int(6*sx);image.rect(ramp_x,ty-36,ramp_w,72,(130,82,31),ORANGE);image.text(ramp_x+8,ty-62,"RAMP",1,ORANGE)
    for k in range(8):
        x=int(tx+(18+5*k)*sx);y=int(ty-(((2.4 if not k%2 else -2.4)-min_y)*sy));image.disc(x,y,6,ORANGE)
    last=None
    for row in rows[::3]:
        x=int(tx+float(row["x"])*sx);y=int(ty-(float(row["y"])-min_y)*sy)
        if last:image.line(last[0],last[1],x,y,CYAN,4)
        last=(x,y)
    for moment in (2,4,6,9,12):
        row=sample(rows,float(moment));x=int(tx+float(row["x"])*sx);y=int(ty-(float(row["y"])-min_y)*sy);col=ORANGE if row["airborne"]=="1" else CYAN;image.disc(x,y,12,col);image.text(x-18,y-32,f"T{moment}",2,col)
    image.text(65,505,"CYAN GROUNDED - ORANGE RAMP LAUNCH / AIRBORNE - ORANGE BLOCK 6 M RAMP",1,DIM)
    peak=max(float(r["speed_mps"]) for r in rows); air=sum(r["airborne"]=="1" for r in rows)/60; final=rows[-1]
    summary=["12.0 S @ 240 HZ",f"PEAK {peak*3.6:.1f} KM/H",f"AIR {air:.2f} S","FINAL X",f"{float(final['x']):.1f} M","XPBD CONTACT","COURSE HEIGHTFIELD","PACEJKA GEARBOX"]
    yy=185
    for index,line in enumerate(summary):image.text(1185,yy,line,2,CYAN if index in (1,2,4) else INK);yy+=40
    points=[]
    for row in rows[::3]:points.append((int(65+float(row["t"])/12*1290),int(758-float(row["speed_mps"])/peak*105)))
    for a,b in zip(points,points[1:]):image.line(*a,*b,CYAN,3)
    image.line(65,758,1355,758,BORDER)
    for tick in (0,3,6,9,12):
        x=int(65+tick/12*1290);image.line(x,650,x,758,BORDER);image.text(x-8,770,tick,1,DIM)
    image.text(66,634,"122.9 KM/H",2,CYAN);image.text(1215,634,"BRAKE",2,ORANGE);return image

def number(row:dict[str,str], key:str, fallback:float=0.0)->float:
    try:
        return float(row.get(key, fallback))
    except (TypeError, ValueError):
        return fallback

def graph_panel(image:Raster,x:int,y:int,w:int,h:int,title:str,series:list[tuple[str,list[float],tuple[int,int,int],float|None,float|None]],rows:list[dict[str,str]],zero_mid:bool=False)->None:
    card(image,x,y,w,h,title)
    left=x+58; top=y+58; gw=w-86; gh=h-90
    image.rect(left,top,gw,gh,(11,24,39),BORDER)
    times=[number(r,"t") for r in rows]
    t0=min(times); t1=max(times); span=max(0.001,t1-t0)
    all_values=[]
    for _,vals,_,lo,hi in series:
        if lo is None or hi is None: all_values.extend(vals)
    auto_min=min(all_values) if all_values else 0.0
    auto_max=max(all_values) if all_values else 1.0
    if zero_mid:
        m=max(abs(auto_min),abs(auto_max),1.0); auto_min=-m; auto_max=m
    elif auto_min>=0.0:
        auto_min=0.0
    if abs(auto_max-auto_min)<1e-6: auto_max=auto_min+1.0
    for tick in range(5):
        yy=top+int(gh*tick/4); image.line(left,yy,left+gw,yy,(24,45,64));
    for tick in range(7):
        xx=left+int(gw*tick/6); image.line(xx,top,xx,top+gh,(24,45,64))
    for label,vals,col,lo,hi in series:
        mn=auto_min if lo is None else lo; mx=auto_max if hi is None else hi
        pts=[]
        for r,v in zip(rows,vals):
            xx=left+int((number(r,"t")-t0)/span*gw)
            yy=top+gh-int((v-mn)/max(1e-6,mx-mn)*gh)
            pts.append((xx,yy))
        for a,b in zip(pts,pts[1:]): image.line(a[0],a[1],b[0],b[1],col,2)
    legend_x=left+10; legend_y=top+10
    for label,_,col,_,_ in series:
        image.rect(legend_x,legend_y,12,12,col); image.text(legend_x+18,legend_y-2,label,1,INK); legend_y+=20
    image.text(left,top+gh+10,f"{t0:.0f}S",1,DIM); image.text(left+gw-32,top+gh+10,f"{t1:.0f}S",1,DIM)

def graphs(rows:list[dict[str,str]])->Raster:
    image=Raster(1440,1040); image.rect(30,26,1380,78,PANEL2);image.text(55,49,"PROJECT DRIVE / TELEMETRY GRAPHS",3,INK);image.text(57,78,"ACTUAL DRIVETELEMETRY CSV - VEHICLESOLVER XPBD PACEJKA AERO - 60 HZ RECORD",1,DIM)
    speed=[number(r,"speed_mps")*3.6 for r in rows]
    throttle=[number(r,"throttle") for r in rows]
    brake=[number(r,"brake") for r in rows]
    steer=[number(r,"steer") for r in rows]
    drag=[number(r,"aero_drag_N") for r in rows]
    down=[number(r,"aero_downforce_N") for r in rows]
    front=[number(r,"aero_front_N") for r in rows]
    rear=[number(r,"aero_rear_N") for r in rows]
    loads=[[number(r,f"w{i}_load_N") for r in rows] for i in range(4)]
    slip=[number(r,"w0_slip") for r in rows]
    airborne=[1.0 if r.get("airborne")=="1" else 0.0 for r in rows]
    graph_panel(image,30,128,670,260,"SPEED VS TIME",[("KM/H",speed,CYAN,None,None),("AIRBORNE",[v*max(speed) for v in airborne],ORANGE,0,max(speed) if speed else 1)],rows)
    graph_panel(image,740,128,670,260,"DRIVER INPUTS",[("THROTTLE",throttle,CYAN,0,1),("BRAKE",brake,ORANGE,0,1),("STEER",steer,BLUE,-1,1)],rows,zero_mid=True)
    graph_panel(image,30,430,670,260,"AERODYNAMICS",[("DOWNFORCE N",down,CYAN,None,None),("DRAG N",drag,ORANGE,None,None),("FRONT N",front,BLUE,None,None),("REAR N",rear,WHITE,None,None)],rows)
    graph_panel(image,740,430,670,260,"WHEEL VERTICAL LOADS",[("FL",loads[0],CYAN,None,None),("FR",loads[1],BLUE,None,None),("RL",loads[2],ORANGE,None,None),("RR",loads[3],WHITE,None,None)],rows)
    graph_panel(image,30,732,670,260,"FRONT LEFT SLIP RATIO",[("SLIP",slip,CYAN,None,None)],rows,zero_mid=True)
    graph_panel(image,740,732,670,260,"RIDE HEIGHT / AIRBORNE",[("RIDE M",[number(r,"ride_height_m") for r in rows],CYAN,None,None),("AIR",airborne,ORANGE,0,1)],rows)
    peak=max(speed) if speed else 0.0; max_drag=max(drag) if drag else 0.0; max_down=max(down) if down else 0.0
    image.text(70,1000,f"PEAK {peak:.1f} KM/H   AERO {max_down:.0f} N DOWN / {max_drag:.0f} N DRAG   CSV ROWS {len(rows)}",2,INK)
    return image

def main()->None:
    if len(sys.argv)!=2:raise SystemExit("usage: DriveEvidenceSheets.py <telemetry.csv>")
    rows=list(csv.DictReader(Path(sys.argv[1]).open()))
    if len(rows)<100 or max(float(row["speed_mps"]) for row in rows)<10:raise RuntimeError("telemetry lacks real vehicle movement")
    GALLERY.mkdir(parents=True,exist_ok=True)
    motion(rows).png(GALLERY/"ProjectDrivePhysicsMotion_CPU_Reference.png")
    graphs(rows).png(GALLERY/"ProjectDriveTelemetryGraphs_CPU_Reference.png")
    print("Rendered CPU-reference motion and telemetry graph sheets.")
if __name__=="__main__":main()
