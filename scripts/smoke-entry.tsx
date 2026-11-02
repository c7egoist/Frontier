import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import App from '../src/App'

const errors: string[] = []
const origError = console.error
console.error = (...args: unknown[]) => {
  const msg = args.map(String).join(' ')
  if (!msg.includes('act(') && !msg.includes('deprecated')) errors.push(msg)
  origError(...args)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function clickByText(text: string, tag = 'button') {
  const nodes = Array.from(document.querySelectorAll(tag)) as HTMLElement[]
  const el = nodes.find((n) => (n.textContent || '').trim().toLowerCase().includes(text.toLowerCase()))
  if (!el) throw new Error(`No ${tag} containing "${text}"`)
  await act(async () => {
    el.click()
    await sleep(20)
  })
  return el
}

function report(label: string, extra = '') {
  const text = document.body.textContent || ''
  console.log(`✓ ${label} — ${text.length} chars${extra ? ` ${extra}` : ''}`)
}

export async function run() {
  const root = createRoot(document.getElementById('root')!)
  await act(async () => {
    root.render(<App />)
    await sleep(60)
  })
  report('home mounted')

  const navButtons = Array.from(document.querySelectorAll('.rail__nav .rail__btn')) as HTMLElement[]
  const pages = ['Home', 'Store', 'Library', 'Queue', 'Social']
  for (let i = 0; i < navButtons.length; i++) {
    await act(async () => {
      navButtons[i].click()
      await sleep(80)
    })
    report(`page: ${pages[i]}`)
    const title = document.querySelector('.page .display, .page h1')
    if (!title) throw new Error(`page ${pages[i]} has no title`)
  }

  // library list view
  await act(async () => {
    const libBtn = Array.from(document.querySelectorAll('.rail__nav .rail__btn'))[2] as HTMLElement
    libBtn.click()
    await sleep(60)
  })
  await act(async () => {
    ;(document.querySelector('[aria-label="List view"]') as HTMLElement).click()
    await sleep(60)
  })
  report('library list mode', `${document.querySelectorAll('.lib-row').length} rows`)
  await act(async () => {
    ;(document.querySelector('[aria-label="Grid view"]') as HTMLElement).click()
    await sleep(60)
  })
  report('library grid mode', `${document.querySelectorAll('.cover').length} covers`)

  // install flow from store
  await act(async () => {
    ;(Array.from(document.querySelectorAll('.rail__nav .rail__btn'))[1] as HTMLElement).click()
    await sleep(60)
  })
  const pills = Array.from(document.querySelectorAll('.play-pill')) as HTMLElement[]
  const installPill = pills.find((p) => (p.textContent || '').toLowerCase().includes('install')) as HTMLElement
  if (!installPill) throw new Error('no install pill found in store')
  await act(async () => {
    installPill.click()
    await sleep(60)
  })
  report('install triggered', `${document.querySelectorAll('.toast').length} toast(s)`)

  // game detail flow
  const card = document.querySelector('.store-card') as HTMLElement
  await act(async () => {
    card?.click()
    await sleep(80)
  })
  if (!document.querySelector('.game-hero')) throw new Error('game detail hero missing')
  report('game detail', `${document.querySelectorAll('.gallery__tile').length} gallery tiles`)

  for (const tabName of ['Achievements', 'Sessions', 'Specs', 'Overview']) {
    await act(async () => {
      const btn = Array.from(document.querySelectorAll('.game-tabs button')).find((b) =>
        (b.textContent || '').includes(tabName),
      ) as HTMLElement
      btn.click()
      await sleep(50)
    })
    report(`game tab: ${tabName}`)
  }

  // launch a game
  const playBtn = Array.from(document.querySelectorAll('.game-hero button')).find((b) =>
    (b.textContent || '').includes('Play'),
  ) as HTMLElement
  await act(async () => {
    playBtn.click()
    await sleep(120)
  })
  if (!document.querySelector('.launch')) throw new Error('launch overlay missing')
  report('launch overlay open', `${document.querySelector('.launch__pct')?.textContent}`)
  let waited = 0
  while (!document.querySelector('.playerbar--session') && waited < 7000) {
    await act(async () => {
      await sleep(250)
    })
    waited += 250
  }
  if (!document.querySelector('.playerbar--session')) throw new Error('session bar missing after launch')
  report('session opened', document.querySelector('.session-time')?.textContent || '')
  await act(async () => {
    const stopBtn = Array.from(document.querySelectorAll('.playerbar--session button')).find((b) =>
      (b.textContent || '').includes('End session'),
    ) as HTMLElement
    stopBtn.click()
    await sleep(60)
  })
  report('session ended')

  // search overlay
  await act(async () => {
    ;(document.querySelector('.search-trigger') as HTMLElement).click()
    await sleep(60)
  })
  const input = document.querySelector('.search-panel input') as HTMLInputElement
  if (!input) throw new Error('search panel missing')
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, 'void')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(60)
  })
  report('search filtered', `${document.querySelectorAll('.search-row').length} rows`)
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await sleep(60)
  })
  await act(async () => {
    ;(document.querySelector('.search-trigger') as HTMLElement).click()
    await sleep(50)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await sleep(60)
  })

  // control center
  await act(async () => {
    const ccBtn = document.querySelectorAll('.topbar__right .icon-btn')
    ;(ccBtn[ccBtn.length - 1] as HTMLElement).click()
    await sleep(80)
  })
  if (!document.querySelector('.control-center')) throw new Error('control center missing')
  report('control center open', `${document.querySelectorAll('.swatch').length} accents`)
  for (const t of ['Performance', 'Audio', 'System', 'Appearance']) {
    await act(async () => {
      const btn = Array.from(document.querySelectorAll('.cc-tabs button')).find((b) => (b.textContent || '').includes(t)) as HTMLElement
      btn.click()
      await sleep(50)
    })
    report(`cc tab: ${t}`)
  }
  await act(async () => {
    ;(document.querySelector('.control-center .swatch:nth-child(3)') as HTMLElement).click()
    await sleep(50)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await sleep(60)
  })
  report('control center closed')

  // notifications
  await act(async () => {
    const bell = Array.from(document.querySelectorAll('.icon-btn')).find((b) => b.getAttribute('aria-label') === 'Notifications') as HTMLElement
    bell.click()
    await sleep(60)
  })
  report('notifications', `${document.querySelectorAll('.notif__item').length} items`)

  // downloads pause / order
  await act(async () => {
    ;(Array.from(document.querySelectorAll('.rail__nav .rail__btn'))[3] as HTMLElement).click()
    await sleep(80)
  })
  await act(async () => {
    const pause = Array.from(document.querySelectorAll('.dl-row .icon-btn'))[0] as HTMLElement
    pause.click()
    await sleep(40)
    const up = Array.from(document.querySelectorAll('.dl-order .icon-btn'))[2] as HTMLElement
    up?.click()
    await sleep(40)
  })
  report('transfers interactions', `${document.querySelectorAll('.dl-row').length} rows`)

  // network
  await act(async () => {
    ;(Array.from(document.querySelectorAll('.rail__nav .rail__btn'))[4] as HTMLElement).click()
    await sleep(80)
  })
  report('network', `${document.querySelectorAll('.friend-row').length} friends`)
  await act(async () => {
    const accept = document.querySelector('.requests__accept') as HTMLElement
    accept?.click()
    await sleep(40)
  })
  report('friend request accepted')

  if (errors.length) {
    console.log('\nCONSOLE ERRORS:')
    errors.forEach((e) => console.log(e.slice(0, 600)))
    throw new Error(`${errors.length} console errors`)
  }
  console.log('\nSMOKE OK')
}
