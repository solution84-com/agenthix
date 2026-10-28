/**
 * A place's default and each skill's switch (spec part 4 *Defaults and switches*, C1b and C2; D13; security review
 * H3, L3). A switch is set for the fingerprint the person looked at and holds only while the files keep it
 * (`switchState.ts`). Switching one on reads every file of the skill from the site, checks they are still what the
 * person looked at, and returns them for the screen to show, scripts and references included. *All on* and *All off*
 * switch each skill of the page or one group whose fingerprint is still the one shown; any other is left as it was and
 * named. The place's default may be set to anything; only a stricter one than the organisation's applies (adr-0072).
 */
import type { FileSkillsDefault, PlaceSkill, PlaceSkillGroup, PrismaClient } from '@prisma/client'
import type { Actor } from '../policy'
import { fingerprintOf } from '../content'
import { LifecycleError } from '../lifecycle/errors'
import { assertPlace, folderOf, placeOfProject, placeOfSkill, type PlaceContext } from './place'
import { readSkillFolder } from './siteSkills'
import { effectiveDefault, switchState } from './switchState'

const NOTHING = 'Nothing was changed.'
const DEFAULTS: readonly FileSkillsDefault[] = ['ON', 'OFF', 'NEVER']

export type PlaceDefaults = { placeDefault: FileSkillsDefault | null; orgDefault: FileSkillsDefault; effective: FileSkillsDefault }

export const defaultsOf = (ctx: PlaceContext): PlaceDefaults =>
  ({ placeDefault: ctx.placeDefault, orgDefault: ctx.orgDefault, effective: effectiveDefault(ctx.placeDefault, ctx.orgDefault) })

/** C1b. Null follows the organisation's. Returns what applies now. */
export async function setPlaceDefault(db: PrismaClient, actor: Actor, input: { projectId: unknown; value: unknown }): Promise<PlaceDefaults> {
  const ctx = await placeOfProject(db, input.projectId)
  assertPlace(actor, 'settings', ctx)
  const value = input.value === null ? null : DEFAULTS.find(d => d === input.value)
  if (value === undefined) throw new LifecycleError(`Choose On by default, Off by default, Never, or the organisation's. ${NOTHING}`)
  await db.project.update({ where: { id: ctx.projectId }, data: { fileSkillsDefault: value } })
  return defaultsOf({ ...ctx, placeDefault: value })
}

export type SkillFile = { path: string; base64: string }
export type SwitchResult = { state: 'on' | 'off'; files: SkillFile[] }

function assertSwitchable(skill: PlaceSkill, fingerprint: unknown): string {
  if (skill.goneAt) throw new LifecycleError(`That skill's folder is no longer in the place's files. ${NOTHING}`, 409)
  if (typeof fingerprint !== 'string' || fingerprint !== skill.lastFingerprint) {
    throw new LifecycleError(`The skill changed since you looked at it. Look at it again before switching it. ${NOTHING}`, 409)
  }
  return fingerprint
}

/** C2: one skill on or off, for the fingerprint the person looked at. */
export async function switchSkill(db: PrismaClient, actor: Actor, input: { placeSkillId: unknown; on: unknown; fingerprint: unknown }): Promise<SwitchResult> {
  const { ctx, skill } = await placeOfSkill(db, input.placeSkillId)
  assertPlace(actor, 'settings', ctx)
  const fingerprint = assertSwitchable(skill, input.fingerprint)
  const on = input.on === true
  let files: SkillFile[] = []
  if (on) {
    if (effectiveDefault(ctx.placeDefault, ctx.orgDefault) === 'NEVER') {
      throw new LifecycleError(`Skills found in files don't run here: the default is Never. Change the default first. ${NOTHING}`, 409)
    }
    const { loc, dir } = folderOf(ctx, skill)
    const read = await readSkillFolder(loc, dir)
    if (fingerprintOf(read) !== fingerprint) {
      throw new LifecycleError(`The skill's files changed since the place was last looked at. Look at the place again before switching it on. ${NOTHING}`, 409)
    }
    files = read.map(f => ({ path: f.path, base64: f.content.toString('base64') }))
  }
  const updated = await recordSwitch(db, skill.id, fingerprint, on, actorId(actor))
  if (!updated) throw new LifecycleError(`The skill changed as you switched it. Look at it again. ${NOTHING}`, 409)
  return { state: switchState({ ...skill, switch: on ? 'ON' : 'OFF', switchFingerprint: fingerprint }, ctx.placeDefault, ctx.orgDefault), files }
}

async function recordSwitch(db: PrismaClient, id: string, fingerprint: string, on: boolean, byId: string): Promise<boolean> {
  const { count } = await db.placeSkill.updateMany({
    where: { id, lastFingerprint: fingerprint, goneAt: null },
    data: { switch: on ? 'ON' : 'OFF', switchFingerprint: fingerprint, switchedById: byId, switchedAt: new Date() },
  })
  return count === 1
}

const actorId = (actor: Actor) => (actor.kind === 'person' ? actor.userId : actor.forUserId ?? actor.agentId)

const GROUPS: Record<string, PlaceSkillGroup> = { place: 'PLACE', agent: 'AGENT', workspace: 'WORKSPACE' }

export type SwitchAllInput = {
  projectId: unknown
  on: unknown
  /** The fingerprint the screen showed for each skill, by place skill id. */
  seen: unknown
  /** One group of the page; absent for the whole page. */
  group?: unknown
  agentId?: unknown
  workspaceId?: unknown
}

/** *All on* / *All off*. Returns the skills switched and those left because they changed since they were shown. */
export async function switchAll(db: PrismaClient, actor: Actor, input: SwitchAllInput): Promise<{ switched: string[]; changed: string[] }> {
  const ctx = await placeOfProject(db, input.projectId)
  assertPlace(actor, 'settings', ctx)
  const on = input.on === true
  if (on && effectiveDefault(ctx.placeDefault, ctx.orgDefault) === 'NEVER') {
    throw new LifecycleError(`Skills found in files don't run here: the default is Never. Change the default first. ${NOTHING}`, 409)
  }
  const seen = input.seen && typeof input.seen === 'object' ? (input.seen as Record<string, unknown>) : {}
  const group = input.group === undefined ? undefined : GROUPS[String(input.group)]
  if (input.group !== undefined && !group) throw new LifecycleError(`Choose the place's, an agent's or a workspace's skills. ${NOTHING}`)
  const rows = await db.placeSkill.findMany({
    where: {
      ...ctx.place, goneAt: null, id: { in: Object.keys(seen) },
      ...(group ? { group } : {}),
      ...(group === 'AGENT' && typeof input.agentId === 'string' ? { agentId: input.agentId } : {}),
      ...(group === 'WORKSPACE' && typeof input.workspaceId === 'string' ? { workspaceId: input.workspaceId } : {}),
    },
  })
  const switched: string[] = []
  const changed: string[] = []
  for (const row of rows) {
    const fingerprint = seen[row.id]
    const ok = typeof fingerprint === 'string' && fingerprint === row.lastFingerprint
      && await recordSwitch(db, row.id, fingerprint, on, actorId(actor))
    ;(ok ? switched : changed).push(row.id)
  }
  return { switched, changed }
}
