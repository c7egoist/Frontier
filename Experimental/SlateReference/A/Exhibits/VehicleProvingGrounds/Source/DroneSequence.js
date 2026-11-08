//============================================================================================================================================
//                                                           DRONESEQUENCE.JS
//============================================================================================================================================
// 🧩 Autonomous Floating Midair Robot Drones — Separate aerial robotics module managing 6-DOF hovering quad-rotor survey,
//    construction-inspection, and broadcast drones that patrol midair orbits, bank into turns, and optically track the vehicle.

import { CourseMaterial } from "./MaterialSpecification.js";
import { EmitCornerBoxFacets } from "./CourseStructure.js";
import { ConstructAxisQuaternion, MultiplyQuaternion, ConstructRigidTransform, ClampScalar } from "./TransformProjection.js";

//------------------------------------------------------------------------------------------------------------------------
//                           WATERTIGHT 2-MANIFOLD QUAD-ROTOR ROBOT DRONE GEOMETRY
//------------------------------------------------------------------------------------------------------------------------

function EmitOctagonalPodFacets(CenterX, CenterY, Z0, Z1, Radius, SideMaterial, TopMaterial, BottomMaterial)
{
    const Facets = [];
    const Sides = 8;
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

        // Bottom cap (-Z)
        Facets.push({
            Corners: [[CenterX, CenterY, Z0], P10, P00],
            Normals: [[0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0]],
            Family:  BottomMaterial
        });
        // Outer duct wall
        Facets.push({ Corners: [P00, P10, P11], Normals: [N0, N1, N1], Family: SideMaterial });
        Facets.push({ Corners: [P00, P11, P01], Normals: [N0, N1, N0], Family: SideMaterial });
        // Top cap (+Z)
        Facets.push({
            Corners: [[CenterX, CenterY, Z1], P01, P11],
            Normals: [[0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0]],
            Family:  TopMaterial
        });
    }
    return Facets;
}

export function EmitSurveyDroneFacets()
{
    const Facets = [];
    // ① Central armoured aerospace robot core pod (white upper carapace + dark steel lower chassis)
    Facets.push(...EmitCornerBoxFacets([-0.44, -0.34, -0.08], [0.44,  0.34,  0.18], CourseMaterial.PaintWhite));
    Facets.push(...EmitCornerBoxFacets([-0.38, -0.28, -0.19], [0.38,  0.28, -0.09], CourseMaterial.SteelDark));
    // Dorsal cobalt telemetry fin
    Facets.push(...EmitCornerBoxFacets([-0.26, -0.12,  0.19], [0.18,  0.12,  0.29], CourseMaterial.WallCobalt));
    // ② Forward glowing optical sensor visor (+X) + rear amber strobe (-X) + underside inspection spotlight (-Z)
    Facets.push(...EmitCornerBoxFacets([ 0.45, -0.22, -0.03], [0.51,  0.22,  0.12], CourseMaterial.GateLamp));
    Facets.push(...EmitCornerBoxFacets([-0.50, -0.14,  0.00], [-0.45, 0.14,  0.11], CourseMaterial.KerbRed));
    Facets.push(...EmitCornerBoxFacets([-0.14, -0.14, -0.28], [ 0.14, 0.14, -0.20], CourseMaterial.BannerAmber));

    // ③ Four carbon-steel outrigger rotor arms + four shrouded octagonal ducted thrusters (disjoint for 100% 2-manifoldness)
    for (const SignX of [-1.0, 1.0])
    {
        for (const SignY of [-1.0, 1.0])
        {
            const ArmX0 = SignX > 0 ? 0.18 : -0.44;
            const ArmX1 = SignX > 0 ? 0.44 : -0.18;
            const ArmY0 = SignY > 0 ? 0.35 : -0.52;
            const ArmY1 = SignY > 0 ? 0.52 : -0.35;
            Facets.push(...EmitCornerBoxFacets([ArmX0, ArmY0, 0.01], [ArmX1, ArmY1, 0.09], CourseMaterial.SteelDark));

            const PodX = SignX * 0.62;
            const PodY = SignY * 0.68;
            Facets.push(...EmitOctagonalPodFacets(
                PodX, PodY, -0.04, 0.15, 0.28,
                SignX > 0 ? CourseMaterial.WallCobalt : CourseMaterial.PaintYellow,
                CourseMaterial.GateLamp,
                CourseMaterial.BannerAmber
            ));
        }
    }
    return Facets;
}

export function ConstructDroneShapes()
{
    return {
        SurveyDroneBody: {
            Emit:  EmitSurveyDroneFacets,
            Voxel: 0.13,
            Cards: 6
        }
    };
}

//------------------------------------------------------------------------------------------------------------------------
//                           6-DOF FLOATING MIDAIR ROBOT DRONE CONTROLLER
//------------------------------------------------------------------------------------------------------------------------

export class DroneSequence
{
    constructor(Scene, RawUnits = [])
    {
        this.Scene        = Scene;
        this.Enabled      = true;
        this.SpeedScale   = 1.0;
        this.TrackVehicle = true;
        this.Clock        = 0.0;
        this.Units        = [];
        this.BuildUnits(RawUnits);
    }

    BuildUnits(RawUnits)
    {
        if (!this.Scene || !this.Scene.DroneBlock)
            return;
        let OccupantCursor = this.Scene.DroneBlock.First;
        this.Units = RawUnits.map((Descriptor, UnitIdx) =>
        {
            const OccupantIndex = OccupantCursor++;
            const Unit = {
                Id:            Descriptor.Id || `drone_${UnitIdx}`,
                Name:          Descriptor.Name || `Robot Drone ${UnitIdx + 1}`,
                Role:          Descriptor.Role || "patrol",
                Anchor:        Descriptor.Anchor.slice(),
                OrbitRadiusX:  Descriptor.OrbitRadiusX ?? 14.0,
                OrbitRadiusY:  Descriptor.OrbitRadiusY ?? 8.5,
                OrbitFreq:     Descriptor.OrbitFreq ?? 0.42,
                FigureEight:   Boolean(Descriptor.FigureEight),
                HoverAmpZ:     Descriptor.HoverAmpZ ?? 0.55,
                HoverFreqZ:    Descriptor.HoverFreqZ ?? 1.35,
                Phase:         Descriptor.Phase ?? (UnitIdx * 1.15),
                OccupantIndex,
                WorldPosition: Descriptor.Anchor.slice(),
                Velocity:      [0.0, 0.0, 0.0],
                Yaw:           0.0,
                TrackingCar:   false,
                DynamicBox: {
                    Minimum: [Descriptor.Anchor[0] - 0.9, Descriptor.Anchor[1] - 0.9, Descriptor.Anchor[2] - 0.4],
                    Maximum: [Descriptor.Anchor[0] + 0.9, Descriptor.Anchor[1] + 0.9, Descriptor.Anchor[2] + 0.4]
                }
            };
            return Unit;
        });
        this.UpdatePoses(null, 0.0, true);
    }

    RegisterDynamicObstacles(ObstacleList)
    {
        if (!Array.isArray(ObstacleList))
            return;
        for (const Unit of this.Units)
        {
            if (!ObstacleList.includes(Unit.DynamicBox))
                ObstacleList.push(Unit.DynamicBox);
        }
    }

    Reset()
    {
        this.Clock = 0.0;
        this.UpdatePoses(null, 0.0, true);
    }

    Advance(Vehicle, DeltaSeconds)
    {
        if (!this.Scene || this.Units.length === 0)
            return false;
        const Step = Math.min(Math.max(DeltaSeconds, 0.0), 0.05);
        if (!this.Enabled || Step <= 0.0)
        {
            for (const Unit of this.Units)
                if (this.Scene.Occupants[Unit.OccupantIndex])
                    this.Scene.Occupants[Unit.OccupantIndex].Moving = false;
            return false;
        }
        this.Clock += Step * this.SpeedScale;
        this.UpdatePoses(Vehicle, Step, false);
        return true;
    }

    UpdatePoses(Vehicle, Step, InitialSnap = false)
    {
        const T = this.Clock;
        const CarPos = Vehicle?.Position || null;

        for (const Unit of this.Units)
        {
            const Phase = T * Unit.OrbitFreq + Unit.Phase;
            const dPhase = Unit.OrbitFreq * this.SpeedScale;

            const OffsetX = Unit.OrbitRadiusX * Math.cos(Phase);
            const OffsetY = Unit.FigureEight
                ? Unit.OrbitRadiusY * Math.sin(2.0 * Phase)
                : Unit.OrbitRadiusY * Math.sin(Phase);
            const OffsetZ = Unit.HoverAmpZ * Math.sin(T * Unit.HoverFreqZ + Unit.Phase * 1.7);

            const VelX = -Unit.OrbitRadiusX * Math.sin(Phase) * dPhase;
            const VelY = Unit.FigureEight
                ? 2.0 * Unit.OrbitRadiusY * Math.cos(2.0 * Phase) * dPhase
                : Unit.OrbitRadiusY * Math.cos(Phase) * dPhase;
            const VelZ = Unit.HoverAmpZ * Unit.HoverFreqZ * Math.cos(T * Unit.HoverFreqZ + Unit.Phase * 1.7) * this.SpeedScale;

            const Pos = [
                Unit.Anchor[0] + OffsetX,
                Unit.Anchor[1] + OffsetY,
                Unit.Anchor[2] + OffsetZ
            ];
            Unit.WorldPosition = Pos;
            Unit.Velocity = [VelX, VelY, VelZ];

            // Yaw either along flight heading or smoothly toward nearby ControlVehicle ("Scout Optical Lock")
            let TargetYaw = Math.atan2(VelY, VelX);
            Unit.TrackingCar = false;
            if (this.TrackVehicle && CarPos)
            {
                const DX = CarPos[0] - Pos[0];
                const DY = CarPos[1] - Pos[1];
                if (Math.hypot(DX, DY) < 44.0)
                {
                    TargetYaw = Math.atan2(DY, DX);
                    Unit.TrackingCar = true;
                }
            }
            if (InitialSnap || Step <= 0.0)
            {
                Unit.Yaw = TargetYaw;
            }
            else
            {
                let Diff = TargetYaw - Unit.Yaw;
                while (Diff > Math.PI)  Diff -= 2.0 * Math.PI;
                while (Diff < -Math.PI) Diff += 2.0 * Math.PI;
                Unit.Yaw += Diff * Math.min(1.0, Step * 5.0);
            }

            // Bank pitch/roll into horizontal velocity for authentic midair quad-rotor attitude
            const CosY = Math.cos(Unit.Yaw), SinY = Math.sin(Unit.Yaw);
            const ForwardSpeed = VelX * CosY + VelY * SinY;
            const LateralSpeed = -VelX * SinY + VelY * CosY;
            const Pitch = ClampScalar(ForwardSpeed * 0.032, -0.24, 0.24);
            const Roll  = ClampScalar(-LateralSpeed * 0.038, -0.28, 0.28);

            const QYaw   = ConstructAxisQuaternion([0.0, 0.0, 1.0], Unit.Yaw);
            const QPitch = ConstructAxisQuaternion([0.0, 1.0, 0.0], Pitch);
            const QRoll  = ConstructAxisQuaternion([1.0, 0.0, 0.0], Roll);
            const Quat   = MultiplyQuaternion(MultiplyQuaternion(QYaw, QPitch), QRoll);

            const Occupant = this.Scene.Occupants[Unit.OccupantIndex];
            if (Occupant)
            {
                if (!InitialSnap)
                    Occupant.PreviousTransform.set(Occupant.Transform);
                Occupant.Transform = ConstructRigidTransform(Pos, Quat);
                if (InitialSnap)
                    Occupant.PreviousTransform = Occupant.Transform.slice();
                Occupant.Moving = !InitialSnap;
            }

            Unit.DynamicBox.Minimum[0] = Pos[0] - 0.90;
            Unit.DynamicBox.Minimum[1] = Pos[1] - 0.90;
            Unit.DynamicBox.Minimum[2] = Pos[2] - 0.38;
            Unit.DynamicBox.Maximum[0] = Pos[0] + 0.90;
            Unit.DynamicBox.Maximum[1] = Pos[1] + 0.90;
            Unit.DynamicBox.Maximum[2] = Pos[2] + 0.38;

            // Midair collision deflection if the vehicle launches into a hovering drone!
            if (!InitialSnap && CarPos && Vehicle?.LinearVelocity)
            {
                const DX = CarPos[0] - Pos[0];
                const DY = CarPos[1] - Pos[1];
                const DZ = CarPos[2] - Pos[2];
                if (Math.abs(DX) < 2.2 && Math.abs(DY) < 1.8 && Math.abs(DZ) < 1.1)
                {
                    const Len = Math.hypot(DX, DY, DZ) || 1.0;
                    Vehicle.LinearVelocity[0] += (DX / Len) * 3.5;
                    Vehicle.LinearVelocity[1] += (DY / Len) * 3.5;
                }
            }
        }
    }

    QuerySummary()
    {
        let TrackingCount = 0;
        for (const Unit of this.Units)
            if (Unit.TrackingCar)
                TrackingCount++;
        return {
            DroneCount:    this.Units.length,
            TrackingCount,
            Enabled:       this.Enabled
        };
    }
}
