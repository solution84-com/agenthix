import { describe, it, expect } from 'vitest'
import {
  CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET, MOBILE_CLIENT_TO_HQ_EVENTS, MOBILE_HQ_TO_CLIENT_EVENTS,
  MOBILE_HTTP_ROUTES, MOBILE_OPERATIONS, operationPath,
} from '../index.js'

describe('what the mobile app relies on of hq @SC-1132', () => {
  it('names each operation by the path Wasp serves it at', () => {
    expect(operationPath('getMyRunsGoingCount')).toBe('/operations/get-my-runs-going-count')
    expect(operationPath('exchangeMobileAuthToken')).toBe('/operations/exchange-mobile-auth-token')
  })

  it('lists no vendor-named operation, and the voice operations by what they do', () => {
    const names = Object.keys(MOBILE_OPERATIONS)
    expect(names).toEqual(expect.arrayContaining(['getSpeechToken', 'getVoiceServices']))
    expect(names).not.toContain('getAssemblyAiToken')
    expect(names).not.toContain('getVoiceProvider')
  })

  it('lists every voice event of the conversation, in its direction', () => {
    const both = [...MOBILE_CLIENT_TO_HQ_EVENTS, ...MOBILE_HQ_TO_CLIENT_EVENTS] as string[]
    for (const name of Object.values(CONVERSATION_VOICE_SOCKET)) expect(both).toContain(name)
    expect(MOBILE_CLIENT_TO_HQ_EVENTS).toEqual(expect.arrayContaining([
      CONVERSATION_VOICE_SOCKET.start, CONVERSATION_VOICE_SOCKET.interrupt, CONVERSATION_VOICE_SOCKET.continue,
    ]))
    expect(MOBILE_HQ_TO_CLIENT_EVENTS).toEqual(expect.arrayContaining([
      CONVERSATION_VOICE_SOCKET.sentence, CONVERSATION_VOICE_SOCKET.audio, CONVERSATION_VOICE_SOCKET.update,
    ]))
  })

  it('lists the conversation room by its join and the events the app reads, not the desktop-only summarise', () => {
    expect(MOBILE_CLIENT_TO_HQ_EVENTS).toContain(CONVERSATION_SOCKET.subscribe)
    expect(MOBILE_HQ_TO_CLIENT_EVENTS).toContain(CONVERSATION_SOCKET.replay)
    expect(MOBILE_HQ_TO_CLIENT_EVENTS).not.toContain(CONVERSATION_SOCKET.summarise)
  })

  it('names each path, operation and event once, and no event in both directions', () => {
    const paths = MOBILE_HTTP_ROUTES.map(r => `${r.method} ${r.path}`)
    expect(new Set(paths).size).toBe(paths.length)
    const events = [...MOBILE_CLIENT_TO_HQ_EVENTS, ...MOBILE_HQ_TO_CLIENT_EVENTS]
    expect(new Set(events).size).toBe(events.length)
  })
})
