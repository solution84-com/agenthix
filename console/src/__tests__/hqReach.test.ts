/**
 * Whether HQ lets this Fleet Console in, for the host service on its machine: a Fleet Console retired while its
 * machine was outside the fleet learns it only from HQ's refusal, and says so through its control socket.
 */
import type net from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { requestControl } from '../control/client'
import { startControlSocket } from '../control/socket'
import { startHarness, type Harness } from './harness'

let h: Harness
let control: net.Server
let socketPath: string

beforeEach(async () => {
  h = await startHarness()
  socketPath = h.state.path('control.sock')
})
afterEach(async () => {
  await new Promise(r => control.close(r))
  await h.close()
})

const hq = async () => (await requestControl(socketPath, 'handover-status')).hq

describe('handover-status says whether HQ lets this Fleet Console in @SC-877', () => {
  it('connected while the link is up', async () => {
    control = await startControlSocket(socketPath, h.ctx)
    expect(await hq()).toBe('connected')
  })

  it('refused once HQ refused it, and still while it tries again, until HQ lets it in', async () => {
    control = await startControlSocket(socketPath, h.ctx)
    h.link.setState('refused')
    expect(await hq()).toBe('refused')
    h.link.setState('connecting')
    expect(await hq()).toBe('refused')
    h.link.setState('disconnected')
    expect(await hq()).toBe('refused')
    h.link.setState('connected')
    expect(await hq()).toBe('connected')
  })

  it('not connected while HQ does not answer, which says nothing of a retirement', async () => {
    control = await startControlSocket(socketPath, h.ctx)
    h.link.setState('connecting')
    expect(await hq()).toBe('notConnected')
    h.link.setState('versionMismatch')
    expect(await hq()).toBe('notConnected')
  })

  it('refused when HQ had refused it before the control socket started', async () => {
    h.link.setState('refused')
    control = await startControlSocket(socketPath, h.ctx)
    expect(await hq()).toBe('refused')
  })

  it('still gives the takeover and the key it holds', async () => {
    control = await startControlSocket(socketPath, h.ctx)
    const answer = await requestControl(socketPath, 'handover-status')
    expect(answer).toMatchObject({ state: expect.any(String), fingerprint: h.ctx.consoleFingerprint })
  })
})
