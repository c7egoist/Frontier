//============================================================================================================================================
//                                                          INVERSIONARENAHOOKS.MJS
//============================================================================================================================================
// 🧩 Dawn WebGPU + Jolt WASM + IlluminationHost 6-track validation across [Track A] (360° Loop + Waves),
//    [Track B] (-5.2 m Subterranean Subway + Linear Bollards), [Track C] (84 m Wave Bollards),
//    [Track D] (Session-Baked Collapsing Bridge & Road + Sand Plumes), [Track E] (3-Lane Subway) & [Track F] (Trams/Trains).
//    HOOKS=InversionArenaHooks.mjs node HeadlessHarness.mjs .. 1180 "?capture=1"

import assert from "node:assert/strict";
import { RotateVector } from "../Source/TransformProjection.js";

let Started = false;
let MinimumVehicleUpZ = 1.0;
let MinimumChaseUpZ = 1.0;
let MaximumAltitudeZ = 0.0;
let MinimumSubwayZ = 10.0;
let MinimumThreeLaneSubwayZ = 10.0;
let MaximumTrackAX = -150.0;
let InvertedWheelContacts = 0;
let LinearStripOpened = false;
let WaveStripOpened = false;
let BridgeCollapseTriggered = false;
let RoadCollapseTriggered = false;
let CollapseSandEmitted = false;
let StartTramLeadX = null;

export default
{
    BeforeFrame(Host, Frame)
    {
        if (!Started)
        {
            Started = true;
            Host.FixedStep = 1.0 / 60.0;
            Host.Training.Arm(Host.Training.QueryDrill("loop360"));
            Host.ScriptedInput = { Throttle: 1.0, Brake: 0.0, SteerAngle: 0.0, Handbrake: false, Reverse: false };
            if (Host.Trams && Host.Trams.Consists.length > 0)
                StartTramLeadX = Host.Trams.Consists[0].Cars[0].WorldPosition[0];
        }

        // Phase 2 (Frame 610): Jump to Track B Subterranean Subway Tunnel (-5.2 m below Z = 0)
        if (Frame === 610)
        {
            Host.TeleportVehicle({ Position: [-44.0, 84.0], Yaw: 0.0 }, true);
            Host.ScriptedInput = { Throttle: 1.0, Brake: 0.0, SteerAngle: 0.0, Handbrake: false, Reverse: false };
        }
        // Phase 3 (Frame 885): Jump to Track B Proximity Trigger #1 (Linear Retracting Bollard Strip)
        else if (Frame === 885)
        {
            Host.TeleportVehicle({ Position: [48.0, 166.0], Yaw: 180.0 }, true);
            Host.ScriptedInput = { Throttle: 1.0, Brake: 0.0, SteerAngle: 0.0, Handbrake: false, Reverse: false };
        }
        // Phase 4 (Frame 908): Jump to Track C Proximity Trigger #2 (84 m Counter-Phased Wave Bollard Strip)
        else if (Frame === 908)
        {
            Host.TeleportVehicle({ Position: [-88.0, -94.0], Yaw: 0.0 }, true);
            Host.ScriptedInput = { Throttle: 1.0, Brake: 0.0, SteerAngle: 0.0, Handbrake: false, Reverse: false };
        }
        // Phase 5a (Frame 930): Rebake unique session cracks on GPU & climb onto Track D Collapsing Sky-Bridge (+5.0 m)
        else if (Frame === 930)
        {
            Host.RebakeCollapseDecks(0x5E15A1C0);
            Host.TeleportVehicle({ Name: "Collapse Bridge", Position: [-62.0, -250.0], Yaw: 0.0 }, true);
            Host.ScriptedInput = { Throttle: 1.0, Brake: 0.0, SteerAngle: 0.0, Handbrake: false, Reverse: false };
        }
        // Phase 5b (Frame 1220): Trigger Track D Collapsing Sinkhole Road (0.0 m)
        else if (Frame === 1220)
        {
            Host.TeleportVehicle({ Name: "Collapse Road", Position: [53.0, -318.0], Yaw: 180.0 }, true);
            Host.ScriptedInput = { Throttle: 1.0, Brake: 0.0, SteerAngle: 0.0, Handbrake: false, Reverse: false };
        }
        // Phase 6 (Frame 1330): Jump to Track E 3-Lane Center-Portal Subway ([road][tunnel down][road])
        else if (Frame === 1330)
        {
            Host.TeleportVehicle({ Name: "3-Lane Subway", Position: [-72.0, 256.0], Yaw: 0.0 }, true);
            Host.ScriptedInput = { Throttle: 1.0, Brake: 0.0, SteerAngle: 0.0, Handbrake: false, Reverse: false };
        }
        // Phase 7 (Frame 1530): Jump to Track F Articulated Streetcar Tram & Express Rail Boulevard
        else if (Frame === 1530)
        {
            Host.TeleportVehicle({ Name: "Tramway", Position: [-92.0, 314.0], Yaw: 0.0 }, true);
            Host.ScriptedInput = { Throttle: 1.0, Brake: 0.0, SteerAngle: 0.0, Handbrake: false, Reverse: false };
        }

        const VehicleUp = RotateVector(Host.Vehicle.Orientation, [0.0, 0.0, 1.0]);
        MinimumVehicleUpZ = Math.min(MinimumVehicleUpZ, VehicleUp[2]);
        MinimumChaseUpZ = Math.min(MinimumChaseUpZ, Host.Chase.Up[2]);
        MaximumAltitudeZ = Math.max(MaximumAltitudeZ, Host.Vehicle.Position[2]);
        if (Frame >= 610 && Frame < 885)
            MinimumSubwayZ = Math.min(MinimumSubwayZ, Host.Vehicle.Position[2]);
        if (Frame >= 1330 && Frame < 1530)
            MinimumThreeLaneSubwayZ = Math.min(MinimumThreeLaneSubwayZ, Host.Vehicle.Position[2]);
        if (Frame < 610)
            MaximumTrackAX = Math.max(MaximumTrackAX, Host.Vehicle.Position[0]);
        if (VehicleUp[2] < -0.75)
        {
            const Contacts = Host.Vehicle.Wheels.filter((Wheel) => Wheel.Contact).length;
            InvertedWheelContacts = Math.max(InvertedWheelContacts, Contacts);
        }

        if (Host.Bollards)
        {
            const Linear = Host.Bollards.Zones.find((Z) => Z.Id === "linearStrip");
            const Wave   = Host.Bollards.Zones.find((Z) => Z.Id === "waveStrip");
            if (Linear?.Triggered) LinearStripOpened = true;
            if (Wave?.Triggered)   WaveStripOpened = true;
        }

        if (Host.Collapse)
        {
            if (Host.Collapse.Spans[0]?.State === "collapsing")
                BridgeCollapseTriggered = true;
            if (Host.Collapse.Spans[1]?.State === "collapsing")
                RoadCollapseTriggered = true;
            if (Host.Collapse.QuerySmokeEmissions().length > 0)
                CollapseSandEmitted = true;
        }

        if (Host.Camera)
        {
            assert.ok(Host.Camera.Position.every(Number.isFinite), "Camera position must stay finite");
            assert.ok(Host.Camera.Up.every(Number.isFinite), "Camera up vector must stay finite");
        }
    },

    Report(Host)
    {
        assert.equal(Host.LevelKey, "inversion");
        assert.equal(Host.LevelDescriptor.Tracks.length, 6);
        assert.ok(MinimumVehicleUpZ < -0.85, `Expected Track A upside-down loop inversion, got minUpZ=${MinimumVehicleUpZ.toFixed(3)}`);
        assert.ok(MaximumAltitudeZ > 15.5, `Expected Track A loop apex > 15.5 m, got maxZ=${MaximumAltitudeZ.toFixed(2)}`);
        assert.ok(InvertedWheelContacts >= 2, `Expected >= 2 loaded wheels upside-down, got ${InvertedWheelContacts}`);
        assert.ok(MinimumChaseUpZ < -0.35, `Expected 3D ChaseCamera to invert with vehicle, got minChaseUpZ=${MinimumChaseUpZ.toFixed(3)}`);
        assert.ok(MaximumTrackAX > 18.0, `Expected Track A circuit flow through 360° Loop onto Camelback Waves past X=18 m, got maxX=${MaximumTrackAX.toFixed(1)}`);
        assert.ok(Number.isFinite(Host.Training.Best.loop360?.Primary), "Expected 360° Helical Loop stunt drill completion time");
        assert.ok(MinimumSubwayZ < -4.2, `Expected Track B Subway Tunnel descent below Z=-4.2 m, got minZ=${MinimumSubwayZ.toFixed(2)}`);
        assert.ok(LinearStripOpened, "Expected Track B Linear Bollard Strip proximity trigger to activate");
        assert.ok(WaveStripOpened, "Expected Track C Travelling-Wave Bollard Strip proximity trigger to activate");
        assert.ok(BridgeCollapseTriggered, "Expected Track D Collapsing Sky-Bridge to trigger and fracture");
        assert.ok(RoadCollapseTriggered, "Expected Track D Collapsing Sinkhole Road to trigger and fracture");
        assert.ok(CollapseSandEmitted, "Expected Track D collapse to emit volumetric sand plumes");
        assert.ok(MinimumThreeLaneSubwayZ < -3.5, `Expected Track E 3-Lane Subway center descent < -3.5 m, got ${MinimumThreeLaneSubwayZ.toFixed(2)}`);
        assert.ok(Host.Trams && Host.Trams.QuerySummary().CarCount === 14, "Expected Track F 14 articulated tram & train cars");
        assert.notEqual(Host.Trams.Consists[0].Cars[0].WorldPosition[0], StartTramLeadX, "Expected Track F trams to advance along rails");
        console.log(`6-track inversion arena: Track A loop (${Host.Training.Best.loop360.Primary.toFixed(2)} s) · Track B/C bollards OPEN · Track D bridge+road collapse+sand ACTIVE · Track E 3-lane subway (${MinimumThreeLaneSubwayZ.toFixed(2)} m) · Track F 14 railcars ACTIVE`);
    }
};
