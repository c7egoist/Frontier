import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const cssFiles = fs.readdirSync('src/styles').map((f) => path.join('src/styles', f))
const defined = new Set()
for (const f of cssFiles) {
  const css = fs.readFileSync(f, 'utf8')
  try {
    postcss.parse(css)
  } catch (e) {
    console.log('CSS PARSE ERROR in', f, e.message)
  }
  for (const m of css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) defined.add(m[1])
}
console.log('css classes:', defined.size)

const files = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e.name)) files.push(p)
  }
}
walk('src')
const used = new Map()
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
    const raw = m[1] || m[2] || m[3] || ''
    const literal = raw.replace(/\$\{[^}]*\}/g, ' ')
    for (const cls of literal.split(/\s+/)) {
      if (!cls || cls.includes('${')) continue
      used.set(cls, (used.get(cls) || 0) + 1)
    }
  }
}
const missing = [...used.keys()].filter((c) => !defined.has(c)).sort()
console.log('\nused class tokens:', used.size)
console.log('unstyled tokens:', missing.length)
console.log(missing.join('\n'))

console.log('\nCSS rules:', (() => { let n = 0; for (const f of cssFiles) { const css = fs.readFileSync(f,'utf8'); n += (css.match(/{/g)||[]).length } return n })())
