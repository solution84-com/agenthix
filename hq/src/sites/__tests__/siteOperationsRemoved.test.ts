import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

// A site is added and removed in the Fleet Console; hq has no operation, page or route that admits, approves, removes or
// re-keys one for an organisation admin (host-management spec §10, superseding adr-0064).
const sites = join(__dirname, '..')
const declared = readFileSync(join(sites, 'sites.wasp.ts'), 'utf8')

describe('what an organisation admin can no longer do to a site @SC-926', () => {
  it.each([
    'revokeExecutionSite', 'requestSiteCredentialRotation', 'decideSiteDeviceApproval', 'decidePendingSiteApproval',
    'getSiteDeviceApproval', 'getPendingSiteApprovals', 'device-code', 'device-token', 'ConnectSitePage', 'ApproveSitePage',
    '/sites/approve', '/sites/connect',
  ])('declares no %s', (name) => {
    expect(declared).not.toContain(name)
  })

  it.each(['actions.ts', 'deviceApprovalApi.ts', 'deviceApprovalService.ts', 'pages/ConnectSitePage.tsx', 'pages/ApproveSitePage.tsx', 'pages/PendingApprovalCard.tsx'])(
    'has no %s',
    (file) => { expect(existsSync(join(sites, file))).toBe(false) },
  )

  it('keeps only what the site itself calls: leaving', () => {
    expect(declared).toContain('/api/v1/sites/leave')
    expect(declared).not.toContain('/api/v1/sites/rotate-credential')
  })
})
