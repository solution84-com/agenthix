import type { ListView } from '../types'

/** The editor's words for a list: what *Any model* means here and how many models each mode leaves. */
export function listWords(view: ListView, above?: string) {
  const none = view.reachable === 0
  return {
    everyLabel: above ? `Any model ${above} allows, except these` : 'Any model your providers reach, except these',
    everyCount: none
      ? 'No provider reaches a model yet.'
      : above
        ? `${view.allowedAbove} allowed in ${above}, ${view.mode === 'every' ? view.allowed : view.allowedAbove} here`
        : `${view.reachable} reachable, ${view.mode === 'every' ? view.allowed : view.reachable} allowed`,
    onlyNote: view.mode === 'only_these'
      ? `${view.reachable} reachable, ${view.allowed} allowed · new models stay off until a pattern or name below covers them`
      : 'New models stay off until you add them',
  }
}
