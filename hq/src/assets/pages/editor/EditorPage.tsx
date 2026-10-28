import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAction, useQuery, getEditorView, editLibraryAsset } from 'wasp/client/operations'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { LIBRARY_PATH, libraryAssetPath } from '../../../library/components/libraryRoutes'
import { assetEditPath, placeSkillEditPath } from './editorRoutes'
import { SkillEditor } from './SkillEditor'
import type { EditorTarget } from './editorTypes'
import { useEditorApi } from './useEditorApi'
import { retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'

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
  const { data: view, error, refetch } = useEditorTarget(target)
  const api = useEditorApi(target)
  const copy = useAction(editLibraryAsset)
  const where = view?.where ?? 'Library'
  const crumbs = target.kind === 'library'
    ? [{ label: 'Library', href: LIBRARY_PATH }, { label: view?.name ?? 'Skill', href: libraryAssetPath(target.assetId) }, { label: 'Edit' }]
    : [{ label: where }, { label: view?.name ?? 'Skill' }, { label: 'Edit' }]
  return (
    <AppLayout breadcrumbs={crumbs}>
        {error ? (
          <p role="alert" className="mx-auto max-w-3xl px-4 py-8 text-body text-text-secondary">{error.message}</p>
        ) : !view ? (
          <p className="px-4 py-8 text-center text-body text-text-muted">Loading…</p>
        ) : (
          <SkillEditor
            key={view.identity}
            view={view} api={api} reload={() => refetch()}
            onDiscarded={() => navigate(LIBRARY_PATH)}
            onMakeCopy={target.kind === 'library' ? async () => {
              try {
                const made = await copy({ assetId: target.assetId })
                navigate(assetEditPath(made.assetId))
              } catch (err) {
                window.alert(err instanceof Error ? err.message : 'The copy could not be made. Nothing was changed.')
              }
            } : undefined}
          />
        )}
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
