//============================================================================================================================================
//                                                        VEHICLEGHOSTOVERLAY.JS
//============================================================================================================================================
// 🧩 X-ray-style ghost and wireframe views over the real ControlVehicle in the WebGPU viewport.
//
// The prototype renderer is deferred and intentionally opaque. This small overlay keeps the normal material/GI path
// untouched: ghost modes omit only the vehicle's primary raster draw and project its authored facets into a transparent
// canvas layered over the viewport. The car still casts shadows and contributes to the distance field and surface cache.

import { TransformPoint, SubtractVector, DotVector } from "./TransformProjection.js";

const VehicleOccupantCount = 5; // body + four wheels are the first five scene occupants
const Quantisation = 100000.0;

function PointKey(Point)
{
    return Point.map((Component) => Math.round(Component * Quantisation)).join(",");
}

function ConstructUniqueEdges(Facets)
{
    const Edges = new Map();
    for (const Facet of Facets)
    {
        for (let Corner = 0; Corner < 3; ++Corner)
        {
            const A = Facet.Corners[Corner];
            const B = Facet.Corners[(Corner + 1) % 3];
            const AKey = PointKey(A), BKey = PointKey(B);
            const Key = AKey < BKey ? `${AKey}|${BKey}` : `${BKey}|${AKey}`;
            if (!Edges.has(Key))
                Edges.set(Key, [A.slice(), B.slice()]);
        }
    }
    return [...Edges.values()];
}

export class VehicleGhostOverlay
{
    constructor(Canvas)
    {
        this.Canvas = Canvas;
        this.Context = Canvas && Canvas.getContext ? Canvas.getContext("2d") : null;
        this.Scene = null;
        this.EdgesByFacetSet = new Map();
        this.BodyFacets = [];
    }

    AssignScene(Scene)
    {
        this.Scene = Scene;
        this.EdgesByFacetSet.clear();
        this.BodyFacets = Scene.FacetSets[Scene.VehicleBodySet].Facets;
        for (let Occupant = 0; Occupant < VehicleOccupantCount; ++Occupant)
        {
            const FacetSet = Scene.Occupants[Occupant].FacetSet;
            if (!this.EdgesByFacetSet.has(FacetSet))
                this.EdgesByFacetSet.set(FacetSet, ConstructUniqueEdges(Scene.FacetSets[FacetSet].Facets));
        }
    }

    Clear()
    {
        const Context = this.Context;
        if (!Context || typeof Context.clearRect !== "function")
            return;
        // Clear the full backing store in device pixels, independent of the last draw's scale or a viewport resize.
        if (Context.setTransform)
            Context.setTransform(1, 0, 0, 1, 0, 0);
        const Width = this.Canvas.width || this.Canvas.clientWidth;
        const Height = this.Canvas.height || this.Canvas.clientHeight;
        if (Width && Height)
            Context.clearRect(0, 0, Width, Height);
    }

    Project(World, Camera, Width, Height)
    {
        const Relative = SubtractVector(World, Camera.Position);
        const Depth = DotVector(Relative, Camera.Forward);
        if (!(Depth > 0.03))
            return null;
        const Horizontal = DotVector(Relative, Camera.Right) / (Depth * Camera.TanY * Camera.Aspect);
        const Vertical = DotVector(Relative, Camera.Up) / (Depth * Camera.TanY);
        if (!Number.isFinite(Horizontal) || !Number.isFinite(Vertical))
            return null;
        return [(Horizontal * 0.5 + 0.5) * Width, (0.5 - Vertical * 0.5) * Height, Depth];
    }

    Draw(Mode, Scene, Camera, Opacity = 0.16)
    {
        const Context = this.Context;
        if (!Context || typeof Context.beginPath !== "function" || !Scene || !Camera || Mode === "solid")
        {
            this.Clear();
            return;
        }
        if (this.Scene !== Scene)
            this.AssignScene(Scene);

        const Bounds = this.Canvas.getBoundingClientRect ? this.Canvas.getBoundingClientRect() : null;
        const Width = Bounds && Bounds.width ? Bounds.width : this.Canvas.clientWidth;
        const Height = Bounds && Bounds.height ? Bounds.height : this.Canvas.clientHeight;
        if (!(Width > 0 && Height > 0))
            return;
        const Ratio = Math.max(1, Math.min(2, Number(globalThis.devicePixelRatio) || 1));
        const PixelWidth = Math.max(1, Math.round(Width * Ratio));
        const PixelHeight = Math.max(1, Math.round(Height * Ratio));
        if (this.Canvas.width !== PixelWidth || this.Canvas.height !== PixelHeight)
        {
            this.Canvas.width = PixelWidth;
            this.Canvas.height = PixelHeight;
        }
        Context.setTransform(Ratio, 0, 0, Ratio, 0, 0);
        Context.clearRect(0, 0, Width, Height);

        const Body = Scene.Occupants[Scene.VehicleOccupants.Body];
        if (Mode === "ghost" && typeof Context.fill === "function")
        {
            Context.fillStyle = `rgba(78, 205, 243, ${Math.max(0.02, Math.min(0.45, Opacity))})`;
            for (const Facet of this.BodyFacets)
            {
                const Points = Facet.Corners.map((Corner) => this.Project(TransformPoint(Body.Transform, Corner), Camera, Width, Height));
                if (Points.some((Point) => !Point))
                    continue;
                Context.beginPath();
                Context.moveTo(Points[0][0], Points[0][1]);
                Context.lineTo(Points[1][0], Points[1][1]);
                Context.lineTo(Points[2][0], Points[2][1]);
                Context.closePath();
                Context.fill();
            }
        }

        Context.beginPath();
        for (let OccupantIndex = 0; OccupantIndex < VehicleOccupantCount; ++OccupantIndex)
        {
            const Occupant = Scene.Occupants[OccupantIndex];
            const Edges = this.EdgesByFacetSet.get(Occupant.FacetSet) || [];
            for (const [LocalA, LocalB] of Edges)
            {
                const A = this.Project(TransformPoint(Occupant.Transform, LocalA), Camera, Width, Height);
                const B = this.Project(TransformPoint(Occupant.Transform, LocalB), Camera, Width, Height);
                if (!A || !B)
                    continue;
                Context.moveTo(A[0], A[1]);
                Context.lineTo(B[0], B[1]);
            }
        }
        Context.strokeStyle = Mode === "wireframe" ? "rgba(176, 236, 255, 0.90)" : "rgba(124, 223, 255, 0.72)";
        Context.lineWidth = Mode === "wireframe" ? 0.9 : 0.75;
        Context.lineJoin = "round";
        Context.lineCap = "round";
        Context.shadowColor = "rgba(83, 207, 255, 0.48)";
        Context.shadowBlur = Mode === "wireframe" ? 3 : 2;
        Context.stroke();
        Context.shadowBlur = 0;
    }
}
