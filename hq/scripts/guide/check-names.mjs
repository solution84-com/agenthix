#!/usr/bin/env node
// The guide's name check: every screenshot the guide's pages and the root README link (screenshotLinks.mjs) has a
// recipe in e2e/guide/, every recipe is linked, names are lowercase words joined by hyphens, each name is linked to one
// release tag, and no page still uses the old `screenshot:<name>` form. Exits 1, naming each problem, when not.
//
//   node scripts/guide/check-names.mjs

import { readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { linkProblems, linksOf, oldFormNames, parseScreenshotLinks, readPages } from './screenshotLinks.mjs'

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidName(name) {
  return NAME_PATTERN.test(name)
}

export function referencedNames(markdown) {
  return parseScreenshotLinks(markdown).map((link) => link.name)
}

// A fresh- prefix marks a recipe that needs hq with no organisation yet; the screenshot's name drops it.
export function recipeScreenshotName(fileName) {
  const match = /^(?:fresh-)?(.+)\.recipe\.ts$/.exec(fileName)
  return match ? match[1] : null
}

export function findProblems(pageNames, recipeNames) {
  const problems = []
  const used = new Map()
  for (const [page, names] of pageNames) {
    for (const name of names) used.set(name, [...(used.get(name) ?? []), page])
  }
  const recipeCounts = new Map()
  for (const name of recipeNames) recipeCounts.set(name, (recipeCounts.get(name) ?? 0) + 1)

  for (const name of new Set([...used.keys(), ...recipeCounts.keys()])) {
    if (!isValidName(name)) {
      problems.push(`"${name}" is not a valid name: use lowercase words joined by hyphens`)
      continue
    }
    const pages = [...new Set(used.get(name) ?? [])]
    const recipes = recipeCounts.get(name) ?? 0
    if (recipes > 1) problems.push(`${recipes} recipes save the screenshot "${name}": one recipe saves one image`)
    if (pages.length > 0 && recipes === 0) problems.push(`"${name}" has no recipe, but is linked by ${pages.join(', ')}`)
    if (pages.length === 0 && recipes > 0) problems.push(`the recipe for "${name}" is linked by no page`)
  }
  return problems
}

export function oldFormProblems(pages) {
  return [...pages].flatMap(([page, text]) =>
    oldFormNames(text).map((name) => `${page} refers to "screenshot:${name}": link the picture by its release address instead (docs/guide/README.md, Images)`),
  )
}

function main() {
  const hqRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const recipeDir = join(hqRoot, 'e2e/guide')
  const pages = readPages(resolve(hqRoot, '..'))
  const pageLinks = linksOf(pages)
  const pageNames = new Map([...pageLinks].map(([page, links]) => [page, links.map((link) => link.name)]))
  const recipeNames = existsSync(recipeDir)
    ? readdirSync(recipeDir).map(recipeScreenshotName).filter((name) => name !== null)
    : []

  const problems = [...findProblems(pageNames, recipeNames), ...linkProblems(pageLinks), ...oldFormProblems(pages)]
  if (problems.length > 0) {
    console.error(`Guide screenshot names do not match:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
    process.exit(1)
  }
  console.log(`Guide screenshot names match: ${new Set(recipeNames).size} recipes, ${pages.size} pages checked.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
