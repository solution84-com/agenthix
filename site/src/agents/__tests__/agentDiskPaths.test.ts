/**
 * What this site's layout still puts under an agent's own directory: nothing.
 *
 * An agent used to own a working directory here, bound read-write into every
 * container it ran in, and then — after that went — a Claude credential home,
 * seeded from the site's one shared operator login and bound into every one of
 * its containers. Neither is left. A run works in its storage boundary, and the
 * Claude home it gets belongs to that same boundary
 * (runtime/boundaryClaudeHome.ts), so nothing a run touches is keyed by the
 * agent at all.
 *
 * `agents/<handle>/` itself is not asserted away: an upgraded install still has
 * the per-person memory ADR-0058 superseded sitting under it, which the boot
 * sweep sets aside and the agent-removal handler deletes. What this pins is
 * that nothing NEW is derived inside it.
 *
 * Deliberately name-agnostic: it calls every exported ONE-ARGUMENT function
 * with a handle and checks where the answers LAND, rather than asserting a list
 * of function names — so a new helper that reaches under an agent's directory
 * fails here even though nobody thought to add it to a list.
 *
 * One argument, not "takes a handle", because nothing in the signature says
 * which. That over-collects harmlessly — a one-argument helper taking anything
 * else answers well outside what is asserted — and under-collects in exactly
 * one way worth knowing: a helper taking a handle AND something else would need
 * a second value invented for it and is skipped instead. There is no such
 * export today, and adding one means adding it here.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import * as agentDiskPaths from '../agentDiskPaths'

const SITE_ROOT = '/site'
const HANDLE = 'scout'
const AGENT_DIR = `${SITE_ROOT}/agents/${HANDLE}`

/** Every exported one-argument helper's answer for one handle, as a string. */
function handleScopedPaths(): [string, string][] {
  return Object.entries(agentDiskPaths)
    .filter(([, value]) => typeof value === 'function' && value.length === 1)
    .map(([name, fn]) => [name, (fn as (handle: string) => unknown)(HANDLE)] as [string, unknown])
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
}

describe("an agent's own directory", () => {
  beforeEach(() => {
    process.env.SITE_ROOT = SITE_ROOT
    delete process.env.AGENT_CONTAINER_ISOLATION
  })

  it('has nothing derived inside it any more', () => {
    const inside = handleScopedPaths().filter(([, p]) => p.startsWith(AGENT_DIR + path.sep))

    expect(inside).toEqual([])
  })

  it('is still named, as one directory, by the helper that removes it', () => {
    // Positive control for the emptiness above: these helpers DO resolve for a
    // handle, so the filtered list being empty is a fact about where they land
    // rather than about there being nothing to collect.
    expect(handleScopedPaths().map(([, p]) => p)).toContain(AGENT_DIR)
  })
})
