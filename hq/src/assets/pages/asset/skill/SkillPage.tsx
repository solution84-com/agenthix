import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { baseName } from '../../../../shared/fileView/pathTree'
import { Modal } from '@agenthix/ui/primitives'
import { AppLayout } from '../../../../shared/layouts/AppLayout'
import { useViewSize } from '../../../../workspaceView/hooks/useViewSize'
import { useLibraryTransfer } from '../../../../library/components/useLibraryTransfer'
import { LIBRARY_PATH } from '../../../../library/components/libraryRoutes'
import { useAttention } from '../../../../shared/components/AttentionDialog'
import { SMALL_BUTTON } from '../../../components/Section'
import { libraryEditPath, skillVersionPath } from '../assetPaths'
import { EditCopyDialog } from '../dialogs/EditCopyDialog'
import { MoveDialog } from '../dialogs/MoveDialog'
import { OnPurposeDialog } from '../dialogs/OnPurposeDialog'
import { RemoveDialog } from '../dialogs/RemoveDialog'
import { UpdateCard } from '../sections/UpdateCard'
import type { AssetPageView } from '../pageTypes'
import { SkillAbout } from './SkillAbout'
import { SkillBands } from './SkillBands'
import { SkillFiles } from './SkillFiles'
import { SkillHeader } from './SkillHeader'
import { SkillVersionMenu, useSkillVersions } from './SkillVersionMenu'
import { saveFile } from './saveFile'

/**
 * A skill's page (board *A skill's page*): its files filling the window, as a workspace's do in the workspace view,
 * and one header line above them with the version, who uses it, About, Edit and ⋯. `?version=` shows an older
 * version, read-only, its changes marked, with *Return to this version…* and *Back to the version in use*.
 */
export function SkillPage({ page, onChanged }: { page: AssetPageView; onChanged: (message: string) => void }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const size = useViewSize()
  const narrow = size === 'phone'
  const transfer = useLibraryTransfer()
  const versions = useSkillVersions(page.assetId)
  const attention = useAttention()
  const [file, setFile] = useState<{ path: string; bytes: Uint8Array } | null>(null)
  const [dialog, setDialog] = useState<'about' | 'copy' | 'remove' | 'return' | 'install' | 'update' | null>(null)
  const asked = params.get('version')
  const older = asked ? versions.rows.find(v => v.id === asked && !v.inUse) ?? null : null
  const viewing = older?.version ?? page.version ?? ''
  const close = () => setDialog(null)
  const done = (message: string) => { close(); void versions.refetch(); onChanged(message); navigate(skillVersionPath(page.assetId, null)) }
  const showAttention = attention.show
  useEffect(() => {
    if (versions.error) showAttention({ title: 'The versions could not be loaded', text: versions.error, retry: () => void versions.refetch() })
  }, [versions.error]) // eslint-disable-line react-hooks/exhaustive-deps

  const versionMenu = (
    <SkillVersionMenu rows={versions.rows} chosen={older?.id ?? null} names={page.names}
      onChoose={id => navigate(skillVersionPath(page.assetId, id))}
      onInstallAnother={page.can.update && !page.builtIn ? () => setDialog('install') : undefined} />
  )

  return (
    <AppLayout breadcrumbs={[{ label: 'Library', href: LIBRARY_PATH }, { label: 'Skills', href: `${LIBRARY_PATH}?type=skill` }, { label: page.title }]}>
      <div className="flex h-full min-h-0 flex-col" data-testid="asset-page">
        <SkillHeader page={page} older={older} narrow={narrow} versionMenu={versionMenu}
          onAbout={() => setDialog('about')} onCopy={() => setDialog('copy')} onRemove={() => setDialog('remove')}
          onReturn={() => setDialog('return')} file={file}
          onDownloadFile={() => file && saveFile(baseName(file.path), file.bytes)} onDownloadSkill={() => void transfer.exportOne('skill', page.assetId)}
          onBack={() => navigate(skillVersionPath(page.assetId, null))} />
        <SkillBands page={page} older={older} onChanged={onChanged} onUpdate={() => setDialog('update')} />
        <SkillFiles key={older?.id ?? 'in-use'} assetId={page.assetId} versionId={older?.id ?? null} version={viewing} narrow={narrow} onShown={setFile} />
        {narrow && older && page.can.update && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border-subtle bg-surface-1 px-3 py-2">
            <button type="button" className={SMALL_BUTTON} onClick={() => navigate(skillVersionPath(page.assetId, null))}>Back</button>
            <button type="button" className={SMALL_BUTTON} onClick={() => setDialog('return')}>Return to {older.version}…</button>
          </div>
        )}
        {page.draftBy && !older && (
          <p className="shrink-0 border-t border-border-subtle bg-surface-1 px-4 py-1.5 text-small text-text-secondary lg:px-6">
            {page.draftBy} has a draft. <Link to={libraryEditPath(page.assetId)} className="text-accent hover:underline">Open it</Link>
          </p>
        )}
      </div>
      {transfer.dialog}
      {attention.dialog}
      {dialog === 'about' && <SkillAbout page={page} onClose={close} onChanged={m => { close(); onChanged(m) }} />}
      {dialog === 'copy' && <EditCopyDialog assetId={page.assetId} title={page.title} identity={page.identity} version={page.version ?? ''} signer={page.signedBy} publisherName={page.orgPublisher} onClose={close} />}
      {dialog === 'remove' && <RemoveDialog assetId={page.assetId} title={page.title} template={false} onClose={close} onRemoved={() => navigate(LIBRARY_PATH)} />}
      {dialog === 'install' && <OnPurposeDialog page={page} onClose={close} onDone={done} />}
      {dialog === 'return' && older && (
        <MoveDialog mode={older.newer ? 'update' : 'rollBack'} assetId={page.assetId} title={page.title} inUse={page.version ?? ''}
          target={{ id: older.id, version: older.version, withdrawn: older.withdrawn }} onClose={close} onDone={done} />
      )}
      {dialog === 'update' && page.update && (
        <Modal open onClose={close} title={`${page.update.version} is out`} maxWidth="max-w-3xl">
          <div className="max-h-[70vh] overflow-y-auto"><UpdateCard page={page} onChanged={m => { close(); onChanged(m) }} /></div>
        </Modal>
      )}
    </AppLayout>
  )
}
