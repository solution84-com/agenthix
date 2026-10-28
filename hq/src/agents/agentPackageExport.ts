/**
 * An agent exported as an agent template package (format 2, adr-0157), so the Library installs it through the one
 * pipeline anywhere, with every skill it needs inside (D10): `agent.json`, `instructions.md`, and under `skills/`
 * each installed skill the agent has. A shared skill keeps its name and version in its own `package.json`, under the
 * package's publisher (C1: whoever signs the package vouches for everything in it); a template's role skill
 * (`template/skill`) and a skill in the agent's own files become this package's role skills. Built-in skills are left
 * out: every hq has them. Exported unsigned, as the Library's exports are.
 *
 * An agent is not a versioned asset, so its export is numbered by when it was made (`1.<date>.<time>`, UTC): a later
 * export of the same agent installs as an update of an earlier one.
 */
import { prisma } from 'wasp/server'
import { ASSET_MANIFEST_FILE, ASSET_MANIFEST_FORMAT, isAssetName } from '@agenthix/core'
import type { Db } from '../packages/packageStore'
import { readAgentContent, agentSettingsOf, INSTRUCTIONS_FILE } from '../packages/agentPackageService'
import { readContent } from '../assets/content'
import { organisationPublisher } from '../assets/organisationPublisher'
import { skillDescription, skillMdOf, skillTitle } from '../assets/skillFile'
import type { PackageFile } from '../library/packages/packageZip'

export class AgentExportError extends Error {}

const json = (path: string, value: unknown): PackageFile => ({ path, content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf-8') })

export function exportVersion(at: Date): string {
  const iso = at.toISOString()
  const date = iso.slice(0, 10).replace(/-/g, '')
  const time = Number(iso.slice(11, 19).replace(/:/g, ''))
  return `1.${date}.${time}`
}

/** The package's name: the handle, made a valid asset name (a handle may hold `_`). */
export function packageName(handle: string): string {
  const name = handle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return isAssetName(name) ? name : 'agent'
}

type Carried = { folder: string; files: PackageFile[]; manifest: { name: string; version: string; description: string } | null }

async function installedSkills(db: Db, agentId: string): Promise<Carried[]> {
  const rows = await db.asset.findMany({
    where: {
      kind: 'SKILL', builtIn: false, removedAt: null, setAsideById: null, currentVersionId: { not: null },
      OR: [{ givenToAll: true }, { grants: { some: { agentId } } }],
    },
    select: { name: true, currentVersion: { select: { version: true, digest: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const out: Carried[] = []
  for (const row of rows) {
    const files = (await readContent(row.currentVersion!.digest, db)).filter(f => f.path !== ASSET_MANIFEST_FILE)
    const role = row.name.includes('/')
    const folder = row.name.slice(row.name.lastIndexOf('/') + 1)
    const md = skillMdOf(files)
    out.push({ folder, files, manifest: role ? null : { name: row.name, version: row.currentVersion!.version, description: skillDescription(md) || skillTitle(md, row.name) } })
  }
  return out
}

/** The agent's own skill files, from before skills were installed: each its own role skill. */
function ownSkills(skillFiles: PackageFile[]): Carried[] {
  const folders = new Map<string, PackageFile[]>()
  for (const f of skillFiles) {
    const [, folder, ...rest] = f.path.split('/')
    if (!folder || rest.length === 0 || !isAssetName(folder)) continue
    folders.set(folder, [...(folders.get(folder) ?? []), { path: rest.join('/'), content: f.content }])
  }
  return [...folders].map(([folder, files]) => ({ folder, files, manifest: null }))
}

export async function exportAgentPackage(agentId: string, now = new Date(), db: Db = prisma): Promise<{ root: string; files: PackageFile[] }> {
  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent) throw new AgentExportError(`Agent '${agentId}' not found`)
  const content = await readAgentContent(agentId)
  if (!content) throw new AgentExportError(`Agent '${agent.handle}' has no instructions to export`)
  const publisher = await organisationPublisher(db)
  const name = packageName(agent.handle)
  const version = exportVersion(now)
  const s = agentSettingsOf(agent)
  const files: PackageFile[] = [
    json(ASSET_MANIFEST_FILE, { format: ASSET_MANIFEST_FORMAT, kind: 'agent', publisher, name, version, description: agent.role?.trim().slice(0, 1024) || agent.name }),
    json('agent.json', {
      name: agent.name, handle: agent.handle, ...(agent.role ? { role: agent.role } : {}), approval: s.approval,
      ...(s.permissions.tools ? { allowedTools: s.permissions.tools } : {}),
      ...(s.permissions.bashPatterns ? { allowedBashPatterns: s.permissions.bashPatterns } : {}),
    }),
    { path: INSTRUCTIONS_FILE, content: Buffer.from(content.instructions, 'utf-8') },
  ]
  // Two skills that would sit in one folder: the first kept, as staging keeps the first of two names.
  const taken = new Set<string>()
  for (const skill of [...await installedSkills(db, agentId), ...ownSkills(content.skillFiles)]) {
    if (taken.has(skill.folder)) continue
    taken.add(skill.folder)
    files.push(...skill.files.map(f => ({ path: `skills/${skill.folder}/${f.path}`, content: f.content })))
    if (skill.manifest) files.push(json(`skills/${skill.folder}/${ASSET_MANIFEST_FILE}`, { format: ASSET_MANIFEST_FORMAT, kind: 'skill', publisher, ...skill.manifest }))
  }
  return { root: name, files: files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) }
}
