/**
 * Workforce Template Service (server-only)
 * =========================================
 *
 * Seed, query, and apply workforce templates.
 *
 * Templates are directory bundles in assets/library/workforce/<slug>/ and
 * seeded into the WorkforceTemplate table on startup. Each bundle contains
 * template.json (structure), agents/<handle>/agent.json (runtime config),
 * and a shared skills/ pool. readWorkforceContent() hydrates the full
 * AgentSpec tree from disk at query/apply time.
 *
 * Apply logic creates agents (with runtime config), teams, projects, and
 * boards based on caller-supplied selections (include flags + resolved handles).
 *
 * ⚠ This file imports from wasp/server — do NOT import it in client code.
 *   Import types and utilities from workforceTemplateTypes instead.
 */
import { prisma } from 'wasp/server'
import path from 'node:path'
import fs from 'node:fs/promises'
import { getHqAssetsRoot } from '../server/hqAssets'
import { builtIn } from './packages/builtIn'
import { itemDir } from './packages/itemDir'
import { createAgent, deleteAgent } from '../agents/agentService'
import { createProject, createBoard, deleteProject } from '../projects/projectService'
import { findProjectStorageSite, removeProjectStorageOnSite } from '../projects/projectStorageRemoval'
import { requireDefaultExecutionSiteId } from '../sites/localSite'
import { defaultAgentSettings, type AgentSettings } from '../packages/agentPackageService'
import type { PackageFileInput } from '../packages/packageStore'
import { coerceToolPermissions, coerceBashPatternPermissions } from '../agents/toolPermissions'

// Re-export everything from the client-safe types module so server code can
// import from a single place.
export type {
  AgentSkillSpec,
  AgentSpec,
  TeamSpec,
  BoardSpec,
  ProjectSpec,
  WorkforceTemplateContent,
  AgentSelection,
  TeamSelection,
  BoardSelection,
  ProjectSelection,
  ApplicationSelections,
} from './workforceTemplateTypes'
export { suggestHandle, buildInitialSelections } from './workforceTemplateTypes'

import type { WorkforceTemplateContent, ApplicationSelections, AgentSpec, AgentSkillSpec, ProjectSpec } from './workforceTemplateTypes'

// ── Seeding ──────────────────────────────────────────────────────────────────

export async function ensureWorkforceTemplates(): Promise<void> {
  const dir = path.join(getHqAssetsRoot(), 'library', 'workforce')
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    // Assets directory not present (e.g. test environment) — skip silently
    return
  }

  const templateDirs = await Promise.all(
    names.map(async (n) => {
      const stat = await fs.stat(path.join(dir, n)).catch(() => null)
      return stat?.isDirectory() ? n : null
    })
  ).then((results) => results.filter((n): n is string => n !== null))

  for (const slug of templateDirs) {
    const templateDir = path.join(dir, slug)
    let data: Record<string, any>
    try {
      const raw = await fs.readFile(path.join(templateDir, 'template.json'), 'utf-8')
      data = JSON.parse(raw)
    } catch {
      continue // skip dirs without a valid template.json
    }
    const { id, name, description = '', tags = [], version = 1 } = data
    const assetPath = `library/workforce/${slug}`

    const existing = await prisma.workforceTemplate.findUnique({ where: { id } })
    if (!existing) {
      await prisma.workforceTemplate.create({ data: { id, name, description, tags, assetPath, isSystem: true, version, ...builtIn(version) } })
    } else if (existing.version < version) {
      await prisma.workforceTemplate.update({ where: { id }, data: { name, description, tags, assetPath, version, ...builtIn(version) } })
    }
  }
}

/**
 * Read and hydrate a WorkforceTemplateContent from a bundle directory.
 * Reads template.json for structure, then loads each agent's config and skills from disk.
 * teams[].agents in template.json is string[] (handles); this expands them to AgentSpec[].
 */
export async function readWorkforceContent(template: { assetPath: string; isSystem: boolean }): Promise<WorkforceTemplateContent> {
  // A built-in template lives in hq's assets; one imported into the library, in hq's own storage.
  const templateDir = itemDir(template.assetPath, template.isSystem)
  const raw = await fs.readFile(path.join(templateDir, 'template.json'), 'utf-8')
  const { teams: teamSpecs, projects } = JSON.parse(raw) as {
    teams: Array<{ name: string; purpose: string; agents: string[] }>
    projects: ProjectSpec[]
  }

  const teams = await Promise.all(
    teamSpecs.map(async (teamSpec) => {
      const agents = await Promise.all(
        teamSpec.agents.map(async (handle) => {
          const agentDir = path.join(templateDir, 'agents', handle)
          const agentData = JSON.parse(
            await fs.readFile(path.join(agentDir, 'agent.json'), 'utf-8')
          ) as Record<string, any>

          const skills: AgentSkillSpec[] = await Promise.all(
            (agentData.skills ?? []).map(async (slug: string) => {
              const skillPath = path.join(templateDir, 'skills', slug, 'SKILL.md')
              const skillRaw = await fs.readFile(skillPath, 'utf-8')
              const fmMatch = skillRaw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
              let name = slug
              let description = ''
              let content = skillRaw
              if (fmMatch) {
                const fm = fmMatch[1]
                content = fmMatch[2]
                const nameMatch = fm.match(/^name:\s*(.+)$/m)
                const descMatch = fm.match(/^description:\s*(.+)$/m)
                if (nameMatch) name = nameMatch[1].trim()
                if (descMatch) description = descMatch[1].trim()
              }
              return { slug, name, description, content }
            })
          )

          return {
            handle,
            name: agentData.name,
            role: agentData.role,
            responsibilities: agentData.responsibilities,
            defaultModel: agentData.defaultModel,
            approval: agentData.approval,
            allowedTools: agentData.allowedTools,
            allowedBashPatterns: agentData.allowedBashPatterns,
            skills,
          } as AgentSpec
        })
      )
      return { name: teamSpec.name, purpose: teamSpec.purpose, agents }
    })
  )

  return { teams, projects }
}

// ── Apply ─────────────────────────────────────────────────────────────────────

export interface ApplyResult {
  agentCount: number
  teamCount: number
  projectCount: number
}

/**
 * Creates all included agents, teams, projects, and boards.
 *
 * Atomicity (F-022): apply provisions across the DB *and* the filesystem
 * (agent/project workspaces), so a single `prisma.$transaction` cannot cover
 * it — the helper functions interleave their own DB writes with filesystem
 * work and do not accept a transaction client. Instead this uses a
 * compensating-transaction pattern: every entity created is recorded, and on
 * any failure the records are undone in reverse order via the existing delete
 * helpers, which clean up both the DB row and its workspace directory.
 * Skills are part of an agent's package content now (5b.12), not a separate
 * disk write, so rollback deletes agents, teams and projects and there is no
 * skill directory left to separately clean up. A package keys on `Agent.id`
 * as a plain string, not a foreign key, so nothing cascades to it — but
 * deleteAgent removes the agent's package itself, in the same transaction as
 * the row, so rollback leaves none behind. Cleanup is
 * best-effort — a failure mid-rollback is swallowed so the original error
 * still surfaces — but in the normal case nothing DB-visible is left partly
 * created.
 */
export async function applyTemplate(
  template: WorkforceTemplateContent,
  selections: ApplicationSelections,
  createdById: string | null,
): Promise<ApplyResult> {
  const agentIdByResolvedHandle: Record<string, string> = {}
  let agentCount = 0
  let teamCount = 0
  let projectCount = 0

  // Undo log — populated as we go, replayed in reverse on failure.
  const createdAgentIds: string[] = []
  const createdTeamIds: string[] = []
  const createdProjectIds: string[] = []

  async function rollback() {
    // Reverse order: projects (cascade their boards) → teams → agents.
    for (const id of [...createdProjectIds].reverse()) {
      // The site is read before the delete removes the row; the folder goes after it commits.
      const siteId = await findProjectStorageSite(id)
      await deleteProject(id).then(() => removeProjectStorageOnSite(id, siteId)).catch(() => {})
    }
    for (const id of [...createdTeamIds].reverse()) {
      await prisma.team.delete({ where: { id } }).catch(() => {})
    }
    for (const id of [...createdAgentIds].reverse()) {
      await deleteAgent(id).catch(() => {})
    }
  }

  // Resolved before anything is written: with no site connected, a template
  // that includes projects is refused whole rather than half-applied. A
  // template with no projects needs no site.
  const executionSiteId = selections.projects.some((p) => p.include)
    ? await requireDefaultExecutionSiteId()
    : undefined

  try {
    // Step 1 — agents (must be created before teams reference their IDs)
    for (const teamSel of selections.teams) {
      if (!teamSel.include) continue
      const teamSpec = template.teams.find((t) => t.name === teamSel.name)
      if (!teamSpec) continue

      for (const agentSel of teamSel.agents) {
        if (!agentSel.include) continue
        const agentSpec = teamSpec.agents.find((a) => a.handle === agentSel.handle)
        if (!agentSpec) continue

        const skillFiles: PackageFileInput[] = []
        for (const skillSel of agentSel.skills) {
          if (!skillSel.include) continue
          const skillSpec = agentSpec.skills?.find((s) => s.slug === skillSel.slug)
          if (!skillSpec) continue
          const frontmatter = `---\nname: ${skillSpec.name}\ndescription: ${skillSpec.description}\n---\n\n`
          skillFiles.push({ path: `skills/${skillSel.slug}/SKILL.md`, content: Buffer.from(frontmatter + skillSpec.content, 'utf-8') })
        }

        const base = defaultAgentSettings(agentSpec.defaultModel)
        const settings: AgentSettings = agentSpec.approval || agentSpec.allowedTools
          ? {
              ...base,
              approval: agentSpec.approval ?? 'deferred',
              permissions: {
                tools: agentSpec.allowedTools ? coerceToolPermissions(agentSpec.allowedTools) : null,
                bashPatterns: agentSpec.allowedBashPatterns ? coerceBashPatternPermissions(agentSpec.allowedBashPatterns) : null,
              },
            }
          : base

        const agent = await createAgent({
          name: agentSpec.name,
          handle: agentSel.resolvedHandle,
          role: agentSpec.role,
          responsibilities: agentSpec.responsibilities,
          initialContent: { skillFiles },
          settings,
          createdById,
        })
        createdAgentIds.push(agent.id)
        agentIdByResolvedHandle[agentSel.resolvedHandle] = agent.id
        agentCount++
      }
    }

    // Step 2 — teams
    for (const teamSel of selections.teams) {
      if (!teamSel.include) continue
      const teamSpec = template.teams.find((t) => t.name === teamSel.name)
      if (!teamSpec) continue

      const agentIds = teamSel.agents
        .filter((a) => a.include)
        .map((a) => agentIdByResolvedHandle[a.resolvedHandle])
        .filter((id): id is string => !!id)

      const team = await prisma.team.create({
        data: { name: teamSpec.name, purpose: teamSpec.purpose, createdBy: createdById, agents: { create: agentIds.map((agentId) => ({ agentId })) } },
      })
      createdTeamIds.push(team.id)
      teamCount++
    }

    // Step 3 — projects + boards
    for (const projectSel of selections.projects) {
      if (!projectSel.include) continue
      const projectSpec = template.projects.find((p) => p.name === projectSel.name)
      if (!projectSpec) continue

      const defaultAgentId = projectSel.defaultAgentHandle
        ? agentIdByResolvedHandle[projectSel.defaultAgentHandle]
        : undefined

      const project = await createProject({
        name: projectSpec.name,
        description: projectSpec.description,
        defaultAgentId,
        executionSiteId,
      })
      createdProjectIds.push(project.id)
      projectCount++

      for (const boardSel of projectSel.boards) {
        if (!boardSel.include) continue
        const boardSpec = projectSpec.boards.find((b) => b.name === boardSel.name)
        if (!boardSpec) continue

        // Look up the board template's columns so the board is created with the
        // correct column configuration (createBoard does not do this itself).
        let resolvedColumns: any[] | undefined
        let resolvedTemplateId: string | undefined = boardSpec.templateId
        if (boardSpec.templateId) {
          const tpl = await prisma.boardTemplate.findUnique({ where: { id: boardSpec.templateId } })
          if (tpl) {
            const { readBoardColumns } = await import('./boardTemplateService')
            resolvedColumns = await readBoardColumns(tpl.assetPath, tpl.isSystem)
          } else {
            resolvedTemplateId = undefined
          }
        }

        // Boards are cleaned up with their project (deleteProject cascades
        // boards), so they need no separate undo-log entry.
        await createBoard({
          projectId: project.id,
          name: boardSpec.name,
          templateId: resolvedTemplateId,
          columns: resolvedColumns,
        })
      }
    }

    return { agentCount, teamCount, projectCount }
  } catch (err) {
    await rollback()
    throw err
  }
}
