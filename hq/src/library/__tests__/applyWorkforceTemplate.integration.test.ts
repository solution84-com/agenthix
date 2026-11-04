import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole, ensureExecutionSite } from '../../test/factories'

// Team templates as assets (adr-0157), applied against the real test database. Covers SC-187 (teams with their
// agents, in no project), SC-188 (apply is atomic, F-022), what the team and agents keep from the template version,
// and the skills it carries: installed when first used (D14), granted rather than copied (D23).

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
// A project's first files are written on its site; the site is not under test here.
const site = vi.hoisted(() => ({ seedFilesOnSite: vi.fn(), ensureDirOnSite: vi.fn() }))
vi.mock('../../storage/locationFileStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/locationFileStore')>()),
  ...site,
}))

import { applyTeamTemplate, getTeamTemplate } from '../workforceTemplateService'
import { buildInitialSelections, type ApplicationSelections } from '../workforceTemplateTypes'
import { readAgentContent } from '../../packages/agentPackageService'
import { NO_EXECUTION_SITE_MESSAGE } from '../../shared/noExecutionSite'
import { seedTemplate, teamPackage } from '../../assets/templates/__tests__/templateFixtures'

const TWO = [{ handle: 'dev', skills: ['review', 'dev-code-quality'] }, { handle: 'qa', skills: ['dev-code-quality'] }]

async function seedTeam(opts: Parameters<typeof teamPackage>[1] = { agents: TWO, roleSkills: ['review'], shared: [{ name: 'dev-code-quality', version: '2.0.0' }] }, source: 'BUILT_IN' | 'UPLOAD' = 'BUILT_IN') {
  return seedTemplate(prisma, 'TEAM', 'crew', teamPackage('crew', opts), { source, publisher: opts.publisher })
}

async function allOf(ref = 'crew'): Promise<ApplicationSelections> {
  const view = await getTeamTemplate(ref)
  return buildInitialSelections(view!.content, new Set())
}

const skillNames = async () => (await prisma.asset.findMany({ where: { kind: 'SKILL' }, select: { name: true }, orderBy: { name: 'asc' } })).map(a => a.name)

describe('applyTeamTemplate @SC-187', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates its teams with their agents, in no project, each keeping the version it came from', async () => {
    const { versionId } = await seedTeam()
    const result = await applyTeamTemplate('crew', await allOf(), 'admin-1')

    expect(result).toMatchObject({ agentCount: 2, teamCount: 1, projectCount: 0, missingSkills: [] })
    const team = await prisma.team.findFirst({ where: { name: 'Crew' }, include: { agents: true, projects: true } })
    expect(team).toMatchObject({ madeFromVersionId: versionId, projects: [] })
    expect(team?.agents).toHaveLength(2)
    expect((await prisma.agent.findMany({ select: { madeFromVersionId: true } })).map(a => a.madeFromVersionId)).toEqual([versionId, versionId])
  })

  it('finds the template by asset id and by identity too', async () => {
    const { assetId } = await seedTeam()
    expect((await getTeamTemplate(assetId))?.identity).toBe('agenthix/crew')
    expect((await getTeamTemplate('agenthix/crew'))?.id).toBe(assetId)
    await expect(applyTeamTemplate('agenthix/nothing', await allOf(), 'admin-1')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('applyTeamTemplate: the skills it carries (D14, D23)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('installs them on first use, never before, and grants each agent only the ones chosen for it', async () => {
    await seedTeam()
    expect(await skillNames()).toEqual([])

    const selections = await allOf()
    // qa's shared skill left out on the review page.
    selections.teams[0].agents[1].skills = [{ slug: 'dev-code-quality', include: false }]
    await applyTeamTemplate('crew', selections, 'admin-1')

    expect(await skillNames()).toEqual(['crew/review', 'dev-code-quality'])
    const shared = await prisma.asset.findFirstOrThrow({ where: { name: 'dev-code-quality' }, include: { currentVersion: true } })
    expect(shared.currentVersion?.version).toBe('2.0.0')
    const grants = async (handle: string) => (await prisma.assetGrant.findMany({ where: { agent: { handle } }, include: { asset: true } })).map(g => g.asset.name).sort()
    expect(await grants('dev')).toEqual(['crew/review', 'dev-code-quality'])
    expect(await grants('qa')).toEqual([])
    // Granted, never copied into the agent.
    const dev = await prisma.agent.findUniqueOrThrow({ where: { handle: 'dev' } })
    expect((await readAgentContent(dev.id))?.skillFiles).toEqual([])
  })

  it('reuses a shared skill already here at that version, and offers a newer one without pinning it', async () => {
    await seedTeam()
    const older = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'agenthix', name: 'dev-code-quality' } })
    const { storeContent } = await import('../../assets/content')
    const v1 = await prisma.assetVersion.create({ data: { assetId: older.id, version: '1.0.0', digest: await storeContent([{ path: 'SKILL.md', content: Buffer.from('---\nname: x\ndescription: old\n---\n') }], prisma), source: 'BUILT_IN' } })
    await prisma.asset.update({ where: { id: older.id }, data: { currentVersionId: v1.id } })

    await applyTeamTemplate('crew', await allOf(), 'admin-1')

    const after = await prisma.asset.findUniqueOrThrow({ where: { id: older.id }, include: { currentVersion: true, versions: true } })
    expect(after.currentVersion?.version).toBe('1.0.0')
    expect(after.versions.map(v => v.version).sort()).toEqual(['1.0.0', '2.0.0'])
  })

  it('leaves a skill an administrator removed removed, and names it as missing', async () => {
    await seedTeam()
    await applyTeamTemplate('crew', await allOf(), 'admin-1')
    await prisma.asset.updateMany({ where: { name: 'crew/review' }, data: { removedAt: new Date() } })
    await prisma.team.deleteMany({})
    await prisma.agent.deleteMany({})

    const result = await applyTeamTemplate('crew', await allOf(), 'admin-1')
    expect(result.missingSkills).toEqual(['crew/review'])
    expect((await prisma.asset.findFirstOrThrow({ where: { name: 'crew/review' } })).removedAt).not.toBeNull()
  })
})

describe('applyTeamTemplate: settings (R10)', () => {
  it("starts a template's bypassed agent on Deferred unless the template is Agenthix's own", async () => {
    await seedTeam({ agents: [{ handle: 'free', approval: 'bypassed' }], publisher: 'acme' }, 'UPLOAD')
    await applyTeamTemplate('acme/crew', await allOf('acme/crew'), 'admin-1')
    expect((await prisma.agent.findUniqueOrThrow({ where: { handle: 'free' } })).approval).toBe('deferred')
  })

  it("ignores the tool and Bash permissions of a template not from hq's image: its agents get the defaults", async () => {
    const asks = { allowedTools: [{ name: 'Bash', state: 'always' }], allowedBashPatterns: ['*'] }
    await seedTeam({ agents: [{ handle: 'free', ...asks }], publisher: 'acme' }, 'UPLOAD')
    await applyTeamTemplate('acme/crew', await allOf('acme/crew'), 'admin-1')
    expect(await prisma.agent.findUniqueOrThrow({ where: { handle: 'free' } })).toMatchObject({ allowedTools: null, allowedBashPatterns: null })
  })

  it("keeps the tool permissions of a template from hq's image", async () => {
    await seedTeam({ agents: [{ handle: 'free', allowedTools: [{ name: 'read_file', state: 'always' }] }] })
    await applyTeamTemplate('crew', await allOf(), 'admin-1')
    expect((await prisma.agent.findUniqueOrThrow({ where: { handle: 'free' } })).allowedTools).toEqual([{ name: 'read_file', state: 'always' }])
  })

  it('keeps bypassed for a template from hq\'s image', async () => {
    await seedTeam({ agents: [{ handle: 'free', approval: 'bypassed' }] })
    await applyTeamTemplate('crew', await allOf(), 'admin-1')
    expect((await prisma.agent.findUniqueOrThrow({ where: { handle: 'free' } })).approval).toBe('bypassed')
  })
})

describe('applyTeamTemplate @SC-188', () => {
  beforeEach(() => vi.clearAllMocks())

  // F-022: a collision found only while creating (another request took the handle between the check and the create)
  // throws mid-way; the first agent is rolled back.
  it('rolls back already-created agents when a later agent fails (atomic)', async () => {
    await seedTeam()
    await prisma.agent.create({ data: { name: 'Existing QA', handle: 'qa' } as any })
    const selections = await allOf()
    vi.spyOn(prisma.agent, 'findMany').mockResolvedValueOnce([])

    await expect(applyTeamTemplate('crew', selections, 'admin-1')).rejects.toMatchObject({ statusCode: 409 })

    expect(await prisma.agent.findUnique({ where: { handle: 'dev' } })).toBeNull()
    expect((await prisma.agent.findUnique({ where: { handle: 'qa' } }))?.name).toBe('Existing QA')
    expect(await prisma.team.count()).toBe(0)
  })

  it('refuses a handle an agent already has with 409, naming it, before installing or creating anything', async () => {
    await seedTeam()
    await prisma.agent.create({ data: { name: 'Existing QA', handle: 'qa' } as any })

    await expect(applyTeamTemplate('crew', await allOf(), 'admin-1')).rejects.toMatchObject({
      statusCode: 409, message: expect.stringMatching(/@qa \(already taken\).*Nothing was changed\./),
    })

    expect(await prisma.agent.count()).toBe(1)
    expect(await prisma.asset.count({ where: { kind: 'SKILL' } })).toBe(0)
  })

  it('refuses two agents given the same typed handle', async () => {
    await seedTeam()
    const selections = await allOf()
    selections.teams[0].agents[1].resolvedHandle = selections.teams[0].agents[0].resolvedHandle

    await expect(applyTeamTemplate('crew', selections, 'admin-1')).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('used twice here') })
    expect(await prisma.agent.count()).toBe(0)
  })
})

describe('applyTeamTemplate: with no Execution Site connected', () => {
  it('refuses a template that includes projects before creating any agent, team or project', async () => {
    await seedTeam({ agents: TWO.map(a => ({ ...a, skills: [] })), board: 'kanban' })
    await expect(applyTeamTemplate('crew', await allOf(), 'admin-1')).rejects.toThrow(NO_EXECUTION_SITE_MESSAGE)
    expect(await prisma.agent.count()).toBe(0)
    expect(await prisma.team.count()).toBe(0)
    expect(await prisma.project.count()).toBe(0)
  })

  it('still applies a template with no projects: agents and teams need no site', async () => {
    await seedTeam()
    expect(await applyTeamTemplate('crew', await allOf(), 'admin-1')).toMatchObject({ agentCount: 2, teamCount: 1, projectCount: 0 })
  })
})

describe('applyTeamTemplate: the projects it makes', () => {
  it('makes the person who applied it the admin of each project', async () => {
    await ensureExecutionSite()
    const applier = await createUserWithRole('ADMIN')
    await createUserWithRole('ADMIN')
    await seedTeam({ agents: TWO.map(a => ({ ...a, skills: [] })), board: 'kanban' })

    await applyTeamTemplate('crew', await allOf(), applier.id)

    const project = await prisma.project.findFirstOrThrow()
    expect(await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: applier.id } } })).toMatchObject({ role: 'ADMIN' })
  })
})

describe('what a team template made is its own (adr-0072)', () => {
  it('keeps the version it was made from when the template moves on', async () => {
    const { assetId, versionId } = await seedTeam()
    await applyTeamTemplate('crew', await allOf(), 'admin-1')
    const { storeContent } = await import('../../assets/content')
    const next = await prisma.assetVersion.create({ data: { assetId, version: '2.0.0', digest: await storeContent(teamPackage('crew', { agents: [{ handle: 'solo' }], version: '2.0.0' }), prisma), source: 'BUILT_IN' } })
    await prisma.asset.update({ where: { id: assetId }, data: { currentVersionId: next.id } })

    expect((await prisma.team.findFirstOrThrow({})).madeFromVersionId).toBe(versionId)
  })
})
