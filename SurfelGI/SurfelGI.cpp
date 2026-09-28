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
struct Scene{ std::vector<Quad> q; int light=-1; };

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
    box({0.14f,0.0f,0.58f},{0.40f,0.60f,0.84f}); // tall box
    box({0.55f,0.0f,0.28f},{0.80f,0.30f,0.54f}); // short box
    return S;
}

//----------------------------------------------------------------------------------------------- intersection
struct Hit{ float t=1e30f; int q=-1; };
static inline Hit trace(const Scene& S, V ro, V rd, float tmax){
    Hit h; h.t=tmax;
    for(int i=0;i<(int)S.q.size();++i){ const Quad& Q=S.q[i];
        float dn=dot(rd,Q.n); if(std::fabs(dn)<1e-8f) continue;
        float t=dot(Q.p-ro,Q.n)/dn; if(t<=1e-4f||t>=h.t) continue;
        V hp=ro+rd*t, rel=hp-Q.p;
        float a=dot(rel,Q.u)/dot(Q.u,Q.u), b=dot(rel,Q.v)/dot(Q.v,Q.v);
        if(a<0||a>1||b<0||b>1) continue;
        h.t=t; h.q=i;
    }
    return h;
}
static inline bool occluded(const Scene& S, V ro, V rd, float dist){
    Hit h=trace(S,ro,rd,dist-1e-3f); return h.q>=0;
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
struct GBuf{ std::vector<V> P,N,A; std::vector<uint8_t> valid; std::vector<uint8_t> emissivePix; int W,H; };

int main(int argc,char**argv){
    int W=480,H=480, FRAMES=320, RAYS=8, DIRECT=64;
    for(int i=1;i<argc;++i){ std::string a=argv[i];
        auto nx=[&](int d){ return i+1<argc?atoi(argv[++i]):d; };
        if(a=="--w")W=nx(W); else if(a=="--h")H=nx(H); else if(a=="--frames")FRAMES=nx(FRAMES);
        else if(a=="--rays")RAYS=nx(RAYS); else if(a=="--direct")DIRECT=nx(DIRECT);
    }
    Scene S=buildCornell();
    Cam cam; cam.eye={0.5f,0.5f,-1.55f}; cam.fwd={0,0,1}; cam.right={1,0,0}; cam.up={0,1,0};
    cam.tanHalf=std::tan(21.0f*PI/180.0f); cam.aspect=(float)W/H; cam.W=W; cam.H=H;

    // ---- 1. VISIBILITY PASS -> G-buffer ----
    GBuf gb; gb.W=W; gb.H=H; gb.P.assign(W*H,{}); gb.N.assign(W*H,{}); gb.A.assign(W*H,{});
    gb.valid.assign(W*H,0); gb.emissivePix.assign(W*H,0);
    par(W*H,[&](int i){ int x=i%W,y=i/W; V rd=rayDir(cam,(float)x,(float)y);
        Hit h=trace(S,cam.eye,rd,1e30f); if(h.q<0) return;
        const Quad& Q=S.q[h.q]; V P=cam.eye+rd*h.t;
        gb.P[i]=P; gb.N[i]=Q.n; gb.A[i]=Q.albedo; gb.valid[i]=1;
        gb.emissivePix[i]= (h.q==S.light)?1:0;
    });

    // ---- 2. SURFEL FIELD ----
    const float RMIN=0.035f, RMAX=0.090f, COVERAGE_TARGET=2.4f;
    const int   SPAWN_BUDGET=1200;      // max new surfels per frame
    const float FIREFLY=4.0f;           // indirect sample clamp
    Grid grid(RMAX+1e-3f);
    std::vector<Surfel> sf; sf.reserve(200000);

    auto radiusAt=[&](V P){ float d=len(P-cam.eye); return std::min(RMAX,std::max(RMIN,0.030f*d)); };

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
                if(h.q<0||h.q==S.light) continue;                        // miss or light -> 0 (direct handled by NEE)
                const Quad& Q=S.q[h.q]; V hp=s.pos+wi*h.t;
                V Lo = shadeDirect(S,hp,Q.n,Q.albedo,r,1);               // 1st-bounce direct at the hit
                float cov; V Ehit=gatherE(sf,grid,hp,Q.n,cov);           // + multi-bounce from the field (old E)
                Lo = Lo + Q.albedo*INV_PI*Ehit;
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

    // ---- run ----
    std::vector<int> snaps={20,60,160,FRAMES}; size_t si=0;
    std::vector<std::vector<V>> snapImgs;
    auto applyImage=[&](std::vector<V>& out,int mode){ // mode 0 combined,1 direct,2 indirect
        out.assign(W*H,{});
        par(W*H,[&](int i){ if(!gb.valid[i]) return; int x=i%W,y=i/W;(void)x;(void)y;
            if(gb.emissivePix[i]){ out[i]=S.q[S.light].emit; return; }
            RNG r(hash((uint32_t)i*40503u+123u));
            V direct = shadeDirect(S,gb.P[i],gb.N[i],gb.A[i],r,DIRECT);
            float cov; V E=gatherE(sf,grid,gb.P[i],gb.N[i],cov);
            V indirect = gb.A[i]*INV_PI*E;
            if(mode==1) out[i]=direct; else if(mode==2) out[i]=indirect; else out[i]=direct+indirect;
        });
    };

    for(int f=1;f<=FRAMES;++f){
        spawnPass(f);
        updatePass(f);
        if(si<snaps.size() && f==snaps[si]){ std::vector<V> im; applyImage(im,0); snapImgs.push_back(im); ++si;
            printf("[surfelgi] frame %4d  surfels=%zu\n",f,sf.size()); }
    }
    printf("[surfelgi] final surfels=%zu\n",sf.size());

    // ---- outputs ----
    std::vector<V> combined,direct,indirect; applyImage(combined,0); applyImage(direct,1); applyImage(indirect,2);
    writePPM("cornell_combined.ppm",combined,W,H);
    writePPM("cornell_direct.ppm",direct,W,H);
    writePPM("cornell_indirect.ppm",indirect,W,H);

    // convergence snapshots
    for(size_t k=0;k<snapImgs.size();++k) writePPM("conv_"+std::to_string(snaps[k])+".ppm",snapImgs[k],W,H);
    // flicker proof: |last converged frame - one more converged frame|. Run one extra step, re-apply, diff.
    { std::vector<V> a; applyImage(a,0); updatePass(FRAMES+1); std::vector<V> b; applyImage(b,0);
      std::vector<V> d(W*H); for(int i=0;i<W*H;++i){ V e=a[i]-b[i]; d[i]={std::fabs(e.x)*20,std::fabs(e.y)*20,std::fabs(e.z)*20}; }
      writePPMraw("flicker_diff_x20.ppm",d,W,H); }

    // surfel distribution: dim G-buffer albedo + each surfel splatted as a dot tinted by its irradiance
    { std::vector<V> viz(W*H,V{});
      for(int i=0;i<W*H;++i) if(gb.valid[i]) viz[i]=gb.A[i]*0.12f;
      for(auto& s:sf){ float px,py; if(!project(cam,s.pos,px,py)) continue; int x=(int)px,y=(int)py;
        for(int dy=-1;dy<=1;++dy)for(int dx=-1;dx<=1;++dx){ int xx=x+dx,yy=y+dy; if(xx<0||yy<0||xx>=W||yy>=H)continue;
          V c=s.E; float m=std::max(c.x,std::max(c.y,c.z)); V col= m>1e-3f? c*(1.0f/m)*0.9f+V{0.1f,0.1f,0.1f} : V{0.4f,0.4f,0.9f};
          viz[yy*W+xx]=col; } }
      writePPMraw("surfel_distribution.ppm",viz,W,H); }

    // coverage heatmap (shows even, gap-free fill)
    { std::vector<V> cov(W*H,V{});
      par(W*H,[&](int i){ if(!gb.valid[i]||gb.emissivePix[i]) return; float c; gatherE(sf,grid,gb.P[i],gb.N[i],c);
        float t=std::min(1.0f,c/(COVERAGE_TARGET*2.0f)); cov[i]={t, t*0.4f, 1.0f-t}; });   // blue=low, warm=high
      writePPMraw("coverage.ppm",cov,W,H); }

    return 0;
}
