import { describe, expect, it } from 'vitest'
import { parseBlockedPackageRef, parseBranchPackageUseParams } from '../branchPackages.js'

const good = {
  workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' },
  copyId: '0f8a4c1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b',
  branch: 'add-login-page',
  personId: 'u1',
  package: { ecosystem: 'npm', name: 'esbuild', version: '0.24.0' },
}

describe('branch.packageUse params @SC-1760', () => {
  it('reads params of their shape', () => {
    expect(parseBranchPackageUseParams(good)).toEqual(good)
  })

  it('refuses an extra or missing field', () => {
    expect(parseBranchPackageUseParams({ ...good, extra: 1 })).toBeNull()
    const { personId: _, ...missing } = good
    expect(parseBranchPackageUseParams(missing)).toBeNull()
  })

  it('refuses a package that is not one npm version named exactly', () => {
    for (const pkg of [
      { ecosystem: 'pypi', name: 'esbuild', version: '1.0.0' },
      { ecosystem: 'npm', name: '../evil', version: '1.0.0' },
      { ecosystem: 'npm', name: 'esbuild', version: '^1.0.0' },
      { ecosystem: 'npm', name: 'esbuild', version: '1.0.0', more: true },
    ]) expect(parseBlockedPackageRef(pkg)).toBeNull()
  })

  it('refuses a workspace owner that is not one', () => {
    expect(parseBranchPackageUseParams({ ...good, workspace: { ...good.workspace, ownerType: 'org' } })).toBeNull()
  })

  it('refuses a branch name Git would not take', () => {
    expect(parseBranchPackageUseParams({ ...good, branch: 'a..b' })).toBeNull()
  })
})
