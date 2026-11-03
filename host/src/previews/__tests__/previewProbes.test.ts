import https from 'node:https'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { PREVIEW_CHECK_ANSWER } from '@agenthix/core'
import { madeCertificate } from '../../frontDoor/__tests__/madeCertificate'
import { checkAnswerProbe } from '../previewProbes'

const NAME = 'p-check.preview.acme.net'
const cert = madeCertificate([NAME])
let server: https.Server | null = null
let hosts: (string | undefined)[] = []

async function answering(status: number, body: string): Promise<number> {
  server = https.createServer({ cert: cert.certificate, key: cert.privateKey }, (req, res) => {
    hosts.push(req.headers.host)
    res.writeHead(status, { 'Content-Type': 'text/plain' }).end(body)
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}
afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
  server = null
  hosts = []
})

describe("the preview address's test-app check on the machine itself @SC-1756", () => {
  it("passes only the relay's own answer, asked by the check name", async () => {
    const port = await answering(200, PREVIEW_CHECK_ANSWER)
    expect(await checkAnswerProbe(port, cert.certificate)(NAME)).toEqual({ ok: true })
    expect(hosts).toEqual([NAME])
  })

  it("fails a page that is not the relay's, such as HQ's own", async () => {
    const port = await answering(200, '<!doctype html><title>HQ</title>')
    expect(await checkAnswerProbe(port, cert.certificate)(NAME)).toEqual({ ok: false, problem: 'something other than the relay answered it' })
  })

  it('fails a refusal, and a certificate no browser trusts', async () => {
    const port = await answering(404, 'Not found.')
    expect(await checkAnswerProbe(port, cert.certificate)(NAME)).toEqual({ ok: false, problem: 'it was answered 404, not by the relay' })
    expect(await checkAnswerProbe(port)(NAME)).toMatchObject({ ok: false })
  })
})
