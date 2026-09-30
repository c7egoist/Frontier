// ============================================================================================================
// ScaleSweep.cpp — CPU reference render of System B automotive flakes (Engine/Shaders/AutomotiveFlakePaint.slang)
// at a range of flake SIZES, so the flakes can be visually verified independently of any path-tracer noise.
//
//   * Uses the SAME shared shader source the GPU material evaluator includes (via CpuShader.h → MaterialEvaluation
//     .slang + AutomotiveFlakePaint.slang). This is System B (finite hash-placed flakes + footprint LOD + coat),
//     NOT System A (the sine-band AutomotiveMaterialProfiles.slang path the live kernel currently runs).
//   * The image is DETERMINISTIC and supersampled — there is no Monte-Carlo noise at all, so every speck you see
//     is a flake, never a firefly. That is the whole point of rendering it this way.
//   * A row of curved swatches goes from LARGE flakes (left) to FINE flakes (right); each swatch is labelled with
//     its flake diameter in millimetres. A near view shows discrete sparkle; a far view shows the footprint LOD
//     correctly dissolving fine flakes into a smooth metallic sheen (i.e. flakes that DON'T alias into noise).
// ============================================================================================================
#include "CpuShader.h"                 // System B: SlangCpuShim + MaterialEvaluation.slang + AutomotiveFlakePaint.slang
#include "PngWriteCounterpart.h"
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

// stbi_write_png is provided as a global inline function by PngWriteCounterpart.h.

// ------------------------------------------------------------------------------------------------------------
// Tiny 3x5 bitmap font (digits + '.') so each swatch can be labelled with its flake size, no asset dependency.
// ------------------------------------------------------------------------------------------------------------
static const char* Glyph(char c){
    switch(c){
        case '0': return "111""101""101""101""111";
        case '1': return "010""110""010""010""111";
        case '2': return "111""001""111""100""111";
        case '3': return "111""001""111""001""111";
        case '4': return "101""101""111""001""001";
        case '5': return "111""100""111""001""111";
        case '6': return "111""100""111""101""111";
        case '7': return "111""001""010""010""010";
        case '8': return "111""101""111""101""111";
        case '9': return "111""101""111""001""111";
        case '.': return "000""000""000""000""010";
        case 'm': return "000""000""111""111""101";   // stubby 'm'
        default:  return "000""000""000""000""000";   // space
    }
}
static void DrawText(std::vector<unsigned char>& px,int W,int H,int x0,int y0,const std::string& s,int sc,unsigned char r,unsigned char g,unsigned char b){
    int cx=x0;
    for(char c:s){
        const char* gm=Glyph(c);
        for(int gy=0;gy<5;++gy)for(int gx=0;gx<3;++gx){
            if(gm[gy*3+gx]!='1')continue;
            for(int sy=0;sy<sc;++sy)for(int sx=0;sx<sc;++sx){
                int X=cx+gx*sc+sx,Y=y0+gy*sc+sy;
                if(X<0||Y<0||X>=W||Y>=H)continue;
                unsigned char* d=&px[(Y*W+X)*3]; d[0]=r; d[1]=g; d[2]=b;
            }
        }
        cx+=4*sc; // 3px glyph + 1px space
    }
}

// ------------------------------------------------------------------------------------------------------------
// One curved paint swatch (ellipsoid), rendered inside a cell viewport. Reuses the exhibit's studio lights.
// ------------------------------------------------------------------------------------------------------------
struct Hit{ bool hit; vec3 P; vec3 N; vec3 V; vec2 UV; };
static Hit Intersect(vec2 ndc,float distance){
    Hit h; h.hit=false; h.P=vec3(0.f); h.N=vec3(0,0,1); h.V=h.N; h.UV=vec2(0.f);
    vec3 eye=distance*vec3(sinf(0.10f),0.16f,cosf(0.10f));
    vec3 forward=normalize(vec3(0.f)-eye), right=normalize(cross(forward,vec3(0,1,0))), up=cross(right,forward);
    vec3 ray=normalize(forward+right*(ndc.x*0.34f)+up*(ndc.y*0.34f));
    vec3 radius(0.070f,0.052f,0.030f), o=vec3(eye.x/radius.x,eye.y/radius.y,eye.z/radius.z), d(ray.x/radius.x,ray.y/radius.y,ray.z/radius.z);
    float a=dot(d,d), b=dot(o,d), c=dot(o,o)-1.f, disc=b*b-a*c;
    if(disc<0.f) return h;
    float t=(-b-sqrtf(disc))/a; if(t<=0.f) return h;
    h.hit=true; h.P=eye+ray*t; h.N=normalize(vec3(h.P.x/(radius.x*radius.x),h.P.y/(radius.y*radius.y),h.P.z/(radius.z*radius.z))); h.V=vec3(0.f)-ray; h.UV=vec2(h.P.x,h.P.y);
    return h;
}
static vec3 Local(vec3 x,vec3 n,vec3 t,vec3 b){ return vec3(dot(x,t),dot(x,b),dot(x,n)); }

static vec3 Shade(vec2 pix,vec2 res,const AutomotivePaintParameters& p,const AutomotiveFlakePalette& pal,float distance){
    vec2 ndc((pix.x/res.x*2.f-1.f)*res.x/res.y, pix.y/res.y*2.f-1.f);
    Hit hit=Intersect(ndc,distance);
    if(!hit.hit){ float vig=1.f-length(vec2(pix.x/res.x-0.5f,pix.y/res.y-0.5f)); return vec3(0.02f,0.024f,0.03f)*std::max(0.35f,vig); }
    // UV derivatives (footprint) from screen neighbours — this is what drives System B's LOD.
    Hit hx=Intersect(vec2((( (pix.x+1.f)/res.x)*2.f-1.f)*res.x/res.y, ndc.y),distance);
    Hit hy=Intersect(vec2(ndc.x, ((pix.y+1.f)/res.y)*2.f-1.f),distance);
    vec2 dx=hx.hit?vec2(hx.UV.x-hit.UV.x,hx.UV.y-hit.UV.y):vec2(0.01f);
    vec2 dy=hy.hit?vec2(hy.UV.x-hit.UV.x,hy.UV.y-hit.UV.y):vec2(0.01f);
    AutomotiveFlakeSurface s=AutomotiveApplyFlakePalette(AutomotivePrepareFlakes(p,hit.UV,dx,dy),pal);
    vec3 n=hit.N, t=normalize(vec3(1,0,0)-n*n.x), b=cross(n,t);
    vec3 v=Local(hit.V,n,t,b);
    float coverage=mix(s.Weight,s.MeanWeight,s.Unresolved);
    vec3 colour=p.Pigment*(0.16f*(1.f-coverage))*(1.f-FresnelDielectric(v.z,1.5f))*mix(vec3(1.f),AutomotiveCoatTint(p),APRange(p.CoatWeight,0.f,1.f));
    for(int box=0;box<2;++box)for(int y=0;y<12;++y)for(int x=0;x<8;++x){
        float u=(float(x)+0.5f)/8.f-0.5f, w=(float(y)+0.5f)/12.f-0.5f;
        vec3 light=box==0?vec3(-0.38f+u*1.05f,0.52f+w*0.30f,1.15f):vec3(0.8f+u*0.25f,-0.15f+w*1.05f,0.85f);
        vec3 dir=normalize(light);
        vec3 l=Local(dir,n,t,b);
        vec3 rad=box==0?vec3(46.f,40.f,32.f):vec3(12.f,17.f,26.f);
        float area=box==0?0.315f:0.2625f;
        float omega=area*std::fabs(dir.z)/(dot(light,light)*96.f);
        colour+=AutomotiveEvaluatePaint(p,s,v,l)*rad*(std::max(0.f,l.z)*omega);
    }
    return colour;
}
static vec3 Tonemap(vec3 x){ x=x*1.6f; x=clamp((x*(x*2.51f+vec3(0.03f)))/(x*(x*2.43f+vec3(0.59f))+vec3(0.14f)),vec3(0.f),vec3(1.f)); return pow(x,vec3(1.f/2.2f)); }

// ------------------------------------------------------------------------------------------------------------
// A full contact sheet: N swatches across, flake diameter large -> small, labelled, at one view distance.
// ------------------------------------------------------------------------------------------------------------
static void RenderSheet(const std::string& path,float distance,bool rgbFlakes,int spp){
    const int cells=8;
    const int cellW=190, cellH=430, pad=6, labelH=54;
    const int W=cells*cellW, H=cellH+labelH;
    const float diam[cells]={2.0f,1.2f,0.75f,0.45f,0.28f,0.16f,0.09f,0.05f};
    const char* lab[cells]={"2.0","1.2","0.75","0.45","0.28","0.16","0.09","0.05"};

    std::vector<unsigned char> px(W*H*3, 18);
    AutomotiveFlakePalette pal = rgbFlakes ? AutomotiveRgbPalette() : AutomotivePaletteDefaults();

    std::atomic<int> nextCol{0};
    auto work=[&](){
        int cell;
        while((cell=nextCol.fetch_add(1))<cells){
            AutomotivePaintParameters p=AutomotivePaintDefaults();
            p.DiameterMm=diam[cell];
            p.Density=2.4f;               // same density for every swatch — only the SIZE changes across the row
            p.NormalSpread=0.26f;
            p.FlakeRoughness=0.05f;
            p.CoatRoughness=0.22f;
            p.Pigment=vec3(0.015f,0.03f,0.09f);
            int ox=cell*cellW;
            for(int y=0;y<cellH;++y)for(int x=0;x<cellW;++x){
                vec3 c(0.f);
                for(int sy=0;sy<spp;++sy)for(int sx=0;sx<spp;++sx){
                    vec2 pixel(x+pad+(sx+0.5f)/spp, (cellH-1-y)+(sy+0.5f)/spp);
                    c+=Shade(pixel,vec2(float(cellW),float(cellH)),p,pal,distance);
                }
                c=Tonemap(c*(1.f/float(spp*spp)));
                unsigned char* d=&px[((y)*W+(ox+x))*3];
                d[0]=(unsigned char)(std::min(1.f,c.x)*255+0.5f);
                d[1]=(unsigned char)(std::min(1.f,c.y)*255+0.5f);
                d[2]=(unsigned char)(std::min(1.f,c.z)*255+0.5f);
            }
            // label band
            DrawText(px,W,H,ox+18,cellH+10,lab[cell],5,235,235,235);
            DrawText(px,W,H,ox+18+ (int)std::string(lab[cell]).size()*20 +6, cellH+10,"mm",4,150,160,175);
        }
    };
    unsigned nt=std::max(1u,std::thread::hardware_concurrency());
    std::vector<std::thread> pool; for(unsigned i=0;i<nt;++i)pool.emplace_back(work); for(auto&t:pool)t.join();

    if(!stbi_write_png(path.c_str(),W,H,3,px.data(),W*3)){ std::fprintf(stderr,"PNG write failed: %s\n",path.c_str()); return; }
    std::printf("wrote %s  (%dx%d, %d spp, distance %.2f)\n",path.c_str(),W,H,spp*spp,distance);
}

int main(int argc,char** argv){
    std::string out = argc>1?argv[1]:".";
    int spp = argc>2?std::atoi(argv[2]):3;
    RenderSheet(out+"/FlakeScaleSweep_Near.png", 0.14f, true,  spp);   // colour flakes, close: discrete sparkle, big->small
    RenderSheet(out+"/FlakeScaleSweep_Far.png",  0.34f, true,  spp);   // same, far: footprint LOD blends fine flakes to sheen
    RenderSheet(out+"/FlakeScaleSweep_Silver.png",0.14f,false, spp);   // stock silver metallic, close
    return 0;
}
