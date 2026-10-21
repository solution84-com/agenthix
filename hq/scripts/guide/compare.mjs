#!/usr/bin/env node
// Compares this run's guide screenshots with the last release's, and writes the report (e2e/guide/.report/).
// The last release is the nearest `v*` tag before the current commit; its images are public at
// <GUIDE_BASELINE_URL>/<tag>/<name>.png (default DEFAULT_GUIDE_BASELINE_URL below). With no such tag every
// screenshot is new. The names the release had come from the recipes at its tag: one recipe, one image.
//
//   node scripts/guide/compare.mjs

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { recipeScreenshotName } from './check-names.mjs'

// Where the released screenshots are served: the one setting, GUIDE_BASELINE_URL, or the website's address.
export const DEFAULT_GUIDE_BASELINE_URL = 'https://assets.agenthix.com/guide'

export function guideBaselineUrl(env) {
  return (env.GUIDE_BASELINE_URL?.trim() || DEFAULT_GUIDE_BASELINE_URL).replace(/\/$/, '')
}

// pixelmatch's colour distance below which two pixels count as the same, and the number of differing
// pixels below which two images count as the same.
export const PIXEL_THRESHOLD = 0.1
export const IGNORED_PIXELS = 50

export function diffImages(oldPng, newPng) {
  const before = PNG.sync.read(oldPng)
  const after = PNG.sync.read(newPng)
  if (before.width !== after.width || before.height !== after.height) {
    return { changed: true, pixels: before.width * before.height }
  }
  const pixels = pixelmatch(before.data, after.data, null, after.width, after.height, { threshold: PIXEL_THRESHOLD })
  return { changed: pixels > IGNORED_PIXELS, pixels }
}

// `compared` maps a capture's name to its diff, or to null when the release has no image of that name.
export function classify({ captureNames, baselineNames, compared }) {
  const result = { new: [], changed: [], unchanged: [], removed: [] }
  for (const name of captureNames) {
    const diff = compared.get(name) ?? null
    if (diff === null) result.new.push(name)
    else if (diff.changed) result.changed.push(name)
    else result.unchanged.push(name)
  }
  result.removed = baselineNames.filter((name) => !captureNames.includes(name))
  return result
}

// `run` executes git with the given arguments and returns its output.
export function lastReleaseTag(run) {
  try {
    return run(['describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD^']).trim() || null
  } catch {
    return null
  }
}

function list(names, describe = () => '') {
  return names.map((name) => `- \`${name}\`${describe(name)}`).join('\n')
}

export function renderSummary({ tag, result, pixels }) {
  const lines = ['## Guide screenshots', '']
  lines.push(tag ? `Compared with the last release, \`${tag}\`.` : 'No earlier release to compare with: every screenshot is new.', '')
  if (result.changed.length) lines.push(`### Changed (${result.changed.length})`, list(result.changed, (name) => ` — ${pixels.get(name)} pixels differ`), '')
  if (result.new.length) lines.push(`### New (${result.new.length})`, list(result.new), '')
  if (result.removed.length) lines.push(`### Removed (${result.removed.length})`, list(result.removed), '')
  lines.push(`${result.unchanged.length} unchanged. The old and new images side by side are in the run's \`guide-report\` artifact.`, '')
  return lines.join('\n')
}

function figure(label, src) {
  return `<figure><figcaption>${label}</figcaption>${src ? `<img src="${src}" loading="lazy">` : '<p>none</p>'}</figure>`
}

export function renderReport({ tag, result }) {
  const section = (title, names, old, now) =>
    names.length
      ? `<h2>${title} (${names.length})</h2>${names
          .map((name) => `<div class="pair"><h3>${name}</h3>${old ? figure(`Release ${tag}`, `old/${name}.png`) : ''}${now ? figure('This run', `new/${name}.png`) : ''}</div>`)
          .join('')}`
      : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Guide screenshots</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem}.pair{display:flex;gap:1rem;align-items:flex-start;margin-bottom:2rem;flex-wrap:wrap}.pair h3{flex-basis:100%;margin:0}figure{margin:0;flex:1 1 40%}img{max-width:100%;border:1px solid #888}</style></head>
<body><h1>Guide screenshots</h1>
<p>${tag ? `Compared with the last release, ${tag}.` : 'No earlier release to compare with: every screenshot is new.'} ${result.unchanged.length} unchanged.</p>
${section('Changed', result.changed, true, true)}${section('New', result.new, false, true)}${section('Removed', result.removed, true, false)}
</body></html>
`
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

async function fetchBaseline(baseUrl, tag, name) {
  const response = await fetch(`${baseUrl}/${tag}/${name}.png`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`fetching the release image "${name}" failed: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function main() {
  const hqRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const guideDir = join(hqRoot, 'e2e/guide')
  const capturesDir = join(guideDir, '.captures')
  const reportDir = join(guideDir, '.report')
  const baseUrl = guideBaselineUrl(process.env)

  const captureNames = existsSync(capturesDir)
    ? readdirSync(capturesDir).filter((file) => file.endsWith('.png')).map((file) => file.slice(0, -4)).sort()
    : []
  if (captureNames.length === 0) throw new Error(`no captures in ${capturesDir}: run guide:screenshots first`)

  const tag = lastReleaseTag((args) => git(args, hqRoot))
  const baselineNames = tag
    ? git(['ls-tree', '--name-only', tag, 'hq/e2e/guide/'], hqRoot)
        .split('\n')
        .map((path) => recipeScreenshotName(path.split('/').pop()))
        .filter((name) => name !== null)
        .sort()
    : []

  rmSync(reportDir, { recursive: true, force: true })
  mkdirSync(join(reportDir, 'old'), { recursive: true })
  mkdirSync(join(reportDir, 'new'), { recursive: true })

  const compared = new Map()
  const pixels = new Map()
  const olds = new Map()
  if (tag) {
    for (const name of [...new Set([...captureNames, ...baselineNames])]) {
      const old = await fetchBaseline(baseUrl, tag, name)
      if (old === null) continue
      olds.set(name, old)
      if (!captureNames.includes(name)) continue
      const diff = diffImages(old, readFileSync(join(capturesDir, `${name}.png`)))
      compared.set(name, diff)
      pixels.set(name, diff.pixels)
    }
  }

  const result = classify({ captureNames, baselineNames, compared })
  for (const name of [...result.changed, ...result.removed]) writeFileSync(join(reportDir, 'old', `${name}.png`), olds.get(name) ?? Buffer.alloc(0))
  for (const name of [...result.changed, ...result.new]) writeFileSync(join(reportDir, 'new', `${name}.png`), readFileSync(join(capturesDir, `${name}.png`)))
  writeFileSync(join(reportDir, 'index.html'), renderReport({ tag, result }))
  const summary = renderSummary({ tag, result, pixels })
  writeFileSync(join(reportDir, 'summary.md'), summary)
  console.log(summary)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[guide:compare] ${error.message}`)
    process.exit(1)
  })
}
