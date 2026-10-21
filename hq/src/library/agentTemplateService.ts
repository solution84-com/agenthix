/**
 * Agent Template Service (server-only)
 * =====================================
 *
 * Seed, query, and apply agent templates.
 *
 * Templates are authored as directories in assets/library/agents/<slug>/ and
 * seeded into the AgentTemplate table on startup. Only metadata + assetPath
 * is stored in the DB — all file content is read from disk at apply time.
 *
 * Apply logic creates a fully configured agent: DB record, workspace, identity
 * files, and active skills.
 *
 * ⚠ This file imports from wasp/server — do NOT import it in client code.
 */
import { prisma } from 'wasp/server'
import path from 'node:path'
import fs from 'node:fs/promises'
import { getHqAssetsRoot } from '../server/hqAssets'
import { builtIn } from './packages/builtIn'
import { itemDir } from './packages/itemDir'
import { readAssetContent } from '../packages/agentAssets'
import { defaultAgentSettings, type AgentSettings } from '../packages/agentPackageService'
import { createAgent } from '../agents/agentService'
import { coerceToolPermissions, coerceBashPatternPermissions } from '../agents/toolPermissions'

// ── Seeding ──────────────────────────────────────────────────────────────────

export async function ensureAgentTemplates(): Promise<void> {
  const dir = path.join(getHqAssetsRoot(), 'library', 'agents')
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    // Assets directory not present (e.g. test environment) — skip silently
    return
  }

  // Skip the blank "template" directory — it is a scaffold, not a role
  const agentDirs = await Promise.all(
    names
      .filter((n) => n !== 'template')
      .map(async (n) => {
        const stat = await fs.stat(path.join(dir, n)).catch(() => null)
        return stat?.isDirectory() ? n : null
      })
  ).then((results) => results.filter((n): n is string => n !== null))

  for (const slug of agentDirs) {
    const agentDir = path.join(dir, slug)

    let agentData: Record<string, any>
    try {
      const raw = await fs.readFile(path.join(agentDir, 'agent.json'), 'utf-8')
      agentData = JSON.parse(raw)
    } catch {
      continue // skip dirs without a valid agent.json
    }

    const { name, handle, version = 1 } = agentData
    const assetPath = `library/agents/${slug}`

    const existing = await prisma.agentTemplate.findUnique({ where: { slug } })
    if (!existing) {
      await prisma.agentTemplate.create({
        data: { slug, name, version, handle, assetPath, isSystem: true, ...builtIn(version) },
      })
    } else if (existing.version < version) {
      await prisma.agentTemplate.update({
        where: { slug },
        data: { name, version, handle, assetPath, ...builtIn(version) },
      })
    }
  }
}

// ── Apply ─────────────────────────────────────────────────────────────────────

export interface ApplyAgentTemplateResult {
  id: string
  handle: string
}

/**
 * Creates an agent from a template: its instructions, the skills the
 * template lists become the agent's content and its settings the agent's own (5b.12).
 */
export async function applyAgentTemplate(
  slug: string,
  handle: string,
  createdById: string | null,
): Promise<ApplyAgentTemplateResult> {
  const template = await prisma.agentTemplate.findUnique({ where: { slug } })
  if (!template) throw new Error(`Agent template '${slug}' not found`)

  // A built-in template lives in hq's assets; one imported into the library, in hq's own storage.
  const agentDir = itemDir(template.assetPath, template.isSystem)
  const agentData = JSON.parse(await fs.readFile(path.join(agentDir, 'agent.json'), 'utf-8')) as Record<string, any>
  // An imported agent's package (an agent's own export) lists no skills: it brings every one it holds.
  const { skills = template.isSystem ? [] : 'all', ...config } = agentData

  const settings: AgentSettings = {
    ...defaultAgentSettings(config.defaultModel),
    approval: config.approval ?? 'deferred',
    permissions: {
      // Bundled templates carry the current ToolPermission[] shape, but a
      // legacy string[] (pre tool-states) is coerced the same as workforce
      // templates and archive imports do.
      tools: config.allowedTools ? coerceToolPermissions(config.allowedTools) : null,
      bashPatterns: config.allowedBashPatterns ? coerceBashPatternPermissions(config.allowedBashPatterns) : null,
    },
  }
  const initialContent = await readAssetContent(agentDir, skills as 'all' | string[])

  const agent = await createAgent({
    name: template.name,
    handle,
    role: config.role,
    initialContent,
    settings,
    createdById,
  })
  return { id: agent.id, handle: agent.handle }
}
