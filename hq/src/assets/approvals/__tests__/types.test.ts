import { describe, it, expect } from 'vitest'
import { actionOf, parseAssetRequest, parseRequestArgs, policyTarget } from '../types'

describe('an agent\'s asset request', () => {
  it('reads each kind it may ask for, and nothing else', () => {
    expect(parseAssetRequest({ kind: 'publish', assetId: 'a1', revision: 3, note: ' Fixes the example ' }))
      .toEqual({ kind: 'publish', assetId: 'a1', revision: 3, note: 'Fixes the example' })
    expect(parseAssetRequest({ kind: 'rollBack', assetId: 'a1', toVersionId: 'v1', reason: 'Broke the build' })).toMatchObject({ kind: 'rollBack' })
    expect(parseAssetRequest({ kind: 'switchOn', placeSkillId: 's1', fingerprint: 'sha256:ab' })).toMatchObject({ kind: 'switchOn' })
    expect(parseAssetRequest({ kind: 'install', from: 'shelf', name: 'code-review' })).toEqual({ kind: 'install', from: 'shelf', name: 'code-review' })
    expect(parseAssetRequest({ kind: 'install', from: 'url', link: 'https://example.com/p.zip' })).toMatchObject({ from: 'url' })
    for (const kind of ['trust', 'settings', 'nameMaintainer', 'grant', 'remove']) expect(parseAssetRequest({ kind }), kind).toBeNull()
    expect(parseAssetRequest({ kind: 'publish', assetId: 'a1', revision: 0, note: 'x' })).toBeNull()
    expect(parseAssetRequest({ kind: 'publish', assetId: 'a1', revision: 1, note: '' })).toBeNull()
    expect(parseAssetRequest({ kind: 'install', from: 'upload', name: 'x' })).toBeNull()
  })

  it('is checked against the right the person would need', () => {
    expect(actionOf({ kind: 'publish', assetId: 'a', revision: 1, note: 'n' })).toBe('publish')
    expect(actionOf({ kind: 'rollBack', assetId: 'a', toVersionId: 'v', reason: 'r' })).toBe('rollBack')
    expect(actionOf({ kind: 'switchOn', placeSkillId: 's', fingerprint: 'f' })).toBe('settings')
    expect(actionOf({ kind: 'install', from: 'shelf', name: 'x' })).toBe('install')
    expect(actionOf({ kind: 'install', from: 'url', link: 'https://x' })).toBe('installFromOutside')
  })

  it('takes the action again from the request, never from what the card stored', () => {
    const args = parseRequestArgs({
      request: { kind: 'install', from: 'url', link: 'https://example.com/p.zip' },
      requester: { agentId: 'ag', runId: 'r', forUserId: 'u' },
      target: { level: 'organisation' },
      action: 'install',
    })
    expect(args?.action).toBe('installFromOutside')
    expect(parseRequestArgs({ request: { kind: 'install', from: 'shelf', name: 'x' }, requester: { agentId: 'ag', runId: 'r' }, target: { level: 'organisation' } })).toBeNull()
  })

  it('reads the organisation\'s P3 at the moment it is checked', () => {
    expect(policyTarget({ level: 'organisation' }, 'ADMINS_AND_MAINTAINERS')).toEqual({ level: 'organisation', outsideInstallers: 'ADMINS_AND_MAINTAINERS' })
    expect(policyTarget({ level: 'project', projectId: 'p' }, 'ADMINS')).toEqual({ level: 'project', projectId: 'p' })
  })
})
