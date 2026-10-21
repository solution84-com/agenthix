import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockComposeSnapshot = vi.hoisted(() => vi.fn().mockResolvedValue({ siteId: 's1', capturedAt: 'now' }))
vi.mock('../snapshot', () => ({ composeSnapshot: mockComposeSnapshot }))

const subscribersMock = {
  listSubscribers: vi.fn(),
  __resetForTests: vi.fn(),
}
vi.mock('../subscriptions', () => subscribersMock)

describe('debouncedPush @SC-137', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockComposeSnapshot.mockClear()
    mockComposeSnapshot.mockResolvedValue({ siteId: 's1', capturedAt: 'now' })
    subscribersMock.listSubscribers.mockReturnValue([])
  })
  afterEach(() => { vi.useRealTimers() })

  it('coalesces multiple triggers within the debounce window into one flush', async () => {
    const socket = { emit: vi.fn() } as any
    subscribersMock.listSubscribers.mockReturnValue([[socket, 'user-a']])
    const { triggerSnapshotPush, __resetForTests } = await import('../debouncedPush')
    __resetForTests()
    triggerSnapshotPush()
    triggerSnapshotPush()
    triggerSnapshotPush()
    expect(socket.emit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600)
    expect(socket.emit).toHaveBeenCalledTimes(1)
    expect(mockComposeSnapshot).toHaveBeenCalledTimes(1)
  })

  it('skips compose + emit when no subscribers', async () => {
    subscribersMock.listSubscribers.mockReturnValue([])
    const { triggerSnapshotPush, __resetForTests } = await import('../debouncedPush')
    __resetForTests()
    triggerSnapshotPush()
    await vi.advanceTimersByTimeAsync(600)
    expect(mockComposeSnapshot).not.toHaveBeenCalled()
  })

  it('composes once per distinct viewer id, not once per socket', async () => {
    const socketA1 = { emit: vi.fn() } as any
    const socketA2 = { emit: vi.fn() } as any
    const socketB = { emit: vi.fn() } as any
    subscribersMock.listSubscribers.mockReturnValue([
      [socketA1, 'user-a'],
      [socketA2, 'user-a'],
      [socketB, 'user-b'],
    ])
    const { triggerSnapshotPush, __resetForTests } = await import('../debouncedPush')
    __resetForTests()
    triggerSnapshotPush()
    await vi.advanceTimersByTimeAsync(600)

    // Two distinct viewers among three sockets -> two composes, three emits.
    expect(mockComposeSnapshot).toHaveBeenCalledTimes(2)
    expect(socketA1.emit).toHaveBeenCalledTimes(1)
    expect(socketA2.emit).toHaveBeenCalledTimes(1)
    expect(socketB.emit).toHaveBeenCalledTimes(1)
  })

  it('keeps pushing to other subscribers when one viewer composition fails', async () => {
    const okSocket = { emit: vi.fn() } as any
    const failSocket = { emit: vi.fn() } as any
    subscribersMock.listSubscribers.mockReturnValue([
      [failSocket, 'user-fail'],
      [okSocket, 'user-ok'],
    ])
    mockComposeSnapshot.mockImplementation((_prisma: unknown, userId: string) =>
      userId === 'user-fail' ? Promise.reject(new Error('boom')) : Promise.resolve({ siteId: 's1', capturedAt: 'now' }),
    )
    const { triggerSnapshotPush, __resetForTests } = await import('../debouncedPush')
    __resetForTests()
    triggerSnapshotPush()
    await vi.advanceTimersByTimeAsync(600)

    expect(failSocket.emit).not.toHaveBeenCalled()
    expect(okSocket.emit).toHaveBeenCalledTimes(1)
  })
})
