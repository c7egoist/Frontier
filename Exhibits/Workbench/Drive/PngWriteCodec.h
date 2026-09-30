//============================================================================================================================================
//                                                           PNGWRITECODEC.H
//============================================================================================================================================
// 📦 Dependency-free PNG codec for RGB proof artefacts.

#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <limits>
#include <vector>

class PngWriteCodec final
{
public:
    static bool EncodeRgbFile(
        const char* PixelFilePath,
        int PixelWidth,
        int PixelHeight,
        int PixelChannelCount,
        const unsigned char* PixelBytes,
        int PixelRowStride)
    {
        if (PixelFilePath == nullptr || PixelBytes == nullptr || PixelWidth <= 0 || PixelHeight <= 0 ||
            PixelChannelCount != 3 || PixelRowStride < PixelWidth * PixelChannelCount)
        {
            return false;
        }

        const std::size_t PixelWidthBytes  = static_cast<std::size_t>(PixelWidth) * PixelChannelCount;
        const std::size_t PixelHeightRows  = static_cast<std::size_t>(PixelHeight);
        const std::size_t PixelRowStrideInBytes = static_cast<std::size_t>(PixelRowStride);
        std::vector<std::uint8_t> ScanlineBytes;
        ScanlineBytes.reserve((PixelWidthBytes + 1u) * PixelHeightRows);

        for (int PixelRowIndex = 0; PixelRowIndex < PixelHeight; ++PixelRowIndex)
        {
            const std::size_t PixelRowOffset = static_cast<std::size_t>(PixelRowIndex) * PixelRowStrideInBytes;
            ScanlineBytes.push_back(0u);
            ScanlineBytes.insert(
                ScanlineBytes.end(),
                PixelBytes + PixelRowOffset,
                PixelBytes + PixelRowOffset + PixelWidthBytes);
        }

        std::vector<std::uint8_t> CompressedBytes;
        CompressedBytes.reserve(ScanlineBytes.size() + ScanlineBytes.size() / 65535u * 5u + 16u);
        CompressedBytes.push_back(0x78u);
        CompressedBytes.push_back(0x01u);
        AppendStoredDeflateBlocks(CompressedBytes, ScanlineBytes);
        AppendBigEndian(CompressedBytes, CalculateAdler32(ScanlineBytes));

        std::vector<std::uint8_t> EncodedBytes;
        const std::array<std::uint8_t, 8> PngSignature = {
            0x89u, 0x50u, 0x4Eu, 0x47u, 0x0Du, 0x0Au, 0x1Au, 0x0Au
        };
        EncodedBytes.insert(EncodedBytes.end(), PngSignature.begin(), PngSignature.end());

        std::vector<std::uint8_t> HeaderBytes;
        HeaderBytes.reserve(13u);
        AppendBigEndian(HeaderBytes, static_cast<std::uint32_t>(PixelWidth));
        AppendBigEndian(HeaderBytes, static_cast<std::uint32_t>(PixelHeight));
        HeaderBytes.push_back(8u);
        HeaderBytes.push_back(2u);
        HeaderBytes.push_back(0u);
        HeaderBytes.push_back(0u);
        HeaderBytes.push_back(0u);

        AppendChunk(EncodedBytes, { 'I', 'H', 'D', 'R' }, HeaderBytes);
        AppendChunk(EncodedBytes, { 'I', 'D', 'A', 'T' }, CompressedBytes);
        AppendChunk(EncodedBytes, { 'I', 'E', 'N', 'D' }, {});

        if (EncodedBytes.size() > static_cast<std::size_t>(std::numeric_limits<std::streamsize>::max()))
        {
            return false;
        }

        std::ofstream OutputStream(PixelFilePath, std::ios::binary);
        OutputStream.write(
            reinterpret_cast<const char*>(EncodedBytes.data()),
            static_cast<std::streamsize>(EncodedBytes.size()));
        return OutputStream.good();
    }

private:
    static void AppendStoredDeflateBlocks(
        std::vector<std::uint8_t>& EncodedBytes,
        const std::vector<std::uint8_t>& SourceBytes)
    {
        std::size_t SourceOffset = 0u;

        while (SourceOffset < SourceBytes.size())
        {
            const std::size_t BlockByteCount = std::min<std::size_t>(65535u, SourceBytes.size() - SourceOffset);
            const bool FinalBlockEnabled = SourceOffset + BlockByteCount == SourceBytes.size();
            const std::uint16_t StoredLength = static_cast<std::uint16_t>(BlockByteCount);
            const std::uint16_t ComplementLength = static_cast<std::uint16_t>(~StoredLength);

            EncodedBytes.push_back(FinalBlockEnabled ? 0x01u : 0x00u);
            AppendLittleEndian(EncodedBytes, StoredLength);
            AppendLittleEndian(EncodedBytes, ComplementLength);
            EncodedBytes.insert(
                EncodedBytes.end(),
                SourceBytes.begin() + static_cast<std::ptrdiff_t>(SourceOffset),
                SourceBytes.begin() + static_cast<std::ptrdiff_t>(SourceOffset + BlockByteCount));
            SourceOffset += BlockByteCount;
        }
    }

    static void AppendChunk(
        std::vector<std::uint8_t>& EncodedBytes,
        const std::array<std::uint8_t, 4>& ChunkType,
        const std::vector<std::uint8_t>& ChunkBytes)
    {
        AppendBigEndian(EncodedBytes, static_cast<std::uint32_t>(ChunkBytes.size()));
        EncodedBytes.insert(EncodedBytes.end(), ChunkType.begin(), ChunkType.end());
        EncodedBytes.insert(EncodedBytes.end(), ChunkBytes.begin(), ChunkBytes.end());

        std::vector<std::uint8_t> CyclicRedundancyBytes;
        CyclicRedundancyBytes.reserve(ChunkType.size() + ChunkBytes.size());
        CyclicRedundancyBytes.insert(CyclicRedundancyBytes.end(), ChunkType.begin(), ChunkType.end());
        CyclicRedundancyBytes.insert(CyclicRedundancyBytes.end(), ChunkBytes.begin(), ChunkBytes.end());
        AppendBigEndian(EncodedBytes, CalculateCrc32(CyclicRedundancyBytes));
    }

    static void AppendBigEndian(std::vector<std::uint8_t>& EncodedBytes, std::uint32_t EncodedValue)
    {
        EncodedBytes.push_back(static_cast<std::uint8_t>((EncodedValue >> 24u) & 0xFFu));
        EncodedBytes.push_back(static_cast<std::uint8_t>((EncodedValue >> 16u) & 0xFFu));
        EncodedBytes.push_back(static_cast<std::uint8_t>((EncodedValue >> 8u) & 0xFFu));
        EncodedBytes.push_back(static_cast<std::uint8_t>(EncodedValue & 0xFFu));
    }

    static void AppendLittleEndian(std::vector<std::uint8_t>& EncodedBytes, std::uint16_t EncodedValue)
    {
        EncodedBytes.push_back(static_cast<std::uint8_t>(EncodedValue & 0xFFu));
        EncodedBytes.push_back(static_cast<std::uint8_t>((EncodedValue >> 8u) & 0xFFu));
    }

    [[nodiscard]] static std::uint32_t CalculateAdler32(const std::vector<std::uint8_t>& SourceBytes)
    {
        std::uint32_t AccumulatorA = 1u;
        std::uint32_t AccumulatorB = 0u;

        for (const std::uint8_t SourceByte : SourceBytes)
        {
            AccumulatorA = (AccumulatorA + SourceByte) % 65521u;
            AccumulatorB = (AccumulatorB + AccumulatorA) % 65521u;
        }

        return (AccumulatorB << 16u) | AccumulatorA;
    }

    [[nodiscard]] static std::uint32_t CalculateCrc32(const std::vector<std::uint8_t>& SourceBytes)
    {
        std::uint32_t CyclicRedundancy = 0xFFFFFFFFu;

        for (const std::uint8_t SourceByte : SourceBytes)
        {
            CyclicRedundancy ^= SourceByte;

            for (std::uint32_t BitIndex = 0u; BitIndex < 8u; ++BitIndex)
            {
                const std::uint32_t LeastSignificantBit = CyclicRedundancy & 1u;
                CyclicRedundancy = (CyclicRedundancy >> 1u) ^ (LeastSignificantBit == 0u ? 0u : 0xEDB88320u);
            }
        }

        return ~CyclicRedundancy;
    }
};
