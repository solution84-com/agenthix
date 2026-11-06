import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery, getAssetShelf } from 'wasp/client/operations'
import { Input } from '@agenthix/ui/primitives'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { WhichAgentsDialog } from '../../../library/components/WhichAgentsDialog'
import { LIBRARY_PATH, libraryAssetPath } from '../../../library/components/libraryRoutes'
import { PRIMARY_BUTTON, SMALL_BUTTON } from '../../components/Section'
import type { InstallPreview, InstallResult } from '../../install/types'
import { InstallDialog } from './InstallDialog'
import { PackagePicker } from './PackagePicker'
import { ShelfList } from './ShelfList'
import { RemovedTemplates } from './RemovedTemplates'
import { installedWords } from './installWords'
import { NO_UPLOAD, hasUpload, linkReady, uploadFrom, type PackageFrom, type UploadChoice } from './packageSource'
import { messageOf } from '../../components/messageOf'

type From = 'shelf' | 'upload' | 'link'
const isFrom = (v: string | null): v is From => v === 'shelf' || v === 'upload' || v === 'link'

const CHOICES: Array<{ from: From; title: string; hint: string }> = [
  { from: 'shelf', title: 'From Agenthix', hint: 'The skills that ship with this HQ' },
  { from: 'upload', title: 'Upload a package', hint: 'A ZIP or a skill folder, with its signature file if it has one' },
  { from: 'link', title: 'From a link', hint: 'A ZIP on any web server, such as a GitHub release' },
]

/**
 * Add (board *Bringing a skill in*): how an asset comes into the Library. From Agenthix's shelf, an upload, or a link;
 * each goes through the same check and ends in one of four states, told in the dialog. A skill that was installed new
 * ends on *Which agents use it?*. Making one is *New skill*, in the Library's ＋ Add menu.
 */
export function AddPage() {
  const [params, setParams] = useSearchParams()
  const from = params.get('from')
  const { data, error } = useQuery(getAssetShelf)
  const [installing, setInstalling] = useState<PackageFrom | null>(null)
  const [done, setDone] = useState<{ result: InstallResult; preview: InstallPreview } | null>(null)
  const [choosing, setChoosing] = useState<{ assetId: string; title: string } | null>(null)
  const [upload, setUpload] = useState<UploadChoice>(NO_UPLOAD)
  const [link, setLink] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const choose = (next: From | null) => { setDone(null); setProblem(null); setParams(next ? { from: next } : {}, { replace: true }) }
  const checkUpload = async () => {
    setProblem(null)
    try { setInstalling(await uploadFrom(upload)) } catch (err) { setProblem(messageOf(err, 'That file could not be read. Nothing was changed.')) }
  }
  const allowed = (f: From) => (f === 'shelf' ? data?.can.shelf : data?.can.outside)

  return (
    <AppLayout
      breadcrumbs={[{ label: 'Library', href: LIBRARY_PATH }, { label: 'Add' }]}
      title="Add"
      subtitle="Every package is checked when it comes in: who signed it, and whether it was changed on the way."
    >
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 lg:px-8">
        {error && <p role="alert" className="text-body text-danger">{error.message}</p>}
        {done && (
          <p role="status" className="rounded-lg border border-border-subtle bg-surface-1 px-4 py-3 text-body text-text-primary" data-testid="installed-notice">
            Installed. {installedWords(done.preview.title, done.preview.version, done.result.outcome)}{' '}
            {done.result.assetId && <Link to={libraryAssetPath(done.result.assetId)} className="font-medium text-accent hover:underline">Open it</Link>}
          </p>
        )}
        {!data ? <p className="text-body text-text-muted">Loading…</p> : !data.can.shelf && !data.can.outside ? (
          <p className="text-body text-text-secondary" data-testid="add-not-allowed">Adding to the Library is for administrators and Library maintainers. Ask one of them. Nothing was changed.</p>
        ) : !isFrom(from) || !allowed(from) ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {CHOICES.filter(c => allowed(c.from)).map(c => (
                <button key={c.from} type="button" onClick={() => choose(c.from)} className="block w-full rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 text-left hover:bg-surface-hover" data-testid={`add-${c.from}`}>
                  <span className="text-body font-medium text-text-primary">{c.title}</span>
                  <span className="block text-small text-text-secondary">{c.hint}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button type="button" onClick={() => choose(null)} className="text-small text-text-muted hover:text-text-primary">← Other ways to add</button>
            {from === 'shelf' && <ShelfList items={data.items} suitedTo={data.suitedTo} onInstall={i => setInstalling({ from: 'shelf', name: i.name })} />}
            {from === 'shelf' && <RemovedTemplates items={data.removed} />}
            {from === 'upload' && (
              <div className="space-y-3">
                <PackagePicker value={upload} onChange={setUpload} />
                <button type="button" disabled={!hasUpload(upload)} onClick={() => void checkUpload()} className={PRIMARY_BUTTON}>Check it</button>
              </div>
            )}
            {from === 'link' && (
              <div className="space-y-3">
                <label className="block text-small text-text-secondary">The link to the package (https)
                  <Input value={link} onChange={e => setLink(e.target.value)} placeholder="https://github.com/acme/skills/releases/download/v2.0/seo-audit.zip" className="mt-1" aria-label="Link to the package" />
                </label>
                <p className="text-small text-text-muted">HQ fetches the ZIP and looks for its signature at the same address with .sigstore.json added.</p>
                <button type="button" disabled={!linkReady(link)} onClick={() => setInstalling({ from: 'url', link: link.trim() })} className={PRIMARY_BUTTON}>Check it</button>
              </div>
            )}
            {problem && <p role="alert" className="text-small text-danger">{problem}</p>}
          </div>
        )}
        <p className="text-small text-text-muted"><Link to={LIBRARY_PATH} className={SMALL_BUTTON}>Back to the Library</Link></p>
      </div>
      {installing && (
        <InstallDialog source={installing} onClose={() => setInstalling(null)} onInstalled={(result, preview) => {
          setInstalling(null); setDone({ result, preview }); setUpload(NO_UPLOAD); setLink('')
          if (preview.kind === 'skill' && result.assetId && result.outcome === 'new') setChoosing({ assetId: result.assetId, title: `${preview.title} ${preview.version} is installed` })
        }} />
      )}
      {choosing && <WhichAgentsDialog assetId={choosing.assetId} title={choosing.title} onDone={() => setChoosing(null)} />}
    </AppLayout>
  )
}
