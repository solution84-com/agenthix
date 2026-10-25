/** Asking a site for one owner's pages, on behalf of a person: never throws its error, and checks a page's name first. */
import type { SiteAnswer } from '../deps'
import { isPageName } from '../pages'
import { KnowledgeRefusal, siteRefusal, type PeopleKnowledgeDeps } from './deps'

/** The site's answer, or the refusal a person reads; whatever a call threw is logged by its name only. */
export async function fromSite<T>(deps: PeopleKnowledgeDeps, what: string, changing: boolean, call: () => Promise<SiteAnswer<T>>): Promise<T> {
  let answer: SiteAnswer<T>
  try {
    answer = await call()
  } catch (err) {
    deps.log.warn('knowledge call to a site failed', { what, error: err instanceof Error ? err.name : 'unknown' })
    answer = { ok: false, why: 'failed' }
  }
  if (!answer.ok) throw siteRefusal(answer.why, changing)
  return answer.value
}

/** A page's name inside its place (`processes/release.md`): nothing that could leave the place's folder. */
export function requirePageName(page: unknown, changing: boolean): string {
  if (typeof page !== 'string' || !isPageName(page)) {
    throw new KnowledgeRefusal(400, `That is not a page's name: a page is named by its path in the place, such as processes/release.md.${changing ? ' Nothing was changed.' : ''}`)
  }
  return page
}
