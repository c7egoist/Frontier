//============================================================================================================================================
//  ReflectReSTIR.cpp — roadmap #27: "sky as a reservoir candidate" for GLOSSY REFLECTIONS
//============================================================================================================================================
//  The measured residual §14.5/§14.6 named: the SKY / glass-specular class carries the largest excess variance. This is the
//  cheap ReSTIR extension that targets it — reflection reuse. It is NOT a new system: it reuses the reservoir + RIS + spatial-
//  merge machinery ReSTIR already has, applied to the glossy reflection lobe instead of the diffuse light pool, and it adds the
//  SUN/SKY as an explicit reservoir candidate so bright environment features stop being found only by luck.
//
//  What this proves on the CPU (no GPU needed): at ~1 effective sample, RIS + sky-candidate + spatial reuse beats plain 1-spp
//  BRDF sampling by a large RMSE margin on exactly the specular-sky class, at the cost of a few cheap reuse passes.
//
//  Scene: a glossy ground plane, roughness ramping near->far, under a sky dome carrying a bright SUN DISC (the sharp feature a
//  glossy surface must reflect — the source of the variance). Three images are written:
//     reflect_baseline.ppm   1-spp GGX BRDF sampling            (the noisy status quo)
//     reflect_restir.ppm     RIS(M) + sky candidate + K spatial (the proposed reuse)
//     reflect_reference.ppm  512-spp MIS ground truth
//  and the RMSE of each against the reference is printed.
//
//  Build:  g++ -O2 -std=c++17 -pthread ReflectReSTIR.cpp -o reflectrestir
//  Run:    ./reflectrestir --w 640 --h 400 --M 8 --spatial 3 --neighbors 5 --ref 512
//============================================================================================================================================
#include <cstdio>
#include <cstdint>
#include <cmath>
#include <vector>
#include <string>
#include <thread>
#include <algorithm>

static const float PI=3.14159265358979f;
struct V{ float x=0,y=0,z=0; };
static inline V operator+(V a,V b){return{a.x+b.x,a.y+b.y,a.z+b.z};}
static inline V operator-(V a,V b){return{a.x-b.x,a.y-b.y,a.z-b.z};}
static inline V operator*(V a,float s){return{a.x*s,a.y*s,a.z*s};}
static inline V operator*(V a,V b){return{a.x*b.x,a.y*b.y,a.z*b.z};}
static inline float dot(V a,V b){return a.x*b.x+a.y*b.y+a.z*b.z;}
static inline V cross(V a,V b){return{a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
static inline float len(V a){return std::sqrt(dot(a,a));}
static inline V norm(V a){float l=len(a);return l>0?a*(1.0f/l):a;}
static inline float lum(V c){return 0.2126f*c.x+0.7152f*c.y+0.0722f*c.z;}

// ---- RNG (PCG-ish) ----
struct RNG{ uint64_t s; RNG(uint64_t seed):s(seed?seed:0x9e3779b97f4a7c15ull){}
    inline uint32_t u(){ s^=s<<13; s^=s>>7; s^=s<<17; return (uint32_t)(s>>11); }
    inline float f(){ return (u()>>8)*(1.0f/16777216.0f); } };

// ---- environment: sky dome with a bright sun disc (the sharp feature glossy surfaces must reflect) ----
static const V SUN_DIR=norm(V{0.28f,0.62f,0.73f});
static const float SUN_COS=0.99966f;              // cos(~1.5 deg) — the sun's angular radius
static inline V skyEnv(V dir){
    float t=std::max(0.0f,dir.y);
    V zenith{0.30f,0.50f,0.95f}, horizon{0.90f,0.92f,0.98f}, ground{0.20f,0.19f,0.18f};
    V col = dir.y<0 ? ground : horizon*(1.0f-t)+zenith*t;
    float s=dot(dir,SUN_DIR);
    if(s>=SUN_COS) col=col+V{1.0f,0.96f,0.88f}*60.0f;          // the sun disc — very bright, small
    else if(s>0)   col=col+V{1.0f,0.96f,0.88f}*(std::pow(std::max(0.0f,s),40.0f)*0.6f);  // aureole
    return col;
}
// solid angle of the sun cone, and the uniform pdf inside it
static const float SUN_SOLID = 2.0f*PI*(1.0f-SUN_COS);
static inline float sunPdf(V dir){ return dot(dir,SUN_DIR)>=SUN_COS ? 1.0f/SUN_SOLID : 0.0f; }
static inline V sampleSun(RNG& r){
    float u1=r.f(),u2=r.f();
    float ct=1.0f-u1*(1.0f-SUN_COS), st=std::sqrt(std::max(0.0f,1-ct*ct)), ph=2*PI*u2;
    V w=SUN_DIR; V a=std::fabs(w.x)<0.9f?V{1,0,0}:V{0,1,0}; V tx=norm(cross(a,w)); V ty=cross(w,tx);
    return norm(tx*(st*std::cos(ph))+ty*(st*std::sin(ph))+w*ct);
}

// ---- GGX (isotropic) reflection BRDF over a surface with normal N and view wo (both unit, pointing away from surface) ----
static inline float ggxD(float ndoth,float a){ float a2=a*a; float d=(ndoth*ndoth*(a2-1)+1); return a2/std::max(1e-8f,PI*d*d); }
static inline float smithG1(float ndotv,float a){ float a2=a*a; return 2*ndotv/std::max(1e-8f,ndotv+std::sqrt(a2+(1-a2)*ndotv*ndotv)); }
static inline float fresnel(float c){ float m=std::pow(std::max(0.0f,1-c),5.0f); return 0.04f+0.96f*m; }
// sample a half vector, return the reflected direction wi; also its pdf
static inline V sampleGGX(V N,V wo,float a,RNG& r,float& pdf){
    float u1=r.f(),u2=r.f();
    float ct=std::sqrt((1-u1)/std::max(1e-6f,1+(a*a-1)*u1)), st=std::sqrt(std::max(0.0f,1-ct*ct)), ph=2*PI*u2;
    V ax=std::fabs(N.x)<0.9f?V{1,0,0}:V{0,1,0}; V tx=norm(cross(ax,N)); V ty=cross(N,tx);
    V H=norm(tx*(st*std::cos(ph))+ty*(st*std::sin(ph))+N*ct);
    V wi=norm(H*(2*dot(wo,H))-wo);
    float ndoth=std::max(0.0f,dot(N,H)), voh=std::max(1e-4f,dot(wo,H));
    pdf = ggxD(ndoth,a)*ndoth/(4*voh);
    return wi;
}
static inline float ggxPdf(V N,V wo,V wi,float a){
    V H=norm(wo+wi); float ndoth=std::max(0.0f,dot(N,H)), voh=std::max(1e-4f,dot(wo,H));
    return ggxD(ndoth,a)*ndoth/(4*voh);
}
// f_r * cos, as an RGB integrand weight for a reflection sample wi
static inline V brdfCos(V N,V wo,V wi,float a){
    float ndotl=dot(N,wi), ndotv=dot(N,wo); if(ndotl<=0||ndotv<=0) return {0,0,0};
    V H=norm(wo+wi); float ndoth=std::max(0.0f,dot(N,H)), voh=std::max(0.0f,dot(wo,H));
    float D=ggxD(ndoth,a), G=smithG1(ndotv,a)*smithG1(ndotl,a), F=fresnel(voh);
    float v=D*G*F/std::max(1e-6f,4*ndotv*ndotl);
    return V{v,v,v}*ndotl;
}
// MIS pdf a reflection sample would have under our two-source candidate distribution
static inline float misPdf(V N,V wo,V wi,float a){ return 0.5f*ggxPdf(N,wo,wi,a)+0.5f*sunPdf(wi); }

// integrand value L*f_r*cos (RGB) for a reflection sample
static inline V integrand(V N,V wo,V wi,float a){ V fc=brdfCos(N,wo,wi,a); if(fc.x<=0&&fc.y<=0&&fc.z<=0) return {0,0,0}; return skyEnv(wi)*fc; }

// ---- reservoir (RIS) ----
struct Res{ V y{0,1,0}; V Fy{0,0,0}; float phat=0; float wsum=0; float M=0; };
static inline void update(Res& R, V y, V Fy, float w, RNG& r){
    R.wsum+=w; R.M+=1; if(w>0 && r.f() < w/R.wsum){ R.y=y; R.Fy=Fy; R.phat=lum(Fy); }
}

// ---- camera / plane geometry: a glossy floor viewed at a grazing-ish angle ----
struct Cam{ V eye,fwd,right,up; float tanH,aspect; };
static Cam makeCam(int W,int H){ Cam c; c.eye={0,1.6f,-4.2f}; V tgt{0,0.0f,1.5f};
    c.fwd=norm(tgt-c.eye); V wup{0,1,0}; c.right=norm(cross(c.fwd,wup)); c.up=cross(c.right,c.fwd);
    c.tanH=std::tan(0.5f*33.0f*PI/180.0f); c.aspect=(float)W/H; return c; }
static inline V rayDir(const Cam& c,float px,float py,int W,int H){
    float u=(2*(px+0.5f)/W-1)*c.tanH*c.aspect, v=(1-2*(py+0.5f)/H)*c.tanH;
    return norm(c.fwd + c.right*u + c.up*v);
}
// hit the y=0 plane; roughness ramps with distance (near sharp -> far rough), which is where specular sky variance lives
static inline bool hitFloor(const Cam& c,V rd,V& P,V& N,float& a){
    if(rd.y>=-1e-4f) return false; float t=-c.eye.y/rd.y; if(t<=0) return false;
    P=c.eye+rd*t; N={0,1,0}; float d=len(P-c.eye); a=std::min(0.45f,std::max(0.03f,0.03f+0.03f*d)); return true;
}

static void writePPM(const char* fn,const std::vector<V>& img,int W,int H){
    // ACES-ish tonemap + gamma
    auto tm=[](float x){ x=std::max(0.0f,x); float a=2.51f,b=0.03f,c=2.43f,d=0.59f,e=0.14f; return (x*(a*x+b))/(x*(c*x+d)+e); };
    FILE* f=fopen(fn,"wb"); fprintf(f,"P6\n%d %d\n255\n",W,H);
    for(int i=0;i<W*H;++i){ V c=img[i]; float r=std::pow(std::min(1.0f,tm(c.x)),1/2.2f),g=std::pow(std::min(1.0f,tm(c.y)),1/2.2f),b=std::pow(std::min(1.0f,tm(c.z)),1/2.2f);
        unsigned char o[3]={(unsigned char)(r*255+0.5f),(unsigned char)(g*255+0.5f),(unsigned char)(b*255+0.5f)}; fwrite(o,1,3,f); }
    fclose(f);
}
template<class F> static void par(int n,F fn){ unsigned T=std::max(1u,std::thread::hardware_concurrency()); std::vector<std::thread> th;
    for(unsigned t=0;t<T;++t) th.emplace_back([&,t]{ for(int i=t;i<n;i+=T) fn(i); }); for(auto&x:th)x.join(); }

int main(int argc,char**argv){
    int W=640,H=400,M=8,SPATIAL=3,NEI=5,REF=512;
    for(int i=1;i<argc;++i){ std::string s=argv[i]; auto nx=[&](int d){return i+1<argc?atoi(argv[++i]):d;};
        if(s=="--w")W=nx(W); else if(s=="--h")H=nx(H); else if(s=="--M")M=nx(M);
        else if(s=="--spatial")SPATIAL=nx(SPATIAL); else if(s=="--neighbors")NEI=nx(NEI); else if(s=="--ref")REF=nx(REF); }
    Cam cam=makeCam(W,H);
    std::vector<V> gP(W*H),gN(W*H),gWo(W*H); std::vector<float> gA(W*H,-1); std::vector<uint8_t> valid(W*H,0);
    par(W*H,[&](int i){ int x=i%W,y=i/W; V rd=rayDir(cam,x,y,W,H); V P,N; float a;
        if(hitFloor(cam,rd,P,N,a)){ gP[i]=P; gN[i]=N; gWo[i]=norm(cam.eye-P); gA[i]=a; valid[i]=1; } });

    // ---------- REFERENCE: 512-spp MIS (GGX + sun) ground truth ----------
    std::vector<V> ref(W*H,{0,0,0});
    par(W*H,[&](int i){ if(!valid[i]){ ref[i]=skyEnv(rayDir(cam,i%W,i/W,W,H)); return; }
        V N=gN[i],wo=gWo[i]; float a=gA[i]; RNG r(0xABCDu+i*2654435761u); V acc{0,0,0};
        for(int s=0;s<REF;++s){
            // MIS between GGX and sun sampling
            if((s&1)==0){ float pdf; V wi=sampleGGX(N,wo,a,r,pdf); if(dot(N,wi)>0&&pdf>0){ V I=integrand(N,wo,wi,a); float w=pdf/std::max(1e-8f,misPdf(N,wo,wi,a)); acc=acc+I*(w/pdf); } }
            else { V wi=sampleSun(r); float pdf=sunPdf(wi); if(dot(N,wi)>0&&pdf>0){ V I=integrand(N,wo,wi,a); float w=pdf/std::max(1e-8f,misPdf(N,wo,wi,a)); acc=acc+I*(w/pdf); } }
        }
        ref[i]=acc*(2.0f/REF); });    // 2/REF: half the samples per technique

    // ---------- BASELINE: 1-spp GGX BRDF sampling ----------
    std::vector<V> base(W*H,{0,0,0});
    par(W*H,[&](int i){ if(!valid[i]){ base[i]=skyEnv(rayDir(cam,i%W,i/W,W,H)); return; }
        V N=gN[i],wo=gWo[i]; float a=gA[i]; RNG r(0x1234u+i*40503u);
        float pdf; V wi=sampleGGX(N,wo,a,r,pdf); if(dot(N,wi)>0&&pdf>0) base[i]=integrand(N,wo,wi,a)*(1.0f/pdf); });

    // ---------- ReSTIR: RIS(M) with the SKY as an explicit candidate, then K spatial-reuse passes ----------
    std::vector<Res> cur(W*H), nxt(W*H);
    par(W*H,[&](int i){ if(!valid[i]) return;
        V N=gN[i],wo=gWo[i]; float a=gA[i]; RNG r(0x55AAu+i*2246822519u); Res R;
        for(int k=0;k<M;++k){
            V wi; if(k<M/2){ float pdf; wi=sampleGGX(N,wo,a,r,pdf); }   // BRDF candidate
            else          { wi=sampleSun(r); }                          // SKY/SUN candidate (the new one)
            if(dot(N,wi)<=0){ R.M+=1; continue; }
            V I=integrand(N,wo,wi,a); float phat=lum(I); float pm=misPdf(N,wo,wi,a);
            float w = pm>0 ? phat/pm : 0.0f; update(R,wi,I,w,r);
        }
        R.phat=lum(R.Fy); cur[i]=R; });

    // spatial reuse passes (also stands in for temporal on a static frame): merge NEI neighbours, reweighting to THIS pixel
    for(int pass=0; pass<SPATIAL; ++pass){
        par(W*H,[&](int i){ if(!valid[i]) return; int x=i%W,y=i/W;
            V N=gN[i],wo=gWo[i]; float a=gA[i]; RNG r(0x777u+i*2654435761u + pass*0x9e37u);
            Res R; // start from self
            { Res& s=cur[i]; R=s; }
            for(int n=0;n<NEI;++n){ int dx=(int)(r.f()*21)-10, dy=(int)(r.f()*21)-10; int nx=x+dx,ny=y+dy;
                if(nx<0||ny<0||nx>=W||ny>=H) continue; int j=ny*W+nx; if(!valid[j]) continue;
                Res& S=cur[j]; if(S.M<=0||S.phat<=0) continue;
                // reweight neighbour's sample direction to the current pixel's BRDF/geometry
                V wi=S.y; if(dot(N,wi)<=0) continue; V I=integrand(N,wo,wi,a); float phatCur=lum(I);
                float w = phatCur * (S.wsum/std::max(1e-8f,S.phat*S.M)) * S.M;   // = phatCur * W_n * M_n
                R.wsum+=w; R.M+=S.M; if(w>0 && r.f() < w/R.wsum){ R.y=wi; R.Fy=I; R.phat=phatCur; }
            }
            // cap M growth (bounded reuse, mirrors the temporal M clamp)
            if(R.M>(float)(M*20)){ R.wsum*=(float)(M*20)/R.M; R.M=(float)(M*20); }
            nxt[i]=R; });
        std::swap(cur,nxt);
    }
    std::vector<V> restir(W*H,{0,0,0});
    par(W*H,[&](int i){ if(!valid[i]){ restir[i]=skyEnv(rayDir(cam,i%W,i/W,W,H)); return; }
        Res& R=cur[i]; if(R.phat>0 && R.M>0){ float Wt=R.wsum/(R.M*R.phat); restir[i]=R.Fy*Wt; } });

    writePPM("reflect_reference.ppm",ref,W,H);
    writePPM("reflect_baseline.ppm",base,W,H);
    writePPM("reflect_restir.ppm",restir,W,H);

    // ---------- RMSE vs reference (linear HDR, floor pixels only) ----------
    auto rmse=[&](const std::vector<V>& im){ double acc=0; long n=0; for(int i=0;i<W*H;++i){ if(!valid[i])continue; V e=im[i]-ref[i]; acc+=(double)dot(e,e); n+=3; } return std::sqrt(acc/std::max(1L,n)); };
    double rb=rmse(base), rr=rmse(restir);
    printf("[ReflectReSTIR] %dx%d  M=%d spatial=%d neighbors=%d  ref=%d spp\n",W,H,M,SPATIAL,NEI,REF);
    printf("  baseline (1-spp GGX)        RMSE vs ref = %.4f\n", rb);
    printf("  ReSTIR   (RIS+sky+spatial)  RMSE vs ref = %.4f\n", rr);
    printf("  ==> %.2fx lower error at ~1 effective sample\n", rb/std::max(1e-9,rr));
    return 0;
}
