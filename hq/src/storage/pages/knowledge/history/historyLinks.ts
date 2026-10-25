/**
 * Where a page's history opens, in the address the Knowledge tool keeps its place in:
 * `?tool=knowledge&page=<page>&view=history&history=<version>`. `placePath` is the place's own path (a project's,
 * Your space, `/org/knowledge`); `history` is a kept version's id or a page's version, and the tool opens History
 * with that one chosen (`now`: the newest).
 */
export function knowledgeHistoryHref(placePath: string, page: string, versionId?: string): string {
  const query = new URLSearchParams({ tool: 'knowledge', page, view: 'history', history: versionId ?? 'now' })
  return `${placePath}?${query}`
}
