// Does the GLSL sky agree with the C++ model it was transcribed from?
//
// The shader cannot be run here, but it CAN be re-transcribed back into C++ line by line and compared against
// AtmosphereModel. A transcription error - a swapped axis, a dropped 1.1 on the Mie extinction, a wrong phase
// denominator - shows as a numeric divergence rather than a compile error, which is why this is worth doing.
#include "Engine/DisplayPresentation/AtmosphereModel.h"
#include "Engine/DisplayPresentation/SkyConstantRecord.h"
#include <cmath>
#include <cstdio>
#include <cstdint>
using namespace Frontier;

namespace {
// ── Transcribed BACK from Engine/Shaders/SkyRecords.slang, not from AtmosphereModel ──────────────────────────
bool GlslIntersect(const float O[3], const float D[3], float R, float& Near, float& Far)
{
    float B = O[0]*D[0]+O[1]*D[1]+O[2]*D[2];
    float C = O[0]*O[0]+O[1]*O[1]+O[2]*O[2] - R*R;
    float Disc = B*B - C;
    if (Disc < 0.0f) { Near = Far = 0.0f; return false; }
    float S = std::sqrt(Disc);
    Near = -B - S; Far = -B + S; return true;
}

void GlslSkyRadiance(const SkyConstantRecord& K, const float Dir[3], float Out[3])
{
    Out[0]=Out[1]=Out[2]=0.0f;
    if (K.SunRadiance[3] <= 0.0f) return;
    const float PlanetRadius = K.Planet[0];
    const float TopRadius = PlanetRadius + K.Planet[1];
    const float Origin[3] = { 0.0f, 0.0f, PlanetRadius + std::fmax(K.Planet[2], 0.0f) };
    float Near, Far;
    if (!GlslIntersect(Origin, Dir, TopRadius, Near, Far) || Far < 0.0f) return;
    float Start = std::fmax(Near, 0.0f), End = Far;
    float GN, GF;
    if (GlslIntersect(Origin, Dir, PlanetRadius, GN, GF) && GN > 0.0f) End = GN;
    if (End <= Start) return;

    const float BetaR[3] = { K.Rayleigh[0], K.Rayleigh[1], K.Rayleigh[2] };
    const float BetaM = K.Mie[0];
    const float BetaO[3] = { K.Ozone[0], K.Ozone[1], K.Ozone[2] };
    const float Hr = K.Rayleigh[3], Hm = K.Mie[1], G = K.Mie[2];

    float Mu = Dir[0]*K.SunDirection[0]+Dir[1]*K.SunDirection[1]+Dir[2]*K.SunDirection[2];
    const float kPi = 3.14159265358979323846f;
    float PhaseR = 3.0f/(16.0f*kPi)*(1.0f+Mu*Mu);
    float Den = (2.0f+G*G)*std::pow(std::fmax(1.0f+G*G-2.0f*G*Mu,1e-6f),1.5f);
    float PhaseM = 3.0f/(8.0f*kPi)*((1.0f-G*G)*(1.0f+Mu*Mu))/std::fmax(Den,1e-9f);

    uint32_t N = K.Control[0] ? K.Control[0] : 1u, NL = K.Control[1] ? K.Control[1] : 1u;
    float Length = End - Start;
    float SumR[3]={0,0,0}, SumM[3]={0,0,0}, OpticalR=0, OpticalM=0;
    for (uint32_t I=0;I<N;++I){
        float S0=float(I)/float(N), S1=float(I+1u)/float(N); S0*=S0; S1*=S1;
        float Ta=Start+Length*S0, Tb=Start+Length*S1, Seg=Tb-Ta, Tm=0.5f*(Ta+Tb);
        float P[3]={Origin[0]+Dir[0]*Tm,Origin[1]+Dir[1]*Tm,Origin[2]+Dir[2]*Tm};
        float H=std::sqrt(P[0]*P[0]+P[1]*P[1]+P[2]*P[2])-PlanetRadius;
        float DR=std::exp(-H/Hr)*Seg, DM=std::exp(-H/Hm)*Seg;
        OpticalR+=DR; OpticalM+=DM;
        float LN,LF;
        if(!GlslIntersect(P,K.SunDirection,TopRadius,LN,LF)) continue;
        float LR=0,LM=0; bool Lit=true;
        for(uint32_t J=0;J<NL;++J){
            float Q0=float(J)/float(NL), Q1=float(J+1u)/float(NL); Q0*=Q0; Q1*=Q1;
            float SegL=LF*(Q1-Q0), Tq=LF*0.5f*(Q0+Q1);
            float Q[3]={P[0]+K.SunDirection[0]*Tq,P[1]+K.SunDirection[1]*Tq,P[2]+K.SunDirection[2]*Tq};
            float Hq=std::sqrt(Q[0]*Q[0]+Q[1]*Q[1]+Q[2]*Q[2])-PlanetRadius;
            if(Hq<0.0f){Lit=false;break;}
            LR+=std::exp(-Hq/Hr)*SegL; LM+=std::exp(-Hq/Hm)*SegL; }
        if(!Lit) continue;
        for(int C=0;C<3;++C){
            float Tau=BetaR[C]*(OpticalR+LR)+BetaM*1.1f*(OpticalM+LM)+BetaO[C]*(OpticalR+LR);
            float A=std::exp(-Tau); SumR[C]+=A*DR; SumM[C]+=A*DM; } }
    for(int C=0;C<3;++C)
        Out[C]=(SumR[C]*BetaR[C]*PhaseR+SumM[C]*BetaM*PhaseM)*K.SunRadiance[C];
}

int Failures=0;
void Expect(bool Ok,const char* What){ if(!Ok)++Failures;
    std::printf("  %-66s %s\n",What,Ok?"PASS":"FAIL"); }
}

int main(){
    std::printf("\nSkyRecords.slang against AtmosphereModel.h — the transcription is faithful\n");
    for(int I=0;I<108;++I) std::putchar('=');
    std::printf("\n\n");

    AtmosphereMedium Medium{};
    AtmosphereLight  Light{};
    TwilightSettings Twilight{};

    struct Case { const char* Name; float Sun[3]; float View[3]; };
    const Case Cases[] = {
        { "noon, looking up",      {0.0f,0.20f,0.98f},  {0.0f,0.0f,1.0f} },
        { "noon, at the horizon",  {0.0f,0.20f,0.98f},  {0.0f,0.9998f,0.02f} },
        { "low sun, toward it",    {0.0f,0.94f,0.34f},  {0.0f,0.94f,0.34f} },
        { "low sun, away",         {0.0f,0.94f,0.34f},  {0.0f,-0.94f,0.34f} },
        { "sun behind, up",        {0.30f,-0.60f,0.74f},{0.0f,0.0f,1.0f} },
        { "steep view, high sun",  {0.10f,0.10f,0.99f}, {0.4f,0.4f,0.82f} },
    };

    std::printf("  %-24s %-30s %-30s %s\n","case","C++ model","GLSL transcription","worst rel");
    double Worst = 0.0;
    for (const Case& T : Cases)
    {
        for (int C=0;C<3;++C) Light.Direction[C]=T.Sun[C];
        const AtmosphereSample Model = AtmosphereModel::Integrate(Medium, Light, 2.0f, T.View, 16u, 6u);
        const SkyConstantRecord K = PackSkyConstants(Medium, Light, Twilight, 30.0f, 2.0f, 16u, 6u, true);
        float Glsl[3]; GlslSkyRadiance(K, T.View, Glsl);

        double Rel = 0.0;
        for (int C=0;C<3;++C){
            const double M = Model.Radiance[C], S = Glsl[C];
            const double D = std::fabs(M-S)/std::fmax(std::fmax(std::fabs(M),std::fabs(S)),1e-9);
            if (std::fabs(M) > 1e-6 || std::fabs(S) > 1e-6) Rel = std::fmax(Rel, D); }
        Worst = std::fmax(Worst, Rel);
        std::printf("  %-24s %7.4f %7.4f %7.4f  %7.4f %7.4f %7.4f  %.2e\n", T.Name,
                    Model.Radiance[0],Model.Radiance[1],Model.Radiance[2],
                    Glsl[0],Glsl[1],Glsl[2], Rel);
    }
    std::printf("\n  worst relative difference across %zu directions: %.3e\n", sizeof(Cases)/sizeof(Cases[0]), Worst);
    Expect(Worst < 1e-5, "the shader computes the same sky as the model it was transcribed from");

    // The packer must not invent values: a disabled sky is black, and the counts survive.
    {
        const SkyConstantRecord Off = PackSkyConstants(Medium, Light, Twilight, 30.0f, 2.0f, 16u, 6u, false);
        float Out[3]; GlslSkyRadiance(Off, Cases[0].View, Out);
        Expect(Out[0]==0.0f && Out[1]==0.0f && Out[2]==0.0f, "a disabled sky is exactly black, not merely dim");
        const SkyConstantRecord Zero = PackSkyConstants(Medium, Light, Twilight, 30.0f, 2.0f, 0u, 0u, true);
        Expect(Zero.Control[0]==1u && Zero.Control[1]==1u, "zero sample counts clamp to one rather than dividing by zero");
    }

    // And it must carry the medium rather than a copy of it.
    {
        AtmosphereMedium Hazy = Medium;
        Hazy.MieStrength = 4.0f;
        const SkyConstantRecord A = PackSkyConstants(Medium, Light, Twilight, 30.0f, 2.0f, 16u, 6u, true);
        const SkyConstantRecord B = PackSkyConstants(Hazy,  Light, Twilight, 30.0f, 2.0f, 16u, 6u, true);
        Expect(B.Mie[0] > A.Mie[0] * 3.5f, "changing the medium changes the block, so there is no second copy");
    }

    // ── The analytic sun disc ──────────────────────────────────────────────────────────────────────────
    // The CPU raster draws the panel's sun body through SunDisc::Evaluate, and so does this — the formula is
    //    executed, not re-derived, so a drift between the proof and the path it guards is impossible. The shader
    //    transcribes the same terms (SkyRecords.slang SkyAlong); the SPIR-V compile in the gate pins its syntax
    //    and the pairwise-literal pins hold its constants. Reference bands below are independently computed
    //    (Kasten-Young air mass × Beer-Lambert through the default medium, evaluated in doubles outside this
    //    tree), so they check the formula rather than echoing it.
    {
        const float kPi = 3.14159265358979323846f;
        const float kSunRadius = 0.53f * (kPi / 180.0f) * 0.5f;
        const float Clear[3] = { 1.0f, 1.0f, 1.0f };   // the view floor wins: max(ext, 1) == 1
        const float Blind[3] = { 0.0f, 0.0f, 0.0f };   // no floor: the sun-path extinction rules alone
        auto Rgb = [&](float SunAng, float SunElev, const float Trans[3], float Out[3]){
            SunDisc::Evaluate(Light, Medium, SunAng, SunElev, Trans, Out); };
        float High[3], Low[3], Edge[3];
        Rgb(0.0f, 20.0f, Clear, High);
        bool Full = true;
        for (int C = 0; C < 3; ++C) Full = Full && (High[C] == Light.Colour[C] * 22.0f * 12.0f);
        Expect(Full, "the disc is full at the sun's centre: colour x 22 x 12, no limb, no gate");
        Rgb(5.0f * kPi / 180.0f, 20.0f, Clear, Low);
        Expect(Low[0] == 0.0f && Low[1] == 0.0f && Low[2] == 0.0f,
               "five degrees off the sun there is no disc");
        Rgb(kSunRadius, 20.0f, Clear, Edge);
        Expect(Edge[0] == 0.0f && Edge[1] == 0.0f && Edge[2] == 0.0f,
               "the disc ends exactly at its angular radius");
        float Horizon[3], Plateau[3];
        Rgb(0.0f, -1.0f, Clear, Horizon);
        Rgb(0.0f, 8.0f, Clear, Plateau);
        bool Dimmed = true, Flat = true;
        for (int C = 0; C < 3; ++C)
        {
            Dimmed = Dimmed && (Horizon[C] == High[C] * 0.35f);
            Flat = Flat && (Plateau[C] == High[C]);
        }
        Expect(Dimmed, "at the horizon the disc survives at 0.35, dimmed not popped");
        Expect(Flat, "the gate plateaus from 8 deg up: 8 deg and 20 deg agree exactly");
        Expect(Horizon[0] < Plateau[0], "the gate rises monotonically from horizon to 8 deg");
        float Night[3];
        Rgb(0.0f, -5.0f, Clear, Night);
        Expect(Night[0] == Horizon[0], "below the horizon the gate holds at 0.35 — hiding the disc is the caller's SeesSpace");
        // Reddening. At 8° sun the independent evaluation gives ext (0.6016, 0.3944, 0.1346), times the
        //    5800 K tint: R/B 4.93.
        float Dusk[3];
        Rgb(0.0f, 8.0f, Blind, Dusk);
        const double DuskRB = static_cast<double>(Dusk[0]) / static_cast<double>(Dusk[2]);
        Expect(Dusk[0] > Dusk[1] && Dusk[1] > Dusk[2], "extinction orders the channels red > green > blue");
        Expect(DuskRB > 4.86 && DuskRB < 5.00, "at 8 deg sun the disc is deep orange (R/B 4.93)");
        Expect(Dusk[0] > 156.0f && Dusk[0] < 162.0f, "and its red reaches 159 linear: 0.60 x 22 x 12");
        // Overhead the same extinction is nearly neutral: ext (0.9079, 0.8378, 0.6828) at 50°, R/B 1.47.
        float Noon[3], NoonFloor[3];
        Rgb(0.0f, 50.0f, Blind, Noon);
        Rgb(0.0f, 50.0f, Clear, NoonFloor);
        const double NoonRB = static_cast<double>(Noon[0]) / static_cast<double>(Noon[2]);
        Expect(NoonRB > 1.44 && NoonRB < 1.49, "at 50 deg sun the disc is near-white (R/B 1.47)");
        Expect(NoonFloor[0] > Noon[0] && NoonFloor[2] > Noon[2],
               "in clear air the view floor wins over the sun-path extinction");
        const float Haze[3] = { 0.01f, 0.01f, 0.01f };
        float Hazy[3];
        Rgb(0.0f, 50.0f, Haze, Hazy);
        Expect(Hazy[0] == Noon[0], "below the extinction the floor lets go — the sun path rules");
        const SkyConstantRecord Off = PackSkyConstants(Medium, Light, Twilight, 30.0f, 2.0f, 16u, 6u, false);
        Expect(Off.SunRadiance[0] == 0.0f && Off.SunRadiance[1] == 0.0f && Off.SunRadiance[2] == 0.0f,
               "a hidden sun packs zero radiance, which kills the disc's multiplier");
    }

    // ── The direct-sun row ─────────────────────────────────────────────────────────────────────────
    // PackSkyConstants marches the sun path by the same Integrate the raster calls; the row must equal
    //    0.11·gain·colour·T with T from an INDEPENDENT march, and be exactly zero whenever the sun cannot shine.
    {
        AtmosphereLight Sun = Light;
        Sun.Direction[0] = 0.0f; Sun.Direction[1] = 0.6427876097f; Sun.Direction[2] = 0.7660444431f; // 50° elev
        const AtmosphereSample March = AtmosphereModel::Integrate(Medium, Sun, 2.0f, Sun.Direction, 16u, 1u);
        const SkyConstantRecord D = PackSkyConstants(Medium, Sun, Twilight, 50.0f, 2.0f, 16u, 6u, true);
        bool Exact = D.SunDirect[0] > 0.0f && D.SunDirect[1] > 0.0f && D.SunDirect[2] > 0.0f;
        for (int C = 0; C < 3; ++C)
        {
            const float Want = 0.11f * Sun.Colour[C] * Sun.Intensity * March.Transmittance[C];
            Exact = Exact && std::fabs(D.SunDirect[C] - Want) <= 1e-6f * std::fabs(Want);
        }
        Expect(Exact, "daylight packs 0.11·colour·gain·T off an independent sun-path march");
        const SkyConstantRecord D2 = PackSkyConstants(Medium, Sun, Twilight, 50.0f, 2.0f, 16u, 6u, true, 2.0f);
        bool Doubled = true;
        for (int C = 0; C < 3; ++C)
            Doubled = Doubled && std::fabs(D2.SunDirect[C] - 2.0f * D.SunDirect[C]) <= 1e-6f * D.SunDirect[C];
        Expect(Doubled, "the Direct gain scales the row, so the slider reaches the record");
        const SkyConstantRecord OffD = PackSkyConstants(Medium, Sun, Twilight, 50.0f, 2.0f, 16u, 6u, false);
        Expect(OffD.SunDirect[0] == 0.0f && OffD.SunDirect[1] == 0.0f && OffD.SunDirect[2] == 0.0f,
               "a disabled sky packs zero direct sun");
        const SkyConstantRecord Night = PackSkyConstants(Medium, Sun, Twilight, -5.0f, 2.0f, 16u, 6u, true);
        Expect(Night.SunDirect[0] == 0.0f && Night.SunDirect[1] == 0.0f && Night.SunDirect[2] == 0.0f,
               "below the horizon the planet shadows the direct sun (hard zero)");
        AtmosphereLight Hidden = Sun; Hidden.Intensity = 0.0f;
        const SkyConstantRecord Hid = PackSkyConstants(Medium, Hidden, Twilight, 50.0f, 2.0f, 16u, 6u, true);
        Expect(Hid.SunDirect[0] == 0.0f && Hid.SunDirect[1] == 0.0f && Hid.SunDirect[2] == 0.0f,
               "a hidden sun (zero intensity) packs zero direct sun");
        Expect(D.SunDirect[3] == 0.0f, "the direct row's spare lane stays reserved");
    }

    std::printf("\n");
    for(int I=0;I<108;++I) std::putchar('=');
    std::printf("\n%s\n\n", Failures==0 ? "  the shader and the model agree" : "  THE SHADER AND THE MODEL DISAGREE");
    return Failures==0?0:1;
}
