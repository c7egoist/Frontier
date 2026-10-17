// Exercises the triangle path tracer after the scene changes: a real fracture uploads per-piece BLAS triangles and
// activates individual TLAS instances before the next ReSTIR / direct-shadow dispatch.
import assert from 'node:assert/strict';
let Broken = false;
export default {
    BeforeFrame(Host, Frame) {
        if (Frame !== 0 || Broken) return;
        const Prop = Host.Fracture.Props.find((Item) => Item.State === 'intact');
        assert.ok(Prop, 'an intact breakable prop must exist');
        Host.Fracture.BreakProp(Prop, {
            Point: Prop.Definition.Centre.slice(), Normal: [1, 0, 0], Velocity: [24, 0, 0], Approach: 24,
            Energy: Math.max(100000, Prop.Recipe.Threshold * 4), Vehicle: Host.Vehicle
        });
        Broken = true;
    },
    Report(Host) {
        assert.ok(Broken);
        const Dynamic = Host.RayTracing.Tlas.Instances.filter((Instance) => Instance.DynamicFragment);
        assert.ok(Dynamic.length > 0, 'fragment occupants must be preallocated in the RT TLAS');
        assert.ok(Host.Fracture.Props.some((Prop) => Prop.State === 'broken'));
        console.log(`ray tracing fracture integration: ${Dynamic.length} preallocated fragment instances`);
    }
};
