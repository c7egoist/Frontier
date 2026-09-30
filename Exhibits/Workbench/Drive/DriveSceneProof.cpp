//============================================================================================================================================
//                                                      DRIVESCENEPROOF.CPP
//============================================================================================================================================
// 📦 Headless CPU mirror of the Project-Drive scene — the proof that `Project-Zero.exe --scene drive` shows the right
//    thing. It builds the SAME geometry the app loads (checker pad + ramp + speed bumps + cones from DriveCourse, the
//    real ControlVehicle shell, and the four procedural wheels), then renders it with a dependency-free CPU path:
//    a BVH-traced G-buffer, sharp DIRECT sun (next-event + shadow ray) + sky, a world-space SURFEL field for the
//    INDIRECT bounce, and a clearcoat-with-metallic-flakes term on the body so the flake paint is visible in the proof.
//    No Vulkan, no GLFW, no window. Writes an 8-bit RGB PNG through the dependency-free PngWriteCodec and gates the
//    result (scene non-empty, body/course/wheels covered, every pixel finite). Mirror of Exhibits/Workbench/Editor.
//
//    Output: Exhibits/Gallery/Drive/DriveScene.png    Runner: DriveSceneProof.py
//
//    Build (plain g++, no GPU):
//      g++ -std=c++20 -O2 -pthread Exhibits/Workbench/Drive/DriveSceneProof.cpp -o DriveSceneProof && ./DriveSceneProof

#include "../../../VehiclePhysics/Overlay/Projects/Project-Drive/Source/DriveCourse.h"
#include "../../../VehiclePhysics/Overlay/Projects/Project-Drive/Source/ControlVehicleMesh.inl"
#include "PngWriteCodec.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <stdexcept>
#include <string>
#include <thread>
#include <atomic>
#include <vector>

namespace DC = Frontier::Drive;

//------------------------------------------------------------------------------------------------------------------------ proof gates
static unsigned g_Checks = 0u;
static void Check(bool Ok, const char* Message) { ++g_Checks; if (!Ok) throw std::runtime_error(Message); }

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
        case DC::MatBodyPaint:     return {0.020f,0.050f,0.30f}; // MAMetalicCoat; coat + dense finite flakes below
        case DC::MatVehicleGlass:  return {0.012f,0.042f,0.075f};
        case DC::MatVehiclePlastic:return {0.010f,0.012f,0.016f};
        case DC::MatTyre:          return {0.010f,0.012f,0.014f};
        case DC::MatHub:           return {0.42f,0.44f,0.50f};
        case DC::MatBrake:         return {0.30f,0.070f,0.020f};
        default:                   return {0.8f,0.1f,0.8f};
    }
}

//------------------------------------------------------------------------------------------------------------------------ scene build
// ControlVehicle.blend supplies MAGlass, MAMetalicCoat and MAPlastic families.  The checked-in, dependency-free
// mesh extraction flattens its topology but not its authored source-space regions, so this is the same documented
// classifier used by DriveSceneAuthor rather than a body-wide paint fallback.
static uint32_t ClassifyControlVehicleMaterial(V a,V b,V c)
{
    const V p=(a+b+c)*(1.0f/3.0f), n=norm(cross(b-a,c-a)); const float side=std::fabs(p.y);
    if(p.z>0.62f&&p.z<1.31f&&p.x>-2.05f&&p.x<1.62f&&(side>0.47f||std::fabs(n.x)>0.48f)) return DC::MatVehicleGlass;
    if(p.z<0.16f||(side>0.98f&&p.z<0.46f)||(p.x>2.72f&&p.z<0.50f)||(p.x<-2.72f&&p.z<0.57f)) return DC::MatVehiclePlastic;
    return DC::MatBodyPaint;
}
struct VehiclePose { float x=0.0f,y=0.0f,z=0.2486f,yaw=0.0f; };
static V PosePoint(V p,const VehiclePose& pose){ const float c=std::cos(pose.yaw),sn=std::sin(pose.yaw); return V{pose.x+c*p.x-sn*p.y, pose.y+sn*p.x+c*p.y, p.z+pose.z}; }
static void EmitCar(std::vector<Tri>& tris, const VehiclePose& pose)
{
    using namespace Frontier::Drive::ControlVehicleMesh;
    auto Raw=[&](uint32_t i){ return V{kPositions[i*3+0],kPositions[i*3+1],kPositions[i*3+2]}; };
    for(uint32_t t=0;t<kTriangleCount;++t){ V a=Raw(kTriangles[t*3+0]), b=Raw(kTriangles[t*3+1]), c=Raw(kTriangles[t*3+2]);
        Tri T; T.a=PosePoint(a,pose); T.b=PosePoint(b,pose); T.c=PosePoint(c,pose); T.n=norm(cross(T.b-T.a,T.c-T.a));
        T.mat=ClassifyControlVehicleMaterial(a,b,c); tris.push_back(T);
    }
}
// A visibly load-bearing tyre silhouette: a flattened contact patch, rounded shoulders, tread blocks, alloy rim
// and warm brake disc.  The companion XPBD proof below validates the exact carcass-node deformation; this renderer
// keeps the rendered tyre recognisable at the opening camera instead of a rigid flat black cylinder.
static void EmitWheel(std::vector<Tri>& tris, const VehiclePose& pose, V centre, float R, float hw, uint32_t seg)
{
    const float rim=R*0.58f, disc=R*0.39f, cap=R*0.14f;
    auto tyrePoint=[&](float a,float y){
        const float c=std::cos(a), sn=std::sin(a);
        const float contact=std::max(0.0f,(-sn-0.72f)/0.28f);       // lower 28% is an actual flat contact patch
        const float radius=R*(1.0f+0.050f*contact*contact);         // loaded sidewall bulges around the patch
        const float z=sn < -0.72f ? -R*0.72f : radius*sn;
        return PosePoint(V{centre.x+radius*c, y, centre.z+z}, pose);
    };
    auto ring=[&](float a,float r,float y){return PosePoint(V{centre.x+r*std::cos(a),y,centre.z+r*std::sin(a)}, pose);};
    auto addq=[&](V a,V b,V c,V d,uint32_t m){ Tri t1{a,b,c,norm(cross(b-a,c-a)),m}; Tri t2{a,c,d,norm(cross(c-a,d-a)),m}; tris.push_back(t1); tris.push_back(t2); };
    for(uint32_t s=0;s<seg;++s){
        const float a0=2*PI*s/seg,a1=2*PI*(s+1)/seg;
        const V oL0=tyrePoint(a0,-hw),oL1=tyrePoint(a1,-hw),oR0=tyrePoint(a0,hw),oR1=tyrePoint(a1,hw);
        const V rL0=ring(a0,rim,-hw),rL1=ring(a1,rim,-hw),rR0=ring(a0,rim,hw),rR1=ring(a1,rim,hw);
        const V dL0=ring(a0,disc,-hw-0.003f),dL1=ring(a1,disc,-hw-0.003f),dR0=ring(a0,disc,hw+0.003f),dR1=ring(a1,disc,hw+0.003f);
        const V cL0=ring(a0,cap,-hw-0.006f),cL1=ring(a1,cap,-hw-0.006f),cR0=ring(a0,cap,hw+0.006f),cR1=ring(a1,cap,hw+0.006f);
        addq(oL0,oL1,oR1,oR0,DC::MatTyre);           // tread band
        addq(oL0,rL0,rL1,oL1,DC::MatTyre);           // left sidewall
        addq(rR1,rR0,oR0,oR1,DC::MatTyre);           // right sidewall
        addq(rL0,dL0,dL1,rL1,DC::MatHub);            // rim faces
        addq(dR1,dR0,rR0,rR1,DC::MatHub);
        addq(dL0,cL0,cL1,dL1,DC::MatBrake);          // brake discs
        addq(cR1,cR0,dR0,dR1,DC::MatBrake);
        // alternating tread grooves are narrow raised blocks: coarse enough to read at the proof resolution.
        if((s&3u)==0u){ const float am=(a0+a1)*0.5f, w=0.022f; V g0=tyrePoint(am-w,-hw),g1=tyrePoint(am+w,-hw),g2=tyrePoint(am+w,hw),g3=tyrePoint(am-w,hw); addq(g0,g1,g2,g3,DC::MatVehiclePlastic); }
    }
}
struct BuildResult { std::vector<Tri> tris; size_t course=0, body=0, wheels=0; };
static BuildResult BuildScene(const VehiclePose& pose)
{
    BuildResult R; R.tris.reserve(8000);
    DC::EmitCourseTriangles([&](float ax,float ay,float az,float bx,float by,float bz,float cx,float cy,float cz,uint32_t m){
        Tri t; t.a={ax,ay,az}; t.b={bx,by,bz}; t.c={cx,cy,cz}; t.n=norm(cross(t.b-t.a,t.c-t.a)); t.mat=m; R.tris.push_back(t);
    });
    R.course=R.tris.size();
    EmitCar(R.tris, pose);
    R.body=R.tris.size()-R.course;
    const float hub[4][3]={{1.7274f,1.0475f,0.0914f},{1.7274f,-1.0475f,0.0914f},{-1.6686f,1.0475f,0.0914f},{-1.6686f,-1.0475f,0.0914f}};
    for(int w=0;w<4;++w) EmitWheel(R.tris, pose, V{hub[w][0],hub[w][1],hub[w][2]-0.030f}, 0.34f, 0.145f, 64u);
    R.wheels=R.tris.size()-R.course-R.body;
    return R;
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
static const V   SUN_DIR = norm(V{-0.35f,-0.30f,0.88f});     // points TOWARD the sun
static const V   SUN_COL = V{1.0f,0.95f,0.85f}*3.0f;
static V SkyColour(V d)
{
    const float μ = std::max(0.0f, d.z);
    const float s = std::max(0.0f, dot(d, SUN_DIR));
    const V horizon{0.92f,0.56f,0.30f};
    const V zenith{0.08f,0.23f,0.72f};
    const V aerial{0.48f,0.64f,0.95f};
    V sky = horizon*std::pow(1.0f-μ,2.0f) + aerial*(0.35f+0.45f*μ) + zenith*std::pow(μ,0.65f);
    sky = sky + SUN_COL*(0.018f*std::pow(s,420.0f) + 0.025f*std::pow(s,18.0f));
    return sky;
}
static V DirectLight(const BVH& bvh, V P, V N, V albedo){
    V c{0,0,0};
    const float ndl=dot(N,SUN_DIR);
    if(ndl>0 && !bvh.anyHit(P+N*0.002f, SUN_DIR, 1e4f))
        c = albedo*INV_PI * (SUN_COL*ndl);
    c = c + albedo * (SkyColour(V{0,0,1}) * (0.35f*(0.5f+0.5f*N.z)));
    return c;
}
// CPU ReSTIR-DI mirror: build a per-pixel weighted reservoir from finite sun-disc candidates, then shade the
// chosen candidate once.  This is a reference implementation of the selection path only; it is visibly and
// separately labelled in provenance and must not be mistaken for the native Vulkan/Slang ReSTIR dispatch.
static V RestirDirectMirror(const BVH& bvh,V P,V N,V albedo,uint32_t seed){
    RNG rng(seed); V tangent=norm(std::fabs(SUN_DIR.z)>0.9f?cross(SUN_DIR,{0,1,0}):cross(SUN_DIR,{0,0,1})); V bitangent=cross(SUN_DIR,tangent);
    V chosen=SUN_DIR; float selectedWeight=0.0f, weightSum=0.0f;
    for(int candidate=0;candidate<12;++candidate){
        const float r=0.028f*std::sqrt(rng.f()), a=2.0f*PI*rng.f(); V light=norm(SUN_DIR+tangent*(r*std::cos(a))+bitangent*(r*std::sin(a)));
        const float w=std::max(0.0f,dot(N,light)); weightSum+=w;
        if(w>0.0f&&rng.f()*weightSum<w){chosen=light;selectedWeight=w;}
    }
    V c=albedo*(SkyColour({0,0,1})*(0.28f*(0.5f+0.5f*N.z)));
    if(selectedWeight>0.0f&&!bvh.anyHit(P+N*0.002f,chosen,1e4f)) c=c+albedo*INV_PI*(SUN_COL*selectedWeight);
    return c;
}
// Dense finite-flake cobalt paint.  The old proof only fired a sparse, extremely sharp glint condition, so a
// painted panel read as flat blue except for a few accidental pixels.  Here every paint panel receives a high-density
// 0.9--1.5 mm metal-flake population, coloured aggregate sparkle AND occasional hot microfacets beneath a clearly
// separate low-roughness dielectric clearcoat.  This is intentionally a close-camera proof setting: flakes must be
// legible, not merely mentioned in metadata.
static V BodyCoatAndFlakes(const BVH& bvh, V P, V N, V viewDir){
    const float ndv=std::max(0.0f,dot(N,viewDir));
    const float fres=0.04f+0.96f*std::pow(1.0f-ndv,5.0f);
    const V H=norm(SUN_DIR+viewDir);
    const bool sun=dot(N,SUN_DIR)>0.0f && !bvh.anyHit(P+N*0.002f,SUN_DIR,1e4f);

    // Clearcoat is a broad sky reflection plus a tight direct reflection.  It stays visible on the whole body,
    // including panels not exactly aligned with the sun.
    V coat=SkyColour(N)*(0.10f*fres) + V{1.0f,1.0f,1.0f}*(sun?std::pow(std::max(0.0f,dot(N,H)),35.0f)*(1.65f+2.2f*fres):0.0f);

    const float cells=520.0f; // finite cells around 1.9 mm: dense but still individually legible in the close proof
    const int cx=(int)std::floor(P.x*cells), cy=(int)std::floor(P.y*cells), cz=(int)std::floor(P.z*cells);
    uint32_t h=hashi((uint32_t)cx*73856093u^(uint32_t)cy*19349663u^(uint32_t)cz*83492791u);
    const float pick=(float)(h&0xffffu)*(1.0f/65535.0f);
    const float grain=(float)((h>>16u)&0xffu)*(1.0f/255.0f);
    V flake{0,0,0};
    if(pick<0.76f) // 76% finite-flake coverage: unmistakable dense automotive metallic population
    {
        RNG r(h^0x91e10da5u);
        const V micro=norm(N+V{r.f()-0.5f,r.f()-0.5f,r.f()-0.5f}*0.52f);
        const float glint=sun?std::pow(std::max(0.0f,dot(micro,H)),150.0f)*9.0f:0.0f;
        const V silverBlue{0.42f+0.38f*grain,0.62f+0.30f*grain,0.90f+0.10f*grain};
        flake=silverBlue*(0.012f+0.070f*grain+0.28f*glint); // dense but physically modest aggregate metallic grain
    }
    return coat+flake;
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

// A label is burned into every beauty frame so the PNG itself, not only its name and provenance, makes the
// CPU-reference boundary clear.  This deliberately tiny 5x7 type avoids a runtime font/rendering dependency.
static unsigned char LabelGlyph(char c, int row)
{
    switch(c) {
    case 'A':{static const unsigned char g[]={14,17,17,31,17,17,17};return g[row];} case 'C':{static const unsigned char g[]={14,17,16,16,16,17,14};return g[row];}
    case 'D':{static const unsigned char g[]={30,17,17,17,17,17,30};return g[row];} case 'E':{static const unsigned char g[]={31,16,16,30,16,16,31};return g[row];} case 'F':{static const unsigned char g[]={31,16,16,30,16,16,16};return g[row];}
    case 'G':{static const unsigned char g[]={14,17,16,23,17,17,14};return g[row];} case 'I':{static const unsigned char g[]={31,4,4,4,4,4,31};return g[row];}
    case 'K':{static const unsigned char g[]={17,18,20,24,20,18,17};return g[row];} case 'L':{static const unsigned char g[]={16,16,16,16,16,16,31};return g[row];}
    case 'N':{static const unsigned char g[]={17,25,21,19,17,17,17};return g[row];} case 'O':{static const unsigned char g[]={14,17,17,17,17,17,14};return g[row];}
    case 'P':{static const unsigned char g[]={30,17,17,30,16,16,16};return g[row];} case 'R':{static const unsigned char g[]={30,17,17,30,20,18,17};return g[row];}
    case 'S':{static const unsigned char g[]={15,16,16,14,1,1,30};return g[row];} case 'T':{static const unsigned char g[]={31,4,4,4,4,4,4};return g[row];}
    case 'U':{static const unsigned char g[]={17,17,17,17,17,17,14};return g[row];} case 'V':{static const unsigned char g[]={17,17,17,17,17,10,4};return g[row];}
    case '-':{static const unsigned char g[]={0,0,0,31,0,0,0};return g[row];} case '/':{static const unsigned char g[]={1,2,2,4,8,8,16};return g[row];}
    case ' ': return 0; default: return 0;
    }
}
static void BurnReferenceLabel(std::vector<unsigned char>& rgb,int W,const std::string& label)
{
    const int x0=14,y0=14,h=34,w=std::min(W-28,static_cast<int>(label.size())*12+22);
    for(int y=y0;y<y0+h;++y) for(int x=x0;x<x0+w;++x) { const size_t i=static_cast<size_t>(y*W+x)*3u; rgb[i+0]=8;rgb[i+1]=22;rgb[i+2]=39; }
    int x=x0+10; constexpr int scale=2;
    for(char raw:label) { const char c=raw>='a'&&raw<='z'?static_cast<char>(raw-'a'+'A'):raw;
        for(int row=0;row<7;++row) { const unsigned char bits=LabelGlyph(c,row); for(int col=0;col<5;++col) if(bits&(1u<<(4-col)))
            for(int yy=0;yy<scale;++yy) for(int xx=0;xx<scale;++xx) { const int px=x+col*scale+xx,py=y0+10+row*scale+yy; const size_t i=static_cast<size_t>(py*W+px)*3u; rgb[i+0]=122;rgb[i+1]=231;rgb[i+2]=241; } }
        x+=6*scale;
    }
}

int main(int argc,char**argv){ try {
    int W=960,H=540,FRAMES=28,RAYS=8; std::string outDir="Exhibits/Gallery/Drive"; std::string name="DriveScene";
    std::string renderMode="surfel"; // "visibility" = primary visibility shade, "surfel" = field GI, "restir" = CPU DI reservoir mirror
    V eye{-11,-8.5,4.8}, look{3,0,0.6}; float fovDeg=55.0f; VehiclePose pose;
    for(int i=1;i<argc;++i){ std::string a=argv[i]; auto nx=[&](int d){return i+1<argc?std::atoi(argv[++i]):d;};
        auto nf=[&](float d){return i+1<argc?(float)std::atof(argv[++i]):d;};
        if(a=="--w")W=nx(W); else if(a=="--h")H=nx(H); else if(a=="--frames")FRAMES=nx(FRAMES); else if(a=="--rays")RAYS=nx(RAYS);
        else if(a=="--out")outDir=(i+1<argc?argv[++i]:outDir); else if(a=="--name")name=(i+1<argc?argv[++i]:name);
        else if(a=="--render-mode")renderMode=(i+1<argc?argv[++i]:renderMode);
        else if(a=="--eye"){ eye.x=nf(eye.x); eye.y=nf(eye.y); eye.z=nf(eye.z); }
        else if(a=="--look"){ look.x=nf(look.x); look.y=nf(look.y); look.z=nf(look.z); }
        else if(a=="--fov")fovDeg=nf(fovDeg);
        else if(a=="--vehicle-pose"){ pose.x=nf(pose.x); pose.y=nf(pose.y); pose.z=nf(pose.z); pose.yaw=nf(pose.yaw); } }
    std::error_code ec; std::filesystem::create_directories(outDir, ec);
    Check(renderMode=="visibility" || renderMode=="surfel" || renderMode=="restir", "--render-mode must be visibility, surfel or restir");
    const bool RestirMode = renderMode=="restir";
    const bool VisibilityMode = renderMode=="visibility";
    using Clock=std::chrono::steady_clock; auto t0=Clock::now();

    BuildResult scene=BuildScene(pose);
    std::vector<Tri>& tris=scene.tris;
    Check(!tris.empty(), "scene has no triangles");
    Check(scene.course>0 && scene.body>0 && scene.wheels>0, "scene missing course, body, or wheels");
    Check(scene.body==Frontier::Drive::ControlVehicleMesh::kTriangleCount, "body triangle count != ControlVehicle mesh");

    V mn{1e30f,1e30f,1e30f},mx{-1e30f,-1e30f,-1e30f};
    for(auto&t:tris){ mn=vmin(mn,vmin(vmin(t.a,t.b),t.c)); mx=vmax(mx,vmax(vmax(t.a,t.b),t.c)); }
    BVH bvh; bvh.build(tris);
    Check(!bvh.nodes.empty(), "BVH build produced no nodes");
    auto tBVH=Clock::now();

    Cam cam; cam.eye=eye; cam.fwd=norm(look-cam.eye); cam.right=norm(cross(cam.fwd,{0,0,1})); cam.up=cross(cam.right,cam.fwd);
    cam.tanHalf=std::tan(fovDeg*PI/180.0f/2); cam.aspect=(float)W/H; cam.W=W; cam.H=H;

    // G-buffer
    std::vector<V> gP(W*H),gN(W*H),gA(W*H); std::vector<uint8_t> gV(W*H,0); std::vector<uint8_t> gBody(W*H,0);
    par(W*H,[&](int i){ int x=i%W,y=i/W; V rd=rayDir(cam,(float)x,(float)y); int ti; float t;
        if(bvh.closest(cam.eye,rd,1e5f,ti,t)){ V P=cam.eye+rd*t; V N=tris[ti].n; if(dot(N,rd)>0)N=N*-1.0f;
            gP[i]=P; gN[i]=N; gA[i]=MaterialAlbedo(tris[ti].mat); gV[i]=1; gBody[i]=(tris[ti].mat==DC::MatBodyPaint); } });

    std::vector<Surfel> sf; sf.reserve(200000); Grid grid; grid.build(mn-V{2,2,2},mx+V{2,2,2});
    auto radiusAt=[&](V){ return 0.9f; };
    auto spawnPass=[&](int frame){ RNG rr(hashi(frame*2654435761u+7u));
        for(int i=0;i<W*H;++i){ if(!gV[i]) continue; if(rr.f()>0.04f) continue;
            V P=gP[i]; bool covered=false; int ci=grid.index(P);
            for(int s:grid.cells[ci]){ if(len(sf[s].pos-P)<0.75f && dot(sf[s].n,gN[i])>0.7f){covered=true;break;} }
            if(covered) continue;
            Surfel s; s.pos=P; s.n=gN[i]; s.albedo=gA[i]; s.radius=radiusAt(P);
            sf.push_back(s); grid.add((int)sf.size()-1,P); } };
    auto temporal=[&](int frame){ int n=(int)sf.size();
        par(n,[&](int si){ Surfel& s=sf[si]; RNG r(hashi((uint32_t)si*2246822519u ^ (uint32_t)frame*3266489917u));
            V acc{0,0,0}; for(int k=0;k<RAYS;++k){ V d=hemi(s.n,r.f(),r.f()); int ti; float t;
                if(bvh.closest(s.pos+s.n*0.003f,d,1e4f,ti,t)){ V P=s.pos+d*t; V N=tris[ti].n; if(dot(N,d)>0)N=N*-1.0f;
                    acc=acc+DirectLight(bvh,P,N,MaterialAlbedo(tris[ti].mat)); }
                else acc=acc+SkyColour(d); }
            acc=acc*(1.0f/RAYS); acc=acc*s.albedo; s.Enew=acc; });
        for(auto& s:sf){ s.age++; float a=1.0f/std::min(s.age,64u); s.E=s.E*(1.0f-a)+s.Enew*a; } };

    if(!RestirMode && !VisibilityMode)
        for(int f=0;f<FRAMES;++f){ spawnPass(f); temporal(f); }
    auto tGI=Clock::now();

    auto gatherE=[&](V P,V N){ V e{0,0,0}; float wsum=0;
        for(int dz=-1;dz<=1;++dz)for(int dy=-1;dy<=1;++dy)for(int dx=-1;dx<=1;++dx){
            V q=P+V{(float)dx,(float)dy,(float)dz}*grid.cell; int c=grid.index(q); if(c<0||c>=(int)grid.cells.size())continue;
            for(int s:grid.cells[c]){ const Surfel& S=sf[s]; float dist=len(S.pos-P); if(dist>S.radius)continue;
                float w=std::max(0.0f,dot(S.n,N)); w*=1.0f-dist/S.radius; if(w<=0)continue; e=e+S.E*w; wsum+=w; } }
        return wsum>0? e*(1.0f/wsum): V{0,0,0}; };

    std::vector<V> img(W*H);
    par(W*H,[&](int i){ int x=i%W,y=i/W; V rd=rayDir(cam,(float)x,(float)y); (void)x;(void)y;
        if(!gV[i]){ img[i]=SkyColour(rd); return; }
        V P=gP[i],N=gN[i],A=gA[i];
        V c=VisibilityMode ? DirectLight(bvh,P,N,A)
                         : (RestirMode ? RestirDirectMirror(bvh,P,N,A,hashi(static_cast<uint32_t>(i)*0x9e3779b9u))
                                       : DirectLight(bvh,P,N,A) + gatherE(P,N)*INV_PI);
        if(gBody[i] && !VisibilityMode) c=c+BodyCoatAndFlakes(bvh,P,N,rd*-1.0f);
        img[i]=c; });

    // gate: every pixel finite, and the scene actually covers a sensible fraction of the frame
    std::atomic<int> nonFinite{0}, covered{0};
    par(W*H,[&](int i){ const V& c=img[i];
        if(!(std::isfinite(c.x)&&std::isfinite(c.y)&&std::isfinite(c.z))) nonFinite.fetch_add(1);
        if(gV[i]) covered.fetch_add(1); });
    Check(nonFinite.load()==0, "render produced non-finite pixels");
    Check(covered.load() > (W*H)/10, "scene covers < 10% of the frame (camera/scene mismatch)");

    // encode + write PNG through the engine writer
    std::vector<unsigned char> rgb((size_t)W*H*3);
    for(int i=0;i<W*H;++i){ rgb[i*3+0]=enc(img[i].x); rgb[i*3+1]=enc(img[i].y); rgb[i*3+2]=enc(img[i].z); }
    BurnReferenceLabel(rgb,W,VisibilityMode ? "CPU RASTER REFERENCE - NOT VULKAN/SLANG" : (RestirMode ? "CPU RESTIR-DI REFERENCE - NOT VULKAN/SLANG" : "CPU SURFEL-GI REFERENCE - NOT VULKAN/SLANG"));
    const std::string png=outDir+"/"+name+".png";
    Check(PngWriteCodec::EncodeRgbFile(png.c_str(), W, H, 3, rgb.data(), W*3), "PNG write failed");

    auto tEnd=Clock::now();
    auto ms=[&](Clock::time_point a,Clock::time_point b){ return std::chrono::duration<double,std::milli>(b-a).count(); };
    std::printf("DriveSceneProof [%s CPU reference]: %zu tris (course %zu, body %zu, wheels %zu), %zu surfels, %dx%d, %d GI frames, pose %.2f %.2f %.2f yaw %.2f\n",
                renderMode.c_str(), tris.size(), scene.course, scene.body, scene.wheels, sf.size(), W, H, (RestirMode || VisibilityMode) ? 0 : FRAMES, pose.x, pose.y, pose.z, pose.yaw);
    std::printf("  bvh %.0f ms | surfel-gi %.0f ms | shade %.0f ms | total %.0f ms\n",
                ms(t0,tBVH), ms(tBVH,tGI), ms(tGI,tEnd), ms(t0,tEnd));
    std::printf("  %u checks passed -> %s\n", g_Checks, png.c_str());
    return 0;
} catch(const std::exception& e){ std::fprintf(stderr,"DriveSceneProof FAILED: %s\n", e.what()); return 1; } }
