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
  '"I work in OpenCode, and this organisation hasn\'t added the search key OpenCode needs to search the web. An organisation admin adds it in Manage organisation › AI, on the Web search line. Meanwhile I can answer from what I already know, which may be out of date."',
  '',
  'Never pretend to search or make up results, and never fetch a search engine\'s page (Google, Bing, DuckDuckGo or any other) with web_fetch in its place. Fetching a page at an address you were given is fine.',
].join('\n')
