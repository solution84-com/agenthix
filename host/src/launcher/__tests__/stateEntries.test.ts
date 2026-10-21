/**
 * The uninstall removes only the top-level entries of the state folder that `STATE_FILES` and `STATE_FOLDERS` list
 * (`launcher/uninstall.ts`). This reads the host service's code and finds every top-level name it passes to the state
 * folder (`state.path`, `folder`, `readJson`, `writeJson`, `writePrivate`), so a new state entry not listed there
 * fails here rather than being left behind by an uninstall unnoticed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STATE_FILES, STATE_FOLDERS } from '../uninstall'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The calls whose first name is a variable rather than a literal or a named constant, by file, with the names that
 * variable takes there. A new one fails the test until it is read and added here.
 */
const BY_HAND: Record<string, string[]> = {
  'backups/export.ts': ['exports', 'exports-held'],
  'backups/store.ts': ['hq', 'site'],
  'frontDoor/frontDoor.ts': ['front-door'],
  'lifecycle/erase.ts': ['site', 'hq', 'front-door'],
  'link/handover.ts': ['console', 'link'],
  'move/restoreHq.ts': ['hq', 'site', 'console'],
}

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const at = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(at)
    return e.name.endsWith('.ts') && e.name !== 'folder.ts' ? [at] : []
  })
}

const FIRST_QUOTED = /^\s*\[?\s*'([^']+)'/

/** A file's constants' first names: `NAME = 'x'`, `NAME = ['x', …]`, and `NAME = { key: ['x', …] }` as `NAME.key`. */
function constants(text: string, only: 'all' | 'exported'): Map<string, string> {
  const found = new Map<string, string>()
  const pattern = only === 'exported' ? /^export const ([A-Z][A-Z0-9_]*) = (.+)$/gm : /^(?:export )?const ([A-Z][A-Z0-9_]*) = (.+)$/gm
  for (const m of text.matchAll(pattern)) {
    const quoted = FIRST_QUOTED.exec(m[2])
    if (quoted) found.set(m[1], quoted[1])
    for (const k of m[2].matchAll(/(\w+): \[\s*'([^']+)'/g)) found.set(`${m[1]}.${k[1]}`, k[2])
  }
  return found
}

const CALL = /\bstate\.(?:path|folder|readJson|writeJson|writePrivate)\(([^)]*)/g

function topLevelNames(): { names: Set<string>; unresolved: Map<string, string[]> } {
  const files = sources(SRC)
  // A file's own constants first; an imported one by its exported name.
  const exported = new Map(files.flatMap(f => [...constants(fs.readFileSync(f, 'utf8'), 'exported')]))
  const names = new Set<string>()
  const unresolved = new Map<string, string[]>()
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    const consts = new Map([...exported, ...constants(text, 'all')])
    for (const m of text.matchAll(CALL)) {
      const arg = m[1].trim().replace(/^\[\s*/, '').replace(/^\.\.\./, '')
      const quoted = /^'([^']+)'/.exec(arg)
      const named = /^([A-Z][A-Z0-9_]*(?:\.\w+)?)\b/.exec(arg)
      const name = quoted?.[1] ?? (named ? consts.get(named[1]) : undefined)
      if (name) {
        names.add(name)
        continue
      }
      const rel = path.relative(SRC, file)
      unresolved.set(rel, [...(unresolved.get(rel) ?? []), arg.slice(0, 40)])
    }
  }
  return { names, unresolved }
}

describe('the state entries an uninstall removes @SC-1162', () => {
  it('list every top-level name the host service’s code writes in its state folder, and nothing it does not', () => {
    const { names, unresolved } = topLevelNames()
    expect([...unresolved.keys()].sort()).toEqual(Object.keys(BY_HAND).sort())
    for (const n of Object.values(BY_HAND).flat()) names.add(n)
    expect([...names].sort()).toEqual([...STATE_FILES, ...STATE_FOLDERS].sort())
  })
})
