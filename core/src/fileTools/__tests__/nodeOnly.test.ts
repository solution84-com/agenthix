/**
 * Core carries Node's type declarations for this module only, so the compiler no longer stops the rest of core from
 * reaching for Node. This does: outside `fileTools/`, `testing/` (the entry for test suites) and tests, nothing imports
 * a Node module, because the root entry and `./client` reach browsers.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(import.meta.dirname, '../..')
const NODE_FOLDERS = [path.join(SRC, 'fileTools'), path.join(SRC, 'testing')]
const NODE_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:node:[^'"]+|fs|path|os|child_process|crypto)['"]/

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' || NODE_FOLDERS.includes(p) ? [] : sources(p)
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : []
  })
}

describe('Node stays inside file-tools @SC-1368', () => {
  it('no source outside fileTools/ and testing/ imports a Node module', () => {
    const offenders = sources(SRC).filter(f => NODE_IMPORT.test(fs.readFileSync(f, 'utf8')))
    expect(offenders.map(f => path.relative(SRC, f))).toEqual([])
  })
})
