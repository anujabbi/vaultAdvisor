// Records a calm ~30s guided tour of the real VaultAdvisor app to
// site/media/demo-tour.webm, and writes site/media/tour-cues.json — caption cues
// timestamped against the video clock so the site can sync captions to playback.
//
// Drives the BUILT app (out/main) via Playwright-Electron with recordVideo, in the
// seeded John Doe demo vault. recordVideo needs Playwright's bundled ffmpeg, or the
// page hangs silently (microsoft/playwright#33899): npx playwright install ffmpeg
//
//   npm run build && node scripts/record-demo.cjs
const { _electron: electron } = require('playwright')
const electronBin = require('electron')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'site', 'media')
const MAIN = path.join(ROOT, 'out', 'main', 'index.js')
const SIZE = { width: 1280, height: 800 }
const LOG = path.join(OUT_DIR, 'record.log')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => {
  const s = a.join(' ')
  try { fs.appendFileSync(LOG, s + '\n') } catch {}
  console.log(s)
}

;(async () => {
  if (!fs.existsSync(MAIN)) { console.error('Build first: npm run build'); process.exit(1) }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(LOG, 'record ' + new Date().toISOString() + '\n')

  const app = await electron.launch({
    executablePath: electronBin,
    args: [MAIN],
    env: { ...process.env, VA_VAULT: 'demo' },
    recordVideo: { dir: OUT_DIR, size: SIZE }
  })
  // Video recording starts at context creation (~now). Cue times are measured
  // from here so they line up with the saved video's clock.
  const tVid = Date.now()
  const page = await app.firstWindow()
  page.on('pageerror', (e) => log('[pageerror]', e.message))
  await page.setViewportSize(SIZE).catch(() => {})
  const ready = await page.waitForSelector('.wordmark', { timeout: 25000 }).then(() => true).catch(() => false)
  log('renderer ready:', ready)

  await page.addStyleTag({
    content: `#__cur{position:fixed;z-index:2147483647;width:24px;height:24px;margin:-12px 0 0 -12px;
      border-radius:50%;background:radial-gradient(circle at 35% 35%,#f6e3a6,#c8a24b 58%,rgba(200,162,75,0) 72%);
      box-shadow:0 0 18px rgba(200,162,75,.9);pointer-events:none;left:640px;top:400px;
      transition:left .9s cubic-bezier(.45,0,.18,1),top .9s cubic-bezier(.45,0,.18,1)}`
  }).catch(() => {})
  await page.evaluate(() => {
    const c = document.createElement('div'); c.id = '__cur'; document.body.appendChild(c)
    window.__moveCur = (x, y) => { c.style.left = x + 'px'; c.style.top = y + 'px' }
  }).catch(() => {})
  await page.evaluate(() => window.vault?.advice?.consentSet?.(true)).catch(() => {})

  const cues = []
  const cue = (mini, html, voice) => {
    cues.push({ t: +((Date.now() - tVid) / 1000).toFixed(2), mini, html, voice })
    log('cue', cues[cues.length - 1].t, mini)
  }
  async function point(selector, { click = false, settle = 800 } = {}) {
    const el = page.locator(selector).first()
    const ok = await el.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
    if (!ok) { log('miss', selector); return false }
    const box = await el.boundingBox()
    if (box) {
      await page.evaluate(([x, y]) => window.__moveCur(x, y), [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)])
      await sleep(950)
    }
    if (click) await el.click({ timeout: 4000 }).catch((e) => log('click err', selector, e.message))
    await sleep(settle)
    return true
  }
  const scrollSmooth = async (sel, dwell) => {
    await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), sel)
    await sleep(dwell)
  }
  const closeModal = async () => {
    await page.evaluate(() => window.__moveCur(70, 410)); await sleep(700)
    await page.mouse.click(40, 410).catch(() => {})
    await page.locator('.modal').first().waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
    await sleep(500)
  }

  // ---- the tour (calm, ~30s) ----
  await page.waitForSelector('.acard', { timeout: 15000 }).catch(() => {})
  cue('Private · Local · Yours', 'Your whole financial picture — <b>on your machine</b>, never our servers.',
    'Your whole financial picture — stored on your machine, never our servers.')
  await sleep(4200)

  await point('.navbtn:has-text("Accounts")', { click: true, settle: 700 })
  cue('Accounts', 'Every asset you upload, <b>grouped by account</b>.', 'Every asset you upload, grouped by account.')
  await sleep(1700)
  await point('.acct-name', { settle: 1300 })
  await scrollSmooth('.acct-items', 600)
  cue('Your assets', 'Cost basis, acquired dates and <b>unrealized gains</b> at a glance.',
    'Cost basis, acquired dates, and unrealized gains, at a glance.')
  await sleep(3000)

  await point('.navbtn:has-text("Ledger")', { click: true, settle: 1100 })
  if (await point('.acard:has-text("NVIDIA")', { click: true, settle: 700 })) {
    cue('Advice with receipts', 'Each card explains the <b>why</b> — exact math, cited sources.',
      'Each card explains the why, with exact math and cited sources.')
    await sleep(2600)
    await scrollSmooth('.modal .checklist', 600)
    cue('Execution', 'And ends in a <b>checklist you tick off</b> yourself.',
      'And it ends in a manual checklist you tick off yourself.')
    await sleep(2800)
    await closeModal()
  }

  if (await point('.acard:has-text("ARKK")', { click: true, settle: 700 })) {
    cue('Opportunities', 'Tax-loss harvesting, idle cash, <b>401(k) headroom</b> and more.',
      'Tax-loss harvesting, idle cash, 401k headroom, and more.')
    await sleep(3200)
    await closeModal()
  }

  await point('.navbtn:has-text("Profile")', { click: true, settle: 700 })
  cue('Yours alone', 'Tuned to your goals — analyzed only by <b>your own Claude</b>.',
    'Tuned to your goals, and analyzed only by your own Claude. No account linking.')
  await sleep(3800)

  log('closing to flush video')
  const video = page.video()
  await app.close()
  let saved = null
  try { saved = video ? await video.path() : null } catch (e) { log('video.path err', e.message) }
  if (saved && fs.existsSync(saved) && fs.statSync(saved).size > 0) {
    const dest = path.join(OUT_DIR, 'demo-tour.webm')
    fs.copyFileSync(saved, dest); fs.rmSync(saved, { force: true })
    fs.writeFileSync(path.join(OUT_DIR, 'tour-cues.json'), JSON.stringify(cues, null, 2))
    log('Saved', dest, Math.round(fs.statSync(dest).size / 1024), 'KB ·', cues.length, 'cues')
  } else {
    log('No usable video (saved=' + saved + ')'); process.exit(1)
  }
})().catch((e) => { log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(1) })
