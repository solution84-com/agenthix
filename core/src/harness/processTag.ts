/**
 * The tag every process a conversation starts carries (adr-0083, spec §3).
 *
 * `SITE_SESSION=<conversation id>` in the process's environment, where the
 * id is the conversation's own (`AgentSession.id`), whichever runtime serves
 * it. Everything the process starts inherits it, so the site can find and end
 * a conversation's processes, and only those, by an exact match over every
 * process's environment in the container. A Claude turn gets it on its
 * `docker exec`; OpenCode's commands get it from Agenthix's plugin
 * (`shell.env`). A harness server shared by several conversations carries none.
 */
export const CONVERSATION_PROCESS_TAG = 'SITE_SESSION'

/**
 * A conversation id is safe to tag with and search for: one plain name, with
 * nothing a shell or a pattern would read as syntax. Ids are uuids or cuids.
 */
export function isTaggableConversationId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id)
}
