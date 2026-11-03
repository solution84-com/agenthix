/**
 * Agent templates as Library assets (adr-0157): listed from the organisation's installed `agent` assets, and applied
 * by making an agent from the pinned version. The agent is its own definition from then on (adr-0072): it takes the
 * template's instructions and settings, keeps a read-only link to the version it was made from, and has the skills
 * the template carries, granted as installed skills rather than copied into it (D23).
 *
 * ⚠ This file imports from wasp/server — do NOT import it in client code.
 */
import { HttpError, prisma } from 'wasp/server'
import { formatAssetIdentity } from '@agenthix/core'
import { createAgent } from '../agents/agentService'
import { agentInstructions, readAgentTemplate, TemplateFileError, type AgentTemplateFile } from '../assets/install/templateFiles'
import { carriedSkills, findTemplate, listTemplates, templateFiles } from '../assets/templates/templateAssets'
import { installCarriedSkills } from '../assets/templates/carried'
import { templateAgentSettings } from '../assets/templates/templateSettings'

export type AgentTemplateSummary = {
  id: string
  /** The template's name in its identity, e.g. `project-manager`. */
  slug: string
  identity: string
  name: string
  handle: string
  description: string
  version: string
  publisher: string
}

export async function listAgentTemplates(): Promise<AgentTemplateSummary[]> {
  const out: AgentTemplateSummary[] = []
  for (const t of await listTemplates(prisma, 'AGENT')) {
    let file: AgentTemplateFile
    try {
      file = readAgentTemplate(await templateFiles(prisma, t))
    } catch {
      continue
    }
    out.push({
      id: t.id, slug: t.name, identity: formatAssetIdentity(t), name: file.name, handle: file.handle,
      description: file.role ?? '', version: t.currentVersion.version, publisher: t.publisher,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export type ApplyAgentTemplateResult = {
  id: string
  handle: string
  /** Skills the template carries that the Library no longer holds; the agent is made without them. */
  missingSkills: string[]
}

/** Makes an agent from a template named by its asset id, identity or name (`templateAssets.findTemplate`). */
export async function applyAgentTemplate(
  ref: string,
  handle: string,
  createdById: string | null,
): Promise<ApplyAgentTemplateResult> {
  const template = await findTemplate(prisma, 'AGENT', ref)
  if (!template) throw new HttpError(404, `Agent template '${String(ref).slice(0, 100)}' not found`)
  const files = await templateFiles(prisma, template)
  let file: AgentTemplateFile
  let instructions: string
  try {
    file = readAgentTemplate(files)
    instructions = agentInstructions(files)
  } catch (err) {
    if (err instanceof TemplateFileError) throw new HttpError(409, `${formatAssetIdentity(template)} can't make an agent: ${err.message} Nothing was changed.`)
    throw err
  }
  await installCarriedSkills(prisma, template, files, createdById)
  const skills = await carriedSkills(prisma, template, files)
  const agent = await createAgent({
    name: file.name,
    handle,
    role: file.role ?? undefined,
    initialContent: { instructions, skillFiles: [] },
    settings: templateAgentSettings(file, template.currentVersion.source === 'BUILT_IN'),
    createdById,
    madeFrom: { versionId: template.currentVersion.id, skillAssetIds: skills.assetIds },
  })
  return { id: agent.id, handle: agent.handle, missingSkills: skills.missing }
}
