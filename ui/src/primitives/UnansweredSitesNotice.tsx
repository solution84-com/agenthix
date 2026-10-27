/**
 * Names the Execution Sites a view could not get an answer from.
 *
 * Presentational only. The words are composed by the app — `unansweredSitesCopy`
 * in hq, which tests it. This component decides how the lines look
 * and nothing about what they say.
 *
 * It renders nothing when `copy` is null, which is what the composer returns
 * when every site answered, so a caller cannot show an empty frame. A view that
 * renders this must also stop rendering its own "nothing here" copy: "nothing
 * here" and "could not ask" are different facts, and shown together they
 * contradict each other.
 *
 * Colour never carries the meaning on its own — the sentence says it — and the
 * `role` makes it reach a screen reader as a status rather than as decoration.
 */

export interface UnansweredSitesNoticeCopy {
  headline: string
  sites: { siteId: string; heading: string; detail: string }[]
}

export interface UnansweredSitesNoticeProps {
  /** What to say, already composed. Null when every site answered. */
  copy: UnansweredSitesNoticeCopy | null
  className?: string
}

export function UnansweredSitesNotice({ copy, className }: UnansweredSitesNoticeProps) {
  if (!copy) return null

  return (
    <div
      className={`px-4 py-2.5 bg-warning/10 border border-warning/30 rounded-lg text-warning text-body ${className ?? ''}`}
      role="status"
    >
      <p>{copy.headline}</p>
      <ul className="mt-1.5 space-y-0.5">
        {copy.sites.map((s) => (
          <li key={s.siteId} className="text-small">
            <span className="font-medium">{s.heading}</span>
            <span className="opacity-80"> · {s.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
