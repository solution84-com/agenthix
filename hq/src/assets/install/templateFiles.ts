/**
 * What an agent or board template's own files must hold (spec part 2 *Validation*, adr-0157), checked on every install
 * and every save as a skill's are. They are read from untrusted packages, so every field is checked and bounded and only
 * the fields below come out. An agent template is `agent.json` and `instructions.md`, with its skills under `skills/`;
 * a board template is `board.json` and carries no skills. Pure.
 */
import { isValidAgentHandle, INVALID_AGENT_HANDLE_MESSAGE } from '../../agents/agentHandle'
import type { PackageFile } from '../../library/packages/packageZip'

export const AGENT_FILE = 'agent.json'
export const INSTRUCTIONS_FILE = 'instructions.md'
export const BOARD_FILE = 'board.json'

export const NAME_MAX = 100
export const TEXT_MAX = 1000
const INSTRUCTIONS_MAX_BYTES = 256 * 1024
const LIST_MAX = 200
const COLUMNS_MAX = 20
const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const
export const APPROVALS = ['deferred', 'immediate', 'bypassed'] as const
const COLUMN_NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/
const COLOUR = /^#[0-9a-fA-F]{6}$/
const CONTROL = /[\u0000-\u001f\u007f]/

export class TemplateFileError extends Error {}

export type AgentTemplateFile = {
  name: string
  handle: string
  role: string | null
  approval: (typeof APPROVALS)[number]
  /** As written; the agent's settings coerce them (`agents/toolPermissions.ts`). */
  allowedTools: unknown[] | null
  allowedBashPatterns: unknown[] | null
}

export type BoardTemplateColumn = {
  name: string
  label: string
  status: (typeof STATUSES)[number]
  color: string
  order: number
  description: string
  hint?: string
  autoQueue?: boolean
}

export type BoardTemplateFile = { name: string; description: string; columns: BoardTemplateColumn[] }

export const fail = (message: string): never => { throw new TemplateFileError(message) }

export function objectIn(files: PackageFile[], path: string): Record<string, unknown> {
  const file = files.find(f => f.path === path)
  if (!file) return fail(`It has no ${path}.`)
  let raw: unknown
  try {
    raw = JSON.parse(file.content.toString('utf-8'))
  } catch {
    return fail(`${path} is not valid JSON.`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(`${path} must be a JSON object.`)
  return raw as Record<string, unknown>
}

export function line(value: unknown, what: string, max: number, required = true): string {
  if (value === undefined || value === null) return required ? fail(`${what} is required.`) : ''
  if (typeof value !== 'string' || CONTROL.test(value)) return fail(`${what} must be one line of text.`)
  const text = value.trim()
  if ((required && text === '') || text.length > max) return fail(`${what} is 1 to ${max} characters.`)
  return text
}

export function list(value: unknown, what: string): unknown[] | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value) || value.length > LIST_MAX) return fail(`${what} is a list of at most ${LIST_MAX} entries.`)
  return value
}

export function readAgentTemplate(files: PackageFile[]): AgentTemplateFile {
  const a = objectIn(files, AGENT_FILE)
  if (!isValidAgentHandle(a.handle)) fail(`${AGENT_FILE}: ${INVALID_AGENT_HANDLE_MESSAGE}`)
  const approval = a.approval ?? 'deferred'
  if (!(APPROVALS as readonly unknown[]).includes(approval)) fail(`${AGENT_FILE}: "approval" is one of ${APPROVALS.join(', ')}.`)
  return {
    name: line(a.name, `${AGENT_FILE}: "name"`, NAME_MAX),
    handle: a.handle as string,
    role: line(a.role, `${AGENT_FILE}: "role"`, TEXT_MAX, false) || null,
    approval: approval as AgentTemplateFile['approval'],
    allowedTools: list(a.allowedTools, `${AGENT_FILE}: "allowedTools"`),
    allowedBashPatterns: list(a.allowedBashPatterns, `${AGENT_FILE}: "allowedBashPatterns"`),
  }
}

export function agentInstructions(files: PackageFile[]): string {
  const file = files.find(f => f.path === INSTRUCTIONS_FILE)
  if (!file) return fail(`It has no ${INSTRUCTIONS_FILE}.`)
  if (file.content.length > INSTRUCTIONS_MAX_BYTES) fail(`${INSTRUCTIONS_FILE} is over ${INSTRUCTIONS_MAX_BYTES} bytes.`)
  return file.content.toString('utf-8')
}

function column(raw: unknown, i: number): BoardTemplateColumn {
  const at = `${BOARD_FILE}: column ${i + 1}`
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(`${at} must be an object.`)
  const c = raw as Record<string, unknown>
  if (typeof c.name !== 'string' || !COLUMN_NAME.test(c.name)) fail(`${at}'s "name" is 1 to 40 lowercase letters, digits, hyphens and underscores.`)
  if (!(STATUSES as readonly unknown[]).includes(c.status)) fail(`${at}'s "status" is one of ${STATUSES.join(', ')}.`)
  if (typeof c.color !== 'string' || !COLOUR.test(c.color)) fail(`${at}'s "color" is a colour like #6b7280.`)
  if (c.autoQueue !== undefined && typeof c.autoQueue !== 'boolean') fail(`${at}'s "autoQueue" is true or false.`)
  const hint = line(c.hint, `${at}'s "hint"`, TEXT_MAX, false)
  return {
    name: c.name as string,
    label: line(c.label, `${at}'s "label"`, NAME_MAX),
    status: c.status as BoardTemplateColumn['status'],
    color: c.color as string,
    order: i,
    description: line(c.description, `${at}'s "description"`, TEXT_MAX, false),
    ...(hint ? { hint } : {}),
    ...(c.autoQueue !== undefined ? { autoQueue: c.autoQueue as boolean } : {}),
  }
}

/** The rules a board's columns keep, whoever wrote them: Backlog is every board's already, and each state has a column. */
export function columnsProblem(columns: Array<{ name: string; status: string }>): string | null {
  if (columns.length === 0 || columns.length > COLUMNS_MAX) return `A board template has 1 to ${COLUMNS_MAX} columns.`
  if (columns.some(c => c.name.toLowerCase() === 'backlog')) return 'Every board has a Backlog already; name the column something else.'
  if (new Set(columns.map(c => c.name)).size !== columns.length) return 'Two columns have the same name.'
  const missing = STATUSES.filter(s => !columns.some(c => c.status === s))
  return missing.length ? `A board template needs a column for each state: missing ${missing.join(', ')}.` : null
}

/** A board template's columns, ordered as listed. */
export function readBoardTemplate(files: PackageFile[]): BoardTemplateFile {
  const b = objectIn(files, BOARD_FILE)
  if (!Array.isArray(b.columns)) fail(`${BOARD_FILE}: "columns" is a list.`)
  const columns = (b.columns as unknown[]).slice(0, COLUMNS_MAX + 1).map(column)
  const problem = columnsProblem(columns)
  if (problem) fail(problem)
  return {
    name: line(b.name, `${BOARD_FILE}: "name"`, NAME_MAX),
    description: line(b.description, `${BOARD_FILE}: "description"`, TEXT_MAX, false),
    columns,
  }
}

/** A template's own files checked (its skills are checked as skills): errors refuse, warnings never do. */
export function validateTemplate(kind: 'agent' | 'board', files: PackageFile[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  try {
    if (kind === 'agent') {
      readAgentTemplate(files)
      agentInstructions(files)
    } else {
      readBoardTemplate(files)
      if (files.some(f => f.path.startsWith('skills/'))) errors.push('A board template carries no skills.')
    }
  } catch (err) {
    if (!(err instanceof TemplateFileError)) throw err
    errors.push(err.message)
  }
  return { errors, warnings: [] }
}
