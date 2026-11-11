import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { Modal, FOCUS_RING_INSET, ROW_ITEM } from '@agenthix/ui/primitives'
import { MoreMenu, type MenuItem } from '../../../../org/components/menus'
import { SMALL_BUTTON } from '../../../components/Section'
import { libraryEditPath } from '../assetPaths'
import type { AssetPageView } from '../pageTypes'
import type { VersionRow } from './SkillVersionMenu'
import { AgentStack } from '../../../components/AgentStack'
import { UsedByMenu, useUsedBy } from './UsedBy'
import { baseName } from '../../../../shared/fileView/pathTree'
import { fileSize } from './fileDetails'
import { BACK_TO_IN_USE, DOWNLOAD_FILE_HINT, DOWNLOAD_SKILL, DOWNLOAD_SKILL_ADMINS_ONLY, DOWNLOAD_SKILL_HINT, RETURN_TO_VERSION } from './skillWords'

type Props = {
  page: AssetPageView
  older: VersionRow | null
  narrow: boolean
  versionMenu: ReactNode
  onAbout: () => void
  onCopy: () => void
  onRemove: () => void
  onReturn: () => void
  /** The file shown in the tree; null while none is open. */
  file: { path: string; bytes: Uint8Array } | null
  onDownloadFile: () => void
  onDownloadSkill: () => void
  onBack: () => void
}

/** The ⋯ menu's downloads, on every skill and built-ins too: the file shown, then the whole skill (administrators). */
function downloads({ page, older, file, onDownloadFile, onDownloadSkill }: Pick<Props, 'page' | 'older' | 'file' | 'onDownloadFile' | 'onDownloadSkill'>): MenuItem[] {
  const one: MenuItem = file
    ? { label: `Download ${baseName(file.path)}`, hint: DOWNLOAD_FILE_HINT(fileSize(file.bytes)), onSelect: onDownloadFile }
    : { label: 'Download the file shown', hint: 'No file is open', disabled: true, onSelect: onDownloadFile }
  // The package is the version in use, so an older version's page offers its file alone.
  if (older) return [one]
  const may = page.can.grant
  return [one, { label: DOWNLOAD_SKILL, hint: DOWNLOAD_SKILL_HINT, disabled: !may, title: may ? undefined : DOWNLOAD_SKILL_ADMINS_ONLY, onSelect: onDownloadSkill }]
}

function EditButton({ page, onCopy }: { page: AssetPageView; onCopy: () => void }) {
  if (!page.can.edit) return null
  return page.own
    ? <Link to={libraryEditPath(page.assetId)} className={SMALL_BUTTON}>Edit</Link>
    : <button type="button" className={SMALL_BUTTON} onClick={onCopy}>Edit</button>
}

/** On a phone: who uses it (the stack and words, a built-in's too) as the first row under the title, opening the list on its own (board *On a phone*). */
function UsedByRow({ page }: { page: AssetPageView }) {
  const { stack, words, panel, dialog } = useUsedBy(page)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="used-by" aria-label={words}
        className={`flex min-h-11 w-full shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-1 px-4 text-left text-body ${ROW_ITEM} ${FOCUS_RING_INSET}`}>
        <AgentStack {...stack} /><span className="flex-1">{words}</span><ChevronRight size={16} aria-hidden className="text-text-muted" />
      </button>
      {open && <Modal open onClose={() => setOpen(false)} title="Who uses it">{panel}</Modal>}
      {dialog}
    </>
  )
}

/**
 * The skill's one header line (board *A skill's page*): its name and version, then who uses it, About, Edit and ⋯; on
 * an older version, *Back to the version in use* and *Return to this version…* instead. ⋯ holds the downloads (the file
 * shown, the whole skill) and, where it applies, Remove…. On a phone, ⋮ holds About, the downloads and Edit, and who uses
 * it is the row below.
 */
export function SkillHeader(props: Props) {
  const { page, older, narrow, versionMenu, onAbout, onCopy, onRemove, onReturn, onBack } = props
  const navigate = useNavigate()
  const remove: MenuItem[] = page.builtIn ? [] : [{ label: 'Remove…', hint: 'Takes it out of the Library', danger: true, disabled: !page.can.remove, onSelect: onRemove }]
  const title = <h1 className="min-w-0 truncate text-h2 font-medium text-text-primary">{page.title}</h1>

  if (narrow) {
    const items: MenuItem[] = [
      { label: 'About', onSelect: onAbout },
      ...downloads(props),
      ...(page.can.edit ? [{ label: 'Edit', onSelect: () => (page.own ? navigate(libraryEditPath(page.assetId)) : onCopy()) }] : []),
      ...remove.map(r => ({ ...r, separatorBefore: true })),
    ]
    return (
      <>
        <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle bg-surface-1 px-3 py-2">
          {title}
          {versionMenu}
          <span className="flex-1" />
          <MoreMenu items={items} label={`More about ${page.title}`} />
        </div>
        {!older && <UsedByRow page={page} />}
      </>
    )
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border-subtle bg-surface-1 px-4 py-2.5 lg:px-6">
      {title}
      {versionMenu}
      <span className="flex-1" />
      {older ? (
        <>
          <button type="button" className={SMALL_BUTTON} onClick={onBack}>{BACK_TO_IN_USE}</button>
          {page.can.update && <button type="button" className={SMALL_BUTTON} onClick={onReturn}>{RETURN_TO_VERSION}…</button>}
          <button type="button" className={SMALL_BUTTON} onClick={onAbout}>About</button>
          <MoreMenu items={downloads(props)} label={`More about ${page.title}`} />
        </>
      ) : (
        <>
          <UsedByMenu page={page} />
          <button type="button" className={SMALL_BUTTON} onClick={onAbout}>About</button>
          <EditButton page={page} onCopy={onCopy} />
          <MoreMenu items={[...downloads(props), ...remove.map(r => ({ ...r, separatorBefore: true }))]} label={`More about ${page.title}`} />
        </>
      )}
    </div>
  )
}
