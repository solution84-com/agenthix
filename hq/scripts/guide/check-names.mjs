#!/usr/bin/env node
// The guide's name check: every `screenshot:<name>` a page uses has a recipe in e2e/guide/, every recipe is
// used by a page, and names are lowercase words joined by hyphens. Exits 1, naming each problem, when not.
//
//   node scripts/guide/check-names.mjs

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidName(name) {
  return NAME_PATTERN.test(name)
}

export function referencedNames(markdown) {
  return [...markdown.matchAll(/screenshot:([^\s)"'\]]*)/g)].map((match) => match[1])
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
    if (pages.length > 0 && recipes === 0) problems.push(`"${name}" has no recipe, but is used by ${pages.join(', ')}`)
    if (pages.length === 0 && recipes > 0) problems.push(`the recipe for "${name}" is used by no page`)
  }
  return problems
}

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(path)
    return entry.name.endsWith('.md') && entry.name !== 'README.md' ? [path] : []
  })
}

function main() {
  const hqRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const repoRoot = resolve(hqRoot, '..')
  const guideDir = join(repoRoot, 'docs/guide')
  const recipeDir = join(hqRoot, 'e2e/guide')

  const pageNames = new Map()
  if (existsSync(guideDir)) {
    for (const file of markdownFiles(guideDir)) {
      pageNames.set(relative(repoRoot, file), referencedNames(readFileSync(file, 'utf8')))
    }
  }
  const recipeNames = existsSync(recipeDir)
    ? readdirSync(recipeDir).map(recipeScreenshotName).filter((name) => name !== null)
    : []

  const problems = findProblems(pageNames, recipeNames)
  if (problems.length > 0) {
    console.error(`Guide screenshot names do not match:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
    process.exit(1)
  }
  console.log(`Guide screenshot names match: ${new Set(recipeNames).size} recipes, ${pageNames.size} pages checked.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
