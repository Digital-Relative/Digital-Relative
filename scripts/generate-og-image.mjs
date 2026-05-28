/**
 * Generate a 1200×630 OG/Twitter social card to public/brand/og-image.png.
 *
 * Requires puppeteer. Run with: `node scripts/generate-og-image.mjs`
 * (or `npm run og-image` once you've installed puppeteer).
 *
 * The card is rendered from an inline HTML template — edit `TEMPLATE` below
 * to tweak the design. Commit the resulting PNG to public/brand/.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const OUTPUT = resolve(projectRoot, 'public/brand/og-image.png')

const TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;600&display=swap');
  html, body { margin: 0; padding: 0; }
  body {
    width: 1200px; height: 630px;
    background: linear-gradient(135deg, #0d1b2a 0%, #162d44 100%);
    color: #f0ece2;
    font-family: 'DM Sans', system-ui, sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 64px 80px; box-sizing: border-box;
    position: relative; overflow: hidden;
  }
  .glow { position: absolute; width: 600px; height: 600px; border-radius: 50%;
    background: radial-gradient(circle, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0) 70%);
    top: -200px; right: -200px; }
  .logo-row { display: flex; align-items: center; gap: 14px; }
  .logo-mark { width: 56px; height: 56px; }
  .brand { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 36px; color: #c9a84c; font-weight: 600; }
  h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 76px; font-weight: 600;
    color: #f0ece2; margin: 0; line-height: 1.05; max-width: 1000px; }
  .sub { font-size: 28px; color: #dde5ee; line-height: 1.4; max-width: 900px; margin-top: 24px; }
  .footer { display: flex; gap: 18px; font-size: 20px; color: #7a93aa; }
  .footer span { padding: 6px 14px; border: 1px solid rgba(201,168,76,0.4); border-radius: 99px; color: #c9a84c; }
</style></head>
<body>
  <div class="glow"></div>
  <div class="logo-row">
    <svg class="logo-mark" viewBox="0 0 100 100">
      <g transform="translate(50,58)">
        <rect x="-4" y="6" width="8" height="24" rx="2" fill="#c9a84c"/>
        <path d="M0,6 L0,-5 M0,0 L-16,-14 M0,0 L16,-14 M-16,-14 L-26,-26 M-16,-14 L-10,-28 M16,-14 L26,-26 M16,-14 L10,-28 M0,-5 L-6,-21 M0,-5 L6,-21"
          fill="none" stroke="#c9a84c" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="-26" cy="-30" r="6" fill="#c9a84c"/>
        <circle cx="-10" cy="-32" r="5" fill="#c9a84c" opacity="0.85"/>
        <circle cx="26" cy="-30" r="6" fill="#c9a84c"/>
        <circle cx="10" cy="-32" r="5" fill="#c9a84c" opacity="0.85"/>
        <circle cx="0" cy="-38" r="7" fill="#c9a84c"/>
      </g>
    </svg>
    <div class="brand">Digital Relative</div>
  </div>
  <div>
    <h1>The secure UK digital legacy vault for your family.</h1>
    <div class="sub">Store passwords, accounts, documents and final wishes — released to nominated beneficiaries when they need them.</div>
  </div>
  <div class="footer">
    <span>AES-256</span>
    <span>UK data residency</span>
    <span>ICO-registered</span>
  </div>
</body></html>`

async function main() {
  let puppeteer
  try {
    puppeteer = (await import('puppeteer')).default
  } catch {
    console.error('[og-image] puppeteer is required. Install with: npm install --save-dev puppeteer')
    process.exit(1)
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 })
    await page.setContent(TEMPLATE, { waitUntil: 'networkidle0' })

    await mkdir(dirname(OUTPUT), { recursive: true })
    await page.screenshot({ path: OUTPUT, type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } })

    console.log(`[og-image] wrote ${OUTPUT.replace(projectRoot, '.')}`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('[og-image] failed:', err)
  process.exit(1)
})
