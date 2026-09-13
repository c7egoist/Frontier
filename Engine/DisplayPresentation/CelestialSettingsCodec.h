//============================================================================================================================================
// 🎚️ Engine/DisplayPresentation/CelestialSettingsCodec.h — the sliders, as a file you can edit while the game runs
//============================================================================================================================================
// 🧩 The brief asks for sliders and properties. An on-screen panel needs a UI stack this engine does not have yet
//    (R10), so the control surface ships first as a live-reloaded TOML file: edit it, save, and the sky changes on
//    the next frame with no restart. That is the same feedback loop a slider gives, available today, and when the
//    panel lands in P8 it will drive the same kCelestialProperties table this reader drives — one list, two faces.
//
//    ⚠️ DELIBERATELY NOT A TOML LIBRARY. The grammar accepted here is a strict subset: `key = value` lines,
//    `# comment`, blank lines, and `[section]` headers that prefix the keys beneath them. That is all the property
//    table can express, so a full parser would be dependency and attack surface bought for nothing. Anything the
//    reader does not understand is reported by line number and skipped, never silently ignored.
//
//    Reload is by mtime, checked once per frame. Cheap (one stat), and it means an editor's save is the trigger.

#pragma once

#include "Engine/DisplayPresentation/CelestialStructure.h"

#include <cstdio>
#include <cstring>
#include <ctime>
#include <iostream>
#include <string>
#include <sys/stat.h>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                       READING
//------------------------------------------------------------------------------------------------------------------------

namespace CelestialCodecDetail {

inline std::string Trim(const std::string& Text) noexcept
{
    size_t First = Text.find_first_not_of(" \t\r\n");
    if (First == std::string::npos) return {};
    size_t Last = Text.find_last_not_of(" \t\r\n");
    return Text.substr(First, Last - First + 1);
}

// Strip a trailing comment, but only one that is not inside a value. No strings exist in this grammar, so a '#'
//    always starts a comment — stated explicitly because it will stop being true the moment someone adds a name field.
inline std::string StripComment(const std::string& Line) noexcept
{
    const size_t Hash = Line.find('#');
    return Hash == std::string::npos ? Line : Line.substr(0, Hash);
}

} // namespace CelestialCodecDetail

// Returns the number of properties applied, or -1 if the file could not be opened. Unknown keys and malformed
//    values are reported to stderr with their line numbers and do not stop the parse: a typo in one line must not
//    cost you the other fifty settings in the file.
[[nodiscard]] inline int ReadCelestialSettings(const char* Path, CelestialStructure& Settings) noexcept
{
    std::FILE* File = std::fopen(Path, "rb");
    if (!File) return -1;

    char        Buffer[512];
    std::string Section;
    int         Applied    = 0;
    int         LineNumber = 0;

    while (std::fgets(Buffer, sizeof(Buffer), File))
    {
        ++LineNumber;
        std::string Line = CelestialCodecDetail::Trim(CelestialCodecDetail::StripComment(Buffer));
        if (Line.empty()) continue;

        if (Line.front() == '[' && Line.back() == ']')
        {
            Section = CelestialCodecDetail::Trim(Line.substr(1, Line.size() - 2));
            continue;
        }

        const size_t Equals = Line.find('=');
        if (Equals == std::string::npos)
        {
            std::cerr << "[Celestial] " << Path << ":" << LineNumber << ": expected 'key = value', got '" << Line << "'\n";
            continue;
        }

        const std::string Key   = CelestialCodecDetail::Trim(Line.substr(0, Equals));
        const std::string Value = CelestialCodecDetail::Trim(Line.substr(Equals + 1));
        const std::string Full  = Section.empty() ? Key : Section + "." + Key;

        // Observation is integers and is not in the property table (a year is not a slider), so handle it first.
        if (Full == "time.year")  { Settings.Observation.Year  = std::atoi(Value.c_str()); ++Applied; continue; }
        if (Full == "time.month") { Settings.Observation.Month = std::atoi(Value.c_str()); ++Applied; continue; }
        if (Full == "time.day")   { Settings.Observation.Day   = std::atoi(Value.c_str()); ++Applied; continue; }

        const CelestialProperty* Found = nullptr;
        for (size_t I = 0; I < kCelestialPropertyCount; ++I)
            if (std::strcmp(kCelestialProperties[I].Path, Full.c_str()) == 0) { Found = &kCelestialProperties[I]; break; }

        if (!Found)
        {
            std::cerr << "[Celestial] " << Path << ":" << LineNumber << ": unknown property '" << Full << "'\n";
            continue;
        }

        if (Found->Kind == CelestialPropertyKind::Switch)
        {
            const bool On = (Value == "true" || Value == "1" || Value == "yes" || Value == "on");
            const bool Off = (Value == "false" || Value == "0" || Value == "no" || Value == "off");
            if (!On && !Off)
            {
                std::cerr << "[Celestial] " << Path << ":" << LineNumber << ": '" << Full
                          << "' wants true or false, got '" << Value << "'\n";
                continue;
            }
            WriteCelestialSwitch(Settings, *Found, On);
        }
        else
        {
            char*       End    = nullptr;
            const float Number = std::strtof(Value.c_str(), &End);
            if (End == Value.c_str())
            {
                std::cerr << "[Celestial] " << Path << ":" << LineNumber << ": '" << Full
                          << "' wants a number, got '" << Value << "'\n";
                continue;
            }
            // Report the clamp rather than applying it in silence — a slider that quietly refuses your value is
            //    indistinguishable from a slider that is broken, and you will spend an hour on the difference.
            if (Number < Found->Minimum || Number > Found->Maximum)
                std::cerr << "[Celestial] " << Path << ":" << LineNumber << ": '" << Full << "' = " << Number
                          << " clamped to [" << Found->Minimum << ", " << Found->Maximum << "] " << Found->Unit << "\n";
            WriteCelestialReal(Settings, *Found, Number);
        }
        ++Applied;
    }

    std::fclose(File);
    return Applied;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                       WRITING
//------------------------------------------------------------------------------------------------------------------------

// Emit the current settings as a file the reader above accepts. Generated from the same property table, so a new
//    setting appears in the template the moment it is declared — nobody has to remember to document it here.
[[nodiscard]] inline bool WriteCelestialSettings(const char* Path, const CelestialStructure& Settings) noexcept
{
    std::FILE* File = std::fopen(Path, "wb");
    if (!File) return false;

    std::fprintf(File, "# Frontier celestial settings.\n");
    std::fprintf(File, "# Edit and save while the game is running; the change is picked up on the next frame.\n");
    std::fprintf(File, "# Values outside the stated range are clamped and reported.\n\n");
    std::fprintf(File, "[time]\n");
    std::fprintf(File, "year  = %d\n",  Settings.Observation.Year);
    std::fprintf(File, "month = %d\n",  Settings.Observation.Month);
    std::fprintf(File, "day   = %d\n",  Settings.Observation.Day);

    std::string CurrentSection = "time";
    for (size_t I = 0; I < kCelestialPropertyCount; ++I)
    {
        const CelestialProperty& Property = kCelestialProperties[I];
        const char* Dot = std::strchr(Property.Path, '.');
        const std::string SectionName = Dot ? std::string(Property.Path, Dot) : std::string();
        const char* KeyName = Dot ? Dot + 1 : Property.Path;

        if (SectionName != CurrentSection)
        {
            std::fprintf(File, "\n[%s]\n", SectionName.c_str());
            CurrentSection = SectionName;
        }

        if (Property.Kind == CelestialPropertyKind::Switch)
            std::fprintf(File, "%-18s = %-10s  # %s\n", KeyName,
                         ReadCelestialSwitch(Settings, Property) ? "true" : "false", Property.Summary);
        else
            std::fprintf(File, "%-18s = %-10.6g  # %s [%s], %g to %g\n", KeyName,
                         static_cast<double>(ReadCelestialReal(Settings, Property)),
                         Property.Summary, Property.Unit,
                         static_cast<double>(Property.Minimum), static_cast<double>(Property.Maximum));
    }

    std::fclose(File);
    return true;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    LIVE RELOAD
//------------------------------------------------------------------------------------------------------------------------

// Polls the file's mtime and re-reads when it changes. Returns true on the frames where the settings changed, so
//    the caller can log it; a stat per frame is a few microseconds and is not worth a filesystem watcher.
class CelestialSettingsWatch
{
public:
    void AssignPath(std::string NewPath) noexcept { Path = std::move(NewPath); LastWriteTime = 0; }
    [[nodiscard]] const std::string& QueryPath() const noexcept { return Path; }

    // ⚠️ On the very first poll this loads the file, which is the point: the caller does not need a separate
    //    "load once at startup" call that could disagree with the reload path about how parsing works.
    [[nodiscard]] bool Poll(CelestialStructure& Settings) noexcept
    {
        if (Path.empty()) return false;

        struct stat Status{};
        if (::stat(Path.c_str(), &Status) != 0) return false;
        if (Status.st_mtime == LastWriteTime) return false;

        // An editor that truncates-then-writes can be caught mid-save, giving a short or empty read. Requiring the
        //    size to be non-zero costs nothing and skips the worst of that window; the next poll picks it up.
        if (Status.st_size == 0) return false;

        LastWriteTime = Status.st_mtime;
        const int Applied = ReadCelestialSettings(Path.c_str(), Settings);
        if (Applied < 0) return false;

        std::cerr << "[Celestial] reloaded " << Path << " (" << Applied << " properties)\n";
        return true;
    }

private:
    std::string Path;
    std::time_t LastWriteTime = 0;
};

} // namespace Frontier
