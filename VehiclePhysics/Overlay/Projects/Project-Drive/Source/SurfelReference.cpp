//============================================================================================================================================
// 📦 Projects/Project-Drive/Source/SurfelReference.cpp — headless Surfel-GI reference render of the drive scene
//============================================================================================================================================
//
//    Project-Drive's headless CPU reference for the RENDER half. It is the same split the engine uses on the GTX path and
//    the standalone SurfelGI/ reference proved: a visibility pass builds the G-buffer, DIRECT light stays sharp (sun NEE +
//    sky), and a persistent field of world-space SURFELS carries only the INDIRECT (bounced) light, temporally averaged
//    through a world-space hash grid so it converges and holds still (no boil).
//
//    Unlike the Cornell reference, the geometry here is a TRIANGLE SOUP (checker pad + ramp + bumps + cones from
//    DriveCourse, plus the real ControlVehicle shell and procedural wheels), so this file adds a compact BVH over the
//    triangles for closest-hit and shadow queries. Output → Diagnostics/: drive_gi.ppm (tonemapped) + surfel_timing.log.
//
//    Build (plain g++ + pthreads, no GPU): see Projects/Project-Drive/Makefile (target: SurfelReference).

#include "DriveCourse.h"
#include "ControlVehicleMesh.inl"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>
#include <thread>
#include <vector>
#include <atomic>

namespace DC = Frontier::Drive;

//------------------------------------------------------------------------------------------------------------------------ vec math
struct V { float x=0,y=0,z=0; };
static inline V operator+(V a,V b){return{a.x+b.x,a.y+b.y,a.z+b.z};}
static inline V operator-(V a,V b){return{a.x-b.x,a.y-b.y,a.z-b.z};}
static inline V operator*(V a,float s){return{a.x*s,a.y*s,a.z*s};}
static inline V operator*(V a,V b){return{a.x*b.x,a.y*b.y,a.z*b.z};}
static inline float dot(V a,V b){return a.x*b.x+a.y*b.y+a.z*b.z;}
static inline V cross(V a,V b){return{a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
static inline float len(V a){return std::sqrt(dot(a,a));}
static inline V norm(V a){float l=len(a);return l>0?a*(1.0f/l):a;}
static inline V vmin(V a,V b){return{std::min(a.x,b.x),std::min(a.y,b.y),std::min(a.z,b.z)};}
static inline V vmax(V a,V b){return{std::max(a.x,b.x),std::max(a.y,b.y),std::max(a.z,b.z)};}
static const float PI=3.14159265358979f, INV_PI=1.0f/PI;

struct RNG{ uint32_t s; RNG(uint32_t seed){s=seed?seed:0x9e3779b9u;} float f(){s^=s<<13;s^=s>>17;s^=s<<5;return (s&0xFFFFFF)/16777216.0f;} };
static inline uint32_t hashi(uint32_t a){a^=a>>16;a*=0x7feb352du;a^=a>>15;a*=0x846ca68bu;a^=a>>16;return a;}

//------------------------------------------------------------------------------------------------------------------------ triangles + materials
struct Tri{ V a,b,c,n; uint32_t mat; };
static V MaterialAlbedo(uint32_t m)
{
    switch(m){
        case DC::MatCheckerLight: return {0.62f,0.63f,0.65f};
        case DC::MatCheckerDark:  return {0.10f,0.105f,0.12f};
        case DC::MatSurround:     return {0.16f,0.17f,0.18f};
        case DC::MatRamp:         return {0.45f,0.45f,0.47f};
        case DC::MatBump:         return {0.72f,0.54f,0.06f};
        case DC::MatCone:         return {0.86f,0.30f,0.05f};
        case DC::MatBodyPaint:    return {0.025f,0.055f,0.34f}; // cobalt metallic base; finite flakes/coat are native material lobes
        case DC::MatVehicleGlass: return {0.018f,0.050f,0.085f};
        case DC::MatVehiclePlastic:return {0.012f,0.014f,0.018f};
        case DC::MatTyre:         return {0.012f,0.013f,0.015f};
        case DC::MatHub:          return {0.42f,0.44f,0.49f};
        case DC::MatBrake:        return {0.30f,0.075f,0.025f};
        default:                  return {0.8f,0.1f,0.8f};
    }
}

//------------------------------------------------------------------------------------------------------------------------ scene build
static uint32_t ClassifyControlVehicleMaterial(V a, V b, V c)
{
    const V p=(a+b+c)*(1.0f/3.0f), n=norm(cross(b-a,c-a));
    const float side=std::fabs(p.y);
    if (p.z > 0.62f && p.z < 1.31f && p.x > -2.05f && p.x < 1.62f && (side > 0.47f || std::fabs(n.x) > 0.48f))
        return DC::MatVehicleGlass;
    if (p.z < 0.16f || (side > 0.98f && p.z < 0.46f) || (p.x > 2.72f && p.z < 0.50f) || (p.x < -2.72f && p.z < 0.57f))
        return DC::MatVehiclePlastic;
    return DC::MatBodyPaint;
}
static void EmitCar(std::vector<Tri>& tris, V offset)
{
    using namespace Frontier::Drive::ControlVehicleMesh;
    auto Raw=[&](uint32_t i){ return V{kPositions[i*3+0],kPositions[i*3+1],kPositions[i*3+2]}; };
    for(uint32_t t=0;t<kTriangleCount;++t){ V a=Raw(kTriangles[t*3+0]),b=Raw(kTriangles[t*3+1]),c=Raw(kTriangles[t*3+2]);
        Tri T; T.a=a+offset; T.b=b+offset; T.c=c+offset; T.n=norm(cross(T.b-T.a,T.c-T.a));
        T.mat=ClassifyControlVehicleMaterial(a,b,c); tris.push_back(T);
    }
}
static void EmitWheel(std::vector<Tri>& tris, V centre, float R, float hw, uint32_t seg)
{
    const float yL=centre.y-hw, yR=centre.y+hw, hubR=R*0.45f;
    auto addq=[&](V a,V b,V c,V d,uint32_t m){ Tri t1{a,b,c,norm(cross(b-a,c-a)),m}; Tri t2{a,c,d,norm(cross(c-a,d-a)),m};
        tris.push_back(t1); tris.push_back(t2); };
    for(uint32_t s=0;s<seg;++s){
        float a0=2*PI*s/seg, a1=2*PI*(s+1)/seg;
        V o0{centre.x+R*std::cos(a0),0,centre.z+R*std::sin(a0)}, o1{centre.x+R*std::cos(a1),0,centre.z+R*std::sin(a1)};
        addq({o0.x,yL,o0.z},{o1.x,yL,o1.z},{o1.x,yR,o1.z},{o0.x,yR,o0.z}, DC::MatTyre);            // tread
        V h0{centre.x+hubR*std::cos(a0),0,centre.z+hubR*std::sin(a0)}, h1{centre.x+hubR*std::cos(a1),0,centre.z+hubR*std::sin(a1)};
        Tri f0{{centre.x,yR,centre.z},{h0.x,yR,h0.z},{h1.x,yR,h1.z},{0,1,0},DC::MatHub}; tris.push_back(f0);
        Tri f1{{centre.x,yL,centre.z},{h1.x,yL,h1.z},{h0.x,yL,h0.z},{0,-1,0},DC::MatHub}; tris.push_back(f1);
        addq({h0.x,yR,h0.z},{o0.x,yR,o0.z},{o1.x,yR,o1.z},{h1.x,yR,h1.z}, DC::MatTyre);              // R sidewall
        addq({h0.x,yL,h0.z},{h1.x,yL,h1.z},{o1.x,yL,o1.z},{o0.x,yL,o0.z}, DC::MatTyre);              // L sidewall
    }
}
static std::vector<Tri> BuildScene()
{
    std::vector<Tri> tris; tris.reserve(8000);
    DC::EmitCourseTriangles([&](float ax,float ay,float az,float bx,float by,float bz,float cx,float cy,float cz,uint32_t m){
        Tri t; t.a={ax,ay,az}; t.b={bx,by,bz}; t.c={cx,cy,cz}; t.n=norm(cross(t.b-t.a,t.c-t.a)); t.mat=m; tris.push_back(t);
    });
    const float spawnZ = 0.34f - 0.0914f;                       // wheels rest on the pad (matches TractrixDriveScene)
    EmitCar(tris, V{0,0,spawnZ});
    const float hub[4][3]={{1.7274f,1.0475f,0.0914f},{1.7274f,-1.0475f,0.0914f},{-1.6686f,1.0475f,0.0914f},{-1.6686f,-1.0475f,0.0914f}};
    for(int w=0;w<4;++w) EmitWheel(tris, V{hub[w][0],hub[w][1],hub[w][2]+spawnZ}, 0.34f, 0.1175f, 24u);
    return tris;
}

//------------------------------------------------------------------------------------------------------------------------ compact BVH
struct Node{ V lo,hi; int left=-1,right=-1,first=0,count=0; };
struct BVH{
    std::vector<Node> nodes; std::vector<int> idx; const std::vector<Tri>* T=nullptr;
    void build(const std::vector<Tri>& tris){ T=&tris; idx.resize(tris.size()); for(size_t i=0;i<tris.size();++i) idx[i]=(int)i;
        nodes.reserve(tris.size()*2); makeNode(0,(int)tris.size()); }
    static V triLo(const Tri& t){ return vmin(vmin(t.a,t.b),t.c);} static V triHi(const Tri& t){ return vmax(vmax(t.a,t.b),t.c);}
    int makeNode(int first,int count){
        int ni=(int)nodes.size(); nodes.push_back({});
        V lo{1e30f,1e30f,1e30f}, hi{-1e30f,-1e30f,-1e30f};
        for(int i=first;i<first+count;++i){ lo=vmin(lo,triLo((*T)[idx[i]])); hi=vmax(hi,triHi((*T)[idx[i]])); }
        nodes[ni].lo=lo; nodes[ni].hi=hi;
        if(count<=6){ nodes[ni].first=first; nodes[ni].count=count; return ni; }
        V ext=hi-lo; int ax=(ext.x>ext.y&&ext.x>ext.z)?0:(ext.y>ext.z?1:2);
        int mid=first+count/2;
        std::nth_element(idx.begin()+first, idx.begin()+mid, idx.begin()+first+count,
            [&](int A,int B){ V ca=triLo((*T)[A])+triHi((*T)[A]); V cb=triLo((*T)[B])+triHi((*T)[B]);
                              return (ax==0?ca.x:ax==1?ca.y:ca.z) < (ax==0?cb.x:ax==1?cb.y:cb.z); });
        int l=makeNode(first,mid-first); int r=makeNode(mid,first+count-mid);
        nodes[ni].left=l; nodes[ni].right=r; return ni;
    }
    static bool slab(const Node& n,V ro,V inv,float tmax){
        float t0=0,t1=tmax;
        for(int a=0;a<3;++a){ float o=(a==0?ro.x:a==1?ro.y:ro.z), i=(a==0?inv.x:a==1?inv.y:inv.z);
            float lo=(a==0?n.lo.x:a==1?n.lo.y:n.lo.z), hi=(a==0?n.hi.x:a==1?n.hi.y:n.hi.z);
            float ta=(lo-o)*i, tb=(hi-o)*i; if(ta>tb) std::swap(ta,tb); t0=std::max(t0,ta); t1=std::min(t1,tb); if(t1<t0) return false; }
        return true;
    }
    static bool triHit(const Tri& tr,V ro,V rd,float& t){
        V e1=tr.b-tr.a, e2=tr.c-tr.a, p=cross(rd,e2); float det=dot(e1,p); if(std::fabs(det)<1e-8f) return false;
        float inv=1.0f/det; V tv=ro-tr.a; float u=dot(tv,p)*inv; if(u<0||u>1) return false;
        V q=cross(tv,e1); float v=dot(rd,q)*inv; if(v<0||u+v>1) return false; float tt=dot(e2,q)*inv; if(tt<1e-4f||tt>=t) return false; t=tt; return true;
    }
    bool closest(V ro,V rd,float tmax,int& outTri,float& outT) const {
        V inv{1.0f/rd.x,1.0f/rd.y,1.0f/rd.z}; float t=tmax; int best=-1; int stack[64],sp=0; stack[sp++]=0;
        while(sp){ const Node& n=nodes[stack[--sp]]; if(!slab(n,ro,inv,t)) continue;
            if(n.count){ for(int i=n.first;i<n.first+n.count;++i){ int ti=idx[i]; if(triHit((*T)[ti],ro,rd,t)) best=ti; } }
            else { stack[sp++]=n.left; stack[sp++]=n.right; } }
        outTri=best; outT=t; return best>=0;
    }
    bool anyHit(V ro,V rd,float dist) const {
        V inv{1.0f/rd.x,1.0f/rd.y,1.0f/rd.z}; int stack[64],sp=0; stack[sp++]=0;
        while(sp){ const Node& n=nodes[stack[--sp]]; if(!slab(n,ro,inv,dist)) continue;
            if(n.count){ for(int i=n.first;i<n.first+n.count;++i){ int ti=idx[i]; float t=dist; if(triHit((*T)[ti],ro,rd,t)) return true; } }
            else { stack[sp++]=n.left; stack[sp++]=n.right; } }
        return false;
    }
};

//------------------------------------------------------------------------------------------------------------------------ lighting
static const V   SUN_DIR = norm(V{-0.35f,-0.30f,0.88f});     // points TOWARD the sun (up-ish)
static const V   SUN_COL = V{1.0f,0.95f,0.85f}*3.0f;
static V SkyColour(V d){ float t=std::max(0.0f,d.z); return V{0.35f,0.5f,0.85f}*t + V{0.7f,0.75f,0.8f}*(1.0f-t); }
static V DirectLight(const BVH& bvh, V P, V N, V albedo){
    V c{0,0,0};
    const float ndl=dot(N,SUN_DIR);
    if(ndl>0 && !bvh.anyHit(P+N*0.002f, SUN_DIR, 1e4f))
        c = albedo*INV_PI * (SUN_COL*ndl);                     // sun, direct + shadowed
    c = c + albedo * (SkyColour(V{0,0,1}) * (0.35f*(0.5f+0.5f*N.z)));   // cheap sky-dome ambient
    return c;
}
static V hemi(V N, float u1, float u2){ float r=std::sqrt(u1), th=2*PI*u2; V t=norm(std::fabs(N.x)>0.9f?cross(N,{0,1,0}):cross(N,{1,0,0})); V b=cross(N,t);
    return norm(t*(r*std::cos(th))+b*(r*std::sin(th))+N*std::sqrt(std::max(0.0f,1-u1))); }

//------------------------------------------------------------------------------------------------------------------------ surfels
struct Surfel{ V pos,n,albedo; float radius; V E{0,0,0},Enew{0,0,0}; uint32_t age=0; };
struct Grid{ float cell=1.2f; std::vector<std::vector<int>> cells; int nx,ny,nz; V lo;
    void build(V mn,V mx){ lo=mn; nx=std::max(1,(int)((mx.x-mn.x)/cell)+1); ny=std::max(1,(int)((mx.y-mn.y)/cell)+1); nz=std::max(1,(int)((mx.z-mn.z)/cell)+1);
        cells.assign((size_t)nx*ny*nz,{}); }
    int index(V p)const{ int ix=std::clamp((int)((p.x-lo.x)/cell),0,nx-1),iy=std::clamp((int)((p.y-lo.y)/cell),0,ny-1),iz=std::clamp((int)((p.z-lo.z)/cell),0,nz-1);
        return (iz*ny+iy)*nx+ix; }
    void add(int i,V p){ cells[index(p)].push_back(i); }
};
template<class F> static void par(int n,F f){ unsigned T=std::max(1u,std::thread::hardware_concurrency()); std::vector<std::thread> th;
    std::atomic<int> next{0}; auto work=[&]{ int i; while((i=next.fetch_add(1))<n) f(i); };
    for(unsigned t=0;t<T;++t) th.emplace_back(work);
    for(auto& x:th) x.join();
}

struct Cam{ V eye,fwd,right,up; float tanHalf,aspect; int W,H; };
static V rayDir(const Cam& c,float px,float py){ float u=(2*(px+0.5f)/c.W-1)*c.tanHalf*c.aspect, v=(1-2*(py+0.5f)/c.H)*c.tanHalf;
    return norm(c.fwd+c.right*u+c.up*v); }
static inline float aces(float x){x*=0.9f;return std::min(1.0f,std::max(0.0f,(x*(2.51f*x+0.03f))/(x*(2.43f*x+0.59f)+0.14f)));}
static inline uint8_t enc(float v){return (uint8_t)std::lround(std::pow(aces(v),1.0f/2.2f)*255.0f);}

int main(int argc,char**argv){
    int W=800,H=450,FRAMES=28,RAYS=8; std::string outDir="Projects/Project-Drive/Diagnostics";
    for(int i=1;i<argc;++i){ std::string a=argv[i]; auto nx=[&](int d){return i+1<argc?std::atoi(argv[++i]):d;};
        if(a=="--w")W=nx(W); else if(a=="--h")H=nx(H); else if(a=="--frames")FRAMES=nx(FRAMES); else if(a=="--rays")RAYS=nx(RAYS); else if(a=="--out")outDir=(i+1<argc?argv[++i]:outDir); }
    using Clock=std::chrono::steady_clock; auto t0=Clock::now();

    std::vector<Tri> tris=BuildScene();
    V mn{1e30f,1e30f,1e30f},mx{-1e30f,-1e30f,-1e30f};
    for(auto&t:tris){ mn=vmin(mn,vmin(vmin(t.a,t.b),t.c)); mx=vmax(mx,vmax(vmax(t.a,t.b),t.c)); }
    BVH bvh; bvh.build(tris);
    auto tBVH=Clock::now();

    Cam cam; cam.eye={-11,-8.5,4.8}; cam.fwd=norm(V{3,0,0.6}-cam.eye); cam.right=norm(cross(cam.fwd,{0,0,1})); cam.up=cross(cam.right,cam.fwd);
    cam.tanHalf=std::tan(55.0f*PI/180.0f/2); cam.aspect=(float)W/H; cam.W=W; cam.H=H;

    // G-buffer
    std::vector<V> gP(W*H),gN(W*H),gA(W*H); std::vector<uint8_t> gV(W*H,0);
    par(W*H,[&](int i){ int x=i%W,y=i/W; V rd=rayDir(cam,(float)x,(float)y); int ti; float t;
        if(bvh.closest(cam.eye,rd,1e5f,ti,t)){ V P=cam.eye+rd*t; V N=tris[ti].n; if(dot(N,rd)>0)N=N*-1.0f;
            gP[i]=P; gN[i]=N; gA[i]=MaterialAlbedo(tris[ti].mat); gV[i]=1; } });

    // spawn surfels on visible surface (coverage-driven: 1 per cell footprint, filled over frames)
    std::vector<Surfel> sf; sf.reserve(200000); Grid grid; grid.build(mn-V{2,2,2},mx+V{2,2,2});
    auto radiusAt=[&](V){ return 0.9f; };
    auto spawnPass=[&](int frame){ RNG rr(hashi(frame*2654435761u+7u));
        for(int i=0;i<W*H;++i){ if(!gV[i]) continue; if(rr.f()>0.04f) continue; // budgeted per frame
            V P=gP[i]; bool covered=false; int ci=grid.index(P);
            for(int s:grid.cells[ci]){ if(len(sf[s].pos-P)<0.75f && dot(sf[s].n,gN[i])>0.7f){covered=true;break;} }
            if(covered) continue;
            Surfel s; s.pos=P; s.n=gN[i]; s.albedo=gA[i]; s.radius=radiusAt(P);
            sf.push_back(s); grid.add((int)sf.size()-1,P); } };

    // one temporal step: each surfel casts hemisphere rays, gathers direct at the hit, running-mean into E
    auto temporal=[&](int frame){ int n=(int)sf.size();
        par(n,[&](int si){ Surfel& s=sf[si]; RNG r(hashi((uint32_t)si*2246822519u ^ (uint32_t)frame*3266489917u));
            V acc{0,0,0}; for(int k=0;k<RAYS;++k){ V d=hemi(s.n,r.f(),r.f()); int ti; float t;
                if(bvh.closest(s.pos+s.n*0.003f,d,1e4f,ti,t)){ V P=s.pos+d*t; V N=tris[ti].n; if(dot(N,d)>0)N=N*-1.0f;
                    acc=acc+DirectLight(bvh,P,N,MaterialAlbedo(tris[ti].mat)); }
                else acc=acc+SkyColour(d); }
            acc=acc*(1.0f/RAYS); acc=acc*s.albedo; // bounce carries the surfel's own albedo (color bleed)
            s.Enew=acc; });
        for(auto& s:sf){ s.age++; float a=1.0f/std::min(s.age,64u); s.E=s.E*(1.0f-a)+s.Enew*a; } };

    for(int f=0;f<FRAMES;++f){ spawnPass(f); temporal(f); }
    auto tGI=Clock::now();

    auto gatherE=[&](V P,V N){ V e{0,0,0}; float wsum=0;
        // search 3x3x3 neighbourhood
        for(int dz=-1;dz<=1;++dz)for(int dy=-1;dy<=1;++dy)for(int dx=-1;dx<=1;++dx){
            V q=P+V{(float)dx,(float)dy,(float)dz}*grid.cell; int c=grid.index(q); if(c<0||c>=(int)grid.cells.size())continue;
            for(int s:grid.cells[c]){ const Surfel& S=sf[s]; float dist=len(S.pos-P); if(dist>S.radius)continue;
                float w=std::max(0.0f,dot(S.n,N)); w*=1.0f-dist/S.radius; if(w<=0)continue; e=e+S.E*w; wsum+=w; } }
        return wsum>0? e*(1.0f/wsum): V{0,0,0}; };

    std::vector<V> img(W*H);
    par(W*H,[&](int i){ int x=i%W,y=i/W; V rd=rayDir(cam,(float)x,(float)y);
        if(!gV[i]){ img[i]=SkyColour(rd); return; }
        V P=gP[i],N=gN[i],A=gA[i];
        V direct=DirectLight(bvh,P,N,A);
        V indirect=gatherE(P,N)*INV_PI; // gathered irradiance -> outgoing radiance
        img[i]=direct+indirect;
        (void)x;(void)y; });

    // write PPM
    std::string ppm=outDir+"/drive_gi.ppm"; FILE* fp=std::fopen(ppm.c_str(),"wb");
    if(fp){ std::fprintf(fp,"P6\n%d %d\n255\n",W,H); for(int i=0;i<W*H;++i){ unsigned char px[3]={enc(img[i].x),enc(img[i].y),enc(img[i].z)}; std::fwrite(px,1,3,fp);} std::fclose(fp); }

    auto tEnd=Clock::now();
    auto ms=[&](Clock::time_point a,Clock::time_point b){ return std::chrono::duration<double,std::milli>(b-a).count(); };
    std::string tim=outDir+"/surfel_timing.log";
    if(FILE* tf=std::fopen(tim.c_str(),"w")){
        std::fprintf(tf,"# Project-Drive SurfelReference timing\n");
        std::fprintf(tf,"resolution        %dx%d\n",W,H);
        std::fprintf(tf,"triangles         %zu\n",tris.size());
        std::fprintf(tf,"bvh_nodes         %zu\n",bvh.nodes.size());
        std::fprintf(tf,"surfels           %zu\n",sf.size());
        std::fprintf(tf,"gi_frames         %d (rays/surfel %d)\n",FRAMES,RAYS);
        std::fprintf(tf,"build_bvh_ms      %.1f\n",ms(t0,tBVH));
        std::fprintf(tf,"surfel_gi_ms      %.1f\n",ms(tBVH,tGI));
        std::fprintf(tf,"final_shade_ms    %.1f\n",ms(tGI,tEnd));
        std::fprintf(tf,"total_ms          %.1f\n",ms(t0,tEnd));
        std::fclose(tf);
    }
    std::printf("SurfelReference: %zu tris, %zu surfels, %dx%d, %d GI frames -> %s (%.1f ms total)\n",
                tris.size(), sf.size(), W, H, FRAMES, ppm.c_str(), ms(t0,tEnd));
    return 0;
}
