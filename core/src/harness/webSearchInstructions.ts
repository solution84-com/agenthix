/**
 * What is said when asked to search with no search key. A conversation's reply says it too when its background work
 * runs in OpenCode with no key (hq's `conversations/lead/webSearchBlock.ts`).
 */
export const NO_WEB_SEARCH_WORDS =
  'I work in OpenCode, and this organisation hasn\'t added the search key OpenCode needs to search the web. An organisation admin adds it in Manage organisation › AI, on the Web search line. Meanwhile I can answer from what I already know, which may be out of date.'

/**
 * What an OpenCode run is told when its organisation has no search key, so it has no web search tool (what agents can
 * do, spec decision 5). Here so the site that sends it and the model check that tests its wording send the same words.
 */
export const NO_WEB_SEARCH_INSTRUCTIONS = [
  '## Web search',
  '',
  'Web search isn\'t set up, so you have no web search tool: you work in OpenCode, which searches with a search key, and this organisation hasn\'t added one.',
  '',
  'When you are asked to search the web or to find something current, say so first, before any other work, in these words or close to them:',
  `"${NO_WEB_SEARCH_WORDS}"`,
  '',
  'Never pretend to search or make up results, and never fetch a search engine\'s page (Google, Bing, DuckDuckGo or any other) with web_fetch in its place. Fetching a page at an address you were given is fine.',
].join('\n')

/** Where an organisation admin lets an agent search the web, in its settings screen's words, said by the agent itself. */
const WHERE_TO_ALLOW =
  'in Agents, select Manage agents ›, then Manage beside me, and in Permissions select Edit: Search the web is under Web.'
const MEANWHILE = 'Meanwhile I can answer from what I already know, which may be out of date.'

/**
 * Why an agent's own tools withhold web search from a run: its permissions set Search the web to Never, or to Ask in
 * a run nobody can approve. Not about a search key.
 */
export type WebSearchWithheld = 'never' | 'unattended'

/**
 * What is said when asked to search and the agent's tools set Search the web to Never. A conversation's reply says it
 * too when its background work would get no web search for that reason (hq's `conversations/lead/webSearchBlock.ts`).
 */
export const WEB_SEARCH_NOT_ALLOWED_WORDS =
  `My tools don't allow me to search the web here. An organisation admin can allow it, as Ask or Always: ${WHERE_TO_ALLOW} ${MEANWHILE}`

/** What is said when asked to search in a run nobody can approve, and the agent's tools set Search the web to Ask. */
export const WEB_SEARCH_NEEDS_APPROVAL_WORDS =
  "Searching the web needs a person's approval under my tools, and nobody can approve it during this run, so I can't " +
  `search here. Ask me in a conversation, where you can approve the search, or an organisation admin can set it to Always: ${WHERE_TO_ALLOW} ${MEANWHILE}`

const WITHHELD: Record<WebSearchWithheld, { why: string; words: string }> = {
  never: {
    why: "You have no web search tool in this run: your agent's tools don't allow searching the web here.",
    words: WEB_SEARCH_NOT_ALLOWED_WORDS,
  },
  unattended: {
    why: "You have no web search tool in this run: your agent's tools say searching the web needs a person's approval, and nobody can approve it during this run.",
    words: WEB_SEARCH_NEEDS_APPROVAL_WORDS,
  },
}

/**
 * What a run is told when its agent's tools withhold web search, on either runtime, so it says why rather than
 * guessing at a missing key. Here so the site that sends it and the model check that tests its wording send the same words.
 */
export function webSearchWithheldInstructions(why: WebSearchWithheld): string {
  return [
    '## Web search',
    '',
    WITHHELD[why].why,
    '',
    'When you are asked to search the web or to find something current, say so first, before any other work, in these words or close to them:',
    `"${WITHHELD[why].words}"`,
    '',
    "This is about your agent's tools, not a search key: never say a key is missing. Never pretend to search or make up results, and don't try to find the answer another way: don't fetch pages to look it up, a search engine's or any other. Fetch a page only at an address the person gave you.",
  ].join('\n')
}
