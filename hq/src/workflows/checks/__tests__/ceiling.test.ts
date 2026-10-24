import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ facts: vi.fn(), forPlace: vi.fn(), preferred: vi.fn() }))
vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../github/githubFacts', () => ({ currentFacts: m.facts }))
vi.mock('../../../github/connectRule', () => ({ installationsForPlace: m.forPlace, projectDefaultInstallationId: m.preferred }))

import { githubCeilingFor } from '../ceiling'
import { checkFlags } from '..'
import { version, step } from './support'

const place = { type: 'project' as const, id: 'p1' }
const inst = (id: string, installationId: number) => ({ id, installationId })
const needs = (perm: Record<string, string>) => version({ steps: [step('echo hi', ['GITHUB_TOKEN'])], hosts: ['api.github.com:443'], github: perm })

beforeEach(() => {
  vi.clearAllMocks()
  m.preferred.mockResolvedValue(null)
})

describe('the permission ceiling @A16', () => {
  it('is unknown when GitHub hasn\'t been read', async () => {
    m.facts.mockResolvedValue(null)
    expect(await githubCeilingFor(place)).toEqual({ known: false })
  })

  it('is the App\'s permissions and what the place\'s accounts all accepted', async () => {
    m.facts.mockResolvedValue({ app: { contents: 'write', issues: 'write' }, accounts: new Map([[1, { contents: 'write', issues: 'write' }], [2, { contents: 'write' }]]) })
    m.forPlace.mockResolvedValue([inst('a', 1), inst('b', 2)])
    expect(await githubCeilingFor(place)).toEqual({ known: true, app: { contents: 'write', issues: 'write' }, account: { contents: 'write' } })
  })

  it('uses the project\'s default account when it has one', async () => {
    m.facts.mockResolvedValue({ app: { contents: 'write', issues: 'write' }, accounts: new Map([[1, { contents: 'write', issues: 'write' }], [2, { contents: 'read' }]]) })
    m.forPlace.mockResolvedValue([inst('a', 1), inst('b', 2)])
    m.preferred.mockResolvedValue('a')
    expect((await githubCeilingFor(place) as { account: unknown }).account).toEqual({ contents: 'write', issues: 'write' })
  })

  it('rule 6 names the permission the App lacks and how to add it; a workflow within the ceiling has no such flag', async () => {
    m.facts.mockResolvedValue({ app: { contents: 'write' }, accounts: new Map([[1, { contents: 'write' }]]) })
    m.forPlace.mockResolvedValue([inst('a', 1)])
    const ceiling = await githubCeilingFor(place)
    const over = checkFlags(needs({ issues: 'write' }), null, ceiling).filter((f) => f.rule === 6 && /needs Issues: write/.test(f.message))
    expect(over).toHaveLength(1)
    expect(over[0].message).toContain('App\'s settings on GitHub')
    expect(checkFlags(needs({ contents: 'write' }), null, ceiling).filter((f) => /needs |hasn't accepted/.test(f.message))).toHaveLength(0)
  })

  it('names the account that hasn\'t accepted a permission the App holds', async () => {
    m.facts.mockResolvedValue({ app: { contents: 'write', issues: 'write' }, accounts: new Map([[1, { contents: 'write' }]]) })
    m.forPlace.mockResolvedValue([inst('a', 1)])
    const flags = checkFlags(needs({ issues: 'write' }), null, await githubCeilingFor(place)).filter((f) => /hasn't accepted/.test(f.message))
    expect(flags).toHaveLength(1)
  })
})
