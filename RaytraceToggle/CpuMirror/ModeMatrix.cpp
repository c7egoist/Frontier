//============================================================================================================================================
//  SurfelGI.cpp — pure C++ surfel-based global illumination on a Cornell box.
//
//  Architecture (matches the engine you want on GTX-class cards):
//     1. VISIBILITY PASS  -> a G-buffer (world position, normal, albedo) from PRIMARY visibility. On the GPU this
//        is your hardware VisibilityRaster; here it is a primary-ray cast that produces the identical G-buffer, so
//        the GI architecture below is what's being demonstrated, not the primary-visibility method.
//     2. SURFEL FIELD     -> persistent world-space surface elements (discs) that each accumulate INDIRECT
//        irradiance by tracing a few hemisphere rays per frame, temporally averaged. A world-space hash grid makes
//        placement queries and shading gathers O(neighbourhood).
//     3. APPLY PASS       -> per G-buffer pixel: sharp DIRECT lighting via NEE + smooth INDIRECT gathered from the
//        surfel field. Direct and indirect are kept separate so there is no double counting.
//
//  THE TWO PROBLEMS THIS ADDRESSES (see README):
//     FLICKER            -> (a) surfels are persistent in world space and never move, (b) each surfel is a running
//                           mean (variance falls as 1/n -> converges and then holds still), (c) a newly spawned
//                           surfel is WARM-STARTED from the existing field so it never pops in from black,
//                           (d) firefly clamp on indirect samples, (e) Jacobi update (read last frame's field,
//                           write this frame's) so the whole field advances coherently.
//     POOR DISTRIBUTION  -> (a) COVERAGE-DRIVEN spawning: a surfel is only added where the screen is under-covered,
//                           (b) world-space radius scales with view distance so the SCREEN footprint is uniform,
//                           (c) spawns are budgeted per frame and filled over many frames -> even, gap-free layout.
//
//  Build:  g++ -O2 -std=c++17 -pthread SurfelGI.cpp -o surfelgi
//  Run:    ./surfelgi              (writes .ppm files; convert to png with ImageMagick)
//============================================================================================================================================

#include <cstdio>
#include <cstdint>
#include <cmath>
#include <vector>
#include <thread>
#include <unordered_map>
#include <algorithm>
#include <string>

//----------------------------------------------------------------------------------------------- vec3
struct V { float x=0,y=0,z=0; };
static inline V operator+(V a,V b){return{a.x+b.x,a.y+b.y,a.z+b.z};}
static inline V operator-(V a,V b){return{a.x-b.x,a.y-b.y,a.z-b.z};}
static inline V operator*(V a,float s){return{a.x*s,a.y*s,a.z*s};}
static inline V operator*(V a,V b){return{a.x*b.x,a.y*b.y,a.z*b.z};}
static inline float dot(V a,V b){return a.x*b.x+a.y*b.y+a.z*b.z;}
static inline V cross(V a,V b){return{a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
static inline float len(V a){return std::sqrt(dot(a,a));}
static inline V norm(V a){float l=len(a);return l>0?a*(1.0f/l):a;}
static const float PI=3.14159265358979f, INV_PI=1.0f/PI;

//----------------------------------------------------------------------------------------------- RNG (per work item, deterministic)
struct RNG{ uint32_t s; RNG(uint32_t seed){ s=seed?seed:0x9e3779b9u; }
    inline uint32_t u(){ s^=s<<13; s^=s>>17; s^=s<<5; return s; }
    inline float f(){ return (u()>>8)*(1.0f/16777216.0f); } };
static inline uint32_t hash(uint32_t a){ a^=a>>16; a*=0x7feb352du; a^=a>>15; a*=0x846ca68bu; a^=a>>16; return a; }

//----------------------------------------------------------------------------------------------- scene: rectangles
struct Quad{ V p,u,v,n; V albedo; V emit; };   // rectangle = p + a*u + b*v, a,b in [0,1]; n = inward normal
struct Sphere{ V c; float r; V albedo; V emit; float metal=0.f, rough=0.08f; };  // analytic curved primitive (metal>0.5 = reflective)
struct Scene{ std::vector<Quad> q; std::vector<Sphere> s; int light=-1; };

static inline V hueColor(float h, float sat, float val);   // fwd decl (defined below)
// 20x20 = 400-material grid: rows sweep metalness 0->1 (+ a per-row hue), columns sweep roughness 0->1.
// Mirrors the intent of the engine's 400-sphere material library (MaterialLevelViewport grid400) with this
//    renderer's metal/roughness material model, so every cell is a distinct material to render in each mode.
static Scene buildMaterialGrid(){
    Scene S; V zero{0,0,0};
    const int N=20; const float R=0.46f, STEP=1.15f;
    const float span=(N-1)*STEP; const float x0=-span*0.5f, z0=-span*0.5f;
    // large neutral ground
    float G=40.0f;
    S.q.push_back({{-G,0,-G},{2*G,0,0},{0,0,2*G},{0,1,0}, V{0.35f,0.35f,0.37f}, zero});
    // overhead area light
    S.light=(int)S.q.size();
    S.q.push_back({{-6.0f, 16.0f, -6.0f},{12,0,0},{0,0,12},{0,-1,0}, zero, {9,9,9}});
    for(int row=0; row<N; ++row) for(int col=0; col<N; ++col){
        float metal = row/(float)(N-1);
        float rough = 0.03f + 0.95f*(col/(float)(N-1));
        V alb = hueColor(row/(float)N, 0.62f, 0.85f);
        float x = x0 + col*STEP, z = z0 + row*STEP;
        S.s.push_back({{x, R, z}, R, alb, zero, metal, rough});
    }
    return S;
}

static Scene buildCornell(){
    Scene S; V white{0.75f,0.75f,0.75f}, red{0.75f,0.15f,0.15f}, green{0.15f,0.6f,0.15f}, zero{0,0,0};
    // room [0,1]^3, front (z=0 side, -z) open toward camera
    S.q.push_back({{0,0,0},{1,0,0},{0,0,1},{0,1,0},  white, zero}); // floor
    S.q.push_back({{0,1,0},{1,0,0},{0,0,1},{0,-1,0}, white, zero}); // ceiling
    S.q.push_back({{0,0,1},{1,0,0},{0,1,0},{0,0,-1}, white, zero}); // back
    S.q.push_back({{0,0,0},{0,1,0},{0,0,1},{1,0,0},  red,   zero}); // left  (red)
    S.q.push_back({{1,0,0},{0,1,0},{0,0,1},{-1,0,0}, green, zero}); // right (green)
    // area light on the ceiling
    S.light=(int)S.q.size();
    S.q.push_back({{0.35f,0.999f,0.35f},{0.30f,0,0},{0,0,0.30f},{0,-1,0}, zero, {18,18,18}});
    // two boxes (axis-aligned; 5 faces each, bottom omitted)
    auto box=[&](V mn,V mx){
        float dx=mx.x-mn.x, dy=mx.y-mn.y, dz=mx.z-mn.z;
        S.q.push_back({{mn.x,mx.y,mn.z},{dx,0,0},{0,0,dz},{0,1,0},  white,zero}); // top
        S.q.push_back({{mx.x,mn.y,mn.z},{0,dy,0},{0,0,dz},{1,0,0},  white,zero}); // +x
        S.q.push_back({{mn.x,mn.y,mn.z},{0,dy,0},{0,0,dz},{-1,0,0}, white,zero}); // -x
        S.q.push_back({{mn.x,mn.y,mx.z},{dx,0,0},{0,dy,0},{0,0,1},  white,zero}); // +z
        S.q.push_back({{mn.x,mn.y,mn.z},{dx,0,0},{0,dy,0},{0,0,-1}, white,zero}); // -z
    };
    box({0.12f,0.0f,0.66f},{0.33f,0.55f,0.84f}); // tall box, back-left corner (flat-surface reference)
    // ---- curved analytic primitives (the point of this scene) ----
    V ivory{0.80f,0.78f,0.72f}, pale{0.72f,0.72f,0.78f};
    S.s.push_back({{0.66f,0.20f,0.55f},0.20f, ivory, zero, 1.0f, 0.04f});   // big sphere = POLISHED METAL (reflective) -> shows reflection modes
    S.s.push_back({{0.34f,0.13f,0.34f},0.13f, pale,  zero});   // medium sphere, front-left -> red bleed
    S.s.push_back({{0.72f,0.62f,0.32f},0.085f,white, zero});   // small floating sphere -> all-around curvature test
    return S;
}

//----------------------------------------------------------------------------------------------- intersection
// Hit carries the shading normal + material directly, so curved and flat primitives are
// handled uniformly downstream (no primitive-type branching outside trace()).
struct Hit{ float t=1e30f; bool hit=false; bool light=false; V N{0,1,0}, albedo{0,0,0}, emit{0,0,0}; float metal=0.f, rough=0.08f; };
static inline Hit trace(const Scene& S, V ro, V rd, float tmax){
    Hit h; h.t=tmax;
    for(int i=0;i<(int)S.q.size();++i){ const Quad& Q=S.q[i];
        float dn=dot(rd,Q.n); if(std::fabs(dn)<1e-8f) continue;
        float t=dot(Q.p-ro,Q.n)/dn; if(t<=1e-4f||t>=h.t) continue;
        V hp=ro+rd*t, rel=hp-Q.p;
        float a=dot(rel,Q.u)/dot(Q.u,Q.u), b=dot(rel,Q.v)/dot(Q.v,Q.v);
        if(a<0||a>1||b<0||b>1) continue;
        h.t=t; h.hit=true; h.N=Q.n; h.albedo=Q.albedo; h.emit=Q.emit; h.light=(i==S.light);
    }
    for(int i=0;i<(int)S.s.size();++i){ const Sphere& Q=S.s[i];
        V oc=ro-Q.c; float b=dot(oc,rd), c=dot(oc,oc)-Q.r*Q.r; float disc=b*b-c;
        if(disc<0) continue; float sq=std::sqrt(disc);
        float t=-b-sq; if(t<=1e-4f) t=-b+sq; if(t<=1e-4f||t>=h.t) continue;
        V hp=ro+rd*t; V n=norm(hp-Q.c);                                // per-hit geometric normal (curvature)
        h.t=t; h.hit=true; h.N=n; h.albedo=Q.albedo; h.emit=Q.emit; h.light=false; h.metal=Q.metal; h.rough=Q.rough;
    }
    return h;
}
static inline bool occluded(const Scene& S, V ro, V rd, float dist){
    Hit h=trace(S,ro,rd,dist-1e-3f); return h.hit;
}

//----------------------------------------------------------------------------------------------- direct lighting (NEE, sharp)
static inline V shadeDirect(const Scene& S, V P, V N, V albedo, RNG& r, int samples){
    const Quad& L=S.q[S.light];
    float area=len(L.u)*len(L.v);
    V sum{0,0,0};
    for(int s=0;s<samples;++s){
        V lp=L.p+L.u*r.f()+L.v*r.f();
        V wi=lp-P; float d2=dot(wi,wi), d=std::sqrt(d2); wi=wi*(1.0f/d);
        float cS=dot(N,wi); if(cS<=0) continue;
        float cL=dot(L.n,wi*-1.0f); if(cL<=0) continue;
        if(occluded(S,P+N*1e-4f,wi,d)) continue;
        // f_r * Le * cS * cL / d2 / pdfA , pdfA = 1/area
        V c = albedo*INV_PI * L.emit * (cS*cL/d2*area);
        sum=sum+c;
    }
    return sum*(1.0f/samples);
}

//----------------------------------------------------------------------------------------------- sky + reflection + path tracer
static inline V reflectV(V d, V n){ return d - n*(2.0f*dot(d,n)); }   // d = incoming dir
static inline V mixV(V a, V b, float t){ return a*(1.0f-t) + b*t; }
static inline V fres(V f0, float c){ float m=std::pow(std::max(0.0f,1.0f-c),5.0f); return f0 + (V{1,1,1}-f0)*m; }  // Schlick
static inline V randUnit(RNG& r){ float z=r.f()*2-1, a=r.f()*2*PI, s=std::sqrt(std::max(0.0f,1-z*z)); return {s*std::cos(a),s*std::sin(a),z}; }
// HSV hue wheel (s,v fixed) -> linear-ish RGB, for the 400-material grid's per-row colours.
static inline V hueColor(float h, float sat, float val){
    h=h-std::floor(h); float x=h*6.0f; int i=(int)x; float fr=x-i;
    float p=val*(1-sat), q=val*(1-sat*fr), t=val*(1-sat*(1-fr));
    switch(i%6){case 0:return{val,t,p};case 1:return{q,val,p};case 2:return{p,val,t};case 3:return{p,q,val};case 4:return{t,p,val};default:return{val,p,q};}
}
// A simple physically-plausible sky dome so "reflect the sky" is visibly the sky (zenith blue -> warm horizon -> ground).
static inline V skyColor(V dir){
    float t = std::max(0.0f, dir.y);
    V zenith{0.30f,0.50f,0.95f}, horizon{0.85f,0.88f,0.95f}, ground{0.22f,0.20f,0.18f};
    if(dir.y < 0) return ground;
    return horizon*(1.0f-t) + zenith*t;
}
static const V SKY_AMBIENT{0.16f,0.18f,0.22f};   // hemisphere ambient fill used by the plain-raster path (never black)

// Unidirectional path tracer with NEE — the "raytraced" reference (true GI + true raytraced reflection on metal).
static V pathTrace(const Scene& S, V ro, V rd, RNG& r, int maxDepth){
    V L{0,0,0}, thr{1,1,1};
    for(int b=0;b<maxDepth;++b){
        Hit h=trace(S,ro,rd,1e30f);
        if(!h.hit){ L=L+thr*skyColor(rd); break; }
        if(h.light){ if(b==0) L=L+thr*h.emit; break; }       // emitter (NEE covers it on later bounces)
        V hp=ro+rd*h.t; float metal=h.metal, rough=h.rough;
        V f0 = h.albedo*metal + V{0.04f,0.04f,0.04f}*(1.0f-metal);
        float cosV=std::max(0.0f,-dot(rd,h.N)); V F=fres(f0,cosV);
        float pspec = metal>0.5f ? 1.0f : std::min(0.9f,(F.x+F.y+F.z)/3.0f);
        if(r.f() < pspec){                                   // GGX-ish specular reflection (roughness-perturbed) -> glossy metal
            V R=norm(reflectV(rd,h.N));
            if(rough>0.001f){ V u=randUnit(r); R=norm(R + u*(rough*rough)); if(dot(R,h.N)<=0) R=norm(reflectV(rd,h.N)); }
            V tint = metal>0.5f ? h.albedo : F*(1.0f/std::max(pspec,1e-3f));
            thr=thr*tint; ro=hp+h.N*1e-4f; rd=R;
        } else {                                             // diffuse (dielectric base)
            V dalb=h.albedo*(1.0f-metal);
            L=L+thr*shadeDirect(S,hp,h.N,dalb,r,1);
            V t=std::fabs(h.N.x)<0.9f?V{1,0,0}:V{0,1,0}; V tx=norm(cross(t,h.N)); V ty=cross(h.N,tx);
            float u1=r.f(),u2=r.f(); float rr=std::sqrt(u1), ph=2*PI*u2;
            V wi=norm(tx*(rr*std::cos(ph))+ty*(rr*std::sin(ph))+h.N*std::sqrt(std::max(0.0f,1-u1)));
            thr=thr*dalb*(1.0f/std::max(1.0f-pspec,1e-3f)); ro=hp+h.N*1e-4f; rd=wi;
        }
        if(b>2){ float p=std::max(thr.x,std::max(thr.y,thr.z)); if(r.f()>p) break; thr=thr*(1.0f/std::max(p,1e-3f)); }
    }
    return L;
}

//----------------------------------------------------------------------------------------------- surfel field
struct Surfel{ V pos, n, albedo; float radius; V E{0,0,0}, Enew{0,0,0}; uint32_t age=0; };
struct Grid{
    float cell; std::unordered_map<uint64_t,std::vector<int>> map;
    Grid(float c):cell(c){}
    static inline uint64_t key(int x,int y,int z){
        return (uint64_t)(uint32_t)(x+1024)*73856093u ^ (uint64_t)(uint32_t)(y+1024)*19349663u ^ (uint64_t)(uint32_t)(z+1024)*83492791u;
    }
    inline void cellOf(V p,int&x,int&y,int&z)const{ x=(int)std::floor(p.x/cell); y=(int)std::floor(p.y/cell); z=(int)std::floor(p.z/cell); }
    void insert(V p,int idx){ int x,y,z; cellOf(p,x,y,z); map[key(x,y,z)].push_back(idx); }
};

// gather indirect irradiance at (P,N) from the field; also returns coverage weight sum.
static V gatherE(const std::vector<Surfel>& sf, const Grid& g, V P, V N, float& covOut){
    int cx,cy,cz; g.cellOf(P,cx,cy,cz);
    V acc{0,0,0}; float wsum=0;
    for(int dz=-1;dz<=1;++dz)for(int dy=-1;dy<=1;++dy)for(int dx=-1;dx<=1;++dx){
        auto it=g.map.find(Grid::key(cx+dx,cy+dy,cz+dz)); if(it==g.map.end()) continue;
        for(int idx:it->second){ const Surfel& s=sf[idx];
            V d=P-s.pos; float dist=len(d); if(dist>=s.radius) continue;
            float wn=dot(N,s.n); if(wn<=0) continue;                 // face the same way
            float planar=std::fabs(dot(d,s.n));                       // stay near the surfel's plane
            if(planar>s.radius*0.5f) continue;
            float wd=1.0f-dist/s.radius; wd*=wd;                      // smooth radial falloff
            float w=wn*wd;
            acc=acc+s.E*w; wsum+=w;
        }
    }
    covOut=wsum;
    return wsum>1e-4f ? acc*(1.0f/wsum) : V{0,0,0};
}

//----------------------------------------------------------------------------------------------- parallel for
template<class F> static void par(int n,F f){
    unsigned T=std::thread::hardware_concurrency(); if(T<1)T=1; if(T>4)T=4;
    if(n< (int)T*64){ for(int i=0;i<n;++i) f(i); return; }
    std::vector<std::thread> ts; int chunk=(n+T-1)/T;
    for(unsigned t=0;t<T;++t){ int a=t*chunk,b=std::min(n,a+chunk); if(a>=b)break;
        ts.emplace_back([=,&f]{ for(int i=a;i<b;++i) f(i); }); }
    for(auto& th:ts) th.join();
}

//----------------------------------------------------------------------------------------------- camera
struct Cam{ V eye,fwd,right,up; float tanHalf,aspect; int W,H; };
static void lookAt(Cam& c, V eye, V target, float fovDeg){
    c.eye=eye; c.fwd=norm(target-eye);
    V wup{0,1,0}; c.right=norm(cross(c.fwd,wup)); c.up=cross(c.right,c.fwd);
    c.tanHalf=std::tan(fovDeg*0.5f*PI/180.0f);
}
static V rayDir(const Cam& c,float px,float py){
    float ndcx=( (px+0.5f)/c.W*2.0f-1.0f);
    float ndcy=(1.0f-(py+0.5f)/c.H*2.0f);
    return norm(c.fwd + c.right*(ndcx*c.tanHalf*c.aspect) + c.up*(ndcy*c.tanHalf));
}
static bool project(const Cam& c,V p,float&px,float&py){
    V rel=p-c.eye; float cz=dot(rel,c.fwd); if(cz<=1e-3f) return false;
    float cx=dot(rel,c.right), cy=dot(rel,c.up);
    float ndcx=cx/(cz*c.tanHalf*c.aspect), ndcy=cy/(cz*c.tanHalf);
    px=(ndcx*0.5f+0.5f)*c.W; py=(1.0f-(ndcy*0.5f+0.5f))*c.H; return true;
}

//----------------------------------------------------------------------------------------------- tonemap + output
static inline float aces(float x){ x*=0.9f; return std::min(1.0f,std::max(0.0f,(x*(2.51f*x+0.03f))/(x*(2.43f*x+0.59f)+0.14f))); }
static inline uint8_t enc(float v){ return (uint8_t)std::lround(std::pow(aces(v),1.0f/2.2f)*255.0f); }
static void writePPM(const std::string& path,const std::vector<V>& img,int W,int H){
    FILE* f=fopen(path.c_str(),"wb"); fprintf(f,"P6\n%d %d\n255\n",W,H);
    for(auto&c:img){ uint8_t p[3]={enc(c.x),enc(c.y),enc(c.z)}; fwrite(p,1,3,f);} fclose(f);
}
static void writePPMraw(const std::string& path,const std::vector<V>& img,int W,int H){ // no tonemap (for heatmaps already in [0,1])
    FILE* f=fopen(path.c_str(),"wb"); fprintf(f,"P6\n%d %d\n255\n",W,H);
    for(auto&c:img){ auto q=[&](float v){return (uint8_t)std::lround(std::min(1.0f,std::max(0.0f,v))*255.0f);};
        uint8_t p[3]={q(c.x),q(c.y),q(c.z)}; fwrite(p,1,3,f);} fclose(f);
}

//----------------------------------------------------------------------------------------------- G-buffer
struct GBuf{ std::vector<V> P,N,A; std::vector<float> M,Rgh; std::vector<uint8_t> valid; std::vector<uint8_t> emissivePix; int W,H; };

int main(int argc,char**argv){
    int W=480,H=480, FRAMES=320, RAYS=8, DIRECT=64, SPP=32;
    std::string sceneName="cornell";
    for(int i=1;i<argc;++i){ std::string a=argv[i];
        auto nx=[&](int d){ return i+1<argc?atoi(argv[++i]):d; };
        if(a=="--w")W=nx(W); else if(a=="--h")H=nx(H); else if(a=="--frames")FRAMES=nx(FRAMES);
        else if(a=="--rays")RAYS=nx(RAYS); else if(a=="--direct")DIRECT=nx(DIRECT); else if(a=="--spp")SPP=nx(SPP);
        else if(a=="--scene"){ if(i+1<argc) sceneName=argv[++i]; }
    }
    Cam cam; cam.aspect=(float)W/H; cam.W=W; cam.H=H;
    Scene S;
    if(sceneName=="grid"){
        S=buildMaterialGrid();
        lookAt(cam, V{3.0f, 13.5f, -20.0f}, V{0.0f, 0.6f, 1.0f}, 40.0f);   // angled look over the 400-sphere matrix
    } else {
        S=buildCornell();
        cam.eye={0.5f,0.5f,-1.55f}; cam.fwd={0,0,1}; cam.right={1,0,0}; cam.up={0,1,0};
        cam.tanHalf=std::tan(21.0f*PI/180.0f);
    }

    // ---- 1. VISIBILITY PASS -> G-buffer ----
    GBuf gb; gb.W=W; gb.H=H; gb.P.assign(W*H,{}); gb.N.assign(W*H,{}); gb.A.assign(W*H,{});
    gb.valid.assign(W*H,0); gb.emissivePix.assign(W*H,0); gb.M.assign(W*H,0.f); gb.Rgh.assign(W*H,0.08f);
    par(W*H,[&](int i){ int x=i%W,y=i/W; V rd=rayDir(cam,(float)x,(float)y);
        Hit h=trace(S,cam.eye,rd,1e30f); if(!h.hit) return;
        V P=cam.eye+rd*h.t;
        gb.P[i]=P; gb.N[i]=h.N; gb.A[i]=h.albedo; gb.valid[i]=1; gb.M[i]=h.metal; gb.Rgh[i]=h.rough;
        gb.emissivePix[i]= h.light?1:0;
    });

    // ---- 2. SURFEL FIELD ----
    // surfel field scale follows the scene: the Cornell box is ~1 m, the material grid ~40 m.
    const bool  bigScene = (sceneName=="grid");
    const float RMIN = bigScene?0.22f:0.035f, RMAX = bigScene?0.70f:0.090f, COVERAGE_TARGET=2.4f;
    const float RADFAC = bigScene?0.055f:0.030f;
    const int   SPAWN_BUDGET = bigScene?4000:1200;      // max new surfels per frame
    const float FIREFLY=4.0f;           // indirect sample clamp
    Grid grid(RMAX+1e-3f);
    std::vector<Surfel> sf; sf.reserve(200000);

    auto radiusAt=[&](V P){ float d=len(P-cam.eye); return std::min(RMAX,std::max(RMIN,RADFAC*d)); };

    // spawn where the screen is under-covered (even, gap-free distribution)
    auto spawnPass=[&](int frame){
        RNG rr(hash(frame*2654435761u+7u));
        int budget=SPAWN_BUDGET, stride=3, off=frame%(stride*stride);
        int ox=off%stride, oy=off/stride;
        for(int y=oy;y<H&&budget>0;y+=stride) for(int x=ox;x<W&&budget>0;x+=stride){
            int i=y*W+x; if(!gb.valid[i]||gb.emissivePix[i]) continue;
            float cov; gatherE(sf,grid,gb.P[i],gb.N[i],cov);
            if(cov>=COVERAGE_TARGET) continue;
            // probabilistic gate: the emptier the pixel, the more likely to seed here
            if(rr.f() > (1.0f-cov/COVERAGE_TARGET)*0.9f+0.1f) continue;
            Surfel s; s.pos=gb.P[i]; s.n=gb.N[i]; s.albedo=gb.A[i]; s.radius=radiusAt(s.pos);
            float dummy; s.E=gatherE(sf,grid,s.pos,s.n,dummy);   // WARM START from existing field (no black pop)
            s.age=4;
            int idx=(int)sf.size(); sf.push_back(s); grid.insert(s.pos,idx); --budget;
        }
    };

    // one temporal step: each surfel casts RAYS hemisphere rays, running-mean into Enew (Jacobi: reads old E)
    auto updatePass=[&](int frame){
        int n=(int)sf.size();
        par(n,[&](int si){ Surfel& s=sf[si];
            RNG r(hash((uint32_t)si*2246822519u ^ (uint32_t)frame*3266489917u));
            // tangent frame
            V t=std::fabs(s.n.x)<0.9f?V{1,0,0}:V{0,1,0}; V tx=norm(cross(t,s.n)); V ty=cross(s.n,tx);
            V meas{0,0,0};
            for(int k=0;k<RAYS;++k){
                float u1=r.f(),u2=r.f(); float rr=std::sqrt(u1), ph=2*PI*u2;
                V wi=tx*(rr*std::cos(ph)) + ty*(rr*std::sin(ph)) + s.n*std::sqrt(std::max(0.0f,1-u1)); wi=norm(wi);
                Hit h=trace(S,s.pos+s.n*1e-4f,wi,1e30f);
                if(!h.hit||h.light) continue;                            // miss or light -> 0 (direct handled by NEE)
                V hp=s.pos+wi*h.t;
                V Lo = shadeDirect(S,hp,h.N,h.albedo,r,1);               // 1st-bounce direct at the hit
                float cov; V Ehit=gatherE(sf,grid,hp,h.N,cov);           // + multi-bounce from the field (old E)
                Lo = Lo + h.albedo*INV_PI*Ehit;
                // firefly clamp
                Lo.x=std::min(Lo.x,FIREFLY);Lo.y=std::min(Lo.y,FIREFLY);Lo.z=std::min(Lo.z,FIREFLY);
                meas=meas+Lo;
            }
            // cosine-weighted estimator of irradiance E = pi * mean(Lo)
            meas = meas*(PI/RAYS);
            s.age++; float alpha=1.0f/std::min(s.age,4096u);            // running mean; converges then holds (anti-flicker)
            s.Enew = s.E + (meas - s.E)*alpha;
        });
        for(auto& s:sf) s.E=s.Enew;                                     // commit (Jacobi swap)
    };

    // ================= THREE RENDER MODES (mirrors the engine's Raytracing tile x GI tile matrix) =================
    // Reflection choice per mode: RT off -> SKY reflection; RT on -> RAYTRACED reflection. Materials (incl. the metal
    //    sphere) are evaluated in EVERY mode, not only the raytraced path.
    auto resolvePixel=[&](int i,int pathMode)->V{           // pathMode: 0 raytraced, 1 surfel GI, 2 plain raster
        if(!gb.valid[i]){ V rd=rayDir(cam,(float)(i%W),(float)(i/W)); return skyColor(rd); }
        if(gb.emissivePix[i]) return S.q[S.light].emit;
        RNG r(hash((uint32_t)i*40503u+123u+(uint32_t)pathMode*2654435761u));
        V P=gb.P[i], N=gb.N[i], A=gb.A[i];
        if(pathMode==0){                                    // RAYTRACED: full path trace (GI + raytraced reflection)
            V rd=norm(P-cam.eye); V acc{0,0,0};
            for(int s=0;s<SPP;++s) acc=acc+pathTrace(S,cam.eye,rd,r,8);
            return acc*(1.0f/SPP);
        }
        // continuous metal/roughness material — evaluated identically in surfel-GI and plain-raster modes.
        float metal=gb.M[i], rough=gb.Rgh[i];
        V Vd=norm(cam.eye-P);
        V f0 = A*metal + V{0.04f,0.04f,0.04f}*(1.0f-metal);
        V Fr = fres(f0, std::max(0.0f, dot(N,Vd)));
        V dalb = A*(1.0f-metal);
        V direct = shadeDirect(S,P,N,dalb,r,DIRECT);
        V lit;
        if(pathMode==1){ float cov; V E=gatherE(sf,grid,P,N,cov); lit = direct + dalb*INV_PI*E; }  // SURFEL GI
        else            lit = direct + dalb*SKY_AMBIENT;                                          // PLAIN RASTER (flat fill)
        // specular = "reflect the sky" (RT off in both modes), roughness widens toward the sky average.
        V Rr = norm(reflectV(P-cam.eye, N));
        V skyR = mixV(skyColor(Rr), skyColor(V{0,1,0})*0.6f + SKY_AMBIENT, std::min(1.0f,rough));
        return lit + Fr*skyR;
    };
    auto renderMode=[&](int pathMode){ std::vector<V> out(W*H); par(W*H,[&](int i){ out[i]=resolvePixel(i,pathMode); }); return out; };

    // ---- run the surfel field to convergence (needed for the surfel-GI mode) ----
    for(int f=1;f<=FRAMES;++f){ spawnPass(f); updatePass(f);
        if(f==20||f==FRAMES) printf("[SurfelGI] frame %4d  surfels=%zu\n",f,sf.size()); }
    printf("[SurfelGI] final surfels=%zu\n",sf.size());

    // flicker proof for the surfel path (their #1 prior failure)
    { std::vector<V> a=renderMode(1); updatePass(FRAMES+1); std::vector<V> b=renderMode(1);
      std::vector<V> d(W*H); double acc=0; for(int i=0;i<W*H;++i){ V e=a[i]-b[i]; d[i]={std::fabs(e.x)*20,std::fabs(e.y)*20,std::fabs(e.z)*20}; acc+=(std::fabs(e.x)+std::fabs(e.y)+std::fabs(e.z))/3.0; }
      writePPMraw("mode_flicker_x20.ppm",d,W,H); printf("[SurfelGI] mean frame-to-frame diff = %.5f (of 1.0)\n", acc/(double)(W*H)); }

    writePPM("mode_raytraced.ppm",  renderMode(0), W,H);     // RT on
    writePPM("mode_surfelgi.ppm",   renderMode(1), W,H);     // RT off + GI on
    writePPM("mode_plainraster.ppm",renderMode(2), W,H);     // RT off + GI off
    printf("[modes] wrote mode_raytraced / mode_surfelgi / mode_plainraster (.ppm)\n");
    return 0;
}
