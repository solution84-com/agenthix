/**
 * The gate reads a patch's file headers itself (openCodeNames.ts), and the
 * plugin's apply_patch reads the patch with OpenCode's own parser, copied into
 * the plugin. Every path the parser uses must be one the gate checked, and
 * once the gate writes the real paths in, the parser must use exactly those.
 */
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { openCodeGateCall, openCodePatchHeaders } from '../openCodeNames'

type Hunk =
  | { type: 'add' | 'delete'; path: string }
  | { type: 'update'; path: string; move_path?: string }
type ParsePatch = (patchText: string) => { hunks: Hunk[] }

// Loaded at run time, so nothing under site/src imports the plugin's source directly.
const PARSER = new URL('../../../../../opencode-plugin/src/files/patchParse.ts', import.meta.url).href
let parsePatch: ParsePatch
beforeAll(async () => {
  parsePatch = ((await import(PARSER)) as { parsePatch: ParsePatch }).parsePatch
})

const patch = (...lines: string[]) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n')

const pathsOf = (hunks: Hunk[]) => hunks.flatMap(h => (h.type === 'update' && h.move_path ? [h.path, h.move_path] : [h.path]))

describe('the gate and the parser read the same paths', () => {
  const tricky = [
    patch('*** Update File: a.ts', '*** Move to: b.ts', '@@', '-x', '+y', '*** Add File: c/d.ts', '+z', '*** Delete File: e.ts'),
    patch('*** Update File: a.ts', '@@', '-x', '+y').replaceAll('\n', '\r\n'),
    `cat <<'EOF'\n${patch('*** Add File:  spaced.ts  ', '+x')}\nEOF`,
    ['*** Add File: before-begin.ts', patch('  *** Add File: indented.ts', '*** Delete File: real.ts'), '*** Add File: after-end.ts'].join('\n'),
    patch('*** Add File: a.ts', '+*** Delete File: content.ts', '*** Update File: a.ts', '@@', ' *** Add File: context.ts', '+q'),
  ]

  it.each(tricky.map((t, i) => [i, t]))('every path the parser uses was checked by the gate (patch %i)', (_i, text) => {
    const checked = new Set(openCodePatchHeaders(text as string).map(h => h.path))
    for (const p of pathsOf(parsePatch(text as string).hunks)) expect(checked).toContain(p)
  })

  it.each(tricky.map((t, i) => [i, t]))('after the gate writes in real paths, the parser uses exactly those (patch %i)', (_i, text) => {
    const hunks = parsePatch(text as string).hunks
    const given = pathsOf(hunks)
    const real = Object.fromEntries(given.flatMap(p => [p, path.posix.dirname(p)]).map(p => [p, `/real/${p}`]))
    const mapped = openCodeGateCall('apply_patch', { patchText: text }, 'call-1', 'agx0')
    if (mapped.kind !== 'decide') throw new Error('expected a decision')
    expect(mapped.call.paths).toEqual(expect.arrayContaining(given))
    const rewritten = mapped.withRealPaths(real)
    const deleted = new Set(hunks.filter(h => h.type === 'delete').map(h => h.path))
    const expected = given.map(p => (deleted.has(p) ? path.posix.join(real[path.posix.dirname(p)], path.posix.basename(p)) : real[p]))
    expect(pathsOf(parsePatch(rewritten?.patchText as string).hunks)).toEqual(expected)
  })
})
