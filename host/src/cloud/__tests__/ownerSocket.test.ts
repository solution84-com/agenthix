import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CLOUD_ONLY_OPERATIONS } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { ownerHandler } from '../../owner/dispatch'

let m: FakeMachine
beforeEach(() => { m = fakeMachine() })
afterEach(() => m.cleanup())

describe('the operations only Cloud may ask @SC-1059', () => {
  // `upgrades.set` is also the machine admin's own operation on the owner socket, with its own shape and meaning.
  it.each(CLOUD_ONLY_OPERATIONS.filter(op => op !== 'upgrades.set'))('are not taken from the command line: %s', async op => {
    const answer = await ownerHandler(m.ctx)({ op }, () => {})
    expect(answer).toMatchObject({ ok: false, refusal: { code: 'unknown_operation' } })
  })
})
