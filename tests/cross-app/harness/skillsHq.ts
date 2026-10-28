// What the skills scenarios do in hq: make and publish skills through its operations, give them to agents, and
// start a conversation's turn or a task's run that goes to the site over the real channel. Every step is an
// operation a person has on a screen; nothing is written into hq's tables to stand in for one, except the chat
// session a conversation turn is sent into (a session row, as 10-propose-skill makes one).
import { randomUUID } from 'node:crypto'
import { HQ_URL } from './env'
import { hqDb, siteDb } from './db'
import { op, until } from './hqApi'

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

/** An operation that must succeed; its answer. */
export async function call(name: string, args: unknown, token: string): Promise<any> {
  const res = await op(HQ_URL, name, args, token)
  if (res.status !== 200) throw new Error(`${name} answered ${res.status}: ${JSON.stringify(res.json)}`)
  return res.json
}

export function skillMd(name: string, description: string, flags: string[] = []): string {
  return ['---', `name: ${name}`, `description: ${JSON.stringify(description)}`, ...flags, '---', '', `# ${name}`, '', `Do the ${name} steps.`, ''].join('\n')
}

export type MadeSkill = { assetId: string; name: string; identity: string; version: string; versionId: string; digest: string }

/** A Library skill the organisation made and published, with extra front matter lines when given. */
export async function librarySkill(token: string, name: string, description: string, flags: string[] = []): Promise<MadeSkill> {
  const made = await call('create-skill-draft', { name, description }, token)
  let revision: number = made.revision
  if (flags.length) {
    const saved = await call('save-asset-draft', { assetId: made.assetId, files: [{ path: 'SKILL.md', text: skillMd(name, description, flags) }], revision }, token)
    revision = saved.revision
  }
  await call('publish-asset-draft', { assetId: made.assetId, revision, note: 'First version' }, token)
  const asset = await hqDb.asset.findUniqueOrThrow({ where: { id: made.assetId }, include: { currentVersion: true } })
  const v = asset.currentVersion
  if (!v) throw new Error(`${name} has no version after it was published`)
  return { assetId: asset.id, name, identity: `${asset.publisher}/${name}`, version: v.version, versionId: v.id, digest: v.digest }
}

/** What hq names in a dispatch for an installed skill (hq/src/assets/delivery/installed.ts). */
export function installedEntry(s: MadeSkill, level: 'org' | 'agent' | 'builtin') {
  return { identity: s.identity, version: s.version, digest: s.digest, level, ref: { kind: 'skill' as const, key: s.versionId, digest: s.digest } }
}

export type PlaceSkillMade = { id: string; path: string; name: string; version: number; fingerprint: string }

/** A skill made and published in a place's files (a project, or Your space), through the site. */
export async function placeSkill(token: string, projectId: string, name: string, description: string): Promise<PlaceSkillMade> {
  const made = await call('create-place-skill-draft', { projectId, name, description }, token)
  await call('publish-place-skill-draft', { placeSkillId: made.placeSkillId, revision: made.revision, note: 'First version' }, token)
  const row = await hqDb.placeSkill.findUniqueOrThrow({ where: { id: made.placeSkillId } })
  if (!row.lastFingerprint) throw new Error(`${name} has no fingerprint after it was published`)
  return { id: row.id, path: row.path, name, version: 1, fingerprint: row.lastFingerprint }
}

/** Switches a place's skill on for the fingerprint hq last recorded for it. */
export async function switchOn(token: string, placeSkillId: string): Promise<void> {
  const row = await hqDb.placeSkill.findUniqueOrThrow({ where: { id: placeSkillId } })
  await call('switch-place-skill', { placeSkillId, on: true, fingerprint: row.lastFingerprint }, token)
}

/** Whether hq counts a place's skill as on, as its Skills page says. */
export async function isOn(token: string, projectId: string, placeSkillId: string): Promise<boolean> {
  const page = await call('get-place-skills', { projectId }, token)
  const row = page.skills.find((s: { id: string }) => s.id === placeSkillId)
  if (!row) throw new Error(`the place's page does not list skill ${placeSkillId}`)
  return row.state === 'on'
}

export type SiteRun = { id: string; sessionId: string; inputText: string; skillDigests: string[] }

async function settled(runId: string): Promise<SiteRun> {
  const run = await until(async () => {
    const r = await siteDb.agentRun.findUnique({ where: { id: runId } })
    return r && TERMINAL.has(r.status) ? r : null
  }, `run ${runId} to end on the site`, 150_000)
  return { id: run.id, sessionId: run.sessionId, inputText: run.inputText, skillDigests: run.skillDigests }
}

/**
 * One turn of a conversation `userId` holds with `agentId`, working in a project's files: hq dispatches it to the
 * site over the channel as a person's own turn, and the site makes the run's row (with the digests of the installed
 * and personal skills the dispatch named) before the run fails at launch for want of a harness.
 */
export async function chatRun(token: string, input: { userId: string; agentId: string; projectId: string; text: string }): Promise<SiteRun> {
  const sessionId = randomUUID()
  await hqDb.agentSession.create({
    data: { id: sessionId, agentId: input.agentId, userId: input.userId, sessionType: 'chat', primaryOwnerType: 'project', primaryOwnerId: input.projectId },
  })
  const sent = await call('trigger-agent-run', { sessionId, inputText: input.text }, token)
  return settled(sent.id)
}

/** A task assigned to `agentId` in a project, run once; the run as the site holds it. */
export async function taskRun(token: string, input: { agentId: string; projectId: string; title: string }): Promise<SiteRun> {
  await hqDb.projectAgent.upsert({
    where: { projectId_agentId: { projectId: input.projectId, agentId: input.agentId } }, create: { projectId: input.projectId, agentId: input.agentId }, update: {},
  })
  const task = await call('create-task', { projectId: input.projectId, title: input.title, assignedAgentId: input.agentId }, token)
  await call('run-task', { taskId: task.id }, token)
  const session = await until<{ id: string }>(() => hqDb.agentSession.findUnique({ where: { taskId: task.id } }), `the task's session`, 60_000)
  const run = await until<{ id: string }>(() => siteDb.agentRun.findFirst({ where: { sessionId: session.id } }), `the task's run on the site`, 60_000)
  return settled(run.id)
}

/** A project hq holds on its own default site, with `userIds` as members besides its maker. */
export async function project(token: string, name: string, userIds: string[] = []): Promise<string> {
  const made = await call('create-project', { name }, token)
  for (const userId of userIds) await hqDb.projectMember.create({ data: { projectId: made.id, userId, role: 'MEMBER' } })
  return made.id
}

export async function agent(token: string, name: string, projectId: string): Promise<string> {
  const made = await call('create-agent', { name, handle: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}` }, token)
  await hqDb.projectAgent.create({ data: { projectId, agentId: made.id } })
  return made.id
}

export async function userIdOf(username: string): Promise<string> {
  const identity = await hqDb.authIdentity.findUniqueOrThrow({
    where: { providerName_providerUserId: { providerName: 'username', providerUserId: username } }, include: { auth: true },
  })
  return identity.auth.userId
}

/** Your space: the person's personal project, which hq makes with the account. */
export async function yourSpace(userId: string): Promise<string> {
  const space = await until<{ id: string }>(() => hqDb.project.findFirst({ where: { personalOwnerId: userId, personalSpace: true } }), `${userId}'s Your space`, 30_000)
  return space.id
}
