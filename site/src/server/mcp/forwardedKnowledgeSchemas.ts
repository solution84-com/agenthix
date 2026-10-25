/**
 * The five knowledge tools (agent knowledge spec, part 3), forwarded to hq with the calling run's id, which the site
 * fills in as it does for set_result. Each answers text, as the native Grep and Read do, so it is passed to the agent
 * as it is. Kept in step with hq's `knowledgeToolSchemas.ts` by hand, fields and descriptions alike, as the rest of
 * this table is (forwardedToolSchemas.drift.test.ts). Spread into FORWARDED_TOOLS.
 */
import { z } from 'zod'
import { BRANDING, KNOWLEDGE_LIMITS as L } from '@agenthix/core'
import type { ForwardedTool } from './forwardedToolSchemas'

const PAGE = z.string().min(1).max(600)
  .describe('The page, named with its level as search_knowledge shows it, e.g. website-rebuild:processes/release.md, org:how-we-work/code-review.md or platform:your-tools/providers.md')

const KNOWLEDGE_SEARCH_MAX_CHARS = 8_000
const KNOWLEDGE_READ_MAX_LINES = 2_000
const KNOWLEDGE_PATTERN_MAX_CHARS = 500

/** The tools that change knowledge: left out of the list of a run that may change no files (handler.ts). */
export const KNOWLEDGE_CHANGE_TOOLS = ['write_knowledge', 'edit_knowledge', 'delete_knowledge'] as const

const KNOWLEDGE_TOOLS: Array<Pick<ForwardedTool, 'name' | 'description' | 'schema'>> = [
  {
    name: 'search_knowledge',
    description:
      'Works like Grep, over everything known here: how this place and this organisation do things, and how ' +
      `${BRANDING.displayName} itself works (its words, screens and settings). Each match says where it is from. Use it ` +
      'before asking how something is done, and whenever a person names a place, screen or setting you don\'t ' +
      'recognise, before asking them what they mean. Asked about ' +
      `${BRANDING.displayName} itself (where a setting is, what a screen does), search here before you answer, and ` +
      'name its screens as the guide does. ' +
      'It searches every level you may see: the places in this conversation (or this run\'s place), the organisation ' +
      `and the ${BRANDING.displayName} guide; where pages differ, the most specific wins: a place, then the ` +
      'organisation, then the guide. Each match is marked with its page\'s name, which read_knowledge takes as it is. ' +
      'Front matter is searched too (status:\\s*proposed finds open decisions). An empty pattern gives each level\'s ' +
      `sections and tags. At most ${KNOWLEDGE_SEARCH_MAX_CHARS.toLocaleString('en')} characters a call, saying where to continue.`,
    schema: {
      pattern: z.string().max(KNOWLEDGE_PATTERN_MAX_CHARS)
        .describe('The regular expression to search for, as ripgrep reads it (no look-around or backreferences). Empty for each level\'s sections and tags'),
      scope: z.string().max(64).optional()
        .describe('Search only this level: a place\'s name (e.g. website-rebuild), org or platform. Leave it out to search everything'),
      path: z.string().max(600).optional().describe('A section or page to search within, e.g. processes or processes/release.md'),
      glob: z.string().max(200).optional().describe('Only pages whose names match this glob, e.g. decisions/*.md'),
      output_mode: z.enum(['content', 'files_with_matches', 'count']).optional()
        .describe('content: the matching lines (the default); files_with_matches: the pages; count: how many lines matched in each page'),
      '-i': z.boolean().optional().describe('Ignore case (on unless set to false)'),
      '-n': z.boolean().optional().describe('Show line numbers in content mode (on unless set to false)'),
      '-A': z.number().int().min(0).max(20).optional().describe('Lines to show after each match, in content mode'),
      '-B': z.number().int().min(0).max(20).optional().describe('Lines to show before each match, in content mode'),
      '-C': z.number().int().min(0).max(20).optional().describe('Lines to show before and after each match, in content mode'),
      head_limit: z.number().int().min(1).optional().describe('Give only the first N lines or entries'),
      offset: z.number().int().min(0).optional().describe('Skip the first N lines or entries: where a cut answer says to continue'),
    },
  },
  {
    name: 'read_knowledge',
    description:
      'Works like Read, on knowledge: a page with line numbers, front matter included, and its version. ' +
      `Up to ${KNOWLEDGE_READ_MAX_LINES.toLocaleString('en')} lines a call; use offset and limit for a longer page or one part of it.`,
    schema: {
      page: PAGE,
      offset: z.number().int().min(1).optional().describe('The line to start from, 1 for the first'),
      limit: z.number().int().min(1).max(KNOWLEDGE_READ_MAX_LINES).optional().describe('How many lines to read'),
    },
  },
  {
    name: 'write_knowledge',
    description:
      'Works like Write, on knowledge: writes a whole page, front matter included, making it or replacing it. ' +
      'Change knowledge only when a person asks you to or corrects it; what you learn on your own belongs in memory. ' +
      'The page starts with front matter between two --- lines: title (up to ' +
      `${L.maxTitleChars} characters), description (one sentence, up to ${L.maxDescriptionChars}) and, if any, tags ` +
      `(up to ${L.maxTags}, lower-case words joined by hyphens, as a list like [releases, deploys]). Any other field ` +
      `is a property of the place's own, such as status or date: text, a number, a date or a list of them, up to ` +
      `${L.maxProperties}. A page is at most ${L.maxPageBytes / 1024} KB; a section is a folder, up to ` +
      `${L.maxSectionDepth} deep; names use letters, digits, hyphens, underscores and dots, and end in .md. ` +
      'Link to another page with a relative Markdown link, or to an organisation page as org:section/page.md. ' +
      'Read an existing page with read_knowledge first: if it changed since, the write is refused with its current ' +
      'text. A refusal lists what is wrong; fix it and call again. platform: pages cannot be changed.',
    schema: {
      page: PAGE,
      content: z.string().describe('The whole page, in Markdown, starting with its front matter'),
    },
  },
  {
    name: 'edit_knowledge',
    description:
      'Works like Edit, on knowledge: replaces one passage of a page with another, exactly as written. The passage ' +
      'must appear once in the page, unless replace_all is set; otherwise the edit is refused, saying how many times ' +
      'it was found. Change knowledge only when a person asks you to or corrects it. The result must still keep the ' +
      'page\'s rules (as write_knowledge says). platform: pages cannot be changed.',
    schema: {
      page: PAGE,
      old_string: z.string().min(1).describe('The text to replace, exactly as it is in the page'),
      new_string: z.string().describe('The text to put in its place; it must differ from old_string'),
      replace_all: z.boolean().optional().describe('Replace every place the passage appears (default false)'),
    },
  },
  {
    name: 'delete_knowledge',
    description:
      'Deletes a page. Change knowledge only when a person asks you to. It is kept among the recently deleted for ' +
      '30 days, and the answer says how to restore it. To move a page, write it at its new name, then delete the old one. ' +
      'platform: pages cannot be changed.',
    schema: { page: PAGE },
  },
]

export const FORWARDED_KNOWLEDGE_TOOLS: ForwardedTool[] = KNOWLEDGE_TOOLS.map(t => ({
  ...t,
  schema: {
    ...t.schema,
    runId: z.string().optional().describe('Filled in by the site with the run this is called from; leave it out'),
  },
  runIdFromCaller: true as const,
  textResult: true as const,
}))
