/**
 * A conversation's files (spec part 3, *Chips in conversations*, *Images in agents' replies*): paths in its messages
 * are read in its own place's folder, as its agent sees it, and a chip opens its file in the file viewer over the main
 * area, the conversation staying beside it with "‹ Conversation" back (the file viewer's rules 1 and 2).
 */
import { createContext, useContext } from 'react'
import type { SiteFileRef, StorageOwnerRef } from '@agenthix/core'
import type { MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import type { OpenedTaskFile } from '../../shared/components/markdownEmbed/taskChipTypes'
import type { ViewerTarget } from '../../storage/pages/viewer/viewerAddress'
import { projectPathOfTask } from '../../storage/pages/viewer/viewerFileParts'

const FROM_CONVERSATION = { kind: 'conversation' } as const

/** What the viewer opens for a chip's file: the file of the conversation's place, at `placePath`. Knowledge has no chip. */
export function conversationFileTarget(ref: SiteFileRef, placePath: string): ViewerTarget | null {
  if (ref.space === 'knowledge') return null
  return { kind: 'file', ref, placePath, from: FROM_CONVERSATION }
}

/** What the viewer opens for a task chip's file: its working file in its folder, or its attachment. */
export function conversationTaskFileTarget(opened: OpenedTaskFile): ViewerTarget | null {
  if (opened.file.kind === 'attachment') {
    return { kind: 'attachment', taskId: opened.taskId, taskKey: opened.taskKey, id: opened.file.id, from: FROM_CONVERSATION }
  }
  if (!opened.loc) return null
  return {
    kind: 'file', ref: { space: 'place', loc: opened.loc, path: opened.file.path },
    placePath: projectPathOfTask(opened.taskKey), taskKey: opened.taskKey, from: FROM_CONVERSATION,
  }
}

export type ConversationFiles = {
  owner: StorageOwnerRef
  /** The place's address, for stable links: `/projects/AGX`, `/chat`. */
  placePath: string
  onOpen: (ref: SiteFileRef) => void
  /** Opens a task's working file or attachment in the file viewer, from a task chip. */
  onOpenTaskFile: (file: OpenedTaskFile) => void
}

export const ConversationFilesContext = createContext<ConversationFiles | null>(null)

/** The embed context for words written in the conversation at `writtenAt`; undefined outside a conversation. */
export function useConversationEmbed(writtenAt?: string): MarkdownEmbedContext | undefined {
  const files = useContext(ConversationFilesContext)
  if (!files) return undefined
  return { place: { space: 'owner', owner: files.owner }, folder: '', onOpen: files.onOpen, onOpenTaskFile: files.onOpenTaskFile, placePath: files.placePath, writtenAt }
}
