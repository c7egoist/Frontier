import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConstructRayBottomLevel, ConstructRayTopLevel, RayTracingLayout } from '../Source/RayTracingGeometry.js';

const Facets = [
    { Family: 3, Corners: [[0,0,0],[1,0,0],[0,1,0]] },
    { Family: 7, Corners: [[1,0,0],[1,1,0],[0,1,0]] },
    { Family: 11, Corners: [[0,0,1],[1,0,1],[0,1,1]] },
    { Family: 13, Corners: [[1,0,1],[1,1,1],[0,1,1]] },
    { Family: 17, Corners: [[0,0,2],[1,0,2],[0,1,2]] }
];

test('triangle BLAS retains every authored material family alongside SAH-reordered facets', () => {
    const Blas = ConstructRayBottomLevel(Facets);
    assert.equal(Blas.TriangleCount, Facets.length);
    assert.equal(Blas.Triangles.byteLength, Facets.length * RayTracingLayout.TriangleStride);
    const Families = new Uint32Array(Blas.Triangles.buffer).filter((_, index) => index % 12 === 3);
    assert.deepEqual([...Families].sort((a,b) => a-b), Facets.map((facet) => facet.Family).sort((a,b) => a-b));
    assert.ok(Blas.NodeCount > 1);
});

test('TLAS has compact adjacent children and emits inactive-capable raster instances only', () => {
    const Scene = {
        FacetSets: [{ Facets }, { Facets: [] }],
        Occupants: Array.from({ length: 9 }, (_, index) => ({ FacetSet: index === 8 ? 1 : 0, Roles: 1, Inactive: false })),
        QueryWorldBounds(index) { return { Minimum: [index * 2, 0, 0], Maximum: [index * 2 + 1, 1, 1] }; }
    };
    const Tlas = ConstructRayTopLevel(Scene);
    assert.equal(Tlas.Instances.length, 8);
    assert.ok(Tlas.Nodes.length > 1);
    for (const Node of Tlas.Nodes) {
        if (!Node.Count) {
            assert.ok(Node.Left >= 0);
            assert.ok(Node.Left + 1 < Tlas.Nodes.length);
        }
    }
    assert.deepEqual(Tlas.Instances.map((instance) => instance.Occupant).sort((a,b)=>a-b), [0,1,2,3,4,5,6,7]);
});

test('a dynamically generated fracture piece is a distinct RT instance even though rastering uses a composite anchor', () => {
    const Scene = {
        FacetSets: [{ Facets }, { Facets: [] }],
        Occupants: [
            { FacetSet: 0, Roles: 1, Inactive: false },
            { FacetSet: 1, Roles: 8, Fragment: true, Inactive: true }
        ],
        QueryWorldBounds(index) { return { Minimum: [index, 0, 0], Maximum: [index + 0.5, 1, 1] }; }
    };
    const Slots = new Map([[1, { BlasRoot: 42, FirstTriangle: 64, TriangleCapacity: 48 }]]);
    const Tlas = ConstructRayTopLevel(Scene, Slots);
    assert.equal(Tlas.Instances.length, 2);
    assert.ok(Tlas.Instances.some((instance) => instance.Occupant === 1 && instance.DynamicFragment));
});

test('ray scene GPU records retain 16-byte alignment', () => {
    for (const Size of Object.values(RayTracingLayout))
        assert.equal(Size % 16, 0);
});
