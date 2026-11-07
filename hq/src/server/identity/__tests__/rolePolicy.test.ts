import { describe, it, expect } from 'vitest'
import { roleAtLeast, minRoleForOrgEscapingTool, ORG_ESCAPING_TOOLS } from '../rolePolicy'

describe('role policy @SC-299', () => {
  it('orders the organisation roles MEMBER < ADMIN and refuses null everywhere (adr-0102)', () => {
    expect(roleAtLeast('ADMIN', 'MEMBER')).toBe(true)
    expect(roleAtLeast('ADMIN', 'ADMIN')).toBe(true)
    expect(roleAtLeast('MEMBER', 'ADMIN')).toBe(false)
    expect(roleAtLeast(null, 'MEMBER')).toBe(false)
  })
  it('covers exactly the 9 org-escaping tools', () => {
    expect(ORG_ESCAPING_TOOLS.slice().sort()).toEqual([
      'apply_agent_preset', 'create_agent', 'create_product',
      'create_project', 'create_team', 'delete_product', 'propose_workforce_template',
      'update_org', 'update_product',
    ])
  })
  // Shaping structure — products, programmes and which one a project is filed
  // under — is the org admin's (spec §6.4); making a project is every member's.
  it('floors: a project is every member\'s to make; the other org-escaping tools are the org admin\'s @SC-304', () => {
    expect(minRoleForOrgEscapingTool('create_project')).toBe('MEMBER')
    expect(minRoleForOrgEscapingTool('create_product')).toBe('ADMIN')
    expect(minRoleForOrgEscapingTool('update_product')).toBe('ADMIN')
    expect(minRoleForOrgEscapingTool('update_org')).toBe('ADMIN')
    expect(minRoleForOrgEscapingTool('create_agent')).toBe('ADMIN')
  })
})
