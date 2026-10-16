// Exercise the lights through the real frame: the beam steps (I), the fog (Shift+I), the roof flood (L), a spark burst, and the
// clustered set's statistics. HOOKS=LightingHooks.mjs node HeadlessHarness.mjs .. 30 '?capture=1'
import assert from 'node:assert/strict';
import { BeamStates } from '../Source/Lighting/VehicleLamps.js';
// A real LM-63 file (a street downlight with a cut-off), loaded through the Lights page's path.
const IesText = ['IESNA:LM-63-2002', '[TEST] street', 'TILT=NONE', '1 1000 1 5 4 1 2 0.1 0.1 0.1', '1 1 20',
                 '0 20 40 60 80', '0 90 180 270', '1000 900 600 200 0', '1000 900 600 200 0', '1000 900 600 200 0', '1000 900 600 200 0'].join('\n');
let Stage = 0, MaxLights = 0, SawLowLit = false;
export default {
    BeforeFrame(Host, Frame) {
        if (Frame === 0) {
            Host.Settings.Lamps.Technology = 'LED';
            Host.HandleLampAction('Beam');                 // off → low
            Host.HandleLampAction('Fog');                  // fog on
            Host.HandleLampAction('RoofFlood');            // roof flood on
            Host.Vehicle.Position = [...Host.Vehicle.Position];
            Host.Sparks.Emit([{ Point: [Host.Vehicle.Position[0] + 2, Host.Vehicle.Position[1], 0.3], Velocity: [5, 0, 2], Normal: [0, 0, 1], Strength: 1 }], 1 / 60);
        }
        if (Frame === 5) {
            Host.LoadIesProfile(IesText, 'street-cutoff.ies');   // the imported profile, used by the street lamps
        }
        if (Frame === 12) {
            Host.HandleLampAction('Beam');                 // low → high
            Stage = 2;
        }
        if (Frame === 18) {
            Host.HandleLampAction('Beam');                 // high → off
            Host.HandleLampAction('Beam');                 // off → low again
            Stage = 3;
        }
        MaxLights = Math.max(MaxLights, Host.LightStats ? Host.LightStats.Lights : 0);
        if (Host.Lights && Host.LightStats && Host.LightStats.Lights > 0) SawLowLit = true;
    },
    Report(Host) {
        // The Lights pages build and read their values through the editor's own controls.
        for (const Id of ['lamps', 'street']) {
            const Entity = Host.Shell.Entities.find((Candidate) => Candidate.Id === Id);
            assert.ok(Entity, `the ${Id} page is in the editor`);
            const Cards = document.createElement('div');
            Entity.Build(Host.Shell.Controls, Cards);
            assert.ok(String(Entity.Meta()).length > 0 && ['live', 'warm', ''].includes(Entity.State()));
        }
        assert.equal(BeamStates[Host.Settings.Lamps.Beam], 'Low');
        assert.equal(Host.Settings.Lamps.Fog, true);
        assert.equal(Host.Settings.Lamps.RoofFlood, true);
        assert.ok(SawLowLit && MaxLights >= 40, `the course's and the vehicle's lights are in the set (max ${MaxLights})`);
        assert.ok(Host.LightStats.Dropped === 0, `no light references dropped (${Host.LightStats.Dropped})`);
        assert.ok(Host.LightStats.Lights <= 128);
        assert.equal(Host.Settings.Lamps.Street.Profile, 'Imported');
        assert.equal(Host.ImportedIesName, 'street-cutoff.ies');
        console.log(`lights: ${MaxLights} in the set, ${Host.LightStats.CellsUsed} cells used, busiest ${Host.LightStats.BusiestCell}, dropped ${Host.LightStats.Dropped}; stage ${Stage}`);
    }
};
