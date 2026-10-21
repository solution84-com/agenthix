import { vi } from 'vitest'
import type * as Real from '../../server/dashboard/debouncedPush'
import { resetBeforeEachTest, type MissingFrom, type Spy } from './lifecycle'

/** Calls to `triggerSnapshotPush` since the last reset. */
export const triggerSnapshotPush: Spy<typeof Real.triggerSnapshotPush> = vi.fn()

export function reset(): void {
  triggerSnapshotPush.mockReset()
}

export const __resetForTests = reset

resetBeforeEachTest(reset)

export const _exportsEveryRealName: MissingFrom<typeof Real, typeof import('./debouncedPush')> extends never ? true : never = true
