/**
 * The permissions a capability carries (§2a), resolved at mint against the
 * real test database: the agent's own tools, narrowed by a boundary's override
 * and by the allowed list of the one workspace the run works in (ADR-0079),
 * failing closed when that workspace cannot be read. The workspace's own
 * settings live on its site, so that read is answered here.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { withFeature } from '../../../test/withFeature'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../storage/workspaceStore')>()
  return { ...actual, getWorkspace: vi.fn(), listWorkspacesByOwner: vi.fn() }
})

import { resolveCapabilityClaims } from '../capabilityService'
import { getWorkspace, listWorkspacesByOwner, SiteUnreachableError } from '../../../storage/workspaceStore'
import { WRITE_TOOLS } from '../../../agents/toolPermissions'
import { FLAGGED_TOOLS } from '../../../features/runFeatures'
import { agent, chatSession, chatLoc, userFilesLoc, projectTaskLoc, seedOrganisation, override } from './capabilityFixtures'

const siteWorkspaces = vi.mocked(getWorkspace)
const ownerListing = vi.mocked(listWorkspacesByOwner)
const workspaceList = (lists: Record<string, string[] | null>) =>
  siteWorkspaces.mockImplementation((async (id: string) => ({ id, allowedTools: lists[id] ?? null })) as never)

beforeEach(async () => {
  vi.clearAllMocks()
  await seedOrganisation()
  workspaceList({})
})

const mint = (overrides: Partial<Parameters<typeof resolveCapabilityClaims>[0]> = {}) =>
  resolveCapabilityClaims({ agent, session: chatSession, primaryLoc: chatLoc, taskId: null, startedBy: 'person', ...overrides })

describe('resolveCapabilityClaims @SC-272', () => {
  it('carries the full §2a claim shape with pre-resolved permissions', async () => {
    const claims = await mint()
    expect(claims).toMatchObject({ userId: 'u1', agentId: 'a1', sessionId: 's1', projectId: null, workspaceId: 'w1', taskId: null, siteId: 'site-1' })
    expect(claims.permissions.bypassed).toBe(false)
    expect(claims.permissions.allowedTools.some(t => t.name === 'read_file' && t.state === 'always')).toBe(true)
    // The agent's own Never tools, then the tools of every flagged feature that is off (adr-0172).
    expect(claims.permissions.neverTools).toEqual([...new Set([
      ...claims.permissions.allowedTools.filter(t => t.state === 'never').map(t => t.name), ...FLAGGED_TOOLS.livePreview!,
    ])])
  })

  it('carries no workspace-access claims — the access policy is gone (ADR-0079)', async () => {
    const claims = await mint()
    for (const gone of ['workspaceBlocked', 'blockedWorkspaceIds', 'mountableWorkspaceIds']) expect(claims).not.toHaveProperty(gone)
  })

  it('falls back to the user files home (workspaceId null) when the session has no primary location', async () => {
    const claims = await mint({ session: { ...chatSession, primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null }, primaryLoc: userFilesLoc })
    expect(claims.workspaceId).toBeNull()
  })

  it.each(['person', 'pulse', 'schedule'] as const)('signs in that a run started by the %s says so (adr-0087)', async (startedBy) => {
    expect((await mint({ startedBy })).startedBy).toBe(startedBy)
  })
})

describe("the live preview's app tools in a run's capability", () => {
  it('are never given while its flag is off, and no live preview is claimed', async () => {
    const claims = await mint()
    for (const tool of FLAGGED_TOOLS.livePreview!) expect(claims.permissions.neverTools).toContain(tool)
    expect(claims).not.toHaveProperty('livePreview')
  })

  withFeature('livePreview', () => {
    it('are not withheld while it is on', async () => {
      const claims = await mint()
      for (const tool of FLAGGED_TOOLS.livePreview!) expect(claims.permissions.neverTools).not.toContain(tool)
    })
  })
})

describe("the organisation's trusted package scopes (adr-0170) @SC-1711", () => {
  it('are signed into every run, live preview or not, as the setting holds them now', async () => {
    expect(await mint()).not.toHaveProperty('trustedPackageScopes')
    await prisma.org.create({ data: { name: 'Fernhill', trustedPackageScopes: ['@fernhill', '@garden'] } })
    const claims = await mint()
    expect(claims.trustedPackageScopes).toEqual(['@fernhill', '@garden'])
    expect(claims).not.toHaveProperty('livePreview')
    await prisma.org.updateMany({ data: { trustedPackageScopes: [] } })
    expect(await mint()).not.toHaveProperty('trustedPackageScopes')
  })
})

describe("a workspace's allowed tools guard only runs working in it @SC-301 (ADR-0079)", () => {
  const defaultAgent = { ...agent, allowedTools: null }

  it('a run working in a workspace with a list gets it: every other tool goes never, the listed tools keep their agent-resolved state', async () => {
    workspaceList({ w1: ['read_file', 'glob_files'] })

    const claims = await mint({ agent: defaultAgent })

    const kept = claims.permissions.allowedTools.filter(t => t.name === 'read_file' || t.name === 'glob_files')
    const others = claims.permissions.allowedTools.filter(t => t.name !== 'read_file' && t.name !== 'glob_files')
    expect(kept).toEqual([{ name: 'read_file', state: 'always' }, { name: 'glob_files', state: 'always' }])
    expect(others.every(t => t.state === 'never')).toBe(true)
    expect(claims.permissions.neverTools).toEqual(expect.arrayContaining(others.map(t => t.name)))
    expect(claims.permissions.neverTools).not.toContain('read_file')
    // Only the run's own workspace is read, by id, and no owner listing at all.
    expect(ownerListing).not.toHaveBeenCalled()
    expect(siteWorkspaces.mock.calls).toEqual([['w1']])
  })

  it('a workspace with allowedTools: null has no list — permissions match a run working in no workspace', async () => {
    const capped = await mint()
    const uncapped = await mint({ session: { ...chatSession, primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null }, primaryLoc: userFilesLoc })
    expect(capped.permissions).toEqual(uncapped.permissions)
  })

  it("one workspace's list does not narrow a run working in another workspace", async () => {
    workspaceList({ w2: ['read_file'] })
    await prisma.workspacePlacement.create({ data: { workspaceId: 'w2', siteId: (await prisma.executionSite.findFirstOrThrow()).id } })
    const inW1 = await mint({ agent: defaultAgent })
    const inW2 = await mint({ agent: defaultAgent, session: { ...chatSession, primaryWorkspaceId: 'w2' }, primaryLoc: { ...chatLoc, workspaceId: 'w2' } })
    expect(inW1.permissions.neverTools).not.toContain('write_file')
    expect(inW2.permissions.neverTools).toContain('write_file')
  })

  it("no workspace's list narrows a run working in the project's files or a task folder", async () => {
    // Were any workspace's list read, this one would narrow write_file.
    workspaceList({ w1: ['read_file'] })
    ownerListing.mockResolvedValue([{ id: 'w1', allowedTools: ['read_file'] }] as never)
    const projectSession = { ...chatSession, primaryOwnerType: 'project' as const, primaryOwnerId: 'p1', primaryWorkspaceId: null }

    const inFiles = await mint({ agent: defaultAgent, session: projectSession, primaryLoc: { ownerType: 'project', ownerId: 'p1' } })
    const inTask = await mint({ agent: defaultAgent, session: { ...projectSession, taskId: 't1' }, primaryLoc: projectTaskLoc, taskId: 't1' })

    for (const claims of [inFiles, inTask]) expect(claims.permissions.neverTools).not.toContain('write_file')
    expect(siteWorkspaces).not.toHaveBeenCalled()
  })

  it('a workspace with allowedTools: [] caps the effective toolset to empty — every tool goes never', async () => {
    workspaceList({ w1: [] })
    const claims = await mint({ agent: defaultAgent })
    expect(claims.permissions.allowedTools.every(t => t.state === 'never')).toBe(true)
    expect(claims.permissions.neverTools).toEqual([...new Set([...claims.permissions.allowedTools.map(t => t.name), ...FLAGGED_TOOLS.livePreview!])])
    expect(claims.permissions.allowedTools.length).toBeGreaterThan(0)
  })

  it('a bypassed agent with a restrictive workspace: allowedTools is [] but the removed tools land in neverTools', async () => {
    workspaceList({ w1: ['read_file'] })
    const claims = await mint({ agent: { ...agent, allowedTools: null, approval: 'bypassed' } })
    expect(claims.permissions.bypassed).toBe(true)
    expect(claims.permissions.allowedTools).toEqual([])
    expect(claims.permissions.neverTools).not.toContain('read_file')
    // write_file is on by default; it is never here only because the workspace's list leaves it out.
    expect(claims.permissions.neverTools).toContain('write_file')
  })

  it('a bypassed agent whose non-null allowedTools OMITS a write tool: the omission still lands in neverTools @SC-352', async () => {
    workspaceList({ w1: ['read_file'] })
    const claims = await mint({ agent: { ...agent, allowedTools: ['read_file'], approval: 'bypassed' } })

    expect(claims.permissions.bypassed).toBe(true)
    expect(claims.permissions.neverTools).toEqual(expect.arrayContaining(['write_file', 'edit_file', 'bash']))
    expect(claims.permissions.neverTools).not.toContain('read_file')

    // The site's runHasWriteTools checks neverTools before the bypassed
    // short-circuit; reproduced here (hq and site never import from each other)
    // over hq's own WRITE_TOOLS, which a drift test keeps equal to the site's.
    function runHasWriteTools(p: { bypassed: boolean; allowedTools: { name: string; state: string }[]; neverTools: string[] }) {
      return WRITE_TOOLS.some(tool => {
        if (p.neverTools?.includes(tool)) return false
        if (p.bypassed) return true
        const entry = p.allowedTools?.find(perm => perm.name === tool)
        return entry?.state === 'always' || entry?.state === 'ask'
      })
    }
    expect(runHasWriteTools(claims.permissions)).toBe(false)
  })
})

describe('the mint fails closed when the workspace cannot be read @SC-322', () => {
  it("propagates the site being unreachable — no capability is returned", async () => {
    siteWorkspaces.mockRejectedValue(new SiteUnreachableError('Box One', 'site-1'))
    await expect(mint()).rejects.toBeInstanceOf(SiteUnreachableError)
  })

  // A workspace that no longer exists is a stale location, not "nothing to cap".
  it('refuses a run whose primary workspace no longer exists, never granting the uncapped shape', async () => {
    siteWorkspaces.mockResolvedValue(null)
    await expect(mint()).rejects.toThrow(/no longer exists/)
  })
})

describe("a boundary's narrowing in the capability — the strictest level wins @SC-614", () => {
  const org = {
    id: 'a1', approval: 'deferred',
    allowedTools: [
      { name: 'read_file', state: 'always' }, { name: 'write_file', state: 'always' }, { name: 'bash', state: 'always' },
      { name: 'web_fetch', state: 'ask' }, { name: 'web_search', state: 'never' },
    ],
    allowedBashPatterns: [{ pattern: 'git', state: 'always' }],
  }
  const projectChat = {
    session: { id: 's1', sessionType: 'chat', userId: 'u1', primaryOwnerType: 'project' as const, primaryOwnerId: 'p1', primaryWorkspaceId: null },
    primaryLoc: { ownerType: 'project' as const, ownerId: 'p1' },
  }
  const personalChat = { session: { ...chatSession, primaryWorkspaceId: null }, primaryLoc: userFilesLoc }
  const stateOf = (claims: Awaited<ReturnType<typeof mint>>, name: string) => claims.permissions.allowedTools.find(t => t.name === name)?.state
  // As the site's gate reads it: the first matching pattern, else "Any other command" — the bash tool's own state.
  const commandState = (claims: Awaited<ReturnType<typeof mint>>, cmd: string) =>
    claims.permissions.allowedBashPatterns.find(p => p.pattern.trim() === '*' || cmd.startsWith(p.pattern.trim()))?.state
      ?? stateOf(claims, 'bash') ?? 'ask'

  it("a project's Never refuses a tool the organisation allows", async () => {
    await override('project', 'p1', { allowedTools: [{ name: 'write_file', state: 'never' }] })
    const claims = await mint({ agent: org, ...projectChat })
    expect(claims.permissions.neverTools).toContain('write_file')
    expect(stateOf(claims, 'read_file')).toBe('always')
  })

  it("a narrowing's Always never loosens the organisation's Ask or Never", async () => {
    await override('project', 'p1', { allowedTools: [{ name: 'web_fetch', state: 'always' }, { name: 'web_search', state: 'always' }] })
    const claims = await mint({ agent: org, ...projectChat })
    expect(stateOf(claims, 'web_fetch')).toBe('ask')
    expect(claims.permissions.neverTools).toContain('web_search')
  })

  it('with the organisation bypassing and a project at immediate, enforces the project\'s tools', async () => {
    await override('project', 'p1', { approval: 'immediate', allowedTools: [{ name: 'bash', state: 'never' }, { name: 'web_fetch', state: 'ask' }] })
    const claims = await mint({ agent: { ...org, approval: 'bypassed' }, ...projectChat })
    expect(claims.permissions.bypassed).toBe(false)
    expect(claims.permissions.neverTools).toContain('bash')
    expect(stateOf(claims, 'web_fetch')).toBe('ask')
    // The organisation's saved Never is not used while it bypasses: every tool starts at Always.
    expect(stateOf(claims, 'web_search')).toBe('always')
  })

  it('stays bypassed when the organisation bypasses and nothing narrower sets an approval', async () => {
    await override('project', 'p1', { allowedTools: [{ name: 'bash', state: 'never' }] })
    const claims = await mint({ agent: { ...org, approval: 'bypassed' }, ...projectChat })
    expect(claims.permissions.bypassed).toBe(true)
    expect(claims.permissions.allowedTools).toEqual([])
  })

  it("a person's narrowing applies in their Chat and not in a project", async () => {
    await override('user', 'u1', { allowedTools: [{ name: 'read_file', state: 'never' }] })
    expect((await mint({ agent: org, ...personalChat })).permissions.neverTools).toContain('read_file')
    expect((await mint({ agent: org, ...projectChat })).permissions.neverTools).not.toContain('read_file')
  })

  it("a project's narrowing does not reach a run in a person's Chat", async () => {
    await override('project', 'p1', { allowedTools: [{ name: 'write_file', state: 'never' }] })
    const claims = await mint({ agent: org, ...personalChat })
    expect(claims.permissions.neverTools).not.toContain('write_file')
  })

  it("gives a command no pattern matches the bash tool's own state, at the strictest level", async () => {
    expect(commandState(await mint({ agent: org, ...projectChat }), 'make build')).toBe('always')
    await override('project', 'p1', { allowedTools: [{ name: 'bash', state: 'ask' }] })
    const claims = await mint({ agent: org, ...projectChat })
    expect(commandState(claims, 'make build')).toBe('ask')
    expect(commandState(claims, 'git status')).toBe('always')
  })

  it('refuses a command a pattern blocks only at the narrower level', async () => {
    await override('project', 'p1', { allowedBashPatterns: [{ pattern: 'git push', state: 'never' }] })
    const claims = await mint({ agent: org, ...projectChat })
    expect(commandState(claims, 'git push origin main')).toBe('never')
    expect(commandState(claims, 'git status')).toBe('always')
  })

  // dispatchService's buildContext applies the same narrowing only if both derive the boundary from the task.
  it("a task session gets its project's narrowing", async () => {
    await override('project', 'p1', { allowedTools: [{ name: 'write_file', state: 'never' }] })
    const claims = await mint({
      agent: org,
      session: { id: 's1', sessionType: 'task', userId: 'u1', primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null, taskId: 't1' },
      primaryLoc: projectTaskLoc,
      taskId: 't1',
    })
    expect(claims.permissions.neverTools).toContain('write_file')
    expect(claims.permissions.neverTools).not.toContain('read_file')
  })
})

describe("bypassed switches off the agent's own permissions, platform tools included @SC-613", () => {
  const personalChat = { session: { ...chatSession, primaryWorkspaceId: null }, primaryLoc: userFilesLoc }
  const saved = [
    { name: 'read_file', state: 'always' }, { name: 'bash', state: 'never' },
    { name: 'create_agent', state: 'never' }, { name: 'update_org', state: 'never' }, { name: 'delete_task', state: 'never' },
  ]

  it("carries none of the organisation's Never in neverTools", async () => {
    const claims = await mint({ agent: { ...agent, allowedTools: saved, approval: 'bypassed' }, ...personalChat })
    expect(claims.permissions.bypassed).toBe(true)
    // Only the tools of a flagged feature that is off, which bind whatever the agent's approval (adr-0172).
    expect(claims.permissions.neverTools).toEqual(FLAGGED_TOOLS.livePreview)
  })

  it("still carries a workspace's cap, after everything", async () => {
    workspaceList({ w1: ['read_file', 'create_agent'] })
    const claims = await mint({ agent: { ...agent, allowedTools: saved, approval: 'bypassed' } })
    expect(claims.permissions.neverTools).not.toContain('create_agent')
    expect(claims.permissions.neverTools).toEqual(expect.arrayContaining(['bash', 'update_org', 'delete_task', 'write_file']))
  })

  it("a project or a person setting deferred or immediate brings the tools back, from Always", async () => {
    await override('user', 'u1', { approval: 'deferred', allowedTools: [{ name: 'create_agent', state: 'never' }] })
    const claims = await mint({ agent: { ...agent, allowedTools: saved, approval: 'bypassed' }, ...personalChat })
    expect(claims.permissions.bypassed).toBe(false)
    expect(claims.permissions.neverTools).toEqual(['create_agent', ...FLAGGED_TOOLS.livePreview!])
  })
})
