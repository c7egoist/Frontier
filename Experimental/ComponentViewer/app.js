/* Frontier Component Viewer — small, dependency-free interaction layer */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const body = document.body;
  const state = {
    workspace: 'prep',
    assetName: 'ControlVehicle',
    filename: 'control_vehicle.fbx',
    fileInfo: 'FBX · 18.4 MB · imported today',
    compileBusy: false,
    bakeBusy: false,
    selectedComponent: 'VehicleRoot'
  };

  const componentData = {
    VehicleRoot: {
      type: 'Scene component · root transform',
      description: 'Owns the assembled vehicle and defines its transform in a scene.',
      children: '4 children',
      icon: '◇',
      color: '#9cf3d0',
      asset: 'ControlVehicle.asset',
      assetDetail: 'Compiled geometry · v1.4',
      setting: 'Mobility',
      value: 'Static'
    },
    BodyMesh: {
      type: 'Static mesh component · geometry',
      description: 'Renders the compiled body mesh, material slots, and its collision proxy.',
      children: '2 material slots',
      icon: '◆',
      color: '#84dce5',
      asset: 'ControlVehicle.fmesh',
      assetDetail: '124,812 triangles · compiled',
      setting: 'Cast shadows',
      value: 'Enabled'
    },
    WheelRig: {
      type: 'Instanced component · chassis rig',
      description: 'Owns four wheel instances and provides attachment points for suspension.',
      children: '4 wheel instances',
      icon: '◎',
      color: '#f2bd6b',
      asset: 'Wheel assembly',
      assetDetail: '4 instances · shared geometry',
      setting: 'Simulation',
      value: 'Kinematic'
    },
    DriveController: {
      type: 'Logic component · input graph',
      description: 'Maps runtime vehicle input to the wheel rig and component state.',
      children: '3 bound actions',
      icon: '▣',
      color: '#c3a4f2',
      asset: 'Vehicle input map',
      assetDetail: 'Forward · brake · steer',
      setting: 'Update phase',
      value: 'Pre-physics'
    },
    IconAnchor: {
      type: 'Capture component · icon camera',
      description: 'Defines the saved thumbnail framing used by the asset browser.',
      children: '1 capture target',
      icon: '◉',
      color: '#b3c7ca',
      asset: 'Vehicle icon target',
      assetDetail: '256 px transparent output',
      setting: 'Capture size',
      value: '256 px'
    }
  };

  let toastTimer;
  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('show'), 2700);
  }

  function setWorkspace(next) {
    state.workspace = next;
    body.dataset.workspace = next;
    $$('[data-workspace-target]').forEach(button => button.classList.toggle('active', button.dataset.workspaceTarget === next));
    $$('[data-rail-mode]').forEach(section => section.hidden = section.dataset.railMode !== next);
    $$('[data-view]').forEach(view => view.hidden = view.dataset.view !== next);
    $$('[data-inspector]').forEach(view => view.hidden = view.dataset.inspector !== next);
    if (next === 'viewer') updateComponent(state.selectedComponent);
  }

  function updateAsset(name, filename, info) {
    state.assetName = name || state.assetName;
    state.filename = filename || state.filename;
    state.fileInfo = info || state.fileInfo;
    $('#crumbAsset').textContent = state.assetName.toUpperCase();
    $('#assetNameRail').textContent = state.assetName;
    $('#assetMetaRail').textContent = 'Mesh · 124,812 tris';
    $('#documentTitle').textContent = `${state.assetName}.asset`;
    $('#inspectorAssetName').textContent = state.assetName;
    $('#sourceFilename').textContent = state.filename;
    $('#sourceSubline').textContent = state.fileInfo;
    $('#uvAssetName').textContent = `${state.assetName} · Channel 0`;
    $('.asset-row-copy b').title = state.assetName;
  }

  function updateComponent(name) {
    const component = componentData[name];
    if (!component) return;
    state.selectedComponent = name;
    $$('.component-row').forEach(row => row.classList.toggle('selected', row.dataset.component === name));
    $$('.component-graph-node').forEach(node => node.classList.toggle('selected', node.dataset.component === name));
    $('#componentCrumb').textContent = name.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
    $('#componentTitle').textContent = name;
    $('#componentType').textContent = component.type;
    $('#componentDescription').textContent = component.description;
    $('#componentSummary').textContent = component.children;
    $('#largeComponentIcon').textContent = component.icon;
    $('#largeComponentIcon').style.color = component.color;
    $('#assignedAsset').textContent = component.asset;
    $('#assignedAssetDetail').textContent = component.assetDetail;
    $('#viewerSettingOne label').textContent = component.setting;
    $('#viewerSettingOne .select-control').innerHTML = `${component.value} <span>⌄</span>`;
    const preview = $('#previewSelection');
    preview.querySelector('span').textContent = name;
    preview.className = 'selected-component-outline';
    if (name === 'BodyMesh') preview.classList.add('body-selection');
    if (name === 'WheelRig') preview.classList.add('wheel-selection');
    if (name === 'DriveController') preview.classList.add('logic-selection');
  }

  function openImport() {
    $('#importModal').hidden = false;
    setTimeout(() => $('#dropZone').focus?.(), 50);
  }
  function closeImport() {
    $('#importModal').hidden = true;
  }

  function humanFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Ready to import';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** exponent)).toFixed(exponent > 1 ? 1 : 0)} ${units[exponent]} · ready to import`;
  }

  function setPickedFile(file) {
    if (!file) return;
    $('#filePicked').hidden = false;
    $('#pickedFileName').textContent = file.name;
    $('#pickedFileInfo').textContent = humanFileSize(file.size);
    $('#confirmImport').disabled = false;
    $('#confirmImport').dataset.fileName = file.name;
    $('#confirmImport').dataset.fileInfo = `${file.name.split('.').pop().toUpperCase()} · ${humanFileSize(file.size).replace(' · ready to import', '')} · imported now`;
  }

  function clearPickedFile() {
    $('#assetFile').value = '';
    $('#filePicked').hidden = true;
    $('#confirmImport').disabled = true;
    delete $('#confirmImport').dataset.fileName;
    delete $('#confirmImport').dataset.fileInfo;
  }

  async function runCompile() {
    if (state.compileBusy) return;
    state.compileBusy = true;
    const compileButton = $('#compileGeometry');
    compileButton.disabled = true;
    const indicator = $('#compileIndicator');
    indicator.className = 'status-indicator working';
    const steps = [
      ['Inspecting source mesh…', 'Verifying normals, bounds and non-manifold edges'],
      ['Building render hierarchy…', 'Partitioning 124,812 source triangles'],
      ['Generating collision proxy…', 'Four convex hulls created'],
      ['Writing compiled artifact…', 'ControlVehicle.fmesh is ready']
    ];
    for (let index = 0; index < steps.length; index += 1) {
      const [title, detail] = steps[index];
      $('#compileNote').textContent = title;
      $('#compileState').textContent = title.replace('…', '');
      $('#compileDetail').textContent = detail;
      $('#compileStats').textContent = `${index + 1} / ${steps.length} passes · working`;
      await new Promise(resolve => setTimeout(resolve, 580));
    }
    $('#compileNote').textContent = 'Compiled artifact is ready to send to Component Viewer.';
    $('#compileState').textContent = 'Geometry compiled';
    $('#compileDetail').textContent = 'Hierarchy, collision and material slots are up to date';
    $('#compileStats').textContent = '124,812 tris · 0 warnings';
    indicator.className = 'status-indicator ready';
    compileButton.disabled = false;
    state.compileBusy = false;
    toast('Geometry compiled — Component Viewer is ready.');
  }

  async function runBake() {
    if (state.bakeBusy) return;
    state.bakeBusy = true;
    const button = $('#bakeAsset');
    button.disabled = true;
    button.innerHTML = '<span>◌</span> Baking artifacts…';
    $('#bakeProgress').hidden = false;
    $('#bakeResult').textContent = 'Baking source artifact';
    $('#bakeNote').textContent = 'Capturing icon camera and voxelizing SDF.';
    await new Promise(resolve => setTimeout(resolve, 1750));
    $('#bakeProgress').hidden = true;
    $('#bakeResult').textContent = '2 bake artifacts ready';
    $('#bakeNote').textContent = 'Icon_256.png · ControlVehicle.sdf';
    button.disabled = false;
    button.innerHTML = '<span>↻</span> Re-bake icon &amp; SDF';
    state.bakeBusy = false;
    toast('Icon and 64³ signed distance field baked successfully.');
  }

  function jumpTo(id) {
    const target = document.getElementById(id);
    if (!target) return;
    if (state.workspace !== 'prep') setWorkspace('prep');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $$('.pipeline-nav').forEach(item => item.classList.toggle('selected', item.dataset.jump === id));
  }

  // Workspace and nav
  $$('[data-workspace-target]').forEach(button => button.addEventListener('click', () => setWorkspace(button.dataset.workspaceTarget)));
  $$('.pipeline-nav').forEach(button => button.addEventListener('click', () => jumpTo(button.dataset.jump)));
  $$('.component-row, .component-graph-node').forEach(button => button.addEventListener('click', () => updateComponent(button.dataset.component)));
  $('#assetRow').addEventListener('click', () => setWorkspace('prep'));

  // Import flow
  $('#openImport').addEventListener('click', openImport);
  $('#changeSource').addEventListener('click', openImport);
  $('#closeImport').addEventListener('click', closeImport);
  $('#cancelImport').addEventListener('click', closeImport);
  $('#clearFile').addEventListener('click', clearPickedFile);
  $('#assetFile').addEventListener('change', event => setPickedFile(event.target.files[0]));
  $('#dropZone').addEventListener('dragover', event => { event.preventDefault(); $('#dropZone').classList.add('is-dragging'); });
  $('#dropZone').addEventListener('dragleave', () => $('#dropZone').classList.remove('is-dragging'));
  $('#dropZone').addEventListener('drop', event => {
    event.preventDefault();
    $('#dropZone').classList.remove('is-dragging');
    const [file] = event.dataTransfer.files;
    setPickedFile(file);
  });
  $('#useSample').addEventListener('click', () => {
    $('#filePicked').hidden = false;
    $('#pickedFileName').textContent = 'control_vehicle.fbx';
    $('#pickedFileInfo').textContent = '18.4 MB · configured source';
    $('#confirmImport').disabled = false;
    $('#confirmImport').dataset.fileName = 'control_vehicle.fbx';
    $('#confirmImport').dataset.fileInfo = 'FBX · 18.4 MB · imported now';
  });
  $('#confirmImport').addEventListener('click', () => {
    const filename = $('#confirmImport').dataset.fileName || 'control_vehicle.fbx';
    const name = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase()).replace(/\s+/g, '');
    updateAsset(name, filename, $('#confirmImport').dataset.fileInfo || 'FBX · imported now');
    closeImport();
    clearPickedFile();
    setWorkspace('prep');
    toast(`${name} imported into the geometry pipeline.`);
  });
  $('#importModal').addEventListener('click', event => { if (event.target === $('#importModal')) closeImport(); });

  // Asset prep controls
  $('#compileGeometry').addEventListener('click', runCompile);
  $('#resetCompile').addEventListener('click', () => {
    $('#compileNote').textContent = 'Source is normalized and ready to compile.';
    $('#compileState').textContent = 'Ready to compile';
    $('#compileDetail').textContent = 'Bounds, normals & hierarchy check passed';
    $('#compileStats').textContent = '124,812 tris · 0 warnings';
    toast('Compile settings reset.');
  });
  $('#bakeAsset').addEventListener('click', runBake);
  $('#focusBake').addEventListener('click', () => jumpTo('bake'));
  $('#openUv').addEventListener('click', () => { $('#uvOverlay').hidden = false; });
  $('#closeUv').addEventListener('click', () => { $('#uvOverlay').hidden = true; });
  $('#applyUv').addEventListener('click', () => { $('#uvOverlay').hidden = true; toast('UV layout applied to the pending artifact.'); });
  $('#uvOverlay').addEventListener('click', event => { if (event.target === $('#uvOverlay')) $('#uvOverlay').hidden = true; });
  $('#triangleBudget').addEventListener('input', event => { $('#budgetOutput').textContent = `${event.target.value}k`; });
  $$('.switch').forEach(button => button.addEventListener('click', () => button.classList.toggle('is-on')));
  $$('.viewport-tool[data-camera]').forEach(button => button.addEventListener('click', () => {
    $$('.viewport-tool[data-camera]').forEach(item => item.classList.toggle('selected', item === button));
    const viewport = $('#assetViewport');
    viewport.classList.toggle('is-inspecting', button.dataset.camera === 'inspect');
    viewport.classList.toggle('is-wire', button.dataset.camera === 'wire');
  }));
  $('#toggleGrid').addEventListener('click', () => $('#assetViewport').classList.toggle('grid-off'));
  $('#fitAsset').addEventListener('click', () => {
    const vehicle = $('.hero-vehicle');
    vehicle.animate([{ transform: 'translate(-51%, -46%) scale(1.06)' }, { transform: 'translate(-51%, -46%) scale(1)' }], { duration: 430, easing: 'cubic-bezier(.2,.8,.2,1)' });
    toast('Asset framed in viewport.');
  });
  $$('.view-chip, .mini-toggle').forEach(button => button.addEventListener('click', () => {
    const group = button.parentElement;
    $$('.view-chip, .mini-toggle', group).forEach(item => item.classList.toggle('active', item === button));
  }));

  // Component controls
  $('#compileClass').addEventListener('click', async () => {
    const button = $('#compileClass');
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span>◌</span> Compiling…';
    await new Promise(resolve => setTimeout(resolve, 900));
    button.innerHTML = original;
    button.disabled = false;
    toast('Component class compiled with 0 warnings.');
  });
  $('#saveComponent').addEventListener('click', () => toast('ControlVehicle.component saved locally.'));
  $('#resetTransform').addEventListener('click', () => {
    $$('.transform-table input').forEach((input, index) => input.value = index % 3 === 0 && input.closest('label').textContent.includes('Scale') ? '1.00' : (input.closest('label').textContent.includes('Scale') ? '1.00' : '0.00'));
    toast('Local transform reset.');
  });
  $('#addComponent').addEventListener('click', () => toast('Component menu opened — choose a runtime component type.'));
  $('#fitGraph').addEventListener('click', () => {
    const stage = $('#graphStage');
    stage.animate([{ filter: 'brightness(1.22)' }, { filter: 'brightness(1)' }], { duration: 350 });
    toast('Class graph framed.');
  });

  // Help / keys
  $('.help-button').addEventListener('click', () => $('#shortcutPanel').hidden = !$('#shortcutPanel').hidden);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      $('#importModal').hidden = true;
      $('#uvOverlay').hidden = true;
      $('#shortcutPanel').hidden = true;
      return;
    }
    const target = event.target;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (event.key.toLowerCase() === 'i') { event.preventDefault(); openImport(); }
    if (event.key.toLowerCase() === 'g' && state.workspace === 'prep') runCompile();
    if (event.key.toLowerCase() === 'u' && state.workspace === 'prep') $('#uvOverlay').hidden = false;
    if (event.key.toLowerCase() === 'b' && state.workspace === 'prep') runBake();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (state.workspace === 'viewer') toast('ControlVehicle.component saved locally.'); }
  });

  updateAsset(state.assetName, state.filename, state.fileInfo);
  updateComponent(state.selectedComponent);
})();
