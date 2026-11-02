import { describe, expect, it } from 'vitest'
import { labelledWith } from './siteLabels'

const lines = [
  'c1\tcom.docker.compose.project=agenthix-dev-agents,agenthix-dev.site=run-site-1,agenthix-dev.owner=project:p1',
  'c2\tagenthix-dev.site=run-site-2',
  'c3\tagenthix-dev.site=developers-own-site',
  'c4\tagenthix.site=installed-site,com.docker.compose.project=agenthix',
  'c5\tother.label=run-site-1',
  'c6\t',
  '',
].join('\n')

describe("teardown finds what the run's sites made, by their ids", () => {
  it("matches a site label of any namespace naming one of the run's ids, and nothing else", () => {
    expect(labelledWith(lines, ['run-site-1', 'run-site-2'])).toEqual(['c1', 'c2'])
  })

  it("leaves a developer's site and an installed copy alone", () => {
    expect(labelledWith(lines, ['run-site-1'])).not.toContain('c3')
    expect(labelledWith(lines, ['run-site-1'])).not.toContain('c4')
  })

  it('finds nothing for no ids', () => {
    expect(labelledWith(lines, [])).toEqual([])
  })
})
