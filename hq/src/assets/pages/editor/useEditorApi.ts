import { useMemo } from 'react'
import {
  useAction, saveAssetDraft, discardAssetDraft, publishAssetDraft, savePlaceSkillDraft, discardPlaceSkillDraft, publishPlaceSkillDraft,
} from 'wasp/client/operations'
import type { EditorTarget } from './editorTypes'

export type Bump = 'patch' | 'minor' | 'major'
export type SaveFile = { path: string; text?: string; base64?: string }

/** The editor's writes for either kind of skill: the same three things, to the Library's actions or a place's. */
export interface EditorApi {
  /** `revision` is the draft revision this editor loaded (null: it loaded what is in use), so a stale save is refused. */
  save: (files: SaveFile[], revision: number | null) => Promise<{ revision: number }>
  discard: (revision: number) => Promise<unknown>
  publish: (input: { revision: number; note: string; bump?: Bump }) => Promise<{ version: string }>
}

export function useEditorApi(target: EditorTarget): EditorApi {
  const saveLibrary = useAction(saveAssetDraft)
  const discardLibrary = useAction(discardAssetDraft)
  const publishLibrary = useAction(publishAssetDraft)
  const savePlace = useAction(savePlaceSkillDraft)
  const discardPlace = useAction(discardPlaceSkillDraft)
  const publishPlace = useAction(publishPlaceSkillDraft)
  const key = target.kind === 'library' ? `l:${target.assetId}` : `p:${target.placeSkillId}`
  return useMemo<EditorApi>(() => {
    if (target.kind === 'library') {
      const { assetId } = target
      return {
        save: (files, revision) => saveLibrary({ assetId, files, revision }),
        discard: revision => discardLibrary({ assetId, revision }),
        publish: async ({ revision, note, bump }) => {
          const done = await publishLibrary({ assetId, revision, note, bump })
          return { version: done.version }
        },
      }
    }
    const { placeSkillId } = target
    return {
      save: (files, revision) => savePlace({ placeSkillId, files, revision }),
      discard: revision => discardPlace({ placeSkillId, revision }),
      publish: async ({ revision, note }) => {
        const done = await publishPlace({ placeSkillId, revision, note })
        return { version: String(done.number) }
      },
    }
    // The actions are stable per render of the page; the target is what changes the functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
