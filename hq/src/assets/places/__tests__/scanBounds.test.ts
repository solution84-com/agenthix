import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../sites/channel', () => ({ siteChannelRegistry: {} }))

import { SCAN_SKILLS_MAX_PER_PLACE, type ScannedSkill } from '@agenthix/core'
import { boundedFindings } from '../scan'
import { keptFindings } from '../../delivery/fileSkills'

const F = 'a'.repeat(64)
const found = (n: number, over: Partial<ScannedSkill> = {}): ScannedSkill =>
  ({ group: 'place', path: `skill-${n}`, fingerprint: F, name: `skill-${n}`, description: 'd', ...over })
const many = (count: number) => Array.from({ length: count }, (_, n) => found(n))

/*
 * A site's scan is its word, not hq's (lane rules: "a fingerprint a site reports is hostile input"). The site caps
 * what it reports, but hq records a row per finding and names switched-on ones in every dispatch, so hq keeps to the
 * same cap itself. Without the cap in hq, a site answering with thousands of findings writes thousands of rows.
 */
describe('what hq accepts of a scan @security-L1 @SC-1641', () => {
  it('keeps at most the per-place cap, and says the rest was cut', () => {
    const { skills, cut } = boundedFindings({ skills: many(SCAN_SKILLS_MAX_PER_PLACE + 50), problems: [], truncated: false })
    expect(skills).toHaveLength(SCAN_SKILLS_MAX_PER_PLACE)
    expect(cut).toBe(true)
  })

  it('keeps everything under the cap, cut only when the site said so', () => {
    expect(boundedFindings({ skills: many(3), problems: [], truncated: false })).toMatchObject({ cut: false })
    expect(boundedFindings({ skills: many(3), problems: [], truncated: true })).toMatchObject({ cut: true })
  })

  it('drops a finding whose fingerprint is not a digest, before counting', () => {
    const skills = [found(1, { fingerprint: 'not-a-digest' }), found(2, { fingerprint: F.toUpperCase() }), found(3)]
    expect(boundedFindings({ skills, problems: [], truncated: false }).skills.map(s => s.path)).toEqual(['skill-3'])
  })

  it('reads nothing from an answer that is not a list', () => {
    expect(boundedFindings({ skills: 'x', problems: [], truncated: false } as never)).toEqual({ skills: [], cut: false })
  })

  it('caps what a run is told about the same way', () => {
    expect(keptFindings({ skills: many(SCAN_SKILLS_MAX_PER_PLACE + 1), problems: [], truncated: false }, 'ada', [])).toHaveLength(SCAN_SKILLS_MAX_PER_PLACE)
  })
})
