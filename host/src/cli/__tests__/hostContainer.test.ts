import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

let dir: string | null = null
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
  dir = null
})

async function nameWith(namespace: string | null): Promise<string> {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-host-'))
  if (namespace) fs.writeFileSync(path.join(dir, 'namespace.json'), JSON.stringify({ namespace }))
  vi.stubEnv('HOST_STATE_DIR', dir)
  vi.resetModules()
  return (await import('../hostContainer')).hostContainer()
}

describe("the host service's container, as the CLI names it @SC-821 @SC-1155", () => {
  it('is named from the namespace the host service recorded', async () => {
    expect(await nameWith('acme')).toBe('acme-host')
  })

  it("is a new install's name before any namespace is recorded", async () => {
    expect(await nameWith(null)).toBe('agenthix-host')
  })
})
