/**
 * An agent's Skills section as one read (spec part 6 *The agent's page*; board A1): everything the agent will see,
 * grouped by why it has it in the order a clash is settled in (built in, every agent, this agent, each place it works
 * in), anything set aside and why, and the skills that run in its places. It composes the records a run's skills are
 * resolved from; it delivers nothing. Places are limited to those the viewer is in (D27): an administrator outside a
 * project neither sees nor opens its skills, so such a place is only counted.
 */
import type { PrismaClient } from '@prisma/client'
import { HttpError, prisma } from 'wasp/server'
import { copyLinks } from '../../../library/assetList/copies'
import { libraryRows } from '../../../library/assetList/rows'
import type { LibraryAssetRow } from '../../../library/assetList/types'
import { isProjectMember } from '../../../projects/membership'
import { listBuiltIns } from '../../builtins/switch'
import { may } from '../../policy'
import { organisationTarget, personActor } from '../../policyActors'
import { switchState } from '../../places/switchState'
import type { AgentPlaceLine, AgentSetAsideLine, AgentSkillLine, AgentSkillsView } from './types'

const NOTHING = 'Nothing was changed.'
const NAMES_SHOWN = 8

const lineOf = (r: LibraryAssetRow): AgentSkillLine => ({
  assetId: r.assetId!, identity: r.identity, title: r.title, description: r.description,
  version: r.version ?? '', signer: r.signer, updateTo: r.updateTo,
})

const folderName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export async function agentSkillsView(db: PrismaClient, viewerId: string, agentId: unknown): Promise<AgentSkillsView> {
  const viewer = await personActor(viewerId, db)
  if (viewer.role === null) throw new HttpError(403, `Skills are for people in this organisation. ${NOTHING}`)
  const agent = typeof agentId === 'string' ? await db.agent.findUnique({ where: { id: agentId }, select: { id: true, name: true } }) : null
  if (!agent) throw new HttpError(404, `That agent isn't here. ${NOTHING}`)

  const [rows, builtIns, held, org] = await Promise.all([
    libraryRows(db, viewer),
    listBuiltIns(db),
    db.asset.findMany({
      where: { kind: 'SKILL', builtIn: false, removedAt: null, currentVersionId: { not: null } },
      select: { id: true, publisher: true, givenToAll: true, grants: { where: { agentId: agent.id }, select: { agentId: true } } },
    }),
    db.org.findFirst({ select: { fileSkillsDefault: true, publisherName: true } }),
  ])
  // The Library folds a copy under its original; a copy that isn't serving the agents isn't offered beside it.
  const unused = held.filter(a => !a.givenToAll && a.grants.length === 0 && org?.publisherName && a.publisher === org.publisherName)
  const notInUse = new Set((await copyLinks(db, unused.map(a => a.id))).filter(l => !l.inUse).map(l => l.copyId))
  const byId = new Map(rows.filter(r => r.assetId && r.kind === 'skill' && !r.proposalId).map(r => [r.assetId!, r]))
  const everyAgent: AgentSkillLine[] = []
  const thisAgent: AgentSkillLine[] = []
  const addable: AgentSkillLine[] = []
  const setAside: AgentSetAsideLine[] = []
  for (const a of held) {
    const row = byId.get(a.id)
    if (!row) continue
    const has = a.givenToAll || a.grants.length > 0
    if (row.setAsideFor) {
      if (has) setAside.push({ name: row.title, where: 'the Library', reason: `The organisation installs ${row.setAsideFor}, so ${row.identity} isn't used.` })
      continue
    }
    if (a.givenToAll) everyAgent.push(lineOf(row))
    else if (a.grants.length > 0) thisAgent.push(lineOf(row))
    else if (!notInUse.has(a.id)) addable.push(lineOf(row))
  }

  const mayManage = may(viewer, 'grant', await organisationTarget(db))
  const { places, hiddenPlaces, placeSetAside, placeListed } = await placesOf(db, viewerId, agent.id, org?.fileSkillsDefault ?? 'OFF')
  const builtInLines = builtIns.map(b => ({
    assetId: b.assetId, identity: b.identity, title: b.title, description: b.description, version: b.version, on: b.on, repositoryOnly: b.repositoryOnly,
  }))
  const yours = await yoursOf(db, viewerId, agent.id, org?.fileSkillsDefault ?? 'OFF')

  return {
    agent, mayManage, builtIn: builtInLines, everyAgent, thisAgent, places, hiddenPlaces,
    setAside: [...setAside, ...placeSetAside],
    yours,
    listed: [
      ...builtInLines.filter(b => b.on).map(b => ({ name: b.title, description: b.description })),
      ...[...everyAgent, ...thisAgent].map(s => ({ name: s.title, description: s.description })),
      ...placeListed,
    ],
    addable: mayManage ? addable : [],
  }
}

/** The skills in files that apply to this agent in one place: the place's own, a workspace's, and its own folder. */
const appliesTo = (agentId: string) => (r: { group: 'PLACE' | 'AGENT' | 'WORKSPACE'; agentId: string | null }) => r.group !== 'AGENT' || r.agentId === agentId

async function placesOf(db: PrismaClient, viewerId: string, agentId: string, orgDefault: 'ON' | 'OFF' | 'NEVER') {
  const assigned = await db.projectAgent.findMany({
    where: { agentId, project: { personalOwnerId: null } },
    select: { project: { select: { id: true, key: true, name: true, fileSkillsDefault: true } } },
  })
  const seen: typeof assigned = []
  let hiddenPlaces = 0
  for (const a of assigned) {
    if (await isProjectMember(a.project.id, viewerId)) seen.push(a)
    else hiddenPlaces += 1
  }
  const skills = seen.length === 0 ? [] : await db.placeSkill.findMany({
    where: { placeType: 'project', placeId: { in: seen.map(a => a.project.id) }, goneAt: null },
    select: { placeId: true, name: true, description: true, path: true, group: true, agentId: true, switch: true, switchFingerprint: true, lastFingerprint: true, setAsideReason: true },
    orderBy: { path: 'asc' },
  })
  const places: AgentPlaceLine[] = []
  const placeSetAside: AgentSetAsideLine[] = []
  const placeListed: { name: string; description: string }[] = []
  for (const { project } of seen.sort((a, b) => a.project.name.localeCompare(b.project.name))) {
    const line: AgentPlaceLine = { projectId: project.id, projectKey: project.key, name: project.name, on: 0, off: 0, setAside: 0, onNames: [] }
    for (const row of skills.filter(s => s.placeId === project.id).filter(appliesTo(agentId))) {
      const name = row.name || folderName(row.path)
      if (row.setAsideReason) {
        line.setAside += 1
        placeSetAside.push({ name, where: project.name, reason: row.setAsideReason })
      } else if (switchState(row, project.fileSkillsDefault, orgDefault) === 'on') {
        line.on += 1
        line.onNames.push(name)
        placeListed.push({ name, description: row.description })
      } else {
        line.off += 1
      }
    }
    line.onNames = line.onNames.slice(0, NAMES_SHOWN)
    places.push(line)
  }
  return { places, hiddenPlaces, placeSetAside, placeListed }
}

/** The viewer's own skills that run when they talk to this agent: published, and switched on for what was published. */
async function yoursOf(db: PrismaClient, userId: string, agentId: string, orgDefault: 'ON' | 'OFF' | 'NEVER') {
  const space = await db.project.findFirst({ where: { personalOwnerId: userId, personalSpace: true }, select: { fileSkillsDefault: true } })
  const rows = await db.placeSkill.findMany({
    where: { placeType: 'user', placeId: userId, goneAt: null, versions: { some: {} } },
    select: {
      name: true, description: true, path: true, group: true, agentId: true, switch: true, switchFingerprint: true, lastFingerprint: true,
      versions: { select: { digest: true } },
    },
    orderBy: { path: 'asc' },
  })
  return rows
    .filter(r => r.group !== 'WORKSPACE' && appliesTo(agentId)(r))
    .filter(r => r.versions.some(v => v.digest === r.lastFingerprint) && switchState(r, space?.fileSkillsDefault ?? null, orgDefault) === 'on')
    .map(r => ({ name: r.name || folderName(r.path), description: r.description }))
}
