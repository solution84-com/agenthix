/**
 * Reading one demo script file from the value `JSON.parse` made of it. Every problem is found, not only the first, so
 * whoever edits the scripts can fix them in one go; only the fields in `scripts.ts` come out.
 */
import {
  DEMO_RUN_EVENT_TYPES, DEMO_SCRIPT_FORMAT, DEMO_SCRIPT_LIMITS as L,
  type DemoIntent, type DemoLeadScript, type DemoLeadToolCall, type DemoRunEnd, type DemoRunEvent, type DemoRunFile,
  type DemoRunScript, type DemoRunTarget, type DemoSpokenLine, type DemoVoiceLine, type DemoClosingLines, DEMO_CLOSING_LINES,
} from './scripts.js'

export type DemoScriptProblem = { at: string; message: string }

export const DEMO_ID = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/
export const DEMO_VOICE_CLIP = /^[a-z0-9][a-z0-9_-]{0,62}\.(mp3|wav|ogg)$/
const TOOL_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/
const LINE_CONTROL = /[\u0000-\u001f\u007f]/

type Map = Record<string, unknown>
const isMap = (v: unknown): v is Map => typeof v === 'object' && v !== null && !Array.isArray(v)

export class Problems {
  list: DemoScriptProblem[] = []
  add(at: string, message: string): null {
    this.list.push({ at, message })
    return null
  }
  /** Fails on any key not in `allowed`, so a misspelt field is not silently dropped. */
  keys(at: string, v: Map, allowed: readonly string[]): void {
    for (const key of Object.keys(v)) if (!allowed.includes(key)) this.add(`${at}.${key}`, `${key} is not a field here.`)
  }
  line(at: string, v: unknown, max: number = L.lineChars): string | null {
    if (typeof v !== 'string' || v.trim() === '' || v.length > max || LINE_CONTROL.test(v)) {
      return this.add(at, `One line of text, 1 to ${max} characters.`)
    }
    return v
  }
  text(at: string, v: unknown, max: number = L.textChars): string | null {
    if (typeof v !== 'string' || v.trim() === '' || v.length > max || CONTROL.test(v)) {
      return this.add(at, `Text of 1 to ${max} characters.`)
    }
    return v
  }
  id(at: string, v: unknown): string | null {
    return typeof v === 'string' && DEMO_ID.test(v) ? v : this.add(at, 'An id: lower-case letters, digits and dashes.')
  }
  items<T>(at: string, v: unknown, max: number, read: (at: string, item: unknown) => T | null, min = 0): T[] {
    if (!Array.isArray(v) || v.length < min || v.length > max) {
      this.add(at, `A list of ${min} to ${max} items.`)
      return []
    }
    const out: T[] = []
    v.forEach((item, i) => {
      const got = read(`${at}[${i}]`, item)
      if (got !== null) out.push(got)
    })
    return out
  }
  clip(at: string, v: unknown): string | null | undefined {
    if (v === undefined || v === null) return null
    return typeof v === 'string' && DEMO_VOICE_CLIP.test(v)
      ? v
      : (this.add(at, 'A clip file name in voice/, such as writer-hello.mp3.'), undefined)
  }
}

function format(p: Problems, at: string, v: unknown): void {
  if (v !== DEMO_SCRIPT_FORMAT) p.add(`${at}.format`, `format is ${DEMO_SCRIPT_FORMAT}.`)
}

function spoken(p: Problems, at: string, v: unknown, textField: 'text' | 'reply'): DemoSpokenLine | null {
  if (!isMap(v)) return p.add(at, `An object with ${textField} and an optional voiceClip.`)
  p.keys(at, v, [textField, 'voiceClip'])
  const text = p.text(`${at}.${textField}`, v[textField])
  const voiceClip = p.clip(`${at}.voiceClip`, v.voiceClip)
  return text === null || voiceClip === undefined ? null : { text, voiceClip }
}

function toolCall(p: Problems, at: string, v: unknown): DemoLeadToolCall | null {
  if (!isMap(v)) return p.add(at, 'An object with toolName and input.')
  p.keys(at, v, ['toolName', 'input'])
  const toolName = typeof v.toolName === 'string' && TOOL_NAME.test(v.toolName) ? v.toolName : p.add(`${at}.toolName`, 'A tool name.')
  const input = isMap(v.input) ? v.input : p.add(`${at}.input`, 'The tool input, as an object.')
  return toolName === null || input === null ? null : { toolName, input }
}

function intent(p: Problems, at: string, v: unknown): DemoIntent | null {
  if (!isMap(v)) return p.add(at, 'An intent object.')
  p.keys(at, v, ['id', 'phrasings', 'reply', 'toolCalls', 'voiceClip'])
  const id = p.id(`${at}.id`, v.id)
  const phrasings = p.items(`${at}.phrasings`, v.phrasings, L.phrasingsPerIntent, (a, x) => p.line(a, x), 1)
  const reply = p.text(`${at}.reply`, v.reply)
  const toolCalls = v.toolCalls === undefined ? [] : p.items(`${at}.toolCalls`, v.toolCalls, L.toolCallsPerIntent, (a, x) => toolCall(p, a, x))
  const voiceClip = p.clip(`${at}.voiceClip`, v.voiceClip)
  if (id === null || reply === null || voiceClip === undefined) return null
  return { id, phrasings, reply, toolCalls, voiceClip }
}

function voiceLine(p: Problems, at: string, v: unknown): DemoVoiceLine | null {
  if (!isMap(v)) return p.add(at, 'An object with text and intent.')
  p.keys(at, v, ['text', 'intent'])
  const text = p.line(`${at}.text`, v.text)
  const intentId = p.id(`${at}.intent`, v.intent)
  return text === null || intentId === null ? null : { text, intent: intentId }
}

function closingLines(p: Problems, at: string, v: unknown): DemoClosingLines | null {
  if (!isMap(v)) return p.add(at, `An object with ${DEMO_CLOSING_LINES.join(', ')}, each a line with text and an optional voiceClip.`)
  p.keys(at, v, DEMO_CLOSING_LINES)
  const lines = DEMO_CLOSING_LINES.map(key => [key, spoken(p, `${at}.${key}`, v[key], 'text')] as const)
  return lines.every(([, line]) => line !== null) ? Object.fromEntries(lines) as DemoClosingLines : null
}

/** A lead script, `agents/<handle>.json`; `at` names the file in each problem. */
export function readDemoLeadScript(p: Problems, at: string, handle: string, v: unknown): DemoLeadScript | null {
  const before = p.list.length
  if (!isMap(v)) return p.add(at, 'A lead script object.')
  p.keys(at, v, ['format', 'agent', 'intents', 'fallback', 'spoken', 'suggestedPrompts', 'voiceLines', 'firstVoiceLine'])
  format(p, at, v.format)
  if (v.agent !== handle) p.add(`${at}.agent`, `agent is the file's name, ${handle}.`)
  const intents = p.items(`${at}.intents`, v.intents, L.intentsPerAgent, (a, x) => intent(p, a, x), 1)
  const ids = new Set<string>()
  for (const i of intents) {
    if (ids.has(i.id)) p.add(`${at}.intents`, `The intent ${i.id} is listed twice.`)
    ids.add(i.id)
  }
  const fallback = spoken(p, `${at}.fallback`, v.fallback, 'reply')
  const closing = closingLines(p, `${at}.spoken`, v.spoken)
  const suggestedPrompts = p.items(`${at}.suggestedPrompts`, v.suggestedPrompts, L.suggestedPrompts, (a, x) => p.line(a, x), 1)
  const voiceLines = p.items(`${at}.voiceLines`, v.voiceLines, L.voiceLines, (a, x) => voiceLine(p, a, x))
  voiceLines.forEach((l, i) => { if (!ids.has(l.intent)) p.add(`${at}.voiceLines[${i}].intent`, `No intent ${l.intent}.`) })
  const firstVoiceLine = spoken(p, `${at}.firstVoiceLine`, v.firstVoiceLine, 'text')
  if (p.list.length > before || fallback === null || closing === null || firstVoiceLine === null) return null
  return { format: DEMO_SCRIPT_FORMAT, agent: handle, intents, fallback, spoken: closing, suggestedPrompts, voiceLines, firstVoiceLine }
}

function target(p: Problems, at: string, v: unknown): DemoRunTarget | null {
  if (isMap(v) && Object.keys(v).length === 1) {
    if (v.default === true) return { default: true }
    if ('task' in v) { const task = p.line(`${at}.task`, v.task, L.idChars); return task === null ? null : { task } }
    if ('taskType' in v) { const t = p.line(`${at}.taskType`, v.taskType, L.idChars); return t === null ? null : { taskType: t } }
  }
  return p.add(at, 'One of { "task": key }, { "taskType": name } or { "default": true }.')
}

const EVENT_FIELDS: Record<(typeof DEMO_RUN_EVENT_TYPES)[number], readonly string[]> = {
  text_delta: ['textDelta'], thinking: ['thinking'], notice: ['notice'],
  tool_call: ['toolUseId', 'toolName', 'toolInput'], tool_result: ['toolUseId', 'output'],
}

function event(p: Problems, at: string, v: unknown, calls: Set<string>): DemoRunEvent | null {
  if (!isMap(v)) return p.add(at, 'An event object.')
  const type = v.type as (typeof DEMO_RUN_EVENT_TYPES)[number]
  if (!DEMO_RUN_EVENT_TYPES.includes(type)) return p.add(`${at}.type`, `type is one of ${DEMO_RUN_EVENT_TYPES.join(', ')}.`)
  p.keys(at, v, ['type', 'afterMs', ...EVENT_FIELDS[type]])
  const afterMs = Number.isInteger(v.afterMs) && (v.afterMs as number) >= 0 && (v.afterMs as number) <= L.afterMsMax
    ? v.afterMs as number : p.add(`${at}.afterMs`, `A whole number of milliseconds, 0 to ${L.afterMsMax}.`)
  if (afterMs === null) return null
  switch (type) {
    case 'text_delta': { const t = p.text(`${at}.textDelta`, v.textDelta); return t === null ? null : { type, afterMs, textDelta: t } }
    case 'thinking': { const t = p.text(`${at}.thinking`, v.thinking); return t === null ? null : { type, afterMs, thinking: t } }
    case 'notice': { const t = p.line(`${at}.notice`, v.notice); return t === null ? null : { type, afterMs, notice: t } }
    case 'tool_call': {
      const id = p.id(`${at}.toolUseId`, v.toolUseId)
      if (id !== null && calls.has(id)) p.add(`${at}.toolUseId`, `The tool call ${id} is used twice.`)
      const name = typeof v.toolName === 'string' && TOOL_NAME.test(v.toolName) ? v.toolName : p.add(`${at}.toolName`, 'A tool name.')
      if (!isMap(v.toolInput)) p.add(`${at}.toolInput`, 'The tool input, as an object.')
      if (id === null || name === null || !isMap(v.toolInput)) return null
      calls.add(id)
      return { type, afterMs, toolUseId: id, toolName: name, toolInput: v.toolInput }
    }
    case 'tool_result': {
      const id = p.id(`${at}.toolUseId`, v.toolUseId)
      if (id !== null && !calls.has(id)) p.add(`${at}.toolUseId`, `No tool call ${id} before this result.`)
      const output = typeof v.output === 'string' && v.output.length <= L.textChars && !CONTROL.test(v.output)
        ? v.output : p.add(`${at}.output`, `Text of at most ${L.textChars} characters.`)
      return id === null || output === null ? null : { type, afterMs, toolUseId: id, output }
    }
  }
}

function file(p: Problems, at: string, v: unknown): DemoRunFile | null {
  if (!isMap(v)) return p.add(at, 'An object with path and content.')
  p.keys(at, v, ['path', 'content'])
  const path = typeof v.path === 'string' ? v.path : ''
  const parts = path.split('/')
  const safe = path.length > 0 && path.length <= L.pathChars && !path.startsWith('/') && !path.includes('\\') &&
    !LINE_CONTROL.test(path) && parts.every(s => s !== '' && s !== '.' && s !== '..')
  if (!safe) p.add(`${at}.path`, 'A relative path in the workspace, with no empty, . or .. part.')
  const content = typeof v.content === 'string' && v.content.length <= L.fileChars && !CONTROL.test(v.content)
    ? v.content : p.add(`${at}.content`, `Text of at most ${L.fileChars} characters.`)
  return !safe || content === null ? null : { path, content }
}

function end(p: Problems, at: string, v: unknown): DemoRunEnd | null {
  if (isMap(v)) {
    if (v.status === 'completed') { p.keys(at, v, ['status']); return { status: 'completed' } }
    if (v.status === 'failed') {
      p.keys(at, v, ['status', 'error'])
      const error = p.line(`${at}.error`, v.error)
      return error === null ? null : { status: 'failed', error }
    }
    if (v.status === 'limit' && (v.limit === 'time' || v.limit === 'turns')) {
      p.keys(at, v, ['status', 'limit'])
      return { status: 'limit', limit: v.limit }
    }
  }
  return p.add(at, 'One of { "status": "completed" }, { "status": "failed", "error": … } or { "status": "limit", "limit": "time" | "turns" }.')
}

/** A run script, `runs/<handle>/<id>.json`. */
export function readDemoRunScript(p: Problems, at: string, id: string, v: unknown): DemoRunScript | null {
  const before = p.list.length
  if (!isMap(v)) return p.add(at, 'A run script object.')
  p.keys(at, v, ['format', 'id', 'for', 'events', 'files', 'end'])
  format(p, at, v.format)
  if (v.id !== id) p.add(`${at}.id`, `id is the file's name, ${id}.`)
  const for_ = target(p, `${at}.for`, v.for)
  const calls = new Set<string>()
  const events = p.items(`${at}.events`, v.events, L.eventsPerRun, (a, x) => event(p, a, x, calls), 1)
  const files = v.files === undefined ? [] : p.items(`${at}.files`, v.files, L.filesPerRun, (a, x) => file(p, a, x))
  const paths = new Set<string>()
  for (const f of files) {
    if (paths.has(f.path)) p.add(`${at}.files`, `${f.path} is written twice.`)
    paths.add(f.path)
  }
  const end_ = end(p, `${at}.end`, v.end)
  if (p.list.length > before || for_ === null || end_ === null) return null
  return { format: DEMO_SCRIPT_FORMAT, id, for: for_, events, files, end: end_ }
}
