# Interchange and bridge reference audit

The earlier layouts were connected, but connectivity and a clean mesh were not sufficient checks of their proportions. This pass compares the published parking-release geometry (`15754e366918ebc83e196619d256cfc836f97c85`) with published interchange schematics and the corrected, **measured** geometry.

The result is reference-scaled, editable **game-asset geometry**, not a civil-engineering approval. The numeric choices below are explicit; they are not represented as universal standards across countries.

## Published references actually consulted

- **FHWA interchange design prompt-list:** conventional diamond terminal spacing is 800–1,200 ft (243.84–365.76 m); compressed diamonds have closer spacing. It also distinguishes mainline, ramp, loop, grade, curvature, spacing and sight-distance checks. [2](https://highways.dot.gov/field-offices/missouri/interchange-design-promptlist)
- **MoDOT diamond alignment-control drawings:** actual entrance/exit terminal drawings, including 300 ft (91.44 m) and 250 ft (76.2 m) tapers and adjacent full-width tangents. The generator selects a 90 m taper, 150 m exit run and 200 m entrance run rather than copying an undimensioned thumbnail. [1](https://epg.modot.org/files/2/2a/234.2_Figure_1_Diamond_Interchange_Alignment_Controls.pdf)
- **Caltrans Highway Design Manual, Chapter 500:** Figures 502.2/502.3 distinguish service diamonds, cloverleafs with collector-distributor roads and freeway terminal layouts; Index 504.3 and Table 504.3 address ramp curvature, truck widening and widths. Curvature/speed and widening are not interchangeable with merely scaling the full interchange. [3](https://dot.ca.gov/-/media/dot-media/programs/design/documents/chp0500-092923-a11y.pdf)
- **MassDOT interchange guide:** Figures 7-2 and 7-4 show diamond and cloverleaf arrangements; Tables 7-11/7-12 distinguish curve-radius and grade controls. The guidance prefers approximately perpendicular ramp/local-street junctions and uses C-D roads to move cloverleaf weaving away from freeway through traffic. [10](https://www.mass.gov/info-details/pddg-chapter-7-interchanges)
- **FHWA Steel Bridge Design Handbook:** girder arrangement, spacing, overhang and span arrangement must be considered together, rather than placing two widely separated beams under every deck width. [1](https://rosap.ntl.bts.gov/view/dot/49745/dot_49745_DS1.pdf)
- **Iowa DOT steel-girder practice:** its typical examples use four/five girders with span-dependent spacing and depth, reinforcing why girder count must respond to deck width. These are preliminary proportioning references, not a structural calculation for the exported meshes. [4](https://iowadot.gov/bridge/policy/05-05-00CwpgLRFD.pdf)

The MoDOT webpage's link captioned “Geometric Layout” currently resolves to an access-control drawing. The audit does **not** treat that file as a dimensioned overpass plan; it uses the actual alignment-control sheet and the FHWA configuration guidance above.

## What was wrong, and what changed

| Item                                | Previous measured layout                                           | Corrected measured layout                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Diamond ramp-terminal spacing       | 220 m — within the _compressed_ family, not a conventional diamond | **260 m**, explicitly a conventional diamond                                                                                         |
| Diamond/freeway bridge structure    | 3,143.76 m of road/ramp alignment marked as bridge structure       | **Two 48 m overpasses / 96 m total**; ramps and raised approaches have closed fill                                                   |
| Diamond local-street ramp tangents  | Oblique ramp/street meetings                                       | **90° terminal tangents**, 24 m junction corner controls and signalized terminals                                                    |
| Diamond max alignment grade         | 6.154%                                                             | **3.086%**                                                                                                                           |
| Cloverleaf tightest loop connection | **17.826 m**, although the loop was labeled 40 km/h                | **112.064 m minimum**, including the entry/exit curve; **120 m nominal** loop geometry / 50 km/h selected loop setting               |
| Cloverleaf through-road weaving     | Loops connected directly to freeway carriageways                   | **Separate C-D roads**, two-lane central collector sections and four genuine loop movements                                          |
| Cloverleaf weaving distance         | No explicit measured C-D section                                   | **304 m between C-D graph ports; 410.59–410.61 m planwise between the actual generated gore noses**                                  |
| Cloverleaf bridge structure         | 8,004.34 m of bridge-marked alignment                              | **Four 96 m overpasses / 384 m total**, with fill elsewhere                                                                          |
| Cloverleaf max alignment grade      | 6.000%                                                             | **3.158%**                                                                                                                           |
| T interchange shape                 | Twin-loop T, not a standard single-loop trumpet                    | **One 270° loop, two direct right-turn links, one outer semi-direct movement**, all six required arm-to-arm movements connected      |
| T interchange bridge structure      | 4,102.17 m of bridge-marked alignment                              | **Two 84 m stem decks / 168 m total**                                                                                                |
| T interchange max alignment grade   | 6.000%                                                             | **3.017%**                                                                                                                           |
| Speed-change space                  | No authored full-width acceleration/deceleration zones             | **Real one-sided extra lanes:** 150 m exit run or 200 m entry run plus a 90 m pavement taper                                         |
| Mainline starting section           | 3.5 m lanes / 1 m symmetric shoulders                              | **3.65 m lanes / 2 m symmetric shoulders**, selected asset defaults                                                                  |
| Bridge beam layout                  | Two beams irrespective of deck width                               | **Width-derived 3–5 girder layouts** in these templates; about **2.33–2.77 m** spacing, with matching bearings and deeper headstocks |

The old 220 m diamond is not claimed to be intrinsically illegal. The problem was the undisclosed design family, missing dimension controls, unnecessarily long viaducts, ramp/street orientation and inadequate geometric checks.

### Vertical measurements

The template alignment datum is **7.2 m** above the flat ground reference; the crowned driving surface is slightly above that datum. The nominal structural depth below the datum is **1.6 m**. Clearance is measured to the structural underside, consuming that depth and the lower pavement crown:

- Diamond/connected city overpass: **5.431 m minimum**.
- C-D cloverleaf and trumpet: **5.475 m minimum**.
- Selected over-road geometric clearance target: **5.2 m**.

Slab, girder, bearing, abutment, pier-cap and footing meshes are infrastructure, not buildings. Approach fill has a **2 horizontal : 1 vertical** selected side slope and no vegetation. Connected bridge members retain clear bearing seams; abutments appear only at real structure-to-fill transitions, below the driving surface.

## Dimensioned schematics from the actual generator

These are **original drawings generated from the road mesh edges and fitted junction boundaries**. They are not copied manual pages or AI illustrations:

- [Conventional diamond — 260 m terminals / 48 m decks](./reference-layouts/diamond.svg)
- [Cloverleaf — C-D roads / 120 m loops / measured nose spacing](./reference-layouts/cloverleaf.svg)
- [Single-loop trumpet — 84 m stem decks / one loop](./reference-layouts/trumpet.svg)
- [Machine-readable measurements and source URLs](./reference-layouts/measurements.json)

The plan drawings include scale bars. The `extentIncludingApproachTails` values describe the entire editable tile, **not** only the central interchange footprint. For example, the cloverleaf's 3.2 × 3.2 km extent includes long acceleration/approach tails; its nominal four-loop envelope is approximately 544 × 544 m before the outer connections and road widths.

Regenerate and assert the measurements:

```sh
npm run audit:design
```

## Editor and export controls

- **Geometry → Reference dimensions:** actual cubic minimum radius, maximum alignment grade, structural path length, girder layout, selected targets and links to the published references. C-D selections also show measured nose-to-nose weave spacing.
- **Speed-change lane:** entrance/exit mode, full-width run and taper lengths. It adds width only on the correct traffic-side edge, leaving through lanes and their shoulder width intact. Left/right driving mirrors the geometry. Unsupported cycle/parking/two-way profiles do not receive an extra highway lane.
- **Details → Bridge structure:** structure start/end percentages bound the structural interval independently of the road alignment. Earth-support can be toggled. Existing shared endpoints are not moved by these controls.
- **Insert connected bridge:** a nominal **64 m** level deck with two filled approaches. It requires at least **600 m**, and more for a larger requested rise, keeping the modeled alignment near a 4% grade rather than accepting the old 8% limit. Exact XZ cubic splitting and atomic refusal/history remain intact.
- JSON stores the new role, structural bounds, auxiliary-lane and fill settings. GLB root extras, OBJ `mesh.json`, `getNetwork()` and `frontier:change` retain measured design references, weaving, auxiliary-lane, girder/support/span and fill metadata.
- Highway shoulder/merge profiles are flush, **not raised urban sidewalk curbs**. The European parking streets, their footways and 180 roadside bays are unchanged.

Load the updated **Networks** templates to use the corrected graph. Imported/saved layouts are not silently overwritten or retroactively scaled.

## Remaining limits

These checks verify asset dimensions, alignment curvature/grade, directionally connected topology, actual structural intervals, geometric clearances and exported metadata. They **do not** establish traffic capacity, signal timing, queue storage, weaving safety under traffic demand, stopping/decision sight distance, superelevation compliance, swept paths, structural strength, foundations, earthwork quantities or jurisdiction-specific approval. The shoulder arrangement is a clearly stated symmetric asset starting section, not a claim that every authority specifies symmetric shoulders.

The expanded reference layouts still fit the 5 × 5 km / 35 km total-control-polygon tile envelope. Production has a **32 km** dense-generation control-polygon preflight; the complete C-D cloverleaf is covered by production regression checks. Larger worlds remain tiled rather than silently simplified.

## Verification

**323 CPU checks and 92 real-browser checks pass**, with no browser runtime errors. Coverage includes the actual cubic radii/grades, metric template dimensions, full production cloverleaf, six trumpet movements, one-sided/handed speed-change geometry, bounded bridge/approach support, beam/bearing/abutment metadata, underside-camera clearance, history/preset preservation, GLB/OBJ/JSON and fully offline standalone use. The existing European quarter retains its 180 roadside bays. Strict TypeScript, production build, formatting and dependency audit also pass.
