import { useState } from 'react'
import { Nudge } from '../attention/Nudge'

/**
 * Names the Execution Sites a view could not get an answer from.
 *
 * Presentational only. The words are composed by the app — `unansweredSitesCopy`
 * in hq, which tests it. This component decides how the lines look
 * and nothing about what they say.
 *
 * It is a soft nudge, never a dialog: a site that did not answer leaves part of
 * the screen missing, and the person can carry on. It sits where the caller puts
 * it — the page's or section's meta line (the usual place), a row's detail, or in
 * place of the content when nothing else can be shown — and goes by itself when
 * every site answers (`copy` null). "Which" lists the sites and why each did not
 * answer. A view that renders it in place of the content must also stop rendering
 * its own "nothing here" copy: "nothing here" and "could not ask" are different
 * facts, and shown together they contradict each other.
 */

export interface UnansweredSitesNoticeCopy {
  headline: string
  sites: { siteId: string; heading: string; detail: string }[]
}

export interface UnansweredSitesNoticeProps {
  /** What to say, already composed. Null when every site answered. */
  copy: UnansweredSitesNoticeCopy | null
  /** Where it sits: the meta line by default, a row's detail, or in place of the content. */
  place?: 'meta' | 'row' | 'content'
  className?: string
}

export function UnansweredSitesNotice({ copy, place = 'meta', className }: UnansweredSitesNoticeProps) {
  const [open, setOpen] = useState(false)
  if (!copy) return null
  const which = copy.sites.length > 0 ? { label: open ? 'Hide' : 'Which', onClick: () => setOpen(o => !o) } : undefined
  const list = open && copy.sites.length > 0 && (
    <ul className={`mt-1 space-y-0.5 text-small text-text-secondary ${place === 'content' ? 'text-center' : 'ml-5'}`}>
      {copy.sites.map((s) => (
        <li key={s.siteId}>
          <span className="font-medium text-text-primary">{s.heading}</span>
          <span> · {s.detail}</span>
        </li>
      ))}
    </ul>
  )
  if (place === 'row') {
    return (
      <span className={className}>
        <Nudge place="row" action={which}>{copy.headline}</Nudge>
        {open && copy.sites.map(s => <span key={s.siteId} className="block text-small text-text-secondary"><span className="font-medium text-text-primary">{s.heading}</span> · {s.detail}</span>)}
      </span>
    )
  }
  return (
    <div className={className}>
      {place === 'content'
        ? <Nudge place="content" title={copy.headline} action={which} />
        : <Nudge place="meta" action={which}>{copy.headline}</Nudge>}
      {list}
    </div>
  )
}
