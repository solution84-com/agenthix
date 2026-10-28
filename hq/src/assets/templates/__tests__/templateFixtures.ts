/** Template assets for integration tests: a package stored by digest, its asset, its version pinned. */
import type { PrismaClient } from '@prisma/client'
import { storeContent } from '../../content'

const f = (path: string, text: string) => ({ path, content: Buffer.from(text, 'utf-8') })

export const COLUMNS = [
  { name: 'todo', label: 'To Do', status: 'TODO', color: '#6b7280', order: 0, description: 'Not started.' },
  { name: 'in_progress', label: 'In Progress', status: 'IN_PROGRESS', color: '#f59e0b', order: 1, description: 'Being done.', autoQueue: true },
  { name: 'done', label: 'Done', status: 'DONE', color: '#10b981', order: 2, description: 'Finished.' },
]

const SKILL = (name: string) => `---\nname: ${name}\ndescription: Does ${name}\n---\n\n# ${name}\n`

export function boardPackage(name: string, columns: unknown[] = COLUMNS, version = '1.0.0') {
  return [
    f('package.json', JSON.stringify({ format: 2, kind: 'board', publisher: 'agenthix', name, version, description: `${name} board` })),
    f('board.json', JSON.stringify({ name: `${name} board`, description: `${name} board`, columns })),
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

export type TeamAgentFixture = { handle: string; skills?: string[]; approval?: string }

/**
 * A team template: one team of these agents, the role skills named under it, and shared skills each with its own
 * `package.json`. A project with one board when `board` is given.
 */
export function teamPackage(name: string, opts: {
  agents: TeamAgentFixture[]
  roleSkills?: string[]
  shared?: Array<{ name: string; version?: string }>
  board?: string
  version?: string
  publisher?: string
}) {
  const publisher = opts.publisher ?? 'agenthix'
  return [
    f('package.json', JSON.stringify({ format: 2, kind: 'team', publisher, name, version: opts.version ?? '1.0.0', description: `${name} team` })),
    f('team.json', JSON.stringify({
      name: `The ${name}`, description: `${name} team`, tags: ['test'],
      teams: [{ name: 'Crew', purpose: 'Work', agents: opts.agents.map(a => a.handle) }],
      projects: opts.board ? [{ name: 'Main', defaultAgentHandle: opts.agents[0].handle, boards: [{ name: 'Flow', template: opts.board }] }] : [],
    })),
    ...opts.agents.map(a => f(`agents/${a.handle}/agent.json`, JSON.stringify({
      name: `Agent ${a.handle}`, role: `${a.handle} role`, responsibilities: `Does ${a.handle} work.`, approval: a.approval ?? 'deferred', skills: a.skills ?? [],
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
  kind: 'AGENT' | 'BOARD' | 'TEAM',
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
