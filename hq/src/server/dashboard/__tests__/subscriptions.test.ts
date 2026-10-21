import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  addSubscriber,
  removeSubscriber,
  listSubscribers,
  __resetForTests,
} from '../subscriptions'

describe('dashboard subscriptions @SC-135', () => {
  beforeEach(() => __resetForTests())

  it('lists every registered socket paired with its viewer id', () => {
    const a = { emit: vi.fn() } as any
    const b = { emit: vi.fn() } as any
    addSubscriber(a, 'user-a')
    addSubscriber(b, 'user-b')
    expect(listSubscribers()).toEqual([
      [a, 'user-a'],
      [b, 'user-b'],
    ])
  })

  it('does not list removed sockets', () => {
    const a = { emit: vi.fn() } as any
    addSubscriber(a, 'user-a')
    removeSubscriber(a)
    expect(listSubscribers()).toEqual([])
  })
})
