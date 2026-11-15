/**
 * What a run is told about skills (spec part 5 *Delivery per turn*): built-ins not switched off, installed skills
 * every agent or this agent has at their pinned versions, the place's switched-on skills in files, and the person's
 * published skills on a turn of their own conversation; then the clash order, installed, project, person (D16), with
 * what was set aside and why.
 */
import type { FileSkillEntry, InstalledSkillEntry, PersonSkillEntry } from '@agenthix/core'
import { prisma } from 'wasp/server'
import type { Db } from '../../packages/packageStore'
import { siteChannelRegistry } from '../../sites/channel'
import { Logger } from '../../server/utils/logger'
import { settleClashes, skillKey, type SetAsideSkill, type SkillCandidate } from './clashOrder'
import { SAME_NAME_REASON, settleStagedNames, type NamedItem } from './stagedNames'
import { installedSkillsFor } from './installed'
import { builtInSkillsFor, locationIsRepository, type RepositoryCheck } from '../builtins/delivery'
import { fileSkillsFor, placeDefaultOf, scanPlaceOnSite, type FileSkillsResult, type ScanPlace } from './fileSkills'
import { placeSkillPath } from '../places/scan'
import { personalSkillsApply, personSkillsFor, type RunFor } from './personSkills'

const logger = new Logger('RunSkills')

export type RunSkillsInput = RunFor & { agentId: string; siteId: string; workspaceIds: string[] }

type Item = NamedItem

export type RunSkills = {
  installedSkills: InstalledSkillEntry[]
  fileSkills: FileSkillEntry[]
  personSkills: PersonSkillEntry[]
  setAside: SetAsideSkill<Item>[]
  /** What this turn could not do, in words a person can read. */
  notes: string[]
}

export async function resolveRunSkills(
  input: RunSkillsInput,
  db: Db = prisma,
  scan: ScanPlace = scanPlaceOnSite,
  inRepository: RepositoryCheck = runLocationIsRepository(input),
): Promise<RunSkills> {
  const org = await db.org.findFirst({ select: { fileSkillsDefault: true, personalSkillsOutsideSpace: true } })
  const orgDefault = org?.fileSkillsDefault ?? 'OFF'
  const withPerson = personalSkillsApply(input, org?.personalSkillsOutsideSpace ?? true)

  const [builtIn, installed, files, person] = await Promise.all([
    builtInSkillsFor(db, inRepository),
    installedSkillsFor(db, input.agentId),
    fileSkillsFor(db, { siteId: input.siteId, place: input.place, agentId: input.agentId, workspaceIds: input.workspaceIds, orgDefault }, scan),
    withPerson
      ? placeDefaultOf(db, { placeType: 'user', placeId: input.personId! })
        .then(spaceDefault => personSkillsFor(db, { personId: input.personId!, agentId: input.agentId, spaceDefault, orgDefault }))
      : Promise.resolve([]),
  ])

  const candidates: SkillCandidate<Item>[] = [
    ...[...builtIn, ...installed].map(entry => ({ level: 'installed' as const, key: entry.identity, label: entry.identity, item: { kind: 'installed' as const, entry } })),
    ...files.candidates.map(c => ({ level: 'project' as const, key: c.key, label: c.label, item: { kind: 'file' as const, entry: c.entry } })),
    ...person.map(c => ({ level: 'person' as const, key: c.key, label: c.label, item: { kind: 'person' as const, entry: c.entry } })),
  ]
  const settled = settleClashes(candidates)
  const named = settleStagedNames(settled.kept)
  const kept = named.kept
  const setAside = [...settled.setAside, ...named.setAside]
  await markSetAsideByOrganisation(db, files, installed.filter(e => e.level === 'org').map(e => e.identity))

  const notes = files.problem ? [files.problem] : []
  for (const s of named.setAside) notes.push(`${s.label}: ${SAME_NAME_REASON}`)
  for (const s of setAside) logger.info(`run of agent ${input.agentId}: ${s.label} (${s.level}) ${s.reason}`)
  if (notes.length) logger.warn(`run of agent ${input.agentId} in ${input.place.placeType} ${input.place.placeId}: ${notes.join(' ')}`)

  const pick = <K extends Item['kind']>(kind: K) =>
    kept.map(c => c.item).filter((i): i is Extract<Item, { kind: K }> => i.kind === kind).map(i => i.entry as Extract<Item, { kind: K }>['entry'])
  return { installedSkills: pick('installed'), fileSkills: pick('file'), personSkills: pick('person'), setAside, notes }
}

/**
 * A place's skill set aside by a skill every agent has is set aside whichever agent runs there, so it is kept on the
 * row for its Skills page. One set aside only for one agent's grant is that run's alone, and not written.
 */
async function markSetAsideByOrganisation(db: Db, files: FileSkillsResult, orgIdentities: string[]): Promise<void> {
  const everyAgent = new Set(orgIdentities)
  const byPath = new Map(files.rows.map(r => [r.path, r]))
  for (const skill of files.found) {
    const path = placeSkillPath(skill)
    const row = path ? byPath.get(path) : undefined
    if (!row) continue
    const key = skillKey({ identity: skill.identity, name: skill.name, path: row.path })
    const reason = everyAgent.has(key) ? `Set aside: the organisation's installed ${key} is used instead (an installed skill comes first).` : null
    if (row.setAsideReason !== reason) await db.placeSkill.update({ where: { id: row.id }, data: { setAsideReason: reason } })
  }
}

/** The run's own location: the primary workspace when it has one, else the place's files. */
function runLocationIsRepository(input: RunSkillsInput): RepositoryCheck {
  const loc = { ownerType: input.place.placeType, ownerId: input.place.placeId, workspaceId: input.workspaceIds[0] ?? null }
  return locationIsRepository(input.siteId, loc)
}

/** Whether a site is sent a run's skills: only one connected now, since resolving them reads its places. */
export function siteTakesRunSkills(siteId: string): boolean {
  return siteChannelRegistry.get(siteId) !== null
}
