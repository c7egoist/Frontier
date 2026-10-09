// 📦 Seeded pseudo-random streams — every generator, mask and erosion pass draws from one reproducible seed.

/// in    Seed     [-]  any integer; the same seed always yields the same stream
/// out   Next     [-]  function returning a uniform sample in [0, 1)
/// tag   deterministic
export function CreateStream(Seed) {
    let State = (Seed >>> 0) || 0x9e3779b9;
    return function Next() {
        State = (State + 0x6d2b79f5) >>> 0;
        let T = State;
        T = Math.imul(T ^ (T >>> 15), T | 1);
        T ^= T + Math.imul(T ^ (T >>> 7), T | 61);
        return ((T ^ (T >>> 14)) >>> 0) / 4294967296;
    };
}

/// in    Seed     [-]  integer lattice seed
/// in    IX, IY   [-]  integer lattice coordinates
/// in    Lane     [-]  independent channel selector
/// out   Hash     [-]  uniform value in [0, 1)
export function LatticeHash(Seed, IX, IY, Lane) {
    let H = Math.imul(IX | 0, 374761393) + Math.imul(IY | 0, 668265263) + Math.imul(Seed | 0, 1442695041) + Math.imul(Lane | 0, 2246822519);
    H = Math.imul(H ^ (H >>> 13), 1274126177);
    H ^= H >>> 16;
    return (H >>> 0) / 4294967296;
}
