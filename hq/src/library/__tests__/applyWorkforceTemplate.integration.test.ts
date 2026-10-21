import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

// Workforce-template application against the real test DB (ADR-0035). The DB
// writes are the behaviour under test; the dashboard activity collaborator is a
// side effect and is mocked.
//
// Covers SC-187 (applied agents/teams start disabled) and SC-188 (apply is
// atomic — a mid-way failure rolls back everything created so far, F-022).

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { applyTemplate } from '../workforceTemplateService'
import { readAgentContent } from '../../packages/agentPackageService'
import { NO_EXECUTION_SITE_MESSAGE } from '../../shared/noExecutionSite'
import type { WorkforceTemplateContent, ApplicationSelections } from '../workforceTemplateTypes'

const TEMPLATE: WorkforceTemplateContent = {
  teams: [
    {
      name: 'Engineering',
      purpose: 'Build software',
      agents: [
        { handle: 'dev', name: 'Developer', role: 'Dev', responsibilities: 'Code', skills: [] },
        { handle: 'qa', name: 'QA', role: 'QA', responsibilities: 'Test', skills: [] },
      ],
    },
  ],
  // No projects/boards — keeps the apply path to agents + teams only.
  projects: [],
}

function selectionsFor(template: WorkforceTemplateContent): ApplicationSelections {
  return {
    teams: template.teams.map((t) => ({
      name: t.name,
      include: true,
      agents: t.agents.map((a) => ({
        handle: a.handle,
        resolvedHandle: a.handle,
        include: true,
        skills: [],
      })),
    })),
    projects: [],
  }
}

describe('applyTemplate @SC-187', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates its teams with their agents, in no project', async () => {
    const result = await applyTemplate(TEMPLATE, selectionsFor(TEMPLATE), 'admin-1')

    expect(result.agentCount).toBe(2)
    expect(result.teamCount).toBe(1)

    const team = await prisma.team.findFirst({ where: { name: 'Engineering' }, include: { agents: true, projects: true } })
    expect(team?.agents).toHaveLength(2)
    expect(team?.projects).toEqual([])

    const agents = await prisma.agent.findMany({})
    expect(agents).toHaveLength(2)
  })
})

describe('applyTemplate @SC-188', () => {
  beforeEach(() => vi.clearAllMocks())

  // F-022 — application is atomic. A collision on the second agent throws
  // mid-way; the first agent (created before the failure) is rolled back so no
  // partial bundle is left behind.
  it('rolls back already-created agents when a later agent fails (atomic)', async () => {
    // Pre-create an agent so the template's second agent ("qa") collides.
    await prisma.agent.create({
      data: { name: 'Existing QA', handle: 'qa', runtime: 'claude-sdk' } as any,
    })

    const selections = selectionsFor(TEMPLATE)

    await expect(applyTemplate(TEMPLATE, selections, 'admin-1')).rejects.toThrow(/already exists/)

    // The first agent ("dev") was created before the failure and is rolled back.
    const dev = await prisma.agent.findUnique({ where: { handle: 'dev' } })
    expect(dev).toBeNull()

    // The pre-existing "qa" agent must be untouched (only what apply created is undone).
    const qa = await prisma.agent.findUnique({ where: { handle: 'qa' } })
    expect(qa?.name).toBe('Existing QA')

    // No team should survive the rollback either.
    const teams = await prisma.team.findMany({ where: { name: 'Engineering' } })
    expect(teams).toHaveLength(0)
  })
})

describe('applyTemplate — with no Execution Site connected', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses a template that includes projects before creating any agent, team or project', async () => {
    const withProject: WorkforceTemplateContent = {
      ...TEMPLATE,
      projects: [{ name: 'Roadmap', description: 'd', boards: [] }],
    }
    const selections: ApplicationSelections = {
      ...selectionsFor(withProject),
      projects: [{ name: 'Roadmap', include: true, boards: [] }],
    }

    await expect(applyTemplate(withProject, selections, 'admin-1')).rejects.toThrow(NO_EXECUTION_SITE_MESSAGE)

    expect(await prisma.agent.count()).toBe(0)
    expect(await prisma.team.count()).toBe(0)
    expect(await prisma.project.count()).toBe(0)
    expect(await prisma.executionSite.count()).toBe(0)
  })

  it('still applies a template with no projects — agents and teams need no site', async () => {
    const result = await applyTemplate(TEMPLATE, selectionsFor(TEMPLATE), 'admin-1')

    expect(result).toMatchObject({ agentCount: 2, teamCount: 1, projectCount: 0 })
  })
})

// The spec's skills and approval must reach the created
// agent's actual content and record, not just be plumbed through.
describe('applyTemplate — writes the spec\'s skills and settings (5b.12)', () => {
  beforeEach(() => vi.clearAllMocks())

  const TEMPLATE_WITH_SETTINGS: WorkforceTemplateContent = {
    teams: [
      {
        name: 'Support',
        purpose: 'Help users',
        agents: [
          {
            handle: 'helper',
            name: 'Helper',
            role: 'Support',
            responsibilities: 'Answer questions',
            approval: 'immediate',
            skills: [{ slug: 'triage', name: 'Triage', description: 'Sorts tickets', content: 'Triage body' }],
          },
        ],
      },
    ],
    projects: [],
  }

  it('writes the selected skill and approval from the spec', async () => {
    const selections: ApplicationSelections = {
      teams: [
        {
          name: 'Support',
          include: true,
          agents: [
            {
              handle: 'helper',
              resolvedHandle: 'helper',
              include: true,
              skills: [{ slug: 'triage', include: true }],
            },
          ],
        },
      ],
      projects: [],
    }

    await applyTemplate(TEMPLATE_WITH_SETTINGS, selections, 'admin-1')

    const agent = await prisma.agent.findUnique({ where: { handle: 'helper' } })
    expect(agent).not.toBeNull()
    // Settings live on the record (ADR-0072).
    expect(agent?.approval).toBe('immediate')

    const current = await readAgentContent(agent!.id)
    expect(current?.skillFiles.map((f) => f.path)).toEqual(['skills/triage/SKILL.md'])
    expect(current?.skillFiles[0].content.toString('utf-8')).toContain('Triage body')
  })
})
