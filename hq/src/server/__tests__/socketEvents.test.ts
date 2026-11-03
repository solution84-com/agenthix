/**
 * What a browser's socket may ask of hq once connected. The dashboard's live feed is gone: no screen showed it,
 * and it carried organisation-wide run counts, tokens and cost to anyone signed in. Asking for it is answered
 * with nothing.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {}, HttpError: class extends Error {} }))
vi.mock('../roomAccess', () => ({
  startRoomSweep: vi.fn(),
  isAuthorizedForSessionRoom: vi.fn(), isAuthorizedForTaskRoom: vi.fn(), isAuthorizedForBoardRoom: vi.fn(),
}))
vi.mock('../../conversations/coordinator/socketRoom', () => ({ registerConversationRoom: vi.fn() }))
vi.mock('../../conversations/readingRule', () => ({ requireConversationReader: vi.fn() }))
vi.mock('../../conversations/voice/handlers', () => ({ registerConversationVoice: vi.fn() }))
vi.mock('../../conversations/voice/service', () => ({ startConversationVoice: vi.fn(async () => undefined) }))
vi.mock('../../branches/workspaceRoom', () => ({ registerWorkspaceRoom: vi.fn() }))
vi.mock('../clientEvents', () => ({ registerClientEvents: vi.fn() }))

import { webSocketFn } from '../socket'

function connect(): { listened: string[]; emitted: string[] } {
  let onConnection: ((socket: unknown) => void) | undefined
  const io = {
    engine: { opts: {} },
    use: () => undefined,
    on: (event: string, listener: (socket: unknown) => void) => { if (event === 'connection') onConnection = listener },
  }
  ;(webSocketFn as unknown as (io: unknown, context: unknown) => void)(io, { entities: { AgentSession: {} } })
  const listened: string[] = []
  const emitted: string[] = []
  onConnection!({
    id: 's1', data: { user: { id: 'u1' } }, handshake: {},
    on: (event: string) => { listened.push(event) },
    emit: (event: string) => { emitted.push(event) },
    join: () => undefined,
  })
  return { listened, emitted }
}

describe("a browser's socket", () => {
  it('may join session, task and board rooms', () => {
    const { listened } = connect()
    expect(listened).toEqual(expect.arrayContaining(['subscribeToSession', 'subscribeToTask', 'subscribeToBoard']))
  })

  it('is sent no dashboard snapshot, as hq no longer listens for the request', () => {
    const { listened, emitted } = connect()
    expect(listened).not.toContain('subscribeToDashboard')
    expect(listened).not.toContain('unsubscribeFromDashboard')
    expect(emitted).not.toContain('dashboard:snapshot')
  })
})
