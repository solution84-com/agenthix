import { describe, it, expect } from 'vitest'
import type { MobileOperationName, MobileOperations } from '../index.js'

// `unknown` and `any` are the only types `unknown` is assignable to: a side typed as either declares nothing.
type Undeclared<T> = unknown extends T ? true : false
type UndeclaredOperation = {
  [K in MobileOperationName]: Undeclared<MobileOperations[K]['args']> extends true ? K
    : Undeclared<MobileOperations[K]['result']> extends true ? K : never
}[MobileOperationName]
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

// Fails to compile (and so `npm test`, whose typecheck runs first) while an operation has an undeclared side that is
// at all.
const noneUndeclared: Same<UndeclaredOperation, never> = true

describe('every operation the mobile app uses has a declared argument and result @SC-1132', () => {
  it('names no operation with an undeclared side', () => {
    expect(noneUndeclared).toBe(true)
  })
})
