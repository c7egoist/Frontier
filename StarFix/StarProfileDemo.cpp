// ============================================================================================================
// StarProfileDemo.cpp — reproduces the "blocky / pixelated stars" artefact and demonstrates the fix.
//
// The engine draws each star with a FLAT-TOP disc (Core = 1.0 for Angle <= Radius) sized to ~half a RENDER
// pixel, with a hard cut at 1.6*Radius (Engine/Shaders/PostRecords.slang StarAlong + the mirror in
// Engine/GeometricRaster/VisibilityRaster.cpp). Consequences:
//   * the flat top + hard cut = a hard-edged disc, point-sampled once per pixel -> aliased square edges;
//   * the radius is tied to the RENDER pixel, so on reduced-resolution tiers (Minimal/Economy render at 0.5x
//     and upscale) a ~1-render-pixel star becomes a 2x2+ hard block on screen;
//   * bright stars' peak (Lum * 5.73) clips through the tone map to solid white -> solid white SQUARES.
//
// The proposed fix (implemented here as NewProfile, and mirrored into the two engine files) replaces the
// flat-top disc with a smooth, energy-preserving Gaussian point-spread whose sigma is >= ~0.9 render pixels
// (so it always spans a pixel smoothly and never shows a hard edge) and grows gently with brightness so bright
// stars BLOOM softly instead of clipping to a block. Total flux is matched to the old profile so the faint-end
// calibration (the 5.73 normalisation) is preserved.
//
// Output: Stars_Compare.png — a 2x2 contact sheet: OLD vs NEW, each at native res and at 0.5x-upscaled
// (the reduced-resolution tier that makes the blocks worst).
// ============================================================================================================
#include "PngWriteCounterpart.h"
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <random>
#include <string>
#include <vector>

using PngWriteCounterpart::WritePng; // (unused alias guard)

static const float kPi = 3.14159265358979323846f;

struct Star { float x, y; float lum; float r,g,b; };

// ---- tiny 3x5 font (reuse) ----
static const char* Glyph(char c){switch(c){
 case 'O':return "111""101""101""101""111";case 'L':return "100""100""100""100""111";case 'D':return "110""101""101""101""110";
 case 'N':return "101""111""111""111""101";case 'E':return "111""100""110""100""111";case 'W':return "101""101""101""111""101";
 case 'A':return "111""101""111""101""101";case 'T':return "111""010""010""010""010";case 'I':return "111""010""010""010""111";
 case 'V':return "101""101""101""101""010";case 'x':return "000""101""010""101""000";case '5':return "111""100""111""001""111";
 case '0':return "111""101""101""101""111";case '.':return "000""000""000""000""010";case '(':return "010""100""100""100""010";
 case ')':return "010""001""001""001""010";case 'U':return "101""101""101""101""111";case 'P':return "111""101""111""100""100";
 case 'C':return "111""100""100""100""111";case 'R':return "111""101""111""110""101";case 'S':return "111""100""111""001""111";
 default:return "000""000""000""000""000";}}
static void Text(std::vector<unsigned char>&px,int W,int H,int x0,int y0,const std::string&s,int sc,unsigned char R,unsigned char G,unsigned char B){
 int cx=x0;for(char c:s){const char*g=Glyph(c);for(int gy=0;gy<5;++gy)for(int gx=0;gx<3;++gx){if(g[gy*3+gx]!='1')continue;
 for(int sy=0;sy<sc;++sy)for(int sx=0;sx<sc;++sx){int X=cx+gx*sc+sx,Y=y0+gy*sc+sy;if(X<0||Y<0||X>=W||Y>=H)continue;unsigned char*d=&px[(Y*W+X)*3];d[0]=R;d[1]=G;d[2]=B;}}cx+=4*sc;}}

static float AcesF(float x){float a=2.51f,b=0.03f,c=2.43f,d=0.59f,e=0.14f;float y=(x*(a*x+b))/(x*(c*x+d)+e);return y<0?0:(y>1?1:y);}
static void Tonemap(float&r,float&g,float&b){r*=1.1f;g*=1.1f;b*=1.1f;r=std::pow(AcesF(r),1/2.2f);g=std::pow(AcesF(g),1/2.2f);b=std::pow(AcesF(b),1/2.2f);}

// OLD engine profile: flat-top disc + narrow gaussian skirt, hard cut at 1.6*Radius.
static float OldCore(float angle,float pixelAngle,float starSize){
 float R=std::fmax(starSize*0.0002f,pixelAngle*0.5f);
 if(angle>R*1.6f)return -1.f;
 float fall=(angle-R)/(R*0.35f);
 return angle<=R?1.0f:std::exp(-fall*fall);
}
// NEW profile: smooth energy-preserving gaussian PSF, sigma >= ~0.9 px, magnitude-aware soft bloom.
static const float kOldArea=1.727f; // Omega_old / (pi*R^2) for the flat-top+skirt profile (derived analytically)
static float NewCore(float angle,float pixelAngle,float starSize,float appMag){
 float refR=std::fmax(starSize*0.0002f,pixelAngle*0.5f);            // the OLD radius (calibration reference)
 float sigma=std::fmax(starSize*0.0002f,pixelAngle*0.9f);          // never a sub-pixel hard disc
 float bloom=1.0f+0.55f*std::log2(1.0f+std::fmax(appMag,0.0f));    // bright stars spread, faint stars stay tight
 if(bloom<1.0f)bloom=1.0f; if(bloom>3.0f)bloom=3.0f; sigma*=bloom;
 if(angle>3.0f*sigma)return -1.f;
 float fluxTarget=(kPi*refR*refR*kOldArea)*5.73f;                  // match the old profile's total flux (+5.73 gain)
 float peak=fluxTarget/(2.0f*kPi*sigma*sigma);
 return peak*std::exp(-0.5f*angle*angle/(sigma*sigma));
}

// Render a star field patch into a buffer of size (w,h), then return it. useNew selects the profile.
static std::vector<float> RenderField(const std::vector<Star>&stars,int w,int h,float pixelAngle,bool useNew,float renderScale){
 std::vector<float> img(w*h*3,0.f);
 for(const Star&S:stars){
  float sx=S.x*renderScale, sy=S.y*renderScale;
  float appMag=S.lum;
  float reach = useNew ? 3.0f*std::fmax(std::fmax(1e-6f,0)*0,std::fmax(0.0f,0)) : 0;
  // conservative bounding box in pixels
  float sigmaPx = useNew ? (std::fmax(0.9f,0.9f)* (1.0f+0.55f*std::log2(1.0f+std::fmax(appMag,0.f)))) : 0.8f;
  int rad = useNew ? (int)std::ceil(3.0f*sigmaPx)+1 : 2;
  (void)reach;
  int x0=(int)std::floor(sx)-rad, x1=(int)std::floor(sx)+rad;
  int y0=(int)std::floor(sy)-rad, y1=(int)std::floor(sy)+rad;
  for(int y=y0;y<=y1;++y)for(int x=x0;x<=x1;++x){
   if(x<0||y<0||x>=w||y>=h)continue;
   float dpx=(x+0.5f)-sx, dpy=(y+0.5f)-sy;
   float angle=std::sqrt(dpx*dpx+dpy*dpy)*pixelAngle;
   float core = useNew?NewCore(angle,pixelAngle,1.0f,appMag):OldCore(angle,pixelAngle,1.0f);
   if(core<0)continue;
   float gain=S.lum*core; // StarBrightness=1
   img[(y*w+x)*3+0]+=S.r*gain; img[(y*w+x)*3+1]+=S.g*gain; img[(y*w+x)*3+2]+=S.b*gain;
  }
 }
 return img;
}

// Blit a linear buffer (native or low-res upscaled with NEAREST) into the RGB8 sheet at (ox,oy).
static void Blit(std::vector<unsigned char>&sheet,int SW,int SH,int ox,int oy,int panelW,int panelH,
                 const std::vector<float>&src,int sw,int sh){
 for(int y=0;y<panelH;++y)for(int x=0;x<panelW;++x){
  int srcx=(int)((float)x/panelW*sw), srcy=(int)((float)y/panelH*sh);
  if(srcx>=sw)srcx=sw-1; if(srcy>=sh)srcy=sh-1;
  float r=src[(srcy*sw+srcx)*3+0],g=src[(srcy*sw+srcx)*3+1],b=src[(srcy*sw+srcx)*3+2];
  Tonemap(r,g,b);
  int X=ox+x,Y=oy+y; if(X<0||Y<0||X>=SW||Y>=SH)continue;
  unsigned char*d=&sheet[(Y*SW+X)*3];
  d[0]=(unsigned char)(std::fmin(1.f,r)*255+.5f);d[1]=(unsigned char)(std::fmin(1.f,g)*255+.5f);d[2]=(unsigned char)(std::fmin(1.f,b)*255+.5f);
 }
}

int main(int argc,char**argv){
 std::string out=argc>1?argv[1]:".";
 const int PW=460,PH=380;              // panel (display) size
 const float FOV=14.0f*kPi/180.f;      // narrow patch so stars are well separated
 const float pixelAngle=FOV/PH;        // display-pixel angular size
 // Star field
 std::mt19937 rng(1234); std::uniform_real_distribution<float> U(0,1);
 std::vector<Star> stars;
 for(int i=0;i<260;++i){
  Star s; s.x=U(rng)*PW; s.y=U(rng)*PH;
  float mag=-1.5f+6.5f*std::pow(U(rng),0.6f);           // more faint than bright
  s.lum=std::pow(10.f,-0.4f*mag);
  float t=U(rng); // colour temperature-ish tint
  if(t<0.5f){s.r=0.75f;s.g=0.85f;s.b=1.0f;}             // blue-white
  else if(t<0.8f){s.r=1.0f;s.g=1.0f;s.b=0.96f;}         // white
  else {s.r=1.0f;s.g=0.82f;s.b=0.62f;}                  // orange
  stars.push_back(s);
 }
 // A few deliberately bright showpiece stars
 for(int i=0;i<5;++i){Star s;s.x=(0.2f+0.15f*i)*PW;s.y=(0.3f+0.08f*i)*PH;s.lum=std::pow(10.f,-0.4f*(-1.2f-0.5f*(float)(i%3)));s.r=1;s.g=0.95f;s.b=0.9f;stars.push_back(s);}

 // Four fields: OLD native, NEW native, OLD 0.5x->upscaled, NEW 0.5x->upscaled.
 auto oldN=RenderField(stars,PW,PH,pixelAngle,false,1.0f);
 auto newN=RenderField(stars,PW,PH,pixelAngle,true ,1.0f);
 int lw=PW/2,lh=PH/2; float lowPixelAngle=pixelAngle*2.0f;
 auto oldL=RenderField(stars,lw,lh,lowPixelAngle,false,0.5f);
 auto newL=RenderField(stars,lw,lh,lowPixelAngle,true ,0.5f);

 const int gap=8,lab=26;
 const int SW=PW*2+gap*3, SH=(PH+lab)*2+gap*3;
 std::vector<unsigned char> sheet(SW*SH*3,10);
 int cx0=gap, cx1=gap*2+PW, ry0=gap, ry1=gap*2+PH+lab;
 Text(sheet,SW,SH,cx0+4,ry0+2,"OLD (FLAT DISC) NATIVE",3,235,235,235);
 Text(sheet,SW,SH,cx1+4,ry0+2,"NEW (SOFT PSF) NATIVE",3,180,255,190);
 Blit(sheet,SW,SH,cx0,ry0+lab,PW,PH,oldN,PW,PH);
 Blit(sheet,SW,SH,cx1,ry0+lab,PW,PH,newN,PW,PH);
 Text(sheet,SW,SH,cx0+4,ry1+2,"OLD 0.5x UPSCALED",3,235,235,235);
 Text(sheet,SW,SH,cx1+4,ry1+2,"NEW 0.5x UPSCALED",3,180,255,190);
 Blit(sheet,SW,SH,cx0,ry1+lab,PW,PH,oldL,lw,lh);
 Blit(sheet,SW,SH,cx1,ry1+lab,PW,PH,newL,lw,lh);

 std::string path=out+"/Stars_Compare.png";
 if(!stbi_write_png(path.c_str(),SW,SH,3,sheet.data(),SW*3)){std::fprintf(stderr,"write failed\n");return 1;}
 std::printf("wrote %s (%dx%d)\n",path.c_str(),SW,SH);
 return 0;
}
