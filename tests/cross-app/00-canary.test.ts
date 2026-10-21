// Proves the harness itself: both real apps are up, reachable over HTTP, and
// both test databases are reachable via Prisma. Later suites (01-registration,
// 02-dispatch, 03-heldTasks) build on this same booted pair.
import { describe, expect, it } from 'vitest'
import { HQ_URL, SITE_URL } from './harness/env'
import { hqDb, siteDb } from './harness/db'
import { runSiteCommand } from './harness/siteCommand'

describe('cross-app harness canary', () => {
  it('hq reports healthy', async () => {
    const res = await fetch(`${HQ_URL}/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('site is up, and its command reports it not connected to an HQ on a fresh install', async () => {
    const health = await fetch(`${SITE_URL}/health`)
    expect(health.status).toBe(200)
    const status = await runSiteCommand(['status'])
    expect(status.code).toBe(0)
    expect(status.stdout).toMatch(/Not connected to an HQ\. A fleet admin adds this site in the Fleet Console\./)
  })

  it('site serves no page', async () => {
    const res = await fetch(`${SITE_URL}/operations/get-site-status`, { method: 'POST' })
    expect(res.status).toBe(404)
  })

  it('both test databases are reachable', async () => {
    await expect(hqDb.$queryRaw`SELECT 1`).resolves.toBeTruthy()
    await expect(siteDb.$queryRaw`SELECT 1`).resolves.toBeTruthy()
  })
})
