/**
 * A conversation's files (spec part 3, *Chips in conversations*, *Images in agents' replies*): paths in its messages
 * are read in its own place's folder, as its agent sees it, and a chip opens its file beside the thread.
 */
import { createContext, useContext } from 'react'
import type { SiteFileRef, StorageOwnerRef } from '@agenthix/core'
import type { MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import type { OpenedTaskFile } from '../../shared/components/markdownEmbed/taskChipTypes'

export type ConversationFiles = {
  owner: StorageOwnerRef
  /** The place's address, for stable links: `/projects/AGX`, `/chat`. */
  placePath: string
  onOpen: (ref: SiteFileRef) => void
  /** Opens a task's working file or attachment beside the thread, from a task chip. */
  onOpenTaskFile: (file: OpenedTaskFile) => void
}

export const ConversationFilesContext = createContext<ConversationFiles | null>(null)

/** The embed context for words written in the conversation at `writtenAt`; undefined outside a conversation. */
export function useConversationEmbed(writtenAt?: string): MarkdownEmbedContext | undefined {
  const files = useContext(ConversationFilesContext)
  if (!files) return undefined
  return { place: { space: 'owner', owner: files.owner }, folder: '', onOpen: files.onOpen, onOpenTaskFile: files.onOpenTaskFile, placePath: files.placePath, writtenAt }
}
