#!/usr/bin/env python3
"""A dependency-free raster: the pixel typeface, palette and PNG encoder the Drive sheets draw with.

Slate has no numpy and no PIL, and a proof that cannot be re-run is not a proof, so the plotting sheets are
written with the standard library alone.  Nothing here models or renders anything about the product — it sets
pixels, draws lines and deflates an RGB PNG.  The numbers it draws come from the engine.
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

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
