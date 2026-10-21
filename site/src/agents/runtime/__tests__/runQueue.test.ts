import { describe, it, expect } from 'vitest'
import { GlobalSlots, KeyedAsyncQueue } from '../runQueue'

const tick = () => new Promise(resolve => { setTimeout(resolve, 0) })

describe('KeyedAsyncQueue', () => {
  it('runs one key in order, and a failure does not stop the next task', async () => {
    const q = new KeyedAsyncQueue()
    const order: string[] = []

    const first = q.enqueue('s', async () => { order.push('first'); throw new Error('boom') })
    const second = q.enqueue('s', async () => { order.push('second'); return 2 })

    await expect(first).rejects.toThrow('boom')
    await expect(second).resolves.toBe(2)
    expect(order).toEqual(['first', 'second'])
  })

  it('drops a key once nothing is queued on it', async () => {
    // Keys are per session: kept forever, they would grow with every
    // conversation the site has ever run.
    const q = new KeyedAsyncQueue()

    await q.enqueue('a', async () => 1)
    await expect(q.enqueue('b', async () => { throw new Error('x') })).rejects.toThrow()
    await tick()

    expect(q.size).toBe(0)
  })

  it('keeps a key while a later task is still queued on it', async () => {
    const q = new KeyedAsyncQueue()
    let release!: () => void
    const first = q.enqueue('s', async () => 1)
    const second = q.enqueue('s', () => new Promise<void>(r => { release = r }))

    await first
    await tick()
    expect(q.size).toBe(1)

    release()
    await second
    await tick()
    expect(q.size).toBe(0)
  })
})

describe('GlobalSlots under a changed cap', () => {
  it('lets waiting runs start when the cap rises, and holds the next ones back when it falls', async () => {
    const slots = new GlobalSlots(1)
    await slots.acquire()
    const started: number[] = []
    void slots.acquire().then(() => started.push(2))
    void slots.acquire().then(() => started.push(3))
    await tick()
    expect(started).toEqual([])
    slots.setMax(3)
    await tick()
    expect(started).toEqual([2, 3])

    slots.setMax(1)
    void slots.acquire().then(() => started.push(4))
    slots.release()
    slots.release()
    await tick()
    expect(started).toEqual([2, 3])
    slots.release()
    await tick()
    expect(started).toEqual([2, 3, 4])
  })
})
