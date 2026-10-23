import net from 'node:net'
import { describe, expect, it } from 'vitest'
import { freePorts } from './freePorts'

const canBind = (port: number) =>
  new Promise<boolean>((resolvePromise) => {
    const server = net.createServer()
    server.once('error', () => resolvePromise(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolvePromise(true)))
  })

describe('freePorts @SC-1252', () => {
  it('gives the number asked for, all different, each one free to bind', async () => {
    const ports = await freePorts(3)
    expect(ports).toHaveLength(3)
    expect(new Set(ports).size).toBe(3)
    for (const port of ports) {
      expect(Number.isInteger(port)).toBe(true)
      expect(port).toBeGreaterThan(0)
      expect(await canBind(port)).toBe(true)
    }
  })

  it('does not hand out a port that is taken', async () => {
    const taken = net.createServer()
    await new Promise<void>((r) => taken.listen(0, '127.0.0.1', () => r()))
    const takenPort = (taken.address() as net.AddressInfo).port
    try {
      expect(await freePorts(10)).not.toContain(takenPort)
    } finally {
      await new Promise<void>((r) => taken.close(() => r()))
    }
  })
})
