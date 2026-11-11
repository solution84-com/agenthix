#!/usr/bin/env node
// Compares this run's guide screenshots with the ones the pages link, and writes the report (e2e/guide/.report/).
// Each screenshot is compared with its picture in the release its link names (screenshotLinks.mjs); when that release
// does not hold it (a link already pinned to the upcoming tag), with the release the last release's pages linked it to.
// The last release is the nearest `v*` tag before the current commit; with none every screenshot is new. A name the
// last release's pages linked and this run did not capture is removed. Releases are read as releaseImages.mjs says.
//
//   node scripts/guide/compare.mjs

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { githubToken, releaseImages } from './releaseImages.mjs'
import { linksAt, linksOf, readPages, tagsByName } from './screenshotLinks.mjs'

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

// `compared` maps a capture's name to its diff, or to null when no release holds an image of that name.
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

const BASIS = 'Compared with the screenshots the pages link, each in the release that holds it'

export function renderSummary({ tag, result, pixels, heldBy = new Map() }) {
  const lines = ['## Guide screenshots', '']
  lines.push(tag ? `${BASIS}; the last release is \`${tag}\`.` : 'No earlier release to compare with: every screenshot is new.', '')
  const from = (name) => (heldBy.has(name) ? ` (\`${heldBy.get(name)}\`)` : '')
  if (result.changed.length) lines.push(`### Changed (${result.changed.length})`, list(result.changed, (name) => ` — ${pixels.get(name)} pixels differ${from(name)}`), '')
  if (result.new.length) lines.push(`### New (${result.new.length})`, list(result.new), '')
  if (result.removed.length) lines.push(`### Removed (${result.removed.length})`, list(result.removed, from), '')
  lines.push(`${result.unchanged.length} unchanged. The old and new images side by side are in the run's \`guide-report\` artifact.`, '')
  return lines.join('\n')
}

function figure(label, src) {
  return `<figure><figcaption>${label}</figcaption>${src ? `<img src="${src}" loading="lazy">` : '<p>none</p>'}</figure>`
}

export function renderReport({ tag, result, heldBy = new Map() }) {
  const old = (name) => figure(`Release ${heldBy.get(name) ?? ''}`, heldBy.has(name) ? `old/${name}.png` : null)
  const section = (title, names, withOld, withNew) =>
    names.length
      ? `<h2>${title} (${names.length})</h2>${names
          .map((name) => `<div class="pair"><h3>${name}</h3>${withOld ? old(name) : ''}${withNew ? figure('This run', `new/${name}.png`) : ''}</div>`)
          .join('')}`
      : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Guide screenshots</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem}.pair{display:flex;gap:1rem;align-items:flex-start;margin-bottom:2rem;flex-wrap:wrap}.pair h3{flex-basis:100%;margin:0}figure{margin:0;flex:1 1 40%}img{max-width:100%;border:1px solid #888}</style></head>
<body><h1>Guide screenshots</h1>
<p>${tag ? `${BASIS}; the last release is ${tag}.` : 'No earlier release to compare with: every screenshot is new.'} ${result.unchanged.length} unchanged.</p>
${section('Changed', result.changed, true, true)}${section('New', result.new, false, true)}${section('Removed', result.removed, true, false)}
</body></html>
`
}

export function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 })
}

export function captureNamesIn(capturesDir) {
  return existsSync(capturesDir)
    ? readdirSync(capturesDir).filter((file) => file.endsWith('.png')).map((file) => file.slice(0, -4)).sort()
    : []
}

/**
 * Compares each capture with its picture in the release `current` (the pages' links, name → tag) names, or else in
 * the one `previous` (the last release's links) names; `fetchImage(tag, name)` reads a release. `heldBy` says which
 * release each compared or removed screenshot was found in.
 */
export async function compareCaptures({ capturesDir, current, previous, fetchImage }) {
  const captureNames = captureNamesIn(capturesDir)
  const compared = new Map()
  const pixels = new Map()
  const olds = new Map()
  const heldBy = new Map()
  const find = async (name, tags) => {
    for (const tag of [...new Set(tags.filter(Boolean))]) {
      const old = await fetchImage(tag, name)
      if (old === null) continue
      olds.set(name, old)
      heldBy.set(name, tag)
      return old
    }
    return null
  }
  for (const name of captureNames) {
    const old = await find(name, [current.get(name), previous.get(name)])
    if (old === null) continue
    const diff = diffImages(old, readFileSync(join(capturesDir, `${name}.png`)))
    compared.set(name, diff)
    pixels.set(name, diff.pixels)
  }
  const baselineNames = [...previous.keys()].sort()
  for (const name of baselineNames) if (!captureNames.includes(name)) await find(name, [previous.get(name)])
  return { result: classify({ captureNames, baselineNames, compared }), heldBy, pixels, olds }
}

export function writeReport({ reportDir, capturesDir, tag, compared }) {
  const { result, olds, heldBy, pixels } = compared
  rmSync(reportDir, { recursive: true, force: true })
  mkdirSync(join(reportDir, 'old'), { recursive: true })
  mkdirSync(join(reportDir, 'new'), { recursive: true })
  for (const name of [...result.changed, ...result.removed]) if (olds.has(name)) writeFileSync(join(reportDir, 'old', `${name}.png`), olds.get(name))
  for (const name of [...result.changed, ...result.new]) writeFileSync(join(reportDir, 'new', `${name}.png`), readFileSync(join(capturesDir, `${name}.png`)))
  writeFileSync(join(reportDir, 'index.html'), renderReport({ tag, result, heldBy }))
  const summary = renderSummary({ tag, result, pixels, heldBy })
  writeFileSync(join(reportDir, 'summary.md'), summary)
  return summary
}

/** The links now and at the last release, and how to read a release: what the comparison and the pin step both need. */
export function baselines({ repoRoot, env, runGit, fetchFn }) {
  const tag = lastReleaseTag(runGit)
  const pageLinks = linksOf(readPages(repoRoot))
  return {
    tag,
    pageLinks,
    current: tagsByName(pageLinks),
    previous: tag ? tagsByName(linksAt(runGit, tag)) : new Map(),
    // With no earlier release no release holds a screenshot, so nothing is fetched.
    fetchImage: tag ? releaseImages({ token: githubToken(env), fetchFn }) : async () => null,
  }
}

/** The two outside calls, `runGit(args)` and `fetchFn(url, init)`, are injected so a test can stand in for the network and the repository. */
export async function main({ hqRoot, env, runGit, fetchFn }) {
  const capturesDir = join(hqRoot, 'e2e/guide/.captures')
  if (captureNamesIn(capturesDir).length === 0) throw new Error(`no captures in ${capturesDir}: run guide:screenshots first`)
  const { tag, current, previous, fetchImage } = baselines({ repoRoot: resolve(hqRoot, '..'), env, runGit, fetchFn })
  const compared = await compareCaptures({ capturesDir, current, previous, fetchImage })
  return writeReport({ reportDir: join(hqRoot, 'e2e/guide/.report'), capturesDir, tag, compared })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hqRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  main({ hqRoot, env: process.env, runGit: (args) => git(args, hqRoot), fetchFn: fetch }).then(console.log).catch((error) => {
    console.error(`[guide:compare] ${error.message}`)
    process.exit(1)
  })
}
