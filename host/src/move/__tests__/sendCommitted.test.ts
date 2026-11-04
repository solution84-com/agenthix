import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSend } from '../record'
import { PeerChannel } from '../peer'
import { siteAnswersHq, twoMachines, until, type Two } from './twoMachines'

let two: Two
beforeEach(async () => {
  two = await twoMachines()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await two.cleanup()
})

describe('a send that failed after the new machine took over', () => {
  it('does not start the site on the old machine again', async () => {
    siteAnswersHq(two.fresh, true)
    const send = PeerChannel.prototype.send
    vi.spyOn(PeerChannel.prototype, 'send').mockImplementation(async function (this: PeerChannel, step) {
      if (step.step === 'committed' && readSend(two.old.ctx.state)?.phase === 'committed') throw new Error('the commit could not be sealed')
      return send.call(this, step)
    })
    await two.arm()
    await two.sendNow()
    await two.run()
    expect(readSend(two.old.ctx.state)?.phase).toBe('committed')
    expect(two.old.up.has('agenthix-site')).toBe(false)
    await until(() => two.fresh.up.has('agenthix-site'))
  })
})
