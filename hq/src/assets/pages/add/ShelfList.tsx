import { useState } from 'react'
import { Link } from 'react-router'
import { Modal, Button, NativeSelect } from '@agenthix/ui/primitives'
import { libraryAssetPath } from '../../../library/components/libraryRoutes'
import { SMALL_BUTTON } from '../../components/Section'
import type { ShelfItem } from './shelf'
import { ReadPackage } from './ReadPackage'

/**
 * Agenthix's shelf (board U4): the skills in hq's image, ready to install. *Suited to* is a hint for finding things,
 * never a lock (D14).
 */
export function ShelfList({ items, suitedTo, onInstall }: { items: ShelfItem[]; suitedTo: string[]; onInstall: (item: ShelfItem) => void }) {
  const [suited, setSuited] = useState('')
  const [viewing, setViewing] = useState<ShelfItem | null>(null)
  const shown = suited ? items.filter(i => i.suitedTo.includes(suited)) : items
  return (
    <div className="space-y-3" data-testid="shelf">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-chip px-3 py-1 text-small font-medium text-text-primary">Skills {items.length}</span>
        <label className="ml-auto flex items-center gap-2 text-small text-text-secondary">Suited to
          <NativeSelect size="sm" value={suited} onChange={e => setSuited(e.target.value)}>
            <option value="">all</option>
            {suitedTo.map(s => <option key={s} value={s}>{s}</option>)}
          </NativeSelect>
        </label>
      </div>
      {shown.length === 0 && <p className="text-body text-text-muted">Nothing on the shelf is suited to that.</p>}
      <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-1">
        {shown.map(i => (
          <li key={i.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-testid="shelf-item">
            <div className="min-w-0 flex-1 basis-64">
              <p className="truncate"><span className="text-body font-medium text-text-primary">{i.title}</span><span className="ml-2 text-small text-text-muted">{i.identity} · {i.version}</span></p>
              <p className="text-small text-text-secondary">{i.description}{i.suitedTo.length > 0 ? ` · suited to ${i.suitedTo.join(', ')}` : ''}</p>
              {i.have && <p className="text-small text-text-muted">{i.have.newer ? `You have ${i.have.version}` : `Installed ${i.have.version}`}</p>}
            </div>
            <button type="button" className={SMALL_BUTTON} onClick={() => setViewing(i)}>View</button>
            {i.have && !i.have.newer
              ? <Link to={libraryAssetPath(i.have.assetId)} className={SMALL_BUTTON}>Open</Link>
              : <button type="button" className={SMALL_BUTTON} onClick={() => onInstall(i)}>{i.have ? `Get ${i.version}` : 'Add'}</button>}
          </li>
        ))}
      </ul>
      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.title} maxWidth="max-w-2xl">
          <ReadPackage source={{ from: 'shelf', name: viewing.name }} />
          <div className="mt-3 flex justify-end"><Button variant="secondary" onClick={() => setViewing(null)}>Close</Button></div>
        </Modal>
      )}
    </div>
  )
}
