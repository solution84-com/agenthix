import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET, MOBILE_CLIENT_TO_HQ_EVENTS, MOBILE_HQ_TO_CLIENT_EVENTS,
  MOBILE_HTTP_ROUTES, MOBILE_OPERATIONS, ROOM_SOCKET, RUN_CLIENT_SOCKET, TASK_CLIENT_SOCKET,
} from '@agenthix/core'

// What core lists of the client protocol the mobile app relies on, checked against what hq has: removing an operation,
// a path or an event the list names fails here, so it is never removed by accident.
const hq = join(__dirname, '..', '..', '..')
const src = join(hq, 'src')

function filesUnder(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, keep))
    else if (keep(path)) out.push(path)
  }
  return out
}

const declarations = filesUnder(hq, p => p.endsWith('.wasp.ts')).map(p => readFileSync(p, 'utf8'))

function declaredOperations(): Map<string, string> {
  const kinds = new Map<string, string>()
  for (const text of declarations) {
    for (const m of text.matchAll(/\b(query|action)\(\s*([A-Za-z0-9_]+)/g)) kinds.set(m[2]!, m[1]!)
  }
  return kinds
}

function declaredApis(): Set<string> {
  const apis = new Set<string>()
  for (const text of declarations) {
    for (const m of text.matchAll(/\bapi\(\s*"([A-Z]+)"\s*,\s*"([^"]+)"/g)) apis.add(`${m[1]} ${m[2]}`)
  }
  return apis
}

// hq's server-side code: not a test, a screen or a hook, not the browser's voice client, and not the re-exports of
// core's declarations in shared/conversations, which name every event without sending or handling any.
const serverFiles = filesUnder(src, p => /\.ts$/.test(p))
  .filter(p => {
    const rel = relative(src, p).split(sep).join('/')
    return !rel.includes('__tests__/') && !rel.endsWith('.test.ts') && !rel.startsWith('shared/conversations/')
      && !rel.startsWith('conversations/voiceClient/')
  })
  .map(p => ({ path: p, text: readFileSync(p, 'utf8') }))
  .filter(f => !/from ['"](react|wasp\/client[^'"]*|socket\.io-client)['"]/.test(f.text))

const CONSTANTS: Record<string, Record<string, string>> = {
  CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET, RUN_CLIENT_SOCKET, ROOM_SOCKET, TASK_CLIENT_SOCKET,
}

/** The files of hq's server that name the event: by its string, or by its key on core's constant (or an alias of it). */
function serverFilesNaming(event: string): string[] {
  const quoted = new RegExp(`['"\`]${event.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`)
  const refs = Object.entries(CONSTANTS).flatMap(([constant, names]) =>
    Object.entries(names).filter(([, name]) => name === event).map(([key]) => ({ constant, key })))
  return serverFiles.filter(({ text }) => {
    if (quoted.test(text)) return true
    return refs.some(({ constant, key }) => {
      const aliases = [constant, ...[...text.matchAll(new RegExp(`\\b${constant}\\s+as\\s+(\\w+)`, 'g'))].map(m => m[1]!)]
      return aliases.some(alias => text.includes(`${alias}.${key}`) && new RegExp(`\\b${constant}\\b`).test(text))
    })
  }).map(f => relative(src, f.path))
}

describe('what the mobile app relies on, hq still has @SC-1141', () => {
  const operations = declaredOperations()

  it.each(Object.entries(MOBILE_OPERATIONS))('declares the operation %s, as a %s', (name, kind) => {
    expect(operations.get(name)).toBe(kind)
  })

  const apis = declaredApis()
  const own = MOBILE_HTTP_ROUTES.filter(r => !r.path.startsWith('/auth/'))
  it.each(own.map(r => [r.method, r.path]))('serves %s %s', (method, path) => {
    expect(apis.has(`${method} ${path}`)).toBe(true)
  })

  it("serves the sign-in, sign-out and session paths through Wasp's username-and-password sign-in", () => {
    const main = readFileSync(join(hq, 'main.wasp.ts'), 'utf8')
    expect(MOBILE_HTTP_ROUTES.filter(r => r.path.startsWith('/auth/')).map(r => r.path))
      .toEqual(['/auth/username/login', '/auth/me', '/auth/logout'])
    expect(main).toMatch(/methods:\s*\{\s*usernameAndPassword:/)
  })

  it.each(MOBILE_CLIENT_TO_HQ_EVENTS)('handles %s from a client', (event) => {
    expect(serverFilesNaming(event)).not.toEqual([])
  })

  it.each(MOBILE_HQ_TO_CLIENT_EVENTS)('sends %s to a client', (event) => {
    expect(serverFilesNaming(event)).not.toEqual([])
  })

  it('finds no server code for an event hq does not have, so a removed one would fail', () => {
    expect(serverFilesNaming('conversationVoice:nothingLikeThis')).toEqual([])
    expect(serverFilesNaming(CONVERSATION_SOCKET.subscribe)).toContain(join('conversations', 'coordinator', 'socketRoom.ts'))
  })
})
