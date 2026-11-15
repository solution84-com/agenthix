#!/usr/bin/env node
// What an update run moved, put together from the three parts' JSON (scripts/deps/npm.mjs, images.mjs, actions.mjs):
// printed as a summary in Markdown, by module, version to version. With --record, the run is also recorded in
// scripts/deps/taken.json, with the month it ran in Australia/Sydney (the month scripts/deps/due.mjs reads), and the
// rebuild epoch in scripts/images/parts.json is raised by one, so every image is built again and takes its system
// packages' fixes. Run by scripts/deps/update.sh.
//   node scripts/deps/record.mjs --npm <file> --images <file> --actions <file> [--record]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sydneyMonth } from './due.mjs'

export function taken(date, month, npm, images, actions) {
  const moved = {}
  for (const { module, ...move } of [...npm.moves, ...images, ...actions]) (moved[module] ??= []).push(move)
  const sorted = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
  return { date, month, moved: sorted(moved), others: sorted(npm.others) }
}

export function summary(record) {
  const modules = [...new Set([...Object.keys(record.moved), ...Object.keys(record.others)])].sort((a, b) => a.localeCompare(b))
  if (modules.length === 0) return 'Nothing moved: every package, base image and action is already the newest its rules allow.\n'
  const lines = []
  for (const module of modules) {
    lines.push(`**${module}**`, '')
    const moves = record.moved[module] ?? []
    if (moves.length) {
      lines.push('| What | From | To |', '|---|---|---|', ...moves.map(m => `| ${m.name} | ${m.from} | ${m.to} |`), '')
    }
    const n = record.others[module]
    if (n) lines.push(`${n} other package${n === 1 ? '' : 's'} in its lockfile moved too.`, '')
  }
  const node = record.moved.Node?.[0]
  if (node) lines.push(`Node moved to ${node.to} (.nvmrc): install it on the dev machine (\`nvm install\`).`, '')
  return `${lines.join('\n')}\n`
}

export function raiseEpoch(text) {
  const m = /"rebuildEpoch":\s*(\d+)/.exec(text)
  if (!m) throw new Error('scripts/images/parts.json has no rebuildEpoch.')
  return text.replace(m[0], `"rebuildEpoch": ${Number(m[1]) + 1}`)
}

function main() {
  const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
  const read = f => JSON.parse(fs.readFileSync(f, 'utf8'))
  if (!arg('--npm') || !arg('--images') || !arg('--actions')) throw new Error('Usage: node scripts/deps/record.mjs --npm <file> --images <file> --actions <file> [--record]')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const now = new Date()
  const record = taken(now.toISOString().slice(0, 10), sydneyMonth(now).month, read(arg('--npm')), read(arg('--images')), read(arg('--actions')))
  if (process.argv.includes('--record')) {
    fs.writeFileSync(path.join(root, 'scripts/deps/taken.json'), `${JSON.stringify(record, null, 2)}\n`)
    const parts = path.join(root, 'scripts/images/parts.json')
    fs.writeFileSync(parts, raiseEpoch(fs.readFileSync(parts, 'utf8')))
  }
  process.stdout.write(summary(record))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(`Record: ${error.message}`); process.exit(1) }
}
