import type { OrganisationPermissionsData, PermissionsHereData } from '@agenthix/ui/agents'

type State = 'always' | 'ask' | 'never'

const TOOLS = [
  { name: 'read_file', group: 'files', fixed: false, state: 'always' },
  { name: 'edit_file', group: 'files', fixed: false, state: 'ask' },
  { name: 'write_file', group: 'files', fixed: false, state: 'ask' },
  { name: 'bash', group: 'commands', fixed: false, state: 'ask' },
  { name: 'web_fetch', group: 'web', fixed: false, state: 'ask' },
  { name: 'web_search', group: 'web', fixed: false, state: 'never' },
  { name: 'list_tasks', group: 'platform', fixed: false, state: 'always' },
  { name: 'create_agent', group: 'platform', fixed: false, state: 'never' },
  { name: 'ping', group: 'platform', fixed: true, state: 'always' },
] as const

export function organisation(over: Partial<OrganisationPermissionsData> = {}): OrganisationPermissionsData {
  return {
    approval: 'deferred',
    tools: TOOLS.map(t => ({ ...t })),
    bashPatterns: [{ pattern: 'npm test', state: 'always' }, { pattern: 'rm -rf', state: 'never' }],
    ...over,
  }
}

const line = (organisation: State, here: State | null = null) => {
  const order = ['always', 'ask', 'never']
  const effective = here && order.indexOf(here) > order.indexOf(organisation) ? here : organisation
  return { organisation, here, effective, narrowed: effective !== organisation }
}

/** The same agent seen from a project: `narrow` names tools set stricter here. */
export function here(narrow: Record<string, State> = {}, over: Partial<PermissionsHereData> = {}): PermissionsHereData {
  const org = organisation()
  const tools = org.tools.map(t => ({ name: t.name, group: t.group, fixed: t.fixed, ...line(t.state, narrow[t.name] ?? null) }))
  return {
    approval: { organisation: 'deferred', here: null, effective: 'deferred', narrowed: false },
    organisationBypassed: false,
    tools,
    bashPatterns: org.bashPatterns.map(p => ({ pattern: p.pattern, ...line(p.state, narrow[p.pattern] ?? null) })),
    narrowedCount: Object.keys(narrow).length,
    ...over,
  }
}
