/**
 * Mirror-drift enforcement for the primary-location pair: hq's
 * `storage/primaryLocationService.ts` and site's
 * `server/storage/primaryLocationService.ts`. Site's copy says it was copied
 * from hq's; nothing enforced that until this test and its twin on the other
 * side, and the copies are where a run's storage boundary is decided — hq uses
 * its copy to place the run and mint its capability, site uses its copy to
 * choose the cwd and the container's mounts. A copy that answered differently
 * would put a run's authorization and its actual working directory in two
 * different places.
 *
 * Twinned, not shared, for the same reason the storage-path pair is: a
 * developer working only in site/ never runs hq's suite, and vice versa, so
 * each half must be able to catch the drift on its own.
 *
 * The comparison runs to the end of `resolvePrimaryLocation` and no further.
 * That is where the copies stop being a copy: naming a run's location is
 * shared, creating the directory it names is site's alone, so site carries
 * `getLocationCwd` past the shared region and hq carries nothing past it.
 * Within that region the comparison is total, comments included, like the
 * storage-path pair's and unlike the sibling drift tests that slice from each
 * declaration — the two halves are a wholesale copy there, so there is no
 * legitimate divergence to tolerate, and a total comparison also catches a
 * symbol added to one copy and not the other. What `null` MEANS here ("this run
 * has no storage", never "we could not work it out") lives only in the prose,
 * so a copy whose prose says something else has drifted in the way that matters
 * most.
 *
 * The exports test below is what keeps that boundary honest: everything hq
 * declares must be declared by site in the same order, and the only thing site
 * may hold beyond it is the one directory-creating function named here. A
 * second site-only symbol, or a new hq-only one, fails until someone decides
 * which side it belongs on.
 *
 * Where each copy gets `LocationRef` is checked rather than compared, because
 * the two now differ deliberately. Site takes `locationDir` from `./paths`
 * beside it — the only written-down copy of the storage layout, since hq's was
 * deleted — and the type comes with it. hq takes the type from `@agenthix/core`
 * and nothing else: it names a location and never resolves one to a directory,
 * so there is no layout on its side to import from. Repointing either at a
 * module of its own is the one edit that would make the two resolvers name
 * different directories while every symbol still lined up.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const siteSource = readFileSync(join(__dirname, '../primaryLocationService.ts'), 'utf8')
const hqSource = readFileSync(join(__dirname, '../../../../../hq/src/storage/primaryLocationService.ts'), 'utf8')

/** What site may declare beyond everything hq declares, and nothing else. */
const SITE_ONLY_EXPORTS = ['getLocationCwd']

/**
 * The shared region: from the interface both copies open with, to the matching
 * close of `resolvePrimaryLocation`'s body. Brace-counted rather than parsed —
 * deliberately dumb, same as the sibling drift tests, so the failure is a loud
 * mismatch rather than a clever near-miss.
 */
function mirroredRegion(source: string): string {
  const start = source.indexOf('export interface SessionLocationFields {')
  if (start === -1) throw new Error('the shared interface was not found — the file no longer has the shape this test assumes')
  const declStart = source.indexOf('export function resolvePrimaryLocation(', start)
  if (declStart === -1) throw new Error('the shared resolver was not found — the file no longer has the shape this test assumes')
  const braceStart = source.indexOf('{', declStart)
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error('unbalanced braces in the shared resolver')
}

/** Every exported name, in declaration order. */
function exportedNames(source: string): string[] {
  return [...source.matchAll(/^export (?:async )?(?:function|const|interface|type|class) (\w+)/gm)].map(m => m[1])
}

describe('site/server/storage/primaryLocationService.ts ↔ hq/storage/primaryLocationService.ts mirror drift', () => {
  it('declares everything hq declares, in the same order, and beyond it only what site alone owns', () => {
    const hqNames = exportedNames(hqSource)
    const siteNames = exportedNames(siteSource)
    expect(siteNames.slice(0, hqNames.length)).toEqual(hqNames)
    expect(siteNames.slice(hqNames.length)).toEqual(SITE_ONLY_EXPORTS)
  })

  it('is byte-identical through the shared region, comments included', () => {
    expect(mirroredRegion(siteSource)).toBe(mirroredRegion(hqSource))
  })

  it('takes the shape from core, and the layout only on the side that has the disk', () => {
    // Stated as well as compared: the equality above only says the two agree,
    // and two copies repointed together would still pass it.
    expect(siteSource).toContain("import { locationDir, type LocationRef } from './paths'")
    expect(hqSource).toContain("import type { LocationRef } from '@agenthix/core'")
    // The whole point of deleting hq's copy: there is no `paths` beside it to
    // import, and a new one appearing there is the drift this line catches.
    expect(hqSource).not.toContain("from './paths'")
  })

  it('still differs only where it is meant to — the header and site-only tail', () => {
    // Guards the exclusions above from quietly becoming a licence: if site's
    // copy stops saying it is the copy, this test should be revisited rather
    // than carrying an exclusion nothing needs.
    expect(siteSource).toContain('Copied from hq/src/storage/primaryLocationService.ts')
    expect(hqSource).not.toContain('Copied from')
    // hq names a location; it never resolves one to a directory on a site's disk.
    expect(hqSource).not.toContain("node:fs/promises")
    expect(hqSource).not.toContain('locationDir')
  })
})
