//============================================================================================================================================
// XPBDTyreProof.cpp — compact visual evidence for Project-Drive's real XPBDSoftTyre carcass.
//
// This is deliberately a CPU reference graphic, not an ImGui/Vulkan capture.  It builds and settles the same
// multi-ring XPBDSoftTyre used by VehicleSolver, then draws the actual resolved nodes against the rest carcass.
//============================================================================================================================================

#include "../../../Frontier/Engine/PhysicalDynamics/Vehicle/XPBDSoftTyre.h"
#include "PngWriteCodec.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <string>
#include <vector>

using namespace Frontier::Vehicle;

struct Colour { unsigned char r,g,b; };
struct Image
{
    int W,H; std::vector<unsigned char> px;
    Image(int w,int h) : W(w),H(h),px(static_cast<size_t>(w*h*3u),0u) {}
    void Set(int x,int y,Colour c) { if(x>=0&&x<W&&y>=0&&y<H) { auto i=static_cast<size_t>(y*W+x)*3u; px[i]=c.r;px[i+1]=c.g;px[i+2]=c.b; } }
    void Rect(int x0,int y0,int x1,int y1,Colour c) { for(int y=y0;y<=y1;++y) for(int x=x0;x<=x1;++x) Set(x,y,c); }
    void Line(int x0,int y0,int x1,int y1,Colour c)
    { const int dx=std::abs(x1-x0),sx=x0<x1?1:-1,dy=-std::abs(y1-y0),sy=y0<y1?1:-1; int e=dx+dy;
      for(;;){Set(x0,y0,c);if(x0==x1&&y0==y1)break;const int e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}} }
    void Disc(int cx,int cy,int r,Colour c) { for(int y=-r;y<=r;++y) for(int x=-r;x<=r;++x) if(x*x+y*y<=r*r) Set(cx+x,cy+y,c); }
};

static constexpr Colour kInk{222,233,246}, kDim{124,151,177}, kPanel{20,31,48}, kPanel2{29,47,69};
static constexpr Colour kCyan{48,210,224}, kBlue{38,102,236}, kOrange{255,162,48}, kRed{244,78,76}, kWhite{244,249,255};

// 5x7 uppercase glyphs: enough for direct, zero-dependency chart labelling.
static unsigned char Glyph(char c, int row)
{
    switch(c) {
    case 'A':{static const unsigned char g[]={14,17,17,31,17,17,17};return g[row];} case 'B':{static const unsigned char g[]={30,17,17,30,17,17,30};return g[row];}
    case 'C':{static const unsigned char g[]={14,17,16,16,16,17,14};return g[row];} case 'D':{static const unsigned char g[]={30,17,17,17,17,17,30};return g[row];}
    case 'E':{static const unsigned char g[]={31,16,16,30,16,16,31};return g[row];} case 'F':{static const unsigned char g[]={31,16,16,30,16,16,16};return g[row];}
    case 'G':{static const unsigned char g[]={14,17,16,23,17,17,14};return g[row];} case 'H':{static const unsigned char g[]={17,17,17,31,17,17,17};return g[row];}
    case 'I':{static const unsigned char g[]={31,4,4,4,4,4,31};return g[row];} case 'J':{static const unsigned char g[]={7,2,2,2,2,18,12};return g[row];} case 'L':{static const unsigned char g[]={16,16,16,16,16,16,31};return g[row];}
    case 'M':{static const unsigned char g[]={17,27,21,21,17,17,17};return g[row];} case 'N':{static const unsigned char g[]={17,25,21,19,17,17,17};return g[row];}
    case 'O':{static const unsigned char g[]={14,17,17,17,17,17,14};return g[row];} case 'P':{static const unsigned char g[]={30,17,17,30,16,16,16};return g[row];} case 'Q':{static const unsigned char g[]={14,17,17,17,21,18,13};return g[row];}
    case 'R':{static const unsigned char g[]={30,17,17,30,20,18,17};return g[row];} case 'S':{static const unsigned char g[]={15,16,16,14,1,1,30};return g[row];}
    case 'T':{static const unsigned char g[]={31,4,4,4,4,4,4};return g[row];} case 'U':{static const unsigned char g[]={17,17,17,17,17,17,14};return g[row];} case 'V':{static const unsigned char g[]={17,17,17,17,17,10,4};return g[row];} case 'W':{static const unsigned char g[]={17,17,17,21,21,21,10};return g[row];}
    case 'X':{static const unsigned char g[]={17,17,10,4,10,17,17};return g[row];} case 'Y':{static const unsigned char g[]={17,17,10,4,4,4,4};return g[row];}
    case 'Z':{static const unsigned char g[]={31,1,2,4,8,16,31};return g[row];}
    case '0':{static const unsigned char g[]={14,17,19,21,25,17,14};return g[row];} case '1':{static const unsigned char g[]={4,12,4,4,4,4,14};return g[row];}
    case '2':{static const unsigned char g[]={14,17,1,2,4,8,31};return g[row];} case '3':{static const unsigned char g[]={30,1,1,14,1,1,30};return g[row];}
    case '4':{static const unsigned char g[]={2,6,10,18,31,2,2};return g[row];} case '5':{static const unsigned char g[]={31,16,16,30,1,1,30};return g[row];}
    case '6':{static const unsigned char g[]={14,16,16,30,17,17,14};return g[row];} case '7':{static const unsigned char g[]={31,1,2,4,8,8,8};return g[row];}
    case '8':{static const unsigned char g[]={14,17,17,14,17,17,14};return g[row];} case '9':{static const unsigned char g[]={14,17,17,15,1,1,14};return g[row];}
    case '-':{static const unsigned char g[]={0,0,0,31,0,0,0};return g[row];} case '/':{static const unsigned char g[]={1,2,2,4,8,8,16};return g[row];}
    case ':':{static const unsigned char g[]={0,4,4,0,4,4,0};return g[row];} case '.':{static const unsigned char g[]={0,0,0,0,0,6,6};return g[row];} case ' ' : return 0;
    default:return 0; }
}
static void Text(Image& img,int x,int y,const std::string& text,int scale,Colour c)
{ for(char raw:text){ char ch=raw>='a'&&raw<='z'?static_cast<char>(raw-'a'+'A'):raw; for(int r=0;r<7;++r){unsigned char bits=Glyph(ch,r);for(int col=0;col<5;++col)if(bits&(1u<<(4-col)))img.Rect(x+col*scale,y+r*scale,x+(col+1)*scale-1,y+(r+1)*scale-1,c);}x+=6*scale;} }

int main(int argc,char**argv)
{
    std::string output="Exhibits/Gallery/Drive/ProjectDriveXPBDTyreDeformation_CPU_Reference.png";
    if(argc>1) output=argv[1];
    SoftTyreParameters p; p.RingCount=5u; p.SegmentCount=64u;
    const float hubZ=p.Radius-0.032f;
    XPBDSoftTyre tyre; tyre.Build(p,{0,0,hubZ},Quat{});
    auto ground=[](const Vec3& q,Vec3& s,Vec3& n){s={q.x,q.y,0.0f};n={0,0,1};return true;};
    for(int i=0;i<850;++i) tyre.Step(1.0f/1800.0f,12u,Vec3{0,0,hubZ},Quat{},Vec3{0,0,0},ground);
    const TyreReaction r=tyre.Reaction();
    if(tyre.Nodes().size()!=p.RingCount*p.SegmentCount || r.ContactCount<9u || !(r.Force.z>100.0f)) { std::fprintf(stderr,"XPBD proof gate failed: nodes=%zu contacts=%u fz=%.1f\n",tyre.Nodes().size(),r.ContactCount,r.Force.z); return 1; }

    Image image(1440,820); image.Rect(0,0,image.W-1,image.H-1,{10,18,31});
    image.Rect(34,32,1405,104,kPanel2); Text(image,60,50,"PROJECT DRIVE  XPBD TYRE DEFORMATION",3,kWhite);
    Text(image,60,80,"CPU REFERENCE - REAL XPBDSOFTTYRE NODES, NOT A VULKAN OR IMGUI CAPTURE",1,kDim);
    image.Rect(34,128,925,773,kPanel); image.Rect(955,128,1405,773,kPanel);
    Text(image,66,153,"LOADED CARCASS / REST GHOST",2,kInk); Text(image,982,153,"SOLVER READOUT",2,kInk);
    const int cx=475,cy=590; const float pxPerM=500.0f;
    auto map=[&](const Vec3& q){return std::pair<int,int>{cx+static_cast<int>(q.x*pxPerM+0.5f),cy-static_cast<int>(q.z*pxPerM+0.5f)};};
    // Ground and rest tyre ghost.
    image.Rect(70,cy,885,cy+4,{58,81,101}); Text(image,90,cy+18,"DIRECT HEIGHTFIELD CONTACT Z 0",1,kDim);
    for(int s=0;s<128;++s){float a=2.0f*3.14159265f*s/128.0f;int x=cx+static_cast<int>(p.Radius*std::cos(a)*pxPerM),y=cy-static_cast<int>((hubZ+p.Radius*std::sin(a))*pxPerM);image.Disc(x,y,1,kDim);}
    // Actual multi-ring lattice; the two outside rings are bright, inner rings provide the deforming sidewall evidence.
    const Colour rings[]={kBlue,{51,156,229},kCyan,{51,156,229},kBlue};
    const auto& nodes=tyre.Nodes();
    for(uint32_t ring=0;ring<p.RingCount;++ring) for(uint32_t seg=0;seg<p.SegmentCount;++seg){ const auto [x,y]=map(nodes[tyre.Index(ring,seg)].Position); image.Disc(x,y,ring==0||ring+1==p.RingCount?3:2,rings[ring]); }
    for(uint32_t ring=0;ring<p.RingCount;++ring) for(uint32_t seg=0;seg<p.SegmentCount;++seg){ const auto [x0,y0]=map(nodes[tyre.Index(ring,seg)].Position); const auto [x1,y1]=map(nodes[tyre.Index(ring,(seg+1u)%p.SegmentCount)].Position); image.Line(x0,y0,x1,y1,{32,99,166}); if(ring+1u<p.RingCount){const auto [x2,y2]=map(nodes[tyre.Index(ring+1u,seg)].Position);image.Line(x0,y0,x2,y2,{24,69,111});} }
    for(const SoftTyreNode& n:nodes) if(n.Position.z<0.012f){const auto [x,y]=map(n.Position);image.Disc(x,y,4,kOrange);}
    image.Disc(cx,cy-static_cast<int>(hubZ*pxPerM),10,kWhite); Text(image,150,694,"GREY: UNLOADED REST CIRCLE",2,kDim); Text(image,150,722,"CYAN: 5 RINGS X 64 XPBD NODES",2,kCyan); Text(image,150,750,"ORANGE: CONTACT PATCH NODES",2,kOrange);

    char line[96];
    std::snprintf(line,sizeof(line),"NODES: %u",p.RingCount*p.SegmentCount); Text(image,984,222,line,2,kCyan);
    std::snprintf(line,sizeof(line),"RINGS: %u",p.RingCount); Text(image,984,262,line,2,kInk);
    std::snprintf(line,sizeof(line),"SEGMENTS: %u",p.SegmentCount); Text(image,984,302,line,2,kInk);
    std::snprintf(line,sizeof(line),"CONTACTS: %u",r.ContactCount); Text(image,984,342,line,2,kOrange);
    std::snprintf(line,sizeof(line),"LOAD: %.0F N",static_cast<double>(r.Force.z)); Text(image,984,382,line,2,kInk);
    std::snprintf(line,sizeof(line),"RADIUS: %.3F M",static_cast<double>(p.Radius)); Text(image,984,422,line,2,kInk);
    std::snprintf(line,sizeof(line),"PRESSURE: %.0F PA",static_cast<double>(p.InflationPressure)); Text(image,984,462,line,2,kInk);
    Text(image,984,530,"TYRE BODY",2,kWhite); Text(image,984,560,"XPBD LATTICE",2,kCyan); Text(image,984,590,"DIRECT COURSE",2,kWhite); Text(image,984,620,"CONTACT",2,kOrange);
    image.Rect(982,670,1374,735,{12,42,60}); Text(image,1002,686,"DEFORMATION",2,kCyan); Text(image,1002,714,"GATE PASS",2,kWhite);

    const std::filesystem::path outPath(output); std::error_code ec; std::filesystem::create_directories(outPath.parent_path(),ec);
    if(!PngWriteCodec::EncodeRgbFile(output.c_str(),image.W,image.H,3,image.px.data(),image.W*3)){std::fprintf(stderr,"cannot write %s\n",output.c_str());return 1;}
    std::printf("XPBDTyreProof: %zu nodes, %u contact nodes, Fz %.1f N -> %s\n",nodes.size(),r.ContactCount,r.Force.z,output.c_str());
    return 0;
}
