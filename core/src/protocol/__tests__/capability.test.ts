import { describe, it, expect } from 'vitest'
import {
  CAPABILITY_TTL_SECONDS, CAPABILITY_RENEWAL_FRACTION, IDENTITY_TOKEN_TTL_SECONDS,
  HQ_TOKEN_ISSUER, HQ_JWKS_PATH, HQ_DATA_PATH,
  parseCapabilityRunner, sameRunner, runnerBoundaryMismatch, parseCapabilityOnBehalfOf, APPROVALS, isApproval,
  type CapabilityClaims, type CapabilityRunner, type ToolPermission,
} from '../capability.js'

describe('capability protocol contract @SC-272', () => {
  it('pins the ADR-0040 TTL decisions', () => {
    expect(IDENTITY_TOKEN_TTL_SECONDS).toBe(3600)
    expect(CAPABILITY_TTL_SECONDS).toBe(900)
    expect(CAPABILITY_RENEWAL_FRACTION).toBe(0.8)
    expect(HQ_TOKEN_ISSUER).toBe('agenthix-hq')
    expect(HQ_JWKS_PATH).toBe('/.well-known/jwks.json')
    expect(HQ_DATA_PATH).toBe('/api/v1/data')
  })

  it('claim shape carries the §2a fields', () => {
    const perm: ToolPermission = { name: 'create_task', state: 'always' }
    const claims: CapabilityClaims = {
      tokenType: 'capability', userId: 'u1', runner: { kind: 'person', userId: 'u1' }, startedBy: 'person', agentId: 'a1', sessionId: 's1',
      projectId: null, workspaceId: null, taskId: null, role: null, siteId: 'site1',
      permissions: { bypassed: false, allowedTools: [perm], allowedBashPatterns: [], neverTools: [] },
    }
    expect(claims.tokenType).toBe('capability')
  })
})

describe('capability claims role field @SC-298', () => {
  it('accepts a non-null role for chat-minted capabilities', () => {
    const perm: ToolPermission = { name: 'create_task', state: 'always' }
    const claims: CapabilityClaims = {
      tokenType: 'capability', userId: 'u1', runner: { kind: 'person', userId: 'u1' }, startedBy: 'person', agentId: 'a1', sessionId: 's1',
      projectId: null, workspaceId: null, taskId: null, role: 'MEMBER', siteId: 'site1',
      permissions: { bypassed: false, allowedTools: [perm], allowedBashPatterns: [], neverTools: [] },
    }
    expect(claims.role).toBe('MEMBER')
  })
})

describe('the runner claim', () => {
  const alice: CapabilityRunner = { kind: 'person', userId: 'alice' }
  const projectX: CapabilityRunner = { kind: 'project', projectId: 'px' }
  const inX = { ownerType: 'project' as const, ownerId: 'px' }
  const inAlices = { ownerType: 'user' as const, ownerId: 'alice' }

  it('parses both forms and refuses anything else', () => {
    expect(parseCapabilityRunner(alice)).toEqual(alice)
    expect(parseCapabilityRunner(projectX)).toEqual(projectX)
    for (const junk of [undefined, null, 'alice', {}, { kind: 'person' }, { kind: 'person', userId: '' },
      { kind: 'project', userId: 'px' }, { kind: 'agent', agentId: 'a1' }]) {
      expect(parseCapabilityRunner(junk)).toBeNull()
    }
  })

  it('keeps only the known fields', () => {
    expect(parseCapabilityRunner({ kind: 'person', userId: 'alice', role: 'ADMIN' })).toEqual(alice)
  })

  it('compares runners by kind and id', () => {
    expect(sameRunner(alice, { kind: 'person', userId: 'alice' })).toBe(true)
    expect(sameRunner(alice, { kind: 'person', userId: 'bob' })).toBe(false)
    expect(sameRunner(projectX, { kind: 'project', projectId: 'py' })).toBe(false)
    expect(sameRunner(alice, projectX)).toBe(false)
  })

  const fits = (runner: CapabilityRunner, storage: typeof inX | typeof inAlices | null, sessionType: string, invokerUserId = 'alice') =>
    runnerBoundaryMismatch({ runner, storage, sessionType, invokerUserId }) === null

  it('accepts the runner each kind of run is given', () => {
    expect(fits(alice, inX, 'chat')).toBe(true)
    expect(fits(projectX, inX, 'task', 'some-admin')).toBe(true)
    expect(fits(alice, inAlices, 'chat')).toBe(true)
    expect(fits(alice, inAlices, 'task', 'some-admin')).toBe(true)
  })

  it("refuses a runner who is not the owner of a person's own storage", () => {
    expect(fits({ kind: 'person', userId: 'bob' }, inAlices, 'task')).toBe(false)
    expect(fits({ kind: 'person', userId: 'bob' }, inAlices, 'chat', 'bob')).toBe(false)
    expect(fits({ kind: 'project', projectId: 'alice' }, inAlices, 'task')).toBe(false)
  })

  it('refuses a project runner for a different project', () => {
    expect(fits({ kind: 'project', projectId: 'py' }, inX, 'task')).toBe(false)
  })

  it('refuses a chat that is not run for its invoker', () => {
    expect(fits({ kind: 'person', userId: 'bob' }, inX, 'chat', 'alice')).toBe(false)
    expect(fits(projectX, inX, 'chat')).toBe(false)
  })

  it('refuses a person runner for a task in a project', () => {
    expect(fits(alice, inX, 'task')).toBe(false)
  })

  it('refuses a run with no storage boundary', () => {
    expect(fits(alice, null, 'chat')).toBe(false)
    expect(fits(projectX, null, 'task')).toBe(false)
  })
})

describe("the run's person claim @SC-520", () => {
  it('reads a person id, and nothing else as one', () => {
    expect(parseCapabilityOnBehalfOf('dana')).toBe('dana')
    for (const junk of [undefined, null, '', 42, {}, { userId: 'dana' }, ['dana']]) {
      expect(parseCapabilityOnBehalfOf(junk)).toBeNull()
    }
  })

  it('is optional on the claim shape', () => {
    const base: CapabilityClaims = {
      tokenType: 'capability', userId: 'admin', runner: { kind: 'project', projectId: 'px' }, startedBy: 'person', agentId: 'a1',
      sessionId: 's1', projectId: 'px', workspaceId: null, taskId: 't1', role: null, siteId: 'site1',
      permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
    }
    const withPerson: CapabilityClaims = { ...base, onBehalfOfUserId: 'dana' }
    expect(parseCapabilityOnBehalfOf(base.onBehalfOfUserId)).toBeNull()
    expect(parseCapabilityOnBehalfOf(withPerson.onBehalfOfUserId)).toBe('dana')
  })
})

describe("an agent's approval @SC-750", () => {
  it('lists bypassed, deferred and immediate, loosest first', () => {
    expect(APPROVALS).toEqual(['bypassed', 'deferred', 'immediate'])
  })

  it('knows its own values and nothing else — no alias for the old autonomy', () => {
    for (const a of APPROVALS) expect(isApproval(a)).toBe(true)
    for (const junk of ['unrestricted', 'strict', '', null, undefined, 1]) expect(isApproval(junk)).toBe(false)
  })
})
