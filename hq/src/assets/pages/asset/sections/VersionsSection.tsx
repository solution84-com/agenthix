import { useState } from 'react'
import { useQuery, getAssetVersions } from 'wasp/client/operations'
import { AssetFiles } from '../../../components/AssetFiles'
import { Section, SMALL_BUTTON } from '../../../components/Section'
import { MoveDialog, type MoveTarget } from '../dialogs/MoveDialog'
import { OnPurposeDialog } from '../dialogs/OnPurposeDialog'
import type { AssetPageView } from '../pageTypes'
import { RETURN_TO_VERSION } from '../skill/skillWords'
import { ReadFailure } from '@agenthix/ui/attention'

const day = (at: string | Date) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const SOURCE: Record<string, string> = { BUILT_IN: 'from Agenthix', UPLOAD: 'uploaded', URL: 'from a link', MADE_HERE: 'saved here' }

/**
 * *Versions* (V1–V3, V6): each published or installed version, who and when, with a note. *Return to this version* makes an
 * earlier version the one in use after a confirmation, and records who did it; a newer one is an update. Every
 * version's content is kept while it is in the history, so any of them can be viewed.
 */
export function VersionsSection({ page, onChanged }: { page: AssetPageView; onChanged: (message: string) => void }) {
  const { data, error, refetch } = useQuery(getAssetVersions, { assetId: page.assetId })
  const [viewing, setViewing] = useState<string | null>(null)
  const [moving, setMoving] = useState<{ mode: 'update' | 'rollBack'; target: MoveTarget } | null>(null)
  const [onPurpose, setOnPurpose] = useState(false)
  const rows = data?.versions ?? []
  const who = (id: string | null) => (id ? page.names[id] ?? null : null)

  return (
    <Section title="Versions" count={rows.length} testId="asset-versions"
      aside={page.can.update && !page.builtIn && page.kind === 'skill' ? <button type="button" className={SMALL_BUTTON} onClick={() => setOnPurpose(true)}>Install another version…</button> : undefined}>
      {error && <ReadFailure what="The versions" retry={() => void refetch()} />}
      <ul className="space-y-2">
        {rows.map(v => {
          const by = who(v.byId)
          return (
            <li key={v.id} className="rounded-lg border border-border-subtle px-3 py-2" data-testid="asset-version">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-body font-medium text-text-primary">Version {v.version}</span>
                {v.inUse && <span className="rounded-full bg-chip px-2 py-0.5 text-micro font-medium text-text-primary">In use</span>}
                {!v.inUse && v.newer && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-text-secondary">Newer</span>}
                {v.withdrawn && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-warning">Withdrawn</span>}
                <span className="text-small text-text-muted">{SOURCE[v.source] ?? v.source}{by ? ` by ${by}` : ''}, {day(v.createdAt)}</span>
                <span className="ml-auto flex gap-2">
                  <button type="button" className={SMALL_BUTTON} aria-expanded={viewing === v.id} onClick={() => setViewing(viewing === v.id ? null : v.id)}>View</button>
                  {page.can.update && !v.inUse && (
                    <button type="button" className={SMALL_BUTTON} onClick={() => setMoving({ mode: v.newer ? 'update' : 'rollBack', target: { id: v.id, version: v.version, withdrawn: v.withdrawn } })}>
                      {v.newer ? 'Update to this' : `${RETURN_TO_VERSION}…`}
                    </button>
                  )}
                </span>
              </div>
              {v.note && <p className="mt-1 text-small text-text-secondary">“{v.note}”</p>}
              {v.withdrawn && <p className="mt-1 text-small text-warning">The publisher withdrew it: {v.withdrawn}</p>}
              {viewing === v.id && <div className="mt-3"><AssetFiles assetId={page.assetId} versionId={v.id} /></div>}
            </li>
          )
        })}
      </ul>
      {data && data.history.length > 0 && (
        <details className="mt-3 text-small text-text-secondary">
          <summary className="cursor-pointer">Which version was in use, and when</summary>
          <ul className="mt-2 space-y-1">
            {data.history.map((h, i) => (
              <li key={i}>{day(h.at)}: {h.fromVersion ? `${h.fromVersion} → ` : ''}{h.toVersion}{who(h.byId) ? `, ${who(h.byId)}` : ''}{h.reason ? ` · ${h.reason}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
      {moving && (
        <MoveDialog mode={moving.mode} assetId={page.assetId} title={page.title} inUse={page.version ?? ''} target={moving.target}
          onClose={() => setMoving(null)} onDone={m => { setMoving(null); void refetch(); onChanged(m) }} />
      )}
      {onPurpose && <OnPurposeDialog page={page} onClose={() => setOnPurpose(false)} onDone={m => { setOnPurpose(false); void refetch(); onChanged(m) }} />}
    </Section>
  )
}
