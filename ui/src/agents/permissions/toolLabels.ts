import { DOMAIN_GROUPS } from '../tabs/SystemCapabilitiesSection'

/** The plain name of each built-in tool, with a line saying what it does. */
const BUILT_IN: Record<string, { label: string; hint?: string }> = {
  read_file: { label: 'Read', hint: 'Open files in its place' },
  glob_files: { label: 'Find', hint: 'Find files by name' },
  grep_files: { label: 'Search files', hint: 'Search what files contain' },
  edit_file: { label: 'Edit', hint: 'Change part of a file' },
  write_file: { label: 'Write', hint: 'Create or replace a file' },
  bash: { label: 'Any other command', hint: 'A command no pattern below matches' },
  web_fetch: { label: 'Fetch a page' },
  web_search: { label: 'Search the web' },
}

const DOMAIN_TITLES: Record<string, string> = {
  ORG: 'Organisation', PRODUCT: 'Products', PROJECT: 'Projects', BOARD: 'Boards', TASK: 'Tasks',
  AGENT: 'Agents', LIBRARY: 'Library', GIT: 'Git',
}

const PLATFORM = new Map(DOMAIN_GROUPS.flatMap(g => g.tools.map(t => [t.rawName, { label: t.label, domain: DOMAIN_TITLES[g.title] ?? g.title }] as const)))

const humanise = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ')

export function toolLabel(name: string): { label: string; hint?: string } {
  return BUILT_IN[name] ?? { label: PLATFORM.get(name)?.label ?? humanise(name) }
}

/** The part of the platform list a tool is shown under. */
export function platformDomain(name: string): string {
  return PLATFORM.get(name)?.domain ?? 'Other'
}

export const GROUP_TITLES = { files: 'Files', commands: 'Commands', web: 'Web', platform: 'Platform' } as const
