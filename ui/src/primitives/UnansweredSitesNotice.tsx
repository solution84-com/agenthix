import { useEffect } from 'react'
import { useAttention } from './AttentionDialog'

/**
 * Names the Execution Sites a view could not get an answer from.
 *
 * Presentational only. The words are composed by the app — `unansweredSitesCopy`
 * in hq, which tests it. This component decides how the lines look
 * and nothing about what they say.
 *
 * It draws nothing in the view: when `copy` is words (null is what the composer
 * returns when every site answered) it opens the attention dialog once, with the
 * headline and a line per site, and again only if the words change. A view that
 * renders this must also stop rendering its own "nothing here" copy: "nothing
 * here" and "could not ask" are different facts, and shown together they
 * contradict each other.
 */

export interface UnansweredSitesNoticeCopy {
  headline: string
  sites: { siteId: string; heading: string; detail: string }[]
}

export interface UnansweredSitesNoticeProps {
  /** What to say, already composed. Null when every site answered. */
  copy: UnansweredSitesNoticeCopy | null
  /** Kept for the callers that pass one; nothing is drawn in the layout. */
  className?: string
}

export function UnansweredSitesNotice({ copy }: UnansweredSitesNoticeProps) {
  const { show, dialog } = useAttention()
  const key = copy ? JSON.stringify(copy) : ''
  useEffect(() => {
    if (!copy) return
    // With no site named there is nobody to list: the headline is the whole message.
    if (copy.sites.length === 0) { show({ title: 'No site to ask', text: copy.headline }); return }
    show({
      title: copy.headline,
      text: (
        <ul className="space-y-1">
          {copy.sites.map((s) => (
            <li key={s.siteId}>
              <span className="font-medium">{s.heading}</span>
              <span className="text-text-secondary"> · {s.detail}</span>
            </li>
          ))}
        </ul>
      ),
    })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>{dialog}</>
}
