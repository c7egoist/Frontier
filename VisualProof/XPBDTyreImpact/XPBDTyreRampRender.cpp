//============================================================================================================================================
//                                                           XPBDTYRERAMPRENDER.CPP                                                           
//============================================================================================================================================
// 📦 Renders the soft tyre taking a ramp jump on the real VehicleSolver, so the landing can be watched.

#include "../../Frontier/Engine/PhysicalDynamics/Vehicle/VehicleSolver.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

using namespace Frontier::Vehicle;

/// prose  The car is the production stack: VehicleSolver with the Pacejka driving layer, four XPBD soft tyres,
///        and a chassis integrated here from the forces the solver hands back. The hubs are welded to the body
///        so the TYRE carries the whole landing — there is no strut to hide the impact behind.
/// out    frames - one 24-bit BMP per rendered step, assembled into a GIF outside this program
/// use    XPBDTyreRampRender [--norim] [--out DIR]
/// note   The chassis is integrated explicitly here, which 60 Hz will not survive against a tyre this stiff;
///        the loop runs at 240 Hz and emits every eighth step, giving 30 fps out.
/// note   Quat is {x, y, z, w} — w LAST. Writing the quaternion integration as though w came first scrambles
///        the axes and tumbles the car on the spot.
/// tag    xpbd, tyre, landing, render

// ── the course: flat, a ramp, then nothing — the car launches off the lip ──────────────────────────────────────────────
constexpr float kRampStart = 24.0f;
constexpr float kRampEnd   = 31.0f;
constexpr float kRampRise  = 1.45f;

static float GroundHeight(float x)
{
    if (x <= kRampStart) return 0.0f;
    if (x >= kRampEnd)   return 0.0f;                       // the lip: a clean drop back to the flat
    return (x - kRampStart) / (kRampEnd - kRampStart) * kRampRise;
}

static void GroundNormal(float x, float& nx, float& nz)
{
    if (x <= kRampStart || x >= kRampEnd) { nx = 0.0f; nz = 1.0f; return; }
    const float slope = kRampRise / (kRampEnd - kRampStart);
    const float inv = 1.0f / std::sqrt(1.0f + slope * slope);
    nx = -slope * inv; nz = inv;
}

// ── canvas ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
struct Canvas
{
    int W, H;
    std::vector<uint8_t> P;
    Canvas(int w, int h) : W(w), H(h), P(static_cast<size_t>(w) * h * 3, 0) {}
    void Set(int x, int y, uint8_t r, uint8_t g, uint8_t b)
    {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        uint8_t* p = &P[(static_cast<size_t>(y) * W + x) * 3];
        p[0] = b; p[1] = g; p[2] = r;
    }
    void Get(int x, int y, uint8_t& r, uint8_t& g, uint8_t& b) const
    {
        if (x < 0 || y < 0 || x >= W || y >= H) { r = g = b = 0; return; }
        const uint8_t* p = &P[(static_cast<size_t>(y) * W + x) * 3];
        b = p[0]; g = p[1]; r = p[2];
    }
    void Fill(uint8_t r, uint8_t g, uint8_t b) { for (int y = 0; y < H; ++y) for (int x = 0; x < W; ++x) Set(x, y, r, g, b); }
    void Rect(int x0, int y0, int x1, int y1, uint8_t r, uint8_t g, uint8_t b)
    { for (int y = y0; y <= y1; ++y) for (int x = x0; x <= x1; ++x) Set(x, y, r, g, b); }
    void Disc(int cx, int cy, int rad, uint8_t r, uint8_t g, uint8_t b)
    { for (int y = -rad; y <= rad; ++y) for (int x = -rad; x <= rad; ++x) if (x * x + y * y <= rad * rad) Set(cx + x, cy + y, r, g, b); }
    void Line(float x0, float y0, float x1, float y1, int thick, uint8_t r, uint8_t g, uint8_t b)
    {
        const int n = static_cast<int>(std::max(std::fabs(x1 - x0), std::fabs(y1 - y0))) + 1;
        for (int i = 0; i <= n; ++i)
        {
            const float t = static_cast<float>(i) / static_cast<float>(n);
            const int px = static_cast<int>(std::lround(x0 + (x1 - x0) * t));
            const int py = static_cast<int>(std::lround(y0 + (y1 - y0) * t));
            for (int oy = -thick; oy <= thick; ++oy) for (int ox = -thick; ox <= thick; ++ox)
                if (ox * ox + oy * oy <= thick * thick) Set(px + ox, py + oy, r, g, b);
        }
    }
};

// 5x7 face, enough to caption the frames
struct Glyph { char C; uint8_t R[7]; };
static const Glyph kFace[] = {
    {'A',{0x0E,0x11,0x11,0x1F,0x11,0x11,0x11}}, {'B',{0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E}},
    {'C',{0x0E,0x11,0x10,0x10,0x10,0x11,0x0E}}, {'D',{0x1C,0x12,0x11,0x11,0x11,0x12,0x1C}},
    {'E',{0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F}}, {'F',{0x1F,0x10,0x10,0x1E,0x10,0x10,0x10}},
    {'G',{0x0E,0x11,0x10,0x17,0x11,0x11,0x0F}}, {'H',{0x11,0x11,0x11,0x1F,0x11,0x11,0x11}},
    {'I',{0x0E,0x04,0x04,0x04,0x04,0x04,0x0E}}, {'K',{0x11,0x12,0x14,0x18,0x14,0x12,0x11}},
    {'L',{0x10,0x10,0x10,0x10,0x10,0x10,0x1F}}, {'M',{0x11,0x1B,0x15,0x15,0x11,0x11,0x11}},
    {'N',{0x11,0x19,0x15,0x13,0x11,0x11,0x11}}, {'O',{0x0E,0x11,0x11,0x11,0x11,0x11,0x0E}},
    {'P',{0x1E,0x11,0x11,0x1E,0x10,0x10,0x10}}, {'R',{0x1E,0x11,0x11,0x1E,0x14,0x12,0x11}},
    {'S',{0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E}}, {'T',{0x1F,0x04,0x04,0x04,0x04,0x04,0x04}},
    {'U',{0x11,0x11,0x11,0x11,0x11,0x11,0x0E}}, {'V',{0x11,0x11,0x11,0x11,0x11,0x0A,0x04}},
    {'W',{0x11,0x11,0x11,0x15,0x15,0x1B,0x11}}, {'Y',{0x11,0x11,0x0A,0x04,0x04,0x04,0x04}},
    {'Z',{0x1F,0x01,0x02,0x04,0x08,0x10,0x1F}},
    {'0',{0x0E,0x11,0x13,0x15,0x19,0x11,0x0E}}, {'1',{0x04,0x0C,0x04,0x04,0x04,0x04,0x0E}},
    {'2',{0x0E,0x11,0x01,0x02,0x04,0x08,0x1F}}, {'3',{0x1F,0x02,0x04,0x02,0x01,0x11,0x0E}},
    {'4',{0x02,0x06,0x0A,0x12,0x1F,0x02,0x02}}, {'5',{0x1F,0x10,0x1E,0x01,0x01,0x11,0x0E}},
    {'6',{0x06,0x08,0x10,0x1E,0x11,0x11,0x0E}}, {'7',{0x1F,0x01,0x02,0x04,0x08,0x08,0x08}},
    {'8',{0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E}}, {'9',{0x0E,0x11,0x11,0x0F,0x01,0x02,0x0C}},
    {'.',{0x00,0x00,0x00,0x00,0x00,0x0C,0x0C}}, {'-',{0x00,0x00,0x00,0x1F,0x00,0x00,0x00}},
    {'/',{0x01,0x02,0x02,0x04,0x08,0x08,0x10}}, {':',{0x00,0x0C,0x0C,0x00,0x0C,0x0C,0x00}},
    {'%',{0x19,0x1A,0x02,0x04,0x08,0x0B,0x13}},
};

static void Text(Canvas& c, int x, int y, const std::string& s, int size, uint8_t r, uint8_t g, uint8_t b)
{
    for (char ch : s)
    {
        if (ch == ' ') { x += 6 * size; continue; }
        for (const Glyph& gl : kFace)
        {
            if (gl.C != ch) continue;
            for (int row = 0; row < 7; ++row) for (int col = 0; col < 5; ++col)
                if (gl.R[row] & (1 << (4 - col)))
                    for (int sx = 0; sx < size; ++sx) for (int sy = 0; sy < size; ++sy)
                        c.Set(x + col * size + sx, y + row * size + sy, r, g, b);
        }
        x += 6 * size;
    }
}

static void WriteBmp(const Canvas& c, const std::string& path)
{
    const uint32_t bytes = static_cast<uint32_t>(c.P.size());
    uint8_t h[54] = {};
    h[0] = 'B'; h[1] = 'M';
    *reinterpret_cast<uint32_t*>(h + 2) = 54u + bytes;
    *reinterpret_cast<uint32_t*>(h + 10) = 54u;
    *reinterpret_cast<uint32_t*>(h + 14) = 40u;
    *reinterpret_cast<int32_t*>(h + 18) = c.W;
    *reinterpret_cast<int32_t*>(h + 22) = -c.H;          // negative = top-down rows
    *reinterpret_cast<uint16_t*>(h + 26) = 1u;
    *reinterpret_cast<uint16_t*>(h + 28) = 24u;
    *reinterpret_cast<uint32_t*>(h + 34) = bytes;
    std::ofstream o(path, std::ios::binary);
    o.write(reinterpret_cast<const char*>(h), 54);
    o.write(reinterpret_cast<const char*>(c.P.data()), bytes);
}

int main(int argc, char** argv)
{
    bool rimFix = true; std::string outDir = "_AgentScratch/tmp/frames";
    for (int i = 1; i < argc; ++i)
    {
        const std::string a = argv[i];
        if (a == "--norim") rimFix = false;
        if (a == "--out" && i + 1 < argc) outDir = argv[++i];
    }

    // ── vehicle ────────────────────────────────────────────────────────────────────────────────────────────────────────
    VehicleSolverConfiguration config;
    config.ChassisMass = 1500.0f;
    config.Tyre.RingCount = 5u;
    config.Tyre.SegmentCount = 64u;
    config.Tyre.RimBottoming = rimFix;
    config.ActiveScheme = DrivingScheme::PacejkaDrivetrain;
    // Hubs welded to the chassis: the soft tyre then carries the whole landing, which is exactly what this
    // render is about. It also removes the strut calibration as a variable.
    config.SuspensionEnabled = false;
    config.Aero.Enabled = false;

    const float halfLength = 1.45f, halfWidth = 0.78f, hubDrop = -0.32f, mountRise = 0.18f;
    for (int i = 0; i < 4; ++i)
    {
        const bool front = (i < 2);
        const float sy = (i % 2 == 0) ? +halfWidth : -halfWidth;
        WheelMount m;
        m.LocalOffset     = {front ? +halfLength : -halfLength, sy, hubDrop};
        m.SuspensionMount = {front ? +halfLength : -halfLength, sy, hubDrop + mountRise};
        m.Steered = front; m.Driven = !front; m.Braked = true;
        config.Wheels.push_back(m);
    }
    const float sprungCorner = config.ChassisMass * 0.25f - config.UnsprungMass;
    config.FrontStrut.NaturalFrequency = 1.8f; config.FrontStrut.DampingRatio = 0.55f;
    config.RearStrut.NaturalFrequency  = 1.9f; config.RearStrut.DampingRatio  = 0.55f;
    config.FrontStrut.Calibrate(sprungCorner);
    config.RearStrut.Calibrate(sprungCorner);
    // FreeLength is normally resolved from the body sockets (ResolveFromSockets); do the same arithmetic here so
    // the hub hangs at LocalOffset under static load instead of at the mount itself.
    const float cornerLoad = sprungCorner * 9.81f;
    for (SuspensionSpecification* spec : {&config.FrontStrut, &config.RearStrut})
    {
        spec->StaticCompression = spec->StaticCompressionFor(cornerLoad);
        spec->FreeLength        = mountRise + spec->StaticCompression;
    }
    std::printf("strut: k %.0f N/m  c %.0f Ns/m  static %.3f m  free %.3f m\n",
                (double)config.FrontStrut.SpringRate, (double)config.FrontStrut.DampingRate,
                (double)config.FrontStrut.StaticCompression, (double)config.FrontStrut.FreeLength);

    // ── chassis rigid body, integrated here; the solver only pushes on it ──────────────────────────────────────────────
    ChassisState cs;
    cs.Position = {4.0f, 0.0f, 0.636f};
    cs.Orientation = Quat{};
    cs.LinearVelocity = {0.0f, 0.0f, 0.0f};
    cs.AngularVelocity = {0.0f, 0.0f, 0.0f};

    const float mass = config.ChassisMass;
    const float Ixx = mass * (halfWidth * halfWidth * 4.0f + 0.5f * 0.5f) / 12.0f;
    const float Iyy = mass * (halfLength * halfLength * 4.0f + 0.5f * 0.5f) / 12.0f;
    const float Izz = mass * (halfLength * halfLength * 4.0f + halfWidth * halfWidth * 4.0f) / 12.0f;

    Vec3 forceAccum{}, torqueAccum{};
    VehicleSolver::Hooks hooks;
    hooks.ReadChassis = [&cs]() { return cs; };
    hooks.ApplyForceAtPoint = [&](const Vec3& f, const Vec3& p)
    {
        forceAccum = forceAccum + f;
        const Vec3 r = p - cs.Position;
        torqueAccum = torqueAccum + Cross(r, f);
    };
    hooks.ApplyTorque = [&](const Vec3& t) { torqueAccum = torqueAccum + t; };
    hooks.Ground = [](const Vec3& q, Vec3& surface, Vec3& normal)
    {
        surface = {q.x, q.y, GroundHeight(q.x)};
        float nx, nz; GroundNormal(q.x, nx, nz);
        normal = {nx, 0.0f, nz};
        return true;
    };

    VehicleSolver solver;
    solver.Build(config, hooks, cs);

    const float dtFixed = 1.0f / 240.0f;   // the chassis is integrated here explicitly; 60 Hz is not stable for it
    auto Advance = [&](float throttle)
    {
        DriverInput in; in.Throttle = throttle; in.Brake = 0.0f; in.Steer = 0.0f;
        solver.AssignInput(in);
        forceAccum = {0.0f, 0.0f, 0.0f}; torqueAccum = {0.0f, 0.0f, 0.0f};
        solver.Step(dtFixed);
        const Vec3 accel = forceAccum * (1.0f / mass) + Vec3{0.0f, 0.0f, -9.81f};
        cs.LinearVelocity = cs.LinearVelocity + accel * dtFixed;
        cs.Position = cs.Position + cs.LinearVelocity * dtFixed;
        cs.AngularVelocity = cs.AngularVelocity + Vec3{torqueAccum.x / Ixx, torqueAccum.y / Iyy, torqueAccum.z / Izz} * dtFixed;
        cs.AngularVelocity = cs.AngularVelocity * 0.98f;
        // 📝 Quat is {x, y, z, w} with w last — Quat{0,0,0,1} is the identity the solver uses. Writing the
        //    integration with brace order assumed as {w,x,y,z} scrambles the axes and tumbles the car.
        const Vec3 w = cs.AngularVelocity;
        const float hx = w.x * 0.5f * dtFixed, hy = w.y * 0.5f * dtFixed, hz = w.z * 0.5f * dtFixed;
        const Quat q = cs.Orientation;
        Quat nq;
        nq.w = q.w + (-hx * q.x - hy * q.y - hz * q.z);
        nq.x = q.x + ( hx * q.w + hy * q.z - hz * q.y);
        nq.y = q.y + (-hx * q.z + hy * q.w + hz * q.x);
        nq.z = q.z + ( hx * q.y - hy * q.x + hz * q.w);
        const float inv = 1.0f / std::sqrt(nq.w * nq.w + nq.x * nq.x + nq.y * nq.y + nq.z * nq.z);
        cs.Orientation.x = nq.x * inv; cs.Orientation.y = nq.y * inv;
        cs.Orientation.z = nq.z * inv; cs.Orientation.w = nq.w * inv;
    };

    // settle the car on flat ground before the run, so it starts on its tyres rather than falling onto them
    for (int i = 0; i < 1680; ++i)
    {
        Advance(0.0f);
        if (i < 480) { cs.LinearVelocity.z *= 0.90f; cs.AngularVelocity = cs.AngularVelocity * 0.90f; }
        cs.LinearVelocity.x = 0.0f;
        cs.AngularVelocity = cs.AngularVelocity * 0.6f;
    }
    std::printf("settled: chassis z %.3f m, wheels down %u/4\n",
                static_cast<double>(cs.Position.z), solver.Telemetry().WheelsInContact);
    cs.LinearVelocity = {27.0f, 0.0f, 0.0f};

    // ── render setup ───────────────────────────────────────────────────────────────────────────────────────────────────
    const int W = 1000, H = 470;
    const float pxPerM = 58.0f;        // main view
    const float insetScale = 300.0f;   // zoomed wheel
    const int insetW = 320, insetH = 280, insetX = W - insetW - 14, insetY = 14;

    const int totalFrames = 1500;
    int written = 0;
    float runPeakSag = 0.0f, runWorstInside = 0.0f, peakHeight = 0.0f;

    for (int f = 0; f < totalFrames; ++f)
    {
        Advance(0.22f);

        // keep a safety floor so a catastrophic run still renders
        if (cs.Position.z < -2.0f) break;

        if (f % 8 != 0) continue;   // 240 Hz sim -> 30 fps output

        // ── draw ───────────────────────────────────────────────────────────────────────────────────────────────────────
        Canvas c(W, H);
        for (int y = 0; y < H; ++y)
        {
            const float t = static_cast<float>(y) / static_cast<float>(H);
            c.Rect(0, y, W - 1, y, static_cast<uint8_t>(16 + 20 * t), static_cast<uint8_t>(18 + 24 * t), static_cast<uint8_t>(26 + 32 * t));
        }

        const float camX = cs.Position.x - 4.2f;
        const float camZ = 2.35f;
        auto SX = [&](float wx) { return (wx - camX) * pxPerM + 90.0f; };
        auto SY = [&](float wz) { return static_cast<float>(H) - 95.0f - (wz - 0.0f) * pxPerM - 0.0f + (camZ - 2.35f); };

        // ground + ramp, filled
        for (int px = 0; px < W; ++px)
        {
            const float wx = camX + (static_cast<float>(px) - 90.0f) / pxPerM;
            const int gy = static_cast<int>(SY(GroundHeight(wx)));
            for (int py = gy; py < H; ++py)
            {
                const float d = static_cast<float>(py - gy) / 60.0f;
                const uint8_t v = static_cast<uint8_t>(std::max(20.0f, 64.0f - d * 34.0f));
                c.Set(px, py, v, static_cast<uint8_t>(v * 0.97f), static_cast<uint8_t>(v * 0.92f));
            }
            c.Set(px, gy, 180, 186, 196);
            c.Set(px, gy - 1, 120, 126, 136);
        }

        // chassis body, as a rotated silhouette
        const Quat& o = cs.Orientation;
        const Vec3 fwd = o.Rotate({1.0f, 0.0f, 0.0f});
        const float pitch = std::atan2(fwd.z, fwd.x);
        const float cp = std::cos(-pitch), sp = std::sin(-pitch);
        auto Body = [&](float lx, float lz, float& ox, float& oz)
        { ox = cs.Position.x + lx * cp - lz * sp; oz = cs.Position.z + lx * sp + lz * cp; };

        const float bodyPts[][2] = {{-2.00f,-0.26f},{-2.05f,0.14f},{-1.30f,0.22f},{-0.55f,0.62f},
                                    {0.70f,0.66f},{1.45f,0.24f},{2.05f,0.16f},{2.08f,-0.26f}};
        const int bodyN = 8;
        float fx[bodyN], fy[bodyN];
        for (int i = 0; i < bodyN; ++i) { float ox, oz; Body(bodyPts[i][0], bodyPts[i][1], ox, oz); fx[i] = SX(ox); fy[i] = SY(oz); }
        for (int py = 0; py < H; ++py)
        {
            float xs[16]; int n = 0;
            for (int i = 0; i < bodyN; ++i)
            {
                const int j = (i + 1) % bodyN;
                if ((fy[i] <= py && fy[j] > py) || (fy[j] <= py && fy[i] > py))
                    xs[n++] = fx[i] + (static_cast<float>(py) - fy[i]) / (fy[j] - fy[i]) * (fx[j] - fx[i]);
            }
            std::sort(xs, xs + n);
            for (int i = 0; i + 1 < n; i += 2)
                for (int px = static_cast<int>(xs[i]); px <= static_cast<int>(xs[i + 1]); ++px)
                    c.Set(px, py, 48, 84, 136);
        }
        for (int i = 0; i < bodyN; ++i) { const int j = (i + 1) % bodyN; c.Line(fx[i], fy[i], fx[j], fy[j], 1, 122, 176, 240); }

        // wheels: the near-side pair, drawn from the actual deformed belt
        const auto& tel = solver.Telemetry();
        const auto& tyres = solver.Tyres();
        int insetWheel = 2;   // a rear wheel takes the landing
        for (size_t wi = 0; wi < tyres.size(); ++wi)
        {
            if (wi % 2 != 0) continue;                 // one side only in a side view
            const XPBDSoftTyre& ty = tyres[wi];
            const Vec3 hub = tel.Wheels[wi].HubPosition;
            const auto& nodes = ty.Nodes();
            const uint32_t S = config.Tyre.SegmentCount;

            // rim
            c.Disc(static_cast<int>(SX(hub.x)), static_cast<int>(SY(hub.z)),
                   static_cast<int>(config.Tyre.RimRadius * pxPerM), 150, 152, 158);
            // belt outline from the solver's own nodes
            for (uint32_t s = 0; s < S; ++s)
            {
                const Vec3 a = nodes[ty.Index(2u, s)].Position;
                const Vec3 b = nodes[ty.Index(2u, (s + 1) % S)].Position;
                c.Line(SX(a.x), SY(a.z), SX(b.x), SY(b.z), 1, 236, 238, 244);
            }
        }

        // ── inset: the landing wheel, zoomed ───────────────────────────────────────────────────────────────────────────
        c.Rect(insetX - 2, insetY - 2, insetX + insetW + 2, insetY + insetH + 2, 96, 102, 112);
        c.Rect(insetX, insetY, insetX + insetW, insetY + insetH, 14, 16, 22);
        {
            const XPBDSoftTyre& ty = tyres[insetWheel];
            const Vec3 hub = tel.Wheels[insetWheel].HubPosition;
            const float icx = insetX + insetW * 0.5f, icy = insetY + insetH * 0.52f;
            auto IX = [&](float wx) { return icx + (wx - hub.x) * insetScale; };
            auto IY = [&](float wz) { return icy - (wz - hub.z) * insetScale; };

            const float gz = GroundHeight(hub.x);
            const int gy = static_cast<int>(IY(gz));
            if (gy > insetY && gy < insetY + insetH)
                for (int px = insetX + 1; px < insetX + insetW; ++px)
                { c.Set(px, gy, 150, 156, 166); for (int k = 1; k < 7; ++k) c.Set(px, gy + k, 44, 44, 48); }

            const int rimPx = static_cast<int>(config.Tyre.RimRadius * insetScale);
            for (int a = 0; a < 900; ++a)
            {
                const float ang = static_cast<float>(a) * 3.14159265f / 450.0f;
                const int px = static_cast<int>(IX(hub.x) + std::cos(ang) * rimPx);
                const int py = static_cast<int>(IY(hub.z) + std::sin(ang) * rimPx);
                if (px > insetX && px < insetX + insetW && py > insetY && py < insetY + insetH) c.Set(px, py, 210, 212, 220);
            }

            const auto& nodes = ty.Nodes();
            const uint32_t S = config.Tyre.SegmentCount;
            float minR = 1.0e9f;
            for (uint32_t s = 0; s < S; ++s)
            {
                const Vec3 d = nodes[ty.Index(2u, s)].Position - hub;
                minR = std::min(minR, std::sqrt(d.x * d.x + d.z * d.z));
            }
            const float rimLimit = config.Tyre.RimRadius + config.Tyre.RimBottomingClearance;
            const bool breached = minR < rimLimit - 0.002f;
            const uint8_t br = breached ? 240 : 96, bg = breached ? 72 : 220, bb = breached ? 72 : 130;
            for (uint32_t s = 0; s < S; ++s)
            {
                const Vec3 a = nodes[ty.Index(2u, s)].Position;
                const Vec3 b = nodes[ty.Index(2u, (s + 1) % S)].Position;
                const float ax = IX(a.x), ay = IY(a.z), bx = IX(b.x), by = IY(b.z);
                if (ax < insetX || ax > insetX + insetW || bx < insetX || bx > insetX + insetW) continue;
                if (ay < insetY || ay > insetY + insetH || by < insetY || by > insetY + insetH) continue;
                c.Line(ax, ay, bx, by, 1, br, bg, bb);
            }

            char buf[96];
            std::snprintf(buf, sizeof buf, "SAG %3.0fMM", static_cast<double>((config.Tyre.Radius - minR) * 1000.0f));
            Text(c, insetX + 10, insetY + insetH - 22, buf, 2, 200, 206, 216);
            Text(c, insetX + 10, insetY + 8, "REAR TYRE", 2, 150, 156, 168);
        }

        // ── caption ────────────────────────────────────────────────────────────────────────────────────────────────────
        char hud[128];
        Text(c, 20, 18, rimFix ? "WITH RIM BOTTOMING" : "WITHOUT RIM BOTTOMING", 3,
             rimFix ? 110 : 240, rimFix ? 220 : 80, rimFix ? 140 : 80);
        std::snprintf(hud, sizeof hud, "%4.0f KM/H", static_cast<double>(cs.LinearVelocity.x * 3.6f));
        Text(c, 20, 52, hud, 2, 180, 188, 200);
        std::snprintf(hud, sizeof hud, "WHEELS DOWN %u/4", tel.WheelsInContact);
        Text(c, 20, 74, hud, 2, 180, 188, 200);

        {
            const XPBDSoftTyre& ty = tyres[insetWheel];
            const Vec3 hub = tel.Wheels[insetWheel].HubPosition;
            float mn = 1.0e9f;
            for (uint32_t s2 = 0; s2 < config.Tyre.SegmentCount; ++s2)
            { const Vec3 d = ty.Nodes()[ty.Index(2u, s2)].Position - hub; mn = std::min(mn, std::sqrt(d.x*d.x + d.z*d.z)); }
            runPeakSag = std::max(runPeakSag, (config.Tyre.Radius - mn) * 1000.0f);
            runWorstInside = std::max(runWorstInside,
                (config.Tyre.RimRadius + config.Tyre.RimBottomingClearance - mn) * 1000.0f);
            peakHeight = std::max(peakHeight, cs.Position.z);
        }
        char path[256];
        std::snprintf(path, sizeof path, "%s/f%04d.bmp", outDir.c_str(), written);
        WriteBmp(c, path);
        ++written;
    }
    std::printf("wrote %d frames | peak chassis %.2f m | peak sag %.1f mm | worst inside rim %.1f mm\n",
                written, (double)peakHeight, (double)runPeakSag, (double)std::max(0.0f, runWorstInside));
    return 0;
}
