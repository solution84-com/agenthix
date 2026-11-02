/**
 * The tools' answers in a check: fixed, from world.ts, in the words the real tools use (knowledge/messages.ts, the
 * real suggest_place built on scripted lookups). Nothing reaches a database, a site or a card.
 */
import { PERSONAL_LEVEL } from '../../knowledge/reach'
import { MESSAGES, levelFailureMessage, levelsInWords } from '../../knowledge/messages'
import type { ToolCallOutcome, TurnCapability } from '../contract'
import { createSuggestPlaceTool } from '../placesSuggest'
import type { Place } from '../places'
import { turnToolAsks } from '../../server/controlplane/turnCaller'
import { attachmentReference } from '../../shared/taskReferences'
import {
  AGENT_ID, AGENT_NAME, ORG, PAGES, PERSON_ID, PERSONAL_PROJECT, PROJECT, PROJECT_LEVEL, SEARCH_HITS, TASK, YOUR_SPACE_PLACE, heldLevels, levelOf, type Home,
} from './world'

type Args = Record<string, unknown>

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)

/** The level a search names, by `scope` or by the level of its `path`. */
function askedLevel(args: Args): string | undefined {
  const scope = str(args.scope)?.replace(/:$/, '')
  if (scope) return scope
  const path = str(args.path)
  return path?.includes(':') ? levelOf(path) : undefined
}

function search(args: Args, home: Home): string {
  const held = heldLevels(home)
  const asked = askedLevel(args)
  if (asked && !held.includes(asked)) return MESSAGES.searchNotInConversation(asked, held)
  const levels = asked ? [asked] : held
  const lines = SEARCH_HITS.filter(h => levels.includes(levelOf(h.page))).map(h => {
    const page = PAGES.find(p => p.name === h.page)!
    return `${h.page}:${h.line}: ${page.text.split('\n')[h.line - 1]}`
  })
  const searched = `[Searched ${levelsInWords(levels, 'and')}.]`
  return lines.length > 0 ? `${lines.join('\n')}\n${searched}` : `No matches found: nothing in ${levelsInWords(levels, 'and')}.`
}

function pageNamed(args: Args, home: Home): { text: string } | { refusal: string } {
  const name = str(args.page) ?? str(args.path) ?? str(args.file_path) ?? ''
  const held = heldLevels(home)
  if (!name.includes(':')) return { refusal: MESSAGES.noLevel(levelsInWords(held, 'or')) }
  const level = levelOf(name)
  if (!held.includes(level)) return { refusal: MESSAGES.pageNotInConversation(level, held) }
  const page = PAGES.find(p => p.name === name)
  if (!page) return { refusal: levelFailureMessage(level, 'not_found') }
  const lines = page.text.split('\n')
  return { text: `${lines.map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join('\n')}\n[${name}: lines 1-${lines.length} of ${lines.length}. Version ${page.version}.]` }
}

function change(name: string, args: Args, home: Home): string {
  const found = pageNamed(args, home)
  if ('refusal' in found) return found.refusal
  if (levelOf(str(args.page) ?? str(args.path) ?? str(args.file_path) ?? '') === 'platform') return MESSAGES.platformReadOnly()
  return `Done: ${str(args.page) ?? str(args.path) ?? str(args.file_path)} ${name === 'write_knowledge' ? 'written' : 'edited'}. Version 9d4f0c2e7a11. The previous one is in History.`
}

/** suggest_place as it runs, its lookups answered from the world: the same words findOpenPlace finds. */
function suggestPlace(home: Home) {
  const own: Place = home === 'project' ? { type: 'project', id: PROJECT.id } : { type: 'user', id: PERSON_ID }
  return createSuggestPlaceTool({
    conversation: async () => ({ personId: PERSON_ID, held: [own] }),
    async find(_personId, words) {
      const lower = words.trim().replace(/:$/, '').toLowerCase()
      if (lower === PERSONAL_LEVEL || lower === 'your space') return { type: 'user', id: PERSON_ID }
      const named = [PROJECT_LEVEL, PROJECT.key.toLowerCase(), PROJECT.name.toLowerCase()].includes(lower)
      return named ? { type: 'project', id: PROJECT.id } : null
    },
    name: async place => (place.type === 'user' ? { name: YOUR_SPACE_PLACE.name, level: PERSONAL_LEVEL } : { name: PROJECT.name, level: PROJECT_LEVEL }),
    card: async () => {},
  })
}

function listProjects(home: Home): unknown {
  const asListed = (p: { id: string; key: string; name: string }) => ({ projectId: p.id, key: p.key, name: p.name, description: null, defaultAgentId: null })
  // A project's turn sees that project alone; a turn in Your space sees every project the person may open.
  const projects = home === 'project' ? [PROJECT] : [PROJECT, PERSONAL_PROJECT]
  return { projects: projects.map(asListed), source: 'local' }
}

/** get_org and list_agents in the real tools' shapes (orgOps.ts, agentOps.ts): create_task asks for the org's id and an agent. */
const ORG_ANSWER = { orgId: ORG.id, name: ORG.name, vision: '', mission: '', mode: 'standalone' }
const AGENTS_ANSWER = { agents: [{ agentId: AGENT_ID, name: AGENT_NAME, handle: AGENT_NAME.toLowerCase(), isKernel: true }], source: 'local' }

/** get_task_details for the world's one task, in the real tool's shape (taskOps.ts); any other task is not found. */
function taskDetails(args: Args): unknown {
  const asked = str(args.taskId)
  if (asked !== TASK.key && asked !== TASK.id) return { status: 'refused', reason: `Task ${asked ?? ''} not found` }
  return {
    taskId: TASK.id, taskKey: TASK.key, title: TASK.title, description: 'The form fails on submit; the screenshot shows the error.',
    priority: 'HIGH', status: 'IN_PROGRESS', column: 'In progress', projectId: PROJECT.id, comments: [],
    attachments: [{ name: TASK.attachment, sizeBytes: 48213, label: null, reference: attachmentReference(TASK.key, TASK.attachment) }],
    source: 'local',
  }
}

function outcomeOf(name: string, args: Args, capability: TurnCapability, home: Home): Promise<ToolCallOutcome> | ToolCallOutcome {
  const done = (result: unknown): ToolCallOutcome => ({ status: 'done', operationId: capability.turnId, result })
  switch (name) {
    case 'search_knowledge': return done(search(args, home))
    case 'read_knowledge': {
      const found = pageNamed(args, home)
      return done('refusal' in found ? found.refusal : found.text)
    }
    case 'write_knowledge':
    case 'edit_knowledge':
    case 'delete_knowledge': return done(change(name, args, home))
    case 'suggest_place': return suggestPlace(home).run(capability, args, { signal: new AbortController().signal })
    case 'list_projects': return done(listProjects(home))
    case 'get_org': return done(ORG_ANSWER)
    case 'list_agents': return done(AGENTS_ANSWER)
    case 'get_task_details': return done(taskDetails(args))
    case 'remember': return done({ remembered: str(args.key) ?? 'note' })
    case 'start_work':
    case 'run_task':
    case 'create_task': return { status: 'accepted', operationId: `operation-${name}` }
    default:
      if (turnToolAsks(capability, name)) return { status: 'waitingApproval', operationId: `operation-${name}` }
      return done({ ok: true })
  }
}

/** What the model reads of a call, as the turn tells it (turn.ts `forModel`). */
export async function answer(name: string, input: unknown, capability: TurnCapability, home: Home): Promise<unknown> {
  const args = (input && typeof input === 'object' ? input : {}) as Args
  const outcome = await outcomeOf(name, args, capability, home)
  switch (outcome.status) {
    case 'done': return outcome.result
    case 'accepted': return { operationId: outcome.operationId, status: 'accepted' }
    case 'waitingApproval': return { operationId: outcome.operationId, status: 'waitingApproval' }
    case 'refused': return { status: 'refused', reason: outcome.reason }
  }
}
