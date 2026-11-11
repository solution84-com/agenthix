#!/usr/bin/env node
// The screenshots a release carries: exactly those whose links, in the guide's pages and the root README at the tagged
// commit, name the release's tag (the pin step put them there). Copies each from the release build's guide set into
// a folder for Publish release to attach, and fails, naming them, when the set lacks any. Prints how many.
// Plain Node, no install.
//
//   node hq/scripts/guide/release-screenshots.mjs --tag <tag> --set <folder> --out <folder>

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { linksOf, namesLinkedTo, readPages } from './screenshotLinks.mjs'

export function missingFrom(names, available) {
  const held = new Set(available)
  return names.filter((name) => !held.has(name))
}

/** The names copied; `repoRoot` is the tagged commit's checkout. */
export function main({ repoRoot, tag, setDir, outDir }) {
  const names = namesLinkedTo(linksOf(readPages(repoRoot)), tag)
  const available = existsSync(setDir) ? readdirSync(setDir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)) : []
  const missing = missingFrom(names, available)
  if (missing.length) {
    throw new Error(`the pages link ${missing.map((n) => `"${n}"`).join(', ')} to ${tag}, but the release build's guide set for this commit holds no such screenshot`)
  }
  if (names.length) mkdirSync(outDir, { recursive: true })
  for (const name of names) copyFileSync(join(setDir, `${name}.png`), join(outDir, `${name}.png`))
  return names
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = (name) => {
    const at = process.argv.indexOf(`--${name}`)
    const value = at > 0 ? process.argv[at + 1] : undefined
    if (!value) throw new Error(`--${name} is required`)
    return value
  }
  try {
    const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..')
    const tag = option('tag')
    const names = main({ repoRoot, tag, setDir: resolve(option('set')), outDir: resolve(option('out')) })
    console.error(names.length ? `${tag} carries ${names.length} screenshots: ${names.join(', ')}.` : `${tag} carries no screenshot: none is new or changed.`)
    console.log(names.length)
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exit(1)
  }
}
