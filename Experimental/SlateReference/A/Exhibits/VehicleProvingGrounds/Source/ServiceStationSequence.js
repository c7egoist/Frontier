//============================================================================================================================================
//                                                       SERVICESTATIONSEQUENCE.JS
//============================================================================================================================================
// 🧩 Industrial Automotive Megafactory (with interior presses, conveyors, silos & racks) + Automatic Fuel & 800V Electric Charging
//    Stations served by Wheeled Butler Service Robots, Articulated Fuel/Charge Nozzle Arms, Helper Drones & WebAudio synthesis.

import { CourseMaterial } from "./MaterialSpecification.js";
import { EmitBoxFacets, EmitCornerBoxFacets } from "./CourseStructure.js";
import { ConstructAxisQuaternion, MultiplyQuaternion, ConstructRigidTransform, RotateVector, ClampScalar } from "./TransformProjection.js";
import { ServiceAudio } from "./ServiceAudio.js";

//------------------------------------------------------------------------------------------------------------------------
//                  WATERTIGHT 2-MANIFOLD ROBOTICS, STATION & FACTORY PROP GEOMETRY
//------------------------------------------------------------------------------------------------------------------------

function EmitOctagonalCylinder(CenterX, CenterY, Z0, Z1, Radius, SideMat, TopMat, BotMat = CourseMaterial.SteelDark, Sides = 12)
{
    const Facets = [];
    for (let Seg = 0; Seg < Sides; ++Seg)
    {
        const A0 = (2.0 * Math.PI * Seg) / Sides;
        const A1 = (2.0 * Math.PI * (Seg + 1)) / Sides;
        const C0 = Math.cos(A0), S0 = Math.sin(A0);
        const C1 = Math.cos(A1), S1 = Math.sin(A1);
        const P00 = [CenterX + Radius * C0, CenterY + Radius * S0, Z0];
        const P10 = [CenterX + Radius * C1, CenterY + Radius * S1, Z0];
        const P11 = [CenterX + Radius * C1, CenterY + Radius * S1, Z1];
        const P01 = [CenterX + Radius * C0, CenterY + Radius * S0, Z1];
        const N0 = [C0, S0, 0.0], N1 = [C1, S1, 0.0];

        Facets.push({ Corners: [[CenterX, CenterY, Z0], P10, P00], Normals: [[0, 0, -1], [0, 0, -1], [0, 0, -1]], Family: BotMat });
        Facets.push({ Corners: [P00, P10, P11], Normals: [N0, N1, N1], Family: SideMat });
        Facets.push({ Corners: [P00, P11, P01], Normals: [N0, N1, N0], Family: SideMat });
        Facets.push({ Corners: [[CenterX, CenterY, Z1], P01, P11], Normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]], Family: TopMat });
    }
    return Facets;
}

// 📝 Closed 2-manifold Wheeled Butler Service Robot (rubber drive wheels + mobile base + tuxedo/livery torso + glowing visor head).
export function EmitServiceButlerFacets(PrimaryMat, AccentMat)
{
    const Facets = [];
    // ① Left & right rubber drive wheels (Y = ±0.33 m) + central wheeled drive chassis
    Facets.push(...EmitCornerBoxFacets([-0.22, -0.38, 0.00], [ 0.22, -0.28, 0.28], CourseMaterial.Tyre));
    Facets.push(...EmitCornerBoxFacets([-0.22,  0.28, 0.00], [ 0.22,  0.38, 0.28], CourseMaterial.Tyre));
    Facets.push(...EmitCornerBoxFacets([-0.28, -0.27, 0.05], [ 0.28,  0.27, 0.24], CourseMaterial.SteelDark));
    // ② Upright butler torso + glowing chest meter screen + butler tray collar (disjoint by >= 6 mm for exact 2-manifoldness)
    Facets.push(...EmitCornerBoxFacets([-0.21, -0.23, 0.25], [ 0.21,  0.23, 0.96], PrimaryMat));
    Facets.push(...EmitCornerBoxFacets([ 0.22, -0.15, 0.56], [ 0.25,  0.15, 0.84], AccentMat));
    Facets.push(...EmitCornerBoxFacets([-0.24, -0.28, 0.97], [ 0.26,  0.28, 1.05], CourseMaterial.SteelDark));
    // ③ Friendly robotic butler head + glowing optical visor + status beacon crown
    Facets.push(...EmitCornerBoxFacets([-0.16, -0.17, 1.06], [ 0.16,  0.17, 1.32], PrimaryMat));
    Facets.push(...EmitCornerBoxFacets([ 0.17, -0.13, 1.13], [ 0.20,  0.13, 1.25], CourseMaterial.GateLamp));
    Facets.push(...EmitCornerBoxFacets([-0.06, -0.06, 1.33], [ 0.06,  0.06, 1.41], AccentMat));
    return Facets;
}

// 📝 Closed 2-manifold Articulated Robotic Fuel / 800V EV Nozzle Arm (extends from Butler chest into the vehicle's tank port!).
export function EmitServiceNozzleArmFacets()
{
    const Facets = [];
    // Rear shoulder actuator housing -> telescopic carbon boom -> glowing magnetic fuel/EV nozzle tip at +X = +0.46 m
    Facets.push(...EmitCornerBoxFacets([-0.46, -0.09, -0.09], [-0.14,  0.09, 0.09], CourseMaterial.SteelDark));
    Facets.push(...EmitCornerBoxFacets([-0.13, -0.055,-0.055],[ 0.28,  0.055,0.055],CourseMaterial.PaintYellow));
    Facets.push(...EmitCornerBoxFacets([ 0.29, -0.085,-0.085],[ 0.46,  0.085,0.085],CourseMaterial.GateLamp));
    return Facets;
}

// 📝 Compact Station Fuel/Charge Precision Drone (guides & places the fuel/charge coupler at the vehicle's tank port!).
export function EmitServiceHelperDroneFacets()
{
    const Facets = [];
    Facets.push(...EmitCornerBoxFacets([-0.28, -0.22, -0.07], [0.28, 0.22,  0.12], CourseMaterial.PaintWhite));
    Facets.push(...EmitCornerBoxFacets([ 0.29, -0.14, -0.02], [0.34, 0.14,  0.08], CourseMaterial.GateLamp));
    // Underside fuel-cap alignment manipulator claw / inductive ring
    Facets.push(...EmitCornerBoxFacets([-0.10, -0.10, -0.22], [0.10, 0.10, -0.08], CourseMaterial.BannerAmber));
    for (const SX of [-1.0, 1.0])
        for (const SY of [-1.0, 1.0])
            Facets.push(...EmitOctagonalCylinder(SX * 0.38, SY * 0.40, -0.02, 0.11, 0.17,
                                                 CourseMaterial.WallCobalt, CourseMaterial.GateLamp, CourseMaterial.BannerAmber, 8));
    return Facets;
}

// 📝 Automatic Octane-100 Fuel Dispenser Island Unit.
export function EmitFuelDispenserPumpFacets()
{
    const Facets = [];
    Facets.push(...EmitCornerBoxFacets([-0.62, -0.42, 0.00], [0.62, 0.42, 0.18], CourseMaterial.BarrierConcrete));
    Facets.push(...EmitCornerBoxFacets([-0.48, -0.30, 0.19], [0.48, 0.30, 1.88], CourseMaterial.WallCrimson));
    Facets.push(...EmitCornerBoxFacets([-0.34, -0.33, 1.08], [0.34, 0.33, 1.62], CourseMaterial.GateLamp));
    Facets.push(...EmitCornerBoxFacets([-0.52, -0.34, 1.89], [0.52, 0.34, 2.18], CourseMaterial.BannerAmber));
    return Facets;
}

// 📝 Automatic 800V Electric Supercharger Pedestal Unit.
export function EmitElectricChargerPodFacets()
{
    const Facets = [];
    Facets.push(...EmitCornerBoxFacets([-0.62, -0.42, 0.00], [0.62, 0.42, 0.18], CourseMaterial.BarrierConcrete));
    Facets.push(...EmitCornerBoxFacets([-0.46, -0.26, 0.19], [0.46, 0.26, 2.12], CourseMaterial.PaintWhite));
    // Glowing cyan/emerald high-voltage power core column
    Facets.push(...EmitCornerBoxFacets([-0.24, -0.29, 0.52], [0.24, 0.29, 1.86], CourseMaterial.GateLamp));
    Facets.push(...EmitCornerBoxFacets([-0.50, -0.30, 2.13], [0.50, 0.30, 2.38], CourseMaterial.PaintGreen));
    return Facets;
}

// 📝 Interior Factory Hydraulic Stamping Press (heavy industrial yellow/steel gantry press inside the factory hall!).
export function EmitFactoryStampingPressFacets()
{
    const Facets = [];
    Facets.push(...EmitCornerBoxFacets([-2.10, -1.60, 0.00], [ 2.10,  1.60, 0.75], CourseMaterial.SteelDark));
    Facets.push(...EmitCornerBoxFacets([-1.95, -1.45, 0.76], [-1.25,  1.45, 5.20], CourseMaterial.PaintYellow));
    Facets.push(...EmitCornerBoxFacets([ 1.25, -1.45, 0.76], [ 1.95,  1.45, 5.20], CourseMaterial.PaintYellow));
    Facets.push(...EmitCornerBoxFacets([-2.15, -1.55, 5.21], [ 2.15,  1.55, 6.25], CourseMaterial.WallCobalt));
    // Hydraulic ram platen & glowing laser work-cell bar
    Facets.push(...EmitCornerBoxFacets([-1.10, -1.15, 2.15], [ 1.10,  1.15, 3.35], CourseMaterial.SteelDark));
    Facets.push(...EmitCornerBoxFacets([-1.18, -1.20, 1.96], [ 1.18,  1.20, 2.12], CourseMaterial.BannerAmber));
    return Facets;
}

// 📝 Interior Factory Automated Assembly Conveyor Line with prototype chassis/battery pack workpieces on belt!
export function EmitFactoryConveyorLineFacets()
{
    const Facets = [];
    // Support legs + 10 m conveyor bed + yellow safety side-rails
    for (const LX of [-4.2, -1.4, 1.4, 4.2])
        Facets.push(...EmitCornerBoxFacets([LX - 0.22, -1.05, 0.00], [LX + 0.22, 1.05, 0.88], CourseMaterial.SteelDark));
    Facets.push(...EmitCornerBoxFacets([-5.00, -1.18, 0.89], [ 5.00,  1.18, 1.12], CourseMaterial.PaintYellow));
    Facets.push(...EmitCornerBoxFacets([-4.85, -0.96, 1.13], [ 4.85,  0.96, 1.20], CourseMaterial.Tyre));
    // Two unfinished EV battery / chassis sub-assemblies riding on the belt
    Facets.push(...EmitCornerBoxFacets([-3.20, -0.72, 1.21], [-0.80,  0.72, 1.78], CourseMaterial.Aluminium));
    Facets.push(...EmitCornerBoxFacets([ 0.80, -0.72, 1.21], [ 3.20,  0.72, 1.78], CourseMaterial.WallCobalt));
    Facets.push(...EmitCornerBoxFacets([ 1.20, -0.52, 1.79], [ 2.80,  0.52, 2.02], CourseMaterial.GateLamp));
    return Facets;
}

// 📝 Multi-tier Factory Heavy Pallet Storage Rack loaded with industrial containers.
export function EmitFactoryStorageRackFacets()
{
    const Facets = [];
    for (const SX of [-2.8, 0.0, 2.8])
        for (const SY of [-0.95, 0.95])
            Facets.push(...EmitCornerBoxFacets([SX - 0.12, SY - 0.12, 0.00], [SX + 0.12, SY + 0.12, 4.60], CourseMaterial.WallCobalt));
    for (const BeamZ of [1.45, 3.05])
        Facets.push(...EmitCornerBoxFacets([-2.95, -1.08, BeamZ], [2.95, 1.08, BeamZ + 0.16], CourseMaterial.ConeOrange));
    // Palletized cargo boxes on shelves
    Facets.push(...EmitCornerBoxFacets([-2.45, -0.82, 0.01], [-0.45, 0.82, 1.32], CourseMaterial.PaintYellow));
    Facets.push(...EmitCornerBoxFacets([ 0.45, -0.82, 0.01], [ 2.45, 0.82, 1.32], CourseMaterial.WallCrimson));
    Facets.push(...EmitCornerBoxFacets([-2.35, -0.78, 1.62], [-0.35, 0.78, 2.92], CourseMaterial.PaintGreen));
    Facets.push(...EmitCornerBoxFacets([ 0.35, -0.78, 1.62], [ 2.35, 0.78, 2.92], CourseMaterial.Aluminium));
    Facets.push(...EmitCornerBoxFacets([-1.85, -0.75, 3.22], [ 1.85, 0.75, 4.35], CourseMaterial.ConeOrange));
    return Facets;
}

// 📝 Cylindrical Industrial Factory Chemical / Fuel Storage Silo Tank.
export function EmitFactoryTankSiloFacets()
{
    const Facets = [];
    Facets.push(...EmitCornerBoxFacets([-1.85, -1.85, 0.00], [1.85, 1.85, 0.38], CourseMaterial.BarrierConcrete));
    Facets.push(...EmitOctagonalCylinder(0.0, 0.0, 0.39, 5.80, 1.62, CourseMaterial.Aluminium, CourseMaterial.PaintWhite, CourseMaterial.SteelDark, 14));
    Facets.push(...EmitOctagonalCylinder(0.0, 0.0, 2.60, 3.25, 1.66, CourseMaterial.BannerAmber, CourseMaterial.BannerAmber, CourseMaterial.BannerAmber, 14));
    return Facets;
}

export function ConstructFactoryAndServiceShapes()
{
    return {
        // Dynamic Automatic Station Robotics (in 3D SDF + GI Cards + Dynamic!)
        ServiceButlerFuel:    { Emit: () => EmitServiceButlerFacets(CourseMaterial.WallCrimson, CourseMaterial.BannerAmber), Voxel: 0.22, Cards: 6 },
        ServiceButlerEV:      { Emit: () => EmitServiceButlerFacets(CourseMaterial.PaintWhite,  CourseMaterial.PaintGreen),  Voxel: 0.22, Cards: 6 },
        ServiceNozzleArm:     { Emit: EmitServiceNozzleArmFacets,     Voxel: 0.16, Cards: 6 },
        ServiceHelperDrone:   { Emit: EmitServiceHelperDroneFacets,   Voxel: 0.18, Cards: 6 },

        // Station Dispenser Islands & Canopies
        FuelDispenserPump:    { Emit: EmitFuelDispenserPumpFacets,    Voxel: 0.34, Cards: 6 },
        ElectricChargerPod:   { Emit: EmitElectricChargerPodFacets,   Voxel: 0.34, Cards: 6 },
        StationCanopyPillar:  { Emit: () => EmitBoxFacets(0.58,  0.58, 5.40, CourseMaterial.SteelDark),     Voxel: 0.0, Cards: 0, Distance: false },
        StationCanopyFuel:    { Emit: () => EmitBoxFacets(16.8, 10.6,  0.68, CourseMaterial.WallCrimson),   Voxel: 0.0, Cards: 0, Distance: false },
        StationCanopyEV:      { Emit: () => EmitBoxFacets(16.8, 10.6,  0.68, CourseMaterial.WallCobalt),    Voxel: 0.0, Cards: 0, Distance: false },
        StationCanopyLamp:    { Emit: () => EmitBoxFacets(12.4,  0.55, 0.14, CourseMaterial.GateLamp),      Voxel: 0.0, Cards: 0, Distance: false },

        // Drive-Through Industrial Megafactory Architecture & Interior Machinery Props
        FactoryColumn:        { Emit: () => EmitBoxFacets(1.10,  1.10, 11.2, CourseMaterial.SteelDark),     Voxel: 0.0, Cards: 0, Distance: false },
        FactoryWallPanel:     { Emit: () => EmitBoxFacets(13.6,  0.85, 10.4, CourseMaterial.TunnelConcrete),Voxel: 0.0, Cards: 0, Distance: false },
        FactoryEndWall:       { Emit: () => EmitBoxFacets(0.85, 17.6,  10.4, CourseMaterial.WallCobalt),    Voxel: 0.0, Cards: 0, Distance: false },
        FactoryDoorHeader:    { Emit: () => EmitBoxFacets(1.10, 20.4,   3.4, CourseMaterial.PaintYellow),   Voxel: 0.0, Cards: 0, Distance: false },
        FactoryRoofSlab:      { Emit: () => EmitBoxFacets(18.8, 56.4,   0.72,CourseMaterial.SteelDark),     Voxel: 0.0, Cards: 0, Distance: false },
        FactoryHighBayLamp:   { Emit: () => EmitBoxFacets(3.60,  0.75,  0.18,CourseMaterial.GateLamp),      Voxel: 0.0, Cards: 0, Distance: false },
        FactoryChimney:       { Emit: () => EmitOctagonalCylinder(0, 0, 0.0, 9.5, 1.15, CourseMaterial.SteelDark, CourseMaterial.KerbRed, CourseMaterial.SteelDark, 12), Voxel: 0.0, Cards: 0, Distance: false },
        FactoryStampingPress: { Emit: EmitFactoryStampingPressFacets, Voxel: 0.0, Cards: 0, Distance: false },
        FactoryConveyorLine:  { Emit: EmitFactoryConveyorLineFacets,  Voxel: 0.0, Cards: 0, Distance: false },
        FactoryStorageRack:   { Emit: EmitFactoryStorageRackFacets,   Voxel: 0.0, Cards: 0, Distance: false },
        FactoryTankSilo:      { Emit: EmitFactoryTankSiloFacets,      Voxel: 0.0, Cards: 0, Distance: false }
    };
}

//------------------------------------------------------------------------------------------------------------------------
//            AUTOMATIC FUEL & 800V ELECTRIC CHARGING SEQUENCE (BUTLER ROBOT + NOZZLE ARM + HELPER DRONE)
//------------------------------------------------------------------------------------------------------------------------

function LerpScalar(A, B, T)
{
    return A + (B - A) * T;
}

function SmoothStep01(T)
{
    const U = ClampScalar(T, 0.0, 1.0);
    return U * U * (3.0 - 2.0 * U);
}

export class ServiceStationSequence
{
    constructor(Scene, RawStations = [], AnnounceCallback = null)
    {
        this.Scene       = Scene;
        this.Enabled     = true;
        this.Audio       = new ServiceAudio();
        this.Announce    = AnnounceCallback;
        this.Clock       = 0.0;
        this.FuelLevel   = 0.34;   // [0..1] simulated vehicle fuel tank level (refilled to 100% at Auto-Fuel Station!)
        this.ChargeLevel = 0.28;   // [0..1] simulated 800V EV battery SoC (charged to 100% at Auto-EV Station!)
        this.ServicedCount = 0;
        this.Stations    = [];
        this.BuildStations(RawStations);
    }

    BuildStations(RawStations)
    {
        if (!this.Scene || !this.Scene.ServiceBlock)
            return;
        let Cursor = this.Scene.ServiceBlock.First;
        this.Stations = RawStations.map((Spec) =>
        {
            const ButlerOccupant = Cursor++;
            const ArmOccupant    = Cursor++;
            const DroneOccupant  = Cursor++;
            return {
                Id:             Spec.Id,
                Name:           Spec.Name,
                Kind:           Spec.Kind,   // "fuel" | "electric"
                BayCenter:      Spec.BayCenter.slice(),
                BayHalfExtent:  Spec.BayHalfExtent || [7.8, 4.4],
                DockPosition:   Spec.DockPosition.slice(),
                DockYaw:        Spec.DockYaw ?? -0.5 * Math.PI,
                DronePerch:     Spec.DronePerch ? Spec.DronePerch.slice() : [Spec.DockPosition[0] + 2.2, Spec.DockPosition[1], 3.35],
                ButlerOccupant,
                ArmOccupant,
                DroneOccupant,
                State:          "idle",      // "idle" | "stopping" | "deploying" | "coupling" | "dispensing" | "retracting" | "complete"
                StateTimer:     0.0,
                Progress:       0.0,
                StartLevel:     0.25,
                AnchorCarPos:   [0.0, 0.0, 0.0],
                TargetStandPos: Spec.DockPosition.slice(),
                TargetPortPos:  [Spec.BayCenter[0], Spec.BayCenter[1], 0.85],
                ButlerPos:      Spec.DockPosition.slice(),
                ButlerYaw:      Spec.DockYaw ?? -0.5 * Math.PI,
                DronePos:       Spec.DronePerch ? Spec.DronePerch.slice() : [Spec.DockPosition[0] + 2.2, Spec.DockPosition[1], 3.35],
                DroneYaw:       0.0,
                ArmPos:         [Spec.DockPosition[0], Spec.DockPosition[1], 0.82],
                ArmQuat:        [0.0, 0.0, 0.0, 1.0]
            };
        });
        this.ApplyTransforms(true);
    }

    Notify(Message)
    {
        const Handler = this.OnAnnounce || this.Announce;
        if (typeof Handler === "function")
            Handler(Message);
    }

    EmitCouplerSparks(Sparks, WorldPoint, Count, Temperature = 2100.0)
    {
        if (!Sparks || typeof Sparks.EmitBurst !== "function")
            return;
        Sparks.EmitBurst({
            Origin:      WorldPoint,
            Normal:      [0.0, 0.0, 1.0],
            Tangent:     [1.0, 0.0, 0.25],
            Velocity:    [0.0, 0.0, 1.6],
            Count,
            Speed:       4.2,
            Spread:      1.05,
            Lifetime:    0.55,
            Temperature
        });
    }

    get BatteryLevel()
    {
        return this.ChargeLevel;
    }

    set BatteryLevel(Value)
    {
        this.ChargeLevel = ClampScalar(Number(Value) || 0.0, 0.0, 1.0);
    }

    Reset(ResetLevels = false)
    {
        this.Audio.StopDispensing();
        if (ResetLevels)
        {
            this.FuelLevel   = 0.34;
            this.ChargeLevel = 0.28;
        }
        for (const Station of this.Stations)
        {
            Station.State      = "idle";
            Station.StateTimer = 0.0;
            Station.Progress   = 0.0;
            Station.ButlerPos  = Station.DockPosition.slice();
            Station.ButlerYaw  = Station.DockYaw;
            Station.DronePos   = Station.DronePerch.slice();
        }
        this.ApplyTransforms(true);
    }

    ComputeVehiclePortTargets(Station, Vehicle)
    {
        const CarPos  = Vehicle.Position;
        const CarQuat = Vehicle.Orientation || [0.0, 0.0, 0.0, 1.0];
        const Fwd     = RotateVector(CarQuat, [1.0, 0.0, 0.0]);
        const Left    = RotateVector(CarQuat, [0.0, 1.0, 0.0]);
        const Up      = RotateVector(CarQuat, [0.0, 0.0, 1.0]);

        // Choose whichever flank of the vehicle faces the station's dispenser dock so the butler never crosses through the car!
        const ToDockX  = Station.DockPosition[0] - CarPos[0];
        const ToDockY  = Station.DockPosition[1] - CarPos[1];
        const SideSign = (ToDockX * Left[0] + ToDockY * Left[1]) >= 0.0 ? 1.0 : -1.0;
        const Outward  = [Left[0] * SideSign, Left[1] * SideSign, Left[2] * SideSign];

        // Rear quarter-panel fuel tank / 800V charge port in world space
        const PortWorld = [
            CarPos[0] - 1.24 * Fwd[0] + 0.94 * Outward[0] + 0.24 * Up[0],
            CarPos[1] - 1.24 * Fwd[1] + 0.94 * Outward[1] + 0.24 * Up[1],
            Math.max(0.55, CarPos[2] - 1.24 * Fwd[2] + 0.94 * Outward[2] + 0.24 * Up[2])
        ];
        // Butler wheeled robot stands 0.96 m outboard of the tank port on the tarmac (Z = 0)
        const OutLen = Math.hypot(Outward[0], Outward[1]) || 1.0;
        const NX = Outward[0] / OutLen, NY = Outward[1] / OutLen;
        const StandWorld = [
            PortWorld[0] + NX * 0.96,
            PortWorld[1] + NY * 0.96,
            0.0
        ];
        return { PortWorld, StandWorld, Outward: [NX, NY, 0.0] };
    }

    Advance(Vehicle, DeltaSeconds, Sparks = null)
    {
        if (!this.Scene || this.Stations.length === 0)
            return false;
        const Step = Math.min(Math.max(DeltaSeconds, 0.0), 0.05);
        if (!this.Enabled || Step <= 0.0)
            return false;

        this.Clock += Step;
        const CarPos = Vehicle?.Position || [9999.0, 9999.0, 0.0];
        const CarVel = Vehicle?.LinearVelocity || [0.0, 0.0, 0.0];
        const Speed  = Math.hypot(CarVel[0], CarVel[1], CarVel[2]);

        // Gentle fuel/charge consumption while driving at speed so returning to a station always tops up meaningfully!
        if (Speed > 3.0)
        {
            this.FuelLevel   = Math.max(0.12, this.FuelLevel   - Step * Speed * 0.00018);
            this.ChargeLevel = Math.max(0.12, this.ChargeLevel - Step * Speed * 0.00022);
        }

        for (const Station of this.Stations)
        {
            const InBay =
                Math.abs(CarPos[0] - Station.BayCenter[0]) <= Station.BayHalfExtent[0] &&
                Math.abs(CarPos[1] - Station.BayCenter[1]) <= Station.BayHalfExtent[1] &&
                Math.abs(CarPos[2]) < 2.2;

            if (Station.State === "idle")
            {
                // Idle hover orbit for helper drone above station canopy
                const Phase = this.Clock * 1.4 + (Station.Kind === "electric" ? 1.6 : 0.0);
                Station.ButlerPos = Station.DockPosition.slice();
                Station.ButlerYaw = Station.DockYaw;
                Station.DronePos = [
                    Station.DronePerch[0] + 0.85 * Math.cos(Phase),
                    Station.DronePerch[1] + 0.55 * Math.sin(Phase),
                    Station.DronePerch[2] + 0.14 * Math.sin(Phase * 1.7)
                ];
                Station.DroneYaw = Phase + 0.5 * Math.PI;
                if (InBay && Speed < 1.45)
                {
                    Station.State = "stopping";
                    Station.StateTimer = 0.0;
                }
            }
            else if (Station.State === "stopping")
            {
                if (!InBay || Speed > 1.85)
                {
                    Station.State = "idle";
                    Station.StateTimer = 0.0;
                }
                else
                {
                    Station.StateTimer += Step;
                    if (Station.StateTimer >= 0.28)
                    {
                        const Targets = this.ComputeVehiclePortTargets(Station, Vehicle);
                        Station.AnchorCarPos   = CarPos.slice();
                        Station.TargetPortPos  = Targets.PortWorld;
                        Station.TargetStandPos = Targets.StandWorld;
                        Station.StartLevel     = Station.Kind === "electric" ? this.ChargeLevel : this.FuelLevel;
                        Station.Progress       = 0.0;
                        Station.State          = "deploying";
                        Station.StateTimer     = 0.0;
                        this.Audio.PlayStationWelcome(Station.Kind);
                        this.Notify(Station.Kind === "electric"
                            ? "⚡ Auto-EV Station: Butler Robot & Drone deploying to charge port..."
                            : "⛽ Auto-Fuel Station: Butler Robot & Drone deploying to fuel tank...");
                    }
                }
            }
            else if (Station.State === "deploying")
            {
                const MovedDist = Math.hypot(CarPos[0] - Station.AnchorCarPos[0], CarPos[1] - Station.AnchorCarPos[1]);
                if (!InBay || Speed > 2.6 || MovedDist > 1.8)
                {
                    this.AbortStation(Station);
                    continue;
                }
                const Targets = this.ComputeVehiclePortTargets(Station, Vehicle);
                Station.TargetPortPos  = Targets.PortWorld;
                Station.TargetStandPos = Targets.StandWorld;
                Station.StateTimer += Step;
                const T = SmoothStep01(Station.StateTimer / 1.10);

                // Wheeled Butler Robot rolls out from DockPosition -> TargetStandPos!
                Station.ButlerPos = [
                    LerpScalar(Station.DockPosition[0], Station.TargetStandPos[0], T),
                    LerpScalar(Station.DockPosition[1], Station.TargetStandPos[1], T),
                    0.0
                ];
                const FaceYaw = Math.atan2(Station.TargetPortPos[1] - Station.ButlerPos[1],
                                           Station.TargetPortPos[0] - Station.ButlerPos[0]);
                Station.ButlerYaw = FaceYaw;

                // Helper Drone swoops down from canopy perch right over the car's fuel tank to place/guide the nozzle!
                const HoverGoal = [
                    Station.TargetPortPos[0] + Targets.Outward[0] * 0.28,
                    Station.TargetPortPos[1] + Targets.Outward[1] * 0.28,
                    Station.TargetPortPos[2] + 0.44
                ];
                Station.DronePos = [
                    LerpScalar(Station.DronePerch[0], HoverGoal[0], T),
                    LerpScalar(Station.DronePerch[1], HoverGoal[1], T),
                    LerpScalar(Station.DronePerch[2], HoverGoal[2], T)
                ];
                Station.DroneYaw = FaceYaw;

                if (Station.StateTimer >= 1.10)
                {
                    Station.State = "coupling";
                    Station.StateTimer = 0.0;
                    this.Audio.PlayCouplerLatch(Station.Kind);
                    this.EmitCouplerSparks(Sparks, Station.TargetPortPos, 10, Station.Kind === "electric" ? 2600.0 : 1850.0);
                }
            }
            else if (Station.State === "coupling")
            {
                const MovedDist = Math.hypot(CarPos[0] - Station.AnchorCarPos[0], CarPos[1] - Station.AnchorCarPos[1]);
                if (!InBay || Speed > 2.6 || MovedDist > 1.8)
                {
                    this.AbortStation(Station);
                    continue;
                }
                const Targets = this.ComputeVehiclePortTargets(Station, Vehicle);
                Station.TargetPortPos  = Targets.PortWorld;
                Station.TargetStandPos = Targets.StandWorld;
                Station.ButlerPos      = Station.TargetStandPos.slice();
                Station.ButlerYaw      = Math.atan2(Station.TargetPortPos[1] - Station.ButlerPos[1],
                                                    Station.TargetPortPos[0] - Station.ButlerPos[0]);
                Station.DronePos = [
                    Station.TargetPortPos[0] + Targets.Outward[0] * 0.24,
                    Station.TargetPortPos[1] + Targets.Outward[1] * 0.24,
                    Station.TargetPortPos[2] + 0.36 + 0.04 * Math.sin(this.Clock * 6.0)
                ];
                Station.DroneYaw = Station.ButlerYaw;
                Station.StateTimer += Step;
                if (Station.StateTimer >= 0.60)
                {
                    Station.State = "dispensing";
                    Station.StateTimer = 0.0;
                    this.Audio.StartDispensing(Station.Kind);
                }
            }
            else if (Station.State === "dispensing")
            {
                const MovedDist = Math.hypot(CarPos[0] - Station.AnchorCarPos[0], CarPos[1] - Station.AnchorCarPos[1]);
                if (!InBay || Speed > 2.6 || MovedDist > 1.8)
                {
                    this.AbortStation(Station);
                    continue;
                }
                const Targets = this.ComputeVehiclePortTargets(Station, Vehicle);
                Station.TargetPortPos  = Targets.PortWorld;
                Station.TargetStandPos = Targets.StandWorld;
                Station.ButlerPos      = Station.TargetStandPos.slice();
                Station.ButlerYaw      = Math.atan2(Station.TargetPortPos[1] - Station.ButlerPos[1],
                                                    Station.TargetPortPos[0] - Station.ButlerPos[0]);
                Station.DronePos = [
                    Station.TargetPortPos[0] + Targets.Outward[0] * 0.24,
                    Station.TargetPortPos[1] + Targets.Outward[1] * 0.24,
                    Station.TargetPortPos[2] + 0.36 + 0.05 * Math.sin(this.Clock * 7.0)
                ];
                Station.DroneYaw = Station.ButlerYaw;

                Station.StateTimer += Step;
                Station.Progress = ClampScalar(Station.StateTimer / 2.60, 0.0, 1.0);
                this.Audio.UpdateDispensing(Station.Progress);

                if (Station.Kind === "electric")
                    this.ChargeLevel = LerpScalar(Station.StartLevel, 1.0, Station.Progress);
                else
                    this.FuelLevel = LerpScalar(Station.StartLevel, 1.0, Station.Progress);

                if (Station.Progress >= 1.0)
                {
                    Station.State = "retracting";
                    Station.StateTimer = 0.0;
                    this.ServicedCount++;
                    this.Audio.PlayCompletionChime(Station.Kind);
                    this.EmitCouplerSparks(Sparks, Station.TargetPortPos, 14, Station.Kind === "electric" ? 2800.0 : 1950.0);
                    this.Notify(Station.Kind === "electric"
                        ? "⚡ 800V Battery 100% Charged (85 kWh) — Auto-EV Butler returning to dock!"
                        : "⛽ Octane-100 Tank 100% Full (60 L) — Auto-Fuel Butler returning to dock!");
                }
            }
            else if (Station.State === "retracting")
            {
                Station.StateTimer += Step;
                const T = SmoothStep01(Station.StateTimer / 1.10);
                Station.ButlerPos = [
                    LerpScalar(Station.TargetStandPos[0], Station.DockPosition[0], T),
                    LerpScalar(Station.TargetStandPos[1], Station.DockPosition[1], T),
                    0.0
                ];
                Station.ButlerYaw = LerpScalar(Station.ButlerYaw, Station.DockYaw, T);
                Station.DronePos = [
                    LerpScalar(Station.TargetPortPos[0], Station.DronePerch[0], T),
                    LerpScalar(Station.TargetPortPos[1], Station.DronePerch[1], T),
                    LerpScalar(Station.TargetPortPos[2] + 0.42, Station.DronePerch[2], T)
                ];
                if (Station.StateTimer >= 1.10)
                {
                    Station.State = InBay ? "complete" : "idle";
                    Station.StateTimer = 0.0;
                }
            }
            else if (Station.State === "complete")
            {
                const Phase = this.Clock * 1.4;
                Station.ButlerPos = Station.DockPosition.slice();
                Station.ButlerYaw = Station.DockYaw;
                Station.DronePos = [
                    Station.DronePerch[0] + 0.85 * Math.cos(Phase),
                    Station.DronePerch[1] + 0.55 * Math.sin(Phase),
                    Station.DronePerch[2] + 0.14 * Math.sin(Phase * 1.7)
                ];
                Station.DroneYaw = Phase + 0.5 * Math.PI;
                if (!InBay)
                {
                    Station.State = "idle";
                    Station.Progress = 0.0;
                }
            }

            this.ComputeNozzleArmPose(Station);
        }

        this.ApplyTransforms(false);
        return true;
    }

    AbortStation(Station)
    {
        this.Audio.PlayAbortRelease();
        this.Notify(Station.Kind === "electric"
            ? "⚡ Auto-EV Charge released — vehicle departed bay"
            : "⛽ Auto-Fuel Coupler released — vehicle departed bay");
        Station.TargetStandPos = Station.ButlerPos.slice();
        Station.State = "retracting";
        Station.StateTimer = 0.0;
        this.ComputeNozzleArmPose(Station);
    }

    ComputeNozzleArmPose(Station)
    {
        const CosB = Math.cos(Station.ButlerYaw), SinB = Math.sin(Station.ButlerYaw);
        const Shoulder = [
            Station.ButlerPos[0] + CosB * 0.20,
            Station.ButlerPos[1] + SinB * 0.20,
            0.84
        ];

        let Reach = 0.0;
        if (Station.State === "coupling")
            Reach = SmoothStep01(Station.StateTimer / 0.60);
        else if (Station.State === "dispensing")
            Reach = 1.0;
        else if (Station.State === "retracting")
            Reach = 1.0 - SmoothStep01(Math.min(1.0, Station.StateTimer / 0.35));

        const TipGoal = [
            LerpScalar(Shoulder[0] + CosB * 0.34, Station.TargetPortPos[0], Reach),
            LerpScalar(Shoulder[1] + SinB * 0.34, Station.TargetPortPos[1], Reach),
            LerpScalar(0.84, Station.TargetPortPos[2], Reach)
        ];
        const DX = TipGoal[0] - Shoulder[0];
        const DY = TipGoal[1] - Shoulder[1];
        const DZ = TipGoal[2] - Shoulder[2];
        const Horiz = Math.hypot(DX, DY) || 1.0e-4;
        const Yaw   = Math.atan2(DY, DX);
        const Pitch = -Math.atan2(DZ, Horiz);

        const QYaw   = ConstructAxisQuaternion([0.0, 0.0, 1.0], Yaw);
        const QPitch = ConstructAxisQuaternion([0.0, 1.0, 0.0], Pitch);
        Station.ArmQuat = MultiplyQuaternion(QYaw, QPitch);

        // Position arm center so its +0.46 m glowing nozzle tip lands right at TipGoal!
        const DirLen = Math.hypot(DX, DY, DZ) || 1.0;
        const UX = DX / DirLen, UY = DY / DirLen, UZ = DZ / DirLen;
        Station.ArmPos = [
            TipGoal[0] - UX * 0.44,
            TipGoal[1] - UY * 0.44,
            TipGoal[2] - UZ * 0.44
        ];
    }

    ApplyTransforms(InitialSnap = false)
    {
        for (const Station of this.Stations)
        {
            this.ComputeNozzleArmPose(Station);
            const QButler = ConstructAxisQuaternion([0.0, 0.0, 1.0], Station.ButlerYaw);
            const QDrone  = ConstructAxisQuaternion([0.0, 0.0, 1.0], Station.DroneYaw);

            const Write = (OccupantIdx, Pos, Quat) =>
            {
                const Occ = this.Scene.Occupants[OccupantIdx];
                if (!Occ)
                    return;
                if (!InitialSnap)
                    Occ.PreviousTransform.set(Occ.Transform);
                Occ.Transform = ConstructRigidTransform(Pos, Quat);
                if (InitialSnap)
                    Occ.PreviousTransform = Occ.Transform.slice();
                Occ.Moving = !InitialSnap;
            };

            Write(Station.ButlerOccupant, Station.ButlerPos, QButler);
            Write(Station.ArmOccupant,    Station.ArmPos,    Station.ArmQuat);
            Write(Station.DroneOccupant,  Station.DronePos,  QDrone);
        }
    }

    QuerySummary()
    {
        const Active = this.Stations.find((S) => S.State !== "idle" && S.State !== "complete");
        return {
            StationCount:      this.Stations.length,
            ActiveKind:        Active ? Active.Kind : null,
            ActiveName:        Active ? Active.Name : null,
            ActiveState:       Active ? Active.State : "idle",
            ActivePercent:     Active ? Math.round(Active.Progress * 100) : 0,
            FuelPercent:       Math.round(this.FuelLevel * 100),
            ChargePercent:     Math.round(this.ChargeLevel * 100),
            BatteryPercent:    Math.round(this.ChargeLevel * 100),
            ServicedCount:     this.ServicedCount,
            CompletedServices: this.ServicedCount
        };
    }
}
