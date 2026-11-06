import { Link } from 'react-router'
import { Modal } from '@agenthix/ui/primitives'
import { LIBRARY_SETTINGS_PATH } from '../../../../library/components/libraryRoutes'
import { lastUsedWords } from '../sections/AboutSection'
import { CopiesSection } from '../sections/CopiesSection'
import { CreditSection } from '../sections/CreditSection'
import { OriginalSection } from '../sections/OriginalSection'
import type { AssetPageView } from '../pageTypes'
import { dayWords } from './skillWords'

/**
 * *About* a skill, as the workspace view's About (board *A skill's page* 4): where it came from and who made it, its
 * identity, the version in use, who can edit, who signed it, when it was last used and its credit; for the
 * organisation's own copy, the original under it, and for an original, the organisation's copies of it.
 */
export function SkillAbout({ page, onChanged, onClose }: { page: AssetPageView; onChanged: (message: string) => void; onClose: () => void }) {
  const made = [page.source + (page.sourceUrl ? `: ${page.sourceUrl}` : ''), page.installedBy ? `by ${page.installedBy}` : null, page.installedAt ? dayWords(page.installedAt) : null]
    .filter(Boolean).join(', ')
  const editors = `Administrators and Library maintainers${page.maintainers.length ? ` (${page.maintainers.join(', ')})` : ''}`
  const rows: Array<[string, string | null]> = [
    ['Came from', made],
    ['Identity', page.identity],
    ['In use', page.version],
    ['Who can edit', editors],
    ['Signed', page.signedBy],
    ['Used', page.lastUsed ? lastUsedWords(page.lastUsed) : 'Not used yet that HQ has seen'],
  ]
  return (
    <Modal open onClose={onClose} title={`About ${page.title}`} maxWidth="max-w-2xl">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto" data-testid="asset-about">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-body">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="contents"><dt className="text-text-muted">{k}</dt><dd className="min-w-0 break-words text-text-primary">{v}</dd></div>
          ))}
        </dl>
        <p className="text-micro text-text-muted" data-testid="asset-who">
          {editors} edit, publish, accept an update and return to an earlier version. Choosing which agents use it, and removing it, stay with administrators.
          {' '}<Link to={LIBRARY_SETTINGS_PATH} className="text-accent hover:underline">Settings › Library and skills</Link>
        </p>
        <p className="text-micro text-text-muted">The signer is shown exactly as the check proved it. A signature says who published it, never that it is safe.</p>
        {page.original && <OriginalSection page={page} onChanged={onChanged} />}
        <CopiesSection page={page} onChanged={onChanged} />
        {!page.builtIn && <CreditSection page={page} />}
      </div>
    </Modal>
  )
}
