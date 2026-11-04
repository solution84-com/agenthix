/**
 * An agent's definition (ADR-0072): ONE current definition, edited without a
 * publish step. Its content — instructions.md and its own skills —
 * is its package, stored immutably by digest and delivered to a site by digest;
 * an edit points the package at new content, and a run already started keeps
 * the content it started with. Its settings — tools,
 * bash patterns, approval — are columns on the
 * Agent row and nowhere else: every reader reads the row.
 */
import { prisma } from 'wasp/server'
import { agentCalled, agentNameFor } from './agentName'
import { Prisma } from '@prisma/client'
import { isApproval, type ToolPermission, type BashPatternPermission } from '@agenthix/core'
import {
  readCurrentFiles, writePackage, PackageContentError,
  type Db, type PackageFileInput, type WriteResult,
} from './packageStore'

export const INSTRUCTIONS_FILE = 'instructions.md'

/** What an agent's package holds. */
export type AgentContent = {
  instructions: string
  /** Paths under skills/. */
  skillFiles: PackageFileInput[]
}

/** How an agent behaves — the Agent row's own columns, gathered for validation and templates. */
export type AgentSettings = {
  permissions: { tools: ToolPermission[] | null; bashPatterns: BashPatternPermission[] | null }
  approval: string
}

/** A partial settings edit, named as the Agent row's columns. */
export type AgentSettingsChange = {
  /** Validated with the rest: bypassed, deferred or immediate. */
  approval?: string
  allowedTools?: ToolPermission[] | null
  allowedBashPatterns?: BashPatternPermission[] | null
}

export class AgentContentMissingError extends Error {
  constructor(readonly agentId: string, agentName: string | null) {
    super(`${agentCalled(agentName)} has no instructions yet`)
    this.name = 'AgentContentMissingError'
  }
}

/** A new agent's settings. Its model and runtime are the resolver's to decide (models from one place, part 4). */
export function defaultAgentSettings(): AgentSettings {
  return {
    permissions: { tools: null, bashPatterns: null },
    approval: 'deferred',
  }
}

type SettingsColumns = {
  approval: string
  allowedTools: Prisma.JsonValue | null
  allowedBashPatterns: Prisma.JsonValue | null
}

/** The Agent row's settings columns, gathered. */
export function agentSettingsOf(agent: SettingsColumns): AgentSettings {
  return {
    approval: agent.approval,
    permissions: {
      tools: (agent.allowedTools ?? null) as ToolPermission[] | null,
      bashPatterns: (agent.allowedBashPatterns ?? null) as BashPatternPermission[] | null,
    },
  }
}

/** P14: PROFILE's body (frontmatter dropped), a blank line, RESPONSIBILITIES — in the order a run read them. */
export function mergeInstructions(profile: string | null, responsibilities: string | null): string {
  const body = (profile ?? '').replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
  const duties = (responsibilities ?? '').trim()
  return `${[body, duties].filter(Boolean).join('\n\n')}\n`
}

export function mergeSettings(current: AgentSettings, change: AgentSettingsChange): AgentSettings {
  return {
    approval: change.approval ?? current.approval,
    permissions: {
      tools: change.allowedTools !== undefined ? change.allowedTools : current.permissions.tools,
      bashPatterns: change.allowedBashPatterns !== undefined ? change.allowedBashPatterns : current.permissions.bashPatterns,
    },
  }
}

const PERMISSION_STATES: readonly unknown[] = ['always', 'ask', 'never']

/** Every entry is a name (or pattern) with a state the site's gate acts on; an unknown state would run as Always. */
function checkPermissionEntries(list: unknown, key: 'name' | 'pattern', what: string): void {
  if (!Array.isArray(list)) return
  for (const entry of list) {
    if (typeof entry === 'string' && entry.trim() !== '') continue // the older list of names, each Always
    const e = (entry ?? {}) as Record<string, unknown>
    if (typeof e[key] !== 'string' || (e[key] as string).trim() === '') throw new PackageContentError(`Each of the ${what} needs a ${key}`)
    if (!PERMISSION_STATES.includes(e.state)) throw new PackageContentError(`'${String(e.state)}' is not Always, Ask or Never`)
  }
}

export function validateAgentSettings(s: AgentSettings): void {
  if (!isApproval(s.approval)) throw new PackageContentError(`Invalid approval '${s.approval}' — bypassed, deferred or immediate`)
  if (s.permissions.tools !== null && !Array.isArray(s.permissions.tools)) throw new PackageContentError('The tools must be a list or null')
  if (s.permissions.bashPatterns !== null && !Array.isArray(s.permissions.bashPatterns)) throw new PackageContentError('Bash patterns must be a list or null')
  checkPermissionEntries(s.permissions.tools, 'name', 'tools')
  checkPermissionEntries(s.permissions.bashPatterns, 'pattern', 'bash patterns')
}

function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
}

/** Settings as Agent row columns, for a create or an update. Validates first. */
export function settingsColumns(s: AgentSettings) {
  validateAgentSettings(s)
  return {
    approval: s.approval,
    allowedTools: json(s.permissions.tools),
    allowedBashPatterns: json(s.permissions.bashPatterns),
  }
}

/** Edits an agent's settings in place. The next run reads them from the row. */
export async function updateAgentSettings(agentId: string, change: AgentSettingsChange, db: Db = prisma) {
  const agent = await db.agent.findUniqueOrThrow({ where: { id: agentId } })
  return db.agent.update({ where: { id: agentId }, data: settingsColumns(mergeSettings(agentSettingsOf(agent), change)) })
}

export function contentToFiles(content: AgentContent): PackageFileInput[] {
  for (const file of content.skillFiles) {
    if (!file.path.startsWith('skills/')) throw new PackageContentError(`Skill file ${file.path} must live under skills/`)
  }
  return [
    { path: INSTRUCTIONS_FILE, content: Buffer.from(content.instructions, 'utf-8') },
    ...content.skillFiles,
  ]
}

export function filesToContent(files: PackageFileInput[]): AgentContent {
  const text = (p: string) => files.find(f => f.path === p)?.content.toString('utf-8') ?? ''
  return {
    instructions: text(INSTRUCTIONS_FILE),
    skillFiles: files.filter(f => f.path.startsWith('skills/')).map(f => ({ path: f.path, content: f.content })),
  }
}

export async function writeAgentContent(agentId: string, content: AgentContent, updatedById: string | null, db: Db = prisma): Promise<WriteResult> {
  return writePackage({ kind: 'agent', key: agentId, files: contentToFiles(content), updatedById }, db)
}

export async function readAgentContent(agentId: string, db: Db = prisma): Promise<AgentContent | null> {
  const files = await readCurrentFiles('agent', agentId, db)
  return files ? filesToContent(files) : null
}

/** Reads the agent's content, applies `change` and writes the result, in one transaction. */
export async function changeAgentContent(
  agentId: string,
  change: (content: AgentContent) => AgentContent,
  updatedById: string | null,
): Promise<WriteResult> {
  return prisma.$transaction(async tx => {
    const current = await readAgentContent(agentId, tx)
    if (!current) throw new AgentContentMissingError(agentId, await agentNameFor(agentId, tx))
    return writeAgentContent(agentId, change(current), updatedById, tx)
  })
}
