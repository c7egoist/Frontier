// Default catalogue. Every field is plain JSON — use Edit → Download to get a template,
// or drop your own .json onto the page. Atlas positions are [u, v] in 0–1 over the backdrop
// (land sits roughly above the diagonal coast; the right half is the open stage).
// Metric.Series is optional: omit it and a plausible trace is synthesised from Seed.

export const DefaultCatalogue = {
    Title: "Asset Manager",
    AtlasSeed: 7,
    Background: null,
    Selected: "ENV-6023",
    HighlightStatuses: ["Ready", "Broken"],
    Sections: [
        { Label: "Overview", Headline: "Asset Manager", Metric: 0 },
        { Label: "Library", Headline: "Asset Library", Metric: 0 },
        { Label: "Budgets", Headline: "Memory Budgets", Metric: 0 },
        { Label: "Analytics", Headline: "Streaming Analytics", Metric: 1 },
        { Label: "Pipeline", Headline: "Build Pipeline", Metric: 2 },
        { Label: "Issues", Headline: "Open Issues", Metric: 2 },
    ],
    Categories: [
        { Key: "Props", Label: "Props", Icon: "crate", Tones: ["#a39a8c", "#45403a"] },
        { Key: "Environment", Label: "Terrain", Icon: "terrain", Tones: ["#8c9a86", "#3a3f3a"] },
        { Key: "Characters", Label: "Actors", Icon: "character", Tones: ["#8f8aa6", "#3b3946"] },
        { Key: "Vehicles", Label: "Vehicles", Icon: "vehicle", Tones: ["#8aa0ad", "#36414a"] },
    ],
    Statuses: [
        { Key: "Ready", Label: "Ready", Tone: "ok", Hint: "Imported, LODs built" },
        { Key: "Broken", Label: "Broken", Tone: "bad", Hint: "Failed validation" },
        { Key: "Review", Label: "In review", Tone: "warn", Hint: "Awaiting sign-off" },
    ],
    Metrics: [
        { Title: "Budget Efficiency", Unit: "%", Target: 75, TargetStart: 79, High: 80, Low: 55, Range: [15, 105], Ticks: [25, 50, 75, 100], Seed: 3, Base: 66, Axis: ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"] },
        { Title: "Streaming Hit-rate", Unit: "%", Target: 88, High: 93, Low: 76, Range: [60, 102], Ticks: [70, 80, 90, 100], Seed: 11, Base: 85, PeakAt: [0.3, 0.62, 0.9], DipAt: [0.48], Axis: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
        { Title: "Build Success", Unit: "%", Target: 90, High: 95, Low: 80, Range: [65, 102], Ticks: [70, 80, 90, 100], Seed: 21, Base: 88, PeakAt: [0.55], DipAt: [0.2, 0.83], Axis: ["Build 1", "250", "500", "750", "1000"] },
    ],
    Assets: [
        { Id: "ENV-6023", Label: "Basalt Boulder", Category: "Environment", Status: "Ready", Icon: "boulder", Triangles: 81920, LodLevels: 10, TextureMb: 24, Materials: 2, Instances: 144, BudgetUse: 0.62, Owner: "Environment team", Updated: "12 Nov", Tags: ["Nanite DAG", "Rock", "Scatter"], Atlas: [0.62, 0.42], Tones: ["#8e9688", "#3b3f39"] },
        { Id: "ENV-1180", Label: "Terrain Tile 256", Category: "Environment", Status: "Ready", Icon: "terrain", Triangles: 131072, LodLevels: 11, TextureMb: 64, Materials: 4, Instances: 1, BudgetUse: 0.81, Owner: "World team", Updated: "11 Nov", Tags: ["Heightfield", "Open borders"], Atlas: [0.78, 0.4], Tones: ["#8a9a7e", "#363d33"] },
        { Id: "PRP-0412", Label: "Fluted Column", Category: "Props", Status: "Review", Icon: "column", Triangles: 122880, LodLevels: 9, TextureMb: 18, Materials: 1, Instances: 80, BudgetUse: 0.93, Owner: "Architecture", Updated: "13 Nov", Tags: ["Marble", "Flutes lost at L6"], Atlas: [0.52, 0.38] },
        { Id: "PRP-0977", Label: "Torus Knot Sculpture", Category: "Props", Status: "Ready", Icon: "knot", Triangles: 73728, LodLevels: 9, TextureMb: 12, Materials: 1, Instances: 13, BudgetUse: 0.44, Owner: "Art direction", Updated: "9 Nov", Tags: ["Hero prop", "Metal"], Atlas: [0.9, 0.37] },
        { Id: "PRP-0133", Label: "Supply Crate", Category: "Props", Status: "Ready", Icon: "crate", Triangles: 2400, LodLevels: 4, TextureMb: 4, Materials: 1, Instances: 412, BudgetUse: 0.21, Owner: "Props", Updated: "2 Nov", Tags: ["Modular", "Breakable"], Atlas: [0.7, 0.5] },
        { Id: "PRP-0218", Label: "Street Lamp", Category: "Props", Status: "Broken", Icon: "lamp", Triangles: 5600, LodLevels: 3, TextureMb: 6, Materials: 3, Instances: 96, BudgetUse: 1.12, Owner: "Props", Updated: "14 Nov", Tags: ["Missing UV2", "Emissive"], Atlas: [0.6, 0.55] },
        { Id: "PRP-0302", Label: "Watchtower", Category: "Props", Status: "Ready", Icon: "building", Triangles: 46000, LodLevels: 6, TextureMb: 32, Materials: 5, Instances: 6, BudgetUse: 0.71, Owner: "Architecture", Updated: "7 Nov", Tags: ["Landmark", "Interior"], Atlas: [0.95, 0.45] },
        { Id: "ENV-2201", Label: "Pine Cluster", Category: "Environment", Status: "Ready", Icon: "tree", Triangles: 18500, LodLevels: 5, TextureMb: 16, Materials: 2, Instances: 2380, BudgetUse: 0.77, Owner: "Foliage", Updated: "10 Nov", Tags: ["Impostor at L4", "Wind"], Atlas: [0.47, 0.47] },
        { Id: "ENV-2208", Label: "Birch Grove", Category: "Environment", Status: "Review", Icon: "tree", Triangles: 22100, LodLevels: 5, TextureMb: 20, Materials: 2, Instances: 940, BudgetUse: 0.88, Owner: "Foliage", Updated: "13 Nov", Tags: ["Seasonal", "Wind"], Atlas: [0.68, 0.36] },
        { Id: "ENV-3304", Label: "Cliff Face A", Category: "Environment", Status: "Broken", Icon: "boulder", Triangles: 240000, LodLevels: 12, TextureMb: 48, Materials: 3, Instances: 22, BudgetUse: 1.34, Owner: "Environment team", Updated: "14 Nov", Tags: ["Non-manifold", "Nanite DAG"], Atlas: [0.84, 0.47] },
        { Id: "ENV-3310", Label: "Shore Rocks", Category: "Environment", Status: "Ready", Icon: "boulder", Triangles: 36000, LodLevels: 8, TextureMb: 14, Materials: 2, Instances: 310, BudgetUse: 0.52, Owner: "Environment team", Updated: "8 Nov", Tags: ["Wet shader", "Scatter"], Atlas: [0.93, 0.54] },
        { Id: "CHR-0101", Label: "Ranger", Category: "Characters", Status: "Ready", Icon: "character", Triangles: 64000, LodLevels: 5, TextureMb: 56, Materials: 6, Instances: 1, BudgetUse: 0.68, Owner: "Characters", Updated: "12 Nov", Tags: ["Hero", "Skinned"], Atlas: [0.56, 0.46] },
        { Id: "CHR-0144", Label: "Villager Set", Category: "Characters", Status: "Ready", Icon: "character", Triangles: 28000, LodLevels: 4, TextureMb: 30, Materials: 4, Instances: 48, BudgetUse: 0.55, Owner: "Characters", Updated: "6 Nov", Tags: ["Crowd", "Variants ×12"], Atlas: [0.74, 0.45] },
        { Id: "CHR-0190", Label: "Stone Golem", Category: "Characters", Status: "Review", Icon: "character", Triangles: 98000, LodLevels: 6, TextureMb: 44, Materials: 3, Instances: 4, BudgetUse: 0.97, Owner: "Creatures", Updated: "13 Nov", Tags: ["Boss", "Destruction"], Atlas: [0.84, 0.36] },
        { Id: "VEH-6023", Label: "Bus 6023", Category: "Vehicles", Status: "Ready", Icon: "bus", Triangles: 52000, LodLevels: 5, TextureMb: 28, Materials: 7, Instances: 24, BudgetUse: 0.64, Owner: "Vehicles", Updated: "11 Nov", Tags: ["Drivable", "Damage states"], Atlas: [0.66, 0.62] },
        { Id: "VEH-1102", Label: "Utility Truck", Category: "Vehicles", Status: "Broken", Icon: "vehicle", Triangles: 61000, LodLevels: 4, TextureMb: 34, Materials: 6, Instances: 9, BudgetUse: 1.05, Owner: "Vehicles", Updated: "14 Nov", Tags: ["Collision mismatch"], Atlas: [0.52, 0.58] },
        { Id: "VEH-1120", Label: "Rail Cart", Category: "Vehicles", Status: "Ready", Icon: "vehicle", Triangles: 14000, LodLevels: 4, TextureMb: 10, Materials: 2, Instances: 12, BudgetUse: 0.33, Owner: "Vehicles", Updated: "3 Nov", Tags: ["Spline driven"], Atlas: [0.79, 0.53] },
        { Id: "VEH-1131", Label: "Tram Car", Category: "Vehicles", Status: "Ready", Icon: "bus", Triangles: 47000, LodLevels: 5, TextureMb: 26, Materials: 5, Instances: 13, BudgetUse: 0.59, Owner: "Vehicles", Updated: "5 Nov", Tags: ["Interior", "Spline driven"], Atlas: [0.93, 0.3] },
    ],
};
