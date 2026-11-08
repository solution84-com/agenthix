/**
 * What an agent or task template's own files must hold (spec part 2 *Validation*, adr-0157), checked on every install
 * and every save as a skill's are. They are read from untrusted packages, so every field is checked and bounded and only
 * the fields below come out. An agent template is `agent.json` and `instructions.md`, with its skills under `skills/`;
 * a task template is `task-template.json` and carries no skills. Pure.
 */
import { TASK_TEMPLATE_FILE, TaskTemplateError, readTaskTemplate, type TaskTemplateContent } from '@agenthix/core'
import { isValidAgentHandle, INVALID_AGENT_HANDLE_MESSAGE } from '../../agents/agentHandle'
import type { PackageFile } from '../../library/packages/packageZip'

export const AGENT_FILE = 'agent.json'
export const INSTRUCTIONS_FILE = 'instructions.md'

export const NAME_MAX = 100
export const TEXT_MAX = 1000
const INSTRUCTIONS_MAX_BYTES = 256 * 1024
const LIST_MAX = 200
export const APPROVALS = ['deferred', 'immediate', 'bypassed'] as const
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

/** A task template's types and fields (core's `readTaskTemplate`), from its one file. */
export function readTaskTemplateFile(files: PackageFile[]): TaskTemplateContent {
  try {
    return readTaskTemplate(objectIn(files, TASK_TEMPLATE_FILE))
  } catch (err) {
    if (err instanceof TaskTemplateError) fail(err.message)
    throw err
  }
}

/** A template's own files checked (its skills are checked as skills): errors refuse, warnings never do. */
export function validateTemplate(kind: 'agent' | 'task-template', files: PackageFile[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  try {
    if (kind === 'agent') {
      readAgentTemplate(files)
      agentInstructions(files)
    } else {
      readTaskTemplateFile(files)
      if (files.some(f => f.path.startsWith('skills/'))) errors.push('A task template carries no skills.')
    }
  } catch (err) {
    if (!(err instanceof TemplateFileError)) throw err
    errors.push(err.message)
  }
  return { errors, warnings: [] }
}
