/**
 * What a socket.io client sees when hq refuses its version: a real server with the handshake guard on an ephemeral
 * port, and a real client, so the shape the mobile app reads in `connect_error` is the one socket.io delivers.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Server } from 'socket.io'
import { io as connect } from 'socket.io-client'
import { CLIENT_PROTOCOL_REFUSED, type ClientSocketRefusal } from '@agenthix/core'
import { clientProtocolSocketGuard, type HandshakeSocket } from '../clientProtocol'

let server: http.Server
let url: string

beforeAll(async () => {
  server = http.createServer()
  const io = new Server(server)
  io.use((socket, next) => clientProtocolSocketGuard(socket as unknown as HandshakeSocket, next))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

function dial(auth: Record<string, unknown>): Promise<{ connected: true } | { connected: false; err: ClientSocketRefusal }> {
  const socket = connect(url, { auth, transports: ['websocket'], reconnection: false })
  return new Promise(resolve => {
    socket.on('connect', () => { socket.close(); resolve({ connected: true }) })
    socket.on('connect_error', (err) => { socket.close(); resolve({ connected: false, err: err as ClientSocketRefusal }) })
  })
}

describe('a socket.io client refused for its version @SC-1139', () => {
  it('connects with no version, and with one hq serves', async () => {
    expect(await dial({})).toEqual({ connected: true })
    expect(await dial({ clientProtocolVersion: '1.0' })).toEqual({ connected: true })
  })

  it('receives connect_error with the refusal as its data', async () => {
    const result = await dial({ clientProtocolVersion: '3.0' })
    expect(result.connected).toBe(false)
    if (result.connected) return
    expect(result.err.message).toBe(CLIENT_PROTOCOL_REFUSED)
    expect(result.err.data).toEqual({
      error: 'This app speaks protocol 3.0 and HQ speaks 1.1, too far apart to work together: upgrade HQ.',
      reason: 'too_far_apart', hqVersion: '1.1', clientVersion: '3.0', upgrade: 'hq',
    })
  })
})
