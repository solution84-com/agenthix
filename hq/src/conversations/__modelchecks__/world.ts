/**
 * The model checks' world: one person, their space, one project with a release process page, and the platform guide
 * pages the checks ask about. Fixed, so every run of every model meets the same answers.
 */
import { PERSONAL_LEVEL } from '../../knowledge/reach'
import { PERSONAL_PROJECT_NAME } from '../../projects/personalProject'
import { YOUR_SPACE_NAME } from '../places'
import type { PlaceSummary } from '../placesProtocol'
import type { RecalledItem } from '../../memory/contract'
import { keyFrom } from '../../memory/items'

export const PERSON_ID = 'person-sam'
export const AGENT_ID = 'agent-kernel'
export const AGENT_NAME = 'Kernel'
/** The organisation, as get_org answers it. */
export const ORG = { id: 'org-local', name: 'My Organisation' }

export const PROJECT = { id: 'project-website', key: 'WEB', name: 'Website Rebuild', slug: 'website-rebuild' }
/** Your space as list_projects stores it: the person's default personal project. */
export const PERSONAL_PROJECT = { id: 'project-space', key: 'SAM', name: PERSONAL_PROJECT_NAME }

export const PROJECT_LEVEL = PROJECT.slug
export const PROJECT_PLACE: PlaceSummary = { kind: 'project', projectId: PROJECT.id, name: PROJECT.name, level: PROJECT_LEVEL }
export const YOUR_SPACE_PLACE: PlaceSummary = { kind: 'user', name: YOUR_SPACE_NAME, level: PERSONAL_LEVEL }

/** Where a check's conversation lives: a project's, Your space's, or the thread of the project's task (TASK). */
export type Home = 'project' | 'your-space' | 'task'

/** Whether the conversation is in the project: its own or its task's thread. */
export const inProject = (home: Home): boolean => home !== 'your-space'

export const RELEASE_PAGE = `${PROJECT_LEVEL}:processes/release-process.md`
export const PROVIDERS_PAGE = 'platform:your-tools/providers.md'
export const VOICE_PAGE = 'platform:your-tools/phone-and-voice.md'
export const GLOSSARY_PAGE = 'platform:glossary.md'
/** The project's three hosting quotes, in prose: a reply that compares them in a table made the table itself. */
export const HOSTING_PAGE = `${PROJECT_LEVEL}:decisions/hosting-quotes.md`

export interface Page { name: string; text: string; version: string }

export const PAGES: readonly Page[] = [
  {
    name: RELEASE_PAGE,
    version: '7c1e2a9b40d1',
    text: [
      '---',
      'title: Release process',
      'description: How the website goes from a merged change to production.',
      'tags: [release, deploys]',
      '---',
      '',
      '## Cutting a release',
      'Tag the merged commit on main as v<date>.',
      '',
      '## Staging deploys',
      'Staging deploys go out after the checks pass.',
      '',
      '## Production deploys',
      'Production deploys need a second person to approve them, and never on a Friday.',
    ].join('\n'),
  },
  {
    name: PROVIDERS_PAGE,
    version: 'guide',
    text: [
      '---',
      'title: Providers',
      "description: Where your organisation's models and voice come from, and how an organisation admin adds them.",
      '---',
      '',
      'A provider is a service your organisation reaches AI through: Anthropic, OpenAI, Google Gemini, OpenRouter.',
      'Only an organisation admin sees Providers. Open it from the menu behind your name, with Manage, then',
      'Providers under Models and billing. Select Add provider, choose the vendor, and paste its API key.',
    ].join('\n'),
  },
  {
    name: VOICE_PAGE,
    version: 'guide',
    text: [
      '---',
      'title: Voice',
      'description: Set up speech for the organisation, choose an agent\'s voice, and talk to it in a conversation.',
      '---',
      '',
      'Voice needs two providers: AssemblyAI hears you and Inworld speaks the answer. An organisation admin adds them',
      'under Manage organisation › AI. On the same page, Hearing and Speaking choose the organisation\'s voice.',
      'In a conversation, leave the message box empty and select the voice button at its right end.',
    ].join('\n'),
  },
  {
    name: GLOSSARY_PAGE,
    version: 'guide',
    text: [
      '## Your space',
      'Your own place in HQ: your conversations, your Files and your Knowledge, which only you see. Where: Your space',
      'in the side bar (/space).',
      'Also said: my space, personal space, my stuff.',
      '',
      '## Files',
      'The files of a project or of Your space. Where: Files in a project or in Your space.',
    ].join('\n'),
  },
  {
    name: HOSTING_PAGE,
    version: '3a9e5d7c21f0',
    text: [
      '---',
      'title: Hosting quotes',
      'description: The three quotes we got for hosting the new website.',
      '---',
      '',
      '## Fly.io',
      'Fly.io quoted 85 dollars a month for two small machines in Europe and a managed Postgres. It scales on its own.',
      'We have never run anything on Fly, and its managed Postgres is new.',
      '',
      '## Render',
      'Render quoted 120 dollars a month for the same. The old site ran on Render for two years without an outage, but',
      'its price rises with traffic.',
      '',
      '## A VPS',
      'A VPS at Hetzner is 30 dollars a month. We would run the backups, the updates and the security ourselves, and',
      'nobody on the team has done that before.',
    ].join('\n'),
  },
]

/**
 * Each page's lines a search finds, whatever the pattern unless `matches` names the words that find it: the line
 * numbers are the page's own.
 */
export const SEARCH_HITS: readonly { page: string; line: number; matches?: RegExp }[] = [
  { page: RELEASE_PAGE, line: 2 },
  { page: RELEASE_PAGE, line: 11 },
  { page: PROVIDERS_PAGE, line: 8 },
  { page: VOICE_PAGE, line: 8 },
  { page: GLOSSARY_PAGE, line: 1 },
  ...[2, 6, 10, 14].map(line => ({ page: HOSTING_PAGE, line, matches: /host|quote|fly|render|vps|hetzner|price|cost/i })),
]

export function levelOf(name: string): string {
  return name.slice(0, name.indexOf(':'))
}

/** The levels a conversation's knowledge tools reach: its own place, the organisation and the guide. */
export function heldLevels(home: Home): string[] {
  return [inProject(home) ? PROJECT_LEVEL : PERSONAL_LEVEL, 'org', 'platform']
}

/** A task of the project with one attachment, as get_task_details answers it. */
export const TASK = { id: '0b9f6a52-3c1d-4e8a-9f27-5d6c1b2a7e40', key: 'WEB-3', number: 3, title: 'Fix the sign-up form', attachment: 'signup-error.png' }
/** A second task in Backlog, and the project's sprints and Task type as list_boards lists them (the task tool checks). */
export const OTHER_TASK = { id: 'task-web-4', key: 'WEB-4', number: 4, title: 'Write the pricing page copy' }
export const CURRENT_SPRINT = { id: 'sprint-web-12', number: 12, title: 'Sprint 12' }
export const NEXT_SPRINT = { id: 'sprint-web-13', number: 13, title: 'Sprint 13' }
export const TASK_TYPE_COLUMNS = [
  { columnId: 'column-backlog', name: 'Backlog', state: 'BACKLOG' },
  { columnId: 'column-todo', name: 'To do', state: 'TODO' },
  { columnId: 'column-doing', name: 'In progress', state: 'IN_PROGRESS' },
  { columnId: 'column-done', name: 'Done', state: 'DONE' },
]

/** The project's workspaces, as create_task's description lists them: one with Git, one without. */
export const WORKSPACES = [
  { id: 'workspace-site-app', name: 'site-app', git: true },
  { id: 'workspace-copy', name: 'copy-drafts', git: false },
] as const
export const CODE_WORKSPACE = WORKSPACES[0]

const TABLE_RULE_TITLE = 'Comparing options: use a table'
/** The person's one Rule, as Kernel saved it for them in the project (the memory checks). */
export const TABLE_RULE: RecalledItem = {
  itemId: 'memory-table-rule',
  key: keyFrom(TABLE_RULE_TITLE),
  title: TABLE_RULE_TITLE,
  body: 'When comparing or choosing between options, use a table: one row per option, columns for cost and risk.',
  kind: 'RULE',
  tags: [],
  writtenAt: '2026-11-02T09:00:00.000Z',
}
