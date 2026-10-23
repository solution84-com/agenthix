import { describe, expect, it, vi } from 'vitest'
import type { SpeechToText, SpeechToTextConnection, SpeechToTextHandlers } from '../../ports'
import { meteredService } from '../meter'

function fakeService() {
  let handlers!: SpeechToTextHandlers
  const conn: SpeechToTextConnection = { send: vi.fn(), bufferedMs: () => 0, endTurn: vi.fn(), close: vi.fn() }
  const service: SpeechToText = { connect: async (h) => { handlers = h; return conn } }
  return { service, conn, handlers: () => handlers }
}
const second = new Int16Array(16_000)

describe('meteredService', () => {
  it('reports the audio a connection was sent, once, under the token’s ticket, when it is closed', async () => {
    const fake = fakeService()
    const report = vi.fn()
    const made = meteredService(() => fake.service, report)({ ticket: 'tk-1' })
    const conn = await made.connect({ onWords: vi.fn(), onClose: vi.fn(), onError: vi.fn() })
    conn.send(second); conn.send(new Int16Array(8_000))
    expect(report).not.toHaveBeenCalled()
    conn.close(); conn.close()
    expect(fake.conn.send).toHaveBeenCalledTimes(2)
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith({ ticket: 'tk-1', audioMs: 1500 })
  })

  it('reports when the service closes the connection, and passes the close on', async () => {
    const fake = fakeService()
    const report = vi.fn()
    const onClose = vi.fn()
    const conn = await meteredService(() => fake.service, report)({ ticket: 'tk-2' }).connect({ onWords: vi.fn(), onClose, onError: vi.fn() })
    conn.send(second)
    fake.handlers().onClose('gone')
    conn.close()
    expect(onClose).toHaveBeenCalledWith('gone')
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith({ ticket: 'tk-2', audioMs: 1000 })
  })

  it('reports nothing for a connection that streamed nothing or a token with no ticket', async () => {
    const report = vi.fn()
    const idle = await meteredService(() => fakeService().service, report)({ ticket: 'tk-3' }).connect({ onWords: vi.fn(), onClose: vi.fn(), onError: vi.fn() })
    idle.close()
    const bare = await meteredService(() => fakeService().service, report)({}).connect({ onWords: vi.fn(), onClose: vi.fn(), onError: vi.fn() })
    bare.send(second); bare.close()
    expect(report).not.toHaveBeenCalled()
  })
})
