import { HttpError } from 'wasp/server'
import type { LocationRef, SharedFile, ShareConversationFileArgs } from '@agenthix/core'
import { requireConversationSpeaker } from '../readingRule'
import { ownPlace, placesConversation } from '../places'
import { assertLocationAccess } from '../../storage/locationAccess'
import { shareConversationFileWith, type ShareFileDeps } from './shareFile'
import { shareFileOnSite } from './onSite'

type Ctx = { user?: { id: string } | null }

/** The conversation's own place's files, as the agent sees them: no workspace, no task. */
async function placeFor(conversationId: unknown, userId: string): Promise<LocationRef> {
  const ref = await requireConversationSpeaker(conversationId as string, userId)
  const conversation = await placesConversation(ref.id)
  const place = conversation && await ownPlace(conversation)
  if (!place) throw new HttpError(404, "This conversation's place is gone, so nothing can be added to it. Nothing was changed.")
  return { ownerType: place.type === 'user' ? 'user' : 'project', ownerId: place.id, workspaceId: null, taskId: null }
}

const deps: ShareFileDeps = {
  placeFor,
  mayWork: (loc, userId) => assertLocationAccess(loc, userId, 'work'),
  write: shareFileOnSite,
}

export const shareConversationFile = async (args: ShareConversationFileArgs, context: Ctx): Promise<SharedFile> => {
  if (!context.user) throw new HttpError(401)
  return shareConversationFileWith(args, context.user.id, deps)
}
