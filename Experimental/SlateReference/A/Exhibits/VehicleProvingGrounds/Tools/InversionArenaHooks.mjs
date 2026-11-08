//============================================================================================================================================
//                                                          INVERSIONARENAHOOKS.MJS
//============================================================================================================================================
// 🧩 Dawn WebGPU + Jolt WASM + IlluminationHost multi-track validation across [Track A] (360° Loop + Waves),
//    [Track B] (-5.2 m Subterranean Subway Tunnel + Proximity Linear Bollards) & [Track C] (84 m Travelling-Wave Bollards).
//    HOOKS=InversionArenaHooks.mjs node HeadlessHarness.mjs .. 660 "?capture=1"

import assert from "node:assert/strict";
import { RotateVector } from "../Source/TransformProjection.js";

let Started = false;
let MinimumVehicleUpZ = 1.0;
let MinimumChaseUpZ = 1.0;
let MaximumAltitudeZ = 0.0;
let MinimumSubwayZ = 10.0;
let MaximumTrackAX = -150.0;
let InvertedWheelContacts = 0;
let LinearStripOpened = false;
let WaveStripOpened = false;

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

        const VehicleUp = RotateVector(Host.Vehicle.Orientation, [0.0, 0.0, 1.0]);
        MinimumVehicleUpZ = Math.min(MinimumVehicleUpZ, VehicleUp[2]);
        MinimumChaseUpZ = Math.min(MinimumChaseUpZ, Host.Chase.Up[2]);
        MaximumAltitudeZ = Math.max(MaximumAltitudeZ, Host.Vehicle.Position[2]);
        MinimumSubwayZ = Math.min(MinimumSubwayZ, Host.Vehicle.Position[2]);
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

        if (Host.Camera)
        {
            assert.ok(Host.Camera.Position.every(Number.isFinite), "Camera position must stay finite");
            assert.ok(Host.Camera.Up.every(Number.isFinite), "Camera up vector must stay finite");
        }
    },

    Report(Host)
    {
        assert.equal(Host.LevelKey, "inversion");
        assert.equal(Host.LevelDescriptor.Tracks.length, 3);
        assert.ok(MinimumVehicleUpZ < -0.85, `Expected Track A upside-down loop inversion, got minUpZ=${MinimumVehicleUpZ.toFixed(3)}`);
        assert.ok(MaximumAltitudeZ > 15.5, `Expected Track A loop apex > 15.5 m, got maxZ=${MaximumAltitudeZ.toFixed(2)}`);
        assert.ok(InvertedWheelContacts >= 2, `Expected >= 2 loaded wheels upside-down, got ${InvertedWheelContacts}`);
        assert.ok(MinimumChaseUpZ < -0.35, `Expected 3D ChaseCamera to invert with vehicle, got minChaseUpZ=${MinimumChaseUpZ.toFixed(3)}`);
        assert.ok(MaximumTrackAX > 18.0, `Expected Track A circuit flow through 360° Loop onto Camelback Waves past X=18 m, got maxX=${MaximumTrackAX.toFixed(1)}`);
        assert.ok(Number.isFinite(Host.Training.Best.loop360?.Primary), "Expected 360° Helical Loop stunt drill completion time");
        assert.ok(MinimumSubwayZ < -4.2, `Expected Track B Subway Tunnel descent below Z=-4.2 m, got minZ=${MinimumSubwayZ.toFixed(2)}`);
        assert.ok(LinearStripOpened, "Expected Track B Linear Bollard Strip proximity trigger to activate");
        assert.ok(WaveStripOpened, "Expected Track C Travelling-Wave Bollard Strip proximity trigger to activate");
        console.log(`multi-track inversion arena: Track A loop (${Host.Training.Best.loop360.Primary.toFixed(2)} s, apex ${MaximumAltitudeZ.toFixed(1)} m) · Track B subway (${MinimumSubwayZ.toFixed(2)} m, linear bollards OPEN) · Track C wave bollards OPEN`);
    }
};
