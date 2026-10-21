/**
 * One conversation's record read from its site, for the screens that show it
 * (getSession, getTaskSession, getActivitySession): the newest 1000 rows —
 * dropping the oldest history, never the messages just sent — with who sent
 * each message, and the record's own facts (`conversationRecord.ts`). The
 * agent's memory is the site's session's, as its last run left it; a site
 * that cannot say leaves it unknown rather than failing the read.
 */
import * as siteRuntimeStore from './siteRuntimeStore'
import { withAuthorNames } from './transcriptAuthors'
import { withConversationRecord } from './conversationRecord'

export const CONVERSATION_ROWS_READ = 1000

export async function readConversation(siteId: string, sessionId: string, viewerId: string) {
  const [entries, siteSession] = await Promise.all([
    siteRuntimeStore.listTranscript(siteId, sessionId, { tail: true, limit: CONVERSATION_ROWS_READ }),
    siteRuntimeStore.getSession(siteId, sessionId).catch(() => null),
  ])
  return withConversationRecord(await withAuthorNames(entries, viewerId), viewerId, siteSession?.contextUse ?? null)
}
