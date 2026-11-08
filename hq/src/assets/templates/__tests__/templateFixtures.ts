/** Template assets for integration tests: a package stored by digest, its asset, its version pinned. */
import type { PrismaClient } from '@prisma/client'
import { storeContent } from '../../content'

const f = (path: string, text: string) => ({ path, content: Buffer.from(text, 'utf-8') })

/** A task type as a task template or a team template's project carries it. */
export const STORY = { name: 'Story', icon: 'task', columns: [
  { name: 'Planned', state: 'BACKLOG' }, { name: 'To do', state: 'TODO' }, { name: 'In review', state: 'IN_PROGRESS' }, { name: 'Done', state: 'DONE' },
] }
export const SEVERITY = { name: 'Severity', options: [{ name: 'Low' }, { name: 'High', colour: 'danger' }] }

const SKILL = (name: string) => `---\nname: ${name}\ndescription: Does ${name}\n---\n\n# ${name}\n`

export function taskTemplatePackage(name: string, content: unknown = { types: [STORY] }, version = '1.0.0') {
  return [
    f('package.json', JSON.stringify({ format: 2, kind: 'task-template', publisher: 'agenthix', name, version, description: `${name} types` })),
    f('task-template.json', JSON.stringify(content)),
  ]
}

export function agentPackage(name: string, opts: { handle?: string; roleSkills?: string[]; approval?: string; version?: string } = {}) {
  return [
    f('package.json', JSON.stringify({ format: 2, kind: 'agent', publisher: 'agenthix', name, version: opts.version ?? '1.0.0', description: `${name} role` })),
    f('agent.json', JSON.stringify({ name: `The ${name}`, handle: opts.handle ?? name, role: `${name} role`, approval: opts.approval ?? 'deferred', allowedTools: ['read_file'] })),
    f('instructions.md', `# ${name}\n\nDo the ${name} work.\n`),
    ...(opts.roleSkills ?? []).map(s => f(`skills/${s}/SKILL.md`, SKILL(s))),
  ]
}

export type TeamAgentFixture = { handle: string; skills?: string[]; approval?: string; allowedTools?: unknown[]; allowedBashPatterns?: unknown[] }

/**
 * A team template: one team of these agents, the role skills named under it, and shared skills each with its own
 * `package.json`. A project, Main, when `project` is given, with its task types and fields.
 */
export function teamPackage(name: string, opts: {
  agents: TeamAgentFixture[]
  roleSkills?: string[]
  shared?: Array<{ name: string; version?: string }>
  project?: { types?: unknown[]; fields?: unknown[] }
  version?: string
  publisher?: string
}) {
  const publisher = opts.publisher ?? 'agenthix'
  return [
    f('package.json', JSON.stringify({ format: 2, kind: 'team', publisher, name, version: opts.version ?? '1.0.0', description: `${name} team` })),
    f('team.json', JSON.stringify({
      name: `The ${name}`, description: `${name} team`, tags: ['test'],
      teams: [{ name: 'Crew', purpose: 'Work', agents: opts.agents.map(a => a.handle) }],
      projects: opts.project ? [{ name: 'Main', defaultAgentHandle: opts.agents[0].handle, ...opts.project }] : [],
    })),
    ...opts.agents.map(a => f(`agents/${a.handle}/agent.json`, JSON.stringify({
      name: `Agent ${a.handle}`, role: `${a.handle} role`, responsibilities: `Does ${a.handle} work.`, approval: a.approval ?? 'deferred', skills: a.skills ?? [],
      allowedTools: a.allowedTools, allowedBashPatterns: a.allowedBashPatterns,
    }))),
    ...(opts.roleSkills ?? []).map(s => f(`skills/${s}/SKILL.md`, SKILL(s))),
    ...(opts.shared ?? []).flatMap(s => [
      f(`skills/${s.name}/SKILL.md`, SKILL(s.name)),
      f(`skills/${s.name}/package.json`, JSON.stringify({ format: 2, kind: 'skill', publisher, name: s.name, version: s.version ?? '1.0.0', description: `Does ${s.name}` })),
    ]),
  ]
}

/** Writes a template straight to the records, as the pipeline leaves it; returns its asset and pinned version ids. */
export async function seedTemplate(
  db: PrismaClient,
  kind: 'AGENT' | 'TEAM' | 'TASK_TEMPLATE',
  name: string,
  files: Array<{ path: string; content: Buffer }>,
  opts: { publisher?: string; version?: string; source?: 'BUILT_IN' | 'UPLOAD' | 'MADE_HERE' } = {},
): Promise<{ assetId: string; versionId: string }> {
  const asset = await db.asset.create({ data: { kind, publisher: opts.publisher ?? 'agenthix', name } })
  const version = await db.assetVersion.create({
    data: { assetId: asset.id, version: opts.version ?? '1.0.0', digest: await storeContent(files, db), source: opts.source ?? 'BUILT_IN' },
  })
  await db.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
  return { assetId: asset.id, versionId: version.id }
}

/** A carried skill as installed beside its template. */
export async function seedSkill(db: PrismaClient, name: string, publisher = 'agenthix', at = '1.0.0'): Promise<string> {
  const files = [f('SKILL.md', SKILL(name.slice(name.lastIndexOf('/') + 1)))]
  const asset = await db.asset.create({ data: { kind: 'SKILL', publisher, name } })
  const version = await db.assetVersion.create({ data: { assetId: asset.id, version: at, digest: await storeContent(files, db), source: 'BUILT_IN' } })
  await db.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
  return asset.id
}

/** hq's own Workforce Assembly task template, as boot installs it: its Team proposal type waits in In review. */
export async function seedAssemblyTemplate(db: PrismaClient): Promise<string> {
  const files = taskTemplatePackage('workforce-assembly', { types: [{ ...STORY, name: 'Team proposal' }] })
  return (await seedTemplate(db, 'TASK_TEMPLATE', 'workforce-assembly', files)).versionId
}

/** The Team proposal type made from that template in the project, as HQ makes it for proposals. */
export async function addTeamProposalType(db: PrismaClient, projectId: string, versionId: string): Promise<{ typeId: string; inReviewColumnId: string }> {
  const type = await db.taskType.create({
    data: {
      projectId, name: 'Team proposal', kind: 'CUSTOM', order: 2, madeFromVersionId: versionId,
      columns: { create: STORY.columns.map((c, order) => ({ name: c.name, state: c.state as 'BACKLOG', defaultForState: true, order })) },
    },
    include: { columns: true },
  })
  return { typeId: type.id, inReviewColumnId: type.columns.find(c => c.name === 'In review')!.id }
}

/** The template seeded and its Team proposal type made in the project: returns the version and the In review column. */
export async function seedWorkforceAssembly(db: PrismaClient, projectId: string): Promise<{ versionId: string; typeId: string; inReviewColumnId: string }> {
  const versionId = await seedAssemblyTemplate(db)
  return { versionId, ...(await addTeamProposalType(db, projectId, versionId)) }
}
