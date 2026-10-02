/* 12 tread designs in the grammar. Every one is authored centre → out on the right half; the left half comes from
 * mirroring (or an explicit override). Nothing here is a heightfield: each feature is a traced outline with a
 * level, so the mesh is built from the trace.                                                   */
export const DESIGNS = [
  {
    id: 'wetV', label: 'Wet V', tag: 'summer / directional',
    desc: 'Four chevron ribs with siped shoulders and hooked block trailing edges. Water goes rearward through the ' +
          'tapered main grooves; the hooks bite on lane change.',
    shear: 'v', mir: 'mirror', shift: 0.5, wrap: 0.25,
    lanes: [
      { w: 0.16, kind: 'rib', base: 'top', sipes: { n: 3, w: 0.02, at: [0.1, 0.9] } },
      { w: 0.11, kind: 'groove', edge: { a: 0.012, cyc: 2 } },
      { w: 0.31, kind: 'rib', chev: 1, blocks: { n: 4, w: 0.30, at: [0.05, 0.95], taper: 0.10, level: 'floor',
          keys: [[0, 0.06, 0.36], [0.35, 0.03, 0.33], [0.62, 0.10, 0.30], [1, 0.04, 0.28]], samples: 3 },
        sipes: { n: 2, w: 0.024, at: [0.15, 0.85] } },
      { w: 0.10, kind: 'groove' },
      { w: 0.32, kind: 'rib', chev: 1, blocks: { n: 3, w: 0.42, at: [0.08, 0.92], taper: -0.12, level: 'floor',
          keys: [[0, 0.05, 0.47], [0.45, 0.12, 0.44], [1, 0.02, 0.40]] },
        sipes: { n: 4, w: 0.018, at: [0.2, 0.8], zig: { a: 0.012, cyc: 2 } } },
    ],
  },
  {
    id: 'asymUHP', label: 'Asym UHP', tag: 'ultra high performance',
    desc: 'Outboard: three stiff arrows for cornering. Inboard: wide continuous grooves for aquaplaning. Modelled as ' +
          'two stacks, not mirrored, so each side keeps its own function.',
    shear: 'v', mir: 'copy', wrap: 0.18, wrapL: 0.3,
    lanes: [
      { w: 0.34, kind: 'rib', chev: 0.55, blocks: { n: 3, w: 0.5, at: [0.04, 0.96], taper: 0.06, level: 'floor',
          keys: [[0, 0.04, 0.5], [0.5, 0.1, 0.46], [1, 0.02, 0.44]] }, sipes: { n: 2, w: 0.02, at: [0.3, 0.7] } },
      { w: 0.09, kind: 'groove' },
      { w: 0.30, kind: 'rib', chev: 0.55, blocks: { n: 3, w: 0.46, level: 'relief', at: [0.1, 0.9] },
        cuts: [{ level: 'floor', at: [0.15, 0.85], u0: 0.30, du0: 0.06, u1: 0.40, du1: 0.02, samples: 2 }] },
      { w: 0.08, kind: 'groove' },
      { w: 0.19, kind: 'rib', base: 'top', sipes: { n: 5, w: 0.016, at: [0.05, 0.95] } },
    ],
    lanesL: [
      { w: 0.20, kind: 'rib', chev: 0.2, sipes: { n: 6, w: 0.02, at: [0.02, 0.98] } },
      { w: 0.13, kind: 'groove' },
      { w: 0.26, kind: 'rib', chev: 0.35, blocks: { n: 4, w: 0.3, at: [0.03, 0.97], level: 'floor', taper: 0.14 },
        sipes: { n: 3, w: 0.022, at: [0.1, 0.9], zig: { a: 0.02, cyc: 3 } } },
      { w: 0.13, kind: 'groove' },
      { w: 0.28, kind: 'rib', chev: 0.2, blocks: { n: 4, w: 0.26, at: [0.05, 0.95], level: 'sipe' } },
    ],
  },
  {
    id: 'herringbone', label: 'Herringbone', tag: 'mirror across the centre rib',
    desc: 'One chevron arm authored from the centreline out, then reflected about the centre rib — the two halves ' +
          'meet point for point because they share the same column set.',
    shear: 'z', mir: 'mirror', shift: 0.5,
    lanes: [
      { w: 0.10, kind: 'rib', base: 'top' },
      { w: 0.90, kind: 'rib', chev: 1, blocks: { n: 2, w: 0.34, at: [0.02, 0.98], level: 'floor', taper: 0.22,
          keys: [[0, 0.02, 0.36], [0.4, 0.16, 0.30], [0.75, 0.06, 0.34], [1, 0.20, 0.24]] },
        sipes: { n: 3, w: 0.02, at: [0.2, 0.8] } },
    ],
  },
  {
    id: 'allTerrain', label: 'All-Terrain 50/50', tag: 'block ratio void',
    desc: 'Half void, half rubber: stacked lugs with kerf notches on the shoulders, tie bars at the floor so the ' +
          'blocks brace each other, and a wear scribe across the centre rib.',
    shear: 'v', mir: 'point', shift: 0.5, wrap: 0.4, wrapL: 0.4,
    lanes: [
      { w: 0.12, kind: 'rib', base: 'top', sipes: { n: 2, w: 0.03, at: [0.2, 0.8] },
        cuts: [{ level: 'kerf', at: [0.45, 0.55], u0: 0.1, u1: 0.9, samples: 1 }] },
      { w: 0.16, kind: 'groove' },
      { w: 0.42, kind: 'rib', chev: 0.35, blocks: { n: 2, w: 0.58, at: [0.0, 1.0], level: 'floor', taper: 0.1,
          keys: [[0, 0.0, 0.62], [0.3, 0.06, 0.5], [0.7, 0.02, 0.56], [1, 0.1, 0.44]] },
        tie: { n: 2, w: 0.07, at: [0.25, 0.75] },
        sipes: { n: 4, w: 0.026, at: [0.1, 0.9], zig: { a: 0.014, cyc: 2 } } },
      { w: 0.16, kind: 'groove' },
      { w: 0.14, kind: 'rib', chev: 0.2, blocks: { n: 3, w: 0.4, at: [0.05, 0.95], level: 'floor' } },
    ],
  },
  {
    id: 'winterSipe', label: 'Winter Sipe Field', tag: 'sipe density',
    desc: 'Three rows of 3-D blocks, every block carrying five zig-zag sipes at two depths, so the biting edges keep ' +
          'multiplying across the whole tread face.',
    shear: 'z', mir: 'mirror', shift: 0.5,
    lanes: [
      { w: 0.20, kind: 'rib', chev: 0, sipes: { n: 7, w: 0.014, at: [0.02, 0.98], zig: { a: 0.03, cyc: 4 } } },
      { w: 0.08, kind: 'groove' },
      { w: 0.44, kind: 'rib', chev: 0.6, blocks: { n: 3, w: 0.30, at: [0.04, 0.96], level: 'relief', taper: 0.08 },
        sipes: { n: 3, w: 0.022, at: [0.06, 0.94], zig: { a: 0.01, cyc: 2 } } },
      { w: 0.08, kind: 'groove' },
      { w: 0.20, kind: 'rib', chev: 0, sipes: { n: 7, w: 0.014, at: [0.02, 0.98], zig: { a: 0.03, cyc: 4 } } },
    ],
  },
  {
    id: 'rally', label: 'Rally Gravel', tag: 'notched chevrons',
    desc: 'Chevron arms with a notch cut into the trailing edge (a stone ejector) over a relief ledge, so the arm ' +
          'itself is two levels deep and the notch is traced, not chopped.',
    shear: 'v', mir: 'mirror', shift: 0.5, wrap: 0.3,
    lanes: [
      { w: 0.14, kind: 'rib', base: 'top' },
      { w: 0.10, kind: 'groove' },
      { w: 0.46, kind: 'rib', chev: 1, blocks: { n: 3, w: 0.36, at: [0.03, 0.97], level: 'floor', taper: 0.12,
          keys: [[0, 0.05, 0.4], [0.3, 0.0, 0.34], [0.5, 0.22, 0.34], [0.52, 0.0, 0.34], [1, 0.1, 0.3]] },
        cuts: [{ level: 'relief', at: [0.1, 0.9], u0: 0.44, du0: 0.1, u1: 0.52, du1: 0.06, samples: 2 }] },
      { w: 0.10, kind: 'groove' },
      { w: 0.20, kind: 'rib', chev: 1, blocks: { n: 3, w: 0.3, at: [0.05, 0.95], level: 'relief' } },
    ],
  },
  {
    id: 'mudClaw', label: 'Mud Claw', tag: 'hooked lugs',
    desc: 'Full-width claws: each lug is one edge zig-zagged into a hook and the other straight, with a scooped ' +
          'undercut at the trailing face for self-cleaning in mud.',
    shear: 'z', mir: 'point', shift: 0.5, wrap: 0.5, wrapL: 0.5,
    lanes: [
      { w: 0.30, kind: 'rib', chev: 0.15, blocks: { n: 2, w: 0.62, at: [-0.1, 1.1], level: 'floor',
          zig: { a: 0.11, cyc: 3, tri: 0 }, zigR: { a: 0.07, cyc: 2 }, samples: 4 },
        cuts: [{ level: 'relief', at: [0.55, 1], u0: 0.06, u1: 0.3, samples: 1 }] },
      { w: 0.14, kind: 'groove' },
      { w: 0.28, kind: 'rib', chev: 0.15, blocks: { n: 2, w: 0.55, at: [-0.1, 1.1], level: 'floor',
          zig: { a: 0.09, cyc: 2 } } },
      { w: 0.14, kind: 'groove' },
      { w: 0.14, kind: 'rib', base: 'top', sipes: { n: 3, w: 0.03, at: [0.1, 0.9] } },
    ],
  },
  {
    id: 'semiSlick', label: 'Track Semi-Slick', tag: 'dry grip',
    desc: 'A land as wide as the rules allow, two thin extraction grooves, and arrows that only appear on the ' +
          'shoulder wrap — the kerf scribe wears flat and reads as a tread-wear bar.',
    shear: 'v', mir: 'mirror', shift: 0.5, wrap: 0.6,
    lanes: [
      { w: 0.42, kind: 'rib', base: 'top', cuts: [{ level: 'kerf', at: [0.3, 0.7], u0: 0.46, u1: 0.54, samples: 1 }] },
      { w: 0.05, kind: 'groove' },
      { w: 0.20, kind: 'rib', base: 'top', sipes: { n: 4, w: 0.016, at: [0.05, 0.95] } },
      { w: 0.05, kind: 'groove' },
      { w: 0.28, kind: 'rib', chev: 0.9, blocks: { n: 2, w: 0.5, at: [0.1, 0.9], level: 'relief', taper: 0.2 } },
    ],
  },
  {
    id: 'touring', label: 'Touring Quiet', tag: 'variable pitch ready',
    desc: 'Five ribs with four pitch lengths and shallow sipes only on the centre ribs — built for the pitch sequence ' +
          'to be stretched per tile, which changes the angles and never the topology.',
    shear: 'v', mir: 'mirror', shift: 0.5,
    pitchSeq: [1, 0.82, 1.14, 0.9, 1.05, 0.78],
    lanes: [
      { w: 0.14, kind: 'rib', base: 'top', sipes: { n: 4, w: 0.018, at: [0.04, 0.96] } },
      { w: 0.06, kind: 'groove' },
      { w: 0.22, kind: 'rib', chev: 0.3, blocks: { n: 3, w: 0.3, at: [0.06, 0.94], level: 'sipe', taper: 0.08 },
        sipes: { n: 3, w: 0.02, at: [0.15, 0.85] } },
      { w: 0.06, kind: 'groove' },
      { w: 0.24, kind: 'rib', chev: 0.45, blocks: { n: 3, w: 0.32, at: [0.06, 0.94], level: 'floor', taper: 0.1 },
        sipes: { n: 2, w: 0.022, at: [0.2, 0.8] } },
      { w: 0.06, kind: 'groove' },
      { w: 0.16, kind: 'rib', chev: 0.2, blocks: { n: 4, w: 0.22, at: [0.02, 0.98], level: 'sipe' } },
    ],
  },
  {
    id: 'offRoad', label: 'Off-Road Open', tag: 'mud / rock',
    desc: 'Shoulder lugs wrap the block onto the sidewall (wrap 0.75 of the shoulder length) so the edge bites; the ' +
          'voids are merged at the floor so mud has one channel to leave through.',
    shear: 'z', mir: 'point', shift: 0.5, wrap: 0.75, wrapL: 0.75,
    lanes: [
      { w: 0.30, kind: 'rib', chev: 0.2, blocks: { n: 2, w: 0.7, at: [-0.15, 1.15], level: 'floor',
          keys: [[0, 0.0, 0.75], [0.35, 0.12, 0.62], [0.65, 0.02, 0.7], [1, 0.16, 0.58]] },
        tie: { n: 1, w: 0.09, at: [0.45, 0.55] } },
      { w: 0.22, kind: 'groove' },
      { w: 0.26, kind: 'rib', chev: 0.35, blocks: { n: 2, w: 0.6, at: [-0.1, 1.1], level: 'floor', taper: 0.16 } },
      { w: 0.22, kind: 'groove' },
    ],
  },
  {
    id: 'sandPaddle', label: 'Sand Paddle', tag: 'point-symmetric',
    desc: 'One paddle authored, then carried across the centreline by a point reflection, so the flotation face is ' +
          'continuous while the voids still stagger by half a pitch.',
    shear: 'none', mir: 'point', shift: 0.5,
    lanes: [
      { w: 0.44, kind: 'rib', chev: 0.1, blocks: { n: 3, w: 0.5, at: [0.0, 1.0], level: 'floor', taper: 0.0,
          keys: [[0, 0.02, 0.46], [0.5, 0.14, 0.34], [1, 0.0, 0.46]] } },
      { w: 0.12, kind: 'groove' },
      { w: 0.44, kind: 'rib', chev: 0.1, sipes: { n: 6, w: 0.02, at: [0.02, 0.98] } },
    ],
  },
  {
    id: 'studded', label: 'Studded Ice', tag: 'winter / studs',
    desc: 'Pits moulded into the blocks for 12 mm studs (a fifth level, shallower than the sipe field), plus dense ' +
          'siping across a soft compound rib pattern.',
    shear: 'v', mir: 'mirror', shift: 0.5,
    lanes: [
      { w: 0.18, kind: 'rib', base: 'top', sipes: { n: 8, w: 0.014, at: [0.02, 0.98], zig: { a: 0.02, cyc: 3 } } },
      { w: 0.07, kind: 'groove' },
      { w: 0.36, kind: 'rib', chev: 0.4, blocks: { n: 4, w: 0.24, at: [0.03, 0.97], level: 'floor' },
        cuts: [
          { level: 'pit', at: [0.25, 0.75], u0: 0.30, du0: 0.04, u1: 0.40, du1: 0.04, samples: 2,
            keys: null },
          { level: 'pit', at: [0.25, 0.75], u0: 0.62, du0: 0.04, u1: 0.72, du1: 0.04, samples: 2 },
        ],
        sipes: { n: 4, w: 0.018, at: [0.1, 0.9] } },
      { w: 0.07, kind: 'groove' },
      { w: 0.25, kind: 'rib', chev: 0.75, blocks: { n: 4, w: 0.26, at: [0.05, 0.95], level: 'floor', taper: 0.1 },
        cuts: [{ level: 'pit', at: [0.3, 0.7], u0: 0.36, u1: 0.52, samples: 2 }],
        sipes: { n: 3, w: 0.02, at: [0.15, 0.85] } },
    ],
  },
];
