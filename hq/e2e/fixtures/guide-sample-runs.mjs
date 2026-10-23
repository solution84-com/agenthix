// The sample organisation's runs, approvals, conversations and notifications: rows only, so no agent runs. A run
// is the site's row (its database) and a session is both: hq's row names who and where, the site's copy holds the
// transcript and the runs under the same id. A conversation is hq's alone, its messages sealed with hq's key as hq
// seals them. Loaded by seed-guide-data.mjs.

import { randomUUID } from 'node:crypto'
import { encryptSecret, hqMasterKey } from './guide-sample-access.mjs'

const MODEL = 'claude-sonnet-4-6'
const DAY = 24 * 60

const audit = (safe, low = 0) => ({
  totalCalls: safe + low, blocked: 0, bySeverity: { SAFE: safe, LOW: low, MEDIUM: 0, HIGH: 0, FLAGGED: 0 }, flagged: [],
})

export async function seedRuns({ hq, site, ago, people, agents, projects, tasks, defaultSite, hqRoot }) {
  const { sam } = people

  // hq's session row and the site's copy of it, with the same id and key.
  async function session({ agent, person, title, type, task, ownerType, ownerId, createdAt }) {
    const row = await hq.agentSession.create({
      data: {
        agentId: agent.id, userId: person.id, title, sessionType: type, taskId: task?.id ?? null, model: MODEL,
        primaryOwnerType: ownerType, primaryOwnerId: ownerId, createdAt, updatedAt: createdAt,
      },
    })
    await site.agentSession.create({
      data: {
        id: row.id, sessionKey: row.sessionKey, agentId: agent.id, userId: person.id, title, sessionType: type,
        taskId: task?.id ?? null, model: MODEL, primaryOwnerType: ownerType, primaryOwnerId: ownerId, createdAt, updatedAt: createdAt,
      },
    })
    return row
  }

  // One run with its opening message, one tool call and its reply, and how it ended.
  async function run({ sessionRow, agent, person, task, minutesAgo, input, output, tool, end }) {
    const id = randomUUID()
    const startedAt = ago(minutesAgo)
    const endedAt = new Date(startedAt.getTime() + 95_000)
    const toolUseId = `toolu_${id.slice(0, 8)}`
    await site.agentRun.create({
      data: {
        id, agentId: agent.id, sessionId: sessionRow.id, taskId: task?.id ?? null, rootRunId: id, model: MODEL,
        inputText: input, createdAt: startedAt, startedAt, endedAt, status: end.status ?? 'COMPLETED',
        outputText: end.status === 'FAILED' ? null : output ?? null, error: end.error ?? null,
        usage: { inputTokens: 18_400, outputTokens: 2_100, totalTokens: 20_500 }, auditSummary: audit(tool ? 1 : 0),
        ...(end.manifest ?? {}),
      },
    })
    const entry = (offsetSeconds, data) => ({
      sessionId: sessionRow.id, runId: id, createdAt: new Date(startedAt.getTime() + offsetSeconds * 1000), ...data,
    })
    const entries = [entry(0, { role: 'USER', authorId: person.id, content: input })]
    if (tool) {
      entries.push(entry(20, { role: 'TOOL', content: '', toolName: tool.name, toolInput: tool.input, toolOutput: tool.output, toolUseId }))
      await site.toolCallLog.create({
        data: { runId: id, toolName: tool.name, toolInput: tool.input, toolUseId, riskLevel: 'SAFE', createdAt: new Date(startedAt.getTime() + 20_000) },
      })
    }
    if (end.kind) entries.push(entry(90, { role: 'SYSTEM', content: '', kind: end.kind, detail: end.detail }))
    else entries.push(entry(90, { role: 'ASSISTANT', content: output, model: MODEL }))
    await site.transcriptEntry.createMany({ data: entries })
    return id
  }

  async function taskRun(key, agent, minutesAgo, spec, taskPatch = {}) {
    const task = tasks[key]
    const person = people[Object.keys(people).find((k) => people[k].id === task.onBehalfOfUserId)]
    const sessionRow = await session({
      agent, person, title: task.title, type: 'task', task, ownerType: 'project', ownerId: task.projectId, createdAt: ago(minutesAgo),
    })
    const runId = await run({ sessionRow, agent, person, task, minutesAgo, ...spec })
    await hq.task.update({
      where: { id: task.id },
      data: {
        runId, runStartedBy: 'person', queuedByUserId: person.id, runOnBehalfOfUserId: person.id,
        lastWorkedAt: ago(minutesAgo), ...taskPatch,
      },
    })
    return runId
  }

  const { writer, reviewer, researcher, kernel } = agents

  // ── Finished runs ────────────────────────────────────────────────────────────────────────
  await taskRun('WEB-1', writer, 12 * DAY, {
    input: 'Plan the site map: list every page the new site needs and how they link together.',
    tool: { name: 'Read', input: { file_path: 'notes/old-site-pages.md' }, output: 'Home, About, Services, Portfolio, Contact, Blog (unused), Privacy, Terms' },
    output: 'The site map is ready: eight pages. Work groups the three case studies, and Contact is in the top bar.',
    end: {},
  })
  await taskRun('WEB-3', reviewer, 2 * DAY, {
    input: 'Check links and spelling on the new pages. Read each one, follow every link and list anything broken.',
    tool: { name: 'WebFetch', input: { url: 'https://staging.example.test/about' }, output: '200 OK, 2 links point to the old address' },
    output: 'Two links on the About page still go to the old address. Everything else passes.',
    end: {},
  }, { runState: 'RUN_NONE' })
  await taskRun('RES-2', researcher, 3 * DAY, {
    input: 'Summarise the interview notes: one page per interview, then a page of what they have in common.',
    tool: { name: 'Read', input: { file_path: 'interviews/second-client.md' }, output: '2,300 words of notes' },
    output: 'Three summaries are written. All three clients mention delivery dates as the thing they trust us on.',
    end: {},
  })
  await taskRun('QTR-1', researcher, 8 * DAY, {
    input: 'Collect this quarter\'s figures: projects finished, hours billed and how long each took.',
    tool: { name: 'Read', input: { file_path: 'figures/q3.csv' }, output: '31 rows' },
    output: 'The figures are in figures/q3-summary.md: 14 projects finished, 612 hours billed.',
    end: {},
  })
  await taskRun('QTR-2', writer, 1 * DAY, {
    input: 'Draft the written summary: half a page on the quarter, in plain words.',
    tool: { name: 'Read', input: { file_path: 'figures/q3-summary.md' }, output: '14 projects finished, 612 hours billed' },
    output: 'The draft is in report/summary.md. It opens with the number of projects finished and ends with next quarter\'s plan.',
    end: {},
  })
  await taskRun('QTR-5', writer, 7 * DAY - 90, {
    input: 'Weekly status summary: summarise what moved on this project in the last week and what is waiting.',
    output: 'Last week the figures were collected and the summary draft was started. Waiting: the charts.',
    end: {},
  }, { runStartedBy: 'schedule' })

  // ── One run that failed, with its reason ───────────────────────────────────────────────────
  await taskRun('WEB-7', reviewer, 1 * DAY, {
    input: 'Find out why the home page and the case studies load slowly.',
    tool: { name: 'Bash', input: { command: 'npm run build' }, output: 'error: image step failed' },
    end: {
      status: 'FAILED', error: 'The build command failed: npm run build ended with an error in the image step.',
      kind: 'RUN_FAILED', detail: { reason: 'The build command failed in the image step.' },
    },
  })

  // ── One run waiting on a person's approval ──────────────────────────────────────────────────
  await taskRun('WEB-2', writer, 40, {
    input: 'Write the home page copy: a short introduction, three things the studio does, and a way to get in touch.',
    end: {
      kind: 'APPROVAL_REQUESTED',
      manifest: {
        manifestStatus: 'PENDING_APPROVAL',
        pendingManifest: {
          tools: [{ name: 'WebFetch', reason: 'To read the three competitor pages linked in the task.' }],
          bashPatterns: [{ pattern: 'npm run build', reason: 'To check the page builds before handing it back.' }],
        },
      },
    },
  })

  // ── Sam's past conversations in Chat ───────────────────────────────────────────────────────────
  const conversations = [
    [kernel, 'Plan a first week for the new website', 2 * DAY + 60,
      'Help me plan the first week after the new website goes live.',
      'A good first week has three parts: watch for broken links each morning, ask two clients to try the contact form, and keep the old site up for redirects. Want me to add these as tasks on Website relaunch?'],
    [writer, 'Rewrite the About page introduction', 4 * DAY,
      'Rewrite the About page introduction so it reads less like a list of services.',
      'Here is a shorter version: "Fernhill & Co is a small studio that makes websites and reports. We work with a handful of clients at a time, so you always talk to the people doing the work."'],
    [researcher, 'What do clients say about delivery dates?', 6 * DAY,
      'What did the three interviews say about delivery dates?',
      'All three clients said they trust us on dates. One asked for a mid-project check-in; another asked to be told early when a date will slip.'],
  ]
  // …and one in the Website relaunch project, about its Launch plan board.
  conversations.push([writer, 'What\'s on the Launch plan board?', 3 * 60,
    'What is on the Launch plan board right now?',
    'Plan the site map is Done. In progress are Write the home page copy, which is waiting on your approval, and Find out why two pages load slowly, which stopped on a build error. Check links and spelling on the new pages is In review, and Draft the case-study page and Choose photos for the team page are still in To do.',
    'project'])
  const masterKey = hqMasterKey(hqRoot)
  const sealed = (text) => encryptSecret(JSON.stringify({ text }), masterKey)
  for (const [agent, title, minutesAgo, ask, answer, where] of conversations) {
    const inProject = where === 'project'
    const askedAt = ago(minutesAgo)
    const answeredAt = new Date(askedAt.getTime() + 40_000)
    // A person's message with no turn is one HQ's recovery sweep answers, which would reach the model vendor.
    const turnId = randomUUID()
    await hq.conversation.create({
      data: {
        home: inProject ? 'PROJECT' : 'PERSON', projectId: inProject ? projects.WEB.id : null,
        openedById: sam.id, agentId: agent.id, title, lastSeq: 2, lastMessageAt: answeredAt, createdAt: askedAt,
        messages: {
          create: [
            { seq: 1, role: 'PERSON', kind: 'TEXT', authorId: sam.id, turnId, body: sealed(ask), createdAt: askedAt },
            { seq: 2, role: 'AGENT', kind: 'TEXT', agentId: agent.id, turnId, body: sealed(answer), createdAt: answeredAt },
          ],
        },
      },
    })
  }

  // ── Notifications for Sam ───────────────────────────────────────────────────────────────────────
  await hq.notification.createMany({
    data: [
      {
        userId: sam.id, type: 'tool_approval', title: 'Writer wants approval on WEB-2',
        body: 'Writer asks to fetch three pages and run a build while writing the home page copy.',
        actionLabel: 'Review request', actionUrl: '/tasks/WEB-2', createdAt: ago(38),
      },
      {
        userId: sam.id, type: 'task_waiting', title: 'WEB-7 stopped',
        body: 'The build command failed: npm run build ended with an error in the image step.',
        actionLabel: 'Open task', actionUrl: '/tasks/WEB-7', createdAt: ago(1 * DAY),
      },
    ],
  })
}
