import React, { useState } from 'react';
import { BuildingConfig, RoofType, RoofTileType, WoodType, WallFinish, GroundFloorStyle, BracketStyle, MainSignStyle, EnvironmentMode } from '../types/generator';
import { BUILDING_PRESETS } from '../types/presets';
import { 
  Home, 
  Layers, 
  Sparkles, 
  Zap, 
  Lightbulb, 
  Type, 
  Box, 
  FileCode, 
  Shuffle, 
  Palette, 
  Compass, 
  Sun, 
  Coffee, 
  Sliders, 
  ChevronRight, 
  ChevronDown,
  Check,
  Download
} from 'lucide-react';

interface ControlsPanelProps {
  config: BuildingConfig;
  onChange: (updater: (prev: BuildingConfig) => BuildingConfig) => void;
  onExportGLB: () => void;
  onExportOBJ: () => void;
  onExportBlenderScript: () => void;
  onExportJSON: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = ({
  config,
  onChange,
  onExportGLB,
  onExportOBJ,
  onExportBlenderScript,
  onExportJSON,
  activeTab,
  setActiveTab,
}) => {
  const [activeSection, setActiveSection] = useState<string>('architecture');

  // Randomize Seed
  const handleRandomizeSeed = () => {
    const newSeed = Math.floor(Math.random() * 90000) + 1000;
    onChange(prev => ({ ...prev, seed: newSeed }));
  };

  // Load Preset
  const handleLoadPreset = (presetKey: string) => {
    const preset = BUILDING_PRESETS[presetKey];
    if (preset) {
      onChange(() => ({ ...preset.config }));
    }
  };

  const sections = [
    { id: 'architecture', label: 'Floors & Form', icon: Layers },
    { id: 'roof', label: 'Roof & Kawara Tiles', icon: Compass },
    { id: 'timber', label: 'Wood & Joinery', icon: Box },
    { id: 'utilities', label: 'Poles & Electricity', icon: Zap },
    { id: 'lighting', label: 'Lights & Neon', icon: Lightbulb },
    { id: 'signage', label: 'Custom Signs & Text', icon: Type },
    { id: 'furniture', label: 'Tatami & Zen Props', icon: Coffee },
    { id: 'environment', label: 'Atmosphere & Sky', icon: Sun },
    { id: 'export', label: 'Export & Pipeline', icon: Download },
  ];

  return (
    <div className="flex flex-col h-full bg-[#121824] border-l border-slate-800 text-slate-200 w-96 shadow-2xl select-none">
      {/* Top Presets Ribbon */}
      <div className="p-3 border-b border-slate-800 bg-[#0d121c]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Architectural Archetypes
          </span>
          <button
            onClick={handleRandomizeSeed}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 rounded-lg border border-emerald-500/30 transition-all font-mono"
            title="Generate Random Building Variation"
          >
            <Shuffle className="w-3.5 h-3.5" />
            Seed: {config.seed}
          </button>
        </div>

        {/* Preset Cards Scroll */}
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(BUILDING_PRESETS).slice(0, 6).map(([key, p]) => {
            const isActive = config.archetype === p.config.archetype;
            return (
              <button
                key={key}
                onClick={() => handleLoadPreset(key)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl text-center border transition-all text-xs ${
                  isActive
                    ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg shadow-emerald-950/30 font-medium'
                    : 'bg-[#161f30] border-slate-700/60 text-slate-300 hover:bg-[#1f2b42] hover:border-slate-500'
                }`}
              >
                <span className="text-base mb-0.5">{p.icon}</span>
                <span className="truncate w-full text-[11px]">{p.name.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-800 bg-[#0f1522] overflow-x-auto scrollbar-none px-2 py-1.5 gap-1">
        {sections.map(sec => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-slate-700 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable Parameter Controls */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {/* ========================================================== */}
        {/* SECTION 1: FLOORS & FORM */}
        {/* ========================================================== */}
        {activeSection === 'architecture' && (
          <div className="space-y-4">
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-200">Floors (Stories)</label>
                <span className="font-mono text-emerald-400 font-bold bg-black/40 px-2 py-0.5 rounded border border-slate-800">
                  {config.floors} Floors
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={config.floors}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  onChange(prev => ({ ...prev, floors: val }));
                }}
                className="w-full accent-emerald-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>1 (Single Story)</span>
                <span>3 (Kyoto Machiya)</span>
                <span>5 (Pagoda Tower)</span>
              </div>
            </div>

            {/* Building Archetype */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <label className="font-semibold text-slate-200 block">Building Archetype</label>
              <select
                value={config.archetype}
                onChange={(e) => {
                  const val = e.target.value as any;
                  onChange(prev => ({ ...prev, archetype: val }));
                }}
                className="w-full bg-[#101724] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-medium focus:outline-none focus:border-emerald-500"
              >
                <option value="izakaya_ramen">Izakaya & Ramen Tavern (Eatery)</option>
                <option value="machiya_shop">Kyoto Machiya (Shop & Residence)</option>
                <option value="cyber_office">Neo-Tokyo Studio & Cyber Office</option>
                <option value="shrine_residence">Sacred Shrine Sanctuary (Temple)</option>
                <option value="pagoda_tower">Five-Tier Pagoda Monument</option>
                <option value="tea_house">Zen Tea House Pavilion</option>
              </select>
            </div>

            {/* Dimensions */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <label className="font-semibold text-slate-200 block">Footprint & Scale</label>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">Width</span>
                  <span className="font-mono text-emerald-400">{config.width}m</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={16}
                  step={0.5}
                  value={config.width}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onChange(prev => ({ ...prev, width: val }));
                  }}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">Depth</span>
                  <span className="font-mono text-emerald-400">{config.depth}m</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={16}
                  step={0.5}
                  value={config.depth}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onChange(prev => ({ ...prev, depth: val }));
                  }}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">Upper Floor Setback (Terrace)</span>
                  <span className="font-mono text-emerald-400">{Math.round(config.terraceSetback * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.35}
                  step={0.05}
                  value={config.terraceSetback}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onChange(prev => ({ ...prev, terraceSetback: val }));
                  }}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Ground Storefront Style */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <label className="font-semibold text-slate-200 block">Ground Floor Facade</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'shop_noren', label: 'Shop & Noren' },
                  { id: 'glass_modern', label: 'Modern Glass' },
                  { id: 'tatami_shoji', label: 'Tatami Shoji' },
                  { id: 'garage_shutter', label: 'Metal Shutter' },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        walls: { ...prev.walls, groundFloorStyle: item.id as GroundFloorStyle }
                      }));
                    }}
                    className={`px-2.5 py-2 rounded-lg border text-left transition-all ${
                      config.walls.groundFloorStyle === item.id
                        ? 'bg-emerald-500/20 border-emerald-400 text-white font-medium'
                        : 'bg-[#101724] border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* SECTION 2: ROOF & TILES */}
        {/* ========================================================== */}
        {activeSection === 'roof' && (
          <div className="space-y-4">
            {/* Asian Roof Type */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <label className="font-semibold text-slate-200 block">East Asian Roof Geometry</label>
              <div className="space-y-1.5">
                {[
                  { id: 'irimoya', label: 'Irimoya (Hip-and-Gable with Bargeboards)' },
                  { id: 'kirizuma', label: 'Kirizuma (Traditional Pure Gable)' },
                  { id: 'yosemune', label: 'Yosemune (Four-sided Hip Roof)' },
                  { id: 'pagoda_stepped', label: 'Pagoda Tiered (Multi-level upturned eaves)' },
                  { id: 'chinese_dian', label: 'Chinese Dian (Dramatic curved Feiyan eaves)' },
                ].map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        roof: { ...prev.roof, type: r.id as RoofType }
                      }));
                    }}
                    className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between transition-all ${
                      config.roof.type === r.id
                        ? 'bg-emerald-500/20 border-emerald-400 text-white font-semibold'
                        : 'bg-[#101724] border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{r.label}</span>
                    {config.roof.type === r.id && <Check className="w-4 h-4 text-emerald-400" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Roof Curvature (Sori) & Overhang */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <label className="font-semibold text-slate-200 block">Eaves Curvature & Overhang</label>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">Curvature (Sori Flare)</span>
                  <span className="font-mono text-emerald-400">{config.roof.curvature}m</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.4}
                  step={0.05}
                  value={config.roof.curvature}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onChange(prev => ({ ...prev, roof: { ...prev.roof, curvature: val } }));
                  }}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">Cantilever Overhang</span>
                  <span className="font-mono text-emerald-400">{config.roof.overhang}m</span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={2.6}
                  step={0.1}
                  value={config.roof.overhang}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onChange(prev => ({ ...prev, roof: { ...prev.roof, overhang: val } }));
                  }}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-300">Tiered Awnings Between Floors</span>
                <button
                  onClick={() => {
                    onChange(prev => ({
                      ...prev,
                      roof: { ...prev.roof, hasTieredEavesBetweenFloors: !prev.roof.hasTieredEavesBetweenFloors }
                    }));
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    config.roof.hasTieredEavesBetweenFloors ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                    config.roof.hasTieredEavesBetweenFloors ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>
            </div>

            {/* 3D Roof Tiles Boolean & Types */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-200">Roof Tiles (Kawara)</label>
                <button
                  onClick={() => {
                    onChange(prev => ({
                      ...prev,
                      roof: { ...prev.roof, hasTiles: !prev.roof.hasTiles }
                    }));
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    config.roof.hasTiles
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {config.roof.hasTiles ? 'TILES ENABLED' : 'SMOOTH SLATE'}
                </button>
              </div>

              {config.roof.hasTiles && (
                <div className="space-y-2 pt-1">
                  <span className="text-slate-400 block text-[11px]">Tile Construction Style</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'kawara_honga', label: 'Japanese Hongawara' },
                      { id: 'glazed_imperial', label: 'Imperial Glazed' },
                      { id: 'bamboo_split', label: 'Rustic Bamboo' },
                      { id: 'copper_standing_seam', label: 'Copper Seam' },
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          onChange(prev => ({
                            ...prev,
                            roof: { ...prev.roof, tileType: t.id as RoofTileType }
                          }));
                        }}
                        className={`p-2 rounded-lg border text-left transition-all ${
                          config.roof.tileType === t.id
                            ? 'bg-emerald-500/20 border-emerald-400 text-white font-medium'
                            : 'bg-[#101724] border-slate-700 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Roof Color Palette */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <label className="font-semibold text-slate-200 block">Roof Color Palette</label>
              <div className="flex items-center gap-2">
                {[
                  { hex: '#1a1f26', name: 'Charcoal Slate' },
                  { hex: '#2a9d8f', name: 'Aged Verdigris' },
                  { hex: '#1b4332', name: 'Imperial Jade' },
                  { hex: '#c1121f', name: 'Shrine Vermilion' },
                  { hex: '#d4a373', name: 'Palace Ochre' },
                  { hex: '#1d3557', name: 'Cobalt Indigo' },
                ].map(c => (
                  <button
                    key={c.hex}
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        roof: { ...prev.roof, color: c.hex }
                      }));
                    }}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      config.roof.color.toLowerCase() === c.hex.toLowerCase()
                        ? 'border-white scale-110 ring-2 ring-emerald-400/50'
                        : 'border-slate-600'
                    }`}
                  />
                ))}
                <input
                  type="color"
                  value={config.roof.color}
                  onChange={(e) => {
                    const hex = e.target.value;
                    onChange(prev => ({ ...prev, roof: { ...prev.roof, color: hex } }));
                  }}
                  className="w-8 h-8 rounded-full bg-transparent cursor-pointer border border-slate-700"
                  title="Custom Color"
                />
              </div>
            </div>

            {/* Ridge Finials (Onigawara / Shibi) */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <label className="font-semibold text-slate-200 block">Ridge End Ornaments</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'onigawara', label: 'Onigawara (Demon Ogre)' },
                  { id: 'shibi_dragon', label: 'Shibi (Dragon Finial)' },
                  { id: 'simple_ridge', label: 'Stepped Mune Tile' },
                  { id: 'none', label: 'Minimal None' },
                ].map(o => (
                  <button
                    key={o.id}
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        roof: { ...prev.roof, ridgeOrnament: o.id as any }
                      }));
                    }}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      config.roof.ridgeOrnament === o.id
                        ? 'bg-emerald-500/20 border-emerald-400 text-white font-medium'
                        : 'bg-[#101724] border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* SECTION 3: WOOD & JOINERY */}
        {/* ========================================================== */}
        {activeSection === 'timber' && (
          <div className="space-y-4">
            {/* Wood Species / Finish */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <label className="font-semibold text-slate-200 block">Wood Species & Finish</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'hinoki', label: 'Hinoki Cypress (Blonde)' },
                  { id: 'keyaki', label: 'Keyaki Cedar (Dark Red)' },
                  { id: 'yakisugi', label: 'Yakisugi (Burnt Shou Sugi)' },
                  { id: 'vermilion_lacquer', label: 'Vermilion Shrine Lacquer' },
                  { id: 'weathered_timber', label: 'Ancient Weathered Grey' },
                  { id: 'cyber_carbon', label: 'Carbon-Reinforced Black' },
                ].map(w => (
                  <button
                    key={w.id}
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        timber: { ...prev.timber, woodType: w.id as WoodType }
                      }));
                    }}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      config.timber.woodType === w.id
                        ? 'bg-emerald-500/20 border-emerald-400 text-white font-medium'
                        : 'bg-[#101724] border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bracket System (Dougong / Tokkyo) */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <label className="font-semibold text-slate-200 block">Under-Eaves Bracket System (Dougong)</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'dougong_triple', label: 'Multi-Tier Dougong' },
                  { id: 'tokkyo_simple', label: 'Classic Tokkyo' },
                  { id: 'minimal_modern', label: 'Modern Flitched' },
                  { id: 'none', label: 'No Brackets' },
                ].map(b => (
                  <button
                    key={b.id}
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        timber: { ...prev.timber, bracketStyle: b.id as BracketStyle }
                      }));
                    }}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      config.timber.bracketStyle === b.id
                        ? 'bg-emerald-500/20 border-emerald-400 text-white font-medium'
                        : 'bg-[#101724] border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              {config.timber.bracketStyle !== 'none' && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-400">Bracket Density</span>
                    <span className="font-mono text-emerald-400">{config.timber.bracketDensity}x</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={1}
                    value={config.timber.bracketDensity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      onChange(prev => ({ ...prev, timber: { ...prev.timber, bracketDensity: val } }));
                    }}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Engawa Balcony & Railing */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-200 font-semibold">Engawa Veranda Balcony</span>
                <button
                  onClick={() => {
                    onChange(prev => ({
                      ...prev,
                      timber: { ...prev.timber, hasEngawaBalcony: !prev.timber.hasEngawaBalcony }
                    }));
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    config.timber.hasEngawaBalcony ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                    config.timber.hasEngawaBalcony ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {config.timber.hasEngawaBalcony && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span className="text-slate-300">Timber Railing (Kōran)</span>
                  <button
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        timber: { ...prev.timber, balconyRailing: !prev.timber.balconyRailing }
                      }));
                    }}
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      config.timber.balconyRailing ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                      config.timber.balconyRailing ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>
              )}
            </div>

            {/* Wall Plaster Finish */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <label className="font-semibold text-slate-200 block">Wall Material & Finish</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'shikkui_white', label: 'Shikkui White Plaster' },
                  { id: 'clay_earthen', label: 'Juraku Earthen Clay' },
                  { id: 'concrete_modern', label: 'Architectural Concrete' },
                  { id: 'weathered_plank', label: 'Weathered Planks' },
                  { id: 'dark_shou_sugi', label: 'Black Shou Sugi' },
                ].map(wf => (
                  <button
                    key={wf.id}
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        walls: { ...prev.walls, finish: wf.id as WallFinish }
                      }));
                    }}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      config.walls.finish === wf.id
                        ? 'bg-emerald-500/20 border-emerald-400 text-white font-medium'
                        : 'bg-[#101724] border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {wf.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* SECTION 4: POLES & ELECTRICITY */}
        {/* ========================================================== */}
        {activeSection === 'utilities' && (
          <div className="space-y-4">
            {/* Telephone Pole Boolean Toggle */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-semibold text-slate-200 block">Telephone Utility Pole</label>
                  <span className="text-[11px] text-slate-400">Connected to building with powerlines</span>
                </div>
                <button
                  onClick={() => {
                    onChange(prev => ({
                      ...prev,
                      electricity: { ...prev.electricity, hasPhonePole: !prev.electricity.hasPhonePole }
                    }));
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    config.electricity.hasPhonePole ? 'bg-purple-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                    config.electricity.hasPhonePole ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {config.electricity.hasPhonePole && (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-400">Powerline Sag Factor (Gravity Droop)</span>
                      <span className="font-mono text-purple-400">{config.electricity.sagFactor}</span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={1.5}
                      step={0.05}
                      value={config.electricity.sagFactor}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        onChange(prev => ({ ...prev, electricity: { ...prev.electricity, sagFactor: val } }));
                      }}
                      className="w-full accent-purple-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-400">Cable Wire Strands</span>
                      <span className="font-mono text-purple-400">{config.electricity.wireCount} Lines</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={6}
                      step={1}
                      value={config.electricity.wireCount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        onChange(prev => ({ ...prev, electricity: { ...prev.electricity, wireCount: val } }));
                      }}
                      className="w-full accent-purple-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Distribution Transformer Drum</span>
                    <button
                      onClick={() => {
                        onChange(prev => ({
                          ...prev,
                          electricity: { ...prev.electricity, hasTransformers: !prev.electricity.hasTransformers }
                        }));
                      }}
                      className={`w-9 h-4.5 rounded-full transition-colors relative ${
                        config.electricity.hasTransformers ? 'bg-purple-500' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                        config.electricity.hasTransformers ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Convex Street Safety Mirror</span>
                    <button
                      onClick={() => {
                        onChange(prev => ({
                          ...prev,
                          electricity: { ...prev.electricity, hasStreetMirror: !prev.electricity.hasStreetMirror }
                        }));
                      }}
                      className={`w-9 h-4.5 rounded-full transition-colors relative ${
                        config.electricity.hasStreetMirror ? 'bg-purple-500' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                        config.electricity.hasStreetMirror ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modern Retrofits: AC Units & Vending Machine */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <label className="font-semibold text-slate-200 block">Modern Retrofit Infrastructure</label>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-slate-300 block">Outdoor AC Split Compressors</span>
                  <span className="text-[10px] text-slate-500">Wall brackets, copper pipes & fan grille</span>
                </div>
                <button
                  onClick={() => {
                    onChange(prev => ({
                      ...prev,
                      electricity: { ...prev.electricity, hasACUnits: !prev.electricity.hasACUnits }
                    }));
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    config.electricity.hasACUnits ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                    config.electricity.hasACUnits ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {config.electricity.hasACUnits && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-400">AC Units Count</span>
                    <span className="font-mono text-emerald-400">{config.electricity.acCount}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={1}
                    value={config.electricity.acCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      onChange(prev => ({ ...prev, electricity: { ...prev.electricity, acCount: val } }));
                    }}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                <div>
                  <span className="text-slate-300 block">Japanese Beverage Vending Machine</span>
                  <span className="text-[10px] text-slate-500">Drink cans display & recycling box</span>
                </div>
                <button
                  onClick={() => {
                    onChange(prev => ({
                      ...prev,
                      electricity: { ...prev.electricity, hasVendingMachine: !prev.electricity.hasVendingMachine }
                    }));
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    config.electricity.hasVendingMachine ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                    config.electricity.hasVendingMachine ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                <div>
                  <span className="text-slate-300 block">Utility Meter Box & Conduits</span>
                  <span className="text-[10px] text-slate-500">Electric meter & vertical pipes</span>
                </div>
                <button
                  onClick={() => {
                    onChange(prev => ({
                      ...prev,
                      electricity: { ...prev.electricity, hasUtilityMeters: !prev.electricity.hasUtilityMeters }
                    }));
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    config.electricity.hasUtilityMeters ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                    config.electricity.hasUtilityMeters ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* SECTION 5: LIGHTS & NEON */}
        {/* ========================================================== */}
        {activeSection === 'lighting' && (
          <div className="space-y-4">
            {/* Master Lighting Boolean */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-semibold text-slate-200 block">Lighting System</label>
                  <span className="text-[11px] text-slate-400">Emissive shaders & dynamic lights</span>
                </div>
                <button
                  onClick={() => {
                    onChange(prev => ({
                      ...prev,
                      lighting: { ...prev.lighting, enabled: !prev.lighting.enabled }
                    }));
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    config.lighting.enabled ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                    config.lighting.enabled ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>
            </div>

            {/* Light Types */}
            {config.lighting.enabled && (
              <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
                <label className="font-semibold text-slate-200 block">Light Fixture Types</label>

                {/* Chōchin Paper Lanterns */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Chōchin Paper Lanterns</span>
                    <button
                      onClick={() => {
                        onChange(prev => ({
                          ...prev,
                          lighting: { ...prev.lighting, hasLanterns: !prev.lighting.hasLanterns }
                        }));
                      }}
                      className={`w-9 h-4.5 rounded-full transition-colors relative ${
                        config.lighting.hasLanterns ? 'bg-amber-500' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                        config.lighting.hasLanterns ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  {config.lighting.hasLanterns && (
                    <div>
                      <div className="flex justify-between mb-1 text-[11px]">
                        <span className="text-slate-400">Lantern Count</span>
                        <span className="font-mono text-amber-400">{config.lighting.lanternCount}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={8}
                        step={1}
                        value={config.lighting.lanternCount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          onChange(prev => ({ ...prev, lighting: { ...prev.lighting, lanternCount: val } }));
                        }}
                        className="w-full accent-amber-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* Vertical Neon Signs */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-slate-300">Vertical Protruding Neon Signs</span>
                  <button
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        lighting: { ...prev.lighting, hasNeonSigns: !prev.lighting.hasNeonSigns }
                      }));
                    }}
                    className={`w-9 h-4.5 rounded-full transition-colors relative ${
                      config.lighting.hasNeonSigns ? 'bg-pink-500' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                      config.lighting.hasNeonSigns ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>

                {/* Eaves LED Wash Strip */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-slate-300">Architectural Eaves LED Wash</span>
                  <button
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        lighting: { ...prev.lighting, hasEavesLED: !prev.lighting.hasEavesLED }
                      }));
                    }}
                    className={`w-9 h-4.5 rounded-full transition-colors relative ${
                      config.lighting.hasEavesLED ? 'bg-amber-500' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                      config.lighting.hasEavesLED ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>

                {/* Facade Spotlights */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-slate-300">Signboard Brass Spotlights</span>
                  <button
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        lighting: { ...prev.lighting, hasSpotlights: !prev.lighting.hasSpotlights }
                      }));
                    }}
                    className={`w-9 h-4.5 rounded-full transition-colors relative ${
                      config.lighting.hasSpotlights ? 'bg-amber-500' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                      config.lighting.hasSpotlights ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>

                {/* Street Lamp on Pole */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-slate-300">Pole-Mounted Street Lamp</span>
                  <button
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        lighting: { ...prev.lighting, hasStreetLamp: !prev.lighting.hasStreetLamp }
                      }));
                    }}
                    className={`w-9 h-4.5 rounded-full transition-colors relative ${
                      config.lighting.hasStreetLamp ? 'bg-amber-500' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                      config.lighting.hasStreetLamp ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {/* Neon Colors */}
            {config.lighting.enabled && config.lighting.hasNeonSigns && (
              <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
                <label className="font-semibold text-slate-200 block">Neon Glow Color</label>
                <div className="flex items-center gap-2">
                  {[
                    '#f72585', // Hot Pink
                    '#00f5d4', // Cyber Cyan
                    '#fee440', // Amber Gold
                    '#7209b7', // Purple
                    '#00b4d8', // Tokyo Blue
                    '#52b788', // Jade Neon
                  ].map(hex => (
                    <button
                      key={hex}
                      onClick={() => {
                        onChange(prev => ({
                          ...prev,
                          lighting: { ...prev.lighting, neonColorPrimary: hex }
                        }));
                      }}
                      style={{ backgroundColor: hex }}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        config.lighting.neonColorPrimary.toLowerCase() === hex.toLowerCase()
                          ? 'border-white scale-110 ring-2 ring-pink-500'
                          : 'border-slate-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================== */}
        {/* SECTION 6: CUSTOM SIGNS & TEXT (USER INPUTS) */}
        {/* ========================================================== */}
        {activeSection === 'signage' && (
          <div className="space-y-4">
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <label className="font-semibold text-slate-200 block">Main Storefront Signboard</label>
              
              <div>
                <span className="text-slate-400 block mb-1">Main Name / Kanji Text</span>
                <input
                  type="text"
                  value={config.signage.mainSignText}
                  onChange={(e) => {
                    const text = e.target.value;
                    onChange(prev => ({ ...prev, signage: { ...prev.signage, mainSignText: text } }));
                  }}
                  placeholder="e.g. 麺屋・桜 または 日本語"
                  className="w-full bg-[#101724] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-medium focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Subtext / English Translation</span>
                <input
                  type="text"
                  value={config.signage.mainSignSubtext}
                  onChange={(e) => {
                    const text = e.target.value;
                    onChange(prev => ({ ...prev, signage: { ...prev.signage, mainSignSubtext: text } }));
                  }}
                  placeholder="e.g. RAMEN & SAKE BAR"
                  className="w-full bg-[#101724] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-medium focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <span className="text-slate-400 block mb-1.5">Signboard Material Style</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'carved_wood', label: 'Gold Carved Timber' },
                    { id: 'neon_lightbox', label: 'Tokyo Lightbox' },
                    { id: 'brass_plate', label: 'Etched Brass Plate' },
                    { id: 'cyber_hologram', label: 'Cyber Matrix Neon' },
                  ].map(s => (
                    <button
                      key={s.id}
                      onClick={() => {
                        onChange(prev => ({
                          ...prev,
                          signage: { ...prev.signage, mainSignStyle: s.id as MainSignStyle }
                        }));
                      }}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        config.signage.mainSignStyle === s.id
                          ? 'bg-emerald-500/20 border-emerald-400 text-white font-medium'
                          : 'bg-[#101724] border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Vertical Blade Neon Text */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <label className="font-semibold text-slate-200 block">Vertical Neon Blade Text</label>
              <input
                type="text"
                value={config.signage.neonVerticalText}
                onChange={(e) => {
                  const text = e.target.value;
                  onChange(prev => ({ ...prev, signage: { ...prev.signage, neonVerticalText: text } }));
                }}
                placeholder="e.g. 居酒屋"
                className="w-full bg-[#101724] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-medium focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500">Characters are automatically stacked vertically.</span>
            </div>

            {/* Paper Lantern Text */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <label className="font-semibold text-slate-200 block">Paper Lantern Kanji Text</label>
              <input
                type="text"
                value={config.signage.lanternText}
                onChange={(e) => {
                  const text = e.target.value;
                  onChange(prev => ({ ...prev, signage: { ...prev.signage, lanternText: text } }));
                }}
                placeholder="e.g. ラーメン, 酒, 祭"
                className="w-full bg-[#101724] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-medium focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Noren Door Curtain Text */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <label className="font-semibold text-slate-200 block">Noren Door Curtain Crest/Kanji</label>
              <input
                type="text"
                maxLength={2}
                value={config.signage.norenText}
                onChange={(e) => {
                  const text = e.target.value;
                  onChange(prev => ({ ...prev, signage: { ...prev.signage, norenText: text } }));
                }}
                placeholder="e.g. 桜, 湯, 茶"
                className="w-full bg-[#101724] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-medium focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Street Posters */}
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-200">Street Wall Posters</label>
                <button
                  onClick={() => {
                    onChange(prev => ({
                      ...prev,
                      signage: { ...prev.signage, hasPosters: !prev.signage.hasPosters }
                    }));
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    config.signage.hasPosters ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                    config.signage.hasPosters ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {config.signage.hasPosters && (
                <div className="space-y-2 pt-1 border-t border-slate-800">
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'cyber_ad', label: 'Cyber Ad' },
                      { id: 'ukiyo_e', label: 'Ukiyo-e Wave' },
                      { id: 'ramen_menu', label: 'Ramen Menu' },
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          onChange(prev => ({
                            ...prev,
                            signage: { ...prev.signage, posterType: p.id as any }
                          }));
                        }}
                        className={`p-1.5 rounded-lg border text-center transition-all ${
                          config.signage.posterType === p.id
                            ? 'bg-emerald-500/20 border-emerald-400 text-white font-medium'
                            : 'bg-[#101724] border-slate-700 text-slate-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={config.signage.posterTitle}
                    onChange={(e) => {
                      const text = e.target.value;
                      onChange(prev => ({ ...prev, signage: { ...prev.signage, posterTitle: text } }));
                    }}
                    placeholder="Poster Headline"
                    className="w-full bg-[#101724] border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* SECTION 7: TATAMI & ZEN PROPS */}
        {/* ========================================================== */}
        {activeSection === 'furniture' && (
          <div className="space-y-4">
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-semibold text-slate-200 block">Interior Zen Furniture</label>
                  <span className="text-[11px] text-slate-400">Visible through glass and open shoji</span>
                </div>
                <button
                  onClick={() => {
                    onChange(prev => ({
                      ...prev,
                      furniture: { ...prev.furniture, enabled: !prev.furniture.enabled }
                    }));
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    config.furniture.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                    config.furniture.enabled ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>

              {config.furniture.enabled && (
                <div className="space-y-2.5 pt-2 border-t border-slate-800">
                  {[
                    { key: 'hasTatami', label: 'Woven Tatami Mats Layout' },
                    { key: 'hasChabudaiTable', label: 'Chabudai Low Wooden Table' },
                    { key: 'hasZafuCushions', label: 'Zafu / Zabuton Cushions' },
                    { key: 'hasShojiScreens', label: 'Shoji Sliding Room Partitions' },
                    { key: 'hasAndonLamp', label: 'Andon Glowing Floor Paper Lamp' },
                    { key: 'hasBonsai', label: 'Potted Miniature Bonsai Pine' },
                    { key: 'hasTeaSet', label: 'Ceramic Tea Ceremony Set' },
                    { key: 'hasNorenCurtain', label: 'Fabric Noren Entrance Curtain' },
                  ].map(f => (
                    <div key={f.key} className="flex items-center justify-between">
                      <span className="text-slate-300">{f.label}</span>
                      <button
                        onClick={() => {
                          onChange(prev => ({
                            ...prev,
                            furniture: {
                              ...prev.furniture,
                              [f.key]: !((prev.furniture as any)[f.key])
                            }
                          }));
                        }}
                        className={`w-9 h-4.5 rounded-full transition-colors relative ${
                          (config.furniture as any)[f.key] ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                          (config.furniture as any)[f.key] ? 'right-1' : 'left-1'
                        }`} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* SECTION 8: ATMOSPHERE & SKY */}
        {/* ========================================================== */}
        {activeSection === 'environment' && (
          <div className="space-y-4">
            <div className="bg-[#182133] p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <label className="font-semibold text-slate-200 block">Atmospheric Environment</label>
              <div className="space-y-2">
                {[
                  { id: 'cyberpunk_night', label: 'Cyberpunk Night (Tokyo Midnight & Neon Fog)' },
                  { id: 'dusk_golden', label: 'Golden Hour Dusk (Sunset Glow & Lanterns)' },
                  { id: 'kyoto_day', label: 'Kyoto Daylight (Crisp Natural Sunlight)' },
                  { id: 'clay_studio', label: 'Studio Clay (Topology & Form Inspection)' },
                ].map(env => (
                  <button
                    key={env.id}
                    onClick={() => {
                      onChange(prev => ({
                        ...prev,
                        rendering: { ...prev.rendering, environment: env.id as EnvironmentMode }
                      }));
                    }}
                    className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between transition-all ${
                      config.rendering.environment === env.id
                        ? 'bg-emerald-500/20 border-emerald-400 text-white font-semibold'
                        : 'bg-[#101724] border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{env.label}</span>
                    {config.rendering.environment === env.id && <Check className="w-4 h-4 text-emerald-400" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* SECTION 9: EXPORT & PIPELINE */}
        {/* ========================================================== */}
        {activeSection === 'export' && (
          <div className="space-y-4">
            <div className="bg-[#182133] p-4 rounded-xl border border-slate-700/60 space-y-3">
              <div>
                <label className="font-semibold text-slate-200 block text-sm">AAA Game Engine Pipeline</label>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  Direct export into Unreal Engine 5, Unity, Blender, or 3D DCC tools with PBR textures and hierarchy.
                </p>
              </div>

              {/* GLB Export */}
              <button
                onClick={onExportGLB}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-lg shadow-emerald-950/40 transition-all text-xs"
              >
                <Download className="w-4 h-4" />
                Export Binary GLB / GLTF (UE5 / Unity)
              </button>

              {/* OBJ Export */}
              <button
                onClick={onExportOBJ}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#1d2638] hover:bg-[#25324a] text-slate-200 font-semibold border border-slate-700 transition-all text-xs"
              >
                <Download className="w-4 h-4" />
                Export Wavefront OBJ
              </button>

              {/* Blender Python Script */}
              <button
                onClick={onExportBlenderScript}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold shadow-lg shadow-orange-950/40 transition-all text-xs"
              >
                <FileCode className="w-4 h-4" />
                Download Blender Python Script (.py)
              </button>

              {/* JSON Config */}
              <button
                onClick={onExportJSON}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-[#121824] hover:bg-[#182133] text-slate-400 hover:text-slate-200 border border-slate-800 transition-all text-xs"
              >
                <FileCode className="w-4 h-4" />
                Save Preset Configuration (JSON)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
