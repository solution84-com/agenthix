/** Agent content built from hq's bundled assets — the blank template and the library agents. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { getHqAssetsRoot } from '../server/hqAssets'
import { readSkillTree, SKILLS_DIR } from './skillFiles'
import type { AgentContent } from './agentPackageService'

export const INSTRUCTIONS_ASSET_FILE = 'instructions.md'

export function agentTemplateDir(): string {
  return path.join(getHqAssetsRoot(), 'agents', 'template')
}

async function readText(file: string): Promise<string> {
  try {
    return await fs.readFile(file, 'utf-8')
  } catch {
    return ''
  }
}

export async function readAssetContent(
  dir: string,
  skills: 'none' | 'all' | readonly string[] = 'none',
): Promise<AgentContent> {
  const skillFiles = skills === 'none'
    ? []
    : await readSkillTree(path.join(dir, SKILLS_DIR), SKILLS_DIR, skills === 'all' ? undefined : new Set(skills))
  return {
    instructions: await readText(path.join(dir, INSTRUCTIONS_ASSET_FILE)),
    skillFiles,
  }
}

/** A create_agent caller's responsibilities replace the template's placeholder section. */
export function withResponsibilities(instructions: string, responsibilities: string): string {
  const at = instructions.indexOf('## Responsibilities')
  const head = at === -1 ? `${instructions.trimEnd()}\n\n` : instructions.slice(0, at)
  return `${head}## Responsibilities\n\n${responsibilities.trim()}\n`
}

export async function initialAgentContent(params: {
  responsibilities?: string
  initialContent?: Partial<AgentContent>
}): Promise<AgentContent> {
  const template = await readAssetContent(agentTemplateDir())
  const instructions = params.responsibilities
    ? withResponsibilities(template.instructions, params.responsibilities)
    : template.instructions
  return { ...template, instructions, ...params.initialContent }
}
