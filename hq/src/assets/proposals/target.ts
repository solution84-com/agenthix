/**
 * The level a proposal aims at and the skill it edits, from hq's records (spec part 5 *Proposing*; D27): the
 * organisation's Library; the run's project; or the person's own space, which is always the run's person and never
 * anyone a tool argument names. A level's reviewers are the policy's: the Library's administrators and maintainers, a
 * project's administrators, the person for their own space.
 */
import type { PlaceSkill, ProposalAim } from '@prisma/client'
import { agentSkillsRoot, parseAssetIdentity, PLACE_SKILLS_ROOT } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import type { PolicyTarget } from '../policy'
import { libraryTarget, type LibrarySkill } from '../lifecycle/records'
import { placeOfProject, type PlaceContext } from '../places/place'
import { ProposalRefused } from './checks'
import type { AimArg } from './types'

const NOTHING = 'Nothing was changed.'

export type Aimed =
  | { aim: 'ORGANISATION'; placeId: null; target: PolicyTarget; asset: LibrarySkill | null }
  | { aim: 'PROJECT' | 'PERSON'; placeId: string; target: PolicyTarget; ctx: PlaceContext; placeSkill: PlaceSkill | null }

export const AIM_OF: Record<AimArg, ProposalAim> = { organisation: 'ORGANISATION', project: 'PROJECT', person: 'PERSON' }

/** The person's own space, as a project row. */
export async function yourSpaceOf(db: Db, userId: string): Promise<string | null> {
  const row = await db.project.findFirst({ where: { personalOwnerId: userId, personalSpace: true }, select: { id: true } })
  return row?.id ?? null
}

/** A Library skill by `publisher/name`, or by a bare name when exactly one skill has it. */
async function libraryAsset(db: Db, edits: string): Promise<LibrarySkill> {
  const identity = parseAssetIdentity(edits)
  const rows = await db.asset.findMany({
    where: { kind: 'SKILL', removedAt: null, ...(identity ? { publisher: identity.publisher, name: identity.name } : { name: edits }) },
    include: { currentVersion: true },
  })
  if (rows.length === 0) throw new ProposalRefused(`The Library has no skill ${edits}. Leave edits out to propose a new skill. ${NOTHING}`, 404)
  if (rows.length > 1) throw new ProposalRefused(`More than one Library skill is called ${edits}: name it as publisher/name. ${NOTHING}`)
  if (rows[0]!.builtIn) throw new ProposalRefused(`${edits} is built into HQ and isn't edited. Propose a new skill instead. ${NOTHING}`, 409)
  return rows[0]!
}

/** A place's skill by its folder's name: the place's own, or the calling agent's own folder there. */
async function placeSkill(db: Db, ctx: PlaceContext, edits: string, agentId: string): Promise<PlaceSkill> {
  const name = edits.slice(edits.lastIndexOf('/') + 1)
  const roots = [PLACE_SKILLS_ROOT, agentSkillsRoot(agentId)].filter((r): r is string => r !== null)
  const rows = await db.placeSkill.findMany({ where: { ...ctx.place, path: { in: roots.map(r => `${r}/${name}`) }, goneAt: null } })
  const row = rows.find(r => r.path.startsWith(PLACE_SKILLS_ROOT)) ?? rows[0]
  if (!row) throw new ProposalRefused(`This place has no skill ${name} that HQ has seen. Leave edits out to propose a new skill. ${NOTHING}`, 404)
  return row
}

export async function aimOf(
  db: Db, input: { aim: AimArg; edits: string | null; projectId: string | null; personId: string; agentId: string },
): Promise<Aimed> {
  if (input.aim === 'organisation') {
    return { aim: 'ORGANISATION', placeId: null, target: await libraryTarget(db), asset: input.edits ? await libraryAsset(db, input.edits) : null }
  }
  let projectId: string | null
  if (input.aim === 'person') {
    projectId = await yourSpaceOf(db, input.personId)
    if (!projectId) throw new ProposalRefused(`The person this run is for has no own space yet. Aim it at the project or the organisation. ${NOTHING}`, 409)
  } else {
    projectId = input.projectId
    const project = projectId ? await db.project.findUnique({ where: { id: projectId }, select: { personalSpace: true } }) : null
    if (!project || project.personalSpace) {
      throw new ProposalRefused(`This run isn't in a project. Aim it at person, for the person's own skills, or at organisation. ${NOTHING}`)
    }
  }
  const ctx = await placeOfProject(db, projectId)
  if (input.aim === 'project' && !(await db.projectMember.findFirst({ where: { projectId: ctx.projectId, userId: input.personId, role: { in: ['ADMIN', 'MEMBER'] } } }))) {
    throw new ProposalRefused(`The person this run is for only reads this project, so a skill can't be proposed for it. ${NOTHING}`, 403)
  }
  const aim = input.aim === 'person' ? 'PERSON' : 'PROJECT'
  const placeId = aim === 'PERSON' ? input.personId : ctx.projectId
  const skill = input.edits ? await placeSkill(db, ctx, input.edits, input.agentId) : null
  if (skill?.group === 'WORKSPACE') throw new ProposalRefused(`A repository's skills change by commits, not here. ${NOTHING}`, 409)
  return { aim, placeId, target: ctx.target, ctx, placeSkill: skill }
}

/** Who reviews at that level, in words for the agent and the card. */
export async function reviewersOf(db: Db, aimed: Pick<Aimed, 'aim' | 'placeId'>): Promise<string> {
  if (aimed.aim === 'ORGANISATION') return 'the organisation\'s administrators and Library maintainers'
  if (aimed.aim === 'PERSON') return 'the person themselves'
  const project = await db.project.findUnique({ where: { id: aimed.placeId! }, select: { name: true } })
  return `${project?.name ?? 'the project'}'s administrators`
}

/** The place a stored proposal aims at, again from hq's records. */
export async function placeOfProposal(db: Db, p: { aim: ProposalAim; placeId: string | null }): Promise<PlaceContext | null> {
  if (p.aim === 'ORGANISATION' || !p.placeId) return null
  const projectId = p.aim === 'PERSON' ? await yourSpaceOf(db, p.placeId) : p.placeId
  if (!projectId) throw new ProposalRefused(`That person's own space isn't there any more. ${NOTHING}`, 404)
  return placeOfProject(db, projectId)
}
