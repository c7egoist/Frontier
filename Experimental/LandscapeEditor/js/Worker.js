// 📦 Compute worker — evaluates the layer stack off the main thread and keeps the stage cache between requests.

import { EvaluateProject } from "./Pipeline.js";
import { ComposeSatmap, ComposeHillshade } from "./Satmap.js";
import { PresetProject } from "./Presets.js";

const Cache = new Map();
let Latest = null;

/// in    Message   [-]  { Type, Id, ... } request from the editor
/// out   Reply     [-]  posted message; typed arrays are transferred, not copied
self.onmessage = (Event) => {
    const Message = Event.data;
    try {
        if (Message.Type === "evaluate") {
            Latest = EvaluateProject(Message.Project, Cache, {
                Selected: Message.Selected,
                OnStage: (Record) => self.postMessage({ Type: "progress", Id: Message.Id, ...Record }),
            });
            const Satmap = ComposeSatmap(Latest, Message.Mode, Message.Project.Palette);
            const HeightCopy = Latest.Heights.slice();
            const Reply = {
                Type: "result",
                Id: Message.Id,
                Heights: HeightCopy,
                Satmap,
                Stats: Latest.Stats,
                Stages: Latest.Stages,
                Previews: Latest.Previews,
                N: Latest.N,
                Cell: Latest.Cell,
                Sea: Latest.Sea,
                World: Latest.World,
                Selected: Message.Selected,
                Palette: Message.Project.Palette,
            };
            self.postMessage(Reply, [HeightCopy.buffer, Satmap.buffer]);
            return;
        }
        if (Message.Type === "satmap") {
            if (!Latest) {
                self.postMessage({ Type: "error", Id: Message.Id, Message: "No evaluated landscape yet." });
                return;
            }
            const Satmap = ComposeSatmap(Latest, Message.Mode, Message.Palette);
            self.postMessage({ Type: "satmap", Id: Message.Id, Satmap, Mode: Message.Mode }, [Satmap.buffer]);
            return;
        }
        if (Message.Type === "thumbnail") {
            const Project = PresetProject(Message.Preset);
            Project.Resolution = 128;
            const Result = EvaluateProject(Project, new Map(), {});
            const Pixels = ComposeHillshade(Result);
            self.postMessage({ Type: "thumbnail", Id: Message.Id, Preset: Message.Preset, Pixels, N: Result.N }, [Pixels.buffer]);
        }
    } catch (Failure) {
        self.postMessage({ Type: "error", Id: Message.Id, Message: String(Failure?.stack ?? Failure) });
    }
};
