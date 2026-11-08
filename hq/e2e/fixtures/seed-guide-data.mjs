// Loads the user guide's sample organisation, Fernhill & Co, into hq's and the site's guide databases
// (ADR-0035's pattern). Run it under the database wrapper, which points both apps at their `_guide` databases:
//
//   node scripts/guide/with-guide-db.mjs node e2e/fixtures/seed-guide-data.mjs        (from hq/)
//
// It empties what an organisation owns (people, projects, agents, runs, chats, sites other than hq's own) and
// leaves what hq and the site create for themselves at boot: the organisation row, the default site and its
// pairing, the built-in agent, the library and the signing key. hq must have started once on the guide
// databases for those to exist. No agent runs and no model or key is needed: runs and chats are rows.
//
// The organisation is described in the user guide's spec; the names here are the ones every page and recipe uses.
// Nothing stored names the product. Dates are relative to the fixed capture date in e2e/guide/sample.json.

import { createRequire } from 'node:module'
import { builtInTaskTypes, rankBetween } from '@agenthix/core'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { assertGuideDatabase, assertGuideSecretsKey } from '../../scripts/guide/databaseUrls.mjs'
import { seedAgentInstructions } from './guide-sample-agents.mjs'
import { seedRuns } from './guide-sample-runs.mjs'
import { seedAccess } from './guide-sample-access.mjs'
import { seedP } from './guide-sample-p.mjs'
import { seedKnowledge } from './guide-sample-knowledge.mjs'
import { seedAutomation } from './guide-sample-automation.mjs'
import { seedModelsAndBilling } from './guide-sample-models.mjs'

const require = createRequire(import.meta.url)
const hqRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const siteRoot = resolve(hqRoot, '../site')
const sample = JSON.parse(readFileSync(resolve(hqRoot, 'e2e/guide/sample.json'), 'utf8'))

const hqUrl = process.env.GUIDE_HQ_DATABASE_URL
const siteUrl = process.env.GUIDE_SITE_DATABASE_URL
if (!hqUrl || !siteUrl) {
  console.error('[seed-guide-data] run this under scripts/guide/with-guide-db.mjs, which sets GUIDE_HQ_DATABASE_URL and GUIDE_SITE_DATABASE_URL.')
  process.exit(1)
}
try {
  assertGuideDatabase(hqUrl, 'hq')
  assertGuideDatabase(siteUrl, 'site')
  assertGuideSecretsKey(process.env)
} catch (err) {
  console.error(`[seed-guide-data] ${err.message}`)
  process.exit(1)
}

const { PrismaClient } = require('@prisma/client')
const { PrismaClient: SitePrismaClient } = require(resolve(siteRoot, 'node_modules/@prisma/client'))
const hq = new PrismaClient({ datasources: { db: { url: hqUrl } } })
const site = new SitePrismaClient({ datasources: { db: { url: siteUrl } } })

// Belt and braces: the server actually connected to, whatever the URL said.
for (const [client, label] of [[hq, 'hq'], [site, 'site']]) {
  const [{ name }] = await client.$queryRaw`SELECT current_database() AS name`
  if (!name.endsWith('_guide')) {
    console.error(`[seed-guide-data] refusing to run: connected to "${name}", which is not a guide database (${label}).`)
    process.exit(1)
  }
}

const NOW = new Date(sample.clock.now).getTime()
const ago = (minutes) => new Date(NOW - minutes * 60_000)
const ahead = (minutes) => new Date(NOW + minutes * 60_000)
const DAY = 24 * 60

const defaultSite = await hq.executionSite.findFirst({ where: { isDefault: true } })
if (!defaultSite) {
  console.error('[seed-guide-data] hq has no default site yet: start hq once on the guide databases (with HQ_PAIRING_SECRET set), then run this again.')
  process.exit(1)
}

// ── Empty what the organisation owns ─────────────────────────────────────────────────────────
// TRUNCATE ... CASCADE follows foreign keys *to* these tables, which covers Wasp's own auth tables (they
// reference User), boards, tasks and comments (Project), and notifications and pins (User).
await hq.$executeRawUnsafe(`TRUNCATE TABLE "User", "Project", "Product", "Program", "Team", "Invite", "PasswordReset",
  "RateLimit", "RecordedError", "LivePreview", "LiveApp", "HeldSiteInstruction",
  "WorkspacePlacement", "UserStoragePlacement", "UsageEntry", "BillingProfile", "GitHubApp", "GitHubInstallation", "MobileAuthToken"
  CASCADE`)
await hq.agent.deleteMany({ where: { isKernel: false } })
await hq.asset.deleteMany({ where: { publisher: { not: 'agenthix' } } })
await hq.executionSite.deleteMany({ where: { isDefault: false } })
await site.$executeRawUnsafe('TRUNCATE TABLE "AgentSession", "Workspace", "RepoAttachment" CASCADE')

// ── The organisation ───────────────────────────────────────────────────────────────────────────
// Setup makes the organisation, so a database that has not been through it has none.
if ((await hq.org.count()) === 0) await hq.org.create({ data: { name: 'Fernhill & Co' } })
await hq.org.updateMany({
  data: {
    name: 'Fernhill & Co',
    handle: 'fernhill',
    mission: 'Small studio making websites and reports for clients.',
    vision: 'Websites and reports that clients are glad to show to their own customers.',
    setupCompletedAt: ago(30 * DAY),
  },
})
await hq.siteConfig.updateMany({ data: { bootstrapRequired: false } })

// ── People ─────────────────────────────────────────────────────────────────────────────────────
const { hashPassword } = await import(resolve(hqRoot, '.wasp/out/sdk/wasp/dist/auth/password.js')).catch(() => {
  console.error('[seed-guide-data] hq has not been compiled: run `npx wasp compile` in hq/ first.')
  process.exit(1)
})
const providerData = JSON.stringify({ hashedPassword: await hashPassword(sample.password) })
const people = {}
for (const [key, p] of Object.entries(sample.people)) {
  const user = await hq.user.create({
    data: {
      displayName: p.displayName,
      // Sam, the administrator the guide is written for, is also a fleet admin, as the person who installed HQ is
      // (src/fleet/fleetAdminRole.ts): Logs and diagnostics shows its health and support bundle to fleet admins only.
      ...(key === 'sam' ? { fleetAdmin: true, fleetAdminSince: ago(30 * DAY) } : {}),
      // The sample's people have used HQ for weeks and put the pledge card away long ago; the guide's Home shows their work.
      pledgeDismissedAt: ago(DAY),
      auth: { create: { identities: { create: { providerName: 'username', providerUserId: p.username, providerData } } } },
    },
  })
  await hq.userSettings.create({
    data: { userId: user.id, role: p.role, config: {}, timezone: sample.clock.timezone, timezoneChosen: true },
  })
  await hq.userStoragePlacement.create({ data: { userId: user.id, siteId: defaultSite.id } })
  people[key] = user
}
const { sam, priya, alex, jordan, kai } = people

const teams = {
  studio: await hq.team.create({
    data: {
      name: 'Studio', purpose: 'Design and writing for client work.', createdBy: sam.id,
      people: { create: [priya, alex, jordan].map((u) => ({ userId: u.id })) },
    },
  }),
  operations: await hq.team.create({
    data: {
      name: 'Operations', purpose: 'Planning, reporting and keeping the studio running.', createdBy: sam.id,
      people: { create: [sam, jordan].map((u) => ({ userId: u.id })) },
    },
  }),
}

// ── Agents ─────────────────────────────────────────────────────────────────────────────────────
const kernel = await hq.agent.findFirst({ where: { isKernel: true } })
const agents = { kernel }
for (const [key, name, role] of [
  ['researcher', 'Researcher', 'Finds sources and summarises what they say'],
  ['writer', 'Writer', 'Drafts and edits copy and reports'],
  ['reviewer', 'Reviewer', 'Checks work before it goes out'],
]) {
  agents[key] = await hq.agent.create({ data: { name, handle: key, role } })
}
await seedAgentInstructions({ hq, hqRoot, agents })
await hq.teamAgent.create({ data: { teamId: teams.studio.id, agentId: agents.writer.id } })
await hq.teamAgent.create({ data: { teamId: teams.operations.id, agentId: agents.reviewer.id } })

// ── Projects, task types and tasks ─────────────────────────────────────────────────────────────
// A task is on no board (adr-0176): it is in one of its type's columns. The Launch plan is a saved board of the
// website's own Launch step type, whose columns include In review.
const STATE_OF = { Backlog: 'BACKLOG', 'To do': 'TODO', 'In progress': 'IN_PROGRESS', 'In review': 'IN_PROGRESS', Done: 'DONE' }

const projects = {}
async function createProject(key, name, description, lead, defaultAgent, members, extra = {}) {
  projects[key] = await hq.project.create({
    data: {
      key, name, slug: name.toLowerCase().replaceAll(' ', '-'), description,
      executionSiteId: defaultSite.id, leadUserId: lead.id, defaultAgentId: defaultAgent.id,
      members: { create: members },
      createdAt: ago(60 * DAY), ...extra,
    },
  })
}
await createProject('WEB', 'Website relaunch', 'Rebuild the Fernhill & Co website: new pages, a case-study section and faster loading.',
  priya, agents.writer, [
    { userId: sam.id, role: 'ADMIN' },
    { userId: kai.id, role: 'VIEWER' },
    ...[priya, alex, jordan].map((u) => ({ userId: u.id, role: 'MEMBER', direct: false })),
  ])
await createProject('RES', 'Customer research', 'Interviews and survey results from clients, summarised for the studio.',
  alex, agents.researcher, [
    { userId: sam.id, role: 'ADMIN' }, { userId: priya.id, role: 'ADMIN' }, { userId: alex.id, role: 'MEMBER' },
  ])
await createProject('QTR', 'Quarterly report', 'The quarterly report for clients: figures, charts and a short written summary.',
  jordan, agents.writer, [
    { userId: kai.id, role: 'VIEWER' },
    ...[sam, jordan].map((u) => ({ userId: u.id, role: 'ADMIN', direct: false })),
  ])
// Sam's own project, which only Sam sees: no slug, Sam its one member, and billed to the default profile (none named).
await createProject('TAX', 'Tax return 2026', 'Receipts, forms and figures for this year\'s tax return.',
  sam, agents.kernel, [{ userId: sam.id, role: 'ADMIN' }],
  { accessLevel: 'PRIVATE', personalOwnerId: sam.id, slug: null, createdAt: ago(9 * DAY) })
await hq.projectTeam.createMany({
  data: [
    { projectId: projects.WEB.id, teamId: teams.studio.id, role: 'MEMBER', addedById: sam.id },
    { projectId: projects.QTR.id, teamId: teams.operations.id, role: 'ADMIN', addedById: sam.id },
  ],
})
await hq.projectAgent.createMany({
  data: [
    { projectId: projects.WEB.id, agentId: agents.writer.id }, { projectId: projects.WEB.id, agentId: agents.reviewer.id },
    { projectId: projects.RES.id, agentId: agents.researcher.id },
    { projectId: projects.QTR.id, agentId: agents.writer.id }, { projectId: projects.QTR.id, agentId: agents.reviewer.id },
  ],
})
await hq.pin.createMany({
  data: [
    { userId: sam.id, kind: 'PROJECT', itemId: projects.WEB.id, position: 0 },
    { userId: sam.id, kind: 'PROJECT', itemId: projects.QTR.id, position: 1 },
  ],
})

const milestone = await hq.milestone.create({
  data: { projectId: projects.WEB.id, name: 'Go live', date: new Date(NOW + 21 * DAY * 60_000) },
})

// A project's built-in Task and Epic types, with their columns, as hq makes them with a project; an epic is a task of
// the Epic type. Each type's columns by name, with the id and state of each.
async function makeType(projectId, t, order) {
  const made = await hq.taskType.create({
    data: {
      projectId, name: t.name, icon: t.icon, kind: t.kind, order,
      columns: { create: t.columns.map((c, i) => ({ name: c.name, colour: c.colour, state: c.state, defaultForState: c.defaultForState, order: i })) },
    },
    include: { columns: true },
  })
  return { id: made.id, columns: Object.fromEntries(made.columns.map((c) => [c.name, c])) }
}
async function builtInTypes(projectId) {
  const types = {}
  for (const [order, t] of builtInTaskTypes().entries()) types[t.kind] = await makeType(projectId, t, order)
  return types
}

// One row per task: [project, number, title, description, type, column, agent, priority, person, extra]; the
// column by its name, Backlog when null. Each is ranked after the last, in the order made.
const tasks = {}
let order = 0
let rank = null
async function task(projectKey, number, title, description, type, column, agent, priority, person, extra = {}) {
  const placed = type.columns[column ?? 'Backlog']
  rank = rankBetween(rank, null)
  const created = await hq.task.create({
    data: {
      projectId: projects[projectKey].id, number, title, description, typeId: type.id, columnId: placed.id, state: placed.state, rank,
      assignedAgentId: agent?.id ?? null, priority, onBehalfOfUserId: person.id,
      doneAt: placed.state === 'DONE' ? ago(5 * DAY - order * 60) : null,
      createdAt: ago(20 * DAY - order * 90), ...extra,
    },
  })
  order += 1
  tasks[`${projectKey}-${number}`] = created
  return created
}

const web = projects.WEB
const webTypes = await builtInTypes(web.id)
const launch = await makeType(web.id, {
  name: 'Launch step', icon: 'task', kind: 'CUSTOM',
  columns: Object.entries(STATE_OF).map(([name, state]) => ({ name, colour: 'neutral', state, defaultForState: name !== 'In review' })),
}, 2)
await hq.board.create({ data: { name: 'Launch plan', projectId: web.id, view: 'TYPE', typeId: launch.id } })
const epic = await task('WEB', 8, 'Launch the new website', 'Everything that has to be ready before the new site goes live.', webTypes.EPIC, null, null, 'HIGH', priya, {
  planStart: ago(20 * DAY), planFinish: ahead(21 * DAY), milestoneId: milestone.id,
})
const inEpic = { epicId: epic.id }
await task('WEB', 1, 'Plan the site map', 'List every page the new site needs and how they link together.', launch, 'Done', agents.writer, 'MEDIUM', priya, { ...inEpic, planStart: ago(20 * DAY), planFinish: ago(12 * DAY) })
await task('WEB', 2, 'Write the home page copy', 'A short introduction, three things the studio does, and a way to get in touch.', launch, 'In progress', agents.writer, 'HIGH', sam, { ...inEpic, planStart: ago(6 * DAY), planFinish: ahead(3 * DAY), runState: 'RUN_BLOCKED', labels: ['copy'] })
await task('WEB', 3, 'Check links and spelling on the new pages', 'Read each new page, follow every link and list anything broken.', launch, 'In review', agents.reviewer, 'MEDIUM', sam, { ...inEpic, planStart: ago(3 * DAY), planFinish: ahead(5 * DAY), labels: ['quality'] })
await task('WEB', 4, 'Draft the case-study page', 'One page for each of the three best projects from the last year.', launch, 'To do', agents.writer, 'MEDIUM', priya, { ...inEpic, planStart: ahead(2 * DAY), planFinish: ahead(10 * DAY), labels: ['copy'] })
await task('WEB', 5, 'Choose photos for the team page', 'Pick one photo of each person and check they are happy with it.', launch, 'To do', null, 'LOW', alex, { ...inEpic, planStart: ahead(4 * DAY), planFinish: ahead(8 * DAY) })
await task('WEB', 6, 'Set up redirects from the old addresses', 'Old links should land on the matching new page.', launch, null, null, 'LOW', jordan)
await task('WEB', 7, 'Find out why two pages load slowly', 'The home page and the case studies take over four seconds on a phone.', launch, 'In progress', agents.reviewer, 'HIGH', sam, { ...inEpic, planStart: ago(2 * DAY), planFinish: ahead(4 * DAY), runState: 'RUN_FAILED', runStateReason: 'The build command failed: npm run build ended with an error in the image step.', labels: ['speed'] })

const res = (await builtInTypes(projects.RES.id)).TASK
await task('RES', 1, 'Interview three long-standing clients', 'Thirty minutes each, about what they value and what slows them down.', res, 'Done', null, 'HIGH', alex)
await task('RES', 2, 'Summarise the interview notes', 'One page per interview, then a page of what they have in common.', res, 'In progress', agents.researcher, 'MEDIUM', alex)
await task('RES', 3, 'Write the survey questions', 'Ten questions that take five minutes to answer.', res, 'To do', null, 'MEDIUM', priya)
await task('RES', 4, 'Compare the findings with last year', 'What changed, and what stayed the same.', res, 'To do', agents.researcher, 'LOW', alex)
await task('RES', 5, 'Share the findings with the studio', null, res, null, null, 'LOW', alex)

const qtr = (await builtInTypes(projects.QTR.id)).TASK
await builtInTypes(projects.TAX.id)
await task('QTR', 1, 'Collect this quarter\'s figures', 'Projects finished, hours billed and how long each took.', qtr, 'Done', agents.researcher, 'MEDIUM', jordan)
await task('QTR', 2, 'Draft the written summary', 'Half a page on the quarter, in plain words.', qtr, 'In progress', agents.writer, 'HIGH', sam)
await task('QTR', 3, 'Review the draft for clarity', null, qtr, 'To do', agents.reviewer, 'MEDIUM', jordan)
await task('QTR', 4, 'Make the charts for the report', 'Three charts: projects finished, hours billed, time to finish.', qtr, 'To do', null, 'MEDIUM', sam)

// ── Comments and an attachment ────────────────────────────────────────────────────────────────
await hq.taskComment.createMany({
  data: [
    { taskId: tasks['WEB-1'].id, authorType: 'AGENT', agentId: agents.writer.id, content: 'The site map is ready: eight pages, with the case studies grouped under Work.', createdAt: ago(12 * DAY) },
    { taskId: tasks['WEB-1'].id, authorType: 'USER', userId: priya.id, content: 'Thanks. I would move Contact to the top bar.', createdAt: ago(12 * DAY - 40) },
    { taskId: tasks['WEB-2'].id, authorType: 'USER', userId: priya.id, content: 'Keep it short: people read the first screen and little else.', createdAt: ago(5 * DAY) },
    { taskId: tasks['WEB-3'].id, authorType: 'AGENT', agentId: agents.reviewer.id, content: 'Two links on the About page go to the old address. Everything else passes.', createdAt: ago(2 * DAY) },
    { taskId: tasks['WEB-7'].id, authorType: 'USER', userId: jordan.id, content: 'I think the photos are too large. Can you check the image step first?', createdAt: ago(1 * DAY) },
    { taskId: tasks['RES-2'].id, authorType: 'USER', userId: alex.id, content: 'The second interview ran long, so its notes are the fullest.', createdAt: ago(3 * DAY) },
  ],
})
await hq.taskAttachment.create({
  data: { taskId: tasks['WEB-1'].id, uuid: '0b7a3f55-6f0e-4b52-9f43-1f2d5b8f6c11', fileName: 'site-map.pdf', mimeType: 'application/pdf', fileSizeBytes: 184_320, createdAt: ago(13 * DAY) },
})

// ── Automation, routines and the organisation's schedule setting ─────────────────────────────
await seedAutomation({ hq, ago, ahead, NOW, DAY, sample, people, agents, projects, tasks, types: { qtr }, nextRank: () => (rank = rankBetween(rank, null)) })

// ── Runs, approvals, chats and notifications (the site's rows, hq's session rows) ────────────────
await seedRuns({ hq, site, ago, people, agents, projects, tasks, defaultSite, hqRoot })

// ── An invitation waiting to be accepted, and the providers, default models, billing profiles and usage ──
await seedAccess({ hq, ago, people, projects, hqRoot, sample })
await seedModelsAndBilling({ hq, hqRoot, sample, people, agents, projects, defaultSite })

// ── Workspaces for the project pages ─────────────────────────────────────────────────────────
await seedP({ hq, site, ago, projects })
await seedKnowledge({ projects, hqRoot })

console.log(`[seed-guide-data] loaded Fernhill & Co: ${Object.keys(people).length} people, ${Object.keys(projects).length} projects, ${Object.keys(tasks).length} tasks.`)
await hq.$disconnect()
await site.$disconnect()
