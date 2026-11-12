// The demo's scripted runs across hq and the site (ADR-0186): both apps started with `DEMO_MODE=true` and the repository's
// `demo/` as the demo's data, on empty databases, so both seed themselves. A visitor enters through the demo's own
// route as a viewer of the sample, which the product keeps them from changing; asked in their own space, Writer makes
// a task there whose run goes through the scripted runtime on the site, with no container, and what it said and wrote
// is read back through hq; a message to an agent gets the agent's scripted reply, with no model called.
//
// Runs last: it restarts both apps in demo mode on emptied databases, then puts the ordinary pair back.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hqDb, seedBase, siteDb, truncateAll } from './harness/db'
import { HQ_URL, REPO_ROOT, SITE_ROOT_DIR } from './harness/env'
import { closeAllSockets, op, until } from './harness/hqApi'
import { startHq, startSite, stopHq, stopSite, waitForHq, waitForSite } from './harness/apps'

const DEMO_ENV = { DEMO_MODE: 'true', DEMO_DATA_DIR: join(REPO_ROOT, 'demo') }
const PAIRING_SECRET = 'de300000'.repeat(8)
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

// The seed's own ids (demo/seed/organisation.json): the task WEB-4, and the agent Writer.
const WEB_4_TASK_ID = 'ff1f6a9f-c6f2-5823-ab9b-6ef8890dd82d'
const WRITER_AGENT_ID = '220e72dc-3c95-5898-a6ab-45fd52293a4b'

// A task in the visitor's own space plays Writer's default run (demo/runs/writer/general.json).
type RunScript = { files: { path: string; content: string }[]; end: { status: string } }
const runScript = JSON.parse(readFileSync(join(REPO_ROOT, 'demo/runs/writer/general.json'), 'utf8')) as RunScript
const scriptedFile = runScript.files[0]
const OWN_SPACE_TASK = 'Draft the Harbour Bakery case study'

let visitor: string
let visitorId: string
let projectId: string
let sessionId: string
let ownTaskId: string

async function enter(): Promise<string> {
  const res = await fetch(`${HQ_URL}/api/demo/enter`, { method: 'POST' })
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()).sessionId
}

beforeAll(async () => {
  await Promise.all([stopHq(), stopSite()])
  // Empty both, so each app finds nothing and seeds itself at start.
  await truncateAll()
  await startHq({ pairingSecret: PAIRING_SECRET, env: DEMO_ENV })
  await waitForHq()
  await startSite({ pairingSecret: PAIRING_SECRET, hqUrl: HQ_URL, env: DEMO_ENV })
  await waitForSite()
  await until(
    async () => hqDb.executionSite.findFirst({ where: { isDefault: true, status: 'ONLINE' } }),
    'hq to pair its own default site in demo mode',
    180_000,
  )
  visitor = await enter()
  visitorId = (await hqDb.session.findUniqueOrThrow({ where: { id: visitor }, include: { auth: true } })).auth.userId!
}, 600_000)

afterAll(async () => {
  closeAllSockets()
  // The ordinary pair again, as the other suites leave it: not in demo mode, on the base fixtures.
  await Promise.all([stopHq(), stopSite()])
  await truncateAll()
  await seedBase()
  await startHq()
  await waitForHq()
  await startSite()
  await waitForSite()
}, 600_000)

describe('both apps start in demo mode and seed themselves @SC-1980', () => {
  it("hq holds the sample organisation's people, projects and tasks", async () => {
    expect(await hqDb.task.count()).toBeGreaterThan(10)
    const task = await hqDb.task.findUnique({ where: { id: WEB_4_TASK_ID }, select: { title: true, projectId: true } })
    expect(task?.title).toBe('Draft the case-study page')
    projectId = task!.projectId
    const project = await hqDb.project.findUnique({ where: { id: projectId }, select: { name: true } })
    expect(project?.name).toBe('Website relaunch')
    expect(await hqDb.agent.findUnique({ where: { id: WRITER_AGENT_ID }, select: { handle: true } })).toEqual({ handle: 'writer' })
    // The seed's people cannot sign in, and the visitor just made is the only one who can.
    expect(await hqDb.user.count()).toBeGreaterThanOrEqual(6)
  })

  it('the site holds the sample sessions and its runs', async () => {
    expect(await siteDb.agentSession.count()).toBeGreaterThan(0)
    expect(await siteDb.agentRun.count()).toBeGreaterThan(0)
  })

  it('a visitor entered as a member, a viewer of the sample, which they cannot change', async () => {
    const res = await op(HQ_URL, 'get-demo-info', {}, visitor)
    expect(res.status, JSON.stringify(res.json)).toBe(200)
    expect(res.json.on).toBe(true)
    expect(await hqDb.userSettings.findFirst({ where: { userId: visitorId }, select: { role: true } })).toEqual({ role: 'MEMBER' })
    const before = await hqDb.task.findUniqueOrThrow({ where: { id: WEB_4_TASK_ID }, select: { runState: true, runCount: true } })
    const run = await op(HQ_URL, 'run-task', { taskId: WEB_4_TASK_ID }, visitor)
    expect(run.status, JSON.stringify(run.json)).toBe(403)
    expect(await hqDb.task.findUnique({ where: { id: WEB_4_TASK_ID }, select: { runState: true, runCount: true } })).toEqual(before)
  })
})

describe("a task's run goes through the scripted runtime to the script's end @SC-337 @SC-1989", () => {
  it(
    "Writer, asked in the visitor's own space, makes a task there whose run ends as its script says, with no container",
    async () => {
      const started = await op(
        HQ_URL,
        'start-conversation',
        { home: 'PERSON', agentId: WRITER_AGENT_ID, text: 'Draft a case study for me', clientMessageId: 'demo-run-own-space' },
        visitor,
      )
      expect(started.status, JSON.stringify(started.json)).toBe(200)

      const made = await until(
        async () => hqDb.task.findFirst({
          where: { title: OWN_SPACE_TASK, project: { personalOwnerId: visitorId, personalSpace: true } },
          select: { id: true },
        }),
        "the task Writer makes in the visitor's own space",
        90_000,
      )
      ownTaskId = made.id
      const session = await until(
        async () => hqDb.agentSession.findUnique({ where: { taskId: made.id } }),
        "hq's session of the task, made when its run was dispatched",
        60_000,
      )
      sessionId = session.id

      // The run is on the site, and passes through RUNNING on its way to the end the script gives it.
      const seen = new Set<string>()
      const finished = await until(
        async () => {
          const row = await siteDb.agentRun.findFirst({ where: { sessionId }, orderBy: { createdAt: 'desc' } })
          if (row) seen.add(row.status)
          return row && TERMINAL.has(row.status) ? row : null
        },
        'the scripted run to reach its end on the site',
        180_000,
      )
      expect(seen.has('RUNNING')).toBe(true)
      expect(finished.status).toBe(runScript.end.status.toUpperCase())

      // No container: a run that had started one would carry its name, and the demo site has no Docker to start it.
      expect(JSON.stringify(finished.metadata ?? {})).not.toMatch(/container/i)

      // hq's task state follows the run's end.
      const task = await until(
        async () => {
          const t = await hqDb.task.findUnique({ where: { id: made.id }, select: { runState: true } })
          return t && t.runState !== 'RUN_QUEUED' && t.runState !== 'RUN_ACTIVE' ? t : null
        },
        "the task's run state to settle after the run ended",
        60_000,
      )
      expect(task.runState).not.toBe('RUN_FAILED')

      // The transcript, read through hq: what the script said.
      const read = await op(HQ_URL, 'get-activity-session', { sessionId }, visitor)
      expect(read.status, JSON.stringify(read.json)).toBe(200)
      const transcript = JSON.stringify(read.json.entries)
      expect(transcript).toContain('the morning hour going to ten minutes')
    },
    300_000,
  )

  it("wrote the script's file in the visitor's own storage, in the task's folder @SC-1986", async () => {
    // Your space works in the person's own storage. hq opens no working files for a task there (the task page shows
    // none), so the file is read on the site's disk.
    const written = join(SITE_ROOT_DIR, 'users', visitorId, 'tasks', ownTaskId, scriptedFile.path)
    expect(readFileSync(written, 'utf8')).toBe(scriptedFile.content)
  })
})

// A turn needs no browser: the message goes in over hq's own operation, the turn runs in hq, and the reply is read back.
describe("a message to an agent gets the agent's scripted reply @SC-1980", () => {
  it('answers "What can you do?" as Writer, from the script, with no model called', async () => {
    const choices = await op(HQ_URL, 'get-conversation-agent-choices', { home: 'PERSON' }, visitor)
    expect(choices.status, JSON.stringify(choices.json)).toBe(200)
    expect((choices.json as { id: string }[]).some(a => a.id === WRITER_AGENT_ID)).toBe(true)

    const started = await op(
      HQ_URL,
      'start-conversation',
      { home: 'PERSON', agentId: WRITER_AGENT_ID, text: 'What can you do?', clientMessageId: 'demo-run-turn-1' },
      visitor,
    )
    expect(started.status, JSON.stringify(started.json)).toBe(200)
    const conversationId: string = started.json.conversationId

    const reply = await until(
      async () => {
        const res = await op(HQ_URL, 'get-conversation-messages', { conversationId }, visitor)
        if (res.status !== 200) return null
        const { messages } = res.json as { messages: { role: string; kind: string; body: { text?: string } }[] }
        return messages.find(m => m.role === 'AGENT' && m.kind === 'TEXT') ?? null
      },
      "the agent's scripted reply to the message",
      90_000,
    )
    expect(reply.body.text).toContain("I'm Writer")
  })
})
