/**
 * What a team template's own files must hold (spec part 2 *Validation*, adr-0157), read from an untrusted package as an
 * agent or task template's are: every field checked and bounded, and only the fields below come out. A team template
 * is `team.json` (its teams of agents, and the projects it starts with each one's task types and custom fields, in a
 * task template's shape: spec D16), `agents/<handle>/agent.json` for each agent, and its skills under `skills/`, which
 * each agent names by folder. It holds agents only: people are added after. Pure.
 */
import { TASK_TEMPLATE_FILE, TaskTemplateError, isAssetName, readTaskTemplate, type TaskTemplateContent } from '@agenthix/core'
import { isValidAgentHandle, INVALID_AGENT_HANDLE_MESSAGE } from '../../agents/agentHandle'
import type { PackageFile } from '../../library/packages/packageZip'
import { SKILL_FILE } from '../skillFile'
import { APPROVALS, AGENT_FILE, NAME_MAX, TEXT_MAX, TemplateFileError, fail, line, list, objectIn, type AgentTemplateFile } from './templateFiles'

export const TEAM_FILE = 'team.json'

const TEAMS_MAX = 20
const AGENTS_MAX = 50
const PROJECTS_MAX = 20
const TAGS_MAX = 20
const SKILLS_MAX = 50
const RESPONSIBILITIES_MAX = 4000
const MULTILINE_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/

export type TeamTemplateAgent = Omit<AgentTemplateFile, 'role'> & {
  role: string
  responsibilities: string
  /** Folders under the package's `skills/`, as the agent names them. */
  skills: string[]
}

export type TeamTemplateFile = {
  name: string
  description: string
  tags: string[]
  teams: Array<{ name: string; purpose: string; agents: string[] }>
  projects: Array<{ name: string; description: string; defaultAgentHandle: string | null } & TaskTemplateContent>
  agents: Record<string, TeamTemplateAgent>
}

function array(value: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fail(`${what} is a list of at most ${max} entries.`)
  return value
}

function object(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`${what} must be an object.`)
  const o = value as Record<string, unknown>
  if ('people' in o) fail('A team template holds agents only; people are added after.')
  return o
}

function text(value: unknown, what: string, max: number): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || MULTILINE_CONTROL.test(value) || value.length > max) return fail(`${what} is text of at most ${max} characters.`)
  return value.trim()
}

function hasSkill(files: PackageFile[], folder: string): boolean {
  return files.some(f => f.path === `skills/${folder}/${SKILL_FILE}`)
}

// A project's types and fields are read as a task template's are; one that has neither starts with Task and Epic only.
function projectTasks(p: Record<string, unknown>, at: string): TaskTemplateContent {
  const none = (v: unknown) => v === undefined || (Array.isArray(v) && v.length === 0)
  if (none(p.types) && none(p.fields)) return { types: [], fields: [] }
  try {
    return readTaskTemplate({ types: p.types, fields: p.fields })
  } catch (err) {
    if (err instanceof TaskTemplateError) return fail(`${at}: ${err.message.replace(`${TASK_TEMPLATE_FILE}: `, '')}`)
    throw err
  }
}

function agentOf(files: PackageFile[], handle: string): TeamTemplateAgent {
  const at = `agents/${handle}/${AGENT_FILE}`
  const a = objectIn(files, at)
  const approval = a.approval ?? 'deferred'
  if (!(APPROVALS as readonly unknown[]).includes(approval)) fail(`${at}: "approval" is one of ${APPROVALS.join(', ')}.`)
  const skills = array(a.skills ?? [], `${at}: "skills"`, SKILLS_MAX).map(s => {
    if (!isAssetName(s)) return fail(`${at}: each skill is a folder name of lowercase letters, digits and single hyphens.`)
    if (!hasSkill(files, s)) return fail(`${at} names the skill ${s}, which the package doesn't hold.`)
    return s
  })
  return {
    name: line(a.name, `${at}: "name"`, NAME_MAX),
    handle,
    role: line(a.role, `${at}: "role"`, TEXT_MAX, false),
    responsibilities: text(a.responsibilities, `${at}: "responsibilities"`, RESPONSIBILITIES_MAX),
    approval: approval as TeamTemplateAgent['approval'],
    allowedTools: list(a.allowedTools, `${at}: "allowedTools"`),
    allowedBashPatterns: list(a.allowedBashPatterns, `${at}: "allowedBashPatterns"`),
    skills: [...new Set(skills)],
  }
}

export function readTeamTemplate(files: PackageFile[]): TeamTemplateFile {
  const t = object(objectIn(files, TEAM_FILE), TEAM_FILE)
  const agents: Record<string, TeamTemplateAgent> = {}
  const teams = array(t.teams, `${TEAM_FILE}: "teams"`, TEAMS_MAX).map((raw, i) => {
    const at = `${TEAM_FILE}: team ${i + 1}`
    const team = object(raw, at)
    const handles = array(team.agents, `${at}'s "agents"`, AGENTS_MAX).map(h => {
      if (!isValidAgentHandle(h)) return fail(`${at}: ${INVALID_AGENT_HANDLE_MESSAGE}.`)
      if (agents[h]) return fail(`${at}: the agent ${h} is in two teams; an agent belongs to one team in a template.`)
      agents[h] = agentOf(files, h)
      return h
    })
    return { name: line(team.name, `${at}'s "name"`, NAME_MAX), purpose: line(team.purpose, `${at}'s "purpose"`, TEXT_MAX, false), agents: handles }
  })
  if (teams.length === 0) fail(`${TEAM_FILE} needs at least one team of agents.`)
  const projects = array(t.projects ?? [], `${TEAM_FILE}: "projects"`, PROJECTS_MAX).map((raw, i) => {
    const at = `${TEAM_FILE}: project ${i + 1}`
    const p = object(raw, at)
    const lead = p.defaultAgentHandle ?? null
    if (lead !== null && (typeof lead !== 'string' || !agents[lead])) fail(`${at}'s "defaultAgentHandle" must be one of the template's agents.`)
    return {
      name: line(p.name, `${at}'s "name"`, NAME_MAX), description: text(p.description, `${at}'s "description"`, TEXT_MAX),
      defaultAgentHandle: lead as string | null, ...projectTasks(p, at),
    }
  })
  const tags = array(t.tags ?? [], `${TEAM_FILE}: "tags"`, TAGS_MAX).map(tag => line(tag, `${TEAM_FILE}: a tag`, 40))
  return {
    name: line(t.name, `${TEAM_FILE}: "name"`, NAME_MAX),
    description: text(t.description, `${TEAM_FILE}: "description"`, TEXT_MAX),
    tags,
    teams,
    projects,
    agents,
  }
}

/** A team template's own files checked (its skills are checked as skills): errors refuse, warnings never do. */
export function validateTeamTemplate(files: PackageFile[]): { errors: string[]; warnings: string[] } {
  try {
    readTeamTemplate(files)
    return { errors: [], warnings: [] }
  } catch (err) {
    if (!(err instanceof TemplateFileError)) throw err
    return { errors: [err.message], warnings: [] }
  }
}
