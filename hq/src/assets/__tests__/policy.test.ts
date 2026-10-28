import { describe, it, expect } from 'vitest'
import { ASSET_ACTIONS, assertMay, may, refusal, PolicyError, type AgentActor, type AssetAction, type PersonActor, type PolicyTarget } from '../policy'

const person = (over: Partial<PersonActor> = {}): PersonActor => ({ kind: 'person', userId: 'u1', role: 'MEMBER', libraryMaintainer: false, projectRole: null, ...over })
const ORG: PolicyTarget = { level: 'organisation', outsideInstallers: 'ADMINS' }
const ORG_OPEN: PolicyTarget = { level: 'organisation', outsideInstallers: 'ADMINS_AND_MAINTAINERS' }
const PROJECT: PolicyTarget = { level: 'project', projectId: 'p1' }
const OWN: PolicyTarget = { level: 'person', userId: 'u1' }
const OTHERS: PolicyTarget = { level: 'person', userId: 'u2' }

/** Every action, and whether the actor may take it, so each role-by-action pair is written out. */
function table(actor: PersonActor | AgentActor, target: PolicyTarget): Record<AssetAction, boolean> {
  return Object.fromEntries(ASSET_ACTIONS.map(a => [a, may(actor, a, target)])) as Record<AssetAction, boolean>
}

const ALL = Object.fromEntries(ASSET_ACTIONS.map(a => [a, true])) as Record<AssetAction, boolean>
const NONE = Object.fromEntries(ASSET_ACTIONS.map(a => [a, false])) as Record<AssetAction, boolean>
const only = (...actions: AssetAction[]) => ({ ...NONE, ...Object.fromEntries(actions.map(a => [a, true])) })

describe('the Library policy, the organisation level', () => {
  it('lets an administrator do everything', () => {
    expect(table(person({ role: 'ADMIN' }), ORG)).toEqual(ALL)
  })

  it('lets a Library maintainer install from Agenthix, update, roll back, edit, publish and review, nothing else', () => {
    expect(table(person({ libraryMaintainer: true }), ORG)).toEqual(only('install', 'update', 'rollBack', 'editDraft', 'publish', 'reviewProposal'))
  })

  it('lets a maintainer install from outside only when the organisation allows it (P3)', () => {
    expect(may(person({ libraryMaintainer: true }), 'installFromOutside', ORG)).toBe(false)
    expect(may(person({ libraryMaintainer: true }), 'installFromOutside', ORG_OPEN)).toBe(true)
    expect(may(person(), 'installFromOutside', ORG_OPEN)).toBe(false)
  })

  it('gives a member and an account with no role nothing', () => {
    expect(table(person(), ORG)).toEqual(NONE)
    expect(table(person({ role: null, libraryMaintainer: true }), ORG)).toEqual(NONE)
  })
})

describe('the policy, a project', () => {
  it('lets its administrators publish, roll back, remove, review and set its default', () => {
    expect(table(person({ projectRole: 'ADMIN' }), PROJECT)).toEqual(only('install', 'editDraft', 'publish', 'rollBack', 'remove', 'reviewProposal', 'settings'))
  })

  it('lets its members edit drafts and add skills to it, and its viewers nothing', () => {
    expect(table(person({ projectRole: 'MEMBER' }), PROJECT)).toEqual(only('install', 'editDraft'))
    expect(table(person({ projectRole: 'VIEWER' }), PROJECT)).toEqual(NONE)
  })

  it('gives an organisation administrator who is not in the project nothing there (D32)', () => {
    expect(table(person({ role: 'ADMIN' }), PROJECT)).toEqual(NONE)
  })
})

describe('the policy, Your space', () => {
  it('lets the person do everything in their own space but trust, name maintainers, grant or install from outside', () => {
    expect(table(person(), OWN)).toEqual(only('install', 'editDraft', 'publish', 'rollBack', 'remove', 'reviewProposal', 'settings'))
  })

  it('lets nobody else act there, an administrator included', () => {
    expect(table(person({ role: 'ADMIN', libraryMaintainer: true }), OTHERS)).toEqual(NONE)
  })
})

describe('the policy, an agent', () => {
  const agent = (p: PersonActor | null, forUserId = 'u1'): AgentActor => ({ kind: 'agent', agentId: 'a1', forUserId, runId: 'r1', person: p })

  it('only ever edits a draft, and only where the person it acts for may', () => {
    expect(table(agent(person({ role: 'ADMIN' })), ORG)).toEqual(only('editDraft'))
    expect(table(agent(person()), ORG)).toEqual(NONE)
    expect(table(agent(person({ projectRole: 'MEMBER' })), PROJECT)).toEqual(only('editDraft'))
    expect(table(agent(person()), OWN)).toEqual(only('editDraft'))
  })

  it('never publishes, rolls back, installs, trusts, names maintainers or changes settings, whoever it acts for', () => {
    const admin = agent(person({ role: 'ADMIN', libraryMaintainer: true }))
    for (const action of ['publish', 'rollBack', 'install', 'installFromOutside', 'trust', 'nameMaintainer', 'settings'] as const) {
      for (const target of [ORG_OPEN, OWN]) expect(may(admin, action, target)).toBe(false)
    }
  })

  it('has nothing without a person, or when the person resolved is not the one it acts for', () => {
    expect(table(agent(null), OWN)).toEqual(NONE)
    expect(table(agent(person({ userId: 'u1' }), 'u2'), OWN)).toEqual(NONE)
  })
})

describe('refusals', () => {
  it('say who holds the action and end with nothing changed', () => {
    expect(() => assertMay(person(), 'remove', ORG)).toThrow(PolicyError)
    expect(refusal(person(), 'remove', ORG)).toBe('Removing is for administrators. Ask an administrator. Nothing was changed.')
    expect(refusal(person(), 'publish', ORG)).toMatch(/administrators and Library maintainers.*Nothing was changed\.$/)
    expect(refusal(person(), 'installFromOutside', ORG_OPEN)).toMatch(/administrators and Library maintainers/)
    expect(refusal({ kind: 'agent', agentId: 'a', forUserId: 'u1', runId: null, person: person() }, 'publish', ORG)).toMatch(/a person approves/)
  })
})
