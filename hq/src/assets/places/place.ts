/**
 * Which place a request about skills in files is about, and who may act there (spec part 4 *Who acts on a place's
 * skills*, D27, D32). A place is named by its project, Your space by its personal project; its files are the project's
 * storage, or the person's own for Your space (`placeStorageOf`). The policy's target is the project, or the person for
 * a personal project: its owner does everything there and nobody else does. An organisation administrator who isn't
 * in the project neither sees nor acts on its skills; they govern through the organisation's default.
 */
import type { FileSkillsDefault, PlaceSkill } from '@prisma/client'
import type { LocationRef } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { placeStorageOf } from '../../projects/personalProject'
import { isProjectMember } from '../../projects/membership'
import { assertMay, type Actor, type AssetAction, type PolicyTarget } from '../policy'
import { LifecycleError } from '../lifecycle/errors'
import type { Place } from './scan'

const NOTHING = 'Nothing was changed.'

export type PlaceContext = {
  projectId: string
  place: Place
  target: PolicyTarget
  /** The place's own default (C1b), as set; null follows the organisation's. */
  placeDefault: FileSkillsDefault | null
  orgDefault: FileSkillsDefault
}

const PROJECT_SELECT = { id: true, personalOwnerId: true, personalSpace: true, fileSkillsDefault: true } as const
type ProjectRow = { id: string; personalOwnerId: string | null; personalSpace: boolean; fileSkillsDefault: FileSkillsDefault | null }

async function contextOf(db: Db, project: ProjectRow): Promise<PlaceContext> {
  const storage = placeStorageOf(project)
  const org = await db.org.findFirst({ select: { fileSkillsDefault: true } })
  return {
    projectId: project.id,
    place: { placeType: storage.ownerType, placeId: storage.ownerId },
    target: project.personalOwnerId ? { level: 'person', userId: project.personalOwnerId } : { level: 'project', projectId: project.id },
    placeDefault: project.fileSkillsDefault,
    orgDefault: org?.fileSkillsDefault ?? 'OFF',
  }
}

const notFound = () => new LifecycleError(`That place isn't there, or isn't yours to see. ${NOTHING}`, 404)

export async function placeOfProject(db: Db, projectId: unknown): Promise<PlaceContext> {
  const project = typeof projectId === 'string' && projectId !== ''
    ? await db.project.findUnique({ where: { id: projectId }, select: PROJECT_SELECT })
    : null
  if (!project) throw notFound()
  return contextOf(db, project)
}

/** A place skill and its place. A row of a person's own storage belongs to their Your space. */
export async function placeOfSkill(db: Db, placeSkillId: unknown): Promise<{ ctx: PlaceContext; skill: PlaceSkill }> {
  const skill = typeof placeSkillId === 'string' ? await db.placeSkill.findUnique({ where: { id: placeSkillId } }) : null
  if (!skill) throw new LifecycleError(`That skill isn't in this place. ${NOTHING}`, 404)
  const project = skill.placeType === 'project'
    ? await db.project.findUnique({ where: { id: skill.placeId }, select: PROJECT_SELECT })
    : await db.project.findFirst({ where: { personalOwnerId: skill.placeId, personalSpace: true }, select: PROJECT_SELECT })
  if (!project) throw notFound()
  return { ctx: await contextOf(db, project), skill }
}

/** Reading a place's skills: its members, Viewers included, or the person for their own. */
export async function assertSees(userId: string, ctx: PlaceContext): Promise<void> {
  if (!(await isProjectMember(ctx.projectId, userId))) throw notFound()
}

export function assertPlace(actor: Actor, action: AssetAction, ctx: PlaceContext): void {
  assertMay(actor, action, ctx.target)
}

/** Where a place skill's folder is: the place's files for its own and its agents' skills, the workspace for a repository's. */
export function folderOf(ctx: PlaceContext, skill: Pick<PlaceSkill, 'group' | 'path' | 'workspaceId'>): { loc: LocationRef; dir: string } {
  const owner = { ownerType: ctx.place.placeType, ownerId: ctx.place.placeId, taskId: null }
  if (skill.group !== 'WORKSPACE') return { loc: { ...owner, workspaceId: null }, dir: skill.path }
  const prefix = `workspace/${skill.workspaceId}/`
  if (!skill.workspaceId || !skill.path.startsWith(prefix)) throw new LifecycleError(`That skill's folder can't be found. ${NOTHING}`, 404)
  return { loc: { ...owner, workspaceId: skill.workspaceId }, dir: skill.path.slice(prefix.length) }
}

export function assertNotWorkspace(skill: Pick<PlaceSkill, 'group'>, what: string): void {
  if (skill.group === 'WORKSPACE') {
    throw new LifecycleError(`${what} isn't done in HQ for a repository's skill: the repository decides what it holds, and its versions are its commits. Switch it off instead. ${NOTHING}`, 409)
  }
}
