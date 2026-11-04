/** A browser that leaves while the relay waits for hq's answer gives its stream slot back, and no stream is opened. */
import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { startRelay, until, type Harness } from '../test/harness'
import { passClaims } from '../test/signer'
import { AppSite, PATTERN, appHost, appOrigin, appTicketClaims } from '../test/appSite'
import { OWN_PAGE, SAME_ORIGIN, cookieOf, enter } from '../test/appBrowser'

let relay: Harness
let site: AppSite
afterEach(async () => {
  await site?.close()
  await relay?.close()
})

async function startHeld() {
  let hold: Promise<void> | null = null
  let release = () => {}
  relay = await startRelay({
    previewPattern: PATTERN,
    ask: async () => {
      if (hold) await hold
      return true
    },
  })
  site = await AppSite.connect({ port: relay.port, pass: relay.signer.sign(passClaims()) }, () => ({ head: { status: 200, headers: [] }, body: 'ok' }))
  await until(() => relay.lines.current('site-1') !== null)
  const cookie = cookieOf(await enter(relay.port, relay.signer.sign(appTicketClaims())))
  // From here every ask waits: the entry above needed none.
  hold = new Promise<void>(resolve => { release = resolve })
  return { cookie, answer: () => release() }
}

describe('a browser that leaves while hq is asked @SC-1750', () => {
  it('gives an abandoned request\'s slot back and sends nothing to the site', async () => {
    const { cookie, answer } = await startHeld()
    const req = request({ host: '127.0.0.1', port: relay.port, path: '/', headers: { Host: appHost(), ...OWN_PAGE, Cookie: cookie } })
    req.on('error', () => {})
    req.end()
    await until(() => relay.appLoad.openStreams === 1)
    req.destroy()
    await new Promise(r => setTimeout(r, 100))
    answer()
    await until(() => relay.appLoad.openStreams === 0)
    expect(site.asked).toHaveLength(0)
  })

  it('gives an abandoned WebSocket\'s slot back and sends nothing to the site', async () => {
    const { cookie, answer } = await startHeld()
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/hmr`, ['vite-hmr'], {
      headers: { Host: appHost(), Origin: appOrigin(), Cookie: cookie, ...SAME_ORIGIN, 'Sec-Fetch-Mode': 'websocket' },
    })
    ws.on('error', () => {})
    await until(() => relay.appLoad.openStreams === 1)
    ws.terminate()
    await new Promise(r => setTimeout(r, 100))
    answer()
    await until(() => relay.appLoad.openStreams === 0)
    expect(site.asked).toHaveLength(0)
  })
})
