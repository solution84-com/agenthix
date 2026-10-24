import { describe, it, expect } from 'vitest'
import { commonPermissions, parsePermissions } from '../permissionFacts'
import { reachOf } from '../accountViews'
import { installLinkFor } from '../installLink'

describe('reading GitHub\'s permissions', () => {
  it('keeps repository permissions, counts admin as write, drops the rest', () => {
    expect(parsePermissions({ contents: 'write', metadata: 'read', pull_requests: 'admin', members: 'write', issues: 'none' }))
      .toEqual({ contents: 'write', metadata: 'read', pull_requests: 'write' })
    expect(parsePermissions(null)).toEqual({})
  })

  it('what every account has accepted is the lowest level of each', () => {
    expect(commonPermissions([{ contents: 'write', issues: 'write' }, { contents: 'read', pull_requests: 'write' }])).toEqual({ contents: 'read' })
    expect(commonPermissions([])).toEqual({})
  })
})

describe('what an installation can reach', () => {
  it('an organisation on all repositories that accepted administration can create one', () => {
    expect(reachOf({ repositorySelection: 'all', accountType: 'Organization' }, { administration: 'write' }).canCreateRepository).toBe(true)
    expect(reachOf({ repositorySelection: 'all', accountType: 'Organization' }, { contents: 'write' }).canCreateRepository).toBe(false)
  })
  it('selected repositories and personal accounts can only link', () => {
    expect(reachOf({ repositorySelection: 'selected', accountType: 'Organization' }, undefined).canCreateRepository).toBe(false)
    expect(reachOf({ repositorySelection: 'all', accountType: 'User' }, undefined).canCreateRepository).toBe(false)
    expect(reachOf({ repositorySelection: null, accountType: 'Organization' }, undefined).selection).toBe('unknown')
  })
})

describe('the install link for a client', () => {
  it('is the App\'s installations/new page, in the note', () => {
    const l = installLinkFor('acme-app', 'Acme')
    expect(l.url).toBe('https://github.com/apps/acme-app/installations/new')
    expect(l.note).toContain(l.url)
    expect(l.note).toContain('stay in control')
  })
})
