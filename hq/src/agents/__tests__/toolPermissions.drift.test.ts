/**
 * Mirror-drift enforcement for the `WRITE_TOOLS` pair: hq's
 * `agents/toolPermissions.ts` declares itself "a pinned copy of site's own
 * WRITE_TOOLS" (`site/src/agents/runtime/toolPermissions.ts`), and nothing but
 * this test and its site-side twin enforces that.
 *
 * Both copies are live and both are used to decide something: hq's is what
 * `capabilityService.ts` narrows a run's capability against, site's is what the
 * runtime checks a tool call against. A copy that listed a different set would
 * mint a capability for a tool the runtime refuses, or the reverse.
 *
 * It lived in `server/__tests__/assetPaths.drift.test.ts` until hq's copy of the
 * site's disk layout was deleted and that file went with it. This pair is a
 * different pair of files and outlived it, so it gets a file of its own rather
 * than a home inside a test named after something else.
 *
 * Twinned, not shared: a developer working only in site/ never runs hq's suite,
 * and vice versa, so each half must be able to catch the drift on its own. The
 * site-side twin is `site/src/agents/runtime/__tests__/toolPermissions.drift.test.ts`.
 *
 * Deliberately dumb: the array literal is extracted by a plain bracket-counted
 * slice, not a real parser. Divergence fails loudly here, and a genuinely
 * intended divergence requires editing this test, which is the enforcement
 * point.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const hqSource = readFileSync(join(__dirname, '../toolPermissions.ts'), 'utf8')
const siteSource = readFileSync(join(__dirname, '../../../../site/src/agents/runtime/toolPermissions.ts'), 'utf8')

/**
 * Slices from `marker` to the matching close of the first `[` at or after it.
 * `WRITE_TOOLS` is declared `export const WRITE_TOOLS = [ ... ] as const` in
 * both files, so the slice also swallows the trailing ` as const` (matched
 * literally, not bracket-counted — deliberately dumb, same philosophy as the
 * slice itself).
 */
function extractArrayBody(source: string, marker: string): string {
  const start = source.indexOf(marker)
  if (start === -1) throw new Error(`marker not found: ${JSON.stringify(marker)}`)
  const bracketStart = source.indexOf('[', start)
  if (bracketStart === -1) throw new Error(`no opening bracket after marker: ${JSON.stringify(marker)}`)
  let depth = 0
  for (let i = bracketStart; i < source.length; i++) {
    if (source[i] === '[') depth++
    else if (source[i] === ']') {
      depth--
      if (depth === 0) {
        const asConst = ' as const'
        const end = source.startsWith(asConst, i + 1) ? i + 1 + asConst.length : i + 1
        return source.slice(start, end)
      }
    }
  }
  throw new Error(`unbalanced brackets after marker: ${JSON.stringify(marker)}`)
}

describe('hq/agents/toolPermissions.ts ↔ site/agents/runtime/toolPermissions.ts WRITE_TOOLS drift', () => {
  const marker = 'export const WRITE_TOOLS = ['

  it('WRITE_TOOLS is byte-identical in both files', () => {
    expect(extractArrayBody(siteSource, marker)).toBe(extractArrayBody(hqSource, marker))
  })

  it('hq still says whose copy it is, so the pair is discoverable from the file itself', () => {
    expect(hqSource).toContain("site's own `WRITE_TOOLS`")
  })
})

// The defaults an agent with no saved list runs with: hq shows and mints from its copy, the site gates and offers
// tools from its own, so a default changed in one alone would show a tool the run never gets (walkthrough finding W2).
describe('DEFAULT_TOOL_PERMISSIONS drift @SC-2154', () => {
  it('is byte-identical in both files', () => {
    const marker = 'export const DEFAULT_TOOL_PERMISSIONS: ToolPermission[] = ['
    expect(extractArrayBody(siteSource, marker)).toBe(extractArrayBody(hqSource, marker))
  })
})
