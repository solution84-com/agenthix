import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAction, useQuery, getEditorView, editLibraryAsset } from 'wasp/client/operations'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { LIBRARY_PATH, libraryAssetPath } from '../../../library/components/libraryRoutes'
import { SkillVersionMenu, useSkillVersions } from '../asset/skill/SkillVersionMenu'
import { skillVersionPath } from '../asset/assetPaths'
import { assetEditPath, placeSkillEditPath } from './editorRoutes'
import { SkillEditor } from './SkillEditor'
import type { EditorTarget } from './editorTypes'
import { useEditorApi } from './useEditorApi'
import { retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { useAttention } from '../../../shared/components/AttentionDialog'

const POLL_MS = 5000

function useEditorTarget(target: EditorTarget) {
  const query = useQuery(getEditorView, target, { retry: retryUnlessDenied })
  const { refetch } = query
  // An agent's or a colleague's save shows here without a reload (board U3b section 4).
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void refetch() }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [refetch])
  return query
}

function EditorScreen({ target }: { target: EditorTarget }) {
  const navigate = useNavigate()
  const query = useEditorTarget(target)
  const { data: view, refetch } = query
  // The editor polls, so a failed read with the view held changes nothing on screen (the typed work stays) until it is a minute old.
  const read = useBackgroundRead(query, { what: 'The skill', pollMs: POLL_MS })
  const attention = useAttention()
  const api = useEditorApi(target)
  const copy = useAction(editLibraryAsset)
  const where = view?.where ?? 'Library'
  const library = target.kind === 'library' ? target.assetId : null
  const versions = useSkillVersions(library ?? '', library !== null && !!view?.inUse)
  // The breadcrumb is published to the app's frame as data, so the versions menu is drawn beside the skill's name.
  const versionMenu = library && versions.rows.length > 0
    ? <SkillVersionMenu rows={versions.rows} chosen={null} draft names={{}} onChoose={id => navigate(skillVersionPath(library, id))} />
    : <span className="rounded-lg px-1.5 py-1 text-small font-medium text-text-primary" data-testid="version-crumb">draft</span>
  const crumbs = library
    ? [
        { label: 'Library', href: LIBRARY_PATH }, { label: 'Skills', href: `${LIBRARY_PATH}?type=skill` },
        { label: view?.name ?? 'Skill', href: view?.inUse ? libraryAssetPath(library) : undefined }, { label: 'draft' },
      ]
    : [{ label: where }, { label: view?.name ?? 'Skill' }, { label: 'draft' }]
  const makeCopy = async () => {
    if (target.kind !== 'library') return
    try {
      const made = await copy({ assetId: target.assetId })
      navigate(assetEditPath(made.assetId))
    } catch (err) {
      attention.show({ title: 'The copy was not made', text: err instanceof Error ? err.message : 'The copy could not be made. Nothing was changed.', retry: () => void makeCopy() })
    }
  }
  return (
    <AppLayout breadcrumbs={crumbs}>
        {read.failedWithoutData ? (
          read.nudge
        ) : !view ? (
          <p className="px-4 py-8 text-center text-body text-text-muted">Loading…</p>
        ) : (
          <SkillEditor
            key={view.identity}
            view={view} api={api} reload={() => refetch()} versionMenu={versionMenu} readNote={read.nudge ?? versions.nudge}
            onDiscarded={() => navigate(LIBRARY_PATH)}
            onMakeCopy={target.kind === 'library' ? makeCopy : undefined}
          />
        )}
        {attention.dialog}
    </AppLayout>
  )
}

/** `/library/:assetId/edit`: the editor on a Library skill's draft. */
export function EditorPage() {
  const { assetId } = useParams()
  return assetId ? <EditorScreen target={{ kind: 'library', assetId }} /> : null
}

/** `/library/places/:placeSkillId/edit`: the same editor on a skill in a place's files (spec part 4, FV1). */
export function PlaceEditorPage() {
  const { placeSkillId } = useParams()
  return placeSkillId ? <EditorScreen target={{ kind: 'place', placeSkillId }} /> : null
}

export { assetEditPath, placeSkillEditPath }
