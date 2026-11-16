/**
 * The five knowledge tools and `suggest_place` (agent knowledge spec, parts 3 and 4), split from toolSchemas.ts on
 * the file-size rule. Shaped exactly like the native Grep, Read, Write and Edit, under Claude Code's own parameter
 * names, so an agent uses them as it was trained to.
 *
 * **The five are served**: given to every run in the always-injected tier (shared/mcpTools.ts) — write, edit and
 * delete only to a run that may change files — through its site's MCP server and the data path
 * (`KNOWLEDGE_DATA_PATH_TOOLS`, with the run's id the site fills in), and to the lead as its conversation's own
 * tools (conversations/memory/leadKnowledgeTools.ts). They are in no connection group. `suggest_place` is the lead's
 * alone, as its conversation's own tool (conversations/placesSuggest.ts); no run is given it.
 */
import { z } from 'zod'
import { BRANDING, KNOWLEDGE_LIMITS as L } from '@agenthix/core'
import type { ControlPlaneTool } from './toolSchemas'

const PAGE = z.string().min(1).max(600).describe('The page, as search_knowledge names it')

/** Characters a search answers with at most, before it says where to continue (K1). */
export const KNOWLEDGE_SEARCH_MAX_CHARS = 8_000
/** Lines a read gives at most (K2). */
export const KNOWLEDGE_READ_MAX_LINES = 2_000
/** A search pattern's most characters (S2). */
export const KNOWLEDGE_PATTERN_MAX_CHARS = 500

export const KNOWLEDGE_TOOLS: ControlPlaneTool[] = [
  {
    name: 'search_knowledge',
    area: 'knowledge',
    description:
      'Works like Grep, over everything known here: how this place and this organisation do things, and how ' +
      `${BRANDING.displayName} itself works (its words, screens and settings), across the places you may see, the ` +
      'organisation and the guide. Asked about ' +
      `${BRANDING.displayName} itself (where a setting is, what a screen does), search here before you answer, and ` +
      'name its screens as the guide does. Each match is marked with its page\'s name, which read_knowledge takes. ' +
      'Front matter is searched too. An empty pattern gives each level\'s sections and tags. At most ' +
      `${KNOWLEDGE_SEARCH_MAX_CHARS.toLocaleString('en')} characters a call, saying where to continue.`,
    schema: {
      pattern: z.string().max(KNOWLEDGE_PATTERN_MAX_CHARS)
        .describe('A regular expression, as ripgrep reads it (no look-around or backreferences). Empty for each level\'s sections and tags'),
      scope: z.string().max(64).optional()
        .describe('Only this level: a place\'s name (e.g. website-rebuild), org or platform'),
      path: z.string().max(600).optional().describe('A section or page to search in, e.g. processes'),
      glob: z.string().max(200).optional().describe('Only pages matching this glob, e.g. decisions/*.md'),
      output_mode: z.enum(['content', 'files_with_matches', 'count']).optional()
        .describe('content (the default): matching lines; files_with_matches: pages; count: matches per page'),
      '-i': z.boolean().optional().describe('Ignore case (on unless false)'),
      '-n': z.boolean().optional().describe('Line numbers in content mode (on unless false)'),
      '-A': z.number().int().min(0).max(20).optional().describe('Lines after each match'),
      '-B': z.number().int().min(0).max(20).optional().describe('Lines before each match'),
      '-C': z.number().int().min(0).max(20).optional().describe('Lines before and after each match'),
      head_limit: z.number().int().min(1).optional().describe('Only the first N lines or entries'),
      offset: z.number().int().min(0).optional().describe('Skip the first N lines or entries, where a cut answer says to continue'),
    },
  },
  {
    name: 'read_knowledge',
    area: 'knowledge',
    description:
      'Works like Read, on knowledge: a page with line numbers, front matter included, and its version. ' +
      `Up to ${KNOWLEDGE_READ_MAX_LINES.toLocaleString('en')} lines a call; use offset and limit for more.`,
    schema: {
      page: z.string().min(1).max(600)
        .describe('The page, named with its level as search_knowledge shows it, e.g. website-rebuild:processes/release.md, org:how-we-work/code-review.md or platform:your-tools/providers.md'),
      offset: z.number().int().min(1).optional().describe('The line to start from, 1 for the first'),
      limit: z.number().int().min(1).max(KNOWLEDGE_READ_MAX_LINES).optional().describe('How many lines to read'),
    },
  },
  {
    name: 'write_knowledge',
    area: 'knowledge',
    description:
      'Works like Write, on knowledge: writes a whole page, making or replacing it. Change knowledge only when a ' +
      'person asks you to or corrects it; what you learn on your own belongs in memory. platform: pages cannot be ' +
      'changed. A page starts with front matter between two --- lines: title (up to ' +
      `${L.maxTitleChars} characters), description (one sentence, up to ${L.maxDescriptionChars}) and, if any, tags ` +
      `(up to ${L.maxTags}, lower-case words joined by hyphens, as a list like [releases, deploys]); any other field ` +
      `is the place's own property (text, a number, a date or a list of them, up to ${L.maxProperties}). At most ` +
      `${L.maxPageBytes / 1024} KB; a section is a folder, up to ${L.maxSectionDepth} deep; names use letters, ` +
      'digits, hyphens, underscores and dots, and end in .md. Link with a relative Markdown link, or org:section/page.md. ' +
      'Read a page before replacing it: if it changed since, the write is refused with its current text. A refusal ' +
      'lists what is wrong; fix it and call again.',
    schema: {
      page: PAGE,
      content: z.string().describe('The whole page, in Markdown, starting with its front matter'),
    },
  },
  {
    name: 'edit_knowledge',
    area: 'knowledge',
    description:
      'Works like Edit, on knowledge: replaces one passage of a page, exactly as written. The passage must appear ' +
      'once, unless replace_all is set; otherwise the edit is refused, saying how often it was found. The rules of ' +
      'write_knowledge apply.',
    schema: {
      page: PAGE,
      old_string: z.string().min(1).describe('The text to replace, exactly as it is'),
      new_string: z.string().describe('The text to put in its place; it must differ'),
      replace_all: z.boolean().optional().describe('Replace every place it appears'),
    },
  },
  {
    name: 'delete_knowledge',
    area: 'knowledge',
    description:
      'Deletes a page; the rules of write_knowledge apply. It is kept among the recently deleted for 30 days, and the ' +
      'answer says how to restore it. To move a page, write it at its new name, then delete the old one.',
    schema: { page: PAGE },
  },
]

/** The five as the data path takes them: the site adds the calling run's id, which the agent is never shown. */
export const KNOWLEDGE_DATA_PATH_TOOLS: ControlPlaneTool[] = KNOWLEDGE_TOOLS.map(t => ({
  ...t,
  schema: {
    ...t.schema,
    runId: z.string().min(1).max(100).optional().describe('Filled in by the site with the run this is called from; leave it out'),
  },
}))

/** The lead's only way to reach a place its conversation does not have (P5): a card the person may click. */
export const PLACE_TOOLS: ControlPlaneTool[] = [
  {
    name: 'suggest_place',
    area: 'conversation',
    description:
      'Ask the person to add a place to this conversation, when what they want needs a place it does not have: ' +
      'its knowledge, or work started there. It shows them a card; only their click adds the place, and nothing ' +
      'reaches it until they do. Suggest only a place the person can reach.',
    schema: {
      place: z.string().min(1).max(200).describe('The place to add: a project\'s name as its pages are named, e.g. shop; personal for the person\'s own space'),
      why: z.string().min(1).max(300).describe('Why it is needed, in one sentence the person reads on the card'),
    },
  },
]
