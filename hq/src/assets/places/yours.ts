/**
 * A person's own skills that follow them (spec part 4 *The person's skills*, D15, D16; board P2): on Your space's Skills
 * page, which of them follow the person and where a project's own skill of the same name wins; on a project's page, the
 * person's private group of those that apply in their conversations there. Only the person's own rows are ever read,
 * and only a project they are in is looked at. Whether they leave Your space at all is the organisation's setting.
 */
import { HttpError, prisma } from 'wasp/server'
import { skillKey } from '../delivery/clashOrder'
import { assertSees, placeOfProject } from './place'
import { switchState } from './switchState'

type Ctx = { user?: { id: string } | null }

export type YourSkill = {
  id: string
  /** The skill's name as the last scan read it, or its folder's. */
  name: string
  path: string
  agentName: string | null
  /** The version the person published, which is the one that follows them; null when none. */
  version: number | null
  /** Whether it follows the person outside Your space: published, switched on, and the organisation allows it. */
  follows: boolean
  /** The projects (or, inside one, this project) whose own skill of the same name is used instead. */
  setAsideIn: string[]
}

export type YoursView = {
  /** The organisation's *Personal skills outside Your space* setting. */
  outsideYourSpace: boolean
  /** In a project: the person's skills that apply there. In Your space: every skill of Your space that follows. */
  skills: YourSkill[]
}

type OwnRow = { id: string; name: string; path: string; agentName: string | null; version: number | null; on: boolean }
type ProjectSkill = { key: string; project: string }

/** Pure: which of the person's skills follow them, and where a place's own skill of the same name wins. */
export function yoursOf(own: OwnRow[], theirs: ProjectSkill[], outside: boolean, here: string | null): YourSkill[] {
  return own.map((row) => {
    const key = skillKey({ name: row.name, path: row.path })
    const clash = theirs.filter((t) => t.key === key && (here === null || t.project === here)).map((t) => t.project)
    return {
      id: row.id, name: row.name || (row.path.split('/').pop() ?? row.path), path: row.path, agentName: row.agentName,
      version: row.version, follows: outside && row.version !== null && row.on, setAsideIn: [...new Set(clash)].sort(),
    }
  })
}

export const getYourSkillsHere = async (args: unknown, context: Ctx): Promise<YoursView> => {
  if (!context.user) throw new HttpError(401)
  const userId = context.user.id
  const projectId = args && typeof args === 'object' ? (args as { projectId?: unknown }).projectId : undefined
  const ctx = await placeOfProject(prisma, projectId).catch(() => { throw new HttpError(404, "That place isn't there, or isn't yours to see. Nothing was changed.") })
  await assertSees(userId, ctx).catch(() => { throw new HttpError(404, "That place isn't there, or isn't yours to see. Nothing was changed.") })
  const inSpace = ctx.place.placeType === 'user'
  const org = await prisma.org.findFirst({ select: { fileSkillsDefault: true, personalSkillsOutsideSpace: true } })
  const outside = org?.personalSkillsOutsideSpace ?? true
  const space = await prisma.project.findFirst({ where: { personalOwnerId: userId, personalSpace: true }, select: { fileSkillsDefault: true } })
  const rows = await prisma.placeSkill.findMany({
    where: { placeType: 'user', placeId: userId, goneAt: null, OR: [{ group: 'PLACE' }, { group: 'AGENT' }] },
    include: { versions: { orderBy: { number: 'desc' }, take: 1, select: { number: true, digest: true } } },
    orderBy: { path: 'asc' },
  })
  const agents = await prisma.agent.findMany({ where: { id: { in: rows.flatMap((r) => (r.agentId ? [r.agentId] : [])) } }, select: { id: true, name: true } })
  const own: OwnRow[] = rows.map((r) => {
    const published = r.versions[0] ?? null
    return {
      id: r.id, name: r.name, path: r.path, agentName: agents.find((a) => a.id === r.agentId)?.name ?? null,
      version: published?.number ?? null,
      // Only the published version leaves Your space, so the switch is judged against it (security review H4).
      on: published ? switchState({ switch: r.switch, switchFingerprint: r.switchFingerprint, lastFingerprint: published.digest }, space?.fileSkillsDefault ?? null, org?.fileSkillsDefault ?? 'OFF') === 'on' : false,
    }
  })
  // The project skills that win over a person's: those on, in places the person is in.
  const places = inSpace
    ? await prisma.project.findMany({ where: { personalOwnerId: null, members: { some: { userId } } }, select: { id: true, name: true, fileSkillsDefault: true } })
    : [{ id: ctx.projectId, name: (await prisma.project.findUnique({ where: { id: ctx.projectId }, select: { name: true } }))?.name ?? '', fileSkillsDefault: ctx.placeDefault }]
  const placeSkills = await prisma.placeSkill.findMany({
    where: { placeType: 'project', placeId: { in: places.map((p) => p.id) }, goneAt: null, group: { in: ['PLACE', 'AGENT'] } },
    select: { placeId: true, name: true, path: true, switch: true, switchFingerprint: true, lastFingerprint: true },
  })
  const theirs: ProjectSkill[] = placeSkills.flatMap((s) => {
    const p = places.find((x) => x.id === s.placeId)
    if (!p || switchState(s, p.fileSkillsDefault, org?.fileSkillsDefault ?? 'OFF') !== 'on') return []
    return [{ key: skillKey({ name: s.name, path: s.path }), project: p.name }]
  })
  const skills = yoursOf(own, theirs, outside, inSpace ? null : places[0]?.name ?? null)
  // Inside a project: the group lists what applies there, set aside or not; nothing when they stay home.
  return { outsideYourSpace: outside, skills: inSpace ? skills : outside ? skills.filter((s) => s.follows) : [] }
}
