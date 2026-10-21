/**
 * Spec §H2/§H6: an agent never holds authority of its own. This module is the
 * single place a role floor is defined, shared by browser actions and MCP tools
 * so both paths apply the identical check (§H2: "the same check it would apply
 * to that person's browser request"). A null role — a task mint — fails
 * every floor: the absence of a role IS the unattended rule.
 */
export type OrgRole = 'ADMIN' | 'MEMBER'

const ORDER: Record<OrgRole, number> = { MEMBER: 0, ADMIN: 1 }

export function roleAtLeast(role: OrgRole | null | undefined, floor: OrgRole): boolean {
  return role != null && ORDER[role] >= ORDER[floor]
}

/** The 9 tools through which an agent can act on the organisation itself (spec §H1). */
export const ORG_ESCAPING_TOOLS = [
  'update_org', 'create_team',
  'create_product', 'update_product', 'delete_product',
  'create_project', 'create_agent', 'apply_agent_preset', 'propose_workforce_template',
] as const
export type OrgEscapingTool = (typeof ORG_ESCAPING_TOOLS)[number]

// An org admin shapes structure (spec §6.4): products and programmes, which one
// a project is filed under, sites, people and their org roles. Creating a project
// is part of that — the user's ruling, 2026-09-16, departing from §6.4's sentence
// that the existing floors "are already right".
const FLOORS: Record<OrgEscapingTool, OrgRole> = {
  update_org: 'ADMIN', create_team: 'ADMIN',
  create_product: 'ADMIN', update_product: 'ADMIN', delete_product: 'ADMIN',
  create_project: 'ADMIN', create_agent: 'ADMIN', apply_agent_preset: 'ADMIN',
  propose_workforce_template: 'ADMIN',
}

export function minRoleForOrgEscapingTool(tool: OrgEscapingTool): OrgRole {
  return FLOORS[tool]
}

export function isOrgEscapingTool(name: string): name is OrgEscapingTool {
  return (ORG_ESCAPING_TOOLS as readonly string[]).includes(name)
}
