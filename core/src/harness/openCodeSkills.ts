/**
 * Where a conversation's skills are staged for OpenCode (spec §7, adr-0084),
 * as the container sees them.
 *
 * The site stages each turn's skills into one folder per conversation, inside
 * the runner's Claude home's staging folder, which the container binds
 * read-only (`<Claude home>/.tmp`). Agenthix's OpenCode plugin finds the
 * folder from the conversation id the turn call gives it: its `skill` tool
 * reads only that folder, and its `shell.env` hook lets the conversation's
 * commands read it (`SITE_COMMAND_READABLE`). One skill per folder, named
 * as the skill is (`<source>-<slug>`), holding its `SKILL.md`.
 */
import { isTaggableConversationId } from './processTag.js'

/** The run-visible Claude home's staging folder in the agent container. */
export const OPENCODE_STAGING_CONTAINER_DIR = '/home/appuser/.claude/.tmp'

/** The folder a conversation's staged files go in, relative to the staging folder. */
export function conversationStagingDirName(conversationId: string): string | null {
  return isTaggableConversationId(conversationId) ? `conversation-${conversationId}` : null
}

/** The skills folder inside a conversation's staging folder. */
export const OPENCODE_SKILLS_DIRNAME = 'skills'

/** A conversation's staged skills folder in the container, or null for an id that is not one plain name. */
export function openCodeSkillsContainerDir(conversationId: string): string | null {
  const dir = conversationStagingDirName(conversationId)
  return dir ? `${OPENCODE_STAGING_CONTAINER_DIR}/${dir}/${OPENCODE_SKILLS_DIRNAME}` : null
}
