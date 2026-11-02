import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
})

const { window } = dom
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.HTMLElement = window.HTMLElement
globalThis.HTMLInputElement = window.HTMLInputElement
globalThis.Node = window.Node
globalThis.Event = window.Event
globalThis.MouseEvent = window.MouseEvent
globalThis.KeyboardEvent = window.KeyboardEvent
globalThis.getComputedStyle = window.getComputedStyle
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false,
  media: q,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false },
}))
window.HTMLElement.prototype.scrollIntoView = function () {}
window.HTMLElement.prototype.scrollTo = function () {}

await build({
  entryPoints: ['scripts/smoke-entry.tsx'],
  bundle: true,
  format: 'esm',
  outfile: 'scripts/.smoke-bundle.mjs',
  jsx: 'automatic',
  loader: { '.css': 'empty', '.woff2': 'empty' },
  external: [],
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'error',
})

const mod = await import(pathToFileURL(path.resolve('scripts/.smoke-bundle.mjs')).href)
try {
  await mod.run()
  process.exit(0)
} catch (err) {
  console.log('\nSMOKE FAILED:', err.message)
  process.exit(1)
}
