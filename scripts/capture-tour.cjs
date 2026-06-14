// Captures real screenshots of every user-facing screen for the 30s site tour.
// Drives the BUILT app in the seeded demo vault via Playwright-Electron WITHOUT
// recordVideo (which hangs the page under Electron). Screenshots are reliable.
//   npm run build && node scripts/capture-tour.cjs
const { _electron: electron } = require('playwright')
const electronBin = require('electron')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const MAIN = path.join(ROOT, 'out', 'main', 'index.js')
const DIR = path.join(ROOT, 'site', 'media', 'tour')
const SIZE = { width: 1280, height: 800 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => {
  const s = a.join(' ')
  fs.appendFileSync(path.join(DIR, 'capture.log'), s + '\n')
  console.log(s)
}

;(async () => {
  if (!fs.existsSync(MAIN)) {
    console.error('Build first: npm run build')
    process.exit(1)
  }
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(path.join(DIR, 'capture.log'), 'capture ' + new Date().toISOString() + '\n')

  const app = await electron.launch({
    executablePath: electronBin,
    args: [MAIN],
    env: { ...process.env, VA_VAULT: 'demo' }
  })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => log('[pageerror]', e.message))
  await page.setViewportSize(SIZE).catch(() => {})
  const ready = await page.waitForSelector('.wordmark', { timeout: 25000 }).then(() => true).catch(() => false)
  log('ready:', ready)
  await page.evaluate(() => window.vault?.advice?.consentSet?.(true)).catch(() => {})

  const shot = async (name) => {
    const p = path.join(DIR, name)
    await page.screenshot({ path: p }).catch((e) => log('shot err', name, e.message))
    log('shot', name)
  }
  const click = async (sel) => {
    const el = page.locator(sel).first()
    const ok = await el.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
    if (ok) await el.click({ timeout: 4000 }).catch((e) => log('click err', sel, e.message))
    return ok
  }
  const waitFor = (sel, t = 5000) =>
    page.locator(sel).first().waitFor({ state: 'visible', timeout: t }).then(() => true).catch(() => false)
  const scrollTo = (sel) =>
    page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center', behavior: 'instant' }), sel)
  // The modal closes on a backdrop click; clicking .overlay's center hits the
  // modal content (stopPropagation). Click a backdrop coordinate on the left.
  const closeModal = async () => {
    await page.mouse.click(40, 400).catch(() => {})
    await page.locator('.modal').first().waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
    await sleep(300)
  }

  // 1. Ledger
  await waitFor('.acard', 15000)
  await sleep(800)
  await shot('01-ledger.png')

  // 2. Accounts (new) — top, then holdings detail with gains
  await click('.navbtn:has-text("Accounts")')
  await waitFor('.acct-group')
  await sleep(700)
  await shot('02-accounts.png')
  await scrollTo('.acct-items')
  await sleep(600)
  await shot('03-accounts-detail.png')

  // 3. Advice card with citations + checklist
  await click('.navbtn:has-text("Ledger")')
  await waitFor('.acard')
  await sleep(400)
  if (await click('.acard:has-text("NVIDIA")')) {
    await waitFor('.modal')
    await sleep(700)
    await shot('04-advice.png')
    await scrollTo('.modal .checklist')
    await sleep(600)
    await shot('05-checklist.png')
    await closeModal()
  }

  // 4. A second advice domain (tax-loss harvest)
  if (await click('.acard:has-text("ARKK")')) {
    await waitFor('.modal')
    await sleep(700)
    await shot('06-advice2.png')
    await closeModal()
  }

  // 5. Conversational advisor (seeded history) — needs sign-in; skip cleanly if gated
  await click('.navbtn:has-text("Chat")')
  if (await waitFor('.drawer', 6000)) {
    await sleep(900)
    await shot('07-chat.png')
    await page.locator('.chat-head .btn-quiet').click({ timeout: 3000 }).catch(() => {})
    await sleep(400)
  } else {
    log('chat gated (no sign-in) — skipped')
  }

  // 6. Profile
  await click('.navbtn:has-text("Profile")')
  if (await waitFor('.profile', 6000)) {
    await sleep(700)
    await shot('08-profile.png')
  }

  await app.close()
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png'))
  log('captured', files.length, 'frames:', files.join(', '))
})().catch((e) => {
  try {
    fs.appendFileSync(path.join(DIR, 'capture.log'), 'FATAL ' + (e.stack || e) + '\n')
  } catch {}
  console.error(e)
  process.exit(1)
})
