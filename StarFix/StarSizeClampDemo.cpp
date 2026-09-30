//============================================================================================================================================
//  StarSizeClampDemo.cpp — visual proof of the #34 star-size upper clamp
//============================================================================================================================================
//  Renders the ORIGINAL main star profile (flat core + skirt, cut at 1.6*Radius) two ways over the same field:
//     LEFT  — no upper clamp: Radius = max(StarSize*0.0002, 0.5*PixelAngle)             ← the "big circles" bug
//     RIGHT — #34 clamp:      Radius = clamp(StarSize*0.0002, 0.5*PixelAngle, 1.2*PixelAngle)
//  Same stars, same luminances, same StarSize — only the Radius rule differs. Bright stars balloon on the left
//  (their luminance-boosted skirt fills the whole disc) and stay as small points on the right.
//
//  Build: g++ -O2 -std=c++17 StarSizeClampDemo.cpp -o starclamp && ./starclamp
//============================================================================================================================================
#include <cstdio>
#include <cstdint>
#include <cmath>
#include <vector>
#include <algorithm>

int main(){
    const int W=460,H=460;
    const float FovY=0.42f;                    // rad
    const float PixelAngle=FovY/H;             // rad/pixel
    const float StarSize=34.0f;                // deliberately large -> triggers the balloon on the unclamped side

    // a scatter of stars: pixel position + luminance (relative to mag 0). A few bright, many faint.
    struct S{ float x,y,lum; float r,g,b; };
    std::vector<S> stars;
    unsigned seed=1234567u; auto rnd=[&](){ seed=seed*1664525u+1013904223u; return (seed>>8)*(1.0f/16777216.0f); };
    for(int i=0;i<70;++i){ float lum=0.15f+2.0f*rnd()*rnd(); stars.push_back({40+rnd()*(W-80),40+rnd()*(H-80),lum,1,1,1}); }
    // a handful of showcase-bright stars (Sirius-like) on a row
    for(int i=0;i<5;++i){ float t=(i+0.5f)/5.0f; stars.push_back({W*0.12f+t*W*0.76f, H*0.5f, 6.0f+2.0f*i,
                          1.0f, 0.92f+0.02f*i, 0.85f}); }

    auto render=[&](bool clamped)->std::vector<float>{
        std::vector<float> img(W*H*3,0.0f);
        for(int py=0;py<H;++py) for(int px=0;px<W;++px){
            float acc[3]={0,0,0};
            for(const S& st: stars){
                float dpx=std::hypot(px-st.x, py-st.y);
                float Angle=dpx*PixelAngle;
                float Radius = std::fmax(StarSize*0.0002f, PixelAngle*0.5f);
                if(clamped) Radius = std::clamp(StarSize*0.0002f, PixelAngle*0.5f, PixelAngle*1.2f);
                if(Angle > Radius*1.6f) continue;
                float Falloff=(Angle-Radius)/(Radius*0.35f);
                float Core = Angle<=Radius ? 1.0f : std::exp(-Falloff*Falloff);
                float gain = st.lum * Core * 5.73f;
                acc[0]+=st.r*gain; acc[1]+=st.g*gain; acc[2]+=st.b*gain;
            }
            int o=(py*W+px)*3; img[o]=acc[0]; img[o+1]=acc[1]; img[o+2]=acc[2];
        }
        return img;
    };

    auto A=render(false), B=render(true);
    // side by side with a divider
    const int gap=6, OW=W*2+gap;
    FILE* f=fopen("Stars_SizeClamp.ppm","wb"); fprintf(f,"P6\n%d %d\n255\n",OW,H);
    auto tm=[](float x){ x=std::max(0.0f,x); return x/(x+1.0f); };   // Reinhard
    for(int y=0;y<H;++y) for(int x=0;x<OW;++x){
        float c[3]={0,0,0};
        if(x<W){ int o=(y*W+x)*3; c[0]=A[o];c[1]=A[o+1];c[2]=A[o+2]; }
        else if(x>=W+gap){ int xx=x-W-gap; int o=(y*W+xx)*3; c[0]=B[o];c[1]=B[o+1];c[2]=B[o+2]; }
        unsigned char px[3]={ (unsigned char)(std::pow(tm(c[0]),1/2.2f)*255+0.5f),
                              (unsigned char)(std::pow(tm(c[1]),1/2.2f)*255+0.5f),
                              (unsigned char)(std::pow(tm(c[2]),1/2.2f)*255+0.5f) };
        fwrite(px,1,3,f);
    }
    fclose(f);
    printf("wrote Stars_SizeClamp.ppm  (%dx%d)  StarSize=%.0f PixelAngle=%.5f rad\n",OW,H,StarSize,PixelAngle);
    printf("  unclamped Radius = %.5f rad (%.2f px)\n", std::fmax(StarSize*0.0002f,PixelAngle*0.5f)/PixelAngle*PixelAngle, std::fmax(StarSize*0.0002f,PixelAngle*0.5f)/PixelAngle);
    printf("  clamped   Radius = %.5f rad (%.2f px)\n", std::clamp(StarSize*0.0002f,PixelAngle*0.5f,PixelAngle*1.2f), std::clamp(StarSize*0.0002f,PixelAngle*0.5f,PixelAngle*1.2f)/PixelAngle);
    return 0;
}
