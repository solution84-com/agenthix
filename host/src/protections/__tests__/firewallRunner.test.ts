import { describe, expect, it } from 'vitest'
import { commandRunner } from '../firewall'

describe('the firewall command runner @SC-825', () => {
  it('says a command that exits before reading its input failed, and does not crash the host service', async () => {
    // Without NET_ADMIN, nft exits at once; writing the script to it then fails with EPIPE.
    const result = await commandRunner('false')(['-f', '-'], 'add table inet x\n'.repeat(100_000))
    expect(result.code).not.toBe(0)
  })

  it('says a command that is not there failed', async () => {
    const result = await commandRunner('no-such-command-here')([], 'x')
    expect(result.code).toBe(127)
  })
})
