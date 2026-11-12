/**
 * Loading the seed data set. hq and the site each read `seed/` once at start in demo mode, through a reader the caller
 * gives (node's `fs` on a server), and refuse to start on a problem: a seed that points at a person, a project or a
 * task that is not there would otherwise fail halfway through writing the database.
 */
import { PLACE_SKILLS_ROOT } from '../protocol/locationSkills.js'
import type { DemoFolderReader } from './load.js'
import type { DemoSeed, SeedActivity, SeedLibrary, SeedOrganisation, SeedSite } from './seed.js'

export type DemoSeedProblem = { at: string; message: string }

export class DemoSeedError extends Error {
  constructor(readonly problems: DemoSeedProblem[]) {
    super(`The demo seed data has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n` +
      problems.map(p => `  ${p.at}: ${p.message}`).join('\n'))
  }
}

export const DEMO_SEED_FILES = ['organisation', 'activity', 'library', 'site'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export async function readDemoSeed(root: string, reader: DemoFolderReader): Promise<Record<(typeof DEMO_SEED_FILES)[number], string>> {
  const texts = {} as Record<(typeof DEMO_SEED_FILES)[number], string>
  for (const name of DEMO_SEED_FILES) texts[name] = await reader.read(`${root}/seed/${name}.json`)
  return texts
}

export async function loadDemoSeed(root: string, reader: DemoFolderReader): Promise<DemoSeed> {
  return parseDemoSeed(await readDemoSeed(root, reader))
}

type Place = { project: string }

/** Checks the four files and how they fit together; throws `DemoSeedError` with every problem found. */
export function parseDemoSeed(texts: Record<(typeof DEMO_SEED_FILES)[number], string>): DemoSeed {
  const problems: DemoSeedProblem[] = []
  const add = (at: string, message: string) => problems.push({ at, message })
  const parsed: Partial<Record<string, unknown>> = {}
  for (const name of DEMO_SEED_FILES) {
    try { parsed[name] = JSON.parse(texts[name]) } catch { add(`seed/${name}.json`, 'Not valid JSON.') }
  }
  if (problems.length) throw new DemoSeedError(problems)

  const organisation = parsed.organisation as SeedOrganisation
  const activity = parsed.activity as SeedActivity
  const library = parsed.library as SeedLibrary
  const site = parsed.site as SeedSite
  const lists: [string, unknown][] = [
    ['organisation.people', organisation?.people], ['organisation.teams', organisation?.teams], ['organisation.agents', organisation?.agents],
    ['organisation.projects', organisation?.projects], ['organisation.taskTypes', organisation?.taskTypes], ['organisation.milestones', organisation?.milestones],
    ['organisation.tasks', organisation?.tasks], ['organisation.comments', organisation?.comments], ['organisation.attachments', organisation?.attachments],
    ['organisation.routines', organisation?.routines], ['organisation.sprints', organisation?.sprints],
    ['organisation.invitations', organisation?.invitations], ['activity.sessions', activity?.sessions], ['activity.conversations', activity?.conversations],
    ['activity.notifications', activity?.notifications], ['library.skills', library?.skills], ['library.workflows', library?.workflows],
    ['library.secrets', library?.secrets], ['library.variables', library?.variables], ['library.providers', library?.providers],
    ['library.billingProfiles', library?.billingProfiles], ['library.usage', library?.usage], ['site.workspaces', site?.workspaces],
    ['site.knowledge', site?.knowledge], ['site.files', site?.files], ['site.attachmentFiles', site?.attachmentFiles],
    ['site.artefacts', site?.artefacts],
  ]
  for (const [at, value] of lists) if (!Array.isArray(value)) add(at, 'Missing, or not a list.')
  if (!organisation?.org) add('organisation.org', 'Missing.')
  if (!library?.defaults) add('library.defaults', 'Missing.')
  if (problems.length) throw new DemoSeedError(problems)

  const ids = new Set<string>()
  const keysOf = (at: string, rows: { key?: string; id?: string }[], keyed = true): Set<string> => {
    const keys = new Set<string>()
    for (const row of rows) {
      if (keyed) {
        if (!row.key) add(at, 'A row has no key.')
        else if (keys.has(row.key)) add(at, `The key ${row.key} is used twice.`)
        else keys.add(row.key)
      }
      if (row.id !== undefined) {
        if (!UUID.test(row.id)) add(at, `${row.key ?? row.id} has an id that is not a UUID.`)
        else if (ids.has(row.id)) add(at, `The id ${row.id} is used twice.`)
        else ids.add(row.id)
      }
    }
    return keys
  }
  const people = keysOf('organisation.people', organisation.people)
  const teams = keysOf('organisation.teams', organisation.teams)
  const agents = keysOf('organisation.agents', organisation.agents)
  const projects = keysOf('organisation.projects', organisation.projects)
  const types = keysOf('organisation.taskTypes', organisation.taskTypes)
  const tasks = keysOf('organisation.tasks', organisation.tasks)
  keysOf('organisation.milestones', organisation.milestones, false)
  keysOf('organisation.routines', organisation.routines, false)
  keysOf('organisation.sprints', organisation.sprints, false)
  keysOf('activity.sessions', activity.sessions, false)
  keysOf('activity.conversations', activity.conversations, false)
  keysOf('library.workflows', library.workflows, false)
  keysOf('site.workspaces', site.workspaces, false)
  const providers = keysOf('library.providers', library.providers)
  const profiles = keysOf('library.billingProfiles', library.billingProfiles)

  const need = (at: string, set: Set<string>, what: string, key: string | null | undefined, extra: string[] = []) => {
    if (key === null || key === undefined) return
    if (!set.has(key) && !extra.includes(key)) add(at, `${what} ${key} is not in the data.`)
  }
  const kernel = ['kernel']
  for (const t of organisation.teams) {
    need('organisation.teams', people, 'The person', t.createdBy)
    for (const p of t.people) need('organisation.teams', people, 'The person', p)
    for (const a of t.agents) need('organisation.teams', agents, 'The agent', a)
  }
  const milestones = new Set(organisation.milestones.map(m => m.id))
  for (const p of organisation.projects) {
    const at = `organisation.projects ${p.key}`
    need(at, people, 'The person', p.lead)
    need(at, agents, 'The agent', p.defaultAgent, kernel)
    if (p.personalOwner) need(at, people, 'The person', p.personalOwner)
    for (const m of p.members) need(at, people, 'The person', m.person)
    for (const t of p.teams) need(at, teams, 'The team', t.team)
    for (const a of p.agents) need(at, agents, 'The agent', a)
    for (const n of p.pinnedBy) need(at, people, 'The person', n)
    need(at, profiles, 'The billing profile', p.billingProfile)
  }
  for (const t of organisation.taskTypes) need(`organisation.taskTypes ${t.key}`, projects, 'The project', t.project)
  for (const m of organisation.milestones) need('organisation.milestones', projects, 'The project', m.project)
  const numbers = new Set<string>()
  for (const t of organisation.tasks) {
    const at = `organisation.tasks ${t.key}`
    need(at, projects, 'The project', t.project)
    need(at, agents, 'The agent', t.agent, kernel)
    need(at, people, 'The person', t.person)
    if (t.type !== 'TASK' && t.type !== 'EPIC') need(at, types, 'The task type', t.type)
    if (t.epic) need(at, tasks, 'The epic', t.epic)
    if (t.milestone && !milestones.has(t.milestone)) add(at, `The milestone ${t.milestone} is not in the data.`)
    if (t.key !== `${t.project}-${t.number}`) add(at, 'A task\'s key is its project\'s key, a hyphen and its number.')
    if (numbers.has(t.key)) add(at, 'Used twice.')
    numbers.add(t.key)
  }
  for (const c of organisation.comments) {
    need('organisation.comments', tasks, 'The task', c.task)
    if ('person' in c.by) need('organisation.comments', people, 'The person', c.by.person)
    else need('organisation.comments', agents, 'The agent', c.by.agent)
  }
  for (const a of organisation.attachments) need('organisation.attachments', tasks, 'The task', a.task)
  for (const r of organisation.routines) {
    need('organisation.routines', projects, 'The project', r.project)
    need('organisation.routines', agents, 'The agent', r.agent)
    need('organisation.routines', people, 'The person', r.person)
  }
  const sprinted = new Set<string>()
  for (const s of organisation.sprints) {
    const at = `organisation.sprints ${s.project} ${s.number}`
    need(at, projects, 'The project', s.project)
    if (!Number.isInteger(s.days) || s.days < 1) add(at, 'A sprint lasts a whole number of days, at least one.')
    if (s.start > 0) add(at, 'A seeded sprint has begun: its start is not in the future.')
    for (const t of s.tasks) {
      need(at, tasks, 'The task', t)
      if (!t.startsWith(`${s.project}-`)) add(at, `${t} is not a task of ${s.project}.`)
      if (sprinted.has(t)) add(at, `${t} is in two sprints.`)
      sprinted.add(t)
      const task = organisation.tasks.find(x => x.key === t)
      if (task && (task.type === 'EPIC' || task.column === null || task.column === 'Backlog')) add(at, `${t} is an epic or in the backlog, and a sprint holds neither.`)
    }
  }
  for (const i of organisation.invitations) {
    need('organisation.invitations', people, 'The person', i.createdBy)
    for (const p of i.projects) need('organisation.invitations', projects, 'The project', p)
    if (i.at > 0 || i.expiresAt <= 0) add('organisation.invitations', `${i.note}: made in the past and not yet expired, or it is not waiting.`)
  }
  for (const s of activity.sessions) {
    need('activity.sessions', agents, 'The agent', s.agent)
    need('activity.sessions', people, 'The person', s.person)
    need('activity.sessions', tasks, 'The task', s.task)
  }
  for (const c of activity.conversations) {
    need('activity.conversations', agents, 'The agent', c.agent, kernel)
    need('activity.conversations', people, 'The person', c.openedBy)
    need('activity.conversations', projects, 'The project', c.project)
  }
  for (const n of activity.notifications) need('activity.notifications', people, 'The person', n.person)
  for (const s of library.skills) {
    need('library.skills', people, 'The person', s.madeBy)
    if (!Array.isArray(s.places)) { add(`library.skills ${s.name}`, 'places is missing, or not a list.'); continue }
    for (const p of s.places) {
      need(`library.skills ${s.name}`, projects, 'The project', p)
      const copy = `${PLACE_SKILLS_ROOT}/${s.name}/SKILL.md`
      if (!site.files.some(f => f.project === p && f.path === copy)) add(`library.skills ${s.name}`, `Added to ${p}, but site.files has no ${copy} there.`)
    }
  }
  for (const w of library.workflows) {
    need(`library.workflows ${w.name}`, projects, 'The project', w.project)
    need(`library.workflows ${w.name}`, people, 'The person', w.approvedBy)
    for (const r of w.runs) need(`library.workflows ${w.name}`, people, 'The person', r.person)
  }
  for (const s of library.secrets as (Place & { createdBy: string })[]) {
    need('library.secrets', projects, 'The project', s.project)
    need('library.secrets', people, 'The person', s.createdBy)
  }
  for (const v of library.variables) {
    need('library.variables', projects, 'The project', v.project)
    need('library.variables', people, 'The person', v.createdBy)
  }
  for (const k of [library.defaults.conversation, library.defaults.stt, library.defaults.tts]) need('library.defaults', providers, 'The provider', k.provider)
  for (const b of library.billingProfiles) need('library.billingProfiles', people, 'The person', b.createdBy)
  for (const u of library.usage) {
    need('library.usage', projects, 'The project', u.project)
    need('library.usage', agents, 'The agent', u.agent)
    need('library.usage', people, 'The person', u.person)
    need('library.usage', providers, 'The provider', u.provider)
  }
  for (const w of site.workspaces) need('site.workspaces', projects, 'The project', w.project)
  for (const k of site.knowledge) if ('project' in k.owner) need('site.knowledge', projects, 'The project', k.owner.project)
  for (const f of site.files) need('site.files', projects, 'The project', f.project)
  for (const f of site.attachmentFiles) need('site.attachmentFiles', tasks, 'The task', f.task)
  const artefactNames = new Set<string>()
  for (const a of site.artefacts) {
    need('site.artefacts', projects, 'The project', a.project)
    // An artefact is one file directly in its owner's artefacts folder: a plain name, no folder.
    if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(a.name) || a.name.includes('..')) add('site.artefacts', `${a.name} is not a plain file name.`)
    if (artefactNames.has(`${a.project}/${a.name}`)) add('site.artefacts', `${a.project}/${a.name} is there twice.`)
    artefactNames.add(`${a.project}/${a.name}`)
  }
  const attached = new Set(organisation.attachments.map(a => `${a.task}/${a.uuid}`))
  for (const f of site.attachmentFiles) if (!attached.has(`${f.task}/${f.uuid}`)) add('site.attachmentFiles', `${f.task}/${f.uuid} has no attachment row in organisation.attachments.`)
  for (const w of site.workspaces) {
    if (w.files !== undefined && !Array.isArray(w.files)) add('site.workspaces', `${w.name}: files is not a list.`)
    // A workspace's own files only: never a `.git` of its own, which would look like a repository to the site.
    else for (const f of w.files ?? []) {
      if (typeof f?.path !== 'string' || typeof f.content !== 'string' || !plainPath(f.path)) add('site.workspaces', `${w.name}: ${String(f?.path)} is not a plain relative path.`)
      else if (f.path.split('/').includes('.git')) add('site.workspaces', `${w.name}: ${f.path} is inside a .git folder.`)
    }
  }
  for (const f of site.files) if (f.path.split('/').some(part => part === '' || part === '.' || part === '..') || f.path.includes('\\') || f.path.startsWith('/')) add('site.files', `${f.path} is not a plain relative path.`)
  for (const k of site.knowledge) for (const p of k.pages) if (p.path.split('/').some(part => part === '' || part === '.' || part === '..') || p.path.includes('\\') || p.path.startsWith('/')) add('site.knowledge', `${p.path} is not a plain relative path.`)

  if (problems.length) throw new DemoSeedError(problems)
  return { organisation, activity, library, site }
}

/** A relative path that stays in its folder: no empty, `.` or `..` part, no backslash, not absolute. */
function plainPath(p: string): boolean {
  return !(p.split('/').some(part => part === '' || part === '.' || part === '..') || p.includes('\\') || p.startsWith('/'))
}
