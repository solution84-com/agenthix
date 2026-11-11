import { useQuery, getAssetVersions } from 'wasp/client/operations'
import { Dropdown } from '../../../../workspaceView/components/Dropdown'
import { versionCrumb, versionLine } from './skillWords'
import { ROW_CHOSEN, ROW_ITEM, FOCUS_RING_INSET } from '@agenthix/ui/primitives'

export type VersionRow = {
  id: string
  version: string
  inUse: boolean
  newer: boolean
  withdrawn: string | null
  source: string
  note: string | null
  byId: string | null
  createdAt: string | Date
}

export function useSkillVersions(assetId: string, enabled = true): { rows: VersionRow[]; error: string | null; refetch: () => unknown } {
  const { data, error, refetch } = useQuery(getAssetVersions, { assetId }, { enabled })
  return { rows: (data?.versions ?? []) as VersionRow[], error: error ? error.message : null, refetch }
}

/**
 * A skill's versions, from the breadcrumb's last part (board *A skill's page* 5), as main's are in the workspace view:
 * newest first, the one in use said so, each with who published it, when, and its note. The editor puts its draft at
 * the top. Choosing the one in use goes back to it; *Install another version…* is at the foot for who may.
 */
export function SkillVersionMenu({ rows, chosen, draft = false, names, onChoose, onDraft, onInstallAnother }: {
  rows: readonly VersionRow[]
  /** The version in view; null for the one in use (or the draft, in the editor). */
  chosen: string | null
  /** The editor's menu: *draft* is what is in view. */
  draft?: boolean
  names: Record<string, string>
  onChoose: (versionId: string | null) => void
  onDraft?: () => void
  onInstallAnother?: () => void
}) {
  const inUse = rows.find(r => r.inUse) ?? null
  const shown = draft ? null : rows.find(r => r.id === chosen) ?? inUse
  const label = draft ? 'draft' : shown ? versionCrumb(shown.version, shown.inUse) : 'versions'
  const item = (on: boolean) => `block w-full rounded-lg px-2 py-1.5 text-left text-small ${on ? ROW_CHOSEN : ROW_ITEM}`
  return (
    <Dropdown label={`Version: ${label}`} highlight={draft || (shown !== null && !shown.inUse)} width="w-[24rem]"
      button={<span className="truncate font-medium" data-testid="version-crumb">{label}</span>}>
      {close => (
        <div data-testid="skill-versions">
          <ul aria-label="Versions" className="max-h-80 space-y-0.5 overflow-y-auto">
            {draft && (
              <li><button type="button" aria-current="true" className={item(true)} onClick={() => { close(); onDraft?.() }}>
                <span className="font-medium text-text-primary">Draft</span>
                <span className="block text-micro text-text-muted">What you are editing; agents get it when it is published</span>
              </button></li>
            )}
            {rows.map(v => {
              const on = !draft && shown?.id === v.id
              return (
                <li key={v.id}>
                  <button type="button" aria-current={on ? 'true' : undefined} className={item(on)} data-testid="skill-version"
                    onClick={() => { close(); onChoose(v.inUse ? null : v.id) }}>
                    <span className="font-mono font-medium text-text-primary">{v.version}</span>
                    {v.inUse && <span className="text-micro text-success"> · in use</span>}
                    {v.withdrawn && <span className="text-micro text-warning"> · withdrawn</span>}
                    <span className="block text-micro text-text-muted">{versionLine({ ...v, by: v.byId ? names[v.byId] ?? null : null })}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {onInstallAnother && (
            <button type="button" onClick={() => { close(); onInstallAnother() }} className={`mt-1 w-full rounded-lg px-2 py-1.5 text-left text-small ${ROW_ITEM} ${FOCUS_RING_INSET}`}>
              Install another version…
            </button>
          )}
        </div>
      )}
    </Dropdown>
  )
}
