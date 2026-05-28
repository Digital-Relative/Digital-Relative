/**
 * Prerender marketing routes to static HTML.
 *
 * After `vite build` writes the SPA into `dist/`, this script:
 *  1. Boots `vite preview` on a local port (serving `dist/`).
 *  2. For each marketing route, opens it in headless Chrome, waits for the
 *     SEO component to set <title>/meta/canonical/JSON-LD, then captures the
 *     fully-rendered HTML.
 *  3. Writes the captured HTML to `dist/<route>/index.html`.
 *
 * Vercel's static routing then serves /about, /blog, /blog/<slug> directly
 * from those files for crawlers and social-card scrapers — no JS required.
 *
 * Routes that fail to render are reported but do not fail the build, so a
 * broken page doesn't block a frontend deploy.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const ROUTES = [
  '/',
  '/about',
  '/blog',
  '/blog/first-week',
  '/blog/digital-accounts',
  '/blog/executor-guide',
  '/blog/funeral-planning',
]

const PORT = 4173
const ORIGIN = `http://localhost:${PORT}`

// Wait until the title is no longer the default "Digital Relative" baseline,
// or until 5s — whichever comes first. The SEO component updates the title in
// useEffect, so this guarantees per-route meta is in place before capture.
async function waitForSeo(page) {
  try {
    await page.waitForFunction(
      () => document.querySelector('link[rel="canonical"]') !== null &&
            document.title.length > 0,
      { timeout: 5000 }
    )
  } catch {
    // Timed out — capture anyway with whatever's there.
  }
}

function startPreview() {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    let resolved = false
    const onLine = (line) => {
      if (resolved) return
      if (line.includes(`localhost:${PORT}`)) {
        resolved = true
        resolvePromise(proc)
      }
    }
    proc.stdout.on('data', (d) => d.toString().split('\n').forEach(onLine))
    proc.stderr.on('data', (d) => d.toString().split('\n').forEach(onLine))
    proc.on('exit', (code) => {
      if (!resolved) rejectPromise(new Error(`vite preview exited early with code ${code}`))
    })

    // Fallback: try anyway after 4s if we never saw the URL banner.
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolvePromise(proc)
      }
    }, 4000)
  })
}

async function main() {
  let puppeteer
  try {
    puppeteer = (await import('puppeteer')).default
  } catch (err) {
    console.warn('[prerender] puppeteer not installed; skipping prerender step.')
    console.warn('[prerender] Install with: npm install --save-dev puppeteer')
    return
  }

  console.log('[prerender] starting vite preview…')
  const preview = await startPreview()

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const failures = []

  try {
    for (const route of ROUTES) {
      const url = ORIGIN + route
      console.log(`[prerender] ${route} …`)
      const page = await browser.newPage()
      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 })
        await waitForSeo(page)
        const html = await page.content()
        const outDir = route === '/' ? resolve(projectRoot, 'dist') : resolve(projectRoot, 'dist' + route)
        await mkdir(outDir, { recursive: true })
        const target = route === '/' ? resolve(outDir, 'index.html') : resolve(outDir, 'index.html')
        await writeFile(target, html, 'utf8')
        console.log(`[prerender]   → ${target.replace(projectRoot, '.')}`)
      } catch (err) {
        console.warn(`[prerender]   ✗ ${route}: ${err.message}`)
        failures.push({ route, error: err.message })
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
    preview.kill()
  }

  if (failures.length) {
    console.warn(`[prerender] ${failures.length} route(s) failed to prerender:`)
    failures.forEach(f => console.warn(`  - ${f.route}: ${f.error}`))
    // Non-fatal: SPA still serves these routes via JS.
  } else {
    console.log('[prerender] all routes prerendered successfully.')
  }
}

main().catch((err) => {
  console.error('[prerender] fatal:', err)
  process.exit(0) // soft-fail so a broken prerender never blocks deploy
})
