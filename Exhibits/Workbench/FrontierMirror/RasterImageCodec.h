//============================================================================================================================================
//                                                     RASTERIMAGECODEC.H
//============================================================================================================================================
// 📦 PNG and animated-GIF writers with no third-party dependency.
//
// The mirrors in this folder are evidence. Evidence that needs libpng, zlib or giflib installed before it can be
// regenerated is evidence nobody regenerates, so both encoders are here in full: fixed-Huffman deflate for PNG
// (RFC 1951), and median-cut palette plus LZW for GIF (RFC 1952 / GIF89a). Neither is tuned for ratio — they are
// tuned for being present.
//============================================================================================================================================

#pragma once

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

namespace Frontier::RasterImage
{

// PNG, written here rather than through a library: a proof that needed zlib installed to emit its own evidence
//    would be a proof nobody reruns. Fixed-Huffman deflate (RFC 1951 §3.2.6) over a greedy LZ77 match finder,
//    which is perhaps 15 lines more than storing the pixels raw and takes a 2560×1546 sheet from 11.9 MB to
//    roughly a tenth of that — worth it for a file that lives in the repository.
uint32_t Crc32(const uint8_t* Data, size_t Length, uint32_t Seed = 0u) noexcept
{
    static uint32_t Table[256];
    static bool Ready = false;
    if (!Ready)
    {
        for (uint32_t N = 0u; N < 256u; ++N)
        {
            uint32_t C = N;
            for (int K = 0; K < 8; ++K) C = (C & 1u) ? (0xEDB88320u ^ (C >> 1)) : (C >> 1);
            Table[N] = C;
        }
        Ready = true;
    }
    uint32_t C = Seed ^ 0xFFFFFFFFu;
    for (size_t I = 0u; I < Length; ++I) C = Table[(C ^ Data[I]) & 0xFFu] ^ (C >> 8);
    return C ^ 0xFFFFFFFFu;
}

uint32_t Adler32(const uint8_t* Data, size_t Length) noexcept
{
    uint32_t A = 1u, B = 0u;
    for (size_t I = 0u; I < Length; ++I) { A = (A + Data[I]) % 65521u; B = (B + A) % 65521u; }
    return (B << 16) | A;
}

// Deflate packs bits least-significant first, but Huffman codes are written most-significant first. Both go
//    through here so the distinction lives in one place instead of at every call site.
struct BitWriter
{
    std::vector<uint8_t> Bytes;
    uint32_t             Hold  = 0u;
    uint32_t             Count = 0u;

    void Raw(uint32_t Value, uint32_t Width) noexcept          // LSB-first: lengths, distances, extra bits
    {
        Hold |= (Value & ((1u << Width) - 1u)) << Count;
        Count += Width;
        while (Count >= 8u) { Bytes.push_back(uint8_t(Hold & 0xFFu)); Hold >>= 8; Count -= 8u; }
    }
    void Code(uint32_t Value, uint32_t Width) noexcept          // MSB-first: Huffman codes
    {
        for (uint32_t I = 0u; I < Width; ++I) Raw((Value >> (Width - 1u - I)) & 1u, 1u);
    }
    void Flush() noexcept { if (Count > 0u) { Bytes.push_back(uint8_t(Hold & 0xFFu)); Hold = 0u; Count = 0u; } }
};

// RFC 1951 §3.2.6, the fixed literal/length alphabet.
void EmitLiteral(BitWriter& W, uint32_t Symbol) noexcept
{
    if (Symbol < 144u)      W.Code(0x030u + Symbol,          8u);
    else if (Symbol < 256u) W.Code(0x190u + Symbol - 144u,   9u);
    else if (Symbol < 280u) W.Code(0x000u + Symbol - 256u,   7u);
    else                    W.Code(0x0C0u + Symbol - 280u,   8u);
}

const uint16_t kLengthBase[29]   = { 3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258 };
const uint8_t  kLengthExtra[29]  = { 0,0,0,0,0,0,0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4,  4,  5,  5,  5,  5,  0 };
const uint16_t kDistanceBase[30] = { 1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577 };
const uint8_t  kDistanceExtra[30]= { 0,0,0,0,1,1,2, 2, 3, 3, 4, 4, 5, 5,  6,  6,  7,  7,  8,  8,   9,   9,  10,  10,  11,  11,  12,   12,   13,   13 };

std::vector<uint8_t> Deflate(const std::vector<uint8_t>& Data)
{
    BitWriter W;
    W.Raw(1u, 1u);                                              // final block
    W.Raw(1u, 2u);                                              // fixed Huffman

    constexpr size_t kWindow = 32768u, kBuckets = 65536u;
    std::vector<int32_t> Head(kBuckets, -1);
    std::vector<int32_t> Prev(Data.size(), -1);
    const auto Hash = [&](size_t I) -> size_t
    {
        return (size_t(Data[I]) * 7u ^ size_t(Data[I + 1u]) * 131u ^ size_t(Data[I + 2u]) * 2179u) & (kBuckets - 1u);
    };

    size_t At = 0u;
    while (At < Data.size())
    {
        size_t BestLength = 0u, BestDistance = 0u;
        if (At + 3u < Data.size())
        {
            const size_t Bucket = Hash(At);
            int32_t Candidate = Head[Bucket];
            // 24 chain steps: past that the gain is in the third decimal place and the write stops being free.
            for (int Step = 0; Step < 24 && Candidate >= 0; ++Step, Candidate = Prev[Candidate])
            {
                const size_t Distance = At - size_t(Candidate);
                if (Distance == 0u || Distance > kWindow) break;
                size_t Length = 0u;
                const size_t Limit = std::min<size_t>(258u, Data.size() - At);
                while (Length < Limit && Data[size_t(Candidate) + Length] == Data[At + Length]) ++Length;
                if (Length > BestLength) { BestLength = Length; BestDistance = Distance; if (Length >= 258u) break; }
            }
        }

        if (BestLength >= 3u)
        {
            uint32_t L = 28u;
            while (L > 0u && kLengthBase[L] > BestLength) --L;
            EmitLiteral(W, 257u + L);
            W.Raw(uint32_t(BestLength - kLengthBase[L]), kLengthExtra[L]);
            uint32_t D = 29u;
            while (D > 0u && kDistanceBase[D] > BestDistance) --D;
            W.Code(D, 5u);
            W.Raw(uint32_t(BestDistance - kDistanceBase[D]), kDistanceExtra[D]);
            for (size_t K = 0u; K < BestLength; ++K)
            {
                if (At + K + 3u < Data.size()) { const size_t B = Hash(At + K); Prev[At + K] = Head[B]; Head[B] = int32_t(At + K); }
            }
            At += BestLength;
        }
        else
        {
            EmitLiteral(W, Data[At]);
            if (At + 3u < Data.size()) { const size_t B = Hash(At); Prev[At] = Head[B]; Head[B] = int32_t(At); }
            ++At;
        }
    }
    EmitLiteral(W, 256u);                                       // end of block
    W.Flush();
    return W.Bytes;
}

void WritePng(const std::string& Path, uint32_t Width, uint32_t Height, const std::vector<uint8_t>& Rgb) noexcept
{
    // Per-scanline filter, chosen by the standard minimum-sum-of-absolute-differences heuristic over None /
    //    Sub / Up. Filtering is what makes the deflate worth having: Up turns the sheet's large flat regions
    //    and vertical gradients into runs of zero, which LZ77 then eats whole.
    const size_t Stride = static_cast<size_t>(Width) * 3u;
    std::vector<uint8_t> Raw;
    Raw.reserve(static_cast<size_t>(Height) * (Stride + 1u));
    std::vector<uint8_t> Line[3];
    for (auto& L : Line) L.resize(Stride);
    for (uint32_t Y = 0u; Y < Height; ++Y)
    {
        const uint8_t* Row   = Rgb.data() + static_cast<size_t>(Y) * Stride;
        const uint8_t* Above = (Y > 0u) ? Rgb.data() + (static_cast<size_t>(Y) - 1u) * Stride : nullptr;
        size_t Score[3] = { 0u, 0u, 0u };
        for (size_t I = 0u; I < Stride; ++I)
        {
            const uint8_t Left = (I >= 3u) ? Row[I - 3u] : 0u;
            const uint8_t Up   = Above ? Above[I] : 0u;
            Line[0][I] = Row[I];
            Line[1][I] = uint8_t(Row[I] - Left);
            Line[2][I] = uint8_t(Row[I] - Up);
            for (int F = 0; F < 3; ++F) Score[F] += size_t(int8_t(Line[F][I]) < 0 ? -int8_t(Line[F][I]) : int8_t(Line[F][I]));
        }
        int Pick = 0;
        for (int F = 1; F < 3; ++F) if (Score[F] < Score[Pick]) Pick = F;
        Raw.push_back(uint8_t(Pick));
        Raw.insert(Raw.end(), Line[Pick].begin(), Line[Pick].end());
    }

    // zlib container: CMF/FLG, the deflate stream, then Adler-32 of the UNcompressed bytes.
    std::vector<uint8_t> Stream{ 0x78u, 0x9Cu };
    const std::vector<uint8_t> Compressed = Deflate(Raw);
    Stream.insert(Stream.end(), Compressed.begin(), Compressed.end());
    const uint32_t Sum = Adler32(Raw.data(), Raw.size());
    for (int Shift : { 24, 16, 8, 0 }) Stream.push_back(static_cast<uint8_t>(Sum >> Shift));

    std::ofstream File(Path, std::ios::binary);
    const uint8_t Signature[8] = { 0x89u, 'P', 'N', 'G', '\r', '\n', 0x1Au, '\n' };
    File.write(reinterpret_cast<const char*>(Signature), 8);
    const auto Chunk = [&](const char* Tag, const std::vector<uint8_t>& Data)
    {
        const uint32_t Length = static_cast<uint32_t>(Data.size());
        const uint8_t Header[4] = { uint8_t(Length >> 24), uint8_t(Length >> 16), uint8_t(Length >> 8), uint8_t(Length) };
        File.write(reinterpret_cast<const char*>(Header), 4);
        std::vector<uint8_t> Body(Tag, Tag + 4);
        Body.insert(Body.end(), Data.begin(), Data.end());
        File.write(reinterpret_cast<const char*>(Body.data()), static_cast<std::streamsize>(Body.size()));
        const uint32_t Crc = Crc32(Body.data(), Body.size());
        const uint8_t Tail[4] = { uint8_t(Crc >> 24), uint8_t(Crc >> 16), uint8_t(Crc >> 8), uint8_t(Crc) };
        File.write(reinterpret_cast<const char*>(Tail), 4);
    };
    std::vector<uint8_t> Header;
    for (int Shift : { 24, 16, 8, 0 }) Header.push_back(uint8_t(Width >> Shift));
    for (int Shift : { 24, 16, 8, 0 }) Header.push_back(uint8_t(Height >> Shift));
    Header.insert(Header.end(), { 8u, 2u, 0u, 0u, 0u });
    Chunk("IHDR", Header);
    Chunk("IDAT", Stream);
    Chunk("IEND", {});
}

//--------------------------------------------------------------------------------------------------------------------------
//                                                 ANIMATED GIF
//--------------------------------------------------------------------------------------------------------------------------
// 📝 GIF is 256 colours, so a render has to be quantised. A fixed colour cube bands badly on the smooth shading
//    these sheets are mostly made of, so the palette is median-cut over the whole animation — one palette for
//    every frame, which is also what keeps the file small and the colours from crawling between frames.

struct PaletteBox
{
    std::vector<uint32_t> Pixels;                       // packed 0xRRGGBB
    uint8_t Low[3]{ 255u, 255u, 255u };
    uint8_t High[3]{ 0u, 0u, 0u };

    void Measure() noexcept
    {
        Low[0] = Low[1] = Low[2] = 255u;
        High[0] = High[1] = High[2] = 0u;
        for (uint32_t P : Pixels)
        {
            const uint8_t C[3] = { uint8_t(P >> 16), uint8_t(P >> 8), uint8_t(P) };
            for (int K = 0; K < 3; ++K) { Low[K] = std::min(Low[K], C[K]); High[K] = std::max(High[K], C[K]); }
        }
    }
    [[nodiscard]] int WidestAxis() const noexcept
    {
        const int Span[3] = { High[0] - Low[0], High[1] - Low[1], High[2] - Low[2] };
        return (Span[0] >= Span[1] && Span[0] >= Span[2]) ? 0 : (Span[1] >= Span[2] ? 1 : 2);
    }
    [[nodiscard]] int Extent() const noexcept
    {
        const int Axis = WidestAxis();
        return High[Axis] - Low[Axis];
    }
};

// Median cut: repeatedly split the box with the widest colour spread at its median along that axis.
inline std::vector<uint32_t> BuildPalette(const std::vector<uint8_t>& Rgb, uint32_t Wanted)
{
    PaletteBox Root;
    Root.Pixels.reserve(Rgb.size() / 3u / 4u + 1u);
    for (size_t I = 0u; I + 2u < Rgb.size(); I += 3u * 4u)      // every 4th pixel is plenty to find a palette
        Root.Pixels.push_back((uint32_t(Rgb[I]) << 16) | (uint32_t(Rgb[I + 1u]) << 8) | uint32_t(Rgb[I + 2u]));
    Root.Measure();

    std::vector<PaletteBox> Boxes{ std::move(Root) };
    while (Boxes.size() < Wanted)
    {
        size_t Pick = Boxes.size();
        int Best = 0;
        for (size_t B = 0u; B < Boxes.size(); ++B)
            if (Boxes[B].Pixels.size() > 1u && Boxes[B].Extent() > Best) { Best = Boxes[B].Extent(); Pick = B; }
        if (Pick == Boxes.size()) break;                        // every box is a single colour

        PaletteBox& Box = Boxes[Pick];
        const int Axis = Box.WidestAxis();
        const int Shift = 16 - 8 * Axis;
        std::sort(Box.Pixels.begin(), Box.Pixels.end(), [Shift](uint32_t A, uint32_t B)
                  { return ((A >> Shift) & 0xFFu) < ((B >> Shift) & 0xFFu); });
        PaletteBox Half;
        Half.Pixels.assign(Box.Pixels.begin() + static_cast<long>(Box.Pixels.size() / 2u), Box.Pixels.end());
        Box.Pixels.resize(Box.Pixels.size() / 2u);
        Box.Measure();
        Half.Measure();
        Boxes.push_back(std::move(Half));
    }

    std::vector<uint32_t> Palette;
    Palette.reserve(Boxes.size());
    for (const PaletteBox& Box : Boxes)
    {
        if (Box.Pixels.empty()) { Palette.push_back(0u); continue; }
        uint64_t Sum[3] = { 0u, 0u, 0u };
        for (uint32_t P : Box.Pixels) { Sum[0] += (P >> 16) & 0xFFu; Sum[1] += (P >> 8) & 0xFFu; Sum[2] += P & 0xFFu; }
        const uint64_t N = Box.Pixels.size();
        Palette.push_back((uint32_t(Sum[0] / N) << 16) | (uint32_t(Sum[1] / N) << 8) | uint32_t(Sum[2] / N));
    }
    while (Palette.size() < 2u) Palette.push_back(0u);
    return Palette;
}

// GIF's LZW: codes grow from (colour bits + 1), a clear code resets the dictionary, and bits pack LSB-first into
//    sub-blocks of at most 255 bytes.
struct LzwWriter
{
    std::vector<uint8_t> Out;
    uint32_t Hold = 0u, Count = 0u;

    void Push(uint32_t Code, uint32_t Width) noexcept
    {
        Hold |= Code << Count;
        Count += Width;
        while (Count >= 8u) { Out.push_back(uint8_t(Hold & 0xFFu)); Hold >>= 8; Count -= 8u; }
    }
    void Flush() noexcept { if (Count > 0u) { Out.push_back(uint8_t(Hold & 0xFFu)); Hold = 0u; Count = 0u; } }
};

inline std::vector<uint8_t> LzwCompress(const std::vector<uint8_t>& Indices, uint32_t ColourBits)
{
    const uint32_t ClearCode = 1u << ColourBits;
    const uint32_t EndCode   = ClearCode + 1u;
    LzwWriter W;
    std::vector<int32_t> Dictionary(4096u * 256u, -1);          // flat [prefix][byte] trie
    uint32_t Next = EndCode + 1u, Width = ColourBits + 1u;
    W.Push(ClearCode, Width);

    int32_t Prefix = -1;
    for (uint8_t Symbol : Indices)
    {
        if (Prefix < 0) { Prefix = Symbol; continue; }
        const int32_t Found = Dictionary[size_t(Prefix) * 256u + Symbol];
        if (Found >= 0) { Prefix = Found; continue; }
        W.Push(uint32_t(Prefix), Width);
        Dictionary[size_t(Prefix) * 256u + Symbol] = int32_t(Next);
        if (Next == (1u << Width) && Width < 12u) ++Width;
        ++Next;
        if (Next >= 4095u)
        {
            W.Push(ClearCode, Width);
            std::fill(Dictionary.begin(), Dictionary.end(), -1);
            Next = EndCode + 1u;
            Width = ColourBits + 1u;
        }
        Prefix = Symbol;
    }
    if (Prefix >= 0) W.Push(uint32_t(Prefix), Width);
    W.Push(EndCode, Width);
    W.Flush();
    return W.Out;
}

/// prose : Write an animated GIF from equally sized RGB frames, one shared median-cut palette for all of them.
/// in    : Path, Width, Height, Frames (each Width*Height*3 bytes), DelayCentiseconds
/// note  : Loops forever via the Netscape 2.0 application extension.
inline void WriteGif(const std::string& Path, uint32_t Width, uint32_t Height,
                     const std::vector<std::vector<uint8_t>>& Frames, uint32_t DelayCentiseconds) noexcept
{
    if (Frames.empty()) return;

    std::vector<uint8_t> Sampled;
    for (const auto& Frame : Frames) Sampled.insert(Sampled.end(), Frame.begin(), Frame.end());
    std::vector<uint32_t> Palette = BuildPalette(Sampled, 256u);
    Sampled.clear();
    Sampled.shrink_to_fit();

    uint32_t ColourBits = 1u;
    while ((1u << ColourBits) < Palette.size()) ++ColourBits;
    const uint32_t Slots = 1u << ColourBits;
    Palette.resize(Slots, 0u);

    std::ofstream File(Path, std::ios::binary);
    const auto Byte  = [&](uint8_t V) { File.put(static_cast<char>(V)); };
    const auto Short = [&](uint16_t V) { Byte(uint8_t(V & 0xFFu)); Byte(uint8_t(V >> 8)); };

    File.write("GIF89a", 6);
    Short(uint16_t(Width));
    Short(uint16_t(Height));
    Byte(uint8_t(0x80u | (ColourBits - 1u)));                   // global table present, this many bits
    Byte(0u);
    Byte(0u);
    for (uint32_t Colour : Palette) { Byte(uint8_t(Colour >> 16)); Byte(uint8_t(Colour >> 8)); Byte(uint8_t(Colour)); }

    File.write("\x21\xFF\x0B", 3);                              // application extension
    File.write("NETSCAPE2.0", 11);
    Byte(3u); Byte(1u); Short(0u); Byte(0u);                    // loop forever

    // Nearest palette entry, cached on the 15-bit quantised colour: the inner loop is otherwise 256 distance
    //    tests per pixel, which dominates the whole encode.
    std::vector<int16_t> Cache(32768u, -1);
    const auto Nearest = [&](uint8_t R, uint8_t G, uint8_t B) -> uint8_t
    {
        const size_t Key = (size_t(R >> 3) << 10) | (size_t(G >> 3) << 5) | size_t(B >> 3);
        if (Cache[Key] >= 0) return uint8_t(Cache[Key]);
        int Best = 0, BestDistance = 1 << 30;
        for (size_t I = 0u; I < Palette.size(); ++I)
        {
            const int DR = int(R) - int((Palette[I] >> 16) & 0xFFu);
            const int DG = int(G) - int((Palette[I] >> 8) & 0xFFu);
            const int DB = int(B) - int(Palette[I] & 0xFFu);
            const int D  = DR * DR + DG * DG + DB * DB;
            if (D < BestDistance) { BestDistance = D; Best = int(I); }
        }
        Cache[Key] = int16_t(Best);
        return uint8_t(Best);
    };

    for (const auto& Frame : Frames)
    {
        File.write("\x21\xF9\x04", 3);                          // graphic control extension
        Byte(0u);
        Short(uint16_t(DelayCentiseconds));
        Byte(0u); Byte(0u);

        Byte(0x2Cu);                                            // image descriptor
        Short(0u); Short(0u);
        Short(uint16_t(Width)); Short(uint16_t(Height));
        Byte(0u);

        std::vector<uint8_t> Indices(static_cast<size_t>(Width) * Height);
        for (size_t P = 0u; P < Indices.size(); ++P)
            Indices[P] = Nearest(Frame[P * 3u], Frame[P * 3u + 1u], Frame[P * 3u + 2u]);

        const std::vector<uint8_t> Packed = LzwCompress(Indices, ColourBits);
        Byte(uint8_t(ColourBits));
        for (size_t At = 0u; At < Packed.size(); )
        {
            const size_t Run = std::min<size_t>(255u, Packed.size() - At);
            Byte(uint8_t(Run));
            File.write(reinterpret_cast<const char*>(Packed.data() + At), static_cast<std::streamsize>(Run));
            At += Run;
        }
        Byte(0u);                                               // block terminator
    }
    Byte(0x3Bu);                                                // trailer
}

} // namespace Frontier::RasterImage
