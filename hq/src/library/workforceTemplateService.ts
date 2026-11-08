/**
 * Team templates as Library assets (adr-0157): `team` assets whose pinned version holds `team.json`, each agent's
 * `agent.json` and the skills they carry. Applying one makes the agents, teams and projects a person chose on the review
 * page, each project with the template's task types and custom fields for it (spec D16). What it makes is its own
 * (adr-0072): each team, agent, type and field keeps a read-only link to the template version it came from, and each agent has the skills the template carries for it, installed when the template is
 * first used and granted rather than copied (D14, D23).
 *
 * ⚠ This file imports from wasp/server — do NOT import it in client code.
 *   Import types and utilities from workforceTemplateTypes instead.
 */
import { HttpError, prisma } from 'wasp/server'
import { formatAssetIdentity } from '@agenthix/core'
import { createAgent, deleteAgent } from '../agents/agentService'
import { INVALID_AGENT_HANDLE_MESSAGE, isValidAgentHandle } from '../agents/agentHandle'
import { createProject, deleteProject } from '../projects/projectService'
import { ensureBuiltInTaskTypes } from '../projects/taskTypes'
import { findProjectStorageSite, removeProjectStorageOnSite } from '../projects/projectStorageRemoval'
import { requireDefaultExecutionSiteId } from '../sites/localSite'
import { readTeamTemplate, type TeamTemplateFile } from '../assets/install/teamTemplateFile'
import { TemplateFileError } from '../assets/install/templateFiles'
import { installCarriedSkills } from '../assets/templates/carried'
import { templateAgentSettings } from '../assets/templates/templateSettings'
import { carriedSkillName, carriedSkills, findTemplate, listTemplates, templateFiles, type TemplateAsset } from '../assets/templates/templateAssets'
import type { PackageFile } from './packages/packageZip'
import { skillDescription, skillMdOf, skillTitle } from '../assets/skillFile'
import { addTypesAndFields, lockProjectTypes } from './taskTemplates/templateInstall'
import type { WorkforceTemplateContent, ApplicationSelections, AgentSkillSpec } from './workforceTemplateTypes'

export type {
  AgentSkillSpec, AgentSpec, TeamSpec, ProjectSpec, WorkforceTemplateContent,
  AgentSelection, TeamSelection, ProjectSelection, ApplicationSelections,
} from './workforceTemplateTypes'
export { suggestHandle, buildInitialSelections } from './workforceTemplateTypes'
import { handleProblems } from './workforceTemplateTypes'

export type TeamTemplateSummary = {
  /** The template's asset id. */
  id: string
  identity: string
  name: string
  description: string
  tags: string[]
  version: string
  publisher: string
}

type Read = { template: TemplateAsset; files: PackageFile[]; file: TeamTemplateFile }

async function readOne(template: TemplateAsset): Promise<Read> {
  const files = await templateFiles(prisma, template)
  return { template, files, file: readTeamTemplate(files) }
}

function summary({ template, file }: Read): TeamTemplateSummary {
  return {
    id: template.id, identity: formatAssetIdentity(template), name: file.name, description: file.description, tags: file.tags,
    version: template.currentVersion.version, publisher: template.publisher,
  }
}

export async function listTeamTemplates(): Promise<TeamTemplateSummary[]> {
  const out: TeamTemplateSummary[] = []
  for (const t of await listTemplates(prisma, 'TEAM')) {
    try {
      out.push(summary(await readOne(t)))
    } catch {
      continue
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** A team template by its asset id, identity or name; null when the Library has none that can be read. */
async function findTeamTemplate(ref: unknown): Promise<Read | null> {
  const template = await findTemplate(prisma, 'TEAM', ref)
  if (!template) return null
  try {
    return await readOne(template)
  } catch (err) {
    if (err instanceof TemplateFileError) return null
    throw err
  }
}

function skillSpec(files: PackageFile[], folder: string): AgentSkillSpec {
  const md = skillMdOf(files.filter(f => f.path.startsWith(`skills/${folder}/`)).map(f => ({ path: f.path.slice(`skills/${folder}/`.length), content: f.content })))
  return { slug: folder, name: skillTitle(md, folder), description: skillDescription(md) }
}

/** What the review page shows: the teams with their agents and the skills each brings, and the projects with their task types and fields. */
export function contentOf(files: PackageFile[], file: TeamTemplateFile): WorkforceTemplateContent {
  return {
    teams: file.teams.map(team => ({
      name: team.name,
      purpose: team.purpose,
      agents: team.agents.map(handle => {
        const a = file.agents[handle]
        return {
          handle, name: a.name, role: a.role, responsibilities: a.responsibilities, approval: a.approval,
          allowedTools: a.allowedTools as WorkforceTemplateContent['teams'][number]['agents'][number]['allowedTools'],
          allowedBashPatterns: a.allowedBashPatterns as WorkforceTemplateContent['teams'][number]['agents'][number]['allowedBashPatterns'],
          skills: a.skills.map(s => skillSpec(files, s)),
        }
      }),
    })),
    projects: file.projects.map(p => ({
      name: p.name, description: p.description || undefined, defaultAgentHandle: p.defaultAgentHandle ?? undefined,
      types: p.types.map(t => ({ name: t.name, icon: t.icon })),
      fields: p.fields.map(f => ({ name: f.name })),
    })),
  }
}

export type TeamTemplateView = TeamTemplateSummary & { content: WorkforceTemplateContent }

export async function getTeamTemplate(ref: unknown): Promise<TeamTemplateView | null> {
  const read = await findTeamTemplate(ref)
  return read && { ...summary(read), content: contentOf(read.files, read.file) }
}

export type ApplyResult = {
  agentCount: number
  teamCount: number
  projectCount: number
  /** Skills the template carries that the Library no longer holds; the agents are made without them. */
  missingSkills: string[]
}

/** Applies a team template named by its asset id, identity or name. */
export async function applyTeamTemplate(ref: unknown, selections: ApplicationSelections, createdById: string | null): Promise<ApplyResult> {
  const read = await findTeamTemplate(ref)
  if (!read) throw new HttpError(404, `Team template '${String(ref).slice(0, 100)}' not found`)
  // Checked before anything is installed: a handle the agents can't take refuses the whole template.
  const handles = selections.teams.flatMap(t => (t.include ? t.agents : []).filter(a => a.include).map(a => a.resolvedHandle))
  if (!handles.every(isValidAgentHandle)) throw new HttpError(400, `${INVALID_AGENT_HANDLE_MESSAGE}. Nothing was changed.`)
  // Also before anything is installed: a handle an agent already has, or two agents given the same one, is refused whole.
  const taken = new Set((await prisma.agent.findMany({ where: { handle: { in: handles } }, select: { handle: true } })).map(a => a.handle))
  const clashes = Object.values(handleProblems(selections, taken))
  if (clashes.length > 0) {
    const named = clashes.map(c => `@${c.handle} (${c.why})`)
    throw new HttpError(409, `These handles cannot be used: ${named.join(', ')}. Choose others. Nothing was changed.`)
  }
  await installCarriedSkills(prisma, read.template, read.files, createdById)
  return applyTemplate(read, selections, createdById)
}

/**
 * Creates every included agent, team and project, each project with its task types and fields.
 *
 * Atomicity (F-022): apply provisions across the database *and* the filesystem (project storage), so a single
 * transaction cannot cover it. Every entity created is recorded, and on any failure the records are undone in reverse
 * order through the delete helpers, which clean up both the row and its storage. Cleanup is best-effort: a failure
 * mid-rollback is swallowed so the original error still surfaces.
 */
async function applyTemplate({ template, files, file }: Read, selections: ApplicationSelections, createdById: string | null): Promise<ApplyResult> {
  const versionId = template.currentVersion.id
  const fromImage = template.currentVersion.source === 'BUILT_IN'
  const agentIdByResolvedHandle: Record<string, string> = {}
  const missing = new Set<string>()
  const created = { agents: [] as string[], teams: [] as string[], projects: [] as string[] }

  async function rollback() {
    for (const id of [...created.projects].reverse()) {
      // The site is read before the delete removes the row; the folder goes after it commits.
      const siteId = await findProjectStorageSite(id)
      await deleteProject(id).then(() => removeProjectStorageOnSite(id, siteId)).catch(() => {})
    }
    for (const id of [...created.teams].reverse()) await prisma.team.delete({ where: { id } }).catch(() => {})
    for (const id of [...created.agents].reverse()) await deleteAgent(id).catch(() => {})
  }

  // Resolved before anything is written: with no site connected, a template that includes projects is refused whole.
  const executionSiteId = selections.projects.some(p => p.include) ? await requireDefaultExecutionSiteId() : undefined

  try {
    for (const teamSel of selections.teams) {
      const team = file.teams.find(t => t.name === teamSel.name)
      if (!teamSel.include || !team) continue
      for (const agentSel of teamSel.agents) {
        const agent = team.agents.includes(agentSel.handle) ? file.agents[agentSel.handle] : undefined
        if (!agentSel.include || !agent) continue
        const chosen = agent.skills.filter(s => agentSel.skills.some(sel => sel.slug === s && sel.include))
        const skills = await carriedSkills(prisma, template, files, chosen.map(s => carriedSkillName(template, files, s)))
        skills.missing.forEach(m => missing.add(m))
        const made = await createAgent({
          name: agent.name,
          handle: agentSel.resolvedHandle,
          role: agent.role || undefined,
          responsibilities: agent.responsibilities || undefined,
          initialContent: { skillFiles: [] },
          settings: templateAgentSettings(agent, fromImage),
          createdById,
          madeFrom: { versionId, skillAssetIds: skills.assetIds },
        })
        created.agents.push(made.id)
        agentIdByResolvedHandle[agentSel.resolvedHandle] = made.id
      }
    }

    for (const teamSel of selections.teams) {
      const team = file.teams.find(t => t.name === teamSel.name)
      if (!teamSel.include || !team) continue
      const agentIds = teamSel.agents.filter(a => a.include).map(a => agentIdByResolvedHandle[a.resolvedHandle]).filter((id): id is string => !!id)
      const row = await prisma.team.create({
        data: { name: team.name, purpose: team.purpose, createdBy: createdById, madeFromVersionId: versionId, agents: { create: agentIds.map(agentId => ({ agentId })) } },
      })
      created.teams.push(row.id)
    }

    for (const projectSel of selections.projects) {
      const spec = file.projects.find(p => p.name === projectSel.name)
      if (!projectSel.include || !spec) continue
      const defaultAgentId = projectSel.defaultAgentHandle ? agentIdByResolvedHandle[projectSel.defaultAgentHandle] : undefined
      const project = await createProject({ name: spec.name, description: spec.description || undefined, defaultAgentId, executionSiteId, createdByUserId: createdById ?? undefined })
      created.projects.push(project.id)
      // Its types and fields go with the project, so they need no undo entry of their own.
      if (spec.types.length + spec.fields.length > 0) {
        await ensureBuiltInTaskTypes(project.id)
        await prisma.$transaction(async tx => {
          await lockProjectTypes(tx, project.id)
          await addTypesAndFields(tx, project.id, spec, versionId)
        })
      }
    }

    return { agentCount: created.agents.length, teamCount: created.teams.length, projectCount: created.projects.length, missingSkills: [...missing].sort() }
  } catch (err) {
    await rollback()
    throw err
  }
}
