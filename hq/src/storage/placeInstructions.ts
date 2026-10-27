/**
 * What an agent is told in a place (every screen reviewed spec §3, "Each place
 * has its own instructions"): the organisation's — the agent's own package —
 * then the place's for every agent (`AGENTS.md` and `.agents/skills/`) and the
 * place's for this agent (`.agents/agents/<agentId>/instructions.md` and its
 * `skills/`), read from the place's Files on its site.
 *
 * A project's place is the project's storage; anywhere else it is the caller's
 * own. The owner is decided here from the project or the caller and nothing
 * else, so a person's instructions can never be read into a project. A personal
 * project is its person's own storage, as its runs are (agents own schedule
 * spec §4), and only its person can see it.
 *
 * The files are read through the location read path every Files read uses
 * (`locationFileStore.ts`), whose containment the site applies: real paths
 * checked on both sides, a link that leaves the place refused. A file is
 * stat'd before it is read so an oversized one is never streamed.
 */
import type { GetPlaceInstructions } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { LocationFileError, PACKAGE_KEY_PATTERN, type LocationRef, type StorageOwnerType } from '@agenthix/core'
import { requireProjectVisible } from '../projects/resourceEntitlement'
import { readAgentContent } from '../packages/agentPackageService'
import { listFilesOnSite, readFileOnSite, statFileOnSite } from './locationFileStore'
import { rethrowLocationFileErrorAsHttp } from './httpErrors'

/** The largest instructions file shown; a larger one is named, not read. */
export const INSTRUCTIONS_MAX_BYTES = 1_000_000

export const PLACE_INSTRUCTIONS_FILE = 'AGENTS.md'
export const SHARED_SKILLS_DIR = '.agents/skills'
export const agentInstructionsPath = (agentId: string) => `.agents/agents/${agentId}/instructions.md`
export const agentSkillsDir = (agentId: string) => `.agents/agents/${agentId}/skills`

export type InstructionFile = {
  /** Relative to the place's Files, for opening it there. */
  path: string
  /** Null when there is no such file, or it is too large to show. */
  text: string | null
  modifiedAt: string | null
  tooLarge: boolean
}

export type PlaceInstructionsView = {
  place: { kind: 'project' | 'personal'; ownerType: StorageOwnerType; ownerId: string }
  /** The agent's own instructions, the same everywhere; null when no agent was asked for. */
  organisation: { instructions: string } | null
  everyAgent: { file: InstructionFile; skills: string[] }
  forAgent: { file: InstructionFile; skills: string[] } | null
}

type Owner = Pick<LocationRef, 'ownerType' | 'ownerId'>

async function readInstructionFile(owner: Owner, relPath: string): Promise<InstructionFile> {
  const loc: LocationRef = { ...owner, workspaceId: null, taskId: null }
  try {
    const stat = await statFileOnSite(loc, relPath)
    if (stat.kind !== 'file') return { path: relPath, text: null, modifiedAt: null, tooLarge: false }
    if (stat.size > INSTRUCTIONS_MAX_BYTES) return { path: relPath, text: null, modifiedAt: stat.modifiedAt, tooLarge: true }
    const bytes = await readFileOnSite(loc, relPath)
    return { path: relPath, text: bytes.toString('utf8'), modifiedAt: stat.modifiedAt, tooLarge: false }
  } catch (err) {
    if (err instanceof LocationFileError && err.code === 'not_found') return { path: relPath, text: null, modifiedAt: null, tooLarge: false }
    throw err
  }
}

async function skillNames(owner: Owner, dir: string): Promise<string[]> {
  const { entries } = await listFilesOnSite({ ...owner, workspaceId: null, taskId: null }, dir)
  return entries.filter(e => e.kind === 'directory').map(e => e.name)
}

/** Reads one place's instructions. The caller has already decided the owner and checked the person may see it. */
export async function readPlaceInstructions(owner: Owner, agentId: string | null): Promise<Omit<PlaceInstructionsView, 'place' | 'organisation'>> {
  if (agentId !== null && !PACKAGE_KEY_PATTERN.test(agentId)) throw new HttpError(400, 'Not an agent id')
  const [file, skills, forAgent] = await Promise.all([
    readInstructionFile(owner, PLACE_INSTRUCTIONS_FILE),
    skillNames(owner, SHARED_SKILLS_DIR),
    agentId === null
      ? Promise.resolve(null)
      : Promise.all([readInstructionFile(owner, agentInstructionsPath(agentId)), skillNames(owner, agentSkillsDir(agentId))])
        .then(([agentFile, agentSkills]) => ({ file: agentFile, skills: agentSkills })),
  ])
  return { everyAgent: { file, skills }, forAgent }
}

/** The place a read is about: the project's storage, or the caller's own. */
export async function placeOwner(projectId: string | null | undefined, userId: string): Promise<PlaceInstructionsView['place']> {
  if (!projectId) return { kind: 'personal', ownerType: 'user', ownerId: userId }
  await requireProjectVisible(projectId, userId)
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { personalOwnerId: true, personalSpace: true } })
  // Visible means it is the caller's own; Your space is their own storage, any other personal project has its own.
  if (project.personalOwnerId && project.personalSpace) return { kind: 'personal', ownerType: 'user', ownerId: project.personalOwnerId }
  return { kind: 'project', ownerType: 'project', ownerId: projectId }
}

type Args = { projectId?: string | null; agentId?: string | null }

export const getPlaceInstructions: GetPlaceInstructions<Args, PlaceInstructionsView> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const agentId = args?.agentId ?? null
  if (agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } })
    if (!agent) throw new HttpError(404, 'Agent not found')
  }
  const place = await placeOwner(args?.projectId, context.user.id)
  const organisation = agentId ? { instructions: (await readAgentContent(agentId))?.instructions ?? '' } : null
  try {
    return { place, organisation, ...(await readPlaceInstructions(place, agentId)) }
  } catch (err) {
    rethrowLocationFileErrorAsHttp(err)
  }
}
