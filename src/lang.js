/* ════════════════════════════════════════════════════════════════════════════════════════════
   PLAIN ENGLISH COMMANDS
   The console under the viewport does not want a syntax. You type what you would say out loud —
   "rotate the cube 40 degrees on z", "add a sphere at x 3 y 2 z -1", "enable physics on the
   selected objects" — and this module works out which entities you meant and what to do to them.

   Parsing is deliberately forgiving: word order barely matters, units are optional, names are
   matched fuzzily ("cube001" finds Anchor Cube), and every parse reports back in English what it
   is about to do so nothing happens by surprise.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { flat, byId, typeOf, isFolder, TYPES, CATEGORIES } from './world.js';

/* ── text helpers ──────────────────────────────────────────────────────────────────────────── */
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const squash = s => s.replace(/\s+/g, ' ').trim();
const NUM = '(-?\\d+(?:\\.\\d+)?)';
const FILLER = /\b(?:please|the|a|an|of|for|with|its|it's|entity|entities|object|objects|thing|things)\b/gi;
const clean = s => squash(String(s).replace(FILLER, ' ').replace(/[,.;]+\s*$/, '').replace(/\s+/g, ' '));

function subsequence(a, b) {           /* every letter of a appears in b, in order */
  let i = 0;
  for (const c of b) if (c === a[i]) i++;
  return i === a.length;
}

/* how well does a typed fragment name this node — 0 means "not this one" */
function scoreNode(q, node) {
  const a = norm(q); if (!a) return 0;
  const b = norm(node.name);
  const t = norm(typeOf(node).label);
  if (a === b) return 100;
  if (b.startsWith(a + ' ')) return 88;
  if (b.startsWith(a)) return 84;
  if (b.endsWith(' ' + a)) return 80;                       /* "sphere" → Chrome Sphere, not Atmosphere */
  if (b.includes(' ' + a + ' ')) return 74;
  if (b.includes(a)) return 62;
  if (a === t) return 52;                                   /* "cube" → the one cube */
  const at = a.split(' '), bt = b.split(' ').concat(t.split(' '));
  const hits = at.filter(x => bt.some(y => y.startsWith(x) || x.startsWith(y))).length;
  if (hits === at.length) return 58;
  if (hits) return 26 + hits * 6;
  const bare = a.replace(/[0-9]+$/, '');                    /* Cube001 → cube */
  if (bare && bare !== a && (b.includes(bare) || t === bare)) return 64;
  if (subsequence(a.replace(/ /g, ''), (b + t).replace(/ /g, ''))) return 16;
  return 0;
}

/* ── vocabulary ────────────────────────────────────────────────────────────────────────────── */
const TYPE_WORDS = {
  cube: ['cube', 'box', 'block'], sphere: ['sphere', 'ball', 'orb'], torus: ['torus', 'donut', 'ring'],
  cylinder: ['cylinder', 'tube', 'pillar', 'post'], plane: ['plane', 'quad', 'panel', 'card'],
  pointlight: ['point light', 'pointlight', 'light', 'lamp', 'bulb'],
  spotlight: ['spot light', 'spotlight', 'spot'],
  ieslight: ['ies light', 'ies', 'automotive light', 'headlamp', 'headlight'],
  arealight: ['area light', 'rect light', 'softbox'], tubelight: ['tube light', 'linear light', 'light bar'],
  camera: ['camera', 'cam', 'view camera'], cinecamera: ['cinematic camera', 'cinema camera', 'film camera', 'cine camera'],
  playercamera: ['player camera', 'game camera', 'follow camera'], vehiclecamera: ['vehicle camera', 'car camera', 'chase camera', 'cockpit camera'],
  particles: ['particles', 'particle system', 'sparks', 'fx'],
  probe: ['probe', 'reflection probe'], audio: ['audio', 'sound', 'speaker', 'emitter'],
  water: ['water', 'ocean', 'sea'], sky: ['sky', 'atmosphere'], sun: ['sun'], moon: ['moon'],
  stars: ['stars', 'star field', 'starfield'], clouds: ['clouds', 'cloud layer'],
  fog: ['fog', 'height fog', 'haze'], wind: ['wind', 'wind field'], post: ['post', 'post stack', 'grade'],
  terrain: ['terrain', 'landscape', 'height field'], asset: ['asset', 'asset slot', 'import slot', 'imported asset'],
  curve: ['curve', 'spline', 'bezier', 'nurbs', 'path', 'motion path'],
  folder: ['folder', 'group'],
};
const COLORS = {
  red: '#ef5350', crimson: '#d64f45', orange: '#f59e0b', amber: '#ffb14b', yellow: '#f5d34b',
  green: '#22c55e', teal: '#1d7b8c', cyan: '#4fb6d8', blue: '#3b82f6', indigo: '#6c77ff',
  purple: '#8b5cf6', violet: '#8b5cf6', pink: '#ec4899', white: '#f2f4f7', black: '#0b0d10',
  grey: '#9aa0a6', gray: '#9aa0a6', silver: '#c9ccd1', gold: '#c9a24b', chrome: '#f2f4f7',
};
const TIME_WORDS = {
  'sunrise': 6, 'dawn': 5.4, 'morning': 9, 'midday': 12, 'noon': 12, 'afternoon': 15,
  'golden hour': 17.66, 'sunset': 18.4, 'dusk': 18.9, 'blue hour': 19.16, 'evening': 20,
  'night': 22, 'midnight': 0,
};

const typeFromWords = q => {
  const a = norm(q).replace(/s$/, '');
  let best = null, bestLen = 0;
  for (const [k, words] of Object.entries(TYPE_WORDS)) {
    for (const w of words) {
      const ww = norm(w).replace(/s$/, '');
      if ((a === ww || a.endsWith(' ' + ww) || a.startsWith(ww + ' ')) && ww.length > bestLen) { best = k; bestLen = ww.length; }
    }
  }
  return best;
};

/* ── fragment extraction — order in the sentence does not matter ───────────────────────────── */
function takeVec(s) {
  const one = k => {
    const m = s.match(new RegExp(`\\b${k}\\s*[:=]?\\s*${NUM}`, 'i'));
    return m ? { v: parseFloat(m[1]), txt: m[0] } : null;
  };
  const X = one('x'), Y = one('y'), Z = one('z');
  if ([X, Y, Z].filter(Boolean).length >= 2) {
    let rest = s;
    [X, Y, Z].forEach(o => { if (o) rest = rest.replace(o.txt, ' '); });
    return { v: [X ? X.v : null, Y ? Y.v : null, Z ? Z.v : null], rest, partial: true };
  }
  const m = s.match(new RegExp(`${NUM}[ ,]+${NUM}[ ,]+${NUM}`));
  if (m) return { v: [+m[1], +m[2], +m[3]], rest: s.replace(m[0], ' '), partial: false };
  return null;
}
function takeAmount(s) {
  const m = s.match(new RegExp(`\\b(?:by\\s+|to\\s+)?${NUM}\\s*(degrees?|degs?|deg|°|radians?|rads?|rad|metres?|meters?|m|units?|u|percent|%|times|x|×)?(?![a-z0-9])`, 'i'));
  if (!m) return null;
  return { n: parseFloat(m[1]), unit: norm(m[2] || ''), rest: s.replace(m[0], ' '), abs: /^\s*to\s/i.test(m[0]) };
}
function takeAxis(s) {
  const m = s.match(/\b(?:on|about|around|along|in|over|the)?\s*\b([xyz])\b(?:\s*-?\s*axis)?/i);
  if (!m) return null;
  return { axis: m[1].toLowerCase(), rest: s.replace(m[0], ' ') };
}
const AXIS_I = { x: 0, y: 1, z: 2 };
const toDegrees = (n, unit) => (/^rad/.test(unit) ? n * 180 / Math.PI : n);

/* ── target resolution ─────────────────────────────────────────────────────────────────────── */
const SELECTION_WORDS = /^(?:selection|selected|selected objects?|selected entit(?:y|ies)|current selection|this|these|them|it|that)$/i;
const EVERYTHING = /^(?:everything|all|all objects?|all entit(?:y|ies)|world|scene)$/i;

export function createLang(ctx) {
  const { state, act } = ctx;
  const selectionNodes = () => {
    const ns = [...state.selection].map(byId).filter(Boolean);
    if (ns.length) return ns;
    const cur = byId(state.cursorId);
    return cur ? [cur] : [];
  };

  /* one fragment → the nodes it names */
  function resolveOne(frag) {
    const q = clean(frag);
    if (!q) return { nodes: [], miss: null };
    if (SELECTION_WORDS.test(q)) return { nodes: selectionNodes(), miss: selectionNodes().length ? null : 'nothing is selected', word: 'the selection' };
    if (EVERYTHING.test(q)) return { nodes: flat.filter(n => !isFolder(n)), word: 'everything' };

    /* "all cubes" / "every light" / "all lighting" */
    const plural = q.match(/^(?:all|every|each)\s+(.+)$/i);
    const bulk = plural ? plural[1] : null;
    if (bulk) {
      const cat = CATEGORIES.find(c => norm(c) === norm(bulk).replace(/s$/, ''));
      if (cat) return { nodes: flat.filter(n => !isFolder(n) && typeOf(n).cat === cat), word: `all ${cat}` };
      const tk = typeFromWords(bulk);
      if (tk) return { nodes: flat.filter(n => n.type === tk), word: `all ${TYPES[tk].label.toLowerCase()}s` };
      if (/^light/.test(norm(bulk))) return { nodes: flat.filter(n => ['pointlight', 'spotlight', 'ieslight', 'arealight', 'tubelight'].includes(n.type)), word: 'all lights' };
    }

    const ranked = flat.map(n => ({ n, s: scoreNode(q, n) })).filter(r => r.s > 0).sort((a, b) => b.s - a.s);
    if (!ranked.length) return { nodes: [], miss: q };
    /* a fragment that names a type with several instances takes them all only when pluralised */
    if (/s$/i.test(q.trim()) && ranked.length > 1 && ranked[0].s === ranked[1].s) {
      return { nodes: ranked.filter(r => r.s === ranked[0].s).map(r => r.n) };
    }
    return { nodes: [ranked[0].n], alts: ranked.slice(1, 4).map(r => r.n) };
  }

  function resolve(str) {
    const q = clean(str);
    if (!q) {
      const ns = selectionNodes();
      return { nodes: ns, misses: [], word: ns.length === 1 ? ns[0].name : 'the selection', implicit: true };
    }
    const parts = q.split(/\s*(?:,|\band\b|\+)\s*/i).map(clean).filter(Boolean);
    const nodes = [], misses = [];
    let word = null, alts = [];
    parts.forEach(p => {
      const r = resolveOne(p);
      if (r.miss) misses.push(r.miss);
      r.nodes.forEach(n => { if (!nodes.includes(n)) nodes.push(n); });
      if (r.word) word = r.word;
      if (r.alts) alts = alts.concat(r.alts);
    });
    return { nodes, misses, word, alts };
  }

  const names = ns => ns.length === 1 ? ns[0].name : `${ns.length} entities`;
  const fail = (error, hint) => ({ ok: false, error, hint });
  const plan = (o) => ({ ok: true, sub: 'command', icon: 'command', ...o });

  /* transform helpers — they refuse locked entities and entities without that property */
  function transform(nodes, key, mutate, { title, sub, icon }) {
    const usable = nodes.filter(n => Array.isArray(n.props?.[key]));
    const locked = usable.filter(n => n.locked);
    const targets = usable.filter(n => !n.locked);
    if (!usable.length) return fail(`${names(nodes)} has no ${key === 'pos' ? 'position' : key === 'rot' ? 'rotation' : 'scale'} to change`);
    if (!targets.length) return fail(`${names(locked)} is locked`, 'unlock it first');
    return plan({
      title, sub, icon,
      run() { targets.forEach(mutate); act.commit(targets, key); return `${title}${locked.length ? ` · ${locked.length} locked skipped` : ''}`; },
    });
  }

  /* ── the verbs ───────────────────────────────────────────────────────────────────────────── */
  const VERBS = [
    /* find / select ─────────────────────────────────────────────────────────────────────── */
    {
      id: 'find', keys: ['find', 'locate', 'select', 'where is', 'go to', 'show me', 'pick'],
      usage: 'find <entity>', help: 'select it, reveal it in the tree and frame it',
      build(rest) {
        const r = resolve(rest);
        if (!r.nodes.length) return fail(`Nothing here is called “${r.misses[0] || rest}”`, 'try part of the name, or a type like “sphere”');
        const n = r.nodes[0];
        const t = typeOf(n);
        return plan({
          title: `Find ${n.name}`, sub: `${t.label} · select, reveal and frame`, icon: t.icon, color: t.color,
          run() { act.find(r.nodes); return `Found <b>${n.name}</b>`; },
        });
      },
    },
    /* rotate ────────────────────────────────────────────────────────────────────────────── */
    {
      id: 'rotate', keys: ['rotate', 'turn', 'spin', 'yaw', 'pitch', 'roll'],
      usage: 'rotate <entity> 40 degrees on z', help: 'degrees by default, radians if you say so',
      build(rest, verb) {
        let s = ' ' + rest + ' ';
        const ax = takeAxis(s); if (ax) s = ax.rest;
        const am = takeAmount(s); if (am) s = am.rest;
        if (!am) return fail('How far should it turn?', 'rotate cube 40 degrees on z');
        const axis = ax ? ax.axis : (verb === 'pitch' ? 'x' : verb === 'roll' ? 'z' : 'y');
        const deg = toDegrees(am.n, am.unit);
        const r = resolve(s);
        if (!r.nodes.length) return fail(r.misses.length ? `No entity called “${r.misses[0]}”` : 'Nothing is selected', 'name it, or select it first');
        const i = AXIS_I[axis];
        const abs = am.abs;
        return transform(r.nodes, 'rot',
          n => { n.props.rot[i] = +(((abs ? 0 : n.props.rot[i]) + deg).toFixed(2)); },
          {
            title: `${abs ? 'Set' : 'Rotate'} ${names(r.nodes)} ${abs ? 'to' : 'by'} ${+deg.toFixed(2)}° on ${axis.toUpperCase()}`,
            sub: /^rad/.test(am.unit) ? `${am.n} rad` : 'transform', icon: 'motion',
          });
      },
    },
    /* move ──────────────────────────────────────────────────────────────────────────────── */
    {
      id: 'move', keys: ['move', 'translate', 'shift', 'nudge', 'push', 'place', 'put'],
      usage: 'move <entity> 2 m on x', help: 'or “move cube to x 4 y 1 z 0”',
      build(rest) {
        let s = ' ' + rest + ' ';
        const to = /\bto\b/i.test(s);
        const vec = takeVec(s);
        if (vec) {
          s = vec.rest;
          const r = resolve(s.replace(/\bto\b/gi, ' '));
          if (!r.nodes.length) return fail(r.misses.length ? `No entity called “${r.misses[0]}”` : 'Nothing is selected');
          const where = vec.v.map((v, i) => v == null ? null : v);
          return transform(r.nodes, 'pos',
            n => { where.forEach((v, i) => { if (v != null) n.props.pos[i] = v; }); },
            {
              title: `Move ${names(r.nodes)} to ${where.map((v, i) => v == null ? null : `${'XYZ'[i]} ${v}`).filter(Boolean).join(', ')}`,
              sub: 'absolute position', icon: 'motion',
            });
        }
        const ax = takeAxis(s); if (ax) s = ax.rest;
        const am = takeAmount(s); if (am) s = am.rest;
        if (!am) return fail('How far, and on which axis?', 'move cube 2 m on x');
        const axis = ax ? ax.axis : 'x';
        const i = AXIS_I[axis];
        const r = resolve(s);
        if (!r.nodes.length) return fail(r.misses.length ? `No entity called “${r.misses[0]}”` : 'Nothing is selected');
        return transform(r.nodes, 'pos',
          n => { n.props.pos[i] = +(((to && am.abs ? 0 : n.props.pos[i]) + am.n).toFixed(3)); },
          {
            title: `Move ${names(r.nodes)} ${am.abs ? 'to' : 'by'} ${am.n} m on ${axis.toUpperCase()}`,
            sub: /^(deg|°|rad)/.test(am.unit) ? 'metres — degrees do not move things' : 'transform', icon: 'motion',
          });
      },
    },
    /* scale ─────────────────────────────────────────────────────────────────────────────── */
    {
      id: 'scale', keys: ['scale', 'resize', 'grow', 'shrink'],
      usage: 'scale <entity> 2x', help: 'uniform, or add “on y” for one axis',
      build(rest, verb) {
        let s = ' ' + rest + ' ';
        const ax = takeAxis(s); if (ax) s = ax.rest;
        const am = takeAmount(s); if (am) s = am.rest;
        if (!am) return fail('By how much?', 'scale sphere 2x');
        let k = am.n;
        if (/^percent|%$/.test(am.unit)) k = am.n / 100;
        if (verb === 'shrink' && k > 1) k = 1 / k;
        const r = resolve(s);
        if (!r.nodes.length) return fail(r.misses.length ? `No entity called “${r.misses[0]}”` : 'Nothing is selected');
        const idx = ax ? AXIS_I[ax.axis] : null;
        return transform(r.nodes, 'scale',
          n => {
            if (idx == null) n.props.scale = n.props.scale.map(v => +(v * k).toFixed(3));
            else n.props.scale[idx] = +(n.props.scale[idx] * k).toFixed(3);
          },
          { title: `Scale ${names(r.nodes)} ×${+k.toFixed(3)}${idx == null ? '' : ` on ${'XYZ'[idx]}`}`, sub: 'transform', icon: 'motion' });
      },
    },
    /* add ───────────────────────────────────────────────────────────────────────────────── */
    {
      id: 'add', keys: ['add', 'create', 'spawn', 'new', 'insert', 'drop'],
      usage: 'add sphere at x 3 y 2 z -1', help: 'any entity type, anywhere',
      build(rest) {
        let s = ' ' + rest + ' ';
        let name = null;
        const nm = s.match(/\b(?:named|called)\s+"?([^",]+?)"?(?=\s+(?:at|on|in|near|with|by)\b|[,"]|$)/i);
        if (nm) { name = squash(nm[1]); s = s.replace(nm[0], ' '); }
        const vec = takeVec(s); if (vec) s = vec.rest;
        s = s.replace(/\bat\b/gi, ' ');
        const key = typeFromWords(s);
        if (!key) return fail(`I do not know an entity called “${clean(s) || '…'}”`, 'try cube, sphere, light, camera, particles…');
        const t = TYPES[key];
        const pos = vec ? vec.v.map(v => v == null ? 0 : v) : null;
        return plan({
          title: `Add ${name || t.label}${pos ? ` at ${pos.join(', ')}` : ''}`, sub: `new ${t.label.toLowerCase()}`,
          icon: t.icon, color: t.color,
          run() { const n = act.add(key, { pos, name }); return `Added <b>${n.name}</b>`; },
        });
      },
    },
    /* physics ───────────────────────────────────────────────────────────────────────────── */
    {
      id: 'physics', keys: ['enable physics', 'disable physics', 'turn on physics', 'turn off physics',
        'add physics', 'remove physics', 'physics'],
      usage: 'enable physics on <entity>', help: 'bodies fall and settle while the world runs',
      build(rest, verb) {
        const on = !/disable|off|remove/.test(verb);
        const s = ' ' + rest.replace(/^\s*(?:on|for|to)\b/i, ' ') + ' ';
        const r = resolve(s);
        const usable = r.nodes.filter(n => Array.isArray(n.props?.pos) && !isFolder(n));
        if (!usable.length) {
          return fail(r.misses.length ? `No entity called “${r.misses[0]}”` : 'Nothing is selected', 'enable physics on cube, sphere');
        }
        return plan({
          title: `${on ? 'Enable' : 'Disable'} physics on ${names(usable)}`,
          sub: on ? 'gravity, bounce and rest' : 'back to static', icon: on ? 'motion' : 'reset',
          run() { act.physics(usable, on); return `Physics ${on ? 'on' : 'off'} for <b>${names(usable)}</b>`; },
        });
      },
    },
    /* isolation ─────────────────────────────────────────────────────────────────────────── */
    {
      id: 'unisolate', keys: ['exit isolation', 'unisolate', 'leave isolation', 'clear isolation', 'show everything'],
      usage: 'exit isolation', help: 'bring the rest of the world back',
      build() { return plan({ title: 'Exit isolation', sub: 'view', icon: 'solo', run() { act.exitIsolation(); return 'Isolation cleared'; } }); },
    },
    {
      id: 'isolate', keys: ['isolate', 'solo', 'only show'],
      usage: 'isolate selection', help: 'hide everything else',
      build(rest) {
        const r = resolve(rest);
        if (!r.nodes.length) return fail('Nothing to isolate', 'isolate selection · isolate chrome sphere');
        return plan({
          title: `Isolate ${names(r.nodes)}`, sub: 'hides everything else', icon: 'solo',
          run() { act.isolate(r.nodes); return `Isolated <b>${names(r.nodes)}</b>`; },
        });
      },
    },
    /* delete ────────────────────────────────────────────────────────────────────────────── */
    {
      id: 'purge', keys: ['delete from ram', 'remove from ram', 'delete from memory', 'purge', 'wipe',
        'free', 'destroy', 'nuke'],
      usage: 'delete from ram <entity>', help: 'deletes it and disposes its GPU + RAM buffers for good',
      build(rest) {
        const r = resolve(rest.replace(/^\s*(?:from|the)\b/i, ' '));
        if (!r.nodes.length) return fail(r.misses.length ? `No entity called “${r.misses[0]}”` : 'Nothing is selected');
        return plan({
          title: `Purge ${names(r.nodes)}`, sub: 'delete and free geometry, materials and textures',
          icon: 'trash', danger: true,
          run() { return act.purge(r.nodes); },
        });
      },
    },
    {
      id: 'delete', keys: ['delete', 'remove', 'erase', 'kill'],
      usage: 'delete <entity>', help: 'removes it from the scene',
      build(rest) {
        const r = resolve(rest);
        if (!r.nodes.length) return fail(r.misses.length ? `No entity called “${r.misses[0]}”` : 'Nothing is selected');
        return plan({
          title: `Delete ${names(r.nodes)}`, sub: 'remove from the scene', icon: 'trash', danger: true,
          run() { act.remove(r.nodes); return `Deleted <b>${names(r.nodes)}</b>`; },
        });
      },
    },
    /* visibility, locking, naming ───────────────────────────────────────────────────────── */
    {
      id: 'hide', keys: ['hide', 'unhide', 'show'],
      usage: 'hide <entity>', help: 'visibility, same as the eye in the outliner',
      build(rest, verb) {
        const vis = verb !== 'hide';
        const r = resolve(rest);
        if (!r.nodes.length) return fail(r.misses.length ? `No entity called “${r.misses[0]}”` : 'Nothing is selected');
        return plan({
          title: `${vis ? 'Show' : 'Hide'} ${names(r.nodes)}`, sub: 'visibility', icon: vis ? 'eye' : 'eyeoff',
          run() { act.visible(r.nodes, vis); return `${vis ? 'Showing' : 'Hidden'}: <b>${names(r.nodes)}</b>`; },
        });
      },
    },
    {
      id: 'lock', keys: ['lock', 'unlock'],
      usage: 'lock <entity>', help: 'stop it being edited or dragged',
      build(rest, verb) {
        const locked = verb === 'lock';
        const r = resolve(rest);
        if (!r.nodes.length) return fail(r.misses.length ? `No entity called “${r.misses[0]}”` : 'Nothing is selected');
        return plan({
          title: `${locked ? 'Lock' : 'Unlock'} ${names(r.nodes)}`, sub: 'protection', icon: locked ? 'lock' : 'unlock',
          run() { act.lock(r.nodes, locked); return `${locked ? 'Locked' : 'Unlocked'} <b>${names(r.nodes)}</b>`; },
        });
      },
    },
    {
      id: 'rename', keys: ['rename', 'call'],
      usage: 'rename <entity> to <name>', help: '',
      build(rest) {
        const m = rest.match(/^(.*?)\s+(?:to|as)\s+"?([^"]+)"?$/i);
        if (!m) return fail('Rename what, to what?', 'rename cube to Anchor Block');
        const r = resolve(m[1]);
        if (!r.nodes.length) return fail(`No entity called “${clean(m[1])}”`);
        const n = r.nodes[0], name = squash(m[2]);
        return plan({
          title: `Rename ${n.name} → ${name}`, sub: 'identity', icon: 'settings',
          run() { act.rename(n, name); return `Renamed to <b>${name}</b>`; },
        });
      },
    },
    {
      id: 'duplicate', keys: ['duplicate', 'copy', 'clone'],
      usage: 'duplicate <entity>', help: '',
      build(rest) {
        const r = resolve(rest);
        if (!r.nodes.length) return fail(r.misses.length ? `No entity called “${r.misses[0]}”` : 'Nothing is selected');
        return plan({
          title: `Duplicate ${names(r.nodes)}`, sub: 'copy alongside the original', icon: 'copy',
          run() { act.duplicate(r.nodes); return `Duplicated <b>${names(r.nodes)}</b>`; },
        });
      },
    },
    /* camera ────────────────────────────────────────────────────────────────────────────── */
    {
      id: 'frame', keys: ['frame', 'focus', 'look at', 'zoom to'],
      usage: 'frame <entity|everything>', help: '',
      build(rest) {
        const q = clean(rest);
        if (!q || EVERYTHING.test(q)) return plan({ title: 'Frame everything', sub: 'camera', icon: 'focus', run() { act.frameAll(); return 'Framed the whole scene'; } });
        const r = resolve(q);
        if (!r.nodes.length) return fail(`No entity called “${q}”`);
        return plan({ title: `Frame ${r.nodes[0].name}`, sub: 'camera', icon: 'focus', run() { act.focus(r.nodes[0]); return `Framing <b>${r.nodes[0].name}</b>`; } });
      },
    },
    {
      id: 'view', keys: ['view', 'look from', 'camera'],
      usage: 'view top', help: 'front · back · left · right · top · bottom',
      build(rest) {
        const q = norm(rest);
        const k = ['front', 'back', 'left', 'right', 'top', 'bottom'].find(v => q.includes(v));
        if (!k) return fail('Which view?', 'view top · view front · view left');
        return plan({ title: `View from the ${k}`, sub: 'camera', icon: 'camera', run() { act.snapView(k); return `Looking from the ${k}`; } });
      },
    },
    /* time ──────────────────────────────────────────────────────────────────────────────── */
    {
      id: 'time', keys: ['set time', 'time', 'set the time', 'make it'],
      usage: 'set time to golden hour', help: 'a clock time, or sunrise / noon / dusk / midnight',
      build(rest) {
        const s = ' ' + rest.replace(/^\s*to\b/i, ' ') + ' ';
        const hhmm = s.match(/\b(\d{1,2})[:h](\d{2})\b/);
        const ampm = s.match(/\b(\d{1,2})(?:\.(\d))?\s*(am|pm)\b/i);
        const word = Object.keys(TIME_WORDS).find(w => norm(s).includes(w));
        let h = null, label = '';
        if (hhmm) { h = +hhmm[1] + (+hhmm[2]) / 60; label = `${hhmm[1]}:${hhmm[2]}`; }
        else if (ampm) { h = (+ampm[1] % 12) + (/pm/i.test(ampm[3]) ? 12 : 0); label = `${ampm[1]}${ampm[3].toLowerCase()}`; }
        else if (word) { h = TIME_WORDS[word]; label = word; }
        else {
          const bare = s.match(new RegExp(`\\b${NUM}\\s*(?:h|hours?)?\\s*$`));
          if (bare) { h = +bare[1]; label = `${h} h`; }
        }
        if (h == null) return fail('What time?', 'set time to 17:40 · set time to golden hour');
        const hh = ((h % 24) + 24) % 24;
        return plan({
          title: `Set time to ${label}`, sub: `${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.round(hh % 1 * 60)).padStart(2, '0')}`,
          icon: 'sun', run() { act.setTime(hh); return `Time is now ${label}`; },
        });
      },
    },
    {
      id: 'daycycle', keys: ['start day cycle', 'stop day cycle', 'run day cycle', 'toggle day cycle', 'day cycle'],
      usage: 'start day cycle', help: '',
      build(_, verb) {
        const on = !/stop/.test(verb);
        return plan({ title: `${on ? 'Start' : 'Stop'} the day cycle`, sub: 'time', icon: 'sun', run() { act.dayCycle(on); return `Day cycle ${on ? 'running' : 'stopped'}`; } });
      },
    },
    /* transport ─────────────────────────────────────────────────────────────────────────── */
    {
      id: 'play', keys: ['play', 'run'], usage: 'play', help: 'run the world through a camera',
      build() { return plan({ title: 'Play', sub: 'run through a scene camera', icon: 'play', run() { act.transport('play'); return 'Playing'; } }); },
    },
    {
      id: 'simulate', keys: ['simulate'], usage: 'simulate', help: 'run the world, keep the editor camera',
      build() { return plan({ title: 'Simulate', sub: 'run with the editor camera', icon: 'sim', run() { act.transport('simulate'); return 'Simulating'; } }); },
    },
    {
      id: 'stop', keys: ['stop', 'end'], usage: 'stop', help: 'restore the editor state',
      build() { return plan({ title: 'Stop', sub: 'restore the world', icon: 'stop', run() { act.transport('edit'); return 'Stopped'; } }); },
    },
    {
      id: 'pause', keys: ['pause', 'resume', 'freeze'], usage: 'pause', help: '',
      build(_, verb) { const p = verb !== 'resume'; return plan({ title: p ? 'Pause' : 'Resume', sub: 'transport', icon: 'pause', run() { act.pause(p); return p ? 'Paused' : 'Resumed'; } }); },
    },
    {
      id: 'step', keys: ['step', 'advance'], usage: 'step', help: 'one frame',
      build() { return plan({ title: 'Step one frame', sub: 'transport', icon: 'step', run() { act.step(); return 'Stepped one frame'; } }); },
    },
    /* markers, popups, layout ───────────────────────────────────────────────────────────── */
    {
      id: 'closepops', keys: ['close popups', 'close all popups', 'clear popups'], usage: 'close popups', help: '',
      build() { return plan({ title: 'Close all popups', sub: 'view', icon: 'close', run() { act.closePopups(); return 'Popups closed'; } }); },
    },
    {
      id: 'markers', keys: ['markers', 'labels'], usage: 'labels always', help: 'hover · always · icons only',
      build(rest) {
        const q = norm(rest);
        const mode = /always|on$|show/.test(q) ? 'always' : /hover/.test(q) ? 'hover' : /icon|off|none|hide/.test(q) ? 'none' : null;
        if (!mode) return fail('Which marker mode?', 'labels always · labels on hover · labels icons only');
        return plan({ title: `Markers: ${mode === 'none' ? 'icons only' : `names ${mode}`}`, sub: 'billboards', icon: 'tag', run() { act.labels(mode); return 'Marker mode changed'; } });
      },
    },
    /* generic property setter ───────────────────────────────────────────────────────────── */
    {
      id: 'set', keys: ['set', 'make'],
      usage: 'set roughness of <entity> to 0.2', help: 'any property on any entity',
      build(rest) {
        let m = rest.match(/^(.*?)\s+(?:of|on|for)\s+(.*?)\s+(?:to|=)\s+(.+)$/i);
        let propStr, targetStr, valStr;
        if (m) { [, propStr, targetStr, valStr] = m; }
        else {
          m = rest.match(/^(.*?)\s+(?:to|=)\s+(.+)$/i);
          if (!m) return fail('Set what, to what?', 'set roughness of chrome sphere to 0.2');
          valStr = m[2];
          /* "set cube colour to red" — the last word or two is the property */
          const words = clean(m[1]).split(' ');
          for (let take = Math.min(2, words.length); take >= 1; take--) {
            const cand = words.slice(-take).join(' ');
            const rest2 = words.slice(0, -take).join(' ');
            const r2 = resolve(rest2);
            if (r2.nodes.length && findProp(r2.nodes[0], cand)) { propStr = cand; targetStr = rest2; break; }
          }
          if (!propStr) return fail(`I could not find that property`, 'set roughness of chrome sphere to 0.2');
        }
        const r = resolve(targetStr);
        if (!r.nodes.length) return fail(r.misses.length ? `No entity called “${r.misses[0]}”` : 'Nothing is selected');
        const hits = r.nodes.map(n => ({ n, def: findProp(n, propStr) })).filter(h => h.def);
        if (!hits.length) return fail(`${names(r.nodes)} has no “${clean(propStr)}”`, 'try: colour, roughness, intensity, metallic…');
        const { def } = hits[0];
        const value = coerce(def, valStr);
        if (value == null) return fail(`“${clean(valStr)}” is not a valid ${def.label.toLowerCase()}`);
        return plan({
          title: `Set ${def.label.toLowerCase()} of ${names(hits.map(h => h.n))} to ${Array.isArray(value) ? value.join(', ') : value}`,
          sub: 'property', icon: 'settings',
          run() { hits.forEach(h => act.setProp(h.n, h.def.k, value)); return `${def.label} set to <b>${Array.isArray(value) ? value.join(', ') : value}</b>`; },
        });
      },
    },
    /* help ──────────────────────────────────────────────────────────────────────────────── */
    {
      id: 'help', keys: ['help', 'commands', 'what can i say', '?'],
      usage: 'help', help: '',
      build() { return plan({ title: 'Show what you can type', sub: 'help', icon: 'command', run() { act.help(); return 'Type any of these'; } }); },
    },
  ];

  /* property lookup by label or key, on the node's own schema */
  function findProp(node, q) {
    const a = norm(q);
    if (!a) return null;
    const defs = (typeOf(node).groups || []).flatMap(g => g.props).filter(p => p.kind !== 'readout');
    const alias = { colour: 'color', color: 'color', metallic: 'metalness', shininess: 'roughness', brightness: 'intensity', size: 'scale' };
    const q2 = alias[a] || a;
    return defs.find(p => norm(p.k) === q2 || norm(p.label) === q2)
      || defs.find(p => norm(p.label).includes(q2) || norm(p.k).includes(q2))
      || (q2 === 'position' ? defs.find(p => p.k === 'pos') : null)
      || (q2 === 'rotation' ? defs.find(p => p.k === 'rot') : null);
  }
  function coerce(def, raw) {
    const s = clean(raw);
    switch (def.kind) {
      case 'slider': {
        const m = s.match(new RegExp(NUM));
        if (!m) return null;
        let v = parseFloat(m[1]);
        if (/%/.test(s) && def.max <= 1) v /= 100;
        return Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, v));
      }
      case 'switch': return /^(on|yes|true|1|enabled?)$/i.test(s) ? true : /^(off|no|false|0|disabled?)$/i.test(s) ? false : null;
      case 'color': {
        const hex = s.match(/#?([0-9a-f]{6})\b/i);
        if (hex) return '#' + hex[1].toLowerCase();
        const w = Object.keys(COLORS).find(c => norm(s).includes(c));
        return w ? COLORS[w] : null;
      }
      case 'vec3': {
        const v = takeVec(' ' + s + ' ');
        return v ? v.v.map(x => x == null ? 0 : x) : null;
      }
      case 'select': return def.options.find(o => norm(o) === norm(s)) || def.options.find(o => norm(o).includes(norm(s))) || null;
      default: return s;
    }
  }

  /* ── parse ───────────────────────────────────────────────────────────────────────────────
     Longest keyword wins, so "delete from ram" beats "delete" and "exit isolation" beats a
     fuzzy name match. */
  const ALL_KEYS = VERBS.flatMap(v => v.keys.map(k => ({ k, v }))).sort((a, b) => b.k.length - a.k.length);

  function parse(text) {
    const t = squash(String(text || ''));
    if (!t) return null;
    const low = ' ' + t.toLowerCase() + ' ';
    for (const { k, v } of ALL_KEYS) {
      if (low.startsWith(' ' + k + ' ') || low.trim() === k) {
        const rest = t.slice(k.length).trim();
        try { return { ...v.build(rest, k, t), verb: v.id, input: t }; }
        catch (err) { return { ok: false, error: 'I could not work that out', hint: v.usage, input: t }; }
      }
    }
    /* no verb — treat a bare phrase as "find" */
    const r = resolve(t);
    if (r.nodes.length) {
      const n = r.nodes[0], ty = typeOf(n);
      return {
        ok: true, verb: 'find', input: t, title: `Find ${n.name}`, sub: `${ty.label} · select and frame`,
        icon: ty.icon, color: ty.color, run() { act.find([n]); return `Found <b>${n.name}</b>`; },
      };
    }
    return { ok: false, input: t, error: `I do not understand “${t}”`, hint: 'try “help”, or start with find · move · rotate · add · set' };
  }

  /* ── suggestions ─────────────────────────────────────────────────────────────────────────
     The row list above the console: what the current text will do, then completions, then the
     entities and canned commands that match. */
  const EXAMPLES = [
    'find chrome sphere',
    'rotate anchor cube 40 degrees on z',
    'move glass slab 2 m on x',
    'add sphere at x 3 y 2 z -1',
    'enable physics on selected objects',
    'isolate selection',
    'set roughness of chrome sphere to 0.2',
    'set time to golden hour',
    'delete from ram marker post',
  ];

  function suggest(text, quick = []) {
    const t = squash(text || '');
    const q = t.toLowerCase();
    const rows = [];
    if (!t) {
      rows.push(...EXAMPLES.map(e => ({ title: e, sub: 'try this', icon: 'command', insert: e })));
      return rows.slice(0, 9);
    }
    const p = parse(t);
    /* while the word is still growing into a verb, offer it rather than scolding the typist */
    const growing = VERBS.some(v => v.keys.some(k => k.startsWith(q) && k !== q));
    if (p && p.ok) rows.push({ ...p, primary: true, sub: p.sub || 'run' });
    else if (p && !growing) rows.push({ ...p, title: p.error, primary: true, sub: p.hint || 'not understood', icon: 'close', bad: true });

    /* verb templates that begin with what has been typed */
    VERBS.forEach(v => {
      const hit = v.keys.find(k => k.startsWith(q) || (q.length > 2 && k.includes(q.split(' ')[0])));
      if (!hit) return;
      if (p && p.ok && p.verb === v.id && v.usage.split(' ').length <= t.split(' ').length) return;
      rows.push({ title: v.usage, sub: v.help || 'command', icon: 'command', insert: v.usage.replace(/<.*>.*/, '').trim() + ' ' });
    });

    /* entities by name */
    flat.map(n => ({ n, s: scoreNode(t, n) })).filter(r => r.s >= 30).sort((a, b) => b.s - a.s).slice(0, 5)
      .forEach(({ n }) => {
        const ty = typeOf(n);
        rows.push({ title: n.name, sub: `${ty.label} · find and frame`, icon: ty.icon, color: ty.color, insert: `find ${n.name}` });
      });

    /* the editor's own canned commands */
    quick.filter(c => c.label.toLowerCase().includes(q)).slice(0, 5)
      .forEach(c => rows.push({ title: c.label, sub: c.sub, icon: 'command', run: c.run }));

    const seen = new Set();
    return rows.filter(r => { const k = r.title + (r.insert || ''); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 9);
  }

  /* the longest text the console can ghost-complete behind the caret */
  function completion(text, rows) {
    const t = text || '';
    if (!t.trim()) return '';
    const cand = rows.map(r => r.insert || (r.primary ? '' : '')).filter(Boolean)
      .find(c => c.toLowerCase().startsWith(t.toLowerCase()) && c.length > t.length);
    return cand ? cand.slice(t.length) : '';
  }

  return { parse, suggest, completion, EXAMPLES, VERBS, resolve, findProp };
}
