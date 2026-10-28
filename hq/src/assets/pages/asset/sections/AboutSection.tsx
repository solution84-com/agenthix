import { Section } from '../../../components/Section'
import type { AssetPageView, LastUsed } from '../pageTypes'

const when = (at: string | null) => (at ? new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null)

/** "Last used by Ada, today 11:05, in Website rebuild" (board U3). */
export function lastUsedWords(used: LastUsed, now = new Date()): string {
  const at = new Date(used.at)
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const day = at.toDateString() === now.toDateString() ? `today ${time}` : at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return ['Last used' + (used.by ? ` by ${used.by}` : ''), day].join(', ') + (used.where ? `, in ${used.where}` : '')
}

/** *About*: identity, who signed it exactly as the check proved it, where it came from, and who installed it (board U3). */
export function AboutSection({ page }: { page: AssetPageView }) {
  const rows: Array<[string, string | null]> = [
    ['Identity', page.identity],
    ['Signed', page.signedBy],
    ['Came from', page.sourceUrl ? `${page.source}: ${page.sourceUrl}` : page.source],
    ['Installed', page.installedBy ? `${page.installedBy}, ${when(page.installedAt)}` : when(page.installedAt)],
    ['Used', page.lastUsed ? lastUsedWords(page.lastUsed) : page.kind === 'skill' ? 'Not used yet that HQ has seen' : null],
  ]
  return (
    <Section title="About" testId="asset-about">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-body">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-text-muted">{k}</dt><dd className="min-w-0 break-words text-text-primary">{v}</dd></div>
        ))}
      </dl>
      <p className="mt-3 text-micro text-text-muted">The signer is shown exactly as the check proved it. A signature says who published it, never that it is safe.</p>
    </Section>
  )
}
