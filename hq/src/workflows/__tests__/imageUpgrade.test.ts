import { describe, expect, it } from 'vitest'
import { releaseLine, upgradeKeepsApproval } from '../imageUpgrade'

const image = (release: string | null, toolsKey: string | null) => ({ digest: `sha256:${'0'.repeat(64)}`, release, toolsKey })

describe('executor image upgrades @SC-1288', () => {
  it('reads a release line', () => {
    expect(releaseLine('1.4.2')).toBe('1.4')
    expect(releaseLine('v0.1.0-alpha.3')).toBe('0.1')
    expect(releaseLine('latest')).toBeNull()
    expect(releaseLine(null)).toBeNull()
  })

  it('keeps the approval in the same release line with an unchanged tools stage', () => {
    expect(upgradeKeepsApproval(image('1.4.0', 'tools-a'), image('1.4.3', 'tools-a'))).toBe(true)
  })

  it('asks again when the tools stage changed', () => {
    expect(upgradeKeepsApproval(image('1.4.0', 'tools-a'), image('1.4.1', 'tools-b'))).toBe(false)
  })

  it('asks again in a new release line, even with the same tools stage', () => {
    expect(upgradeKeepsApproval(image('1.4.0', 'tools-a'), image('1.5.0', 'tools-a'))).toBe(false)
  })

  it('asks again when either image doesn\'t say what it is', () => {
    expect(upgradeKeepsApproval(image(null, 'tools-a'), image(null, 'tools-a'))).toBe(false)
    expect(upgradeKeepsApproval(image('1.4.0', null), image('1.4.1', null))).toBe(false)
  })
})
