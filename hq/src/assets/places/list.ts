/**
 * A place's Skills page (spec part 4 C2; part 6): every skill found in its files, grouped by where it was found (the
 * place, one agent, each workspace), each with whether it runs, its switch, its version, whether its files hold a
 * change nobody published (FV4), and its draft; the defaults; and what the person may do there. Reading it reads hq's
 * records only; looking at the place again asks its site to scan (`scanPlace`). Under *Never* hq reads no skills from
 * files, so nothing is scanned.
 */
import type { FileSkillsDefault, PrismaClient } from '@prisma/client'
import { agentSkillsRoot } from '@agenthix/core'
import { may, type Actor, type AssetAction } from '../policy'
import { LifecycleError } from '../lifecycle/errors'
import { assertSees, placeOfProject, type PlaceContext } from './place'
import { recordScan } from './scan'
import { scanOnSite } from './siteSkills'
import { defaultsOf, type PlaceDefaults } from './switches'
import { switchState } from './switchState'

const NOTHING = 'Nothing was changed.'

export type PlaceSkillStatus =
  /** Its files are a published version. */
  | 'published'
  /** FV4: its files match no version, and it has one. */
  | 'changed'
  /** Never published here: found in files, or only a draft. */
  | 'unpublished'

export type PlaceSkillView = {
  id: string
  path: string
  /** The front matter's name and description as the last scan read them; empty when absent. */
  name: string
  description: string
  group: 'PLACE' | 'AGENT' | 'WORKSPACE'
  agentId: string | null
  workspaceId: string | null
  fingerprint: string | null
  state: 'on' | 'off'
  switch: 'ON' | 'OFF' | null
  /** Whether the switch was set for what the files hold now. */
  switchHolds: boolean
  status: PlaceSkillStatus
  /** The version its files are, and the newest published. */
  version: number | null
  newestVersion: number | null
  draftRevision: number | null
  gone: boolean
  setAsideReason: string | null
  lastSeenAt: Date | null
}

export type PlaceSkillsView = {
  defaults: PlaceDefaults
  skills: PlaceSkillView[]
  /** What this person may do here, for the screen to offer. */
  may: Record<'editDraft' | 'publish' | 'rollBack' | 'remove' | 'install' | 'settings', boolean>
}

const ACTIONS = ['editDraft', 'publish', 'rollBack', 'remove', 'install', 'settings'] as const satisfies readonly AssetAction[]

export async function listPlaceSkills(db: PrismaClient, actor: Actor & { kind: 'person' }, projectId: unknown): Promise<PlaceSkillsView> {
  const ctx = await placeOfProject(db, projectId)
  await assertSees(actor.userId, ctx)
  return viewOf(db, actor, ctx)
}

async function viewOf(db: PrismaClient, actor: Actor, ctx: PlaceContext): Promise<PlaceSkillsView> {
  const rows = await db.placeSkill.findMany({
    where: { ...ctx.place, OR: [{ goneAt: null }, { draft: { isNot: null } }] },
    include: { versions: { select: { number: true, digest: true }, orderBy: { number: 'desc' } }, draft: { select: { revision: true } } },
    orderBy: [{ group: 'asc' }, { path: 'asc' }],
  })
  const skills = rows.map((row): PlaceSkillView => {
    const matching = row.versions.find(v => v.digest === row.lastFingerprint)
    const newest = row.versions[0]?.number ?? null
    return {
      id: row.id, path: row.path, name: row.name, description: row.description, group: row.group, agentId: row.agentId, workspaceId: row.workspaceId,
      fingerprint: row.lastFingerprint,
      state: row.goneAt ? 'off' : switchState(row, ctx.placeDefault, ctx.orgDefault),
      switch: row.switch,
      switchHolds: row.switch !== null && row.switchFingerprint === row.lastFingerprint,
      status: matching ? 'published' : newest !== null && !row.goneAt ? 'changed' : 'unpublished',
      version: matching?.number ?? null,
      newestVersion: newest,
      draftRevision: row.draft?.revision ?? null,
      gone: row.goneAt !== null,
      setAsideReason: row.setAsideReason,
      lastSeenAt: row.lastSeenAt,
    }
  })
  const allowed = Object.fromEntries(ACTIONS.map(a => [a, may(actor, a, ctx.target)])) as PlaceSkillsView['may']
  return { defaults: defaultsOf(ctx), skills, may: allowed }
}

const NEVER: FileSkillsDefault = 'NEVER'

/**
 * Asks the place's site what its skill folders hold now, for the place's own folder and, when named, one agent's, and
 * records what it found. Anyone who sees the page may: a scan only records what is there.
 */
export async function scanPlace(db: PrismaClient, actor: Actor & { kind: 'person' }, input: { projectId: unknown; agentId?: unknown }): Promise<PlaceSkillsView & { truncated: boolean; problems: { path: string; reason: string }[] }> {
  const ctx = await placeOfProject(db, input.projectId)
  await assertSees(actor.userId, ctx)
  if (defaultsOf(ctx).effective === NEVER) return { ...(await viewOf(db, actor, ctx)), truncated: false, problems: [] }
  const agentId = typeof input.agentId === 'string' && input.agentId !== '' ? input.agentId : null
  if (agentId && !agentSkillsRoot(agentId)) throw new LifecycleError(`That agent isn't here. ${NOTHING}`, 404)
  const loc = { ownerType: ctx.place.placeType, ownerId: ctx.place.placeId, workspaceId: null, taskId: null }
  // The site lists one agent's folder beside the place's; with none named, the agents' folders are left as recorded.
  const scan = await scanOnSite(loc, agentId ?? '', [])
  await recordScan(ctx.place, scan, { agentId, workspaceIds: [] })
  return { ...(await viewOf(db, actor, ctx)), truncated: scan.truncated, problems: scan.problems.map(p => ({ path: p.path, reason: p.reason })) }
}
