import { describe, it, expect } from 'vitest'
import { SITE_CONCURRENT_FILE_READS } from '@agenthix/core'
import { ReadSlots, ReadsFull } from '../readSlots'

describe('ReadSlots @SC-1495 @SC-1571', () => {
  it('lets the site\'s stated number of reads run at once by default', async () => {
    const slots = new ReadSlots()
    for (let i = 0; i < SITE_CONCURRENT_FILE_READS; i++) await slots.acquire()
    expect(slots.running).toBe(SITE_CONCURRENT_FILE_READS)
    let granted = false
    void slots.acquire().then(() => { granted = true })
    await Promise.resolve()
    expect(granted).toBe(false)
    expect(slots.waiting).toBe(1)
  })

  it('queues beyond the limit and grants in order as slots are released', async () => {
    const slots = new ReadSlots(1, 4)
    const first = await slots.acquire()
    const order: number[] = []
    const a = slots.acquire().then(r => { order.push(1); return r })
    const b = slots.acquire().then(r => { order.push(2); return r })
    first()
    ;(await a)()
    ;(await b)()
    expect(order).toEqual([1, 2])
    expect(slots.running).toBe(0)
  })

  it('refuses once the queue is full too', async () => {
    const slots = new ReadSlots(1, 1)
    await slots.acquire()
    void slots.acquire()
    await expect(slots.acquire()).rejects.toBeInstanceOf(ReadsFull)
  })

  it('drops a waiter whose read was cancelled, so it holds no place', async () => {
    const slots = new ReadSlots(1, 1)
    const release = await slots.acquire()
    let cancel!: () => void
    const waiting = slots.acquire({ onCancel: drop => { cancel = drop } })
    cancel()
    await expect(waiting).rejects.toThrow()
    expect(slots.waiting).toBe(0)
    release()
    expect(slots.running).toBe(0)
  })

  it('a release called twice frees one slot', async () => {
    const slots = new ReadSlots(2, 0)
    const r = await slots.acquire()
    await slots.acquire()
    r()
    r()
    expect(slots.running).toBe(1)
  })
})
