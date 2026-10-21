/**
 * callOperation's registry-lookup guard (spec §7.2, plan 5b-2 task 5 review,
 * I2). `operations` is a plain object, so an unguarded `operations[name]`
 * lookup resolves prototype-chain names ("constructor", "__proto__", …) to a
 * real (non-operation) value instead of `undefined` — a caller-supplied
 * operation name reaching that would get a 200 echoing whatever that
 * inherited value produced, never the intended 404.
 */
import { describe, it, expect } from 'vitest'


import { callOperation, operations } from '../operations'
import { ControlPlaneError, type CallerContext } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'

const CTX: CallerContext = connectionCaller()

describe('callOperation registry guard @SC-307', () => {
  it.each(['constructor', '__proto__', 'hasOwnProperty', 'toString'])(
    'refuses the prototype-chain name %s with not_found — never reaches a real op',
    async (name) => {
      await expect(callOperation(name, CTX, {})).rejects.toBeInstanceOf(ControlPlaneError)
      try {
        await callOperation(name, CTX, {})
      } catch (err) {
        expect((err as ControlPlaneError).code).toBe('not_found')
      }
    },
  )

  it('a real registry entry still dispatches (sanity check the guard does not over-refuse)', () => {
    expect(Object.prototype.hasOwnProperty.call(operations, 'get_org')).toBe(true)
  })
})
