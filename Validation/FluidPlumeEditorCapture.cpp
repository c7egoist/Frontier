/*==========================================================================================================================================
                                                    FLUIDPLUMEEDITORCAPTURE.CPP
==========================================================================================================================================*/
// 🧩 Opens the Smoke & fire inspector (the exhibit's gas editor), drives the test fire emitter against
//    the course SDF, and writes PPM evidence of the editor chrome plus the marched plume.

#include "Frontier/Engine/Interface/FluidPlumeEditor.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

int main(int ArgumentCount, char** Arguments)
{
    using namespace Frontier;
    std::string EditorPath = "Exhibits/FluidPlumeEditor/EditorGasSelected.ppm";
    std::string FirePath = "Exhibits/FluidPlumeEditor/TestFirePlume.ppm";
    std::string SmokePath = "Exhibits/FluidPlumeEditor/TestSmokePlume.ppm";
    int Steps = 18;
    for (int Index = 1; Index < ArgumentCount; ++Index)
    {
        if (std::strcmp(Arguments[Index], "--editor") == 0 && Index + 1 < ArgumentCount)
            EditorPath = Arguments[++Index];
        else if (std::strcmp(Arguments[Index], "--fire") == 0 && Index + 1 < ArgumentCount)
            FirePath = Arguments[++Index];
        else if (std::strcmp(Arguments[Index], "--smoke") == 0 && Index + 1 < ArgumentCount)
            SmokePath = Arguments[++Index];
        else if (std::strcmp(Arguments[Index], "--steps") == 0 && Index + 1 < ArgumentCount)
            Steps = std::atoi(Arguments[++Index]);
    }

    FluidPlumeEditor Editor;
    if (!Editor.SelectByQuery("smoke") && !Editor.SelectByQuery("plume") && !Editor.SelectByQuery("fluid"))
        Editor.Select("gas");
    PresentationFrame Resting = Editor.Raster(1280, 720);
    if (!WritePpm(EditorPath, Resting))
    {
        std::fprintf(stderr, "could not write %s\n", EditorPath.c_str());
        return 1;
    }
    std::printf("wrote %s (selected %s)\n", EditorPath.c_str(), Editor.Selected.c_str());

    Editor.ApplyPreset("Inferno");
    Editor.AssignTestPlume(2);
    for (int Step = 0; Step < Steps; ++Step)
        Editor.Advance(1.0f / 60.0f, { 0.0f, 0.0f, 0.53f }, { 1.0f, 0.0f, 0.0f });
    PresentationFrame Fire = Editor.Raster(1280, 720);
    if (!WritePpm(FirePath, Fire))
    {
        std::fprintf(stderr, "could not write %s\n", FirePath.c_str());
        return 1;
    }
    std::printf("wrote %s (test fire, %d steps, resident %s)\n", FirePath.c_str(), Steps, Editor.Space.Resident ? "yes" : "no");

    FluidPlumeEditor SmokeEditor;
    SmokeEditor.Select("gas");
    SmokeEditor.ApplyPreset("Thick burnout");
    SmokeEditor.AssignTestPlume(1);
    for (int Step = 0; Step < Steps; ++Step)
        SmokeEditor.Advance(1.0f / 60.0f, { 0.0f, 0.0f, 0.53f }, { 1.0f, 0.0f, 0.0f });
    PresentationFrame Smoke = SmokeEditor.Raster(1280, 720);
    if (!WritePpm(SmokePath, Smoke))
    {
        std::fprintf(stderr, "could not write %s\n", SmokePath.c_str());
        return 1;
    }
    std::printf("wrote %s (test smoke, %d steps, resident %s)\n", SmokePath.c_str(), Steps, SmokeEditor.Space.Resident ? "yes" : "no");
    return 0;
}
