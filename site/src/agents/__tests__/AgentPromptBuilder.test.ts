import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AgentPromptBuilder } from '../AgentPromptBuilder'

const agent = { id: 'a1', name: 'Scout', handle: 'scout', role: 'researcher' }
const content = { instructions: '# Scout\n\nBe brief.', org: '---\nname: Acme\n---' }
let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-')); process.env.SITE_ROOT = root })
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

describe('AgentPromptBuilder with package content', () => {
  it('puts the package instructions right after the identity', async () => {
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildChatPrompt({})
    const parts = systemPrompt.split('\n\n---\n\n')
    expect(parts[0]).toMatch(/^# Agent Identity/)
    expect(parts[1]).toBe('# Scout\n\nBe brief.')
  })

  it('inlines ORG.md in a task prompt instead of pointing at /shared', async () => {
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildTaskPrompt({
      projectId: 'p1', boardName: 'B', columns: '- todo', taskId: 't1', title: 'T', description: 'D', roadmapPath: '/r',
    })
    expect(systemPrompt).toContain('## Organisation\n\n---\nname: Acme\n---')
    expect(systemPrompt).not.toContain('/shared/org/ORG.md')
  })

  it('a task prompt marks the comments new since the last run, and says where the rest are @SC-522', async () => {
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildTaskPrompt({
      projectId: 'p1', boardName: 'B', columns: '- todo', taskId: 't1', title: 'T', description: 'D', roadmapPath: '/r',
      newComments: [{ author: 'ana', at: '2026-10-07T09:00:00.000Z', text: 'Use the staging bucket.' }],
    })
    expect(systemPrompt).toContain('## New comments')
    expect(systemPrompt).toContain('ana, 2026-10-07 09:00 UTC:\nUse the staging bucket.')
    expect(systemPrompt).toContain('get_task_details')
    expect(systemPrompt.indexOf('## New comments')).toBeGreaterThan(systemPrompt.indexOf('## Task'))
  })

  it('a task prompt with no new comments has no comments section @SC-522', async () => {
    for (const newComments of [undefined, []]) {
      const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildTaskPrompt({
        projectId: 'p1', boardName: 'B', columns: '- todo', taskId: 't1', title: 'T', description: 'D', roadmapPath: '/r', newComments,
      })
      expect(systemPrompt).not.toContain('## New comments')
    }
  })

  it("a chat prompt and a task prompt both carry the place's AGENTS.md", async () => {
    const withPlace = { ...content, place: 'Use British spelling.' }
    const chat = await new AgentPromptBuilder(agent, withPlace).buildChatPrompt({})
    const task = await new AgentPromptBuilder(agent, withPlace).buildTaskPrompt({
      projectId: 'p1', boardName: 'B', columns: '- todo', taskId: 't1', title: 'T', description: 'D', roadmapPath: '/r',
    })
    for (const { systemPrompt } of [chat, task]) {
      expect(systemPrompt).toContain('AGENTS.md')
      expect(systemPrompt).toContain('Use British spelling.')
    }
    expect(task.systemPrompt.indexOf('Use British spelling.')).toBeLessThan(task.systemPrompt.indexOf('## Board'))
  })

  it("a prompt for a place with no AGENTS.md has no section for it, and never reads PROJECT.md", async () => {
    const home = path.join(root, 'projects', 'p1', 'files')
    await fs.mkdir(home, { recursive: true })
    await fs.writeFile(path.join(home, 'PROJECT.md'), 'Vision: old')
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildTaskPrompt({
      projectId: 'p1', boardName: 'B', columns: '- todo', taskId: 't1', title: 'T', description: 'D', roadmapPath: '/r',
    })
    expect(systemPrompt).not.toContain('AGENTS.md')
    expect(systemPrompt).not.toContain('Vision: old')
  })

  it('every prompt says how memory is reached, and carries none of it', async () => {
    const chat = await new AgentPromptBuilder(agent, content).buildChatPrompt({})
    const task = await new AgentPromptBuilder(agent, content).buildTaskPrompt({
      projectId: 'p1', boardName: 'B', columns: '- todo', taskId: 't1', title: 'T', description: 'D', roadmapPath: '/r',
    })
    for (const { systemPrompt } of [chat, task]) {
      expect(systemPrompt).toContain('## Memory')
      expect(systemPrompt).toContain('`recall`')
      expect(systemPrompt).not.toContain('/memory')
    }
  })
})

/**
 * The agenda belongs to the PERSON, not to the agent whose prompt this is
 * (close-out spec §6.1) — and the path the prompt prints is the one the RUN
 * sees, so it names a file the run can open rather than one beside its mounts.
 */
describe('the agenda section names the person\'s own file', () => {
  const agenda = {
    hostPath: '/site/projects/p1/members/u1/agenda.md',
    visiblePath: '/projects/atlas/members/u1/agenda.md',
  }

  it('renders the run-visible path, not the host path it reads from', async () => {
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildChatPrompt({
      agenda,
    })
    expect(systemPrompt).toContain('`/projects/atlas/members/u1/agenda.md`')
    expect(systemPrompt).not.toContain('/site/projects/p1/members/u1/agenda.md')
  })

  it('says whose it is and who can read it — the person\'s, not the agent\'s', async () => {
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildChatPrompt({
      agenda,
    })
    const section = systemPrompt.split('\n\n---\n\n').find(s => s.startsWith('## Agenda'))!
    expect(section).toContain('the person you are working with')
    expect(section).toContain('theirs, not yours')
    expect(section).toMatch(/anyone who can reach this location can read it/)
    // The old wording put it in the agent's own workspace, which it never was.
    expect(section).not.toMatch(/in your workspace/)
  })

  it('gives two agents in one boundary the same agenda, not one each', async () => {
    const other = { id: 'a2', name: 'Bolt', handle: 'bolt', role: 'builder' }
    const line = (p: string) => p.split('\n').find(l => l.includes('agenda.md'))
    const scout = await new AgentPromptBuilder(agent, content).buildChatPrompt({ agenda })
    const bolt = await new AgentPromptBuilder(other, content).buildChatPrompt({ agenda })
    expect(line(scout.systemPrompt)).toBeDefined()
    expect(line(bolt.systemPrompt)).toBe(line(scout.systemPrompt))
    expect(line(scout.systemPrompt)).not.toContain('scout')
  })

  it('inlines the agenda file it reads from the host path', async () => {
    const hostPath = path.join(root, 'projects', 'p1', 'members', 'u1', 'agenda.md')
    await fs.mkdir(path.dirname(hostPath), { recursive: true })
    await fs.writeFile(hostPath, '## Now\n\n- Confirm the org name', 'utf-8')
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildChatPrompt({
      agenda: { hostPath, visiblePath: agenda.visiblePath },
    })
    expect(systemPrompt).toContain('- Confirm the org name')
  })

  it('a run with no person\'s area to reach claims no agenda at all', async () => {
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildChatPrompt({})
    const section = systemPrompt.split('\n\n---\n\n').find(s => s.startsWith('## Agenda'))!
    expect(section).toContain('no agenda to read or update')
    expect(section).not.toContain('agenda.md')
  })

  it('names no agent workspace in the prompt', async () => {
    // The agent has no working directory of its own any more, so no section may
    // name one — not the identity block, which used to print it as the agent's
    // **Workspace:**, and not the Filesystem list, which repeated it beside the
    // run's cwd. Both the fixed container path and the host-shaped one are
    // checked, since the two used to be the same line under different modes.
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildChatPrompt({
      agenda,
      containerMounts: { locations: [{ containerDir: '/projects/atlas/members' }], primaryContainerPath: '/projects/atlas/files' },
    })
    expect(systemPrompt).not.toContain('Workspace')
    expect(systemPrompt).not.toContain('/workspace')
    expect(systemPrompt).not.toContain('/agents/scout')
    // Positive control: the Filesystem section was built at all, and still says
    // where the run works — this cannot pass by producing an empty prompt.
    const section = systemPrompt.split('\n\n---\n\n').find(s => s.startsWith('## Filesystem'))!
    expect(section).toContain('/projects/atlas/files')
    expect(section).toContain('/projects/atlas/members')
  })

  it('prints each id-keyed folder with its current name (ADR-0074)', async () => {
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildChatPrompt({
      containerMounts: {
        locations: [
          { containerDir: '/projects/p1/files', description: 'files of the project currently named "Atlas"' },
          { containerDir: '/projects/p1/workspaces/w1', description: 'workspace "web"' },
        ],
        primaryContainerPath: '/projects/p1/workspaces/w1',
      },
    })
    const section = systemPrompt.split('\n\n---\n\n').find(s => s.startsWith('## Filesystem'))!
    expect(section).toMatch(/named by id/)
    expect(section).toContain('- `/projects/p1/workspaces/w1` — workspace "web"')
    expect(section).toContain('- `/projects/p1/files` — files of the project currently named "Atlas"')
  })
})

describe('which runs have an agenda at all', () => {
  const agendaSections = (prompt: string) =>
    prompt.split('\n\n---\n\n').filter(s => s.startsWith('## Agenda'))

  it('emits exactly one Agenda heading, even when the file has content', async () => {
    // The contents used to be pushed as a second section under the same
    // heading, so a run with a non-empty agenda saw it twice.
    const hostPath = path.join(root, 'projects', 'p1', 'members', 'u1', 'agenda.md')
    await fs.mkdir(path.dirname(hostPath), { recursive: true })
    await fs.writeFile(hostPath, '## Now\n\n- Confirm the org name', 'utf-8')
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildChatPrompt({
      agenda: { hostPath, visiblePath: '/projects/atlas/members/u1/agenda.md' },
    })
    expect(agendaSections(systemPrompt)).toHaveLength(1)
    expect(systemPrompt.split('## Agenda').length - 1).toBe(1)
    expect(agendaSections(systemPrompt)[0]).toContain('- Confirm the org name')
  })

  it('a task run has none — it acts for the project, not for a person', async () => {
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildTaskPrompt({
      projectId: 'p1', boardName: 'B', columns: '- todo', taskId: 't1', title: 'T', description: 'D', roadmapPath: '/r',
    })
    // Anchored: the section IS there and says why, rather than being absent.
    expect(agendaSections(systemPrompt)).toHaveLength(1)
    expect(agendaSections(systemPrompt)[0]).toContain('no agenda to read or update')
    expect(systemPrompt).not.toContain('agenda.md')
    expect(systemPrompt).not.toContain('members/')
  })

  it('a preview names no concrete file — it has no location and no person', async () => {
    for (const build of ['buildChatSections', 'buildTaskSections'] as const) {
      const sections = await new AgentPromptBuilder(agent, content)[build]()
      const agendaSection = sections.find(s => s.key === 'agenda')!
      expect(agendaSection.content).toBeTruthy()
      expect(agendaSection.content).not.toMatch(/\/(projects|users)\//)
    }
  })

  it('a chat preview shows the placeholder path, and a task preview shows no agenda', async () => {
    const chat = (await new AgentPromptBuilder(agent, content).buildChatSections())
      .find(s => s.key === 'agenda')!.content
    expect(chat).toContain("<this person's own area in this location>/agenda.md")

    const task = (await new AgentPromptBuilder(agent, content).buildTaskSections())
      .find(s => s.key === 'agenda')!.content
    expect(task).toContain('no agenda to read or update')
  })
})

describe("the person's local time", () => {
  const person = { timezone: 'Australia/Sydney' }
  const now = new Date('2026-10-04T04:05:00Z')

  it('a chat prompt gives the timezone and the current local date and time, so "tomorrow at 9" is theirs', async () => {
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildChatPrompt({ person, now })
    expect(systemPrompt).toContain('## Local time')
    expect(systemPrompt).toContain('Australia/Sydney')
    expect(systemPrompt).toContain('Sunday 4 October 2026, 15:05')
  })

  it('a task prompt carries it too', async () => {
    const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildTaskPrompt({
      projectId: 'p1', boardName: 'B', columns: '- todo', taskId: 't1', title: 'T', description: 'D', roadmapPath: '/r', person, now,
    })
    expect(systemPrompt).toContain('Sunday 4 October 2026, 15:05')
  })

  it('says nothing when there is no person or they have no timezone', async () => {
    expect((await new AgentPromptBuilder(agent, content).buildChatPrompt({ now })).systemPrompt).not.toContain('## Local time')
    expect((await new AgentPromptBuilder(agent, content).buildChatPrompt({ person: null, now })).systemPrompt).not.toContain('## Local time')
  })
})

describe('a run on a branch\'s copy is told about its branch', () => {
  const codeWork = {
    workspace: { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' },
    copyId: '11111111-1111-4111-8111-111111111111', branch: 'add-login-page', main: 'main', behindMain: 2,
    otherBranches: [{ name: 'signup', whose: 'Ada · Sign-up', ahead: 3, agentWorking: 'Kernel' }],
    author: { name: 'Kernel', email: 'kernel@agents.hq.example' },
    onBehalfOf: null,
  }

  it('in a chat and in a task, and not otherwise', async () => {
    const chat = await new AgentPromptBuilder(agent, content).buildChatPrompt({ codeWork })
    const task = await new AgentPromptBuilder(agent, content).buildTaskPrompt({
      projectId: 'p1', boardName: 'Main', columns: 'todo', taskId: 't1', title: 'T', description: 'D', roadmapPath: '/r', codeWork,
    })
    for (const p of [chat.systemPrompt, task.systemPrompt]) {
      expect(p).toContain('`add-login-page`')
      expect(p).toContain('`signup`')
    }
    expect((await new AgentPromptBuilder(agent, content).buildChatPrompt({})).systemPrompt).not.toContain('# Your branch')
  })
})
