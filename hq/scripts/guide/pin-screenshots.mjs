#!/usr/bin/env node
// The pin step, run while preparing a release, before it is proved (docs/guide/README.md, Releasing the guide's
// screenshots). It compares a set of captures with the screenshots the pages link, as guide:compare does, and points
// every link to a new or changed screenshot at the upcoming tag; an unchanged one keeps the release that holds it. It
// rewrites the guide's pages and the root README in place, writes the comparison's report, and commits nothing: a
// maintainer commits the edit, and the release proves and tags that commit. Its release then carries exactly the
// screenshots linked to its tag (release-screenshots.mjs, run by Publish release).
//
//   npm run guide:pin -- --tag v0.1.0-alpha.4 [--captures <folder>]
//
// The captures are e2e/guide/.captures by default (npm run guide:screenshots, or the release rehearsal), or a folder
// holding the release build's guide-release-set for the commit.

import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { baselines, captureNamesIn, compareCaptures, git, writeReport } from './compare.mjs'
import { isVersionTag, linkProblems, readPages, rewriteScreenshotLinks } from './screenshotLinks.mjs'

/** The tag each captured screenshot's links should name: the upcoming one if it is new or changed. */
export function decideTags({ result, heldBy, upcoming }) {
  const tags = new Map()
  for (const name of [...result.new, ...result.changed]) tags.set(name, upcoming)
  for (const name of result.unchanged) tags.set(name, heldBy.get(name))
  return new Map([...tags].sort(([a], [b]) => a.localeCompare(b)))
}

/** Returns the decisions and the pages it rewrote; `runGit` and `fetchFn` are injected as in compare.mjs. */
export async function main({ repoRoot, capturesDir, tag, env, runGit, fetchFn, reportDir }) {
  if (!isVersionTag(tag ?? '')) throw new Error(`"${tag}" is not a release tag: write it as v<major>.<minor>.<patch>, or with -alpha.<n>, -beta.<n> or -rc.<n> after it`)
  if (runGit(['tag', '--list', tag]).trim()) throw new Error(`${tag} is already tagged: pin to the release being prepared`)

  const { tag: lastTag, pageLinks, current, previous, fetchImage } = baselines({ repoRoot, env, runGit, fetchFn })
  const problems = linkProblems(pageLinks)
  if (problems.length) throw new Error(`the links do not pass the name check:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  const captured = new Set(captureNamesIn(capturesDir))
  const missing = [...current.keys()].filter((name) => !captured.has(name))
  if (missing.length) throw new Error(`no capture of ${missing.map((n) => `"${n}"`).join(', ')} in ${capturesDir}: capture the screenshots of the commit being released first`)

  const compared = await compareCaptures({ capturesDir, current, previous, fetchImage })
  const decisions = decideTags({ result: compared.result, heldBy: compared.heldBy, upcoming: tag })
  const files = []
  for (const [path, text] of readPages(repoRoot)) {
    const rewritten = rewriteScreenshotLinks(text, decisions)
    if (rewritten === text) continue
    writeFileSync(join(repoRoot, path), rewritten)
    files.push(path)
  }
  const summary = reportDir ? writeReport({ reportDir, capturesDir, tag: lastTag, compared }) : null
  return { decisions, files, result: compared.result, summary }
}

function option(name) {
  const at = process.argv.indexOf(`--${name}`)
  return at > 0 ? process.argv[at + 1] : undefined
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hqRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const tag = option('tag')
  main({
    repoRoot: resolve(hqRoot, '..'),
    capturesDir: resolve(option('captures') ?? join(hqRoot, 'e2e/guide/.captures')),
    tag,
    env: process.env,
    runGit: (args) => git(args, hqRoot),
    fetchFn: fetch,
    reportDir: join(hqRoot, 'e2e/guide/.report'),
  }).then(({ result, files, summary }) => {
    console.log(summary)
    const moved = [...result.new, ...result.changed]
    console.log(moved.length ? `Pinned to ${tag}: ${moved.join(', ')}.` : `No screenshot is new or changed: ${tag} carries none.`)
    console.log(files.length ? `Rewrote ${files.join(', ')}. Commit them, then prove and tag that commit.` : 'No page changed.')
  }).catch((error) => {
    console.error(`[guide:pin] ${error.message}`)
    process.exit(1)
  })
}
