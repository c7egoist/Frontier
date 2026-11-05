import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadWorld, saveWorld } from '../world/world-storage.js';
import { bakeTerrainDocument } from './world-terrain-session.js';
import { MASK_RESOLUTION, addRegion, addShapeLayer, bakeWorld, createWorld, normalizeBounds, paintMask, regionMask } from '../world/world-map.js';

/** World layout owns only a 2D mask and bounded baked terrain patches. */
export class WorldLayout {
  constructor(root, onEdit) {
    this.root = root;
    this.onEdit = onEdit;
    this.world = createWorld();
    this.selectedLayer = addShapeLayer(this.world).id;
    this.selectedRegion = null;
    this.tool = 'paint';
    this.brush = .045;
    this.previewSize = 128;
    this.ready = false;
    this.saveQueue = Promise.resolve();
    this.root.innerHTML = `<aside class="world-panel"><div class="world-heading"><div><small>WORLD LAYOUT</small><h2>Shapes &amp; terrains</h2></div><button id="world-add-layer" title="Add shape layer">+ Shape</button></div><p>Paint a flat land mask, then drag a box to assign a terrain. The box is edited in Terrain Studio.</p><div id="world-layer-list" class="world-list"></div><h3>Terrain bounds</h3><div id="world-region-list" class="world-list"></div><p class="world-note">Patches are composited in list order. Saved locally in this browser; simulations pause on switch. Moving rocks and particles restart; the preview is a heightfield and omits caves and objects.</p></aside><main class="world-main"><div class="world-toolbar"><div class="world-tools"><button data-world-tool="paint" class="active">Paint land</button><button data-world-tool="erase">Erase</button><button data-world-tool="bounds">Draw bounds</button><label>Brush <input id="world-brush" type="range" min="1" max="20" value="4.5" step="0.5"></label></div><div class="world-tools"><button id="world-view-map" class="active">2D map</button><button id="world-view-preview">3D world</button><label>Preview <select id="world-preview-res"><option value="64">64²</option><option value="128" selected>128²</option><option value="256">256²</option><option value="512">512²</option></select></label></div></div><div class="world-stage"><div class="world-map-wrap"><canvas id="world-map" aria-label="Paint land and draw terrain bounds"></canvas></div><div id="world-preview" class="world-preview hidden-panel"></div></div><div class="world-footer" id="world-status">Paint on the map, then choose Draw bounds and drag a rectangle.</div></main>`;
    this.canvas = root.querySelector('#world-map');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = this.canvas.height = 768;
    this.canvas.addEventListener('pointerdown', event => this.pointerDown(event));
    this.canvas.addEventListener('pointermove', event => this.pointerMove(event));
    this.canvas.addEventListener('pointerup', event => this.pointerUp(event));
    this.canvas.addEventListener('pointercancel', event => this.pointerUp(event));
    root.querySelector('#world-add-layer').onclick = () => { if (!this.ready) return; this.selectedLayer = addShapeLayer(this.world).id; this.render(); this.save(); };
    root.querySelectorAll('[data-world-tool]').forEach(button => button.onclick = () => {
      this.tool = button.dataset.worldTool;
      root.querySelectorAll('[data-world-tool]').forEach(el => el.classList.toggle('active', el === button));
      this.status(this.tool === 'bounds' ? 'Drag a rectangle on the selected shape layer.' : 'Paint or erase on the selected shape layer.');
    });
    root.querySelector('#world-brush').oninput = event => { this.brush = Number(event.target.value) / 100; };
    root.querySelector('#world-view-map').onclick = () => this.showPreview(false);
    root.querySelector('#world-view-preview').onclick = () => this.showPreview(true);
    root.querySelector('#world-preview-res').onchange = event => {
      this.previewSize = Number(event.target.value);
      // Re-bake from each saved full-resolution terrain, not from its old
      // low-resolution preview. The world grid can then be scaled independently.
      for (const region of this.world.regions) if (region.document) region.bake = bakeTerrainDocument(region.document, this.previewSize);
      this.save(); this.render();
    };
    this.render();
    this.status('Loading saved world…');
    loadWorld().then(saved => {
      if (saved?.version === 1 && Array.isArray(saved.layers) && saved.layers.length && Array.isArray(saved.regions)) { this.world = saved; this.selectedLayer = saved.layers[0].id; }
      this.ready = true; this.render(); this.status('Paint the map, then draw terrain bounds. World saves locally in this browser.');
    }).catch(err => { this.ready = true; this.render(); this.status(`Local world storage unavailable: ${err.message}. Changes may not persist.`); });
  }
  save() {
    if (!this.ready) return;
    const snapshot = structuredClone(this.world);
    this.saveQueue = this.saveQueue.catch(() => {}).then(() => saveWorld(snapshot)).catch(err => { console.error('World save failed', err); this.status(`World could not be saved: ${err.message}`); });
  }
  status(text) { this.root.querySelector('#world-status').textContent = text; }
  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  }
  pointerDown(event) {
    if (event.button !== 0 || !this.ready) return;
    const p = this.point(event); this.pointer = { id: event.pointerId, start: p, last: p };
    this.canvas.setPointerCapture(event.pointerId);
    if (this.tool !== 'bounds') this.paint(p, p);
  }
  pointerMove(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    const p = this.point(event);
    if (this.tool !== 'bounds') this.paint(this.pointer.last, p);
    this.pointer.last = p; this.drawMap();
  }
  pointerUp(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    if (this.tool === 'bounds') {
      const b = normalizeBounds(this.pointer.start.x, this.pointer.start.y, this.pointer.last.x, this.pointer.last.y);
      if (b) { const region = addRegion(this.world, this.selectedLayer, b); this.selectedRegion = region.id; this.status('Terrain bounds assigned. Select Edit in Terrain Studio to start from the shape mask.'); }
    }
    this.pointer = null; this.render(); this.save();
  }
  paint(a, b) {
    const layer = this.world.layers.find(item => item.id === this.selectedLayer);
    if (layer) paintMask(layer, a.x, a.y, b.x, b.y, this.brush, this.tool === 'erase');
  }
  render() {
    const list = this.root.querySelector('#world-layer-list'); list.replaceChildren();
    for (const layer of this.world.layers) {
      const row = document.createElement('div'); row.className = `world-row ${layer.id === this.selectedLayer ? 'selected' : ''}`;
      const select = document.createElement('button'); select.textContent = layer.name; select.onclick = () => { this.selectedLayer = layer.id; this.render(); };
      const visibility = document.createElement('button'); visibility.textContent = layer.visible ? 'Visible' : 'Hidden'; visibility.onclick = () => { layer.visible = !layer.visible; this.render(); this.save(); };
      const rename = document.createElement('button'); rename.textContent = '✎'; rename.title = 'Rename shape'; rename.onclick = () => { const value = prompt('Shape name', layer.name); if (value?.trim()) { layer.name = value.trim().slice(0, 80); this.render(); this.save(); } };
      const remove = document.createElement('button'); remove.textContent = '×'; remove.title = 'Delete shape and its terrains'; remove.onclick = () => {
        if (!confirm(`Delete ${layer.name} and all terrain bounds assigned to it?`)) return;
        this.world.layers = this.world.layers.filter(item => item.id !== layer.id);
        this.world.regions = this.world.regions.filter(item => item.layerId !== layer.id);
        if (!this.world.layers.length) addShapeLayer(this.world);
        this.selectedLayer = this.world.layers[0].id; this.selectedRegion = null; this.render(); this.save();
      };
      row.append(select, visibility, rename, remove); list.append(row);
    }
    const regions = this.root.querySelector('#world-region-list'); regions.replaceChildren();
    for (const region of this.world.regions) {
      const row = document.createElement('div'); row.className = `world-region ${region.id === this.selectedRegion ? 'selected' : ''}`;
      const title = document.createElement('strong'); title.textContent = region.name;
      const details = document.createElement('small'); details.textContent = `${this.world.layers.find(item => item.id === region.layerId)?.name || 'Shape'} · ${region.bake ? `baked ${region.bake.size}²` : 'not baked'}`;
      const edit = document.createElement('button'); edit.textContent = 'Edit in Terrain Studio'; edit.onclick = () => { this.selectedRegion = region.id; this.onEdit(region, regionMask(this.world, region)); this.render(); };
      const actions = document.createElement('div'); actions.className = 'world-region-actions';
      const select = document.createElement('button'); select.textContent = 'Select'; select.onclick = () => { this.selectedRegion = region.id; this.selectedLayer = region.layerId; this.render(); };
      const rename = document.createElement('button'); rename.textContent = 'Rename'; rename.onclick = () => { const value = prompt('Terrain name', region.name); if (value?.trim()) { region.name = value.trim().slice(0, 80); this.render(); this.save(); } };
      const remove = document.createElement('button'); remove.textContent = 'Delete'; remove.onclick = () => { if (!confirm(`Delete ${region.name} and its saved terrain?`)) return; this.world.regions = this.world.regions.filter(item => item.id !== region.id); if (this.selectedRegion === region.id) this.selectedRegion = null; this.render(); this.save(); };
      actions.append(select, rename, remove);
      row.append(title, details, edit, actions); regions.append(row);
    }
    if (!this.world.regions.length) regions.textContent = 'No terrain bounds yet.';
    this.drawMap();
    if (this.previewVisible) this.updatePreview();
  }
  drawMap() {
    const ctx = this.ctx, n = this.canvas.width;
    ctx.fillStyle = '#142b30'; ctx.fillRect(0, 0, n, n);
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = MASK_RESOLUTION;
    const tctx = tmp.getContext('2d'); const img = tctx.createImageData(MASK_RESOLUTION, MASK_RESOLUTION);
    for (const layer of this.world.layers) if (layer.visible) for (let i = 0; i < layer.mask.length; i++) {
      const a = layer.mask[i]; if (a > img.data[i * 4 + 3]) { img.data[i * 4] = 91; img.data[i * 4 + 1] = 136; img.data[i * 4 + 2] = 102; img.data[i * 4 + 3] = a; }
    }
    tctx.putImageData(img, 0, 0); ctx.drawImage(tmp, 0, 0, n, n);
    ctx.strokeStyle = 'rgba(190,225,220,.10)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++) { ctx.beginPath(); ctx.moveTo(i*n/16,0); ctx.lineTo(i*n/16,n); ctx.moveTo(0,i*n/16); ctx.lineTo(n,i*n/16); ctx.stroke(); }
    const rect = (b, selected, label) => { ctx.strokeStyle = selected ? '#ffcf79' : '#80cbe3'; ctx.lineWidth = selected ? 3 : 2; ctx.strokeRect(b.x*n,b.y*n,b.width*n,b.height*n); if (label) {ctx.fillStyle=ctx.strokeStyle; ctx.font='bold 15px sans-serif'; ctx.fillText(label,b.x*n+5,b.y*n+18);} };
    for (const region of this.world.regions) rect(region.bounds, region.id === this.selectedRegion, region.name);
    if (this.pointer && this.tool === 'bounds') { const b = normalizeBounds(this.pointer.start.x,this.pointer.start.y,this.pointer.last.x,this.pointer.last.y); if (b) rect(b,true,''); }
  }
  showPreview(show) {
    this.previewVisible = show;
    this.root.querySelector('.world-map-wrap').classList.toggle('hidden-panel', show);
    this.root.querySelector('#world-preview').classList.toggle('hidden-panel', !show);
    this.root.querySelector('#world-view-map').classList.toggle('active', !show);
    this.root.querySelector('#world-view-preview').classList.toggle('active', show);
    if (show) this.updatePreview();
  }
  updatePreview() {
    if (!this.previewVisible) return;
    const el = this.root.querySelector('#world-preview');
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true }); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); el.append(this.renderer.domElement);
      this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#141b20');
      this.camera = new THREE.PerspectiveCamera(45, 1, .1, 2000); this.camera.position.set(170, 180, 230);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.target.set(0, 0, 0); this.controls.update();
      this.scene.add(new THREE.HemisphereLight(0xd8ebff, 0x404038, 2)); const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(100, 200, 70); this.scene.add(sun);
      const tick = () => { if (!this.renderer) return; requestAnimationFrame(tick); if (!this.previewVisible || this.root.classList.contains('hidden-panel')) return; const w=el.clientWidth,h=el.clientHeight; if (w && h) { this.renderer.setSize(w,h,false); this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); this.controls.update(); this.renderer.render(this.scene,this.camera); } }; tick();
    }
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.map?.dispose(); this.mesh.material.dispose(); this.heightTexture?.dispose(); }
    const data = bakeWorld(this.world, this.previewSize), n = data.size;
    const geometry = new THREE.PlaneGeometry(240, 240, n - 1, n - 1); geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position, pixels = new Uint8Array(n*n*4);
    for (let i = 0; i < n*n; i++) { pos.setY(i, data.heights[i] * .16); const c = data.coverage[i]; pixels[i*4] = (0.08 + .23*c)*255; pixels[i*4+1] = (.16 + .24*c)*255; pixels[i*4+2] = (.19 + .11*c)*255; pixels[i*4+3] = 255; }
    geometry.computeVertexNormals();
    const uv = geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.heightTexture = new THREE.DataTexture(data.heights, n, n, THREE.RedFormat, THREE.FloatType); this.heightTexture.needsUpdate = true;
    const colorTexture = new THREE.DataTexture(pixels, n, n, THREE.RGBAFormat); colorTexture.colorSpace = THREE.SRGBColorSpace; colorTexture.magFilter = THREE.LinearFilter; colorTexture.minFilter = THREE.LinearFilter; colorTexture.needsUpdate = true;
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: colorTexture, roughness: 1, side: THREE.DoubleSide })); this.scene.add(this.mesh);
    this.status(`World preview: ${n}² height bake. Drag to orbit; wheel to zoom. Unbaked land is flat.`);
  }
}
