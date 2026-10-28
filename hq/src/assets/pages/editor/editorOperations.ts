/**
 * The editor's read as a Wasp query (skills spec part 6 *The editor*). Hosted in `editor.wasp.ts`. The editor's writes
 * are the lifecycle's and the place's own actions (save, discard, publish), which check who may.
 */
import { HttpError, prisma } from 'wasp/server'
import { LocationFileError } from '@agenthix/core'
import { asHttp } from '../../operations'
import { LifecycleError } from '../../lifecycle/errors'
import { personActor } from '../../policyActors'
import { SiteUnreachableError } from '../../../storage/workspaceStore'
import { editorViewOf } from './editorView'
import type { EditorTarget, EditorView } from './editorTypes'

type Ctx = { user?: { id: string } | null }

/** The project a place skill belongs to decides the person's role there. */
async function projectOf(placeSkillId: string): Promise<string | undefined> {
  const row = await prisma.placeSkill.findUnique({ where: { id: placeSkillId }, select: { placeType: true, placeId: true } })
  return row?.placeType === 'project' ? row.placeId : undefined
}

export const getEditorView = async (target: EditorTarget, context: Ctx): Promise<EditorView> => {
  if (!context.user) throw new HttpError(401)
  const place = target?.kind === 'place' && typeof target.placeSkillId === 'string'
  const actor = await personActor(context.user.id, prisma, place ? await projectOf(target.placeSkillId) : undefined)
  return asHttp(async () => {
    try {
      return await editorViewOf(prisma, actor, target)
    } catch (err) {
      if (err instanceof LifecycleError) throw new HttpError(err.status, err.message)
      if (err instanceof SiteUnreachableError) throw new HttpError(503, `${err.message} Nothing was changed.`)
      if (err instanceof LocationFileError) throw new HttpError(err.code === 'not_found' ? 404 : 400, `The site couldn't read the skill's files (${err.detail}). Nothing was changed.`)
      throw err
    }
  })
}
