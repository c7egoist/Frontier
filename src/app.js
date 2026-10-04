(() => {
  'use strict';

  const SIZE = 1024;
  const MODEL_BUFFER_SIZE = 512;
  const MODEL_RADIUS = 207 / MODEL_BUFFER_SIZE;
  const MAX_HISTORY = 8;
  const TWO_PI = Math.PI * 2;

  const iconPaths = {
    brush: '<path d="m14.5 5.5 4 4M5 19l3.5-.5L19 8a2.8 2.8 0 0 0-4-4L4.5 14.5 4 18z"/><path d="M4 21h7"/>',
    erase: '<path d="m8.5 5 10 10-5.5 5.5h-6L3 16.5 14.5 5a4.2 4.2 0 0 1 5.9 5.9M9 20.5l5-5"/>',
    orbit: '<path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M21 4v4h-4M21 12a9 9 0 0 1-15.4 6.4L3 16M3 20v-4h4"/>',
    sample: '<path d="m14 4 6 6M4 20l4-.8 11.5-11.5a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m7.5 13.5 3 3"/>',
    layers: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>',
    image: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><circle cx="9" cy="9" r="1.7"/><path d="m4.5 17 5-5 3.2 3 2.5-2.5 4.3 4.5"/>',
    text: '<path d="M4 5h16M12 5v14M8.5 19h7"/>',
    fill: '<path d="M12 3 4.5 11a5 5 0 0 0 7 7l8-8z"/><path d="m14 5 5 5M6 19h14"/>',
    effect: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4.2"/>',
    eye: '<path d="M2.8 12s3.2-6 9.2-6 9.2 6 9.2 6-3.2 6-9.2 6-9.2-6-9.2-6Z"/><circle cx="12" cy="12" r="2.5"/>',
    eyeOff: '<path d="m3 3 18 18M10.6 6.2A9.7 9.7 0 0 1 12 6c6 0 9.2 6 9.2 6a14 14 0 0 1-3 3.5M6.2 6.4C3.9 8 2.8 12 2.8 12s3.2 6 9.2 6c.7 0 1.3-.1 1.9-.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-1.8"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 16v4h14v-4"/>',
    duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    delete: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    move: '<path d="M12 3v18M3 12h18M12 3l-3 3m3-3 3 3m-3 15-3-3m3 3 3-3M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3"/>',
    sparkle: '<path d="m12 3 1.6 6.3L20 11l-6.4 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
    grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    svg: '<path d="m8 5-5 7 5 7M16 5l5 7-5 7M14 4l-4 16"/>',
    warning: '<path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/>',
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const icon = (name, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${iconPaths[name] || iconPaths.sparkle}</svg>`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const hexToRgb = (hex) => {
    const clean = String(hex || '#ffffff').replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean.padEnd(6, 'f').slice(0, 6);
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  };
  const rgbToHex = (rgb) => `#${rgb.map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
  const nowId = (prefix = 'layer') => `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;
  const canvasOf = (width = SIZE, height = SIZE) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };

  const paintCanvas = $('#paintCanvas');
  const displayContext = paintCanvas.getContext('2d', { willReadFrequently: true });
  const compositeCanvas = canvasOf();
  const compositeContext = compositeCanvas.getContext('2d', { willReadFrequently: true });
  const modelCanvas = canvasOf(MODEL_BUFFER_SIZE, MODEL_BUFFER_SIZE);
  const modelContext = modelCanvas.getContext('2d', { willReadFrequently: true });
  const artboardShell = $('#artboardShell');
  const brushCursor = $('#brushCursor');
  const layerList = $('#layerList');
  const inspectorContent = $('#inspectorContent');
  const state = {
    layers: [],
    activeLayerId: '',
    layerFilter: 'all',
    layerSearch: '',
    mode: 'paint',
    view: 'texture',
    tool: 'brush',
    zoom: 100,
    guides: false,
    color: '#d5a16e',
    brush: { size: 46, opacity: 0.76, hardness: 68, spacing: 12, preset: 'Soft', pressure: true, blend: 'source-over' },
    material: { name: 'Graphite / satin', baseColor: '#c5c8bf', roughness: 0.29, metalness: 0.68, clearcoat: 0.28, ior: 1.46, anisotropy: 0.32, normalScale: 0.68, preset: 'carbon', modelRotation: -0.38 },
    channels: { baseColor: true, normal: true, roughness: true, metallic: true, height: true },
    extraChannels: [],
    undoStack: [],
    redoStack: [],
    stroke: null,
    isRotating: false,
    isMovingDecal: false,
    lastDragPoint: null,
    toastTimer: null,
    saveTimer: null,
    db: null,
    dirty: false,
    renderQueued: false,
    collectionOpen: true,
    contextLayerId: null,
  };

  function makeLayer(name, kind, options = {}) {
    return {
      id: options.id || nowId(),
      name,
      kind,
      visible: options.visible !== false,
      locked: Boolean(options.locked),
      opacity: options.opacity ?? 1,
      blend: options.blend || 'source-over',
      canvas: options.canvas || canvasOf(),
      color: options.color || '',
      textData: options.textData || null,
      svgMarkup: options.svgMarkup || '',
      svgName: options.svgName || '',
      svgData: options.svgData || null,
      decalData: options.decalData || null,
      preset: options.preset || '',
    };
  }

  function seededRandom(seed = 412) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function createWeavePattern() {
    const tile = canvasOf(48, 48);
    const ctx = tile.getContext('2d');
    ctx.clearRect(0, 0, 48, 48);
    ctx.save();
    ctx.translate(24, 24);
    ctx.rotate(-Math.PI / 4);
    for (let band = -4; band <= 4; band += 1) {
      const offset = band * 12;
      ctx.fillStyle = band % 2 ? 'rgba(220,225,214,.055)' : 'rgba(0,0,0,.19)';
      ctx.fillRect(offset - 2, -40, 4, 80);
      ctx.fillStyle = band % 2 ? 'rgba(0,0,0,.19)' : 'rgba(220,225,214,.045)';
      ctx.fillRect(-40, offset - 2, 80, 4);
    }
    ctx.restore();
    const pattern = ctx.createPattern(tile, 'repeat');
    return pattern;
  }

  function drawBaseLayer(canvas) {
    const ctx = canvas.getContext('2d');
    const wash = ctx.createLinearGradient(35, 60, 930, 1000);
    wash.addColorStop(0, '#222827');
    wash.addColorStop(0.42, '#1b2020');
    wash.addColorStop(1, '#111514');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, SIZE, SIZE);

    const light = ctx.createRadialGradient(410, 280, 12, 512, 440, 850);
    light.addColorStop(0, 'rgba(118,127,115,.13)');
    light.addColorStop(0.54, 'rgba(62,71,65,.035)');
    light.addColorStop(1, 'rgba(0,0,0,.34)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.save();
    ctx.globalAlpha = 0.68;
    ctx.fillStyle = createWeavePattern();
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.restore();

    // Soft, restrained material grain. The seed keeps the starter surface stable between sessions.
    const random = seededRandom(21);
    ctx.save();
    for (let index = 0; index < 4200; index += 1) {
      const x = random() * SIZE;
      const y = random() * SIZE;
      const radius = random() * 1.15 + 0.25;
      ctx.fillStyle = random() > 0.52 ? 'rgba(235,236,223,.075)' : 'rgba(0,0,0,.12)';
      ctx.fillRect(x, y, radius, radius);
    }
    ctx.restore();

    // Fine panel seams make the atlas read like a coated manufactured surface.
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(3,6,5,.55)';
    ctx.beginPath();
    ctx.moveTo(87, 0); ctx.lineTo(87, 214); ctx.quadraticCurveTo(88, 238, 111, 251); ctx.lineTo(257, 335);
    ctx.moveTo(937, 0); ctx.lineTo(937, 209); ctx.quadraticCurveTo(936, 232, 913, 246); ctx.lineTo(764, 332);
    ctx.moveTo(0, 830); ctx.lineTo(215, 830); ctx.quadraticCurveTo(246, 830, 266, 853); ctx.lineTo(330, 923);
    ctx.moveTo(1024, 830); ctx.lineTo(809, 830); ctx.quadraticCurveTo(778, 830, 758, 853); ctx.lineTo(694, 923);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(204,213,198,.14)';
    ctx.beginPath();
    ctx.moveTo(91, 0); ctx.lineTo(91, 213); ctx.quadraticCurveTo(92, 235, 114, 248); ctx.lineTo(260, 332);
    ctx.moveTo(933, 0); ctx.lineTo(933, 208); ctx.quadraticCurveTo(932, 229, 910, 243); ctx.lineTo(761, 329);
    ctx.moveTo(0, 826); ctx.lineTo(214, 826); ctx.quadraticCurveTo(244, 826, 263, 849); ctx.lineTo(327, 919);
    ctx.moveTo(1024, 826); ctx.lineTo(810, 826); ctx.quadraticCurveTo(780, 826, 761, 849); ctx.lineTo(697, 919);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(211,219,206,.075)';
    ctx.setLineDash([2, 8]);
    ctx.lineWidth = 1;
    ctx.strokeRect(35, 35, 954, 954);
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(0,0,0,.26)';
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 50, 924, 924);
    ctx.restore();
  }

  function drawWeaveLayer(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = createWeavePattern();
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.restore();

    // A quiet vertical satin sheen, so the preview has directional material response.
    const sheen = ctx.createLinearGradient(120, 0, 825, 0);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.46, 'rgba(226,230,219,.04)');
    sheen.addColorStop(0.52, 'rgba(236,239,227,.075)');
    sheen.addColorStop(0.61, 'rgba(255,255,255,.015)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  function drawPinstripeLayer(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.save();
    const copper = ctx.createLinearGradient(35, 420, 475, 65);
    copper.addColorStop(0, '#765541');
    copper.addColorStop(0.28, '#d1a276');
    copper.addColorStop(0.54, '#9e7655');
    copper.addColorStop(1, '#644a39');
    ctx.fillStyle = copper;
    ctx.beginPath();
    ctx.moveTo(-60, 370); ctx.lineTo(421, 136); ctx.lineTo(500, 165); ctx.lineTo(15, 414); ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(231,218,190,.78)';
    ctx.beginPath();
    ctx.moveTo(-10, 345); ctx.lineTo(421, 137); ctx.lineTo(438, 143); ctx.lineTo(4, 358); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(24,25,22,.84)';
    ctx.beginPath();
    ctx.moveTo(20, 401); ctx.lineTo(477, 169); ctx.lineTo(496, 176); ctx.lineTo(35, 411); ctx.closePath();
    ctx.fill();

    // A second, short registration slash brings a subtle warm focal point to the opposite corner.
    ctx.fillStyle = 'rgba(197,151,107,.82)';
    ctx.beginPath();
    ctx.moveTo(786, 755); ctx.lineTo(1040, 623); ctx.lineTo(1040, 641); ctx.lineTo(795, 772); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(229,222,207,.7)';
    ctx.beginPath();
    ctx.moveTo(817, 771); ctx.lineTo(1027, 659); ctx.lineTo(1027, 664); ctx.lineTo(823, 777); ctx.closePath();
    ctx.fill();

    // Small metallic registration marks.
    ctx.strokeStyle = 'rgba(225,218,201,.34)';
    ctx.lineWidth = 1;
    for (const [x, y, size] of [[70, 462, 14], [943, 574, 16], [682, 927, 12], [277, 95, 11]]) {
      ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y); ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3, 0, TWO_PI); ctx.stroke();
    }

    // Hand-drawn contour rings, intentionally faint like a secondary print pass.
    ctx.strokeStyle = 'rgba(212,200,177,.2)';
    ctx.lineWidth = 1.3;
    for (let ring = 0; ring < 6; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(824, 754, 92 + ring * 21, 46 + ring * 14, -0.52, Math.PI * 1.02, Math.PI * 1.92);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTextArtwork(canvas, data, initial = false) {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(data.x ?? SIZE / 2, data.y ?? SIZE / 2);
    ctx.rotate((data.rotation || 0) * Math.PI / 180);
    const text = data.text || 'STUDIO / 24';
    const maxSize = data.size || 180;
    const fitSize = Math.min(maxSize, (SIZE * 0.73) / Math.max(1, text.length * 0.61));
    ctx.textAlign = data.align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = data.color || '#e4dfd3';
    ctx.font = `${data.weight || 450} ${fitSize}px ${data.font || 'DM Sans'}, sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,.22)';
    ctx.shadowBlur = 3;
    ctx.fillText(text, 0, 0);
    ctx.shadowBlur = 0;
    if (initial) {
      const labelSize = 18;
      ctx.fillStyle = 'rgba(220,218,204,.76)';
      ctx.textAlign = 'left';
      ctx.font = `400 ${labelSize}px ${data.font || 'DM Sans'}, sans-serif`;
      ctx.fillText('NACRE  /  FLIGHT SYSTEMS', 0, -fitSize * 0.7);
      ctx.fillStyle = 'rgba(207,211,199,.46)';
      ctx.font = `400 11px ${data.font || 'DM Sans'}, sans-serif`;
      ctx.fillText('COMPOSITE SHELL     •     FIELD UNIT 04', 3, fitSize * 0.57);
      ctx.strokeStyle = 'rgba(217,211,195,.55)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(2, fitSize * 0.38); ctx.lineTo(204, fitSize * 0.38); ctx.stroke();
      ctx.fillStyle = '#c99e73';
      ctx.beginPath(); ctx.arc(221, fitSize * 0.38, 2.5, 0, TWO_PI); ctx.fill();
    }
    ctx.restore();
  }

  function drawInitialDecal(canvas) {
    const ctx = canvas.getContext('2d');
    const data = { text: '04', color: '#e1ded2', font: 'DM Sans', size: 206, x: 188, y: 682, rotation: 0, align: 'left', weight: 350 };
    drawTextArtwork(canvas, data, true);

    // A fine instrument roundel and its small index labels.
    ctx.save();
    ctx.strokeStyle = 'rgba(221,216,200,.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(789, 649, 57, 0, TWO_PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(789, 649, 49, 0, TWO_PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(789, 581); ctx.lineTo(789, 591); ctx.moveTo(789, 707); ctx.lineTo(789, 717); ctx.moveTo(721, 649); ctx.lineTo(731, 649); ctx.moveTo(847, 649); ctx.lineTo(857, 649); ctx.stroke();
    ctx.fillStyle = 'rgba(226,222,208,.84)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '400 18px DM Sans, sans-serif';
    ctx.fillText('N', 789, 644);
    ctx.fillStyle = 'rgba(215,210,195,.52)';
    ctx.font = '400 8px DM Sans, sans-serif';
    ctx.fillText('AERO / 04', 789, 660);
    ctx.textAlign = 'left';
    ctx.fillText('R 06', 864, 644);
    ctx.fillText('SHELL / 01', 689, 732);
    ctx.restore();

    const random = seededRandom(88);
    ctx.save();
    for (let index = 0; index < 105; index += 1) {
      const x = 120 + random() * 790;
      const y = 535 + random() * 335;
      const radius = random() * 1.6 + 0.4;
      ctx.fillStyle = random() > 0.65 ? 'rgba(223,221,210,.38)' : 'rgba(218,155,103,.48)';
      ctx.beginPath(); ctx.arc(x, y, radius, 0, TWO_PI); ctx.fill();
    }
    ctx.restore();
    return data;
  }

  function createInitialLayers() {
    const base = makeLayer('Graphite / satin', 'fill', { id: 'layer-graphite', color: '#1b2020', locked: true });
    drawBaseLayer(base.canvas);
    const weave = makeLayer('Carbon weave', 'paint', { id: 'layer-weave', opacity: 0.62, locked: true });
    drawWeaveLayer(weave.canvas);
    const pinstripe = makeLayer('Pearl pinline', 'paint', { id: 'layer-pinline', opacity: 1 });
    drawPinstripeLayer(pinstripe.canvas);
    const identity = makeLayer('N° 04 / instrument mark', 'text', { id: 'layer-identity' });
    identity.textData = drawInitialDecal(identity.canvas);
    const coat = makeLayer('Protective clearcoat', 'fx', { id: 'layer-clearcoat', opacity: 0.38, locked: true, preset: 'Clear coat · satin' });
    return [coat, identity, pinstripe, weave, base];
  }

  function getLayer(id = state.activeLayerId) { return state.layers.find((layer) => layer.id === id) || null; }
  function activeLayer() { return getLayer(state.activeLayerId); }
  function visibleLayerCount() { return state.layers.filter((layer) => layer.visible).length; }

  function layerCategory(layer) {
    if (layer.kind === 'paint') return 'paint';
    if (layer.kind === 'text' || layer.kind === 'svg') return 'decal';
    return 'surface';
  }

  function layerIcon(layer) {
    if (layer.kind === 'paint') return icon('brush');
    if (layer.kind === 'fill') return icon('fill');
    if (layer.kind === 'text') return '<span class="thumb-letter">T</span>';
    if (layer.kind === 'svg') return icon('svg');
    return icon('effect');
  }

  function layerTypeLabel(layer) {
    if (layer.kind === 'paint') return layer.preset ? `PAINT · ${layer.preset.toUpperCase()}` : 'PAINT LAYER';
    if (layer.kind === 'fill') return 'FILL / BASE COLOR';
    if (layer.kind === 'text') return 'EDITABLE TEXT DECAL';
    if (layer.kind === 'svg') return `SVG DECAL${layer.svgName ? ` · ${escapeHtml(layer.svgName)}` : ''}`;
    return layer.preset ? `MATERIAL · ${escapeHtml(layer.preset.toUpperCase())}` : 'MATERIAL EFFECT';
  }

  function renderLayers() {
    const filtered = state.layers.filter((layer) => {
      const matchesFilter = state.layerFilter === 'all' || layerCategory(layer) === state.layerFilter;
      const matchesSearch = !state.layerSearch || layer.name.toLowerCase().includes(state.layerSearch.toLowerCase());
      return matchesFilter && matchesSearch;
    });
    $('#layerCount').textContent = String(state.layers.length).padStart(2, '0');
    $('#visibleCount').textContent = String(visibleLayerCount()).padStart(2, '0');
    if (!state.collectionOpen) {
      layerList.classList.add('collapsed');
    } else {
      layerList.classList.remove('collapsed');
    }
    if (!filtered.length) {
      layerList.innerHTML = '<div class="layer-empty">No layers match this view.</div>';
      return;
    }
    layerList.innerHTML = filtered.map((layer) => {
      const selected = layer.id === state.activeLayerId;
      const accent = layer.kind === 'text' || layer.kind === 'svg' ? '#d0a376' : layer.kind === 'fill' ? '#9ba5a0' : layer.kind === 'fx' ? '#bfbbab' : '#a6b79a';
      const visibilityIcon = layer.visible ? icon('eye') : icon('eyeOff');
      const lockIcon = layer.locked ? icon('lock') : icon('unlock');
      const thumbStyle = layer.color ? `style="--layer-accent:${escapeHtml(layer.color)}"` : `style="--layer-accent:${accent}"`;
      return `<div class="layer-row${selected ? ' selected' : ''}${layer.visible ? '' : ' hidden-layer'}${layer.locked ? ' locked-layer' : ''}" role="option" aria-selected="${selected}" draggable="true" data-layer-id="${escapeHtml(layer.id)}" ${thumbStyle}>
        <span class="layer-grip" title="Drag to reorder">⠿</span>
        <span class="layer-thumb">${layerIcon(layer)}</span>
        <span class="layer-main"><span class="layer-name-line"><span class="layer-name">${escapeHtml(layer.name)}</span><span class="layer-opacity-label">${Math.round(layer.opacity * 100)}%</span></span><span class="layer-kind">${layerTypeLabel(layer)}</span></span>
        <span class="layer-row-actions">
          <button class="icon-button" data-layer-action="visibility" data-layer-id="${escapeHtml(layer.id)}" title="${layer.visible ? 'Hide' : 'Show'} layer" aria-label="${layer.visible ? 'Hide' : 'Show'} ${escapeHtml(layer.name)}">${visibilityIcon}</button>
          <button class="icon-button" data-layer-action="lock" data-layer-id="${escapeHtml(layer.id)}" title="${layer.locked ? 'Unlock' : 'Lock'} layer" aria-label="${layer.locked ? 'Unlock' : 'Lock'} layer">${lockIcon}</button>
          <button class="icon-button" data-layer-action="menu" data-layer-id="${escapeHtml(layer.id)}" title="Layer options" aria-label="Options for ${escapeHtml(layer.name)}">${icon('more')}</button>
        </span>
      </div>`;
    }).join('');
  }

  function slider(label, key, value, min, max, step, output, suffix = '', attribute = 'data-brush') {
    const numeric = Number(value);
    const progress = ((numeric - Number(min)) / (Number(max) - Number(min))) * 100;
    return `<label class="range-control"><span><span>${label}</span><output data-out="${key}">${output ?? `${numeric}${suffix}`}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${numeric}" ${attribute}="${key}" style="--range-progress:${progress}%" aria-label="${label}" /></label>`;
  }

  function selectedLayerCard(layer) {
    if (!layer) return '<div class="property-empty">Select a layer to edit its opacity, blend mode, and lock state.</div>';
    const kindName = layer.kind === 'paint' ? 'Paint layer' : layer.kind === 'text' ? 'Text decal' : layer.kind === 'svg' ? 'SVG decal' : layer.kind === 'fill' ? 'Fill surface' : 'Surface effect';
    return `<div class="layer-property-card">
      <div class="layer-property-head"><span class="layer-property-icon">${layerIcon(layer)}</span><span><b>${escapeHtml(layer.name)}</b><small>${kindName}${layer.locked ? ' · locked' : ''}</small></span></div>
      ${slider('Layer opacity', 'layer-opacity', Math.round(layer.opacity * 100), 0, 100, 1, `${Math.round(layer.opacity * 100)}%`, '', 'data-layer-field')}
      <label class="range-control"><span><span>Blend mode</span></span><select class="blend-select" data-layer-field="blend" aria-label="Layer blend mode">
        <option value="source-over" ${layer.blend === 'source-over' ? 'selected' : ''}>Normal</option><option value="multiply" ${layer.blend === 'multiply' ? 'selected' : ''}>Multiply</option><option value="screen" ${layer.blend === 'screen' ? 'selected' : ''}>Screen</option><option value="overlay" ${layer.blend === 'overlay' ? 'selected' : ''}>Overlay</option><option value="soft-light" ${layer.blend === 'soft-light' ? 'selected' : ''}>Soft light</option>
      </select></label>
    </div>`;
  }

  function paintInspector() {
    const layer = activeLayer();
    const editable = layer && !layer.locked && (layer.kind === 'paint' || layer.kind === 'text' || layer.kind === 'svg');
    const colorRgb = hexToRgb(state.color);
    return `<div class="inspector-intro"><div><h3>Paint tool</h3><p>Fine control for every stroke</p></div><span class="inspector-badge"><i></i>LIVE</span></div>
      <section class="section-block">
        <div class="section-heading"><span>ACTIVE TOOL</span><button data-action="reset-brush">Reset</button></div>
        <div class="tool-choice-grid">
          <button class="tool-choice${state.tool === 'brush' ? ' active' : ''}" data-tool="brush">${icon('brush')}<span>Brush</span></button>
          <button class="tool-choice${state.tool === 'erase' ? ' active' : ''}" data-tool="erase">${icon('erase')}<span>Eraser</span></button>
          <button class="tool-choice${state.tool === 'orbit' ? ' active' : ''}" data-tool="orbit">${icon('orbit')}<span>Move / orbit</span></button>
          <button class="tool-choice${state.tool === 'sample' ? ' active' : ''}" data-tool="sample">${icon('sample')}<span>Sampler</span></button>
        </div>
      </section>
      <section class="section-block">
        <div class="section-heading"><span>BRUSH COLOR</span><span class="inspector-badge">${state.brush.preset.toUpperCase()}</span></div>
        <div class="color-row"><span class="color-swatch-shell"><input type="color" data-brush="color" value="${escapeHtml(state.color)}" aria-label="Brush color" /></span><span class="color-value"><label for="brushHex">Hex / sRGB</label><input class="hex-input" id="brushHex" data-brush-hex value="${escapeHtml(state.color.toUpperCase())}" maxlength="7" spellcheck="false" /></span><select class="blend-select" data-brush="blend" aria-label="Brush blend mode"><option value="source-over" ${state.brush.blend === 'source-over' ? 'selected' : ''}>Normal</option><option value="multiply" ${state.brush.blend === 'multiply' ? 'selected' : ''}>Multiply</option><option value="screen" ${state.brush.blend === 'screen' ? 'selected' : ''}>Screen</option><option value="overlay" ${state.brush.blend === 'overlay' ? 'selected' : ''}>Overlay</option><option value="soft-light" ${state.brush.blend === 'soft-light' ? 'selected' : ''}>Soft light</option></select></div>
        ${slider('Brush size', 'size', state.brush.size, 1, 240, 1, `${state.brush.size} px`)}
        ${slider('Flow', 'opacity', Math.round(state.brush.opacity * 100), 1, 100, 1, `${Math.round(state.brush.opacity * 100)}%`)}
        ${slider('Hardness', 'hardness', state.brush.hardness, 0, 100, 1, `${state.brush.hardness}%`)}
      </section>
      <section class="section-block">
        <div class="section-heading"><span>BRUSH PRESET</span><span>01 / 04</span></div>
        <div class="preset-pills">
          ${['Soft', 'Chalk', 'Ink', 'Grain'].map((name) => `<button class="preset-pill${state.brush.preset === name ? ' active' : ''}" data-brush-preset="${name}">${name}</button>`).join('')}
        </div>
        ${slider('Stroke spacing', 'spacing', state.brush.spacing, 1, 50, 1, `${state.brush.spacing}%`)}
        <label class="inline-toggle" style="margin-top:13px">Pen pressure affects size<input type="checkbox" data-brush="pressure" ${state.brush.pressure ? 'checked' : ''} /></label>
      </section>
      <section class="section-block">
        <div class="section-heading"><span>ACTIVE LAYER</span><button data-action="select-layer">Select</button></div>
        ${selectedLayerCard(layer)}
        ${layer && !editable ? '<div class="hint-card" style="margin-top:8px">This layer is protected. Add a paint layer or unlock it before painting.</div>' : ''}
      </section>
      <div class="hint-card">${icon('sparkle')}<span><strong>Quick tip</strong> — paint directly on the texture or switch to 3D preview to brush over the shaded surface.</span></div>`;
  }

  const materialPresets = {
    carbon: { name: 'Graphite / satin', baseColor: '#c5c8bf', roughness: 0.29, metalness: 0.68, clearcoat: 0.28, ior: 1.46, anisotropy: 0.32 },
    ceramic: { name: 'Porcelain / bone', baseColor: '#e4dfd2', roughness: 0.16, metalness: 0.04, clearcoat: 0.72, ior: 1.52, anisotropy: 0.06 },
    anodized: { name: 'Anodized / copper', baseColor: '#c58a5e', roughness: 0.24, metalness: 0.88, clearcoat: 0.36, ior: 1.48, anisotropy: 0.46 },
    polymer: { name: 'Polymer / field', baseColor: '#9eae9a', roughness: 0.62, metalness: 0.08, clearcoat: 0.12, ior: 1.42, anisotropy: 0.12 },
  };

  function materialInspector() {
    const material = state.material;
    const channels = [
      ['baseColor', 'Base color', '5 layers', 'image'],
      ['normal', 'Normal', 'Carbon weave', 'grid'],
      ['roughness', 'Roughness', 'Procedural', 'effect'],
      ['metallic', 'Metallic', 'Uniform map', 'fill'],
      ['height', 'Height / bump', 'Seam detail', 'svg'],
      ...state.extraChannels.map((key) => ({ emission: [key, 'Emission', 'Glow map', 'sparkle'], transmission: [key, 'Transmission', 'Surface tint', 'effect'], coat: [key, 'Coat roughness', 'Clearcoat map', 'grid'] }[key]).filter(Boolean)),
    ];
    return `<div class="inspector-intro"><div><h3>Surface material</h3><p>Physically based · metal / roughness</p></div><span class="inspector-badge">PBR</span></div>
      <section class="section-block">
        <div class="material-summary"><div class="material-orb"></div><div class="material-summary-copy"><p class="eyebrow">ACTIVE SURFACE</p><input class="material-name-input" data-material="name" value="${escapeHtml(material.name)}" aria-label="Material name" maxlength="32" /><p>Principled surface · sRGB</p></div><span class="material-id">M.01</span></div>
        <div class="pbr-mode-row"><span>Shading workflow</span><select class="setting-select" data-material="workflow" aria-label="Shading workflow"><option selected>Metallic / roughness</option><option>Specular / glossiness</option></select></div>
      </section>
      <section class="section-block">
        <div class="section-heading"><span>PRESET LIBRARY</span><button data-action="material-more">Browse all</button></div>
        <div class="swatch-presets">${Object.entries(materialPresets).map(([key, preset]) => `<button class="material-preset${material.preset === key ? ' active' : ''}" data-material-preset="${key}" aria-pressed="${material.preset === key}"><span class="material-swatch"></span><span>${key === 'anodized' ? 'Anodized' : key[0].toUpperCase() + key.slice(1)}</span></button>`).join('')}</div>
      </section>
      <section class="section-block">
        <div class="section-heading"><span>BASE SURFACE</span><span>LINEAR</span></div>
        <div class="surface-base-row"><label class="surface-base-chip"><input type="color" data-material="baseColor" value="${escapeHtml(material.baseColor)}" aria-label="Material base color" /><span>Base tint</span><span class="hex-mini" id="materialHex">${escapeHtml(material.baseColor.toUpperCase())}</span></label><button class="icon-button" data-action="reset-base-color" title="Reset base tint" aria-label="Reset base tint">${icon('close')}</button></div>
      </section>
      <section class="section-block">
        <div class="section-heading"><span>SURFACE RESPONSE</span><span>0 – 1</span></div>
        ${slider('Roughness', 'roughness', material.roughness, 0, 1, 0.01, material.roughness.toFixed(2), '', 'data-material')}
        ${slider('Metalness', 'metalness', material.metalness, 0, 1, 0.01, material.metalness.toFixed(2), '', 'data-material')}
        <div class="material-param-row">
          ${slider('Clear coat', 'clearcoat', material.clearcoat, 0, 1, 0.01, material.clearcoat.toFixed(2), '', 'data-material')}
          ${slider('IOR', 'ior', material.ior, 1, 2.5, 0.01, material.ior.toFixed(2), '', 'data-material')}
        </div>
        ${slider('Anisotropy', 'anisotropy', material.anisotropy, 0, 1, 0.01, material.anisotropy.toFixed(2), '', 'data-material')}
        ${slider('Normal strength', 'normalScale', material.normalScale, 0, 2, 0.01, material.normalScale.toFixed(2), '', 'data-material')}
      </section>
      <section class="section-block">
        <div class="section-heading"><span>TEXTURE CHANNELS</span><button data-action="channel-help">${5 + state.extraChannels.length} channels</button></div>
        <div class="channel-list">${channels.map(([key, label, source, channelIcon]) => `<button class="channel-row${state.channels[key] ? '' : ' off'}" data-channel="${key}" aria-pressed="${state.channels[key]}"><span class="channel-thumb">${icon(channelIcon)}</span><span class="channel-name">${label}</span><span class="channel-source">${source}</span><span class="channel-state">${state.channels[key] ? icon('eye') : icon('eyeOff')}</span></button>`).join('')}</div>
        <button class="add-channel-button" data-action="add-channel">${icon('plus')}Add material channel</button>
        <div class="material-note"><strong>Layer-driven surface.</strong> Color layers feed the base map; procedural roughness and carbon normal stay live.</div>
      </section>`;
  }

  function selectedDecalInspector(layer) {
    if (!layer || !['text', 'svg'].includes(layer.kind)) {
      return `<div class="property-empty">Choose a text or SVG layer in the stack to adjust its content and transform.</div>`;
    }
    const isText = layer.kind === 'text';
    const data = layer.textData || layer.decalData || {};
    return `<div class="selected-decal-card">
      <div class="selected-decal-top"><span class="selected-decal-thumb">${isText ? 'T' : '◇'}</span><span><b>${escapeHtml(layer.name)}</b><small>${isText ? 'Live text · editable' : `Vector artwork · ${escapeHtml(layer.svgName || 'Imported SVG')}`}</small></span><span class="material-id">${isText ? 'TYPE' : 'SVG'}</span></div>
      ${isText ? `<label class="field-label" for="decalContentInput">Content</label><input id="decalContentInput" class="decal-text-input" data-decal-field="text" value="${escapeHtml(data.text || '')}" maxlength="36" />
        <div class="dialog-fields-row" style="grid-template-columns:1fr 54px;margin-top:9px"><label class="dialog-field"><span class="field-label">Typeface</span><select class="setting-select" style="width:100%" data-decal-field="font"><option ${data.font === 'DM Sans' ? 'selected' : ''}>DM Sans</option><option ${data.font === 'Arial' ? 'selected' : ''}>Arial</option><option ${data.font === 'Georgia' ? 'selected' : ''}>Georgia</option><option ${data.font === 'monospace' ? 'selected' : ''}>monospace</option></select></label><label class="dialog-field"><span class="field-label">Ink</span><input type="color" style="width:100%;height:29px;padding:3px;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:#0b0c0b" data-decal-field="color" value="${escapeHtml(data.color || '#e4dfd3')}" /></label></div>` : `<p class="decal-asset-note">This decal is imported as a scalable vector layer. The original SVG is embedded with the project.</p>`}
      <div class="decal-transform-row">
        ${slider('Scale', 'decal-size', isText ? Math.round((data.size || 180) / SIZE * 100) : Math.round((data.width || 420) / SIZE * 100), 8, 62, 1, `${isText ? Math.round((data.size || 180) / SIZE * 100) : Math.round((data.width || 420) / SIZE * 100)}%`, '', 'data-decal-transform')}
        ${slider('Rotation', 'decal-rotation', Math.round(data.rotation || 0), -180, 180, 1, `${Math.round(data.rotation || 0)}°`, '', 'data-decal-transform')}
      </div>
      <div class="decal-asset-note" style="margin-top:10px">Select <strong>Move / orbit</strong> and drag on the canvas to reposition this mark.</div>
    </div>`;
  }

  function decalInspector() {
    const layer = activeLayer();
    return `<div class="inspector-intro"><div><h3>Decal studio</h3><p>Editable type &amp; vector marks</p></div><span class="inspector-badge">ALPHA</span></div>
      <section class="section-block">
        <div class="section-heading"><span>ADD ARTWORK</span><span>SVG / TYPE</span></div>
        <div class="decal-dropzone" id="svgDropzone"><span class="dropzone-icon">${icon('svg')}</span><strong>Drop an SVG decal here</strong><p>Clean vector paths stay crisp at any scale.</p><button class="button secondary-button" data-action="import-svg">${icon('plus')}Import SVG</button></div>
        <div class="decal-action-row"><button class="decal-action" data-action="add-text"><span>${icon('text')}</span><span><b>New type</b><small>Editable lettering</small></span></button><button class="decal-action" data-action="add-stamp"><span>${icon('sparkle')}</span><span><b>Make a mark</b><small>Roundel / insignia</small></span></button></div>
      </section>
      <section class="section-block">
        <div class="section-heading"><span>MARK LIBRARY</span><button data-action="import-svg">Import +</button></div>
        <div class="asset-grid">
          <button class="asset-card" data-decal-preset="roundel"><span class="asset-roundel">N</span><span>Roundel</span></button>
          <button class="asset-card" data-decal-preset="bolt">${icon('sparkle')}<span>Signal</span></button>
          <button class="asset-card" data-decal-preset="index"><span style="font:15px Georgia,serif;letter-spacing:-1px">N°04</span><span>Index</span></button>
        </div>
      </section>
      <section class="section-block">
        <div class="section-heading"><span>SELECTED DECAL</span><span>${layer && ['text', 'svg'].includes(layer.kind) ? 'ACTIVE' : '—'}</span></div>
        ${selectedDecalInspector(layer)}
      </section>
      <section class="section-block">
        <div class="section-heading"><span>PLACEMENT</span></div>
        ${selectedLayerCard(layer)}
      </section>`;
  }

  function updateInspectorHeader() {
    const headers = {
      paint: ['Brush settings', 'Shape, color & stroke behavior'],
      material: ['Material system', 'Physically based surface model'],
      decals: ['Decal library', 'SVG, lettering & surface marks'],
    };
    const [title, subtitle] = headers[state.mode];
    $('#inspectorTitle').textContent = title;
    $('#inspectorSubtitle').textContent = subtitle;
  }

  function renderInspector() {
    updateInspectorHeader();
    if (state.mode === 'material') inspectorContent.innerHTML = materialInspector();
    else if (state.mode === 'decals') inspectorContent.innerHTML = decalInspector();
    else inspectorContent.innerHTML = paintInspector();
    $$('input[type="range"]', inspectorContent).forEach(updateSliderPaint);
  }

  function renderAll() {
    renderLayers();
    renderInspector();
    updateNav();
    updateViewControls();
    updateLayerStatus();
    updateUndoButtons();
    requestRender();
    updateBrushCursorSize();
  }

  function updateNav() {
    $$('[data-mode]').forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function updateViewControls() {
    $$('[data-view]').forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    artboardShell.dataset.view = state.view;
    $('#viewTitle').textContent = state.view === 'texture' ? 'Texture view' : '3D preview';
    $('#viewSubtitle').innerHTML = state.view === 'texture' ? 'Body shell <span>·</span> UV map 01' : 'Principled material <span>·</span> live shaded';
    $('#canvasContext').innerHTML = state.view === 'texture' ? 'UV 01 <b>/</b> Body shell' : `MATERIAL <b>/</b> ${escapeHtml(state.material.name)}`;
    $('#viewModeIndicator').textContent = state.view === 'texture' ? '2D TEXTURE SPACE' : 'LIVE MATERIAL PREVIEW';
    $('#canvasModeText').textContent = state.view === 'texture' ? 'Direct UV paint' : 'Projected 3D paint';
    $('#statusMessage').innerHTML = state.view === 'texture' ? 'Drag to paint <kbd>B</kbd><span class="status-bullet">·</span> Scroll to zoom' : 'Drag to paint on the sphere <span class="status-bullet">·</span> Scroll to zoom';
    $('#guidesButton').classList.toggle('active', state.guides);
    $('#guidesButton').setAttribute('aria-pressed', String(state.guides));
    $('#zoomReadout').textContent = `${Math.round(state.zoom)}%`;
    artboardShell.style.transform = `translate(-50%,-50%) scale(${state.zoom / 100})`;
  }

  function updateLayerStatus() {
    const layer = activeLayer();
    $('#activeLayerStatus').textContent = layer ? layer.name.toUpperCase() : 'NO ACTIVE LAYER';
    $('#brushStatus').textContent = `${state.brush.size} px / ${Math.round(state.brush.opacity * 100)}%`;
    updateBrushCursorSize();
  }

  function updateUndoButtons() {
    $('#undoButton').disabled = state.undoStack.length === 0;
    $('#redoButton').disabled = state.redoStack.length === 0;
  }

  function updateSaveState(status, label) {
    const saveState = $('#saveState');
    saveState.classList.remove('saving', 'unsaved');
    if (status === 'saving') saveState.classList.add('saving');
    if (status === 'unsaved') saveState.classList.add('unsaved');
    $('#saveLabel').textContent = label;
    $('#dirtyMark').classList.toggle('visible', status === 'unsaved' || status === 'saving');
  }

  function showToast(message, duration = 2400) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, duration);
  }

  function togglePopover(popover, button) {
    const willOpen = popover.hidden;
    closePopovers();
    if (willOpen) {
      popover.hidden = false;
      if (button) button.setAttribute('aria-expanded', 'true');
    }
  }

  function closePopovers() {
    ['exportMenu', 'addLayerMenu', 'contextMenu'].forEach((id) => { $(`#${id}`).hidden = true; });
    $('#exportMenuToggle').setAttribute('aria-expanded', 'false');
    $('#layerMenuToggle').setAttribute('aria-expanded', 'false');
  }

  function showContextMenu(layerId, button) {
    const layer = getLayer(layerId);
    if (!layer) return;
    closePopovers();
    state.contextLayerId = layerId;
    const menu = $('#contextMenu');
    menu.innerHTML = `<button data-context-action="duplicate">${icon('duplicate')}<span><b>Duplicate layer</b></span></button><button data-context-action="rename">${icon('text')}<span><b>Rename layer</b></span></button><button data-context-action="top">${icon('move')}<span><b>Move to top</b></span></button><div class="popover-rule"></div><button class="danger" data-context-action="delete">${icon('delete')}<span><b>Delete layer</b></span></button>`;
    const rect = button.getBoundingClientRect();
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 184)}px`;
    menu.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 180)}px`;
    menu.hidden = false;
  }

  function setMode(mode) {
    if (!['paint', 'material', 'decals'].includes(mode)) return;
    const sameMode = state.mode === mode;
    state.mode = mode;
    updateNav();
    renderInspector();
    if (window.matchMedia('(max-width: 820px)').matches) {
      const panel = $('.inspector-panel');
      if (sameMode && panel.classList.contains('mobile-open')) panel.classList.remove('mobile-open');
      else panel.classList.add('mobile-open');
    }
  }

  function setView(view) {
    if (!['texture', 'model'].includes(view)) return;
    state.view = view;
    updateViewControls();
    updateBrushCursorSize();
    requestRender();
  }

  function setTool(tool) {
    if (!['brush', 'erase', 'orbit', 'sample'].includes(tool)) return;
    state.tool = tool;
    $$('[data-tool]').forEach((button) => button.classList.toggle('selected', button.dataset.tool === tool));
    if (state.mode === 'paint') renderInspector();
    updateBrushCursorSize();
    const label = { brush: 'Brush', erase: 'Eraser', orbit: state.view === 'model' ? 'Orbit view' : 'Move decal', sample: 'Color sampler' }[tool];
    $('#statusMessage').innerHTML = tool === 'brush' ? (state.view === 'texture' ? 'Drag to paint <kbd>B</kbd><span class="status-bullet">·</span> Scroll to zoom' : 'Drag to paint on the sphere <span class="status-bullet">·</span> Scroll to zoom') : `${label} selected <span class="status-bullet">·</span> Esc to return to brush`;
  }

  function updateSliderPaint(input) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value || 0);
    input.style.setProperty('--range-progress', `${((value - min) / Math.max(1, max - min)) * 100}%`);
  }

  function updateOutput(key, text) {
    const output = $(`[data-out="${key}"]`, inspectorContent);
    if (output) output.textContent = text;
  }

  function updateBrushCursorSize() {
    const rect = paintCanvas.getBoundingClientRect();
    const zoom = Math.max(.01, state.zoom / 100);
    const multiplier = state.view === 'model' ? MODEL_RADIUS * 2 : 1;
    const px = state.brush.size * rect.width / SIZE / zoom * multiplier;
    brushCursor.style.width = `${Math.max(4, px)}px`;
    brushCursor.style.height = `${Math.max(4, px)}px`;
    brushCursor.style.borderColor = state.tool === 'erase' ? 'rgba(228,164,145,.9)' : 'rgba(243,244,235,.88)';
  }

  function updateCursorFromEvent(event, valid = true) {
    if (state.tool === 'orbit' || state.tool === 'sample' || !valid) {
      brushCursor.style.display = 'none';
      return;
    }
    const boardRect = artboardShell.getBoundingClientRect();
    const zoom = Math.max(.01, state.zoom / 100);
    brushCursor.style.left = `${(event.clientX - boardRect.left) / zoom}px`;
    brushCursor.style.top = `${(event.clientY - boardRect.top) / zoom}px`;
    brushCursor.style.display = 'block';
  }

  function composeLayers() {
    const ctx = compositeContext;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, SIZE, SIZE);
    for (let index = state.layers.length - 1; index >= 0; index -= 1) {
      const layer = state.layers[index];
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.globalAlpha = clamp(layer.opacity, 0, 1);
      ctx.globalCompositeOperation = layer.blend || 'source-over';
      ctx.drawImage(layer.canvas, 0, 0, SIZE, SIZE);
    }
    ctx.restore();
    return compositeCanvas;
  }

  function renderTextureGuides(ctx) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(215,224,207,.2)';
    ctx.setLineDash([8, 8]);
    ctx.strokeRect(48, 48, SIZE - 96, SIZE - 96);
    ctx.beginPath(); ctx.moveTo(SIZE / 2, 0); ctx.lineTo(SIZE / 2, SIZE); ctx.moveTo(0, SIZE / 2); ctx.lineTo(SIZE, SIZE / 2); ctx.stroke();
    ctx.setLineDash([3, 8]);
    ctx.strokeStyle = 'rgba(215,224,207,.11)';
    ctx.beginPath(); ctx.moveTo(0, SIZE * .25); ctx.lineTo(SIZE, SIZE * .25); ctx.moveTo(0, SIZE * .75); ctx.lineTo(SIZE, SIZE * .75); ctx.moveTo(SIZE * .25, 0); ctx.lineTo(SIZE * .25, SIZE); ctx.moveTo(SIZE * .75, 0); ctx.lineTo(SIZE * .75, SIZE); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(221,226,215,.58)';
    ctx.font = '18px DM Sans, sans-serif';
    ctx.fillText('U 0.00', 18, SIZE - 18);
    ctx.textAlign = 'right';
    ctx.fillText('U 1.00', SIZE - 18, SIZE - 18);
    ctx.restore();
  }

  function renderModelPreview(textureCanvas) {
    const textureContext = textureCanvas.getContext('2d', { willReadFrequently: true });
    let pixels;
    try { pixels = textureContext.getImageData(0, 0, SIZE, SIZE).data; } catch (_error) { return; }
    const result = modelContext.createImageData(MODEL_BUFFER_SIZE, MODEL_BUFFER_SIZE);
    const output = result.data;
    const center = MODEL_BUFFER_SIZE / 2;
    const radius = MODEL_BUFFER_SIZE * MODEL_RADIUS;
    const mat = hexToRgb(state.material.baseColor).map((value) => value / 255);
    const light = [-0.42, -0.52, 0.74];
    const lightLength = Math.hypot(...light);
    light[0] /= lightLength; light[1] /= lightLength; light[2] /= lightLength;
    const half = [light[0] * .48, light[1] * .48, light[2] * .48 + .5];
    const halfLength = Math.hypot(...half);
    half[0] /= halfLength; half[1] /= halfLength; half[2] /= halfLength;
    const roughness = clamp(state.material.roughness, 0.035, 1);
    const metalness = clamp(state.material.metalness, 0, 1);
    const clearcoat = clamp(state.material.clearcoat, 0, 1);
    const anisotropy = clamp(state.material.anisotropy, 0, 1);
    const ior = clamp(state.material.ior, 1, 2.5);
    const dielectricF0 = Math.pow((ior - 1) / (ior + 1), 2);
    const rotation = state.material.modelRotation || 0;
    const rotationU = rotation / TWO_PI;
    const uvEnabled = state.channels.baseColor;
    const metallic = state.channels.metallic ? metalness : 0;
    const transmissionEnabled = Boolean(state.channels.transmission);
    const emissionEnabled = Boolean(state.channels.emission);
    const coatMapEnabled = Boolean(state.channels.coat);
    const cosRotation = Math.cos(rotation);
    const sinRotation = Math.sin(rotation);
    const normalEnabled = state.channels.normal;
    const heightEnabled = state.channels.height;
    const roughnessEnabled = state.channels.roughness;
    const mapLum = (x, y) => {
      const wrappedX = (x + SIZE) % SIZE;
      const wrappedY = clamp(y, 0, SIZE - 1);
      const sampleIndex = (wrappedY * SIZE + wrappedX) * 4;
      return (pixels[sampleIndex] * .2126 + pixels[sampleIndex + 1] * .7152 + pixels[sampleIndex + 2] * .0722) / 255;
    };

    for (let py = 0; py < MODEL_BUFFER_SIZE; py += 1) {
      const ny = (center - py) / radius;
      for (let px = 0; px < MODEL_BUFFER_SIZE; px += 1) {
        const nx = (px - center) / radius;
        const squared = nx * nx + ny * ny;
        const offset = (py * MODEL_BUFFER_SIZE + px) * 4;
        if (squared > 1) { output[offset + 3] = 0; continue; }
        const nz = Math.sqrt(1 - squared);
        let u = .5 + Math.atan2(nx * cosRotation + nz * sinRotation, nz * cosRotation - nx * sinRotation) / TWO_PI - rotationU * .08;
        u = ((u % 1) + 1) % 1;
        const v = clamp(.5 - Math.asin(ny) / Math.PI, 0, 1);
        const tx = Math.min(SIZE - 1, Math.floor(u * SIZE));
        const ty = Math.min(SIZE - 1, Math.floor(v * SIZE));
        const sample = (ty * SIZE + tx) * 4;
        const luminance = (pixels[sample] * .2126 + pixels[sample + 1] * .7152 + pixels[sample + 2] * .0722) / 255;

        // Derive lightweight normal and roughness response from the texture detail maps.
        let nxShade = nx; let nyShade = ny; let nzShade = nz;
        if (normalEnabled || heightEnabled) {
          const step = 5;
          const gradientX = mapLum(tx + step, ty) - mapLum(tx - step, ty);
          const gradientY = mapLum(tx, ty + step) - mapLum(tx, ty - step);
          const bumpScale = (normalEnabled ? state.material.normalScale * .72 : 0) + (heightEnabled ? .28 : 0);
          nxShade -= gradientX * bumpScale;
          nyShade -= gradientY * bumpScale;
          const normalLength = Math.hypot(nxShade, nyShade, nzShade);
          nxShade /= normalLength; nyShade /= normalLength; nzShade /= normalLength;
        }
        const localRoughness = roughnessEnabled ? clamp(roughness + (.5 - luminance) * .13, .035, 1) : roughness;
        const localClearcoat = coatMapEnabled ? clearcoat * (.58 + luminance * .72) : clearcoat;
        const power = 5 + Math.pow(1 - localRoughness, 2) * 180;
        const dot = Math.max(0, nxShade * light[0] + nyShade * light[1] + nzShade * light[2]);
        const halfDot = clamp(nxShade * half[0] + nyShade * half[1] + nzShade * half[2] + anisotropy * (1 - Math.abs(nyShade)) * .07, 0, 1);
        const spec = Math.pow(halfDot, power) * (.12 + dielectricF0 * 2.5 + metalness * .3 + localClearcoat * .45);
        const diffuse = .17 + dot * (0.79 - metallic * .38) + (transmissionEnabled ? .08 : 0);
        const shade = diffuse;
        const rim = Math.pow(1 - nz, 3) * .15;
        for (let channel = 0; channel < 3; channel += 1) {
          const source = uvEnabled ? pixels[sample + channel] / 255 : 0.46;
          const baseTint = state.channels.baseColor ? mat[channel] : 1;
          const metalTint = source * baseTint * (0.28 + shade * .78);
          const dielect = source * baseTint * shade;
          const dielectricSpec = .55 + dielectricF0 * 5;
          const specColor = dielectricSpec + metallic * (source * baseTint - dielectricSpec);
          const emission = emissionEnabled ? (pixels[sample + channel] / 255) * mat[channel] * .12 : 0;
          output[offset + channel] = clamp((metallic * metalTint + (1 - metallic) * dielect + spec * specColor + rim * baseTint + emission) * 255, 0, 255);
        }
        output[offset + 3] = 255;
      }
    }
    modelContext.putImageData(result, 0, 0);
  }

  function renderStage() {
    const texture = composeLayers();
    displayContext.save();
    displayContext.globalAlpha = 1;
    displayContext.globalCompositeOperation = 'source-over';
    displayContext.clearRect(0, 0, SIZE, SIZE);
    if (state.view === 'texture') {
      displayContext.drawImage(texture, 0, 0);
      if (state.guides) renderTextureGuides(displayContext);
    } else {
      renderModelPreview(texture);
      displayContext.drawImage(modelCanvas, 0, 0, SIZE, SIZE);
    }
    displayContext.restore();
  }

  function requestRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      renderStage();
    });
  }

  function screenToTexture(event) {
    const rect = paintCanvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const y = (event.clientY - rect.top) / Math.max(1, rect.height);
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    if (state.view === 'texture') return { x: x * SIZE, y: y * SIZE, u: x, v: y };
    const nx = (x - .5) / MODEL_RADIUS;
    const ny = (.5 - y) / MODEL_RADIUS;
    const squared = nx * nx + ny * ny;
    if (squared > 1) return null;
    const nz = Math.sqrt(1 - squared);
    const rotation = state.material.modelRotation || 0;
    let u = .5 + Math.atan2(nx * Math.cos(rotation) + nz * Math.sin(rotation), nz * Math.cos(rotation) - nx * Math.sin(rotation)) / TWO_PI - rotation / TWO_PI * .08;
    u = ((u % 1) + 1) % 1;
    const v = clamp(.5 - Math.asin(ny) / Math.PI, 0, 1);
    return { x: u * SIZE, y: v * SIZE, u, v, sphere: true };
  }

  function cloneLayerCanvas(canvas) {
    const copy = canvasOf(canvas.width, canvas.height);
    copy.getContext('2d').drawImage(canvas, 0, 0);
    return copy;
  }

  function applyBrushPoint(layer, point, previous, pressure = 1) {
    const ctx = layer.canvas.getContext('2d');
    const effectivePressure = state.brush.pressure ? clamp(pressure, .25, 1.35) : 1;
    const opacity = clamp(state.brush.opacity * effectivePressure, 0.01, 1);
    const size = Math.max(1, state.brush.size * effectivePressure);
    const hardness = state.brush.preset === 'Ink' ? 100 : state.brush.preset === 'Chalk' ? Math.min(state.brush.hardness, 78) : state.brush.preset === 'Grain' ? Math.min(state.brush.hardness, 55) : state.brush.hardness;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = state.tool === 'erase' ? 'destination-out' : state.brush.blend;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    ctx.strokeStyle = state.color;
    ctx.fillStyle = state.color;
    const soft = (100 - hardness) / 100;
    if (soft > 0.02 && state.tool !== 'erase') {
      ctx.shadowColor = state.color;
      ctx.shadowBlur = soft * size * .33;
    }
    if (state.brush.preset === 'Grain') {
      ctx.setLineDash([size * .35, Math.max(1, size * state.brush.spacing / 100)]);
    } else {
      ctx.setLineDash([]);
    }
    if (previous && Math.abs(point.x - previous.x) < SIZE * .5) {
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(point.x, point.y, size / 2, 0, TWO_PI);
      ctx.fill();
    }
    ctx.restore();
  }

  function updateCoordinates(point) {
    if (!point) return;
    $('#coordIndicator').innerHTML = `U ${point.u.toFixed(2)} <i>·</i> V ${point.v.toFixed(2)}`;
  }

  function pointerDown(event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const point = screenToTexture(event);
    updateCursorFromEvent(event, Boolean(point));
    updateCoordinates(point);
    if (state.tool === 'sample') {
      if (point) sampleColor(point);
      event.preventDefault();
      return;
    }
    if (state.tool === 'orbit') {
      if (state.view === 'model') {
        state.isRotating = true;
        state.lastDragPoint = { x: event.clientX, y: event.clientY };
      } else {
        const layer = activeLayer();
        if (point && layer && ['text', 'svg'].includes(layer.kind) && !layer.locked) {
          state.isMovingDecal = true;
          state.lastDragPoint = point;
          state.movingLayerId = layer.id;
        }
      }
      if (state.isRotating || state.isMovingDecal) {
        try { paintCanvas.setPointerCapture(event.pointerId); } catch (_error) { /* Pointer capture is optional. */ }
        event.preventDefault();
      }
      return;
    }
    if (!['brush', 'erase'].includes(state.tool) || !point) return;
    const layer = activeLayer();
    if (!layer || layer.locked || !['paint', 'text', 'svg'].includes(layer.kind)) {
      showToast('Select or add an unlocked paint layer to paint.');
      return;
    }
    state.stroke = { id: layer.id, before: cloneLayerCanvas(layer.canvas), last: null, changed: false };
    try { paintCanvas.setPointerCapture(event.pointerId); } catch (_error) { /* Pointer capture is optional. */ }
    const pressure = event.pointerType === 'mouse' || !event.pressure ? 1 : event.pressure;
    applyBrushPoint(layer, point, null, pressure);
    state.stroke.last = point;
    state.stroke.changed = true;
    requestRender();
    event.preventDefault();
  }

  function pointerMove(event) {
    const point = screenToTexture(event);
    if (point) updateCoordinates(point);
    updateCursorFromEvent(event, Boolean(point));

    if (state.isRotating && state.lastDragPoint) {
      const rect = paintCanvas.getBoundingClientRect();
      const delta = (event.clientX - state.lastDragPoint.x) / Math.max(1, rect.width) * 5.3;
      state.material.modelRotation = (state.material.modelRotation || 0) + delta;
      state.lastDragPoint = { x: event.clientX, y: event.clientY };
      requestRender();
      return;
    }
    if (state.isMovingDecal && point) {
      const layer = getLayer(state.movingLayerId);
      if (!layer) return;
      const data = layer.kind === 'text' ? layer.textData : layer.decalData;
      if (data && state.lastDragPoint) {
        data.x += point.x - state.lastDragPoint.x;
        data.y += point.y - state.lastDragPoint.y;
        layer.kind === 'text' ? redrawTextLayer(layer) : redrawSvgLayer(layer);
        state.lastDragPoint = point;
        requestRender();
      }
      return;
    }
    if (!state.stroke) return;
    if (!point) { state.stroke.last = null; return; }
    const layer = getLayer(state.stroke.id);
    if (!layer) return;
    const pressure = event.pointerType === 'mouse' || !event.pressure ? 1 : event.pressure;
    applyBrushPoint(layer, point, state.stroke.last, pressure);
    state.stroke.last = point;
    state.stroke.changed = true;
    requestRender();
  }

  function pointerUp() {
    if (state.stroke) {
      const layer = getLayer(state.stroke.id);
      if (layer && state.stroke.changed) {
        state.undoStack.push({ id: layer.id, before: state.stroke.before, after: cloneLayerCanvas(layer.canvas) });
        if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
        state.redoStack.length = 0;
        updateUndoButtons();
        markDirty();
      }
      state.stroke = null;
    }
    if (state.isMovingDecal) {
      state.isMovingDecal = false;
      state.lastDragPoint = null;
      renderInspector();
      markDirty();
    }
    if (state.isRotating) {
      state.isRotating = false;
      state.lastDragPoint = null;
      markDirty();
    }
  }

  function sampleColor(point) {
    composeLayers();
    const x = clamp(Math.floor(point.x), 0, SIZE - 1);
    const y = clamp(Math.floor(point.y), 0, SIZE - 1);
    const data = compositeContext.getImageData(x, y, 1, 1).data;
    state.color = rgbToHex([data[0], data[1], data[2]]);
    state.tool = 'brush';
    setTool('brush');
    showToast(`Sampled ${state.color.toUpperCase()}`);
    if (state.mode === 'paint') renderInspector();
  }

  function undo() {
    const operation = state.undoStack.pop();
    if (!operation) return;
    const layer = getLayer(operation.id);
    if (!layer) return;
    const ctx = layer.canvas.getContext('2d');
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(operation.before, 0, 0);
    state.redoStack.push(operation);
    updateUndoButtons();
    requestRender();
    markDirty();
    showToast('Stroke undone');
  }

  function redo() {
    const operation = state.redoStack.pop();
    if (!operation) return;
    const layer = getLayer(operation.id);
    if (!layer) return;
    const ctx = layer.canvas.getContext('2d');
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(operation.after, 0, 0);
    state.undoStack.push(operation);
    updateUndoButtons();
    requestRender();
    markDirty();
    showToast('Stroke restored');
  }

  function insertLayer(layer) {
    const effectIndex = state.layers.findIndex((candidate) => candidate.kind === 'fx');
    state.layers.splice(effectIndex >= 0 ? effectIndex + 1 : 0, 0, layer);
    state.activeLayerId = layer.id;
    state.layerFilter = 'all';
    state.layerSearch = '';
    $('#layerSearch').value = '';
    $$('[data-layer-filter]').forEach((button) => { const active = button.dataset.layerFilter === 'all'; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    renderLayers();
    renderInspector();
    updateLayerStatus();
    requestRender();
    markDirty();
  }

  function addLayer(kind = 'paint') {
    let layer;
    if (kind === 'fill') {
      layer = makeLayer(`Fill · ${state.color.toUpperCase()}`, 'fill', { color: state.color });
      const ctx = layer.canvas.getContext('2d');
      ctx.fillStyle = state.color;
      ctx.fillRect(0, 0, SIZE, SIZE);
    } else {
      const count = state.layers.filter((candidate) => candidate.kind === 'paint').length + 1;
      layer = makeLayer(`Paint layer ${String(count).padStart(2, '0')}`, 'paint');
    }
    insertLayer(layer);
    setMode('paint');
    showToast(kind === 'fill' ? 'Fill layer added to the stack' : 'Paint layer added');
  }

  function duplicateLayer(id) {
    const source = getLayer(id);
    if (!source) return;
    const duplicate = makeLayer(`${source.name} copy`, source.kind, {
      visible: source.visible,
      locked: false,
      opacity: source.opacity,
      blend: source.blend,
      canvas: cloneLayerCanvas(source.canvas),
      color: source.color,
      textData: source.textData ? { ...source.textData } : null,
      svgMarkup: source.svgMarkup,
      svgName: source.svgName,
      svgData: source.svgData,
      decalData: source.decalData ? { ...source.decalData } : null,
      preset: source.preset,
    });
    const index = state.layers.indexOf(source);
    state.layers.splice(index, 0, duplicate);
    state.activeLayerId = duplicate.id;
    closePopovers();
    renderAll();
    markDirty();
    showToast('Layer duplicated');
  }

  function deleteLayer(id) {
    const index = state.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    if (state.layers.length <= 1) { showToast('A document needs at least one layer.'); return; }
    const [removed] = state.layers.splice(index, 1);
    if (state.activeLayerId === removed.id) state.activeLayerId = state.layers[Math.min(index, state.layers.length - 1)].id;
    state.undoStack = state.undoStack.filter((operation) => operation.id !== removed.id);
    state.redoStack = state.redoStack.filter((operation) => operation.id !== removed.id);
    closePopovers();
    renderAll();
    markDirty();
    showToast(`Removed “${removed.name}”`);
  }

  function moveLayerToTop(id) {
    const index = state.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    const [layer] = state.layers.splice(index, 1);
    const effectIndex = state.layers.findIndex((candidate) => candidate.kind === 'fx');
    state.layers.splice(effectIndex >= 0 ? effectIndex + 1 : 0, 0, layer);
    renderAll();
    closePopovers();
    markDirty();
  }

  function renameLayer(id) {
    const layer = getLayer(id);
    if (!layer) return;
    const name = window.prompt('Rename layer', layer.name);
    if (name && name.trim()) {
      layer.name = name.trim().slice(0, 48);
      renderAll();
      markDirty();
    }
    closePopovers();
  }

  function handleLayerAction(action, id) {
    const layer = getLayer(id);
    if (!layer) return;
    if (action === 'visibility') layer.visible = !layer.visible;
    if (action === 'lock') layer.locked = !layer.locked;
    if (action === 'menu') { showContextMenu(id, document.querySelector(`[data-layer-action="menu"][data-layer-id="${CSS.escape(id)}"]`)); return; }
    renderLayers();
    requestRender();
    updateLayerStatus();
    renderInspector();
    markDirty();
  }

  function reorderLayers(sourceId, targetId) {
    if (sourceId === targetId) return;
    const sourceIndex = state.layers.findIndex((layer) => layer.id === sourceId);
    const targetIndex = state.layers.findIndex((layer) => layer.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [source] = state.layers.splice(sourceIndex, 1);
    state.layers.splice(targetIndex, 0, source);
    renderAll();
    markDirty();
  }

  function redrawTextLayer(layer) {
    const ctx = layer.canvas.getContext('2d');
    ctx.clearRect(0, 0, SIZE, SIZE);
    drawTextArtwork(layer.canvas, layer.textData || {});
  }

  function redrawSvgLayer(layer) {
    if (layer.decalData?.stamp) {
      drawStampArtwork(layer);
      requestRender();
      return;
    }
    if (!layer.svgData) return;
    const image = new Image();
    image.onload = () => {
      const ctx = layer.canvas.getContext('2d');
      ctx.clearRect(0, 0, SIZE, SIZE);
      const data = layer.decalData || { x: SIZE / 2, y: SIZE / 2, width: 420, rotation: 0 };
      const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
      const width = data.width || 420;
      const height = width / ratio;
      ctx.save();
      ctx.translate(data.x ?? SIZE / 2, data.y ?? SIZE / 2);
      ctx.rotate((data.rotation || 0) * Math.PI / 180);
      ctx.drawImage(image, -width / 2, -height / 2, width, height);
      ctx.restore();
      requestRender();
    };
    image.onerror = () => showToast('Could not render this SVG decal.');
    image.src = layer.svgData;
  }

  function openTextModal() {
    $('#textModal').hidden = false;
    $('#decalText').focus();
    $('#decalText').select();
  }

  function closeModal(backdrop) {
    backdrop.hidden = true;
  }

  function createTextLayer({ text, color, font, scale }) {
    const size = Math.round(SIZE * Number(scale) / 100);
    const data = { text: text.trim().slice(0, 36), color, font, size, x: SIZE / 2, y: SIZE / 2, rotation: 0, align: 'center', weight: 500 };
    const layer = makeLayer(`Text · ${data.text}`, 'text', { textData: data });
    drawTextArtwork(layer.canvas, data);
    insertLayer(layer);
    setMode('decals');
    closeModal($('#textModal'));
    showToast('Editable text decal added');
  }

  function drawStampArtwork(layer) {
    const ctx = layer.canvas.getContext('2d');
    const { x, y, rotation = 0 } = layer.decalData;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.strokeStyle = layer.decalData.color || '#ded8c9';
    ctx.fillStyle = layer.decalData.color || '#ded8c9';
    ctx.lineWidth = Math.max(2, (layer.decalData.width || 300) / 50);
    const scale = (layer.decalData.width || 300) / 300;
    ctx.scale(scale, scale);
    if (layer.decalData.stamp === 'roundel') {
      ctx.beginPath(); ctx.arc(0, 0, 92, 0, TWO_PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 76, 0, TWO_PI); ctx.stroke();
      ctx.font = '500 86px DM Sans, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, -2);
      ctx.font = '400 15px DM Sans, sans-serif'; ctx.fillText('AERO / 04', 0, 47);
    } else if (layer.decalData.stamp === 'index') {
      ctx.font = '350 148px DM Sans, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N°04', 0, 0);
      ctx.fillRect(-110, 92, 220, 4);
    } else {
      ctx.beginPath(); ctx.moveTo(-80, -28); ctx.lineTo(9, -28); ctx.lineTo(39, -91); ctx.lineTo(58, -86); ctx.lineTo(35, -17); ctx.lineTo(90, -17); ctx.lineTo(-16, 91); ctx.lineTo(0, 23); ctx.lineTo(-67, 23); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawStamp(kind) {
    const layer = makeLayer(kind === 'roundel' ? 'Roundel · N' : kind === 'index' ? 'Index · N°04' : 'Signal mark', 'svg', {
      svgName: kind === 'roundel' ? 'Nacre roundel' : kind === 'index' ? 'Index mark' : 'Signal glyph',
      decalData: { x: SIZE / 2, y: SIZE / 2, width: 300, rotation: 0, stamp: kind },
    });
    drawStampArtwork(layer);
    insertLayer(layer);
    setMode('decals');
    showToast('Vector mark added as a new layer');
  }

  function sanitizeSvg(text) {
    const documentNode = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (documentNode.querySelector('parsererror') || documentNode.documentElement.nodeName.toLowerCase() !== 'svg') throw new Error('This file is not a valid SVG.');
    documentNode.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((node) => node.remove());
    documentNode.querySelectorAll('*').forEach((element) => {
      [...element.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on')) element.removeAttribute(attribute.name);
        if ((name === 'href' || name.endsWith(':href')) && /^(?:https?:|javascript:|\/\/)/i.test(value)) element.removeAttribute(attribute.name);
        if ((name === 'style' || name === 'fill' || name === 'stroke') && /url\s*\(\s*['"]?https?:/i.test(value)) element.removeAttribute(attribute.name);
      });
    });
    const svg = documentNode.documentElement;
    if (!svg.getAttribute('viewBox')) {
      const width = parseFloat(svg.getAttribute('width')) || 512;
      const height = parseFloat(svg.getAttribute('height')) || 512;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(svg);
  }

  function addSvgFile(file) {
    if (!file || (!/svg/i.test(file.type) && !file.name.toLowerCase().endsWith('.svg'))) return;
    if (file.size > 4 * 1024 * 1024) { showToast('SVG is too large. Keep decals under 4 MB.'); return; }
    file.text().then((raw) => {
      let markup;
      try { markup = sanitizeSvg(raw); } catch (error) { showToast(error.message || 'Invalid SVG file.'); return; }
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
      const image = new Image();
      image.onload = () => {
        const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
        const width = Math.min(510, SIZE * .55, 510 * ratio);
        const height = Math.min(510, width / ratio);
        const layer = makeLayer(file.name.replace(/\.svg$/i, '') || 'Imported SVG', 'svg', {
          svgName: file.name,
          svgMarkup: markup,
          svgData: dataUrl,
          decalData: { x: SIZE / 2, y: SIZE / 2, width, rotation: 0 },
        });
        const ctx = layer.canvas.getContext('2d');
        ctx.drawImage(image, SIZE / 2 - width / 2, SIZE / 2 - height / 2, width, height);
        insertLayer(layer);
        setMode('decals');
        showToast(`Imported ${file.name} as an editable decal layer`);
      };
      image.onerror = () => showToast('This SVG could not be decoded.');
      image.src = dataUrl;
    }).catch(() => showToast('Could not read the SVG file.'));
  }

  function setBrushPreset(name) {
    state.brush.preset = name;
    if (name === 'Soft') state.brush.hardness = 68;
    if (name === 'Chalk') state.brush.hardness = 48;
    if (name === 'Ink') state.brush.hardness = 100;
    if (name === 'Grain') state.brush.hardness = 38;
    renderInspector();
    updateLayerStatus();
    markDirty();
  }

  function applyMaterialPreset(key) {
    const preset = materialPresets[key];
    if (!preset) return;
    Object.assign(state.material, preset, { preset: key });
    renderInspector();
    requestRender();
    markDirty();
    showToast(`${preset.name} loaded`);
  }

  function handleBrushInput(input) {
    const key = input.dataset.brush;
    if (!key) return;
    if (key === 'color') {
      state.color = input.value;
      const hex = $('#brushHex', inspectorContent);
      if (hex) hex.value = state.color.toUpperCase();
    } else if (key === 'pressure') {
      state.brush.pressure = input.checked;
    } else if (key === 'opacity') {
      state.brush.opacity = Number(input.value) / 100;
      updateOutput(key, `${input.value}%`);
    } else if (key === 'size') {
      state.brush.size = Number(input.value);
      updateOutput(key, `${input.value} px`);
    } else if (key === 'hardness') {
      state.brush.hardness = Number(input.value);
      updateOutput(key, `${input.value}%`);
    } else if (key === 'spacing') {
      state.brush.spacing = Number(input.value);
      updateOutput(key, `${input.value}%`);
    } else if (key === 'blend') {
      state.brush.blend = input.value;
    }
    if (input.type === 'range') updateSliderPaint(input);
    updateLayerStatus();
    markDirty();
  }

  function handleMaterialInput(input) {
    const key = input.dataset.material;
    if (!key) return;
    if (key === 'name') {
      state.material.name = input.value.slice(0, 32);
      if (state.view === 'model') updateViewControls();
      markDirty();
      return;
    }
    if (key === 'workflow') {
      state.material.workflow = input.value;
      markDirty();
      return;
    }
    if (key === 'baseColor') {
      state.material.baseColor = input.value;
      const hex = $('#materialHex', inspectorContent);
      if (hex) hex.textContent = input.value.toUpperCase();
    } else {
      state.material[key] = Number(input.value);
      const outputValue = key === 'ior' ? Number(input.value).toFixed(2) : Number(input.value).toFixed(2);
      updateOutput(key, outputValue);
    }
    if (input.type === 'range') updateSliderPaint(input);
    requestRender();
    markDirty();
  }

  function handleLayerInput(input) {
    const layer = activeLayer();
    if (!layer) return;
    const key = input.dataset.layerField;
    if (key === 'layer-opacity' || key === 'opacity') {
      layer.opacity = Number(input.value) / 100;
      updateOutput('layer-opacity', `${input.value}%`);
      const row = $(`[data-layer-id="${CSS.escape(layer.id)}"]`, layerList);
      const label = row ? $('.layer-opacity-label', row) : null;
      if (label) label.textContent = `${input.value}%`;
    } else if (key === 'blend') {
      layer.blend = input.value;
    }
    if (input.type === 'range') updateSliderPaint(input);
    requestRender();
    markDirty();
  }

  function handleDecalInput(input) {
    const layer = activeLayer();
    if (!layer || !['text', 'svg'].includes(layer.kind)) return;
    if (input.dataset.decalField) {
      if (layer.kind === 'text') {
        const key = input.dataset.decalField;
        if (key === 'text') { layer.textData.text = input.value; layer.name = `Text · ${input.value || 'Untitled'}`; }
        if (key === 'font') layer.textData.font = input.value;
        if (key === 'color') layer.textData.color = input.value;
        redrawTextLayer(layer);
      }
    }
    if (input.dataset.decalTransform) {
      const key = input.dataset.decalTransform;
      const data = layer.kind === 'text' ? layer.textData : layer.decalData;
      if (key === 'decal-size') {
        if (layer.kind === 'text') data.size = Math.round(SIZE * Number(input.value) / 100);
        else data.width = Math.round(SIZE * Number(input.value) / 100);
        updateOutput(key, `${input.value}%`);
      } else if (key === 'decal-rotation') {
        data.rotation = Number(input.value);
        updateOutput(key, `${input.value}°`);
      }
      if (layer.kind === 'text') redrawTextLayer(layer);
      else redrawSvgLayer(layer);
      if (input.type === 'range') updateSliderPaint(input);
    }
    renderLayers();
    requestRender();
    markDirty();
  }

  function resetBrush() {
    state.brush = { size: 46, opacity: 0.76, hardness: 68, spacing: 12, preset: 'Soft', pressure: true, blend: 'source-over' };
    state.color = '#d5a16e';
    renderInspector();
    updateLayerStatus();
    markDirty();
    showToast('Brush settings reset');
  }

  function resetInspector() {
    if (state.mode === 'paint') { resetBrush(); return; }
    if (state.mode === 'material') {
      applyMaterialPreset(materialPresets[state.material.preset] ? state.material.preset : 'carbon');
      showToast('Surface values reset to the selected preset');
      return;
    }
    const layer = activeLayer();
    if (layer?.kind === 'text' && layer.textData) {
      layer.textData.x = SIZE / 2; layer.textData.y = SIZE / 2; layer.textData.rotation = 0;
      redrawTextLayer(layer);
    } else if (layer?.kind === 'svg' && layer.decalData) {
      layer.decalData.x = SIZE / 2; layer.decalData.y = SIZE / 2; layer.decalData.rotation = 0;
      redrawSvgLayer(layer);
    }
    if (layer) { layer.opacity = 1; renderAll(); markDirty(); showToast('Decal transform reset'); }
    else showToast('Select a decal layer to reset its transform.');
  }

  function updateZoom(delta) {
    state.zoom = clamp(state.zoom + delta, 35, 220);
    updateViewControls();
    updateBrushCursorSize();
  }

  function markDirty() {
    state.dirty = true;
    updateSaveState('unsaved', 'Unsaved changes');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveLocalDraft, 850);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open('nacre-texture-studio', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('documents')) request.result.createObjectStore('documents');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open local storage'));
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  function metadataForLayer(layer) {
    const { canvas, ...metadata } = layer;
    return metadata;
  }

  async function saveLocalDraft() {
    if (!state.db || !state.dirty) return;
    updateSaveState('saving', 'Saving locally…');
    try {
      const layers = await Promise.all(state.layers.map(async (layer) => ({ ...metadataForLayer(layer), pixels: await canvasToBlob(layer.canvas) })));
      const record = {
        version: 1,
        documentName: $('#documentName').value,
        layers,
        activeLayerId: state.activeLayerId,
        material: { ...state.material },
        channels: { ...state.channels },
        extraChannels: [...state.extraChannels],
        color: state.color,
        brush: { ...state.brush },
        savedAt: Date.now(),
      };
      await new Promise((resolve, reject) => {
        const transaction = state.db.transaction('documents', 'readwrite');
        transaction.objectStore('documents').put(record, 'active');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Save aborted'));
      });
      state.dirty = false;
      updateSaveState('saved', 'Saved locally');
    } catch (_error) {
      updateSaveState('unsaved', 'Local save unavailable');
    }
  }

  async function loadLocalDraft() {
    if (!state.db) return false;
    const record = await new Promise((resolve, reject) => {
      const transaction = state.db.transaction('documents', 'readonly');
      const request = transaction.objectStore('documents').get('active');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    if (!record || !Array.isArray(record.layers) || record.layers.length === 0) return false;
    await restoreRecord(record);
    return true;
  }

  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Layer image failed to load')); };
      image.src = url;
    });
  }

  async function restoreRecord(record) {
    if (!Array.isArray(record.layers) || record.layers.length > 60) throw new Error('Invalid project layer list.');
    const restored = [];
    for (const saved of record.layers) {
      const layer = makeLayer(saved.name || 'Layer', saved.kind || 'paint', { ...saved, canvas: canvasOf() });
      if (saved.pixels instanceof Blob) {
        const image = await blobToImage(saved.pixels);
        layer.canvas.getContext('2d').drawImage(image, 0, 0, SIZE, SIZE);
      } else if (typeof saved.canvasData === 'string') {
        const image = await imageFromData(saved.canvasData);
        layer.canvas.getContext('2d').drawImage(image, 0, 0, SIZE, SIZE);
      }
      restored.push(layer);
    }
    state.layers = restored;
    state.activeLayerId = restored.some((layer) => layer.id === record.activeLayerId) ? record.activeLayerId : restored[0].id;
    if (record.material) Object.assign(state.material, record.material);
    state.channels = { baseColor: true, normal: true, roughness: true, metallic: true, height: true, ...(record.channels || {}) };
    state.extraChannels = Array.isArray(record.extraChannels) ? [...record.extraChannels] : Object.keys(record.channels || {}).filter((key) => !['baseColor', 'normal', 'roughness', 'metallic', 'height'].includes(key));
    if (record.brush) Object.assign(state.brush, record.brush);
    if (record.color) state.color = record.color;
    if (record.documentName) $('#documentName').value = record.documentName;
    state.undoStack.length = 0;
    state.redoStack.length = 0;
    state.dirty = false;
    renderAll();
    updateSaveState('saved', 'Saved locally');
  }

  function imageFromData(data) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Project layer image could not be loaded.'));
      image.src = data;
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function safeFileStem() {
    return ($('#documentName').value || 'nacre-texture').trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'nacre-texture';
  }

  function exportPng() {
    composeLayers();
    compositeCanvas.toBlob((blob) => {
      if (!blob) { showToast('Could not render the PNG.'); return; }
      downloadBlob(blob, `${safeFileStem()}-1024.png`);
      showToast('Texture exported as a 1024 px PNG');
      updateSaveState('saved', 'Texture exported');
    }, 'image/png');
    closePopovers();
  }

  async function exportProject() {
    try {
      const layers = await Promise.all(state.layers.map(async (layer) => ({ ...metadataForLayer(layer), canvasData: await new Promise((resolve) => layer.canvas.toBlob((blob) => {
        if (!blob) { resolve(''); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      }, 'image/png')) })));
      const project = {
        format: 'nacre-paint-project', version: 1, size: SIZE,
        documentName: $('#documentName').value,
        activeLayerId: state.activeLayerId,
        layers,
        material: state.material,
        channels: state.channels,
        extraChannels: state.extraChannels,
        brush: state.brush,
        color: state.color,
      };
      const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
      downloadBlob(blob, `${safeFileStem()}.nacre.json`);
      showToast('Project file exported with layers and material settings');
      updateSaveState('saved', 'Project exported');
      state.dirty = false;
      $('#dirtyMark').classList.remove('visible');
    } catch (_error) {
      showToast('Project export failed. Try exporting the texture as PNG.');
    }
    closePopovers();
  }

  async function openProjectFile(file) {
    if (!file) return;
    try {
      const project = JSON.parse(await file.text());
      if (project.format !== 'nacre-paint-project' || !Array.isArray(project.layers) || project.layers.length > 60) throw new Error('This file is not a supported Nacre project.');
      await restoreRecord(project);
      state.undoStack.length = 0;
      state.redoStack.length = 0;
      $('#documentName').value = project.documentName || 'Untitled texture';
      state.dirty = true;
      markDirty();
      showToast('Project opened');
    } catch (error) {
      showToast(error.message || 'Could not open this project file.');
    }
  }

  function onLayerListClick(event) {
    const actionButton = event.target.closest('[data-layer-action]');
    if (actionButton) {
      event.stopPropagation();
      handleLayerAction(actionButton.dataset.layerAction, actionButton.dataset.layerId);
      return;
    }
    const row = event.target.closest('.layer-row');
    if (!row) return;
    const layer = getLayer(row.dataset.layerId);
    if (!layer) return;
    state.activeLayerId = layer.id;
    if (['text', 'svg'].includes(layer.kind) && state.mode !== 'decals') state.mode = 'decals';
    if (layer.kind === 'fx' && state.mode === 'paint') state.mode = 'material';
    if (window.matchMedia('(max-width: 820px)').matches) $('.inspector-panel').classList.add('mobile-open');
    renderLayers();
    renderInspector();
    updateNav();
    updateLayerStatus();
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const modeButton = event.target.closest('[data-mode]');
      if (modeButton) { setMode(modeButton.dataset.mode); return; }
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) { setView(viewButton.dataset.view); return; }
      const toolButton = event.target.closest('[data-tool]');
      if (toolButton) { setTool(toolButton.dataset.tool); return; }
      const filterButton = event.target.closest('[data-layer-filter]');
      if (filterButton) {
        state.layerFilter = filterButton.dataset.layerFilter;
        $$('[data-layer-filter]').forEach((button) => { button.classList.toggle('active', button === filterButton); button.setAttribute('aria-pressed', String(button === filterButton)); });
        renderLayers();
        return;
      }
      const materialPresetButton = event.target.closest('[data-material-preset]');
      if (materialPresetButton) { applyMaterialPreset(materialPresetButton.dataset.materialPreset); return; }
      const layerAddButton = event.target.closest('[data-add-layer]');
      if (layerAddButton) { closePopovers(); addLayer(layerAddButton.dataset.addLayer); return; }
      const decalPreset = event.target.closest('[data-decal-preset]');
      if (decalPreset) { drawStamp(decalPreset.dataset.decalPreset); return; }
      const channelButton = event.target.closest('[data-channel]');
      if (channelButton) {
        const key = channelButton.dataset.channel;
        state.channels[key] = !state.channels[key];
        renderInspector(); requestRender(); markDirty(); return;
      }
      const exportButton = event.target.closest('[data-export]');
      if (exportButton) { if (exportButton.dataset.export === 'project') exportProject(); else exportPng(); return; }
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action) {
        if (action === 'open-project') $('#projectFileInput').click();
        else if (action === 'import-svg') $('#svgFileInput').click();
        else if (action === 'add-text') openTextModal();
        else if (action === 'add-stamp') drawStamp('roundel');
        else if (action === 'reset-brush') resetBrush();
        else if (action === 'select-layer') { $('.layer-row.selected', layerList)?.scrollIntoView({ block: 'nearest' }); }
        else if (action === 'reset-base-color') { state.material.baseColor = materialPresets[state.material.preset]?.baseColor || '#c5c8bf'; renderInspector(); requestRender(); markDirty(); }
        else if (action === 'add-channel') {
          const next = ['emission', 'transmission', 'coat'].find((key) => !state.extraChannels.includes(key));
          if (!next) showToast('All available material channels are already on this surface.');
          else {
            state.extraChannels.push(next); state.channels[next] = true;
            renderInspector(); requestRender(); markDirty();
            const labels = { emission: 'Emission', transmission: 'Transmission', coat: 'Coat roughness' };
            showToast(`${labels[next]} channel added`);
          }
        }
        else if (action === 'channel-help') showToast(`${5 + state.extraChannels.length} material channels are available on this surface.`);
        else if (action === 'material-more') showToast('The starter library includes carbon, ceramic, anodized metal, and field polymer.');
        return;
      }
      const rowAction = event.target.closest('[data-context-action]')?.dataset.contextAction;
      if (rowAction) {
        const id = state.contextLayerId;
        if (rowAction === 'duplicate') duplicateLayer(id);
        else if (rowAction === 'rename') renameLayer(id);
        else if (rowAction === 'top') moveLayerToTop(id);
        else if (rowAction === 'delete') deleteLayer(id);
        return;
      }
      if (event.target.closest('#exportButton')) { exportPng(); return; }
      if (event.target.closest('#exportMenuToggle')) { togglePopover($('#exportMenu'), $('#exportMenuToggle')); return; }
      if (event.target.closest('#addLayerButton') || event.target.closest('#addLayerMini')) { addLayer('paint'); return; }
      if (event.target.closest('#layerMenuToggle') || event.target.closest('#layerPanelMore')) { togglePopover($('#addLayerMenu'), $('#layerMenuToggle')); return; }
      if (event.target.closest('#undoButton')) { undo(); return; }
      if (event.target.closest('#redoButton')) { redo(); return; }
      if (event.target.closest('#inspectorReset')) { resetInspector(); return; }
      if (event.target.closest('#guidesButton')) { state.guides = !state.guides; updateViewControls(); requestRender(); return; }
      if (event.target.closest('#zoomInButton')) { updateZoom(10); return; }
      if (event.target.closest('#zoomOutButton')) { updateZoom(-10); return; }
      if (event.target.closest('#zoomReadout') || event.target.closest('#fitButton')) { state.zoom = 100; updateViewControls(); updateBrushCursorSize(); return; }
      if (event.target.closest('#quickTextButton')) { openTextModal(); return; }
      if (event.target.closest('#openProjectButton')) { $('#projectFileInput').click(); return; }
      if (event.target.closest('#helpButton')) { $('#helpModal').hidden = false; return; }
      if (event.target.closest('[data-close-modal]')) { closeModal(event.target.closest('.modal-backdrop')); return; }
      if (event.target.classList.contains('modal-backdrop')) { closeModal(event.target); return; }
      if (!event.target.closest('.popover') && !event.target.closest('#exportMenuToggle') && !event.target.closest('#layerMenuToggle') && !event.target.closest('#layerPanelMore')) closePopovers();
    });

    layerList.addEventListener('click', onLayerListClick);
    layerList.addEventListener('dblclick', (event) => {
      const row = event.target.closest('.layer-row');
      if (row && !event.target.closest('button')) renameLayer(row.dataset.layerId);
    });
    layerList.addEventListener('dragstart', (event) => {
      const row = event.target.closest('.layer-row');
      if (!row) return;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.dataset.layerId);
      row.classList.add('dragging');
    });
    layerList.addEventListener('dragend', (event) => { event.target.closest('.layer-row')?.classList.remove('dragging'); $$('.drag-over', layerList).forEach((row) => row.classList.remove('drag-over')); });
    layerList.addEventListener('dragover', (event) => { const row = event.target.closest('.layer-row'); if (row) { event.preventDefault(); row.classList.add('drag-over'); } });
    layerList.addEventListener('dragleave', (event) => event.target.closest('.layer-row')?.classList.remove('drag-over'));
    layerList.addEventListener('drop', (event) => {
      const row = event.target.closest('.layer-row');
      if (!row) return;
      event.preventDefault();
      row.classList.remove('drag-over');
      reorderLayers(event.dataTransfer.getData('text/plain'), row.dataset.layerId);
    });

    document.addEventListener('input', (event) => {
      const target = event.target;
      if (target.id === 'layerSearch') { state.layerSearch = target.value.trim(); renderLayers(); return; }
      if (target.id === 'documentName') { markDirty(); return; }
      if (target.dataset.brush) { handleBrushInput(target); return; }
      if (target.hasAttribute('data-brush-hex')) {
        const color = target.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(color)) {
          state.color = color;
          const picker = $('[data-brush="color"]', inspectorContent);
          if (picker) picker.value = color;
          markDirty();
        }
        return;
      }
      if (target.dataset.material) { handleMaterialInput(target); return; }
      if (target.dataset.layerField) { handleLayerInput(target); return; }
      if (target.dataset.decalField || target.dataset.decalTransform) { handleDecalInput(target); return; }
      if (target.id === 'decalScale') { $('#decalScaleValue').textContent = `${target.value}%`; updateSliderPaint(target); }
    });
    document.addEventListener('change', (event) => {
      const target = event.target;
      if (target.dataset.brush) { handleBrushInput(target); return; }
      if (target.dataset.material) { handleMaterialInput(target); return; }
      if (target.dataset.layerField) { handleLayerInput(target); return; }
      if (target.dataset.decalField || target.dataset.decalTransform) { handleDecalInput(target); return; }
      if (target.id === 'svgFileInput' && target.files[0]) { addSvgFile(target.files[0]); target.value = ''; }
      if (target.id === 'projectFileInput' && target.files[0]) { openProjectFile(target.files[0]); target.value = ''; }
    });

    paintCanvas.addEventListener('pointerdown', pointerDown);
    paintCanvas.addEventListener('pointermove', pointerMove);
    paintCanvas.addEventListener('pointerleave', () => { if (!state.stroke && !state.isRotating && !state.isMovingDecal) brushCursor.style.display = 'none'; });
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    paintCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
    $('#canvasArea').addEventListener('wheel', (event) => { event.preventDefault(); updateZoom(event.deltaY < 0 ? 5 : -5); }, { passive: false });

    $('#collectionToggle').addEventListener('click', () => {
      state.collectionOpen = !state.collectionOpen;
      $('#collectionToggle').setAttribute('aria-expanded', String(state.collectionOpen));
      renderLayers();
    });
    $('#svgFileInput').addEventListener('change', (event) => { if (event.target.files[0]) addSvgFile(event.target.files[0]); event.target.value = ''; });
    $('#projectFileInput').addEventListener('change', (event) => { if (event.target.files[0]) openProjectFile(event.target.files[0]); event.target.value = ''; });
    $('#textForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = $('#decalText').value.trim();
      if (!text) { $('#decalText').focus(); return; }
      createTextLayer({ text, color: $('#decalColor').value, font: $('#decalFont').value, scale: $('#decalScale').value });
    });
    $('#textModal').addEventListener('click', (event) => { if (event.target === $('#textModal')) closeModal($('#textModal')); });
    $('#helpModal').addEventListener('click', (event) => { if (event.target === $('#helpModal')) closeModal($('#helpModal')); });

    inspectorContent.addEventListener('dragover', (event) => {
      const dropzone = event.target.closest('#svgDropzone');
      if (dropzone) { event.preventDefault(); dropzone.classList.add('dragover'); }
    });
    inspectorContent.addEventListener('dragleave', (event) => {
      const dropzone = event.target.closest('#svgDropzone');
      if (dropzone && !dropzone.contains(event.relatedTarget)) dropzone.classList.remove('dragover');
    });
    inspectorContent.addEventListener('drop', (event) => {
      const dropzone = event.target.closest('#svgDropzone');
      if (dropzone) { event.preventDefault(); dropzone.classList.remove('dragover'); addSvgFile(event.dataTransfer.files[0]); }
    });

    window.addEventListener('keydown', (event) => {
      const target = event.target;
      const isTyping = target.matches('input,textarea,select') && target.type !== 'range';
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === 'f') { event.preventDefault(); $('#layerSearch').focus(); return; }
      if (event.key === '/' && !isTyping) { event.preventDefault(); $('#layerSearch').focus(); return; }
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (command && event.key.toLowerCase() === 's') { event.preventDefault(); exportProject(); return; }
      if (isTyping || event.altKey || command) return;
      const key = event.key.toLowerCase();
      if (key === 'b') setTool('brush');
      else if (key === 'e') setTool('erase');
      else if (key === 'h') setTool('orbit');
      else if (key === 'i') setTool('sample');
      else if (key === 'g') { state.guides = !state.guides; updateViewControls(); requestRender(); }
      else if (key === '0') { state.zoom = 100; updateViewControls(); updateBrushCursorSize(); }
      else if (key === '[' || key === ']') {
        state.brush.size = clamp(state.brush.size + (key === ']' ? 5 : -5), 1, 240);
        if (state.mode === 'paint') renderInspector();
        updateLayerStatus(); markDirty();
      } else if (key === 'escape') { closePopovers(); $('#textModal').hidden = true; $('#helpModal').hidden = true; $('.inspector-panel').classList.remove('mobile-open'); setTool('brush'); }
      else if (key === '?') $('#helpModal').hidden = false;
      else if (key === ' ') { event.preventDefault(); setTool(state.tool === 'orbit' ? 'brush' : 'orbit'); }
    });

    window.addEventListener('resize', updateBrushCursorSize);
  }

  async function boot() {
    state.layers = createInitialLayers();
    state.activeLayerId = 'layer-pinline';
    bindEvents();
    renderAll();
    try {
      state.db = await openDatabase();
      const restored = await loadLocalDraft();
      if (!restored) {
        updateSaveState('saved', 'Local draft ready');
        state.dirty = true;
        saveLocalDraft();
      }
    } catch (_error) {
      updateSaveState('saved', 'Browser session');
    }
  }

  boot();
})();
