import { useState } from 'react'
import {
  X,
  Palette,
  Gauge,
  Volume2,
  Wrench,
  Check,
  Sparkles,
  Monitor,
  Cpu,
  HardDrive,
  ShieldCheck,
  LogOut,
  RefreshCw,
  Zap,
  Gamepad2,
  Cloud,
  Smartphone,
  CircleUser,
} from 'lucide-react'
import { useLauncher } from '../state/launcher'
import { palettes } from '../data/games'
import { Avatar, Meter } from './ui'

type Tab = 'appearance' | 'performance' | 'audio' | 'system'

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`switch${on ? ' is-on' : ''}`} aria-hidden="true">
      <span />
    </span>
  )
}

function ToggleRow({
  title,
  desc,
  on,
  onChange,
}: {
  title: string
  desc: string
  on: boolean
  onChange: () => void
}) {
  return (
    <button className={`toggle-row${on ? ' is-on' : ''}`} onClick={onChange} aria-pressed={on}>
      <span>
        <b>{title}</b>
        <small>{desc}</small>
      </span>
      <Switch on={on} />
    </button>
  )
}

const telemetry: { label: string; val: number; Icon: typeof Cpu; note: string }[] = [
  { label: 'GPU load', val: 72, Icon: Cpu, note: '61°C' },
  { label: 'GPU memory', val: 59, Icon: HardDrive, note: '9.4 / 16 GB' },
  { label: 'CPU load', val: 34, Icon: Cpu, note: '54°C' },
  { label: 'Frame time', val: 46, Icon: Zap, note: '6.9 ms' },
]

export function ControlCenter() {
  const {
    controlOpen,
    setControlOpen,
    accentId,
    setAccentId,
    reduceMotion,
    setReduceMotion,
    performanceOverlay,
    setPerformanceOverlay,
    uiScale,
    setUiScale,
    instantLaunch,
    setInstantLaunch,
    volume,
    setVolume,
    playing,
    setPlaying,
    notify,
    wishlist,
    states,
  } = useLauncher()

  const [tab, setTab] = useState<Tab>('appearance')
  const [renderer, setRenderer] = useState<'Vulkan' | 'DX12' | 'Metal'>('Vulkan')
  const [quality, setQuality] = useState<'Performance' | 'Balanced' | 'Quality'>('Balanced')
  const [fpsCap, setFpsCap] = useState('144')
  const [frameGen, setFrameGen] = useState(true)
  const [reflex, setReflex] = useState(true)
  const [hdr, setHdr] = useState(true)
  const [spatial, setSpatial] = useState(true)
  const [ducking, setDucking] = useState(false)
  const [startupSound, setStartupSound] = useState(true)
  const [musicVol, setMusicVol] = useState(64)
  const [output, setOutput] = useState('Quantum-7 USB')
  const [channel, setChannel] = useState<'Stable' | 'Beta' | 'Nightly'>('Stable')
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [cloudSync, setCloudSync] = useState(true)
  const [recording, setRecording] = useState(false)

  if (!controlOpen) return null

  const installed = Object.values(states).filter((s) => s === 'installed').length
  const save = (label: string) => notify('Preference saved', label, '#b48bff')

  return (
    <>
      <div className="cc-scrim" onClick={() => setControlOpen(false)} />
      <aside className="control-center" role="dialog" aria-modal="true" aria-label="Control Center">
        <header className="cc-head">
          <div>
            <span className="label">AXIOM / SYSTEM</span>
            <h2 className="display">Control Center</h2>
          </div>
          <button className="icon-btn" onClick={() => setControlOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="cc-scroll">
          <div className="cc-account panel panel--flat">
            <Avatar initials="YO" accent="var(--accent)" size={48} ring />
            <div className="cc-account__meta">
              <div className="cc-account__row">
                <b>Operator</b>
                <span className="tag tag--accent mono">LVL 48</span>
              </div>
              <span className="mono t3">@operator · AXIOM ID 0041-882</span>
              <Meter value={68} thin />
              <span className="mono cc-account__xp">8,260 / 12,000 XP to level 49</span>
            </div>
            <button className="icon-btn" aria-label="Account settings" onClick={() => save('Profile')}>
              <CircleUser size={17} />
            </button>
          </div>

          <div className="cc-quickstats">
            <div><span className="label">Installed</span><b className="mono">{installed}</b></div>
            <div><span className="label">Wishlist</span><b className="mono">{wishlist.length}</b></div>
            <div><span className="label">Credits</span><b className="mono">1,290</b></div>
            <div><span className="label">Storage</span><b className="mono">41%</b></div>
          </div>

          <div className="segmented cc-tabs">
            {(
              [
                ['appearance', 'Appearance', Palette],
                ['performance', 'Performance', Gauge],
                ['audio', 'Audio', Volume2],
                ['system', 'System', Wrench],
              ] as [Tab, string, typeof Palette][]
            ).map(([id, label, Icon]) => (
              <button key={id} className={`segmented__btn${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {tab === 'appearance' && (
            <div className="cc-section">
              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Accent profile</span>
                  <span className="mono t3">Applied instantly</span>
                </div>
                <div className="swatches">
                  {palettes.map((p) => (
                    <button
                      key={p.id}
                      className={`swatch${accentId === p.id ? ' is-active' : ''}`}
                      onClick={() => setAccentId(p.id)}
                      aria-label={p.name}
                    >
                      <span className="swatch__chip" style={{ background: p.hex }}>
                        {accentId === p.id && <Check size={14} />}
                      </span>
                      <span className="swatch__name">
                        {p.name}
                        <span className="mono t3">{p.hex}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="cc-preview">
                  <Sparkles size={13} />
                  <span>
                    Accents recolor buttons, meters and the live runtime glow. The rest of the interface
                    stays warm black for contrast.
                  </span>
                </div>
              </div>

              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Interface</span>
                </div>
                <ToggleRow
                  title="Performance overlay"
                  desc="Pin frame time, GPU and VRAM readouts over the interface"
                  on={performanceOverlay}
                  onChange={() => setPerformanceOverlay(!performanceOverlay)}
                />
                <ToggleRow
                  title="Reduce motion"
                  desc="Disable cover parallax and staged transitions"
                  on={reduceMotion}
                  onChange={() => setReduceMotion(!reduceMotion)}
                />
                <ToggleRow
                  title="Launch sequence"
                  desc="Stage shaders before the session opens. Off skips straight in."
                  on={!instantLaunch}
                  onChange={() => setInstantLaunch(!instantLaunch)}
                />
              </div>

              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Interface scale</span>
                  <span className="mono t3">1440p native</span>
                </div>
                <div className="scale-preview">
                  {[
                    ['Compact', 0.94],
                    ['Standard', 1],
                    ['Cinema', 1.06],
                  ].map(([label, value]) => (
                    <button
                      key={label as string}
                      className={`scale-preview__row${uiScale === value ? ' is-active' : ''}`}
                      onClick={() => setUiScale(value as number)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'performance' && (
            <div className="cc-section">
              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Graphics API</span>
                  <span className="mono t3">Restart to apply</span>
                </div>
                <div className="segmented segmented--wide">
                  {(['Vulkan', 'DX12', 'Metal'] as const).map((r) => (
                    <button
                      key={r}
                      className={`segmented__btn${renderer === r ? ' is-active' : ''}`}
                      onClick={() => {
                        setRenderer(r)
                        save(`Renderer · ${r}`)
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Quality preset</span>
                </div>
                <div className="preset-grid">
                  {(
                    [
                      ['Performance', '1080p · low', '0-120 Hz'],
                      ['Balanced', '1440p · high', '—'],
                      ['Quality', '4K · ultra', 'HDR'],
                    ] as [typeof quality, string, string][]
                  ).map(([name, spec, badge]) => (
                    <button
                      key={name}
                      className={`preset${quality === name ? ' is-active' : ''}`}
                      onClick={() => {
                        setQuality(name)
                        save(`Quality · ${name}`)
                      }}
                    >
                      <b>{name}</b>
                      <span className="mono t3">{spec}</span>
                      {badge && <span className="preset__badge mono">{badge}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Frame cap</span>
                </div>
                <div className="chip-row">
                  {['60', '120', '144', '240', 'Unlimited'].map((f) => (
                    <button
                      key={f}
                      className={`chip${fpsCap === f ? ' is-active' : ''}`}
                      onClick={() => {
                        setFpsCap(f)
                        save(`Frame cap · ${f}`)
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cc-block">
                <ToggleRow title="AXIOM Reflex" desc="Low-latency pipeline, sub-8ms input" on={reflex} onChange={() => setReflex(!reflex)} />
                <ToggleRow title="Frame generation" desc="Interpolated frames on supported titles" on={frameGen} onChange={() => setFrameGen(!frameGen)} />
                <ToggleRow title="HDR output" desc="10-bit, tone-mapped per title" on={hdr} onChange={() => setHdr(!hdr)} />
              </div>

              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Live telemetry</span>
                  <span className="mono t3">JHB edge</span>
                </div>
                <div className="cc-telemetry">
                  {telemetry.map(({ label, val, Icon, note }) => (
                    <div className="cc-telemetry__row" key={label}>
                      <span className="cc-telemetry__label"><Icon size={12} /> {label}</span>
                      <Meter value={val} thin />
                      <span className="mono t3">{note}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'audio' && (
            <div className="cc-section">
              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Master</span>
                  <span className="mono t3">{volume}%</span>
                </div>
                <div className="slider-row">
                  <Volume2 size={15} className="t3" />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    style={{ '--vol': `${volume}%` } as React.CSSProperties}
                    aria-label="Master volume"
                  />
                </div>
                <div className="slider-row">
                  <Sparkles size={15} className="t3" />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={musicVol}
                    onChange={(e) => setMusicVol(Number(e.target.value))}
                    style={{ '--vol': `${musicVol}%` } as React.CSSProperties}
                    aria-label="Music volume"
                  />
                  <span className="mono t3">{musicVol}%</span>
                </div>
                <button className={`toggle-row${playing ? ' is-on' : ''}`} onClick={() => setPlaying(!playing)} aria-pressed={playing}>
                  <span>
                    <b>Ambient radio</b>
                    <small>Loop AXIOM-owned soundtracks between sessions</small>
                  </span>
                  <Switch on={playing} />
                </button>
              </div>

              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Output device</span>
                </div>
                <div className="device-list">
                  {['Quantum-7 USB', 'Display speakers', 'HDMI · Lounge', 'Bluetooth · WH-1000'].map((d) => (
                    <button
                      key={d}
                      className={`device${output === d ? ' is-active' : ''}`}
                      onClick={() => {
                        setOutput(d)
                        save(`Output · ${d}`)
                      }}
                    >
                      <span>{d}</span>
                      {output === d ? <Check size={14} /> : <span className="mono t3">—</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cc-block">
                <ToggleRow title="Spatial audio" desc="Object-based mixing for supported titles" on={spatial} onChange={() => setSpatial(!spatial)} />
                <ToggleRow title="Voice ducking" desc="Lower game audio when the party speaks" on={ducking} onChange={() => setDucking(!ducking)} />
                <ToggleRow title="Launch sound" desc="Play the AXIOM chime on cold start" on={startupSound} onChange={() => setStartupSound(!startupSound)} />
              </div>
            </div>
          )}

          {tab === 'system' && (
            <div className="cc-section">
              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Runtime</span>
                  <span className="tag tag--ok mono"><span className="dot dot--live" /> HEALTHY</span>
                </div>
                <div className="sys-rows">
                  <div><span>Version</span><span className="mono">2.4.17 · stable</span></div>
                  <div><span>Renderer</span><span className="mono">{renderer} 1.4</span></div>
                  <div><span>Device</span><span className="mono">AXIOM STATION</span></div>
                  <div><span>Uptime</span><span className="mono">3d 14h 02m</span></div>
                  <div><span>Update channel</span>
                    <span className="segmented segmented--sm segmented--inline">
                      {(['Stable', 'Beta', 'Nightly'] as const).map((c) => (
                        <button key={c} className={`segmented__btn${channel === c ? ' is-active' : ''}`} onClick={() => setChannel(c)}>
                          {c}
                        </button>
                      ))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="cc-block">
                <ToggleRow title="Automatic updates" desc="Install patches during the off-peak window" on={autoUpdate} onChange={() => setAutoUpdate(!autoUpdate)} />
                <ToggleRow title="Cloud saves" desc="Sync saves and settings across devices" on={cloudSync} onChange={() => setCloudSync(!cloudSync)} />
                <ToggleRow title="Session recording" desc="Buffer the last 60 seconds of gameplay" on={recording} onChange={() => setRecording(!recording)} />
              </div>

              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Storage</span>
                  <span className="mono t3">412 GB used</span>
                </div>
                <div className="path-row mono">
                  <HardDrive size={13} />
                  <span>/axiom/content/volume-1</span>
                  <button className="icon-btn" onClick={() => save('Library folder')} aria-label="Change path">
                    <RefreshCw size={13} />
                  </button>
                </div>
                <div className="cc-actions">
                  <button className="btn btn--outline btn--sm" onClick={() => notify('Verifying builds', '12 titles queued · SHA-256 manifests')}>
                    <ShieldCheck size={13} /> Verify all builds
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => notify('Shader cache rebuilt', '1,204 programs · 412 MB reclaimed')}>
                    <RefreshCw size={13} /> Rebuild shader cache
                  </button>
                </div>
              </div>

              <div className="cc-block">
                <div className="cc-block__head">
                  <span className="label">Connected</span>
                </div>
                <div className="sys-rows">
                  <div><span><Gamepad2 size={12} /> Controller</span><span className="mono">DualSense · 82%</span></div>
                  <div><span><Smartphone size={12} /> AXIOM mobile</span><span className="mono" style={{ color: 'var(--ok)' }}>Paired</span></div>
                  <div><span><Cloud size={12} /> Cloud relay</span><span className="mono">FRA-2 · 18ms</span></div>
                  <div><span><Monitor size={12} /> Display</span><span className="mono">4K 120 · HDR10</span></div>
                </div>
              </div>

              <button className="cc-signout" onClick={() => notify('Signed out', 'Session token revoked on this device')}>
                <LogOut size={14} /> Sign out of AXIOM
              </button>
            </div>
          )}
        </div>

        <footer className="cc-foot">
          <span className="mono">BUILD 2.4.17 · {renderer.toUpperCase()}</span>
          <button
            className="cc-foot__reset"
            onClick={() => {
              setAccentId('ember')
              setReduceMotion(false)
              setPerformanceOverlay(false)
              notify('Interface reset', 'Accent and motion preferences restored')
            }}
          >
            Reset preferences
          </button>
        </footer>
      </aside>
    </>
  )
}
